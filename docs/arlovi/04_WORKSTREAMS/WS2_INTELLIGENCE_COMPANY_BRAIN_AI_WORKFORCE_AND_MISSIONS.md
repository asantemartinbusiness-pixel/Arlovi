# WS2 — Intelligence, Company Brain, AI Workforce and Missions

**Executive lead:** Chief AI Product Officer & Orchestration Architect | **Owned domains:** 6 | **Screens:** 59 | **Tabs:** 247 | **Overlays:** 181 | **Primary actions:** 251

**North star:** A coherent organizational intelligence interface where human requests become trackable authorized missions, agent assignments and evidence-based results.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Implement Ask Arlovi, direct agent conversations, team rooms, mentions, contextual artifact side panes, source cards, voice input permission UI and meeting flows.
- Company Brain: safe intake, source provenance, organizational graph, knowledge health, fact conflicts, review and approval; do not claim full document OCR or external live intelligence absent local models/services.
- AI Workforce: distinguish human and AI, create/edit agent contracts, roles, skills, playbooks, Academy training, evaluations, availability and permissions.
- Mission Engine: plan -> approval -> queued -> executing -> verifying -> completed/partial/blocked/failed, with expense caps and evidence receipts. Use deterministic local events; never fake verified external outcome.
- Workflow builder: real drag handles, connect/disconnect, control flow, validation, dry-run in local model, error handlers, schedules while app is open, and honest persistence limitations.
- Analytics: charts built from underlying local domain records, not arbitrary fake numbers presented as live business data.


## Owned applications and screen-level contracts


### AI — AI Companion & Conversations

**Purpose:** Conversation-first Chief of Staff interface, contextual research, multimodal input, specialist communication, meeting intelligence, and execution handoffs.

**Human/AI users:** Owner; employee; assigned AI specialist; delegated approver

**Entities:** Conversation; Message; ContextGrant; SourceRef; AgentHandoff; Transcript; Artifact

**Competitor benchmarking:** ChatGPT; Claude; Gemini; Slack AI

**Screen count:** 10

#### ARL-AI-001 — Chief of Staff Chat

**Route:** `/o/:org/ai/chat` | **Archetype:** `chat`

**Layout/content:** Thread list; rich conversation surface; composer; source chips; contextual artifact preview.

**Tabs (3):** Chat, Attachments, Related missions

**Primary actions (6):** Send text, dictate, attach, mention record, open artifact, create mission

**Context overlays (4):** Source selector, upload review, message action menu, task authorization

**AI behavior:** Answers from permissioned sources; delegates via mission contracts; labels planned versus completed

**Risk and edge test:** Ambiguous target account requires clarification before any external action

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/ai/chat loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Chat and Related missions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Send text” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Source selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Ambiguous target account requires clarification before any external action; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-002 — Conversation Library

**Route:** `/o/:org/ai/conversations` | **Archetype:** `directory`

**Layout/content:** Searchable threads; grouped recents; pinned sessions; sharing state.

**Tabs (4):** Recent, Pinned, Shared, Archived

**Primary actions (5):** Open, rename, archive, delete, search transcript

**Context overlays (3):** Thread preview, delete confirmation, sharing dialog

**AI behavior:** Summarizes old threads with access checks and original citations

**Risk and edge test:** Archived conversations remain subject to legal retention and RBAC

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/ai/conversations loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Thread preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Archived conversations remain subject to legal retention and RBAC; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-003 — Specialist Chat

**Route:** `/o/:org/ai/agents/:id/chat` | **Archetype:** `chat`

**Layout/content:** Agent identity; expertise and authority badge; conversation; related tasks.

**Tabs (3):** Conversation, Work, Sources

**Primary actions (4):** Message specialist, attach record, request handoff, review tool scope

**Context overlays (3):** Agent profile drawer, permission explainer, mission escalation

**AI behavior:** Specialist performs role-bounded analysis; escalates actions outside contract

**Risk and edge test:** Agent unavailable transfers to authorized coordinator without inventing progress

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/ai/agents/:id/chat loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Conversation and Sources shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Message specialist” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Agent profile drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Agent unavailable transfers to authorized coordinator without inventing progress; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-004 — Team Room

**Route:** `/o/:org/ai/rooms/:id` | **Archetype:** `chat`

**Layout/content:** Human and AI participant roster; channel transcript; artifacts; decisions; pinned work.

**Tabs (4):** Discussion, Decisions, Files, Tasks

**Primary actions (4):** Mention participant, assign task, pin decision, host review

**Context overlays (3):** Participant selector, decision recorder, topic thread

**AI behavior:** AI agents exchange structured requests and human-readable summaries

**Risk and edge test:** Do not allow group chat mentions to override external tool policies

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/ai/rooms/:id loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Discussion and Tasks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Mention participant” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Participant selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Do not allow group chat mentions to override external tool policies; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-005 — Mission Room

**Route:** `/o/:org/ai/missions/:id/room` | **Archetype:** `chat`

**Layout/content:** Assigned agents; task dependencies; discussion; evidence links; decision log.

**Tabs (4):** Discussion, Agents, Tasks, Reviews

**Primary actions (4):** Request status, assign reviewer, resolve disagreement, link evidence

**Context overlays (3):** Task handoff drawer, evidence inspector, review dialog

**AI behavior:** Chief of Staff coordinates specialists, rejects unsupported claims

**Risk and edge test:** Agent loops and circular delegation detected and stopped

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/ai/missions/:id/room loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Discussion and Reviews shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Request status” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Task handoff drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Agent loops and circular delegation detected and stopped; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-006 — Voice Workspace

