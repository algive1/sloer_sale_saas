import "../globals.css";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getRootHtmlFontProps } from "@/lib/fonts";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { buildDashboardHref, opsNavigationForRole } from "@/lib/ops/navigation";
import { OpsShell } from "./_components/ops-shell";

/**
 * Ops keeps its own authorization at the request boundary. The shared visual
 * shell is not a Saleor SSO bridge and never exposes platform-only links to
 * a brand analyst. The storefront's published theme remains independent.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const viewer = await currentOpsViewer();
  if (!viewer) notFound();

  return (
    <html {...getRootHtmlFontProps("en")}>
      <body className="min-h-dvh font-sans">
        <Suspense fallback={<div className="min-h-dvh bg-[#f6f7f9]" aria-busy="true" />}>
          <OpsShell
            role={viewer.role}
            username={viewer.username}
            groups={opsNavigationForRole(viewer.role)}
            dashboardHref={buildDashboardHref(process.env.SALEOR_DASHBOARD_URL)}
          >
            {children}
          </OpsShell>
        </Suspense>
      </body>
    </html>
  );
}
