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
    历史资料保留可读，保存、发布、发送和新任务暂不可用。
    <Link href="/ops/plugins" className="ml-2 underline">查看系统插件状态 →</Link>
  </p>;
}