**Route:** `/o/:org/ai/voice` | **Archetype:** `media`

**Layout/content:** Audio controls; permission state; transcription; real-time turn state; transcript history.

**Tabs (3):** Live, Transcript, Settings

**Primary actions (5):** Start stop, mute, change voice, view transcript, correct text

**Context overlays (3):** Mic permission, voice settings, sensitive-action confirmation

**AI behavior:** Voice assistant summarizes and delegates with same policy enforcement as text

**Risk and edge test:** No autonomous irreversible action based on misheard transcription

**Archetype design contract:** Live audio/video control workspace | Media preview, timeline/transcript, accessible controls and consent. | Essential transport controls visible; auxiliary views behind tabs.

**Screen acceptance gates:**

- Route /o/:org/ai/voice loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Live and Settings shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Start stop” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Mic permission” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No autonomous irreversible action based on misheard transcription; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-007 — AI Meeting Room

**Route:** `/o/:org/ai/meetings/:id` | **Archetype:** `media`

**Layout/content:** Participants; agenda; live transcript; consent; action items; recording status.

**Tabs (4):** Meeting, Transcript, Decisions, Actions

**Primary actions (4):** Invite agent, request specialist report, create action, end meeting

**Context overlays (3):** Recording consent, meeting notes, follow-up approval

**AI behavior:** Extracts decisions and tasks without treating unapproved discussion as authority

**Risk and edge test:** Participant consent and regional recording restrictions enforced

**Archetype design contract:** Live audio/video control workspace | Media preview, timeline/transcript, accessible controls and consent. | Essential transport controls visible; auxiliary views behind tabs.

**Screen acceptance gates:**

- Route /o/:org/ai/meetings/:id loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Meeting and Actions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Invite agent” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Recording consent” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Participant consent and regional recording restrictions enforced; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-008 — Research Workspace

**Route:** `/o/:org/ai/research/:id` | **Archetype:** `report`

**Layout/content:** Question; sources; evidence table; assumptions; working conclusions; output files.

**Tabs (4):** Findings, Sources, Methods, Citations

**Primary actions (4):** Refine question, inspect source, request independent review, publish report

**Context overlays (3):** Source inspector, confidence note, save report

**AI behavior:** Multi-source research with explicit dates, confidence and conflicting evidence

**Risk and edge test:** Missing private data clearly reported; never infer unverifiable figures as facts

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/ai/research/:id loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Findings and Citations shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Refine question” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Source inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Missing private data clearly reported; never infer unverifiable figures as facts; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-009 — Context Manager

**Route:** `/o/:org/ai/context` | **Archetype:** `admin`

**Layout/content:** Selected organization; active documents; connected records; sharing boundaries; model settings.

**Tabs (3):** This chat, Team context, Connected sources

**Primary actions (4):** Add remove context, inspect grants, redact selection, switch entity

**Context overlays (3):** Context picker, permission explanation, sensitive data warning

**AI behavior:** Constrains retrieval and memory writes to active grants

**Risk and edge test:** Context switch must invalidate cached records from prior organization

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/ai/context loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between This chat and Connected sources shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add remove context” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Context picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Context switch must invalidate cached records from prior organization; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AI-010 — Conversation Artifacts

**Route:** `/o/:org/ai/artifacts/:id` | **Archetype:** `editor`

**Layout/content:** Generated file preview; version; reviewers; linked messages; edit actions.

**Tabs (4):** Preview, Versions, Comments, Sources

**Primary actions (5):** Open in native app, revise with AI, comment, share, export

**Context overlays (3):** Version comparison, share dialog, export dialog

**AI behavior:** Creates editable artifact and preserves provenance to conversation

**Risk and edge test:** External publication requires separate mission scope and verification

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/ai/artifacts/:id loads only scoped conversation data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Preview and Sources shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open in native app” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Version comparison” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: External publication requires separate mission scope and verification; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### BRAIN — Company Brain & Knowledge

**Purpose:** Persistent business knowledge graph, provenance-aware document intelligence, scoped organizational memory and conflict resolution.

**Human/AI users:** Knowledge steward; executive; department lead; authorized specialist agent

**Entities:** Source; Fact; CanonicalEntity; Relation; Decision; KnowledgePolicy; IngestionJob

**Competitor benchmarking:** Notion; Confluence; enterprise search

**Screen count:** 10

#### ARL-BRAIN-001 — Knowledge Home

**Route:** `/o/:org/brain/home` | **Archetype:** `dashboard`

**Layout/content:** Knowledge quality; recent sources; suggested improvements; stale data; top entities.

**Tabs (4):** Overview, Recent, Quality, Opportunities

**Primary actions (4):** Search knowledge, review proposal, inspect missing source, import

**Context overlays (3):** Knowledge inspector, suggestion approval, upload

**AI behavior:** Recommends safe additions with evidence and provenance

**Risk and edge test:** Unverified claim never promoted to authoritative business fact automatically

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/brain/home loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Opportunities shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Search knowledge” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Knowledge inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unverified claim never promoted to authoritative business fact automatically; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-002 — Source Library

**Route:** `/o/:org/brain/sources` | **Archetype:** `directory`

**Layout/content:** Files; linked services; classification; owner; freshness; indexing state.

**Tabs (4):** Documents, Websites, Integrations, Media

**Primary actions (5):** Upload, filter, inspect, reprocess, retire source

**Context overlays (3):** Upload dialog, source detail drawer, retention dialog

**AI behavior:** Classifies source and proposes permissions and entity matches

