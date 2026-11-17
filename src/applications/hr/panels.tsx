import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Inbox, UserPlus, Users,
} from "lucide-react";
import {
  Avatar, BarChart, Button, Card, Checkbox, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice,
  Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, clockIso, daysBetween, startOfMonth, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { EmploymentPill, RoleViewNote, leaveBalance, salaryText } from "./kit";
import { MyLearning, recordAcknowledgement, setDirectoryTeam, useDirectoryTeam } from "./shared";
import { leaveRequestDays, planLeaveDecision } from "./decisions";
import { planTimesheetApprovals } from "./workforce";
import { intervalsOverlap, validShiftInterval } from "@/domain/scheduling";
import { linkedPersonnelDocuments, scopedDetailRecord } from "@/platform/recordScope";
import { dailyCoverage, employeeOnLeave, localDayKey, rosterDateLabel, rosterShiftsForDay, rosterWeekDays, shiftDays } from "./rosterView";
import { OpsHeader, OpsMetric, OpsMetrics } from "@/applications/shared/operational-surfaces";

/* ------------------------------------------------------------------ *
 * Shared reads
 * ------------------------------------------------------------------ */

export function useHrData() {
  return useCollections([
    "employees", "members", "departments", "applicants", "positions", "leaveRequests",
    "shifts", "payrollRuns", "reviews", "policies", "courses", "tasks",
  ]);
}

function humans(rows: Rec[]): Rec[] {
  return rows.filter((row) => row.status !== "alumni" && row.fields.employment !== "contractor");
}

function aiEmployees(rows: Rec[]): Rec[] {
  return rows.filter((row) => row.fields.kind === "ai");
}

function departmentName(departments: Rec[], id: unknown): string {
  return departments.find((department) => department.id === id)?.title ?? "Unassigned";
}

/** Whose leave this is: the named field, else the linked employee, else the owner. */
function leavePerson(request: Rec, employees: Rec[]): string {
  const named = String(request.fields.employeeName ?? "").trim();
  if (named) return named;
  const linked = employees.find((employee) => employee.id === request.fields.employeeId);
  return linked?.title ?? request.ownerName;
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function leaveDays(record: Rec): number {
  return leaveRequestDays(record);
}

/* ------------------------------------------------------------------ *
 * ARL-HR-001 · People Overview
 * ------------------------------------------------------------------ */

export function PeopleOverview({ context, lens }: { context: ScreenContext; lens: "Overview" | "My team" | "HR tasks" | "Trends" }) {
  const data = useHrData();
  const { now, actor, org } = useWorkspace();
  const staff = humans(data.employees);
  const agents = aiEmployees(data.members);
  const pendingLeave = data.leaveRequests.filter((request) => request.status === "requested");
  const onboarding = data.tasks.filter((task) => task.fields.kind === "onboarding");
  const openOnboarding = onboarding.filter((task) => task.status !== "done");
  const openRoles = data.positions.filter((position) => position.status === "open");
  const reviewsDue = data.reviews.filter((review) => ["draft", "scheduled", "submitted"].includes(review.status));
  const policiesDue = data.policies.filter((policy) => policy.fields.kind === "hr" && policy.fields.acknowledgementRequired === true);
  const [teamQuery, setTeamQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "Leave approval" | "Onboarding" | "Review" | "Hiring">("all");
  const dueCount = pendingLeave.length + openOnboarding.length + reviewsDue.length + openRoles.length;

  if (lens === "My team") {
    const mine = data.employees.filter((employee) => String(employee.fields.manager ?? "") === actor
      && employee.status !== "alumni");
    const results = mine.filter((employee) => [employee.title, employee.fields.title,
      departmentName(data.departments, employee.fields.departmentId)].some((value) =>
      String(value ?? "").toLowerCase().includes(teamQuery.trim().toLowerCase())));
    const approvedLeave = data.leaveRequests.filter((request) => request.status === "approved"
      && mine.some((employee) => employee.id === request.fields.employeeId));
    const teamOnboarding = openOnboarding.filter((task) =>
      mine.some((employee) => employee.id === task.fields.employeeId));
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Overview / My team"
          title="Your team, person by person."
          description="Reporting lines, leave and onboarding progress in one place. Only staff explicitly assigned to you appear here."
          actions={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees?tab=People`)}>Open directory</Button>}
          note={`Showing direct reports whose manager field matches ${actor}.`}
        />
        <OpsMetrics label="My team status">
          <OpsMetric label="Direct reports" value={mine.length} detail="Current records" />
          <OpsMetric label="Approved leave" value={approvedLeave.length} detail="Leave request records" />
          <OpsMetric label="Open onboarding" value={teamOnboarding.length} detail="Incomplete checklist items" />
          <OpsMetric label="Without department" value={mine.filter((employee) =>
            !data.departments.some((department) => department.id === employee.fields.departmentId)).length}
            detail="Department link needs review" />
        </OpsMetrics>
        <div className="ops-toolbar">
          <strong className="ops-toolbar-heading">People reporting to you</strong>
          <div className="hr-directory-search">
            <TextInput aria-label="Search my team" placeholder="Search by name, role or department"
              value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} />
          </div>
          <span className="ops-toolbar-note">{results.length} of {mine.length}</span>
        </div>
        {mine.length === 0 ? (
          <Empty title={`Nobody reports to ${actor} in this workspace`} icon={<Users size={20} />}>
            Reporting lines come from employee records. Assign a manager on a person's profile to see them here.
          </Empty>
        ) : results.length === 0 ? (
          <Empty title="Nobody matches this search" icon={<Users size={20} />}>
            Clear the search to return to the team.
          </Empty>
        ) : (
          <Grid>
        {results.map((employee) => {
          const balance = leaveBalance(employee);
          const booked = data.leaveRequests.filter((request) => request.fields.employeeId === employee.id && request.status !== "declined");
          return (
            <Card
              key={employee.id}
              span={4}
              title={<Row gap={2}><Avatar name={employee.title} size="sm" />{employee.title}</Row>}
              subtitle={String(employee.fields.title ?? "")}
              actions={<EmploymentPill record={employee} />}
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees/${employee.id}`)}>Open profile</Button>}
            >
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Department", value: departmentName(data.departments, employee.fields.departmentId) },
                  { label: "Leave left", value: balance.known ? <span className="ds-num">{balance.left} of {balance.allowance} days</span> : "Not recorded" },
                  { label: "Requests", value: `${booked.length} on record` },
                ]} />
                <Meter value={balance.taken} max={Math.max(1, balance.allowance)} label={`${employee.title} leave used`} tone={balance.left <= 2 ? "warning" : undefined} />
              </Stack>
            </Card>
          );
        })}
          </Grid>
        )}
      </Stack>
    );
  }

  if (lens === "HR tasks") {
    const rows = [
      ...pendingLeave.map((request) => ({ id: request.id, kind: "Leave approval", title: request.title, detail: request.summary, due: request.startAt, to: `/o/${org.slug}/hr/leave` })),
      ...openOnboarding.map((task) => ({ id: task.id, kind: "Onboarding", title: task.title, detail: task.summary, due: task.dueAt, to: `/o/${org.slug}/hr/onboarding` })),
      ...reviewsDue.map((review) => ({ id: review.id, kind: "Review", title: review.title, detail: review.summary, due: review.dueAt, to: `/o/${org.slug}/hr/performance` })),
      ...openRoles.map((position) => ({ id: position.id, kind: "Hiring", title: position.title, detail: position.summary, due: undefined, to: `/o/${org.slug}/hr/recruitment` })),
    ];
    const filtered = taskFilter === "all" ? rows : rows.filter((row) => row.kind === taskFilter);
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Overview / HR tasks"
          title="People decisions, in one queue."
          description="Review leave, onboarding, performance and hiring tasks without losing sight of their owning workflow."
          actions={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Exceptions`)}>Scheduling exceptions</Button>}
          note="A row opens its native workflow; no decision is taken automatically."
        />
        <OpsMetrics label="People task overview">
          <OpsMetric label="Total outstanding" value={rows.length} detail="Recorded work items" />
          <OpsMetric label="Leave requests" value={pendingLeave.length} detail="Awaiting a decision" emphasis={pendingLeave.length ? "attention" : "neutral"} />
          <OpsMetric label="Onboarding tasks" value={openOnboarding.length} detail="Checklist steps to complete" />
          <OpsMetric label="Hiring and reviews" value={openRoles.length + reviewsDue.length} detail="Open roles and recorded reviews" />
        </OpsMetrics>
        <div className="ops-toolbar" aria-label="Filter HR tasks">
          <strong className="ops-toolbar-heading">Work queue</strong>
          {(["all", "Leave approval", "Onboarding", "Review", "Hiring"] as const).map((filter) => (
            <Button key={filter} size="sm" variant={taskFilter === filter ? "secondary" : "ghost"}
              aria-pressed={taskFilter === filter} onClick={() => setTaskFilter(filter)}>
              {filter === "all" ? "All" : filter}
            </Button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <Empty title={rows.length ? "No tasks match this filter" : "No people work is outstanding"} icon={<ClipboardCheck size={20} />}>
            {rows.length ? "Choose another filter to see outstanding decisions." : "New leave, onboarding, hiring and review work appears here."}
          </Empty>
        ) : (
      <DataGrid
        rows={filtered}
        rowId={(row) => row.id}
        label="People work"
        columns={[
          { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "Leave approval" ? "warning" : row.kind === "Hiring" ? "accent" : "info"}>{row.kind}</Pill>, sortValue: (row) => row.kind, filterValue: (row) => row.kind },
          { key: "title", header: "Item", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.detail}` },
          { key: "detail", header: "Detail", cell: (row) => <span className="ds-subtle">{row.detail}</span>, hideBelow: 900 },
          { key: "due", header: "Due", align: "end", cell: (row) => (row.due ? context.date(row.due) : "—"), sortValue: (row) => row.due ?? "~" },
        ]}
        onOpen={(id) => { const row = filtered.find((item) => item.id === id); if (row) context.navigate(row.to); }}
      />
        )}
      </Stack>
    );
  }

  if (lens === "Trends") {
    const byDepartment = data.departments.map((department) => ({
      label: department.title,
      people: staff.filter((employee) => employee.fields.departmentId === department.id).length,
      agents: agents.filter((member) => member.fields.departmentId === department.id).length,
    }));
    const months = [5, 4, 3, 2, 1, 0].map((back) => {
      const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      const taken = data.leaveRequests.filter((request) => request.status === "approved" && request.startAt && new Date(request.startAt) >= month && new Date(request.startAt) < next);
      return { label: month.toLocaleString(org.locale, { month: "short" }), value: taken.reduce((sum, request) => sum + leaveDays(request), 0) };
    });
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Overview / Trends"
          title="Understand the shape of the team."
          description="Department composition, employment mix and approved absence over time, grounded in the records in this workspace."
          actions={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees?tab=Teams`)}>Browse departments</Button>}
          note="This is a local record analysis, not an anonymised public report."
        />
        <OpsMetrics label="Workforce trends overview">
          <OpsMetric label="Current employees" value={staff.length} detail="Excluding alumni and contractors" />
          <OpsMetric label="Contractors" value={data.employees.filter((person) =>
            person.fields.employment === "contractor" && person.status !== "alumni").length} detail="Separate employment category" />
          <OpsMetric label="Departments" value={data.departments.length} detail="Organisational units" />
          <OpsMetric label="Local AI contracts" value={agents.length} detail="Not human headcount" />
        </OpsMetrics>
      <Grid>
        <Card span={7} eyebrow="WORKFORCE" prov="human" title="Workforce by department" subtitle="People and AI employees counted separately">
          <BarChart
            title="Workforce by department"
            height={210}
            format={(value) => String(Math.round(value))}
            series={[
              { name: "People", points: byDepartment.map((row) => ({ label: row.label, value: row.people })) },
              { name: "AI employees", points: byDepartment.map((row) => ({ label: row.label, value: row.agents })) },
            ]}
            footer="An AI employee is a local agent contract in this workspace, not a person and not a headcount line."
          />
        </Card>
        <Card span={5} eyebrow="ABSENCE" prov="human" title="Leave taken" subtitle="Approved days by month">
          <BarChart title="Approved leave days by month" height={210} format={(value) => `${Math.round(value)}d`} series={[{ name: "Days", points: months }]} />
        </Card>
        <Card span={5} eyebrow="HEADCOUNT" prov="human" title="Employment mix">
          <DonutChart
            title="Employment mix"
            size={150}
            points={[
              { label: "Full time", value: data.employees.filter((employee) => employee.fields.employment === "full-time" && employee.status !== "alumni").length },
              { label: "Part time", value: data.employees.filter((employee) => employee.fields.employment === "part-time" && employee.status !== "alumni").length },
              { label: "Contractor", value: data.employees.filter((employee) => employee.fields.employment === "contractor").length },
              { label: "Alumni", value: data.employees.filter((employee) => employee.status === "alumni").length },
            ]}
          />
        </Card>
        <Card span={7} title="What these figures are, and are not">
          <Notice tone="info" title="Internal counts, not anonymised statistics">
            The charts show actual local record counts, including small groups. They omit salaries, absence reasons and direct
            identifiers, but small totals could still identify an individual. Do not share this page as an anonymised public report.
          </Notice>
        </Card>
      </Grid>
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <OpsHeader
        eyebrow="People / Overview"
        title="A clearer view of the people behind the work."
        description="Understand your team, the decisions waiting for attention and the work happening across hiring, onboarding, leave and scheduling."
        actions={<>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Explore directory</Button>
          <Button variant="primary" onClick={() => context.setTab("HR tasks")}>Review people work</Button>
        </>}
        note={`${dueCount} recorded people work items · Local workspace records only`}
      />
      <StatRow>
        <Stat label="People employed" value={String(staff.length)} prov="human" meta={`${data.employees.filter((employee) => employee.fields.employment === "contractor").length} contractors alongside`} onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)} />
        <Stat label="AI employees" value={String(agents.length)} prov="agent" meta="Local agent contracts" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)} />
        <Stat label="Leave waiting" value={String(pendingLeave.length)} prov="human" meta={pendingLeave.length ? `Oldest asked ${context.relative(pendingLeave[0].at)}` : "Nothing to decide"} onClick={() => context.openOverlay("leave approval")} />
        <Stat label="Open roles" value={String(openRoles.length)} prov="human" meta={`${data.applicants.filter((applicant) => !["rejected", "withdrawn"].includes(applicant.status)).length} live candidates`} onClick={() => context.navigate(`/o/${org.slug}/hr/recruitment`)} />
      </StatRow>

      <Grid>
        <Card
          span={7}
          eyebrow="DECISIONS"
          prov="human"
          title="Waiting on a people decision"
          subtitle={`${pendingLeave.length} leave requests`}
          actions={pendingLeave.length > 0 ? <Button size="sm" variant="secondary" onClick={() => context.openOverlay("leave approval")}>Review</Button> : undefined}
        >
          {pendingLeave.length === 0 ? (
            <Empty title="No leave is waiting" icon={<CalendarDays size={20} />}>Requests appear here the moment somebody asks.</Empty>
          ) : (
            <Stack gap={2}>
              {pendingLeave.map((request) => (
                <Row key={request.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Avatar name={leavePerson(request, data.employees)} size="sm" />
                  <div className="ds-grow">
                    <strong>{leavePerson(request, data.employees)}</strong>
                    <p className="ds-subtle"><span className="ds-num">{context.date(request.startAt)} – {context.date(request.endAt)}</span> · {days(leaveDays(request))} · {String(request.fields.type ?? "annual")}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => { context.select(request.id); context.openOverlay("leave approval", { id: request.id }); }}>Decide</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={5} eyebrow="COVERAGE" prov="human" title="Coverage risk" subtitle="Computed from the roster and approved leave" actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Staffing alert")}>Inspect</Button>}>
          <StaffingSummary context={context} />
        </Card>

        <Card span={6} eyebrow="ONBOARDING" prov="human" title="Onboarding" subtitle={`${openOnboarding.length} steps outstanding`} footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/onboarding`)}>Open onboarding</Button>}>
          {onboarding.length === 0 ? <Empty title="Nobody is onboarding" icon={<UserPlus size={20} />} /> : (
            <Stack gap={3}>
              {[...new Set(onboarding.map((task) => String(task.fields.employeeId)))].map((employeeId) => {
                const employee = data.employees.find((row) => row.id === employeeId);
                const steps = onboarding.filter((task) => task.fields.employeeId === employeeId);
                const done = steps.filter((task) => task.status === "done").length;
                return (
                  <div key={employeeId}>
                    <Row gap={2}><strong className="ds-grow">{employee?.title ?? "New hire"}</strong><span className="ds-subtle ds-num">{done} / {steps.length}</span></Row>
                    <Meter value={done} max={steps.length} label={`${employee?.title ?? "New hire"} onboarding`} tone={done === steps.length ? "success" : undefined} />
                  </div>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={6} eyebrow="COMPLIANCE" prov="human" title="Compliance reminders" subtitle="Policies and reviews that need a person">
          <Stack gap={2}>
            {policiesDue.slice(0, 4).map((policy) => (
              <Row key={policy.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <BookOpen size={16} aria-hidden="true" />
                <span className="ds-grow">{policy.title} <span className="ds-subtle">v{String(policy.fields.version ?? "1.0")}</span></span>
                <Pill tone={Number(policy.fields.acknowledged ?? 0) >= staff.length ? "success" : "warning"}><span className="ds-num">{String(policy.fields.acknowledged ?? 0)} of {staff.length}</span> acknowledged</Pill>
              </Row>
            ))}
            {reviewsDue.slice(0, 3).map((review) => (
              <Row key={review.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <ClipboardCheck size={16} aria-hidden="true" />
                <span className="ds-grow">{review.title}</span>
                <Pill tone="info">{review.status}</Pill>
              </Row>
            ))}
            {policiesDue.length === 0 && reviewsDue.length === 0 && <span className="ds-subtle">Nothing outstanding.</span>}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

export function StaffingSummary({ context }: { context: ScreenContext }) {
  const data = useCollections(["shifts", "leaveRequests", "employees"]);
  const { now, org } = useWorkspace();
  const startKey = localDayKey(now, org.timezone);
  const localNoon = new Date(`${startKey}T12:00:00.000Z`);
  const roster = data.shifts.filter((row) => row.fields.kind === "shift");
  const employees = data.employees.filter((row) => !["alumni", "terminated"].includes(row.status));
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(localNoon);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    const working = employees.filter((employee) =>
      rosterShiftsForDay(roster, employee.id, key, org.timezone).length > 0);
    const away = employees.filter((employee) =>
      employeeOnLeave(data.leaveRequests, employee.id, key, org.timezone));
    const conflicts = working.filter((employee) => away.some((person) => person.id === employee.id));
    return { key, day: date, onShift: working.length, onLeave: away.length, conflicts: conflicts.length };
  });
  return (
    <Stack gap={3}>
      {days.map((row) => (
        <Row key={row.key} gap={3}>
          <span style={{ width: 95 }} className="ds-subtle">{rosterDateLabel(row.key)}</span>
          <div className="ds-grow">
            <Meter value={row.onShift} max={Math.max(1, employees.length)}
              label={`Rostered people on ${rosterDateLabel(row.key)}`}
              tone={row.conflicts > 0 ? "warning" : undefined} />
          </div>
          <span className="ds-num" style={{ width: 130, textAlign: "end" }}>
            {row.onShift} working · {row.onLeave} away
          </span>
        </Row>
      ))}
      <p className="ds-subtle">
        Counts use {org.timezone} calendar days, including overnight shifts, and distinguish employees from individual shifts.
        No minimum staffing requirement is recorded here, so an unassigned or lightly rostered day is not automatically labelled unsafe.
      </p>
      {days.some((row) => row.conflicts > 0) && (
        <Notice tone="warning" title="Roster and approved leave overlap">
          Open Scheduling Exceptions to inspect people who appear both away and rostered on the same day.
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Exceptions`)}>
            Review exceptions
          </Button>
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-002 · Employee Directory
 * ------------------------------------------------------------------ */

export function EmployeeDirectory({ context, lens }: { context: ScreenContext; lens: "People" | "Teams" | "Contractors" | "Alumni" }) {
  const data = useHrData();
  const { org } = useWorkspace();
  const selectedTeam = useDirectoryTeam();
  // Team selection is shared within this browser: an ID from another
  // company must not silently hide the entire directory after a switch.
  const team = data.departments.some((department) => department.id === selectedTeam) ? selectedTeam : "";
  const [query, setQuery] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const current = data.employees.filter((employee) => employee.status !== "alumni");
  const title = lens === "People" ? "People, with context."
    : lens === "Teams" ? "Explore how teams connect."
    : lens === "Contractors" ? "The extended workforce." : "People who helped build the work.";
  const description = lens === "People"
    ? "Find an employee by name, role, department or office. Open the complete record without exposing private payroll data in the directory."
    : lens === "Teams"
      ? "Understand departments, their recorded leads and the people assigned to them. AI contracts remain distinct from human headcount."
      : lens === "Contractors"
        ? "Review contractors as separate workforce records. Recorded engagements are not assumed to be active contracts."
        : "Preserve former colleagues' historical records without representing them as current staff.";
  const header = (
    <OpsHeader eyebrow={`People / Employee Directory / ${lens}`} title={title} description={description}
      actions={<>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/overview`)}>People overview</Button>
        {context.can("edit_people") && <Button variant="primary" onClick={() => context.openOverlay("Invite employee")}>
          Create employee record
        </Button>}
      </>}
      note="Records and access rights shown here are local to this company workspace."
    />
  );

  if (lens === "Teams") {
    const withoutDepartment = current.filter((employee) =>
      !data.departments.some((department) => department.id === employee.fields.departmentId)).length;
    return (
      <Stack gap={4}>
        {header}
        <OpsMetrics label="Team directory overview">
          <OpsMetric label="Departments" value={data.departments.length} detail="Recorded teams" />
          <OpsMetric label="Current people" value={current.length} detail="Human and contractor records" />
          <OpsMetric label="Unassigned department" value={withoutDepartment} detail="People needing a team link" emphasis={withoutDepartment ? "attention" : "neutral"} />
          <OpsMetric label="AI contracts" value={aiEmployees(data.members).length} detail="Not human headcount" />
        </OpsMetrics>
        {data.departments.length === 0 ? (
          <Empty title="No departments defined" icon={<Users size={20} />}>
            Teams appear when their department records are created. Employees without department links remain in the People directory.
          </Empty>
        ) : (
      <Grid>
        {data.departments.map((department) => {
          const people = data.employees.filter((employee) => employee.fields.departmentId === department.id && employee.status !== "alumni");
          const agents = aiEmployees(data.members).filter((member) => member.fields.departmentId === department.id);
          return (
            <Card key={department.id} span={4} title={department.title} subtitle={department.summary}
              eyebrow="DEPARTMENT" actions={<Pill>{people.length} people</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => {
                setDirectoryTeam(department.id);
                context.setTab("People");
              }}>Explore team</Button>}>
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Lead", value: String(department.fields.lead ?? "Unassigned") },
                  { label: "People", value: String(people.length) },
                  { label: "AI employees", value: String(agents.length) },
                ]} />
                <Row gap={1} wrap>
                  {people.map((person) => <Avatar key={person.id} name={person.title} size="sm" />)}
                  {agents.map((agent) => <Avatar key={agent.id} name={agent.title} kind="ai" size="sm" />)}
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
        )}
        {withoutDepartment > 0 && <Notice tone="info" title="Some people have no recorded department">
          Use the People tab to find employee profiles and verify their actual reporting line before assigning a team.
        </Notice>}
      </Stack>
    );
  }

  const allRows = lens === "Contractors"
    ? data.employees.filter((employee) => employee.fields.employment === "contractor" && employee.status !== "alumni")
    : lens === "Alumni"
      ? data.employees.filter((employee) => employee.status === "alumni")
      : humans(data.employees);
  const filteredToTeam = team ? allRows.filter((employee) => employee.fields.departmentId === team) : allRows;
  const rows = filteredToTeam.filter((employee) => {
    const dept = departmentName(data.departments, employee.fields.departmentId);
    const searchable = [employee.title, employee.fields.title, dept, employee.fields.office, employee.fields.skills]
      .map((value) => String(value ?? "")).join(" ").toLowerCase();
    const hasDepartment = data.departments.some((department) => department.id === employee.fields.departmentId);
    return (!unassignedOnly || !hasDepartment) && searchable.includes(query.trim().toLowerCase());
  });
  const agents = aiEmployees(data.members);
  const missingTeam = allRows.filter((employee) =>
    !data.departments.some((department) => department.id === employee.fields.departmentId)).length;
  const toolbar = (
    <div className="ops-toolbar" aria-label="Employee directory filters">
      <strong className="ops-toolbar-heading">{lens} records</strong>
      <div className="hr-directory-search">
        <TextInput aria-label="Search employee directory" placeholder="Name, role, location or skill"
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <Select aria-label="Filter by department" value={team} onChange={(event) => setDirectoryTeam(event.target.value)}>
        <option value="">All departments</option>
        {data.departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
      </Select>
      <Button size="sm" variant={unassignedOnly ? "secondary" : "ghost"} aria-pressed={unassignedOnly}
        onClick={() => setUnassignedOnly((value) => !value)}>No department</Button>
      <span className="ops-toolbar-note">{rows.length} of {allRows.length}</span>
    </div>
  );

  const grid = (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${lens} directory`}
      selectedId={context.selectedId}
      card={(person) => (
        <div className="hr-directory-card">
          <Avatar name={person.title} size="sm" />
          <div className="hr-directory-card-copy">
            <strong>{person.title}</strong>
            <span>{String(person.fields.title || "No role recorded")} · {departmentName(data.departments, person.fields.departmentId)}</span>
          </div>
          <EmploymentPill record={person} />
        </div>
      )}
      columns={[
        { key: "name", header: "Name", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.title} size="sm" /><span>{row.title}</span></Row>, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.title ?? "")} ${String(row.fields.skills ?? "")}` },
        { key: "role", header: "Role", cell: (row) => String(row.fields.title ?? ""), sortValue: (row) => String(row.fields.title ?? ""), filterValue: (row) => String(row.fields.title ?? "") },
        { key: "department", header: "Department", cell: (row) => departmentName(data.departments, row.fields.departmentId), sortValue: (row) => departmentName(data.departments, row.fields.departmentId), hideBelow: 900 },
        { key: "manager", header: "Manager", cell: (row) => String(row.fields.manager ?? "—"), hideBelow: 1200 },
        { key: "office", header: "Office", cell: (row) => String(row.fields.office ?? "—"), hideBelow: 1200 },
        { key: "status", header: "Employment", align: "end", cell: (row) => <EmploymentPill record={row} />, sortValue: (row) => row.status },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/hr/employees/${id}`)}
      empty={<Empty title={allRows.length ? "No matching people" : `No ${lens.toLowerCase()} on record`} icon={<Users size={20} />}>
        {allRows.length ? "Clear the search or department filter to find another person." :
          lens === "Alumni" ? "Former employees remain on record for historical purposes." : "Create an employee record to populate this directory."}
      </Empty>}
    />
  );

  const filterNote = team ? (
    <Notice tone="info" title={`Filtered to ${departmentName(data.departments, team)}`}>
      <Row gap={2}><span className="ds-grow">{rows.length} of {allRows.length} shown.</span><Button size="sm" variant="ghost" onClick={() => setDirectoryTeam("")}>Clear the filter</Button></Row>
    </Notice>
  ) : null;

  const summary = (
    <OpsMetrics label={`${lens} directory metrics`}>
      <OpsMetric label="Records" value={allRows.length} detail={`${lens} in this company`} />
      <OpsMetric label="Currently shown" value={rows.length} detail="Matching the active filters" />
      <OpsMetric label="Departments" value={data.departments.length} detail="Company teams" />
      <OpsMetric label="Missing team link" value={missingTeam} detail="Verify department records" emphasis={missingTeam ? "attention" : "neutral"} />
    </OpsMetrics>
  );

  if (lens !== "People") return (
    <Stack gap={4}>{header}{summary}{toolbar}{filterNote}{grid}</Stack>
  );

  return (
    <Stack gap={4}>
      {header}
      {summary}
      {toolbar}
      {filterNote}
      <Card title="People" subtitle={`${rows.length} shown · private contact and pay details remain in individual profiles`} flush>{grid}</Card>
      <Card
        title="AI employees"
        subtitle={`${agents.length} local agent contracts · listed apart from people on purpose`}
        actions={<Pill tone="accent">Not headcount</Pill>}
      >
        {agents.length === 0 ? <Empty title="No AI contracts recorded" icon={<Users size={20} />}>
          AI employees are added as separate local contracts, not human staff members.
        </Empty> : <Grid>
          {agents.map((agent) => (
            <Card key={agent.id} span={4} title={<Row gap={2}><Avatar name={agent.title} kind="ai" size="sm" />{agent.title}</Row>} subtitle={String(agent.fields.title ?? "")}>
              <Stack gap={2}>
                <p className="ds-subtle">{agent.summary}</p>
                <Properties rows={[
                  { label: "Department", value: departmentName(data.departments, agent.fields.departmentId) },
                  { label: "Scope", value: String(agent.fields.scope ?? "Not recorded") },
                  { label: "Concurrency", value: String(agent.fields.concurrency ?? 1) },
                ]} />
              </Stack>
            </Card>
          ))}
        </Grid>}
        <Notice tone="info" title="An AI employee is not a person">
          Agents have no salary, no leave balance and no payroll line. They run from a local contract in this workspace;
          no model provider is connected, so nothing they draft leaves the browser on its own.
        </Notice>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-003 · Employee Profile
 * ------------------------------------------------------------------ */

export function EmployeeProfile({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useHrData();
  const record = useRecord(context.params.id);
  const fileRecords = useCollection("documents");
  const { org } = useWorkspace();
  const employee = scopedDetailRecord(record, org.id, "employees");

  if (!employee) return (
    <Empty title="Employee unavailable" icon={<Users size={20} />}>
      This employee was not found in this company. Open a person from the employee directory.
      <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Open directory</Button>
    </Empty>
  );

  const balance = leaveBalance(employee);
  const leave = data.leaveRequests.filter((request) => request.fields.employeeId === employee.id);
  const reviews = data.reviews.filter((review) => review.fields.employeeId === employee.id);
  const onboarding = data.tasks.filter((task) => task.fields.kind === "onboarding" && task.fields.employeeId === employee.id);
  const terminated = employee.status === "alumni";
  const linkedDocs = linkedPersonnelDocuments(fileRecords, employee);
  const openChecklist = onboarding.filter((task) => task.status !== "done");
  const pendingAccess = data.tasks.filter((task) => task.fields.employeeId === employee.id
    && task.fields.group === "IT access" && !["done", "rescinded", "cancelled"].includes(task.status));
  const profileDescriptions: Record<string, string> = {
    Overview: "An employee-centered workspace: identity, role, contact preferences and the next tasks that need attention.",
    Job: "The recorded employment relationship, management line, skills and pay information available to your current role view.",
    Documents: "Only real document records associated with this employee. References never claim a file was uploaded.",
    Leave: "Recorded leave requests and balances, with unknown allowances clearly distinguished from zero.",
    Performance: "Recorded performance cycles and named human review decisions; no automated personnel judgement.",
    Access: "Local access requests and offboarding evidence. External accounts and permissions are not independently verified.",
  };
  const profileHeader = (
    <section className="hr-profile-identity" aria-label={`Employee profile for ${employee.title}`}>
      <div className="hr-profile-identity-main">
        <Avatar name={employee.title} size="lg" />
        <div className="hr-profile-identity-copy">
          <span className="ops-eyebrow">People / Employee profile / {lens}</span>
          <h2>{employee.title}</h2>
          <p>{String(employee.fields.title || "No job title recorded")} · {departmentName(data.departments, employee.fields.departmentId)}</p>
          <div className="hr-profile-identifiers">
            <EmploymentPill record={employee} />
            <span>{String(employee.fields.office || "Location not recorded")}</span>
            <span>{employee.startAt ? `Started ${context.date(employee.startAt)}` : "Start date not recorded"}</span>
          </div>
        </div>
      </div>
      <div className="hr-profile-identity-actions">
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Employee directory</Button>
        {context.can("edit_people") && !terminated && (
          <Button variant="primary" onClick={() => context.openOverlay("profile editor")}>Edit profile</Button>
        )}
      </div>
    </section>
  );
  const profileMetrics = (
    <OpsMetrics label={`${employee.title} employee record overview`}>
      <OpsMetric label="Leave balance" value={balance.known ? `${balance.left} days` : "Not recorded"}
        detail={balance.known ? `${balance.allowance} annual allowance` : "Verify the allowance"} />
      <OpsMetric label="Documents on record" value={linkedDocs.length} detail="Linked document records and references" />
      <OpsMetric label="Onboarding actions" value={openChecklist.length} detail="Incomplete recorded checklist steps" />
      <OpsMetric label="Pending access requests" value={pendingAccess.length}
        detail="Local requests, not actual grants" emphasis={pendingAccess.length ? "attention" : "neutral"} />
    </OpsMetrics>
  );
  const withProfileFrame = (body: ReactNode) => (
    <Stack gap={4}>
      {profileHeader}
      <p className="hr-profile-section-description">{profileDescriptions[lens] ?? profileDescriptions.Overview}</p>
      {profileMetrics}
      {body}
    </Stack>
  );

  if (lens === "Job") {
    return withProfileFrame(
      <Grid>
        <Card span={6} eyebrow="JOB" prov="human" title="Job details">
          <Properties rows={[
            { label: "Job title", value: String(employee.fields.title ?? "Not recorded") },
            { label: "Department", value: departmentName(data.departments, employee.fields.departmentId) },
            { label: "Manager", value: String(employee.fields.manager ?? "Unassigned") },
            { label: "Employment", value: String(employee.fields.employment ?? "—") },
            { label: "Office", value: String(employee.fields.office ?? "—") },
            { label: "Started", value: context.date(employee.startAt) },
            { label: "Leaving", value: employee.endAt ? context.date(employee.endAt) : "—" },
          ]} />
        </Card>
        <Card span={6} eyebrow="PAY" prov="human" title="Pay and pension" subtitle="Gated by the payroll role view">
          {context.can("view_payroll") ? (
            <Stack gap={3}>
              <Properties rows={[
                { label: "Salary", value: salaryText(context, employee) },
                { label: "Basis", value: String(employee.fields.salaryBasis ?? "annual") },
                { label: "Pension", value: `${String(employee.fields.pensionPct ?? 0)}% employer contribution` },
                { label: "National insurance", value: String(employee.fields.nationalInsurance ?? "Not recorded") },
              ]} />
              <Notice tone="warning" title="Role views are not an account security boundary">
                These fields are in the same local database as everything else. The role view decides what this screen offers, not what a server allows.
              </Notice>
            </Stack>
          ) : <RoleViewNote what="Pay, pension and national insurance" />}
        </Card>
        <Card span={12} title="Skills recorded for work matching">
          <Row gap={2} wrap>
            {String(employee.fields.skills ?? "").split(",").filter(Boolean).map((skill) => <Pill key={skill} tone="neutral">{skill.trim()}</Pill>)}
            {!employee.fields.skills && <span className="ds-subtle">No skills recorded.</span>}
          </Row>
        </Card>
      </Grid>
    );
  }

  if (lens === "Documents") {
    // Personnel documents are real company records, not assumed contracts,
    // identity checks or letters generated from employment status.
    const documents = linkedPersonnelDocuments(fileRecords, employee);
    return withProfileFrame(
      <Stack gap={4}>
        {documents.length === 0 ? (
          <Empty title="No document references filed" icon={<BookOpen size={20} />}>
            No document record is linked to this employee. Add a reference only for a document that actually exists.
          </Empty>
        ) : (
          <DataGrid
            rows={documents}
            rowId={(row) => row.id}
            label="Employee document references"
            filterable={false}
            onOpen={(id) => context.navigate(`/o/${org.slug}/docs/documents/${id}`)}
            columns={[
              { key: "title", header: "Document", primary: true, cell: (row) => row.title },
              { key: "status", header: "Record", cell: (row) => <Pill tone={row.status === "archived" ? "neutral" : "info"}>{row.fields.kind === "peopleFile" ? "Reference only" : row.status.replace("_", " ")}</Pill> },
              { key: "at", header: "Updated", align: "end", cell: (row) => context.date(row.updatedAt), sortValue: (row) => row.updatedAt },
            ]}
          />
        )}
        <Notice tone="info" title="Only linked records appear here">
          A reference records a document's name and filing details; it does not upload the file itself. No connected storage or identity service is implied.
        </Notice>
        <Button variant="secondary" onClick={() => context.openOverlay("Contract upload")}>Add a document reference</Button>
      </Stack>
    );
  }

  if (lens === "Leave") {
    return withProfileFrame(
      <Grid>
        <Card span={5} eyebrow="BALANCE" prov={balance.known ? "human" : "unknown"} title="Balance" subtitle={balance.known ? `${balance.left} days left of ${balance.allowance}` : "No allowance recorded"}>
          <Stack gap={3}>
            {!balance.known && <Notice tone="warning" title="No allowance is recorded for this person">A balance is left unavailable rather than shown as zero.</Notice>}
            <Meter value={balance.taken} max={Math.max(1, balance.allowance)} label="Leave used" tone={balance.left <= 2 ? "warning" : "success"} />
            <Properties rows={[
              { label: "Allowance", value: `${balance.allowance} days` },
              { label: "Taken", value: `${balance.taken} days` },
              { label: "Remaining", value: `${balance.left} days` },
              { label: "Carry over", value: "Capped at five days by policy" },
            ]} />
          </Stack>
        </Card>
        <Card span={7} title="Requests" subtitle={`${leave.length} on record`} flush>
          {leave.length === 0 ? <div className="ds-card-body"><Empty title="No leave recorded" icon={<CalendarDays size={20} />} /></div> : (
            <DataGrid
              rows={leave}
              rowId={(row) => row.id}
              label="Leave requests"
              filterable={false}
              columns={[
                { key: "type", header: "Type", primary: true, cell: (row) => String(row.fields.type ?? "annual") },
                { key: "from", header: "From", cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
                { key: "days", header: "Days", align: "end", cell: (row) => String(leaveDays(row)) },
                { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "approved" ? "success" : row.status === "declined" ? "danger" : "warning"}>{row.status}</Pill> },
              ]}
            />
          )}
        </Card>
      </Grid>
    );
  }

  if (lens === "Performance") {
    return withProfileFrame(reviews.length === 0 ? <Empty title="No reviews recorded" icon={<ClipboardCheck size={20} />}>Reviews are created from the performance cycle.</Empty> : (
      <Stack gap={3}>
        {reviews.map((review) => (
          <Card key={review.id} title={review.title} subtitle={`${String(review.fields.cycle ?? "")} · reviewer ${String(review.fields.reviewer ?? "")}`} actions={<Pill tone={review.status === "acknowledged" ? "success" : "info"}>{review.status}</Pill>}>
            <Stack gap={2}>
              <p>{review.summary}</p>
              {review.fields.aiAssisted === true && (
                <Notice tone="warning" title="Assembled with help from an AI employee">
                  The draft was written from task and time records. The rating is blank until a named reviewer sets it; no personnel decision is made here.
                </Notice>
              )}
              <Properties rows={[{ label: "Rating", value: String(review.fields.rating || "Not set") }, { label: "Due", value: context.date(review.dueAt) }]} />
            </Stack>
          </Card>
        ))}
      </Stack>
    ));
  }

  if (lens === "Access") {
    // These are recorded requests, not actual cloud grants. Do not synthesize
    // sign-in, payroll or door access from an employee's department.
    const requests = data.tasks
      .filter((task) => task.collection === "tasks"
        && task.fields.employeeId === employee.id && task.fields.group === "IT access")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return withProfileFrame(
      <Stack gap={4}>
        {terminated && (
          <Notice tone="warning" title="Offboarding recorded locally">
            Offboarding was recorded for {employee.title} on {context.date(employee.endAt)}.
            Pending access requests are rescinded in this workspace; connected identity and building systems must still be checked separately.
          </Notice>
        )}
        {requests.length === 0 ? (
          <Empty title="No access requests recorded" icon={<ClipboardCheck size={20} />}>
            Employment status and department membership do not establish that an account or physical grant exists.
          </Empty>
        ) : (
          <DataGrid
            rows={requests}
            rowId={(row) => row.id}
            label="Recorded access requests"
            filterable={false}
            columns={[
              { key: "request", header: "Request", primary: true, cell: (row) => row.title },
              { key: "state", header: "Local status", cell: (row) => <Pill tone={row.status === "rescinded" ? "neutral" : row.status === "done" ? "info" : "warning"} dot>{row.status === "done" ? "Completed in Arlovi" : row.status}</Pill> },
              { key: "assignee", header: "Responsible", cell: (row) => String(row.fields.assignee ?? "Unassigned") },
            ]}
          />
        )}
        <Notice tone="info" title="No connected identity provider">
          These are browser-local requests and decisions, not independently verified access grants.
          Completion of a task here never proves that an external account, door code or permission was enabled or disabled.
        </Notice>
        <Row gap={2}>
          {!terminated && <Button variant="secondary" onClick={() => context.openOverlay("access request")}>Request access</Button>}
          {!terminated && <Button variant="outline-danger" onClick={() => context.openOverlay("offboarding confirmation")}>Start offboarding</Button>}
        </Row>
      </Stack>
    );
  }

  return withProfileFrame(
    <Grid>
      <Card span={5} title={<Row gap={3}><Avatar name={employee.title} size="lg" /><span>{employee.title}</span></Row>} subtitle={String(employee.fields.title ?? "")} actions={<EmploymentPill record={employee} />}>
        <Stack gap={3}>
          <p className="ds-subtle">{employee.summary}</p>
          <Properties rows={[
            { label: "Department", value: departmentName(data.departments, employee.fields.departmentId) },
            { label: "Manager", value: String(employee.fields.manager ?? "Unassigned") },
            { label: "Office", value: String(employee.fields.office ?? "—") },
            { label: "Pronouns", value: String(employee.fields.pronouns ?? "—") },
            { label: "Started", value: context.date(employee.startAt) },
          ]} />
        </Stack>
      </Card>
      <Card span={7} title="Contact" subtitle="Shown according to this person's privacy setting">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Work email", value: String(employee.fields.email ?? "Not recorded") },
            { label: "Phone", value: <span className="ds-subtle">{String(employee.fields.phone ?? "Not shared")}</span> },
            { label: "Date of birth", value: context.can("view_payroll") ? String(employee.fields.dateOfBirth ?? "Not recorded") : "Hidden in this role view" },
            { label: "Emergency contact", value: context.can("view_payroll") ? String(employee.fields.emergencyContact ?? "Not recorded") : "Hidden in this role view" },
          ]} />
          {!context.can("view_payroll") && <RoleViewNote what="Date of birth and emergency contact" />}
        </Stack>
      </Card>
      <Card span={4} eyebrow="LEAVE" prov={balance.known ? "human" : "unknown"} title="Leave" subtitle={balance.known ? `${balance.left} of ${balance.allowance} days left` : "No allowance recorded"}>
        <Meter value={balance.taken} max={Math.max(1, balance.allowance)} label="Leave used" tone={balance.left <= 2 ? "warning" : "success"} />
        <Button size="sm" variant="ghost" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.setTab("Leave")}>See requests</Button>
      </Card>
      <Card span={4} title="Pay" subtitle="Payroll role view">
        <strong style={{ fontSize: "var(--text-lg)" }}>{salaryText(context, employee)}</strong>
        <p className="ds-subtle">{context.can("view_payroll") ? "From the employee record, used by the local payroll calculation." : "Switch to the People or Owner role view to see pay."}</p>
      </Card>
      <Card span={4} title="Onboarding" subtitle={onboarding.length ? `${onboarding.filter((task) => task.status === "done").length} of ${onboarding.length} steps done` : "No checklist"}>
        {onboarding.length === 0 ? <span className="ds-subtle">No onboarding checklist was launched for this person.</span> : (
          <>
            <Meter value={onboarding.filter((task) => task.status === "done").length} max={onboarding.length} label="Onboarding progress" />
            <Button size="sm" variant="ghost" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.navigate(`/o/${org.slug}/hr/onboarding`)}>Open the checklist</Button>
          </>
        )}
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-004 · Recruitment Pipeline
 * ------------------------------------------------------------------ */

const STAGES = ["applied", "screening", "interview", "offer", "hired"];

export function Recruitment({ context, lens }: { context: ScreenContext; lens: "Positions" | "Candidates" | "Interviews" | "Offers" }) {
  const data = useHrData();
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const [focusStage, setFocusStage] = useState("all");
  const live = data.applicants.filter((row) => !["rejected", "withdrawn"].includes(row.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const interviews = live.filter((row) => row.fields.stage === "interview");
  const dated = interviews.filter((row) => Number.isFinite(Date.parse(String(row.fields.interviewAt ?? ""))));
  const offers = live.filter((row) => row.fields.stage === "offer");
  const matches = (row: Rec) => [row.title, row.fields.role,
    data.positions.find((position) => position.id === row.fields.positionId)?.title]
    .some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()));
  const canEdit = context.can("edit_people");
  const intro = (
    <Stack gap={4}>
      <OpsHeader eyebrow={`People / Recruitment / ${lens}`}
        title={({ Positions: "Roles with a clear owner.", Candidates: "A pipeline for human decisions.",
          Interviews: "Interviews, scheduled and unscheduled.", Offers: "Offers, with evidence attached." } as const)[lens]}
        description="Review real application records, owners and next actions. No AI candidate ranking, automatic mailing or external calendar booking is implied."
        actions={<>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/onboarding`)}>Open onboarding</Button>
          {canEdit && <Button variant="primary" onClick={() => context.openOverlay("Job spec editor")}>Create a role</Button>}
        </>} note="Applicant stage changes and offers require an accountable human decision." />
      <OpsMetrics label="Recruitment workflow">
        <OpsMetric label="Open roles" value={data.positions.filter((row) => row.status === "open").length} detail="Recorded positions" />
        <OpsMetric label="Active candidates" value={live.length} detail="Excludes withdrawn and rejected" />
        <OpsMetric label="Dated interviews" value={dated.length} detail={`${interviews.length - dated.length} need scheduling`} emphasis={interviews.length !== dated.length ? "attention" : "neutral"} />
        <OpsMetric label="Offers in progress" value={offers.length} detail="Local offer-stage records" />
      </OpsMetrics>
      <div className="ops-toolbar">
        <strong className="ops-toolbar-heading">Find records</strong>
        <div className="hr-directory-search">
          <TextInput aria-label="Search recruitment" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search roles and candidates" />
        </div>
      </div>
    </Stack>
  );

  if (lens === "Positions") {
    const positions = data.positions.filter((row) => [row.title, row.summary, row.fields.hiringManager, row.fields.location]
      .some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())));
    return (
      <Stack gap={4}>
        {intro}
        {positions.length === 0 ? (
      <Empty title={data.positions.length ? "No positions match this search" : "No positions recorded"} icon={<UserPlus size={20} />}
        action={canEdit ? <Button variant="primary" onClick={() => context.openOverlay("Job spec editor")}>Create a role</Button> : undefined} />
    ) : (
      <Grid>
        {positions.map((position) => {
          const applicants = data.applicants.filter((applicant) => applicant.fields.positionId === position.id);
          return (
            <Card
              key={position.id}
              span={4}
              title={position.title}
              subtitle={`${String(position.fields.employment ?? "")} · ${String(position.fields.location ?? "")}`}
              actions={<Pill tone={position.status === "open" ? "success" : position.status === "on_hold" ? "warning" : "neutral"} dot>{position.status.replace("_", " ")}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Job spec editor", { id: position.id })}>Edit spec</Button>
                <span className="ds-grow" />
                <span className="ds-subtle">{applicants.length} candidates</span>
              </>}
            >
              <Stack gap={3}>
                <p className="ds-subtle">{position.summary}</p>
                <Properties rows={[
                  { label: "Hiring manager", value: String(position.fields.hiringManager ?? "") },
                  { label: "Range", value: !context.can("view_payroll") ? "Hidden in this role view"
                    : position.fields.salaryLowMinor !== undefined && position.fields.salaryHighMinor !== undefined
                      ? `${context.money(Number(position.fields.salaryLowMinor))} – ${context.money(Number(position.fields.salaryHighMinor))}`
                      : "Not recorded" },
                  { label: "Opened", value: context.relative(position.at) },
                ]} />
                <Row gap={1} wrap>
                  {STAGES.map((stage) => {
                    const count = applicants.filter((applicant) => applicant.fields.stage === stage).length;
                    return count > 0 ? <Pill key={stage} tone={stage === "offer" ? "accent" : "neutral"}>{stage} {count}</Pill> : null;
                  })}
                </Row>
              </Stack>
            </Card>
          );
        })}
      </Grid>
        )}
      </Stack>
    );
  }

  if (lens === "Interviews") {
    const shown = interviews.filter(matches).sort((a, b) =>
      String(a.fields.interviewAt || "~").localeCompare(String(b.fields.interviewAt || "~")));
    return <Stack gap={4}>
      {intro}
      <div className="ops-toolbar"><strong className="ops-toolbar-heading">Interview stage</strong>
        <span className="ops-toolbar-note">{dated.length} dated · {interviews.length - dated.length} without a date</span>
      </div>
      {shown.length === 0 ? <Empty title="No candidates in the interview stage" icon={<CalendarDays size={20} />}>
        A candidate can enter the interview stage without having a meeting booked.
      </Empty> : (
      <Stack gap={3}>
        {shown.map((applicant) => (
          <Card
            key={applicant.id}
            title={applicant.title}
            subtitle={`${String(applicant.fields.role ?? "")} · interview ${applicant.fields.interviewAt ? context.date(String(applicant.fields.interviewAt)) : "not scheduled"}`}
            actions={<Pill tone={Number.isFinite(Date.parse(String(applicant.fields.interviewAt ?? ""))) ? "info" : "warning"}>
              {Number.isFinite(Date.parse(String(applicant.fields.interviewAt ?? ""))) ? "Date recorded" : "Not scheduled"}
            </Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(applicant.id); context.openOverlay("candidate profile", { id: applicant.id }); }}>Scorecard</Button>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => { context.select(applicant.id); context.openOverlay("schedule interview", { id: applicant.id }); }}>Review schedule</Button>}
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/hr/candidates/${applicant.id}`)}>Open candidate</Button>
            </>}
          >
            <Stack gap={2}>
              <p className="ds-subtle">{applicant.summary}</p>
              <Notice tone="info" title="Hiring decisions stay with a named person">
                Structured questions and a written scorecard per interviewer. No automated ranking is applied to candidates in this workspace.
              </Notice>
            </Stack>
          </Card>
        ))}
      </Stack>
      )}
      <Notice tone="info" title="Stage is not a confirmed booking">
        Dates are local application records; verify the actual calendar independently before confirming attendance.
      </Notice>
    </Stack>;
  }

  if (lens === "Offers") {
    const shown = offers.filter(matches);
    return <Stack gap={4}>
      {intro}
      {shown.length === 0 ? <Empty title="No matching offers" icon={<ClipboardCheck size={20} />}>
        Offers appear here when a human reviewer records the candidate's offer stage.
      </Empty> : (
      <Stack gap={3}>
        {shown.map((applicant) => {
          const position = data.positions.find((row) => row.id === applicant.fields.positionId);
          return (
            <Card key={applicant.id} title={applicant.title} subtitle={String(applicant.fields.role ?? "")} actions={<Pill tone={applicant.fields.offerIssuedBy ? "info" : "warning"}>
                {applicant.fields.offerIssuedBy ? "Local offer recorded" : "Offer not issued"}
              </Pill>}
              footer={<Button size="sm" variant="primary" onClick={() => { context.select(applicant.id); context.openOverlay("offer approval", { id: applicant.id }); }}>Review the offer</Button>}>
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Role", value: position?.title ?? String(applicant.fields.role ?? "") },
                  { label: "Range", value: !context.can("view_payroll") ? "Hidden in this role view" :
                    position?.fields.salaryLowMinor !== undefined && position.fields.salaryHighMinor !== undefined
                      ? `${context.money(Number(position.fields.salaryLowMinor))} – ${context.money(Number(position.fields.salaryHighMinor))}` : "Not recorded" },
                  { label: "Hiring manager", value: String(position?.fields.hiringManager ?? "") },
                ]} />
                <Notice tone="warning" title="Nothing has been sent to the candidate">
                  The offer is a local draft. No mail provider is connected, so an offer only reaches a candidate when a person sends it from a connected mailbox.
                </Notice>
              </Stack>
            </Card>
          );
        })}
      </Stack>
      )}
    </Stack>;
  }

  const stages = STAGES.filter((stage) => focusStage === "all" || focusStage === stage);
  const visible = live.filter(matches);
  return (
    <Stack gap={4}>
      {intro}
      <div className="hr-hiring-stage-filters" role="group" aria-label="Filter recruitment stages">
        <Button size="sm" variant={focusStage === "all" ? "secondary" : "ghost"} aria-pressed={focusStage === "all"}
          onClick={() => setFocusStage("all")}>All stages</Button>
        {STAGES.map((stage) => <Button key={stage} size="sm" variant={focusStage === stage ? "secondary" : "ghost"}
          aria-pressed={focusStage === stage} onClick={() => setFocusStage(stage)}>
          {stage.charAt(0).toUpperCase() + stage.slice(1)}
        </Button>)}
      </div>
      <div className="hr-hiring-pipeline">
        {stages.map((stage) => (
          <Card key={stage} className="hr-hiring-stage" title={stage.charAt(0).toUpperCase() + stage.slice(1)} subtitle={`${visible.filter((applicant) => applicant.fields.stage === stage).length} candidates`}>
            <Stack gap={2}>
              {visible.filter((applicant) => applicant.fields.stage === stage).map((applicant) => (
                <button
                  key={applicant.id}
                  type="button"
                  className="ds-record-card"
                  onClick={() => context.navigate(`/o/${org.slug}/hr/candidates/${applicant.id}`)}
                >
                  <Row gap={2}>
                    <Avatar name={applicant.title} size="sm" />
                    <span className="ds-grow" style={{ textAlign: "start" }}>{applicant.title}</span>
                    {Number(applicant.fields.rating ?? 0) > 0 && <Pill tone="neutral">{String(applicant.fields.rating)}/5</Pill>}
                  </Row>
                  <span className="ds-subtle">{String(applicant.fields.role ?? "")}</span>
                </button>
              ))}
              {visible.filter((applicant) => applicant.fields.stage === stage).length === 0 && <span className="ds-subtle">Empty</span>}
            </Stack>
          </Card>
        ))}
      </div>
      <Notice tone="info" title="Bias controls on this board">
        Candidates are listed in the order they applied, never ranked by a model. A rating is a person's score from a written
        scorecard. Nothing on this board moves a candidate on its own.
      </Notice>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-005 · Applicant Profile
 * ------------------------------------------------------------------ */

export function ApplicantProfile({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useHrData();
  const record = useRecord(context.params.id);
  const fileRecords = useCollection("documents");
  const applicant = scopedDetailRecord(record, context.org.id, "applicants");
  if (!applicant) return <Empty title="Candidate unavailable" icon={<Users size={20} />}>This candidate was not found in this company. Open a candidate from Recruitment.</Empty>;
  const position = data.positions.find((row) => row.id === applicant.fields.positionId);
  const consentUntil = String(applicant.fields.consentUntil ?? "");
  const consentExpired = consentUntil ? new Date(consentUntil) < context.now : false;

  if (lens === "Documents") {
    const documents = linkedPersonnelDocuments(fileRecords, applicant);
    return (
      <Stack gap={4}>
        <Card title="Application document references" subtitle={`${documents.length} linked to this candidate`}>
          {documents.length ? (
            <DataGrid
              rows={documents}
              rowId={(row) => row.id}
              label="Candidate document references"
              filterable={false}
              onOpen={(id) => context.navigate(`/o/${context.org.slug}/docs/documents/${id}`)}
              columns={[
                { key: "title", header: "Document", primary: true, cell: (row) => row.title },
                { key: "status", header: "Status", cell: (row) => <Pill tone="neutral">{row.status.replace("_", " ")}</Pill> },
                { key: "updated", header: "Updated", cell: (row) => context.date(row.updatedAt), sortValue: (row) => row.updatedAt },
              ]}
            />
          ) : (
            <Empty title="No application files linked" icon={<BookOpen size={20} />}>
              A CV or portfolio is not assumed to exist. Only documents explicitly attached to this candidate appear here.
            </Empty>
          )}
        </Card>
        <Notice tone={consentExpired ? "danger" : "info"} title={consentExpired ? "Consent has expired" : "Retention and consent"}>
          This candidate consented to their data being held until {consentUntil || "an unrecorded date"}.
          {consentExpired
            ? " The record is past that date and must be reviewed under the retention policy."
            : " Retention should be reviewed at that date; this browser-local view does not erase files automatically."}
        </Notice>
      </Stack>
    );
  }

  if (lens === "Interviews") {
    const scheduled = String(applicant.fields.interviewAt ?? "");
    return (
      <Stack gap={4}>
        {scheduled ? (
          <Card title="Scheduled interview" subtitle={context.dateTime(scheduled)}>
            <Properties rows={[
              { label: "Format", value: "In person" },
              { label: "Panel", value: position?.fields.hiringManager ? `${String(position.fields.hiringManager)} and one colleague` : "To be confirmed" },
              { label: "Structure", value: "Four fixed questions plus a practical" },
            ]} />
          </Card>
        ) : <Empty title="No interview scheduled" icon={<CalendarDays size={20} />}>Use Schedule to book one in the calendar.</Empty>}
        <Card title="Scorecards" subtitle="One per interviewer, written before the panel confers">
          {Number(applicant.fields.rating ?? 0) > 0 ? (
            <Properties rows={[
              { label: "Overall", value: `${String(applicant.fields.rating)} of 5` },
              { label: "Evidence", value: applicant.summary },
              { label: "Recorded by", value: applicant.ownerName },
            ]} />
          ) : <span className="ds-subtle">No scorecard has been recorded yet.</span>}
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("interviewer scorecard")}>Record a scorecard</Button>
        </Card>
      </Stack>
    );
  }

  if (lens === "Decisions") {
    return (
      <Stack gap={4}>
        <Card title="Where this application stands" subtitle={`Stage: ${String(applicant.fields.stage ?? applicant.status)}`}>
          <Stack gap={3}>
            <Row gap={2} wrap>
              {STAGES.map((stage) => (
                <Pill key={stage} tone={stage === applicant.fields.stage ? "accent" : "neutral"} dot={stage === applicant.fields.stage}>{stage}</Pill>
              ))}
            </Row>
            <Properties rows={[
              { label: "Applied", value: context.date(applicant.at) },
              { label: "Source", value: String(applicant.fields.source ?? "") },
              { label: "Decision owner", value: String(position?.fields.hiringManager ?? applicant.ownerName) },
            ]} />
          </Stack>
        </Card>
        <Notice tone="warning" title="A person decides, and is named">
          A summary of job-relevant evidence can be assembled from this record. The decision, and the reason recorded against it,
          belongs to the hiring manager named above.
        </Notice>
        <Row gap={2}>
          <Button variant="secondary" onClick={() => context.openOverlay("rejection preview")}>Preview a rejection</Button>
          <Button variant="secondary" onClick={() => context.openOverlay("Applicant communications")}>Communications</Button>
        </Row>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={5} title={<Row gap={3}><Avatar name={applicant.title} size="lg" />{applicant.title}</Row>} subtitle={String(applicant.fields.role ?? "")} actions={<Pill tone="info">{String(applicant.fields.stage ?? applicant.status)}</Pill>}>
        <Properties rows={[
          { label: "Applied", value: context.date(applicant.at) },
          { label: "Source", value: String(applicant.fields.source ?? "") },
          { label: "Email", value: String(applicant.fields.email ?? "") },
          { label: "Rating", value: Number(applicant.fields.rating ?? 0) > 0 ? `${String(applicant.fields.rating)} of 5` : "Not scored" },
        ]} />
      </Card>
      <Card span={7} title="Job-relevant summary" subtitle="Assembled from the application only">
        <Stack gap={3}>
          <p>{applicant.summary}</p>
          <Notice tone="info" title="What is and is not summarised">
            Only evidence against the requirements of {position?.title ?? "the role"} is summarised. Nothing is inferred about the
            candidate beyond what they wrote, and protected characteristics are not recorded on this screen at all.
          </Notice>
        </Stack>
      </Card>
      <Card span={12} title="Consent" subtitle={consentExpired ? "Expired" : `Held until ${consentUntil || "an unrecorded date"}`}>
        <Notice tone={consentExpired ? "danger" : "success"}>
          {consentExpired
            ? "This record is past its consent date and is listed for the next retention sweep."
            : "The candidate agreed to this record being held for the length of the hiring process."}
        </Notice>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-006 · Onboarding Centre
 * ------------------------------------------------------------------ */

export function Onboarding({ context, lens }: { context: ScreenContext; lens: "Incoming" | "In progress" | "Waiting" | "Completed" }) {
  const data = useHrData();
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const checklistTasks = data.tasks.filter((task) => task.fields.kind === "onboarding");
  const ids = [...new Set(checklistTasks.map((task) => String(task.fields.employeeId ?? "")).filter(Boolean))];
  const groups = ids.map((employeeId) => {
    const employee = data.employees.find((record) => record.id === employeeId);
    const steps = checklistTasks.filter((task) => task.fields.employeeId === employeeId);
    const done = steps.filter((task) => task.status === "done").length;
    const waiting = steps.some((task) => task.status === "waiting");
    const state = done === steps.length ? "Completed" : waiting ? "Waiting" : done === 0 ? "Incoming" : "In progress";
    return { employeeId, employee, steps, done, waiting, state };
  });
  const incomingNoChecklist = data.employees.filter((employee) =>
    employee.status === "probation" && !ids.includes(employee.id)
    && !employee.fields.onboardingLaunchedAt);
  const ready = groups.filter((group) => group.state === "Incoming").length + incomingNoChecklist.length;
  const totalWaiting = groups.filter((group) => group.state === "Waiting").length;
  const completed = groups.filter((group) => group.state === "Completed").length;
  const selected = groups.filter((group) => group.state === lens && [group.employee?.title, group.employee?.fields.title]
    .some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())));
  const incoming = lens === "Incoming" ? incomingNoChecklist.filter((employee) =>
    [employee.title, employee.fields.title].some((value) =>
      String(value ?? "").toLowerCase().includes(query.toLowerCase()))) : [];
  const canEdit = context.can("edit_people");
  return (
    <Stack gap={4}>
      <OpsHeader eyebrow={`People / Onboarding / ${lens}`}
        title={({ Incoming: "Give every starter a clear first step.",
          "In progress": "Keep the handoffs moving.",
          Waiting: "Know exactly what is holding things up.",
          Completed: "A record of work actually completed." } as const)[lens]}
        description="An employee-centred checklist across People, managers, IT and Finance. Each step has a recorded state and responsible person."
        actions={<>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Employee directory</Button>
          {canEdit && <Button variant="primary" onClick={() => context.openOverlay("Onboarding template")}>Launch a checklist</Button>}
        </>}
        note="Local checklist completion does not provision identity accounts, send welcome mail or execute payroll."
      />
      <OpsMetrics label="Onboarding handoffs">
        <OpsMetric label="Incoming" value={ready} detail="Not yet started or new checklists" />
        <OpsMetric label="In progress" value={groups.filter((group) => group.state === "In progress").length}
          detail="Checklist work under way" />
        <OpsMetric label="Waiting" value={totalWaiting} detail="At least one blocked step" emphasis={totalWaiting ? "attention" : "neutral"} />
        <OpsMetric label="Completed" value={completed} detail="All recorded steps marked done" emphasis={completed ? "positive" : "neutral"} />
      </OpsMetrics>
      <div className="ops-toolbar">
        <strong className="ops-toolbar-heading">{lens} starters</strong>
        <div className="hr-directory-search">
          <TextInput aria-label="Search onboarding starters" placeholder="Name or job title"
            value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <span className="ops-toolbar-note">{selected.length + incoming.length} matching records</span>
      </div>
      {selected.length === 0 && incoming.length === 0 ? (
        <Empty title={query ? "No starters match this search" : `Nothing is ${lens.toLowerCase()}`} icon={<UserPlus size={20} />}>
          {query ? "Clear the search to see other starter records."
            : "Checklists appear here when an actual employee is linked to the onboarding workflow."}
        </Empty>
      ) : (
        <div className="hr-onboarding-grid">
          {incoming.map((employee) => (
            <Card key={employee.id} eyebrow="NOT LAUNCHED" title={employee.title}
              subtitle={String(employee.fields.title || "New starter")} actions={<Pill tone="neutral">Needs a checklist</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() =>
                  context.navigate(`/o/${org.slug}/hr/employees/${employee.id}`)}>Open employee</Button>
                {canEdit && <Button size="sm" variant="primary" onClick={() =>
                  context.openOverlay("Onboarding template", { employeeId: employee.id })}>Launch checklist</Button>}
              </>}>
              <p className="ds-subtle">No onboarding checklist is associated with this person. Their status alone does not imply that any onboarding action was completed.</p>
            </Card>
          ))}
          {selected.map((group) => (
            <Card key={group.employeeId} eyebrow="STARTER"
              title={<Row gap={2}><Avatar name={group.employee?.title ?? "Unlinked starter"} size="sm" />{group.employee?.title ?? "Unlinked starter"}</Row>}
              subtitle={`${String(group.employee?.fields.title || "Role not recorded")} · ${group.employee?.startAt ? `starts ${context.date(group.employee.startAt)}` : "start date not recorded"}`}
              actions={<Pill tone={group.state === "Completed" ? "success" : group.waiting ? "warning" : "info"}>
                {group.done} of {group.steps.length} steps
              </Pill>}
              footer={<>
                {group.employee && <Button size="sm" variant="secondary" onClick={() =>
                  context.navigate(`/o/${org.slug}/hr/employees/${group.employeeId}`)}>Open employee</Button>}
                <Button size="sm" variant="secondary" onClick={() =>
                  context.openOverlay("IT access", { employeeId: group.employeeId })}>Access requests</Button>
                <Button size="sm" variant="ghost" onClick={() =>
                  context.openOverlay("welcome preview", { employeeId: group.employeeId })}>Welcome draft</Button>
              </>}>
              <Stack gap={3}>
                <Meter value={group.done} max={group.steps.length} label={`Onboarding completed for ${group.employee?.title ?? "starter"}`} />
                <div className="hr-onboarding-step-list">
                  {group.steps.map((step) => {
                    const accessWaiting = step.fields.group === "IT access" && step.status !== "done";
                    return (
                      <div key={step.id} className="hr-onboarding-step">
                        <Checkbox label={step.title} disabled={!canEdit || accessWaiting}
                          checked={step.status === "done"}
                          onChange={async (event) => {
                            if (!canEdit || accessWaiting) return;
                            const next = event.target.checked ? "done" : "ready";
                            const saved = await context.mutate.patch(step.id, {
                              status: next, fields: { ...step.fields, stage: next,
                                reviewedBy: context.actor, reviewedAt: clockIso() },
                            }, { expectRevision: step.revision, event: `${step.title} ${event.target.checked ? "completed" : "reopened"} by ${context.actor}` });
                            if (saved) context.toast("Checklist updated", `${step.title} recorded as ${next}.`);
                          }} />
                        <div className="hr-onboarding-step-meta">
                          <Pill tone={step.status === "waiting" ? "warning" : step.status === "done" ? "success" : "neutral"}>
                            {step.status === "done" ? "Done" : step.status === "waiting" ? "Waiting" : "Ready"}
                          </Pill>
                          <span>{String(step.fields.group || "Task")} · {String(step.fields.assignee || step.ownerName || "Unassigned")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {group.waiting && <Notice tone="warning" title="A waiting IT request is not an access grant">
                  Use the access review workflow to record its decision. A checklist checkbox cannot grant, revoke or verify an external account.
                </Notice>}
              </Stack>
            </Card>
          ))}
        </div>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-007 · Leave & Absence
 * ------------------------------------------------------------------ */

export function LeaveCalendar({ context, month, onPickDay }: { context: ScreenContext; month: Date; onPickDay?: (day: Date) => void }) {
  const data = useCollections(["leaveRequests", "employees"]);
  const { now } = useWorkspace();
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const approved = data.leaveRequests.filter((request) => request.status === "approved" || request.status === "requested");

  return (
    <div>
      <div className="hr-cal" role="grid" aria-label={`Leave calendar for ${context.date(first, { month: "long", year: "numeric" })}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="hr-cal-head" role="columnheader">{label}</div>
        ))}
        {days.map((day) => {
          const onLeave = approved.filter((request) => request.startAt && request.endAt && new Date(request.startAt) <= day && new Date(request.endAt) >= day);
          const outside = day.getMonth() !== first.getMonth();
          const today = day.toDateString() === now.toDateString();
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              className="hr-cal-day"
              data-outside={outside ? "true" : undefined}
              data-today={today ? "true" : undefined}
              data-weekend={weekend ? "true" : undefined}
              aria-label={`${context.date(day, { weekday: "long", day: "numeric", month: "long" })}, ${onLeave.length} recorded leave requests`}
              onClick={() => onPickDay?.(day)}
            >
              <span className="hr-cal-num">{day.getDate()}</span>
              <span className="hr-cal-marks">
                {onLeave.slice(0, 3).map((request) => (
                  <span key={request.id} className="hr-cal-chip" data-state={request.status}>
                    {String(request.fields.type ?? "") === "sick"
                      ? "Unavailable" : leavePerson(request, data.employees).split(" ")[0]}
                  </span>
                ))}
                {onLeave.length > 3 && <span className="hr-cal-chip" data-state="more">+{onLeave.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <Row gap={3} wrap style={{ marginBlockStart: "var(--space-3)" }}>
        <Row gap={1}><span className="hr-cal-chip" data-state="approved">Approved</span></Row>
        <Row gap={1}><span className="hr-cal-chip" data-state="requested">Requested</span></Row>
        <span className="ds-subtle">Only recorded names and approval states appear here. Sickness is shown as unavailable without identifying a person or displaying health details.</span>
      </Row>
    </div>
  );
}

export function LeaveScreen({ context, lens }: { context: ScreenContext; lens: "My leave" | "Team calendar" | "Approvals" | "Policy" }) {
  const data = useHrData();
  const { now, actor, org } = useWorkspace();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [approvalView, setApprovalView] = useState<"all" | "annual" | "other">("all");
  const [myView, setMyView] = useState<"all" | "pending" | "decided">("all");
  const month = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [now, monthOffset]);
  const mine = data.employees.find((employee) => employee.title === actor);
  const myRequests = data.leaveRequests.filter((request) => request.fields.employeeId === mine?.id || String(request.fields.employeeName ?? "") === actor);
  const pending = data.leaveRequests.filter((request) => request.status === "requested");
  const approved = data.leaveRequests.filter((request) => request.status === "approved");
  const pendingAnnual = pending.filter((request) => String(request.fields.type ?? "annual") === "annual");
  const selectedRequests = selectedDay ? data.leaveRequests.filter((request) => request.startAt && request.endAt
    && request.startAt.slice(0, 10) <= selectedDay && request.endAt.slice(0, 10) >= selectedDay
    && ["approved", "requested"].includes(request.status)) : [];
  const header = (
    <OpsHeader eyebrow={`People / Leave & Absence / ${lens}`}
      title={({ "My leave": "Time away, clearly recorded.", "Team calendar": "Leave in the context of the team.",
        Approvals: "Leave decisions with an accountable owner.", Policy: "Know what the recorded policy says." } as const)[lens]}
      description="Review actual leave requests, annual balances and available coverage evidence. Requests never automatically reduce a recorded entitlement."
      actions={<>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Roster`)}>Open roster</Button>
        <Button variant="primary" onClick={() => context.openOverlay("Leave form")}>Request leave</Button>
      </>}
      note={`Company calendar: ${org.timezone}. Leave requests are local records, not external calendar bookings.`}
    />
  );
  const metrics = (
    <OpsMetrics label="Leave and absence overview">
      <OpsMetric label="Requests awaiting review" value={pending.length} detail="No decision yet" emphasis={pending.length ? "attention" : "neutral"} />
      <OpsMetric label="Approved requests" value={approved.length} detail="Local decisions on record" />
      <OpsMetric label="Annual requests pending" value={pendingAnnual.length} detail="Allowance checked on approval" />
      <OpsMetric label="Current employees" value={data.employees.filter((employee) =>
        !["alumni", "terminated"].includes(employee.status)).length} detail="For team coverage context" />
    </OpsMetrics>
  );

  if (lens === "Team calendar") {
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        <div className="ops-toolbar">
          <strong className="ops-toolbar-heading">Browse team leave</strong>
          <span className="ops-toolbar-note">Choose a day to inspect its requests without disclosing private absence reasons.</span>
        </div>
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value - 1)}>Previous</Button>
          <strong className="ds-grow" style={{ fontSize: "var(--text-lg)" }}>{context.date(month, { month: "long", year: "numeric" })}</strong>
          <Button size="sm" variant="ghost" onClick={() => setMonthOffset(0)}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value + 1)}>Next</Button>
        </Row>
        <Card flush><div className="ds-card-body"><LeaveCalendar context={context} month={month}
          onPickDay={(day) => setSelectedDay(day.toISOString().slice(0, 10))} /></div></Card>
        {selectedDay && <Card title={`Requests on ${context.date(`${selectedDay}T12:00:00.000Z`)}`}
          subtitle={`${selectedRequests.length} approved or pending requests on this date`}
          actions={<Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>Close detail</Button>}>
          <Stack gap={2}>
            {selectedRequests.length === 0 && <p className="ds-subtle">No approved or pending leave is recorded for this date.</p>}
            {selectedRequests.map((request) => <Row key={request.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <span className="ds-grow">{String(request.fields.type ?? "annual") === "sick"
                ? "Unavailable (private absence)" : leavePerson(request, data.employees)}</span>
              <Pill tone={request.status === "approved" ? "success" : "warning"}>{request.status}</Pill>
              {context.can("edit_people") && request.status === "requested" && <Button size="sm" variant="secondary"
                onClick={() => { context.select(request.id); context.openOverlay("leave approval", { id: request.id }); }}>Review</Button>}
            </Row>)}
          </Stack>
        </Card>}
        <Notice tone="info" title="A calendar date is not a staffing decision">
          Use the roster and Scheduling Exceptions to inspect coverage. Private health details are not shown here.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Approvals") {
    const selected = pending.filter((request) => approvalView === "all"
      || (approvalView === "annual" ? String(request.fields.type ?? "annual") === "annual"
        : String(request.fields.type ?? "annual") !== "annual"));
    const canDecide = context.can("edit_people");
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        <div className="ops-toolbar" role="group" aria-label="Filter leave approvals">
          <strong className="ops-toolbar-heading">Requests awaiting decision</strong>
          {(["all", "annual", "other"] as const).map((filter) => <Button key={filter} size="sm"
            variant={approvalView === filter ? "secondary" : "ghost"} aria-pressed={approvalView === filter}
            onClick={() => setApprovalView(filter)}>{filter === "all" ? "All" : filter === "annual" ? "Annual" : "Other types"}</Button>)}
          <span className="ops-toolbar-note">{selected.length} requests</span>
        </div>
        {!canDecide && <Notice tone="warning" title="A People reviewer role is required">
          You can inspect these requests, but this role view cannot approve or decline them.
        </Notice>}
        {selected.length === 0 ? (
          <Empty title={pending.length ? "No requests match this filter" : "Nothing is waiting for a decision"}
            icon={<ClipboardCheck size={20} />}>Requests appear here when submitted for human review.</Empty>
        ) : (
        <div className="hr-leave-decision-grid">
        {selected.map((request) => {
          const employee = data.employees.find((row) => row.id === request.fields.employeeId);
          const balance = employee ? leaveBalance(employee) : { allowance: 0, taken: 0, left: 0, known: false };
          const requested = leaveDays(request);
          const clash = data.leaveRequests.filter((other) => other.id !== request.id
            && other.status === "approved" && other.fields.employeeId !== request.fields.employeeId
            && other.startAt && other.endAt && request.startAt && request.endAt
            && other.startAt.slice(0, 10) <= request.endAt.slice(0, 10)
            && other.endAt.slice(0, 10) >= request.startAt.slice(0, 10));
          return (
            <Card
              key={request.id}
              eyebrow="LEAVE REQUEST"
              prov="human"
              title={<Row gap={2}><Avatar name={leavePerson(request, data.employees)} size="sm" />{leavePerson(request, data.employees)}</Row>}
              subtitle={`${context.date(request.startAt)} – ${context.date(request.endAt)} · ${days(requested)} · ${String(request.fields.type ?? "annual")}`}
              actions={<Pill tone="warning" dot>Requested {context.relative(request.at)}</Pill>}
              footer={<>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canDecide}
                  onClick={async () => {
                    try {
                      const plan = planLeaveDecision({
                        organizationId: context.org.id, currency: context.org.currency,
                        actor: context.actor, now: clockIso(),
                      }, request, employee, "approved");
                      await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
                      context.toast("Leave approved", String(request.fields.type ?? "annual") === "annual"
                        ? "The request and annual balance were updated together."
                        : "The request was approved without changing annual leave.");
                    } catch (error) {
                      context.toast("Leave not approved", error instanceof Error ? error.message : "Reload this request before deciding.", "blocked");
                    }
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={!canDecide}
                  onClick={async () => {
                    try {
                      const plan = planLeaveDecision({
                        organizationId: context.org.id, currency: context.org.currency,
                        actor: context.actor, now: clockIso(),
                      }, request, undefined, "declined");
                      await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
                      context.toast("Leave declined", "The request is recorded as declined with the decision maker's name.");
                    } catch (error) {
                      context.toast("Leave not declined", error instanceof Error ? error.message : "Reload this request before deciding.", "blocked");
                    }
                  }}
                >
                  Decline
                </Button>
                <span className="ds-grow" />
                <Button size="sm" variant="ghost" onClick={() => { context.select(request.id); context.openOverlay("conflict review", { id: request.id }); }}>Check cover</Button>
              </>}
            >
              <Stack gap={3}>
                <p>{request.summary}</p>
                <Properties rows={[
                  { label: "Balance after approval", value: employee && balance.known
                    ? balance.left >= requested
                      ? <span className="ds-num">{balance.left - requested} of {balance.allowance} days</span>
                      : "Insufficient allowance — approval blocked"
                    : employee ? "Unavailable — no allowance recorded" : "Unavailable — no employee record" },
                  { label: "Overlapping approved leave", value: clash.length ? `${clash.length} other ${clash.length === 1 ? "person" : "people"} away` : "Nobody else is away" },
                ]} />
                {clash.length > 0 && <Notice tone="warning" title="Other approved leave overlaps">
                  {clash.length} other approved request{clash.length === 1 ? "" : "s"} overlap this period. Check actual roster coverage before deciding.
                </Notice>}
              </Stack>
            </Card>
          );
        })}
        </div>
        )}
      </Stack>
    );
  }

  if (lens === "Policy") {
    const policy = data.policies.find((row) => row.title.toLowerCase().includes("leave"));
    const policyField = (key: string) => {
      const value = policy?.fields[key];
      return value === undefined || value === null || value === "" ? "Not specified in the recorded policy" : String(value);
    };
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        <Notice tone="info" title="Read the published policy record, not default assumptions">
          Entitlement, notice and carry-over limits must be verified against the actual policy record and employment agreement.
          This screen does not substitute undocumented defaults for missing information.
        </Notice>
      <Grid>
        <Card span={7} title={policy?.title ?? "Leave and absence policy"} subtitle={policy ? `Version ${String(policy.fields.version ?? "")} · published ${context.date(policy.at)}` : undefined}>
          <Stack gap={3}>
            <p>{policy?.summary ?? "No leave policy is published in this workspace."}</p>
            <Properties rows={[
              { label: "Standard annual allowance", value: policyField("leaveAllowance") },
              { label: "Part-time entitlement", value: policyField("partTimeLeave") },
              { label: "Carry-over rule", value: policyField("carryOver") },
              { label: "Notice period", value: policyField("noticePeriod") },
              { label: "Sickness", value: "Sensitive absence reasons must not be displayed in the team calendar." },
            ]} />
          </Stack>
        </Card>
        <Card span={5} title="How a balance is worked out">
          <Stack gap={3}>
            <p className="ds-subtle">Allowance less approved days. A request that is still waiting does not reduce the balance, which is why the approval screen shows the balance after approval as a separate figure.</p>
            <Button variant="secondary" onClick={() => context.openOverlay("policy explanation")}>Explain my balance</Button>
          </Stack>
        </Card>
      </Grid>
      </Stack>
    );
  }

  const balance = mine ? leaveBalance(mine) : { allowance: 0, taken: 0, left: 0, known: false };
  const visibleRequests = myView === "pending" ? myRequests.filter((request) => request.status === "requested")
    : myView === "decided" ? myRequests.filter((request) => request.status !== "requested") : myRequests;
  return (
    <Stack gap={4}>
      {header}
      {metrics}
      <div className="ops-toolbar" aria-label="Filter my leave">
        <strong className="ops-toolbar-heading">My leave requests</strong>
        {(["all", "pending", "decided"] as const).map((filter) =>
          <Button key={filter} size="sm" aria-pressed={myView === filter}
            variant={myView === filter ? "secondary" : "ghost"} onClick={() => setMyView(filter)}>
            {filter === "all" ? "All" : filter === "pending" ? "Awaiting decision" : "Decided"}
          </Button>)}
      </div>
    <Grid>
      <Card span={4} eyebrow="BALANCE" prov={balance.known ? "human" : "unknown"} title="Your balance" subtitle={mine ? (balance.known ? `${balance.left} days left` : "No allowance recorded") : "No employee record for this role view"}>
        {mine && balance.known ? (
          <Stack gap={3}>
            <Meter value={balance.taken} max={Math.max(1, balance.allowance)} label="Leave used" tone={balance.left <= 2 ? "warning" : "success"} />
            <Properties rows={[
              { label: "Allowance", value: `${balance.allowance} days` },
              { label: "Taken", value: `${balance.taken} days` },
              { label: "Requested, not decided", value: `${myRequests.filter((request) => request.status === "requested").reduce((sum, request) => sum + leaveDays(request), 0)} days` },
            ]} />
            <Button variant="primary" onClick={() => context.openOverlay("Leave form")}>Request leave</Button>
          </Stack>
        ) : (
          <Stack gap={3}>
            <Stat
              label="Balance"
              value="Unavailable"
              unavailable
              meta={mine ? "No allowance on the employee record" : `No employee record matches ${actor}`}
            />
            <p className="ds-subtle">
              {mine
                ? `${mine.title} has an employee record with no leave allowance on it. A balance is shown as unavailable rather than as zero days, which would read as an entitlement somebody had used up.`
                : `No employee record matches ${actor}, so there is no balance to show rather than a made-up number.`}
            </p>
            <Button variant="primary" onClick={() => context.openOverlay("Leave form")}>Request leave anyway</Button>
          </Stack>
        )}
      </Card>
      <Card span={8} eyebrow="REQUESTS" prov="human" title="Your requests" subtitle={`${myRequests.length} on record`} flush>
        {visibleRequests.length === 0 ? <div className="ds-card-body"><Empty title={myRequests.length ? "No requests match this filter" : "You have not asked for leave"}
          icon={<CalendarDays size={20} />}
          action={!myRequests.length ? <Button variant="primary" onClick={() => context.openOverlay("Leave form")}>Request leave</Button> : undefined}>
            {myRequests.length ? "Choose another filter to see your other requests." : "Recorded requests and their decision states appear here."}
          </Empty></div> : (
          <DataGrid
            rows={visibleRequests}
            rowId={(row) => row.id}
            label="My leave requests"
            filterable={false}
            columns={[
              { key: "type", header: "Type", primary: true, cell: (row) => String(row.fields.type ?? "annual") },
              { key: "from", header: "From", cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
              { key: "to", header: "To", cell: (row) => context.date(row.endAt), hideBelow: 700 },
              { key: "days", header: "Days", align: "end", cell: (row) => String(leaveDays(row)) },
              { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "approved" ? "success" : row.status === "declined" ? "danger" : "warning"}>{row.status}</Pill> },
            ]}
          />
        )}
      </Card>
      <Card span={12} eyebrow="TEAM CALENDAR" prov="human" title="The next six weeks" subtitle="Your leave in the context of the team">
        <LeaveCalendar context={context} month={month} />
      </Card>
    </Grid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-008 · Scheduling & Time
 * ------------------------------------------------------------------ */

export function Scheduling({ context, lens }: { context: ScreenContext; lens: "Roster" | "Timesheets" | "Availability" | "Exceptions" }) {
  const data = useCollections(["shifts", "employees", "leaveRequests", "projects"]);
  const { now, org } = useWorkspace();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showEveryone, setShowEveryone] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"pending" | "approved" | "all">("all");
  const [personQuery, setPersonQuery] = useState("");
  const [hideAway, setHideAway] = useState(false);
  const [exceptionFilter, setExceptionFilter] = useState<"all" | "critical" | "review">("all");
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const roster = data.shifts.filter((shift) => shift.fields.kind === "shift");
  const timesheets = data.shifts.filter((shift) => shift.fields.kind === "time");

  if (lens === "Timesheets") {
    const approved = timesheets.filter((entry) => entry.status === "approved" && entry.fields.approved === true);
    const pending = timesheets.filter((entry) => entry.status !== "approved" || entry.fields.approved !== true);
    const rows = timeFilter === "approved" ? approved : timeFilter === "pending" ? pending : timesheets;
    const mismatched = timesheets.filter((entry) => (entry.status === "approved") !== (entry.fields.approved === true));
    const billablePending = pending.filter((entry) => entry.fields.billable === true);
    const sumHours = (entries: Rec[]) => entries.reduce((sum, entry) => {
      const hours = Number(entry.fields.hours ?? 0);
      return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
    }, 0);
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Scheduling / Timesheets"
          title="Review the work. Trust the hours."
          description="Every time entry stays connected to its employee, project and approval history. Decide what needs attention before it reaches Finance."
          actions={<>
            <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Exceptions`)}>View exceptions</Button>
            <Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/project/time`)}>Log project time</Button>
          </>}
          note="Hours represent recorded time, not payroll or invoices."
        />
        <OpsMetrics label="Timesheet review overview">
          <OpsMetric label="Recorded hours" value={sumHours(timesheets).toFixed(2)} detail={`${timesheets.length} time entries`} />
          <OpsMetric label="Awaiting approval" value={pending.length} detail={`${sumHours(pending).toFixed(2)} hours`} emphasis={pending.length ? "attention" : "neutral"} />
          <OpsMetric label="Approved hours" value={sumHours(approved).toFixed(2)} detail="Local human decisions" emphasis="positive" />
          <OpsMetric label="Check source records" value={mismatched.length + billablePending.length} detail={`${mismatched.length} status mismatches · ${billablePending.length} billable pending`} />
        </OpsMetrics>
        <div className="ops-toolbar" aria-label="Filter timesheets">
          <strong className="ops-toolbar-heading">Recorded time</strong>
          <Button size="sm" variant={timeFilter === "all" ? "secondary" : "ghost"} aria-pressed={timeFilter === "all"} onClick={() => setTimeFilter("all")}>All</Button>
          <Button size="sm" variant={timeFilter === "pending" ? "secondary" : "ghost"} aria-pressed={timeFilter === "pending"} onClick={() => setTimeFilter("pending")}>Needs approval ({pending.length})</Button>
          <Button size="sm" variant={timeFilter === "approved" ? "secondary" : "ghost"} aria-pressed={timeFilter === "approved"} onClick={() => setTimeFilter("approved")}>Approved ({approved.length})</Button>
        </div>
        <p className="ops-toolbar-note">
          Select a row and choose Open to see its approval evidence. Correct any mismatched or unlinked source before approval.
        </p>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Timesheets"
          selectedId={context.selectedId}
          onOpen={(id) => context.openOverlay("time review", { id })}
          card={(entry) => {
            const person = data.employees.find((record) => record.id === entry.fields.employeeId);
            const project = data.projects.find((record) => record.id === entry.fields.projectId);
            const approved = entry.status === "approved" && entry.fields.approved === true;
            return <>
              <strong>{person?.title ?? String(entry.fields.employeeName ?? "Unlinked person")}</strong>
              <span className="ds-subtle">{project?.title ?? (entry.fields.projectId ? "Project unavailable" : "Internal work")} · {String(entry.fields.hours ?? "—")}h</span>
              <Pill tone={approved ? "success" : "warning"}>{approved ? "Approved" : "Needs approval"}</Pill>
            </>;
          }}
          columns={[
            { key: "who", header: "Person", primary: true, cell: (row) => {
              const person = data.employees.find((employee) => employee.id === row.fields.employeeId);
              return person ? person.title : <span className="ds-subtle">{String(row.fields.employeeName ?? "Unlinked person")} · verify ID</span>;
            }, sortValue: (row) => String(row.fields.employeeName ?? row.ownerName), filterValue: (row) => String(row.fields.employeeName ?? row.ownerName) },
            { key: "day", header: "Day", cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
            { key: "detail", header: "Against", cell: (row) => {
              const project = data.projects.find((record) => record.id === row.fields.projectId);
              return project
                ? <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/project/projects/${project.id}`)}>{project.title}</Button>
                : <span className="ds-subtle">{row.fields.projectId ? "Project unavailable" : row.summary || "No project linked"}</span>;
            }, hideBelow: 900 },
            { key: "hours", header: "Hours", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.hours ?? 0)}</span>, sortValue: (row) => Number(row.fields.hours ?? 0) },
            { key: "state", header: "State", align: "end", cell: (row) => {
              const consistent = row.status === "approved" && row.fields.approved === true;
              const mismatch = (row.status === "approved") !== (row.fields.approved === true);
              return <Pill tone={mismatch ? "danger" : consistent ? "success" : "warning"}>{mismatch ? "Review mismatch" : consistent ? "Approved" : "Needs approval"}</Pill>;
            }},
          ]}
          summary={<strong className="ds-num">{sumHours(rows).toFixed(2)} hours shown</strong>}
          bulkActions={[{
            label: "Approve hours",
            onRun: async (selected) => {
              try {
                const chosen = selected.filter((row) => !(row.status === "approved" && row.fields.approved === true));
                const plan = planTimesheetApprovals({
                  organizationId: context.org.id, currency: context.org.currency,
                  actor: context.actor, now: clockIso(), timezone: context.org.timezone,
                }, chosen, data.employees, data.projects);
                await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
                context.toast("Hours approved", `${chosen.length} time entr${chosen.length === 1 ? "y" : "ies"} reviewed together in Arlovi. No payroll was submitted.`);
              } catch (error) {
                context.toast("Hours not approved", error instanceof Error ? error.message : "Reload these entries before deciding.", "blocked");
              }
            },
            disabled: (selected) => selected.every((row) => row.status === "approved" && row.fields.approved === true),
          }]}
          onSelect={(id) => context.select(id)}
        />
        <Notice tone="info" title="Approval evidence, not payroll output">
          Approving records a local review decision. It does not pay anyone, calculate statutory deductions or issue an invoice.
          Use the record drawer to inspect Project links and the reviewer first.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Availability") {
    const week = rosterWeekDays(now, org.timezone, weekOffset);
    const staff = data.employees.filter((person) => !["alumni", "terminated"].includes(person.status));
    const weekShifts = roster.filter((shift) =>
      week.some((day) => rosterShiftsForDay([shift], String(shift.fields.employeeId ?? ""), day, org.timezone).length > 0));
    const leaveDaysFor = (person: Rec) => week.filter((day) =>
      employeeOnLeave(data.leaveRequests, person.id, day, org.timezone));
    const shiftsFor = (person: Rec) => weekShifts.filter((shift) =>
      shift.fields.employeeId === person.id);
    const onLeave = staff.filter((person) => leaveDaysFor(person).length > 0);
    const withoutShifts = staff.filter((person) => shiftsFor(person).length === 0);
    const results = staff.filter((person) =>
      (!hideAway || leaveDaysFor(person).length === 0)
      && [person.title, person.fields.title, person.fields.office].some((field) =>
        String(field ?? "").toLowerCase().includes(personQuery.trim().toLowerCase())))
      .sort((a, b) => a.title.localeCompare(b.title));
    const totalHours = weekShifts.reduce((sum, shift) => {
      const hours = Number(shift.fields.hours);
      return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
    }, 0);
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Scheduling / Availability"
          title="See the team behind the schedule."
          description="A people-first weekly view of assigned shifts, approved leave and days without a roster assignment. Review workload before making the next staffing decision."
          actions={<Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Roster`)}>Open weekly roster</Button>}
          note={`Calendar dates reflect ${org.timezone}. No shift does not guarantee availability.`}
        />
        <OpsMetrics label="Weekly workforce availability">
          <OpsMetric label="Employees" value={staff.length} detail="Current company profiles" />
          <OpsMetric label="With a scheduled shift" value={staff.length - withoutShifts.length} detail="At least one shift this week" />
          <OpsMetric label="Approved leave" value={onLeave.length} detail="Employees away during the week" emphasis={onLeave.length ? "attention" : "neutral"} />
          <OpsMetric label="Rostered hours" value={totalHours.toFixed(1)} detail="All shifts touching this week" />
        </OpsMetrics>
        <div className="ops-toolbar">
          <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value - 1)}>Previous</Button>
          <strong className="ops-toolbar-heading">{rosterDateLabel(week[0])} – {rosterDateLabel(week[6])}</strong>
          <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>This week</Button>
          <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value + 1)}>Next</Button>
        </div>
        <div className="ops-toolbar">
          <div className="hr-availability-search">
            <TextInput
              aria-label="Find an employee"
              placeholder="Search employees, roles or locations"
              value={personQuery}
              onChange={(event) => setPersonQuery(event.target.value)}
            />
          </div>
          <Button size="sm" variant={hideAway ? "secondary" : "ghost"} aria-pressed={hideAway}
            onClick={() => setHideAway((value) => !value)}>Hide employees on leave</Button>
          <span className="ops-toolbar-note">{results.length} of {staff.length} people</span>
        </div>
        {results.length === 0 ? (
          <Empty title={staff.length ? "No employees match these filters" : "No employees in this company"} icon={<Users size={20} />}>
            {staff.length ? "Adjust the search or leave filter to review the team." : "Employee records appear here when they are created."}
          </Empty>
        ) : (
          <div className="hr-availability-grid">
            {results.map((person) => {
              const assigned = shiftsFor(person);
              const leave = leaveDaysFor(person);
              const hours = assigned.reduce((sum, shift) => sum + Number(shift.fields.hours ?? 0), 0);
              return (
                <div key={person.id} className="hr-availability-person">
                  <div className="hr-availability-person-heading">
                    <Avatar name={person.title} size="md" />
                    <div className="hr-availability-person-identity">
                      <strong>{person.title}</strong>
                      <span>{String(person.fields.title || person.fields.employment || "Employee")}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/hr/employees/${person.id}`)}>Profile</Button>
                  </div>
                  <div className="hr-availability-summary">
                    <span><strong>{assigned.length}</strong> shifts</span>
                    <span><strong>{Number.isFinite(hours) ? hours.toFixed(1) : "—"}</strong> hours</span>
                    <span>{leave.length ? <strong>{leave.length} leave days</strong> : "No approved leave"}</span>
                  </div>
                  <div className="hr-availability-week" aria-label={`Weekly schedule for ${person.title}`}>
                    {week.map((day) => {
                      const shifts = rosterShiftsForDay(weekShifts, person.id, day, org.timezone);
                      const away = employeeOnLeave(data.leaveRequests, person.id, day, org.timezone);
                      const status = shifts.length && away ? "conflict" : away ? "away" : shifts.length ? "scheduled" : "none";
                      const label = status === "conflict" ? "Shift and leave conflict"
                        : status === "away" ? "Approved leave" : status === "scheduled" ? `${shifts.length} shifts` : "No shift recorded";
                      return (
                        <div className="hr-availability-day" data-state={status} key={day}
                          title={`${rosterDateLabel(day)}: ${label}`}>
                          <span>{rosterDateLabel(day, { weekday: "short" })}</span>
                          <strong>{status === "away" ? "Away" : status === "conflict" ? "!" : shifts.length ? shifts.length : "—"}</strong>
                        </div>
                      );
                    })}
                  </div>
                  <p className="hr-availability-footer">{String(person.fields.office ?? "No workplace recorded")} · Unassigned days need confirmation before offering work.</p>
                </div>
              );
            })}
          </div>
        )}
      </Stack>
    );
  }

  if (lens === "Exceptions") {
    const overtime = roster.filter((shift) => shift.fields.overtime === true && shift.fields.overtimeApproved !== true);
    const clashes = roster.filter((shift) => data.leaveRequests.some((request) => {
      if (request.status !== "approved" || request.fields.employeeId !== shift.fields.employeeId
        || !request.startAt || !request.endAt || !shift.startAt || !shift.endAt) return false;
      try {
        return intervalsOverlap(validShiftInterval(shift), {
          start: Date.parse(request.startAt), end: Date.parse(request.endAt) + 86_400_000,
        });
      } catch { return false; }
    }));
    const unlinked = timesheets.filter((entry) => !data.employees.some((person) => person.id === entry.fields.employeeId)
      || (entry.fields.projectId && !data.projects.some((project) => project.id === entry.fields.projectId)));
    const overlaps = roster.filter((shift) => roster.some((other) => {
      if (shift.id === other.id || shift.fields.employeeId !== other.fields.employeeId || !shift.startAt || !other.startAt) return false;
      try { return intervalsOverlap(validShiftInterval(shift), validShiftInterval(other)); }
      catch { return false; }
    }));
    const unapproved = timesheets.filter((entry) => entry.fields.approved !== true || entry.status !== "approved");
    const rows = [
      ...clashes.map((shift) => ({
        id: `${shift.id}-leave`, recordId: shift.id, source: "shift" as const,
        kind: "Rostered during approved leave", detail: `${String(shift.fields.employeeName ?? "Unlinked employee")} · ${context.date(shift.startAt)}`, tone: "danger" as const,
      })),
      ...overlaps.map((shift) => ({
        id: `${shift.id}-overlap`, recordId: shift.id, source: "shift" as const,
        kind: "Overlapping shift", detail: `${String(shift.fields.employeeName ?? "Unlinked employee")} · ${context.date(shift.startAt)}`, tone: "danger" as const,
      })),
      ...unlinked.map((entry) => ({
        id: `${entry.id}-unlinked`, recordId: entry.id, source: "time" as const,
        kind: "Unlinked time entry", detail: `${String(entry.fields.employeeName ?? "Person not linked")} · Verify the employee or Project source`, tone: "danger" as const,
      })),
      ...overtime.map((shift) => ({
        id: `${shift.id}-overtime`, recordId: shift.id, source: "shift" as const,
        kind: "Overtime review", detail: `${String(shift.fields.employeeName ?? "Unlinked employee")} · ${String(shift.fields.hours ?? "—")}h · ${context.date(shift.startAt)}`, tone: "warning" as const,
      })),
      ...unapproved.map((entry) => ({
        id: `${entry.id}-time`, recordId: entry.id, source: "time" as const,
        kind: "Time awaiting review", detail: `${String(entry.fields.employeeName ?? "Unlinked employee")} · ${String(entry.fields.hours ?? "—")}h`, tone: "warning" as const,
      })),
    ];
    const critical = rows.filter((row) => row.tone === "danger");
    const review = rows.filter((row) => row.tone === "warning");
    const filtered = rows.filter((row) =>
      exceptionFilter === "all" || (exceptionFilter === "critical" ? row.tone === "danger" : row.tone === "warning"));
    const openSource = (row: (typeof rows)[number]) => {
      context.select(row.recordId);
      context.openOverlay(row.source === "shift" ? "Shift edit" : "time review", { id: row.recordId });
    };
    return (
      <Stack gap={4}>
        <OpsHeader
          eyebrow="People / Scheduling / Exceptions"
          title="Issues with a next action."
          description="A focused review queue for roster collisions, unlinked records and hours that still require a human decision."
          actions={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Roster`)}>Return to roster</Button>}
          note="One record can appear more than once if it has separate issues."
        />
        <OpsMetrics label="Scheduling exceptions overview">
          <OpsMetric label="Critical checks" value={critical.length} detail="Leave, overlap or missing links" emphasis={critical.length ? "attention" : "neutral"} />
          <OpsMetric label="Needs review" value={review.length} detail="Time or overtime decisions" />
          <OpsMetric label="Time entries pending" value={unapproved.length} detail="People approval required" />
          <OpsMetric label="Open overtime flags" value={overtime.length} detail="Not a payroll or compliance decision" />
        </OpsMetrics>
        <div className="ops-toolbar" aria-label="Filter scheduling exceptions">
          <strong className="ops-toolbar-heading">Review queue</strong>
          <Button size="sm" variant={exceptionFilter === "all" ? "secondary" : "ghost"} aria-pressed={exceptionFilter === "all"} onClick={() => setExceptionFilter("all")}>All ({rows.length})</Button>
          <Button size="sm" variant={exceptionFilter === "critical" ? "secondary" : "ghost"} aria-pressed={exceptionFilter === "critical"} onClick={() => setExceptionFilter("critical")}>Critical ({critical.length})</Button>
          <Button size="sm" variant={exceptionFilter === "review" ? "secondary" : "ghost"} aria-pressed={exceptionFilter === "review"} onClick={() => setExceptionFilter("review")}>Needs review ({review.length})</Button>
        </div>
        {filtered.length === 0 ? (
          <Empty title={rows.length ? "Nothing in this filter" : "No scheduling exceptions"} icon={<ClipboardCheck size={20} />}>
            {rows.length ? "Switch the queue filter to review other types of issues." : "No leave conflicts, overlapping shifts, unlinked time or pending decisions were found in the local records."}
          </Empty>
        ) : (
          <DataGrid
            rows={filtered}
            rowId={(row) => row.id}
            label="Scheduling exceptions"
            rowTone={(row) => row.tone}
            onOpen={(id) => {
              const row = filtered.find((item) => item.id === id);
              if (row) openSource(row);
            }}
            columns={[
              { key: "kind", header: "Issue", primary: true, cell: (row) => <Pill tone={row.tone}>{row.kind}</Pill>, filterValue: (row) => row.kind },
              { key: "detail", header: "Source and context", cell: (row) => row.detail, filterValue: (row) => row.detail },
              { key: "action", header: "Next action", align: "end", cell: (row) => (
                <Button size="sm" variant="secondary" onClick={() => openSource(row)}>
                  {row.source === "shift" ? "Review shift" : "Review time"}
                </Button>
              ) },
            ]}
          />
        )}
        <Notice tone="info" title="These are operational checks, not compliance decisions">
          Records are checked against saved shifts and approved leave. Resolve the real source and reassess; this screen does not independently establish legal working-time compliance or submit payroll.
        </Notice>
      </Stack>
    );
  }

  const days = rosterWeekDays(now, org.timezone, weekOffset);
  const visibleDays = focusedDay && days.includes(focusedDay) ? [focusedDay] : days;
  const rosterWeek = roster.filter((shift) =>
    days.some((day) => rosterShiftsForDay([shift], String(shift.fields.employeeId ?? ""), day, org.timezone).length > 0));
  const scheduledIds = new Set(rosterWeek.map((shift) => String(shift.fields.employeeId ?? "")));
  const people = data.employees
    .filter((employee) => scheduledIds.has(employee.id) || (showEveryone && !["alumni", "terminated"].includes(employee.status)))
    .sort((a, b) => a.title.localeCompare(b.title));
  const assignedHours = rosterWeek.reduce((sum, shift) => {
    const amount = Number(shift.fields.hours);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const unlinkedCount = rosterWeek.filter((shift) =>
    !data.employees.some((person) => person.id === shift.fields.employeeId)).length;
  const overtimeCount = rosterWeek.filter((shift) => shift.fields.overtime === true
    && shift.fields.overtimeApproved !== true).length;
  const dayShifts = (employee: Rec, day: string) => rosterShiftsForDay(rosterWeek, employee.id, day, org.timezone);
  const dayAway = (employee: Rec, day: string) => employeeOnLeave(data.leaveRequests, employee.id, day, org.timezone);
  const shiftButton = (shift: Rec, day: string) => {
    const project = data.projects.find((row) => row.id === shift.fields.projectId);
    const continues = shiftDays(shift, org.timezone)?.startKey !== day;
    const start = shift.startAt ? context.dateTime(shift.startAt) : "Unknown start";
    return (
      <button key={shift.id} type="button" className="hr-shift"
        aria-label={`Edit ${shift.fields.place || "shift"} for ${shift.fields.employeeName || "employee"}, ${start}`}
        onClick={() => { context.select(shift.id); context.openOverlay("Shift edit", { id: shift.id }); }}>
        <strong>{String(shift.fields.place ?? "Unassigned place")}</strong>
        <span className="ds-subtle">{continues ? "Continues · " : ""}{shift.startAt
          ? new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(shift.startAt))
          : "Unknown time"} · {String(shift.fields.hours ?? 0)}h</span>
        {project && <span className="ds-subtle">{project.title}</span>}
        {shift.fields.projectId && !project && <span className="ds-subtle">Project unavailable</span>}
        {shift.fields.overtime === true && <span className="ds-subtle">Overtime review</span>}
      </button>
    );
  };

  return (
    <Stack gap={4}>
      <OpsHeader
        eyebrow="People / Scheduling / Roster"
        title="The week, completely in view."
        description="A clearer staffing picture with every shift, every person and every overnight assignment. Focus on a day or keep the full week in view."
        actions={<>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Availability`)}>Team availability</Button>
          <Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/hr/scheduling?tab=Timesheets`)}>Review timesheets</Button>
        </>}
        note={`Times shown in ${org.timezone}; the saved records retain their UTC timestamps.`}
      />
      <OpsMetrics label="Week staffing summary">
        <OpsMetric label="Scheduled shifts" value={rosterWeek.length} detail="Including overnight assignments" />
        <OpsMetric label="Assigned people" value={scheduledIds.size} detail="Employees with at least one shift" />
        <OpsMetric label="Rostered hours" value={assignedHours.toFixed(1)} detail="Entered shift durations" />
        <OpsMetric label="Needs attention" value={overtimeCount + unlinkedCount}
          detail={`${overtimeCount} overtime reviews · ${unlinkedCount} missing employee links`}
          emphasis={overtimeCount + unlinkedCount ? "attention" : "neutral"} />
      </OpsMetrics>
      <div className="ops-toolbar hr-roster-toolbar">
        <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value - 1)}>Previous week</Button>
        <strong className="ops-toolbar-heading">{rosterDateLabel(days[0])} – {rosterDateLabel(days[6])}</strong>
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>This week</Button>
        <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value + 1)}>Next week</Button>
        <Button size="sm" variant="secondary" onClick={() => setShowEveryone((value) => !value)}>
          {showEveryone ? "Scheduled people" : "Show everyone"}
        </Button>
      </div>
      <div className="hr-roster-weekdays" role="group" aria-label="Focus staffing day">
        <button type="button" className="hr-roster-day-summary" data-active={visibleDays.length === 7}
          aria-pressed={visibleDays.length === 7} onClick={() => setFocusedDay(null)}>
          <span>Scope</span><strong>Full week</strong><small>7 days</small>
        </button>
        {days.map((day) => {
          const coverage = dailyCoverage(rosterWeek, data.employees, day, org.timezone);
          return (
            <button type="button" key={day} className="hr-roster-day-summary"
              aria-pressed={visibleDays.length === 1 && visibleDays[0] === day}
              data-active={visibleDays.length === 1 && visibleDays[0] === day}
              onClick={() => setFocusedDay((current) => current === day ? null : day)}>
              <span>{rosterDateLabel(day)}</span>
              <strong>{coverage.people} people</strong>
              <small>{coverage.shifts} shift{coverage.shifts === 1 ? "" : "s"}</small>
            </button>
          );
        })}
      </div>
      <div className="hr-roster-section-heading">
        <h3 className="ops-section-title">{visibleDays.length === 1 ? rosterDateLabel(visibleDays[0]) : "Weekly assignment grid"}</h3>
        <span className="ops-toolbar-note">Select any shift to change its person, place, time or Project.</span>
      </div>
      {people.length === 0 ? (
        <Empty title="No shifts this week" icon={<CalendarDays size={20} />}>
          Change week or show everyone to inspect employees without assignments.
        </Empty>
      ) : (
        <>
          <div className="ds-grid-wrap hr-roster-table">
            <div className="ds-grid-scroll">
              <table className="ds-table">
                <caption className="ds-sr-only">Roster beginning {rosterDateLabel(days[0])} in {org.timezone}. Each cell lists all shifts for the day.</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {visibleDays.map((day) => {
                      const count = dailyCoverage(rosterWeek, data.employees, day, org.timezone);
                      return <th key={day} scope="col">
                        <span>{rosterDateLabel(day)}</span>
                        <span className="ds-subtle hr-roster-coverage">{count.people} people · {count.shifts} shifts</span>
                      </th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id}>
                      <th scope="row" style={{ textAlign: "start", padding: "var(--space-2) var(--space-3)" }}>
                        <Row gap={2}><Avatar name={person.title} size="sm" />{person.title}</Row>
                      </th>
                      {visibleDays.map((day) => {
                        const shifts = dayShifts(person, day);
                        const away = dayAway(person, day);
                        return (
                          <td key={day} className="hr-roster-cell">
                            <div className="hr-roster-stack">
                              {away && <Pill tone={shifts.length ? "danger" : "neutral"}>{shifts.length ? "Leave conflict" : "Away"}</Pill>}
                              {shifts.map((shift) => shiftButton(shift, day))}
                              {!away && shifts.length === 0 && <span className="ds-subtle">—</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="hr-roster-cards">
            {people.map((person) => {
              const scheduled = visibleDays.filter((day) => dayShifts(person, day).length > 0 || dayAway(person, day));
              return (
                <Card key={person.id} title={<Row gap={2}><Avatar name={person.title} size="sm" />{person.title}</Row>}
                  subtitle={String(person.fields.title ?? "Employee")}>
                  <Stack gap={3}>
                    {scheduled.length === 0 && <p className="ds-subtle">No shifts or approved leave this week.</p>}
                    {scheduled.map((day) => {
                      const shifts = dayShifts(person, day);
                      const away = dayAway(person, day);
                      return (
                        <div key={day} className="hr-roster-mobile-day">
                          <strong>{rosterDateLabel(day)}</strong>
                          <div className="hr-roster-stack">
                            {away && <Pill tone={shifts.length ? "danger" : "neutral"}>{shifts.length ? "Leave conflict" : "Away"}</Pill>}
                            {shifts.map((shift) => shiftButton(shift, day))}
                          </div>
                        </div>
                      );
                    })}
                  </Stack>
                </Card>
              );
            })}
          </div>
        </>
      )}
      <Notice tone="info" title="Each shift remains separately editable">
        Open any shift to edit its assignment, place, hours or Project. Multiple and overnight shifts remain visible;
        overlaps and approved leave are checked on save. Keyboard controls work without drag and drop.
      </Notice>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-009 · Payroll
 * ------------------------------------------------------------------ */

export interface PayLine {
  employeeId: string; name: string; grossMinor: number; taxMinor: number; niMinor: number;
  pensionMinor: number; netMinor: number; basis: string;
}

/** Monthly pay computed from the employee record. Illustrative, not a tax engine. */
export function computePayroll(employees: Rec[]): PayLine[] {
  return employees
    .filter((employee) => employee.status !== "alumni" && employee.fields.employment !== "contractor")
    .map((employee) => {
      const annual = Number(employee.fields.salaryMinor ?? 0);
      const gross = Math.round(annual / 12);
      const taxable = Math.max(0, gross - 104_583);
      const tax = Math.round(taxable * 0.2);
      const ni = Math.round(Math.max(0, gross - 104_583) * 0.08);
      const pension = Math.round(gross * (Number(employee.fields.pensionPct ?? 0) / 100));
      return {
        employeeId: employee.id,
        name: employee.title,
        grossMinor: gross,
        taxMinor: tax,
        niMinor: ni,
        pensionMinor: pension,
        netMinor: gross - tax - ni - pension,
        basis: String(employee.fields.employment ?? "full-time"),
      };
    });
}

export function Payroll({ context, lens }: { context: ScreenContext; lens: "Runs" | "Inputs" | "Approvals" | "Payslips" }) {
  const data = useCollections(["payrollRuns", "employees", "shifts"]);
  const lines = useMemo(() => computePayroll(data.employees), [data.employees]);
  const gross = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const net = lines.reduce((sum, line) => sum + line.netMinor, 0);

  if (!context.can("view_payroll")) {
    return (
      <Stack gap={4}>
        <Stat label="Payroll" value="Hidden in this role view" unavailable meta="Switch to the People or Owner view" />
        <RoleViewNote what="Pay, deductions and payslips" />
      </Stack>
    );
  }

  const banner = (
    <Notice tone="warning" title="Nothing here is filed or paid">
      These figures are computed in this browser from the salaries on each employee record. No payroll provider, tax authority or
      bank is connected, so a run can be prepared, checked and approved locally and then exported as a file for a person to use.
    </Notice>
  );

  if (lens === "Inputs") {
    return (
      <Stack gap={4}>
        {banner}
        <DataGrid
          rows={lines}
          rowId={(row) => row.employeeId}
          label="Payroll inputs"
          columns={[
            { key: "name", header: "Person", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
            { key: "basis", header: "Basis", cell: (row) => row.basis },
            { key: "gross", header: "Gross this month", align: "end", cell: (row) => <span className="ds-num">{context.money(row.grossMinor)}</span>, sortValue: (row) => row.grossMinor },
            { key: "pension", header: "Pension", align: "end", cell: (row) => <span className="ds-num">{context.money(row.pensionMinor)}</span> },
          ]}
          summary={<strong className="ds-num">{context.money(gross)} gross</strong>}
        />
        <Notice tone="info">Contractors are excluded: they invoice, and their invoices live in Finance rather than in a payroll run.</Notice>
      </Stack>
    );
  }

  if (lens === "Approvals") {
    const pending = data.payrollRuns.filter((run) => run.status === "draft");
    return (
      <Stack gap={4}>
        {banner}
        {pending.length === 0 ? <Empty title="No run is waiting for approval" icon={<ClipboardCheck size={20} />} /> : pending.map((run) => (
          <Card key={run.id} title={run.title} subtitle={`Period ${String(run.fields.period ?? "")}`} actions={<Pill tone="warning" dot>Draft</Pill>}
            footer={<>
              <Button size="sm" variant="primary" onClick={() => context.openOverlay("submission signoff", { id: run.id })}>Approve this run</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("exception report", { id: run.id })}>Exceptions</Button>
            </>}>
            <Properties rows={[
              { label: "People", value: String(lines.length) },
              { label: "Gross", value: context.money(gross) },
              { label: "Net", value: context.money(net) },
              { label: "Filed with an authority", value: <Pill tone="warning">No connection</Pill> },
              { label: "Bank file sent", value: <Pill tone="warning">No connection</Pill> },
            ]} />
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Payslips") {
    return (
      <Stack gap={4}>
        {banner}
        <DataGrid
          rows={lines}
          rowId={(row) => row.employeeId}
          label="Payslips"
          columns={[
            { key: "name", header: "Person", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
            { key: "gross", header: "Gross", align: "end", cell: (row) => <span className="ds-num">{context.money(row.grossMinor)}</span> },
            { key: "tax", header: "Tax", align: "end", cell: (row) => <span className="ds-num">{context.money(row.taxMinor)}</span> },
            { key: "ni", header: "NI", align: "end", cell: (row) => <span className="ds-num">{context.money(row.niMinor)}</span>, hideBelow: 700 },
            { key: "pension", header: "Pension", align: "end", cell: (row) => <span className="ds-num">{context.money(row.pensionMinor)}</span>, hideBelow: 900 },
            { key: "net", header: "Net", align: "end", cell: (row) => <strong className="ds-num">{context.money(row.netMinor)}</strong>, sortValue: (row) => row.netMinor },
          ]}
          summary={<strong className="ds-num">{context.money(net)} net</strong>}
        />
        <Notice tone="warning" title="A payslip here is an illustration">
          Tax and national insurance use one flat illustrative rate, not the current jurisdiction rules. A real run needs a payroll
          provider that knows this organisation's tax codes, thresholds and reliefs.
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      {banner}
      <StatRow>
        <Stat label="People in the run" value={String(lines.length)} prov="human" meta="Contractors invoice separately" />
        <Stat label="Gross" value={context.money(gross)} prov="human" meta="Computed from salaries in this browser" />
        <Stat label="Net" value={context.money(net)} prov="human" meta="After the illustrative deductions" />
        <Stat label="Filed" value="Not connected" unavailable meta="No tax authority connection" />
      </StatRow>
      <DataGrid
        rows={data.payrollRuns}
        rowId={(row) => row.id}
        label="Payroll runs"
        columns={[
          { key: "title", header: "Run", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
          { key: "period", header: "Period", cell: (row) => String(row.fields.period ?? "") },
          { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "approved" ? "success" : "warning"} dot>{row.status}</Pill> },
          { key: "approver", header: "Approved by", cell: (row) => String(row.fields.approvedBy ?? "—"), hideBelow: 900 },
          { key: "filed", header: "Filed", align: "end", cell: () => <Pill tone="warning">No</Pill> },
        ]}
        onOpen={(id) => context.openOverlay("Payroll review", { id })}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-010 · Performance Reviews
 * ------------------------------------------------------------------ */

export function Performance({ context, lens }: { context: ScreenContext; lens: "Cycles" | "My reviews" | "Team" | "Templates" }) {
  const data = useHrData();
  const { actor, org } = useWorkspace();
  const [query, setQuery] = useState("");
  const [reviewState, setReviewState] = useState<"all" | "outstanding" | "acknowledged">("all");
  const reviews = data.reviews;
  const acknowledged = reviews.filter((review) => review.status === "acknowledged");
  const outstanding = reviews.filter((review) => review.status !== "acknowledged");
  const cycles = [...new Set(reviews.map((review) => String(review.fields.cycle ?? "")).filter(Boolean))];
  const mine = reviews.filter((review) =>
    String(review.fields.employeeName ?? "") === actor || String(review.fields.reviewer ?? "") === actor);
  const canEdit = context.can("edit_people");
  const titles = {
    Cycles: "Every review cycle, accounted for.",
    "My reviews": "Your reviews and decisions.",
    Team: "The team review ledger.",
    Templates: "Structure before judgement.",
  };
  const descriptions = {
    Cycles: "Review completion and missing acknowledgements by recorded cycle. Ratings never become performance quotas.",
    "My reviews": "See reviews attributed to you as a reviewer or employee, including outstanding acknowledgements.",
    Team: "Check the people, owners and completion status behind each review without automated employee ranking.",
    Templates: "Illustrative review structures for fair, evidence-led conversations. These examples are not automatically published templates.",
  };
  const header = (
    <OpsHeader eyebrow={`People / Performance / ${lens}`} title={titles[lens]} description={descriptions[lens]}
      actions={<>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Open employees</Button>
        {canEdit && <Button variant="primary" onClick={() => context.openOverlay("Review form")}>Create a review</Button>}
      </>}
      note="Written assessments remain attributable to a human reviewer; AI output does not determine employment outcomes."
    />
  );
  const metrics = (
    <OpsMetrics label="Performance review overview">
      <OpsMetric label="Review cycles" value={cycles.length} detail="Distinct recorded periods" />
      <OpsMetric label="Recorded reviews" value={reviews.length} detail="Across the company" />
      <OpsMetric label="Awaiting completion" value={outstanding.length} detail="Not acknowledged" emphasis={outstanding.length ? "attention" : "neutral"} />
      <OpsMetric label="Acknowledged" value={acknowledged.length} detail="Local acknowledgement records" emphasis={acknowledged.length ? "positive" : "neutral"} />
    </OpsMetrics>
  );
  const searchable = (review: Rec) =>
    [review.title, review.fields.employeeName, review.fields.reviewer, review.fields.cycle]
      .some((field) => String(field ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  const stateFilter = (review: Rec) =>
    reviewState === "all" || (reviewState === "acknowledged"
      ? review.status === "acknowledged" : review.status !== "acknowledged");
  const filterBar = (title: string, showStatus = true) => (
    <div className="ops-toolbar" aria-label={`Filter ${title}`}>
      <strong className="ops-toolbar-heading">{title}</strong>
      <div className="hr-directory-search">
        <TextInput aria-label="Search performance reviews" placeholder="Person, reviewer or cycle"
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {showStatus && (["all", "outstanding", "acknowledged"] as const).map((option) => (
        <Button key={option} size="sm" variant={reviewState === option ? "secondary" : "ghost"}
          aria-pressed={reviewState === option} onClick={() => setReviewState(option)}>
          {option === "all" ? "All" : option === "outstanding" ? "Outstanding" : "Acknowledged"}
        </Button>
      ))}
    </div>
  );

  if (lens === "My reviews") {
    const shown = mine.filter((review) => searchable(review) && stateFilter(review));
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        {filterBar("My review records")}
        {shown.length === 0 ? (
          <Empty title={mine.length ? "No reviews match these filters" : "No review involves you"} icon={<ClipboardCheck size={20} />}>
            {mine.length ? "Change the search or completion filter." : "Only reviews you write or receive appear here."}
          </Empty>
        ) : (
          <div className="hr-performance-grid">
            {shown.map((review) => (
              <Card key={review.id} eyebrow="MY REVIEW" title={review.title}
                subtitle={String(review.fields.cycle || "Cycle not recorded")}
                actions={<Pill tone={review.status === "acknowledged" ? "success" : "info"}>{review.status}</Pill>}
                footer={<Button size="sm" variant="secondary" onClick={() => {
                  context.select(review.id); context.openOverlay("Review form", { id: review.id });
                }}>Open review</Button>}>
                <Stack gap={2}>
                  <p className="ds-subtle">{review.summary || "No written review summary recorded."}</p>
                  <Properties rows={[
                    { label: "Reviewer", value: String(review.fields.reviewer || "Not assigned") },
                    { label: "Employee", value: String(review.fields.employeeName || "Not linked") },
                  ]} />
                </Stack>
              </Card>
            ))}
          </div>
        )}
      </Stack>
    );
  }

  if (lens === "Team") {
    if (!canEdit) return <Stack gap={4}>{header}<RoleViewNote what="Team performance records" /></Stack>;
    const shown = reviews.filter((review) => searchable(review) && stateFilter(review));
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        {filterBar("Team review records")}
        <DataGrid
          rows={shown}
          rowId={(review) => review.id}
          label="Team review ledger"
          selectedId={context.selectedId}
          card={(review) => <>
            <strong>{String(review.fields.employeeName || "Unlinked employee")}</strong>
            <span className="ds-subtle">{String(review.fields.cycle || "No cycle")} · {String(review.fields.reviewer || "Unassigned reviewer")}</span>
            <Pill tone={review.status === "acknowledged" ? "success" : "info"}>{review.status}</Pill>
          </>}
          columns={[
            { key: "person", header: "Employee", primary: true, cell: (row) => String(row.fields.employeeName || "Unlinked person"),
              sortValue: (row) => String(row.fields.employeeName ?? ""), filterValue: (row) => `${String(row.fields.employeeName ?? "")} ${String(row.fields.reviewer ?? "")}` },
            { key: "cycle", header: "Cycle", cell: (row) => String(row.fields.cycle || "Not recorded") },
            { key: "reviewer", header: "Reviewer", cell: (row) => String(row.fields.reviewer || "Unassigned"), hideBelow: 900 },
            { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "acknowledged" ? "success" : "info"}>{row.status}</Pill> },
          ]}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.openOverlay("Review form", { id })}
          empty={<Empty title="No team reviews match the filters" icon={<ClipboardCheck size={20} />}>
            Select another state or search to inspect team records.
          </Empty>}
        />
        <Notice tone="info" title="Ratings are evidence, not a ranking">
          No employee order, compensation decision or calibration quota is generated from review ratings.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Templates") {
    const templates = [
      { id: "year-end", title: "Year-end reflection", purpose: "Evidence-led annual assessment",
        sections: "Evidence, competencies, objectives and development", scale: "Below / Meeting / Exceeding" },
      { id: "check-in", title: "Mid-year check-in", purpose: "Structured coaching conversation",
        sections: "What is working, blockers and one meaningful change", scale: "No numerical rating" },
      { id: "probation", title: "Probation review", purpose: "Evaluate documented role expectations",
        sections: "Requirements, support given and the recorded outcome", scale: "Pass / Extend / Not passed" },
    ];
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        <Notice tone="info" title="Reference structures, not saved form templates">
          These examples describe review formats. They are not company-approved templates and no action here silently creates a review or applies a score.
        </Notice>
        <div className="hr-performance-grid">
          {templates.map((template) => (
            <Card key={template.id} eyebrow="FORMAT EXAMPLE" title={template.title} subtitle={template.purpose}>
              <Properties rows={[
                { label: "Sections", value: template.sections },
                { label: "Scale", value: template.scale },
                { label: "Publication", value: "Illustrative only" },
              ]} />
            </Card>
          ))}
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      {header}
      {metrics}
      {cycles.length === 0 ? (
        <Empty title="No review cycles recorded" icon={<ClipboardCheck size={20} />}
          action={canEdit ? <Button variant="primary" onClick={() => context.openOverlay("Review form")}>Create review</Button> : undefined}>
          Cycles appear once recorded employee reviews refer to them.
        </Empty>
      ) : (
        <div className="hr-performance-grid">
          {cycles.map((cycle) => {
            const members = reviews.filter((review) => review.fields.cycle === cycle);
            const done = members.filter((review) => review.status === "acknowledged").length;
            return (
              <Card key={cycle} eyebrow="REVIEW CYCLE" title={cycle} subtitle={`${members.length} recorded reviews`}
                actions={<Pill tone={done === members.length ? "success" : "info"}>{done} acknowledged</Pill>}
                footer={<Button size="sm" variant="secondary" onClick={() => context.setTab("Team")}>Review team records</Button>}>
                <Stack gap={3}>
                  <Meter value={done} max={Math.max(1, members.length)} label={`${cycle} acknowledged reviews`} />
                  {members.slice(0, 5).map((review) => (
                    <Row key={review.id} gap={2}>
                      <span className="ds-grow ds-truncate">{String(review.fields.employeeName || "Unlinked person")}</span>
                      <Pill tone={review.status === "acknowledged" ? "success" : "neutral"}>{review.status}</Pill>
                    </Row>
                  ))}
                  {members.length > 5 && <span className="ds-subtle">+{members.length - 5} further reviews in the team ledger</span>}
                </Stack>
              </Card>
            );
          })}
        </div>
      )}
      <Notice tone="info" title="A cycle is not a rating quota">
        Compare written evidence and incomplete acknowledgements before making any human decision. No automated scoring or disciplinary decision occurs here.
      </Notice>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-011 · Learning & Policies
 * ------------------------------------------------------------------ */

export function Learning({ context, lens }: { context: ScreenContext; lens: "Courses" | "Policies" | "Compliance" | "My learning" }) {
  const data = useHrData();
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const courses = data.courses;
  const policies = data.policies.filter((policy) => policy.fields.kind === "hr");
  const staff = humans(data.employees);
  const required = courses.filter((course) => course.fields.required === true);
  const acknowledging = policies.filter((policy) => policy.fields.acknowledgementRequired === true);
  const canEdit = context.can("edit_people");
  const matches = (record: Rec) =>
    [record.title, record.summary, record.fields.version].some((field) =>
      String(field ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  const titles = {
    Courses: "Learning people can actually follow.",
    Policies: "Policies that can be read and acknowledged.",
    Compliance: "Requirements, evidence and outstanding work.",
    "My learning": "Your learning record, in context.",
  };
  const header = (
    <OpsHeader eyebrow={`People / Learning & Policies / ${lens}`}
      title={titles[lens]}
      description="Find the recorded courses, required acknowledgements and training obligations without inventing certificates or completed assessments."
      actions={<>
        <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hr/employees`)}>Employee directory</Button>
        {canEdit && <Button variant="primary" onClick={() => context.openOverlay("Course builder")}>Create course</Button>}
      </>}
      note="Local training and policy records are not independently verified legal compliance or externally issued certification."
    />
  );
  const metrics = (
    <OpsMetrics label="Learning and policy summary">
      <OpsMetric label="Recorded courses" value={courses.length} detail="Company learning content" />
      <OpsMetric label="Required courses" value={required.length} detail="Marked mandatory" />
      <OpsMetric label="HR policies" value={policies.length} detail="Policy records and revisions" />
      <OpsMetric label="Acknowledgement required" value={acknowledging.length} detail="Policies with required sign-off"
        emphasis={acknowledging.length ? "attention" : "neutral"} />
    </OpsMetrics>
  );
  const toolbar = (title: string, showRequired = false) => (
    <div className="ops-toolbar">
      <strong className="ops-toolbar-heading">{title}</strong>
      <div className="hr-directory-search">
        <TextInput aria-label="Search learning and policies" placeholder="Search courses, policies or versions"
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {showRequired && <Button size="sm" variant={requiredOnly ? "secondary" : "ghost"} aria-pressed={requiredOnly}
        onClick={() => setRequiredOnly((value) => !value)}>Required only</Button>}
    </div>
  );
  if (lens === "Policies") {
    const shown = policies.filter((policy) => matches(policy)
      && (!requiredOnly || policy.fields.acknowledgementRequired === true));
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        {toolbar("Policy register", true)}
        {shown.length === 0 ? <Empty title={policies.length ? "No policies match the filters" : "No HR policies recorded"}
          icon={<BookOpen size={20} />}>Clear the filters or publish the actual policy record before requesting acknowledgement.</Empty> : (
          <div className="hr-learning-grid">
            {shown.map((policy) => {
              const recorded = Number(policy.fields.acknowledged);
              const hasCount = Number.isFinite(recorded) && recorded >= 0 && policy.fields.acknowledged !== undefined;
              return (
                <Card key={policy.id} eyebrow="HR POLICY" title={policy.title}
                  subtitle={`Version ${String(policy.fields.version || "not recorded")} · ${context.date(policy.at)}`}
                  actions={<Pill tone={policy.fields.acknowledgementRequired === true ? "warning" : "neutral"}>
                    {policy.fields.acknowledgementRequired === true ? "Sign-off required" : "Read when needed"}
                  </Pill>}
                  footer={<>
                    {canEdit && <Button size="sm" variant="secondary" onClick={() =>
                      context.openOverlay("policy publication", { id: policy.id })}>Review revision</Button>}
                    {policy.fields.acknowledgementRequired === true && <Button size="sm" variant="primary"
                      onClick={() => recordAcknowledgement(context, policy)}>Acknowledge</Button>}
                  </>}
                >
                  <Stack gap={3}>
                    <p className="ds-subtle">{policy.summary || "No policy summary recorded."}</p>
                    <Properties rows={[
                      { label: "Recorded acknowledgements", value: hasCount
                        ? `${recorded} aggregate entries` : "Not recorded" },
                      { label: "Review due", value: policy.dueAt ? context.date(policy.dueAt) : "No review date set" },
                    ]} />
                    <span className="ds-subtle">The aggregate is not proof that every current staff member acknowledged this version.</span>
                  </Stack>
                </Card>
              );
            })}
          </div>
        )}
      </Stack>
    );
  }

  if (lens === "Compliance") {
    const rows = required.filter(matches).map((course) => {
      const recorded = Number(course.fields.completions);
      const verified = course.fields.completions !== undefined && Number.isFinite(recorded) && recorded >= 0;
      return { id: course.id, title: course.title, recorded: verified ? recorded : null,
        audience: staff.length, status: verified ? "Aggregate recorded" : "No completion aggregate" };
    });
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        {toolbar("Required training checks")}
        <Notice tone="warning" title="Aggregate totals do not establish individual compliance">
          Required status and completion aggregates are stored on course records. Without individual learner evidence, an aggregate
          cannot prove that a specific person completed the current requirement, or that every employee was assigned it.
        </Notice>
        <DataGrid
          rows={rows} rowId={(row) => row.id} label="Required course evidence"
          columns={[
            { key: "course", header: "Requirement", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "recorded", header: "Recorded completions", align: "end", cell: (row) =>
              row.recorded === null ? "Not recorded" : <span className="ds-num">{row.recorded}</span> },
            { key: "audience", header: "Current human staff", align: "end", cell: (row) => <span className="ds-num">{row.audience}</span> },
            { key: "state", header: "Evidence", cell: (row) => <Pill tone={row.recorded === null ? "warning" : "info"}>{row.status}</Pill> },
          ]}
          empty={<Empty title={required.length ? "No requirements match the search" : "No required courses recorded"}
            icon={<GraduationCap size={20} />}>Choose a different search or mark an actual course required.</Empty>}
        />
      </Stack>
    );
  }

  if (lens === "My learning") {
    return (
      <Stack gap={4}>
        {header}
        {metrics}
        <Notice tone="info" title="Personal progress belongs to the individual learner">
          Only the local learner records that match your active role are shown below. Company aggregate totals are not a substitute for personal completion evidence.
        </Notice>
        <MyLearning context={context} />
      </Stack>
    );
  }

  const shown = courses.filter((course) => matches(course) && (!requiredOnly || course.fields.required === true));
  return (
    <Stack gap={4}>
      {header}
      {metrics}
      {toolbar("Course library", true)}
      {shown.length === 0 ? (
        <Empty title={courses.length ? "No courses match the filters" : "No courses recorded"} icon={<GraduationCap size={20} />}
          action={canEdit ? <Button variant="primary" onClick={() => context.openOverlay("Course builder")}>Create course</Button> : undefined}>
          {courses.length ? "Change the search or show optional courses." : "Create a course to add it to the company learning library."}
        </Empty>
      ) : (
        <div className="hr-learning-grid">
          {shown.map((course) => {
            const total = Number(course.fields.completions);
            const hasAggregate = course.fields.completions !== undefined && Number.isFinite(total) && total >= 0;
            return (
              <Card key={course.id} eyebrow="LEARNING" title={course.title}
                subtitle={course.fields.minutes ? `${String(course.fields.minutes)} minutes recorded` : "Duration not recorded"}
                actions={<Pill tone={course.fields.required === true ? "warning" : "neutral"}>
                  {course.fields.required === true ? "Required" : "Optional"}
                </Pill>}
                footer={<>
                  {canEdit && <Button size="sm" variant="secondary" onClick={() =>
                    context.openOverlay("Course builder", { id: course.id })}>Edit course</Button>}
                  <Button size="sm" variant="ghost" onClick={() =>
                    context.openOverlay("quiz", { id: course.id })}>Preview quiz</Button>
                </>}
              >
                <Stack gap={2}>
                  <p className="ds-subtle">{course.summary || "No course summary recorded."}</p>
                  <Properties rows={[
                    { label: "Completion aggregate", value: hasAggregate ? `${total} recorded` : "Not recorded" },
                    { label: "Individual evidence", value: "Review in learner records" },
                  ]} />
                </Stack>
              </Card>
            );
          })}
        </div>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function LeaveForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["employees", "leaveRequests"]);
  const { actor, now } = useWorkspace();
  const mine = data.employees.find((employee) => employee.title === actor && employee.status !== "alumni");
  const currentEmployees = data.employees.filter((employee) => !["alumni", "terminated"].includes(employee.status));
  const [employeeId, setEmployeeId] = useState(mine?.id ?? currentEmployees[0]?.id ?? "");
  const [type, setType] = useState("annual");
  const [from, setFrom] = useState(addDays(now, 7).toISOString().slice(0, 10));
  const [to, setTo] = useState(addDays(now, 9).toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const employee = currentEmployees.find((row) => row.id === employeeId);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to));
  const backwards = validDates && new Date(to) < new Date(from);
  const dayCount = validDates && !backwards ? Math.max(1, daysBetween(new Date(from), new Date(to))) : 0;
  const validDuration = Number.isFinite(dayCount) && dayCount > 0;
  const balance = employee ? leaveBalance(employee) : undefined;
  const overBalance = type === "annual" && balance?.known === true && dayCount > balance.left;

  return (
    <form
      id="hr-leave-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!validDates || backwards || !validDuration || !employee) {
          context.toast("Leave request not saved", "Choose a current employee and valid dates in chronological order.", "blocked");
          return;
        }
        await context.mutate.create({
          collection: "leaveRequests",
          title: `${employee.title.split(" ")[0]} · ${type}`,
          status: "requested",
          summary: note || `${type} leave requested from the leave screen.`,
          startAt: new Date(`${from}T00:00:00.000Z`).toISOString(),
          endAt: new Date(`${to}T00:00:00.000Z`).toISOString(),
          at: clockIso(),
          fields: { employeeId: employee.id, employeeName: employee.title, type, days: dayCount,
            approver: String(employee.fields.manager || "Unassigned"), halfDay: false },
        }, `Leave requested by ${employee.title}`);
        context.toast("Leave requested", `${dayCount} days recorded locally for a review by ${String(employee.fields.manager || "a manager")}.`);
        close();
      }}
    >
      <Field label="Who is away" required>
        <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          {currentEmployees.length === 0 && <option value="">No current employees</option>}
          {currentEmployees.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Type">
        <Select value={type} onChange={(event) => setType(event.target.value)}>
          {["annual", "sick", "parental", "unpaid", "compassionate"].map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="From" required><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
        <Field label="To" required><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} invalid={backwards} required /></Field>
      </Row>
      {(!validDates || backwards) && <Notice tone="danger" title="Check the date range">
        Choose valid start and end dates with the end date on or after the start date.
      </Notice>}
      <Field label="Note for your manager" hint={type === "sick" ? "Do not record health detail here: it would appear in the absence record." : undefined}>
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
      </Field>
      <Properties rows={[
        { label: "Days requested", value: validDuration ? String(dayCount) : "Check dates" },
        { label: "Balance now", value: balance?.known ? `${balance.left} of ${balance.allowance}` : "No verified allowance" },
        { label: "Balance if approved", value: type !== "annual" ? "Annual balance unaffected"
          : balance?.known && validDuration && !overBalance ? `${balance.left - dayCount} of ${balance.allowance}`
          : "Cannot confirm until the allowance and dates are valid" },
      ]} />
      {overBalance && <Notice tone="warning" title="Annual leave exceeds the recorded balance">
        The request may be recorded, but it cannot be approved as annual leave without an amended, verified allowance. Review unpaid leave separately.
      </Notice>}
      {type === "annual" && !balance?.known && <Notice tone="warning" title="Leave allowance has not been recorded">
        The request can still be submitted for review; approval remains blocked until People verifies the employee's annual allowance.
      </Notice>}
    </form>
  );
}

