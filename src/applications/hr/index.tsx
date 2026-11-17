import { useState } from "react";
import { Briefcase, CalendarDays, ClipboardCheck, GraduationCap, Receipt, UserPlus, Users, Clock } from "lucide-react";
import {
  Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById } from "@/platform/capability";
import {
  ApplicantProfile, CandidateProfileOverlay, EmployeeDirectory, EmployeeProfile, InboxNote, LeaveApproval,
  LeaveForm, LeaveScreen, Learning, Onboarding, Payroll, PayrollReview, PeopleOverview, Performance,
  PositionEditor, Recruitment, Scheduling, SegmentedInspector, StaffingSummary,
} from "./panels";
import { RoleViewNote, submitFooter } from "./kit";
import { kitOverlays, needsSelection } from "./opsKit";
import {
  AssignCourse, AssignReviewer, ApplicantMessage, BalanceAdjust, DirectoryFilter, MentorAssign, MetricDetail,
  ProfileEditor, ReconcileRun, ScheduleInterview, StageDecision, TimeCorrection, acknowledgePolicy, acknowledgeReview,
  approveHours, approveLeave, completeModule, declineLeave, exportRun, prepareRun, payrollSalaryGaps, rescindQueuedGrants, submitReview,
  swapShift, validateRun, verifyCompletion, viewEmployee,
} from "./actions";
import { listByCollection } from "@/platform/repo";
import { planOnboardingLaunch } from "./decisions";
import { planShiftMove, planTimesheetApprovals } from "./workforce";
import { scopedDetailRecord } from "@/platform/recordScope";
import { PeopleDialogLead, PeopleDialogSection } from "./dialogs";

function payrollRecords(context: ScreenContext, collection: string) {
  return listByCollection(context.org.id, collection);
}
import "./hr.css";
import { clockIso } from "@/platform/clock";

/** Focus a control the screen already renders, rather than faking an action. */
function focusWithin(selector: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(selector)?.focus();
  });
}

function MailBoundary() {
  const capability = capabilityById("email.send");
  return (
    <Notice tone="warning" title={`${capability?.label ?? "Send email"} — ${capability?.state.replace("_", " ") ?? "not connected"}`}>
      {capability?.localEquivalent} {capability?.note}
    </Notice>
  );
}

function OffboardingConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const fromRoute = useRecord(context.params.id);
  const employee = scopedDetailRecord(fromRoute, context.org.id, "employees");
  const tasks = useCollections(["tasks"]).tasks;
  if (!employee) return <Empty title="Employee unavailable">Open a valid employee record before offboarding.</Empty>;
  const queued = tasks.filter((task) => task.fields.employeeId === employee.id && task.fields.group === "IT access" && task.status !== "done" && task.status !== "rescinded");
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Offboarding {employee.title} records the person as alumni and dates their leaving day.
        Any pending IT access requests are rescinded in Arlovi. External account and door access must be checked separately.
      </p>
      <Properties rows={[
        { label: "Record", value: employee.title },
        { label: "Current status", value: employee.status },
        { label: "External access", value: "Not connected — manual follow-up required" },
        { label: "Pending requests to rescind", value: String(queued.length) },
      ]} />
      <Notice tone="warning" title="What this does not do">
        No identity provider is connected, so this records the decision. Someone still has to turn off the real accounts.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="danger"
          onClick={async () => {
            await context.mutate.patch(employee.id, {
              status: "alumni",
              endAt: clockIso(),
              fields: { ...employee.fields, accessRevoked: true },
            }, { expectRevision: employee.revision, event: `${employee.title} offboarded locally by ${context.actor}; external access not verified` });
            const rescinded = await rescindQueuedGrants(context, employee.id, tasks);
            context.toast("Offboarding recorded", `${employee.title} is now alumni in Arlovi. ${rescinded} pending IT access request${rescinded === 1 ? " was" : "s were"} rescinded locally; check external access separately.`);
            close();
          }}
        >
          Offboard {employee.title.split(" ")[0]}
        </Button>
      </Row>
    </Stack>
  );
}

function AccessRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const fromRoute = useRecord(context.params.id);
  const employee = scopedDetailRecord(fromRoute, context.org.id, "employees");
  if (!employee) return <Empty title="Employee unavailable">Open a valid employee record before requesting access.</Empty>;
  return (
    <form
      id="hr-access"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.create({
          collection: "tasks",
          title: `Access: ${String(form.get("grant") ?? "")}`,
          status: "waiting",
          summary: `Requested by ${context.actor} for ${employee.title}. ${String(form.get("reason") ?? "")}`,
          fields: { kind: "onboarding", employeeId: employee.id, stage: "waiting", assignee: "Maya Chen", group: "IT access" },
          parentId: employee.id,
        }, `Access requested: ${String(form.get("grant") ?? "")}`);
        context.toast("Access requested", "It is waiting for a named approver, not granted.");
        close();
      }}
    >
      <Field label="Grant" required>
        <Select name="grant" required>
          {["Finance ledger (read)", "Customer care queue", "Workshop door code", "Compliance toolkit", "Payroll"].map((grant) => <option key={grant}>{grant}</option>)}
        </Select>
      </Field>
      <Field label="Why it is needed" required><TextArea name="reason" rows={3} required /></Field>
      <Notice tone="warning" title="Access is never inferred">
        Employment status does not grant anything on its own. This request waits for a named approver and is recorded either way.
      </Notice>
    </form>
  );
}

/**
 * The People app stores an auditable reference, not file bytes. Never claim
 * that a contract, identity check or uploaded file exists unless a user
 * explicitly records the reference against this exact employee.
 */
function PeopleFileReference({ context, close }: { context: ScreenContext; close: () => void }) {
  const fromRoute = useRecord(context.params.id);
  const employee = scopedDetailRecord(fromRoute, context.org.id, "employees");
  if (!employee) return <Empty title="Employee unavailable">Open a valid employee record before filing a document reference.</Empty>;
  return (
    <form id="hr-document" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const title = String(form.get("title") ?? "").trim();
      if (!title) return;
      const note = String(form.get("note") ?? "").trim();
      await context.mutate.create({
        collection: "documents",
        title,
        status: "filed",
        summary: `Document reference entered by ${context.actor} for ${employee.title}; the file itself is not stored here.`,
        parentId: employee.id,
        fields: {
          kind: "peopleFile", employeeId: employee.id, folder: "People files",
          confidential: true, referenceOnly: true,
          filedBy: context.actor, filedAt: context.now.toISOString(), note,
        },
      }, `Personnel document reference recorded: ${title} for ${employee.title}`);
      context.toast("Reference added", `A ${title} reference is linked to ${employee.title}; no file was uploaded.`);
      close();
    }}>
      <Field label="Document" required>
        <Select name="title" required>
          {["Employment contract", "Contract variation", "Right to work check", "Probation letter", "Training certificate", "Leaver letter"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="Internal note"><TextArea name="note" rows={3} /></Field>
      <Notice tone="info" title="A document reference, not a file upload">
        This records a document's name, who entered the reference and when. The file stays in its existing storage location; Arlovi has not uploaded or verified it.
      </Notice>
    </form>
  );
}

