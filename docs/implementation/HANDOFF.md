# Handoff

The frontend is not complete. Continue from `cursor/arlovi-frontend-9636`.

## Verified in the browser

| Journey | Evidence |
|---|---|
| Invoice create, line edit, issue, ledger, awaiting-payment tab, reload | `e2e/screens.spec.ts` |
| Deal drafts an invoice that opens in Finance | `e2e/screens.spec.ts` |
| Wage journal posts and stays posted | `e2e/screens.spec.ts` |
| Design file create, add rectangle, reload | `e2e/screens.spec.ts` |
| Agent contract creates a directory member and an organization-chart node | `e2e/screens.spec.ts` |
| Task board move updates the project overview and survives reload | `e2e/screens.spec.ts` |
| All 316 routes render title, first tab, and first action with no page error | `e2e/screens.spec.ts` |
| Axe on home, finance home, document editor, deal board | `e2e/a11y.spec.ts` |
| Invoice Create stays in view at 375, 768, and 1440 | `e2e/viewport.spec.ts` |

## Still open

- Most overlays are one shared form. The registry describes distinct drawers, inspectors, and wizards.
- Most tabs change a filter, not a specialist layout.
- Communications, care, HR, legal, marketing, procurement, websites, and the app builder still use the shared shell plus the editor that matches the record type.
- Board drag-and-drop moves a card onto another card. Keyboard and button moves are the tested path.
- Formula support is arithmetic plus SUM, AVERAGE, MIN, MAX, and COUNT.
- Photo, video, and motion editors are structured local tools, not full desktop applications.
- IndexedDB does not sync across devices.
- No mail, payments, bank feed, tax filing, publish, or language model is connected. Do not mark those actions as completed.

## Where to work next

Specialist desks live in `src/views/desks.tsx` and are chosen in `src/app/screen.tsx` before the shared archetype. New records are shaped in `src/domain/create.ts`. Add the next desk the same way, then add a Playwright journey and move that screen's ledger status to `verified` only after the journey passes.

Regenerate the ledger with `python3 scripts/build_ledger.py` after changing the verified set. Do not mark a screen verified because its route renders.
