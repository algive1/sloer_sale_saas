import { getOpsI18n } from "@/lib/ops/i18n.server";
import { Suspense } from "react";
import { RealtimeContent } from "@/ui/ops/realtime-content";

export default async function RealtimeAnalyticsPage() {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<Suspense
			fallback={
				<p className="p-8" role="status">
					{t("正在读取实时数据…")}
				</p>
			}
		>
			<RealtimeContent />
		</Suspense>
	);
}
