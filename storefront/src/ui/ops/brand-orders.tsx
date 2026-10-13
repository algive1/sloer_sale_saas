import { getOpsI18n } from "@/lib/ops/i18n.server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { readBrandRecentOrders } from "@/lib/ops/brand-orders";
export async function BrandOrders({ siteId }: { siteId: string }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	let orders;
	try {
		orders = await readBrandRecentOrders(siteId, await currentOpsViewer());
	} catch {
		return (
			<section className="mt-5 rounded-xl border border-border bg-card p-5">
				<h2 className="font-semibold">{t("品牌最近订单")}</h2>
				<p className="mt-2 text-sm text-muted-foreground" role="alert">
					{t("无法读取完整品牌订单。请检查订单读取权限和各市场服务；当前不显示其他品牌或部分市场数据。")}
				</p>
			</section>
		);
	}
	return (
		<section className="mt-5 rounded-xl border border-border bg-card p-5">
			<h2 className="font-semibold">{t("品牌最近订单 · Saleor 实时状态")}</h2>
			<p className="mt-2 text-xs text-muted-foreground">
				{t(
					"合并本品牌所有市场的最近10笔订单，不包含其他品牌。已支付以 Saleor isPaid 为准；金额为订单总额，不等于到账净额。发货、退款仍在原生订单后台操作。",
				)}
			</p>
			<div className="mt-4 overflow-x-auto">
				<table className="w-full min-w-[640px] text-left text-xs">
					<thead>
						<tr>
							{[t("订单 / 商品"), t("市场"), t("状态"), t("支付"), t("金额"), t("UTC 创建时间")].map(
								(label) => (
									<th key={label} className="border-b border-border p-2">
										{label}
									</th>
								),
							)}
						</tr>
					</thead>
					<tbody>
						{orders.map((order) => (
							<tr key={order.id}>
								<td className="p-2">
									#{order.number}
									<span className="block text-muted-foreground">{order.productName}</span>
								</td>
								<td className="p-2">{order.channel}</td>
								<td className="p-2">
									{order.status}
									{order.hasRefund ? t(" · 有退款") : ""}
								</td>
								<td className="p-2">
									{order.isPaid ? t("已支付") : t("未全额支付")}
									<span className="block text-muted-foreground">{order.paymentStatus}</span>
								</td>
								<td className="p-2">
									{order.amount.toFixed(2)} {order.currency}
								</td>
								<td className="whitespace-nowrap p-2">{order.createdAt}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{!orders.length && <p className="mt-4 text-sm text-muted-foreground">{t("暂无订单。")}</p>}
		</section>
	);
}
