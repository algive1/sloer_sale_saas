import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { preflightNativeCatalogCsv } from "./catalog-native-preflight";
import { readCatalogCsvBody } from "./catalog-csv-body";
const admin = { username: "owner", role: "platform_admin" as const, siteIds: [] };
const csv = (rows: string[]) =>
	"sku,channel,price,currency,weight_kg,image_url\n" +
	rows.map((row) => row + ",0.2,https://images.example.test/example.jpg").join("\n");
const row = (sku = "HAT", currency = "USD", channel = "us") => `${sku},${channel},20.00,${currency}`;
const variant = (sku: string, channel = "us", currency = "USD", active = true) => ({
	sku,
	channelListings: [{ channel: { slug: channel, currencyCode: currency, isActive: active }, price: { currency, fractionDigits: 2 } }],
	product: { channelListings: [{ channel: { slug: channel, currencyCode: currency, isActive: active } }] },
});
const response = (nodes: unknown[], next = false) =>
	Response.json({
		data: { productVariants: { edges: nodes.map((node) => ({ node })), pageInfo: { hasNextPage: next } } },
	});
beforeEach(() => {
	vi.stubEnv(
		"STOREFRONT_SITES_JSON",
		JSON.stringify([
			{
				id: "fashion",
				name: "Fashion",
				domains: ["fashion.example"],
				channels: ["us"],
				defaultChannel: "us",
			},
		]),
	);
	vi.stubEnv("OPS_CATALOG_SALEOR_TOKEN", "private-read-fixture-only");
	vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://saleor.example.test/graphql/");
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
it("rejects unauthorized actors and invalid format/market before credential or source I/O", async () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	await expect(
		preflightNativeCatalogCsv(
			"fashion",
			{ ...admin, role: "brand_analyst", siteIds: ["fashion"] },
			csv([row()]),
		),
	).rejects.toThrow("forbidden");
	await expect(preflightNativeCatalogCsv("foreign", admin, csv([row()]))).rejects.toThrow("unknown");
	expect(
		await preflightNativeCatalogCsv("fashion", admin, csv([row("HAT", "USD", "jewelry-us")])),
	).toMatchObject({ valid: false, nativeChecked: false });
	expect(fetcher).not.toHaveBeenCalled();
});
it("checks actual SKU/market currency using read-only exact queries, not mutations or CSV image downloads", async () => {
	const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as { query: string; variables: { skus: string[] } };
		expect(body.query.trim()).toMatch(/^query OpsCatalogPreflight/);
		expect(body.variables.skus).toEqual(["HAT"]);
		expect(init?.cache).toBe("no-store");
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		return response([variant("HAT")]);
	});
	vi.stubGlobal("fetch", fetcher);
	const result = await preflightNativeCatalogCsv("fashion", admin, csv([row()]));
	expect(result).toMatchObject({ rows: 1, valid: true, nativeChecked: true, issues: [] });
	expect(result.checkedAt).toMatch(/^\d{4}-/);
	expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not reveal whether a missing, duplicated or foreign-market SKU exists elsewhere", async () => {
	const replies = [
		[],
		[variant("HAT", "jewelry-us")],
		[variant("HAT"), variant("HAT")],
		[{ ...variant("HAT"), channelListings: [] }],
		[{ ...variant("HAT"), product: { channelListings: [] } }],
	];
	let reason = "";
	for (const nodes of replies) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response(nodes)),
		);
		const result = await preflightNativeCatalogCsv("fashion", admin, csv([row()]));
		expect(result.valid).toBe(false);
		expect(result.issues[0].field).toBe("sku");
		if (reason) expect(result.issues[0].reason).toBe(reason);
		reason = result.issues[0].reason;
		expect(JSON.stringify(result)).not.toContain("jewelry-us");
	}
});
it("rejects actual inactive markets and currency mismatches without inventing conversion or currency facts", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => response([variant("HAT", "us", "USD", false)])),
	);
	const result = await preflightNativeCatalogCsv("fashion", admin, csv([row("HAT", "EUR")]));
	expect(result.issues.map((issue) => issue.field)).toEqual(["channel", "currency"]);
	expect(result.valid).toBe(false);
});
it("checks more than one SKU batch completely with no duplicated lookup", async () => {
	const skus = Array.from({ length: 205 }, (_, i) => "SKU-" + i);
	const batches: string[][] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as { variables: { skus: string[] } };
			batches.push(body.variables.skus);
			return response(body.variables.skus.map((sku) => variant(sku)));
		}),
	);
	expect((await preflightNativeCatalogCsv("fashion", admin, csv(skus.map((sku) => row(sku))))).valid).toBe(
		true,
	);
	expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
	expect(batches.flat()).toEqual(skus);
});
it("uses native Money precision for 0/2/3/4-digit currencies, permits trailing zeroes and never silently rounds", async () => {
	for (const digits of [0, 2, 3, 4]) {
		const node = variant("HAT");
		node.channelListings[0].price.fractionDigits = digits;
		vi.stubGlobal("fetch", vi.fn(async () => response([node])));
		const price = "20." + "0".repeat(digits) + "1";
		if (digits < 4) {
			const result = await preflightNativeCatalogCsv("fashion", admin, csv([row().replace("20.00", price)]));
			expect(result.issues).toMatchObject([{ field: "price" }]);
			expect(result.valid).toBe(false);
		}
		expect((await preflightNativeCatalogCsv("fashion", admin, csv([row().replace("20.00", "20.0000")]))).valid).toBe(true);
		if (digits > 0) expect((await preflightNativeCatalogCsv("fashion", admin, csv([row().replace("20.00", "20." + "0".repeat(digits - 1) + "1")]))).valid).toBe(true);
	}
	const node = variant("HAT"); node.channelListings[0].price.fractionDigits = 3;
	vi.stubGlobal("fetch", vi.fn(async () => response([node])));
	expect((await preflightNativeCatalogCsv("fashion", admin, csv([row().replace("20.00", "20.001")]))).valid).toBe(true);
});
it("refuses missing native prices and malformed currency precision metadata instead of declaring complete success", async () => {
	const node = variant("HAT");
	vi.stubGlobal("fetch", vi.fn(async () => response([{ ...node, channelListings: [{ ...node.channelListings[0], price: null }] }])));
	expect((await preflightNativeCatalogCsv("fashion", admin, csv([row()]))).issues).toMatchObject([{ field: "price" }]);
	for (const price of [undefined, { currency: "EUR", fractionDigits: 2 }, { currency: "USD", fractionDigits: 1.5 }, { currency: "USD", fractionDigits: -1 }, { currency: "USD", fractionDigits: 7 }]) {
		vi.stubGlobal("fetch", vi.fn(async () => response([{ ...node, channelListings: [{ channel: node.channelListings[0].channel, ...(price !== undefined ? { price } : {}) }] }])));
		await expect(preflightNativeCatalogCsv("fashion", admin, csv([row()]))).rejects.toThrow("unavailable");
	}
});
it("fails the whole preflight on partial errors, missing pagination, overfull results or unrequested SKUs", async () => {
	for (const reply of [
		Response.json({
			data: { productVariants: { edges: [] } },
			errors: [{ message: "private-provider-detail" }],
		}),
		response([variant("HAT")], true),
		response([variant("foreign")]),
		response(Array.from({ length: 101 }, () => variant("HAT"))),
		Response.json({ data: { productVariants: { edges: [], pageInfo: {} } } }),
	]) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => reply),
		);
		await expect(preflightNativeCatalogCsv("fashion", admin, csv([row()]))).rejects.toThrow(
			"catalog_preflight_unavailable",
		);
	}
});
it("stops before another lookup when the shared budget expires and never returns a partially checked success", async () => {
	let now = 0;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	let requests = 0;
	const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
		requests++;
		const body = JSON.parse(String(init?.body)) as { variables: { skus: string[] } };
		now = requests === 1 ? 19_999 : 20_001;
		return response(body.variables.skus.map((sku) => variant(sku)));
	});
	vi.stubGlobal("fetch", fetcher);
	await expect(
		preflightNativeCatalogCsv("fashion", admin, csv(Array.from({ length: 201 }, (_, i) => row("SKU-" + i)))),
	).rejects.toThrow("unavailable");
	expect(fetcher).toHaveBeenCalledTimes(2);
});
it("enforces streamed byte size and UTF-8 validity without relying on client Content-Length", async () => {
	const oversized = new Request("https://ops.example", { method: "POST", body: new Uint8Array(1_000_001) });
	oversized.headers.delete("content-length");
	await expect(readCatalogCsvBody(oversized)).rejects.toThrow("too_large");
	await expect(
		readCatalogCsvBody(new Request("https://ops.example", { method: "POST", body: new Uint8Array([0xff]) })),
	).rejects.toThrow("invalid_utf8");
	const encoded = new TextEncoder().encode("帽子");
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoded.slice(0, 2));
			controller.enqueue(encoded.slice(2));
			controller.close();
		},
	});
	const request = new Request("https://ops.example", {
		method: "POST",
		body: stream,
		duplex: "half",
	} as RequestInit);
	expect(await readCatalogCsvBody(request)).toBe("帽子");
});
