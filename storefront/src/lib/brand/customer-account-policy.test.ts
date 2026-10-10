import { describe, expect, it } from "vitest";
import { customerAccountUnavailableResponse, sharedCustomerAccountsEnabled } from "./customer-account-policy";

describe("multi-brand shared customer identity containment", () => {
  it("keeps existing single-brand accounts enabled", () => {
    expect(sharedCustomerAccountsEnabled(undefined)).toBe(true);
    expect(sharedCustomerAccountsEnabled("")).toBe(true);
    expect(sharedCustomerAccountsEnabled("  ")).toBe(true);
  });

  it("fails closed whenever multi-brand config is present, even malformed", () => {
    expect(sharedCustomerAccountsEnabled('[{"id":"fashion"},{"id":"jewelry"}]')).toBe(false);
    expect(sharedCustomerAccountsEnabled(" {invalid-json ")).toBe(false);
  });

  it("uses a noncacheable, machine-readable denial without user data", async () => {
    const response = customerAccountUnavailableResponse();
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toEqual({errors:[{
      code:"MULTI_BRAND_ACCOUNT_UNAVAILABLE",
      message:"Customer accounts are unavailable for this storefront. Continue as a guest.",
    }]});
  });
});
