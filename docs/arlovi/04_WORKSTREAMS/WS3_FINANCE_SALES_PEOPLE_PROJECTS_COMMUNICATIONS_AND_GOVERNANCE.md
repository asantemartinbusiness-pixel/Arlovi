# WS3 — Finance, Sales, People, Projects, Communications and Governance

**Executive lead:** Chief Enterprise Applications Officer | **Owned domains:** 7 | **Screens:** 72 | **Tabs:** 305 | **Overlays:** 217 | **Primary actions:** 298

**North star:** Professional native business tools with records, accounting invariants, business-specific tables, transactions, messaging, HR workflows and trustworthy history.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Finance: implement decimal-safe money representations, balanced debit/credit journals, chart of accounts, AR/AP state, invoice totals and reconciliation on local transactions; no fake tax filing or bank transfer.
- CRM: relationships, company/customer identity, deals, sales pipeline, quotes, notes, activity and communications integrated with Finance/Projects/Service.
- HR: human employee lifecycle and AI employee separation, applicants, offers, onboarding, leave, time, schedules, policies and permissions; no claim of statutory payroll execution.
- Projects: goals, initiatives, portfolios, lists, boards, calendars, dependency and workload maps with undo and version history.
- Comms: channels, DM, comments, meeting events, calendar invitation drafts, attachments and message search in local mode; no false sent mail/call/remote participant presence.
- Customer Care: cases, SLAs, customer context, triage, AI handoffs, knowledge suggestions, support queue and escalation with audit.
- Legal/Governance: obligations, review calendars, templates, legal holds, policy register; not substitute for qualified legal advice.


## Owned applications and screen-level contracts


### FIN — Finance & Accounting

**Purpose:** Full native double-entry financial management with strong auditability and AI assistance.

**Human/AI users:** Accountant; bookkeeper; CFO; company owner; authorized Finance agent

**Entities:** LedgerAccount; Journal; Invoice; Bill; Payment; BankTransaction; TaxCode; Budget

**Competitor benchmarking:** Xero; QuickBooks; Zoho Books

**Screen count:** 13

#### ARL-FIN-001 — Finance Overview

**Route:** `/o/:org/fin/home` | **Archetype:** `dashboard`

**Layout/content:** Cash; receivables; payables; P&L; reconciling; invoices due; source status.

**Tabs (4):** Overview, Cashflow, Tasks, Insights

**Primary actions (4):** Inspect metric, issue report, start reconciliation, ask Finance

**Context overlays (3):** Metric drilldown, reporting-period selector, correction proposal

**AI behavior:** Explains performance by verified ledger source

**Risk and edge test:** Unknown bank feed clearly marks balance unverified

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/fin/home loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Insights shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect metric” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric drilldown” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown bank feed clearly marks balance unverified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-002 — Chart of Accounts

**Route:** `/o/:org/fin/accounts` | **Archetype:** `directory`

**Layout/content:** Account codes; types; balances; active state; ledger links.

**Tabs (6):** All, Assets, Liabilities, Equity, Revenue, Expenses

**Primary actions (4):** Create account, deactivate, map category, export

**Context overlays (3):** Account editor, account history, deactivation impact

**AI behavior:** Proposes mapping for new transactions under policy

**Risk and edge test:** Cannot delete account with posted journal entries

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/fin/accounts loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Expenses shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create account” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Account editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cannot delete account with posted journal entries; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-003 — General Ledger

**Route:** `/o/:org/fin/ledger` | **Archetype:** `table`

**Layout/content:** Journals; date; period; account; debit; credit; provenance; filter.

**Tabs (4):** Entries, Journals, Periods, Audit

**Primary actions (4):** Post approved journal, inspect lines, reverse, search

**Context overlays (3):** Journal form, balancing validator, reverse confirmation

**AI behavior:** Drafts reconciled journals with evidence

**Risk and edge test:** Post rejects unbalanced entries and locked accounting periods

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/fin/ledger loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Entries and Audit shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Post approved journal” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Journal form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Post rejects unbalanced entries and locked accounting periods; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-004 — Invoice List

**Route:** `/o/:org/fin/invoices` | **Archetype:** `table`

**Layout/content:** Invoice number; customer; due date; amount; currency; status; aging.

**Tabs (5):** Draft, Awaiting payment, Overdue, Paid, Void

**Primary actions (5):** Create, filter, bulk reminders, export, open record

**Context overlays (3):** New invoice, bulk action preview, reminder approval

**AI behavior:** Prepares invoices from CRM and approved projects

**Risk and edge test:** Duplicate outbound sends guarded by provider reconciliation

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/fin/invoices loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Draft and Void shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “New invoice” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Duplicate outbound sends guarded by provider reconciliation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-005 — Invoice Detail

**Route:** `/o/:org/fin/invoices/:id` | **Archetype:** `record`

**Layout/content:** Customer and billing; tax; line items; totals; payment allocations; history.

**Tabs (4):** Overview, Line items, Payments, Activity

**Primary actions (6):** Edit draft, preview, approve, send, void, record payment

**Context overlays (4):** Line item editor, email preview, payment form, void reason

**AI behavior:** Explains tax and margin context; prepares approved follow-up

**Risk and edge test:** Sent invoices become versioned immutable records with correct adjustments

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/fin/invoices/:id loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit draft” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Line item editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sent invoices become versioned immutable records with correct adjustments; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-006 — Bills & Payables

**Route:** `/o/:org/fin/bills` | **Archetype:** `table`

**Layout/content:** Supplier bills; due dates; approvals; attachments; payment status.

**Tabs (5):** Inbox, Due, Approved, Paid, Exceptions

**Primary actions (4):** Upload bill, match supplier, approve, schedule payment

**Context overlays (3):** Bill capture, match inspector, payment authorization

**AI behavior:** Extracts bills and checks duplicates and policy

**Risk and edge test:** No AI bank-transfer authorization outside explicit mandate

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/fin/bills loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Inbox and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload bill” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Bill capture” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No AI bank-transfer authorization outside explicit mandate; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-007 — Expenses

**Route:** `/o/:org/fin/expenses` | **Archetype:** `table`

**Layout/content:** Receipts; claimant; amount; category; tax; approval; policy.

**Tabs (4):** My expenses, Team review, Approved, Reimbursed

**Primary actions (4):** Upload receipt, assign category, approve, reimburse

**Context overlays (3):** Receipt capture, expense detail, approval chain

