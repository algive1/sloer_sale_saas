import type { Metadata } from "next";
import Link from "next/link";
import { brandConfig } from "@/config/brand";
import { getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";

export const metadata: Metadata = {
  title: "品牌站点 | Commerce Ops",
  robots: { index: false, follow: false },
};

/**
 * Read-only until tenant-scoped CRUD and publishing checks are available.
 * No fake "online" state: DNS, TLS and checkout readiness are not verified.
 */
export default function BrandSitesPage() {
  const configured = getBrandSites();
  const channels = getStaticStorefrontChannelSlugs();
  const locales = getStorefrontLocaleSlugs();
  const localePairs = getConfiguredLocaleChannelPairs();
  const sites = configured ?? [{
    id: siteIdForChannel(channels[0] ?? ""),
    name: brandConfig.siteName,
    domains: [] as string[],
    channels,
    defaultChannel: channels[0] ?? "",
    description: brandConfig.description,
  }];

  const allowedLocalesFor = (site: (typeof sites)[number]) => localePairs
    ? locales.filter((locale) => localePairs.some((pair) =>
        pair.channel === site.defaultChannel && pair.locale === locale))
    : [...locales];

  const defaultLocaleFor = (site: (typeof sites)[number]) => {
    const allowed = allowedLocalesFor(site);
    const preferred = "defaultLocale" in site ? site.defaultLocale : undefined;
    return typeof preferred === "string" && allowed.includes(preferred)
      ? preferred : allowed[0] ?? "en";
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-8 text-[#171717] md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/ops/analytics" className="text-sm text-stone-500 hover:text-stone-950">
          ← 返回经营后台
        </Link>
        <header className="mb-7 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Brand sites</p>
          <h1 className="mt-2 text-2xl font-semibold">品牌站点</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            一个后台管理多个品牌。每个品牌拥有自己的域名、市场和首页装修；系统插件统一部署。
          </p>
        </header>
        <section className="mb-6 rounded-xl border border-stone-200 bg-white p-5 text-sm leading-6">
          <h2 className="font-semibold">品牌上线前需要完成什么？</h2>
          <p className="mt-2 text-stone-600">
            先在 Saleor 创建并启用销售 Channel，再绑定域名与品牌，装修并发布首页，最后测试商品、
            支付、订单和邮件。目前品牌信息由部署配置维护，此页面为只读概览，暂不提供新增或编辑。
          </p>
          <p className="mt-2 text-stone-500">
            {configured
              ? "已加载多品牌映射。域名是否解析成功、HTTPS 是否生效、支付是否可用，仍需分别验证；这里不代表网站已上线。"
              : "当前为单品牌模式。现有网站不受影响，多品牌发布前仍需完成安全和数据隔离验收。"}
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-2" aria-label="品牌站点列表">
          {sites.map((site) => {
            const locale = defaultLocaleFor(site);
            const canEditHomepage = Boolean(site.defaultChannel && allowedLocalesFor(site).length);
            const editUrl = `/ops/themes?channel=${encodeURIComponent(site.defaultChannel)}&locale=${encodeURIComponent(locale)}`;
            const homeUrl = site.domains[0] && site.defaultChannel
              ? `https://${site.domains[0]}/${locale}/${site.defaultChannel}`
              : null;
            return (
              <article key={site.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{site.name}</h2>
                    <p className="mt-1 font-mono text-xs text-stone-500">ID: {site.id}</p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-600">
                    {configured ? "已配置 · 待上线验证" : "单品牌模式"}
                  </span>
                </div>
                {"description" in site && site.description ? (
                  <p className="mb-4 text-sm text-stone-600">{site.description}</p>
                ) : null}
                <p className="text-xs font-semibold text-stone-500">品牌域名</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {site.domains.length ? site.domains.map(domain => (
                    <span key={domain} className="rounded-md bg-stone-50 px-2 py-1 font-mono text-xs">{domain}</span>
                  )) : <span className="text-sm text-stone-500">使用当前部署的域名</span>}
                </div>
                <p className="mt-5 text-xs font-semibold text-stone-500">
                  销售市场（{site.channels.length}） · 默认：{site.defaultChannel || "未配置"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {site.channels.map(channel => (
                    <span key={channel} className="rounded-md border border-stone-200 px-2 py-1 font-mono text-xs">{channel}</span>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-4 border-t border-stone-100 pt-4 text-sm">
                  {canEditHomepage ? (
                    <Link href={editUrl} className="font-semibold underline underline-offset-4">
                      装修此品牌首页 →
                    </Link>
                  ) : (
                    <span className="text-stone-500">请先为默认市场配置可用语言，再装修首页</span>
                  )}
                  {homeUrl && (
                    <a href={homeUrl} target="_blank" rel="noopener noreferrer"
                      title="需要域名与 HTTPS 已生效；该链接不代表站点已上线"
                      className="font-semibold underline underline-offset-4">
                      打开品牌域名 ↗
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
