export const CATALOG_CSV_COLUMNS = ["sku", "channel", "price", "currency", "weight_kg", "image_url"] as const;
export type CsvIssue = { row: number; sku: string; field: string; reason: string };
export type CatalogCsvValidation = { rows: number; valid: boolean; issues: CsvIssue[] };

/** Bounded RFC4180-style parser; quoted commas, quotes and newlines stay intact. */
export function parseCatalogCsv(text: string): string[][] {
  if (text.length > 1_000_000 || text.includes("\0")) throw new Error("CSV文件过大或包含非法字符");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  const endCell = () => { if (cell.length > 4096) throw new Error("CSV字段过长"); row.push(cell); cell = ""; closed = false; };
  const endRow = () => { endCell(); if (row.some(value => value.trim())) rows.push(row); row = []; if (rows.length > 2001) throw new Error("单次最多校验2000行"); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("CSV引号格式错误"); quoted = true;
    } else if (char === ",") endCell();
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else { if (closed) throw new Error("CSV引号结束后包含多余字符"); cell += char; }
  }
  if (quoted) throw new Error("CSV引号未闭合");
  if (cell || row.length || closed) endRow();
  return rows;
}

export function validateCatalogCsv(text: string, channels: readonly string[]): CatalogCsvValidation {
  const rows = parseCatalogCsv(text); const header = rows.shift();
  if (!header || header.join(",") !== CATALOG_CSV_COLUMNS.join(",")) throw new Error("请使用当前模板，表头和顺序必须一致");
  if (!rows.length) throw new Error("CSV没有数据行");
  const issues: CsvIssue[] = []; const seen = new Set<string>();
  rows.forEach((values, index) => {
    const [sku = "", channel = "", price = "", currency = "", weight = "", image = ""] = values.map(value => value.trim());
    const fail = (field: string, reason: string) => issues.push({ row: index + 2, sku, field, reason });
    if (values.length !== CATALOG_CSV_COLUMNS.length) fail("row", "列数与模板不一致");
    if (!sku || sku.length > 255 || /[\x00-\x1f]/.test(sku)) fail("sku", "SKU为空、过长或包含控制字符");
    if (!channels.includes(channel)) fail("channel", "市场不属于当前品牌");
    const key = sku + "\0" + channel;
    if (seen.has(key)) fail("sku", "同一SKU和市场重复"); seen.add(key);
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(price) || Number(price) <= 0) fail("price", "批量模板要求正数价格，零价商品需单独确认");
    if (!/^[A-Z]{3}$/.test(currency)) fail("currency", "币种使用三位大写代码；需与实际市场配置核对");
    if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/.test(weight) || Number(weight) <= 0) fail("weight_kg", "实物商品模板要求正数公斤重量");
    let validImage = false;
    try { const url = new URL(image); validImage = url.protocol === "https:" && !url.username && !url.password && !url.hash; } catch { /* Invalid URL */ }
    if (!validImage || image.length > 2048) fail("image_url", "图片须为有效HTTPS地址，不含账户密码；这里只校验格式，不下载图片");
  });
  return { rows: rows.length, valid: !issues.length, issues };
}

/** Neutralize spreadsheet formulas in every untrusted output cell. */
function csvCell(value: string | number) {
  const text = String(value); const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csvFile(rows: readonly (readonly (string | number)[])[]): string { return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
export function catalogCsvErrors(issues: readonly CsvIssue[]): string {
  return csvFile([["row", "sku", "field", "reason"], ...issues.map(issue => [issue.row, issue.sku, issue.field, issue.reason])]);
}
