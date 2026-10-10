import { NextRequest, NextResponse } from "next/server";
import { CurrentUserDocument } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import {
	listWishlist,
	mergeWishlistOwners,
	removeWishlist,
	upsertWishlist,
	wishlistCloudConfigured,
} from "@/lib/wishlist/wishlist-store";
import { isValidWishlistProductId, isValidWishlistRecord } from "@/lib/wishlist/validation";
import {
  scopedWishlistOwnerKey, wishlistItemBelongsToSite, wishlistScopeFromHost, type WishlistSiteScope,
} from "@/lib/wishlist/site-scope";


const OWNER_COOKIE = "paper_wishlist_owner";
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(request: NextRequest) {
  const scope = wishlistScopeFromHost(request.headers.get("host"));
  if (!scope) return NextResponse.json({ error: "store_not_found" }, { status: 404 });
	if (!wishlistCloudConfigured()) return NextResponse.json({ items: [], cloud: false });
	const owner = await resolveOwner(request, scope);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	const items = (await listWishlist(owner.key)).filter((item) => wishlistItemBelongsToSite(item, scope));
	const response = NextResponse.json({ items, cloud: true });
	// Wishlist data is user-/guest-private even if a CDN proxies the API.
	response.headers.set("Cache-Control", "private, no-store");
	setGuestCookie(response, owner);
	return response;
}

export async function POST(request: NextRequest) {
  const scope = wishlistScopeFromHost(request.headers.get("host"));
  if (!scope) return NextResponse.json({ error: "store_not_found" }, { status: 404 });
	if (!wishlistCloudConfigured()) return new NextResponse(null, { status: 204 });
	const item: unknown = await request.json().catch(() => null);
	if (!isValidWishlistRecord(item) || !wishlistItemBelongsToSite(item, scope)) return NextResponse.json({ error: "invalid_item" }, { status: 400 });
	const owner = await resolveOwner(request, scope);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	await upsertWishlist(owner.key, item);
	const response = new NextResponse(null, { status: 204 });
	setGuestCookie(response, owner);
	return response;
}

export async function DELETE(request: NextRequest) {
  const scope = wishlistScopeFromHost(request.headers.get("host"));
  if (!scope) return NextResponse.json({ error: "store_not_found" }, { status: 404 });
	if (!wishlistCloudConfigured()) return new NextResponse(null, { status: 204 });
	const body = (await request.json().catch(() => null)) as { productId?: string } | null;
	if (!isValidWishlistProductId(body?.productId)) return NextResponse.json({ error: "invalid_product" }, { status: 400 });
	const owner = await resolveOwner(request, scope);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	await removeWishlist(owner.key, body.productId);
	const response = new NextResponse(null, { status: 204 });
	setGuestCookie(response, owner);
	return response;
}

async function resolveOwner(request: NextRequest, scope: WishlistSiteScope): Promise<{ key: string; guestId?: string; mergeFrom?: string }> {
	const guestId = request.cookies.get(OWNER_COOKIE)?.value || crypto.randomUUID();
	// A Saleor Core customer account is global, not a brand-specific identity.
	// The public wishlist must not look up `me` or implicitly bind guest records
	// to that global account when there are multiple brands on a shared Core.
	// scope.siteId was derived from the verified Host, not from request data.
	if (scope.siteId) {
		return { key: scopedWishlistOwnerKey(`guest:${guestId}`, scope), guestId };
	}

	const auth = await executeAuthenticatedGraphQL(CurrentUserDocument, { cache: "no-cache", maxRetries: 0, timeoutMs: 1_500 });
	if (auth.ok && auth.data.me?.id) {
		return { key: scopedWishlistOwnerKey(`user:${auth.data.me.id}`, scope), mergeFrom: scopedWishlistOwnerKey(`guest:${guestId}`, scope) };
	}
	return { key: scopedWishlistOwnerKey(`guest:${guestId}`, scope), guestId };
}

function setGuestCookie(
	response: NextResponse,
	owner: { guestId?: string },
): void {
	if (!owner.guestId) return;
	response.cookies.set(OWNER_COOKIE, owner.guestId, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: OWNER_MAX_AGE,
	});
}