**Risk and edge test:** Virus scanning and ingestion isolation precede all content use

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/brain/sources loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Documents and Media shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Upload dialog” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Virus scanning and ingestion isolation precede all content use; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-003 — Source Detail

**Route:** `/o/:org/brain/sources/:id` | **Archetype:** `record`

**Layout/content:** Original file preview; extracted contents; metadata; access; lineage; corrections.

**Tabs (5):** Preview, Extracted data, Relationships, Access, History

**Primary actions (5):** Correct extraction, annotate, restrict, reindex, export

**Context overlays (3):** Correction form, permission editor, delete request

**AI behavior:** Extracts structured information but records author and confidence

**Risk and edge test:** Corrections preserve original source and immutable correction history

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/brain/sources/:id loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Preview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Correct extraction” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Correction form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Corrections preserve original source and immutable correction history; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-004 — Business Graph

**Route:** `/o/:org/brain/graph` | **Archetype:** `graph`

**Layout/content:** Company entities; relationships; ownership; provenance; link confidence.

**Tabs (3):** Entities, Relationships, Exceptions

**Primary actions (4):** Explore node, merge candidates, split record, filter graph

**Context overlays (3):** Entity inspector, merge preview, relationship editor

**AI behavior:** Suggests entity linking using source evidence

**Risk and edge test:** Uncertain matches require review before irreversible merge

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/brain/graph loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Entities and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Explore node” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Entity inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Uncertain matches require review before irreversible merge; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-005 — Fact Registry

**Route:** `/o/:org/brain/facts` | **Archetype:** `directory`

**Layout/content:** Structured assertions; time validity; confidence; canonical owner; provenance.

**Tabs (4):** Verified, Proposed, Conflicting, Expired

**Primary actions (5):** Approve, reject, annotate, set expiry, compare facts

**Context overlays (3):** Evidence drawer, verification dialog, conflict resolver

**AI behavior:** Flags ambiguous facts and missing source coverage

**Risk and edge test:** Two incompatible facts cannot both be presented as current authoritative

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/brain/facts loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Verified and Expired shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Approve” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Evidence drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Two incompatible facts cannot both be presented as current authoritative; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-006 — Knowledge Conflicts

**Route:** `/o/:org/brain/conflicts` | **Archetype:** `board`

**Layout/content:** Unresolved contradictions by domain; affected agents; urgency; source comparison.

**Tabs (3):** Open, In review, Resolved

**Primary actions (3):** Select source of truth, defer, request external confirmation

**Context overlays (3):** Comparison drawer, resolution dialog, escalation

**AI behavior:** Generates evidence comparison and recommended reconciliation

**Risk and edge test:** Financial mismatches require ledger/accounting review, not AI choice

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/brain/conflicts loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Open and Resolved shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Select source of truth” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Comparison drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Financial mismatches require ledger/accounting review, not AI choice; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-007 — Decision Register

**Route:** `/o/:org/brain/decisions` | **Archetype:** `directory`

**Layout/content:** Approved decisions; rationale; approvers; related missions; results.

**Tabs (4):** All, Proposed, Approved, Superseded

**Primary actions (4):** Create decision, link approval, inspect rationale, supersede

**Context overlays (3):** Decision draft, approval detail, impact review

**AI behavior:** Summarizes decision history with source references

**Risk and edge test:** Superseded decisions remain visible for audit with status

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/brain/decisions loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Superseded shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create decision” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Decision draft” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Superseded decisions remain visible for audit with status; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-008 — Brand Intelligence

**Route:** `/o/:org/brain/brand` | **Archetype:** `editor`

**Layout/content:** Brand systems; logos; typography; tone; company assets; regional variants.

**Tabs (6):** Identity, Colours, Typography, Voice, Assets, Rules

**Primary actions (4):** Import guide, edit token, approve variant, set usage

**Context overlays (3):** Brand rule editor, asset selector, impact preview

**AI behavior:** Extracts proposed brand rules and evaluates creative outputs

**Risk and edge test:** Unapproved extraction must not silently overwrite approved design tokens

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/brain/brand loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Identity and Rules shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Import guide” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Brand rule editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unapproved extraction must not silently overwrite approved design tokens; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-009 — Knowledge Permissions

**Route:** `/o/:org/brain/permissions` | **Archetype:** `admin`

**Layout/content:** Sensitivity groups; access paths; data residency; retrieval policies; audit.

**Tabs (4):** Roles, Source grants, Retention, Activity

**Primary actions (4):** Adjust access, simulate retrieval, revoke grant, inspect usage

**Context overlays (3):** Grant dialog, simulation report, revoke confirmation

**AI behavior:** Reports how policy changes affect agent visibility

**Risk and edge test:** Revocation must invalidate downstream access and cached retrieval where feasible

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/brain/permissions loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Roles and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust access” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Grant dialog” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Revocation must invalidate downstream access and cached retrieval where feasible; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BRAIN-010 — Intake Centre

**Route:** `/o/:org/brain/intake` | **Archetype:** `dashboard`

**Layout/content:** Upload queue; file parsing; source classification; proposals; failures.

**Tabs (5):** Incoming, Processing, Review, Completed, Failed

**Primary actions (4):** Upload, retry safe step, approve extraction, route document

**Context overlays (3):** File chooser, import review, unsupported format error

**AI behavior:** Processes media and records safely; proposes workflows without executing

**Risk and edge test:** Large malformed or adversarial files isolated and reported

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/brain/intake loads only scoped source data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Incoming and Failed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “File chooser” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Large malformed or adversarial files isolated and reported; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### TEAM — AI Workforce & Agent Academy

