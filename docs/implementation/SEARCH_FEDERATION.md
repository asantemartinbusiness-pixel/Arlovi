# Arlovi Search 2.3 — source transparency and federation contract

## Current implementation

Arlovi global search indexes browser-local organisation records, visible document blocks and browser-local mail messages. Search 2.3 adds an **Integrations** scope with catalogue metadata that links to the real Integrations marketplace. It does **not** read a provider's data or claim that a provider is connected. Each result has a source classification:

- `local`: stored in the Arlovi browser-local workspace; local role visibility is not server-side security.
- `catalogue`: public integration capability metadata; `not_connected` is shown explicitly.
- `remote`: reserved exclusively for a response from a **trusted authenticated server search adapter**, not materialised by the client today.

The client never reads `NANGO_SECRET_KEY`, provider tokens, or external mailbox data.

The integration marketplace now accepts `?q=<capability-label>` from the command palette so a search hit lands in a useful filtered destination.

## Secure backend integration prerequisites (not implemented or enabled)

PR #84 (`feat/nango-integrations-experience-20261119`) is an independent, currently open feature branch for Nango setup. Its own notes identify unavailable production authentication, missing credentials and durable grant storage. Do **not** mark search integrations connected until all of the following exist and are verified:

1. **Trusted identity and organisation** from a server-validated session, with membership and role state checked on every search request. Never trust `orgId`, `role`, connector IDs or allowed permissions received from the browser.
2. **Durable connection ownership and scope grants** from the authentication database; the source must be connected and have explicitly approved `search.read` access.
3. **Provider-specific adapters** that retrieve remote data on the server using scoped secrets; no data or access tokens in JavaScript or static Vite assets.
4. **Resource-level authorization before hits leave the server**, including discover permissions, field visibility, snippet permissions, classification and external-provider account ACLs.
5. **Tenant-filtered indexing and cache keys**; never share results across companies, roles or connector accounts. Revocations, disconnects and deletions must invalidate stored search documents.
6. **Secure search API** with origin/CSRF protections, rate limits, timeouts, cancellation, cursor-based pagination, per-provider error handling, audit logs and retrieval telemetry with no secret values.
7. **Provider-specific UI and navigation routes**, including verified resource targets. A provider URL cannot be returned verbatim as an internal Arlovi route.

## Server-side contract now included

`server/search/federation.ts` is a stand-alone, non-routed policy function. A future trusted API can call it **only after authentication and grant resolution**. It rejects unauthenticated actors, disconnected grants, cross-company records and foreign/external URLs. It performs per-record discovery checks and a separate snippet-read check. Errors return a partial state without leaking provider exception messages.

There is **no publicly reachable server search route**, no live adapter registry and no remote fetch in Search 2.3. A boolean in the client is never proof of server authorization.

## QA

Tests verify catalogue/source separation, search-to-marketplace deep links, non-connection disclosures, company and resource ACL rejection, snippet restrictions, cross-company route rejection, and partial failure handling. Existing Search 2.1/2.2 browser and unit tests remain in the focused gate.

## Future sequence

1. Land and verify Nango gateway PR #84 independently, with production session verification, durable grants and secrets configured.
2. Implement one genuine provider read-only adapter with a live test tenant. Prefer document metadata before body indexing, or a limited mail search.
3. Add a protected `POST /api/search` route that sources principal and connections from trusted server storage and calls the federation function.
4. Enable remote results in Arlovi only when the server confirms search capability for the authenticated tenant.
5. Test account switching, role revocation, cross-tenant isolation, access revocation, confidential content, no cached result leaks and partial outages before any broader provider rollout.


## Search 2.4 — opt-in server read gateway (19 November 2026)

This phase adds an actual Vercel API endpoint and a bounded **read-only Nango Sync record adapter**. The feature is **off by default**. No provider account was connected, no production secrets were added, and no remote record reads were made in the Arlovi environment during development.

New modules:

