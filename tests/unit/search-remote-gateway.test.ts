import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../../api/search/records";
import statusHandler from "../../api/search/status";
import { connectedSearchConfigured } from "../../server/search/config";
import { readConnectedSearchHits, connectedStatusConfigured } from "@/platform/connectedSearch";
import { searchHits } from "@/platform/searchModel";

const FLAGS = {
  ARLOVI_SEARCH_REMOTE_ENABLED: "true",
  ARLOVI_APP_ORIGIN: "https://arlovi.vercel.app",
  ARLOVI_SEARCH_AUTHORITY_URL: "https://trusted.example/search/",
  ARLOVI_SEARCH_AUTHORITY_TOKEN: "test-internal-authority-secret-value",
  NANGO_SECRET_KEY: "test-nango-server-secret",
  ARLOVI_SEARCH_NANGO_DOCUMENT_INTEGRATION: "google-drive",
  ARLOVI_SEARCH_NANGO_DOCUMENT_MODEL: "File",
};

const nangoRecord = { id: "provider-file-1", name: "November planning report" };

function request(body: unknown = { organizationSlug: "northline", query: "planning" }): IncomingMessage & { body: unknown } {
  return {
    method: "POST",
    headers: {
      origin: FLAGS.ARLOVI_APP_ORIGIN,
      "content-type": "application/json",
      cookie: "arlovi-session=example",
      "content-length": "125",
    },
    body,
  } as unknown as IncomingMessage & { body: unknown };
}

function response() {
  let sent: unknown;
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((body: string) => { sent = JSON.parse(body) as unknown; }),
  } as unknown as ServerResponse;
  return { res, get status() { return res.statusCode; }, get payload() { return sent as Record<string, unknown>; } };
}

function configure() {
  for (const [key, value] of Object.entries(FLAGS)) vi.stubEnv(key, value);
}

function authPayload(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true, permissionGranted: true, rateLimitOk: true, organizationSlug: "northline",
    actor: { authenticated: true, id: "user-1", organizationId: "org-1" },
    connections: [{
      id: "connection-1", organizationId: "org-1", providerCode: "google-drive",
      displayName: "Shared Drive", status: "verified_external", searchGrant: true,
    }],
    ...overrides,
  };
}

function mappingPayload(overrides: Record<string, unknown> = {}) {
  return {
    resources: [{
      providerRecordId: "provider-file-1", connectionId: "connection-1",
      organizationId: "org-1", route: "/o/northline/docs/documents/arlovi-doc-1",
      collection: "documents", classification: "internal",
      discoverable: true, snippetReadable: false, ...overrides,
    }],
  };
}

