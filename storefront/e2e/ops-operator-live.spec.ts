import { expect, test } from "@playwright/test";

// Against the *production-built* dual-brand storefront, with OPS_OPERATORS_JSON
// configured on the server. Browser cannot supply or forge allowed site IDs.
const origin = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const host = { Host: "fashion.example.test" };
const auth = (username: string, password: string) =>
  "Basic " + Buffer.from(username + ":" + password).toString("base64");
const reader = auth("fashion_reader", "B".repeat(40));
const admin = auth("ops_owner", "A".repeat(40));
const legacy = auth("analytics", "ci-theme-editor-basic-password");

test.describe("multi-brand back-office authorization", () => {
  test("unauthenticated requests are blocked including dotted paths", async ({ request }) => {
    for (const path of ["/ops/sites/fashion-ci", "/ops/themes/api", "/ops/unknown.json"]) {
      const res = await request.get(origin + path, { headers: host });
      expect(res.status(), path).toBe(401);
      expect(res.headers()["cache-control"]).toContain("no-store");
    }
  });

  test("configured operator identities replace the shared legacy password", async ({ request }) => {
    expect((await request.get(origin + "/ops/sites/fashion-ci", {
      headers: { ...host, Authorization: legacy },
    })).status()).toBe(401);
    expect((await request.get(origin + "/ops/sites", {
      headers: { ...host, Authorization: admin },
    })).status()).toBe(200);
  });

  test("brand reader sees only their own reports and no privileged routes", async ({ request }) => {
    for (const path of [
      "/ops/sites",
      "/ops/sites/fashion-ci",
      "/ops/sites/fashion-ci/insights",
      "/ops/sites/fashion-ci/readiness",
    ]) {
      const res = await request.get(origin + path, {
        headers: { ...host, Authorization: reader },
      });
      expect(res.status(), "Allowed: " + path).toBe(200);
      expect(res.headers()["cache-control"]).toContain("no-store");
    }
    const index = await request.get(origin + "/ops/sites", {
      headers: { ...host, Authorization: reader, "x-ops-role":"platform_admin", "x-ops-brand":"jewelry-ci" },
    });
    expect(index.status()).toBe(200);
    expect(index.headers()["cache-control"]).toContain("no-store");
    const html = await index.text();
    expect(html).toContain("Fashion CI");
    expect(html).not.toContain("Jewelry CI");
    expect(html).not.toContain("装修此品牌首页");
    const readiness = await request.get(origin + "/ops/sites/fashion-ci/readiness", {
      headers: { ...host, Authorization: reader },
    });
    expect((await readiness.text())).not.toContain("前往首页装修");
    for (const path of [
      "/ops/sites/jewelry-ci", "/ops/sites/jewelry-ci/insights",
      "/ops/analytics", "/ops/plugins", "/ops/themes", "/ops/themes/api?channel=us&locale=en",
      "/ops/translations", "/ops/translations/api?siteId=fashion-ci", "/ops/unknown.json",
      "/ops/api/analytics/reminders/rules",
    ]) {
      const res = await request.get(origin + path, {
        headers: { ...host, Authorization: reader, "x-ops-role": "platform_admin", "x-ops-brand": "jewelry-ci" },
      });
      expect(res.status(), "Forbidden: " + path).toBe(403);
    }
    const mutation = await request.post(origin + "/ops/api/analytics/reminders/manual", {
      headers: { ...host, Authorization: reader, "x-requested-with": "analytics" }, data: { orderId:"fake" },
    });
    expect(mutation.status(), "A brand reader must not reach any ops mutation").toBe(403);
  });
});
