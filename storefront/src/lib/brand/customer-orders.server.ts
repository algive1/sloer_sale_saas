import "server-only";
import { headers } from "next/headers";
import type { CustomerOrderWhereInput } from "@/gql/graphql";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { getCachedChannelsList } from "@/lib/channels/get-channels-data";

/**
 * Resolve the current brand's Saleor channel IDs using server-owned config.
 * The visitor never gets to supply an order filter.
 *
 * Null means the mapping could not be verified and the caller must fail closed,
 * not retry an unscoped query.
 */
export async function currentBrandOrderFilter(): Promise<CustomerOrderWhereInput | null> {
  if (!brandSitesConfigured()) return null;
  const site = brandSiteForHost((await headers()).get("host"));
  if (!site) return null;
  const all = await getCachedChannelsList();
  if (!all?.channels) return null;

  const ids = all.channels
    .filter((channel) => site.channels.includes(channel.slug))
    .map((channel) => channel.id);
  if (ids.length !== site.channels.length) return null;
  return { channelId: { oneOf: ids } };
}

export function orderFilterForNumber(
  filter: CustomerOrderWhereInput,
  number: number,
): CustomerOrderWhereInput {
  return { AND: [filter, { number: { eq: number } }] };
}
