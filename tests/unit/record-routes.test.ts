import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORD_ROUTES } from "@/platform/attention";

const catalog = JSON.parse(readFileSync(new URL("../../src/generated/catalog.json", import.meta.url), "utf8")) as { screens: { route: string }[] };
const routes = new Set(catalog.screens.map((screen) => screen.route.replace("/o/:org/", "")));

describe("record routes", () => {
  it("send every collection to a screen that exists", () => {
    const dead: string[] = [];
    for (const [collection, route] of Object.entries(RECORD_ROUTES)) {
      if (!routes.has(route.list)) dead.push(`${collection} list ${route.list}`);
      if (route.detail && !routes.has(`${route.detail}/:id`)) dead.push(`${collection} detail ${route.detail}/:id`);
    }
    expect(dead).toEqual([]);
  });
});
