import "server-only";
import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import type { PausableSystemPluginId } from "./policy";
import { pluginPauseReason } from "./runtime.server";

export function PluginPauseNotice({ plugin }: { plugin: PausableSystemPluginId }) {
  return <Suspense fallback={null}><Notice plugin={plugin} /></Suspense>;
}
async function Notice({ plugin }: { plugin: PausableSystemPluginId }) {
  await io(); const reason = pluginPauseReason(plugin);
  if (!reason) return null;
  return <p role="alert" className="my-4 rounded-lg border border-border bg-card p-4 text-sm">
    {reason === "plugin_configuration_invalid" ? "系统暂停配置无效，此功能已停止新增工作。" : "此功能已由系统暂停。"}
    {plugin === "analytics" ? "新增采集已停止，当前报告仅包含历史事件；原生订单不受影响。" : plugin === "ads-tracking" ? "新增像素加载和服务器派发已停止，历史投递记录可读。" : plugin === "seo-merchant" ? "Merchant Feed已暂停；基础SEO与商品结构化数据仍可用。" : "历史资料保留可读，保存、发布、发送和新任务暂不可用。"}
    <Link href="/ops/plugins" className="ml-2 underline">查看系统插件状态 →</Link>
  </p>;
}
