import { describe, expect, it } from "vitest";
import { BUSINESS_GOALS, SUGGESTED_INTEGRATIONS, suggestedForGoal } from "@/applications/connect/nangoCatalog";

describe("Nango marketplace discovery contracts", () => {
  it("uses unique provider ids safe for allowlist matching", () => {
    const ids = SUGGESTED_INTEGRATIONS.map(provider => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9_-]+$/);
  });

  it("supports every business goal with several relevant options", () => {
    for (const goal of BUSINESS_GOALS) {
      const providers = suggestedForGoal(goal.id);
      expect(providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.every(item => item.goal === goal.id)).toBe(true);
    }
  });

  it("does not encode production connection states or secrets in catalogue metadata", () => {
    const text = JSON.stringify(SUGGESTED_INTEGRATIONS).toLowerCase();
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("client_secret");
    expect(text).not.toContain("verified_external");
    expect(text).not.toContain("connected\":true");
  });

  it("assigns each recommendation to an Arlovi application", () => {
    expect(SUGGESTED_INTEGRATIONS.every(item => item.applications.length && item.summary.trim())).toBe(true);
  });
});
