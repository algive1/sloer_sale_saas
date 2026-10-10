"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { fashionEditorConfig } from "@/plugins/theme-builder/config.client";
import { BLANK_TEMPLATE, freshTemplate, type ThemeData } from "@/plugins/theme-builder/template";

type EditorProps = {
	channels: readonly string[];
	locales: readonly string[];
	siteId: string;
	storageReady: boolean;
	initialChannel?: string;
	initialLocale?: string;
	localesByChannel?: Record<string, readonly string[]>;
	siteByChannel?: Record<
		string,
		{ id: string; name: string; domain: string; defaultChannel: string; defaultLocale?: string }
	>;
};
type APIResponse = {
	error?: string;
	draft?: ThemeData | null;
	published?: ThemeData | null;
	draftRevision?: number;
	publishedRevision?: number;
};
const api = "/ops/themes/api";

export function ThemeEditor({
	channels,
	locales,
	siteId,
	storageReady,
	siteByChannel = {},
	initialChannel,
	initialLocale,
	localesByChannel = {},
}: EditorProps) {
	const [channel, setChannel] = useState(initialChannel || channels[0] || "");
	const [locale, setLocale] = useState(initialLocale || locales[0] || "en");
	const [document, setDocument] = useState<ThemeData | null>(null);
	const documentRef = useRef<Data>(BLANK_TEMPLATE);
	const savedRef = useRef<Data>(BLANK_TEMPLATE);
	const revisionRef = useRef(0);
	const savingRef = useRef(false);
	const [generation, setGeneration] = useState(0);
	const [loading, setLoading] = useState(Boolean(channel));
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [status, setStatus] = useState("");
	const [revision, setRevision] = useState({ draft: 0, published: 0 });
	const selectedSite = siteByChannel[channel];
	const brands = Object.values(siteByChannel).filter(
		(site, index, all) => all.findIndex((other) => other.id === site.id) === index,
	);
	const visibleChannels = selectedSite
		? channels.filter((slug) => siteByChannel[slug]?.id === selectedSite.id)
		: channels;
	const visibleLocales = localesByChannel[channel] ?? locales;
	const sitePreview = selectedSite
		? `https://${selectedSite.domain}/${locale}/${channel}`
		: `/${locale}/${channel}`;
	const scope = "?channel=" + encodeURIComponent(channel) + "&locale=" + encodeURIComponent(locale);

	const [loadedScope, setLoadedScope] = useState(scope);
	if (loadedScope !== scope) {
		setLoadedScope(scope);
		setLoading(true);
		setDocument(null);
		setDirty(false);
		setStatus("");
	}

	useEffect(() => {
		if (!channel) return;
		const controller = new AbortController();
		fetch(api + scope, { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const body = (await response.json()) as APIResponse;
				if (!response.ok) throw new Error(body.error || "Load failed");
				return body;
			})
			.then((result) => {
				if (controller.signal.aborted) return;
				const loaded = result.draft || result.published || freshTemplate(brands.length ? "blank" : "fashion");
				documentRef.current = loaded;
				savedRef.current = loaded;
				setDocument(loaded);
				revisionRef.current = result.draftRevision || 0;
				setRevision({ draft: revisionRef.current, published: result.publishedRevision || 0 });
				setGeneration((current) => current + 1);
			})
			.catch((error) => {
				if (controller.signal.aborted) return;
				setStatus(error instanceof Error ? error.message : "Unable to load draft");
				if (!storageReady) {
					const initial = freshTemplate(brands.length ? "blank" : "fashion");
					documentRef.current = initial;
					savedRef.current = initial;
					setDocument(initial);
					setGeneration((current) => current + 1);
				} else {
					// Never substitute a new template for an existing draft when storage is offline.
					// Otherwise a transient GET failure could overwrite a live store on publish.
					setDocument(null);
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [channel, locale, scope, storageReady, brands.length]);

	useEffect(() => {
		if (!dirty) return;
		const preventLeave = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", preventLeave);
		return () => window.removeEventListener("beforeunload", preventLeave);
	}, [dirty]);

	const persist = useCallback(
		async (action: "draft" | "publish", data: Data) => {
			if (!storageReady) throw new Error("Please configure the theme database before saving.");
			if (savingRef.current) return;
			savingRef.current = true;
			setSaving(true);
			try {
				const response = await fetch(api, {
					method: "PUT",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ channel, locale, action, data, expectedRevision: revisionRef.current }),
				});
				const body = (await response.json()) as APIResponse;
				if (!response.ok) throw new Error(body.error || "Save failed");
				revisionRef.current = body.draftRevision ?? revisionRef.current + 1;
				savedRef.current = data;
				setDirty(JSON.stringify(documentRef.current) !== JSON.stringify(data));
				setStatus(
					action === "publish" ? "发布成功，可打开当前品牌网站查看页面。" : "草稿已保存，线上页面未改变。",
				);
				setRevision((prev) => ({
					draft: revisionRef.current,
					published: prev.published + (action === "publish" ? 1 : 0),
				}));
			} catch (error) {
				const message = error instanceof Error ? error.message : "Save failed";
				setStatus(message);
				throw error;
			} finally {
				savingRef.current = false;
				setSaving(false);
			}
		},
		[channel, locale, storageReady],
	);

	function confirmPublish(): boolean {
		return window.confirm(
			`确定发布「${selectedSite?.name ?? "当前店铺"} / ${channel} / ${locale}」的首页吗？发布后会覆盖这个市场和语言的线上首页。`,
		);
	}
	function confirmNavigation(): boolean {
		return !dirty || window.confirm("Unsaved edits will be discarded. Continue?");
	}
	function setTemplate(name: "fashion" | "blank") {
		if (saving || !confirmNavigation()) return;
		const next = freshTemplate(name);
		documentRef.current = next;
		setDocument(next);
		setGeneration((current) => current + 1);
		setDirty(true);
		setStatus(
			name === "fashion"
				? "Fashion template applied to draft. Publish to go live."
				: "Blank draft created. Live site unchanged.",
		);
	}
	function changeScope(kind: "channel" | "locale", value: string) {
		if (saving || (kind === "channel" ? value === channel : value === locale) || !confirmNavigation()) return;
		if (kind === "channel") {
			const allowed = localesByChannel[value] ?? locales;
			if (!allowed.includes(locale)) {
				const preferred = siteByChannel[value]?.defaultLocale;
				setLocale(preferred && allowed.includes(preferred) ? preferred : (allowed[0] ?? "en"));
			}
			setChannel(value);
		} else setLocale(value);
	}
	function changeBrand(id: string) {
		if (saving || id === selectedSite?.id || !confirmNavigation()) return;
		const firstChannel =
			channels.find(
				(slug) => siteByChannel[slug]?.id === id && slug === siteByChannel[slug]?.defaultChannel,
			) ?? channels.find((slug) => siteByChannel[slug]?.id === id);
		if (!firstChannel) return;
		const allowed = localesByChannel[firstChannel] ?? locales;
		const preferred = siteByChannel[firstChannel]?.defaultLocale;
		setLocale(preferred && allowed.includes(preferred) ? preferred : (allowed[0] ?? "en"));
		setChannel(firstChannel);
	}
	return (
		<div>
			<section className="flex flex-wrap items-end gap-3 border-b border-stone-200 bg-white px-5 py-4 md:px-8">
				{brands.length > 0 ? (
					<label className="block text-xs font-medium text-stone-600">
						品牌网站
						<select
							aria-label="选择品牌网站"
							className="mt-1 block min-w-36 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
							value={selectedSite?.id ?? ""}
							disabled={saving}
							onChange={(event) => changeBrand(event.target.value)}
						>
							{brands.map((site) => (
								<option key={site.id} value={site.id}>
									{site.name}
								</option>
							))}
						</select>
					</label>
				) : (
					<label className="block text-xs font-medium text-stone-600">
						当前店铺
						<span className="mt-1 block rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
							{siteId}
						</span>
					</label>
				)}
				<label className="block text-xs font-medium text-stone-600">
					市场 / 销售渠道
					<select
						aria-label="选择市场"
						className="mt-1 block min-w-36 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
						value={channel}
						disabled={saving || visibleChannels.length === 0}
						onChange={(event) => changeScope("channel", event.target.value)}
					>
						{visibleChannels.map((item) => (
							<option key={item} value={item}>
								{item}
							</option>
						))}
					</select>
				</label>
				<label className="block text-xs font-medium text-stone-600">
					语言
					<select
						className="mt-1 block rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
						value={locale}
						disabled={saving}
						onChange={(event) => changeScope("locale", event.target.value)}
					>
						{visibleLocales.map((item) => (
							<option key={item} value={item}>
								{item}
							</option>
						))}
					</select>
				</label>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<button
						disabled={saving || !channel}
						onClick={() => setTemplate("fashion")}
						className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100"
					>
						套用服饰模板
					</button>
					<button
						disabled={saving || !channel}
						onClick={() => setTemplate("blank")}
						className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100"
					>
						空白页面
					</button>
					<button
						disabled={saving || loading || !document || !storageReady}
						onClick={() => {
							void persist("draft", documentRef.current).catch(() => {});
						}}
						className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-900 hover:bg-stone-50 disabled:opacity-40"
					>
						{saving ? "保存中…" : "保存草稿"}
					</button>
					<button
						type="button"
						disabled={saving || loading || !document || !storageReady}
						onClick={() => {
							if (confirmPublish()) void persist("publish", documentRef.current).catch(() => {});
						}}
						className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
					>
						{saving ? "发布中…" : "发布上线"}
					</button>
					<a
						target="_blank"
						rel="noopener noreferrer"
						href={sitePreview}
						className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100"
						title="需要已配置域名、HTTPS 并发布对应市场和语言的页面"
					>
						打开网站 ↗
					</a>
				</div>
			</section>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-2 text-xs text-stone-600 md:px-8">
				<span>
					{storageReady
						? "Drag blocks on the left, edit settings on the right, then Publish."
						: "Preview only: theme storage is not configured."}
				</span>
				<span>
					{dirty ? "● Unsaved edits · " : ""}草稿版本 {revision.draft} · 发布版本 {revision.published}
				</span>
			</div>
			{status && (
				<p
					role="status"
					className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 md:px-8"
				>
					{status}
				</p>
			)}
			{!channel ? (
				<div className="mx-auto max-w-6xl p-12 text-sm text-stone-700">
					没有可装修的销售渠道。请先在 Saleor 中启用该品牌对应的 Channel，并检查站点配置。
				</div>
			) : loading ? (
				<div className="mx-auto max-w-6xl animate-pulse p-12 text-sm text-stone-500">正在载入首页草稿…</div>
			) : !document ? (
				<div className="mx-auto max-w-6xl p-12 text-sm text-stone-700">
					Draft storage could not be loaded. No changes have been made to your live storefront.
					<button type="button" className="ml-4 underline" onClick={() => window.location.reload()}>
						Retry
					</button>
				</div>
			) : (
				<Puck
					key={channel + ":" + locale + ":" + generation}
					config={fashionEditorConfig}
					data={document}
					headerTitle={(selectedSite?.name ?? "店铺") + " · 首页"}
					headerPath={"/" + locale + "/" + channel}
					height="calc(100vh - 215px)"
					viewports={[
						{ width: 1440, height: "auto", label: "Desktop" },
						{ width: 390, height: "auto", label: "Mobile" },
					]}
					onChange={(data) => {
						documentRef.current = data;
						setDirty(JSON.stringify(data) !== JSON.stringify(savedRef.current));
					}}
					onPublish={async (data) => {
						if (confirmPublish()) await persist("publish", data);
					}}
				/>
			)}
		</div>
	);
}
