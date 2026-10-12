import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next/cache", () => ({
	cacheLife: vi.fn(),
	cacheTag: vi.fn(),
	revalidateTag: vi.fn(),
	revalidatePath: vi.fn(),
}));
vi.mock("@/lib/channel-slugs", () => ({
	getStorefrontChannelSlugs: vi.fn(async () => ["us", "jewelry-us"]),
}));
vi.mock("@/lib/api-auth", () => ({
	verifyWebhookSignature: vi.fn(),
	verifySecret: vi.fn(() => false),
	extractBearerToken: vi.fn(() => null),
}));
import { revalidateTag } from "next/cache";
import { verifyWebhookSignature } from "@/lib/api-auth";
import { POST } from "./route";
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(verifyWebhookSignature).mockReturnValue(true);
});
const request = (payload: unknown, event = "product_updated") =>
	new NextRequest("http://localhost/api/revalidate", {
		method: "POST",
		headers: { "saleor-event": event, "content-type": "application/json" },
		body: JSON.stringify(payload),
	});

it("rejects unauthenticated deliveries before invalidating any cache", async () => {
	vi.mocked(verifyWebhookSignature).mockReturnValue(false);
	expect((await POST(request({ product: { slug: "hat" } }))).status).toBe(401);
	expect(revalidateTag).not.toHaveBeenCalled();
});
it("refreshes both configured listings and expires manifest/cursor caches for a global product event", async () => {
	const res = await POST(request({ product: { slug: "hat" } }));
	expect(await res.json()).toMatchObject({ success: true });
	expect(revalidateTag).toHaveBeenCalledWith("listing:all:jewelry-us", "catalog");
	expect(revalidateTag).toHaveBeenCalledWith("listing:all:us", "catalog");
	expect(revalidateTag).toHaveBeenCalledWith("sitemap:catalog:jewelry-us", { expire: 0 });
	expect(revalidateTag).toHaveBeenCalledWith("sitemap:catalog:us", { expire: 0 });
});
it("does not refresh a default market when an explicit other market is named", async () => {
	await POST(request({ product: { slug: "hat", channel: { slug: "jewelry-us" } } }));
	expect(revalidateTag).toHaveBeenCalledWith("listing:all:jewelry-us", "catalog");
	expect(
		vi
			.mocked(revalidateTag)
			.mock.calls.some(([tag]) => tag === "listing:all:us" || tag === "sitemap:catalog:us"),
	).toBe(false);
});
it("skips authentic events for unconfigured markets and unrelated order events", async () => {
	expect(await (await POST(request({ product: { channel: { slug: "foreign" } } }))).json()).toMatchObject({
		skipped: true,
	});
	expect(await (await POST(request({ order: { id: "private" } }, "order_created"))).json()).toMatchObject({
		skipped: true,
	});
	expect(revalidateTag).not.toHaveBeenCalled();
});
it("refreshes variant price listings without expiring sitemap cursors on that churn", async () => {
	await POST(request({ productVariant: { product: { slug: "hat" } } }, "product_variant_updated"));
	expect(revalidateTag).toHaveBeenCalledWith("listing:all:jewelry-us", "catalog");
	expect(vi.mocked(revalidateTag).mock.calls.some(([tag]) => tag.startsWith("sitemap:"))).toBe(false);
});
