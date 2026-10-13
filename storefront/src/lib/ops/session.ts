import { parseOpsOperators, resolveOpsViewer, type OpsIdentityInput } from "./authorization";

export const OPS_SESSION_COOKIE = "commerce_ops_session";
export const OPS_SESSION_SECONDS = 8 * 60 * 60;
type OpsConfig = Omit<OpsIdentityInput, "authorization">;
const encoder = new TextEncoder();

async function signingKey(config: OpsConfig): Promise<CryptoKey | null> {
	const secret = config.operatorsJson?.trim() || config.legacySecret?.trim();
	if (!secret || secret.length < 32) return null;
	return crypto.subtle.importKey(
		"raw",
		encoder.encode("commerce-ops-session-v1:" + secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

/** Credentials remain on the server. Rotation or operator scope edits revoke all sessions. */
export async function createOpsSession(authorization: string, config: OpsConfig): Promise<string | null> {
	const viewer = resolveOpsViewer({ ...config, authorization });
	const key = await signingKey(config);
	if (!viewer || !key) return null;
	const payload = `${viewer.username}.${Math.floor(Date.now() / 1000) + OPS_SESSION_SECONDS}`;
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
	return `${payload}.${btoa(String.fromCharCode(...signature))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "")}`;
}

export async function opsSessionAuthorization(
	session: string | undefined,
	config: OpsConfig,
): Promise<string | null> {
	if (!session || session.length > 512) return null;
	const match = /^([a-z][a-z0-9_-]{2,63})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(session);
	if (!match) return null;
	const [, username, expires, signature] = match;
	const now = Math.floor(Date.now() / 1000);
	if (
		!username ||
		!expires ||
		!signature ||
		Number(expires) <= now ||
		Number(expires) > now + OPS_SESSION_SECONDS
	)
		return null;
	const key = await signingKey(config);
	if (!key) return null;
	const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "="), (c) =>
		c.charCodeAt(0),
	);
	if (!(await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${username}.${expires}`))))
		return null;
	const operators = parseOpsOperators(config.operatorsJson, config.trustedSiteIds);
	const password = operators
		? operators.find((account) => account.username === username)?.password
		: username === "analytics"
			? config.legacySecret?.trim()
			: undefined;
	return password ? "Basic " + btoa(`${username}:${password}`) : null;
}

export function opsLoginDestination(value: string | null): string {
	if (!value || !value.startsWith("/ops") || /[\\\r\n]/.test(value)) return "/ops/plugins";
	const url = new URL(value, "http://ops.invalid");
	if (
		url.origin !== "http://ops.invalid" ||
		(url.pathname !== "/ops" && !url.pathname.startsWith("/ops/")) ||
		url.pathname.startsWith("/ops/login")
	)
		return "/ops/plugins";
	return url.pathname + url.search;
}
