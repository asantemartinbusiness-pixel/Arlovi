# ADMIN · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-ADMIN-001 · Organization Settings  
Route `/o/:org/admin/organization` · sample `nl-policies-001` · archetype settings · collection `policies`  
Tabs: Profile, Branding, Business hours, Regional  
Actions: Edit profile, configure entity, verify domain  
Edge: Org legal identity changes require higher trust checks

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Identity form | modal | `src/applications/admin/index.tsx:86` |  |  |  |
| region change impact | drawer | `src/applications/admin/index.tsx:87` |  |  |  |
| domain verify | modal | `src/applications/admin/index.tsx:88` |  |  |  |

## ARL-ADMIN-002 · Members & Invitations  
Route `/o/:org/admin/members` · sample `nl-members-001` · archetype table · collection `members`  
Tabs: Members, Invitations, Teams, External  
Actions: Invite, suspend, role change, revoke, export  
Edge: Offboard revokes sessions and relevant grants

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Invite wizard | modal | `src/applications/admin/index.tsx:109` |  |  |  |
| role impact | drawer | `src/applications/admin/index.tsx:110` | GC |  |  |
| revoke confirmation | modal | `src/applications/admin/index.tsx:111` |  |  |  |

## ARL-ADMIN-003 · Roles & Permissions  
Route `/o/:org/admin/roles` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Roles, Policies, Effective access, Exceptions  
Actions: Create role, compare, simulate, publish  
Edge: Deny precedence and tenant boundaries enforced server-side

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Policy editor | modal | `src/applications/admin/index.tsx:132` | F |  |  |
| effective rights | drawer | `src/applications/admin/index.tsx:133` |  |  |  |
| impact review | modal | `src/applications/admin/index.tsx:134` |  |  |  |

## ARL-ADMIN-004 · Autonomy Centre  
Route `/o/:org/admin/autonomy` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Company, Departments, Agents, Missions, History  
Actions: Set grant, cap action, suspend, test permission  
Edge: No unrestricted global autonomy toggle bypasses guardrails

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Grant editor | modal | `src/applications/admin/index.tsx:154` |  |  |  |
| action simulator | drawer | `src/applications/admin/index.tsx:155` |  |  |  |
| revoke confirmation | modal | `src/applications/admin/index.tsx:156` |  |  |  |

## ARL-ADMIN-005 · Budget & AI Usage  
Route `/o/:org/admin/budgets` · sample `nl-policies-001` · archetype report · collection `policies`  
Tabs: AI, Missions, Providers, Limits, Invoices  
Actions: Set quota, approve increase, allocate, inspect  
Edge: Reservations atomic; provider spend lag disclosed

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Spend limit | modal | `src/applications/admin/index.tsx:175` |  |  |  |
| cost allocation | modal | `src/applications/admin/index.tsx:176` |  |  |  |
| budget warning | drawer | `src/applications/admin/index.tsx:177` |  |  |  |

## ARL-ADMIN-006 · Security & Sessions  
Route `/o/:org/admin/security` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Authentication, Sessions, Devices, Threats  
Actions: Configure SSO, revoke, require MFA, export  
Edge: Sensitive changes require step-up auth and audit

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Provider setup | modal | `src/applications/admin/index.tsx:196` |  |  |  |
| emergency revoke | modal | `src/applications/admin/index.tsx:197` | GC |  |  |
| security review | modal | `src/applications/admin/index.tsx:198` |  |  |  |

## ARL-ADMIN-007 · Audit Trail  
Route `/o/:org/admin/audit` · sample `nl-timelineEvents-001` · archetype table · collection `timelineEvents`  
Tabs: All, Access, Data, Financial, AI  
Actions: Filter, inspect receipt, export, retention  
Edge: Audit records append-only and tamper-resistant

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Audit detail | drawer | `src/applications/admin/index.tsx:217` |  |  |  |
| export authorization | modal | `src/applications/admin/index.tsx:218` |  |  |  |
| event chain | drawer | `src/applications/admin/index.tsx:219` |  |  |  |

## ARL-ADMIN-008 · Privacy & Data Controls  
Route `/o/:org/admin/privacy` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Retention, Consent, Requests, Processing, Residency  
Actions: Review request, export, restrict, delete where lawful  
Edge: Legal holds and statutory retention honored

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Data request | drawer | `src/applications/admin/index.tsx:240` |  |  |  |
| deletion impact | modal | `src/applications/admin/index.tsx:241` |  |  |  |
| jurisdiction disclaimer | modal | `src/applications/admin/index.tsx:242` |  |  |  |

## ARL-ADMIN-009 · Billing & Subscription  
Route `/o/:org/admin/billing` · sample `nl-policies-001` · archetype table · collection `policies`  
Tabs: Overview, Invoices, Usage, Payment  
Actions: Manage subscription, pay, download invoice, update method  
Edge: Payment methods handled by compliant provider

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Checkout | modal | `src/applications/admin/index.tsx:265` |  |  |  |
| cancellation | modal | `src/applications/admin/index.tsx:266` |  |  |  |
| billing support | modal | `src/applications/admin/index.tsx:267` |  |  |  |

## ARL-ADMIN-010 · Backups & Recovery  
Route `/o/:org/admin/recovery` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Backups, Exports, Restores, Failures  
Actions: Request backup, restore test, export, archive org  
Edge: Restore never overwrites newer changes without approved plan

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Restore impact | modal | `src/applications/admin/index.tsx:289` |  |  |  |
| retention check | modal | `src/applications/admin/index.tsx:290` |  |  |  |
| disaster drill | drawer | `src/applications/admin/index.tsx:291` |  |  |  |

## ARL-ADMIN-011 · Environment & Developer Access  
Route `/o/:org/admin/developer` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: API, Webhooks, Sandbox, Logs  
Actions: Issue key, rotate, revoke, test webhook  
Edge: Secrets shown once and not copied into AI context

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Key creation | modal | `src/applications/admin/index.tsx:313` |  |  |  |
| scope limits | drawer | `src/applications/admin/index.tsx:314` |  |  |  |
| callback tester | modal | `src/applications/admin/index.tsx:315` |  |  |  |
