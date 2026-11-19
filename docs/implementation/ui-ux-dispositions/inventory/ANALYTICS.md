# ANALYTICS · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-ANALYTICS-001 · Insights Overview  
Route `/o/:org/analytics/home` · sample `nl-datasets-001` · archetype dashboard · collection `datasets`  
Tabs: Executive, Financial, Customers, Operations, AI  
Actions: Ask question, inspect source, save view, delegate investigation  
Edge: Missing datasets shown with connection instructions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric inspector | drawer | `src/applications/analytics/index.tsx:107` |  |  |  |
| insight detail | drawer | `src/applications/analytics/index.tsx:108` |  |  |  |
| data freshness | drawer | `src/applications/analytics/index.tsx:109` |  |  |  |

## ARL-ANALYTICS-002 · Dashboard Directory  
Route `/o/:org/analytics/dashboards` · sample `nl-datasets-001` · archetype directory · collection `datasets`  
Tabs: All, Mine, Shared, Templates  
Actions: Create, open, pin, share, archive  
Edge: Sensitive metrics not leaked through thumbnail previews

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Dashboard setup | modal | `src/applications/analytics/index.tsx:156` | F |  |  |
| sharing | modal | `src/applications/analytics/index.tsx:157` |  |  |  |
| source dependency | drawer | `src/applications/analytics/index.tsx:158` |  |  |  |

## ARL-ANALYTICS-003 · Dashboard Editor  
Route `/o/:org/analytics/dashboards/:id` · sample `nl-datasets-001` · archetype editor · collection `datasets`  
Tabs: Layout, Data, Style, Access  
Actions: Drag widget, resize, set filter, publish  
Edge: Cross-widget filters use consistent semantic types

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Widget chooser | modal | `src/applications/analytics/index.tsx:203` |  |  |  |
| query editor | drawer | `src/applications/analytics/index.tsx:204` |  |  |  |
| share | modal | `src/applications/analytics/index.tsx:205` |  |  |  |

## ARL-ANALYTICS-004 · Report Builder  
Route `/o/:org/analytics/reports/:id` · sample `nl-datasets-001` · archetype editor · collection `datasets`  
Tabs: Content, Data, Layout, Distribution  
Actions: Create report, add chart, cite, publish  
Edge: Report not presented finalized with stale/dropped sources

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Report block | modal | `src/applications/analytics/index.tsx:269` |  |  |  |
| schedule | modal | `src/applications/analytics/index.tsx:270` |  |  |  |
| source inspection | drawer | `src/applications/analytics/index.tsx:271` |  |  |  |

## ARL-ANALYTICS-005 · Dataset Catalogue  
Route `/o/:org/analytics/datasets` · sample `nl-datasets-001` · archetype directory · collection `datasets`  
Tabs: All, Connected, Native, Issues  
Actions: Browse, document, grant, refresh, retire  
Edge: Dataset owner and privacy constraints respected

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Dataset details | drawer | `src/applications/analytics/index.tsx:316` |  |  |  |
| grant review | modal | `src/applications/analytics/index.tsx:317` |  |  |  |
| quality | drawer | `src/applications/analytics/index.tsx:318` |  |  |  |

## ARL-ANALYTICS-006 · Metric Definitions  
Route `/o/:org/analytics/metrics` · sample `nl-datasets-001` · archetype admin · collection `datasets`  
Tabs: Metrics, Dimensions, Versions, Validation  
Actions: Define measure, test, approve, compare  
Edge: Changing a metric versions historical dashboard meaning

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Formula editor | modal | `src/applications/analytics/index.tsx:348` |  |  |  |
| impact review | modal | `src/applications/analytics/index.tsx:349` |  |  |  |
| metric QA | drawer | `src/applications/analytics/index.tsx:350` |  |  |  |

## ARL-ANALYTICS-007 · Data Modelling  
Route `/o/:org/analytics/models` · sample `nl-datasets-001` · archetype graph · collection `datasets`  
Tabs: Schema, Transformations, Tests, Lineage  
Actions: Add relation, validate, refresh, deploy  
Edge: Fan-out joins cannot inflate totals silently

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Join properties | drawer | `src/applications/analytics/index.tsx:373` |  |  |  |
| transform editor | modal | `src/applications/analytics/index.tsx:374` |  |  |  |
| test | drawer | `src/applications/analytics/index.tsx:375` |  |  |  |

## ARL-ANALYTICS-008 · Forecasts & Scenarios  
Route `/o/:org/analytics/forecasts` · sample `nl-datasets-001` · archetype report · collection `datasets`  
Tabs: Forecast, Scenarios, Inputs, Accuracy  
Actions: Adjust inputs, compare, save, request review  
Edge: Forecast never silently replaces posted actual

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Assumption inspector | drawer | `src/applications/analytics/index.tsx:409` |  |  |  |
| scenario editor | modal | `src/applications/analytics/index.tsx:410` |  |  |  |
| confidence note | modal | `src/applications/analytics/index.tsx:411` |  |  |  |

## ARL-ANALYTICS-009 · Reports & Distribution  
Route `/o/:org/analytics/distribution` · sample `nl-datasets-001` · archetype admin · collection `datasets`  
Tabs: Schedules, Audiences, Deliveries, Failures  
Actions: Schedule, test, pause, resend safely  
Edge: Unauthorized recipients blocked; send deduplication enforced

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Recipient preview | modal | `src/applications/analytics/index.tsx:463` |  |  |  |
| delivery method | modal | `src/applications/analytics/index.tsx:464` |  |  |  |
| failure detail | drawer | `src/applications/analytics/index.tsx:465` |  |  |  |
