import { NextRequest, NextResponse } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import {
	SALEOR_OPS_PERMISSION_CODES,
	SALEOR_OPS_SESSION_COOKIE,
	createSaleorOpsSession,
	getSaleorOpsSessionSecret,
	saleorOpsSessionViewer,
	type SaleorOpsIdentity,
	type SaleorOpsPermission,
} from "@/lib/ops/saleor-session";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const SALEOR_STAFF_QUERY = `
	query CommerceOpsSaleorStaff {
		me {
			id
			email
			isStaff
			userPermissions { code }
			accessibleChannels { slug }
			restrictedAccessToChannels
		}
	}
`;

type SaleorStaffResponse = {
	data?: {
		me?: {
			id?: unknown;
			email?: unknown;
			isStaff?: unknown;
			userPermissions?: Array<{ code?: unknown }> | null;
			accessibleChannels?: Array<{ slug?: unknown }> | null;
			restrictedAccessToChannels?: unknown;
		} | null;
	};
};

function sameOriginRequest(request: NextRequest): boolean {
	const origin = request.headers.get("origin");
	const host = request.headers.get("host");
	if (!origin || !host || /[\s/@?#\\,]/.test(host)) return false;

	try {
		const parsed = new URL(origin);
		return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.host === host;
	} catch {
		return false;
	}
}

function allowedPermissions(values: Array<{ code?: unknown }> | null | undefined): SaleorOpsPermission[] {
	return [...new Set((values ?? [])
		.map(permission => permission.code)
		.filter((code): code is SaleorOpsPermission =>
			typeof code === "string" && SALEOR_OPS_PERMISSION_CODES.includes(code as SaleorOpsPermission),
		))];
}

function allowedSiteIds(
	channels: readonly string[],
	restrictedAccessToChannels: boolean,
): string[] {
	if (!restrictedAccessToChannels) return [];
	const allowedChannels = new Set(channels);
	return (getBrandSites() ?? [])
		.filter(site => site.channels.some(channel => allowedChannels.has(channel)))
		.map(site => site.id);
}

async function readVerifiedStaff(accessToken: string): Promise<SaleorOpsIdentity | null> {
	const endpoint = process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL;
	if (!endpoint) throw new Error("Saleor API URL is not configured");
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"authorization": `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ query: SALEOR_STAFF_QUERY, operationName: "CommerceOpsSaleorStaff" }),
		cache: "no-store",
		signal: AbortSignal.timeout(5000),
	});
	if (!response.ok) throw new Error("Saleor identity verification failed");
	const result = (await response.json()) as SaleorStaffResponse;
	const staff = result.data?.me;
	if (
		staff?.isStaff !== true ||
		typeof staff.id !== "string" ||
		typeof staff.email !== "string" ||
		typeof staff.restrictedAccessToChannels !== "boolean"
	) {
		return null;
	}
	const permissions = allowedPermissions(staff.userPermissions);
	if (!permissions.length) return null;
	const accessibleChannels = (staff.accessibleChannels ?? [])
		.map(channel => channel.slug)
		.filter((slug): slug is string => typeof slug === "string");
	const restrictedAccessToChannels = staff.restrictedAccessToChannels;
	const siteIds = allowedSiteIds(accessibleChannels, restrictedAccessToChannels);
	if (restrictedAccessToChannels && !siteIds.length) return null;

	return {
		id: staff.id,
		email: staff.email,
		isStaff: true,
		permissions,
		restrictedAccessToChannels,
		siteIds,
	};
}

export async function GET(request: NextRequest) {
	const viewer = await saleorOpsSessionViewer(
		request.cookies.get(SALEOR_OPS_SESSION_COOKIE)?.value,
		getSaleorOpsSessionSecret(),
	);
	return NextResponse.json({ authenticated: Boolean(viewer) }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
	if (!sameOriginRequest(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
	const sessionSecret = getSaleorOpsSessionSecret();
	if (!sessionSecret || sessionSecret.length < 32) {
		return NextResponse.json({ error: "saleor_sso_unavailable" }, { status: 503, headers: privateHeaders });
	}
	if (Number(request.headers.get("content-length") || "0") > 12_288) {
		return NextResponse.json({ error: "request_too_large" }, { status: 413, headers: privateHeaders });
	}
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return NextResponse.json({ error: "invalid_content_type" }, { status: 415, headers: privateHeaders });
	}

	let payload: unknown;
	try {
		const body = await request.text();
		if (body.length > 12_288) return NextResponse.json({ error: "request_too_large" }, { status: 413, headers: privateHeaders });
		payload = JSON.parse(body);
	} catch {
		return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: privateHeaders });
	}
	const accessToken = payload && typeof payload === "object" && "accessToken" in payload
		? (payload as { accessToken?: unknown }).accessToken
		: undefined;
	if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) {
		return NextResponse.json({ error: "invalid_access_token" }, { status: 400, headers: privateHeaders });
	}

	let identity: SaleorOpsIdentity | null;
	try {
		identity = await readVerifiedStaff(accessToken);
	} catch {
		return NextResponse.json({ error: "saleor_unavailable" }, { status: 503, headers: privateHeaders });
	}
	if (!identity) return NextResponse.json({ error: "staff_permission_required" }, { status: 403, headers: privateHeaders });

	const session = await createSaleorOpsSession(identity, accessToken, sessionSecret);
	if (!session) return NextResponse.json({ error: "session_expired" }, { status: 401, headers: privateHeaders });
	const response = NextResponse.json({ authenticated: true }, { headers: privateHeaders });
	response.cookies.set(SALEOR_OPS_SESSION_COOKIE, session.value, {
		httpOnly: true,
		sameSite: "strict",
		secure: request.nextUrl.protocol === "https:",
		path: "/",
		maxAge: session.maxAge,
	});
	return response;
}

export async function DELETE(request: NextRequest) {
	if (!sameOriginRequest(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
	const response = NextResponse.json({ authenticated: false }, { headers: privateHeaders });
	response.cookies.set(SALEOR_OPS_SESSION_COOKIE, "", {
		httpOnly: true,
		sameSite: "strict",
		secure: request.nextUrl.protocol === "https:",
		path: "/",
		maxAge: 0,
	});
	return response;
}
