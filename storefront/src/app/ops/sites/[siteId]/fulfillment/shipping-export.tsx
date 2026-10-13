"use client";
import { useOpsI18n } from "@/lib/ops/i18n.client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentSnapshot } from "@/lib/ops/fulfillment";
export function ShippingExport({
	snapshot,
	dashboard,
}: {
	snapshot: FulfillmentSnapshot;
	dashboard: string | null;
}) {
	const i18n = useOpsI18n();
	const { t } = i18n;

	const router = useRouter();
	const [selected, setSelected] = useState<string[]>([]);
	const [confirmed, setConfirmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function download() {
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch(`/ops/sites/${encodeURIComponent(snapshot.siteId)}/fulfillment/api`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-requested-with": "shipping-export" },
				body: JSON.stringify({ channel: snapshot.channel, orderIds: selected, confirm: confirmed }),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				setMessage(
					body?.error === "export_sku_incomplete"
						? t("剩余实物商品缺SKU，未生成交接文件。请先核对原生订单与商品资料。")
						: response.status === 409
							? t("订单付款、数量或地址发生变化，或资料不完整。请刷新核对后重新选择。")
							: response.status === 403
								? t("请使用个人管理员账户操作。")
								: t("导出失败，请检查订单读取凭证及审计存储。没有生成可下载文件。"),
				);
				return;
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${snapshot.siteId}-${snapshot.channel}-shipping.csv`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setMessage(
				t(
					"已准备 {v0} 行交接资料；记录号 {v1}。请确认文件下载成功，核对后交给货代；导出没有创建发货或扣减库存。",
					{
						v0: response.headers.get("X-Shipping-Export-Rows") ?? "—",
						v1: response.headers.get("X-Shipping-Export-Id") ?? "—",
					},
				),
			);
			setSelected([]);
			setConfirmed(false);
			router.refresh();
		} catch {
			setMessage(t("网络中断，请检查下载记录和文件；确认后再决定是否重新导出。"));
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold">
					{t("待处理订单（当前页")}
					{snapshot.orders.length} {t("笔）")}
				</h2>
				<button
					disabled={busy}
					onClick={() => {
						setSelected([]);
						setConfirmed(false);
						router.refresh();
					}}
					className="rounded-lg border border-border px-3 py-2 text-sm"
				>
					{t("刷新订单")}
				</button>
			</div>
			{!snapshot.orders.length && (
				<p className="text-sm text-muted-foreground">{t("当前市场没有未发货或部分发货订单。")}</p>
			)}
			{snapshot.orders.map((order) => (
				<article key={order.id} className="rounded-xl border border-border bg-card p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							{dashboard && (
								<input
									aria-label={t("选择订单 {v0}", { v0: order.number })}
									type="checkbox"
									disabled={!order.exportable || busy}
									checked={selected.includes(order.id)}
									onChange={(event) =>
										setSelected((current) =>
											event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id),
										)
									}
								/>
							)}
							<h3 className="font-semibold">#{order.number}</h3>
							<span className="text-xs">
								{order.isPaid ? t("已付款") : t("尚未付清")} ·{" "}
								{order.status === "PARTIALLY_FULFILLED" ? t("部分发货") : t("未发货")}
							</span>
						</div>
						{dashboard && (
							<div className="flex gap-3 text-sm">
								<a
									href={`${dashboard}/orders/${encodeURIComponent(order.id)}`}
									target="_blank"
									rel="noopener noreferrer"
									className="underline"
								>
									{t("原生订单 ↗")}
								</a>
								{order.shippingReady && (
									<a
										href={`${dashboard}/orders/${encodeURIComponent(order.id)}/fulfill`}
										target="_blank"
										rel="noopener noreferrer"
										className="underline"
									>
										{t("原生发货 ↗")}
									</a>
								)}
							</div>
						)}
					</div>
					<p className="mt-2 text-xs text-muted-foreground">
						{order.channel} · {order.created}
					</p>
					<ul className="mt-3 space-y-1 text-sm">
						{order.lines.map((line) => (
							<li key={line.id}>
								{line.productSku || t("缺SKU")} · {line.productName} {t("· 已发")}
								{line.quantityFulfilled} / {line.quantity}
								{t("，剩余")}
								{line.quantityToFulfill}
								{!line.isShippingRequired && t("（无需物流）")}
							</li>
						))}
					</ul>
					{!!order.fulfillments?.length && (
						<ul className="mt-2 space-y-1 text-xs text-muted-foreground">
							{order.fulfillments.map((item) => (
								<li key={item.id}>
									{t("发货记录")}
									{item.status} {t("· 单号")}
									{item.trackingNumber || t("未填写")}
								</li>
							))}
						</ul>
					)}
					{!order.shippingReady && (
						<p className="mt-2 text-xs text-muted-foreground">
							{t("未付清、缺配送地址或无需配送的订单不提供交接导出。")}
						</p>
					)}
					{order.shippingReady && !order.exportable && (
						<p className="mt-2 text-xs text-muted-foreground">
							{t("剩余实物商品缺SKU，暂不可导出交接资料；请在原生订单中核对并补齐商品资料。")}
						</p>
					)}
				</article>
			))}
			{dashboard && (
				<div className="rounded-xl border border-border p-5 text-sm">
					<h2 className="font-semibold">{t("交给货代")}</h2>
					<p className="mt-2 text-muted-foreground">
						{t(
							"CSV包含收件姓名、电话和地址，只用于当前品牌的履约交接。每次最多25笔订单/500行，导出前会重新读取付款、剩余数量和地址；整单重量不等于本次包裹重量。请在原生后台确认库存、仓库和部分发货数量，并回填物流单号。",
						)}
					</p>
					<label className="mt-4 flex items-start gap-2">
						<input
							type="checkbox"
							checked={confirmed}
							disabled={busy}
							onChange={(event) => setConfirmed(event.target.checked)}
						/>
						{t("我已核对选择，将收件资料仅用于货代履约交接。")}
					</label>
					<button
						disabled={busy || !confirmed || !selected.length}
						onClick={download}
						className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
					>
						{busy ? t("正在核对并导出…") : t("导出交接CSV（{v0}笔）", { v0: selected.length })}
					</button>
					<p className="mt-3 text-xs text-muted-foreground">
						{t("每次准备导出都会留记录；文件下载、货代接收和实际发货需另行确认。")}
					</p>
				</div>
			)}
			{message && (
				<p role="status" className="rounded-lg border border-border p-4 text-sm">
					{message}
				</p>
			)}
		</section>
	);
}
