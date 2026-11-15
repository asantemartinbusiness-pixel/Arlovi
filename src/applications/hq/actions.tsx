import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Avatar, Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { Rec } from "@/domain/types";
import { listByCollection, getRecord } from "@/platform/repo";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";

/* ====================================================================== *
 * Headquarters actions.
 *
 * Each contract action on the Headquarters screens performs the thing it is
 * named for. Earlier versions routed several of them to a related surface
 * with an honest label ("assign leader" opened the organisation chart); this
 * file holds the real implementations.
 * ====================================================================== */

/* ----------------------------- Preferences ----------------------------- */

export async function readPref(context: ScreenContext, kind: string): Promise<Rec | undefined> {
  const rows = await listByCollection(context.org.id, "preferences");
  return rows.find((row) => row.fields.kind === kind);
}

export async function writePref(
  context: ScreenContext,
  kind: string,
  title: string,
  fields: Record<string, string | number | boolean>,
): Promise<void> {
  const existing = await readPref(context, kind);
  if (existing) {
    await context.mutate.patch(existing.id, { fields: { ...existing.fields, ...fields, kind } }, { skipHistory: true });
    return;
  }
  await context.mutate.create({ collection: "preferences", title, status: "active", fields: { ...fields, kind } });
}

export function usePref(kind: string): Rec | undefined {
  const rows = useCollection("preferences");
  return rows.find((row) => row.fields.kind === kind);
}

export function listField(record: Rec | undefined, key: string): string[] {
  const value = record?.fields[key];
  return typeof value === "string" && value ? value.split(",").filter(Boolean) : [];
}

/* ----------------------------- HQ-001 ----------------------------- */

export const HOME_CARDS = [
  { key: "stats", label: "Figures: receivable, overdue, ledger, bank feed" },
  { key: "waiting", label: "Waiting on you" },
  { key: "missions", label: "Active missions" },
  { key: "due", label: "Work due in the period" },
  { key: "recommended", label: "Recommended" },
] as const;

/** Card visibility and order for Executive Home, kept per workspace. */
export function ArrangeCards({ context, close }: { context: ScreenContext; close: () => void }) {
  const pref = usePref("homeCards");
  const savedHidden = listField(pref, "hidden");
  const savedOrder = listField(pref, "order");
  const initialOrder = savedOrder.length === HOME_CARDS.length ? savedOrder : HOME_CARDS.map((card) => card.key);
  const [hidden, setHidden] = useState<string[]>(savedHidden);
  const [order, setOrder] = useState<string[]>(initialOrder);

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  return (
    <form
      id="hq-arrange"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await writePref(context, "homeCards", "Executive Home cards", { hidden: hidden.join(","), order: order.join(",") });
        context.toast("Cards arranged", `${order.length - hidden.length} of ${order.length} cards shown on Executive Home.`);
        close();
      }}
    >
      <p className="ds-subtle">Choose which cards show, and move them with the arrows. The order is used top to bottom.</p>
      {order.map((key, index) => {
        const card = HOME_CARDS.find((item) => item.key === key);
        if (!card) return null;
        return (
          <Row key={key} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <Checkbox
              label={card.label}
              checked={!hidden.includes(key)}
              onChange={(event) => setHidden((current) => (event.target.checked ? current.filter((item) => item !== key) : [...current, key]))}
            />
            <span className="ds-grow" />
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${card.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${card.label} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
          </Row>
        );
      })}
    </form>
  );
}

export interface Insight { id: string; title: string; body: string; to?: string }

