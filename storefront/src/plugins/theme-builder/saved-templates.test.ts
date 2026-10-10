import { beforeEach, describe, expect, it, vi } from "vitest";
import { FASHION_TEMPLATE, JEWELRY_TEMPLATE, MINIMAL_TEMPLATE, freshStarterTemplate } from "./template";
import { PRODUCT_DETAIL_TEMPLATE } from "./page-document";
const mocks=vi.hoisted(()=>({pipeline:vi.fn(),rows:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/storage/libsql-http",()=>({
  libsqlPipeline:mocks.pipeline,hranaRowsToObjects:mocks.rows,
}));
import {
  listSavedTemplates,getSavedTemplate,saveNamedTemplate,deleteSavedTemplate,validateTemplateDocument,
} from "./saved-templates";

beforeEach(()=>{
  vi.clearAllMocks();
  process.env.THEME_LIBSQL_URL="libsql://theme-templates.test";
  process.env.THEME_LIBSQL_AUTH_TOKEN="test-templates-token";
  process.env.STOREFRONT_SITE_ID="fashion-shop";
  delete process.env.STOREFRONT_SITES_JSON;
  mocks.pipeline.mockResolvedValue([{cols:[],rows:[],affected_row_count:1}]);
  mocks.rows.mockReturnValue([]);
});

describe("curated theme templates and safe reusable library",()=>{
  it("roundtrips jewelry and minimal presets and FAQ without altering their source",()=>{
    expect(validateTemplateDocument("home",JEWELRY_TEMPLATE)).toEqual(JEWELRY_TEMPLATE);
    expect(validateTemplateDocument("home",MINIMAL_TEMPLATE)).toEqual(MINIMAL_TEMPLATE);
    const duplicated=freshStarterTemplate("jewelry");
    duplicated.content[0].props.heading="Revised";
    expect(JEWELRY_TEMPLATE.content[0].props.heading).not.toBe("Revised");
    expect(()=>validateTemplateDocument("product",FASHION_TEMPLATE)).toThrow();
    const product=structuredClone(PRODUCT_DETAIL_TEMPLATE);
    product.content.push({type:"Faq",props:{id:"pdp-faq",heading:"Help",question1:"Sizing?",answer1:"See the size guide."}});
    expect(validateTemplateDocument("product",product)).toEqual(product);
  });
  it("inserts a safely validated template under its precise brand/channel/locale/page type",async()=>{
    const created=await saveNamedTemplate("us","en","home"," Autumn collection ",JEWELRY_TEMPLATE);
    expect(created.title).toBe("Autumn collection");
    const [queries]=mocks.pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    expect(queries[0].sql).toContain("INSERT OR IGNORE INTO storefront_theme_saved_templates");
    expect(queries[0].args.slice(0,4)).toEqual(["fashion-shop","us","en","home"]);
    expect(queries[0].args.slice(-5,-1)).toEqual(["fashion-shop","us","en","home"]);
    expect(queries[0].args.slice(-1)).toEqual([40]);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("separates brands and prevents homepage Hero blocks in PDP templates",async()=>{
    process.env.STOREFRONT_SITES_JSON=JSON.stringify([
      {id:"fashion",name:"Fashion",domains:["fashion.test"],channels:["fashion-us"],defaultChannel:"fashion-us"},
      {id:"jewelry",name:"Jewelry",domains:["jewelry.test"],channels:["jewelry-us"],defaultChannel:"jewelry-us"},
    ]);
    await saveNamedTemplate("jewelry-us","ja","product","Product FAQ",PRODUCT_DETAIL_TEMPLATE);
    const [statements]=mocks.pipeline.mock.lastCall as [Array<{args:unknown[]}>];
    expect(statements[0].args.slice(0,4)).toEqual(["jewelry","jewelry-us","ja","product"]);
    await expect(saveNamedTemplate("fashion-us","en","product","Malicious",FASHION_TEMPLATE)).rejects.toThrow();
    await expect(saveNamedTemplate("fashion-us","en","home","A",JEWELRY_TEMPLATE)).rejects.toThrow();
  });
  it("supports scoped list, read and deletion, rejecting invalid IDs",async()=>{
    expect(await listSavedTemplates("us","en","home")).toEqual([]);
    await expect(getSavedTemplate("us","en","home","not-a-uuid")).rejects.toThrow();
    await expect(deleteSavedTemplate("us","en","home","not-a-uuid")).rejects.toThrow();
  });
  it("enforces maximum library size without overwriting templates",async()=>{
    mocks.pipeline.mockResolvedValue([{cols:[],rows:[],affected_row_count:0}]);
    await expect(saveNamedTemplate("us","en","home","Too many",MINIMAL_TEMPLATE)).rejects.toThrow("library is full");
  });
});
