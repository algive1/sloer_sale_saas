import {describe,it,expect} from "vitest";
import {
  allowedAiEndpoints,validatedAiEndpoint,validatedAiModel,
  acceptAiProposal,aiSystemPrompt,
} from "./ai-core";
import { FASHION_TEMPLATE } from "./template";
import { PRODUCT_DETAIL_TEMPLATE } from "./page-document";

describe("AI provider trust boundary",()=>{
  it("includes official OpenAI and deployment-approved compatible gateways",()=>{
    expect(allowedAiEndpoints("https://gateway.example.org/v1,https://another.example.com/openai/v1"))
      .toEqual(["https://api.openai.com/v1","https://gateway.example.org/v1","https://another.example.com/openai/v1"]);
    expect(()=>validatedAiEndpoint("https://unknown.example/v1","https://gateway.example.org/v1")).toThrow();
    expect(validatedAiEndpoint("https://gateway.example.org/v1","https://gateway.example.org/v1"))
      .toBe("https://gateway.example.org/v1");
    expect(validatedAiModel("models/gpt-compatible")).toBe("models/gpt-compatible");
  });
  it("rejects local hosts, injected credentials and URLs with query parameters",()=>{
    for(const s of ["http://localhost/v1","https://localhost/v1","https://127.0.0.1/v1",
      "https://admin:pass@api.example.com/v1","https://gateway.example.com/v1?token=secret",
      "https://gateway.example.com:8443/v1","https://intranet.local/v1"]){
      expect(()=>allowedAiEndpoints(s)).toThrow();
    }
  });
});
describe("AI editable draft boundary",()=>{
  it("validates whole-page JSON and respects the page type allowlist",()=>{
    expect(acceptAiProposal("home","page",FASHION_TEMPLATE,undefined,{
      document:FASHION_TEMPLATE,
    })).toEqual(FASHION_TEMPLATE);
    expect(()=>acceptAiProposal("product","page",PRODUCT_DETAIL_TEMPLATE,undefined,{
      document:FASHION_TEMPLATE,
    })).toThrow();
    expect(aiSystemPrompt("product","block")).toContain("locked");
  });
  it("replaces only the selected module and cannot change its identity",()=>{
    const initial=structuredClone(FASHION_TEMPLATE);
    const id=initial.content[0].props.id;
    const block=structuredClone(initial.content[0]);
    block.props.heading="AI updated headline";
    const next=acceptAiProposal("home","block",initial,id,{block});
    expect(next.content[0].props.heading).toBe("AI updated headline");
    expect(next.content.slice(1)).toEqual(initial.content.slice(1));
    expect(initial.content[0].props.heading).not.toBe("AI updated headline");
    expect(()=>acceptAiProposal("home","block",initial,id,{
      block:{...block,type:"Product"},
    })).toThrow();
    expect(()=>acceptAiProposal("home","block",initial,id,{
      block:{...block,props:{...block.props,id:"other"}},
    })).toThrow();
    expect(()=>acceptAiProposal("home","block",initial,id,{
      block:{...block,props:{...block.props,ctaHref:"https://external.example"}},
    })).toThrow();
  });
  it("disallows untrusted executable blocks, invalid content and duplicate IDs",()=>{
    expect(()=>acceptAiProposal("home","page",FASHION_TEMPLATE,undefined,{
      document:{root:{props:{}},content:[{type:"Html",props:{id:"evil",html:"<script/>"}}]},
    })).toThrow();
    expect(()=>acceptAiProposal("home","page",FASHION_TEMPLATE,undefined,{
      document:{root:{props:{}},content:[FASHION_TEMPLATE.content[0],FASHION_TEMPLATE.content[0]]},
    })).toThrow();
  });
});
