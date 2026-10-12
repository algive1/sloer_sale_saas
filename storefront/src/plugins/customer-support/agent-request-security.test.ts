import { describe, expect, it } from "vitest";
import { isTrustedAgentMutation } from "./agent-request-security";
const request = {
  origin: "https://shop.example.com",
  requestUrl: "https://shop.example.com/api/ops/chatwoot",
  fetchSite: "same-origin",
  actionHeader: "conversation",
};
describe("Chatwoot mutation same-origin protection", () => {
  it("accepts native inbox requests", () => {
    expect(isTrustedAgentMutation(request)).toBe(true);
  });
  it("rejects CSRF, absent Origin and untrusted API actions", () => {
    expect(isTrustedAgentMutation({ ...request, origin: "https://evil.example" })).toBe(false);
    expect(isTrustedAgentMutation({ ...request, origin: null })).toBe(false);
    expect(isTrustedAgentMutation({ ...request, actionHeader: null })).toBe(false);
    expect(isTrustedAgentMutation({ ...request, fetchSite: "cross-site" })).toBe(false);
  });
});
