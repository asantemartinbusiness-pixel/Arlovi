# ARLOVI — HEADQUARTERS, WORKSPACES & NAVIGATION ARCHITECTURE
**Design source of truth · Complete frontend · 16 November 2026**

## 1. Why this exists

Arlovi is a *digital company headquarters*, not a navigation bar for 35 unrelated SaaS products. A human employee, company owner or AI workforce manager must always understand (1) which company they belong to, (2) their current working space, (3) which business application they have opened, (4) which record/file they are editing and (5) where to go next.

**Non-negotiable:** no vertical rail of 35 competing icons; no duplication of all 316 routes in primary navigation; no browsing of fake seeded detail IDs; no generic replacement pages that break native application workflows. Every one of the 35 native applications remains fully accessible via the searchable catalogue. This is not an MVP or feature reduction.

## 2. Spatial anatomy

### Desktop · 1440px and above

```
┌──────────────────────────────────────────────────────────────────────┐
│  Brand | Company switch | Workspace context | Search | Ask | Alerts | Account
├────────────────┬─────────────────┬───────────────────────────────────┤
│ COMPANY OFFICE │ ACTIVE APP PAGES│ WORK SURFACE                      │
│ 248px          │ 232px           │ flexible / fluid                  │
│                │                 │                                   │
│ My office      │ Finance         │ Relevant page                     │
│  Home          │  Overview       │ Title, state, actions, tabs       │
│  My Workspace  │  Transactions   │ Workspace-specific tools          │
│  Inbox         │  Invoices       │ Native records and content        │
│                │  Reconciliation │                                   │
│ Company        │  Reports        │ Context inspector where needed    │
│  Overview      │                 │                                   │
│  Departments   │ (only this app) │                                   │
│  Missions      │                 │                                   │
│                │                 │                                   │
│ Workspaces     │                 │                                   │
│  Intelligence  │                 │                                   │
│  Studio        │                 │                                   │
│  Projects      │                 │                                   │
│                │                 │                                   │
│ Pinned apps    │                 │                                   │
│                │                 │                                   │
│ All apps       │                 │                                   │
│ Administration │                 │                                   │
└────────────────┴─────────────────┴───────────────────────────────────┘
```

**When the user is on Home, My Workspace, Company Overview or other Headquarters pages, do not show an additional application sidebar.** The primary company navigator already owns that hierarchy; a second panel would waste horizontal space and duplicate Home/Company/Departments links. The contextual panel appears only inside a native specialist application.

A real document or design editor is allowed to consume the entire remaining work surface, optionally collapsing the active-app sidebar. Never shrink a professional canvas to accommodate multiple unnecessary navigation rails.

### Intermediate desktop · 1024–1439px

Global navigation is 226px from 1200–1439px, then a 68px *semantic* compact rail from 1024–1199px; it retains only **high-level office destinations and actual favorites**, not all 35 tools. Application navigation adapts to 216px. Editor panels are contextual and independently collapsible. User selection is stored locally.

### Tablet and mobile · below 1024px

One work surface at a time. A stable bottom bar provides **Home, My work, Inbox, Studio and Apps** where permitted by the selected role. The global headquarters menu and current application's pages each open as separate left drawers; never display two drawers at once or squeeze both into a 390px viewport. The header contains separate controls: **Open navigation** and **Open [application] pages**. Safe-area insets protect the bottom rows.

### Compact-height screens

Company and application navigation each scroll independently; the work surface retains its own scroll state. 1366×768 and 1280×720 must remain readable. No labels below legibility thresholds simply to fit more icons. No horizontal page overflow.

## 3. The three navigation levels

### LEVEL 1 · Headquarters / company-wide

**MY OFFICE**
- Home — `/o/:org/hq/home`
- My Workspace — `/o/:org/hq/my-work`
- Inbox — the native Inbox application

**COMPANY**
- Company Overview — `/o/:org/hq/company`
- Departments — `/o/:org/hq/departments`
- Mission Control — the native Missions application

**WORKSPACES**
- Intelligence — native AI/Chief of Staff (active visual grouping extends through Brain, Team, Missions, Automation and Analytics)
- Studio — native Design entry (active grouping extends through Docs, Sheets, Present, Design, Photo, Layout, Video and Motion)
- Projects — native project/workload application

**PINNED APPLICATIONS** — up to five visible workspace shortcuts from the real per-company `preferences` records, with the full catalogue retaining additional favorites.

**BOTTOM ACTIONS** — *All applications* opens the complete searchable catalogue; *Administration* opens the actual organization controls; *Collapse sidebar* toggles desktop density. All are real controls.

### LEVEL 2 · Application-owned local navigation

Only the selected application owns this sidebar. For example:
- Finance → invoices, accounts, journal and financial reports
- CRM → customers, deals, accounts, pipelines
- Studio Design → files, canvas, components and inspectors appropriate to the opened file
- HR → people, leave, payroll and statutory tools
- Company HQ → directory, goals, timeline and department pages

The application navigation must use each module's *actual route declarations* and reflect the user's current selected file/record. A record-specific route is rendered in navigation **only when a real current record ID is present**; otherwise the route is discoverable through its parent list. **Never interpolate `sampleId` or another company's seeded record ID** just to make an icon clickable.

A *Workspace home* link returns to the selected native application's entry page. App context panels can be hidden to maximize editor width and reopened without losing the current working page.

### LEVEL 3 · Page, tabs, inspector and work surface

