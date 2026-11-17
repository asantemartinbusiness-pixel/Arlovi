# Arlovi — Native Applications Experience Contract

**Source of truth:** `src/generated/catalog.json`, `src/app/nav.ts`, `src/app/catalog.ts`, `src/app/AppsDirectory.tsx` and the 316-screen independent UX acceptance register.

**Coverage:** All 35 native applications, in the existing six-group hierarchy. These requirements are platform-wide, not an MVP or a reduced rollout. Implementation and independent verification are separate.

## Application hub contract

- `/o/:org/workspace/apps` is the company-scoped directory. Every permitted native app has a real static launch destination; never open a generated example record when the user selects an app.
- Categories reflect the approved headquarters, intelligence, operations, growth, studio and platform information architecture. Each category and search query can be linked via `category` and `q` query parameters.
- Search matches what the tool does, not just its short title. It must use the canonical registered metadata, respect current local role-view visibility, handle empty results and remain keyboard accessible.
- Pinned apps use organisation-scoped `preferences` records and remain consistent with the primary rail and account controls. Recently used links are company-scoped, never cross-tenant, and open stable application entries.
- Application modules are loaded on demand when entered; rendering a card must not import every native bundle. Do not preload or execute AI models or external provider integrations.

## Contract inside every application

- Keep the established Arlovi shell, typography, spacing, colour tokens and native editor chrome. Each application maintains its own specialist information architecture and purposeful workflows.
- The app navigation exposes `All applications` as a reliable return path. Its active links correspond to registered screens. Detail-only destinations cannot invent IDs or carry IDs from another company or record collection.
- Record-only links expose their unavailable state and a human-readable reason until a real scoped record has been opened. Do not silently substitute the first sample record.
- Standard, editor and full-canvas experiences must preserve actions, state, focus and responsive layouts. Empty, loading, permission-view, error and unsaved-data states must be truthful.
- Business writes use existing local mutation and audit paths. Browser-local role views are not identity or server permissions. AI execution, live cloud authentication and connector claims remain disconnected.

## App-by-app inventory and experience scope

