import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { brandReadiness } from "@/lib/ops/readiness-service";
import { readinessActorAllowed } from "@/lib/ops/readiness-model";
import type { ReadinessSnapshot } from "@/lib/ops/readiness-model";
import { readinessHistory } from "@/lib/ops/readiness-store";
import { ReadinessChecklist } from "./readiness-checklist";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getOpsI18n();
	return { title: t("品牌上线检查 | Commerce Ops"), robots: { index: false, follow: false } };
}

export default async function BrandReadinessPage({ params }: { params: Promise<{ siteId: string }> }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<Suspense
			fallback={
				<main className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">
					{t("正在核对品牌上线条件…")}
				</main>
			}
		>
			<BrandReadinessContent params={params} />
		</Suspense>
	);
}

async function BrandReadinessContent({ params }: { params: Promise<{ siteId: string }> }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	const viewer = await currentOpsViewer();
	const { siteId } = await params;
	if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) notFound();
	let snapshot: ReadinessSnapshot;
	try {
		snapshot = await brandReadiness(siteId);
	} catch {
		notFound();
	}
	const history = snapshot.storageAvailable ? await readinessHistory(siteId).catch(() => []) : [];
	return (
		<main className="mx-auto max-w-5xl px-5 py-8 md:px-10">
			<Link href="/ops/sites" className="text-sm text-muted-foreground underline underline-offset-4">
				{t("← 返回品牌站点")}
			</Link>
			<header className="mt-6">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					{t("店铺上线检查清单")}
				</p>
				<h1 className="mt-2 text-2xl font-semibold">
					{snapshot.siteName} {t("· 上线前检查")}
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{t("保留配置核对、交易证据、责任人和历史。变更后重新验证。")}
				</p>
			</header>
			<ReadinessChecklist
				key={snapshot.contextHash}
				initial={snapshot}
				canVerify={readinessActorAllowed(viewer)}
			/>
			<section className="mt-8" aria-label={t("验收历史")}>
				<h2 className="text-lg font-semibold">{t("最近验收记录")}</h2>
				{history.length ? (
					<div className="mt-3 overflow-x-auto rounded-lg border border-border">
						<table className="w-full text-left text-sm">
							<thead className="bg-muted">
								<tr>
									<th className="p-3">{t("检查项")}</th>
									<th className="p-3">{t("结果")}</th>
									<th className="p-3">{t("责任人")}</th>
									<th className="p-3">{t("时间 / 版本")}</th>
								</tr>
							</thead>
							<tbody>
								{history.map((record) => (
									<tr key={`${record.checkId}:${record.revision}`} className="border-t border-border">
										<td className="p-3">
											{t(
												snapshot.checks.find((check) => check.id === record.checkId)?.label ?? record.checkId,
											)}
										</td>
										<td className="p-3">{record.result === "passed" ? t("通过") : t("未通过")}</td>
										<td className="p-3">{record.verifiedBy}</td>
										<td className="p-3">
											{record.verifiedAt} / {record.revision}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="mt-3 text-sm text-muted-foreground">
						{t("暂无可读取的验收记录。系统核对不会自动生成人工通过记录。")}
					</p>
				)}
			</section>
		</main>
	);
}
