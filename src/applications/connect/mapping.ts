import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Data mapping: which provider field lands in which Arlovi field, stored
 * on the connector record (body.mapping). The source schema is the shape
 * the provider's contract documents; the sample row is labelled as a
 * sample everywhere it is shown, because no provider data has been read.
 * ====================================================================== */

export interface SourceField { name: string; type: "string" | "number" | "date" | "money" | "id"; sample: string }

export const SOURCE_SCHEMAS: Record<string, { collection: string; fields: SourceField[] }> = {
  "bank.feed": { collection: "bankTransactions", fields: [
    { name: "transaction_id", type: "id", sample: "tx_8F2K91" },
    { name: "booked_at", type: "date", sample: "2026-11-12T10:14:00Z" },
    { name: "amount", type: "money", sample: "-148.20" },
    { name: "currency", type: "string", sample: "GBP" },
    { name: "description", type: "string", sample: "CARD PAYMENT BRASSWORKS LTD" },
    { name: "counterparty_name", type: "string", sample: "Brassworks Ltd" },
    { name: "status", type: "string", sample: "BOOKED" },
  ] },
  "email.send": { collection: "emailThreads", fields: [
    { name: "message_id", type: "id", sample: "<a81c@mail.example>" },
    { name: "subject", type: "string", sample: "Your showroom visit" },
    { name: "from_address", type: "string", sample: "Customer@Example.com" },
    { name: "sent_at", type: "date", sample: "2026-11-12T09:02:00Z" },
    { name: "delivery_state", type: "string", sample: "accepted" },
  ] },
  "payment.capture": { collection: "receipts", fields: [
    { name: "charge_id", type: "id", sample: "ch_3Q81" },
    { name: "amount_minor", type: "number", sample: "12900" },
    { name: "currency", type: "string", sample: "gbp" },
    { name: "created", type: "date", sample: "2026-11-12T11:30:00Z" },
    { name: "customer_email", type: "string", sample: "buyer@example.com" },
    { name: "outcome", type: "string", sample: "succeeded" },
  ] },
  "calendar.sync": { collection: "bookings", fields: [
    { name: "event_id", type: "id", sample: "evt_77a" },
    { name: "summary", type: "string", sample: "Showroom consultation" },
    { name: "start", type: "date", sample: "2026-11-20T14:00:00Z" },
    { name: "end", type: "date", sample: "2026-11-20T15:00:00Z" },
    { name: "organizer", type: "string", sample: "Ada Fernsby" },
  ] },
};

const GENERIC: { collection: string; fields: SourceField[] } = { collection: "records", fields: [
  { name: "id", type: "id", sample: "ext_001" },
  { name: "name", type: "string", sample: "Example name" },
  { name: "created_at", type: "date", sample: "2026-11-12T08:00:00Z" },
  { name: "status", type: "string", sample: "active" },
  { name: "notes", type: "string", sample: "Free text" },
] };

export function schemaFor(capabilityId: string): { collection: string; fields: SourceField[] } {
  return SOURCE_SCHEMAS[capabilityId] ?? GENERIC;
}

/** Arlovi fields a source field can land in. "fields.*" is a custom field on the record. */
export const TARGET_FIELDS = [
  { id: "externalId", label: "External id (match key)" },
  { id: "title", label: "Title" },
  { id: "summary", label: "Summary" },
  { id: "status", label: "Status" },
  { id: "at", label: "Date" },
  { id: "amountMinor", label: "Amount (minor units)" },
  { id: "currency", label: "Currency" },
  { id: "ownerName", label: "Owner" },
  { id: "fields.counterparty", label: "Custom: counterparty" },
  { id: "fields.email", label: "Custom: email" },
  { id: "fields.note", label: "Custom: note" },
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number]["id"] | "";

export const TRANSFORMS = ["none", "lowercase", "uppercase", "trim", "to_minor_units", "iso_date"] as const;
export type Transform = (typeof TRANSFORMS)[number];
export const TRANSFORM_LABELS: Record<Transform, string> = {
  none: "As is", lowercase: "Lower case", uppercase: "Upper case", trim: "Trim spaces", to_minor_units: "Decimal to minor units", iso_date: "Normalise date",
};

export interface MappingRow { source: string; target: TargetField; transform: Transform }

