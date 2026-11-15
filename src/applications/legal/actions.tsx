import { useState } from "react";
import { Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { askFirst, Boundary, logBoundary, pickRecord, recordOf, selectedOf } from "@/applications/hr/opsKit";
import { clausesOf, lifecycleLabel, type Clause } from "./panels";

/* ------------------------------------------------------------------ *
 * Contract actions for the Governance & Legal module that change records.
 * ------------------------------------------------------------------ */

interface Comment { id: string; clauseId: string; by: string; at: string; text: string }

export function commentsOf(contract: Rec): Comment[] {
  return (contract.body as { comments?: Comment[] } | undefined)?.comments ?? [];
}

/** SHA-256 over a canonical rendering of a record's content, computed in this browser. */
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function packContent(pack: Rec) {
  return { title: pack.title, summary: pack.summary, items: pack.fields.items ?? 0, memberIds: String(pack.fields.memberIds ?? ""), assembledBy: String(pack.fields.assembledBy ?? "") };
}

/* ---------------- ARL-LEGAL-001 · Review item ---------------- */

export async function reviewItem(context: ScreenContext): Promise<void> {
  const chosen = await recordOf(context, context.selectedId, "obligations");
  if (chosen) { context.openOverlay("Obligation quick view", { id: chosen.id }); return; }
  pickRecord(context, {
    title: "Review an obligation",
    collection: "obligations",
    filter: (row) => row.status !== "done",
    describe: (row) => `Due ${context.date(row.dueAt)} · ${String(row.fields.owner ?? row.ownerName)}`,
    pickLabel: "Review",
    empty: "No open obligation",
    onPick: (row) => context.openOverlay("Obligation quick view", { id: row.id }),
  });
}

export function RecordReview({ context, obligation }: { context: ScreenContext; obligation: Rec }) {
  const [note, setNote] = useState("");
  return (
    <Stack gap={2}>
      <Field label="Review note" hint={obligation.fields.reviewedBy ? `Last reviewed by ${String(obligation.fields.reviewedBy)} ${context.relative(String(obligation.fields.reviewedAt ?? ""))}` : "Not reviewed yet"}>
        <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {String(obligation.fields.jurisdiction ?? "") !== "" && String(obligation.fields.jurisdiction) !== context.org.jurisdiction && (
        <Notice tone="warning" title="Different jurisdiction">This obligation is under {String(obligation.fields.jurisdiction)}, not {context.org.jurisdiction}. Its interpretation needs legal review.</Notice>
      )}
      <Button variant="secondary" disabled={!note.trim()} onClick={async () => {
        await context.mutate.patch(obligation.id, { fields: { ...obligation.fields, reviewedBy: context.actor, reviewedAt: new Date().toISOString(), reviewNote: note.trim() } }, { expectRevision: obligation.revision, event: `${obligation.title} reviewed by ${context.actor}: ${note.trim()}` });
        setNote("");
        context.toast("Review recorded", `${obligation.title} is marked reviewed by ${context.actor}. This is not legal advice.`);
      }}>Record my review</Button>
    </Stack>
  );
}

/* ---------------- assign counsel / owner (001, 005) ---------------- */

export function AssignOwnerForm({ context, close, collections, label }: { context: ScreenContext; close: () => void; collections: ("obligations" | "risks" | "contracts")[]; label: string }) {
  const data = useCollections(["obligations", "risks", "contracts", "employees"]);
  const items = collections.flatMap((name) => data[name].filter((row) => row.status !== "done" && row.status !== "closed" && row.status !== "archived"));
  const [itemIdRaw, setItemId] = useState<string | null>(null);
  const itemId = itemIdRaw ?? (items.find((row) => row.id === context.selectedId)?.id ?? "");
  const item = items.find((row) => row.id === itemId);
  return (
    <form
      id="lg-assign"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const owner = String(new FormData(event.currentTarget).get("owner") ?? "");
        if (!item || !owner) return;
        await context.mutate.patch(item.id, { fields: { ...item.fields, owner, previousOwner: String(item.fields.owner ?? item.ownerName), assignedBy: context.actor } }, { expectRevision: item.revision, event: `${item.title} assigned to ${owner} by ${context.actor}` });
        context.toast("Assigned", `${owner} owns ${item.title}.`);
        close();
      }}
    >
      <Field label={label} required>
        <Select value={itemId} onChange={(event) => setItemId(event.target.value)} required>
          <option value="">Choose an item</option>
          {items.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.collection.replace(/s$/, "")}</option>)}
        </Select>
      </Field>
      {item && <Properties rows={[{ label: "Owner now", value: String(item.fields.owner ?? item.ownerName) }]} />}
      <Field label="Assign to" required>
        <Select name="owner" required defaultValue="">
          <option value="">Choose a person</option>
          {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id}>{employee.title}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Nobody here is external counsel">Assigning somebody makes them responsible for the work, not for a legal opinion.</Notice>
    </form>
  );
}

