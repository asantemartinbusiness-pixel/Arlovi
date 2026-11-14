# Arlovi — Entire Discussion: Decision and Requirements Consolidation

**Purpose:** preserve every material request, proposed direction and nonnegotiable project decision from the conversation, alongside the exhaustive 226-page UX specification and screen registry. **This is a requirements reconstruction, not a verbatim transcript export**. Exact full raw message export is not available through this handoff process; the original specification sources are preserved in `/07_ORIGINAL_SPECIFICATIONS/`. This document does not falsely claim to include inaccessible message text.

## 1. Vision and core identity
- The current working platform brand is **Arlovi**, subject to commercial/trademark/domain clearance. Master brand should be globally usable, memorable, one-word, premium yet approachable. Existing Arlovi commercial name use and an occupied `.com` were flagged; keep tokens/name replaceable.
- Distinct AI Chief of Staff identity may later be cleared; prefer a safe working entry label **Ask Arlovi** rather than generic "Ask AI". Names Arlo, Arli, Oli, Alvi showed potential competing uses; do not present any as cleared.
- Product is an **AI-native Company Operating System** and a **virtual digital headquarters** for entire organizations with human and AI coworkers. A business should be able to conduct its whole day-to-day operation within one coherent software environment.
- Benchmark breadth against Zoho One and Microsoft 365; product UX sophistication against Apple/Google/Linear, creation against Figma/Adobe/Canva, project operations against Linear/Asana, AI conversation against ChatGPT/Claude/Gemini, business verticals against QuickBooks/Xero, HubSpot/Salesforce, Rippling/BambooHR, Shopify, Intercom/Zendesk, Calendly, n8n/Make, BI tools. Do not copy competitor trade dress.
- One platform, many native apps, shared company identity/data, optional outside integrations. Native apps aim for professional depth and eventual self-sufficiency. Some regulated/payment/network delivery infrastructure inherently remains external.
- User explicitly rejects MVP scoping: all discussed capabilities must be treated as full final target. Parallel workstreams are orchestration only; no deferred basic functionality or quietly dropped modules.

## 2. Intelligent executive organization
- Company Brain must understand company identity, brands, policies, customer/product graph, documents, financial records, operational state, decisions and agent knowledge. Track source, reliability, freshness, permissions, conflicts, human review and revocation.
- Chief of Staff coordinates independent departmental AI employees, reviews, disagreements, task delegation and mission execution. Business owner asks natural questions, requests work, or assigns objectives. Agents should know what context to use and should not ask for repeat information.
- Agents have contracts: identity, role, reporting, tools, skills, scoped resources, model routing, budget, working schedule, quality criteria, human supervisor, training history and performance evaluations.
- Team Rooms and Mission Rooms support humans talking to AI; AI-to-AI collaboration should use structured messages, not merely theatrical chat bubbles. Every task has owner, evidence and deliverable; specialists may disagree with reasoning and escalate.
- Assistant supports text, voice, selected object context, attachments, source linking, structured outputs, deep contextual app handoffs and complete mission conversion.
- AI Meeting Mode includes consent, transcription, agenda, speaker handling, decisions and action items; actual remote calls require provider services.
- AI IT Department monitors faults, diagnoses, repairs what it is authorized to control, retries idempotently and escalates when cannot repair. Never claim to fix third-party provider internals.

## 3. Goal and mission orchestration
- Mission contract links objective, responsible team, tasks, dependencies, budget/approval scope, artifacts, actions, statuses, checks and result sources. Lifecycle includes draft, planning, authorization, queued, running, waiting, verifying, complete/partial/blocked/failed/cancelled, monitoring and resumption.
- User can adjust mission in natural language, review impacts, approve changes and see evidence receipts. All significant external side effects require independent policy enforcement. No model self-granting permissions.
- Priority example: Christmas campaign planning and execution across Finance, Marketing, Commerce, Creative, communications and Analytics. A second example is financial-recovery investigation and managed change.
- Other recurring scenarios: lead-to-cash, support-to-resolution, employee onboarding, procurement replenishment, booking-to-service, document-to-knowledge, design-to-publish, app build-to-deploy, emergency pause, data deletion/export, connector recovery and monthly reporting.
- Long-running work survives navigation; full backend durability is future work. In frontend-only scope model durable local checkpoints and clearly explain nonconnected external services.

