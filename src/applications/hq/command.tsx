import { useMemo, useState } from "react";
import { Building2, CheckCheck, Gavel, Plus, Target, Trash2 } from "lucide-react";
import {
  Button, Card, Empty, Field, Meter, Notice, Pill, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { PRIORITY_LABEL, PRIORITY_TONE, routeForRecord, type Priority } from "@/platform/attention";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { activeQueue, useInboxData, writeTriage, type InboxItem } from "@/applications/inbox/engine";
import {
  CONFIDENCE_LABEL, CONFIDENCE_TONE, HEALTH_RANK, checkIns, confidence, decisionLog, decisionsDueForReview,
  departmentHealth, keyResults, krProgress, newKeyResultId, objectiveProgress, validateKeyResult, withCheckIn,
  type Confidence, type KeyResult,
} from "./model";
import "./command.css";

/* ====================================================================== *
 * HQ command centre: the exception queue, objectives with key results,
 * department health and the decision log. Every row opens a real record.
 * ====================================================================== */

interface Exception {
  id: string;
  priority: Priority;
  title: string;
  body: string;
  group: string;
  at: string;
  route?: string;
  item?: InboxItem;
}

const EXCEPTION_KINDS = new Set(["overdue", "interruption", "assignment", "system"]);

function useExceptions(): { list: Exception[]; groups: { label: string; count: number }[] } {
  const { items } = useInboxData();
  const assets = useCollection("assets");
  const { now, org } = useWorkspace();
  return useMemo(() => {
    const list: Exception[] = activeQueue(items)
      .filter((item) => EXCEPTION_KINDS.has(item.kind) && item.priority <= "P3")
      .map((item) => ({ id: item.id, priority: item.priority, title: item.title, body: item.body, group: item.group, at: item.at, route: item.route?.replace(":org", org.slug), item }));
    // Licences that lapse on assets still in use: the asset library's own rule.
    for (const asset of assets) {
      if (asset.status === "archived" || !String(asset.fields.usedIn ?? "").trim()) continue;
      const expiry = typeof asset.fields.licenceExpiry === "string" ? Date.parse(asset.fields.licenceExpiry) : Number.NaN;
      if (!Number.isFinite(expiry)) continue;
      const days = Math.round((expiry - now.getTime()) / 86_400_000);
      if (days > 14) continue;
      list.push({
        id: `asset-licence-${asset.id}`,
        priority: days < 0 ? "P1" : "P2",
        title: days < 0 ? `${asset.title}: licence expired and still in use` : `${asset.title}: licence ends in ${days} days`,
        body: `Used in ${String(asset.fields.usedIn)}. Renew or replace it.`,
        group: "Assets",
        at: String(asset.fields.licenceExpiry),
        route: `/o/${org.slug}/asset/assets/${asset.id}`,
      });
    }
    list.sort((a, b) => (a.priority === b.priority ? b.at.localeCompare(a.at) : a.priority.localeCompare(b.priority)));
    const counts = new Map<string, number>();
    for (const entry of list) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    return { list, groups: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) };
  }, [items, assets, now, org.slug]);
}

