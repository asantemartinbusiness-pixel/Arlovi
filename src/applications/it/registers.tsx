import { useState } from "react";
import { ClipboardCheck, GitPullRequest, HardDrive } from "lucide-react";
import {
  Button, Card, Checkbox, Empty, Field, Meter, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  ASSET_KINDS, approvalBlocker, changeFactors, configDiff, decisionBlocker, entriesFromMembers, parseConfig,
  readConfig, readEntries, reviewProgress, riskOf, submitBlockers, verificationAge,
  type Decision, type ReviewEntry, type RiskLevel,
} from "./register";
import { useItUi } from "./state";
import "./register.css";

/* ====================================================================== *
 * Change requests, asset & configuration records, and access reviews.
 * Every record lives in this workspace. Anything that would act on remote
 * infrastructure is recorded as a decision by a person and labelled as
 * such: no provider is connected, so nothing outside is changed from here.
 * ====================================================================== */

const RISK_TONE: Record<RiskLevel, "success" | "warning" | "danger"> = { low: "success", medium: "warning", high: "danger" };
const CHANGE_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Awaiting approval", approved: "Approved", rejected: "Rejected", implemented: "Implemented", rolled_back: "Rolled back",
};
const CHANGE_TONE: Record<string, "neutral" | "info" | "success" | "danger" | "warning"> = {
  draft: "neutral", submitted: "info", approved: "success", rejected: "danger", implemented: "success", rolled_back: "warning",
};