- `api/search/status.ts` — public, non-sensitive capability readiness (`configured: true/false`); never exposes keys or private company data.
- `api/search/records.ts` — protected `POST` entry point with strict JSON size, query, HTTPS origin and source restrictions. It derives the trusted actor and company from the search authority, not from IndexedDB or browser-provided role/connection IDs.
- `server/search/authority.ts` — a TLS-only, server-to-server authority contract. Identity, active company membership, search.read grant, rate-limit decision, connection ownership and mapped record discovery must come from a real durable backend.
- `server/search/nangoDocuments.ts` — metadata-only Nango Sync `GET /records` adapter using the configured integration, model and approved connection. Bounded to three pages of up to 100 cached records each; **not comprehensive full-text search** and no content/body collection.
- `server/search/config.ts` — explicit feature gate requiring all server settings.
- `src/platform/connectedSearch.ts` — browser-side response validation as defence in depth. The UI adds a Connected scope *only* when the server readiness endpoint reports it is configured.

### Required server-only configuration

No `VITE_` secrets:

- `ARLOVI_SEARCH_REMOTE_ENABLED=true` — explicit opt-in only after end-to-end review.
- `ARLOVI_APP_ORIGIN=https://arlovi.vercel.app` — exact trusted HTTPS origin.
- `ARLOVI_SEARCH_AUTHORITY_URL=https://<your-trusted-backend>/search/` — server-to-server authority providing `POST verify` and `POST resolve`.
- `ARLOVI_SEARCH_AUTHORITY_TOKEN` — secret service-to-service credential, never sent to browser.
- `NANGO_SECRET_KEY` — Nango server API secret.
- `ARLOVI_SEARCH_NANGO_DOCUMENT_INTEGRATION` — reviewed Nango integration configuration key.
- `ARLOVI_SEARCH_NANGO_DOCUMENT_MODEL` — actual deployed Nango Sync model for document metadata.

**Do not enable until each item and its service exists.** Browser demo identity cannot satisfy the authority contract.

### Trusted authority contract

`POST <ARLOVI_SEARCH_AUTHORITY_URL>/verify` receives a server-authenticated call containing the original session headers and `{organizationSlug, permission:"search.read"}`. The authority must *itself* verify session validity, active membership, user permissions, connection ownership and rate limits. Required response:

```json
{
  "authenticated": true,
  "permissionGranted": true,
  "rateLimitOk": true,
  "organizationSlug": "verified-company-slug",
  "actor": { "authenticated": true, "id": "verified-user-id", "organizationId": "verified-org-id" },
  "connections": [
    {
      "id": "trusted-nango-connection-id",
      "organizationId": "verified-org-id",
      "providerCode": "configured-provider-key",
      "displayName": "Authorised company files",
      "status": "verified_external",
      "searchGrant": true
    }
  ]
}
```

`POST .../resolve` receives the verified actor and connection IDs plus Nango provider-record IDs. For each candidate the authority looks up a *durably persisted*, already-ingested Arlovi native record mapping and returns the verified internal route, organisation, connection, classification, `discoverable: true` and independent `snippetReadable`. Unknown IDs, other-company IDs, deleted records, disabled access and stale grants return no item. **Never trust a provider URL to construct an Arlovi route.**

Every gateway response has `Cache-Control: no-store` and no tokens, raw Nango rows or provider exceptions. Invalid sessions, unconfigured services and errors fail closed. The client never accepts remote hits for another company and never trusts the `configured` status as an access grant.

### Deployment gates

1. Complete the separate Nango integration PR #84 review and reconcile its branch with main.
2. Create and verify Arlovi's *own* authentication/membership backend and durable `search.read` grant service (with rate limiting), independently audited. Nango authenticates provider access, not Arlovi users.
3. Implement the authority's `verify` and `resolve` endpoints with proper RLS and connection-mapping storage. Ensure disconnect, revocation, role change, ownership transfer and deletion take effect on the next search request.
4. Configure a real Nango document metadata Sync model and scoped consent in a test company; test account isolation, matching and resources before enabling in production.
5. Review privacy/data residency, provider APIs, Nango data retention, quotas, integration costs, errors and monitoring.
6. Enable `ARLOVI_SEARCH_REMOTE_ENABLED` only after full live-credential browser and security tests, then expand to additional provider adapters and a dedicated indexed search service for complete, scalable results.

Until then, Search 2.4 is a **securely gated implementation**, not a claim of working live connected search.
