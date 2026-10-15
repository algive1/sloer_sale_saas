import { describe, expect, it } from "vitest";
import { isSaleorOpsAppPath } from "./saleor-app-navigation";

describe("isSaleorOpsAppPath", () => {
	it.each([
		"/ops/plugins",
		"/ops/settings",
		"/ops/analytics",
		"/ops/analytics/destinations",
		"/ops/analytics/reminders",
		"/ops/support",
		"/ops/themes",
		"/ops/translations",
		"/ops/merchant",
	])("allows an existing system operations page: %s", (path) => {
		expect(isSaleorOpsAppPath(path)).toBe(true);
	});

	it.each([null, "https://evil.example/ops/analytics", "/ops/login", "/ops/api/analytics/reminders/run"])(
		"rejects non-page and unsafe paths: %s",
		(path) => expect(isSaleorOpsAppPath(path)).toBe(false),
	);
});
