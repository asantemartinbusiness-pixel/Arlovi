import { useState } from "react";
import { Archive, CalendarClock, FileText, Gavel, Scale, ShieldAlert } from "lucide-react";
import {
  Button, Checkbox, DrawerActions, Empty, FactGrid, Field, ModalActions, ModalInFlight, ModalUnsavedChanges, Notice, OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import {
  ContractDetail, ContractLibrary, DeadlineEditor, Evidence, GovernanceOverview, ObligationCalendar,
  ObligationQuickView, PolicyRegister, RiskRegister, ScoreRationale, clausesOf, lifecycleLabel, useLegalData,
  versionsOf,
} from "./panels";
import { Redline } from "./redline";
import { reviewsOf, startRound } from "./register";
import "./legal.css";
import { kitOverlays, needsSelection } from "@/applications/hr/opsKit";
import {
  AssemblePack, AssignOwnerForm, CommentOnContract, DraftContract, Reminder, RiskReview, SharePack, approveLegalStep, hashPack,
  publishPolicy, requestAcknowledgment, reviewItem,
} from "./actions";
import { getRecord, listByCollection } from "@/platform/repo";
import { clockIso, clockNow, wallMs } from "@/platform/clock";
import { contractRecordHeader } from "./recordHeads";
import { scopedDetailRecord } from "@/platform/recordScope";

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

function IssueCreate({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  return (
    <form
      id="lg-issue"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const impact = String(form.get("impact") ?? "medium");
        const likelihood = String(form.get("likelihood") ?? "medium");
        const scoreOf = (value: string) => ({ low: 1, medium: 2, high: 3 }[value] ?? 1);
        await context.mutate.create({
          collection: "risks",
          title: String(form.get("title") ?? "Issue"),
          status: "open",
          summary: String(form.get("detail") ?? ""),
          at: clockIso(),
          tags: [String(form.get("category") ?? "legal"), impact],
          fields: {
            category: String(form.get("category") ?? "legal"), impact, likelihood,
            score: scoreOf(impact) * scoreOf(likelihood),
            mitigation: String(form.get("mitigation") ?? ""), control: "To be agreed",
            reviewedAt: clockIso().slice(0, 10), aiSuggested: false, owner: context.actor,
          },
        }, `Issue raised by ${context.actor}`);
        context.toast("Issue raised", "It is on the risk register with you as its owner.");
        close();
      }}
    >
      <Field label="Issue" required><TextInput name="title" required /></Field>
      <Field label="What is the problem" required><TextArea name="detail" rows={4} required /></Field>
      <Row gap={3}>
        <Field label="Category">
          <Select name="category">{["legal", "compliance", "privacy", "operational", "financial", "security"].map((option) => <option key={option}>{option}</option>)}</Select>
        </Field>
        <Field label="Impact"><Select name="impact" defaultValue="medium">{["low", "medium", "high"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
        <Field label="Likelihood"><Select name="likelihood" defaultValue="medium">{["low", "medium", "high"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
      </Row>
      <Field label="What would reduce it"><TextArea name="mitigation" rows={3} /></Field>
      <Notice tone="info">
        {data.risks.length} risks are already on the register. Raising an issue here makes you its owner until somebody reassigns it.
      </Notice>
    </form>
  );
}

function RiskSummary({ context }: { context: ScreenContext }) {
  const data = useLegalData();
  const open = data.risks.filter((risk) => risk.status !== "closed");
  const categories = [...new Set(open.map((risk) => String(risk.fields.category ?? "other")))];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Open risks", value: <span className="ds-num">{String(open.length)}</span> },
        { label: "Scoring six or more", value: <span className="ds-num">{String(open.filter((risk) => Number(risk.fields.score ?? 0) >= 6).length)}</span> },
        { label: "With a mitigation recorded", value: <span className="ds-num">{String(open.filter((risk) => Boolean(risk.fields.mitigation)).length)}</span> },
      ]} />
      <Stack gap={2}>
        {categories.map((category) => (
          <Row key={category} gap={2}>
            <span className="ds-grow">{category}</span>
            <span className="ds-num ds-subtle">{open.filter((risk) => String(risk.fields.category ?? "other") === category).length}</span>
          </Row>
        ))}
      </Stack>
      <Notice tone="info" title="Counted from the register, not judged">
        A score is a product of two values a person chose. This panel adds them up and nothing more.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/legal/risks`)}>Open the register</Button>
    </Stack>
  );
}

function ContractUpload({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  const [title, setTitle] = useState("");
  const duplicate = data.contracts.some((contract) => contract.title.trim().toLowerCase() === title.trim().toLowerCase());
  return (
    <form
      id="lg-contract"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (duplicate || !title.trim()) return;
        const form = new FormData(event.currentTarget);
        const start = String(form.get("start") ?? "");
        const end = String(form.get("end") ?? "");
        const text = String(form.get("text") ?? "");
        await context.mutate.create({
          collection: "contracts",
          title: title.trim(),
          status: "draft",
          summary: String(form.get("summary") ?? ""),
          startAt: start ? new Date(`${start}T09:00:00.000Z`).toISOString() : undefined,
          endAt: end ? new Date(`${end}T09:00:00.000Z`).toISOString() : undefined,
          dueAt: end ? new Date(`${end}T09:00:00.000Z`).toISOString() : undefined,
          at: clockIso(),
          tags: [String(form.get("type") ?? "supply"), "draft"],
          fields: {
            counterparty: String(form.get("counterparty") ?? ""), type: String(form.get("type") ?? "supply"),
            owner: context.actor, noticeDays: Number(form.get("notice") ?? 30), signedAt: "",
            signatureProvider: "not_connected", clauseCount: 0, versions: 1, immutableSigned: false, valueMinor: 0,
          },
          body: {
            clauses: [],
            versions: [{ label: "Working draft", at: clockIso(), author: context.actor, text }],
            signatures: [],
          },
        }, `Contract added: ${title.trim()}`);
        context.toast("Contract added", "It is in the library as a draft, with its first version stored.");
        close();
      }}
    >
      <Field label="Contract name" required>
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="A contract with that name exists">Two contracts with one name make an obligation ambiguous.</Notice>}
      <Row gap={3}>
        <Field label="Counterparty" required><TextInput name="counterparty" required /></Field>
        <Field label="Type">
          <Select name="type">{["supply", "customer", "employment", "lease", "nda", "saas", "insurance"].map((option) => <option key={option}>{option}</option>)}</Select>
        </Field>
      </Row>
      <Row gap={3}>
        <Field label="Starts"><TextInput name="start" type="date" /></Field>
        <Field label="Ends"><TextInput name="end" type="date" /></Field>
        <Field label="Notice (days)"><TextInput name="notice" inputMode="numeric" align="end" defaultValue="30" /></Field>
      </Row>
      <Field label="What it is for"><TextInput name="summary" /></Field>
      <Field label="First version of the text" hint="Stored as a version so a later mark-up can be compared against it.">
        <TextArea name="text" rows={5} />
      </Field>
      <Notice tone="info" title="No file is uploaded">
        This records that a contract exists, who it is with and what it says. There is no document storage connected, so the text
        kept here is the text somebody typed.
      </Notice>
    </form>
  );
}

function ReviewerPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  const contract = scopedDetailRecord(useRecord(context.params.id ?? context.selectedId), context.org.id, "contracts");
  if (!contract) return <Empty title="Choose a contract first" icon={<FileText size={20} />}>A review is requested on one contract. None is substituted; choose one in the library.</Empty>;
  return (
    <form
      id="lg-reviewer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const reviewer = String(form.get("reviewer") ?? "");
        if (!(await context.mutate.patch(contract.id, {
          status: "in_review",
          fields: { ...contract.fields, reviewer, reviewRequestedBy: context.actor, reviewRequestedAt: clockIso() },
          body: { ...(contract.body as object ?? {}), reviews: startRound(reviewsOf(contract), reviewer, context.actor, clockIso(), crypto.randomUUID()) },
        }, { expectRevision: contract.revision, event: `${contract.title} sent for review to ${reviewer} by ${context.actor}` }))) return;
        context.toast("Review requested", `${contract.title} is in review with ${reviewer}.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Contract", value: contract.title },
        { label: "Status now", value: <Pill tone="neutral">{lifecycleLabel(contract.status)}</Pill> },
      ]} />
      <Field label="Reviewer" required>
        <Select name="reviewer" required>
          {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id}>{employee.title}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="A reviewer here is a colleague, not counsel">
        Nobody in this workspace is giving legal advice. A review step records that a named person read the contract.
      </Notice>
    </form>
  );
}

function ESignRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [selectedId, setSelectedId] = useState(payload?.id ?? context.params.id ?? context.selectedId ?? "");
  const candidate = useRecord(selectedId || undefined);
  const contract = candidate?.organizationId === context.org.id && candidate.collection === "contracts"
    ? candidate : undefined;
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approved = data.contracts.filter(row => row.status === "approved");
  if (!contract) return (
    <Stack gap={3}>
      <Notice tone={selectedId ? "warning" : "info"}
        title={selectedId ? "Selected contract unavailable" : "Choose a contract ready for signature"}>
        {selectedId ? "This contract cannot be found in the current company. No other document was substituted." :
          "Choose an approved contract before recording a signature request. No request is sent to an external party."}
      </Notice>
      {approved.length ? (
        <Field label="Approved contract">
          <Select aria-label="Approved contract" value={selectedId}
            onChange={event => { setSelectedId(event.target.value); setAcknowledged(false); setError(""); }}>
            <option value="">Select an approved contract</option>
            {approved.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
          </Select>
        </Field>
      ) : <Empty title="No approved contracts">Complete the contract approval process before marking anything for signature.</Empty>}
      <ModalActions><OverlayCancel>Cancel</OverlayCancel></ModalActions>
    </Stack>
  );
  const ready = contract.status === "approved";
  return (
    <Stack gap={4}>
      <ModalUnsavedChanges when={acknowledged} />
      <ModalInFlight when={busy} />
      <OverlaySummary
        eyebrow="Signature handover"
        title={contract.title}
        status={<Pill tone={ready ? "success" : "warning"} dot>{lifecycleLabel(contract.status)}</Pill>}
        meta={[String(contract.fields.counterparty ?? "") || null, `Version ${String(contract.fields.version ?? contract.revision)}`]}
      />
      {!ready && <Notice tone="warning" title="This contract is not approved for signing">
        Only an approved contract can move to awaiting signature. It is {lifecycleLabel(contract.status)}.
      </Notice>}
      <Notice tone="warning" title="No signing request is sent">
        No e-signature provider is connected, so no email or invitation goes to the counterparty and no signer is verified. This
        marks the contract awaiting signature in Arlovi; collect the signature outside it and record it afterwards.
      </Notice>
      <Checkbox checked={acknowledged} disabled={busy || !ready}
        onChange={event => setAcknowledged(event.target.checked)}
        label={`I reviewed ${contract.title}, its counterparty and approved status.`} />
      {error && <Notice tone="danger" title="Signature request not recorded">{error}</Notice>}
      <ModalActions>
        <OverlayActions variant="confirm" end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>} primary={<Button variant="primary" busy={busy}
          disabled={busy || !ready || !acknowledged || !context.can("view_legal")}
          onClick={async () => {
            if (busy || !ready || !acknowledged || !context.can("view_legal")) return;
            setBusy(true);
            setError("");
            try {
              const saved = await context.mutate.patch(contract.id, {
                status: "awaiting_signature",
                fields: { ...contract.fields,
                  signatureRequestedBy: context.actor, signatureRequestedAt: clockIso() },
              }, { expectRevision: contract.revision,
                event: `${contract.title} marked awaiting signature locally by ${context.actor}` });
              if (!saved) { setError("The contract changed. Reopen it before recording this handover."); return; }
              context.toast("Awaiting signature recorded", "The local contract status changed. No invitation or signature request was sent.");
              close();
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : "Review the contract and try again.";
              setError(message);
              context.toast("Signature handover not saved", message, "failed");
            } finally { setBusy(false); }
          }}>
          Mark awaiting signature
        </Button>} />
      </ModalActions>
    </Stack>
  );
}

function ClauseInspector({ context }: { context: ScreenContext }) {
  const contract = scopedDetailRecord(useRecord(context.params.id), context.org.id, "contracts");
  if (!contract) return <Empty title="Open a contract first" icon={<FileText size={20} />} />;
  const clauses = clausesOf(contract);
  const flagged = clauses.filter((clause) => clause.risk !== "standard");
  return flagged.length === 0 ? (
    <Stack gap={3}>
      <Notice tone="success" title="Nothing is flagged">Every clause on this contract is in the standard form.</Notice>
    </Stack>
  ) : (
    <Stack gap={4}>
      {flagged.map((clause) => (
        <div key={clause.id} className="lg-clause" data-risk={clause.risk}>
          <div className="lg-clause-title">
            <strong>{clause.title}</strong>
            <span className="ds-subtle ds-num">{clause.id}</span>
            <Pill tone={clause.risk === "unusual" ? "danger" : "warning"}>{clause.risk}</Pill>
          </div>
          <p className="ds-prose">{clause.text}</p>
          {clause.note && <p className="ds-subtle">{clause.note}</p>}
        </div>
      ))}
      <Notice tone="warning" title="Hypotheses, with the clause cited">
        Each note names the clause it came from. None of it is legal advice, and nothing here has been accepted.
      </Notice>
    </Stack>
  );
}

