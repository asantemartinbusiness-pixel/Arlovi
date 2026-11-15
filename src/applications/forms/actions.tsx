import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Empty, Field, Notice, Pill, Properties, Select, Stack } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useChildren } from "@/platform/workspace";
import { actOverlay, peopleOptions, type ActInput } from "@/applications/t6kit/act";
import { downloadCsv } from "@/applications/t6kit/kit";
import {
  FIELD_LABELS, FIELD_TYPES, STRUCTURAL, logicIssues, makeField, readForm,
  type FieldType, type FormModel, type LogicRule,
} from "./model";
import { NoForm, useFormRecord } from "./builder";
import { saveForm, useFormsUi } from "./state";

/* ====================================================================== *
 * FORMS contract actions. Model writes go through saveForm (expectRevision);
 * submission writes patch the submission record. No figure is invented:
 * comparisons and experiments count submission records and nothing else.
 * ====================================================================== */

const nowIso = (context: ScreenContext) => context.now.toISOString();
const routeForm = (records: Rec[], context: ScreenContext) => {
  const routed = records.find((row) => row.id === context.params.id);
  return routed ? [routed] : records.filter((row) => row.status !== "archived");
};
const form = (record?: Rec): FormModel => readForm(record);
const answerable = (model: FormModel) => model.fields.filter((field) => !STRUCTURAL.includes(field.type));

/* ------------------------------ Builder ------------------------------ */

export const insertField = actOverlay({
  id: "insert field",
  title: "Insert a field",
  collection: "forms",
  noun: "form",
  candidates: routeForm,
  consequence: () => "The field is written into the form at the position you choose: the same write as dragging it from the palette, made with the keyboard or a single pointer. It is validated with the rest of the form from the next answer.",
  fields: () => [
    { name: "type", label: "Field type", kind: "select", options: FIELD_TYPES.map((type) => ({ value: type, label: FIELD_LABELS[type] })) },
    { name: "label", label: "Question", required: true, placeholder: "What is your postcode?" },
    { name: "position", label: "Where", kind: "select", options: [
      { value: "after", label: "After the selected field" }, { value: "end", label: "At the end" }, { value: "start", label: "At the start" },
    ] },
    { name: "required", label: "Required", kind: "checkbox" },
  ],
  submit: "Insert",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const model = form(record);
    const field = { ...makeField(values.type as FieldType), label: values.label, required: Boolean(values.required) };
    const selected = model.fields.findIndex((item) => item.id === useFormsUi.getState().selectedFieldId);
    const index = values.position === "start" ? 0 : values.position === "after" && selected >= 0 ? selected + 1 : model.fields.length;
    const fields = [...model.fields];
    fields.splice(index, 0, field);
    await saveForm(context, record, { ...model, fields }, `${FIELD_LABELS[field.type]} field ${field.label} inserted at position ${index + 1}`);
    useFormsUi.getState().select(field.id);
    context.setTab("Build");
    return `${field.label} is at position ${index + 1}.`;
  },
});

export const moveField = actOverlay({
  id: "move field",
  title: "Reorder a field",
  collection: "forms",
  noun: "form",
  candidates: routeForm,
  useWatch: () => useFormsUi((state) => state.selectedFieldId),
  consequence: () => "Moves a field to a new position: the keyboard and single-pointer equivalent of dragging its grip. A rule that depends on a later question is flagged afterwards.",
  fields: ({ record }) => {
    const model = form(record);
    const selected = useFormsUi.getState().selectedFieldId;
    return [
      { name: "field", label: "Field", kind: "select", initial: selected || model.fields[0]?.id, options: model.fields.map((field, index) => ({ value: field.id, label: `${index + 1}. ${field.label}` })) },
      { name: "to", label: "Move to position", kind: "select", options: model.fields.map((_, index) => ({ value: String(index), label: String(index + 1) })) },
    ];
  },
  blocked: ({ record }) => (record && form(record).fields.length < 2 ? "A form needs two fields before there is an order to change." : undefined),
  submit: "Move it",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const model = form(record);
    const from = model.fields.findIndex((field) => field.id === values.field);
    const to = Number(values.to);
    if (from < 0) throw new Error("Choose a field.");
    if (from === to) return { body: "It is already there.", tone: "info" };
    const fields = [...model.fields];
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    await saveForm(context, record, { ...model, fields }, `${moved.label} moved from ${from + 1} to ${to + 1}`);
    return `${moved.label} is now question ${to + 1}.`;
  },
});

