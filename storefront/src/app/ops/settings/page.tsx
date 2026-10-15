import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpsI18n } from "@/lib/ops/i18n.server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { isSaleorOpsRequestAllowed } from "@/lib/ops/authorization";
import { configurationForViewer } from "@/lib/ops/configuration";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getOpsI18n();
	return { title: t("配置中心 | Commerce Ops"), robots: { index: false, follow: false } };
}

export default function OpsSettingsPage() {
	return (
		<Suspense
			fallback={
				<main className="mx-auto max-w-5xl px-5 py-8" aria-busy="true">
					<div className="animate-pulse space-y-5" aria-hidden="true">
						<div className="h-8 w-48 rounded bg-muted" />
						<div className="h-4 max-w-xl rounded bg-muted" />
						<div className="h-64 rounded-xl border border-border bg-card" />
					</div>
				</main>
			}
		>
			<ConfigurationContent />
		</Suspense>
	);
}

async function ConfigurationContent() {
	const viewer = await currentOpsViewer();
	if (!viewer || !isSaleorOpsRequestAllowed(viewer, "/ops/settings", "GET")) notFound();
	const sections = configurationForViewer(viewer);
	if (!sections.length) notFound();
	const { t } = await getOpsI18n();
	return (
		<main className="mx-auto max-w-5xl px-5 py-8" data-testid="ops-configuration">
			<header>
				<h1 className="text-2xl font-semibold">{t("配置中心")}</h1>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					{t("选择功能，直达现有管理页面或按步骤完成部署接入。此处只展示配置说明，不读取或显示服务密钥。")}
				</p>
			</header>
			<nav className="mt-5 flex flex-wrap gap-2" aria-label={t("配置功能索引")}>
				{sections.map((section) => (
					<a
						key={section.id}
						href={`#${section.id}`}
						className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
					>
						{t(section.title)}
					</a>
				))}
			</nav>
			<section
				className="mt-6 rounded-xl border border-border bg-card p-5"
				aria-labelledby="deployment-guide"
			>
				<h2 id="deployment-guide" className="font-semibold">
					{t("部署配置在哪里修改")}
				</h2>
				<ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
					<li>
						{t("本地开发：编辑 storefront/.env.local，参照 storefront/.env.example，然后重启开发进程。")}
					</li>
					<li>
						{t(
							"Docker 部署：编辑仓库根目录 .env，核对 Compose 对应服务的 environment 和 build.args；运行时配置需重新创建 Storefront 容器，Worker 使用的配置也需同步。",
						)}
					</li>
					<li>
						{t(
							"NEXT_PUBLIC_ 变量在构建时注入；修改后重新构建并部署镜像。所有实例使用一致配置，密钥只通过服务器环境或密钥管理注入。",
						)}
					</li>
					<li>
						{t(
							"回到对应功能页检查配置状态，再执行真实服务验收。格式校验通过不代表消息、邮件、广告或支付已实际成功。",
						)}
					</li>
				</ol>
			</section>
			<div className="mt-6 space-y-5">
				{sections.map((section) => (
					<section
						key={section.id}
						id={section.id}
						className="scroll-mt-5 rounded-xl border border-border bg-card p-5"
						data-testid={`configuration-${section.id}`}
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="text-lg font-semibold">{t(section.title)}</h2>
							{/* Full navigation retains the theme editor's unsaved-draft protection. */}
							<a
								href={section.href}
								className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
							>
								{t(section.action)} ↗
							</a>
						</div>
						<dl className="mt-4 space-y-4 text-sm leading-6">
							<div>
								<dt className="font-semibold">{t("管理页面可操作")}</dt>
								<dd className="mt-1 text-muted-foreground">{t(section.online)}</dd>
							</div>
							<div>
								<dt className="font-semibold">{t("部署接入步骤")}</dt>
								<dd className="mt-1 text-muted-foreground">{t(section.deployment)}</dd>
							</div>
						</dl>
						<h3 className="mt-4 text-sm font-semibold">{t("对应环境变量")}</h3>
						<ul className="mt-2 flex flex-wrap gap-2">
							{section.variables.map((variable) => (
								<li key={variable} className="min-w-0 max-w-full rounded-md bg-muted px-2 py-1">
									<code className="break-all text-xs">{variable}</code>
								</li>
							))}
						</ul>
						<p className="mt-4 break-words text-xs leading-5 text-muted-foreground">
							{t("完整格式与验收：")}
							{section.docs.join(" · ")}
						</p>
					</section>
				))}
			</div>
			{isSaleorOpsRequestAllowed(viewer, "/ops/plugins", "GET") && (
				<p className="mt-6 text-sm text-muted-foreground">
					{t("系统暂停通过 SYSTEM_PLUGINS_DISABLED 统一控制，重新创建全部实例后生效。")}{" "}
					<Link href="/ops/plugins" className="font-semibold underline">
						{t("查看系统插件与暂停状态")}
					</Link>
				</p>
			)}
		</main>
	);
}
