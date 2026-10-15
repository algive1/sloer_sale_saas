import { PermissionEnum } from "@dashboard/graphql";

/**
 * System-level Commerce Ops navigation registry.
 *
 * Add an entry here when its actual /ops page exists and has its own
 * authorization. No new upstream Saleor menu component is needed.
 * Visibility in Dashboard is merely a convenience, never authorization.
 */
export type CommerceOpsSection =
  | "orders"
  | "customers"
  | "analytics"
  | "store"
  | "apps"
  | "settings";

export const COMMERCE_OPS_SETTINGS_PERMISSIONS: PermissionEnum[] = [
  PermissionEnum.MANAGE_ORDERS,
  PermissionEnum.MANAGE_PRODUCTS,
  PermissionEnum.MANAGE_SETTINGS,
  PermissionEnum.MANAGE_PAGES,
  PermissionEnum.MANAGE_TRANSLATIONS,
  PermissionEnum.MANAGE_APPS,
  PermissionEnum.MANAGE_USERS,
];

interface CommerceOpsEntry {
  id: string;
  section: CommerceOpsSection;
  zh: string;
  en: string;
  path: `/ops${string}`;
  permissions: PermissionEnum[];
}

export const commerceOpsNavigation: readonly CommerceOpsEntry[] = [
  {
    id: "commerce-configuration",
    section: "settings",
    zh: "运营配置中心",
    en: "Operations configuration",
    path: "/ops/settings",
    permissions: COMMERCE_OPS_SETTINGS_PERMISSIONS,
  },
  {
    id: "commerce-payment-reminders",
    section: "orders",
    zh: "智能催付",
    en: "Payment reminders",
    path: "/ops/analytics/reminders",
    permissions: [PermissionEnum.MANAGE_ORDERS],
  },
  {
    id: "commerce-support",
    section: "customers",
    zh: "会话工作台",
    en: "Live conversations",
    path: "/ops/support",
    permissions: [PermissionEnum.MANAGE_USERS, PermissionEnum.MANAGE_ORDERS],
  },
  {
    id: "commerce-support-settings",
    section: "customers",
    zh: "Chatwoot 设置",
    en: "Chatwoot settings",
    path: "/ops/support/settings",
    permissions: [PermissionEnum.MANAGE_USERS, PermissionEnum.MANAGE_ORDERS],
  },
  {
    id: "commerce-analytics-overview",
    section: "analytics",
    zh: "经营总览",
    en: "Overview",
    path: "/ops/analytics",
    permissions: [],
  },
  {
    id: "commerce-analytics-realtime",
    section: "analytics",
    zh: "实时数据",
    en: "Realtime",
    path: "/ops/analytics/realtime",
    permissions: [],
  },
  {
    id: "commerce-analytics-traffic",
    section: "analytics",
    zh: "流量分析",
    en: "Traffic analytics",
    path: "/ops/analytics/traffic",
    permissions: [],
  },
  {
    id: "commerce-analytics-checkout",
    section: "analytics",
    zh: "结账分析",
    en: "Checkout analytics",
    path: "/ops/analytics/checkout",
    permissions: [],
  },
  {
    id: "commerce-analytics-products",
    section: "analytics",
    zh: "商品分析",
    en: "Product analytics",
    path: "/ops/analytics/products",
    permissions: [],
  },
  {
    id: "commerce-brand-sites",
    section: "store",
    zh: "品牌站点",
    en: "Brand sites",
    path: "/ops/sites",
    permissions: [PermissionEnum.MANAGE_PAGES],
  },
  {
    id: "commerce-theme-builder",
    section: "store",
    zh: "主题装修",
    en: "Theme editor",
    path: "/ops/themes",
    permissions: [PermissionEnum.MANAGE_PAGES],
  },
  {
    id: "commerce-product-theme",
    section: "store",
    zh: "商品详情页模板",
    en: "Product detail template",
    path: "/ops/themes?pageType=product",
    permissions: [PermissionEnum.MANAGE_PAGES],
  },
  {
    id: "commerce-ai-translations",
    section: "store",
    zh: "AI 多语言",
    en: "AI translations",
    path: "/ops/translations",
    permissions: [PermissionEnum.MANAGE_TRANSLATIONS],
  },
  {
    id: "commerce-ads-tracking",
    section: "apps",
    zh: "广告投递",
    en: "Ad delivery",
    path: "/ops/analytics/destinations",
    permissions: [PermissionEnum.MANAGE_APPS, PermissionEnum.MANAGE_SETTINGS],
  },
  {
    id: "commerce-merchant-feed",
    section: "apps",
    zh: "SEO 与 Merchant Feed",
    en: "SEO and Merchant Feed",
    path: "/ops/merchant",
    permissions: [PermissionEnum.MANAGE_PRODUCTS, PermissionEnum.MANAGE_SETTINGS],
  },
];
