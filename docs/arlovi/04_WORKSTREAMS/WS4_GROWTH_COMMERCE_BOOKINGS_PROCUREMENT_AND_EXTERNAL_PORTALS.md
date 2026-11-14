# WS4 — Growth, Commerce, Bookings, Procurement and External Portals

**Executive lead:** Chief Commercial Applications Officer | **Owned domains:** 5 | **Screens:** 49 | **Tabs:** 211 | **Overlays:** 148 | **Primary actions:** 200

**North star:** A functional native customer/revenue operations experience, from product and marketing to booking, delivery, purchasing and external collaboration.

## Mandatory cross-workstream rules

1. All owned screens, tabs, overlays and actions must be real code with specific in-browser behaviour and accessibility; the full inventory is the scope.

2. Consume canonical app-shell, domain records, design tokens, local policy/event contracts from shared packages. Do not build a disconnected micro-app.

3. For operations requiring server/provider connectivity, build a complete honest UX and type-safe adapter; do not claim success from a local UI click.

4. Support local IndexedDB persistence, cross-application event relationships, refresh and deep-links, undo and meaningful import/export wherever applicable.

5. Each screen must have owner, implementation file, tab/action/overlay tests, accessibility and independent review evidence.

6. All final UI terminology uses Arlovi working brand, with central rename capability. No MVP/prototype/demo banners in product UI.


## Workstream-specific design and engineering obligations

- Marketing: campaign builder, segments from local records, content calendar, creative requests, brand approvals, publishing drafts, channel capability inspector and evidence-aware analytics.
- Commerce: structured product variants, stock, carts, storefront browsing, local checkout intent/order creation, returns, promotions and taxes as local calculations; payment authorization remains unavailable.
- Bookings: resource capacity, conflict detection, staff calendars, appointment services, reservation edits, cancellations, local reminders, connected customer records.
- Procurement: supplier records, PR/PO approvals, warehouse stock movements and inventory valuations with business rule validation, supplier portal interactions in local mode.
- External portals: client access and scoped company information via browser-local role contexts; no false claim of real internet-accessible multi-user security or remote sync.
- Ensure growth campaign, customer enquiries, stock and accounting document workflows use common records and events.


## Owned applications and screen-level contracts


### MARKET — Marketing & Growth

**Purpose:** Full marketing operations across strategy, social content, email, ads, audiences, SEO, attribution and integrated creative.

**Human/AI users:** CMO; marketer; content manager; AI Marketing Director; Creative Director

**Entities:** Campaign; Audience; CreativeAsset; Channel; Attribution; PublishJob

**Competitor benchmarking:** HubSpot; Mailchimp; Buffer; Semrush

**Screen count:** 12

#### ARL-MARKET-001 — Marketing Overview

**Route:** `/o/:org/market/home` | **Archetype:** `dashboard`

**Layout/content:** Campaign KPIs; revenue attribution; spending; leads; upcoming publishing.

**Tabs (4):** Overview, Performance, Calendar, Opportunities

**Primary actions (4):** Create campaign, inspect KPI, ask Marketing, view alerts

**Context overlays (3):** Metric source, campaign wizard, budget inspector

**AI behavior:** Explains channel performance and prepares strategy

**Risk and edge test:** Attribution uncertainty clearly displayed

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/market/home loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Opportunities shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create campaign” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric source” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Attribution uncertainty clearly displayed; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-002 — Campaign Library

**Route:** `/o/:org/market/campaigns` | **Archetype:** `directory`

**Layout/content:** Campaigns; owner; objective; budget; channel; live status.

**Tabs (5):** All, Draft, Approval, Active, Completed

**Primary actions (4):** Create, duplicate, archive, compare

**Context overlays (3):** Campaign template, plan approval, duplicate rules

**AI behavior:** Generates channel plan with company-specific data

**Risk and edge test:** Copy must not duplicate live external spend authorization

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/market/campaigns loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Completed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Campaign template” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Copy must not duplicate live external spend authorization; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-003 — Campaign Detail

**Route:** `/o/:org/market/campaigns/:id` | **Archetype:** `dashboard`

**Layout/content:** Objectives; products; audience; creative; channel calendar; budget.

**Tabs (6):** Overview, Plan, Assets, Channels, Results, Activity

**Primary actions (5):** Edit draft, approve, launch, pause, request review

**Context overlays (3):** Creative preview, launch approval, pause consequence

**AI behavior:** Coordinates AI teams and verified execution

**Risk and edge test:** Stop ad spending only within real provider control limits

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/market/campaigns/:id loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit draft” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Creative preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Stop ad spending only within real provider control limits; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-004 — Content Calendar

**Route:** `/o/:org/market/calendar` | **Archetype:** `calendar`

**Layout/content:** Scheduled posts; channel; asset preview; review status; time zone.

**Tabs (4):** Month, Week, List, By channel