export function LeaveApproval({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCollections(["leaveRequests", "employees"]);
  const pending = data.leaveRequests.filter((request) => request.status === "requested");
  const explicitId = payload?.id ?? context.selectedId;
  const chosen = explicitId
    ? pending.find((request) => request.id === explicitId)
    : pending[0];
  if (!chosen) return <Empty title={explicitId ? "The selected leave request is unavailable" : "Nothing is waiting for a decision"}
    icon={<ClipboardCheck size={20} />}>
    {explicitId ? "A request may have been decided in another view. Select a current request and try again." : "New leave requests appear here for a named human reviewer."}
  </Empty>;
  const employee = data.employees.find((row) => row.id === chosen.fields.employeeId);
  const count = leaveDays(chosen);
  const balance = employee ? leaveBalance(employee) : undefined;
  const annual = String(chosen.fields.type ?? "annual") === "annual";
  const canApprove = context.can("edit_people");
  const decision = async (next: "approved" | "declined") => {
    if (!canApprove) {
      context.toast("Decision unavailable", "Your current role view cannot decide leave requests.", "blocked");
      return;
    }
    try {
      const plan = planLeaveDecision({
        organizationId: context.org.id, currency: context.org.currency,
        actor: context.actor, now: clockIso(),
      }, chosen, next === "approved" ? employee : undefined, next);
      await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
      context.toast(next === "approved" ? "Leave approved" : "Leave declined",
        next === "approved" && annual
          ? "The annual balance and request were recorded together in one revision-checked decision."
          : `The ${next} decision and responsible reviewer were recorded locally.`);
      context.closeOverlay();
    } catch (error) {
      context.toast("Decision not saved", error instanceof Error ? error.message : "Reload the request before deciding.", "blocked");
    }
  };
  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={leavePerson(chosen, data.employees)} size="lg" />
        <div className="ds-grow">
          <h3>{leavePerson(chosen, data.employees)}</h3>
          <p className="ds-subtle">{context.date(chosen.startAt)} – {context.date(chosen.endAt)}
            {" · "}{days(count)} · {String(chosen.fields.type ?? "annual")}</p>
        </div>
        <Pill tone="warning">Requested</Pill>
      </Row>
      <p>{chosen.summary || "No request note recorded."}</p>
      <Properties rows={[
        { label: "Requested", value: context.relative(chosen.at) },
        { label: "Assigned approver", value: String(chosen.fields.approver ?? "Not recorded") },
        { label: "Allowance remaining", value: annual && balance?.known
          ? `${balance.left} days` : annual ? "Not recorded" : "Not applicable" },
        { label: "Balance after approval", value: annual && balance?.known
          ? balance.left >= count ? `${balance.left - count} days` : "Insufficient recorded allowance"
          : annual ? "Unavailable until allowance is verified" : "Annual balance unchanged" },
      ]} />
      {!canApprove && <Notice tone="warning" title="Human reviewer role required">
        The current role view cannot approve or decline a request. Review it from an authorised People role.
      </Notice>}
      <Row gap={2} wrap>
        <Button variant="primary" disabled={!canApprove} onClick={() => decision("approved")}>Approve</Button>
        <Button variant="outline-danger" disabled={!canApprove} onClick={() => decision("declined")}>Decline</Button>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/hr/scheduling?tab=Roster`); }}>Check roster</Button>
      </Row>
      <Notice tone="info">This records a local review. The request and employee balance are updated atomically; no external calendar or payroll provider is connected.</Notice>
    </Stack>
  );
}

export function PositionEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const departments = useCollection("departments");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [department, setDepartment] = useState(String(existing?.fields.departmentId ?? departments[0]?.id ?? ""));
  const [low, setLow] = useState(String(Number(existing?.fields.salaryLowMinor ?? 300_000) / 100));
  const [high, setHigh] = useState(String(Number(existing?.fields.salaryHighMinor ?? 350_000) / 100));
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const invalidRange = Number(high) < Number(low);

  return (
    <form
      id="hr-position"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalidRange || !title.trim()) return;
        const fields = {
          departmentId: department, hiringManager: context.actor, employment: "full-time",
          location: "Clerkenwell studio", salaryLowMinor: Math.round(Number(low) * 100),
          salaryHighMinor: Math.round(Number(high) * 100), openings: 1,
        };
        if (existing) {
          await context.mutate.patch(existing.id, { title, summary, fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Job spec updated for ${title}` });
        } else {
          await context.mutate.create({ collection: "positions", title, status: "open", summary, fields }, `Position opened: ${title}`);
        }
        context.toast("Position saved", `${title} is on the recruitment board.`);
        close();
      }}
    >
      <Field label="Role title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Department">
        <Select value={department} onChange={(event) => setDepartment(event.target.value)}>
          {departments.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="Salary from"><TextInput value={low} inputMode="decimal" align="end" onChange={(event) => setLow(event.target.value)} /></Field>
        <Field label="Salary to"><TextInput value={high} inputMode="decimal" align="end" onChange={(event) => setHigh(event.target.value)} invalid={invalidRange} /></Field>
      </Row>
      {invalidRange && <Notice tone="danger" title="The top of the range is below the bottom">Publishing a range that cannot be met is worse than publishing none.</Notice>}
      <Field label="What the role is for"><TextArea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} /></Field>
      <Notice tone="info">Publishing a salary range in the advert is a choice this workspace supports; the range is stored on the position record.</Notice>
    </form>
  );
}

