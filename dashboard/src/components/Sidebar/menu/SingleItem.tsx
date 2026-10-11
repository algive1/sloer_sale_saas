import { Box, List, sprinkles } from "@saleor/macaw-ui-next";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { useIsMenuActive } from "./hooks/useIsMenuActive";
import styles from "./CommerceSidebar.module.css";
import { MenuItemLabel } from "./MenuItemLabel";
import { type SidebarMenuItem } from "./types";

interface Props {
  menuItem: SidebarMenuItem;
}

export const SingleItem = ({ menuItem }: Props) => {
  const active = useIsMenuActive(menuItem);
  const handleMenuItemClick = () => {
    if (menuItem.onClick) {
      menuItem.onClick();
    }
  };

  const content = (
    <Box
      paddingY={2}
      gap={menuItem.labelStyle === "settings" ? 1.5 : 3}
      display="flex"
      alignItems="center"
    >
      {menuItem.icon}
      <MenuItemLabel menuItem={menuItem} />
      {menuItem.externalUrl && <ExternalLink size={12} aria-hidden="true" />}
    </Box>
  );

  return (
    <List.Item
      borderRadius={3}
      paddingX={2}
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
          title="Open Commerce Ops in a new tab"
          className={sprinkles({ display: "block", width: "100%" })}
        >
          {content}
        </a>
      ) : (
        <Link
          to={menuItem.url || ""}
          replace={active}
          className={sprinkles({ display: "block", width: "100%" })}
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