**Primary actions (4):** Drag schedule, preview, edit caption, publish

**Context overlays (3):** Post editor, asset picker, publish preview

**AI behavior:** Drafts posts from approved brand guidelines

**Risk and edge test:** Provider-supported media and API restrictions validated

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/market/calendar loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Month and By channel shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag schedule” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Post editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Provider-supported media and API restrictions validated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-005 — Social Publishing

**Route:** `/o/:org/market/social` | **Archetype:** `table`

**Layout/content:** Accounts; drafts; scheduled items; published URLs; errors.

**Tabs (4):** Drafts, Schedule, Published, Failed

**Primary actions (4):** Connect account, create post, schedule, retry safely

**Context overlays (3):** Account authorization, post composer, delivery receipt

**AI behavior:** Prepares content and verifies provider publication

**Risk and edge test:** Unknown publication state blocks blind duplicate retries

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/market/social loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Drafts and Failed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Connect account” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Account authorization” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown publication state blocks blind duplicate retries; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-006 — Email Campaigns

**Route:** `/o/:org/market/email` | **Archetype:** `editor`

**Layout/content:** Audience; template; segments; content; tests; reporting.

**Tabs (4):** Campaigns, Templates, Audiences, Reports

**Primary actions (4):** Build email, test send, approve recipients, schedule

**Context overlays (3):** Audience preview, send review, suppression check

**AI behavior:** Drafts campaign and personalizations under policy

**Risk and edge test:** Unsubscribe, permission and large-send safeguards required

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/market/email loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Campaigns and Reports shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build email” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Audience preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unsubscribe, permission and large-send safeguards required; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-007 — Audience Segments

**Route:** `/o/:org/market/audiences` | **Archetype:** `table`

**Layout/content:** Profiles; consent; segment rules; membership counts; sync.

**Tabs (4):** Segments, Contacts, Exclusions, Sources

**Primary actions (4):** Build segment, preview, export, set exclusion

**Context overlays (3):** Segment builder, consent inspector, export permission

**AI behavior:** Suggests segmentation and detects anomalies

**Risk and edge test:** No outreach to suppressed or ineligible contacts

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/market/audiences loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Segments and Sources shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build segment” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Segment builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No outreach to suppressed or ineligible contacts; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-008 — Advertising

**Route:** `/o/:org/market/ads` | **Archetype:** `dashboard`

**Layout/content:** Ad account; campaigns; budgets; creative; placements; spend.

**Tabs (5):** Accounts, Campaigns, Creative, Spend, Exceptions

**Primary actions (4):** Build draft, change allocation, pause, reconcile

**Context overlays (3):** Ad preview, spend approval, campaign diagnostics

**AI behavior:** Produces and monitors approved advertising structures

**Risk and edge test:** Asynchronous provider spend needs reserve plus buffer

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/market/ads loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Accounts and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Build draft” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Ad preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Asynchronous provider spend needs reserve plus buffer; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-009 — SEO & Content

**Route:** `/o/:org/market/seo` | **Archetype:** `report`

**Layout/content:** Site audits; keyword opportunities; content briefs; metadata.

**Tabs (4):** Audit, Content, Keywords, Technical

**Primary actions (4):** Run audit, assign issue, edit metadata, publish

**Context overlays (3):** Audit issue, page editor, technical recommendation

**AI behavior:** Creates source-backed SEO proposals and content

**Risk and edge test:** SEO rankings are not promised as deterministic results

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/market/seo loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Audit and Technical shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Run audit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Audit issue” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: SEO rankings are not promised as deterministic results; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-010 — Landing Pages

**Route:** `/o/:org/market/pages` | **Archetype:** `editor`

**Layout/content:** Pages; templates; responsive preview; conversion events; publication.

**Tabs (4):** Library, Builder, Tests, Analytics

**Primary actions (5):** Create, visually edit, test, publish, revert

**Context overlays (3):** Page template, publish confirm, version compare

**AI behavior:** Generates brand-aligned page within site constraints

**Risk and edge test:** Published URLs, redirects, consent and analytics verified

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/market/pages loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Library and Analytics shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Page template” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Published URLs, redirects, consent and analytics verified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-011 — Attribution & Analytics

**Route:** `/o/:org/market/analytics` | **Archetype:** `report`

**Layout/content:** Funnels; cost; revenue; source paths; cohorts; confidence.

**Tabs (5):** Channels, Funnels, Revenue, Cohorts, Models

**Primary actions (4):** Filter, compare, drill down, export

**Context overlays (3):** Attribution model, source inspector, metric notes

**AI behavior:** Explains sources and confounders without causal overclaim

**Risk and edge test:** Ad privacy/consent gaps shown instead of fabricated conversions

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/market/analytics loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Channels and Models shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Attribution model” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Ad privacy/consent gaps shown instead of fabricated conversions; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-MARKET-012 — Marketing Templates

