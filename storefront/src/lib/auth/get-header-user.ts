import "server-only";
import { sharedCustomerAccountsEnabled } from "@/lib/brand/customer-account-policy";

import { cache } from "react";
import { CurrentUserDocument, type CurrentUserQuery } from "@/gql/graphql";

import { fetchAuthenticatedUserIfSession } from "./fetch-authenticated-user";
import { resolveSessionUser, type SessionAuthState } from "./resolve-session-user";

export type HeaderUser = NonNullable<CurrentUserQuery["me"]>;
export type HeaderAuthState = SessionAuthState<HeaderUser>;

/** Header user menu — server session only (BFF cookies, no browser Saleor calls). */
export const getHeaderAuthState = cache(async (): Promise<HeaderAuthState> => {
	if (!sharedCustomerAccountsEnabled(process.env.STOREFRONT_SITES_JSON)) return { status: "guest" };
	return resolveSessionUser(() =>
		fetchAuthenticatedUserIfSession(CurrentUserDocument, {
			cache: "no-cache",
		}),
	);
});
