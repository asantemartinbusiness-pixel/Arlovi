import type { Request, Response } from "../../server/integrations/shared";
import { identify, json, nango, ready } from "../../server/integrations/shared";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!ready()) return json(res, 503, { error: "SETUP_REQUIRED" });
  const orgId = new URL(req.url || "/", "https://arlovi.invalid").searchParams.get("organizationId") || "";
  if (!/^[a-z0-9_-]{2,96}$/i.test(orgId)) return json(res, 400, { error: "INVALID_ORGANISATION" });
  try {
    const identity = await identify(req, orgId);
    if (!identity) return json(res, 403, { error: "NOT_AUTHORISED" });
    const response = await nango("/connections");
    if (!response.ok) return json(res, 502, { error: "PROVIDER_UNAVAILABLE" });
    const result = await response.json() as { connections?: Record<string, unknown>[] };
    const connections = (result.connections || [])
      .filter(item => {
        const tags = item.tags as Record<string, unknown> | undefined;
        return tags?.organization_id === identity.organizationId;
      })
      .map(item => ({
        id: item.connection_id,
        integrationId: item.provider_config_key,
        provider: item.provider,
        created: item.created,
        needsAttention: Array.isArray(item.errors) && item.errors.length > 0,
      }));
    return json(res, 200, { connections });
  } catch {
    return json(res, 502, { error: "SERVICE_UNAVAILABLE" });
  }
}
