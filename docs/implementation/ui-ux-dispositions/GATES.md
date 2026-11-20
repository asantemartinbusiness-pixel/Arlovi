# Playwright gate results (Phase 3 item 6)

Run on the shared dev server `http://127.0.0.1:5173` (tree at `9c1be0f`), `--workers=2 --trace off`, retries 0, CPU shared with the orchestrator's typecheck/lint/unit/build. Raw artifacts: `/tmp/claude-0/-home-user-Arlovi/daed2018-a12a-57d1-8b2e-76408c85a8ca/scratchpad/gates/<group>.json|.log`, pass-2 reruns `rerun1.json`, `rerun2.json` (`--workers=1`). `full-visual-audit.spec.ts` excluded by brief (it is a whole-file skip in the baseline).

## Totals

| Group | Specs | Tests | Passed | Failed (pass 1) | Skipped | Wall | After pass 2 (workers=1) |
|---|---|---|---|---|---|---|---|
| a shell+overlay | 13 | 111 | 111 | 0 | 0 | 109 s | 0 failing |
| b navigation+continuity | 14 | 60 | 58 | 1 | 1 | 70 s | 1 deterministic |
| c remaining | 93 | 389 | 384 | 3 | 2 | 575 s | 3 deterministic |
| d workflows | 1 | 24 | 24 | 0 | 0 | 169 s | 0 failing |
| e contract + findings | 2 | 11 | 8 | 3 | 0 | 221 s | 3 deterministic |
| f deep (cap 1800 s, finished in 1040 s) | 1 | 35 | 31 | 4 | 0 | 1040 s | 4 deterministic |
| **Total** | **124** | **630** | **616** | **11** | **3** | | **11 deterministic, 0 flaky** |

Every pass-1 failure failed again when re-run alone with `--workers=1` (header-context-safety, company-collaboration, w2b-people-comms, workforce-visible-page-redesign, contract x3 in `rerun1`; deep MISSION, DOCS, DESIGN, LAYOUT in `rerun2`). No flaky tests. The 3 skips are conditional skips in the specs (record-not-found foreign-company detail, tenant-write-isolation other-company record URL, workspace-resources inspector preview); the last was also skipped in the baseline.

## Deterministic failures


### header-context-safety.spec.ts:97
- Test: switching a local role view never strands the user on a hidden native application
- First assertion: `expect(page).toHaveURL(/\/o\/northline\/portal\//)` at spec line 102; received `/o/northline/mission/missions`, profile menu still open with Owner checked.
- Classification: `regression introduced by the programme`. The test passed on the dev-served baseline. Probe: clicking the Client role radio navigates to `/portal/portals` and closes the menu, but pressing Enter on the focused radio (what the test does) does nothing. So keyboard activation of the inline role list added to `ProfileMenu.tsx` (A7) is broken. Needs a fix (or a Radix key-handling check); the spec itself is right.

### company-collaboration.spec.ts:21
- Test: department people tab stores an association without changing the member's HR record
- First assertion: `getByRole('heading', { name: 'Workspace people' })` not visible (spec line 27).
- Classification: `pre-existing per QA_BASELINE`. Baseline persistent failure (strict-mode violation on the `People` button). That locator is now fixed and the test gets one step further, to a heading string that is absent from baseline and current `src/` (`CompanyPeople.tsx` renders `Workspace membership plan` / `Company directory`). Outdated expectation, unchanged by the programme.

### w2b-people-comms.spec.ts:204
- Test: ADMIN privacy register counts each request only once every app's records are in
- First assertion: `getByRole('dialog').getByText('members 1 · employees 1 · payrollRuns 2 · leaveRequests 7')` not found.
- Classification: `pre-existing per QA_BASELINE`. Identical assertion fails identically on the baseline (persistent list). The other w2b baseline failure (`New draft` strict-mode) now passes.

### workforce-visible-page-redesign.spec.ts:57
- Test: Finance Time inputs exposes distinct review filters and a non-invoice status
- First assertion: `#main` heading `From recorded time to accountable billing.` not found (spec line 60); page shows h1 `Invoice List` with the Time inputs tab.
- Classification: `outdated expectation`. A1 commit a5e3cfb removed that `PageHead` title/eyebrow from `src/applications/fin/invoices.tsx` (the metrics and `Time inputs` tab remain). The spec was not updated. Spec passed on the baseline, so it is new, but it is the programme's intended Finance restructure, not a defect.

