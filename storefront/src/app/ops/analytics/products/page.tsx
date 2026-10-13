import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { OpsI18n } from "@/lib/ops/i18n";
import Link from "next/link";
import { Suspense } from "react";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readProductReport, type ProductBucket } from "@/plugins/analytics/product-report";
import { ProductTrendChart } from "./product-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default function ProductAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	return (
		<Suspense fallback={<ProductAnalyticsLoading />}>
			<ProductAnalyticsContent searchParams={searchParams} />
		</Suspense>
	);
}

async function ProductAnalyticsContent({ searchParams }: { searchParams: SearchParams }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">{t("商品分析")}</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					{t("配置 ANALYTICS_LIBSQL_URL 和 ANALYTICS_LIBSQL_AUTH_TOKEN 后即可启用第一方商品报表。")}
				</p>
			</main>
		);
	}

	const range = resolveRange(query);
	const report = await readProductReport(range);
	const trendProducts = report.products
		.filter((row) => row.productViews > 0)
		.slice(0, 5)
		.map((row) => ({
			itemKey: row.itemKey,
			label: row.sku ? `${row.itemName} · ${row.sku}` : row.itemName,
		}));

	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-medium text-muted-foreground">{t("运营管理 / 数据分析")}</p>
					<h1 className="mt-1 text-h1">{t("商品分析")}</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{t("追踪商品和 SKU 从浏览、加购、结账到购买的表现。")}
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label={t("商品分析日期范围")}>
					{[
						["today", t("今天")],
						["7d", t("近 7 天")],
						["30d", t("近 30 天")],
						["month", t("本月")],
					].map(([value, label]) => (
						<Link
							key={value}
							href={`/ops/analytics/products?range=${value}`}
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
						href="/ops/analytics/checkout"
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{t("结账分析")}
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
				<Metric label={t("已追踪商品 / 变体")} value={report.summary.trackedProducts.toLocaleString()} />
				<Metric label={t("商品浏览会话")} value={report.summary.productViewSessions.toLocaleString()} />
				<Metric label={t("加购会话")} value={report.summary.addToCartSessions.toLocaleString()} />
				<Metric label={t("购买会话")} value={report.summary.purchaseSessions.toLocaleString()} />
				<Metric
					label={t("浏览到购买转化率")}
					value={formatRate(report.summary.purchaseSessions, report.summary.productViewSessions)}
				/>
				<Metric label={t("售出件数")} value={report.summary.unitsSold.toLocaleString()} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">{t("重点商品趋势")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from, i18n)} – {formatDate(range.to, i18n)}{" "}
						{t("· 可对比浏览、加购和购买数据。")}
					</p>
				</div>
				<ProductTrendChart rows={report.trend} products={trendProducts} bucket={range.bucket} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold">{t("商品与 SKU 表现")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("按商品变体查看会话漏斗表现。")}</p>
					</div>
					<p className="max-w-xl text-xs text-muted-foreground">
						{t(
							"购买商品金额按购买时追踪到的单价乘数量计算。除非有商品级退款数据，否则退款不会分摊到单个 SKU。",
						)}
					</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[1180px] text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">{t("商品 / SKU")}</th>
								<th className="pb-2 text-right font-medium">{t("浏览")}</th>
								<th className="pb-2 text-right font-medium">{t("收藏")}</th>
								<th className="pb-2 text-right font-medium">{t("加购")}</th>
								<th className="pb-2 text-right font-medium">{t("结账")}</th>
								<th className="pb-2 text-right font-medium">{t("购买会话")}</th>
								<th className="pb-2 text-right font-medium">{t("浏览到购买")}</th>
								<th className="pb-2 text-right font-medium">{t("加购到购买")}</th>
								<th className="pb-2 text-right font-medium">{t("售出件数")}</th>
								<th className="pb-2 text-right font-medium">{t("商品购买金额")}</th>
							</tr>
						</thead>
						<tbody>
							{report.products.map((row) => (
								<tr key={row.itemKey} className="border-t border-border/60">
									<td className="py-3">
										<div className="max-w-64 font-medium">{row.itemName}</div>
										<div className="mt-0.5 text-xs text-muted-foreground">{row.sku || row.itemKey}</div>
									</td>
									<td className="py-3 text-right tabular-nums">{row.productViews.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.wishlists, row.productViews)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.addToCarts, row.productViews)}
									</td>
									<td className="py-3 text-right tabular-nums">
										{metricWithRate(row.checkouts, row.productViews)}
									</td>
									<td className="py-3 text-right tabular-nums">{row.purchaseSessions.toLocaleString()}</td>
									<td className="py-3 text-right font-medium tabular-nums">
										{formatRate(row.purchaseSessions, row.productViews)}
									</td>
									<td className="py-3 text-right font-medium tabular-nums">
										{formatRate(row.purchaseSessions, row.addToCarts)}
									</td>
									<td className="py-3 text-right tabular-nums">{row.unitsSold.toLocaleString()}</td>
									<td className="py-3 text-right">
										<MoneyCell values={row.purchasedItemValue} />
									</td>
								</tr>
							))}
							{report.products.length === 0 ? (
								<tr>
									<td colSpan={10} className="py-8 text-center text-muted-foreground">
										{t("暂无商品分析数据。")}
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

function ProductAnalyticsLoading() {
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

async function MoneyCell({ values }: { values: Array<{ currency: string; value: number }> }) {
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

function metricWithRate(value: number, total: number): string {
	return `${value.toLocaleString()} · ${formatRate(value, total)}`;
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
			action="/ops/analytics/products"
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
	bucket: ProductBucket;
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