**Route:** `/o/:org/market/templates` | **Archetype:** `directory`

**Layout/content:** Brand-approved emails; posts; ads; campaign plans; landing pages.

**Tabs (4):** All, Saved, Approved, Archived

**Primary actions (4):** Create, fork, review, publish

**Context overlays (3):** Template editor, approval, global update impact

**AI behavior:** Proposes brand-consistent variants

**Risk and edge test:** Template change does not overwrite live published campaign

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/market/templates loads only scoped campaign data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Template editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Template change does not overwrite live published campaign; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### COMMERCE — Commerce, Storefront & Orders

**Purpose:** Native catalogue, inventory, storefront, checkout, orders, fulfilment, returns and promotion management.

**Human/AI users:** Merchant owner; store manager; warehouse staff; AI Commerce Manager

**Entities:** Product; Variant; Inventory; Storefront; Order; Shipment; Return

**Competitor benchmarking:** Shopify; BigCommerce; WooCommerce

**Screen count:** 12

#### ARL-COMMERCE-001 — Commerce Overview

**Route:** `/o/:org/commerce/home` | **Archetype:** `dashboard`

**Layout/content:** Orders; gross/net sales; conversion; stock warnings; fulfilment.

**Tabs (4):** Overview, Sales, Operations, Insights

**Primary actions (4):** Review order, inspect product, create promotion, ask Commerce

**Context overlays (3):** KPI explanation, exception list, store picker

**AI behavior:** Identifies conversion or replenishment opportunities

**Risk and edge test:** Sales and margin metrics reconcile with Finance policy

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/commerce/home loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Insights shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Review order” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “KPI explanation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sales and margin metrics reconcile with Finance policy; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-002 — Products

**Route:** `/o/:org/commerce/products` | **Archetype:** `table`

**Layout/content:** Product cards/list; variants; collection; price; stock; published.

**Tabs (5):** All, Active, Draft, Collections, Archived

**Primary actions (5):** Create, bulk edit, categorize, duplicate, archive

**Context overlays (3):** Product editor, import mapping, bulk preview

**AI behavior:** Writes product copy within brand and policy

**Risk and edge test:** Bulk publish requires preview and stock/price validation

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/commerce/products loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Product editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Bulk publish requires preview and stock/price validation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-003 — Product Detail

**Route:** `/o/:org/commerce/products/:id` | **Archetype:** `record`

**Layout/content:** Media; description; variants; pricing; inventory; SEO; channel status.

**Tabs (6):** Overview, Variants, Media, Pricing, SEO, History

**Primary actions (4):** Edit, add variant, change price, publish

**Context overlays (4):** Variant editor, media picker, margin impact, publish

**AI behavior:** Generates descriptions and recommends merchandising

**Risk and edge test:** Price changes affecting live promotions checked against contract

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/commerce/products/:id loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Edit” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Variant editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Price changes affecting live promotions checked against contract; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-004 — Inventory

**Route:** `/o/:org/commerce/inventory` | **Archetype:** `table`

**Layout/content:** SKU; location; available; reserved; inbound; low-stock alerts.

**Tabs (4):** Stock, Movements, Locations, Replenishment

**Primary actions (5):** Adjust, transfer, receive, count, reorder

**Context overlays (3):** Stock adjustment, transfer approval, count reconciliation

**AI behavior:** Forecasts reorder needs using demand and lead time

**Risk and edge test:** Concurrent order reservations must be atomic

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/commerce/inventory loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Stock and Replenishment shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Stock adjustment” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Concurrent order reservations must be atomic; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-005 — Orders

**Route:** `/o/:org/commerce/orders` | **Archetype:** `table`

**Layout/content:** Order number; buyer; payment; fulfilment; return status; exceptions.

**Tabs (5):** All, Unfulfilled, In transit, Delivered, Returns

**Primary actions (5):** View, filter, bulk fulfil, export, assign

**Context overlays (3):** Order quick view, bulk operation, refund approval

**AI behavior:** Explains bottlenecks and organizes fulfilment

**Risk and edge test:** No duplicate shipment or refund on retry

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/commerce/orders loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Returns shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “View” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Order quick view” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No duplicate shipment or refund on retry; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-006 — Order Detail

**Route:** `/o/:org/commerce/orders/:id` | **Archetype:** `record`

**Layout/content:** Customer; line items; tax; payment; shipping; event timeline.

**Tabs (5):** Overview, Fulfilment, Payments, Returns, Activity

**Primary actions (4):** Fulfil, refund proposal, contact buyer, cancel

**Context overlays (3):** Shipping label, cancellation impact, refund confirmation

**AI behavior:** Assists with delivery and customer service handoff

**Risk and edge test:** Financial state and physical stock adjust consistently

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/commerce/orders/:id loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Fulfil” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Shipping label” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Financial state and physical stock adjust consistently; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-007 — Storefront Builder

