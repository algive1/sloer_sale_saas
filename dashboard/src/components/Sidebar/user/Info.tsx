import { useUser } from "@dashboard/auth/useUser";
import { UserAvatar } from "@dashboard/components/UserAvatar/UserAvatar";
import { getUserInitials, getUserName } from "@dashboard/misc";
import { Box, Text } from "@saleor/macaw-ui-next";

import styles from "../menu/CommerceSidebar.module.css";
import { UserControls } from "./Controls";

export const UserInfo = ({ compact = false }: { compact?: boolean }) => {
  const { user } = useUser();

  return (
    <Box
      display="flex"
      gap={compact ? 1 : 3}
      paddingX={compact ? 1 : 3}
      alignItems="center"
      borderTopWidth={1}
      borderColor="default1"
      borderTopStyle="solid"
      justifyContent="space-between"
      className={`${styles.userInfo} ${compact ? styles.compactUser : ""}`}
    >
      <Box display="flex" gap={3} alignItems="center" minWidth={0} flexGrow="1">
        <Box flexShrink="0" title={getUserName(user!, true)}>
          <UserAvatar
            initials={getUserInitials(user!)}
            url={user?.avatar?.url}
            className={styles.userAvatar}
            style={userAvatarStyle}
          />
        </Box>
        {!compact && (
          <Box minWidth={0} className="ellipsis">
            <Text size={3} fontWeight="bold" className={styles.userName}>
              {getUserName(user!, true)}
            </Text>
          </Box>
        )}
      </Box>
      <UserControls compact={compact} />
    </Box>
  );
};

const userAvatarStyle = {
  backgroundColor: "var(--commerce-admin-nav-border)",
  color: "var(--commerce-admin-nav-muted)",
};
