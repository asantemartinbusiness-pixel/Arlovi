# Arlovi · Native overlay experience audit
18 November 2026 · Branch: `feat/native-overlay-experience-audit-20261118`

## Scope and evidence

The platform's approved catalogue currently contains **35 native applications, 316 screens and 957 overlay entries**. Application modules also declare bespoke overlays in `src/applications/*/index.tsx`; these are separate source-level declarations and are not equivalent to the catalogue count. Run `npm run audit:overlays -- --json docs/implementation/native-overlay-inventory.json` to generate the exact per-module source inventory from the current checkout. The script records source lines and explicit metadata, without claiming the interaction works.

**Boundary:** A shared shell is not an app-level redesign. This change introduces app-specific orientation for every registered modal, drawer and inspector, makes selected-record context dynamically scoped to its company, and refines six high-consequence workflows. It does **not** certify that every approved overlay has undergone manual UX and browser testing.

## What makes a native overlay complete

Every instance should establish its own **object**, **purpose**, **state**, **evidence**, **available decision**, **impact**, **what cannot happen**, and **next destination** as appropriate. These must come from real application data and domain functions, never invented by a generic overlay component. The same information should not be repeated in the heading, summary, and form. Inspectors can remain continuously visible in full editor workspaces; short decisions belong in compact modals, extended multi-field work in drawers.

- **Inspectors:** selected entity/element, current source state, relationships, relevant history, source navigation; never silently switch to the first record.
- **Creation/editing:** explicit object, required inputs, inline validation, unsaved-change protection, saving state, scope/permission, meaningful success/failure.
- **Review/approval:** supporting evidence, amount/time/identity, current and proposed state, impact preview, reason, reviewer authority, audit trace, deliberate confirm.
- **Destructive changes:** precise scope, reversible/irreversible consequences, related records and blocking conditions, named action.
- **Provider boundaries:** whether a provider is connected, what is recorded only locally, and what operation was not actually performed.
- **Canvas/editor overlays:** respect selection context, tool mode, layers, document state, and undo/redo; do not introduce modal forms for lightweight contextual tools.
- **Assistive and mobile:** screen-reader name/description, keyboard focus, touch targets, safe-area footer, reduced motion, responsive layout and Arlovi's saved display scale.

## Application-specific data and workflow contract

