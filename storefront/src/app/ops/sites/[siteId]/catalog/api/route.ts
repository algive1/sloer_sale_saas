import { NextResponse } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { CATALOG_CSV_COLUMNS, csvFile, validateCatalogCsv } from "@/lib/ops/catalog-csv";
import { readCatalogAudit } from "@/lib/ops/catalog-audit";
import { readCatalogCsvBody } from "@/lib/ops/catalog-csv-body";
import { preflightNativeCatalogCsv } from "@/lib/ops/catalog-native-preflight";

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
	const viewer = await currentOpsViewer();
	const { siteId } = await params;
	if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId)))
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	const site = getBrandSites()?.find((site) => site.id === siteId);
	if (!site) return NextResponse.json({ error: "unknown_brand" }, { status: 404 });
	const query = new URL(request.url).searchParams;
	if (query.get("report") === "1") {
		const channel = query.get("channel") ?? site.defaultChannel;
		if (!site.channels.includes(channel))
			return NextResponse.json({ error: "invalid_brand_market" }, { status: 400 });
		try {
			return NextResponse.json(
				await readCatalogAudit(siteId, viewer, channel, query.get("after") ?? undefined),
				{ headers: { "Cache-Control": "private, no-store" } },
			);
		} catch {
			return NextResponse.json({ error: "catalog_report_unavailable" }, { status: 503 });
		}
	}
	return new Response(
		csvFile([
			CATALOG_CSV_COLUMNS,
			["REPLACE-SKU", site.defaultChannel, "19.99", "USD", "0.25", "https://images.example.com/replace.jpg"],
		]),
		{
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="${site.id}-catalog-template.csv"`,
				"Cache-Control": "private, no-store",
			},
		},
	);
}
export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
	const viewer = await currentOpsViewer();
	const { siteId } = await params;
	if (viewer?.role !== "platform_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
	const site = getBrandSites()?.find((site) => site.id === siteId);
	if (!site) return NextResponse.json({ error: "unknown_brand" }, { status: 404 });
	let sameOrigin = false;
	try {
		sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.headers.get("host");
	} catch {
		/* Invalid origin */
	}
	if (
		!sameOrigin ||
		request.headers.get("x-requested-with") !== "catalog-validator" ||
		request.headers.get("sec-fetch-site") === "cross-site"
	)
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	if (Number(request.headers.get("content-length") ?? 0) > 1_000_000)
		return NextResponse.json({ error: "CSV文件过大" }, { status: 413 });
	let nativeLookup = false;
	try {
		const csv = await readCatalogCsvBody(request);
		const native = new URL(request.url).searchParams.get("native") === "1";
		const format = validateCatalogCsv(csv, site.channels);
		let result: typeof format & { nativeChecked?: boolean } = format;
		if (native && format.valid) {
			nativeLookup = true;
			result = await preflightNativeCatalogCsv(siteId, viewer, csv);
		} else if (native) result = { ...format, nativeChecked: false };
		return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
	} catch (error) {
		const reason = error instanceof Error ? error.message : "CSV校验失败";
		if (reason === "catalog_csv_too_large")
			return NextResponse.json({ error: "CSV文件超过1MB" }, { status: 413 });
		if (reason === "catalog_csv_invalid_utf8")
			return NextResponse.json({ error: "CSV文件必须使用有效UTF-8编码" }, { status: 400 });
		if (reason === "catalog_csv_read_unavailable")
			return NextResponse.json({ error: "CSV读取失败，请重新上传有效文件" }, { status: 400 });
		if (nativeLookup)
			return NextResponse.json(
				{ error: "原生SKU/币种核对不可用；请检查商品读取凭证或稍后重试，不能据此导入" },
				{ status: 503, headers: { "Cache-Control": "private, no-store" } },
			);
		return NextResponse.json({ error: reason }, { status: 400 });
	}
}
