import { storage } from "@dashboard/auth/tokenStorage";
import { useUser } from "@dashboard/auth/useUser";
import { Box } from "@saleor/macaw-ui-next";
import { useEffect, useMemo, useRef } from "react";
import { useIntl } from "react-intl";
import { useLocation } from "react-router";

import styles from "./CommerceOpsPage.module.css";
import { isCommerceOpsPagePath } from "./commerceOpsPath";

const DEFAULT_OPS_PATH = "/ops/analytics";
const SSO_PATH = "/commerce-admin/sso";

export const CommerceOpsPage = () => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const location = useLocation();
  const { authenticated, refetchUser } = useUser();
  const intl = useIntl();
  const requestedPath = new URLSearchParams(location.search).get("path");
  const opsPath = isCommerceOpsPagePath(requestedPath) ? requestedPath : DEFAULT_OPS_PATH;
  const embeddedPath = useMemo(() => {
    const target = new URL(opsPath, window.location.origin);

    target.searchParams.set("embedded", "1");
    target.searchParams.set("uiLocale", intl.locale);

    return target.pathname + target.search;
  }, [opsPath, intl.locale]);
  const source = `${SSO_PATH}?next=${encodeURIComponent(embeddedPath)}`;

  useEffect(() => {
    let refreshingToken = false;
    const sendSaleorToken = async (target: Window | null) => {
      if (!target || !authenticated || refreshingToken) return;

      refreshingToken = true;

      try {
        // refetchUser goes through Dashboard's authenticated GraphQL link, which
        // refreshes the Saleor token when it is near expiry.
        try {
          await refetchUser?.();
        } catch {
          // Use the current token if a transient profile refresh fails.
        }

        const token = storage.getAccessToken();

        if (token) {
          target.postMessage({ type: "commerce-ops:saleor-token", token }, window.location.origin);
        }
      } finally {
        refreshingToken = false;
      }
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object" ||
        (event.data as { type?: unknown }).type !== "commerce-ops:request-token"
      ) {
        return;
      }

      void sendSaleorToken(event.source as Window);
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [authenticated, refetchUser]);

  return (
    <Box className={styles.page} data-test-id="commerce-ops-page">
      <iframe
        key={source}
        ref={frameRef}
        title={intl.locale.toLowerCase().startsWith("zh") ? "运营管理" : "Commerce operations"}
        src={source}
        className={styles.frame}
        allow="clipboard-read; clipboard-write"
        data-test-id="commerce-ops-frame"
      />
    </Box>
  );
};
