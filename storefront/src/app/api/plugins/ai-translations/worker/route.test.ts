import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const runner=vi.hoisted(()=>vi.fn(async()=>({processed:1,failed:0})));
vi.mock("@/plugins/ai-translations/worker",()=>({runTranslationWorker:runner}));
vi.mock("@/plugins/ai-translations/store",()=>({translationDatabaseConfigured:()=>true}));
import { POST } from "./route";

const key="dedicated-translation-worker-secret-12345";
const request=(token:string)=>new Request("https://shop.example.com/api/plugins/ai-translations/worker",{
  method:"POST",headers:{authorization:"Bearer "+token},
});
beforeEach(()=>{runner.mockClear();vi.stubEnv("TRANSLATION_WORKER_SECRET",key);});
afterEach(()=>vi.unstubAllEnvs());

describe("translation worker authentication",()=>{
  it("rejects public invocations before touching jobs",async()=>{
    expect((await POST(request("incorrect"))).status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
  });
  it("does not expose an endpoint without a 32+ character secret",async()=>{
    vi.stubEnv("TRANSLATION_WORKER_SECRET","");
    expect((await POST(request(key))).status).toBe(404);
    expect(runner).not.toHaveBeenCalled();
  });
  it("processes exactly one job with matching bearer auth",async()=>{
    const res=await POST(request(key));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({processed:1,failed:0});
    expect(runner).toHaveBeenCalledOnce();
  });
});
