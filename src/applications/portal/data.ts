import { useCollections } from "@/platform/workspace";
import type { Rec, Role } from "@/domain/types";

/* ---------------- Record body shapes used by PORTAL ---------------- */

export interface PortalPage { id: string; name: string; modules: string[]; gate: string }
export interface SharedScope { collection: string; ids: string[] }
export interface PortalUser { id: string; name: string; email: string; role: string; lastSeenAt: string; expiresAt: string }
export interface PortalActivity { at: string; actor: string; detail: string }
export interface PortalBody {
  pages?: PortalPage[];
  shared?: SharedScope[];
  users?: PortalUser[];
  activity?: PortalActivity[];
}

export function bodyOf<T>(record: Rec | undefined, fallback: T): T {
  return (record?.body as T | undefined) ?? fallback;
}

export function usePortalData() {
  return useCollections(["portals", "documents", "messages", "invoices", "orders", "bookings", "purchaseOrders", "returns", "contacts"]);
}

export const MODULE_LABELS: Record<string, string> = {
  welcome: "Welcome and next actions",
  milestones: "Milestones",
  "next-actions": "Next actions",
  orders: "Orders",
  bookings: "Appointments",
  documents: "Shared documents",
  thread: "Message thread",
  invoices: "Invoices",
  requests: "Request form",
};

export const GATE_LABELS: Record<string, string> = {
  any_member: "Any portal member",
  billing_contact: "Billing contact only",
  admin_only: "Portal administrator only",
};

/**
 * Everything a portal shares, resolved to real records. A portal grants
 * nothing by default: a record appears only if the portal names its id.
 */
export function sharedRecords(portal: Rec | undefined, data: ReturnType<typeof usePortalData>): { collection: string; record: Rec }[] {
  const shared = bodyOf<PortalBody>(portal, {}).shared ?? [];
  const pools: Record<string, Rec[]> = {
    orders: data.orders,
    invoices: data.invoices,
    bookings: data.bookings,
    documents: data.documents,
    purchaseOrders: data.purchaseOrders,
    returns: data.returns,
  };
  const out: { collection: string; record: Rec }[] = [];
  for (const scope of shared) {
    for (const id of scope.ids) {
      const record = (pools[scope.collection] ?? []).find((item) => item.id === id && item.organizationId === portal?.organizationId);
      if (record) out.push({ collection: scope.collection, record });
    }
  }
  return out;
}

/**
 * Every record a portal shares with its members, counted once: the ids the
 * portal names, plus the documents and invoices attached to it by their own
 * portalId. Every screen that states how much a portal shares reads this.
 */
export function sharedWithPortal(portal: Rec | undefined, data: ReturnType<typeof usePortalData>): Rec[] {
  if (!portal) return [];
  const seen = new Map<string, Rec>();
  for (const item of sharedRecords(portal, data)) seen.set(item.record.id, item.record);
  for (const record of portalDocuments(portal, data.documents)) seen.set(record.id, record);
  for (const record of portalInvoices(portal, data.invoices)) seen.set(record.id, record);
  return [...seen.values()];
}

/** The external people on a portal. The member list on the portal is the only source. */
export function portalUsers(portal: Rec | undefined): PortalUser[] {
  return bodyOf<PortalBody>(portal, {}).users ?? [];
}

/**
 * The portal a route id names. The base workspace carries some portals as a
 * bare stub (no pages, members or shared records) whose full definition is a
 * separate record marked `canonicalFor` that stub's id; both ids then read and
 * write the one full record, so no screen shows the empty stub beside it.
 */
export function resolvePortal(id: string | undefined, portals: Rec[]): Rec | undefined {
  if (!id) return undefined;
  const direct = portals.find((item) => item.id === id);
  const full = portals.find((item) => String(item.fields.canonicalFor ?? "") === id
    && (!direct || item.organizationId === direct.organizationId));
  return full ?? direct;
}

/** Hide only a stub replaced by a canonical portal in the SAME organisation. */
export function listedPortals(portals: Rec[]): Rec[] {
  const replaced = new Set(portals
    .filter((item) => typeof item.fields.canonicalFor === "string" && item.fields.canonicalFor)
    .map((item) => item.organizationId + ":" + String(item.fields.canonicalFor)));
  return portals.filter((item) => !replaced.has(item.organizationId + ":" + item.id));
}

/** Canonical portal and legacy route stub identify the same scoped space. */
function portalIdentityIds(portal: Rec | undefined): Set<string> {
  if (!portal) return new Set();
  const ids = [portal.id];
  const alias = portal.fields.canonicalFor;
  if (typeof alias === "string" && alias) ids.push(alias);
  return new Set(ids);
}

/** Documents attached to this portal, including only its explicit route alias. */
export function portalDocuments(portal: Rec | undefined, documents: Rec[]): Rec[] {
  if (!portal) return [];
  const ids = portalIdentityIds(portal);
  return documents.filter((document) => document.organizationId === portal.organizationId
    && ids.has(String(document.fields.portalId ?? "")));
}

export function portalMessages(portal: Rec | undefined, messages: Rec[]): Rec[] {
  if (!portal) return [];
  const ids = portalIdentityIds(portal);
  return messages
    .filter((message) => message.organizationId === portal.organizationId
      && ids.has(String(message.fields.portalId ?? ""))
      && message.fields.internalOnly !== true)
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

export function portalInvoices(portal: Rec | undefined, invoices: Rec[]): Rec[] {
  if (!portal) return [];
  const ids = portalIdentityIds(portal);
  return invoices.filter((invoice) => invoice.organizationId === portal.organizationId
    && ids.has(String(invoice.fields.portalId ?? "")));
}

/** The portal a client role view is allowed to see, and nothing else. */
export function portalForRole(role: Role, portals: Rec[], actor: string, contacts: Rec[]): Rec | undefined {
  if (role !== "client") return undefined;
  const contact = contacts.find((item) => item.title === actor);
  if (!contact) return undefined;
  const own = listedPortals(portals).find((portal) =>
    portal.organizationId === contact.organizationId
    && String(portal.fields.contactId) === contact.id
    && portal.status === "live");
  return own ? resolvePortal(own.id, portals) : undefined;
}

export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["live", "signed", "paid", "answered"].includes(status)) return "success";
  if (["suspended", "escalated", "disputed"].includes(status)) return "danger";
  if (["needs_review", "draft", "open", "awaiting_payment"].includes(status)) return "warning";
  if (["shared"].includes(status)) return "info";
  return "neutral";
}

export function expiryState(value: unknown, now: Date): { expired: boolean; days: number; known: boolean } {
  if (typeof value !== "string" || !value) return { expired: false, days: 0, known: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { expired: false, days: 0, known: false };
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  return { expired: days < 0, days, known: true };
}
