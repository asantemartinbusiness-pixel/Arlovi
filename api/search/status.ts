import type { IncomingMessage, ServerResponse } from "node:http";
import { connectedSearchConfigured } from "../../server/search/config";

/**
 * Non-sensitive readiness hint for the global search UI.
 * 'configured' means the server-side gate has required settings; it does not
 * grant access, assert any account is connected, or disclose organisation data.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ configured: connectedSearchConfigured(), source: "server_configuration" }));
}
