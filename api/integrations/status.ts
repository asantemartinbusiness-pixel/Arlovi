import type { Request, Response } from "../../server/integrations/shared";
import { configuredIntegrations, json, ready } from "../../server/integrations/shared";
import { cloudConfigured } from "../../server/integrations/supabaseIdentity";

export default function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  json(res, 200, {
    provider: "nango",
    cloudRegistry: cloudConfigured(),
    available: ready(),
    integrations: ready() ? configuredIntegrations() : [],
    note: ready() ? "Connection service configured; each connection still requires authorised access." :
      "Account connections are not enabled in this environment.",
  });
}
