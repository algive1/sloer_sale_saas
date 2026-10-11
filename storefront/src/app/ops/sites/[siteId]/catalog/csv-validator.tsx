"use client";
import { useState } from "react";
import { catalogCsvErrors, type CatalogCsvValidation } from "@/lib/ops/catalog-csv";
export function CatalogCsvValidator({ siteId }: { siteId: string }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CatalogCsvValidation | null>(null); const [error, setError] = useState("");
  async function validate() {
    if (!file || busy) return; setBusy(true); setError(""); setResult(null);
    try {
      if (file.size > 1_000_000) throw new Error("文件超过1MB，请分批校验");
      const response = await fetch(`/ops/sites/${encodeURIComponent(siteId)}/catalog/api`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "text/csv; charset=utf-8", "x-requested-with": "catalog-validator" }, body: await file.text() });
      const data = await response.json() as CatalogCsvValidation & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "校验失败"); setResult(data);
    } catch (error) { setError(error instanceof Error ? error.message : "校验失败"); } finally { setBusy(false); }
  }
  function download() {
    if (!result) return; const url = URL.createObjectURL(new Blob([catalogCsvErrors(result.issues)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${siteId}-catalog-errors.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="rounded-xl border border-border bg-card p-5">
    <h2 className="font-semibold">批量资料 · 导入前格式校验</h2>
    <p className="mt-2 text-sm text-muted-foreground">适用于实物商品资料准备。模板中的SKU、币种和图片为占位值，请替换。这里只校验格式、品牌市场及重复行，不写入商品；实际库存、币种、图片可访问性及全库SKU冲突还需核对。</p>
    <a className="mt-3 inline-block text-sm underline" href={`/ops/sites/${encodeURIComponent(siteId)}/catalog/api`}>下载本品牌CSV模板</a>
    <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm">选择CSV <input aria-label="选择CSV" type="file" accept=".csv,text/csv" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); setError(""); }} /></label>
      <button type="button" disabled={!file || busy} onClick={() => void validate()} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{busy ? "校验中…" : "校验资料"}</button></div>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {result && <div role="status" className="mt-3 text-sm"><p>{result.rows}行，{result.valid ? "格式校验通过，未写入商品" : `${result.issues.length}个问题，未写入商品`}</p>
      {result.issues.length > 0 && <><button onClick={download} className="mt-2 underline">下载全部错误</button><ul className="mt-2 space-y-1">{result.issues.slice(0,8).map((issue,index) => <li key={index}>第{issue.row}行 · {issue.field}：{issue.reason}</li>)}</ul></>}</div>}
  </section>;
}
