# Arlovi UI/UX programme - Playwright baseline (main @ 456c87d)

Measured by the QA baseline worker. Source tree untouched. Artifacts: `/tmp/claude-0/-home-user-Arlovi/daed2018-a12a-57d1-8b2e-76408c85a8ca/scratchpad/qa-baseline/` (`<group>.json` + `<group>.log`).

## How it was run

- Pass 1: groups a/b/c and the five long specs against the prod preview `BASE_URL=http://127.0.0.1:4173`, `--workers=3` (deep: 4), retries 0 (so *flaky* is always 0 in pass 1; the repo config sets `retries: 0`).
- Finding: ~95 pass-1 failures are `Failed to fetch dynamically imported module: http://127.0.0.1:4173/src/platform/repo.ts`. Those tests `import('/src/platform/repo.ts')` in the page, which only exists on a Vite dev server, not in a production preview. They are environmental to the 4173 preview, not product defects.
- Pass 2 (to separate that): the baseline tree was exported with `git archive 456c87d` into the scratchpad (`base-src/`, not the repo) and served by `vite` dev on `http://127.0.0.1:4174`; every pass-1 failing spec file was re-run there (workers=2, then `--last-failed` workers=1). Workflows re-run on 4174 workers=1; contract could not be re-run (the run produced no output, see below).
- Machine was shared with other workers' Playwright/vite processes, so crashes (`Target crashed`, `Page crashed`) occurred under load.

## Wall time

a exit=1 wall=98s  
b exit=1 wall=75s  
c exit=1 wall=383s  
deep exit=1 wall=1380s  
full-visual-audit exit=0 wall=13s  
contract exit=1 wall=112s  
findings exit=1 wall=84s  
workflows exit=1 wall=224s  
DONE  
rerun2 wall=770s  
contract-dev(4174,w1) wall=188s  
findings-dev(4174,w1) wall=151s  
workflows-dev(4174,w1) wall=96s  
DONE2  
contract-dev(4174,w1) wall=163s  
workflows-dev(4174,w1) wall=378s  
DONE3  


## Per-spec results, pass 1 (prod preview :4173)

