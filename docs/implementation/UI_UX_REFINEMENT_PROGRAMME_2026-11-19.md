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

### Phase 2 — application packages (HR-approved split, 19 Nov)

Sized from measured TSX lines and catalogue overlay counts (one worker handles ≈10k lines / 60–80 overlays).
Maximum 7 application workers at once plus one standing reviewer. Wave A starts when F-A and F-B land;
Wave B is a rolling queue, each package taking the slot freed when an A package is accepted.

| Pkg | Applications (folders) | Also owns | Size |
| --- | --- | --- | --- |
| A1 | `fin` | `shared/operational-surfaces.*` | 9.7k / 41 overlays |
| A2 | `proc`, `commerce` | | 8.6k / 67 |
| A3 | `crm`, `book` | | 10.8k / 57 |
| A4 | `hr`, `legal` | | 9.7k / 54 |
| A5 | `hq`, `project`, `inbox` | | 10.2k / 82 |
| A6 | `market`, `comms` | | 9.7k / 69 |
| A7 | `admin` + workspace shell (`src/app/*` not owned by F-B/F-A) | | 11.3k / 33 + shell |
| B1 | `docs`, `sheets`, `present` | | 12.2k / 67 |
| B2 | `design`, `layout` | `visual/` | 8.6k / 45 |
| B3 | `photo`, `video`, `motion` | | 10.5k / 60 |
| B4 | `web`, `build` | | 9.2k / 63 |
| B5 | `connect`, `it`, `forms` | `t6kit/` | 10.7k / 75 |
| B6 | `auto`, `analytics` | | 11.4k / 54 |
| B7 | `care`, `portal`, `asset` | | 9.8k / 63 |
| B8 | `ai`, `brain` | `t2_shared/` | 7.6k / 61 |
| B9 | `team`, `mission` | | 7.3k / 66 |

A package that uses a kit owned by another package files a request instead of editing the kit. Cross-app
e2e specs (`crm-finance-handoff`, `full-visual-audit`, `native-overlay-experience`, `modal-experience`,
`drawer-experience`, `deep`, `workflows`) are owned by QA.

Every Phase 2 worker: audits every screen and every overlay of its apps, records a disposition per overlay
(Refined / Enhanced / Restructured / Rebuilt / Verified — a Verified row needs a one-line reason and a
screenshot path) in `docs/implementation/ui-ux-dispositions/<package>.md`, implements improvements, keeps
functionality connected to real data, and verifies in the browser. If more than 40% of a package's rows are
Verified/Refined, the reviewer opens 10 of those overlays at random.

Contract corrections adopted: `ScreenDef.record` renders `RecordHeader` as the page head (title = h1);
`OverlaySummary` goes through the overlay `head` slot and replaces `OverlayRecordContext`; `OverlayActions`
has `variant: "form" | "confirm"`; one shared `Fact` type for `FactGrid` and `KeyValueList`; width presets
stay numbers; `SectionNav` keeps its state in the URL and is never a second tab layer.

### Shared QA & review

- QA baseline (Phase 0) and QA regression (Phase 3): Playwright suites, a11y, viewport, visual sweep.
- Standing reviewer R (Sonnet, never writes app code) reviews every package; Opus HR accepts each package
  after opening ≥15% of its overlays at random via `?overlay=`.
- Finding format (one line each):
  `ID PKG-NNN | S1 blocker / S2 major / S3 minor / S4 nit | route + overlay id + file:line | viewport/tier | defect (evidence path) | required correction | verify by`
