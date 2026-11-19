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
