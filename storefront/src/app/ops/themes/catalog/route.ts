import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { activeThemeSiteId } from "@/plugins/theme-builder/store";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const respond = (data: object, status = 200) => Response.json(data, { status, headers });

const queries = {
  products: `query ThemeProducts($channel:String!,$search:String!) {
    products(first:24,channel:$channel,filter:{search:$search}) {
      edges { node { slug name thumbnail(size:256,format:WEBP) { url }
        pricing { priceRange { start { gross { amount currency } } } }
      } }
    }
  }`,
  collections: `query ThemeCollections($channel:String!) {
    collections(first:50,channel:$channel) {
      edges { node { slug name backgroundImage(size:256,format:WEBP) { url } } }
    }
  }`,
  collectionProducts: `query ThemeCollectionProducts($channel:String!,$slug:String!) {
    collection(channel:$channel,slug:$slug) {
      slug
      products(first:24) { edges { node { slug name thumbnail(size:256,format:WEBP) { url }
        pricing { priceRange { start { gross { amount currency } } } }
      } } }
    }
  }`,
  product: `query ThemeSingleProduct($channel:String!,$slug:String!) {
    product(channel:$channel,slug:$slug) { slug name thumbnail(size:256,format:WEBP) { url }
      pricing { priceRange { start { gross { amount currency } } } }
    }
  }`,
};
type Item = {
  slug:string; name:string; thumbnail?:{url:string}|null; backgroundImage?:{url:string}|null;
  pricing?:{priceRange?:{start?:{gross?:{amount:number;currency:string}|null}|null}|null}|null;
};
type ResponseData = {
  products?:{edges:{node:Item}[]}|null;
  collections?:{edges:{node:Item}[]}|null;
  product?:Item|null;
  collection?:{slug:string;products?:{edges:{node:Item}[]}|null}|null;
};
const mapItem = (item:Item)=>({
  slug:item.slug, name:item.name,
  image:item.thumbnail?.url??item.backgroundImage?.url??null,
  price:item.pricing?.priceRange?.start?.gross??null,
});

export async function GET(request:NextRequest) {
  const kind=request.nextUrl.searchParams.get("kind");
  const channel=request.nextUrl.searchParams.get("channel")??"";
  const q=(request.nextUrl.searchParams.get("q")??"").trim().slice(0,80);
  const slug=(request.nextUrl.searchParams.get("slug")??"").trim();
  if(kind!=="products"&&kind!=="collections"&&kind!=="product"&&kind!=="collection-products") return respond({error:"Invalid type"},400);
  if(!await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs())) return respond({error:"Invalid channel"},400);
  if((kind==="product"||kind==="collection-products")&&!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return respond({error:"Invalid slug"},400);
  try { activeThemeSiteId(channel); } catch { return respond({error:"Unknown brand channel"},404); }
  const url=process.env.SALEOR_INTERNAL_API_URL??process.env.NEXT_PUBLIC_SALEOR_API_URL;
  if(!url)return respond({error:"Missing Saleor API"},503);
  const variables={channel,...(kind==="products"?{search:q}:kind==="product"||kind==="collection-products"?{slug}:{})};
  try {
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({query:kind==="collection-products"?queries.collectionProducts:queries[kind],variables}),cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!response.ok)return respond({error:"Catalog unavailable"},502);
    const payload=await response.json() as {data?:ResponseData;errors?:{message:string}[]};
    if(payload.errors?.length||!payload.data)return respond({error:"Catalog query failed"},502);
    if(kind==="product")return respond({item:payload.data.product?mapItem(payload.data.product):null});
    if(kind==="collection-products")return respond({collection:payload.data.collection?{
      slug:payload.data.collection.slug,
      products:(payload.data.collection.products?.edges??[]).map(({node})=>mapItem(node)),
    }:null});
    const edges=kind==="products"?payload.data.products?.edges:payload.data.collections?.edges;
    const items=(edges??[]).map(({node})=>mapItem(node)).filter(item=>kind!=="collections"||
      !q||item.name.toLowerCase().includes(q.toLowerCase())||item.slug.includes(q.toLowerCase()));
    return respond({items});
  } catch {return respond({error:"Catalog temporarily unavailable"},503);}
}
