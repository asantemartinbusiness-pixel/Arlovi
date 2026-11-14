import type { Role } from "@/domain/types";

/**
 * Client-side visibility policy. Audit A17: this shapes what the interface
 * offers; it is not an account security boundary and never claims to be.
 */

export type Capability =
  | "post_journal" | "approve_payment" | "approve_mission" | "edit_people" | "view_payroll"
  | "edit_pipeline" | "publish_campaign" | "manage_connectors" | "manage_policy" | "delete_records"
  | "edit_knowledge" | "run_automation" | "export_data" | "view_legal";

const ROLE_APPS: Record<Role, string[] | "all"> = {
  owner: "all",
  finance: ["HQ", "INBOX", "FIN", "PROC", "COMMERCE", "ANALYTICS", "DOCS", "SHEETS", "AI", "BRAIN", "MISSION", "LEGAL", "ADMIN", "CONNECT", "ASSET", "PRESENT"],
  sales: ["HQ", "INBOX", "CRM", "MARKET", "COMMERCE", "BOOK", "CARE", "COMMS", "AI", "BRAIN", "MISSION", "DOCS", "PRESENT", "DESIGN", "ANALYTICS", "PORTAL", "ASSET"],
  people: ["HQ", "INBOX", "HR", "PROJECT", "COMMS", "DOCS", "SHEETS", "AI", "BRAIN", "TEAM", "MISSION", "LEGAL", "ANALYTICS", "ASSET"],
  member: ["HQ", "INBOX", "PROJECT", "COMMS", "DOCS", "SHEETS", "PRESENT", "DESIGN", "PHOTO", "LAYOUT", "VIDEO", "MOTION", "AI", "BRAIN", "TEAM", "MISSION", "CARE", "ASSET", "FORMS"],
  client: ["PORTAL", "BOOK", "CARE"],
};

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: ["post_journal", "approve_payment", "approve_mission", "edit_people", "view_payroll", "edit_pipeline", "publish_campaign", "manage_connectors", "manage_policy", "delete_records", "edit_knowledge", "run_automation", "export_data", "view_legal"],
  finance: ["post_journal", "approve_payment", "export_data", "view_legal", "run_automation"],
  sales: ["edit_pipeline", "publish_campaign", "export_data"],
  people: ["edit_people", "view_payroll", "export_data", "view_legal"],
  member: [],
  client: [],
};

export function canOpen(role: Role, applicationCode: string): boolean {
  const allowed = ROLE_APPS[role];
  return allowed === "all" || allowed.includes(applicationCode);
}

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function visibleApps(role: Role, codes: string[]): string[] {
  return codes.filter((code) => canOpen(role, code));
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  finance: "Finance",
  sales: "Sales",
  people: "People",
  member: "Team member",
  client: "Client",
};
