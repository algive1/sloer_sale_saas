export type ReminderTarget = {status:string;isPaid:boolean;email:string;authorizeStatus?:string};
export function reminderSkipReason(order:ReminderTarget):string|null {
 if(order.isPaid)return "already_paid";
 if(["DRAFT","UNCONFIRMED","CANCELED","FULFILLED","PARTIALLY_FULFILLED","RETURNED"].includes(order.status.toUpperCase()))return "closed_order";
 if(["FULL","PARTIAL"].includes((order.authorizeStatus??"").toUpperCase()))return "payment_authorized";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email))return "no_customer_email";
 return null;
}
export function reminderDueStage(args:{createdAt:string;firstHours:number;secondHours:number;firstSent:boolean;now:number}):"first"|"second"|null {
 const age=(args.now-new Date(args.createdAt).getTime())/3600000;
 if(!Number.isFinite(age)||age<args.firstHours)return null;
 return age>=args.secondHours&&args.firstSent?"second":"first";
}
export function reminderCooldown(lastSent:string|null,now:number,hours=24):boolean {
 if(!lastSent)return false;
 const last=new Date(lastSent).getTime();
 return Number.isFinite(last)&&now-last<hours*3600000;
}