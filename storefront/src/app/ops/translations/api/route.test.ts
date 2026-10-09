import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const create=vi.hoisted(()=>vi.fn(async()=>({id:"created"})));
vi.mock("@/plugins/ai-translations/store",()=>({
  translationDatabaseConfigured:()=>true,
  createJob:create,listJobs:vi.fn(async()=>[]),getJob:vi.fn(async()=>null),
  publishReviewed:vi.fn(async()=>{}),reviewItem:vi.fn(async()=>({})),retryFailed:vi.fn(async()=>{}),
}));
import { POST } from "./route";

function req(data:Record<string,unknown>,origin?:string) {
  return new NextRequest("https://shop.example.com/ops/translations/api",{
    method:"POST",headers:{
      "content-type":"application/json",
      ...(origin?{origin}:{}),
    },body:JSON.stringify(data),
  });
}
const good={action:"create",siteId:"primary",channel:"us",locale:"de",count:10};
beforeEach(()=>{
  create.mockClear();
  vi.stubEnv("STOREFRONT_SITES_JSON","");
  vi.stubEnv("STOREFRONT_SITE_ID","primary");
  vi.stubEnv("STOREFRONT_CHANNELS","us");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES","en,de");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS","en:us,de:us");
});
afterEach(()=>vi.unstubAllEnvs());
describe("ops translation command scope",()=>{
  it("blocks CSRF requests without the same Origin",async()=>{
    expect((await POST(req(good))).status).toBe(403);
    expect((await POST(req(good,"https://evil.example"))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("blocks client-supplied foreign site/channel/English",async()=>{
    for(const invalid of [
      {...good,siteId:"foreign"},
      {...good,channel:"foreign"},
      {...good,locale:"en"},
      {...good,count:100},
    ]) {
      const res=await POST(req(invalid,"https://shop.example.com"));
      expect(res.status).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });
  it("creates only a server-authorized market batch",async()=>{
    const res=await POST(req(good,"https://shop.example.com"));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({siteId:"primary",channel:"us",locale:"de"},10);
  });
});
