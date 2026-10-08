import { describe, expect, it } from "vitest";
import { FASHION_TEMPLATE } from "./template";
import { parseTheme, serializeTheme, validateThemeData } from "./validate";

describe("theme builder document validation", () => {
  it("roundtrips the fashion template", () => {
    expect(parseTheme(serializeTheme(FASHION_TEMPLATE))).toEqual(FASHION_TEMPLATE);
  });
  it("rejects executable or off-site links", () => {
    const template = structuredClone(FASHION_TEMPLATE);
    template.content[0].props.ctaHref = "javascript:alert(1)";
    expect(() => validateThemeData(template)).toThrow();
    template.content[0].props.ctaHref = "//evil.example";
    expect(() => validateThemeData(template)).toThrow();
  });
  it("rejects scripts in image paths and unknown components", () => {
    const template = structuredClone(FASHION_TEMPLATE);
    template.content[0].props.imageUrl = "javascript:alert(1)";
    expect(() => validateThemeData(template)).toThrow();
    (template.content[0] as {type:string}).type = "RawHTML";
    expect(() => validateThemeData(template)).toThrow();
  });
  it("rejects duplicate ids and excessive product counts", () => {
    const template = structuredClone(FASHION_TEMPLATE);
    template.content[1].props.id = template.content[0].props.id;
    expect(() => validateThemeData(template)).toThrow();
    template.content[1].props.id = "unique";
    template.content[1].props.limit = 9999;
    expect(() => validateThemeData(template)).toThrow();
  });
  it("preserves the original theme on invalid JSON", () => {
    expect(parseTheme("{bad json")).toBeNull();
    expect(validateThemeData(FASHION_TEMPLATE).content).toHaveLength(4);
  });
});
