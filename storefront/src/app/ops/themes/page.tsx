import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { activeThemeSiteId, themeDatabaseConfigured } from "@/plugins/theme-builder/store";
import { ThemeEditor } from "./theme-editor";
import { getBrandSites } from "@/config/brand-sites";

export const metadata: Metadata = {
  title: "品牌首页装修 | Commerce Ops",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ channel?: string; locale?: string }>;
};

export default async function ThemeEditorPage({ searchParams }: PageProps) {
  const [availableChannels, query] = await Promise.all([getStorefrontChannelSlugs(), searchParams]);
  const sites = getBrandSites();
  // Do not offer unmapped Channels when several brands share Saleor Core.
  const channels = sites
    ? availableChannels.filter((channel) => sites.some((site) => site.channels.includes(channel)))
    : availableChannels;
  const locales = [...getStorefrontLocaleSlugs()];
  const siteByChannel = Object.fromEntries((sites ?? []).flatMap((site) =>
    site.channels.filter((channel) => channels.includes(channel)).map((channel) => [
      channel,
      { id: site.id, name: site.name, domain: site.domains[0], defaultLocale: site.defaultLocale },
    ]),
  ));
  const initialChannel = query.channel ?? (sites?.[0]?.defaultChannel && channels.includes(sites[0].defaultChannel)
    ? sites[0].defaultChannel : channels[0] ?? "");
  const selectedSite = sites?.find((site) => site.channels.includes(initialChannel));
  const initialLocale = query.locale ?? (selectedSite?.defaultLocale && locales.includes(selectedSite.defaultLocale)
    ? selectedSite.defaultLocale : locales[0] ?? "en");

  // Invalid/deep-linked channel and locale must not silently edit another brand.
  if ((query.channel && !channels.includes(query.channel)) ||
      (query.locale && !locales.includes(query.locale))) notFound();

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#171717]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4 md:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">STORE DESIGN / HOMEPAGE</p>
          <h1 className="mt-1 text-xl font-semibold">品牌网站首页装修</h1>
          <p className="mt-1 text-xs text-stone-500">先选择品牌，再选择市场和语言；每个组合有独立草稿与发布版本。</p>
        </div>
        <Link href="/ops/sites" className="rounded-lg border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50">
          返回品牌站点
        </Link>
      </header>
      <ThemeEditor
        channels={channels}
        locales={locales}
        siteId={initialChannel ? activeThemeSiteId(initialChannel) : "unconfigured"}
        initialChannel={initialChannel}
        initialLocale={initialLocale}
        storageReady={themeDatabaseConfigured()}
        siteByChannel={siteByChannel}
      />
    </main>
  );
}
