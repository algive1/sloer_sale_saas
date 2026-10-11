import { assertPluginActive, pluginPauseReason } from "@/plugins/system/runtime.server";
import "server-only";
import { createHash } from "node:crypto";
import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { fetchSaleorOrdersPage, fetchSaleorOrder, type OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import { reminderSkipReason, reminderDueStage, reminderCooldown } from "./policy";
import { LEGACY_SCOPE, reminderScope, reminderScopes, type ReminderScope } from "./config";
export { getReminderSites } from "./config";

export type PaymentReminderRule = {
	enabled: boolean;
	firstAfterHours: number;
	secondAfterHours: number;
	dailyLimit: number;
};
export type ReminderResult = { status: "sent" | "skipped" | "failed"; reason?: string };
type Stage = "manual" | "first" | "second";
const DEFAULT_RULE: PaymentReminderRule = {
	enabled: false,
	firstAfterHours: 24,
	secondAfterHours: 72,
	dailyLimit: 5,
};
const dayAgo = () => new Date(Date.now() - 86400000).toISOString();

export function reminderEmailConfigured(siteId?: string): boolean {
	return reminderUnavailableReason(siteId) === null;
}
export function reminderUnavailableReason(siteId?: string): string | null {
	const paused = pluginPauseReason("payment-reminders");
	if (paused) return paused;
	try {
		const scopes = siteId === undefined ? reminderScopes() : [reminderScope(siteId)];
		return scopes.some((s) => s.emailReady)
			? null
			: scopes[0]?.id === LEGACY_SCOPE
				? "email_not_configured"
				: "brand_sender_not_configured";
	} catch {
		return "brand_configuration_invalid";
	}
}

let initialized: Promise<void> | null = null;
async function schema() {
	if (!analyticsDatabaseConfigured()) throw new Error("analytics_not_configured");
	if (!initialized)
		initialized = libsqlPipeline([
			{
				sql: "CREATE TABLE IF NOT EXISTS ops_reminder_rule (id INTEGER PRIMARY KEY CHECK (id=1), enabled INTEGER NOT NULL DEFAULT 0, first_after_hours INTEGER NOT NULL DEFAULT 24, second_after_hours INTEGER NOT NULL DEFAULT 72, daily_limit INTEGER NOT NULL DEFAULT 5, updated_at TEXT NOT NULL)",
			},
			{
				sql: "CREATE TABLE IF NOT EXISTS ops_reminder_delivery (order_id TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, claimed_at TEXT NOT NULL, sent_at TEXT, provider_id TEXT, error TEXT, PRIMARY KEY(order_id,stage))",
			},
			{
				sql: "CREATE TABLE IF NOT EXISTS ops_reminder_site_rule (site_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, first_after_hours INTEGER NOT NULL, second_after_hours INTEGER NOT NULL, daily_limit INTEGER NOT NULL, updated_at TEXT NOT NULL)",
			},
			{
				sql: "CREATE TABLE IF NOT EXISTS ops_reminder_site_delivery (site_id TEXT NOT NULL, order_id TEXT NOT NULL, order_number TEXT NOT NULL, channel TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, claimed_at TEXT NOT NULL, sent_at TEXT, provider_id TEXT, error TEXT, PRIMARY KEY(site_id,order_id,stage))",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS ops_reminder_site_daily ON ops_reminder_site_delivery(site_id,claimed_at)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS ops_reminder_order_attempt ON ops_reminder_site_delivery(order_id,stage)",
			},
			// Preserve existing single-site limits/history without enabling any new brand.
			{
				sql: "INSERT OR IGNORE INTO ops_reminder_site_rule SELECT ?,enabled,first_after_hours,second_after_hours,daily_limit,updated_at FROM ops_reminder_rule WHERE id=1",
				args: [LEGACY_SCOPE],
			},
			{
				sql: "INSERT OR IGNORE INTO ops_reminder_site_delivery SELECT ?,order_id,'','',stage,status,claimed_at,sent_at,provider_id,error FROM ops_reminder_delivery",
				args: [LEGACY_SCOPE],
			},
		])
			.then(() => undefined)
			.catch((e) => {
				initialized = null;
				throw e;
			});
	return initialized;
}
export async function getReminderRule(siteId?: string): Promise<PaymentReminderRule> {
	const scope = reminderScope(siteId);
	await schema();
	const [result] = await libsqlPipeline([
		{
			sql: "SELECT enabled,first_after_hours,second_after_hours,daily_limit FROM ops_reminder_site_rule WHERE site_id=?",
			args: [scope.id],
			wantRows: true,
		},
	]);
	const row = hranaRowsToObjects(result)[0];
	return row
		? {
				enabled: Number(row.enabled) === 1,
				firstAfterHours: Number(row.first_after_hours),
				secondAfterHours: Number(row.second_after_hours),
				dailyLimit: Number(row.daily_limit),
			}
		: { ...DEFAULT_RULE };
}
export async function setReminderRule(
	rule: PaymentReminderRule,
	siteId?: string,
): Promise<PaymentReminderRule> {
	assertPluginActive("payment-reminders");
	const scope = reminderScope(siteId);
	if (rule.enabled && !scope.emailReady) throw new Error("email_not_configured");
	if (
		typeof rule.enabled !== "boolean" ||
		!Number.isInteger(rule.firstAfterHours) ||
		rule.firstAfterHours < 1 ||
		rule.firstAfterHours > 168 ||
		!Number.isInteger(rule.secondAfterHours) ||
		rule.secondAfterHours <= rule.firstAfterHours ||
		rule.secondAfterHours > 720 ||
		!Number.isInteger(rule.dailyLimit) ||
		rule.dailyLimit < 1 ||
		rule.dailyLimit > 20
	)
		throw new Error("invalid_rule");
	await schema();
	await libsqlPipeline([
		{
			sql: "INSERT INTO ops_reminder_site_rule(site_id,enabled,first_after_hours,second_after_hours,daily_limit,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET enabled=excluded.enabled,first_after_hours=excluded.first_after_hours,second_after_hours=excluded.second_after_hours,daily_limit=excluded.daily_limit,updated_at=excluded.updated_at",
			args: [
				scope.id,
				rule.enabled ? 1 : 0,
				rule.firstAfterHours,
				rule.secondAfterHours,
				rule.dailyLimit,
				new Date().toISOString(),
			],
		},
	]);
	return rule;
}
export type ReminderDelivery = {
	orderId: string;
	orderNumber: string;
	channel: string;
	stage: string;
	status: string;
	claimedAt: string;
	sentAt: string;
	error: string;
};
export async function getReminderDeliveries(siteId?: string): Promise<ReminderDelivery[]> {
	const scope = reminderScope(siteId);
	await schema();
	const [result] = await libsqlPipeline([
		{
			sql: "SELECT order_id,order_number,channel,stage,status,claimed_at,sent_at,error FROM ops_reminder_site_delivery WHERE site_id=? ORDER BY claimed_at DESC LIMIT 40",
			args: [scope.id],
			wantRows: true,
		},
	]);
	return hranaRowsToObjects(result).map((r) => ({
		orderId: String(r.order_id),
		orderNumber: String(r.order_number),
		channel: String(r.channel),
		stage: String(r.stage),
		status: String(r.status),
		claimedAt: String(r.claimed_at),
		sentAt: String(r.sent_at ?? ""),
		error: String(r.error ?? ""),
	}));
}

const copy = {
	en: {
		subject: "Payment reminder for order #",
		hello: "Hello,",
		pending: "Payment for your order is still pending.",
		link: "Check your order using its number and your email address:",
		paid: "If you have already paid, please disregard this message.",
		thanks: "Thank you.",
	},
	de: {
		subject: "Zahlungserinnerung für Bestellung #",
		hello: "Guten Tag,",
		pending: "Die Zahlung für Ihre Bestellung steht noch aus.",
		link: "Prüfen Sie Ihre Bestellung mit der Bestellnummer und Ihrer E-Mail-Adresse:",
		paid: "Falls Sie bereits bezahlt haben, ignorieren Sie bitte diese Nachricht.",
		thanks: "Vielen Dank.",
	},
	fr: {
		subject: "Rappel de paiement pour la commande #",
		hello: "Bonjour,",
		pending: "Le paiement de votre commande est toujours en attente.",
		link: "Consultez votre commande avec son numéro et votre adresse e-mail :",
		paid: "Si vous avez déjà payé, veuillez ignorer ce message.",
		thanks: "Merci.",
	},
	es: {
		subject: "Recordatorio de pago del pedido #",
		hello: "Hola,",
		pending: "El pago de su pedido sigue pendiente.",
		link: "Consulte su pedido con el número de pedido y su correo electrónico:",
		paid: "Si ya ha pagado, ignore este mensaje.",
		thanks: "Gracias.",
	},
	zh: {
		subject: "订单付款提醒 #",
		hello: "您好，",
		pending: "您的订单仍在等待付款。",
		link: "您可以使用订单编号和邮箱查询订单：",
		paid: "如果您已经付款，请忽略此邮件。",
		thanks: "感谢您的支持。",
	},
};
async function sendEmail(order: OpsOrder, scope: ReminderScope, stage: Stage): Promise<string> {
	const c = copy[scope.locale];
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		signal: AbortSignal.timeout(10000),
		headers: {
			authorization: "Bearer " + scope.apiKey,
			"content-type": "application/json",
			"Idempotency-Key":
				"reminder/" +
				createHash("sha256")
					.update(JSON.stringify([scope.id, order.id, stage]))
					.digest("hex"),
		},
		body: JSON.stringify({
			from: scope.from,
			to: [order.email],
			subject: c.subject + order.number,
			text: [
				c.hello,
				scope.name + " — #" + order.number,
				c.pending,
				c.link,
				scope.lookupUrl,
				c.paid,
				c.thanks,
			].join("\n\n"),
		}),
	});
	if (!response.ok) throw new Error("email_delivery_http_" + response.status);
	const result = (await response.json()) as { id?: string };
	if (typeof result.id !== "string" || !result.id) throw new Error("email_provider_missing_message_id");
	return result.id;
}
export async function sendReminder(
	order: Pick<OpsOrder, "id">,
	stage: Stage,
	siteId?: string,
): Promise<ReminderResult> {
	const unavailable = reminderUnavailableReason(siteId);
	if (unavailable) return { status: "skipped", reason: unavailable };
	const live = await fetchSaleorOrder(order.id);
	if (!live) return { status: "skipped", reason: "order_not_found_or_saleor_unavailable" };
	const scopes = reminderScopes();
	const scope =
		scopes[0]?.id === LEGACY_SCOPE ? scopes[0] : scopes.find((s) => s.channels.includes(live.channel ?? ""));
	if (!scope) return { status: "skipped", reason: "order_brand_unknown" };
	if (siteId !== undefined && scope.id !== siteId)
		return { status: "skipped", reason: "order_brand_mismatch" };
	if (!scope.emailReady) return { status: "skipped", reason: "brand_sender_not_configured" };
	const invalid = reminderSkipReason(live);
	if (invalid) return { status: "skipped", reason: invalid };
	const rule = await getReminderRule(scope.id);
	if (stage !== "manual" && !rule.enabled) return { status: "skipped", reason: "rule_disabled" };
	if (stage !== "manual" && Date.parse(live.createdAt) < Date.now() - (rule.secondAfterHours + 24) * 3600000)
		return { status: "skipped", reason: "outside_reminder_window" };
	const [daily, recent] = await libsqlPipeline([
		{
			sql: "SELECT COUNT(*) AS count FROM ops_reminder_site_delivery WHERE site_id=? AND claimed_at>=?",
			args: [scope.id, dayAgo()],
			wantRows: true,
		},
		{
			sql: "SELECT MAX(CASE WHEN status='sent' THEN sent_at END) AS last_sent, MAX(CASE WHEN stage='first' AND status='sent' THEN 1 ELSE 0 END) AS first_sent FROM ops_reminder_site_delivery WHERE order_id=?",
			args: [live.id],
			wantRows: true,
		},
	]);
	if (Number(hranaRowsToObjects(daily)[0]?.count ?? 0) >= rule.dailyLimit)
		return { status: "skipped", reason: "daily_limit" };
	const recentRow = hranaRowsToObjects(recent)[0];
	if (
		stage !== "manual" &&
		reminderDueStage({
			createdAt: live.createdAt,
			firstHours: rule.firstAfterHours,
			secondHours: rule.secondAfterHours,
			firstSent: Number(recentRow?.first_sent) === 1,
			now: Date.now(),
		}) !== stage
	)
		return { status: "skipped", reason: "not_due" };
	if (reminderCooldown(typeof recentRow?.last_sent === "string" ? recentRow.last_sent : null, Date.now()))
		return { status: "skipped", reason: "24_hour_cooldown" };
	// Atomic claim: brand quota, globally unique order stage and cross-stage cooldown.
	// Sending/failed attempts stay claimed, including an uncertain provider timeout.
	const [claimed] = await libsqlPipeline([
		{
			sql: `INSERT OR IGNORE INTO ops_reminder_site_delivery(site_id,order_id,order_number,channel,stage,status,claimed_at)
    SELECT ?,?,?,?,?,'sending',?
    WHERE (SELECT COUNT(*) FROM ops_reminder_site_delivery WHERE site_id=? AND claimed_at>=?) < ?
    AND NOT EXISTS (SELECT 1 FROM ops_reminder_site_delivery WHERE order_id=? AND
      (stage=? OR status IN ('sending','failed') OR (status='sent' AND sent_at>=?)))`,
			args: [
				scope.id,
				live.id,
				live.number,
				live.channel ?? "",
				stage,
				new Date().toISOString(),
				scope.id,
				dayAgo(),
				rule.dailyLimit,
				live.id,
				stage,
				dayAgo(),
			],
		},
	]);
	if (!claimed?.affected_row_count) return { status: "skipped", reason: "already_attempted" };
	let providerId: string;
	try {
		providerId = await sendEmail(live, scope, stage);
	} catch (error) {
		// Persist only controlled error codes; upstream messages/keys/customer data are not logged.
		const message =
			error instanceof Error &&
			/^(email_delivery_http_\d{3}|email_provider_missing_message_id)$/.test(error.message)
				? error.message
				: "email_delivery_uncertain";
		await libsqlPipeline([
			{
				sql: "UPDATE ops_reminder_site_delivery SET status='failed',error=? WHERE site_id=? AND order_id=? AND stage=?",
				args: [message, scope.id, live.id, stage],
			},
		]);
		return { status: "failed", reason: "delivery_failed" };
	}
	// If this write fails, retain 'sending' and propagate the unknown status.
	// Do not mislabel a successfully submitted email as a definite provider failure.
	await libsqlPipeline([
		{
			sql: "UPDATE ops_reminder_site_delivery SET status='sent',sent_at=?,provider_id=? WHERE site_id=? AND order_id=? AND stage=?",
			args: [new Date().toISOString(), providerId, scope.id, live.id, stage],
		},
	]);
	return { status: "sent" };
}
export async function sendManualReminder(orderId: string, siteId?: string): Promise<ReminderResult> {
	if (!orderId || orderId.length > 300)
		return { status: "skipped", reason: "order_not_found_or_saleor_unavailable" };
	return sendReminder({ id: orderId }, "manual", siteId);
}
export type AutomaticReminderRun = {
	sent: number;
	skipped: number;
	failed: number;
	scanned: number;
	truncated: boolean;
	reason?: string;
};
async function runScope(scope: ReminderScope): Promise<AutomaticReminderRun> {
	const result: AutomaticReminderRun = { sent: 0, skipped: 0, failed: 0, scanned: 0, truncated: false };
	if (!scope.emailReady) return { ...result, reason: "brand_sender_not_configured" };
	try {
		const rule = await getReminderRule(scope.id);
		if (!rule.enabled) return result;
		const [daily] = await libsqlPipeline([
			{
				sql: "SELECT COUNT(*) AS count FROM ops_reminder_site_delivery WHERE site_id=? AND claimed_at>=?",
				args: [scope.id, dayAgo()],
				wantRows: true,
			},
		]);
		let attempts = Number(hranaRowsToObjects(daily)[0]?.count ?? 0);
		const cutoff = Date.now() - (rule.secondAfterHours + 24) * 3600000;
		// Each channel starts a separate cursor. Daily quota is shared across a brand's channels.
		for (const channel of scope.channels.length ? scope.channels : [undefined]) {
			let cursor: string | undefined;
			for (let pageIndex = 0; pageIndex < 20 && attempts < rule.dailyLimit; pageIndex++) {
				const page = await fetchSaleorOrdersPage(100, cursor, channel);
				if (!page) {
					result.reason = "saleor_unavailable";
					return result;
				}
				let reachedCutoff = false;
				const ids = page.orders.map((o) => o.id);
				const firstStatus = new Map<string, string>();
				if (ids.length) {
					const [rows] = await libsqlPipeline([
						{
							sql:
								"SELECT order_id,status FROM ops_reminder_site_delivery WHERE site_id=? AND stage='first' AND order_id IN (" +
								ids.map(() => "?").join(",") +
								")",
							args: [scope.id, ...ids],
							wantRows: true,
						},
					]);
					for (const row of hranaRowsToObjects(rows))
						firstStatus.set(String(row.order_id), String(row.status));
				}
				for (const order of page.orders) {
					if (attempts >= rule.dailyLimit) break;
					result.scanned++;
					if (scope.id !== LEGACY_SCOPE && order.channel !== channel) {
						result.skipped++;
						continue;
					}
					const created = Date.parse(order.createdAt);
					if (!Number.isFinite(created)) {
						result.skipped++;
						continue;
					}
					if (created < cutoff) {
						reachedCutoff = true;
						break;
					}
					if (reminderSkipReason(order)) {
						result.skipped++;
						continue;
					}
					const stage = reminderDueStage({
						createdAt: order.createdAt,
						firstHours: rule.firstAfterHours,
						secondHours: rule.secondAfterHours,
						firstSent: firstStatus.get(order.id) === "sent",
						now: Date.now(),
					});
					if (!stage) {
						result.skipped++;
						continue;
					}
					const sent = await sendReminder(order, stage, scope.id);
					if (sent.status === "sent") {
						result.sent++;
						attempts++;
					} else if (sent.status === "failed") {
						result.failed++;
						attempts++;
					} else result.skipped++;
				}
				if (reachedCutoff || !page.hasNextPage) break;
				if (!page.endCursor || page.endCursor === cursor || pageIndex === 19) {
					result.truncated = true;
					break;
				}
				cursor = page.endCursor;
			}
		}
		return result;
	} catch {
		return { ...result, reason: "reminder_run_failed" };
	}
}
export async function runAutomaticReminders(): Promise<
	AutomaticReminderRun & { sites?: Array<AutomaticReminderRun & { siteId: string }> }
> {
	const result: AutomaticReminderRun = { sent: 0, skipped: 0, failed: 0, scanned: 0, truncated: false };
	const unavailable = reminderUnavailableReason();
	if (unavailable) return { ...result, reason: unavailable };
	const sites = [];
	for (const scope of reminderScopes()) {
		// One brand's unavailable Saleor/database must not silently report success.
		let run: AutomaticReminderRun;
		try {
			run = await runScope(scope);
		} catch {
			run = { sent: 0, skipped: 0, failed: 0, scanned: 0, truncated: false, reason: "reminder_run_failed" };
		}
		sites.push({ siteId: scope.id, ...run });
		result.sent += run.sent;
		result.skipped += run.skipped;
		result.failed += run.failed;
		result.scanned += run.scanned;
		result.truncated ||= run.truncated;
		if (run.reason && run.reason !== "brand_sender_not_configured")
			result.reason = "one_or_more_brands_unavailable";
	}
	return { ...result, sites };
}
