import type { Metadata } from "next";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { activeThemeSiteId, themeDatabaseConfigured } from "@/lib/theme-builder/store";
import { ThemeEditor } from "./theme-editor";

export const metadata: Metadata = {
  title: "店铺装修 | Commerce Ops",
  robots: { index: false, follow: false },
};

export default async function ThemeEditorPage() {
  const channels = await getStorefrontChannelSlugs();
  const locales = [...getStorefrontLocaleSlugs()];
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#171717]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4 md:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">STORE DESIGN / 01</p>
          <h1 className="mt-1 text-xl font-semibold">店铺可视化装修</h1>
          <p className="mt-1 text-xs text-stone-500">Puck · Shopify 风格区块编辑 · 首期支持服饰首页</p>
        </div>
        <a href="/ops/analytics" className="rounded-lg border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50">
          返回经营后台
        </a>
      </header>
      <ThemeEditor channels={channels} locales={locales} siteId={activeThemeSiteId()}
        storageReady={themeDatabaseConfigured()} />
    </main>
  );
}
