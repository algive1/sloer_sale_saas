import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { isSaleorOpsRequestAllowed } from "@/lib/ops/authorization";
import { configuredAgentBrands } from "@/plugins/customer-support/agent-workbench.server";
import { ChatWorkbench } from "./_components/chat-workbench";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getOpsI18n();
	return {
		title: t("客户消息 | Commerce Ops"),
		robots: { index: false, follow: false },
	};
}

export default function SupportPage() {
	return (
		<Suspense
			fallback={
				<main className="mx-auto max-w-5xl px-5 py-10" aria-busy="true" data-testid="support-loading">
					<div className="animate-pulse space-y-5 rounded-2xl border bg-card p-8" aria-hidden="true">
						<div className="h-8 w-8 rounded-lg bg-muted" />
						<div className="h-6 w-48 rounded bg-muted" />
						<div className="h-4 max-w-xl rounded bg-muted" />
						<div className="h-4 max-w-md rounded bg-muted" />
					</div>
				</main>
			}
		>
			<SupportContent />
		</Suspense>
	);
}

async function SupportContent() {
	const viewer = await currentOpsViewer();
	if (!viewer || viewer.role !== "platform_admin") notFound();

	return (
		<ChatWorkbench
			brands={configuredAgentBrands()}
			canViewSettings={isSaleorOpsRequestAllowed(viewer, "/ops/support/settings", "GET")}
		/>
	);
}
