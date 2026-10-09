import { getDefaultLocaleSlug, getLocaleDefinition, getStorefrontLocaleSlugs } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { brandSiteForChannel } from "@/config/brand-sites";
import { buildStorefrontPath } from "@/lib/storefront-path";

type LocaleChannelTarget = { locale: string; channel: string };

/** Same suffix for every locale, or a per-locale suffix map (translated catalog slugs). */
export type HreflangPathInput = string | Record<string, string>;

function getHreflangTargets(fallbackChannel: string): LocaleChannelTarget[] {
	const site = brandSiteForChannel(fallbackChannel);
	const enabled = new Set(getStorefrontLocaleSlugs());
	const pairs = getConfiguredLocaleChannelPairs();
	if (!pairs) return [...enabled].map((locale) => ({ locale, channel: fallbackChannel }));

	// Brand ownership is an SEO boundary, not just a storefront routing boundary.
	// Sort current channel first so duplicate hreflang keys prefer this market.
	return pairs
		.filter(({ locale, channel }) => enabled.has(locale) && (!site || site.channels.includes(channel)))
		.sort((a, b) => Number(b.channel === fallbackChannel) - Number(a.channel === fallbackChannel));
}

function getXDefaultTarget(fallbackChannel: string, targets: readonly LocaleChannelTarget[]): LocaleChannelTarget {
	const site = brandSiteForChannel(fallbackChannel);
	const defaultLocale = site?.defaultLocale ?? getDefaultLocaleSlug();
	if (site) {
		return targets.find(({ locale, channel }) => locale === defaultLocale && channel === site.defaultChannel)
			?? targets.find(({ locale }) => locale === defaultLocale)
			?? targets.find(({ channel }) => channel === fallbackChannel)
			?? targets[0]!;
	}

	const defaultChannel = getStaticStorefrontChannelSlugs()[0] ?? fallbackChannel;
	return targets.find(({ locale }) => locale === defaultLocale)
		?? targets.find(({ channel }) => channel === defaultChannel)
		?? targets[0]!;
}

function resolvePathSuffix(pathInput: HreflangPathInput, locale: string, fallbackSuffix: string): string {
	if (typeof pathInput === "string") return pathInput;
	return pathInput[locale] ?? pathInput[getDefaultLocaleSlug()] ?? fallbackSuffix;
}

/**
 * hreflang language key for a locale.
 *
 * - Locale×channel pairs configured → BCP 47 region form (`ja-JP`): each alternate is a
 *   language+market URL, so a region-aware code matches Google's guidance.
 * - No pairs (any locale × any channel) → language-only (`ja`): the same language may
 *   exist on multiple markets; claiming `ja-JP` for one channel would over-assert.
 */
function getHreflangLanguageKey(locale: string, regionAware: boolean): string | null {
	const definition = getLocaleDefinition(locale);
	if (!definition) return null;
	return regionAware ? definition.bcp47 : definition.htmlLang;
}

/**
 * hreflang alternates for browse URLs.
 * Pass a single path suffix, or a per-locale map when catalog slugs are translated (ADR 0004).
 * When `NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS` is set, each locale uses its paired channel
 * and hreflang keys are region-aware (`ja-JP`); otherwise keys stay language-only (`ja`).
 * Includes `x-default` pointing at default locale + its channel.
 */
export function buildLocaleHreflangAlternates(
	channel: string,
	pathSuffix: HreflangPathInput,
): Record<string, string> {
	const languages: Record<string, string> = {};
	const fallbackSuffix = typeof pathSuffix === "string" ? pathSuffix : (Object.values(pathSuffix)[0] ?? "");
	const regionAware = getConfiguredLocaleChannelPairs() !== null;
	const targets = getHreflangTargets(channel);
	if (targets.length === 0) return languages;
	const site = brandSiteForChannel(channel);
	const makeUrl = (path: string) => site ? `https://${site.domains[0]}${path}` : path;

	for (const { locale, channel: targetChannel } of targets) {
		const languageKey = getHreflangLanguageKey(locale, regionAware);
		if (!languageKey || languages[languageKey]) continue;
		const suffix = resolvePathSuffix(pathSuffix, locale, fallbackSuffix);
		languages[languageKey] = makeUrl(buildStorefrontPath(locale, targetChannel, suffix));
	}

	const xDefault = getXDefaultTarget(channel, targets);
	const xDefaultSuffix = resolvePathSuffix(pathSuffix, xDefault.locale, fallbackSuffix);
	languages["x-default"] = makeUrl(buildStorefrontPath(xDefault.locale, xDefault.channel, xDefaultSuffix));

	return languages;
}
