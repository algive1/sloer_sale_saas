import type { ReactNode } from "react";
import { brandSitesConfigured } from "@/config/brand-sites";
import { AnalyticsScopeNotice } from "./analytics-scope-notice";

/**
 * Commerce Ops owns the single administration navigation, so this section only
 * states which data scope the page is showing.
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0">
      {brandSitesConfigured() ? <AnalyticsScopeNotice /> : null}
      {children}
    </div>
  );
}
