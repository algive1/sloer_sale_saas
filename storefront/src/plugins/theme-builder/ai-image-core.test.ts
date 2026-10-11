import {describe,it,expect} from "vitest";
import {FASHION_TEMPLATE} from "./template";
import {PRODUCT_DETAIL_TEMPLATE} from "./page-document";
import {imageGenerationPrompt,imageModuleChoices,validateImageRequest,applyGeneratedImage} from "./ai-image-core";

describe("theme images-only editable boundary",()=>{
  it("accepts supported image proportions and rejects malformed prompts",()=>{
    const options=validateImageRequest("studio jewelry photography","1536x1024","luxury");
    expect(imageGenerationPrompt(options)).toContain("Do not render any text");
    expect(()=>validateImageRequest("abc","1536x1024","luxury")).toThrow();
    expect(()=>validateImageRequest("banner","1920x800","luxury")).toThrow();
    expect(()=>validateImageRequest("banner","1024x1024","invalid")).toThrow();
  });
  it("limits replacement to the image field on Hero and Editorial blocks",()=>{
    const initial=structuredClone(FASHION_TEMPLATE);
    const choices=imageModuleChoices(initial);
    expect(choices.length).toBeGreaterThan(0);
    const hero=initial.content.find(x=>x.type==="Hero");
    expect(hero).toBeDefined();
    const next=applyGeneratedImage(initial,hero!.props.id,"https://media.example.com/media/images/scene.webp");
    expect(next.content.find(x=>x.props.id===hero!.props.id)?.props.imageUrl)
      .toBe("https://media.example.com/media/images/scene.webp");
    expect(next.content.slice(1)).toEqual(initial.content.slice(1));
    expect(initial.content.find(x=>x.type==="Hero")?.props.imageUrl).not.toBe(
      "https://media.example.com/media/images/scene.webp");
  });
  it("does not change commerce blocks, other brands or accept temporary data URLs",()=>{
    const product=structuredClone(PRODUCT_DETAIL_TEMPLATE);
    const selected=product.content.find(x=>x.type==="Collection")!;
    expect(()=>applyGeneratedImage(product,selected.props.id,"https://media.example.com/a.webp")).toThrow();
    expect(()=>applyGeneratedImage(product,"unknown-id","https://media.example.com/a.webp")).toThrow();
    expect(()=>applyGeneratedImage(product,"unknown-id","data:image/webp;base64,abc")).toThrow();
    expect(()=>applyGeneratedImage(product,"unknown-id","http://evil.example/img.png")).toThrow();
  });
});
