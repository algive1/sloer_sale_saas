import type { Config } from "@puckeditor/core";
import Link from "next/link";
import Image from "next/image";
import { getProductData } from "@/lib/catalog/get-product-data";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { getFeaturedProducts } from "@/lib/catalog/get-featured-products";
import { EditorialHero } from "@/ui/sections/editorial-hero/editorial-hero";
import { MediaHero } from "@/ui/sections/media-hero/media-hero";
import { FeaturedCollectionSection } from "@/ui/sections/featured-collection-section/featured-collection-section";
import { ImageWithText } from "@/ui/sections/image-with-text/image-with-text";
import { RichTextBlock } from "@/ui/sections/rich-text-block/rich-text-block";

/** Server components retain catalog SSR, SEO, product URLs and basket behavior. */
async function PublishedHero({
  id, locale, channel, eyebrow, heading, subheading, imageUrl, collectionSlug, ctaLabel, ctaHref,
}: {
  id: string; locale: string; channel: string; eyebrow: string; heading: string; subheading: string;
  imageUrl?: string; collectionSlug: string; ctaLabel: string; ctaHref: string;
}) {
  const headingId = "theme-" + id + "-heading";
  const cta = ctaLabel ? {label:ctaLabel,href:ctaHref} : undefined;
  if (imageUrl) {
    return <MediaHero id={headingId} eyebrow={eyebrow} heading={heading}
      subheading={subheading} image={imageUrl} height="tall" align="left"
      overlay="gradient" primaryCta={cta} />;
  }
  const products = await getFeaturedProducts(channel, locale, 1, collectionSlug);
  return <EditorialHero id={headingId}
    eyebrow={eyebrow} heading={heading} subheading={subheading}
    image={products[0]?.thumbnail?.url || null} primaryCta={cta} />;
}

async function PublishedFeaturedProduct({heading,slug,channel,locale}:{
  heading:string;slug:string;channel:string;locale:string;
}) {
  if(!slug)return null;
  const product=await getProductData(slug,channel,locale);
  if(!product)return null;
  const gross=product.pricing?.priceRange?.start?.gross;
  const price=gross?new Intl.NumberFormat(locale,{style:"currency",currency:gross.currency}).format(gross.amount):null;
  return <section className="mx-auto max-w-5xl px-6 py-16">
    {heading?<h2 className="mb-8 text-3xl">{heading}</h2>:null}
    <div className="grid gap-8 md:grid-cols-2">
      {product.thumbnail?.url?
        <Image unoptimized src={product.thumbnail.url} alt={product.thumbnail.alt??product.name}
          width={640} height={800} className="aspect-[4/5] w-full object-cover"/>:
        <div className="aspect-[4/5] bg-stone-100"/>}
      <div className="flex flex-col justify-center gap-4">
        <h3 className="text-2xl font-medium">{product.name}</h3>
        {price?<p className="text-xl">{price}</p>:null}
        <Link href={buildStorefrontPath(locale,channel,"/products/"+product.slug)}
          className="w-fit bg-stone-900 px-8 py-3 text-sm text-white">查看商品详情</Link>
      </div>
    </div>
  </section>;
}

/**
 * Puck's <Render> is server-compatible. Keep the server config separate from the
 * client editor, so server-only Saleor queries never enter the browser bundle.
 */
export function createPublishedThemeConfig(channel: string, locale: string): Config {
  return {
    components: {
      Product: {
        render: ({heading,productSlug})=><PublishedFeaturedProduct
          heading={String(heading??"")} slug={String(productSlug??"")}
          channel={channel} locale={locale}/>,
      },
      Hero: {
        render: ({ id, eyebrow, heading, subheading, imageUrl, collectionSlug, ctaLabel, ctaHref }) => (
          <PublishedHero id={String(id)} locale={locale} channel={channel} eyebrow={eyebrow ?? ""}
            heading={heading ?? ""} subheading={subheading ?? ""} imageUrl={imageUrl}
            collectionSlug={collectionSlug || "featured-products"} ctaLabel={ctaLabel ?? ""}
            ctaHref={ctaHref || "/products"} />
        ),
      },
      Collection: {
        render: ({ id, eyebrow, heading, intro, collectionSlug, limit }) => (
          <FeaturedCollectionSection id={"theme-"+String(id)+"-heading"}
            channel={channel} locale={locale} eyebrow={eyebrow} heading={heading} intro={intro}
            collectionSlug={collectionSlug || "featured-products"} limit={Math.min(Number(limit) || 8, 24)}
          />
        ),
      },
      Editorial: {
        render: ({ id, eyebrow, heading, body, imageUrl, imagePosition, ctaLabel, ctaHref }) => (
          <ImageWithText id={"theme-"+String(id)+"-heading"}
            eyebrow={eyebrow} heading={heading} paragraphs={String(body ?? "").split("\n").filter(Boolean)}
            image={imageUrl || null} imagePosition={imagePosition === "right" ? "right" : "left"}
            cta={ctaLabel ? { label: ctaLabel, href: ctaHref || "/products" } : undefined}
          />
        ),
      },
      Story: {
        render: ({ id, eyebrow, heading, body, align, tone }) => (
          <RichTextBlock id={"theme-"+String(id)+"-heading"} eyebrow={eyebrow} heading={heading}
            paragraphs={String(body ?? "").split("\n").filter(Boolean)}
            align={align === "center" ? "center" : "left"}
            tone={tone === "inverse" || tone === "muted" ? tone : "default"} />
        ),
      },
    },
  };
}