export function CandidateProfileOverlay({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const applicant = useRecord(payload?.id ?? context.selectedId);
  const [rating, setRating] = useState("3");
  const [evidence, setEvidence] = useState("");
  if (!applicant) return <Empty title="Select a candidate" icon={<Users size={20} />} />;
  return (
    <Stack gap={4}>
      <Row gap={3}><Avatar name={applicant.title} size="lg" /><div><h3>{applicant.title}</h3><p className="ds-subtle">{String(applicant.fields.role ?? "")}</p></div></Row>
      <p>{applicant.summary}</p>
      <form
        id="hr-scorecard"
        className="ds-stack ds-gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await context.mutate.patch(applicant.id, {
            summary: evidence ? `${applicant.summary} Scorecard: ${evidence}` : applicant.summary,
            fields: { ...applicant.fields, rating: Number(rating) },
          }, { expectRevision: applicant.revision, event: `Scorecard recorded for ${applicant.title} by ${context.actor}` });
          context.toast("Scorecard recorded", `${applicant.title} is scored ${rating} of 5 by ${context.actor}.`);
        }}
      >
        <Field label="Overall, against the role requirements">
          <Select value={rating} onChange={(event) => setRating(event.target.value)}>
            {["1", "2", "3", "4", "5"].map((value) => <option key={value} value={value}>{value} of 5</option>)}
          </Select>
        </Field>
        <Field label="Evidence" hint="What the candidate said or did. Not an impression.">
          <TextArea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={3} />
        </Field>
        <Button type="submit" variant="primary">Record scorecard</Button>
      </form>
      <Notice tone="info" title="Scored by a person, attributed to a person">
        The score is saved against {context.actor} on the candidate record. Nothing ranks candidates automatically.
      </Notice>
    </Stack>
  );
}