**AI behavior:** Suggests categorization and anomalies with evidence

**Risk and edge test:** Personal expense visibility and reimbursement limits enforced

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/fin/expenses loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between My expenses and Reimbursed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload receipt” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Receipt capture” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Personal expense visibility and reimbursement limits enforced; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-008 — Banking & Feeds

**Route:** `/o/:org/fin/banking` | **Archetype:** `table`

**Layout/content:** Connected accounts; transaction feeds; import jobs; running balances.

**Tabs (4):** Accounts, Transactions, Imports, Feed health

**Primary actions (4):** Connect account, import statement, inspect mismatch, reconcile

**Context overlays (3):** Bank connection, CSV mapper, feed incident

**AI behavior:** Suggests transaction matching without silently posting

**Risk and edge test:** Feed disconnect does not silently mark transactions reconciled

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/fin/banking loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Accounts and Feed health shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Connect account” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Bank connection” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Feed disconnect does not silently mark transactions reconciled; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-009 — Bank Reconciliation

**Route:** `/o/:org/fin/reconciliation` | **Archetype:** `editor`

**Layout/content:** Statement lines; ledger matches; unmatched items; balance difference.

**Tabs (4):** To reconcile, Matched, Exceptions, History

**Primary actions (4):** Match, split, create adjustment, confirm statement

**Context overlays (3):** Match candidates, adjustment review, reconciliation approval

**AI behavior:** Ranks matches with confidence and explains rationale

**Risk and edge test:** Final reconciliation requires zero unexplained discrepancy

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/fin/reconciliation loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between To reconcile and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Match” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Match candidates” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Final reconciliation requires zero unexplained discrepancy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-010 — Budgets & Forecasts

**Route:** `/o/:org/fin/budgets` | **Archetype:** `report`

**Layout/content:** Department budgets; actuals; variance; cash projections; scenarios.

**Tabs (4):** Budgets, Forecasts, Scenarios, Approval

**Primary actions (3):** Edit assumptions, compare scenarios, submit budget

**Context overlays (3):** Model assumptions, revision history, budget approval

**AI behavior:** Creates transparent forecasts with source definitions

**Risk and edge test:** Forecast estimates explicitly separate from posted actuals

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/fin/budgets loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Budgets and Approval shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit assumptions” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Model assumptions” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Forecast estimates explicitly separate from posted actuals; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-011 — Tax & Compliance

**Route:** `/o/:org/fin/tax` | **Archetype:** `admin`

**Layout/content:** Tax codes; VAT periods; calculated liability; jurisdiction rules; filing history.

**Tabs (4):** Codes, Periods, Returns, Audit

**Primary actions (4):** Prepare return, validate, review filing, export

**Context overlays (3):** Tax configuration, return review, filing authorization

**AI behavior:** Flags missing tax data and inconsistent codes

**Risk and edge test:** No unsupported claim of HMRC/compliance certification or legal advice

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/fin/tax loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Codes and Audit shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Prepare return” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Tax configuration” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No unsupported claim of HMRC/compliance certification or legal advice; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-012 — Financial Reports

**Route:** `/o/:org/fin/reports` | **Archetype:** `report`

**Layout/content:** P&L; balance sheet; cash flow; trial balance; receivables aging.

**Tabs (4):** Statements, Management, Custom, Scheduled

**Primary actions (5):** Build report, filter, drill down, export, schedule

**Context overlays (3):** Report designer, source note, schedule

**AI behavior:** Narrates reconciled figures and notable variance

**Risk and edge test:** Unposted data is not silently blended into audited statement

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/fin/reports loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Statements and Scheduled shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build report” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Report designer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unposted data is not silently blended into audited statement; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-FIN-013 — Multi-Entity Finance

**Route:** `/o/:org/fin/entities` | **Archetype:** `admin`

**Layout/content:** Legal entities; intercompany accounts; currencies; consolidations.

**Tabs (4):** Entities, Intercompany, Consolidation, FX

**Primary actions (3):** Create consolidation, eliminate intercompany, inspect postings

**Context overlays (3):** Entity config, consolidation preview, FX sources

**AI behavior:** Analyzes group results and reconciliation problems

**Risk and edge test:** Consolidation avoids double counting and preserves entity boundaries

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/fin/entities loads only scoped ledgeraccount data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Entities and FX shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create consolidation” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Entity config” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Consolidation avoids double counting and preserves entity boundaries; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### CRM — CRM & Sales

**Purpose:** Unified customer relationships, opportunities, quotes, sales activity, lifecycle management and forecasting.

**Human/AI users:** Sales lead; salesperson; account manager; CEO; AI Sales Director

**Entities:** Contact; Company; Lead; Opportunity; Quote; Contract; Activity

**Competitor benchmarking:** HubSpot; Salesforce; Pipedrive

**Screen count:** 11

#### ARL-CRM-001 — CRM Overview

**Route:** `/o/:org/crm/home` | **Archetype:** `dashboard`

**Layout/content:** Pipeline; stage conversions; upcoming tasks; win/loss; activity; opportunities.

**Tabs (4):** Overview, My pipeline, Team, Forecast

**Primary actions (4):** Open deal, assign follow-up, ask Sales, inspect conversion

**Context overlays (3):** Metric drilldown, new lead, insight card

**AI behavior:** Identifies neglected deals with evidence

**Risk and edge test:** Revenue forecasts labeled as predictions not settled revenue

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/crm/home loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Forecast shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open deal” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric drilldown” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Revenue forecasts labeled as predictions not settled revenue; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-002 — Contacts

**Route:** `/o/:org/crm/contacts` | **Archetype:** `table`

**Layout/content:** People; organization; owner; consent; segments; touch history.

**Tabs (4):** All, My contacts, Segments, Duplicates

**Primary actions (5):** Create, merge reviewed, tag, export, open

**Context overlays (3):** Contact form, merge preview, bulk action confirmation

**AI behavior:** Suggests segmentation with provenance

**Risk and edge test:** Email consent and suppression flags survive deduplication

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/crm/contacts loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Duplicates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Contact form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Email consent and suppression flags survive deduplication; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-003 — Contact Profile

**Route:** `/o/:org/crm/contacts/:id` | **Archetype:** `record`

**Layout/content:** Identity; organization; communication; deals; documents; tickets.

**Tabs (5):** Overview, Timeline, Deals, Service, Files

**Primary actions (4):** Message, add note, schedule, attach record

