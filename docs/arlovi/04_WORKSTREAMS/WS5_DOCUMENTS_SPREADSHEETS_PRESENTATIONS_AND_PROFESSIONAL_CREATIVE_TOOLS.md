# WS5 — Documents, Spreadsheets, Presentations and Professional Creative Tools

**Executive lead:** Chief Creative Technology Officer | **Owned domains:** 8 | **Screens:** 56 | **Tabs:** 224 | **Overlays:** 172 | **Primary actions:** 257

**North star:** Real editable production experiences, comparable in interaction quality and professional workflow depth to recognized office and creative software, within browser-local constraints.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Documents: structured rich-text WYSIWYG, styles, tables, comments, trackable versions, page/print/export layouts and keyboard formatting.
- Sheets: cell navigation, references, formulas with actual calculation, validation, range selection, copy/paste, sheets/tabs, charts and reliable CSV/XLSX-compatible import/export where supported.
- Presentations: slide thumbnails, elements, reusable themes, templates, master styles, speaker notes, transitions and presentation/fullscreen viewing.
- Design: vector shapes, pen/path precision, text, layers, frames, snapping, guides, constraints, responsive component properties, gradient stops, SVG/PNG export and undo.
- Photo: layers, crop, selection/masking, adjustment state, filters, compositing, original preservation and valid image export.
- Layout: pages, text flow, parent/master pages, margins, columns, bleed and PDF/print export feasibility; do not promise unsupported print fidelity.
- Video/Motion: media import, multitrack timeline, trimming, split, transport, captions, keyframes, easing, audio and actual browser-feasible export; clear capability limits for large renders.
- All editors: preserve structured assets in local store, implement version history, multi-format assets, branded templates, content-specific contextual inspectors and AI edit previews.


## Owned applications and screen-level contracts


### DOCS — Documents & Knowledge Writing

**Purpose:** Professional collaborative rich text, governed templates, policy drafting, document sharing and AI context editing.

**Human/AI users:** All members; editors; legal reviewer; AI content specialists

**Entities:** Document; Paragraph; Style; Comment; DocumentVersion; Template

**Competitor benchmarking:** Microsoft Word; Google Docs; Notion

**Screen count:** 7

#### ARL-DOCS-001 — Document Library

**Route:** `/o/:org/docs/files` | **Archetype:** `directory`

**Layout/content:** Folders; recents; shared; tags; ownership; access; versions.

**Tabs (5):** Recent, My docs, Shared, Templates, Archive

**Primary actions (5):** Create, upload, move, search, share

**Context overlays (4):** New doc, folder selector, sharing, trash confirm

**AI behavior:** Suggests documents from approved company templates

**Risk and edge test:** Confidential documents excluded from broad preview

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/docs/files loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archive shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “New doc” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Confidential documents excluded from broad preview; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-002 — Document Editor

**Route:** `/o/:org/docs/documents/:id` | **Archetype:** `editor`

**Layout/content:** Page canvas; title; formatting ribbon; outline; inline comments; save status.

**Tabs (4):** Write, Review, Layout, References

**Primary actions (6):** Type, format, insert, comment, accept changes, export

**Context overlays (5):** Styles, insert table, citations, link, export

**AI behavior:** Drafts and revises scoped selection with tracked change preview

**Risk and edge test:** Autosave conflict creates merge/recoverable version

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/docs/documents/:id loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Write and References shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Type” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Styles” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Autosave conflict creates merge/recoverable version; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-003 — Outline & Navigation

**Route:** `/o/:org/docs/documents/:id/outline` | **Archetype:** `directory`

**Layout/content:** Heading tree; sections; bookmarks; position indicators.

**Tabs (3):** Headings, Bookmarks, Comments

**Primary actions (4):** Reorder heading, jump, collapse, add section

**Context overlays (2):** Heading properties, document structure warning

**AI behavior:** Suggests logical outline from document purpose

**Risk and edge test:** Reorder preserves references and anchored comments

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/docs/documents/:id/outline loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Headings and Comments shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reorder heading” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Heading properties” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Reorder preserves references and anchored comments; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-004 — Review & Comments

**Route:** `/o/:org/docs/documents/:id/review` | **Archetype:** `record`

**Layout/content:** Tracked edits; comments; reviewers; approval; compare versions.

**Tabs (4):** Comments, Changes, Approvals, Versions

**Primary actions (4):** Suggest edit, accept/reject, mention, approve

**Context overlays (3):** Comment thread, diff, reviewer assignment

**AI behavior:** Reviews grammar, brand and claims with references

**Risk and edge test:** Approval cannot silently erase unresolved mandatory review

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/docs/documents/:id/review loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Comments and Versions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Suggest edit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Comment thread” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Approval cannot silently erase unresolved mandatory review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-005 — Templates

**Route:** `/o/:org/docs/templates` | **Archetype:** `directory`

**Layout/content:** Brand templates; contracts; proposals; employee docs; publishing.

**Tabs (4):** All, Company, Department, My templates

**Primary actions (4):** Create, use, edit master, retire

**Context overlays (3):** Template editor, token mapping, change impact

