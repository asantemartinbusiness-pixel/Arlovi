# Handoff

Current numbers are not written here, so this file cannot go stale. Read them from
the generated evidence:

- `SCREEN_LEDGER.md` / `SCREEN_LEDGER.csv`: per-screen status, journey results, open defects
- `defects.json`: every defect the journeys found, and how each was closed
- `workflow-results.json`: the last recorded run of the cross-application journeys

Nothing in the ledger is written by hand. A screen is **verified** only when its
contract is complete, the browser sweep exercised it with no console error, its
application's actions were signed off as doing what they are named for, and no
journey defect is open against it.

## Re-running the evidence

Run against a production build, not the dev server: it is faster and it is what ships.

```bash
npx vite build --outDir /tmp/arlovi-dist
```

```bash
npx vite preview --outDir /tmp/arlovi-dist --host 127.0.0.1 --port 4173 --strictPort
```

| Evidence | Command | Writes |
| --- | --- | --- |
| Static gates | `npm run typecheck && npm run lint && npm test` | `registry-coverage.json` |
| Deep sweep (every tab, overlay, action) | `BASE_URL=http://127.0.0.1:4173 DEEP_SWEEP_OUT=<dir> npm run test:sweep` | `deep-sweep/*.json` (copy in from `<dir>`) |
| Cross-application journeys | `BASE_URL=... npx playwright test e2e/workflows.spec.ts --reporter=json > report.json` then `python3 scripts/record_workflow_results.py report.json` | `workflow-results.json`, resolves `defects.json` |
| Accessibility, contract, viewport, findings | `BASE_URL=... npx playwright test e2e/a11y.spec.ts e2e/contract.spec.ts e2e/viewport.spec.ts e2e/findings.spec.ts` | none |
| Ledger | `npm run ledger` | `SCREEN_LEDGER.md`, `.csv` |

`semantic-audit.json` is a human sign-off per application, recorded from review. It
is the one input that is not measured; re-review an application's actions before
changing its entry.

A defect in `defects.json` is closed only when its journey ran to the end and its
`DEFECT:` message no longer fires. Findings no journey asserts are closed with a
named test in `evidence`.

## Rules the code depends on

These each closed a real defect. Keep them.

1. **Screens are owned by their application.** `registerApp()` declares a screen's
   tabs, actions and overlays; `src/app/ScreenHost.tsx` renders them. There is no
   generic fallback: an unimplemented screen shows an honest "not built" notice,
   and `tests/unit/registry-contract.test.ts` keeps that unreachable.
2. **Organisation isolation.** `useRecord` returns a record only if it belongs to the
   organisation in the address, and `ScreenHost` refuses a route id from another one.
3. **Writes merge.** `mutate.patch` merges `fields`. Pass `{ replaceFields: true }`
   only to remove keys on purpose.
4. **Forms seed from loaded records.** Reads are primed (`repo.knownRecord`) and
   overlays mount after their record is read, so an edit form never saves its
   defaults over real values.
5. **Time is read in one place.** Use `clockNow()` / `clockIso()` for "when" and
   `wallMs()` for ids, undo windows and device diagnostics, all from
   `@/platform/clock`. Lint rejects a bare `new Date()` or `Date.now()` in `src`.
   `clockIso()` is strictly increasing, so audit order survives a frozen clock.
6. **One source per figure.** A number shown on two screens comes from one
   computation, with Finance as the source for money (revenue recognised is posted
   net revenue; receivable is one shared position).
7. **Provider boundaries are honest.** Send, pay, publish, file, call and model
   inference stop at a stated boundary and are never shown as having happened.
8. **Autonomy respects the pause.** A mission step never runs while the mission or
   the organisation is paused; the check lives in `executeStep`, so every entry
   point is covered.

## Design system

- Palettes and density are owned by `src/design-system/tokens.css`. The retired
  `src/styles.css` had been overriding some token values by re-declaring the same
  custom property names; removing it moved links, status text and heading spacing
  onto the design system's own values.
- Headings have zero margin by design; components own their spacing.
- `base.css` carries a zero-specificity default for plain `<table>`s. Classed tables
  (`.ds-table`, `.dx-table`, matrices) override it.
- **Type hierarchy (six steps, documented in `base.css`)**: page title `--text-title`
  (light), section title `--text-lg`, card title `--text-md` (medium), body `--text-base`,
  label `--text-xs` caps, metadata `--text-sm`. Stat figures use `--text-stat`. Applications
  inherit these through `h1-h4`, `.ds-card-head`, `.ds-stat-*`, `.ds-eyebrow`, `.ds-subtle`; never size by hand.
- **Density**: component spacing comes from `--card-pad`, `--card-head-pad-*`, `--stat-pad-*`, `--row-pad-y`,
  `--pg-head-top`, `--pg-body-top` (tokens.css). Default is compact (page head ~120px, table rows ~36px);
  `data-density="comfortable"` restores the roomier values. Never change `--interface-scale`.
- **Selection** is one pink `--selection-pop` pill for tabs, rail and nav; declared once per selector in
  `components.css` / `shell.css` (no override layers, no underlines).
- **Page kit** (`page-kit.tsx`, `.pk-*`): `RecordHeader` (single identity block; set `ScreenDef.record` and it
  replaces the page head, title becomes the h1), `PageSection`, `SectionNav` (segmented pills, `?section=` in the URL),
  `KeyValueList` (uses overlay-kit `Fact`). Add to these APIs; do not change them.
- **Notification toasts**: arrivals are ignored during a ~4s hydration grace, never toasted twice per session,
  and coalesced within 1.5s into one toast. The page `h1` takes programmatic focus after navigation without a ring.
- The execution tray is a slim bar and renders only while a mission runs or waits on a decision.

## Known limits

- **Selection-guarded actions.** The sweep cannot press actions that need a specific
  record selected. The count is in `SCREEN_LEDGER.md`; they were judged in the
  semantic review and many are exercised by the journeys.
- **Pressing is not completing.** The sweep opens what an action opens and checks for
  errors; it does not fill and submit every form.
- **External services are not connected.** No mail, payments, bank feed, tax filing,
  publishing or language model. Do not mark those actions as completed.
- **Visual quality is sampled**, not measured across every screen.
- **Owner self-approval** of a requisition is allowed and recorded as a
  self-approval. Anyone else is refused. This is a product decision to confirm.
- IndexedDB is per browser; there is no cross-device sync.
- Photo, video and motion editors are structured local tools, not desktop applications.

## Where to work next

- Add or change a screen in `src/applications/<code>/`, then a journey in
  `e2e/workflows.spec.ts` if it crosses applications.
- New records are shaped in `src/domain/create.ts`; seeds are contributed with
  `registerSeed` and topped up additively (bump `SEED_VERSION` to add records).
- A new cross-application workflow should land with a journey and a defect-register
  entry for anything it finds, not with a ledger edit.
