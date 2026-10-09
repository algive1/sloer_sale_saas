import { cookies, headers } from "next/headers";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { isChannelAllowedForCurrentHost, requireChannelForCurrentHost } from "@/lib/brand/request-scope";
import { cache } from "react";
import { checkoutIdCookieName } from "@paper/session-bridge";
import { CheckoutCreateDocument, CheckoutCustomerDetachDocument, CheckoutFindDocument } from "@/gql/graphql";
import { type CartCheckout, withTranslatedCartCheckout } from "@/lib/cart-checkout";
import { checkoutGraphqlLocaleVariables, resolveCheckoutLocaleSlug } from "@/lib/checkout-locale";
import { checkoutCreateContextMetadata } from "@/lib/commerce-context/checkout-create-context";
import { executeAuthenticatedGraphQL, executePublicGraphQL } from "@/lib/graphql";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";

async function cartSiteChannels(): Promise<{ allowed: readonly string[]; defaultChannel: string } | null> {
  if (!brandSitesConfigured()) return null;
  const site = brandSiteForHost((await headers()).get("host"));
  // Unknown hosts get no cross-brand cookie fallback.
  return site ? { allowed: site.channels, defaultChannel: site.defaultChannel } : { allowed: [], defaultChannel: "" };
}

/** Checkout id from this channel's cart cookie (`checkoutId-{channel}`). */
export async function getIdFromCookies(channel: string) {
  if (!(await isChannelAllowedForCurrentHost(channel))) return "";
	try {
		const cookieName = checkoutIdCookieName(channel);
		const checkoutId = (await cookies()).get(cookieName)?.value || "";
		return checkoutId;
	} catch {
		// During static generation, cookies() throws - return empty string
		return "";
	}
}

/**
 * Cart checkout id when `/checkout` has no `?checkout=` param.
 *
 * Checkout lives at `/checkout` (no `[channel]` segment), but cart cookies are
 * per channel. With carts in multiple channels the default channel wins;
 * otherwise channels are compared alphabetically so the pick is deterministic.
 */
/** Channel slug from cart cookies when checkout channel is not yet known (e.g. empty checkout). */
export async function getChannelSlugFromCartCookies(): Promise<string | null> {
  const brand = await cartSiteChannels();
	try {
		const cartCookies = (await cookies())
			.getAll()
			.filter((cookie) => cookie.name.startsWith("checkoutId-") && cookie.value &&
        (!brand || brand.allowed.includes(cookie.name.slice(checkoutIdCookieName("").length))));

		if (cartCookies.length === 0) {
			return null;
		}

		const channelFromCookie = (name: string) => name.slice(checkoutIdCookieName("").length);

		const defaultChannel = brand?.defaultChannel ?? process.env.NEXT_PUBLIC_DEFAULT_CHANNEL;
		if (defaultChannel) {
			const preferred = cartCookies.find((cookie) => cookie.name === checkoutIdCookieName(defaultChannel));
			if (preferred) {
				return channelFromCookie(preferred.name);
			}
		}

		return channelFromCookie([...cartCookies].sort((a, b) => a.name.localeCompare(b.name))[0].name);
	} catch {
		return null;
	}
}

export async function getFirstCheckoutIdFromCartCookies(): Promise<string | null> {
  const brand = await cartSiteChannels();
	try {
		const cartCookies = (await cookies())
			.getAll()
			.filter((cookie) => cookie.name.startsWith("checkoutId-") && cookie.value &&
        (!brand || brand.allowed.includes(cookie.name.slice(checkoutIdCookieName("").length))));

		if (cartCookies.length === 0) {
			return null;
		}

		const defaultChannel = brand?.defaultChannel ?? process.env.NEXT_PUBLIC_DEFAULT_CHANNEL;
		if (defaultChannel) {
			const preferred = cartCookies.find((cookie) => cookie.name === checkoutIdCookieName(defaultChannel));
			if (preferred) {
				return preferred.value;
			}
		}

		return [...cartCookies].sort((a, b) => a.name.localeCompare(b.name))[0].value;
	} catch {
		return null;
	}
}

