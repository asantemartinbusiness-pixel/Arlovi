# Arlovi Identity, Roles & Access — implementation contract
**Date:** 18 November 2026
**Status:** Frontend role previews, access policy engine, page-level navigation guards and tests have been implemented on the designated PR. Authenticated backend authorisation is **NOT deployed**.

## Source-of-truth constraints

The current application is a Vite client with local IndexedDB records and a locally selectable `owner|finance|sales|people|member|client` role view. It does not possess a trusted authenticated user ID, a server-side permission store, or an Arlovi-owned database service. The connected Supabase account currently shows only other products' databases; do not use them for Arlovi or mix tenants. A role selector, actor display name or JavaScript `can()` call is **not a security control**.

Nothing in this PR claims that confidential company information is protected when real employees share untrusted clients. The new `src/platform/accessModel.ts` is a pure policy contract suitable for a trusted server to consume in future; it must not be treated as server authorisation until trusted identity, resource attributes, RLS and enforcement are connected.

## Implemented visible behaviour

- Thirteen recommended organisational role templates, separate from six existing browser-local role views. Owner, Managing Director, Executive, Organisation Administrator, Department Head, Team Manager, Employee, Limited Contributor, Contractor, Client, Supplier, Auditor and AI Agent.
- Administration → Roles & Permissions → Effective access now displays role templates, application categories, all 35 native apps and all 316 screen contracts, with searchable filters and a selected-application inspector. Current role behaviour and proposed template suggestions are labelled distinctly.
- Per-screen *presentation* requirements are described in `accessInventory.ts`. Sensitive and restricted page hints are curated for HR/Payroll, Legal, Admin, private Communications, Bank, Integration and IT pages. Classification of *actual records and fields* is not inferred from a screen title.
- Native navigation, global command search and speculative prefetch omit pages blocked by the existing local role capability map. A restricted deep link returns a safe explanation before the frontend tries to resolve its record ID.
- `accessModel.ts` implements a fail-closed, deny-overrides-allow evaluation contract with tenant separation, explicit principals, role/user grants, scope, data classification, expiry, human/agent distinction and approval/financial-limit results.
- Unit tests assert app/screen inventory coverage, classification, denial, tenant isolation, explicit-resource scopes, spend limits, expiration and AI agent grants. Browser test specifications cover the access explorer and blocked routes.

## Permission architecture

Do NOT conflate a title with authority. Effective permission = verified membership + role grants + explicit user grants + resource relationships + classification + action conditions − explicit denies. Grants should use (actor, organisation, application, screen, resource, action, scope, conditions); the source of each decision should be auditable. Missing policies deny access. Explicit deny wins. Administrative rights do not automatically reveal payroll, medical notes, legal privilege or credentials.

Users may hold multiple roles per organisation, with distinct access in each company. External contacts can be invited to named projects/records. AI workers must have separately authenticated service identities, explicitly approved tools, data scopes and human owners.

### Required backend objects (not yet provisioned)

- `users` backed by verified identity and sessions; never authorise from editable profile data
- `organisations`, `legal_entities`, `memberships`, `departments`, `teams`
- `roles`, `role_permissions`, `user_role_assignments`, `explicit_denies`
- `access_grants`, `resource_relationships`, `data_classifications`, `permission_versions`
- `access_requests`, `approval_policies`, `delegations`, `access_reviews`, `access_audit`
- `agent_identities`, `agent_tool_grants`, `agent_execution_limits` and per-action receipts

All tenant data tables must have tenant-scoped backend authorisation, row-level access, field redaction and appropriate storage-file policies. A database-level service identity should not be exposed in the browser. Restrict audit endpoints, role changes and signing-key operations; never let an employee approve their own elevation.

### Required API operations (not yet implemented)

- `GET /api/me/access` — actual authenticated effective permissions, company membership and policy version
- `POST /api/authorize` — server-evaluated `{app,screen,resource,action,conditions}` for sensitive actions (never trust roles/attributes from caller)
- `GET /api/roles`, `POST /api/roles`, `PUT /api/roles/:id` — manage policy with audit and independent elevation approval
- `POST /api/access-requests`, `POST /api/access-requests/:id/decide` — review against current policy version, guard grant expiry
- `POST /api/agents/:id/authorize-tool` — action-level grant for specific agent and source resource
- `GET /api/audit/access` — restricted and tamper-evident access history

Do not send the full policy snapshot to unauthorised browser users. A client may receive minimised presentation affordances, but every service operation must independently authorise on the server. API responses and generated exports must omit denied fields, including preview text, search indexes, thumbnails, counts, notifications and assistant retrieval.

### Per-screen and per-record integration

For each of the 316 registered screens, map route access, tabs, overlays, data dependencies, actions and exports to permission declarations. Record-specific queries require owner/assignee/team/department/legal entity/explicit-sharing relationships. Revalidate every mutation and high-impact action; front-end disabled buttons are usability aids only.

High-risk examples:
- Finance: separate preparing, approving, executing and reconciling funds; approval limits and self-approval prohibition
- People: self-service, manager scope, HR employment data, restricted pay/medical/disciplinary details
- Legal: case teams and privileged matter restrictions
- Communications: inbox membership, shared mailbox delegation, verified send-as identity, external-recipient rules
- Studio: document, sheet range, library and publishing permissions
- Platform: production deploy, credentials, DNS, API tokens, integration management
- AI employees: separate service identity, owner, tool-level capabilities, grant expiry, data limits, action audit

### Verification that must precede a claim of secure multi-user launch

Provision a separate Arlovi backend, run real Auth and RLS tests with at least two real human users from different organisations plus a restricted AI actor, and verify:
1. no cross-tenant data, record existence, preview, search or export leaks
2. deny wins over inherited grants, including owner and executive roles
3. revoked grants immediately invalidate sensitive operations and stale tokens
4. record ownership/team changes update access without duplicate state
5. field classifications survive copies, exports, AI retrieval and notification delivery
6. self-approval, privilege escalation, permission editing by agents and forged grants are blocked
7. accessibility, mobile/zoom, offline and application loading remain correct at all 316 screens
8. audit records are durable and server-generated
9. custom role changes are versioned and independently reviewed when they widen sensitive access

## Rollout interpretation

UI release: safe to deploy after CI build, but label as **browser-local role preview**.

Backend enforcement: **not complete**, must not be enabled by switching a frontend toggle. Never connect Arlovi identity to unrelated databases or present local changes as organisation-wide secure provisioning.
