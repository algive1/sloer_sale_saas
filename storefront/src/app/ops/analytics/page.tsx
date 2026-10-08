import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { readAnalyticsSummary } from "@/lib/analytics/first-party-store";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";

const FUNNEL_ORDER = [
	"page_viewed",
	"product_viewed",
	"wishlist_added",
	"product_added_to_cart",
	"cart_viewed",
	"checkout_started",
	"payment_method_selected",
	"checkout_completed",
] as const;

const LABELS: Record<string, string> = {
	page_viewed: "Sessions / page views",
	product_viewed: "Product views",
	wishlist_added: "Wishlist",
	product_added_to_cart: "Add to cart",
	cart_viewed: "View cart",
	checkout_started: "Checkout",
	payment_method_selected: "Payment",
	checkout_completed: "Purchase",
};

export default function AnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<{ days?: string }>;
}) {
	return (
		<Suspense fallback={<DashboardSkeleton />}>
			<AnalyticsDashboard searchParams={searchParams} />
		</Suspense>
	);
}

async function AnalyticsDashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
	await io();
	const query = await searchParams;
	const requested = Number(query.days ?? "30");
	const days = [7, 30, 90].includes(requested) ? requested : 30;

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-5xl px-6 py-16">
				<h1 className="text-h1">Marketing analytics</h1>
				<div className="mt-8 rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">First-party analytics database is not configured</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						Set ANALYTICS_LIBSQL_URL and ANALYTICS_LIBSQL_AUTH_TOKEN on the server. The storefront keeps
						working without them, but first-party funnel history and cloud wishlist storage remain disabled.
					</p>
				</div>
			</main>
		);
	}

	const summary = await readAnalyticsSummary(days);
	if (!summary) return null;
	const conversion = summary.sessions > 0 ? (summary.purchases / summary.sessions) * 100 : 0;
	const funnel = new Map(summary.funnel.map((row) => [row.name, row.count]));
	const maxFunnel = Math.max(1, ...FUNNEL_ORDER.map((name) => funnel.get(name) ?? 0));

	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-medium text-muted-foreground">Operations</p>
					<h1 className="mt-1 text-h1">Marketing analytics</h1>
					<p className="mt-2 text-sm text-muted-foreground">First-party behavior and attributed commerce events.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link href="/ops/analytics/traffic" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Traffic
					</Link>
					<Link href="/ops/analytics/checkout" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Checkout
					</Link>
					<Link href="/ops/analytics/products" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
						Products
					</Link>
					<nav className="flex gap-2" aria-label="Date range">
						{[7, 30, 90].map((range) => (
							<a
								key={range}
								href={`/ops/analytics?days=${range}`}
								className={`rounded-lg border px-3 py-2 text-sm ${range === days ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}
							>
								{range}d
							</a>
						))}
					</nav>
				</div>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				<Metric label="Sessions" value={summary.sessions.toLocaleString()} />
				<Metric label="Purchases" value={summary.purchases.toLocaleString()} />
				<Metric label="Conversion" value={`${conversion.toFixed(2)}%`} />
				<Metric label="Abandoned checkout" value={summary.abandonedCheckouts.toLocaleString()} />
				<Metric label="Payment failures" value={summary.paymentFailures.toLocaleString()} />
				<Metric label="Tracked events" value={summary.totalEvents.toLocaleString()} />
			</section>

			<section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{summary.revenueByCurrency.map((row) => (
					<Metric
						key={row.currency}
						label={`Revenue · ${row.currency}`}
						value={formatMoney(row.value, row.currency)}
					/>
				))}
				{summary.revenueByCurrency.length === 0 ? <Metric label="Revenue" value="—" /> : null}
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Conversion funnel</h2>
					<p className="mt-1 text-sm text-muted-foreground">Distinct sessions that reached each stage.</p>
					<div className="mt-6 space-y-4">
						{FUNNEL_ORDER.map((name) => {
							const count = funnel.get(name) ?? 0;
							return (
								<div key={name}>
									<div className="mb-1.5 flex justify-between gap-4 text-sm">
										<span>{LABELS[name]}</span>
										<span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
									</div>
									<div className="h-2 overflow-hidden rounded-full bg-secondary">
										<div className="h-full rounded-full bg-foreground" style={{ width: `${(count / maxFunnel) * 100}%` }} />
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Traffic sources</h2>
					<div className="mt-5 overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-muted-foreground">
								<tr className="border-b border-border">
									<th className="pb-2 font-medium">Source</th>
									<th className="pb-2 text-right font-medium">Sessions</th>
									<th className="pb-2 text-right font-medium">Orders</th>
									<th className="pb-2 text-right font-medium">Revenue</th>
								</tr>
							</thead>
							<tbody>
								{summary.sources.map((row) => (
									<tr key={row.source} className="border-b border-border/60 last:border-0">
										<td className="py-3">{row.source}</td>
										<td className="py-3 text-right tabular-nums">{row.sessions}</td>
										<td className="py-3 text-right tabular-nums">{row.purchases}</td>
										<td className="py-3 text-right tabular-nums">
											{row.revenueByCurrency.length > 0
												? row.revenueByCurrency.map((money) => formatMoney(money.value, money.currency)).join(" · ")
												: "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold">Recent events</h2>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr className="border-b border-border">
								<th className="pb-2 font-medium">Time</th>
								<th className="pb-2 font-medium">Event</th>
								<th className="pb-2 font-medium">Channel</th>
								<th className="pb-2 font-medium">Source</th>
								<th className="pb-2 text-right font-medium">Value</th>
							</tr>
						</thead>
						<tbody>
							{summary.recent.map((event, index) => (
								<tr key={`${event.occurredAt}:${event.name}:${index}`} className="border-b border-border/60 last:border-0">
									<td className="whitespace-nowrap py-3 text-muted-foreground">{new Date(event.occurredAt).toISOString().replace("T", " ").slice(0, 19)}</td>
									<td className="py-3 font-medium">{event.name}</td>
									<td className="py-3">{event.channel || "—"}</td>
									<td className="py-3">{event.source}</td>
									<td className="py-3 text-right tabular-nums">{event.currency ? formatMoney(event.value, event.currency) : "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
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

function formatMoney(value: number, currency: string): string {
	if (!currency || currency === "UNKNOWN") return value.toLocaleString();
	try {
		return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
	} catch {
		return `${value.toLocaleString()} ${currency}`;
	}
}

function DashboardSkeleton() {
	return <div className="mx-auto mt-10 h-96 max-w-7xl animate-pulse rounded-xl bg-secondary" />;
}
