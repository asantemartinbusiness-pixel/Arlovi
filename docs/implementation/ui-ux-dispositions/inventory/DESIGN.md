# DESIGN · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-DESIGN-001 · Design Files  
Route `/o/:org/design/files` · sample `nl-designs-001` · archetype directory · collection `designs`  
Tabs: Recent, Shared, Brand, Templates  
Actions: New file, import SVG, duplicate, fork, archive  
Edge: Imported fonts and vector effects disclose unsupported features

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| File setup | modal | `src/applications/design/index.tsx:2680` | F |  |  |
| import issues | modal | `src/applications/design/index.tsx:2681` |  |  |  |
| sharing | drawer | `src/applications/design/index.tsx:2682` |  |  |  |

## ARL-DESIGN-002 · Design Canvas  
Route `/o/:org/design/files/:id` · sample `nl-designs-001` · archetype canvas · collection `designs`  
Tabs: Design, Prototype, Inspect, Comments  
Actions: Select, draw, drag, resize, rotate, crop, zoom, pan  
Edge: Unsaved operations recovered; large canvas virtualized

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Insert tools | modal | `src/applications/design/index.tsx:2702` |  |  |  |
| fill picker | drawer | `src/applications/design/index.tsx:2703` |  |  |  |
| style inspector | drawer | `src/applications/design/index.tsx:2704` |  |  |  |
| export | modal | `src/applications/design/index.tsx:2705` | G |  |  |

## ARL-DESIGN-003 · Layers & Pages  
Route `/o/:org/design/files/:id/layers` · sample `nl-designs-001` · archetype directory · collection `designs`  
Tabs: Pages, Layers, Assets, Components  
Actions: Rename, group, reorder, lock, isolate, select  
Edge: Hidden/locked layers cannot be edited accidentally

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Layer context | modal | `src/applications/design/index.tsx:2761` |  |  |  |
| move-to-page | modal | `src/applications/design/index.tsx:2762` |  |  |  |
| component detach | modal | `src/applications/design/index.tsx:2763` |  |  |  |

## ARL-DESIGN-004 · Vector Path Editor  
Route `/o/:org/design/files/:id/paths` · sample `nl-designs-001` · archetype canvas · collection `designs`  
Tabs: Pen, Curves, Boolean, Offset  
Actions: Add point, adjust handle, join, subtract, simplify  
Edge: Path exports preserve scale and fill rules

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Point inspector | drawer | `src/applications/design/index.tsx:2777` |  |  |  |
| path operations | modal | `src/applications/design/index.tsx:2778` |  |  |  |
| stroke editing | drawer | `src/applications/design/index.tsx:2791` |  |  |  |

## ARL-DESIGN-005 · Auto Layout & Responsive  
Route `/o/:org/design/files/:id/layout` · sample `nl-designs-001` · archetype editor · collection `designs`  
Tabs: Layout, Constraints, Responsive, Grid  
Actions: Set size, reorder, wrap, preview width, apply rules  
Edge: Mixed fixed and responsive child constraints validated

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Layout inspector | drawer | `src/applications/design/index.tsx:2857` |  |  |  |
| constraint conflict | modal | `src/applications/design/index.tsx:2858` |  |  |  |
| breakpoint preview | modal | `src/applications/design/index.tsx:2859` |  |  |  |

## ARL-DESIGN-006 · Components & Variants  
Route `/o/:org/design/files/:id/components` · sample `nl-designs-001` · archetype directory · collection `designs`  
Tabs: Library, Local, Variants, Usage  
Actions: Create component, publish, swap, detach, inspect uses  
Edge: Global component change shows affected instances

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Variant editor | modal | `src/applications/design/index.tsx:2895` | F |  |  |
| library publish | modal | `src/applications/design/index.tsx:2896` |  |  |  |
| breaking-change diff | drawer | `src/applications/design/index.tsx:2897` |  |  |  |

## ARL-DESIGN-007 · Typography & Styles  
Route `/o/:org/design/files/:id/styles` · sample `nl-designs-001` · archetype editor · collection `designs`  
Tabs: Text, Colour, Effects, Variables  
Actions: Create style, edit token, apply to selection, inspect contrast  
Edge: Unavailable font is substituted only with disclosure

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Font browser | drawer | `src/applications/design/index.tsx:2922` |  |  |  |
| gradient editor | modal | `src/applications/design/index.tsx:2923` |  |  |  |
| style impact | drawer | `src/applications/design/index.tsx:2924` |  |  |  |

## ARL-DESIGN-008 · Prototype & Interactions  
Route `/o/:org/design/files/:id/prototype` · sample `nl-designs-001` · archetype graph · collection `designs`  
Tabs: Flow, Interactions, Preview, Share  
Actions: Link screens, set trigger, run preview, publish prototype  
Edge: Prototype cannot masquerade as connected production backend

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Interaction editor | drawer | `src/applications/design/index.tsx:2953` |  |  |  |
| transition options | modal | `src/applications/design/index.tsx:2954` |  |  |  |
| device preview | modal | `src/applications/design/index.tsx:2965` |  |  |  |

## ARL-DESIGN-009 · Assets & Export  
Route `/o/:org/design/files/:id/assets` · sample `nl-designs-001` · archetype directory · collection `designs`  
Tabs: Assets, Symbols, Exports, History  
Actions: Replace asset, crop, batch export, organize  
Edge: Rights and licensing metadata preserved

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Asset picker | modal | `src/applications/design/index.tsx:2996` |  |  |  |
| export settings | modal | `src/applications/design/index.tsx:2997` |  |  |  |
| license note | drawer | `src/applications/design/index.tsx:2998` |  |  |  |

## ARL-DESIGN-010 · Design Review  
Route `/o/:org/design/files/:id/review` · sample `nl-designs-001` · archetype record · collection `designs`  
Tabs: Comments, Reviews, Diff, History  
Actions: Annotate, approve, compare, assign fixes  
Edge: Approval binds to specific version not future edits

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Comment editor | modal | `src/applications/design/index.tsx:3039` |  |  |  |
| version compare | modal | `src/applications/design/index.tsx:3040` |  |  |  |
| signoff | modal | `src/applications/design/index.tsx:3041` | F |  |  |