/* ---------------- ARL-LEGAL-002 · draft ---------------- */

const STANDARD_CLAUSES: Clause[] = [
  { id: "1", title: "Parties and term", text: "This agreement is between the parties named above and runs from the start date until the end date unless ended earlier under clause 6.", risk: "standard" },
  { id: "2", title: "Services and deliverables", text: "The supplier provides the goods or services described in Schedule 1 to the standard described there.", risk: "standard" },
  { id: "3", title: "Payment", text: "Invoices are payable within 30 days of receipt. Late payment carries statutory interest.", risk: "standard" },
  { id: "4", title: "Liability", text: "Each party's liability is capped at the fees paid in the twelve months before the claim, except for liability that cannot be limited by law.", risk: "standard" },
  { id: "5", title: "Confidentiality", text: "Each party keeps the other's confidential information confidential for the term and three years after.", risk: "standard" },
  { id: "6", title: "Termination", text: "Either party may end this agreement on the notice period stated above, or immediately for material breach not remedied within 30 days.", risk: "standard" },
];

export function DraftContract({ context, close }: { context: ScreenContext; close: () => void }) {
  const contracts = useCollections(["contracts"]).contracts;
  const [title, setTitle] = useState("");
  const duplicate = contracts.some((row) => row.title.trim().toLowerCase() === title.trim().toLowerCase());
  const [included, setIncluded] = useState<string[]>(STANDARD_CLAUSES.map((clause) => clause.id));
  return (
    <form
      id="lg-draft"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate || included.length === 0) return;
        const form = new FormData(event.currentTarget);
        const clauses = STANDARD_CLAUSES.filter((clause) => included.includes(clause.id));
        const text = clauses.map((clause) => `${clause.id}. ${clause.title}\n${clause.text}`).join("\n\n");
        const created = await context.mutate.create({
          collection: "contracts", title: title.trim(), status: "draft", summary: String(form.get("summary") ?? ""), at: new Date().toISOString(),
          tags: [String(form.get("type") ?? "supply"), "draft"],
          fields: { counterparty: String(form.get("counterparty") ?? ""), type: String(form.get("type") ?? "supply"), owner: context.actor, noticeDays: 30, signedAt: "", signatureProvider: "not_connected", clauseCount: clauses.length, versions: 1, immutableSigned: false, valueMinor: 0, draftedFrom: "standard clauses" },
          body: { clauses, versions: [{ label: "First draft", at: new Date().toISOString(), author: context.actor, text }], signatures: [] },
        }, `Contract drafted from standard clauses by ${context.actor}: ${title.trim()}`);
        context.select(created.id);
        context.toast("Draft created", `${title.trim()} is a draft with ${clauses.length} standard clauses. Nothing has been agreed with anybody.`);
        close();
      }}
    >
      <Field label="Contract name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required /></Field>
      {duplicate && <Notice tone="danger" title="A contract with that name exists">Choose a distinct name.</Notice>}
      <Row gap={3}>
        <Field label="Counterparty" required><TextInput name="counterparty" required /></Field>
        <Field label="Type"><Select name="type">{["supply", "customer", "nda", "saas", "lease"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
      </Row>
      <Field label="What it is for"><TextInput name="summary" /></Field>
      <fieldset className="ds-stack ds-gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="ds-subtle">Start from these standard clauses</legend>
        {STANDARD_CLAUSES.map((clause) => <Checkbox key={clause.id} label={`${clause.id}. ${clause.title}`} checked={included.includes(clause.id)} onChange={(event) => setIncluded((current) => event.target.checked ? [...current, clause.id] : current.filter((id) => id !== clause.id))} />)}
      </fieldset>
      <Notice tone="warning" title="A draft binds nobody">The standard clauses are a starting point written for this workspace, not legal advice. Rights and obligations are only accepted when people sign.</Notice>
    </form>
  );
}

