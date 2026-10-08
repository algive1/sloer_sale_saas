import type { Metadata } from "next";
import Link from "next/link";
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
};

/**
 * Plugin metadata is static and never queried during a customer's page view.
 * The list reflects code extraction status, not on/off controls or App installs.
 */
export default function SystemPluginsPage() {
  const plugins = listSystemPlugins();
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-8 text-[#171717] md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/ops/analytics" className="text-sm text-stone-500 hover:text-stone-950">
          ← 返回经营后台
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">System extensions</p>
          <h1 className="mt-2 text-2xl font-semibold">系统插件</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            所有系统级插件统一部署，并默认适用于全部店铺。不同店铺的数据权限与配置必须独立校验。
            此处展示功能及代码迁移状态，不提供按店铺安装、关闭或卸载操作。
          </p>
        </header>
        <section className="grid gap-4 md:grid-cols-2" aria-label="系统插件列表">
          {plugins.map((plugin) => {
            const details = labels[plugin.id as SystemPluginId];
            const extracted = plugin.integration === "storefront-module";
            return (
              <article key={plugin.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{details.name}</h2>
                    <p className="mt-1 font-mono text-xs text-stone-500">{plugin.id}</p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                    {extracted ? "已模块化" : "现有路径运行"}
                  </span>
                </div>
                <p className="mt-4 text-xs text-stone-500">
                  系统级 · 全部店铺 · 扩展协议 v{plugin.apiVersion}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plugin.capabilities.map((capability) => (
                    <span key={capability} className="rounded-md bg-stone-50 px-2 py-1 font-mono text-[11px] text-stone-500">
                      {capability}
                    </span>
                  ))}
                </div>
                {details.href && (
                  <Link href={details.href} className="mt-5 inline-block text-sm font-semibold text-stone-800 underline underline-offset-4 hover:text-black">
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
