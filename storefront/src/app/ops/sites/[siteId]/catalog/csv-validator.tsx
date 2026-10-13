"use client";
import { useOpsI18n } from "@/lib/ops/i18n.client";

import { useState } from "react";
import { catalogCsvErrors, type CatalogCsvValidation } from "@/lib/ops/catalog-csv";
export function CatalogCsvValidator({ siteId }: { siteId: string }) {
	const i18n = useOpsI18n();
	const { t } = i18n;

	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<(CatalogCsvValidation & { nativeChecked?: boolean }) | null>(null);
	const [error, setError] = useState("");
	const [nativeMode, setNativeMode] = useState(false);
	async function validate(native = false) {
		if (!file || busy) return;
		setBusy(true);
		setError("");
		setResult(null);
		setNativeMode(native);
		try {
			if (file.size > 1_000_000) throw new Error(t("文件超过1MB，请分批校验"));
			const response = await fetch(
				`/ops/sites/${encodeURIComponent(siteId)}/catalog/api${native ? "?native=1" : ""}`,
				{
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "text/csv; charset=utf-8", "x-requested-with": "catalog-validator" },
					body: file,
				},
			);
			const data = (await response.json()) as CatalogCsvValidation & {
				error?: string;
				nativeChecked?: boolean;
			};
			if (!response.ok) throw new Error(data.error ?? t("校验失败"));
			if (native && data.valid && data.nativeChecked !== true)
				throw new Error(t("原生核对未完成，不能据此导入"));
			setResult(data);
		} catch (error) {
			setError(error instanceof Error ? t(error.message) : t("校验失败"));
		} finally {
			setBusy(false);
		}
	}
	function download() {
		if (!result) return;
		const url = URL.createObjectURL(
			new Blob([catalogCsvErrors(result.issues)], { type: "text/csv;charset=utf-8" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${siteId}-catalog-errors.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}
	return (
		<section className="rounded-xl border border-border bg-card p-5">
			<h2 className="font-semibold">{t("批量资料 · 导入前校验")}</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				{t(
					"适用于实物商品资料准备。替换模板占位值后，可先检查格式，再核对原生现有SKU、市场归属、币种及价格精度。两种检查均不写入；创建/更新、库存、重量及图片可访问性仍须另外验收。",
				)}
			</p>
			<a
				className="mt-3 inline-block text-sm underline"
				href={`/ops/sites/${encodeURIComponent(siteId)}/catalog/api`}
			>
				{t("下载本品牌CSV模板")}
			</a>
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<label className="text-sm">
					{t("选择CSV")}{" "}
					<input
						aria-label={t("选择CSV")}
						type="file"
						disabled={busy}
						accept=".csv,text/csv"
						onChange={(event) => {
							setFile(event.target.files?.[0] ?? null);
							setResult(null);
							setError("");
						}}
					/>
				</label>
				<button
					type="button"
					disabled={!file || busy}
					onClick={() => void validate()}
					className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
				>
					{busy ? t("校验中…") : t("校验资料")}
				</button>
				<button
					type="button"
					disabled={!file || busy}
					onClick={() => void validate(true)}
					className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
				>
					{t("核对原生SKU与币种")}
				</button>
			</div>
			{error && (
				<p role="alert" className="mt-3 text-sm">
					{error}
				</p>
			)}
			{result && (
				<div role="status" className="mt-3 text-sm">
					<p>
						{result.rows}
						{t("行，")}
						{result.valid
							? nativeMode
								? t("SKU与市场币种核对通过，未写入商品（含原生价格精度）")
								: t("格式校验通过，未写入商品")
							: t("{v0}个问题，未写入商品", { v0: result.issues.length })}
					</p>
					{result.issues.length > 0 && (
						<>
							<button onClick={download} className="mt-2 underline">
								{t("下载全部错误")}
							</button>
							<ul className="mt-2 space-y-1">
								{result.issues.slice(0, 8).map((issue, index) => (
									<li key={index}>
										{t("第")}
										{issue.row}
										{t("行 ·")}
										{issue.field}：{t(issue.reason)}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}
		</section>
	);
}
