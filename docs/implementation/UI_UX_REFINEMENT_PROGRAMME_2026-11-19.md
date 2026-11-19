# Arlovi · Full-platform UI/UX refinement & native interaction programme

19 November 2026 · Branch `claude/arlovi-ui-ux-refinement-4qadu0` · Base: `main` @ `456c87d`

This file is the shared programme brief and ledger. Every worker reads it before touching code.
It is updated by the orchestrator as work packages land. Nothing in it claims verification that
was not run.

## 1. Verified baseline (measured on `main` @ 456c87d, this container)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (1 pre-existing warning: unused eslint-disable in `src/app/AppShell.tsx:293`) |
| `npm test` (vitest) | pass |
| `vite build` | pass (2 pre-existing chunk warnings: motion/model.ts, build/model.ts mixed import) |
| Catalogue | 35 applications · 316 screens · 1324 tabs · 957 overlay entries · 1328 primary actions |
| Source overlay declarations | `node scripts/audit-native-overlays.mjs` → 0 static issues |
| Screen ledger | all 316 screens `verified` by the prior sweep; this programme raises quality, it does not re-prove contract coverage |

Playwright baseline is recorded by the QA baseline worker in §7.

## 2. Observed baseline defects (from screenshots in the scratchpad, desktop 1440×900 and mobile 390×844)

Global (fix centrally, owners in §5):

1. **Notification toast flood.** Four stacked "New notification / Urgent notification · N new item(s)" toasts
   appear on first load of Executive Home and cover content; on mobile they hide the whole screen. Cause:
   `AppShell.tsx` arrival tracker seeds on mount, then lazily hydrated collections arrive as "fresh". Needs:
   a hydration grace window, coalescing of arrivals within a window into one toast, a hard cap on the visible
   stack (3) with the remainder summarised, and no re-fire for the same item ids across route changes.
2. **Visible focus rectangle on every page `h1`.** `AppShell.tsx` focuses the heading after route changes
   (good for AT); `:focus-visible` then paints a 2px box around the title. Keep the focus move, remove the
   ring for `h1[tabindex="-1"]`.
3. **Page head is too tall.** breadcrumb → 44px title → lede → tabs → divider; first content lands ~290px
   below the header at 1440×900. Target ≈ 170–190px with the same hierarchy. `h1` 28–44px clamp should
   become ≈ 24–30px at the 100% scale; lede smaller; tab strip tighter; keep breadcrumbs.
4. **Stat tiles are oversized** for list screens (36px numbers, generous padding). Keep the editorial
   colour marker; reduce value size to ≈ 26–28px and padding by one step on dense screens.
5. **Drawers with a single short form sit in a 640px panel with 60% empty space** (e.g. CRM Deal drawer).
   Width must follow content; form drawers should default to 440–520 unless they carry tabs/tables.
6. **Record pages repeat identity** (People profile: header card with avatar + name, then a second card with
   the same avatar + name) and carry filler sentences ("An employee-centered workspace: …"). Record pages
   need one `RecordHeader` and no descriptive filler.
7. **Footers of overlays are inconsistent**: Record payment = [Post][Cancel] left-aligned; Deal drawer =
   [Create] left … [Close & keep draft][Discard] right; Discard dialog = [Keep editing] … [Discard] right.
   Convention (established by the dominant pattern and kept): **primary action first on the left, secondary
   next to it, destructive/dismiss actions pushed to the end with `ds-grow`**. Confirm dialogs keep
   [Cancel] … [Confirm]. Apply consistently.
8. **Execution tray** ("2 running · Detail") permanently takes 40px at the bottom of every screen even when
   it carries nothing actionable; collapse to a slim chip when nothing is running.

## 3. Design direction (non-negotiable)

- Keep Arlovi's identity: Seafoam brand, Chromatic Studio accents (iris, citrus, coral, seafoam), the pink
  selection pop, the provenance edge, Hanken Grotesk light display type, IBM Plex Mono figures.
  Executive Home (`/o/northline/hq/home`) is the visual reference for personality.
- Colourful, energetic, premium, compact. No generic grey dashboards, no glowing gradients, no oversized
  rounded rectangles. Colour has a purpose (app identity, status, provenance, data).
