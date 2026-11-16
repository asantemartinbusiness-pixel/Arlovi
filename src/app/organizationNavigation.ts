import { appEntry, findScreen } from "@/app/catalog";

/** Avoid carrying a previous organization's record into a new workspace. */
export function destinationForOrganization(pathname: string, search: string, targetSlug: string): string {
  const match = findScreen(pathname);
  if (!match) return `/o/${targetSlug}/hq/home`;
  if (match.params.org === targetSlug) return pathname + search;
  if (match.params.id || match.params.slug) return appEntry(match.screen.applicationCode, targetSlug);

  const nextPath = pathname.replace(/^\/o\/[^/]+(?=\/|$)/, `/o/${targetSlug}`);
  const query = new URLSearchParams(search);
  query.delete("overlay");
  query.delete("selected");
  query.delete("record");
  const suffix = query.toString();
  return suffix ? `${nextPath}?${suffix}` : nextPath;
}
