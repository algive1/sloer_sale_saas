import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  readTheme: vi.fn(),
  io: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ io: mocks.io }));
vi.mock("./store", () => ({
  themeDatabaseConfigured: mocks.configured,
  readTheme: mocks.readTheme,
}));
vi.mock("./render.server", () => ({ PublishedThemeHomepage: () => null }));

import { renderPublishedThemeHomepage } from "./entry.server";

afterEach(() => vi.unstubAllEnvs());

describe("system-wide theme extension hot path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(false);
    mocks.io.mockResolvedValue(undefined);
    mocks.readTheme.mockResolvedValue({ published: null });
  });


  it("checks runtime deployment policy without storage I/O when unconfigured", async () => {
    expect(await renderPublishedThemeHomepage("us", "en")).toBeNull();
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(mocks.readTheme).not.toHaveBeenCalled();
  });

  it("preserves Paper fallback when no theme was published", async () => {
    mocks.configured.mockReturnValue(true);
    expect(await renderPublishedThemeHomepage("us", "en")).toBeNull();
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(mocks.readTheme).toHaveBeenCalledWith("us", "en");
  });

  it("renders a published theme with the deferred renderer", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.readTheme.mockResolvedValue({ published: { content: [], root: { props: {} } } });
    expect(isValidElement(await renderPublishedThemeHomepage("jewelry", "ja"))).toBe(true);
    expect(mocks.readTheme).toHaveBeenCalledWith("jewelry", "ja");
  });

  it("falls back safely when the theme store is unavailable", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.readTheme.mockRejectedValue(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await renderPublishedThemeHomepage("us", "en")).toBeNull();
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});

it("paused published extensions fall back before storage or renderer loading", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["theme-builder"]'); mocks.configured.mockReturnValue(true); mocks.readTheme.mockClear();
  expect(await renderPublishedThemeHomepage("us", "en")).toBeNull(); expect(mocks.readTheme).not.toHaveBeenCalled();
});
