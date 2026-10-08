import { expect, test, request as playwrightRequest } from "@playwright/test";
import { FASHION_TEMPLATE, type ThemeData } from "../src/lib/theme-builder/template";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const password = process.env.PLAYWRIGHT_THEME_EDITOR_SECRET;
const channel = "us";
const locale = "en";
const scope = `/ops/themes/api?channel=${channel}&locale=${locale}`;
const home = "/en/us";

test.describe("live editor -> libSQL -> published Saleor homepage", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("protected editor writes and homepage publishing with real SQLite persistence", async ({ browser }) => {
    const resetToken = process.env.PLAYWRIGHT_THEME_DB_RESET_TOKEN;
    test.skip(!password || !resetToken, "Requires the isolated CI theme editor and database credentials");
    // Retry-safe isolation: a prior Playwright attempt may have successfully
    // published a page before a later assertion failed.
    const fixture = await playwrightRequest.newContext({
      baseURL: "http://127.0.0.1:3789",
      extraHTTPHeaders: { Authorization: "Bearer " + resetToken },
    });
    try {
      const reset = await fixture.post("/__test__/reset", { data: {} });
      expect(reset.status(), await reset.text()).toBe(200);
    } finally {
      await fixture.dispose();
    }
    const unauth = await playwrightRequest.newContext({ baseURL });
    const blocked = await unauth.get(scope);
    expect(blocked.status()).toBe(401);
    await unauth.dispose();

    const authorized = await playwrightRequest.newContext({
      baseURL,
      httpCredentials: { username: "analytics", password: password! },
    });
    const context = await browser.newContext({
      httpCredentials: { username: "analytics", password: password! },
      viewport: { width: 1366, height: 860 },
    });
    const page = await context.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("requestfailed", request => browserErrors.push("Request failed: " + request.url() + " " + (request.failure()?.errorText || "")));
    async function requirePuckPublishButton() {
      const publish = page.getByRole("button", { name: "发布上线", exact: true }).first();
      try {
        await expect(publish).toBeVisible({ timeout: 30_000 });
      } catch (error) {
        throw new Error(
          "Our accessible Publish button did not mount. " + String(error) +
          "\\nCurrent URL: " + page.url() +
          "\\nPage content: " + (await page.locator("body").innerText().catch(() => "")).slice(0, 3500) +
          "\\nBrowser errors: " + browserErrors.join("\\n").slice(0, 3500),
        );
      }
      return publish;
    }

    try {
      const response = await authorized.get(scope);
      expect(response.ok()).toBe(true);
      const original = await response.json() as {
        draft: ThemeData | null; published: ThemeData | null; draftRevision: number;
      };
      expect(original.draft).toBeNull();
      expect(original.published).toBeNull();
      expect(original.draftRevision).toBe(0);

      await page.goto("/ops/themes");
      await expect(page.getByRole("heading", { name: "店铺可视化装修" })).toBeVisible();
      // The Puck editor must hydrate; the Publish control is outside its canvas iframe.
      await requirePuckPublishButton();
      // Confirm the actual Puck block sidebar mounted, not just our server shell.
      await expect(page.getByText("Saleor product collection", {exact:true}).first()).toBeVisible({timeout:30_000});

      const draft = structuredClone(FASHION_TEMPLATE);
      draft.content[0].props.heading = "THE CI FASHION STORY";
      draft.content[1].props.heading = "THE CI PRODUCT EDIT";

      const malformed = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel, locale, action: "publish", data: {
          root: {props: {}}, content: [{type:"RawHtml", props: {id:"unsafe",html:"<script>evil()</script>"}}],
        }, expectedRevision: 0 },
      });
      expect(malformed.status()).toBe(400);

      const wrongScope = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel: "not-a-store", locale, action: "draft", data:draft, expectedRevision:0 },
      });
      expect(wrongScope.status()).toBe(400);

      const saveDraft = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel, locale, action: "draft", data: draft, expectedRevision: 0 },
      });
      expect(saveDraft.status(), await saveDraft.text()).toBe(200);
      expect((await saveDraft.json()).draftRevision).toBe(1);

      const draftResponse = await authorized.get(scope);
      const draftState = await draftResponse.json() as {
        draft: ThemeData | null; published: ThemeData | null; draftRevision: number;
      };
      expect(draftState.draft?.content[0].props.heading).toBe("THE CI FASHION STORY");
      expect(draftState.published).toBeNull();
      expect(draftState.draftRevision).toBe(1);

      // A draft never modifies the customer-facing homepage.
      await page.goto(home);
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toHaveCount(0);

      const stale = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: {channel, locale, action:"publish", data:draft, expectedRevision:0},
      });
      expect(stale.status()).toBe(409);

      const foreign = await authorized.put("/ops/themes/api", {
        headers: { Origin: "https://attacker.invalid" },
        data: {channel, locale, action:"publish", data:draft, expectedRevision:1},
      });
      expect(foreign.status()).toBe(403);

      // Publish through our accessible toolbar connected to the real Puck document state.
      // Reload first so it picks up the persisted draft and revision #1.
      await page.goto("/ops/themes");
      await requirePuckPublishButton();
      await (await requirePuckPublishButton()).click();
      await expect(page.locator('p[role="status"]')).toContainText("Published.", { timeout: 30_000 });

      const published = await authorized.get(scope);
      const after = await published.json() as {
        published:ThemeData | null; publishedRevision: number;
      };
      expect(after.published?.content).toHaveLength(4);
      expect(after.publishedRevision).toBe(1);

      // Next.js revalidation should show the published page, not cached Paper content.
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "THE CI PRODUCT EDIT" })).toBeVisible();
      // Product data must be served by Saleor rather than the placeholder cards in the Puck editor.
      const productLinks = page.locator('a[href*="/products/"]');
      await expect.poll(() => productLinks.count(), {timeout:30_000}).toBeGreaterThan(0);

      await page.setViewportSize({ width:390,height:844 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "THE CI PRODUCT EDIT" })).toBeVisible();
    } finally {
      await page.close();
      await context.close();
      await authorized.dispose();
    }
  });
});