**Context overlays (3):** Compose message, activity composer, customer merge

**AI behavior:** Summarizes relationship with source links

**Risk and edge test:** Restricted customer notes not shown across unrelated departments

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/crm/contacts/:id loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Files shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Message” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Compose message” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Restricted customer notes not shown across unrelated departments; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-004 — Companies

**Route:** `/o/:org/crm/companies` | **Archetype:** `table`

**Layout/content:** Accounts; industry; locations; contacts; opportunity value; assigned owner.

**Tabs (4):** All, Active, Prospects, Archived

**Primary actions (4):** Create account, link contact, search, export

**Context overlays (3):** Account editor, relationship inspector, merge preview

**AI behavior:** Researches accounts from approved/public sources

**Risk and edge test:** Company merge must preserve all source IDs and conflicts

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/crm/companies loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create account” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Account editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Company merge must preserve all source IDs and conflicts; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-005 — Leads & Qualification

**Route:** `/o/:org/crm/leads` | **Archetype:** `board`

**Layout/content:** Incoming leads; sources; score; stage; owner; next actions.

**Tabs (4):** Inbox, Qualified, Disqualified, Rules

**Primary actions (4):** Assign lead, qualify, convert, bulk route

**Context overlays (3):** Qualification inspector, convert dialog, routing rules

**AI behavior:** Scores with transparent factors and potential bias review

**Risk and edge test:** Lead routing respects owner availability and consent

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/crm/leads loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Inbox and Rules shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign lead” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Qualification inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Lead routing respects owner availability and consent; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-006 — Deals Pipeline

**Route:** `/o/:org/crm/deals` | **Archetype:** `board`

**Layout/content:** Stages; drag cards; stage values; probability; deadlines; owners.

**Tabs (4):** Board, List, Forecast, Team

**Primary actions (4):** Move stage, update amount, assign owner, create quote

**Context overlays (3):** Deal drawer, stage change validation, lost reason

**AI behavior:** Recommends next best action based on records

**Risk and edge test:** Stage automation requires validation and cannot auto-close restricted deals

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/crm/deals loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Board and Team shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Move stage” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Deal drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Stage automation requires validation and cannot auto-close restricted deals; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-007 — Deal Detail

**Route:** `/o/:org/crm/deals/:id` | **Archetype:** `record`

**Layout/content:** Timeline; contacts; products; activities; proposal; contract; probability.

**Tabs (5):** Overview, Activity, Products, Documents, Team

**Primary actions (4):** Update stage, create proposal, request approval, close

**Context overlays (3):** Quote builder, collaborator picker, closure confirmation

**AI behavior:** Prepares deal brief and coordinates Finance and Operations

**Risk and edge test:** Deal loss or win writes auditable state and downstream events

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/crm/deals/:id loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Team shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Update stage” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Quote builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Deal loss or win writes auditable state and downstream events; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-008 — Quotes & Proposals

**Route:** `/o/:org/crm/quotes` | **Archetype:** `directory`

**Layout/content:** Document versions; pricing; discounts; approval; expiry; recipient.

**Tabs (5):** Draft, Review, Sent, Accepted, Expired

**Primary actions (5):** Create, duplicate, edit, approve, send

**Context overlays (3):** Quote editor, pricing policy, send preview

**AI behavior:** Creates on-brand proposals from approved pricing

**Risk and edge test:** Expired pricing cannot be sent as currently valid

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/crm/quotes loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Draft and Expired shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Quote editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Expired pricing cannot be sent as currently valid; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-009 — Activities & Scheduling

**Route:** `/o/:org/crm/activities` | **Archetype:** `calendar`

**Layout/content:** Calls; tasks; meetings; emails; reminders; owners.

**Tabs (4):** My calendar, All activity, Follow-ups, History

**Primary actions (4):** Log call, schedule meeting, add reminder, complete task

**Context overlays (3):** Activity entry, calendar conflict, meeting composer

**AI behavior:** Suggests follow-ups and drafts communications

**Risk and edge test:** Meeting invite not claimed sent until provider or native calendar confirms

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/crm/activities loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between My calendar and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Log call” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Activity entry” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Meeting invite not claimed sent until provider or native calendar confirms; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-010 — Sales Forecasts

**Route:** `/o/:org/crm/forecasts` | **Archetype:** `report`

**Layout/content:** Pipeline-weighted value; categories; historical accuracy; team rollups.

**Tabs (4):** Current, Scenarios, History, Methodology

**Primary actions (4):** Adjust assumptions, drill down, export, review

**Context overlays (3):** Forecast model, confidence explanation, override reason

**AI behavior:** Explains scenarios without claiming predictive certainty

**Risk and edge test:** Double counting multi-product opportunities prevented

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/crm/forecasts loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Current and Methodology shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust assumptions” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Forecast model” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Double counting multi-product opportunities prevented; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CRM-011 — Sales Automation

**Route:** `/o/:org/crm/automation` | **Archetype:** `builder`

**Layout/content:** Lead capture; routing; follow-up; deal triggers; quality checks.

**Tabs (4):** Workflows, Templates, Runs, Failures

**Primary actions (4):** Create rule, simulate, activate, stop

**Context overlays (3):** Workflow designer, test data, activation approval

**AI behavior:** Generates workflows using native CRM actions

**Risk and edge test:** No automated outreach to suppressed/unconsenting contacts

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/crm/automation loads only scoped contact data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Workflows and Failures shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create rule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Workflow designer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No automated outreach to suppressed/unconsenting contacts; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### HR — People, HR & Payroll

**Purpose:** Human workforce lifecycle, recruitment, self-service, policy, schedules, learning and payroll operations with distinct AI staff administration.

**Human/AI users:** HR manager; hiring lead; employee; payroll admin; executive

**Entities:** Employee; Applicant; LeaveRequest; Shift; PayrollRun; Policy; TrainingRecord

**Competitor benchmarking:** Rippling; BambooHR; Gusto

**Screen count:** 11

#### ARL-HR-001 — People Overview

**Route:** `/o/:org/hr/home` | **Archetype:** `dashboard`

**Layout/content:** Headcount; leave; onboarding; open hiring; reviews; compliance reminders.

**Tabs (4):** Overview, My team, HR tasks, Trends

**Primary actions (4):** View employee, approve request, start hire, inspect metric

**Context overlays (3):** Staffing alert, leave approval, new position

**AI behavior:** Suggests workload and training insights from authorized records

