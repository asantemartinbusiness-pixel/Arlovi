# WS6 — Websites, App Builder, Forms, Connectors, IT and Independent QA

**Executive lead:** Chief Platform Engineering & Quality Officer | **Owned domains:** 5 | **Screens:** 46 | **Tabs:** 193 | **Overlays:** 138 | **Primary actions:** 184

**North star:** Powerful self-service native builder, integration and reliability UX, plus independent cross-app architecture and quality verification.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Web: responsive visual page builder, reusable blocks, typography/spacing controls, CMS entries, SEO metadata, breakpoints, previews and static export; actual hosted deployment requires external service.
- Build: visual page/form/table/view builder, local entity schemas, code editor and isolated preview; export runnable frontend project artifacts; no untrusted code access to privileged application context.
- Forms: fields, validation, rules, branching, submission storage, routing, exports, accessible previews and local workflow triggering.
- Connector marketplace: capability descriptors, scopes, provider connection states, authorizations and sync inspector; no fabricated linked accounts or OAuth success.
- IT: monitor local incident/event health, connector faults, diagnostic panels, recovery procedures and truthful service limitations.
- Independent QA: generate registry-based coverage auditor, compare every screen ID/route/tab/action/overlay against implemented code and browser tests, and reject unsupported completion claims.
- Own build tooling, test harness, CI, browser screenshots/a11y sweeps, performance and npm run qa.


## Owned applications and screen-level contracts


### WEB — Websites, CMS & Hosting

**Purpose:** Responsive visual website creation with structural HTML/CSS model, content management, SEO, domains and verified deployment.

**Human/AI users:** Website owner; designer; developer; marketer; AI web engineer

**Entities:** Site; Page; Component; CMSCollection; Domain; Deployment

**Competitor benchmarking:** Webflow; Wix; Framer; Lovable

**Screen count:** 10

#### ARL-WEB-001 — Website Directory

**Route:** `/o/:org/web/sites` | **Archetype:** `directory`

**Layout/content:** Sites; environment; domain; visits; publication; ownership.

**Tabs (4):** All, Draft, Published, Archived

**Primary actions (5):** Create, duplicate, open, archive, inspect health

**Context overlays (3):** Site setup, domain attach, publish status

**AI behavior:** Recommends starting structure based on brief

**Risk and edge test:** Unknown deployment state not shown as live

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/web/sites loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Site setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown deployment state not shown as live; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-002 — Site Dashboard

**Route:** `/o/:org/web/sites/:id` | **Archetype:** `dashboard`

**Layout/content:** Pages; CMS; forms; analytics; domain; deploy history; health.

**Tabs (5):** Overview, Pages, Content, Analytics, Settings

**Primary actions (4):** Open editor, preview, view logs, deploy

**Context overlays (3):** Deploy inspector, domain check, site settings

**AI behavior:** Identifies performance and accessibility issues

**Risk and edge test:** Analytics consent and source gaps marked

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Settings shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open editor” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Deploy inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Analytics consent and source gaps marked; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-003 — Visual Page Builder

**Route:** `/o/:org/web/sites/:id/builder` | **Archetype:** `canvas`

**Layout/content:** DOM-backed canvas; element tree; breakpoint preview; style inspector.

**Tabs (4):** Build, Style, Responsive, Interactions

**Primary actions (5):** Drag component, edit text, resize, reorder, undo

**Context overlays (3):** Element inspector, insert panel, AI edit diff

**AI behavior:** Generates structured editable components and code

**Risk and edge test:** Visual preview reflects actual responsive browser layout

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/builder loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Build and Interactions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag component” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Element inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Visual preview reflects actual responsive browser layout; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-004 — Component Library

**Route:** `/o/:org/web/sites/:id/components` | **Archetype:** `directory`

**Layout/content:** Sections; design tokens; variants; reuse; dependencies.

**Tabs (4):** Local, Shared, Variants, Usage

**Primary actions (4):** Create, import, update, publish

**Context overlays (3):** Component property, breaking change, token update

**AI behavior:** Extracts reusable patterns from page

