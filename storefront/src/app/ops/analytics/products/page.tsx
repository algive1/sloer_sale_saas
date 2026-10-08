import Link from "next/link";
import { io } from "next/cache";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readProductReport, type ProductBucket } from "@/lib/analytics/product-report";
import { ProductTrendChart } from "./product-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default async function ProductAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	await io();
	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">Product analytics</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					Configure ANALYTICS_LIBSQL_URL and ANALYTICS_LIBSQL_AUTH_TOKEN to enable first-party product reports.
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
					<p className="text-sm font-medium text-muted-foreground">Operations / Analytics</p>
					<h1 className="mt-1 text-h1">Product analytics</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Product and SKU engagement from view through cart, checkout and purchase.
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label="Product analytics date range">
					{[
						["today", "Today"],
						["7d", "7 days"],
						["30d", "30 days"],
						["month", "This month"],
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
					<Link href="/ops/analytics/traffic" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Traffic
					</Link>
					<Link href="/ops/analytics/checkout" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Checkout
					</Link>
					<Link href="/ops/analytics" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Overview
					</Link>
				</nav>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
				<Metric label="Tracked products / variants" value={report.summary.trackedProducts.toLocaleString()} />
				<Metric label="Product-view sessions" value={report.summary.productViewSessions.toLocaleString()} />
				<Metric label="Add-to-cart sessions" value={report.summary.addToCartSessions.toLocaleString()} />
				<Metric label="Purchase sessions" value={report.summary.purchaseSessions.toLocaleString()} />
				<Metric label="View → purchase CVR" value={formatRate(report.summary.purchaseSessions, report.summary.productViewSessions)} />
				<Metric label="Units sold" value={report.summary.unitsSold.toLocaleString()} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Top product trend</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from)} – {formatDate(range.to)} · compare Views, Add to cart or Purchases.
					</p>
				</div>
				<ProductTrendChart rows={report.trend} products={trendProducts} bucket={range.bucket} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold">Product and SKU performance</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Session-based funnel quality per product variant.
						</p>
					</div>
					<p className="max-w-xl text-xs text-muted-foreground">
						Purchased item value uses tracked item unit prices × quantities at purchase time. Refunds are not allocated to individual SKUs unless item-level refund data is available.
					</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="min-w-[1180px] w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">Product / SKU</th>
								<th className="pb-2 text-right font-medium">Views</th>
								<th className="pb-2 text-right font-medium">Wishlist</th>
								<th className="pb-2 text-right font-medium">Add to cart</th>
								<th className="pb-2 text-right font-medium">Checkout</th>
								<th className="pb-2 text-right font-medium">Purchase sessions</th>
								<th className="pb-2 text-right font-medium">View → purchase</th>
								<th className="pb-2 text-right font-medium">Cart → purchase</th>
								<th className="pb-2 text-right font-medium">Units</th>
								<th className="pb-2 text-right font-medium">Purchased item value</th>
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
									<td className="py-3 text-right tabular-nums">{metricWithRate(row.wishlists, row.productViews)}</td>
									<td className="py-3 text-right tabular-nums">{metricWithRate(row.addToCarts, row.productViews)}</td>
									<td className="py-3 text-right tabular-nums">{metricWithRate(row.checkouts, row.productViews)}</td>
									<td className="py-3 text-right tabular-nums">{row.purchaseSessions.toLocaleString()}</td>
									<td className="py-3 text-right font-medium tabular-nums">{formatRate(row.purchaseSessions, row.productViews)}</td>
									<td className="py-3 text-right font-medium tabular-nums">{formatRate(row.purchaseSessions, row.addToCarts)}</td>
									<td className="py-3 text-right tabular-nums">{row.unitsSold.toLocaleString()}</td>
									<td className="py-3 text-right"><MoneyCell values={row.purchasedItemValue} /></td>
								</tr>
							))}
							{report.products.length === 0 ? (
								<tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No product analytics data yet.</td></tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			<CustomRangeForm from={formatInputDate(range.from)} to={formatInputDate(new Date(range.to.getTime() - 1))} />
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

function MoneyCell({ values }: { values: Array<{ currency: string; value: number }> }) {
	if (values.length === 0) return <span className="text-muted-foreground">—</span>;
	return (
		<div className="grid gap-0.5">
			{values.map((money) => (
				<span key={money.currency} className="whitespace-nowrap tabular-nums">
					{formatMoney(money.value, money.currency)}
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

function formatMoney(value: number, currency: string): string {
	if (currency === "UNKNOWN") return `${value.toFixed(2)} UNKNOWN`;
	try {
		return new Intl.NumberFormat("en", {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toFixed(2)} ${currency}`;
	}
}

function CustomRangeForm({ from, to }: { from: string; to: string }) {
	return (
		<form className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5" action="/ops/analytics/products">
			<input type="hidden" name="range" value="custom" />
			<label className="grid gap-1 text-sm">
				<span className="text-muted-foreground">From</span>
				<input className="rounded-lg border border-border bg-background px-3 py-2" type="date" name="from" defaultValue={from} required />
			</label>
			<label className="grid gap-1 text-sm">
				<span className="text-muted-foreground">To</span>
				<input className="rounded-lg border border-border bg-background px-3 py-2" type="date" name="to" defaultValue={to} required />
			</label>
			<button className="rounded-lg bg-foreground px-4 py-2 text-sm text-background" type="submit">Apply range</button>
		</form>
	);
}

function resolveRange(query: { range?: string; from?: string; to?: string }): { range: string; from: Date; to: Date; bucket: ProductBucket } {
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
	return { range: days === 7 ? "7d" : "30d", from: new Date(now.getTime() - days * 86_400_000), to: now, bucket: "day" };
}

function parseDate(value: string | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatInputDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
