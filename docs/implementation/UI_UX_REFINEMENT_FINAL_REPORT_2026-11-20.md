# Arlovi · Full-platform UI/UX refinement — final report

20 November 2026 · Branch `claude/arlovi-ui-ux-refinement-4qadu0` · PR asantemartinbusiness-pixel/Arlovi#88 · Base `main` @ 456c87d

Companion documents: programme brief and ledger
(`UI_UX_REFINEMENT_PROGRAMME_2026-11-19.md`), per-package dispositions and inventories
(`ui-ux-dispositions/`), QA baseline (`ui-ux-dispositions/QA_BASELINE.md`), final gates
(`ui-ux-dispositions/GATES.md`).

## 1. What was delivered

Every one of the 35 native applications, 316 screens and 957 catalogue overlay entries was
reviewed by an application specialist, given a disposition, refined where needed, and then
independently reviewed by a reviewer who never wrote application code and sampled by the HR/delivery
director. The work shipped as two shared foundations followed by sixteen application packages,
plus repository-wide integrity passes.

### Shared foundations (owned centrally)

- **Page system.** Compact page head (first content on Finance invoices moved from 173 px to 123 px
  below the shell header; page titles from 43 px to 26 px rendered), a six-step type hierarchy,
  density tokens, `RecordHeader` as the page head for record pages (`ScreenDef.record`),
  `PageSection`, `SectionNav`, `KeyValueList`, slimmer execution tray, consolidated selection styles,
  subtle-text contrast raised so the accessibility sweep passes.
- **Overlay system.** `OverlaySection`, `FactGrid`, `OverlaySummary`, `OverlayActions`, numeric
  width presets (compact 440 · form 520 · modal 560 · record 640 · wide 760), the
  `OverlayDef.summary` head slot, one footer convention (primary first, dismiss at the end; confirm
  dialogs `[Cancel] … [Confirm]`), overlays focus their first field on open, menus and popovers with
  a shared grammar, restrained motion with reduced-motion support, toast stack capped at three.
- **Shell.** Toast flood on first load fixed (four toasts → none) by a hydration grace window and
  coalescing; focus still moves to the page title on route change but no longer paints a ring;
  the journey bar names the remembered tab; status strips wrap at phone width; tabs never shrink
  below their labels; editors can own the page title (`ScreenDef.chromeTitle: "surface"`,
  `EditorFrame titleLevel`); a record guard ("choose a record first") never carries a live action,
  including when the required record does not resolve in the organisation.
- **Data grid.** Phone card layout keeps bulk selection.
- **Provider boundaries.** A `document.publish` capability so deliverables and documents no longer
  borrow website-hosting copy; per-use "kept locally" copy on `ProviderBoundary`.

### Application packages (all accepted)

| Pkg | Applications | Highlights |
| --- | --- | --- |
| A1 | Finance | Invoice as page head with ledger provenance; payment modal leads with the blocked state; per-line editor usable on a phone; reconciliation equation card; void, credit note, payment run and reimbursements as single revision-checked transactions with stale-revision tests; tax configuration and page agree |
| A2 | Procurement, Commerce | Five-stage request-to-payment chain; receiving scan with live read-outs; phone-usable count lists; refund stages that never claim a processor receipt; record headers for orders, products, suppliers |
| A3 | CRM, Bookings | Deal drawer at form width with probability, weighted value, context and activity; closure blocks on every open evidence row; one invoice rule across the deal page; workflow designer loads the saved rule; bookings deposit ledger; calendar capacity strip |
| A4 | People, Legal | Employee, candidate and contract pages as record heads with at-a-glance cards; leave decisions name the right person; signing only on an approved contract; payroll evidence vs estimates; legal hold and e-sign act on a named record |
| A5 | HQ, Projects, Inbox | Executive Home polished and kept as the reference; board task inspector; task detail with a facts column; approvals bound to the target revision with evidence first; dependency removal confirmed |
| A6 | Marketing, Communications | One email navigation layer; honest send confirmation; campaign as record head with an eight-step launch checklist that blocks launch; unattributed orders counted from touches, over-claims shown |
| A7 | Administration, workspace shell | Situation-statement home with settled counts; role impact with gained/lost capabilities, reason and audit preview; emergency revoke lists affected sessions; profile menu, favourites, display dialog and access specs restored |
| B1 | Documents, Sheets, Presentations | Editor tools as anchored popovers with one undo step each; publish never claims a public URL; sheets change preview before destructive writes; libraries with count strips and table/cards; clean duplicates |
| B2 | Design, Layout | Lean editor heads; constraints, colour-token and shortcut popovers; component publishing diffs against a snapshot with breaking-change acknowledgement; overset chip with a real fix; computed preflight |
| B3 | Photo, Video, Motion | Render settings gate before any render; batch planning that never overwrites; keyframe inspector follows the selection; phone-usable batch selection; blend picker targets a layer with a blend mode |
| B4 | Web, Build | Slim builder bar with popover tools; honest publish review; rollback that truly restores the model behind a confirm; masked secrets; compact status strips instead of heroes |
| B5 | Integrations, IT, Forms | Connector pages read consent and scope state from the register; incident head with severity, stage and elapsed clock; compact forms builder with a sectioned field inspector; act kit adopts the footer convention |
| B6 | Automation, Analytics | Three-column designer; replay plan honest about provider boundaries; a paused automation or organisation blocks live runs (tested); dashboard scope strip and tile inspector; CSV exports carry real values |
| B7 | Customer Care, Portals, Assets | SLA clock first on cases; resolution and escalation require evidence; portal scope preview per person and record; publish checklist; asset replacement as one validated transaction |
| B8 | Ask Arlovi, Company Brain | Mission authorisation around the AI employee, tools, scope and human approval; facts with source age and evidence trail; side-by-side conflict comparison; resolution creates an assertion when the winner has none |
| B9 | AI Workforce, Missions | Contract as page head; honest builder steps; execution respects pauses and says accepted actions cannot be confirmed there; deliverables table; evidence from a picker of real records |

