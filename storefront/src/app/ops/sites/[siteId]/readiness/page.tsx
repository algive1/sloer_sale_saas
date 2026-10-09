import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { io } from "next/cache";
import { getBrandSites } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getCachedChannelsList } from "@/lib/channels/get-channels-data";
import { readTheme, themeDatabaseConfigured } from "@/plugins/theme-builder/store";

export const metadata: Metadata = {
  title: "品牌上线检查 | Commerce Ops",
  robots: { index: false, follow: false },
};
type Check = {
  label: string;
  status: "已验证" | "待验证" | "需处理";
  details: string;
};

export default function BrandReadinessPage({ params }: { params: Promise<{ siteId: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8 text-sm text-stone-500">正在载入品牌数据...</main>}>
      <BrandReadinessPageContent params={params} />
    </Suspense>
  );
}

async function BrandReadinessPageContent({ params }: { params: Promise<{ siteId: string }> }) {
  await io();
  const { siteId } = await params;
  const site = getBrandSites()?.find((item) => item.id === siteId);
  if (!site) notFound();

  const staticChannels = getStaticStorefrontChannelSlugs();
  const activeLocales = getStorefrontLocaleSlugs();
  const pairs = getConfiguredLocaleChannelPairs();
  const enabledLocales = pairs
    ? activeLocales.filter((locale) => pairs.some((pair) =>
        pair.channel === site.defaultChannel && pair.locale === locale))
    : [...activeLocales];
  const locale = site.defaultLocale && enabledLocales.includes(site.defaultLocale)
    ? site.defaultLocale : enabledLocales[0] ?? "en";

  // This read is allowed only in the platform owner's /ops section.
  // It verifies that brand-owned Channels exist in Saleor but does not
  // assume that the channel contains published products or active payments.
  let backendChannels: string[] | null = null;
  try {
    const response = await getCachedChannelsList();
    backendChannels = response?.channels?.map((channel) => channel.slug) ?? null;
  } catch (error) {
    console.error("[site-readiness] Saleor channel verification unavailable", error);
  }
  let themePublished: boolean | null = null;
  if (themeDatabaseConfigured() && enabledLocales.length && site.channels.includes(site.defaultChannel)) {
    try { themePublished = Boolean((await readTheme(site.defaultChannel, locale)).published); }
    catch (error) { console.error("[site-readiness] theme check failed", error); }
  }

  const platformMissing = site.channels.filter((channel) => !staticChannels.includes(channel));
  const registeredSaleor = new Set(backendChannels ?? []);
  const unrecognizedSaleor = backendChannels
    ? site.channels.filter((channel) => !registeredSaleor.has(channel))
    : [];
  const checks: Check[] = [
    {
      label: "品牌及域名映射",
      status: "已验证",
      details: `配置中已识别 ${site.name}，有 ${site.domains.length} 个已登记域名。这里只证明配置有效，不代表 DNS/HTTPS 已开通。`,
    },
    {
      label: "网站可访问市场",
      status: platformMissing.length ? "需处理" : "已验证",
      details: platformMissing.length
        ? `以下市场未加入网站 Channel 配置：${platformMissing.join("、")}。`
        : "所有品牌 Channel 都在网站公开的可访问市场名单中。",
    },
    {
      label: "Saleor Channel 可读取",
      status: !backendChannels ? "待验证" : unrecognizedSaleor.length ? "需处理" : "已验证",
      details: !backendChannels
        ? "尚无法通过服务器凭证查询 Saleor Channel。请配置或检查 SALEOR_APP_TOKEN。"
        : unrecognizedSaleor.length
          ? `Saleor 中未找到：${unrecognizedSaleor.join("、")}。`
          : "所有品牌市场在 Saleor Channel 列表中存在（未检验商品库存、支付或配送）。",
    },
    {
      label: "默认市场与语言",
      status: enabledLocales.length ? "已验证" : "需处理",
      details: enabledLocales.length
        ? `默认市场 ${site.defaultChannel} 可使用 ${enabledLocales.join("、")}，首页默认语言为 ${locale}。`
        : "默认市场没有可用语言组合，网站导航与装修将无法正常访问。",
    },
    {
      label: "首页装修与发布",
      status: themePublished ? "已验证" : "待验证",
      details: themePublished
        ? `${site.defaultChannel} / ${locale} 已存在发布版本。仍需打开品牌域名确认线上缓存和样式。`
        : !themeDatabaseConfigured()
          ? "尚未配置首页装修数据库。原有 Paper 页面可运行，但自定义装修无法保存发布。"
          : "默认市场尚无已验证的发布版本，或装修数据库暂不可访问。",
    },
    {
      label: "域名 DNS 与 HTTPS",
      status: "待验证",
      details: "必须从公网检查每个域名的 DNS 解析、TLS 证书及正确的品牌页面。登记域名不等于已生效。",
    },
    {
      label: "真实商品、运费与支付",
      status: "待验证",
      details: "必须使用目标市场验证商品上架、库存、运费、真实支付渠道、订单创建和退款路径。",
    },
    {
      label: "邮件、广告与品牌数据隔离",
      status: "待验证",
      details: "必须验证品牌邮件身份、客服、广告像素、提醒规则、账户隐私与经营报表。共享 Saleor Core 不自动隔离客户身份。",
    },
  ];
  const done = checks.filter(check => check.status === "已验证").length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 text-[#171717] md:px-10">
      <Link href="/ops/sites" className="text-sm text-stone-500 hover:text-stone-900">← 返回品牌站点</Link>
      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">STORE LAUNCH CHECKLIST</p>
        <h1 className="mt-2 text-2xl font-semibold">{site.name} · 上线前检查</h1>
        <p className="mt-2 text-sm text-stone-600">
          {done} / {checks.length} 项已有部分系统验证结果；标记为已验证的配置项，也不代表整个网站可以上线。
        </p>
      </div>
      <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
        <p className="font-semibold">当前状态：待上线验收</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          当前检查只自动核对品牌映射、可用 Channel、语言及首页草稿等已有数据。
          DNS、证书、支付、发货和跨品牌账户权限仍需独立验收，不能通过这个页面直接宣布已上线。
        </p>
      </div>
      <section className="mt-5 space-y-3" aria-label="上线检查步骤">
        {checks.map((check, index) => (
          <article key={check.label} className="rounded-xl border border-stone-200 bg-white px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{index + 1}. {check.label}</h2>
              <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{check.status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">{check.details}</p>
          </article>
        ))}
      </section>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        {enabledLocales.length > 0 && (
          <Link className="font-semibold underline underline-offset-4"
            href={`/ops/themes?channel=${encodeURIComponent(site.defaultChannel)}&locale=${encodeURIComponent(locale)}`}>
            前往首页装修 →
          </Link>
        )}
        <Link className="font-semibold underline underline-offset-4"
          href={`/ops/sites/${encodeURIComponent(site.id)}`}>查看品牌经营概况 →</Link>
      </div>
    </main>
  );
}
