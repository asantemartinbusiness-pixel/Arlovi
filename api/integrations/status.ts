import type { Request, Response } from "./_shared";
import { configuredIntegrations, json, ready } from "./_shared";

export default function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  json(res, 200, {
    provider: "nango",
    available: ready(),
    integrations: ready() ? configuredIntegrations() : [],
    note: ready() ? "Connection service configured; each connection still requires authorised access." :
      "Account connections are not enabled in this environment.",
  });
}
