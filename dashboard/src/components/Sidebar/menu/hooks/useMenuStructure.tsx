import { useUser } from "@dashboard/auth/useUser";
import { channelsListUrl } from "@dashboard/channels/urls";
import { categoryListUrl } from "@dashboard/categories/urls";
import { collectionListUrl } from "@dashboard/collections/urls";
import { navigationLucideIconProps } from "@dashboard/components/icons";
import { useAnalytics } from "@dashboard/components/ProductAnalytics/useAnalytics";
import { configurationMenuUrl } from "@dashboard/configuration/urls";
import { getConfigMenuItemsPermissions } from "@dashboard/configuration/utils";
import { rippleNewCustomersView } from "@dashboard/customers/ripples/newCustomersView";
import { customerListUrl } from "@dashboard/customers/urls";
import { customerTypeListUrl } from "@dashboard/customerTypes/urls";
import { saleListUrl, voucherListUrl } from "@dashboard/discounts/urls";
import { SidebarAppAlert } from "@dashboard/extensions/components/AppAlerts/SidebarAppAlert";
import { useAppsAlert } from "@dashboard/extensions/components/AppAlerts/useAppsAlert";
import { extensionMountPoints } from "@dashboard/extensions/extensionMountPoints";
import { useExtensions } from "@dashboard/extensions/hooks/useExtensions";
import { useExtensionPreferences } from "@dashboard/extensions/preferences/useExtensionPreferences";
import {
  extensionsAppSection,
  extensionsCustomSection,
  ExtensionsPaths,
  extensionsPluginSection,
} from "@dashboard/extensions/urls";
import { giftCardListUrl } from "@dashboard/giftCards/urls";
import { PermissionEnum } from "@dashboard/graphql";
import { HOMEPAGE_WIDGETS_MOUNT } from "@dashboard/home/filterHomeExtensions";
import { getPinnedHomeWidgetMenuItems } from "@dashboard/home/pinnedHomeWidgetMenuItems";
import { rippleHomeWidgets } from "@dashboard/home/ripples/homeWidgets";
import { ConfigurationIcon } from "@dashboard/icons/Configuration";
import { CustomersIcon } from "@dashboard/icons/Customers";
import { DiscountsIcon } from "@dashboard/icons/Discounts";
import { HomeIcon } from "@dashboard/icons/Home";
import { MarketplaceIcon } from "@dashboard/icons/Marketplace";
import { ModelingIcon } from "@dashboard/icons/Modeling";
import { OrdersIcon } from "@dashboard/icons/Orders";
import { ProductsIcon } from "@dashboard/icons/Products";
import { TranslationsIcon } from "@dashboard/icons/Translations";
import { commonMessages, sectionNames } from "@dashboard/intl";
import { pageListPath } from "@dashboard/modeling/urls";
import { pageTypeListUrl } from "@dashboard/modelTypes/urls";
import { messages as navigationPinMessages } from "@dashboard/navigationPins/constants";
import { useResolvedNavigationPins } from "@dashboard/navigationPins/hooks/useResolvedNavigationPins";
import { injectNavigationPins } from "@dashboard/navigationPins/injectNavigationPins";
import { orderDraftListUrl, orderListUrl, orderSettingsPath } from "@dashboard/orders/urls";
import { permissionGroupListUrl } from "@dashboard/permissionGroups/urls";
import { shippingZonesListUrl } from "@dashboard/shipping/urls";
import { siteSettingsUrl } from "@dashboard/siteSettings/urls";
import { staffListUrl } from "@dashboard/staff/urls";
import { taxConfigurationListUrl } from "@dashboard/taxes/urls";
import { productListUrl } from "@dashboard/products/urls";
import { productTypeListUrl } from "@dashboard/productTypes/urls";
import { Ripple } from "@dashboard/ripples/components/Ripple";
import { SearchShortcut } from "@dashboard/search/SearchShortcut";
import { menuListUrl } from "@dashboard/structures/urls";
import { languageListUrl } from "@dashboard/translations/urls";
import { Box, Text } from "@saleor/macaw-ui-next";
import isEmpty from "lodash/isEmpty";
import { ChartNoAxesCombined, Globe2, Search, Star } from "lucide-react";
import { useIntl } from "react-intl";

