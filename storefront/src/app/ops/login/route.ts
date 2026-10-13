import { createOpsI18n } from "@/lib/ops/i18n";
import { OPS_LOCALE_COOKIE, resolveOpsUiLocale } from "@/lib/ops/locale";
import { NextRequest, NextResponse } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import { rejectIfRateLimited } from "@/lib/auth/auth-rate-limit";
import { opsPublicRequestUrl } from "@/lib/ops/request-url";
import {
	createOpsSession,
	OPS_SESSION_COOKIE,
	OPS_SESSION_SECONDS,
	opsLoginDestination,
} from "@/lib/ops/session";
import { SALEOR_OPS_SESSION_COOKIE } from "@/lib/ops/saleor-session";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export function GET(request: NextRequest) {
	const destination = opsLoginDestination(request.nextUrl.searchParams.get("next"));
	const selected = new URL(destination, request.url).searchParams.get("uiLocale");
	const { locale, t } = createOpsI18n(
		resolveOpsUiLocale(
			selected || request.cookies.get(OPS_LOCALE_COOKIE)?.value,
			request.headers.get("accept-language"),
		),
	);
	const next = encodeURIComponent(destination);
	const error = request.nextUrl.searchParams.has("error") ? t("账号或密码不正确，请重试。") : "";
	// A route handler owns this standalone login document, outside the authenticated Ops layout.
	return new NextResponse(
		`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t("运营后台登录")}</title><style>body{font:16px system-ui;background:var(--background,Canvas);display:grid;place-items:center;min-height:100vh;margin:0}main{background:var(--card,Canvas);border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:16px;padding:32px;width:min(360px,80vw)}label,input,button{display:block;width:100%;box-sizing:border-box}label{margin:20px 0 8px}input,button{padding:12px;border-radius:8px;border:1px solid color-mix(in srgb,CanvasText 30%,transparent)}button{margin-top:24px;background:var(--primary,Highlight);color:var(--primary-foreground,HighlightText);cursor:pointer}p{line-height:1.6;color:var(--muted-foreground,GrayText)}.error{color:var(--destructive,CanvasText)}</style><main><h1>${t("运营后台登录")}</h1><p>${t("使用运营账号登录，登录后自动返回您选择的功能。Saleor 管理后台与运营后台使用各自的账号。")}</p><p class="error" role="alert">${error}</p><form method="post" action="/ops/login?next=${next}"><label for="username">${t("账号")}</label><input id="username" name="username" autocomplete="username" required><label for="password">${t("密码")}</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">${t("登录并进入")}</button></form></main></html>`,
		{
			headers: {
				...privateHeaders,
				"Content-Type": "text/html; charset=utf-8",
				"Content-Security-Policy":
					"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
			},
		},
	);
}

export async function POST(request: NextRequest) {
	const publicUrl = opsPublicRequestUrl(request.url, request.headers.get("host"));
	if (!publicUrl || request.headers.get("origin") !== publicUrl.origin) {
		return new NextResponse("禁止跨站登录", { status: 403, headers: privateHeaders });
	}
	if (request.nextUrl.searchParams.get("action") === "logout") {
		const response = NextResponse.redirect(new URL("/ops/login", publicUrl), {
			status: 303,
			headers: privateHeaders,
		});
		response.cookies.set(OPS_SESSION_COOKIE, "", {
			httpOnly: true,
			sameSite: "strict",
			secure: publicUrl.protocol === "https:",
			path: "/",
			maxAge: 0,
		});
		response.cookies.set(SALEOR_OPS_SESSION_COOKIE, "", {
			httpOnly: true,
			sameSite: "strict",
			secure: publicUrl.protocol === "https:",
			path: "/",
			maxAge: 0,
		});
		return response;
	}
	const limited = rejectIfRateLimited(request, "login");
	if (limited) return limited;
	if (Number(request.headers.get("content-length") || "0") > 4096)
		return new NextResponse("请求过大", { status: 413 });
	if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
		return new NextResponse("不支持的登录请求格式", { status: 415 });
	const body = await request.text();
	if (body.length > 4096) return new NextResponse("请求过大", { status: 413 });
	const form = new URLSearchParams(body);
	const username = form.get("username");
	const password = form.get("password");
	const config = {
		operatorsJson: process.env.OPS_OPERATORS_JSON,
		legacySecret: process.env.ANALYTICS_DASHBOARD_SECRET,
		trustedSiteIds: getBrandSites()?.map((site) => site.id) ?? [],
	};
	const session =
		typeof username === "string" &&
		/^[a-z][a-z0-9_-]{2,63}$/.test(username) &&
		typeof password === "string" &&
		/^[\x21-\x7e]{1,256}$/.test(password)
			? await createOpsSession("Basic " + btoa(`${username}:${password}`), config)
			: null;
	const destination = opsLoginDestination(request.nextUrl.searchParams.get("next"));
	if (!session) {
		const url = new URL("/ops/login", publicUrl);
		url.searchParams.set("next", destination);
		url.searchParams.set("error", "credentials");
		return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
	}
	const response = NextResponse.redirect(new URL(destination, publicUrl), {
		status: 303,
		headers: privateHeaders,
	});
	response.cookies.set(OPS_SESSION_COOKIE, session, {
		httpOnly: true,
		sameSite: "strict",
		secure: publicUrl.protocol === "https:",
		path: "/",
		maxAge: OPS_SESSION_SECONDS,
	});
	return response;
}
