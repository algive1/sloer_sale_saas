import { NextResponse } from "next/server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { opsPublicRequestUrl } from "@/lib/ops/request-url";
import { isTrustedAgentMutation } from "@/plugins/customer-support/agent-request-security";
import {
  AgentWorkbenchError, listAgentConversations, listAgentMessages,
  sendAgentReply, updateAgentConversationStatus,
} from "@/plugins/customer-support/agent-workbench.server";

const response = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
});

async function isPlatformOperator(): Promise<boolean> {
  try { return (await currentOpsViewer())?.role === "platform_admin"; }
  catch { return false; }
}
function errorResponse(error: unknown) {
  if (error instanceof AgentWorkbenchError) return response({ error: error.message }, error.httpStatus);
  return response({ error: "客服操作暂不可用" }, 503);
}
function validParams(url: URL) {
  const site = url.searchParams.get("site");
  const raw = url.searchParams.get("id");
  const id = raw && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
  return { site: site && /^[a-zA-Z0-9_-]{1,64}$/.test(site) ? site : null,
    id: id && Number.isSafeInteger(id) && id > 0 ? id : null };
}

export async function GET(request: Request) {
  if (!(await isPlatformOperator())) return response({ error: "没有客服会话访问权限" }, 403);
  const url = new URL(request.url);
  const { site, id } = validParams(url);
  if (!site) return response({ error: "请选择有效品牌" }, 400);
  try {
    if (url.searchParams.get("view") === "messages") {
      if (!id) return response({ error: "无效会话编号" }, 400);
      const messages = await listAgentMessages(site, id);
      return response({ messages });
    }
    const conversations = await listAgentConversations(site, url.searchParams.get("status") ?? "open");
    return response({ conversations });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!(await isPlatformOperator())) return response({ error: "没有客服回复权限" }, 403);
  // Basic Auth and signed cookies are ambient credentials. Require a same-origin
  // programmatic request, and reject cross-site form posts (CSRF).
  const publicUrl = opsPublicRequestUrl(request.url, request.headers.get("host"));
  if (!publicUrl || !isTrustedAgentMutation({
    origin: request.headers.get("origin"),
    requestUrl: publicUrl.href,
    fetchSite: request.headers.get("sec-fetch-site"),
    actionHeader: request.headers.get("x-ops-chat-action"),
  })) {
    return response({ error: "不允许跨站发起客服操作" }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > 8192) {
    return response({ error: "请求数据过大" }, 413);
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return response({ error: "无效请求" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "无效请求" }, 400);
  }
  const data = body as Record<string, unknown>;
  const validSite = typeof data.siteId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(data.siteId);
  const id = data.id;
  if (!validSite || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    return response({ error: "品牌或会话编号无效" }, 400);
  }
  try {
    if (data.action === "reply") {
      if (typeof data.content !== "string") return response({ error: "无效回复内容" }, 400);
      await sendAgentReply(data.siteId as string, id, data.content);
    } else if (data.action === "status") {
      if (data.status !== "open" && data.status !== "resolved") {
        return response({ error: "不支持的会话状态" }, 400);
      }
      await updateAgentConversationStatus(data.siteId as string, id, data.status);
    } else return response({ error: "不支持的客服操作" }, 400);
    return response({ ok: true });
  } catch (error) { return errorResponse(error); }
}