export const hrApp = registerApp({
  code: "HR",
  short: "People",
  name: "People, HR & Payroll",
  purpose: "People, hiring, leave, pay and the policies behind them",
  icon: Briefcase,
  nav: [
    { items: [
      { label: "People Overview", screenId: "ARL-HR-001", icon: Users },
      { label: "Employee Directory", screenId: "ARL-HR-002", icon: Users },
    ] },
    { label: "Hiring", items: [
      { label: "Recruitment", screenId: "ARL-HR-004", icon: UserPlus },
      { label: "Onboarding", screenId: "ARL-HR-006", icon: ClipboardCheck },
    ] },
    { label: "Time", items: [
      { label: "Leave & Absence", screenId: "ARL-HR-007", icon: CalendarDays },
      { label: "Scheduling & Time", screenId: "ARL-HR-008", icon: Clock },
    ] },
    { label: "Pay and growth", items: [
      { label: "Payroll", screenId: "ARL-HR-009", icon: Receipt },
      { label: "Performance", screenId: "ARL-HR-010", icon: ClipboardCheck },
      { label: "Learning & Policies", screenId: "ARL-HR-011", icon: GraduationCap },
    ] },
  ],
  screens: {
    "ARL-HR-001": {
      id: "ARL-HR-001",
      subtitle: (context) => `People, agents and the decisions waiting on ${context.org.shortName}.`,
      tabs: (["Overview", "My team", "HR tasks", "Trends"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PeopleOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "approve request", label: "Approve leave", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("leave approval") },
        { id: "start hire", label: "Start a hire", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("new position") },
        { id: "View employee", label: "View an employee", placement: "overflow", run: (context) => viewEmployee(context) },
        { id: "inspect metric", label: "Inspect a metric", placement: "overflow", run: (context) => context.openOverlay("metric detail") },
        { id: "employee directory", label: "Employee directory", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/hr/employees`) },
        { id: "coverage detail", label: "Coverage detail", placement: "overflow", run: (context) => context.openOverlay("Staffing alert") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "metric detail", kind: "drawer", title: "Where each figure comes from", width: 520, render: ({ ...context }) => <MetricDetail context={context} /> },
        { id: "Staffing alert", kind: "drawer", title: "Coverage over the next week", width: 520, render: ({ ...context }) => <StaffingSummary context={context} /> },
        { id: "leave approval", kind: "drawer", title: "Leave decision", width: 520, render: ({ ...context }) => <LeaveApproval context={context} /> },
        { id: "new position", kind: "modal", title: "Open a position", width: 560, render: ({ close, ...context }) => <PositionEditor context={context} close={close} />, footer: submitFooter("hr-position", "Open position") },
      ],
    },

    "ARL-HR-002": {
      id: "ARL-HR-002",
      subtitle: () => "People who work here, and the AI employees listed apart from them.",
      tabs: (["People", "Teams", "Contractors", "Alumni"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EmployeeDirectory context={context} lens={lens} />,
      })),
      actions: [
        { id: "invite", label: "Invite someone", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Invite employee") },
        { id: "open profile", label: "Open profile", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a person first"), run: (context) => context.navigate(`/o/${context.org.slug}/hr/employees/${context.selectedId}`) },
        { id: "Search", label: "Search the directory", placement: "overflow", run: () => focusWithin('input[type="search"]') },
        { id: "filter", label: "Filter by team", placement: "overflow", run: (context) => context.openOverlay("team filter") },
      ],
      overlays: [
        { id: "team filter", kind: "modal", title: "Filter the directory by team", width: 440, render: ({ close, ...context }) => <DirectoryFilter context={context} close={close} /> },
        { id: "Invite employee", kind: "modal", title: "Invite someone to the workspace", width: 520,
          render: ({ close, ...context }) => (
            <form id="hr-invite" className="ds-stack ds-gap-4" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await context.mutate.create({
                collection: "employees",
                title: String(form.get("name") ?? "New colleague"),
                status: "probation",
                summary: `Invited by ${context.actor}. The invitation is a local draft.`,
                startAt: String(form.get("start") || "") || undefined,
                fields: {
                  kind: "human", title: String(form.get("role") ?? ""), employment: String(form.get("employment") ?? "full-time"),
                  email: String(form.get("email") ?? ""), manager: context.actor, office: "Clerkenwell studio",
                  leaveAllowance: 25, leaveTaken: 0, salaryMinor: 0, pensionPct: 5, phone: "Not shared",
                },
              }, `Employee record created for ${String(form.get("name") ?? "")}`);
              context.toast("Record created", "The person is in the directory; the invitation itself has not been sent.");
              close();
            }}>
              <Field label="Name" required><TextInput name="name" required /></Field>
              <Field label="Work email" required><TextInput name="email" type="email" required /></Field>
              <Row gap={3}>
                <Field label="Role"><TextInput name="role" /></Field>
                <Field label="Employment">
                  <Select name="employment">{["full-time", "part-time", "contractor"].map((option) => <option key={option}>{option}</option>)}</Select>
                </Field>
              </Row>
              <Field label="Start date"><TextInput name="start" type="date" /></Field>
              <InboxNote />
            </form>
          ),
          footer: submitFooter("hr-invite", "Create the record") },
        { id: "directory card", kind: "drawer", title: "Roster", width: 420, render: ({ ...context }) => <SegmentedInspector context={context} /> },
        { id: "export permissions", kind: "modal", title: "Who can export this directory", width: 520, render: ({ ...context }) => (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Your role view", value: context.role },
              { label: "Export permitted", value: context.can("export_data") ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">No</Pill> },
              { label: "Fields included", value: "Name, role, department, manager, office" },
              { label: "Fields excluded", value: "Pay, date of birth, emergency contact, national insurance" },
            ]} />
            <RoleViewNote what="Personal contact detail" />
          </Stack>
        ) },
      ],
    },

    "ARL-HR-003": {
      id: "ARL-HR-003",
      title: () => "Employee profile",
      subtitle: () => "One person's record: job, documents, leave, performance and access.",
      tabs: ["Overview", "Job", "Documents", "Leave", "Performance", "Access"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EmployeeProfile context={context} lens={lens} />,
      })),
      actions: [
        { id: "Update profile", label: "Update profile", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("profile editor") },
        { id: "request change", label: "Request an access change", placement: "secondary", run: (context) => context.openOverlay("access request") },
        { id: "upload document", label: "Add a document reference", placement: "overflow", run: (context) => context.openOverlay("Contract upload") },
        { id: "offboard", label: "Offboard", placement: "overflow", tone: "danger", capability: "edit_people", run: (context) => context.openOverlay("offboarding confirmation") },
      ],
      overlays: [
        { id: "profile editor", kind: "modal", title: "Update profile", width: 520, render: ({ close, ...context }) => <ProfileEditor context={context} close={close} />, footer: submitFooter("hr-profile", "Save the profile") },
        { id: "Contract upload", kind: "modal", title: "Add a people-file reference", width: 520,
          render: ({ close, ...context }) => <PeopleFileReference context={context} close={close} />,
          footer: submitFooter("hr-document", "Save reference") },
        { id: "access request", kind: "modal", title: "Request access", width: 520, render: ({ close, ...context }) => <AccessRequest context={context} close={close} />, footer: submitFooter("hr-access", "Send the request") },
        { id: "offboarding confirmation", kind: "modal", title: "Offboard this person", tone: "danger", width: 520, render: ({ close, ...context }) => <OffboardingConfirmation context={context} close={close} /> },
      ],
    },

    "ARL-HR-004": {
      id: "ARL-HR-004",
      subtitle: () => "Open positions, the people applying and where each decision sits.",
      tabs: (["Positions", "Candidates", "Interviews", "Offers"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Recruitment context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create role", label: "Create a role", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Job spec editor") },
        { id: "review applicant", label: "Review a candidate", placement: "secondary", run: (context) => context.openOverlay("candidate profile", context.selectedId ? { id: context.selectedId } : undefined) },
        { id: "schedule", label: "Schedule an interview", placement: "overflow", run: (context) => context.openOverlay("schedule interview", context.selectedId ? { id: context.selectedId } : undefined) },
        { id: "issue offer", label: "Issue an offer", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("offer approval") },
        { id: "open calendar", label: "Open the calendar", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/comms/calendar`) },
      ],
      overlays: [
        { id: "schedule interview", kind: "modal", title: "Schedule an interview", width: 560, render: ({ close, ...context }) => <ScheduleInterview context={context} close={close} />, footer: submitFooter("hr-interview", "Schedule the interview") },
        { id: "Job spec editor", kind: "modal", title: "Job specification", width: 600, render: ({ close, ...context }) => <PositionEditor context={context} close={close} />, footer: submitFooter("hr-position", "Save position") },
        { id: "candidate profile", kind: "drawer", title: "Candidate", width: 520, render: ({ ...context }) => <CandidateProfileOverlay context={context} /> },
        { id: "offer approval", kind: "modal", title: "Issue an offer", width: 560, render: ({ close, ...context }) => <OfferApproval context={context} close={close} /> },
      ],
    },

    "ARL-HR-005": {
      id: "ARL-HR-005",
      title: () => "Applicant profile",
      subtitle: () => "One application, with its consent date and the person accountable for the decision.",
      tabs: ["Overview", "Documents", "Interviews", "Decisions"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ApplicantProfile context={context} lens={lens} />,
      })),
      actions: [
        { id: "record assessment", label: "Record a scorecard", placement: "primary", run: (context) => context.openOverlay("interviewer scorecard") },
        { id: "Review", label: "Review and move stage", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("stage decision") },
        { id: "message", label: "Message the candidate", placement: "overflow", run: (context) => context.openOverlay("message candidate") },
        { id: "schedule", label: "Schedule an interview", placement: "overflow", run: (context) => context.openOverlay("schedule interview", { id: context.params.id }) },
        { id: "communications", label: "Communications history", placement: "overflow", run: (context) => context.openOverlay("Applicant communications") },
        { id: "preview rejection", label: "Preview the rejection", placement: "overflow", run: (context) => context.openOverlay("rejection preview") },
      ],
      overlays: [
        { id: "stage decision", kind: "modal", title: "Review and move stage", width: 560, render: ({ close, ...context }) => <StageDecision context={context} close={close} />, footer: submitFooter("hr-stage", "Record the decision") },
        { id: "message candidate", kind: "modal", title: "Message the candidate", width: 560, render: ({ close, ...context }) => <ApplicantMessage context={context} close={close} />, footer: submitFooter("hr-applicant-message", "Keep as a draft") },
        { id: "schedule interview", kind: "modal", title: "Schedule an interview", width: 560, render: ({ close, ...context }) => <ScheduleInterview context={context} close={close} />, footer: submitFooter("hr-interview", "Schedule the interview") },
        { id: "Applicant communications", kind: "drawer", title: "Communications with this candidate", width: 480, render: ({ ...context }) => (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Application received", value: context.date(context.now) },
              { label: "Acknowledgement", value: "Drafted locally, not sent" },
              { label: "Interview invitation", value: "Drafted locally, not sent" },
            ]} />
            <MailBoundary />
          </Stack>
        ) },
        { id: "interviewer scorecard", kind: "drawer", title: "Interview scorecard", width: 520, render: ({ ...context }) => <CandidateProfileOverlay context={context} /> },
        { id: "rejection preview", kind: "modal", title: "Rejection, previewed before anyone sees it", width: 560, render: ({ ...context }) => (
          <Stack gap={3}>
            <div className="ds-panel" style={{ padding: "var(--space-4)" }}>
              <p>Thank you for applying and for the time you gave the process. On this occasion we are not taking your application further.</p>
              <p>We would be glad to hear from you again when something closer to your experience comes up.</p>
            </div>
            <Notice tone="warning" title="A reason is recorded against the candidate, not sent">
              The reason a hiring manager gives stays on the record in {context.org.shortName}. Sending this message needs a connected mailbox.
            </Notice>
          </Stack>
        ) },
      ],
    },

    "ARL-HR-006": {
      id: "ARL-HR-006",
      subtitle: () => "Checklists that run across People, the manager, IT access and Finance.",
      tabs: (["Incoming", "In progress", "Waiting", "Completed"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Onboarding context={context} lens={lens} />,
      })),
      actions: [
        { id: "Launch checklist", label: "Launch a checklist", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Onboarding template") },
        { id: "grant request", label: "Decide access requests", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("IT access") },
        { id: "assign mentor", label: "Assign a mentor", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("assign mentor") },
        { id: "verify completion", label: "Verify completion", placement: "overflow", capability: "edit_people", run: (context) => verifyCompletion(context) },
        { id: "welcome note", label: "Welcome note", placement: "overflow", run: (context) => context.openOverlay("welcome preview") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "assign mentor", kind: "modal", title: "Assign a mentor", width: 500, render: ({ close, ...context }) => <MentorAssign context={context} close={close} />, footer: submitFooter("hr-mentor", "Assign the mentor") },
        { id: "Onboarding template", kind: "modal", title: "Launch an onboarding checklist", width: 560, render: ({ close, ...context }) => <OnboardingLaunch context={context} close={close} />, footer: submitFooter("hr-onboarding", "Launch checklist") },
        { id: "IT access", kind: "drawer", title: "Access requests for this starter", width: 500, render: ({ ...context }) => <ITAccess context={context} /> },
        { id: "welcome preview", kind: "modal", title: "Welcome note", width: 520, render: ({ ...context }) => (
          <Stack gap={3}>
            <div className="ds-panel" style={{ padding: "var(--space-4)" }}>
              <p>Welcome to {context.org.name}. Your first morning starts at the bench with Rowan; the studio eats together at one.</p>
              <p>Your checklist is in People, and your mentor will walk you through the safety file before you touch a tool.</p>
            </div>
            <MailBoundary />
          </Stack>
        ) },
      ],
    },

    "ARL-HR-007": {
      id: "ARL-HR-007",
      subtitle: () => "Balances, the team calendar and the decisions that move them.",
      tabs: (["My leave", "Team calendar", "Approvals", "Policy"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LeaveScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Request leave", label: "Request leave", placement: "primary", run: (context) => context.openOverlay("Leave form") },
        { id: "approve", label: "Approve leave", placement: "secondary", capability: "edit_people", run: (context) => approveLeave(context) },
        { id: "decline", label: "Decline leave", placement: "overflow", capability: "edit_people", run: (context) => declineLeave(context) },
        { id: "adjust balance", label: "Adjust a balance", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("balance adjustment") },
        { id: "check cover", label: "Check cover", placement: "overflow", run: (context) => context.openOverlay("conflict review") },
        { id: "explain balance", label: "How a balance is worked out", placement: "overflow", run: (context) => context.openOverlay("policy explanation") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "balance adjustment", kind: "modal", title: "Adjust a leave balance", width: 500, render: ({ close, ...context }) => <BalanceAdjust context={context} close={close} />, footer: submitFooter("hr-balance", "Adjust the balance") },
        { id: "Leave form", kind: "modal", title: "Request leave", width: 560, render: ({ close, ...context }) => <LeaveForm context={context} close={close} />, footer: submitFooter("hr-leave-form", "Send the request") },
        { id: "policy explanation", kind: "drawer", title: "How this balance is worked out", width: 480, render: ({ ...context }) => <BalanceExplainer context={context} /> },
        { id: "conflict review", kind: "drawer", title: "Cover on these days", width: 520, render: ({ ...context }) => <StaffingSummary context={context} /> },
      ],
    },

    "ARL-HR-008": {
      id: "ARL-HR-008",
      subtitle: (context) => `Roster, hours and exceptions in ${context.org.timezone}.`,
      tabs: (["Roster", "Timesheets", "Availability", "Exceptions"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Scheduling context={context} lens={lens} />,
      })),
      actions: [
        { id: "approve hours", label: "Approve hours", placement: "primary", capability: "edit_people", run: (context) => approveHours(context) },
        { id: "Drag shift", label: "Move a shift", placement: "secondary", guard: needsSelection("a shift on the roster"), run: (context) => context.openOverlay("Shift edit") },
        { id: "swap", label: "Swap shifts", placement: "overflow", capability: "edit_people", run: (context) => swapShift(context) },
        { id: "export", label: "Export hours", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export hours") },
        { id: "overtime approvals", label: "Overtime approvals", placement: "overflow", run: (context) => context.openOverlay("overtime approval") },
        { id: "correct time", label: "Correct a time entry", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("time correction") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Shift edit", kind: "modal", title: "Shift", width: 520, render: ({ close, ...context }) => <ShiftEdit context={context} close={close} />, footer: submitFooter("hr-shift", "Save shift") },
        { id: "time review", kind: "drawer", title: "Review recorded time", width: 560, render: ({ close, ...context }) => <TimeReview context={context} close={close} /> },
        { id: "time correction", kind: "modal", title: "Correct a time entry", width: 520, render: ({ close, ...context }) => <TimeCorrection context={context} close={close} />, footer: submitFooter("hr-time-correction", "Save the correction") },
        { id: "export hours", kind: "modal", title: "Export hours", width: 520, render: ({ ...context }) => <ExportHours context={context} /> },
        { id: "overtime approval", kind: "drawer", title: "Overtime", width: 480, render: ({ ...context }) => <Overtime context={context} /> },
      ],
    },

    "ARL-HR-009": {
      id: "ARL-HR-009",
      subtitle: () => "Runs computed in this browser. Nothing is filed and nothing is paid.",
      tabs: (["Runs", "Inputs", "Approvals", "Payslips"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Payroll context={context} lens={lens} />,
      })),
      actions: [
        { id: "Prepare run", label: "Prepare a run", placement: "primary", capability: "view_payroll", run: async (context) => prepareRun(context, await payrollRecords(context, "payrollRuns"), await payrollRecords(context, "employees")) },
        { id: "approve", label: "Approve the run", placement: "secondary", capability: "view_payroll", run: (context) => context.openOverlay("submission signoff") },
        { id: "validate", label: "Validate the run", placement: "overflow", capability: "view_payroll", run: async (context) => validateRun(context, await payrollRecords(context, "payrollRuns"), await payrollRecords(context, "employees"), await payrollRecords(context, "shifts")) },
        { id: "export", label: "Export CSV", placement: "overflow", capability: "export_data", run: async (context) => exportRun(context, await payrollRecords(context, "payrollRuns"), await payrollRecords(context, "employees")) },
        { id: "reconcile", label: "Reconcile to the ledger", placement: "overflow", capability: "view_payroll", run: (context) => context.openOverlay("reconcile run") },
        { id: "exceptions", label: "Exceptions", placement: "overflow", capability: "view_payroll", run: (context) => context.openOverlay("exception report") },
      ],
      overlays: [
        { id: "reconcile run", kind: "modal", title: "Reconcile the run to the ledger", width: 560, render: ({ close, ...context }) => <ReconcileRun context={context} close={close} /> },
        { id: "Payroll review", kind: "drawer", title: "Payroll run", width: 620, render: ({ ...context }) => <PayrollReview context={context} /> },
        { id: "exception report", kind: "modal", title: "Payroll exceptions", width: 600, render: ({ ...context }) => <PayrollExceptions context={context} /> },
        { id: "submission signoff", kind: "modal", title: "Approve this run", tone: "danger", width: 560, render: ({ close, ...context }) => <PayrollSignoff context={context} close={close} /> },
      ],
    },

    "ARL-HR-010": {
      id: "ARL-HR-010",
      subtitle: () => "Cycles, evidence and ratings a named person is accountable for.",
      tabs: (["Cycles", "My reviews", "Team", "Templates"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Performance context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create review", label: "Create a review", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Review form") },
        { id: "assign reviewer", label: "Assign a reviewer", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("assign reviewer") },
        { id: "submit", label: "Submit a review", placement: "overflow", run: (context) => submitReview(context) },
        { id: "acknowledge", label: "Acknowledge a review", placement: "overflow", run: (context) => acknowledgeReview(context) },
        { id: "calibration", label: "Calibration", placement: "overflow", run: (context) => context.openOverlay("calibration panel") },
        { id: "confidentiality", label: "Who sees a review", placement: "overflow", run: (context) => context.openOverlay("confidentiality control") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "assign reviewer", kind: "modal", title: "Assign a reviewer", width: 500, render: ({ close, ...context }) => <AssignReviewer context={context} close={close} />, footer: submitFooter("hr-reviewer", "Assign the reviewer") },
        { id: "Review form", kind: "modal", title: "Review", width: 600, render: ({ close, ...context }) => <ReviewForm context={context} close={close} />, footer: submitFooter("hr-review", "Save review") },
        { id: "calibration panel", kind: "drawer", title: "Calibration", width: 540, render: ({ ...context }) => <Calibration context={context} /> },
        { id: "confidentiality control", kind: "modal", title: "Who sees this review", width: 520, render: () => (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Draft", value: "The reviewer only" },
              { label: "Submitted", value: "Reviewer and the next manager up" },
              { label: "Calibrated", value: "Reviewer, manager and People" },
              { label: "Acknowledged", value: "Everyone above, plus the person reviewed" },
            ]} />
            <RoleViewNote what="Review drafts and ratings" />
          </Stack>
        ) },
      ],
    },

    "ARL-HR-011": {
      id: "ARL-HR-011",
      subtitle: () => "Courses, published policies and who has acknowledged which version.",
      tabs: (["Courses", "Policies", "Compliance", "My learning"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Learning context={context} lens={lens} />,
      })),
      actions: [
        { id: "Assign course", label: "Assign a course", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("assign course") },
        { id: "acknowledge policy", label: "Acknowledge a policy", placement: "secondary", run: (context) => acknowledgePolicy(context) },
        { id: "complete module", label: "Complete a module", placement: "overflow", run: (context) => completeModule(context) },
        { id: "build course", label: "Build a course", placement: "overflow", capability: "edit_knowledge", run: (context) => context.openOverlay("Course builder") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "assign course", kind: "modal", title: "Assign a course", width: 520, render: ({ close, ...context }) => <AssignCourse context={context} close={close} />, footer: submitFooter("hr-assign-course", "Assign the course") },
        { id: "Course builder", kind: "modal", title: "Course", width: 560, render: ({ close, ...context }) => <CourseBuilder context={context} close={close} />, footer: submitFooter("hr-course", "Save course") },
        { id: "quiz", kind: "modal", title: "Check what was understood", width: 560, render: ({ ...context }) => <Quiz context={context} /> },
        { id: "policy publication", kind: "modal", title: "Publish a revision", tone: "danger", width: 560, render: ({ close, ...context }) => <PolicyPublication context={context} close={close} /> },
      ],
    },
  },
});