export async function saveIdToCookie(channel: string, checkoutId: string) {
  await requireChannelForCurrentHost(channel);
	const shouldUseHttps =
		process.env.NEXT_PUBLIC_STOREFRONT_URL?.startsWith("https") || !!process.env.NEXT_PUBLIC_VERCEL_URL;
	const cookieName = checkoutIdCookieName(channel);
	(await cookies()).set(cookieName, checkoutId, {
		sameSite: "lax",
		secure: shouldUseHttps,
	});
}

export async function clearCheckoutCookie(channel: string) {
	const cookieName = checkoutIdCookieName(channel);
	(await cookies()).delete(cookieName);
}

/** Remove any channel cookie that points at a stale checkout ID. */
export async function clearCheckoutCookieByValue(checkoutId: string) {
	if (!checkoutId) {
		return;
	}

	try {
		const cookieStore = await cookies();
		for (const cookie of cookieStore.getAll()) {
			if (cookie.name.startsWith("checkoutId-") && cookie.value === checkoutId) {
				cookieStore.delete(cookie.name);
			}
		}
	} catch {
		// Ignore in static contexts
	}
}

/**
 * Live checkout fetch — always `no-cache` (per-user data must never be shared-cached),
 * but **request-memoized** via React `cache()`: the header cart badge, the cart drawer,
 * and the cart page all read the checkout during one RSC render, and without dedup each
 * paid its own Saleor round trip (extra upstream load + provisioned-memory wall time).
 */
export const find = cache(async (
  checkoutId: string, localeSlug?: string, expectedChannel?: string,
): Promise<CartCheckout | null> => {
  if (!checkoutId) return null;
  if (brandSitesConfigured()) {
    // Paper's lean cart query intentionally omits checkout.channel.
    // Verify authoritative channel via the existing full checkout query
    // rather than inferring ownership from a client-controlled cookie name.
    const { fetchCheckoutOnServer } = await import("@/checkout/lib/server/fetch-checkout");
    const live = await fetchCheckoutOnServer(checkoutId);
    if (!live.ok || !live.checkout ||
        (expectedChannel && live.checkout.channel.slug !== expectedChannel)) return null;
  }

	const result = await executePublicGraphQL(CheckoutFindDocument, {
		variables: { id: checkoutId, ...(await checkoutGraphqlLocaleVariables(localeSlug)) },
		cache: "no-cache",
	});

	if (!result.ok || !result.data.checkout) {
		return null;
	}

	return withTranslatedCartCheckout(result.data.checkout);
});

export async function findOrCreate({
	channel,
	checkoutId,
	localeSlug,
}: {
	checkoutId?: string;
	channel: string;
	localeSlug?: string;
}) {
	if (!checkoutId) {
		const result = await create({ channel, localeSlug });
		return result.ok ? result.data.checkoutCreate?.checkout : null;
	}

	const checkout = await find(checkoutId, localeSlug, channel);
	if (checkout) {
		return checkout;
	}

	const result = await create({ channel, localeSlug });
	return result.ok ? result.data.checkoutCreate?.checkout : null;
}

export async function create({ channel, localeSlug }: { channel: string; localeSlug?: string }) {
  await requireChannelForCurrentHost(channel);
	const locale = await resolveCheckoutLocaleSlug(localeSlug);
	return executeAuthenticatedGraphQL(CheckoutCreateDocument, {
		cache: "no-cache",
		variables: {
			channel,
			...graphqlLanguageCodeVariables(locale),
			metadata: await checkoutCreateContextMetadata(locale),
		},
	});
}

/** Detach the logged-in customer from a checkout (call before sign-out). */
export async function detachCustomer(checkoutId: string) {
	if (!checkoutId) {
		return;
	}

	await executeAuthenticatedGraphQL(CheckoutCustomerDetachDocument, {
		variables: { id: checkoutId },
		cache: "no-cache",
	});
}
