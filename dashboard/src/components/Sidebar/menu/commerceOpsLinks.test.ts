import { createOpsHref } from "./commerceOpsLinks";

describe("Commerce Ops navigation URL", () => {
  it("builds links for a configured HTTPS origin", () => {
    expect(createOpsHref("https://shop.example.com", "/ops/themes?pageType=product")).toBe(
      "https://shop.example.com/ops/themes?pageType=product",
    );
  });

  it("allows local HTTP development", () => {
    expect(createOpsHref("http://localhost:3000", "/ops/sites")).toBe("http://localhost:3000/ops/sites");
  });

  it.each([
    "",
    "javascript:alert(1)",
    "http://example.com/",
    "https://user:pass@example.com/",
    "https://example.com/other/",
    "https://example.com/?next=evil",
  ])("rejects unsafe or invalid origin %s", origin => {
    expect(createOpsHref(origin, "/ops/plugins")).toBeNull();
  });
});
