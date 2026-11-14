# ARLOVI — EXECUTIVE EXECUTION MANDATE FOR CURSOR / GROK

> Paste this document into Cursor Agent (preferably using Grok as the executive orchestrator when that model is available). This document is an execution directive, not a request for another plan. The attached repository is empty. Create and implement the entire frontend and all its applications, routes, controls, local behaviours and UX according to this package. Do not implement a backend.

## 0. YOUR MANDATE: DO THE WORK

Act collectively as the six executive product-and-engineering workstreams of **Arlovi**, an AI-native digital headquarters and comprehensive native business application suite. You are the accountable acting founding executive group, product design leadership, engineering architecture leadership and quality organization. Do not stop after writing plans, generating screenshots, creating shells, or summarizing missing work. Develop the actual code in this repository, install dependencies, run the app, test the flows, repair defects and supply verifiable evidence.

The user has explicitly prohibited MVP scoping. **FULL PRODUCT INVENTORY IS THE DELIVERY SCOPE.** Implement all **35 application domains and all 316 screen records**, including their **1,323 scoped tab instances, 956 overlays, 1,328 named primary actions, and 20 cross-domain workflows**, plus the common interactions in the source specification. Counts are registry baselines, not a substitute for inspecting and implementing each item. Do not remove a screen or simplify an advanced editor into a generic dashboard because doing so is easier. Build real, testable, user-interactive frontend functionality for every screen.

**Frontend only, no backend yet.** No new database server, API server, Supabase schema, authentication service, cloud AI orchestration service, production billing/checkout, server-side email delivery, or infrastructure deployment. Define typed ports/interfaces for those future systems, then implement a real browser-local runtime with durable client data and complete editable workflows. The app must be usable offline where feasible, with actual in-browser CRUD, editors, calculations, imports/exports, drag and drop, navigation, collaborative UI patterns, history and state transitions. Where a real-world action inherently needs a server/provider (outbound email, bank transfer, real payments, OAuth, real social publishing, hosted calls, real model reasoning, deployment), provide a fully implemented UI flow and data contract while **truthfully identifying that the provider is not connected**. Never fabricate a real external effect, successful payment, published campaign, bank feed, verified AI research or connected-account status.

The owner does NOT want words like "prototype", "demo", "mockup", "MVP", "placeholder" or "coming soon" scattered through the user-facing interface. Build and style Arlovi like a finished working platform, not a design presentation. Use language such as "Local workspace", "Connect a provider", or "External service not connected" only when necessary to avoid deception. Internal developer documentation may correctly describe the frontend-only state. Do not leave knowingly inert buttons. If an action cannot execute a real-world side effect without a backend, it must still open a meaningful configured workflow, inspectable draft, provider-connection state, export, or honest blocked state; it must never claim the effect occurred.

### Working brand identity
- Working public name: **Arlovi** (trademark/domain clearance pending). Make brand strings, logo and tokens configurable and rename-ready.
- Branding direction: **Electric Cobalt #234FE8**, Papaya #FFAE7C, Aqua #36C5BA, light canvas #F7F8FC, dark #141A30, ink #17223A. Use functional semantic status colours separately. Explore alternative palettes via editable theme settings; don't hardcode scattered literal colours.
- Friendly, serious, high-tech, design-led, purposeful and warm. Deliberate whitespace, readable typography, smooth restrained motion, no juvenile UI, endless glowing orbs or default AI dashboard clichés.
- AI identity: "Ask Arlovi" as safe working label, not "Ask AI"; organization-configurable Chief of Staff name; do not treat competing "Arlo" names as finalized.
- No visual design or branding choice supersedes accessibility, clarity or semantics.

## 1. REQUIRED INPUTS — READ BEFORE CODING

