import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useState } from "react";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { Button, Checkbox, Empty, Field, ModalActions, Notice, OverlayActions, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { computePayroll } from "./panels";
import { RoleViewNote, leaveBalance } from "./kit";
import { recordAcknowledgement, setDirectoryTeam, useDirectoryTeam } from "./shared";
import { scopedDetailRecord } from "@/platform/recordScope";
import { csvCell, planHireApplicant, planLeaveDecision } from "./decisions";
import { knownRecord, newRecord } from "@/platform/repo";
import { planShiftSwap, planTimesheetApprovals } from "./workforce";
import { PeopleDialogLead, PeopleDialogSection } from "./dialogs";
export { MyLearning, recordAcknowledgement, setDirectoryTeam, useDirectoryTeam } from "./shared";
import { Boundary, askFirst, boundaryText, logBoundary, pickRecord, recordOf } from "./opsKit";

/* ------------------------------------------------------------------ *
 * Contract actions for the People module that change records.
 * ------------------------------------------------------------------ */

const live = (row: Rec) => row.status !== "alumni";

/* ---------------- ARL-HR-001 · View employee / inspect metric ---------------- */

export function viewEmployee(context: ScreenContext): void {
  pickRecord(context, {
    title: "View an employee",
    collection: "employees",
    filter: live,
    describe: (row) => `${String(row.fields.title ?? "")} · ${String(row.fields.office ?? "")}`,
    pickLabel: "View",
    onPick: (row) => context.navigate(`/o/${context.org.slug}/hr/employees/${row.id}`),
  });
}

/** Counts smaller than three are shown as a range so one person cannot be identified. */
function privateCount(count: number): string {
  return count > 0 && count < 3 ? "fewer than 3" : String(count);
}

export function MetricDetail({ context }: { context: ScreenContext }) {
  const data = useCollections(["employees", "members", "leaveRequests", "positions", "applicants", "tasks"]);
  const staff = data.employees.filter((row) => live(row) && row.fields.employment !== "contractor");
  const metrics = [
    { metric: "People employed", value: String(staff.length), source: "employees, status not alumni, not contractor", rule: "Headcount is not sensitive; shown exactly." },
    { metric: "AI employees", value: String(data.members.filter((row) => row.fields.kind === "ai").length), source: "members where kind = ai", rule: "Counted apart from people; never a headcount line." },
    { metric: "Leave waiting", value: privateCount(data.leaveRequests.filter((row) => row.status === "requested").length), source: "leaveRequests, status requested", rule: "Leave type and reason are never aggregated; small counts become a range." },
    { metric: "Open roles", value: String(data.positions.filter((row) => row.status === "open").length), source: "positions, status open", rule: "Not personal data; shown exactly." },
    { metric: "Live candidates", value: privateCount(data.applicants.filter((row) => !["rejected", "withdrawn"].includes(row.status)).length), source: "applicants not rejected or withdrawn", rule: "Applicant counts below three become a range." },
    { metric: "Onboarding steps open", value: String(data.tasks.filter((row) => row.fields.kind === "onboarding" && row.status !== "done").length), source: "tasks where kind = onboarding", rule: "Steps, not people; shown exactly." },
  ];
  return (
    <Stack gap={3}>
      {metrics.map((row) => (
        <div key={row.metric} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}><strong className="ds-grow">{row.metric}</strong><span className="ds-num">{row.value}</span></Row>
          <Properties rows={[{ label: "Source", value: row.source }, { label: "Privacy rule", value: row.rule }]} />
        </div>
      ))}
      <Notice tone="info" title="Aggregated by the privacy policy">
        Pay, absence reasons and personal detail never appear in an aggregate. Every figure is a count of records in this browser in {context.org.shortName}.
      </Notice>
    </Stack>
  );
}

/* ---------------- ARL-HR-002 · filter ---------------- */

