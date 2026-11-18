# W2B — People, Communications and Administration: depth pass, 2026-11-18

Branch: `w2-people-comms` (from `29537d4`). Apps in scope: HR (People), COMMS (Communications), ADMIN (Administration).
Everything persists through the existing workspace mutations (`context.mutate.create/patch/remove`, IndexedDB via Dexie),
is scoped to the current organisation and writes an audit event naming the actor. No provider is implied anywhere: mail is
never sent, invitations are never delivered, calendar answers are only those recorded here, and suspending a member does
not close accounts outside Arlovi.

## Owned failures

### WF-19 Sensitive data deletion/export (`e2e/workflows.spec.ts`) — product fixed, test unchanged
- **Symptom:** the Requests register showed `1` record for "Rowan Pike — erasure" (expected 11) and fewer than 34 for Sam Okafor.
- **Root cause:** the count is live (`useOrgRecords` → Dexie live query) and computed from the right scope
  (`subjectRecords`: request collections + org, following links). It was computed **before the seeds landed**: since
  `29537d4` every app's fixtures load in the background after start-up, and the register rendered from whatever was in the
  store at that instant (only the ADMIN member record for Rowan Pike). The expectation had not drifted: with every seed in,
  the same function yields 11 (members 1, employees 1, payrollRuns 2, leaveRequests 7) and 34.
- **Why it is a product defect, not a test race:** a privacy officer would read a partial figure as complete, and the export
  and "Delete where lawful" dialogs could have acted on a partial set (an erasure silently missing records).
- **Fix:** `useSettledOrgRecords()` in `src/applications/admin/pieces.tsx` awaits `loadAllSeeds()` (dynamic import of
  `@/applications`, so it also starts the load when needed) and returns `null` until then; results are tagged with the
  settled flag so a pre-seed snapshot is never shown. The register shows "Counting the records each request covers" until
  the set is complete; the review/export dialog shows "Counting…" and disables export; the deletion impact waits too.

### WF-06 Hire-to-onboard (`e2e/workflows.spec.ts`) — test drifted from intentional product changes; test updated
Each step was checked against `git log -S`:
- `getByLabel("Role")` / "Create the record" → the intake dialog was redesigned on purpose (`3e8924a`, three-step
  local record with "Job title" and "Create employee record"; asserted by `people-modal-workflows-redesign.spec.ts`).
- "Record the grant" → replaced on purpose by an attested "Record local review" that never claims a grant (`8704d38`).
  The test now ticks the attestation checkbox, checks the button is disabled before it, and still asserts DONE.
- Checklist step names "Payroll inputs added / Workspace sign-in granted / Health and safety module" → the honest names in
  `hr/decisions.ts` ("Payroll inputs reviewed", "Request workspace sign-in access", "Health and safety learning").
- "Nothing here is filed or paid" → current wording "Nothing on this page is filed or paid."
- One product change: the onboarding card title wrapped the starter name together with the avatar initials, so the name
  was not addressable as its own element; it is now in its own `<span>` (no visual change).
No assertion was removed or weakened.

## Screens changed

### ARL-COMMS-005 · Email Inbox — `/o/:org/comms/email`
- **Changes:** search across every folder (subject, addresses, labels, message text; every word must match) with a result
  count and a Folder column; folder list with counts plus "New draft"; Drafts tab carries "Not sent — no mail provider
  connected" with "Request a mailbox connection" (records a configuration request, connects nothing); drafts show a
  NOT SENT pill; opening a draft reopens it in the composer; bulk "Discard" on drafts.
- **Composer (Compose window / Compose overlays):** To, Cc, Subject, Message; autosave ~0.9 s after typing stops, writes
  chained so a draft is never created twice; status pill says "Saved in this browser HH:MM" only after the write resolves;
  malformed addresses block saving with a named error; warnings for empty subject/body/recipients and bulk sends; Discard.
- **Persistence:** draft and edits survive reload (e2e). **Responsive:** 390 px — folder list collapses to the tabs, notice
  wraps its action, no horizontal scroll (e2e + screenshot). **Status:** Verified.

### ARL-COMMS-007 · Calendar — `/o/:org/comms/calendar`
- **Changes:** Day is an hour timeline (07–18 plus out-of-hours events) with "+ Add at HH:00" on free hours and Edit on each
  event; Week empty cells create an event at that day/hour; **Agenda** is now a real 3-week list grouped by day (before it
  rendered the Day view — a tab that did not change content); clash markers on events.
- **Event form (new / edit):** title, date, start, minutes, where, attendees (organiser always included), linked record
  (contact, deal, project, candidate or employee), agenda one item per line with optional owner and minutes; live clash
  hint naming the meeting and the people who clash, cleared when the time moves; agenda-longer-than-meeting warning;
  clashing events save as tentative; "Invites are not sent".
- **Persistence/tests:** create, edit, reload, Agenda listing (e2e). **Responsive:** 390 px no overflow. **Status:** Verified.

