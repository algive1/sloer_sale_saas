import Link from "next/link";
import { io } from "next/cache";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readCheckoutReport, type CheckoutBucket } from "@/lib/analytics/checkout-report";
import { CheckoutTrendChart } from "./checkout-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default async function CheckoutAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	await io();
	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">Checkout analytics</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					Configure ANALYTICS_LIBSQL_URL and ANALYTICS_LIBSQL_AUTH_TOKEN to enable first-party checkout reports.
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
					<p className="text-sm font-medium text-muted-foreground">Operations / Analytics</p>
					<h1 className="mt-1 text-h1">Checkout analytics</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Checkout progression, abandonment, payment failures and method conversion.
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label="Checkout date range">
					{[
						["today", "Today"],
						["7d", "7 days"],
						["30d", "30 days"],
						["month", "This month"],
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
					<Link href="/ops/analytics/traffic" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Traffic
					</Link>
					<Link href="/ops/analytics" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Overview
					</Link>
				</nav>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
				<Metric label="Checkout started" value={report.summary.started.toLocaleString()} />
				<Metric label="Purchase sessions" value={report.summary.purchaseSessions.toLocaleString()} />
				<Metric label="Completion rate" value={completionRate} />
				<Metric label="Orders" value={report.summary.orders.toLocaleString()} />
				<Metric label="Payment failures" value={report.summary.paymentFailures.toLocaleString()} />
				<Metric label="Checkout failures" value={report.summary.checkoutFailures.toLocaleString()} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Checkout trend</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from)} – {formatDate(range.to)} · {range.bucket === "hour" ? "hourly" : "daily"}
					</p>
				</div>
				<CheckoutTrendChart points={report.trend} bucket={range.bucket} />
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Checkout funnel</h2>
					<p className="mt-1 text-sm text-muted-foreground">Distinct sessions that reached each checkout stage.</p>
					<div className="mt-6 space-y-4">
						{report.funnel.map((row, index) => {
							const first = report.funnel[0]?.count ?? 0;
							const previous = index === 0 ? row.count : report.funnel[index - 1]?.count ?? 0;
							const width = first > 0 ? Math.max(2, (row.count / first) * 100) : 0;
							const stepRate = index === 0 ? "100.00%" : formatRate(row.count, previous);
							return (
								<div key={row.key}>
									<div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
										<div>
											<span className="font-medium">{row.label}</span>
											{index > 0 ? <span className="ml-2 text-xs text-muted-foreground">{stepRate} from previous</span> : null}
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
					<h2 className="text-lg font-semibold">Abandonment by last stage</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Sessions inactive for at least one hour with no completed purchase.
					</p>
					<div className="mt-5 space-y-3">
						{report.abandonment.map((row) => (
							<div key={row.stage} className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0">
								<span className="text-sm">{row.stage}</span>
								<span className="font-medium tabular-nums">{row.count.toLocaleString()}</span>
							</div>
						))}
						{report.abandonment.length === 0 ? <p className="text-sm text-muted-foreground">No abandoned checkout sessions yet.</p> : null}
					</div>
				</div>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Failure diagnostics</h2>
					<p className="mt-1 text-sm text-muted-foreground">Grouped payment and checkout failures, ordered by frequency.</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="min-w-[960px] w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">Type</th>
								<th className="pb-2 font-medium">Stage</th>
								<th className="pb-2 font-medium">Provider</th>
								<th className="pb-2 font-medium">Code</th>
								<th className="pb-2 font-medium">Reason</th>
								<th className="pb-2 text-right font-medium">Sessions</th>
								<th className="pb-2 text-right font-medium">Occurrences</th>
							</tr>
						</thead>
						<tbody>
							{report.failures.map((row, index) => (
								<tr key={`${row.kind}:${row.stage}:${row.provider}:${row.code}:${index}`} className="border-t border-border/60">
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
								<tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No checkout failures in this period.</td></tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-2">
				<MethodTable title="Payment method performance" rows={report.paymentMethods} />
				<MethodTable title="Shipping method performance" rows={report.shippingMethods} />
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

function MethodTable({
	title,
	rows,
}: {
	title: string;
	rows: Array<{ method: string; selectedSessions: number; purchaseSessions: number }>;
}) {
	return (
		<div className="rounded-xl border border-border bg-card p-6">
			<h2 className="text-lg font-semibold">{title}</h2>
			<div className="mt-5 overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead className="text-muted-foreground">
						<tr>
							<th className="pb-2 font-medium">Method</th>
							<th className="pb-2 text-right font-medium">Selected</th>
							<th className="pb-2 text-right font-medium">Purchased</th>
							<th className="pb-2 text-right font-medium">Conversion</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.method} className="border-t border-border/60">
								<td className="py-3 font-medium">{row.method}</td>
								<td className="py-3 text-right tabular-nums">{row.selectedSessions.toLocaleString()}</td>
								<td className="py-3 text-right tabular-nums">{row.purchaseSessions.toLocaleString()}</td>
								<td className="py-3 text-right font-medium tabular-nums">{formatRate(row.purchaseSessions, row.selectedSessions)}</td>
							</tr>
						))}
						{rows.length === 0 ? (
							<tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No method data yet.</td></tr>
						) : null}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function CustomRangeForm({ from, to }: { from: string; to: string }) {
	return (
		<form className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5" action="/ops/analytics/checkout">
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

function formatRate(value: number, total: number): string {
	if (total <= 0) return "0.00%";
	return `${((value / total) * 100).toFixed(2)}%`;
}

function resolveRange(query: { range?: string; from?: string; to?: string }): { range: string; from: Date; to: Date; bucket: CheckoutBucket } {
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