/* ------------------------------ Logic ------------------------------ */

export const connectRule = actOverlay({
  id: "connect rule",
  title: "Connect a condition",
  collection: "forms",
  noun: "form",
  candidates: routeForm,
  consequence: () => "Wires a rule: the question it reads and the question it governs. A rule cannot read the field it governs, and the branch check runs again as soon as it is saved.",
  fields: ({ record, context }) => {
    const model = form(record);
    const payload = context.overlayPayload as { ruleId?: string } | undefined;
    const label = (id: string) => model.fields.find((field) => field.id === id)?.label ?? "a missing field";
    return [
      { name: "rule", label: "Rule", kind: "select", initial: payload?.ruleId, options: model.logic.map((rule) => ({ value: rule.id, label: `${rule.action} ${label(rule.targetId)} when ${label(rule.whenFieldId)} ${rule.operator} ${rule.value}` })) },
      { name: "when", label: "Read the answer to", kind: "select", options: answerable(model).map((field) => ({ value: field.id, label: field.label })) },
      { name: "target", label: "To govern", kind: "select", options: answerable(model).map((field) => ({ value: field.id, label: field.label })) },
    ];
  },
  blocked: ({ record }) => (record && form(record).logic.length === 0 ? "Create a condition first; then connect it." : undefined),
  submit: "Connect",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    if (values.when === values.target) throw new Error("A field cannot decide its own visibility. Choose two different questions.");
    const model = form(record);
    const logic: LogicRule[] = model.logic.map((rule) => (rule.id === values.rule ? { ...rule, whenFieldId: values.when, targetId: values.target } : rule));
    const next = { ...model, logic };
    const remaining = logicIssues(next).filter((issue) => issue.id.endsWith(values.rule) && issue.level === "fail");
    await saveForm(context, record, next, `Rule ${values.rule} connected`);
    return remaining.length ? { body: `Connected, but ${remaining[0].title.toLowerCase()}.`, tone: "blocked" } : "Connected. The branch check passes for this rule.";
  },
});

interface LogicFix { id: string; label: string; apply: (model: FormModel) => FormModel }

export function logicFixes(model: FormModel): LogicFix[] {
  const fixes: LogicFix[] = [];
  for (const issue of logicIssues(model)) {
    const ruleId = issue.id.replace(/^(dangling-target|dangling-source|self|badoption|novalue|order)-/, "");
    const rule = model.logic.find((item) => item.id === ruleId);
    if (issue.id.startsWith("dangling") || issue.id.startsWith("self-")) {
      fixes.push({ id: `remove-${ruleId}-${issue.id}`, label: `Remove the broken rule: ${issue.title.toLowerCase()}`, apply: (current) => ({ ...current, logic: current.logic.filter((item) => item.id !== ruleId) }) });
    } else if (issue.id.startsWith("badoption-") && rule) {
      const source = model.fields.find((field) => field.id === rule.whenFieldId);
      if (source?.options[0]) fixes.push({ id: `option-${ruleId}`, label: `Compare against "${source.options[0]}", an option ${source.label} actually has`, apply: (current) => ({ ...current, logic: current.logic.map((item) => (item.id === ruleId ? { ...item, value: source.options[0] } : item)) }) });
    } else if (issue.id.startsWith("order-") && rule) {
      fixes.push({
        id: `order-${ruleId}`, label: `Move the question this rule reads above the one it governs`,
        apply: (current) => {
          const fields = [...current.fields];
          const from = fields.findIndex((field) => field.id === rule.whenFieldId);
          const target = fields.findIndex((field) => field.id === rule.targetId);
          if (from < 0 || target < 0) return current;
          const [moved] = fields.splice(from, 1);
          fields.splice(target, 0, moved);
          return { ...current, fields };
        },
      });
    } else if (issue.id.startsWith("hidden-required-") && issue.level === "fail") {
      const fieldId = issue.id.replace("hidden-required-", "");
      fixes.push({ id: `optional-${fieldId}`, label: `${issue.title.replace(" is required but hidden at the start", "")}: make it optional, since no rule can show it`, apply: (current) => ({ ...current, fields: current.fields.map((field) => (field.id === fieldId ? { ...field, required: false } : field)) }) });
    }
  }
  return fixes;
}

