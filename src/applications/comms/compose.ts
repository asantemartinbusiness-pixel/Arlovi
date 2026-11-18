import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Composition helpers for channel conversations: the @mention being
 * typed, completing it to a full name, the names a message mentions,
 * and searching a conversation. Pure, so they are unit tested.
 * ------------------------------------------------------------------ */

/** The partial name after the last "@" at the caret, or null when not mentioning. */
export function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([A-Za-z]*(?: [A-Za-z]*)?)$/.exec(draft);
  if (!match) return null;
  return match[1];
}

export function mentionCandidates(query: string, people: string[], limit = 5): string[] {
  const q = query.trim().toLowerCase();
  const unique = [...new Set(people.filter(Boolean))];
  const hits = unique.filter((name) => {
    if (!q) return true;
    const lower = name.toLowerCase();
    return lower.startsWith(q) || lower.split(" ").some((part) => part.startsWith(q));
  });
  return hits.sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

/** Replace the mention being typed with the chosen full name and a trailing space. */
export function completeMention(draft: string, name: string): string {
  return draft.replace(/@([A-Za-z]*(?: [A-Za-z]*)?)$/, `@${name} `);
}

/** Names mentioned in a message, limited to people the workspace knows. */
export function mentionsIn(text: string, people: string[]): string[] {
  const found = people.filter((name) => text.includes(`@${name}`));
  return [...new Set(found)];
}

export function matchesConversation(message: Rec, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${message.summary} ${String(message.fields.author ?? message.ownerName)}`.toLowerCase().includes(q);
}
