import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { OpsI18n } from "@/lib/ops/i18n";
import Link from "next/link";
import { Suspense } from "react";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readTrafficReport, type TrafficBucket } from "@/plugins/analytics/traffic-report";
import { CountryTrendChart } from "./country-trend-chart";
import { TrafficTrendChart } from "./traffic-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default function TrafficAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	return (
		<Suspense fallback={<TrafficAnalyticsLoading />}>
			<TrafficAnalyticsContent searchParams={searchParams} />
		</Suspense>
	);
}

async function TrafficAnalyticsContent({ searchParams }: { searchParams: SearchParams }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">{t("流量分析")}</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					{t("配置 ANALYTICS_LIBSQL_URL 和 ANALYTICS_LIBSQL_AUTH_TOKEN 后即可启用第一方流量报表。")}
				</p>
			</main>
		);
	}

	const range = resolveRange(query);
	const report = await readTrafficReport(range);
	const types = new Map(report.byType.map((row) => [row.trafficType, row.sessions]));
	const topCountries = report.countries
		.filter((row) => row.countryCode !== "UNKNOWN")
		.slice(0, 5)
		.map((row) => row.countryCode);

	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-medium text-muted-foreground">{t("运营管理 / 数据分析")}</p>
					<h1 className="mt-1 text-h1">{t("流量分析")}</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{t("查看第一方流量趋势、付费与自然流量、流量来源和国家/地区对比。")}
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label={t("流量日期范围")}>
					{[
						["today", t("今天")],
						["7d", t("近 7 天")],
						["30d", t("近 30 天")],
						["month", t("本月")],
					].map(([value, label]) => (
						<Link
							key={value}
							href={`/ops/analytics/traffic?range=${value}`}
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

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<Metric label={t("会话数")} value={report.sessions} />
				<Metric label={t("付费流量")} value={types.get("paid") ?? 0} />
				<Metric label={t("自然流量")} value={types.get("organic") ?? 0} />
				<Metric label={t("直接访问")} value={types.get("direct") ?? 0} />
				<Metric label={t("引荐流量")} value={types.get("referral") ?? 0} />
			</section>

			<section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<RateMetric label={t("商品页到达率")} value={report.quality.productViews} total={report.sessions} />
				<RateMetric label={t("加购率")} value={report.quality.addToCarts} total={report.sessions} />
				<RateMetric label={t("结账率")} value={report.quality.checkouts} total={report.sessions} />
				<RateMetric label={t("购买转化率")} value={report.quality.purchaseSessions} total={report.sessions} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("流量趋势")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from, i18n)} – {formatDate(range.to, i18n)} ·{" "}
						{range.bucket === "hour" ? t("按小时") : t("按天")}
					</p>
				</div>
				<TrafficTrendChart points={report.trend} bucket={range.bucket} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("国家/地区流量趋势")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("对比所选时段流量最高的国家/地区。")}</p>
				</div>
				<CountryTrendChart
					key={`${range.from.toISOString()}:${range.to.toISOString()}:${topCountries.join(",")}`}
					buckets={report.trend.map((point) => point.bucket)}
					rows={report.countryTrend}
					countries={topCountries}
					bucket={range.bucket}
				/>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold">{t("按来源查看流量质量")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("对比获客规模、商品兴趣、加购意向、结账和购买转化。")}
						</p>
					</div>
					<p className="text-xs text-muted-foreground">{t("收入已扣除已追踪退款，不会跨币种相加。")}</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[980px] text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">{t("来源")}</th>
								<th className="pb-2 font-medium">{t("类型")}</th>
								<th className="pb-2 text-right font-medium">{t("会话数")}</th>
								<th className="pb-2 text-right font-medium">{t("商品页")}</th>
								<th className="pb-2 text-right font-medium">{t("加购")}</th>
								<th className="pb-2 text-right font-medium">{t("结账")}</th>
								<th className="pb-2 text-right font-medium">{t("订单")}</th>
								<th className="pb-2 text-right font-medium">{t("转化率")}</th>
								<th className="pb-2 text-right font-medium">{t("净收入")}</th>
							</tr>
						</thead>
						<tbody>
							{report.sources.map((row) => (
								<tr key={`${row.source}:${row.trafficType}`} className="border-t border-border/60">
									<td className="py-3 font-medium">{row.source}</td>
									<td className="py-3 text-muted-foreground">{formatTrafficType(row.trafficType, i18n)}</td>
									<td className="py-3 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.productViews, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.addToCarts, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.checkouts, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">{row.orders.toLocaleString()}</td>
									<td className="py-3 text-right font-medium tabular-nums">
										{formatRate(row.purchaseSessions, row.sessions)}
									</td>
									<td className="py-3 text-right">
										<RevenueCell values={row.revenueByCurrency} />
									</td>
								</tr>
							))}
							{report.sources.length === 0 ? (
								<tr>
									<td colSpan={9} className="py-8 text-center text-muted-foreground">
										{t("暂无流量质量数据。")}
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("按国家/地区查看流量质量")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("查看各市场增长来自付费还是自然流量，以及这些流量是否转化。")}
					</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[1080px] text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">{t("国家/地区")}</th>
								<th className="pb-2 text-right font-medium">{t("会话数")}</th>
								<th className="pb-2 text-right font-medium">{t("付费流量")}</th>
								<th className="pb-2 text-right font-medium">{t("自然流量")}</th>
								<th className="pb-2 text-right font-medium">{t("商品页")}</th>
								<th className="pb-2 text-right font-medium">{t("加购")}</th>
								<th className="pb-2 text-right font-medium">{t("结账")}</th>
								<th className="pb-2 text-right font-medium">{t("订单")}</th>
								<th className="pb-2 text-right font-medium">{t("转化率")}</th>
								<th className="pb-2 text-right font-medium">{t("净收入")}</th>
							</tr>
						</thead>
						<tbody>
							{report.countries.map((row) => (
								<tr key={row.countryCode} className="border-t border-border/60">
									<td className="py-3 font-medium">{row.countryCode}</td>
									<td className="py-3 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">{metricWithRate(row.paid, row.sessions)}</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.organic, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.productViews, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.addToCarts, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.checkouts, row.sessions)}
									</td>
									<td className="py-3 text-right tabular-nums">{row.orders.toLocaleString()}</td>
									<td className="py-3 text-right font-medium tabular-nums">
										{formatRate(row.purchaseSessions, row.sessions)}
									</td>
									<td className="py-3 text-right">
										<RevenueCell values={row.revenueByCurrency} />
									</td>
								</tr>
							))}
							{report.countries.length === 0 ? (
								<tr>
									<td colSpan={10} className="py-8 text-center text-muted-foreground">
										{t("暂无国家/地区数据。")}
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			<CustomRangeForm
				from={formatInputDate(range.from)}
				to={formatInputDate(new Date(range.to.getTime() - 1))}
			/>
		</main>
	);
}

