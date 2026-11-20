# Application-wave worker brief (Phase 2)

You are a Sonnet specialist on one package (W1–W8) of the Arlovi UI/UX refinement programme. Read, in
order: `docs/implementation/UI_UX_REFINEMENT_PROGRAMME_2026-11-19.md` (all), this file, then the
inventory files for your applications in `docs/implementation/ui-ux-dispositions/inventory/<APP>.md`.
Work in `/home/user/Arlovi` on the current branch. Do not commit, branch, or add dependencies.

## Ownership

You may edit only `src/applications/<your app folders>/**`, `src/domain/seeds/<your apps>.ts` only if a
seed must change to exercise a real flow (avoid), tests that target your apps (`tests/unit/*<app>*`,
`e2e/*<app>*`), and your disposition file `docs/implementation/ui-ux-dispositions/<package>.md`. Shared
files (`src/design-system/**`, `src/app/**`, `src/platform/**`) are owned by others: if you need a change
there, write it under "Requests to the orchestrator" in your report instead of editing.

## Shared primitives you must use (already landed in `@/design-system`)

Overlay kit: `OverlaySection`, `FactGrid`, `OverlaySummary`, `OverlayActions`, `OVERLAY_WIDTH`,
plus existing `ModalActions`/`DrawerActions`, `ModalUnsavedChanges`/`DrawerUnsavedChanges`,
`ModalInFlight`/`DrawerInFlight`, `OverlayCancel`, `ConfirmModal`, `Menu`, `Popover`.
Page kit: `RecordHeader`, `PageSection`, `SectionNav`, `KeyValueList`, plus `Card`, `StatRow`/`Stat`,
`DataGrid`, `Tabs`, `Empty`, `Notice`, `Pill`, `Meter`, `Avatar`, fields.
Read their source once (`src/design-system/overlay-kit.tsx`, `page-kit.tsx`) before using them.
Footer convention: primary action first (left), secondary beside it, destructive/dismiss pushed to the end.
Width presets: compact 440 (confirmations, small forms), form 520, record 640 (record drawers with tabs or
tables), wide 760 (comparisons, matrices). Never leave a 640 drawer with a five-field form in it.

## Method, per screen and per overlay

1. Open the screen in the shared dev server (`http://127.0.0.1:5173/o/northline/...`, add
   `?clock=2026-11-14T09:30:00Z`); open every tab; open every overlay (`?overlay=<id>` deep link works for
   most; otherwise trigger it from the UI). Compare with the strongest related Arlovi screen named in your
   package brief and with Executive Home.
2. Decide the disposition: **Refined** (visual/interaction polish), **Enhanced** (missing information,
   relationships or actions added using real records and existing mutations), **Restructured**
   (hierarchy/layout reorganised, sections, tabs, SectionNav), **Rebuilt** (wrong interaction pattern
   replaced), **Verified** (already meets the bar; say why).
3. Implement. Rules: use real records/domain functions; no fake success; provider boundaries honest; keep
   organisation scope and revision-checked writes; keep `?overlay` deep links working; keep every contract
   overlay id, tab id and action id (the registry contract test enforces them).
4. Remove filler: descriptive sentences that restate the title, duplicated identity blocks, empty cards that
   exist to fill a grid. Reduce page length with sections/SectionNav/master-detail where a page scrolls
   more than ~2 viewports with mostly repeated structure.
5. Dense but readable: amounts/ids/dates mono and tabular; statuses as `Pill`; related records as links
   that preserve journey context (`context.navigate` + existing journey infra; never `window.location`).
6. Verify in the browser at 1440×900 and 390×844 (and one pass with
   `document.documentElement.dataset.scaleTier="large"`): no horizontal overflow, no double scrollbars, no
   clipped controls, keyboard reachable, Escape/outside-click guarded when dirty.

## Design craft (applies to every screen and overlay you touch)

Arlovi's visual system is fixed (tokens, type, selection pop, provenance edge). Your freedom is in how each
application expresses itself inside it. Use it deliberately:

- **One signature per application.** Decide, and write at the top of your disposition file, the single
  characteristic device each of your apps is remembered by (Finance: ledger figures and the reconciliation
  rhythm; People: the person and their lifecycle; Projects: dependency and time; Care: the clock against the
  SLA; etc.). Spend expressive colour and graphic emphasis there and keep everything around it quiet.
- **Structure encodes meaning.** Eyebrows, numbering, dividers, section order and tab order must say
  something true about the content (a real sequence, a real hierarchy, a real grouping). Remove devices
  that only decorate.
- **Typography carries hierarchy, not size inflation.** Use the platform's 6-step hierarchy; amounts, ids,
  dates and codes in mono tabular figures; never introduce ad-hoc font sizes.
- **Copy is design material.** Sentence case, plain verbs, controls named for what happens ("Post the
  receipt", "Approve the leave"), the same verb through the flow (button → toast → history). Empty states
  invite the next action; errors say what went wrong and how to fix it, without apology or vagueness.
  Delete sentences that restate the title or describe the page to itself.
- **Motion only where it explains** (a drawer arriving, a section expanding, a row confirming a save).
  Reduced motion respected. No ambient effects.
- **Mirror check before you report:** look at your own after-screenshots and remove one thing from each
  screen that is not earning its place.

## Required evidence before reporting

- `npm run typecheck` and `npm run lint` green.
- `npx vitest run tests/unit/registry-contract.test.ts` plus unit tests touching your apps green.
- `npx playwright test <specs for your apps>` (list them in the report) green against the shared dev
  server; if a test encoded an intentionally improved behaviour, update it and state why.
- A Playwright screenshot script saving before (preview `http://127.0.0.1:4173`) and after (dev 5173)
  images for at least 6 representative screens/overlays into the scratchpad `shots/<package>/`.
  Look at your own after-images with the Read tool; fix what looks wrong.
- Disposition file completed: every overlay of every screen in your apps has a disposition row; every screen
  has a short page review (worked well / deficient / compared with / changed / why / new functionality /
  tested).

## Report (≤700 words)

Files changed · dispositions summary (counts per outcome) · the 5 most significant improvements with
routes · functional changes (what mutation/flow was added or fixed) · tests run with counts · screenshot
paths · untested areas · requests to the orchestrator · risks.
