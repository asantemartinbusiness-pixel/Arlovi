import { describe, expect, it } from "vitest";
import { findScreen, nativeNavPath, screens } from "@/app/catalog";

function screen(id: string) {
  const result = screens.find(item => item.id === id);
  if (!result) throw new Error(`Missing catalog screen ${id}`);
  return result;
}

describe("native application sidebar routing", () => {
  it("uses a real current mission ID for detail-to-detail navigation", () => {
    const current = findScreen("/o/northline/mission/missions/nl-mission-123");
    expect(nativeNavPath(screen("ARL-MISSION-004"), "northline", current))
      .toBe("/o/northline/mission/missions/nl-mission-123/plan");
    expect(nativeNavPath(screen("ARL-MISSION-005"), "northline", current))
      .toBe("/o/northline/mission/missions/nl-mission-123/tasks");
  });

  it("does not fabricate sample record IDs when only a list is open", () => {
    const current = findScreen("/o/harbor/mission/missions");
    expect(nativeNavPath(screen("ARL-MISSION-004"), "harbor", current)).toBeNull();
    expect(nativeNavPath(screen("ARL-MISSION-001"), "harbor", current))
      .toBe("/o/harbor/mission/missions");
  });

  it("cannot reuse a record identifier across organisation boundaries", () => {
    const northline = findScreen("/o/northline/mission/missions/nl-mission-123");
    expect(nativeNavPath(screen("ARL-MISSION-004"), "harbor", northline)).toBeNull();
  });

  it("does not carry a record ID across different applications or collections", () => {
    const mission = findScreen("/o/northline/mission/missions/nl-mission-123");
    expect(nativeNavPath(screen("ARL-AI-003"), "northline", mission)).toBeNull();
    const differentCollection = findScreen("/o/northline/ai/rooms/nl-room-123");
    expect(nativeNavPath(screen("ARL-AI-003"), "northline", differentCollection)).toBeNull();
  });

  it("never constructs a dynamic path without the required matching slug", () => {
    const target = screens.find(item => item.route.includes(":slug"));
    if (!target) throw new Error("Expected a slug-scoped catalog screen");
    expect(nativeNavPath(target, "harbor", findScreen("/o/harbor/mission/missions"))).toBeNull();
  });
});