export const fixLogic = actOverlay({
  id: "fix logic",
  title: "Fix a logic problem",
  collection: "forms",
  noun: "form",
  candidates: routeForm,
  consequence: () => "Each fix is computed from the branch check and changes one thing: removes a rule that points nowhere, corrects a value to a real option, moves a question, or makes an unreachable required question optional so it cannot block a submission.",
  Details: ({ record }: ActInput) => {
    const issues = logicIssues(form(record));
    return <Properties rows={[{ label: "Problems now", value: <Pill tone={issues.some((issue) => issue.level === "fail") ? "danger" : issues.length ? "warning" : "success"}>{issues.length}</Pill> }]} />;
  },
  blocked: ({ record }) => (record && logicFixes(form(record)).length === 0 ? "No problem has a fix that can be computed. The branch check may pass, or the remaining problems need a decision." : undefined),
  fields: ({ record }) => [{ name: "fix", label: "Fix", kind: "select", options: logicFixes(form(record)).map((fix) => ({ value: fix.id, label: fix.label })) }],
  submit: "Apply the fix",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const model = form(record);
    const fix = logicFixes(model).find((item) => item.id === values.fix);
    if (!fix) throw new Error("That fix no longer applies.");
    const next = fix.apply(model);
    await saveForm(context, record, next, `Logic fix applied: ${fix.label}`);
    return `${fix.label}. ${logicIssues(model).length} → ${logicIssues(next).length} problems.`;
  },
});

/* ------------------------------ Submissions ------------------------------ */

const submissionsOf = (records: Rec[], context: ScreenContext) => records.filter((row) => !context.params.id || row.parentId === context.params.id);

export const assignSubmission = actOverlay({
  id: "assign submission",
  title: "Assign a submission",
  collection: "submissions",
  noun: "submission",
  candidates: submissionsOf,
  optionLabel: (row) => `${row.title} · ${row.status}${row.fields.assignee ? ` · ${String(row.fields.assignee)}` : ""}`,
  consequence: () => "The submission gets a named owner and moves to Routed. Nothing is forwarded by email; the owner sees it in this workspace.",
  fields: ({ record, people }) => [
    { name: "assignee", label: "Owner", kind: "select", options: peopleOptions(people), initial: String(record?.fields.assignee ?? "") },
    { name: "note", label: "Note for them", kind: "textarea" },
  ],
  submit: "Assign",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const saved = await context.mutate.patch(record.id, { status: "routed", ownerName: values.assignee, fields: { ...record.fields, assignee: values.assignee, assignedAt: nowIso(context), ...(values.note ? { assignNote: values.note } : {}) } }, { expectRevision: record.revision, event: `Submission ${record.title} assigned to ${values.assignee} by ${context.actor}` });
    return saved ? `${values.assignee} owns ${record.title}.` : undefined;
  },
});

