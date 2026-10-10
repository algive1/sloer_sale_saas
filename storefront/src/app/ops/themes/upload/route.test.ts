import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({channels:vi.fn(),site:vi.fn()}));
vi.mock("@/lib/channel-slugs",()=>({getStorefrontChannelSlugs:mocks.channels}));
vi.mock("@/plugins/theme-builder/store",()=>({activeThemeSiteId:mocks.site}));
import { POST } from "./route";

function request(file:File,origin="http://localhost") {
  const form=new FormData();form.append("file",file);
  return new NextRequest("http://localhost/ops/themes/upload?channel=fashion-us",{
    method:"POST",body:form,headers:{origin,"sec-fetch-site":"same-origin"},
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.channels.mockResolvedValue(["fashion-us"]);
  mocks.site.mockReturnValue("fashion");
  vi.stubEnv("SALEOR_INTERNAL_API_URL","http://saleor.test/graphql/");
  vi.stubEnv("SALEOR_APP_TOKEN","test-server-only-token");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("theme image uploads",()=>{
  it("rejects cross-origin POST before Saleor I/O",async()=>{
    const remote=vi.fn();vi.stubGlobal("fetch",remote);
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],"photo.png",{type:"image/png"});
    const response=await POST(request(file,"https://evil.test"));
    expect(response.status).toBe(403);
    expect(remote).not.toHaveBeenCalled();
  });
  it("rejects executable masquerading as an image",async()=>{
    const remote=vi.fn();vi.stubGlobal("fetch",remote);
    const file=new File(["<script>alert(1)</script>"],"photo.png",{type:"image/png"});
    const response=await POST(request(file));
    expect(response.status).toBe(415);
    expect(remote).not.toHaveBeenCalled();
  });
  it("rejects a Saleor upload error without returning an image URL",async()=>{
    const upstream=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data:{fileUpload:{uploadedFile:null,uploadErrors:[{message:"Invalid file"}]}},
    }),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",upstream);
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],"photo.png",{type:"image/png"});
    const response=await POST(request(file));
    expect(response.status).toBe(502);
    expect((await response.json() as {url?:string}).url).toBeUndefined();
  });
  it("uses only a server-side app token and returns the upstream HTTPS media URL",async()=>{
    const remote=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data:{fileUpload:{uploadedFile:{url:"https://media.example/img.png"},uploadErrors:[]}},
    }),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",remote);
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])],"photo.png",{type:"image/png"});
    const response=await POST(request(file));
    expect(response.status).toBe(200);
    expect((await response.json() as {url:string}).url).toBe("https://media.example/img.png");
    const init=remote.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-server-only-token");
    const body=init.body as FormData;
    const operations=JSON.parse(String(body.get("operations"))) as {query:string};
    expect(operations.query).toContain("uploadErrors");
    expect(operations.query).not.toContain("errors{message}");

  });
});
