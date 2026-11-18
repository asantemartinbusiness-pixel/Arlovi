import type { Role } from "@/domain/types";
import { clockNow } from "./clock";
import { canOpen, can as legacyCan, type Capability } from "./policy";

/**
 * Authorization contract for authenticated Arlovi services.
 *
 * This pure policy model can be exercised by a trusted server. Never pass
 * arbitrary client-supplied principals, roles or resource attributes to it and
 * mistake the result for enforcement. Browser role previews are informational.
 */
export type ActorKind = "human" | "ai_agent" | "service" | "external";
export type AccessAction =
  | "discover" | "open" | "view" | "create" | "edit" | "comment" | "assign"
  | "approve" | "publish" | "export" | "share" | "delete" | "manage"
  | "execute" | "view_sensitive" | "manage_credentials";
export type AccessScope = "own" | "assigned" | "team" | "department" | "entity" | "organization" | "explicit";
export type Classification = "public" | "internal" | "confidential" | "restricted";
export type AccessOutcome = "allow" | "deny" | "approval_required";

export interface AccessPrincipal {
  id: string;
  orgId: string;
  kind: ActorKind;
  authenticated: boolean;
  roles: string[];
  departmentIds?: string[];
  teamIds?: string[];
  entityIds?: string[];
  suspended?: boolean;
}

export interface AccessResource {
  orgId: string;
  appCode: string;
  screenId?: string;
  id?: string;
  ownerId?: string;
  submittedById?: string;
  assigneeIds?: string[];
  teamId?: string;
  departmentId?: string;
  entityId?: string;
  sharedWithIds?: string[];
  classification: Classification;
}

export interface AccessGrant {
  id: string;
  orgId: string;
  effect: "allow" | "deny";
  principalIds?: string[];
  roleIds?: string[];
  appCodes: string[];
  screenIds?: string[];
  resourceIds?: string[];
  actions: AccessAction[];
  scope: AccessScope;
  maxClassification?: Classification;
  maxAmountMinor?: number;
  requiresApproval?: boolean;
  expiresAt?: string;
  /** A grant must expressly include AI workers; no inherited human rights. */
  agentEligible?: boolean;
}

export interface AccessQuery {
  principal: AccessPrincipal;
  resource: AccessResource;
  action: AccessAction;
  amountMinor?: number;
  now?: Date;
}

export interface AccessDecision {
  outcome: AccessOutcome;
  reason: string;
  matchedGrantIds: string[];
}

const LEVEL: Record<Classification, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3,
};

export function scopeMatches(
  scope: AccessScope,
  principal: AccessPrincipal,
  resource: AccessResource,
  grant?: AccessGrant,
): boolean {
  switch (scope) {
    case "own": return resource.ownerId === principal.id;
    case "assigned": return Boolean(resource.assigneeIds?.includes(principal.id) || resource.sharedWithIds?.includes(principal.id));
    case "team": return Boolean(resource.teamId && principal.teamIds?.includes(resource.teamId));
    case "department": return Boolean(resource.departmentId && principal.departmentIds?.includes(resource.departmentId));
    case "entity": return Boolean(resource.entityId && principal.entityIds?.includes(resource.entityId));
    case "organization": return true;
    case "explicit": return Boolean(resource.id && grant?.resourceIds?.includes(resource.id));
  }
}

function isTargetMatch(grant: AccessGrant, query: AccessQuery, now: Date): boolean {
  const { principal, resource, action } = query;
  if (grant.orgId !== principal.orgId || grant.orgId !== resource.orgId) return false;
  if (grant.expiresAt && (!(Number.isFinite(Date.parse(grant.expiresAt))) || Date.parse(grant.expiresAt) <= now.getTime())) return false;
  if (principal.kind === "ai_agent" && grant.agentEligible !== true) return false;
  if (grant.principalIds?.length || grant.roleIds?.length) {
    if (!grant.principalIds?.includes(principal.id) &&
        !grant.roleIds?.some(id => principal.roles.includes(id))) return false;
  } else return false; // Never create a wildcard grant by omitting its subject.
  if (!grant.actions.includes(action)) return false;
  if (!grant.appCodes.includes(resource.appCode)) return false;
  if (grant.screenIds?.length && (!resource.screenId || !grant.screenIds.includes(resource.screenId))) return false;
  if (grant.resourceIds?.length && (!resource.id || !grant.resourceIds.includes(resource.id))) return false;
  return scopeMatches(grant.scope, principal, resource, grant);
}

/** Deny wins. Conflicting grants never silently expand access. */
export function evaluateAccess(query: AccessQuery, grants: readonly AccessGrant[]): AccessDecision {
  const { principal, resource } = query;
  if (!principal.authenticated || !principal.id || !principal.orgId || principal.suspended)
    return { outcome: "deny", reason: "No active authenticated identity.", matchedGrantIds: [] };
  if (principal.orgId !== resource.orgId)
    return { outcome: "deny", reason: "Access cannot cross organisation boundaries.", matchedGrantIds: [] };
  if (query.action === "approve" && resource.submittedById && resource.submittedById === principal.id)
    return { outcome: "deny", reason: "An actor cannot approve their own submitted transaction.", matchedGrantIds: [] };
  const now = query.now ?? clockNow();
  const matched = grants.filter(g => isTargetMatch(g, query, now));
  const denial = matched.filter(g => g.effect === "deny");
  if (denial.length) return { outcome: "deny", reason: "Explicit restriction takes precedence.", matchedGrantIds: denial.map(g => g.id) };
  const allowed = matched.filter(g => g.effect === "allow"
    && LEVEL[resource.classification] <= LEVEL[g.maxClassification ?? "internal"]);
  if (!allowed.length) return { outcome: "deny", reason: "No matching grant for this resource and action.", matchedGrantIds: [] };
  if (principal.kind === "ai_agent" && ["approve","publish","delete","manage_credentials"].includes(query.action))
    return { outcome: "approval_required", reason: "An AI employee needs separate human authorisation for high-impact actions.", matchedGrantIds: allowed.map(g => g.id) };
  const direct = allowed.filter(g => {
    const withinAmount = query.amountMinor === undefined || g.maxAmountMinor === undefined
      || query.amountMinor <= g.maxAmountMinor;
    return withinAmount && g.requiresApproval !== true;
  });
  if (direct.length) return { outcome: "allow", reason: "An applicable, non-expired grant permits the action.", matchedGrantIds: direct.map(g => g.id) };
  return { outcome: "approval_required", reason: "A spending limit or approval condition requires review.", matchedGrantIds: allowed.map(g => g.id) };
}

