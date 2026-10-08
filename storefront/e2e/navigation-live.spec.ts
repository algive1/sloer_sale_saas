import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const localeChannel = "/en/us";
const publicRoutes = [
  localeChannel,
  `${localeChannel}/products`,
  `${localeChannel}/search`,
  `${localeChannel}/wishlist`,
  `${localeChannel}/cart`,
  `${localeChannel}/login`,
  `${localeChannel}/signup`,
  `${localeChannel}/account`,
  `${localeChannel}/account/addresses`,
  `${localeChannel}/account/orders`,
  `${localeChannel}/account/settings`,
  `${localeChannel}/orders`, // legacy account redirect
  "/order/find",
  "/checkout/complete", // legacy confirmation redirect
] as const;

const operationsRoutes = [
  "/ops/analytics",
  "/ops/analytics/realtime",
  "/ops/analytics/traffic",
  "/ops/analytics/checkout",
  "/ops/analytics/products",
  "/ops/analytics/reminders",
  "/ops/themes",
  "/ops/plugins",
] as const;

test.describe("live storefront navigation and operational pages", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("browse, customer and redirect pages have working destinations", async ({ request }) => {
    for (const path of publicRoutes) {
      const response = await request.get(path);
      expect(response.status(), `Public page ${path} returned ${response.status()}`).toBeLessThan(400);
    }
    // This collection is seeded into the US Saleor channel by the integration workflow.
    const collection = await request.get(`${localeChannel}/collections/featured-products`);
    expect(collection.status()).toBe(200);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    const locs = Array.from((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]);
    const productUrl = locs.find(url => url && url.includes(`${localeChannel}/products/`));
    expect(productUrl, "The live Saleor sitemap should contain a product detail URL").toBeTruthy();
    const product = await request.get(productUrl!);
    expect(product.status()).toBe(200);
  });

  test("homepage collection CTA and visible footer links resolve", async ({ page, request }) => {
    const response = await page.goto(localeChannel);
    expect(response?.status()).toBe(200);

    const collections = page.locator('a[href="/en/us/collections/featured-products"]').first();
    await expect(collections).toHaveAttribute("href", /\/en\/us\/collections\/featured-products(?:[?#]|$)/);
    const collectionLink = await collections.getAttribute("href");
    expect((await request.get(collectionLink!)).status()).toBe(200);

    const links = await page.locator("footer a[href]").evaluateAll((anchors) =>
      Array.from(new Set(anchors.map(anchor => (anchor as HTMLAnchorElement).href))),
    );
    const base = new URL(page.url());
    for (const href of links) {
      const parsed = new URL(href);
      if (parsed.origin !== base.origin) continue; // external links aren't owned by Paper
      const destination = parsed.pathname + parsed.search;
      const target = await request.get(destination);
      expect(target.status(), `Visible footer link ${destination} returned ${target.status()}`).toBeLessThan(400);
    }
    // Legacy root policy links had no corresponding routes. They must never reappear.
    await expect(page.locator('footer a[href="/privacy"], footer a[href="/terms"]')).toHaveCount(0);
  });

  test("every operations page is protected and opens with the platform credential", async ({
    browser, request,
  }) => {
    const password = process.env.PLAYWRIGHT_THEME_EDITOR_SECRET;
    test.skip(!password, "Needs a dedicated integration-test operations credential");

    expect((await request.get("/ops/plugins")).status()).toBe(401);
    expect((await request.get("/ops/themes/api?channel=us&locale=en")).status()).toBe(401);

    const context = await browser.newContext({
      baseURL,
      httpCredentials: { username: "analytics", password: password! },
    });
    try {
      for (const path of operationsRoutes) {
        const page = await context.request.get(path);
        expect(page.status(), `Ops page ${path} returned ${page.status()}`).toBe(200);
      }
      // Actual client-side menu navigation, not only direct URL requests.
      const page = await context.newPage();
      await page.goto("/ops/analytics");
      await page.getByRole("link", { name: /系统插件/ }).click();
      await expect(page).toHaveURL(/\/ops\/plugins$/);
      await expect(page.getByRole("heading", { name: "系统插件" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