- Acceptance: no open S1/S2; ≤5 S3 each logged in the disposition file; gates green.

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
| F-A overlay foundations | integrated (commits 9ee8367, ed8bc77) | typecheck pass; 824 unit tests pass incl. `tests/unit/overlay-kit.test.ts`; modal/drawer/native-overlay/toast specs pass except pre-existing `drawer-experience.spec.ts:48` (assigned to A1); shots `shots/F-A/` |
| F-B page & shell foundations | integrated (commit 5f0169b) | page body top 172.7px → 123.1px on Finance invoices at 1440×900; h1 43.2px → 25.6px; Executive Home toasts 4 → 0; a11y spec 37/37 (baseline had many contrast failures); 5 pre-existing failures remain (display-scale ×3, display-scaling ×1 → A7; execution-preflight ×1 → QA); shots `shots/F-B/` |
| QA baseline | done | `ui-ux-dispositions/QA_BASELINE.md`: 627 Playwright tests on the untouched build; 427 pass, 164 fail, 36 skipped. 92 failures are environmental (tests import `/src/platform/repo.ts`, which only a Vite dev server serves — later gates run on the dev server). 38 persistent pre-existing failures, classified: outdated expectations (home h1 text, 'AI work assignments' heading, 'explicit deny'), one product defect (deep CRM 'Create a quote' React error), the rest unclear (display-scale slider, profile menu, favourites, drawer-experience, workflows WF-01/06/11/13/19/20, roster specs). a11y contrast unstable across runs. |
| A1 Finance | ACCEPTED (R corrections + HR return fixed: tax configuration predicate, validator tone, issued date) | ~62 rows: Rebuilt 3, Restructured 17, Enhanced 11, Refined ~21, Verified 5; Finance specs 16/16 on dev; `shots/A1/` |
| A2 Procurement + Commerce | ACCEPTED after corrections (3cce3de + corrections) | 115 rows: Rebuilt 11, Restructured 39, Enhanced 5, Refined 60; S1 phone-width count inputs fixed with e2e proof; 29 write handlers honour revision conflicts; `shots/A2/`, `shots/R-A2/` |
| A3 CRM + Bookings | ACCEPTED after corrections (workflow designer, closure evidence, one invoice rule, seed link) | 89 rows: Enhanced 24, Restructured 8, Rebuilt 5, Refined 38, Verified 14; `shots/A3/` |
| A4 People + Legal | ACCEPTED after corrections (37ba8f2, d4812e1) | 81 rows; review S2s fixed (leave requester name, sign authorization gating); `shots/A4/`, `shots/R-A4/` |
| A5 HQ + Projects + Inbox | ACCEPTED after corrections | 127 rows; S2s fixed (dependency removal confirmed; approval bound to target revision); summaries moved to head slot; `shots/A5/`, `shots/R-A5/` |
| A6 Marketing + Communications | ACCEPTED (R corrections + HR return fixed: unattributed orders and over-claim ratio) | 96 rows; launch blocked state, one email navigation layer, footers, loading state, failure toast; `shots/A6/`, `shots/A6-fix/`, `shots/R-A6/` |
| A7 Administration + shell | ACCEPTED after corrections (footers via OverlayActions, guards, head slot, home counts settle) | 51 admin rows + 8 shell surfaces; shell QA failures fixed (profile menu, favourites, display scale, access experience, AI work assignments); `shots/A7/`, `shots/R-A7/` |
| B2 Design + Layout | ACCEPTED after corrections (stroke in inspector, hand-offs, v1 publish, token names, one h1) | 54 rows: Rebuilt 8, Restructured 13, Enhanced 5, Refined 16, Verified 12; specs 11/11; `shots/B2/` |
| B4 Web + Build | ACCEPTED after corrections (honest dispositions, migration diff, builder bar) | 98 rows; rollback now restores the model; specs 18/18 + 3/3; `shots/B4/` |
| B5 Connect + IT + Forms | ACCEPTED after corrections | 125 rows; t6kit footer convention and picker fix; specs 19/19 + 3/3; `shots/B5/` |
| B1 Docs + Sheets + Present | ACCEPTED after corrections (clean duplicates, inspector hand-offs, editors own h1, phone toolbar, sort preview) | 102 rows; popover tools, change preview, libraries; 47/47 specs; `shots/B1/` |
| B3 Photo + Video + Motion | ACCEPTED after corrections (phone batch selection, editor sizing, easing selection, credit save) | 83 rows; render settings gate, batch collision plan, keyframe inspector, lean editor heads; `shots/B3/` |
| B7 Care + Portal + Asset | ACCEPTED (R and HR corrections done) | 105 rows; SLA clock band, scope preview per person, 49 handlers honour conflicts; `shots/B7/` |
| B6 Automation + Analytics | ACCEPTED after corrections (paused automation/organisation blocks live runs with e2e) | 86 rows; designer, replay plan, activation guard, dashboard scope and tile inspector, real CSV exports; `shots/B6/` |
| B9 Team + Missions | ACCEPTED (R and HR corrections done) | 83 rows; contract page head, honest builder steps, pause-respecting execution, deliverables table, commitTogether; `shots/B9/` |
| B8 AI + Brain | reviewed: no S1/S2; 7 S3 corrections in progress | 70 rows; `shots/B8/`, `shots/R-B8/` |
| Journey QA (Phase 3) | done | 24/24 cross-application journeys pass; native-overlay 21/21, modal 4/4, drawer 3/3, crm-finance-handoff 3/3; `workflow-results.json`, `defects.json`, screen ledger 316 verified |
| HR acceptance sample 2 (B3, B7, B9) | done | 29 overlays; B3 returned (blend picker) and fixed; B7/B9 S3s fixed; systemic: app-owned selection guards with live footers → sweep in progress |
| Integrity sweep (Phase 3 item 4) | done | ~255 ignored patch results handled across 24 folders, 49 busy flags reset in finally, 11 multi-record transactions converted to `commitTogether` (`src/applications/shared/commit.ts`); `tests/unit/write-integrity.test.ts` |
| HR acceptance sample (Opus) | done for A1–A7, B1, B2, B4, B5: 107 overlays opened, 9 accepted, A1 and A6 returned and fixed | `shots/HR/`, `scratchpad/hr/res_*.json` |
| Central fixes by orchestrator | done | `OverlayDef.summary` head slot; `ScreenDef.chromeTitle`; `EditorFrame titleLevel`; record guards carry no footer action; 15 Cancel slots corrected; tabs never shrink; `document.publish` capability; data-grid card selection; status strip wraps at 390; journey bar names the remembered tab; heading focus waits for lazy surfaces; generic hidden dialog descriptions removed; WF-05 and w2a spec labels aligned |

