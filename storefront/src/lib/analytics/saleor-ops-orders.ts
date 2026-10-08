import "server-only";
import {analyticsDatabaseConfigured,hranaRowsToObjects,libsqlPipeline} from "@/lib/analytics/libsql-http";

/**
 * Saleor is the sole authority for payment and fulfillment status.
 * Analytics checkout_completed events are not proof that an order is paid.
 */
export type OpsOrder = {
  id:string; number:string; createdAt:string; paidAt:string|null;
  country:string; source:string; status:string; paymentStatus:string; authorizeStatus:string;
  isPaid:boolean; hasRefund:boolean; amount:number; currency:string; paymentMethod:string;
  thumbnailUrl:string; productName:string; email:string;
};
type GqlOrder = {
 id:string; number:string; created:string; status:string; paymentStatus?:string|null;
 isPaid:boolean; userEmail?:string|null; authorizeStatus?:string|null;
 shippingAddress?:{country?:{code?:string|null}|null}|null;
 billingAddress?:{country?:{code?:string|null}|null}|null;
 total?:{gross?:{amount?:number|null;currency?:string|null}|null}|null;
 totalRefunded?:{amount?:number|null}|null;
 lines?:Array<{productName?:string|null;thumbnail?:{url?:string|null}|null}>;
 payments?:Array<{gateway?:string|null;created?:string|null}>|null;
 transactions?:Array<{name:string;events:Array<{createdAt:string;type:string|null}>}>|null;
};
const query=`query OpsRecentOrders($first:Int!,$after:String){
 orders(first:$first,after:$after,sortBy:{field:CREATED_AT,direction:DESC}) {
  pageInfo { hasNextPage endCursor }
  edges { node {
   id number created status paymentStatus authorizeStatus isPaid userEmail
   shippingAddress {country {code}}
   billingAddress {country {code}}
   total {gross {amount currency}}
   totalRefunded {amount}
   lines {productName thumbnail(size:64,format:WEBP){url}}
   payments {gateway created}
   transactions {name events {createdAt type}}
  }}
 }
}`;

function mapOrders(nodes:GqlOrder[]):OpsOrder[]{
 return nodes.map(o=>({
  id:o.id,number:o.number,createdAt:o.created,
  paidAt:o.isPaid?(o.transactions??[]).flatMap(t=>t.events??[]).filter(e=>e.type==="CHARGE_SUCCESS").map(e=>e.createdAt).sort()[0]??null:null,
  country:o.shippingAddress?.country?.code??o.billingAddress?.country?.code??"UNKNOWN",
  source:"—",status:o.status,paymentStatus:o.paymentStatus??"UNKNOWN",authorizeStatus:o.authorizeStatus??"UNKNOWN",
  isPaid:o.isPaid,hasRefund:(o.totalRefunded?.amount??0)>0||(o.transactions??[]).some(t=>(t.events??[]).some(e=>e.type==="REFUND_SUCCESS")),amount:o.total?.gross?.amount??0,currency:o.total?.gross?.currency??"UNKNOWN",
  paymentMethod:o.transactions?.[0]?.name??o.payments?.[0]?.gateway??"—",
  thumbnailUrl:o.lines?.[0]?.thumbnail?.url??"",
  productName:o.lines?.[0]?.productName??"—",
  email:o.userEmail??"",
 }))
}

export type OpsOrdersPage={orders:OpsOrder[];hasNextPage:boolean;endCursor:string|null};
export async function fetchSaleorOrdersPage(first=24,after?:string):Promise<OpsOrdersPage|null>{
 const endpoint=process.env.SALEOR_INTERNAL_API_URL?.trim()||process.env.NEXT_PUBLIC_SALEOR_API_URL?.trim();
 const token=process.env.SALEOR_APP_TOKEN?.trim();
 if(!endpoint||!token)return null;
 const response=await fetch(endpoint,{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
   headers:{"content-type":"application/json",authorization:"Bearer "+token},
   body:JSON.stringify({query,variables:{first:Math.max(1,Math.min(100,first)),after:after||null}}),
 });
 if(!response.ok)throw new Error("Saleor order API HTTP "+response.status);
 const body=await response.json() as {data?:{orders?:{edges:Array<{node:GqlOrder}>;pageInfo?:{hasNextPage:boolean;endCursor:string|null}}|null};errors?:Array<{message:string}>};
 if(body.errors?.length)throw new Error("Saleor order query failed: "+body.errors[0]?.message);
 const orders=mapOrders((body.data?.orders?.edges??[]).map(edge=>edge.node));


 if(analyticsDatabaseConfigured()&&orders.length){
  try{
   const ids=orders.map(o=>o.id);
   const [eventRows]=await libsqlPipeline([{
     sql:"SELECT transaction_id, COALESCE(NULLIF(source_group,''),NULLIF(source,''),'direct') AS source FROM analytics_events WHERE event_name='checkout_completed' AND transaction_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY occurred_at DESC LIMIT 200",
     args:ids,wantRows:true,
   }]);
   const attribution=new Map<string,string>();
   for(const row of hranaRowsToObjects(eventRows)){
    const id=String(row.transaction_id??"");
    if(!attribution.has(id))attribution.set(id,String(row.source??"direct"));
   }
   for(const order of orders)order.source=attribution.get(order.id)??"—";
  }catch{/* Saleor orders remain usable if analytics attribution is unavailable. */}
 }
 return {orders,hasNextPage:Boolean(body.data?.orders?.pageInfo?.hasNextPage),endCursor:body.data?.orders?.pageInfo?.endCursor??null};
}

export async function fetchSaleorOrders(first=24):Promise<OpsOrder[]|null>{
 const page=await fetchSaleorOrdersPage(first);
 return page?.orders??null;
}

export async function fetchSaleorOrder(id:string):Promise<OpsOrder|null>{
 if(!id||id.length>300)return null;
 const endpoint=process.env.SALEOR_INTERNAL_API_URL?.trim()||process.env.NEXT_PUBLIC_SALEOR_API_URL?.trim();
 const token=process.env.SALEOR_APP_TOKEN?.trim();
 if(!endpoint||!token)return null;
 const response=await fetch(endpoint,{
  method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
  headers:{"content-type":"application/json",authorization:"Bearer "+token},
  body:JSON.stringify({query:`query OpsOrderById($id:ID!){order(id:$id){id number created status paymentStatus authorizeStatus isPaid userEmail
   shippingAddress {country {code}}
   billingAddress {country {code}}
   total {gross {amount currency}}
   totalRefunded {amount}
   lines {productName thumbnail(size:64,format:WEBP){url}}
   payments {gateway created}
   transactions {name events {createdAt type}}}}`,variables:{id}}),
 });
 if(!response.ok)throw new Error("Saleor order lookup HTTP "+response.status);
 const body=await response.json() as {data?:{order?:GqlOrder|null};errors?:Array<{message:string}>};
 if(body.errors?.length)throw new Error("Saleor order lookup failed: "+body.errors[0]?.message);
 return body.data?.order?mapOrders([body.data.order])[0]??null:null;
}
