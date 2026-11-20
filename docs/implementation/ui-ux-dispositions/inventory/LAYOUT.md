# LAYOUT · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-LAYOUT-001 · Publication Library  
Route `/o/:org/layout/publications` · sample `nl-publications-001` · archetype directory · collection `publications`  
Tabs: Recent, Company, Templates, Archive  
Actions: New publication, import, duplicate, open  
Edge: Print metric units and bleed preserved on import

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Page preset | modal | `src/applications/layout/index.tsx:2031` | F |  |  |
| import review | modal | `src/applications/layout/index.tsx:2032` |  |  |  |
| share | drawer | `src/applications/layout/index.tsx:2033` |  |  |  |

## ARL-LAYOUT-002 · Publication Editor  
Route `/o/:org/layout/publications/:id` · sample `nl-publications-001` · archetype canvas · collection `publications`  
Tabs: Pages, Layout, Type, Review  
Actions: Create page, place frame, flow text, snap, export  
Edge: Overset text must never vanish silently

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Frame editor | drawer | `src/applications/layout/index.tsx:2047` |  |  |  |
| page settings | modal | `src/applications/layout/index.tsx:2048` |  |  |  |
| overset warning | modal | `src/applications/layout/index.tsx:2049` |  |  |  |

## ARL-LAYOUT-003 · Master Pages  
Route `/o/:org/layout/publications/:id/masters` · sample `nl-publications-001` · archetype editor · collection `publications`  
Tabs: Masters, Variables, Usage  
Actions: Create master, apply, override, preview  
Edge: Global master change shows impact on all spreads

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Master editor | modal | `src/applications/layout/index.tsx:2072` |  |  |  |
| override confirmation | modal | `src/applications/layout/index.tsx:2073` |  |  |  |

## ARL-LAYOUT-004 · Typography & Flow  
Route `/o/:org/layout/publications/:id/typography` · sample `nl-publications-001` · archetype editor · collection `publications`  
Tabs: Paragraph, Character, Flow, Accessibility  
Actions: Edit styles, link frames, adjust tracking, inspect overset  
Edge: Page break and thread order remain deterministic

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Text style | modal | `src/applications/layout/index.tsx:2103` |  |  |  |
| flow options | drawer | `src/applications/layout/index.tsx:2104` |  |  |  |
| preflight issue | modal | `src/applications/layout/index.tsx:2105` |  |  |  |

## ARL-LAYOUT-005 · Print & Preflight  
Route `/o/:org/layout/publications/:id/preflight` · sample `nl-publications-001` · archetype report · collection `publications`  
Tabs: Preflight, Proof, Export, History  
Actions: Inspect issue, fix, proof, export press PDF  
Edge: Noncompliant print output blocked or clearly warned

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Preflight detail | drawer | `src/applications/layout/index.tsx:2152` |  |  |  |
| export setup | modal | `src/applications/layout/index.tsx:2153` |  |  |  |
| missing asset | modal | `src/applications/layout/index.tsx:2154` |  |  |  |
