import { Suspense } from "react";
import { RealtimeContent } from "@/ui/ops/realtime-content";

export default function BrandRealtimePage({ params }: { params: Promise<{ siteId: string }> }) {
  return <Suspense fallback={<p className="p-8" role="status">正在读取品牌实时数据…</p>}><BrandContent params={params} /></Suspense>;
}
async function BrandContent({ params }: { params: Promise<{ siteId: string }> }) {
  return <RealtimeContent siteId={(await params).siteId} />;
}