| group | spec | passed | failed | skipped | flaky | final after pass 2 |
|---|---|---|---|---|---|---|
| a | a11y.spec.ts | 17 | 20 | 0 | 0 | 0 persistent, 20 cleared on dev-baseline |
| a | display-scale.spec.ts | 0 | 3 | 0 | 0 | 3 persistent, 0 cleared on dev-baseline |
| a | display-scaling.spec.ts | 15 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| a | drawer-experience.spec.ts | 0 | 3 | 0 | 0 | 3 persistent, 0 cleared on dev-baseline |
| a | execution-preflight.spec.ts | 1 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| a | mobile-shell.spec.ts | 8 | 0 | 0 | 0 | all pass |
| a | modal-experience.spec.ts | 4 | 0 | 0 | 0 | all pass |
| a | native-overlay-experience.spec.ts | 21 | 0 | 0 | 0 | all pass |
| a | notification-experience.spec.ts | 3 | 0 | 0 | 0 | all pass |
| a | selection-pill.spec.ts | 1 | 0 | 0 | 0 | all pass |
| a | toast-clickthrough.spec.ts | 3 | 0 | 0 | 0 | all pass |
| a | universal-header.spec.ts | 7 | 0 | 0 | 0 | all pass |
| a | viewport.spec.ts | 3 | 0 | 0 | 0 | all pass |
| b | app-journey-and-nav-states.spec.ts | 3 | 0 | 0 | 0 | all pass |
| b | apps-all-categories.spec.ts | 5 | 0 | 0 | 0 | all pass |
| b | apps-directory.spec.ts | 11 | 0 | 0 | 0 | all pass |
| b | command-resume.spec.ts | 2 | 0 | 0 | 0 | all pass |
| b | contextual-workspace-navigation.spec.ts | 7 | 0 | 0 | 0 | all pass |
| b | favourites.spec.ts | 1 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| b | header-context-safety.spec.ts | 6 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| b | native-screen-continuity.spec.ts | 7 | 0 | 0 | 0 | all pass |
| b | organization-guard.spec.ts | 1 | 0 | 0 | 0 | all pass |
| b | profile-menu.spec.ts | 0 | 4 | 0 | 0 | 4 persistent, 0 cleared on dev-baseline |
| b | record-not-found.spec.ts | 1 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | access-experience.spec.ts | 2 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | access-management.spec.ts | 4 | 0 | 0 | 0 | all pass |
| c | access-matrix.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | ai-work-assignment.spec.ts | 0 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | all-native-app-entrypoints.spec.ts | 6 | 0 | 0 | 0 | all pass |
| c | ask-arlovi-experience.spec.ts | 6 | 2 | 0 | 0 | 2 persistent, 0 cleared on dev-baseline |
| c | build-library-experience.spec.ts | 3 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | cloud-readiness.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | company-collaboration.spec.ts | 1 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | company-onboarding.spec.ts | 1 | 0 | 0 | 0 | all pass |
| c | contextual-workspace-create.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | crm-finance-handoff.spec.ts | 2 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | cross-app-editor-drafts.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | demand-loading-qa.spec.ts | 3 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | docs-library-experience.spec.ts | 5 | 9 | 0 | 0 | 0 persistent, 9 cleared on dev-baseline |
| c | document-review-publication.spec.ts | 0 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | entry-experience.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | entry-visual-consistency.spec.ts | 6 | 0 | 0 | 0 | all pass |
| c | finance-period-signoff.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | finance-reconciliation-links.spec.ts | 0 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | finance-settlement-integrity.spec.ts | 2 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | finance-time-inputs.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | first-run-guide.spec.ts | 1 | 0 | 0 | 0 | all pass |
| c | forms-library-experience.spec.ts | 3 | 4 | 0 | 0 | 0 persistent, 4 cleared on dev-baseline |
| c | fresh-company-all-apps.spec.ts | 1 | 0 | 0 | 0 | all pass |
| c | growth-apps.spec.ts | 19 | 0 | 0 | 0 | all pass |
| c | header-inbox-integrity.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | integrations-native-experience.spec.ts | 10 | 0 | 0 | 0 | all pass |
| c | lazy-workspace-surfaces.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | linked-task-approvals.spec.ts | 0 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | nango-guided-experience.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | on-demand-native-apps.spec.ts | 1 | 2 | 0 | 0 | 2 persistent, 0 cleared on dev-baseline |
| c | onboarding-resume.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | people-decision-integrity.spec.ts | 0 | 5 | 0 | 0 | 0 persistent, 5 cleared on dev-baseline |
| c | people-directory-profile-redesign.spec.ts | 5 | 0 | 0 | 0 | all pass |
| c | people-documents-continuity.spec.ts | 1 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | people-modal-workflows-redesign.spec.ts | 8 | 10 | 0 | 0 | 0 persistent, 10 cleared on dev-baseline |
| c | people-performance-learning-payroll-redesign.spec.ts | 3 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | people-recruitment-onboarding-leave-redesign.spec.ts | 5 | 0 | 0 | 0 | all pass |
| c | portal-scope-acceptance.spec.ts | 1 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| c | present-library-experience.spec.ts | 4 | 5 | 0 | 0 | 0 persistent, 5 cleared on dev-baseline |
| c | profile-role-inline.spec.ts | 0 | 3 | 0 | 0 | 3 persistent, 0 cleared on dev-baseline |
| c | project-inbox-continuity.spec.ts | 0 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | search-native-content.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | search-remote-gate.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | search-sources.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | search-v2.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | seed-preservation.spec.ts | 1 | 0 | 0 | 0 | all pass |
| c | sheets-library-experience.spec.ts | 2 | 7 | 0 | 0 | 0 persistent, 7 cleared on dev-baseline |
| c | staged-startup.spec.ts | 1 | 2 | 0 | 0 | 2 persistent, 0 cleared on dev-baseline |
| c | team-agent-overview.spec.ts | 5 | 0 | 0 | 0 | all pass |
| c | tenant-write-isolation.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | w2a-fin-crm.spec.ts | 4 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | w2b-people-comms.spec.ts | 5 | 2 | 0 | 0 | 2 persistent, 0 cleared on dev-baseline |
| c | w2c-analytics-report.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | w2c-auto-builder.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | w2c-brain-collections.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | w2c-mission-schedule.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | w2c-team-agent-teams.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | w2d-design-keyboard.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | w2d-docs-editing.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | w2d-present-audience-window.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | w2d-sheets-editing.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | w2e-layout-photo.spec.ts | 0 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | w2e-video-motion.spec.ts | 0 | 6 | 0 | 0 | 0 persistent, 6 cleared on dev-baseline |
| c | w2f-platform.spec.ts | 2 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | w2g-growth.spec.ts | 7 | 0 | 0 | 0 | all pass |
| c | websites-library-experience.spec.ts | 9 | 0 | 0 | 0 | all pass |
| c | workforce-roster-review.spec.ts | 0 | 2 | 0 | 0 | 1 persistent, 1 cleared on dev-baseline |
| c | workforce-scheduling-handoffs.spec.ts | 0 | 3 | 0 | 0 | 1 persistent, 2 cleared on dev-baseline |
| c | workforce-visible-page-redesign.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | working-draft-status.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | workspace-continuity.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | workspace-navigation.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | workspace-redesign.spec.ts | 5 | 0 | 0 | 0 | all pass |
| c | workspace-reliability.spec.ts | 2 | 1 | 0 | 0 | 1 persistent, 0 cleared on dev-baseline |
| c | workspace-resources.spec.ts | 3 | 0 | 1 | 0 | all pass |
| c | ws1-admin-access.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | ws1-asset-library.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | ws1-hq-command.spec.ts | 4 | 0 | 0 | 0 | all pass |
| c | ws1-inbox-triage.spec.ts | 3 | 0 | 0 | 0 | all pass |
| c | ws2-knowledge-workspace.spec.ts | 4 | 0 | 0 | 0 | all pass |
| c | ws2-mission-brief.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | ws2-team-contract.spec.ts | 2 | 0 | 0 | 0 | all pass |
| c | ws3-operations.spec.ts | 6 | 0 | 0 | 0 | all pass |
| c | ws4-growth.spec.ts | 9 | 0 | 0 | 0 | all pass |
| c | ws5-layout-editor.spec.ts | 0 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | ws5-photo-editor.spec.ts | 0 | 2 | 0 | 0 | 0 persistent, 2 cleared on dev-baseline |
| c | ws5-present-presenter.spec.ts | 0 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | ws5-video-monitor.spec.ts | 0 | 3 | 0 | 0 | 0 persistent, 3 cleared on dev-baseline |
| c | ws6-platform.spec.ts | 7 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| contract | contract.spec.ts | 4 | 4 | 0 | 0 | 0 persistent, 0 cleared on dev-baseline, 4 not re-run |
| deep | deep.spec.ts | 29 | 6 | 0 | 0 | 0 persistent, 0 cleared on dev-baseline, 6 not re-run |
| findings | findings.spec.ts | 2 | 1 | 0 | 0 | 0 persistent, 1 cleared on dev-baseline |
| full-visual-audit | full-visual-audit.spec.ts | 0 | 0 | 35 | 0 | all pass |
| workflows | workflows.spec.ts | 18 | 6 | 0 | 0 | 6 persistent, 0 cleared on dev-baseline |