function RedlineDiff({ context }: { context: ScreenContext }) {
  const contract = scopedDetailRecord(useRecord(context.params.id), context.org.id, "contracts");
  if (!contract) return <Empty title="Open a contract first" icon={<FileText size={20} />} />;
  const versions = versionsOf(contract);
  if (versions.length < 2) {
    return <Empty title="Only one version is stored" icon={<FileText size={20} />}>A comparison needs two versions of the same text.</Empty>;
  }
  return (
    <Stack gap={4}>
      <h3>{contract.title}</h3>
      <Redline before={versions[versions.length - 2]} after={versions[versions.length - 1]} />
    </Stack>
  );
}

function SignAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const found = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const contract = found?.organizationId === context.org.id && found.collection === "contracts" ? found : undefined;
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!contract) return <Empty title="Choose a contract first" icon={<FileText size={20} />}>Recording a signature applies to one contract. None is substituted.</Empty>;
  const executed = contract.fields.immutableSigned === true;
  const approvedForSigning = contract.status === "approved" || contract.status === "awaiting_signature";
  return (
    <Stack gap={4}>
      <ModalUnsavedChanges when={confirmed} />
      <ModalInFlight when={busy} />
      <OverlaySummary
        eyebrow="Record a signature"
        title={contract.title}
        status={<Pill tone="neutral" dot>{lifecycleLabel(contract.status)}</Pill>}
        meta={[String(contract.fields.counterparty ?? "") || null]}
      />
      <FactGrid columns={2} items={[
        { label: "Value", value: contract.amountMinor ? context.money(contract.amountMinor) : "Not a fixed value", mono: true },
        { label: "Authority", value: context.can("view_legal") ? "Held by this role view" : "Not held by this role view", tone: context.can("view_legal") ? undefined : "warning" },
      ]} />
      {!executed && !approvedForSigning && (
        <Notice tone="warning" title="Approval has not happened">
          This contract is {lifecycleLabel(contract.status)}. It can be recorded as signed only once it is approved or awaiting signature.
        </Notice>
      )}
      {executed
        ? <Notice tone="info" title="Already executed">This contract was recorded as signed on {context.date(String(contract.fields.signedAt ?? ""))}. The executed version is immutable; a variation is stored as a new version.</Notice>
        : <Notice tone="danger" title="This fixes the executed version">
            Recording the signature makes the contract active and its current text immutable here. Nothing is sent to the
            counterparty and no signature is verified. Do this only after the document was actually signed.
          </Notice>}
      <Checkbox
        label={`I am ${context.actor} and I am recording that this was signed outside this workspace`}
        checked={confirmed}
        disabled={executed || busy || !approvedForSigning}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
          primary={<Button
            variant="danger"
            busy={busy}
            disabled={!confirmed || executed || !approvedForSigning || busy || !context.can("view_legal")}
            onClick={async () => {
              setBusy(true);
              try {
                const body = contract.body as { signatures?: { party: string; name: string; at: string; method: string }[] } | undefined;
                const now = clockIso();
                const saved = await context.mutate.patch(contract.id, {
                  status: "active",
                  fields: { ...contract.fields, signedAt: now, immutableSigned: true },
                  body: {
                    ...(contract.body as object ?? {}),
                    signatures: [...(body?.signatures ?? []), { party: context.org.name, name: context.actor, at: now, method: "Signed on paper and recorded in this workspace" }],
                  },
                }, { expectRevision: contract.revision, event: `${contract.title} recorded as signed by ${context.actor}` });
                if (!saved) return;
                context.toast("Signature recorded", "The contract is active and the executed version is now immutable here. Nothing was sent.");
                close();
              } finally { setBusy(false); }
            }}
          >
            Record the signature
          </Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function PolicyEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  return (
    <form
      id="lg-policy"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const current = String(existing?.fields.version ?? "0.9");
        const next = `${Number(current.split(".")[0])}.${Number(current.split(".")[1] ?? 0) + 1}`;
        const fields = {
          kind: "governance",
          version: existing ? next : "1.0",
          acknowledgementRequired: form.get("ack") === "on",
          acknowledged: 0,
          audience: String(form.get("audience") ?? "All employees"),
          supersedes: existing ? current : "",
        };
        const due = clockNow();
        due.setFullYear(due.getFullYear() + 1);
        if (existing && existing.status === "draft") {
          if (!(await context.mutate.patch(existing.id, {
            title: String(form.get("title") ?? existing.title),
            summary: String(form.get("summary") ?? existing.summary),
            fields: { ...existing.fields, acknowledgementRequired: fields.acknowledgementRequired, audience: fields.audience },
          }, { expectRevision: existing.revision, event: `Draft ${existing.title} v${current} edited by ${context.actor}` }))) return;
        } else if (existing) {
          await context.mutate.create({
            collection: "policies",
            title: String(form.get("title") ?? existing.title),
            status: "draft",
            summary: String(form.get("summary") ?? existing.summary),
            at: clockIso(),
            dueAt: due.toISOString(),
            tags: ["governance"],
            fields: { ...existing.fields, ...fields, supersedesId: existing.id },
          }, `Revision v${next} of ${existing.title} drafted by ${context.actor}; v${current} stays published`);
        } else {
          await context.mutate.create({
            collection: "policies",
            title: String(form.get("title") ?? "Policy"),
            status: "draft",
            summary: String(form.get("summary") ?? ""),
            at: clockIso(),
            dueAt: due.toISOString(),
            tags: ["governance"],
            fields,
          }, `Policy drafted by ${context.actor}`);
        }
        context.toast("Policy saved", existing && existing.status !== "draft" ? `Draft v${next} saved. Version ${current} stays live until the draft is published.` : "It is a draft until somebody publishes it.");
        close();
      }}
    >
      <Field label="Policy" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="What it says" required><TextArea name="summary" rows={4} defaultValue={existing?.summary ?? ""} required /></Field>
      <Field label="Who it applies to">
        <Select name="audience" defaultValue={String(existing?.fields.audience ?? "All employees")}>
          {["All employees", "Managers", "Workshop", "Suppliers"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Checkbox name="ack" label="Everyone it applies to must acknowledge it" defaultChecked={existing?.fields.acknowledgementRequired === true} />
      {existing && existing.status !== "draft" && (
        <Notice tone="warning" title="Saving makes a draft revision; publishing starts the acknowledgements again">
          Version {String(existing.fields.version ?? "")} and its {String(existing.fields.acknowledged ?? 0)} acknowledgements are
          kept, so a decision taken under the old wording can still be read against it.
        </Notice>
      )}
    </form>
  );
}

function PolicyAudience({ context }: { context: ScreenContext }) {
  const data = useLegalData();
  const policy = scopedDetailRecord(useRecord(context.selectedId), context.org.id, "policies");
  const staff = data.employees.filter((employee) => employee.status !== "alumni");
  if (!policy) return <Empty title="Select a policy" icon={<Gavel size={20} />}>Choose a policy in the register first. None is substituted.</Empty>;
  const audience = String(policy.fields.audience ?? "All employees");
  const reached = audience === "All employees" ? staff : staff.filter((employee) => String(employee.fields.office ?? "").toLowerCase().includes(audience.toLowerCase()) || String(employee.fields.title ?? "").toLowerCase().includes(audience.toLowerCase()));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Policy", value: policy.title },
        { label: "Audience", value: audience },
        { label: "People it reaches", value: <span className="ds-num">{String(reached.length)}</span> },
        { label: "Acknowledged", value: <span className="ds-num">{String(policy.fields.acknowledged ?? 0)}</span> },
      ]} />
      <Stack gap={2}>
        {reached.slice(0, 12).map((employee) => (
          <Row key={employee.id} gap={2}>
            <span className="ds-grow ds-truncate">{employee.title}</span>
            <span className="ds-subtle">{String(employee.fields.title ?? "")}</span>
          </Row>
        ))}
      </Stack>
      <Notice tone="info">Acknowledgements are recorded per person per version, so a revision does not erase the old count.</Notice>
    </Stack>
  );
}

function PublicationImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useLegalData();
  const policy = scopedDetailRecord(useRecord(payload?.id ?? context.selectedId), context.org.id, "policies");
  const staff = data.employees.filter((employee) => employee.status !== "alumni").length;
  if (!policy) return <Empty title="Select a policy" icon={<Gavel size={20} />}>Choose a policy in the register first. None is substituted.</Empty>;
  const current = String(policy.fields.version ?? "1.0");
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Publishing a revision of {policy.title} keeps version {current} on the record and asks everyone it applies to acknowledge
        the new wording.
      </p>
      <Properties rows={[
        { label: "Current version", value: <span className="ds-num">{current}</span> },
        { label: "Acknowledgements kept", value: <span className="ds-num">{String(policy.fields.acknowledged ?? 0)}</span> },
        { label: "People asked again", value: policy.fields.acknowledgementRequired === true ? <span className="ds-num">{String(staff)}</span> : "Nobody — acknowledgement is not required" },
      ]} />
      <Notice tone="warning" title="A superseded version is never deleted">
        A decision taken last year was taken under last year's wording. Keeping the old version is what makes that decision
        readable afterwards.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={policy.status === "draft"
            ? <Button variant="primary" disabled={!context.can("manage_policy")} onClick={() => publishPolicy(context, policy)}>Publish v{current}</Button>
            : <Button variant="secondary" onClick={() => { context.select(policy.id); context.openOverlay("Policy editor", { id: policy.id }); }}>Open the editor</Button>}
          secondary={policy.status === "draft"
            ? <Button variant="secondary" onClick={() => { context.select(policy.id); context.openOverlay("Policy editor", { id: policy.id }); }}>Open the editor</Button>
            : undefined}
          end={<Button variant="ghost" onClick={close}>Close</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function EvidenceUpload({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  const obligation = useRecord(context.selectedId);
  return (
    <form
      id="lg-evidence"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "Evidence");
        const created = await context.mutate.create({
          collection: "documents",
          title,
          status: "assembled",
          summary: String(form.get("detail") ?? ""),
          at: clockIso(),
          tags: ["evidence"],
          fields: {
            kind: "evidencePack", items: Number(form.get("items") ?? 1), legalHold: false,
            hash: `sha256:${title.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}${wallMs().toString(36).slice(-4)}`,
            assembledBy: context.actor, exportable: true,
          },
        }, `Evidence pack assembled by ${context.actor}`);
        if (obligation) {
          if (!(await context.mutate.patch(obligation.id, { fields: { ...obligation.fields, evidenceId: created.id } }, { event: `Evidence linked to ${obligation.title}` }))) return;
        }
        context.toast("Evidence recorded", "The pack is in the evidence directory with a content hash and your name on it.");
        close();
      }}
    >
      <Field label="Pack name" required><TextInput name="title" required /></Field>
      <Field label="What it contains" required><TextArea name="detail" rows={3} required /></Field>
      <Field label="How many documents"><TextInput name="items" inputMode="numeric" align="end" defaultValue="1" /></Field>
      {obligation && <Notice tone="info">It will be linked to {obligation.title}.</Notice>}
      <Notice tone="warning" title="A hash over what this workspace holds">
        The hash is computed over the record in this browser. It shows the record has not changed since; it is not a notarised
        chain of custody, and {data.documents.length > 0 ? "no external store is connected" : "nothing is stored elsewhere"}.
      </Notice>
    </form>
  );
}

/** The pack a hold, export or detail overlay is about: named by the overlay or the selection, never guessed. */
function usePack(context: ScreenContext) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const pack = useRecord(payload?.id ?? context.selectedId);
  return pack && pack.organizationId === context.org.id && pack.fields.kind === "evidencePack" ? pack : undefined;
}

function ChoosePack({ context, what }: { context: ScreenContext; what: string }) {
  const data = useLegalData();
  const packs = data.documents.filter((row) => row.fields.kind === "evidencePack");
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Choose an evidence pack first">{what} applies to one pack. No pack is substituted.</Notice>
      {packs.map((pack) => (
        <Row key={pack.id} gap={2}>
          <span className="ds-grow ds-truncate">{pack.title}</span>
          {pack.fields.legalHold === true && <Pill tone="danger" dot>Held</Pill>}
          <Button size="sm" variant="secondary" onClick={() => context.select(pack.id)}>Choose</Button>
        </Row>
      ))}
      {packs.length === 0 && <Empty title="No evidence packs" icon={<Archive size={20} />} />}
    </Stack>
  );
}