### contract.spec.ts:26
- Test: every approved screen renders without a console error
- First assertion: `screens with no level-1 heading` expected `[]`, received `["ARL-DOCS-002"]`.
- Classification: `outdated expectation`. `/docs/documents/nl-documents-001` does render an h1, `<h1 class="dx-bar-h1"><input aria-label="Document title">`, but the spec reads `textContent`, which is empty for an h1 that wraps an input (B1 `chromeTitle: "surface"`, the editor owns the h1). The baseline run of this test failed earlier on ERR_ABORTED so it cannot be compared. Suggest the spec read the input value or accessible name.

### contract.spec.ts:77
- Test: switching company changes the records every global surface reads
- First assertion: `getByText(/Responses are composed from local Harbor Supply records, not from an AI model/)` not found.
- Classification: `pre-existing per QA_BASELINE`. String is in neither the baseline `src/` nor current `src/` (git grep at 456c87d finds none). The baseline run could not confirm this test (contract was never re-run on dev), so it is recorded here as a stale spec string that predates the programme.

### contract.spec.ts:106
- Test: a record hit navigates to the record
- First assertion: `dialog.getByRole('option').filter({ hasText: /invoices · / })` not visible.
- Classification: `outdated expectation`. Result options read `INV-1041 Invoice · paid Finance`. The record-detail format `${singular} · ${status}` is already in `searchRecordProviders.ts` at 456c87d and that file is unchanged, so the spec's `invoices · ` (plural) never matched. Not caused by the programme's `CommandPalette.tsx` edits (they only touch saved/recent rows and the results heading).

### deep.spec.ts MISSION
- Test: deep sweep MISSION (ARL-MISSION-003 tab "Deliverables")
- First assertion: Console error on the Deliverables tab: `In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error` (component tree under `ScreenHost > .pg > .pg-body`).
- Classification: `regression introduced by the programme`. Baseline MISSION deep passed. The Deliverables table is new in B9 (`src/applications/mission`); a button nested inside a button (row/sort/selection wrapper) produces invalid DOM and a React warning. Needs a small fix.

### deep.spec.ts DOCS
- Test: deep sweep DOCS (ARL-DOCS-002 load "render")
- First assertion: `no level-1 heading`.
- Classification: `outdated expectation`. Same cause as contract.spec.ts:26: h1 wraps the editable document-title input, so `textContent` is empty. Valid h1 with an accessible name.

### deep.spec.ts DESIGN
- Test: deep sweep DESIGN (ARL-DESIGN-004 `path operations`, `stroke editing`; ARL-DESIGN-005 `Layout inspector`)
- First assertion: `no dialog opened` for each declared overlay.
- Classification: `outdated expectation`. B2 changed these overlay entries to hand-offs: `path operations` is `<HandOff then={pathFocus...}>` that opens the Operations popover, `stroke editing` and `Layout inspector` move work into the inspector (programme ledger: `stroke in inspector, hand-offs`). The deep sweep still expects a dialog. Baseline DESIGN passed.

### deep.spec.ts LAYOUT
- Test: deep sweep LAYOUT (ARL-LAYOUT-002 overlay `Frame editor`)
- First assertion: `no dialog opened`.
- Classification: `outdated expectation`. Same B2 hand-off pattern (`FrameEditorOverlay` as a compact drawer handing off to the inspector). Baseline LAYOUT passed.

Summary of the 11: 2 `regression introduced by the programme` (header-context-safety role view by keyboard; MISSION Deliverables nested button), 6 `outdated expectation` (Finance Time inputs heading; DOCS editor h1 holding an input, in contract and deep; DESIGN and LAYOUT hand-off overlays in deep; record-hit label that never matched), 3 `pre-existing per QA_BASELINE` (company-collaboration, w2b register, contract company-switch string, the last unconfirmed in the baseline). 0 environmental.

## Comparison with QA_BASELINE

