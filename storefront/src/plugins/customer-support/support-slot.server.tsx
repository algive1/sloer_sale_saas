import { pluginPauseReason } from "@/plugins/system/runtime.server";
import "server-only";
import { io } from "next/cache";
import { headers } from "next/headers";
import { brandSiteForHost, getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getChatwootBinding, parseChatwootSupportConfig } from "./config";
import { ChatwootLauncher } from "./chatwoot-launcher";
import { parseWhatsAppBindings, whatsappLink } from "./whatsapp-config";

/**
 * A request-scoped optional slot, never a PPR cached component. Trust the Host
 * validated by the storefront reverse proxy, never a browser-supplied siteId.
 * No Saleor API calls, SQL, or Chatwoot calls occur during page rendering.
 */
export async function CustomerSupportSlot({
	params,
}: {
	params: Promise<{ locale: string; channel: string }>;
}) {
	await io();
	if (pluginPauseReason("customer-support")) return null;
	const baseUrl = process.env.SUPPORT_CHATWOOT_BASE_URL;
	const rawSites = process.env.SUPPORT_CHATWOOT_SITES_JSON;
	const rawWhatsApp = process.env.SUPPORT_WHATSAPP_SITES_JSON;
	if (!baseUrl && !rawSites && !rawWhatsApp) return null;

	const { locale, channel } = await params;
	const brands = getBrandSites();
	const site = brands ? brandSiteForHost((await headers()).get("host")) : null;
	if (brands && (!site || !site.channels.includes(channel))) return null;
	const siteId = site?.id ?? siteIdForChannel(channel);
	const expected = brands?.map((item) => item.id) ?? [siteId];
	let launcher: { baseUrl: string; websiteToken: string } | null = null;
	let whatsapp: string | null = null;

	try {
		const config = parseChatwootSupportConfig(
			baseUrl,
			rawSites,
			expected,
			process.env.NODE_ENV !== "production",
		);
		const binding = getChatwootBinding(config, siteId);
		if (binding && config) launcher = { baseUrl: config.baseUrl, websiteToken: binding.websiteToken };
	} catch {
		// Chat is optional: invalid settings cannot break catalog or checkout.
		console.error("[customer-support] Chatwoot disabled due to invalid configuration");
	}
	try {
		const binding = parseWhatsAppBindings(rawWhatsApp, expected).find((item) => item.siteId === siteId);
		if (binding) whatsapp = whatsappLink(binding, locale);
	} catch {
		console.error("[customer-support] WhatsApp disabled due to invalid configuration");
	}
	if (!launcher && !whatsapp) return null;
	return (
		<div
			className="fixed bottom-24 right-4 z-[45] flex flex-col items-end gap-2 sm:bottom-6"
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
		>
			{launcher && (
				<ChatwootLauncher
					key={siteId}
					baseUrl={launcher.baseUrl}
					websiteToken={launcher.websiteToken}
					locale={locale}
					embedded
				/>
			)}
			{whatsapp && (
				<a
					href={whatsapp}
					target="_blank"
					rel="noopener noreferrer"
					referrerPolicy="no-referrer"
					className="flex min-h-11 items-center rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-lg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
				>
					WhatsApp ↗
				</a>
			)}
		</div>
	);
}
