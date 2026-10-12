import { Suspense } from "react";
import { RealtimeContent } from "@/ui/ops/realtime-content";

export default function RealtimeAnalyticsPage() {
  return <Suspense fallback={<p className="p-8" role="status">正在读取实时数据…</p>}><RealtimeContent /></Suspense>;
}
