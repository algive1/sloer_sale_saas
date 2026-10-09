"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { isLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { getPairedChannelForLocale, getLocalesForChannel, isAllowedLocaleChannelPair } from "@/config/locale-channel";
import { useCatalogIdentity } from "@/lib/catalog/catalog-identity-bridge";
import {
	appendSearchParams,
	rewriteCatalogSuffixForLocaleSwitch,
	safeLocaleSwitchSuffixWithoutIdentity,
} from "@/lib/catalog/catalog-identity";
import { hasCartCookieForChannel } from "@/lib/cart-channel-cookie";
import { writeBrowseLocaleCookieClient } from "@/lib/browse-locale";
import {
	buildStorefrontPath,
	parseStorefrontPathname,
	replaceStorefrontChannel,
} from "@/lib/storefront-path";

/**
 * Navigate browse URLs while preserving the path suffix (ADR 0001).
 * On catalog detail pages, swap to the target locale's canonical slug when known
 * (ADR 0004 phase 2), else the primary slug (server 308s). If identity is not
 * registered yet (chrome streamed before the detail shell), drop the foreign
 * handle instead of 404ing.
 */
export function useStorefrontRegionNavigation(allowedChannels?: readonly string[]) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const params = useParams<{ locale?: string; channel?: string }>();
	const catalogIdentity = useCatalogIdentity();

	const locale = params.locale ?? "";
	const channel = params.channel ?? "";

	function navigateToLocale(newLocale: string) {
		if (!channel || !isLocaleSlug(newLocale)) return;

		// When a locale×channel matrix is configured, switch to the paired market too.
		const targetChannel = getPairedChannelForLocale(newLocale, channel, allowedChannels);
		// An unlisted pair is not a valid destination. Do not persist a preference
		// or navigate to a 404 (particularly in multi-brand mode).
		if (!isAllowedLocaleChannelPair(newLocale, targetChannel)) return;

		if (targetChannel !== channel && hasCartCookieForChannel(channel)) {
			const proceed = window.confirm(
				"Your cart is tied to this market. Switching markets starts a new cart — continue?",
			);
			if (!proceed) return;
		}

		const parsed = parseStorefrontPathname(pathname);
		let suffix = parsed?.suffix ?? "";
		if (parsed) {
			suffix = catalogIdentity
				? rewriteCatalogSuffixForLocaleSwitch(suffix, catalogIdentity, newLocale)
				: safeLocaleSwitchSuffixWithoutIdentity(suffix);
		}

		const path = parsed
			? buildStorefrontPath(newLocale, targetChannel, suffix)
			: buildStorefrontPath(newLocale, targetChannel);

		// Persist only after confirming a market/cart change.
		writeBrowseLocaleCookieClient(newLocale);
		// Drop query when we abandoned a detail URL (listing/home has no variant/filters meaning).
		const keepQuery = Boolean(catalogIdentity) || suffix === (parsed?.suffix ?? "");
		router.push(appendSearchParams(path, keepQuery ? searchParams : undefined));
	}

	function navigateToChannel(newChannel: string) {
		if (!locale || newChannel === channel || (allowedChannels && !allowedChannels.includes(newChannel))) return;

		// Locale slugs must never land in the channel segment (e.g. `no` / `nb` mistaken for a market).
		if (isLocaleSlug(newChannel)) return;

		if (hasCartCookieForChannel(channel)) {
			const proceed = window.confirm(
				"Your cart is tied to this market. Switching markets starts a new cart — continue?",
			);
			if (!proceed) return;
		}

		const allowedLocales = getLocalesForChannel(newChannel);
		const nextLocale = allowedLocales?.length && !allowedLocales.includes(locale)
			? allowedLocales[0] : locale;
		if (!isAllowedLocaleChannelPair(nextLocale, newChannel)) return;
		const oldPath = parseStorefrontPathname(pathname);
		const currentSuffix = oldPath?.suffix ?? "";
		const suffix = nextLocale === locale ? currentSuffix
			: catalogIdentity
				? rewriteCatalogSuffixForLocaleSwitch(currentSuffix, catalogIdentity, nextLocale)
				: safeLocaleSwitchSuffixWithoutIdentity(currentSuffix);
		const path = nextLocale === locale
			? replaceStorefrontChannel(pathname, newChannel) ?? buildStorefrontPath(locale, newChannel)
			: buildStorefrontPath(nextLocale, newChannel, suffix);
		const keepQuery = nextLocale === locale || Boolean(catalogIdentity) || suffix === currentSuffix;
		if (nextLocale !== locale && isStorefrontLocaleSlug(nextLocale)) {
			writeBrowseLocaleCookieClient(nextLocale);
		}
		router.push(appendSearchParams(path, keepQuery ? searchParams : undefined));
	}

	return { locale, channel, navigateToLocale, navigateToChannel };
}