export function DirectoryFilter({ context, close }: { context: ScreenContext; close: () => void }) {
  const departments = useCollection("departments");
  const current = useDirectoryTeam();
  const [value, setValue] = useState(current);
  return (
    <Stack gap={4}>
      <Field label="Team">
        <Select value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">Every team</option>
          {departments.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <ModalActions><OverlayActions variant="confirm" end={<Button variant="ghost" onClick={close}>Cancel</Button>} primary={<Button variant="primary" onClick={() => {
          setDirectoryTeam(value);
          if (context.tab === "Teams") context.setTab("People");
          close();
        }}>Apply the filter</Button>} /></ModalActions>
    </Stack>
  );
}

/* ---------------- ARL-HR-003 · Update profile ---------------- */

export function ProfileEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const candidate = useRecord(context.params.id);
  const employee = scopedDetailRecord(candidate, context.org.id, "employees");
  const data = useCollections(["departments", "employees"]);
  const draftScope = `people:employee-profile:${context.org.id}:${context.actor}:${context.params.id ?? "none"}`;
  const [draftTitle, setTitle] = useWorkingField<string | undefined>(draftScope, "title", undefined);
  const [draftDepartment, setDepartment] = useWorkingField<string | undefined>(draftScope, "department", undefined);
  const [draftManager, setManager] = useWorkingField<string | undefined>(draftScope, "manager", undefined);
  const [draftOffice, setOffice] = useWorkingField<string | undefined>(draftScope, "office", undefined);
  const [draftPhone, setPhone] = useWorkingField<string | undefined>(draftScope, "phone", undefined);
  const title = draftTitle ?? String(employee?.fields.title ?? "");
  const department = draftDepartment ?? String(employee?.fields.departmentId ?? "");
  const manager = draftManager ?? String(employee?.fields.manager ?? "");
  const office = draftOffice ?? String(employee?.fields.office ?? "");
  const phone = draftPhone ?? String(employee?.fields.phone ?? "");
  if (!employee) return <Empty title="Employee unavailable">Open an employee from the directory before editing.</Empty>;
  return (
    <form
      id="hr-profile"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await context.mutate.patch(employee.id, {
          fields: {
            ...employee.fields,
            title, departmentId: department, manager, office, phone,
          },
        }, { expectRevision: employee.revision, event: `Profile of ${employee.title} updated by ${context.actor}` });
        if (!saved) return;
        clearWorkingDraft(draftScope);
        context.toast("Profile updated", `${employee.title}'s record changed; the previous version is kept in its history.`);
        close();
      }}
    >
      <Field label="Job title" required><TextInput name="title" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Department">
        <Select name="department" value={department} onChange={(event) => setDepartment(event.target.value)}>
          {data.departments.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Manager">
        <Select name="manager" value={manager} onChange={(event) => setManager(event.target.value)}>
          {data.employees.filter((row) => live(row) && row.id !== employee.id).map((row) => <option key={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Office"><TextInput name="office" value={office} onChange={(event) => setOffice(event.target.value)} /></Field>
      <Field label="Work phone" hint="Personal contact detail is not offered to AI retrieval."><TextInput name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
      <Row gap={2}>
        <WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard changes</Button>
      </Row>
    </form>
  );
}

/** Edge (ARL-HR-003): queued access grants are rescinded, not left pending. */
export async function rescindQueuedGrants(context: ScreenContext, employeeId: string, tasks: Rec[]): Promise<number> {
  const queued = tasks.filter((task) => task.fields.employeeId === employeeId && task.fields.group === "IT access" && task.status !== "done" && task.status !== "rescinded");
  for (const task of queued) {
    await context.mutate.patch(task.id, { status: "rescinded", fields: { ...task.fields, stage: "rescinded", rescindedBy: context.actor } }, { event: `Queued grant rescinded on offboarding: ${task.title}` });
  }
  return queued.length;
}

/* ---------------- ARL-HR-004 / 005 · schedule an interview ---------------- */

export function ScheduleInterview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCollections(["applicants", "employees", "meetings"]);
  const { now } = useWorkspace();
  const [applicantId, setApplicantId] = useState(payload?.id ?? context.params.id ?? "");
  const [date, setDate] = useState(addDays(now, 2).toISOString().slice(0, 10));
  const [start, setStart] = useState("10:00");
  const [minutes, setMinutes] = useState(45);
  const [interviewer, setInterviewer] = useState(context.actor);
  const open = data.applicants.filter((row) => !["rejected", "withdrawn", "hired"].includes(row.status));
  const applicant = data.applicants.find((row) => row.id === applicantId);
  const startAt = new Date(`${date}T${start}:00.000Z`);
  const endAt = new Date(startAt.getTime() + minutes * 60_000);
  const clashes = data.meetings.filter((meeting) => meeting.startAt && meeting.endAt
    && new Date(meeting.startAt) < endAt && new Date(meeting.endAt) > startAt
    && String(meeting.fields.attendees ?? "").includes(interviewer));
  const past = startAt < now;
  return (
    <form
      id="hr-interview"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const reviewer = data.employees.find((employee) => employee.title === interviewer
          && employee.organizationId === context.org.id && !["alumni", "terminated"].includes(employee.status));
        if (!applicant || applicant.organizationId !== context.org.id || !open.some((row) => row.id === applicant.id)
          || past || Number.isNaN(startAt.getTime()) || !Number.isInteger(minutes) || minutes < 15 || minutes > 180
          || !reviewer) {
          context.toast("Interview not recorded", "Select an active applicant, company interviewer and future date with a 15–180 minute duration.", "blocked");
          return;
        }
        const stamp = clockIso();
        const meeting = newRecord({
          organizationId: context.org.id, currency: context.org.currency, collection: "meetings",
          title: `Interview · ${applicant.title}`,
          status: clashes.length ? "tentative" : "scheduled",
          summary: `Local interview record for ${String(applicant.fields.role || "the role")}. Reviewer: ${interviewer}.`,
          startAt: startAt.toISOString(), endAt: endAt.toISOString(), at: startAt.toISOString(),
          parentId: applicant.id,
          fields: { where: "Studio table", organizer: context.actor,
            attendees: [interviewer, context.actor].filter((name, index, all) => all.indexOf(name) === index).join(","),
            minutes, kind: "interview", applicantId: applicant.id, conferencing: "not_connected", accepted: 0 },
        }, { actor: context.actor, now: stamp });
        const revised: Rec = {
          ...applicant, revision: applicant.revision + 1, updatedAt: stamp, updatedBy: context.actor,
          fields: { ...applicant.fields, stage: "interview", interviewAt: startAt.toISOString(), interviewId: meeting.id },
          history: [{
            title: applicant.title, status: applicant.status, summary: applicant.summary,
            fields: { ...applicant.fields }, body: applicant.body,
            amountMinor: applicant.amountMinor, at: stamp,
          }, ...applicant.history].slice(0, 25),
        };
        try {
          await context.mutate.putMany([meeting, revised],
            [`Interview with ${applicant.title} recorded by ${context.actor}`,
              `${applicant.title} linked to the local interview by ${context.actor}`],
            { [applicant.id]: applicant.revision }, ["create", "update"]);
          await logBoundary(context, "calendar.sync",
            `Interview invitation for ${applicant.title} kept locally`, meeting.id);
          context.toast("Interview recorded locally",
            `${context.dateTime(startAt)} is stored${clashes.length ? " tentatively because of a conflict" : ""}. No external calendar or invitation was updated.`);
          close();
        } catch (error) {
          context.toast("Interview not saved", error instanceof Error
            ? error.message : "Reload the candidate and check the schedule before trying again.", "blocked");
        }
      }}
    >
      <Field label="Candidate" required>
        <Select value={applicantId} onChange={(event) => setApplicantId(event.target.value)} required>
          <option value="">Choose a candidate</option>
          {open.map((row) => <option key={row.id} value={row.id}>{row.title} · {String(row.fields.role ?? "")}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="Date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} invalid={past} /></Field>
        <Field label="Start (UTC)"><TextInput type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Minutes"><TextInput inputMode="numeric" align="end" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value))} /></Field>
      </Row>
      <Field label="Interviewer">
        <Select value={interviewer} onChange={(event) => setInterviewer(event.target.value)}>
          {data.employees.filter(live).map((row) => <option key={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {past && <Notice tone="danger" title="That time has passed">Choose a time after now.</Notice>}
      {clashes.length > 0 && <Notice tone="warning" title="The interviewer is busy">{clashes.map((row) => `${row.title} at ${context.dateTime(row.startAt)}`).join("; ")}. It will be saved as tentative.</Notice>}
      <Boundary id="calendar.sync" />
    </form>
  );
}

/* ---------------- ARL-HR-005 · Review (stage decision) ---------------- */

const STAGES = ["applied", "screen", "interview", "offer", "hired", "rejected"];

export function StageDecision({ context, close }: { context: ScreenContext; close: () => void }) {
  const candidate = useRecord(context.params.id ?? context.selectedId);
  const applicant = scopedDetailRecord(candidate, context.org.id, "applicants");
  const employees = useCollection("employees");
  const [stage, setStage] = useState("");
  const [reason, setReason] = useState("");
  const [acceptanceEvidence, setAcceptanceEvidence] = useState("");
  if (!applicant) return <Empty title="Candidate unavailable">Open a valid candidate record before recording a hiring decision.</Empty>;
  const scored = applicant.fields.rating !== undefined && Number(applicant.fields.rating) > 0;
  const needsScore = (stage === "offer" || stage === "rejected") && !scored;
  const offerIssued = applicant.fields.offerIssuedBy !== undefined && String(applicant.fields.offerIssuedBy) !== "";
  const needsOffer = stage === "hired" && !offerIssued;
  const email = String(applicant.fields.email ?? "").trim().toLowerCase();
  const matching = employees.filter((row) =>
    row.fields.applicantId === applicant.id ||
    (email !== "" && String(row.fields.email ?? "").trim().toLowerCase() === email));
  const existing = matching.length === 1 ? matching[0] : undefined;
  return (
    <form
      id="hr-stage"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stage || !reason.trim() || needsScore || needsOffer) return;
        const at = context.now.toISOString();
        if (stage === "hired") {
          try {
            const plan = planHireApplicant({
              organizationId: context.org.id, currency: context.org.currency,
              actor: context.actor, now: at,
            }, applicant, employees, reason, acceptanceEvidence);
            await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
            context.toast("Hiring recorded", existing
              ? "The accepted application is linked to the existing employee record. No invitation was sent."
              : "The accepted application and new employee were saved together. No invitation was sent.");
            close();
          } catch (error) {
            context.toast("Hiring not recorded", error instanceof Error ? error.message : "The records changed. Reload and try again.", "blocked");
          }
          return;
        }
        const updated = await context.mutate.patch(applicant.id, {
          status: stage === "rejected" ? "rejected" : applicant.status === "rejected" ? "active" : applicant.status,
          fields: { ...applicant.fields, stage, decidedBy: context.actor, decisionReason: reason.trim(), decidedAt: at },
        }, { expectRevision: applicant.revision, event: `${applicant.title} moved to ${stage} by ${context.actor}: ${reason.trim()}` });
        if (!updated) return;
        context.toast("Decision recorded", `${applicant.title} is at ${stage}, decided by ${context.actor} with a reason on the record.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Current stage", value: String(applicant.fields.stage ?? applicant.status) },
        { label: "Scorecard", value: scored ? `${String(applicant.fields.rating)} of 5` : "None recorded" },
        { label: "Offer", value: offerIssued ? `Issued by ${String(applicant.fields.offerIssuedBy)}` : "Not issued" },
        { label: "Accountable", value: context.actor },
      ]} />
      <Field label="Move to" required>
        <Select value={stage} onChange={(event) => setStage(event.target.value)} required>
          <option value="">Choose a stage</option>
          {STAGES.filter((option) => option !== applicant.fields.stage).map((option) => <option key={option} value={option}>{option === "hired" ? "hired (offer accepted)" : option}</option>)}
        </Select>
      </Field>
      <Field label="Reason, against the role requirements" required hint="Not an impression. Protected characteristics are never a reason.">
        <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} required />
      </Field>
      {needsScore && <Notice tone="danger" title="A scorecard comes first">An offer or a rejection needs a recorded scorecard so the decision rests on evidence.</Notice>}
      {needsOffer && <Notice tone="danger" title="No offer has been issued">A candidate is hired only after an issued offer is accepted. Issue the offer from Recruitment first.</Notice>}
      {stage === "hired" && !needsOffer && (
        <Stack gap={2}>
          <Field label="Evidence that the candidate accepted" required hint="Record how the acceptance was confirmed, for example a dated reply or a signed offer kept separately. No message or contract is sent.">
            <TextArea rows={3} value={acceptanceEvidence} onChange={(event) => setAcceptanceEvidence(event.target.value)} required />
          </Field>
          <Notice tone="info" title="Manual evidence is required">
            {matching.length > 1
              ? "Multiple employees match this candidate. Resolve the duplicate before hiring."
              : existing
                ? "The matching employee will be linked only if its identity is consistent."
                : "The applicant and new employee are created together in a single revision-checked local transaction."}
            This records the evidence supplied by a person; Arlovi does not independently verify acceptance.
          </Notice>
        </Stack>
      )}
      <Notice tone="info" title="A person decides">Nothing ranks or moves candidates automatically. The decision is attributed to {context.actor}.</Notice>
    </form>
  );
}

export function ApplicantMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const candidate = useRecord(context.params.id ?? context.selectedId);
  const applicant = scopedDetailRecord(candidate, context.org.id, "applicants");
  const thread = useCollection("emailThreads").filter((row) => row.parentId === applicant?.id);
  if (!applicant) return <Empty title="Candidate unavailable">Open a valid candidate before drafting a message.</Empty>;
  const consent = String(applicant.fields.consentUntil ?? applicant.fields.retainUntil ?? "");
  const lapsed = consent !== "" && new Date(consent) < context.now;
  return (
    <form
      id="hr-applicant-message"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lapsed) return;
        const form = new FormData(event.currentTarget);
        const subject = String(form.get("subject") ?? "");
        const created = await context.mutate.create({
          collection: "emailThreads",
          title: subject,
          status: "draft",
          summary: String(form.get("body") ?? ""),
          parentId: applicant.id,
          fields: { to: String(applicant.fields.email ?? applicant.title), from: context.actor, folder: "drafts", kind: "applicant", delivery: "queued_local" },
        }, `Message to ${applicant.title} drafted by ${context.actor}`);
        await logBoundary(context, "email.send", `Message to ${applicant.title} queued locally`, created.id);
        context.toast("Message kept as a draft", boundaryText("email.send"));
        close();
      }}
    >
      <Properties rows={[
        { label: "To", value: String(applicant.fields.email ?? applicant.title) },
        { label: "Consent to hold data", value: consent ? `${lapsed ? "Lapsed" : "Until"} ${context.date(consent)}` : "Not recorded" },
        { label: "Earlier messages", value: thread.length ? `${thread.length} kept here` : "None" },
      ]} />
      {lapsed && <Notice tone="danger" title="Consent has lapsed">Do not contact this applicant until consent is renewed; their data is due for deletion.</Notice>}
      <Field label="Subject" required><TextInput name="subject" required defaultValue={`Your application for ${String(applicant.fields.role ?? "the role")}`} /></Field>
      <Field label="Message" required><TextArea name="body" rows={5} required /></Field>
      <Boundary id="email.send" />
    </form>
  );
}

/* ---------------- ARL-HR-006 · assign mentor / verify completion ---------------- */

export function MentorAssign({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["employees", "tasks"]);
  const starterIds = [...new Set(data.tasks.filter((task) => task.fields.kind === "onboarding").map((task) => String(task.fields.employeeId)))];
  const starters = data.employees.filter((row) => starterIds.includes(row.id));
  const [starterIdRaw, setStarterId] = useState<string | null>(null);
  const starterId = starterIdRaw ?? (starters[0]?.id ?? "");
  const starter = data.employees.find((row) => row.id === starterId);
  return (
    <form
      id="hr-mentor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const mentor = String(new FormData(event.currentTarget).get("mentor") ?? "");
        if (!starter || !mentor) return;
        await context.mutate.patch(starter.id, { fields: { ...starter.fields, mentor } }, { expectRevision: starter.revision, event: `${mentor} assigned as mentor to ${starter.title} by ${context.actor}` });
        const intro = data.tasks.find((task) => task.fields.employeeId === starter.id && task.title.startsWith("Mentor introduction"));
        if (intro) {
          await context.mutate.patch(intro.id, { title: `Mentor introduction with ${mentor}`, fields: { ...intro.fields, assignee: mentor } }, { event: `Mentor introduction reassigned to ${mentor}` });
        } else {
          await context.mutate.create({ collection: "tasks", title: `Mentor introduction with ${mentor}`, status: "ready", summary: `Manager step for ${starter.title}.`, parentId: starter.id, fields: { kind: "onboarding", employeeId: starter.id, stage: "ready", assignee: mentor, group: "Manager" } }, `Mentor introduction added for ${starter.title}`);
        }
        context.toast("Mentor assigned", `${mentor} is ${starter.title}'s mentor and owns the introduction step.`);
        close();
      }}
    >
      {starters.length === 0 ? <Empty title="Nobody is onboarding" /> : (
        <>
          <Field label="New starter" required>
            <Select value={starterId} onChange={(event) => setStarterId(event.target.value)}>{starters.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select>
          </Field>
          <Field label="Mentor" required hint={starter?.fields.mentor ? `Currently ${String(starter.fields.mentor)}` : "No mentor yet"}>
            <Select name="mentor" required defaultValue={String(starter?.fields.mentor ?? "")}>
              <option value="">Choose a mentor</option>
              {data.employees.filter((row) => row.status === "active" && row.id !== starterId).map((row) => <option key={row.id}>{row.title}</option>)}
            </Select>
          </Field>
        </>
      )}
    </form>
  );
}

export async function verifyCompletion(context: ScreenContext): Promise<void> {
  const { listByCollection } = await import("@/platform/repo");
  const starters = new Set((await listByCollection(context.org.id, "tasks")).filter((task) => task.fields.kind === "onboarding").map((task) => String(task.fields.employeeId)));
  pickRecord(context, {
    title: "Verify an onboarding checklist",
    collection: "employees",
    filter: (row) => live(row) && starters.has(row.id) && row.fields.onboardingVerifiedBy === undefined,
    describe: (row) => String(row.fields.title ?? ""),
    pickLabel: "Verify",
    empty: "Every checklist is already verified",
    onPick: async (employee) => {
      const { listChildren } = await import("@/platform/repo");
      const steps = (await listChildren(context.org.id, employee.id)).filter((task) => task.collection === "tasks" && task.fields.kind === "onboarding");
      const open = steps.filter((task) => task.status !== "done");
      if (steps.length === 0) { context.toast("No checklist", `${employee.title} has no onboarding checklist to verify.`, "blocked"); return; }
      if (open.length > 0) {
        context.toast("Not complete yet", `${open.length} step${open.length === 1 ? "" : "s"} still open: ${open.map((task) => task.title).join("; ")}.`, "blocked");
        return;
      }
      askFirst(context, {
        title: "Verify onboarding is complete",
        body: `Records that ${context.actor} checked all ${steps.length} steps for ${employee.title}. Access grants stay as they were recorded; verification grants nothing.`,
        confirm: "Verify completion",
        run: async () => {
          await context.mutate.patch(employee.id, { fields: { ...employee.fields, onboardingVerifiedBy: context.actor, onboardingVerifiedAt: clockIso() } }, { expectRevision: employee.revision, event: `Onboarding for ${employee.title} verified complete by ${context.actor}` });
          context.toast("Onboarding verified", `${employee.title}'s checklist is verified by ${context.actor}.`);
        },
      });
    },
  });
}

/* ---------------- ARL-HR-007 · approve / decline / adjust balance ---------------- */

/** The requester's name from the employee record the request points at; never the request's owner. */
function requesterName(request: Rec): string {
  const named = String(request.fields.employeeName ?? "").trim();
  if (named) return named;
  const employee = knownRecord(String(request.fields.employeeId ?? ""));
  return employee?.title ?? "the requester";
}

async function leaveRequestFor(context: ScreenContext, verb: string, then: (request: Rec) => void): Promise<void> {
  const chosen = await recordOf(context, context.selectedId, "leaveRequests");
  if (chosen && chosen.status === "requested") {
    const { getRecordInOrg } = await import("@/platform/repo");
    const id = String(chosen.fields.employeeId ?? "");
    if (id) await getRecordInOrg(context.org.id, id);
    then(chosen); return;
  }
  pickRecord(context, {
    title: `${verb} a leave request`,
    collection: "leaveRequests",
    filter: (row) => row.status === "requested",
    describe: (row) => `${requesterName(row)} · ${String(row.fields.type ?? "annual")} · ${context.date(row.startAt)} – ${context.date(row.endAt)}`,
    pickLabel: verb,
    empty: "Nothing is waiting for a decision",
    onPick: then,
  });
}

export function approveLeave(context: ScreenContext): Promise<void> {
  return leaveRequestFor(context, "Approve", (request) => {
    const who = requesterName(request);
    askFirst(context, {
      title: "Approve leave",
      body: `${who} is booked away ${context.date(request.startAt)} – ${context.date(request.endAt)}. The request and the balance both change, and the approval is recorded against ${context.actor}.`,
      confirm: "Approve leave",
      run: async () => {
        try {
          const { getRecordInOrg } = await import("@/platform/repo");
          const employeeId = String(request.fields.employeeId ?? "");
          const employee = employeeId ? await getRecordInOrg(context.org.id, employeeId) : undefined;
          const plan = planLeaveDecision({
            organizationId: context.org.id, currency: context.org.currency,
            actor: context.actor, now: clockIso(),
          }, request, employee, "approved");
          await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
          context.toast("Leave approved", `${who}'s request and any annual balance change were saved together.`);
        } catch (error) {
          context.toast("Leave not approved", error instanceof Error ? error.message : "Reload this request before deciding.", "blocked");
        }
      },
    });
  });
}

export function declineLeave(context: ScreenContext): Promise<void> {
  return leaveRequestFor(context, "Decline", (request) => {
    const who = requesterName(request);
    askFirst(context, {
      title: "Decline leave",
      body: `${who}'s request for ${context.date(request.startAt)} – ${context.date(request.endAt)} is recorded as declined by ${context.actor}. No balance moves.`,
      confirm: "Decline the request",
      tone: "danger",
      run: async () => {
        try {
          const plan = planLeaveDecision({
            organizationId: context.org.id, currency: context.org.currency,
            actor: context.actor, now: clockIso(),
          }, request, undefined, "declined");
          await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
          context.toast("Leave declined", `Recorded against the request, decided by ${context.actor}.`);
        } catch (error) {
          context.toast("Leave not declined", error instanceof Error ? error.message : "Reload this request before deciding.", "blocked");
        }
      },
    });
  });
}

export function BalanceAdjust({ context, close }: { context: ScreenContext; close: () => void }) {
  const employees = useCollection("employees").filter(live);
  const [employeeIdRaw, setEmployeeId] = useState<string | null>(null);
  const employeeId = employeeIdRaw ?? (employees[0]?.id ?? "");
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("");
  const employee = employees.find((row) => row.id === employeeId);
  const change = Number(delta);
  const invalid = !Number.isFinite(change) || change === 0;
  const balance = employee ? leaveBalance(employee) : undefined;
  return (
    <form
      id="hr-balance"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!employee || invalid || !reason.trim()) return;
        const allowance = Number(employee.fields.leaveAllowance ?? 0) + change;
        await context.mutate.patch(employee.id, { fields: { ...employee.fields, leaveAllowance: allowance, lastBalanceAdjustment: `${change > 0 ? "+" : ""}${change} days by ${context.actor}: ${reason.trim()}` } }, { expectRevision: employee.revision, event: `Leave allowance for ${employee.title} adjusted by ${change} days by ${context.actor}: ${reason.trim()}` });
        context.toast("Balance adjusted", `${employee.title}'s allowance is now ${allowance} days, with the reason on the record.`);
        close();
      }}
    >
      <Field label="Person"><Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{employees.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
      <Field label="Days to add (negative to remove)"><TextInput inputMode="numeric" align="end" value={delta} onChange={(event) => setDelta(event.target.value)} invalid={invalid} /></Field>
      <Field label="Reason" required hint="Recorded on the employee record. Never a health detail."><TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} required /></Field>
      {balance && <Properties rows={[
        { label: "Allowance now", value: balance.known ? `${balance.allowance} days` : "Not recorded" },
        { label: "Allowance after", value: invalid ? "—" : `${balance.allowance + change} days` },
      ]} />}
    </form>
  );
}

