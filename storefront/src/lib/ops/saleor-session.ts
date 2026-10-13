import type { OpsViewer } from "./authorization";

export const SALEOR_OPS_SESSION_COOKIE = "commerce_saleor_ops_session";
export const SALEOR_OPS_SESSION_SECONDS = 5 * 60;

export const SALEOR_OPS_PERMISSION_CODES = [
	"MANAGE_ORDERS",
	"MANAGE_PRODUCTS",
	"MANAGE_SETTINGS",
	"MANAGE_PAGES",
	"MANAGE_TRANSLATIONS",
	"MANAGE_APPS",
	"MANAGE_USERS",
] as const;

export type SaleorOpsPermission = (typeof SALEOR_OPS_PERMISSION_CODES)[number];

export type SaleorOpsIdentity = Readonly<{
	id: string;
	email: string;
	isStaff: true;
	permissions: readonly SaleorOpsPermission[];
	restrictedAccessToChannels: boolean;
	siteIds: readonly string[];
}>;

export type SaleorOpsViewer = OpsViewer & Readonly<{
	authSource: "saleor";
	permissions: readonly SaleorOpsPermission[];
	restrictedAccessToChannels: boolean;
}>;

type SaleorOpsSessionPayload = SaleorOpsIdentity & Readonly<{
	version: 1;
	expiresAt: number;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A dedicated key is preferred; existing server-only Ops credentials keep local deployments working. */
export function getSaleorOpsSessionSecret(): string | undefined {
	return process.env.SALEOR_OPS_SESSION_SECRET?.trim() ||
		process.env.OPS_OPERATORS_JSON?.trim() ||
		process.env.ANALYTICS_DASHBOARD_SECRET?.trim() ||
		undefined;
}

function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function tokenExpiresAt(accessToken: string): number | null {
	const [, payload] = accessToken.split(".");
	if (!payload) return null;

	try {
		const decoded = JSON.parse(decoder.decode(fromBase64Url(payload))) as { exp?: unknown };
		return typeof decoded.exp === "number" && Number.isSafeInteger(decoded.exp) ? decoded.exp : null;
	} catch {
		return null;
	}
}

async function signingKey(secret: string | undefined): Promise<CryptoKey | null> {
	if (!secret || secret.length < 32) return null;
	return crypto.subtle.importKey(
		"raw",
		encoder.encode("commerce-ops-saleor-session-v1:" + secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

/** Sign only the verified Saleor identity, permissions and channel scope. */
export async function createSaleorOpsSession(
	identity: SaleorOpsIdentity,
	accessToken: string,
	secret: string | undefined,
	now = Math.floor(Date.now() / 1000),
): Promise<{ value: string; maxAge: number } | null> {
	const key = await signingKey(secret);
	const accessExpiresAt = tokenExpiresAt(accessToken);
	const expiresAt = Math.min(now + SALEOR_OPS_SESSION_SECONDS, accessExpiresAt ?? 0);
	if (!key || !accessExpiresAt || expiresAt <= now + 30 || identity.permissions.length === 0) return null;

	const payload: SaleorOpsSessionPayload = {
		...identity,
		version: 1,
		expiresAt,
	};
	const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const signedValue = `v1.${encodedPayload}`;
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signedValue)));

	return {
		value: `${signedValue}.${toBase64Url(signature)}`,
		maxAge: expiresAt - now,
	};
}

function isPermission(value: unknown): value is SaleorOpsPermission {
	return typeof value === "string" && SALEOR_OPS_PERMISSION_CODES.includes(value as SaleorOpsPermission);
}

function isSessionPayload(value: unknown): value is SaleorOpsSessionPayload {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const payload = value as Record<string, unknown>;
	return payload.version === 1 &&
		typeof payload.id === "string" && payload.id.length > 0 && payload.id.length <= 256 &&
		typeof payload.email === "string" && payload.email.length <= 320 &&
		payload.isStaff === true &&
		Array.isArray(payload.permissions) && payload.permissions.length > 0 && payload.permissions.every(isPermission) &&
		typeof payload.restrictedAccessToChannels === "boolean" &&
		Array.isArray(payload.siteIds) && payload.siteIds.every(siteId => typeof siteId === "string") &&
		typeof payload.expiresAt === "number" && Number.isSafeInteger(payload.expiresAt);
}

/** Validate the signed session and return only server-authorized fields. */
export async function saleorOpsSessionViewer(
	session: string | undefined,
	secret: string | undefined,
	now = Math.floor(Date.now() / 1000),
): Promise<SaleorOpsViewer | null> {
	if (!session || session.length > 8192) return null;
	const [version, encodedPayload, encodedSignature, extra] = session.split(".");
	if (version !== "v1" || !encodedPayload || !encodedSignature || extra !== undefined) return null;

	const key = await signingKey(secret);
	if (!key) return null;

	let payload: unknown;
	let signature: Uint8Array;
	try {
		payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));
		signature = fromBase64Url(encodedSignature);
	} catch {
		return null;
	}
	if (!isSessionPayload(payload) || payload.expiresAt <= now || payload.expiresAt > now + SALEOR_OPS_SESSION_SECONDS) {
		return null;
	}
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(`v1.${encodedPayload}`),
	);
	if (!valid) return null;

	return {
		username: payload.email,
		role: payload.restrictedAccessToChannels ? "brand_analyst" : "platform_admin",
		siteIds: payload.siteIds,
		authSource: "saleor",
		permissions: payload.permissions,
		restrictedAccessToChannels: payload.restrictedAccessToChannels,
	};
}
