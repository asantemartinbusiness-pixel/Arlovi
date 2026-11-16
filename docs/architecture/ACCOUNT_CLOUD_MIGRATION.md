# Arlovi Accounts and Cloud Migration Authority

Status: staged, not connected (16 November 2026).

## Findings
- Arlovi is presently a Vite/React browser-local workspace with Dexie/IndexedDB records and local role views.
- Vercel has no authentication or cloud-storage configuration for Arlovi.
- Existing connected Supabase projects belong to Hilis and Hilis QA. Never reuse or modify them for Arlovi.
- Existing invitations are drafts, not delivered email or access grants.

## Dedicated backend activation checklist
1. Create a separate Arlovi project in the user's chosen Supabase organisation and region. Obtain cost confirmation where required. Do not infer the organisation or residency preferences.
2. Review the staged schema at infra/supabase/arlovi_cloud_schema.sql, run database security advisors, RLS tests and internal code review. It has not been applied to any database.
3. Integrate the official Supabase JS SDK with pinned dependency and committed lockfile. Supply only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the public client. Never expose service secrets.
4. Implement actual sign up, email verification, login, password recovery, session refresh, sign out, expired-token recovery, and account removal.
5. Never trust the existing local role picker or editable JWT user metadata for authorization; use server-backed membership and RLS. Require authenticated owner approval to issue and accept invitations.
6. Import local archives only after authenticated destination ownership verification, checksum verification, dry-run conflict and ID mapping, explicit approval, and idempotent transaction semantics.
7. Remap project, department, document, resource folder, task, approval and nested reference IDs. Preserve document content and revision history.
8. Activate remote read/write only after import reconciliation, isolation tests, concurrency control, offline recovery, rollback and cross-device QA.
9. Replace descriptive user-submitted audit events with canonical, trusted server audit triggers/RPC before treating an audit as authoritative.
10. Execute adversarial tests for anonymous access, cross-tenant data reads, foreign record IDs, revoked membership, viewer writes, repeated imports and double edits.

## Current verified behavior
- Account & data readiness is accessible inside each company workspace.
- It inventories browser-local company records and audit events.
- It exports one company archive with a SHA-256 checksum without uploading it.
- It does not install cloud infrastructure, send invitations, create logins, sync data or connect AI models.
- Local data remains unchanged and the existing Arlovi design system remains the source of truth.

References: https://supabase.com/docs/guides/auth/quickstarts/react ; https://supabase.com/docs/guides/database/postgres/row-level-security