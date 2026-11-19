import type { IncomingMessage, ServerResponse } from "node:http";

export type Request = IncomingMessage & { body?: unknown };
export type Response = ServerResponse;
export type Identity = { userId: string; email?: string; organizationId: string; canManageIntegrations: boolean; canViewIntegrations: boolean };

export function json(res: Response, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export function configuredIntegrations(): string[] {
  return [...new Set((process.env.NANGO_CONFIGURED_INTEGRATIONS || "").split(",").map(value => value.trim()).filter(value => /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value)))];
}

export function ready(): boolean {
  return Boolean(process.env.NANGO_SECRET_KEY && process.env.ARLOVI_SESSION_VERIFY_URL && process.env.ARLOVI_APP_ORIGIN && configuredIntegrations().length);
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  const expected = process.env.ARLOVI_APP_ORIGIN;
  return typeof origin === "string" && typeof expected === "string" && origin === expected;
}

// This hook must be supplied by Arlovi's real identity backend, never by the
// browser/IndexedDB demo workspace. Its response is authoritative ONLY if that
// backend verifies the session, company membership and integration permission.
export async function identify(req: Request, orgId: string): Promise<Identity | null> {
  const verifier = process.env.ARLOVI_SESSION_VERIFY_URL;
  if (!verifier || !/^https:\/\//.test(verifier)) return null;
  const response = await fetch(verifier, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": typeof req.headers.cookie === "string" ? req.headers.cookie : "",
      "Authorization": typeof req.headers.authorization === "string" ? req.headers.authorization : "",
    },
    body: JSON.stringify({ organizationId: orgId, permission: "manage_integrations" }),
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || record.userId.length < 1 ||
      record.organizationId !== orgId || record.canManageIntegrations !== true) return null;
  return {
    userId: record.userId,
    email: typeof record.email === "string" ? record.email : undefined,
    organizationId: orgId,
    canManageIntegrations: true,
    canViewIntegrations: true,
  };
}

export async function nango(path: string, init: RequestInit = {}): Promise<globalThis.Response> {
  // Note: this returns the fetch Response. Never return the Nango secret to clients.
  if (!process.env.NANGO_SECRET_KEY) throw new Error("NANGO_NOT_CONFIGURED");
  return fetch("https://api.nango.dev" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + process.env.NANGO_SECRET_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
}

export function bodyObject(req: Request): Record<string, unknown> | null {
  let parsed = req.body;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}


/** Minimal safe projection. Nango's list endpoint includes tags and errors,
 * but no token should ever reach a browser. Missing/ambiguous ownership fails closed. */
export type SafeConnection = {
  id: string;
  integrationId: string;
  provider: string;
  created: string;
  needsAttention: boolean;
  ownedByMe: boolean;
};
export function projectCompanyConnections(payload: unknown, organizationId: string, userId: string, owner: "all" | "mine" = "all"): SafeConnection[] {
  if (!payload || typeof payload !== "object") return [];
  const input = (payload as { connections?: unknown }).connections;
  if (!Array.isArray(input)) return [];
  const valid = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);
  return input.filter(valid).flatMap(item => {
    const tags = item.tags;
    if (!valid(tags) || tags.organization_id !== organizationId) return [];
    if (owner === "mine" && tags.end_user_id !== userId) return [];
    if (typeof item.connection_id !== "string" || !item.connection_id ||
        typeof item.provider_config_key !== "string" || !item.provider_config_key) return [];
    return [{
      id: item.connection_id,
      integrationId: item.provider_config_key,
      provider: typeof item.provider === "string" ? item.provider : item.provider_config_key,
      created: typeof item.created === "string" ? item.created : "",
      needsAttention: Array.isArray(item.errors) && item.errors.length > 0,
      ownedByMe: tags.end_user_id === userId,
    }];
  });
}
export function isSafeConnectLink(link: unknown): link is string {
  if (typeof link !== "string" || link.length > 4096) return false;
  try {
    const url = new URL(link);
    // No redirects to untrusted phishing sites; hosted custom domains may be
    // explicitly allowlisted as origins in server environment settings.
    const extra = (process.env.NANGO_CONNECT_ALLOWED_ORIGINS || "")
      .split(",").map(origin => origin.trim()).filter(Boolean);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "nango.dev" || url.hostname.endsWith(".nango.dev") || extra.includes(url.origin));
  } catch { return false; }
}
export function validOrgId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{2,96}$/i.test(value);
}
export async function fetchCompanyConnectionPage(
  organizationId: string, userId: string, page: number, limit: number, owner: "all" | "mine" = "all",
  integrationId?: string,
): Promise<{ connections: SafeConnection[]; hasMore: boolean } | null> {
  const params = new URLSearchParams({
    "tags[organization_id]": organizationId, page: String(page), limit: String(limit),
  });
  if (owner === "mine") params.set("tags[end_user_id]", userId);
  const response = await nango("/connections?" + params.toString());
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const raw = payload && typeof payload === "object" ? (payload as { connections?: unknown }).connections : undefined;
  if (!Array.isArray(raw)) return null;
  const scoped = projectCompanyConnections(payload, organizationId, userId, owner);
  return {
    connections: integrationId ? scoped.filter(item => item.integrationId === integrationId) : scoped,
    hasMore: raw.length === limit,
  };
}