function mockServer({ auth = authPayload(), mapping = mappingPayload(), records = [nangoRecord] }: {
  auth?: Record<string, unknown>; mapping?: Record<string, unknown>; records?: unknown[];
} = {}) {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/verify")) return new Response(JSON.stringify(auth), { status: 200 });
    if (url.endsWith("/resolve")) return new Response(JSON.stringify(mapping), { status: 200 });
    if (url.startsWith("https://api.nango.dev/records?")) return new Response(JSON.stringify({
      records, next_cursor: null,
    }), { status: 200 });
    throw new Error("Unexpected URL: " + url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { urls, fetchMock };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Search 2.4 authenticated gateway", () => {
  it("defaults to disabled and does not leak provider configuration", async () => {
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(503);
    expect(out.payload).toEqual({ error: "CONNECTED_SEARCH_NOT_CONFIGURED" });
    const status = response();
    statusHandler({ method: "GET" } as IncomingMessage, status.res);
    expect(status.payload.configured).toBe(false);
    expect(JSON.stringify(status.payload)).not.toContain("secret");
    expect(connectedSearchConfigured({})).toBe(false);
  });

  it("loads a mapped, authorised Nango Sync record without exposing credentials", async () => {
    configure();
    const server = mockServer();
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(200);
    const hits = out.payload.hits as Record<string, unknown>[];
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      title: "November planning report",
      sourceType: "remote", sourceState: "verified_external",
      sourceName: "Shared Drive", to: "/o/northline/docs/documents/arlovi-doc-1",
    });
    expect(server.urls.filter(item => item.startsWith("https://api.nango.dev/"))).toHaveLength(1);
    expect(JSON.stringify(out.payload)).not.toContain("test-nango-server-secret");
    expect(JSON.stringify(out.payload)).not.toContain("arlovi-session");
    expect(JSON.stringify(out.payload)).not.toContain("test-internal-authority");
  });

  it("never reads Nango when trusted session lacks explicit quota permission", async () => {
    configure();
    const server = mockServer({ auth: authPayload({ rateLimitOk: false }) });
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(403);
    expect(server.urls).toEqual(["https://trusted.example/search/verify"]);
  });

  it("rejects origin forgery and client-selected foreign organisation", async () => {
    configure();
    const server = mockServer();
    const hostile = request();
    hostile.headers.origin = "https://forged.example";
    const noOrigin = response();
    await handler(hostile, noOrigin.res);
    expect(noOrigin.status).toBe(403);
    expect(server.urls).toHaveLength(0);

    const wrong = response();
    await handler(request({ organizationSlug: "harbor", query: "planning" }), wrong.res);
    expect(wrong.status).toBe(403);
    expect(server.urls.filter(item => item.includes("nango.dev"))).toHaveLength(0);
  });

  it("does not surface Nango records without the durable mapping and discover grant", async () => {
    configure();
    mockServer({ mapping: mappingPayload({ discoverable: false }) });
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(200);
    expect(out.payload.hits).toEqual([]);
  });

  it("rejects mapped foreign tenant paths and provider-controlled destinations", async () => {
    configure();
    mockServer({ mapping: mappingPayload({ route: "/o/harbor/docs/documents/secret" }) });
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(200);
    expect(out.payload.hits).toEqual([]);
  });

  it("excludes deleted Nango records and refuses implicit full-text body access", async () => {
    configure();
    mockServer({ records: [
      { ...nangoRecord, description: "PRIVATE_DOCUMENT_CONTENT", _nango_metadata: { deleted_at: "2026-11-18" } },
    ] });
    const out = response();
    await handler(request(), out.res);
    expect(out.status).toBe(200);
    expect(out.payload.hits).toEqual([]);
    expect(JSON.stringify(out.payload)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
  });
});

describe("Search 2.4 client visibility", () => {
  it("validates source identity, local company routes and remote-only search scope", () => {
    const rows = readConnectedSearchHits({ hits: [
      { key: "remote-good-1", kind: "record", title: "Project report", detail: "Shared Drive",
        to: "/o/northline/docs/documents/doc-1", sourceType: "remote",
        sourceState: "verified_external", sourceName: "Shared Drive", collection: "documents" },
      { key: "remote-bad-2", kind: "record", title: "Different company",
        to: "/o/harbor/docs/documents/secret", sourceType: "remote",
        sourceState: "verified_external", sourceName: "Shared Drive" },
      { key: "remote-bad-3", kind: "record", title: "External",
        to: "https://attacker.example", sourceType: "remote",
        sourceState: "verified_external", sourceName: "Shared Drive" },
      { key: "catalogue-entry", kind: "connector", title: "Not connected",
        to: "/o/northline/connect/marketplace", sourceType: "catalogue" },
    ] }, "northline");
    expect(rows).toHaveLength(1);
    expect(searchHits(rows, { query: "project", scope: "connected" })).toHaveLength(1);
    expect(searchHits(rows, { query: "project", scope: "files" })).toHaveLength(1);
    expect(connectedStatusConfigured({ configured: false })).toBe(false);
    expect(connectedStatusConfigured({ configured: true })).toBe(true);
  });
});
