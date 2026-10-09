import { type NextRequest, NextResponse } from "next/server";
import { DefaultChannelSlug } from "@/app/config";
import { getStaticStorefrontChannelSlugs, isAllowedStorefrontChannel } from "@/config/channels";
import { getDefaultLocaleSlug, isLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { BROWSE_LOCALE_COOKIE, getBrowseLocaleCookieOptions } from "@/lib/browse-locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { verifyCheckoutHostAtRequestBoundary } from "@/lib/brand/checkout-host-guard";
import { channelForExplicitLocale, localeForChannel, resolveEntryLocalization, verifiedCountryFromHeader } from "@/lib/entry-localization";
import { isAllowedLocaleChannelPair } from "@/config/locale-channel";

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

	// Bare "/" only: personalize by saved preference, then browser languages.
	// Never do this for explicit localized product/ad URLs.
	if (segments.length === 0) {
		if (!defaultChannel) return NextResponse.next();
		const resolved = resolveEntryLocalization({
			defaultLocale,
			defaultChannel,
			allowedChannels: site?.channels ?? getStaticStorefrontChannelSlugs(),
			savedLocale: request.cookies.get(BROWSE_LOCALE_COOKIE)?.value,
			acceptLanguage: request.headers.get("accept-language"),
			country: verifiedCountryFromHeader(request.headers, process.env.STOREFRONT_GEO_COUNTRY_HEADER),
			countryChannelMap: process.env.STOREFRONT_COUNTRY_CHANNELS,
		});
		if (!resolved) {
			return new NextResponse("Store language unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
		}
		const url = request.nextUrl.clone();
		url.pathname = buildStorefrontPath(resolved.locale, resolved.channel);
		// Permanent 308s and shared CDN caching are unsafe for personalized language selection.
		const response = NextResponse.redirect(url, 307);
		response.headers.set("Cache-Control", "private, no-store");
		response.headers.set("Vary", "Accept-Language, Cookie");
		return withBrowseLocaleCookie(request, response, resolved.locale);
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
			const fallback = localeForChannel(defaultLocale, second, getDefaultLocaleSlug());
			if (!fallback) return new NextResponse("Store language unavailable", { status: 404 });
			url.pathname = buildStorefrontPath(fallback, second, suffix);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), fallback);
		}
		return NextResponse.next();
	}

	// Canonical format: /{locale}/{channel}/…
	if (isStorefrontLocaleSlug(first)) {
		if (second && isChannelSlug(second, site?.channels)) {
			// Reject invalid combinations before Next's RSC/PPR response starts.
			// A layout-level notFound() may stream HTTP 200 after the shell flushes.
			if (!isAllowedLocaleChannelPair(first, second)) {
				return new NextResponse("Store language unavailable for market", {
					status: 404,
					headers: { "Cache-Control": "no-store" },
				});
			}
			return withBrowseLocaleCookie(request, NextResponse.next(), first);
		}

		// /{locale} is an explicit visitor choice. Keep that language and
		// choose only a Channel belonging to the verified brand.
		if (!second && defaultChannel) {
			const matchedChannel = channelForExplicitLocale(
				first,
				defaultChannel,
				site?.channels ?? getStaticStorefrontChannelSlugs(),
			);
			if (!matchedChannel) return new NextResponse("Store language unavailable", { status: 404 });
			const url = request.nextUrl.clone();
			url.pathname = buildStorefrontPath(first, matchedChannel);
			return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), first);
		}

		return NextResponse.next();
	}

	// Legacy: /{channel}/… → /{defaultLocale}/{channel}/…
	if (isChannelSlug(first, site?.channels)) {
		const url = request.nextUrl.clone();
		const suffix = [second, ...rest].filter(Boolean).join("/");
		const fallback = localeForChannel(defaultLocale, first, getDefaultLocaleSlug());
		if (!fallback) return new NextResponse("Store language unavailable", { status: 404 });
		url.pathname = buildStorefrontPath(fallback, first, suffix ? `/${suffix}` : "");
		return withBrowseLocaleCookie(request, NextResponse.redirect(url, 308), fallback);
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
	 * API/order routes, static assets, and Next internals should not incur middleware
	 * overhead. Checkout is included so its cross-brand guards run before rendering.
	 */
	matcher: ["/((?!api/|api$|order/|order$|_next/|.*\\.[\\w]+$).*)"],
};
