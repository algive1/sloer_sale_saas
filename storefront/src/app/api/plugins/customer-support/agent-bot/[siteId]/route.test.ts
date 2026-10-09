import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processMessage = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => "answered"));
vi.mock("@/lib/storage/libsql-http", () => ({
  analyticsDatabaseConfigured: () => true,
}));
vi.mock("@/plugins/customer-support/ai/bot-config", () => ({
  loadAIConfig: () => ({
    chatwootUrl: "https://support.example.com",
    bots: [
      { siteId:"fashion",accountId:1,inboxId:11,webhookSecret:"signing-secret",apiToken:"bot-secret" },
      { siteId:"jewelry",accountId:2,inboxId:22,webhookSecret:"different-secret",apiToken:"different-bot-token" },
    ],
    faqs:[],provider:{ url:"https://api.example.com/v1/chat/completions",key:"fake",model:"example" },
  }),
}));
vi.mock("@/plugins/customer-support/ai/bot-runtime", () => ({
  processAIBotMessage: processMessage,
}));
import { POST } from "./route";

const baseEvent = {
  event:"message_created",id:123,message_type:"incoming",content_type:"text",content:"Shipping?",
  account:{id:1},inbox:{id:11},conversation:{display_id:77,inbox_id:11,status:"pending"},
};
function signedRequest(
  payload: Record<string,unknown>, pathSite: string, secret: string, overrides: Record<string,string> = {},
) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now()/1000));
  const signature = "sha256=" + createHmac("sha256",secret).update(ts+"."+body).digest("hex");
  const request = new Request("https://store.example.com/api/plugins/customer-support/agent-bot/"+pathSite,{
    method:"POST",body,headers:{"content-type":"application/json",
      "x-chatwoot-signature":signature,"x-chatwoot-timestamp":ts,...overrides},
  });
  return POST(request,{params:Promise.resolve({siteId:pathSite})});
}
beforeEach(() => processMessage.mockClear());
describe("signed Chatwoot Agent Bot ingress", () => {
  it("accepts an owned, signed incoming customer message", async () => {
    const result = await signedRequest(baseEvent,"fashion","signing-secret");
    expect(result.status).toBe(204);
    expect(processMessage).toHaveBeenCalledOnce();
    expect(processMessage.mock.calls[0]?.[2]).toMatchObject({
      accountId:1,inboxId:11,conversationId:77,messageId:"123",
    });
  });
  it("rejects invalid signature with no AI side effects", async () => {
    const result = await signedRequest(baseEvent,"fashion","incorrect-secret");
    expect(result.status).toBe(401);
    expect(processMessage).not.toHaveBeenCalled();
  });
  it("cannot redirect a signed event into another brand", async () => {
    const result = await signedRequest(baseEvent,"jewelry","different-secret");
    expect(result.status).toBe(403);
    expect(processMessage).not.toHaveBeenCalled();
  });
  it("ignores outgoing bot messages and private messages", async () => {
    for(const change of [{message_type:"outgoing"},{private:true}]) {
      const result = await signedRequest({...baseEvent,...change},"fashion","signing-secret");
      expect(result.status).toBe(204);
    }
    expect(processMessage).not.toHaveBeenCalled();
  });
  it("rejects oversized inputs even when the caller omits content-length", async () => {
    const result = await signedRequest({...baseEvent,content:"x".repeat(22000)},"fashion","signing-secret");
    expect(result.status).toBe(413);
    expect(processMessage).not.toHaveBeenCalled();
  });
  it("does not expose unknown brand paths", async () => {
    const result = await signedRequest(baseEvent,"unknown","signing-secret");
    expect(result.status).toBe(404);
    expect(processMessage).not.toHaveBeenCalled();
  });
});
