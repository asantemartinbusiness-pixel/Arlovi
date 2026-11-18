import type { Rec } from "@/domain/types";
import { isAddress, parseRecipients } from "./mailbox";

export type ContactMatch = { id: string; name: string; address: string; source: string };

export function findComposeContacts(records: Rec[], query: string, limit = 6): ContactMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle || needle.length < 2) return [];
  const seen = new Set<string>();
  const matches: ContactMatch[] = [];
  for (const row of records) {
    const address = String(row.fields.email ?? "").trim();
    if (!isAddress(address) || seen.has(address.toLowerCase())) continue;
    const name = row.title.trim();
    if (![name, address, String(row.fields.company ?? "")].some((text) => text.toLowerCase().includes(needle))) continue;
    seen.add(address.toLowerCase());
    matches.push({ id: row.id, name, address, source: row.collection });
  }
  return matches.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

export function contactQuery(text: string): string {
  return text.split(/[,;\n]/).at(-1)?.trim() ?? "";
}

export function addComposeRecipient(text: string, address: string): string {
  if (!isAddress(address)) return text;
  const existing = parseRecipients(text);
  if (existing.some((value) => value.toLowerCase() === address.toLowerCase())) return existing.join(", ");
  const entries = text.split(/[,;\n]/);
  entries.pop(); // Replace the current search fragment, not an established address.
  const complete = entries.map((value) => value.trim()).filter(Boolean);
  return [...complete, address].join(", ");
}

export type ComposeReference = { id: string; title: string; collection: string };

export function documentSuggestions(records: Rec[], query: string, limit = 8): ComposeReference[] {
  const q = query.trim().toLowerCase();
  return records.filter((row) => row.status !== "archived" && row.fields.confidential !== true && row.title.toLowerCase().includes(q))
    .slice(0, limit).map((row) => ({ id: row.id, title: row.title, collection: row.collection }));
}

export function safeComposeLink(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export function insertComposeLink(body: string, url: string): string {
  const safe = safeComposeLink(url);
  return safe ? [body.trimEnd(), safe].filter(Boolean).join("\n\n") : body;
}

/** The current browser-local record schema supports only scalar fields. */
export function parseComposeReferences(value: unknown): ComposeReference[] {
  if (typeof value !== "string") return [];
  try {
    const data: unknown = JSON.parse(value);
    if (!Array.isArray(data)) return [];
    return data.filter((row): row is ComposeReference =>
      typeof row === "object" && row !== null &&
      typeof row.id === "string" && typeof row.title === "string" && typeof row.collection === "string"
    ).slice(0, 20);
  } catch { return []; }
}
