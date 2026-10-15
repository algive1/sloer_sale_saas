import { useCloud } from "@dashboard/auth/hooks/useCloud";
import { Box, Text, Tooltip } from "@saleor/macaw-ui-next";
import { ChevronsLeft, ChevronsRight, CloudIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import styles from "./menu/CommerceSidebar.module.css";
import { useEnvLink } from "./menu/hooks/useEnvLink";
import { useSidebarBreakpointContext } from "./SidebarContext";

export const MountingPoint = ({
  collapsible = false,
  compact = false,
}: {
  collapsible?: boolean;
  compact?: boolean;
}) => {
  const { setCollapsed } = useSidebarBreakpointContext();
  const { isAuthenticatedViaCloud } = useCloud();
  const envLink = useEnvLink();
  const intl = useIntl();
  const isZh = intl.locale.toLowerCase().startsWith("zh");
  const toggleLabel = compact
    ? isZh
      ? "展开侧边导航"
      : "Expand sidebar"
    : isZh
      ? "收起侧边导航"
      : "Collapse sidebar";

  return (
    <div className={`${styles.brandHeader} ${compact ? styles.brandHeaderCompact : ""}`}>
      <div className={styles.brandIdentity}>
        <span className={styles.brandMonogram} aria-hidden="true">
          S
        </span>
        {!compact && (
          <div className={styles.brandText}>
            <Text size={3} fontWeight="bold" className={styles.brandName}>
              SLOER Commerce
            </Text>
            <span className={styles.adminTag}>Admin</span>
          </div>
        )}
      </div>
      <div className={styles.brandActions}>
        {!compact && isAuthenticatedViaCloud && (
          <Tooltip>
            <Tooltip.Trigger>
              <Box
                as="a"
                href={envLink}
                target="_blank"
                rel="noopener noreferrer"
                display="flex"
                alignItems="center"
                color="default2"
                paddingRight={1}
                data-test-id="cloud-environment-link"
              >
                <CloudIcon size={16} aria-hidden="true" />
              </Box>
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom">
              <Tooltip.Arrow />
              <Text size={2}>
                <FormattedMessage defaultMessage="Go to Saleor Cloud" id="EXqb2l" />
              </Text>
            </Tooltip.Content>
          </Tooltip>
        )}
        {collapsible && (
          <button
            type="button"
            className={styles.collapseButton}
            aria-label={toggleLabel}
            aria-expanded={!compact}
            title={toggleLabel}
            onClick={() => setCollapsed(!compact)}
            data-test-id="commerce-sidebar-toggle"
          >
            {compact ? (
              <ChevronsRight size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ChevronsLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