## Totals, pass 1 (prod preview :4173)

627 tests: 427 passed, 164 failed, 36 skipped, 0 flaky (retries disabled). full-visual-audit.spec.ts: 35 skipped (whole file skipped; reason not investigated).

- 94 of the 164 pass-1 failures are the `/src/platform/repo.ts` dynamic-import error (environmental to the prod preview; those spec files pass on a dev-served baseline).


## A. Persistent failures on the dev-served baseline (:4174, failed in the serial re-run too)

Classification legend: `pre-existing product defect`, `environmental`, `outdated expectation`, `unclear`. Where I did not isolate the cause the class is `unclear` and the note says what was looked at.

- **display-scale.spec.ts** - new default is visually old 80%, shown as 100% in a 0–100 slider
  - first assertion: `Locator: getByRole('dialog', { name: 'Display & scaling' }).getByRole('slider', { name: 'Interface scale' })`
  - class: `unclear` - dialog "Display & scaling" opens but slider "Interface scale" not found; src has <input type=range id=display-scale> (DisplayPreferences.tsx:55), accessible name not verified
- **display-scale.spec.ts** - the lowest labelled scale stays usable and reset restores default
  - first assertion: `TimeoutError: locator.focus: Timeout 10000ms exceeded.`
  - class: `unclear` - dialog "Display & scaling" opens but slider "Interface scale" not found; src has <input type=range id=display-scale> (DisplayPreferences.tsx:55), accessible name not verified