**Route:** `/o/:org/commerce/storefront` | **Archetype:** `editor`

**Layout/content:** Theme; navigation; pages; collections; commerce components; responsive.

**Tabs (5):** Pages, Design, Content, Settings, Preview

**Primary actions (5):** Drag layout, edit theme, preview, publish, rollback

**Context overlays (3):** Theme inspector, template picker, publication review

**AI behavior:** Builds editable pages, keeps merchant data bound

**Risk and edge test:** Failed publish preserves prior production site

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/commerce/storefront loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pages and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag layout” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Theme inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Failed publish preserves prior production site; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-008 — Checkout & Payments

**Route:** `/o/:org/commerce/checkout` | **Archetype:** `admin`

**Layout/content:** Checkout fields; payment methods; tax/shipping; abandoned checkouts.

**Tabs (4):** Experience, Payments, Tax, Recovery

**Primary actions (5):** Configure, test, preview, deploy, monitor

**Context overlays (3):** Provider setup, checkout test, policy change review

**AI behavior:** Suggests conversion improvement without weakening safety

**Risk and edge test:** PCI and payment processing delegated appropriately and verified

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/commerce/checkout loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Experience and Recovery shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Configure” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Provider setup” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: PCI and payment processing delegated appropriately and verified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-009 — Fulfilment & Shipping

**Route:** `/o/:org/commerce/fulfilment` | **Archetype:** `board`

**Layout/content:** Pick/pack queues; labels; carriers; tracking; exception.

**Tabs (5):** Pick, Pack, Ship, Track, Exceptions

**Primary actions (4):** Create label, scan, handoff, report exception

**Context overlays (3):** Carrier selector, label preview, delivery exception

**AI behavior:** Optimizes fulfilment routes and customer updates

**Risk and edge test:** Unknown carrier response must not create duplicate label

**Archetype design contract:** Stateful card lanes | Cards show identity, owner, status; dragging has button-based equivalent. | Swipe/horizontal lanes on mobile plus full list view.

**Screen acceptance gates:**

- Route /o/:org/commerce/fulfilment loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pick and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create label” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Carrier selector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unknown carrier response must not create duplicate label; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-010 — Returns & Refunds

**Route:** `/o/:org/commerce/returns` | **Archetype:** `table`

**Layout/content:** Return requests; reasons; photos; eligibility; refund state.

**Tabs (4):** Requested, In review, Approved, Completed

**Primary actions (4):** Approve, restock, refund, communicate

**Context overlays (3):** Return inspector, restock assessment, refund authorization

**AI behavior:** Determines eligibility from approved policy

**Risk and edge test:** Disputed refunds need human escalation by risk

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/commerce/returns loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Requested and Completed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Approve” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Return inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Disputed refunds need human escalation by risk; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-011 — Promotions & Pricing

**Route:** `/o/:org/commerce/promotions` | **Archetype:** `editor`

**Layout/content:** Discounts; coupons; price rules; collections; effective times.

**Tabs (4):** Offers, Codes, Rules, History

**Primary actions (4):** Create promotion, model margin, schedule, pause

**Context overlays (3):** Offer builder, margin check, launch approval

**AI behavior:** Designs offers with Finance and Marketing review

**Risk and edge test:** Stacking discounts cannot violate minimum-price guardrail

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/commerce/promotions loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Offers and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create promotion” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Offer builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Stacking discounts cannot violate minimum-price guardrail; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-COMMERCE-012 — Commerce Analytics

**Route:** `/o/:org/commerce/analytics` | **Archetype:** `report`

**Layout/content:** Average order; cohorts; conversion; fulfilment speed; return rate.

**Tabs (4):** Sales, Products, Customers, Operations

**Primary actions (4):** Compare, segment, inspect source, export

**Context overlays (3):** Chart builder, KPI inspector, report schedule

**AI behavior:** Finds measurable bottlenecks and opportunities

**Risk and edge test:** Results must identify which returns/refunds are included

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/commerce/analytics loads only scoped product data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Sales and Operations shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compare” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Chart builder” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Results must identify which returns/refunds are included; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### BOOK — Bookings, Appointments & Reservations

**Purpose:** Capacity-aware booking services, resources, staff assignment, payments, reminders and no-show handling.

**Human/AI users:** Reception; service operator; schedule administrator; AI receptionist

**Entities:** Service; Resource; Slot; Booking; BookingPolicy; Reminder

**Competitor benchmarking:** Calendly; Acuity; Fresha

**Screen count:** 8

#### ARL-BOOK-001 — Bookings Overview

**Route:** `/o/:org/book/home` | **Archetype:** `dashboard`

**Layout/content:** Today's appointments; occupancy; cancellations; revenue; staff load.

**Tabs (4):** Today, Week, Capacity, Insights

**Primary actions (4):** Create booking, check in, reschedule, ask receptionist