**AI behavior:** Builds templates with validated company fields

**Risk and edge test:** Existing signed document not silently updated by template change

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/docs/templates loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and My templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Template editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Existing signed document not silently updated by template change; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-006 — Publishing & Export

**Route:** `/o/:org/docs/documents/:id/publish` | **Archetype:** `admin`

**Layout/content:** Export formats; link share; PDF preview; signing status.

**Tabs (4):** Export, Share, Publish, History

**Primary actions (4):** Preview, export, request e-sign, revoke link

**Context overlays (3):** PDF settings, link permissions, signature request

**AI behavior:** Generates output using deterministic renderer

**Risk and edge test:** Public link access must be clearly bounded and revocable

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/docs/documents/:id/publish loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Export and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Preview” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “PDF settings” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Public link access must be clearly bounded and revocable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DOCS-007 — Document Insights

**Route:** `/o/:org/docs/documents/:id/insights` | **Archetype:** `report`

**Layout/content:** AI revision proposals; readability; sources; factual checks.

**Tabs (4):** Writing, Accuracy, Brand, Sources

**Primary actions (3):** Review suggestion, apply selected, inspect citations

**Context overlays (3):** Suggestion diff, source inspection, style settings

**AI behavior:** Flags unsupported statements without inventing citations

**Risk and edge test:** No unreviewed legal advice or fabricated source citations

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/docs/documents/:id/insights loads only scoped document data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Writing and Sources shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review suggestion” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Suggestion diff” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No unreviewed legal advice or fabricated source citations; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### SHEETS — Spreadsheets, Models & Structured Data

**Purpose:** Excel-class editable grid, formulas, charts, data modelling, shared datasets and deterministic calculation.

**Human/AI users:** Analyst; finance; operations; marketer; spreadsheet AI

**Entities:** Workbook; Worksheet; Cell; Formula; NamedRange; Chart; DataConnection

**Competitor benchmarking:** Excel; Google Sheets; Airtable

**Screen count:** 7

#### ARL-SHEETS-001 — Workbook Library

**Route:** `/o/:org/sheets/workbooks` | **Archetype:** `directory`

**Layout/content:** Workbooks; folders; collaborators; templates; last change.

**Tabs (4):** Recent, Mine, Shared, Templates

**Primary actions (5):** Create, import, duplicate, search, archive

**Context overlays (3):** Import mapper, new workbook, share

**AI behavior:** Recommends templates grounded in workflow

**Risk and edge test:** Large files processed without silent formula loss

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Import mapper” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Large files processed without silent formula loss; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-002 — Grid Editor

**Route:** `/o/:org/sheets/workbooks/:id` | **Archetype:** `editor`

**Layout/content:** Worksheet tabs; formula bar; grid; row/column headers; formatting.

**Tabs (5):** Sheet tabs, Data, Formulas, Review, View

**Primary actions (7):** Edit cell, paste, fill, sort, filter, freeze, undo

**Context overlays (4):** Format cells, data validation, named range, chart picker

**AI behavior:** Proposes formulas and edits as explicit cell diffs

**Risk and edge test:** Deterministic recalculation and dependency graph required

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Sheet tabs and View shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit cell” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Format cells” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Deterministic recalculation and dependency graph required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-003 — Formula Manager

**Route:** `/o/:org/sheets/workbooks/:id/formulas` | **Archetype:** `editor`

**Layout/content:** Formula list; dependencies; named formulas; detected errors.

**Tabs (4):** All, Errors, Dependencies, Named ranges

**Primary actions (4):** Inspect, fix selected, recalculate, compare

**Context overlays (3):** Formula inspector, function help, circular reference

**AI behavior:** Explains formulas and proposes correction with test data

**Risk and edge test:** Circular formulas and unsupported functions show explicit errors

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id/formulas loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Named ranges shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Formula inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Circular formulas and unsupported functions show explicit errors; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-004 — Data Tables

**Route:** `/o/:org/sheets/workbooks/:id/tables` | **Archetype:** `table`

**Layout/content:** Structured table schema; filters; grouping; types; validation.

**Tabs (4):** Tables, Views, Relationships, Validation

**Primary actions (4):** Create table, edit schema, import, connect

**Context overlays (3):** Column editor, import schema, relation preview

**AI behavior:** Suggests cleanup and derived columns

**Risk and edge test:** Schema change protects references and dependent apps

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id/tables loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Tables and Validation shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create table” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Column editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Schema change protects references and dependent apps; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-005 — Charts & Dashboards

**Route:** `/o/:org/sheets/workbooks/:id/charts` | **Archetype:** `editor`

**Layout/content:** Chart builder; data range; series; labels; styles; interactive filters.

**Tabs (4):** Charts, Pivot, Dashboard, Presentation

**Primary actions (4):** Create chart, change type, drill down, publish

**Context overlays (3):** Series editor, formatting inspector, calculation note

**AI behavior:** Proposes accessible visualization with source links

**Risk and edge test:** Chart series updates correctly on changed range

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id/charts loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Charts and Presentation shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create chart” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Series editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Chart series updates correctly on changed range; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-006 — Import & Export

