import "server-only";
import { getBrandSites } from "@/config/brand-sites";
import { OpsCatalogAuditDocument, type OpsCatalogAuditQuery } from "@/gql/graphql";
import { productBrandName } from "@/lib/catalog/product-brand";
import type { OpsViewer } from "./authorization";

type Product = NonNullable<OpsCatalogAuditQuery["products"]>["edges"][number]["node"];
export type CatalogIssue = { code: string; label: string; severity: "blocker" | "review" };
export type CatalogProduct = { id: string; name: string; slug: string; brand: string; issues: CatalogIssue[];
  markets: Array<{ channel: string; published: boolean; visible: boolean; purchasable: boolean; prices: Array<{ sku: string; amount: number | null; currency: string }>; missing: boolean }>;
  inventory: Array<{ sku: string; tracked: boolean; available: number | null }>; variantsIncomplete: boolean };
export type CatalogAudit = { siteId: string; siteName: string; channels: readonly string[]; channel: string; checkedAt: string; products: CatalogProduct[]; nextCursor: string | null };

function hasDescription(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as { blocks?: Array<{ data?: Record<string, unknown> }> };
    return (value.blocks ?? []).some(block => Object.values(block.data ?? {}).some(v => typeof v === "string" && v.replace(/<[^>]*>/g, "").trim().length > 0));
  } catch { return raw.replace(/<[^>]*>/g, "").trim().length > 0; }
}

export function auditCatalogProduct(product: Product, ownedChannels: readonly string[], selectedChannel: string, now: number): CatalogProduct {
  const issues: CatalogIssue[] = [];
  const add = (code: string, label: string, severity: CatalogIssue["severity"] = "blocker") => issues.push({ code, label, severity });
  const variants = product.productVariants?.edges.map(edge => edge.node) ?? [];
  const brand = productBrandName(product.brand) ?? "";
  if (!product.media?.some(media => media.type === "IMAGE")) add("image", "缺少商品图片");
  if (!product.category) add("category", "未设置分类", "review");
  if (!brand) add("brand", "未填写真实品牌属性", "review");
  if (!hasDescription(product.description)) add("description", "商品介绍为空", "review");
  if (!product.seoTitle?.trim() || !product.seoDescription?.trim()) add("seo", "SEO标题或描述未单独填写；当前使用默认内容", "review");
  if (product.media?.some(media => media.type === "IMAGE" && !media.alt?.trim())) add("image_alt", "部分商品图片没有替代文字", "review");
  if (!variants.length) add("variants", "没有可检查的规格");
  if (product.productVariants?.pageInfo.hasNextPage) add("variants_incomplete", "超过50个规格；本页未完整检查", "review");
  const seen = new Set<string>();
  for (const variant of variants) {
    const sku = variant.sku?.trim();
    if (!sku) add("sku", "规格缺少SKU");
    else if (seen.has(sku)) add("duplicate_sku", "商品内SKU重复");
    if (sku) seen.add(sku);
    const weight = variant.weight ?? product.weight ?? product.productType.weight;
    if (product.productType.isShippingRequired && (!weight || !Number.isFinite(Number(weight.value)) || Number(weight.value) <= 0)) add("weight", `规格 ${sku || "未命名"} 缺少有效重量`, "review");
    if (!variant.trackInventory) add("untracked_stock", `规格 ${sku || "未命名"} 未跟踪库存，请确认无限库存策略`, "review");
    else if (variant.quantityAvailable == null) add("unknown_stock", `规格 ${sku || "未命名"} 当前市场可售量未知`, "review");
    else if (variant.quantityAvailable <= 0) add("stock", `规格 ${sku || "未命名"} 当前市场没有可售库存`, "review");
  }
  const due = (value: string | null | undefined) => !value || (Number.isFinite(Date.parse(value)) && Date.parse(value) <= now);
  const markets = ownedChannels.map(channel => {
    const listing = product.channelListings?.find(row => row.channel.slug === channel);
    const prices = variants.map(variant => {
      const price = variant.channelListings?.find(row => row.channel.slug === channel)?.price;
      return { sku: variant.sku ?? "", amount: price?.amount ?? null, currency: price?.currency ?? listing?.channel.currencyCode ?? "" };
    });
    const published = !!listing?.channel.isActive && listing.isPublished && due(listing.publishedAt);
    const purchasable = published && !!listing?.isAvailableForPurchase && due(listing.availableForPurchaseAt);
    if (channel === selectedChannel) {
      if (!listing) add("market_assignment", "商品未分配到当前市场");
      else {
        if (!listing.channel.isActive) add("market_inactive", "当前市场已停用");
        if (!published) add("market_publication", "当前市场未发布或尚未到发布时间");
        if (!listing.visibleInListings) add("market_listing", "商品不在当前市场列表展示", "review");
        if (!purchasable) add("market_purchase", "当前市场尚未开放购买");
      }
      if (prices.some(price => price.amount === null)) add("price", "当前市场部分规格未设置价格");
      if (prices.some(price => price.amount === 0)) add("zero_price", "当前市场存在零价规格，请确认免费策略", "review");
    }
    return { channel, published, visible: !!listing?.visibleInListings, purchasable, prices, missing: !listing };
  });
  return { id: product.id, name: product.name, slug: product.slug, brand, issues,
    markets, variantsIncomplete: !!product.productVariants?.pageInfo.hasNextPage,
    inventory: variants.map(v => ({ sku: v.sku ?? "", tracked: v.trackInventory, available: v.quantityAvailable ?? null })) };
}

export async function readCatalogAudit(siteId: string, viewer: OpsViewer | null, requestedChannel?: string, after?: string): Promise<CatalogAudit> {
  if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) throw new Error("forbidden_catalog");
  const site = getBrandSites()?.find(row => row.id === siteId);
  if (!site) throw new Error("unknown_catalog_brand");
  const channel = requestedChannel ?? site.defaultChannel;
  if (!site.channels.includes(channel) || (after && (after.length > 256 || !/^[A-Za-z0-9+/=_-]+$/.test(after)))) throw new Error("invalid_catalog_selection");
  const token = (process.env.OPS_CATALOG_SALEOR_TOKEN || process.env.SALEOR_APP_TOKEN)?.trim();
  const url = (process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL)?.trim();
  if (!token || !url) throw new Error("catalog_access_not_configured");
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ query: OpsCatalogAuditDocument.toString(), variables: { channel, after: after ?? null } }) });
  if (!response.ok) throw new Error("catalog_source_unavailable");
  const body = await response.json() as { data?: OpsCatalogAuditQuery; errors?: unknown[] };
  if (body.errors?.length || !body.data?.products) throw new Error("catalog_source_unavailable");
  const products = body.data.products.edges.map(edge => edge.node);
  // Guard unexpected upstream results before projecting any product/market data.
  if (products.some(product => !product.channelListings?.some(row => row.channel.slug === channel))) throw new Error("catalog_source_scope_mismatch");
  const now = Date.now();
  return { siteId, siteName: site.name, channels: site.channels, channel, checkedAt: new Date(now).toISOString(),
    products: products.map(product => auditCatalogProduct(product, site.channels, channel, now)),
    nextCursor: body.data.products.pageInfo.hasNextPage ? body.data.products.pageInfo.endCursor ?? null : null };
}
