import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ processed:1,remaining:0 })));
vi.mock("@/lib/storage/libsql-http", () => ({
  analyticsDatabaseConfigured: () => true,
}));
vi.mock("@/plugins/customer-support/ai/bot-config", () => ({
  loadAIConfig: () => ({
    chatwootUrl:"https://support.example.com",
    bots:[{siteId:"fashion",accountId:1,inboxId:11,webhookSecret:"test",apiToken:"test"}],
    faqs:[],provider:{url:"https://api.example.com/v1/chat/completions",key:"fake",model:"example"},
  }),
}));
vi.mock("@/plugins/customer-support/ai/bot-runtime", () => ({
  runQueuedAIBot: worker,
}));
import { POST } from "./route";

function req(token: string) {
  return new Request("https://store.example.com/api/plugins/customer-support/agent-bot-worker",{
    method:"POST",headers:{"authorization":"Bearer "+token},
  });
}
beforeEach(() => {
  worker.mockClear();
  vi.stubEnv("SUPPORT_AI_WORKER_SECRET","a-secret-for-a-private-worker-123456");
});
afterEach(() => vi.unstubAllEnvs());
describe("dedicated AI worker authentication", () => {
  it("rejects incorrect credentials before any query or model work", async () => {
    expect((await POST(req("not-the-secret"))).status).toBe(401);
    expect(worker).not.toHaveBeenCalled();
  });
  it("rejects missing worker secret instead of becoming a public endpoint", async () => {
    vi.stubEnv("SUPPORT_AI_WORKER_SECRET","");
    expect((await POST(req(""))).status).toBe(404);
    expect(worker).not.toHaveBeenCalled();
  });
  it("processes at most one queued item for an authorized worker", async () => {
    const result=await POST(req("a-secret-for-a-private-worker-123456"));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({processed:1,remaining:0});
    expect(worker).toHaveBeenCalledOnce();
    expect(worker.mock.calls[0]?.[1]).toBe(1);
  });
});
