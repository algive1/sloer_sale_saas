import "server-only";
import { headers } from "next/headers";
import { brandSitesConfigured, channelBelongsToHost } from "@/config/brand-sites";

/** Request Host comes from the trusted reverse proxy, never user-supplied site_id. */
export async function isChannelAllowedForCurrentHost(channel: string): Promise<boolean> {
  if (!brandSitesConfigured()) return true;
  const host = (await headers()).get("host");
  return channelBelongsToHost(channel, host);
}

export async function requireChannelForCurrentHost(channel: string): Promise<void> {
  if (!(await isChannelAllowedForCurrentHost(channel))) {
    throw new Error("Channel is not available for the current storefront");
  }
}
