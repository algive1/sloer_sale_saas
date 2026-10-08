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


const OWNER_COOKIE = "paper_wishlist_owner";
const OWNER_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(request: NextRequest) {
	if (!wishlistCloudConfigured()) return NextResponse.json({ items: [], cloud: false });
	const owner = await resolveOwner(request);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	const items = await listWishlist(owner.key);
	const response = NextResponse.json({ items, cloud: true });
	setGuestCookie(response, owner);
	return response;
}

export async function POST(request: NextRequest) {
	if (!wishlistCloudConfigured()) return new NextResponse(null, { status: 204 });
	const item: unknown = await request.json().catch(() => null);
	if (!isValidWishlistRecord(item)) return NextResponse.json({ error: "invalid_item" }, { status: 400 });
	const owner = await resolveOwner(request);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	await upsertWishlist(owner.key, item);
	const response = new NextResponse(null, { status: 204 });
	setGuestCookie(response, owner);
	return response;
}

export async function DELETE(request: NextRequest) {
	if (!wishlistCloudConfigured()) return new NextResponse(null, { status: 204 });
	const body = (await request.json().catch(() => null)) as { productId?: string } | null;
	if (!isValidWishlistProductId(body?.productId)) return NextResponse.json({ error: "invalid_product" }, { status: 400 });
	const owner = await resolveOwner(request);
	if (owner.mergeFrom) await mergeWishlistOwners(owner.mergeFrom, owner.key);
	await removeWishlist(owner.key, body.productId);
	const response = new NextResponse(null, { status: 204 });
	setGuestCookie(response, owner);
	return response;
}

async function resolveOwner(request: NextRequest): Promise<{ key: string; guestId?: string; mergeFrom?: string }> {
	const guestId = request.cookies.get(OWNER_COOKIE)?.value || crypto.randomUUID();
	const auth = await executeAuthenticatedGraphQL(CurrentUserDocument, { cache: "no-cache", maxRetries: 0, timeoutMs: 1_500 });
	if (auth.ok && auth.data.me?.id) {
		return { key: `user:${auth.data.me.id}`, mergeFrom: `guest:${guestId}` };
	}
	return { key: `guest:${guestId}`, guestId };
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

