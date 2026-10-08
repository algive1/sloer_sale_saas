"use client";

import type { Config } from "@puckeditor/core";

const showcase = (title: string, imageUrl: string, children: React.ReactNode) => (
  <section className="relative overflow-hidden bg-[#eee9e0]">
    {imageUrl.startsWith("https://") ? (
      <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{backgroundImage: "url(" + JSON.stringify(imageUrl) + ")"}} />
    ) : null}
    <div className="relative mx-auto flex min-h-[430px] max-w-6xl flex-col items-start justify-center px-10 py-20 md:min-h-[580px]">
      <span className="mb-4 text-xs uppercase tracking-[0.35em] text-stone-600">{title}</span>
      {children}
    </div>
  </section>
);

/**
 * Client-safe authoring config. Saleor is intentionally not fetched in the browser
 * editor; the published Server Component config binds collections to real products.
 */
export const fashionEditorConfig: Config = {
  categories: {
    merchandise: { title: "Shop & merchandise", components: ["Hero", "Collection"] },
    editorial: { title: "Brand storytelling", components: ["Editorial", "Story"] },
  },
  components: {
    Hero: {
      label: "Editorial hero",
      fields: {
        eyebrow: { type: "text", label: "Eyebrow" },
        heading: { type: "text", label: "Headline" },
        subheading: { type: "textarea", label: "Supporting copy" },
        imageUrl: { type: "text", label: "Background image (HTTPS)" },
        collectionSlug: { type: "text", label: "Image fallback collection slug" },
        ctaLabel: { type: "text", label: "Button label" },
        ctaHref: { type: "text", label: "Button link (/products)" },
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
          <h1 className="max-w-3xl text-5xl font-light tracking-tight text-stone-900 md:text-7xl">{heading}</h1>
          <p className="mt-6 max-w-xl text-lg text-stone-700">{subheading}</p>
          <a href={typeof ctaHref === "string" && ctaHref.startsWith("/") ? ctaHref : "#"} className="mt-10 bg-stone-900 px-7 py-4 text-sm tracking-wide text-white">{ctaLabel}</a>
        </>),
    },
    Collection: {
      label: "Saleor product collection",
      fields: {
        eyebrow: { type: "text", label: "Eyebrow" },
        heading: { type: "text", label: "Heading" },
        intro: { type: "textarea", label: "Introduction" },
        collectionSlug: { type: "text", label: "Saleor collection slug" },
        limit: { type: "number", label: "Number of products", min: 1, max: 24 },
      },
      defaultProps: {
        eyebrow: "SHOP THE EDIT",
        heading: "New arrivals",
        intro: "The season's most-loved pieces.",
        collectionSlug: "featured-products",
        limit: 8,
      },
      render: ({ eyebrow, heading, intro, collectionSlug, limit }) => (
        <section className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-500">{eyebrow}</p>
          <h2 className="mt-3 text-4xl text-stone-900">{heading}</h2>
          <p className="mt-3 text-stone-600">{intro}</p>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: Math.min(Number(limit) || 4, 8) }, (_, index) => (
              <div key={index} className="min-w-0">
                <div className="aspect-[3/4] bg-stone-100" />
                <div className="mt-3 h-3 w-3/4 rounded bg-stone-100" />
                <div className="mt-2 h-3 w-1/3 rounded bg-stone-100" />
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-stone-500">Live products will be loaded from Saleor collection: {collectionSlug}</p>
        </section>
      ),
    },
    Editorial: {
      label: "Image + text",
      fields: {
        eyebrow: { type: "text", label: "Eyebrow" },
        heading: { type: "text", label: "Heading" },
        body: { type: "textarea", label: "Paragraphs" },
        imageUrl: { type: "text", label: "Photo URL (HTTPS)" },
        imagePosition: { type: "radio", label: "Photo side", options: [{label:"Left",value:"left"},{label:"Right",value:"right"}] },
        ctaLabel: { type: "text", label: "Link text" },
        ctaHref: { type: "text", label: "Link path" },
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
    Story: {
      label: "Brand statement",
      fields: {
        eyebrow: { type: "text", label: "Eyebrow" },
        heading: { type: "text", label: "Heading" },
        body: { type: "textarea", label: "Body copy" },
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
