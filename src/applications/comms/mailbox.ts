import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * COMMS mailbox logic — pure functions behind the email screens.
 *
 * No mail provider is connected, so nothing here sends anything. A draft is a
 * record in this browser; these helpers decide what it says, whether it is
 * addressable, and which threads a search finds.
 * ====================================================================== */

export const MAIL_FOLDERS = ["Inbox", "Sent", "Drafts", "Archive", "Spam"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

interface StoredMessage { from?: string; body?: string }

export function folderOf(thread: Rec): string {
  return String(thread.fields.folder ?? "inbox").toLowerCase();
}

/** Split a To / Cc line into trimmed, de-duplicated addresses. */
export function parseRecipients(line: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of line.split(/[,;\n]/)) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const ADDRESS = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;

export function isAddress(value: string): boolean {
  return ADDRESS.test(value.trim());
}

export interface DraftInput { to: string; cc?: string; subject: string; body: string }

export interface DraftCheck {
  /** Addresses that cannot be an email address. */
  invalid: string[];
  /** Problems that stop the draft being saved at all. */
  blocking: string[];
  /** Things worth saying before it is sent, which do not stop a save. */
  warnings: string[];
  recipients: number;
}

/**
 * Whether a draft can be kept, and what a person should know about it. A draft
 * with no recipients can still be saved (people draft before they know who),
 * but a malformed address cannot, so it is never stored as if it were valid.
 */
export function checkDraft(input: DraftInput): DraftCheck {
  const to = parseRecipients(input.to);
  const cc = parseRecipients(input.cc ?? "");
  const invalid = [...to, ...cc].filter((value) => !isAddress(value));
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (invalid.length) blocking.push(`${invalid.length === 1 ? "One address is" : `${invalid.length} addresses are`} not valid: ${invalid.join(", ")}`);
  if (!input.subject.trim() && !input.body.trim() && to.length === 0) blocking.push("The draft is empty.");
  if (to.length === 0) warnings.push("No recipient yet.");
  if (!input.subject.trim()) warnings.push("No subject.");
  if (!input.body.trim()) warnings.push("The message is empty.");
  if (to.length + cc.length > 4) warnings.push(`${to.length + cc.length} recipients is a bulk send; check the list before it goes anywhere.`);
  return { invalid, blocking, warnings, recipients: to.length + cc.length };
}

function threadText(thread: Rec): string {
  const messages = (thread.body as { messages?: StoredMessage[] } | undefined)?.messages ?? [];
  return [
    thread.title, thread.summary, thread.fields.from, thread.fields.to, thread.fields.cc, thread.fields.labels,
    ...messages.map((message) => `${message.from ?? ""} ${message.body ?? ""}`),
  ].map((value) => String(value ?? "")).join(" ").toLowerCase();
}

/**
 * Threads matching every word of the query, newest first. Without a query the
 * folder's threads; with one, matches from every folder (a person searching
 * mail rarely knows which folder a message is in).
 */
export function searchThreads(threads: Rec[], query: string, folder?: string): Rec[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = words.length === 0 && folder ? threads.filter((thread) => folderOf(thread) === folder.toLowerCase()) : threads;
  return pool
    .filter((thread) => {
      if (words.length === 0) return true;
      const text = threadText(thread);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt));
}

export function folderCounts(threads: Rec[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of MAIL_FOLDERS) counts[name.toLowerCase()] = 0;
  for (const thread of threads) counts[folderOf(thread)] = (counts[folderOf(thread)] ?? 0) + 1;
  return counts;
}

/** The address this workspace writes from for an actor, matching the seeded threads. */
export function senderAddress(actor: string, orgSlug: string): string {
  return `${actor.split(" ")[0].toLowerCase()}@${orgSlug}.example`;
}

/** The record fields of a draft, so create and update write the same shape. */
export function draftRecord(input: DraftInput, from: string, at: string, previous?: Rec) {
  const to = parseRecipients(input.to);
  const cc = parseRecipients(input.cc ?? "");
  return {
    title: input.subject.trim() || "(no subject)",
    summary: input.body.trim().slice(0, 160),
    status: "draft",
    at,
    fields: {
      ...(previous?.fields ?? {}),
      folder: "drafts", from, to: to.join(", "), cc: cc.join(", "), unread: false,
      risk: String(previous?.fields.risk ?? "none"), labels: String(previous?.fields.labels ?? "draft"),
      delivery: "not_connected", messageCount: 1, savedLocallyAt: at,
    },
    body: { messages: [{ from, at, body: input.body, external: false }] },
  };
}

/** Read a stored draft back into the editor's fields. */
export function draftInput(thread: Rec): DraftInput {
  const messages = (thread.body as { messages?: StoredMessage[] } | undefined)?.messages ?? [];
  return {
    to: String(thread.fields.to ?? ""),
    cc: String(thread.fields.cc ?? ""),
    subject: thread.title === "(no subject)" ? "" : thread.title,
    body: String(messages.at(-1)?.body ?? thread.summary ?? ""),
  };
}
