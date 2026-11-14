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

---

# Visual identity

The brand hues are fixed by the approved direction: Electric Cobalt `#234FE8`,
Papaya `#FFAE7C`, Aqua `#36C5BA`. Everything below is how they are used.

## Neutrals are warm

The canvas is paper (`#F6F4F0`), not blue-grey, and the ink is graphite
(`#1A1917`). On a warm ground cobalt reads as ink in a pen rather than as a
default interface blue, and papaya and aqua become annotation colours — the
role the brand direction gives them. Dark appearance is warm graphite, not navy.

Never hardcode a colour. Every value is a token in `src/design-system/tokens.css`.

## Three typefaces, three jobs

| Role | Face | Used for |
| --- | --- | --- |
| Display | IBM Plex Sans Condensed | headings, tabs, stat labels that are words |
| Data | IBM Plex Mono | money, quantities, dates, codes, identifiers, eyebrows, status pills |
| Body | Inter | everything you read as a sentence |

Headings pick the display face automatically. For figures use `.ds-num` or the
`Stat` component; do not set a face by hand. Plex was drawn as an identity for
the relationship between people and machines, which is what this product is
about — that is why it is here rather than a fashionable serif.

## The signature: provenance as a material

Anything that asserts a fact says where the fact came from, as a 2px material
on its leading edge.

| Material | Meaning |
| --- | --- |
| solid ink | posted — already in the books, immutable |
| solid cobalt | made by a person in this workspace |
| aqua hatch | made by an AI employee |
| dashed amber | no source, or a source too old to trust |

```tsx
<Stat label="Receivable" value={money(total)} prov="posted" meta="4 open invoices" />
<Card eyebrow="AI workforce" prov="agent" title="Active missions">…</Card>
<Card eyebrow="Decisions" prov="human" title="Waiting on you">…</Card>
```

Rules that keep it meaningful:

- Provenance means **source**, never status. An overdue invoice is still
  `posted`; its lateness is carried by its status pill and row tone.
- Use it on cards, stats and records that state a fact. Never on navigation,
  chrome, buttons or decoration.
- Table rows use `rowTone` for status instead, so the two devices never stack.
- `unavailable` on a `Stat` defaults the material to unknown, so a figure with
  no source is visibly untrustworthy before it is read.

## Gradients mean machine

The signature gradients appear only where an AI employee is actually working —
`<Card machine>` and agent surfaces. A gradient is never decoration, so when
one appears it carries information.

## Eyebrows name the kind of thing

`.ds-eyebrow` or `<Card eyebrow="…">` sets a short mono label above a title.
Use it to say what a panel *is* (`LEDGER`, `AI WORKFORCE`, `DECISIONS`). Do not
use numbered markers (`01 / 02 / 03`) unless the content genuinely is a
sequence; nothing in this product is.

## Checking your work

`/ds-check.html` renders the primitives in both appearances on the running dev
server. Use it when you add or change anything shared. Both appearances must
pass axe with no serious or critical violation, including colour contrast.
