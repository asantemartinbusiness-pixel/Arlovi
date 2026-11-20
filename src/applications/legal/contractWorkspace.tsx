import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  Button, Card, Checkbox, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import type { Version } from "./redline";
import {
  DECISION_LABEL, decideRound, obligationState, openRound, renewalInfo, reviewDecisionBlocker, reviewsOf, statusAfterDecision, suggestCompany,
  type ReviewDecision,
} from "./register";

/* ------------------------------------------------------------------ *
 * ARL-LEGAL-003 · the working parts of a contract.
 *
 * Key dates with the renewal alert they earn, the obligations a contract
 * creates (added and completed here), the review cycle with a named
 * approver and a recorded decision, links to the CRM and to projects,
 * and a way to store a new version. None of it signs, files or serves
 * notice on anybody; each card says so where it matters.
 * ------------------------------------------------------------------ */

const isoDay = (value: string | undefined) => (value ? value.slice(0, 10) : "");
const atNine = (day: string) => (day ? new Date(`${day}T09:00:00.000Z`).toISOString() : undefined);

function useStaff(): string[] {
  const { employees } = useCollections(["employees"]);
  return employees.filter((employee) => employee.status !== "alumni").map((employee) => employee.title).sort((a, b) => a.localeCompare(b));
}

/* ---------------- key dates and renewal ---------------- */

export function KeyDatesCard({ context, contract }: { context: ScreenContext; contract: Rec }) {
  const { now } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const info = renewalInfo(contract, now);
  const signed = contract.fields.immutableSigned === true;

  if (editing) {
    return (
      <Card span={6} eyebrow="KEY DATES" prov="human" title="Key dates and renewal">
        <form
          className="ds-stack ds-gap-3"
          aria-label="Edit key dates"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const decision = String(form.get("decision") ?? "");
            const decisionChanged = decision !== String(contract.fields.renewalDecision ?? "");
            const patch: Partial<Rec> = {
              fields: {
                ...contract.fields,
                noticeDays: Math.max(0, Number(form.get("notice") ?? 0) || 0),
                autoRenew: form.get("autoRenew") === "on",
                renewalDecision: decision,
                // Re-stamp who decided only when the decision itself changed.
                ...(decisionChanged
                  ? { renewalDecidedBy: decision ? context.actor : "", renewalDecidedAt: decision ? clockIso() : "" }
                  : {}),
              },
            };
            if (!signed) {
              patch.startAt = atNine(String(form.get("start") ?? ""));
              patch.endAt = atNine(String(form.get("end") ?? ""));
              patch.dueAt = patch.endAt;
            }
            const saved = await context.mutate.patch(contract.id, patch, { expectRevision: contract.revision, event: `Key dates on ${contract.title} updated by ${context.actor}${decisionChanged ? `; renewal decision: ${decision || "not decided"}` : ""}` });
            if (!saved) return;
            context.toast("Key dates saved", decision && decisionChanged ? `The renewal decision "${decision}" is recorded. No notice was served on the counterparty.` : "The dates and notice period are on the contract.");
            setEditing(false);
          }}
        >
          <Row gap={3} wrap>
            <Field label="Starts"><TextInput name="start" type="date" defaultValue={isoDay(contract.startAt)} disabled={signed} /></Field>
            <Field label="Ends"><TextInput name="end" type="date" defaultValue={isoDay(contract.endAt)} disabled={signed} /></Field>
            <Field label="Notice (days)"><TextInput name="notice" inputMode="numeric" align="end" defaultValue={String(contract.fields.noticeDays ?? 0)} /></Field>
          </Row>
          <Checkbox name="autoRenew" label="Renews automatically unless notice is given" defaultChecked={contract.fields.autoRenew === true} />
          <Field label="Renewal decision" hint="What this organisation intends to do at the end of the term.">
            <Select name="decision" defaultValue={String(contract.fields.renewalDecision ?? "")}>
              <option value="">Not decided</option>
              <option value="renew">Renew</option>
              <option value="renegotiate">Renegotiate</option>
              <option value="terminate">Terminate</option>
            </Select>
          </Field>
          {signed && <Notice tone="info" title="The executed term is fixed">This contract is signed, so its start and end dates are kept as executed. A variation is stored as a new version.</Notice>}
          <Row gap={2}>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <span className="ds-grow" />
            <Button type="submit" variant="primary">Save key dates</Button>
          </Row>
        </form>
      </Card>
    );
  }

  return (
    <Card
      span={6}
      eyebrow="KEY DATES"
      prov="human"
      title="Key dates and renewal"
      subtitle={info.autoRenews ? "Renews automatically" : "Ends unless renewed"}
      actions={<Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit dates</Button>}
    >
      <Stack gap={3}>
        <Properties rows={[
          { label: "Starts", value: <span className="ds-num">{context.date(contract.startAt)}</span> },
          { label: "Ends", value: <span className="ds-num">{context.date(contract.endAt)}{info.endsInDays !== null ? ` · ${info.endsInDays < 0 ? `${Math.abs(info.endsInDays)}d ago` : `in ${info.endsInDays}d`}` : ""}</span> },
          { label: "Notice period", value: <span className="ds-num">{info.noticeDays} days</span> },
          { label: "Notice by", value: info.noticeBy ? <span className="ds-num">{context.date(info.noticeBy)}</span> : "No end date recorded" },
          { label: "Renewal", value: <Pill tone={info.tone} dot><span className="ds-num">{info.label}</span></Pill> },
          { label: "Decision", value: contract.fields.renewalDecision ? `${String(contract.fields.renewalDecision)} — ${String(contract.fields.renewalDecidedBy ?? "")}, ${context.date(String(contract.fields.renewalDecidedAt ?? ""))}` : "Not decided" },
        ]} />
        {info.alert === "notice_passed" && (
          <Notice tone="danger" title="The notice date has passed">
            {info.autoRenews
              ? "This contract renews for a further term unless notice was already given outside this workspace."
              : "Any notice given now is late under the period recorded here. Check the wording of the termination clause."}
          </Notice>
        )}
        {info.alert === "notice_due" && (
          <Notice tone="warning" title={`Notice is due in ${info.noticeInDays} days`}>
            Record a decision so the owner and counsel know what is intended before {context.date(info.noticeBy)}.
          </Notice>
        )}
        <span className="ds-subtle">A recorded decision is an internal note. It does not serve notice on {String(contract.fields.counterparty ?? "the counterparty")}.</span>
      </Stack>
    </Card>
  );
}