export function PayrollReview({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCollections(["payrollRuns", "employees"]);
  const run = data.payrollRuns.find((row) => row.id === payload?.id) ?? data.payrollRuns[0];
  const lines = computePayroll(data.employees);
  if (!run) return <Empty title="No payroll run" />;
  if (!context.can("view_payroll")) return <RoleViewNote what="Payroll detail" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Run", value: run.title },
        { label: "Period", value: String(run.fields.period ?? "") },
        { label: "Status", value: <Pill tone={run.status === "approved" ? "success" : "warning"}>{run.status}</Pill> },
        { label: "People", value: String(lines.length) },
        { label: "Gross", value: context.money(lines.reduce((sum, line) => sum + line.grossMinor, 0)) },
        { label: "Net", value: context.money(lines.reduce((sum, line) => sum + line.netMinor, 0)) },
      ]} />
      <DataGrid
        rows={lines}
        rowId={(row) => row.employeeId}
        label="Run detail"
        filterable={false}
        columns={[
          { key: "name", header: "Person", primary: true, cell: (row) => row.name },
          { key: "gross", header: "Gross", align: "end", cell: (row) => <span className="ds-num">{context.money(row.grossMinor)}</span> },
          { key: "net", header: "Net", align: "end", cell: (row) => <span className="ds-num">{context.money(row.netMinor)}</span> },
        ]}
      />
      <Notice tone="warning" title="Jurisdiction rules are not applied">
        Deductions use one illustrative rate. Nothing here validates against {context.org.jurisdiction} thresholds, codes or reliefs,
        and no submission is made to any authority.
      </Notice>
    </Stack>
  );
}