**Risk and edge test:** Global edit preview before broad replacement

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/components loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Local and Usage shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Component property” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Global edit preview before broad replacement; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-005 — CMS Editor

**Route:** `/o/:org/web/sites/:id/cms` | **Archetype:** `table`

**Layout/content:** Collections; field schemas; entries; references; publishing state.

**Tabs (4):** Collections, Entries, Relations, Import

**Primary actions (4):** Create collection, edit entry, bulk publish, import

**Context overlays (3):** Schema editor, entry detail, migration preview

**AI behavior:** Suggests content schemas and enriched content

**Risk and edge test:** Schema migration must preserve published content

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/cms loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Collections and Import shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create collection” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Schema editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Schema migration must preserve published content; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-006 — Site Navigation

**Route:** `/o/:org/web/sites/:id/navigation` | **Archetype:** `editor`

**Layout/content:** Menus; links; nesting; external destinations; responsive menu.

**Tabs (4):** Header, Footer, Mobile, Redirects

**Primary actions (4):** Reorder, add route, preview, publish

**Context overlays (3):** Link picker, redirect rules, broken link scan

**AI behavior:** Checks site information architecture

**Risk and edge test:** Deleting route surfaces incoming links and SEO implications

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/navigation loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Header and Redirects shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reorder” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Link picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Deleting route surfaces incoming links and SEO implications; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-007 — Forms & Integrations

**Route:** `/o/:org/web/sites/:id/forms` | **Archetype:** `builder`

**Layout/content:** Site forms; validation; spam policy; consent; destination records.

**Tabs (4):** Forms, Fields, Submissions, Routing

**Primary actions (4):** Edit form, test, set webhook, publish

**Context overlays (3):** Field editor, consent inspector, submission routing

**AI behavior:** Suggests form improvements and response workflows

**Risk and edge test:** Form submission never exposed to wrong tenant

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/forms loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Forms and Routing shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit form” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Field editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Form submission never exposed to wrong tenant; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-008 — SEO & Accessibility

**Route:** `/o/:org/web/sites/:id/quality` | **Archetype:** `report`

**Layout/content:** Meta; heading structure; sitemap; speed; contrast; issues.

**Tabs (4):** SEO, Accessibility, Performance, Links

**Primary actions (4):** Run audit, view issue, apply proposed fix, retest

**Context overlays (3):** Issue detail, code diff, audit report

**AI behavior:** Fixes approved content and structure

**Risk and edge test:** Claims of accessibility compliance require verified tests

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/quality loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between SEO and Links shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run audit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Issue detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Claims of accessibility compliance require verified tests; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-009 — Domains & Publishing

**Route:** `/o/:org/web/sites/:id/deploy` | **Archetype:** `admin`

**Layout/content:** Domains; DNS; environments; SSL; deployments; rollback.

**Tabs (4):** Domains, Environments, Deployments, Logs

**Primary actions (4):** Verify domain, publish, rollback, inspect

**Context overlays (3):** Publish review, DNS instructions, deployment issue

**AI behavior:** Runs preflight and diagnoses owned code

**Risk and edge test:** Published site only marked live after health checks

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/deploy loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Domains and Logs shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Verify domain” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Publish review” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Published site only marked live after health checks; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-WEB-010 — Web Analytics

**Route:** `/o/:org/web/sites/:id/analytics` | **Archetype:** `report`

**Layout/content:** Traffic; conversion; page events; sources; funnels.

**Tabs (4):** Traffic, Conversion, Events, Content

**Primary actions (4):** Build chart, compare periods, export, inspect

**Context overlays (3):** Metric source, event setup, attribution note

**AI behavior:** Finds opportunities with source links

**Risk and edge test:** Cookie consent respected and measured loss disclosed

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/web/sites/:id/analytics loads only scoped site data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Traffic and Content shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build chart” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric source” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cookie consent respected and measured loss disclosed; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### BUILD — Application Builder & Developer Studio

**Purpose:** Full-stack visual/no-code/code-native software creation with databases, API, auth, tests, deployments and governed AI engineering.

**Human/AI users:** Developer; technical owner; AI engineer; product manager

**Entities:** AppProject; SourceFile; DatabaseSchema; Environment; TestRun; Deployment

