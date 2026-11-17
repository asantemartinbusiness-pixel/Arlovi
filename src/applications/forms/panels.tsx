import { useState } from "react";
import "./library.css";
import { ClipboardList, Copy, FileText, Inbox, Link2, ShieldAlert, Workflow } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties,
  Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useChildren, useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { daysBetween, wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { BoundaryNotice, downloadCsv, downloadFile } from "@/applications/t6kit/kit";
import {
  FIELD_LABELS, OPERATOR_LABELS, STRUCTURAL, answerText, embedSnippet, evaluate, logicIssues,
  makeField, pages, readForm, validate, type Answers, type FormModel, type LogicRule, type Operator,
} from "./model";
import { FormRuntime } from "./runtime";
import { NoForm, useFormRecord } from "./builder";
import { saveForm } from "./state";

/* ================================================================ *
 * ARL-FORMS-001 — Forms Directory
 * ================================================================ */

const TEMPLATES: { id: string; title: string; summary: string; fields: { type: Parameters<typeof makeField>[0]; label: string; required?: boolean; options?: string[] }[] }[] = [
  {
    id: "enquiry",
    title: "Enquiry",
    summary: "Name, address and what the person wants, with a consent line.",
    fields: [
      { type: "text", label: "Name", required: true },
      { type: "email", label: "Email", required: true },
      { type: "longtext", label: "What are you looking for?" },
      { type: "checkbox", label: "Keep my enquiry on file so you can reply", required: true },
    ],
  },
  {
    id: "booking",
    title: "Visit booking",
    summary: "A date, a party size and an accessibility note.",
    fields: [
      { type: "text", label: "Name", required: true },
      { type: "date", label: "Preferred date", required: true },
      { type: "number", label: "How many people" },
      { type: "longtext", label: "Anything we should know about access" },
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    summary: "A rating, a comment and an optional way to reply.",
    fields: [
      { type: "rating", label: "How did we do?", required: true },
      { type: "longtext", label: "What would you change?" },
      { type: "email", label: "Email, if you would like a reply" },
    ],
  },
  {
    id: "application",
    title: "Trade application",
    summary: "Company details, a file reference and a declaration.",
    fields: [
      { type: "text", label: "Company name", required: true },
      { type: "text", label: "Registration number" },
      { type: "select", label: "Trade", options: ["Interior design", "Architecture", "Contractor", "Retail"], required: true },
      { type: "fileref", label: "Name of the certificate you will send" },
      { type: "checkbox", label: "I confirm the details above are accurate", required: true },
    ],
  },
];

export function FormsDirectory({ context, scope }: { context: ScreenContext; scope: "All" | "Draft" | "Live" | "Templates" }) {
  const forms = useCollection("forms");
  const submissions = useCollection("submissions");
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const active = forms.filter((record) => record.status !== "archived");
  const live = active.filter((record) => record.status === "live");
  const draft = active.filter((record) => record.status !== "live");
  const rowsInScope = scope === "Live" ? live : scope === "Draft" ? draft : active;
  const needle = query.trim().toLocaleLowerCase();
  const rows = rowsInScope.filter((record) => !needle || [record.title, record.summary, record.ownerName, ...record.tags].join(" ").toLocaleLowerCase().includes(needle));
  const templateRows = TEMPLATES.filter((template) => !needle || [template.title, template.summary, ...template.fields.map((field) => field.label)].join(" ").toLocaleLowerCase().includes(needle));
  const formIds = new Set(active.map((record) => record.id));
  const totalResponses = submissions.filter((record) => record.parentId && formIds.has(record.parentId)).length;
  const heading = scope === "Templates" ? "Start from a proven structure." : scope === "Live" ? "Forms accepting responses." : scope === "Draft" ? "Prepare the next form." : "Forms and their responses.";
  return (
    <Stack gap={4}>
      <section aria-label="Forms library overview" className="t6-directory-intro">
        <Row gap={3} wrap>
          <div className="ds-grow" style={{ minWidth: 220 }}>
            <span className="ds-subtle">FORMS / {scope.toUpperCase()}</span>
            <h2 style={{ margin: "var(--space-2) 0", fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)", letterSpacing: "-.03em" }}>{heading}</h2>
            <p className="ds-subtle" style={{ maxWidth: "65ch", margin: 0 }}>
              {scope === "Templates" ? "Choose a starting point, then customise every question and validation rule." : "Find the right form, inspect its response activity, and continue editing without losing context."}
            </p>
          </div>
          <Button variant="primary" onClick={() => context.openOverlay("New form")}>New form</Button>
        </Row>
      </section>
      <div className="t6-directory-metrics" aria-label="Forms activity summary">
        <div><span>Active forms</span><strong>{active.length}</strong></div>
        <div><span>Live forms</span><strong>{live.length}</strong></div>
        <div><span>Draft forms</span><strong>{draft.length}</strong></div>
        <div><span>Stored responses</span><strong>{totalResponses}</strong></div>
      </div>
      <Field label={scope === "Templates" ? "Find a template" : "Find a form"}>
        <TextInput type="search" aria-label={scope === "Templates" ? "Find a template" : "Find a form"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "Templates" ? "Search templates or questions" : "Search name, description, owner or tags"} />
      </Field>
      {scope === "Templates" ? (
        templateRows.length === 0 ? (
          <Empty title="No templates match this search" icon={<ClipboardList size={20} />} action={<Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>}>Try a different keyword to browse the available templates.</Empty>
        ) : (
          <Grid>
            {templateRows.map((template) => (
              <Card key={template.id} span={6} title={template.title} subtitle={template.summary}
                footer={<Button size="sm" variant="primary" onClick={async () => {
                  const model: FormModel = {
                    ...readForm(undefined),
                    fields: template.fields.map((field) => {
                      const made = makeField(field.type);
                      return { ...made, label: field.label, required: field.required ?? false, options: field.options ?? made.options };
                    }),
                  };
                  const created = await context.mutate.create({
                    collection: "forms", title: `${template.title} form`, status: "draft",
                    summary: template.summary, body: model,
                  }, `Form created from the ${template.title} template`);
                  context.toast("Form created", `${created.title} has ${model.fields.length} fields and is a draft.`);
                  context.navigate(`/o/${org.slug}/forms/forms/${created.id}`);
                }}>Start from this</Button>}>
                <Stack gap={1}>
                  {template.fields.map((field) => (
                    <Row key={field.label} gap={2}>
                      <span className="ds-grow">{field.label}</span>
                      <Pill tone="neutral">{FIELD_LABELS[field.type]}</Pill>
                      {field.required && <Pill tone="warning">required</Pill>}
                    </Row>
                  ))}
                </Stack>
              </Card>
            ))}
          </Grid>
        )
      ) : rows.length === 0 ? (
        <Empty title={needle ? "No forms match this search" : scope === "All" ? "No forms yet" : `No ${scope.toLowerCase()} forms`} icon={<ClipboardList size={20} />}
          action={needle ? <Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button> : <Button variant="primary" onClick={() => context.openOverlay("New form")}>Create a form</Button>}>
          {needle ? "Try a different name, owner, description or tag." : "Forms start as drafts. Add questions, test the logic and publish when ready."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Forms"
          columns={[
            { key: "title", header: "Form", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "fields", header: "Questions", align: "end", cell: (row) => String(readForm(row).fields.filter((field) => !STRUCTURAL.includes(field.type)).length), sortValue: (row) => readForm(row).fields.length },
            { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "live" ? "success" : "neutral"} dot>{row.status}</Pill> },
            { key: "access", header: "Access setting", cell: (row) => readForm(row).settings.access === "link" ? "Link option (local)" : "Workspace option (local)" },
            { key: "subs", header: "Submissions", align: "end", cell: (row) => String(submissions.filter((item) => item.parentId === row.id).length), sortValue: (row) => submissions.filter((item) => item.parentId === row.id).length },
            { key: "sensitive", header: "Sensitive", cell: (row) => readForm(row).fields.some((field) => field.sensitive) ? <Pill tone="danger">flagged</Pill> : <span className="ds-subtle">No</span> },
            { key: "owner", header: "Owner", cell: (row) => row.ownerName },
          ]}
          onOpen={(id) => context.navigate(`/o/${org.slug}/forms/forms/${id}`)}
          onSelect={(id) => context.select(id)}
          selectedId={context.selectedId}
          summary={<span>Access options are stored locally, not server-enforced invitations or hosted public links. Sensitive answers remain redacted until explicitly revealed.</span>}
          bulkActions={[
            { label: "Archive", tone: "danger", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { status: "archived" }, { event: `Form ${row.title} archived` })) },
          ]}
        />
      )}
    </Stack>
  );
}

export function NewFormDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const forms = useCollection("forms");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [templateId, setTemplateId] = useState("enquiry");
  const duplicate = forms.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());
  const template = TEMPLATES.find((item) => item.id === templateId);
  const suggested = suggestFields(purpose);
  return (
    <form
      id="new-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const source = templateId === "suggested" ? suggested.fields : (template?.fields ?? []);
        const model: FormModel = {
          ...readForm(undefined),
          fields: source.map((field) => {
            const made = makeField(field.type);
            return { ...made, label: field.label, required: field.required ?? false, options: field.options ?? made.options };
          }),
        };
        const created = await context.mutate.create({
          collection: "forms", title: title.trim(), status: "draft",
          summary: purpose || template?.summary || "", body: model,
        }, `Form ${title.trim()} created`);
        context.toast("Form created", `${created.title} is a draft with ${model.fields.length} questions.`);
        close();
        context.navigate(`/o/${context.org.slug}/forms/forms/${created.id}`);
      }}
    >
      <Field label="Form name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required /></Field>
      {duplicate && <Notice tone="danger" title="A form with that name exists">Two forms with one name make a submission ambiguous to read later.</Notice>}
      <Field label="What it is for" hint="Used to propose a starting set of questions, matched on keywords in this browser.">
        <TextArea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Collect trade account applications with a certificate reference" />
      </Field>
      <Field label="Start from">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          {TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          <option value="suggested">Proposed from the description above</option>
        </Select>
      </Field>
      <Card title="Questions it would start with" subtitle={templateId === "suggested" ? suggested.why : template?.summary}>
        <Stack gap={1}>
          {(templateId === "suggested" ? suggested.fields : template?.fields ?? []).map((field) => (
            <Row key={field.label} gap={2}>
              <span className="ds-grow">{field.label}</span>
              <Pill tone="neutral">{FIELD_LABELS[field.type]}</Pill>
            </Row>
          ))}
        </Stack>
      </Card>
      <Notice tone="info" title="Every question stays editable">
        The proposal is a keyword match over the description, computed here. No model is called and nothing is invented beyond the words you typed.
      </Notice>
    </form>
  );
}