/** Dismissed and active recommendations, with restore. Dismissals persist. */
export function RecommendationsManager({ context, insights }: { context: ScreenContext; insights: Insight[] }) {
  const pref = usePref("dismissedInsights");
  const dismissed = listField(pref, "ids");
  const active = insights.filter((insight) => !dismissed.includes(insight.id));
  const gone = insights.filter((insight) => dismissed.includes(insight.id));

  async function setDismissed(ids: string[]) {
    await writePref(context, "dismissedInsights", "Dismissed recommendations", { ids: ids.join(",") });
  }

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <h3 className="ds-eyebrow">Showing · {active.length}</h3>
        {active.length === 0 && <span className="ds-subtle">No recommendation is showing.</span>}
        {active.map((insight) => (
          <Row key={insight.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <div className="ds-grow"><strong>{insight.title}</strong><p className="ds-subtle">{insight.body}</p></div>
            <Button size="sm" variant="secondary" onClick={async () => {
              await setDismissed([...dismissed, insight.id]);
              context.toast("Recommendation dismissed", "It stays dismissed until you restore it here.");
            }}>Dismiss</Button>
          </Row>
        ))}
      </Stack>
      <Stack gap={2}>
        <h3 className="ds-eyebrow">Dismissed · {gone.length}</h3>
        {gone.length === 0 && <span className="ds-subtle">Nothing has been dismissed.</span>}
        {gone.map((insight) => (
          <Row key={insight.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <span className="ds-grow ds-muted">{insight.title}</span>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(dismissed.filter((id) => id !== insight.id))}>Restore</Button>
          </Row>
        ))}
      </Stack>
      <Notice tone="info">A recommendation that no longer applies disappears on its own; dismissing only hides one that still does.</Notice>
    </Stack>
  );
}

/* ----------------------------- HQ-002 ----------------------------- */

/** Raises the selected task to high priority, or lowers it again. */
export async function prioritizeTask(context: ScreenContext): Promise<void> {
  const task = context.selectedId ? await getRecord(context.selectedId) : undefined;
  if (!task || task.collection !== "tasks") {
    context.toast("Select a task", "Choose a task in your work list first.", "blocked");
    return;
  }
  const high = task.fields.priority === "high";
  await context.mutate.patch(task.id, {
    fields: { ...task.fields, priority: high ? "normal" : "high", prioritizedBy: context.actor },
  }, { expectRevision: task.revision, event: `${task.title} ${high ? "returned to normal priority" : "prioritised"} by ${context.actor}` });
  context.toast(high ? "Priority lowered" : "Prioritised", `${task.title} is now ${high ? "normal" : "high"} priority.`);
}

/** Pins or unpins the selected task; pinned work appears under Saved. */
export async function pinTask(context: ScreenContext): Promise<void> {
  const task = context.selectedId ? await getRecord(context.selectedId) : undefined;
  if (!task || task.collection !== "tasks") {
    context.toast("Select a task", "Choose a task in your work list first.", "blocked");
    return;
  }
  const pinned = task.tags.includes("pinned");
  await context.mutate.patch(task.id, {
    tags: pinned ? task.tags.filter((tag) => tag !== "pinned") : [...task.tags, "pinned"],
  }, { skipHistory: true, event: `${task.title} ${pinned ? "unpinned" : "pinned"}` });
  context.toast(pinned ? "Unpinned" : "Pinned", pinned ? `${task.title} left Saved.` : `${task.title} is under Saved.`);
}

/** Opens the most recently edited draft rather than the whole library. */
export async function openLatestDraft(context: ScreenContext): Promise<void> {
  const documents = await listByCollection(context.org.id, "documents");
  const latest = documents.filter((doc) => doc.status === "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latest) {
    context.toast("No drafts", "Nothing in Docs is marked as a draft.", "info");
    return;
  }
  context.navigate(`/o/${context.org.slug}/docs/files/${latest.id}`);
}

