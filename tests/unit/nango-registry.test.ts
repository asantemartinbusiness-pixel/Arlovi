import { describe, expect, it } from "vitest";
import { projectCloudRegistry, readCloudConnectionRegistry } from "../../server/integrations/registry";

const orgId = "22222222-2222-4222-8222-222222222222";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: orgId,
  provider_name: "Shopify",
  provider_config_key: "shopify",
  connection_name: "Main store",
  ownership: "organization",
  status: "authorised",
  activation: "inactive",
  sync_health: "not_configured",
  read_verified_at: null,
  updated_at: "2026-11-19T20:00:00.000Z",
  credentials: { access_token: "NEVER_EXPOSE" },
};

describe("Arlovi Cloud connection activation registry", () => {
  it("preserves the difference between authorised and activated", () => {
    expect(projectCloudRegistry([row], orgId)).toEqual([{
      id: row.id,
      providerName: "Shopify",
      integrationId: "shopify",
      connectionName: "Main store",
      ownership: "organization",
      status: "authorised",
      activation: "inactive",
      syncHealth: "not_configured",
      readVerifiedAt: null,
      updatedAt: row.updated_at,
      needsAttention: false,
    }]);
  });

  it("never exposes provider credentials or arbitrary metadata", () => {
    expect(JSON.stringify(projectCloudRegistry([row], orgId))).not.toContain("NEVER_EXPOSE");
    expect(JSON.stringify(projectCloudRegistry([row], orgId))).not.toContain("credentials");
  });

  it("fails closed if a backend responds with another company's record", () => {
    expect(projectCloudRegistry([{ ...row, organization_id: "wrong-org" }], orgId)).toBeNull();
  });

  it("rejects malformed status and unrecognised records", () => {
    expect(projectCloudRegistry([{ ...row, status: "connected_unverified" }], orgId)).toBeNull();
    expect(projectCloudRegistry([null], orgId)).toBeNull();
    expect(projectCloudRegistry({}, orgId)).toBeNull();
  });

  it("passes authenticated bearer tokens to the RLS endpoint without a service-role key", async () => {
    let requestUrl = "";
    let headers = new Headers();
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(url);
      headers = new Headers(init?.headers);
      return Response.json([row]);
    }) as typeof fetch;
    const result = await readCloudConnectionRegistry("Bearer token.test.jwt", orgId, 1, {
      url: "https://arlovi-only.supabase.co",
      publishableKey: "sb_publishable_public",
      fetcher,
    });
    expect(result?.connections).toHaveLength(1);
    expect(result?.nextPage).toBeNull();
    expect(requestUrl).toContain("arlovi_integration_connections");
    expect(requestUrl).toContain("organization_id=eq.");
    expect(headers.get("authorization")).toBe("Bearer token.test.jwt");
    expect(headers.get("apikey")).toBe("sb_publishable_public");
  });

  it("fails closed for absent bearer tokens and disabled permissions", async () => {
    const fail = (async () => new Response(null, { status: 403 })) as typeof fetch;
    const settings = { url: "https://arlovi-only.supabase.co", publishableKey: "sb_publishable_public", fetcher: fail };
    expect(await readCloudConnectionRegistry(undefined, orgId, 1, settings)).toBeNull();
    expect(await readCloudConnectionRegistry("Bearer token", orgId, 1, settings)).toBeNull();
  });
});
