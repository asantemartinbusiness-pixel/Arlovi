# VIDEO · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-VIDEO-001 · Video Projects  
Route `/o/:org/video/projects` · sample `nl-videos-001` · archetype directory · collection `videos`  
Tabs: Recent, Shared, Templates, Archived  
Actions: Create, import media, duplicate, open  
Edge: Footage privacy/licensing checked on ingest

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Media import | modal | `src/applications/video/index.tsx:2629` |  |  |  |
| new sequence | modal | `src/applications/video/index.tsx:2630` | F |  |  |
| project settings | drawer | `src/applications/video/index.tsx:2631` |  |  |  |

## ARL-VIDEO-002 · Video Timeline  
Route `/o/:org/video/projects/:id` · sample `nl-videos-001` · archetype timeline · collection `videos`  
Tabs: Edit, Colour, Audio, Captions, Export  
Actions: Trim, split, ripple, drag clips, scrub, undo  
Edge: Timeline timebase stable across variable frame rate assets

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Clip property | drawer | `src/applications/video/index.tsx:2645` |  |  |  |
| transition editor | modal | `src/applications/video/index.tsx:2646` |  |  |  |
| proxy status | modal | `src/applications/video/index.tsx:2647` |  |  |  |

## ARL-VIDEO-003 · Media Bin  
Route `/o/:org/video/projects/:id/media` · sample `nl-videos-001` · archetype directory · collection `videos`  
Tabs: Media, Folders, Proxy, Missing  
Actions: Import, relink, tag, proxy generate, audition  
Edge: Missing footage never silently replaced with unrelated media

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Media inspector | drawer | `src/applications/video/index.tsx:2707` |  |  |  |
| relink file | modal | `src/applications/video/index.tsx:2708` |  |  |  |
| license | drawer | `src/applications/video/index.tsx:2709` |  |  |  |

## ARL-VIDEO-004 · Audio Mixer  
Route `/o/:org/video/projects/:id/audio` · sample `nl-videos-001` · archetype editor · collection `videos`  
Tabs: Tracks, Mixer, Effects, Loudness  
Actions: Adjust gain, mute, automate, export mix  
Edge: Audio export warns about clipping and loudness failures

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Mixer property | drawer | `src/applications/video/index.tsx:2749` |  |  |  |
| loudness review | modal | `src/applications/video/index.tsx:2750` |  |  |  |
| voice cleanup | modal | `src/applications/video/index.tsx:2751` |  |  |  |

## ARL-VIDEO-005 · Captions & Transcript  
Route `/o/:org/video/projects/:id/captions` · sample `nl-videos-001` · archetype editor · collection `videos`  
Tabs: Transcript, Captions, Languages, Review  
Actions: Correct, split cue, time, style, export SRT  
Edge: Subtitle text not treated as word-perfect without review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Caption editor | drawer | `src/applications/video/index.tsx:2838` |  |  |  |
| speaker verification | modal | `src/applications/video/index.tsx:2839` |  |  |  |
| language review | modal | `src/applications/video/index.tsx:2840` |  |  |  |

## ARL-VIDEO-006 · Colour & Effects  
Route `/o/:org/video/projects/:id/effects` · sample `nl-videos-001` · archetype editor · collection `videos`  
Tabs: Colour, Effects, Presets, Compare  
Actions: Apply, reorder, preview, bypass, reset  
Edge: Effect rendering may differ; export preflight required

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Effect inspector | drawer | `src/applications/video/index.tsx:2885` |  |  |  |
| scope display | modal | `src/applications/video/index.tsx:2886` |  |  |  |
| preset save | modal | `src/applications/video/index.tsx:2887` | F |  |  |

## ARL-VIDEO-007 · Video Export & Render  
Route `/o/:org/video/projects/:id/export` · sample `nl-videos-001` · archetype admin · collection `videos`  
Tabs: Export, Queue, History, Failures  
Actions: Render preview, export, cancel, download, publish  
Edge: Render is resumable; no success claimed before artifact verified

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Render settings | modal | `src/applications/video/index.tsx:2948` |  |  |  |
| compatibility | modal | `src/applications/video/index.tsx:2949` |  |  |  |
| delivery confirmation | drawer | `src/applications/video/index.tsx:2950` |  |  |  |

## ARL-VIDEO-008 · Video Review  
Route `/o/:org/video/projects/:id/review` · sample `nl-videos-001` · archetype record · collection `videos`  
Tabs: Comments, Versions, Approval, Delivery  
Actions: Comment timestamp, compare, approve, assign edit  
Edge: Approved cut locked to immutable asset digest

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Review marker | modal | `src/applications/video/index.tsx:2993` |  |  |  |
| version comparison | modal | `src/applications/video/index.tsx:2994` |  |  |  |
| final signoff | modal | `src/applications/video/index.tsx:2995` | F |  |  |
