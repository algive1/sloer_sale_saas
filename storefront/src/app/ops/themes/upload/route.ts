import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { activeThemeSiteId } from "@/plugins/theme-builder/store";

const MAX_IMAGE = 5 * 1024 * 1024;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const respond = (data:object,status=200)=>Response.json(data,{status,headers});

function mimeFromBytes(bytes:Uint8Array):string|null {
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return "image/png";
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
    String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return null;
}
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  const fetchSite=request.headers.get("sec-fetch-site");
  if(!origin||origin!==request.nextUrl.origin||(fetchSite&&fetchSite!=="same-origin"))return respond({error:"Cross-origin upload blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("multipart/form-data"))return respond({error:"Multipart image required"},415);
  if(Number(request.headers.get("content-length")||0)>MAX_IMAGE+100000)return respond({error:"Image exceeds 5 MB"},413);
  const channel=request.nextUrl.searchParams.get("channel")??"";
  if(!await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs()))return respond({error:"Invalid channel"},400);
  try {activeThemeSiteId(channel);}catch{return respond({error:"Unknown brand channel"},404);}
  const token=process.env.SALEOR_APP_TOKEN?.trim();
  const api=process.env.SALEOR_INTERNAL_API_URL??process.env.NEXT_PUBLIC_SALEOR_API_URL;
  if(!token||!api)return respond({error:"Upload needs SALEOR_APP_TOKEN"},503);
  try {
    const form=await request.formData();
    const incoming=form.get("file");
    if(!(incoming instanceof File)||!incoming.size||incoming.size>MAX_IMAGE)return respond({error:"Image must be 5 MB or less"},400);
    const buffer=new Uint8Array(await incoming.arrayBuffer());
    const mime=mimeFromBytes(buffer);
    const ext=incoming.name.split(".").pop()?.toLowerCase();
    const extensions=mime==="image/jpeg"?["jpg","jpeg"]:mime==="image/png"?["png"]:["webp"];
    if(!mime||!ext||!extensions.includes(ext))return respond({error:"Only valid JPG, PNG, WebP images are supported"},415);
    const file=new File([buffer],incoming.name,{type:mime});
    const upload=new FormData();
    upload.append("operations",JSON.stringify({
      query:"mutation ThemeFileUpload($file:Upload!){fileUpload(file:$file){uploadedFile{url}uploadErrors{message}}}",
      variables:{file:null},
    }));
    upload.append("map",JSON.stringify({"0":["variables.file"]}));
    upload.append("0",file);
    const response=await fetch(api,{method:"POST",headers:{Authorization:`Bearer ${token}`},
      body:upload,cache:"no-store",signal:AbortSignal.timeout(30000)});
    if(!response.ok)return respond({error:"Saleor rejected upload"},502);
    const json=await response.json() as {
      errors?:{message:string}[];
      data?:{fileUpload?:{uploadedFile?:{url:string}|null;uploadErrors?:{message:string}[]}};
    };
    const url=json.data?.fileUpload?.uploadedFile?.url;
    if(json.errors?.length||json.data?.fileUpload?.uploadErrors?.length||!url)return respond({error:"File upload failed"},502);
    if(!/^https:\/\/[\w.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(url)||url.includes("@"))
      return respond({error:"Saleor media must have a public HTTPS URL"},502);
    return respond({url});
  }catch{return respond({error:"Image upload temporarily unavailable"},503);}
}
