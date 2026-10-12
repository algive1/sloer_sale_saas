"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, CircleHelp, MessageCircle, RefreshCw, Search, Send, Settings2 } from "lucide-react";
import type { AgentConversation, AgentMessage } from "@/plugins/customer-support/agent-workbench-data";

type BrandOption = Readonly<{ id: string; name: string }>;
type ConversationStatus = "open" | "pending" | "resolved" | "all";

const STATUS_OPTIONS: readonly { label: string; value: ConversationStatus }[] = [
  { label: "待处理", value: "open" },
  { label: "未分配", value: "pending" },
  { label: "已解决", value: "resolved" },
  { label: "全部", value: "all" },
];
const CHAT_API = "/api/ops/chatwoot";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? (data as { error: unknown }).error : null;
    throw new Error(typeof error === "string" ? error : "客服服务暂时无法访问");
  }
  return data as T;
}
async function postJson(body: unknown) {
  const response = await fetch(CHAT_API, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-ops-chat-action": "conversation",
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? (data as { error: unknown }).error : null;
    throw new Error(typeof error === "string" ? error : "客服操作失败");
  }
}

function formatTime(stamp: number) {
  if (!stamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(stamp * 1000));
}

export function ChatWorkbench({ brands }: { brands: readonly BrandOption[] }) {
  const [siteId, setSiteId] = useState(brands[0]?.id ?? "");
  const [status, setStatus] = useState<ConversationStatus>("open");
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [listError, setListError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshList = useCallback(() => setRefreshKey(value => value + 1), []);

  useEffect(() => {
    if (!siteId) return;
    let active = true;
    const load = async () => {
      try {
        const data = await getJson<{ conversations: AgentConversation[] }>(
          `${CHAT_API}?site=${encodeURIComponent(siteId)}&status=${status}`,
        );
        if (active) {
          setConversations(data.conversations);
          setListError("");
        }
      } catch (error) {
        if (active) {
          setListError(error instanceof Error ? error.message : "读取会话失败");
          setConversations([]);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [siteId, status, refreshKey]);

  useEffect(() => {
    if (!siteId || selectedId === null) return;
    let active = true;
    const load = async () => {
      try {
        const data = await getJson<{ messages: AgentMessage[] }>(
          `${CHAT_API}?site=${encodeURIComponent(siteId)}&view=messages&id=${selectedId}`,
        );
        if (active) { setMessages(data.messages); setThreadError(""); }
      } catch (error) {
        if (active) { setThreadError(error instanceof Error ? error.message : "读取消息失败"); setMessages([]); }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [siteId, selectedId, refreshKey]);

  const selected = conversations.find(conv => conv.id === selectedId);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return !text ? conversations : conversations.filter(c => (
      c.name.toLowerCase().includes(text) || c.email?.toLowerCase().includes(text) ||
      c.preview.toLowerCase().includes(text) || String(c.id).includes(text)
    ));
  }, [conversations, query]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!selectedId || !siteId || !content || busy) return;
    if (content.length > 4000) {
      setThreadError("每条消息最长 4000 字");
      return;
    }
    setBusy(true);
    try {
      await postJson({ action: "reply", siteId, id: selectedId, content });
      setDraft("");
      setThreadError("");
      refreshList();
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "发送失败");
    } finally { setBusy(false); }
  };

  const changeStatus = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await postJson({
        action: "status", siteId, id: selected.id,
        status: selected.status === "resolved" ? "open" : "resolved",
      });
      refreshList();
      setThreadError("");
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "更改状态失败");
    } finally { setBusy(false); }
  };

  if (!brands.length) return (
    <div className="mx-auto max-w-5xl px-5 py-10" data-testid="chatwoot-inbox-unconfigured">
      <div className="rounded-2xl border bg-card p-8">
        <CircleHelp className="mb-4 text-slate-500" size={30} />
        <h1 className="text-2xl font-bold">客服会话工作台</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
          尚未连接 Chatwoot Agent API。请先配置自托管 Chatwoot、每个品牌独立的 Account
          和服务器专用 API Token，然后才能查看并回复真实访客消息。本页不会展示模拟对话。
        </p>
        <Link href="/ops/support/settings" className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-secondary">
          <Settings2 size={16} /> 查看 Chatwoot 设置
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-62px)] min-h-[540px] min-w-0 flex-col p-4 lg:p-5" data-testid="chatwoot-inbox">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CUSTOMERS / INBOX</p>
          <h1 className="mt-1 text-xl font-semibold">在线客服 · 会话工作台</h1>
          <p className="mt-1 text-xs text-muted-foreground">实时连接 Chatwoot · 服务端代理 · 不暴露 Agent API Token</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshList} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs hover:bg-secondary" aria-label="刷新会话">
            <RefreshCw size={15} /> 刷新
          </button>
          <Link href="/ops/support/settings" className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs hover:bg-secondary">
            <Settings2 size={15} /> Chatwoot 设置
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border bg-card lg:grid-cols-[minmax(250px,310px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_230px]">
        <section className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r" aria-label="客服会话列表">
          <div className="space-y-3 border-b p-3.5">
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="support-brand">当前品牌</label>
            <select
              id="support-brand" value={siteId}
              onChange={event => {
                setSiteId(event.target.value); setSelectedId(null); setMessages([]); setConversations([]);
              }}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            >
              {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            <div className="flex gap-1 overflow-x-auto" role="group" aria-label="会话状态">
              {STATUS_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={status === option.value}
                  onClick={() => { setStatus(option.value); setSelectedId(null); setMessages([]); }}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${status === option.value ? "bg-slate-900 font-semibold text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3">
              <Search size={15} className="text-muted-foreground" />
              <input value={query} onChange={event => setQuery(event.target.value)}
                placeholder="搜索会话、访客、邮箱" aria-label="搜索会话"
                className="w-full bg-transparent py-2.5 text-sm outline-none" />
            </div>
          </div>
          {listError && <div role="alert" className="border-b px-4 py-3 text-xs text-red-600">{listError}</div>}
          <div className="min-h-[180px] flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm leading-7 text-muted-foreground">
                {listError ? "连接恢复后可点击刷新" : "当前筛选条件下暂无会话"}
              </div>
            ) : filtered.map(conv => (
              <button type="button" key={conv.id}
                onClick={() => { setSelectedId(conv.id); setMessages([]); setThreadError(""); }}
                className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-secondary ${selectedId === conv.id ? "bg-slate-100" : ""}`}
                aria-pressed={selectedId === conv.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{conv.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatTime(conv.lastActivity)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{conv.preview || "暂未显示文本消息"}</p>
                  {conv.unreadCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{conv.unreadCount}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-h-[360px] min-w-0 flex-col" aria-label="当前客服对话">
          {!selected ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
              <MessageCircle size={36} strokeWidth={1.4} />
              <p className="text-sm">从左侧选择一段真实会话，即可查看聊天记录并回复</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selected.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">会话 #{selected.id} · {selected.status}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void changeStatus()}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-60">
                  <Check size={14} /> {selected.status === "resolved" ? "重新打开" : "标记已解决"}
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-5" aria-live="polite">
                {threadError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{threadError}</p>}
                {messages.length === 0 && !threadError && (
                  <p className="py-10 text-center text-sm text-muted-foreground">暂无文本消息，或正在加载中</p>
                )}
                {messages.map(message => (
                  <div key={message.id} className={`flex ${message.outgoing ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-6 ${message.outgoing ? "bg-slate-800 text-white" : "border bg-white text-slate-800"}`}>
                      <p>{message.content}</p>
                      <p className={`mt-1 text-[10px] ${message.outgoing ? "text-slate-300" : "text-slate-500"}`}>
                        {message.private ? "内部备注 · " : ""}{formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={event => void send(event)} className="flex items-end gap-3 border-t bg-card p-3.5">
                <textarea
                  value={draft} onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="输入回复，Enter 发送，Shift + Enter 换行"
                  aria-label="客服回复内容" rows={2} maxLength={4000}
                  className="min-h-[60px] min-w-0 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <button type="submit" disabled={!draft.trim() || busy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-40">
                  <Send size={15} /> 发送
                </button>
              </form>
            </>
          )}
        </section>

        <aside className="hidden border-l bg-card xl:block" aria-label="访客资料">
          <div className="border-b p-4 text-sm font-semibold">客户资料</div>
          {selected ? <div className="space-y-4 p-4 text-sm">
            <div><p className="text-xs text-muted-foreground">客户名称</p><p className="mt-1 break-words font-semibold">{selected.name}</p></div>
            <div><p className="text-xs text-muted-foreground">联系邮箱</p><p className="mt-1 break-all">{selected.email || "未提供"}</p></div>
            <div><p className="text-xs text-muted-foreground">当前品牌</p><p className="mt-1">{brands.find(b => b.id === siteId)?.name}</p></div>
            <div><p className="text-xs text-muted-foreground">Chatwoot Account 内会话</p><p className="mt-1">#{selected.id}</p></div>
            <p className="rounded-lg bg-secondary p-3 text-xs leading-6 text-muted-foreground">
              不依据未验证邮箱自动附加 Saleor 订单，避免跨品牌泄露。
            </p>
          </div> : <p className="p-4 text-xs leading-6 text-muted-foreground">选择会话后显示访客资料。</p>}
        </aside>
      </div>
    </div>
  );
}