**Context overlays (3):** Quick booking, booking inspector, capacity alert

**AI behavior:** Suggests schedule optimization under policy

**Risk and edge test:** Unavailable slot never displayed as confirmed

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/book/home loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Today and Insights shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create booking” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Quick booking” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Unavailable slot never displayed as confirmed; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-002 — Booking Calendar

**Route:** `/o/:org/book/calendar` | **Archetype:** `calendar`

**Layout/content:** Resources; staff; service category; appointment blocks; hold states.

**Tabs (5):** Day, Week, Month, Resource, Staff

**Primary actions (5):** Drag booking, create, move, cancel, confirm

**Context overlays (3):** Booking form, conflict review, reschedule notice

**AI behavior:** Finds candidate slots respecting constraints

**Risk and edge test:** Concurrent booking attempts protected by slot reservation

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/book/calendar loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Day and Staff shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag booking” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Booking form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Concurrent booking attempts protected by slot reservation; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-003 — Booking Detail

**Route:** `/o/:org/book/bookings/:id` | **Archetype:** `record`

**Layout/content:** Guest/client; service; resource; status; deposit; messages.

**Tabs (4):** Overview, Payments, Messages, History

**Primary actions (4):** Confirm, reschedule, take payment, send reminder

**Context overlays (3):** Reschedule, refund rule, customer message

**AI behavior:** Prepares customer communication and service updates

**Risk and edge test:** Cancellation fees and notice policies shown before action

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/book/bookings/:id loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Confirm” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Reschedule” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cancellation fees and notice policies shown before action; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-004 — Services & Pricing

**Route:** `/o/:org/book/services` | **Archetype:** `table`

**Layout/content:** Service duration; availability; resources; price; buffers.

**Tabs (4):** Services, Categories, Packages, Rules

**Primary actions (4):** Create service, edit buffers, publish, archive

**Context overlays (3):** Service editor, pricing review, availability test

**AI behavior:** Suggests service descriptions and capacity configurations

**Risk and edge test:** Cannot archive service with unreconciled active bookings

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/book/services loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Services and Rules shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create service” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Service editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cannot archive service with unreconciled active bookings; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-005 — Staff & Resources

**Route:** `/o/:org/book/resources` | **Archetype:** `calendar`

**Layout/content:** Staff rosters; rooms; equipment; shared capacity; blackout dates.

**Tabs (4):** People, Rooms, Equipment, Availability

**Primary actions (3):** Set availability, assign resource, block period

**Context overlays (3):** Resource editor, conflict dialog, recurrence

**AI behavior:** Analyzes bottlenecks and suggests capacity allocation

**Risk and edge test:** Linked resource overlap prevents conflicting confirmed slots

**Archetype design contract:** Time-grid and agenda | Local time, resources, availability and conflict preview. | Agenda default on narrow screens; time-grid when feasible.

**Screen acceptance gates:**

- Route /o/:org/book/resources loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between People and Availability shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Set availability” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Resource editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Linked resource overlap prevents conflicting confirmed slots; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-006 — Public Booking Page

**Route:** `/o/:org/book/public/:slug` | **Archetype:** `editor`

**Layout/content:** Brand theme; service selection; available slots; customer fields.

**Tabs (4):** Design, Availability, Fields, Preview

**Primary actions (4):** Arrange fields, preview, publish, test

**Context overlays (3):** Form field inspector, publish, privacy policy

**AI behavior:** Builds branded accessible customer booking flow

**Risk and edge test:** Timezone and daylight-saving conversion verified

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/book/public/:slug loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Design and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Arrange fields” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Form field inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Timezone and daylight-saving conversion verified; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-007 — Reminders & No-shows

**Route:** `/o/:org/book/reminders` | **Archetype:** `builder`

**Layout/content:** Templates; channel; intervals; delivery state; no-show trends.

**Tabs (4):** Rules, Templates, History, Metrics

**Primary actions (3):** Schedule reminders, edit template, test send

**Context overlays (3):** Template editor, send preview, suppression

**AI behavior:** Optimizes reminder strategy without spam

**Risk and edge test:** Customer contact preferences honored

**Archetype design contract:** Visual rules/component builder | Palette, edit surface, property inspector, simulation and publish controls. | Builder on tablet/desktop; structured form alternative on mobile.

**Screen acceptance gates:**

- Route /o/:org/book/reminders loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Rules and Metrics shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Schedule reminders” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Template editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Customer contact preferences honored; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-BOOK-008 — Booking Reports

**Route:** `/o/:org/book/reports` | **Archetype:** `report`

**Layout/content:** Utilization; cancellation; revenue; waitlist; staff performance.

**Tabs (4):** Utilization, Revenue, No-shows, Forecast

**Primary actions (4):** Filter, compare, export, schedule

**Context overlays (3):** Metric calculation, report design, source proof

**AI behavior:** Explains patterns and limitations

