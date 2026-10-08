import { Suspense } from "react";
import { connection } from "next/server";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readRealtimeAnalytics, type RealtimeAnalytics } from "@/lib/analytics/realtime-report";
import { RealtimeDashboard } from "./realtime-dashboard";

export default function RealtimeAnalyticsPage() {
	return (
		<Suspense fallback={<RealtimeAnalyticsLoading />}>
			<RealtimeAnalyticsContent />
		</Suspense>
	);
}

async function RealtimeAnalyticsContent() {
	await connection();

	if (!analyticsDatabaseConfigured()) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">Realtime analytics</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					Configure ANALYTICS_LIBSQL_URL and ANALYTICS_LIBSQL_AUTH_TOKEN to enable realtime first-party analytics.
				</p>
			</main>
		);
	}

	const initialData = await loadRealtimeAnalytics();
	if (!initialData) {
		return (
			<main className="mx-auto max-w-7xl px-6 py-10">
				<h1 className="text-h1">Realtime analytics</h1>
				<div className="mt-6 rounded-xl border border-border bg-card p-6">
					<p className="text-sm text-muted-foreground">
						Realtime analytics is temporarily unavailable. The commerce storefront is unaffected.
					</p>
				</div>
			</main>
		);
	}

	return <RealtimeDashboard initialData={initialData} />;
}

async function loadRealtimeAnalytics(): Promise<RealtimeAnalytics | null> {
	try {
		return await readRealtimeAnalytics();
	} catch (error) {
		console.error("[analytics/realtime-page] failed", error);
		return null;
	}
}

function RealtimeAnalyticsLoading() {
	return (
		<main className="mx-auto max-w-7xl px-6 py-10">
			<div className="h-4 w-32 animate-pulse rounded bg-secondary" />
			<div className="mt-3 h-9 w-64 animate-pulse rounded bg-secondary" />
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
				{Array.from({ length: 7 }).map((_, index) => (
					<div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
				))}
			</div>
			<div className="mt-8 h-80 animate-pulse rounded-xl border border-border bg-card" />
		</main>
	);
}
