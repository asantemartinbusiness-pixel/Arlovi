# FORMS · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-FORMS-001 · Forms Directory  
Route `/o/:org/forms/forms` · sample `nl-forms-001` · archetype directory · collection `forms`  
Tabs: All, Draft, Live, Templates  
Actions: Create, duplicate, archive, review responses  
Edge: Sensitive forms flagged for access and retention

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| New form | modal | `src/applications/forms/index.tsx:172` | F |  |  |
| duplicate confirm | modal | `src/applications/forms/index.tsx:173` | F |  |  |
| share | drawer | `src/applications/forms/index.tsx:174` |  |  |  |

## ARL-FORMS-002 · Visual Form Builder  
Route `/o/:org/forms/forms/:id` · sample `nl-forms-001` · archetype builder · collection `forms`  
Tabs: Build, Logic, Design, Settings, Preview  
Actions: Insert field, reorder, change type, publish  
Edge: Keyboard/single-pointer alternative for drag sorting

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Field inspector | drawer | `src/applications/forms/index.tsx:197` |  |  |  |
| validation | modal | `src/applications/forms/index.tsx:198` | F |  |  |
| publish review | modal | `src/applications/forms/index.tsx:199` |  |  |  |

## ARL-FORMS-003 · Conditional Logic  
Route `/o/:org/forms/forms/:id/logic` · sample `nl-forms-001` · archetype graph · collection `forms`  
Tabs: Rules, Preview, Test, History  
Actions: Create condition, connect, test, fix  
Edge: Required hidden fields cannot block submission

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Rule editor | modal | `src/applications/forms/index.tsx:221` | F |  |  |
| invalid path | drawer | `src/applications/forms/index.tsx:222` |  |  |  |
| scenario tester | drawer | `src/applications/forms/index.tsx:223` |  |  |  |

## ARL-FORMS-004 · Form Submissions  
Route `/o/:org/forms/forms/:id/submissions` · sample `nl-forms-001` · archetype table · collection `forms`  
Tabs: All, New, Reviewed, Routed  
Actions: Inspect, assign, export, delete under policy  
Edge: Consent/PII handled according to retention rules

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Submission drawer | drawer | `src/applications/forms/index.tsx:244` |  |  |  |
| privacy control | modal | `src/applications/forms/index.tsx:245` | F |  |  |
| route retry | modal | `src/applications/forms/index.tsx:246` | F |  |  |

## ARL-FORMS-005 · Form Design & Publish  
Route `/o/:org/forms/forms/:id/publish` · sample `nl-forms-001` · archetype editor · collection `forms`  
Tabs: Design, Embed, Access, Analytics  
Actions: Style, preview, generate link, publish  
Edge: Published form version remains traceable to submissions

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Theme inspector | drawer | `src/applications/forms/index.tsx:266` |  |  |  |
| access control | modal | `src/applications/forms/index.tsx:267` | F |  |  |
| embed tester | drawer | `src/applications/forms/index.tsx:268` |  |  |  |

## ARL-FORMS-006 · Form Analytics  
Route `/o/:org/forms/forms/:id/analytics` · sample `nl-forms-001` · archetype report · collection `forms`  
Tabs: Funnel, Responses, Sources, Timing  
Actions: Compare, export, create experiment  
Edge: Privacy-safe analytics; no invented completion data

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Metric methods | modal | `src/applications/forms/index.tsx:291` | F |  |  |
| test report | drawer | `src/applications/forms/index.tsx:292` |  |  |  |
| field insight | drawer | `src/applications/forms/index.tsx:295` |  |  |  |