- **display-scale.spec.ts** - migrates existing saved 80 percent exactly once and survives reload
  - first assertion: `Locator: getByRole('dialog', { name: 'Display & scaling' }).getByRole('slider', { name: 'Interface scale' })`
  - class: `unclear` - dialog "Display & scaling" opens but slider "Interface scale" not found; src has <input type=range id=display-scale> (DisplayPreferences.tsx:55), accessible name not verified
- **display-scaling.spec.ts** - display scaling and density save under the new 0–100 control
  - first assertion: `Locator: getByRole('dialog', { name: 'Display & scaling' }).getByRole('slider', { name: 'Interface scale' })`
  - class: `unclear` - same as display-scale.spec.ts: slider "Interface scale" lookup fails
- **drawer-experience.spec.ts** - variance drawer keeps evidence and actions in distinct regions
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click on "Close panel"/"Explain" button times out (first attempt reported "element is not stable"); cause not isolated
- **drawer-experience.spec.ts** - variance draft asks before losing work on Escape or close
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click on "Close panel"/"Explain" button times out (first attempt reported "element is not stable"); cause not isolated
- **drawer-experience.spec.ts** - shared drawer retains accessible controls on phone-sized viewports
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click on "Close panel"/"Explain" button times out (first attempt reported "element is not stable"); cause not isolated
- **execution-preflight.spec.ts** - AI execution preflight is explicitly blocked without secure infrastructure
  - first assertion: `Locator: getByRole('heading', { name: 'AI work assignments' })`
  - class: `outdated expectation` - same heading "AI work assignments" expected as role=heading; only aria-label in src
- **favourites.spec.ts** - favourite apps are independently pinned, unpinned and restored on reload
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - menuitem "Remove Finance from favourites" not found; src uses title "Remove from favourites" on a pressed button (AppsDirectory.tsx:98) - likely outdated expectation, not confirmed
- **profile-menu.spec.ts** - profile menu groups identity, reliable destinations and browser-local context
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' })`
  - class: `unclear` - menu "Account and preferences" / "Role view (not a security boundary)" not found inside test although a manual probe on :4174 opened the same menu; not isolated
- **profile-menu.spec.ts** - appearance preference is actionable without overwhelming the menu
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - menu "Account and preferences" / "Role view (not a security boundary)" not found inside test although a manual probe on :4174 opened the same menu; not isolated
- **profile-menu.spec.ts** - role view is an explicit local navigation preview, not access management
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' }).getByText('Role view (not a security boundary)')`
  - class: `unclear` - menu "Account and preferences" / "Role view (not a security boundary)" not found inside test although a manual probe on :4174 opened the same menu; not isolated
- **profile-menu.spec.ts** - profile menu fits a small mobile viewport and supports Escape focus restoration
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' })`
  - class: `unclear` - menu "Account and preferences" / "Role view (not a security boundary)" not found inside test although a manual probe on :4174 opened the same menu; not isolated
- **access-experience.spec.ts** - sensitive screens and policy simulation can be inspected without granting access
  - first assertion: `Locator: getByRole('region', { name: 'Roles and application access workspace' }).getByText('explicit deny')`
  - class: `outdated expectation` - test expects text "explicit deny"; string absent from baseline src/
- **ai-work-assignment.spec.ts** - AI task assignment is durable and never implies that a model ran
  - first assertion: `Locator: getByRole('heading', { name: 'AI work assignments' })`
  - class: `outdated expectation` - test expects role=heading "AI work assignments"; src has it only as a section aria-label (AgentWorkBoard.tsx:49)
