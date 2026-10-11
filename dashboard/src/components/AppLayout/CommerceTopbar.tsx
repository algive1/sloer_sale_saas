import { useUser } from "@dashboard/auth/useUser";
import { UserAvatar } from "@dashboard/components/UserAvatar/UserAvatar";
import { getUserInitials, getUserName } from "@dashboard/misc";
import { SearchShortcut } from "@dashboard/search/SearchShortcut";
import { staffMemberDetailsUrl } from "@dashboard/staff/urls";
import { Search } from "lucide-react";
import { useIntl } from "react-intl";
import { Link } from "react-router-dom";

import styles from "./CommerceTopbar.module.css";

/**
 * Shared Dashboard chrome only. Existing page headers, actions and save bars
 * are intentionally retained rather than reimplemented.
 */
export const CommerceTopbar = () => {
  const { user } = useUser();
  const intl = useIntl();
  const isZh = intl.locale.toLowerCase().startsWith("zh");

  return (
    <header className={styles.topbar} data-test-id="commerce-admin-topbar">
      <Link
        to="/search"
        className={styles.globalSearch}
        aria-label={isZh ? "搜索订单、商品和客户" : "Search orders, products and customers"}
      >
        <Search size={17} aria-hidden="true" />
        <span>{isZh ? "搜索订单、商品、客户等…" : "Search orders, products, customers…"}</span>
        <SearchShortcut />
      </Link>
      <div className={styles.spacer} />
      {user && (
        <Link
          to={staffMemberDetailsUrl(user.id)}
          className={styles.accountLink}
          aria-label={isZh ? "查看我的账户" : "View my account"}
        >
          <UserAvatar initials={getUserInitials(user)} url={user.avatar?.url} />
          <span className={styles.accountName}>{getUserName(user, true)}</span>
        </Link>
      )}
    </header>
  );
};
