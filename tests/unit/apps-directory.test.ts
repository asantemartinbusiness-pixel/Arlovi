import { describe, expect, it } from "vitest";
import { DIRECTORY_APPS, findDirectoryApps } from "@/app/AppsDirectory";
import { applications, appEntry, findScreen, screens } from "@/app/catalog";
import { NAV_GROUPS } from "@/app/nav";
import { canOpen } from "@/platform/policy";

describe("the native application directory", () => {
  it("includes every registered app exactly once and retains the existing six groups", () => {
    const registered = new Set(applications.map(app => app.code));
    const listed = DIRECTORY_APPS.map(app => app.code);
    expect(new Set(listed)).toEqual(registered);
    expect(new Set(listed).size).toBe(listed.length);
    expect(DIRECTORY_APPS.length).toBe(35);
    expect(NAV_GROUPS).toHaveLength(6);
    expect(DIRECTORY_APPS.every(app => app.purpose.length > 10 && app.name.length > 0)).toBe(true);
  });

  it("launches all 35 applications through real, record-independent company routes", () => {
    for (const app of DIRECTORY_APPS) {
      const path = appEntry(app.code, "harbor");
      expect(path, app.code).toMatch(/^\/o\/harbor\//);
      expect(path, app.code).not.toMatch(/:org|:id|:slug/);
      const match = findScreen(path);
      expect(match?.screen.applicationCode, app.code).toBe(app.code);
      expect(match?.params.id, app.code).toBeUndefined();
      expect(match?.params.slug, app.code).toBeUndefined();
      expect(screens.some(screen => screen.id === match?.screen.id), app.code).toBe(true);
    }
  });

  it("searches a capability and product description rather than only the short app name", () => {
    expect(findDirectoryApps(DIRECTORY_APPS, "invoices").some(app => app.code === "FIN")).toBe(true);
    expect(findDirectoryApps(DIRECTORY_APPS, "image editing").some(app => app.code === "PHOTO")).toBe(true);
    expect(findDirectoryApps(DIRECTORY_APPS, "workflow approval").some(app => app.code === "MISSION")).toBe(true);
  });

  it("supports multi-word search, category boundaries and stable exact-name ranking", () => {
    expect(findDirectoryApps(DIRECTORY_APPS, "finance")[0]?.code).toBe("FIN");
    expect(findDirectoryApps(DIRECTORY_APPS, "studio", "Operations")).toEqual([]);
    expect(findDirectoryApps(DIRECTORY_APPS, "", "Studio").every(app => app.group === "Studio")).toBe(true);
    expect(findDirectoryApps(DIRECTORY_APPS, "zzzz-unknown-capability")).toEqual([]);
  });

  it("keeps client role-view visibility distinct from identity and backend access", () => {
    const clientApps = DIRECTORY_APPS.filter(app => canOpen("client", app.code)).map(app => app.code);
    expect(clientApps).toContain("PORTAL");
    expect(clientApps).toContain("BOOK");
    expect(clientApps).not.toContain("FIN");
    expect(clientApps).not.toContain("ADMIN");
  });
});