### Integrity passes

- Repository-wide sweep: about 255 write handlers that ignored a revision-conflict result before a
  success message now check it; 49 busy flags reset in `finally`; 11 multi-record writes converted to
  one `commitTogether` transaction (`src/applications/shared/commit.ts`), plus the per-package fixes
  (Finance 27, Procurement/Commerce 29, Care/Portal/Asset 49, Team/Mission 37, AI/Brain 49,
  Automation/Analytics all).
- Selection-guard sweep: 24 overlays that rendered their own "select something first" state while
  keeping a live primary action now use the shared guard or disable their footer.

## 2. Verification

| Gate | Result |
| --- | --- |
| Typecheck, lint, unit tests, inventory, build | all pass on the integrated branch (§2a) |
| Cross-application journeys | 24/24 pass (`workflow-results.json`); overlay suites: native-overlay 21/21, modal 4/4, drawer 3/3, crm-finance-handoff 3/3 |
| Screen ledger | 316 screens verified (`SCREEN_LEDGER.md`, regenerated) |
| Playwright gate (all groups, dev server, `--workers=2`) | 630 tests: 616 pass, 11 deterministic failures, 3 skipped (`ui-ux-dispositions/GATES.md`). Against `QA_BASELINE.md` (427/627 on the untouched build): 36 of the 38 persistent pre-existing failures now pass, all 92 environmental ones pass, the a11y sweep is clean, the deep sweep's CRM React error and renderer crashes did not recur. The 11 were then closed: 2 regressions fixed in product (role-picker keyboard selection, nested button in grid cards), 1 accessibility gap fixed in product (docs editor h1 text), 8 stale expectations aligned; re-runs 27/27 on the five affected specs, deep DOCS/DESIGN/LAYOUT/MISSION pass, and a smoke of the grid-card consumers 37/37 |
| Independent review | 16 of 16 packages reviewed by R with one-line findings; every S1/S2 fixed; S3s fixed or logged within the ≤5 limit per package |
| HR acceptance samples | 3 samples, 165 overlays opened at random; 16 of 16 packages accepted (A1, A6, B3, B8 after one returned defect each) |
| Browser evidence | before/after screenshots per package in the session scratchpad (`shots/<pkg>/`, `shots/R-*/`, `shots/HR*/`); not committed |

### 2a. Static gates (final run on the integrated branch)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass, 0 errors |
| `npm run lint` | pass, 0 errors, 0 warnings (the baseline's one warning and two added directives removed) |
| `npm test` (vitest) | 104 files, 829 tests pass (baseline 824; new: overlay kit, write integrity, mission tags, finance/mission/B3 specs' unit companions) |
| `npm run verify:inventory` | pass |
| `npm run build` | pass (`verify-native-chunks`, `tsc`, `vite build`, bundle report) |

## 3. What this is not

- Not a backend change. All records remain browser-local (IndexedDB). Role views are presentation
  guards; send, pay, publish, file, sync and model calls stop at stated provider boundaries.
- Not deployed. The branch is a reviewable pull request; production deployment follows the existing
  Vercel process after review and merge.
- Visual review was sampled by reviewers and the HR director, not measured on all 957 overlays by a
  human; the disposition files record what each worker opened and what remained unopened.

## 4. Residual risks and known limits

- Large-scale-tier passes were done by setting the tier attribute; the live slider path was verified
  by the display-scale specs only.
- Several overlays can only be exercised with a selected record; deep links show the shared guard.
- Seed data is sparse in places (for example no seeded order carries a campaign touch, so Marketing
  attribution honestly reports every order as unattributed).
- A few HR-noted S4 items are logged in the disposition files and not fixed (for example overlay
  breadcrumb spelling now follows the page title, but a handful of lists still show dense dark cards).

## 5. Highest-value next actions

1. Merge after review and run the production smoke on `/o/northline/hq/home`, Finance invoices,
   CRM deals, People employee profile and the Docs editor.
2. Enrich seeds (campaign touches on orders, a deposit-bearing booking, a pixel-layer default in the
   sample photo) so the enhanced panels show their full behaviour out of the box.
3. Promote `commitTogether` into `src/platform` and lint for ignored write results so the integrity
   pattern cannot regress.