import { SidebarIconSlot } from "../../SidebarIconSlot";
import { createOpsHref } from "../commerceOpsLinks";
import { createSettingsSubmenuItem } from "../settingsSubmenuItem";
import { type SidebarMenuItem } from "../types";
import { mapToExtensionsItems } from "../utils";
import { useCustomerTypeMenuItems } from "./useCustomerTypeMenuItems";

export function useMenuStructure() {
  const { handleAppsListItemClick, hasProblems } = useAppsAlert();
  const { trackEvent } = useAnalytics();

  const extensions = useExtensions(extensionMountPoints.NAVIGATION_SIDEBAR);
  const intl = useIntl();
  const { user } = useUser();
  const navigationPins = useResolvedNavigationPins();
  const homeExtensions = useExtensions(HOMEPAGE_WIDGETS_MOUNT).HOMEPAGE_WIDGETS;
  const { getState } = useExtensionPreferences();
  const pinnedHomeWidgets = getPinnedHomeWidgetMenuItems(
    homeExtensions,
    user?.userPermissions ?? [],
    getState,
  ).map(item => ({
    ...item,
    onClick: () => {
      const extension = homeExtensions.find(candidate => `home-widget-${candidate.id}` === item.id);

      trackEvent("home_widget_opened", {
        extension_origin:
          extension === undefined
            ? undefined
            : extension.isSaleorOfficial
              ? "saleor"
              : "third_party",
        source: "sidebar",
        widget_kind: "fullscreen",
      });
    },
  }));
  const customerTypeMenuItems = useCustomerTypeMenuItems();

  const appExtensionsHeaderItem: SidebarMenuItem = {
    id: "extensions",
    label: intl.formatMessage(sectionNames.appExtensions),
    type: "divider",
    paddingY: 1.5,
  };

  const getExtensionsSection = (): SidebarMenuItem => ({
    icon: renderIcon(<MarketplaceIcon />),
    label: intl.formatMessage(sectionNames.extensions),
    permissions: [],
    id: "installed-extensions",
    url: ExtensionsPaths.installedExtensions,
    type: "itemGroup",
    endAdornment: <SidebarAppAlert hasNewFailedAttempts={hasProblems} />,
    onClick: () => handleAppsListItemClick(new Date().toISOString()),
    children: [
      {
        label: (
          <Box display="flex" alignItems="center" gap={3}>
            <Text size={3} fontWeight="medium">
              {intl.formatMessage(sectionNames.installedExtensions)}
            </Text>
            <SidebarAppAlert hasNewFailedAttempts={hasProblems} small />
          </Box>
        ),
        id: "installed-extensions",
        url: ExtensionsPaths.installedExtensions,
        matchUrls: [
          ExtensionsPaths.installedExtensions,
          extensionsCustomSection,
          extensionsAppSection,
          extensionsPluginSection,
        ],
        permissions: [],
        type: "item",
      },
      {
        label: intl.formatMessage(sectionNames.exploreExtensions),
        id: "explore-extensions",
        url: ExtensionsPaths.exploreExtensions,
        permissions: [],
        type: "item" as const,
      },
    ],
  });

  const originalMenuItems: SidebarMenuItem[] = [
    {
      icon: renderIcon(<HomeIcon />),
      label: intl.formatMessage(sectionNames.home),
      id: "home",
      url: "/home",
      type: pinnedHomeWidgets.length > 0 ? "itemGroup" : "item",
      children: pinnedHomeWidgets.length > 0 ? pinnedHomeWidgets : undefined,
      // A pinned widget hidden behind a collapsed group defeats the point of pinning.
      defaultExpanded: true,
      endAdornment: <Ripple model={rippleHomeWidgets} />,
    },
    {
      icon: renderIcon(<Search {...navigationLucideIconProps} />),
      label: (
        <Box display="flex" alignItems="center" gap={2}>
          <Text size={3} fontWeight="medium">
            {intl.formatMessage(sectionNames.search)}
          </Text>
          <SearchShortcut />
        </Box>
      ),
      id: "search",
      url: "/search",
      permissions: [
        PermissionEnum.MANAGE_PRODUCTS,
        PermissionEnum.MANAGE_PAGES,
        PermissionEnum.MANAGE_PAGE_TYPES_AND_ATTRIBUTES,
        PermissionEnum.MANAGE_ORDERS,
      ],
      type: "item",
    },
    {
      children: [
        {
          label: intl.formatMessage(sectionNames.products),
          id: "products",
          url: productListUrl(),
          permissions: [PermissionEnum.MANAGE_PRODUCTS],
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.categories),
          id: "categories",
          url: categoryListUrl(),
          permissions: [PermissionEnum.MANAGE_PRODUCTS],
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.collections),
          id: "collections",
          url: collectionListUrl(),
          permissions: [PermissionEnum.MANAGE_PRODUCTS],
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.giftCards),
          id: "giftCards",
          url: giftCardListUrl(),
          permissions: [PermissionEnum.MANAGE_GIFT_CARD],
          type: "item",
        },
        ...mapToExtensionsItems(extensions.NAVIGATION_CATALOG, appExtensionsHeaderItem),
        createSettingsSubmenuItem({
          id: "product-types",
          label: intl.formatMessage(sectionNames.productTypes),
          url: productTypeListUrl(),
          permissions: [PermissionEnum.MANAGE_PRODUCT_TYPES_AND_ATTRIBUTES],
        }),
      ],
      icon: renderIcon(<ProductsIcon />),
      url: productListUrl(),
      label: intl.formatMessage(sectionNames.catalog),
      permissions: [
        PermissionEnum.MANAGE_GIFT_CARD,
        PermissionEnum.MANAGE_PRODUCTS,
        PermissionEnum.MANAGE_PRODUCT_TYPES_AND_ATTRIBUTES,
      ],
      id: "products",
      type: "itemGroup",
    },
    {
      children: [
        {
          label: intl.formatMessage(sectionNames.orders),
          permissions: [PermissionEnum.MANAGE_ORDERS],
          id: "orders",
          url: orderListUrl(),
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.draftOrders),
          permissions: [PermissionEnum.MANAGE_ORDERS],
          id: "order-drafts",
          url: orderDraftListUrl(),
          type: "item",
        },
        ...mapToExtensionsItems(extensions.NAVIGATION_ORDERS, appExtensionsHeaderItem),
      ],
      icon: renderIcon(<OrdersIcon />),
      label: intl.formatMessage(sectionNames.fulfillment),
      permissions: [PermissionEnum.MANAGE_ORDERS],
      id: "orders",
      url: orderListUrl(),
      type: "itemGroup",
    },
    {
      children: [
        ...customerTypeMenuItems,
        ...mapToExtensionsItems(extensions.NAVIGATION_CUSTOMERS, appExtensionsHeaderItem),
        createSettingsSubmenuItem({
          id: "customer-types",
          label: intl.formatMessage(sectionNames.customerTypes),
          url: customerTypeListUrl(),
          permissions: [PermissionEnum.MANAGE_CUSTOMER_TYPES_AND_ATTRIBUTES],
        }),
      ],
      icon: renderIcon(<CustomersIcon />),
      label: intl.formatMessage(sectionNames.customers),
      // Sidebar gating uses any-of matching, so users with only MANAGE_ORDERS
      // or MANAGE_STAFF can navigate to customer pages in read-only mode while
      // edit affordances remain hidden inside the section itself.
      permissions: [
        PermissionEnum.MANAGE_USERS,
        PermissionEnum.MANAGE_ORDERS,
        PermissionEnum.MANAGE_STAFF,
        PermissionEnum.MANAGE_CUSTOMER_TYPES_AND_ATTRIBUTES,
      ],
      endAdornment: <Ripple model={rippleNewCustomersView} />,
      id: "customers",
      url: customerListUrl(),
      type: "itemGroup",
    },
    {
      children: [
        {
          label: intl.formatMessage(sectionNames.promotions),
          id: "promotions",
          url: saleListUrl(),
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.vouchers),
          id: "vouchers",
          url: voucherListUrl(),
          type: "item",
        },
        ...mapToExtensionsItems(extensions.NAVIGATION_DISCOUNTS, appExtensionsHeaderItem),
      ],
      icon: renderIcon(<DiscountsIcon />),
      label: intl.formatMessage(commonMessages.discounts),
      permissions: [PermissionEnum.MANAGE_DISCOUNTS],
      url: saleListUrl(),
      id: "discounts",
      type: "itemGroup",
    },
    {
      children: [
        {
          label: intl.formatMessage(sectionNames.models),
          id: "models",
          url: pageListPath,
          permissions: [PermissionEnum.MANAGE_PAGES],
          type: "item",
        },
        {
          label: intl.formatMessage(sectionNames.structures),
          id: "structures",
          url: menuListUrl(),
          permissions: [PermissionEnum.MANAGE_MENUS],
          type: "item",
        },
        ...mapToExtensionsItems(extensions.NAVIGATION_PAGES, appExtensionsHeaderItem),
        createSettingsSubmenuItem({
          id: "model-types",
          label: intl.formatMessage(sectionNames.modelTypes),
          url: pageTypeListUrl(),
          permissions: [PermissionEnum.MANAGE_PAGE_TYPES_AND_ATTRIBUTES],
        }),
      ],
      icon: renderIcon(<ModelingIcon />),
      label: intl.formatMessage(sectionNames.modeling),
      permissions: [
        PermissionEnum.MANAGE_PAGES,
        PermissionEnum.MANAGE_MENUS,
        PermissionEnum.MANAGE_PAGE_TYPES_AND_ATTRIBUTES,
      ],
      id: "modeling",
      url: pageListPath,
      type: "itemGroup",
    },
    {
      children: !isEmpty(extensions.NAVIGATION_TRANSLATIONS)
        ? [...mapToExtensionsItems(extensions.NAVIGATION_TRANSLATIONS, appExtensionsHeaderItem)]
        : undefined,
      icon: renderIcon(<TranslationsIcon />),
      label: intl.formatMessage(sectionNames.translations),
      permissions: [PermissionEnum.MANAGE_TRANSLATIONS],
      id: "translations",
      url: languageListUrl,
      type: !isEmpty(extensions.NAVIGATION_TRANSLATIONS) ? "itemGroup" : "item",
    },
    getExtensionsSection(),
    {
      icon: renderIcon(<ConfigurationIcon />),
      label: intl.formatMessage(sectionNames.configuration),
      permissions: getConfigMenuItemsPermissions(intl),
      id: "configure",
      url: configurationMenuUrl,
      type: "item",
    },
  ];

  // Reuse Saleor's routes, permissions, extension slots and pins. Custom /ops
  // pages remain separately authenticated and open in a distinct browser tab.
  const localized = (zh: string, en: string) =>
    intl.locale.toLowerCase().startsWith("zh") ? zh : en;
  const native = (id: string) => {
    const item = originalMenuItems.find(candidate => candidate.id === id);

    if (!item) throw new Error(`Missing built-in Dashboard navigation: ${id}`);

    return item;
  };
  const opsItem = (
    id: string,
    label: string,
    path: `/ops${string}`,
    permissions: PermissionEnum[] = [],
  ): SidebarMenuItem | null => {
    const externalUrl = createOpsHref(process.env.COMMERCE_OPS_URL, path);

    return externalUrl ? { id, label, externalUrl, permissions, type: "item" } : null;
  };
  const available = (...items: (SidebarMenuItem | null)[]): SidebarMenuItem[] =>
    items.filter((item): item is SidebarMenuItem => item !== null);

  const baseHome = native("home");
  // When home widgets are pinned, Home becomes an accordion in upstream Saleor.
  // Keep the actual /home destination visible now that group headings only toggle.
  const home: SidebarMenuItem = baseHome.type === "itemGroup" ? {
    ...baseHome,
    children: [{
      id: "commerce-dashboard-home",
      label: localized("首页概览", "Home overview"),
      url: "/home",
      type: "item",
    }, ...(baseHome.children ?? [])],
  } : baseHome;
  const search = native("search");
  const baseOrders = native("orders");
  const baseCatalog = native("products");
  const baseCustomers = native("customers");
  const baseDiscounts = native("discounts");
  const baseModeling = native("modeling");
  const baseTranslations = native("translations");
  const baseExtensions = native("installed-extensions");
  const baseSettings = native("configure");

  const orders: SidebarMenuItem = {
    ...baseOrders,
    label: localized("订单", "Orders"),
    defaultExpanded: true,
    children: [
      ...(baseOrders.children ?? []),
      ...available(opsItem(
        "commerce-payment-reminders",
        localized("智能催付", "Payment reminders"),
        "/ops/analytics/reminders",
        [PermissionEnum.MANAGE_ORDERS],
      )),
    ],
  };
  const catalog: SidebarMenuItem = {
    ...baseCatalog,
    label: localized("商品", "Products"),
  };
  const customers: SidebarMenuItem = {
    ...baseCustomers,
    label: localized("客户", "Customers"),
    children: [
      ...(baseCustomers.children ?? []),
      ...available(opsItem(
        "commerce-support",
        localized("在线客服", "Customer support"),
        "/ops/support",
        [PermissionEnum.MANAGE_USERS, PermissionEnum.MANAGE_ORDERS],
      )),
    ],
  };
  const marketing: SidebarMenuItem = {
    ...baseDiscounts,
    label: localized("营销", "Marketing"),
  };

  const analyticsChildren = available(
    opsItem("commerce-analytics-overview", localized("经营总览", "Overview"), "/ops/analytics"),
    opsItem("commerce-analytics-realtime", localized("实时数据", "Realtime"), "/ops/analytics/realtime"),
    opsItem("commerce-analytics-traffic", localized("流量分析", "Traffic analytics"), "/ops/analytics/traffic"),
    opsItem("commerce-analytics-checkout", localized("结账分析", "Checkout analytics"), "/ops/analytics/checkout"),
    opsItem("commerce-analytics-products", localized("商品分析", "Product analytics"), "/ops/analytics/products"),
  );
  const analytics: SidebarMenuItem | null = analyticsChildren.length ? {
    id: "commerce-analytics",
    icon: renderIcon(<ChartNoAxesCombined {...navigationLucideIconProps} />),
    label: localized("数据分析", "Analytics"),
    type: "itemGroup",
    defaultExpanded: true,
    permissions: [PermissionEnum.MANAGE_ORDERS, PermissionEnum.MANAGE_PRODUCTS],
    children: analyticsChildren,
  } : null;

  const onlineStore: SidebarMenuItem = {
    ...baseModeling,
    label: localized("在线商店", "Online store"),
    defaultExpanded: true,
    // A translator should still see this section without page/model privileges.
    permissions: [...(baseModeling.permissions ?? []), PermissionEnum.MANAGE_TRANSLATIONS],
    children: [
      ...available(
        opsItem("commerce-brand-sites", localized("品牌站点", "Brand sites"), "/ops/sites", [PermissionEnum.MANAGE_PAGES]),
        opsItem("commerce-theme-builder", localized("主题装修", "Theme editor"), "/ops/themes", [PermissionEnum.MANAGE_PAGES]),
        opsItem("commerce-product-theme", localized("商品详情页模板", "Product detail template"), "/ops/themes?pageType=product", [PermissionEnum.MANAGE_PAGES]),
      ),
      ...(baseModeling.children ?? []),
      { ...baseTranslations, label: localized("语言翻译", "Translations") },
      ...available(opsItem(
        "commerce-ai-translations",
        localized("AI 多语言", "AI translations"),
        "/ops/translations",
        [PermissionEnum.MANAGE_TRANSLATIONS],
      )),
    ],
  };
  const channels: SidebarMenuItem = {
    id: "commerce-sales-channels",
    icon: renderIcon(<Globe2 {...navigationLucideIconProps} />),
    label: localized("销售渠道", "Sales channels"),
    type: "itemGroup",
    url: channelsListUrl(),
    permissions: [PermissionEnum.MANAGE_CHANNELS],
    children: [{
      id: "commerce-channel-management",
      label: localized("渠道管理", "Manage channels"),
      url: channelsListUrl(),
      permissions: [PermissionEnum.MANAGE_CHANNELS],
      type: "item",
    }],
  };
  const apps: SidebarMenuItem = {
    ...baseExtensions,
    label: localized("应用", "Apps"),
    children: [
      ...(baseExtensions.children ?? []),
      ...available(opsItem(
        "commerce-system-apps",
        localized("自研系统插件", "System extensions"),
        "/ops/plugins",
        [PermissionEnum.MANAGE_APPS],
      )),
    ],
  };

  // Surface common Saleor settings as actual child routes, not fake settings pages.
  // The complete Saleor Configuration landing page remains available.
  const settings: SidebarMenuItem = {
    ...baseSettings,
    label: localized("设置", "Settings"),
    type: "itemGroup",
    children: [
      { id: "commerce-settings-home", label: localized("设置总览", "All settings"),
        url: configurationMenuUrl, type: "item" },
      { id: "commerce-settings-store", label: localized("店铺信息", "Store details"),
        url: siteSettingsUrl(), type: "item",
        permissions: [PermissionEnum.MANAGE_SETTINGS] },
      { id: "commerce-settings-shipping", label: localized("配送运费", "Shipping"),
        url: shippingZonesListUrl(), type: "item",
        permissions: [PermissionEnum.MANAGE_SHIPPING] },
      { id: "commerce-settings-order", label: localized("订单设置", "Order settings"),
        url: orderSettingsPath, type: "item",
        permissions: [PermissionEnum.MANAGE_ORDERS, PermissionEnum.MANAGE_SETTINGS] },
      { id: "commerce-settings-tax", label: localized("税费设置", "Taxes"),
        url: taxConfigurationListUrl(), type: "item" },
      { id: "commerce-settings-staff", label: localized("员工管理", "Staff"),
        url: staffListUrl(), type: "item",
        permissions: [PermissionEnum.MANAGE_STAFF] },
      { id: "commerce-settings-permissions", label: localized("权限组", "Permission groups"),
        url: permissionGroupListUrl(), type: "item",
        permissions: [PermissionEnum.MANAGE_STAFF] },
    ],
  };

  const menuItems: SidebarMenuItem[] = [
    home,
    search,
    orders,
    catalog,
    customers,
    marketing,
    ...available(analytics),
    onlineStore,
    channels,
    apps,
    settings,
  ];

  // Pins are injected before filtering, so one whose host section is hidden drops out with it.
  const menuItemsWithPins = injectNavigationPins(menuItems, navigationPins, {
    favoritesLabel: intl.formatMessage(navigationPinMessages.favorites),
    favoritesIcon: renderIcon(<Star {...navigationLucideIconProps} />),
  });
  const isMenuItemPermitted = (menuItem: SidebarMenuItem) => {
    const userPermissions = (user?.userPermissions || []).map(permission => permission.code);

    if (!menuItem?.permissions || menuItem?.permissions?.length < 1) {
      return true;
    }

    return menuItem.permissions.some(permission => userPermissions.includes(permission));
  };
  const getFilteredMenuItems = (menuItems: SidebarMenuItem[]) =>
    menuItems.filter(isMenuItemPermitted);

  return menuItemsWithPins.reduce((resultItems: SidebarMenuItem[], menuItem: SidebarMenuItem) => {
    if (!isMenuItemPermitted(menuItem)) {
      return resultItems;
    }

    const { children } = menuItem;
    const filteredChildren = children ? getFilteredMenuItems(children) : undefined;

    return [...resultItems, { ...menuItem, children: filteredChildren }];
  }, []);
}

function renderIcon(icon: React.ReactNode) {
  return <SidebarIconSlot>{icon}</SidebarIconSlot>;
}
