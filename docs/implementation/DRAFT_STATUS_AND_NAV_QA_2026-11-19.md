# Arlovi — draft recovery status and navigation QA, 19 November 2026

## Shared save-state language
- **Working draft · kept in this tab only:** the form has entered the opt-in in-memory draft layer; it is **not** a record save, server write or cross-device backup
- **No temporary draft:** no unsaved fields have been captured by this local draft layer; this is **not** a claim that the underlying document is saved
- **Saved:** reserved for real completed mutation or editor save acknowledgement; never infer it from a route change or presence in the draft cache
- **Failed / conflict:** keep drafts intact; do not say saved, and offer retry or review as the native editor supports

The global header shows a compact live count of temporary draft scopes for the current organisation and actor. It never exposes content or saves draft bytes into navigation. Each protected editor displays a small inline state line instead of a brightly filled warning panel.

## QA findings
The latest prior full CI on `8b44e67` finished with 484 browser passes, 63 failures and 38 skips; the separate desktop/tablet/mobile workflow had five failures. Production builds succeeded but those tests did not. The highest-priority reported failures include role-view submenu automation, duplicated accessible Finance links in legacy test selectors, some tablet/mobile drawer interactions, and project creation returning to its old route. Navigation behaviour must be verified again on the subsequent commit.

## Boundaries
Working drafts are in-memory only. Hard reload, browser crash, or tab close may lose them. Complex visual editors (Docs, Sheets, Present, Design) keep their existing, separate record-save and recovery engines. This UI must never label unsaved editor content as securely stored on a server.

## Acceptance checks
- Editing, discarding and saving updates the per-app draft state and the correct company/actor header count
- Switching company hides the other company's count; switching back does not discard the previous working copy in the same runtime
- Draft text never appears in URL, localStorage or sessionStorage
- Form-to-form and app-to-app transitions restore opted-in fields
- Keyboard focus, 44px touch target, selected pink pills and responsive shell remain intact
- No false `Saved` indicator; desktop/tablet/mobile tests run, with failures called out rather than silently ignored
