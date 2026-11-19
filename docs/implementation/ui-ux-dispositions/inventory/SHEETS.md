# SHEETS · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-SHEETS-001 · Workbook Library  
Route `/o/:org/sheets/workbooks` · sample `nl-workbooks-001` · archetype directory · collection `workbooks`  
Tabs: Recent, Mine, Shared, Templates  
Actions: Create, import, duplicate, search, archive  
Edge: Large files processed without silent formula loss

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Import mapper | drawer | `src/applications/sheets/index.tsx:2698` | F |  |  |
| new workbook | modal | `src/applications/sheets/index.tsx:2697` | F |  |  |
| share | modal | `src/applications/sheets/index.tsx:2700` | F |  |  |

## ARL-SHEETS-002 · Grid Editor  
Route `/o/:org/sheets/workbooks/:id` · sample `nl-workbooks-001` · archetype editor · collection `workbooks`  
Tabs: Sheet tabs, Data, Formulas, Review, View  
Actions: Edit cell, paste, fill, sort, filter, freeze, undo  
Edge: Deterministic recalculation and dependency graph required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Format cells | modal | `src/applications/sheets/index.tsx:2711` | F |  |  |
| data validation | modal | `src/applications/sheets/index.tsx:2712` | GF |  |  |
| named range | modal | `src/applications/sheets/index.tsx:2713` | F |  |  |
| chart picker | drawer | `src/applications/sheets/index.tsx:2717` | F |  |  |

## ARL-SHEETS-003 · Formula Manager  
Route `/o/:org/sheets/workbooks/:id/formulas` · sample `nl-workbooks-001` · archetype editor · collection `workbooks`  
Tabs: All, Errors, Dependencies, Named ranges  
Actions: Inspect, fix selected, recalculate, compare  
Edge: Circular formulas and unsupported functions show explicit errors

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Formula inspector | drawer | `src/applications/sheets/index.tsx:2751` |  |  |  |
| function help | modal | `src/applications/sheets/index.tsx:2752` |  |  |  |
| circular reference | drawer | `src/applications/sheets/index.tsx:2753` |  |  |  |

## ARL-SHEETS-004 · Data Tables  
Route `/o/:org/sheets/workbooks/:id/tables` · sample `nl-workbooks-001` · archetype table · collection `workbooks`  
Tabs: Tables, Views, Relationships, Validation  
Actions: Create table, edit schema, import, connect  
Edge: Schema change protects references and dependent apps

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Column editor | drawer | `src/applications/sheets/index.tsx:2770` | F |  |  |
| import schema | drawer | `src/applications/sheets/index.tsx:2771` | F |  |  |
| relation preview | drawer | `src/applications/sheets/index.tsx:2772` |  |  |  |

## ARL-SHEETS-005 · Charts & Dashboards  
Route `/o/:org/sheets/workbooks/:id/charts` · sample `nl-workbooks-001` · archetype editor · collection `workbooks`  
Tabs: Charts, Pivot, Dashboard, Presentation  
Actions: Create chart, change type, drill down, publish  
Edge: Chart series updates correctly on changed range

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Series editor | drawer | `src/applications/sheets/index.tsx:2788` | F |  |  |
| formatting inspector | modal | `src/applications/sheets/index.tsx:2789` | F |  |  |
| calculation note | modal | `src/applications/sheets/index.tsx:2790` |  |  |  |

## ARL-SHEETS-006 · Import & Export  
Route `/o/:org/sheets/workbooks/:id/io` · sample `nl-workbooks-001` · archetype admin · collection `workbooks`  
Tabs: Imports, Exports, Errors, History  
Actions: Upload, map columns, test, publish, export  
Edge: Never silently coerce dates, currencies or formula types

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Import wizard | drawer | `src/applications/sheets/index.tsx:2810` | F |  |  |
| compatibility report | modal | `src/applications/sheets/index.tsx:2811` |  |  |  |
| rollback | modal | `src/applications/sheets/index.tsx:2817` | F |  |  |

## ARL-SHEETS-007 · Collaboration & Versioning  
Route `/o/:org/sheets/workbooks/:id/collab` · sample `nl-workbooks-001` · archetype record · collection `workbooks`  
Tabs: Comments, History, Permissions, Changes  
Actions: Comment, compare, protect, restore, merge  
Edge: Two users editing same cell require conflict strategy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Conflict resolver | drawer | `src/applications/sheets/index.tsx:2838` |  |  |  |
| protected range | modal | `src/applications/sheets/index.tsx:2839` | F |  |  |
| restore confirmation | modal | `src/applications/sheets/index.tsx:2842` | F |  |  |