/* ---------------- ARL-HR-008 · approve hours / swap / time correction ---------------- */

export async function approveHours(context: ScreenContext): Promise<void> {
  const approve = (entry: Rec) => askFirst(context, {
    title: "Approve hours",
    body: `${String(entry.fields.employeeName ?? entry.ownerName)} · ${String(entry.fields.hours ?? 0)} hours on ${context.date(entry.startAt)}. Approval records evidence for Finance review; it does not calculate or submit payroll.`,
    confirm: "Approve hours",
    run: async () => {
      try {
        const { listByCollection } = await import("@/platform/repo");
        const [employees, projects] = await Promise.all([
          listByCollection(context.org.id, "employees"), listByCollection(context.org.id, "projects"),
        ]);
        const plan = planTimesheetApprovals({
          organizationId: context.org.id, currency: context.org.currency,
          actor: context.actor, now: clockIso(), timezone: context.org.timezone,
        }, [entry], employees, projects);
        await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
        context.toast("Hours approved", "A linked employee and any project were verified. This is a local approval, not a payroll submission.");
      } catch (error) {
        context.toast("Hours not approved", error instanceof Error ? error.message : "Reload the time entry and try again.", "blocked");
      }
    },
  });
  const chosen = await recordOf(context, context.selectedId, "shifts");
  if (chosen && chosen.fields.kind === "time" && chosen.fields.approved !== true) { approve(chosen); return; }
  pickRecord(context, {
    title: "Approve hours",
    collection: "shifts",
    filter: (row) => row.fields.kind === "time" && row.fields.approved !== true,
    describe: (row) => `${String(row.fields.employeeName ?? "")} · ${context.date(row.startAt)} · ${String(row.fields.hours ?? 0)} hours`,
    pickLabel: "Approve",
    empty: "Every time entry is approved",
    onPick: approve,
  });
}

