import { brandSiteForHost } from "@/config/brand-sites";
import { isAllowedRedirectUrl } from "@/lib/auth/validate-redirect-url";

/** Standalone Next.js may use its container hostname in request.url.
 * Accept the browser Host only when deployment configuration owns its origin. */
export function opsPublicRequestUrl(requestUrl: string, host: string | null): URL | null {
	const url = new URL(requestUrl);
	const publicBase = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL || requestUrl);
	const browserHost = host || url.host;
	if (/[\s/@?#\\,]/.test(browserHost)) return null;
	const dashboardBase = process.env.SALEOR_DASHBOARD_URL;
	if (dashboardBase) {
		try {
			const dashboard = new URL(dashboardBase);
			const localDashboard = ["localhost", "127.0.0.1", "[::1]"].includes(dashboard.hostname);
			if ((dashboard.protocol !== "https:" && !(dashboard.protocol === "http:" && localDashboard)) ||
				dashboard.username || dashboard.password || dashboard.search || dashboard.hash) return null;
			if (dashboard.host.toLowerCase() === browserHost.toLowerCase()) {
				url.protocol = dashboard.protocol;
				url.hostname = dashboard.hostname;
				url.port = dashboard.port;
				return url;
			}
		} catch {
			return null;
		}
	}
	url.protocol = publicBase.protocol;
	url.host = browserHost;
	if (url.host !== browserHost.toLowerCase()) return null;
	return isAllowedRedirectUrl(url.origin) || brandSiteForHost(url.host) ? url : null;
}