**Purpose:** Operational AI employee roster, departmental hierarchy, agent skills, role contracts, model routing, training, permission and evaluation.

**Human/AI users:** Owner; workforce administrator; department manager; AI evaluator

**Entities:** Agent; AgentContract; Department; Skill; Playbook; Evaluation; ModelPolicy

**Competitor benchmarking:** OpenAI Agents; Microsoft Copilot Studio; workforce management

**Screen count:** 10

#### ARL-TEAM-001 — Workforce Home

**Route:** `/o/:org/team/home` | **Archetype:** `dashboard`

**Layout/content:** Agent counts; active assignments; cost; quality; blocked agents; reviews due.

**Tabs (4):** Overview, Activity, Costs, Reliability

**Primary actions (4):** Hire AI employee, inspect issue, pause agent, view department

**Context overlays (3):** Agent creation, quick profile, cost inspector

**AI behavior:** Chief of Staff suggests staffing only with supported business need

**Risk and edge test:** Hidden computation must not be misreported as active human-like presence

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/team/home loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Reliability shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Hire AI employee” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Agent creation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Hidden computation must not be misreported as active human-like presence; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-002 — AI Employee Directory

**Route:** `/o/:org/team/agents` | **Archetype:** `directory`

**Layout/content:** Role cards; department; status; skill; manager; filters.

**Tabs (5):** All, By department, Active, Paused, Draft

**Primary actions (4):** Find agent, open profile, assign work, clone tested contract

**Context overlays (3):** Agent quick view, assignment, archive confirmation

**AI behavior:** Routes request to evaluated specialist

**Risk and edge test:** Suspended agent excluded from tool execution and auto delegation

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/team/agents loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Draft shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Find agent” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Agent quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Suspended agent excluded from tool execution and auto delegation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-003 — Agent Profile

**Route:** `/o/:org/team/agents/:id` | **Archetype:** `record`

**Layout/content:** Identity; reporting line; skills; current missions; knowledge grants; performance.

**Tabs (6):** Overview, Skills, Work, Permissions, Performance, History

**Primary actions (5):** Edit role, test, reassign, pause, open chat

**Context overlays (3):** Role edit, permission inspector, test panel

**AI behavior:** Explains capabilities, limitations and allowed actions

**Risk and edge test:** Permission change must invalidate stale grants for queued tasks

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/team/agents/:id loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit role” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Role edit” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Permission change must invalidate stale grants for queued tasks; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-004 — Agent Builder

**Route:** `/o/:org/team/agents/new` | **Archetype:** `wizard`

**Layout/content:** Role brief; identity; team placement; skills; model; tools; budgets.

**Tabs (6):** Identity, Skills, Knowledge, Tools, Autonomy, Test

**Primary actions (5):** Generate contract, select templates, configure limits, test, activate

**Context overlays (4):** Skill picker, connector grant, simulation, publish confirmation

**AI behavior:** Converts natural-language job description into structured agent contract

**Risk and edge test:** Agent cannot activate before evaluation and explicit external grants

**Archetype design contract:** Sequential review flow | Progress, draft resume, clear requirements, confirmations and alternative pathways. | Single column, visible Back/Continue and keyboard navigation.

**Screen acceptance gates:**

- Route /o/:org/team/agents/new loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Identity and Test shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Generate contract” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Skill picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Agent cannot activate before evaluation and explicit external grants; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-005 — Organization Chart

**Route:** `/o/:org/team/organization` | **Archetype:** `graph`

**Layout/content:** Departments; human and AI workers; reporting lines; scope badges.

**Tabs (3):** Hierarchy, Directory, Capacity

**Primary actions (4):** Reparent agent, create department, assign lead, filter

**Context overlays (3):** Employee inspector, transfer approval, hierarchy impact

**AI behavior:** Suggests balanced staffing and permitted delegation

**Risk and edge test:** Cross-entity reporting cannot grant cross-entity data rights

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/team/organization loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Hierarchy and Capacity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reparent agent” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Employee inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cross-entity reporting cannot grant cross-entity data rights; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-006 — Skills Library

**Route:** `/o/:org/team/skills` | **Archetype:** `directory`

**Layout/content:** Versioned skills; tools required; inputs outputs; ownership; evaluations.

**Tabs (4):** Native, Organization, Purchased, Draft

**Primary actions (5):** Search, install, edit, deprecate, compare versions

**Context overlays (3):** Skill detail, install permission, compatibility test

**AI behavior:** Identifies skill gaps by role and mission history

**Risk and edge test:** Untrusted skill bundles sandboxed and reviewed before runtime

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/team/skills loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Native and Draft shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Search” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Skill detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Untrusted skill bundles sandboxed and reviewed before runtime; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-007 — Agent Academy

**Route:** `/o/:org/team/academy` | **Archetype:** `dashboard`

**Layout/content:** Courses; examples; playbooks; guided training; completion; approvals.

**Tabs (4):** Training, Playbooks, Assessments, Results

**Primary actions (4):** Upload SOP, demonstrate task, assign course, test

**Context overlays (3):** Training asset upload, assessment builder, publishing review

**AI behavior:** Extracts repeatable procedures from approved examples

**Risk and edge test:** New knowledge remains proposed until validated and scoped

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/team/academy loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Training and Results shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload SOP” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Training asset upload” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: New knowledge remains proposed until validated and scoped; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-008 — Evaluation Lab

**Route:** `/o/:org/team/evaluations` | **Archetype:** `report`

**Layout/content:** Test suites; scenario fixtures; pass rates; model comparison; safety checks.

