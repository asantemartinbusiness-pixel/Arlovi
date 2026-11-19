import { appEntry, findScreen } from "@/app/catalog";
import { readAppJourney, rememberedAppRoute } from "@/platform/appJourney";
import { canOpenLegacyScreen } from "@/platform/accessInventory";
import type { Role } from "@/domain/types";

/**
 * Re-enter a known native application at its last permitted route.
 * The route and query must belong to the same organisation and app.
 * This never carries another tenant's record or a hidden role route.
 */
export function resumeNativeAppPath(orgId: string, slug: string, actor: string, role: Role, code: string): string {
  const fallback = appEntry(code, slug);
  const journey = readAppJourney(`${orgId}:${role}:${actor}`, slug);
  const remembered = rememberedAppRoute(journey, slug, code);
  if (!remembered) return fallback;
  const destination = findScreen(remembered.split(/[?#]/)[0])?.screen;
  return destination && destination.applicationCode === code && canOpenLegacyScreen(role, destination)
    ? remembered : fallback;
}
