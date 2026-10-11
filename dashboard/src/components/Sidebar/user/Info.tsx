import { useUser } from "@dashboard/auth/useUser";
import { savebarHeight } from "@dashboard/components/AppLayout/consts";
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
      __height={compact ? "104px" : savebarHeight}
      className={compact ? styles.compactUser : undefined}
    >
      <Box display="flex" gap={3} alignItems="center" minWidth={0} flexGrow="1">
        <Box flexShrink="0" title={getUserName(user!, true)}>
          <UserAvatar initials={getUserInitials(user!)} url={user?.avatar?.url} />
        </Box>
        {!compact && (
          <Box minWidth={0} className="ellipsis">
            <Text size={3} fontWeight="bold">
              {getUserName(user!, true)}
            </Text>
          </Box>
        )}
      </Box>
      <UserControls compact={compact} />
    </Box>
  );
};
