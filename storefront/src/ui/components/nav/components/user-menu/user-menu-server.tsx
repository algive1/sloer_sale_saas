import { cookies } from "next/headers";
import { io } from "next/cache";

import { getHeaderAuthState } from "@/lib/auth/get-header-user";
import { brandSitesConfigured } from "@/config/brand-sites";

import { UserMenu } from "./user-menu";
import { UserMenuLoginLink } from "./user-menu-login-link";
import { UserMenuUnavailable } from "./user-menu-unavailable";

export async function UserMenuServer({ locale, channel }: { locale: string; channel: string }) {
	// The linked customer login page and shared profile are unavailable in multi-brand mode.
	if (brandSitesConfigured()) return null;
	// Request-dynamic under PPR — never serve a prerendered anonymous menu when cookies exist.
	await cookies();
	// Auth SDK token expiry uses `Date.now()` — dynamic boundary must be in this slot's
	// render frame so partial prefetch does not attribute it to cached Header chrome.
	await io();

	const auth = await getHeaderAuthState();

	switch (auth.status) {
		case "authenticated":
			return <UserMenu user={auth.user} />;
		case "unavailable":
			return <UserMenuUnavailable />;
		case "guest":
			return <UserMenuLoginLink locale={locale} channel={channel} />;
	}
}
