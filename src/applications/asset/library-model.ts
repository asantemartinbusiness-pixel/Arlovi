import type { Rec } from "@/domain/types";
import { daysBetween } from "@/platform/clock";

/* ====================================================================== *
 * ASSET library model — pure functions behind the library workspace.
 *
 * Kept free of React and the design system so the filtering, sorting,
 * tagging, folder and upload rules can be unit tested on their own.
 * ====================================================================== */

export type LicenceState = "owned" | "ok" | "expiring" | "expired" | "unknown";

export function licence(record: Rec, now: Date): { state: LicenceState; days?: number; label: string } {
  const kind = String(record.fields.licence ?? "");
  const expiry = String(record.fields.licenceExpiry ?? "");
  if (!expiry) {
    if (kind === "owned") return { state: "owned", label: "Owned outright" };
    if (kind === "royalty_free") return { state: "owned", label: "Royalty free" };
    return { state: kind ? "ok" : "unknown", label: kind ? `${kind.replace(/_/g, " ")}, no expiry recorded` : "No licence recorded" };
  }
  const days = daysBetween(now, new Date(expiry));
  if (days < 0) return { state: "expired", days, label: `Expired ${Math.abs(days)} days ago` };
  if (days <= 30) return { state: "expiring", days, label: `Expires in ${days} days` };
  return { state: "ok", days, label: `Licensed until the expiry date` };
}

export function csvList(value: unknown): string[] {
  return typeof value === "string" && value.trim().length > 0
    ? value.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
}

/* ----------------------------- Tags ----------------------------- */

/** One tag: lower case, spaces to hyphens, nothing but letters, digits and hyphens. */
export function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Parse a comma or newline separated list into clean, unique tags, keeping order. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const tag = normaliseTag(part);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function addTags(existing: string[], added: string[]): string[] {
  return [...new Set([...existing, ...added.map(normaliseTag).filter(Boolean)])];
}

export function removeTag(existing: string[], tag: string): string[] {
  return existing.filter((entry) => entry !== tag);
}