**Tabs (4):** Scenarios, Runs, Regression, Reports

**Primary actions (4):** Run evaluation, compare model, approve new version, rollback

**Context overlays (3):** Scenario editor, detailed trace, promotion approval

**AI behavior:** Grades output against deterministic and human-reviewed criteria

**Risk and edge test:** Model updates cannot silently lower required safety score

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/team/evaluations loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Scenarios and Reports shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run evaluation” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Scenario editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Model updates cannot silently lower required safety score; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-009 — Agent Performance

**Route:** `/o/:org/team/performance` | **Archetype:** `report`

**Layout/content:** Task completion; verified outcomes; cost; reliability; escalation frequency.

**Tabs (4):** Employees, Departments, Trends, Quality

**Primary actions (4):** Compare agents, inspect failed task, coach, adjust resource policy

**Context overlays (3):** Metric definition, incident trace, performance note

**AI behavior:** Suggests improvement using explicit evidence and uncertainty

**Risk and edge test:** No fabricated ROI or value-of-human-work estimates

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/team/performance loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Employees and Quality shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compare agents” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric definition” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No fabricated ROI or value-of-human-work estimates; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-TEAM-010 — Model Routing

**Route:** `/o/:org/team/models` | **Archetype:** `admin`

**Layout/content:** Approved providers; capabilities; evaluation scores; latency; token budgets.

**Tabs (4):** Providers, Routing, Budgets, Experiments

**Primary actions (4):** Set role model, test fallback, restrict data, inspect spend

**Context overlays (3):** Provider setup, routing simulator, policy warning

**AI behavior:** Selects economical model meeting tested capability and data constraints

**Risk and edge test:** Provider outage triggers safe fallback only if allowed by data policy

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/team/models loads only scoped agent data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Providers and Experiments shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set role model” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Provider setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider outage triggers safe fallback only if allowed by data policy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### MISSION — Missions & Autonomous Execution

**Purpose:** Central orchestration of company objectives, plans, task graphs, approvals, execution, verification and results.

**Human/AI users:** Mission owner; Chief of Staff; department lead; assigned worker; approver

**Entities:** Mission; PlanVersion; Task; ActionReceipt; BudgetReservation; Approval; Deliverable

**Competitor benchmarking:** Linear; Asana; Temporal workflow

**Screen count:** 11

#### ARL-MISSION-001 — Mission Library

**Route:** `/o/:org/mission/missions` | **Archetype:** `directory`

**Layout/content:** Mission search; status filter; cards and list; ownership; important blockers.

**Tabs (6):** All, Proposed, Running, Waiting, Completed, Archived

**Primary actions (5):** Create mission, filter, bulk tag, open, duplicate plan

**Context overlays (3):** Mission quick view, create mission, archive confirmation

**AI behavior:** Suggests matches from user goals and avoids duplicate missions

**Risk and edge test:** Archived missions remain auditable, not executable

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/mission/missions loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create mission” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Mission quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Archived missions remain auditable, not executable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-002 — Mission Creation

**Route:** `/o/:org/mission/missions/new` | **Archetype:** `wizard`

**Layout/content:** Objective; context; departments; outputs; budget; scope; timing.

**Tabs (6):** Goal, Context, Team, Plan, Permissions, Review

**Primary actions (4):** Describe goal, attach records, revise plan, submit for approval

**Context overlays (4):** Source picker, team selector, risk review, approval sheet

**AI behavior:** Creates typed mission DAG and estimates work from evidence

**Risk and edge test:** Cannot authorize unknown target accounts or unbounded spend

**Archetype design contract:** Sequential review flow | Progress, draft resume, clear requirements, confirmations and alternative pathways. | Single column, visible Back/Continue and keyboard navigation.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/new loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Goal and Review shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Describe goal” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Source picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cannot authorize unknown target accounts or unbounded spend; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-003 — Mission Overview

**Route:** `/o/:org/mission/missions/:id` | **Archetype:** `dashboard`

**Layout/content:** Goal; executive summary; team; progress; next milestone; blockers; cost.

**Tabs (6):** Overview, Plan, Team, Deliverables, Activity, Results

**Primary actions (5):** Pause, resume, cancel, ask status, approve next step

**Context overlays (3):** Status explanation, pause dialog, amendment request

**AI behavior:** Summarizes authoritative task state and risk

**Risk and edge test:** Completed label requires verified criteria, not merely finished agent text

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Results shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Pause” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Status explanation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Completed label requires verified criteria, not merely finished agent text; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-004 — Plan & Dependencies

**Route:** `/o/:org/mission/missions/:id/plan` | **Archetype:** `graph`

**Layout/content:** Task DAG; milestones; dependencies; owners; estimates; policy checkpoints.

**Tabs (4):** Graph, List, Timeline, Risks

**Primary actions (4):** Drag dependencies, edit task, add review, compare versions

**Context overlays (3):** Task inspector, plan revision, scope change approval

**AI behavior:** Replans subject to authorized mission contract

**Risk and edge test:** Cycle in task graph blocked; published plan version immutable

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/plan loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Graph and Risks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag dependencies” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Task inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cycle in task graph blocked; published plan version immutable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-005 — Mission Task Board

**Route:** `/o/:org/mission/missions/:id/tasks` | **Archetype:** `board`

**Layout/content:** To do; ready; running; review; blocked; verified lanes.

**Tabs (3):** Board, List, Assignees

**Primary actions (4):** Move card, delegate, attach evidence, reopen task

**Context overlays (3):** Task detail, reassign, move impact

**AI behavior:** Specialists handle task within assigned capability

