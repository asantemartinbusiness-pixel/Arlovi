# WS1 — Core Experience, Headquarters, Identity and Attention

**Executive lead:** Chief Experience Officer & Design System Architect | **Owned domains:** 4 | **Screens:** 34 | **Tabs:** 143 | **Overlays:** 100 | **Primary actions:** 138

**North star:** One universal, accessible, attractive headquarters with sensible navigation and a calm intelligent attention system.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Own global header/sidebars/context panel/command search/organization switcher, tokens, typography, grids, modals, drawer mechanics, notification components and cross-app visual consistency.
- Create configurable Electric Cobalt/Papaya/Aqua palette with 5 contrasting alternate themes; dark mode and typography scale; no hardcoded per-app inconsistent colours.
- Design Inbox as the Attention Engine: priority levels P0-P5, grouped delivery, duplicate suppression, approvals, read vs resolved, snooze, digest, deep-link and escalation.
- Keep organization and brand identity unmistakable when switching contexts. Local role checks are for UX only, not real security.
- Design the Assets library as a shared source of approved logos, photographs, templates, document attachments and variant history.


## Owned applications and screen-level contracts


### HQ — Headquarters & Organization

**Purpose:** The company-wide digital office: executive intelligence, personal work, departments, locations, company goals, and shared operational context.

**Human/AI users:** CEO; Founder; operations lead; department manager; member; AI Chief of Staff

**Entities:** Organization; Workspace; Department; Membership; Objective; Location; Briefing

**Competitor benchmarking:** Zoho One; Microsoft 365; Notion

**Screen count:** 10

#### ARL-HQ-001 — Executive Home

**Route:** `/o/:org/hq/home` | **Archetype:** `dashboard`

**Layout/content:** Personal greeting and AI composer; performance summary with source freshness; urgent approvals; active missions; recommended insights.

**Tabs (3):** Today, Week, Saved views

**Primary actions (4):** Ask Chief of Staff, rearrange cards, drill into metric, dismiss recommendation

**Context overlays (3):** Widget picker, metric inspector, save view dialog

**AI behavior:** Synthesizes attributable executive briefing from permitted data; opens investigation missions only by policy

**Risk and edge test:** Unknown or stale KPI must show age and unavailable source, not a fabricated value

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/hq/home loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Today and Saved views shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Ask Chief of Staff” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Widget picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown or stale KPI must show age and unavailable source, not a fabricated value; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-002 — My Workspace

**Route:** `/o/:org/hq/my-work` | **Archetype:** `dashboard`

**Layout/content:** Assigned tasks; personal calendar; drafts; mentions; recent files; teammate availability.

**Tabs (4):** Today, Upcoming, Saved, History

**Primary actions (4):** Prioritize task, open draft, request help, pin item

**Context overlays (3):** Quick task, work item inspector, personal preferences

**AI behavior:** Summarizes workload and prepares bounded next actions

**Risk and edge test:** Rescinded assignment disappears without exposing prior confidential content

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/hq/my-work loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Today and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Prioritize task” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Quick task” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Rescinded assignment disappears without exposing prior confidential content; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-003 — Company Overview

**Route:** `/o/:org/hq/company` | **Archetype:** `dashboard`

**Layout/content:** Entity profile; cross-department KPIs; organization health; objectives; active risks.

**Tabs (4):** Business, Performance, Operations, Compliance

**Primary actions (3):** Inspect metric, open department, create company objective

**Context overlays (3):** KPI builder, executive note, data freshness inspector

**AI behavior:** Correlates department changes while showing uncertainties

**Risk and edge test:** Parent/subsidiary totals must not double count intercompany transactions

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/hq/company loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Business and Compliance shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect metric” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “KPI builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Parent/subsidiary totals must not double count intercompany transactions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-004 — Departments Directory

**Route:** `/o/:org/hq/departments` | **Archetype:** `directory`

**Layout/content:** Searchable department cards; leadership; member counts; agents; work summaries.

**Tabs (3):** All, My departments, Pinned

**Primary actions (4):** Open department, create department, assign leader, reorder directory

**Context overlays (2):** Create department, organizational impact preview

**AI behavior:** Proposes staffing and department structures for review

