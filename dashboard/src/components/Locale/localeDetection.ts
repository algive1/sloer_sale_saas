/** Resolve the first browser language supported by the dashboard. */
export function getBrowserLocale(
  languages: readonly string[],
  supportedLocales: readonly string[],
): string | undefined {
  const supported = new Map(supportedLocales.map(locale => [locale.toLowerCase(), locale]));

  for (const language of languages) {
    const normalized = language.replaceAll("_", "-").toLowerCase();

    if (normalized === "zh" || normalized.startsWith("zh-cn") || normalized.startsWith("zh-sg")) {
      const simplifiedChinese = supported.get("zh-hans");

      if (simplifiedChinese) return simplifiedChinese;
    }

    if (/^zh-(tw|hk|mo)(-|$)/.test(normalized)) {
      const traditionalChinese = supported.get("zh-hant");

      if (traditionalChinese) return traditionalChinese;
    }

    const exactMatch = supported.get(normalized);

    if (exactMatch) return exactMatch;

    const languageCode = normalized.split("-")[0];
    const languageMatch = supported.get(languageCode);

    if (languageMatch) return languageMatch;

    // Norwegian browsers commonly identify themselves as "no", while the
    // dashboard locale is registered under the official "nb" code.
    if (languageCode === "no") {
      const norwegian = supported.get("nb");

      if (norwegian) return norwegian;
    }
  }

  return undefined;
}

/** Preserve explicit selections while migrating values saved by older builds. */
export function shouldAutoDetectLocale(
  storedMode: string | null,
  storedLocale: string | null,
  defaultLocale: string,
): boolean {
  if (storedMode === "auto") return true;

  if (storedMode === "manual") return false;

  // Older Dashboard versions persisted the configured default even when the
  // operator never opened the language selector. Treat that value as automatic.
  return storedLocale === null || storedLocale === defaultLocale;
}