- **The current 0–100 scale model stays. 100 = the `--interface-scale: 0.8` baseline.** Never change
  `--interface-scale`; change token values and component rules instead. Every change must look right at
  scale tiers small/default/large (`:root[data-scale-tier]`).
- Compact ≠ cramped: reduce page length and dead space; do not squeeze complex tasks into tiny panels.
- Unified foundations, distinctive applications. Do not make every app look identical.
- Honest provider boundaries. Never fake sends, payments, publishes, syncs, model calls.

## 4. Architecture facts every worker relies on

- Screens are declared per application in `src/applications/<code>/index.tsx` via `registerApp()`;
  a `ScreenDef` has `tabs`, `actions`, `overlays`, optional `surface`, `header`, `inspector`,
  `statusStrip`, `chrome: "full"`. `src/app/ScreenHost.tsx` renders them; `OverlayDef.kind` is
  `modal | drawer`, `width` sets `--modal-w`/`--drawer-w`.
- Shared design system: `src/design-system/` (`tokens.css`, `base.css`, `components.css`,
  `interface-scale.css`, `drawer-experience.css`, `modal-experience.css`, `primitives.tsx`, `overlays.tsx`,
  `fields.tsx`, `tabs.tsx`, `data-grid.tsx`, `charts.tsx`). Shell: `src/app/shell.css`, `AppShell.tsx`.
- Overlay helpers already exist: `ModalActions`, `DrawerActions` (portal actions into the footer),
  `ModalUnsavedChanges` / `DrawerUnsavedChanges`, `ModalInFlight` / `DrawerInFlight`, `OverlayCancel`,
  `ConfirmModal`, `Menu`, `Popover`. Orientation header: `OverlayOrigin`, `OverlayRecordContext`
  (`src/app/OverlayExperience.tsx`).
- Data: Dexie/IndexedDB; `useCollections`, `useRecord`, `mutate.patch` merges fields; records are
  organisation-scoped. Time via `clockNow()/clockIso()/wallMs()` from `@/platform/clock` (lint forbids
  `new Date()` / `Date.now()` in `src`). Keep HANDOFF.md rules 1–8.
- Tests: `tests/unit/*.test.ts` (vitest), `e2e/*.spec.ts` (Playwright, Chromium at
  `/opt/pw-browsers/chromium`). Dev server shared by all workers at `http://127.0.0.1:5173`
  (already running — do not start another). Production preview of the *baseline* at
  `http://127.0.0.1:4173` for before/after comparison.
- Scratchpad for screenshots and notes:
  `/tmp/claude-0/-home-user-Arlovi/daed2018-a12a-57d1-8b2e-76408c85a8ca/scratchpad/` (baseline shots in
  `shots/before/`). Workers write their evidence under `shots/<package>/`.

## 5. Teams, ownership and shared contracts

### Phase 1 — foundations (run first, in parallel)

| Package | Owner | Owns (exclusive write) | Delivers |
| --- | --- | --- | --- |
| **F-A Overlay foundations** (Team A lead) | Sonnet | `src/design-system/overlays.tsx`, `drawer-experience.css`, `modal-experience.css`, new `src/design-system/overlay-kit.tsx` + `overlay-kit.css`, `src/app/OverlayExperience.tsx`, `native-overlay-experience.css`, the Overlays section of `components.css` (`.ds-overlay*`, `.ds-modal`, `.ds-drawer`, `.ds-popover`, `.ds-menu-*`, `.ds-toast*`) | `OverlaySection`, `FactGrid`, `OverlaySummary`, `OverlayActions` (left-primary convention), consistent sizes (`width` presets: `compact 440`, `form 520`, `record 640`, `wide 760`), menu/popover grammar, motion + reduced motion, toast stack cap & layout |
| **F-B Page & shell foundations** (Team B lead) | Sonnet | `src/app/shell.css`, `src/app/AppShell.tsx` (toast arrival logic + heading focus only), `src/design-system/base.css`, `tokens.css`, `interface-scale.css`, `primitives.tsx`, `fields.tsx`, `tabs.tsx`, `data-grid.tsx`, the non-overlay sections of `components.css`, new `src/design-system/page-kit.tsx` + `page-kit.css`, `src/app/ExecutionTray.tsx` + css | compact page head, typography hierarchy, `RecordHeader`, `PageSection`, `SectionNav`, `KeyValueList` density, stat tile density, table density, empty/loading states, toast flood fix, h1 focus ring fix, execution tray collapse |