export async function swapShift(context: ScreenContext): Promise<void> {
  const first = await recordOf(context, context.selectedId, "shifts");
  const begin = (shift: Rec) => pickRecord(context, {
    title: `Swap ${String(shift.fields.employeeName ?? "")}'s shift with…`,
    collection: "shifts",
    filter: (row) => row.fields.kind === "shift" && row.id !== shift.id && row.fields.employeeId !== shift.fields.employeeId,
    describe: (row) => `${String(row.fields.employeeName ?? "")} · ${context.dateTime(row.startAt)} · ${String(row.fields.place ?? "")}`,
    pickLabel: "Swap",
    onPick: (other) => {
      const sameZone = String(shift.fields.timezone ?? context.org.timezone) === String(other.fields.timezone ?? context.org.timezone);
      askFirst(context, {
        title: "Swap these shifts",
        body: `${String(shift.fields.employeeName ?? "")} takes ${context.dateTime(other.startAt)} and ${String(other.fields.employeeName ?? "")} takes ${context.dateTime(shift.startAt)}.`,
        rows: [
          { label: "Time zone check", value: sameZone ? `Both in ${context.org.timezone}` : <Pill tone="warning">Different locations — check local working-time rules</Pill> },
          { label: "Hours each", value: `${String(shift.fields.hours ?? 8)} and ${String(other.fields.hours ?? 8)}` },
        ],
        confirm: "Swap the shifts",
        run: async () => {
          try {
            const { listByCollection } = await import("@/platform/repo");
            const [roster, employees, leave, projects] = await Promise.all([
              listByCollection(context.org.id, "shifts"),
              listByCollection(context.org.id, "employees"),
              listByCollection(context.org.id, "leaveRequests"),
              listByCollection(context.org.id, "projects"),
            ]);
            const plan = planShiftSwap({
              organizationId: context.org.id, currency: context.org.currency,
              actor: context.actor, now: clockIso(), timezone: context.org.timezone,
            }, shift, other, roster, employees, leave, projects);
            await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
            context.toast("Shifts swapped", "Both roster records were saved together after overlap and leave checks.");
          } catch (error) {
            context.toast("Swap not saved", error instanceof Error ? error.message : "Reload both shifts and try again.", "blocked");
          }
        },
      });
    },
  });
  if (first && first.fields.kind === "shift") { begin(first); return; }
  pickRecord(context, {
    title: "Which shift is being swapped?",
    collection: "shifts",
    filter: (row) => row.fields.kind === "shift",
    describe: (row) => `${String(row.fields.employeeName ?? "")} · ${context.dateTime(row.startAt)}`,
    pickLabel: "Swap this",
    onPick: begin,
  });
}

