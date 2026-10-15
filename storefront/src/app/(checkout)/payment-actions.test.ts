import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
	capability: vi.fn(),
	transaction: vi.fn(),
	graphql: vi.fn(),
	checkout: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/checkout/lib/server/require-transaction-site", () => ({
	requireTransactionAuthorizationCapability: mocks.capability,
	requireTransactionForCurrentHost: mocks.transaction,
}));
vi.mock("@/checkout/lib/server/require-checkout-site", () => ({
	requireCheckoutForCurrentHost: mocks.checkout,
	requireCheckoutVariablesForCurrentHost: mocks.checkout,
}));
vi.mock("@/lib/graphql", () => ({
	executeAuthenticatedGraphQL: mocks.graphql,
	executePublicGraphQL: vi.fn(),
	executeRawGraphQL: vi.fn(),
}));
vi.mock("@/lib/checkout", () => ({}));
vi.mock("@/app/actions", () => ({ saveCheckoutId: vi.fn() }));
vi.mock("@/checkout/lib/server/get-checkout-server-translations", () => ({
	getCheckoutServerTranslations: async () => ({ server: (key: string) => key }),
}));
vi.mock("@/checkout/lib/server/fetch-checkout", () => ({ fetchCheckoutOnServer: vi.fn() }));
vi.mock("@/checkout/lib/server/enrich-commerce-context", () => ({ enrichCheckoutCommerceContext: vi.fn() }));
vi.mock("@/lib/analytics/emit.server", () => ({ emitCommerceEvent: vi.fn() }));
vi.mock("@/lib/order-view", () => ({ setOrderViewCookie: vi.fn(), signOrderViewToken: vi.fn() }));
import { initializeCheckoutTransaction, processCheckoutTransaction } from "./actions";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.capability.mockResolvedValue(undefined);
	mocks.transaction.mockResolvedValue(undefined);
	mocks.graphql.mockResolvedValue({
		ok: true,
		data: {
			transactionInitialize: { errors: [], transaction: { id: "tx-1" } },
			transactionProcess: { errors: [], transaction: { id: "tx-1" } },
		},
	});
	vi.stubEnv("ENABLE_STRIPE_PAYMENTS", "true");
});
describe("payment action authorization order", () => {
	it.each(["Missing SALEOR_APP_TOKEN", "Invalid app token", "PermissionDenied"])(
		"blocks %s before calling transactionInitialize",
		async (message) => {
			mocks.capability.mockRejectedValueOnce(new Error(message));
			await expect(
				initializeCheckoutTransaction({
					checkoutId: "local-checkout",
					paymentGateway: { id: "saleor.app.payment.stripe" },
				}),
			).rejects.toThrow(message);
			expect(mocks.graphql).not.toHaveBeenCalled();
		},
	);
	it("checks capability before initialization and uses transaction-specific authorization for processing", async () => {
		await initializeCheckoutTransaction({
			checkoutId: "local-checkout",
			paymentGateway: { id: "saleor.app.payment.stripe" },
		});
		expect(mocks.capability.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.graphql.mock.invocationCallOrder[0],
		);
		vi.clearAllMocks();
		await processCheckoutTransaction({ id: "tx-1" });
		expect(mocks.transaction).toHaveBeenCalledWith("tx-1");
		expect(mocks.checkout).not.toHaveBeenCalled();
		expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.graphql.mock.invocationCallOrder[0],
		);
	});
	it("blocks a foreign transaction even when additional local checkout input is supplied", async () => {
		mocks.transaction.mockRejectedValueOnce(new Error("Transaction not available for this storefront"));
		const input = { id: "foreign-tx", checkoutId: "local-checkout" };
		await expect(processCheckoutTransaction(input)).rejects.toThrow("not available");
		expect(mocks.transaction).toHaveBeenCalledWith("foreign-tx");
		expect(mocks.graphql).not.toHaveBeenCalled();
	});
});

afterEach(() => vi.unstubAllEnvs());
