import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentNavigation, readNavigation, recordNavigation, removeRecentNavigation,
  toggleSavedNavigation,
} from "@/platform/navigationContinuity";

describe("workspace continuity", () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: unknown) {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps recent visits and saved destinations isolated between organisations", () => {
    recordNavigation("org-one", "one", "/o/one/workspace/work");
    recordNavigation("org-two", "two", "/o/two/workspace/spaces");
    toggleSavedNavigation("org-one", "one", "/o/one/workspace/work");
    expect(readNavigation("org-one", "one").recent.map(item => item.path)).toEqual(["/o/one/workspace/work"]);
    expect(readNavigation("org-one", "one").pinned).toEqual(["/o/one/workspace/work"]);
    expect(readNavigation("org-two", "two").recent.map(item => item.path)).toEqual(["/o/two/workspace/spaces"]);
    expect(readNavigation("org-two", "two").pinned).toEqual([]);
  });

  it("never saves foreign, external or malformed destinations", () => {
    recordNavigation("org-one", "one", "/o/two/workspace/work");
    recordNavigation("org-one", "one", "https://evil.example");
    recordNavigation("org-one", "one", "/o/one//attacker");
    expect(readNavigation("org-one", "one").recent).toHaveLength(0);
    expect(toggleSavedNavigation("org-one", "one", "/o/two/workspace/work")).toBe(false);
  });

  it("deduplicates navigation, supports removal and retains saves when history is cleared", () => {
    recordNavigation("org-one", "one", "/o/one/workspace/work");
    recordNavigation("org-one", "one", "/o/one/workspace/spaces");
    recordNavigation("org-one", "one", "/o/one/workspace/work");
    expect(readNavigation("org-one", "one").recent.map(item => item.path)).toEqual([
      "/o/one/workspace/work", "/o/one/workspace/spaces",
    ]);
    toggleSavedNavigation("org-one", "one", "/o/one/workspace/work");
    removeRecentNavigation("org-one", "one", "/o/one/workspace/work");
    expect(readNavigation("org-one", "one").pinned).toEqual(["/o/one/workspace/work"]);
    clearRecentNavigation("org-one", "one");
    expect(readNavigation("org-one", "one").recent).toEqual([]);
    expect(readNavigation("org-one", "one").pinned).toHaveLength(1);
  });
});
