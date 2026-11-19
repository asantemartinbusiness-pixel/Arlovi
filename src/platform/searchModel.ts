/**
 * Shared, deterministic ranking for the browser-local Arlovi search surface.
 * Retrieval and authorisation remain responsibilities of each search provider.
 */
export type SearchScope = "all" | "this-app" | "my-work" | "files" | "people" | "actions" | "apps";
export type SearchKind = "record" | "app" | "screen" | "workspace" | "resume" | "saved" | "action" | "return";

export interface SearchHit {
  key: string;
  kind: SearchKind;
  group: string;
  title: string;
  detail: string;
  to: string;
  appCode?: string;
  collection?: string;
  recordId?: string;
  summary?: string;
  status?: string;
  ownerName?: string;
  updatedAt?: string;
  keywords?: string;
  mine?: boolean;
}

export interface SearchOptions {
  query: string;
  scope: SearchScope;
  activeApp?: string;
}

export const SEARCH_SCOPES: ReadonlyArray<{ id: SearchScope; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "this-app", label: "This app" },
  { id: "my-work", label: "My work" },
  { id: "files", label: "Files" },
  { id: "people", label: "People" },
  { id: "apps", label: "Apps" },
  { id: "actions", label: "Actions" },
];

const FILE_COLLECTIONS = new Set(["documents", "workbooks", "decks", "designs", "knowledge"]);
const PEOPLE_COLLECTIONS = new Set(["employees", "contacts", "candidates"]);

export function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

export function matchesScope(hit: SearchHit, scope: SearchScope, activeApp?: string): boolean {
  switch (scope) {
    case "all": return true;
    case "this-app": return Boolean(activeApp && hit.appCode === activeApp);
    case "my-work": return hit.mine === true || hit.kind === "resume" || hit.kind === "return" || hit.kind === "saved";
    case "files": return Boolean(hit.collection && FILE_COLLECTIONS.has(hit.collection))
      || (hit.kind === "app" && ["DOCS", "SHEETS", "PRESENT", "DESIGN"].includes(hit.appCode ?? ""));
    case "people": return Boolean(hit.collection && PEOPLE_COLLECTIONS.has(hit.collection))
      || (hit.kind === "app" && hit.appCode === "HR");
    case "apps": return hit.kind === "app" || hit.kind === "screen" || hit.kind === "workspace";
    case "actions": return hit.kind === "action";
  }
}

/** Exact record IDs and titles beat frequently visited destinations. */
export function scoreSearchHit(hit: SearchHit, rawQuery: string): number {
  const query = normalizeSearch(rawQuery);
  if (!query) return 1;
  const title = normalizeSearch(hit.title);
  const id = normalizeSearch(hit.recordId ?? "");
  const detail = normalizeSearch(hit.detail);
  const keywords = normalizeSearch(hit.keywords ?? "");
  const summary = normalizeSearch(hit.summary ?? "");
  const tokens = query.split(/\s+/).filter(Boolean);
  const corpus = [title, id, detail, keywords, summary].join(" ");
  if (!tokens.every(token => corpus.includes(token))) return 0;
  let score = 10;
  if (id && id === query) score += 220;
  else if (id && id.includes(query)) score += 125;
  if (title === query) score += 180;
  else if (title.startsWith(query)) score += 90;
  else if (title.includes(query)) score += 65;
  if (keywords.includes(query)) score += 16;
  if (detail.includes(query)) score += 10;
  if (hit.kind === "record") score += 14;
  if (hit.kind === "app") score += 8;
  if (hit.kind === "saved") score += 4;
  return score;
}

export function searchHits(hits: SearchHit[], options: SearchOptions, limit = 40): SearchHit[] {
  const query = options.query.trim().slice(0, 200);
  const ranked = hits
    .filter(hit => matchesScope(hit, options.scope, options.activeApp))
    .map((hit, order) => ({ hit, order, score: scoreSearchHit(hit, query) }))
    .filter(item => item.score > 0);
  if (query) ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  const seen = new Set<string>();
  const visible: SearchHit[] = [];
  for (const item of ranked) {
    // Several records may share a collection list route. They must remain
    // individually discoverable rather than disappear under URL deduplication.
    const identity = item.hit.kind === "record" && item.hit.recordId
      ? `record:${item.hit.recordId}`
      : item.hit.to;
    if (seen.has(identity)) continue;
    seen.add(identity);
    visible.push(item.hit);
    if (visible.length === limit) break;
  }
  return visible;
}
