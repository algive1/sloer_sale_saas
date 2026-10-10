import Link from "next/link";
import { brandSitesConfigured } from "@/config/brand-sites";
import {getReminderRule,reminderEmailConfigured} from "@/plugins/payment-reminders/service";
import {analyticsDatabaseConfigured} from "@/lib/analytics/libsql-http";
import {ReminderSettings} from "./reminder-settings";
export default async function ReminderPage(){
 if(brandSitesConfigured())return <main className="mx-auto max-w-5xl px-5 py-8">
 <Link href="/ops/analytics" className="text-sm text-muted-foreground hover:underline">← 数据总览</Link>
 <h1 className="my-5 text-2xl font-bold">催付设置</h1>
 <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">多品牌模式暂不支持付款提醒。当前规则、发件人和订单查询链接尚未按品牌隔离，人工与自动发送均已暂停，避免以错误品牌联系客户。单品牌模式不受影响。</p>
 </main>;
 const configured=analyticsDatabaseConfigured();
 const rules=configured?await getReminderRule():null;
 return <main className="mx-auto max-w-5xl px-5 py-8">
 <Link href="/ops/analytics" className="text-sm text-muted-foreground hover:underline">← 数据总览</Link>
 <h1 className="my-5 text-2xl font-bold">催付设置</h1>
 {rules?<ReminderSettings initial={rules} emailReady={reminderEmailConfigured()} cronReady={Boolean(process.env.PAYMENT_REMINDER_CRON_SECRET?.trim())}/>:<p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">分析数据库尚未配置，无法保存催付规则。</p>}
 </main>;
}
