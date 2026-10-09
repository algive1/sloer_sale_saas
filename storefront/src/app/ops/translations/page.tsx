import type { Metadata } from "next";
import Link from "next/link";
import { getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { translationDatabaseConfigured } from "@/plugins/ai-translations/store";
import { TranslationCenter } from "./translation-center";
import msg_en from "../../../../messages/en.json";
import msg_de from "../../../../messages/de.json";
import msg_fr from "../../../../messages/fr.json";
import msg_nl from "../../../../messages/nl.json";
import msg_da from "../../../../messages/da.json";
import msg_sv from "../../../../messages/sv.json";
import msg_es from "../../../../messages/es.json";
import msg_it from "../../../../messages/it.json";
import msg_pl from "../../../../messages/pl.json";
import msg_pt from "../../../../messages/pt.json";
import msg_cs from "../../../../messages/cs.json";
import msg_ja from "../../../../messages/ja.json";
import msg_fi from "../../../../messages/fi.json";
import msg_nb from "../../../../messages/nb.json";
import msg_ko from "../../../../messages/ko.json";

// Explicit imports avoid Next server dynamic-import contexts during PPR replay.
const UI_CATALOGS: Record<string, unknown> = {
  en: msg_en,
  de: msg_de,
  fr: msg_fr,
  nl: msg_nl,
  da: msg_da,
  sv: msg_sv,
  es: msg_es,
  it: msg_it,
  pl: msg_pl,
  pt: msg_pt,
  cs: msg_cs,
  ja: msg_ja,
  fi: msg_fi,
  nb: msg_nb,
  ko: msg_ko,
};

export const metadata:Metadata={
  title:"多语言管理中心 | Commerce Ops",robots:{index:false,follow:false},
};
const flatten=(value:unknown,prefix="",out:Record<string,string>={})=>{
  if(typeof value==="string")out[prefix]=value;
  else if(value&&typeof value==="object"&&!Array.isArray(value)) {
    for(const [key,child] of Object.entries(value))flatten(child,prefix?prefix+"."+key:key,out);
  }
  return out;
};
export default async function TranslationCenterPage() {
  const channels=getStaticStorefrontChannelSlugs();
  const sites=getBrandSites()??[{
    id:siteIdForChannel(channels[0]??""),
    name:"默认店铺",channels,defaultChannel:channels[0]??"",
  }];
  const pairs=getConfiguredLocaleChannelPairs();
  const locales=getStorefrontLocaleSlugs();
  const base=flatten(msg_en),keys=Object.keys(base);
  const coverage=locales.map(locale=>{
    const catalog=UI_CATALOGS[locale];
    const values=catalog?flatten(catalog):{};
    const present=keys.filter(key=>typeof values[key]==="string"&&values[key].trim()).length;
    return {locale,present,total:keys.length};
  });
  const brands=sites.map(site=>({
    id:site.id,name:site.name,channels:site.channels.filter(c=>channels.includes(c)),
    localesByChannel:Object.fromEntries(site.channels.map(c=>[c,locales.filter(l=>
      !pairs||pairs.some(p=>p.channel===c&&p.locale===l))])),
  }));
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-6 text-[#171717] md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/ops/plugins" className="text-sm text-stone-500 hover:text-stone-900">← 系统插件</Link>
        <header className="mt-5 mb-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Localization / Operations</p>
          <h1 className="mt-2 text-2xl font-semibold">多语言管理中心</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">
            查看前台文案覆盖率，按品牌与销售市场创建 AI 商品翻译任务，逐条审核后受控发布。
          </p>
        </header>
        <TranslationCenter brands={brands} coverage={coverage}
          storageReady={translationDatabaseConfigured()}
          workerReady={(process.env.TRANSLATION_WORKER_SECRET?.trim().length??0)>=32 &&
            Boolean(process.env.TRANSLATION_AI_BASE_URL&&process.env.TRANSLATION_AI_API_KEY&&process.env.TRANSLATION_AI_MODEL)}
          publisherReady={process.env.TRANSLATION_PUBLISH_ENABLED==="1"&&
            Boolean(process.env.TRANSLATION_SALEOR_TOKEN)&&sites.length===1}
          saleorReady={Boolean(process.env.TRANSLATION_SALEOR_TOKEN)}
        />
      </div>
    </main>
  );
}
