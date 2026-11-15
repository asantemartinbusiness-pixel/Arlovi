import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import "@/applications";
import { getApp } from "@/platform/registry";

const catalog = JSON.parse(readFileSync(new URL("../../src/generated/catalog.json", import.meta.url), "utf8")) as {
  screens: { id: string; title: string; applicationCode: string; actions: string[]; overlays: string[] }[];
};

/** Writes every declared action with its label and handler, for the semantic audit. */
it("writes the action inventory", () => {
  const rows = catalog.screens.flatMap((screen) => {
    const def = getApp(screen.applicationCode)?.screens[screen.id];
    return (def?.actions ?? []).map((action) => ({
      screen: screen.id,
      title: screen.title,
      app: screen.applicationCode,
      id: action.id,
      label: action.label ?? action.id,
      placement: action.placement,
      inContract: screen.actions.includes(action.id),
      handler: action.run.toString().replace(/\s+/g, " ").slice(0, 260),
    }));
  });
  writeFileSync(process.env.ACTION_INVENTORY ?? "/tmp/action-inventory.json", JSON.stringify(rows, null, 1));
});
