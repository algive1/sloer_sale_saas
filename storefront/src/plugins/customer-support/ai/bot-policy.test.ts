import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractSelectedFaq, faqCandidates, incomingBotMessage, requiresHuman, verifyChatwootSignature } from "./bot-policy";
import type { PublishedFaq } from "./bot-config";

const f: PublishedFaq[] = [
  { siteId:"fashion",id:"delivery",locale:"en",question:"Shipping time",keywords:["shipping","delivery"],answer:"Ships within 3 business days.",sourceUrl:"https://fashion.example.com/shipping" },
  { siteId:"jewelry",id:"delivery",locale:"en",question:"Shipping time",keywords:["shipping"],answer:"Ships in a week.",sourceUrl:"https://jewelry.example.com/shipping" },
];
describe("AI bot security and scope", () => {
  it("verifies signed raw body, timestamp and HMAC in constant time", () => {
    const now = 1791582000000;
    const timestamp = String(now / 1000);
    const raw = '{"event":"message_created"}';
    const sig = "sha256=" + createHmac("sha256","secret").update(timestamp + "." + raw).digest("hex");
    expect(verifyChatwootSignature(raw,sig,timestamp,"secret",now)).toBe(true);
    expect(verifyChatwootSignature(raw + " ",sig,timestamp,"secret",now)).toBe(false);
    expect(verifyChatwootSignature(raw,sig,timestamp,"wrong",now)).toBe(false);
    expect(verifyChatwootSignature(raw,sig,String(now / 1000 - 301),"secret",now)).toBe(false);
    expect(verifyChatwootSignature(raw,"sha256=bad",timestamp,"secret",now)).toBe(false);
  });
  it("accepts only inbound public text with stable message and display IDs", () => {
    const payload = {event:"message_created",id:25,message_type:"incoming",content_type:"text",content:"Shipping?",
      account:{id:1},inbox:{id:3},conversation:{display_id:7,inbox_id:3}};
    expect(incomingBotMessage(payload)).toEqual({messageId:"25",accountId:1,inboxId:3,conversationId:7,question:"Shipping?"});
    expect(incomingBotMessage({...payload,message_type:"outgoing"})).toBeNull();
    expect(incomingBotMessage({...payload,private:true})).toBeNull();
    expect(incomingBotMessage({...payload,conversation:{display_id:0}})).toBeNull();
  });
  it("only returns knowledge belonging to one brand and selects a whitelisted ID", () => {
    const candidates = faqCandidates(f,"fashion","How much for shipping?");
    expect(candidates.map(x=>x.siteId)).toEqual(["fashion"]);
    expect(extractSelectedFaq('{"id":"delivery"}',candidates)?.answer).toBe("Ships within 3 business days.");
    expect(extractSelectedFaq('{"id":"jewelry"}',candidates)).toBeNull();
    expect(extractSelectedFaq("not json",candidates)).toBeNull();
    expect(faqCandidates(f,"fashion","Hello")).toHaveLength(0);
  });
  it("keeps account questions, payments and personal identifiers away from the model", () => {
    expect(requiresHuman("Where is my order #100?")).toBe(true);
    expect(requiresHuman("refund please")).toBe(true);
    expect(requiresHuman("订单物流查询")).toBe(true);
    expect(requiresHuman("my email is me@example.com")).toBe(true);
    expect(requiresHuman("shipping?")).toBe(false);
  });
});
