# Arlovi frontend — engineering brief for application modules

This is the contract every application module follows. Read it before writing code,
then read `src/applications/hq/index.tsx` — the reference implementation.

## The architecture

```
src/design-system/     tokens, primitives, data grid, overlays, charts   (DO NOT EDIT)
src/platform/          clock, org, money/tax, repo, workspace, registry,
                       policy, capability, attention                      (DO NOT EDIT)
src/app/               shell, screen host, palette, attention centre      (DO NOT EDIT)
src/applications/<code>/   YOUR application module
src/domain/seeds/<code>.ts YOUR fixtures (optional)
```

Everything a screen needs comes through the typed `ScreenContext` in
`src/platform/registry.ts`. There is no shared page renderer: a screen that is not
declared by its own application is not implemented.

## What a module must do

```ts
registerApp({
  code: "FIN", short: "Finance", name: "Finance & Accounting",
  purpose: "one short line for the app sidebar",
  icon: CircleDollarSign,          // from lucide-react, matching src/app/nav.ts
  nav: [ { label?: "Section", items: [{ label, screenId, icon? }] } ],
  screens: { "ARL-FIN-001": { ...ScreenDef }, ... },
})
```

A `ScreenDef` declares:

- `tabs` — one entry per tab in the approved contract, each rendering **its own
  panel component**. A tab must not be a text filter over the same list.
- `actions` — one entry per primary action in the contract, each with a typed
  `run(context)`. Use `placement` to separate `primary` (1–2 per screen),
  `secondary`, and `overflow`. Add `capability` for role-gated actions and
  `guard` for preconditions (returns the reason it is unavailable).
- `overlays` — one entry per overlay in the contract, each its own component
  with `kind: "modal" | "drawer"`, real fields, real validation and a real save.
- optional `surface` (replaces the page body), `inspector` (right panel),
  `header`, `statusStrip`, `chrome: "full"` for editors and consoles.

The approved contract for every screen — regions, tabs, actions, overlays, the AI
note and the edge case — is in `src/generated/catalog.json`. Read your screens from
it. The `edge` field is a requirement, not a comment: implement the behaviour it
describes (for example "unknown KPI must show age and unavailable source").

## Data

```ts
const rows = useCollection("invoices");                 // org-scoped, indexed
const data = useCollections(["invoices", "contacts"]);  // several at once
const record = useRecord(id);
const kids = useChildren(parentId);
const events = useEvents(entityId);
const mutate = useMutations(screenId);                  // create / patch / remove / putMany / log
const { org, role, actor, now, money, date, relative } = useWorkspace();
```

- Never read the whole database. Never write the whole record array.
- `mutate.patch(id, patch, { expectRevision, event })` — pass `expectRevision`
  for consequential edits so a concurrent save is caught.
- Dates: use `now` from the workspace and the helpers in `src/platform/clock.ts`.
  **No hardcoded dates anywhere.**
- Money: minor units everywhere; format with `context.money()`. For anything
  involving tax use `computeInvoice` / `resolveTaxCode` from `src/platform/money.ts`.
  Tax is never derived from currency.

## Honesty rules (non-negotiable)

- Nothing leaves the browser. Where a real product would call a provider, show the
  state from `src/platform/capability.ts` and say what was kept locally instead.
- Never fabricate a figure. If a value has no source, render it as unavailable with
  its age — `Stat` has `unavailable` for this.
- A toast is never the only evidence of a consequential action; the record must change.
- Role views shape the interface and are not an account security boundary. Say so
  where it matters; do not imply server-side enforcement.

## Quality bar

- Each application must look like itself: its own information architecture,
  its own column sets, its own inspectors and its own empty states. A finance
  ledger must not look like a marketing calendar.
- Every interactive element: hover, focus-visible, disabled, busy and error states.
- Keyboard: tabs are arrow-navigable (handled by `Tabs`), grid rows are focusable
  and respond to Enter/Space (handled by `DataGrid`), overlays trap and return focus
  (handled by `Modal`/`Drawer`). Anything you build yourself must match.
- Drag and drop must have a keyboard equivalent.
- Responsive from 320px to 1920px. Use `Grid` + `span`, which already collapses.
  Test at 390 and 1440 at minimum.
- Empty, loading, saving, error, conflict, denied and offline states are part of
  the work, not a follow-up.
- Accessible names on every icon-only control; charts carry a table equivalent
  (the design-system charts already do).

## Fixtures

If your screens need more depth than the base seed, add
`src/domain/seeds/<yourcode>.ts`:

```ts
import { registerSeed } from "@/domain/seedRegistry";
registerSeed("fin", (ctx) => ({ records: [ ctx.rec({ org: "nl", collection: "invoices", n: 20, title: "INV-1052", ... }) ] }));
```

Import it from your module's barrel. Keep ids in the `nl-<collection>-NNN` /
`hb-<collection>-NNN` shape and start at `n: 20` to avoid colliding with the base
seed. Fixtures must be plausible for a real small company — no lorem ipsum.

## Wiring

Create `src/applications/<team-barrel>.ts` that imports your modules **and your
seed files**. Do not edit `src/applications/index.ts`, another team's folder,
`src/design-system`, `src/platform` or `src/app`. If you genuinely need a new
shared primitive, build it inside your own folder and say so in your report.

## Done means

1. `npx tsc --noEmit` clean.
2. `npx eslint src` clean for your files.
3. The app runs and your screens render with no console error, checked in a real
   browser with Playwright at 1440×900 and 390×844.
4. Each screen you claim is complete has every contract tab, action and overlay
   implemented and exercised at least once.
5. Your report states, per screen, what is complete and what is not. Do not
   overstate. A screen that renders is not a screen that works.
