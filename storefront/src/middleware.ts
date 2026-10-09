import { type NextRequest, NextResponse } from "next/server";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs, isAllowedStorefrontChannel } from "@/config/channels";
import { getDefaultLocaleSlug, isLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { BROWSE_LOCALE_COOKIE, getBrowseLocaleCookieOptions } from "@/lib/browse-locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { verifyCheckoutHostAtRequestBoundary } from "@/lib/brand/checkout-host-guard";

const RESERVED_ROOT_SEGMENTS = new Set([
	"api",
	"checkout",
	"order",
	"ops",
	"_next",
	"favicon.ico",
	"robots.txt",
	"sitemap.xml",
]);

function isChannelSlug(segment: string, siteChannels?: readonly string[]): boolean {
	const allowed = siteChannels ?? getStaticStorefrontChannelSlugs();
	return isAllowedStorefrontChannel(segment, allowed);
}

function withBrowseLocaleCookie(request: NextRequest, response: NextResponse, locale: string): NextResponse {
	if (!isStorefrontLocaleSlug(locale)) {
		return response;
	}

	// Skip Set-Cookie when the value is already correct — re-setting on every HTML response
	// marks responses as uncacheable at shared CDNs even when nothing changed.
	const current = request.cookies.get(BROWSE_LOCALE_COOKIE)?.value;
	if (current === locale) {
		return response;
	}

	response.cookies.set(BROWSE_LOCALE_COOKIE, locale, getBrowseLocaleCookieOptions());
	return response;
}

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

  // The /checkout surface is a separate Next root layout and streams React
  // Server Components. notFound() inside its async loader can leave HTTP 200.
  // Reject foreign checkout IDs here, before rendering, caching or hydration.
  if (pathname === "/checkout" && brandSitesConfigured()) {
    const checkoutId = request.nextUrl.searchParams.get("checkout");
    if (!brandSiteForHost(request.headers.get("host"))) {
      return new NextResponse("Store not found", { status: 404 });
    }
    if (checkoutId !== null) {
      const result = await verifyCheckoutHostAtRequestBoundary(checkoutId, request.headers.get("host"));
      if (result === "not-found") return new NextResponse("Checkout not found", { status: 404 });
      if (result === "unavailable") return new NextResponse("Checkout temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

	if (pathname === "/ops" || pathname.startsWith("/ops/")) {
		const secret = process.env.ANALYTICS_DASHBOARD_SECRET?.trim();
		if (!secret) return new NextResponse("Not found", { status: 404 });
		const auth = request.headers.get("authorization");
		if (!validBasicAuth(auth, secret)) {
			return new NextResponse("Authentication required", {
				status: 401,
				headers: { "WWW-Authenticate": 'Basic realm="Analytics", charset="UTF-8"' },
			});
		}
	}

	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api") ||
		pathname.includes(".") // static files
	) {
		return NextResponse.next();
	}

	const segments = pathname.split("/").filter(Boolean);
	// Exact Host allowlist: an unknown domain cannot fall through to another brand.
	// Only the reverse-proxy supplied Host is trusted; never x-forwarded-host.
	const site = brandSiteForHost(request.headers.get("host"));
	if (brandSitesConfigured() && !site && !RESERVED_ROOT_SEGMENTS.has(segments[0] ?? "")) {
		return new NextResponse("Store not found", { status: 404 });
	}
	const defaultLocale = site?.defaultLocale ?? getDefaultLocaleSlug();
	const defaultChannel = site?.defaultChannel ?? DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0];

	// Root → default browse home
	if (segments.length === 0) {
		if (!defaultChannel) {
			return NextResponse.next();
		}
		const url = request.nextUrl.clone();
		url.pathname = buildStorefrontPath(defaultLocale, defaultChannel);
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
	}

	const [first, second, ...rest] = segments;

  // Important: this MUST happen at the request boundary. Page/layout guards
  // cannot reject an already-prerendered or cache-served foreign Channel page.
  // In multi-brand mode an /{locale}/{channel}/... pathname is inaccessible
  // unless the incoming verified Host explicitly owns that Channel.
  if (brandSitesConfigured() && site) {
    if (isLocaleSlug(first) && second && !site.channels.includes(second)) {
      return new NextResponse("Store channel not found", { status: 404 });
    }
    if (getStaticStorefrontChannelSlugs().includes(first) && !site.channels.includes(first)) {
      return new NextResponse("Store channel not found", { status: 404 });
    }
  }

	if (RESERVED_ROOT_SEGMENTS.has(first)) {
		return NextResponse.next();
	}

	// Disabled locale slug (defined but not in NEXT_PUBLIC_STOREFRONT_LOCALES) → canonical default locale
	if (isLocaleSlug(first) && !isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second, site?.channels)) {
			const url = request.nextUrl.clone();
			const suffix = rest.length > 0 ? `/${rest.join("/")}` : "";
			url.pathname = buildStorefrontPath(defaultLocale, second, suffix);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
		}
		return NextResponse.next();
	}

	// Canonical format: /{locale}/{channel}/…
	if (isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second, site?.channels)) {
			return withBrowseLocaleCookie(request, NextResponse.next(), first);
		}

		// /{locale} only → add default channel
		if (!second && defaultChannel) {
			const url = request.nextUrl.clone();
			url.pathname = buildStorefrontPath(first, defaultChannel);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), first);
		}

		return NextResponse.next();
	}

	// Legacy: /{channel}/… → /{defaultLocale}/{channel}/…
	if (isChannelSlug(first, site?.channels)) {
		const url = request.nextUrl.clone();
		const suffix = [second, ...rest].filter(Boolean).join("/");
		url.pathname = buildStorefrontPath(defaultLocale, first, suffix ? `/${suffix}` : "");
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
	}

	return NextResponse.next();
}

