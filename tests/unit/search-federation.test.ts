import { describe, expect, it } from "vitest";
import {
  runAuthorizedFederatedSearch,
  type ProviderSearchRow, type ServerSearchRequest, type TrustedProviderConnection,
} from "../../server/search/federation";
import { integrationSearchHits } from "@/platform/searchSources";
import { matchesScope, searchHits } from "@/platform/searchModel";

const connected: TrustedProviderConnection = {
  id: "conn-1", organizationId: "org-northline", providerCode: "documents",
  displayName: "Company documents", status: "verified_external", searchGrant: true,
};
const row: ProviderSearchRow = {
  id: "file-1", organizationId: "org-northline", connectionId: "conn-1",
  title: "Planning brief", route: "/o/northline/docs/documents/file-1",
  collection: "documents", snippet: "Only signed supplier estimates",
  classification: "internal",
};
const base: ServerSearchRequest = {
  actor: { id: "user-1", authenticated: true, organizationId: "org-northline" },
  orgSlug: "northline", query: "planning",
  connections: [connected],
  adapters: [{ providerCode: "documents", search: async () => [row] }],
  permissions: {
    connectionReadable: async () => true,
    discoverable: async () => true,
    snippetReadable: async () => true,
  },
};

describe("Search 2.3 catalogue and server-only federation boundary", () => {
  it("separates connection catalogue links from remote data", () => {
    const entries = integrationSearchHits("northline");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(item => item.kind === "connector" && item.sourceType === "catalogue")).toBe(true);
    expect(entries.every(item => item.sourceState === "not_connected")).toBe(true);
    expect(entries.every(item => item.to.startsWith("/o/northline/connect/marketplace?q="))).toBe(true);
    expect(searchHits(entries, { scope: "integrations", query: "Bank feed" })).toHaveLength(1);
    expect(searchHits(entries, { scope: "files", query: "Bank feed" })).toHaveLength(0);
    expect(entries.every(item => !item.contentText && !item.recordId)).toBe(true);
  });

  it("denies unauthenticated searches and disconnected or foreign connections", async () => {
    expect(await runAuthorizedFederatedSearch({ ...base, actor: null })).toEqual({ state: "denied", hits: [] });
    expect((await runAuthorizedFederatedSearch({ ...base, actor: { ...base.actor!, authenticated: false } })).hits).toEqual([]);
    expect((await runAuthorizedFederatedSearch({ ...base, connections: [{ ...connected, status: "not_connected" }] })).hits).toEqual([]);
    expect((await runAuthorizedFederatedSearch({ ...base, connections: [{ ...connected, organizationId: "org-harbor" }] })).hits).toEqual([]);
    expect((await runAuthorizedFederatedSearch({ ...base, connections: [{ ...connected, searchGrant: false }] })).hits).toEqual([]);
    expect((await runAuthorizedFederatedSearch({
      ...base, permissions: { ...base.permissions, connectionReadable: async () => false },
    })).hits).toEqual([]);
  });

  it("keeps results company-scoped, permission-checked and link-safe", async () => {
    const remote = [
      row,
      { ...row, id: "foreign", organizationId: "org-harbor", title: "Forbidden" },
      { ...row, id: "wrong-account", connectionId: "conn-2", title: "Wrong account" },
      { ...row, id: "wrong-route", route: "/o/harbor/docs/documents/file-2", title: "Wrong path" },
      { ...row, id: "external-url", route: "https://other.example/steal", title: "External" },
      { ...row, id: "restricted", title: "Sensitive result", classification: "restricted" as const },
    ];
    const result = await runAuthorizedFederatedSearch({
      ...base,
      adapters: [{ providerCode: "documents", search: async () => remote }],
      permissions: {
        ...base.permissions,
        discoverable: async (_, candidate) => candidate.id !== "restricted",
      },
    });
    expect(result.state).toBe("complete");
    expect(result.hits.map(item => item.title)).toEqual(["Planning brief"]);
    expect(result.hits[0]).toMatchObject({
      sourceType: "remote", sourceName: "Company documents", sourceState: "verified_external",
      to: "/o/northline/docs/documents/file-1",
    });
  });

  it("prevents confidential and restricted snippets, and requires a separate snippet grant", async () => {
    const candidates = [
      { ...row, id: "confidential", classification: "confidential" as const },
      { ...row, id: "restricted", classification: "restricted" as const },
      { ...row, id: "ordinary", classification: "internal" as const },
    ];
    const result = await runAuthorizedFederatedSearch({
      ...base, adapters: [{ providerCode: "documents", search: async () => candidates }],
      permissions: { ...base.permissions, snippetReadable: async () => false },
    });
    expect(result.hits).toHaveLength(3);
    expect(result.hits.every(hit => !hit.contentText)).toBe(true);
    const granted = await runAuthorizedFederatedSearch({
      ...base, adapters: [{ providerCode: "documents", search: async () => candidates }],
    });
    expect(granted.hits.find(hit => hit.key.endsWith("ordinary"))?.contentText).toContain("signed supplier");
    expect(granted.hits.find(hit => hit.key.endsWith("confidential"))?.contentText).toBeUndefined();
    expect(granted.hits.find(hit => hit.key.endsWith("restricted"))?.contentText).toBeUndefined();
  });

  it("degrades to partial results without mixing inaccessible provider failures", async () => {
    const result = await runAuthorizedFederatedSearch({
      ...base,
      connections: [connected, { ...connected, id: "conn-2", providerCode: "mail", displayName: "Mail" }],
      adapters: [
        { providerCode: "documents", search: async () => [row] },
        { providerCode: "mail", search: async () => { throw new Error("private token detail"); } },
      ],
    });
    expect(result.state).toBe("partial");
    expect(result.hits).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private token detail");
  });

  it("does not treat a catalogue entry as a connected record", () => {
    const hit = integrationSearchHits("northline")[0];
    expect(hit.sourceType).toBe("catalogue");
    expect(matchesScope(hit, "integrations")).toBe(true);
    expect(matchesScope(hit, "mail")).toBe(false);
  });
});