## 7b. Phase 3 central items (orchestrator-owned, after the last package lands)

1. DONE (d886c88): `data-grid.tsx` card layout now renders the bulk-selection checkbox per card; editable cells in card mode remain an app concern (A2's stacked `CountList` is the pattern).
2. DONE (66c1a35): `ScreenDef.chromeTitle: "surface"` lets a full-chrome editor own the page title; B1–B4 asked to adopt it.
3. Reviewed: the journey bar shows the previous application whenever the user arrived from another app; that is the cross-application continuity requirement (§B5), not a defect. `canReturnTo` scopes by organisation, role and app.
4. DONE: repository-wide write-integrity sweep (see ledger row); Finance, Procurement, Commerce, Auto, Analytics, Care, Portal, Asset, Team and Mission were fixed by their own workers.
5. DONE (d886c88): `.hq-state-line` size folded into `shell.css`.
6. Static gates DONE on the integrated branch: typecheck 0 errors; lint 0 errors/0 warnings; vitest 104 files / 829 tests; inventory; build. Playwright groups: see `ui-ux-dispositions/GATES.md` (final run in progress at the time of writing).
7. Opus HR acceptance sample (≥15% of overlays per package via `?overlay=`), final report, PR body.

## 8. Definition of done per component

Purpose clear · information appropriate · design language · correct dimensions · consistent spacing and
type · every visible action behaves · validation and failure states · permissions within the available
architecture · loading and empty states · keyboard and touch · responsive verified · scale tiers supported ·
data operations correct · compared with the strongest related Arlovi experience · not underdeveloped ·
regression tests pass or outstanding failures documented · reviewed and accepted.
