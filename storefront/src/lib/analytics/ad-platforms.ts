const META_PIXEL_ID = /^\d{5,32}$/;
const TIKTOK_PIXEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const GOOGLE_ADS_ID = /^AW-\d+$/i;
const GOOGLE_ADS_LABEL = /^[A-Za-z0-9_-]{3,128}$/;

function valid(raw: string | undefined, pattern: RegExp): string | null {
	const value = raw?.trim();
	return value && pattern.test(value) ? value : null;
}

export function metaPixelId(raw = process.env.NEXT_PUBLIC_META_PIXEL_ID): string | null {
	return valid(raw, META_PIXEL_ID);
}

export function tiktokPixelId(raw = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID): string | null {
	return valid(raw, TIKTOK_PIXEL_ID);
}

export function googleAdsId(raw = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID): string | null {
	return valid(raw, GOOGLE_ADS_ID);
}

export function googleAdsPurchaseLabel(
	raw = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL,
): string | null {
	return valid(raw, GOOGLE_ADS_LABEL);
}

export function browserAdsConfigured(): boolean {
	return Boolean(metaPixelId() || tiktokPixelId() || googleAdsId());
}
