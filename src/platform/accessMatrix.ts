import { applications, screens } from "@/app/catalog";
import {
  ROLE_TEMPLATES, roleTemplate, applicationsForRoleTemplate, isSensitiveScreen,
  type AccessScope,
} from "@/platform/accessModel";

/** A proposal, not an enforceable grant. Never use in API authorization. */
export type PermissionChoice = "inherit" | "allow" | "deny";
export const MATRIX_ACTIONS = ["view", "create", "edit", "approve", "export", "share", "delete", "manage"] as const;
export type MatrixAction = (typeof MATRIX_ACTIONS)[number];
export type ActionChoices = Partial<Record<MatrixAction, PermissionChoice>>;
export interface RolePermissionDraft {
  roleId: string;
  appRules: Record<string, ActionChoices>;
  pageRules: Record<string, ActionChoices>;
  scopes: Record<string, AccessScope>;
}
export interface MatrixDecision {
  allowed: boolean;
  source: string;
  restricted: boolean;
  explicitlyDenied: boolean;
}

const appCodes = new Set(applications.map(app => app.code));
const screenById = new Map(screens.map(screen => [screen.id, screen]));
const choices = new Set<PermissionChoice>(["inherit", "allow", "deny"]);
const scopes = new Set<AccessScope>(["none","own","assigned","team","department","business_unit","organization","explicit"]);
const actions = new Set<MatrixAction>(MATRIX_ACTIONS);

export function emptyRolePermissionDraft(roleId: string): RolePermissionDraft {
  return { roleId, appRules: {}, pageRules: {}, scopes: {} };
}

function cleanRules(input: unknown, validKeys: Set<string>): Record<string, ActionChoices> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, ActionChoices> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!validKeys.has(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const row: ActionChoices = {};
    for (const [action, choice] of Object.entries(value)) {
      if (actions.has(action as MatrixAction) && choices.has(choice as PermissionChoice) && choice !== "inherit") {
        row[action as MatrixAction] = choice as PermissionChoice;
      }
    }
    if (Object.keys(row).length) result[key] = row;
  }
  return result;
}

/** Parse only the supported app/page/action schema, ignoring stale or unexpected keys. */
export function parseRolePermissionDraft(input: unknown, roleId: string): RolePermissionDraft {
  const raw = typeof input === "string" ? (() => {
    try { return JSON.parse(input) as unknown; } catch { return null; }
  })() : input;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyRolePermissionDraft(roleId);
  const value = raw as Record<string, unknown>;
  if (value.roleId !== roleId || !roleTemplate(roleId)) return emptyRolePermissionDraft(roleId);
  const inputScopes = value.scopes && typeof value.scopes === "object" && !Array.isArray(value.scopes)
    ? value.scopes as Record<string, unknown> : {};
  const acceptedScopes: Record<string, AccessScope> = {};
  for (const [code, scope] of Object.entries(inputScopes)) {
    if (appCodes.has(code) && scopes.has(scope as AccessScope)) acceptedScopes[code] = scope as AccessScope;
  }
  return {
    roleId,
    appRules: cleanRules(value.appRules, appCodes),
    pageRules: cleanRules(value.pageRules, new Set(screenById.keys())),
    scopes: acceptedScopes,
  };
}

export function updateRolePermission(
  draft: RolePermissionDraft,
  level: "application" | "page",
  key: string,
  action: MatrixAction,
  choice: PermissionChoice,
): RolePermissionDraft {
  if (!actions.has(action) || !choices.has(choice)) return draft;
  if (level === "application" && !appCodes.has(key)) return draft;
  if (level === "page" && !screenById.has(key)) return draft;
  const field = level === "application" ? "appRules" : "pageRules";
  const updated = { ...(draft[field][key] ?? {}) };
  if (choice === "inherit") delete updated[action]; else updated[action] = choice;
  // A view deny always dominates any deeper action allow.
  if (action === "view" && choice === "deny") {
    for (const extra of MATRIX_ACTIONS) if (extra !== "view" && updated[extra] === "allow") delete updated[extra];
  }
  const rules = { ...draft[field] };
  if (Object.keys(updated).length) rules[key] = updated; else delete rules[key];
  return { ...draft, [field]: rules };
}

export function updateRoleScope(draft: RolePermissionDraft, appCode: string, scope: AccessScope): RolePermissionDraft {
  if (!appCodes.has(appCode) || !scopes.has(scope)) return draft;
  return { ...draft, scopes: { ...draft.scopes, [appCode]: scope } };
}

/**
 * Calculates a proposed view/edit display. Sensitivity is informational:
 * classified resources still require independent server-side grants.
 * Denials at application level always override page-level allows.
 */
export function plannedPermission(
  roleId: string, appCode: string, pageId: string | undefined,
  action: MatrixAction, draft: RolePermissionDraft,
): MatrixDecision {
  const role = roleTemplate(roleId);
  const screen = pageId ? screenById.get(pageId) : undefined;
  const restricted = Boolean(screen && isSensitiveScreen(appCode, screen.title));
  if (!role || !appCodes.has(appCode) || (pageId && screen?.applicationCode !== appCode)) {
    return { allowed: false, source: "Not registered", restricted, explicitlyDenied: false };
  }
  const inherited = applicationsForRoleTemplate(roleId).includes(appCode) && role.permissions.includes(action);
  const app = draft.appRules[appCode] ?? {};
  const page = pageId ? draft.pageRules[pageId] ?? {} : {};
  if (app.view === "deny" || page.view === "deny" || app[action] === "deny" || page[action] === "deny") {
    return { allowed:false, source:"Explicit draft deny", restricted, explicitlyDenied:true };
  }
  if (action !== "view") {
    const view = plannedPermission(roleId, appCode, pageId, "view", draft);
    if (!view.allowed) return { allowed:false, source:"View access required", restricted, explicitlyDenied:view.explicitlyDenied };
  }
  // A role cannot use a page if the parent app is not viewable, even if a page requests it.
  if (pageId && !plannedPermission(roleId, appCode, undefined, "view", draft).allowed) {
    return { allowed:false, source:"Application view required", restricted, explicitlyDenied:false };
  }
  if (page[action] === "allow") return { allowed:true,source:"Page draft allow",restricted,explicitlyDenied:false };
  if (app[action] === "allow") return { allowed:true,source:"Application draft allow",restricted,explicitlyDenied:false };
  return { allowed:inherited,source:inherited?"Role template":"Not granted by template",restricted,explicitlyDenied:false };
}

export function countDraftChanges(draft: RolePermissionDraft): number {
  return Object.values(draft.appRules).reduce((total,row)=>total+Object.keys(row).length,0)
    + Object.values(draft.pageRules).reduce((total,row)=>total+Object.keys(row).length,0)
    + Object.keys(draft.scopes).length;
}
export function activeTemplateCount(): number { return ROLE_TEMPLATES.length; }
