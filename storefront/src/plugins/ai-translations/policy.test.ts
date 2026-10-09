import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mayPublishInScope, normalizeSource, parseTranslation, sourceHash,
  validateScope, TranslationInputError,
} from "./policy";

afterEach(()=>vi.unstubAllEnvs());
function setup() {
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES","en,de,fr");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS","en:fashion-us,de:fashion-us,en:jewelry-us,fr:jewelry-us");
  vi.stubEnv("STOREFRONT_CHANNELS","fashion-us,jewelry-us");
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHANNEL","fashion-us");
  vi.stubEnv("STOREFRONT_SITES_JSON",JSON.stringify([
    {id:"fashion",name:"Fashion",domains:["fashion.example.test"],channels:["fashion-us"],defaultChannel:"fashion-us",defaultLocale:"en"},
    {id:"jewelry",name:"Jewelry",domains:["jewelry.example.test"],channels:["jewelry-us"],defaultChannel:"jewelry-us",defaultLocale:"en"},
  ]));
}
describe("multi-brand translation operations policy",()=>{
  it("only allows enabled locale×channel pairs owned by the selected brand",()=>{
    setup();
    expect(validateScope({siteId:"fashion",channel:"fashion-us",locale:"de"})).toEqual({
      siteId:"fashion",channel:"fashion-us",locale:"de",
    });
    expect(()=>validateScope({siteId:"jewelry",channel:"fashion-us",locale:"de"})).toThrow(TranslationInputError);
    expect(()=>validateScope({siteId:"fashion",channel:"jewelry-us",locale:"fr"})).toThrow();
    expect(()=>validateScope({siteId:"fashion",channel:"fashion-us",locale:"fr"})).toThrow();
    expect(()=>validateScope({siteId:"fashion",channel:"fashion-us",locale:"en"})).toThrow();
    expect(()=>validateScope({siteId:"fashion",channel:"foreign",locale:"de"})).toThrow();
  });
  it("normalizes EditorJS merchant text without sending schema to AI",()=>{
    const source=normalizeSource({name:"  Linen shirt  ",description:JSON.stringify({
      time:1,blocks:[{type:"paragraph",data:{text:"Comfortable <b>linen</b> &nbsp; shirt"}}]})});
    expect(source).toEqual({name:"Linen shirt",description:"Comfortable  linen   shirt"});
    expect(sourceHash("p1",source)).toBe(sourceHash("p1",source));
    expect(sourceHash("p2",source)).not.toBe(sourceHash("p1",source));
  });
  it("rejects injected output keys, HTML, changed placeholders and empty fields",()=>{
    const original={name:"Hello {firstName}",seoDescription:"Price %s"};
    expect(parseTranslation(original,{name:"Hallo {firstName}",seoDescription:"Preis %s"}))
      .toEqual({name:"Hallo {firstName}",seoDescription:"Preis %s"});
    expect(()=>parseTranslation(original,{name:"Hallo",seoDescription:"Preis %s"})).toThrow();
    expect(()=>parseTranslation(original,{name:"<img src=x>",seoDescription:"Preis %s"})).toThrow();
    expect(()=>parseTranslation(original,{name:"Hallo {firstName}",seoDescription:""})).toThrow();
    expect(()=>parseTranslation(original,{name:"Hallo {firstName}",seoDescription:"Preis %s",extra:"evil"})).toThrow();
  });
  it("fails closed on global Saleor translation writes in multi-brand mode",()=>{
    setup();
    vi.stubEnv("TRANSLATION_PUBLISH_ENABLED","1");
    expect(()=>mayPublishInScope({siteId:"fashion",channel:"fashion-us",locale:"de"})).toThrow(/多品牌/);
  });
  it("single brand requires explicit publishing opt-in",()=>{
    vi.stubEnv("STOREFRONT_SITES_JSON","");
    vi.stubEnv("STOREFRONT_SITE_ID","primary");
    vi.stubEnv("STOREFRONT_CHANNELS","us");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES","en,de");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS","en:us,de:us");
    expect(()=>mayPublishInScope({siteId:"primary",channel:"us",locale:"de"})).toThrow(/未开启/);
    vi.stubEnv("TRANSLATION_PUBLISH_ENABLED","1");
    expect(()=>mayPublishInScope({siteId:"primary",channel:"us",locale:"de"})).not.toThrow();
  });
});
