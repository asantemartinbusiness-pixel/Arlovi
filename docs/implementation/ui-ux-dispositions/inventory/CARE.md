# CARE · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-CARE-001 · Service Overview  
Route `/o/:org/care/home` · sample `nl-tickets-001` · archetype dashboard · collection `tickets`  
Tabs: Overview, Queues, Quality, Trends  
Actions: Open case, reassign, inspect metric, manage staffing  
Edge: Sentiment inference not treated as certain customer fact

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Queue rules | drawer | `src/applications/care/index.tsx:823` |  |  |  |
| SLA inspector | drawer | `src/applications/care/index.tsx:824` | G |  |  |
| service report | modal | `src/applications/care/index.tsx:825` |  |  |  |

## ARL-CARE-002 · Omnichannel Inbox  
Route `/o/:org/care/inbox` · sample `nl-tickets-001` · archetype chat · collection `tickets`  
Tabs: Unassigned, Mine, Team, Waiting, Closed  
Actions: Respond, assign, tag, escalate, link record  
Edge: No silent automated disclosure of sensitive customer information

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Customer inspector | drawer | `src/applications/care/index.tsx:849` |  |  |  |
| canned reply | drawer | `src/applications/care/index.tsx:850` |  |  |  |
| escalation | modal | `src/applications/care/index.tsx:851` | F |  |  |

## ARL-CARE-003 · Ticket List  
Route `/o/:org/care/tickets` · sample `nl-tickets-001` · archetype table · collection `tickets`  
Tabs: All, Open, Pending, Resolved, Archived  
Actions: Create ticket, bulk route, filter, export  
Edge: Bulk close requires preview, appropriate permissions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Ticket create | modal | `src/applications/care/index.tsx:871` | F |  |  |
| bulk assignment | modal | `src/applications/care/index.tsx:872` | G |  |  |
| priority change | modal | `src/applications/care/index.tsx:873` | F |  |  |

## ARL-CARE-004 · Ticket Detail  
Route `/o/:org/care/tickets/:id` · sample `nl-tickets-001` · archetype record · collection `tickets`  
Tabs: Overview, Conversation, Tasks, History, Audit  
Actions: Reply, add note, reopen, assign specialist  
Edge: Reopening must preserve prior resolution and audit data

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Response composer | modal | `src/applications/care/index.tsx:898` | F |  |  |
| internal note | modal | `src/applications/care/index.tsx:899` | F |  |  |
| refund request | modal | `src/applications/care/index.tsx:900` | F |  |  |

## ARL-CARE-005 · Customer Context  
Route `/o/:org/care/customers/:id` · sample `nl-contacts-001` · archetype record · collection `contacts`  
Tabs: Overview, Cases, Orders, Communications  
Actions: Inspect, schedule, update permitted field  
Edge: Cross-department restricted records redacted

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Customer profile edit | modal | `src/applications/care/index.tsx:919` | F |  |  |
| consent inspector | drawer | `src/applications/care/index.tsx:920` |  |  |  |
| identity verification | modal | `src/applications/care/index.tsx:921` |  |  |  |

## ARL-CARE-006 · Knowledge Base  
Route `/o/:org/care/knowledge` · sample `nl-articles-001` · archetype directory · collection `articles`  
Tabs: Internal, Public, Draft, Retired  
Actions: Write article, update, publish, test answer  
Edge: Old published instructions not silently overwritten

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Rich editor | modal | `src/applications/care/index.tsx:939` | F |  |  |
| publish review | modal | `src/applications/care/index.tsx:940` |  |  |  |
| relevance test | drawer | `src/applications/care/index.tsx:941` |  |  |  |

## ARL-CARE-007 · Macros & Automation  
Route `/o/:org/care/automation` · sample `nl-macros-001` · archetype builder · collection `macros`  
Tabs: Macros, Rules, Runs, Exceptions  
Actions: Create macro, simulate, activate, review  
Edge: Automated response disabled for prohibited topics

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Macro editor | modal | `src/applications/care/index.tsx:962` | F |  |  |
| audience preview | drawer | `src/applications/care/index.tsx:963` |  |  |  |
| escalation rule | modal | `src/applications/care/index.tsx:964` |  |  |  |

## ARL-CARE-008 · Service SLAs  
Route `/o/:org/care/slas` · sample `nl-slas-001` · archetype admin · collection `slas`  
Tabs: Policies, Breaches, Exceptions, History  
Actions: Edit policy, reassign, report, acknowledge  
Edge: Clock handles locale, holiday and suspended intervals

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| SLA form | modal | `src/applications/care/index.tsx:986` | F |  |  |
| schedule exception | modal | `src/applications/care/index.tsx:987` |  |  |  |
| policy impact | drawer | `src/applications/care/index.tsx:988` |  |  |  |

## ARL-CARE-009 · Quality & Satisfaction  
Route `/o/:org/care/quality` · sample `nl-tickets-001` · archetype report · collection `tickets`  
Tabs: Surveys, Audits, Coaching, Reports  
Actions: Review, annotate, assign coaching, export  
Edge: Low scores not used to make unreviewed employment decisions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| QA scorecard | modal | `src/applications/care/index.tsx:1009` | F |  |  |
| survey builder | modal | `src/applications/care/index.tsx:1010` | F |  |  |
| case replay | drawer | `src/applications/care/index.tsx:1011` |  |  |  |