**Risk and edge test:** Group booking counts reflect real seats and resources

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/book/reports loads only scoped service data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Utilization and Forecast shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Filter” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric calculation” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Group booking counts reflect real seats and resources; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### PROC — Procurement, Warehouse & Inventory

**Purpose:** Native purchasing, suppliers, receiving, stock movement, warehouses, reorder policies and traceable approvals.

**Human/AI users:** Procurement lead; warehouse worker; store manager; Finance agent

**Entities:** Supplier; PurchaseOrder; Warehouse; StockMove; Requisition; Receipt

**Competitor benchmarking:** Odoo Inventory; Zoho Inventory; Cin7

**Screen count:** 10

#### ARL-PROC-001 — Procurement Overview

**Route:** `/o/:org/proc/home` | **Archetype:** `dashboard`

**Layout/content:** Pending purchases; stock risk; supplier exposure; receipts due.

**Tabs (4):** Overview, Approvals, Suppliers, Stock

**Primary actions (3):** Create requisition, inspect risk, approve PO

**Context overlays (3):** Requisition, stock alert, cost inspector

**AI behavior:** Suggests purchase timing with supply lead time

**Risk and edge test:** Budget owner approval required for financial commitments

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/proc/home loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Stock shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create requisition” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Requisition” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Budget owner approval required for financial commitments; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-002 — Suppliers

**Route:** `/o/:org/proc/suppliers` | **Archetype:** `directory`

**Layout/content:** Supplier records; contracts; lead time; contact; performance.

**Tabs (4):** All, Approved, Review, Archived

**Primary actions (4):** Create, evaluate, link contract, open

**Context overlays (3):** Supplier form, verification, sanctions/compliance review

**AI behavior:** Summarizes performance with verified delivery records

**Risk and edge test:** Bank detail updates require privileged separate verification

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/proc/suppliers loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Archived shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Supplier form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Bank detail updates require privileged separate verification; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-003 — Supplier Detail

**Route:** `/o/:org/proc/suppliers/:id` | **Archetype:** `record`

**Layout/content:** Contacts; products; contracts; orders; invoices; risks.

**Tabs (4):** Overview, Contracts, Orders, Communications

**Primary actions (4):** Request quote, update, compare, flag

**Context overlays (3):** Supplier editor, contract viewer, risk escalation

**AI behavior:** Prepares sourcing comparison without commitment

**Risk and edge test:** Supplier contract clauses require qualified review

**Archetype design contract:** Entity detail with actions and inspector | Sticky identity header, authoritative fields, related objects, chronological audit. | Inspector turns into drawer; primary action stays discoverable.

**Screen acceptance gates:**

- Route /o/:org/proc/suppliers/:id loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Communications shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Request quote” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Supplier editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Supplier contract clauses require qualified review; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-004 — Purchase Requisitions

**Route:** `/o/:org/proc/requisitions` | **Archetype:** `table`

**Layout/content:** Requests; requester; budget; item; priority; approval status.

**Tabs (4):** Mine, Team, Awaiting approval, Closed

**Primary actions (4):** Create, approve, reject, convert to PO

**Context overlays (3):** Requisition form, budget check, rejection reason

**AI behavior:** Drafts purchase proposals from stock forecasts

**Risk and edge test:** Approval chain cannot be bypassed by conversion

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/proc/requisitions loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Mine and Closed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Requisition form” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Approval chain cannot be bypassed by conversion; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-005 — Purchase Orders

**Route:** `/o/:org/proc/orders` | **Archetype:** `table`

**Layout/content:** PO number; supplier; items; costs; delivery; approvals.

**Tabs (5):** Draft, Approved, Sent, Received, Closed

**Primary actions (5):** Create, revise, send, receive, close

**Context overlays (3):** PO editor, change impact, send preview

**AI behavior:** Assembles purchase order from approved requisition

**Risk and edge test:** Sent revisions versioned; double ordering prevented

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/proc/orders loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Draft and Closed shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “PO editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sent revisions versioned; double ordering prevented; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-006 — Warehouse Locations

**Route:** `/o/:org/proc/warehouses` | **Archetype:** `directory`

**Layout/content:** Warehouses; bins; capacity; managers; stock maps.

**Tabs (4):** Sites, Bins, Capacity, Activity

**Primary actions (4):** Add bin, transfer, inspect, audit

**Context overlays (3):** Location editor, stock count, transfer

**AI behavior:** Optimizes put-away and picking within verified rules

**Risk and edge test:** Physical stock changes require scan/receipt proof when mandated

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/proc/warehouses loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Sites and Activity shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Add bin” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Location editor” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Physical stock changes require scan/receipt proof when mandated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-007 — Receiving & Scanning

**Route:** `/o/:org/proc/receiving` | **Archetype:** `editor`

**Layout/content:** Inbound deliveries; barcode scanner; PO match; discrepancies.

