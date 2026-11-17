import { useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Inbox, UserPlus, Users,
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
import { linkedPersonnelDocuments, scopedDetailRecord } from "@/platform/recordScope";

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
  if (!record.startAt || !record.endAt) return Number(record.fields.days ?? 1);
  return Math.max(1, daysBetween(new Date(record.startAt), new Date(record.endAt)));
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

  if (lens === "My team") {
    const mine = data.employees.filter((employee) => String(employee.fields.manager ?? "") === actor);
    return mine.length === 0 ? (
      <Empty title={`Nobody reports to ${actor} in this workspace`} icon={<Users size={20} />}>
        Reporting lines are recorded on each employee record. Change one from the employee profile.
      </Empty>
    ) : (
      <Grid>
        {mine.map((employee) => {
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
    );
  }

  if (lens === "HR tasks") {
    const rows = [
      ...pendingLeave.map((request) => ({ id: request.id, kind: "Leave approval", title: request.title, detail: request.summary, due: request.startAt, to: `/o/${org.slug}/hr/leave` })),
      ...openOnboarding.map((task) => ({ id: task.id, kind: "Onboarding", title: task.title, detail: task.summary, due: task.dueAt, to: `/o/${org.slug}/hr/onboarding` })),
      ...reviewsDue.map((review) => ({ id: review.id, kind: "Review", title: review.title, detail: review.summary, due: review.dueAt, to: `/o/${org.slug}/hr/performance` })),
      ...openRoles.map((position) => ({ id: position.id, kind: "Hiring", title: position.title, detail: position.summary, due: undefined, to: `/o/${org.slug}/hr/recruitment` })),
    ];
    return rows.length === 0 ? <Empty title="No people work is outstanding" icon={<ClipboardCheck size={20} />} /> : (
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="People work"
        columns={[
          { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "Leave approval" ? "warning" : row.kind === "Hiring" ? "accent" : "info"}>{row.kind}</Pill>, sortValue: (row) => row.kind, filterValue: (row) => row.kind },
          { key: "title", header: "Item", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.detail}` },
          { key: "detail", header: "Detail", cell: (row) => <span className="ds-subtle">{row.detail}</span>, hideBelow: 900 },
          { key: "due", header: "Due", align: "end", cell: (row) => (row.due ? context.date(row.due) : "—"), sortValue: (row) => row.due ?? "~" },
        ]}
        onOpen={(id) => { const row = rows.find((item) => item.id === id); if (row) context.navigate(row.to); }}
      />
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
          <Notice tone="info" title="Aggregated by the privacy policy">
            Every figure here is a count of records in this browser. Pay, absence reasons and personal detail never appear in an
            aggregate view, and a count smaller than three is shown as a range rather than a number so one person cannot be identified.
          </Notice>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={5}>
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
  const { now } = useWorkspace();
  const days = Array.from({ length: 7 }, (_, index) => addDays(now, index));
  const rows = days.map((day) => {
    const key = day.toDateString();
    const onShift = data.shifts.filter((shift) => shift.fields.kind === "shift" && shift.startAt && new Date(shift.startAt).toDateString() === key);
    const onLeave = data.leaveRequests.filter((request) => request.status === "approved" && request.startAt && request.endAt && new Date(request.startAt) <= day && new Date(request.endAt) >= day);
    return { day, onShift: onShift.length, onLeave: onLeave.length, thin: onShift.length > 0 && onShift.length <= 2 };
  });
  return (
    <Stack gap={2}>
      {rows.map((row) => (
        <Row key={row.day.toISOString()} gap={3}>
          <span style={{ width: 92 }} className="ds-subtle">{context.date(row.day, { weekday: "short", day: "numeric", month: "short" })}</span>
          <div className="ds-grow"><Meter value={row.onShift} max={5} label={`People on shift ${context.date(row.day)}`} tone={row.thin ? "warning" : undefined} /></div>
          <span className="ds-num" style={{ width: 96, textAlign: "end" }}>{row.onShift} on · {row.onLeave} away</span>
        </Row>
      ))}
      <p className="ds-subtle">Counted from roster records and approved leave. A day with no roster entry is shown as empty rather than guessed.</p>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-002 · Employee Directory
 * ------------------------------------------------------------------ */

export function EmployeeDirectory({ context, lens }: { context: ScreenContext; lens: "People" | "Teams" | "Contractors" | "Alumni" }) {
  const data = useHrData();
  const { org } = useWorkspace();
  const team = useDirectoryTeam();

  if (lens === "Teams") {
    return (
      <Grid>
        {data.departments.map((department) => {
          const people = data.employees.filter((employee) => employee.fields.departmentId === department.id && employee.status !== "alumni");
          const agents = aiEmployees(data.members).filter((member) => member.fields.departmentId === department.id);
          return (
            <Card key={department.id} span={4} title={department.title} subtitle={department.summary} actions={<Pill>{people.length + agents.length}</Pill>}>
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
    );
  }

  const allRows = lens === "Contractors"
    ? data.employees.filter((employee) => employee.fields.employment === "contractor")
    : lens === "Alumni"
      ? data.employees.filter((employee) => employee.status === "alumni")
      : humans(data.employees);
  const rows = team ? allRows.filter((employee) => employee.fields.departmentId === team) : allRows;

  const agents = aiEmployees(data.members);

  const grid = (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${lens} directory`}
      selectedId={context.selectedId}
      columns={[
        { key: "name", header: "Name", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.title} size="sm" /><span>{row.title}</span></Row>, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.title ?? "")} ${String(row.fields.skills ?? "")}` },
        { key: "role", header: "Role", cell: (row) => String(row.fields.title ?? ""), sortValue: (row) => String(row.fields.title ?? ""), filterValue: (row) => String(row.fields.title ?? "") },
        { key: "department", header: "Department", cell: (row) => departmentName(data.departments, row.fields.departmentId), sortValue: (row) => departmentName(data.departments, row.fields.departmentId), hideBelow: 900 },
        { key: "manager", header: "Manager", cell: (row) => String(row.fields.manager ?? "—"), hideBelow: 1200 },
        { key: "office", header: "Office", cell: (row) => String(row.fields.office ?? "—"), hideBelow: 1200 },
        { key: "status", header: "Employment", align: "end", cell: (row) => <EmploymentPill record={row} />, sortValue: (row) => row.status },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/hr/employees/${id}`)}
      empty={<Empty title={`No ${lens.toLowerCase()} on record`} icon={<Users size={20} />}>{lens === "Alumni" ? "People who have left keep a record for payroll history and references." : "Add a person from the employee directory."}</Empty>}
    />
  );

  const filterNote = team ? (
    <Notice tone="info" title={`Filtered to ${departmentName(data.departments, team)}`}>
      <Row gap={2}><span className="ds-grow">{rows.length} of {allRows.length} shown.</span><Button size="sm" variant="ghost" onClick={() => setDirectoryTeam("")}>Clear the filter</Button></Row>
    </Notice>
  ) : null;

  if (lens !== "People") return filterNote ? <Stack gap={3}>{filterNote}{grid}</Stack> : grid;

  return (
    <Stack gap={5}>
      {filterNote}
      <Card title="People" subtitle={`${rows.length} employed · contact details follow each person's privacy setting`} flush>{grid}</Card>
      <Card
        title="AI employees"
        subtitle={`${agents.length} local agent contracts · listed apart from people on purpose`}
        actions={<Pill tone="accent">Not headcount</Pill>}
      >
        <Grid>
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
        </Grid>
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

  if (lens === "Job") {
    return (
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
    return (
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
    return (
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
    return reviews.length === 0 ? <Empty title="No reviews recorded" icon={<ClipboardCheck size={20} />}>Reviews are created from the performance cycle.</Empty> : (
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
    );
  }

  if (lens === "Access") {
    // These are recorded requests, not actual cloud grants. Do not synthesize
    // sign-in, payroll or door access from an employee's department.
    const requests = data.tasks
      .filter((task) => task.collection === "tasks"
        && task.fields.employeeId === employee.id && task.fields.group === "IT access")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return (
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

  return (
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

  if (lens === "Positions") {
    return data.positions.length === 0 ? (
      <Empty title="No open positions" icon={<UserPlus size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Job spec editor")}>Create a role</Button>} />
    ) : (
      <Grid>
        {data.positions.map((position) => {
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
                  { label: "Range", value: context.can("view_payroll") ? `${context.money(Number(position.fields.salaryLowMinor ?? 0))} – ${context.money(Number(position.fields.salaryHighMinor ?? 0))}` : "Hidden in this role view" },
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
    );
  }

  if (lens === "Interviews") {
    const interviews = data.applicants.filter((applicant) => applicant.fields.stage === "interview");
    return interviews.length === 0 ? <Empty title="No interviews booked" icon={<CalendarDays size={20} />}>Move a candidate to the interview stage to schedule one.</Empty> : (
      <Stack gap={3}>
        {interviews.map((applicant) => (
          <Card
            key={applicant.id}
            title={applicant.title}
            subtitle={`${String(applicant.fields.role ?? "")} · interview ${applicant.fields.interviewAt ? context.date(String(applicant.fields.interviewAt)) : "not scheduled"}`}
            actions={<Pill tone="info">Interview</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(applicant.id); context.openOverlay("candidate profile", { id: applicant.id }); }}>Scorecard</Button>
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
    );
  }

  if (lens === "Offers") {
    const offers = data.applicants.filter((applicant) => applicant.fields.stage === "offer");
    return offers.length === 0 ? <Empty title="No offers outstanding" icon={<ClipboardCheck size={20} />} /> : (
      <Stack gap={3}>
        {offers.map((applicant) => {
          const position = data.positions.find((row) => row.id === applicant.fields.positionId);
          return (
            <Card key={applicant.id} title={applicant.title} subtitle={String(applicant.fields.role ?? "")} actions={<Pill tone="accent">Offer drafted</Pill>}
              footer={<Button size="sm" variant="primary" onClick={() => { context.select(applicant.id); context.openOverlay("offer approval", { id: applicant.id }); }}>Review the offer</Button>}>
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Role", value: position?.title ?? String(applicant.fields.role ?? "") },
                  { label: "Range", value: context.can("view_payroll") && position ? `${context.money(Number(position.fields.salaryLowMinor ?? 0))} – ${context.money(Number(position.fields.salaryHighMinor ?? 0))}` : "Hidden in this role view" },
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
    );
  }

  const live = data.applicants.filter((applicant) => !["rejected", "withdrawn"].includes(applicant.status));
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        {STAGES.map((stage) => (
          <Card key={stage} className="ds-grow" title={stage.charAt(0).toUpperCase() + stage.slice(1)} subtitle={`${live.filter((applicant) => applicant.fields.stage === stage).length} candidates`}>
            <Stack gap={2}>
              {live.filter((applicant) => applicant.fields.stage === stage).map((applicant) => (
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
              {live.filter((applicant) => applicant.fields.stage === stage).length === 0 && <span className="ds-subtle">Empty</span>}
            </Stack>
          </Card>
        ))}
      </Row>
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
  const checklistTasks = data.tasks.filter((task) => task.fields.kind === "onboarding");
  const employeeIds = [...new Set(checklistTasks.map((task) => String(task.fields.employeeId)))];

  const groups = employeeIds.map((employeeId) => {
    const employee = data.employees.find((row) => row.id === employeeId);
    const steps = checklistTasks.filter((task) => task.fields.employeeId === employeeId);
    const done = steps.filter((task) => task.status === "done").length;
    const waiting = steps.some((task) => task.status === "waiting");
    const state = done === steps.length ? "Completed" : waiting ? "Waiting" : done === 0 ? "Incoming" : "In progress";
    return { employeeId, employee, steps, done, state };
  }).filter((group) => group.state === lens);

  if (groups.length === 0) {
    return <Empty title={`Nothing is ${lens.toLowerCase()}`} icon={<UserPlus size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Onboarding template")}>Launch a checklist</Button>}>
      Onboarding checklists coordinate People, the manager, IT access and Finance for one new starter.
    </Empty>;
  }

  return (
    <Stack gap={4}>
      {groups.map((group) => (
        <Card
          key={group.employeeId}
          title={<Row gap={2}><Avatar name={group.employee?.title ?? "New hire"} size="sm" />{group.employee?.title ?? "New hire"}</Row>}
          subtitle={`${String(group.employee?.fields.title ?? "")} · starts ${context.date(group.employee?.startAt)}`}
          actions={<Pill tone={group.state === "Completed" ? "success" : group.state === "Waiting" ? "warning" : "info"} dot>{group.done} of {group.steps.length}</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("IT access", { employeeId: group.employeeId })}>Access requests</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("welcome preview", { employeeId: group.employeeId })}>Welcome note</Button>
          </>}
        >
          <Stack gap={2}>
            {group.steps.map((step) => (
              <Row key={step.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Checkbox
                  label={step.title}
                  checked={step.status === "done"}
                  onChange={async (event) => {
                    await context.mutate.patch(step.id, {
                      status: event.target.checked ? "done" : "ready",
                      fields: { ...step.fields, stage: event.target.checked ? "done" : "ready" },
                    }, { expectRevision: step.revision, event: `${step.title} ${event.target.checked ? "completed" : "reopened"}` });
                  }}
                />
                <span className="ds-grow" />
                <Pill tone={step.status === "waiting" ? "warning" : "neutral"}>{String(step.fields.group ?? "")}</Pill>
                <span className="ds-subtle" style={{ minWidth: 110, textAlign: "end" }}>{String(step.fields.assignee ?? step.ownerName)}</span>
              </Row>
            ))}
            {group.steps.some((step) => step.status === "waiting") && (
              <Notice tone="warning" title="An access grant is still a decision">
                A waiting step is waiting on a named person. Access is never granted because somebody's employment status changed:
                each grant is requested, approved and recorded on its own.
              </Notice>
            )}
          </Stack>
        </Card>
      ))}
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
              aria-label={`${context.date(day, { weekday: "long", day: "numeric", month: "long" })}, ${onLeave.length} away`}
              onClick={() => onPickDay?.(day)}
            >
              <span className="hr-cal-num">{day.getDate()}</span>
              <span className="hr-cal-marks">
                {onLeave.slice(0, 3).map((request) => (
                  <span key={request.id} className="hr-cal-chip" data-state={request.status}>
                    {String(request.fields.employeeName ?? request.ownerName).split(" ")[0]}
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
        <span className="ds-subtle">Only the person and the type of leave are shown. A sickness record never shows a reason here.</span>
      </Row>
    </div>
  );
}

export function LeaveScreen({ context, lens }: { context: ScreenContext; lens: "My leave" | "Team calendar" | "Approvals" | "Policy" }) {
  const data = useHrData();
  const { now, actor } = useWorkspace();
  const [monthOffset, setMonthOffset] = useState(0);
  const month = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [now, monthOffset]);
  const mine = data.employees.find((employee) => employee.title === actor);
  const myRequests = data.leaveRequests.filter((request) => request.fields.employeeId === mine?.id || String(request.fields.employeeName ?? "") === actor);
  const pending = data.leaveRequests.filter((request) => request.status === "requested");

  if (lens === "Team calendar") {
    return (
      <Stack gap={4}>
        <Row gap={2}>
          <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value - 1)}>Previous</Button>
          <strong className="ds-grow" style={{ fontSize: "var(--text-lg)" }}>{context.date(month, { month: "long", year: "numeric" })}</strong>
          <Button size="sm" variant="ghost" onClick={() => setMonthOffset(0)}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value + 1)}>Next</Button>
        </Row>
        <Card flush><div className="ds-card-body"><LeaveCalendar context={context} month={month} onPickDay={() => context.openOverlay("conflict review")} /></div></Card>
      </Stack>
    );
  }

  if (lens === "Approvals") {
    return pending.length === 0 ? <Empty title="Nothing is waiting for a decision" icon={<ClipboardCheck size={20} />} /> : (
      <Stack gap={3}>
        {pending.map((request) => {
          const employee = data.employees.find((row) => row.id === request.fields.employeeId);
          const balance = employee ? leaveBalance(employee) : { allowance: 0, taken: 0, left: 0, known: false };
          const requested = leaveDays(request);
          const clash = data.leaveRequests.filter((other) => other.id !== request.id && other.status === "approved" && other.startAt && other.endAt && request.startAt && request.endAt && new Date(other.startAt) <= new Date(request.endAt) && new Date(other.endAt) >= new Date(request.startAt));
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
                  onClick={async () => {
                    await context.mutate.patch(request.id, { status: "approved", fields: { ...request.fields, decidedBy: context.actor, decidedAt: clockIso() } }, { expectRevision: request.revision, event: `Leave approved for ${leavePerson(request, data.employees)} by ${context.actor}` });
                    if (employee) {
                      await context.mutate.patch(employee.id, { fields: { ...employee.fields, leaveTaken: Number(employee.fields.leaveTaken ?? 0) + requested } }, { event: "Leave balance updated after approval" });
                    }
                    context.toast("Leave approved", `${days(requested)} booked${balance.known ? " and the balance has moved" : "; this person has no recorded allowance, so no balance moved"}.`);
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={async () => {
                    await context.mutate.patch(request.id, { status: "declined", fields: { ...request.fields, decidedBy: context.actor, decidedAt: clockIso() } }, { expectRevision: request.revision, event: `Leave declined for ${leavePerson(request, data.employees)} by ${context.actor}` });
                    context.toast("Leave declined", "The request is recorded as declined with the decision maker's name.");
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
                  { label: "Balance after approval", value: employee && balance.known ? <span className="ds-num">{Math.max(0, balance.left - requested)} of {balance.allowance} days</span> : employee ? "Unavailable — no allowance recorded" : "Unavailable — no employee record" },
                  { label: "Overlapping approved leave", value: clash.length ? `${clash.length} other ${clash.length === 1 ? "person" : "people"} away` : "Nobody else is away" },
                ]} />
                {clash.length > 0 && <Notice tone="warning" title="Cover is thin on these days">Approving this leaves {clash.length + 1} people away at once. Check the roster before deciding.</Notice>}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (lens === "Policy") {
    const policy = data.policies.find((row) => row.title.includes("Leave"));
    return (
      <Grid>
        <Card span={7} title={policy?.title ?? "Leave and absence policy"} subtitle={policy ? `Version ${String(policy.fields.version ?? "")} · published ${context.date(policy.at)}` : undefined}>
          <Stack gap={3}>
            <p>{policy?.summary ?? "No leave policy is published in this workspace."}</p>
            <Properties rows={[
              { label: "Standard allowance", value: "25 days plus bank holidays" },
              { label: "Part time", value: "Pro rata by contracted days" },
              { label: "Carry over", value: "Up to five days into the next year" },
              { label: "Notice", value: "Twice the length of the leave requested" },
              { label: "Sickness", value: "Recorded as an absence. No health detail is held in the calendar." },
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
    );
  }

  const balance = mine ? leaveBalance(mine) : { allowance: 0, taken: 0, left: 0, known: false };
  return (
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
        {myRequests.length === 0 ? <div className="ds-card-body"><Empty title="You have not asked for leave" icon={<CalendarDays size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Leave form")}>Request leave</Button>} /></div> : (
          <DataGrid
            rows={myRequests}
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
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-008 · Scheduling & Time
 * ------------------------------------------------------------------ */

export function Scheduling({ context, lens }: { context: ScreenContext; lens: "Roster" | "Timesheets" | "Availability" | "Exceptions" }) {
  const data = useCollections(["shifts", "employees", "leaveRequests"]);
  const { now, org } = useWorkspace();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(now), weekOffset * 7), [now, weekOffset]);
  const roster = data.shifts.filter((shift) => shift.fields.kind === "shift");
  const timesheets = data.shifts.filter((shift) => shift.fields.kind === "time");

  if (lens === "Timesheets") {
    const total = timesheets.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0);
    return (
      <DataGrid
        rows={timesheets}
        rowId={(row) => row.id}
        label="Timesheets"
        columns={[
          { key: "who", header: "Person", primary: true, cell: (row) => String(row.fields.employeeName ?? row.ownerName), sortValue: (row) => String(row.fields.employeeName ?? row.ownerName), filterValue: (row) => String(row.fields.employeeName ?? row.ownerName) },
          { key: "day", header: "Day", cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
          { key: "detail", header: "Against", cell: (row) => row.summary, hideBelow: 900 },
          { key: "hours", header: "Hours", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.hours ?? 0)}</span>, sortValue: (row) => Number(row.fields.hours ?? 0) },
          { key: "state", header: "State", align: "end", cell: (row) => <Pill tone={row.fields.approved === true ? "success" : "warning"}>{row.fields.approved === true ? "approved" : "submitted"}</Pill> },
        ]}
        summary={<strong className="ds-num">{total.toFixed(1)} hours</strong>}
        bulkActions={[{
          label: "Approve hours",
          onRun: (rows) => rows.forEach((row) => { void context.mutate.patch(row.id, { status: "approved", fields: { ...row.fields, approved: true } }, { event: `Hours approved for ${String(row.fields.employeeName ?? row.ownerName)}` }); }),
          disabled: (rows) => rows.every((row) => row.fields.approved === true),
        }]}
        onSelect={(id) => context.select(id)}
      />
    );
  }

  if (lens === "Availability") {
    const people = data.employees.filter((employee) => employee.status !== "alumni");
    return (
      <Grid>
        {people.map((person) => {
          const shifts = roster.filter((shift) => shift.fields.employeeId === person.id);
          const away = data.leaveRequests.filter((request) => request.fields.employeeId === person.id && request.status === "approved" && request.endAt && new Date(request.endAt) >= now);
          return (
            <Card key={person.id} span={4} title={<Row gap={2}><Avatar name={person.title} size="sm" />{person.title}</Row>} subtitle={String(person.fields.title ?? "")}>
              <Properties rows={[
                { label: "Contract", value: String(person.fields.employment ?? "") },
                { label: "Shifts on the roster", value: String(shifts.length) },
                { label: "Booked away", value: away.length ? `${away.length} period${away.length === 1 ? "" : "s"}` : "None" },
                { label: "Base", value: String(person.fields.office ?? "—") },
              ]} />
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Exceptions") {
    const overtime = roster.filter((shift) => shift.fields.overtime === true);
    const clashes = roster.filter((shift) => data.leaveRequests.some((request) => request.status === "approved" && request.fields.employeeId === shift.fields.employeeId && request.startAt && request.endAt && shift.startAt && new Date(request.startAt) <= new Date(shift.startAt) && new Date(request.endAt) >= new Date(shift.startAt)));
    const unapproved = timesheets.filter((entry) => entry.fields.approved !== true);
    const rows = [
      ...clashes.map((shift) => ({ id: `${shift.id}-clash`, kind: "Rostered while away", detail: `${String(shift.fields.employeeName ?? "")} on ${context.date(shift.startAt)}`, tone: "danger" as const })),
      ...overtime.map((shift) => ({ id: `${shift.id}-ot`, kind: "Over eight hours", detail: `${String(shift.fields.employeeName ?? "")} on ${context.date(shift.startAt)}`, tone: "warning" as const })),
      ...unapproved.map((entry) => ({ id: `${entry.id}-unapproved`, kind: "Hours not approved", detail: `${String(entry.fields.employeeName ?? "")} · ${String(entry.fields.hours ?? 0)}h`, tone: "warning" as const })),
    ];
    return rows.length === 0 ? <Empty title="No exceptions" icon={<AlertTriangle size={20} />}>Clashes, overtime and unapproved hours appear here.</Empty> : (
      <Stack gap={3}>
        <Notice tone="info" title="Checked against this organisation's rules">
          Shifts are compared with approved leave and with the {org.timezone} working day. A shift crossing a location in another
          time zone is flagged rather than silently converted.
        </Notice>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Scheduling exceptions"
          filterable={false}
          rowTone={(row) => row.tone}
          columns={[
            { key: "kind", header: "Exception", primary: true, cell: (row) => row.kind },
            { key: "detail", header: "Detail", cell: (row) => row.detail },
          ]}
        />
      </Stack>
    );
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const people = [...new Set(roster.map((shift) => String(shift.fields.employeeName ?? "")))].filter(Boolean);

  return (
    <Stack gap={4}>
      <Row gap={2}>
        <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value - 1)}>Previous week</Button>
        <strong className="ds-grow">{context.date(days[0], { day: "numeric", month: "short" })} – {context.date(days[6], { day: "numeric", month: "short" })}</strong>
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>This week</Button>
        <Button size="sm" variant="secondary" onClick={() => setWeekOffset((value) => value + 1)}>Next week</Button>
      </Row>
      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Shift roster for the week beginning {context.date(days[0])}</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {days.map((day) => <th key={day.toISOString()} scope="col">{context.date(day, { weekday: "short", day: "numeric" })}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person}>
                  <th scope="row" style={{ textAlign: "start", padding: "var(--space-2) var(--space-3)" }}>
                    <Row gap={2}><Avatar name={person} size="sm" />{person}</Row>
                  </th>
                  {days.map((day) => {
                    const shift = roster.find((item) => item.fields.employeeName === person && item.startAt && new Date(item.startAt).toDateString() === day.toDateString());
                    const away = data.leaveRequests.some((request) => request.status === "approved" && String(request.fields.employeeName ?? "") === person && request.startAt && request.endAt && new Date(request.startAt) <= day && new Date(request.endAt) >= day);
                    return (
                      <td key={day.toISOString()}>
                        {away ? <Pill tone="neutral">Away</Pill> : shift ? (
                          <button
                            type="button"
                            className="hr-shift"
                            onClick={() => { context.select(shift.id); context.openOverlay("Shift edit", { id: shift.id }); }}
                          >
                            <strong>{String(shift.fields.place ?? "")}</strong>
                            <span className="ds-subtle">{String(shift.fields.hours ?? 0)}h</span>
                          </button>
                        ) : <span className="ds-subtle">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Notice tone="info" title="Moving a shift">
        Open a shift to change its person, place or hours; the change is saved on the record. A keyboard user reaches every shift
        in reading order, so there is no drag-only path through this roster.
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
  const { actor } = useWorkspace();

  if (lens === "My reviews") {
    const mine = data.reviews.filter((review) => String(review.fields.employeeName ?? "") === actor || String(review.fields.reviewer ?? "") === actor);
    return mine.length === 0 ? <Empty title="No review involves you" icon={<ClipboardCheck size={20} />}>Reviews you write or receive appear here.</Empty> : (
      <Stack gap={3}>
        {mine.map((review) => (
          <Card key={review.id} title={review.title} subtitle={String(review.fields.cycle ?? "")} actions={<Pill tone={review.status === "acknowledged" ? "success" : "info"}>{review.status}</Pill>}
            footer={<Button size="sm" variant="secondary" onClick={() => { context.select(review.id); context.openOverlay("Review form", { id: review.id }); }}>Open the form</Button>}>
            <p>{review.summary}</p>
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Team") {
    return (
      <DataGrid
        rows={data.reviews}
        rowId={(row) => row.id}
        label="Team reviews"
        selectedId={context.selectedId}
        columns={[
          { key: "person", header: "Person", primary: true, cell: (row) => String(row.fields.employeeName ?? ""), sortValue: (row) => String(row.fields.employeeName ?? ""), filterValue: (row) => `${String(row.fields.employeeName ?? "")} ${String(row.fields.reviewer ?? "")}` },
          { key: "cycle", header: "Cycle", cell: (row) => String(row.fields.cycle ?? "") },
          { key: "reviewer", header: "Reviewer", cell: (row) => String(row.fields.reviewer ?? ""), hideBelow: 900 },
          { key: "rating", header: "Rating", cell: (row) => String(row.fields.rating || "Not set") },
          { key: "ai", header: "AI assisted", cell: (row) => row.fields.aiAssisted === true ? <Pill tone="warning">Needs human review</Pill> : <Pill tone="neutral">No</Pill>, hideBelow: 1100 },
          { key: "status", header: "Status", align: "end", cell: (row) => <Pill tone={row.status === "acknowledged" ? "success" : "info"} dot>{row.status}</Pill>, sortValue: (row) => row.status },
        ]}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Review form", { id })}
      />
    );
  }

  if (lens === "Templates") {
    const templates = [
      { id: "t1", title: "Year end", sections: "Evidence, competencies, objectives, development", scale: "Below / Meeting / Exceeding" },
      { id: "t2", title: "Mid-year check-in", sections: "What is going well, what is in the way, one change", scale: "No rating" },
      { id: "t3", title: "Probation", sections: "Role requirements, support given, decision", scale: "Pass / Extend / Not passed" },
    ];
    return (
      <Grid>
        {templates.map((template) => (
          <Card key={template.id} span={4} title={template.title} subtitle={template.scale}>
            <Properties rows={[{ label: "Sections", value: template.sections }, { label: "Confidential", value: "Draft is visible to the reviewer only" }]} />
          </Card>
        ))}
        <Card span={12} title="Rating scales are written down on purpose">
          <Notice tone="info">A scale with a published definition is harder to apply unevenly than a number with no description.</Notice>
        </Card>
      </Grid>
    );
  }

  const cycles = [...new Set(data.reviews.map((review) => String(review.fields.cycle ?? "")))].filter(Boolean);
  return (
    <Grid>
      {cycles.map((cycle) => {
        const reviews = data.reviews.filter((review) => review.fields.cycle === cycle);
        const done = reviews.filter((review) => review.status === "acknowledged").length;
        return (
          <Card key={cycle} span={4} title={cycle} subtitle={`${reviews.length} reviews`} actions={<Pill tone={done === reviews.length ? "success" : "info"}>{done} complete</Pill>}>
            <Stack gap={3}>
              <Meter value={done} max={reviews.length} label={`${cycle} completion`} tone={done === reviews.length ? "success" : undefined} />
              <Stack gap={1}>
                {reviews.map((review) => (
                  <Row key={review.id} gap={2}>
                    <span className="ds-grow ds-truncate">{String(review.fields.employeeName ?? "")}</span>
                    <Pill tone={review.status === "acknowledged" ? "success" : review.status === "draft" ? "neutral" : "info"}>{review.status}</Pill>
                  </Row>
                ))}
              </Stack>
            </Stack>
          </Card>
        );
      })}
      <Card span={12} title="Calibration" subtitle="Comparing ratings across managers before they are shared">
        <Row gap={3} wrap>
          {["exceeding", "meeting", "below"].map((rating) => (
            <Card key={rating} className="ds-grow" title={rating.charAt(0).toUpperCase() + rating.slice(1)} subtitle={`${data.reviews.filter((review) => review.fields.rating === rating).length} people`}>
              <span className="ds-subtle">A distribution is a prompt for a conversation, never a quota.</span>
            </Card>
          ))}
        </Row>
        <Button variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("calibration panel")}>Open calibration</Button>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-HR-011 · Learning & Policies
 * ------------------------------------------------------------------ */

export function Learning({ context, lens }: { context: ScreenContext; lens: "Courses" | "Policies" | "Compliance" | "My learning" }) {
  const data = useHrData();
  const courses = data.courses;
  const policies = data.policies.filter((policy) => policy.fields.kind === "hr");
  const staff = humans(data.employees);

  if (lens === "Policies") {
    return policies.length === 0 ? <Empty title="No policies published" icon={<BookOpen size={20} />} /> : (
      <Stack gap={3}>
        {policies.map((policy) => (
          <Card
            key={policy.id}
            title={policy.title}
            subtitle={`Version ${String(policy.fields.version ?? "")} · published ${context.date(policy.at)} · review ${context.date(policy.dueAt)}`}
            actions={<Pill tone={policy.fields.acknowledgementRequired === true ? "warning" : "neutral"}>{policy.fields.acknowledgementRequired === true ? "Acknowledgement required" : "Read when needed"}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("policy publication", { id: policy.id })}>Publish a revision</Button>
              {policy.fields.acknowledgementRequired === true && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => recordAcknowledgement(context, policy)}
                >
                  Acknowledge
                </Button>
              )}
            </>}
          >
            <Stack gap={2}>
              <p>{policy.summary}</p>
              <Row gap={3}>
                <div className="ds-grow"><Meter value={Number(policy.fields.acknowledged ?? 0)} max={Math.max(1, staff.length)} label={`${policy.title} acknowledgements`} /></div>
                <span className="ds-subtle ds-num">{String(policy.fields.acknowledged ?? 0)} of {staff.length}</span>
              </Row>
            </Stack>
          </Card>
        ))}
        <Notice tone="info" title="A revision never erases an acknowledgement">
          Publishing a new version starts a fresh acknowledgement count and keeps the old version, so a decision made under the
          previous wording can still be read in context.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Compliance") {
    const required = courses.filter((course) => course.fields.required === true);
    const rows = required.map((course) => ({
      id: course.id,
      title: course.title,
      completions: Number(course.fields.completions ?? 0),
      outstanding: Math.max(0, staff.length - Number(course.fields.completions ?? 0)),
    }));
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Required courses" value={String(required.length)} prov="human" meta="Everyone employed must complete these" />
          <Stat label="Outstanding completions" value={String(rows.reduce((sum, row) => sum + row.outstanding, 0))} prov="human" meta="Across all required courses" />
          <Stat label="Policies needing acknowledgement" value={String(policies.filter((policy) => policy.fields.acknowledgementRequired === true).length)} prov="human" />
        </StatRow>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Compliance"
          filterable={false}
          columns={[
            { key: "title", header: "Course", primary: true, cell: (row) => row.title },
            { key: "done", header: "Completed", align: "end", cell: (row) => <span className="ds-num">{row.completions} of {staff.length}</span> },
            { key: "outstanding", header: "Outstanding", align: "end", cell: (row) => <Pill tone={row.outstanding === 0 ? "success" : "warning"}>{row.outstanding}</Pill> },
          ]}
        />
      </Stack>
    );
  }

  if (lens === "My learning") {
    return <MyLearning context={context} />;
  }

  return courses.length === 0 ? <Empty title="No courses" icon={<GraduationCap size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Course builder")}>Build a course</Button>} /> : (
    <Grid>
      {courses.map((course) => (
        <Card
          key={course.id}
          span={4}
          title={course.title}
          subtitle={`${String(course.fields.minutes ?? 0)} minutes`}
          actions={course.fields.required === true ? <Pill tone="warning">Required</Pill> : <Pill tone="neutral">Optional</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Course builder", { id: course.id })}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("quiz", { id: course.id })}>Preview quiz</Button>
          </>}
        >
          <Stack gap={3}>
            <p className="ds-subtle">{course.summary}</p>
            <Row gap={2}>
              <div className="ds-grow"><Meter value={Number(course.fields.completions ?? 0)} max={Math.max(1, staff.length)} label={`${course.title} completions`} /></div>
              <span className="ds-subtle ds-num">{String(course.fields.completions ?? 0)}/{staff.length}</span>
            </Row>
          </Stack>
        </Card>
      ))}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function LeaveForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["employees", "leaveRequests"]);
  const { actor, now } = useWorkspace();
  const mine = data.employees.find((employee) => employee.title === actor);
  const [employeeId, setEmployeeId] = useState(mine?.id ?? data.employees[0]?.id ?? "");
  const [type, setType] = useState("annual");
  const [from, setFrom] = useState(addDays(now, 7).toISOString().slice(0, 10));
  const [to, setTo] = useState(addDays(now, 9).toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const employee = data.employees.find((row) => row.id === employeeId);
  const days = Math.max(1, daysBetween(new Date(from), new Date(to)));
  const balance = employee ? leaveBalance(employee) : { allowance: 0, taken: 0, left: 0 };
  const overBalance = type === "annual" && days > balance.left;
  const backwards = new Date(to) < new Date(from);

  return (
    <form
      id="hr-leave-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (backwards || !employee) return;
        await context.mutate.create({
          collection: "leaveRequests",
          title: `${employee.title.split(" ")[0]} · ${type}`,
          status: "requested",
          summary: note || `${type} leave requested from the leave screen.`,
          startAt: new Date(`${from}T00:00:00.000Z`).toISOString(),
          endAt: new Date(`${to}T00:00:00.000Z`).toISOString(),
          at: clockIso(),
          fields: { employeeId: employee.id, employeeName: employee.title, type, days, approver: String(employee.fields.manager ?? "Elena Voss"), halfDay: false },
        }, `Leave requested by ${employee.title}`);
        context.toast("Leave requested", `${days} days are waiting for ${String(employee.fields.manager ?? "a manager")} to decide.`);
        close();
      }}
    >
      <Field label="Who is away" required>
        <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          {data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
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
      {backwards && <Notice tone="danger" title="The end date is before the start date">A request has to finish after it starts.</Notice>}
      <Field label="Note for your manager" hint={type === "sick" ? "Do not record health detail here: it would appear in the absence record." : undefined}>
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
      </Field>
      <Properties rows={[
        { label: "Days requested", value: String(days) },
        { label: "Balance now", value: employee ? `${balance.left} of ${balance.allowance}` : "No employee record" },
        { label: "Balance if approved", value: employee && type === "annual" ? `${Math.max(0, balance.left - days)} of ${balance.allowance}` : "Unchanged — this type does not use the annual balance" },
      ]} />
      {overBalance && <Notice tone="warning" title="This is more than the balance left">The request can still be made; the manager decides whether to allow unpaid days.</Notice>}
    </form>
  );
}

export function LeaveApproval({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCollections(["leaveRequests", "employees"]);
  const pending = data.leaveRequests.filter((request) => request.status === "requested");
  const chosen = data.leaveRequests.find((request) => request.id === (payload?.id ?? context.selectedId)) ?? pending[0];
  if (!chosen) return <Empty title="Nothing is waiting for a decision" icon={<ClipboardCheck size={20} />} />;
  const employee = data.employees.find((row) => row.id === chosen.fields.employeeId);
  const days = leaveDays(chosen);
  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={String(chosen.fields.employeeName ?? chosen.ownerName)} size="lg" />
        <div>
          <h3>{String(chosen.fields.employeeName ?? chosen.ownerName)}</h3>
          <p className="ds-subtle">{context.date(chosen.startAt)} – {context.date(chosen.endAt)} · {days} days · {String(chosen.fields.type ?? "annual")}</p>
        </div>
      </Row>
      <p>{chosen.summary}</p>
      <Properties rows={[
        { label: "Requested", value: context.relative(chosen.at) },
        { label: "Approver", value: String(chosen.fields.approver ?? "—") },
        { label: "Balance if approved", value: employee ? `${Math.max(0, leaveBalance(employee).left - days)} days` : "Unavailable" },
      ]} />
      <Row gap={2}>
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.patch(chosen.id, { status: "approved", fields: { ...chosen.fields, decidedBy: context.actor, decidedAt: clockIso() } }, { expectRevision: chosen.revision, event: `Leave approved for ${String(chosen.fields.employeeName ?? "")} by ${context.actor}` });
            if (employee) await context.mutate.patch(employee.id, { fields: { ...employee.fields, leaveTaken: Number(employee.fields.leaveTaken ?? 0) + days } }, { event: "Leave balance updated after approval" });
            context.toast("Leave approved", "The request and the balance both changed.");
            context.closeOverlay();
          }}
        >
          Approve
        </Button>
        <Button
          variant="outline-danger"
          onClick={async () => {
            await context.mutate.patch(chosen.id, { status: "declined", fields: { ...chosen.fields, decidedBy: context.actor, decidedAt: clockIso() } }, { expectRevision: chosen.revision, event: `Leave declined for ${String(chosen.fields.employeeName ?? "")} by ${context.actor}` });
            context.toast("Leave declined", "Recorded as declined against the request.");
            context.closeOverlay();
          }}
        >
          Decline
        </Button>
      </Row>
      <Notice tone="info">No private health detail is shown here, whatever the leave type.</Notice>
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
