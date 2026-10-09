"use client";

import { useEffect, useRef, useState } from "react";
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
  $chatwoot?: { toggle: (state: "open" | "close") => void };
};

const COPY: Record<string, { open: string; loading: string; error: string }> = {
  en: { open: "Chat with us", loading: "Opening chat…", error: "Chat unavailable. Try again" },
  de: { open: "Chat starten", loading: "Chat wird geöffnet…", error: "Chat nicht verfügbar. Erneut versuchen" },
  fr: { open: "Discuter avec nous", loading: "Ouverture du chat…", error: "Chat indisponible. Réessayer" },
  es: { open: "Hablar con nosotros", loading: "Abriendo el chat…", error: "Chat no disponible. Reintentar" },
  ja: { open: "お問い合わせ", loading: "チャットを開いています…", error: "接続できません。再試行してください" },
  ko: { open: "채팅 문의", loading: "채팅 연결 중…", error: "연결할 수 없습니다. 다시 시도" },
};

type Props = { baseUrl: string; websiteToken: string; locale: string };

/**
 * Chatwoot never loads during normal browsing. Only a genuine click fetches
 * its external SDK; a Chatwoot outage cannot block catalog or checkout.
 * Guest-only in phase 1: do not call setUser without server-signed HMAC.
 */
export function ChatwootLauncher({ baseUrl, websiteToken, locale }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [opened, setOpened] = useState(false);
  const started = useRef(false);
  const copy = COPY[locale] ?? COPY.en;

  useEffect(() => {
    const onReady = () => {
      setState("ready");
      (window as ChatwootWindow).$chatwoot?.toggle("open");
    };
    const onOpened = () => setOpened(true);
    const onClosed = () => setOpened(false);
    window.addEventListener("chatwoot:ready", onReady);
    window.addEventListener("chatwoot:opened", onOpened);
    window.addEventListener("chatwoot:closed", onClosed);
    return () => {
      window.removeEventListener("chatwoot:ready", onReady);
      window.removeEventListener("chatwoot:opened", onOpened);
      window.removeEventListener("chatwoot:closed", onClosed);
    };
  }, []);

  const open = () => {
    if (started.current) {
      (window as ChatwootWindow).$chatwoot?.toggle("open");
      return;
    }
    started.current = true;
    setState("loading");
    const chatwootWindow = window as ChatwootWindow;
    chatwootWindow.chatwootSettings = {
      hideMessageBubble: true,
      showUnreadMessagesDialog: false,
      useBrowserLanguage: false,
      locale,
      position: "right",
    };
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = baseUrl + "/packs/js/sdk.js";
    script.onload = () => {
      if (!chatwootWindow.chatwootSDK) {
        started.current = false;
        script.remove();
        setState("error");
        return;
      }
      try {
        chatwootWindow.chatwootSDK.run({ websiteToken, baseUrl });
      } catch {
        started.current = false;
        script.remove();
        setState("error");
      }
    };
    script.onerror = () => {
      started.current = false;
      script.remove();
      setState("error");
    };
    document.head.appendChild(script);
  };

  if (opened) return null;
  return (
    <div className="fixed bottom-24 right-4 z-[45] sm:bottom-6" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
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