/* ---------------- obligations ---------------- */

export function ObligationsCard({ context, contract, obligations }: { context: ScreenContext; contract: Rec; obligations: Rec[] }) {
  const { now } = useWorkspace();
  const staff = useStaff();
  const [adding, setAdding] = useState(false);
  const sorted = [...obligations].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~"));
  const done = obligations.filter((row) => row.status === "done").length;

  return (
    <Card
      span={6}
      eyebrow="OBLIGATIONS"
      prov="human"
      title="Obligations from this contract"
      subtitle={`${obligations.length} tracked · ${done} done`}
      actions={!adding ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add an obligation</Button> : undefined}
    >
      <Stack gap={3}>
        {sorted.length === 0 && !adding && <span className="ds-subtle">No obligation has been recorded against this contract yet.</span>}
        <ul className="lg-ob-list" aria-label="Contract obligations">
          {sorted.map((obligation) => {
            const state = obligationState(obligation, now);
            return (
              <li key={obligation.id} className="lg-ob-row" data-done={obligation.status === "done" ? "true" : undefined}>
                <span className="lg-ob-main">
                  <strong className="ds-truncate">{obligation.title}</strong>
                  <span className="ds-subtle">
                    {String(obligation.fields.owner ?? obligation.ownerName)} · <span className="ds-num">{context.date(obligation.dueAt)}</span>
                    {obligation.status === "done" && obligation.fields.completedBy ? ` · completed by ${String(obligation.fields.completedBy)}` : ""}
                  </span>
                </span>
                <Pill tone={state.tone} dot><span className="ds-num">{state.label}</span></Pill>
                <Button
                  size="sm"
                  variant={obligation.status === "done" ? "ghost" : "secondary"}
                  aria-label={`${obligation.status === "done" ? "Reopen" : "Complete"} ${obligation.title}`}
                  onClick={async () => {
                    const reopening = obligation.status === "done";
                    if (!(await context.mutate.patch(obligation.id, {
                      status: reopening ? "upcoming" : "done",
                      fields: { ...obligation.fields, completedBy: reopening ? "" : context.actor, completedAt: reopening ? "" : clockIso() },
                    }, { expectRevision: obligation.revision, event: `${obligation.title} ${reopening ? "reopened" : "completed"} by ${context.actor}` }))) return;
                    context.toast(reopening ? "Obligation reopened" : "Obligation completed", reopening ? "It is back on the calendar." : "Recorded with your name and the time. Attach evidence from the obligation calendar if it needs proving.");
                  }}
                >
                  {obligation.status === "done" ? "Reopen" : "Complete"}
                </Button>
              </li>
            );
          })}
        </ul>
        {adding && (
          <form
            className="ds-stack ds-gap-3 lg-inline-form"
            aria-label="Add an obligation"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const title = String(form.get("title") ?? "").trim();
              const due = String(form.get("due") ?? "");
              if (!title || !due) return;
              await context.mutate.create({
                collection: "obligations",
                title,
                status: "upcoming",
                summary: String(form.get("detail") ?? ""),
                dueAt: atNine(due),
                at: clockIso(),
                tags: ["contract", String(contract.fields.type ?? "")].filter(Boolean),
                fields: {
                  kind: "contract", owner: String(form.get("owner") ?? context.actor), recurrence: "Once",
                  jurisdiction: context.org.jurisdiction, timezone: context.org.timezone,
                  contractId: contract.id, evidenceId: "", reminderDays: 14,
                },
              }, `Obligation "${title}" added to ${contract.title} by ${context.actor}`);
              context.toast("Obligation added", "It is on this contract and on the obligation calendar.");
              setAdding(false);
            }}
          >
            <Field label="Obligation" required><TextInput name="title" required placeholder="e.g. Annual price review notice" /></Field>
            <Row gap={3} wrap>
              <Field label="Due" required><TextInput name="due" type="date" required /></Field>
              <Field label="Owner">
                <Select name="owner" defaultValue={staff.includes(context.actor) ? context.actor : staff[0]}>
                  {staff.map((name) => <option key={name}>{name}</option>)}
                </Select>
              </Field>
            </Row>
            <Field label="What it requires"><TextArea name="detail" rows={2} /></Field>
            <Row gap={2}>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <span className="ds-grow" />
              <Button type="submit" variant="primary">Save obligation</Button>
            </Row>
          </form>
        )}
      </Stack>
    </Card>
  );
}

