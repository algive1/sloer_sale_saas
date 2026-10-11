import { AllRipplesModal } from "@dashboard/ripples/components/AllRipplesModal";
import { useAllRipplesModalState } from "@dashboard/ripples/state";
import { Box } from "@saleor/macaw-ui-next";

import { DeprecationBanner } from "./DeprecationBanner/DeprecationBanner";
import styles from "./menu/CommerceSidebar.module.css";
import { Menu } from "./menu/Menu";
import { MountingPoint } from "./MountingPoint";
import { useSidebarBreakpointContext } from "./SidebarContext";
import { UserInfo } from "./user/Info";

export const SidebarContent = ({ collapsible = false }: { collapsible?: boolean }) => {
  const { isModalOpen, setModalState } = useAllRipplesModalState();
  const { collapsed } = useSidebarBreakpointContext();
  const compact = collapsible && collapsed;

  return (
    <Box
      backgroundColor="default2"
      as="aside"
      height="100%"
      display="grid"
      __gridTemplateColumns="minmax(0, 1fr)"
      __gridTemplateRows="auto minmax(0, 1fr) auto"
      className={styles.sidebarShell}
      data-test-id={compact ? "commerce-sidebar-compact" : "commerce-sidebar-expanded"}
    >
      <Box>
        <MountingPoint collapsible={collapsible} compact={compact} />
        {!compact && <DeprecationBanner />}
      </Box>
      <Menu compact={compact} />
      <UserInfo compact={compact} />
      <AllRipplesModal
        open={isModalOpen}
        onChange={open => {
          setModalState(open);
        }}
      />
    </Box>
  );
};