**Route:** `/o/:org/sheets/workbooks/:id/io` | **Archetype:** `admin`

**Layout/content:** File types; mapping; formula compatibility; export previews.

**Tabs (4):** Imports, Exports, Errors, History

**Primary actions (5):** Upload, map columns, test, publish, export

**Context overlays (3):** Import wizard, compatibility report, rollback

**AI behavior:** Maps schema and flags ambiguous values

**Risk and edge test:** Never silently coerce dates, currencies or formula types

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id/io loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Imports and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Import wizard” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Never silently coerce dates, currencies or formula types; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-SHEETS-007 — Collaboration & Versioning

**Route:** `/o/:org/sheets/workbooks/:id/collab` | **Archetype:** `record`

**Layout/content:** Presence; changed cells; comments; protection; comparison.

**Tabs (4):** Comments, History, Permissions, Changes

**Primary actions (5):** Comment, compare, protect, restore, merge

**Context overlays (3):** Conflict resolver, protected range, restore confirmation

**AI behavior:** Explains what changed and source implications

**Risk and edge test:** Two users editing same cell require conflict strategy

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/sheets/workbooks/:id/collab loads only scoped workbook data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Comments and Changes shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Comment” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Conflict resolver” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Two users editing same cell require conflict strategy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### PRESENT — Presentations & Storytelling

**Purpose:** Native slide design, reusable brand masters, presentations, animation, charts, speaker support and collaborative review.

**Human/AI users:** Executive; marketer; designer; analyst; AI presentation designer

**Entities:** Deck; Slide; Master; Shape; Animation; Comment

**Competitor benchmarking:** PowerPoint; Google Slides; Canva

**Screen count:** 7

#### ARL-PRESENT-001 — Presentation Library

**Route:** `/o/:org/present/decks` | **Archetype:** `directory`

**Layout/content:** Recent decks; templates; teams; status; formats.

**Tabs (4):** Recent, Shared, Templates, Archived

**Primary actions (4):** Create deck, import, duplicate, present

**Context overlays (3):** Import, new deck, template preview

**AI behavior:** Builds on-brand outline from business brief

**Risk and edge test:** Font and media substitutions disclosed on import

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/present/decks loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create deck” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Import” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Font and media substitutions disclosed on import; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-002 — Slide Editor

**Route:** `/o/:org/present/decks/:id` | **Archetype:** `editor`

**Layout/content:** Slide thumbnails; main canvas; toolbar; object inspector; speaker notes.

**Tabs (5):** Design, Insert, Animate, Review, View

**Primary actions (6):** Insert slide, drag object, align, resize, comment, undo

**Context overlays (4):** Layout picker, image insert, properties, AI suggestion

**AI behavior:** Builds/edit slides as editable object graph

**Risk and edge test:** Selected objects remain editable after AI changes

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and View shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Insert slide” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Layout picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Selected objects remain editable after AI changes; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-003 — Master & Theme Editor

**Route:** `/o/:org/present/decks/:id/theme` | **Archetype:** `editor`

**Layout/content:** Theme tokens; master layouts; brand typography; slide variants.

**Tabs (4):** Masters, Colours, Fonts, Layouts

**Primary actions (3):** Change master, create layout, preview impact

**Context overlays (3):** Theme editor, global apply review, font resolver

**AI behavior:** Maps brand guide into slide styles

**Risk and edge test:** Theme updates do not silently overwrite customized objects

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id/theme loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Masters and Layouts shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Change master” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Theme editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Theme updates do not silently overwrite customized objects; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-004 — Charts & Data

**Route:** `/o/:org/present/decks/:id/data` | **Archetype:** `editor`

**Layout/content:** Chart objects; linked datasets; snapshots; refresh status.

**Tabs (4):** Charts, Tables, Sources, Refresh

**Primary actions (4):** Insert chart, link sheet, update data, show labels

**Context overlays (3):** Dataset picker, chart inspector, unlink warning

**AI behavior:** Creates explanatory graphics from verified company data

**Risk and edge test:** Source freshness and stale chart snapshot visible

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id/data loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Charts and Refresh shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Insert chart” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Dataset picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Source freshness and stale chart snapshot visible; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-005 — Transitions & Animation

**Route:** `/o/:org/present/decks/:id/animation` | **Archetype:** `timeline`

**Layout/content:** Slide transitions; object order; easing; durations; timing.

**Tabs (4):** Slides, Objects, Timing, Preview

**Primary actions (4):** Add animation, sequence, test, reduce motion

**Context overlays (3):** Motion inspector, playback, accessibility review

**AI behavior:** Recommends subtle motion and time controls

**Risk and edge test:** Presentation remains understandable with animations disabled

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id/animation loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Slides and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add animation” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Motion inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Presentation remains understandable with animations disabled; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-006 — Presenter Mode

**Route:** `/o/:org/present/decks/:id/present` | **Archetype:** `media`

**Layout/content:** Audience slide; notes; timer; next slide; remote control.

**Tabs (3):** Audience, Presenter, Rehearsal

**Primary actions (5):** Present, advance, annotate, end, export notes

