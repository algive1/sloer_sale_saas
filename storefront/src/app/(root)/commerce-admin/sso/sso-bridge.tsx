"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { opsLoginDestination } from "@/lib/ops/session";
import { resolveOpsLocale } from "@/lib/ops/locale";

type BridgeStatus = "checking" | "waiting" | "denied" | "error";

export function SaleorOpsSsoBridge() {
	const searchParams = useSearchParams();
	const next = useMemo(() => opsLoginDestination(searchParams.get("next")), [searchParams]);
	const uiLocale = new URLSearchParams(next.split("?")[1] ?? "").get("uiLocale") ?? "zh-Hans";
	const isChinese = uiLocale.toLowerCase().startsWith("zh");
	const isTopLevelWindow = typeof window !== "undefined" && window.parent === window;
	const [status, setStatus] = useState<BridgeStatus>("checking");
	const pending = useRef(false);
	const visibleStatus = isTopLevelWindow ? "error" : status;

	useEffect(() => {
		document.documentElement.lang = resolveOpsLocale(uiLocale, navigator.languages);
	}, [uiLocale]);

	useEffect(() => {
		let active = true;
		let tokenRetryInterval: number | undefined;
		const sameOrigin = window.location.origin;
		const stopTokenRetry = () => {
			if (tokenRetryInterval !== undefined) {
				window.clearInterval(tokenRetryInterval);
				tokenRetryInterval = undefined;
			}
		};

		if (window.parent === window) return;

		const requestToken = () => {
			if (!active || pending.current) return;
			window.parent.postMessage({ type: "commerce-ops:request-token" }, sameOrigin);
			setStatus(current => current === "checking" ? "waiting" : current);
		};

		const exchange = async (accessToken: string) => {
			if (pending.current || !active) return;
			pending.current = true;
			stopTokenRetry();
			try {
				const response = await fetch("/api/admin-sso/exchange", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ accessToken }),
				});
				if (response.ok) {
					window.location.replace(next);
					return;
				}
				setStatus(response.status === 403 ? "denied" : "error");
			} catch {
				setStatus("error");
			} finally {
				pending.current = false;
			}
		};

		const handleMessage = (event: MessageEvent<unknown>) => {
			if (
				event.origin !== sameOrigin ||
				event.source !== window.parent ||
				!event.data ||
				typeof event.data !== "object" ||
				(event.data as { type?: unknown }).type !== "commerce-ops:saleor-token"
			) {
				return;
			}
			const accessToken = (event.data as { token?: unknown }).token;
			if (typeof accessToken === "string" && accessToken.length <= 8192) void exchange(accessToken);
		};

		window.addEventListener("message", handleMessage);
		void fetch("/api/admin-sso/exchange", { credentials: "same-origin", cache: "no-store" })
			.then(async response => {
				if (!active) return;
				const result = (await response.json()) as { authenticated?: boolean };
				if (response.ok && result.authenticated) {
					window.location.replace(next);
					return;
				}
				requestToken();
				tokenRetryInterval = window.setInterval(requestToken, 750);
			})
			.catch(() => {
				if (active) setStatus("error");
			});
		return () => {
			active = false;
			stopTokenRetry();
			window.removeEventListener("message", handleMessage);
		};
	}, [next]);

	const copy = {
		checking: isChinese ? "正在检查后台会话…" : "Checking your admin session…",
		waiting: isChinese ? "正在使用当前 Saleor 登录验证权限…" : "Verifying your current Saleor session…",
		denied: isChinese
			? "当前 Saleor 员工账号没有此功能所需权限。请联系管理员调整权限组。"
			: "Your Saleor staff account does not have the permission required for this feature.",
		error: isChinese
			? "无法验证 Saleor 会话。请重新登录管理后台后再试。"
			: "Could not verify the Saleor session. Sign in to the Dashboard and try again.",
	};

	return (
		<main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
			<section className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm" aria-live="polite">
				<h1 className="text-xl font-semibold">{isChinese ? "运营管理" : "Commerce operations"}</h1>
				<p className="mt-3 text-sm text-muted-foreground">{copy[visibleStatus]}</p>
			</section>
		</main>
	);
}
