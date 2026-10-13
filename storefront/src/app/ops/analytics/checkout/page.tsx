import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { OpsI18n } from "@/lib/ops/i18n";
import Link from "next/link";
import { Suspense } from "react";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readCheckoutReport, type CheckoutBucket } from "@/plugins/analytics/checkout-report";
import { CheckoutTrendChart } from "./checkout-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default function CheckoutAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	return (
		<Suspense fallback={<CheckoutAnalyticsLoading />}>
			<CheckoutAnalyticsContent searchParams={searchParams} />
		</Suspense>
	);
}

async function CheckoutAnalyticsContent({ searchParams }: { searchParams: SearchParams }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">{t("结账分析")}</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					{t("配置 ANALYTICS_LIBSQL_URL 和 ANALYTICS_LIBSQL_AUTH_TOKEN 后即可启用第一方结账报表。")}
				</p>
			</main>
		);
	}

	const range = resolveRange(query);
	const report = await readCheckoutReport(range);
	const completionRate = formatRate(report.summary.purchaseSessions, report.summary.started);

	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-medium text-muted-foreground">{t("运营管理 / 数据分析")}</p>
					<h1 className="mt-1 text-h1">{t("结账分析")}</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{t("查看结账流程、弃购情况、支付失败与支付方式转化。")}
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label={t("结账日期范围")}>
					{[
						["today", t("今天")],
						["7d", t("近 7 天")],
						["30d", t("近 30 天")],
						["month", t("本月")],
					].map(([value, label]) => (
						<Link
							key={value}
							href={`/ops/analytics/checkout?range=${value}`}
							className={`rounded-lg border px-3 py-2 text-sm ${
								range.range === value
									? "border-foreground bg-foreground text-background"
									: "border-border bg-card hover:bg-secondary"
							}`}
						>
							{label}
						</Link>
					))}
					<Link
						href="/ops/analytics/realtime"
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{t("实时数据")}
					</Link>
					<Link
						href="/ops/analytics/traffic"
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{t("流量分析")}
					</Link>
					<Link
						href="/ops/analytics/products"
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{t("商品分析")}
					</Link>
					<Link
						href="/ops/analytics"
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{t("经营总览")}
					</Link>
				</nav>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
				<Metric label={t("已开始结账")} value={report.summary.started.toLocaleString()} />
				<Metric label={t("购买会话")} value={report.summary.purchaseSessions.toLocaleString()} />
				<Metric label={t("结账完成率")} value={completionRate} />
				<Metric label={t("订单数")} value={report.summary.orders.toLocaleString()} />
				<Metric label={t("支付失败次数")} value={report.summary.paymentFailures.toLocaleString()} />
				<Metric label={t("结账失败次数")} value={report.summary.checkoutFailures.toLocaleString()} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("结账趋势")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from, i18n)} – {formatDate(range.to, i18n)} ·{" "}
						{range.bucket === "hour" ? t("按小时") : t("按天")}
					</p>
				</div>
				<CheckoutTrendChart points={report.trend} bucket={range.bucket} />
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">{t("结账漏斗")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("统计到达各结账阶段的独立会话数。")}</p>
					<div className="mt-6 space-y-4">
						{report.funnel.map((row, index) => {
							const first = report.funnel[0]?.count ?? 0;
							const previous = index === 0 ? row.count : (report.funnel[index - 1]?.count ?? 0);
							const width = first > 0 ? Math.max(2, (row.count / first) * 100) : 0;
							const stepRate = index === 0 ? "100.00%" : formatRate(row.count, previous);
							return (
								<div key={row.key}>
									<div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
										<div>
											<span className="font-medium">{row.label}</span>
											{index > 0 ? (
												<span className="ml-2 text-xs text-muted-foreground">
													{t("较上一步")}
													{stepRate}
												</span>
											) : null}
										</div>
										<span className="tabular-nums text-muted-foreground">{row.count.toLocaleString()}</span>
									</div>
									<div className="h-2 overflow-hidden rounded-full bg-secondary">
										<div className="h-full rounded-full bg-foreground" style={{ width: `${width}%` }} />
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">{t("按最后阶段统计弃购")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("会话至少一小时没有活动且尚未完成购买。")}</p>
					<div className="mt-5 space-y-3">
						{report.abandonment.map((row) => (
							<div
								key={row.stage}
								className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0"
							>
								<span className="text-sm">{row.stage}</span>
								<span className="font-medium tabular-nums">{row.count.toLocaleString()}</span>
							</div>
						))}
						{report.abandonment.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t("所选时段暂无弃购会话。")}</p>
						) : null}
					</div>
				</div>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("失败原因诊断")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("按发生次数归类并排序支付与结账失败。")}</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[960px] text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">{t("类型")}</th>
								<th className="pb-2 font-medium">{t("阶段")}</th>
								<th className="pb-2 font-medium">{t("服务提供方")}</th>
								<th className="pb-2 font-medium">{t("代码")}</th>
								<th className="pb-2 font-medium">{t("原因")}</th>
								<th className="pb-2 text-right font-medium">{t("会话数")}</th>
								<th className="pb-2 text-right font-medium">{t("发生次数")}</th>
							</tr>
						</thead>
						<tbody>
							{report.failures.map((row, index) => (
								<tr
									key={`${row.kind}:${row.stage}:${row.provider}:${row.code}:${index}`}
									className="border-t border-border/60"
								>
									<td className="py-3 font-medium">{row.kind}</td>
									<td className="py-3">{row.stage}</td>
									<td className="py-3">{row.provider}</td>
									<td className="py-3">{row.code}</td>
									<td className="max-w-md py-3 text-muted-foreground">{row.reason}</td>
									<td className="py-3 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">{row.occurrences.toLocaleString()}</td>
								</tr>
							))}
							{report.failures.length === 0 ? (
								<tr>
									<td colSpan={7} className="py-8 text-center text-muted-foreground">
										{t("所选时段没有结账失败记录。")}
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-2">
				<MethodTable title={t("支付方式表现")} rows={report.paymentMethods} />
				<MethodTable title={t("配送方式表现")} rows={report.shippingMethods} />
			</section>

			<CustomRangeForm
				from={formatInputDate(range.from)}
				to={formatInputDate(new Date(range.to.getTime() - 1))}
			/>
		</main>
	);
}

function CheckoutAnalyticsLoading() {
	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<div className="h-4 w-36 animate-pulse rounded bg-secondary" />
			<div className="mt-3 h-9 w-64 animate-pulse rounded bg-secondary" />
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
				{Array.from({ length: 6 }).map((_, index) => (
					<div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
				))}
			</div>
			<div className="mt-8 h-80 animate-pulse rounded-xl border border-border bg-card" />
		</main>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
		</div>
	);
}