| Native app | What a useful panel must contain | Action and safety model |
|---|---|---|
| HQ · Headquarters | Owner, priority, current objective, provenance and connected work | Record decision or create work with explicit responsibility |
| INBOX · Inbox | Sender, source application, urgency, unresolved requirement and deep link | Read/acknowledge is not approval; protect delegated decisions |
| ADMIN · Administration | Member, role, policy scope, entity, change and audit implications | No client-side role preview is real authentication |
| ASSET · Assets | Asset identity, type, permissions, versions, licence and linked uses | Validate rights and replacements before publishing |
| AI · Ask Arlovi | Current thread, sources, allowed tools, retrieval scope, cited output | Human authorization before affecting external systems |
| BRAIN · Company Brain | Source, provenance, freshness, visibility, correction history | Knowledge approvals separate from source ingestion |
| TEAM · AI Workforce | Agent contract, reporting chain, granted tools and limits | Separate agent identity, approvals and connected execution |
| MISSION · Missions | Goal, owner, dependency graph, stage and blockers | Human review for consequential steps |
| AUTO · Automation | Trigger, graph, run trace, warnings, provider readiness | No silent scheduler or provider execution; prevent double activation |
| ANALYTICS · Analytics | Metric definition, source, time range, freshness and filters | Export and explanation match underlying data |
| FIN · Finance | Account/invoice, posted source, balance, tax code and reconciliation | Journal and approvals are distinct; preserve double entry |
| CRM · CRM | Contact/company, relationship, stage, quote, linked activities | Deal closure requires evidence and clean Finance handoff |
| HR · People | Employee/candidate, policy, approvals, manager and lifecycle state | Least exposure to sensitive data; external offboarding remains explicit |
| PROJECT · Projects | Owner, milestones, dependencies, blockers, related tasks | Scope changes and assignments have visible impact |
| COMMS · Communications | Sender identity, recipients, content, delivery capability | Distinguish local draft from actual message delivery |
| CARE · Customer Care | Customer, case timeline, severity, SLA, owner and resolution | Escalation and closure require complete evidence |
| LEGAL · Legal | Matter, privilege, parties, deadlines, evidence and obligation | Restrict disclosure, preserve approval and audit trail |
| MARKET · Marketing | Campaign objective, channel, audience, creative, budget, calendar | Preview targeting, schedule and publish boundaries |
| COMMERCE · Commerce | Product/order, margin, fulfilment, stock and refund history | Payments and refunds cannot be claimed without processor receipts |
| BOOK · Bookings | Service, time zone, resource, capacity, conflicts, deposits | Verify real availability; request vs received is distinct |
| PROC · Procurement | Supplier, requisition, PO, budget, invoice and receipt match | Separation of request, approval, payment and goods receipt |
| PORTAL · Portals | External user, granted record, expiry, visible shared items | Prevent cross-client and cross-organisation leakage |
| DOCS · Documents | File, cursor/selection, versions, permissions and review state | Save/review/publish are separate operations |
| SHEETS · Sheets | Workbook, sheet/range, formula dependencies and change preview | Preserve formula integrity and selection during edits |
| PRESENT · Presentations | Deck, current slide, object, layer, notes and export intent | Preview before publishing, maintain slide selection |
| DESIGN · Design | Document, selection, layers, constraints, style and artboard | Contextual inspector, undoable edits and non-destructive preview |
| PHOTO · Photo | Image, adjustments, licensing, comparison and export quality | Nondestructive edit states and source transparency |
| LAYOUT · Layout | Page, master, frame, overflow, text and print setup | Warn about overset text and master changes |
| VIDEO · Video | Sequence, clip, timecode, track, proxy and render settings | Avoid destructive or implicit export and timeline changes |
| MOTION · Motion | Composition, keyframe, easing, looping and playback | Inspector follows selected keyframe; preserve undo |
| WEB · Web | Site, route, domain, environment, preview and publishing state | Domain/connectivity proof, deployment confirmation |
| BUILD · Build | Project, environment, component, binding, validation and release | Inspect changes before deploy; external services require real connection |
| FORMS · Forms | Form/field, validation, routing, responses and publish readiness | Test sample path before releasing a public form |
| CONNECT · Integrations | Provider, account, data scopes, consent, sync and limits | No pretend OAuth or cross-org credentials |
| IT · IT | Service, incident, severity, owner, evidence and mitigation | Permission-bound incident escalation and audit |

## Code shipped in this branch

1. `NATIVE_OVERLAY_DOMAINS` explicitly covers all 35 application codes, so headings reflect the actual app/screen rather than generic “Details”.
2. Modal and drawer origins, selected-record headers, and on-page inspectors share the shell but retain domain-specific bodies and styling.
3. Selected-record overlays opt into a collection/tenant guard before rendering; missing, foreign and wrong-collection records do not silently fall back to another.
4. Selected high-consequence flows are refined: Finance invoice receipts, People offboarding, CRM won-deal handoff, Automation activation/pause, Communications forward review and Bookings deposits. Commerce refund preview also refuses an arbitrary order fallback.
5. Tests cover native identity mapping, booking/finance ownership, and absence of an arbitrary automation selection.
6. The static source inventory script supports future app-by-app review, tracking which definitions still lack explicit guidance, capability declarations or grounded evidence.

## Remaining certification work

A source declaration or successful Vercel build does not prove individual overlay completeness. For every overlay in the generated inventory, inspect the actual rendered experience on desktop, tablet and mobile, including the old 80% → new 100% display baseline, reduced scale settings, keyboard, input errors, slow/offline states, permissions, company switching, and save/discard behaviour.

Prioritise security-sensitive or financial operations (ADMIN, FIN, HR, LEGAL, PROC, COMMS, CONNECT, IT), then customer-facing records (CRM, BOOK, COMMERCE, CARE, PORTAL), then editors and canvases. Capture app/screen/overlay ID, screenshots, source fields, mutations, status, role cases, test result and any unresolved UX defect. **Do not mark the entire overlay programme finished without this evidence.**

## Release checks

`npm run audit:overlays` · `npm run qa` · `npx playwright test e2e/native-overlay-experience.spec.ts e2e/modal-experience.spec.ts e2e/drawer-experience.spec.ts`. Review the Vercel preview, verify no loss of native app functionality, and merge only after green checks or documented exceptions.