**Risk and edge test:** Dragging card cannot bypass approval or execute irreversible action

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/tasks loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Board and Assignees shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Move card” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Task detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Dragging card cannot bypass approval or execute irreversible action; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-006 — Execution Console

**Route:** `/o/:org/mission/missions/:id/execution` | **Archetype:** `timeline`

**Layout/content:** Live state; attempts; tool actions; checkpoints; provider confirmation.

**Tabs (4):** Timeline, Actions, Checkpoints, Exceptions

**Primary actions (4):** Inspect receipt, retry safe task, stop, continue

**Context overlays (3):** Action receipt, retry confirmation, execution trace

**AI behavior:** Agent requests go through policy gateway and verification

**Risk and edge test:** Timeout with unknown side effect must reconcile before retry

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/execution loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Timeline and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect receipt” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Action receipt” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Timeout with unknown side effect must reconcile before retry; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-007 — Mission Team Room

**Route:** `/o/:org/mission/missions/:id/team` | **Archetype:** `chat`

**Layout/content:** Agent roster; handoffs; decisions; discussions; files; specialist review.

**Tabs (4):** Discussion, Owners, Decisions, Reviews

**Primary actions (4):** Message, mention, request review, accept handoff

**Context overlays (3):** Agent selector, handoff view, decision record

**AI behavior:** AI-to-AI requests structured with bounded owner and deliverable

**Risk and edge test:** Repeated circular debate halted and surfaced to coordinator

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/team loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Discussion and Reviews shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Message” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Agent selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Repeated circular debate halted and surfaced to coordinator; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-008 — Deliverables Library

**Route:** `/o/:org/mission/missions/:id/deliverables` | **Archetype:** `directory`

**Layout/content:** Artifacts; preview; version; approval status; source link.

**Tabs (5):** All, Draft, Review, Approved, Published

**Primary actions (5):** Open edit, compare, approve, export, share

**Context overlays (4):** Artifact preview, approval, version diff, publish verification

**AI behavior:** Generates editable native outputs and checks brand compliance

**Risk and edge test:** External published result is not undoable by editing the draft

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/deliverables loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Published shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open edit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Artifact preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: External published result is not undoable by editing the draft; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-009 — Mission Budget

**Route:** `/o/:org/mission/missions/:id/budget` | **Archetype:** `report`

**Layout/content:** Ceiling; reservations; spend; pending provider charges; projections.

**Tabs (4):** Summary, Ledger, Policies, History

**Primary actions (4):** Approve adjustment, inspect cost, set alert, export

**Context overlays (3):** Budget variance, limit increase approval, cost source

**AI behavior:** Forecasts costs without claiming hard caps over asynchronous providers

**Risk and edge test:** Concurrent reservations atomic; prevent spending same headroom twice

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/budget loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Summary and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Approve adjustment” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Budget variance” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Concurrent reservations atomic; prevent spending same headroom twice; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-010 — Mission Results

**Route:** `/o/:org/mission/missions/:id/results` | **Archetype:** `report`

**Layout/content:** Required outcomes; verified evidence; business KPIs; costs; lessons.

**Tabs (4):** Outcomes, Evidence, ROI, Follow-up

**Primary actions (4):** View evidence, issue report, create follow-up, close mission

**Context overlays (3):** Source inspector, results approval, reopen

**AI behavior:** Compares plan to verified outcome and labels unresolved work

**Risk and edge test:** No fabricated KPI uplift; causal claims flagged with limitations

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/mission/missions/:id/results loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Outcomes and Follow-up shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “View evidence” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Source inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No fabricated KPI uplift; causal claims flagged with limitations; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MISSION-011 — Mission Templates

**Route:** `/o/:org/mission/templates` | **Archetype:** `directory`

**Layout/content:** Reusable mission objectives; tasks; team presets; permissions; evaluations.

**Tabs (3):** Company, Industry, My templates

**Primary actions (4):** Create from, edit template, publish, simulate

**Context overlays (3):** Template editor, example data, approval grant

**AI behavior:** Drafts reusable playbooks from completed missions

**Risk and edge test:** Templates never carry expired credentials or approvals forward

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/mission/templates loads only scoped mission data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Company and My templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create from” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Template editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Templates never carry expired credentials or approvals forward; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### AUTO — Automation & Workflow Builder

**Purpose:** Visual event-driven and scheduled automation with AI nodes, conditions, approvals, replay and recovery.

**Human/AI users:** Automation engineer; operations lead; AI reliability team

**Entities:** Workflow; Trigger; ActionNode; Run; CredentialGrant; RetryPolicy

**Competitor benchmarking:** Zapier; Make; n8n; Temporal

**Screen count:** 9

#### ARL-AUTO-001 — Automation Library

**Route:** `/o/:org/auto/workflows` | **Archetype:** `directory`

**Layout/content:** Workflows; owners; triggers; status; last run; issues.

**Tabs (5):** All, Active, Draft, Paused, Failed

**Primary actions (5):** Create, duplicate, activate, pause, archive

**Context overlays (3):** Workflow quick view, activation review, archive

**AI behavior:** Suggests workflows from repeated business process

**Risk and edge test:** Copy never includes stale credentials or approval grants

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/auto/workflows loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Failed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Workflow quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Copy never includes stale credentials or approval grants; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-002 — Visual Workflow Builder

**Route:** `/o/:org/auto/workflows/:id` | **Archetype:** `graph`

**Layout/content:** Node palette; graph canvas; properties; validation; simulation.

**Tabs (4):** Design, Parameters, Test, History

**Primary actions (5):** Drag node, connect, configure, validate, save

