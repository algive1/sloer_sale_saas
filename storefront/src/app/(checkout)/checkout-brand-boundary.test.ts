import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
	host: "fashion.example",
	notFound: vi.fn(() => {
		throw new Error("not-found");
	}),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: mocks.host }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import { CheckoutBrandBoundary } from "./checkout-brand-boundary";
beforeEach(() => {
	mocks.host = "fashion.example";
	vi.stubEnv(
		"STOREFRONT_SITES_JSON",
		JSON.stringify([
			{
				id: "fashion",
				name: "Fashion",
				domains: ["fashion.example"],
				channels: ["fashion-us"],
				defaultChannel: "fashion-us",
				logo: "/fashion.svg",
			},
			{
				id: "jewelry",
				name: "Jewelry",
				domains: ["jewelry.example"],
				channels: ["jewelry-us"],
				defaultChannel: "jewelry-us",
			},
		]),
	);
});
afterEach(() => vi.unstubAllEnvs());
describe("transaction brand boundary", () => {
	it("projects only trusted Host visual identity", async () => {
		const result = await CheckoutBrandBoundary({ children: "checkout" });
		expect(result.props.brand).toEqual({ name: "Fashion", logo: "/fashion.svg", logoInverted: undefined });
		mocks.host = "jewelry.example";
		const other = await CheckoutBrandBoundary({ children: "order" });
		expect(other.props.brand).toEqual({ name: "Jewelry", logo: undefined, logoInverted: undefined });
	});
	it("refuses unknown Host before returning any brand chrome", async () => {
		mocks.host = "unregistered.example";
		await expect(CheckoutBrandBoundary({ children: "checkout" })).rejects.toThrow("not-found");
	});
	it("preserves global branding in single-brand mode", async () => {
		vi.stubEnv("STOREFRONT_SITES_JSON", "");
		expect((await CheckoutBrandBoundary({ children: "checkout" })).props.brand).toBeUndefined();
	});
});