**Context overlays (3):** Display selector, rehearsal report, access confirmation

**AI behavior:** Provides optional speaking cues without replacing presenter

**Risk and edge test:** Private notes never appear on public display

**Archetype design contract:** Live audio/video control workspace | Media preview, timeline/transcript, accessible controls and consent. | Essential transport controls visible; auxiliary views behind tabs.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id/present loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Audience and Rehearsal shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Present” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Display selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Private notes never appear on public display; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PRESENT-007 — Review & Publish

**Route:** `/o/:org/present/decks/:id/review` | **Archetype:** `record`

**Layout/content:** Comments; comparison; approvals; PDF/PPTX export; share.

**Tabs (4):** Comments, History, Export, Publish

**Primary actions (4):** Resolve, approve, export, share

**Context overlays (3):** Version comparison, export settings, approval

**AI behavior:** Checks brand, readability and attribution

**Risk and edge test:** Export quality and editable format tested

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/present/decks/:id/review loads only scoped deck data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Comments and Publish shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Resolve” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Version comparison” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Export quality and editable format tested; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### DESIGN — Vector Design & UI Studio

**Purpose:** Professional vector canvas and reusable design system with direct editing, auto layout, components and AI-assisted design.

**Human/AI users:** Creative Director; designer; marketer; AI design specialist

**Entities:** DesignFile; Frame; VectorNode; TextNode; Component; Token; Asset

**Competitor benchmarking:** Figma; Illustrator; Adobe Express

**Screen count:** 10

#### ARL-DESIGN-001 — Design Files

**Route:** `/o/:org/design/files` | **Archetype:** `directory`

**Layout/content:** Creative file gallery; teams; formats; asset links; ownership.

**Tabs (4):** Recent, Shared, Brand, Templates

**Primary actions (5):** New file, import SVG, duplicate, fork, archive

**Context overlays (3):** File setup, import issues, sharing

**AI behavior:** Offers approved templates and design briefs

**Risk and edge test:** Imported fonts and vector effects disclose unsupported features

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/design/files loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “New file” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “File setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Imported fonts and vector effects disclose unsupported features; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-002 — Design Canvas

**Route:** `/o/:org/design/files/:id` | **Archetype:** `canvas`

**Layout/content:** Infinite canvas; page/layer sidebar; contextual tools; inspector; collaboration.

**Tabs (4):** Design, Prototype, Inspect, Comments

**Primary actions (8):** Select, draw, drag, resize, rotate, crop, zoom, pan

**Context overlays (4):** Insert tools, fill picker, style inspector, export

**AI behavior:** Edits selected structured elements rather than flattening image

**Risk and edge test:** Unsaved operations recovered; large canvas virtualized

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and Comments shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Select” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Insert tools” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unsaved operations recovered; large canvas virtualized; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-003 — Layers & Pages

**Route:** `/o/:org/design/files/:id/layers` | **Archetype:** `directory`

**Layout/content:** Hierarchical pages; groups; visibility; locks; z-order; search.

**Tabs (4):** Pages, Layers, Assets, Components

**Primary actions (6):** Rename, group, reorder, lock, isolate, select

**Context overlays (3):** Layer context, move-to-page, component detach

**AI behavior:** Suggests meaningful naming and organization

**Risk and edge test:** Hidden/locked layers cannot be edited accidentally

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/layers loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pages and Components shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Rename” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Layer context” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Hidden/locked layers cannot be edited accidentally; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-004 — Vector Path Editor

**Route:** `/o/:org/design/files/:id/paths` | **Archetype:** `canvas`

**Layout/content:** Anchor points; bezier handles; path joins; booleans; outlines.

**Tabs (4):** Pen, Curves, Boolean, Offset

**Primary actions (5):** Add point, adjust handle, join, subtract, simplify

**Context overlays (3):** Point inspector, path operations, stroke editing

**AI behavior:** Proposes path refinements as reversible operations

**Risk and edge test:** Path exports preserve scale and fill rules

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/paths loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pen and Offset shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add point” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Point inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Path exports preserve scale and fill rules; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-005 — Auto Layout & Responsive

**Route:** `/o/:org/design/files/:id/layout` | **Archetype:** `editor`

**Layout/content:** Direction; hug/fill/fixed; gap; padding; constraints; breakpoints.

**Tabs (4):** Layout, Constraints, Responsive, Grid

**Primary actions (5):** Set size, reorder, wrap, preview width, apply rules

**Context overlays (3):** Layout inspector, constraint conflict, breakpoint preview

**AI behavior:** Converts design intention into structured layout changes

**Risk and edge test:** Mixed fixed and responsive child constraints validated

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/layout loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Layout and Grid shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set size” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Layout inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Mixed fixed and responsive child constraints validated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-006 — Components & Variants

**Route:** `/o/:org/design/files/:id/components` | **Archetype:** `directory`

**Layout/content:** Reusable components; variants; properties; instances; overrides.

**Tabs (4):** Library, Local, Variants, Usage

**Primary actions (5):** Create component, publish, swap, detach, inspect uses

