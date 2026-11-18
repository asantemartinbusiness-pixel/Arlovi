import { findScreen, screens } from "@/app/catalog";

/**
 * Preserve only destinations that are safe when moving between browser-local
 * organisations. Never carry another company's record ID, modal or detail tab.
 */
export function destinationForOrganization(pathname: string, search: string, targetSlug: string): string {
  const source = /^\/o\/([^/]+)\//.exec(pathname);
  if (source?.[1] === targetSlug) return pathname + search;

  const workspace = /^\/o\/[^/]+\/workspace\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (workspace) {
    const section = workspace[1];
    if (!workspace[2] && ["home", "company", "spaces", "work", "apps", "recent", "resources", "people", "account", "health", "setup"].includes(section)) {
      return `/o/${targetSlug}/workspace/${section}`;
    }
    if (section === "work") return `/o/${targetSlug}/workspace/work`;
    if (section === "spaces") return `/o/${targetSlug}/workspace/spaces`;
    return `/o/${targetSlug}/workspace/home`;
  }

  const match = findScreen(pathname);
  if (!match) return `/o/${targetSlug}/workspace/home`;
  if (match.params.id || match.params.slug) {
    // Enter the same native app only on a list/root screen. Its generated
    // sample IDs and record slugs may belong to the previous company.
    const safe = screens.find(screen =>
      screen.applicationCode === match.screen.applicationCode &&
      !/:id\b|:slug\b/.test(screen.route)
    );
    return safe ? safe.route.replace(":org", targetSlug) : `/o/${targetSlug}/workspace/apps`;
  }

  const nextPath = pathname.replace(/^\/o\/[^/]+(?=\/|$)/, `/o/${targetSlug}`);
  const query = new URLSearchParams(search);
  for (const key of ["overlay", "selected", "record", "id", "modal", "drawer"]) query.delete(key);
  const suffix = query.toString();
  return suffix ? `${nextPath}?${suffix}` : nextPath;
}