**Risk and edge test:** Department deletion blocked while active ownership or protected records unresolved

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/hq/departments loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Pinned shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open department” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Create department” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Department deletion blocked while active ownership or protected records unresolved; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-005 — Department Workspace

**Route:** `/o/:org/hq/departments/:id` | **Archetype:** `dashboard`

**Layout/content:** Overview; departmental KPIs; member roster; channels; shared files; missions.

**Tabs (6):** Overview, People, Work, Discussions, Files, Performance

**Primary actions (4):** Assign work, message team, add resource, open department app

**Context overlays (3):** Department settings, invite member, permission inspector

**AI behavior:** Department agents propose plans using department-authorized context

**Risk and edge test:** Human staff sees no other department private records

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/hq/departments/:id loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Performance shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign work” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Department settings” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Human staff sees no other department private records; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-006 — Organization Chart

**Route:** `/o/:org/hq/organization` | **Archetype:** `graph`

**Layout/content:** Human and AI reporting nodes; departments; dotted-line associations; vacancies.

**Tabs (3):** People, Departments, AI employees

**Primary actions (4):** Pan zoom, focus node, modify reporting line, switch tree/list

**Context overlays (3):** Member inspector, change manager, impact confirmation

**AI behavior:** Suggests structures but cannot reassign privileged managers autonomously

**Risk and edge test:** Cycle in management graph rejected; accessible non-spatial list required

**Archetype design contract:** Spatial graph and dependency inspection | Pan/zoom, focus, selection, relationships, accessible list counterpart. | Canvas with collapsible side panels; accessible list on mobile.

**Screen acceptance gates:**

- Route /o/:org/hq/organization loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between People and AI employees shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Pan zoom” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Member inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cycle in management graph rejected; accessible non-spatial list required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-007 — Company Goals

**Route:** `/o/:org/hq/goals` | **Archetype:** `board`

**Layout/content:** Company objectives; metric targets; initiative links; ownership; review dates.

**Tabs (4):** Active, Proposed, Achieved, Archived

**Primary actions (4):** Create objective, link mission, update measure, review goal

**Context overlays (3):** Goal editor, target change review, related work inspector

**AI behavior:** Proposes measurable objectives and evidence-based status

**Risk and edge test:** Do not mark achieved from model text without target-data confirmation

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/hq/goals loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Active and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create objective” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Goal editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Do not mark achieved from model text without target-data confirmation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-008 — Locations & Entities

**Route:** `/o/:org/hq/locations` | **Archetype:** `directory`

**Layout/content:** Offices; legal entities; brands; business hours; regional policy boundaries.

**Tabs (4):** Locations, Legal entities, Brands, Operating calendars

**Primary actions (4):** Add location, set primary office, choose scope, edit local details

**Context overlays (3):** Location form, scope preview, duplicate checker

**AI behavior:** Uses correct time zone and entity context for missions

**Risk and edge test:** Cross-location transfers require correct local dates and authorized data access

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/hq/locations loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Locations and Operating calendars shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add location” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Location form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cross-location transfers require correct local dates and authorized data access; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-009 — Company Timeline

**Route:** `/o/:org/hq/timeline` | **Archetype:** `timeline`

**Layout/content:** Major decisions; launches; mission milestones; company changes; annotated incidents.

**Tabs (5):** All, Decisions, Financial, People, Technology

**Primary actions (4):** Filter, inspect source, add milestone, export history

**Context overlays (3):** Event inspector, add annotation, export selection

**AI behavior:** Builds concise summaries with links to actual records

**Risk and edge test:** Restricted events remain hidden from unauthorized timeline viewers

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/hq/timeline loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Technology shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Event inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Restricted events remain hidden from unauthorized timeline viewers; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HQ-010 — Workplace Directory

**Route:** `/o/:org/hq/directory` | **Archetype:** `directory`

**Layout/content:** People; AI employees; roles; contact methods; team availability.

**Tabs (4):** Humans, AI, Departments, Skills

**Primary actions (4):** Find colleague, start conversation, assign task, view profile

**Context overlays (2):** Profile quick view, presence settings

**AI behavior:** Matches expertise to work without impersonating a human

**Risk and edge test:** Personal contact details governed by member privacy settings

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/hq/directory loads only scoped organization data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Humans and Skills shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Find colleague” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Profile quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Personal contact details governed by member privacy settings; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### INBOX — Inbox, Notifications & Attention Engine

