# Arlovi · Transactional Overlays and Pop-up UX Contract
_18 November 2026 · scope: all native applications_

## Verified starting point
`src/generated/catalog.json` lists **35 application codes, 316 screens and 957 declared overlay names**. These are registry-contract counts, not a claim that every declared overlay has already been implemented or manually audited. Some tools also render custom application-owned dialogs or menus outside the generic registry.

The previous side-panel work introduced the shared drawer experience and safe close support (PR #76). This work extends that foundation to pop-ups. The approved visual baseline remains the platform's redefined 100% scale, equivalent to the earlier 80% appearance. Preserve the current tokens, density and brand palette.

## Interaction types and default behaviour

| Overlay family | Use | Standard interaction |
|---|---|---|
| Informational modal | Focused explanation, read-only preview | Heading, context, evidence, obvious close; no unnecessary primary button |
| Transactional modal | Form, deposit, send preview, edit and save | Clear form labels; scrollable content; persistent footer; async state; unsaved close guard |
| Confirmation | Commit, submit, send or approve | Consequence stated before action; specific affirmative label; Cancel; button disabled while processing |
| Destructive confirmation | Delete, void, revoke or irreversible mutation | Danger tone reserved for consequence; explicit record identity and consequence; guard against duplicate submissions |
| Drawer / inspector | Contextual details and longer work | Shared drawer/inspector layout; independently scrollable body; docked actions where appropriate |
| Menu / popover | Tertiary choices, light filters, anchored details | Compact targets; keyboard focus; anchored placement and collision; never rely on hover alone |
| Alert / toast | Brief asynchronous feedback and errors | Accurate success/failure states; details retained where failure needs correction; must not obscure a modal action |
| Blocking boundary | Missing payment, email, API or approval dependency | State what cannot happen, what is recorded locally, and the safe next action; no simulated success |

## Content and layout contract

1. **Identity first.** A specific title, object name, status and helpful one-line context.
2. **Evidence second.** Important figures and relationships are grouped; avoid long flat key/value lists where a concise summary is clearer.
3. **Task third.** One primary decision, optional secondary action, no unrelated navigation action competing with save.
4. **Guardrails before commitment.** Permission checks, validation, source provenance, connected/not-connected provider boundaries and irreversible consequences.
5. **Action dock.** Forms with actions use `ModalActions` or `footer`. Buttons stay visible while the work body scrolls.
6. **Close safely.** Editable forms opt into `ModalUnsavedChanges`; asynchronous mutations into `ModalInFlight`. Closing from Escape, scrim and the X must share the same protections.
7. **Accessibly responsive.** Dialog labels and descriptions, focus trap/return, visible keyboard focus, sufficient targets, mobile bottom sheets, safe-area padding, dark theme, reduced-motion preference and no horizontal overflow.
8. **Trustworthy status.** Never label a request as captured/paid/sent merely because it was recorded locally.

## Implemented in this branch

- Refined shared `Modal`, `ConfirmModal`, `Popover` and menu presentation and interaction behaviour.
- New `ModalActions`, `ModalUnsavedChanges`, and `ModalInFlight` primitives for application-owned forms.
- Accessible dialog descriptions even when an app lacks a bespoke subtitle; consistent close controls.
- Safe close confirmation for opted-in edited forms; in-flight requests cannot be dismissed through the normal close paths.
- Responsive height, scrolling, anchored footer, reduced-motion and keyboard affordances.
- Booking Deposit redesign: booking identity, payment state, clear amount/tax, provider boundary, distinct request vs external-receipt flow, explicit external-receipt confirmation and duplicate receipt protection.

## Remaining app-by-app review (not claimed as complete)

Audit every implemented overlay against this contract, prioritising Finance, Bookings, People, CRM, Communications, Commerce, Admin/Identity, Automation, Projects, Documents and creative suites. Check each application-owned dialog which bypasses the shared primitives, including bespoke editors and rich media menus. Preserve existing operations and API/domain contracts; replace misleading copy, overcrowded content, insecure close behaviour and misplaced buttons.

Per overlay, record: application, screen, overlay ID, variant, invoking action, permission requirements, primary mutation, backend/provider boundary, keyboard dismissal, unsaved edits, loading/error/empty states, desktop/tablet/phone screenshots, dark-mode and scale observations. A registry entry alone is **not** proof of completed functionality.

## Regression and release gates

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- `npx playwright test e2e/modal-experience.spec.ts`.
- Existing deep/contract/a11y tests plus representative dialogs from each native application.
- Verify local-only payment wording, tax-rate outcomes, stale-revision mutation failures and no fake payment collection.
- Review the preview before merging. A successful Vercel build is not equivalent to browser QA passing or production deployment.

## Overlay kit (19 Nov 2026)

`src/design-system/overlay-kit.tsx` supplies the information-hierarchy primitives for modal and drawer bodies.
All are exported from `@/design-system`.

- `OVERLAY_WIDTH = { compact: 440, form: 520, record: 640, wide: 760, modal: 560 }` for the `width` prop. Form drawers
  default to `form`; use `record`/`wide` only for tabs or tables. Modals no longer force a minimum height.
- `OverlaySection({ title, hint?, actions?, tone?, flush?, children })` - compact titled section
  (`.ds-ov-section`, `data-tone`), uppercase eyebrow title.
- `FactGrid({ items, columns?, dense? })` - label-over-value grid (`.ds-ov-facts[data-columns]`);
  `mono` values use tabular IBM Plex Mono; collapses 4/3 -> 2 columns at 850px and to 1 at 420px.
- `OverlaySummary({ eyebrow?, title, status?, meta?, avatar?, actions? })` - record identity block
  (`.ds-ov-summary`) with dot-separated meta.
- `OverlayActions({ primary, secondary?, end? })` - footer row `[primary][secondary] ... [end]`.

**Action convention.** Primary first on the left, secondary beside it, destructive or dismiss at the end.
Confirm dialogs keep `[Cancel] ... [Confirm]`. `MenuEntry` also accepts optional `icon` and `description`.

```tsx
<Drawer open onOpenChange={close} title="Deal" width={OVERLAY_WIDTH.form}>
  <OverlaySummary title={deal.title} status={<Pill>Open</Pill>} meta={["Northline", "Due 3 Dec"]} />
  <OverlaySection title="Terms">
    <FactGrid items={[{ label: "Value", value: "$12,400", mono: true }, { label: "Stage", value: "Proposal" }]} />
  </OverlaySection>
  <DrawerActions>
    <OverlayActions primary={<Button variant="primary">Save</Button>}
      secondary={<OverlayCancel>Close</OverlayCancel>} end={<Button variant="danger">Discard</Button>} />
  </DrawerActions>
</Drawer>
```