**Competitor benchmarking:** Replit; Lovable; Retool; Supabase tooling

**Screen count:** 11

#### ARL-BUILD-001 — App Project Library

**Route:** `/o/:org/build/projects` | **Archetype:** `directory`

**Layout/content:** Apps; environments; runtime; deploy status; teams; template.

**Tabs (4):** Recent, Team, Templates, Archived

**Primary actions (4):** Create, import repo, clone, open

**Context overlays (3):** Project setup, Git import, environment config

**AI behavior:** Builds architecture proposal from business brief

**Risk and edge test:** Imported code scanned and sandboxed

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/build/projects loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Project setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Imported code scanned and sandboxed; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-002 — Application Overview

**Route:** `/o/:org/build/projects/:id` | **Archetype:** `dashboard`

**Layout/content:** App status; recent deploy; backlog; issues; users; data health.

**Tabs (5):** Overview, Pages, Data, Tests, Deployments

**Primary actions (4):** Open builder, ask engineer, run tests, create issue

**Context overlays (3):** Incident inspector, release preview, task creation

**AI behavior:** Analyzes app issues without bypassing deploy gate

**Risk and edge test:** Environment labels prevent production/staging confusion

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Deployments shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open builder” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Incident inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Environment labels prevent production/staging confusion; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-003 — Visual App Builder

**Route:** `/o/:org/build/projects/:id/builder` | **Archetype:** `canvas`

**Layout/content:** Page tree; responsive canvas; component palette; property panel; data binding.

**Tabs (5):** Design, Logic, Data, Responsive, Preview

**Primary actions (4):** Add component, edit styles, bind record, simulate

**Context overlays (3):** Component inspector, expression editor, binding test

**AI behavior:** Creates editable UI with tested component semantics

**Risk and edge test:** AI modifications shown as diff and reversible

**Archetype design contract:** Spatial canvas with layers and properties | Selection, pan, zoom, snapping, objects and edit history. | Canvas remains functional, tool panels use sheets; alternate object list.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/builder loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add component” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Component inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI modifications shown as diff and reversible; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-004 — Code Editor

**Route:** `/o/:org/build/projects/:id/code` | **Archetype:** `editor`

**Layout/content:** File tree; editor; diagnostics; diff; terminal sandbox; Git status.

**Tabs (4):** Files, Source control, Problems, Tests

**Primary actions (5):** Edit, search, branch, commit, run safe command

**Context overlays (3):** File search, diff review, command authorization

**AI behavior:** Writes code, explains patch, runs allowed tests

**Risk and edge test:** No unrestricted secrets or filesystem access from prompt content

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/code loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Files and Tests shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “File search” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No unrestricted secrets or filesystem access from prompt content; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-005 — Database Designer

**Route:** `/o/:org/build/projects/:id/database` | **Archetype:** `graph`

**Layout/content:** Tables; constraints; relations; indexes; migration preview.

**Tabs (4):** Schema, Data, Migrations, Policies

**Primary actions (4):** Create table, alter schema, seed, validate policy

**Context overlays (3):** Column editor, migration diff, access policy

**AI behavior:** Proposes normalized schema and migration safeguards

**Risk and edge test:** Destructive migrations demand backup and explicit authorization

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/database loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Schema and Policies shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create table” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Column editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Destructive migrations demand backup and explicit authorization; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-006 — API & Functions

**Route:** `/o/:org/build/projects/:id/api` | **Archetype:** `editor`

**Layout/content:** Endpoints; authentication; server functions; tests; logs.

**Tabs (4):** Endpoints, Functions, Contracts, Runs

**Primary actions (4):** Define endpoint, test, deploy, inspect trace

**Context overlays (3):** Request builder, auth inspector, function diff

**AI behavior:** Builds typed API operations and test cases

**Risk and edge test:** Authorization cannot be silently removed by AI patch

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/api loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Endpoints and Runs shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Define endpoint” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Request builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Authorization cannot be silently removed by AI patch; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-007 — Authentication & Roles

**Route:** `/o/:org/build/projects/:id/auth` | **Archetype:** `admin`

