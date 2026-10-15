import { Text } from "@saleor/macaw-ui-next";

import styles from "./CommerceSidebar.module.css";
import { type SidebarMenuItem } from "./types";

interface MenuItemLabelProps {
  menuItem: SidebarMenuItem;
}

// Custom ReactNode labels must set their own typography (see Search / Extensions items).
export const MenuItemLabel = ({ menuItem }: MenuItemLabelProps) => {
  if (typeof menuItem.label !== "string") {
    return <>{menuItem.label}</>;
  }

  if (menuItem.labelStyle === "settings") {
    return (
      <Text size={2} fontWeight="regular" className={`${styles.itemLabel} ${styles.settingsLabel}`}>
        {menuItem.label}
      </Text>
    );
  }

  return (
    <Text size={3} fontWeight="medium" className={styles.itemLabel}>
      {menuItem.label}
    </Text>
  );
};