/** Asks a named teammate for help: a task assigned to them, linked back. */
export function RequestHelp({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const { actor } = useWorkspace();
  const people = members.filter((member) => member.title !== actor);
  const [who, setWho] = useState(people[0]?.title ?? "");
  const [what, setWhat] = useState("");
  const selected = useRecord(context.selectedId);
  return (
    <form
      id="hq-help"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!who || !what.trim()) return;
        await context.mutate.create({
          collection: "tasks",
          title: `Help ${actor.split(" ")[0]}: ${what.trim().slice(0, 60)}`,
          status: "ready",
          summary: what.trim(),
          parentId: selected?.collection === "tasks" ? selected.parentId : undefined,
          tags: ["help-request"],
          fields: { stage: "ready", assignee: who, requestedBy: actor, relatedTo: selected?.id ?? "" },
        }, `${actor} asked ${who} for help`);
        context.toast("Help requested", `${who} has a task for it in their work list.`);
        close();
      }}
    >
      <Field label="Ask" required>
        <Select value={who} onChange={(event) => setWho(event.target.value)}>
          {people.map((member) => (
            <option key={member.id} value={member.title}>
              {member.title}{member.fields.kind === "ai" ? " (AI employee)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What you need" required><TextArea value={what} onChange={(event) => setWhat(event.target.value)} rows={4} required /></Field>
      {selected && selected.collection === "tasks" && <p className="ds-subtle">Linked to {selected.title}.</p>}
      <Notice tone="info">This becomes a task in their list. No message is sent outside this workspace.</Notice>
    </form>
  );
}

/* ----------------------------- HQ-004 ----------------------------- */

export function AssignLeader({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["departments", "members"]);
  const [deptId, setDeptId] = useState(data.departments[0]?.id ?? "");
  const dept = data.departments.find((item) => item.id === deptId);
  const [lead, setLead] = useState(String(dept?.fields.lead ?? ""));
  const humans = data.members.filter((member) => member.fields.kind === "human");
  return (
    <form
      id="hq-leader"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dept || !lead) return;
        await context.mutate.patch(dept.id, { fields: { ...dept.fields, lead } }, { expectRevision: dept.revision, event: `${lead} assigned to lead ${dept.title}` });
        context.toast("Leader assigned", `${lead} now leads ${dept.title}.`);
        close();
      }}
    >
      <Field label="Department">
        <Select value={deptId} onChange={(event) => {
          setDeptId(event.target.value);
          const next = data.departments.find((item) => item.id === event.target.value);
          setLead(String(next?.fields.lead ?? ""));
        }}>
          {data.departments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Leader" hint="A department is led by a person. AI employees can be members but not leads.">
        <Select value={lead} onChange={(event) => setLead(event.target.value)}>
          <option value="">Choose a person</option>
          {humans.map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      {dept && <p className="ds-subtle">Currently led by {String(dept.fields.lead ?? "nobody")}.</p>}
    </form>
  );
}

export function OpenDepartment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["departments", "members"]);
  return (
    <Stack gap={2}>
      {data.departments.map((dept) => (
        <button
          key={dept.id}
          type="button"
          className="ds-record-card"
          onClick={() => { close(); context.navigate(`/o/${context.org.slug}/hq/departments/${dept.id}`); }}
        >
          <strong>{dept.title}</strong>
          <span className="ds-subtle">
            {data.members.filter((member) => member.fields.departmentId === dept.id).length} members · led by {String(dept.fields.lead ?? "nobody")}
          </span>
        </button>
      ))}
    </Stack>
  );
}

