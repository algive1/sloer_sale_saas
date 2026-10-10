import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_DETAIL_TEMPLATE } from "./page-document";
const mocks=vi.hoisted(()=>({pipeline:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/storage/libsql-http",()=>({
  libsqlPipeline:mocks.pipeline,
  hranaRowsToObjects:()=>[],
}));

import { readPageTheme, savePageTheme } from "./pages-store";
import { ThemeConflictError } from "./store";

describe("product page templates: optimistic CAS and brand isolation",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    process.env.THEME_LIBSQL_URL="libsql://page-unit.test";
    process.env.THEME_LIBSQL_AUTH_TOKEN="page-test-token";
    process.env.STOREFRONT_SITE_ID="single-brand";
    delete process.env.STOREFRONT_SITES_JSON;
    mocks.pipeline.mockResolvedValue([{cols:[],rows:[],affected_row_count:1}]);
  });
  it("stores a draft in a separate page table, never publishing the first draft",async()=>{
    expect(await savePageTheme("us","en","product","default",PRODUCT_DETAIL_TEMPLATE,false,0)).toBe(1);
    const [queries]=mocks.pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    expect(queries[0].sql).toContain("INSERT OR IGNORE INTO storefront_theme_pages");
    expect(queries[0].args.slice(0,5)).toEqual(["single-brand","us","en","product","default"]);
    expect(queries[0].args[6]).toBeNull();
    expect(await readPageTheme("us","en","product")).toMatchObject({
      published:null,draft:null,draftRevision:0,
    });
  });
  it("guards the revision on publish and never updates homepages",async()=>{
    expect(await savePageTheme("us","en","product","default",PRODUCT_DETAIL_TEMPLATE,true,2)).toBe(3);
    const [queries]=mocks.pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    expect(queries[0].sql).toContain("published_json=?");
    expect(queries[0].sql).toContain("draft_revision=?");
    expect(queries[0].sql).not.toContain("storefront_theme_homepages");
    expect(queries[0].args.slice(-6)).toEqual(["single-brand","us","en","product","default",2]);
  });
  it("uses independent brand/channel keys",async()=>{
    process.env.STOREFRONT_SITES_JSON=JSON.stringify([
      {id:"fashion",name:"Fashion",domains:["fashion.test"],channels:["fashion-us"],defaultChannel:"fashion-us"},
      {id:"jewelry",name:"Jewelry",domains:["jewelry.test"],channels:["jewelry-us"],defaultChannel:"jewelry-us"},
    ]);
    await savePageTheme("fashion-us","en","product","default",PRODUCT_DETAIL_TEMPLATE,false,0);
    let [queries]=mocks.pipeline.mock.lastCall as [Array<{args:unknown[]}>];
    expect(queries[0].args[0]).toBe("fashion");
    await savePageTheme("jewelry-us","en","product","default",PRODUCT_DETAIL_TEMPLATE,false,0);
    [queries]=mocks.pipeline.mock.lastCall as [Array<{args:unknown[]}>];
    expect(queries[0].args[0]).toBe("jewelry");
  });
  it("rejects stale and arbitrary template updates",async()=>{
    mocks.pipeline.mockResolvedValue([{cols:[],rows:[],affected_row_count:0}]);
    await expect(savePageTheme("us","en","product","default",PRODUCT_DETAIL_TEMPLATE,true,4))
      .rejects.toBeInstanceOf(ThemeConflictError);
    await expect(savePageTheme("us","en","product","../private",PRODUCT_DETAIL_TEMPLATE,false,0)).rejects.toThrow();
  });
});
