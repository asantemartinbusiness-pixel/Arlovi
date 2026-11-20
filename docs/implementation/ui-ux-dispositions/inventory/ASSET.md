# ASSET · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-ASSET-001 · Asset Library  
Route `/o/:org/asset/assets` · sample `nl-assets-001` · archetype directory · collection `assets`  
Tabs: All, Mine, Approved, Brand, Archived  
Actions: Upload, search, group, inspect, replace  
Edge: Expired licence restricts publishing use

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Media import | modal | `src/applications/asset/index.tsx:115` |  |  |  |
| asset inspector | drawer | `src/applications/asset/index.tsx:116` |  |  |  |
| rights check | modal | `src/applications/asset/index.tsx:117` |  |  |  |

## ARL-ASSET-002 · Asset Detail  
Route `/o/:org/asset/assets/:id` · sample `nl-assets-001` · archetype record · collection `assets`  
Tabs: Overview, Variants, Usage, Rights, History  
Actions: Download, create variant, update rights, archive  
Edge: Replacing shared asset previews affected live uses

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Variant editor | modal | `src/applications/asset/index.tsx:148` |  |  |  |
| rights form | modal | `src/applications/asset/index.tsx:149` |  |  |  |
| replacement impact | modal | `src/applications/asset/index.tsx:150` |  |  |  |

## ARL-ASSET-003 · Brand Kits  
Route `/o/:org/asset/brands` · sample `nl-assets-001` · archetype directory · collection `assets`  
Tabs: Brands, Tokens, Assets, Rules  
Actions: Create brand kit, apply, edit, publish  
Edge: Unapproved upload cannot replace active master brand

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Token editor | modal | `src/applications/asset/index.tsx:173` |  |  |  |
| brand selection | modal | `src/applications/asset/index.tsx:174` |  |  |  |
| global impact | modal | `src/applications/asset/index.tsx:175` |  |  |  |

## ARL-ASSET-004 · Media Transformations  
Route `/o/:org/asset/transforms` · sample `nl-assets-001` · archetype builder · collection `assets`  
Tabs: Presets, Jobs, History, Failed  
Actions: Create preset, batch export, compare, publish  
Edge: No destructive overwrite without version and authorisation

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Transform inspector | modal | `src/applications/asset/index.tsx:215` |  |  |  |
| rights | drawer | `src/applications/asset/index.tsx:216` |  |  |  |
| overwrite review | modal | `src/applications/asset/index.tsx:217` |  |  |  |

## ARL-ASSET-005 · Asset Usage & Governance  
Route `/o/:org/asset/governance` · sample `nl-assets-001` · archetype report · collection `assets`  
Tabs: Usage, Rights, Duplicates, Storage  
Actions: Find use, resolve duplicate, set retention, export  
Edge: Archive respects legal/brand retention constraints

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Usage inspector | drawer | `src/applications/asset/index.tsx:236` |  |  |  |
| merge preview | modal | `src/applications/asset/index.tsx:237` |  |  |  |
| expiry warning | modal | `src/applications/asset/index.tsx:238` |  |  |  |
