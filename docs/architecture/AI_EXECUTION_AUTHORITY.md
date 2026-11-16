# Arlovi AI Execution Authority — Security and Runtime Contract

## Current truth
Arlovi is a Vite client application using browser-local Dexie records. It has no authenticated multi-user server authority, cloud persistence, model credentials, hosted job workers, or trusted provider receipts. The AI execution control panel in this change intentionally always returns blocked. The UI must never claim that a provider ran.

The connected Supabase projects inspected on 16 November 2026 belong to Hilis, not Arlovi. Do not reuse them for Arlovi.

## Server-side execution acceptance contract

To enable production model execution, implement **all** of the following, with no client-only bypass:

1. **Identity + tenancy**: server-validated sessions, real organisation membership and member roles; independently validate workspace membership for each task, agent, assignment, document and result. Never rely on the client's role view or organisation string. Fail closed on unknown or stale membership.
2. **Durable storage**: a distinct Arlovi backend with tenant-scoped tables for organisations, memberships, tasks, agent contracts, assignments, execution requests, attempts, results, approvals, provider usage, budget reservations and audit log. Foreign keys must preserve same-tenant relationships. Apply RLS and database-side checks; include a new idempotency key unique per assignment/run version.
3. **Execution API**: authenticated POST run with exact assignment id + expected revision + idempotency key. Validate an approved agent contract, task status, actual read/tool scopes, model allowlist, immutable inputs and budget headroom. Never accept a client-submitted 'success', provider cost or trusted output.
4. **Model connector**: secrets strictly on the server; configured per-tenant policy and trusted model/provider registry. No arbitrary client-supplied provider URL, tools, key, or system prompt capable of escaping its scope.
5. **Queue + worker**: durable enqueue with an atomic spend reservation; lease/heartbeat, concurrency limits per tenant and agent, deadline, timeout, retry classification and explicit unknown-side-effect reconciliation. Do not retry external side-effects automatically without idempotency assurances.
6. **Provider receipts**: only the worker can write verified model results and usage; record provider request id, model, observed tokens, billed amount/currency, tool calls, redacted trace, source revisions, start/finish time and integrity metadata.
7. **Human approval gates**: all outbound communication, publishing, money movement and privileged or destructive actions require separately authorised server-side approval. Expired, revoked and superseded approvals cannot execute.
8. **Budget enforcement**: tenant, agent, task and period budgets and spend reservation before dispatch; price source versioned and exact currency. Unknown pricing means blocked; reconcile actual usage and release unused reservations atomically. Never infer zero cost from missing telemetry.
9. **Observability**: immutable tenant-scoped execution events and retries, operator controls for pause/cancel, redacted logs, circuit breakers, rate limiting and alerts. Claim 'completed' only after the canonical result and receipt are durable.
10. **Verification**: unit tests for every guard; multi-tenant adversarial tests; API authn/authz/IDOR tests; replay and idempotency tests; live sandbox model call with precise metering; killed-worker recovery; double-submit; stale permissions; budget contention; mobile browser QA.

## State machine
`awaiting_provider -> queued -> leased -> running -> awaiting_approval -> completed`

Additional paths: `blocked`, `cancelled`, `failed_retryable`, `failed_terminal`, `unknown_side_effect`. A state transition must be performed by the trusted server using compare-and-swap/revision checks and an audit event in the same transaction. Browser-local records are not a source of authority for server execution.

## Current implementation
- `src/platform/agentWork.ts`: browser-local agent assignments and source briefs
- `src/platform/executionControl.ts`: fail-closed preflight, blocked run request records, auditable dismissal
- `src/app/ExecutionControl.tsx`: user-visible blockers and no-false-success status
- `e2e/execution-preflight.spec.ts`: browser regression contract (must run in a browser CI job)

No API handler, provider key, hosted worker or automated runtime was enabled by this change.
