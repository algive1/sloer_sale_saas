import { Box, Drawer } from "@saleor/macaw-ui-next";

import { SidebarContent } from "./Content";
import classes from "./Sidebar.module.css";
import { useSidebarBreakpointContext } from "./SidebarContext";
import { SidebarDrawerTrigger } from "./SidebarDrawerTrigger";

export const Sidebar = () => {
  const { breakpoint, collapsed } = useSidebarBreakpointContext();
  const desktopWidth = collapsed ? "72px" : "280px";
  const drawer = (
    <Drawer>
      <Drawer.Trigger>
        <SidebarDrawerTrigger />
      </Drawer.Trigger>
      <Drawer.Content
        backgroundColor="default2"
        data-test-id="sidebar-drawer-content"
        paddingTop={0}
        __width="280px"
      >
        {/* Compact navigation is desktop-only. Mobile keeps the full drawer. */}
        <SidebarContent />
      </Drawer.Content>
    </Drawer>
  );

  if (breakpoint === "wide") {
    return (
      <>
        <div className={classes.fullSidebarWide}>
          <Box __width={desktopWidth} height="100%">
            <SidebarContent collapsible />
          </Box>
        </div>
        <div className={classes.drawerWide}>{drawer}</div>
      </>
    );
  }

  return (
    <>
      <Box
        __width={desktopWidth}
        display={{ mobile: "none", tablet: "none", desktop: "block" }}
        height="100%"
      >
        <SidebarContent collapsible />
      </Box>
      <Box display={{ mobile: "block", tablet: "block", desktop: "none" }}>
        {drawer}
      </Box>
    </>
  );
};