**Tabs (4):** Expected, Receiving, Exceptions, Complete

**Primary actions (4):** Scan, count, flag damage, put away

**Context overlays (3):** Scan overlay, discrepancy, receipt confirmation

**AI behavior:** Matches arrivals and proposes discrepancy classification

**Risk and edge test:** Duplicate scans and offline sessions de-duplicated

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/proc/receiving loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Expected and Complete shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Scan” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Scan overlay” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Duplicate scans and offline sessions de-duplicated; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-008 — Stock Movements

**Route:** `/o/:org/proc/movements` | **Archetype:** `table`

**Layout/content:** Transfers; adjustments; allocations; audit; location.

**Tabs (4):** All, Transfers, Adjustments, Counts

**Primary actions (3):** Create move, approve adjustment, export

**Context overlays (3):** Movement inspector, count reconciliation, authorization

**AI behavior:** Finds unexplained movements and suggests investigation

**Risk and edge test:** Inventory ledger never updated without traceable transaction

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/proc/movements loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between All and Counts shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create move” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Movement inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Inventory ledger never updated without traceable transaction; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-009 — Replenishment

**Route:** `/o/:org/proc/replenishment` | **Archetype:** `report`

**Layout/content:** Min max; demand; lead times; supplier cost; suggested purchase.

**Tabs (4):** Suggested, Planned, Ordered, Exceptions

**Primary actions (3):** Adjust forecast, create requisition, approve

**Context overlays (3):** Reorder policy, scenario, purchase preview

**AI behavior:** Predicts need but labels uncertainty and seasonality

**Risk and edge test:** No autonomous financial commitment beyond limit

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/proc/replenishment loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Suggested and Exceptions shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Adjust forecast” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Reorder policy” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: No autonomous financial commitment beyond limit; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PROC-010 — Procurement Analytics

**Route:** `/o/:org/proc/reports` | **Archetype:** `report`

**Layout/content:** Spend; supplier reliability; stock turns; shortages; variance.

**Tabs (4):** Spend, Service, Inventory, Forecast

**Primary actions (4):** Compare, inspect, report, export

**Context overlays (3):** Metric source, report designer, supplier review

**AI behavior:** Identifies measurable cost and reliability changes

**Risk and edge test:** Cancelled orders excluded appropriately from spend

**Archetype design contract:** Drillable analytical report | Title, period/source, key conclusion, charts/tables, methods and export. | Charts reflow, tables use accessible alternate; formulas remain inspectable.

**Screen acceptance gates:**

- Route /o/:org/proc/reports loads only scoped supplier data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Spend and Forecast shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Compare” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Metric source” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Cancelled orders excluded appropriately from spend; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


### PORTAL — External Portals & Client Collaboration

**Purpose:** Branded, scoped customer/client/partner spaces with documents, messages, approvals, bookings, payments and status.

**Human/AI users:** Client; vendor; partner; account manager; authorized service agent

**Entities:** Portal; PortalMember; SharedResource; ClientRequest; PaymentLink

**Competitor benchmarking:** Client portals; Zoho Creator portals; customer workspaces

**Screen count:** 7

#### ARL-PORTAL-001 — Portal Directory

**Route:** `/o/:org/portal/portals` | **Archetype:** `directory`

**Layout/content:** Portal instances; audience; brand; custom domain; access; health.

**Tabs (4):** Clients, Customers, Suppliers, Partners

**Primary actions (4):** Create, clone, preview, suspend

**Context overlays (3):** Portal wizard, branding, access setup

**AI behavior:** Designs portal structure from client workflow

**Risk and edge test:** Portal never inherits internal company permissions by default

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/portal/portals loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Clients and Partners shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Create” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Portal wizard” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Portal never inherits internal company permissions by default; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-002 — Portal Builder

**Route:** `/o/:org/portal/portals/:id/builder` | **Archetype:** `editor`

**Layout/content:** Pages; navigation; components; access gates; brand style.

**Tabs (5):** Pages, Design, Data, Access, Preview

**Primary actions (4):** Drag modules, bind permitted data, test, publish

**Context overlays (3):** Module picker, data grant, publish review

**AI behavior:** Builds accessible branded portal layout

**Risk and edge test:** External users cannot traverse internal object IDs

**Archetype design contract:** Purpose-built structured editor | Document/canvas/grid occupies largest area; contextual tools, autosave and undo. | Toolbars collapse; inspectors become accessible sheets; no text miniaturization.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/builder loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Pages and Preview shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Drag modules” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Module picker” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: External users cannot traverse internal object IDs; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-003 — External Dashboard

**Route:** `/o/:org/portal/portals/:id/dashboard` | **Archetype:** `dashboard`

**Layout/content:** Shared projects; milestones; account documents; next actions.

**Tabs (5):** Overview, Work, Files, Messages, Billing

