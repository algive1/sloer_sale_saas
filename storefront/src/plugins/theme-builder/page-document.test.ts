import { describe, expect, it } from "vitest";
import { FASHION_TEMPLATE } from "./template";
import {
  PRODUCT_DETAIL_TEMPLATE, isEditableThemePageType,
  validatePageTemplateKey, validatePageThemeDocument,
} from "./page-document";

describe("page builder content boundary", () => {
  it("supports product page marketing sections without an editable purchase block", () => {
    expect(isEditableThemePageType("product")).toBe(true);
    expect(isEditableThemePageType("landing")).toBe(false);
    expect(validatePageTemplateKey("default")).toBe("default");
    expect(validatePageThemeDocument("product",PRODUCT_DETAIL_TEMPLATE)).toEqual(PRODUCT_DETAIL_TEMPLATE);
  });
  it("rejects a homepage hero in a product document, unknown page keys and unsafe links", () => {
    expect(()=>validatePageThemeDocument("product",FASHION_TEMPLATE)).toThrow();
    expect(()=>validatePageThemeDocument("landing",PRODUCT_DETAIL_TEMPLATE)).toThrow();
    expect(()=>validatePageTemplateKey("../other-brand")).toThrow();
    const changed=structuredClone(PRODUCT_DETAIL_TEMPLATE);
    changed.content[1].props.collectionSlug="other/brand";
    expect(()=>validatePageThemeDocument("product",changed)).toThrow();
  });
  it("accepts empty marketing sections while leaving core product pages intact", () => {
    expect(validatePageThemeDocument("product",{root:{props:{}},content:[]}).content).toEqual([]);
  });
});
