import { describe, expect, it } from "vitest";
import { isUuid, verifyCloudIdentity } from "../../server/integrations/supabaseIdentity";

const userId = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const token = "Bearer valid.test.jwt";
const base = "https://isolated-arlovi-project.supabase.co";
const options = (fetcher: typeof fetch) => ({ url: base, key: "sb_publishable_test", fetcher });

function mockIdentity(role = "owner", membershipOrg = orgId, userOverride = {}) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return calls.length === 1
      ? Response.json({ id: userId, email: "verified@example.test", user_metadata: { role: "owner" }, ...userOverride })
      : Response.json([{ organization_id: membershipOrg, user_id: userId, role, status: "active" }]);
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("Arlovi cloud integration permission verification", () => {
  it("authenticates a real user and current membership without trusting client role", async () => {
    const { fetcher, calls } = mockIdentity("admin");
    const user = await verifyCloudIdentity(token, orgId, options(fetcher));
    expect(user).toEqual({
      userId, organizationId: orgId, email: "verified@example.test",
      canManageIntegrations: true, canViewIntegrations: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(base + "/auth/v1/user");
    expect(calls[1].url).toContain("arlovi_memberships");
    expect(calls[1].url).toContain("organization_id=eq.");
    expect(calls.every(call => call.headers.get("Authorization") === token)).toBe(true);
    expect(calls.every(call => call.headers.get("apikey") === "sb_publishable_test")).toBe(true);
  });

  it("does not elevate a viewer based on editable user_metadata claims", async () => {
    const { fetcher } = mockIdentity("viewer");
    const user = await verifyCloudIdentity(token, orgId, options(fetcher));
    expect(user?.canManageIntegrations).toBe(false);
    expect(user?.canViewIntegrations).toBe(true);
  });

  it("rejects a different organisation even when Supabase returned a membership row", async () => {
    const { fetcher } = mockIdentity("owner", "33333333-3333-4333-8333-333333333333");
    expect(await verifyCloudIdentity(token, orgId, options(fetcher))).toBeNull();
  });

  it("rejects expired, anonymous, malformed and unauthenticated requests", async () => {
    const { fetcher } = mockIdentity();
    expect(await verifyCloudIdentity(undefined, orgId, options(fetcher))).toBeNull();
    expect(await verifyCloudIdentity("Bearer ", orgId, options(fetcher))).toBeNull();
    expect(await verifyCloudIdentity(token, "org-northline-demo", options(fetcher))).toBeNull();
    const anonymous = mockIdentity("owner", orgId, { is_anonymous: true });
    expect(await verifyCloudIdentity(token, orgId, options(anonymous.fetcher))).toBeNull();
    const fail = (async () => new Response(null, { status: 401 })) as typeof fetch;
    expect(await verifyCloudIdentity(token, orgId, options(fail))).toBeNull();
  });

  it("rejects a backend configuration pointing at an insecure URL", async () => {
    const { fetcher } = mockIdentity();
    expect(await verifyCloudIdentity(token, orgId, { url: "http://example.com", key: "key", fetcher })).toBeNull();
    expect(await verifyCloudIdentity(token, orgId, { url: "https://example.com@evil.test", key: "key", fetcher })).toBeNull();
  });

  it("validates immutable UUID identities for cloud org mappings", () => {
    expect(isUuid(orgId)).toBe(true);
    expect(isUuid(userId)).toBe(true);
    expect(isUuid("northline")).toBe(false);
  });
});