**Purpose:** Company-wide attention prioritization, actionable approvals, grouped updates, messages, incidents, delivery channels and digests.

**Human/AI users:** Every human; assigned AI coordinator; security administrator

**Entities:** Notification; AttentionRule; Approval; Delivery; Digest; Escalation

**Competitor benchmarking:** Linear Inbox; Slack notifications; Apple notification patterns

**Screen count:** 8

#### ARL-INBOX-001 — Unified Inbox

**Route:** `/o/:org/inbox/inbox` | **Archetype:** `directory`

**Layout/content:** Prioritized items; grouped mission activity; unread; assigned; urgency.

**Tabs (5):** For You, Approvals, Messages, Updates, Activity

**Primary actions (5):** Open record, mark read, snooze, assign, bulk triage

**Context overlays (3):** Notification detail, snooze picker, action preview

**AI behavior:** Attention agent suppresses routine noise and surfaces decisions

**Risk and edge test:** Read does not equal approve or resolve

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/inbox/inbox loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between For You and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open record” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Notification detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Read does not equal approve or resolve; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-002 — Approvals

**Route:** `/o/:org/inbox/approvals` | **Archetype:** `table`

**Layout/content:** Requester; exact action; risk; amount; affected accounts; expiry.

**Tabs (4):** Mine, Delegated, Pending, History

**Primary actions (5):** Review, approve, deny, ask changes, delegate

**Context overlays (3):** Approval review, step-up auth, scope diff

**AI behavior:** Explains tradeoffs and source evidence, cannot self-approve

**Risk and edge test:** Approval bound to exact action/plan version

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/inbox/approvals loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Mine and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Approval review” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Approval bound to exact action/plan version; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-003 — Messages Inbox

**Route:** `/o/:org/inbox/messages` | **Archetype:** `chat`

**Layout/content:** Human and AI mentions; customer escalation; team chat entry.

**Tabs (4):** Unread, Assigned, Mentions, Escalated

**Primary actions (4):** Reply, open thread, assign, convert to task

**Context overlays (3):** Message inspector, reassignment, mute

**AI behavior:** Summarizes context for recipient without leaking private threads

**Risk and edge test:** Message routing honors restricted channel access

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/inbox/messages loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Unread and Escalated shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Message inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Message routing honors restricted channel access; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-004 — Notifications Feed

**Route:** `/o/:org/inbox/notifications` | **Archetype:** `directory`

**Layout/content:** Company events; categories; source; timestamps; group digests.

**Tabs (4):** All, Milestones, Routine, Archived

**Primary actions (4):** Filter, follow source, clear read, open deep-link

**Context overlays (3):** Event detail, grouped items, preference quick view

**AI behavior:** Groups related work into meaningful update

**Risk and edge test:** Broken deep-link shows safe record unavailable page

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/inbox/notifications loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Event detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Broken deep-link shows safe record unavailable page; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-005 — Incident Alerts

**Route:** `/o/:org/inbox/incidents` | **Archetype:** `board`

**Layout/content:** Critical issues; affected service; status; escalation route; owner.

**Tabs (4):** Urgent, Waiting, Resolved, Security

**Primary actions (4):** Acknowledge, assign, inspect impact, escalate

**Context overlays (3):** Incident summary, owner handoff, emergency pause

**AI behavior:** IT agent provides verifiable diagnosis and safe recovery

**Risk and edge test:** Platform critical alert delivery respects OS authorization

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/inbox/incidents loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Urgent and Security shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Acknowledge” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Incident summary” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Platform critical alert delivery respects OS authorization; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-006 — Notification Preferences

**Route:** `/o/:org/inbox/settings` | **Archetype:** `settings`

**Layout/content:** Channel preferences; roles; focus; quiet hours; topic subscriptions.

**Tabs (4):** Channels, Categories, Schedule, Delegation

**Primary actions (4):** Toggle, test preview, set digest, mute mission

**Context overlays (3):** Delivery test, quiet-hour rules, exception explanation

**AI behavior:** Recommends sane defaults based on interruption load

**Risk and edge test:** Security escalation policy independent from casual muting

**Archetype design contract:** Preference-oriented form | Categories, field-level explanations, immediate and deferred save states. | Single column with persistent category search.