function suggestFields(purpose: string): { why: string; fields: { type: Parameters<typeof makeField>[0]; label: string; required?: boolean; options?: string[] }[] } {
  const text = purpose.toLowerCase();
  const fields: { type: Parameters<typeof makeField>[0]; label: string; required?: boolean; options?: string[] }[] = [
    { type: "text", label: "Name", required: true },
    { type: "email", label: "Email", required: true },
  ];
  const matched: string[] = [];
  if (/date|book|visit|appointment|slot/.test(text)) { fields.push({ type: "date", label: "Preferred date", required: true }); matched.push("a date"); }
  if (/file|certificate|drawing|document|upload/.test(text)) { fields.push({ type: "fileref", label: "Name of the file you will send" }); matched.push("a file reference"); }
  if (/rate|rating|score|satisfaction/.test(text)) { fields.push({ type: "rating", label: "How did we do?" }); matched.push("a rating"); }
  if (/company|trade|business|account/.test(text)) { fields.push({ type: "text", label: "Company name", required: true }); matched.push("a company name"); }
  if (/quantity|how many|number|budget/.test(text)) { fields.push({ type: "number", label: "How many" }); matched.push("a quantity"); }
  fields.push({ type: "longtext", label: "Anything else we should know" });
  return {
    why: matched.length ? `Matched on ${matched.join(", ")} in the description.` : "No keywords matched, so only the two questions every form needs are proposed.",
    fields,
  };
}

/* ================================================================ *
 * ARL-FORMS-003 — Conditional Logic
 * ================================================================ */

