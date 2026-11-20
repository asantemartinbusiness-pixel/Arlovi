import { useState } from "react";
import { BookOpen, Headphones, Inbox, Settings2, Smile, Timer, Wand2 } from "lucide-react";
import {
  Button, Checkbox, DataGrid, Empty, Field, ModalActions, ModalInFlight, ModalUnsavedChanges, Notice, OVERLAY_WIDTH, OverlayActions, OverlayCancel, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById } from "@/platform/capability";
import {
  Automation, CannedReply, CustomerContext, CustomerInspector, Escalation, CaseSummary, InternalNote, KnowledgeBase,
  OmnichannelInbox, QueueRules, Quality, RefundFooter, RefundRequest, ResponseComposer, ServiceOverview, SlaInspector,
  Slas, TicketDetail, TicketList, policyFor, useCareData,
} from "./panels";
import { SLA_TONE, formatMinutes, slaState } from "./sla";
import "./care.css";
import { kitOverlays, needsSelection } from "@/applications/hr/opsKit";
import {
  Annotate, ArticleRevision, AssignCoaching, AssignSpecialist, CaseFilter, LinkRecord, ReassignCase, ReviewMacro,
  ScheduleFollowUp, SlaReport, Staffing, TagCase, acknowledgeBreach, activateMacro, exportCases, exportQuality, reopenCase,
  retireSuperseded,
} from "./actions";
import { listByCollection, revisedRecord } from "@/platform/repo";
import { submitFooter } from "@/applications/market/kit";

function CaseHeading({ context, part }: { context: ScreenContext; part: "title" | "status" | "meta" }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const record = useRecord(context.params.id);
  const ticket = record ?? data.tickets[0];
  if (!ticket) return part === "title" ? <>Case</> : null;
  const state = slaState(ticket, policyFor(ticket, data.slas), now);
  if (part === "title") return <>{ticket.title}</>;
  if (part === "status") return <Row gap={2} wrap><Pill tone={SLA_TONE[state.status]} dot>{state.label}</Pill><Pill tone={String(ticket.fields.priority) === "urgent" ? "danger" : String(ticket.fields.priority) === "high" ? "warning" : "neutral"}>{String(ticket.fields.priority ?? "normal")}</Pill></Row>;
  const contact = data.contacts.find((row) => row.id === ticket.fields.contactId);
  return <span>{[String(ticket.status).replace(/_/g, " "), String(ticket.fields.queue ?? ""), contact ? `for ${contact.title}` : "no customer linked", `owner ${String(ticket.fields.assignee || "unassigned")}`, `opened ${context.relative(ticket.at)}`].filter(Boolean).join(" · ")}</span>;
}

