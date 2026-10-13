import type { OpsPermissionCode, OpsRole, OpsViewer } from "./authorization";

export type OpsNavigationItem = Readonly<{
  id: string;
  label: string;
  href: `/ops${string}`;
}>;

export type OpsNavigationGroup = Readonly<{
  id: "analytics" | "store" | "customers" | "apps";
  label: string;
  children: readonly OpsNavigationItem[];
}>;

/**
 * Actual existing operations routes. In this service, a brand_analyst may
 * access only the brand list and server-authorized brand detail routes.
 * Never show privileged analytics, editor, support or plugin links to analysts.
 *
 * This controls presentation only: middleware remains the authorization gate.
 */
const PLATFORM_GROUPS: readonly OpsNavigationGroup[] = [
  {
    id: "analytics",
    label: "数据分析",
    children: [
      { id: "overview", label: "经营总览", href: "/ops/analytics" },
      { id: "realtime", label: "实时数据", href: "/ops/analytics/realtime" },
      { id: "traffic", label: "流量分析", href: "/ops/analytics/traffic" },
      { id: "checkout", label: "结账分析", href: "/ops/analytics/checkout" },
      { id: "products", label: "商品分析", href: "/ops/analytics/products" },
      { id: "reminders", label: "智能催付", href: "/ops/analytics/reminders" },
      { id: "destinations", label: "广告投递", href: "/ops/analytics/destinations" },
    ],
  },
  {
    id: "store",
    label: "在线商店",
    children: [
      { id: "sites", label: "品牌站点", href: "/ops/sites" },
      { id: "themes", label: "主题装修", href: "/ops/themes" },
      { id: "product-theme", label: "商品详情页模板", href: "/ops/themes?pageType=product" },
      { id: "translations", label: "AI 多语言", href: "/ops/translations" },
    ],
  },
  {
    id: "customers",
    label: "客户",
    children: [
      { id: "support", label: "会话工作台", href: "/ops/support" },
      { id: "support-settings", label: "客服设置", href: "/ops/support/settings" },
    ],
  },
  {
    id: "apps",
    label: "应用",
    children: [
      { id: "plugins", label: "系统插件", href: "/ops/plugins" },
      { id: "merchant", label: "SEO 与 Merchant", href: "/ops/merchant" },
    ],
  },
];

const ANALYST_GROUPS: readonly OpsNavigationGroup[] = [{
  id: "store",
  label: "在线商店",
  children: [{ id: "sites", label: "授权品牌", href: "/ops/sites" }],
}];

export function opsNavigationForRole(role: OpsRole): readonly OpsNavigationGroup[] {
  return role === "platform_admin" ? PLATFORM_GROUPS : ANALYST_GROUPS;
}

function permissionsForPage(path: string): readonly OpsPermissionCode[] {
  if (path.startsWith("/ops/analytics/destinations")) return ["MANAGE_APPS", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/analytics/reminders")) return ["MANAGE_ORDERS", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/analytics")) return ["MANAGE_ORDERS", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/sites")) return ["MANAGE_ORDERS", "MANAGE_PRODUCTS", "MANAGE_SETTINGS", "MANAGE_PAGES"];
  if (path.startsWith("/ops/themes")) return ["MANAGE_PAGES", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/translations")) return ["MANAGE_TRANSLATIONS"];
  if (path.startsWith("/ops/support/settings")) return ["MANAGE_USERS", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/support")) return ["MANAGE_USERS", "MANAGE_ORDERS"];
  if (path.startsWith("/ops/plugins")) return ["MANAGE_APPS", "MANAGE_SETTINGS"];
  if (path.startsWith("/ops/merchant")) return ["MANAGE_PRODUCTS", "MANAGE_SETTINGS"];
  return [];
}

/** Filter Saleor-authenticated navigation with the same permissions as the request boundary. */
export function opsNavigationForViewer(viewer: OpsViewer): readonly OpsNavigationGroup[] {
  if (viewer.authSource !== "saleor") return opsNavigationForRole(viewer.role);
  if (viewer.restrictedAccessToChannels) return ANALYST_GROUPS;
  return PLATFORM_GROUPS
    .map(group => ({
      ...group,
      children: group.children.filter(item =>
        permissionsForPage(item.href.split("?")[0] ?? "").some(permission => viewer.permissions?.includes(permission)),
      ),
    }))
    .filter(group => group.children.length > 0);
}

/**
 * Only deployment-controlled, secure Dashboard locations may be made visible
 * in Ops. Never use a browser-supplied Host or X-Forwarded-Host for this link.
 * Supports a Dashboard mounted at / or /dashboard/.
 */
export function buildDashboardHref(base: string | undefined): string | null {
  if (!base?.trim()) return null;

  try {
    const url = new URL(base);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*\/?$/.test(url.pathname)) return null;
    return url.origin + url.pathname.replace(/\/?$/, "/");
  } catch {
    return null;
  }
}
