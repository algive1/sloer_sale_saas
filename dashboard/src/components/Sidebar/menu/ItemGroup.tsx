// @ts-strict-ignore
import { Box, List, Text } from "@saleor/macaw-ui-next";
import { Fragment } from "react";
import { useLocation } from "react-router";

import styles from "./CommerceSidebar.module.css";
import { MenuItem } from "./Item";
import { showSubmenuSeparator } from "./settingsSubmenuItem";
import { SubmenuSeparator } from "./SubmenuSeparator";
import { type SidebarMenuItem } from "./types";
import { isMenuActive } from "./utils";

interface Props {
  menuItem: SidebarMenuItem;
}

export const ItemGroup = ({ menuItem }: Props) => {
  const location = useLocation();

  // Navigation pins are distinguished by query string, so the search has to travel along.
  const activeLocation = location.pathname + location.search;
  const hasSubmenuActive = menuItem?.children.some(item => isMenuActive(activeLocation, item));
  const isActive = isMenuActive(activeLocation, menuItem) && !hasSubmenuActive;
  const isExpanded = isActive || hasSubmenuActive || Boolean(menuItem.defaultExpanded);

  const handleMenuGroupClick = () => {
    if (menuItem.onClick) {
      menuItem.onClick();
    }
  };

  return (
    <List.ItemGroup defaultExpanded={isExpanded} data-test-id={`menu-list-item`}>
      <List.ItemGroup.Trigger
        paddingX={2}
        paddingRight={1}
        borderRadius={3}
        size="small"
        active={isActive}
        justifyContent="space-between"
        data-test-id={`menu-item-label-${menuItem.id}`}
        position="relative"
        onClick={handleMenuGroupClick}
        className={`sidebar-item-group-trigger ${styles.groupTrigger}`}
      >
        <Box display="flex" alignItems="center" gap={3} paddingY={2} borderRadius={3}>
          {menuItem.icon}
          <Text size={3} fontWeight="medium">
            {menuItem.label}
          </Text>
          {menuItem.endAdornment && <Box>{menuItem.endAdornment}</Box>}
        </Box>
      </List.ItemGroup.Trigger>
      <List.ItemGroup.Content>
        <Box
          borderLeftWidth={1}
          borderLeftStyle="solid"
          borderColor="default1"
          paddingLeft={4}
          marginLeft={3}
          className={styles.subMenu}
          display="flex"
          flexDirection="column"
          marginBottom={2}
          marginTop={1}
          gap="px"
        >
          {menuItem.children?.map((child, index) => (
            <Fragment key={child.id}>
              {showSubmenuSeparator(child, index) && <SubmenuSeparator />}
              <MenuItem menuItem={child} />
            </Fragment>
          ))}
        </Box>
      </List.ItemGroup.Content>
    </List.ItemGroup>
  );
};