/* ------------------------------------------------------------------ *
 * Overlay and tab bodies that need the registry context
 * ------------------------------------------------------------------ */

function OfferApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["applicants", "positions"]);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const requestedId = payload?.id ?? context.selectedId;
  const applicant = requestedId
    ? data.applicants.find((row) => row.id === requestedId && row.collection === "applicants" && row.organizationId === context.org.id)
    : data.applicants.find((row) => row.organizationId === context.org.id && row.fields.stage === "offer"
      && !String(row.fields.offerIssuedBy ?? "").trim());
  if (!applicant) return <Empty title={requestedId ? "Selected candidate unavailable" : "No candidate is at the offer stage"}
    icon={<UserPlus size={20} />}>Open a valid candidate from this company before reviewing their offer.</Empty>;
  const issued = Boolean(String(applicant.fields.offerIssuedBy ?? "").trim());
  const scored = Number(applicant.fields.rating ?? 0) > 0;
  const position = data.positions.find((row) => row.id === applicant.fields.positionId);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Candidate", value: applicant.title },
        { label: "Role", value: position?.title ?? String(applicant.fields.role ?? "") },
        { label: "Hiring manager", value: String(position?.fields.hiringManager ?? "") },
        { label: "Range", value: !context.can("view_payroll") ? "Hidden in this role view"
          : position?.fields.salaryLowMinor !== undefined && position.fields.salaryHighMinor !== undefined
            ? `${context.money(Number(position.fields.salaryLowMinor))} – ${context.money(Number(position.fields.salaryHighMinor))}`
            : "Not recorded" },
        { label: "Scorecard", value: scored ? `${String(applicant.fields.rating)} of 5` : "None recorded" },
        { label: "Offer", value: issued ? `Issued by ${String(applicant.fields.offerIssuedBy)} — awaiting the candidate's answer` : "Not issued" },
      ]} />
      {!scored && <Notice tone="danger" title="No scorecard on record">An offer needs a recorded, evidence-based scorecard by an accountable person first.</Notice>}
      <p className="ds-prose">Issuing records the offer as made by {context.actor} and keeps the letter as a local draft. The candidate is not hired until they accept and somebody records it.</p>
      <MailBoundary />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!context.can("edit_people") || issued || !scored}
          onClick={async () => {
            const updated = await context.mutate.patch(applicant.id, { fields: { ...applicant.fields, stage: "offer", offerIssuedBy: context.actor, offerIssuedAt: clockIso(), offerDelivery: "queued_local" } }, { expectRevision: applicant.revision, event: `Offer issued to ${applicant.title} by ${context.actor}; letter kept as a local draft` });
            if (!updated) return;
            await context.mutate.log(`Offer letter for ${applicant.title} queued locally — no mail service is connected, so nothing has left this browser.`, { entityId: applicant.id, type: "boundary", capability: "queued_local" });
            context.toast("Offer issued", `Recorded against ${applicant.title} by ${context.actor}. The letter is a local draft; nothing was sent.`);
            close();
          }}
        >
          Issue the offer
        </Button>
      </Row>
    </Stack>
  );
}

