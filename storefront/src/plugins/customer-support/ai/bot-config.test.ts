import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAIConfig } from "./bot-config";

const brandSites = JSON.stringify([
  { id:"fashion",name:"Fashion",domains:["fashion.example.com"],channels:["fashion-us"],defaultChannel:"fashion-us" },
  { id:"jewelry",name:"Jewelry",domains:["jewelry.example.com"],channels:["jewelry-us"],defaultChannel:"jewelry-us" },
]);
const bindings = [
  {siteId:"fashion",accountId:1,inboxId:11,webhookSecret:"s".repeat(40),apiToken:"t".repeat(36)},
  {siteId:"jewelry",accountId:2,inboxId:22,webhookSecret:"k".repeat(40),apiToken:"z".repeat(36)},
];
const faqs = [
  {siteId:"fashion",id:"shipping",locale:"en",question:"How long does shipping take?",answer:"3 business days.",keywords:["shipping"],
    sourceUrl:"https://fashion.example.com/policies/shipping"},
  {siteId:"jewelry",id:"shipping",locale:"en",question:"How long does shipping take?",answer:"5 business days.",keywords:["shipping"],
    sourceUrl:"https://jewelry.example.com/policies/shipping"},
];
beforeEach(() => {
  vi.stubEnv("STOREFRONT_SITES_JSON",brandSites);
  vi.stubEnv("SUPPORT_CHATWOOT_BASE_URL","https://support.example.com");
  vi.stubEnv("SUPPORT_CHATWOOT_SITES_JSON",JSON.stringify([
    {siteId:"fashion",accountId:1,websiteToken:"fashion_public_token"},
    {siteId:"jewelry",accountId:2,websiteToken:"jewelry_public_token"},
  ]));
  vi.stubEnv("SUPPORT_AI_BOTS_JSON",JSON.stringify(bindings));
  vi.stubEnv("SUPPORT_AI_FAQS_JSON",JSON.stringify(faqs));
  vi.stubEnv("SUPPORT_AI_MODEL_URL","https://api.openai.com/v1/chat/completions");
  vi.stubEnv("SUPPORT_AI_MODEL_API_KEY","fake-but-long-api-key-not-real");
  vi.stubEnv("SUPPORT_AI_MODEL_NAME","example-model");
});
afterEach(() => vi.unstubAllEnvs());
describe("brand-scoped AI bot setup", () => {
  it("is disabled without an opt-in bot binding", () => {
    vi.stubEnv("SUPPORT_AI_BOTS_JSON","");
    expect(loadAIConfig()).toBeNull();
  });
  it("maps separate bot secrets and FAQ sources to separate brands", () => {
    const c = loadAIConfig();
    expect(c?.bots.map(b=>b.accountId)).toEqual([1,2]);
    expect(c?.faqs.filter(f=>f.siteId==="fashion").map(f=>f.answer)).toEqual(["3 business days."]);
    expect(c?.provider.url).toBe("https://api.openai.com/v1/chat/completions");
  });
  it("rejects mixing Chatwoot Account identities between sites", () => {
    vi.stubEnv("SUPPORT_AI_BOTS_JSON",JSON.stringify([bindings[0],{...bindings[1],accountId:1}]));
    expect(() => loadAIConfig()).toThrow(/Account/);
  });
  it("rejects cross-brand or unrelated knowledge URLs", () => {
    vi.stubEnv("SUPPORT_AI_FAQS_JSON",JSON.stringify([
      {...faqs[0],sourceUrl:"https://jewelry.example.com/policies/shipping"},faqs[1],
    ]));
    expect(() => loadAIConfig()).toThrow(/brand domain/);
    vi.stubEnv("SUPPORT_AI_FAQS_JSON",JSON.stringify([
      {...faqs[0],sourceUrl:"https://fashion.example.com.evil.test/shipping"},faqs[1],
    ]));
    expect(() => loadAIConfig()).toThrow(/brand domain/);
  });
  it("rejects duplicate bot scopes, unpublished FAQ omissions and missing credentials", () => {
    vi.stubEnv("SUPPORT_AI_BOTS_JSON",JSON.stringify([bindings[0],bindings[0]]));
    expect(() => loadAIConfig()).toThrow(/Duplicate/);
    vi.stubEnv("SUPPORT_AI_BOTS_JSON",JSON.stringify(bindings));
    vi.stubEnv("SUPPORT_AI_FAQS_JSON",JSON.stringify([faqs[0]]));
    expect(() => loadAIConfig()).toThrow(/published FAQ/);
    vi.stubEnv("SUPPORT_AI_FAQS_JSON",JSON.stringify(faqs));
    vi.stubEnv("SUPPORT_AI_MODEL_API_KEY","");
    expect(() => loadAIConfig()).toThrow(/required together/);
  });
  it("rejects unsafe inference endpoints", () => {
    vi.stubEnv("SUPPORT_AI_MODEL_URL","http://localhost:11434/v1/chat/completions");
    expect(() => loadAIConfig()).toThrow(/trusted HTTPS/);
    vi.stubEnv("SUPPORT_AI_MODEL_URL","https://api.openai.com/v1/chat/completions?key=secret");
    expect(() => loadAIConfig()).toThrow(/trusted HTTPS/);
  });
});