/* ---------------- ARL-LEGAL-003 · approve legal step / comment ---------------- */

const NEXT_STEP: Record<string, string> = { draft: "in_review", in_review: "approved" };

export async function approveLegalStep(context: ScreenContext): Promise<void> {
  const contract = await recordOf(context, context.params.id, "contracts");
  if (!contract) { context.toast("Open a contract first", "Nothing was approved.", "blocked"); return; }
  if (contract.fields.immutableSigned === true) { context.toast("Signed contracts are immutable", "The executed version cannot be re-approved or changed here.", "blocked"); return; }
  const next = NEXT_STEP[contract.status];
  if (!next) {
    context.toast("No step to approve", contract.status === "approved" ? "It is approved. The next step is a signature, recorded when it happens on paper or with a provider." : `${lifecycleLabel(contract.status)} has no approval step here.`, "blocked");
    return;
  }
  const flagged = clausesOf(contract).filter((clause) => clause.risk !== "standard");
  askFirst(context, {
    title: `Approve: ${lifecycleLabel(contract.status)} → ${lifecycleLabel(next)}`,
    body: `${contract.title} moves to ${lifecycleLabel(next)}, approved by ${context.actor}. A person approves this step; nothing is accepted on anybody's behalf.`,
    rows: [{ label: "Flagged clauses", value: flagged.length ? `${flagged.length} — ${flagged.map((clause) => clause.title).join(", ")}` : "None" }],
    confirm: `Approve and move to ${lifecycleLabel(next)}`,
    run: async () => {
      await context.mutate.patch(contract.id, { status: next, fields: { ...contract.fields, [`${next}By`]: context.actor, [`${next}At`]: new Date().toISOString() } }, { expectRevision: contract.revision, event: `${contract.title}: ${lifecycleLabel(contract.status)} approved by ${context.actor}; now ${lifecycleLabel(next)}` });
      context.toast("Step approved", `${contract.title} is ${lifecycleLabel(next)}.`);
    },
  });
}