export interface Mapping {
  collection: string;
  rows: MappingRow[];
  savedAt: string;
  savedBy: string;
  /** Set when a simulated run was made against the sample row after the last save. */
  simulatedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function defaultMapping(capabilityId: string): Mapping {
  const schema = schemaFor(capabilityId);
  return { collection: schema.collection, rows: schema.fields.map((field) => ({ source: field.name, target: "", transform: "none" })), savedAt: "", savedBy: "", simulatedAt: "" };
}

export function readMapping(record: Rec | undefined, capabilityId: string): Mapping {
  const raw = asRecord(asRecord(record?.body).mapping);
  const base = defaultMapping(capabilityId);
  if (!raw.rows) return base;
  const stored = (Array.isArray(raw.rows) ? raw.rows : []).map((item) => {
    const row = asRecord(item);
    const target = str(row.target);
    const transform = str(row.transform);
    return {
      source: str(row.source),
      target: (TARGET_FIELDS.some((field) => field.id === target) ? target : "") as TargetField,
      transform: ((TRANSFORMS as readonly string[]).includes(transform) ? transform : "none") as Transform,
    };
  });
  // Keep every source field of the schema, in schema order, even if the stored mapping predates it.
  const rows = base.rows.map((row) => stored.find((item) => item.source === row.source) ?? row);
  return { collection: str(raw.collection) || base.collection, rows, savedAt: str(raw.savedAt), savedBy: str(raw.savedBy), simulatedAt: str(raw.simulatedAt) };
}

export interface MappingIssue { level: "fail" | "warn"; message: string }

export function mappingIssues(mapping: Mapping, capabilityId: string): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const schema = schemaFor(capabilityId);
  const used = mapping.rows.filter((row) => row.target);
  if (!mapping.collection.trim()) issues.push({ level: "fail", message: "Choose the collection records land in." });
  if (!used.some((row) => row.target === "externalId")) issues.push({ level: "fail", message: "Map one source field to External id, so a repeat delivery updates rather than duplicates." });
  if (!used.some((row) => row.target === "title")) issues.push({ level: "fail", message: "Map a source field to Title, so each record can be recognised." });
  const seen = new Map<string, string>();
  for (const row of used) {
    if (seen.has(row.target)) issues.push({ level: "fail", message: `${row.source} and ${seen.get(row.target)} both land in ${row.target}.` });
    else seen.set(row.target, row.source);
    const field = schema.fields.find((item) => item.name === row.source);
    if (row.transform === "to_minor_units" && field && field.type !== "money" && field.type !== "number") issues.push({ level: "warn", message: `${row.source} is not a number; converting it to minor units will fail.` });
    if (row.target === "amountMinor" && field?.type === "money" && row.transform !== "to_minor_units") issues.push({ level: "warn", message: `${row.source} is a decimal amount; use "Decimal to minor units" so pence are not lost.` });
    if (row.target === "at" && field && field.type !== "date") issues.push({ level: "warn", message: `${row.source} is not a date, but lands in Date.` });
  }
  const unmapped = mapping.rows.filter((row) => !row.target).length;
  if (unmapped) issues.push({ level: "warn", message: `${unmapped} source field${unmapped === 1 ? " is" : "s are"} not mapped and would be dropped.` });
  return issues;
}

export function applyTransform(value: string, transform: Transform): string {
  switch (transform) {
    case "lowercase": return value.toLowerCase();
    case "uppercase": return value.toUpperCase();
    case "trim": return value.trim();
    case "to_minor_units": {
      const number = Number(value);
      return Number.isFinite(number) ? String(Math.round(number * 100)) : "invalid number";
    }
    case "iso_date": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "invalid date" : date.toISOString();
    }
    default: return value;
  }
}

/** The record a sample row would become. */
export function previewMapping(mapping: Mapping, capabilityId: string): { target: string; source: string; value: string }[] {
  const schema = schemaFor(capabilityId);
  return mapping.rows.filter((row) => row.target).map((row) => {
    const sample = schema.fields.find((field) => field.name === row.source)?.sample ?? "";
    return { target: row.target, source: row.source, value: applyTransform(sample, row.transform) };
  });
}

/* ------------------------------ Connection state ------------------------------ */

export type ConnectionState = "connected" | "disconnected" | "simulated" | "configured" | "pending";

export const STATE_LABELS: Record<ConnectionState, string> = {
  connected: "Connected", disconnected: "Disconnected", simulated: "Simulated", configured: "Configured", pending: "Pending setup",
};

export const STATE_TONE: Record<ConnectionState, "success" | "neutral" | "info" | "warning"> = {
  connected: "success", disconnected: "neutral", simulated: "info", configured: "info", pending: "warning",
};

export const STATE_MEANING: Record<ConnectionState, string> = {
  connected: "A provider grant exists and a real read has succeeded.",
  disconnected: "Turned off in this workspace. Nothing is attempted.",
  simulated: "The mapping has been run against the documented sample row. No provider data was read.",
  configured: "A valid mapping is saved. It waits for a provider grant that cannot be obtained here.",
  pending: "Setup is incomplete: the mapping is missing or has a blocking problem.",
};

export function connectionState(record: Rec, capabilityState: string, capabilityId: string): ConnectionState {
  if (["disabled", "suspended", "revoked"].includes(record.status)) return "disconnected";
  if (capabilityState === "verified_external") return "connected";
  const mapping = readMapping(record, capabilityId);
  if (!mapping.savedAt || mappingIssues(mapping, capabilityId).some((issue) => issue.level === "fail")) return "pending";
  if (mapping.simulatedAt && mapping.simulatedAt >= mapping.savedAt) return "simulated";
  return "configured";
}