**Risk and edge test:** Sensitive HR metrics aggregated by privacy policy

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/hr/home loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Trends shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “View employee” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Staffing alert” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive HR metrics aggregated by privacy policy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-002 — Employee Directory

**Route:** `/o/:org/hr/employees` | **Archetype:** `directory`

**Layout/content:** Names; roles; department; manager; office; employment status.

**Tabs (4):** People, Teams, Contractors, Alumni

**Primary actions (4):** Search, invite, filter, open profile

**Context overlays (3):** Invite employee, directory card, export permissions

**AI behavior:** Matches permitted skills to work

**Risk and edge test:** Personal contact details protected against broad AI retrieval

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/hr/employees loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between People and Alumni shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Search” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Invite employee” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Personal contact details protected against broad AI retrieval; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-003 — Employee Profile

**Route:** `/o/:org/hr/employees/:id` | **Archetype:** `record`

**Layout/content:** Job details; contact; contracts; access; leave; training; review.

**Tabs (6):** Overview, Job, Documents, Leave, Performance, Access

**Primary actions (4):** Update profile, request change, upload document, offboard

**Context overlays (3):** Contract upload, access request, offboarding confirmation

**AI behavior:** Prepares onboarding and training tasks without disclosing HR data

**Risk and edge test:** Terminated employee access revoked and queued grants rescinded

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/hr/employees/:id loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Access shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Update profile” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Contract upload” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Terminated employee access revoked and queued grants rescinded; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-004 — Recruitment Pipeline

**Route:** `/o/:org/hr/recruitment` | **Archetype:** `board`

**Layout/content:** Open positions; applications; interviews; stages; scorecards.

**Tabs (4):** Positions, Candidates, Interviews, Offers

**Primary actions (4):** Create role, review applicant, schedule, issue offer

**Context overlays (3):** Job spec editor, candidate profile, offer approval

**AI behavior:** Drafts role descriptions and summarizes qualifications

**Risk and edge test:** Hiring decisions reserved for accountable humans with bias controls

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/hr/recruitment loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Positions and Offers shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create role” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Job spec editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Hiring decisions reserved for accountable humans with bias controls; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-005 — Applicant Profile

**Route:** `/o/:org/hr/candidates/:id` | **Archetype:** `record`

**Layout/content:** Resume; applications; consent; interview notes; evaluation.

**Tabs (4):** Overview, Documents, Interviews, Decisions

**Primary actions (4):** Review, message, schedule, record assessment

**Context overlays (3):** Applicant communications, interviewer scorecard, rejection preview

**AI behavior:** Summarizes only job-relevant evidence under policy

**Risk and edge test:** Retention/consent controls on applicant data

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/hr/candidates/:id loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Decisions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Applicant communications” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Retention/consent controls on applicant data; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-006 — Onboarding Centre

**Route:** `/o/:org/hr/onboarding` | **Archetype:** `board`

**Layout/content:** New hires; tasks; access requests; documents; mentors; training.

**Tabs (4):** Incoming, In progress, Waiting, Completed

**Primary actions (4):** Launch checklist, assign mentor, grant request, verify completion

**Context overlays (3):** Onboarding template, IT access, welcome preview

**AI behavior:** Coordinates HR, IT, Finance, department manager

**Risk and edge test:** Access grant never silently inferred from employment status

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/hr/onboarding loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Incoming and Completed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Launch checklist” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Onboarding template” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Access grant never silently inferred from employment status; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-007 — Leave & Absence

**Route:** `/o/:org/hr/leave` | **Archetype:** `calendar`

**Layout/content:** Leave balances; calendar; requests; approvals; policies.

**Tabs (4):** My leave, Team calendar, Approvals, Policy

**Primary actions (4):** Request leave, approve, decline, adjust balance

**Context overlays (3):** Leave form, policy explanation, conflict review

**AI behavior:** Finds coverage risks and suggests schedules

**Risk and edge test:** No private health details exposed in team calendars

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/hr/leave loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between My leave and Policy shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Request leave” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Leave form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No private health details exposed in team calendars; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-008 — Scheduling & Time

**Route:** `/o/:org/hr/scheduling` | **Archetype:** `calendar`

**Layout/content:** Shift roster; attendance; time logs; coverage; overtime.

**Tabs (4):** Roster, Timesheets, Availability, Exceptions

**Primary actions (4):** Drag shift, approve hours, swap, export

**Context overlays (3):** Shift edit, time correction, overtime approval

**AI behavior:** Optimizes coverage within labor and policy constraints

**Risk and edge test:** Time zone and employment rule checks on cross-location shift

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/hr/scheduling loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Roster and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag shift” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Shift edit” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Time zone and employment rule checks on cross-location shift; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-009 — Payroll

**Route:** `/o/:org/hr/payroll` | **Archetype:** `table`

**Layout/content:** Payroll runs; employee inputs; deductions; pay slips; bank file status.

**Tabs (4):** Runs, Inputs, Approvals, Payslips

**Primary actions (5):** Prepare run, validate, approve, export, reconcile

**Context overlays (3):** Payroll review, exception report, submission signoff

**AI behavior:** Flags anomalies; prepares reports; never unapproved payroll payments

**Risk and edge test:** Jurisdiction-specific compliance cannot be assumed without validation

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/hr/payroll loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Runs and Payslips shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Prepare run” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Payroll review” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Jurisdiction-specific compliance cannot be assumed without validation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-010 — Performance Reviews

**Route:** `/o/:org/hr/performance` | **Archetype:** `report`

**Layout/content:** Review cycles; goals; feedback; competencies; plans.

**Tabs (4):** Cycles, My reviews, Team, Templates

**Primary actions (4):** Create review, assign reviewer, submit, acknowledge

**Context overlays (3):** Review form, calibration panel, confidentiality control

**AI behavior:** Summarizes evidence without making autonomous personnel decisions

**Risk and edge test:** AI-generated ratings flagged and human review required

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/hr/performance loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Cycles and Templates shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create review” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Review form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI-generated ratings flagged and human review required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-HR-011 — Learning & Policies

**Route:** `/o/:org/hr/learning` | **Archetype:** `directory`

**Layout/content:** Courses; certifications; policy library; acknowledgments; completions.

**Tabs (4):** Courses, Policies, Compliance, My learning

**Primary actions (3):** Assign course, complete module, acknowledge policy

