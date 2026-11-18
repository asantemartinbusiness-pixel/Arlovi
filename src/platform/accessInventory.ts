import { applications, screens, type ScreenInfo } from "@/app/catalog";
import { NAV_GROUPS } from "@/app/nav";
import { canOpen, type Capability } from "./policy";
import type { Role } from "@/domain/types";
import type { Classification } from "./accessModel";

/**
 * Every registered screen receives an explicit inventory entry through its
 * immutable catalogue ID. The default classification is informational only:
 * final field/resource classification MUST come from authenticated backend data.
 */
export interface ScreenAccessDescriptor {
  appCode: string;
  id: string;
  title: string;
  classification: Classification;
  legacyCapability?: Capability;
  privileged: boolean;
}

const CONFIDENTIAL_SCREEN_IDS = new Set([
  "ARL-CRM-003", "ARL-CRM-007",
  "ARL-HR-003", "ARL-HR-005", "ARL-HR-007", "ARL-HR-010",
  "ARL-COMMS-003", "ARL-COMMS-004", "ARL-COMMS-006",
  "ARL-CARE-004", "ARL-CARE-005",
  "ARL-FIN-008", "ARL-FIN-009", "ARL-FIN-011",
  "ARL-LEGAL-002", "ARL-LEGAL-003", "ARL-LEGAL-007",
  "ARL-ADMIN-007", "ARL-ADMIN-008",
  "ARL-BRAIN-003", "ARL-BRAIN-009",
  "ARL-PORTAL-004", "ARL-PORTAL-005", "ARL-PORTAL-006",
]);

const RESTRICTED_SCREEN_IDS = new Set([
  "ARL-HR-009", "ARL-ADMIN-003", "ARL-ADMIN-006", "ARL-ADMIN-011",
  "ARL-BUILD-006", "ARL-BUILD-007", "ARL-BUILD-010",
  "ARL-CONNECT-004", "ARL-CONNECT-005", "ARL-IT-008",
]);

const PAGE_CAPABILITIES: Record<string, Capability> = {
  "ARL-HR-009": "view_payroll",
  "ARL-ADMIN-003": "manage_policy",
  "ARL-ADMIN-006": "manage_policy",
  "ARL-ADMIN-008": "manage_policy",
  "ARL-ADMIN-011": "manage_connectors",
  "ARL-LEGAL-001": "view_legal",
  "ARL-LEGAL-002": "view_legal",
  "ARL-LEGAL-003": "view_legal",
  "ARL-LEGAL-004": "view_legal",
  "ARL-LEGAL-005": "view_legal",
  "ARL-LEGAL-006": "view_legal",
  "ARL-LEGAL-007": "view_legal",
  "ARL-BUILD-010": "manage_connectors",
  "ARL-CONNECT-004": "manage_connectors",
  "ARL-CONNECT-005": "manage_connectors",
  "ARL-IT-008": "manage_policy",
};

export function accessDescriptor(screen: ScreenInfo): ScreenAccessDescriptor {
  const classification: Classification = RESTRICTED_SCREEN_IDS.has(screen.id) ? "restricted"
    : CONFIDENTIAL_SCREEN_IDS.has(screen.id) ? "confidential" : "internal";
  return {
    appCode: screen.applicationCode,
    id: screen.id,
    title: screen.title,
    classification,
    legacyCapability: PAGE_CAPABILITIES[screen.id],
    privileged: classification !== "internal" || Boolean(PAGE_CAPABILITIES[screen.id]),
  };
}

export const ACCESS_SCREEN_INVENTORY: readonly ScreenAccessDescriptor[] =
  screens.map(accessDescriptor);

export const ACCESS_APPLICATION_INVENTORY = NAV_GROUPS.flatMap(group =>
  group.apps.map(app => ({
    code: app.code, short: app.short, group: group.label,
    pages: ACCESS_SCREEN_INVENTORY.filter(page => page.appCode === app.code),
  }))
);

export function canOpenLegacyScreen(role: Role, screen: ScreenInfo): boolean {
  const descriptor = accessDescriptor(screen);
  if (!canOpen(role, screen.applicationCode)) return false;
  // Existing client-only legacy capability policy, not a real security boundary.
  const capability = descriptor.legacyCapability;
  if (!capability) return true;
  // Avoid a circular dependency: permission lookup from the existing policy.
  return roleHasCapability(role, capability);
}

function roleHasCapability(role: Role, capability: Capability): boolean {
  switch (role) {
    case "owner": return true;
    case "finance": return ["post_journal","approve_payment","export_data","view_legal","run_automation"].includes(capability);
    case "sales": return ["edit_pipeline","publish_campaign","export_data"].includes(capability);
    case "people": return ["edit_people","view_payroll","export_data","view_legal"].includes(capability);
    case "member":
    case "client": return false;
  }
}

export function accessInventoryCoverage() {
  const applicationIds = new Set(applications.map(app => app.code));
  const covered = new Set(ACCESS_APPLICATION_INVENTORY.map(app => app.code));
  const screenIds = new Set(ACCESS_SCREEN_INVENTORY.map(screen => screen.id));
  return {
    apps: ACCESS_APPLICATION_INVENTORY.length,
    screens: ACCESS_SCREEN_INVENTORY.length,
    complete: applicationIds.size === covered.size &&
      [...applicationIds].every(code => covered.has(code)) && screenIds.size === screens.length,
  };
}
