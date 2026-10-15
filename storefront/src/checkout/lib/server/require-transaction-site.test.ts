import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ graphql: vi.fn(), requireCheckout: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/graphql", () => ({ executeAppGraphQL: mocks.graphql }));
vi.mock("./require-checkout-site", () => ({ requireCheckoutForCurrentHost: mocks.requireCheckout }));
import {
	requireTransactionForCurrentHost,
	requireTransactionAuthorizationCapability,
} from "./require-transaction-site";
beforeEach(() => {
	vi.stubEnv(
		"STOREFRONT_SITES_JSON",
		JSON.stringify([
			{ id: "a", name: "A", domains: ["a.example"], channels: ["a-us"], defaultChannel: "a-us" },
		]),
	);
	mocks.graphql.mockReset();
	mocks.requireCheckout.mockReset();
	mocks.graphql.mockResolvedValue({
		ok: true,
		data: { transaction: { id: "transaction-1", checkout: { id: "checkout-1" } } },
	});
});
afterEach(() => vi.unstubAllEnvs());
describe("transaction authorization uses the server-resolved checkout", () => {
	it("checks the transaction's actual checkout instead of reading a transaction ID as checkout ID", async () => {
		await requireTransactionForCurrentHost("transaction-1");
		expect(mocks.graphql.mock.calls[0][1]).toEqual({ variables: { id: "transaction-1" }, cache: "no-cache" });
		expect(mocks.requireCheckout).toHaveBeenCalledWith("checkout-1");
	});
	it("rejects foreign transactions despite a caller owning a local checkout", async () => {
		mocks.requireCheckout.mockRejectedValue(new Error("Checkout not available for this storefront"));
		await expect(requireTransactionForCurrentHost("transaction-1")).rejects.toThrow("not available");
	});
	it.each([
		{ ok: false },
		{ ok: true, data: { transaction: null } },
		{ ok: true, data: { transaction: { id: "different", checkout: { id: "checkout-1" } } } },
		{ ok: true, data: { transaction: { id: "transaction-1", checkout: null } } },
	])("fails closed on absent or invalid transaction data", async (result) => {
		mocks.graphql.mockResolvedValue(result);
		await expect(requireTransactionForCurrentHost("transaction-1")).rejects.toThrow("not available");
		expect(mocks.requireCheckout).not.toHaveBeenCalled();
	});
	it("preserves single-brand behavior without a privileged read", async () => {
		vi.stubEnv("STOREFRONT_SITES_JSON", "");
		await requireTransactionForCurrentHost("transaction-1");
		expect(mocks.graphql).not.toHaveBeenCalled();
	});
	it("rejects invalid IDs before reading Saleor", async () => {
		await expect(requireTransactionForCurrentHost("")).rejects.toThrow("not available");
		expect(mocks.graphql).not.toHaveBeenCalled();
	});
});

describe("payment initialization credential preflight", () => {
	it("refuses missing or invalid credentials before a PSP initialization", async () => {
		mocks.graphql.mockResolvedValue({ ok: false });
		await expect(requireTransactionAuthorizationCapability()).rejects.toThrow("authorization is unavailable");
	});
	it("accepts a permitted empty transaction connection", async () => {
		mocks.graphql.mockResolvedValue({ ok: true, data: { transactions: { edges: [] } } });
		await expect(requireTransactionAuthorizationCapability()).resolves.toBeUndefined();
	});
	it("refuses null partial results", async () => {
		mocks.graphql.mockResolvedValue({ ok: true, data: { transactions: null } });
		await expect(requireTransactionAuthorizationCapability()).rejects.toThrow("authorization is unavailable");
	});
});