export async function exportSubmissions(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const forms = await repo.listByCollection(context.org.id, "forms");
  const record = forms.find((item) => item.id === context.params.id) ?? forms[0];
  if (!record) return;
  const model = readForm(record);
  const rows = (await repo.listByCollection(context.org.id, "submissions")).filter((row) => row.parentId === record.id);
  const labels = answerable(model).map((field) => field.label);
  const sensitive = model.fields.filter((field) => field.sensitive).map((field) => field.label);
  downloadCsv(`${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv`, ["received", "from", "version", "state", ...labels],
    rows.map((row) => [row.at ?? row.createdAt, row.title, row.fields.formVersion ?? "", row.status, ...labels.map((label) => (sensitive.includes(label) ? "[redacted]" : String(row.fields[label] ?? "")))]));
  await context.mutate.log(`${rows.length} submissions exported to CSV${sensitive.length ? " with sensitive answers redacted" : ""}`, { entityId: record.id, type: "export" });
  context.toast("Exported", `${rows.length} submissions written to CSV${sensitive.length ? `; ${sensitive.join(", ")} redacted` : ""}.`);
}

/* ------------------------------ Analytics ------------------------------ */

function versionStats(model: FormModel, rows: Rec[]) {
  const versions = [...new Set(rows.map((row) => String(row.fields.formVersion ?? "unrecorded")))].sort();
  return versions.map((version) => {
    const subset = rows.filter((row) => String(row.fields.formVersion ?? "unrecorded") === version);
    return {
      version,
      count: subset.length,
      perQuestion: answerable(model).map((field) => ({ label: field.label, answered: subset.filter((row) => String(row.fields[field.label] ?? "").trim()).length })),
    };
  });
}

export function CompareVersions({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const rows = useChildren(record?.id);
  const stats = versionStats(model, rows);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  if (!record) return <NoForm />;
  if (stats.length < 2) {
    return (
      <Stack gap={3}>
        <Empty title="Nothing to compare yet" icon={<BarChart3 size={20} />}>{`${rows.length} submissions, all answering ${stats[0] ? `version ${stats[0].version}` : "no version"}. A comparison needs submissions to two published versions.`}</Empty>
        <Notice tone="info" title="No figure is invented">Publishing a new version and collecting answers to it is what makes a comparison possible.</Notice>
      </Stack>
    );
  }
  const a = stats.find((item) => item.version === left) ?? stats[stats.length - 2];
  const b = stats.find((item) => item.version === right) ?? stats[stats.length - 1];
  const small = a.count < 20 || b.count < 20;
  return (
    <Stack gap={3}>
      <Field label="Version A" htmlFor="cmp-va"><Select id="cmp-va" value={a.version} onChange={(event) => setLeft(event.target.value)}>{stats.map((item) => <option key={item.version} value={item.version}>v{item.version} · {item.count}</option>)}</Select></Field>
      <Field label="Version B" htmlFor="cmp-vb"><Select id="cmp-vb" value={b.version} onChange={(event) => setRight(event.target.value)}>{stats.map((item) => <option key={item.version} value={item.version}>v{item.version} · {item.count}</option>)}</Select></Field>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">Answers per question by version</caption>
          <thead><tr><th scope="col">Question</th><th scope="col">{`v${a.version} (${a.count})`}</th><th scope="col">{`v${b.version} (${b.count})`}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Submissions</th><td>{a.count}</td><td>{b.count}</td></tr>
            {a.perQuestion.map((question, index) => <tr key={question.label}><th scope="row">{question.label}</th><td>{`${question.answered} answered`}</td><td>{`${b.perQuestion[index]?.answered ?? 0} answered`}</td></tr>)}
          </tbody>
        </table>
      </div>
      <Notice tone={small ? "warning" : "info"} title={small ? "Too few answers to call a difference" : "Counted from the records"}>
        {small ? "At least one version has fewer than twenty submissions. The counts are exact; a conclusion drawn from them would not be." : "Every figure is a count of submission records. Views and completion rates are not shown because nothing counts them."}
      </Notice>
    </Stack>
  );
}

export async function exportAnalytics(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const forms = await repo.listByCollection(context.org.id, "forms");
  const record = forms.find((item) => item.id === context.params.id) ?? forms[0];
  if (!record) return;
  const model = readForm(record);
  const rows = (await repo.listByCollection(context.org.id, "submissions")).filter((row) => row.parentId === record.id);
  const stats = versionStats(model, rows);
  downloadCsv(`${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-analytics.csv`, ["version", "question", "answered", "submissions", "views"],
    stats.flatMap((item) => item.perQuestion.map((question) => [item.version, question.label, question.answered, item.count, "unavailable"])));
  await context.mutate.log(`Form analytics exported for ${record.title}: ${rows.length} submissions across ${stats.length} versions.`, { entityId: record.id, type: "export" });
  context.toast("Exported", "Counts per question and version written to CSV. Views are marked unavailable.");
}

export const createExperiment = actOverlay({
  id: "create experiment",
  title: "Create an experiment",
  collection: "forms",
  noun: "form",
  candidates: (records, context) => routeForm(records, context).filter((row) => !row.fields.experimentOf),
  consequence: ({ record }) => `A variant B of ${record?.title ?? "the form"} is created as a draft copy, linked to the original as arm A. Results are counted from the submissions each arm receives; nothing is split or estimated for you. Routing visitors between arms needs a hosted page, so each arm is shared separately.`,
  fields: () => [
    { name: "hypothesis", label: "What you expect to change", kind: "textarea", required: true, placeholder: "Making the postcode optional raises completed submissions" },
    { name: "minimum", label: "Submissions per arm before reading it", kind: "number", initial: "20", required: true },
  ],
  blocked: ({ record }) => (record?.fields.experimentId ? "This form already has an experiment running." : undefined),
  submit: "Create variant B",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const model = form(record);
    const variant = await context.mutate.create({
      collection: "forms", title: `${record.title} · variant B`, status: "draft", summary: `Experiment arm B: ${values.hypothesis}`,
      fields: { experimentOf: record.id, arm: "B", hypothesis: values.hypothesis, minimum: Number(values.minimum) },
      body: { ...model, settings: { ...model.settings, version: 1, closed: false } },
    }, `Experiment created on ${record.title}: ${values.hypothesis}`);
    await context.mutate.patch(record.id, { fields: { ...record.fields, experimentId: variant.id, arm: "A", hypothesis: values.hypothesis, minimum: Number(values.minimum), experimentStartedAt: nowIso(context) } }, { expectRevision: record.revision, event: `${record.title} is arm A of an experiment with ${variant.title}` });
    return `${variant.title} is a draft. Edit it, publish it, then read the test report once each arm has ${values.minimum} submissions.`;
  },
});