function PackSummary({ context, pack }: { context: ScreenContext; pack: NonNullable<ReturnType<typeof usePack>> }) {
  const held = pack.fields.legalHold === true;
  return (
    <OverlaySummary
      eyebrow="Evidence pack"
      title={pack.title}
      status={held ? <Pill tone="danger" dot>Held</Pill> : <Pill tone="success" dot>Assembled</Pill>}
      meta={[`${String(pack.fields.items ?? 0)} items`, `Assembled ${context.date(pack.at)} by ${String(pack.fields.assembledBy ?? pack.ownerName)}`]}
    />
  );
}

function EvidenceDetail({ context }: { context: ScreenContext }) {
  const pack = usePack(context);
  if (!pack) return <ChoosePack context={context} what="Opening a pack" />;
  const held = pack.fields.legalHold === true;
  return (
    <Stack gap={4}>
      <PackSummary context={context} pack={pack} />
      {pack.summary && <p className="ds-prose">{pack.summary}</p>}
      <FactGrid columns={2} items={[
        { label: "Content hash", value: String(pack.fields.hash ?? "Not computed"), mono: true },
        { label: "Legal hold", value: held ? "On: cannot be deleted or exported" : "Off", tone: held ? "danger" : undefined },
      ]} />
      <Notice tone="info" title="Chain of custody, as far as it goes">
        The record names who assembled the pack and when, and the hash shows it has not changed since. Nothing here is
        countersigned by anybody outside this browser.
      </Notice>
      <DrawerActions>
        <OverlayActions
          primary={context.can("view_legal")
            ? <Button variant="primary" onClick={() => context.openOverlay("legal hold", { id: pack.id })}>{held ? "Review the hold" : "Place a legal hold"}</Button>
            : <OverlayCancel>Close</OverlayCancel>}
          secondary={<Button variant="secondary" onClick={() => context.openOverlay("export permissions", { id: pack.id })}>Export rules</Button>}
          end={context.can("view_legal") ? <OverlayCancel>Close</OverlayCancel> : undefined}
        />
      </DrawerActions>
    </Stack>
  );
}

