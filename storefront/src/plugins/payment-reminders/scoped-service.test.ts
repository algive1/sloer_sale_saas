import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpsOrder } from "@/lib/analytics/saleor-ops-orders";

const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, failSentWrite: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/saleor-ops-orders", () => ({
	fetchSaleorOrder: vi.fn(),
	fetchSaleorOrdersPage: vi.fn(),
}));
vi.mock("@/lib/storage/libsql-http", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/lib/storage/libsql-http")>();
	return {
		...original,
		analyticsDatabaseConfigured: () => true,
		// Execute the production SQL against SQLite, rather than matching query strings.
		libsqlPipeline: vi.fn(
			async (
				statements: Array<{
					sql: string;
					args?: Array<string | number | boolean | null>;
					wantRows?: boolean;
				}>,
			) =>
				statements.map((s) => {
					if (state.failSentWrite && s.sql.includes("SET status='sent'"))
						throw new Error("database write failed");
					const stmt = state.db!.prepare(s.sql);
					const args = (s.args ?? []).map((a) => (typeof a === "boolean" ? Number(a) : a));
					if (!s.wantRows)
						return { cols: [], rows: [], affected_row_count: Number(stmt.run(...args).changes) };
					const rows = stmt.all(...args);
					const names = stmt.columns().map((c) => c.name);
					return {
						cols: names.map((name) => ({ name })),
						rows: rows.map((r) =>
							names.map((name) => {
								const v = r[name];
								return v === null
									? { type: "null" }
									: typeof v === "number"
										? { type: "float", value: v }
										: { type: "text", value: String(v) };
							}),
						),
					};
				}),
		),
	};
});

