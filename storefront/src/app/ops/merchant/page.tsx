import { getOpsI18n } from "@/lib/ops/i18n.server";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { pluginPauseReason } from "@/plugins/system/runtime.server";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getOpsI18n();
	return {
		title: t("SEO 与 Google Merchant | Commerce Ops"),
		robots: { index: false, follow: false },
	};
}

function isFeedEnabled(): boolean {
	const value = process.env.GOOGLE_MERCHANT_FEED_ENABLED;
	return value === "true" || value === "1";
}

export default async function MerchantOperationsPage() {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	await connection();
	const pauseReason = pluginPauseReason("seo-merchant");
	const feedEnabled = isFeedEnabled();
	const maxPages = process.env.GOOGLE_MERCHANT_FEED_MAX_PAGES || "200";
	const budgetMs = process.env.GOOGLE_MERCHANT_FEED_BUDGET_MS || "60000";
	const excludedPrefixes = (process.env.GOOGLE_MERCHANT_EXCLUDE_SKU_PREFIXES ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	return (
		<main className="min-h-dvh bg-background px-5 py-8 text-foreground md:px-10">
			<div className="mx-auto max-w-4xl">
				<Link href="/ops/plugins" className="text-sm text-muted-foreground hover:text-foreground">
					{t("← 系统插件设置")}
				</Link>
				<header className="mb-8 mt-6">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						SEO · MERCHANT
					</p>
					<h1 className="mt-2 text-2xl font-semibold">{t("SEO 与 Google Merchant")}</h1>
					<p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
						{t(
							"管理 Merchant Feed 的运行状态与扫描限制。基础 SEO、canonical、sitemap 和商品结构化数据不受此 Feed 开关影响。",
						)}
					</p>
				</header>

				<section
					className="space-y-4 rounded-xl border border-border bg-card p-5"
					aria-labelledby="feed-status-title"
				>
					<h2 id="feed-status-title" className="font-semibold">
						{t("Feed 运行状态")}
					</h2>
					<dl className="grid gap-4 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground">{t("部署开关")}</dt>
							<dd className="mt-1 font-medium">{feedEnabled ? t("已启用") : t("未启用")}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("系统暂停")}</dt>
							<dd className="mt-1 font-medium">{pauseReason ? t("已暂停") : t("未暂停")}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("最大扫描页数")}</dt>
							<dd className="mt-1 font-mono">{maxPages}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t("扫描预算")}</dt>
							<dd className="mt-1 font-mono">{budgetMs} ms</dd>
						</div>
					</dl>
					{pauseReason && (
						<p className="rounded-lg bg-muted p-3 text-sm" role="status">
							{t("Feed 当前不可用（")}
							{pauseReason === "plugin_paused" ? t("部署配置暂停") : t("部署暂停配置无效")}
							{t("）；购物和基础 SEO 仍可使用。")}
						</p>
					)}
				</section>

				<section
					className="mt-4 rounded-xl border border-border bg-card p-5"
					aria-labelledby="feed-config-title"
				>
					<h2 id="feed-config-title" className="font-semibold">
						{t("部署配置")}
					</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{t(
							"Feed 启用、扫描预算和 SKU 排除前缀由部署环境统一管理，在所有 Storefront 实例同步设置后生效；此页面读取当前运行配置，不会伪装成在线修改。",
						)}
					</p>
					<p className="mt-4 text-sm">
						{t("排除前缀：")}
						{excludedPrefixes.length ? excludedPrefixes.join("、") : t("未配置")}
					</p>
					<code className="mt-4 block overflow-x-auto rounded-lg bg-muted p-3 text-xs">
						/merchant/google.xml?channel=&lt;channel&gt;&amp;locale=&lt;locale&gt;
					</code>
				</section>
			</div>
		</main>
	);
}