**Context overlays (3):** Course builder, quiz, policy publication

**AI behavior:** Produces learning aids from approved policy documents

**Risk and edge test:** Policy edits versioned, existing acknowledgments preserved

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/hr/learning loads only scoped employee data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Courses and My learning shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign course” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Course builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Policy edits versioned, existing acknowledgments preserved; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### PROJECT — Projects, Portfolios & Work

**Purpose:** Human and AI project planning, ownership, capacity, schedules, approvals and cross-team delivery.

**Human/AI users:** PMO; project owner; team member; AI project manager

**Entities:** Portfolio; Project; Task; Dependency; Milestone; Resource; Timesheet

**Competitor benchmarking:** Linear; Asana; ClickUp; Monday.com

**Screen count:** 10

#### ARL-PROJECT-001 — Project Portfolio

**Route:** `/o/:org/project/portfolios` | **Archetype:** `dashboard`

**Layout/content:** Programs; project health; budgets; risk; cross-team capacity.

**Tabs (4):** Overview, Departments, Timeline, Risks

**Primary actions (4):** Create project, filter, inspect health, portfolio report

**Context overlays (3):** Portfolio filter, initiative detail, priority change

**AI behavior:** Explains delivery risks and dependencies

**Risk and edge test:** Rollups never count duplicated linked tasks twice

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/project/portfolios loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Risks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create project” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Portfolio filter” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Rollups never count duplicated linked tasks twice; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-002 — Project Directory

**Route:** `/o/:org/project/projects` | **Archetype:** `directory`

**Layout/content:** All projects; owner; progress; status; latest activity; priority.

**Tabs (4):** All, Mine, Following, Archived

**Primary actions (5):** Create, pin, search, duplicate, archive

**Context overlays (3):** Project template, archive impact, quick detail

**AI behavior:** Suggests project structure from goal brief

**Risk and edge test:** Archived project retained in linked audit and mission histories

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/project/projects loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Project template” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Archived project retained in linked audit and mission histories; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-003 — Project Overview

**Route:** `/o/:org/project/projects/:id` | **Archetype:** `dashboard`

**Layout/content:** Summary; milestones; team; files; budget; decisions.

**Tabs (6):** Overview, Tasks, Timeline, Files, Activity, Metrics

**Primary actions (4):** Change status, assign owner, request update, attach file

**Context overlays (3):** Milestone editor, project settings, status note

**AI behavior:** Summarizes verified progress and missing blockers

**Risk and edge test:** Paused project stops configured automation, not unrelated tasks

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/project/projects/:id loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Metrics shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Change status” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Milestone editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Paused project stops configured automation, not unrelated tasks; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-004 — Task Board

**Route:** `/o/:org/project/projects/:id/board` | **Archetype:** `board`

**Layout/content:** Stages; cards; priorities; assignees; due dates; labels.

**Tabs (4):** Board, List, By owner, By sprint

**Primary actions (5):** Drag task, create, assign, bulk move, filter

**Context overlays (3):** Task drawer, stage rule, batch action review

**AI behavior:** Automates routine task suggestions within policy

**Risk and edge test:** Stage move cannot bypass review or produce unknown side effects

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/project/projects/:id/board loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Board and By sprint shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag task” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Task drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Stage move cannot bypass review or produce unknown side effects; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-005 — Task Detail

**Route:** `/o/:org/project/tasks/:id` | **Archetype:** `record`

**Layout/content:** Description; checklist; owner; status; comments; files; dependencies.

**Tabs (4):** Details, Discussion, Subtasks, History

**Primary actions (5):** Edit, comment, link, delegate AI, complete

**Context overlays (3):** Assignee picker, dependency selector, completion check

**AI behavior:** Produces requested deliverables and evidence of completion

**Risk and edge test:** Changing owner preserves attribution and source links

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/project/tasks/:id loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Details and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Assignee picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Changing owner preserves attribution and source links; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-006 — Timeline & Dependencies

**Route:** `/o/:org/project/projects/:id/timeline` | **Archetype:** `timeline`

**Layout/content:** Gantt-style bars; milestones; dependencies; baseline; delay indicators.

**Tabs (4):** Timeline, Critical path, Baseline, Risks

**Primary actions (4):** Reschedule, drag duration, link task, compare baseline

**Context overlays (3):** Date edit, conflict review, dependency graph

**AI behavior:** Suggests feasible scheduling changes using workload

**Risk and edge test:** Cycles or impossible dependency dates block publication

**Archetype design contract:** Chronological planning / execution view | Time scale, dependencies, state, event evidence and navigation. | Chronological vertical list on mobile.

**Screen acceptance gates:**

- Route /o/:org/project/projects/:id/timeline loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Timeline and Risks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reschedule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Date edit” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cycles or impossible dependency dates block publication; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-007 — Resource Workload

**Route:** `/o/:org/project/workload` | **Archetype:** `report`

**Layout/content:** Team capacity; assignment distribution; hours; AI concurrency; conflicts.

**Tabs (4):** People, AI, Departments, Calendar

**Primary actions (3):** Reassign, adjust estimates, view capacity

**Context overlays (3):** Workload detail, allocation editor, over-capacity alert

**AI behavior:** Recommends balancing with policy and availability

**Risk and edge test:** Human absence and AI throughput modeled differently

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/project/workload loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between People and Calendar shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reassign” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Workload detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Human absence and AI throughput modeled differently; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-008 — Project Templates

**Route:** `/o/:org/project/templates` | **Archetype:** `directory`

**Layout/content:** Reusable phases; tasks; roles; approvals; workflow links.

**Tabs (3):** Company, Industry, Personal

**Primary actions (4):** Create, apply, duplicate, publish

**Context overlays (3):** Template editor, preview, revision confirm

**AI behavior:** Drafts template based on successful projects

**Risk and edge test:** Cloned project does not inherit confidential prior attachments

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/project/templates loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Company and Personal shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Template editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cloned project does not inherit confidential prior attachments; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-009 — Goals & OKRs

**Route:** `/o/:org/project/goals` | **Archetype:** `report`

**Layout/content:** Objective metrics; key results; owners; linked projects; check-ins.

**Tabs (4):** Company, Team, Personal, Check-ins

**Primary actions (3):** Set target, report progress, link project

**Context overlays (3):** Metric source, check-in dialog, goal revision

**AI behavior:** Writes evidence-backed progress notes

