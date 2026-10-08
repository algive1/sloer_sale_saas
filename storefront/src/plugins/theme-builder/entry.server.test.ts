import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("system-wide theme extension hot path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(false);
    mocks.io.mockResolvedValue(undefined);
    mocks.readTheme.mockResolvedValue({ published: null });
  });

  it("has no storage I/O or Next dynamic boundary without configuration", async () => {
    expect(await renderPublishedThemeHomepage("us", "en")).toBeNull();
    expect(mocks.io).not.toHaveBeenCalled();
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