/* ---------------- review cycle ---------------- */

export function ReviewCycleCard({ context, contract }: { context: ScreenContext; contract: Rec }) {
  const reviews = reviewsOf(contract);
  const open = openRound(reviews);
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [note, setNote] = useState("");
  const signed = contract.fields.immutableSigned === true;
  const legacyReviewer = !open && contract.status === "in_review" ? String(contract.fields.reviewer ?? "") : "";
  const needsNote = decision !== "approved";
  const requester = open ? open.requestedBy : String(contract.fields.reviewRequestedBy ?? "");
  const blocker = reviewDecisionBlocker(requester, decision, context.actor);

  async function record() {
    if (needsNote && !note.trim()) return;
    if (blocker) return;
    const at = clockIso();
    const base = open ? reviews : [{ id: crypto.randomUUID(), round: reviews.length + 1, reviewer: legacyReviewer || context.actor, requestedBy: String(contract.fields.reviewRequestedBy ?? context.actor), requestedAt: String(contract.fields.reviewRequestedAt ?? at) }];
    const next = decideRound(base, decision, context.actor, at, note.trim());
    const status = statusAfterDecision(contract.status, decision);
    const saved = await context.mutate.patch(contract.id, {
      status,
      fields: { ...contract.fields, reviewDecision: decision, reviewDecidedBy: context.actor, reviewDecidedAt: at, ...(decision === "approved" ? { approvedBy: context.actor, approvedAt: at } : {}) },
      body: { ...(contract.body as object ?? {}), reviews: next },
    }, { expectRevision: contract.revision, event: `${contract.title}: review ${DECISION_LABEL[decision].toLowerCase()} by ${context.actor}${note.trim() ? ` — ${note.trim()}` : ""}` });
    if (!saved) return;
    context.toast(`Review: ${DECISION_LABEL[decision].toLowerCase()}`, decision === "approved" ? "The contract is approved internally. Signing is a separate step." : "The contract is back in draft with the reason on the record.");
    setNote("");
  }

  const reviewer = open?.reviewer || legacyReviewer;

  return (
    <Card span={6} eyebrow="REVIEW" prov="human" title="Review cycle" subtitle={reviews.length ? `${reviews.length} ${reviews.length === 1 ? "round" : "rounds"}` : "Not reviewed yet"}>
      <Stack gap={3}>
        {reviewer ? (
          <Stack gap={3}>
            <Properties rows={[
              { label: "With", value: reviewer },
              { label: "Requested", value: open ? `${open.requestedBy}, ${context.date(open.requestedAt)}` : `${String(contract.fields.reviewRequestedBy ?? "")}` },
            ]} />
            {signed ? <span className="ds-subtle">Signed contracts are not re-reviewed here.</span> : (
              <div className="ds-stack ds-gap-3" role="group" aria-label="Record the review decision">
                <Field label="Decision">
                  <Select value={decision} onChange={(event) => setDecision(event.target.value as ReviewDecision)}>
                    <option value="approved">Approve</option>
                    <option value="changes_requested">Request changes</option>
                    <option value="rejected">Reject</option>
                  </Select>
                </Field>
                <Field label={needsNote ? "Reason (required)" : "Note"}>
                  <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
                {blocker && <Notice tone="warning" title="Cannot be approved by you">{blocker}</Notice>}
                {reviewer !== context.actor && <Notice tone="info">You are recording this as {context.actor}; the round names {reviewer} as the reviewer.</Notice>}
                <Row gap={2}><span className="ds-grow" /><Button variant="primary" disabled={Boolean(blocker) || (needsNote && !note.trim())} onClick={() => void record()}>Record the decision</Button></Row>
              </div>
            )}
          </Stack>
        ) : (
          <Stack gap={2}>
            <span className="ds-subtle">No review is open.</span>
            {!signed && <Row gap={2}><Button size="sm" variant="secondary" onClick={() => context.openOverlay("request review")}>Request a review</Button></Row>}
          </Stack>
        )}
        {reviews.some((round) => round.decision) && (
          <ol className="lg-rounds" aria-label="Review rounds">
            {reviews.filter((round) => round.decision).reverse().map((round) => (
              <li key={round.id}>
                <Row gap={2} wrap>
                  <span className="ds-num ds-subtle">Round {round.round}</span>
                  <Pill tone={round.decision === "approved" ? "success" : round.decision === "rejected" ? "danger" : "warning"} dot>{DECISION_LABEL[round.decision as ReviewDecision]}</Pill>
                  <span className="ds-subtle">{round.decidedBy}, {context.date(round.decidedAt)}</span>
                </Row>
                {round.note && <p className="ds-subtle">{round.note}</p>}
              </li>
            ))}
          </ol>
        )}
        <span className="ds-subtle">An approval here is an internal review record, not acceptance of the contract and not a signature.</span>
      </Stack>
    </Card>
  );
}

