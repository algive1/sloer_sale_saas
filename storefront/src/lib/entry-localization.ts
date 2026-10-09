import { getStorefrontLocaleSlugs, isLocaleSlug, type LocaleSlug } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";

export type EntryLocalization = Readonly<{ locale: LocaleSlug; channel: string }>;

export type EntryLocalizationOptions = Readonly<{
  defaultLocale: string;
  defaultChannel: string;
  allowedChannels: readonly string[];
  savedLocale?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
  countryChannelMap?: string | null;
}>;

/** Parse weighted browser preferences without accepting arbitrary URL locale values. */
export function preferredBrowserLocales(header: string | null | undefined): LocaleSlug[] {
  if (!header) return [];
  const choices: Array<{ slug: LocaleSlug; weight: number; order: number }> = [];

  header.slice(0, 1024).split(",").slice(0, 32).forEach((item, order) => {
    const [tag, ...params] = item.trim().split(";");
    if (!tag || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(tag)) return;
    let weight = 1;
    for (const param of params) {
      const trimmed = param.trim();
      if (!/^q\s*=/i.test(trimmed)) continue;
      const match = /^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(trimmed);
      if (!match) return;
      weight = Number(match[1]);
    }
    if (!weight) return;
    const base = tag.toLowerCase().split("-")[0];
    // Browsers may send "no"; the Saleor/Paper slug for Bokmål is "nb".
    const slug = base === "no" ? "nb" : base;
    if (isLocaleSlug(slug)) choices.push({ slug, weight, order });
  });

  choices.sort((a, b) => b.weight - a.weight || a.order - b.order);
  return [...new Set(choices.map((choice) => choice.slug))];
}

/** Optional trusted country input. The reverse proxy MUST strip and overwrite it. */
export function verifiedCountryFromHeader(
  requestHeaders: Pick<Headers, "get">,
  configuredName: string | undefined,
): string | null {
  if (!configuredName || !/^x-[a-z0-9-]{1,60}$/.test(configuredName)) return null;
  const value = requestHeaders.get(configuredName);
  return value && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;
}

/**
 * Map only into a channel already authorized for the verified Host.
 * Multiple brands may have their own DE:channel mappings; nothing here grants access.
 */
export function channelForCountry(
  country: string | null | undefined,
  configuredMap: string | null | undefined,
  allowedChannels: readonly string[],
): string | null {
  if (!country || !/^[a-z]{2}$/i.test(country) || !configuredMap) return null;
  for (const entry of configuredMap.split(",").slice(0, 250)) {
    const match = /^\s*([a-z]{2}):([a-z0-9][a-z0-9_-]{0,63})\s*$/i.exec(entry);
    if (match && match[1].toUpperCase() === country.toUpperCase() &&
        allowedChannels.includes(match[2])) {
      return match[2];
    }
  }
  return null;
}

export function publishedLocalesForChannel(channel: string): readonly LocaleSlug[] {
  const globallyEnabled = getStorefrontLocaleSlugs();
  const matrix = getConfiguredLocaleChannelPairs();
  // A configured matrix with no entry for this Channel means no locales,
  // not "all locales" (getLocalesForChannel conflates these cases).
  return matrix
    ? globallyEnabled.filter((locale) => matrix.some((pair) => pair.channel === channel && pair.locale === locale))
    : globallyEnabled;
}

/**
 * Entry "/" only. Language selection cannot pick a different market merely to get
 * a translation; currency and shipping are determined by the current Saleor Channel.
 */
export function resolveEntryLocalization(input: EntryLocalizationOptions): EntryLocalization | null {
  const channel = channelForCountry(input.country, input.countryChannelMap, input.allowedChannels) ??
    (input.allowedChannels.includes(input.defaultChannel) ? input.defaultChannel : input.allowedChannels[0]);
  if (!channel) return null;

  const available = publishedLocalesForChannel(channel);
  const choices = [
    input.savedLocale,
    ...preferredBrowserLocales(input.acceptLanguage),
    input.defaultLocale,
    ...available,
  ];
  const selected = choices.find((choice) => choice && available.some((locale) => locale === choice));
  return selected && isLocaleSlug(selected) ? { locale: selected, channel } : null;
}

/** Keep explicit /{locale} and legacy /{channel} redirects valid in a locale×channel matrix. */
export function localeForChannel(requested: string, channel: string, fallback: string): LocaleSlug | null {
  const available = publishedLocalesForChannel(channel);
  const selected = [requested, fallback, ...available].find((choice) =>
    available.some((locale) => locale === choice),
  );
  return selected && isLocaleSlug(selected) ? selected : null;
}

/**
 * On explicit /{locale}, preserve the requested locale when it exists on
 * another market of THIS brand. Never choose a channel outside the Host allowlist.
 */
export function channelForExplicitLocale(
  locale: string,
  preferredChannel: string,
  allowedChannels: readonly string[],
): string | null {
  return [preferredChannel, ...allowedChannels].find((channel) =>
    allowedChannels.includes(channel) && publishedLocalesForChannel(channel).some((value) => value === locale),
  ) ?? null;
}
