/** Brand is a catalog fact, never a product category or the reseller's name. */
export function productBrandName(attribute: unknown): string | null {
	if (!attribute || typeof attribute !== "object") return null;
	if ("text" in attribute && typeof attribute.text === "string" && attribute.text.trim()) {
		return attribute.text.trim();
	}
	if ("choice" in attribute && attribute.choice && typeof attribute.choice === "object") {
		const choice = attribute.choice;
		if ("name" in choice && typeof choice.name === "string") return choice.name.trim() || null;
	}
	return null;
}
