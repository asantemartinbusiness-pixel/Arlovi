import { isUuid } from "./supabaseIdentity";

/** Read-only projection of dedicated Arlovi Cloud integration records.
 * RLS is evaluated using the user's verified Supabase bearer token. */
export interface ConnectionRegistryView {
  id: string;
  providerName: string;
  integrationId: string;
  connectionName: string;
  ownership: "personal" | "organization" | "department";
  status: "pending" | "authorised" | "needs_attention" | "suspended" | "disconnected";
  activation: "inactive" | "read_only" | "approved_writes";
  syncHealth: "not_configured" | "healthy" | "degraded" | "failed";
  readVerifiedAt: string | null;
  updatedAt: string;
  needsAttention: boolean;
}
export function projectCloudRegistry(payload: unknown, organizationId: string): ConnectionRegistryView[] | null {
  if (!Array.isArray(payload)) return null;
  const result: ConnectionRegistryView[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    // A stray row from the wrong company indicates a policy or API bug.
    if (row.organization_id !== organizationId) return null;
    if (typeof row.id !== "string" || typeof row.provider_config_key !== "string") return null;
    const status = String(row.status);
    const activation = String(row.activation);
    const sync = String(row.sync_health);
    const ownership = String(row.ownership);
    if (!["pending","authorised","needs_attention","suspended","disconnected"].includes(status) ||
        !["inactive","read_only","approved_writes"].includes(activation) ||
        !["not_configured","healthy","degraded","failed"].includes(sync) ||
        !["personal","organization","department"].includes(ownership)) return null;
    result.push({
      id: row.id,
      providerName: typeof row.provider_name === "string" ? row.provider_name : row.provider_config_key,
      integrationId: row.provider_config_key,
      connectionName: typeof row.connection_name === "string" ? row.connection_name : "",
      ownership: ownership as ConnectionRegistryView["ownership"],
      status: status as ConnectionRegistryView["status"],
      activation: activation as ConnectionRegistryView["activation"],
      syncHealth: sync as ConnectionRegistryView["syncHealth"],
      readVerifiedAt: typeof row.read_verified_at === "string" ? row.read_verified_at : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
      needsAttention: status === "needs_attention" || sync === "degraded" || sync === "failed",
    });
  }
  return result;
}

export async function readCloudConnectionRegistry(
  authorization: unknown, organizationId: string, page: number,
  settings: { url: string; publishableKey: string; fetcher?: typeof fetch },
): Promise<{ connections: ConnectionRegistryView[]; nextPage: number | null } | null> {
  if (typeof authorization !== "string" || !/^Bearer [A-Za-z0-9_.~+/-]+={0,2}$/.test(authorization) ||
      !isUuid(organizationId) || !Number.isSafeInteger(page) || page < 1 || page > 10000) return null;
  const base = new URL(settings.url);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" ||
      !settings.publishableKey) return null;
  const limit = 100;
  const query = new URL("/rest/v1/arlovi_integration_connections", base);
  query.searchParams.set("select","id,organization_id,provider_name,provider_config_key,connection_name,ownership,status,activation,sync_health,read_verified_at,updated_at");
  query.searchParams.set("organization_id","eq." + organizationId);
  query.searchParams.set("order","updated_at.desc");
  query.searchParams.set("limit",String(limit));
  query.searchParams.set("offset",String((page-1)*limit));
  try {
    const response = await (settings.fetcher ?? fetch)(query.toString(), {
      method: "GET",
      headers: { apikey: settings.publishableKey, Authorization: authorization, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    const connections = projectCloudRegistry(rows, organizationId);
    if (!connections) return null;
    return { connections, nextPage: connections.length === limit ? page+1 : null };
  } catch { return null; }
}
