/** Enforce the byte cap even without Content-Length, before parsing a file. */
export async function readCatalogCsvBody(request: Request): Promise<string> {
	const reader = request.body?.getReader();
	if (!reader) return "";
	let bytes = 0;
	const chunks: Uint8Array[] = [];
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > 1_000_000) {
				await reader.cancel().catch(() => {});
				throw new Error("catalog_csv_too_large");
			}
			chunks.push(value);
		}
		const data = new Uint8Array(bytes);
		let offset = 0;
		for (const chunk of chunks) {
			data.set(chunk, offset);
			offset += chunk.byteLength;
		}
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(data);
		} catch {
			throw new Error("catalog_csv_invalid_utf8");
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : "";
		if (reason === "catalog_csv_too_large" || reason === "catalog_csv_invalid_utf8") throw error;
		throw new Error("catalog_csv_read_unavailable");
	} finally {
		reader.releaseLock();
	}
}
