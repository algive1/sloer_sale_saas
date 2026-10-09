import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./fetch-checkout", () => ({ fetchCheckoutOnServer: mocks.fetch }));
import { requireCheckoutForCurrentHost, requireCheckoutVariablesForCurrentHost } from "./require-checkout-site";

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, checkout: { channel: { slug: "fashion-us" } } });
});
afterEach(() => { delete process.env.STOREFRONT_SITES_JSON; });

describe("checkout Server Actions cannot mutate foreign checkout IDs", () => {
  it("preserves legacy single-brand mutation flow without an additional Saleor read", async () => {
    await expect(requireCheckoutForCurrentHost("checkout-1")).resolves.toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fetches the live checkout before any brand-scoped mutation", async () => {
    process.env.STOREFRONT_SITES_JSON = JSON.stringify([
      { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us"], defaultChannel: "fashion-us" },
    ]);
    await requireCheckoutForCurrentHost("checkout-1");
    expect(mocks.fetch).toHaveBeenCalledWith("checkout-1");
    await requireCheckoutVariablesForCurrentHost({ checkoutId: "checkout-2" });
    expect(mocks.fetch).toHaveBeenLastCalledWith("checkout-2");
  });

  it("rejects checkout IDs that the trusted fetch marks missing or foreign", async () => {
    process.env.STOREFRONT_SITES_JSON = JSON.stringify([
      { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us"], defaultChannel: "fashion-us" },
    ]);
    mocks.fetch.mockResolvedValue({ ok: true, checkout: null });
    await expect(requireCheckoutForCurrentHost("other-brand-checkout")).rejects.toThrow("not available");
    mocks.fetch.mockResolvedValue({ ok: false });
    await expect(requireCheckoutForCurrentHost("unavailable")).rejects.toThrow("not available");
    await expect(requireCheckoutVariablesForCurrentHost({})).rejects.toThrow("Missing checkout ID");
    await expect(requireCheckoutVariablesForCurrentHost({ checkoutId: 123 })).rejects.toThrow("Missing checkout ID");
  });
});