1. `07_ORIGINAL_SPECIFICATIONS/Arlovi_Complete_UX_Screen_Registry.json` — **canonical exhaustive screen and interaction inventory**; must be parsed, not skimmed.
2. `07_ORIGINAL_SPECIFICATIONS/Arlovi_Complete_Platform_UX_Specification.md` — long-form source: designs, routes, operations, UI states, tab/overlay contracts, acceptance tests, domain nuances, workflow descriptions.
3. `07_ORIGINAL_SPECIFICATIONS/Arlovi_Full_Platform_Engineering_UX_Specification.docx` — human-readable engineering document.
4. `02_PRODUCT_AND_UX/*` — product decisions, app inventory, colour/typography, navigation, conversations, AI experiences, cross-app scenarios, full UI rules.
5. `03_ARCHITECTURE/*` — typed frontend architecture, local runtime and state engine, record and policy contracts.
6. `04_WORKSTREAMS/WS*.md` — detailed workstream ownership, app-by-app page contracts and design responsibilities.
7. `05_QUALITY_AND_ACCEPTANCE/*` — verification gates, cross-review protocol, evidence and signoff.
8. `06_MACHINE_READABLE/*` — generated route/ownership/coverage matrices and automated test metadata.

Read all before making fundamental architecture decisions. If files are packaged outside repository, import/copy the package into repository `/docs/arlovi/` preserving paths. Establish a living progress ledger immediately, then implement the product. Do not ask the owner for routine decisions. Deliberate as a leadership team, select defensible defaults, record important tradeoffs. Escalate only if a decision is truly consequential, impossible to infer or requires real-world credentials/legal authorization.

## 2. ORCHESTRATION: SIX EXECUTIVE WORKSTREAMS

Appoint a single **Grok Executive Orchestrator** (or strongest available Cursor agent/model if Grok unavailable) who owns product coherence, quality, inter-team contracts, integration, final verification and resolution of disagreements. Create six concurrently coordinated workstreams, with a principal lead for each; subordinate specialists are welcome under those leads. Match available models to task difficulty and context constraints; do not claim nonexistent concurrency or unavailable subagents. If Cursor cannot create separate concurrent agents, execute workstream tasks sequentially or using available multi-agent mechanisms while preserving the same review roles and acceptance gates.

### WS1 — Core Experience & Headquarters
Ownership: `HQ`, `INBOX`, `ADMIN`, `ASSET`.
Deliver the design system, responsive shell, global navigation, command menu, org/brand switcher, notifications, approval surfaces, account preferences, asset library, dashboards, workspace personalization and all associated routes/states. Own shared primitives and the style gate. Work with every other stream to enforce visual consistency.

### WS2 — Intelligence, Organization & Autonomous Operations
Ownership: `AI`, `BRAIN`, `TEAM`, `MISSION`, `AUTO`, `ANALYTICS`.
Deliver the human-to-AI experience, Chief of Staff, direct agent and team rooms, AI organization, role profiles, knowledge intake/search/provenance UI, mission planning/execution/activity/results, visual workflow engine, BI and proactive executive insights. Make local agent collaboration and deterministic mission transitions genuinely interactive, with a clear separation between local operations and unavailable external intelligence.

### WS3 — Enterprise Business Operations & Collaboration
Ownership: `FIN`, `CRM`, `HR`, `PROJECT`, `COMMS`, `CARE`, `LEGAL`.
Deliver serious native accounting and CRM records, people/HR workflows, projects, messaging and calendar, service cases, policy/legal operations, professional tabular workflows, forms, approvals, exports and contextual AI. Finance requires coherent browser-local double-entry transactions with validation, not decorative financial dashboards.

### WS4 — Growth, Commerce & External Business
Ownership: `MARKET`, `COMMERCE`, `BOOK`, `PROC`, `PORTAL`.
Deliver marketing campaign planning/publishing workspaces, commerce/catalogue/cart/orders/stock/returns, bookings/resource calendars, suppliers/procurement/warehouse flows, and external partner/client portal experiences. Implement actual local storefront and booking/cart/order interactions. External payment, delivery, social publishing and other provider effects must display their unconnected/pending status honestly.

