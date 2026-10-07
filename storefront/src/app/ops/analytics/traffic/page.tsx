import Link from "next/link";
import { io } from "next/cache";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readTrafficReport, type TrafficBucket } from "@/lib/analytics/traffic-report";
import { CountryTrendChart } from "./country-trend-chart";
import { TrafficTrendChart } from "./traffic-trend-chart";

type SearchParams = Promise<{
	range?: string;
	from?: string;
	to?: string;
}>;

export default async function TrafficAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
	await io();
	const query = await searchParams;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">Traffic analytics</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					Configure ANALYTICS_LIBSQL_URL and ANALYTICS_LIBSQL_AUTH_TOKEN to enable first-party traffic reports.
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
					<p className="text-sm font-medium text-muted-foreground">Operations / Analytics</p>
					<h1 className="mt-1 text-h1">Traffic analytics</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						First-party traffic trends, paid vs organic acquisition, sources and country comparison.
					</p>
				</div>
				<nav className="flex flex-wrap gap-2" aria-label="Traffic date range">
					{[
						["today", "Today"],
						["7d", "7 days"],
						["30d", "30 days"],
						["month", "This month"],
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
					<Link href="/ops/analytics" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Overview
					</Link>
				</nav>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<Metric label="Sessions" value={report.sessions} />
				<Metric label="Paid" value={types.get("paid") ?? 0} />
				<Metric label="Organic" value={types.get("organic") ?? 0} />
				<Metric label="Direct" value={types.get("direct") ?? 0} />
				<Metric label="Referral" value={types.get("referral") ?? 0} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Traffic trend</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatDate(range.from)} – {formatDate(range.to)} · {range.bucket === "hour" ? "hourly" : "daily"}
					</p>
				</div>
				<TrafficTrendChart points={report.trend} bucket={range.bucket} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Country traffic trend</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Compare the highest-traffic countries over the selected period.
					</p>
				</div>
				<CountryTrendChart
					buckets={report.trend.map((point) => point.bucket)}
					rows={report.countryTrend}
					countries={topCountries}
					bucket={range.bucket}
				/>
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-2">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Traffic sources</h2>
					<div className="mt-5 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-muted-foreground"><tr><th className="pb-2 font-medium">Source</th><th className="pb-2 font-medium">Type</th><th className="pb-2 text-right font-medium">Sessions</th><th className="pb-2 text-right font-medium">Orders</th></tr></thead>
							<tbody>
								{report.sources.map((row) => (
									<tr key={`${row.source}:${row.trafficType}`} className="border-t border-border/60">
										<td className="py-3 font-medium">{row.source}</td>
										<td className="py-3 capitalize text-muted-foreground">{row.trafficType}</td>
										<td className="py-3 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
										<td className="py-3 text-right tabular-nums">{row.purchases.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Countries</h2>
					<p className="mt-1 text-sm text-muted-foreground">Traffic location is taken from trusted CDN / reverse-proxy geo headers when available.</p>
					<div className="mt-5 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-muted-foreground"><tr><th className="pb-2 font-medium">Country</th><th className="pb-2 text-right font-medium">Sessions</th><th className="pb-2 text-right font-medium">Paid</th><th className="pb-2 text-right font-medium">Organic</th><th className="pb-2 text-right font-medium">Orders</th></tr></thead>
							<tbody>
								{report.countries.map((row) => (
									<tr key={row.countryCode} className="border-t border-border/60">
										<td className="py-3 font-medium">{row.countryCode}</td>
										<td className="py-3 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
										<td className="py-3 text-right tabular-nums">{row.paid.toLocaleString()}</td>
										<td className="py-3 text-right tabular-nums">{row.organic.toLocaleString()}</td>
										<td className="py-3 text-right tabular-nums">{row.purchases.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<CustomRangeForm from={formatInputDate(range.from)} to={formatInputDate(new Date(range.to.getTime() - 1))} />
		</main>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return <div className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>;
}


function CustomRangeForm({ from, to }: { from: string; to: string }) {
	return (
		<form className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5" action="/ops/analytics/traffic">
			<input type="hidden" name="range" value="custom" />
			<label className="grid gap-1 text-sm"><span className="text-muted-foreground">From</span><input className="rounded-lg border border-border bg-background px-3 py-2" type="date" name="from" defaultValue={from} required /></label>
			<label className="grid gap-1 text-sm"><span className="text-muted-foreground">To</span><input className="rounded-lg border border-border bg-background px-3 py-2" type="date" name="to" defaultValue={to} required /></label>
			<button className="rounded-lg bg-foreground px-4 py-2 text-sm text-background" type="submit">Apply range</button>
		</form>
	);
}

function resolveRange(query: { range?: string; from?: string; to?: string }): { range: string; from: Date; to: Date; bucket: TrafficBucket } {
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

