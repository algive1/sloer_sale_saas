import "server-only";
import { sharedCustomerAccountsEnabled } from "@/lib/brand/customer-account-policy";

import {
	UserDocument,
	type UserQuery,
	type UserQueryVariables,
} from "@/checkout/graphql/generated/operations";
import type { CheckoutUser } from "@/checkout/lib/checkout-types";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { fetchAuthenticatedUserIfSession } from "@/lib/auth/fetch-authenticated-user";

const userQueryDocument = toTypedDocument<UserQuery, UserQueryVariables>(UserDocument);

/** Customer profile for checkout — same server auth path as storefront account. */
export async function fetchCheckoutUserOnServer(): Promise<CheckoutUser | null> {
	// Saleor me.addresses are global and not scoped to the current brand.
	if (!sharedCustomerAccountsEnabled(process.env.STOREFRONT_SITES_JSON)) return null;
	const result = await fetchAuthenticatedUserIfSession(userQueryDocument, {
		cache: "no-cache",
	});

	if (!result.ok || !result.data.user) {
		return null;
	}

	return result.data.user;
}
