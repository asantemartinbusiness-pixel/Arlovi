/**
 * Bounded, read-only Nango synced-document metadata adapter.
 * This fetches existing Nango Sync records; it does not initiate a sync, call
 * an AI model, acquire OAuth grants, or read provider file contents.
 *
 * A synced object is NOT automatically searchable. Only objects with an
 * Arlovi-owned record mapping and a server-authorised discover grant can
 * become results. The backend authority supplies the internal destination,
 * classification and resource permissions; Nango data cannot choose a URL.
 */
import type { ServerProviderAdapter, ProviderSearchRow, TrustedPrincipal, TrustedProviderConnection } from "./federation";
import type { SearchAuthority, SearchMapping } from "./authority";

type FetchLike = typeof fetch;

export interface NangoDocumentAdapterOptions {
  integrationId: string;
  model: string;
  apiKey: string;
  actor: TrustedPrincipal;
  authority: SearchAuthority;
  onResolved: (mapping: SearchMapping) => void;
  fetchImpl?: FetchLike;
}

const MAX_PAGES = 3;
const MAX_ITEMS_PER_PAGE = 100;
const MAX_RESPONSE_BYTES = 600_000;

function safeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length < 180
    && !/[\u0000-\u001f]/.test(value);
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function titleFor(value: Record<string, unknown>): string {
  const name = [value.title, value.name, value.filename, value.subject]
    .find(item => typeof item === "string" && item.trim());
  return typeof name === "string" ? name.trim().slice(0, 180) : "";
}

/** Only allow literal, server-configured sync model and integration keys. */
function isConfiguredKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value);
}

/**
 * Nango /records uses Connection-Id and Provider-Config-Key headers.
 * It returns cursor-paginated cached sync records; this bounded lookup is an
 * interim read adapter, not a complete full-text index over every document.
 */
export function createNangoDocumentAdapter(options: NangoDocumentAdapterOptions): ServerProviderAdapter {
  if (!isConfiguredKey(options.integrationId) || !isConfiguredKey(options.model)
    || !options.apiKey || !options.actor.authenticated) throw new Error("SEARCH_ADAPTER_NOT_CONFIGURED");
  const call = options.fetchImpl ?? fetch;
  return {
    providerCode: options.integrationId,
    async search(connection: TrustedProviderConnection, query: string, limit: number): Promise<ProviderSearchRow[]> {
      if (connection.organizationId !== options.actor.organizationId
        || connection.providerCode !== options.integrationId
        || connection.status !== "verified_external" || !connection.searchGrant
        || !safeId(connection.id)) return [];
      const normalized = query.trim().toLocaleLowerCase().slice(0, 160);
      if (normalized.length < 2) return [];
      const matches: { id: string; title: string }[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES && matches.length < Math.min(limit, 30); page++) {
        const params = new URLSearchParams({ model: options.model, limit: String(MAX_ITEMS_PER_PAGE) });
        if (cursor) params.set("cursor", cursor);
        const response = await call("https://api.nango.dev/records?" + params, {
          method: "GET",
          headers: {
            "Authorization": "Bearer " + options.apiKey,
            "Connection-Id": connection.id,
            "Provider-Config-Key": options.integrationId,
            "Accept": "application/json",
          },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(5500),
        });
        if (!response.ok) throw new Error("NANGO_SYNC_READ_UNAVAILABLE");
        const payload = await response.text();
        if (payload.length > MAX_RESPONSE_BYTES) throw new Error("NANGO_SYNC_RESPONSE_LIMIT");
        const parsed: unknown = JSON.parse(payload);
        const body = object(parsed);
        if (!body || !Array.isArray(body.records)) throw new Error("NANGO_SYNC_RESPONSE_INVALID");
        for (const entry of body.records.slice(0, MAX_ITEMS_PER_PAGE)) {
          const rec = object(entry);
          if (!rec || !safeId(rec.id)) continue;
          const metadata = object(rec._nango_metadata);
          if (metadata?.deleted_at) continue;
          const title = titleFor(rec);
          if (title && (title.toLocaleLowerCase().includes(normalized) || rec.id.toLocaleLowerCase().includes(normalized))) {
            matches.push({ id: rec.id, title });
          }
        }
        if (typeof body.next_cursor !== "string" || !body.next_cursor || body.next_cursor.length > 2000) break;
        cursor = body.next_cursor;
      }

      if (!matches.length) return [];
      // The permission backend must map external IDs to owned native records
      // and explicitly allow discover; otherwise they are completely omitted.
      const mapped = await options.authority.resolveResources(options.actor, connection, matches.map(item => item.id));
      const authorityMap = new Map(mapped.map(item => [item.providerRecordId, item]));
      const output: ProviderSearchRow[] = [];
      for (const match of matches) {
        const permission = authorityMap.get(match.id);
        if (!permission || !permission.discoverable
          || permission.connectionId !== connection.id
          || permission.organizationId !== options.actor.organizationId) continue;
        options.onResolved(permission);
        output.push({
          id: match.id,
          organizationId: options.actor.organizationId,
          connectionId: connection.id,
          title: match.title,
          route: permission.route,
          classification: permission.classification,
          collection: permission.collection,
          // Deliberately no snippets or arbitrary provider fields in v2.4.
        });
        if (output.length >= Math.min(limit, 30)) break;
      }
      return output;
    },
  };
}
