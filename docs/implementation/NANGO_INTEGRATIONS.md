# Arlovi × Nango — implementation and production gates

Status: Native guided marketplace, safe account setup and Nango gateway have been implemented on a feature branch. Real customer authorisation is disabled until a trusted authentication backend, a Nango environment and provider configurations exist. Browser IndexedDB/demo roles are not an authentication boundary.

## Added

- Existing Integrations marketplace now includes business-goal discovery and curated recommendations, with Nango provider search when configured.
- Native authorisation drawer explains scopes and verifies Nango connection registration, without implying data imports or external writes occurred.
- Connections page exposes separate company-scoped Nango account metadata; local connector records remain separate.
- GET /api/integrations/status: readiness metadata.
- GET /api/integrations/providers?q=: sanitised provider catalogue; provider support is not the same as verified operations.
- POST /api/integrations/connect-session: server-side, company-permission-gated short-lived Nango Connect link.
- GET /api/integrations/connections?organizationId=: server-side, company-filtered connection metadata without raw provider credentials.

## Required server environment variables

- NANGO_SECRET_KEY: Nango Cloud environment API secret. Never prefix VITE_ or expose to client.
- NANGO_CONFIGURED_INTEGRATIONS: comma-separated Nango integration configuration keys, e.g. shopify,hubspot.
- ARLOVI_APP_ORIGIN: exact production HTTPS origin, e.g. https://arlovi.vercel.app.
- ARLOVI_SESSION_VERIFY_URL: secure HTTPS endpoint from Arlovi's actual identity backend.

## Identity verification contract

POST to ARLOVI_SESSION_VERIFY_URL forwards the authenticated request's Cookie/Authorization headers. Its JSON body requests the organizationId and manage_integrations permission. Only after validating the real, non-demo session, live company membership and permission may the backend respond with verified userId, optional email, organizationId matching the requested company, and canManageIntegrations=true. Return 401 or 403 otherwise.

This verifier is NOT present in the inspected frontend-only repository. The implementation fails closed when it is absent. Never substitute client-entered company IDs, role controls or an always-allow verifier.

## Nango setup

1. Configure Nango Cloud, provider authorisations, consent scopes, required provider approval and OAuth applications.
2. Set environment variables in Vercel server environments and add the trusted identity verifier.
3. Validate real OAuth with test accounts and verify cross-tenant isolation and 403 responses for unauthorised users.
4. Before declaring native-app integration complete, implement durable connection ownership and policy storage, verified webhook intake, idempotent processing, approved Nango tool execution, initial-import preview, incremental sync, per-field source-of-truth policies and agent approvals.
5. Review Nango Cloud data residency, retention, usage limits and third-party API terms before processing customer data.

## Security requirements

The backend exclusively creates Connect sessions, with single-provider allowlisting and company/user tags derived from verified server-side identity. Never send Nango secret keys or provider tokens to clients. A Nango account authorisation is not equivalent to a successful read, synchronisation, financial write or business process execution. Use Nango webhook-signature validation and durable idempotency before treating a webhook as a trusted event. Disable writes and automatic imports by default.

## Verification commands

- npm run build
- npm run test -- tests/unit/nango-integrations.test.ts
- npx playwright test e2e/nango-guided-experience.spec.ts
- npx playwright test e2e/integrations-native-experience.spec.ts

Run manual 390px / 820px / 1440px, keyboard, Escape, permission, multi-company, failure/reconnect and external test-account checks.

Official API references:
https://nango.dev/docs/reference/backend/http-api/connect/sessions/create
https://nango.dev/docs/reference/backend/http-api/connections/list
https://nango.dev/docs/reference/backend/http-api/providers/list

## Next increment: verified account lifecycle and event ingress

- Connections query Nango with server-side organization tags and pagination, then re-check tenant tags in the server projection. The owner=mine filter restricts the view to the current authenticated user.
- Setup snapshots the user's existing provider connections before authorisation and only confirms a genuinely new healthy connection.
- POST /api/integrations/reconnect-session checks company membership, connection ID and integration ID before issuing a short-lived reconnect link.
- The Nango provider directory supports paginated discovery rather than truncating results.
- Company Setup Centre has a direct Integrations entry alongside native apps.

### Signed webhook boundary

POST /api/integrations/webhook verifies the X-Nango-Hmac-Sha256 header against the original raw request bytes with the dedicated signing key. It rejects forwarded unverified-provider events, enforces an event size limit and hands signed content off to a trusted durable ingestion backend. It acknowledges an event only after that backend accepts it.

Configure these additional server-only variables:

- NANGO_WEBHOOK_SIGNING_KEY: Nango webhook signing key (not its API key).
- ARLOVI_EVENT_INGEST_URL: trusted HTTPS endpoint backed by durable storage and an actual company connection registry.
- ARLOVI_EVENT_INGEST_TOKEN: independent bearer credential for that endpoint.
- NANGO_CONNECT_ALLOWED_ORIGINS (optional): explicit HTTPS origins for custom Nango Connect domains.

