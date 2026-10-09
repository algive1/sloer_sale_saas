import { expect, test } from "@playwright/test";

const origin = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const saleor = process.env.SALEOR_API_URL ?? "http://127.0.0.1:8000/graphql/";
const fashion = { Host: "fashion.example.test" };
const jewelry = { Host: "jewelry.example.test" };
const unknown = { Host: "unregistered.example.test" };

test.describe("two-brand / two-host real Saleor integration", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("public routing and site indexes remain bound to their real Host", async ({ request }) => {
    const [f, j, wrongFashion, wrongJewelry, unknownHost] = await Promise.all([
      request.get(origin + "/en/us", { headers: fashion }),
      request.get(origin + "/en/jewelry-us", { headers: jewelry }),
      request.get(origin + "/en/us", { headers: jewelry }),
      request.get(origin + "/en/jewelry-us", { headers: fashion }),
      request.get(origin + "/en/us", { headers: unknown }),
    ]);
    expect(f.status(), "Fashion has a valid storefront").toBe(200);
    expect(j.status(), "Jewelry has a valid storefront").toBe(200);
    const [fashionHtml, jewelryHtml] = await Promise.all([f.text(), j.text()]);
    // A runtime Host allowlist is not enough if the HTML was built in
    // single-brand mode; merchant tracking and site chrome can be prerendered.
    expect(fashionHtml).toContain('data-multibrand="true"');
    expect(jewelryHtml).toContain('data-multibrand="true"');
    expect(wrongFashion.status(), "Jewelry host must not render fashion Channel").toBe(404);
    expect(wrongJewelry.status(), "Fashion host must not render jewelry Channel").toBe(404);
    expect(unknownHost.status(), "An unknown domain cannot fall through to the first brand").toBe(404);

    const [fashionSite, jewelrySite, robots] = await Promise.all([
      request.get(origin + "/sitemap.xml", { headers: fashion }),
      request.get(origin + "/sitemap.xml", { headers: jewelry }),
      request.get(origin + "/robots.txt", { headers: jewelry }),
    ]);
    expect(fashionSite.status()).toBe(200);
    expect(jewelrySite.status()).toBe(200);
    const fashionXml = await fashionSite.text();
    const jewelryXml = await jewelrySite.text();
    expect(fashionXml).toContain("https://fashion.example.test/en/us/products/");
    expect(jewelryXml).toContain("https://jewelry.example.test/en/jewelry-us/products/");
    expect(fashionXml).not.toContain("jewelry.example.test");
    expect(jewelryXml).not.toContain("fashion.example.test");
    expect(await robots.text()).toContain("https://jewelry.example.test/sitemap.xml");

    const fCount = (fashionXml.match(/<loc>[^<]*\/products\//g) ?? []).length;
    const jCount = (jewelryXml.match(/<loc>[^<]*\/products\//g) ?? []).length;
    expect(fCount, "Fashion published catalog should be larger than jewelry").toBeGreaterThan(jCount);
    expect(jCount).toBeGreaterThan(0);
  });

  test("Google Merchant feeds cannot publish products or links from a foreign brand", async ({ request }) => {
    const [f, j, cross, unknownFeed] = await Promise.all([
      request.get(origin + "/merchant/google.xml?channel=us&locale=en", { headers: fashion }),
      request.get(origin + "/merchant/google.xml?channel=jewelry-us&locale=en", { headers: jewelry }),
      request.get(origin + "/merchant/google.xml?channel=us&locale=en", { headers: jewelry }),
      request.get(origin + "/merchant/google.xml?channel=us&locale=en", { headers: unknown }),
    ]);
    expect(f.status()).toBe(200);
    expect(j.status()).toBe(200);
    expect(cross.status()).toBe(400);
    expect(unknownFeed.status()).toBe(404);
    const fashionXml = await f.text();
    const jewelryXml = await j.text();
    expect(fashionXml).toContain("https://fashion.example.test/");
    expect(jewelryXml).toContain("https://jewelry.example.test/");
    expect(fashionXml).not.toContain("jewelry.example.test");
    expect(jewelryXml).not.toContain("fashion.example.test");
    expect(jewelryXml).toContain("<g:price>");
  });

  test("an upstream Saleor checkout ID is not usable on another brand host in Paper", async ({ request }) => {
    const listing = await request.post(saleor, {
      data: { query: `query { products(first: 1, channel: "us") { edges { node { variants { id } } } } }` },
    });
    expect(listing.status()).toBe(200);
    const listData = await listing.json();
    const variantId = listData?.data?.products?.edges?.[0]?.node?.variants?.[0]?.id as string | undefined;
    expect(variantId, JSON.stringify(listData)).toBeTruthy();

    const response = await request.post(saleor, {
      data: {
        query: `mutation($input: CheckoutCreateInput!) {
          checkoutCreate(input: $input) { checkout { id channel { slug } } errors { field message } }
        }`,
        variables: { input: { channel: "us", email: "multibrand-ci@example.test", lines: [{ variantId, quantity: 1 }] } },
      },
    });
    expect(response.status()).toBe(200);
    const checkoutData = await response.json();
    const checkoutId = checkoutData?.data?.checkoutCreate?.checkout?.id as string | undefined;
    expect(checkoutId, JSON.stringify(checkoutData)).toBeTruthy();
    expect(checkoutData.data.checkoutCreate.checkout.channel.slug).toBe("us");

    const checkoutPath = origin + "/checkout?checkout=" + encodeURIComponent(checkoutId!);
    const [sameHost, foreignHost] = await Promise.all([
      request.get(checkoutPath, { headers: fashion }),
      request.get(checkoutPath, { headers: jewelry }),
    ]);
    expect(sameHost.status(), "Checkout is available to its own brand").toBe(200);
    expect(foreignHost.status(), "Checkout must be denied from foreign brand").toBe(404);
  });

  test("administration stays password-protected irrespective of incoming brand Host", async ({ request }) => {
    expect((await request.get(origin + "/ops/sites", { headers: fashion })).status()).toBe(401);
    expect((await request.get(origin + "/ops/sites", { headers: jewelry })).status()).toBe(401);
    expect((await request.get(origin + "/api/wishlist", { headers: unknown })).status()).toBe(404);
  });
});
