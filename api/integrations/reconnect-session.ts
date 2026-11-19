import type { Request, Response } from "../../server/integrations/shared";
import {
  bodyObject, configuredIntegrations, identify, isSafeConnectLink, json, nango,
  projectCompanyConnections, ready, sameOrigin, validOrgId,
} from "../../server/integrations/shared";

/** Reauthorise an existing company-owned Nango connection without replacing
 * it with an accidental duplicate. Id and provider must match at Nango too. */
export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!ready()) return json(res, 503, { error: "SETUP_REQUIRED" });
  if (!sameOrigin(req)) return json(res, 403, { error: "ORIGIN_MISMATCH" });
  const body = bodyObject(req);
  const orgId = body?.organizationId, connectionId = body?.connectionId, integrationId = body?.integrationId;
  if (!validOrgId(orgId) || typeof connectionId !== "string" ||
      connectionId.length < 1 || connectionId.length > 256 ||
      typeof integrationId !== "string" || !configuredIntegrations().includes(integrationId)) {
    return json(res, 400, { error: "INVALID_CONNECTION" });
  }
  try {
    const identity = await identify(req, orgId);
    if (!identity) return json(res, 403, { error: "NOT_AUTHORISED" });
    const params = new URLSearchParams({
      connectionId, "tags[organization_id]": identity.organizationId,
    });
    const existing = await nango("/connections?" + params.toString());
    if (!existing.ok) return json(res, 502, { error: "PROVIDER_UNAVAILABLE" });
    const connections = projectCompanyConnections(await existing.json(), identity.organizationId, identity.userId);
    if (!connections.some(item => item.id === connectionId && item.integrationId === integrationId)) {
      return json(res, 404, { error: "CONNECTION_NOT_FOUND" });
    }
    const response = await nango("/connect/sessions/reconnect", {
      method: "POST",
      body: JSON.stringify({ connection_id: connectionId, integration_id: integrationId }),
    });
    if (!response.ok) return json(res, 502, { error: "PROVIDER_UNAVAILABLE" });
    const data = await response.json() as { data?: { connect_link?: string; expires_at?: string } };
    const link = data.data?.connect_link;
    if (!isSafeConnectLink(link)) return json(res, 502, { error: "INVALID_CONNECT_LINK" });
    return json(res, 200, { connectLink: link, expiresAt: data.data?.expires_at ?? null });
  } catch {
    return json(res, 502, { error: "SERVICE_UNAVAILABLE" });
  }
}