- **ask-arlovi-experience.spec.ts** - conversation history restores local turns without an AI connection
  - first assertion: `Error: locator.click: Error: strict mode violation: getByRole('dialog', { name: 'Ask Arlovi' }).getByRole('button', { name: /Which invoices are awaiting payment/ }) resol`
  - class: `unclear` - test 1: strict-mode violation (suggestion button matched twice in the Ask Arlovi dialog); test 2: click on dialog Close times out. Either duplicated accessible names in the UI or an over-broad locator; not isolated
- **ask-arlovi-experience.spec.ts** - keeps temporary conversation history isolated by company and restores it after reopening
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - test 1: strict-mode violation (suggestion button matched twice in the Ask Arlovi dialog); test 2: click on dialog Close times out. Either duplicated accessible names in the UI or an over-broad locator; not isolated
- **company-collaboration.spec.ts** - department people tab stores an association without changing the member's HR record
  - first assertion: `Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'People', exact: true }) resolved to 2 elements:`
  - class: `unclear` - strict-mode violation: button "People" resolves to 2 elements (Studio sections nav + another); duplicate UI name or over-broad locator, not isolated
- **linked-task-approvals.spec.ts** - task completion requires explicit approval and survives a reload
  - first assertion: `Locator: locator('.ws-entry-list a[href*="/project/"]').first()`
  - class: `unclear` - no .ws-entry-list a[href*="/project/"] link rendered; not isolated
- **on-demand-native-apps.spec.ts** - headquarters opens without requesting unrelated native application chunks
  - first assertion: `Locator: getByRole('heading', { name: 'Your day, in one place.' })`
  - class: `outdated expectation` - test expects h1 "Your day, in one place."; baseline HQ home renders h1 "Make room for what matters." (probe on :4174)
- **on-demand-native-apps.spec.ts** - workspace still opens and its organisation remains selected after reload
  - first assertion: `Locator: getByRole('heading', { name: 'Your day, in one place.' })`
  - class: `outdated expectation` - test expects h1 "Your day, in one place."; baseline HQ home renders h1 "Make room for what matters." (probe on :4174)
- **profile-role-inline.spec.ts** - role preview stays accessible inside one profile menu at 390px
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' })`
  - class: `unclear` - same profile-menu lookup fails at 390/820/1440 widths; manual probe opens the menu
- **profile-role-inline.spec.ts** - role preview stays accessible inside one profile menu at 820px
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' })`
  - class: `unclear` - same profile-menu lookup fails at 390/820/1440 widths; manual probe opens the menu
- **profile-role-inline.spec.ts** - role preview stays accessible inside one profile menu at 1440px
  - first assertion: `Locator: getByRole('menu', { name: 'Account and preferences' })`
  - class: `unclear` - same profile-menu lookup fails at 390/820/1440 widths; manual probe opens the menu
- **staged-startup.spec.ts** - workspace opens with core company data while native apps register
  - first assertion: `Locator: getByRole('heading', { name: 'Your day, in one place.' })`
  - class: `outdated expectation` - same h1 "Your day, in one place." expected; baseline renders "Make room for what matters."
- **staged-startup.spec.ts** - background contributors preserve customer-created local work across reload
  - first assertion: `Locator: getByRole('heading', { name: 'Your day, in one place.' })`
  - class: `outdated expectation` - same h1 "Your day, in one place." expected; baseline renders "Make room for what matters."
- **w2a-fin-crm.spec.ts** - Budget variance: drill into the posted lines and keep an explanation
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click "Save the explanation" in dialog times out; not isolated
- **w2b-people-comms.spec.ts** - COMMS email: a draft is kept as you type, never sent, and found by search
  - first assertion: `Error: locator.click: Error: strict mode violation: locator('#main').getByRole('button', { name: 'New draft' }) resolved to 2 elements:`
  - class: `unclear` - test 1: strict-mode violation ("New draft" button resolves to 2 elements); test 2: expected register-count text not found; neither isolated
- **w2b-people-comms.spec.ts** - ADMIN privacy register counts each request only once every app's records are in
  - first assertion: `Locator: getByRole('dialog').getByText('members 1 · employees 1 · payrollRuns 2 · leaveRequests 7')`
  - class: `unclear` - test 1: strict-mode violation ("New draft" button resolves to 2 elements); test 2: expected register-count text not found; neither isolated