**Screen acceptance gates:**

- Route /o/:org/inbox/settings loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Channels and Delegation shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Toggle” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Delivery test” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Security escalation policy independent from casual muting; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-007 — Digest Centre

**Route:** `/o/:org/inbox/digests` | **Archetype:** `report`

**Layout/content:** Morning brief; evening summary; weekly review; recipients.

**Tabs (4):** Daily, Weekly, Custom, History

**Primary actions (4):** Schedule, preview, export, send test

**Context overlays (3):** Digest editor, audience, schedule

**AI behavior:** Generates grounded management brief with source and open decisions

**Risk and edge test:** No fabricated action count or stale financial totals

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/inbox/digests loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Daily and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Schedule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Digest editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No fabricated action count or stale financial totals; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-INBOX-008 — Escalations & Delegation

**Route:** `/o/:org/inbox/escalations` | **Archetype:** `admin`

**Layout/content:** Backup approvers; escalation timers; authority; handoff.

**Tabs (4):** Rules, Coverage, History, Conflicts

**Primary actions (4):** Assign backup, set condition, simulate, revoke

**Context overlays (3):** Delegation grant, simulation, escalation conflict

**AI behavior:** Proposes routing when owner unavailable

**Risk and edge test:** Delegated user never exceeds approval authority

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/inbox/escalations loads only scoped notification data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Rules and Conflicts shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign backup” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Delegation grant” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Delegated user never exceeds approval authority; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### ADMIN — Administration, Identity, Policy & Billing

**Purpose:** Company settings, tenant identity, access, roles, AI authority, spend, privacy, billing, audit, exports and recovery.

**Human/AI users:** Owner; designated IT; finance admin; security admin; privacy steward

**Entities:** OrganizationPolicy; Role; Session; AuditEvent; Subscription; BillingInvoice; DataExport

**Competitor benchmarking:** Microsoft Entra; Rippling IT; enterprise admin consoles

**Screen count:** 11

#### ARL-ADMIN-001 — Organization Settings

**Route:** `/o/:org/admin/organization` | **Archetype:** `settings`

**Layout/content:** Company identity; locations; working hours; default currency; locale.

**Tabs (4):** Profile, Branding, Business hours, Regional

**Primary actions (3):** Edit profile, configure entity, verify domain

**Context overlays (3):** Identity form, region change impact, domain verify

**AI behavior:** Suggests config from approved company records

**Risk and edge test:** Org legal identity changes require higher trust checks

**Archetype design contract:** Preference-oriented form | Categories, field-level explanations, immediate and deferred save states. | Single column with persistent category search.

**Screen acceptance gates:**

- Route /o/:org/admin/organization loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Profile and Regional shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit profile” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Identity form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Org legal identity changes require higher trust checks; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-002 — Members & Invitations

**Route:** `/o/:org/admin/members` | **Archetype:** `table`

**Layout/content:** Users; roles; status; departments; pending invites; last access.

**Tabs (4):** Members, Invitations, Teams, External

**Primary actions (5):** Invite, suspend, role change, revoke, export

**Context overlays (3):** Invite wizard, role impact, revoke confirmation

**AI behavior:** Suggests least privilege based on job role

**Risk and edge test:** Offboard revokes sessions and relevant grants

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/admin/members loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Members and External shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Invite” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Invite wizard” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Offboard revokes sessions and relevant grants; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-003 — Roles & Permissions

**Route:** `/o/:org/admin/roles` | **Archetype:** `admin`

**Layout/content:** Role definitions; resource/actions; conditions; inheritance; simulations.

**Tabs (4):** Roles, Policies, Effective access, Exceptions

**Primary actions (4):** Create role, compare, simulate, publish

**Context overlays (3):** Policy editor, effective rights, impact review

**AI behavior:** Proposes least-privilege rules as draft

**Risk and edge test:** Deny precedence and tenant boundaries enforced server-side

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/roles loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Roles and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create role” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Policy editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Deny precedence and tenant boundaries enforced server-side; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-004 — Autonomy Centre

**Route:** `/o/:org/admin/autonomy` | **Archetype:** `admin`

**Layout/content:** Agent scopes; modes; mission grants; high risk operations; emergency pause.

**Tabs (5):** Company, Departments, Agents, Missions, History