export function LogicScreen({ context, lens }: { context: ScreenContext; lens: "Rules" | "Preview" | "Test" | "History" }) {
  const { record, model } = useFormRecord(context);
  const events = useEvents(record?.id);
  const [answers, setAnswers] = useState<Answers>({});
  if (!record) return <NoForm />;
  const issues = logicIssues(model);
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const blockingIssues = issues.filter((issue) => issue.level === "fail").length;
  const workflowOverview = (
    <section className="t6-workflow-overview" aria-label="Conditional logic overview">
      <Row gap={3} wrap>
        <div className="ds-grow" style={{ minWidth: 220 }}>
          <span className="ds-subtle">FORMS / CONDITIONAL LOGIC</span>
          <h2 style={{ margin: "var(--space-2) 0", fontSize: "clamp(1.2rem, 2vw, 1.65rem)", letterSpacing: "-.03em" }}>Make every path understandable.</h2>
          <p className="ds-subtle" style={{ margin: 0 }}>Rules decide which questions appear and which answers are required. Validate every branch before collecting responses.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}`)}>Back to builder</Button>
      </Row>
      <div className="t6-directory-metrics">
        <div><span>Rules</span><strong>{model.logic.length}</strong></div>
        <div><span>Answerable fields</span><strong>{answerable.length}</strong></div>
        <div><span>Blocking issues</span><strong>{blockingIssues}</strong></div>
        <div><span>Warnings</span><strong>{issues.length - blockingIssues}</strong></div>
      </div>
    </section>
  );

  if (lens === "Rules") {
    return (
      <Stack gap={4}>
        {workflowOverview}
        <Row gap={2} wrap>
          <Button variant="primary" onClick={() => context.openOverlay("Rule editor")}>New rule</Button>
          <Button variant="secondary" onClick={() => context.openOverlay("invalid path")}>Check the branches</Button>
        </Row>
        {issues.length > 0 && (
          <Notice tone={issues.some((issue) => issue.level === "fail") ? "danger" : "warning"} title={`${issues.length} branch ${issues.length === 1 ? "note" : "notes"}`}>
            {issues.slice(0, 3).map((issue) => <div key={issue.id}>{issue.title}</div>)}
          </Notice>
        )}
        {model.logic.length === 0 ? (
          <Empty title="No rules yet" icon={<Workflow size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Rule editor")}>Create a condition</Button>}>
            Without a rule every question is shown to everyone. A rule can show, hide or require a field depending on an earlier answer.
          </Empty>
        ) : (
          <DataGrid
            rows={model.logic}
            rowId={(row) => row.id}
            label="Rules"
            columns={[
              { key: "action", header: "Then", primary: true, cell: (row) => <Pill tone={row.action === "hide" ? "warning" : row.action === "require" ? "info" : "success"}>{row.action}</Pill> },
              { key: "target", header: "This field", cell: (row) => model.fields.find((field) => field.id === row.targetId)?.label ?? <Pill tone="danger">missing field</Pill>, filterValue: (row) => model.fields.find((field) => field.id === row.targetId)?.label ?? "" },
              { key: "when", header: "When", cell: (row) => model.fields.find((field) => field.id === row.whenFieldId)?.label ?? <Pill tone="danger">missing field</Pill> },
              { key: "op", header: "Comparison", cell: (row) => `${OPERATOR_LABELS[row.operator]} ${row.value}`.trim() },
              {
                key: "valid", header: "Reachable", cell: (row) => {
                  const bad = issues.some((issue) => issue.id.endsWith(row.id) && issue.level === "fail");
                  return bad ? <Pill tone="danger">no</Pill> : <Pill tone="success">yes</Pill>;
                },
              },
            ]}
            onOpen={(id) => context.openOverlay("Rule editor", { id })}
            bulkActions={[{
              label: "Delete", tone: "danger",
              onRun: (selected) => void saveForm(context, record, { ...model, logic: model.logic.filter((rule) => !selected.some((row) => row.id === rule.id)) }, `${selected.length} rules removed`),
            }]}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Preview") {
    return (
      <Grid>
        <Card span={6} eyebrow="PREVIEW" prov="human" title="Answer it" subtitle="The rules run as you type">
          <FormRuntime model={model} record={record} context={context} mode="preview" />
        </Card>
        <Card span={6} eyebrow="LOGIC" prov="posted" title="What the rules decide" subtitle="Recomputed from the current answers">
          <LogicTrace model={model} answers={answers} />
          <Notice tone="info" title="Two panels, one engine">
            The trace is the same evaluation the form on the left runs, so it cannot drift from what a person actually sees.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Test") {
    const { visible, required } = evaluate(model, answers);
    const errors = validate(model, answers);
    return (
      <Grid>
        <Card span={5} title="Set the answers" subtitle="Change one and watch the branch move">
          <Stack gap={3}>
            {answerable.length === 0 && <Empty title="No answerable fields" icon={<FileText size={20} />} />}
            {answerable.map((field) => (
              <Field key={field.id} label={field.label} hint={FIELD_LABELS[field.type]}>
                {field.options.length > 0 ? (
                  <Select value={answerText(answers[field.id])} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}>
                    <option value="">Not answered</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                ) : (
                  <TextInput value={answerText(answers[field.id])} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))} />
                )}
              </Field>
            ))}
            <Button variant="ghost" onClick={() => setAnswers({})}>Clear the scenario</Button>
          </Stack>
        </Card>
        <Card span={7} title="Result" subtitle={`${visible.size} fields visible · ${required.size} required · ${errors.length} would block`}>
          <Stack gap={3}>
            <LogicTrace model={model} answers={answers} />
            {errors.length > 0 ? (
              <Notice tone="warning" title="What would stop this submission">
                <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{errors.map((error) => <li key={error.fieldId}>{error.message}</li>)}</ul>
              </Notice>
            ) : (
              <Notice tone="success" title="This scenario would submit">Every visible, required field has an answer that satisfies its rules.</Notice>
            )}
            <Notice tone="info" title="Hidden questions never block">
              {model.fields.filter((field) => field.required && !visible.has(field.id)).length} required {model.fields.filter((field) => field.required && !visible.has(field.id)).length === 1 ? "field is" : "fields are"} hidden in this scenario. Validation skips them, so they cannot make the form impossible to finish.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  const logicEvents = events.filter((event) => /rule|logic|branch/i.test(event.message));
  return logicEvents.length === 0
    ? <Empty title="No rule changes recorded yet" icon={<Workflow size={20} />}>Adding, editing or removing a rule writes an audit event, and those events are this history.</Empty>
    : (
      <DataGrid
        rows={logicEvents}
        rowId={(row) => row.id}
        label="Rule history"
        columns={[
          { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
          { key: "actor", header: "Who", cell: (row) => row.actor },
          { key: "message", header: "Change", cell: (row) => row.message, filterValue: (row) => row.message },
        ]}
      />
    );
}

function LogicTrace({ model, answers }: { model: FormModel; answers: Answers }) {
  const { visible, required } = evaluate(model, answers);
  return (
    <Stack gap={2}>
      {model.fields.map((field) => (
        <Row key={field.id} gap={2}>
          <span className="ds-grow ds-truncate">{field.label}</span>
          {STRUCTURAL.includes(field.type)
            ? <Pill tone="neutral">structure</Pill>
            : <>
              <Pill tone={visible.has(field.id) ? "success" : "neutral"}>{visible.has(field.id) ? "shown" : "hidden"}</Pill>
              {required.has(field.id) && <Pill tone="warning">required</Pill>}
            </>}
        </Row>
      ))}
    </Stack>
  );
}

export function RuleEditorForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useFormRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = model.logic.find((rule) => rule.id === payload?.id);
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const [targetId, setTargetId] = useState(existing?.targetId ?? answerable[1]?.id ?? "");
  const [action, setAction] = useState<LogicRule["action"]>(existing?.action ?? "show");
  const [whenFieldId, setWhenFieldId] = useState(existing?.whenFieldId ?? answerable[0]?.id ?? "");
  const [operator, setOperator] = useState<Operator>(existing?.operator ?? "equals");
  const [value, setValue] = useState(existing?.value ?? "");
  if (!record) return <NoForm />;
  const source = model.fields.find((field) => field.id === whenFieldId);
  const selfRef = targetId === whenFieldId && targetId !== "";
  const badOption = Boolean(source && source.options.length > 0 && value && !source.options.includes(value));

  return (
    <form
      id="rule-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (selfRef || !targetId || !whenFieldId) return;
        const rule: LogicRule = { id: existing?.id ?? `l-${wallMs().toString(36)}`, targetId, action, whenFieldId, operator, value };
        const logic = existing ? model.logic.map((item) => (item.id === existing.id ? rule : item)) : [...model.logic, rule];
        const targetLabel = model.fields.find((field) => field.id === targetId)?.label ?? "a field";
        await saveForm(context, record, { ...model, logic }, `Rule ${existing ? "changed" : "added"}: ${action} ${targetLabel}`);
        context.toast("Rule saved", `${targetLabel} will ${action} when the condition matches.`);
        close();
      }}
    >
      <Row gap={2}>
        <Field label="Then">
          <Select value={action} onChange={(event) => setAction(event.target.value as LogicRule["action"])}>
            <option value="show">show</option>
            <option value="hide">hide</option>
            <option value="require">require</option>
          </Select>
        </Field>
        <Field label="This field" required>
          <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {model.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
          </Select>
        </Field>
      </Row>
      <Row gap={2}>
        <Field label="When" required>
          <Select value={whenFieldId} onChange={(event) => setWhenFieldId(event.target.value)}>
            {answerable.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
          </Select>
        </Field>
        <Field label="Comparison">
          <Select value={operator} onChange={(event) => setOperator(event.target.value as Operator)}>
            {(Object.keys(OPERATOR_LABELS) as Operator[]).map((key) => <option key={key} value={key}>{OPERATOR_LABELS[key]}</option>)}
          </Select>
        </Field>
      </Row>
      {operator !== "answered" && operator !== "empty" && (
        <Field label="Value" error={badOption ? `"${value}" is not an option of ${source?.label}, so this branch could never be reached.` : undefined}>
          {source && source.options.length > 0 ? (
            <Select value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">Choose a value</option>
              {source.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          ) : (
            <TextInput value={value} onChange={(event) => setValue(event.target.value)} invalid={badOption} />
          )}
        </Field>
      )}
      {selfRef && <Notice tone="danger" title="A field cannot decide its own visibility">Choose a different question on the When line.</Notice>}
      <Notice tone="info" title="A hidden field is never validated">
        If this rule hides a required question, that question is skipped when the form is checked, so it can never leave someone unable to submit.
      </Notice>
    </form>
  );
}

export function InvalidPathPanel({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  const issues = logicIssues(model);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Rules", value: String(model.logic.length) },
        { label: "Fields", value: String(model.fields.length) },
        { label: "Problems", value: <Pill tone={issues.some((issue) => issue.level === "fail") ? "danger" : issues.length ? "warning" : "success"}>{issues.length}</Pill> },
        { label: "Checked", value: "Dangling targets, self-reference, unreachable values, order, and required fields that no rule can show" },
      ]} />
      {issues.length === 0 ? (
        <Notice tone="success" title="Every branch can be reached">Each rule names a field that exists and compares against a value that an answer can take.</Notice>
      ) : (
        <Stack gap={2}>
          {issues.map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level === "fail" ? "fail" : "warn"}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
              <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.level}</Pill>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function ScenarioTester({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const [answers, setAnswers] = useState<Answers>({});
  if (!record) return <NoForm />;
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const errors = validate(model, answers);
  return (
    <Stack gap={3}>
      {answerable.slice(0, 6).map((field) => (
        <Field key={field.id} label={field.label}>
          {field.options.length > 0 ? (
            <Select value={answerText(answers[field.id])} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}>
              <option value="">Not answered</option>
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          ) : (
            <TextInput value={answerText(answers[field.id])} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))} />
          )}
        </Field>
      ))}
      <LogicTrace model={model} answers={answers} />
      <Notice tone={errors.length ? "warning" : "success"} title={errors.length ? `${errors.length} would block` : "This scenario would submit"}>
        {errors.length ? errors.map((error) => error.message).join(" ") : "Every visible, required field is satisfied."}
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-FORMS-004 — Form Submissions
 * ================================================================ */

export function SubmissionsScreen({ context, lens }: { context: ScreenContext; lens: "All" | "New" | "Reviewed" | "Routed" }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  const { now } = useWorkspace();
  const [revealed, setRevealed] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  if (!record) return <NoForm />;
  const sensitive = model.fields.filter((field) => field.sensitive).map((field) => field.label);
  const rows = children.filter((row) => {
    if (lens === "New" && row.status !== "new") return false;
    if (lens === "Reviewed" && row.status !== "reviewed") return false;
    if (lens === "Routed" && row.status !== "routed") return false;
    const needle = query.trim().toLocaleLowerCase();
    return !needle || [row.title, row.summary, String(row.fields.assignee ?? ""), row.status].join(" ").toLocaleLowerCase().includes(needle);
  });
  const overdue = children.filter((row) => daysBetween(new Date(row.at ?? row.createdAt), now) > model.settings.retentionDays);

  return (
    <Stack gap={4}>
      <section className="t6-workflow-overview" aria-label="Submission inbox overview">
        <Row gap={3} wrap><div className="ds-grow" style={{ minWidth: 220 }}>
          <span className="ds-subtle">FORMS / RESPONSES</span>
          <h2 className="t6-workflow-title">Every answer has a next step.</h2>
          <p className="ds-subtle">Review incoming records, protect sensitive answers and route follow-up to a responsible owner.</p>
        </div>
          <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}`)}>Back to builder</Button>
        </Row>
        <div className="t6-directory-metrics" aria-label="Submission workflow counts">
          <div><span>Received</span><strong>{children.length}</strong></div>
          <div><span>New</span><strong>{children.filter((row) => row.status === "new").length}</strong></div>
          <div><span>Reviewed</span><strong>{children.filter((row) => row.status === "reviewed").length}</strong></div>
          <div><span>Routed</span><strong>{children.filter((row) => row.status === "routed").length}</strong></div>
        </div>
        <Field label="Search responses"><TextInput type="search" aria-label="Search responses" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search respondent, status or assignee" /></Field>
      </section>
      <StatRow>
        <Stat prov="posted" label="Submissions" value={String(children.length)} meta={`${children.filter((row) => row.status === "new").length} not yet reviewed`} />
        <Stat prov="posted" label="Sensitive answers" value={String(sensitive.length)} meta={sensitive.length ? `${sensitive.join(", ")} redacted by default` : "None flagged"} />
        <Stat prov="posted" label="Retention" value={`${model.settings.retentionDays} days`} meta={`${overdue.length} past the period`} onClick={() => context.openOverlay("privacy control")} />
        <Stat label="Notification" value={model.settings.notifyEnabled ? "Wanted" : "Off"} unavailable={model.settings.notifyEnabled} meta={model.settings.notifyEnabled ? "No mail provider is connected" : "Nothing is attempted"} />
      </StatRow>

      {overdue.length > 0 && (
        <Notice tone="warning" title={`${overdue.length} ${overdue.length === 1 ? "submission is" : "submissions are"} older than the retention period`}
          actions={<Button size="sm" variant="outline-danger" onClick={() => context.openOverlay("privacy control")}>Review them</Button>}>
          Nothing is deleted automatically. The retention period is a policy this screen measures against, not a job that runs behind your back.
        </Notice>
      )}

      {rows.length === 0 ? (
        <Empty title={query.trim() ? "No responses match this search" : `No ${lens === "All" ? "" : lens.toLowerCase() + " "}submissions`} icon={<Inbox size={20} />} action={query.trim() ? <Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button> : undefined}>
          {query.trim() ? "Try a different respondent, status or assignee." : "Answer the form on its publish screen and the record appears here."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Submissions"
          columns={[
            { key: "title", header: "From", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "at", header: "Received", cell: (row) => context.dateTime(row.at ?? row.createdAt), sortValue: (row) => row.at ?? row.createdAt },
            { key: "version", header: "Version", align: "end", cell: (row) => String(row.fields.formVersion ?? "—") },
            {
              key: "answers", header: "Answers", cell: (row) => {
                const hidden = sensitive.filter((label) => row.fields[label] !== undefined);
                const shown = Object.entries(row.fields)
                  .filter(([key]) => !["formVersion", "notificationState", "assignee", "redacted"].includes(key))
                  .map(([key, value]) => (sensitive.includes(key) && !revealed.includes(row.id) ? `${key}: ••••` : `${key}: ${String(value)}`));
                return (
                  <span>
                    <span className="ds-truncate" style={{ display: "block", maxWidth: 340 }}>{shown.join(" · ")}</span>
                    {hidden.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={(event) => {
                        event.stopPropagation();
                        setRevealed((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]);
                        void context.mutate.log(`${revealed.includes(row.id) ? "Hid" : "Revealed"} ${hidden.length} sensitive answers on ${row.title}`, { entityId: row.id, type: "privacy" });
                      }}>{revealed.includes(row.id) ? "Hide again" : "Reveal"}</Button>
                    )}
                  </span>
                );
              },
            },
            { key: "assignee", header: "Assigned", cell: (row) => String(row.fields.assignee ?? "—") },
            { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "new" ? "info" : row.status === "routed" ? "success" : "neutral"}>{row.status}</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("Submission drawer", { id })}
          bulkActions={[
            { label: "Mark reviewed", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { status: "reviewed" }, { event: `Submission ${row.title} marked reviewed` })) },
            { label: "Assign to me", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { status: "routed", fields: { ...row.fields, assignee: context.actor } }, { event: `Submission ${row.title} assigned to ${context.actor}` })) },
          ]}
          toolbar={
            <Button size="sm" variant="secondary" onClick={() => {
              const labels = model.fields.filter((field) => !STRUCTURAL.includes(field.type)).map((field) => field.label);
              downloadCsv(
                `${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv`,
                ["received", "from", "version", "state", ...labels],
                rows.map((row) => [
                  row.at ?? row.createdAt, row.title, row.fields.formVersion ?? "", row.status,
                  ...labels.map((label) => (sensitive.includes(label) && !revealed.includes(row.id) ? "[redacted]" : String(row.fields[label] ?? ""))),
                ]),
              );
              void context.mutate.log(`${rows.length} submissions exported to CSV${sensitive.length ? " with sensitive answers redacted" : ""}`, { entityId: record.id, type: "export" });
              context.toast("Exported", `${rows.length} rows written to CSV${sensitive.length ? ", sensitive answers redacted" : ""}.`);
            }}>Export CSV</Button>
          }
          summary={<span>Sensitive answers export as <code>[redacted]</code> unless they have been revealed on screen, and every reveal is recorded in the audit log.</span>}
        />
      )}
    </Stack>
  );
}

