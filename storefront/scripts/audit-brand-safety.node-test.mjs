// Dependency-free regression gate. Node 24 strips TS; no downloaded packages run.
// This is not a replacement for codegen, tsc, Vitest or the Next production build.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test, mock } from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = new URL("../src/", import.meta.url);
registerHooks({
	resolve(specifier, context, nextResolve) {
		// server-only is a bundler marker, not application behavior under test.
		if (specifier === "server-only") {
			return { url: "data:text/javascript,export {};", shortCircuit: true };
		}
		const url = specifier.startsWith("@/")
			? new URL(specifier.slice(2), sourceRoot)
			: specifier.startsWith(".") && context.parentURL?.startsWith(sourceRoot.href)
				? new URL(specifier, context.parentURL)
				: null;
		if (url && existsSync(fileURLToPath(url) + ".ts")) {
			return nextResolve(url.href + ".ts", context);
		}
		return nextResolve(specifier, context);
	},
});

const { buildProductJsonLd, jsonLdScriptProps } = await import("../src/lib/seo/json-ld.ts");
const { productBrandName } = await import("../src/lib/catalog/product-brand.ts");
const reminders = await import("../src/plugins/payment-reminders/service.ts");
const originalEnv = { ...process.env };
const sites = JSON.stringify([
	{ id: "fashion", name: "Fashion Store", domains: ["fashion.example", "www.fashion.example"],
		channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us" },
	{ id: "jewelry", name: "Jewelry Store", domains: ["jewelry.example"],
		channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
]);
const product = {
	name: "Linen shirt", channel: "fashion-us", brand: "Actual Manufacturer",
	url: "/en/fashion-us/products/linen-shirt",
	price: { amount: 68, currency: "USD" }, inStock: true,
};

beforeEach(() => {
	process.env.STOREFRONT_SITES_JSON = sites;
	process.env.NEXT_PUBLIC_STOREFRONT_URL = "https://wrong-global.example/";
	process.env.RESEND_API_KEY = "test-key";
	process.env.PAYMENT_REMINDER_FROM = "orders@wrong-global.example";
	process.env.ANALYTICS_LIBSQL_URL = "https://storage.example";
	process.env.ANALYTICS_LIBSQL_AUTH_TOKEN = "test-storage-key";
	process.env.SALEOR_INTERNAL_API_URL = "https://saleor.example/graphql/";
	process.env.SALEOR_APP_TOKEN = "test-app-token";
});
afterEach(() => {
	for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
	Object.assign(process.env, originalEnv);
	mock.restoreAll();
});

test("product brand accepts only catalog text/choice names, never inferred store/category names", () => {
	assert.equal(productBrandName({ text: "  Maker  " }), "Maker");
	assert.equal(productBrandName({ choice: { name: " Maker " } }), "Maker");
	for (const value of [null, {}, { text: " " }, { category: "Shirts" }, { choice: { slug: "maker-id" } }]) {
		assert.equal(productBrandName(value), null);
	}
});

test("two brands and three channels keep offer domain, seller, and manufacturer separate", () => {
	for (const [channel, domain, seller] of [
		["fashion-us", "fashion.example", "Fashion Store"],
		["fashion-eu", "fashion.example", "Fashion Store"],
		["jewelry-us", "jewelry.example", "Jewelry Store"],
	]) {
		const url = `/de/${channel}/products/example`;
		const result = buildProductJsonLd({ ...product, channel, url });
		assert.equal(result.offers.url, `https://${domain}${url}`);
		assert.equal(result.offers.seller.name, seller);
		assert.equal(result.brand.name, "Actual Manufacturer");
		assert.ok(!JSON.stringify(result).includes("wrong-global"));
	}
});

test("aggregate offers use the same brand scope and retain price/currency/availability", () => {
	const result = buildProductJsonLd({ ...product, price: undefined,
		priceRange: { lowPrice: 64, highPrice: 78, currency: "EUR" }, inStock: false, variantCount: 3 });
	assert.equal(result.offers["@type"], "AggregateOffer");
	assert.equal(result.offers.seller.name, "Fashion Store");
	assert.equal(result.offers.url, "https://fashion.example/en/fashion-us/products/linen-shirt");
	assert.equal(result.offers.priceCurrency, "EUR");
	assert.equal(result.offers.lowPrice, 64);
	assert.equal(result.offers.availability, "https://schema.org/OutOfStock");
	assert.equal(result.offers.offerCount, 3);
});

test("unknown product brands are omitted, not replaced by the store identity", () => {
	for (const brand of [undefined, null, "  "]) {
		assert.equal("brand" in buildProductJsonLd({ ...product, brand }), false);
	}
});

test("an unowned channel cannot advertise the global seller in multi-brand mode", () => {
	assert.equal(buildProductJsonLd({ ...product, channel: "unknown" }), null);
});

test("legacy single-brand URL works with a trailing slash and missing brand", () => {
	delete process.env.STOREFRONT_SITES_JSON;
	const result = buildProductJsonLd({ ...product, brand: null });
	assert.equal(result.offers.url, "https://wrong-global.example/en/fashion-us/products/linen-shirt");
	assert.equal("brand" in result, false);
});

test("merchant-controlled brand text cannot break out of inline JSON-LD", () => {
	const result = buildProductJsonLd({ ...product, brand: "</script><script>alert(1)</script>" });
	const text = jsonLdScriptProps(result).dangerouslySetInnerHTML.__html;
	assert.ok(!text.includes("</script>"));
	assert.equal(JSON.parse(text).brand.name, "</script><script>alert(1)</script>");
});

test("all reminder send paths stop before order, database or email I/O for multiple brands", async () => {
	const network = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network"); });
	assert.equal(reminders.reminderEmailConfigured(), false);
	for (const stage of ["manual", "first", "second"]) {
		assert.deepEqual(await reminders.sendReminder({ id: "order-1" }, stage), {
			status: "skipped", reason: "multi_brand_not_supported",
		});
	}
	assert.equal((await reminders.sendManualReminder("order-1")).reason, "multi_brand_not_supported");
	assert.deepEqual(await reminders.runAutomaticReminders(), {
		sent: 0, skipped: 0, failed: 0, scanned: 0, truncated: false, reason: "multi_brand_not_supported",
	});
	assert.equal(network.mock.callCount(), 0);
});

test("malformed brand configuration cannot fall back to global reminder sending", async () => {
	process.env.STOREFRONT_SITES_JSON = "malformed";
	const network = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network"); });
	assert.equal((await reminders.sendManualReminder("order-1")).reason, "multi_brand_not_supported");
	assert.equal((await reminders.runAutomaticReminders()).reason, "multi_brand_not_supported");
	assert.equal(network.mock.callCount(), 0);
});

test("direct callers cannot enable a global rule in multi-brand mode", async () => {
	const network = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network"); });
	await assert.rejects(reminders.setReminderRule({ enabled: true, firstAfterHours: 24,
		secondAfterHours: 72, dailyLimit: 5 }), /multi_brand_not_supported/);
	assert.equal(network.mock.callCount(), 0);
});

test("single-brand missing sender returns configuration status without reading storage", async () => {
	delete process.env.STOREFRONT_SITES_JSON;
	delete process.env.PAYMENT_REMINDER_FROM;
	const network = mock.method(globalThis, "fetch", () => { throw new Error("unexpected network"); });
	assert.equal((await reminders.runAutomaticReminders()).reason, "email_not_configured");
	assert.equal(network.mock.callCount(), 0);
});

test("single-brand paid orders still use live Saleor verification and never send", async () => {
	delete process.env.STOREFRONT_SITES_JSON;
	assert.equal(reminders.reminderEmailConfigured(), true);
	const network = mock.method(globalThis, "fetch", async (url) => {
		assert.equal(url, "https://saleor.example/graphql/");
		return Response.json({ data: { order: { id: "order-1", number: "1", created: "2026-10-10",
			status: "UNFULFILLED", isPaid: true, paymentStatus: "FULLY_CHARGED", lines: [] } } });
	});
	assert.deepEqual(await reminders.sendManualReminder("order-1"), { status: "skipped", reason: "already_paid" });
	assert.equal(network.mock.callCount(), 1);
});
