import { NAV_GROUPS } from "@/app/nav";
import { type ScreenInfo, screenPath } from "@/app/catalog";

/** A detail page should only become a sidebar link with a real current record ID.
 * Never navigate to the sample ID of another organization. */
export function contextualScreenPath(
  screen: ScreenInfo,
  orgSlug: string,
  detailId?: string,
  detailSlug?: string,
): string | null {
  if (screen.route.includes(":id") && !detailId) return null;
  if (screen.route.includes(":slug") && !detailSlug) return null;
  return screenPath(screen, orgSlug, detailId)
    .replace("showroom-consult", detailSlug ?? "showroom-consult");
}

export function areaForApplication(code: string): string {
  return NAV_GROUPS.find((group) => group.apps.some((app) => app.code === code))?.label ?? "Headquarters";
}
