# W2C: AUTO, ANALYTICS, BRAIN, TEAM, MISSION (wave 2, 18 November 2026)

Branch: `w2-intelligence`, cut from `29537d4`. Dev server used for checks: port 5183.

## ARL-AUTO-002 Visual workflow builder (`/o/:org/auto/workflows/:id`)

**Changes**
- **Bindings come from the trigger's schema.** The new module `auto/schema.ts` reads the fields that the trigger collection's records actually carry in this workspace. Each field has a type and a coverage count. Each step also sees the variables bound by Variable nodes that run before it, plus approval decisions and the system bindings.
- **References are validated.** These are all checked: condition fields, Variable expressions, `{path}` references in title, summary and log templates, and trigger filter fields. The check reports three problems:
  - an unknown field, with the nearest real field suggested;
  - a variable used before the node that binds it;
  - a field that cannot be checked yet because the collection has no records. This one is a warning.
- **Where the checks run.** `auto/validate.ts` combines these checks with the graph checks. The builder, the validation drawer, the library counts, the activation review and the Validate/Activate guards all use it. The library now loads every collection a trigger watches; before, it loaded only invoices, so tickets and products workflows showed a false "no records" warning.
- **Local test card on the Design tab.** It is labelled **"Local test — no external actions performed"**.
  - You pick a sample record from the trigger's collection. Records that do not match the trigger can be picked too, and the trace says a real run would not pick them.
  - Each approval gate can be set to "stop and wait", "assume approved" or "assume rejected".
  - The interpreter runs in dry-run mode. The path taken is listed step by step, with the decision made at each branch. Steps not reached are listed. Each step in the list selects its node, and the canvas highlights the path.
  - An assumed approval is described as an assumption, never as a recorded decision.
- **Node inspector.** It suggests binding paths through a datalist, shows reference errors inline on each field, lists the bindings available at that step, and shows the step's last local-test result.
- **Layout.** The builder surface now has the page gutter, which it was missing before. The grid is palette | canvas (wide) on the first row, then local test | inspector, then validation. The "Remove node" button now wraps instead of overflowing.
- **Dry run on the Test tab.** It also uses the chosen sample.

**Persistence:** saving the graph persists to the workflow record, and an edited condition value survives a reload (e2e). A local test writes nothing and adds no run to Run History (e2e asserts this).

**Responsive:** checked at 1440 and 390 px. No horizontal overflow at 390 px (e2e).

**Tests**
- `tests/unit/w2c-auto-schema.test.ts`: 11 tests.
- `e2e/w2c-auto-builder.spec.ts`: 3 tests.

**Status:** Verified.

**Gaps**
- Seeded CRM workflows (`nl-workflows-720/721`) now show a reference error. Their default condition reads `record.amountMinor`, but their trigger watches tasks, which carry no amount. The error is honest. The seed belongs to CRM.
- The palette column stays tall next to the canvas.

## ARL-ANALYTICS-004 Report builder (`/o/:org/analytics/reports/:id`): query reports

**Changes**
- **New query report kind.** It is created from "New report" with the kind set to Query, and stored as `body.explore`.
- **Builder controls:** collection, measure (count, sum, average, minimum or maximum of a numeric field inferred from the records), group by (none, month, week or any text field), date field, date range (all dates, 30 days, 90 days, 12 months, year to date, or between two dates) and typed filters. A filter on a money field takes major units.
- **Live result.** The result shows a bar or line chart, a table with totals, and stats for included and excluded records.
- **"How this is computed" panel.** It shows:
  - the formula;
  - the source, labelled **"This workspace's records"**;
  - every exclusion step with counts (outside the range, without a date, removed by filters);
  - records with no value, which are left out rather than counted as zero;
  - groups hidden by the row limit;
  - a warning when currencies are mixed.
