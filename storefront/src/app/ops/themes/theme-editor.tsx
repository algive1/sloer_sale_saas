"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { createScopedFashionEditorConfig } from "@/plugins/theme-builder/config.client";
import { ThemeAiAssistant } from "@/plugins/theme-builder/ai-assistant.client";
import { BLANK_TEMPLATE, freshTemplate, freshStarterTemplate, type ThemeData } from "@/plugins/theme-builder/template";
import { PRODUCT_DETAIL_TEMPLATE } from "@/plugins/theme-builder/page-document";

type EditorProps = {
	initialPageType?: "home" | "product";
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
const EDITOR_DICTIONARY = {
  "header-publish":"发布上线",
  "header-undo":"撤销",
  "header-redo":"重做",
  "header-toggle-leftsidebar":"切换模块面板",
  "header-toggle-rightsidebar":"切换属性面板",
  "action-duplicate":"复制模块",
  "action-delete":"删除模块",
  "label-page":"页面",
  "outline-header-title":"页面结构",
  "outline-empty":"暂无模块",
  "outline-item-duplicate":"复制模块",
  "outline-item-delete":"删除模块",
  "plugin-blocks":"添加模块",
  "plugin-outline":"页面结构",
  "plugin-fields":"模块设置",
  "plugin-components":"组件",
  "viewport-switch":"切换到{label}预览",
  "drawer-category-other":"其他模块",
} as const;

const homepageApi = "/ops/themes/api";
type Builtin = "fashion"|"jewelry"|"minimal"|"blank"|"product";
type LibraryEntry = {id:string;title:string;updatedAt:string};
type LibraryResult = {items?:LibraryEntry[];data?:ThemeData;item?:LibraryEntry;error?:string};

export function ThemeEditor({
	channels,
	locales,
	siteId,
	storageReady,
	initialPageType = "home",
	siteByChannel = {},
	initialChannel,
	initialLocale,
	localesByChannel = {},
}: EditorProps) {
	const [channel, setChannel] = useState(initialChannel || channels[0] || "");
	const [locale, setLocale] = useState(initialLocale || locales[0] || "en");
	const [pageType, setPageType] = useState<"home"|"product">(initialPageType);
	const editorConfig = useMemo(() => createScopedFashionEditorConfig(channel,pageType), [channel,pageType]);
	const api = pageType==="home"?homepageApi:"/ops/themes/pages/api";
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
	const [preset, setPreset] = useState<Builtin>("fashion");
	const [savedTemplates, setSavedTemplates] = useState<LibraryEntry[]>([]);
	const [libraryScopeLoaded, setLibraryScopeLoaded] = useState("");
	const [chosenTemplate, setChosenTemplate] = useState("");
	const [newTemplateTitle, setNewTemplateTitle] = useState("");
	const [libraryBusy, setLibraryBusy] = useState(false);
	const [aiOpen,setAiOpen] = useState(false);
	const [,setAiSelectionVersion] = useState(0);
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
	const scope = "?channel=" + encodeURIComponent(channel) + "&locale=" + encodeURIComponent(locale) +
		(pageType==="product"?"&pageType=product&template=default":"");
	const pageTitle = pageType==="home"?"首页":"商品详情页";
	const templateScope="/ops/themes/templates/api?"+new URLSearchParams({channel,locale,pageType});
	const visibleTemplates = libraryScopeLoaded===templateScope?savedTemplates:[];
	const scopeRef = useRef(templateScope);
	useEffect(()=>{scopeRef.current=templateScope;},[templateScope]);

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
				const loaded = result.draft || result.published || (pageType==="product" ? structuredClone(PRODUCT_DETAIL_TEMPLATE)
					: freshTemplate(brands.length ? "blank" : "fashion"));
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
					const initial = pageType==="product" ? structuredClone(PRODUCT_DETAIL_TEMPLATE)
						: freshTemplate(brands.length ? "blank" : "fashion");
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
	}, [channel, locale, scope, storageReady, brands.length, api, pageType]);

	useEffect(()=>{
		if(!channel||!storageReady)return;
		const controller=new AbortController();
		fetch(templateScope,{signal:controller.signal,cache:"no-store"})
			.then(async response=>{
				const json=await response.json() as LibraryResult;
				if(!response.ok)throw new Error(json.error??"无法读取模板库");
				return json.items??[];
			}).then(items=>{if(!controller.signal.aborted){
				setSavedTemplates(items);setChosenTemplate("");setLibraryScopeLoaded(templateScope);
			}}).catch(()=>{if(!controller.signal.aborted){setSavedTemplates([]);setLibraryScopeLoaded(templateScope);}});
		return()=>controller.abort();
	},[channel,locale,pageType,storageReady,templateScope]);

	async function saveCurrentAsTemplate(){
		if(!storageReady||loading||!document||libraryBusy)return;
		const title=newTemplateTitle.trim();
		if(title.length<2||title.length>60){setStatus("请输入 2–60 字的模板名称。");return;}
		setLibraryBusy(true);
		try{
			const response=await fetch("/ops/themes/templates/api",{
				method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
				body:JSON.stringify({channel,locale,pageType,title,data:documentRef.current}),
			});
			const result=await response.json() as LibraryResult;
			if(!response.ok||!result.item)throw new Error(result.error??"保存模板失败");
			if(scopeRef.current===templateScope){
				setSavedTemplates(current=>[result.item!,...current]);
				setLibraryScopeLoaded(templateScope);
				setChosenTemplate(result.item.id);
				setNewTemplateTitle("");
				setStatus("已保存为我的模板，不影响现有草稿或线上页面。");
			}
		}catch(error){setStatus(error instanceof Error?error.message:"保存模板失败");}
		finally{setLibraryBusy(false);}
	}
	async function applySavedTemplate(){
		if(!chosenTemplate||saving||libraryBusy||!confirmNavigation())return;
		setLibraryBusy(true);
		try{
			const response=await fetch(templateScope+"&id="+encodeURIComponent(chosenTemplate),{cache:"no-store"});
			const result=await response.json() as LibraryResult;
			if(!response.ok||!result.data)throw new Error(result.error??"模板加载失败");
			if(scopeRef.current!==templateScope)return;
			documentRef.current=result.data;setDocument(result.data);
			setGeneration(v=>v+1);setDirty(true);
			setStatus("已应用模板至当前草稿，发布前不会影响线上页面。");
		}catch(error){setStatus(error instanceof Error?error.message:"模板加载失败");}
		finally{setLibraryBusy(false);}
	}
	async function removeSavedTemplate(){
		if(!chosenTemplate||libraryBusy||!window.confirm("确定删除这个自定义模板吗？当前页面不会改变。"))return;
		setLibraryBusy(true);
		try{
			const response=await fetch(templateScope+"&id="+encodeURIComponent(chosenTemplate),{method:"DELETE",credentials:"same-origin"});
			if(!response.ok)throw new Error("删除模板失败");
			if(scopeRef.current===templateScope){
				setSavedTemplates(items=>items.filter(item=>item.id!==chosenTemplate));
				setChosenTemplate("");setStatus("模板已删除，当前草稿和线上页面不变。");
			}
		}catch(error){setStatus(error instanceof Error?error.message:"删除模板失败");}
		finally{setLibraryBusy(false);}
	}

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
					body: JSON.stringify({ channel, locale, action, data, expectedRevision: revisionRef.current,
						...(pageType==="product"?{pageType:"product",template:"default"}:{}) }),
				});
				const body = (await response.json()) as APIResponse;
				if (!response.ok) throw new Error(body.error || "Save failed");
				revisionRef.current = body.draftRevision ?? revisionRef.current + 1;
				savedRef.current = data;
				setDirty(JSON.stringify(documentRef.current) !== JSON.stringify(data));
				setStatus(
					action === "publish" ? `${pageTitle}发布成功，线上对应页面将显示新版本。` : "草稿已保存，线上页面未改变。",
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
		[channel, locale, storageReady, api, pageType, pageTitle],
	);

	function confirmPublish(): boolean {
		return window.confirm(
			`确定发布「${selectedSite?.name ?? "当前店铺"} / ${channel} / ${locale}」的${pageTitle}吗？发布后会覆盖这个市场和语言的对应线上模板。`,
		);
	}
	function confirmNavigation(): boolean {
		return !dirty || window.confirm("Unsaved edits will be discarded. Continue?");
	}
	function setTemplate(name: Builtin) {
		if (saving || !confirmNavigation()) return;
		const next = name==="product" ? structuredClone(PRODUCT_DETAIL_TEMPLATE) : freshStarterTemplate(name);
		documentRef.current = next;
		setDocument(next);
		setGeneration((current) => current + 1);
		setDirty(true);
		setStatus(
			name==="product" ? "商品详情页模板已应用到草稿，购买区保持原样。"
				: "行业模板已应用到草稿，线上页面不受影响。",
		);
	}
	function changePageType(value:"home"|"product") {
		if(saving||value===pageType||!confirmNavigation())return;
		setPageType(value);
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
					装修页面
					<select aria-label="选择装修页面"
						className="mt-1 block min-w-36 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
						value={pageType} disabled={saving}
						onChange={event=>changePageType(event.target.value as "home"|"product")}>
						<option value="home">网站首页</option>
						<option value="product">商品详情页（默认模板）</option>
					</select>
				</label>
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
                <label className="text-xs font-medium text-stone-600">
                  行业模板
                  <select aria-label="选择行业模板" value={pageType==="product"?"product":preset}
                    disabled={saving||pageType==="product"}
                    onChange={event=>setPreset(event.target.value as Builtin)}
                    className="ml-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                    {pageType==="product"?<option value="product">默认商品详情</option>:<>
                      <option value="fashion">服饰时尚</option>
                      <option value="jewelry">珠宝首饰</option>
                      <option value="minimal">极简通用</option>
                      <option value="blank">空白</option>
                    </>}
                  </select>
                </label>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<button
						disabled={saving || !channel}
						onClick={() => setTemplate(pageType==="product"?"product":preset)}
						className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100"
					>
						套用模板
					</button>
					<button
						disabled={saving || !channel}
						onClick={() => setTemplate("blank")}
						className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100"
					>
						空白页面
					</button>
                    <button type="button" aria-label="打开 AI 装修助手"
                      onClick={()=>setAiOpen(v=>!v)}
                      className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
                      ✦ AI 设计
                    </button>
                    <details className="relative">
                      <summary className="cursor-pointer rounded-lg border border-stone-200 px-3 py-2 text-sm">我的模板</summary>
                      <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
                        <p className="text-sm font-semibold">模板保存与复用</p>
                        <p className="text-xs text-stone-500">仅当前品牌、市场、语言及页面类型可见；保存模板不会发布页面。</p>
                        <label className="block text-xs">模板名称
                          <input aria-label="新模板名称" value={newTemplateTitle} maxLength={60}
                            onChange={event=>setNewTemplateTitle(event.target.value)}
                            placeholder="例如：秋季新品首页" className="mt-1 w-full rounded border border-stone-200 px-3 py-2 text-sm"/>
                        </label>
                        <button type="button" disabled={!storageReady||!document||libraryBusy||loading}
                          onClick={()=>{void saveCurrentAsTemplate();}}
                          className="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                          {libraryBusy?"处理中…":"保存当前页面为模板"}
                        </button>
                        <label className="block text-xs">已保存模板（{visibleTemplates.length}/40）
                          <select aria-label="已保存模板" value={chosenTemplate}
                            onChange={event=>setChosenTemplate(event.target.value)}
                            className="mt-1 w-full rounded border border-stone-200 px-3 py-2 text-sm">
                            <option value="">请选择模板</option>
                            {visibleTemplates.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
                          </select>
                        </label>
                        <div className="flex gap-2">
                          <button type="button" disabled={!chosenTemplate||libraryBusy||saving}
                            onClick={()=>{void applySavedTemplate();}}
                            className="flex-1 rounded border border-stone-200 px-3 py-2 text-xs disabled:opacity-40">应用到草稿</button>
                          <button type="button" disabled={!chosenTemplate||libraryBusy}
                            onClick={()=>{void removeSavedTemplate();}}
                            className="rounded border border-stone-200 px-3 py-2 text-xs text-red-700 disabled:opacity-40">删除</button>
                        </div>
                      </div>
                    </details>
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
						? (pageType==="product" ? "编辑购买区下方的图文与推荐模块；价格、SKU、库存及加购功能仍由 Saleor 管理。" : "左侧拖入模块，右侧选择商品与图片，中间实时预览，确认后发布。")
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
            {channel&&document?<ThemeAiAssistant
              key={pageType+":"+channel+":"+locale}
              open={aiOpen} onClose={()=>setAiOpen(false)}
              channel={channel} locale={locale} pageType={pageType}
              getDocument={()=>documentRef.current as ThemeData}
              onApply={(next,original)=>{
                if(JSON.stringify(documentRef.current)!==JSON.stringify(original))return false;
                documentRef.current=next;
                setDocument(next);
                setGeneration(v=>v+1);
                setDirty(JSON.stringify(next)!==JSON.stringify(savedRef.current));
                return true;
              }}
            />:null}
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
					key={pageType + ":" + channel + ":" + locale + ":" + generation}
					config={editorConfig}
					dictionary={EDITOR_DICTIONARY}
					data={document}
					headerTitle={(selectedSite?.name ?? "店铺") + " · " + pageTitle}
					headerPath={pageType==="home"?"/" + locale + "/" + channel:"/" + locale + "/" + channel + "/products"}
					height="calc(100vh - 215px)"
					viewports={[
						{ width: 1440, height: "auto", label: "桌面" },
						{ width: 390, height: "auto", label: "手机" },
					]}
					onChange={(data) => {
						documentRef.current = data;
						if(aiOpen)setAiSelectionVersion(v=>v+1);
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
