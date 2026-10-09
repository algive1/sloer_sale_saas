import "server-only";
import { getLocaleDefinition } from "@/config/locale";
import { normalizeSource, sourceHash, TranslationInputError, type TranslatedFields, type TranslationScope } from "./policy";

type ProductNode = { id: string; slug: string; name: string; description?: string | null;
  seoTitle?: string | null; seoDescription?: string | null;
  translation?: {name?: string|null; description?: string|null; seoTitle?: string|null; seoDescription?: string|null} | null };
export type SourceProduct = { id: string; slug: string; source: TranslatedFields; hash: string };

function credentials(): {url:string;token:string} {
  const url = (process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL)?.trim();
  const token = process.env.TRANSLATION_SALEOR_TOKEN?.trim();
  if (!url || !token) throw new Error("翻译专用 Saleor 凭证未配置");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" && ["localhost","127.0.0.1"].includes(parsed.hostname)) &&
      !(parsed.protocol === "http:" && parsed.hostname === "api" && parsed.port === "8000")) {
    throw new Error("Saleor API 必须使用 HTTPS");
  }
  return {url,token};
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const {url,token} = credentials();
  const response = await fetch(url, {method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
    headers:{"content-type":"application/json",authorization:"Bearer "+token},
    body:JSON.stringify({query,variables})});
  if (!response.ok) throw new Error("Saleor HTTP "+response.status);
  const body = await response.json() as { data?:T; errors?:{message:string}[] };
  if (body.errors?.length || !body.data) throw new Error("Saleor GraphQL: "+(body.errors?.[0]?.message?.slice(0,200)??"missing data"));
  return body.data;
}

const LIST_PRODUCTS = "query OpsTranslationProductList($channel: String!, $first: Int!, $after: String) {"+
  " products(first:$first,after:$after,channel:$channel) {"+
  " pageInfo { hasNextPage endCursor } edges { node { id slug name description seoTitle seoDescription } } } }";
const GET_PRODUCT = "query OpsTranslationProduct($id: ID!, $channel: String!, $language: LanguageCodeEnum!) {"+
  " product(id:$id,channel:$channel) { id slug name description seoTitle seoDescription"+
  " translation(languageCode:$language) { name description seoTitle seoDescription } } }";
const TRANSLATE = "mutation OpsProductTranslate($id: ID!, $language: LanguageCodeEnum!, $input: TranslationInput!) {"+
  " productTranslate(id:$id, languageCode:$language, input:$input) { errors { field code message } } }";

function normalizedProduct(product: ProductNode): SourceProduct {
  const source = normalizeSource(product as unknown as Record<string,unknown>);
  return {id:product.id,slug:product.slug,source,hash:sourceHash(product.id,source)};
}

export async function listSourceProducts(channel:string, count:number, after:string|null=null):Promise<{
  products:SourceProduct[]; nextCursor:string|null;
}> {
  const result = await graphql<{products?:{pageInfo:{hasNextPage:boolean;endCursor:string|null};edges:{node:ProductNode}[]}|null}>(
    LIST_PRODUCTS,{channel,first:count,after});
  const page=result.products;
  const products=(page?.edges??[]).map(({node})=>normalizedProduct(node))
    .filter((item)=>Object.keys(item.source).length>0);
  return {products,nextCursor:page?.pageInfo.hasNextPage ? (page.pageInfo.endCursor??null) : null};
}

export async function freshProduct(scope:TranslationScope,id:string):Promise<{
  product:SourceProduct; existing:TranslatedFields | null
}> {
  const language = getLocaleDefinition(scope.locale)?.graphqlLanguageCode;
  if (!language) throw new TranslationInputError("无效的 Saleor 语言");
  const result = await graphql<{product?:ProductNode|null}>(GET_PRODUCT,{
    id,channel:scope.channel,language,
  });
  if (!result.product || result.product.id!==id) throw new TranslationInputError("商品已不存在或不属于该市场");
  return {
    product:normalizedProduct(result.product),
    existing: result.product.translation ? normalizeSource(result.product.translation) : null,
  };
}

function plainToEditorJs(text:string):string {
  return JSON.stringify({time:Date.now(),blocks:[{id:"translation",type:"paragraph",data:{text}}],version:"2.30.7"});
}

/** The existing Saleor productTranslate API; do not overwrite manually filled fields. */
export async function publishProductTranslation(scope:TranslationScope,id:string,fields:TranslatedFields):Promise<void> {
  const language=getLocaleDefinition(scope.locale)?.graphqlLanguageCode;
  if (!language) throw new TranslationInputError("无效的翻译目标");
  const input:Record<string,string>={};
  for (const [key,value] of Object.entries(fields)) {
    if (!value) continue;
    input[key]=key==="description"?plainToEditorJs(value):value;
  }
  const out=await graphql<{productTranslate?:{errors?:{message:string}[]}|null}>(TRANSLATE,{
    id,language,input,
  });
  if (!out.productTranslate || out.productTranslate.errors?.length) {
    throw new Error("Saleor 拒绝翻译写入: "+(out.productTranslate?.errors?.[0]?.message??"unknown"));
  }
}
