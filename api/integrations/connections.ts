import type { Request, Response } from "../../server/integrations/shared";
import {
  fetchCompanyConnectionPage, identify, json, ready, validOrgId,
} from "../../server/integrations/shared";

/** Every request independently checks the authenticated organisation and
 * filters by tags at Nango AND in our own projection (defence in depth).
 * No provider credentials or Nango metadata leave this endpoint. */
export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!ready()) return json(res, 503, { error: "SETUP_REQUIRED" });
  const query = new URL(req.url || "/", "https://arlovi.invalid").searchParams;
  const orgId = query.get("organizationId") || "";
  if (!validOrgId(orgId)) return json(res, 400, { error: "INVALID_ORGANISATION" });
  const pageRaw = Number(query.get("page") || "1");
  if (!Number.isSafeInteger(pageRaw) || pageRaw < 1 || pageRaw > 10000) {
    return json(res, 400, { error: "INVALID_PAGE" });
  }
  const owner = query.get("owner") === "mine" ? "mine" : "all";
  const integrationId = query.get("integrationId") || undefined;
  if (integrationId && !/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(integrationId)) {
    return json(res, 400, { error: "INVALID_INTEGRATION" });
  }
  try {
    const identity = await identify(req, orgId);
    if (!identity) return json(res, 403, { error: "NOT_AUTHORISED" });
    const limit = 100;
    const result = await fetchCompanyConnectionPage(
      identity.organizationId, identity.userId, pageRaw, limit, owner, integrationId,
    );
    if (!result) return json(res, 502, { error: "PROVIDER_UNAVAILABLE" });
    return json(res, 200, {
      connections: result.connections, page: pageRaw,
      nextPage: result.hasMore ? pageRaw + 1 : null,
    });
  } catch {
    return json(res, 502, { error: "SERVICE_UNAVAILABLE" });
  }
}
