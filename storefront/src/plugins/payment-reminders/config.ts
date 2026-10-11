import "server-only";
import { getBrandSites } from "@/config/brand-sites";

export const reminderLocales = ["en", "de", "fr", "es", "zh"] as const;
export type ReminderLocale = (typeof reminderLocales)[number];
export type ReminderSite = {
	id: string;
	name: string;
	channels: readonly string[];
	from: string;
	locale: ReminderLocale;
	lookupUrl: string;
	emailReady: boolean;
};
export type ReminderScope = ReminderSite & { apiKey: string };
// Reserved namespace cannot collide with a configured brand id.
export const LEGACY_SCOPE = "legacy:single";

function validFrom(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 200 &&
		!/[\r\n\0]/.test(value) &&
		/^(?:[^<>]+ <[^\s<>@]+@[a-z0-9.-]+>|[^\s<>@]+@[a-z0-9.-]+)$/i.test(value)
	);
}

/** Server deployment configuration only; never accept sender, key or URL from a request. */
export function reminderScopes(): ReminderScope[] {
	const sites = getBrandSites(); // Invalid registry throws; no global fallback.
	if (!sites) {
		const from = process.env.PAYMENT_REMINDER_FROM?.trim() ?? "";
		const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
		let lookupUrl = "";
		try {
			const base = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim() ?? "");
			if (
				base.protocol === "https:" ||
				(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
			) {
				lookupUrl = new URL("/order/find", base).toString();
			}
		} catch {
			/* Missing/invalid deployment URL disables delivery. */
		}
		return [
			{
				id: LEGACY_SCOPE,
				name: "当前站点",
				channels: [],
				from,
				apiKey,
				locale: "en",
				lookupUrl,
				emailReady: Boolean(apiKey && validFrom(from) && lookupUrl),
			},
		];
	}
	const raw = process.env.PAYMENT_REMINDER_SITES_JSON?.trim();
	const configured = new Map<string, { from: string; locale: ReminderLocale }>();
	if (raw) {
		const entries: unknown = JSON.parse(raw);
		if (!Array.isArray(entries)) throw new Error("invalid_reminder_sites");
		for (const entry of entries) {
			if (!entry || typeof entry !== "object") throw new Error("invalid_reminder_sites");
			const r = entry as Record<string, unknown>;
			const site = sites.find((s) => s.id === r.siteId);
			if (
				!site ||
				configured.has(site.id) ||
				!validFrom(r.from) ||
				!reminderLocales.includes(r.locale as ReminderLocale)
			)
				throw new Error("invalid_reminder_sites");
			const emailDomain = r.from.replace(/>$/, "").split("@").at(-1)!.toLowerCase();
			if (!site.domains.some((domain) => emailDomain === domain || emailDomain.endsWith("." + domain))) {
				throw new Error("sender_domain_does_not_belong_to_brand");
			}
			configured.set(site.id, { from: r.from, locale: r.locale as ReminderLocale });
		}
	}
	const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
	return sites.map((site) => {
		const config = configured.get(site.id);
		return {
			id: site.id,
			name: site.name,
			channels: site.channels,
			from: config?.from ?? "",
			locale: config?.locale ?? "en",
			lookupUrl: `https://${site.domains[0]}/order/find`,
			apiKey,
			emailReady: Boolean(config && apiKey),
		};
	});
}

/** Explicit brand selection is mandatory for rule reads/writes in multi-brand mode. */
export function reminderScope(siteId?: string): ReminderScope {
	const scopes = reminderScopes();
	if (scopes[0]?.id === LEGACY_SCOPE && siteId === undefined) return scopes[0];
	const scope = scopes.find((s) => s.id === siteId);
	if (!scope) throw new Error(siteId ? "invalid_reminder_site" : "reminder_site_required");
	return scope;
}

/** Safe to serialize to the operator UI. */
export function getReminderSites(): ReminderSite[] {
	return reminderScopes().map((s) => ({
		id: s.id,
		name: s.name,
		channels: s.channels,
		from: s.from,
		locale: s.locale,
		lookupUrl: s.lookupUrl,
		emailReady: s.emailReady,
	}));
}
