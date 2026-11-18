# W2D — Docs, Sheets, Present, Design (wave 2)

Branch `w2-documents-design`, based on `29537d4`. Scope: editing depth in four editors. Wave 1
had already left these apps with real engines: a model-driven document editor, a spreadsheet
engine, a slide object graph and a design scene graph. This pass fills the gaps that showed up
when the editors were used from the keyboard and on a phone, adds the two-window presenter, and
fixes the two failing Present specs.

## Owned failures

| Spec | Root cause | Decision |
|---|---|---|
| `present-library-experience` › unknown presentation URL | Commit `4e05eff` added a shared record guard to `src/app/ScreenHost.tsx`. It now handles every unknown detail ID before the app mounts and shows "Record not found … No other record was substituted." This is an intentional change to all apps. | **Test updated.** The spec now asserts the guard's heading and its no-substitution sentence. It still asserts that no slide editor or slide context is mounted. |
| `present-library-experience` › approval records | The Review & Publish screen showed "Record an approval" twice: once as the screen action (guarded by the `edit_knowledge` capability) and once as an unguarded copy in the Approvals card. | **Product fixed.** The duplicate, unguarded button is gone, and the empty state points to the screen action. The test is unchanged. |

Both failures were reproduced on `29537d4` before the change. After the change, all 9 tests in
`present-library-experience` pass. These also stay green: `ws5-present-presenter` (3),
`docs-library-experience`, `document-review-publication` and `sheets-library-experience`
(24 together).

## ARL-PRESENT-006 Presenter Mode — `/o/:org/present/decks/:id/present`
**Status: Verified**
- **Open audience window:** opens a second browser window at the same route with
  `display=window`. That window renders only the slide, never the notes, and fills the window.
  It follows the presenter over a per-deck `BroadcastChannel` (`present/audienceLink.ts`).
- **Keyboard:** the audience window's arrows, Page keys, Home and End, number + Enter, and B are
  sent back to the presenter window, which moves.
- **Blanking:** pressing B or using "Blank" in the presenter window blanks the audience window.
  Live annotations are mirrored.
- **Reloads:** if either window reloads, it resyncs (hello and sync handshake). "Close audience
  window" ends the link. If the window is closed from its title bar, a poll detects it.
- **Blocked pop-up:** the presenter window shows a notice and points to the full-screen display.
- **Phone width:** the presenter slide now scales to the screen. Before, it was cropped at a fixed
  62%.
- Nothing leaves the browser, and the UI says so.
- Tests: `e2e/w2d-present-audience-window.spec.ts` (2, including 390px), plus unit tests in
  `tests/unit/w2d-editing-helpers.test.ts`.

## ARL-PRESENT-007 Review & Publish
**Status: Verified** — duplicate approval action removed (see above).

## ARL-SHEETS-002 / 003 Grid Editor and Formula Manager
**Status: Verified**
- **Engine** (`sheets/engine.ts`): 28 functions added — SUMIFS, COUNTIFS, AVERAGEIF(S),
  MAXIFS, MINIFS, MATCH, INDEX, XLOOKUP, HLOOKUP, IFS, ROUNDUP, ROUNDDOWN, INT, MOD, POWER, SQRT,
  PRODUCT, MEDIAN, COUNTBLANK, MID, SUBSTITUTE, ISBLANK, ISNUMBER, ISTEXT and ISERROR.
  - Errors are still exact: #REF!, #DIV/0!, #N/A and #VALUE!, and #CYCLE! stays on everything a
    cycle feeds.
  - A unit test keeps `FUNCTION_HELP` (the Formula manager list) equal to the implemented set.
  - XLOOKUP is now implemented, so the seed's "unsupported function" example and one existing unit
    test now use GROWTH.
  - `src/domain/formulas.ts` was not changed because nothing imports it.
- **Cell editor:**
  - Typing `=SU…` lists matching functions with their signature and summary. Arrow keys choose,
    Tab or Enter inserts `NAME(`, and Escape dismisses the list.
  - Point mode: while a formula is waiting for an operand, clicking a cell writes its address
    and dragging writes a range.