| Group | Application | Registered screens | Stable entry in current company | Product remit from catalogue |
|---|---|---:|---|---|
| Headquarters | **HQ — Headquarters & Organization** | 10 | `/o/:org/hq/home` | The company-wide digital office: executive intelligence, personal work, departments, locations, company goals, and shared operational context. |
| Headquarters | **INBOX — Inbox, Notifications & Attention Engine** | 8 | `/o/:org/inbox/inbox` | Company-wide attention prioritization, actionable approvals, grouped updates, messages, incidents, delivery channels and digests. |
| Headquarters | **ASSET — Assets, Media Library & Brand Resources** | 5 | `/o/:org/asset/assets` | Central reusable media, approved creative assets, licensed materials, fonts, templates and usage lineage for all Studio and business apps. |
| Headquarters | **ADMIN — Administration, Identity, Policy & Billing** | 11 | `/o/:org/admin/organization` | Company settings, tenant identity, access, roles, AI authority, spend, privacy, billing, audit, exports and recovery. |
| Intelligence | **AI — AI Companion & Conversations** | 10 | `/o/:org/ai/chat` | Conversation-first Chief of Staff interface, contextual research, multimodal input, specialist communication, meeting intelligence, and execution handoffs. |
| Intelligence | **BRAIN — Company Brain & Knowledge** | 10 | `/o/:org/brain/home` | Persistent business knowledge graph, provenance-aware document intelligence, scoped organizational memory and conflict resolution. |
| Intelligence | **TEAM — AI Workforce & Agent Academy** | 10 | `/o/:org/team/home` | Operational AI employee roster, departmental hierarchy, agent skills, role contracts, model routing, training, permission and evaluation. |
| Intelligence | **MISSION — Missions & Autonomous Execution** | 11 | `/o/:org/mission/missions` | Central orchestration of company objectives, plans, task graphs, approvals, execution, verification and results. |
| Intelligence | **AUTO — Automation & Workflow Builder** | 9 | `/o/:org/auto/workflows` | Visual event-driven and scheduled automation with AI nodes, conditions, approvals, replay and recovery. |
| Intelligence | **ANALYTICS — Analytics, BI & Reporting** | 9 | `/o/:org/analytics/home` | Cross-company business intelligence, governed metrics, dashboard authoring, source lineage, forecasting and data exports. |
| Operations | **FIN — Finance & Accounting** | 13 | `/o/:org/fin/home` | Full native double-entry financial management with strong auditability and AI assistance. |
| Operations | **CRM — CRM & Sales** | 11 | `/o/:org/crm/home` | Unified customer relationships, opportunities, quotes, sales activity, lifecycle management and forecasting. |
| Operations | **HR — People, HR & Payroll** | 11 | `/o/:org/hr/home` | Human workforce lifecycle, recruitment, self-service, policy, schedules, learning and payroll operations with distinct AI staff administration. |
| Operations | **PROJECT — Projects, Portfolios & Work** | 10 | `/o/:org/project/portfolios` | Human and AI project planning, ownership, capacity, schedules, approvals and cross-team delivery. |
| Operations | **COMMS — Communications, Email, Calendar & Meetings** | 11 | `/o/:org/comms/home` | Unified internal communications and customer-facing communication channels with secure identity and appropriate provider infrastructure. |
| Operations | **CARE — Customer Care & Service** | 9 | `/o/:org/care/home` | Omnichannel case management, support inbox, knowledge-guided responses, service metrics and verified human-AI handoff. |
| Operations | **LEGAL — Governance, Legal Operations & Risk** | 7 | `/o/:org/legal/home` | Policy, contract lifecycle, risk registers, evidence preservation and qualified human review for legal or regulated business matters. |
| Growth | **MARKET — Marketing & Growth** | 12 | `/o/:org/market/home` | Full marketing operations across strategy, social content, email, ads, audiences, SEO, attribution and integrated creative. |
| Growth | **COMMERCE — Commerce, Storefront & Orders** | 12 | `/o/:org/commerce/home` | Native catalogue, inventory, storefront, checkout, orders, fulfilment, returns and promotion management. |
| Growth | **BOOK — Bookings, Appointments & Reservations** | 8 | `/o/:org/book/home` | Capacity-aware booking services, resources, staff assignment, payments, reminders and no-show handling. |
| Growth | **PROC — Procurement, Warehouse & Inventory** | 10 | `/o/:org/proc/home` | Native purchasing, suppliers, receiving, stock movement, warehouses, reorder policies and traceable approvals. |
| Growth | **PORTAL — External Portals & Client Collaboration** | 7 | `/o/:org/portal/portals` | Branded, scoped customer/client/partner spaces with documents, messages, approvals, bookings, payments and status. |
| Studio | **DOCS — Documents & Knowledge Writing** | 7 | `/o/:org/docs/files` | Professional collaborative rich text, governed templates, policy drafting, document sharing and AI context editing. |
| Studio | **SHEETS — Spreadsheets, Models & Structured Data** | 7 | `/o/:org/sheets/workbooks` | Excel-class editable grid, formulas, charts, data modelling, shared datasets and deterministic calculation. |
| Studio | **PRESENT — Presentations & Storytelling** | 7 | `/o/:org/present/decks` | Native slide design, reusable brand masters, presentations, animation, charts, speaker support and collaborative review. |
| Studio | **DESIGN — Vector Design & UI Studio** | 10 | `/o/:org/design/files` | Professional vector canvas and reusable design system with direct editing, auto layout, components and AI-assisted design. |
| Studio | **PHOTO — Photo & Image Editing** | 7 | `/o/:org/photo/photos` | Native raster editing with masks, layers, image corrections, compositing, AI-assisted targeted edits and batch export. |
| Studio | **LAYOUT — Editorial Layout & Publishing** | 5 | `/o/:org/layout/publications` | Multi-page design for reports, proposals, magazines and print assets with grids, typesetting and preflight. |
| Studio | **VIDEO — Video Production & Editing** | 8 | `/o/:org/video/projects` | Professional non-linear editing, assets, multitrack audio/video, captions, review and export. |
| Studio | **MOTION — Motion Graphics & Animation** | 5 | `/o/:org/motion/projects` | Vector motion, animated typography, reusable compositions, easing, keyframes and brand motion templates. |
| Platform | **WEB — Websites, CMS & Hosting** | 10 | `/o/:org/web/sites` | Responsive visual website creation with structural HTML/CSS model, content management, SEO, domains and verified deployment. |
| Platform | **BUILD — Application Builder & Developer Studio** | 11 | `/o/:org/build/projects` | Full-stack visual/no-code/code-native software creation with databases, API, auth, tests, deployments and governed AI engineering. |
| Platform | **FORMS — Forms, Surveys & Intake** | 6 | `/o/:org/forms/forms` | Native responsive form builder, conditional logic, branded publishing, secure submissions and workflow routing. |
| Platform | **CONNECT — Integrations & Universal Connector** | 10 | `/o/:org/connect/marketplace` | Provider capability registry, authorization, synchronization, health and action receipts for connected external systems. |
| Platform | **IT — IT Operations, Reliability & Security Response** | 9 | `/o/:org/it/home` | Central operational observability, agent-assisted incident response, safe fixes, diagnostics, performance, configuration and controlled delivery. |

## Acceptance evidence and quality gate

`docs/implementation/registry-coverage.json` declares 316 bespoke screens, 1,323 required tabs, 1,328 required actions and 956 required overlays, with declaration coverage reported as complete. **That is structural coverage only.**

The independent register at `docs/implementation/EXPERIENCE_INDEPENDENT_SIGNOFF.json` currently lists all 316 screens as `awaiting` across visual, form/action effects, keyboard, responsive, accessibility and independent review. Preserve those statuses until supported by actual test evidence; this directory release does not mark them accepted.

Evidence required for each of the 316 screens:

1. Desktop, tablet and mobile viewport screenshots inspected against the approved design system, including overflow and focus state.
2. Forms, validation, named actions, actual persisted effects, reversibility and truthful blocked operations exercised.
3. Tabs, menus, drawers, modal focus return, Escape, screen-reader names and 200% zoom/reflow verified.
4. Company switching, local role-view filtering, record ownership and data preservation tested.
5. Native app routes, empty and failure states, keyboard-only use and cross-application transitions tested.
6. Independent reviewer sign-off with screenshots/traces/CI links, separately from developer implementation status.

## Automated regression entry points

- `tests/unit/apps-directory.test.ts` — complete application coverage and company-safe entries.
- `e2e/apps-directory.spec.ts` — search, categories, favourites, role views and responsive layouts.
- `e2e/all-native-app-entrypoints.spec.ts` — launch every registered native tool from the hub.
- `e2e/header-context-safety.spec.ts` and `e2e/universal-header.spec.ts` — navigation, record context and global controls.
- `tests/unit/registry-contract.test.ts` — tab/action/overlay declaration ledger.
- `npm run qa` and the dedicated Chromium workflow — required before production promotion.

**Current readiness is not equivalent to feature-by-feature sign-off.** Any missing independent evidence remains unverified, even if all application bundles load cleanly.