export function SegmentedInspector({ context }: { context: ScreenContext }) {
  const [view, setView] = useState<"people" | "agents">("people");
  const data = useHrData();
  const rows = view === "people" ? humans(data.employees) : aiEmployees(data.members);
  return (
    <Stack gap={3}>
      <Segmented
        label="Roster kind"
        value={view}
        onChange={setView}
        options={[{ value: "people", label: "People" }, { value: "agents", label: "AI employees" }]}
      />
      <Stack gap={2}>
        {rows.map((row) => (
          <Row key={row.id} gap={2}>
            <Avatar name={row.title} kind={view === "agents" ? "ai" : "human"} size="sm" />
            <span className="ds-grow ds-truncate">{row.title}</span>
            <span className="ds-subtle">{String(row.fields.title ?? "")}</span>
          </Row>
        ))}
      </Stack>
      <p className="ds-subtle">{rows.length} on the {view === "people" ? "people" : "agent"} roster in {context.org.shortName}.</p>
    </Stack>
  );
}

export function InboxNote() {
  return (
    <Notice tone="info" title="Invitations stay in this browser">
      <Row gap={2}><Inbox size={16} aria-hidden="true" /><span>No mail provider is connected, so an invitation is kept as a local draft with its recipient and message until somebody sends it from a connected mailbox.</span></Row>
    </Notice>
  );
}