### WS5 — Content, Office & Professional Creative Production
Ownership: `DOCS`, `SHEETS`, `PRESENT`, `DESIGN`, `PHOTO`, `LAYOUT`, `VIDEO`, `MOTION`.
Deliver professionally structured document, sheet, slide, vector, photo, publishing, video and motion editors with functional canvas/timeline/formula/history/import/export interactions. Reuse mature license-compatible browser libraries where appropriate; verify license and export capability. Do not substitute static image generation for structured editable media.

### WS6 — Web, Builder, Integrations, Reliability & Independent QA
Ownership: `WEB`, `BUILD`, `FORMS`, `CONNECT`, `IT` **plus cross-product integration and independent verification.**
Deliver responsive website visual editor and CMS, local app builder and runnable views, form designer/submissions, integration marketplace and realistic connection states, IT incidents/diagnostics, frontend test harnesses, accessibility/performance audits and release verification. Coordinate architecture and package-level build/test pipelines across all workstreams.

**Critical:** WS6's QA function must be independent of feature authors. Every workstream's deliverables are reviewed by another workstream and the central design reviewer. The Orchestrator has final merge authority but may not declare a feature finished from code existence alone.

## 3. REPOSITORY BOOTSTRAP — EMPTY REPO TO RUNNING APP

Inspect the repository. If empty, initialize a modern TypeScript React frontend app with Vite, robust client routing (React Router or TanStack Router), Tailwind CSS, accessible Radix/shadcn-compatible primitives, responsive CSS tokens, typed domain modules and a reliable local browser data layer (Dexie/IndexedDB recommended). The exact package versions must be current, stable, compatible and selected after inspecting package metadata and licenses. Use a lockfile. Prefer standard mainstream, maintained libraries; do not invent non-existent packages.

Consider TanStack Table for serious data grids, dnd-kit for accessible drag-and-drop, React Flow/XYFlow for graph and workflow editing, a Tiptap/ProseMirror-class editor for documents, Fabric.js/Konva or SVG geometry for the structured design canvas, Monaco for code, and suitable licensed local spreadsheet, video and media engines. Evaluate dependency licenses, size and technical fit, especially formula engines, rendering tools and design canvases. Native browser input and export APIs should be used when reliable. All functionality must be operable without a backend, subject to honest provider-dependent limitations.

Use modular feature packages and bounded domain modules. Recommend repository topology:

```
/
  src/
    app/                   # routing, providers, app shell, layout
    design-system/         # tokens, type, components, interaction primitives
    domains/               # canonical entities, typed domain services
    applications/          # one folder per registered application domain
    ai/                    # agent contracts, chief of staff, mission UX
    runtime/               # IndexedDB, policy evaluator, events, offline queue
    editor-engines/        # docs, sheet, vector, raster, timeline, code
    integrations/          # capability ports; provider status adapters
    fixtures/              # explicitly local example data; no fake real action
    shared/                # utilities, localization, accessibility
  public/
  tests/
    unit/ integration/ e2e/ accessibility/ visual/
  docs/
    arlovi/                # this handoff package, original specs, ADRs
    implementation/        # coverage, decisions, verification evidence
  .cursor/rules/
```

This is a target architecture rather than a reason to spend time on empty directories. Every exported package and route needs real imports and functionality. No invented server implementation. If a static deploy needs SPA fallback configuration, provide it, ensuring deep links render.

