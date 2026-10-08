import type { PaperCommerceEvent } from "@/lib/analytics/catalog";

export type CheckoutAnalyticsDimensions = {
	checkoutStage: string | null;
	method: string | null;
	provider: string | null;
	errorCode: string | null;
	failureReason: string | null;
};

export function checkoutAnalyticsDimensions(event: PaperCommerceEvent): CheckoutAnalyticsDimensions {
	const checkoutStage =
		event.name === "checkout_step_viewed"
			? event.step
			: event.name === "checkout_failed"
				? event.stage
				: null;
	const method =
		event.name === "shipping_method_selected" || event.name === "payment_method_selected"
			? clipAnalyticsText(event.method, 160)
			: null;
	const provider =
		event.name === "payment_failed" ? clipAnalyticsText(event.provider, 120) : null;
	const errorCode =
		event.name === "payment_failed" ? clipAnalyticsText(event.code, 120) : null;
	const failureReason =
		event.name === "payment_failed" || event.name === "checkout_failed"
			? clipAnalyticsText(event.reason, 300)
			: null;

	return { checkoutStage, method, provider, errorCode, failureReason };
}

function clipAnalyticsText(value: string | undefined, maxChars: number): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	let safe = "";
	for (let index = 0; index < trimmed.length && safe.length < maxChars; index++) {
		const code = trimmed.charCodeAt(index);
		if (code >= 32 && code !== 127) safe += trimmed[index];
	}
	return safe || null;
}
