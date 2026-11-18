# W2F — Platform apps, wave 2 (2026-11-18)

Branch: `w2-platform` (from `29537d4`). Apps: FORMS, CONNECT, BUILD, WEB, IT. IT was not changed in this wave. No shared files were changed.

## Owned failures

| Failure | Root cause | Changed |
|---|---|---|
| `integrations-native-experience.spec.ts:81`: the "Review permissions" button detaches | **Product.** Connector cards, the requirements drawer, the detail screen and the wizard all linked to `/connect/marketplace/<capability id>` (for example `email.send`). The shell record guard (`ScreenHost`, 4e05eff) treats `:id` as a record. It found no record, so about 100 ms after mount it replaced the page with "Record not found". The button was detached mid-click, and the page stayed broken. | Product. Links now carry the organisation's own connector record id (`connectorRecordFor` / `connectorPath`). When the workspace has no record, the requirements drawer opens instead. Overlay actions resolve record ids through `useWatch`. Also fixed: a literal `$` in the connector eyebrow. |
| WF-01 Company onboarding (`workflows.spec.ts:298`) | **Product.** The ff0b715 redesign changed the boundary statement to "Every provider is currently not connected" and renamed the card button to "Requirements". "Open the authorisation flow" also reached the same record-guard failure described above. | Product. The statement and the button wording ("Every provider here is not connected.", "What it needs") were restored, and the authorisation link uses the record id. |
| WF-07 (`workflows.spec.ts:894`): no row for `northline.co.uk` | **Test drift.** The site directory became a card grid by default in 7803136, which was intentional and is asserted by `websites-library-experience.spec.ts`. The table view still shows "Not published". | Test. It now clicks "Table view" before asserting the row. |
| `forms-library-experience.spec.ts:25` | **Test drift.** The shell record guard answers before the form builder mounts and shows "This record is unavailable". This is the same alignment already made for documents in 099565a. | Test. The expected text was changed. The guard still has to keep the builder overview count at 0. |
| `build-library-experience.spec.ts:90` | **Test drift.** The test contradicts itself. A non-exact `getByLabel("API contract overview")` also matches the child "API contract overview metrics", which the same test asserts. | Test. `{ exact: true }` was added for the region, and for "Access policy overview", which had the same latent issue. |
| `websites-library-experience.spec.ts:3` | **Test drift.** The DataGrid is named by its `<caption>`, which `getByLabel` does not match. The substring "Sites" also matched "Sort websites", "Filter Sites" and the row buttons. | Test. It now uses `getByRole("table", { name: "Sites" })`. |

## Screens

### ARL-FORMS-002 Visual Form Builder — Preview tab
- **Decision:** the preview stays non-saving as a response, which is the honest choice, and is made useful. Each finished run is kept on the form as a **preview run** in `body.previewRuns` (the newest 10), with time, author, version, device, answers and the number of questions hidden by logic.
- **Panel:** lists the runs and shows the answers of the chosen run. It flags a run answered on an older version, and questions removed since the run. Runs can be cleared.
- **Copy:** says that runs are never responses. The inbox, analytics, retention and exports do not count them, and e2e asserts that the inbox stays empty.
- **Save fix:** `saveForm` now keeps other body keys, so editing the form does not drop the runs.
- **Status:** Verified (e2e with reload, 390px).

### ARL-WEB-003 Page editor / ARL-WEB-002 Site dashboard — Pages drawer
- **Entry points:** the editor's "Pages" button, the editor's overflow action "Manage pages", and "Manage pages" on the dashboard's Pages tab.
- **Adding a page:** the address is derived from the name and validated. An optional header-menu link can be added at the same time.
- **Page settings:** rename, change the address, and set the state (Draft or Ready to publish).
- **Changing an address:** before saving, the drawer says what will follow. Saving rewrites menu links (including sub-links) and button targets, adds a 301 from the old address, and points existing redirects at the new one.
- **Duplicate:** creates a draft with fresh block ids and noindex, placed after the original.
- **Reorder:** pages move up and down; this is the sitemap order.
- **Delete:** needs a confirmation. It removes menu links and can redirect the old address and its buttons. The last page cannot be deleted.
- **Undo:** every change goes through `saveSite`, so the editor's Undo can reverse it.
- **Status:** Verified (e2e with reload, 390px drawer).

### ARL-WEB-006 Navigation
- **Submenus:** the header menu supports one level of submenu. You can add sub-links, place a link under a parent or move it back to the top level, reorder sub-links, and remove them.
- **Target validation:** anchors must look like `#name`. External links must be http, https, mailto or tel, so `javascript:` is refused. Invalid targets are flagged in the list.
- **HTML export:** submenus now render (`nav-group` / `nav-sub`).
- **Status:** Verified.

### ARL-BUILD-003 Visual App Builder — component binding and interactions
- **Binding:** table, list, stat, chart and detail components take filters (joined with AND; choice fields offer their options), a sort and a limit.
- **Interactions:** tables and lists can open a screen when a row is chosen, or open it focused on the chosen record. Forms can open a screen after saving.
- **Preview:** applies the binding to real workspace records ("2 of 3 tasks records"). Choosing a row moves to the target screen with a back trail, and detail and form components show the chosen record. A form's "Continue to …" button states that nothing is saved.
- **Model check:** reports filters or sorts on deleted fields, and missing or self-targeting screens.
- **Canvas:** shows a summary of each component's query and its target screen.
- **Generated screen code:** carries `query` and `onChoose` / `onSaved`.
- **Templates:** "Open quotes" now really filters out accepted and declined quotes.
- **Save fix:** inspector edits are queued and applied to the latest stored revision. Before this, two fast edits conflicted or overwrote each other. Filter values save on blur or Enter.
- **Status:** Verified (e2e with reload).

### ARL-CONNECT-001/002/003
- **Changes:** record-id routing, as described under Owned failures above.
- **Status:** Verified.

## Tests

- **Unit:** `tests/unit/w2f-platform.test.ts`, 16 tests. They cover preview runs, page operations, the menu tree, binding query, binding problems and connector routes.
- **E2E:** `e2e/w2f-platform.spec.ts`, 5 tests. They cover forms, web, build, connect and a 390px overflow check.
- **Results:** see the final report for the counts from the last verification run.
- **Screenshots:** `/tmp/claude-0/-home-user-Arlovi/64dfa8d0-3ecb-54c5-a7b7-785673d9d261/scratchpad/w2f/`, at 1440px and 390px.

## Remaining gaps
- The SEO editor (Quality › SEO) can still change a page address without adding a redirect. The Pages drawer is the path that does add one.
- In the BUILD preview, forms still do not write records. The after-save interaction is previewed with an explicit "nothing is saved" button.
- Menu nesting is one level deep, by design.
- Preview runs are capped at 10 per form, and their answers are stored on the form record (they are the author's own answers).