**Context overlays (3):** Node picker, connector grants, branch editor

**AI behavior:** Converts natural language into typed workflow graph

**Risk and edge test:** Graph cycles or unbounded loops require limit/validation

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/auto/workflows/:id loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag node” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Node picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Graph cycles or unbounded loops require limit/validation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-003 — Trigger Configuration

**Route:** `/o/:org/auto/workflows/:id/triggers` | **Archetype:** `editor`

**Layout/content:** Webhooks; schedules; app events; filters; sample payloads.

**Tabs (4):** Events, Schedules, Filters, Tests

**Primary actions (4):** Select trigger, set timezone, test, activate

**Context overlays (3):** Webhook setup, schedule recurrence, sample inspection

**AI behavior:** Recommends correct trigger from provider capability

**Risk and edge test:** Duplicate and out-of-order event delivery handled

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/auto/workflows/:id/triggers loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Events and Tests shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Select trigger” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Webhook setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Duplicate and out-of-order event delivery handled; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-004 — Action & AI Nodes

**Route:** `/o/:org/auto/workflows/:id/actions` | **Archetype:** `builder`

**Layout/content:** Connector actions; AI skills; input mapping; outputs; side effect risk.

**Tabs (4):** Actions, AI, Approval, Control flow

**Primary actions (4):** Map fields, add capability, set retries, inspect permission

**Context overlays (3):** Action parameter, policy simulation, variable selector

**AI behavior:** Selects tools only within authorized capabilities

**Risk and edge test:** High-impact action cannot execute on test data accidentally

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/auto/workflows/:id/actions loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Actions and Control flow shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Map fields” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Action parameter” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: High-impact action cannot execute on test data accidentally; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-005 — Workflow Testing

**Route:** `/o/:org/auto/workflows/:id/test` | **Archetype:** `report`

**Layout/content:** Dry-run results; sample inputs; branch coverage; side effects.

**Tabs (4):** Simulation, Test runs, Assertions, Failures

**Primary actions (4):** Run dry-run, inspect, compare, approve

**Context overlays (3):** Fixture editor, assertion builder, simulated receipt

**AI behavior:** Explains failed paths with structured proof

**Risk and edge test:** Test mode must not send real email or transfer funds

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/auto/workflows/:id/test loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Simulation and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run dry-run” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Fixture editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Test mode must not send real email or transfer funds; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-006 — Run History

**Route:** `/o/:org/auto/runs` | **Archetype:** `table`

**Layout/content:** Run ID; trigger; status; attempts; timing; worker; outcomes.

**Tabs (5):** All, Running, Failed, Completed, Waiting

**Primary actions (3):** Open trace, retry safe step, cancel

**Context overlays (3):** Run inspector, retry safety check, incident link

**AI behavior:** Summarizes failure and recovery options

**Risk and edge test:** Unknown side effect reconciled before retry

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/auto/runs loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Waiting shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open trace” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Run inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown side effect reconciled before retry; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-007 — Workflow Run Detail

**Route:** `/o/:org/auto/runs/:id` | **Archetype:** `timeline`

**Layout/content:** Event chain; action receipts; retries; provider response; duration.

**Tabs (5):** Timeline, Inputs, Outputs, Logs, Decisions

**Primary actions (3):** Inspect node, replay safe path, export

**Context overlays (3):** Node trace, redaction, replay confirmation

**AI behavior:** Identifies root cause and proposes safe fix

**Risk and edge test:** Sensitive tool payloads redacted from unauthorized viewers

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/auto/runs/:id loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Timeline and Decisions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect node” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Node trace” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive tool payloads redacted from unauthorized viewers; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-008 — Schedules & Queues

**Route:** `/o/:org/auto/schedules` | **Archetype:** `calendar`

**Layout/content:** Recurring runs; pending jobs; concurrency; backpressure; time zones.

**Tabs (4):** Calendar, Queues, Limits, History

**Primary actions (4):** Reschedule, pause, change concurrency, inspect

**Context overlays (3):** Schedule editor, queue priority, impact warning

**AI behavior:** Balances safe workload across agents

**Risk and edge test:** Daylight-saving and duplicate schedule firings handled

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/auto/schedules loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Calendar and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reschedule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Schedule editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Daylight-saving and duplicate schedule firings handled; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-AUTO-009 — Automation Exceptions

**Route:** `/o/:org/auto/exceptions` | **Archetype:** `board`

**Layout/content:** Failures; blocked grants; stale schema; escalations; root cause.

**Tabs (4):** New, Investigating, Awaiting user, Resolved

**Primary actions (4):** Assign, retry, fix connection, close

**Context overlays (3):** Incident detail, connector reconnect, resolution record

**AI behavior:** IT agent attempts approved repair and verification

**Risk and edge test:** No false resolved status while provider unverified

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/auto/exceptions loads only scoped workflow data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between New and Resolved shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Incident detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No false resolved status while provider unverified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### ANALYTICS — Analytics, BI & Reporting

**Purpose:** Cross-company business intelligence, governed metrics, dashboard authoring, source lineage, forecasting and data exports.

**Human/AI users:** Executive; analyst; CFO; department manager; AI analyst

**Entities:** Dataset; Measure; Dashboard; Report; DataConnection; MetricDefinition

**Competitor benchmarking:** Power BI; Looker; Tableau

**Screen count:** 9

#### ARL-ANALYTICS-001 — Insights Overview

**Route:** `/o/:org/analytics/home` | **Archetype:** `dashboard`

**Layout/content:** Key health metrics; trends; anomalies; opportunities; question composer.

