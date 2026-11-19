# Arlovi — editor continuity phase 4 and selected navigation

## Visual decision
Restore the original **full, soft-pink selected capsule** for sidebar app links and a compact filled pink circle/pill for short active tabs such as `All`. Token `--selection-pop: #FFC9FF` and dark theme alternative are dedicated to navigation state, independent of Seafoam/Iris/Citrus/Coral branding and semantic alerts. Keep clear keyboard focus, 44px+ touch targets, simple hover behaviour. Remove the mini vertical marker and the curved underline.

## High-value editors
The prior phases cover Finance New Invoice; CRM contacts/leads/message drafts; People positions; Docs new-document setup; Projects project creation/task/comment editors.

This phase adds:
- **CRM Deal drawer:** scope every controlled field by company, actor and deal ID; keep changes across same-tab app detours, with explicit **Close & keep draft** and **Discard changes** actions. Preserve revision-checked updates; do not clear a draft when an update is rejected.
- **CRM Quote builder:** keep selected deal, recipient, quote number, expiry, customer tax status, `InvoiceLine[]` including line quantities/prices/discount/tax categories, and a dirty flag. Hydrating an existing quote must not replace its unsaved local revision. Accepted quotes remain locked. Save still creates/revises a draft and checks expected revision; prior approvals remain separate.
- **People Employee profile:** scope job title, department, manager, office and work phone per employee, organisation and actor. Show an explicit discard action; do not persist phone or other profile fields in navigation URLs.
- **Design New file:** remember file title, artboard and file/template selection per organisation and actor until creation or discard.
- **Present Create layout:** remember layout name and base layout per deck and actor; clear after creating the layout or explicitly discarding.
- **Working state helper:** functional updates can modify complex arrays safely without losing a previous unsaved edit.

## Existing deeper editor behaviour
Design and related visual editors already use `useDoc` + `useSharedDoc`, which keep one editing session per record, provide local recovery and debounce saves to record storage; Docs has a debounced revision-checked autosave; Present and Sheets already expose version and conflict screens. This phase does not claim multi-device live sync or server-side authoritative versioning.

## Known limits
Simple form drafts and CRM quote drafts remain memory-only in this browser tab. A hard refresh/close/crash can lose them. Saving a quote, deal or profile is a deliberate separate step. Always verify tenant/role access on the actual record; restoring a route is not an authorisation grant. Existing visual local-storage recovery is a separate mechanism and should not be marketed as cloud recovery.

## Verification
Check stylesheet selected state on desktop and mobile; quote line edits, record refresh while editing, return to quote, cancel/discard, separate deals and companies, People employee profile after a detour, creative project setup, revised record conflicts, and full regression suite.
