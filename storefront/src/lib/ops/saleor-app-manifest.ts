import type { AppManifest, AppPermission } from "@saleor/app-sdk/types";
import { SALEOR_OPS_APP_LINKS } from "./saleor-app-navigation";

type CommerceOpsManifest = AppManifest & { configurationUrl: string };

const appPermissions = [
	...new Set<AppPermission>(SALEOR_OPS_APP_LINKS.flatMap((operation) => operation.permissions)),
];

/** Use a deployment-owned Dashboard origin; never build an app URL from Host. */
export function getSaleorOpsAppOrigin(): string | null {
	const configured =
		process.env.SALEOR_OPS_APP_PUBLIC_URL?.trim() || process.env.SALEOR_DASHBOARD_URL?.trim();
	if (!configured) return null;

	try {
		const url = new URL(configured);
		const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		if (
			(url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash
		) {
			return null;
		}
		return url.origin;
	} catch {
		return null;
	}
}

export function createCommerceOpsManifest(origin = getSaleorOpsAppOrigin()): CommerceOpsManifest {
	if (!origin) throw new Error("SALEOR_OPS_APP_PUBLIC_URL or SALEOR_DASHBOARD_URL must be configured");
	const normalizedOrigin = new URL(origin).origin;
	const appUrl = `${normalizedOrigin}/commerce-admin`;

	return {
		id: "sloer.commerce-operations",
		name: "SLOER 运营管理",
		version: "1.0.0",
		author: "SLOER",
		about: "统一管理系统级运营模块，并复用当前 Saleor 员工会话与权限。",
		requiredSaleorVersion: ">=3.22",
		appUrl,
		configurationUrl: `${appUrl}/configuration`,
		permissions: appPermissions,
		extensions: SALEOR_OPS_APP_LINKS.map((operation) => ({
			label: operation.label,
			mount: operation.mount,
			target: "APP_PAGE" as const,
			url: `/app?path=${encodeURIComponent(operation.path)}`,
			permissions: [...operation.permissions],
		})),
	};
}
