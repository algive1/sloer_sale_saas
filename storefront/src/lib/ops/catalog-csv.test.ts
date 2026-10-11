import { expect, it } from "vitest";
import { CATALOG_CSV_COLUMNS, parseCatalogCsv, validateCatalogCsv, catalogCsvErrors } from "./catalog-csv";
const header = CATALOG_CSV_COLUMNS.join(",") + "\n";
const row = "HAT-1,fashion-us,20.00,USD,0.25,https://images.example/hat.jpg";
it("accepts BOM, quotes, embedded commas/quotes/newlines and CRLF without splitting fields", () => {
  expect(parseCatalogCsv('\uFEFF"sku","x"\r\n"Hat, \"\"Blue\"\"","line1\nline2"\r\n')).toEqual([["sku", "x"], ['Hat, "Blue"', "line1\nline2"]]);
  expect(validateCatalogCsv(header + row, ["fashion-us"]).valid).toBe(true);
});
it("reports row numbers, cross-brand channels, duplicate rows and invalid commercial values", () => {
  const result = validateCatalogCsv(header + row + "\n" + row + "\n,foreign,0,eur,-1,https://name:pass@images.example/img.jpg", ["fashion-us"]);
  expect(result.rows).toBe(3); expect(result.valid).toBe(false);
  expect(result.issues.find(i => i.reason.includes("重复"))?.row).toBe(3);
  expect(result.issues.filter(i => i.row === 4).map(i => i.field)).toEqual(expect.arrayContaining(["sku", "channel", "price", "currency", "weight_kg", "image_url"]));
});
it.each(['sku,x\n1,2', header, header + '"unclosed', header + '"a"x,b', header + "x".repeat(5000), header + (row + "\n").repeat(2001), "x".repeat(1_000_001)])("rejects malformed or excessive input %#", text => {
  expect(() => validateCatalogCsv(text, ["fashion-us"])).toThrow();
});
it("neutralizes formulas in downloaded error cells, including whitespace prefixes", () => {
  const output = catalogCsvErrors([{ row: 2, sku: " =HYPERLINK(\"https://bad\")", field: "sku", reason: "invalid" }, { row: 3, sku: "\t@SUM(1)", field: "sku", reason: "invalid" }]);
  expect(output).toContain('"\' =HYPERLINK'); expect(output).toContain('"\'\t@SUM');
});
