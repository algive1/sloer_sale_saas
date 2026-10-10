"use client";

import { useEffect, useState } from "react";

type Product = {
  slug: string;
  name: string;
  image: string | null;
  price: { amount: number; currency: string } | null;
};

type CollectionPayload = {
  slug: string;
  products: Product[];
};

export function CollectionCanvasPreview({
  channel,
  collectionSlug,
  heading,
  eyebrow,
  intro,
  limit,
}: {
  channel: string;
  collectionSlug: string;
  heading: string;
  eyebrow: string;
  intro: string;
  limit: number;
}) {
  const [snapshot, setSnapshot] = useState<CollectionPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!channel || !collectionSlug) return;
    const controller = new AbortController();
    fetch("/ops/themes/catalog?" + new URLSearchParams({
      kind: "collection-products",
      channel,
      slug: collectionSlug,
    }), { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as {
          collection?: CollectionPayload | null;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "加载商品集合失败");
        return body.collection ?? null;
      })
      .then((collection) => {
        if (controller.signal.aborted) return;
        setSnapshot(collection);
        setError("");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshot(null);
        setError(reason instanceof Error ? reason.message : "加载商品失败");
      });
    return () => controller.abort();
  }, [channel, collectionSlug]);

  const collection = snapshot?.slug === collectionSlug ? snapshot : null;
  const products = collection?.products.slice(0, Math.max(1, Math.min(limit, 24))) ?? [];

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      {eyebrow ? <p className="text-xs uppercase tracking-[0.25em] text-stone-500">{eyebrow}</p> : null}
      <h2 className="mt-3 text-4xl text-stone-900">{heading}</h2>
      {intro ? <p className="mt-3 text-stone-600">{intro}</p> : null}
      {products.length ? (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((product) => {
            const price = product.price;
            const formatted = price
              ? new Intl.NumberFormat("en", { style: "currency", currency: price.currency }).format(price.amount)
              : null;
            return (
              <div key={product.slug} className="min-w-0">
                <div className="aspect-[3/4] bg-stone-100 bg-cover bg-center"
                  role="img" aria-label={product.name}
                  style={product.image ? { backgroundImage: "url(" + JSON.stringify(product.image) + ")" } : undefined} />
                <p className="mt-3 truncate text-sm text-stone-900">{product.name}</p>
                {formatted ? <p className="mt-1 text-sm text-stone-600">{formatted}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-sm text-stone-600">
          {error || (collectionSlug
            ? (collection ? "当前集合暂无已上架商品" : "正在获取当前市场的商品…")
            : "请在右侧选择一个商品集合")}
        </div>
      )}
      <p className="mt-5 text-xs text-stone-500">商品图片、名称及价格来自当前 Saleor 市场；以结账实时数据为准。</p>
    </section>
  );
}
