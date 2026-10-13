import { getOpsI18n } from "@/lib/ops/i18n.server";
import { Suspense } from "react";
import { io } from "next/cache";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { serverAdConfiguration } from "@/plugins/ads-tracking/server-config";
import { readAdDeliveries } from "@/plugins/ads-tracking/delivery-store";

export default async function AdDestinationsPage({
	searchParams,
}: {
	searchParams: Promise<{ siteId?: string }>;
}) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	return (
		<main className="mx-auto max-w-5xl px-5 py-8">
			<h1 className="text-2xl font-semibold">{t("品牌广告转化与投递记录")}</h1>
			<Suspense
				fallback={
					<p className="mt-5 text-sm" role="status">
						{t("正在读取接收账户与投递状态…")}
					</p>
				}
			>
				<DestinationsContent searchParams={searchParams} />
			</Suspense>
		</main>
	);
}

async function DestinationsContent({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
	const i18n = await getOpsI18n();
	const { t } = i18n;

	await io();
	const viewer = await currentOpsViewer();
	if (viewer?.role !== "platform_admin") return <p role="alert">{t("当前账号无权查看广告设置。")}</p>;
	let sites: ReturnType<typeof serverAdConfiguration>;
	try {
		sites = serverAdConfiguration();
	} catch {
		return (
			<p className="mt-5" role="alert">
				{t("广告配置无效，投递保持关闭。请检查服务器 ADS_SERVER_SITES_JSON。")}
			</p>
		);
	}
	const params = await searchParams;
	const site = params.siteId === undefined ? sites[0] : sites.find((row) => row.siteId === params.siteId);
	if (!site)
		return (
			<p className="mt-5" role="alert">
				{t("品牌无效，请从品牌列表重新选择。")}
			</p>
		);
	const { records, available } = await readAdDeliveries(site.siteId)
		.then((records) => ({ records, available: true }))
		.catch(() => ({ records: [], available: false }));
	const labels: Record<string, string> = {
		sending: t("已占用 · 待核对"),
		transport_accepted: t("HTTP 已接收 · 未证明入报表"),
		provider_accepted: t("供应商已确认接收"),
		failed: t("失败"),
		unconfirmed: t("结果不确定"),
	};
	return (
		<div className="mt-6 space-y-5">
			<form method="get" className="flex flex-wrap items-end gap-3">
				<label className="text-sm">
					{t("品牌")}
					<select
						aria-label={t("品牌")}
						name="siteId"
						defaultValue={site.siteId}
						className="ml-2 rounded-lg border border-border bg-background px-3 py-2"
					>
						{sites.map((row) => (
							<option key={row.siteId} value={row.siteId}>
								{row.name}
							</option>
						))}
					</select>
				</label>
				<button className="rounded-lg border border-border px-3 py-2 text-sm">{t("查看账户")}</button>
			</form>
			<section className="rounded-xl border border-border bg-background p-5">
				<h2 className="font-semibold">
					{site.name} {t("· 服务端接收账户")}
				</h2>
				<p className="mt-2 break-all text-sm text-muted-foreground">
					{t("品牌地址：")}
					{site.origin || t("未配置")}
				</p>
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					{site.destinations.map((row) => (
						<div key={row.destination} className="rounded-lg border border-border p-3 text-sm">
							<h3 className="font-semibold">{row.destination.toUpperCase()}</h3>
							<p className="mt-2">{row.configured ? row.id : t("未配置 · 保持关闭")}</p>
						</div>
					))}
				</div>
				<p className="mt-4 text-sm leading-6 text-muted-foreground">
					{t(
						"配置来自服务器，密钥不会显示在页面。启用前还需在对应供应商测试事件工具中核对接收、去重、币种和同意设置；账户 ID 正确不等于转化已经计入。",
					)}
				</p>
				{!available && (
					<p className="mt-3 text-sm" role="alert">
						{t("投递数据库不可用。多品牌服务端投递保持关闭；单品牌旧配置没有持久记录时需在供应商侧核查。")}
					</p>
				)}
			</section>
			<section className="rounded-xl border border-border bg-background p-5">
				<h2 className="font-semibold">{t("本品牌最近40条投递记录")}</h2>
				<p className="mt-2 text-xs leading-5 text-muted-foreground">
					{t(
						"记录中不保存 IP、邮箱、URL 或密钥。结果不确定时不自动重发，先核对供应商；订单确认事件也不能代替 Saleor 的实际收款账本。",
					)}
				</p>
				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-xs">
						<thead>
							<tr>
								{[t("接收端 / ID"), t("事件 / 市场"), t("结果"), t("UTC 时间"), t("诊断代码")].map(
									(label) => (
										<th className="border-b border-border p-2" key={label}>
											{label}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{records.map((row, index) => (
								<tr key={`${row.claimedAt}:${row.destination}:${index}`}>
									<td className="p-2">
										{row.destination} / {row.destinationId}
									</td>
									<td className="p-2">
										{row.eventName} / {row.channel}
									</td>
									<td className="p-2">{labels[row.status] ?? row.status}</td>
									<td className="whitespace-nowrap p-2">{row.finishedAt || row.claimedAt}</td>
									<td className="p-2">{row.code || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!records.length && (
					<p className="mt-4 text-sm text-muted-foreground">{t("暂无可读取的投递记录。")}</p>
				)}
			</section>
		</div>
	);
}
