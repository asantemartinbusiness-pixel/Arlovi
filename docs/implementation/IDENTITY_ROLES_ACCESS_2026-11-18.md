# Arlovi Identity, Roles & Access — implementation contract

**18 November 2026** — Full product model, client-side exploration and verification guide.

## Live code in this branch

- `src/platform/accessModel.ts` defines role templates and explicit, deny-first resource grants.
- All 35 applications and 316 registered screens are included in the generated application/screen access inventory. Sensitive screen flags call out especially private operations for design and review.
- Administration → Roles & Permissions now displays a role-template explorer, an application-category matrix, a page inventory and a permission decision simulator. Existing six client-side role views, access requests and published-role workflow remain unchanged.
- `tests/unit/access-model.test.ts` covers catalogue breadth, role-template consistency, multi-company isolation, department/team scopes, explicit denial, confidential-resource grants, expiry and approval decisions.

**This branch does not implement authenticated backend enforcement.** The current repository runs as a browser-local Vite application backed by IndexedDB, uses simulated actor/role selections and lacks a secure multi-user authorisation API. Changing client-only access logic cannot safely protect confidential HR, Finance, Legal, Communications or IT data; therefore the new model is advisory and does not silently change access to real business resources.

## Target authorisation platform

Recommended enforcement dimensions:
1. Authenticated human/guest/AI/service principal.
2. Active, verified organisation membership.
3. Entitlement to an application and right to discover/open its pages.
4. Action-level grant, record ownership or team/department/business-unit relationship.
5. Classification threshold and purpose-specific field redactions.
6. Time limits, amount limits, approval requirements and segregation of duties.
7. Data-owner policies and mandatory denials, taking precedence over broad role allow rules.

### Durable server resources

- `identities`: authenticated principals with status, lifecycle and service identity type.
- `organizations`, `memberships`, `departments`, `teams`, `business_units`: tenant and workforce relationships.
- `role_templates`, `organization_roles`, `role_bindings`: templates, custom roles and assignments.
- `permissions`, `permission_grants`, `permission_denials`: explicit allow and deny with scope, time and classification.
- `resource_relationships`: named owner/assignee/team/member/client/vendor connections.
- `resource_classifications`, `field_policies`: protected fields and source-record confidentiality.
- `approval_policies`, `approval_requests`, `delegations`: approval thresholds, escalation and time-bound grants.
- `authorization_decisions` and `authorization_audit`: policy version, principal, resource, action, outcome and trace.
- `agent_grants`: agent identity, delegator, allowed tools/resources, budget, time limits and human oversight.

### Mandatory server enforcement

The backend must authenticate the real principal, then evaluate every API, document, file, search, export, report, notification preview, AI retrieval and tool invocation before returning data. Do not send unauthorised data to the browser at all. Do not rely on user-supplied tenant IDs, job titles, client role selectors or hidden UI controls.

Database row-level security must enforce organisation membership and scoped record visibility; storage object access must apply equivalent rules. Privileged service code must not bypass organisation or sensitive-field checks. Sensitive operations require authenticated step-up and, when applicable, independent approval.

The authorisation service should return an explainable allow/deny/approval response and a policy revision identifier, with idempotent auditable decisions. Explicit deny takes precedence over every grant; grants must be revoked immediately on leave/suspension and fail closed if the policy service is unavailable. Never allow AI employees to modify their own grants or approve their own financial actions.

### Frontend integration contract

`GET /access/me?org=:orgId`: authorised application, page and feature scopes (never the full organisation's raw permission table).

`POST /access/check`: structured resource/action/subject decision (subject must be derived from the authenticated session, never trusted from the request body).

`GET /access/explain?resourceId=...&action=...`: explanation for approved administrative reviewers.

`POST /access/requests`, `POST /access/requests/:id/decision`, `POST /access/grants/:id/revoke`: auditable access workflows, protected from self-approval and high-risk privilege escalation.

All existing calls to `canOpen`, `can` and tab/action visibility become presentation projections of the server-authorised capabilities, while server-side enforcement remains authoritative.

### Application-specific sensitive defaults

- **Finance:** bank feeds, reconciliation, journal posting, refunds, company bank details and approval amounts.
- **People:** salary/payroll, medical/absence, disciplinary and recruiting files.
- **Legal:** privileged matters, investigations, contracts and evidence.
- **Communications:** private messages, shared inbox membership, sender aliases, export and mailbox configuration.
- **Intelligence:** model routing, agent budget, retrieval rights, mission autonomy and external AI actions.
- **Growth:** customer exports, advertising budgets, price overrides and refunds.
- **Studio:** asset sharing, licences, project ownership and external publication.
- **Platform:** credentials, DNS, environment changes, integrations, database and production deployments.

For every other screen, use classification and normal record policies rather than broad application-wide permission.

### Acceptance tests prior to calling the access service production-ready

- Signed-in users from different organisations cannot obtain one another's records by guessing URLs or IDs.
- Two employees in the same department see different records when assignments or sharing differs.
- An executive has appropriate aggregated reports without receiving private HR/legal fields.
- HR/payroll and financial approvals are independently scoped, with configurable amount limits.
- No private data leaks through search, analytics, attachments, notifications, exports or AI answers.
- A contractor's expired or revoked grant takes effect across sessions and devices.
- AI employees cannot self-elevate and every tool call is checked against their delegated scope.
- Direct API calls and database requests are refused even when the UI is bypassed.
- Changes are reflected across all 35 applications and 316 screen contracts; all existing legacy test suites remain green.
- Keyboard, screen-reader, mobile and zoom experiences remain usable.

**Release rule:** A successful frontend build proves presentation compilation, not secure multi-user authorisation. Do not describe the product as having a fully operational permission backend until these tests pass against a real service.
