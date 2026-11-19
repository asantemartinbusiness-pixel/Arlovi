import { findScreen } from "@/app/catalog";
import { APP_ENTRIES } from "@/app/nav";
import { canOpenLegacyScreen } from "@/platform/accessInventory";
import { rememberedAppRoute, type AppJourney } from "@/platform/appJourney";
import type { Role } from "@/domain/types";

export interface ResumableApp {
  code: string;
  title: string;
  page: string;
  to: string;
}

/** A single access-controlled source for app resumption surfaces.
 * Never display an unavailable app, foreign company record or stale route.
 * Each item is the actual last page, not an app's generic overview.
 */
export function resumableApps(journey: AppJourney, slug: string, role: Role, limit = 8): ResumableApp[] {
  const order = [...new Set([
    ...[...journey.trail].reverse().map(item => item.app),
    ...Object.keys(journey.byApp),
  ])];
  const items: ResumableApp[] = [];
  for (const code of order) {
    const app = APP_ENTRIES[code];
    if (!app || code.startsWith("WS:")) continue;
    const to = rememberedAppRoute(journey, slug, code);
    if (!to) continue;
    const found = findScreen(to.split(/[?#]/)[0]);
    if (!found || found.params.org !== slug || found.screen.applicationCode !== code ||
        !canOpenLegacyScreen(role, found.screen)) continue;
    const search = to.includes("?") ? to.split("?")[1].split("#")[0] : "";
    const params = new URLSearchParams(search);
    const overlay = params.get("overlay");
    const selectedTab = params.get("tab");
    const page = overlay
      ? overlay
      : selectedTab && selectedTab.toLowerCase() !== found.screen.title.toLowerCase()
        ? `${found.screen.title} · ${selectedTab}`
        : found.screen.title;
    items.push({ code, title: app.short, page, to });
    if (items.length === limit) break;
  }
  return items;
}
