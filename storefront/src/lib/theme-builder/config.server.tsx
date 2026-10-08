import type { Config } from "@puckeditor/core";
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

/**
 * Puck's <Render> is server-compatible. Keep the server config separate from the
 * client editor, so server-only Saleor queries never enter the browser bundle.
 */
export function createPublishedThemeConfig(channel: string, locale: string): Config {
  return {
    components: {
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