async function MethodTable({
	title,
	rows,
}: {
	title: string;
	rows: Array<{ method: string; selectedSessions: number; purchaseSessions: number }>;
}) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<div className="rounded-xl border border-border bg-card p-6">
			<h2 className="text-lg font-semibold">{title}</h2>
			<div className="mt-5 overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead className="text-muted-foreground">
						<tr>
							<th className="pb-2 font-medium">{t("方式")}</th>
							<th className="pb-2 text-right font-medium">{t("已选择")}</th>
							<th className="pb-2 text-right font-medium">{t("已购买")}</th>
							<th className="pb-2 text-right font-medium">{t("转化率")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.method} className="border-t border-border/60">
								<td className="py-3 font-medium">{row.method}</td>
								<td className="py-3 text-right tabular-nums">{row.selectedSessions.toLocaleString()}</td>
								<td className="py-3 text-right tabular-nums">{row.purchaseSessions.toLocaleString()}</td>
								<td className="py-3 text-right font-medium tabular-nums">
									{formatRate(row.purchaseSessions, row.selectedSessions)}
								</td>
							</tr>
						))}
						{rows.length === 0 ? (
							<tr>
								<td colSpan={4} className="py-8 text-center text-muted-foreground">
									{t("暂无方式数据。")}
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>
		</div>
	);
}

async function CustomRangeForm({ from, to }: { from: string; to: string }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<form
			className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5"
			action="/ops/analytics/checkout"
		>
			<input type="hidden" name="range" value="custom" />
			<label className="grid gap-1 text-sm">
				<span className="text-muted-foreground">{t("开始日期")}</span>
				<input
					className="rounded-lg border border-border bg-background px-3 py-2"
					type="date"
					name="from"
					defaultValue={from}
					required
				/>
			</label>
			<label className="grid gap-1 text-sm">
				<span className="text-muted-foreground">{t("结束日期")}</span>
				<input
					className="rounded-lg border border-border bg-background px-3 py-2"
					type="date"
					name="to"
					defaultValue={to}
					required
				/>
			</label>
			<button className="rounded-lg bg-foreground px-4 py-2 text-sm text-background" type="submit">
				{t("应用日期范围")}
			</button>
		</form>
	);
}

function formatRate(value: number, total: number): string {
	if (total <= 0) return "0.00%";
	return `${((value / total) * 100).toFixed(2)}%`;
}

function resolveRange(query: { range?: string; from?: string; to?: string }): {
	range: string;
	from: Date;
	to: Date;
	bucket: CheckoutBucket;
} {
	const now = new Date();
	if (query.range === "today") {
		const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		return { range: "today", from, to: now, bucket: "hour" };
	}
	if (query.range === "month") {
		const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		return { range: "month", from, to: now, bucket: "day" };
	}
	if (query.range === "custom") {
		const from = parseDate(query.from);
		const inclusiveTo = parseDate(query.to);
		if (from && inclusiveTo && from <= inclusiveTo) {
			const to = new Date(inclusiveTo.getTime() + 86_400_000);
			const duration = to.getTime() - from.getTime();
			if (duration <= 366 * 86_400_000) {
				return { range: "custom", from, to, bucket: duration <= 2 * 86_400_000 ? "hour" : "day" };
			}
		}
	}
	const days = query.range === "7d" ? 7 : 30;
	return {
		range: days === 7 ? "7d" : "30d",
		from: new Date(now.getTime() - days * 86_400_000),
		to: now,
		bucket: "day",
	};
}

function parseDate(value: string | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date, i18n: OpsI18n): string {
	const { locale } = i18n;

	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(date);
}

function formatInputDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