**Context overlays (3):** Variant editor, library publish, breaking-change diff

**AI behavior:** Identifies duplication and recommends reusable patterns

**Risk and edge test:** Global component change shows affected instances

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/components loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Library and Usage shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create component” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Variant editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Global component change shows affected instances; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-007 — Typography & Styles

**Route:** `/o/:org/design/files/:id/styles` | **Archetype:** `editor`

**Layout/content:** Text styles; colours; gradients; effects; variable tokens.

**Tabs (4):** Text, Colour, Effects, Variables

**Primary actions (4):** Create style, edit token, apply to selection, inspect contrast

**Context overlays (3):** Font browser, gradient editor, style impact

**AI behavior:** Applies approved brand rules and contrast checks

**Risk and edge test:** Unavailable font is substituted only with disclosure

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/styles loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Text and Variables shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create style” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Font browser” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unavailable font is substituted only with disclosure; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-008 — Prototype & Interactions

**Route:** `/o/:org/design/files/:id/prototype` | **Archetype:** `graph`

**Layout/content:** Hotspots; transitions; screen flow; overlays; interactive preview.

**Tabs (4):** Flow, Interactions, Preview, Share

**Primary actions (4):** Link screens, set trigger, run preview, publish prototype

**Context overlays (3):** Interaction editor, transition options, device preview

**AI behavior:** Suggests coherent navigation and interaction patterns

**Risk and edge test:** Prototype cannot masquerade as connected production backend

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/prototype loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Flow and Share shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Link screens” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Interaction editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Prototype cannot masquerade as connected production backend; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-009 — Assets & Export

**Route:** `/o/:org/design/files/:id/assets` | **Archetype:** `directory`

**Layout/content:** Media; icons; linked styles; export slices; size variants.

**Tabs (4):** Assets, Symbols, Exports, History

**Primary actions (4):** Replace asset, crop, batch export, organize

**Context overlays (3):** Asset picker, export settings, license note

**AI behavior:** Recommends approved imagery and reusable symbols

**Risk and edge test:** Rights and licensing metadata preserved

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/assets loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Assets and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Replace asset” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Asset picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Rights and licensing metadata preserved; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-DESIGN-010 — Design Review

**Route:** `/o/:org/design/files/:id/review` | **Archetype:** `record`

**Layout/content:** Comment pins; change requests; approvals; accessibility notes.

**Tabs (4):** Comments, Reviews, Diff, History

**Primary actions (4):** Annotate, approve, compare, assign fixes

**Context overlays (3):** Comment editor, version compare, signoff

**AI behavior:** Runs design QA against brand and interaction brief

**Risk and edge test:** Approval binds to specific version not future edits

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/design/files/:id/review loads only scoped designfile data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Comments and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Annotate” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Comment editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Approval binds to specific version not future edits; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### PHOTO — Photo & Image Editing

**Purpose:** Native raster editing with masks, layers, image corrections, compositing, AI-assisted targeted edits and batch export.

**Human/AI users:** Designer; photographer; marketer; AI image specialist

**Entities:** RasterDocument; Layer; Mask; Adjustment; ExportPreset

**Competitor benchmarking:** Photoshop; Lightroom; Affinity Photo

**Screen count:** 7

#### ARL-PHOTO-001 — Photo Library

**Route:** `/o/:org/photo/photos` | **Archetype:** `directory`

**Layout/content:** Albums; metadata; rights; thumbnails; edits; asset links.

**Tabs (4):** Recent, Albums, Shared, Imports

**Primary actions (5):** Upload, tag, select, compare, open

**Context overlays (3):** Bulk import, asset detail, license

**AI behavior:** Classifies images within allowed data use

**Risk and edge test:** Corrupt or unsupported format does not compromise library

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/photo/photos loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Imports shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Bulk import” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Corrupt or unsupported format does not compromise library; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-002 — Raster Editor

**Route:** `/o/:org/photo/photos/:id` | **Archetype:** `canvas`

**Layout/content:** Image canvas; layers; toolstrip; histogram; adjustment inspector.

**Tabs (4):** Edit, Layers, Adjust, Review

**Primary actions (6):** Crop, brush, clone, transform, paint, undo

**Context overlays (3):** Tool options, canvas size, adjustment layer

**AI behavior:** Proposes scoped edits without altering untouched regions

**Risk and edge test:** Destructive transformations versioned and restorable

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/photo/photos/:id loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Edit and Review shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Crop” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Tool options” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Destructive transformations versioned and restorable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-003 — Selections & Masks

**Route:** `/o/:org/photo/photos/:id/masks` | **Archetype:** `canvas`

**Layout/content:** Selection tools; feather; edge refinement; mask preview.

**Tabs (4):** Select, Refine, Mask, Compare

**Primary actions (5):** Lasso, select subject, refine edge, invert, mask

**Context overlays (3):** Selection options, refinement, quick mask

**AI behavior:** Creates provisional masks requiring visual review

**Risk and edge test:** Selection persists correctly across image transforms

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/photo/photos/:id/masks loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Select and Compare shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Lasso” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Selection options” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Selection persists correctly across image transforms; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-004 — Adjustments & Colour