**Primary actions (4):** Set grant, cap action, suspend, test permission

**Context overlays (3):** Grant editor, action simulator, revoke confirmation

**AI behavior:** Explains risk and agent capabilities, never issues own grants

**Risk and edge test:** No unrestricted global autonomy toggle bypasses guardrails

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/autonomy loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Company and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set grant” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Grant editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No unrestricted global autonomy toggle bypasses guardrails; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-005 — Budget & AI Usage

**Route:** `/o/:org/admin/budgets` | **Archetype:** `report`

**Layout/content:** Model usage; token costs; tool spend; provider charges; reservations.

**Tabs (5):** AI, Missions, Providers, Limits, Invoices

**Primary actions (4):** Set quota, approve increase, allocate, inspect

**Context overlays (3):** Spend limit, cost allocation, budget warning

**AI behavior:** Optimizes model routing within risk and quality standards

**Risk and edge test:** Reservations atomic; provider spend lag disclosed

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/admin/budgets loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between AI and Invoices shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set quota” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Spend limit” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Reservations atomic; provider spend lag disclosed; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-006 — Security & Sessions

**Route:** `/o/:org/admin/security` | **Archetype:** `admin`

**Layout/content:** SSO; MFA; devices; active sessions; trusted IP; auth events.

**Tabs (4):** Authentication, Sessions, Devices, Threats

**Primary actions (4):** Configure SSO, revoke, require MFA, export

**Context overlays (3):** Provider setup, emergency revoke, security review

**AI behavior:** Finds access anomalies without exposing credentials

**Risk and edge test:** Sensitive changes require step-up auth and audit

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/security loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Authentication and Threats shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Configure SSO” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Provider setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive changes require step-up auth and audit; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-007 — Audit Trail

**Route:** `/o/:org/admin/audit` | **Archetype:** `table`

**Layout/content:** Human/AI action; target; timestamp; grant; outcome; source.

**Tabs (5):** All, Access, Data, Financial, AI

**Primary actions (4):** Filter, inspect receipt, export, retention

**Context overlays (3):** Audit detail, export authorization, event chain

**AI behavior:** Produces factual audit summaries linked to immutable logs

**Risk and edge test:** Audit records append-only and tamper-resistant

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/admin/audit loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and AI shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Audit detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Audit records append-only and tamper-resistant; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-008 — Privacy & Data Controls

**Route:** `/o/:org/admin/privacy` | **Archetype:** `admin`

**Layout/content:** Retention; residency; consent; DSR; AI data policy; classifications.

**Tabs (5):** Retention, Consent, Requests, Processing, Residency

**Primary actions (4):** Review request, export, restrict, delete where lawful

**Context overlays (3):** Data request, deletion impact, jurisdiction disclaimer

**AI behavior:** Assists classification and impact reports

**Risk and edge test:** Legal holds and statutory retention honored

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/privacy loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Retention and Residency shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review request” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Data request” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Legal holds and statutory retention honored; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-009 — Billing & Subscription

**Route:** `/o/:org/admin/billing` | **Archetype:** `table`

**Layout/content:** Plan; seats; feature usage; invoices; payment method; balance.

**Tabs (4):** Overview, Invoices, Usage, Payment

**Primary actions (4):** Manage subscription, pay, download invoice, update method

**Context overlays (3):** Checkout, cancellation, billing support

**AI behavior:** Explains charges and usage without changing billing unapproved

**Risk and edge test:** Payment methods handled by compliant provider

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/admin/billing loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Payment shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Manage subscription” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Checkout” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Payment methods handled by compliant provider; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-010 — Backups & Recovery

**Route:** `/o/:org/admin/recovery` | **Archetype:** `admin`

**Layout/content:** Backups; retention points; export; restore requests; failed jobs.

**Tabs (4):** Backups, Exports, Restores, Failures

**Primary actions (4):** Request backup, restore test, export, archive org

**Context overlays (3):** Restore impact, retention check, disaster drill

**AI behavior:** Suggests recovery after incident

**Risk and edge test:** Restore never overwrites newer changes without approved plan

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/recovery loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Backups and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Request backup” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Restore impact” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Restore never overwrites newer changes without approved plan; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ADMIN-011 — Environment & Developer Access