function validBasicAuth(header: string | null, expectedPassword: string): boolean {
	if (!header?.startsWith("Basic ")) return false;
	try {
		const decoded = atob(header.slice(6));
		const separator = decoded.indexOf(":");
		if (separator === -1) return false;
		const username = decoded.slice(0, separator);
		const password = decoded.slice(separator + 1);
		return username === "analytics" && constantTimeEqual(password, expectedPassword);
	} catch {
		return false;
	}
}

function constantTimeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let mismatch = 0;
	for (let index = 0; index < left.length; index++) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

export const config = {
	/**
	 * Vercel bills an Edge Middleware invocation for every matched request, including the
	 * ones this function immediately no-ops on. Excluding them here means they are never
	 * invoked at all: API routes, the order surface, all `_next` internals, and any
	 * path ending in a file extension (public/ assets, fonts, icons — this also covers
	 * favicon.ico, robots.txt and sitemap.xml).
	 *
	 * Checkout is deliberately included so brand checks run before streamed RSC responses.
	 * Prefixes are anchored with `/` or `import { type NextRequest, NextResponse } from "next/server";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs, isAllowedStorefrontChannel } from "@/config/channels";
import { getDefaultLocaleSlug, isLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { BROWSE_LOCALE_COOKIE, getBrowseLocaleCookieOptions } from "@/lib/browse-locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { verifyCheckoutHostAtRequestBoundary } from "@/lib/brand/checkout-host-guard";

const RESERVED_ROOT_SEGMENTS = new Set([
	"api",
	"checkout",
	"order",
	"ops",
	"_next",
	"favicon.ico",
	"robots.txt",
	"sitemap.xml",
]);

function isChannelSlug(segment: string, siteChannels?: readonly string[]): boolean {
	const allowed = siteChannels ?? getStaticStorefrontChannelSlugs();
	return isAllowedStorefrontChannel(segment, allowed);
}

function withBrowseLocaleCookie(request: NextRequest, response: NextResponse, locale: string): NextResponse {
	if (!isStorefrontLocaleSlug(locale)) {
		return response;
	}

	// Skip Set-Cookie when the value is already correct — re-setting on every HTML response
	// marks responses as uncacheable at shared CDNs even when nothing changed.
	const current = request.cookies.get(BROWSE_LOCALE_COOKIE)?.value;
	if (current === locale) {
		return response;
	}

	response.cookies.set(BROWSE_LOCALE_COOKIE, locale, getBrowseLocaleCookieOptions());
	return response;
}

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

  // The /checkout surface is a separate Next root layout and streams React
  // Server Components. notFound() inside its async loader can leave HTTP 200.
  // Reject foreign checkout IDs here, before rendering, caching or hydration.
  if (pathname === "/checkout" && brandSitesConfigured()) {
    const checkoutId = request.nextUrl.searchParams.get("checkout");
    if (!brandSiteForHost(request.headers.get("host"))) {
      return new NextResponse("Store not found", { status: 404 });
    }
    if (checkoutId !== null) {
      const result = await verifyCheckoutHostAtRequestBoundary(checkoutId, request.headers.get("host"));
      if (result === "not-found") return new NextResponse("Checkout not found", { status: 404 });
      if (result === "unavailable") return new NextResponse("Checkout temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

	if (pathname === "/ops" || pathname.startsWith("/ops/")) {
		const secret = process.env.ANALYTICS_DASHBOARD_SECRET?.trim();
		if (!secret) return new NextResponse("Not found", { status: 404 });
		const auth = request.headers.get("authorization");
		if (!validBasicAuth(auth, secret)) {
			return new NextResponse("Authentication required", {
				status: 401,
				headers: { "WWW-Authenticate": 'Basic realm="Analytics", charset="UTF-8"' },
			});
		}
	}

	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api") ||
		pathname.includes(".") // static files
	) {
		return NextResponse.next();
	}

	const segments = pathname.split("/").filter(Boolean);
	// Exact Host allowlist: an unknown domain cannot fall through to another brand.
	// Only the reverse-proxy supplied Host is trusted; never x-forwarded-host.
	const site = brandSiteForHost(request.headers.get("host"));
	if (brandSitesConfigured() && !site && !RESERVED_ROOT_SEGMENTS.has(segments[0] ?? "")) {
		return new NextResponse("Store not found", { status: 404 });
	}
	const defaultLocale = site?.defaultLocale ?? getDefaultLocaleSlug();
	const defaultChannel = site?.defaultChannel ?? DefaultChannelSlug ?? getStaticStorefrontChannelSlugs()[0];

	// Root → default browse home
	if (segments.length === 0) {
		if (!defaultChannel) {
			return NextResponse.next();
		}
		const url = request.nextUrl.clone();
		url.pathname = buildStorefrontPath(defaultLocale, defaultChannel);
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
	}

	const [first, second, ...rest] = segments;

  // Important: this MUST happen at the request boundary. Page/layout guards
  // cannot reject an already-prerendered or cache-served foreign Channel page.
  // In multi-brand mode an /{locale}/{channel}/... pathname is inaccessible
  // unless the incoming verified Host explicitly owns that Channel.
  if (brandSitesConfigured() && site) {
    if (isLocaleSlug(first) && second && !site.channels.includes(second)) {
      return new NextResponse("Store channel not found", { status: 404 });
    }
    if (getStaticStorefrontChannelSlugs().includes(first) && !site.channels.includes(first)) {
      return new NextResponse("Store channel not found", { status: 404 });
    }
  }

	if (RESERVED_ROOT_SEGMENTS.has(first)) {
		return NextResponse.next();
	}

	// Disabled locale slug (defined but not in NEXT_PUBLIC_STOREFRONT_LOCALES) → canonical default locale
	if (isLocaleSlug(first) && !isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second, site?.channels)) {
			const url = request.nextUrl.clone();
			const suffix = rest.length > 0 ? `/${rest.join("/")}` : "";
			url.pathname = buildStorefrontPath(defaultLocale, second, suffix);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
		}
		return NextResponse.next();
	}

	// Canonical format: /{locale}/{channel}/…
	if (isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second, site?.channels)) {
			return withBrowseLocaleCookie(request, NextResponse.next(), first);
		}

		// /{locale} only → add default channel
		if (!second && defaultChannel) {
			const url = request.nextUrl.clone();
			url.pathname = buildStorefrontPath(first, defaultChannel);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), first);
		}

		return NextResponse.next();
	}

	// Legacy: /{channel}/… → /{defaultLocale}/{channel}/…
	if (isChannelSlug(first, site?.channels)) {
		const url = request.nextUrl.clone();
		const suffix = [second, ...rest].filter(Boolean).join("/");
		url.pathname = buildStorefrontPath(defaultLocale, first, suffix ? `/${suffix}` : "");
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), defaultLocale);
	}

	return NextResponse.next();
}

function validBasicAuth(header: string | null, expectedPassword: string): boolean {
	if (!header?.startsWith("Basic ")) return false;
	try {
		const decoded = atob(header.slice(6));
		const separator = decoded.indexOf(":");
		if (separator === -1) return false;
		const username = decoded.slice(0, separator);
		const password = decoded.slice(separator + 1);
		return username === "analytics" && constantTimeEqual(password, expectedPassword);
	} catch {
		return false;
	}
}

function constantTimeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let mismatch = 0;
	for (let index = 0; index < left.length; index++) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

export const config = {
	/**
	 * Vercel bills an Edge Middleware invocation for every matched request, including the
	 * ones this function immediately no-ops on. Excluding them here means they are never
	 * invoked at all: API routes, the order surface, all `_next` internals, and any
	 * path ending in a file extension (public/ assets, fonts, icons — this also covers
	 * favicon.ico, robots.txt and sitemap.xml).
	 *
	 so they exclude `/api/…` without also
	 * excluding a channel or locale slug that merely starts with those letters.
	 *
	 * The equivalent guards at the top of `middleware()` stay as a backstop for runtimes
	 * that apply the matcher differently (self-hosted, `next start`).
	 */
	matcher: ["/((?!api/|api$|order/|order$|_next/|.*\\.[\\w]+$).*)"],
};