/* ---------------- links ---------------- */

export function LinksCard({ context, contract }: { context: ScreenContext; contract: Rec }) {
  const { org } = useWorkspace();
  const data = useCollections(["companies", "deals", "projects"]);
  const [editing, setEditing] = useState(false);
  const companyId = String(contract.fields.companyId ?? "");
  const company = data.companies.find((row) => row.id === companyId);
  const deal = data.deals.find((row) => row.id === String(contract.fields.dealId ?? ""));
  const project = data.projects.find((row) => row.id === String(contract.fields.projectId ?? ""));
  const suggestion = !company ? suggestCompany(String(contract.fields.counterparty ?? ""), data.companies) : undefined;
  const [chosenCompany, setChosenCompany] = useState(companyId);

  if (editing) {
    const deals = data.deals.filter((row) => !chosenCompany || row.parentId === chosenCompany);
    return (
      <Card span={6} eyebrow="LINKS" prov="human" title="Linked records">
        <form
          className="ds-stack ds-gap-3"
          aria-label="Link records"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = { companyId: chosenCompany, dealId: String(form.get("deal") ?? ""), projectId: String(form.get("project") ?? "") };
            if (!(await context.mutate.patch(contract.id, { fields: { ...contract.fields, ...next } }, { expectRevision: contract.revision, event: `Links on ${contract.title} updated by ${context.actor}` }))) return;
            context.toast("Links saved", "The contract now points at those records.");
            setEditing(false);
          }}
        >
          <Field label="CRM company">
            <Select value={chosenCompany} onChange={(event) => setChosenCompany(event.target.value)}>
              <option value="">Not linked</option>
              {data.companies.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Field label="Deal" hint={chosenCompany ? "Deals with the chosen company." : "All deals."}>
            <Select name="deal" defaultValue={deal?.id ?? ""}>
              <option value="">Not linked</option>
              {deals.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Field label="Project">
            <Select name="project" defaultValue={project?.id ?? ""}>
              <option value="">Not linked</option>
              {data.projects.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            </Select>
          </Field>
          <Row gap={2}>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <span className="ds-grow" />
            <Button type="submit" variant="primary">Save links</Button>
          </Row>
        </form>
      </Card>
    );
  }

  return (
    <Card span={6} eyebrow="LINKS" prov="human" title="Linked records" actions={<Button size="sm" variant="secondary" onClick={() => { setChosenCompany(companyId || suggestion?.id || ""); setEditing(true); }}>Edit links</Button>}>
      {!company && !deal && !project ? (
        <Stack gap={3}>
          <span className="ds-subtle">Not linked to a customer, deal or project.</span>
          {suggestion && (
            <Notice tone="info" title={`${suggestion.title} looks like this counterparty`}>
              The CRM has a company with a similar name. Linking it is your choice; nothing is matched automatically.
            </Notice>
          )}
        </Stack>
      ) : (
        <Stack gap={2}>
          {company && (
            <Row gap={2}>
              <Link2 size={14} aria-hidden="true" />
              <span className="ds-grow ds-truncate">Company: <strong>{company.title}</strong></span>
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/companies`)}>Companies</Button>
            </Row>
          )}
          {deal && (
            <Row gap={2}>
              <Link2 size={14} aria-hidden="true" />
              <span className="ds-grow ds-truncate">Deal: <strong>{deal.title}</strong> <span className="ds-subtle">· {deal.status}</span></span>
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/deals/${deal.id}`)}>Open deal</Button>
            </Row>
          )}
          {project && (
            <Row gap={2}>
              <Link2 size={14} aria-hidden="true" />
              <span className="ds-grow ds-truncate">Project: <strong>{project.title}</strong></span>
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/project/projects/${project.id}`)}>Open project</Button>
            </Row>
          )}
        </Stack>
      )}
    </Card>
  );
}

/* ---------------- versions ---------------- */

export function AddVersion({ context, contract, versions }: { context: ScreenContext; contract: Rec; versions: Version[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  if (!open) {
    return <Row gap={2}><Button variant="secondary" onClick={() => { setLabel(`Version ${versions.length + 1}`); setText(versions[versions.length - 1]?.text ?? ""); setOpen(true); }}>Store a new version</Button></Row>;
  }
  return (
    <Card eyebrow="NEW VERSION" prov="human" title="Store a new version">
      <form
        className="ds-stack ds-gap-3"
        aria-label="Store a new version"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!label.trim() || !text.trim()) return;
          if (versions.some((version) => version.label.trim().toLowerCase() === label.trim().toLowerCase())) {
            context.toast("That label is taken", "Give the version a label no other version uses.", "blocked");
            return;
          }
          const version: Version = { label: label.trim(), at: clockIso(), author: context.actor, text: text.trim() };
          if (!(await context.mutate.patch(contract.id, {
            fields: { ...contract.fields, versions: versions.length + 1 },
            body: { ...(contract.body as object ?? {}), versions: [...versions, version] },
          }, { expectRevision: contract.revision, event: `${contract.title}: version "${version.label}" stored by ${context.actor}` }))) return;
          context.toast("Version stored", contract.fields.immutableSigned === true ? "Stored beside the signed text, which is unchanged." : "Compare it with the previous one on the Redline tab.");
          setOpen(false);
        }}
      >
        <Field label="Label" required><TextInput value={label} onChange={(event) => setLabel(event.target.value)} required /></Field>
        <Field label="Text" required hint="Starts from the latest stored version so you can mark up the change."><TextArea rows={6} value={text} onChange={(event) => setText(event.target.value)} required /></Field>
        <Row gap={2}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <span className="ds-grow" />
          <Button type="submit" variant="primary">Store version</Button>
        </Row>
      </form>
    </Card>
  );
}
