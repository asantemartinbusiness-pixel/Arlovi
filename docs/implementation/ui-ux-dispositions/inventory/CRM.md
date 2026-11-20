# CRM · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-CRM-001 · CRM Overview  
Route `/o/:org/crm/home` · sample `nl-deals-001` · archetype dashboard · collection `deals`  
Tabs: Overview, My pipeline, Team, Forecast  
Actions: Open deal, assign follow-up, ask Sales, inspect conversion  
Edge: Revenue forecasts labeled as predictions not settled revenue

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric drilldown | drawer | `src/applications/crm/index.tsx:104` |  |  |  |
| new lead | modal | `src/applications/crm/index.tsx:105` |  |  |  |
| insight card | drawer | `src/applications/crm/index.tsx:106` |  |  |  |

## ARL-CRM-002 · Contacts  
Route `/o/:org/crm/contacts` · sample `nl-contacts-001` · archetype table · collection `contacts`  
Tabs: All, My contacts, Segments, Duplicates  
Actions: Create, merge reviewed, tag, export, open  
Edge: Email consent and suppression flags survive deduplication

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Contact form | modal | `src/applications/crm/index.tsx:130` |  |  |  |
| merge preview | drawer | `src/applications/crm/index.tsx:131` |  |  |  |
| bulk action confirmation | modal | `src/applications/crm/index.tsx:132` |  |  |  |

## ARL-CRM-003 · Contact Profile  
Route `/o/:org/crm/contacts/:id` · sample `nl-contacts-001` · archetype record · collection `contacts`  
Tabs: Overview, Timeline, Deals, Service, Files  
Actions: Message, add note, schedule, attach record  
Edge: Restricted customer notes not shown across unrelated departments

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Compose message | modal | `src/applications/crm/index.tsx:159` |  |  |  |
| activity composer | modal | `src/applications/crm/index.tsx:160` |  |  |  |
| customer merge | drawer | `src/applications/crm/index.tsx:161` |  |  |  |

## ARL-CRM-004 · Companies  
Route `/o/:org/crm/companies` · sample `nl-companies-001` · archetype table · collection `companies`  
Tabs: All, Active, Prospects, Archived  
Actions: Create account, link contact, search, export  
Edge: Company merge must preserve all source IDs and conflicts

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Account editor | modal | `src/applications/crm/index.tsx:184` |  |  |  |
| relationship inspector | drawer | `src/applications/crm/index.tsx:185` |  |  |  |
| merge preview | drawer | `src/applications/crm/index.tsx:186` | GC |  |  |

## ARL-CRM-005 · Leads & Qualification  
Route `/o/:org/crm/leads` · sample `nl-leads-001` · archetype board · collection `leads`  
Tabs: Inbox, Qualified, Disqualified, Rules  
Actions: Assign lead, qualify, convert, bulk route  
Edge: Lead routing respects owner availability and consent

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Qualification inspector | drawer | `src/applications/crm/index.tsx:208` |  |  |  |
| convert dialog | modal | `src/applications/crm/index.tsx:209` |  |  |  |
| routing rules | drawer | `src/applications/crm/index.tsx:210` |  |  |  |

## ARL-CRM-006 · Deals Pipeline  
Route `/o/:org/crm/deals` · sample `nl-deals-001` · archetype board · collection `deals`  
Tabs: Board, List, Forecast, Team  
Actions: Move stage, update amount, assign owner, create quote  
Edge: Stage automation requires validation and cannot auto-close restricted deals

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Deal drawer | drawer | `src/applications/crm/index.tsx:236` |  |  |  |
| stage change validation | modal | `src/applications/crm/index.tsx:237` |  |  |  |
| lost reason | modal | `src/applications/crm/index.tsx:238` |  |  |  |

## ARL-CRM-007 · Deal Detail  
Route `/o/:org/crm/deals/:id` · sample `nl-deals-001` · archetype record · collection `deals`  
Tabs: Overview, Activity, Products, Documents, Team  
Actions: Update stage, create proposal, request approval, close  
Edge: Deal loss or win writes auditable state and downstream events

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Quote builder | drawer | `src/applications/crm/index.tsx:266` |  |  |  |
| collaborator picker | drawer | `src/applications/crm/index.tsx:267` |  |  |  |
| closure confirmation | modal | `src/applications/crm/index.tsx:268` | GC |  |  |

## ARL-CRM-008 · Quotes & Proposals  
Route `/o/:org/crm/quotes` · sample `nl-quotes-001` · archetype directory · collection `quotes`  
Tabs: Draft, Review, Sent, Accepted, Expired  
Actions: Create, duplicate, edit, approve, send  
Edge: Expired pricing cannot be sent as currently valid

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Quote editor | drawer | `src/applications/crm/index.tsx:292` |  |  |  |
| pricing policy | drawer | `src/applications/crm/index.tsx:293` |  |  |  |
| send preview | modal | `src/applications/crm/index.tsx:294` |  |  |  |

## ARL-CRM-009 · Activities & Scheduling  
Route `/o/:org/crm/activities` · sample `nl-activities-001` · archetype calendar · collection `activities`  
Tabs: My calendar, All activity, Follow-ups, History  
Actions: Log call, schedule meeting, add reminder, complete task  
Edge: Meeting invite not claimed sent until provider or native calendar confirms

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Activity entry | modal | `src/applications/crm/index.tsx:319` |  |  |  |
| calendar conflict | drawer | `src/applications/crm/index.tsx:320` |  |  |  |
| meeting composer | modal | `src/applications/crm/index.tsx:321` |  |  |  |

## ARL-CRM-010 · Sales Forecasts  
Route `/o/:org/crm/forecasts` · sample `nl-deals-001` · archetype report · collection `deals`  
Tabs: Current, Scenarios, History, Methodology  
Actions: Adjust assumptions, drill down, export, review  
Edge: Double counting multi-product opportunities prevented

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Forecast model | drawer | `src/applications/crm/index.tsx:348` |  |  |  |
| confidence explanation | drawer | `src/applications/crm/index.tsx:349` |  |  |  |
| override reason | modal | `src/applications/crm/index.tsx:350` |  |  |  |

## ARL-CRM-011 · Sales Automation  
Route `/o/:org/crm/automation` · sample `nl-workflows-001` · archetype builder · collection `workflows`  
Tabs: Workflows, Templates, Runs, Failures  
Actions: Create rule, simulate, activate, stop  
Edge: No automated outreach to suppressed/unconsenting contacts

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Workflow designer | drawer | `src/applications/crm/index.tsx:377` |  |  |  |
| test data | drawer | `src/applications/crm/index.tsx:378` |  |  |  |
| activation approval | modal | `src/applications/crm/index.tsx:379` |  |  |  |
