import { describe, expect, it, vi } from "vitest";
import { customerTokenStorageForDeployment } from "./customer-token-storage-policy";
import type { TokenStorage } from "./cookie-token-storage";

function storedToken(): TokenStorage & { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> } {
	const values = new Map<string, string>([["access", "old-customer-token"], ["refresh", "old-refresh-token"]]);
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
		removeItem: vi.fn((key: string) => { values.delete(key); }),
	};
}

describe("customer token storage isolation", () => {
	it("retains signed-in storage and token refresh semantics on single-brand sites", () => {
		const cookies = storedToken();
		const storage = customerTokenStorageForDeployment(cookies, undefined);
		expect(storage).toBe(cookies);
		expect(storage.getItem("access")).toBe("old-customer-token");
		storage.setItem("access", "refreshed");
		expect(cookies.getItem("access")).toBe("refreshed");
		storage.removeItem("refresh");
		expect(cookies.getItem("refresh")).toBeNull();
	});

	it("never reads, saves, refreshes or deletes shared customer cookies in multi-brand mode", () => {
		const cookies = storedToken();
		const storage = customerTokenStorageForDeployment(cookies, '[{"id":"fashion"},{"id":"jewelry"}]');
		expect(storage.getItem("access")).toBeNull();
		expect(storage.getItem("refresh")).toBeNull();
		storage.setItem("access", "attempted-override");
		storage.setItem("refresh", "attempted-refresh");
		storage.removeItem("access");
		expect(cookies.getItem).not.toHaveBeenCalled();
		expect(cookies.setItem).not.toHaveBeenCalled();
		expect(cookies.removeItem).not.toHaveBeenCalled();
	});

	it("fails closed even when the multi-brand configuration is malformed", () => {
		expect(customerTokenStorageForDeployment(storedToken(), "{invalid").getItem("access")).toBeNull();
	});
});