Minimum scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e`, `test:a11y`, `verify:inventory`, and `qa` orchestration. Create buildable CI configuration, Playwright E2E, Vitest/unit coverage, lint and type checks. Verify startup with actual console output/browser inspection. Use accessible browser-driven tests or test runners; fix failures.

## 4. CANONICAL SOURCE OF TRUTH: EVERY SCREEN

Treat the JSON registry as **authoritative target scope**, not optional reference. Its `applications[].pages[]` entries contain screen IDs, routes, archetypes, regions, tabs, actions, overlays, AI responsibilities, failure/edge cases, tab/action/overlay contracts and acceptance checks.

For every single registered screen:
1. Implement a real route with proper organization scope and breadcrumb.
2. Implement its distinct named page type and information hierarchy; **do not route 316 URLs to the same generic dashboard**.
3. Render real registered tabs with distinct view content, persistent selection and accessible keyboard behaviour.
4. Wire every listed primary action to its declared navigation or local state change, including validation, save, edit, delete, bulk action, import/export where applicable.
5. Implement every listed overlay as a distinct context-aware popover/drawer/dialog with focus handling, dismissal, responsive placement and correct effects.
6. Implement relevant entity creation, editing, linking, filtering, sorting, import/export, history and undo in the browser-local data layer; mutations should persist across refreshes.
7. Provide contextual Chief of Staff or specialist AI interface with scoped permissions and non-fabricated operation states.
8. Implement empty/loading/populated/editing/saving/pending/verified/partial/blocked/error/offline/read-only/conflict/archived states as applicable.
9. Conform to responsive rules and accessible zoom/keyboard/touch equivalents.
10. Add automated test(s) for the page, representative tab switching, primary operations, overlays, scope isolation and error recovery.
11. Update its registry status with implementation paths, test refs, screenshots and reviewer approval.
12. Treat the original acceptance list as mandatory, **except** convert server-only expectations to their browser-local adapter equivalents; do not claim those expectations are production-enforced without a backend.

Build a registry-driven inventory test that fails on unimplemented routes, missing tabs/actions/overlays, dead navigation destinations, or missing screen evidence. Base it on 316 target entries, not manually curated fewer items. Screens not delivered are **open blockers**, never marked complete. Screen IDs must remain stable.

Avoid false success through tests that only assert the presence of a heading. Test meaningful interactions and persisted changes.

## 5. UX AND VISUAL IMPLEMENTATION CONTRACT

### Application shell and adaptive layouts
- 60px global header; 248px expanded sidebar, 64px rail; 208–240px app navigation; inspector 300–360px; editor toolbar 48–56px; status bar 28–32px when needed.
- Desktop large: context-aware three-pane layouts for relevant tools; panels resizable/collapsible. Tablet: rail and overlay inspector; mobile: single primary content region, bottom nav, full-screen or bottom-sheet inspectors.
- Breakpoints target 320–599, 600–899, 900–1199, 1200–1599, 1600+ CSS px, plus container queries when sensible. Honor reduced height, safe areas and keyboard occlusion. `100dvh` with fallback and independent scrolling where useful.
- Keep reading width ~720–840px for prose; grids, tables, timelines and canvases use available area.
- Desktop page headings 28–32px; body 15–16px; data dense 13–14px; secondary 13–14px; small labels 12–13px. No tiny unreadable pages to fit more controls.
- Page gutters 32px desktop, 24px tablet, 16px mobile; standard card padding 16–24px, responsive and density-aware; 4px spacing foundation.
- Support Comfortable/Balanced/Compact densities without shrinking essential touch targets. Target WCAG 2.2 AA and robust keyboard navigation.
- Smooth purposeful motion: hover ~80–140ms, menus ~120–180ms, panels 180–260ms, layout 200–320ms; reduced-motion alternatives. No fake progress bars.
- Global command search, company/brand switch, breadcrumbs, recent items, pinned apps, notification centre, execution tray, context inspector and overlay stack.
- User-facing copy: professional, clear, warm, accountable. No AI theater. Visible distinction between human vs AI employees.

### Individual application UX
Finance is not Design, and a timeline editor is not a chat page. Implement app-specific layouts and professional controls. The source specification's 18 archetypes are shared patterns, not a reason to omit domain-specific tools. Favor strong tables for Finance; infinitely pannable canvases and layer hierarchies for Design; timeline for Video; slide deck editing for Present; formulas and references for Sheets; conversation focus for Customer Care; execution evidence for Missions.

### UX behaviour for every interactive surface
Use real hover/pressed/focus/selected/disabled/loading/success/failure states; accessible drag handles with keyboard alternatives; menus that don't clip or trap users; focus-return after dialogs; robust form validation, autosave status and undo. Avoid nested modal stacks. Preserve context when changing tabs and navigating between an artifact and its associated mission. Every notification deep-links to its decision/record and does not auto-approve anything.

## 6. FRONTEND-LOCAL FUNCTIONALITY, NOT VISUAL PLACEHOLDERS

Create an **entire browser-local operating environment**:
- Persist organization, employees, departments, agent roles, contacts, invoices, transaction journals, projects, tasks, missions, campaign records, products, orders, inventory, customer cases, appointments, approvals, notifications, knowledge items and artifacts in IndexedDB.
- Provide seeded coherent local business data only through explicit onboarding/"example data" flow or a clearly identified local workspace; ensure cross-app references resolve. Never pretend seeded data came from connected customer accounts.
- Support true create/read/update/delete, validation, search, sorting, filtering, bulk actions, role/scope simulations, transactions with client-side consistency safeguards, undo and versioning.
- Implement a deterministic local event bus and workflow runner with pause/resume, approval checkpoints, idempotency, action receipts stating local status, activity and an incident log. Keep it entirely in the browser.
- Implement local role/policy evaluator for UX and testing. Clearly document that actual security authorization requires future backend enforcement. Do not store secrets or act as if client guards secure sensitive operations.
- Build meaningful office/creative editors with actual edit/preview/export actions. Store structured document representations; avoid screenshot-only assets.
- Import files using browser APIs, parse safely where supported, provide actual file previews, structured metadata and explicit extraction limitations. Browser-local search should work over available parsed content. Do not claim antivirus or server-side private AI extraction occurred.
- Provide a contextual conversational UI and multi-agent team room. Contextual responses/actions may be deterministic local workflows, rules, or optionally browser-local models. If no real language model is connected, do not falsely claim arbitrary reasoning or source-grounded model analysis occurred. Offer useful task-specific interactive actions and saved artifacts instead.
- Implement a capability adapter for provider-dependent operations with exact states: `not_connected`, `configuration_required`, `ready_local`, `queued_local`, `awaiting_external_confirmation`, `verified_external`, `blocked`, `failed`. No `verified_external` without provider evidence.
- External portal flows must be viewable and interactive using browser-local users/roles, with an explicit notice in docs that this is not actual security isolation or multi-user sync.
- Do not embed API keys in frontend code or bundle. Do not silently make unauthorized network calls.

**Functional examples**: selecting a CRM lead must open the correct deal; moving a task must update the project and mission; creating an invoice must affect local AR/ledger under double-entry rules; selecting a slide must open its editable object tree; adjusting a design's responsive constraint must update preview; exporting a file must produce a valid usable download; moving a scheduled appointment must update availability and conflict feedback; local notification creation must route to a working record; creating a product must update a functioning local storefront/cart; a text editor must actually edit and persist rich content.

## 7. CROSS-APP CONNECTIONS: ALL 20 WORKFLOWS

Implement all `WF-01` through `WF-20` from the registry and workflow document. Required examples:
- Onboard company -> company profile/knowledge -> workforce -> first mission.
- Campaign -> commerce/finance analysis -> Studio -> approvals -> local publication draft/external connector blocked state -> Insights.
- Revenue investigation -> Finance/CRM/Commerce/Marketing -> evidence -> recommendation -> mission.
- New enquiry -> Customer Care -> CRM -> booking/order/finance updates -> resolution.
- Lead -> quote -> project/order -> invoice -> payment/reconciliation local model.
- HR hiring -> employee record -> training/meeting -> IT access request.
- Creative asset -> Brand Guardian -> editor -> review -> responsive QA -> output/export.
- App builder -> data/permissions -> interactive preview -> tests -> exported artifacts.
- Document intake -> provenance -> conflicts -> approved knowledge.
- Booking -> availability -> reservation -> service -> invoice.
- Procurement -> stock -> PO -> goods receipt -> AP bill.
- Connector incident -> triage -> actions/reconnect UI -> honest confirmation.
- Agent lifecycle -> creation -> evaluation -> assignment -> suspend/retire.
- Attention event -> bundled notification -> review -> approval -> mission update.
- Executive reporting -> data aggregation -> editable reports and presentations.
- External client collaboration and scoped portal.
- Multi-brand/entity selection with correct isolation and currency locale.
- Device continuation (local same-browser persistence; explain cross-device requires backend sync).
- Data export/deletion UI with local execution/limitations.
- Emergency pause preventing new local mission dispatch; list already committed external effects as unverified/uncontrolled where relevant.

All interactions should update shared entity state and be inspectable. Explicitly document any outcome that cannot happen without a backend instead of faking it.

## 8. APPLICATION-BY-APPLICATION DEPTH EXPECTATIONS

**Finance**: coherent chart of accounts, ledger journal model, invoice lifecycle, bills, expenses, accounting period/close UI, reconciliation algorithms on local transaction sets, money precision, audit, reporting, budgets, currencies and tax configuration. Show VAT/filing as configuration/preview only until real compliance/integration is available.
**CRM**: contacts/companies, relationships, lead pipeline, deals, activities, quotation builder, forecasting, service integration, contextual customer record.
**HR**: employee records, recruitment, offers, onboarding, leave, scheduling, policies, performance, payroll input UI; no real statutory payroll execution without backend/providers.
**Comms/Care**: threads, channels, message composers, attachments, meeting/calendar planning, ticket queues, SLAs, handoffs and client context. Local message exchange is real within local state; outbound delivery unavailable until connected.
**Marketing/Commerce/Bookings/Procurement**: complete local campaign composition, editable calendar, audience segmentation on local data, product/variant builder, storefront/cart and order modelling, inventory transactions, appointments/resources, supplier PO/receipt/AP, returns and approvals.
**Docs/Sheets/Present/Design/Photo/Layout/Video/Motion**: actual editors with selection, insert/edit/reorder/delete, undo/history, import/export, reusable assets, meaningful formats, context tools, keyboard shortcuts, responsive canvases. Advanced editing where practical, explicit limitations where browser-only execution is impossible.
**Web/Build/Forms**: structured no-code editor, responsive site/device previews, schema-driven database views on IndexedDB, browser-local app runtime, form logic/submissions, export of static/client artifacts. No claim of production server deployment.
**AI/Brain/Team/Missions/Automation/Analytics**: visible knowledge provenance, agent contracts, direct and team communication, event-triggered local missions, dependency/approval states, task receipts, scoped report builders and data validity checks.
**Integrations/IT/Admin/Legal**: complete settings and inspectable workflows, connection capability catalog, security/permission views, incidents, data retention, compliance checklists, local state and clear nonconnected provider status.

Each domain has further requirements in the 316-screen registry and detailed spec; these paragraphs do not replace that content.

## 9. AGENT TEAMS AND REVIEW GOVERNANCE

Create an operating ledger in `docs/implementation/STATUS.md` and machine-readable `docs/implementation/coverage.json`. Each issue references workstream, screen IDs, dependent screen IDs, owner, state, change refs, test evidence, review state. Never mark "done" with only a screenshot. Orchestrator should frequently reconcile completed routes against registry counts.

Agent execution method:
A. Inventory and parse all 316 screens. Establish all 35 ownership assignments (from `06_MACHINE_READABLE/workstream_assignment.json`).
B. Architecture council: six leads agree on typed interfaces, event names, route constraints, local data schema and design tokens. Write concise ADRs, then build.
C. Parallel workstreams implement **all** owned domains, with dedicated specialist agents where possible. Agent subteams must not conflict on the same files; use branch or file-ownership discipline.
D. Integrate continuously into a runnable app; do not build 35 orphaned mini-apps.
E. Peer reviews: each feature owner must receive UX, domain correctness, accessibility, and independent test review by other agents.
F. Failure simulation: refresh, offline, corrupted local record, permissions change, conflicting edits, import failure, resource contention, duplicate action, long-running task and browser resize.
G. Orchestrator signs off only with complete screen/interaction coverage and passing build/test evidence. If incomplete, assign remediation without asking the owner to manage the team.

**Disagreement rule:** argue the options using project goals, source specification, usability, accessibility, integrity, cost and maintainability; record one chosen decision and consequences. Orchestrator decides promptly if it doesn't require user authorization. Do not repeatedly request user preferences for routine design choices.

**Model economics:** use specialized/smaller available agents for test generation, component construction and inventory work; stronger reasoning for architecture, finance invariants, creative engine design, security review and cross-app integration. Use the tools/models Cursor actually offers—do not fabricate unavailable agents or model APIs.

## 10. TEST AND SIGNOFF GATES — NO PHANTOM COMPLETION

Required acceptance:
- Every registered route renders a distinct correct screen and survives reload/deep-link.
- Every registered tab is navigable and changes meaningful view state.
- Every registered named action and overlay has an implemented, testable behaviour.
- 20 scenario flows have browser E2E tests with actual persistent local state effects or a clear provider-unconnected stop.
- Components satisfy keyboard/touch/focus/dialog/reduced-motion rules, target WCAG 2.2 AA.
- At minimum test 320/375/768/1024/1366/1440/1920 widths and short 768px-high desktop; no clipped primary actions.
- App is responsive, uses real navigation, works in light/dark and density modes, has no console errors on principal flows, and preserves drafts after refresh.
- Studio editing actually works, documents export; data tables sort/filter/edit; finance transactions remain balanced; booking and inventory enforce local constraints; role context changes update views.
- No UI text promising backend success for offline/local-only operation. No `demo`/`prototype` UI banners.
- `npm run typecheck`, lint, unit/integration tests, E2E, accessibility and build pass, with evidence.
- QA agent samples *every* screen and cross-domain workflows, not just screenshots of Home.
- Orchestrator reports observed completion counts against 316/1323/956/1328/20 and openly lists exceptions. **Never fabricate 100% completion.**

Create `docs/implementation/FINAL_VERIFICATION.md` with commands, screenshots/trace refs, failed/passed checks, design consistency findings, unresolved frontend limitations and ownership. If there are blockers, fix them now wherever possible; do not declare finished while known reachable defects remain.

## 11. FINAL DELIVERY

Leave the repository in a state where an engineer can clone, install and run the entire frontend using documented commands. Provide:
1. Implemented source tree and lockfile.
2. All screen routes and functioning local application experiences.
3. Coherent design tokens, reusable components, individual app UX contracts and responsive behaviours.
4. Working local persistence and scenario data paths, with clear data reset/export controls.
5. Frontend service ports/adapters ready for future backend work, but **no backend work**.
6. All unit/integration/E2E/visual/a11y tests and CI.
7. Accurate final inventory and coverage report, with failing items clearly identified until fixed.
8. Decision register, architecture diagrams, runbooks and engineering evidence.

**Do not stop after this plan. Don't produce another planning-only response. Begin implementing.** Your job is to orchestrate six accountable workstreams and deliver a complete, polished, navigable, highly interactive frontend for the entire Arlovi digital headquarters with honest external-service limits.

### First Cursor action
Inspect repository contents; import/verify this package; parse the registry and produce counts by owning workstream; create the implementation ledger; initialize the actual frontend and route system; establish shared contracts; delegate the 35 app domains across six workstreams; begin shipping integrated code and tests immediately.
