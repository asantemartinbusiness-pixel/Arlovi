import type { Role } from "@/domain/types";
import { applications, screens } from "@/app/catalog";
import { can, canOpen, type Capability } from "./policy";

/**
 * Arlovi Identity, Roles & Access — descriptive policy contract.
 *
 * This is a browser-side policy model and an access simulator. It must NOT be
 * used as an authentication or data-security boundary. Enforce these decisions
 * in the future authorised API/database/storage/AI-tool layer.
 */
export type AccessScope = "none" | "own" | "assigned" | "team" | "department" | "business_unit" | "organization" | "explicit";
export type AccessAction = "discover" | "open" | "view" | "create" | "edit" | "comment" | "assign" | "approve" | "publish" | "export" | "share" | "delete" | "manage";
export type SubjectKind = "human" | "external" | "agent" | "service";
export type ResourceClassification = "public" | "internal" | "confidential" | "restricted";
export type RoleFamily = "governance" | "executive" | "management" | "employee" | "external" | "automation";
export type DecisionReason = "explicit_deny" | "expired" | "org_mismatch" | "classification" | "role_grant" | "explicit_grant" | "missing_grant" | "approval_required";

export interface PermissionGrant {
  application: string;
  action: AccessAction;
  scope: AccessScope;
  effect: "allow" | "deny";
  resourceId?: string;
  classificationMax?: ResourceClassification;
  expiresAt?: string;
  limitMinor?: number;
  requiresApproval?: boolean;
}
export interface AccessPrincipal {
  subjectId: string;
  organizationId: string;
  kind: SubjectKind;
  roleIds: string[];
  departmentIds?: string[];
  teamIds?: string[];
  grants?: PermissionGrant[];
}
export interface AccessResource {
  organizationId: string;
  application: string;
  id?: string;
  ownerId?: string;
  assigneeIds?: string[];
  teamId?: string;
  departmentId?: string;
  businessUnitId?: string;
  classification: ResourceClassification;
}
export interface AccessEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  reason: DecisionReason;
  source?: string;
  scope?: AccessScope;
}
export interface RoleTemplate {
  id: string;
  name: string;
  family: RoleFamily;
  description: string;
  apps: readonly string[] | "all";
  scope: AccessScope;
  permissions: readonly AccessAction[];
  sensitiveAccess?: readonly string[];
  legacyRole?: Role;
}
const BASIC = ["discover","open","view"] as const;
const EDIT = ["discover","open","view","create","edit","comment"] as const;
const MANAGE = ["discover","open","view","create","edit","comment","assign"] as const;
const APP_CODES = applications.map(app => app.code);
const INTERNAL_COMMON = ["HQ","INBOX","AI","BRAIN","PROJECT","COMMS","DOCS","SHEETS","PRESENT","ASSET"] as const;

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { id:"company_owner", name:"Company Owner", family:"governance", description:"Company governance, ownership and designated business authority.", apps:"all", scope:"organization", permissions:[...MANAGE,"manage","export"], legacyRole:"owner" },
  { id:"managing_director", name:"Managing Director / CEO", family:"executive", description:"Cross-company oversight and delegated executive authority.", apps:"all", scope:"organization", permissions:[...MANAGE,"export"] },
  { id:"executive", name:"Executive / C-suite", family:"executive", description:"Relevant cross-department oversight and delegated decisions.", apps:"all", scope:"organization", permissions:[...MANAGE] },
  { id:"organization_admin", name:"Organisation Administrator", family:"governance", description:"Administration, identities and company setup; not automatic payroll or legal-data access.", apps:["HQ","INBOX","ADMIN","ASSET","CONNECT","IT","FORMS","WEB","BUILD","COMMS","ANALYTICS"], scope:"organization", permissions:[...MANAGE,"manage"] },
  { id:"department_head", name:"Department Director / Head", family:"management", description:"Department operations, people and budgets within assigned scope.", apps:"all", scope:"department", permissions:[...MANAGE,"export"] },
  { id:"team_manager", name:"Team Manager / Supervisor", family:"management", description:"Manage assigned team workload and team resources.", apps:"all", scope:"team", permissions:MANAGE },
  { id:"employee", name:"Employee / Team Member", family:"employee", description:"Use assigned tools and collaborate on permitted records.", apps:INTERNAL_COMMON, scope:"assigned", permissions:EDIT, legacyRole:"member" },
  { id:"limited_contributor", name:"Limited Contributor / Intern", family:"employee", description:"Work on explicitly assigned projects and drafts.", apps:["INBOX","PROJECT","COMMS","DOCS","SHEETS","PRESENT","DESIGN","ASSET"], scope:"assigned", permissions:EDIT },
  { id:"contractor", name:"Guest / Contractor", family:"external", description:"Only directly shared workspaces and files, with optional expiry.", apps:["PROJECT","COMMS","DOCS","SHEETS","PRESENT","DESIGN","PHOTO","VIDEO","PORTAL"], scope:"explicit", permissions:BASIC },
  { id:"client", name:"Client / Customer", family:"external", description:"Own portal, customer support, bookings and approved shared resources.", apps:["PORTAL","BOOK","CARE"], scope:"explicit", permissions:BASIC, legacyRole:"client" },
  { id:"supplier", name:"Supplier / Vendor", family:"external", description:"Supplier portal, assigned purchase orders and communications.", apps:["PORTAL","PROC","COMMS"], scope:"explicit", permissions:BASIC },
  { id:"auditor", name:"Auditor / Compliance Reviewer", family:"external", description:"Temporary explicitly scoped read-only evidence and reports.", apps:["FIN","HR","LEGAL","ANALYTICS","ADMIN","DOCS"], scope:"explicit", permissions:BASIC },
  { id:"ai_employee", name:"AI Employee / Service Agent", family:"automation", description:"Named service identity with a human owner and strictly delegated resources.", apps:[], scope:"explicit", permissions:[] },
  { id:"finance", name:"Finance Specialist", family:"employee", description:"Finance and procurement operations under assigned authority.", apps:["HQ","INBOX","FIN","PROC","COMMERCE","ANALYTICS","DOCS","SHEETS","AI","BRAIN","MISSION","LEGAL","ADMIN","CONNECT","ASSET","PRESENT"], scope:"department", permissions:EDIT, legacyRole:"finance" },
  { id:"sales", name:"Sales Specialist", family:"employee", description:"Sales, customers and growth tools.", apps:["HQ","INBOX","CRM","MARKET","COMMERCE","BOOK","CARE","COMMS","AI","BRAIN","MISSION","DOCS","PRESENT","DESIGN","ANALYTICS","PORTAL","ASSET"], scope:"team", permissions:EDIT, legacyRole:"sales" },
  { id:"people", name:"People Specialist", family:"employee", description:"Recruiting, people operations and workforce collaboration.", apps:["HQ","INBOX","HR","PROJECT","COMMS","DOCS","SHEETS","AI","BRAIN","TEAM","MISSION","LEGAL","ANALYTICS","ASSET"], scope:"department", permissions:EDIT, legacyRole:"people" },
];

