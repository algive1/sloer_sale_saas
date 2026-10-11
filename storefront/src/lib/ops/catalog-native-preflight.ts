import "server-only";
import { getBrandSites } from "@/config/brand-sites";
import { OpsCatalogPreflightDocument, type OpsCatalogPreflightQuery } from "@/gql/graphql";
import type { OpsViewer } from "./authorization";
import { parseCatalogCsv, validateCatalogCsv, type CatalogCsvValidation, type CsvIssue } from "./catalog-csv";

type Variant = NonNullable<OpsCatalogPreflightQuery["productVariants"]>["edges"][number]["node"];
export type NativeCatalogPreflight = CatalogCsvValidation & { nativeChecked: boolean; checkedAt?: string };

/** Read-only exact-SKU lookup; never send CSV image URLs or update products. */
export async function preflightNativeCatalogCsv(
	siteId: string,
	viewer: OpsViewer | null,
	csv: string,
): Promise<NativeCatalogPreflight> {
	if (viewer?.role !== "platform_admin") throw new Error("forbidden_catalog_preflight");
	const site = getBrandSites()?.find((item) => item.id === siteId);
	if (!site) throw new Error("unknown_catalog_brand");
	const format = validateCatalogCsv(csv, site.channels);
	if (!format.valid) return { ...format, nativeChecked: false };
	const rows = parseCatalogCsv(csv)
		.slice(1)
		.map((row) => row.map((value) => value.trim()));
	const skus = Array.from(new Set(rows.map((row) => row[0])));
	const token = (process.env.OPS_CATALOG_SALEOR_TOKEN || process.env.SALEOR_APP_TOKEN)?.trim();
	const url = (process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL)?.trim();
	if (!token || !url) throw new Error("catalog_access_not_configured");
	const found = new Map<string, Variant[]>();
	const started = Date.now();
	for (let offset = 0; offset < skus.length; offset += 100) {
		const remaining = 20_000 - (Date.now() - started);
		if (remaining <= 0) throw new Error("catalog_preflight_unavailable");
		const batch = skus.slice(offset, offset + 100);
		try {
			const response = await fetch(url, {
				method: "POST",
				cache: "no-store",
				signal: AbortSignal.timeout(Math.min(8000, remaining)),
				headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
				body: JSON.stringify({ query: OpsCatalogPreflightDocument.toString(), variables: { skus: batch } }),
			});
			if (!response.ok) throw new Error("unavailable");
			const body = (await response.json()) as { data?: OpsCatalogPreflightQuery; errors?: unknown[] };
			const connection = body.data?.productVariants;
			if (
				(body.errors !== undefined && !Array.isArray(body.errors)) ||
				body.errors?.length ||
				!connection ||
				!Array.isArray(connection.edges) ||
				connection.edges.length > 100 ||
				connection.pageInfo?.hasNextPage !== false
			)
				throw new Error("incomplete");
			for (const edge of connection.edges) {
				const node = edge?.node;
				if (
					!node ||
					typeof node.sku !== "string" ||
					!batch.includes(node.sku) ||
					!Array.isArray(node.channelListings) ||
					!node.product ||
					!Array.isArray(node.product.channelListings)
				)
					throw new Error("invalid");
				for (const listing of [...node.channelListings, ...node.product.channelListings]) {
					const market = listing?.channel;
					if (
						!market ||
						typeof market.slug !== "string" ||
						typeof market.isActive !== "boolean" ||
						typeof market.currencyCode !== "string" ||
						market.currencyCode.trim() !== market.currencyCode ||
						!/^[A-Z]{3}$/.test(market.currencyCode)
					)
						throw new Error("invalid");
				}
				found.set(node.sku, [...(found.get(node.sku) ?? []), node]);
			}
		} catch {
			throw new Error("catalog_preflight_unavailable");
		}
	}
	const issues: CsvIssue[] = [];
	rows.forEach(([sku, channel, , currency], index) => {
		const fail = (field: string, reason: string) => issues.push({ row: index + 2, sku, field, reason });
		const candidates = found.get(sku) ?? [];
		const listings =
			candidates[0]?.product.channelListings?.filter((listing) => listing.channel.slug === channel) ?? [];
		const variantListings =
			candidates[0]?.channelListings?.filter((listing) => listing.channel.slug === channel) ?? [];
		// Missing, ambiguous and foreign-brand matches share the same explanation.
		// Do not serialize foreign product IDs, names, channels or prices.
		if (candidates.length !== 1 || listings.length !== 1 || variantListings.length !== 1) {
			fail("sku", "当前品牌市场找不到唯一现有SKU；请先在原生后台建立并分配商品");
			return;
		}
		const market = listings[0].channel;
		if (!market.isActive) fail("channel", "当前市场已停用");
		if (currency !== market.currencyCode) {
			fail("currency", "币种与当前市场的原生配置不一致");
			return;
		}
	});
	return {
		rows: format.rows,
		valid: !issues.length,
		issues,
		nativeChecked: true,
		checkedAt: new Date().toISOString(),
	};
}
