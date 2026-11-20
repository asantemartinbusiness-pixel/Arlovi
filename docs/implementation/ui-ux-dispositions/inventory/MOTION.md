# MOTION · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-MOTION-001 · Motion Projects  
Route `/o/:org/motion/projects` · sample `nl-motions-001` · archetype directory · collection `motions`  
Tabs: Recent, Shared, Templates, Renders  
Actions: Create, import, duplicate, open  
Edge: Missing linked assets surfaced

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Composition setup | modal | `src/applications/motion/index.tsx:300` |  |  |  |
| asset library | drawer | `src/applications/motion/index.tsx:301` |  |  |  |
| publish | modal | `src/applications/motion/index.tsx:302` |  |  |  |

## ARL-MOTION-002 · Composition Editor  
Route `/o/:org/motion/projects/:id` · sample `nl-motions-001` · archetype timeline · collection `motions`  
Tabs: Animate, Design, Effects, Preview  
Actions: Set keyframe, drag curve, animate, preview, undo  
Edge: Motion respects reduce-motion alternative output

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Keyframe editor | modal | `src/applications/motion/index.tsx:317` |  |  |  |
| layer inspector | drawer | `src/applications/motion/index.tsx:318` |  |  |  |
| motion picker | modal | `src/applications/motion/index.tsx:319` |  |  |  |

## ARL-MOTION-003 · Easing & Timing  
Route `/o/:org/motion/projects/:id/easing` · sample `nl-motions-001` · archetype editor · collection `motions`  
Tabs: Curves, Timing, Presets, Spring  
Actions: Edit easing, stagger, loop, test  
Edge: Overactive or flashing animations trigger accessibility review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Curve editor | modal | `src/applications/motion/index.tsx:334` |  |  |  |
| loop validation | modal | `src/applications/motion/index.tsx:335` |  |  |  |
| timing preview | modal | `src/applications/motion/index.tsx:336` | F |  |  |

## ARL-MOTION-004 · Interactive Motion  
Route `/o/:org/motion/projects/:id/interactive` · sample `nl-motions-001` · archetype builder · collection `motions`  
Tabs: States, Triggers, Preview, Export  
Actions: Bind trigger, test, remove, export  
Edge: Keyboard and touch alternatives required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| State inspector | drawer | `src/applications/motion/index.tsx:350` |  |  |  |
| interaction guard | modal | `src/applications/motion/index.tsx:351` |  |  |  |
| device preview | modal | `src/applications/motion/index.tsx:352` | F |  |  |

## ARL-MOTION-005 · Motion Export  
Route `/o/:org/motion/projects/:id/export` · sample `nl-motions-001` · archetype admin · collection `motions`  
Tabs: Formats, Presets, Queue, History  
Actions: Render, test fallback, export, publish  
Edge: Unsupported effects clearly declared before export

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Export options | modal | `src/applications/motion/index.tsx:368` |  |  |  |
| reduced-motion review | modal | `src/applications/motion/index.tsx:369` |  |  |  |
| compatibility | modal | `src/applications/motion/index.tsx:370` | F |  |  |
