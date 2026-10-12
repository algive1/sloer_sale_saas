import { describe, expect, it } from "vitest";
import { parseChatwootAgentCredentials } from "./agent-api-config";

const secret = "example_agent_server_token_1234567890";
const other = "example_other_server_token_1234567890";
const valid = JSON.stringify([
  { siteId: "fashion", apiToken: secret },
  { siteId: "jewelry", apiToken: other },
]);
describe("Chatwoot server-only API credentials", () => {
  it("does not require privileged API credentials for the public widget", () => {
    expect(parseChatwootAgentCredentials(undefined, ["fashion"])).toBeNull();
  });
  it("accepts exact 1:1 brand credentials without returning website tokens", () => {
    expect(parseChatwootAgentCredentials(valid, ["fashion", "jewelry"])).toEqual([
      { siteId: "fashion", apiToken: secret }, { siteId: "jewelry", apiToken: other },
    ]);
  });
  it("rejects duplicates, unmatched sites and unsafe strings", () => {
    expect(() => parseChatwootAgentCredentials(valid, ["fashion"])).toThrow();
    expect(() => parseChatwootAgentCredentials("bad json", ["fashion"])).toThrow();
    expect(() => parseChatwootAgentCredentials(JSON.stringify([
      { siteId: "fashion", apiToken: secret }, { siteId: "jewelry", apiToken: secret },
    ]), ["fashion", "jewelry"])).toThrow();
    expect(() => parseChatwootAgentCredentials(JSON.stringify([
      { siteId: "fashion", apiToken: "secret\r\nInjected: abc1234567890" },
    ]), ["fashion"])).toThrow();
  });
});