- Baseline: 627 tests on the untouched build (427 pass, 164 fail, 36 skip); 92 environmental (needed the dev server) and 38 persistent pre-existing failures on the dev-served baseline.
- Now (dev server, excluding the 35-test full-visual-audit skip): 630 tests, 616 pass, 11 fail, 3 skip.
- Of the 38 persistent baseline failures, **36 now pass** (each matched by file and title in the current run): all 3 display-scale, display-scaling, 3 drawer-experience, execution-preflight, favourites, 4 profile-menu, 3 profile-role-inline, access-experience, ai-work-assignment, 2 ask-arlovi, linked-task-approvals, 2 on-demand-native-apps, 2 staged-startup, w2a-fin-crm, w2b `New draft`, workforce-roster-review, workforce-scheduling-handoffs, workspace-reliability, and all 6 workflows (WF-01/06/11/13/19/20). **2 still fail**: company-collaboration (`Workspace people`) and w2b `ADMIN privacy register` (both stale expectations).
- All 92 environmental failures pass on the dev server, as does a11y.spec.ts (37/37) with no contrast failures.
- **New failures not in the 38: 9 (8 test titles plus the contract company-switch string, which the baseline could not confirm)** (the 11 minus the 2 persistent): header-context-safety role view, workforce Time inputs, contract x3 (baseline unconfirmed), deep MISSION, DOCS, DESIGN, LAYOUT. Of those only 2 are true regressions (role view keyboard select, MISSION nested button); the rest are outdated expectations or stale strings. The baseline's other deep failures (CRM quote builder `Minified React error #185`, INBOX/ADMIN/PORTAL/LEGAL/ASSET renderer crashes) and contract/findings crashes did not recur: deep 31/35 pass, findings 3/3 pass.

## Per-spec results


### Group a shell+overlay

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| a11y.spec.ts | 37 | 0 | 0 | n/a (all passed) |
| display-scale.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| display-scaling.spec.ts | 16 | 0 | 0 | n/a (all passed) |
| drawer-experience.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| execution-preflight.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| mobile-shell.spec.ts | 8 | 0 | 0 | n/a (all passed) |
| modal-experience.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| native-overlay-experience.spec.ts | 21 | 0 | 0 | n/a (all passed) |
| notification-experience.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| selection-pill.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| toast-clickthrough.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| universal-header.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| viewport.spec.ts | 3 | 0 | 0 | n/a (all passed) |

### Group b navigation+continuity

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| app-journey-and-nav-states.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| apps-all-categories.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| apps-directory.spec.ts | 11 | 0 | 0 | n/a (all passed) |
| command-resume.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| contextual-workspace-navigation.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| favourites.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| header-context-safety.spec.ts | 6 | 1 | 0 | 1 deterministic |
| native-screen-continuity.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| on-demand-native-apps.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| organization-guard.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| profile-menu.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| record-not-found.spec.ts | 1 | 0 | 1 | n/a (all passed) |
| staged-startup.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| workspace-reliability.spec.ts | 3 | 0 | 0 | n/a (all passed) |