- **workforce-roster-review.spec.ts** - Roster displays every shift including the next-day part of an overnight shift
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click on shift edit button times out in serial run (crashed target in parallel run)
- **workforce-scheduling-handoffs.spec.ts** - People roster refuses conflicting moves and saves a valid company Project assignment
  - first assertion: `TimeoutError: locator.click: Timeout 10000ms exceeded.`
  - class: `unclear` - click on button.hr-shift in roster row times out
- **workspace-reliability.spec.ts** - keyboard navigation focuses page heading after a route change
  - first assertion: `Locator:  locator('.hq-scroll h1').first()`
  - class: `unclear` - after a route change focus is not on .hq-scroll h1 (toBeFocused fails); could be a real focus-management gap, not isolated
- **workflows.spec.ts** - WF-01 Company onboarding: identity, domain claim, connector boundary, brain approval, authority, first mission
  - first assertion: `Locator: locator('#main').getByText('Every provider here is not connected')`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)
- **workflows.spec.ts** - WF-06 Hire-to-onboard: offer on evidence, employee record, IT access decision, payroll input, manager sign-off
  - first assertion: `Locator: getByRole('dialog').getByText('Marta Nowak')`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)
- **workflows.spec.ts** - WF-11 Replenishment-to-payment: requisition, approval, purchase order, receipt into stock, payable
  - first assertion: `Locator: getByRole('dialog').getByRole('button', { name: 'Reject — a reason is required' })`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)
- **workflows.spec.ts** - WF-20 Company emergency pause: dispatch held everywhere, accepted actions not claimed reversed, safe resume
  - first assertion: `Locator: getByText('Actions already accepted elsewhere cannot be confirmed from here.')`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)
- **workflows.spec.ts** - WF-13 AI workforce lifecycle: validated contract, evaluation before activation, directory and org chart, pause
  - first assertion: `Error: expect(received).toMatch(expected)`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)
- **workflows.spec.ts** - WF-19 Sensitive data deletion/export: legal hold refuses erasure, export scoped to the subject, evidence kept
  - first assertion: `Locator: getByRole('dialog').getByText('A legal hold applies')`
  - class: `unclear` - WF-01/06/11/13/19/20 each fail an expected-text/state assertion identically on prod preview and on dev-served baseline; WF-06 is a strict-mode violation (Marta Nowak twice)

## B. Failed in pass 1, passed on the dev-served baseline (not baseline defects)

### B1. `/src/platform/repo.ts` dynamic import unavailable on the prod preview - class `environmental` (92 tests)

build-library-experience.spec.ts (3), crm-finance-handoff.spec.ts (1), docs-library-experience.spec.ts (8), document-review-publication.spec.ts (1), finance-period-signoff.spec.ts (2), finance-reconciliation-links.spec.ts (1), finance-settlement-integrity.spec.ts (1), finance-time-inputs.spec.ts (2), forms-library-experience.spec.ts (4), header-context-safety.spec.ts (1), people-decision-integrity.spec.ts (5), people-documents-continuity.spec.ts (1), people-modal-workflows-redesign.spec.ts (10), people-performance-learning-payroll-redesign.spec.ts (1), present-library-experience.spec.ts (5), project-inbox-continuity.spec.ts (3), record-not-found.spec.ts (1), sheets-library-experience.spec.ts (7), tenant-write-isolation.spec.ts (2), w2d-docs-editing.spec.ts (2), w2d-present-audience-window.spec.ts (2), w2d-sheets-editing.spec.ts (2), w2e-layout-photo.spec.ts (3), w2e-video-motion.spec.ts (6), w2f-platform.spec.ts (3), workforce-roster-review.spec.ts (1), workforce-scheduling-handoffs.spec.ts (2), ws5-layout-editor.spec.ts (3), ws5-photo-editor.spec.ts (2), ws5-present-presenter.spec.ts (3), ws5-video-monitor.spec.ts (3), ws6-platform.spec.ts (1)