**Route:** `/o/:org/photo/photos/:id/adjust` | **Archetype:** `editor`

**Layout/content:** Exposure; colour balance; curves; levels; colour profiles.

**Tabs (4):** Basic, Curves, Colour, Detail

**Primary actions (4):** Adjust slider, reset, save preset, compare

**Context overlays (3):** Histogram, colour picker, profile warning

**AI behavior:** Suggests correction settings with preview

**Risk and edge test:** Colour profile conversion identified and tested

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/photo/photos/:id/adjust loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Basic and Detail shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust slider” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Histogram” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Colour profile conversion identified and tested; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-005 — Compositing & Layers

**Route:** `/o/:org/photo/photos/:id/layers` | **Archetype:** `directory`

**Layout/content:** Layer blend; opacity; groups; masks; smart references.

**Tabs (4):** Layers, Groups, Effects, History

**Primary actions (5):** Reorder, group, blend, transform, replace

**Context overlays (3):** Blend picker, layer properties, linked object

**AI behavior:** Suggests composites using authorized assets

**Risk and edge test:** AI results never silently flatten editable layer hierarchy

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/photo/photos/:id/layers loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Layers and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reorder” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Blend picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI results never silently flatten editable layer hierarchy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-006 — Batch Processing

**Route:** `/o/:org/photo/batch` | **Archetype:** `builder`

**Layout/content:** Selection; presets; rename; size; export target; progress.

**Tabs (4):** Queue, Presets, Results, Failed

**Primary actions (4):** Build batch, test sample, execute, download

**Context overlays (3):** Preset editor, overwrite confirmation, result report

**AI behavior:** Prepares correct variants for target channels

**Risk and edge test:** Jobs resumable; output collisions handled deterministically

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/photo/batch loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Queue and Failed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build batch” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Preset editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Jobs resumable; output collisions handled deterministically; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PHOTO-007 — Photo Export

**Route:** `/o/:org/photo/photos/:id/export` | **Archetype:** `admin`

**Layout/content:** Formats; compression; dimensions; metadata; transparency.

**Tabs (3):** Export, Presets, Publish

**Primary actions (4):** Set format, preview, export, upload to asset library

**Context overlays (3):** Export preview, rights, profile handling

**AI behavior:** Chooses format by intended use

**Risk and edge test:** Aspect ratio and transparency not silently altered

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/photo/photos/:id/export loads only scoped rasterdocument data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Export and Publish shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set format” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Export preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Aspect ratio and transparency not silently altered; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### LAYOUT — Editorial Layout & Publishing

**Purpose:** Multi-page design for reports, proposals, magazines and print assets with grids, typesetting and preflight.

**Human/AI users:** Editorial designer; communications; document specialist

**Entities:** Publication; Spread; PageMaster; TextFlow; PrintPreset

**Competitor benchmarking:** Adobe InDesign; Affinity Publisher

**Screen count:** 5

#### ARL-LAYOUT-001 — Publication Library

**Route:** `/o/:org/layout/publications` | **Archetype:** `directory`

**Layout/content:** Books; brochures; reports; revisions; formats.

**Tabs (4):** Recent, Company, Templates, Archive

**Primary actions (4):** New publication, import, duplicate, open

**Context overlays (3):** Page preset, import review, share

**AI behavior:** Builds layout draft from approved business content

**Risk and edge test:** Print metric units and bleed preserved on import

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/layout/publications loads only scoped publication data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archive shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “New publication” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Page preset” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Print metric units and bleed preserved on import; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LAYOUT-002 — Publication Editor

**Route:** `/o/:org/layout/publications/:id` | **Archetype:** `canvas`

**Layout/content:** Spread canvas; pages panel; text flow; layout inspector; rulers.

**Tabs (4):** Pages, Layout, Type, Review

**Primary actions (5):** Create page, place frame, flow text, snap, export

**Context overlays (3):** Frame editor, page settings, overset warning

**AI behavior:** Arranges source text and images to grid

**Risk and edge test:** Overset text must never vanish silently

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/layout/publications/:id loads only scoped publication data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pages and Review shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create page” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Frame editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Overset text must never vanish silently; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LAYOUT-003 — Master Pages

**Route:** `/o/:org/layout/publications/:id/masters` | **Archetype:** `editor`

**Layout/content:** Reusable page templates; folios; headers; variable content.

**Tabs (3):** Masters, Variables, Usage

**Primary actions (4):** Create master, apply, override, preview

**Context overlays (2):** Master editor, override confirmation

**AI behavior:** Generates branded master layouts

**Risk and edge test:** Global master change shows impact on all spreads

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/layout/publications/:id/masters loads only scoped publication data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Masters and Usage shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create master” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Master editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Global master change shows impact on all spreads; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LAYOUT-004 — Typography & Flow

**Route:** `/o/:org/layout/publications/:id/typography` | **Archetype:** `editor`

**Layout/content:** Styles; baselines; linked text frames; hyphenation.

**Tabs (4):** Paragraph, Character, Flow, Accessibility