export function SubmissionDrawer({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [shown, setShown] = useState(false);
  const submission = payload?.id ? children.find((row) => row.id === payload.id) : undefined;
  if (!record) return <NoForm />;
  if (!submission) return <Empty title="Submission unavailable" icon={<Inbox size={20} />}>The selected response could not be found for this form. No other person's answers were opened.</Empty>;
  const sensitive = model.fields.filter((field) => field.sensitive).map((field) => field.label);
  return (
    <Stack gap={4}>
      <div><span className="ds-subtle">FORMS / RESPONSE DETAIL</span><h3 style={{ margin: "var(--space-2) 0" }}>{submission.title}</h3><p className="ds-subtle">Review the original answers and record a follow-up. Sensitive values stay hidden unless revealed explicitly.</p></div>
      <Properties rows={[
        { label: "From", value: submission.title },
        { label: "Received", value: context.dateTime(submission.at ?? submission.createdAt) },
        { label: "Answered version", value: String(submission.fields.formVersion ?? "not recorded") },
        { label: "State", value: <Pill tone={submission.status === "new" ? "info" : "neutral"}>{submission.status}</Pill> },
        { label: "Notification", value: String(submission.fields.notificationState ?? "not recorded").replace(/_/g, " ") },
      ]} />
      <h4>Answers</h4>
      <Properties rows={Object.entries(submission.fields)
        .filter(([key]) => !["formVersion", "notificationState", "assignee"].includes(key))
        .map(([key, value]) => ({
          label: key,
          value: sensitive.includes(key) && !shown ? <Pill tone="danger">redacted</Pill> : String(value),
        }))} />
      {sensitive.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => {
          setShown((current) => !current);
          void context.mutate.log(`${shown ? "Hid" : "Revealed"} sensitive answers on ${submission.title}`, { entityId: submission.id, type: "privacy" });
        }}>{shown ? "Hide sensitive answers" : "Reveal sensitive answers"}</Button>
      )}
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => void context.mutate.patch(submission.id, { status: "reviewed" }, { event: `Submission ${submission.title} marked reviewed` })}>Mark reviewed</Button>
        <Button size="sm" variant="secondary" onClick={() => void context.mutate.patch(submission.id, { status: "routed", fields: { ...submission.fields, assignee: context.actor } }, { event: `Submission ${submission.title} assigned to ${context.actor}` })}>Assign to me</Button>
      </Row>
      {submission.fields.notificationState === "not_sent_no_mail_provider" && (
        <BoundaryNotice id="email.send" action="The notification for this submission" />
      )}
    </Stack>
  );
}

