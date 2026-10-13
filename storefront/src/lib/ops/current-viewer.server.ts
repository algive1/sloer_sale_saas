import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import { resolveOpsViewer, type OpsViewer } from "./authorization";
import { OPS_SESSION_COOKIE, opsSessionAuthorization } from "./session";
import { getSaleorOpsSessionSecret, SALEOR_OPS_SESSION_COOKIE, saleorOpsSessionViewer } from "./saleor-session";

/**
 * Use inside a dynamic Ops route or API handler. Handlers outside /ops must
 * explicitly check the returned viewer before reading or changing protected data.
 * Never derive operator scope from Host, forwarded identity, a query string,
 * a browser-supplied role header or the selected brand in the UI.
 */
export async function currentOpsViewer(): Promise<OpsViewer | null> {
	await connection();
	const requestHeaders = await headers();
	const config = {
		operatorsJson: process.env.OPS_OPERATORS_JSON,
		legacySecret: process.env.ANALYTICS_DASHBOARD_SECRET,
		trustedSiteIds: getBrandSites()?.map((site) => site.id) ?? [],
	};
	const saleorViewer = await saleorOpsSessionViewer(
		(await cookies()).get(SALEOR_OPS_SESSION_COOKIE)?.value,
		getSaleorOpsSessionSecret(),
	);
	if (saleorViewer) return saleorViewer;
	const authorization =
		requestHeaders.get("authorization") ??
		(await opsSessionAuthorization((await cookies()).get(OPS_SESSION_COOKIE)?.value, config));
	return resolveOpsViewer({ ...config, authorization });
}
