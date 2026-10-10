import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks=vi.hoisted(()=>({channels:vi.fn(),site:vi.fn()}));
vi.mock("@/lib/channel-slugs",()=>({getStorefrontChannelSlugs:mocks.channels}));
vi.mock("@/plugins/theme-builder/store",()=>({activeThemeSiteId:mocks.site}));

import { GET } from "./route";

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.channels.mockResolvedValue(["fashion-us","jewelry-us"]);
  mocks.site.mockImplementation((channel:string)=>{
    if(channel==="fashion-us")return "fashion";
    if(channel==="jewelry-us")return "jewelry";
    throw new Error("Unknown channel");
  });
  vi.stubEnv("SALEOR_INTERNAL_API_URL","http://saleor.test/graphql/");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe("theme catalog picker",()=>{
  it("rejects invalid channel and type without Saleor I/O",async()=>{
    const fetchSpy=vi.fn();
    vi.stubGlobal("fetch",fetchSpy);
    const wrong=await GET(new NextRequest("http://localhost/ops/themes/catalog?kind=products&channel=elsewhere"));
    expect(wrong.status).toBe(400);
    const type=await GET(new NextRequest("http://localhost/ops/themes/catalog?kind=secret&channel=fashion-us"));
    expect(type.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("queries only the chosen Saleor channel and returns a compact listing",async()=>{
    const fetchSpy=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data:{products:{edges:[{node:{slug:"gold-ring",name:"Gold Ring",thumbnail:{url:"https://cdn.example/ring.webp"},
        pricing:{priceRange:{start:{gross:{amount:29,currency:"USD"}}}}}}]}}}),
      {status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetchSpy);
    const response=await GET(new NextRequest("http://localhost/ops/themes/catalog?kind=products&channel=fashion-us&q=ring"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const payload=await response.json() as {items:{slug:string;price:{amount:number}}[]};
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.slug).toBe("gold-ring");
    expect(payload.items[0]?.price.amount).toBe(29);
    const outgoing=fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(String(outgoing.body)).toContain('"channel":"fashion-us"');
    expect(String(outgoing.body)).not.toContain("SALEOR_APP_TOKEN");
  });
  it("rejects bad selected slugs before requesting catalog data",async()=>{
    const fetchSpy=vi.fn();
    vi.stubGlobal("fetch",fetchSpy);
    const response=await GET(new NextRequest("http://localhost/ops/themes/catalog?kind=product&channel=fashion-us&slug=..%2Fprivate"));
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
