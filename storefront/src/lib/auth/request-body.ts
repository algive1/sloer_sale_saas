/**
 * Auth APIs are public. A syntactically valid JSON value may still be null,
 * an array, a primitive or a malformed record. Treat those as 400, never 500.
 * This parser performs only one JSON decode and has no Saleor/network I/O.
 */
export async function readAuthJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
