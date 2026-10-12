import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { nativeBulkCatalogUrl, nativeChannelListUrl, nativeProductUrl } from "./native-catalog-links";
afterEach(() => vi.unstubAllEnvs());

it("preserves the configured Dashboard subdirectory and uses the native channel ID", () => {
	vi.stubEnv("SALEOR_DASHBOARD_URL", "https://admin.example.test/dashboard/");
	expect(nativeBulkCatalogUrl("Q2hhbm5lbDox=")).toBe(
		"https://admin.example.test/dashboard/channels/Q2hhbm5lbDox%3D?action=bulk-publish",
	);
	expect(nativeProductUrl("UHJvZHVjdDox=")).toBe(
		"https://admin.example.test/dashboard/products/UHJvZHVjdDox%3D",
	);
	expect(nativeChannelListUrl()).toBe("https://admin.example.test/dashboard/channels/");
});

it.each([
	"",
	"javascript:alert(1)",
	"https://u:secret@admin.example.test/",
	"https://admin.example.test/?target=other",
	"https://admin.example.test/#route",
	"not a URL",
])("disables native links for unsafe or ambiguous configuration: %s", (url) => {
	vi.stubEnv("SALEOR_DASHBOARD_URL", url);
	expect(nativeBulkCatalogUrl("id")).toBeNull();
	expect(nativeProductUrl("id")).toBeNull();
	expect(nativeChannelListUrl()).toBeNull();
});
