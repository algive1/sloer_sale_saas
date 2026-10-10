import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import { resolveOpsViewer, type OpsViewer } from "./authorization";

/**
 * Only use inside a dynamic /ops server route after the middleware auth gate.
 * Never derive operator scope from Host, forwarded identity, a query string,
 * a browser-supplied role header or the selected brand in the UI.
 */
export async function currentOpsViewer(): Promise<OpsViewer | null> {
  await connection();
  const requestHeaders = await headers();
  return resolveOpsViewer({
    authorization: requestHeaders.get("authorization"),
    operatorsJson: process.env.OPS_OPERATORS_JSON,
    legacySecret: process.env.ANALYTICS_DASHBOARD_SECRET,
    trustedSiteIds: getBrandSites()?.map((site) => site.id) ?? [],
  });
}
