import type { SearchHit } from "@/platform/searchModel";

/**
 * UI defensive validation only. Authorisation happens on the server before
 * any remote response is generated; this parser never grants access.
 */
export function readConnectedSearchHits(raw: unknown, orgSlug: string): SearchHit[] {
  if (!raw || typeof raw !== "object" || !("hits" in raw) || !Array.isArray(raw.hits)) return [];
  const prefix = `/o/${encodeURIComponent(orgSlug)}/`;
  const output: SearchHit[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.hits.slice(0, 30)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const h = candidate as Record<string, unknown>;
    if (h.kind !== "record" || h.sourceType !== "remote" || h.sourceState !== "verified_external"
      || typeof h.key !== "string" || !h.key.startsWith("remote-") || h.key.length > 250
      || typeof h.sourceName !== "string" || !h.sourceName.trim() || h.sourceName.length > 150
      || typeof h.title !== "string" || !h.title.trim() || h.title.length > 180
      || typeof h.to !== "string" || !h.to.startsWith("/") || h.to.startsWith("//")
      || h.to.length > 2048 || [...h.to].some(character => character.charCodeAt(0) < 32)) continue;
    let path: string;
    try {
      const url = new URL(h.to, "https://arlovi.invalid");
      if (url.origin !== "https://arlovi.invalid" || !url.pathname.startsWith(prefix)) continue;
      path = url.pathname + url.search + url.hash;
    } catch { continue; }
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    output.push({
      key: h.key, kind: "record", group: "Connected sources",
      title: h.title, to: path,
      detail: typeof h.detail === "string" ? h.detail.slice(0, 150) : h.sourceName,
      appCode: typeof h.appCode === "string" ? h.appCode.slice(0, 30) : undefined,
      collection: typeof h.collection === "string" ? h.collection.slice(0, 60) : undefined,
      recordId: typeof h.recordId === "string" ? h.recordId.slice(0, 180) : undefined,
      contentText: typeof h.contentText === "string" ? h.contentText.slice(0, 200) : undefined,
      sourceName: h.sourceName, sourceType: "remote", sourceState: "verified_external",
    });
  }
  return output;
}

export function connectedStatusConfigured(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "configured" in value
    && (value as { configured?: unknown }).configured === true);
}
