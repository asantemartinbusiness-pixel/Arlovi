import type { Rec } from "@/domain/types";
import type { PortalPage, SharedScope } from "./data";

/* ====================================================================== *
 * PORTAL configuration model — pure functions behind the builder: page
 * navigation, role gates, branding checks, record exposure and the honest
 * sharing state. Nothing here reads storage, so every rule is unit-tested.
 * ====================================================================== */

/* ---------------- Roles and gates ---------------- */

export type PortalRole = "portal_admin" | "billing_contact" | "portal_member";

export const PORTAL_ROLES: { value: PortalRole; label: string; detail: string }[] = [
  { value: "portal_admin", label: "Portal administrator", detail: "Every page, including admin-only pages" },
  { value: "billing_contact", label: "Billing contact", detail: "Member pages plus billing pages" },
  { value: "portal_member", label: "Member", detail: "Pages open to any member only" },
];

export function roleLabel(role: string): string {
  return PORTAL_ROLES.find((item) => item.value === role)?.label ?? role.replace(/_/g, " ");
}

export function normaliseRole(role: string | undefined): PortalRole {
  return role === "portal_admin" || role === "billing_contact" ? role : "portal_member";
}

/** Whether a role passes a page gate. Unknown gates are closed, never open. */
export function canOpenPage(gate: string, role: PortalRole): boolean {
  if (gate === "any_member") return true;
  if (gate === "billing_contact") return role === "billing_contact" || role === "portal_admin";
  if (gate === "admin_only") return role === "portal_admin";
  return false;
}

export function pagesForRole(pages: PortalPage[], role: PortalRole): { visible: PortalPage[]; hidden: PortalPage[] } {
  const visible: PortalPage[] = [];
  const hidden: PortalPage[] = [];
  for (const page of pages) (canOpenPage(page.gate, role) ? visible : hidden).push(page);
  return { visible, hidden };
}

/* ---------------- Navigation sections ---------------- */

export function validatePageName(pages: PortalPage[], name: string, ignoreId?: string): string | undefined {
  const clean = name.trim();
  if (!clean) return "Give the page a name";
  if (clean.length > 32) return "Keep page names to 32 characters so they fit the navigation";
  if (pages.some((page) => page.id !== ignoreId && page.name.trim().toLowerCase() === clean.toLowerCase())) return "Another page already has that name";
  return undefined;
}

export function addPage(pages: PortalPage[], name: string, modules: string[] = [], gate = "any_member"): PortalPage[] {
  const used = new Set(pages.map((page) => page.id));
  let n = pages.length + 1;
  while (used.has(`pg-${n}`)) n += 1;
  return [...pages, { id: `pg-${n}`, name: name.trim(), modules, gate }];
}

export function movePage(pages: PortalPage[], index: number, delta: number): PortalPage[] {
  const target = index + delta;
  if (index < 0 || index >= pages.length || target < 0 || target >= pages.length) return pages;
  const next = [...pages];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updatePage(pages: PortalPage[], id: string, patch: Partial<Omit<PortalPage, "id">>): PortalPage[] {
  return pages.map((page) => (page.id === id ? { ...page, ...patch, name: (patch.name ?? page.name).trim() } : page));
}

export function removePage(pages: PortalPage[], id: string): PortalPage[] {
  return pages.filter((page) => page.id !== id);
}

/* ---------------- Branding ---------------- */

export function isHexColour(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG contrast ratio of white text on the accent, rounded to one decimal. */
export function contrastWithWhite(hex: string): number {
  if (!isHexColour(hex)) return 0;
  const n = Number.parseInt(hex.trim().slice(1), 16);
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return Math.round((1.05 / (lum + 0.05)) * 10) / 10;
}

export function brandingProblems(input: { displayName: string; accent: string; welcome: string; domain: string }): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!input.displayName.trim()) problems.displayName = "The portal needs a name clients will recognise";
  if (!isHexColour(input.accent)) problems.accent = "Use a six-digit hex colour such as #234fe8";
  if (input.welcome.length > 280) problems.welcome = "Keep the welcome to 280 characters";
  if (input.domain.trim() && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(input.domain.trim())) problems.domain = "Enter a host name such as portal.example.com, without https://";
  return problems;
}

/** A low-contrast accent is allowed but called out: white text on it fails WCAG AA. */
export function accentWarning(accent: string): string | undefined {
  if (!isHexColour(accent)) return undefined;
  const ratio = contrastWithWhite(accent);
  return ratio < 4.5 ? `White text on this accent has a contrast of ${ratio}:1, below the 4.5:1 that small text needs. The portal will use dark text on it instead.` : undefined;
}

