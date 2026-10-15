import type { SystemPluginId } from "@/plugins/system/registry";
import { isSaleorOpsRequestAllowed, type OpsViewer } from "./authorization";

type ConfigurationSection = Readonly<{
	id: SystemPluginId;
	title: string;
	href: `/ops/${string}`;
	action: string;
	online: string;
	deployment: string;
	variables: readonly string[];
	docs: readonly string[];
}>;

/** Existing forms and deployment contracts only; never read credentials here. */
export const OPS_CONFIGURATION: readonly ConfigurationSection[] = [
	{
		id: "theme-builder",
		title: "主题装修与 AI 模型",
		href: "/ops/themes",
		action: "打开装修与模型配置",
		online:
			"在装修编辑器中选择品牌、市场和语言，保存草稿或发布；打开 AI 图片 → 模型设置，新增、启用或删除该品牌的模型配置。",
		deployment:
			"先配置主题数据库、64 位十六进制加密密钥和允许的 AI 服务地址，再在编辑器中填写模型和 API Key。商品详情模板从在线商店菜单进入。",
		variables: [
			"THEME_LIBSQL_URL",
			"THEME_LIBSQL_AUTH_TOKEN",
			"THEME_AI_ENCRYPTION_KEY",
			"THEME_AI_ALLOWED_ENDPOINTS",
		],
		docs: ["docs/theme-editor-ai.md"],
	},
	{
		id: "analytics",
		title: "经营数据分析",
		href: "/ops/analytics",
		action: "打开分析与筛选",
		online:
			"经营总览及分析页展示平台汇总，并提供现有日期和市场筛选；单品牌数据从品牌站点的分析页面进入。采集存储与隐私策略由部署配置管理。",
		deployment:
			"配置分析数据库并核对品牌与渠道归属。客户端 IP 头仅使用可信代理写入的字段；未配置数据库时不能把空报表当作无业务。",
		variables: [
			"ANALYTICS_LIBSQL_URL",
			"ANALYTICS_LIBSQL_AUTH_TOKEN",
			"NEXT_PUBLIC_ANALYTICS_CONSENT_MODE",
			"ANALYTICS_CLIENT_IP_HEADER",
			"SALEOR_APP_TOKEN",
		],
		docs: ["docs/analytics-saleor-ui-v3.md"],
	},
	{
		id: "payment-reminders",
		title: "智能催付",
		href: "/ops/analytics/reminders",
		action: "打开品牌催付规则",
		online: "选择品牌后保存催付开关、时间间隔与发送额度，并查看发送记录。规则保存需要分析数据库。",
		deployment:
			"为每个品牌设置独立发件身份和邮件语言，配置邮件服务及定时任务密钥。先验证发件域名与真实投递，再启用自动催付。",
		variables: [
			"PAYMENT_REMINDER_SITES_JSON",
			"RESEND_API_KEY",
			"PAYMENT_REMINDER_CRON_SECRET",
			"SALEOR_APP_TOKEN",
			"ANALYTICS_LIBSQL_URL",
			"ANALYTICS_LIBSQL_AUTH_TOKEN",
		],
		docs: ["docs/analytics-payment-reminders.md"],
	},
	{
		id: "customer-support",
		title: "客服、WhatsApp 与 AI 机器人",
		href: "/ops/support/settings",
		action: "查看客服配置状态",
		online: "客服设置页读取当前配置状态；会话工作台支持真实会话的回复、解决与重开。接入凭据在服务器配置。",
		deployment:
			"在 Chatwoot 为每个品牌创建独立 Account 和 Website Inbox，再填写品牌 Website Token 与独立 Agent API Token。WhatsApp 使用国际号码数字，不含加号和空格；AI 机器人另需品牌绑定、已审核 FAQ、模型、持久化存储和 Worker。",
		variables: [
			"SUPPORT_CHATWOOT_BASE_URL",
			"SUPPORT_CHATWOOT_SITES_JSON",
			"SUPPORT_CHATWOOT_AGENT_TOKENS_JSON",
			"SUPPORT_WHATSAPP_SITES_JSON",
			"SUPPORT_AI_BOTS_JSON",
			"SUPPORT_AI_FAQS_JSON",
			"SUPPORT_AI_MODEL_URL",
			"SUPPORT_AI_MODEL_NAME",
			"SUPPORT_AI_MODEL_API_KEY",
			"SUPPORT_AI_WORKER_SECRET",
			"ANALYTICS_LIBSQL_URL",
			"ANALYTICS_LIBSQL_AUTH_TOKEN",
		],
		docs: ["docs/customer-support.md", "docs/customer-support-ai.md"],
	},
	{
		id: "ads-tracking",
		title: "广告追踪与投递",
		href: "/ops/analytics/destinations",
		action: "查看品牌广告账户与投递",
		online: "按品牌查看 GA4、Meta 和 TikTok 的服务端账户与投递记录；此页不保存广告密钥。",
		deployment:
			"多品牌服务端账户通过 ADS_SERVER_SITES_JSON 绑定。浏览器公开像素 ID 仅用于单品牌部署，多品牌部署会关闭全局像素。配置同意策略与持久化投递记录，再到供应商测试事件工具核对真实接收。",
		variables: [
			"ADS_SERVER_SITES_JSON",
			"GA4_API_SECRET",
			"META_CONVERSIONS_API_TOKEN",
			"TIKTOK_EVENTS_API_ACCESS_TOKEN",
			"NEXT_PUBLIC_GA_MEASUREMENT_ID",
			"NEXT_PUBLIC_META_PIXEL_ID",
			"NEXT_PUBLIC_TIKTOK_PIXEL_ID",
			"NEXT_PUBLIC_GOOGLE_ADS_ID",
			"NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL",
			"NEXT_PUBLIC_ANALYTICS_CONSENT_MODE",
			"ANALYTICS_LIBSQL_URL",
			"ANALYTICS_LIBSQL_AUTH_TOKEN",
		],
		docs: ["docs/system-plugins.md"],
	},
	{
		id: "ai-translations",
		title: "AI 多语言",
		href: "/ops/translations",
		action: "打开多语言管理中心",
		online: "在管理中心创建翻译任务、审阅草稿和导出；发布到 Saleor 还需部署允许发布并具备对应权限。",
		deployment:
			"配置翻译数据库、专用 Saleor Token、AI 服务和 Worker 密钥，部署定时 Worker。语言与渠道范围沿用店铺配置，不通过此页面修改。",
		variables: [
			"TRANSLATION_LIBSQL_URL",
			"TRANSLATION_LIBSQL_AUTH_TOKEN",
			"TRANSLATION_SALEOR_TOKEN",
			"TRANSLATION_AI_BASE_URL",
			"TRANSLATION_AI_API_KEY",
			"TRANSLATION_AI_MODEL",
			"TRANSLATION_WORKER_SECRET",
			"TRANSLATION_PUBLISH_ENABLED",
		],
		docs: ["docs/translation-management-center.md"],
	},
	{
		id: "seo-merchant",
		title: "SEO 与 Google Merchant",
		href: "/ops/merchant",
		action: "查看 Merchant Feed 状态",
		online: "查看 Feed 开关、扫描限制与 SKU 排除前缀；基础 SEO 和商品结构化数据继续沿用店铺资料。",
		deployment:
			"在部署环境启用 Feed，设置扫描页数、预算与排除前缀。核对真实品牌域名和商品资料，再在 Google Merchant 验证 Feed。",
		variables: [
			"GOOGLE_MERCHANT_FEED_ENABLED",
			"GOOGLE_MERCHANT_FEED_MAX_PAGES",
			"GOOGLE_MERCHANT_FEED_BUDGET_MS",
			"GOOGLE_MERCHANT_EXCLUDE_SKU_PREFIXES",
		],
		docs: ["docs/seo-google-merchant.md"],
	},
];

export function configurationForViewer(viewer: OpsViewer): readonly ConfigurationSection[] {
	if (viewer.role !== "platform_admin") return [];
	return OPS_CONFIGURATION.filter((section) => isSaleorOpsRequestAllowed(viewer, section.href, "GET"));
}

export function configurationForPath(pathname: string): ConfigurationSection | undefined {
	return [...OPS_CONFIGURATION]
		.sort((left, right) => right.href.length - left.href.length)
		.find(
			(section) =>
				pathname === section.href ||
				pathname.startsWith(`${section.href}/`) ||
				(section.id === "customer-support" && pathname === "/ops/support"),
		);
}
