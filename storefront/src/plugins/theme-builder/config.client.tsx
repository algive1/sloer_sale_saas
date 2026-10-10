"use client";

import type { Config } from "@puckeditor/core";
import type { ReactNode } from "react";
import { collectionField, productField, imageField, linkField } from "./fields.client";
import { ProductCanvasPreview } from "./product-preview.client";
import { CollectionCanvasPreview } from "./collection-preview.client";

const showcase = (title: string, imageUrl: string, children: ReactNode) => {
  const hasPhoto = imageUrl.startsWith("https://");
  return (
    <section className={hasPhoto
      ? "relative isolate min-h-[580px] overflow-hidden bg-stone-900 text-white"
      : "grid min-h-[580px] overflow-hidden bg-white text-stone-900 lg:grid-cols-2"}>
      {hasPhoto ? (
        <>
          <div className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: "url(" + JSON.stringify(imageUrl) + ")" }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-900/80 via-stone-900/30 to-transparent" />
        </>
      ) : null}
      <div className={hasPhoto
        ? "relative mx-auto flex min-h-[580px] max-w-7xl flex-col items-start justify-end px-8 pb-20 pt-24"
        : "flex min-h-[580px] flex-col items-start justify-center px-8 py-16 lg:px-16"}>
        <span className={"mb-4 text-xs uppercase tracking-[0.35em] " + (hasPhoto ? "text-white/85" : "text-stone-500")}>{title}</span>
        {children}
      </div>
      {!hasPhoto && (
        <div className="flex min-h-[360px] items-center justify-center bg-stone-100 px-10 text-center text-sm text-stone-400">
          The hero image comes from the first Saleor collection product when no banner image is set.
        </div>
      )}
    </section>
  );
};
/**
 * Client-safe authoring config. Saleor is intentionally not fetched in the browser
 * editor; the published Server Component config binds collections to real products.
 */
