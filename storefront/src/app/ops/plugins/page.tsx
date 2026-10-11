import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import { PAUSABLE_SYSTEM_PLUGINS, parseSystemPluginPolicy, systemPluginPauseReason, type PausableSystemPluginId } from "@/plugins/system/policy";
import { listSystemPlugins, type SystemPluginId } from "@/plugins/system/registry";

export const metadata: Metadata = {
  title: "系统插件 | Commerce Ops",
  robots: { index: false, follow: false },
};

// Static admin-only destinations; this page does not inspect merchant data.
const labels: Record<SystemPluginId, { name: string; href?: string }> = {
  "theme-builder": { name: "可视化装修", href: "/ops/themes" },
  analytics: { name: "经营数据分析", href: "/ops/analytics" },
  "ads-tracking": { name: "广告追踪" },
  "payment-reminders": { name: "支付催付", href: "/ops/analytics/reminders" },
  "seo-merchant": { name: "SEO 与 Google Merchant" },
  "ai-translations": { name: "AI 多语言管理中心", href: "/ops/translations" },
  "customer-support": { name: "在线客服 · Chatwoot", href: "/ops/support" },
};

/**
 * Plugin metadata is static and never queried during a customer's page view.
 * Deployment pause is request-scoped; extraction status is a separate fact.
 */
export default function SystemPluginsPage() {
  return <Suspense fallback={<p className="p-8" role="status">正在读取系统插件状态…</p>}><PluginStatus /></Suspense>;
}
async function PluginStatus() {
  await io();
  const policy = parseSystemPluginPolicy(process.env.SYSTEM_PLUGINS_DISABLED);
  const plugins = listSystemPlugins();
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/ops/analytics" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回经营后台
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">System extensions</p>
          <h1 className="mt-2 text-2xl font-semibold">系统插件</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            所有系统级插件统一部署，并默认适用于全部店铺。不同店铺的数据权限与配置必须独立校验。
            此处区分代码已集成、模块化程度与系统暂停状态。是否具备服务凭证及实际业务验收，请继续检查各功能页面。
          </p>
        </header>
        <section className="mb-6 space-y-3 rounded-xl border border-border bg-card p-5 text-sm" aria-label="系统暂停说明">
          <h2 className="font-semibold">系统级暂停</h2>
          <p className="text-muted-foreground">部署配置 SYSTEM_PLUGINS_DISABLED 使用插件 ID 的 JSON 数组，重启所有 Storefront 实例后生效。暂停阻止新增工作、后台修改及对应前台扩展；历史资料保留可读，基础商品、购物车和结账继续使用 Paper。没有按品牌安装或卸载开关。</p>
          <p className="break-all font-mono text-xs">例如：[&quot;payment-reminders&quot;,&quot;ai-translations&quot;]</p>
          <p className="text-muted-foreground">7 个扩展均支持暂停。经营分析暂停新增采集，历史报告仍可读；广告追踪暂停浏览器及服务器接收端；seo-merchant 仅暂停 Merchant Feed，基础 metadata、canonical、sitemap 与商品结构化数据继续保留。</p>
          {!policy.valid && <p role="alert">暂停配置无效：7 个扩展已停止新增工作。请检查 ID、JSON 格式与重复项；不会回退为启用。</p>}
        </section>
        <section className="grid gap-4 md:grid-cols-2" aria-label="系统插件列表">
          {plugins.map((plugin) => {
            const details = labels[plugin.id as SystemPluginId];
            const status = plugin.integration === "storefront-module"
              ? "已模块化"
              : plugin.integration === "partial"
                ? "部分模块化"
                : "现有路径运行";
            const pausable = PAUSABLE_SYSTEM_PLUGINS.some(id => id === plugin.id);
            const pause = pausable ? systemPluginPauseReason(plugin.id as PausableSystemPluginId, policy) : null;
            return (
              <article key={plugin.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{details.name}</h2>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{plugin.id}</p>
                  </div>
                  <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {status}
                  </span>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  源码已集成 · 系统级 · 全部店铺 · 扩展协议 v{plugin.apiVersion}
                </p>
                <p className="mt-3 text-sm font-semibold">{!pausable ? "统一暂停尚未接入" : pause === "plugin_configuration_invalid" ? "已暂停：部署配置无效" : pause ? "已暂停：部署控制" : "系统允许运行（仍需业务配置）"}</p>
                {pause && <p className="mt-2 text-xs text-muted-foreground">{plugin.id === "analytics" ? "新增采集已停止，报告仅显示历史事件；原生订单仍可操作。" : plugin.id === "ads-tracking" ? "新的像素加载和服务器派发已停止，已有投递记录仍可查看。" : plugin.id === "seo-merchant" ? "Merchant Feed 已暂停；基础 SEO 和商品结构化数据继续保留。" : "已有记录可查看；新任务、发送、发布和保存暂不可用。恢复不会自动重试结果不明的发送。"}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {plugin.capabilities.map((capability) => (
                    <span key={capability} className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {capability}
                    </span>
                  ))}
                </div>
                {details.href && (
                  <Link href={details.href} aria-label={`打开${details.name}`} className="mt-5 inline-block text-sm font-semibold text-foreground underline underline-offset-4 hover:text-foreground">
                    打开功能 →
                  </Link>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
