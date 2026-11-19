/**
 * Arlovi Search 2.2 — browser-local native record providers.
 *
 * These adapters deliberately use the already-loaded, organisation-scoped Rec
 * data. They do not call external services, send document text to AI, or grant
 * backend access. Screen checks preserve the same client-side visibility as
 * the destination; authenticated server-side authorisation is still required
 * before remotely sourced data can participate in global search.
 */
import type { Rec, Role } from "@/domain/types";
import { findScreen } from "@/app/catalog";
import { canOpenLegacyScreen } from "@/platform/accessInventory";
import { routeForRecord } from "@/platform/attention";
import type { SearchHit } from "@/platform/searchModel";

const MAX_BODY_CHARS = 20000;
const MAX_FIELDS_CHARS = 1800;
const REMOVED_STATES = new Set(["deleted", "trashed"]);
const SEARCHABLE_FIELDS: Record<string, readonly string[]> = {
  invoices: ["number", "contactId", "revenueCode"],
  bills: ["number", "invoiceNumber", "supplierId", "vendorId"],
  expenses: ["category", "merchant", "supplierId", "vendorId"],
  journals: ["date", "entityId", "source"],
  deals: ["stage", "contactId", "companyId"],
  contacts: ["email", "phone", "role", "companyId"],
  companies: ["industry", "city", "customerSince"],
  quotes: ["number", "contactId", "dealId"],
  projects: ["phase", "lead", "department", "clientId"],
  tasks: ["assignee", "priority", "projectId", "stage"],
  employees: ["department", "team", "jobTitle", "position", "employeeNumber"],
  candidates: ["stage", "position", "department"],
  documents: ["folder", "kind"],
  workbooks: ["folder", "kind"],
  decks: ["folder", "kind"],
  designs: ["folder", "kind"],
  emailThreads: ["from", "to", "labels", "folder"],
};

const LABELS: Record<string, string> = {
  number: "Reference", invoiceNumber: "Invoice number", contactId: "Contact",
  supplierId: "Supplier", vendorId: "Supplier", email: "Email",
  phone: "Phone", role: "Role", companyId: "Company", industry: "Industry",
  city: "City", stage: "Stage", department: "Department", team: "Team",
  jobTitle: "Job title", position: "Position", assignee: "Assignee",
  priority: "Priority", projectId: "Project", folder: "Folder",
  kind: "Type", from: "From", to: "To", labels: "Labels",
  closeDate: "Close date", date: "Date", owner: "Owner",
  customerSince: "Customer since", employeeNumber: "Employee number",
  phase: "Phase", merchant: "Merchant", category: "Category",
  revenueCode: "Revenue code", lead: "Lead", clientId: "Client",
  source: "Source", entityId: "Entity", status: "Status",
};

const FINANCE = new Set(["invoices", "bills", "expenses", "journals", "quotes"]);
const DOCS = new Set(["documents", "workbooks", "decks", "designs"]);
const PEOPLE = new Set(["employees", "candidates", "contacts"]);
const PIPELINE = new Set(["companies", "deals", "projects", "tasks"]);