export function ExceptionsCard({ context, span = 7 }: { context: ScreenContext; span?: 5 | 7 | 12 }) {
  const { list, groups } = useExceptions();
  const [group, setGroup] = useState("all");
  const [busy, setBusy] = useState("");
  const shown = (group === "all" ? list : list.filter((entry) => entry.group === group)).slice(0, 6);
  const total = group === "all" ? list.length : list.filter((entry) => entry.group === group).length;

  return (
    <Card
      span={span}
      eyebrow="Exceptions"
      prov="posted"
      title="Needs attention"
      subtitle={`${list.length} open ${list.length === 1 ? "exception" : "exceptions"} across the workspace`}
      actions={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/inbox`)}>Open the inbox</Button>}
    >
      {list.length === 0 ? (
        <Empty title="No exceptions" icon={<CheckCheck size={20} />}>Nothing is overdue, stopped or about to lapse.</Empty>
      ) : (
        <Stack gap={3}>
          <div className="hqc-chips" role="group" aria-label="Exception source">
            <button type="button" className="hqc-chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>All <span className="ds-num">{list.length}</span></button>
            {groups.map((entry) => (
              <button key={entry.label} type="button" className="hqc-chip" aria-pressed={group === entry.label} onClick={() => setGroup(entry.label)}>
                {entry.label} <span className="ds-num">{entry.count}</span>
              </button>
            ))}
          </div>
          <ul className="hqc-list" aria-label="Exceptions">
            {shown.map((entry) => (
              <li key={entry.id} className="hqc-row">
                <Pill tone={PRIORITY_TONE[entry.priority]} dot>{PRIORITY_LABEL[entry.priority]}</Pill>
                <div className="hqc-row-main">
                  <strong className="hqc-row-title">{entry.title}</strong>
                  <span className="ds-subtle hqc-row-sub">{entry.group} · {context.relative(entry.at)} · {entry.body}</span>
                </div>
                <div className="hqc-row-actions">
                  {entry.route && <Button size="sm" variant="secondary" aria-label={`Open ${entry.title}`} onClick={() => context.navigate(entry.route!)}>Open</Button>}
                  {entry.item && !entry.item.acknowledged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={busy === entry.id}
                      aria-label={`Acknowledge ${entry.title}`}
                      onClick={async () => {
                        setBusy(entry.id);
                        try {
                          await writeTriage(context.mutate, entry.item!, { read: true, acknowledged: true }, `Acknowledged from Executive Home: ${entry.title}`);
                          context.toast("Acknowledged", "Recorded that you have seen it. The record still needs its own action.");
                        } finally { setBusy(""); }
                      }}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {total > shown.length && <span className="ds-subtle">{total - shown.length} more in the inbox.</span>}
        </Stack>
      )}
    </Card>
  );
}

/* ----------------------------- Objectives ----------------------------- */

const CONFIDENCE_ORDER: Record<Confidence, number> = { off_track: 0, at_risk: 1, on_track: 2 };

export function ObjectivesCard({ context, span = 5 }: { context: ScreenContext; span?: 5 | 7 | 12 }) {
  const objectives = useCollection("objectives");
  const { now } = useWorkspace();
  const rows = objectives
    .filter((row) => row.status === "active")
    .map((row) => ({ row, progress: objectiveProgress(row), confidence: confidence(row, now) }))
    .sort((a, b) => CONFIDENCE_ORDER[a.confidence.value] - CONFIDENCE_ORDER[b.confidence.value] || a.progress.ratio - b.progress.ratio);
  const off = rows.filter((entry) => entry.confidence.value !== "on_track").length;

  return (
    <Card
      span={span}
      eyebrow="Objectives"
      prov="human"
      title="Objectives"
      subtitle={rows.length ? `${rows.length} active · ${off} need a look` : "None active"}
      actions={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/hq/goals`)}>All objectives</Button>}
    >
      {rows.length === 0 ? (
        <Empty title="No active objectives" icon={<Target size={20} />}>Set one in Company Goals.</Empty>
      ) : (
        <ul className="hqc-list" aria-label="Active objectives">
          {rows.slice(0, 5).map(({ row, progress, confidence: conf }) => (
            <li key={row.id} className="hqc-objective">
              <Row gap={2}>
                <strong className="ds-grow ds-truncate" title={row.title}>{row.title}</strong>
                <Pill tone={CONFIDENCE_TONE[conf.value]}>{CONFIDENCE_LABEL[conf.value]}</Pill>
              </Row>
              <Meter value={Math.round(progress.ratio * 100)} max={100} label={`${row.title} progress`} tone={conf.value === "off_track" ? "danger" : conf.value === "at_risk" ? "warning" : "success"} />
              <Row gap={2}>
                <span className="ds-subtle ds-grow">
                  {Math.round(progress.ratio * 100)}% · {progress.source === "key results" ? `${progress.done} of ${progress.total} key results met` : `measured on ${String(row.fields.measure ?? "one measure")}`}
                </span>
                <Button size="sm" variant="ghost" aria-label={`Check in on ${row.title}`} onClick={() => context.openOverlay("key results", { id: row.id })}>Check in</Button>
              </Row>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Key results inside an objective card on Company Goals. */
export function ObjectiveKeyResults({ context, objective }: { context: ScreenContext; objective: Rec }) {
  const { now } = useWorkspace();
  const list = keyResults(objective);
  const progress = objectiveProgress(objective);
  const conf = confidence(objective, now);
  const last = checkIns(objective).at(-1);
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Pill tone={CONFIDENCE_TONE[conf.value]}>{CONFIDENCE_LABEL[conf.value]}</Pill>
        <span className="ds-subtle">{conf.set === "owner" ? conf.reason : `Computed: ${conf.reason}`}</span>
      </Row>
      <Meter value={Math.round(progress.ratio * 100)} max={100} label={`${objective.title} progress`} tone={conf.value === "off_track" ? "danger" : conf.value === "at_risk" ? "warning" : "success"} />
      {list.length > 0 ? (
        <ul className="hqc-list" aria-label={`Key results for ${objective.title}`}>
          {list.map((kr) => (
            <li key={kr.id} className="hqc-kr">
              <span className="hqc-kr-title">{kr.title}</span>
              <span className="ds-num hqc-kr-figure">{kr.current}{kr.unit ? ` ${kr.unit}` : ""} <span className="ds-subtle">/ {kr.target}</span></span>
              <Meter value={Math.round(krProgress(kr) * 100)} max={100} label={`${kr.title} progress`} tone={krProgress(kr) >= 1 ? "success" : undefined} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="ds-subtle">No key results yet; progress is read from the single measure.</p>
      )}
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onClick={() => context.openOverlay("key results", { id: objective.id })}>{list.length ? "Check in" : "Add key results"}</Button>
        {last && <span className="ds-subtle">Last check-in {context.relative(last.at)} by {last.by}</span>}
      </Row>
    </Stack>
  );
}

export function KeyResultsEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const objective = useRecord(payload?.id ?? context.selectedId);
  const { now } = useWorkspace();
  const [values, setValues] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<KeyResult[]>([]);
  const [draft, setDraft] = useState({ title: "", start: "", target: "", unit: "" });
  const [draftError, setDraftError] = useState("");
  const [note, setNote] = useState("");
  const [conf, setConf] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  if (!objective) return <Empty title="No objective selected" icon={<Target size={20} />}>Choose an objective first.</Empty>;

  const existing = keyResults(objective);
  const working = [...existing.filter((kr) => !removed.includes(kr.id)), ...added];
  const numeric: Record<string, number> = {};
  for (const [id, value] of Object.entries(values)) if (value.trim() !== "" && Number.isFinite(Number(value))) numeric[id] = Number(value);
  const at = clockIso();
  const next = withCheckIn(working, numeric, at);
  const preview = objectiveProgress({ ...objective, body: { ...(objective.body as object), keyResults: next } });
  const invalid = Object.entries(values).some(([, value]) => value.trim() !== "" && !Number.isFinite(Number(value)));
  const confidenceValue = conf ?? String(objective.fields.confidence ?? "");
  const changed = Object.keys(numeric).some((id) => working.find((kr) => kr.id === id)?.current !== numeric[id]) || removed.length > 0 || added.length > 0 || note.trim() !== "" || confidenceValue !== String(objective.fields.confidence ?? "");

  function addDraft() {
    const error = validateKeyResult(draft);
    if (error) { setDraftError(error); return; }
    const start = draft.start.trim() === "" ? 0 : Number(draft.start);
    setAdded((current) => [...current, { id: newKeyResultId([...existing, ...current]), title: draft.title.trim(), start, current: start, target: Number(draft.target), unit: draft.unit.trim(), owner: context.actor, updatedAt: at }]);
    setDraft({ title: "", start: "", target: "", unit: "" });
    setDraftError("");
  }

  return (
    <Stack gap={4}>
      <div>
        <strong>{objective.title}</strong>
        <p className="ds-subtle">{objective.summary}</p>
      </div>
      {working.length === 0 && <Notice tone="info" title="No key results yet">Add two or three measurable results. Progress is then the average of how far each has moved from its start to its target.</Notice>}
      {working.length > 0 && (
        <ul className="hqc-list" aria-label="Key results">
          {working.map((kr) => {
            const value = values[kr.id] ?? String(kr.current);
            const live = { ...kr, current: Number.isFinite(Number(value)) ? Number(value) : kr.current };
            return (
              <li key={kr.id} className="hqc-kr-edit">
                <div className="hqc-kr-edit-main">
                  <strong>{kr.title}</strong>
                  <span className="ds-subtle">From {kr.start} to {kr.target}{kr.unit ? ` ${kr.unit}` : ""}{kr.updatedAt ? ` · updated ${context.relative(kr.updatedAt)}` : ""}</span>
                  <Meter value={Math.round(krProgress(live) * 100)} max={100} label={`${kr.title} progress`} />
                </div>
                <TextInput
                  aria-label={`Current value for ${kr.title}`}
                  inputMode="decimal"
                  align="end"
                  value={value}
                  invalid={value.trim() !== "" && !Number.isFinite(Number(value))}
                  onChange={(event) => setValues((current) => ({ ...current, [kr.id]: event.target.value }))}
                  style={{ width: 96 }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${kr.title}`}
                  onClick={() => {
                    if (added.some((entry) => entry.id === kr.id)) setAdded((current) => current.filter((entry) => entry.id !== kr.id));
                    else setRemoved((current) => [...current, kr.id]);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <fieldset className="hqc-fieldset">
        <legend>Add a key result</legend>
        <Field label="Key result" error={draftError || undefined}>
          <TextInput value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setDraftError(""); }} placeholder="Trade accounts opened" />
        </Field>
        <Row gap={2} wrap>
          <div className="hqc-num"><Field label="Start"><TextInput inputMode="decimal" align="end" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} placeholder="0" /></Field></div>
          <div className="hqc-num"><Field label="Target"><TextInput inputMode="decimal" align="end" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} /></Field></div>
          <div className="hqc-num"><Field label="Unit"><TextInput value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="accounts" /></Field></div>
        </Row>
        <Row gap={2}><Button size="sm" variant="secondary" onClick={addDraft}><Plus size={14} /> Add key result</Button></Row>
      </fieldset>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Confidence" hint={`Leave on computed to follow progress. Now: ${CONFIDENCE_LABEL[confidence(objective, now).value]}.`}>
            <Select value={confidenceValue} onChange={(event) => setConf(event.target.value)}>
              <option value="">Computed from progress</option>
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="off_track">Off track</option>
            </Select>
          </Field>
        </div>
        <div style={{ flex: "2 1 260px" }}>
          <Field label="Check-in note" hint="What moved and why. Kept with the objective.">
            <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
      </Row>
      <Row gap={2}>
        <span className="ds-subtle">Progress after saving: <strong className="ds-num">{Math.round(preview.ratio * 100)}%</strong></span>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          busy={busy}
          disabled={!changed || invalid}
          onClick={async () => {
            setBusy(true);
            try {
              const history = [...checkIns(objective), { at, by: context.actor, note: note.trim(), progress: preview.ratio }].slice(-20);
              const fields: Rec["fields"] = { ...objective.fields, confidence: confidenceValue };
              if (confidenceValue) fields.confidenceBy = context.actor;
              const saved = await context.mutate.patch(objective.id, {
                body: { ...(objective.body as object), keyResults: next, checkIns: history },
                fields,
              }, { event: `Objective check-in: ${objective.title} at ${Math.round(preview.ratio * 100)}%${note.trim() ? ` — ${note.trim()}` : ""}`, expectRevision: objective.revision });
              if (saved) context.toast("Check-in saved", `${objective.title} is at ${Math.round(preview.ratio * 100)}%.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Save check-in
        </Button>
      </Row>
    </Stack>
  );
}

/* ----------------------------- Departments ----------------------------- */

export function DepartmentHealthCard({ context, span = 7 }: { context: ScreenContext; span?: 5 | 7 | 12 }) {
  const data = useCollections(["departments", "members", "tasks", "risks", "objectives"]);
  const { now } = useWorkspace();
  const rows = data.departments
    .map((department) => departmentHealth(department, { members: data.members, tasks: data.tasks, risks: data.risks, objectives: data.objectives, now }))
    .sort((a, b) => HEALTH_RANK[a.status] - HEALTH_RANK[b.status] || b.overdue - a.overdue || a.title.localeCompare(b.title));
  const attention = rows.filter((row) => row.status === "attention").length;
  return (
    <Card
      span={span}
      eyebrow="Departments"
      prov="posted"
      title="Department health"
      subtitle={rows.length ? `${attention} of ${rows.length} need attention` : "No departments"}
      actions={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/hq/departments`)}>Directory</Button>}
    >
      {rows.length === 0 ? (
        <Empty title="No departments" icon={<Building2 size={20} />}>Create one in the Departments directory.</Empty>
      ) : (
        <ul className="hqc-list" aria-label="Department health">
          {rows.map((row) => (
            <li key={row.id} className="hqc-dept">
              <button type="button" className="hqc-link" onClick={() => context.navigate(`/o/${context.org.slug}/hq/departments/${row.id}`)}>{row.title}</button>
              <span className="hqc-dept-figures ds-subtle">
                <span><strong className="ds-num">{row.people}</strong> people{row.agents ? ` + ${row.agents} AI` : ""}</span>
                <span><strong className="ds-num">{row.open}</strong> open</span>
                <span className={row.overdue ? "hqc-warn" : undefined}><strong className="ds-num">{row.overdue}</strong> overdue</span>
              </span>
              <span className="hqc-dept-status">
                <Pill tone={row.status === "attention" ? "danger" : row.status === "watch" ? "warning" : "success"}>{row.status === "attention" ? "Needs attention" : row.status === "watch" ? "Watch" : "Steady"}</Pill>
              </span>
              {row.reasons.length > 0 && <span className="ds-subtle hqc-dept-reason">{row.reasons.join(" · ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ----------------------------- Decisions ----------------------------- */

const LINKABLE_DECISION = ["objectives", "departments", "projects", "risks", "approvals", "deals", "contracts"];

function useDecisionTargets(): Rec[] {
  const data = useCollections(LINKABLE_DECISION);
  return useMemo(() => LINKABLE_DECISION.flatMap((name) => data[name] ?? []), [data]);
}

function hqRoute(record: Rec, slug: string): string | undefined {
  if (record.collection === "objectives") return `/o/${slug}/hq/goals`;
  if (record.collection === "departments") return `/o/${slug}/hq/departments/${record.id}`;
  if (record.collection === "risks") return `/o/${slug}/hq/company?tab=Compliance`;
  if (record.collection === "approvals") return `/o/${slug}/inbox/approvals?tab=History`;
  return routeForRecord(record, slug);
}

export function DecisionsCard({ context, span = 5 }: { context: ScreenContext; span?: 5 | 7 | 12 }) {
  const events = useCollection("timelineEvents");
  const { now } = useWorkspace();
  const log = decisionLog(events);
  const due = decisionsDueForReview(events, now);
  return (
    <Card
      span={span}
      eyebrow="Decisions"
      prov="human"
      title="Decision log"
      subtitle={`${log.length} recorded${due.length ? ` · ${due.length} due for review` : ""}`}
      actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("log decision")}><Gavel size={14} /> Log a decision</Button>}
    >
      {log.length === 0 ? (
        <Empty title="No decisions recorded" icon={<Gavel size={20} />}>Record what was decided, by whom and why, so the reasoning outlives the meeting.</Empty>
      ) : (
        <Stack gap={3}>
          <ul className="hqc-list" aria-label="Recent decisions">
            {log.slice(0, 4).map((event) => <DecisionRow key={event.id} context={context} event={event} />)}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/hq/timeline?tab=Decisions`)}>Whole decision log</Button>
        </Stack>
      )}
    </Card>
  );
}

export function DecisionRow({ context, event, withHeading = true }: { context: ScreenContext; event: Rec; withHeading?: boolean }) {
  const { now } = useWorkspace();
  const reviewBy = typeof event.fields.reviewBy === "string" ? event.fields.reviewBy : "";
  const overdueReview = reviewBy && Date.parse(reviewBy) <= now.getTime() && !event.fields.reviewedAt;
  const route = typeof event.fields.linkedRoute === "string" && event.fields.linkedRoute ? event.fields.linkedRoute.replace(":org", context.org.slug) : undefined;
  return (
    <li className="hqc-decision">
      {withHeading && (
        <Row gap={2}>
          <strong className="ds-grow">{event.title}</strong>
          <span className="ds-num ds-subtle">{context.date(event.at ?? event.updatedAt)}</span>
        </Row>
      )}
      {event.summary && <span className="ds-subtle">{event.summary}</span>}
      <Row gap={2} wrap>
        <span className="ds-subtle">{event.fields.decidedBy ? `Decided by ${String(event.fields.decidedBy)}` : "Decider not recorded"}</span>
        {overdueReview && <Pill tone="warning">Review due</Pill>}
        {event.fields.reviewedAt ? <Pill tone="success">Reviewed</Pill> : null}
        {route && <Button size="sm" variant="ghost" onClick={() => context.navigate(route)}>{String(event.fields.linkedTitle ?? "Related record")}</Button>}
        {overdueReview && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await context.mutate.patch(event.id, { fields: { ...event.fields, reviewedAt: clockIso(), reviewedBy: context.actor } }, { event: `Decision reviewed: ${event.title}`, expectRevision: event.revision });
              context.toast("Review recorded", `${event.title} was looked at again by ${context.actor}.`);
            }}
          >
            Mark reviewed
          </Button>
        )}
      </Row>
    </li>
  );
}

export function DecisionEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const targets = useDecisionTargets();
  const members = useCollection("members");
  const today = context.now.toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [decidedBy, setDecidedBy] = useState(context.actor);
  const [date, setDate] = useState(today);
  const [linked, setLinked] = useState("");
  const [reviewBy, setReviewBy] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people = [...new Set([context.actor, ...members.filter((member) => member.fields.kind !== "ai").map((member) => member.title)])];
  const grouped = LINKABLE_DECISION.map((name) => ({ name, rows: targets.filter((row) => row.collection === name && row.status !== "archived") })).filter((group) => group.rows.length);

  return (
    <Stack gap={4}>
      <Field label="Decision" required error={error || undefined}>
        <TextInput value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="Qualify a second brass supplier" autoFocus />
      </Field>
      <Field label="Why" hint="The reasoning and the options that were turned down.">
        <TextArea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} />
      </Field>
      <Row gap={3} wrap>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Decided by">
            <Select value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)}>
              {people.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Decided on"><TextInput type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} /></Field>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Review by" hint="Optional."><TextInput type="date" value={reviewBy} min={date} onChange={(event) => setReviewBy(event.target.value)} /></Field>
        </div>
      </Row>
      <Field label="Related record" hint="Optional. The decision links back to it.">
        <Select value={linked} onChange={(event) => setLinked(event.target.value)}>
          <option value="">None</option>
          {grouped.map((group) => (
            <optgroup key={group.name} label={group.name.charAt(0).toUpperCase() + group.name.slice(1)}>
              {group.rows.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Row gap={2}>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            if (!title.trim()) { setError("Say what was decided."); return; }
            setBusy(true);
            try {
              const target = targets.find((row) => row.id === linked);
              const at = date === today ? clockIso() : new Date(`${date}T12:00:00.000Z`).toISOString();
              await context.mutate.create({
                collection: "timelineEvents",
                title: title.trim(),
                status: "recorded",
                summary: rationale.trim(),
                at,
                fields: {
                  kind: "decision", decidedBy, recordedBy: context.actor,
                  ...(target ? { linkedId: target.id, linkedTitle: target.title, linkedRoute: hqRoute(target, context.org.slug) ?? "" } : {}),
                  ...(reviewBy ? { reviewBy: new Date(`${reviewBy}T09:00:00.000Z`).toISOString() } : {}),
                },
              }, `Decision recorded: ${title.trim()} (decided by ${decidedBy})`);
              context.toast("Decision recorded", "It is in the decision log and on the company timeline.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Record decision
        </Button>
      </Row>
    </Stack>
  );
}