export function TimeCorrection({ context, close }: { context: ScreenContext; close: () => void }) {
  const entries = useCollection("shifts").filter((row) => row.fields.kind === "time");
  const employees = useCollection("employees").filter((row) => !["alumni", "terminated"].includes(row.status));
  const projects = useCollection("projects").filter((row) => !["archived", "deleted", "cancelled"].includes(row.status));
  const [entryIdRaw, setEntryId] = useState<string | null>(null);
  const entryId = entryIdRaw ?? (entries.find((row) => row.id === context.selectedId)?.id ?? entries[0]?.id ?? "");
  const entry = entries.find((row) => row.id === entryId);
  const [hoursRaw, setHours] = useState<string | null>(null);
  const [employeeIdRaw, setEmployeeId] = useState<string | null>(null);
  const [projectIdRaw, setProjectId] = useState<string | null>(null);
  const hours = hoursRaw ?? String(entry?.fields.hours ?? "");
  const employeeId = employeeIdRaw ?? String(entry?.fields.employeeId ?? "");
  const projectId = projectIdRaw ?? String(entry?.fields.projectId ?? "");
  const [reason, setReason] = useState("");
  const value = Number(hours);
  const invalid = !Number.isFinite(value) || value <= 0 || value > 24;
  return (
    <form
      id="hr-time-correction"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const employee = employees.find((row) => row.id === employeeId);
        const project = projectId ? projects.find((row) => row.id === projectId) : undefined;
        if (!entry || invalid || !reason.trim() || !employee || (projectId && !project)) {
          context.toast("Correction blocked", "Enter valid hours, a responsible employee, an available project and a reason.", "blocked");
          return;
        }
        const updated = await context.mutate.patch(entry.id, { status: "submitted", fields: {
          ...entry.fields, hours: value, employeeId: employee.id, employeeName: employee.title,
          projectId, approved: false, approvedBy: "", approvedAt: "",
          billingReviewStatus: "", billingReviewedBy: "", billingReviewedAt: "",
          correctedFrom: Number(entry.fields.hours ?? 0), correctedBy: context.actor, correctionReason: reason.trim(),
        } }, { expectRevision: entry.revision,
          event: `Time corrected for ${employee.title} from ${String(entry.fields.hours ?? 0)} to ${value} hours by ${context.actor}: ${reason.trim()}` });
        if (!updated) return;
        context.toast("Time corrected", "Employee and Project links were verified. Prior approval is cleared; People must review this entry again.");
        close();
      }}
    >
      {entries.length === 0 ? <Empty title="No time entries" /> : (
        <>
          <Field label="Time entry" required>
            <Select value={entryId} onChange={(event) => {
              setEntryId(event.target.value); setHours(null); setEmployeeId(null); setProjectId(null);
            }}>
              {entries.map((row) => <option key={row.id} value={row.id}>{String(row.fields.employeeName ?? "Unlinked person")} · {context.date(row.startAt)} · {String(row.fields.hours ?? 0)}h</option>)}
            </Select>
          </Field>
          <Field label="Person who did the work" required>
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Choose the matching employee record</option>
              {employees.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Field label="Project" hint="Optional for internal work, but a project link must belong to this company.">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No Project linked</option>
              {projects.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Field label="Corrected hours" required>
            <TextInput inputMode="decimal" align="end" value={hours} onChange={(event) => setHours(event.target.value)} invalid={invalid} required />
          </Field>
          <Field label="Reason" required><TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} required /></Field>
          <Notice tone="info" title="A corrected entry needs a new approval">
            This can repair an older time entry missing a real employee or Project link. It clears previous approval, records who corrected it and does not update external payroll.
          </Notice>
        </>
      )}
    </form>
  );
}

