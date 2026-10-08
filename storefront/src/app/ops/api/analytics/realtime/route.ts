import { connection, NextResponse } from "next/server";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { readRealtimeAnalytics } from "@/lib/analytics/realtime-report";


export async function GET() {
	await connection();
	if (!analyticsDatabaseConfigured()) {
		return NextResponse.json({ error: "analytics_not_configured" }, { status: 503 });
	}
	try {
		const report = await readRealtimeAnalytics();
		return NextResponse.json(report, {
			headers: {
				"Cache-Control": "private, no-store, max-age=0",
			},
		});
	} catch (error) {
		console.error("[analytics/realtime] failed", error);
		return NextResponse.json({ error: "realtime_report_failed" }, { status: 500 });
	}
}
