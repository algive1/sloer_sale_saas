"use client";

import { useEffect } from "react";
import { useOpsI18n } from "@/lib/ops/i18n.client";

const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

export function SaleorOpsSessionSync() {
	const { locale } = useOpsI18n();
	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);
	useEffect(() => {
		if (window.parent === window) return;
		const origin = window.location.origin;
		let exchanging = false;

		const requestToken = () => {
			window.parent.postMessage({ type: "commerce-ops:request-token" }, origin);
		};
		const handleMessage = (event: MessageEvent<unknown>) => {
			if (
				event.origin !== origin ||
				event.source !== window.parent ||
				!event.data ||
				typeof event.data !== "object" ||
				(event.data as { type?: unknown }).type !== "commerce-ops:saleor-token"
			) {
				return;
			}
			const accessToken = (event.data as { token?: unknown }).token;
			if (typeof accessToken !== "string" || accessToken.length > 8192 || exchanging) return;
			exchanging = true;
			void fetch("/api/admin-sso/exchange", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ accessToken }),
			})
				.catch(() => undefined)
				.finally(() => {
					exchanging = false;
				});
		};

		window.addEventListener("message", handleMessage);
		requestToken();
		const interval = window.setInterval(requestToken, REFRESH_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener("message", handleMessage);
		};
	}, []);

	return null;
}