/** Text colour for the brand mark: white where it passes, near-black otherwise. */
export function markTextColour(accent: string): string {
  return !isHexColour(accent) || contrastWithWhite(accent) >= 4.5 ? "#fff" : "#111";
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/* ---------------- Request types ---------------- */

export const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: "service", label: "Service or visit" },
  { value: "document", label: "A document or file" },
  { value: "change", label: "A change to the work" },
  { value: "access", label: "Access for a colleague" },
];

/** The request types a portal accepts (stored comma-separated). A portal that never chose keeps all of them. */
export function acceptedRequestTypes(portal: Rec | undefined): string[] {
  const value = portal?.fields.requestTypes;
  if (typeof value !== "string") return REQUEST_TYPES.map((item) => item.value);
  return value.split(",").map((item) => item.trim()).filter((item) => REQUEST_TYPES.some((type) => type.value === item));
}

/* ---------------- Record exposure ---------------- */

export type ExposureSource = "granted" | "attached" | "available" | "other_account";

export interface ExposureRow {
  collection: string;
  record: Rec;
  exposed: boolean;
  source: ExposureSource;
}

/**
 * Every record that could be shown on a portal, with whether it is. A record
 * linked to another contact is listed as refused, never as available, so the
 * exposure list cannot be used to leak another account's work.
 */
export function exposureRows(portal: Rec, pools: Record<string, Rec[]>, aliasIds: string[] = []): ExposureRow[] {
  const shared = ((portal.body as { shared?: SharedScope[] } | undefined)?.shared) ?? [];
  const contactId = String(portal.fields.contactId ?? "");
  const ids = new Set([portal.id, ...aliasIds]);
  const rows: ExposureRow[] = [];
  for (const [collection, records] of Object.entries(pools)) {
    const granted = new Set(shared.find((scope) => scope.collection === collection)?.ids ?? []);
    for (const record of records) {
      if (record.organizationId !== portal.organizationId) continue;
      const attached = ids.has(String(record.fields.portalId ?? ""));
      const owner = String(record.fields.contactId ?? "");
      if (granted.has(record.id)) rows.push({ collection, record, exposed: true, source: "granted" });
      else if (attached) rows.push({ collection, record, exposed: true, source: "attached" });
      else if (contactId && owner && owner !== contactId) rows.push({ collection, record, exposed: false, source: "other_account" });
      else if (contactId && owner === contactId) rows.push({ collection, record, exposed: false, source: "available" });
    }
  }
  return rows;
}

export function setExposure(shared: SharedScope[], collection: string, id: string, on: boolean): SharedScope[] {
  const next = shared.map((scope) => ({ ...scope, ids: [...scope.ids] }));
  const scope = next.find((item) => item.collection === collection);
  if (on) {
    if (scope) { if (!scope.ids.includes(id)) scope.ids.push(id); }
    else next.push({ collection, ids: [id] });
  } else if (scope) {
    scope.ids = scope.ids.filter((item) => item !== id);
  }
  return next.filter((item) => item.ids.length > 0);
}

/* ---------------- Sharing state ---------------- */

export interface SharingState {
  state: "draft" | "suspended" | "marked_live" | "never_hosted";
  label: string;
  tone: "neutral" | "warning" | "danger" | "info";
  /** Always false here: there is no hosting backend, so no link resolves outside this browser. */
  linkLive: false;
  detail: string;
  plannedAddress: string;
}

export function sharingState(portal: Rec, orgSlug: string): SharingState {
  const domain = String(portal.fields.customDomain ?? "").trim();
  const plannedAddress = domain ? `https://${domain}` : `https://${orgSlug}.example/portal/${portal.id}`;
  if (portal.status === "suspended") {
    return { state: "suspended", label: "Suspended", tone: "danger", linkLive: false, plannedAddress,
      detail: "Marked suspended. Even once hosting exists, a suspended portal must not resolve for anyone outside the company." };
  }
  if (portal.status === "live") {
    return { state: "marked_live", label: "Marked live · link not live", tone: "warning", linkLive: false, plannedAddress,
      detail: "The portal is marked live in this workspace, but no hosting service is connected, so the address below does not open for a client yet. Share records here; send the link only once hosting is set up." };
  }
  if (portal.status === "draft") {
    return { state: "draft", label: "Draft · not shared", tone: "neutral", linkLive: false, plannedAddress,
      detail: "A draft is visible only inside the workspace. Run the access test and the publish review before marking it live." };
  }
  return { state: "never_hosted", label: "Not hosted", tone: "info", linkLive: false, plannedAddress,
    detail: "No hosting service is connected, so no link reaches this portal from outside." };
}