Nango currently sends the secure HMAC header alongside the legacy X-Nango-Signature. Use only the secure HMAC header. The downstream ingestion service must durably deduplicate events before acknowledging, verify company and connection ownership against its own records, and handle replay and retries. **That durable worker is not configured in the current frontend-only Arlovi environment.** The receiver therefore returns 503 until it exists.

Reference: https://github.com/NangoHQ/nango/blob/master/packages/webhooks/lib/utils.ts


## Dedicated Arlovi Cloud identity (next implementation)

Arlovi already has a STAGED, unapplied account schema in
infra/supabase/arlovi_cloud_schema.sql. This branch adds a second staged
script, infra/supabase/arlovi_integrations_schema.sql, for connection
metadata, account permissions, sync policies, an event inbox and canonical
audit receipts. **Neither script has been run against any project.**

A concrete server-only Supabase Auth + live RLS membership verifier now
exists at server/integrations/supabaseIdentity.ts. It provides an optional
alternative to the custom ARLOVI_SESSION_VERIFY_URL bridge.

To use the cloud verification path, set both server-only variables:

- ARLOVI_CLOUD_SUPABASE_URL: HTTPS URL of a new dedicated Arlovi project.
- ARLOVI_CLOUD_SUPABASE_PUBLISHABLE_KEY: its publishable key (not service
  role/secret). No Arlovi Cloud project or credentials are configured yet.

For every Nango gateway request, Arlovi performs GET /auth/v1/user
using the caller's Bearer access token and then GET /rest/v1/arlovi_memberships
with the same token. The latter must pass the dedicated database's RLS policy.
Only an **active** owner/admin membership permits Nango setup and company
account management. A browser role selector or editable user_metadata claim
is never sufficient. A missing or expired token is denied. The actual
signed-in frontend must be connected to Arlovi Cloud before this path can
serve real users. Demo org slugs are not interchangeable with cloud UUIDs;
real-company ID mapping requires an authenticated migration.

The staged integration schema has:
- immutable company/provider/external connection identifiers;
- separate authorisation, read-verification, sync and account-health states;
- separate personal, company, and department connection ownership;
- permissions for users, departments, applications, and AI employees;
- no browser INSERT/UPDATE/DELETE grants on integration records;
- RLS metadata reads and per-company child-reference validation;
- private durable webhook inbox with unique event hashes and retry state;
- server-authoritative audit receipt records.

A signed webhook ingress is **not** a durable event queue. Its downstream
ARLOVI_EVENT_INGEST_URL must persist and deduplicate the payload and verify
actual company/connection ownership before acknowledging. Do not turn on
webhook-triggered business actions before that worker is deployed and tested.

## UI regression hardening

An existing unrelated global QA issue caused notifications to intercept
mobile workspace buttons. Arlovi toasts are now click-through except for
their explicit action and dismiss buttons; a dedicated viewport E2E test
guards this behavior. Other browser-suite failures must still be investigated
individually before release.

## Cloud deployment prerequisites

Do not apply staged SQL to Hilis or Hilis QA. Create a **new** Arlovi database
project with approved region/residency and cost. Run database security
advisors, user/tenant RLS tests and migration dry runs before applying the
cloud and integration schemas. No cloud storage is created automatically by
this PR. Keep Supabase secret keys off the browser and avoid bypassing RLS
in an untrusted server endpoint.

## Connection activation & AI permission policy

- GET /api/integrations/registry is a read-only Arlovi Cloud registry endpoint. It requires the configured dedicated cloud project, a real bearer session, verified owner/admin membership and an RLS-filtered read. It independently checks every returned company ID. It never exposes raw tokens or provider metadata.
- The native Connections page shows this activation registry separately from Nango account authorisation, only when a real cloud registry is configured. Its labels distinguish Not activated, Read-only, and Approved writes; these states are not inferred from a successful sign-in.
- server/integrations/policy.ts is a deterministic, deny-by-default policy decision module for a future protected Nango tool/action gateway. It checks organisation, account authorisation, verified read, ownership, explicit user/app/agent grants and per-operation human approvals. Financial operations require a bounded integer amount with approval. All AI employee writes require explicit, unexpired human approval.
- These controls DO NOT execute remote operations. A future execution endpoint must supply authenticated principals and trusted database grants, call the policy immediately before dispatch, and persist an audit receipt of the external outcome.
- The Connect UI now provides a human-clicked secure sign-in link when the popup is blocked; it does not silently abandon setup.

Tests added: tests/unit/nango-cloud-identity.test.ts, nango-registry.test.ts,
nango-policy.test.ts, nango-gateway.test.ts and nango-webhook.test.ts.
A viewport-specific regression also covers notification click-through.

This is an implementable foundation, NOT proof of a deployed Arlovi Cloud
database, working customer logins, activated syncs, AI agent executions or
successful external provider calls. Keep these features disabled until
cloud authentication, provider accounts and server-side execution/worker
infrastructure are configured and independently tested.