export function CommentOnContract({ context, close }: { context: ScreenContext; close: () => void }) {
  const contract = useRecord(context.params.id);
  const [text, setText] = useState("");
  const [clauseId, setClauseId] = useState("");
  if (!contract) return <Empty title="Open a contract first" />;
  const clauses = clausesOf(contract);
  const existing = commentsOf(contract);
  return (
    <form
      id="lg-comment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        const comment: Comment = { id: crypto.randomUUID(), clauseId, by: context.actor, at: new Date().toISOString(), text: text.trim() };
        await context.mutate.patch(contract.id, { body: { ...(contract.body as object ?? {}), comments: [...existing, comment] } }, { expectRevision: contract.revision, event: `${context.actor} commented on ${contract.title}${clauseId ? ` clause ${clauseId}` : ""}` });
        context.toast("Comment added", contract.fields.immutableSigned === true ? "The comment sits beside the signed text; the signed version is unchanged." : "It is on the contract with your name.");
        close();
      }}
    >
      <Field label="About">
        <Select value={clauseId} onChange={(event) => setClauseId(event.target.value)}>
          <option value="">The whole contract</option>
          {clauses.map((clause) => <option key={clause.id} value={clause.id}>{clause.id}. {clause.title}{clause.risk !== "standard" ? ` (${clause.risk})` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Comment" required><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} required /></Field>
      {existing.length > 0 && <Properties rows={existing.slice(-3).map((comment) => ({ label: `${comment.by}${comment.clauseId ? ` · ${comment.clauseId}` : ""}`, value: comment.text }))} />}
      {contract.fields.immutableSigned === true && <Notice tone="info">This contract is signed. A comment never alters the executed text.</Notice>}
    </form>
  );
}

/* ---------------- ARL-LEGAL-004 · revise / publish / request acknowledgment ---------------- */

export async function publishPolicy(context: ScreenContext, policy: Rec): Promise<void> {
  if (policy.status !== "draft") { context.toast("Only a draft is published", `${policy.title} is ${policy.status}. Revise it to make a draft.`, "blocked"); return; }
  const supersededId = String(policy.fields.supersedesId ?? "");
  askFirst(context, {
    title: `Publish ${policy.title} v${String(policy.fields.version ?? "1.0")}`,
    body: supersededId ? "The draft becomes the published policy. The version it replaces is kept as superseded, with its acknowledgements, so decisions taken under it stay readable." : "The draft becomes the published policy for its audience.",
    confirm: "Publish",
    run: async () => {
      const due = new Date(context.now);
      due.setUTCFullYear(due.getUTCFullYear() + 1);
      await context.mutate.patch(policy.id, { status: "published", at: new Date().toISOString(), dueAt: due.toISOString(), fields: { ...policy.fields, publishedBy: context.actor, acknowledged: 0 } }, { expectRevision: policy.revision, event: `${policy.title} v${String(policy.fields.version ?? "")} published by ${context.actor}` });
      const old = await recordOf(context, supersededId, "policies");
      if (old && old.status !== "superseded") {
        await context.mutate.patch(old.id, { status: "superseded", fields: { ...old.fields, supersededBy: policy.id } }, { expectRevision: old.revision, event: `${old.title} v${String(old.fields.version ?? "")} superseded by v${String(policy.fields.version ?? "")}; kept for history` });
      }
      context.toast("Policy published", old ? `v${String(old.fields.version ?? "")} is kept as superseded.` : "It is live for its audience.");
    },
  });
}

export async function requestAcknowledgment(context: ScreenContext, reach: number): Promise<void> {
  const policy = await selectedOf(context, "policies", "a policy");
  if (!policy) return;
  if (policy.status !== "published") { context.toast("Publish it first", "Acknowledgement is requested on a published version.", "blocked"); return; }
  askFirst(context, {
    title: `Request acknowledgement of ${policy.title}`,
    body: `Asks the ${String(policy.fields.audience ?? "All employees")} audience (${reach} people) to acknowledge version ${String(policy.fields.version ?? "")}. Each acknowledgement is recorded per person per version.`,
    boundary: "email.send",
    confirm: "Request acknowledgement",
    run: async () => {
      await context.mutate.patch(policy.id, { fields: { ...policy.fields, acknowledgementRequired: true, ackRequestedBy: context.actor, ackRequestedAt: new Date().toISOString(), ackRequestedOf: reach } }, { expectRevision: policy.revision, event: `Acknowledgement of ${policy.title} v${String(policy.fields.version ?? "")} requested from ${reach} people by ${context.actor}` });
      await logBoundary(context, "email.send", `Acknowledgement request for ${policy.title} kept locally`, policy.id);
      context.toast("Acknowledgement requested", `${reach} people are asked in this workspace. No email left the browser.`);
    },
  });
}

/* ---------------- ARL-LEGAL-005 · remind ---------------- */

export function Reminder({ context, close }: { context: ScreenContext; close: () => void }) {
  const obligation = useRecord(context.selectedId);
  const { org } = useWorkspace();
  const [days, setDays] = useState(String(obligation?.fields.reminderDays ?? 14));
  if (!obligation || obligation.collection !== "obligations") return <Empty title="Choose an obligation first" />;
  if (!obligation.dueAt) return <Empty title="This obligation has no due date" />;
  const value = Number(days);
  const invalid = !Number.isFinite(value) || value < 0;
  const zone = String(obligation.fields.timezone ?? org.timezone);
  const remindAt = new Date(new Date(obligation.dueAt).getTime() - (invalid ? 0 : value) * 86_400_000);
  const past = remindAt < context.now;
  return (
    <form
      id="lg-reminder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const owner = String(obligation.fields.owner ?? obligation.ownerName);
        await context.mutate.create({ collection: "tasks", title: `Reminder: ${obligation.title}`, status: "ready", summary: `Due ${obligation.dueAt} (${zone}, ${String(obligation.fields.jurisdiction ?? org.jurisdiction)}).`, parentId: obligation.id, dueAt: remindAt.toISOString(), startAt: remindAt.toISOString(), endAt: remindAt.toISOString(), fields: { kind: "legalReminder", assignee: owner, stage: "ready", obligationId: obligation.id, timezone: zone } }, `Reminder for ${obligation.title} set for ${remindAt.toISOString()} by ${context.actor}`);
        await context.mutate.patch(obligation.id, { fields: { ...obligation.fields, reminderDays: value, reminderAt: remindAt.toISOString() } }, { expectRevision: obligation.revision, event: `${obligation.title} reminder ${value} days before` });
        context.toast("Reminder set", `${owner} is reminded ${context.dateTime(remindAt)} (${zone}). It appears as a task here; nothing is emailed.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Obligation", value: obligation.title },
        { label: "Due", value: `${context.dateTime(obligation.dueAt)} · ${zone}` },
        { label: "Jurisdiction", value: String(obligation.fields.jurisdiction ?? org.jurisdiction) },
        { label: "Remind", value: invalid ? "—" : `${context.dateTime(remindAt)} (${zone})` },
      ]} />
      <Field label="Days before the deadline"><TextInput inputMode="numeric" align="end" value={days} onChange={(event) => setDays(event.target.value)} invalid={invalid} /></Field>
      {past && !invalid && <Notice tone="warning" title="That reminder date has passed">It will show as due immediately.</Notice>}
      <Notice tone="info">The deadline is stored as an absolute time with its time zone and jurisdiction, so "14 days before" is computed against that, not against your browser's clock.</Notice>
    </form>
  );
}

/* ---------------- ARL-LEGAL-006 · review ---------------- */

export function RiskReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const risk = useRecord(context.selectedId);
  const [ownerConfirms, setOwnerConfirms] = useState(false);
  if (!risk || risk.collection !== "risks") return <Empty title="Choose a risk first" />;
  const ai = risk.fields.aiSuggested === true;
  return (
    <form
      id="lg-risk-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (ai && !ownerConfirms) return;
        const form = new FormData(event.currentTarget);
        const next = String(form.get("next") ?? "");
        await context.mutate.patch(risk.id, { status: String(form.get("status") ?? risk.status), dueAt: next ? new Date(`${next}T09:00:00.000Z`).toISOString() : risk.dueAt, fields: { ...risk.fields, reviewedAt: new Date().toISOString().slice(0, 10), reviewedBy: context.actor, reviewNote: String(form.get("note") ?? ""), aiSuggested: false } }, { expectRevision: risk.revision, event: `${risk.title} reviewed by ${context.actor}` });
        context.toast("Review recorded", `${risk.title} was reviewed by ${context.actor}; the score is theirs to own.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Risk", value: risk.title },
        { label: "Score", value: `${String(risk.fields.score ?? "—")} (${String(risk.fields.impact ?? "")} × ${String(risk.fields.likelihood ?? "")})` },
        { label: "Owner", value: String(risk.fields.owner ?? risk.ownerName) },
        { label: "Last reviewed", value: String(risk.fields.reviewedAt ?? "Never") },
      ]} />
      {ai && (
        <Notice tone="warning" title="This rating was suggested by an AI employee">
          <Checkbox label={`I, ${context.actor}, have checked the score and take responsibility for it`} checked={ownerConfirms} onChange={(event) => setOwnerConfirms(event.target.checked)} />
        </Notice>
      )}
      <Row gap={3}>
        <Field label="Status"><Select name="status" defaultValue={risk.status}>{["open", "mitigating", "closed"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
        <Field label="Next review"><TextInput type="date" name="next" /></Field>
      </Row>
      <Field label="What the review found" required><TextArea name="note" rows={3} required /></Field>
    </form>
  );
}

/* ---------------- ARL-LEGAL-007 · assemble / share / hash ---------------- */

export function AssemblePack({ context, close }: { context: ScreenContext; close: () => void }) {
  const documents = useCollections(["documents"]).documents.filter((row) => row.fields.kind !== "evidencePack");
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  return (
    <form
      id="lg-assemble"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || chosen.length === 0) return;
        const members = documents.filter((row) => chosen.includes(row.id));
        const restricted = members.filter((row) => row.fields.confidential === true || row.fields.legalHold === true).length;
        const summary = String(new FormData(event.currentTarget).get("summary") ?? "");
        const draft = { title: title.trim(), summary, items: members.length, memberIds: members.map((row) => row.id).join(","), assembledBy: context.actor };
        const hash = await contentHash({ ...draft, members: members.map((row) => ({ id: row.id, title: row.title, revision: row.revision, updatedAt: row.updatedAt })) });
        await context.mutate.create({ collection: "documents", title: title.trim(), status: "assembled", summary, at: new Date().toISOString(), tags: ["evidence"], fields: { kind: "evidencePack", items: members.length, memberIds: draft.memberIds, legalHold: false, hash, hashMethod: "sha256-members", assembledBy: context.actor, exportable: restricted === 0, restrictedItems: restricted } }, `Evidence pack ${title.trim()} assembled from ${members.length} records by ${context.actor}`);
        context.toast("Pack assembled", `${members.length} records, SHA-256 computed in this browser.${restricted ? ` ${restricted} restricted item${restricted === 1 ? "" : "s"} make the pack non-exportable.` : ""}`);
        close();
      }}
    >
      <Field label="Pack name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Why it is being assembled"><TextArea name="summary" rows={2} /></Field>
      <fieldset className="ds-stack ds-gap-2" style={{ border: 0, padding: 0, maxHeight: 260, overflow: "auto" }}>
        <legend className="ds-subtle">Records to include ({chosen.length})</legend>
        {documents.length === 0 && <span className="ds-subtle">No documents in this workspace.</span>}
        {documents.map((row) => <Checkbox key={row.id} label={`${row.title}${row.fields.confidential === true ? " (confidential)" : ""}`} checked={chosen.includes(row.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />)}
      </fieldset>
      <Notice tone="info">The hash covers each record's id, title and revision as held here. It shows the pack's contents have not changed since; it is not a notarised chain of custody.</Notice>
    </form>
  );
}

export function SharePack({ context, close }: { context: ScreenContext; close: () => void }) {
  const pack = useRecord(context.selectedId);
  const employees = useCollections(["employees"]).employees.filter((row) => row.status !== "alumni");
  const [to, setTo] = useState("");
  const [external, setExternal] = useState("");
  if (!pack || pack.fields.kind !== "evidencePack") return <Empty title="Choose a pack first" />;
  const held = pack.fields.legalHold === true;
  const restricted = Number(pack.fields.restrictedItems ?? 0) > 0 || pack.fields.exportable === false;
  const outside = external.trim().length > 0;
  const refused = outside && (held || restricted || !context.can("export_data"));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Pack", value: pack.title },
        { label: "Legal hold", value: held ? <Pill tone="danger" dot>On</Pill> : "Off" },
        { label: "Already shared with", value: String(pack.fields.sharedWith ?? "") || "Nobody" },
      ]} />
      <Field label="Share with a colleague in this workspace">
        <Select value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Nobody inside</option>
          {employees.map((row) => <option key={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Or an external address (auditor, solicitor)"><TextInput type="email" value={external} onChange={(event) => setExternal(event.target.value)} /></Field>
      {refused && <Notice tone="danger" title="Sharing outside is refused">{held ? "A legal hold is on. " : ""}{restricted ? "The pack holds restricted records. " : ""}{!context.can("export_data") ? "This role view may not export. " : ""}Inside sharing is still possible.</Notice>}
      {outside && !refused && <Boundary id="email.send" />}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" disabled={(!to && !outside) || refused} onClick={async () => {
          const recipients = [to, external.trim()].filter(Boolean);
          const shared = [...new Set([...String(pack.fields.sharedWith ?? "").split(",").filter(Boolean), ...recipients])];
          await context.mutate.patch(pack.id, { fields: { ...pack.fields, sharedWith: shared.join(","), sharedBy: context.actor } }, { expectRevision: pack.revision, event: `${pack.title} shared with ${recipients.join(", ")} by ${context.actor}` });
          if (outside) await logBoundary(context, "email.send", `Share of ${pack.title} with ${external.trim()} queued locally`, pack.id);
          context.toast("Shared", outside ? `Recorded. ${external.trim()} has not been sent anything: no mail provider is connected.` : `${to} can see ${pack.title} in this workspace.`);
          close();
        }}>Share the pack</Button>
      </Row>
    </Stack>
  );
}

