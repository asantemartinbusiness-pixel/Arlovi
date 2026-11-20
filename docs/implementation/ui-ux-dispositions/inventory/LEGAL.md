# LEGAL · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-LEGAL-001 · Governance Overview  
Route `/o/:org/legal/home` · sample `nl-contracts-001` · archetype dashboard · collection `contracts`  
Tabs: Overview, Obligations, Policies, Risks  
Actions: Review item, assign counsel, schedule audit, report  
Edge: Jurisdiction-specific interpretations flagged for legal review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Obligation quick view | drawer | `src/applications/legal/index.tsx:833` |  |  |  |
| issue create | modal | `src/applications/legal/index.tsx:834` | F |  |  |
| risk summary | drawer | `src/applications/legal/index.tsx:835` |  |  |  |

## ARL-LEGAL-002 · Contract Library  
Route `/o/:org/legal/contracts` · sample `nl-contracts-001` · archetype table · collection `contracts`  
Tabs: Draft, Review, Active, Expiring, Archived  
Actions: Upload, draft, assign review, send for signature  
Edge: Contract rights/obligations not autonomously accepted

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Contract upload | modal | `src/applications/legal/index.tsx:856` | F |  |  |
| reviewer picker | modal | `src/applications/legal/index.tsx:857` | F |  |  |
| e-sign request | modal | `src/applications/legal/index.tsx:858` | GC |  |  |

## ARL-LEGAL-003 · Contract Detail  
Route `/o/:org/legal/contracts/:id` · sample `nl-contracts-001` · archetype record · collection `contracts`  
Tabs: Overview, Clauses, Redline, Signatures, History  
Actions: Compare, comment, request review, approve legal step  
Edge: Original signed version immutable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Clause inspector | drawer | `src/applications/legal/index.tsx:882` |  |  |  |
| redline diff | drawer | `src/applications/legal/index.tsx:883` |  |  |  |
| sign authorization | modal | `src/applications/legal/index.tsx:884` |  |  |  |

## ARL-LEGAL-004 · Policy Register  
Route `/o/:org/legal/policies` · sample `nl-contracts-001` · archetype directory · collection `contracts`  
Tabs: All, Due review, Draft, Published  
Actions: Create, revise, publish, request acknowledgment  
Edge: Superseded version preserved for historical decisions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Policy editor | modal | `src/applications/legal/index.tsx:914` | F |  |  |
| audience | drawer | `src/applications/legal/index.tsx:915` |  |  |  |
| publication impact | modal | `src/applications/legal/index.tsx:916` |  |  |  |

## ARL-LEGAL-005 · Obligation Calendar  
Route `/o/:org/legal/obligations` · sample `nl-obligations-001` · archetype calendar · collection `obligations`  
Tabs: Calendar, Owner, Overdue, Completed  
Actions: Assign, remind, record evidence, escalate  
Edge: Relative dates converted with explicit timezone/jurisdiction

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Deadline editor | modal | `src/applications/legal/index.tsx:937` | F |  |  |
| evidence upload | modal | `src/applications/legal/index.tsx:938` | F |  |  |
| escalation | modal | `src/applications/legal/index.tsx:939` | F |  |  |

## ARL-LEGAL-006 · Risk Register  
Route `/o/:org/legal/risks` · sample `nl-risks-001` · archetype table · collection `risks`  
Tabs: All, High, Owned, Closed  
Actions: Add, score, mitigate, review  
Edge: AI risk rating not substituted for accountable owner decision

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Risk form | modal | `src/applications/legal/index.tsx:958` | F |  |  |
| score rationale | modal | `src/applications/legal/index.tsx:959` | F |  |  |
| control assignment | modal | `src/applications/legal/index.tsx:960` | F |  |  |

## ARL-LEGAL-007 · Audit & Evidence  
Route `/o/:org/legal/evidence` · sample `nl-contracts-001` · archetype directory · collection `contracts`  
Tabs: Packs, Requests, Holds, Exports  
Actions: Assemble, hash, share, request legal hold  
Edge: Restricted/retained data follows legal hold and export rules

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Evidence detail | drawer | `src/applications/legal/index.tsx:981` |  |  |  |
| legal hold | modal | `src/applications/legal/index.tsx:982` |  |  |  |
| export permissions | drawer | `src/applications/legal/index.tsx:983` |  |  |  |