export function PrivacyControl({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  const { now } = useWorkspace();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!record) return <NoForm />;
  const overdue = children.filter((row) => daysBetween(new Date(row.at ?? row.createdAt), now) > model.settings.retentionDays);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Retention period", value: `${model.settings.retentionDays} days` },
        { label: "Submissions held", value: String(children.length) },
        { label: "Past the period", value: <Pill tone={overdue.length ? "warning" : "success"}>{overdue.length}</Pill> },
        { label: "Sensitive fields", value: model.fields.filter((field) => field.sensitive).map((field) => field.label).join(", ") || "None" },
      ]} />
      {overdue.length === 0 ? (
        <Notice tone="success" title="Nothing is past its period">Every submission is inside the {model.settings.retentionDays} day window set on this form.</Notice>
      ) : (
        <>
          <Stack gap={2}>
            {overdue.slice(0, 8).map((row) => (
              <Row key={row.id} gap={2}>
                <span className="ds-grow ds-truncate">{row.title}</span>
                <span className="ds-subtle">{daysBetween(new Date(row.at ?? row.createdAt), now)} days old</span>
              </Row>
            ))}
          </Stack>
          <Notice tone="warning" title="Review before deleting">This will remove {overdue.length} stored response records from this workspace. Confirm the retention decision and any applicable holds before proceeding.</Notice>
          <Checkbox label="I have reviewed the affected responses and authorise this deletion" checked={confirmed} onChange={setConfirmed} />
          <Button variant="outline-danger" disabled={!confirmed || deleting} onClick={async () => {
            setDeleting(true);
            try {
              for (const row of overdue) await context.mutate.remove(row.id, `Submission ${row.title} deleted under the ${model.settings.retentionDays} day retention policy`);
              context.toast("Deletion recorded", `${overdue.length} submissions were removed from this workspace.`, "info");
              setConfirmed(false);
            } catch {
              context.toast("Deletion incomplete", "One or more records could not be removed. Review the remaining submissions before retrying.", "blocked");
            } finally {
              setDeleting(false);
            }
          }}>{deleting ? "Deleting…" : `Delete ${overdue.length} past the period`}</Button>
        </>
      )}
      <Notice tone="info" title="Deletion is a decision, not a schedule">
        Nothing is removed automatically in this workspace. The policy is measured here and applied when someone presses the button, and every deletion writes an audit event.
      </Notice>
    </Stack>
  );
}

