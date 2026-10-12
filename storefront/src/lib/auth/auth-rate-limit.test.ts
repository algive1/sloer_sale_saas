import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkRateLimit,
	getClientIp,
	MAX_RATE_LIMIT_BUCKETS,
	rateLimitBucketCount,
	resolveClientIp,
} from "./auth-rate-limit";

describe("checkRateLimit", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows requests under the limit", () => {
		const key = `test:${Date.now()}`;

		expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }).allowed).toBe(true);
		expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 }).allowed).toBe(true);
	});

	it("blocks requests over the limit until the window resets", () => {
		const key = "test:block";

		checkRateLimit(key, { limit: 1, windowMs: 60_000 });
		const blocked = checkRateLimit(key, { limit: 1, windowMs: 60_000 });

		expect(blocked.allowed).toBe(false);
		if (!blocked.allowed) {
			expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
		}

		vi.advanceTimersByTime(60_000);

		expect(checkRateLimit(key, { limit: 1, windowMs: 60_000 }).allowed).toBe(true);
	});

	it("bounds the bucket map under a forged-key flood", () => {
		for (let i = 0; i < MAX_RATE_LIMIT_BUCKETS + 100; i++) {
			checkRateLimit(`flood:${i}`, { limit: 1, windowMs: 60_000 });
		}

		expect(rateLimitBucketCount()).toBeLessThanOrEqual(MAX_RATE_LIMIT_BUCKETS);
	});
});

describe("getClientIp", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("uses the last x-forwarded-for entry appended by our proxy", () => {
		const request = new Request("https://example.com", {
			headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
		});

		expect(getClientIp(request)).toBe("2.2.2.2");
	});

	it("prefers the configured edge header over x-forwarded-for", () => {
		vi.stubEnv("AUTH_RATE_LIMIT_CLIENT_IP_HEADER", "cf-connecting-ip");
		const request = new Request("https://example.com", {
			headers: { "cf-connecting-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
		});

		expect(getClientIp(request)).toBe("3.3.3.3");
	});

	it("falls back to x-real-ip, then unknown", () => {
		expect(
			getClientIp(new Request("https://example.com", { headers: { "x-real-ip": "4.4.4.4" } })),
		).toBe("4.4.4.4");
		expect(getClientIp(new Request("https://example.com"))).toBe("unknown");
	});

	it("reads the same headers shape as next/headers server actions", () => {
		const values: Record<string, string> = { "x-forwarded-for": "6.6.6.6, 7.7.7.7" };
		const list = { get: (name: string) => values[name.toLowerCase()] ?? null };

		expect(resolveClientIp(list)).toBe("7.7.7.7");
	});
});