**Layout/content:** Users; auth methods; RBAC; sessions; SSO; access rules.

**Tabs (4):** Users, Roles, Sessions, Providers

**Primary actions (3):** Create role, revoke session, configure provider

**Context overlays (3):** Role editor, policy simulator, authentication issue

**AI behavior:** Proposes least-privilege policy for app

**Risk and edge test:** New user does not inherit organization owner rights

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/auth loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Users and Providers shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create role” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Role editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: New user does not inherit organization owner rights; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-008 — Testing & QA

**Route:** `/o/:org/build/projects/:id/tests` | **Archetype:** `report`

**Layout/content:** Unit; integration; E2E; accessibility; security; flaky tests.

**Tabs (4):** Suites, Runs, Coverage, Issues

**Primary actions (4):** Run suite, inspect failure, approve fix, export

**Context overlays (3):** Test report, AI patch review, flaky test tracker

**AI behavior:** Coordinates specialist review and regression tests

**Risk and edge test:** Green UI not sufficient for unverified backend effects

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/tests loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Suites and Issues shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run suite” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Test report” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Green UI not sufficient for unverified backend effects; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-009 — Deployments & Environments

**Route:** `/o/:org/build/projects/:id/deploy` | **Archetype:** `admin`

**Layout/content:** Preview; staging; production; build logs; history; rollback.

**Tabs (4):** Environments, Releases, Logs, Rollbacks

**Primary actions (4):** Promote, rollback, inspect config, pause

**Context overlays (3):** Release approval, diff, rollback impact

**AI behavior:** Assists deployment only under environment policy

**Risk and edge test:** No automatic production promotion after failed gates

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/deploy loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Environments and Rollbacks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Promote” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Release approval” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No automatic production promotion after failed gates; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-010 — Integrations & Secrets

**Route:** `/o/:org/build/projects/:id/integrations` | **Archetype:** `admin`

**Layout/content:** Connected APIs; environment keys; webhooks; status; quotas.

**Tabs (4):** Connections, Secrets, Webhooks, Health

**Primary actions (4):** Attach integration, rotate secret, test, revoke

**Context overlays (3):** Secret input, webhook test, revocation

**AI behavior:** Diagnoses connectivity without exposing raw credentials

**Risk and edge test:** Secrets never rendered in AI chat or logs

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/integrations loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Connections and Health shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Attach integration” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Secret input” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Secrets never rendered in AI chat or logs; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BUILD-011 — App Analytics & Monitoring

**Route:** `/o/:org/build/projects/:id/monitor` | **Archetype:** `report`

**Layout/content:** Runtime errors; performance; user funnels; traces; costs.

**Tabs (4):** Errors, Performance, Usage, Costs

**Primary actions (4):** Inspect event, create incident, tune monitor, export

**Context overlays (3):** Trace viewer, alert rule, budget panel

**AI behavior:** Finds regressions and proposes tested repairs

**Risk and edge test:** PII redacted from trace summaries

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/build/projects/:id/monitor loads only scoped appproject data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Errors and Costs shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect event” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Trace viewer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: PII redacted from trace summaries; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### FORMS — Forms, Surveys & Intake

**Purpose:** Native responsive form builder, conditional logic, branded publishing, secure submissions and workflow routing.

**Human/AI users:** Operations; HR; marketer; service manager; AI forms assistant

**Entities:** Form; Field; ValidationRule; Submission; RoutingRule

**Competitor benchmarking:** Typeform; Google Forms; Jotform

**Screen count:** 6

#### ARL-FORMS-001 — Forms Directory

**Route:** `/o/:org/forms/forms` | **Archetype:** `directory`

**Layout/content:** Forms; status; audience; submissions; ownership.

**Tabs (4):** All, Draft, Live, Templates

**Primary actions (4):** Create, duplicate, archive, review responses

**Context overlays (3):** New form, duplicate confirm, share

**AI behavior:** Proposes relevant fields from approved process

**Risk and edge test:** Sensitive forms flagged for access and retention

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/forms/forms loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “New form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive forms flagged for access and retention; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FORMS-002 — Visual Form Builder

