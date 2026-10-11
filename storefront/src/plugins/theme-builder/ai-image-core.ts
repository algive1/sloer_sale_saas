import { ThemeValidationError } from "./validate";
import type { ThemeData } from "./template";

/** The model never edits arbitrary HTML, product data, text or checkout state. */
export const IMAGE_SIZES = ["1024x1024","1536x1024","1024x1536"] as const;
export type ImageSize = typeof IMAGE_SIZES[number];
export const IMAGE_STYLES = ["editorial","minimal","luxury","warm","campaign"] as const;
export type ImageStyle = typeof IMAGE_STYLES[number];
const STYLE_HINTS:Record<ImageStyle,string>={
  editorial:"Premium Western ecommerce editorial photography, composed for storefront banners.",
  minimal:"Minimalist studio photography, clean shapes, soft lighting, uncluttered background.",
  luxury:"Refined luxury still-life, tasteful lighting, high-end materials and sophisticated composition.",
  warm:"Warm natural light, inviting lifestyle atmosphere, authentic materials.",
  campaign:"Modern ecommerce campaign visual, strong focal point, ample negative space for a separate HTML headline.",
};
export function validateImageRequest(prompt:unknown,size:unknown,style:unknown) {
  if(typeof prompt!=="string"||prompt.trim().length<4||prompt.length>1000)
    throw new ThemeValidationError("请输入 4–1000 字的图片描述");
  if(!IMAGE_SIZES.includes(size as ImageSize))throw new ThemeValidationError("Invalid image size");
  if(!IMAGE_STYLES.includes(style as ImageStyle))throw new ThemeValidationError("Invalid image style");
  return {prompt:prompt.trim(),size:size as ImageSize,style:style as ImageStyle};
}
export function imageGenerationPrompt(input:ReturnType<typeof validateImageRequest>):string {
  return `Generate one original ecommerce marketing photograph. ${STYLE_HINTS[input.style]}
Operator brief: ${input.prompt}
Do not render any text, logo, watermark, trademark, prices or misleading product claims.
Avoid invented branded products or packaging. Leave room for separately rendered accessible HTML copy.
Photorealistic, suitable for a responsive storefront; no copyrighted characters.`;
}
export function imageModuleChoices(document:ThemeData):{id:string;label:string}[] {
  return document.content.filter(block=>block.type==="Hero"||block.type==="Editorial")
    .map(block=>({id:block.props.id,label:String(block.props.heading||block.type).slice(0,75)}));
}
export function applyGeneratedImage(document:ThemeData,blockId:string,url:string):ThemeData {
  if(!/^https:\/\/[\w.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(url)||url.includes("@"))
    throw new ThemeValidationError("Generated image must be a persistent HTTPS media URL");
  let changed=false;
  const content=document.content.map(block=>{
    if(block.props.id!==blockId)return block;
    if(block.type!=="Hero"&&block.type!=="Editorial")
      throw new ThemeValidationError("The selected block has no editable image");
    changed=true;
    return {...block,props:{...block.props,imageUrl:url}};
  });
  if(!changed)throw new ThemeValidationError("Select an image-capable block");
  return {...document,content};
}