**Primary actions (4):** Edit styles, link frames, adjust tracking, inspect overset

**Context overlays (3):** Text style, flow options, preflight issue

**AI behavior:** Proposes typography improvements with legibility checks

**Risk and edge test:** Page break and thread order remain deterministic

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/layout/publications/:id/typography loads only scoped publication data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Paragraph and Accessibility shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit styles” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Text style” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Page break and thread order remain deterministic; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LAYOUT-005 — Print & Preflight

**Route:** `/o/:org/layout/publications/:id/preflight` | **Archetype:** `report`

**Layout/content:** Bleed; colour modes; missing fonts; image resolution; export proof.

**Tabs (4):** Preflight, Proof, Export, History

**Primary actions (4):** Inspect issue, fix, proof, export press PDF

**Context overlays (3):** Preflight detail, export setup, missing asset

**AI behavior:** Detects layout problems and proposes fixes

**Risk and edge test:** Noncompliant print output blocked or clearly warned

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/layout/publications/:id/preflight loads only scoped publication data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Preflight and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect issue” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Preflight detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Noncompliant print output blocked or clearly warned; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### VIDEO — Video Production & Editing

**Purpose:** Professional non-linear editing, assets, multitrack audio/video, captions, review and export.

**Human/AI users:** Video editor; producer; marketer; AI editor

**Entities:** VideoProject; Sequence; Clip; Track; RenderJob; Caption

**Competitor benchmarking:** Premiere Pro; DaVinci Resolve; CapCut

**Screen count:** 8

#### ARL-VIDEO-001 — Video Projects

**Route:** `/o/:org/video/projects` | **Archetype:** `directory`

**Layout/content:** Projects; footage; duration; status; render queue; collaborators.

**Tabs (4):** Recent, Shared, Templates, Archived

**Primary actions (4):** Create, import media, duplicate, open

**Context overlays (3):** Media import, new sequence, project settings

**AI behavior:** Proposes storyboard and edit plan

**Risk and edge test:** Footage privacy/licensing checked on ingest

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/video/projects loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Media import” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Footage privacy/licensing checked on ingest; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-002 — Video Timeline

**Route:** `/o/:org/video/projects/:id` | **Archetype:** `timeline`

**Layout/content:** Multitrack video; waveform audio; preview; effects; bins; inspector.

**Tabs (5):** Edit, Colour, Audio, Captions, Export

**Primary actions (6):** Trim, split, ripple, drag clips, scrub, undo

**Context overlays (3):** Clip property, transition editor, proxy status

**AI behavior:** Builds rough cut from approved shot list

**Risk and edge test:** Timeline timebase stable across variable frame rate assets

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Edit and Export shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Trim” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Clip property” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Timeline timebase stable across variable frame rate assets; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-003 — Media Bin

**Route:** `/o/:org/video/projects/:id/media` | **Archetype:** `directory`

**Layout/content:** Footage; audio; graphics; proxies; transcoding; metadata.

**Tabs (4):** Media, Folders, Proxy, Missing

**Primary actions (5):** Import, relink, tag, proxy generate, audition

**Context overlays (3):** Media inspector, relink file, license

**AI behavior:** Tags scenes and proposes selects

**Risk and edge test:** Missing footage never silently replaced with unrelated media

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/media loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Media and Missing shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Import” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Media inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Missing footage never silently replaced with unrelated media; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-004 — Audio Mixer

**Route:** `/o/:org/video/projects/:id/audio` | **Archetype:** `editor`

**Layout/content:** Audio tracks; gain; meters; ducking; effects; mix groups.

**Tabs (4):** Tracks, Mixer, Effects, Loudness

**Primary actions (4):** Adjust gain, mute, automate, export mix

**Context overlays (3):** Mixer property, loudness review, voice cleanup

**AI behavior:** Suggests narration and cleanup, respecting voice consent

**Risk and edge test:** Audio export warns about clipping and loudness failures

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/audio loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Tracks and Loudness shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust gain” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Mixer property” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Audio export warns about clipping and loudness failures; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-005 — Captions & Transcript

**Route:** `/o/:org/video/projects/:id/captions` | **Archetype:** `editor`

**Layout/content:** Timecoded transcript; caption track; styles; translations.

**Tabs (4):** Transcript, Captions, Languages, Review

**Primary actions (5):** Correct, split cue, time, style, export SRT

**Context overlays (3):** Caption editor, speaker verification, language review

**AI behavior:** Produces draft captions for human QA

**Risk and edge test:** Subtitle text not treated as word-perfect without review

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/captions loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Transcript and Review shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Correct” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Caption editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Subtitle text not treated as word-perfect without review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-006 — Colour & Effects

**Route:** `/o/:org/video/projects/:id/effects` | **Archetype:** `editor`

**Layout/content:** Effect stack; keyframes; LUTs; colour scopes; preview.

**Tabs (4):** Colour, Effects, Presets, Compare

**Primary actions (5):** Apply, reorder, preview, bypass, reset

**Context overlays (3):** Effect inspector, scope display, preset save

**AI behavior:** Suggests effect settings to match brief

