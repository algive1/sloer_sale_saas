import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCheckoutHostAtRequestBoundary } from "./checkout-host-guard";

const brands = JSON.stringify([
  { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["us"], defaultChannel: "us" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
]);
const mockGraphql = (slug: string | null, status = 200) => vi.fn(async () =>
  new Response(JSON.stringify({ data: { checkout: slug ? { channel: { slug } } : null } }), {
    status, headers: { "content-type": "application/json" },
  }),
);

beforeEach(() => {
  vi.stubEnv("STOREFRONT_SITES_JSON", brands);
  vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "http://127.0.0.1:8000/graphql/");
});
afterEach(() => vi.unstubAllEnvs());

describe("checkout request boundary brand isolation", () => {
  it("accepts the actual checkout channel on its own Host only", async () => {
    const fetcher = mockGraphql("us");
    expect(await verifyCheckoutHostAtRequestBoundary("checkout-1", "fashion.example",
      fetcher as unknown as typeof fetch)).toBe("allow");
    expect(await verifyCheckoutHostAtRequestBoundary("checkout-1", "jewelry.example",
      fetcher as unknown as typeof fetch)).toBe("not-found");
    const request = fetcher.mock.calls;
    expect(request.length).toBe(2);
  });

  it("attaches the shared-Core secret only on the trusted server-to-Saleor request", async () => {
    vi.stubEnv("SALEOR_SHARED_CORE_CHECKOUT_GATEWAY_SECRET", "ci-trusted-server-secret-minimum-32-characters");
    const calls: RequestInit[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ data: { checkout: { channel: { slug: "us" } } } }), {
        headers: { "content-type": "application/json" },
      });
    });
    expect(await verifyCheckoutHostAtRequestBoundary("checkout-1", "fashion.example",
      fetcher as unknown as typeof fetch)).toBe("allow");
    const headers = new Headers(calls[0]?.headers);
    expect(headers.get("x-paper-checkout-gateway-secret")).toBe("ci-trusted-server-secret-minimum-32-characters");
  });

  it("fails closed before performing a Saleor call on unknown hosts or malicious IDs", async () => {
    const fetcher = mockGraphql("us");
    const call = fetcher as unknown as typeof fetch;
    expect(await verifyCheckoutHostAtRequestBoundary("checkout-1", "unknown.example", call)).toBe("not-found");
    expect(await verifyCheckoutHostAtRequestBoundary("x".repeat(1025), "fashion.example", call)).toBe("not-found");
    expect(await verifyCheckoutHostAtRequestBoundary("", "fashion.example", call)).toBe("not-found");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects missing Checkout objects and returns an error status for upstream outages", async () => {
    expect(await verifyCheckoutHostAtRequestBoundary("id", "fashion.example",
      mockGraphql(null) as unknown as typeof fetch)).toBe("not-found");
    expect(await verifyCheckoutHostAtRequestBoundary("id", "fashion.example",
      mockGraphql("us", 503) as unknown as typeof fetch)).toBe("unavailable");
    const down = vi.fn(async () => { throw new Error("Saleor down"); });
    expect(await verifyCheckoutHostAtRequestBoundary("id", "fashion.example",
      down as unknown as typeof fetch)).toBe("unavailable");
  });

  it("preserves single-store fast path without additional GraphQL requests", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", "");
    const fetcher = mockGraphql("jewelry-us");
    expect(await verifyCheckoutHostAtRequestBoundary("id", "any-host.example",
      fetcher as unknown as typeof fetch)).toBe("allow");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