function OnboardingLaunch({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["employees", "members", "tasks"]);
  const starters = data.employees.filter((employee) => employee.status === "probation" || employee.status === "active");
  const payload = context.overlayPayload as { employeeId?: string } | undefined;
  const selectedStarter = starters.some((employee) => employee.id === payload?.employeeId) ? payload?.employeeId : "";
  return (
    <form
      id="hr-onboarding"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const employeeId = String(form.get("employee") ?? "");
        const mentor = String(form.get("mentor") ?? "");
        const employee = data.employees.find((row) => row.id === employeeId);
        const mentorRecord = data.employees.find((row) => row.title === mentor && row.status === "active");
        if (!employee || !mentorRecord) {
          context.toast("Checklist not launched", "Choose a current employee and an active mentor.", "blocked");
          return;
        }
        try {
          const plan = planOnboardingLaunch({
            organizationId: context.org.id, currency: context.org.currency,
            actor: context.actor, now: clockIso(),
          }, employee, mentorRecord, data.tasks);
          await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
          context.toast("Checklist launched", "All six onboarding steps were saved together for " + employee.title + ".");
          close();
        } catch (error) {
          context.toast("Checklist not launched", error instanceof Error ? error.message : "Reload the employee record and try again.", "blocked");
        }
      }}
    >
      <Field label="Who is starting" required>
        <Select name="employee" required defaultValue={selectedStarter}>
          <option value="">Choose the employee</option>
          {starters.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Mentor" required>
        <Select name="mentor" required defaultValue="">
          <option value="">Choose an active mentor</option>
          {data.employees.filter((row) => row.status === "active").map((row) => <option key={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="Six steps, one complete checklist">
        People verify documents, the mentor completes the introduction, IT access waits for a human decision, and Finance reviews payroll inputs. A launch is saved atomically; no accounts or external services are provisioned.
      </Notice>
    </form>
  );
}

function ITAccess({ context }: { context: ScreenContext }) {
  const data = useCollections(["tasks"]);
  const payload = context.overlayPayload as { employeeId?: string } | undefined;
  const requests = data.tasks.filter((task) => task.fields.kind === "onboarding" && task.fields.group === "IT access" && (!payload?.employeeId || task.fields.employeeId === payload.employeeId));
  return requests.length === 0 ? <Empty title="No access requests" /> : (
    <Stack gap={3}>
      {requests.map((request) => (
        <div key={request.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}>
            <strong className="ds-grow">{request.title}</strong>
            <Pill tone={request.status === "done" ? "success" : "warning"} dot>{request.status}</Pill>
          </Row>
          <p className="ds-subtle">{request.summary}</p>
          {["waiting", "ready", "requested"].includes(request.status) && (
            <Button size="sm" variant="primary" disabled={!context.can("edit_people")}
              style={{ marginBlockStart: "var(--space-2)" }}
              onClick={async () => {
                if (!context.can("edit_people")) return;
                const saved = await context.mutate.patch(request.id, { status: "done", fields: {
                  ...request.fields, stage: "done", grantedBy: context.actor, grantedAt: clockIso(),
                } }, { expectRevision: request.revision,
                  event: `${request.title} local access review recorded by ${context.actor}` });
                if (saved) context.toast("Local decision recorded",
                  `${request.title} was marked complete in the local checklist. External access remains unverified.`);
              }}>
              Record local review
            </Button>
          )}
        </div>
      ))}
      <Notice tone="warning" title="Recording is not provisioning">
        No identity provider is connected. Recording a grant says a person decided; somebody still has to make the account.
      </Notice>
    </Stack>
  );
}

function BalanceExplainer({ context: _context }: { context: ScreenContext }) {
  const data = useCollections(["employees", "leaveRequests"]);
  const { actor } = useWorkspace();
  const employee = data.employees.find((row) => row.title === actor && row.status !== "alumni");
  if (!employee) return <Empty title="No matching employee record">
    The signed-in local role view has no matching employee. Select the correct person in People before showing a personal balance.
  </Empty>;
  const annual = data.leaveRequests.filter((request) =>
    request.fields.employeeId === employee.id && request.status === "approved"
    && String(request.fields.type ?? "annual") === "annual");
  const allowance = employee.fields.leaveAllowance === undefined ? null : Number(employee.fields.leaveAllowance);
  const taken = Number(employee.fields.leaveTaken ?? 0);
  const known = allowance !== null && Number.isFinite(allowance) && allowance >= 0 && Number.isFinite(taken);
  const recordedDays = annual.reduce((sum, request) => {
    const count = Number(request.fields.days);
    return sum + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
  return (
    <Stack gap={3}>
      <h3>{employee.title}</h3>
      <Properties rows={[
        { label: "Allowance on employee record", value: known ? `${allowance} days` : "Not recorded" },
        { label: "Approved annual requests", value: `${annual.length} on record` },
        { label: "Approved request days explicitly recorded", value: `${recordedDays} days` },
        { label: "Recorded as taken", value: `${taken} days` },
        { label: "Remaining", value: known ? `${Math.max(0, allowance - taken)} days` : "Unavailable until allowance is recorded" },
      ]} />
      <Notice tone={known ? "info" : "warning"} title={known ? "A recorded balance, not a statutory ruling" : "An entitlement has not been recorded"}>
        The balance changes only when an annual leave request is approved through a reviewed transaction. Verify the allowance and
        any mismatches with the published policy and the employee record before adjusting them; missing values are never treated as zero.
      </Notice>
    </Stack>
  );
}

function ShiftEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const candidate = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["employees", "shifts", "leaveRequests", "projects"]);
  const shift = scopedDetailRecord(candidate, context.org.id, "shifts");
  if (!shift || shift.fields.kind !== "shift") {
    return <Empty title="Shift unavailable" icon={<CalendarDays size={20} />}>Choose a roster shift in this company before editing.</Empty>;
  }
  return (
    <form
      id="hr-shift"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const employeeId = String(form.get("employee") ?? "");
        const employee = data.employees.find((row) => row.id === employeeId);
        const day = String(form.get("day") ?? "");
        const time = String(form.get("time") ?? "");
        try {
          if (!employee) throw new Error("Select an existing employee in this company.");
          const plan = planShiftMove({
            organizationId: context.org.id, currency: context.org.currency,
            actor: context.actor, now: clockIso(), timezone: context.org.timezone,
          }, shift, employee, data.shifts, data.leaveRequests, data.employees, data.projects, {
            startAt: day && time ? `${day}T${time}:00.000Z` : "",
            hours: Number(form.get("hours") ?? 0),
            place: String(form.get("place") ?? ""),
            projectId: String(form.get("project") ?? ""),
          });
          await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
          context.toast("Shift saved", "The roster was checked and the change saved. No external calendar was updated.");
          close();
        } catch (error) {
          context.toast("Shift not saved", error instanceof Error ? error.message : "Reload this shift before editing.", "blocked");
        }
      }}
    >
      <Field label="Person" required>
        <Select name="employee" required defaultValue={String(shift.fields.employeeId ?? "")}>
          {data.employees.filter((row) => !["alumni", "terminated"].includes(row.status)).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Place" required>
        <Select name="place" required defaultValue={String(shift.fields.place ?? "Showroom")}>{["Showroom", "Workshop bench", "Despatch"].map((place) => <option key={place}>{place}</option>)}</Select>
      </Field>
      <Field label="Project assignment" hint="Optional. Project links stay within this company and appear in the scheduling and timesheet context.">
        <Select name="project" defaultValue={String(shift.fields.projectId ?? "")}>
          <option value="">No project assigned</option>
          {data.projects.filter((row) => !["cancelled", "archived", "deleted"].includes(row.status)).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="Day (UTC)" required><TextInput name="day" type="date" required defaultValue={shift.startAt?.slice(0, 10) ?? ""} /></Field>
        <Field label="Start (UTC)" required><TextInput name="time" type="time" required defaultValue={shift.startAt?.slice(11, 16) ?? "09:00"} /></Field>
        <Field label="Hours" required><TextInput name="hours" inputMode="decimal" align="end" required defaultValue={String(shift.fields.hours ?? 8)} /></Field>
      </Row>
      <Properties rows={[
        { label: "Starts now", value: context.dateTime(shift.startAt) },
        { label: "Ends now", value: context.dateTime(shift.endAt) },
        { label: "Location time zone", value: context.org.timezone },
        { label: "Saved time standard", value: "UTC; no automatic local-time conversion" },
      ]} />
      <Notice tone="info" title="A checked roster, not a legal compliance guarantee">
        An overlapping shift or approved leave blocks a change. More than eight hours is flagged as overtime for human review; no external calendar or payroll is updated automatically.
      </Notice>
    </form>
  );
}

/** A full record review is available from every Timesheet row and is not
 * restricted to the desktop table. Decisions use the shared CAS plan. */
function TimeReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const candidate = useRecord(payload?.id ?? context.selectedId);
  const entry = scopedDetailRecord(candidate, context.org.id, "shifts");
  const data = useCollections(["employees", "projects", "tasks"]);
  if (!entry || entry.fields.kind !== "time") {
    return <Empty title="Time entry unavailable">Choose a time entry from this company to review.</Empty>;
  }
  const person = data.employees.find((row) => row.id === entry.fields.employeeId);
  const project = data.projects.find((row) => row.id === entry.fields.projectId);
  const task = data.tasks.find((row) => row.id === entry.fields.taskId && row.parentId === project?.id);
  const done = entry.status === "approved" && entry.fields.approved === true;
  const inconsistent = (entry.status === "approved") !== (entry.fields.approved === true);
  const validHours = Number.isFinite(Number(entry.fields.hours)) && Number(entry.fields.hours) > 0
    && Number(entry.fields.hours) <= 24;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Person", value: person?.title ?? "Unlinked — needs verified employee" },
        { label: "Work date", value: context.date(entry.startAt) },
        { label: "Time recorded", value: `${String(entry.fields.hours ?? "Not recorded")} hours` },
        { label: "Project", value: project?.title ?? (entry.fields.projectId ? "Project unavailable" : "Internal / no project") },
        { label: "Project task", value: task?.title ?? (entry.fields.taskId ? "Task unavailable" : "Not linked") },
        { label: "Submitted by", value: String(entry.fields.filedBy ?? entry.ownerName ?? "Not recorded") },
        { label: "State", value: inconsistent ? "Approval record mismatch" : done ? "Approved in Arlovi" : "Awaiting review" },
        { label: "Approved by", value: String(entry.fields.approvedBy || "Not yet approved") },
        { label: "Approved at", value: entry.fields.approvedAt ? context.dateTime(String(entry.fields.approvedAt)) : "Not recorded" },
        { label: "Last correction", value: entry.fields.correctionReason ? String(entry.fields.correctionReason) : "None recorded" },
      ]} />
      {!person && <Notice tone="warning" title="Employee association must be verified">This entry contains a name but no matching current company employee record. Link the correct employee in Time Correction before approval.</Notice>}
      {entry.fields.projectId && !project && <Notice tone="warning" title="Project is unavailable">The linked Project could not be found in this company. Resolve its reference before approval.</Notice>}
      {inconsistent && <Notice tone="danger" title="Approval state needs reconciliation">The record's status and approval flag disagree. Do not count these hours as approved until this entry has been reviewed.</Notice>}
      <Notice tone="info" title="Human decision, no external payment">
        Reviewing this entry can change its local approval state and audit history. No connected payroll, invoicing or banking provider is updated.
      </Notice>
      <Row gap={2} wrap>
        {project && <Button variant="secondary" onClick={() => { close(); context.navigate(`/o/${context.org.slug}/project/projects/${project.id}`); }}>Open Project</Button>}
        {!done && <Button variant="secondary" onClick={() => {
          close(); context.select(entry.id); context.openOverlay("time correction");
        }}>Correct entry</Button>}
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
        {!done && <Button variant="primary" disabled={!person || !validHours || (Boolean(entry.fields.projectId) && !project)}
          onClick={async () => {
            try {
              const plan = planTimesheetApprovals({
                organizationId: context.org.id, currency: context.org.currency,
                actor: context.actor, now: clockIso(), timezone: context.org.timezone,
              }, [entry], data.employees, data.projects);
              await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
              context.toast("Hours approved", "The employee and Project were verified and the local approval was recorded.");
              close();
            } catch (error) {
              context.toast("Hours not approved", error instanceof Error ? error.message : "Reload the entry and retry.", "blocked");
            }
          }}>Approve hours</Button>}
      </Row>
    </Stack>
  );
}

