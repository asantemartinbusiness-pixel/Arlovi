# PRESENT · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-PRESENT-001 · Presentation Library  
Route `/o/:org/present/decks` · sample `nl-decks-001` · archetype directory · collection `decks`  
Tabs: Recent, Shared, Templates, Archived  
Actions: Create deck, import, duplicate, present  
Edge: Font and media substitutions disclosed on import

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Import | drawer | `src/applications/present/index.tsx:3093` | F |  |  |
| new deck | modal | `src/applications/present/index.tsx:3092` | F |  |  |
| template preview | drawer | `src/applications/present/index.tsx:3094` |  |  |  |

## ARL-PRESENT-002 · Slide Editor  
Route `/o/:org/present/decks/:id` · sample `nl-decks-001` · archetype editor · collection `decks`  
Tabs: Design, Insert, Animate, Review, View  
Actions: Insert slide, drag object, align, resize, comment, undo  
Edge: Selected objects remain editable after AI changes

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Layout picker | drawer | `src/applications/present/index.tsx:3105` | F |  |  |
| image insert | modal | `src/applications/present/index.tsx:3106` | F |  |  |
| properties | modal | `src/applications/present/index.tsx:3107` | F |  |  |
| AI suggestion | drawer | `src/applications/present/index.tsx:3111` | F |  |  |

## ARL-PRESENT-003 · Master & Theme Editor  
Route `/o/:org/present/decks/:id/theme` · sample `nl-decks-001` · archetype editor · collection `decks`  
Tabs: Masters, Colours, Fonts, Layouts  
Actions: Change master, create layout, preview impact  
Edge: Theme updates do not silently overwrite customized objects

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Theme editor | modal | `src/applications/present/index.tsx:3125` | F |  |  |
| global apply review | drawer | `src/applications/present/index.tsx:3126` | F |  |  |
| font resolver | modal | `src/applications/present/index.tsx:3127` |  |  |  |

## ARL-PRESENT-004 · Charts & Data  
Route `/o/:org/present/decks/:id/data` · sample `nl-decks-001` · archetype editor · collection `decks`  
Tabs: Charts, Tables, Sources, Refresh  
Actions: Insert chart, link sheet, update data, show labels  
Edge: Source freshness and stale chart snapshot visible

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Dataset picker | drawer | `src/applications/present/index.tsx:3144` | F |  |  |
| chart inspector | drawer | `src/applications/present/index.tsx:3145` | F |  |  |
| unlink warning | modal | `src/applications/present/index.tsx:3146` | F |  |  |

## ARL-PRESENT-005 · Transitions & Animation  
Route `/o/:org/present/decks/:id/animation` · sample `nl-decks-001` · archetype timeline · collection `decks`  
Tabs: Slides, Objects, Timing, Preview  
Actions: Add animation, sequence, test, reduce motion  
Edge: Presentation remains understandable with animations disabled

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Motion inspector | modal | `src/applications/present/index.tsx:3162` | F |  |  |
| playback | drawer | `src/applications/present/index.tsx:3163` |  |  |  |
| accessibility review | drawer | `src/applications/present/index.tsx:3164` |  |  |  |

## ARL-PRESENT-006 · Presenter Mode  
Route `/o/:org/present/decks/:id/present` · sample `nl-decks-001` · archetype media · collection `decks`  
Tabs: Audience, Presenter, Rehearsal  
Actions: Present, advance, annotate, end, export notes  
Edge: Private notes never appear on public display

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Display selector | modal | `src/applications/present/index.tsx:3191` | F |  |  |
| rehearsal report | drawer | `src/applications/present/index.tsx:3192` |  |  |  |
| access confirmation | modal | `src/applications/present/index.tsx:3194` | F |  |  |

## ARL-PRESENT-007 · Review & Publish  
Route `/o/:org/present/decks/:id/review` · sample `nl-decks-001` · archetype record · collection `decks`  
Tabs: Comments, History, Export, Publish  
Actions: Resolve, approve, export, share  
Edge: Export quality and editable format tested

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Version comparison | drawer | `src/applications/present/index.tsx:3209` |  |  |  |
| export settings | modal | `src/applications/present/index.tsx:3210` | F |  |  |
| approval | modal | `src/applications/present/index.tsx:3213` | F |  |  |