**Primary actions (4):** View, comment, approve scoped item, request service

**Context overlays (3):** Shared item inspector, client message, access request

**AI behavior:** Summarizes client-specific work with redaction

**Risk and edge test:** Portal must not expose cross-client aggregated records

**Archetype design contract:** KPI/briefing modular grid | Start with one-line summary, then top decisions, metrics, work and source links. | 3-4 columns wide; 2 columns tablet; 1 column narrow, card reorder via menu.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/dashboard loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Overview and Billing shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “View” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Shared item inspector” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Portal must not expose cross-client aggregated records; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-004 — Shared Documents

**Route:** `/o/:org/portal/portals/:id/files` | **Archetype:** `directory`

**Layout/content:** Files; permissions; versions; download; signature request.

**Tabs (4):** Shared, Needs review, Signed, Archive

**Primary actions (4):** View, download, comment, request access

**Context overlays (3):** Document preview, permission request, signature

**AI behavior:** Explains document context with source attribution

**Risk and edge test:** Expired links and revocation applied immediately

**Archetype design contract:** Searchable entity cards or list | Search/filter/sort, results count, quick inspection, pagination/virtualization. | Full list desktop, card rows mobile; filters in drawer.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/files loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Shared and Archive shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “View” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Document preview” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Expired links and revocation applied immediately; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-005 — External Messaging

**Route:** `/o/:org/portal/portals/:id/messages` | **Archetype:** `chat`

**Layout/content:** Client messages; account manager; AI service; attachments.

**Tabs (3):** Inbox, Requests, History

**Primary actions (4):** Reply, upload, book meeting, escalate

**Context overlays (3):** Conversation details, attachment preview, complaint

**AI behavior:** Service AI acts within portal data and company policy

**Risk and edge test:** AI cannot discuss internal project notes not shared

**Archetype design contract:** Two-column conversation with optional context | Message list, composer, mentions, source context, attachments. | Single-thread mobile; sidebar as sheet; composer above keyboard.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/messages loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Inbox and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Reply” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Conversation details” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: AI cannot discuss internal project notes not shared; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-006 — Portal Billing & Requests

**Route:** `/o/:org/portal/portals/:id/billing` | **Archetype:** `table`

**Layout/content:** Invoices; payment links; request forms; status; receipts.

**Tabs (4):** Invoices, Payments, Requests, History

**Primary actions (4):** Pay, download, submit request, dispute

**Context overlays (3):** Payment provider, dispute form, document receipt

**AI behavior:** Prepares customer explanations from approved billing facts

**Risk and edge test:** Sensitive payment details delegated to compliant provider

**Archetype design contract:** Dense professional data table | Column presets, server filtering, sorting, pinned identity, bulk selection. | Horizontal table where necessary plus mobile record-card alternative.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/billing loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Invoices and History shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Pay” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “Payment provider” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Sensitive payment details delegated to compliant provider; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.

#### ARL-PORTAL-007 — Portal Access & Analytics

**Route:** `/o/:org/portal/portals/:id/admin` | **Archetype:** `admin`

**Layout/content:** External users; roles; invitations; usage; activity; legal terms.

**Tabs (4):** Users, Access, Analytics, Audit

**Primary actions (4):** Invite, revoke, set expiry, review activity

**Context overlays (3):** External invite, scope preview, account recovery

**AI behavior:** Suggests permission defaults for client role

**Risk and edge test:** Client cannot grant themselves broad internal access

**Archetype design contract:** Settings and audited configuration | Hierarchy of controls, preview consequences, sensitive action review. | Stack settings sections; avoid modal chains; keep submit visible.

**Screen acceptance gates:**

- Route /o/:org/portal/portals/:id/admin loads only scoped portal data for an authorized role; direct URL access to an unauthorized organization is denied.

- Switching between Users and Audit shows the correct distinct content, preserves relevant state, supports keyboard activation and an accessible selected-state announcement.

- The action “Invite” performs its stated change or navigation with loading, validation, explicit success/failed state and a traceable record when consequential.

- The “External invite” overlay is accessible, context-specific, resizes on mobile and returns focus without losing unsaved work.

- Edge test: Client cannot grant themselves broad internal access; verify denial/fallback, status language, audit/event and safe recovery.

**Engineering-specific verification:** URL loads, role/context checks, each tab has distinct local state, actions persist where applicable, overlays work by pointer/keyboard, narrow layout and offline/error recovery are tested; external side effects only verified by real provider response.


## Independent review and handoff

- Verify every listed route against the live app and registry; do not use only route-count tests.

- Cross-review UI consistency with WS1; model contracts and permissions with WS2; domain events with WS3/WS4; creative output with WS5; automated QA with WS6.

- All broken cross-app references, blocked native interactions, false external statuses or inaccessible overlays are release blockers.

- Include a change log, screenshots, verified test commands and independent reviewer names/agent IDs before signing off.