**Route:** `/o/:org/admin/developer` | **Archetype:** `admin`

**Layout/content:** API credentials; organization webhooks; environments; sandbox; secrets.

**Tabs (4):** API, Webhooks, Sandbox, Logs

**Primary actions (4):** Issue key, rotate, revoke, test webhook

**Context overlays (3):** Key creation, scope limits, callback tester

**AI behavior:** Generates integration docs with limited grants

**Risk and edge test:** Secrets shown once and not copied into AI context

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/admin/developer loads only scoped organizationpolicy data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between API and Logs shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Issue key” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Key creation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Secrets shown once and not copied into AI context; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### ASSET — Assets, Media Library & Brand Resources

**Purpose:** Central reusable media, approved creative assets, licensed materials, fonts, templates and usage lineage for all Studio and business apps.

**Human/AI users:** Brand manager; designer; marketing; AI Creative Director

**Entities:** Asset; Licence; AssetVersion; BrandToken; AssetCollection

**Competitor benchmarking:** Adobe Assets; Canva Brand Hub; DAM systems

**Screen count:** 5

#### ARL-ASSET-001 — Asset Library

**Route:** `/o/:org/asset/assets` | **Archetype:** `directory`

**Layout/content:** Grid/list; media thumbnails; tags; file types; licence; use history.

**Tabs (5):** All, Mine, Approved, Brand, Archived

**Primary actions (5):** Upload, search, group, inspect, replace

**Context overlays (3):** Media import, asset inspector, rights check

**AI behavior:** Tags and recommends existing approved assets

**Risk and edge test:** Expired licence restricts publishing use

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/asset/assets loads only scoped asset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Media import” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Expired licence restricts publishing use; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ASSET-002 — Asset Detail

**Route:** `/o/:org/asset/assets/:id` | **Archetype:** `record`

**Layout/content:** Preview; metadata; versions; rights; crop variants; usage links.

**Tabs (5):** Overview, Variants, Usage, Rights, History

**Primary actions (4):** Download, create variant, update rights, archive

**Context overlays (3):** Variant editor, rights form, replacement impact

**AI behavior:** Suggests crops and formats for channels

**Risk and edge test:** Replacing shared asset previews affected live uses

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/asset/assets/:id loads only scoped asset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Download” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Variant editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Replacing shared asset previews affected live uses; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ASSET-003 — Brand Kits

**Route:** `/o/:org/asset/brands` | **Archetype:** `directory`

**Layout/content:** Logos; palette; type; guidelines; templates; multi-brand variants.

**Tabs (4):** Brands, Tokens, Assets, Rules

**Primary actions (4):** Create brand kit, apply, edit, publish

**Context overlays (3):** Token editor, brand selection, global impact

**AI behavior:** Extracts and validates approved identity rules

**Risk and edge test:** Unapproved upload cannot replace active master brand

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/asset/brands loads only scoped asset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Brands and Rules shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create brand kit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Token editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unapproved upload cannot replace active master brand; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ASSET-004 — Media Transformations

**Route:** `/o/:org/asset/transforms` | **Archetype:** `builder`

**Layout/content:** Resize; crop; format; watermark; batch compression; review.

**Tabs (4):** Presets, Jobs, History, Failed

**Primary actions (4):** Create preset, batch export, compare, publish

**Context overlays (3):** Transform inspector, rights, overwrite review

**AI behavior:** Suggests channel-appropriate variants

**Risk and edge test:** No destructive overwrite without version and authorisation

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/asset/transforms loads only scoped asset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Presets and Failed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create preset” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Transform inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No destructive overwrite without version and authorisation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-ASSET-005 — Asset Usage & Governance

**Route:** `/o/:org/asset/governance` | **Archetype:** `report`

**Layout/content:** Usage mapping; rights expiry; duplicate assets; storage; quality.

**Tabs (4):** Usage, Rights, Duplicates, Storage

**Primary actions (4):** Find use, resolve duplicate, set retention, export

**Context overlays (3):** Usage inspector, merge preview, expiry warning

**AI behavior:** Flags rights and duplication risks

**Risk and edge test:** Archive respects legal/brand retention constraints

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/asset/governance loads only scoped asset data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Usage and Storage shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Find use” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Usage inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Archive respects legal/brand retention constraints; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