import { fetchSaleorOrder, fetchSaleorOrdersPage } from "@/lib/analytics/saleor-ops-orders";
const sites = [
	{
		id: "fashion",
		name: "Fashion",
		domains: ["fashion.example"],
		channels: ["fashion-us", "fashion-eu"],
		defaultChannel: "fashion-us",
	},
	{
		id: "jewelry",
		name: "Jewelry",
		domains: ["jewelry.example"],
		channels: ["jewelry-us"],
		defaultChannel: "jewelry-us",
	},
];
const senders = [
	{ siteId: "fashion", from: "Fashion <orders@fashion.example>", locale: "de" },
	{ siteId: "jewelry", from: "Jewelry <orders@jewelry.example>", locale: "fr" },
];
const pending = (id: string, channel = "fashion-us"): OpsOrder => ({
	id,
	channel,
	number: id,
	createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
	paidAt: null,
	country: "DE",
	source: "direct",
	status: "UNFULFILLED",
	paymentStatus: "NOT_CHARGED",
	authorizeStatus: "NONE",
	isPaid: false,
	hasRefund: false,
	amount: 10,
	currency: "EUR",
	paymentMethod: "—",
	thumbnailUrl: "",
	productName: "Hat",
	email: "customer@example.test",
});
const rule = { enabled: true, firstAfterHours: 24, secondAfterHours: 72, dailyLimit: 5 };
let service: typeof import("./service");
let mail: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	vi.resetModules();
	state.db = new DatabaseSync(":memory:");
	state.failSentWrite = false;
	vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify(sites));
	vi.stubEnv("PAYMENT_REMINDER_SITES_JSON", JSON.stringify(senders));
	vi.stubEnv("RESEND_API_KEY", "not-a-real-key");
	vi.stubEnv("PAYMENT_REMINDER_FROM", "Wrong <orders@wrong-global.example>");
	vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://wrong-global.example");
	vi.mocked(fetchSaleorOrder).mockReset();
	vi.mocked(fetchSaleorOrder).mockImplementation(async (id) => pending(id));
	vi.mocked(fetchSaleorOrdersPage).mockReset();
	mail = vi.fn(async () => Response.json({ id: "provider-test-id" }));
	vi.stubGlobal("fetch", mail);
	service = await import("./service");
});
afterEach(() => {
	state.db!.close();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("brand configuration and migration", () => {
	it("does not serialize the API key and never uses the global sender/URL for brands", () => {
		const result = service.getReminderSites();
		expect(result[0]).toMatchObject({
			id: "fashion",
			from: senders[0].from,
			locale: "de",
			lookupUrl: "https://fashion.example/order/find",
		});
		expect(JSON.stringify(result)).not.toMatch(/not-a-real-key|wrong-global|apiKey/);
	});
	it("missing explicit sender stops before any Saleor, storage or provider work", async () => {
		vi.stubEnv("PAYMENT_REMINDER_SITES_JSON", "");
		expect(await service.sendManualReminder("1")).toMatchObject({
			status: "skipped",
			reason: "brand_sender_not_configured",
		});
		expect(fetchSaleorOrder).not.toHaveBeenCalled();
		expect(mail).not.toHaveBeenCalled();
		expect(state.db!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
	});
	it.each(
		[
			[{ siteId: "fashion", from: "orders@jewelry.example", locale: "en" }],
			[{ siteId: "unregistered", from: "orders@fashion.example", locale: "en" }],
			[{ siteId: "fashion", from: "orders@fashion.example\nBcc: x@example.test", locale: "en" }],
			[{ siteId: "fashion", from: "orders@fashion.example", locale: "invalid" }],
			[senders[0], senders[0]],
		].map((entries) => ({ entries })),
	)("rejects invalid brand mail configuration %# without network fallback", async ({ entries }) => {
		vi.stubEnv("PAYMENT_REMINDER_SITES_JSON", JSON.stringify(entries));
		expect(await service.sendManualReminder("1")).toMatchObject({ reason: "brand_configuration_invalid" });
		expect(fetchSaleorOrder).not.toHaveBeenCalled();
		expect(mail).not.toHaveBeenCalled();
	});
	it("requires a trusted brand selection for both rule reads and writes", async () => {
		await expect(service.getReminderRule()).rejects.toThrow("reminder_site_required");
		await expect(service.setReminderRule(rule, "foreign")).rejects.toThrow("invalid_reminder_site");
	});
	it("keeps enabled global rules and old delivery claims only in the legacy scope", async () => {
		state.db!.exec(
			"CREATE TABLE ops_reminder_rule(id INTEGER PRIMARY KEY,enabled INTEGER,first_after_hours INTEGER,second_after_hours INTEGER,daily_limit INTEGER,updated_at TEXT); INSERT INTO ops_reminder_rule VALUES(1,1,12,48,2,'2026-10-10'); CREATE TABLE ops_reminder_delivery(order_id TEXT,stage TEXT,status TEXT,claimed_at TEXT,sent_at TEXT,provider_id TEXT,error TEXT,PRIMARY KEY(order_id,stage)); INSERT INTO ops_reminder_delivery VALUES('old-order','manual','failed','2026-10-10',NULL,NULL,'timeout')",
		);
		expect((await service.getReminderRule("fashion")).enabled).toBe(false);
		expect(await service.getReminderDeliveries("fashion")).toEqual([]);
		expect((await service.sendManualReminder("old-order", "fashion")).reason).toBe("already_attempted");
		vi.stubEnv("STOREFRONT_SITES_JSON", "");
		expect(await service.getReminderRule()).toMatchObject({
			enabled: true,
			firstAfterHours: 12,
			dailyLimit: 2,
		});
		expect(await service.getReminderDeliveries()).toHaveLength(1);
	});
	it("saving one brand rule leaves the other brand disabled with its own default quota", async () => {
		await service.setReminderRule({ ...rule, dailyLimit: 1 }, "fashion");
		expect(await service.getReminderRule("fashion")).toMatchObject({ enabled: true, dailyLimit: 1 });
		expect(await service.getReminderRule("jewelry")).toMatchObject({ enabled: false, dailyLimit: 5 });
	});
});

describe("authoritative order ownership and atomic claims", () => {
	it("rejects a forged selection and a fresh order moved to another channel", async () => {
		vi.mocked(fetchSaleorOrder).mockResolvedValue(pending("1", "jewelry-us"));
		expect(await service.sendReminder(pending("1"), "manual", "fashion")).toMatchObject({
			reason: "order_brand_mismatch",
		});
		expect(mail).not.toHaveBeenCalled();
	});
	it("does not use global identity for orders with absent or unknown channel", async () => {
		vi.mocked(fetchSaleorOrder).mockResolvedValue({ ...pending("1"), channel: undefined });
		expect((await service.sendManualReminder("1")).reason).toBe("order_brand_unknown");
		expect(mail).not.toHaveBeenCalled();
	});
	it("resolves manual sends from the live order channel and sends the correct localized brand", async () => {
		vi.mocked(fetchSaleorOrder).mockResolvedValue(pending("1", "jewelry-us"));
		expect((await service.sendManualReminder("1")).status).toBe("sent");
		const payload = JSON.parse(String(mail.mock.calls[0][1].body)) as {
			from: string;
			subject: string;
			text: string;
		};
		expect(payload.from).toBe(senders[1].from);
		expect(payload.subject).toContain("Rappel de paiement");
		expect(payload.text).toContain("https://jewelry.example/order/find");
		expect(payload.text).not.toContain("fashion.example");
		expect(await service.getReminderDeliveries("fashion")).toHaveLength(0);
		expect(await service.getReminderDeliveries("jewelry")).toHaveLength(1);
	});
	it("revalidates a paid order and skips it even with a configured brand sender", async () => {
		vi.mocked(fetchSaleorOrder).mockResolvedValue({ ...pending("1"), isPaid: true });
		expect((await service.sendManualReminder("1", "fashion")).reason).toBe("already_paid");
		expect(mail).not.toHaveBeenCalled();
	});
	it("two concurrent requests for one order produce one provider call", async () => {
		const results = await Promise.all([
			service.sendManualReminder("1", "fashion"),
			service.sendManualReminder("1", "fashion"),
		]);
		expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
		expect(mail).toHaveBeenCalledTimes(1);
	});
	it("enforces the brand cap atomically while allowing a second brand its own quota", async () => {
		await service.setReminderRule({ ...rule, dailyLimit: 1 }, "fashion");
		const results = await Promise.all([
			service.sendManualReminder("1", "fashion"),
			service.sendManualReminder("2", "fashion"),
		]);
		expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
		vi.mocked(fetchSaleorOrder).mockResolvedValue(pending("3", "jewelry-us"));
		expect((await service.sendManualReminder("3", "jewelry")).status).toBe("sent");
		expect(await service.getReminderDeliveries("fashion")).toHaveLength(1);
		expect(await service.getReminderDeliveries("jewelry")).toHaveLength(1);
	});
	it("failed/uncertain attempts consume quota and are never retried, even with a different stage", async () => {
		await service.setReminderRule({ ...rule, dailyLimit: 1 }, "fashion");
		mail.mockRejectedValue(new Error("secret api key from upstream"));
		expect((await service.sendManualReminder("1", "fashion")).status).toBe("failed");
		expect((await service.sendManualReminder("1", "fashion")).status).toBe("skipped");
		expect((await service.sendReminder({ id: "2" }, "first", "fashion")).reason).toBe("daily_limit");
		expect(mail).toHaveBeenCalledTimes(1);
		expect((await service.getReminderDeliveries("fashion"))[0].error).toBe("email_delivery_uncertain");
	});
	it("a failed first attempt also blocks a different reminder stage with remaining quota", async () => {
		await service.setReminderRule(rule, "fashion");
		mail.mockRejectedValue(new Error("timeout"));
		expect((await service.sendReminder({ id: "1" }, "first", "fashion")).status).toBe("failed");
		expect((await service.sendManualReminder("1", "fashion")).reason).toBe("already_attempted");
		expect(mail).toHaveBeenCalledTimes(1);
	});
	it("allows a previously enabled brand rule to be switched off after provider config disappears", async () => {
		await service.setReminderRule(rule, "fashion");
		vi.stubEnv("RESEND_API_KEY", "");
		expect((await service.setReminderRule({ ...rule, enabled: false }, "fashion")).enabled).toBe(false);
	});
	it("retains an in-flight claim if provider success cannot be saved", async () => {
		state.failSentWrite = true;
		await expect(service.sendManualReminder("1", "fashion")).rejects.toThrow("database write failed");
		state.failSentWrite = false;
		expect((await service.getReminderDeliveries("fashion"))[0].status).toBe("sending");
		expect((await service.sendManualReminder("1", "fashion")).reason).toBe("already_attempted");
		expect(mail).toHaveBeenCalledTimes(1);
	});
	it("uses a bounded deterministic provider idempotency key for long order ids", async () => {
		await service.sendManualReminder("x".repeat(300), "fashion");
		expect(mail.mock.calls[0][1].headers["Idempotency-Key"]).toMatch(/^reminder\/[a-f0-9]{64}$/);
	});
});

describe("scheduled brand scans", () => {
	it("does not scan or send for disabled brands", async () => {
		const result = await service.runAutomaticReminders();
		expect(result.sent).toBe(0);
		expect(fetchSaleorOrdersPage).not.toHaveBeenCalled();
		expect(mail).not.toHaveBeenCalled();
	});
	it("filters each query by trusted channel and rejects foreign rows before fresh lookup", async () => {
		await service.setReminderRule(rule, "fashion");
		vi.mocked(fetchSaleorOrdersPage).mockImplementation(async (_first, _cursor, channel) => ({
			orders: channel === "fashion-us" ? [pending("foreign", "jewelry-us"), pending("own")] : [],
			hasNextPage: false,
			endCursor: null,
		}));
		const result = await service.runAutomaticReminders();
		expect(result.sent).toBe(1);
		expect(result.skipped).toBe(1);
		expect(fetchSaleorOrder).toHaveBeenCalledWith("own");
		expect(fetchSaleorOrder).not.toHaveBeenCalledWith("foreign");
		expect(fetchSaleorOrdersPage).toHaveBeenCalledWith(100, undefined, "fashion-us");
		expect(fetchSaleorOrdersPage).toHaveBeenCalledWith(100, undefined, "fashion-eu");
		expect(fetchSaleorOrdersPage).not.toHaveBeenCalledWith(100, undefined, "jewelry-us");
	});
	it("preserves confirmed partial counts when a later page fails", async () => {
		await service.setReminderRule(rule, "fashion");
		vi.mocked(fetchSaleorOrdersPage)
			.mockResolvedValueOnce({ orders: [pending("1")], hasNextPage: true, endCursor: "next" })
			.mockRejectedValueOnce(new Error("Saleor down"));
		const result = await service.runAutomaticReminders();
		expect(result.sent).toBe(1);
		expect(result.reason).toBe("one_or_more_brands_unavailable");
		expect(result.sites?.[0]).toMatchObject({ sent: 1, reason: "reminder_run_failed" });
	});
	it("does not let direct automatic calls bypass disabled rules or send second before first", async () => {
		expect((await service.sendReminder({ id: "1" }, "first", "fashion")).reason).toBe("rule_disabled");
		await service.setReminderRule(rule, "fashion");
		expect((await service.sendReminder({ id: "1" }, "second", "fashion")).reason).toBe("not_due");
		expect(mail).not.toHaveBeenCalled();
	});
	it("enforces the 24-hour cooldown across manual and automatic stages", async () => {
		await service.setReminderRule(rule, "fashion");
		expect((await service.sendReminder({ id: "1" }, "first", "fashion")).status).toBe("sent");
		vi.mocked(fetchSaleorOrder).mockResolvedValue({
			...pending("1"),
			createdAt: new Date(Date.now() - 80 * 3600000).toISOString(),
		});
		expect((await service.sendReminder({ id: "1" }, "second", "fashion")).reason).toBe("24_hour_cooldown");
		expect((await service.sendManualReminder("1", "fashion")).reason).toBe("24_hour_cooldown");
		expect(mail).toHaveBeenCalledTimes(1);
	});
});
