import type { Metadata } from "next";
import Link from "next/link";
import { brandConfig } from "@/config/brand";
import { getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";

export const metadata: Metadata = {
  title: "品牌站点 | Commerce Ops",
  robots: { index: false, follow: false },
};

/** Platform-owner catalog: no fake tenant administration or install switches. */
export default function BrandSitesPage() {
  const configured = getBrandSites();
  const channels = getStaticStorefrontChannelSlugs();
  const sites = configured ?? [{
    id: siteIdForChannel(channels[0] ?? ""),
    name: brandConfig.siteName,
    domains: [] as string[],
    channels,
    defaultChannel: channels[0] ?? "",
    description: brandConfig.description,
  }];

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-8 text-[#171717] md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/ops/analytics" className="text-sm text-stone-500 hover:text-stone-950">
          ← 返回经营后台
        </Link>
        <header className="mb-7 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Multi-brand commerce</p>
          <h1 className="mt-2 text-2xl font-semibold">品牌站点</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            所有品牌共享平台的系统级插件。品牌、域名与销售 Channel 在服务端配置，
            此页只显示配置，不提供未经授权的跨品牌读写或虚假的启停开关。
          </p>
        </header>
        <div className="mb-6 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          {configured
            ? "多品牌域名映射已配置。订单、账号、Analytics、广告、提醒、SEO 尚需完成全链路站点隔离，当前不得作为生产多租户环境上线。"
            : "当前为单品牌模式。保持现有域名与销售市场配置不变；如需多品牌同进程，请先完成全链路隔离。"}
        </div>
        <section className="grid gap-4 md:grid-cols-2" aria-label="品牌站点列表">
          {sites.map((site) => (
            <article key={site.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{site.name}</h2>
                  <p className="mt-1 font-mono text-xs text-stone-500">site_id: {site.id}</p>
                </div>
                <span className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-600">
                  系统插件全部适用
                </span>
              </div>
              {"description" in site && site.description ? (
                <p className="mb-4 text-sm text-stone-600">{site.description}</p>
              ) : null}
              <p className="text-xs font-semibold text-stone-500">域名</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {site.domains.length > 0 ? site.domains.map((domain) => (
                  <span key={domain} className="rounded-md bg-stone-50 px-2 py-1 font-mono text-xs">{domain}</span>
                )) : <span className="text-sm text-stone-500">当前部署域名</span>}
              </div>
              <p className="mt-5 text-xs font-semibold text-stone-500">销售市场 / Channel</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {site.channels.map((channel) => (
                  <span key={channel} className="rounded-md border border-stone-200 px-2 py-1 font-mono text-xs">{channel}</span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-4 border-t border-stone-100 pt-4 text-sm">
                <Link href="/ops/themes" className="font-semibold underline underline-offset-4">进入装修管理 →</Link>
                {site.domains[0] && site.defaultChannel ? (
                  <a href={`https://${site.domains[0]}/${"defaultLocale" in site ? (site.defaultLocale ?? "en") : "en"}/${site.defaultChannel}`}
                    target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                    查看站点 ↗
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
