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
