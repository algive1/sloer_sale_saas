import { pluginPauseReason } from "@/plugins/system/runtime.server";
import { PluginPauseNotice } from "@/plugins/system/pause-notice.server";
import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import {
	getReminderRule,
	getReminderSites,
	getReminderDeliveries,
} from "@/plugins/payment-reminders/service";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { ReminderSettings } from "./reminder-settings";

type Params = Promise<{ siteId?: string | string[] }>;
export default function ReminderPage({ searchParams }: { searchParams: Params }) {
	return (
		<main className="mx-auto max-w-5xl px-5 py-8">
			<Link href="/ops/analytics" className="text-sm text-muted-foreground hover:underline">
				← 数据总览
			</Link>
			<h1 className="my-5 text-2xl font-bold">催付设置与发送记录</h1>
			<Suspense fallback={<p role="status">正在读取品牌催付设置…</p>}>
				<ReminderContent searchParams={searchParams} />
			</Suspense>
		</main>
	);
}
async function ReminderContent({ searchParams }: { searchParams: Params }) {
	await io();
	const params = await searchParams;
	const sites = getReminderSites();
	const site = params.siteId === undefined ? sites[0] : sites.find((s) => s.id === params.siteId);
	if (!site) return <p role="alert">无效的品牌，请从数据总览重新进入催付设置。</p>;
	const configured = analyticsDatabaseConfigured();
	const [rule, deliveries] = configured
		? await Promise.all([getReminderRule(site.id), getReminderDeliveries(site.id)])
		: [null, []];
	const stage: Record<string, string> = { manual: "人工", first: "首次", second: "再次" };
	const status: Record<string, string> = {
		sent: "已提交邮件服务",
		sending: "已占用名额，结果待核查",
		failed: "失败或结果不确定",
	};
	return (
		<div className="space-y-5">
			<PluginPauseNotice plugin="payment-reminders" />
			<form method="get" className="flex items-end gap-3">
				<label className="text-sm">
					品牌
					<select
						name="siteId"
						aria-label="品牌"
						defaultValue={site.id}
						className="ml-3 rounded-lg border border-border bg-card px-3 py-2"
					>
						{sites.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</label>
				<button className="rounded-lg border border-border px-3 py-2 text-sm">查看设置</button>
			</form>
			<section className="rounded-xl border border-border bg-card p-5 text-sm">
				<h2 className="font-semibold">{site.name} · 发送身份</h2>
				<dl className="mt-3 grid gap-2 sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground">发件人</dt>
						<dd>{site.from || "未配置品牌发件人"}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">邮件语言</dt>
						<dd>{site.locale}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">客户查询地址</dt>
						<dd className="break-all">{site.lookupUrl || "未配置"}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">订单渠道</dt>
						<dd>{site.channels.join(" / ") || "单品牌模式"}</dd>
					</div>
				</dl>
				<p className="mt-3 text-xs text-muted-foreground">
					发件人和语言通过服务器 PAYMENT_REMINDER_SITES_JSON
					配置，密钥不在此页面展示。配置齐全仅表示可以调用服务；上线前仍需验证发件域名和真实投递。
				</p>
			</section>
			{rule ? (
				<ReminderSettings
					key={site.id}
					paused={Boolean(pluginPauseReason("payment-reminders"))}
					initial={rule}
					siteId={site.id}
					emailReady={site.emailReady}
					cronReady={Boolean(process.env.PAYMENT_REMINDER_CRON_SECRET?.trim())}
				/>
			) : (
				<p role="status">分析数据库尚未配置，无法保存催付规则。</p>
			)}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="font-semibold">本品牌最近40次发送尝试</h2>
				<p className="mt-2 text-xs text-muted-foreground">
					结果不确定时先核对邮件服务日志，系统不会自动重试。旧全局历史保留在单品牌范围，不迁移到新品牌。
				</p>
				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-xs">
						<thead>
							<tr>
								{["订单", "渠道", "阶段", "状态", "尝试时间（UTC）", "错误代码"].map((label) => (
									<th key={label} className="border-b border-border p-2 font-medium">
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{deliveries.map((d) => (
								<tr key={d.orderId + d.stage}>
									<td className="p-2">#{d.orderNumber || "旧记录"}</td>
									<td className="p-2">{d.channel || "—"}</td>
									<td className="p-2">{stage[d.stage] ?? d.stage}</td>
									<td className="p-2">{status[d.status] ?? d.status}</td>
									<td className="whitespace-nowrap p-2">{d.claimedAt}</td>
									<td className="p-2">{d.error || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!deliveries.length && <p className="py-5 text-sm text-muted-foreground">暂无发送记录。</p>}
			</section>
		</div>
	);
}