Shared contract names are fixed now so application workers can import them from `@/design-system`:

```ts
// overlay-kit (Team A)
OverlaySection({ title, hint?, actions?, tone?: "neutral"|"warning"|"danger"|"info"|"success", flush?, children })
FactGrid({ items: { label; value; mono?; tone?; hint? }[], columns?: 2|3|4, dense? })
OverlaySummary({ eyebrow?, title, status?: ReactNode, meta?: ReactNode[], avatar?: ReactNode, actions? })
OverlayActions({ primary, secondary?, end? })   // renders [primary][secondary] … [end]
// page-kit (Team B)
RecordHeader({ eyebrow?, title, subtitle?, status?, meta?: ReactNode[], avatar?, actions?, tabs? })
PageSection({ title, hint?, actions?, children, flush?, span? })
SectionNav({ items: { id; label; count? }[], value, onChange })  // in-page section switcher
KeyValueList({ items: { label; value; mono? }[], columns?: 1|2 })
```

### Phase 2 — application waves (after foundations land; each worker owns only its app folders)

| Package | Applications (folders under `src/applications/`) | Focus |
| --- | --- | --- |
| W1 Money | `fin`, `proc` | invoice/bill/PO inspectors, approvals, ledger forms, payables |
| W2 Revenue | `crm`, `commerce`, `book`, `market` | contact/company/deal panels, orders, bookings, campaigns |
| W3 People & service | `hr`, `care`, `comms`, `legal` | employee profile, cases, conversations, matters |
| W4 Operations | `project`, `hq`, `inbox`, `admin`, `portal` | task/project panels, Executive Home polish, approvals, permissions |
| W5 Intelligence | `ai`, `brain`, `team`, `mission`, `auto` | conversation, knowledge, agent, mission and workflow panels |
| W6 Platform | `analytics`, `connect`, `it`, `forms`, `asset`, `web`, `build` | reports, connections, incidents, forms, assets, sites, builder |
| W7 Studio | `docs`, `sheets`, `present`, `design`, `photo`, `layout`, `video`, `motion` | editor inspectors, export/share dialogs, library screens |
| W8 Workspace shell | `src/app/*` except files owned by F-B | workspace home, apps directory, command palette, attention centre, profile menu, display preferences |

Every Phase 2 worker: audits every screen and every overlay of its apps, records a disposition per overlay
(Refined / Enhanced / Restructured / Rebuilt / Verified) in `docs/implementation/ui-ux-dispositions/<package>.md`,
implements improvements, keeps functionality connected to real data, and verifies in the browser.

### Shared QA & review

- QA baseline (Phase 0) and QA regression (Phase 3): Playwright suites, a11y, viewport, visual sweep.
- Opus HR / delivery director: staffing, structured review findings per package, acceptance.

## 6. Delegation contract (every worker brief includes these)

1. Objective and why it matters. 2. Exclusive file ownership (listed above). 3. Reference patterns to compare
against (Executive Home, Finance invoice detail, Record payment modal, People employee profile).
4. Acceptance criteria (§8). 5. Tests to run: `npm run typecheck`, `npm run lint`, relevant
`npx vitest run <file>`, relevant `npx playwright test e2e/<spec>` against the shared dev server, and
screenshots before/after at 1440×900 and 390×844 into the scratchpad. 6. Handoff: files changed, dispositions,
evidence paths, untested areas, blockers. 7. Never edit files outside ownership; request changes through the
orchestrator. 8. No new dependencies. 9. No fabricated completion; provider boundaries stay honest.

## 7. Ledger (updated as packages land)

| Package | Status | Evidence |
| --- | --- | --- |
| Phase 0 baseline | done | §1, scratchpad `shots/before/` |
| F-A | not started | |
| F-B | not started | |
| QA baseline | not started | |
| W1–W8 | not started | |

## 8. Definition of done per component

Purpose clear · information appropriate · design language · correct dimensions · consistent spacing and
type · every visible action behaves · validation and failure states · permissions within the available
architecture · loading and empty states · keyboard and touch · responsive verified · scale tiers supported ·
data operations correct · compared with the strongest related Arlovi experience · not underdeveloped ·
regression tests pass or outstanding failures documented · reviewed and accepted.
