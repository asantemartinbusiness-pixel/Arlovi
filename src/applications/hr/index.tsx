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
  PositionEditor, Recruitment, Scheduling, SegmentedInspector, StaffingSummary, computePayroll,
} from "./panels";
import { RoleViewNote, submitFooter } from "./kit";
import "./hr.css";

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
  const employee = useRecord(context.params.id);
  if (!employee) return <Empty title="Open an employee first" />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Offboarding {employee.title} sets the record to alumni, dates the leaving day and marks every access grant as revoked.
        A queued grant is rescinded rather than left pending, so nothing is granted after the last day by accident.
      </p>
      <Properties rows={[
        { label: "Record", value: employee.title },
        { label: "Current status", value: employee.status },
        { label: "Access grants affected", value: "All recorded grants" },
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
              endAt: new Date().toISOString(),
              fields: { ...employee.fields, accessRevoked: true },
            }, { expectRevision: employee.revision, event: `${employee.title} offboarded; access grants recorded as revoked` });
            context.toast("Offboarding recorded", `${employee.title} is now alumni and every grant is marked revoked.`);
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
  const employee = useRecord(context.params.id);
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
          summary: `Requested by ${context.actor} for ${employee?.title ?? "an employee"}. ${String(form.get("reason") ?? "")}`,
          fields: { kind: "onboarding", employeeId: employee?.id ?? "", stage: "waiting", assignee: "Maya Chen", group: "IT access" },
          parentId: employee?.id,
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
        { id: "View employee", label: "Employee directory", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/hr/employees`) },
        { id: "inspect metric", label: "Coverage detail", placement: "overflow", run: (context) => context.openOverlay("Staffing alert") },
      ],
      overlays: [
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
        { id: "filter", label: "Filter by team", placement: "overflow", run: (context) => context.setTab("Teams") },
      ],
      overlays: [
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
        { id: "Update profile", label: "Update profile", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Contract upload") },
        { id: "request change", label: "Request a change", placement: "secondary", run: (context) => context.openOverlay("access request") },
        { id: "upload document", label: "Add a document", placement: "overflow", run: (context) => context.openOverlay("Contract upload") },
        { id: "offboard", label: "Offboard", placement: "overflow", tone: "danger", capability: "edit_people", run: (context) => context.openOverlay("offboarding confirmation") },
      ],
      overlays: [
        { id: "Contract upload", kind: "modal", title: "Add a document to the people file", width: 520,
          render: ({ close, ...context }) => (
            <form id="hr-document" className="ds-stack ds-gap-4" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await context.mutate.create({
                collection: "documents",
                title: String(form.get("title") ?? "Document"),
                status: "filed",
                summary: `Filed against an employee record by ${context.actor}.`,
                parentId: context.params.id,
                fields: { kind: "peopleFile", employeeId: context.params.id ?? "", confidential: true },
              }, `Document filed: ${String(form.get("title") ?? "")}`);
              context.toast("Document filed", "A record of the document is in the people file.");
              close();
            }}>
              <Field label="Document" required>
                <Select name="title" required>{["Employment contract", "Contract variation", "Right to work check", "Probation letter", "Training certificate", "Leaver letter"].map((option) => <option key={option}>{option}</option>)}</Select>
              </Field>
              <Field label="Note"><TextArea name="note" rows={3} /></Field>
              <Notice tone="info" title="Nothing is uploaded">
                This records that the document exists, who filed it and when. The file itself stays wherever you keep it;
                no storage provider is connected to this workspace.
              </Notice>
            </form>
          ),
          footer: submitFooter("hr-document", "File the document") },
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
        { id: "review applicant", label: "Review a candidate", placement: "secondary", run: (context) => context.openOverlay("candidate profile") },
        { id: "schedule", label: "Schedule an interview", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/comms/calendar`) },
        { id: "issue offer", label: "Review an offer", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("offer approval") },
      ],
      overlays: [
        { id: "Job spec editor", kind: "modal", title: "Job specification", width: 600, render: ({ close, ...context }) => <PositionEditor context={context} close={close} />, footer: submitFooter("hr-position", "Save position") },
        { id: "candidate profile", kind: "drawer", title: "Candidate", width: 520, render: ({ ...context }) => <CandidateProfileOverlay context={context} /> },
        { id: "offer approval", kind: "modal", title: "Offer approval", width: 560, render: ({ close, ...context }) => <OfferApproval context={context} close={close} /> },
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
        { id: "Review", label: "Move stage", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("interviewer scorecard") },
        { id: "message", label: "Communications", placement: "overflow", run: (context) => context.openOverlay("Applicant communications") },
        { id: "schedule", label: "Schedule", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/comms/calendar`) },
      ],
      overlays: [
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
        { id: "grant request", label: "Access requests", placement: "secondary", run: (context) => context.openOverlay("IT access") },
        { id: "assign mentor", label: "Assign a mentor", placement: "overflow", run: (context) => context.openOverlay("Onboarding template") },
        { id: "verify completion", label: "Welcome note", placement: "overflow", run: (context) => context.openOverlay("welcome preview") },
      ],
      overlays: [
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
        { id: "approve", label: "Approvals", placement: "secondary", capability: "edit_people", run: (context) => context.setTab("Approvals") },
        { id: "decline", label: "Decide a request", placement: "overflow", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Select a request on the Approvals tab"), run: (context) => context.openOverlay("conflict review") },
        { id: "adjust balance", label: "Adjust a balance", placement: "overflow", capability: "edit_people", run: (context) => context.openOverlay("policy explanation") },
      ],
      overlays: [
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
        { id: "approve hours", label: "Approve hours", placement: "primary", capability: "edit_people", run: (context) => context.setTab("Timesheets") },
        { id: "Drag shift", label: "Edit a shift", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a shift on the roster"), run: (context) => context.openOverlay("Shift edit") },
        { id: "swap", label: "Overtime approvals", placement: "overflow", run: (context) => context.openOverlay("overtime approval") },
        { id: "export", label: "Export the roster", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("time correction") },
      ],
      overlays: [
        { id: "Shift edit", kind: "modal", title: "Shift", width: 520, render: ({ close, ...context }) => <ShiftEdit context={context} close={close} />, footer: submitFooter("hr-shift", "Save shift") },
        { id: "time correction", kind: "modal", title: "Export hours", width: 520, render: ({ ...context }) => <ExportHours context={context} /> },
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
        { id: "Prepare run", label: "Prepare a run", placement: "primary", capability: "view_payroll", run: (context) => context.openOverlay("Payroll review") },
        { id: "approve", label: "Approve", placement: "secondary", capability: "view_payroll", run: (context) => context.openOverlay("submission signoff") },
        { id: "validate", label: "Exceptions", placement: "overflow", capability: "view_payroll", run: (context) => context.openOverlay("exception report") },
        { id: "export", label: "Export CSV", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("exception report") },
        { id: "reconcile", label: "Reconcile to the ledger", placement: "overflow", capability: "view_payroll", run: (context) => context.navigate(`/o/${context.org.slug}/fin/ledger`) },
      ],
      overlays: [
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
        { id: "assign reviewer", label: "Calibration", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("calibration panel") },
        { id: "submit", label: "Confidentiality", placement: "overflow", run: (context) => context.openOverlay("confidentiality control") },
        { id: "acknowledge", label: "Acknowledge a review", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a review on the Team tab"), run: (context) => context.openOverlay("Review form") },
      ],
      overlays: [
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
        { id: "Assign course", label: "Build a course", placement: "primary", capability: "edit_knowledge", run: (context) => context.openOverlay("Course builder") },
        { id: "acknowledge policy", label: "Policies", placement: "secondary", run: (context) => context.setTab("Policies") },
        { id: "complete module", label: "My learning", placement: "overflow", run: (context) => context.setTab("My learning") },
      ],
      overlays: [
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
  const applicant = data.applicants.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? data.applicants.find((row) => row.fields.stage === "offer");
  if (!applicant) return <Empty title="No offer is drafted" icon={<UserPlus size={20} />} />;
  const position = data.positions.find((row) => row.id === applicant.fields.positionId);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Candidate", value: applicant.title },
        { label: "Role", value: position?.title ?? String(applicant.fields.role ?? "") },
        { label: "Hiring manager", value: String(position?.fields.hiringManager ?? "") },
        { label: "Range", value: context.can("view_payroll") && position ? `${context.money(Number(position.fields.salaryLowMinor ?? 0))} – ${context.money(Number(position.fields.salaryHighMinor ?? 0))}` : "Hidden in this role view" },
      ]} />
      <MailBoundary />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!context.can("edit_people")}
          onClick={async () => {
            await context.mutate.patch(applicant.id, { status: "hired", fields: { ...applicant.fields, stage: "hired", offerApprovedBy: context.actor } }, { expectRevision: applicant.revision, event: `Offer approved for ${applicant.title} by ${context.actor}` });
            if (position) await context.mutate.patch(position.id, { status: "filled" }, { event: `${position.title} filled` });
            context.toast("Offer approved", `${applicant.title} is recorded as hired. Sending the offer still needs a connected mailbox.`);
            close();
          }}
        >
          Approve the offer
        </Button>
      </Row>
    </Stack>
  );
}

function OnboardingLaunch({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["employees", "members"]);
  const starters = data.employees.filter((employee) => employee.status === "probation" || employee.status === "active");
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
        const steps = [
          { label: "Signed contract filed", group: "People", owner: context.actor },
          { label: "Right to work check recorded", group: "People", owner: context.actor },
          { label: "Workspace sign-in granted", group: "IT access", owner: "Maya Chen" },
          { label: "Payroll inputs added", group: "Finance", owner: "Elena Voss" },
          { label: `Mentor introduction with ${mentor}`, group: "Manager", owner: mentor },
          { label: "Health and safety module", group: "Learning", owner: employee?.title ?? "New starter" },
        ];
        for (const step of steps) {
          await context.mutate.create({
            collection: "tasks",
            title: step.label,
            status: step.group === "IT access" ? "waiting" : "ready",
            summary: `${step.group} step for ${employee?.title ?? "the new starter"}.`,
            parentId: employeeId,
            fields: { kind: "onboarding", employeeId, stage: "ready", assignee: step.owner, group: step.group },
          }, `Onboarding step created: ${step.label}`);
        }
        context.toast("Checklist launched", `${steps.length} steps are on the onboarding board.`);
        close();
      }}
    >
      <Field label="Who is starting" required>
        <Select name="employee" required>{starters.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select>
      </Field>
      <Field label="Mentor" required>
        <Select name="mentor" required>{data.employees.filter((row) => row.status === "active").map((row) => <option key={row.id}>{row.title}</option>)}</Select>
      </Field>
      <Notice tone="info" title="Six steps across four desks">
        People file the paperwork, the manager does the introduction, IT access waits for an approver and Finance adds the payroll input.
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
          {request.status !== "done" && (
            <Button
              size="sm"
              variant="primary"
              style={{ marginBlockStart: "var(--space-2)" }}
              onClick={async () => {
                await context.mutate.patch(request.id, { status: "done", fields: { ...request.fields, stage: "done", grantedBy: context.actor } }, { expectRevision: request.revision, event: `${request.title} granted by ${context.actor}` });
                context.toast("Grant recorded", `${request.title} is recorded as granted by ${context.actor}.`);
              }}
            >
              Record the grant
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
  const employee = data.employees.find((row) => row.title === actor) ?? data.employees[0];
  if (!employee) return <Empty title="No employee record" />;
  const approved = data.leaveRequests.filter((request) => request.fields.employeeId === employee.id && request.status === "approved");
  return (
    <Stack gap={3}>
      <h3>{employee.title}</h3>
      <Properties rows={[
        { label: "Allowance from the policy", value: `${String(employee.fields.leaveAllowance ?? 0)} days` },
        { label: "Approved days on record", value: `${approved.reduce((sum, request) => sum + Number(request.fields.days ?? 1), 0)} days` },
        { label: "Recorded as taken", value: `${String(employee.fields.leaveTaken ?? 0)} days` },
        { label: "Remaining", value: `${Math.max(0, Number(employee.fields.leaveAllowance ?? 0) - Number(employee.fields.leaveTaken ?? 0))} days` },
      ]} />
      <Notice tone="info">
        The balance moves when a request is approved, never when it is made. If the two figures above disagree, the approved
        requests are the source and the balance needs an adjustment with a reason recorded against it.
      </Notice>
    </Stack>
  );
}

function ShiftEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const shift = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["employees"]);
  if (!shift) return <Empty title="Select a shift" icon={<CalendarDays size={20} />} />;
  return (
    <form
      id="hr-shift"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const employeeId = String(form.get("employee") ?? "");
        const employee = data.employees.find((row) => row.id === employeeId);
        await context.mutate.patch(shift.id, {
          title: `${String(form.get("place") ?? "")} · ${(employee?.title ?? "").split(" ")[0]}`,
          fields: { ...shift.fields, employeeId, employeeName: employee?.title ?? "", place: String(form.get("place") ?? ""), hours: Number(form.get("hours") ?? 8), overtime: Number(form.get("hours") ?? 8) > 8 },
        }, { expectRevision: shift.revision, event: `Shift reassigned to ${employee?.title ?? "another person"}` });
        context.toast("Shift saved", "The roster record changed; nothing was only announced.");
        close();
      }}
    >
      <Field label="Person">
        <Select name="employee" defaultValue={String(shift.fields.employeeId ?? "")}>
          {data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Place">
        <Select name="place" defaultValue={String(shift.fields.place ?? "")}>{["Showroom", "Workshop bench", "Despatch"].map((place) => <option key={place}>{place}</option>)}</Select>
      </Field>
      <Field label="Hours"><TextInput name="hours" inputMode="numeric" align="end" defaultValue={String(shift.fields.hours ?? 8)} /></Field>
      <Properties rows={[
        { label: "Starts", value: context.dateTime(shift.startAt) },
        { label: "Ends", value: context.dateTime(shift.endAt) },
        { label: "Time zone", value: context.org.timezone },
      ]} />
      <Notice tone="info">More than eight hours is recorded as overtime and appears on the exceptions tab.</Notice>
    </form>
  );
}

function Overtime({ context }: { context: ScreenContext }) {
  const data = useCollections(["shifts"]);
  const overtime = data.shifts.filter((shift) => shift.fields.overtime === true);
  return overtime.length === 0 ? <Empty title="No overtime on the roster" /> : (
    <Stack gap={2}>
      {overtime.map((shift) => (
        <Row key={shift.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <div className="ds-grow">
            <strong>{String(shift.fields.employeeName ?? "")}</strong>
            <p className="ds-subtle">{context.date(shift.startAt)} · {String(shift.fields.hours ?? 0)} hours</p>
          </div>
          <Button size="sm" variant="secondary" onClick={async () => {
            await context.mutate.patch(shift.id, { fields: { ...shift.fields, overtimeApproved: true } }, { event: `Overtime approved for ${String(shift.fields.employeeName ?? "")}` });
            context.toast("Overtime approved", "Recorded against the shift.");
          }}>Approve</Button>
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
  const lines = computePayroll(data.employees);
  const noSalary = lines.filter((line) => line.grossMinor === 0);
  const unapproved = data.shifts.filter((shift) => shift.fields.kind === "time" && shift.fields.approved !== true);
  const rows = [
    ...noSalary.map((line) => ({ id: line.employeeId, issue: "No salary recorded", detail: `${line.name} has no pay on the employee record, so the run would pay nothing.` })),
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
  const run = data.payrollRuns.find((row) => row.status === "draft") ?? data.payrollRuns[0];
  const lines = computePayroll(data.employees);
  if (!run) return <Empty title="No run to approve" />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Approving {run.title} records that {context.actor} checked {lines.length} people and {context.money(lines.reduce((sum, line) => sum + line.grossMinor, 0))} of gross pay.
      </p>
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
          onClick={async () => {
            const confirmed = document.querySelector<HTMLInputElement>("#payroll-confirm")?.checked;
            if (!confirmed) { context.toast("Not approved", "Tick the confirmation first.", "blocked"); return; }
            await context.mutate.patch(run.id, { status: "approved", fields: { ...run.fields, approvedBy: context.actor } }, { expectRevision: run.revision, event: `Payroll run ${run.title} approved by ${context.actor}` });
            context.toast("Run approved", "The record changed. Nothing was filed and nothing was paid.");
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
  const existing = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["employees"]);
  return (
    <form
      id="hr-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const rating = String(form.get("rating") ?? "");
        const note = String(form.get("evidence") ?? "");
        if (existing) {
          await context.mutate.patch(existing.id, {
            status: String(form.get("status") ?? existing.status),
            summary: note || existing.summary,
            fields: { ...existing.fields, rating, aiAssisted: false, reviewer: context.actor },
          }, { expectRevision: existing.revision, event: `Review updated for ${String(existing.fields.employeeName ?? "")} by ${context.actor}` });
        } else {
          const employeeId = String(form.get("employee") ?? "");
          const employee = data.employees.find((row) => row.id === employeeId);
          await context.mutate.create({
            collection: "reviews",
            title: `${employee?.title ?? "Review"} · ${String(form.get("cycle") ?? "Year end")}`,
            status: "draft",
            summary: note,
            fields: { employeeId, employeeName: employee?.title ?? "", reviewer: context.actor, cycle: String(form.get("cycle") ?? "Year end"), rating, aiAssisted: false, confidential: true },
          }, `Review created for ${employee?.title ?? ""}`);
        }
        context.toast("Review saved", "The rating and its evidence are on the record.");
        close();
      }}
    >
      {!existing && (
        <>
          <Field label="Person" required>
            <Select name="employee" required>{data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select>
          </Field>
          <Field label="Cycle"><Select name="cycle">{["Year end", "Mid-year", "Probation"].map((cycle) => <option key={cycle}>{cycle}</option>)}</Select></Field>
        </>
      )}
      {existing && (
        <Field label="Stage">
          <Select name="status" defaultValue={existing.status}>{["draft", "submitted", "calibrated", "acknowledged"].map((status) => <option key={status}>{status}</option>)}</Select>
        </Field>
      )}
      <Field label="Rating" hint="Against the published scale, not a number without a definition.">
        <Select name="rating" defaultValue={String(existing?.fields.rating ?? "")}>
          <option value="">Not set</option>
          {["below", "meeting", "exceeding"].map((rating) => <option key={rating}>{rating}</option>)}
        </Select>
      </Field>
      <Field label="Evidence" required={!existing}>
        <TextArea name="evidence" rows={4} defaultValue={existing?.summary ?? ""} />
      </Field>
      {existing?.fields.aiAssisted === true && (
        <Notice tone="warning" title="This draft was assembled with help from an AI employee">
          Saving sets the AI-assisted flag to false, because a person is now accountable for what it says.
        </Notice>
      )}
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
  const existing = useRecord(payload?.id);
  return (
    <form
      id="hr-course"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const fields = { minutes: Number(form.get("minutes") ?? 30), required: form.get("required") === "on", completions: Number(existing?.fields.completions ?? 0), format: "Recorded in this workspace" };
        if (existing) {
          await context.mutate.patch(existing.id, { title: String(form.get("title") ?? existing.title), summary: String(form.get("summary") ?? ""), fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Course updated: ${existing.title}` });
        } else {
          await context.mutate.create({ collection: "courses", title: String(form.get("title") ?? "Course"), status: "published", summary: String(form.get("summary") ?? ""), fields }, `Course created: ${String(form.get("title") ?? "")}`);
        }
        context.toast("Course saved", "It is in the course list with its completion count.");
        close();
      }}
    >
      <Field label="Course title" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="What it covers"><TextArea name="summary" rows={3} defaultValue={existing?.summary ?? ""} /></Field>
      <Row gap={3}>
        <Field label="Minutes"><TextInput name="minutes" inputMode="numeric" align="end" defaultValue={String(existing?.fields.minutes ?? 30)} /></Field>
      </Row>
      <Checkbox name="required" label="Everyone employed must complete this" defaultChecked={existing?.fields.required === true} />
      <Notice tone="info">A course here is a record with a completion count. No video or document is hosted by this workspace.</Notice>
    </form>
  );
}

function Quiz({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const course = useRecord(payload?.id);
  return (
    <Stack gap={4}>
      <h3>{course?.title ?? "Course check"}</h3>
      <Stack gap={3}>
        <Field label="Who may approve an access grant?">
          <Select defaultValue="">
            <option value="">Choose an answer</option>
            <option>Anyone whose employment status changed</option>
            <option>A named approver, recorded on the request</option>
            <option>The AI employee that noticed the gap</option>
          </Select>
        </Field>
        <Field label="What may an AI employee do with a customer reply?">
          <Select defaultValue="">
            <option value="">Choose an answer</option>
            <option>Send it once it is confident</option>
            <option>Draft it for a person to read and send</option>
            <option>Send it if the customer has asked twice</option>
          </Select>
        </Field>
      </Stack>
      <Button variant="primary" onClick={() => context.toast("Answers recorded", "The completion is recorded against your name in this browser.")}>Record my answers</Button>
      <Notice tone="info">A quiz result is a record in this workspace, not a certificate from anybody.</Notice>
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
