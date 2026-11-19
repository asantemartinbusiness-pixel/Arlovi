/**
 * Arlovi Cloud identity verification for Nango. Calls Supabase Auth to
 * validate the current bearer token, then uses the SAME user token for an
 * RLS-protected live membership check. This does not trust browser roles,
 * user_metadata or a JWT merely because it parses successfully.
 *
 * The dedicated Arlovi cloud database is staged, not deployed. No operation
 * can authenticate until a separate project, schema and real login exist.
 */
export interface CloudIdentity {
  userId: string;
  email?: string;
  organizationId: string;
  canManageIntegrations: boolean;
  canViewIntegrations: boolean;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function cloudConfigured(): boolean {
  return Boolean(process.env.ARLOVI_CLOUD_SUPABASE_URL && process.env.ARLOVI_CLOUD_SUPABASE_PUBLISHABLE_KEY);
}

export async function verifyCloudIdentity(
  authorization: unknown, orgId: string,
  options: { url: string; key: string; fetcher?: typeof fetch },
): Promise<CloudIdentity | null> {
  if (typeof authorization !== "string" || !/^Bearer [A-Za-z0-9_.~+/-]+={0,2}$/.test(authorization) ||
      authorization.length > 9000 || !isUuid(orgId)) return null;
  let base: URL;
  try {
    base = new URL(options.url);
  } catch { return null; }
  // Origin is server configured; never accept a caller-supplied base URL.
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
      base.pathname !== "/" || !options.key || options.key.length > 1024) return null;
  const requester = options.fetcher ?? fetch;
  const headers = {
    Authorization: authorization,
    apikey: options.key,
    Accept: "application/json",
  };
  try {
    const userResponse = await requester(new URL("/auth/v1/user", base).toString(), {
      method: "GET", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json() as Record<string, unknown>;
    if (!user || !isUuid(user.id) || user.is_anonymous === true || user.deleted_at) return null;

    // All access decisions come from Arlovi membership records via RLS, NOT
    // from user_metadata, app-supplied company names, or decoded JWT claims.
    const membershipUrl = new URL("/rest/v1/arlovi_memberships", base);
    membershipUrl.searchParams.set("select", "organization_id,user_id,role,status");
    membershipUrl.searchParams.set("organization_id", "eq." + orgId);
    membershipUrl.searchParams.set("user_id", "eq." + user.id);
    membershipUrl.searchParams.set("status", "eq.active");
    membershipUrl.searchParams.set("limit", "1");
    const response = await requester(membershipUrl.toString(), {
      method: "GET", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const membership: Record<string, unknown> | null =
      rows[0] && typeof rows[0] === "object" && !Array.isArray(rows[0])
        ? rows[0] as Record<string, unknown> : null;
    if (!membership || membership.organization_id !== orgId || membership.user_id !== user.id ||
        membership.status !== "active") return null;
    const role = membership.role;
    if (!["owner", "admin", "editor", "viewer"].includes(String(role))) return null;
    return {
      userId: user.id,
      email: typeof user.email === "string" ? user.email : undefined,
      organizationId: orgId,
      canViewIntegrations: true,
      canManageIntegrations: role === "owner" || role === "admin",
    };
  } catch { return null; }
}