export const CLASSIFICATION_LEVEL: Record<ResourceClassification, number> = {
  public:0, internal:1, confidential:2, restricted:3,
};
export const SCOPE_LEVEL: Record<Exclude<AccessScope,"explicit">,number> = {
  none:0, own:1, assigned:2, team:3, department:4, business_unit:5, organization:6,
};
export const SENSITIVE_RULES: Record<string,readonly string[]> = {
  HR:["Payroll","Employee Profile","Applicant Profile","Leave & Absence","Performance Reviews"],
  FIN:["Banking & Feeds","Bank Reconciliation","General Ledger","Tax & Compliance"],
  LEGAL:["Contract Detail","Risk Register","Audit & Evidence"],
  ADMIN:["Security & Sessions","Privacy & Data Controls","Environment & Developer Access"],
  COMMS:["Email Thread","Direct Messages","Communication Preferences"],
  CONNECT:["Installed Connections","Connection Detail","Custom Connectors"],
  IT:["Security Centre","Logs & Tracing"],
  BUILD:["Integrations & Secrets","Database Designer","Authentication & Roles"],
};

export function allRegisteredApplicationCodes(): string[] { return [...APP_CODES]; }
export function roleTemplate(id: string): RoleTemplate | undefined { return ROLE_TEMPLATES.find(role=>role.id===id); }
export function applicationsForRoleTemplate(roleId:string): string[] {
  const role=roleTemplate(roleId);
  return role ? (role.apps==="all" ? [...APP_CODES] : [...role.apps]) : [];
}
export function isSensitiveScreen(appCode:string,title:string): boolean {
  return (SENSITIVE_RULES[appCode] ?? []).includes(title);
}
export function screenAccessCatalogue(): { app:string; screen:string; title:string; sensitive:boolean }[] {
  return screens.map(s=>({app:s.applicationCode,screen:s.id,title:s.title,sensitive:isSensitiveScreen(s.applicationCode,s.title)}));
}
export function defaultLegacyTemplate(role: Role): string {
  return ({ owner:"company_owner", finance:"finance", sales:"sales", people:"people", member:"employee", client:"client" } satisfies Record<Role,string>)[role];
}
export function scopeMatches(scope:AccessScope,subject:AccessPrincipal,resource:AccessResource):boolean {
  if(scope==="none")return false;
  if(scope==="organization")return true;
  if(scope==="explicit")return Boolean(resource.id && subject.grants?.some(g=>g.effect==="allow" && g.resourceId===resource.id && g.application===resource.application));
  if(scope==="own")return resource.ownerId===subject.subjectId;
  if(scope==="assigned")return resource.ownerId===subject.subjectId || (resource.assigneeIds??[]).includes(subject.subjectId);
  if(scope==="team")return Boolean(resource.teamId && subject.teamIds?.includes(resource.teamId)) || scopeMatches("assigned",subject,resource);
  if(scope==="department")return Boolean(resource.departmentId && subject.departmentIds?.includes(resource.departmentId)) || scopeMatches("team",subject,resource);
  if(scope==="business_unit")return Boolean(resource.businessUnitId && subject.grants?.some(g=>g.scope==="business_unit" && g.resourceId===resource.businessUnitId && g.effect==="allow")) || scopeMatches("department",subject,resource);
  return false;
}

