import { realtimeResponse } from "@/lib/ops/realtime-response";
export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  return realtimeResponse((await params).siteId);
}
