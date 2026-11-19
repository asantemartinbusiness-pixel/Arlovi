import type { IncomingMessage, ServerResponse } from "node:http";
import type { SearchMapping } from "../../server/search/authority";
import { configuredSearchAuthority } from "../../server/search/authority";
import { connectedSearchConfigured } from "../../server/search/config";
import { createNangoDocumentAdapter } from "../../server/search/nangoDocuments";
import { runAuthorizedFederatedSearch } from "../../server/search/federation";

type Request = IncomingMessage & { body?: unknown };
const MAX_BODY_SIZE = 1200;

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Origin, Cookie, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}


async function bodyObject(req: Request): Promise<Record<string, unknown> | null> {
  if (req.body !== undefined) {
    const text = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (text.length > MAX_BODY_SIZE) return null;
    try {
      const value: unknown = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
    } catch { return null; }
  }
  let text = "";
  for await (const part of req) {
    text += typeof part === "string" ? part : String(part);
    if (text.length > MAX_BODY_SIZE) return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Protected opt-in endpoint. This is completely disabled until there is a
 * real company authentication/ACL authority, an approved Nango Sync model,
 * and server secrets. Never accept user-supplied account lists, roles,
 * organisation IDs, resource grants, model names or arbitrary URLs.
 */
export default async function handler(req: Request, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!connectedSearchConfigured()) return json(res, 503, { error: "CONNECTED_SEARCH_NOT_CONFIGURED" });
  if (typeof req.headers.origin !== "string" || req.headers.origin !== process.env.ARLOVI_APP_ORIGIN) {
    return json(res, 403, { error: "ORIGIN_MISMATCH" });
  }
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return json(res, 415, { error: "JSON_REQUIRED" });
  }
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_SIZE || contentLength < 0) {
    return json(res, 413, { error: "REQUEST_TOO_LARGE" });
  }

  const body = await bodyObject(req);
  const orgSlug = body?.organizationSlug, query = body?.query;
  if (typeof orgSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(orgSlug)
    || typeof query !== "string" || query.trim().length < 2 || query.length > 160) {
    return json(res, 400, { error: "INVALID_QUERY" });
  }

  try {
    const authority = configuredSearchAuthority();
    if (!authority) return json(res, 503, { error: "CONNECTED_SEARCH_NOT_CONFIGURED" });
    const verified = await authority.verifySession({
      authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
      cookie: typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
    }, orgSlug);
    if (!verified || !verified.actor.authenticated || verified.organizationSlug !== orgSlug) {
      return json(res, 403, { error: "NOT_AUTHORISED" });
    }

    const integrationId = process.env.ARLOVI_SEARCH_NANGO_DOCUMENT_INTEGRATION!;
    const model = process.env.ARLOVI_SEARCH_NANGO_DOCUMENT_MODEL!;
    const rights = new Map<string, SearchMapping>();
    const adapter = createNangoDocumentAdapter({
      actor: verified.actor, authority, integrationId, model,
      apiKey: process.env.NANGO_SECRET_KEY!,
      onResolved: mapping => rights.set(`${mapping.connectionId}: ${mapping.providerRecordId}`, mapping),
    });
    const verifiedConnectionIds = new Set(verified.connections.map(connection => connection.id));
    const result = await runAuthorizedFederatedSearch({
      actor: verified.actor,
      orgSlug: verified.organizationSlug,
      query: query.trim(),
      // Other provider models remain unavailable until independently approved.
      connections: verified.connections.filter(connection => connection.providerCode === integrationId),
      adapters: [adapter],
      permissions: {
        connectionReadable: async (actor, connection) =>
          actor.organizationId === connection.organizationId && verifiedConnectionIds.has(connection.id)
          && connection.status === "verified_external" && connection.searchGrant,
        discoverable: async (actor, row) => {
          const right = rights.get(`${row.connectionId}: ${row.id}`);
          return Boolean(right?.discoverable && right.organizationId === actor.organizationId && right.connectionId === row.connectionId);
        },
        snippetReadable: async (actor, row) => {
          const right = rights.get(`${row.connectionId}: ${row.id}`);
          return Boolean(right?.snippetReadable && right.organizationId === actor.organizationId);
        },
      },
    });
    // Generic states only: no raw provider exceptions, credentials or
    // arbitrary remote URLs. Never cache an organisation's search response.
    return json(res, 200, { state: result.state, hits: result.hits });
  } catch {
    return json(res, 502, { error: "CONNECTED_SEARCH_UNAVAILABLE" });
  }
}
