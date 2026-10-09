import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseConfigured: vi.fn(),
  storeEvent: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", () => ({
  analyticsDatabaseConfigured: mocks.databaseConfigured,
}));
vi.mock("@/plugins/analytics/first-party-store", () => ({
  storeFirstPartyCommerceEvent: mocks.storeEvent,
}));

import { POST } from "./route";

const VALID = { name: "product_viewed", eventId: "test-pdp-1", channel: "us" };

function eventRequest(value: unknown, cookie = "paper_analytics_consent=granted") {
  return new Request("https://shop.example/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(value),
  });
}

describe("public first-party analytics event ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_MODE", "required");
    mocks.databaseConfigured.mockReturnValue(true);
    mocks.storeEvent.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("preserves ordinary consenting visitor events", async () => {
    const response = await POST(eventRequest(VALID));
    expect(response.status).toBe(204);
    expect(mocks.storeEvent).toHaveBeenCalledTimes(1);
    expect(mocks.storeEvent.mock.calls[0]?.[0]).toEqual(VALID);
  });

  it("never accepts forged refunds from the public browser endpoint", async () => {
    const response = await POST(eventRequest({
      name: "refund_completed", eventId: "fake-refund", channel: "us",
      transactionId: "Order:1", value: 99999, currency: "USD",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "server_only_event" });
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });

  it("skips persistence without consent in required mode, including explicit denial", async () => {
    expect((await POST(eventRequest(VALID, ""))).status).toBe(204);
    expect((await POST(eventRequest(VALID, "paper_analytics_consent=denied"))).status).toBe(204);
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });

  it("honours implied mode but never overrides an explicit denial", async () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_MODE", "implied");
    expect((await POST(eventRequest(VALID, ""))).status).toBe(204);
    expect(mocks.storeEvent).toHaveBeenCalledTimes(1);
    expect((await POST(eventRequest(VALID, "paper_analytics_consent=denied"))).status).toBe(204);
    expect(mocks.storeEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized bodies even when Content-Length is absent or false", async () => {
    const largeEvent = { ...VALID, pad: "X".repeat(33_000) };
    const request = eventRequest(largeEvent);
    request.headers.delete("content-length");
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });

  it("rejects excessive declared length before reading a body", async () => {
    const request = eventRequest(VALID);
    request.headers.set("content-length", "33000");
    expect((await POST(request)).status).toBe(413);
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });

  it("rejects unknown events and malformed JSON", async () => {
    expect((await POST(eventRequest({ name: "unexpected" }))).status).toBe(400);
    const malformed = new Request("https://shop.example/api/analytics/events", {
      method: "POST", headers: { cookie: "paper_analytics_consent=granted" },
      body: "{bad",
    });
    expect((await POST(malformed)).status).toBe(400);
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });

  it("has no DB work when the optional first-party store is disabled", async () => {
    mocks.databaseConfigured.mockReturnValue(false);
    expect((await POST(eventRequest(VALID))).status).toBe(204);
    expect(mocks.storeEvent).not.toHaveBeenCalled();
  });
});