function LegalHold({ context, close }: { context: ScreenContext; close: () => void }) {
  const pack = usePack(context);
  const [busy, setBusy] = useState(false);
  if (!pack) return <ChoosePack context={context} what="A legal hold" />;
  const held = pack.fields.legalHold === true;
  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <PackSummary context={context} pack={pack} />
      <FactGrid columns={2} items={[
        { label: "Currently", value: held ? "Held" : "Not held", tone: held ? "danger" : undefined },
        { label: "Retention", value: "Six years, unless a hold is on" },
      ]} />
      <Notice tone="warning" title={held ? "Lifting the hold" : "What a hold does"}>
        {held
          ? "The pack goes back under the retention schedule and can be exported again. Lifting a hold is a decision recorded against your name."
          : "It stops the pack being deleted by the retention schedule and refuses any export, whatever the role view allows. Lifting it is a decision somebody has to take and have recorded against their name."}
      </Notice>
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
          primary={<Button
            variant={held ? "outline-danger" : "danger"}
            busy={busy}
            disabled={!context.can("view_legal") || busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!(await context.mutate.patch(pack.id, {
                  status: held ? "assembled" : "held",
                  fields: { ...pack.fields, legalHold: !held, exportable: held, holdChangedBy: context.actor },
                }, { expectRevision: pack.revision, event: `${held ? "Legal hold lifted" : "Legal hold placed"} on ${pack.title} by ${context.actor}` }))) return;
                context.toast(held ? "Hold lifted" : "Hold placed", held ? `${pack.title} can be exported again.` : `${pack.title} cannot be deleted or exported while the hold is on.`);
                close();
              } finally { setBusy(false); }
            }}
          >
            {held ? "Lift the hold" : "Place a legal hold"}
          </Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function ExportPermissions({ context }: { context: ScreenContext }) {
  const pack = usePack(context);
  if (!pack) return <ChoosePack context={context} what="Export rules" />;
  const blocked = pack.fields.legalHold === true;
  const allowed = context.can("export_data") && !blocked;
  return (
    <Stack gap={4}>
      <PackSummary context={context} pack={pack} />
      <OverlaySection title="Can this pack leave?" tone={allowed ? "success" : "danger"}>
        <FactGrid columns={3} items={[
          { label: "Your role view", value: context.can("export_data") ? "May export" : "May not export", tone: context.can("export_data") ? "success" : "warning" },
          { label: "Legal hold", value: blocked ? "On" : "Off", tone: blocked ? "danger" : undefined },
          { label: "Result", value: allowed ? "Export permitted" : "Export refused", tone: allowed ? "success" : "danger" },
        ]} />
      </OverlaySection>
      {blocked && <Notice tone="danger" title="A hold beats a permission">This pack cannot be exported by anybody while the hold is on.</Notice>}
      <Notice tone="info" title="Role views are not an account security boundary">
        What a role view offers is shaped in this browser. A future service would have to enforce an export rule on the server.
      </Notice>
      <DrawerActions>
        <OverlayActions
          primary={<Button
            variant="primary"
            disabled={!allowed}
            onClick={() => {
              const header = "pack,items,assembled by,assembled,hash\n";
              const body = `"${pack.title}","${String(pack.fields.items ?? 0)}","${String(pack.fields.assembledBy ?? "")}","${pack.at ?? ""}","${String(pack.fields.hash ?? "")}"`;
              const blob = new Blob([header + body], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${context.org.slug}-evidence.csv`;
              link.click();
              URL.revokeObjectURL(url);
              context.toast("Manifest downloaded", "The manifest was saved from this browser. The pack itself did not leave.");
            }}
          >
            Export the manifest
          </Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function Escalation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useLegalData();
  const obligation = useRecord(context.selectedId) ?? data.obligations.find((row) => row.status !== "done");
  if (!obligation) return <Empty title="Select an obligation" icon={<CalendarClock size={20} />} />;
  return (
    <form
      id="lg-escalate"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (!(await context.mutate.patch(obligation.id, {
          status: "escalated",
          fields: { ...obligation.fields, escalatedTo: String(form.get("to") ?? ""), escalatedBy: context.actor, escalationReason: String(form.get("why") ?? "") },
        }, { expectRevision: obligation.revision, event: `${obligation.title} escalated to ${String(form.get("to") ?? "")} by ${context.actor}` }))) return;
        context.toast("Escalated", "The record says who escalated it, to whom and why.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Obligation", value: obligation.title },
        { label: "Due", value: <span className="ds-num">{context.date(obligation.dueAt)}</span> },
        { label: "Owner", value: String(obligation.fields.owner ?? obligation.ownerName) },
      ]} />
      <Field label="Escalate to" required>
        <Select name="to" required>
          {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id}>{employee.title}</option>)}
        </Select>
      </Field>
      <Field label="Why" required><TextArea name="why" rows={3} required /></Field>
      <Notice tone="info">Escalating puts this in front of somebody. It does not notify them outside this browser.</Notice>
    </form>
  );
}

function RiskForm({ context, close }: { context: ScreenContext; close: () => void }) {
  return <IssueCreate context={context} close={close} />;
}

function ControlAssignment({ context, close }: { context: ScreenContext; close: () => void }) {
  const risk = useRecord(context.selectedId);
  const data = useLegalData();
  if (!risk) return <Empty title="Select a risk" icon={<ShieldAlert size={20} />} />;
  return (
    <form
      id="lg-control"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (!(await context.mutate.patch(risk.id, {
          status: String(form.get("status") ?? risk.status),
          fields: {
            ...risk.fields,
            control: String(form.get("control") ?? ""),
            mitigation: String(form.get("mitigation") ?? ""),
            owner: String(form.get("owner") ?? risk.fields.owner ?? risk.ownerName),
          },
        }, { expectRevision: risk.revision, event: `Control assigned on ${risk.title} by ${context.actor}` }))) return;
        context.toast("Control recorded", "The mitigation, its control and its owner are on the register.");
        close();
      }}
    >
      <h3>{risk.title}</h3>
      <Field label="What reduces this risk" required><TextArea name="mitigation" rows={3} defaultValue={String(risk.fields.mitigation ?? "")} required /></Field>
      <Field label="The control that proves it is happening" required><TextInput name="control" defaultValue={String(risk.fields.control ?? "")} required /></Field>
      <Row gap={3}>
        <Field label="Owner">
          <Select name="owner" defaultValue={String(risk.fields.owner ?? risk.ownerName)}>
            {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id}>{employee.title}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={risk.status}>{["open", "mitigating", "closed"].map((option) => <option key={option}>{option}</option>)}</Select>
        </Field>
      </Row>
      <Notice tone="info">A mitigation without a control is an intention. The control is what somebody can check.</Notice>
    </form>
  );
}

function ScheduleAudit({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="lg-audit"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const date = String(form.get("due") ?? "");
        await context.mutate.create({
          collection: "obligations",
          title: String(form.get("title") ?? "Audit"),
          status: "upcoming",
          summary: String(form.get("scope") ?? ""),
          dueAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
          at: clockIso(),
          tags: ["compliance", "audit"],
          fields: {
            kind: "compliance", owner: context.actor, recurrence: "Annual",
            jurisdiction: context.org.jurisdiction, timezone: context.org.timezone,
            contractId: "", evidenceId: "", reminderDays: 30,
          },
        }, `Audit scheduled by ${context.actor}`);
        context.toast("Audit scheduled", "It is on the obligation calendar.");
        close();
      }}
    >
      <Field label="Audit" required><TextInput name="title" defaultValue="Annual controls review" required /></Field>
      <Field label="Scope"><TextArea name="scope" rows={3} /></Field>
      <Field label="Date" required><TextInput name="due" type="date" required /></Field>
      <Notice tone="info">An audit is an obligation with a date and an owner, like anything else on the calendar.</Notice>
    </form>
  );
}

export const legalApp = registerApp({
  code: "LEGAL",
  short: "Legal",
  name: "Governance, Legal Operations & Risk",
  purpose: "Contracts, obligations, policy and what could go wrong",
  icon: Scale,
  nav: [
    { items: [
      { label: "Governance", screenId: "ARL-LEGAL-001", icon: Gavel },
    ] },
    { label: "Contracts", items: [
      { label: "Contract library", screenId: "ARL-LEGAL-002", icon: FileText },
      { label: "Policy register", screenId: "ARL-LEGAL-004", icon: Gavel },
    ] },
    { label: "Duties", items: [
      { label: "Obligation calendar", screenId: "ARL-LEGAL-005", icon: CalendarClock },
      { label: "Risk register", screenId: "ARL-LEGAL-006", icon: ShieldAlert },
      { label: "Audit & evidence", screenId: "ARL-LEGAL-007", icon: Archive },
    ] },
  ],
  screens: {
    "ARL-LEGAL-001": {
      id: "ARL-LEGAL-001",
      subtitle: () => "Nothing here is legal advice.",
      tabs: (["Overview", "Obligations", "Policies", "Risks"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <GovernanceOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Review item", label: "Review an obligation", placement: "primary", capability: "view_legal", run: (context) => reviewItem(context) },
        { id: "raise issue", label: "Raise an issue", placement: "overflow", run: (context) => context.openOverlay("issue create") },
        { id: "report", label: "Risk report", placement: "secondary", run: (context) => context.openOverlay("risk summary") },
        { id: "assign counsel", label: "Assign counsel", placement: "overflow", capability: "view_legal", run: (context) => context.openOverlay("assign counsel") },
        { id: "schedule audit", label: "Schedule an audit", placement: "overflow", capability: "view_legal", run: (context) => context.openOverlay("schedule audit") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Obligation quick view", kind: "drawer", title: "Obligation", width: 520, render: ({ ...context }) => <ObligationQuickView context={context} /> },
        { id: "issue create", kind: "modal", title: "Raise an issue", width: 600, render: ({ close, ...context }) => <IssueCreate context={context} close={close} />, footer: submitFooter("lg-issue", "Raise the issue") },
        { id: "risk summary", kind: "drawer", title: "Risk summary", width: 480, render: ({ ...context }) => <RiskSummary context={context} /> },
        { id: "evidence upload", kind: "modal", title: "Record evidence", width: 600, render: ({ close, ...context }) => <EvidenceUpload context={context} close={close} />, footer: submitFooter("lg-evidence", "Record the pack") },
        { id: "assign counsel", kind: "modal", title: "Assign counsel", width: 520, render: ({ close, ...context }) => <AssignOwnerForm context={context} close={close} collections={["obligations", "risks", "contracts"]} label="Item" />, footer: submitFooter("lg-assign", "Assign") },
        { id: "schedule audit", kind: "modal", title: "Schedule an audit", width: 520, render: ({ close, ...context }) => <ScheduleAudit context={context} close={close} />, footer: submitFooter("lg-audit", "Schedule audit") },
      ],
    },

    "ARL-LEGAL-002": {
      id: "ARL-LEGAL-002",
      tabs: (["Draft", "Review", "Active", "Expiring", "Archived"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ContractLibrary context={context} lens={lens} />,
      })),
      actions: [
        { id: "Upload", label: "Upload — record a contract", placement: "primary", capability: "view_legal", run: (context) => context.openOverlay("Contract upload") },
        { id: "assign review", label: "Send for review", placement: "secondary", capability: "view_legal", guard: (context) => (context.selectedId ? undefined : "Choose a contract first"), run: (context) => context.openOverlay("reviewer picker") },
        { id: "send for signature", label: "Send for signature", placement: "overflow", capability: "view_legal", guard: (context) => (context.selectedId ? undefined : "Choose a contract first"), run: (context) => context.openOverlay("e-sign request") },
        { id: "draft", label: "Draft a contract", placement: "overflow", capability: "view_legal", run: (context) => context.openOverlay("draft contract") },
      ],
      overlays: [
        { id: "draft contract", kind: "modal", title: "Draft a contract", width: 640, render: ({ close, ...context }) => <DraftContract context={context} close={close} />, footer: submitFooter("lg-draft", "Create the draft") },
        { id: "Contract upload", kind: "modal", title: "Add a contract", width: 680, render: ({ close, ...context }) => <ContractUpload context={context} close={close} />, footer: submitFooter("lg-contract", "Add contract") },
        { id: "reviewer picker", kind: "modal", title: "Send for review", width: 560, render: ({ close, ...context }) => <ReviewerPicker context={context} close={close} />, footer: submitFooter("lg-reviewer", "Request review") },
        { id: "e-sign request", kind: "modal", title: "Signature handover", width: 520, capability: "view_legal", presentation: { noRecordContext: true, guidance: "Select an approved contract and record an awaiting-signature handover; nothing is delivered to a signing provider." }, render: ({ close, ...context }) => <ESignRequest context={context} close={close} /> },
      ],
    },

    "ARL-LEGAL-003": {
      id: "ARL-LEGAL-003",
      title: () => "Contract",
      record: contractRecordHeader,
      tabs: ["Overview", "Clauses", "Redline", "Signatures", "History"].map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ContractDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Compare", label: "Compare versions", placement: "primary", run: (context) => context.setTab("Redline") },
        { id: "request review", label: "Request a review", placement: "secondary", capability: "view_legal", run: (context) => context.openOverlay("request review") },
        { id: "approve legal step", label: "Approve the legal step", placement: "overflow", capability: "view_legal", run: (context) => approveLegalStep(context) },
        { id: "comment", label: "Comment", placement: "overflow", run: (context) => context.openOverlay("comment") },
        { id: "record signature", label: "Record a signature", placement: "overflow", capability: "view_legal", run: (context) => context.openOverlay("sign authorization") },
        { id: "flagged clauses", label: "Flagged clauses", placement: "overflow", run: (context) => context.openOverlay("Clause inspector") },
        { id: "what changed", label: "What changed", placement: "overflow", run: (context) => context.openOverlay("redline diff") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "request review", kind: "modal", title: "Request a review", width: 560, render: ({ close, ...context }) => <ReviewerPicker context={context} close={close} />, footer: submitFooter("lg-reviewer", "Request review") },
        { id: "comment", kind: "modal", title: "Comment on the contract", width: 560, render: ({ close, ...context }) => <CommentOnContract context={context} close={close} />, footer: submitFooter("lg-comment", "Add the comment") },
        { id: "Clause inspector", kind: "drawer", title: "Flagged clauses", width: 560, render: ({ ...context }) => <ClauseInspector context={context} /> },
        { id: "redline diff", kind: "drawer", title: "What changed", width: 720, render: ({ ...context }) => <RedlineDiff context={context} /> },
        { id: "e-sign request", kind: "modal", title: "Signature handover", width: 520, capability: "view_legal", presentation: { noRecordContext: true }, render: ({ close, ...context }) => <ESignRequest context={context} close={close} /> },
        { id: "sign authorization", kind: "modal", title: "Record a signature", tone: "danger", width: 520, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <SignAuthorization context={context} close={close} /> },
      ],
    },

    "ARL-LEGAL-004": {
      id: "ARL-LEGAL-004",
      tabs: (["All", "Due review", "Draft", "Published"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <PolicyRegister context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "Create a policy", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Policy editor") },
        { id: "revise", label: "Revise", placement: "secondary", capability: "manage_policy", guard: (context) => (context.selectedId ? undefined : "Choose a policy first"), run: (context) => context.openOverlay("Policy editor") },
        { id: "publish", label: "Publish a draft", placement: "overflow", capability: "manage_policy", guard: needsSelection("a draft policy"), run: async (context) => {
          const policy = await getRecord(context.selectedId ?? "");
          if (policy?.collection === "policies") await publishPolicy(context, policy);
          else context.toast("Select a draft policy first", "Nothing was published.", "blocked");
        } },
        { id: "request acknowledgment", label: "Request acknowledgement", placement: "overflow", capability: "manage_policy", guard: needsSelection("a policy"), run: async (context) => {
          const policy = await getRecord(context.selectedId ?? "");
          const staff = (await listByCollection(context.org.id, "employees")).filter((employee) => employee.status !== "alumni");
          const audience = String(policy?.fields.audience ?? "All employees");
          const reach = audience === "All employees" ? staff.length : staff.filter((employee) => `${String(employee.fields.office ?? "")} ${String(employee.fields.title ?? "")}`.toLowerCase().includes(audience.toLowerCase())).length;
          await requestAcknowledgment(context, reach);
        } },
        { id: "publication impact", label: "What publishing does", placement: "overflow", guard: needsSelection("a policy"), run: (context) => context.openOverlay("publication impact") },
        { id: "who it reaches", label: "Who it reaches", placement: "overflow", guard: needsSelection("a policy"), run: (context) => context.openOverlay("audience") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Policy editor", kind: "modal", title: "Policy", width: 640, render: ({ close, ...context }) => <PolicyEditor context={context} close={close} />, footer: submitFooter("lg-policy", "Save policy") },
        { id: "audience", kind: "drawer", title: "Who this reaches", width: 480, render: ({ ...context }) => <PolicyAudience context={context} /> },
        { id: "publication impact", kind: "modal", title: "What publishing does", width: 560, render: ({ close, ...context }) => <PublicationImpact context={context} close={close} /> },
      ],
    },

    "ARL-LEGAL-005": {
      id: "ARL-LEGAL-005",
      subtitle: (context) => `Deadlines stored absolutely, with their jurisdiction. This workspace uses ${context.org.timezone}.`,
      tabs: (["Calendar", "Owner", "Overdue", "Completed"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ObligationCalendar context={context} lens={lens} />,
      })),
      actions: [
        { id: "Assign", label: "Assign an owner", placement: "primary", capability: "view_legal", run: (context) => context.openOverlay("assign owner") },
        { id: "record evidence", label: "Record evidence", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose an obligation first"), run: (context) => context.openOverlay("evidence upload") },
        { id: "remind", label: "Set a reminder", placement: "overflow", guard: needsSelection("an obligation"), run: (context) => context.openOverlay("reminder") },
        { id: "escalate", label: "Escalate", placement: "overflow", capability: "view_legal", guard: needsSelection("an obligation"), run: (context) => context.openOverlay("escalation") },
        { id: "add deadline", label: "Add a deadline", placement: "overflow", run: (context) => context.openOverlay("Deadline editor") },
        { id: "overdue", label: "What is overdue", placement: "overflow", run: (context) => context.setTab("Overdue") },
      ],
      overlays: [
        { id: "assign owner", kind: "modal", title: "Assign an owner", width: 520, render: ({ close, ...context }) => <AssignOwnerForm context={context} close={close} collections={["obligations"]} label="Obligation" />, footer: submitFooter("lg-assign", "Assign") },
        { id: "reminder", kind: "modal", title: "Set a reminder", width: 520, render: ({ close, ...context }) => <Reminder context={context} close={close} />, footer: submitFooter("lg-reminder", "Set the reminder") },
        { id: "Deadline editor", kind: "modal", title: "Obligation", width: 680, render: ({ close, ...context }) => <DeadlineEditor context={context} close={close} />, footer: submitFooter("lg-deadline", "Save obligation") },
        { id: "evidence upload", kind: "modal", title: "Record evidence", width: 600, render: ({ close, ...context }) => <EvidenceUpload context={context} close={close} />, footer: submitFooter("lg-evidence", "Record the pack") },
        { id: "escalation", kind: "modal", title: "Escalate", width: 560, render: ({ close, ...context }) => <Escalation context={context} close={close} />, footer: submitFooter("lg-escalate", "Escalate") },
      ],
    },

    "ARL-LEGAL-006": {
      id: "ARL-LEGAL-006",
      tabs: (["All", "High", "Owned", "Closed"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <RiskRegister context={context} lens={lens} />,
      })),
      actions: [
        { id: "Add", label: "Add a risk", placement: "primary", run: (context) => context.openOverlay("Risk form") },
        { id: "score", label: "Score a risk", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a risk first"), run: (context) => context.openOverlay("score rationale") },
        { id: "mitigate", label: "Mitigate — assign a control", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a risk first"), run: (context) => context.openOverlay("control assignment") },
        { id: "review", label: "Review a risk", placement: "overflow", guard: needsSelection("a risk"), run: (context) => context.openOverlay("risk review") },
        { id: "high risks", label: "High risks", placement: "overflow", run: (context) => context.setTab("High") },
      ],
      overlays: [
        { id: "risk review", kind: "modal", title: "Review a risk", width: 580, render: ({ close, ...context }) => <RiskReview context={context} close={close} />, footer: submitFooter("lg-risk-review", "Record the review") },
        { id: "Risk form", kind: "modal", title: "Add a risk", width: 600, render: ({ close, ...context }) => <RiskForm context={context} close={close} />, footer: submitFooter("lg-issue", "Add risk") },
        { id: "score rationale", kind: "modal", title: "Score and why", width: 600, render: ({ close, ...context }) => <ScoreRationale context={context} close={close} />, footer: submitFooter("lg-score", "Record the score") },
        { id: "control assignment", kind: "modal", title: "Mitigation and control", width: 600, render: ({ close, ...context }) => <ControlAssignment context={context} close={close} />, footer: submitFooter("lg-control", "Save control") },
      ],
    },

    "ARL-LEGAL-007": {
      id: "ARL-LEGAL-007",
      tabs: (["Packs", "Requests", "Holds", "Exports"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Evidence context={context} lens={lens} />,
      })),
      actions: [
        { id: "Assemble", label: "Assemble a pack", placement: "primary", capability: "view_legal", run: (context) => context.openOverlay("assemble pack") },
        { id: "request legal hold", label: "Legal hold", placement: "secondary", capability: "view_legal", guard: (context) => (context.selectedId ? undefined : "Choose a pack first"), run: (context) => context.openOverlay("legal hold") },
        { id: "share", label: "Share a pack", placement: "overflow", capability: "view_legal", guard: needsSelection("a pack"), run: (context) => context.openOverlay("share pack") },
        { id: "hash", label: "Hash or verify a pack", placement: "overflow", guard: needsSelection("a pack"), run: (context) => hashPack(context) },
        { id: "export rules", label: "Export rules", placement: "overflow", run: (context) => context.openOverlay("export permissions") },
        { id: "open pack", label: "Open a pack", placement: "overflow", guard: needsSelection("a pack"), run: (context) => context.openOverlay("Evidence detail") },
      ],
      overlays: [
        { id: "assemble pack", kind: "modal", title: "Assemble an evidence pack", width: 620, render: ({ close, ...context }) => <AssemblePack context={context} close={close} />, footer: submitFooter("lg-assemble", "Assemble and hash") },
        { id: "share pack", kind: "modal", title: "Share a pack", width: 540, render: ({ close, ...context }) => <SharePack context={context} close={close} /> },
        { id: "Evidence detail", kind: "drawer", title: "Evidence pack", width: 540, render: ({ ...context }) => <EvidenceDetail context={context} /> },
        { id: "legal hold", kind: "modal", title: "Legal hold", tone: "danger", width: 560, render: ({ close, ...context }) => <LegalHold context={context} close={close} /> },
        { id: "export permissions", kind: "drawer", title: "Export rules", width: 520, render: ({ ...context }) => <ExportPermissions context={context} /> },
      ],
    },
  },
});
