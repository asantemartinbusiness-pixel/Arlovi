# PHOTO · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-PHOTO-001 · Photo Library  
Route `/o/:org/photo/photos` · sample `nl-photos-001` · archetype directory · collection `photos`  
Tabs: Recent, Albums, Shared, Imports  
Actions: Upload, tag, select, compare, open  
Edge: Corrupt or unsupported format does not compromise library

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Bulk import | modal | `src/applications/photo/index.tsx:1889` |  |  |  |
| asset detail | drawer | `src/applications/photo/index.tsx:1890` |  |  |  |
| license | drawer | `src/applications/photo/index.tsx:1891` |  |  |  |

## ARL-PHOTO-002 · Raster Editor  
Route `/o/:org/photo/photos/:id` · sample `nl-photos-001` · archetype canvas · collection `photos`  
Tabs: Edit, Layers, Adjust, Review  
Actions: Crop, brush, clone, transform, paint, undo  
Edge: Destructive transformations versioned and restorable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Tool options | drawer | `src/applications/photo/index.tsx:1908` |  |  |  |
| canvas size | modal | `src/applications/photo/index.tsx:1909` |  |  |  |
| adjustment layer | modal | `src/applications/photo/index.tsx:1910` |  |  |  |

## ARL-PHOTO-003 · Selections & Masks  
Route `/o/:org/photo/photos/:id/masks` · sample `nl-photos-001` · archetype canvas · collection `photos`  
Tabs: Select, Refine, Mask, Compare  
Actions: Lasso, select subject, refine edge, invert, mask  
Edge: Selection persists correctly across image transforms

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Selection options | drawer | `src/applications/photo/index.tsx:1925` |  |  |  |
| refinement | modal | `src/applications/photo/index.tsx:1926` | F |  |  |
| quick mask | modal | `src/applications/photo/index.tsx:1927` |  |  |  |

## ARL-PHOTO-004 · Adjustments & Colour  
Route `/o/:org/photo/photos/:id/adjust` · sample `nl-photos-001` · archetype editor · collection `photos`  
Tabs: Basic, Curves, Colour, Detail  
Actions: Adjust slider, reset, save preset, compare  
Edge: Colour profile conversion identified and tested

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Histogram | drawer | `src/applications/photo/index.tsx:1967` |  |  |  |
| colour picker | modal | `src/applications/photo/index.tsx:1968` |  |  |  |
| profile warning | modal | `src/applications/photo/index.tsx:1969` |  |  |  |

## ARL-PHOTO-005 · Compositing & Layers  
Route `/o/:org/photo/photos/:id/layers` · sample `nl-photos-001` · archetype directory · collection `photos`  
Tabs: Layers, Groups, Effects, History  
Actions: Reorder, group, blend, transform, replace  
Edge: AI results never silently flatten editable layer hierarchy

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Blend picker | modal | `src/applications/photo/index.tsx:2014` |  |  |  |
| layer properties | drawer | `src/applications/photo/index.tsx:2015` |  |  |  |
| linked object | modal | `src/applications/photo/index.tsx:2016` |  |  |  |

## ARL-PHOTO-006 · Batch Processing  
Route `/o/:org/photo/batch` · sample `nl-photos-001` · archetype builder · collection `photos`  
Tabs: Queue, Presets, Results, Failed  
Actions: Build batch, test sample, execute, download  
Edge: Jobs resumable; output collisions handled deterministically

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Preset editor | modal | `src/applications/photo/index.tsx:2047` |  |  |  |
| overwrite confirmation | modal | `src/applications/photo/index.tsx:2058` |  |  |  |
| result report | drawer | `src/applications/photo/index.tsx:2070` |  |  |  |

## ARL-PHOTO-007 · Photo Export  
Route `/o/:org/photo/photos/:id/export` · sample `nl-photos-001` · archetype admin · collection `photos`  
Tabs: Export, Presets, Publish  
Actions: Set format, preview, export, upload to asset library  
Edge: Aspect ratio and transparency not silently altered

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Export preview | modal | `src/applications/photo/index.tsx:2105` |  |  |  |
| rights | drawer | `src/applications/photo/index.tsx:2106` |  |  |  |
| profile handling | modal | `src/applications/photo/index.tsx:2107` |  |  |  |
