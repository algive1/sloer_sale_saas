import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isStorefrontLocaleSlug } from "@/config/locale";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { activeThemeSiteId, readTheme, saveTheme, themeDatabaseConfigured } from "@/lib/theme-builder/store";
import { ThemeValidationError } from "@/lib/theme-builder/validate";

// This handler reads request data directly; Cache Components does not need route-level dynamic config.
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function validScope(channel: string, locale: string): Promise<boolean> {
  return isStorefrontLocaleSlug(locale) &&
    isAllowedStorefrontChannel(channel, await getStorefrontChannelSlugs());
}

function respond(body: object, status = 200) {
  return Response.json(body, { status, headers });
}

/**
 * All /ops/* routes, including this endpoint, are protected by the existing
 * Basic Auth middleware. Keep the route under /ops: /api/* bypasses that guard.
 */
export async function GET(request: NextRequest) {
  if (!themeDatabaseConfigured()) return respond({error:"Configure analytics libSQL or dedicated THEME_LIBSQL_URL / THEME_LIBSQL_AUTH_TOKEN"}, 503);
  const channel = request.nextUrl.searchParams.get("channel") || "";
  const locale = request.nextUrl.searchParams.get("locale") || "";
  if (!(await validScope(channel, locale))) return respond({error:"Unknown store channel or locale"}, 400);
  try {
    return respond({siteId:activeThemeSiteId(),channel,locale,...await readTheme(channel,locale)});
  } catch (error) {
    console.error("[theme-editor] Failed to read theme", error);
    return respond({error:"Theme storage unavailable"}, 503);
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== request.nextUrl.origin || (fetchSite && fetchSite !== "same-origin")) {
    return respond({error:"Cross-origin changes are not permitted"}, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return respond({error:"JSON content required"}, 415);
  }
  if (!themeDatabaseConfigured()) return respond({error:"Theme storage is not configured"},503);
  try {
    const raw = await request.text();
    if (raw.length > 150_000) return respond({error:"Payload exceeds size limit"},413);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return respond({error:"Invalid request"},400);
    const body = input as Record<string,unknown>;
    const channel = typeof body.channel === "string" ? body.channel : "";
    const locale = typeof body.locale === "string" ? body.locale : "";
    if (!(await validScope(channel, locale))) return respond({error:"Unknown channel or locale"},400);
    if (body.action !== "draft" && body.action !== "publish") return respond({error:"Invalid action"},400);
    await saveTheme(channel, locale, body.data, body.action === "publish");
    if (body.action === "publish") {
      revalidatePath(buildStorefrontPath(locale,channel));
    }
    return respond({ok:true,action:body.action});
  } catch (error) {
    if (error instanceof ThemeValidationError || error instanceof SyntaxError) {
      return respond({error:error.message},400);
    }
    console.error("[theme-editor] Failed to save theme", error);
    return respond({error:"Theme storage unavailable"},503);
  }
}
