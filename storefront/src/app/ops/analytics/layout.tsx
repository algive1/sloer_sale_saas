import type { ReactNode } from "react";
import { AnalyticsNavigation } from "./analytics-nav";
import { brandSitesConfigured } from "@/config/brand-sites";

export default function AnalyticsLayout({children}:{children:ReactNode}) {
  return <div className="min-h-screen bg-[#f6f7f9] text-foreground lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <AnalyticsNavigation allBrands={brandSitesConfigured()} />
    <div className="min-w-0">{children}</div>
  </div>;
}
