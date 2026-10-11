import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import sharp from "sharp";

const mocks=vi.hoisted(()=>({active:vi.fn(),channels:vi.fn()}));
vi.mock("@/plugins/theme-builder/ai-providers.server",()=>({
  activeAiProvider:mocks.active,aiConfigurationReady:()=>true,
}));
vi.mock("@/lib/channel-slugs",()=>({getStorefrontChannelSlugs:mocks.channels}));
vi.mock("@/config/channels",()=>({isAllowedStorefrontChannel:(channel:string,channels:string[])=>channels.includes(channel)}));
vi.mock("@/config/locale",()=>({isStorefrontLocaleSlug:(locale:string)=>["en","ja"].includes(locale)}));
vi.mock("@/config/locale-channel",()=>({getConfiguredLocaleChannelPairs:()=>null}));
import {POST} from "./route";

function request(body:Record<string,unknown>={},origin="http://localhost"){
  return new NextRequest("http://localhost/ops/themes/ai/images/generate",{
    method:"POST",headers:{Origin:origin,"sec-fetch-site":"same-origin","Content-Type":"application/json"},
    body:JSON.stringify({channel:"us",locale:"en",prompt:"Editorial studio picture of fine jewelry",
      size:"1024x1024",style:"minimal",...body}),
  });
}
beforeEach(()=>{
  mocks.channels.mockResolvedValue(["us"]);
  mocks.active.mockResolvedValue({
    id:"provider-1",title:"Image AI",baseUrl:"https://api.openai.com/v1",
    model:"gpt-image-1",apiKey:"sk-never-on-client",
  });
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
describe("image-only API",()=>{
  it("blocks cross-origin, unsupported channels, sizes and request data",async()=>{
    const fetchSpy=vi.fn();vi.stubGlobal("fetch",fetchSpy);
    expect((await POST(request({},"https://evil.example"))).status).toBe(403);
    expect((await POST(request({channel:"invalid"}))).status).toBe(400);
    expect((await POST(request({size:"1920x900"}))).status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("uses the active image provider key only on server, validates and optimizes bytes",async()=>{
    const png=await sharp({create:{width:16,height:12,channels:3,background:"#ffffff"}}).png().toBuffer();
    const fetchSpy=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data:[{b64_json:png.toString("base64")}],
    }),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetchSpy);
    const response=await POST(request());
    expect(response.status,await response.text()).toBe(200);
    const payload=await response.clone().json() as {image:{base64:string;mime:string;provider:string}};
    expect(payload.image.mime).toBe("image/webp");
    expect(payload.image.provider).toBe("Image AI");
    expect(await sharp(Buffer.from(payload.image.base64,"base64")).metadata())
      .toMatchObject({format:"webp",width:16,height:12});
    expect(JSON.stringify(payload)).not.toContain("sk-never-on-client");
    const [url,init]=fetchSpy.mock.calls[0] as [string,RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk-never-on-client");
    expect(init.redirect).toBe("error");
    const body=JSON.parse(String(init.body)) as {n:number;model:string;size:string};
    expect(body.n).toBe(1);
    expect(body.model).toBe("gpt-image-1");
    expect(body.size).toBe("1024x1024");
  });
});
