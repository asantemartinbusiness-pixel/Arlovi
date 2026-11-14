# Arlovi — Full Frontend Acceptance, QA and Executive Review

## Baseline and required tests
- All 35 domains implemented, with exactly all 316 stable screen IDs registered; each must have a distinct useful route and correct app-specific screen.
- 1323 tab instances must be reachable, switch view and preserve relevant state; keyboard usage announced, no tabs that only change underline.
- 956 overlays must open, display correct scoped information, validate, dismiss/focus-return, handle small screens and preserve unsaved work.
- 1328 named primary action instances must trigger meaningful creation/editing/navigation/preview/export/feedback or accurate provider-boundary decision. A no-op is failure.
- 20 workflow journeys must be testable end-to-end with realistic shared browser-local records and failure variants.
- All 21 shared surfaces must behave consistently across relevant apps: header, sidebar, command, AI composer, execution tray, dialogs, notification centre etc.

## Review ladder
1. Feature author — implementation, domain assertions, local build and screenshots at mobile/desktop.
2. Workstream lead — architecture conformance, all page/tab/action/overlay requirements and local data continuity.
3. Cross-workstream reviewer — verify appropriate app-specific interaction, peer browser test and integration with shared UI.
4. UX/a11y reviewer — text scale, responsive layouts, contrast, keyboard/focus, reduced motion, meaningful semantics, zoom.
5. QA/WS6 — test matrix, global regression, cross-app journeys, performance and dependency/licenses.
6. Executive orchestrator — compare verified inventory metrics to target, sign off only on evidence; reassign incomplete tasks without asking owner for routine choices.

## Test categories
- **Registry coverage:** missing screen IDs, routes, tab elements, named actions, overlay signatures, duplicate route collisions.
- **Real functionality:** create, edit, delete, filter, sort, bulk action, export and durable refresh; check data actually changes.
- **Cross-domain relationships:** customer links Finance/CRM/Service, booking resource availability, inventory controls, mission-to-artifact references, brand scoping and origin.
- **Finance invariants:** journal debits equal credits; tax calculation precision; reversal, void and posting validations; scope and period restrictions in local model.
- **Creative engines:** object selection, text/path/layer change, undo/redo, valid export parse-back, save and reopen; timeline/audio and formula evidence where applicable.
- **AI action truth:** local deterministic actions show actual local output; unconnected providers do not produce false success or invented sources.
- **Security:** org/role change isolates UI and browser-local data, no key in bundle, untrusted pasted content sanitized, no unchecked execution of user code.
- **Notifications:** critical vs routine grouping, read ≠ approved, deep-link correct, snooze/resolve state durable.
- **Accessibility:** keyboard-only principal journeys, semantic forms/tablists, dialog focus trap, live region announcements, accessible drag alternative, WCAG 2.2 AA targets.
- **Responsive:** widths 320, 375, 600, 768, 900, 1024, 1199, 1200, 1366, 1440, 1600, 1920 CSS px plus short-height and zoom; mobile keyboard safe, no action clipping.
- **Resilience:** offline/local storage limits, data corruption, migration, duplicate retries, partial state, reload, slow processing, browser quota/error.
- **Performance:** usable route transitions, virtualized large lists, lazy-load heavy specialist editors, avoid layout thrashing, no destructive bundle explosion.

## Evidence template per screen
```
Screen ID / route:
Owner / peer reviewer:
Build artifact / commit ref:
Functional test:
Tab tests (names):
Overlay tests (names):
Action tests (names):
State tests (empty/loaded/edit/blocked/error/etc):
Responsive screenshots (mobile/tablet/desktop):
Keyboard/a11y result:
Data persistence result:
Integration/provider truth checks:
Open defects:
Review result: pass / fail / blocked
```

## Hard failure conditions
- Replacing specialist app with generic page.
- Marking completion from screenshots rather than tested interaction.
- Missing any canonical route, named tab, overlay, action or user workflow.
- Button that does nothing, nonpersisting edit presented as saved, fake confirmation of third-party effects.
- Pretending frontend-only role switching equals tamper-resistant security.
- Falsely claiming cloud AI analysis or live external data from local static fixtures.
- Nonaccessible modal, broken deep link, mobile clipped edit/approval controls.
- Build/test failure, missing license attribution, or unresolved console runtime error.

## Exit report
The Executive Orchestrator submits commands run, numeric target vs verified results, per-workstream pass/fail, all unresolved blockers, evidence paths and candid limitations caused by absence of backend. No self-awarded 100% report.
