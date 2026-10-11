import { expect, test } from "../fixtures/test.ts";
import { HomePage } from "../pages/homePage.ts";

/**
 * Browser-level acceptance for the merchant navigation.
 *
 * Uses Saleor's real Dashboard with the disposable seeded 3.23 stack.
 * Custom /ops routes are deliberately NOT opened here: they use separate
 * HTTP Basic authentication and must be tested against their own service.
 */

test.describe("Merchant navigation – desktop admin", () => {
  test.use({ actor: "admin" });

  test("collapses and expands to the selected section and persists the preference", async ({
    page,
  }, testInfo) => {
    await new HomePage(page).goto();
    await new HomePage(page).expectSignedIn();

    await expect(page.getByTestId("commerce-sidebar-expanded")).toBeVisible();
    await expect(page.getByTestId("commerce-admin-topbar")).toBeVisible();
    await expect(page.getByTestId("commerce-admin-search")).toBeVisible();

    // The Apps accordion starts closed; expand it before inspecting links.
    // Commerce Ops destinations remain independently authenticated, so the
    // browser checks their anchors but never enters their protected service.
    await page.locator(
      '[data-test-id="menu-item-label-installed-extensions"].sidebar-item-group-trigger',
    ).click();
    for (const [id, href] of [
      ["commerce-analytics-overview", "http://localhost:3000/ops/analytics"],
      ["commerce-theme-builder", "http://localhost:3000/ops/themes"],
      ["commerce-system-apps", "http://localhost:3000/ops/plugins"],
    ] as const) {
      const link = page.getByTestId(`menu-item-label-${id}`).locator("a");

      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }

    await page.getByTestId("commerce-admin-search").scrollIntoViewIfNeeded();

    await testInfo.attach("admin-expanded", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await page.getByTestId("commerce-sidebar-toggle").click();
    await expect(page.getByTestId("commerce-sidebar-compact")).toBeVisible();
    await expect(page.getByTestId("commerce-rail-products")).toBeVisible();

    await testInfo.attach("admin-icon-rail", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await page.reload();
    await expect(page.getByTestId("commerce-sidebar-compact")).toBeVisible();

    await page.getByTestId("commerce-rail-products").click();
    await expect(page.getByTestId("commerce-sidebar-expanded")).toBeVisible();
    // Macaw's group trigger is an LI and does not set aria-expanded. Verify
    // actual submenu visibility instead of asserting an absent HTML attribute.
    await expect(page.getByTestId("menu-item-label-categories")).toBeVisible();
  });
});

test.describe("Merchant navigation – limited staff", () => {
  test.use({ actor: "staff" });

  test("does not expose Search to staff without Saleor search permissions", async ({ page }) => {
    await new HomePage(page).goto();
    await new HomePage(page).expectSignedIn();

    await expect(page.getByTestId("commerce-admin-topbar")).toBeVisible();
    await expect(page.getByTestId("commerce-admin-topbar").locator('a[href="/search"]')).toHaveCount(0);
    await expect(page.getByTestId("commerce-admin-search")).toHaveCount(0);
    await expect(page.getByTestId("commerce-sidebar-expanded")).toBeVisible();
  });
});

test.describe("Merchant navigation – mobile admin", () => {
  test.use({ actor: "admin" });

  test("keeps a full, keyboard-accessible drawer at mobile widths", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await new HomePage(page).goto();
    // On mobile the signed-in account menu lives in a closed drawer;
    // asserting its visibility before opening the drawer is incorrect.
    await expect(page.getByTestId("commerce-admin-topbar")).toBeVisible();

    await expect(page.getByTestId("sidebar-drawer-open")).toBeVisible();
    await page.getByTestId("sidebar-drawer-open").click();

    const drawer = page.getByTestId("sidebar-drawer-content");

    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("commerce-sidebar-expanded")).toBeVisible();
    await expect(drawer.getByTestId("commerce-admin-search")).toBeVisible();
    await expect(drawer.getByTestId("userMenu")).toBeVisible();

    await testInfo.attach("admin-mobile-drawer", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
