export function resolveOpsLocale(requested?: string | null, browserLanguages?: readonly string[]): string {
	const language = requested?.trim() || browserLanguages?.find(Boolean) || "en";
	const normalized = language.toLowerCase();
	if (normalized === "zh" || normalized.startsWith("zh-cn") || normalized.startsWith("zh-sg")) {
		return "zh-Hans";
	}
	if (
		normalized.startsWith("zh-hant") ||
		normalized.startsWith("zh-tw") ||
		normalized.startsWith("zh-hk") ||
		normalized.startsWith("zh-mo")
	) {
		return "zh-Hant";
	}
	return language;
}

export type OpsLocale = "en" | "zh";
export const OPS_LOCALE_HEADER = "x-commerce-ops-locale";
export const OPS_LOCALE_COOKIE = "commerce-ops-locale";

/** Ops languages are independent of the shopper market/locale allowlist. */
export function resolveOpsUiLocale(requested?: string | null, acceptLanguage?: string | null): OpsLocale {
	if (requested?.trim()) return requested.toLowerCase().startsWith("zh") ? "zh" : "en";
	const languages = (acceptLanguage ?? "")
		.split(",")
		.map((entry, index) => {
			const [language, ...parameters] = entry.trim().split(";");
			const quality = parameters.find((value) => value.trim().startsWith("q="));
			return { language, weight: quality ? Number(quality.trim().slice(2)) : 1, index };
		})
		.filter(({ language, weight }) => language && Number.isFinite(weight) && weight > 0 && weight <= 1)
		.sort((a, b) => b.weight - a.weight || a.index - b.index);
	return languages[0]?.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