export async function hashPack(context: ScreenContext): Promise<void> {
  const pack = await selectedOf(context, "documents", "an evidence pack");
  if (!pack) return;
  if (pack.fields.kind !== "evidencePack") { context.toast("Choose an evidence pack", "Only a pack is hashed here.", "blocked"); return; }
  const { getRecord } = await import("@/platform/repo");
  const members = (await Promise.all(String(pack.fields.memberIds ?? "").split(",").filter(Boolean).map((id) => getRecord(id)))).filter((row): row is Rec => Boolean(row));
  const fresh = pack.fields.hashMethod === "sha256-members"
    ? await contentHash({ ...packContent(pack), members: members.map((row) => ({ id: row.id, title: row.title, revision: row.revision, updatedAt: row.updatedAt })) })
    : await contentHash(packContent(pack));
  const stored = String(pack.fields.hash ?? "");
  const comparable = pack.fields.hashMethod === "sha256-members" || pack.fields.hashMethod === "sha256-record";
  const matches = comparable && stored === fresh;
  await context.mutate.patch(pack.id, { fields: { ...pack.fields, hash: comparable ? stored : fresh, hashMethod: comparable ? String(pack.fields.hashMethod) : "sha256-record", previousHash: comparable ? String(pack.fields.previousHash ?? "") : stored, lastHashCheck: new Date().toISOString(), lastHashResult: comparable ? (matches ? "unchanged" : "changed") : "first computed", lastHashBy: context.actor } }, { expectRevision: pack.revision, event: comparable ? `${pack.title} hash checked by ${context.actor}: ${matches ? "unchanged" : `changed (now ${fresh})`}` : `${pack.title} hashed with SHA-256 by ${context.actor}; earlier value ${stored} kept` });
  context.toast(comparable ? (matches ? "Hash unchanged" : "Contents changed") : "Hash computed", comparable ? (matches ? "The pack's contents match the stored hash." : `The recomputed hash ${fresh.slice(0, 20)}… differs from the stored one.`) : `SHA-256 ${fresh.slice(0, 20)}… is stored; the earlier value is kept as previous.`, comparable && !matches ? "blocked" : "ok");
}