**Risk and edge test:** Avoid subjective automated performance evaluation

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/project/goals loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Company and Check-ins shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set target” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric source” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Avoid subjective automated performance evaluation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROJECT-010 — Time & Cost

**Route:** `/o/:org/project/time` | **Archetype:** `table`

**Layout/content:** Timesheets; billable status; cost estimates; budget usage.

**Tabs (4):** My time, Team, Costs, Approvals

**Primary actions (4):** Log time, approve, edit, export

**Context overlays (3):** Timer, timesheet correction, billing link

**AI behavior:** Flags missing time and budget overrun risks

**Risk and edge test:** AI computation spend is not represented as employee billable hours

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/project/time loads only scoped portfolio data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between My time and Approvals shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Log time” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Timer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI computation spend is not represented as employee billable hours; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### COMMS — Communications, Email, Calendar & Meetings

**Purpose:** Unified internal communications and customer-facing communication channels with secure identity and appropriate provider infrastructure.

**Human/AI users:** All members; communications administrator; service agents; meeting host

**Entities:** Channel; Message; EmailThread; Meeting; CalendarEvent; Call; Attachment

**Competitor benchmarking:** Slack; Microsoft Teams; Google Workspace

**Screen count:** 11

#### ARL-COMMS-001 — Communications Home

**Route:** `/o/:org/comms/home` | **Archetype:** `dashboard`

**Layout/content:** Unread channels; mentions; meetings; priority conversations; announcements.

**Tabs (5):** Overview, Channels, DMs, Calls, Calendar

**Primary actions (4):** Join meeting, reply, browse, ask summary

**Context overlays (3):** Compose, quick switcher, notification preferences

**AI behavior:** Summarizes permitted unread discussion

**Risk and edge test:** Restricted channels not included in AI summaries

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/comms/home loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Calendar shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Join meeting” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Compose” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Restricted channels not included in AI summaries; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-002 — Channels

**Route:** `/o/:org/comms/channels` | **Archetype:** `directory`

**Layout/content:** Team and project channels; membership; unread counts; pinned topics.

**Tabs (4):** All, My channels, Departments, Archived

**Primary actions (4):** Create channel, join, mute, search

**Context overlays (3):** Channel creation, member management, channel archive

**AI behavior:** Suggests topical channels for mission teams

**Risk and edge test:** Private channel messages never leak to wider company search

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/comms/channels loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create channel” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Channel creation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Private channel messages never leak to wider company search; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-003 — Channel Conversation

**Route:** `/o/:org/comms/channels/:id` | **Archetype:** `chat`

**Layout/content:** Threaded messages; reactions; files; presence; pinned decisions.

**Tabs (4):** Conversation, Files, Pinned, Tasks

**Primary actions (5):** Reply, thread, mention, pin, create task

**Context overlays (3):** Thread drawer, file preview, moderation report

**AI behavior:** AI specialist responds when tagged and authorized

**Risk and edge test:** Mention does not grant tool or file access

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/comms/channels/:id loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Conversation and Tasks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Thread drawer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Mention does not grant tool or file access; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-004 — Direct Messages

**Route:** `/o/:org/comms/messages` | **Archetype:** `chat`

**Layout/content:** Conversation list; participant identity; typing; file sharing; draft.

**Tabs (4):** Recent, Unread, Groups, Archived

**Primary actions (5):** Send, attach, audio message, call, search

**Context overlays (3):** Conversation info, add member, message actions

**AI behavior:** Drafts replies and summarizes authorized thread

**Risk and edge test:** Differentiate AI and human sender unmistakably

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/comms/messages loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Send” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Conversation info” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Differentiate AI and human sender unmistakably; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-005 — Email Inbox

**Route:** `/o/:org/comms/email` | **Archetype:** `table`

**Layout/content:** Mailboxes; folders; threads; sender; attachment; unread; risk.

**Tabs (5):** Inbox, Sent, Drafts, Archive, Spam

**Primary actions (5):** Compose, reply, forward, label, archive

**Context overlays (3):** Compose window, send confirmation, rule editor

**AI behavior:** Drafts messages, identifies follow-ups, labels source text untrusted

**Risk and edge test:** Send requires recipient confirmation for sensitive or bulk cases

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/comms/email loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Inbox and Spam shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compose” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Compose window” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Send requires recipient confirmation for sensitive or bulk cases; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-006 — Email Thread

**Route:** `/o/:org/comms/email/:id` | **Archetype:** `record`

**Layout/content:** Message history; participants; thread context; attachments; CRM links.

**Tabs (3):** Messages, Related records, Activity

**Primary actions (5):** Reply, add CC, attach, turn into task, block sender

**Context overlays (3):** Reply editor, contact inspector, report phishing

**AI behavior:** Summarizes thread and proposes answers with factual grounding

**Risk and edge test:** External email instructions cannot override agent policies

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/comms/email/:id loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Messages and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Reply editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: External email instructions cannot override agent policies; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-007 — Calendar

**Route:** `/o/:org/comms/calendar` | **Archetype:** `calendar`

**Layout/content:** My/team calendars; meetings; availability; rooms; time zones.

**Tabs (5):** Day, Week, Month, Agenda, Team

**Primary actions (5):** Create event, invite, move, reschedule, find time

**Context overlays (3):** Event editor, conflict inspector, attendee status

**AI behavior:** Coordinates permitted schedules and prepares agendas

**Risk and edge test:** Provider invite status not assumed accepted

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/comms/calendar loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Day and Team shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create event” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Event editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider invite status not assumed accepted; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-008 — Meeting Room

**Route:** `/o/:org/comms/meetings/:id` | **Archetype:** `media`

**Layout/content:** Participants; AV controls; chat; shared file; transcript; consent.

**Tabs (4):** Call, Chat, Notes, Participants

**Primary actions (5):** Mute, share, raise hand, record consent, end

**Context overlays (3):** Device permissions, invite, recording consent

**AI behavior:** Summarizes meeting and proposes tasks after consent

**Risk and edge test:** Recording law and participant permission enforced

**Archetype design contract:** Live audio/video control workspace | Media preview, timeline/transcript, accessible controls and consent. | Essential transport controls visible; auxiliary views behind tabs.

**Screen acceptance gates:**

- Route /o/:org/comms/meetings/:id loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Call and Participants shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Mute” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Device permissions” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Recording law and participant permission enforced; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-009 — Calls & Voicemail

**Route:** `/o/:org/comms/calls` | **Archetype:** `table`