function sorted(records: Rec[]): Rec[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function RecordEvents({ context, id }: { context: ScreenContext; id: string }) {
  const events = useEvents(id);
  if (events.length === 0) return <p className="ds-subtle">Nothing recorded yet.</p>;
  return (
    <ol className="t6-timeline" aria-label="Record history">
      {events.slice(0, 8).map((event) => (
        <li key={event.id}>
          <div><strong className="ds-num">{context.dateTime(event.at)}</strong><div className="ds-subtle">{event.actor}</div></div>
          <div>{event.message}</div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ Change requests ------------------------------ */

export function ChangeRequests({ context }: { context: ScreenContext }) {
  const changes = sorted(useCollection("it_changes"));
  const [openId, setOpenId] = useState("");
  const current = changes.find((item) => item.id === openId) ?? changes[0];

  async function create() {
    const record = await context.mutate.create({
      collection: "it_changes", title: "New change request", status: "draft", ownerName: context.actor,
      summary: "", fields: { requestedBy: context.actor, scope: "single", reversible: true, tested: false, target: "local", plan: "", rollbackPlan: "", window: "" },
    }, "Change request drafted");
    setOpenId(record.id);
  }

  return (
    <section className="ds-stack ds-gap-3" aria-label="Change requests">
      <Row gap={2} wrap>
        <div className="ds-grow">
          <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Change requests</h2>
          <p className="ds-subtle" style={{ margin: 0 }}>Planned changes with a risk score, a rollback plan and a named approver.</p>
        </div>
        <Button variant="primary" onClick={() => void create()}>New change request</Button>
      </Row>
      {changes.length === 0 ? (
        <Empty title="No change requests" icon={<GitPullRequest size={20} />}>
          Draft one before changing anything that others depend on. Its risk is scored from what it touches, and medium or high risk needs a rollback plan.
        </Empty>
      ) : (
        <div className="it-split">
          <div className="it-list" role="list" aria-label="Change request list">
            {changes.map((item) => {
              const risk = riskOf(changeFactors(item));
              return (
                <div role="listitem" key={item.id}>
                  <button type="button" className="it-list-item" aria-pressed={item.id === current?.id} onClick={() => setOpenId(item.id)}>
                    <strong>{item.title}</strong>
                    <Row gap={2} wrap>
                      <Pill tone={CHANGE_TONE[item.status] ?? "neutral"} dot>{CHANGE_LABEL[item.status] ?? item.status}</Pill>
                      <Pill tone={RISK_TONE[risk.level]}>{risk.level} risk</Pill>
                      <span className="ds-subtle">{String(item.fields.window || "No window")}</span>
                    </Row>
                  </button>
                </div>
              );
            })}
          </div>
          {current && <ChangeEditor key={`${current.id}-${current.revision}`} context={context} record={current} />}
        </div>
      )}
    </section>
  );
}

function ChangeEditor({ context, record }: { context: ScreenContext; record: Rec }) {
  const members = useCollection("members").filter((member) => String(member.fields.kind ?? "human") === "human");
  const [draft, setDraft] = useState({
    title: record.title,
    plan: String(record.fields.plan ?? ""),
    rollbackPlan: String(record.fields.rollbackPlan ?? ""),
    window: String(record.fields.window ?? ""),
    scope: String(record.fields.scope ?? "single"),
    reversible: record.fields.reversible !== false,
    tested: record.fields.tested === true,
    target: String(record.fields.target ?? "local"),
  });
  const [approver, setApprover] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const editable = record.status === "draft" || record.status === "rejected";
  const preview: Rec = { ...record, title: draft.title, fields: { ...record.fields, ...draft } };
  const risk = riskOf(changeFactors(preview));
  const dirty = draft.title !== record.title || (["plan", "rollbackPlan", "window", "scope", "reversible", "tested", "target"] as const).some((key) => draft[key] !== (key === "reversible" ? record.fields.reversible !== false : key === "tested" ? record.fields.tested === true : String(record.fields[key] ?? "")));
  const submitIssues = submitBlockers(preview);
  const requester = String(record.fields.requestedBy ?? record.createdBy);
  const approverChoices = members.map((member) => member.title).filter((name) => name !== requester);
  const decideIssue = approver ? approvalBlocker(record, approver) : "Choose who approved it.";
  const remote = changeFactors(record).target === "remote";

  async function save(extra: Partial<Rec> = {}, event = `Change request ${draft.title} saved`) {
    await context.mutate.patch(record.id, {
      title: draft.title.trim() || "Untitled change",
      summary: draft.plan.slice(0, 140),
      ...extra,
      fields: { ...record.fields, ...draft, risk: risk.level, riskScore: risk.score, ...(extra.fields ?? {}) },
    }, { expectRevision: record.revision, event });
  }

  return (
    <Card eyebrow="CHANGE REQUEST" prov="human" title={record.title}
      subtitle={`Requested by ${requester} · ${CHANGE_LABEL[record.status] ?? record.status}`}
      actions={<Pill tone={RISK_TONE[risk.level]} dot>{risk.level} risk · {risk.score}</Pill>}>
      <Stack gap={4}>
        {editable ? (
          <Stack gap={3}>
            <Field label="Change" required><TextInput value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Implementation plan" required><TextArea rows={3} value={draft.plan} onChange={(event) => setDraft({ ...draft, plan: event.target.value })} /></Field>
            <Row gap={2} wrap>
              <Field label="Change window" required><TextInput type="date" value={draft.window} onChange={(event) => setDraft({ ...draft, window: event.target.value })} /></Field>
              <Field label="Who it affects">
                <Select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}>
                  <option value="single">One person</option>
                  <option value="team">A team</option>
                  <option value="workspace">The whole workspace</option>
                </Select>
              </Field>
              <Field label="Where it is applied">
                <Select value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}>
                  <option value="local">This workspace (local)</option>
                  <option value="remote">Remote infrastructure (not connected)</option>
                </Select>
              </Field>
            </Row>
            <Row gap={4} wrap>
              <Checkbox label="Can be reversed" checked={draft.reversible} onChange={(event) => setDraft({ ...draft, reversible: event.target.checked })} />
              <Checkbox label="Tested beforehand" checked={draft.tested} onChange={(event) => setDraft({ ...draft, tested: event.target.checked })} />
            </Row>
            <Field label="Rollback plan" hint={risk.level === "low" ? "Optional at low risk." : "Required: the risk is not low."}>
              <TextArea rows={2} value={draft.rollbackPlan} onChange={(event) => setDraft({ ...draft, rollbackPlan: event.target.value })} />
            </Field>
          </Stack>
        ) : (
          <Properties rows={[
            { label: "Plan", value: String(record.fields.plan || "—") },
            { label: "Window", value: <span className="ds-num">{String(record.fields.window || "—")}</span> },
            { label: "Applied to", value: remote ? <Pill tone="warning">Remote infrastructure · not connected</Pill> : <Pill tone="info">This workspace</Pill> },
            { label: "Rollback plan", value: String(record.fields.rollbackPlan || "None") },
            ...(record.fields.approvedBy ? [{ label: record.status === "rejected" ? "Rejected by" : "Approved by", value: `${String(record.fields.approvedBy)} (recorded by ${String(record.fields.decisionRecordedBy ?? "")})` }] : []),
            ...(record.fields.decisionNote ? [{ label: "Decision note", value: String(record.fields.decisionNote) }] : []),
          ]} />
        )}

        <div>
          <strong>Why the risk is {risk.level}</strong>
          {risk.reasons.length ? <ul className="it-blockers">{risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="ds-subtle">Reversible, tested, affects one person and stays local.</p>}
        </div>

        {editable && (
          <Stack gap={2}>
            {submitIssues.length > 0 && (
              <Notice tone="warning" title="Before it can be submitted">
                <ul className="it-blockers">{submitIssues.map((item) => <li key={item}>{item}</li>)}</ul>
              </Notice>
            )}
            <Row gap={2} wrap>
              <Button variant="secondary" disabled={!dirty} onClick={() => void save()}>Save draft</Button>
              <Button variant="primary" disabled={submitIssues.length > 0} onClick={() => void save({ status: "submitted" }, `Change request ${draft.title} submitted for approval (${risk.level} risk)`)}>Submit for approval</Button>
            </Row>
          </Stack>
        )}

        {record.status === "submitted" && (
          <Stack gap={2}>
            <Row gap={2} wrap>
              <Field label="Approver">
                <Select value={approver} onChange={(event) => setApprover(event.target.value)}>
                  <option value="">Choose who decided</option>
                  {approverChoices.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </Field>
              <div className="ds-grow" style={{ minWidth: 200 }}>
                <Field label="Decision note"><TextInput value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></Field>
              </div>
            </Row>
            {decideIssue && approver && <Notice tone="warning" title="Cannot be approved yet">{decideIssue}</Notice>}
            <p className="ds-subtle">The requester cannot approve their own change. You record the decision; the approver is named on it.</p>
            <Row gap={2} wrap>
              <Button variant="primary" disabled={Boolean(decideIssue)} onClick={() => void context.mutate.patch(record.id, {
                status: "approved", fields: { ...record.fields, approvedBy: approver, decisionRecordedBy: context.actor, decidedAt: clockIso(), decisionNote },
              }, { expectRevision: record.revision, event: `Change ${record.title} approved by ${approver} (recorded by ${context.actor})` })}>Record approval</Button>
              <Button variant="outline-danger" disabled={!approver || !decisionNote.trim()} onClick={() => void context.mutate.patch(record.id, {
                status: "rejected", fields: { ...record.fields, approvedBy: approver, decisionRecordedBy: context.actor, decidedAt: clockIso(), decisionNote },
              }, { expectRevision: record.revision, event: `Change ${record.title} rejected by ${approver}: ${decisionNote}` })}>Record rejection</Button>
            </Row>
          </Stack>
        )}

        {record.status === "approved" && (
          <Stack gap={2}>
            {remote && (
              <Notice tone="warning" title="This change is carried out outside Arlovi">
                The target is remote infrastructure that this workspace is not connected to. Marking it implemented records that a person did the work; nothing is executed from here.
              </Notice>
            )}
            <Row gap={2} wrap>
              <Button variant="primary" onClick={() => void context.mutate.patch(record.id, { status: "implemented", endAt: clockIso(), fields: { ...record.fields, implementedBy: context.actor } }, { expectRevision: record.revision, event: `Change ${record.title} ${remote ? "recorded as implemented outside the workspace" : "implemented"} by ${context.actor}` })}>
                {remote ? "Record as implemented" : "Mark implemented"}
              </Button>
            </Row>
          </Stack>
        )}

        {record.status === "implemented" && (
          <Row gap={2} wrap>
            <Button variant="outline-danger" disabled={record.fields.reversible === false} title={record.fields.reversible === false ? "This change was declared irreversible" : undefined}
              onClick={() => void context.mutate.patch(record.id, { status: "rolled_back", fields: { ...record.fields, rolledBackBy: context.actor } }, { expectRevision: record.revision, event: `Change ${record.title} rolled back by ${context.actor}` })}>Record a rollback</Button>
          </Row>
        )}

        <div>
          <strong>History</strong>
          <RecordEvents context={context} id={record.id} />
        </div>
      </Stack>
    </Card>
  );
}

/* ------------------------------ Assets and configuration ------------------------------ */

function LocalEvidence() {
  const ui = useItUi();
  const storage = ui.storage;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return (
    <Card eyebrow="LOCAL EVIDENCE" prov="posted" title="This browser workspace" subtitle="Observed directly, now">
      <Properties rows={[
        { label: "Origin", value: <span className="ds-num">{typeof window !== "undefined" ? window.location.origin : "unknown"}</span> },
        { label: "Database", value: typeof indexedDB !== "undefined" ? <Pill tone="success">IndexedDB available</Pill> : <Pill tone="danger">IndexedDB unavailable</Pill> },
        { label: "Language", value: nav?.language ?? "unknown" },
        { label: "Logical processors", value: nav?.hardwareConcurrency ? <span className="ds-num">{String(nav.hardwareConcurrency)}</span> : "Not reported" },
        { label: "Storage used", value: storage?.supported ? <span className="ds-num">{`${Math.round((storage.usageBytes ?? 0) / 1024)} KB`}</span> : "Run the checks to measure" },
        { label: "Online", value: nav?.onLine ? <Pill tone="success">yes</Pill> : <Pill tone="warning">no</Pill> },
      ]} />
    </Card>
  );
}

export function AssetRegister({ context }: { context: ScreenContext }) {
  const assets = sorted(useCollection("it_assets"));
  const [openId, setOpenId] = useState("");
  const current = assets.find((item) => item.id === openId) ?? assets[0];
  const remoteCount = assets.filter((item) => String(item.fields.location) === "remote").length;

  async function create() {
    const record = await context.mutate.create({
      collection: "it_assets", title: "New asset", status: "active", ownerName: context.actor, summary: "",
      fields: { kind: "service", location: "remote", owner: context.actor },
      body: { config: [] },
    }, "Asset registered");
    setOpenId(record.id);
  }

  return (
    <section className="ds-stack ds-gap-4" aria-label="Assets and configuration">
      <Row gap={2} wrap>
        <div className="ds-grow">
          <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Assets and configuration</h2>
          <p className="ds-subtle" style={{ margin: 0 }}>
            Local evidence is measured in this browser. Remote assets are declared by a person and checked by hand: {remoteCount} of {assets.length} registered assets are remote and not connected.
          </p>
        </div>
        <Button variant="primary" onClick={() => void create()}>Register an asset</Button>
      </Row>
      <div className="it-split">
        <Stack gap={3}>
          <LocalEvidence />
          {assets.length === 0 ? (
            <Empty title="No assets registered" icon={<HardDrive size={20} />}>Register the laptops, services, domains and configuration this workspace depends on.</Empty>
          ) : (
            <div className="it-list" role="list" aria-label="Registered assets">
              {assets.map((item) => {
                const remote = String(item.fields.location) === "remote";
                const age = verificationAge(item, context.now);
                return (
                  <div role="listitem" key={item.id}>
                    <button type="button" className="it-list-item" aria-pressed={item.id === current?.id} onClick={() => setOpenId(item.id)}>
                      <strong>{item.title}</strong>
                      <Row gap={2} wrap>
                        <Pill tone="neutral">{String(item.fields.kind ?? "service")}</Pill>
                        {remote ? <Pill tone="warning" dot>Remote · not connected</Pill> : <Pill tone="info" dot>Local</Pill>}
                        <span className="ds-subtle">{!remote ? "Held as a record here" : age === undefined ? "Never checked by hand" : `Checked by hand ${age} d ago`}</span>
                      </Row>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Stack>
        {current && <AssetEditor key={`${current.id}-${current.revision}`} context={context} record={current} />}
      </div>
    </section>
  );
}

function AssetEditor({ context, record }: { context: ScreenContext; record: Rec }) {
  const config = readConfig(record);
  const [title, setTitle] = useState(record.title);
  const [kind, setKind] = useState(String(record.fields.kind ?? "service"));
  const [location, setLocation] = useState(String(record.fields.location ?? "remote"));
  const [owner, setOwner] = useState(String(record.fields.owner ?? ""));
  const [configText, setConfigText] = useState(config.map((item) => `${item.key} = ${item.value}`).join("\n"));
  const [checkNote, setCheckNote] = useState("");
  const nextConfig = parseConfig(configText);
  const diff = configDiff(config, nextConfig);
  const dirty = diff.length > 0 || title !== record.title || kind !== String(record.fields.kind ?? "service") || location !== String(record.fields.location ?? "remote") || owner !== String(record.fields.owner ?? "");
  const remote = location === "remote";
  const age = verificationAge(record, context.now);

  return (
    <Card eyebrow="ASSET" prov={remote ? "human" : "posted"} title={record.title}
      subtitle={remote ? "Declared by a person. This workspace cannot observe it." : "Lives in this workspace"}
      actions={remote ? <Pill tone="warning" dot>Not connected</Pill> : <Pill tone="info" dot>Local</Pill>}>
      <Stack gap={3}>
        <Field label="Name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Row gap={2} wrap>
          <Field label="Kind">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              {ASSET_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label="Where it runs">
            <Select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="local">This workspace (local)</option>
              <option value="remote">Remote (not connected)</option>
            </Select>
          </Field>
          <Field label="Owner"><TextInput value={owner} onChange={(event) => setOwner(event.target.value)} /></Field>
        </Row>
        <Field label="Configuration" hint="One setting per line, as key = value. Changes are shown as a diff and recorded.">
          <TextArea rows={5} value={configText} onChange={(event) => setConfigText(event.target.value)} style={{ fontFamily: "var(--font-mono, monospace)" }} />
        </Field>
        {diff.length > 0 && (
          <div>
            <strong>Configuration change</strong>
            <pre className="it-diff" aria-label="Configuration diff">{diff.join("\n")}</pre>
          </div>
        )}
        <Row gap={2} wrap>
          <Button variant="primary" disabled={!dirty || !title.trim()} onClick={() => void context.mutate.patch(record.id, {
            title: title.trim(), ownerName: owner || record.ownerName,
            fields: { ...record.fields, kind, location, owner },
            body: { ...(record.body && typeof record.body === "object" ? record.body as Record<string, unknown> : {}), config: nextConfig },
          }, { expectRevision: record.revision, event: `Asset ${title.trim()} saved${diff.length ? `; configuration: ${diff.join("; ")}` : ""}` })}>Save asset</Button>
        </Row>

        {remote ? (
          <Stack gap={2}>
            <Notice tone="warning" title="Remote state is not observed">
              No connector reaches this asset, so its real configuration may differ from what is written here. A hand check records that a person looked, when, and what they saw.
            </Notice>
            <Properties rows={[
              { label: "Last hand check", value: age === undefined ? "Never" : `${context.dateTime(String(record.fields.verifiedAt))} by ${String(record.fields.verifiedBy ?? "")}` },
              ...(record.fields.verifiedNote ? [{ label: "What they saw", value: String(record.fields.verifiedNote) }] : []),
            ]} />
            <Row gap={2} wrap style={{ alignItems: "flex-end" }}>
              <div className="ds-grow" style={{ minWidth: 200 }}>
                <Field label="What you checked"><TextInput value={checkNote} onChange={(event) => setCheckNote(event.target.value)} /></Field>
              </div>
              <Button variant="secondary" disabled={!checkNote.trim()} onClick={() => void context.mutate.patch(record.id, {
                fields: { ...record.fields, verifiedAt: clockIso(), verifiedBy: context.actor, verifiedNote: checkNote.trim() },
              }, { expectRevision: record.revision, event: `Hand check of ${record.title} recorded by ${context.actor}: ${checkNote.trim()}` })}>Record a hand check</Button>
            </Row>
          </Stack>
        ) : (
          <Notice tone="info" title="Local asset">Its configuration is the record itself; there is nothing outside to drift from.</Notice>
        )}
        <div>
          <strong>History</strong>
          <RecordEvents context={context} id={record.id} />
        </div>
      </Stack>
    </Card>
  );
}

/* ------------------------------ Access reviews ------------------------------ */

export function AccessReviews({ context }: { context: ScreenContext }) {
  const reviews = sorted(useCollection("it_access_reviews"));
  const members = useCollection("members");
  const { now } = useWorkspace();
  const [openId, setOpenId] = useState("");
  const current = reviews.find((item) => item.id === openId) ?? reviews[0];

  async function start() {
    const entries = entriesFromMembers(members, now);
    const due = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    const record = await context.mutate.create({
      collection: "it_access_reviews", title: `Access review ${now.toISOString().slice(0, 10)}`, status: "in_review",
      ownerName: context.actor, summary: `${entries.length} members to review`, dueAt: due,
      fields: { reviewer: context.actor, scope: "Workspace members" },
      body: { entries },
    }, `Access review started for ${entries.length} members`);
    setOpenId(record.id);
  }

  return (
    <section className="ds-stack ds-gap-3" aria-label="Access reviews">
      <Row gap={2} wrap>
        <div className="ds-grow">
          <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>Access reviews</h2>
          <p className="ds-subtle" style={{ margin: 0 }}>Decide, person by person, whether each member keeps their access. Decisions are recorded here; changing an account happens in Members.</p>
        </div>
        <Button variant="primary" disabled={members.length === 0} onClick={() => void start()}>Start an access review</Button>
      </Row>
      {reviews.length === 0 ? (
        <Empty title="No access review yet" icon={<ClipboardCheck size={20} />}>
          A review lists every member with their role and any warning signs (no second factor, long inactivity, automated agents) and asks for a decision on each.
        </Empty>
      ) : (
        <div className="it-split">
          <div className="it-list" role="list" aria-label="Access review list">
            {reviews.map((item) => {
              const progress = reviewProgress(readEntries(item));
              return (
                <div role="listitem" key={item.id}>
                  <button type="button" className="it-list-item" aria-pressed={item.id === current?.id} onClick={() => setOpenId(item.id)}>
                    <strong>{item.title}</strong>
                    <Row gap={2} wrap>
                      <Pill tone={item.status === "completed" ? "success" : "info"} dot>{item.status === "completed" ? "Completed" : "In review"}</Pill>
                      <span className="ds-subtle">{progress.decided} of {progress.total} decided</span>
                    </Row>
                    <Meter value={progress.decided} max={Math.max(1, progress.total)} label={`${progress.decided} of ${progress.total} decided`} />
                  </button>
                </div>
              );
            })}
          </div>
          {current && <ReviewDetail key={current.id} context={context} record={current} />}
        </div>
      )}
    </section>
  );
}

function ReviewDetail({ context, record }: { context: ScreenContext; record: Rec }) {
  const entries = readEntries(record);
  const progress = reviewProgress(entries);
  const completed = record.status === "completed";

  async function decide(index: number, decision: Decision, note: string) {
    const next = entries.map((entry, at) => (at === index ? { ...entry, decision, note, decidedBy: context.actor, decidedAt: clockIso() } : entry));
    await context.mutate.patch(record.id, {
      body: { ...(record.body as Record<string, unknown>), entries: next },
    }, { expectRevision: record.revision, event: `Access review: ${decision} for ${entries[index].subject}${note ? ` (${note})` : ""}` });
  }

  return (
    <Card eyebrow="ACCESS REVIEW" prov="human" title={record.title}
      subtitle={`Reviewer ${String(record.fields.reviewer ?? record.ownerName)} · due ${record.dueAt ?? "—"}`}
      actions={<Pill tone={progress.complete ? "success" : "info"}>{progress.decided}/{progress.total}</Pill>}>
      <Stack gap={3}>
        <Properties rows={[
          { label: "Keep", value: <span className="ds-num">{String(progress.keep)}</span> },
          { label: "Modify", value: <span className="ds-num">{String(progress.modify)}</span> },
          { label: "Revoke", value: <span className="ds-num">{String(progress.revoke)}</span> },
        ]} />
        <div aria-label="Members under review">
          {entries.map((entry, index) => (
            <ReviewRow key={`${entry.subjectId}-${entry.decidedAt}`} entry={entry} disabled={completed} onDecide={(decision, note) => void decide(index, decision, note)} />
          ))}
        </div>
        {completed ? (
          <Notice tone="success" title="Review completed">
            Completed by {String(record.fields.completedBy ?? "")}. {progress.revoke + progress.modify > 0 ? `${progress.revoke + progress.modify} access changes were decided; no identity provider is connected, so they are carried out in Members by hand.` : "Every member kept their access."}
          </Notice>
        ) : (
          <Row gap={2} wrap>
            <Button variant="primary" disabled={!progress.complete} title={progress.complete ? undefined : "Decide every member first"}
              onClick={() => void context.mutate.patch(record.id, { status: "completed", endAt: clockIso(), fields: { ...record.fields, completedBy: context.actor } }, { expectRevision: record.revision, event: `Access review ${record.title} completed: ${progress.keep} keep, ${progress.modify} modify, ${progress.revoke} revoke` })}>
              Complete the review
            </Button>
            {progress.revoke + progress.modify > 0 && (
              <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/admin/members`)}>Open Members to apply changes</Button>
            )}
          </Row>
        )}
      </Stack>
    </Card>
  );
}

function ReviewRow({ entry, disabled, onDecide }: { entry: ReviewEntry; disabled: boolean; onDecide: (decision: Decision, note: string) => void }) {
  const [decision, setDecision] = useState<Decision>(entry.decision);
  const [note, setNote] = useState(entry.note);
  const issue = decisionBlocker(entry, decision, note);
  const changed = decision !== entry.decision || note !== entry.note;
  return (
    <div className="it-review-row">
      <Row gap={2} wrap>
        <strong className="ds-grow">{entry.subject}</strong>
        <Pill tone="neutral">{entry.access}</Pill>
        {entry.decision !== "pending" && <Pill tone={entry.decision === "revoke" ? "danger" : entry.decision === "modify" ? "warning" : "success"} dot>{entry.decision}</Pill>}
      </Row>
      {entry.signals.length > 0 && <Row gap={1} wrap>{entry.signals.map((signal) => <Pill key={signal} tone="warning">{signal}</Pill>)}</Row>}
      {!disabled && (
        <Row gap={2} wrap style={{ alignItems: "flex-end" }}>
          <Field label={`Decision for ${entry.subject}`}>
            <Select value={decision} onChange={(event) => setDecision(event.target.value as Decision)}>
              <option value="pending">Undecided</option>
              <option value="keep">Keep</option>
              <option value="modify">Modify</option>
              <option value="revoke">Revoke</option>
            </Select>
          </Field>
          <div className="ds-grow" style={{ minWidth: 180 }}>
            <Field label={`Reason for ${entry.subject}`}><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          </div>
          <Button size="sm" variant="secondary" disabled={Boolean(issue) || !changed} title={issue} onClick={() => onDecide(decision, note.trim())}>Record decision</Button>
        </Row>
      )}
      {!disabled && issue && decision !== "pending" && <span className="ds-subtle">{issue}</span>}
      {entry.decidedBy && <span className="ds-subtle">Decided by {entry.decidedBy}{entry.note ? ` — ${entry.note}` : ""}</span>}
    </div>
  );
}
