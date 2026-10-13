import { useUser } from "@dashboard/auth/useUser";
import { Locale, localeNames } from "@dashboard/components/Locale/Locale";
import { canUseDashboardSearch } from "@dashboard/components/Sidebar/menu/navigationAccess";
import { UserAvatar } from "@dashboard/components/UserAvatar/UserAvatar";
import useLocale from "@dashboard/hooks/useLocale";
import { getUserInitials, getUserName } from "@dashboard/misc";
import { SearchShortcut } from "@dashboard/search/SearchShortcut";
import { staffMemberDetailsUrl } from "@dashboard/staff/urls";
import { Box } from "@saleor/macaw-ui-next";
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
  const { locale, setLocale } = useLocale();
  const canSearch = canUseDashboardSearch(
    user?.userPermissions?.map(permission => permission.code),
  );

  return (
    <Box
      as="header"
      backgroundColor="default1"
      className={styles.topbar}
      data-test-id="commerce-admin-topbar"
    >
      {canSearch && (
        <Link
          to="/search"
          className={styles.globalSearch}
          aria-label={isZh ? "搜索订单、商品和客户" : "Search orders, products and customers"}
        >
          <Search size={17} aria-hidden="true" />
          <span>{isZh ? "搜索订单、商品、客户等…" : "Search orders, products, customers…"}</span>
          <SearchShortcut />
        </Link>
      )}
      <div className={styles.spacer} />
      <select
        className={styles.languageSelect}
        aria-label={intl.formatMessage({ id: "mr9jbO", defaultMessage: "Preferred Language" })}
        value={locale}
        onChange={event => {
          const selected = Object.values(Locale).find(value => value === event.target.value);

          if (selected) setLocale(selected);
        }}
        data-test-id="admin-language-select"
      >
        {Object.entries(localeNames).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
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
    </Box>
  );
};