function ServiceReport({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const open = data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const resolved = data.tickets.filter((ticket) => Boolean(ticket.fields.resolvedAt));
  const met = resolved.filter((ticket) => slaState(ticket, policyFor(ticket, data.slas), now).status === "met");
  const rated = data.tickets.filter((ticket) => Number(ticket.fields.csat ?? 0) > 0);
  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Open" value={String(open.length)} prov="human" meta="Cases in the queue now" />
        <Stat label="Resolved" value={String(resolved.length)} prov="human" meta="With a resolution date on the record" />
        <Stat label="Inside target" value={`${Math.round((met.length / Math.max(1, resolved.length)) * 100)}%`} prov="human" meta={`${met.length} of ${resolved.length}`} />
        <Stat label="Average rating" value={rated.length ? (rated.reduce((sum, ticket) => sum + Number(ticket.fields.csat ?? 0), 0) / rated.length).toFixed(1) : "Unavailable"} unavailable={rated.length === 0} meta={rated.length ? `${rated.length} ratings` : "Nothing rated"} />
      </StatRow>
      <Button
        variant="primary"
        disabled={!context.can("export_data")}
        onClick={() => {
          const header = "ref,subject,priority,queue,owner,status,opened,resolved,csat\n";
          const body = data.tickets.map((ticket) => [
            String(ticket.fields.ref ?? ""), ticket.title, String(ticket.fields.priority ?? ""), String(ticket.fields.queue ?? ""),
            String(ticket.fields.assignee ?? ""), ticket.status, ticket.at ?? "", String(ticket.fields.resolvedAt ?? ""), String(ticket.fields.csat ?? 0),
          ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([header + body], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${context.org.slug}-cases.csv`;
          link.click();
          URL.revokeObjectURL(url);
          context.toast("Exported", "The CSV downloaded from this browser.");
        }}
      >
        Download the case list
      </Button>
      <Notice tone="info" title="Every figure is a count of records here">
        Nothing on this report is forecast or inferred. A backlog projection would need more history than this workspace holds.
      </Notice>
    </Stack>
  );
}

function TicketCreate({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const nextRef = `CARE-${Math.max(0, ...data.tickets.map((ticket) => Number(String(ticket.fields.ref ?? "CARE-0").split("-")[1]) || 0)) + 1}`;
  return (
    <form
      id="cr-create"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const priority = String(form.get("priority") ?? "normal");
        const policy = data.slas.find((row) => row.fields.priority === priority);
        const created = await context.mutate.create({
          collection: "tickets",
          title: `${nextRef} ${String(form.get("subject") ?? "")}`,
          status: "new",
          summary: String(form.get("detail") ?? ""),
          at: context.now.toISOString(),
          tags: [priority, String(form.get("channel") ?? "email")],
          fields: {
            ref: nextRef, priority, channel: String(form.get("channel") ?? "email"),
            queue: String(form.get("queue") ?? "Technical"), assignee: "",
            contactId: String(form.get("contact") ?? ""), slaId: policy?.id ?? "",
            firstResponseAt: "", resolvedAt: "", csat: 0, reopened: false, aiDrafted: false,
          },
        }, `Case ${nextRef} created by ${context.actor}`);
        await context.mutate.create({
          collection: "messages",
          title: `${nextRef} — customer`,
          status: "received",
          summary: String(form.get("detail") ?? ""),
          parentId: created.id,
          at: context.now.toISOString(),
          fields: { kind: "ticket", author: data.contacts.find((row) => row.id === String(form.get("contact") ?? ""))?.title ?? "Customer", side: "customer", channel: String(form.get("channel") ?? "email"), internal: false },
        }, `Opening message recorded on ${nextRef}`);
        context.toast("Case created", `${nextRef} is in the queue with its SLA clock running.`);
        close();
      }}
    >
      <Field label="Subject" required><TextInput name="subject" required /></Field>
      <Field label="What the customer said" required><TextArea name="detail" rows={4} required /></Field>
      <Row gap={3}>
        <Field label="Customer">
          <Select name="contact">
            <option value="">Not linked</option>
            {data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.title}</option>)}
          </Select>
        </Field>
        <Field label="Channel"><Select name="channel">{["email", "chat", "phone", "portal"].map((channel) => <option key={channel}>{channel}</option>)}</Select></Field>
      </Row>
      <Row gap={3}>
        <Field label="Queue"><Select name="queue">{["Technical", "Orders", "Billing", "Trade"].map((queue) => <option key={queue}>{queue}</option>)}</Select></Field>
        <Field label="Priority"><Select name="priority" defaultValue="normal">{["low", "normal", "high", "urgent"].map((priority) => <option key={priority}>{priority}</option>)}</Select></Field>
      </Row>
      <Notice tone="info" title={`This case will be ${nextRef}`}>
        The SLA clock starts when the case is created and is counted in the business hours of the policy for its priority.
      </Notice>
    </form>
  );
}

function BulkAssignment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unassigned = data.tickets.filter(ticket =>
    ticket.organizationId === context.org.id &&
    !ticket.fields.assignee && !["resolved", "closed"].includes(ticket.status));
  const available = data.employees.filter(employee =>
    employee.organizationId === context.org.id &&
    !["alumni", "terminated"].includes(employee.status));
  const assignee = available.find(employee => employee.id === assigneeId);
  const canAssign = !busy && reviewed && Boolean(assignee) && unassigned.length > 0;

  return (
    <Stack gap={4}>
      <ModalUnsavedChanges when={Boolean(assigneeId) || reviewed} />
      <ModalInFlight when={busy} />
      <Notice tone="info" title="Assign open, unowned cases without closing them">
        This action updates exactly the {unassigned.length} currently unassigned active case records in
        this company. Their conversation history, queue, priority and existing SLA remain unchanged.
      </Notice>
      {unassigned.length === 0 ? <Empty title="Every active case has an owner" icon={<Inbox size={20} />} /> : (
        <DataGrid
          rows={unassigned}
          rowId={row => row.id}
          label="Cases included in this assignment"
          filterable={false}
          columns={[
            { key: "ref", header: "Case", cell: row => <span className="ds-num">{String(row.fields.ref ?? row.id)}</span>, width: "88px" },
            { key: "subject", header: "Subject", primary: true, cell: row => row.title },
            { key: "queue", header: "Queue", cell: row => String(row.fields.queue ?? "Unassigned") },
            { key: "sla", header: "SLA remaining", align: "end", cell: row =>
              <span className="ds-num">{formatMinutes(slaState(row, policyFor(row, data.slas), now).remainingMinutes)}</span> },
          ]}
        />
      )}
      <Field label="Assign every listed case to" required
        hint="Only current people in this organisation can be selected.">
        <Select aria-label="Assign every listed case to" value={assigneeId} disabled={busy}
          onChange={event => { setAssigneeId(event.target.value); setReviewed(false); setError(""); }}>
          <option value="">Choose a person</option>
          {available.map(employee => <option key={employee.id} value={employee.id}>{employee.title}</option>)}
        </Select>
      </Field>
      {assignee && (
        <Properties rows={[
          { label: "New owner", value: assignee.title },
          { label: "Cases to assign", value: String(unassigned.length) },
          { label: "Existing assigned cases", value: "Will not be modified" },
        ]} />
      )}
      <Checkbox checked={reviewed} disabled={busy || !assignee || unassigned.length === 0}
        onChange={event => setReviewed(event.target.checked)}
        label={`I reviewed the ${unassigned.length} case(s) and confirmed ${assignee?.title ?? "the chosen person"} should become their owner.`} />
      {error && <Notice tone="danger" title="Cases were not reassigned">{error}</Notice>}
      <ModalActions>
        <OverlayCancel disabled={busy}>Cancel</OverlayCancel>
        <span className="ds-grow" />
        <Button variant="primary" busy={busy} disabled={!canAssign}
          onClick={async () => {
            if (!canAssign || !assignee) return;
            setBusy(true);
            setError("");
            try {
              const editor = { actor: context.actor, now: now.toISOString() };
              const changed = unassigned.map(ticket => revisedRecord(ticket, {
                // Preserve case status, priority, queue, SLA and routing history.
                fields: { ...ticket.fields, assignee: assignee.title },
              }, editor));
              await context.mutate.putMany(
                changed,
                unassigned.map(ticket => `${String(ticket.fields.ref ?? ticket.id)} assigned to ${assignee.title} by ${context.actor}`),
                Object.fromEntries(unassigned.map(ticket => [ticket.id, ticket.revision])),
                changed.map(() => "update"),
              );
              context.toast("Cases assigned",
                `${changed.length} case(s) now belong to ${assignee.title}. No cases were closed or re-prioritised.`);
              close();
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : "One or more cases changed while you were reviewing. Reload the list before retrying.";
              setError(message);
              context.toast("Assignment not saved", message, "failed");
            } finally {
              setBusy(false);
            }
          }}>
          Assign {unassigned.length} cases
        </Button>
      </ModalActions>
    </Stack>
  );
}

function PriorityChange({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const ticket = useRecord(context.selectedId) ?? data.tickets[0];
  const { now } = useWorkspace();
  if (!ticket) return <Empty title="Select a case" />;
  const current = slaState(ticket, policyFor(ticket, data.slas), now);
  return (
    <form
      id="cr-priority"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const priority = String(form.get("priority") ?? "normal");
        const policy = data.slas.find((row) => row.fields.priority === priority);
        const saved1 = await context.mutate.patch(ticket.id, {
          fields: { ...ticket.fields, priority, slaId: policy?.id ?? String(ticket.fields.slaId ?? "") },
        }, { expectRevision: ticket.revision, event: `${String(ticket.fields.ref ?? "")} set to ${priority} priority by ${context.actor}` });
        if (!saved1) return;
        context.toast("Priority changed", "The case now runs against a different policy, and the clock was recalculated from when it opened.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Case", value: ticket.title },
        { label: "Now", value: String(ticket.fields.priority ?? "") },
        { label: "Clock", value: current.label },
      ]} />
      <Field label="New priority">
        <Select name="priority" defaultValue={String(ticket.fields.priority ?? "normal")}>
          {["low", "normal", "high", "urgent"].map((priority) => <option key={priority}>{priority}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Changing priority changes the target">
        The clock is counted from when the case opened, so raising the priority on an old case can breach it immediately.
        That is shown rather than hidden.
      </Notice>
    </form>
  );
}

function CustomerProfileEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const contact = useRecord(context.params.id) ?? data.contacts[0];
  if (!contact) return <Empty title="No customer" />;
  return (
    <form
      id="cr-customer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const saved2 = await context.mutate.patch(contact.id, {
          fields: { ...contact.fields, email: String(form.get("email") ?? ""), consent: String(form.get("consent") ?? "") },
        }, { expectRevision: contact.revision, event: `Customer record updated by ${context.actor}` });
        if (!saved2) return;
        context.toast("Saved", "The fields a care specialist may change are updated.");
        close();
      }}
    >
      <Field label="Name"><TextInput defaultValue={contact.title} readOnly /></Field>
      <Field label="Email"><TextInput name="email" type="email" defaultValue={String(contact.fields.email ?? "")} /></Field>
      <Field label="Marketing consent">
        <Select name="consent" defaultValue={String(contact.fields.consent ?? "")}>
          {["Marketing consent given", "Marketing consent withheld"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Some fields are not editable here">
        The legal name, the account owner and anything financial belong to other applications. A care specialist can correct a
        contact detail and record a consent decision, and nothing else.
      </Notice>
    </form>
  );
}

function ConsentInspector({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const contact = useRecord(context.params.id) ?? data.contacts[0];
  if (!contact) return <Empty title="No customer" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Customer", value: contact.title },
        { label: "Marketing", value: String(contact.fields.consent ?? "Not recorded") },
        { label: "Recorded", value: context.date(contact.updatedAt) },
        { label: "Case data kept", value: "Six years, under the retention schedule" },
      ]} />
      <Notice tone="info" title="What consent covers">
        Consent here covers marketing only. Answering a case this person opened does not need it, and withdrawing it does not
        delete the cases they raised.
      </Notice>
    </Stack>
  );
}

function IdentityVerification({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const contact = useRecord(context.params.id) ?? data.contacts[0];
  if (!contact) return <Empty title="No customer" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Customer", value: contact.title },
        { label: "Currently", value: contact.fields.verifiedIdentity === true ? <Pill tone="success" dot>Verified</Pill> : <Pill tone="warning" dot>Not verified</Pill> },
        { label: "What verification is", value: "A person confirmed two details that are already on the record" },
      ]} />
      <Notice tone="warning" title="Verification is a judgement a person makes">
        This workspace cannot check an identity against anything. Recording a verification says a named person was satisfied,
        and that is all it says.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          onClick={async () => {
            const saved3 = await context.mutate.patch(contact.id, {
              fields: { ...contact.fields, verifiedIdentity: true, verifiedBy: context.actor },
            }, { expectRevision: contact.revision, event: `Identity verified by ${context.actor}` });
            if (!saved3) return;
            context.toast("Verification recorded", `${contact.title} is marked verified by ${context.actor}.`);
            close();
          }}
        >
          Record that I verified this person
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function ArticleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const html = (existing?.body as { html?: string } | undefined)?.html ?? "";
  return (
    <form
      id="cr-article"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = String(form.get("body") ?? "");
        const fields = {
          audience: String(form.get("audience") ?? "internal"),
          version: existing ? `${Number(String(existing.fields.version ?? "1.0").split(".")[0])}.${Number(String(existing.fields.version ?? "1.0").split(".")[1] ?? 0) + 1}` : "1.0",
          helpful: Number(existing?.fields.helpful ?? 0),
          unhelpful: Number(existing?.fields.unhelpful ?? 0),
          supersededBy: String(existing?.fields.supersededBy ?? ""),
        };
        if (existing) {
          const saved4 = await context.mutate.patch(existing.id, {
            title: String(form.get("title") ?? existing.title),
            summary: text.slice(0, 140),
            fields: { ...existing.fields, ...fields },
            body: { html: `<p>${text.replace(/\n{2,}/g, "</p><p>")}</p>` },
          }, { expectRevision: existing.revision, event: `${existing.title} revised to version ${fields.version} by ${context.actor}` });
          if (!saved4) return;
        } else {
          await context.mutate.create({
            collection: "articles",
            title: String(form.get("title") ?? "Article"),
            status: "draft",
            summary: text.slice(0, 140),
            fields,
            body: { html: `<p>${text.replace(/\n{2,}/g, "</p><p>")}</p>` },
          }, `Article drafted by ${context.actor}`);
        }
        context.toast("Article saved", existing ? `Version ${fields.version} is on the record and the earlier version is kept.` : "It is a draft until somebody publishes it.");
        close();
      }}
    >
      <Field label="Title" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="Audience">
        <Select name="audience" defaultValue={String(existing?.fields.audience ?? "internal")}>
          <option value="internal">Internal — for the care team</option>
          <option value="public">Public — a customer may be sent this</option>
        </Select>
      </Field>
      <Field label="Article" required hint="Plain paragraphs. Nothing here is interpreted as markup.">
        <TextArea name="body" rows={10} defaultValue={html.replace(/<\/p><p>/g, "\n\n").replace(/<[^>]+>/g, "")} required />
      </Field>
      {existing && (
        <Notice tone="warning" title="A revision does not overwrite the old wording">
          Version {String(existing.fields.version ?? "")} is kept, so a reply that cited it can still be read in context.
        </Notice>
      )}
    </form>
  );
}

function ArticlePublishReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const selected = useRecord(context.selectedId);
  const article = (selected?.collection === "articles" && selected.status === "draft" ? selected : undefined) ?? data.articles.find((row) => row.status === "draft");
  if (!article) return <Empty title="No draft to publish" icon={<BookOpen size={20} />} />;
  const macros = data.macros.filter((macro) => macro.fields.articleId === article.id);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Article", value: article.title },
        { label: "Audience", value: String(article.fields.audience ?? "") },
        { label: "Version", value: String(article.fields.version ?? "") },
        { label: "Replaces", value: article.fields.supersedes ? data.articles.find((row) => row.id === article.fields.supersedes)?.title ?? "An earlier version" : "Nothing" },
        { label: "Cited by", value: macros.length ? macros.map((macro) => macro.title).join(", ") : "No macro" },
      ]} />
      {String(article.fields.audience ?? "") === "public" && (
        <Notice tone="warning" title="A public article can be sent to a customer">
          Read it as a customer would. Once a macro cites it, a reply can repeat it word for word.
        </Notice>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          onClick={async () => {
            const saved5 = await context.mutate.patch(article.id, { status: "published", fields: { ...article.fields, publishedBy: context.actor } }, { expectRevision: article.revision, event: `${article.title} v${String(article.fields.version ?? "")} published by ${context.actor}` });
            if (!saved5) return;
            await retireSuperseded(context, article);
            context.toast("Published", article.fields.supersedes ? "The earlier version is retired, not overwritten, and stays readable." : "It is available to the macros that cite it.");
            close();
          }}
        >
          Publish
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function RelevanceTest({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const [question, setQuestion] = useState("");
  const matches = data.articles
    .filter((article) => article.status === "published")
    .map((article) => {
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const words = question.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
      const hits = words.filter((word) => text.includes(word)).length;
      return { article, hits };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return (
    <Stack gap={4}>
      <Field label="What might a customer ask?" hint="Matched against the words in the published articles, not by a model.">
        <TextInput value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="my lamp flickers on the dimmer" />
      </Field>
      {question.trim() === "" ? (
        <span className="ds-subtle">Type a question to see which articles would be offered.</span>
      ) : matches.length === 0 ? (
        <Notice tone="warning" title="Nothing matches">
          No published article covers this. That is a gap in the knowledge base, not a reason to improvise an answer.
        </Notice>
      ) : (
        <Stack gap={2}>
          {matches.map((match) => (
            <div key={match.article.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Row gap={2}>
                <strong className="ds-grow">{match.article.title}</strong>
                <Pill tone="neutral"><span className="ds-num">{match.hits}</span> word matches</Pill>
              </Row>
              <p className="ds-subtle">{match.article.summary}</p>
            </div>
          ))}
        </Stack>
      )}
      <Notice tone="info" title="Word matching, and it says so">
        {context.org.shortName} has no model connected. This is literal word matching against approved articles, which is why it
        misses a question worded differently.
      </Notice>
    </Stack>
  );
}

function MacroEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const data = useCareData();
  const steps = (existing?.body as { steps?: string[] } | undefined)?.steps ?? [];
  return (
    <form
      id="cr-macro"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = String(form.get("steps") ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
        const fields = {
          uses: Number(existing?.fields.uses ?? 0),
          articleId: String(form.get("article") ?? ""),
          steps: parsed.length,
          prohibitedTopics: "refund amounts, legal advice, medical claims",
        };
        if (existing) {
          const saved6 = await context.mutate.patch(existing.id, {
            title: String(form.get("title") ?? existing.title),
            summary: String(form.get("summary") ?? ""),
            status: String(form.get("active") === "on" ? "active" : "draft"),
            fields: { ...existing.fields, ...fields },
            body: { steps: parsed },
          }, { expectRevision: existing.revision, event: `Macro updated: ${existing.title}` });
          if (!saved6) return;
        } else {
          await context.mutate.create({
            collection: "macros",
            title: String(form.get("title") ?? "Macro"),
            status: form.get("active") === "on" ? "active" : "draft",
            summary: String(form.get("summary") ?? ""),
            fields,
            body: { steps: parsed },
          }, `Macro created by ${context.actor}`);
        }
        context.toast("Macro saved", "It is available in the reply composer when it is active.");
        close();
      }}
    >
      <Field label="Macro name" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="What it is for"><TextInput name="summary" defaultValue={existing?.summary ?? ""} /></Field>
      <Field label="Cites which article" hint="A macro without an approved article behind it is a template, not an answer.">
        <Select name="article" defaultValue={String(existing?.fields.articleId ?? "")}>
          <option value="">No article</option>
          {data.articles.filter((article) => article.status === "published").map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
        </Select>
      </Field>
      <Field label="Steps" hint="One step per line."><TextArea name="steps" rows={6} defaultValue={steps.join("\n")} /></Field>
      <Checkbox name="active" label="Active — offer this in the reply composer" defaultChecked={existing?.status === "active"} />
      <Notice tone="warning" title="Subjects a macro never answers">
        Refund amounts, legal advice and anything about somebody's health. A case on one of those waits for a person.
      </Notice>
    </form>
  );
}

function AudiencePreview({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const macro = useRecord(context.selectedId) ?? data.macros[0];
  if (!macro) return <Empty title="Select a macro" icon={<Wand2 size={20} />} />;
  const article = data.articles.find((row) => row.id === macro.fields.articleId);
  const affected = data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status) && String(ticket.fields.queue ?? "") === "Technical");
  return (
    <Stack gap={4}>
      <h3>{macro.title}</h3>
      <Properties rows={[
        { label: "Cites", value: article ? `${article.title} v${String(article.fields.version ?? "")}` : "No article" },
        { label: "Open cases it could apply to", value: <span className="ds-num">{String(affected.length)}</span> },
        { label: "Times used", value: <span className="ds-num">{String(macro.fields.uses ?? 0)}</span> },
      ]} />
      {article && (
        <div className="ds-panel" style={{ padding: "var(--space-4)" }}>
          <p className="ds-prose">{((article.body as { html?: string } | undefined)?.html ?? "").replace(/<[^>]+>/g, " ").trim()}</p>
        </div>
      )}
      <Notice tone="info" title="A simulation changes nothing">
        This shows what the macro would insert. No case is touched until somebody uses it in a reply.
      </Notice>
    </Stack>
  );
}

function EscalationRule({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "When", value: "A case is urgent and has no first response at half its target" },
        { label: "Then", value: "It appears on the overview under Needing attention" },
        { label: "What it does not do", value: "Reassign, reply or notify anybody outside this browser" },
      ]} />
      <Notice tone="warning" title="Escalation is a flag, not an action">
        {context.org.shortName} has no paging service and no telephony. An escalation puts a case in front of a person;
        a person still has to pick it up.
      </Notice>
    </Stack>
  );
}

function SlaForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  if (!existing) return <Empty title="Select a policy" icon={<Timer size={20} />} />;
  return (
    <form
      id="cr-sla"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const saved7 = await context.mutate.patch(existing.id, {
          summary: `First response within ${String(form.get("first"))}h, resolution within ${String(form.get("resolve"))}h, counted in business hours.`,
          fields: {
            ...existing.fields,
            firstResponseHours: Number(form.get("first") ?? 0),
            resolutionHours: Number(form.get("resolve") ?? 0),
            pauseWhileWaiting: form.get("pause") === "on",
          },
        }, { expectRevision: existing.revision, event: `${existing.title} policy changed by ${context.actor}` });
        if (!saved7) return;
        context.toast("Policy saved", "Open cases are measured against the new target from their original open time.");
        close();
      }}
    >
      <Field label="Policy"><TextInput defaultValue={existing.title} readOnly /></Field>
      <Row gap={3}>
        <Field label="First response (business hours)"><TextInput name="first" inputMode="numeric" align="end" defaultValue={String(existing.fields.firstResponseHours ?? 0)} /></Field>
        <Field label="Resolution (business hours)"><TextInput name="resolve" inputMode="numeric" align="end" defaultValue={String(existing.fields.resolutionHours ?? 0)} /></Field>
      </Row>
      <Checkbox name="pause" label="Pause the resolution clock while a case is waiting on the customer" defaultChecked={existing.fields.pauseWhileWaiting === true} />
      <Notice tone="info" title="Counted in business hours">
        {String(existing.fields.businessHours ?? "")}. A case opened late on Friday is not breached by Monday morning.
      </Notice>
    </form>
  );
}

function ScheduleException() {
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Working days", value: "Monday to Friday" },
        { label: "Working hours", value: "09:00 to 17:30 in this organisation's time zone" },
        { label: "Holidays", value: "Excluded by policy, but no holiday calendar is loaded" },
        { label: "Waiting on the customer", value: "Pauses the resolution clock where the policy says so" },
      ]} />
      <Notice tone="warning" title="No holiday calendar exists here">
        The policies say public holidays are excluded. Nothing in this workspace knows which days those are, so a bank holiday
        currently counts as a working day. Stating that is better than a clock that is quietly wrong.
      </Notice>
    </Stack>
  );
}

function PolicyImpact({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const { now } = useWorkspace();
  const policy = useRecord(context.selectedId) ?? data.slas[0];
  if (!policy) return <Empty title="Select a policy" />;
  const covered = data.tickets.filter((ticket) => policyFor(ticket, data.slas)?.id === policy.id && !["resolved", "closed"].includes(ticket.status));
  const halved = covered.filter((ticket) => {
    const state = slaState(ticket, { ...policy, fields: { ...policy.fields, resolutionHours: Number(policy.fields.resolutionHours ?? 0) / 2 } }, now);
    return state.status === "breached";
  });
  return (
    <Stack gap={4}>
      <h3>{policy.title}</h3>
      <Properties rows={[
        { label: "Open cases on this policy", value: <span className="ds-num">{String(covered.length)}</span> },
        { label: "Breached now", value: <span className="ds-num">{String(covered.filter((ticket) => slaState(ticket, policy, now).status === "breached").length)}</span> },
        { label: "Breached if the target halved", value: <span className="ds-num">{String(halved.length)}</span> },
      ]} />
      <Notice tone="info" title="A target is a promise about the people who answer">
        Tightening a target does not make anybody faster. It changes which cases are counted as late, which is a different thing.
      </Notice>
    </Stack>
  );
}

function QaScorecard({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCareData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.selectedId) ?? data.tickets[0];
  if (!ticket) return <Empty title="Select a case" />;
  return (
    <form
      id="cr-qa"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.create({
          collection: "qaReviews",
          title: `QA · ${String(ticket.fields.ref ?? "")}`,
          status: "reviewed",
          summary: String(form.get("note") ?? ""),
          parentId: ticket.id,
          fields: { ref: String(ticket.fields.ref ?? ""), tone: String(form.get("tone")), accuracy: String(form.get("accuracy")), reviewer: context.actor, handledBy: String(ticket.fields.assignee ?? ""), forEmploymentDecision: false },
        }, `QA review of ${String(ticket.fields.ref ?? "")} by ${context.actor}: tone ${String(form.get("tone"))}, accuracy ${String(form.get("accuracy"))}`);
        context.toast("Review recorded", "A QA review record is on the case, attributed to you.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Case", value: ticket.title },
        { label: "Handled by", value: String(ticket.fields.assignee || "Unassigned") },
        { label: "Customer rating", value: Number(ticket.fields.csat ?? 0) > 0 ? `${String(ticket.fields.csat)} of 5` : "Not rated" },
      ]} />
      <Row gap={3}>
        <Field label="Tone"><Select name="tone">{["good", "acceptable", "needs work"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Accuracy"><Select name="accuracy">{["accurate", "partly accurate", "wrong"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      </Row>
      <Field label="What you would say to the person" required><TextArea name="note" rows={4} required /></Field>
      <Notice tone="warning" title="A review is a conversation, not a record against somebody's job">
        This is evidence for coaching. It is not used on its own for any decision about employment.
      </Notice>
    </form>
  );
}

function SurveyBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="cr-survey"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.create({
          collection: "preferences",
          title: `Survey: ${String(form.get("name") ?? "")}`,
          status: "active",
          summary: `Asked when a case is resolved. ${String(form.get("question") ?? "")}`,
          fields: { kind: "careSurvey", scale: String(form.get("scale") ?? "1-5"), trigger: "case resolved", delivery: "not_connected" },
        }, `Survey created by ${context.actor}`);
        context.toast("Survey saved", "A request is recorded on the case when it resolves. Nothing is emailed: no provider is connected.");
        close();
      }}
    >
      <Field label="Survey name" required><TextInput name="name" required /></Field>
      <Field label="Question" required><TextInput name="question" defaultValue="How did we do on this case?" required /></Field>
      <Field label="Scale"><Select name="scale">{["1-5", "1-10", "thumbs"].map((scale) => <option key={scale}>{scale}</option>)}</Select></Field>
      <Notice tone="warning" title={capabilityById("email.send")?.note ?? "No mail provider is connected"}>
        A survey request is recorded against the case. It is not sent to anybody from this workspace.
      </Notice>
    </form>
  );
}

function CaseReplay({ context }: { context: ScreenContext }) {
  const data = useCareData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const ticket = useRecord(payload?.id ?? context.selectedId) ?? data.tickets[0];
  if (!ticket) return <Empty title="Select a case" />;
  const messages = data.messages
    .filter((message) => message.parentId === ticket.id && message.fields.kind === "ticket")
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return (
    <Stack gap={4}>
      <h3>{ticket.title}</h3>
      <ol className="ds-stack ds-gap-3">
        {messages.map((message) => (
          <li key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}>
              <strong className="ds-grow">{String(message.fields.author ?? "")}</strong>
              {message.fields.internal === true && <Pill tone="warning">Internal</Pill>}
              <span className="ds-subtle ds-num">{context.dateTime(message.at)}</span>
            </Row>
            <p className="ds-subtle">{message.summary}</p>
          </li>
        ))}
        {messages.length === 0 && <Empty title="Nothing was recorded on this case" />}
      </ol>
      <Notice tone="info">A replay is the case's own messages in order. Nothing is reconstructed or inferred.</Notice>
    </Stack>
  );
}

export const careApp = registerApp({
  code: "CARE",
  short: "Customer Care",
  name: "Customer Care & Service",
  purpose: "The queue, the clock and the answers behind every reply",
  icon: Headphones,
  nav: [
    { items: [
      { label: "Service overview", screenId: "ARL-CARE-001", icon: Headphones },
      { label: "Inbox", screenId: "ARL-CARE-002", icon: Inbox },
      { label: "Cases", screenId: "ARL-CARE-003", icon: Timer },
    ] },
    { label: "Answers", items: [
      { label: "Knowledge base", screenId: "ARL-CARE-006", icon: BookOpen },
      { label: "Macros & rules", screenId: "ARL-CARE-007", icon: Wand2 },
    ] },
    { label: "Standards", items: [
      { label: "Service SLAs", screenId: "ARL-CARE-008", icon: Settings2 },
      { label: "Quality", screenId: "ARL-CARE-009", icon: Smile },
    ] },
  ],
  screens: {
    "ARL-CARE-001": {
      id: "ARL-CARE-001",
      subtitle: (context) => `Queue load and the clock in ${context.org.shortName}, counted in business hours.`,
      tabs: (["Overview", "Queues", "Quality", "Trends"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ServiceOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Open case", label: "Open a case", placement: "primary", run: (context) => context.openOverlay("open case") },
        { id: "inspect metric", label: "Inspect the SLA metric", placement: "secondary", run: (context) => context.openOverlay("SLA inspector") },
        { id: "reassign", label: "Reassign a case", placement: "overflow", run: (context) => context.openOverlay("reassign case") },
        { id: "manage staffing", label: "Manage staffing", placement: "overflow", run: (context) => context.openOverlay("staffing") },
        { id: "open inbox", label: "Open the inbox", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/care/inbox`) },
        { id: "queue rules", label: "Queue rules", placement: "overflow", run: (context) => context.openOverlay("Queue rules") },
        { id: "service report", label: "Service report", placement: "overflow", run: (context) => context.openOverlay("service report") },
      ],
      overlays: [
        { id: "open case", kind: "modal", title: "Open a case", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <TicketCreate context={context} close={close} />, footer: submitFooter("cr-create", "Open the case") },
        { id: "reassign case", kind: "modal", title: "Reassign a case", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReassignCase context={context} close={close} />, footer: submitFooter("cr-reassign", "Reassign") },
        { id: "staffing", kind: "drawer", title: "Who covers which queue", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <Staffing context={context} close={close} />, footer: submitFooter("cr-staffing", "Save the rota") },
        { id: "Queue rules", kind: "drawer", title: "How a case reaches a queue", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <QueueRules context={context} /> },
        { id: "SLA inspector", kind: "drawer", title: "Against the clock", width: OVERLAY_WIDTH.modal, presentation: { guidance: "Review response and resolution targets, elapsed time, ownership and escalation reasons." }, render: ({ ...context }) => <SlaInspector context={context} /> },
        { id: "service report", kind: "modal", title: "Service report", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <ServiceReport context={context} /> },
      ],
    },

    "ARL-CARE-002": {
      id: "ARL-CARE-002",
      subtitle: () => "Every channel in one list, with the clock beside each case.",
      tabs: (["Unassigned", "Mine", "Team", "Waiting", "Closed"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <OmnichannelInbox context={context} lens={lens} />,
      })),
      actions: [
        { id: "Respond", label: "Reply", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a case in the list"), run: (context) => context.openOverlay("Response composer") },
        { id: "escalate", label: "Escalate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a case in the list"), run: (context) => context.openOverlay("escalation") },
        { id: "assign", label: "Assign", placement: "overflow", guard: needsSelection("a case in the list"), run: (context) => context.openOverlay("assign case", { id: context.selectedId }) },
        { id: "tag", label: "Tag", placement: "overflow", guard: needsSelection("a case in the list"), run: (context) => context.openOverlay("tag case") },
        { id: "link record", label: "Link a customer or order", placement: "overflow", guard: needsSelection("a case in the list"), run: (context) => context.openOverlay("link record") },
        { id: "macros", label: "Macros", placement: "overflow", run: (context) => context.openOverlay("canned reply") },
        { id: "customer", label: "Customer", placement: "overflow", guard: needsSelection("a case in the list"), run: (context) => context.openOverlay("Customer inspector") },
        { id: "route unassigned", label: "Route unassigned", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/care/tickets`) },
      ],
      overlays: [
        { id: "assign case", kind: "modal", title: "Assign the case", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReassignCase context={context} close={close} />, footer: submitFooter("cr-reassign", "Assign") },
        { id: "tag case", kind: "modal", title: "Tag the case", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TagCase context={context} close={close} />, footer: submitFooter("cr-tag", "Save tags") },
        { id: "link record", kind: "modal", title: "Link a record", width: OVERLAY_WIDTH.form, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Link" />, render: ({ close, ...context }) => <LinkRecord context={context} close={close} />, footer: submitFooter("cr-link", "Save the link") },
        { id: "Customer inspector", kind: "drawer", title: "Customer", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <CustomerInspector context={context} /> },
        { id: "canned reply", kind: "drawer", title: "Macros", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <CannedReply context={context} /> },
        { id: "escalation", kind: "modal", title: "Escalate this case", width: OVERLAY_WIDTH.modal, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Escalation" />, render: ({ close, ...context }) => <Escalation context={context} close={close} />, footer: submitFooter("cr-escalate", "Escalate") },
        { id: "Response composer", kind: "modal", title: "Reply", width: OVERLAY_WIDTH.record, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Reply" />, render: ({ close, ...context }) => <ResponseComposer context={context} close={close} />, footer: submitFooter("cr-response", "Record the reply") },
      ],
    },

    "ARL-CARE-003": {
      id: "ARL-CARE-003",
      subtitle: () => "Every case with its priority, owner and live SLA state.",
      tabs: (["All", "Open", "Pending", "Resolved", "Archived"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <TicketList context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create ticket", label: "Create a case", placement: "primary", run: (context) => context.openOverlay("Ticket create") },
        { id: "bulk route", label: "Route unassigned", placement: "secondary", run: (context) => context.openOverlay("bulk assignment") },
        { id: "filter", label: "Filter cases", placement: "overflow", run: (context) => context.openOverlay("case filter") },
        { id: "export", label: "Export CSV", placement: "overflow", capability: "export_data", run: (context) => exportCases(context) },
        { id: "change priority", label: "Change priority", placement: "overflow", guard: needsSelection("a case"), run: (context) => context.openOverlay("priority change") },
      ],
      overlays: [
        { id: "case filter", kind: "modal", title: "Filter cases", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <CaseFilter context={context} close={close} /> },
        { id: "Ticket create", kind: "modal", title: "Create a case", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <TicketCreate context={context} close={close} />, footer: submitFooter("cr-create", "Create case") },
        { id: "bulk assignment", kind: "modal", title: "Route unassigned cases", width: OVERLAY_WIDTH.wide, presentation: { noRecordContext: true, guidance: "Review the active cases without an owner, choose one accountable person, and confirm that their existing SLA and priority remain unchanged." }, render: ({ close, ...context }) => <BulkAssignment context={context} close={close} /> },
        { id: "priority change", kind: "modal", title: "Change priority", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <PriorityChange context={context} close={close} />, footer: submitFooter("cr-priority", "Change priority") },
      ],
    },

    "ARL-CARE-004": {
      id: "ARL-CARE-004",
      title: () => "Case",
      record: (context) => ({
        title: <CaseHeading context={context} part="title" />,
        status: <CaseHeading context={context} part="status" />,
        meta: [<CaseHeading key="meta" context={context} part="meta" />],
      }),
      tabs: ["Overview", "Conversation", "Tasks", "History", "Audit"].map((lens) => ({
        id: lens, render: (context: ScreenContext) => <TicketDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Reply", label: "Reply", placement: "primary", run: (context) => context.openOverlay("Response composer") },
        { id: "add note", label: "Internal note", placement: "secondary", run: (context) => context.openOverlay("internal note") },
        { id: "reopen", label: "Reopen", placement: "overflow", run: (context) => reopenCase(context) },
        { id: "assign specialist", label: "Assign a specialist", placement: "overflow", run: (context) => context.openOverlay("assign specialist") },
        { id: "request refund", label: "Request a refund", placement: "overflow", run: (context) => context.openOverlay("refund request") },
        { id: "escalate", label: "Escalate", placement: "overflow", run: (context) => context.openOverlay("escalation", { id: context.params.id }) },
        { id: "link record", label: "Link a customer or order", placement: "overflow", run: (context) => context.openOverlay("link record", { id: context.params.id }) },
      ],
      overlays: [
        ...kitOverlays,
        { id: "escalation", kind: "modal", title: "Escalate this case", width: OVERLAY_WIDTH.modal, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Escalation" />, render: ({ close, ...context }) => <Escalation context={context} close={close} />, footer: submitFooter("cr-escalate", "Escalate") },
        { id: "link record", kind: "modal", title: "Link a record", width: OVERLAY_WIDTH.form, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Link" />, render: ({ close, ...context }) => <LinkRecord context={context} close={close} />, footer: submitFooter("cr-link", "Save the link") },
        { id: "assign specialist", kind: "modal", title: "Assign a specialist", width: OVERLAY_WIDTH.form, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Assign a specialist" />, render: ({ close, ...context }) => <AssignSpecialist context={context} close={close} />, footer: submitFooter("cr-specialist", "Assign") },
        { id: "Response composer", kind: "modal", title: "Reply", width: OVERLAY_WIDTH.record, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Reply" />, render: ({ close, ...context }) => <ResponseComposer context={context} close={close} />, footer: submitFooter("cr-response", "Record the reply") },
        { id: "internal note", kind: "modal", title: "Internal note", width: OVERLAY_WIDTH.modal, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Internal note" />, render: ({ close, ...context }) => <InternalNote context={context} close={close} />, footer: submitFooter("cr-note", "Add the note") },
        { id: "refund request", kind: "modal", title: "Request a refund", tone: "danger", width: OVERLAY_WIDTH.modal, summary: ({ close: _c, ...context }) => <CaseSummary context={context} eyebrow="Refund request" />, render: ({ close, ...context }) => <RefundRequest context={context} close={close} />, footer: ({ close, ...context }) => <RefundFooter context={context} close={close} /> },
      ],
    },

    "ARL-CARE-005": {
      id: "ARL-CARE-005",
      title: () => "Customer",
      subtitle: () => "What customer care is allowed to see about one person.",
      tabs: ["Overview", "Cases", "Orders", "Communications"].map((lens) => ({
        id: lens, render: (context: ScreenContext) => <CustomerContext context={context} lens={lens} />,
      })),
      actions: [
        { id: "update permitted field", label: "Update permitted fields", placement: "primary", run: (context) => context.openOverlay("Customer profile edit") },
        { id: "Inspect", label: "Inspect consent", placement: "secondary", run: (context) => context.openOverlay("consent inspector") },
        { id: "schedule", label: "Schedule a follow-up", placement: "overflow", run: (context) => context.openOverlay("schedule follow-up") },
        { id: "verify identity", label: "Verify identity", placement: "overflow", run: (context) => context.openOverlay("identity verification") },
      ],
      overlays: [
        { id: "schedule follow-up", kind: "modal", title: "Schedule a follow-up", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleFollowUp context={context} close={close} />, footer: submitFooter("cr-schedule", "Schedule") },
        { id: "Customer profile edit", kind: "modal", title: "Edit what care may change", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <CustomerProfileEdit context={context} close={close} />, footer: submitFooter("cr-customer", "Save") },
        { id: "consent inspector", kind: "drawer", title: "Consent", width: OVERLAY_WIDTH.compact, render: ({ ...context }) => <ConsentInspector context={context} /> },
        { id: "identity verification", kind: "modal", title: "Verify this person", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <IdentityVerification context={context} close={close} /> },
      ],
    },

    "ARL-CARE-006": {
      id: "ARL-CARE-006",
      subtitle: () => "Approved answers, their versions and what replaced what.",
      tabs: (["Internal", "Public", "Draft", "Retired"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <KnowledgeBase context={context} lens={lens} />,
      })),
      actions: [
        { id: "Write article", label: "Write an article", placement: "primary", capability: "edit_knowledge", run: (context) => context.openOverlay("Rich editor") },
        { id: "publish", label: "Publish a draft", placement: "secondary", capability: "edit_knowledge", run: (context) => context.openOverlay("publish review") },
        { id: "update", label: "Update an article", placement: "overflow", capability: "edit_knowledge", guard: (context) => (context.selectedId ? undefined : "Choose an article first"), run: (context) => context.openOverlay("article revision") },
        { id: "test answer", label: "Test an answer", placement: "overflow", run: (context) => context.openOverlay("relevance test") },
      ],
      overlays: [
        { id: "article revision", kind: "modal", title: "Update an article", width: OVERLAY_WIDTH.wide, render: ({ close, ...context }) => <ArticleRevision context={context} close={close} />, footer: submitFooter("cr-article-update", "Save") },
        { id: "Rich editor", kind: "modal", title: "Article", width: OVERLAY_WIDTH.wide, render: ({ close, ...context }) => <ArticleEditor context={context} close={close} />, footer: submitFooter("cr-article", "Save article") },
        { id: "publish review", kind: "modal", title: "Publish this article", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ArticlePublishReview context={context} close={close} /> },
        { id: "relevance test", kind: "drawer", title: "What would be offered", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <RelevanceTest context={context} /> },
      ],
    },

    "ARL-CARE-007": {
      id: "ARL-CARE-007",
      subtitle: () => "Macros that cite an article, and the routing rules a person wrote.",
      tabs: (["Macros", "Rules", "Runs", "Exceptions"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Automation context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create macro", label: "Create a macro", placement: "primary", capability: "edit_knowledge", run: (context) => context.openOverlay("Macro editor") },
        { id: "simulate", label: "Simulate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a macro first"), run: (context) => context.openOverlay("audience preview") },
        { id: "activate", label: "Activate or deactivate", placement: "overflow", capability: "edit_knowledge", guard: needsSelection("a macro"), run: (context) => activateMacro(context) },
        { id: "review", label: "Review a macro", placement: "overflow", guard: needsSelection("a macro"), run: (context) => context.openOverlay("review macro") },
        { id: "edit macro", label: "Edit a macro", placement: "overflow", guard: needsSelection("a macro"), run: (context) => context.openOverlay("Macro editor") },
        { id: "escalation rule", label: "Escalation rule", placement: "overflow", run: (context) => context.openOverlay("escalation rule") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "review macro", kind: "modal", title: "Review a macro", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ReviewMacro context={context} close={close} />, footer: submitFooter("cr-macro-review", "Record the review") },
        { id: "Macro editor", kind: "modal", title: "Macro", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <MacroEditor context={context} close={close} />, footer: submitFooter("cr-macro", "Save macro") },
        { id: "audience preview", kind: "drawer", title: "What this macro would do", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <AudiencePreview context={context} /> },
        { id: "escalation rule", kind: "modal", title: "Escalation rule", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <EscalationRule context={context} /> },
      ],
    },

    "ARL-CARE-008": {
      id: "ARL-CARE-008",
      subtitle: (context) => `Targets counted in business hours, in ${context.org.timezone}.`,
      tabs: (["Policies", "Breaches", "Exceptions", "History"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Slas context={context} lens={lens} />,
      })),
      actions: [
        { id: "Edit policy", label: "Edit a policy", placement: "primary", capability: "manage_policy", guard: (context) => (context.selectedId ? undefined : "Choose a policy first"), run: (context) => context.openOverlay("SLA form") },
        { id: "report", label: "SLA report", placement: "secondary", run: (context) => context.openOverlay("sla report") },
        { id: "reassign", label: "Reassign a breached case", placement: "overflow", run: (context) => context.openOverlay("reassign case", { breachedOnly: true }) },
        { id: "acknowledge", label: "Acknowledge a breach", placement: "overflow", run: async (context) => acknowledgeBreach(context, await listByCollection(context.org.id, "tickets"), await listByCollection(context.org.id, "slas")) },
        { id: "policy impact", label: "What a change would do", placement: "overflow", guard: needsSelection("a policy"), run: (context) => context.openOverlay("policy impact") },
        { id: "clock rules", label: "When the clock stops", placement: "overflow", run: (context) => context.openOverlay("schedule exception") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "sla report", kind: "drawer", title: "SLA report", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <SlaReport context={context} /> },
        { id: "reassign case", kind: "modal", title: "Reassign a breached case", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReassignCase context={context} close={close} />, footer: submitFooter("cr-reassign", "Reassign") },
        { id: "SLA form", kind: "modal", title: "Policy", width: OVERLAY_WIDTH.modal, presentation: { selectedRecord: true, noRecordContext: true }, render: ({ close, ...context }) => <SlaForm context={context} close={close} />, footer: submitFooter("cr-sla", "Save policy") },
        { id: "schedule exception", kind: "modal", title: "When the clock does not run", width: OVERLAY_WIDTH.modal, render: () => <ScheduleException /> },
        { id: "policy impact", kind: "drawer", title: "Impact of a change", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <PolicyImpact context={context} /> },
      ],
    },

    "ARL-CARE-009": {
      id: "ARL-CARE-009",
      subtitle: () => "Ratings customers chose, and reviews people wrote.",
      tabs: (["Surveys", "Audits", "Coaching", "Reports"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Quality context={context} lens={lens} />,
      })),
      actions: [
        { id: "Review", label: "Score a case", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a case on the Audits tab"), run: (context) => context.openOverlay("QA scorecard") },
        { id: "annotate", label: "Annotate a case", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a case on the Audits tab"), run: (context) => context.openOverlay("annotate") },
        { id: "assign coaching", label: "Assign coaching", placement: "overflow", run: (context) => context.openOverlay("assign coaching") },
        { id: "export", label: "Export quality data", placement: "overflow", capability: "export_data", run: (context) => exportQuality(context) },
        { id: "replay", label: "Replay a case", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a case on the Audits tab"), run: (context) => context.openOverlay("case replay") },
        { id: "build survey", label: "Build a survey", placement: "overflow", run: (context) => context.openOverlay("survey builder") },
      ],
      overlays: [
        { id: "annotate", kind: "drawer", title: "Annotate a case", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <Annotate context={context} /> },
        { id: "assign coaching", kind: "modal", title: "Assign coaching", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <AssignCoaching context={context} close={close} />, footer: submitFooter("cr-coaching", "Assign coaching") },
        { id: "QA scorecard", kind: "modal", title: "Quality review", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <QaScorecard context={context} close={close} />, footer: submitFooter("cr-qa", "Record the review") },
        { id: "survey builder", kind: "modal", title: "Survey", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <SurveyBuilder context={context} close={close} />, footer: submitFooter("cr-survey", "Save survey") },
        { id: "case replay", kind: "drawer", title: "Case replay", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <CaseReplay context={context} /> },
      ],
    },
  },
});
