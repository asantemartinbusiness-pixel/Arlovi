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
