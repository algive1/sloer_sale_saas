"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { RealtimeAnalytics } from "@/lib/analytics/realtime-report";
import { RealtimeTrendChart } from "./realtime-trend-chart";

const REFRESH_MS = 10_000;

export function RealtimeDashboard({ initialData }: { initialData: RealtimeAnalytics }) {
	const [data, setData] = useState(initialData);
	const [paused, setPaused] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		if (paused) return;

		let active = true;
		const controller = new AbortController();

		async function refresh() {
			if (!active) return;
			setRefreshing(true);
			try {
				const response = await fetch("/ops/api/analytics/realtime", {
					cache: "no-store",
					credentials: "same-origin",
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const next = (await response.json()) as RealtimeAnalytics;
				if (!active) return;
				setData(next);
				setError(null);
			} catch (reason) {
				if (!active || controller.signal.aborted) return;
				setError(reason instanceof Error ? reason.message : "Refresh failed");
			} finally {
				if (active) setRefreshing(false);
			}
		}

		const timer = window.setInterval(() => {
			void refresh();
		}, REFRESH_MS);

		return () => {
			active = false;
			controller.abort();
			window.clearInterval(timer);
		};
	}, [paused]);

	const maxSource = Math.max(1, ...data.sources.map((row) => row.sessions));
	const maxCountry = Math.max(1, ...data.countries.map((row) => row.sessions));

	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<span className={`h-2.5 w-2.5 rounded-full ${paused ? "bg-muted-foreground" : "bg-emerald-500"}`} aria-hidden="true" />
						<p className="text-sm font-medium text-muted-foreground">Operations / Live</p>
					</div>
					<h1 className="mt-1 text-h1">Realtime analytics</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						“Active” means a session produced at least one tracked event in the last {data.windowMinutes} minutes.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{refreshing ? "Refreshing…" : paused ? "Paused" : "Auto-refresh 10s"} · updated {formatLocalTime(data.generatedAt)}
					</span>
					{error ? <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive">Refresh error</span> : null}
					<button
						type="button"
						onClick={() => setPaused((value) => !value)}
						className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
					>
						{paused ? "Resume" : "Pause"}
					</button>
					<Link href="/ops/analytics/traffic" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">Traffic</Link>
					<Link href="/ops/analytics/products" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">Products</Link>
					<Link href="/ops/analytics/checkout" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">Checkout</Link>
					<Link href="/ops/analytics" className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">Overview</Link>
				</div>
			</header>

			<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
				<Metric label="Active sessions · 5m" value={data.summary.activeSessions.toLocaleString()} />
				<Metric label="Events · 5m" value={data.summary.events.toLocaleString()} />
				<Metric label="Add-to-cart sessions" value={data.summary.addToCartSessions.toLocaleString()} />
				<Metric label="Checkout sessions" value={data.summary.checkoutSessions.toLocaleString()} />
				<Metric label="Orders · 5m" value={data.summary.orders.toLocaleString()} />
				<Metric label="Payment failures" value={data.summary.paymentFailures.toLocaleString()} />
				<Metric label="Sales · 5m" value={formatSales(data.salesByCurrency)} />
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Last 30 minutes</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Minute-level activity. Move across the chart or click/tap a point to pin its data bubble.
					</p>
				</div>
				<div className="mt-5">
					<RealtimeTrendChart points={data.trend} />
				</div>
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-2">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Live traffic sources</h2>
					<p className="mt-1 text-sm text-muted-foreground">Distinct active sessions in the last {data.windowMinutes} minutes.</p>
					<div className="mt-5 space-y-4">
						{data.sources.map((row) => (
							<div key={`${row.source}:${row.trafficType}`}>
								<div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
									<span><span className="font-medium">{row.source}</span> <span className="capitalize text-muted-foreground">· {row.trafficType}</span></span>
									<span className="tabular-nums">{row.sessions.toLocaleString()}</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-secondary">
									<div className="h-full rounded-full bg-foreground" style={{ width: `${(row.sessions / maxSource) * 100}%` }} />
								</div>
							</div>
						))}
						{data.sources.length === 0 ? <Empty>No live source data.</Empty> : null}
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Live countries</h2>
					<p className="mt-1 text-sm text-muted-foreground">Based on trusted CDN / reverse-proxy geo headers.</p>
					<div className="mt-5 space-y-4">
						{data.countries.map((row) => (
							<div key={row.countryCode}>
								<div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
									<span className="font-medium">{row.countryCode}</span>
									<span className="tabular-nums">{row.sessions.toLocaleString()}</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-secondary">
									<div className="h-full rounded-full bg-foreground" style={{ width: `${(row.sessions / maxCountry) * 100}%` }} />
								</div>
							</div>
						))}
						{data.countries.length === 0 ? <Empty>No live country data.</Empty> : null}
					</div>
				</div>
			</section>

			<section className="mt-8 rounded-xl border border-border bg-card p-6">
				<div>
					<h2 className="text-lg font-semibold">Active products</h2>
					<p className="mt-1 text-sm text-muted-foreground">Product activity in the last {data.windowMinutes} minutes.</p>
				</div>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[760px] text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="pb-2 font-medium">Product / SKU</th>
								<th className="pb-2 text-right font-medium">Viewing</th>
								<th className="pb-2 text-right font-medium">Add to cart</th>
								<th className="pb-2 text-right font-medium">Purchase</th>
							</tr>
						</thead>
						<tbody>
							{data.topProducts.map((row) => (
								<tr key={row.itemKey} className="border-t border-border/60">
									<td className="py-3">
										<div className="font-medium">{row.itemName || row.itemKey}</div>
										<div className="text-xs text-muted-foreground">{row.sku || row.itemKey}</div>
									</td>
									<td className="py-3 text-right tabular-nums">{row.viewSessions.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">{row.addToCartSessions.toLocaleString()}</td>
									<td className="py-3 text-right tabular-nums">{row.purchaseSessions.toLocaleString()}</td>
								</tr>
							))}
							{data.topProducts.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No live product activity.</td></tr> : null}
						</tbody>
					</table>
				</div>
			</section>

			<section className="mt-8 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Recent orders</h2>
					<p className="mt-1 text-sm text-muted-foreground">Completed orders from the last hour.</p>
					<div className="mt-5 overflow-x-auto">
						<table className="w-full min-w-[560px] text-left text-sm">
							<thead className="text-muted-foreground">
								<tr><th className="pb-2 font-medium">Time</th><th className="pb-2 font-medium">Market</th><th className="pb-2 font-medium">Source</th><th className="pb-2 text-right font-medium">Value</th></tr>
							</thead>
							<tbody>
								{data.recentOrders.map((row, index) => (
									<tr key={`${row.transactionId}:${row.occurredAt}:${index}`} className="border-t border-border/60">
										<td className="whitespace-nowrap py-3 text-muted-foreground">{formatLocalTime(row.occurredAt)}</td>
										<td className="py-3">{row.countryCode}</td>
										<td className="py-3">{row.source}</td>
										<td className="py-3 text-right font-medium tabular-nums">{formatMoney(row.value, row.currency)}</td>
									</tr>
								))}
								{data.recentOrders.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No recent orders.</td></tr> : null}
							</tbody>
						</table>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<h2 className="text-lg font-semibold">Live event feed</h2>
					<p className="mt-1 text-sm text-muted-foreground">Newest first-party events from the current five-minute window.</p>
					<div className="mt-5 divide-y divide-border/60">
						{data.recentEvents.map((event, index) => (
							<div key={`${event.occurredAt}:${event.name}:${index}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[82px_170px_1fr_auto] sm:items-center">
								<span className="text-xs tabular-nums text-muted-foreground">{formatLocalTime(event.occurredAt)}</span>
								<span className="font-medium">{event.name}</span>
								<span className="min-w-0 truncate text-muted-foreground">
									{event.countryCode} · {event.source}{event.itemName ? ` · ${event.itemName}` : ""}
								</span>
								<span className="text-right tabular-nums">{event.currency ? formatMoney(event.value, event.currency) : ""}</span>
							</div>
						))}
						{data.recentEvents.length === 0 ? <Empty>No live events in the current window.</Empty> : null}
					</div>
				</div>
			</section>

			{error ? <p className="mt-4 text-xs text-destructive">Last refresh failed: {error}. Existing data remains visible.</p> : null}
		</main>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</p>
		</div>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="py-5 text-sm text-muted-foreground">{children}</p>;
}

function formatSales(values: RealtimeAnalytics["salesByCurrency"]): string {
	if (values.length === 0) return "—";
	return values.map((row) => formatMoney(row.value, row.currency)).join(" · ");
}

function formatMoney(value: number, currency: string): string {
	if (!currency || currency === "UNKNOWN") return value.toLocaleString();
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			maximumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toLocaleString()} ${currency}`;
	}
}

function formatLocalTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}