- **Grid keyboard:**
  - Ctrl/⌘ Z and Y undo and redo. These had no shortcut in the grid before.
  - Ctrl+D and Ctrl+R fill down and right. Ctrl+B and Ctrl+I set bold and italic.
  - Ctrl+A selects the used range. Ctrl+arrow jumps to the edge of the data block, and Shift
    extends the selection.
- **Phone width:** below 1280px the grid used to shrink to a single row; it now keeps a working
  height. Toolbar selects no longer collapse.
- **Persistence:** formulas, the fill and the bold all survive a reload (e2e).
- Tests: `tests/unit/w2d-sheets-functions.test.ts` (15), `w2d-editing-helpers.test.ts`, and
  `e2e/w2d-sheets-editing.spec.ts` (2, including 390px).

## ARL-DOCS-002 Document Editor
**Status: Verified**
- **Markdown autoformat:** `# `, `## `, `### `, `- `, `* `, `1. ` and `> ` at the start of a
  paragraph turn it into a heading, list item or quote. It is off in suggesting mode. One undo
  step reverses it.
- **Leaving a list:** Enter on an empty list item or quote now ends the list.
- **Tables:**
  - Add row, Add column, Remove row and Remove column act on the focused cell.
  - Tab from the last cell adds a row.
  - Every change can be undone and is autosaved.
- **Bug fix:** typing into a table cell kept only the first keystroke. Each cell edit restored
  the document caret, which pulled focus out of the cell. Cell edits no longer restore the caret,
  and the caret restore skips a focused cell input.
- **Phone width:** the toolbar selects keep their width.
- Tests: `tests/unit/w2d-docs-editing.test.ts` (12) and `e2e/w2d-docs-editing.spec.ts` (2,
  including reload persistence and 390px).

## ARL-DESIGN-002 / 003 Design Canvas and Layers
**Status: Verified**
- **Clipboard:** ⌘/Ctrl C, X and V copy, cut and paste layers with their children, and also work
  across pages and files in the same tab. Repeated pastes are offset by a further 16px each time.
- **⌘D:** now deep-duplicates frames and groups with fresh ids and selects the copy. It used to
  make a shallow copy that left the children behind.
- **Selection, grouping and order:**
  - ⌘A selects every editable top-level layer.
  - ⌘G now selects the new group, and ⇧⌘G ungroups.
  - ⇧⌘H hides or shows; ⇧⌘L locks or unlocks.
  - ⇧⌘[ and ⇧⌘] send to back and bring to front.
  - Arrow nudges skip locked and hidden layers.
- **Align:** a single layer aligns inside its parent frame or group; before, you needed two
  layers.
- Tests: `tests/unit/w2d-design-clipboard.test.ts` (5) and `e2e/w2d-design-keyboard.spec.ts`
  (3, including reload persistence and 390px).

## Verification
- `npx tsc --noEmit`: 0 errors. ESLint is clean on every changed app, test and spec.
- `npx vitest run`: 58 files, 530 tests, all passed.
- Playwright on my own server (port 5184):
  - W2D specs: 9 passed; with the specs below, 45 of 45 passed in one run.
  - `present-library-experience` (9), `ws5-present-presenter` (3), and `docs-library-experience`,
    `document-review-publication` and `sheets-library-experience` (24): all passed.
- Screenshots at 1440px and 390px are in the scratchpad under `w2d/`: the suggestion list, the
  table tools, the presenter view, the audience window and the toolbars on mobile.

## Remaining gaps
- The audience window has to be opened from this browser. There is no cross-device pairing and no
  phone remote.
- The Sheets function list is still a subset. There are no array formulas and no TEXT formats;
  unknown functions report #NAME?.
- Docs autoformat runs only at the start of a paragraph. There is no inline `**bold**` shortcut.
- The design clipboard is per tab and does not use the system clipboard.