function Overtime({ context }: { context: ScreenContext }) {
  const data = useCollections(["shifts"]);
  const overtime = data.shifts.filter((shift) => shift.fields.kind === "shift" && shift.fields.overtime === true);
  return overtime.length === 0 ? <Empty title="No overtime on the roster" /> : (
    <Stack gap={2}>
      {overtime.map((shift) => (
        <Row key={shift.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <div className="ds-grow">
            <strong>{String(shift.fields.employeeName ?? "")}</strong>
            <p className="ds-subtle">{context.date(shift.startAt)} · {String(shift.fields.hours ?? 0)} hours</p>
          </div>
          {shift.fields.overtimeApproved === true ? (
            <Pill tone="success">Approved locally</Pill>
          ) : (
            <Button size="sm" variant="secondary" onClick={async () => {
              const saved = await context.mutate.patch(shift.id, { fields: {
                ...shift.fields, overtimeApproved: true, overtimeApprovedBy: context.actor,
                overtimeApprovedAt: clockIso(),
              } }, { expectRevision: shift.revision,
                event: `Overtime reviewed for ${String(shift.fields.employeeName ?? "")} by ${context.actor}` });
              if (saved) context.toast("Overtime recorded", "The local approval was saved. Payroll is not submitted automatically.");
            }}>Approve</Button>
          )}
        </Row>
      ))}
    </Stack>
  );
}

function ExportHours({ context }: { context: ScreenContext }) {
  const data = useCollections(["shifts"]);
  const rows = data.shifts.filter((shift) => shift.fields.kind === "time");
  return (
    <Stack gap={3}>
      <p>{rows.length} time entries will be written to a CSV file in this browser.</p>
      <Button
        variant="primary"
        disabled={!context.can("export_data")}
        onClick={() => {
          const header = "date,person,hours,billable,approved,against\n";
          const body = rows.map((row) => [row.startAt ?? "", String(row.fields.employeeName ?? ""), String(row.fields.hours ?? 0), String(row.fields.billable ?? false), String(row.fields.approved ?? false), row.summary]
            .map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([header + body], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${context.org.slug}-hours.csv`;
          link.click();
          URL.revokeObjectURL(url);
          void context.mutate.log(`Hours exported as CSV by ${context.actor} (${rows.length} entries)`, { type: "export" });
          context.toast("Exported", "The CSV downloaded from this browser.");
        }}
      >
        Download CSV
      </Button>
      {!context.can("export_data") && <RoleViewNote what="Exporting hours" />}
    </Stack>
  );
}

function PayrollExceptions({ context }: { context: ScreenContext }) {
  const data = useCollections(["employees", "shifts"]);
  const noSalary = payrollSalaryGaps(data.employees);
  const unapproved = data.shifts.filter((shift) => shift.fields.kind === "time" && shift.fields.approved !== true);
  const rows = [
    ...noSalary.map((employee) => ({ id: employee.id, issue: "Salary missing or invalid",
      detail: `${employee.title} has no verified salary input. They cannot be included in a complete payroll run.` })),
    ...unapproved.map((entry) => ({ id: entry.id, issue: "Hours not approved", detail: `${String(entry.fields.employeeName ?? "")} has ${String(entry.fields.hours ?? 0)} unapproved hours.` })),
  ];
  return (
    <Stack gap={3}>
      {rows.length === 0 ? <Empty title="No exceptions" icon={<ClipboardCheck size={20} />} /> : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Payroll exceptions"
          filterable={false}
          rowTone={() => "warning"}
          columns={[
            { key: "issue", header: "Exception", primary: true, cell: (row) => row.issue },
            { key: "detail", header: "Detail", cell: (row) => row.detail },
          ]}
        />
      )}
      <Notice tone="warning" title="Jurisdiction compliance is not checked">
        This list catches missing data. It does not validate {context.org.jurisdiction} tax codes, thresholds or reliefs,
        which need a payroll provider.
      </Notice>
    </Stack>
  );
}

function PayrollSignoff({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["payrollRuns", "employees"]);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const wantedId = payload?.id ?? context.selectedId;
  const run = wantedId
    ? data.payrollRuns.find((row) => row.id === wantedId && row.organizationId === context.org.id && row.status === "draft")
    : data.payrollRuns.find((row) => row.status === "draft");
  const gaps = payrollSalaryGaps(data.employees);
  if (!context.can("view_payroll")) return <RoleViewNote what="Payroll approval" />;
  if (!run) return <Empty title={wantedId ? "Selected draft run unavailable" : "No draft run to approve"}>
    Open the actual draft from this company's payroll register; approved or missing runs cannot be re-signed.
  </Empty>;
  const recordedGross = run.fields.grossMinor;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        This records that {context.actor} reviewed {run.title}, for period {String(run.fields.period || "not recorded")}.
        The saved gross is {recordedGross === undefined ? "not recorded" : context.money(Number(recordedGross))},
        not a recalculation of the current employee roster.
      </p>
      {gaps.length > 0 && <Notice tone="danger" title="Salary inputs missing — approval blocked">
        {gaps.length} current employee{gaps.length === 1 ? "" : "s"} have missing or invalid salary inputs.
        Review those source records and reconcile this run before signing off.
      </Notice>}
      <Properties rows={[
        { label: "Filed with an authority", value: <Pill tone="warning">No connection</Pill> },
        { label: "Bank file sent", value: <Pill tone="warning">No connection</Pill> },
        { label: "What approval changes", value: "The run status, the approver's name and the audit entry" },
      ]} />
      <Checkbox label={`I have checked this run and I am ${context.actor}`} id="payroll-confirm" />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={gaps.length > 0}
          onClick={async () => {
            if (gaps.length > 0 || !context.can("view_payroll")) return;
            const confirmed = document.querySelector<HTMLInputElement>("#payroll-confirm")?.checked;
            if (!confirmed) { context.toast("Not approved", "Tick the confirmation first.", "blocked"); return; }
            const saved = await context.mutate.patch(run.id, { status: "approved",
              fields: { ...run.fields, approvedBy: context.actor, approvedAt: clockIso() } },
              { expectRevision: run.revision, event: `Payroll run ${run.title} locally approved by ${context.actor}` });
            if (!saved) {
              context.toast("Approval not saved", "The draft changed. Reload it before deciding.", "blocked");
              return;
            }
            context.toast("Local approval recorded", "The run changed. Nothing was filed, issued or paid.");
            close();
          }}
        >
          Approve the run
        </Button>
      </Row>
    </Stack>
  );
}

function ReviewForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const raw = useRecord(payload?.id);
  const existing = scopedDetailRecord(raw, context.org.id, "reviews");
  const data = useCollections(["employees"]);
  const [error, setError] = useState("");
  const [humanReviewed, setHumanReviewed] = useState(false);
  const editing = Boolean(payload?.id);
  const writable = context.can("edit_people") && (!existing || ["draft", "scheduled"].includes(existing.status));
  const people = data.employees.filter((employee) =>
    !["alumni", "terminated"].includes(employee.status) && employee.fields.employment !== "contractor");

  if (editing && !existing) return (
    <Empty title="Selected review unavailable">
      Open the existing review from the same company. A missing record cannot turn into a new employee assessment.
    </Empty>
  );

  return (
    <form id="hr-review" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      setError("");
      if (!writable) {
        setError("This stage or role does not permit editing the review. Use the named submission or acknowledgement workflow.");
        return;
      }
      const fields = new FormData(event.currentTarget);
      const rating = String(fields.get("rating") ?? "");
      const evidence = String(fields.get("evidence") ?? "").trim();
      const employeeId = String(fields.get("employee") ?? "");
      const employee = people.find((person) => person.id === employeeId);
      if (!existing && !employee) { setError("Choose an active employee from this company."); return; }
      if (rating && evidence.length < 20) {
        setError("A rating needs at least 20 characters of specific supporting evidence before it can be saved.");
        return;
      }
      try {
        if (existing) {
          const saved = await context.mutate.patch(existing.id, {
            summary: evidence,
            fields: {
              ...existing.fields, rating, reviewer: context.actor,
              aiAssisted: existing.fields.aiAssisted === true && !humanReviewed,
              ...(humanReviewed ? { humanReviewedBy: context.actor, humanReviewedAt: clockIso() } : {}),
            },
          }, {
            expectRevision: existing.revision,
            event: `Review evidence updated for ${String(existing.fields.employeeName || existing.title)} by ${context.actor}`,
          });
          if (!saved) {
            setError("The review has changed. Close this form and reopen the current record before saving.");
            return;
          }
        } else {
          const cycle = String(fields.get("cycle") ?? "Year end");
          await context.mutate.create({
            collection: "reviews", title: `${employee?.title} · ${cycle}`, status: "draft",
            summary: evidence,
            fields: {
              employeeId, employeeName: employee?.title ?? "", reviewer: context.actor,
              cycle, rating, aiAssisted: false, confidential: true,
            },
          }, `Draft review created for ${employee?.title} by ${context.actor}`);
        }
        context.toast("Review saved", "A local draft and its evidence were recorded. No employment decision was made automatically.");
        close();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The review could not be saved.");
      }
    }}>
      <PeopleDialogLead eyebrow="PEOPLE / PERFORMANCE" title={existing ? "Review the employee evidence" : "Create an evidence-led review"}
        description="A human author is accountable for every assessment. The draft remains separate from submission, calibration and acknowledgement."
        status={<Pill tone={existing?.status === "acknowledged" ? "success" : "neutral"}>
          {existing?.status ?? "New draft"}
        </Pill>} />
      <PeopleDialogSection step="01" title="Person and review cycle" description="Check the exact employee and recorded period.">
        {existing ? (
          <Properties rows={[
            { label: "Employee", value: String(existing.fields.employeeName || "Not linked") },
            { label: "Cycle", value: String(existing.fields.cycle || "Not recorded") },
            { label: "Current stage", value: existing.status },
            { label: "Reviewer", value: String(existing.fields.reviewer || "Not recorded") },
          ]} />
        ) : (
          <>
            <Field label="Person" required>
              <Select name="employee" required defaultValue="">
                <option value="">Choose an active employee</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.title}</option>)}
              </Select>
            </Field>
            <Field label="Cycle">
              <Select name="cycle" defaultValue="Year end">
                {["Year end", "Mid-year", "Probation"].map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}
              </Select>
            </Field>
          </>
        )}
      </PeopleDialogSection>
      <PeopleDialogSection step="02" title="Assessment and supporting evidence"
        description="Set a rating only when there is a specific, readable explanation for it.">
        <Field label="Assessment" hint="Use the published scale; absence of a rating is not a negative rating.">
          <Select name="rating" defaultValue={String(existing?.fields.rating ?? "")} disabled={!writable}>
            <option value="">No rating recorded</option>
            <option value="below">Below expectations</option>
            <option value="meeting">Meeting expectations</option>
            <option value="exceeding">Exceeding expectations</option>
          </Select>
        </Field>
        <Field label="Evidence and manager notes">
          <TextArea name="evidence" rows={5} disabled={!writable}
            defaultValue={existing?.summary ?? ""} />
        </Field>
      </PeopleDialogSection>
      <PeopleDialogSection step="03" title="Review accountability"
        description="Saving a draft does not submit it, acknowledge it or alter the person's employment.">
        {existing?.fields.aiAssisted === true && (
          <Notice tone="warning" title="AI-assisted content still needs human review">
            The AI-assisted marker remains until a reviewer explicitly confirms the evidence has been checked.
            Merely pressing Save does not clear it.
          </Notice>
        )}
        {existing?.fields.aiAssisted === true && (
          <Checkbox label="I have personally read, checked and taken responsibility for this review evidence"
            checked={humanReviewed} disabled={!writable}
            onChange={(event) => setHumanReviewed(event.target.checked)} />
        )}
        {!writable && <Notice tone="warning" title="Review editing is restricted">
          Use the native review submission or acknowledgement workflow. This existing record cannot be rewritten from this form.
        </Notice>}
        {error && <Notice tone="danger" title="Review not saved">{error}</Notice>}
      </PeopleDialogSection>
    </form>
  );
}

function Calibration({ context }: { context: ScreenContext }) {
  const data = useCollections(["reviews"]);
  const byReviewer = [...new Set(data.reviews.map((review) => String(review.fields.reviewer ?? "")))].filter(Boolean);
  return (
    <Stack gap={3}>
      {byReviewer.map((reviewer) => {
        const reviews = data.reviews.filter((review) => review.fields.reviewer === reviewer);
        return (
          <div key={reviewer} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}><strong className="ds-grow">{reviewer}</strong><span className="ds-subtle">{reviews.length} reviews</span></Row>
            <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
              {["exceeding", "meeting", "below", ""].map((rating) => {
                const count = reviews.filter((review) => String(review.fields.rating ?? "") === rating).length;
                return count > 0 ? <Pill key={rating || "unset"} tone={rating === "exceeding" ? "success" : rating === "below" ? "warning" : "neutral"}>{rating || "not set"} {count}</Pill> : null;
              })}
            </Row>
          </div>
        );
      })}
      <Notice tone="info" title="A distribution is a prompt, not a quota">
        Calibration exists so two managers mean the same thing by the same word. It is not a mechanism for forcing a spread,
        and {context.org.shortName} is too small for one to be meaningful.
      </Notice>
    </Stack>
  );
}

function CourseBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const raw = useRecord(payload?.id);
  const existing = scopedDetailRecord(raw, context.org.id, "courses");
  const [error, setError] = useState("");
  const canEdit = context.can("edit_knowledge");
  if (payload?.id && !existing) return (
    <Empty title="Selected course unavailable">
      The course was not found in this company. A broken edit link cannot create a replacement course.
    </Empty>
  );
  return (
    <form id="hr-course" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      setError("");
      if (!canEdit) { setError("This role cannot create or edit learning content."); return; }
      const form = new FormData(event.currentTarget);
      const title = String(form.get("title") ?? "").trim();
      const summary = String(form.get("summary") ?? "").trim();
      const rawMinutes = String(form.get("minutes") ?? "").trim();
      const minutes = Number(rawMinutes);
      if (title.length < 3) { setError("Enter a course title of at least three characters."); return; }
      if (!/^\d+$/.test(rawMinutes) || !Number.isInteger(minutes) || minutes < 5 || minutes > 600) {
        setError("Estimated duration must be a whole number between 5 and 600 minutes.");
        return;
      }
      const required = form.get("required") === "on";
      try {
        if (existing) {
          const saved = await context.mutate.patch(existing.id, {
            title, summary,
            fields: { ...existing.fields, minutes, required },
          }, { expectRevision: existing.revision, event: `Learning record ${existing.title} updated by ${context.actor}` });
          if (!saved) { setError("The course has changed. Reopen the latest record before saving."); return; }
        } else {
          await context.mutate.create({
            collection: "courses", title, status: "draft", summary,
            fields: { minutes, required, format: "Local course metadata — content not hosted" },
          }, `Draft course record created by ${context.actor}: ${title}`);
        }
        context.toast("Course record saved",
          "The local course metadata was saved. No lesson, video, learner completion or external publication was created.");
        close();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The course record could not be saved.");
      }
    }}>
      <PeopleDialogLead eyebrow="PEOPLE / LEARNING" title={existing ? "Refine the course record" : "Build a new learning record"}
        description="Define the subject, expected duration and required status. Actual teaching material and learner evidence must be supplied separately."
        status={<Pill tone={existing?.status === "published" ? "info" : "neutral"}>
          {existing?.status ?? "New draft"}
        </Pill>} />
      <PeopleDialogSection step="01" title="Course identity" description="A title that tells employees what they are expected to learn.">
        <Field label="Course title" required>
          <TextInput name="title" defaultValue={existing?.title ?? ""} required
            placeholder="e.g. Account access and security" disabled={!canEdit} />
        </Field>
        <Field label="What this course covers">
          <TextArea name="summary" rows={4} defaultValue={existing?.summary ?? ""}
            disabled={!canEdit} />
        </Field>
      </PeopleDialogSection>
      <PeopleDialogSection step="02" title="Duration and assignment" description="Keep an estimate distinct from confirmed learner progress.">
        <Field label="Estimated duration (minutes)" required hint="Whole minutes from 5 to 600.">
          <TextInput name="minutes" inputMode="numeric" required
            defaultValue={String(existing?.fields.minutes ?? 30)} disabled={!canEdit} />
        </Field>
        <Checkbox name="required" label="Mark as required — learners must still be assigned explicitly"
          defaultChecked={existing?.fields.required === true} disabled={!canEdit} />
        <Properties rows={[
          { label: "Recorded completions", value: existing?.fields.completions === undefined
            ? "Not recorded" : String(existing.fields.completions) },
          { label: "Hosted course content", value: "No hosting connection" },
        ]} />
      </PeopleDialogSection>
      <PeopleDialogSection step="03" title="Publication boundary"
        description="A course record does not imply lessons have been hosted, a quiz completed or a certificate issued.">
        <Notice tone="info" title="Saving does not complete or publish a learning module">
          This action stores company-scoped metadata. It does not change an existing completion count or generate a learner assignment.
        </Notice>
        {!canEdit && <Notice tone="warning" title="Role permission required">
          Your current role cannot edit learning content.
        </Notice>}
        {error && <Notice tone="danger" title="Course not saved">{error}</Notice>}
      </PeopleDialogSection>
    </form>
  );
}

function Quiz({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const raw = useRecord(payload?.id);
  const course = scopedDetailRecord(raw, context.org.id, "courses");
  const [access, setAccess] = useState("");
  const [reply, setReply] = useState("");
  const [checked, setChecked] = useState(false);
  if (payload?.id && !course) return (
    <Empty title="Selected course unavailable">Open a company course to preview a sample knowledge check.</Empty>
  );
  const complete = Boolean(access && reply);
  const correct = access === "named-approver" && reply === "human-draft";
  return (
    <Stack gap={4}>
      <PeopleDialogLead eyebrow="PEOPLE / LEARNING / PREVIEW" title="Preview the knowledge check"
        description={course ? `Sample assessment shown in the context of ${course.title}. These questions are not attached to the course content.`
          : "A sample knowledge check demonstrating the interaction, without a saved learner result."}
        status={<Pill tone="neutral">Preview only</Pill>} />
      <PeopleDialogSection step="01" title="Access accountability">
        <Field label="Who can approve a local access request?">
          <Select value={access} onChange={(event) => { setAccess(event.target.value); setChecked(false); }}>
            <option value="">Choose an answer</option>
            <option value="anyone">Anyone whose employment status changed</option>
            <option value="named-approver">A named approver on the request</option>
            <option value="ai">An AI employee that noticed a gap</option>
          </Select>
        </Field>
      </PeopleDialogSection>
      <PeopleDialogSection step="02" title="Communication control">
        <Field label="What may an AI employee do with a customer reply?">
          <Select value={reply} onChange={(event) => { setReply(event.target.value); setChecked(false); }}>
            <option value="">Choose an answer</option>
            <option value="send-now">Send when confident</option>
            <option value="human-draft">Draft for a person to review and send</option>
            <option value="follow-up">Send if the customer asks twice</option>
          </Select>
        </Field>
      </PeopleDialogSection>
      <PeopleDialogSection step="03" title="Check your selections"
        description="The result is shown here only; nothing is submitted to a learner record.">
        <Button variant="primary" disabled={!complete} onClick={() => setChecked(true)}>Check preview answers</Button>
        {checked && <Notice tone={correct ? "info" : "warning"} title={correct
          ? "Both sample answers are correct" : "Review the answer choices"}>
          {correct ? "The preview matches the sample access and communication rules."
            : "An access grant requires a named approver; an AI employee can draft but does not send an unchecked message."}
          {" "}This is not an assessed completion or certificate.
        </Notice>}
        <Notice tone="info" title="No completion is recorded">
          This preview has no linked assessment content or verified learner identity. Closing it will not alter course completions.
        </Notice>
      </PeopleDialogSection>
    </Stack>
  );
}

function PolicyPublication({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const policy = useRecord(payload?.id);
  if (!policy) return <Empty title="Select a policy" />;
  const current = String(policy.fields.version ?? "1.0");
  const next = `${Number(current.split(".")[0]) + 0}.${Number(current.split(".")[1] ?? 0) + 1}`;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Publishing version {next} of {policy.title} keeps version {current} on the record and starts the acknowledgement count again
        from zero. {String(policy.fields.acknowledged ?? 0)} acknowledgements of version {current} are preserved.
      </p>
      <Properties rows={[
        { label: "Current version", value: current },
        { label: "New version", value: next },
        { label: "Acknowledgements kept", value: `${String(policy.fields.acknowledged ?? 0)} against v${current}` },
        { label: "Acknowledgements needed again", value: policy.fields.acknowledgementRequired === true ? "Yes, from everyone employed" : "No" },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.patch(policy.id, {
              fields: { ...policy.fields, version: next, acknowledged: 0, supersedes: current },
            }, { expectRevision: policy.revision, event: `${policy.title} published as version ${next}, superseding ${current}` });
            context.toast("Revision published", `Version ${next} is live and version ${current} is kept in the history.`);
            close();
          }}
        >
          Publish version {next}
        </Button>
      </Row>
    </Stack>
  );
}