/* ---------------- ARL-HR-009 · payroll ---------------- */

function periodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function payrollSalaryGaps(employees: Rec[]): Rec[] {
  return employees.filter((employee) => !["alumni", "terminated"].includes(employee.status)
    && employee.fields.employment !== "contractor"
    && (employee.fields.salaryMinor === undefined || employee.fields.salaryMinor === null
      || String(employee.fields.salaryMinor).trim() === ""
      || !Number.isFinite(Number(employee.fields.salaryMinor))
      || Number(employee.fields.salaryMinor) < 0));
}

export async function prepareRun(context: ScreenContext, runs: Rec[], employees: Rec[]): Promise<void> {
  if (!context.can("view_payroll")) {
    context.toast("Payroll restricted", "An authorised payroll role is required.", "blocked");
    return;
  }
  const gaps = payrollSalaryGaps(employees);
  if (gaps.length) {
    context.toast("Payroll input incomplete",
      `${gaps.length} eligible employee${gaps.length === 1 ? "" : "s"} have no valid recorded salary. Verify the source records before preparing a run.`,
      "blocked");
    return;
  }
  const period = periodKey(context.now);
  const lines = computePayroll(employees);
  const gross = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const net = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const existing = runs.find((row) => row.status === "draft" && String(row.fields.period ?? "") === period);
  let id: string;
  if (existing) {
    await context.mutate.patch(existing.id, { amountMinor: gross, fields: { ...existing.fields, people: lines.length, grossMinor: gross, netMinor: net, preparedBy: context.actor, preparedAt: clockIso() } }, { expectRevision: existing.revision, event: `Payroll ${period} re-prepared by ${context.actor}` });
    id = existing.id;
  } else {
    const created = await context.mutate.create({ collection: "payrollRuns", title: `Payroll ${period}`, status: "draft", amountMinor: gross, summary: "Prepared locally from employee records. Nothing filed or paid.", fields: { period, people: lines.length, grossMinor: gross, netMinor: net, preparedBy: context.actor, filed: false, banked: false } }, `Payroll ${period} prepared by ${context.actor}`);
    id = created.id;
  }
  context.toast("Run prepared", `${lines.length} people, ${context.money(gross)} gross, saved as a draft run for ${period}.`);
  context.openOverlay("Payroll review", { id });
}

export async function validateRun(context: ScreenContext, runs: Rec[], employees: Rec[], shifts: Rec[]): Promise<void> {
  const run = runs.find((row) => row.status === "draft");
  if (!run) { context.toast("No draft run", "Prepare a run first; approved runs are not re-validated.", "blocked"); return; }
  const exceptions = payrollSalaryGaps(employees).length
    + shifts.filter((row) => row.fields.kind === "time"
      && (row.fields.approved !== true || row.status !== "approved")).length;
  await context.mutate.patch(run.id, { fields: { ...run.fields, validatedBy: context.actor, validatedAt: clockIso(), exceptions, jurisdictionValidated: false } }, { expectRevision: run.revision, event: `${run.title} validated by ${context.actor}: ${exceptions} data exceptions; ${context.org.jurisdiction} rules not validated` });
  context.toast(exceptions ? "Exceptions found" : "No data exceptions", `${exceptions} exception${exceptions === 1 ? "" : "s"} recorded on the run. ${context.org.jurisdiction} rules still need a payroll provider.`, exceptions ? "blocked" : "ok");
  context.openOverlay("exception report");
}

