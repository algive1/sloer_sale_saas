import { describe, expect, it } from "vitest";
import { normalizeChatwootConversations, normalizeChatwootMessages } from "./agent-workbench-data";

describe("Chatwoot UI-safe data shaping", () => {
  it("keeps brand association server owned and discards private upstream fields", () => {
    const result = normalizeChatwootConversations({ data: { payload: [{
      id: 22, status: "open", inbox_id: 2, unread_count: 3,
      meta: { sender: { name: "Jane", email: "j@example.com", secret: "hidden" } },
      last_non_activity_message: { content: "What is shipping?" },
      unsafe_token: "never include me",
    }] } }, "fashion");
    expect(result).toEqual([expect.objectContaining({ id:22, siteId:"fashion", name:"Jane", unreadCount:3 })]);
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(JSON.stringify(result)).not.toContain("unsafe_token");
  });
  it("handles incoming/outgoing message types and removes activity messages", () => {
    expect(normalizeChatwootMessages({ payload:[
      { id:1, message_type:0, content:"hi", created_at: 5 },
      { id:2, message_type:1, content:"hello", created_at: 6 },
      { id:3, message_type:2, content:"assigned", created_at: 7 },
    ] })).toEqual([
      { id:1, content:"hi", outgoing:false, private:false, createdAt:5 },
      { id:2, content:"hello", outgoing:true, private:false, createdAt:6 },
    ]);
  });
});