The actual page owns its workflows: table, document, canvas, editor, timeline, approvals, layers, right-hand inspector, form dialogs, drag-and-drop, toolbar and actions. A tab is not a primary navigation item. A canvas property belongs to the inspector, not to a global sidebar. A genuine action must update the correct locally persisted record.

## 4. Complete application launcher

The launcher is an intentional separate discovery experience, not a scrollable icon rail. It includes:
- 35 native apps across six clearly labelled categories:
  **Headquarters, Intelligence, Operations, Growth, Studio, Platform**.
- Search by tool name, with a real results/empty state.
- Group filtering with visible counts.
- Application cards with name, icon, concise purpose and pinned status.
- Active-company context, role-sensitive visibility and correct application-entry routes.
- Keyboard focus on search, Escape dismissal, focus trapping and return to invoking control; mouse/touch backdrop dismissal.
- No broken action buttons; clicking an app navigates to the real native application and closes the overlay.

**Navigation grouping is not a business-data permission boundary.** A user whose application is hidden due to the current role is not given new server permissions by changing the frontend. Authentic backend authorization must be implemented separately.

## 5. Global header

60px desktop header. Keep in one coherent row:
1. Arlovi brand identity with return to HQ
2. Company switcher with company-specific address/context
3. Current workspace breadcrumb (area and application, not ten nested pills)
4. Global command/search (`Ctrl+K` or `⌘K`)
5. Ask Arlovi
6. Attention Centre
7. Account/role/appearance

Do not put 35 app icons in the header. Avoid redundant badges, theme switchers and duplicate labels on compact displays. The current page heading stays in the page, not repeated as a full second toolbar.

## 6. Visual system

- Primary navigation: **248px** desktop; **68px** intentionally compact desktop.
- Application context: **232px** full desktop, **216px** mid desktop.
- Global header: **60px**.
- Work surface: fluid, `minmax(0,1fr)`, independent overflow.
- Primary row heights: **41–44px**; touch targets **44px or larger** on mobile.
- Spacing: 4px base system with purposeful 8/12/16/24/32px groupings.
- Typography: high-contrast Inter body; IBM Plex display/mono where already approved; micro-labels are restricted to section metadata, not ordinary actions.
- Colours: existing Arlovi Electric Cobalt `#234FE8`, papaya `#FFAE7C`, aqua `#36C5BA`, warm neutrals and role-independent semantic statuses. The navigation must not introduce a new competing design language.
- Subtle surface hover, accessible focus indicators, clear selected state, restrained movement and reduced-motion compatibility.
- Keep color, size, motion, type and spacing in shared tokens. No inline one-off decoration for repeated nav controls.

## 7. Key role journeys

**Company founder:** Open Home → review company priorities → visit departments → enter Mission Control → ask Chief of Staff → approve action → open relevant Finance or Studio application → return to Home.

**Human employee:** Enter My Workspace → Inbox → follow assigned mission/task → work in the required native application → update and save → back to My Workspace.

**Designer:** Studio → select Design/Present/Photo → choose actual document → collapse local app pages → use canvas/layers/inspector → return to document library without losing state.

**Finance manager:** Open Finance via pinned app or launcher → navigate invoices and ledgers in application-owned sidebar → edit record with audit and approval safeguards → view analytics → return to executive HQ.

**New company:** 10-step onboarding → headquarters getting-started guide → full suite available → pin frequently used native apps → revisit source and mission setup. Never show invalid seed-detail links from Northline or Harbor.

**Small-screen team member:** Stable bottom navigation → mobile headquarters drawer → choose department or mission → open current application's drawer → return to office. Do not expose two sidebars simultaneously.

## 8. Quality gates

The approved full platform has **35 application domains and 316 registered screens**. These counts remain unchanged by navigation restructuring.

Mandatory checks:
1. All 35 native apps are reachable through launcher for Owner role, with role-sensitive visibility.
2. Every primary destination goes to a concrete existing route, not a mock page.
3. Finance, CRM, Design and AI show **their own** contextual navigation only.
4. No seeded detail ID appears in contextual sidebar without an actual selected record.
5. Global menu and app drawer function separately on phones; stable bottom nav remains readable at 320–430px.
6. Sidebar collapse and app context collapse persist across refresh; neither damages editor content.
7. Global search, Ask Arlovi, Attention Centre, org switch, role view, approval flows and all 316 native screens remain operational.
8. Desktop checks at 1024, 1280, 1366, 1440, 1600, 1920; mobile/tablet at 320, 360, 390, 430, 768.
9. WCAG-aligned keyboard behaviour, visible focus, semantic section labels, Escape dismissal, reduced motion and touch accessibility.
10. Browser screenshots and actual user interaction tests must pass before sign-off. A Vercel `READY` build alone proves only the build step, not visual UX quality.

## 9. Implementation ownership

- `src/app/HeadquartersNavigation.tsx`: primary organizational hierarchy and pins
- `src/app/AppLauncher.tsx`: searchable complete native app catalogue
- `src/app/navigationModel.ts`: route-aware contextual navigation without fake record IDs
- `src/app/AppShell.tsx`: global top chrome, context pane, work surface, mobile bottom nav and overlays
- `src/app/navigation.css`: responsive spatial system
- `src/app/nav.ts`: canonical complete app grouping and app icons (retained, never used to render all apps in the primary rail)
- `e2e/navigation-hierarchy.spec.ts`, `tests/unit/navigation-hierarchy.test.ts`: navigation regression coverage

**Execution policy:** Preserve the current working application and all native features; complete any outstanding acceptance work across the whole scope. Never treat a clean navigation build as proof that all application internals are finished.
