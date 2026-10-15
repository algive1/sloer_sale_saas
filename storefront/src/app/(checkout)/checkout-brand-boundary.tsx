import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { brandSiteForHost, brandSitesConfigured } from "@/config/brand-sites";
import { CheckoutBrandProvider } from "@/checkout/providers/checkout-brand";

/** Resolve once from the trusted Host before transactional pages or their loading chrome render. */
export async function CheckoutBrandBoundary({ children }: { children: ReactNode }) {
	if (!brandSitesConfigured())
		return <CheckoutBrandProvider brand={undefined}>{children}</CheckoutBrandProvider>;
	const site = brandSiteForHost((await headers()).get("host"));
	if (!site) notFound();
	const brand = { name: site.name, logo: site.logo, logoInverted: site.logoInverted };
	return <CheckoutBrandProvider brand={brand}>{children}</CheckoutBrandProvider>;
}
