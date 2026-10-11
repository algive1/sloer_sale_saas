"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReadinessSnapshot } from "@/lib/ops/readiness-model";

const statusLabels = { passed: "已通过", failed: "需处理", pending: "待验证", stale: "已过期 · 需复核", unavailable: "服务不可用" };

export function ReadinessChecklist({ initial, canVerify }: { initial: ReadinessSnapshot; canVerify: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [result, setResult] = useState<"passed" | "failed">("failed");
  const [environment, setEnvironment] = useState<"production" | "test">("test");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!editing) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing]);

  async function save() {
    const check = snapshot.checks.find(item => item.id === editing);
    if (!check || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/ops/sites/${encodeURIComponent(snapshot.siteId)}/readiness/api`, {
        method: "POST", headers: { "content-type": "application/json", "x-requested-with": "readiness" },
        body: JSON.stringify({ checkId: check.id, result, environment, evidence, contextHash: snapshot.contextHash, expectedRevision: check.record?.revision ?? 0 }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setMessage("配置或验收记录已改变。请先保留当前证据文本，刷新后重新核对并提交。");
        } else setMessage(response.status === 403 ? "当前账号不能提交验收；请使用独立管理员账号。" : "保存失败，请检查证据内容、数据库和权限后重试。");
        return;
      }
      const body = await response.json() as { snapshot: ReadinessSnapshot };
      setSnapshot(body.snapshot); setEditing(null); setEvidence("");
      setMessage("验收记录已保存；系统仍会独立核对全部必要项。");
      router.refresh();
    } catch { setMessage("网络暂不可用，证据文本已保留，请重试。"); }
    finally { setBusy(false); }
  }

  return <>
    <section className="mt-6 rounded-xl border border-border bg-muted/40 p-5" aria-label="上线闸门">
      <h2 className="font-semibold">当前状态：{snapshot.canLaunch ? "上线验收已通过" : "待上线验收"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {snapshot.checks.filter(check => check.status === "passed").length} / {snapshot.checks.length} 项已通过。
        配置正确、外部连通和人工交易验收分别记录；任何必要项未通过，都不能通过本页上线验收。
      </p>
      <p className="mt-2 text-sm text-muted-foreground">最近系统核对：{snapshot.checkedAt}。人工记录有效期 7 天；相关配置、市场状态或首页发布版本变化会使记录失效。</p>
      <p className="mt-2 text-sm text-muted-foreground">此处记录上线验收，不会自动切换 DNS、开启公开访问或发送客户消息。</p>
      {!snapshot.storageAvailable && <p className="mt-2 text-sm font-medium">验收数据库不可用；无法保存记录或通过上线检查。</p>}
      {!canVerify && <p className="mt-2 text-sm">当前为只读模式。提交证据需要 OPS_OPERATORS_JSON 中的独立平台管理员账号。</p>}
    </section>
    <p role="status" className="my-4 text-sm">{message}</p>
    <section className="space-y-3" aria-label="上线检查步骤">
      {snapshot.checks.map((check, index) => <article key={check.id} className="rounded-xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{index + 1}. {check.label}</h2>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{statusLabels[check.status]} · {check.kind === "automatic" ? "系统核对" : "人工证据"}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{check.details}</p>
        {check.record && <div className="mt-3 space-y-1 border-l-2 border-border pl-3 text-sm">
          <p>责任人：{check.record.verifiedBy} · 记录版本 {check.record.revision} · {check.record.environment === "production" ? "正式环境" : "测试/沙盒环境"}</p>
          <p className="text-xs text-muted-foreground">验证：{check.record.verifiedAt} · 有效至：{check.record.expiresAt}</p>
          <p className="whitespace-pre-wrap break-words">{check.record.evidence}</p>
        </div>}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <a href={check.fixHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">查看或处理 →</a>
          {canVerify && snapshot.storageAvailable && check.kind === "manual" && !editing &&
            <button type="button" className="underline underline-offset-4" onClick={() => {
              setEditing(check.id); setEvidence(""); setResult("failed"); setEnvironment("test"); setMessage("");
            }}>记录本次验收</button>}
        </div>
        {editing === check.id && <form className="mt-4 space-y-3 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label className="block text-sm">验收结果
            <select value={result} disabled={busy} onChange={event => setResult(event.target.value as "passed" | "failed")} className="ml-3 rounded-md border border-border bg-background p-2">
              <option value="failed">未通过 · 需处理</option><option value="passed">已实际验证通过</option>
            </select>
          </label>
          <label className="block text-sm">验证环境
            <select value={environment} disabled={busy} onChange={event => setEnvironment(event.target.value as "production" | "test")} className="ml-3 rounded-md border border-border bg-background p-2">
              <option value="test">测试 / 沙盒</option><option value="production">正式环境已实测</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">测试/沙盒结果会保存，但不会让正式上线验收通过。</p>
          <label className="block text-sm">证据与失败原因（10–2000 字）
            <textarea required minLength={10} maxLength={2000} rows={4} disabled={busy} value={evidence} onChange={event => setEvidence(event.target.value)}
              placeholder="填写测试环境、步骤、脱敏证据编号及结果。不要填密码、密钥、客户邮箱或完整支付信息。"
              className="mt-2 w-full rounded-md border border-border bg-background p-3" />
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || evidence.trim().length < 10} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "保存中…" : "保存验收记录"}</button>
            <button type="button" disabled={busy} onClick={() => { setEditing(null); setEvidence(""); }} className="rounded-md border border-border px-4 py-2 text-sm">取消</button>
          </div>
        </form>}
      </article>)}
    </section>
  </>;
}
