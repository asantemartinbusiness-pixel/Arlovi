import { describe, expect, it } from "vitest";
import { applications, screens } from "@/app/catalog";
import { NATIVE_OVERLAY_DOMAINS, OVERLAY_ENTITY_LABELS, nativeOverlayDomain } from "@/app/OverlayExperience";

describe("native overlay identity contract", () => {
  it("covers every registered native app with a purposeful identity", () => {
    const codes = applications.map(app => app.code).sort();
    const named = Object.keys(NATIVE_OVERLAY_DOMAINS).sort();
    expect(named).toEqual(codes);
    expect(new Set(named).size).toBe(35);
    for (const app of applications) {
      const domain = nativeOverlayDomain(app.code);
      expect(domain.name.trim().length).toBeGreaterThan(1);
      expect(domain.entity.trim().length).toBeGreaterThan(1);
      expect(domain.group.trim().length).toBeGreaterThan(1);
    }
  });

  it("has precise record labels for every registered collection", () => {
    const collections = [...new Set(screens.map(screen => screen.collection))].sort();
    expect(Object.keys(OVERLAY_ENTITY_LABELS).sort()).toEqual(collections);
    expect(collections).toHaveLength(89);
  });

  it("does not invent a native identity for an unregistered application", () => {
    expect(nativeOverlayDomain("FUTURE")).toEqual({
      name: "FUTURE", entity: "Record", group: "operations",
    });
  });

  it("keeps sensitive and operational domains distinguishable", () => {
    expect(nativeOverlayDomain("FIN").entity).toBe("Financial record");
    expect(nativeOverlayDomain("HR").entity).toBe("People record");
    expect(nativeOverlayDomain("AUTO").entity).toBe("Workflow");
    expect(nativeOverlayDomain("BOOK").entity).toBe("Booking");
    expect(nativeOverlayDomain("CRM").entity).toBe("Relationship record");
    expect(nativeOverlayDomain("COMMS").entity).toBe("Conversation");
  });
});
