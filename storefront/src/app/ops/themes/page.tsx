import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
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

export default function ThemeEditorPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#f6f7f9] px-5 py-8 text-sm text-stone-500">
        正在载入品牌装修...
      </main>
    }>
      <ThemeEditorContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ThemeEditorContent({ searchParams }: PageProps) {
  const [availableChannels, query] = await Promise.all([getStorefrontChannelSlugs(), searchParams]);
  const sites = getBrandSites();
  const pairs = getConfiguredLocaleChannelPairs();
  // Only offer Channels that are assigned to a brand and serve at least one
  // published locale when an explicit market-language matrix is configured.
  const channels = availableChannels.filter((channel) =>
    (!sites || sites.some((site) => site.channels.includes(channel))) &&
    (!pairs || pairs.some((pair) => pair.channel === channel)),
  );
  const locales = [...getStorefrontLocaleSlugs()];
  const localesByChannel: Record<string, string[]> = Object.fromEntries(
    channels.map((channel) => [channel, pairs
      ? locales.filter((locale) => pairs.some((pair) => pair.channel === channel && pair.locale === locale))
      : locales]),
  );
  const siteByChannel = Object.fromEntries((sites ?? []).flatMap((site) =>
    site.channels.filter((channel) => channels.includes(channel)).map((channel) => [
      channel,
      { id: site.id, name: site.name, domain: site.domains[0], defaultChannel: site.defaultChannel, defaultLocale: site.defaultLocale },
    ]),
  ));
  const initialChannel = query.channel ?? (sites?.[0]?.defaultChannel && channels.includes(sites[0].defaultChannel)
    ? sites[0].defaultChannel : channels[0] ?? "");
  const selectedSite = sites?.find((site) => site.channels.includes(initialChannel));
  const allowedLocales = localesByChannel[initialChannel] ?? locales;
  const initialLocale = query.locale ?? (selectedSite?.defaultLocale && allowedLocales.includes(selectedSite.defaultLocale)
    ? selectedSite.defaultLocale : allowedLocales[0] ?? locales[0] ?? "en");

  // Invalid/deep-linked channel+locale pairs must never edit an unrelated
  // brand or create an unreachable market-language homepage.
  if ((query.channel && !channels.includes(query.channel)) ||
      (query.locale && !allowedLocales.includes(query.locale))) notFound();

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
        localesByChannel={localesByChannel}
        storageReady={themeDatabaseConfigured()}
        siteByChannel={siteByChannel}
      />
    </main>
  );
}