export interface RoleTemplate {
  id: string;
  title: string;
  description: string;
  audience: "internal" | "external" | "agent";
  /** App suggestions only; the real server must issue and enforce grants. */
  recommendedApps: string[] | "all";
  legacyPreviewRole: Role;
}

const LEADERSHIP = ["HQ","INBOX","ADMIN","ASSET","AI","BRAIN","TEAM","MISSION","AUTO","ANALYTICS","FIN","CRM","HR","PROJECT","COMMS","CARE","LEGAL","MARKET","COMMERCE","BOOK","PROC","PORTAL","DOCS","SHEETS","PRESENT","DESIGN","PHOTO","LAYOUT","VIDEO","MOTION","WEB","BUILD","FORMS","CONNECT","IT"];
const CORE = ["HQ","INBOX","PROJECT","COMMS","DOCS","SHEETS","PRESENT","AI","BRAIN","ASSET"];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { id:"owner", title:"Company Owner", audience:"internal", description:"Company ownership, governance and explicitly authorised operations.", recommendedApps:"all", legacyPreviewRole:"owner" },
  { id:"managing_director", title:"Managing Director / CEO", audience:"internal", description:"Cross-company oversight and delegated business approvals, without secret or private-data bypass.", recommendedApps:LEADERSHIP.filter(c=>!["IT","CONNECT","BUILD"].includes(c)), legacyPreviewRole:"owner" },
  { id:"executive", title:"Executive / C-Suite", audience:"internal", description:"Strategic departmental oversight within delegated scope.", recommendedApps:LEADERSHIP.filter(c=>!["IT","CONNECT","BUILD"].includes(c)), legacyPreviewRole:"owner" },
  { id:"org_admin", title:"Organisation Administrator", audience:"internal", description:"Members, applications and organisation settings without automatic access to payroll or confidential data.", recommendedApps:["HQ","INBOX","ADMIN","ASSET","CONNECT","IT","FORMS","PROJECT","COMMS","ANALYTICS"], legacyPreviewRole:"owner" },
  { id:"department_head", title:"Department Head", audience:"internal", description:"Department-level teams, work, budgets and approvals with scoped records.", recommendedApps:["HQ","INBOX","ASSET","PROJECT","ANALYTICS","DOCS","SHEETS","PRESENT","COMMS","AI","BRAIN","MISSION","CARE"], legacyPreviewRole:"member" },
  { id:"team_manager", title:"Team Manager", audience:"internal", description:"Assigned-team workload, collaboration and delegated approvals.", recommendedApps:CORE, legacyPreviewRole:"member" },
  { id:"employee", title:"Employee / Team Member", audience:"internal", description:"Own and assigned work, collaboration and permitted apps.", recommendedApps:CORE, legacyPreviewRole:"member" },
  { id:"limited", title:"Limited Contributor / Intern", audience:"internal", description:"Specifically assigned tasks, documents and supervised contributions.", recommendedApps:["HQ","INBOX","PROJECT","COMMS","DOCS","ASSET"], legacyPreviewRole:"member" },
  { id:"contractor", title:"Guest / Contractor", audience:"external", description:"Explicitly shared resources and time-bounded collaboration only.", recommendedApps:["PORTAL","PROJECT","DOCS","COMMS"], legacyPreviewRole:"client" },
  { id:"client", title:"Client / Customer", audience:"external", description:"Own customer portal, bookings, requests and shared materials.", recommendedApps:["PORTAL","BOOK","CARE"], legacyPreviewRole:"client" },
  { id:"supplier", title:"Supplier / Vendor", audience:"external", description:"Only supplier-facing purchase and fulfilment resources.", recommendedApps:["PORTAL","PROC","COMMS"], legacyPreviewRole:"client" },
  { id:"auditor", title:"Auditor / Compliance Reviewer", audience:"external", description:"Time-limited read-only evidence and explicitly assigned reports.", recommendedApps:["LEGAL","ANALYTICS","DOCS"], legacyPreviewRole:"client" },
  { id:"ai_agent", title:"AI Employee / Service Agent", audience:"agent", description:"Tool-specific service access with a named human supervisor and action limits.", recommendedApps:["AI","TEAM","MISSION","AUTO"], legacyPreviewRole:"member" },
];

/** Suggested UI preview, never a security decision. */
export function templateOffersApp(roleId: string, appCode: string): boolean {
  const entry = ROLE_TEMPLATES.find(role => role.id === roleId);
  return entry ? entry.recommendedApps === "all" || entry.recommendedApps.includes(appCode) : false;
}

/** Legacy role preview is kept for migration/compatibility, never elevated to an authenticated principal. */
export function legacyRolePreview(role: Role, appCode: string, capability?: Capability): boolean {
  return canOpen(role, appCode) && (!capability || legacyCan(role, capability));
}