**Route:** `/o/:org/forms/forms/:id` | **Archetype:** `builder`

**Layout/content:** Question list; drag editor; live form preview; properties.

**Tabs (5):** Build, Logic, Design, Settings, Preview

**Primary actions (4):** Insert field, reorder, change type, publish

**Context overlays (3):** Field inspector, validation, publish review

**AI behavior:** Generates accessible forms and labels

**Risk and edge test:** Keyboard/single-pointer alternative for drag sorting

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/forms/forms/:id loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Build and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Insert field” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Field inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Keyboard/single-pointer alternative for drag sorting; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FORMS-003 — Conditional Logic

**Route:** `/o/:org/forms/forms/:id/logic` | **Archetype:** `graph`

**Layout/content:** Branches; visibility rules; required logic; evaluation.

**Tabs (4):** Rules, Preview, Test, History

**Primary actions (4):** Create condition, connect, test, fix

**Context overlays (3):** Rule editor, invalid path, scenario tester

**AI behavior:** Suggests logic while testing reachability

**Risk and edge test:** Required hidden fields cannot block submission

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/forms/forms/:id/logic loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Rules and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create condition” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Rule editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Required hidden fields cannot block submission; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FORMS-004 — Form Submissions

**Route:** `/o/:org/forms/forms/:id/submissions` | **Archetype:** `table`

**Layout/content:** Submissions; source; dates; redaction; status; linked records.

**Tabs (4):** All, New, Reviewed, Routed

**Primary actions (4):** Inspect, assign, export, delete under policy

**Context overlays (3):** Submission drawer, privacy control, route retry

**AI behavior:** Classifies and routes responses with policy

**Risk and edge test:** Consent/PII handled according to retention rules

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/forms/forms/:id/submissions loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Routed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Submission drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Consent/PII handled according to retention rules; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FORMS-005 — Form Design & Publish

**Route:** `/o/:org/forms/forms/:id/publish` | **Archetype:** `editor`

**Layout/content:** Brand theme; device preview; embed; domain; access.

**Tabs (4):** Design, Embed, Access, Analytics

**Primary actions (4):** Style, preview, generate link, publish

**Context overlays (3):** Theme inspector, access control, embed tester

**AI behavior:** Applies approved brand without reducing legibility

**Risk and edge test:** Published form version remains traceable to submissions

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/forms/forms/:id/publish loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and Analytics shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Style” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Theme inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Published form version remains traceable to submissions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FORMS-006 — Form Analytics

**Route:** `/o/:org/forms/forms/:id/analytics` | **Archetype:** `report`

**Layout/content:** Views; completion; abandonment; field performance; source.

**Tabs (4):** Funnel, Responses, Sources, Timing

**Primary actions (3):** Compare, export, create experiment

**Context overlays (3):** Metric methods, test report, field insight

**AI behavior:** Recommends changes based on meaningful sample size

**Risk and edge test:** Privacy-safe analytics; no invented completion data

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/forms/forms/:id/analytics loads only scoped form data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Funnel and Timing shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compare” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric methods” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Privacy-safe analytics; no invented completion data; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### CONNECT — Integrations & Universal Connector

**Purpose:** Provider capability registry, authorization, synchronization, health and action receipts for connected external systems.

**Human/AI users:** Organization owner; IT admin; connector admin; authorized agent

**Entities:** Connector; ExternalAccount; Capability; OAuthGrant; SyncRun; ActionReceipt

**Competitor benchmarking:** Zapier; Make; Workato; MCP tools

**Screen count:** 10

#### ARL-CONNECT-001 — Integration Marketplace

**Route:** `/o/:org/connect/marketplace` | **Archetype:** `directory`

**Layout/content:** Searchable integrations; categories; capabilities; provider requirements; status.

**Tabs (4):** Featured, Categories, Installed, Custom

**Primary actions (4):** Browse, compare, install, inspect requirements

**Context overlays (3):** Connector preview, install wizard, risk summary

**AI behavior:** Matches capabilities to business mission need

**Risk and edge test:** Unverified provider claims not advertised as supported

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/connect/marketplace loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Featured and Custom shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Browse” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Connector preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unverified provider claims not advertised as supported; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-002 — Connector Detail

