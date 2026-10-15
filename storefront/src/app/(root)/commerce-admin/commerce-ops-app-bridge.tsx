"use client";

import { AppBridgeProvider } from "@saleor/app-sdk/app-bridge";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { isSaleorOpsAppPath } from "@/lib/ops/saleor-app-navigation";

type Props = {
	defaultPath: "/ops/plugins" | "/ops/settings" | "/ops/analytics";
};

type SaleorBridgeState = {
	ready: boolean;
	token?: string;
};

export function CommerceOpsAppBridge({ defaultPath }: Props) {
	return (
		<AppBridgeProvider>
			<Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" />}>
				<CommerceOpsAppFrame defaultPath={defaultPath} />
			</Suspense>
		</AppBridgeProvider>
	);
}

function CommerceOpsAppFrame({ defaultPath }: Props) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const appBridgeState = useRef<SaleorBridgeState>({ ready: false });
	const searchParams = useSearchParams();
	const [locale, setLocale] = useState("en");
	useEffect(() => {
		const sameOrigin = window.location.origin;
		const browserLocaleFrame = window.requestAnimationFrame(() => {
			setLocale(navigator.languages[0] ?? navigator.language ?? "en");
		});
		const handleMessage = (event: MessageEvent<unknown>) => {
			if (event.origin !== sameOrigin || !event.data || typeof event.data !== "object") {
				return;
			}

			const message = event.data as { type?: unknown; payload?: unknown };
			const payload =
				message.payload && typeof message.payload === "object"
					? (message.payload as { token?: unknown; locale?: unknown })
					: undefined;

			if (event.source === window.parent) {
				if (message.type === "handshake" && typeof payload?.token === "string") {
					appBridgeState.current = { ...appBridgeState.current, ready: true, token: payload.token };
					if (typeof payload.locale === "string") setLocale(payload.locale);
				} else if (message.type === "tokenRefresh" && typeof payload?.token === "string") {
					appBridgeState.current = { ...appBridgeState.current, token: payload.token };
				} else if (message.type === "localeChanged" && typeof payload?.locale === "string") {
					setLocale(payload.locale);
				}
				return;
			}

			const token = appBridgeState.current.token;
			if (
				event.source !== frameRef.current?.contentWindow ||
				message.type !== "commerce-ops:request-token" ||
				!appBridgeState.current.ready ||
				typeof token !== "string"
			) {
				return;
			}

			frameRef.current?.contentWindow?.postMessage({ type: "commerce-ops:saleor-token", token }, sameOrigin);
		};

		window.addEventListener("message", handleMessage);
		return () => {
			window.cancelAnimationFrame(browserLocaleFrame);
			window.removeEventListener("message", handleMessage);
		};
	}, []);
	const pathParameter = searchParams.get("path");
	const opsPath = isSaleorOpsAppPath(pathParameter) ? pathParameter : defaultPath;
	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);
	const frameSource = useMemo(() => {
		const params = new URLSearchParams({ embedded: "1", uiLocale: locale });
		return `${opsPath}?${params.toString()}`;
	}, [opsPath, locale]);

	return (
		<main className="min-h-dvh bg-background" data-testid="saleor-commerce-ops-app">
			<iframe
				key={frameSource}
				ref={frameRef}
				title={locale.toLowerCase().startsWith("zh") ? "系统运营功能" : "Commerce operations"}
				src={frameSource}
				className="block min-h-dvh w-full border-0"
				allow="clipboard-read; clipboard-write"
				data-testid="saleor-commerce-ops-frame"
			/>
		</main>
	);
}
