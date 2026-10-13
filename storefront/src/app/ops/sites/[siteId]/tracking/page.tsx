import { getOpsI18n } from "@/lib/ops/i18n.server";
import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { fulfillmentScope } from "@/lib/ops/fulfillment";
import { readTrackingQueue, trackingHistory } from "@/lib/ops/tracking";
import { TrackingImport } from "./tracking-import";
type Props = {
	params: Promise<{ siteId: string }>;
	searchParams: Promise<{ channel?: string; after?: string }>;
};
export default async function TrackingPage(props: Props) {
	const i18n = await getOpsI18n();
	const { t } = i18n;
	return (
		<Suspense
			fallback={
				<p role="status" className="p-8">
					{t("正在读取原生履约…")}
				</p>
			}
		>
			<TrackingContent {...props} />
		</Suspense>
	);
}
async function TrackingContent({ params, searchParams }: Props) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	await io();
	const [{ siteId }, query, viewer] = await Promise.all([params, searchParams, currentOpsViewer()]);
	if (viewer?.role !== "platform_admin" || viewer.username === "analytics")
		return (
			<p role="alert" className="p-8">
				{t("单号回填仅允许个人管理员操作。")}
			</p>
		);
	let scope;
	try {
		scope = fulfillmentScope(siteId, viewer, query.channel);
	} catch {
		return (
			<p role="alert" className="p-8">
				{t("品牌或市场不存在，或没有权限。")}
			</p>
		);
	}
	const { site, channel } = scope;
	const dashboard = (process.env.SALEOR_DASHBOARD_URL ?? "").replace(/\/$/, "") || null;
	let queue;
	let history;
	try {
		queue = await readTrackingQueue(siteId, viewer, channel, query.after);
	} catch {
		/* Explicit outage */
	}
	try {
		history = await trackingHistory(siteId, viewer, channel);
	} catch {
		/* Explicit outage */
	}
	return (
		<main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
			<Link
				href={`/ops/sites/${encodeURIComponent(siteId)}/fulfillment?channel=${encodeURIComponent(channel)}`}
				className="text-sm underline"
			>
				{t("← 发货与货代交接")}
			</Link>
			<header>
				<h1 className="text-2xl font-semibold">
					{site.name} {t("· 物流单号回填")}
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{t(
						"先在原生后台完成发货，再回填货代提供的单号。仅处理当前市场已付款、已发出的实物履约；每批最多10笔，不发送顾客邮件。",
					)}
				</p>
			</header>
			<form method="get" className="flex flex-wrap items-center gap-3">
				<label className="text-sm">
					{t("回填市场")}
					<select
						aria-label={t("回填市场")}
						name="channel"
						defaultValue={channel}
						className="ml-2 rounded-lg border border-border bg-background p-2"
					>
						{site.channels.map((item) => (
							<option key={item}>{item}</option>
						))}
					</select>
				</label>
				<button className="rounded-lg border border-border px-3 py-2 text-sm">{t("重新读取")}</button>
			</form>
			<p className="rounded-xl border border-border p-4 text-sm">
				{t(
					"请勿与原生后台同时修改同一履约单号。回填前会重新核对，已有不同单号不会主动覆盖；原生接口没有版本锁。待核对结果须重新预检并查看原生记录，不会自动重发。",
				)}
			</p>
			{!queue ? (
				<p role="alert" className="rounded-xl border border-border p-5">
					{t(
						"原生履约不可用。请配置具备 MANAGE_ORDERS 的专用服务器凭证 OPS_FULFILLMENT_SALEOR_TOKEN；不会使用全局凭证回退。",
					)}
				</p>
			) : (
				<>
					<p className="text-xs text-muted-foreground">
						{t("读取时间：")}
						{queue.checkedAt}
						{t("。每页检查25笔订单，当前页数量不代表全部履约。")}
					</p>
					<TrackingImport
						key={`${channel}:${query.after ?? ""}`}
						queue={queue}
						auditAvailable={history != null}
						dashboard={dashboard}
					/>
					{queue.nextCursor && (
						<Link
							href={`?channel=${encodeURIComponent(channel)}&after=${encodeURIComponent(queue.nextCursor)}`}
							className="inline-block rounded-lg border border-border px-4 py-2 text-sm"
						>
							{t("下一页履约 →")}
						</Link>
					)}
				</>
			)}
			<section className="rounded-xl border border-border bg-card p-5 text-sm">
				<h2 className="font-semibold">
					{t("最近回填记录 ·")}
					{channel}
				</h2>
				<p className="mt-2 text-xs text-muted-foreground">
					{t(
						"按品牌和市场记录管理员、履约、结果和时间，不保存原始CSV或明文物流单号。回填确认不代表货代已揽收、投递或顾客已收到通知。",
					)}
				</p>
				{history == null ? (
					<p role="alert" className="mt-3">
						{t("审计存储未配置或不可用，禁止提交回填。")}
					</p>
				) : history.length ? (
					<ul className="mt-3 space-y-3">
						{history.map((row) => (
							<li key={row.id} className="break-all">
								{row.startedAt} · {row.actor} ·{" "}
								{(
									{
										applied: t("已确认"),
										sending: t("处理中或待核对"),
										uncertain: t("待核对"),
										rejected: t("未执行或拒绝"),
									} as Record<string, string>
								)[row.state] ?? t("待核对")}
								<br />
								<span className="text-xs text-muted-foreground">
									{t("履约")}
									{row.fulfillmentId} {t("· 审计")}
									{row.id}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-3">{t("暂无回填记录。")}</p>
				)}
			</section>
		</main>
	);
}