**Route:** `/o/:org/connect/marketplace/:id` | **Archetype:** `record`

**Layout/content:** What it can do; actions; reads; account types; limitations; scopes.

**Tabs (5):** Overview, Capabilities, Permissions, Versions, Help

**Primary actions (4):** Connect, test, view docs, request capability

**Context overlays (3):** Authorization preview, scope explanation, provider limits

**AI behavior:** Explains which actions it can perform and cannot

**Risk and edge test:** Read and publish scopes clearly differentiated

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/connect/marketplace/:id loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Help shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Connect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Authorization preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Read and publish scopes clearly differentiated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-003 — Connection Wizard

**Route:** `/o/:org/connect/connect/:id` | **Archetype:** `wizard`

**Layout/content:** Provider selection; OAuth; account pick; scope review; verification.

**Tabs (4):** Account, Permissions, Test, Confirm

**Primary actions (4):** Authorize, choose targets, test, cancel

**Context overlays (3):** External OAuth, scope review, consent status

**AI behavior:** Prepares least-privilege scopes for required missions

**Risk and edge test:** Failed OAuth must not leave phantom connected status

**Archetype design contract:** Sequential review flow | Progress, draft resume, clear requirements, confirmations and alternative pathways. | Single column, visible Back/Continue and keyboard navigation.

**Screen acceptance gates:**

- Route /o/:org/connect/connect/:id loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Account and Confirm shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Authorize” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “External OAuth” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Failed OAuth must not leave phantom connected status; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-004 — Installed Connections

**Route:** `/o/:org/connect/connections` | **Archetype:** `table`

**Layout/content:** Account; organization; owner; scopes; expiry; health; usage.

**Tabs (4):** All, Healthy, Needs action, Disabled

**Primary actions (4):** Inspect, reconnect, suspend, transfer owner

**Context overlays (3):** Account inspector, scope change, revoke grant

**AI behavior:** Maps available tools to agents without exposing tokens

**Risk and edge test:** Revocation terminates new calls and invalidates cached grants

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/connect/connections loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Disabled shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Account inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Revocation terminates new calls and invalidates cached grants; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-005 — Connection Detail

**Route:** `/o/:org/connect/connections/:id` | **Archetype:** `record`

**Layout/content:** Account identity; authorized actions; sync; webhooks; error status.

**Tabs (5):** Overview, Capabilities, Sync, Activity, Security

**Primary actions (4):** Test, limit agents, rotate auth, disable

**Context overlays (3):** Permission matrix, health run, reconnect dialog

**AI behavior:** Suggests recovery based on evidence

**Risk and edge test:** Stale authorization cannot be used for queued mission

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/connect/connections/:id loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Security shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Test” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Permission matrix” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Stale authorization cannot be used for queued mission; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-006 — Capability Registry

**Route:** `/o/:org/connect/capabilities` | **Archetype:** `directory`

**Layout/content:** Normalized action contracts; versions; provider mapping; schemas.

**Tabs (4):** Actions, Reads, Webhooks, Versions

**Primary actions (4):** Inspect schema, test mock, retire, compare

**Context overlays (3):** Capability inspector, schema diff, version impact

**AI behavior:** Selects capability by semantics and declared constraints

**Risk and edge test:** Provider-specific unsupported operation blocked

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/connect/capabilities loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Actions and Versions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect schema” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Capability inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider-specific unsupported operation blocked; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-007 — Synchronization Centre

**Route:** `/o/:org/connect/sync` | **Archetype:** `table`

**Layout/content:** Ingestion jobs; cursors; lag; errors; record collisions.

**Tabs (4):** Jobs, Conflicts, Schedules, Data mapping

**Primary actions (3):** Retry safe sync, inspect conflict, change mapping

**Context overlays (3):** Mapping editor, conflict resolver, run receipt

**AI behavior:** Suggests canonical matches and reconciliations

**Risk and edge test:** Out-of-order webhooks and duplicate events deduplicated

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/connect/sync loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Jobs and Data mapping shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Retry safe sync” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Mapping editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Out-of-order webhooks and duplicate events deduplicated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-008 — Connector Health

