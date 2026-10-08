import "server-only";

/**
 * Saleor is the sole authority for payment and fulfillment status.
 * Analytics checkout_completed events are not proof that an order is paid.
 */
export type OpsOrder = {
  id:string; number:number; createdAt:string; paidAt:string|null;
  country:string; source:string; status:string; paymentStatus:string;
  isPaid:boolean; amount:number; currency:string; paymentMethod:string;
  thumbnailUrl:string; productName:string; email:string;
};
type GqlOrder = {
 id:string; number:number; created:string; status:string; paymentStatus?:string|null;
 isPaid:boolean; userEmail?:string|null;
 shippingAddress?:{country?:{code?:string|null}|null}|null;
 billingAddress?:{country?:{code?:string|null}|null}|null;
 total?:{gross?:{amount?:number|null;currency?:string|null}|null}|null;
 lines?:Array<{productName?:string|null;thumbnail?:{url?:string|null}|null}>;
 payments?:Array<{gateway?:string|null;created?:string|null}>|null;
};
const query=String.raw\`query OpsRecentOrders($first:Int!){
 orders(first:$first,sortBy:{field:CREATED_AT,direction:DESC}) {
  edges { node {
   id number created status paymentStatus isPaid userEmail
   shippingAddress {country {code}}
   billingAddress {country {code}}
   total {gross {amount currency}}
   lines {productName thumbnail(size:64,format:WEBP){url}}
   payments {gateway created}
  }}
 }
}\`;

export async function fetchSaleorOrders(first=24):Promise<OpsOrder[]|null>{
 const endpoint=process.env.NEXT_PUBLIC_SALEOR_API_URL?.trim();
 const token=process.env.SALEOR_APP_TOKEN?.trim();
 if(!endpoint||!token)return null;
 const response=await fetch(endpoint,{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
   headers:{"content-type":"application/json",authorization:"Bearer "+token},
   body:JSON.stringify({query,variables:{first:Math.max(1,Math.min(100,first))}}),
 });
 if(!response.ok)throw new Error("Saleor order API HTTP "+response.status);
 const body=await response.json() as {data?:{orders?:{edges:Array<{node:GqlOrder}>}|null};errors?:Array<{message:string}>};
 if(body.errors?.length)throw new Error("Saleor order query failed: "+body.errors[0]?.message);
 return (body.data?.orders?.edges??[]).map(({node:o})=>({
  id:o.id,number:o.number,createdAt:o.created,paidAt:null,
  country:o.shippingAddress?.country?.code??o.billingAddress?.country?.code??"UNKNOWN",
  source:"—",status:o.status,paymentStatus:o.paymentStatus??"UNKNOWN",
  isPaid:o.isPaid,amount:o.total?.gross?.amount??0,currency:o.total?.gross?.currency??"UNKNOWN",
  paymentMethod:o.payments?.[0]?.gateway??"—",
  thumbnailUrl:o.lines?.[0]?.thumbnail?.url??"",
  productName:o.lines?.[0]?.productName??"—",
  email:o.userEmail??"",
 }));
}

export async function fetchSaleorOrder(id:string):Promise<OpsOrder|null>{
 if(!id||id.length>300)return null;
 const orders=await fetchSaleorOrders(100);
 return orders?.find(o=>o.id===id)??null;
}
