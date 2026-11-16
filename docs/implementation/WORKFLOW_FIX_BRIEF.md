# Workflow defect fix brief

The cross-application journeys in `e2e/workflows.spec.ts` found defects on screens
that pass the per-screen sweep. Each failing assertion carries a `DEFECT:` message
that states the observed fault. Fix the application, never the test.

## Rules

- Fix the root cause in the application or its seed. Do not weaken, skip or edit
  an assertion to make it pass. If you are certain an assertion is wrong (it
  contradicts the spec in `docs/arlovi`), leave it unchanged and say why in your report.
- Stay inside the files of the applications you were assigned
  (`src/applications/<code>/`, `src/domain/seeds/<code>.ts`). Do not edit
  `src/platform`, `src/app`, `src/design-system`, `src/runtime`, `e2e/`, or another
  group's application. If a fix needs a shared change, describe it in your report.
- Already fixed at platform level, so do not work around these:
  `mutate.patch` now merges `fields` (pass `{ replaceFields: true }` only to remove
  keys); `useRecord` returns the last-read copy on first render and overlays mount
  after their record is read; records from another organisation are refused.
- Figures that appear on more than one screen must come from one computation.
  Revenue recognised is net revenue from posted journals, not gross paid invoices.
- No backend. Anything that would leave the browser stops at the existing provider
  boundary. Never show a remote action as having happened.
- Do not commit or push. The orchestrator commits.

## How to run

Start your own dev server on your assigned port and point the suite at it:

```bash
npx vite --host 127.0.0.1 --port <PORT> --strictPort
```

```bash
BASE_URL=http://127.0.0.1:<PORT> npx playwright test e2e/workflows.spec.ts -g "<test name>" --workers=1
```

Before reporting: `npx tsc --noEmit -p .` and
`npx eslint src/applications/<your codes>` must be clean, and
`npx vitest run` must pass. Stop your dev server when you finish.

## Report

For each defect: the root cause (file:line), the fix, and the test result you
observed. List anything you could not fix and why.