**Route:** `/o/:org/connect/health` | **Archetype:** `dashboard`

**Layout/content:** API latency; error rate; token expiry; version warnings; incident links.

**Tabs (4):** Overview, Outages, Rate limits, Deprecations

**Primary actions (3):** Run health test, open incident, contact owner

**Context overlays (3):** Health report, reconnect request, mitigation

**AI behavior:** IT AI diagnoses API/schema changes using logs

**Risk and edge test:** Provider outages not falsely marked internally repairable

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/connect/health loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Deprecations shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run health test” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Health report” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider outages not falsely marked internally repairable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-009 — Custom Connectors

**Route:** `/o/:org/connect/custom` | **Archetype:** `builder`

**Layout/content:** Connector SDK; auth schemes; schemas; sandbox; contract tests.

**Tabs (4):** Projects, Editor, Tests, Publish

**Primary actions (4):** Create adapter, register action, test, submit for use

**Context overlays (3):** Secret setup, capability validation, approval

**AI behavior:** Builds connector boilerplate subject to test and review

**Risk and edge test:** Third-party tool instructions treated as untrusted

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/connect/custom loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Projects and Publish shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create adapter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Secret setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Third-party tool instructions treated as untrusted; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CONNECT-010 — Action Receipts

**Route:** `/o/:org/connect/receipts` | **Archetype:** `table`

**Layout/content:** Provider calls; requested action; outcome; verification; actor; grant.

**Tabs (5):** All, Confirmed, Pending, Failed, Blocked

**Primary actions (4):** Inspect, export, reconcile, open mission

**Context overlays (3):** Receipt detail, provider evidence, retry review

**AI behavior:** Summarizes what actually happened with status

**Risk and edge test:** Provider request accepted is not automatically success

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/connect/receipts loads only scoped connector data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Blocked shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Receipt detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider request accepted is not automatically success; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### IT — IT Operations, Reliability & Security Response

**Purpose:** Central operational observability, agent-assisted incident response, safe fixes, diagnostics, performance, configuration and controlled delivery.

**Human/AI users:** IT administrator; security lead; site reliability engineer; AI IT specialists

**Entities:** Incident; Trace; HealthCheck; ChangeRequest; Remediation; PolicyEvent

**Competitor benchmarking:** Datadog; Sentry; PagerDuty; internal ITSM

**Screen count:** 9

#### ARL-IT-001 — IT Operations Home

**Route:** `/o/:org/it/home` | **Archetype:** `dashboard`

**Layout/content:** Service health; active incidents; connector status; deployment; alert load.

**Tabs (4):** Health, Incidents, Changes, Capacity

**Primary actions (4):** Inspect service, open issue, run check, acknowledge

**Context overlays (3):** Service inspector, incident create, health test

**AI behavior:** AI SRE correlates symptoms and proposes bounded recovery

**Risk and edge test:** Third-party incident clearly differentiated from owned infrastructure

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/it/home loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Health and Capacity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect service” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Service inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Third-party incident clearly differentiated from owned infrastructure; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-002 — Incident Queue

**Route:** `/o/:org/it/incidents` | **Archetype:** `table`

**Layout/content:** Severity; service; owner; start time; impact; current state.

**Tabs (4):** Active, Awaiting user, Resolved, Postmortems

**Primary actions (5):** Assign, escalate, merge, resolve, page owner

**Context overlays (3):** Incident detail, severity change, escalation rules

**AI behavior:** Classifies, deduplicates, assigns actionable root causes

**Risk and edge test:** Multiple symptoms merged only with evidence

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/it/incidents loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Active and Postmortems shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Incident detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Multiple symptoms merged only with evidence; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-003 — Incident Detail

**Route:** `/o/:org/it/incidents/:id` | **Archetype:** `record`

**Layout/content:** Timeline; logs; affected missions; diagnosis; response; verification.

**Tabs (5):** Overview, Timeline, Evidence, Remediation, Postmortem

**Primary actions (4):** Acknowledge, assign, approve repair, close

**Context overlays (3):** Remediation approval, affected work, mitigation note

