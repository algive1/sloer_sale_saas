import { PluginPauseNotice } from "@/plugins/system/pause-notice.server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { getBrandSites } from "@/config/brand-sites";
import { parseChatwootSupportConfig } from "@/plugins/customer-support/config";
import {
	parseWhatsAppBindings,
	whatsappLink,
	type WhatsAppBinding,
} from "@/plugins/customer-support/whatsapp-config";
import { loadAIConfig } from "@/plugins/customer-support/ai/bot-config";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";

export const metadata: Metadata = {
	title: "在线客服 | Commerce Ops",
	robots: { index: false, follow: false },
};

/** Read-only configuration visibility, not a fake provisioning/settings form. */
async function SupportConfiguration() {
	await io();
	const brands = getBrandSites();
	const expectedIds = brands?.map((site) => site.id) ?? [process.env.STOREFRONT_SITE_ID?.trim() || "primary"];
	let ready = false;
	let reason = "";
	let url: string | null = null;
	try {
		const config = parseChatwootSupportConfig(
			process.env.SUPPORT_CHATWOOT_BASE_URL,
			process.env.SUPPORT_CHATWOOT_SITES_JSON,
			expectedIds,
			process.env.NODE_ENV !== "production",
		);
		ready = config !== null;
		url = config?.baseUrl ?? null;
		if (!ready) reason = "尚未配置 Chatwoot 服务地址和品牌 Account/Inbox 映射。";
	} catch {
		reason = "客服配置不完整或品牌映射不匹配；前台聊天已安全关闭。";
	}
	let whatsapp: readonly WhatsAppBinding[] = [];
	let whatsappReason = "未配置；前台不显示 WhatsApp 入口。";
	try {
		whatsapp = parseWhatsAppBindings(process.env.SUPPORT_WHATSAPP_SITES_JSON, expectedIds);
		if (whatsapp.length)
			whatsappReason = "号码和品牌绑定格式已通过校验；须在真实品牌手机/电脑测试接收与人工回复。";
	} catch {
		whatsappReason = "号码格式或品牌映射错误；前台 WhatsApp 入口已关闭。";
	}

	let aiBrands: readonly string[] = [];
	let aiStatus = "未启用";
	if (process.env.SUPPORT_AI_BOTS_JSON?.trim()) {
		try {
			if (!analyticsDatabaseConfigured() || (process.env.SUPPORT_AI_WORKER_SECRET?.trim().length ?? 0) < 32)
				throw new Error("no worker/ledger");
			const ai = loadAIConfig();
			aiBrands = ai?.bots.map((bot) => bot.siteId) ?? [];
			aiStatus = "配置有效（待真实服务验证）";
		} catch {
			aiStatus = "AI 配置错误或缺少持久化存储，未就绪";
		}
	}
	return (
		<main className="mx-auto max-w-5xl px-5 py-8">
			<Link href="/ops/plugins" className="text-sm text-muted-foreground hover:underline">
				← 系统插件
			</Link>
			<h1 className="my-5 text-2xl font-semibold">在线客服 · Chatwoot</h1>
			<PluginPauseNotice plugin="customer-support" />
			<section className="rounded-xl border bg-card p-5">
				<h2 className="font-semibold">接入状态：{ready ? "已配置" : "未就绪"}</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{ready ? "已通过本地品牌绑定校验；实时连接和 Chatwoot 服务健康状态仍需实测。" : reason}
				</p>
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="mt-4 inline-block text-sm font-semibold underline"
					>
						打开 Chatwoot 客服工作台 ↗
					</a>
				)}
			</section>
			<section className="mt-5 rounded-xl border bg-card p-5">
				<h2 className="font-semibold">WhatsApp 品牌入口</h2>
				<p className="mt-2 text-sm text-muted-foreground">{whatsappReason}</p>
				<ul className="mt-4 space-y-3">
					{expectedIds.map((siteId) => {
						const binding = whatsapp.find((item) => item.siteId === siteId);
						return (
							<li
								key={siteId}
								className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm"
							>
								<span>{brands?.find((brand) => brand.id === siteId)?.name ?? siteId}</span>
								{binding ? (
									<a
										href={whatsappLink(binding, "en")}
										target="_blank"
										rel="noopener noreferrer"
										referrerPolicy="no-referrer"
										className="font-semibold underline"
									>
										+{binding.phone} · 打开核对 ↗
									</a>
								) : (
									<span className="text-muted-foreground">未配置</span>
								)}
							</li>
						);
					})}
				</ul>
				<p className="mt-3 text-sm text-muted-foreground">
					点击跳转由顾客自行发起。仅预填固定问候语；订单、顾客身份和会话同步尚未接入，不能据此判定咨询者拥有某个订单。
				</p>
			</section>
			<section className="mt-5 rounded-xl border bg-card p-5">
				<h2 className="font-semibold">品牌客服绑定</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					系统级插件统一部署。每个品牌须有独立 Chatwoot Account 和网站 Inbox；不展示公开网站 Token。
				</p>
				<ul className="mt-4 space-y-3">
					{expectedIds.map((siteId) => (
						<li key={siteId} className="flex items-center justify-between gap-3 border-b pb-3 text-sm">
							<span>{brands?.find((brand) => brand.id === siteId)?.name ?? siteId}</span>
							<span className="text-muted-foreground">{ready ? "已映射（待端到端验证）" : "未配置"}</span>
						</li>
					))}
				</ul>
			</section>
			<section className="mt-5 rounded-xl border bg-card p-5">
				<h2 className="font-semibold">AI Agent Bot</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					状态：{aiStatus}。AI 仅选择当前品牌的已审核 FAQ；无法确认的咨询交给人工。
				</p>
				{aiBrands.length > 0 && (
					<p className="mt-2 text-sm text-muted-foreground">已配置品牌：{aiBrands.join("、")}</p>
				)}
			</section>
			<p className="mt-5 text-sm text-muted-foreground">
				机器人需单独配置并验证真实 Chatwoot 服务。客户身份、订单查询、退款和物流修改没有开放给 AI。
				配置与验收参见 docs/customer-support.md 和 docs/customer-support-ai.md。
			</p>
		</main>
	);
}

export default function SupportPage() {
	return (
		<Suspense fallback={<main className="mx-auto max-w-5xl px-5 py-8">正在读取客服配置…</main>}>
			<SupportConfiguration />
		</Suspense>
	);
}
