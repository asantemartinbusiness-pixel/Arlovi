import type { Request, Response } from "./_shared";
import { bodyObject, configuredIntegrations, identify, json, nango, ready, sameOrigin } from "./_shared";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!ready()) return json(res, 503, { error: "SETUP_REQUIRED", message: "Secure integrations are not enabled yet." });
  if (!sameOrigin(req)) return json(res, 403, { error: "ORIGIN_MISMATCH" });
  const body = bodyObject(req);
  const orgId = body?.organizationId, integrationId = body?.integrationId;
  if (typeof orgId !== "string" || !/^[a-z0-9_-]{2,96}$/i.test(orgId) ||
      typeof integrationId !== "string" || !configuredIntegrations().includes(integrationId)) {
    return json(res, 400, { error: "INVALID_INTEGRATION" });
  }
  try {
    const identity = await identify(req, orgId);
    if (!identity) return json(res, 403, { error: "NOT_AUTHORISED", message: "Company integration permissions could not be verified." });
    const response = await nango("/connect/sessions", {
      method: "POST",
      body: JSON.stringify({
        tags: {
          organization_id: identity.organizationId,
          end_user_id: identity.userId,
          ...(identity.email ? { end_user_email: identity.email } : {}),
        },
        allowed_integrations: [integrationId],
      }),
    });
    if (!response.ok) return json(res, 502, { error: "PROVIDER_UNAVAILABLE", message: "The connection service could not start authorisation." });
    const result = await response.json() as { data?: { connect_link?: string; expires_at?: string } };
    const link = result.data?.connect_link;
    // Never send Nango secret keys, refresh tokens or raw provider credentials.
    if (!link || !/^https:\/\//.test(link)) {
      return json(res, 502, { error: "NO_CONNECT_LINK", message: "The provider did not return a usable connection link." });
    }
    return json(res, 200, { connectLink: link, expiresAt: result.data?.expires_at ?? null });
  } catch {
    return json(res, 502, { error: "SERVICE_UNAVAILABLE", message: "Unable to reach the connection service. Please try again." });
  }
}
