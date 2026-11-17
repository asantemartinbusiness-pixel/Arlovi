import { screens } from "@/app/catalog";

/**
 * Only record-independent screens may appear as shortcuts in the app directory.
 * Builder editors live behind a real site, app or form record, so those routes
 * must remain inaccessible here until a record is opened in its native app.
 */
const PLATFORM_LINKS: Record<string, readonly { id: string; label: string }[]> = {
  WEB: [{ id: "ARL-WEB-001", label: "Sites" }],
  BUILD: [{ id: "ARL-BUILD-001", label: "Projects" }],
  FORMS: [{ id: "ARL-FORMS-001", label: "Forms" }],
  CONNECT: [
    { id: "ARL-CONNECT-001", label: "Marketplace" },
    { id: "ARL-CONNECT-004", label: "Connections" },
    { id: "ARL-CONNECT-007", label: "Sync centre" },
    { id: "ARL-CONNECT-010", label: "Receipts" },
  ],
  IT: [
    { id: "ARL-IT-001", label: "Operations" },
    { id: "ARL-IT-002", label: "Incidents" },
    { id: "ARL-IT-004", label: "Health" },
    { id: "ARL-IT-008", label: "Security" },
  ],
};

export function platformDestinations(code: string, orgSlug: string): { label: string; to: string }[] {
  return (PLATFORM_LINKS[code] ?? []).flatMap(({ id, label }) => {
    const screen = screens.find(item => item.id === id && item.applicationCode === code);
    // Resolve the company only. Never manufacture a sample record identifier.
    if (!screen || /:(?!org\\b)[a-z]+\\b/i.test(screen.route)) return [];
    return [{ label, to: screen.route.replace(":org", orgSlug) }];
  });
}
