import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/app/nav";
import { screens } from "@/app/catalog";
import { areaForApplication, contextualScreenPath } from "@/app/navigationModel";
import { primaryDestinations, visiblePrimaryGroups } from "@/app/HeadquartersNavigation";

describe("three-level headquarters navigation contract", () => {
  it("retains every native application in one discoverable catalogue", () => {
    const apps = NAV_GROUPS.flatMap((group) => group.apps);
    expect(apps).toHaveLength(35);
    expect(new Set(apps.map((app) => app.code)).size).toBe(35);
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(
      ["Headquarters", "Intelligence", "Operations", "Growth", "Studio", "Platform"],
    );
  });
  it("provides genuine headquarters destinations instead of unrelated app entry pages", () => {
    const destinations = primaryDestinations("northline");
    expect(destinations.find((item) => item.label === "My Workspace")?.href).toBe("/o/northline/hq/my-work");
    expect(destinations.find((item) => item.label === "Company Overview")?.href).toBe("/o/northline/hq/company");
    expect(destinations.find((item) => item.label === "Departments")?.href).toBe("/o/northline/hq/departments");
    expect(destinations.some((item) => item.label === "Studio")).toBe(true);
    expect(destinations.length).toBeLessThan(15);
  });
  it("never inserts a hardcoded sample ID into contextual navigation", () => {
    const detail = screens.find((screen) => screen.route === "/o/:org/design/files/:id");
    expect(detail).toBeDefined();
    expect(contextualScreenPath(detail!, "new-company")).toBeNull();
    expect(contextualScreenPath(detail!, "new-company", "real-id-123"))
      .toBe("/o/new-company/design/files/real-id-123");
  });
  it("shows client-appropriate destinations without inaccessible company-wide links", () => {
    const groups = visiblePrimaryGroups("client");
    expect(groups).toHaveLength(1);
    expect(groups[0].links.map((item) => item.label)).toEqual(
      ["Client Portal", "Bookings", "Customer Care"],
    );
    expect(groups.flatMap((group) => group.links).some((entry) => entry.path?.startsWith("hq/"))).toBe(false);
  });

  it("keeps professional tools in their correct areas", () => {
    expect(areaForApplication("DESIGN")).toBe("Studio");
    expect(areaForApplication("PHOTO")).toBe("Studio");
    expect(areaForApplication("FIN")).toBe("Operations");
    expect(areaForApplication("BRAIN")).toBe("Intelligence");
    expect(areaForApplication("COMMERCE")).toBe("Growth");
  });
});
