type RateLimitBucket = {
	count: number;
	resetAt: number;
};

type RateLimitOptions = {
	limit?: number;
	windowMs?: number;
};

const buckets = new Map<string, RateLimitBucket>();

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/** Hard cap so forged keys from spoofed IP headers cannot grow memory without bound. */
export const MAX_RATE_LIMIT_BUCKETS = 10_000;

/** Current number of tracked buckets; used by tests and abuse diagnostics. */
export function rateLimitBucketCount(): number {
	return buckets.size;
}

function pruneBuckets(now: number) {
	if (buckets.size < MAX_RATE_LIMIT_BUCKETS) return;
	for (const [key, bucket] of buckets) {
		if (now >= bucket.resetAt) buckets.delete(key);
	}
	if (buckets.size < MAX_RATE_LIMIT_BUCKETS) return;
	// Forged keys crowd out real clients; evict the soonest-expiring half.
	const ordered = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
	for (const [key] of ordered.slice(0, Math.floor(MAX_RATE_LIMIT_BUCKETS / 2))) {
		buckets.delete(key);
	}
}

/**
 * In-memory sliding-window limiter for auth API routes.
 * Best-effort on serverless (per instance); pair with Vercel WAF for production abuse.
 */
export function checkRateLimit(
	key: string,
	{ limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS }: RateLimitOptions = {},
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
	const now = Date.now();
	pruneBuckets(now);
	const bucket = buckets.get(key);

	if (!bucket || now >= bucket.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true };
	}

	if (bucket.count >= limit) {
		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
		};
	}

	bucket.count += 1;
	return { allowed: true };
}

/**
 * Resolve the client IP for rate limiting. Clients can prepend arbitrary
 * x-forwarded-for entries, so only the LAST entry — appended by our own reverse
 * proxy — is trustworthy. Set AUTH_RATE_LIMIT_CLIENT_IP_HEADER (e.g.
 * cf-connecting-ip) when a different edge terminates client connections.
 */
export function resolveClientIp(headers: { get(name: string): string | null }): string {
	const configured = process.env.AUTH_RATE_LIMIT_CLIENT_IP_HEADER?.trim().toLowerCase();
	if (configured && configured !== "x-forwarded-for") {
		const value = headers.get(configured)?.trim();
		if (value) return value;
	}

	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		const entries = forwarded.split(",");
		const last = entries[entries.length - 1]?.trim();
		if (last) return last;
	}

	return headers.get("x-real-ip") ?? "unknown";
}

export function getClientIp(request: Request): string {
	return resolveClientIp(request.headers);
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
	return Response.json(
		{
			errors: [
				{
					message: "Too many attempts. Please try again later.",
					code: "RATE_LIMITED",
				},
			],
		},
		{
			status: 429,
			headers: { "Retry-After": String(retryAfterSeconds) },
		},
	);
}

/** Returns a 429 response when the client exceeds the auth route limit. */
export function rejectIfRateLimited(
	request: Request,
	action: "login" | "register" | "set-password" | "reset-password" | "confirm-account",
	options?: RateLimitOptions,
): Response | null {
	const key = `${action}:${getClientIp(request)}`;
	const result = checkRateLimit(key, options);

	if (!result.allowed) {
		return rateLimitResponse(result.retryAfterSeconds);
	}

	return null;
}