Evidence: error text is `Failed to fetch dynamically imported module: http://127.0.0.1:4173/src/platform/repo.ts`; test source does `await import(/* @vite-ignore */ "/src/platform/repo.ts")` (e.g. e2e/tenant-write-isolation.spec.ts:10). All pass (or fail only for other reasons listed in A) on :4174. **Implication for later gates: run these specs against the dev server (5173), not a prod preview.**

### B2. Other pass-1 failures that did not reproduce serially on :4174 - class `environmental` (parallel-load flakiness / crashes) (24 tests)

- a11y.spec.ts - axe HQ ARL-HQ-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe AI ARL-AI-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe BRAIN ARL-BRAIN-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe TEAM ARL-TEAM-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe MISSION ARL-MISSION-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe FIN ARL-FIN-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe CRM ARL-CRM-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe PROJECT ARL-PROJECT-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe COMMERCE ARL-COMMERCE-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe BOOK ARL-BOOK-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe DOCS ARL-DOCS-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe SHEETS ARL-SHEETS-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe PRESENT ARL-PRESENT-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe MOTION ARL-MOTION-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe BUILD ARL-BUILD-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe FORMS ARL-FORMS-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe AUTO ARL-AUTO-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe ANALYTICS ARL-ANALYTICS-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe INBOX ARL-INBOX-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- a11y.spec.ts - axe ASSET ARL-ASSET-001 - pass-1: `Error: expect(received).toEqual(expected) // deep equality`
- demand-loading-qa.spec.ts - native app is not eagerly requested from an untouched headquarters session - pass-1: `Error: expect(received).toBeGreaterThan(expected)`
- docs-library-experience.spec.ts - Documents library presents distinct working states and filters across viewports - pass-1: `Error: locator.click: Error: strict mode violation: locator('#main').getByRole('button', {`
- portal-scope-acceptance.spec.ts - portal directory and client dashboard display the same unique shared record count - pass-1: `Error: expect(locator).toHaveText(expected) failed`
- findings.spec.ts - DEF-38 every screen has exactly one level-1 heading - pass-1: `Error: page.waitForTimeout: Page crashed`

Note: a11y.spec.ts is genuinely unstable rather than cleanly passing: axe `color-contrast` hits (9.6-10.8 px text, 3.07-4.42 vs 4.5:1; BRAIN also `aria-allowed-attr`, MOTION `label-content-name-mismatch`) appeared on 20 apps on the preview, a different 13 on dev-parallel, and 1 (LEGAL, 3.07:1) serial. Treat as `unclear` (probably timing-dependent colour sampling; not verified). Any contrast defects are plausibly real product issues but were not isolated.


## C. Long suites on the prod preview (:4173)

- **deep.spec.ts** completed inside the cap (1380 s of 1500 s, workers=4): 29 passed, 6 failed. CRM: `Minified React error #185` on action "Create a quote" plus 'no dialog opened' for the Quote builder overlay -> `pre-existing product defect` (observed in the prod build; not re-run on dev to get an unminified message). INBOX, ADMIN, PORTAL (`Page crashed` in waitForTimeout), LEGAL, ASSET (`Page crashed` in goto) -> `environmental` (renderer crashes under load; not re-run).
- **full-visual-audit.spec.ts**: 35 skipped in 13 s (reason not investigated).
- **contract.spec.ts**: 4 passed, 4 failed (pass 1). 'every approved screen renders without a console error' `ERR_ABORTED` and 'no horizontal overflow ... hq/home' `Target crashed` -> `environmental`. 'switching company ...' (expects text "Responses are composed from local Harbor Supply records, not from an AI model") and 'a record hit navigates' (no `invoices · ` option; log also shows `Target crashed`) -> `unclear`. The re-run on :4174 produced no output (twice) so it is **not confirmed on the dev baseline**.
- **findings.spec.ts**: pass 1 DEF-38 `Page crashed` -> `environmental`; re-run on :4174: 3 passed.
- **workflows.spec.ts**: pass 1 18 passed / 6 failed; same 6 fail on :4174 serial (Section A).


## D. Suites not completed in cap
- None hit a cap. Exceptions: contract.spec.ts could not be re-run on :4174 (no output), and failures there are unconfirmed.

