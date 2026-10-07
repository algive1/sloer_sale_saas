import type { OriginConsent } from "@/lib/commerce-context/keys";

export const ANALYTICS_CONSENT_EVENT = "paper:analytics-consent";

/**
 * Analytics consent mode.
 *
 * `required` (default) — storage-derived analytics and first-touch storage stay
 * off until the shopper explicitly decides.
 *
 * `implied` — analytics storage may run without a stored choice. Advertising
 * storage is deliberately stricter and still requires an explicit grant.
 */
export type AnalyticsConsentMode = "required" | "implied";
export type AnalyticsConsentChoice = "granted" | "denied";

export function analyticsConsentMode(
	raw = process.env.NEXT_PUBLIC_ANALYTICS_CONSENT_MODE,
): AnalyticsConsentMode {
	const value = raw?.trim().toLowerCase();
	if (!value || value === "required") return "required";
	if (value === "implied") return "implied";

	console.warn(
		`[analytics] Ignoring invalid NEXT_PUBLIC_ANALYTICS_CONSENT_MODE="${raw}". Expected required or implied.`,
	);
	return "required";
}

/** True when first-touch storage and the analytics merchant tag may run. */
export function analyticsStorageAllowed(
	choice: AnalyticsConsentChoice | null,
	mode: AnalyticsConsentMode = analyticsConsentMode(),
): boolean {
	if (choice === "denied") return false;
	if (choice === "granted") return true;
	return mode === "implied";
}

/** Advertising tags/API calls always require an explicit shopper grant. */
export function adsStorageAllowed(choice: AnalyticsConsentChoice | null): boolean {
	return choice === "granted";
}

/**
 * Commerce Context `origin.consent` for the current visitor. Always a known
 * enum — never omit the field on checkoutCreate.
 */
export function resolveOriginConsent(
	choice: AnalyticsConsentChoice | null,
	mode: AnalyticsConsentMode = analyticsConsentMode(),
): OriginConsent {
	if (choice === "granted") return "granted";
	if (choice === "denied") return "denied";
	return mode === "implied" ? "not_required" : "unknown";
}