export async function exportRun(context: ScreenContext, runs: Rec[], employees: Rec[]): Promise<void> {
  if (!context.can("view_payroll") || !context.can("export_data")) {
    context.toast("Export unavailable", "The current role cannot export payroll inputs.", "blocked");
    return;
  }
  const gaps = payrollSalaryGaps(employees);
  if (gaps.length) {
    context.toast("Export blocked", `${gaps.length} eligible employee salary records are incomplete. Verify them first.`, "blocked");
    return;
  }
  const run = runs.find((row) => row.status === "draft") ?? runs[0];
  const lines = computePayroll(employees);
  const header = "person,basis,gross,tax,ni,pension,net\n";
  const body = lines.map((line) => [line.name, line.basis, line.grossMinor / 100, line.taxMinor / 100, line.niMinor / 100, line.pensionMinor / 100, line.netMinor / 100].map((cell) => csvCell(cell)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${context.org.slug}-${run?.title.replace(/\s+/g, "-").toLowerCase() ?? "payroll"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  await context.mutate.log(`Payroll CSV exported by ${context.actor} (${lines.length} lines)`, { entityId: run?.id, type: "export" });
  context.toast("CSV exported", `${lines.length} lines downloaded from this browser. Nothing was filed.`);
}

export function ReconcileRun({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["payrollRuns", "journals", "accounts"]);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [journalId, setJournalId] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const wantedId = payload?.id ?? context.selectedId;
  const run = wantedId
    ? data.payrollRuns.find((row) => row.id === wantedId && row.organizationId === context.org.id)
    : data.payrollRuns.find((row) => row.status === "draft");
  const wages = data.accounts.find((row) => String(row.fields.code ?? "") === "6300");
  const candidates = data.journals
    .filter((row) => row.status === "posted")
    .map((row) => {
      const journal = row.body as { lines?: { accountId: string; debitMinor: number }[] } | undefined;
      const debit = (journal?.lines ?? [])
        .filter((line) => wages && line.accountId === wages.id)
        .reduce((sum, line) => sum + Number(line.debitMinor || 0), 0);
      return { row, debit };
    })
    .filter((entry) => Number.isFinite(entry.debit) && entry.debit > 0)
    .sort((left, right) => String(right.row.at ?? right.row.createdAt).localeCompare(String(left.row.at ?? left.row.createdAt)));
  const chosen = candidates.find((entry) => entry.row.id === journalId);
  const recorded = run?.fields.grossMinor ?? run?.amountMinor;
  const gross = Number(recorded);
  const validGross = recorded !== undefined && Number.isFinite(gross) && gross >= 0;
  const difference = validGross && chosen ? gross - chosen.debit : undefined;
  const canReview = context.can("view_payroll");
  if (!canReview) return <RoleViewNote what="Payroll reconciliation" />;
  if (!run) return <Empty title={wantedId ? "Selected payroll run unavailable" : "No draft payroll run"}>
    Open the correct company run to compare against a real posted wages journal.
  </Empty>;
  return (
    <Stack gap={4}>
      <PeopleDialogLead eyebrow="PEOPLE / PAYROLL / FINANCE HANDOFF" title="Compare a saved payroll run with the ledger"
        description="Choose the posted wages journal deliberately. A numerical comparison is not proof that payments or statutory filings occurred."
        status={<Pill tone="neutral">Evidence review</Pill>} />
      <PeopleDialogSection step="01" title="Source payroll run" description="Use the gross figure saved on this run, not current salary estimates.">
        <Properties rows={[
          { label: "Run", value: run.title },
          { label: "Period", value: String(run.fields.period || "Not recorded") },
          { label: "Saved gross", value: validGross ? context.money(gross) : "Not recorded" },
          { label: "Payroll status", value: run.status },
          { label: "Wages ledger account", value: wages ? `${String(wages.fields.code)} · ${wages.title}`
            : "No wages account found" },
        ]} />
      </PeopleDialogSection>
      <PeopleDialogSection step="02" title="Select the posted wages journal"
        description="No journal is selected automatically. Verify its period, source and account before comparing.">
        <Field label="Posted wages journal" required>
          <Select value={journalId} onChange={(event) => {
            setJournalId(event.target.value); setChecked(false); setError("");
          }}>
            <option value="">Choose a posted wages journal</option>
            {candidates.map((entry) => <option key={entry.row.id} value={entry.row.id}>
              {entry.row.title} · {context.date(entry.row.at)} · {context.money(entry.debit)}
            </option>)}
          </Select>
        </Field>
        {chosen && <Properties rows={[
          { label: "Selected journal", value: chosen.row.title },
          { label: "Journal date", value: context.date(chosen.row.at) },
          { label: "Posted wages debit", value: context.money(chosen.debit) },
          { label: "Saved run minus posted journal", value: difference === undefined ? "Cannot calculate"
            : context.money(difference) },
        ]} />}
        {!wages && <Notice tone="warning" title="No wages account found">
          A matching posted journal cannot be verified until the chart of accounts includes the expected wages account.
        </Notice>}
        {difference !== undefined && difference !== 0 && <Notice tone="warning" title="Amounts do not match">
          A difference is recorded as an unresolved discrepancy, not a successful reconciliation.
        </Notice>}
      </PeopleDialogSection>
      <PeopleDialogSection step="03" title="Record the comparison"
        description="The evidence link and difference are saved to the payroll run; the ledger itself is not posted or changed.">
        <Checkbox checked={checked} disabled={!chosen || !validGross}
          onChange={(event) => setChecked(event.target.checked)}
          label="I checked this journal belongs to the selected payroll period and reviewed any difference" />
        <Notice tone="info" title="No automatic reconciliation or payment">
          This saves an auditable local comparison. It does not reconcile bank payments, create a journal, or certify payroll compliance.
        </Notice>
        {error && <Notice tone="danger" title="Comparison not saved">{error}</Notice>}
      </PeopleDialogSection>
      <ModalActions><OverlayActions variant="confirm" end={<Button variant="ghost" onClick={close}>Cancel</Button>} secondary={<Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/fin/ledger`)}>Open ledger</Button>} primary={<Button variant="primary" disabled={!chosen || difference === undefined || !checked}
          onClick={async () => {
            if (!chosen || difference === undefined || !checked) return;
            setError("");
            try {
              const saved = await context.mutate.patch(run.id, {
                fields: {
                  ...run.fields, reconciledBy: context.actor, reconciledAt: clockIso(),
                  ledgerJournalId: chosen.row.id, ledgerMinor: chosen.debit, differenceMinor: difference,
                  reconciliationStatus: difference === 0 ? "matched" : "discrepancy",
                },
              }, { expectRevision: run.revision,
                event: `${run.title} compared with posted journal ${chosen.row.title} by ${context.actor}; difference ${context.money(difference)}` });
              if (!saved) { setError("The payroll run changed. Reopen it before saving the comparison."); return; }
              context.toast(difference === 0 ? "Amounts matched locally" : "Discrepancy recorded",
                `The comparison to ${chosen.row.title} was recorded; no accounting entry or bank payment was created.`);
              close();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "The comparison could not be recorded.");
            }
          }}>Record comparison</Button>} /></ModalActions>
    </Stack>
  );
}

/* ---------------- ARL-HR-010 · assign reviewer / submit / acknowledge ---------------- */

export function AssignReviewer({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["reviews", "employees"]);
  const open = data.reviews.filter((row) => row.status !== "acknowledged");
  const [reviewIdRaw, setReviewId] = useState<string | null>(null);
  const reviewId = reviewIdRaw ?? (open.find((row) => row.id === context.selectedId)?.id ?? open[0]?.id ?? "");
  const review = data.reviews.find((row) => row.id === reviewId);
  return (
    <form
      id="hr-reviewer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const reviewer = String(new FormData(event.currentTarget).get("reviewer") ?? "");
        if (!review || !reviewer) return;
        await context.mutate.patch(review.id, { fields: { ...review.fields, reviewer, reviewerAssignedBy: context.actor } }, { expectRevision: review.revision, event: `${reviewer} assigned to review ${String(review.fields.employeeName ?? "")} by ${context.actor}` });
        context.toast("Reviewer assigned", `${reviewer} now owns ${review.title}.`);
        close();
      }}
    >
      {open.length === 0 ? <Empty title="No open reviews" /> : (
        <>
          <Field label="Review"><Select value={reviewId} onChange={(event) => setReviewId(event.target.value)}>{open.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
          <Field label="Reviewer" required hint={review ? `Currently ${String(review.fields.reviewer ?? "nobody")}` : undefined}>
            <Select name="reviewer" required defaultValue="">
              <option value="">Choose a person</option>
              {data.employees.filter((row) => live(row) && row.title !== review?.fields.employeeName).map((row) => <option key={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Notice tone="info">The person reviewed cannot review themselves, and an AI employee cannot be a reviewer.</Notice>
        </>
      )}
    </form>
  );
}

async function reviewFor(context: ScreenContext, statuses: string[], verb: string, then: (review: Rec) => void): Promise<void> {
  const chosen = await recordOf(context, context.selectedId, "reviews");
  if (chosen && statuses.includes(chosen.status)) { then(chosen); return; }
  pickRecord(context, {
    title: `${verb} a review`,
    collection: "reviews",
    filter: (row) => statuses.includes(row.status),
    describe: (row) => `${String(row.fields.cycle ?? "")} · reviewer ${String(row.fields.reviewer ?? "")}`,
    pickLabel: verb,
    empty: `No review is ready to ${verb.toLowerCase()}`,
    onPick: then,
  });
}

export function submitReview(context: ScreenContext): Promise<void> {
  return reviewFor(context, ["draft", "scheduled"], "Submit", (review) => {
    if (review.fields.aiAssisted === true) {
      context.toast("Human review required", "This draft was assembled with an AI employee. Open it and save it as the accountable reviewer before submitting.", "blocked");
      context.openOverlay("Review form", { id: review.id });
      return;
    }
    if (!String(review.fields.rating ?? "")) {
      context.toast("No rating yet", "Set a rating with its evidence before submitting.", "blocked");
      context.openOverlay("Review form", { id: review.id });
      return;
    }
    askFirst(context, {
      title: "Submit this review",
      body: `${review.title} becomes visible to the next manager up and can no longer be edited by the reviewer alone.`,
      confirm: "Submit the review",
      run: async () => {
        await context.mutate.patch(review.id, { status: "submitted", fields: { ...review.fields, submittedBy: context.actor, submittedAt: clockIso() } }, { expectRevision: review.revision, event: `Review ${review.title} submitted by ${context.actor}` });
        context.toast("Review submitted", `${review.title} is submitted by ${context.actor}.`);
      },
    });
  });
}

export function acknowledgeReview(context: ScreenContext): Promise<void> {
  return reviewFor(context, ["submitted", "calibrated"], "Acknowledge", (review) => askFirst(context, {
    title: "Acknowledge this review",
    body: `Records that ${context.actor} has read ${review.title}. Acknowledging is not agreeing; a comment can still be added.`,
    confirm: "Acknowledge",
    run: async () => {
      await context.mutate.patch(review.id, { status: "acknowledged", fields: { ...review.fields, acknowledgedBy: context.actor, acknowledgedAt: clockIso() } }, { expectRevision: review.revision, event: `Review ${review.title} acknowledged by ${context.actor}` });
      context.toast("Review acknowledged", `Recorded against ${review.title}.`);
    },
  }));
}

/* ---------------- ARL-HR-011 · assign course / acknowledge policy / complete module ---------------- */

export function AssignCourse({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["courses", "employees", "learningRecords"]);
  const [courseIdRaw, setCourseId] = useState<string | null>(null);
  const courseId = courseIdRaw ?? (data.courses[0]?.id ?? "");
  const [people, setPeople] = useState<string[]>([]);
  const staff = data.employees.filter(live);
  const already = data.learningRecords.filter((row) => row.parentId === courseId).map((row) => String(row.fields.person ?? ""));
  const { now } = useWorkspace();
  return (
    <form
      id="hr-assign-course"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const course = data.courses.find((row) => row.id === courseId);
        const fresh = people.filter((name) => !already.includes(name));
        if (!course || fresh.length === 0) return;
        const due = String(new FormData(event.currentTarget).get("due") ?? "");
        for (const person of fresh) {
          await context.mutate.create({ collection: "learningRecords", title: `${course.title} · ${person}`, status: "assigned", summary: `Assigned by ${context.actor}.`, parentId: course.id, dueAt: due ? new Date(`${due}T17:00:00.000Z`).toISOString() : undefined, fields: { courseId: course.id, person, assignedBy: context.actor } }, `${course.title} assigned to ${person} by ${context.actor}`);
        }
        context.toast("Course assigned", `${course.title} is assigned to ${fresh.length} ${fresh.length === 1 ? "person" : "people"}.`);
        close();
      }}
    >
      <Field label="Course"><Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{data.courses.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
      <Field label="Due"><TextInput type="date" name="due" defaultValue={addDays(now, 14).toISOString().slice(0, 10)} /></Field>
      <fieldset className="ds-stack ds-gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="ds-subtle">People</legend>
        {staff.map((row) => (
          <Checkbox
            key={row.id}
            label={already.includes(row.title) ? `${row.title} (already assigned)` : row.title}
            disabled={already.includes(row.title)}
            checked={people.includes(row.title)}
            onChange={(event) => setPeople((current) => event.target.checked ? [...current, row.title] : current.filter((name) => name !== row.title))}
          />
        ))}
      </fieldset>
      {people.length === 0 && <Notice tone="info">Choose at least one person.</Notice>}
    </form>
  );
}

export function acknowledgePolicy(context: ScreenContext): void {
  pickRecord(context, {
    title: "Acknowledge a policy",
    collection: "policies",
    filter: (row) => row.fields.kind === "hr" && row.fields.acknowledgementRequired === true,
    describe: (row) => `Version ${String(row.fields.version ?? "1.0")}`,
    pickLabel: "Acknowledge",
    empty: "No policy needs acknowledging",
    onPick: (policy) => askFirst(context, {
      title: `Acknowledge ${policy.title}`,
      body: `Records that ${context.actor} has read version ${String(policy.fields.version ?? "1.0")}. A later revision will ask again; this acknowledgement stays on the record.`,
      confirm: "Acknowledge",
      run: () => recordAcknowledgement(context, policy),
    }),
  });
}

export function completeModule(context: ScreenContext): void {
  pickRecord(context, {
    title: "Complete a module",
    collection: "learningRecords",
    filter: (row) => row.fields.person === context.actor && row.status !== "complete",
    describe: (row) => (row.dueAt ? `Due ${context.date(row.dueAt)}` : "No due date"),
    pickLabel: "Complete",
    empty: `Nothing is assigned to ${context.actor} that is still open`,
    onPick: (record) => askFirst(context, {
      title: "Record a completion",
      body: `Records that ${context.actor} completed ${record.title.split(" · ")[0]}. A completion is a record in this workspace, not a certificate.`,
      confirm: "Mark complete",
      run: async () => {
        const { getRecord } = await import("@/platform/repo");
        await context.mutate.patch(record.id, { status: "complete", fields: { ...record.fields, completedAt: clockIso() } }, { expectRevision: record.revision, event: `${record.title} completed` });
        const course = await getRecord(String(record.fields.courseId ?? ""));
        if (course) await context.mutate.patch(course.id, { fields: { ...course.fields, completions: Number(course.fields.completions ?? 0) + 1 } }, { expectRevision: course.revision, event: `${course.title} completion recorded for ${context.actor}` });
        context.toast("Module complete", "The completion and the course count both changed.");
      },
    }),
  });
}

