"use client";
import { useOpsI18n } from "@/lib/ops/i18n.client";
import type { OpsI18n } from "@/lib/ops/i18n";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackingQueue } from "@/lib/ops/tracking";
import {
	TRACKING_STATUS_LABELS,
	TRACKING_REASON_LABELS,
	trackingTemplate,
	trackingResultsCsv,
	type TrackingPreview,
	type TrackingResult,
} from "@/lib/ops/tracking-csv";

const errorLabels = (i18n: OpsI18n): Record<string, string> => {
	const { t } = i18n;
	return {
		invalid_tracking_csv: t(
			"CSV格式错误。请使用当前三列模板，每批1–10笔；不得重复履约ID，单号仅支持字母、数字、空格及 . _ -。",
		),
		tracking_preview_expired_or_changed: t("预检已过期或内容已变化，请重新预检。"),
		tracking_orders_changed_reload: t("原生付款、履约或单号已变化，本批尚未提交，请重新预检。"),
		tracking_audit_required: t("审计存储未配置，禁止回填。"),
		tracking_credential_required: t("原生专用凭证未配置。"),
	};
};
function download(filename: string, contents: string) {
	const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
export function TrackingImport({
	queue,
	auditAvailable,
	dashboard,
}: {
	queue: TrackingQueue;
	auditAvailable: boolean;
	dashboard: string | null;
}) {
	const i18n = useOpsI18n();
	const { t } = i18n;

	const router = useRouter();
	const [selected, setSelected] = useState<string[]>([]);
	const [csv, setCsv] = useState("");
	const [preview, setPreview] = useState<TrackingPreview | null>(null);
	const [results, setResults] = useState<TrackingResult[] | null>(null);
	const [confirmed, setConfirmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	function change(value: string) {
		setCsv(value);
		setPreview(null);
		setResults(null);
		setConfirmed(false);
		setMessage("");
	}
	async function send(action: "preview" | "commit") {
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch(`/ops/sites/${encodeURIComponent(queue.siteId)}/tracking/api`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-requested-with": "tracking-import" },
				body: JSON.stringify({
					action,
					channel: queue.channel,
					csv,
					previewId: preview?.id,
					confirm: confirmed,
				}),
			});
			const data: unknown = await response.json();
			if (!response.ok)
				throw new Error(
					errorLabels(i18n)[(data as { error?: string }).error ?? ""] ??
						t("服务不可用。提交期间失败可能已写入部分原生记录，请查看原生履约及审计后重新预检。"),
				);
			if (action === "preview") {
				const output = data as TrackingPreview;
				setPreview(output);
				setResults(null);
				setConfirmed(false);
				setMessage(
					output.canSubmit
						? t("预检通过，确认后才会回填。预检有效期5分钟。")
						: t("存在冲突或不符合条件的记录，本批不可提交。请修正CSV后重新预检。"),
				);
			} else {
				setResults((data as { rows: TrackingResult[] }).rows);
				setPreview(null);
				setConfirmed(false);
				setMessage(t("逐笔结果已返回。请检查待核对或未执行记录，确认不代表物流投递成功。"));
				router.refresh();
			}
		} catch (error) {
			setPreview(null);
			setConfirmed(false);
			setMessage(error instanceof Error ? t(error.message) : t("请求失败，请核对原生履约后重新预检。"));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-5">
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="font-semibold">{t("1. 选择已有履约，下载回填模板")}</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{t(
						"模板只包含订单ID、履约ID和待填写的单号。不同包裹使用各自的履约ID；已有单号的包裹请在原生后台核对。",
					)}
				</p>
				<div className="mt-4 flex flex-wrap gap-3">
					<button
						disabled={!selected.length || busy}
						onClick={() =>
							download(
								`${queue.siteId}-${queue.channel}-tracking.csv`,
								trackingTemplate(queue.rows.filter((row) => selected.includes(row.fulfillmentId))),
							)
						}
						className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
					>
						{t("下载所选模板（")}
						{selected.length}/10）
					</button>
					<button
						disabled={busy}
						onClick={() => download("tracking-template.csv", trackingTemplate())}
						className="rounded-lg border border-border px-4 py-2 text-sm"
					>
						{t("空白模板")}
					</button>
				</div>
				<ul className="mt-4 space-y-3">
					{queue.rows.map((row) => (
						<li key={row.fulfillmentId} className="rounded-lg border border-border p-3 text-sm">
							<label className="flex items-start gap-3">
								<input
									type="checkbox"
									aria-label={t("选择履约 {v0}", { v0: row.fulfillmentId })}
									checked={selected.includes(row.fulfillmentId)}
									disabled={
										busy ||
										!!row.trackingNumber ||
										(!selected.includes(row.fulfillmentId) && selected.length >= 10)
									}
									onChange={(event) =>
										setSelected((ids) =>
											event.target.checked
												? [...ids, row.fulfillmentId]
												: ids.filter((id) => id !== row.fulfillmentId),
										)
									}
									className="mt-1"
								/>
								<span className="min-w-0 break-all">
									<b>
										{t("订单 #")}
										{row.orderNumber}
									</b>
									<br />
									{t("履约")}
									{row.fulfillmentId}
									<br />
									<span className="text-muted-foreground">
										{row.trackingNumber ? t("已有单号：{v0}", { v0: row.trackingNumber }) : t("尚未填写单号")}
									</span>
								</span>
							</label>
						</li>
					))}
				</ul>
				{!queue.rows.length && (
					<p className="mt-4 text-sm">
						{t("当前页没有符合条件的已发出实物履约。请先完成原生发货，或检查下一页。")}
					</p>
				)}
			</section>
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="font-semibold">{t("2. 上传并预检货代单号")}</h2>
				<label className="mt-4 block text-sm">
					{t("选择单号CSV")}
					<input
						type="file"
						accept=".csv,text/csv"
						disabled={busy}
						className="mt-2 block w-full text-sm"
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							if (file.size > 64_000) {
								change("");
								setMessage(t("文件最大64KB。"));
								return;
							}
							try {
								change(await file.text());
							} catch {
								change("");
								setMessage(t("无法读取文件。"));
							}
						}}
					/>
				</label>
				<label className="mt-4 block text-sm">
					{t("单号CSV内容")}
					<textarea
						value={csv}
						disabled={busy}
						onChange={(event) => change(event.target.value)}
						rows={5}
						className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-xs"
					/>
				</label>
				<button
					disabled={busy || !csv.trim() || !auditAvailable}
					onClick={() => void send("preview")}
					className="mt-3 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
				>
					{busy ? t("正在处理…") : t("预检单号")}
				</button>
				{preview && (
					<>
						<ul className="mt-4 space-y-2">
							{preview.rows.map((row) => (
								<li key={row.fulfillmentId} className="break-all rounded-lg border border-border p-3 text-sm">
									{t("第")}
									{row.row}
									{t("行 ·")}
									{row.orderNumber ? t("订单 #{v0}", { v0: row.orderNumber }) : row.orderId} ·{" "}
									{row.trackingNumber}
									<br />
									<strong>{t(TRACKING_STATUS_LABELS[row.status])}</strong>
								</li>
							))}
						</ul>
						<label className="mt-4 flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								checked={confirmed}
								disabled={busy || !preview.canSubmit}
								onChange={(event) => setConfirmed(event.target.checked)}
								className="mt-1"
							/>
							{t("我已核对货代与包裹对应关系，确认回填且不发送顾客邮件。")}
						</label>
						<button
							disabled={busy || !preview.canSubmit || !confirmed}
							onClick={() => void send("commit")}
							className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
						>
							{t("确认回填单号")}
						</button>
					</>
				)}
				<p role="status" aria-live="polite" className="mt-4 break-words text-sm">
					{message}
				</p>
				{results && (
					<>
						<ul className="mt-4 space-y-3">
							{results.map((row) => (
								<li key={row.fulfillmentId} className="break-all rounded-lg border border-border p-3 text-sm">
									{t("第")}
									{row.row}
									{t("行 ·")}
									{row.trackingNumber} · <b>{t(TRACKING_STATUS_LABELS[row.status])}</b>
									<br />
									<span className="text-xs text-muted-foreground">
										{t(TRACKING_REASON_LABELS[row.reason] ?? "请核对原生履约和历史")} {t("· 审计")}
										{row.attemptId ?? t("未取得，请查看历史")}
									</span>
									{dashboard && (
										<a
											href={`${dashboard}/orders/${encodeURIComponent(row.orderId)}`}
											target="_blank"
											rel="noreferrer"
											className="mt-2 block underline"
										>
											{t("核对原生履约 ↗")}
										</a>
									)}
								</li>
							))}
						</ul>
						<button
							onClick={() => download(`${queue.siteId}-tracking-results.csv`, trackingResultsCsv(results))}
							className="mt-4 rounded-lg border border-border px-4 py-2 text-sm"
						>
							{t("下载逐笔结果")}
						</button>
					</>
				)}
			</section>
		</div>
	);
}