### Group c remaining specs

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| access-experience.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| access-management.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| access-matrix.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ai-work-assignment.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| all-native-app-entrypoints.spec.ts | 6 | 0 | 0 | n/a (all passed) |
| ask-arlovi-experience.spec.ts | 8 | 0 | 0 | n/a (all passed) |
| b3-photo-video-motion-refinement.spec.ts | 6 | 0 | 0 | n/a (all passed) |
| b9-mission-integrity.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| build-library-experience.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| cloud-readiness.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| company-collaboration.spec.ts | 1 | 1 | 0 | 1 deterministic |
| company-onboarding.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| contextual-workspace-create.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| crm-book-refinement.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| crm-finance-handoff.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| cross-app-editor-drafts.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| demand-loading-qa.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| docs-library-experience.spec.ts | 14 | 0 | 0 | n/a (all passed) |
| document-review-publication.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| entry-experience.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| entry-visual-consistency.spec.ts | 6 | 0 | 0 | n/a (all passed) |
| finance-a1-integrity.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| finance-period-signoff.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| finance-reconciliation-links.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| finance-settlement-integrity.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| finance-time-inputs.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| first-run-guide.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| forms-library-experience.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| fresh-company-all-apps.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| growth-apps.spec.ts | 19 | 0 | 0 | n/a (all passed) |
| header-inbox-integrity.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| integrations-native-experience.spec.ts | 10 | 0 | 0 | n/a (all passed) |
| lazy-workspace-surfaces.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| linked-task-approvals.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| nango-guided-experience.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| onboarding-resume.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| people-decision-integrity.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| people-directory-profile-redesign.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| people-documents-continuity.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| people-modal-workflows-redesign.spec.ts | 18 | 0 | 0 | n/a (all passed) |
| people-performance-learning-payroll-redesign.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| people-recruitment-onboarding-leave-redesign.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| portal-scope-acceptance.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| present-library-experience.spec.ts | 9 | 0 | 0 | n/a (all passed) |
| proc-commerce-a2.spec.ts | 16 | 0 | 0 | n/a (all passed) |
| profile-role-inline.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| project-inbox-continuity.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| search-native-content.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| search-remote-gate.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| search-sources.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| search-v2.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| seed-preservation.spec.ts | 1 | 0 | 0 | n/a (all passed) |
| sheets-library-experience.spec.ts | 9 | 0 | 0 | n/a (all passed) |
| team-agent-overview.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| tenant-write-isolation.spec.ts | 1 | 0 | 1 | n/a (all passed) |
| w2a-fin-crm.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| w2b-people-comms.spec.ts | 6 | 1 | 0 | 1 deterministic |
| w2c-analytics-report.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2c-auto-builder.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| w2c-brain-collections.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2c-mission-schedule.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| w2c-team-agent-teams.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| w2d-design-keyboard.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2d-docs-editing.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2d-present-audience-window.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| w2d-sheets-editing.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2e-layout-photo.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| w2e-video-motion.spec.ts | 6 | 0 | 0 | n/a (all passed) |
| w2f-platform.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| w2g-growth.spec.ts | 7 | 0 | 0 | n/a (all passed) |
| websites-library-experience.spec.ts | 11 | 0 | 0 | n/a (all passed) |
| workforce-roster-review.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| workforce-scheduling-handoffs.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| workforce-visible-page-redesign.spec.ts | 2 | 1 | 0 | 1 deterministic |
| working-draft-status.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| workspace-continuity.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| workspace-navigation.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| workspace-redesign.spec.ts | 5 | 0 | 0 | n/a (all passed) |
| workspace-resources.spec.ts | 3 | 0 | 1 | n/a (all passed) |
| ws1-admin-access.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| ws1-asset-library.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ws1-hq-command.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| ws1-inbox-triage.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ws2-knowledge-workspace.spec.ts | 4 | 0 | 0 | n/a (all passed) |
| ws2-mission-brief.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| ws2-team-contract.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| ws3-operations.spec.ts | 6 | 0 | 0 | n/a (all passed) |
| ws4-growth.spec.ts | 9 | 0 | 0 | n/a (all passed) |
| ws5-layout-editor.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ws5-photo-editor.spec.ts | 2 | 0 | 0 | n/a (all passed) |
| ws5-present-presenter.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ws5-video-monitor.spec.ts | 3 | 0 | 0 | n/a (all passed) |
| ws6-platform.spec.ts | 8 | 0 | 0 | n/a (all passed) |

### Group d workflows

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| workflows.spec.ts | 24 | 0 | 0 | n/a (all passed) |

### Group e contract+findings

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| contract.spec.ts | 5 | 3 | 0 | 3 deterministic |
| findings.spec.ts | 3 | 0 | 0 | n/a (all passed) |

### Group f deep

| Spec | Passed | Failed | Skipped | Pass 2 (workers=1) |
|---|---|---|---|---|
| deep.spec.ts | 31 | 4 | 0 | 4 deterministic |

## Closing fixes

| # | Item | Fix | Kind | Result |
|---|---|---|---|---|
| 1 | header-context-safety role radio Enter | `ProfileMenu.tsx`: Radix refocused the menu root on pointer-leave of the Preview item (focus stolen from the radios, flaky); suppressed it, and Enter/Space on role radios now share the click path incl. redirect | product | pass (6 repeats) |
| 2 | MISSION Deliverables nested button | `data-grid.tsx`: custom mobile card is a keyboard-operable `role=group` div (not a button); plain cards unchanged | product | no console warning at 1440 and 390; deep MISSION pass |
| 3 | DOCS h1 empty textContent | `docs/index.tsx`: `ds-sr-only` span with the title beside the input | product | contract "every approved screen" and deep DOCS pass |
| 4 | deep DESIGN / LAYOUT overlays | `deep.spec.ts`: overlay satisfied by dialog OR toast / status notice hand-off; console-error check kept | spec stale | pass |
| 5 | Finance Time inputs heading | asserts "Billable time queue" toolbar heading | spec stale | pass |
| 6 | record hit label | `/Invoice · /` | spec stale | pass |
| 7 | Workspace people | heading is "People & collaboration" | spec stale | pass |
| 8 | ADMIN privacy register | counts now in Collection scope row as "members: 1 · ..." | spec stale | pass |
| 9 | switching company | asserts "No language model is connected. Answers come from records in Harbor Supply, not from an AI model" | spec stale | pass |

Checks: five-spec run 27/27 pass; deep DOCS/DESIGN/LAYOUT/MISSION pass; eslint clean; tsc 0 errors; registry-contract 4/4.