export function evaluateAccess(
  subject:AccessPrincipal, resource:AccessResource, action:AccessAction,
  options:{now?:string;approvalGranted?:boolean}={},
):AccessEvaluation{
  if(subject.organizationId!==resource.organizationId)return {allowed:false,requiresApproval:false,reason:"org_mismatch"};
  const now=options.now??"";
  const grants=(subject.grants??[]).filter(g=>g.application===resource.application && g.action===action &&
    (!g.expiresAt || !now || g.expiresAt>now));
  if((subject.grants??[]).some(g=>g.application===resource.application && g.action===action &&
    g.effect==="deny" && (!g.resourceId || g.resourceId===resource.id)))
    return {allowed:false,requiresApproval:false,reason:"explicit_deny"};
  const eligible=grants.filter(g=>g.effect==="allow" && (!g.resourceId || g.resourceId===resource.id) &&
    CLASSIFICATION_LEVEL[resource.classification]<=CLASSIFICATION_LEVEL[g.classificationMax??"internal"] &&
    scopeMatches(g.scope,subject,resource));
  const granted=eligible[0];
  if(granted)return granted.requiresApproval&&!options.approvalGranted
    ? {allowed:false,requiresApproval:true,reason:"approval_required",scope:granted.scope}
    : {allowed:true,requiresApproval:false,reason:"explicit_grant",scope:granted.scope};
  for(const id of subject.roleIds){
    const role=roleTemplate(id);
    if(!role || role.apps!=="all" && !role.apps.includes(resource.application) || !role.permissions.includes(action))continue;
    if(resource.classification==="confidential" || resource.classification==="restricted")
      return {allowed:false,requiresApproval:false,reason:"classification",source:role.name};
    if(scopeMatches(role.scope,subject,resource))return {allowed:true,requiresApproval:false,reason:"role_grant",source:role.name,scope:role.scope};
  }
  return {allowed:false,requiresApproval:false,reason:"missing_grant"};
}
/** Existing six role views are unchanged until an authenticated backend is installed. */
export function legacyRolePreview(role:Role):{apps:string[];capabilities:Capability[]}{
  return {apps:APP_CODES.filter(code=>canOpen(role,code)),capabilities:([
    "post_journal","approve_payment","approve_mission","edit_people","view_payroll","edit_pipeline","publish_campaign","manage_connectors","manage_policy","delete_records","edit_knowledge","run_automation","export_data","view_legal",
  ] as Capability[]).filter(cap=>can(role,cap))};
}
