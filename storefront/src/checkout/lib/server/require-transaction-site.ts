import "server-only";
import { brandSitesConfigured } from "@/config/brand-sites";
import { executeAppGraphQL } from "@/lib/graphql";
import {
	TransactionCheckoutForAuthorizationDocument,
	TransactionAuthorizationCapabilityDocument,
	type TransactionCheckoutForAuthorizationQuery,
	type TransactionCheckoutForAuthorizationQueryVariables,
	type TransactionAuthorizationCapabilityQuery,
	type TransactionAuthorizationCapabilityQueryVariables,
} from "@/checkout/graphql/generated/operations";
import { toTypedDocument } from "./to-typed-document";
import { requireCheckoutForCurrentHost } from "./require-checkout-site";

/** Check the server credential before any payment initialization can reach the PSP. */
export async function requireTransactionAuthorizationCapability(): Promise<void> {
	if (!brandSitesConfigured()) return;
	const result = await executeAppGraphQL(
		toTypedDocument<
			TransactionAuthorizationCapabilityQuery,
			TransactionAuthorizationCapabilityQueryVariables
		>(TransactionAuthorizationCapabilityDocument),
		{ cache: "no-cache" },
	);
	if (!result.ok || !result.data.transactions)
		throw new Error("Payment authorization is unavailable for this storefront");
}

/** Transaction IDs are not checkout IDs: resolve the authoritative relationship in Saleor. */
export async function requireTransactionForCurrentHost(transactionId: string): Promise<void> {
	if (!brandSitesConfigured()) return;
	if (typeof transactionId !== "string" || !transactionId || transactionId.length > 1024) {
		throw new Error("Transaction not available for this storefront");
	}
	const result = await executeAppGraphQL(
		toTypedDocument<
			TransactionCheckoutForAuthorizationQuery,
			TransactionCheckoutForAuthorizationQueryVariables
		>(TransactionCheckoutForAuthorizationDocument),
		{
			variables: { id: transactionId },
			cache: "no-cache",
		},
	);
	const transaction = result.ok ? result.data.transaction : null;
	// Completed-order transactions no longer have a checkout and cannot enter this checkout action.
	if (!transaction || transaction.id !== transactionId || !transaction.checkout?.id) {
		throw new Error("Transaction not available for this storefront");
	}
	await requireCheckoutForCurrentHost(transaction.checkout.id);
}