**AI behavior:** Coordinates diagnostics and testing under runbook

**Risk and edge test:** Incident cannot resolve until health verified

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/it/incidents/:id loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Postmortem shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Acknowledge” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Remediation approval” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Incident cannot resolve until health verified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-004 — System Health

**Route:** `/o/:org/it/health` | **Archetype:** `dashboard`

**Layout/content:** Uptime; latency; error rate; queue; storage; worker capacity.

**Tabs (4):** Services, Workers, Storage, Provider status

**Primary actions (4):** Drill down, add monitor, alert threshold, export

**Context overlays (3):** Service health detail, monitor rule, scale request

**AI behavior:** Detects degraded services and explains impact

**Risk and edge test:** Privacy-safe telemetry; no sensitive payload exposure

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/it/health loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Services and Provider status shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drill down” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Service health detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Privacy-safe telemetry; no sensitive payload exposure; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-005 — Logs & Tracing

**Route:** `/o/:org/it/traces` | **Archetype:** `table`

**Layout/content:** Trace timelines; filtered events; correlation IDs; redaction; latency.

**Tabs (4):** Traces, Logs, Metrics, Sampling

**Primary actions (4):** Filter, inspect, bookmark, share authorized

**Context overlays (3):** Trace waterfall, redaction rules, saved filter

**AI behavior:** Finds likely fault location with trace evidence

**Risk and edge test:** Secrets and personal data never surfaced by default

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/it/traces loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Traces and Sampling shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Trace waterfall” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Secrets and personal data never surfaced by default; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-006 — Automated Remediation

**Route:** `/o/:org/it/remediation` | **Archetype:** `builder`

**Layout/content:** Runbooks; safe actions; approval boundaries; simulation; rollback.

**Tabs (4):** Runbooks, Proposals, Runs, Failures

**Primary actions (4):** Test runbook, approve, execute, pause

**Context overlays (3):** Runbook editor, remediation impact, verify result

**AI behavior:** Attempts allowlisted self-healing and reports outcomes

**Risk and edge test:** No autonomous privilege escalation or blind production patch

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/it/remediation loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Runbooks and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Test runbook” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Runbook editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No autonomous privilege escalation or blind production patch; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-007 — Release Management

**Route:** `/o/:org/it/releases` | **Archetype:** `admin`

**Layout/content:** Changes; builds; staged deployments; release gates; rollback.

**Tabs (4):** Planned, Staging, Production, Rollbacks

**Primary actions (4):** Approve release, deploy, test, rollback

**Context overlays (3):** Diff review, release gates, rollback confirmation

**AI behavior:** Writes tests and release notes with evidence

**Risk and edge test:** Failing security and functional gates block promotion

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/it/releases loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Planned and Rollbacks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Approve release” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Diff review” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Failing security and functional gates block promotion; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-008 — Security Centre

**Route:** `/o/:org/it/security` | **Archetype:** `dashboard`

**Layout/content:** Access anomalies; session events; secrets; threats; response.

**Tabs (5):** Alerts, Access, Secrets, Policy, Audit

**Primary actions (4):** Investigate, revoke, isolate, export

**Context overlays (3):** Security incident, session revoke, policy simulation

**AI behavior:** Proposes containment under independent rules

**Risk and edge test:** AI never becomes self-authorizing security administrator

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/it/security loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Alerts and Audit shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Investigate” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Security incident” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI never becomes self-authorizing security administrator; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-IT-009 — Reliability Reports

**Route:** `/o/:org/it/reports` | **Archetype:** `report`

**Layout/content:** Incident frequency; MTTR; connector health; failed automation; cost.

**Tabs (4):** Trends, Root causes, Capacity, Costs

**Primary actions (4):** Generate, compare, propose remediation, export

**Context overlays (3):** Report builder, incident comparison, proposal

**AI behavior:** Finds recurring problems and suggests structural fixes

**Risk and edge test:** Numbers sourced from real incidents, never model estimate alone

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/it/reports loads only scoped incident data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Trends and Costs shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Generate” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Report builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Numbers sourced from real incidents, never model estimate alone; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