export function RouteRetry({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  if (!record) return <NoForm />;
  const wanted = children.filter((row) => row.fields.notificationState === "not_sent_no_mail_provider");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Notification wanted", value: model.settings.notifyEnabled ? "Yes" : "No" },
        { label: "Recipient", value: model.settings.notifyTo || "Not set" },
        { label: "Submissions waiting", value: String(wanted.length) },
      ]} />
      <BoundaryNotice id="email.send" action="Delivering these notifications" />
      <Notice tone="info" title="Retrying would change nothing">
        A retry only makes sense against a provider that answered. None has been called, so the honest state is that the message was never attempted, and these {wanted.length} submissions keep that state until a mail provider is connected.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-FORMS-005 — Form Design & Publish
 * ================================================================ */

export function PublishScreen({ context, lens }: { context: ScreenContext; lens: "Design" | "Embed" | "Access" | "Analytics" }) {
  const { record, model } = useFormRecord(context);
  const [device, setDevice] = useState<"mobile" | "desktop">("desktop");
  if (!record) return <NoForm />;
  const publishOverview = (
    <section className="t6-workflow-overview" aria-label="Form publishing overview">
      <Row gap={3} wrap><div className="ds-grow" style={{ minWidth: 220 }}>
        <span className="ds-subtle">FORMS / DESIGN & DELIVERY</span>
        <h2 className="t6-workflow-title">Prepare the form people will answer.</h2>
        <p className="ds-subtle">Review appearance, response experience, versions and access boundaries before recording publication.</p>
      </div><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}`)}>Back to builder</Button></Row>
      <div className="t6-directory-metrics">
        <div><span>Version</span><strong>{model.settings.version}</strong></div>
        <div><span>Questions</span><strong>{model.fields.filter((field) => !STRUCTURAL.includes(field.type)).length}</strong></div>
        <div><span>Logic rules</span><strong>{model.logic.length}</strong></div>
        <div><span>Logic issues</span><strong>{logicIssues(model).length}</strong></div>
      </div>
      <Notice tone="info">Publication status is local to this workspace. External hosting, public access controls and email delivery are not connected.</Notice>
    </section>
  );

  if (lens === "Design") {
    return (
      <Stack gap={4}>
      {publishOverview}
      <Grid>
        <Card span={5} title="Appearance" subtitle="Saved on the form record">
          <FormThemeEditorBridge context={context} record={record} model={model} />
        </Card>
        <Card span={7} title="Preview" subtitle="Validation and rules run exactly as they do in the live form"
          actions={<Segmented label="Device" value={device} onChange={setDevice} options={[{ value: "mobile" as const, label: "390" }, { value: "desktop" as const, label: "Desktop" }]} />}>
          <div style={{ width: device === "mobile" ? 390 : "100%", maxWidth: "100%" }}>
            <FormRuntime model={model} record={record} context={context} mode="preview" />
          </div>
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (lens === "Embed") {
    const snippet = embedSnippet(record.id, record.title, model.theme);
    return (
      <Stack gap={4}>
      {publishOverview}
      <Grid>
        <Card span={6} eyebrow="LIVE FORM" prov="human" title="The live form" subtitle={`Version ${model.settings.version} · a submission here writes a record`}>
          <Stack gap={3}>
            {record.status !== "live" && (
              <Notice tone="warning" title="This form is still a draft">
                It accepts answers here so the whole path can be exercised, and every submission records the version it answered.
              </Notice>
            )}
            <FormRuntime model={model} record={record} context={context} mode="live" onSubmitted={() => context.toast("Submission recorded", "It is on the submissions screen.")} />
          </Stack>
        </Card>
        <Card span={6} eyebrow="EMBED" prov="unknown" title="Embed snippet" subtitle="The shape of the embed; it reaches no server"
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { downloadFile(`${record.id}-embed.html`, snippet, "text/html"); context.toast("Snippet downloaded", "The embed snippet is in a file."); }}>Download</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("embed tester")}>Test the embed</Button>
          </>}>
          <Stack gap={3}>
            <pre className="t6-code">{snippet}</pre>
            <Notice tone="warning" title="Pasting this on a page does not make it work">
              There is no host and no endpoint, so the snippet is a description of the embed rather than a working loader. It is kept honest rather than left to fail quietly on someone's site.
            </Notice>
          </Stack>
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (lens === "Access") {
    return (
      <Stack gap={4}>
      {publishOverview}
      <Grid>
        <Card span={6} eyebrow="ACCESS" prov="human" title="Who can answer" subtitle="Shapes the interface; it is not an account security boundary">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Audience preference", value: model.settings.access === "link" ? "Link mode (local only)" : "Workspace mode (local only)" },
              { label: "State", value: <Pill tone={model.settings.closed ? "warning" : "success"} dot>{model.settings.closed ? "Closed" : "Open"}</Pill> },
              { label: "Version", value: String(model.settings.version) },
              { label: "Editor route", value: <code>/o/{context.org.slug}/forms/forms/{record.id}/publish</code> },
            ]} />
            <Row gap={2} wrap>
              <Button size="sm" variant="secondary" onClick={() => void saveForm(context, record, { ...model, settings: { ...model.settings, access: model.settings.access === "link" ? "workspace" : "link" } }, "Form audience changed")}>
                Switch preference to {model.settings.access === "link" ? "workspace" : "link"} mode
              </Button>
              <Button size="sm" variant={model.settings.closed ? "primary" : "outline-danger"} onClick={() => void saveForm(context, record, { ...model, settings: { ...model.settings, closed: !model.settings.closed } }, model.settings.closed ? "Form reopened" : "Form closed")}>
                {model.settings.closed ? "Reopen the form" : "Close the form"}
              </Button>
            </Row>
            <Notice tone="warning" title="A link is not a lock">
              Everything here runs in one browser. Restricting the audience changes what this interface offers; it does not stop anyone who already has the workspace.
            </Notice>
          </Stack>
        </Card>
        <Card span={6} eyebrow="VERSIONS" prov="posted" title="Version trail" subtitle="So an old answer is readable against the form it answered">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Current version", value: String(model.settings.version) },
              { label: "Questions", value: String(model.fields.filter((field) => !STRUCTURAL.includes(field.type)).length) },
              { label: "Rules", value: String(model.logic.length) },
            ]} />
            <Button variant="primary" onClick={() => context.openOverlay("publish review")}>Publish a new version</Button>
            <Notice tone="info" title="Every submission names its version">
              A submission stores the version number it answered, so a question added later never makes an old answer look incomplete.
            </Notice>
          </Stack>
        </Card>
      </Grid>
      </Stack>
    );
  }

  return <Stack gap={4}>{publishOverview}<FormAnalytics context={context} lens="Funnel" /></Stack>;
}

function FormThemeEditorBridge({ context, record, model }: { context: ScreenContext; record: Rec; model: FormModel }) {
  return <ThemeEditorImpl model={model} onChange={(theme) => void saveForm(context, record, { ...model, theme }, "Form appearance changed")} />;
}

import { FormThemeEditor as ThemeEditorImpl } from "./builder";

export function PublishReviewForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  const issues = logicIssues(model);
  const blocking = issues.filter((issue) => issue.level === "fail");
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const noLabel = answerable.filter((field) => !field.label.trim());
  const emptyOptions = model.fields.filter((field) => (field.type === "select" || field.type === "multiselect") && field.options.length === 0);

  return (
    <Stack gap={4}>
      <ul className="t6-steps">
        <li className="t6-step" data-state={answerable.length ? "done" : "blocked"}><span className="t6-step-n">1</span>{answerable.length} questions</li>
        <li className="t6-step" data-state={noLabel.length === 0 && emptyOptions.length === 0 ? "done" : "blocked"}><span className="t6-step-n">2</span>Labels and options</li>
        <li className="t6-step" data-state={blocking.length === 0 ? "done" : "blocked"}><span className="t6-step-n">3</span>Reachable branches</li>
        <li className="t6-step" data-state="current"><span className="t6-step-n">4</span>Version {model.settings.version} → {model.settings.version + 1}</li>
      </ul>
      {(blocking.length > 0 || noLabel.length > 0 || emptyOptions.length > 0) && (
        <Notice tone="danger" title="Publishing is blocked">
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
            {noLabel.map((field) => <li key={field.id}>A {FIELD_LABELS[field.type].toLowerCase()} field has no question text.</li>)}
            {emptyOptions.map((field) => <li key={field.id}>{field.label} has no options to choose from.</li>)}
            {blocking.map((issue) => <li key={issue.id}>{issue.title}</li>)}
          </ul>
        </Notice>
      )}
      <Properties rows={[
        { label: "Questions", value: String(answerable.length) },
        { label: "Pages", value: String(pages(model).length) },
        { label: "Rules", value: String(model.logic.length) },
        { label: "Required", value: String(answerable.filter((field) => field.required).length) },
        { label: "Sensitive", value: String(answerable.filter((field) => field.sensitive).length) },
      ]} />
      <Button
        variant="primary"
        disabled={blocking.length > 0 || noLabel.length > 0 || emptyOptions.length > 0}
        onClick={async () => {
          const next = { ...model, settings: { ...model.settings, version: model.settings.version + 1 } };
          await saveForm(context, record, next, `Form published as version ${next.settings.version}`);
          await context.mutate.patch(record.id, { status: "live" }, { event: `Form ${record.title} is live at version ${next.settings.version}` });
          context.toast("Published", `Version ${next.settings.version} is live. Submissions from now on record that version.`);
          close();
        }}
      >
        Publish version {model.settings.version + 1}
      </Button>
      <Notice tone="info" title="Publishing here means inside this workspace">
        The form answers in this browser and writes records here. There is no public address, because nothing is hosted.
      </Notice>
    </Stack>
  );
}

export function EmbedTester({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  return (
    <Stack gap={3}>
      <Notice tone="info" title="This is the form a visitor would meet">
        It runs the real validation and the real rules, and a submission writes a record. The only thing missing is the host.
      </Notice>
      <FormRuntime model={model} record={record} context={context} mode="live" onSubmitted={() => context.toast("Submission recorded", "It is on the submissions screen.")} />
    </Stack>
  );
}

export function ThemeInspector({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  return <ThemeEditorImpl model={model} onChange={(theme) => void saveForm(context, record, { ...model, theme }, "Form appearance changed")} />;
}

export function AccessControlPanel({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Audience", value: model.settings.access === "link" ? "Anyone with the link" : "People in this workspace" },
        { label: "Open", value: model.settings.closed ? "No" : "Yes" },
        { label: "Retention", value: `${model.settings.retentionDays} days` },
      ]} />
      <Checkbox label="Close the form to new answers" checked={model.settings.closed}
        onChange={(event) => void saveForm(context, record, { ...model, settings: { ...model.settings, closed: event.target.checked } }, event.target.checked ? "Form closed" : "Form reopened")} />
      <Notice tone="warning" title="Role views are not account security">
        This setting shapes the interface in this browser. It is not enforced by a server, and the screen says so rather than implying otherwise.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-FORMS-006 — Form Analytics
 * ================================================================ */

export function FormAnalytics({ context, lens }: { context: ScreenContext; lens: "Funnel" | "Responses" | "Sources" | "Timing" }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  if (!record) return <NoForm />;
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const enough = children.length >= 20;
  const analyticsOverview = (
    <section className="t6-workflow-overview" aria-label="Form analytics overview">
      <Row gap={3} wrap><div className="ds-grow" style={{ minWidth: 220 }}>
        <span className="ds-subtle">FORMS / ANALYTICS</span>
        <h2 className="t6-workflow-title">Insights grounded in answers.</h2>
        <p className="ds-subtle">Understand recorded submissions and question coverage without inventing views, visits or conversion rates.</p>
      </div><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/forms/forms/${record.id}/submissions`)}>Review responses</Button></Row>
      <div className="t6-directory-metrics">
        <div><span>Responses</span><strong>{children.length}</strong></div>
        <div><span>Reviewed or routed</span><strong>{children.filter((row) => row.status !== "new").length}</strong></div>
        <div><span>Questions</span><strong>{answerable.length}</strong></div>
        <div><span>Versions answered</span><strong>{new Set(children.map((row) => String(row.fields.formVersion ?? "?"))).size}</strong></div>
      </div>
    </section>
  );

  if (lens === "Funnel") {
    return (
      <Stack gap={5}>
        {analyticsOverview}
        <StatRow>
          <Stat label="Views" value="Unavailable" unavailable meta="Nothing counts an impression" onClick={() => context.openOverlay("Metric methods")} />
          <Stat label="Starts" value="Unavailable" unavailable meta="A start needs a view to compare against" />
          <Stat prov="posted" label="Submissions" value={String(children.length)} meta="Records written in this workspace" />
          <Stat label="Completion rate" value="Unavailable" unavailable meta="A rate needs a denominator" onClick={() => context.openOverlay("Metric methods")} />
        </StatRow>
        <Notice tone="warning" title="A funnel needs a step before the submission">
          Views, starts and abandonment all require a counter on the page a person opens. Nothing is hosted and nothing is counted, so three of the four figures above are blank rather than estimated. The one that is real is the number of submissions.
        </Notice>
        <Card eyebrow="MEASURED" prov="posted" title="What is measurable" subtitle="From the records themselves">
          <Properties rows={[
            { label: "Submissions", value: String(children.length) },
            { label: "Distinct versions answered", value: String(new Set(children.map((row) => String(row.fields.formVersion ?? "?"))).size) },
            { label: "Reviewed", value: String(children.filter((row) => row.status !== "new").length) },
            { label: "Oldest", value: children.length ? context.date([...children].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))[0].at) : "None" },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (lens === "Responses") {
    const perField = answerable.map((field) => ({
      field,
      answered: children.filter((row) => String(row.fields[field.label] ?? "").trim().length > 0).length,
    }));
    return (
      <Stack gap={4}>
        {analyticsOverview}
        {children.length === 0 ? (
          <Empty title="No responses yet" icon={<Inbox size={20} />}>Answer the form on its publish screen and the counts appear here.</Empty>
        ) : (
          <>
            <Card eyebrow="RESPONSES" prov="posted" title="Answered per question" subtitle={`Out of ${children.length} submissions`}>
              <BarChart
                title="Answers per question"
                height={Math.max(180, perField.length * 28)}
                format={(value) => String(Math.round(value))}
                series={[{ name: "Answered", points: perField.map((row) => ({ label: row.field.label.slice(0, 18), value: row.answered })) }]}
                footer={enough ? undefined : `${children.length} submissions is a small sample; the counts are exact but a share drawn from them is not meaningful yet.`}
              />
            </Card>
            <DataGrid
              rows={perField}
              rowId={(row) => row.field.id}
              label="Question performance"
              columns={[
                { key: "label", header: "Question", primary: true, cell: (row) => row.field.label, filterValue: (row) => row.field.label },
                { key: "type", header: "Type", cell: (row) => FIELD_LABELS[row.field.type] },
                { key: "required", header: "Required", cell: (row) => row.field.required ? <Pill tone="warning">yes</Pill> : <span className="ds-subtle">no</span> },
                { key: "answered", header: "Answered", align: "end", cell: (row) => String(row.answered), sortValue: (row) => row.answered },
                { key: "skipped", header: "Left empty", align: "end", cell: (row) => String(children.length - row.answered) },
              ]}
              onOpen={() => context.openOverlay("field insight")}
            />
          </>
        )}
      </Stack>
    );
  }

  if (lens === "Sources") {
    return (
      <Stack gap={4}>
        {analyticsOverview}
        <Notice tone="warning" title="A source needs a referrer">
          Where a person came from is in the request headers of a hosted page. There is no hosted page, so no source is recorded and none is guessed.
        </Notice>
        <Card eyebrow="MEASURED" prov="posted" title="What the record does know" subtitle="Everything below is read from the submission itself">
          <Properties rows={[
            { label: "Created by", value: children.length ? [...new Set(children.map((row) => row.createdBy))].join(", ") : "No submissions" },
            { label: "Organisation", value: context.org.name },
            { label: "Versions answered", value: children.length ? [...new Set(children.map((row) => String(row.fields.formVersion ?? "?")))].join(", ") : "None" },
            { label: "Referrer", value: <Pill tone="warning">Unavailable</Pill> },
            { label: "Device", value: <Pill tone="warning">Unavailable</Pill> },
          ]} />
        </Card>
      </Stack>
    );
  }

  const byDay = children.reduce<Record<string, number>>((map, row) => {
    const key = (row.at ?? row.createdAt).slice(0, 10);
    map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Stack gap={4}>
      {analyticsOverview}
      {days.length === 0 ? (
        <Empty title="Nothing to time yet" icon={<Inbox size={20} />}>Submission timestamps are the only timing signal available here.</Empty>
      ) : (
        <Card eyebrow="TIMING" prov="posted" title="Submissions by day" subtitle="From the timestamp on each record">
          <BarChart
            title="Submissions by day"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Submissions", points: days.map(([day, count]) => ({ label: day.slice(5), value: count })) }]}
            footer="Time to complete is not measured: that needs a timer on the page, and no page is hosted."
          />
        </Card>
      )}
      <Notice tone="info" title="Completion time is not shown">
        A completion time needs the moment a person opened the form as well as the moment they submitted. Only the second exists here, so no duration is reported.
      </Notice>
    </Stack>
  );
}

export function MetricMethods({ context }: { context: ScreenContext }) {
  const { record } = useFormRecord(context);
  const children = useChildren(record?.id);
  return (
    <Stack gap={3}>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">How each figure is produced</caption>
          <thead><tr><th scope="col">Figure</th><th scope="col">Source</th><th scope="col">State</th></tr></thead>
          <tbody>
            <tr><td>Submissions</td><td>Submission records with this form as parent</td><td><Pill tone="success">{children.length} counted</Pill></td></tr>
            <tr><td>Answered per question</td><td>The answer stored on each record</td><td><Pill tone="success">Exact</Pill></td></tr>
            <tr><td>Views</td><td>Would need a counter on a hosted page</td><td><Pill tone="warning">Unavailable</Pill></td></tr>
            <tr><td>Abandonment</td><td>Would need a start event</td><td><Pill tone="warning">Unavailable</Pill></td></tr>
            <tr><td>Completion time</td><td>Would need an open timestamp</td><td><Pill tone="warning">Unavailable</Pill></td></tr>
            <tr><td>Source</td><td>Would need a referrer header</td><td><Pill tone="warning">Unavailable</Pill></td></tr>
          </tbody>
        </table>
      </div>
      <Notice tone="info" title="A small sample is still a small sample">
        With {children.length} submissions, differences between questions are not yet evidence. Counts are shown; shares are not drawn from them until there are at least twenty.
      </Notice>
    </Stack>
  );
}

export function FieldInsight({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const children = useChildren(record?.id);
  if (!record) return <NoForm />;
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  const worst = [...answerable]
    .map((field) => ({ field, empty: children.filter((row) => !String(row.fields[field.label] ?? "").trim()).length }))
    .sort((a, b) => b.empty - a.empty)[0];
  return (
    <Stack gap={3}>
      {children.length === 0 ? (
        <Notice tone="neutral" title="No submissions to learn from">There is nothing to compare until the form has been answered.</Notice>
      ) : worst && worst.empty > 0 ? (
        <>
          <Properties rows={[
            { label: "Question", value: worst.field.label },
            { label: "Left empty", value: `${worst.empty} of ${children.length}` },
            { label: "Required", value: worst.field.required ? "Yes" : "No" },
            { label: "Has help text", value: worst.field.help ? "Yes" : "No" },
          ]} />
          <Notice tone={children.length >= 20 ? "warning" : "info"} title={children.length >= 20 ? "Worth changing" : "Not enough answers to act on"}>
            {children.length >= 20
              ? `${worst.field.label} is left empty more than any other question. If it is not needed, making it optional or adding help text is the usual fix.`
              : `With ${children.length} submissions this is an observation, not a finding. The count is exact; the conclusion would not be.`}
          </Notice>
        </>
      ) : (
        <Notice tone="success" title="Every question is being answered">No question stands out as skipped.</Notice>
      )}
    </Stack>
  );
}

export function ShareDialog({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  const link = `/o/${context.org.slug}/forms/forms/${record.id}/publish`;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Form", value: record.title },
        { label: "State", value: <Pill tone={record.status === "live" ? "success" : "neutral"}>{record.status}</Pill> },
        { label: "Version", value: String(model.settings.version) },
        { label: "Address in this workspace", value: <code>{link}</code> },
      ]} />
      <Row gap={2}>
        <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => {
          void navigator.clipboard?.writeText(`${window.location.origin}${link}`).catch(() => undefined);
          context.toast("Address copied", "It opens the form inside this workspace, in this browser.");
        }}>Copy the address</Button>
        <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => context.navigate(`${link}?tab=Embed`)}>Open it</Button>
      </Row>
      <Notice tone="warning" title="This address is local">
        It works in this browser against this workspace. There is no public form on the internet, because nothing is hosted.
      </Notice>
      <Row gap={2}><ShieldAlert size={15} aria-hidden="true" /><span className="ds-subtle">Sending the address to someone else does not give them the answers; the records live here.</span></Row>
    </Stack>
  );
}