export const fashionEditorConfig: Config = {
  categories: {
    merchandise: { title: "商品与营销", components: ["Hero", "Collection", "Product"] },
    editorial: { title: "图文与品牌", components: ["Editorial", "Story"] },
  },
  components: {
    Hero: {
      label: "首页大横幅",
      fields: {
        eyebrow: { type: "text", label: "上方小标题" },
        heading: { type: "text", label: "主标题" },
        subheading: { type: "textarea", label: "副标题说明" },
        imageUrl: { type: "text", label: "横幅背景图片" },
        collectionSlug: { type: "text", label: "默认图片所属商品集合" },
        ctaLabel: { type: "text", label: "按钮文字" },
        ctaHref: { type: "text", label: "按钮跳转页面" },
      },
      defaultProps: {
        eyebrow: "THE NEW EDIT",
        heading: "Discover your signature style.",
        subheading: "A fresh approach to timeless clothing.",
        imageUrl: "",
        collectionSlug: "featured-products",
        ctaLabel: "Explore the collection",
        ctaHref: "/products",
      },
      render: ({ eyebrow, heading, subheading, imageUrl, ctaLabel, ctaHref }) =>
        showcase(eyebrow, imageUrl, <>
          <h1 className={"max-w-3xl text-5xl font-light tracking-tight md:text-7xl " +
            (imageUrl ? "text-white" : "text-stone-900")}>{heading}</h1>
          <p className={"mt-6 max-w-xl text-lg " + (imageUrl ? "text-white/90" : "text-stone-600")}>{subheading}</p>
          <a href={typeof ctaHref === "string" && ctaHref.startsWith("/") ? ctaHref : "#"}
            className={"mt-10 px-7 py-4 text-sm tracking-wide " + (imageUrl
              ? "bg-white text-stone-900" : "bg-stone-900 text-white")}>{ctaLabel}</a>
        </>),
    },
    Collection: {
      label: "商品集合",
      fields: {
        eyebrow: { type: "text", label: "上方小标题" },
        heading: { type: "text", label: "标题" },
        intro: { type: "textarea", label: "介绍文案" },
        collectionSlug: { type: "text", label: "商品集合" },
        limit: { type: "number", label: "商品数量", min: 1, max: 24 },
      },
      defaultProps: {
        eyebrow: "SHOP THE EDIT",
        heading: "New arrivals",
        intro: "The season's most-loved pieces.",
        collectionSlug: "featured-products",
        limit: 8,
      },
      render: ({ eyebrow, heading, intro, collectionSlug, limit }) => (
        <CollectionCanvasPreview channel="" collectionSlug={String(collectionSlug??"")}
          eyebrow={String(eyebrow??"")} heading={String(heading??"")}
          intro={String(intro??"")} limit={Number(limit)||8}/>
      ),
    },
    Editorial: {
      label: "图文组合",
      fields: {
        eyebrow: { type: "text", label: "上方小标题" },
        heading: { type: "text", label: "标题" },
        body: { type: "textarea", label: "正文" },
        imageUrl: { type: "text", label: "图片" },
        imagePosition: { type: "radio", label: "图片位置", options: [{label:"Left",value:"left"},{label:"Right",value:"right"}] },
        ctaLabel: { type: "text", label: "链接文字" },
        ctaHref: { type: "text", label: "链接页面" },
      },
      defaultProps: {
        eyebrow: "OUR APPROACH",
        heading: "Crafted for everyday life.",
        body: "Considered details. Lasting comfort.",
        imageUrl: "",
        imagePosition: "left",
        ctaLabel: "Shop now",
        ctaHref: "/products",
      },
      render: ({ eyebrow, heading, body, imageUrl, imagePosition, ctaLabel }) => (
        <section className="grid min-h-[420px] grid-cols-1 bg-stone-50 md:grid-cols-2">
          <div className={"min-h-[300px] bg-stone-200 bg-cover bg-center " + (imagePosition === "right" ? "md:order-2" : "")}
            style={typeof imageUrl === "string" && imageUrl.startsWith("https://") ? {backgroundImage: "url(" + JSON.stringify(imageUrl) + ")"} : undefined} />
          <div className="flex flex-col justify-center px-10 py-16 md:px-16">
            <p className="text-xs uppercase tracking-widest text-stone-500">{eyebrow}</p>
            <h2 className="mt-4 text-4xl text-stone-900">{heading}</h2>
            <p className="mt-5 leading-7 text-stone-600">{body}</p>
            <p className="mt-7 text-sm underline underline-offset-8">{ctaLabel}</p>
          </div>
        </section>
      ),
    },
    Product: {
      label: "精选单品",
      fields: {
        heading: { type: "text", label: "区域标题" },
        productSlug: { type: "text", label: "商品" },
      },
      defaultProps: { heading: "Featured product", productSlug: "" },
      render: ({heading,productSlug})=><ProductCanvasPreview channel="" heading={String(heading??"")} slug={String(productSlug??"")}/>,
    },
    Story: {
      label: "品牌宣言",
      fields: {
        eyebrow: { type: "text", label: "上方小标题" },
        heading: { type: "text", label: "标题" },
        body: { type: "textarea", label: "正文" },
        align: { type: "radio", options: [{label:"Left",value:"left"},{label:"Center",value:"center"}] },
        tone: { type: "select", options: [{label:"Light",value:"default"},{label:"Soft",value:"muted"},{label:"Dark",value:"inverse"}] },
      },
      defaultProps: {
        eyebrow: "ABOUT THE BRAND",
        heading: "Designed with intention.",
        body: "Personal style should feel effortless.",
        align: "center",
        tone: "inverse",
      },
      render: ({ eyebrow, heading, body, align, tone }) => (
        <section className={"px-10 py-24 " + (tone === "inverse" ? "bg-stone-900 text-white" : tone === "muted" ? "bg-stone-100 text-stone-900" : "bg-white text-stone-900")}>
          <div className={"mx-auto max-w-3xl " + (align === "center" ? "text-center" : "")}>
            <p className="text-xs uppercase tracking-[0.3em] opacity-70">{eyebrow}</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">{heading}</h2>
            <p className="mt-6 text-lg leading-8 opacity-75">{body}</p>
          </div>
        </section>
      ),
    },
  },
};

/** The editor fields bind to the selected Saleor Channel; public rendering stays server-only. */
export function createScopedFashionEditorConfig(channel:string):Config {
  const blocks=fashionEditorConfig.components;
  return {
    ...fashionEditorConfig,
    components: {
      ...blocks,
      Hero:{...blocks.Hero, fields:{...blocks.Hero.fields,
        imageUrl:imageField(channel),collectionSlug:collectionField(channel),
        ctaHref:linkField(channel)}},
      Collection:{...blocks.Collection,fields:{...blocks.Collection.fields,
        collectionSlug:collectionField(channel)},
        render:({eyebrow,heading,intro,collectionSlug,limit})=><CollectionCanvasPreview
          channel={channel} collectionSlug={String(collectionSlug??"")}
          eyebrow={String(eyebrow??"")} heading={String(heading??"")}
          intro={String(intro??"")} limit={Number(limit)||8}/>},
      Editorial:{...blocks.Editorial,fields:{...blocks.Editorial.fields,
        imageUrl:imageField(channel),ctaHref:linkField(channel)}},
      Product:{...blocks.Product,fields:{...blocks.Product.fields,
        productSlug:productField(channel)},
        render:({heading,productSlug})=><ProductCanvasPreview channel={channel}
          heading={String(heading??"")} slug={String(productSlug??"")}/>},
    },
  };
}
