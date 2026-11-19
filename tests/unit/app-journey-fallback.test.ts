import { describe, expect, it, vi } from "vitest";
import { readAppJourney, recordAppJourney, previousJourney } from "@/platform/appJourney";

describe("journey storage fallback", () => {
  it("retains a same-tab return trail if sessionStorage is blocked", () => {
    const scope = "org-test:fallback:alice";
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
    });
    try {
      recordAppJourney(scope, "fallback", "FIN", "/o/fallback/fin/home?tab=Overview");
      recordAppJourney(scope, "fallback", "PROJECT", "/o/fallback/project/home");
      expect(previousJourney(readAppJourney(scope, "fallback"))?.url).toBe("/o/fallback/fin/home?tab=Overview");
      expect(readAppJourney(scope, "other").trail).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
