import { io } from "next/cache";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readRealtimeAnalytics } from "@/lib/analytics/realtime-report";
import { RealtimeDashboard } from "./realtime-dashboard";

export default async function RealtimeAnalyticsPage() {
	await io();

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

	try {
		const initialData = await readRealtimeAnalytics();
		return <RealtimeDashboard initialData={initialData} />;
	} catch (error) {
		console.error("[analytics/realtime-page] failed", error);
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
}
