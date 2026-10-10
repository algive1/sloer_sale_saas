import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {FASHION_TEMPLATE} from "@/plugins/theme-builder/template";

const mocks=vi.hoisted(()=>({active:vi.fn(),channels:vi.fn()}));
vi.mock("@/plugins/theme-builder/ai-providers.server",()=>({
  activeAiProvider:mocks.active,aiConfigurationReady:()=>true,
}));
vi.mock("@/lib/channel-slugs",()=>({getStorefrontChannelSlugs:mocks.channels}));
vi.mock("@/config/channels",()=>({isAllowedStorefrontChannel:(channel:string,channels:string[])=>
  channels.includes(channel)}));
vi.mock("@/config/locale",()=>({isStorefrontLocaleSlug:(locale:string)=>["en","ja"].includes(locale)}));
vi.mock("@/config/locale-channel",()=>({getConfiguredLocaleChannelPairs:()=>null}));
import {POST} from "./route";

function req(overrides:Record<string,unknown>={},origin="http://localhost"){
  const body={
    channel:"us",locale:"en",pageType:"home",mode:"block",
    prompt:"Please make this heading concise",
    selectedId:"fashion-hero",document:FASHION_TEMPLATE,history:[],
    ...overrides,
  };
  return new NextRequest("http://localhost/ops/themes/ai/generate",{
    method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"sec-fetch-site":"same-origin"},
    body:JSON.stringify(body),
  });
}
beforeEach(()=>{
  mocks.channels.mockResolvedValue(["us"]);
  mocks.active.mockResolvedValue({
    id:"id-one",title:"Test AI",model:"test-json-model",
    baseUrl:"https://api.openai.com/v1",apiKey:"sk-only-on-server",
  });
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
describe("protected AI generation",()=>{
  it("rejects cross-origin requests and invalid brand/locale without using a model",async()=>{
    const upstream=vi.fn();vi.stubGlobal("fetch",upstream);
    expect((await POST(req({},"https://evil.example"))).status).toBe(403);
    expect((await POST(req({channel:"unknown"}))).status).toBe(400);
    expect((await POST(req({locale:"invalid"}))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("uses a server-held key and validates targeted block output",async()=>{
    const changed=structuredClone(FASHION_TEMPLATE.content[0]);
    changed.props.heading="A cleaner headline";
    const upstream=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify({
        message:"标题已调整",block:changed,
      })}}],
    }),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",upstream);
    const response=await POST(req());
    expect(response.status).toBe(200);
    const body=await response.json() as {data:typeof FASHION_TEMPLATE;message:string};
    expect(body.data.content[0].props.heading).toBe("A cleaner headline");
    expect(body.data.content.slice(1)).toEqual(FASHION_TEMPLATE.content.slice(1));
    expect(JSON.stringify(body)).not.toContain("sk-only-on-server");
    const [url,init]=upstream.mock.calls[0] as [string,RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk-only-on-server");
    expect(init.redirect).toBe("error");
    const sent=JSON.parse(String(init.body)) as {model:string;response_format:{type:string}};
    expect(sent.model).toBe("test-json-model");
    expect(sent.response_format.type).toBe("json_object");
  });
});
