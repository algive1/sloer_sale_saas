"use client";

import { createContext, use, type ReactNode } from "react";
import { Logo } from "@/ui/components/shared/logo";

export type CheckoutBrand = { name: string; logo?: string; logoInverted?: string };
// null means the trusted Host has not resolved yet; undefined preserves single-brand branding.
const CheckoutBrandContext = createContext<CheckoutBrand | null | undefined>(null);
export function CheckoutBrandProvider({
	brand,
	children,
}: {
	brand: CheckoutBrand | undefined;
	children?: ReactNode;
}) {
	return <CheckoutBrandContext value={brand}>{children}</CheckoutBrandContext>;
}
export function CheckoutBrandLogo({ className }: { className?: string }) {
	const brand = use(CheckoutBrandContext);
	if (brand === null)
		return (
			<span
				className={`inline-block w-24 animate-pulse rounded bg-muted ${className ?? ""}`}
				aria-hidden="true"
			/>
		);
	return (
		<Logo
			className={className}
			src={brand?.logo}
			invertedSrc={brand?.logoInverted}
			fallbackText={brand?.name}
		/>
	);
}
