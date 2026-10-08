import "server-only";
import { io } from "next/cache";
import type { ReactElement } from "react";
import { readTheme, themeDatabaseConfigured } from "./store";

/**
 * Light system plugin entry. Puck stays out of the normal Paper homepage.
 * Never query registry tables or call every plugin on purchase requests.
 */
export async function renderPublishedThemeHomepage(channel: string, locale: string): Promise<ReactElement | null> {
  if (!themeDatabaseConfigured()) return null;

  // Preserve the Next.js 16 Cache Components dynamic I/O boundary.
  await io();

  try {
    const { published } = await readTheme(channel, locale);
    if (!published) return null;
    const { PublishedThemeHomepage } = await import("./render.server");
    return <PublishedThemeHomepage channel={channel} locale={locale} data={published} />;
  } catch (error) {
    // Optional extension downtime never takes the baseline shop offline.
    console.error("[theme-builder] Falling back to Paper homepage", error);
    return null;
  }
}