### ARL-COMMS-008 · Meeting — `/o/:org/comms/meetings/:id`
- **Call:** status pill, Edit details, agenda items to tick off with "x of y covered · planned vs booked minutes" and an
  over-planned warning, linked-record card with a working link (`routeForRecord`).
- **Notes:** notes with unsaved-state; actions with owner (attendees) — the "Record an action" button used to open the
  recording-consent dialog; it now records an action; "Make a task" creates a Projects task assigned to the owner with
  `sourceMeetingId` and the action links to it.
- **Participants:** answers (Invited/Accepted/Tentative/Declined) recorded per person with who recorded it and when, tally,
  remove attendee, invite. Nothing is ever shown as accepted unless somebody recorded it here.
- **Persistence/tests:** answers, actions, task link survive reload (e2e, desktop and 390 px). **Status:** Verified.

### ARL-HR-003 · Employee profile (Access lens) and the departure dialog — `/o/:org/hr/employees/:id`
- **Changes:** recording a departure previews and creates a 4-step leaver checklist: equipment/keys/documents (People),
  final pay inputs with the untaken-leave figure (Finance), work handed over (manager), workspace access suspended in
  Administration (Admin access). People/Finance/manager steps are ticked on the Access lens with a progress meter; the
  access step cannot be ticked in People and links to Administration. Existing dialog contract (3 sections, 3 checkboxes,
  reason ≥ 10 chars) kept.
- **Persistence/tests:** e2e through to ADMIN and back, with reload. **Status:** Verified.

### ARL-ADMIN-002 · Members & Invitations — `/o/:org/admin/members`
- **Members:** "From People" card lists leavers whose access step is open, with member status and active sessions;
  "Review and suspend" opens the existing OFFBOARD step-up, which now also closes the People leaver step; when there is no
  member (or it is already suspended) "Confirm and close the step".
- **Teams:** was read-only ("Departments are created in Headquarters"). Now: add a team (name, lead, purpose; duplicate
  names refused), change a team's lead, move members between teams; members with a missing/unknown department appear under
  Unassigned instead of disappearing.
- **Persistence/tests:** e2e with reload. **Responsive:** 390 px no overflow. **Status:** Verified.

### ARL-ADMIN-008 · Privacy & Data Controls — `/o/:org/admin/privacy`
- Settled counting (above); the review dialog now says where the matched records are ("members 1 · employees 1 ·
  payrollRuns 2 · leaveRequests 7"); Processing tab subtitle says it is counting until complete. **Status:** Verified.

## Tests
- Unit: `tests/unit/w2b-comms-schedule.test.ts` (9) — recipients/validation, draft round trip, cross-folder search,
  clashes (shared people, Everyone, self-exclusion, finished), agenda parsing/formatting, seeded agenda, answer tally,
  upcoming grouping.
- E2E: `e2e/w2b-people-comms.spec.ts` (7) — email drafts, calendar, meeting, HR→ADMIN leaver handoff, teams, privacy
  register, phone viewport.
- Results are in the final section below.

## Remaining gaps (honest)
- Times in the event form are UTC to match the seeded diary; the org timezone (Europe/London) equals UTC in November but
  not in summer.
- Recurring meetings are displayed but cannot be edited as a series; editing changes the one record.
- Linked records list contacts, deals, projects, candidates and employees only.
- The leaver checklist is created only for departures recorded after this change; Rowan Pike / Oliver Grant (seeded
  alumni) show "No leaver checklist".
- HR time-off balances still use the stored `leaveTaken`; reconciling it against approved leave requests was not done here.
- Shared-change proposal: `useSettledOrgRecords` would be useful platform-wide (`@/platform/workspace`) for any screen that
  counts across apps; it lives in ADMIN to respect file ownership.

## Verification results (dev server on 127.0.0.1:5182)
- `npx tsc --noEmit` — 0 errors. `npx eslint` on hr, comms, admin, the new unit test and both touched e2e specs — clean.
- `npx vitest run` — 55 files, 501 tests passed (includes the previously failing marketing-workareas test, now green on this base).
- `e2e/workflows.spec.ts -g "WF-06|WF-19"` — 2 passed.
- `e2e/w2b-people-comms.spec.ts` — 7 passed.
- Regression: all `e2e/people-*.spec.ts`, `e2e/workforce-*.spec.ts`, `e2e/ws1-admin-access.spec.ts`, `e2e/ws3-operations.spec.ts`
  (includes the COMMS channel test) — 55 passed.
- `e2e/a11y.spec.ts -g "axe (COMMS|ADMIN|HR) "` — 3 passed.
- `e2e/deep.spec.ts` sweeps for COMMS, ADMIN, HR fail in this worktree only on 403s for `@fontsource` files served from the
  symlinked `node_modules` (outside Vite's fs allow-list in a worktree) — an environment artefact. Apart from those, HR reports
  one pre-existing nested-button warning on ARL-HR-008 Scheduling › Exceptions, a screen this pass did not change.
- Screenshots at 1440 and 390 px (email drafts, calendar Day/Week/Agenda, meeting, members Teams, privacy Requests):
  no horizontal overflow.
