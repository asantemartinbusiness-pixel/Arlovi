import { afterEach, describe, expect, it, vi } from "vitest";

/* The ambient clock keeps application code and the workspace provider in
   agreement about time, and keeps stamps ordered even when time is frozen. */

async function freshClock(search: string, stored?: string) {
  vi.resetModules();
  const store = new Map<string, string>(stored ? [["arlovi:last-stamp", stored]] : []);
  vi.stubGlobal("window", {
    location: { search },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    addEventListener: () => undefined,
  });
  return import("@/platform/clock");
}

afterEach(() => vi.unstubAllGlobals());

describe("clockNow", () => {
  it("follows ?clock= exactly as the provider does", async () => {
    const { clockNow } = await freshClock("?clock=2026-11-14T09:30:00Z");
    expect(clockNow().toISOString()).toBe("2026-11-14T09:30:00.000Z");
  });

  it("is the real time when no clock is set", async () => {
    const { clockNow } = await freshClock("");
    expect(Math.abs(clockNow().getTime() - Date.now())).toBeLessThan(1000);
  });
});

describe("clockIso", () => {
  it("stamps from the workspace clock, not the wall clock", async () => {
    const { clockIso } = await freshClock("?clock=2026-11-14T09:30:00Z");
    expect(clockIso().startsWith("2026-11-14T09:30:00")).toBe(true);
  });

  it("is strictly increasing under a frozen clock, so order is never lost to a tie", async () => {
    const { clockIso } = await freshClock("?clock=2026-11-14T09:30:00Z");
    const stamps = Array.from({ length: 50 }, () => clockIso());
    expect(new Set(stamps).size).toBe(50);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it("continues the sequence after a reload instead of restarting it", async () => {
    const { clockIso } = await freshClock("?clock=2026-11-14T09:30:00Z", String(Date.parse("2026-11-14T09:30:00.040Z")));
    expect(Date.parse(clockIso())).toBe(Date.parse("2026-11-14T09:30:00.041Z"));
  });
});

describe("wallMs", () => {
  it("is never frozen", async () => {
    const { wallMs } = await freshClock("?clock=2000-01-01T00:00:00Z");
    expect(Math.abs(wallMs() - Date.now())).toBeLessThan(1000);
  });
});
