# DOCS · screen and overlay inventory (generated from src/generated/catalog.json + scripts/audit-native-overlays.mjs)

Regenerated 2026-11-19. Columns: source = where the overlay is declared; flags = D description, G guidance, C capability, F footer.


## ARL-DOCS-001 · Document Library  
Route `/o/:org/docs/files` · sample `nl-documents-001` · archetype directory · collection `documents`  
Tabs: Recent, My docs, Shared, Templates, Archive  
Actions: Create, upload, move, search, share  
Edge: Confidential documents excluded from broad preview

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| New doc | modal | `src/applications/docs/index.tsx:3374` | F |  |  |
| folder selector | modal | `src/applications/docs/index.tsx:3375` | F |  |  |
| sharing | drawer | `src/applications/docs/index.tsx:3376` | G |  |  |
| trash confirm | modal | `src/applications/docs/index.tsx:3377` | F |  |  |

## ARL-DOCS-002 · Document Editor  
Route `/o/:org/docs/documents/:id` · sample `nl-documents-001` · archetype editor · collection `documents`  
Tabs: Write, Review, Layout, References  
Actions: Type, format, insert, comment, accept changes, export  
Edge: Autosave conflict creates merge/recoverable version

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Styles | drawer | `src/applications/docs/index.tsx:3397` | F |  |  |
| insert table | modal | `src/applications/docs/index.tsx:3398` | F |  |  |
| citations | modal | `src/applications/docs/index.tsx:3399` | F |  |  |
| link | modal | `src/applications/docs/index.tsx:3400` | F |  |  |
| export | modal | `src/applications/docs/index.tsx:3401` | F |  |  |

## ARL-DOCS-003 · Outline & Navigation  
Route `/o/:org/docs/documents/:id/outline` · sample `nl-documents-001` · archetype directory · collection `documents`  
Tabs: Headings, Bookmarks, Comments  
Actions: Reorder heading, jump, collapse, add section  
Edge: Reorder preserves references and anchored comments

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Heading properties | modal | `src/applications/docs/index.tsx:3420` | F |  |  |
| document structure warning | drawer | `src/applications/docs/index.tsx:3421` |  |  |  |

## ARL-DOCS-004 · Review & Comments  
Route `/o/:org/docs/documents/:id/review` · sample `nl-documents-001` · archetype record · collection `documents`  
Tabs: Comments, Changes, Approvals, Versions  
Actions: Suggest edit, accept/reject, mention, approve  
Edge: Approval cannot silently erase unresolved mandatory review

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Comment thread | drawer | `src/applications/docs/index.tsx:3440` | F |  |  |
| diff | drawer | `src/applications/docs/index.tsx:3441` |  |  |  |
| reviewer assignment | modal | `src/applications/docs/index.tsx:3442` | F |  |  |

## ARL-DOCS-005 · Templates  
Route `/o/:org/docs/templates` · sample `nl-templates-001` · archetype directory · collection `templates`  
Tabs: All, Company, Department, My templates  
Actions: Create, use, edit master, retire  
Edge: Existing signed document not silently updated by template change

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Template editor | drawer | `src/applications/docs/index.tsx:3465` | F |  |  |
| token mapping | modal | `src/applications/docs/index.tsx:3466` | F |  |  |
| change impact | drawer | `src/applications/docs/index.tsx:3467` |  |  |  |

## ARL-DOCS-006 · Publishing & Export  
Route `/o/:org/docs/documents/:id/publish` · sample `nl-documents-001` · archetype admin · collection `documents`  
Tabs: Export, Share, Publish, History  
Actions: Preview, export, request e-sign, revoke link  
Edge: Public link access must be clearly bounded and revocable

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| PDF settings | modal | `src/applications/docs/index.tsx:3485` | F |  |  |
| link permissions | modal | `src/applications/docs/index.tsx:3486` | F |  |  |
| signature request | modal | `src/applications/docs/index.tsx:3487` | F |  |  |

## ARL-DOCS-007 · Document Insights  
Route `/o/:org/docs/documents/:id/insights` · sample `nl-documents-001` · archetype report · collection `documents`  
Tabs: Writing, Accuracy, Brand, Sources  
Actions: Review suggestion, apply selected, inspect citations  
Edge: No unreviewed legal advice or fabricated source citations

| Overlay | Kind | Source | Flags | Disposition | Notes |
|---|---|---|---|---|---|
| Suggestion diff | modal | `src/applications/docs/index.tsx:3502` | F |  |  |
| source inspection | drawer | `src/applications/docs/index.tsx:3503` |  |  |  |
| style settings | modal | `src/applications/docs/index.tsx:3504` | F |  |  |
