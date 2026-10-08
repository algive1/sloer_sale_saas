import {describe,it,expect} from "vitest";
import {reminderSkipReason,reminderDueStage,reminderCooldown} from "./policy";

describe("payment reminder safeguards",()=>{
 it("never reminds paid, closed or invalid-contact orders",()=>{
  expect(reminderSkipReason({isPaid:true,status:"UNFULFILLED",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("already_paid");
  expect(reminderSkipReason({isPaid:false,status:"CANCELED",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("closed_order");
  expect(reminderSkipReason({isPaid:false,status:"FULFILLED",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("closed_order");
  expect(reminderSkipReason({isPaid:false,status:"PARTIALLY_FULFILLED",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("closed_order");
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",hasRefund:true,email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("refunded_order");
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",authorizeStatus:"FULL",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("payment_authorized");
  expect(reminderSkipReason({isPaid:false,status:"DRAFT",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe("closed_order");
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",email:"invalid",paymentStatus:"NOT_CHARGED"})).toBe("no_customer_email");
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",email:"buyer@example.com",paymentStatus:"NOT_CHARGED"})).toBe(null);
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",email:"buyer@example.com",paymentStatus:"FULLY_CHARGED"})).toBe("payment_status_not_eligible");
  expect(reminderSkipReason({isPaid:false,status:"UNFULFILLED",email:"buyer@example.com"})).toBe("payment_status_not_eligible");
 });
 it("waits for first reminder before sending a second",()=>{
  const now=Date.parse("2026-10-08T12:00:00Z");
  const due=(h:number,firstSent:boolean)=>reminderDueStage({createdAt:new Date(now-h*3600000).toISOString(),firstHours:24,secondHours:72,firstSent,now});
  expect(due(10,false)).toBe(null);
  expect(due(26,false)).toBe("first");
  expect(due(90,false)).toBe("first");
  expect(due(90,true)).toBe("second");
 });
 it("has a full 24-hour order-level cooldown",()=>{
  const now=Date.parse("2026-10-08T12:00:00Z");
  expect(reminderCooldown(new Date(now-23*3600000).toISOString(),now)).toBe(true);
  expect(reminderCooldown(new Date(now-25*3600000).toISOString(),now)).toBe(false);
  expect(reminderCooldown(null,now)).toBe(false);
 });
});