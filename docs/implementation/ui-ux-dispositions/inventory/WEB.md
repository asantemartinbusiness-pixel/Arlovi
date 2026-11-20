# WEB · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-WEB-001 · Website Directory  
Route `/o/:org/web/sites` · sample `nl-sites-001` · archetype directory · collection `sites`  
Tabs: All, Draft, Published, Archived  
Actions: Create, duplicate, open, archive, inspect health  
Edge: Unknown deployment state not shown as live

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Site setup | modal | `src/applications/web/index.tsx:231` | F |  |  |
| domain attach | modal | `src/applications/web/index.tsx:236` | F |  |  |
| publish status | drawer | `src/applications/web/index.tsx:241` |  |  |  |

## ARL-WEB-002 · Site Dashboard  
Route `/o/:org/web/sites/:id` · sample `nl-sites-001` · archetype dashboard · collection `sites`  
Tabs: Overview, Pages, Content, Analytics, Settings  
Actions: Open editor, preview, view logs, deploy  
Edge: Analytics consent and source gaps marked

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Deploy inspector | drawer | `src/applications/web/index.tsx:265` |  |  |  |
| domain check | modal | `src/applications/web/index.tsx:266` | F |  |  |
| site settings | modal | `src/applications/web/index.tsx:267` | F |  |  |

## ARL-WEB-003 · Visual Page Builder  
Route `/o/:org/web/sites/:id/builder` · sample `nl-sites-001` · archetype canvas · collection `sites`  
Tabs: Build, Style, Responsive, Interactions  
Actions: Drag component, edit text, resize, reorder, undo  
Edge: Visual preview reflects actual responsive browser layout

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Element inspector | drawer | `src/applications/web/index.tsx:325` |  |  |  |
| insert panel | ? | `not found` |  |  |  |
| AI edit diff | drawer | `src/applications/web/index.tsx:328` |  |  |  |

## ARL-WEB-004 · Component Library  
Route `/o/:org/web/sites/:id/components` · sample `nl-sites-001` · archetype directory · collection `sites`  
Tabs: Local, Shared, Variants, Usage  
Actions: Create, import, update, publish  
Edge: Global edit preview before broad replacement

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Component property | modal | `src/applications/web/index.tsx:348` | F |  |  |
| breaking change | ? | `not found` |  |  |  |
| token update | drawer | `src/applications/web/index.tsx:354` |  |  |  |

## ARL-WEB-005 · CMS Editor  
Route `/o/:org/web/sites/:id/cms` · sample `nl-sites-001` · archetype table · collection `sites`  
Tabs: Collections, Entries, Relations, Import  
Actions: Create collection, edit entry, bulk publish, import  
Edge: Schema migration must preserve published content

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Schema editor | modal | `src/applications/web/index.tsx:374` | F |  |  |
| entry detail | drawer | `src/applications/web/index.tsx:379` | F |  |  |
| migration preview | modal | `src/applications/web/index.tsx:384` | F |  |  |

## ARL-WEB-006 · Site Navigation  
Route `/o/:org/web/sites/:id/navigation` · sample `nl-sites-001` · archetype editor · collection `sites`  
Tabs: Header, Footer, Mobile, Redirects  
Actions: Reorder, add route, preview, publish  
Edge: Deleting route surfaces incoming links and SEO implications

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Link picker | modal | `src/applications/web/index.tsx:404` | F |  |  |
| redirect rules | modal | `src/applications/web/index.tsx:409` | F |  |  |
| broken link scan | drawer | `src/applications/web/index.tsx:414` |  |  |  |

## ARL-WEB-007 · Forms & Integrations  
Route `/o/:org/web/sites/:id/forms` · sample `nl-sites-001` · archetype builder · collection `sites`  
Tabs: Forms, Fields, Submissions, Routing  
Actions: Edit form, test, set webhook, publish  
Edge: Form submission never exposed to wrong tenant

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Field editor | modal | `src/applications/web/index.tsx:436` | F |  |  |
| consent inspector | drawer | `src/applications/web/index.tsx:441` |  |  |  |
| submission routing | modal | `src/applications/web/index.tsx:442` | F |  |  |

## ARL-WEB-008 · SEO & Accessibility  
Route `/o/:org/web/sites/:id/quality` · sample `nl-sites-001` · archetype report · collection `sites`  
Tabs: SEO, Accessibility, Performance, Links  
Actions: Run audit, view issue, apply proposed fix, retest  
Edge: Claims of accessibility compliance require verified tests

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Issue detail | drawer | `src/applications/web/index.tsx:478` |  |  |  |
| code diff | drawer | `src/applications/web/index.tsx:479` |  |  |  |
| audit report | modal | `src/applications/web/index.tsx:480` | F |  |  |

## ARL-WEB-009 · Domains & Publishing  
Route `/o/:org/web/sites/:id/deploy` · sample `nl-sites-001` · archetype admin · collection `sites`  
Tabs: Domains, Environments, Deployments, Logs  
Actions: Verify domain, publish, rollback, inspect  
Edge: Published site only marked live after health checks

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Publish review | modal | `src/applications/web/index.tsx:501` |  |  |  |
| DNS instructions | drawer | `src/applications/web/index.tsx:502` |  |  |  |
| deployment issue | modal | `src/applications/web/index.tsx:503` | F |  |  |

## ARL-WEB-010 · Web Analytics  
Route `/o/:org/web/sites/:id/analytics` · sample `nl-sites-001` · archetype report · collection `sites`  
Tabs: Traffic, Conversion, Events, Content  
Actions: Build chart, compare periods, export, inspect  
Edge: Cookie consent respected and measured loss disclosed

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric source | drawer | `src/applications/web/index.tsx:531` |  |  |  |
| event setup | modal | `src/applications/web/index.tsx:532` | F |  |  |
| attribution note | modal | `src/applications/web/index.tsx:533` | F |  |  |
