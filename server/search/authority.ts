/**
 * Server-only authority boundary for connected search.
 *
 * The external authority must authenticate Arlovi's real session, verify active
 * company membership and search.read grants against durable storage, and
 * enforce resource discovery permissions. It is never the browser's local
 * role or IndexedDB. No authority = no connected search.
 */
import type { TrustedPrincipal, TrustedProviderConnection } from "./federation";

export interface VerifiedSearchSession {
  actor: TrustedPrincipal;
  organizationSlug: string;
  connections: TrustedProviderConnection[];
}

export interface SearchMapping {
  providerRecordId: string;
  connectionId: string;
  organizationId: string;
  route: string;
  collection: string;
  classification: "public" | "internal" | "confidential" | "restricted";
  discoverable: boolean;
  snippetReadable: boolean;
}

export interface SearchAuthority {
  verifySession(headers: { authorization?: string; cookie?: string }, requestedOrgSlug: string): Promise<VerifiedSearchSession | null>;
  resolveResources(actor: TrustedPrincipal, connection: TrustedProviderConnection, providerRecordIds: readonly string[]): Promise<SearchMapping[]>;
}

interface AuthorityOptions {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: typeof fetch;
}

function requiredUrl(raw: string): URL {
  const url = new URL(raw);
  // The authority is an admin-configured endpoint, never a client URL.
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("INVALID_SEARCH_AUTHORITY_URL");
  }
  return url;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f]/.test(value);
}

export class HttpSearchAuthority implements SearchAuthority {
  private readonly baseUrl: URL;
  private readonly serviceToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AuthorityOptions) {
    this.baseUrl = requiredUrl(options.baseUrl);
    if (!options.serviceToken || options.serviceToken.length < 20) {
      throw new Error("MISSING_SEARCH_AUTHORITY_CREDENTIAL");
    }
    this.serviceToken = options.serviceToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: "verify" | "resolve", payload: unknown, headers?: { authorization?: string; cookie?: string }): Promise<unknown> {
    const url = new URL(path, this.baseUrl.href.endsWith("/") ? this.baseUrl : new URL(this.baseUrl.href + "/"));
    if (url.origin !== this.baseUrl.origin) throw new Error("SEARCH_AUTHORITY_ORIGIN");
    const response = await this.fetchImpl(url.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.serviceToken,
        "X-Arlovi-Session-Authorization": headers?.authorization ?? "",
        "X-Arlovi-Session-Cookie": headers?.cookie ?? "",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("SEARCH_AUTHORITY_UNAVAILABLE");
    const text = await response.text();
    if (text.length > 64_000) throw new Error("SEARCH_AUTHORITY_RESPONSE_TOO_LARGE");
    return JSON.parse(text) as unknown;
  }

  async verifySession(headers: { authorization?: string; cookie?: string }, requestedOrgSlug: string): Promise<VerifiedSearchSession | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedOrgSlug)) return null;
    const payload = await this.request("verify", {
      organizationSlug: requestedOrgSlug, permission: "search.read",
    }, headers);
    if (!isPlainObject(payload) || payload.authenticated !== true
      || payload.permissionGranted !== true || payload.rateLimitOk !== true
      || payload.organizationSlug !== requestedOrgSlug
      || !isPlainObject(payload.actor)) return null;

    const actor = payload.actor;
    if (actor.authenticated !== true || !validId(actor.id) || !validId(actor.organizationId)) return null;
    // These records are an assertion from the trusted server, not from Nango
    // tags or browser-provided company/role fields.
    const connections: TrustedProviderConnection[] = [];
    const raw = Array.isArray(payload.connections) ? payload.connections.slice(0, 20) : [];
    for (const value of raw) {
      if (!isPlainObject(value) || !validId(value.id) || !validId(value.providerCode)
        || !validId(value.displayName) || value.organizationId !== actor.organizationId
        || value.status !== "verified_external" || value.searchGrant !== true) continue;
      connections.push({
        id: value.id, organizationId: actor.organizationId,
        providerCode: value.providerCode, displayName: value.displayName,
        status: "verified_external", searchGrant: true,
      });
    }
    return { actor: { authenticated: true, id: actor.id, organizationId: actor.organizationId }, organizationSlug: requestedOrgSlug, connections };
  }

  async resolveResources(actor: TrustedPrincipal, connection: TrustedProviderConnection, providerRecordIds: readonly string[]): Promise<SearchMapping[]> {
    if (!actor.authenticated || connection.organizationId !== actor.organizationId || !connection.searchGrant) return [];
    const ids = [...new Set(providerRecordIds)].filter(validId).slice(0, 100);
    if (!ids.length) return [];
    const payload = await this.request("resolve", {
      organizationId: actor.organizationId, actorId: actor.id,
      connectionId: connection.id, providerRecordIds: ids,
      permission: "search.read",
    });
    if (!isPlainObject(payload) || !Array.isArray(payload.resources)) return [];
    const seen = new Set(ids);
    return payload.resources.slice(0, 100).flatMap(value => {
      if (!isPlainObject(value) || !validId(value.providerRecordId) || !seen.has(value.providerRecordId)
        || value.organizationId !== actor.organizationId || value.connectionId !== connection.id
        || !validId(value.route) || !validId(value.collection)
        || !["public", "internal", "confidential", "restricted"].includes(String(value.classification))
        || value.discoverable !== true) return [];
      return [{
        providerRecordId: value.providerRecordId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        route: value.route,
        collection: value.collection,
        classification: value.classification as SearchMapping["classification"],
        discoverable: true, snippetReadable: value.snippetReadable === true,
      }];
    });
  }
}

export function configuredSearchAuthority(): HttpSearchAuthority | null {
  const url = process.env.ARLOVI_SEARCH_AUTHORITY_URL;
  const token = process.env.ARLOVI_SEARCH_AUTHORITY_TOKEN;
  if (!url || !token) return null;
  try { return new HttpSearchAuthority({ baseUrl: url, serviceToken: token }); }
  catch { return null; }
}
