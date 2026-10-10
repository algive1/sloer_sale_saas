import "server-only";

import { createSaleorAuthClient } from "@saleor/auth-sdk";
import { cookies } from "next/headers";
import { invariant } from "ts-invariant";
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from "./constants";
import { createCookieTokenStorage } from "./cookie-token-storage";
import { customerTokenStorageForDeployment } from "./customer-token-storage-policy";

const saleorApiUrl = process.env.SALEOR_INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_SALEOR_API_URL;
invariant(saleorApiUrl, "Missing SALEOR_INTERNAL_API_URL / NEXT_PUBLIC_SALEOR_API_URL env variable");

/**
 * Server-side cookie storage for auth tokens, with an in-memory cache layer so
 * the SDK's refresh-then-reread flow works during RSC render (where cookie
 * writes are not allowed). See `createCookieTokenStorage`.
 */
const createServerCookieStorage = async () => {
	const cookieStore = await cookies();

	return createCookieTokenStorage(cookieStore, saleorApiUrl, {
		secure: process.env.NODE_ENV === "production",
		accessTokenMaxAge: ACCESS_TOKEN_MAX_AGE,
		refreshTokenMaxAge: REFRESH_TOKEN_MAX_AGE,
	});
};

export const getServerAuthClient = async () => {
	const cookieStorage = await createServerCookieStorage();
	const serverCookieStorage = customerTokenStorageForDeployment(cookieStorage, process.env.STOREFRONT_SITES_JSON);
	return createSaleorAuthClient({
		saleorApiUrl,
		refreshTokenStorage: serverCookieStorage,
		accessTokenStorage: serverCookieStorage,
	});
};
