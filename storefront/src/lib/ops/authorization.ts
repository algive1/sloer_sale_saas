/**
 * Deployment-scoped operations authorization. Keep independent from cookies,
 * shopper auth and untrusted Host/channel selectors. /ops middleware is the
 * request boundary; brand_analyst deliberately has no mutation capabilities.
 *
 * OPS_OPERATORS_JSON is opt-in. When configured it REPLACES, rather than
 * supplements, the legacy shared analytics Basic password.
 */
export type OpsRole = "platform_admin" | "brand_analyst";

type Operator = Readonly<{
  username: string;
  password: string;
  role: OpsRole;
  siteIds: readonly string[];
}>;

export type OpsAuthorization = "allowed" | "unauthenticated" | "forbidden" | "disabled";

const USERNAME = /^[a-z][a-z0-9_-]{2,63}$/;
const SITE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const PASSWORD = /^[\x21-\x7e]{32,256}$/;
const BRAND_READ_ROUTE = /^\/ops\/sites\/([a-zA-Z0-9_-]{1,64})(?:\/(?:insights|readiness))?\/?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Fail closed on malformed/duplicate credentials or invalid brand IDs. */
export function parseOpsOperators(raw: string | undefined, trustedSiteIds: readonly string[]): readonly Operator[] | null {
  if (!raw?.trim()) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) {
    throw new Error("OPS_OPERATORS_JSON must contain 1–100 operator accounts");
  }
  const usernames = new Set<string>();
  const trusted = new Set(trustedSiteIds);
  return parsed.map((item: unknown) => {
    if (!isRecord(item) || typeof item.username !== "string" ||
      !USERNAME.test(item.username) || item.username === "analytics" ||
      typeof item.password !== "string" || !PASSWORD.test(item.password) ||
      (item.role !== "platform_admin" && item.role !== "brand_analyst")) {
      throw new Error("Invalid OPS_OPERATORS_JSON operator identity, role or password");
    }
    const username = item.username as string;
    const password = item.password as string;
    const role = item.role as OpsRole;
    if (usernames.has(username)) throw new Error("Duplicate OPS_OPERATORS_JSON username");
    usernames.add(username);
    const sites = item.siteIds;
    if (role === "platform_admin") {
      if (sites !== undefined && (!Array.isArray(sites) || sites.length !== 0)) {
        throw new Error("Platform admin must not declare brand restrictions");
      }
      return { username, password, role, siteIds:[] };
    }
    if (!Array.isArray(sites) || sites.length === 0 || sites.length > trusted.size ||
      sites.some((value) => typeof value !== "string" || !SITE_ID.test(value) || !trusted.has(value)) ||
      new Set(sites).size !== sites.length) {
      throw new Error("Brand analyst must have unique, configured site IDs");
    }
    return { username, password, role, siteIds:[...(sites as string[])] };
  });
}

function credentials(header: string | null): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ") || header.length > 1024) return null;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(":");
    if (colon < 1) return null;
    return { username:decoded.slice(0, colon), password:decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

function equalConstantTime(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function authorizeOpsRequest(input: {
  authorization: string | null;
  pathname: string;
  method: string;
  operatorsJson: string | undefined;
  legacySecret: string | undefined;
  trustedSiteIds: readonly string[];
}): OpsAuthorization {
  const operators = parseOpsOperators(input.operatorsJson, input.trustedSiteIds);
  const creds = credentials(input.authorization);
  if (operators) {
    if (!creds) return "unauthenticated";
    const operator = operators.find((entry) => entry.username === creds.username);
    if (!operator || !equalConstantTime(creds.password, operator.password)) return "unauthenticated";
    if (operator.role === "platform_admin") return "allowed";
    // A brand-scoped analyst cannot access any platform-wide dashboard,
    // listing, plugin, editor, translation, reminders or API endpoint.
    if (input.method !== "GET" && input.method !== "HEAD") return "forbidden";
    const match = BRAND_READ_ROUTE.exec(input.pathname);
    return match && operator.siteIds.includes(match[1] ?? "") ? "allowed" : "forbidden";
  }

  // Existing single-administrator deployments keep their old credentials.
  // There is no fallback to this password when operatorsJson is configured.
  if (!input.legacySecret?.trim()) return "disabled";
  if (!creds || creds.username !== "analytics" ||
    !equalConstantTime(creds.password, input.legacySecret.trim())) return "unauthenticated";
  return "allowed";
}
