import { appEntry, screens } from "@/app/catalog";

/** Growth navigation is a capability index, not a transaction or data hand-off. */
export const GROWTH_WORKFLOWS = {
  MARKET: {
    appName: "Marketing & Growth",
    stage: "Reach",
    title: "Find and engage your audience",
    description: "Campaigns, publishing plans and attribution in one marketing workspace.",
    peer: "COMMERCE",
    peerLabel: "Explore products and orders",
  },
  COMMERCE: {
    appName: "Commerce & Storefront",
    stage: "Sell",
    title: "Turn interest into orders",
    description: "Products, stock, checkout intent and fulfilment records.",
    peer: "PROC",
    peerLabel: "Plan purchasing and replenishment",
  },
  BOOK: {
    appName: "Bookings & Capacity",
    stage: "Serve",
    title: "Manage time and capacity",
    description: "Appointments, staff resources, availability and follow-up.",
    peer: "PORTAL",
    peerLabel: "Open client and partner spaces",
  },
  PROC: {
    appName: "Procurement & Receiving",
    stage: "Source",
    title: "Keep purchasing and stock moving",
    description: "Supplier records, approvals, goods receipts and stock movement.",
    peer: "COMMERCE",
    peerLabel: "Review catalogue and inventory",
  },
  PORTAL: {
    appName: "Client & Partner Portals",
    stage: "Collaborate",
    title: "Work with clients and partners",
    description: "Create and review scoped spaces for external collaborators.",
    peer: "BOOK",
    peerLabel: "Review appointments and services",
  },
} as const;

export type GrowthCode = keyof typeof GROWTH_WORKFLOWS;

const GROWTH_LINKS: Record<GrowthCode, readonly { id: string; label: string }[]> = {
  MARKET: [
    { id: "ARL-MARKET-002", label: "Campaigns" },
    { id: "ARL-MARKET-004", label: "Content calendar" },
    { id: "ARL-MARKET-007", label: "Audiences" },
    { id: "ARL-MARKET-011", label: "Attribution" },
  ],
  COMMERCE: [
    { id: "ARL-COMMERCE-002", label: "Products" },
    { id: "ARL-COMMERCE-005", label: "Orders" },
    { id: "ARL-COMMERCE-004", label: "Inventory" },
    { id: "ARL-COMMERCE-009", label: "Fulfilment" },
  ],
  BOOK: [
    { id: "ARL-BOOK-002", label: "Calendar" },
    { id: "ARL-BOOK-004", label: "Services" },
    { id: "ARL-BOOK-005", label: "Resources" },
    { id: "ARL-BOOK-008", label: "Reports" },
  ],
  PROC: [
    { id: "ARL-PROC-004", label: "Requisitions" },
    { id: "ARL-PROC-005", label: "Purchase orders" },
    { id: "ARL-PROC-007", label: "Receiving" },
    { id: "ARL-PROC-002", label: "Suppliers" },
  ],
  // Portal detail routes require a selected portal ID. A directory link is
  // the only universally safe shortcut from another company's workspace.
  PORTAL: [{ id: "ARL-PORTAL-001", label: "Portal directory" }],
};

export function growthDestinations(code: string, orgSlug: string): { label: string; to: string }[] {
  if (!(code in GROWTH_LINKS)) return [];
  return GROWTH_LINKS[code as GrowthCode].flatMap(({ id, label }) => {
    const screen = screens.find(item => item.id === id && item.applicationCode === code);
    if (!screen || /:(?!org\b)[a-z]+\b/i.test(screen.route)) return [];
    return [{ label, to: screen.route.replace(":org", orgSlug) }];
  });
}

export function growthPeerDestination(code: GrowthCode, orgSlug: string): { code: GrowthCode; label: string; to: string } {
  const step = GROWTH_WORKFLOWS[code];
  return {
    code: step.peer,
    label: step.peerLabel,
    to: appEntry(step.peer, orgSlug),
  };
}
