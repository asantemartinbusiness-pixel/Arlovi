import type { Audit, Rec, Role } from "./types";
import { byId, inOrg, replaceRec, touch } from "./types";

export function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

export function findBookingConflict(
  records: Rec[],
  orgId: string,
  resourceId: string,
  start: string,
  end: string,
  ignoreId?: string,
): Rec | undefined {
  return inOrg(records, orgId, "bookings").find((booking) => {
    if (booking.id === ignoreId || booking.status === "cancelled") return false;
    if (String(booking.fields.resourceId) !== resourceId) return false;
    if (!booking.startAt || !booking.endAt) return false;
    return overlaps(start, end, booking.startAt, booking.endAt);
  });
}

export function holdBooking(
  records: Rec[],
  draft: Rec,
): { records: Rec[]; events: Audit[]; error?: string } {
  const resourceId = String(draft.fields.resourceId ?? "");
  if (!draft.startAt || !draft.endAt || !resourceId) {
    return { records, events: [], error: "Choose a resource and a start and end time." };
  }
  if (draft.startAt >= draft.endAt) {
    return { records, events: [], error: "The end time must be after the start time." };
  }
  const conflict = findBookingConflict(records, draft.organizationId, resourceId, draft.startAt, draft.endAt, draft.id);
  if (conflict) {
    return {
      records,
      events: [],
      error: `${conflict.title} already holds ${resourceId} in that window.`,
    };
  }
  const existing = byId(records, draft.id);
  const recordsNext = existing ? replaceRec(records, draft) : [draft, ...records];
  return {
    records: recordsNext,
    events: [
      {
        id: `${draft.id}-hold`,
        organizationId: draft.organizationId,
        at: draft.updatedAt,
        actor: draft.updatedBy,
        type: "booking.reservation.held_local",
        message: `Held ${draft.title} locally. Payment is not confirmed by a provider.`,
        entityId: draft.id,
        capability: "ready_local",
      },
    ],
  };
}

export function quantityOnHand(records: Rec[], orgId: string, productId: string): number {
  return inOrg(records, orgId, "stockMoves")
    .filter((move) => String(move.fields.productId) === productId && move.status !== "void")
    .reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
}

export function applyStockMove(
  records: Rec[],
  move: Rec,
): { records: Rec[]; events: Audit[]; error?: string } {
  const productId = String(move.fields.productId ?? "");
  const quantity = Number(move.fields.quantity ?? 0);
  if (!productId || !Number.isInteger(quantity) || quantity === 0) {
    return { records, events: [], error: "Stock movement needs a product and a non-zero integer quantity." };
  }
  const nextQty = quantityOnHand(records, move.organizationId, productId) + quantity;
  if (nextQty < 0) {
    return { records, events: [], error: "That movement would take stock below zero." };
  }
  const product = byId(records, productId);
  let next = [move, ...records];
  if (product) {
    next = replaceRec(next, touch(product, move.updatedBy, move.updatedAt, { fields: { ...product.fields, onHand: nextQty } }));
  }
  return {
    records: next,
    events: [
      {
        id: `${move.id}-evt`,
        organizationId: move.organizationId,
        at: move.updatedAt,
        actor: move.updatedBy,
        type: "commerce.stock.moved_local",
        message: `Stock for ${product?.title ?? productId} is now ${nextQty}.`,
        entityId: move.id,
        capability: "ready_local",
      },
    ],
  };
}

const FINANCE_COLLECTIONS = new Set([
  "accounts",
  "journals",
  "invoices",
  "bills",
  "expenses",
  "bankTransactions",
  "budgets",
  "taxCodes",
  "legalEntities",
  "payrollRuns",
]);

const SALES_COLLECTIONS = new Set([
  "contacts",
  "companies",
  "leads",
  "deals",
  "quotes",
  "activities",
  "campaigns",
  "orders",
  "products",
]);

export function authorize(role: Role, collection: string, verb: string): { ok: true } | { ok: false; reason: string } {
  if (role === "client") {
    const allowed = new Set(["portals", "portalComments", "bookings", "services", "documents", "orders", "invoices"]);
    if (!allowed.has(collection)) {
      return { ok: false, reason: "This local role can open the client portal, not internal company records." };
    }
  }
  const sensitive = ["post", "void", "reverse", "reconcile", "pay", "delete", "deactivate", "approve"];
  if (FINANCE_COLLECTIONS.has(collection) && sensitive.includes(verb) && role !== "owner" && role !== "finance") {
    return { ok: false, reason: "Local policy: ledger posting and finance approval require the Finance or Owner view." };
  }
  if (collection === "payrollRuns" && role !== "owner" && role !== "people" && role !== "finance") {
    return { ok: false, reason: "Local policy: payroll inputs are limited to People, Finance, or Owner views." };
  }
  if (collection === "policies" && ["delete", "revoke", "suspend", "cap"].includes(verb) && role !== "owner") {
    return { ok: false, reason: "Local policy: organization controls can be changed in the Owner view." };
  }
  if (role === "sales" && FINANCE_COLLECTIONS.has(collection) && sensitive.includes(verb)) {
    return { ok: false, reason: "Local policy: the Sales view cannot post the ledger." };
  }
  if (role === "member" && collection === "policies" && verb !== "inspect" && verb !== "open" && verb !== "view" && verb !== "export") {
    return { ok: false, reason: "Local policy: members can review organization settings but not change them." };
  }
  if (!SALES_COLLECTIONS.has(collection) && role === "sales" && collection === "payrollRuns") {
    return { ok: false, reason: "Local policy: the Sales view cannot run payroll." };
  }
  return { ok: true };
}

export function canOpenApp(role: Role, appCode: string): boolean {
  if (role === "client") return appCode === "PORTAL" || appCode === "BOOK";
  return true;
}
