import "server-only";
import { parseSystemPluginPolicy, systemPluginPauseReason, type PausableSystemPluginId } from "./policy";

/** Read at each operation; no registry SQL, cache, module-level environment snapshot or public secret. */
export function pluginPauseReason(id: PausableSystemPluginId) {
  return systemPluginPauseReason(id, parseSystemPluginPolicy(process.env.SYSTEM_PLUGINS_DISABLED));
}
export function assertPluginActive(id: PausableSystemPluginId): void {
  const reason = pluginPauseReason(id);
  if (reason) throw new Error(reason);
}