/** Tags in use across the rows, most used first, then alphabetical. */
export function tagCounts(rows: Rec[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) for (const tag of row.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* ----------------------------- Folders ----------------------------- */

export const UNFILED = "unfiled";
export const ALL_FOLDERS = "all";

export function folderOf(record: Rec): string {
  return String(record.fields.folderId ?? "") || UNFILED;
}

export function folderCounts(rows: Rec[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = folderOf(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/* ----------------------------- Links ----------------------------- */

export function linkedIds(record: Rec): string[] {
  return csvList(record.fields.linkedIds);
}

export function withLink(record: Rec, id: string): string {
  return [...new Set([...linkedIds(record), id])].join(",");
}

export function withoutLink(record: Rec, id: string): string {
  return linkedIds(record).filter((entry) => entry !== id).join(",");
}

/** Collections an asset can be linked to; each has a record route in the shell. */
export const LINKABLE_COLLECTIONS = ["projects", "campaigns", "products", "documents", "deals", "contacts", "designs", "decks"] as const;

export const LINKABLE_LABEL: Record<string, string> = {
  projects: "Project", campaigns: "Campaign", products: "Product", documents: "Document",
  deals: "Deal", contacts: "Contact", designs: "Design file", decks: "Deck",
};

/* ----------------------------- Filtering and sorting ----------------------------- */

export type LicenceFilter = "any" | "clear" | "expiring" | "expired" | "unrecorded";
export type AssetSort = "updated" | "oldest" | "name" | "size" | "uses" | "expiry";

export interface LibraryFilter {
  query: string;
  folder: string;
  kind: string;
  licence: LicenceFilter;
  tags: string[];
}

export const EMPTY_FILTER: LibraryFilter = { query: "", folder: ALL_FOLDERS, kind: "all", licence: "any", tags: [] };

export function searchText(record: Rec): string {
  return [
    record.title, record.summary, record.tags.join(" "), record.ownerName,
    String(record.fields.kind ?? ""), String(record.fields.format ?? ""), String(record.fields.licensor ?? ""),
    String(record.fields.photographer ?? ""), String(record.fields.fileName ?? ""), String(record.fields.altText ?? ""),
    String(record.fields.usedIn ?? ""),
  ].join(" ").toLowerCase();
}

export function matchesLicence(record: Rec, filter: LicenceFilter, now: Date): boolean {
  if (filter === "any") return true;
  const state = licence(record, now).state;
  if (filter === "clear") return state === "owned" || state === "ok";
  if (filter === "unrecorded") return state === "unknown";
  return state === filter;
}

export function filterAssets(rows: Rec[], filter: LibraryFilter, now: Date): Rec[] {
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filter.folder !== ALL_FOLDERS && folderOf(row) !== filter.folder) return false;
    if (filter.kind !== "all" && String(row.fields.kind ?? "other") !== filter.kind) return false;
    if (!matchesLicence(row, filter.licence, now)) return false;
    if (filter.tags.length && !filter.tags.every((tag) => row.tags.includes(tag))) return false;
    if (terms.length) {
      const text = searchText(row);
      if (!terms.every((term) => text.includes(term))) return false;
    }
    return true;
  });
}

export function bytesOf(record: Rec): number {
  const declared = Number(record.fields.bytes ?? 0);
  if (declared > 0) return declared;
  const body = record.body as { dataUrl?: string; svg?: string } | undefined;
  return body?.dataUrl?.length ?? body?.svg?.length ?? 0;
}

export function usesOf(record: Rec): number {
  return csvList(record.fields.usedIn).length + linkedIds(record).length;
}

export function sortAssets(rows: Rec[], sort: AssetSort): Rec[] {
  const copy = [...rows];
  const expiry = (row: Rec) => String(row.fields.licenceExpiry ?? "") || "\uffff";
  copy.sort((a, b) => {
    switch (sort) {
      case "oldest": return a.updatedAt.localeCompare(b.updatedAt) || String(a.at ?? "").localeCompare(String(b.at ?? "")) || a.title.localeCompare(b.title);
      case "name": return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      case "size": return bytesOf(b) - bytesOf(a) || a.title.localeCompare(b.title);
      case "uses": return usesOf(b) - usesOf(a) || a.title.localeCompare(b.title);
      case "expiry": return (expiry(a) < expiry(b) ? -1 : expiry(a) > expiry(b) ? 1 : 0) || a.title.localeCompare(b.title);
      default: return b.updatedAt.localeCompare(a.updatedAt) || String(b.at ?? "").localeCompare(String(a.at ?? "")) || a.title.localeCompare(b.title);
    }
  });
  return copy;
}

export const SORT_LABEL: Record<AssetSort, string> = {
  updated: "Recently changed",
  oldest: "Least recently changed",
  name: "Name A–Z",
  size: "Largest stored file",
  uses: "Most used and linked",
  expiry: "Licence expiry, soonest",
};

/* ----------------------------- Uploads ----------------------------- */

/** Per-file ceiling. Files are held in this browser's IndexedDB with the record. */
export const UPLOAD_LIMIT_BYTES = 8_000_000;

export type UploadKind = "image" | "video" | "audio" | "document" | "font" | "other";

const DOCUMENT_EXT = new Set(["pdf", "doc", "docx", "txt", "md", "csv", "rtf", "xls", "xlsx", "ppt", "pptx", "key", "pages", "json"]);
const FONT_EXT = new Set(["ttf", "otf", "woff", "woff2"]);

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

export function kindForFile(mime: string, name: string): UploadKind {
  const ext = extensionOf(name);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("font/") || FONT_EXT.has(ext)) return "font";
  if (mime === "application/pdf" || mime.startsWith("text/") || DOCUMENT_EXT.has(ext)) return "document";
  return "other";
}

export function validateUpload(file: { name: string; size: number }): string | undefined {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > UPLOAD_LIMIT_BYTES) {
    return `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Keep each file under ${UPLOAD_LIMIT_BYTES / 1_000_000} MB: files are held in this browser's storage.`;
  }
  return undefined;
}

export function titleFromFileName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : name;
}

/** Hex digest as stored in `fields.checksum` for uploads. */
export function hexDigest(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Live assets that already carry this checksum: the import shows them before it duplicates a file. */
export function duplicatesOf(rows: Rec[], checksum: string): Rec[] {
  return rows.filter((row) => row.status !== "archived" && String(row.fields.checksum ?? "") === checksum);
}
