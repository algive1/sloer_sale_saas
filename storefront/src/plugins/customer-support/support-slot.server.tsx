import "server-only";
import { headers } from "next/headers";
import { brandSiteForHost, getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getChatwootBinding, parseChatwootSupportConfig } from "./config";
import { ChatwootLauncher } from "./chatwoot-launcher";

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
	const baseUrl = process.env.SUPPORT_CHATWOOT_BASE_URL;
	const rawSites = process.env.SUPPORT_CHATWOOT_SITES_JSON;
	if (!baseUrl && !rawSites) return null;

	let launcher: { siteId: string; baseUrl: string; websiteToken: string; locale: string };
	try {
		const { locale, channel } = await params;
		const brands = getBrandSites();
		const site = brands ? brandSiteForHost((await headers()).get("host")) : null;
		if (brands && (!site || !site.channels.includes(channel))) return null;

		const siteId = site?.id ?? siteIdForChannel(channel);
		const config = parseChatwootSupportConfig(
			baseUrl,
			rawSites,
			brands?.map((item) => item.id) ?? [siteId],
			process.env.NODE_ENV !== "production",
		);
		const binding = getChatwootBinding(config, siteId);
		if (!binding || !config) return null;
		launcher = { siteId, baseUrl: config.baseUrl, websiteToken: binding.websiteToken, locale };
	} catch (error) {
		// Chat is optional: invalid settings cannot break catalog or checkout.
		console.error("[customer-support] widget disabled due to invalid configuration", error);
		return null;
	}
	return (
		<ChatwootLauncher
			key={launcher.siteId}
			baseUrl={launcher.baseUrl}
			websiteToken={launcher.websiteToken}
			locale={launcher.locale}
		/>
	);
}
