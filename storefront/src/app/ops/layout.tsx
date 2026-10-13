import "../globals.css";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getRootHtmlFontProps } from "@/lib/fonts";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { buildDashboardHref, opsNavigationForViewer } from "@/lib/ops/navigation";
import { OpsShell } from "./_components/ops-shell";
import { SaleorOpsSessionSync } from "./_components/saleor-ops-session-sync";
import { NextIntlClientProvider } from "next-intl";
import { getOpsI18n } from "@/lib/ops/i18n.server";

/**
 * Ops keeps its own authorization at the request boundary. The shared visual
 * shell reuses the Saleor staff session when opened inside the Dashboard. The
 * storefront's published theme remains independent.
 */
export default function OpsLayout({ children }: { children: ReactNode }) {
	return (
		<html {...getRootHtmlFontProps("en")}>
			<body className="min-h-dvh font-sans">
				<Suspense fallback={<div className="min-h-dvh bg-[#f6f7f9]" aria-busy="true" />}>
					<AuthenticatedOpsShell>{children}</AuthenticatedOpsShell>
				</Suspense>
			</body>
		</html>
	);
}

async function AuthenticatedOpsShell({ children }: { children: ReactNode }) {
	const viewer = await currentOpsViewer();
	if (!viewer) notFound();
	const { locale } = await getOpsI18n();
	return (
		<NextIntlClientProvider locale={locale} messages={{}}>
			<OpsShell
				role={viewer.role}
				username={viewer.username}
				groups={opsNavigationForViewer(viewer)}
				dashboardHref={buildDashboardHref(process.env.SALEOR_DASHBOARD_URL)}
				authSource={viewer.authSource ?? "basic"}
			>
				<SaleorOpsSessionSync />
				{children}
			</OpsShell>
		</NextIntlClientProvider>
	);
}
