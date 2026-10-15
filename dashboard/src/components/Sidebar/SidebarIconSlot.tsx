import { Box } from "@saleor/macaw-ui-next";

import styles from "./menu/CommerceSidebar.module.css";

const SIDEBAR_ICON_SLOT_SIZE = 20;

export const SidebarIconSlot = ({ children }: { children: React.ReactNode }): React.ReactNode => (
  <Box
    __color="inherit"
    className={styles.iconSlot}
    display="flex"
    alignItems="center"
    justifyContent="center"
    __flexShrink={0}
    __width={SIDEBAR_ICON_SLOT_SIZE}
    __height={SIDEBAR_ICON_SLOT_SIZE}
  >
    {children}
  </Box>
);