function TrafficAnalyticsLoading() {
	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<div className="h-4 w-36 animate-pulse rounded bg-secondary" />
			<div className="mt-3 h-9 w-64 animate-pulse rounded bg-secondary" />
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				{Array.from({ length: 5 }).map((_, index) => (
					<div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
				))}
			</div>
			<div className="mt-8 h-80 animate-pulse rounded-xl border border-border bg-card" />
		</main>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
		</div>
	);
}

async function RateMetric({ label, value, total }: { label: string; value: number; total: number }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tabular-nums">{formatRate(value, total)}</p>
			<p className="mt-1 text-xs tabular-nums text-muted-foreground">
				{value.toLocaleString()} {t("个会话")}
			</p>
		</div>
	);
}

async function RevenueCell({ values }: { values: Array<{ currency: string; value: number }> }) {
	const i18n = await getOpsI18n();

	if (values.length === 0) return <span className="text-muted-foreground">—</span>;
	return (
		<div className="grid gap-0.5">
			{values.map((money) => (
				<span key={money.currency} className="whitespace-nowrap tabular-nums">
					{formatMoney(money.value, money.currency, i18n)}
				</span>
			))}
		</div>
	);
}

function metricWithRate(value: number, sessions: number): string {
	return `${value.toLocaleString()} · ${formatRate(value, sessions)}`;
}

function formatTrafficType(value: string, i18n: OpsI18n): string {
	const { t } = i18n;

	const labels: Record<string, string> = {
		paid: t("付费"),
		organic: t("自然"),
		direct: t("直接访问"),
		referral: t("引荐"),
		unknown: t("未知"),
	};
	return labels[value.toLowerCase()] ?? value;
}

function formatRate(value: number, total: number): string {
	if (total <= 0) return "0.00%";
	return `${((value / total) * 100).toFixed(2)}%`;
}

function formatMoney(value: number, currency: string, i18n: OpsI18n): string {
	const { t, locale } = i18n;

	if (currency === "UNKNOWN") return t("{v0} 未知币种", { v0: value.toFixed(2) });
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toFixed(2)} ${currency}`;
	}
}

async function CustomRangeForm({ from, to }: { from: string; to: string }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<form
			className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5"
			action="/ops/analytics/traffic"
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

function resolveRange(query: { range?: string; from?: string; to?: string }): {
	range: string;
	from: Date;
	to: Date;
	bucket: TrafficBucket;
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
				const bucket: TrafficBucket = duration <= 2 * 86_400_000 ? "hour" : "day";
				return { range: "custom", from, to, bucket };
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
