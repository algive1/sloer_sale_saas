import type { Metadata } from "next";
import Link from "next/link";
import { getBrandSites } from "@/config/brand-sites";
import { parseChatwootSupportConfig } from "@/plugins/customer-support/config";

export const metadata: Metadata = { title: "在线客服 | Commerce Ops", robots: { index: false, follow: false } };

/** Read-only configuration visibility, not a fake provisioning/settings form. */
export default function SupportPage() {
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

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <Link href="/ops/plugins" className="text-sm text-muted-foreground hover:underline">← 系统插件</Link>
      <h1 className="my-5 text-2xl font-semibold">在线客服 · Chatwoot</h1>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">接入状态：{ready ? "已配置" : "未就绪"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ready ? "已通过本地品牌绑定校验；实时连接和 Chatwoot 服务健康状态仍需实测。" : reason}
        </p>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold underline">
          打开 Chatwoot 客服工作台 ↗
        </a>}
      </section>
      <section className="mt-5 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">品牌客服绑定</h2>
        <p className="mt-2 text-sm text-muted-foreground">系统级插件统一部署。每个品牌须有独立 Chatwoot Account 和网站 Inbox；不展示公开网站 Token。</p>
        <ul className="mt-4 space-y-3">
          {expectedIds.map((siteId) => (
            <li key={siteId} className="flex items-center justify-between gap-3 border-b pb-3 text-sm">
              <span>{brands?.find((brand) => brand.id === siteId)?.name ?? siteId}</span>
              <span className="text-muted-foreground">{ready ? "已映射（待端到端验证）" : "未配置"}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-5 text-sm text-muted-foreground">
        当前阶段仅支持游客网站实时聊天。客户订单、身份绑定、消息 Webhook 和自动化客服尚未接入。
        配置与生产验收说明参见仓库 docs/customer-support.md。
      </p>
    </main>
  );
}