**Tabs (5):** Executive, Financial, Customers, Operations, AI

**Primary actions (4):** Ask question, inspect source, save view, delegate investigation

**Context overlays (3):** Metric inspector, insight detail, data freshness

**AI behavior:** Uses reconciled metrics and clearly distinguishes hypothesis

**Risk and edge test:** Missing datasets shown with connection instructions

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/analytics/home loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Executive and AI shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Ask question” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Missing datasets shown with connection instructions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-002 — Dashboard Directory

**Route:** `/o/:org/analytics/dashboards` | **Archetype:** `directory`

**Layout/content:** Dashboards; departments; owners; access; freshness.

**Tabs (4):** All, Mine, Shared, Templates

**Primary actions (5):** Create, open, pin, share, archive

**Context overlays (3):** Dashboard setup, sharing, source dependency

**AI behavior:** Recommends layout based on KPI question

**Risk and edge test:** Sensitive metrics not leaked through thumbnail previews

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/analytics/dashboards loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Dashboard setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive metrics not leaked through thumbnail previews; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-003 — Dashboard Editor

**Route:** `/o/:org/analytics/dashboards/:id` | **Archetype:** `editor`

**Layout/content:** Grid; metric cards; charts; filters; contextual source; drag layout.

**Tabs (4):** Layout, Data, Style, Access

**Primary actions (4):** Drag widget, resize, set filter, publish

**Context overlays (3):** Widget chooser, query editor, share

**AI behavior:** Builds dashboards from approved metric definitions

**Risk and edge test:** Cross-widget filters use consistent semantic types

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/analytics/dashboards/:id loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Layout and Access shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag widget” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Widget chooser” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cross-widget filters use consistent semantic types; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-004 — Report Builder

**Route:** `/o/:org/analytics/reports/:id` | **Archetype:** `editor`

**Layout/content:** Sections; queries; visualizations; commentary; scheduling.

**Tabs (4):** Content, Data, Layout, Distribution

**Primary actions (4):** Create report, add chart, cite, publish

**Context overlays (3):** Report block, schedule, source inspection

**AI behavior:** Writes sourced executive commentary

**Risk and edge test:** Report not presented finalized with stale/dropped sources

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/analytics/reports/:id loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Content and Distribution shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create report” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Report block” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Report not presented finalized with stale/dropped sources; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-005 — Dataset Catalogue

**Route:** `/o/:org/analytics/datasets` | **Archetype:** `directory`

**Layout/content:** Tables; lineage; refresh; owners; permissions; quality.

**Tabs (4):** All, Connected, Native, Issues

**Primary actions (5):** Browse, document, grant, refresh, retire

**Context overlays (3):** Dataset details, grant review, quality

**AI behavior:** Proposes joins and schema mapping

**Risk and edge test:** Dataset owner and privacy constraints respected

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/analytics/datasets loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Issues shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Browse” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Dataset details” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Dataset owner and privacy constraints respected; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-006 — Metric Definitions

**Route:** `/o/:org/analytics/metrics` | **Archetype:** `admin`

**Layout/content:** Canonical KPI formulas; units; time ranges; owners; data lineage.

**Tabs (4):** Metrics, Dimensions, Versions, Validation

**Primary actions (4):** Define measure, test, approve, compare

**Context overlays (3):** Formula editor, impact review, metric QA

**AI behavior:** Explains metric definition and sensitivity

**Risk and edge test:** Changing a metric versions historical dashboard meaning

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/analytics/metrics loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Metrics and Validation shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Define measure” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Formula editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Changing a metric versions historical dashboard meaning; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-007 — Data Modelling

**Route:** `/o/:org/analytics/models` | **Archetype:** `graph`

**Layout/content:** Relationships; joins; transforms; calculated fields; validation.

**Tabs (4):** Schema, Transformations, Tests, Lineage

**Primary actions (4):** Add relation, validate, refresh, deploy

**Context overlays (3):** Join properties, transform editor, test

**AI behavior:** Suggests validated transformation logic

**Risk and edge test:** Fan-out joins cannot inflate totals silently

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/analytics/models loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Schema and Lineage shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add relation” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Join properties” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Fan-out joins cannot inflate totals silently; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-008 — Forecasts & Scenarios

**Route:** `/o/:org/analytics/forecasts` | **Archetype:** `report`

**Layout/content:** Assumptions; projections; scenarios; uncertainty bands; source.

**Tabs (4):** Forecast, Scenarios, Inputs, Accuracy

**Primary actions (4):** Adjust inputs, compare, save, request review

**Context overlays (3):** Assumption inspector, scenario editor, confidence note

**AI behavior:** Builds explainable models rather than unfounded certainty

**Risk and edge test:** Forecast never silently replaces posted actual

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/analytics/forecasts loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Forecast and Accuracy shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust inputs” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Assumption inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Forecast never silently replaces posted actual; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ANALYTICS-009 — Reports & Distribution

**Route:** `/o/:org/analytics/distribution` | **Archetype:** `admin`

**Layout/content:** Scheduled reports; recipients; access; formats; history.

**Tabs (4):** Schedules, Audiences, Deliveries, Failures

**Primary actions (4):** Schedule, test, pause, resend safely

**Context overlays (3):** Recipient preview, delivery method, failure detail

**AI behavior:** Summarizes changes in permitted briefings

**Risk and edge test:** Unauthorized recipients blocked; send deduplication enforced

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/analytics/distribution loads only scoped dataset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Schedules and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Schedule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Recipient preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unauthorized recipients blocked; send deduplication enforced; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