**Layout/content:** Call log; contacts; recordings if permitted; voicemail; follow-ups.

**Tabs (4):** Recent, Missed, Voicemail, Queues

**Primary actions (4):** Call, return call, attach CRM, play voicemail

**Context overlays (3):** Dialer, recording notice, call transcript

**AI behavior:** Prepares call summary and suggested follow-up

**Risk and edge test:** Emergency calling capabilities never implied unless provided

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/comms/calls loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Recent and Queues shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Call” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Dialer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Emergency calling capabilities never implied unless provided; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-010 — Announcements

**Route:** `/o/:org/comms/announcements` | **Archetype:** `directory`

**Layout/content:** Company posts; targeting; acknowledgments; scheduled updates.

**Tabs (4):** All, Draft, Scheduled, Published

**Primary actions (4):** Draft, target audience, preview, publish

**Context overlays (3):** Audience selector, post preview, publish review

**AI behavior:** Drafts company announcement in approved tone

**Risk and edge test:** Large distribution and sensitive communications require review

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/comms/announcements loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Published shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Draft” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Audience selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Large distribution and sensitive communications require review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMS-011 — Communication Preferences

**Route:** `/o/:org/comms/preferences` | **Archetype:** `settings`

**Layout/content:** Mail identities; signature; working hours; presence; notification controls.

**Tabs (4):** Identity, Availability, Notifications, Privacy

**Primary actions (3):** Edit signature, set schedule, connect mailbox

**Context overlays (3):** Signature editor, account setup, privacy warning

**AI behavior:** Suggests preferences without modifying without consent

**Risk and edge test:** Cross-user settings protected by role

**Archetype design contract:** Preference-oriented form | Categories, field-level explanations, immediate and deferred save states. | Single column with persistent category search.

**Screen acceptance gates:**

- Route /o/:org/comms/preferences loads only scoped channel data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Identity and Privacy shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit signature” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Signature editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cross-user settings protected by role; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### CARE — Customer Care & Service

**Purpose:** Omnichannel case management, support inbox, knowledge-guided responses, service metrics and verified human-AI handoff.

**Human/AI users:** Support lead; service agent; account owner; AI Customer Care

**Entities:** Ticket; Customer; Conversation; SLA; Macro; SupportKnowledge

**Competitor benchmarking:** Intercom; Zendesk; Freshdesk

**Screen count:** 9

#### ARL-CARE-001 — Service Overview

**Route:** `/o/:org/care/home` | **Archetype:** `dashboard`

**Layout/content:** Open volume; queue load; SLA risk; customer sentiment; AI handoffs.

**Tabs (4):** Overview, Queues, Quality, Trends

**Primary actions (4):** Open case, reassign, inspect metric, manage staffing

**Context overlays (3):** Queue rules, SLA inspector, service report

**AI behavior:** Forecasts backlog with data limitations

**Risk and edge test:** Sentiment inference not treated as certain customer fact

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/care/home loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Trends shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Open case” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Queue rules” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sentiment inference not treated as certain customer fact; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-002 — Omnichannel Inbox

**Route:** `/o/:org/care/inbox` | **Archetype:** `chat`

**Layout/content:** Conversation list; current thread; customer context; status; assignment.

**Tabs (5):** Unassigned, Mine, Team, Waiting, Closed

**Primary actions (5):** Respond, assign, tag, escalate, link record

**Context overlays (3):** Customer inspector, canned reply, escalation

**AI behavior:** Drafts responses from approved knowledge and actions

**Risk and edge test:** No silent automated disclosure of sensitive customer information

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/care/inbox loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Unassigned and Closed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Respond” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Customer inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No silent automated disclosure of sensitive customer information; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-003 — Ticket List

**Route:** `/o/:org/care/tickets` | **Archetype:** `table`

**Layout/content:** Case number; type; priority; owner; SLA; channel; status.

**Tabs (5):** All, Open, Pending, Resolved, Archived

**Primary actions (4):** Create ticket, bulk route, filter, export

**Context overlays (3):** Ticket create, bulk assignment, priority change

**AI behavior:** Classifies issues and proposes routing

**Risk and edge test:** Bulk close requires preview, appropriate permissions

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/care/tickets loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create ticket” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Ticket create” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Bulk close requires preview, appropriate permissions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-004 — Ticket Detail

**Route:** `/o/:org/care/tickets/:id` | **Archetype:** `record`

**Layout/content:** Issue; activity; customers; related order; attachments; resolution.

**Tabs (5):** Overview, Conversation, Tasks, History, Audit

**Primary actions (4):** Reply, add note, reopen, assign specialist

**Context overlays (3):** Response composer, internal note, refund request

**AI behavior:** Creates grounded resolution proposal and verifies permitted follow-up

**Risk and edge test:** Reopening must preserve prior resolution and audit data

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/care/tickets/:id loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Audit shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Response composer” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Reopening must preserve prior resolution and audit data; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-005 — Customer Context

**Route:** `/o/:org/care/customers/:id` | **Archetype:** `record`

**Layout/content:** CRM profile; order; booking; case history; preferences; consent.

**Tabs (4):** Overview, Cases, Orders, Communications

**Primary actions (3):** Inspect, schedule, update permitted field

**Context overlays (3):** Customer profile edit, consent inspector, identity verification

**AI behavior:** Provides context-limited response support

**Risk and edge test:** Cross-department restricted records redacted

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/care/customers/:id loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Communications shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Inspect” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Customer profile edit” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cross-department restricted records redacted; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-006 — Knowledge Base

**Route:** `/o/:org/care/knowledge` | **Archetype:** `directory`

**Layout/content:** Articles; products; policy; audience; versions; feedback.

**Tabs (4):** Internal, Public, Draft, Retired

**Primary actions (4):** Write article, update, publish, test answer

**Context overlays (3):** Rich editor, publish review, relevance test

**AI behavior:** Suggests revisions based on verified support outcomes

**Risk and edge test:** Old published instructions not silently overwritten

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/care/knowledge loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Internal and Retired shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Write article” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Rich editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Old published instructions not silently overwritten; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-007 — Macros & Automation

**Route:** `/o/:org/care/automation` | **Archetype:** `builder`

**Layout/content:** Templates; channel triggers; routing; escalation; policy.

**Tabs (4):** Macros, Rules, Runs, Exceptions

**Primary actions (4):** Create macro, simulate, activate, review

