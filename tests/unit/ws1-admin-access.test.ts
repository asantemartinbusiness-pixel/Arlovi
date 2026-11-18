import { describe, expect, it } from "vitest";
import { CAPABILITY_EXPLAINED, accessChange, capabilityMatches } from "@/applications/admin/access";
import { CAPABILITIES } from "@/applications/admin/pieces";

describe("admin access explanations", () => {
  it("explains every capability", () => {
    for (const capability of CAPABILITIES) expect(CAPABILITY_EXPLAINED[capability].what.length).toBeGreaterThan(20);
  });
  it("searches label, explanation and holders, and filters by role", () => {
    expect(CAPABILITIES.filter((capability) => capabilityMatches(capability, "salaries", "all"))).toEqual(["view_payroll"]);
    expect(CAPABILITIES.filter((capability) => capabilityMatches(capability, "", "sales"))).toEqual(["edit_pipeline", "publish_campaign", "export_data"]);
    expect(CAPABILITIES.filter((capability) => capabilityMatches(capability, "", "member"))).toEqual([]);
  });
  it("states exactly what a role change gains and loses", () => {
    const change = accessChange("sales", "finance");
    expect(change.gained).toEqual(["post_journal", "approve_payment", "run_automation", "view_legal"]);
    expect(change.lost).toEqual(["edit_pipeline", "publish_campaign"]);
    expect(change.appsGained).toContain("FIN");
    expect(accessChange("finance", "finance")).toMatchObject({ gained: [], lost: [], appsGained: [] });
  });
});
