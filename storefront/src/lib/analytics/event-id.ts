/**
 * Stable event ids are required when the same conversion is delivered through
 * browser + server channels. Pass a stable business key (order id, checkout
 * step, URL) when one exists; otherwise a random id represents one action.
 */
export function createCommerceEventId(prefix: string, stableKey?: string): string {
	const normalizedPrefix = prefix.trim() || "event";
	if (stableKey?.trim()) {
		return `${normalizedPrefix}:${stableKey.trim()}`;
	}

	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return `${normalizedPrefix}:${crypto.randomUUID()}`;
	}

	return `${normalizedPrefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
