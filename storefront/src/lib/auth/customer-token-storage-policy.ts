import { sharedCustomerAccountsEnabled } from "@/lib/brand/customer-account-policy";
import type { TokenStorage } from "./cookie-token-storage";

/**
 * In a shared Saleor Core, login tokens are global customer credentials, not
 * brand credentials. Never consume or refresh stale customer cookies on a
 * multi-brand storefront, even from an otherwise valid checkout server action.
 *
 * Guest Checkout operations use Saleor's anonymous checkout permission model.
 * This only contains Paper's server SDK: direct Saleor GraphQL access and
 * third-party apps require independent upstream authorization controls.
 */
const guestOnlyStorage: TokenStorage = {
	getItem: () => null,
	setItem: () => {},
	removeItem: () => {},
};

export function customerTokenStorageForDeployment(
	cookieStorage: TokenStorage,
	sitesConfig: string | undefined,
): TokenStorage {
	return sharedCustomerAccountsEnabled(sitesConfig) ? cookieStorage : guestOnlyStorage;
}