**Risk and edge test:** Effect rendering may differ; export preflight required

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/effects loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Colour and Compare shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Apply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Effect inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Effect rendering may differ; export preflight required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-007 — Video Export & Render

**Route:** `/o/:org/video/projects/:id/export` | **Archetype:** `admin`

**Layout/content:** Codec; resolution; frame rate; bitrate; destination; jobs.

**Tabs (4):** Export, Queue, History, Failures

**Primary actions (5):** Render preview, export, cancel, download, publish

**Context overlays (3):** Render settings, compatibility, delivery confirmation

**AI behavior:** Chooses target channel formats and checks quality

**Risk and edge test:** Render is resumable; no success claimed before artifact verified

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/export loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Export and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Render preview” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Render settings” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Render is resumable; no success claimed before artifact verified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-VIDEO-008 — Video Review

**Route:** `/o/:org/video/projects/:id/review` | **Archetype:** `record`

**Layout/content:** Timecoded comments; approval; cuts; visual compare.

**Tabs (4):** Comments, Versions, Approval, Delivery

**Primary actions (4):** Comment timestamp, compare, approve, assign edit

**Context overlays (3):** Review marker, version comparison, final signoff

**AI behavior:** Summarizes requested revisions and open feedback

**Risk and edge test:** Approved cut locked to immutable asset digest

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/video/projects/:id/review loads only scoped videoproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Comments and Delivery shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Comment timestamp” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Review marker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Approved cut locked to immutable asset digest; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### MOTION — Motion Graphics & Animation

**Purpose:** Vector motion, animated typography, reusable compositions, easing, keyframes and brand motion templates.

**Human/AI users:** Motion designer; creative director; AI motion specialist

**Entities:** Composition; Keyframe; MotionLayer; AnimationPreset; RenderJob

**Competitor benchmarking:** After Effects; Rive; Lottie tooling

**Screen count:** 5

#### ARL-MOTION-001 — Motion Projects

**Route:** `/o/:org/motion/projects` | **Archetype:** `directory`

**Layout/content:** Compositions; asset links; previews; templates; brand presets.

**Tabs (4):** Recent, Shared, Templates, Renders

**Primary actions (4):** Create, import, duplicate, open

**Context overlays (3):** Composition setup, asset library, publish

**AI behavior:** Creates storyboards from creative brief

**Risk and edge test:** Missing linked assets surfaced

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/motion/projects loads only scoped composition data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Renders shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Composition setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Missing linked assets surfaced; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MOTION-002 — Composition Editor

**Route:** `/o/:org/motion/projects/:id` | **Archetype:** `timeline`

**Layout/content:** Stage; vector layers; timeline; properties; keyframes.

**Tabs (4):** Animate, Design, Effects, Preview

**Primary actions (5):** Set keyframe, drag curve, animate, preview, undo

**Context overlays (3):** Keyframe editor, layer inspector, motion picker

**AI behavior:** Creates editable keyframe sequences

**Risk and edge test:** Motion respects reduce-motion alternative output

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/motion/projects/:id loads only scoped composition data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Animate and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set keyframe” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Keyframe editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Motion respects reduce-motion alternative output; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MOTION-003 — Easing & Timing

**Route:** `/o/:org/motion/projects/:id/easing` | **Archetype:** `editor`

**Layout/content:** Bezier easing graph; duration; delays; sequencing.

**Tabs (4):** Curves, Timing, Presets, Spring

**Primary actions (4):** Edit easing, stagger, loop, test

**Context overlays (3):** Curve editor, loop validation, timing preview

**AI behavior:** Suggests motion that supports hierarchy

**Risk and edge test:** Overactive or flashing animations trigger accessibility review

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/motion/projects/:id/easing loads only scoped composition data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Curves and Spring shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit easing” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Curve editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Overactive or flashing animations trigger accessibility review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MOTION-004 — Interactive Motion

**Route:** `/o/:org/motion/projects/:id/interactive` | **Archetype:** `builder`

**Layout/content:** Hover; click; scroll; state transitions; events.

**Tabs (4):** States, Triggers, Preview, Export

**Primary actions (4):** Bind trigger, test, remove, export

**Context overlays (3):** State inspector, interaction guard, device preview

**AI behavior:** Proposes tasteful interactive sequences

**Risk and edge test:** Keyboard and touch alternatives required

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/motion/projects/:id/interactive loads only scoped composition data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between States and Export shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Bind trigger” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “State inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Keyboard and touch alternatives required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MOTION-005 — Motion Export

**Route:** `/o/:org/motion/projects/:id/export` | **Archetype:** `admin`

**Layout/content:** Video; GIF; SVG animation; Lottie compatibility; quality.

**Tabs (4):** Formats, Presets, Queue, History

**Primary actions (4):** Render, test fallback, export, publish

**Context overlays (3):** Export options, reduced-motion review, compatibility

**AI behavior:** Validates chosen output format and playback

**Risk and edge test:** Unsupported effects clearly declared before export

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/motion/projects/:id/export loads only scoped composition data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Formats and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Render” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Export options” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unsupported effects clearly declared before export; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
