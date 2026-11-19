# MARKET · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-MARKET-001 · Marketing Overview  
Route `/o/:org/market/home` · sample `nl-campaigns-001` · archetype dashboard · collection `campaigns`  
Tabs: Overview, Performance, Calendar, Opportunities  
Actions: Create campaign, inspect KPI, ask Marketing, view alerts  
Edge: Attribution uncertainty clearly displayed

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric source | drawer | `src/applications/market/index.tsx:86` |  |  |  |
| campaign wizard | modal | `src/applications/market/index.tsx:87` | F |  |  |
| budget inspector | drawer | `src/applications/market/index.tsx:88` |  |  |  |

## ARL-MARKET-002 · Campaign Library  
Route `/o/:org/market/campaigns` · sample `nl-campaigns-001` · archetype directory · collection `campaigns`  
Tabs: All, Draft, Approval, Active, Completed  
Actions: Create, duplicate, archive, compare  
Edge: Copy must not duplicate live external spend authorization

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Campaign template | modal | `src/applications/market/index.tsx:110` | F |  |  |
| plan approval | modal | `src/applications/market/index.tsx:111` | F |  |  |
| duplicate rules | modal | `src/applications/market/index.tsx:112` |  |  |  |

## ARL-MARKET-003 · Campaign Detail  
Route `/o/:org/market/campaigns/:id` · sample `nl-campaigns-001` · archetype dashboard · collection `campaigns`  
Tabs: Overview, Plan, Assets, Channels, Results, Activity  
Actions: Edit draft, approve, launch, pause, request review  
Edge: Stop ad spending only within real provider control limits

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Creative preview | drawer | `src/applications/market/index.tsx:143` |  |  |  |
| launch approval | modal | `src/applications/market/index.tsx:144` | F |  |  |
| pause consequence | modal | `src/applications/market/index.tsx:145` |  |  |  |

## ARL-MARKET-004 · Content Calendar  
Route `/o/:org/market/calendar` · sample `nl-socialPosts-001` · archetype calendar · collection `socialPosts`  
Tabs: Month, Week, List, By channel  
Actions: Drag schedule, preview, edit caption, publish  
Edge: Provider-supported media and API restrictions validated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Post editor | modal | `src/applications/market/index.tsx:171` | F |  |  |
| asset picker | modal | `src/applications/market/index.tsx:172` |  |  |  |
| publish preview | drawer | `src/applications/market/index.tsx:173` |  |  |  |

## ARL-MARKET-005 · Social Publishing  
Route `/o/:org/market/social` · sample `nl-socialPosts-001` · archetype table · collection `socialPosts`  
Tabs: Drafts, Schedule, Published, Failed  
Actions: Connect account, create post, schedule, retry safely  
Edge: Unknown publication state blocks blind duplicate retries

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Account authorization | modal | `src/applications/market/index.tsx:195` | F |  |  |
| post composer | drawer | `src/applications/market/index.tsx:196` | F |  |  |
| delivery receipt | modal | `src/applications/market/index.tsx:197` |  |  |  |

## ARL-MARKET-006 · Email Campaigns  
Route `/o/:org/market/email` · sample `nl-campaigns-001` · archetype editor · collection `campaigns`  
Tabs: Campaigns, Templates, Audiences, Reports  
Actions: Build email, test send, approve recipients, schedule  
Edge: Unsubscribe, permission and large-send safeguards required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Audience preview | drawer | `src/applications/market/index.tsx:220` |  |  |  |
| send review | modal | `src/applications/market/index.tsx:221` | F |  |  |
| suppression check | drawer | `src/applications/market/index.tsx:222` |  |  |  |

## ARL-MARKET-007 · Audience Segments  
Route `/o/:org/market/audiences` · sample `nl-audiences-001` · archetype table · collection `audiences`  
Tabs: Segments, Contacts, Exclusions, Sources  
Actions: Build segment, preview, export, set exclusion  
Edge: No outreach to suppressed or ineligible contacts

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Segment builder | drawer | `src/applications/market/index.tsx:244` | F |  |  |
| consent inspector | drawer | `src/applications/market/index.tsx:245` |  |  |  |
| export permission | modal | `src/applications/market/index.tsx:246` |  |  |  |

## ARL-MARKET-008 · Advertising  
Route `/o/:org/market/ads` · sample `nl-campaigns-001` · archetype dashboard · collection `campaigns`  
Tabs: Accounts, Campaigns, Creative, Spend, Exceptions  
Actions: Build draft, change allocation, pause, reconcile  
Edge: Asynchronous provider spend needs reserve plus buffer

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Ad preview | drawer | `src/applications/market/index.tsx:267` |  |  |  |
| spend approval | modal | `src/applications/market/index.tsx:268` | F |  |  |
| campaign diagnostics | drawer | `src/applications/market/index.tsx:269` |  |  |  |

## ARL-MARKET-009 · SEO & Content  
Route `/o/:org/market/seo` · sample `nl-sites-001` · archetype report · collection `sites`  
Tabs: Audit, Content, Keywords, Technical  
Actions: Run audit, assign issue, edit metadata, publish  
Edge: SEO rankings are not promised as deterministic results

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Audit issue | modal | `src/applications/market/index.tsx:292` | F |  |  |
| page editor | modal | `src/applications/market/index.tsx:293` | F |  |  |
| technical recommendation | drawer | `src/applications/market/index.tsx:294` |  |  |  |

## ARL-MARKET-010 · Landing Pages  
Route `/o/:org/market/pages` · sample `nl-sites-001` · archetype editor · collection `sites`  
Tabs: Library, Builder, Tests, Analytics  
Actions: Create, visually edit, test, publish, revert  
Edge: Published URLs, redirects, consent and analytics verified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Page template | modal | `src/applications/market/index.tsx:316` | F |  |  |
| publish confirm | modal | `src/applications/market/index.tsx:317` |  |  |  |
| version compare | drawer | `src/applications/market/index.tsx:318` |  |  |  |

## ARL-MARKET-011 · Attribution & Analytics  
Route `/o/:org/market/analytics` · sample `nl-campaigns-001` · archetype report · collection `campaigns`  
Tabs: Channels, Funnels, Revenue, Cohorts, Models  
Actions: Filter, compare, drill down, export  
Edge: Ad privacy/consent gaps shown instead of fabricated conversions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Attribution model | modal | `src/applications/market/index.tsx:341` |  |  |  |
| source inspector | drawer | `src/applications/market/index.tsx:342` |  |  |  |
| metric notes | drawer | `src/applications/market/index.tsx:343` |  |  |  |

## ARL-MARKET-012 · Marketing Templates  
Route `/o/:org/market/templates` · sample `nl-templates-001` · archetype directory · collection `templates`  
Tabs: All, Saved, Approved, Archived  
Actions: Create, fork, review, publish  
Edge: Template change does not overwrite live published campaign

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Template editor | drawer | `src/applications/market/index.tsx:364` | F |  |  |
| approval | modal | `src/applications/market/index.tsx:365` | F |  |  |
| global update impact | drawer | `src/applications/market/index.tsx:366` |  |  |  |
