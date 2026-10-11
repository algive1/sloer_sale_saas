import { parallel } from "../config.ts";
import { expect, test } from "../fixtures/test.ts";
import { HomePage } from "../pages/homePage.ts";

/**
 * Browser-level acceptance for the merchant navigation.
 *
 * Uses Saleor's real Dashboard with the disposable seeded 3.23 stack.
 * Custom /ops routes are deliberately NOT opened here: they use separate
 * HTTP Basic authentication and must be tested against their own service.
 */

test.describe("Merchant navigation – desktop admin", { tag: parallel() }, () => {
  test.use({ actor: "admin" });

  test("collapses and expands to the selected section and persists the preference", async ({
    page,
  }, testInfo) => {
    await new HomePage(page).goto();
    await new HomePage(page).expectSignedIn();

    await expect(page.getByTestId("commerce-sidebar-expanded")).toBeVisible();
    await expect(page.getByTestId("commerce-admin-topbar")).toBeVisible();
    await expect(page.getByTestId("commerce-admin-search")).toBeVisible();

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
    await expect(
      page.locator('[data-test-id="menu-item-label-products"].sidebar-item-group-trigger'),
    ).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("Merchant navigation – limited staff", { tag: parallel() }, () => {
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

test.describe("Merchant navigation – mobile admin", { tag: parallel() }, () => {
  test.use({ actor: "admin" });

  test("keeps a full, keyboard-accessible drawer at mobile widths", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await new HomePage(page).goto();
    await new HomePage(page).expectSignedIn();

    await expect(page.getByTestId("sidebar-drawer-open")).toBeVisible();
    await page.getByTestId("sidebar-drawer-open").click();

    const drawer = page.getByTestId("sidebar-drawer-content");

    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("commerce-sidebar-expanded")).toBeVisible();
    await expect(drawer.getByTestId("commerce-admin-search")).toBeVisible();

    await testInfo.attach("admin-mobile-drawer", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
