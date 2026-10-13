"use client";
import { useOpsI18n } from "@/lib/ops/i18n.client";

import { usePathname } from "next/navigation";

/**
 * Analytics aggregates are platform-wide except for the two brand-scoped
 * screens, so the scope has to be stated instead of implied by a sidebar.
 */
const brandedRoutes = ["/ops/analytics/reminders", "/ops/analytics/destinations"];

export function AnalyticsScopeNotice() {
	const i18n = useOpsI18n();
	const { t } = i18n;

	const pathname = usePathname();
	return (
		<p className="mx-5 mt-4 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground" role="status">
			{brandedRoutes.includes(pathname)
				? pathname === "/ops/analytics/reminders"
					? t("当前视图：按品牌管理催付。以页面选择的品牌为准。")
					: t("当前视图：按品牌查看广告接收端及投递记录。")
				: t("当前视图：平台全品牌汇总。单品牌筛选尚未开放。")}
		</p>
	);
}