**Context overlays (3):** Macro editor, audience preview, escalation rule

**AI behavior:** Drafts workflow with tool-specific authorization

**Risk and edge test:** Automated response disabled for prohibited topics

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/care/automation loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Macros and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create macro” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Macro editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Automated response disabled for prohibited topics; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-008 — Service SLAs

**Route:** `/o/:org/care/slas` | **Archetype:** `admin`

**Layout/content:** Priority rules; working hours; breach clock; routing; exceptions.

**Tabs (4):** Policies, Breaches, Exceptions, History

**Primary actions (4):** Edit policy, reassign, report, acknowledge

**Context overlays (3):** SLA form, schedule exception, policy impact

**AI behavior:** Recommends capacity changes using measured load

**Risk and edge test:** Clock handles locale, holiday and suspended intervals

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/care/slas loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Policies and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit policy” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “SLA form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Clock handles locale, holiday and suspended intervals; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-CARE-009 — Quality & Satisfaction

**Route:** `/o/:org/care/quality` | **Archetype:** `report`

**Layout/content:** CSAT; case audits; AI QA; trends; complaint patterns.

**Tabs (4):** Surveys, Audits, Coaching, Reports

**Primary actions (4):** Review, annotate, assign coaching, export

**Context overlays (3):** QA scorecard, survey builder, case replay

**AI behavior:** Flags trends and suggested knowledge changes

**Risk and edge test:** Low scores not used to make unreviewed employment decisions

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/care/quality loads only scoped ticket data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Surveys and Reports shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “QA scorecard” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Low scores not used to make unreviewed employment decisions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### LEGAL — Governance, Legal Operations & Risk

**Purpose:** Policy, contract lifecycle, risk registers, evidence preservation and qualified human review for legal or regulated business matters.

**Human/AI users:** Legal counsel; compliance lead; executive; privacy steward

**Entities:** Contract; Obligation; Policy; Risk; LegalHold; Review

**Competitor benchmarking:** Ironclad; DocuSign CLM; GRC systems

**Screen count:** 7

#### ARL-LEGAL-001 — Governance Overview

**Route:** `/o/:org/legal/home` | **Archetype:** `dashboard`

**Layout/content:** Open obligations; policy reviews; contract deadlines; material risks.

**Tabs (4):** Overview, Obligations, Policies, Risks

**Primary actions (4):** Review item, assign counsel, schedule audit, report

**Context overlays (3):** Obligation quick view, issue create, risk summary

**AI behavior:** Summarizes timelines and evidence, no assertion of legal validity

**Risk and edge test:** Jurisdiction-specific interpretations flagged for legal review

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/legal/home loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Risks shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review item” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Obligation quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Jurisdiction-specific interpretations flagged for legal review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-002 — Contract Library

**Route:** `/o/:org/legal/contracts` | **Archetype:** `table`

**Layout/content:** Counterparty; status; dates; owner; linked deal; versions.

**Tabs (5):** Draft, Review, Active, Expiring, Archived

**Primary actions (4):** Upload, draft, assign review, send for signature

**Context overlays (3):** Contract upload, reviewer picker, e-sign request

**AI behavior:** Extracts clauses and deadlines for review

**Risk and edge test:** Contract rights/obligations not autonomously accepted

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/legal/contracts loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Draft and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Upload” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Contract upload” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Contract rights/obligations not autonomously accepted; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-003 — Contract Detail

**Route:** `/o/:org/legal/contracts/:id` | **Archetype:** `record`

**Layout/content:** Document; parties; clauses; redline; approvals; obligations.

**Tabs (5):** Overview, Clauses, Redline, Signatures, History

**Primary actions (4):** Compare, comment, request review, approve legal step

**Context overlays (3):** Clause inspector, redline diff, sign authorization

**AI behavior:** Flags unusual clauses as hypotheses with citations

**Risk and edge test:** Original signed version immutable

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/legal/contracts/:id loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compare” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Clause inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Original signed version immutable; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-004 — Policy Register

**Route:** `/o/:org/legal/policies` | **Archetype:** `directory`

**Layout/content:** Policy versions; owners; applicability; acknowledgment; renewal.

**Tabs (4):** All, Due review, Draft, Published

**Primary actions (4):** Create, revise, publish, request acknowledgment

**Context overlays (3):** Policy editor, audience, publication impact

**AI behavior:** Finds inconsistencies between approved policies

**Risk and edge test:** Superseded version preserved for historical decisions

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/legal/policies loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Published shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Policy editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Superseded version preserved for historical decisions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-005 — Obligation Calendar

**Route:** `/o/:org/legal/obligations` | **Archetype:** `calendar`

**Layout/content:** Filing deadlines; renewals; attestations; contractual obligations.

**Tabs (4):** Calendar, Owner, Overdue, Completed

**Primary actions (4):** Assign, remind, record evidence, escalate

**Context overlays (3):** Deadline editor, evidence upload, escalation

**AI behavior:** Extracts candidate obligations but needs human verification

**Risk and edge test:** Relative dates converted with explicit timezone/jurisdiction

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/legal/obligations loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Calendar and Completed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assign” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Deadline editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Relative dates converted with explicit timezone/jurisdiction; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-006 — Risk Register

**Route:** `/o/:org/legal/risks` | **Archetype:** `table`

**Layout/content:** Operational; security; privacy; financial; legal risks with mitigation.

**Tabs (4):** All, High, Owned, Closed

**Primary actions (4):** Add, score, mitigate, review

**Context overlays (3):** Risk form, score rationale, control assignment

**AI behavior:** Recommends mitigations from evidence

**Risk and edge test:** AI risk rating not substituted for accountable owner decision

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/legal/risks loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Closed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Risk form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI risk rating not substituted for accountable owner decision; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-LEGAL-007 — Audit & Evidence

**Route:** `/o/:org/legal/evidence` | **Archetype:** `directory`

**Layout/content:** Evidence packs; access; signatures; linked incidents and decisions.

**Tabs (4):** Packs, Requests, Holds, Exports

**Primary actions (4):** Assemble, hash, share, request legal hold

**Context overlays (3):** Evidence detail, legal hold, export permissions

**AI behavior:** Organizes records preserving chain of custody

**Risk and edge test:** Restricted/retained data follows legal hold and export rules

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/legal/evidence loads only scoped contract data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Packs and Exports shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Assemble” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Evidence detail” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Restricted/retained data follows legal hold and export rules; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
