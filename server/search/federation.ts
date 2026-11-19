/**
 * Server-only policy engine for future authenticated provider search.
 *
 * DO NOT import into browser code or expose as a public API. A trusted session
 * verifier must construct the principal and read provider grants from durable
 * server-side storage. This module deliberately performs no network calls and
 * has no preconfigured adapters: Arlovi's current Vite workspace has neither
 * authenticated backend sessions nor live connector credentials.
 *
 * The engine provides a defence-in-depth filter, NOT a substitute for provider
 * permissions or database row-level security.
 */
import type { SearchHit } from "../../src/platform/searchModel";

export interface TrustedPrincipal {
  /** Construct only from the server's authenticated session verification. */
  authenticated: boolean;
  id: string;
  organizationId: string;
}

export interface TrustedProviderConnection {
  id: string;
  organizationId: string;
  providerCode: string;
  displayName: string;
  status: "verified_external" | "not_connected" | "blocked" | "failed";
  /** Granted server-side read capability; never derived from the browser. */
  searchGrant: boolean;
}

export interface ProviderSearchRow {
  id: string;
  organizationId: string;
  connectionId: string;
  title: string;
  route: string;
  collection: string;
  snippet?: string;
  classification: "public" | "internal" | "confidential" | "restricted";
}

export interface ServerProviderAdapter {
  providerCode: string;
  search: (connection: TrustedProviderConnection, query: string, limit: number) => Promise<readonly ProviderSearchRow[]>;
}

export interface ServerSearchPermissions {
  connectionReadable: (actor: TrustedPrincipal, connection: TrustedProviderConnection) => Promise<boolean>;
  discoverable: (actor: TrustedPrincipal, row: ProviderSearchRow) => Promise<boolean>;
  snippetReadable: (actor: TrustedPrincipal, row: ProviderSearchRow) => Promise<boolean>;
}

export interface ServerSearchRequest {
  actor: TrustedPrincipal | null;
  /** Trusted organisation route resolved from the verified session, not client body. */
  orgSlug: string;
  query: string;
  connections: readonly TrustedProviderConnection[];
  adapters: readonly ServerProviderAdapter[];
  permissions: ServerSearchPermissions;
}

export interface ServerSearchResponse {
  state: "denied" | "unavailable" | "complete" | "partial";
  hits: SearchHit[];
}

const MAX_QUERY = 160;
const MAX_HITS = 30;
const BASE_ORIGIN = "https://arlovi.invalid";

function safeRoute(to: string, slug: string): string | null {
  if (!to.startsWith("/") || to.startsWith("//") || /[\u0000-\u001f]/.test(to)) return null;
  try {
    const url = new URL(to, BASE_ORIGIN);
    const prefix = `/o/${encodeURIComponent(slug)}/`;
    if (url.origin !== BASE_ORIGIN || !url.pathname.startsWith(prefix)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/**
 * Default-deny federation. No browser-controlled principal, grant list or
 * resource metadata may be supplied to this function by a public endpoint.
 * A future API must first authenticate the request, load grants from trusted
 * storage and invoke this only with verified provider adapters.
 */
export async function runAuthorizedFederatedSearch(request: ServerSearchRequest): Promise<ServerSearchResponse> {
  const { actor } = request;
  if (!actor?.authenticated || !actor.id || !actor.organizationId) {
    return { state: "denied", hits: [] };
  }
  const query = request.query.trim().slice(0, MAX_QUERY);
  if (!query || !request.orgSlug || query.length < 2) return { state: "unavailable", hits: [] };

  const selected: TrustedProviderConnection[] = [];
  for (const connection of request.connections) {
    if (connection.organizationId !== actor.organizationId
      || connection.status !== "verified_external" || !connection.searchGrant) continue;
    if (!await request.permissions.connectionReadable(actor, connection)) continue;
    selected.push(connection);
  }
  if (selected.length === 0) return { state: "unavailable", hits: [] };

  const outcomes = await Promise.allSettled(selected.map(async connection => {
    const adapter = request.adapters.find(item => item.providerCode === connection.providerCode);
    if (!adapter) return [] as SearchHit[];
    const candidates = await adapter.search(connection, query, MAX_HITS);
    const output: SearchHit[] = [];
    for (const row of candidates.slice(0, MAX_HITS)) {
      if (row.organizationId !== actor.organizationId || row.connectionId !== connection.id) continue;
      const route = safeRoute(row.route, request.orgSlug);
      if (!route || !await request.permissions.discoverable(actor, row)) continue;
      // Snippets are a distinct read permission. No confidential content is
      // returned by default, even when its record title can be discovered.
      const showSnippet = row.classification !== "restricted"
        && row.classification !== "confidential"
        && await request.permissions.snippetReadable(actor, row);
      const title = row.title.trim().slice(0, 180);
      if (!title) continue;
      output.push({
        key: `remote-${connection.id}-${row.id}`,
        kind: "record",
        group: "Connected sources",
        title,
        detail: `${connection.displayName} · ${row.collection.slice(0, 60)}`,
        to: route,
        sourceType: "remote",
        sourceName: connection.displayName,
        sourceState: "verified_external",
        contentText: showSnippet && row.snippet ? row.snippet.slice(0, 200) : undefined,
        collection: row.collection,
        recordId: row.id,
      });
    }
    return output;
  }));

  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") continue;
    for (const hit of outcome.value) {
      if (seen.has(hit.key)) continue;
      seen.add(hit.key);
      hits.push(hit);
      if (hits.length >= MAX_HITS) break;
    }
    if (hits.length >= MAX_HITS) break;
  }
  return {
    state: outcomes.some(result => result.status === "rejected") ? "partial" : "complete",
    hits,
  };
}
