/** Public business numbers only. No shopper data or provider credentials. */
export type WhatsAppBinding = Readonly<{ siteId: string; phone: string }>;
const internationalPhone = (phone: string) => phone.trim() === phone && /^[1-9][0-9]{7,14}$/.test(phone);

export function parseWhatsAppBindings(
	raw: string | undefined,
	expectedSiteIds: readonly string[],
): readonly WhatsAppBinding[] {
	if (!raw?.trim()) return [];
	const input: unknown = JSON.parse(raw);
	if (!Array.isArray(input)) throw new Error("Invalid WhatsApp mappings");
	const expected = new Set(expectedSiteIds);
	const sites = new Set<string>();
	const phones = new Set<string>();
	return input.map((row: unknown) => {
		if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid WhatsApp mapping");
		const entry = row as Record<string, unknown>;
		if (
			Object.keys(entry).some((key) => key !== "siteId" && key !== "phone") ||
			typeof entry.siteId !== "string" ||
			!expected.has(entry.siteId) ||
			typeof entry.phone !== "string" ||
			!internationalPhone(entry.phone) ||
			sites.has(entry.siteId) ||
			phones.has(entry.phone)
		)
			throw new Error("Invalid or shared WhatsApp brand number");
		sites.add(entry.siteId);
		phones.add(entry.phone);
		return { siteId: entry.siteId, phone: entry.phone };
	});
}

const GREETINGS: Readonly<Record<string, string>> = {
	en: "Hello, I would like help with your store.",
	de: "Hallo, ich brauche Hilfe zu Ihrem Shop.",
	fr: "Bonjour, j’aimerais de l’aide concernant votre boutique.",
	es: "Hola, me gustaría recibir ayuda con su tienda.",
	ja: "こんにちは。お店について問い合わせたいです。",
	ko: "안녕하세요. 매장 관련 문의를 하고 싶습니다.",
};

export function whatsappLink(binding: WhatsAppBinding, locale: string): string {
	if (!internationalPhone(binding.phone)) throw new Error("Invalid WhatsApp number");
	const greeting = Object.hasOwn(GREETINGS, locale) ? GREETINGS[locale] : GREETINGS.en;
	return `https://wa.me/${binding.phone}?text=${encodeURIComponent(greeting)}`;
}
