/** The subset of Chatwoot's REST schema rendered by our agent inbox.
 * Normalization prevents leaking sensitive upstream internals, arbitrary
 * HTML, contact metadata, custom attributes or attachments into the browser.
 */
export type AgentConversation = Readonly<{
  id: number;
  siteId: string;
  name: string;
  email: string | null;
  preview: string;
  status: string;
  inboxId: number | null;
  lastActivity: number;
  unreadCount: number;
}>;
export type AgentMessage = Readonly<{
  id: number;
  content: string;
  outgoing: boolean;
  private: boolean;
  createdAt: number;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function text(value: unknown, cap = 4000): string {
  return typeof value === "string" ? value.slice(0, cap) : "";
}
function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value : null;
}
function timestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

export function normalizeChatwootConversations(payload: unknown, siteId: string): AgentConversation[] {
  const root = record(payload);
  const inner = record(root?.data);
  const rows = Array.isArray(inner?.payload) ? inner.payload
    : Array.isArray(root?.payload) ? root.payload : [];
  return rows.slice(0, 60).flatMap(row => {
    const c = record(row);
    if (!c) return [];
    const id = positiveInt(c.id);
    if (!id) return [];
    const meta = record(c.meta);
    const sender = record(meta?.sender);
    const last = record(c.last_non_activity_message);
    const latest = last ?? (Array.isArray(c.messages) ? record(c.messages.at(-1)) : null);
    const status = text(c.status, 30);
    return [{
      id, siteId,
      name: text(sender?.name, 100) || "访客",
      email: typeof sender?.email === "string" ? text(sender.email, 200) : null,
      preview: text(latest?.content, 180),
      status,
      inboxId: positiveInt(c.inbox_id),
      lastActivity: timestamp(c.last_activity_at),
      unreadCount: typeof c.unread_count === "number" && Number.isFinite(c.unread_count)
        ? Math.min(999, Math.max(0, Math.floor(c.unread_count))) : 0,
    }];
  });
}

export function normalizeChatwootMessages(payload: unknown): AgentMessage[] {
  const root = record(payload);
  const rows = Array.isArray(root?.payload) ? root.payload
    : Array.isArray(root?.data) ? root.data : [];
  return rows.slice(-100).flatMap(row => {
    const msg = record(row);
    if (!msg) return [];
    const id = positiveInt(msg.id);
    if (!id) return [];
    const type = msg.message_type;
    const outgoing = type === 1 || type === "outgoing";
    const activity = type === 2 || type === "activity" || type === "template";
    if (activity) return [];
    return [{
      id,
      content: text(msg.content, 8000) || (Array.isArray(msg.attachments) && msg.attachments.length ? "[附件消息]" : ""),
      outgoing,
      private: msg.private === true,
      createdAt: timestamp(msg.created_at),
    }];
  });
}
