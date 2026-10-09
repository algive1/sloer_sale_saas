import { chromium, devices, expect, test } from "@playwright/test";

const origin = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const fashion = { Host: "fashion.example.test" };
const jewelry = { Host: "jewelry.example.test" };

test.describe("localized storefront entry and brand-safe SEO", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("first entry respects browser languages, cookies and brand ownership", async ({ request }) => {
    const getEntry = (host: typeof fashion, extra: Record<string, string> = {}) =>
      request.get(origin + "/", {
        headers: { ...host, Cookie: "", ...extra },
        maxRedirects: 0,
      });
    const f = await getEntry(fashion, { "Accept-Language": "de-DE,de;q=0.9,en;q=0.5" });
    expect(f.status()).toBe(307);
    expect(new URL(f.headers().location, origin).pathname).toBe("/de/us");
    expect(f.headers()["cache-control"]).toMatch(/private.*no-store/);
    expect(f.headers()["set-cookie"]).toContain("browse-locale=de");

    const j = await getEntry(jewelry, { "Accept-Language": "fr-FR,fr;q=0.9" });
    expect(j.status()).toBe(307);
    expect(new URL(j.headers().location, origin).pathname).toBe("/fr/jewelry-us");

    const fFallback = await getEntry(fashion, {
      Cookie: "browse-locale=fr", "Accept-Language": "fr-FR,fr;q=0.9",
    });
    expect(new URL(fFallback.headers().location, origin).pathname).toBe("/en/us");

    const jFallback = await getEntry(jewelry, {
      Cookie: "browse-locale=de", "Accept-Language": "de-DE",
    });
    expect(new URL(jFallback.headers().location, origin).pathname).toBe("/en/jewelry-us");

    const saved = await getEntry(fashion, {
      Cookie: "browse-locale=en", "Accept-Language": "de-DE",
    });
    expect(new URL(saved.headers().location, origin).pathname).toBe("/en/us");

    const country = await getEntry(fashion, {
      "x-storefront-visitor-country": "DE",
      "Accept-Language": "de-DE",
    });
    expect(new URL(country.headers().location, origin).pathname).toBe("/de/us");

    const untrusted = await request.get(origin + "/", {
      headers: { Host: "unregistered.example.test", "Accept-Language": "de-DE" },
      maxRedirects: 0,
    });
    expect(untrusted.status()).toBe(404);
  });

  test("explicit localized URLs are stable, language-specific and brand-restricted", async ({ request }) => {
    const [fashionDe, jewelryFr, missingFashionFr, missingJewelryDe, crossBrand] = await Promise.all([
      request.get(origin + "/de/us", {
        headers: { ...fashion, "Accept-Language": "fr-FR", Cookie: "browse-locale=fr" },
        maxRedirects: 0,
      }),
      request.get(origin + "/fr/jewelry-us", { headers: jewelry, maxRedirects: 0 }),
      request.get(origin + "/fr/us", { headers: fashion, maxRedirects: 0 }),
      request.get(origin + "/de/jewelry-us", { headers: jewelry, maxRedirects: 0 }),
      request.get(origin + "/de/us", { headers: jewelry, maxRedirects: 0 }),
    ]);
    expect(fashionDe.status()).toBe(200);
    expect(jewelryFr.status()).toBe(200);
    expect(await fashionDe.text()).toMatch(/<html[^>]*lang="de"/);
    expect(await jewelryFr.text()).toMatch(/<html[^>]*lang="fr"/);
    expect(missingFashionFr.status()).toBe(404);
    expect(missingJewelryDe.status()).toBe(404);
    expect(crossBrand.status()).toBe(404);
  });

  test("localized product SEO and sitemaps do not advertise another brand", async ({ request }) => {
    const fashionSitemap = await request.get(origin + "/sitemap.xml", { headers: fashion });
    const jewelrySitemap = await request.get(origin + "/sitemap.xml", { headers: jewelry });
    expect(fashionSitemap.status()).toBe(200);
    expect(jewelrySitemap.status()).toBe(200);
    const fXml = await fashionSitemap.text();
    const jXml = await jewelrySitemap.text();
    expect(fXml).toContain("https://fashion.example.test/de/us/products/");
    expect(jXml).toContain("https://jewelry.example.test/fr/jewelry-us/products/");
    expect(fXml).not.toContain("jewelry.example.test");
    expect(jXml).not.toContain("fashion.example.test");

    const slug = fXml.match(/<loc>https:\/\/fashion\.example\.test\/en\/us\/products\/([^<]+)<\/loc>/)?.[1];
    expect(slug, "CI Saleor catalog must have a published product").toBeTruthy();
    const product = await request.get(origin + "/de/us/products/" + slug, { headers: fashion });
    expect(product.status()).toBe(200);
    const html = await product.text();
    expect(html).toMatch(/<html[^>]*lang="de"/);
    expect(html).toContain("https://fashion.example.test/de/us/products/");
    const alternates = [...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)].map((m) => m[0]).join(" ");
    expect(alternates).not.toContain("jewelry.example.test");
    expect(alternates).toContain("https://fashion.example.test/");
  });
  test("mobile browser keeps the selected language across reloads", async () => {
    const mobileBrowser = await chromium.launch({
      args: ["--no-proxy-server", "--host-resolver-rules=MAP fashion.example.test 127.0.0.1"],
    });
    const context = await mobileBrowser.newContext({
      ...devices["iPhone 13"],
      locale: "de-DE",
    });
    try {
      const page = await context.newPage();
      await page.goto("http://fashion.example.test:3101/");
      await expect(page).toHaveURL(/\/de\/us\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "de");

      // The existing footer region picker must stay usable on a narrow device.
      await page.locator('footer button[aria-haspopup="menu"]').click();
      await page.getByRole("menuitemradio", { name: /English/ }).click();
      await expect(page).toHaveURL(/\/en\/us\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      await page.goto("http://fashion.example.test:3101/");
      await expect(page).toHaveURL(/\/en\/us\/?$/);
      const cookie = (await context.cookies()).find((entry) => entry.name === "browse-locale");
      expect(cookie?.value).toBe("en");
    } finally {
      await context.close();
      await mobileBrowser.close();
    }
  });

});