- **Drill-down.** Each group row opens the records behind it. Every record link uses `routeForRecord`. The Data tab lists every included record, and the Layout tab sets the chart type, ordering and row limit.
- **Saving and export.** "Save report" persists the query, and an unsaved-changes state is shown until then. "Export CSV" exports every group, including the hidden ones, with the formula and source.
- **Reaching reports.** The report library is now on the Dashboards "All" tab. The Distribution empty state used to link to the dead `/analytics/reports/new`; it now opens the create dialog. "Add a chart" on a query report explains that it applies to written reports.
- **Owned failure, WF-15.** Root cause: figures were recomputed while background fixtures were still loading, so revenue came from a partial ledger. **Product fix:** every Analytics tab and surface waits for `loadAllSeeds()` and shows a loading state until then (`analytics/ready.tsx`). With the full ledger the product correctly reads "newest 1 day old", and the journey regex required "days". **Test change:** that regex now accepts `days?`. This was test drift; the product already pluralised correctly. WF-15 passed with `--repeat-each=3`.

**Tests**
- `tests/unit/w2c-analytics-explore.test.ts`: 8 tests.
- `e2e/w2c-analytics-report.spec.ts`: 3 tests, covering reload persistence, the CSV download, the drill-down link into Finance and a 390 px phone.

**Status:** Verified.

**Gaps**
- A query report does not seed a demo record, because WF-15 asserts exactly one report on Distribution.
- Publishing a query report cites no catalogue figure.

## ARL-BRAIN-001 Knowledge collections

**Changes**
- A selected collection can be renamed and edited: name, description and review interval. Duplicate names are refused.
- **Delete** asks for confirmation. Every record in the collection moves to "No collection" with its content, sources and review state unchanged, then the collection record is removed.
- A "No collection" group lists records whose collection is unset or no longer exists.

**Tests**
- `tests/unit/w2c-brain-collections.test.ts`: 3 tests.
- `e2e/w2c-brain-collections.spec.ts`: 2 tests, covering reload persistence and that the deleted collection stays deleted.

**Status:** Verified.

**Gap:** an unfiled record must be given a collection when it is next edited, because the existing editor rule requires one.

## ARL-TEAM-002 / 003 / 005 Agent teams

**Changes**
- New `agentTeams` resource. Each team has a name, a purpose, member AI employees, a lead (who must be a member), an approval policy and a named human approver.
- **Validation** refuses archived or unknown members, a lead outside the team, duplicate names, and an approver who is not a person. Paused, draft or inactive-lead members raise a note but do not block saving.
- **Where teams appear:**
  - On the directory: create, edit, archive and restore.
  - On the organisation chart: lead → members, and the approver.
  - On each AI employee's profile: an "Agent teams" row, with "(lead)" where it applies.
- The UI states that a team grants no tool or source and produces no output.
- **Seed:** "Supplier review desk".

**Tests**
- `tests/unit/w2c-team-agent-teams.test.ts`: 6 tests.
- `e2e/w2c-team-agent-teams.spec.ts`: 2 tests.

**Status:** Verified.

## ARL-MISSION-004 Plan → Timeline task bars

**Changes**
- Tasks gain dates honestly: a person sets a start date, a due date or both. Inputs are validated as whole days, and dates can be cleared.
- Dated tasks are drawn as bars against today and the mission due date.
- A task that starts before a task it depends on is due is flagged.
- Nothing is inferred from hour estimates.

**Tests**
- `tests/unit/w2c-mission-schedule.test.ts`: 4 tests.
- `e2e/w2c-mission-schedule.spec.ts`: 2 tests.

**Status:** Verified.

## Verification
- `tsc`: 0 errors.
- `eslint` on every changed app directory, test and spec: clean.
- `vitest`: 59 files, 524 tests passed.
- Playwright: `w2c-*` (15), `ws2-*` (6) and `ai-work-assignment` passed: 21 tests in total.
- Journeys: WF-13 passed, WF-09 passed, WF-15 passed 3 of 3 times.
- **WF-01 fails before the BRAIN, TEAM and MISSION steps.** It looks for "Every provider here is not connected" on `/connect/marketplace`. That text was removed by the integrations redesign (`ff0b715`) in the base commit. This is CONNECT territory and was not changed here.
- **WF-03 fails in Finance.** `/fin/reports` shows revenue from a partial ledger read. The Finance workstream owns that fix.

## Shared-file proposals
- The ScreenHost "Record not found" guard makes `/analytics/reports/new` unreachable. A report-library route or nav entry would make the library discoverable without going through Dashboards.
- `RECORD_ROUTES` has no entry for `agentTeams` or `workflows`. Adding one would let global search open them.
