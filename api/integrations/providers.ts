import type { Request, Response } from "../../server/integrations/shared";
import { json, nango } from "../../server/integrations/shared";

/**
 * Read-only provider discovery. A supported provider is NOT necessarily a
 * configured OAuth integration or a verified tool/sync in Arlovi.
 * Never return the environment API key, provider credentials or customer data.
 */
type Provider = { id: string; name: string; categories: string[]; authMode: string };
let cached: { expiresAt: number; providers: Provider[] } | undefined;

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  if (!process.env.NANGO_SECRET_KEY) return json(res, 200, { providers: [], source: "not_configured", total: 0 });
  try {
    if (!cached || cached.expiresAt <= Date.now()) {
      const response = await nango("/providers");
      if (!response.ok) return json(res, 502, { error: "CATALOGUE_UNAVAILABLE" });
      const payload = await response.json() as { data?: Record<string, unknown>[] };
      const entries = (Array.isArray(payload.data) ? payload.data : []).slice(0, 2500);
      cached = {
        expiresAt: Date.now() + 5 * 60 * 1000,
        providers: entries
          .filter(item => typeof item.name === "string")
          .map(item => ({
            id: String(item.name),
            name: typeof item.display_name === "string" ? item.display_name : String(item.name),
            categories: Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === "string").slice(0, 6) : [],
            authMode: typeof item.auth_mode === "string" ? item.auth_mode : "unknown",
          })),
      };
    }
    const params = new URL(req.url || "/", "https://arlovi.invalid").searchParams;
    const query = params.get("q")?.trim().toLowerCase().slice(0, 120) || "";
    const page = Number(params.get("page") || "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100) {
      return json(res, 400, { error: "INVALID_PAGE" });
    }
    const items = query
      ? cached.providers.filter(item => (item.name + " " + item.id + " " + item.categories.join(" ")).toLowerCase().includes(query))
      : cached.providers;
    const pageSize = 48;
    const offset = (page - 1) * pageSize;
    json(res, 200, {
      providers: items.slice(offset, offset + pageSize), total: items.length,
      page, nextPage: offset + pageSize < items.length ? page + 1 : null, source: "nango",
    });
  } catch {
    json(res, 502, { error: "CATALOGUE_UNAVAILABLE", message: "The connector directory is temporarily unavailable." });
  }
}