export function ExperimentReport({ context }: { context: ScreenContext }) {
  const { record, forms } = useFormRecord(context);
  const armA = record?.fields.experimentOf ? forms.find((item) => item.id === String(record.fields.experimentOf)) : record;
  const armB = armA ? forms.find((item) => item.id === String(armA.fields.experimentId ?? "")) : undefined;
  const rowsA = useChildren(armA?.id);
  const rowsB = useChildren(armB?.id);
  if (!record) return <NoForm />;
  if (!armA || !armB) {
    return <Empty title="No experiment on this form" icon={<BarChart3 size={20} />}>Create an experiment and its report appears here, counted from each arm's submissions.</Empty>;
  }
  const minimum = Number(armA.fields.minimum ?? 20);
  const ready = rowsA.length >= minimum && rowsB.length >= minimum;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Hypothesis", value: String(armA.fields.hypothesis ?? "") },
        { label: `Arm A · ${armA.title}`, value: <span className="ds-num">{`${rowsA.length} submissions`}</span> },
        { label: `Arm B · ${armB.title}`, value: <span className="ds-num">{`${rowsB.length} submissions`}</span> },
        { label: "Minimum per arm", value: <span className="ds-num">{String(minimum)}</span> },
        { label: "Readable", value: ready ? <Pill tone="success">yes</Pill> : <Pill tone="warning">not yet</Pill> },
      ]} />
      <Notice tone={ready ? "info" : "warning"} title={ready ? "Sample size reached" : "Sample size not reached"}>
        {ready ? "Both arms have enough submissions to compare counts. No completion rate is shown, because nothing counts views." : `Each arm needs ${minimum} submissions before a difference means anything. Until then the counts are shown and no winner is named.`}
      </Notice>
    </Stack>
  );
}