/** Directory order, kept on each department record. */
export function ReorderDepartments({ context, close }: { context: ScreenContext; close: () => void }) {
  const departments = useCollection("departments");
  const sorted = useMemo(() => sortDepartments(departments), [departments]);
  const [order, setOrder] = useState<string[]>(() => sorted.map((dept) => dept.id));
  const ids = order.length === sorted.length ? order : sorted.map((dept) => dept.id);

  function move(index: number, delta: number) {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  return (
    <form
      id="hq-reorder"
      className="ds-stack ds-gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const [index, id] of ids.entries()) {
          const dept = departments.find((item) => item.id === id);
          if (dept && Number(dept.fields.order ?? -1) !== index) {
            await context.mutate.patch(id, { fields: { ...dept.fields, order: index } }, { skipHistory: true });
          }
        }
        context.toast("Directory reordered", "Departments now appear in this order everywhere they are listed.");
        close();
      }}
    >
      <p className="ds-subtle">Move a department with its arrows. Tab reaches each arrow; Enter moves it.</p>
      {ids.map((id, index) => {
        const dept = departments.find((item) => item.id === id);
        if (!dept) return null;
        return (
          <Row key={id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <span className="ds-num ds-subtle" style={{ width: 20 }}>{index + 1}</span>
            <span className="ds-grow">{dept.title}</span>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${dept.title} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${dept.title} down`} disabled={index === ids.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
          </Row>
        );
      })}
    </form>
  );
}

export function sortDepartments(departments: Rec[]): Rec[] {
  return [...departments].sort((a, b) => {
    const left = typeof a.fields.order === "number" ? a.fields.order : 999;
    const right = typeof b.fields.order === "number" ? b.fields.order : 999;
    return left === right ? a.title.localeCompare(b.title) : left - right;
  });
}

/* ----------------------------- HQ-005 ----------------------------- */

function useDepartment(context: ScreenContext) {
  const data = useCollections(["departments", "members"]);
  const dept = data.departments.find((item) => item.id === context.params.id) ?? data.departments[0];
  const members = data.members.filter((member) => member.fields.departmentId === dept?.id);
  return { dept, members };
}

export function AssignWork({ context, close }: { context: ScreenContext; close: () => void }) {
  const { dept, members } = useDepartment(context);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(members[0]?.title ?? "");
  const [due, setDue] = useState("");
  if (!dept) return <Empty title="Department not found" />;
  return (
    <form
      id="hq-assign-work"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || !assignee) return;
        await context.mutate.create({
          collection: "tasks",
          title: title.trim(),
          status: "ready",
          dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : undefined,
          tags: [dept.id],
          fields: { stage: "ready", assignee, departmentId: dept.id, assignedBy: context.actor },
        }, `${title.trim()} assigned to ${assignee} in ${dept.title}`);
        context.toast("Work assigned", `${assignee} has ${title.trim()}.`);
        close();
      }}
    >
      <Field label="Work" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3}>
        <Field label={`Assign within ${dept.title}`}>
          <Select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            {members.map((member) => <option key={member.id} value={member.title}>{member.title}{member.fields.kind === "ai" ? " (AI)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Due"><TextInput type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
      </Row>
    </form>
  );
}

export function MessageTeam({ context, close }: { context: ScreenContext; close: () => void }) {
  const { dept, members } = useDepartment(context);
  const [text, setText] = useState("");
  if (!dept) return <Empty title="Department not found" />;
  return (
    <form
      id="hq-message-team"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: text.trim().slice(0, 48),
          status: "sent",
          summary: text.trim(),
          at: new Date().toISOString(),
          tags: ["local", dept.id],
          fields: { author: context.actor, kind: "human", channel: dept.title, departmentId: dept.id },
        }, `${context.actor} messaged ${dept.title}`);
        context.toast("Message posted", `${members.length} members of ${dept.title} will see it in this workspace.`);
        close();
      }}
    >
      <Field label={`Message to ${dept.title}`} required><TextArea value={text} onChange={(event) => setText(event.target.value)} rows={5} required /></Field>
      <Row gap={1} wrap>{members.map((member) => <Avatar key={member.id} name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />)}</Row>
      <Notice tone="info">Posted to the department channel in this workspace. Nothing is emailed; no mail provider is connected.</Notice>
    </form>
  );
}

export function AddResource({ context, close }: { context: ScreenContext; close: () => void }) {
  const { dept } = useDepartment(context);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("link");
  const [location, setLocation] = useState("");
  if (!dept) return <Empty title="Department not found" />;
  return (
    <form
      id="hq-resource"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        await context.mutate.create({
          collection: "documents",
          title: title.trim(),
          status: "published",
          summary: location.trim(),
          tags: [dept.id, "resource"],
          fields: { kind, location: location.trim(), departmentId: dept.id },
        }, `${title.trim()} added to ${dept.title}`);
        context.toast("Resource added", `${title.trim()} is under ${dept.title} files.`);
        close();
      }}
    >
      <Field label="Name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3}>
        <Field label="Kind">
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="link">Link</option>
            <option value="guide">Guide</option>
            <option value="template">Template</option>
            <option value="reference">Reference</option>
          </Select>
        </Field>
        <Field label="Where it lives" hint="An address or a note; nothing is fetched."><TextInput value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
      </Row>
    </form>
  );
}

/** The application a department works in most. */
const DEPARTMENT_APPS: { match: RegExp; code: string; path: string }[] = [
  { match: /commercial|sales/i, code: "CRM", path: "crm/deals" },
  { match: /studio|design/i, code: "DESIGN", path: "design/files" },
  { match: /workshop|operations|production/i, code: "PROJECT", path: "project/projects" },
  { match: /people|hr/i, code: "HR", path: "hr/people" },
  { match: /finance/i, code: "FIN", path: "fin/home" },
];

export function openDepartmentApp(context: ScreenContext, dept: Rec | undefined): void {
  const found = DEPARTMENT_APPS.find((item) => item.match.test(dept?.title ?? ""));
  if (!found) {
    context.toast("No application mapped", `${dept?.title ?? "This department"} has no primary application yet.`, "info");
    return;
  }
  context.navigate(`/o/${context.org.slug}/${found.path}`);
}

export async function openDepartmentAppFor(context: ScreenContext): Promise<void> {
  const dept = context.params.id ? await getRecord(context.params.id) : undefined;
  openDepartmentApp(context, dept);
}

/* ----------------------------- HQ-007 ----------------------------- */

export function LinkMission({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["objectives", "missions"]);
  const [objectiveId, setObjectiveId] = useState(context.selectedId && data.objectives.some((o) => o.id === context.selectedId) ? context.selectedId : data.objectives[0]?.id ?? "");
  const objective = data.objectives.find((item) => item.id === objectiveId);
  const [missionId, setMissionId] = useState(String(objective?.fields.missionId ?? data.missions[0]?.id ?? ""));
  return (
    <form
      id="hq-link-mission"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!objective || !missionId) return;
        const mission = data.missions.find((item) => item.id === missionId);
        await context.mutate.patch(objective.id, { fields: { ...objective.fields, missionId } }, { expectRevision: objective.revision, event: `${mission?.title ?? "Mission"} linked to ${objective.title}` });
        context.toast("Mission linked", `${mission?.title} now counts towards ${objective.title}.`);
        close();
      }}
    >
      <Field label="Objective">
        <Select value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)}>
          {data.objectives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Mission">
        <Select value={missionId} onChange={(event) => setMissionId(event.target.value)}>
          {data.missions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <Notice tone="info">Linking records which mission works towards the objective. It does not change the measure; the measure only moves from its own data.</Notice>
    </form>
  );
}

export function ReviewGoal({ context, close }: { context: ScreenContext; close: () => void }) {
  const objectives = useCollection("objectives");
  const [objectiveId, setObjectiveId] = useState(context.selectedId && objectives.some((o) => o.id === context.selectedId) ? context.selectedId : objectives[0]?.id ?? "");
  const objective = objectives.find((item) => item.id === objectiveId);
  const [confidence, setConfidence] = useState("on_track");
  const [note, setNote] = useState("");
  return (
    <form
      id="hq-review-goal"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!objective) return;
        await context.mutate.patch(objective.id, {
          fields: { ...objective.fields, reviewedAt: new Date().toISOString(), reviewedBy: context.actor, confidence, reviewNote: note.trim() },
        }, { expectRevision: objective.revision, event: `${objective.title} reviewed by ${context.actor}: ${confidence.replace(/_/g, " ")}` });
        context.toast("Review recorded", `${objective.title} reviewed as ${confidence.replace(/_/g, " ")}.`);
        close();
      }}
    >
      <Field label="Objective">
        <Select value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)}>
          {objectives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      {objective && (
        <Properties rows={[
          { label: "Measure", value: String(objective.fields.measure ?? "Not set") },
          { label: "Current", value: <span className="ds-num">{String(objective.fields.current ?? 0)} / {String(objective.fields.target ?? "—")}</span> },
          { label: "Last review", value: objective.fields.reviewedAt ? context.date(String(objective.fields.reviewedAt)) : "Never" },
        ]} />
      )}
      <Field label="Confidence">
        <Select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
          <option value="on_track">On track</option>
          <option value="at_risk">At risk</option>
          <option value="off_track">Off track</option>
        </Select>
      </Field>
      <Field label="What the review found"><TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></Field>
    </form>
  );
}

/* ----------------------------- HQ-008 ----------------------------- */

export function SetPrimaryOffice({ context, close }: { context: ScreenContext; close: () => void }) {
  const locations = useCollection("locations");
  const current = locations.find((item) => item.tags.includes("primary"));
  const [id, setId] = useState(current?.id ?? locations[0]?.id ?? "");
  return (
    <form
      id="hq-primary"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const location of locations) {
          const isPrimary = location.id === id;
          const has = location.tags.includes("primary");
          if (isPrimary !== has) {
            await context.mutate.patch(location.id, {
              tags: isPrimary ? [...location.tags, "primary"] : location.tags.filter((tag) => tag !== "primary"),
            }, { event: isPrimary ? `${location.title} set as primary office` : undefined });
          }
        }
        context.toast("Primary office set", `${locations.find((item) => item.id === id)?.title} is the primary office.`);
        close();
      }}
    >
      <Field label="Primary office" hint="Used as the default location for new people, bookings and dispatch.">
        <Select value={id} onChange={(event) => setId(event.target.value)}>
          {locations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      {current && <p className="ds-subtle">Currently {current.title}.</p>}
    </form>
  );
}

/** Which locations the Locations views show. */
export function ChooseScope({ context, close }: { context: ScreenContext; close: () => void }) {
  const locations = useCollection("locations");
  const pref = usePref("locationScope");
  const [ids, setIds] = useState<string[]>(listField(pref, "ids"));
  return (
    <form
      id="hq-scope"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await writePref(context, "locationScope", "Location scope", { ids: ids.join(",") });
        context.toast("Scope set", ids.length ? `Showing ${ids.length} of ${locations.length} locations.` : "Showing every location.");
        close();
      }}
    >
      <p className="ds-subtle">Choose the locations in scope. With none chosen, every location is shown.</p>
      {locations.map((location) => (
        <Checkbox
          key={location.id}
          label={`${location.title} · ${String(location.fields.timezone ?? context.org.timezone)}`}
          checked={ids.includes(location.id)}
          onChange={(event) => setIds((current) => (event.target.checked ? [...current, location.id] : current.filter((item) => item !== location.id)))}
        />
      ))}
    </form>
  );
}

/* ----------------------------- HQ-009 ----------------------------- */

export function TimelineFilter({ context, close }: { context: ScreenContext; close: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [text, setText] = useState(params.get("q") ?? "");
  return (
    <form
      id="hq-timeline-filter"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const next = new URLSearchParams(window.location.search);
        for (const [key, value] of [["from", from], ["to", to], ["q", text.trim()]] as const) {
          if (value) next.set(key, value); else next.delete(key);
        }
        context.navigate(`${window.location.pathname}?${next.toString()}`);
        close();
      }}
    >
      <Row gap={3}>
        <Field label="From"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
      </Row>
      <Field label="Containing"><TextInput value={text} onChange={(event) => setText(event.target.value)} placeholder="A word in the title or detail" /></Field>
      <p className="ds-subtle">The filter lives in the address, so a filtered timeline can be bookmarked or shared.</p>
    </form>
  );
}

export function timelineFilter(): { from?: string; to?: string; q?: string } {
  const params = new URLSearchParams(window.location.search);
  return { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, q: params.get("q") ?? undefined };
}

/* ----------------------------- HQ-010 ----------------------------- */

export function StartConversation({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const { actor } = useWorkspace();
  const initial = members.find((member) => member.id === context.selectedId);
  const [who, setWho] = useState(initial?.title ?? members.find((member) => member.title !== actor)?.title ?? "");
  const [text, setText] = useState("");
  return (
    <form
      id="hq-conversation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!who || !text.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: text.trim().slice(0, 48),
          status: "sent",
          summary: text.trim(),
          at: new Date().toISOString(),
          tags: ["local", "direct"],
          fields: { author: actor, kind: "human", to: who, channel: `${actor} and ${who}` },
        }, `${actor} started a conversation with ${who}`);
        context.toast("Conversation started", `Your message to ${who} is in Communications.`);
        close();
      }}
    >
      <Field label="With">
        <Select value={who} onChange={(event) => setWho(event.target.value)}>
          {members.filter((member) => member.title !== actor).map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Message" required><TextArea value={text} onChange={(event) => setText(event.target.value)} rows={4} required /></Field>
      <Notice tone="info">Kept in this workspace. Nothing is sent by email or chat outside it.</Notice>
    </form>
  );
}

export function AssignTaskTo({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const initial = members.find((member) => member.id === context.selectedId);
  const [who, setWho] = useState(initial?.title ?? members[0]?.title ?? "");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <form
      id="hq-assign-task"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!who || !title.trim()) return;
        await context.mutate.create({
          collection: "tasks",
          title: title.trim(),
          status: "ready",
          dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : undefined,
          fields: { stage: "ready", assignee: who, assignedBy: context.actor },
        }, `${title.trim()} assigned to ${who}`);
        context.toast("Task assigned", `${who} has ${title.trim()}.`);
        close();
      }}
    >
      <Field label="Assign to">
        <Select value={who} onChange={(event) => setWho(event.target.value)}>
          {members.map((member) => <option key={member.id} value={member.title}>{member.title}{member.fields.kind === "ai" ? " (AI employee)" : ""}</option>)}
        </Select>
      </Field>
      <Field label="Task" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Due"><TextInput type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
    </form>
  );
}

export function FindColleague({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["members", "departments"]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = data.members.filter((member) => !q || `${member.title} ${member.fields.title ?? ""} ${member.summary}`.toLowerCase().includes(q));
  return (
    <Stack gap={3}>
      <Field label="Name, role or what they do">
        <TextInput autoFocus value={query} onChange={(event) => setQuery(event.target.value)} type="search" />
      </Field>
      {hits.length === 0 && <span className="ds-subtle">Nobody matches “{query}”.</span>}
      {hits.map((member) => (
        <button
          key={member.id}
          type="button"
          className="ds-record-card"
          onClick={() => { close(); context.select(member.id); context.openOverlay("Profile quick view", { id: member.id }); }}
        >
          <Row gap={2}>
            <Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />
            <strong className="ds-grow" style={{ textAlign: "start" }}>{member.title}</strong>
            {member.fields.kind === "ai" && <Pill tone="accent">AI</Pill>}
          </Row>
          <span className="ds-subtle">
            {String(member.fields.title ?? "")} · {data.departments.find((dept) => dept.id === member.fields.departmentId)?.title ?? "No department"}
          </span>
        </button>
      ))}
    </Stack>
  );
}

export function guardSelection(context: ScreenContext, what: string): string | undefined {
  return context.selectedId ? undefined : `Select ${what} first`;
}
