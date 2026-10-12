/** Loopback-only GraphQL fixture for local operator HTTP/browser tests.
 * Does not certify native Saleor. Real native writes are tested separately in CI.
 */
import { createServer } from "node:http";
const token = process.env.CI_OPS_TRACKING_TOKEN;
if (!token) throw new Error("CI_OPS_TRACKING_TOKEN required");
const port = Number(process.env.CI_OPS_TRACKING_PORT ?? 3891);
const orders = [{ id: btoa("Order:1"), number: "1001", status: "FULFILLED", isPaid: true, isShippingRequired: true, channel: { slug: "us" }, fulfillments: [{ id: btoa("Fulfillment:1"), status: "FULFILLED", trackingNumber: "", lines: [{ quantity: 1, orderLine: { isShippingRequired: true } }] }] }];
createServer(async (request, response) => {
  function send(status, body) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
  if (request.method === "GET" && request.url === "/health") return send(200, { ok: true });
  if (request.method !== "POST" || request.headers.authorization !== `Bearer ${token}`) return send(403, { error: "forbidden" });
  try {
    let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 20_000) return send(413, { error: "too_large" }); }
    const { query, variables } = JSON.parse(raw);
    if (query.includes("mutation OpsUpdateTracking")) {
      const order = orders.find(order => order.fulfillments.some(fulfillment => fulfillment.id === variables.id));
      const fulfillment = order?.fulfillments.find(fulfillment => fulfillment.id === variables.id);
      if (!fulfillment) return send(200, { data: { orderFulfillmentUpdateTracking: { errors: [{ code: "NOT_FOUND", field: "id" }], order: null, fulfillment: null } } });
      if (!query.includes("notifyCustomer: false")) return send(400, { error: "notifications_forbidden_in_fixture" });
      fulfillment.trackingNumber = variables.trackingNumber;
      return send(200, { data: { orderFulfillmentUpdateTracking: { errors: [], fulfillment, order: { id: order.id, channel: order.channel } } } });
    }
    if (query.includes("query OpsTrackingQueue") || query.includes("query OpsTrackingOrders")) return send(200, { data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: orders.filter(order => order.channel.slug === variables.channel && (!variables.ids || variables.ids.includes(order.id))).map(node => ({ node })) } } });
    return send(400, { errors: [{ message: "unsupported fixture query" }] });
  } catch { send(400, { errors: [{ message: "invalid fixture request" }] }); }
}).listen(port, "127.0.0.1", () => console.log(`Tracking fixture ready on loopback:${port}`));
