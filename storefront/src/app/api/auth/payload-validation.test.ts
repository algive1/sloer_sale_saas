import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(), signIn: vi.fn(), reset: vi.fn(),
  confirm: vi.fn(), graphql: vi.fn(), redirectAllowed: vi.fn(),
}));
vi.mock("@/lib/auth/auth-rate-limit", () => ({ rejectIfRateLimited: mocks.rateLimit }));
vi.mock("@/lib/auth/bff-server", () => ({
  signInWithPassword: mocks.signIn, resetPasswordWithToken: mocks.reset,
}));
vi.mock("@/lib/auth/confirm-account", () => ({ confirmAccountWithToken: mocks.confirm }));
vi.mock("@/lib/auth/validate-redirect-url", () => ({ isAllowedRedirectUrl: mocks.redirectAllowed }));
vi.mock("@/lib/graphql", () => ({
  executeRawGraphQL: mocks.graphql,
  asValidationError: vi.fn(),
  getUserMessage: vi.fn(() => "Service unavailable"),
}));

import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as reset } from "./reset-password/route";
import { POST as setPassword } from "./set-password/route";
import { POST as confirm } from "./confirm-account/route";

const endpoints = [
  { name: "login", action: login },
  { name: "register", action: register },
  { name: "reset-password", action: reset },
  { name: "set-password", action: setPassword },
  { name: "confirm-account", action: confirm },
];

function request(name: string, text: string): NextRequest {
  return new NextRequest(`https://example.com/api/auth/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: text,
  });
}

describe("public auth routes reject invalid payloads without upstream calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.signIn.mockResolvedValue({ ok: true });
    mocks.reset.mockResolvedValue({ ok: true });
    mocks.confirm.mockResolvedValue({ ok: true });
    mocks.redirectAllowed.mockReturnValue(true);
    mocks.graphql.mockResolvedValue({
      ok: true,
      data: {
        accountRegister: { user: { id: "user-1", email: "test@example.com" }, errors: [] },
        requestPasswordReset: { errors: [] },
      },
    });
  });

  for (const endpoint of endpoints) {
    for (const payload of ["null", "[]", '"literal"', "{broken"]) {
      it(`${endpoint.name} returns 400 for invalid JSON shape: ${payload}`, async () => {
        const result = await endpoint.action(request(endpoint.name, payload));
        expect(result.status).toBe(400);
        const body = (await result.json()) as { errors?: Array<{code?: string}> };
        expect(body.errors?.[0]?.code).toBe("INVALID_JSON");
        expect(mocks.signIn).not.toHaveBeenCalled();
        expect(mocks.reset).not.toHaveBeenCalled();
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.graphql).not.toHaveBeenCalled();
      });
    }
  }

  const wrongTypes = [
    { name: "login", action: login, data: { email: ["x"], password: 44 } },
    { name: "register", action: register, data: { email: "test@example.com", password: "safe12345", channel: 42, redirectUrl: [] } },
    { name: "reset-password", action: reset, data: { email: [], channel: "us", redirectUrl: "https://example.com/login" } },
    { name: "set-password", action: setPassword, data: { email: "test@example.com", token: 12, password: ["x"] } },
    { name: "confirm-account", action: confirm, data: { email: "test@example.com", token: true, password: {} } },
  ];
  for (const endpoint of wrongTypes) {
    it(`${endpoint.name} rejects invalid field types before contacting Saleor`, async () => {
      const result = await endpoint.action(request(endpoint.name, JSON.stringify(endpoint.data)));
      expect(result.status).toBe(400);
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.reset).not.toHaveBeenCalled();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.graphql).not.toHaveBeenCalled();
    });
  }

  it("preserves successful login and token-based password/account actions", async () => {
    const email = "test@example.com", password = "password123", token = "valid-token";
    expect((await login(request("login", JSON.stringify({ email, password })))).status).toBe(200);
    expect((await setPassword(request("set-password", JSON.stringify({ email, password, token })))).status).toBe(200);
    expect((await confirm(request("confirm-account", JSON.stringify({ email, password, token })))).status).toBe(200);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it("preserves channel-aware registration and reset flow", async () => {
    const email = "test@example.com", channel = "us";
    const redirectUrl = "https://example.com/en/us/login";
    expect((await register(request("register", JSON.stringify({
      email, password: "password123", channel, redirectUrl,
    })))).status).toBe(200);
    expect((await reset(request("reset-password", JSON.stringify({
      email, channel, redirectUrl,
    })))).status).toBe(200);
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
    expect(mocks.redirectAllowed).toHaveBeenCalledTimes(2);
  });
});
