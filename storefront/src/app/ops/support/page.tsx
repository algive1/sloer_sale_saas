import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { configuredAgentBrands } from "@/plugins/customer-support/agent-workbench.server";
import { ChatWorkbench } from "./_components/chat-workbench";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getOpsI18n();
	return {
		title: t("客户消息 | Commerce Ops"),
		robots: { index: false, follow: false },
	};
}

export default async function SupportPage() {
	const viewer = await currentOpsViewer();
	if (!viewer || viewer.role !== "platform_admin") notFound();

	return <ChatWorkbench brands={configuredAgentBrands()} />;
}
