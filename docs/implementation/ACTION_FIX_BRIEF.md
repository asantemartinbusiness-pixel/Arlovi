# Contract action remediation brief

Read `docs/implementation/ENGINEERING_BRIEF.md` first; everything in it still
applies. This brief covers one specific defect found during integration.

## The defect

Every screen's approved contract (`src/generated/catalog.json`) lists actions,
for example `["Assign", "escalate", "merge", "resolve", "page owner"]`. Many
modules declare an action with the contract id but run a handler that does
something else, then give it an honest label describing the something else:

| Contract id | Label shown | What it actually does |
| --- | --- | --- |
| `approve` | Open the claim | opens a detail drawer; approves nothing |
| `publish` | Consent text | opens a consent inspector; publishes nothing |
| `reschedule` | Week view | switches tab; reschedules nothing |
| `assign` | Open an incident | creates an incident; assigns nothing |

The label is honest, but the contract action is not implemented. The registry
counts it as declared, so coverage looks better than it is. This pattern
started in the Headquarters reference module and spread; it is nobody's fault
in particular, and it must now be fixed everywhere.

## What you must do

Your audit file is in `docs/implementation/action-audit/<group>.json`. For each
screen it lists the contract actions and overlays, the edge-case requirement,
and every declared action with its current label, what it currently does, and
`suspect: true` where the label shares no word with the contract id.

`suspect` is a heuristic, not a verdict. Judge every declared contract action
on your screens, suspect or not, and put each into one of three classes:

1. **Implemented** — the handler genuinely performs the named action. Leave it.
   `Create` labelled "New invoice" that opens a real invoice form is fine.
2. **Reworded but genuine** — same as 1 with a different verb. Leave it, but if
   the label obscures the action, make the label say it plainly.
3. **Routed elsewhere** — the handler does something other than the action
   named. **Implement the real action.**

### What "implement" means

- A state-changing action changes the record, with `mutate.patch` /
  `mutate.create`, `expectRevision` on consequential edits, and an event
  message. `approve` sets an approved state and records who approved. `assign`
  sets an owner. `merge` merges records and keeps the evidence of both.
  `reschedule` moves dates and checks conflicts. `resolve` resolves.
- A consequential or irreversible action asks first: a modal stating the
  consequence, one principal button.
- An action that needs a selection uses `guard` to say so, rather than failing
  silently or acting on the first record.
- An action that would reach an external service (send, publish, pay, call,
  page someone, sync) **stops at the provider boundary**: it records the local
  draft or queued state and states plainly, using the vocabulary in
  `src/platform/capability.ts`, that nothing left the browser. That is a full
  implementation of the action for this frontend — do not fake success.
- Respect the screen's `edge` requirement; it is part of the contract.
- The label should name the contract action in plain words. Rewording is fine;
  describing a different action is not.

Do not throw away the useful thing the old handler did. If "Week view" or
"Consent text" was a helpful shortcut, keep it as an **additional** action with
its own id (actions beyond the contract are allowed) and give the contract id
to the real implementation.

### Overlays and tabs

Apply the same judgement to each contract **overlay**: it must render what its
name says. An overlay registered as `test report` that renders an unrelated
"metric methods" component is a defect of the same kind. Likewise each contract
**tab** must render content specific to that tab, not the same panel again.

### Id mismatches

Ids must match the contract exactly, including case. Known ones in your scope
are listed under `missingActions` in your audit file (for example `compare`
declared where the contract says `Compare`).

## Rules of engagement

- Edit only your own application folders, their seed files, and new files you
  create inside them. Do not edit `src/design-system`, `src/platform`,
  `src/app`, `src/applications/index.ts` or another group's folders.
- **Do not run any git command.** Several agents share this working tree; the
  orchestrator commits. No commit, stash, reset, checkout or clean.
- A Vite dev server is running at `http://127.0.0.1:5173`. Use it; do not start
  another on that port.

## Done means

1. `npx tsc --noEmit --pretty false` reports no error in your paths.
2. `npx eslint` is clean on your folders.
3. `npx vitest run tests/unit/registry-contract.test.ts` passes for your apps.
4. In a real browser (Playwright, `chromium.launch({ args: ["--no-sandbox"] })`)
   you clicked every action you changed and confirmed its effect — a record
   changed, a confirmation appeared, a boundary was stated — with no console
   error. Use `?clock=2026-11-14T09:30:00Z` on URLs for a deterministic clock.
5. Your report lists, per screen, each contract action with its class (1, 2
   or 3) and, for class 3, what it does now. List any overlay or tab you fixed.
   Be accurate. A wrong "implemented" is worse than an honest "not done".
