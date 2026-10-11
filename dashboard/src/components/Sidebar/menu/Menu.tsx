import { Box, List } from "@saleor/macaw-ui-next";
import { Search } from "lucide-react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { useIntl } from "react-intl";

import { useSidebarBreakpointContext } from "../SidebarContext";
import { Shortcusts } from "../shortcuts/Shortcuts";
import styles from "./CommerceSidebar.module.css";
import { useMenuStructure } from "./hooks/useMenuStructure";
import { MenuItem } from "./Item";
import { type SidebarMenuItem } from "./types";
import { isMenuActive } from "./utils";

const MenuRailItem = ({
  item,
  activeLocation,
}: {
  item: SidebarMenuItem;
  activeLocation: string;
}) => {
  const { expandGroup } = useSidebarBreakpointContext();
  const label = typeof item.label === "string" ? item.label : item.id;
  const active = isMenuActive(activeLocation, item) ||
    Boolean(item.children?.some(child => isMenuActive(activeLocation, child)));
  const className = `${styles.railItem} ${active ? styles.selected : ""}`;
  const content = <span className={styles.railIcon} aria-hidden="true">{item.icon}</span>;

  if (item.type === "itemGroup") {
    return (
      <li>
        <button
          type="button"
          className={className}
          aria-label={label}
          title={label}
          onClick={() => expandGroup(item.id)}
          data-test-id={`commerce-rail-${item.id}`}
        >
          {content}
        </button>
      </li>
    );
  }

  if (item.externalUrl) {
    return (
      <li>
        <a className={className} title={label} aria-label={label}
          href={item.externalUrl} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={item.url ?? "/home"}
        replace={active}
        className={className}
        aria-label={label}
        title={label}
        onClick={item.onClick}
        data-test-id={`commerce-rail-${item.id}`}
      >
        {content}
      </Link>
    </li>
  );
};

export const Menu = ({ compact = false }: { compact?: boolean }) => {
  const menuStructure = useMenuStructure();
  const intl = useIntl();
  const location = useLocation();
  const activeLocation = location.pathname + location.search;
  const isZh = intl.locale.toLowerCase().startsWith("zh");
  const search = menuStructure.find(item => item.id === "search");
  const settings = menuStructure.find(item => item.id === "configure");
  const mainItems = menuStructure.filter(item =>
    item.id !== "search" && item.id !== "configure",
  );

  if (compact) {
    return (
      <Box className={`${styles.menuRoot} ${styles.railColumn}`}>
        <nav className={styles.railScroll} aria-label={isZh ? "后台主导航" : "Admin navigation"}>
          <ul className={styles.railList}>
            {search && <MenuRailItem item={search} activeLocation={activeLocation} />}
            {mainItems.filter(item => item.type !== "divider").map(item => (
              <MenuRailItem key={item.id} item={item} activeLocation={activeLocation} />
            ))}
          </ul>
        </nav>
        {settings && (
          <nav className={styles.railFooter} aria-label={isZh ? "系统设置" : "Settings"}>
            <ul className={styles.railList}>
              <MenuRailItem item={settings} activeLocation={activeLocation} />
            </ul>
          </nav>
        )}
      </Box>
    );
  }

  return (
    <Box
      padding={2}
      className={`${styles.menuRoot} ${styles.menuColumn}`}
      display="flex"
      flexDirection="column"
      minHeight="0px"
    >
      {search && (
        <Link
          to={search.url ?? "/search"}
          className={styles.searchBox}
          data-test-id="commerce-admin-search"
          aria-label={isZh ? "搜索订单、商品和客户" : "Search orders, products and customers"}
        >
          <Search size={16} aria-hidden="true" />
          <span className={styles.searchPlaceholder}>
            {isZh ? "搜索功能…" : "Search features…"}
          </span>
          <kbd className={styles.navSearchHint}>/</kbd>
        </Link>
      )}
      <div className={`hide-scrollbar ${styles.menuScroll}`}>
        <List as="ol" display="grid" gap={1} data-test-id="menu-list">
          {mainItems.map(item => <MenuItem menuItem={item} key={item.id} />)}
        </List>
        <Shortcusts />
      </div>
      {settings && (
        <List as="ol" display="grid" gap={1} className={styles.settingsFooter}
          data-test-id="commerce-settings-footer">
          <MenuItem menuItem={settings} />
        </List>
      )}
    </Box>
  );
};
