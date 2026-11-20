# BRAIN · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-BRAIN-001 · Knowledge Home  
Route `/o/:org/brain/home` · sample `nl-facts-001` · archetype dashboard · collection `facts`  
Tabs: Overview, Recent, Quality, Opportunities  
Actions: Search knowledge, review proposal, inspect missing source, import  
Edge: Unverified claim never promoted to authoritative business fact automatically

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Knowledge inspector | drawer | `src/applications/brain/index.tsx:2396` |  |  |  |
| suggestion approval | modal | `src/applications/brain/index.tsx:2397` |  |  |  |
| upload | modal | `src/applications/brain/index.tsx:2398` |  |  |  |

## ARL-BRAIN-002 · Source Library  
Route `/o/:org/brain/sources` · sample `nl-sources-001` · archetype directory · collection `sources`  
Tabs: Documents, Websites, Integrations, Media  
Actions: Upload, filter, inspect, reprocess, retire source  
Edge: Virus scanning and ingestion isolation precede all content use

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Upload dialog | modal | `src/applications/brain/index.tsx:2417` |  |  |  |
| source detail drawer | drawer | `src/applications/brain/index.tsx:2418` |  |  |  |
| retention dialog | modal | `src/applications/brain/index.tsx:2419` |  |  |  |

## ARL-BRAIN-003 · Source Detail  
Route `/o/:org/brain/sources/:id` · sample `nl-sources-001` · archetype record · collection `sources`  
Tabs: Preview, Extracted data, Relationships, Access, History  
Actions: Correct extraction, annotate, restrict, reindex, export  
Edge: Corrections preserve original source and immutable correction history

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Correction form | modal | `src/applications/brain/index.tsx:2438` | F |  |  |
| permission editor | modal | `src/applications/brain/index.tsx:2439` |  |  |  |
| delete request | modal | `src/applications/brain/index.tsx:2440` |  |  |  |

## ARL-BRAIN-004 · Business Graph  
Route `/o/:org/brain/graph` · sample `nl-facts-001` · archetype graph · collection `facts`  
Tabs: Entities, Relationships, Exceptions  
Actions: Explore node, merge candidates, split record, filter graph  
Edge: Uncertain matches require review before irreversible merge

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Entity inspector | drawer | `src/applications/brain/index.tsx:2459` |  |  |  |
| merge preview | modal | `src/applications/brain/index.tsx:2460` |  |  |  |
| relationship editor | modal | `src/applications/brain/index.tsx:2462` | F |  |  |

## ARL-BRAIN-005 · Fact Registry  
Route `/o/:org/brain/facts` · sample `nl-facts-001` · archetype directory · collection `facts`  
Tabs: Verified, Proposed, Conflicting, Expired  
Actions: Approve, reject, annotate, set expiry, compare facts  
Edge: Two incompatible facts cannot both be presented as current authoritative

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Evidence drawer | drawer | `src/applications/brain/index.tsx:2482` |  |  |  |
| verification dialog | modal | `src/applications/brain/index.tsx:2483` | F |  |  |
| conflict resolver | modal | `src/applications/brain/index.tsx:2484` |  |  |  |

## ARL-BRAIN-006 · Knowledge Conflicts  
Route `/o/:org/brain/conflicts` · sample `nl-conflicts-001` · archetype board · collection `conflicts`  
Tabs: Open, In review, Resolved  
Actions: Select source of truth, defer, request external confirmation  
Edge: Financial mismatches require ledger/accounting review, not AI choice

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Comparison drawer | drawer | `src/applications/brain/index.tsx:2501` |  |  |  |
| resolution dialog | modal | `src/applications/brain/index.tsx:2502` |  |  |  |
| escalation | modal | `src/applications/brain/index.tsx:2503` |  |  |  |

## ARL-BRAIN-007 · Decision Register  
Route `/o/:org/brain/decisions` · sample `nl-decisions-001` · archetype directory · collection `decisions`  
Tabs: All, Proposed, Approved, Superseded  
Actions: Create decision, link approval, inspect rationale, supersede  
Edge: Superseded decisions remain visible for audit with status

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Decision draft | modal | `src/applications/brain/index.tsx:2521` | F |  |  |
| approval detail | drawer | `src/applications/brain/index.tsx:2522` |  |  |  |
| impact review | modal | `src/applications/brain/index.tsx:2523` | F |  |  |

## ARL-BRAIN-008 · Brand Intelligence  
Route `/o/:org/brain/brand` · sample `nl-brands-001` · archetype editor · collection `brands`  
Tabs: Identity, Colours, Typography, Voice, Assets, Rules  
Actions: Import guide, edit token, approve variant, set usage  
Edge: Unapproved extraction must not silently overwrite approved design tokens

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Brand rule editor | modal | `src/applications/brain/index.tsx:2541` | F |  |  |
| asset selector | drawer | `src/applications/brain/index.tsx:2542` |  |  |  |
| impact preview | modal | `src/applications/brain/index.tsx:2543` |  |  |  |

## ARL-BRAIN-009 · Knowledge Permissions  
Route `/o/:org/brain/permissions` · sample `nl-policies-001` · archetype admin · collection `policies`  
Tabs: Roles, Source grants, Retention, Activity  
Actions: Adjust access, simulate retrieval, revoke grant, inspect usage  
Edge: Revocation must invalidate downstream access and cached retrieval where feasible

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Grant dialog | modal | `src/applications/brain/index.tsx:2563` |  |  |  |
| simulation report | drawer | `src/applications/brain/index.tsx:2564` |  |  |  |
| revoke confirmation | modal | `src/applications/brain/index.tsx:2565` |  |  |  |

## ARL-BRAIN-010 · Intake Centre  
Route `/o/:org/brain/intake` · sample `nl-sources-001` · archetype dashboard · collection `sources`  
Tabs: Incoming, Processing, Review, Completed, Failed  
Actions: Upload, retry safe step, approve extraction, route document  
Edge: Large malformed or adversarial files isolated and reported

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| File chooser | modal | `src/applications/brain/index.tsx:2584` |  |  |  |
| import review | modal | `src/applications/brain/index.tsx:2585` |  |  |  |
| unsupported format error | modal | `src/applications/brain/index.tsx:2586` |  |  |  |
