"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

type ChatwootWindow = Window & {
	chatwootSettings?: {
		hideMessageBubble: boolean;
		showUnreadMessagesDialog: boolean;
		useBrowserLanguage: boolean;
		locale: string;
		position: "right";
	};
	chatwootSDK?: { run: (args: { websiteToken: string; baseUrl: string }) => void };
	$chatwoot?: { toggle: (state: "open" | "close") => void; setLocale?: (locale: string) => void };
};

const COPY: Record<string, { open: string; loading: string; error: string }> = {
	en: { open: "Chat with us", loading: "Opening chat…", error: "Chat unavailable. Try again" },
	de: {
		open: "Chat starten",
		loading: "Chat wird geöffnet…",
		error: "Chat nicht verfügbar. Erneut versuchen",
	},
	fr: { open: "Discuter avec nous", loading: "Ouverture du chat…", error: "Chat indisponible. Réessayer" },
	es: { open: "Hablar con nosotros", loading: "Abriendo el chat…", error: "Chat no disponible. Reintentar" },
	ja: {
		open: "お問い合わせ",
		loading: "チャットを開いています…",
		error: "接続できません。再試行してください",
	},
	ko: { open: "채팅 문의", loading: "채팅 연결 중…", error: "연결할 수 없습니다. 다시 시도" },
};

type Props = { baseUrl: string; websiteToken: string; locale: string; embedded?: boolean };

/**
 * Chatwoot never loads during normal browsing. Only a genuine click fetches
 * its external SDK; a Chatwoot outage cannot block catalog or checkout.
 * Guest-only in phase 1: do not call setUser without server-signed HMAC.
 */
export function ChatwootLauncher({ baseUrl, websiteToken, locale, embedded = false }: Props) {
	const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
	const [opened, setOpened] = useState(false);
	const started = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scriptRef = useRef<HTMLScriptElement | null>(null);
	const localeRef = useRef(locale);
	const copy = Object.hasOwn(COPY, locale) ? COPY[locale] : COPY.en;
	const clearTimer = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	}, []);
	const fail = useCallback(() => {
		clearTimer();
		started.current = false;
		setOpened(false);
		if (typeof (window as ChatwootWindow).chatwootSDK?.run !== "function") {
			if (scriptRef.current) {
				scriptRef.current.onload = null;
				scriptRef.current.onerror = null;
			}
			scriptRef.current?.remove();
			scriptRef.current = null;
			delete (window as ChatwootWindow).chatwootSDK;
		}
		setState("error");
	}, [clearTimer]);
	useEffect(() => {
		localeRef.current = locale;
		try {
			(window as ChatwootWindow).$chatwoot?.setLocale?.(locale);
		} catch {
			console.warn("[customer-support] widget locale update unavailable");
		}
	}, [locale]);

	useEffect(() => {
		const onReady = () => {
			if (typeof (window as ChatwootWindow).$chatwoot?.toggle !== "function") {
				fail();
				return;
			}
			clearTimer();
			started.current = true;
			setState("ready");
			try {
				(window as ChatwootWindow).$chatwoot?.setLocale?.(localeRef.current);
				(window as ChatwootWindow).$chatwoot?.toggle("open");
			} catch {
				fail();
			}
		};
		const onOpened = () => setOpened(true);
		const onClosed = () => setOpened(false);
		window.addEventListener("chatwoot:ready", onReady);
		window.addEventListener("chatwoot:opened", onOpened);
		window.addEventListener("chatwoot:closed", onClosed);
		window.addEventListener("chatwoot:error", fail);
		return () => {
			clearTimer();
			if (scriptRef.current) {
				scriptRef.current.onload = null;
				scriptRef.current.onerror = null;
				if (!(window as ChatwootWindow).chatwootSDK) scriptRef.current.remove();
			}
			window.removeEventListener("chatwoot:ready", onReady);
			window.removeEventListener("chatwoot:opened", onOpened);
			window.removeEventListener("chatwoot:closed", onClosed);
			window.removeEventListener("chatwoot:error", fail);
		};
	}, [clearTimer, fail]);

	const open = () => {
		if (started.current) {
			try {
				(window as ChatwootWindow).$chatwoot?.toggle("open");
			} catch {
				fail();
			}
			return;
		}
		started.current = true;
		setState("loading");
		const chatwootWindow = window as ChatwootWindow;
		timer.current = setTimeout(fail, 15_000);
		if (chatwootWindow.$chatwoot?.toggle) {
			clearTimer();
			started.current = true;
			setState("ready");
			try {
				chatwootWindow.$chatwoot.toggle("open");
			} catch {
				fail();
			}
			return;
		}
		chatwootWindow.chatwootSettings = {
			hideMessageBubble: true,
			showUnreadMessagesDialog: false,
			useBrowserLanguage: false,
			locale,
			position: "right",
		};
		const runSdk = () => {
			try {
				if (typeof chatwootWindow.chatwootSDK?.run !== "function") {
					fail();
					return;
				}
				chatwootWindow.chatwootSDK.run({ websiteToken, baseUrl });
			} catch {
				fail();
			}
		};
		// A timed-out iframe may still leave a loaded SDK. Retry its initialization
		// without downloading duplicate scripts or assigning a guest identity.
		if (typeof chatwootWindow.chatwootSDK?.run === "function") {
			runSdk();
			return;
		}
		const script = document.createElement("script");
		scriptRef.current = script;
		script.async = true;
		script.defer = true;
		script.src = baseUrl + "/packs/js/sdk.js";
		script.onload = () => {
			if (started.current) runSdk();
		};
		script.onerror = () => {
			fail();
		};
		document.head.appendChild(script);
	};

	if (opened) return null;
	return (
		<div
			className={embedded ? undefined : "fixed bottom-24 right-4 z-[45] sm:bottom-6"}
			style={embedded ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
		>
			<button
				type="button"
				onClick={open}
				disabled={state === "loading"}
				aria-label={state === "loading" ? copy.loading : state === "error" ? copy.error : copy.open}
				aria-busy={state === "loading"}
				className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-lg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-70"
			>
				<MessageCircle aria-hidden="true" className="h-5 w-5" />
				<span>{state === "loading" ? copy.loading : state === "error" ? copy.error : copy.open}</span>
			</button>
		</div>
	);
}
