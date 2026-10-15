import { Box, List, sprinkles } from "@saleor/macaw-ui-next";
import { ExternalLink } from "lucide-react";
import { useIntl } from "react-intl";
import { Link } from "react-router-dom";

import styles from "./CommerceSidebar.module.css";
import { useIsMenuActive } from "./hooks/useIsMenuActive";
import { MenuItemLabel } from "./MenuItemLabel";
import { type SidebarMenuItem } from "./types";

interface Props {
  menuItem: SidebarMenuItem;
}

export const SingleItem = ({ menuItem }: Props) => {
  const active = useIsMenuActive(menuItem);
  const intl = useIntl();
  const isZh = intl.locale.toLowerCase().startsWith("zh");
  const label = typeof menuItem.label === "string" ? menuItem.label : "";
  const externalDescription = isZh ? `在新标签页打开${label}` : `Open ${label} in a new tab`;
  const handleMenuItemClick = () => {
    if (menuItem.onClick) {
      menuItem.onClick();
    }
  };

  const content = (
    <Box
      gap={menuItem.labelStyle === "settings" ? 1.5 : 3}
      display="flex"
      alignItems="center"
      className={styles.itemContent}
    >
      {menuItem.icon}
      <MenuItemLabel menuItem={menuItem} />
      {menuItem.externalUrl && <ExternalLink size={12} aria-hidden="true" />}
    </Box>
  );

  return (
    <List.Item
      borderRadius={2}
      paddingX={0}
      active={active}
      onClick={handleMenuItemClick}
      data-test-id={`menu-item-label-${menuItem.id}`}
      position="relative"
      // Hover/focus root for adornments that reveal themselves on the row (e.g. unpin).
      className={`sidebar-single-item ${styles.itemRow} ${active ? styles.selected : ""}`}
    >
      {menuItem.externalUrl ? (
        <a
          href={menuItem.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={externalDescription}
          aria-label={externalDescription}
          className={`${sprinkles({ display: "block", width: "100%" })} ${styles.clickArea}`}
        >
          {content}
        </a>
      ) : (
        <Link
          to={menuItem.url || ""}
          replace={active}
          aria-current={active ? "page" : undefined}
          className={`${sprinkles({ display: "block", width: "100%" })} ${styles.clickArea}`}
        >
          {content}
        </Link>
      )}
      {menuItem.endAdornment && (
        <Box position="absolute" right={2} zIndex={"3"}>
          {menuItem.endAdornment}
        </Box>
      )}
    </List.Item>
  );
};
