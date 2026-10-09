import { expect, test } from "@playwright/test";

test.describe("live API access and invalid input boundaries", () => {
  test("all public account mutations reject malformed JSON", async ({ request }) => {
    for (const action of ["login", "register", "reset-password", "set-password", "confirm-account"]) {
      const response = await request.post("/api/auth/" + action, {
        headers: { "content-type": "application/json" },
        data: "{not valid JSON",
      });
      expect(response.status(), "Account action " + action).toBe(400);
    }
  });

  test("private cache endpoints deny calls with no bearer secret", async ({ request }) => {
    expect((await request.get("/api/cache-info")).status()).toBe(401);
    expect((await request.get("/api/revalidate")).status()).toBe(401);
    expect((await request.post("/api/revalidate", { data: {} })).status()).toBe(401);
  });

  test("Saleor order webhook rejects unsigned payloads before mutation", async ({ request }) => {
    const response = await request.post("/api/analytics/saleor-order-events", {
      headers: { "content-type": "application/json", "saleor-event": "ORDER_FULLY_PAID" },
      data: { id: "fake", number: "0" },
    });
    expect(response.status()).toBe(401);
  });

  test("listing and merchant endpoints reject unknown channels/surfaces", async ({ request }) => {
    expect((await request.get("/api/listing?surface=unsupported")).status()).toBe(400);
    expect((await request.get("/merchant/google.xml?channel=invalid-ci-channel&locale=en")).status()).toBe(400);
  });

  test("all operations APIs deny anonymous access", async ({ request }) => {
    for (const path of [
      "/ops/api/analytics/realtime",
      "/ops/api/analytics/reminders/rules",
      "/ops/themes/api?channel=us&locale=en",
    ]) {
      const response = await request.get(path);
      expect(response.status(), "Anonymous operations API: " + path).toBe(401);
    }
    for (const path of [
      "/ops/api/analytics/reminders/manual",
      "/ops/api/analytics/reminders/run",
      "/ops/api/analytics/reminders/rules",
    ]) {
      const response = await request.post(path, { data: {} });
      expect(response.status(), "Anonymous operations mutation: " + path).toBe(401);
    }
  });

  test("authenticated mutation routes still reject absent anti-CSRF/Cron credentials", async ({ browser }) => {
    const secret = process.env.PLAYWRIGHT_THEME_EDITOR_SECRET;
    test.skip(!secret, "Requires the integration operations credential");
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
    const context = await browser.newContext({
      baseURL,
      httpCredentials: { username: "analytics", password: secret! },
    });
    try {
      const theme = await context.request.put("/ops/themes/api?channel=us&locale=en", {
        data: { draft: {} },
      });
      expect(theme.status(), "Theme mutation must require same-origin browser context").toBe(403);
      for (const path of [
        "/ops/api/analytics/reminders/manual",
        "/ops/api/analytics/reminders/rules",
      ]) {
        const res = await context.request.post(path, { data: {} });
        expect(res.status(), "Reminder mutation must require operations request header").toBe(403);
      }
      const cron = await context.request.post("/ops/api/analytics/reminders/run", { data: {} });
      expect(cron.status(), "Cron execution must require its separate server secret").toBe(401);
    } finally {
      await context.close();
    }
  });
});
