import { describe, expect, it } from "vitest";
import {
  isSafeConnectLink, projectCompanyConnections, validOrgId,
} from "../../server/integrations/shared";

const providerResponse = {
  connections: [
    {
      connection_id: "same-connection",
      provider_config_key: "shopify",
      provider: "shopify",
      created: "2026-11-19T19:00:00.000Z",
      tags: { organization_id: "org_one", end_user_id: "user_1" },
      errors: [],
      credentials: { access_token: "DO_NOT_LEAK" },
    },
    {
      connection_id: "other-company",
      provider_config_key: "stripe",
      provider: "stripe",
      created: "2026-11-19T19:01:00.000Z",
      tags: { organization_id: "org_two", end_user_id: "user_1" },
      errors: [],
    },
    {
      connection_id: "my-colleague",
      provider_config_key: "xero",
      provider: "xero",
      created: "2026-11-19T19:02:00.000Z",
      tags: { organization_id: "org_one", end_user_id: "user_2" },
      errors: [{ type: "auth" }],
    },
    {
      connection_id: "orphaned",
      provider_config_key: "hubspot",
      provider: "hubspot",
      tags: {},
    },
  ],
};

describe("Nango secure connection projections", () => {
  it("filters cross-company records even if the upstream API returns mixed tenants", () => {
    const result = projectCompanyConnections(providerResponse, "org_one", "user_1");
    expect(result.map(row => row.id)).toEqual(["same-connection", "my-colleague"]);
    expect(result.map(row => row.ownedByMe)).toEqual([true, false]);
    expect(result.map(row => row.needsAttention)).toEqual([false, true]);
  });

  it("limits verification to the current user's accounts", () => {
    const result = projectCompanyConnections(providerResponse, "org_one", "user_1", "mine");
    expect(result.map(row => row.id)).toEqual(["same-connection"]);
  });

  it("never projects credentials or opaque provider metadata to the browser", () => {
    const result = projectCompanyConnections(providerResponse, "org_one", "user_1");
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(JSON.stringify(result)).not.toContain("DO_NOT_LEAK");
    expect(JSON.stringify(result)).not.toContain("credentials");
  });

  it("rejects malformed records and missing ownership tags", () => {
    expect(projectCompanyConnections({ connections: [null, false, {}, { tags: { organization_id: "org_one" } }] }, "org_one", "user_1")).toEqual([]);
    expect(projectCompanyConnections(null, "org_one", "user_1")).toEqual([]);
    expect(projectCompanyConnections({ connections: "not-an-array" }, "org_one", "user_1")).toEqual([]);
  });

  it("only accepts secure hosted Nango links, never look-alike hosts", () => {
    expect(isSafeConnectLink("https://app.nango.dev/connect/session123")).toBe(true);
    expect(isSafeConnectLink("https://api.nango.dev/oauth/connect/session123")).toBe(true);
    expect(isSafeConnectLink("https://nango.dev.evil.example/connect")).toBe(false);
    expect(isSafeConnectLink("https://evil-nango.dev/connect")).toBe(false);
    expect(isSafeConnectLink("https://alice:secret@nango.dev/connect")).toBe(false);
    expect(isSafeConnectLink("javascript:alert(1)")).toBe(false);
  });

  it("rejects invalid company routing IDs", () => {
    expect(validOrgId("company_1")).toBe(true);
    expect(validOrgId("../other-company")).toBe(false);
    expect(validOrgId(" ")).toBe(false);
  });
});
