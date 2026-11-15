import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadApplications } from "@/applications";
import { allApps, getApp } from "@/platform/registry";

interface Contract {
  id: string; title: string; route: string; applicationCode: string; applicationName: string;
  tabs: string[]; actions: string[]; overlays: string[]; archetype: string;
}

beforeAll(async () => {
  const failures = await loadApplications();
  if (failures.length) throw new Error(`Applications failed to load: ${failures.map((f) => `${f.group}: ${f.message}`).join("; ")}`);
});

const catalog = JSON.parse(readFileSync(new URL("../../src/generated/catalog.json", import.meta.url), "utf8")) as {
  screens: Contract[];
  counts: Record<string, number>;
};

const APP_CODES = [...new Set(catalog.screens.map((screen) => screen.applicationCode))];

describe("screen registry contract", () => {
  it("registers an application module for every approved application", () => {
    const missing = APP_CODES.filter((code) => !getApp(code));
    expect(missing, `applications without a module: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares tabs that exist in the approved contract", () => {
    // The tab strip is the contract: an extra tab means a misnamed one.
    const problems: string[] = [];
    for (const screen of catalog.screens) {
      const def = getApp(screen.applicationCode)?.screens[screen.id];
      if (!def) continue;
      for (const tab of def.tabs ?? []) {
        if (!screen.tabs.includes(tab.id)) problems.push(`${screen.id}: tab "${tab.id}" is not in the contract`);
      }
    }
    expect(problems.slice(0, 40)).toEqual([]);
  });

  it("routes every action that opens an overlay to an overlay the screen declares", () => {
    // Overlays and actions beyond the contract are allowed (the contract is a
    // floor), but an action must never open an overlay that does not exist.
    const problems: string[] = [];
    for (const screen of catalog.screens) {
      const def = getApp(screen.applicationCode)?.screens[screen.id];
      if (!def) continue;
      const ids = new Set((def.overlays ?? []).map((overlay) => overlay.id));
      for (const action of def.actions ?? []) {
        const source = action.run.toString();
        for (const match of source.matchAll(/openOverlay\(\s*"([^"]+)"/g)) {
          if (!ids.has(match[1])) problems.push(`${screen.id}: action "${action.id}" opens undeclared overlay "${match[1]}"`);
        }
      }
    }
    expect(problems.slice(0, 40)).toEqual([]);
  });

  it("writes the coverage ledger", () => {
    const rows = catalog.screens.map((screen) => {
      const app = getApp(screen.applicationCode);
      const def = app?.screens[screen.id];
      const tabs = def?.tabs?.map((tab) => tab.id) ?? [];
      const actions = def?.actions?.map((action) => action.id) ?? [];
      const overlays = def?.overlays?.map((overlay) => overlay.id) ?? [];
      return {
        id: screen.id,
        title: screen.title,
        route: screen.route,
        app: screen.applicationCode,
        implementation: def ? (def.surface ? "bespoke-surface" : "bespoke") : app?.fallback ? "app-fallback" : "legacy",
        tabsRequired: screen.tabs.length,
        tabsDeclared: tabs.length,
        actionsRequired: screen.actions.length,
        actionsDeclared: actions.length,
        overlaysRequired: screen.overlays.length,
        overlaysDeclared: overlays.length,
        missingTabs: screen.tabs.filter((tab) => !tabs.includes(tab)),
        missingActions: screen.actions.filter((action) => !actions.includes(action)),
        missingOverlays: screen.overlays.filter((overlay) => !overlays.includes(overlay)),
      };
    });

    const totals = rows.reduce((acc, row) => ({
      screens: acc.screens + 1,
      bespoke: acc.bespoke + (row.implementation.startsWith("bespoke") ? 1 : 0),
      fallback: acc.fallback + (row.implementation === "app-fallback" ? 1 : 0),
      legacy: acc.legacy + (row.implementation === "legacy" ? 1 : 0),
      tabsRequired: acc.tabsRequired + row.tabsRequired,
      tabsDeclared: acc.tabsDeclared + Math.min(row.tabsDeclared, row.tabsRequired),
      actionsRequired: acc.actionsRequired + row.actionsRequired,
      actionsDeclared: acc.actionsDeclared + Math.min(row.actionsDeclared, row.actionsRequired),
      overlaysRequired: acc.overlaysRequired + row.overlaysRequired,
      overlaysDeclared: acc.overlaysDeclared + Math.min(row.overlaysDeclared, row.overlaysRequired),
    }), { screens: 0, bespoke: 0, fallback: 0, legacy: 0, tabsRequired: 0, tabsDeclared: 0, actionsRequired: 0, actionsDeclared: 0, overlaysRequired: 0, overlaysDeclared: 0 });

    mkdirSync(new URL("../../docs/implementation/", import.meta.url), { recursive: true });
    writeFileSync(
      new URL("../../docs/implementation/registry-coverage.json", import.meta.url),
      `${JSON.stringify({ generatedFrom: "src/generated/catalog.json + registered application modules", applications: allApps().length, totals, rows }, null, 2)}\n`,
    );
    expect(totals.screens).toBe(catalog.counts.screens);
  });
});