## 4. Application and office experience
- Global shell: org/brand switcher, command search, collapsible navigation, user profile, notifications, execution tray, contextual inspector. User may switch among overview, conversation, split workspace, canvas/editor focus modes.
- Home should show business health, team activity, meaningful recommendations, exceptions, approvals, current missions and daily briefings, with role-adaptive views for CEO, finance, operations, marketing, customer service, IT and external clients.
- Each department has digital home: people, work, comms, apps, docs, performance. Human and AI employees coexist with visible distinct identities and correct access boundaries.
- Native business suite: Finance/Accounting, CRM/Sales, HR/Payroll, Projects, Communications/Email/Calendar/Meetings, Customer Care, Marketing, Commerce, Bookings, Procurement/Inventory, Knowledge/Training, Legal/Governance, external client portals, analytics, integrations, IT and administration.
- Native creative suite: Documents, Spreadsheets, Presentations, Vector Design, Photo/Raster, Layout/Publishing, Video Editing, Motion Graphics, Websites/CMS, App Builder/Code, Forms and Brand Asset Library.
- Specialists require true domain tools: accounting journals and reconciliation, CRM pipeline, calendar and conversations, vector anchor editing, raster layers, rich document editing, spreadsheet formulas, slide object editing, responsive website components, video timeline and export.
- Avoid turning all pages into identical dashboards. Each page, tab, sidebar, dialog, inspector and interaction needs its own UX spec; shared components don't replace professional app-specific requirements.

## 5. Notifications and communication
- Attention Engine separates raw events from user-facing notifications; P0 security, P1 blockers, P2 approvals, P3 significant milestones, P4 routine activity, P5 insights. Avoid operational noise; group duplicates and digest routine activity.
- Notification Inbox views: For You, Approvals, Messages, Updates, Activity. Support read/acknowledged/snoozed/assigned/resolved/expired distinctions; read is not approval.
- UI patterns have semantics: inline feedback, toast, notification, banner, popover, drawer, modal, full flow, critical incident. Overlays manage focus and mobile adaptivity.
- Morning/evening/weekly executive briefings, optional focus preferences, time zone and schedules; security escalation unaffected by muting ordinary activity.
- All alerts deep link to actionable records; all user/AI exchanges have clear source, permissions, state and ownership.

## 6. Visual, colour, typography and interaction decisions
- Temporary palette evolved to bolder, fun but serious explorations. Recommended lead concept **Electric Cobalt #234FE8**, Papaya #FFAE7C, Aqua #36C5BA, canvas #F7F8FC, ink #17223A, dark #141A30. Other explorations Ember/Plum, Ultraviolet/Lime, Neo Teal/Coral, Electric Berry/Mint, Carbon/Citron. All remain exploratory and configurable.
- Gradients: Cobalt/Periwinkle/Peach, Plum/Coral/Apricot, Midnight/Teal/Mint. Use strong gradients in brand/AI expression, not every finance button/table.
- Graphic language: connected intelligence nodes, modular blocks and living abstract shapes. No childish cartoons or relentless glowing AI orb. Professional, vibrant and architectural.
- Typography: Inter or Geist, 16px body comfortable, 13–14px dense data, 12–13px labels, 28–32px page titles. Reading width 720–840px; 4px spacing basis; 60px header, 248px sidebar/64px rail, 300–360px inspector, page padding 32/24/16px desktop/tablet/mobile.
- Responsive breakpoints 320–599, 600–899, 900–1199, 1200–1599, 1600+. Independent scroll, dynamic viewport safe areas, accessible 44px touch targets, keyboard shortcuts, high contrast, reduced motion. Three visual densities: Comfortable, Balanced, Compact.
- Target mature, precise interaction as in Adobe/Figma: real drag and drop, selection, snapping, hover, focus, intelligent toolbars, undo/version history, preview and contextual AI edits. Motion concise: mostly 120–260ms, depending on context.
- Every editable artifact should support direct manipulation plus AI guidance, preserve structured data, and be exportable in supported real formats.

## 7. Absolute frontend-only directive for this handoff
- User now wants six coordinated Cursor/Grok workstreams to **implement the entire interactive frontend in an empty Git repository**. No backend implementation at this stage.
- Every registered route, page, tab, overlay, action, native application, interaction and meaningful business flow should work locally and persist, rather than showing static screenshots or dead buttons.
- User explicitly does not want user-facing "demo" or "prototype" labels; deliver a credible production-grade visual interface. Do not misrepresent external side effects as actually performed; use honest connection/unavailable states when real providers are absent.
- Orchestrator and workers should take routine executive/design/architecture decisions autonomously, continuously coordinate, peer review and fix until engineering evidence supports completion.
- Six defined workstreams; exact 35-domain mapping and 316-screen acceptance registry enclosed.

## 8. Scope and source boundaries
- The attached source Markdown/JSON/DOCX specification is the exhaustive registered UX inventory delivered in the earlier session. Its per-screen details are essential; this decision record supplements them.
- An exact verbatim export of every original chat message is **not** present. The repository handoff preserves a comprehensive, faithful requirements synthesis and the extant 226-page engineering document, rather than pretending to possess an exact transcript.
- Real server security, real identity enforcement, provider OAuth, cloud AI reasoning, payment settlement, native multiuser synchronization, third-party publishing and actual hosted deployments are explicitly outside the current **frontend implementation layer**. The fully specified UI must represent these services accurately and expose typed future integration ports.
