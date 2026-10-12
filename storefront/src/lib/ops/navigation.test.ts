import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildDashboardHref, opsNavigationForRole } from "./navigation";

function staticOpsRoutes(): string[] {
  const root = fileURLToPath(new URL("../../app/ops", import.meta.url));
  const walk = (dir: string, prefix: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) return walk(`${dir}/${entry.name}`, `${prefix}/${entry.name}`);
      return entry.name === "page.tsx" ? [prefix] : [];
    });
  return walk(root, "/ops").filter(route => !route.includes("["));
}

describe("Commerce Ops operator sidebar", () => {
  it("shows only authorized brand landing pages to brand analysts", () => {
    const analyst = opsNavigationForRole("brand_analyst");
    const links = analyst.flatMap(group => group.children.map(item => item.href));

    expect(links).toEqual(["/ops/sites"]);
    expect(links).not.toContain("/ops/analytics");
    expect(links).not.toContain("/ops/themes");
    expect(links).not.toContain("/ops/plugins");
  });

  it("exposes all real built-in Ops destinations for platform admins", () => {
    const groups = opsNavigationForRole("platform_admin");
    const items = groups.flatMap(group => group.children);
    const uniqueIds = new Set(items.map(item => item.id));

    expect(uniqueIds.size).toBe(items.length);
    expect(items.map(item => item.href)).toContain("/ops/themes?pageType=product");
    expect(items.every(item => item.href.startsWith("/ops/"))).toBe(true);
  });

  it("links every static Ops page so a real route can never lose its entry", () => {
    const hrefs = new Set(opsNavigationForRole("platform_admin")
      .flatMap(group => group.children.map(item => item.href.split("?")[0])));

    expect(staticOpsRoutes().filter(route => !hrefs.has(route))).toEqual([]);
  });

  it("only accepts a safe configured Dashboard origin or mount", () => {
    expect(buildDashboardHref("https://admin.example.com/")).toBe("https://admin.example.com/");
    expect(buildDashboardHref("https://admin.example.com/dashboard")).toBe("https://admin.example.com/dashboard/");
    expect(buildDashboardHref("https://admin.example.com/dashboard/")).toBe(
      "https://admin.example.com/dashboard/",
    );
    expect(buildDashboardHref("http://localhost:9000/")).toBe("http://localhost:9000/");
    expect(buildDashboardHref("http://example.com")).toBeNull();
    expect(buildDashboardHref("javascript:alert(1)")).toBeNull();
    expect(buildDashboardHref("https://admin.example.com/redirect?next=evil")).toBeNull();
    expect(buildDashboardHref("https://user:pass@admin.example.com/")).toBeNull();
  });
});