## Hardening (after the CI fixes)

- `commitTogether` moved to `src/platform/commit.ts`; all 15 importers and the write-integrity unit test point there.
- ESLint `no-restricted-syntax` now rejects `await …mutate.patch(...)` as a bare statement. It found 6 remaining unchecked writes, all fixed:
  analytics dashboard and report layout writes (toast when refused), asset tag editor (typed tags restored when refused),
  automation resume (revision re-checked before any write is reapplied; a refused outcome write stops the success toast),
  automation last-run summary (stated when not updated), inbox approval rollback (says when the target could not be reset).
- WF-16 expectation aligned with the B7 record header (h1 is the portal name).
- Re-runs: typecheck 0, lint 0, vitest 829/829, analytics/automation/asset/workflow specs 34/34 with journeys 24/24.

## Seed enrichment and attribution readiness

- Two seeded trade orders (ORD-401, ORD-404) now carry a recorded campaign link to "Winter trade list 2026".
  Fresh workspaces only: seeding inserts missing records and never rewrites existing ones, so no seed-version bump.
- Found while verifying: Marketing attribution counted orders before Commerce's records had loaded
  (first visit read "2 of 2" unattributed). Its tabs and the metric-notes drawer now use the Analytics
  fixtures-ready gate; first visit reads "7 of 9". New spec `e2e/marketing-attribution-ready.spec.ts`.
- Deposit-bearing bookings were already seeded (one paid locally, six awaiting payment); the report's
  item was wrong and is corrected. The sample photo still opens the blend picker on an adjustment layer,
  which the picker explains and a B3 spec asserts; left as is.
- Re-runs: growth suites and the new spec 43/43, journeys 24/24, deep MARKET/COMMERCE pass. The background
  deep sweep run alongside other suites failed CONNECT and IT once; both pass when re-run alone (2/2).

## Browser QA workflow (desktop / tablet / mobile)

- This workflow (`browser-qa.yml`, `playwright.qa.config.ts`) was not in the earlier gate runs. On `main` it fails 4
  (role-view stranding on all three sizes, phone notifications footer). This branch already fixes the role-view one.
- The People profile spec (rewritten in A4) clicked the app sidebar, which tablet and phone keep behind
  "Open navigation"; it now opens the menu as a person on those devices would.
- The phone notifications drawer hid "Reading is not approval." to save width; the footer now wraps and keeps it.
- Local re-run of the whole Browser QA config: 306/306 on desktop, tablet and mobile.
- CI then showed a fourth device failure: the Harrow House portal directory read 6 shared records while the
  client dashboard read 7, then 8, as other applications' records landed in the background. Portal screens and
  overlays now use the same fixtures-ready gate as Analytics (the gate now also wraps overlays). Re-runs: portal,
  analytics, growth and journey specs 65/65, deep PORTAL/ANALYTICS pass, native overlays 21/21, Browser QA 306/306.
- `ci.yml` on 23641fc: 626 pass, 2 fail. (1) a11y "command palette": Escape sometimes arrived before the palette
  had moved focus in and attached its Escape listener (both ran after paint); reproduced 1 in 8 locally. Both now
  run before paint; 30/30 repeats and 56/56 across a11y, header and search suites. (2) WF-06 clicking a candidate
  did not leave Recruitment; not reproduced locally (17/17, including 12 at four workers). The candidate card is a
  plain navigating button and the screen host's URL writes were checked; left open pending a repeat in CI.
- `ci.yml` on cbe4e51: palette passed; WF-06 again, plus Brain "Saturday closing time". Reproduced Brain under
  CPU load: the screen host drew an application as soon as its screens registered, before that application's own
  fixtures were written, so the conflicts board showed only the base seed's conflict (no recorded versions). The
  host now shows the loading state until the application is ready. WF-06: Marta Nowak is on both the Offers and
  Candidates panels; the spec looked her up before the panel switched and clicked the Offers card. It now waits for
  the Candidates tab and clicks her candidate button. Under load: 16/16 (Brain and WF-06, 4 repeats); vitest 829/829.
- CI on 4209671: all checks pass. A local full run of the CI suite (627 pass, 1 fail, 38 skipped) failed MARKET plan
  approval once: its action helper gave the page 1.5 s before looking in the overflow menu, which an application still
  opening can exceed. Both copies of the helper now wait for the loading state to clear; growth and journey specs
  31/31, growth under load 21/21.
