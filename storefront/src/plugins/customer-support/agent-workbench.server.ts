import "server-only";
import { getBrandSites } from "@/config/brand-sites";
import { parseChatwootSupportConfig } from "./config";
import { parseChatwootAgentCredentials } from "./agent-api-config";
import { normalizeChatwootConversations, normalizeChatwootMessages } from "./agent-workbench-data";

interface AgentBackend { baseUrl: string; accountId: number; apiToken: string; siteId: string }
export interface AgentBrand { id: string; name: string }

export class AgentWorkbenchError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); }
}

export function configuredAgentBrands(): readonly AgentBrand[] {
  const sites = getBrandSites();
  const expectedIds = sites?.map(site => site.id) ?? [process.env.STOREFRONT_SITE_ID?.trim() || "primary"];
  try {
    const widget = parseChatwootSupportConfig(
      process.env.SUPPORT_CHATWOOT_BASE_URL,
      process.env.SUPPORT_CHATWOOT_SITES_JSON,
      expectedIds,
      process.env.NODE_ENV !== "production",
    );
    const credentials = parseChatwootAgentCredentials(
      process.env.SUPPORT_CHATWOOT_AGENT_TOKENS_JSON,
      expectedIds,
    );
    if (!widget || !credentials) return [];
    return expectedIds.map(id => ({ id, name: sites?.find(site => site.id === id)?.name ?? id }));
  } catch {
    return [];
  }
}

export function agentWorkbenchConfigured(): boolean {
  return configuredAgentBrands().length > 0;
}

function getBackend(siteId: string): AgentBackend {
  const sites = getBrandSites();
  const expectedIds = sites?.map(site => site.id) ?? [process.env.STOREFRONT_SITE_ID?.trim() || "primary"];
  if (!expectedIds.includes(siteId)) throw new AgentWorkbenchError(404, "未找到该品牌客服");
  try {
    const widget = parseChatwootSupportConfig(
      process.env.SUPPORT_CHATWOOT_BASE_URL,
      process.env.SUPPORT_CHATWOOT_SITES_JSON,
      expectedIds,
      process.env.NODE_ENV !== "production",
    );
    const agents = parseChatwootAgentCredentials(
      process.env.SUPPORT_CHATWOOT_AGENT_TOKENS_JSON,
      expectedIds,
    );
    const binding = widget?.sites.find(s => s.siteId === siteId);
    const credential = agents?.find(s => s.siteId === siteId);
    if (!widget || !binding || !credential) throw new Error("not configured");
    return { baseUrl: widget.baseUrl, accountId: binding.accountId, apiToken: credential.apiToken, siteId };
  } catch {
    throw new AgentWorkbenchError(503, "Chatwoot 工作台未配置或品牌凭据无效");
  }
}

async function chatwootJson(
  backend: AgentBackend,
  path: string,
  options?: { method?: "POST"; body?: unknown },
): Promise<unknown> {
  const url = `${backend.baseUrl}/api/v1/accounts/${backend.accountId}${path}`;
  let result: Response;
  try {
    result = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        "api_access_token": backend.apiToken,
        "Accept": "application/json",
        ...(options?.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(options?.method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AgentWorkbenchError(502, "无法连接 Chatwoot 服务，请检查服务状态");
  }
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      throw new AgentWorkbenchError(502, "Chatwoot Agent API Token 已失效或没有当前 Account 权限");
    }
    throw new AgentWorkbenchError(502, "Chatwoot 暂时无法完成该操作");
  }
  const length = Number(result.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 2_000_000) {
    throw new AgentWorkbenchError(502, "Chatwoot 返回数据过大");
  }
  let raw = "";
  try { raw = await result.text(); }
  catch { throw new AgentWorkbenchError(502, "Chatwoot 响应中断"); }
  if (raw.length > 2_000_000) throw new AgentWorkbenchError(502, "Chatwoot 返回数据过大");
  try { return JSON.parse(raw) as unknown; }
  catch { throw new AgentWorkbenchError(502, "Chatwoot 返回数据格式错误"); }
}

function checkedId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 1) throw new AgentWorkbenchError(400, "会话编号无效");
  return id;
}

export async function listAgentConversations(siteId: string, status: string) {
  const backend = getBackend(siteId);
  const allowed = ["open", "pending", "resolved", "snoozed", "all"];
  const normalized = allowed.includes(status) ? status : "open";
  const data = await chatwootJson(backend,
    `/conversations?status=${encodeURIComponent(normalized)}&assignee_type=all&page=1`);
  return normalizeChatwootConversations(data, backend.siteId);
}

export async function listAgentMessages(siteId: string, conversationId: number) {
  const backend = getBackend(siteId);
  const data = await chatwootJson(backend, `/conversations/${checkedId(conversationId)}/messages`);
  return normalizeChatwootMessages(data);
}

export async function sendAgentReply(siteId: string, conversationId: number, content: string) {
  if (!content.trim() || content.length > 4000) {
    throw new AgentWorkbenchError(400, "回复内容需要在 1–4000 字以内");
  }
  const backend = getBackend(siteId);
  await chatwootJson(backend, `/conversations/${checkedId(conversationId)}/messages`, {
    method: "POST",
    body: { content: content.trim(), message_type: "outgoing", private: false },
  });
}

export async function updateAgentConversationStatus(
  siteId: string,
  conversationId: number,
  status: "open" | "resolved",
) {
  const backend = getBackend(siteId);
  await chatwootJson(backend, `/conversations/${checkedId(conversationId)}/toggle_status`, {
    method: "POST",
    body: { status },
  });
}