export interface LocalProviderContext {
  organizationId: string;
  organizationSlug: string;
  actor: string;
  role: Role;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Only visible editor blocks participate in full-text search. Deleted
 * suggestions, review comments, tracked revisions, references, hidden
 * document metadata, and collaboration notes are intentionally excluded.
 *
 * This mirrors the editor's visible-text rule without eagerly importing its
 * full module into the global header.
 */
export function visibleDocumentSearchText(body: unknown): string {
  const source = asObject(body);
  if (!Array.isArray(source?.blocks)) return "";
  const chunks: string[] = [];
  let length = 0;
  for (const blockValue of source.blocks) {
    const block = asObject(blockValue);
    if (!block || block.type === "pageBreak") continue;
    let text = "";
    if (block.type === "table") {
      const table = asObject(block.table);
      if (Array.isArray(table?.rows)) {
        text = table.rows.flatMap(row =>
          Array.isArray(row) ? row.filter(cell => typeof cell === "string") : [],
        ).join(" ");
      }
    } else if (block.type === "image") {
      const image = asObject(block.image);
      text = typeof image?.caption === "string" ? image.caption : "";
    } else if (Array.isArray(block.runs)) {
      text = block.runs.flatMap(runValue => {
        const run = asObject(runValue);
        const suggestion = asObject(run?.suggestion);
        return typeof run?.text === "string" && suggestion?.kind !== "delete"
          ? [run.text] : [];
      }).join("");
    }
    const part = compactText(text);
    if (!part) continue;
    chunks.push(part.slice(0, MAX_BODY_CHARS - length));
    length += part.length + 1;
    if (length >= MAX_BODY_CHARS) break;
  }
  return chunks.join(" ").slice(0, MAX_BODY_CHARS);
}

/** Local mail search only; no connected/provider-hosted mailbox is fetched. */
export function visibleLocalMailText(body: unknown): string {
  const source = asObject(body);
  if (!Array.isArray(source?.messages)) return "";
  return source.messages
    .map(value => asObject(value))
    .filter((value): value is Record<string, unknown> => value !== null)
    .map(value => typeof value.body === "string" ? value.body : "")
    .join(" ").slice(0, MAX_BODY_CHARS);
}

function visibleFieldEntries(row: Rec): { label: string; value: string }[] {
  return (SEARCHABLE_FIELDS[row.collection] ?? [])
    .map(field => {
      const value = row.fields[field];
      if (typeof value !== "string" && typeof value !== "number") return null;
      const text = String(value).trim();
      if (!text) return null;
      return { label: LABELS[field] ?? field, value: text.slice(0, 120) };
    })
    .filter((field): field is { label: string; value: string } => field !== null);
}

function formattedMoney(row: Rec): string | undefined {
  if (typeof row.amountMinor !== "number" || !Number.isFinite(row.amountMinor)) return undefined;
  try {
    return new Intl.NumberFormat(row.currency === "USD" ? "en-US" : "en-GB", {
      style: "currency", currency: row.currency, maximumFractionDigits: 2,
    }).format(row.amountMinor / 100);
  } catch {
    return undefined;
  }
}

function rowPreviewFields(row: Rec, confidential: boolean): { label: string; value: string }[] {
  const fields = visibleFieldEntries(row);
  const amount = FINANCE.has(row.collection) ? formattedMoney(row) : undefined;
  if (amount) fields.unshift({ label: "Amount", value: amount });
  if (row.dueAt && ["invoices", "bills", "tasks", "quotes"].includes(row.collection)) {
    const date = new Date(row.dueAt);
    if (!Number.isNaN(date.getTime())) {
      fields.push({ label: "Due date", value: date.toLocaleDateString("en-GB") });
    }
  }
  if (confidential) return fields.filter(field => ["Folder", "Type"].includes(field.label));
  return fields.slice(0, 6);
}

function groupFor(collection: string): string {
  if (FINANCE.has(collection)) return "Finance records";
  if (DOCS.has(collection)) return "Files and documents";
  if (PEOPLE.has(collection)) return "People and contacts";
  if (PIPELINE.has(collection)) return "Business and projects";
  if (collection === "emailThreads") return "Local mail";
  return "Records";
}

function categoryLabel(collection: string, status: string): string {
  const singular = collection === "emailThreads" ? "Mail thread"
    : collection === "documents" ? "Document"
    : collection === "invoices" ? "Invoice"
    : collection === "deals" ? "Deal"
    : collection === "tasks" ? "Task"
    : collection === "employees" ? "Employee"
    : collection.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${singular} · ${status.replace(/_/g, " ")}`;
}

export function buildLocalSearchHits(rows: readonly Rec[], context: LocalProviderContext): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (row.organizationId !== context.organizationId || REMOVED_STATES.has(row.status)) continue;
    const mail = row.collection === "emailThreads";
    const to = mail
      ? `/o/${context.organizationSlug}/comms/email/${encodeURIComponent(row.id)}`
      : routeForRecord(row, context.organizationSlug);
    if (!to) continue;
    const destination = findScreen(to.split(/[?#]/)[0])?.screen;
    if (!destination || !canOpenLegacyScreen(context.role, destination)) continue;

    const confidential = row.collection === "documents" && row.fields.confidential === true;
    const fields = rowPreviewFields(row, confidential);
    const metadataText = fields.map(field => field.value).join(" ").slice(0, MAX_FIELDS_CHARS);
    let contentText = "";
    if (row.collection === "documents" && !confidential) {
      contentText = visibleDocumentSearchText(row.body);
    } else if (mail && row.fields.risk !== "phishing") {
      contentText = visibleLocalMailText(row.body);
    }

    hits.push({
      key: `record-${row.id}`, kind: "record", group: groupFor(row.collection),
      title: row.title, detail: categoryLabel(row.collection, row.status), to,
      appCode: destination.applicationCode, collection: row.collection, recordId: row.id,
      // Confidential document matches remain title/tags-only; folder and
      // type may appear in authorised previews but are not query tokens.
      keywords: [row.id, row.collection, ...row.tags, confidential ? "" : metadataText].join(" "),
      summary: confidential ? undefined : row.summary,
      contentText: contentText || undefined,
      previewFields: fields,
      status: row.status, ownerName: row.ownerName, updatedAt: row.updatedAt,
      mine: row.ownerName === context.actor || row.fields.assignee === context.actor,
    });
  }
  return hits;
}
