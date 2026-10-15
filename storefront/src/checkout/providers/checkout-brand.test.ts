import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckoutHeaderSkeleton } from "@/checkout/views/saleor-checkout/checkout-header-skeleton";
import { OrderConfirmationHeaderSkeleton } from "@/checkout/views/order-confirmation/order-confirmation-header-skeleton";
import { CheckoutBrandLogo, CheckoutBrandProvider } from "./checkout-brand";
function render(brand: { name: string; logo?: string } | undefined) {
	return renderToStaticMarkup(
		createElement(
			CheckoutBrandProvider,
			{ brand },
			createElement(CheckoutBrandLogo, { className: "h-7 w-auto" }),
		),
	);
}
describe("trusted transaction brand chrome", () => {
	it("keeps each brand's logo and accessible name separate", () => {
		expect(render({ name: "Fashion", logo: "/fashion.svg" })).toContain('src="/fashion.svg"');
		expect(render({ name: "Jewelry", logo: "/jewelry.svg" })).toContain('alt="Jewelry"');
		expect(render({ name: "Jewelry", logo: "/jewelry.svg" })).not.toContain("fashion");
	});
	it("uses the actual brand name when no logo was supplied", () => {
		const html = render({ name: "Fashion" });
		expect(html).toContain("Fashion");
		expect(html).not.toContain("/logo.svg");
	});
	it("does not show another mark before the server resolves Host", () => {
		const html = renderToStaticMarkup(createElement(CheckoutBrandLogo));
		expect(html).toContain('aria-hidden="true"');
		expect(html).not.toContain("<img");
	});
	it("retains the existing single-brand logo", () => {
		expect(render(undefined)).toContain('src="/logo.svg"');
	});
});

for (const width of [375, 1280]) {
	it.runIf(process.env.CHECKOUT_BRAND_BROWSER === "true")(
		`renders real loading headers in Chrome at ${width}px`,
		async () => {
			const { chromium } = await import("@playwright/test");
			const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL });
			try {
				const page = await browser.newPage({ viewport: { width, height: 812 } });
				for (const Header of [CheckoutHeaderSkeleton, OrderConfirmationHeaderSkeleton]) {
					for (const brand of [{ name: "Fashion", logo: "/fashion.svg" }, { name: "Jewelry" }]) {
						const html = renderToStaticMarkup(
							createElement(CheckoutBrandProvider, { brand }, createElement(Header)),
						);
						await page.setContent(html);
						if (brand.logo) {
							expect(await page.getByRole("img", { name: brand.name }).getAttribute("src")).toBe(brand.logo);
						} else {
							expect(await page.getByText(brand.name, { exact: true }).isVisible()).toBe(true);
						}
						expect(await page.locator('img[src="/logo.svg"]').count()).toBe(0);
					}
				}
			} finally {
				await browser.close();
			}
		},
		30000,
	);
}
