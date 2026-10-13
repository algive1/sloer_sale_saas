import { brandSiteForHost } from "@/config/brand-sites";
import { isAllowedRedirectUrl } from "@/lib/auth/validate-redirect-url";

/** Standalone Next.js may use its container hostname in request.url.
 * Accept the browser Host only when deployment configuration owns its origin. */
export function opsPublicRequestUrl(requestUrl: string, host: string | null): URL | null {
	const url = new URL(requestUrl);
	const publicBase = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL || requestUrl);
	const browserHost = host || url.host;
	if (/[\s/@?#\\,]/.test(browserHost)) return null;
	url.protocol = publicBase.protocol;
	url.host = browserHost;
	if (url.host !== browserHost.toLowerCase()) return null;
	return isAllowedRedirectUrl(url.origin) || brandSiteForHost(url.host) ? url : null;
}
