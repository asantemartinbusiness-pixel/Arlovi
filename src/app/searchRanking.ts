/** Deterministic client-side ranking for destinations in the current local company.
 * Matches all query terms across title, section and descriptive metadata.
 * Never invents a destination or performs a cross-organisation lookup.
 */
export interface SearchableDestination {
  title: string;
  detail: string;
  searchText?: string;
}

function normalise(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

export function searchScore(query: string, hit: SearchableDestination): number | null {
  const q = normalise(query);
  if (!q) return 0;
  const title = normalise(hit.title);
  const detail = normalise(hit.detail);
  const extra = normalise(hit.searchText ?? "");
  const all = [title, detail, extra].join(" ");
  const words = q.split(" ");
  if (!words.every(word => all.includes(word))) return null;

  let score = 0;
  if (title === q) score += 1000;
  else if (title.startsWith(q)) score += 700;
  else if (title.includes(q)) score += 480;

  if (detail === q) score += 270;
  else if (detail.startsWith(q)) score += 170;
  else if (detail.includes(q)) score += 90;

  const titleWords = title.split(" ");
  for (const word of words) {
    if (titleWords.includes(word)) score += 110;
    else if (title.includes(word)) score += 75;
    else if (detail.includes(word)) score += 30;
    else score += 10;
  }
  return score;
}

export function rankSearchHits<T extends SearchableDestination>(query: string, hits: T[]): T[] {
  return hits.map((hit, index) => ({ hit, index, score: searchScore(query, hit) }))
    .filter((candidate): candidate is {hit: T; index: number; score: number} => candidate.score !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(candidate => candidate.hit);
}
