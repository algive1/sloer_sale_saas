import type { AppPermission } from "@saleor/app-sdk/types";

export const SALEOR_OPS_APP_LINKS = [
	{
		label: "经营分析",
		mount: "NAVIGATION_ORDERS",
		path: "/ops/analytics",
		permissions: ["MANAGE_ORDERS", "MANAGE_SETTINGS"],
	},
	{
		label: "广告投递",
		mount: "NAVIGATION_ORDERS",
		path: "/ops/analytics/destinations",
		permissions: ["MANAGE_SETTINGS"],
	},
	{
		label: "支付催付",
		mount: "NAVIGATION_ORDERS",
		path: "/ops/analytics/reminders",
		permissions: ["MANAGE_ORDERS", "MANAGE_SETTINGS"],
	},
	{
		label: "在线客服",
		mount: "NAVIGATION_CUSTOMERS",
		path: "/ops/support",
		permissions: ["MANAGE_USERS", "MANAGE_ORDERS"],
	},
	{
		label: "主题装修",
		mount: "NAVIGATION_PAGES",
		path: "/ops/themes",
		permissions: ["MANAGE_PAGES", "MANAGE_SETTINGS"],
	},
	{
		label: "AI 多语言",
		mount: "NAVIGATION_TRANSLATIONS",
		path: "/ops/translations",
		permissions: ["MANAGE_TRANSLATIONS"],
	},
	{
		label: "SEO 与 Google Merchant",
		mount: "NAVIGATION_CATALOG",
		path: "/ops/merchant",
		permissions: ["MANAGE_PRODUCTS", "MANAGE_SETTINGS"],
	},
] as const satisfies readonly {
	label: string;
	mount:
		| "NAVIGATION_CATALOG"
		| "NAVIGATION_ORDERS"
		| "NAVIGATION_CUSTOMERS"
		| "NAVIGATION_TRANSLATIONS"
		| "NAVIGATION_PAGES";
	path: `/ops/${string}`;
	permissions: readonly AppPermission[];
}[];

export type SaleorOpsAppPath =
	| (typeof SALEOR_OPS_APP_LINKS)[number]["path"]
	| "/ops/plugins"
	| "/ops/settings";
const allowedPaths: ReadonlySet<string> = new Set([
	...SALEOR_OPS_APP_LINKS.map((link) => link.path),
	"/ops/plugins",
	"/ops/settings",
]);

export function isSaleorOpsAppPath(path: string | null): path is SaleorOpsAppPath {
	return path !== null && allowedPaths.has(path);
}
