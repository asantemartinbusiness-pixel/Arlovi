import { BarChart3, ClipboardList, Inbox, Send, SlidersHorizontal, Workflow } from "lucide-react";
import { Empty, Field, KeyValueList, Notice, Pill, Stack, TextInput } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import { closeFooter, submitFooter } from "@/applications/t6kit/kit";
import { STRUCTURAL, readForm } from "./model";
import { FieldInspector, FormBuilder, NoForm, useFormRecord } from "./builder";
import {
  AccessControlPanel, EmbedTester, FieldInsight, FormAnalytics, FormsDirectory, InvalidPathPanel,
  LogicScreen, MetricMethods, NewFormDialog, PrivacyControl, PublishReviewForm, PublishScreen,
  RouteRetry, RuleEditorForm, ScenarioTester, ShareDialog, SubmissionDrawer, SubmissionsScreen,
  ThemeInspector,
} from "./panels";
import { saveForm, useFormsUi } from "./state";
import { formRecordHeader } from "./recordHeads";
import { openAct } from "@/applications/t6kit/act";
import {
  CompareVersions, ExperimentReport, assignSubmission, connectRule, createExperiment, exportAnalytics, exportSubmissions,
  fixLogic, insertField, moveField,
} from "./actions";

/* ====================================================================== *
 * FORMS — Forms & Data Collection
 * A form is a typed list of questions with validation and rules. The same
 * runtime draws the preview, the embed test and the live form, so what is
 * designed is what is answered and what is answered becomes a record.
 * ====================================================================== */

function FieldInspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  const selectedId = useFormsUi((state) => state.selectedFieldId);
  if (!record) return <NoForm />;
  const field = model.fields.find((item) => item.id === selectedId);
  if (!field) return <Empty title="No field is selected" icon={<ClipboardList size={20} />}>Select a field in the builder, then open this inspector.</Empty>;
  return (
    <FieldInspector
      field={field}
      model={model}
      onEdit={(patch) => void saveForm(context, record, { ...model, fields: model.fields.map((item) => (item.id === field.id ? { ...item, ...patch } : item)) }, `Edited ${field.label}`)}
      onLogic={(logic, label) => void saveForm(context, record, { ...model, logic }, label)}
    />
  );
}

function ValidationOverlay({ context }: { context: ScreenContext }) {
  const { record, model } = useFormRecord(context);
  if (!record) return <NoForm />;
  const answerable = model.fields.filter((field) => !STRUCTURAL.includes(field.type));
  return (
    <Stack gap={3}>
      <p className="ds-prose">Every rule below is checked before a submission record is written, and a field hidden by conditional logic is skipped entirely.</p>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">Validation rules on this form</caption>
          <thead><tr><th scope="col">Question</th><th scope="col">Required</th><th scope="col">Rules</th></tr></thead>
          <tbody>
            {answerable.map((field) => {
              const rules = [
                field.minLength > 0 ? `at least ${field.minLength} characters` : "",
                field.maxLength > 0 ? `at most ${field.maxLength} characters` : "",
                field.pattern ? `${field.pattern} shape` : "",
                field.min !== 0 ? `no less than ${field.min}` : "",
                field.max !== 0 ? `no more than ${field.max}` : "",
                field.options.length ? `one of ${field.options.length} options` : "",
              ].filter(Boolean);
              return (
                <tr key={field.id}>
                  <td>{field.label}</td>
                  <td>{field.required ? <Pill tone="warning">required</Pill> : <span className="ds-subtle">optional</span>}</td>
                  <td>{rules.length ? rules.join(", ") : <span className="ds-subtle">none</span>}</td>
                </tr>
              );
            })}
            {answerable.length === 0 && <tr><td colSpan={3}>No answerable questions yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Notice tone="info" title="Checked in one place">
        The builder preview, the embed test and the live form all call the same validation function, so a rule cannot pass in one and fail in another.
      </Notice>
    </Stack>
  );
}

function DuplicateConfirm({ context, close }: { context: ScreenContext; close: () => void }) {
  const forms = useCollection("forms");
  const submissions = useCollection("submissions");
  const source = forms.find((item) => item.id === context.selectedId) ?? forms[0];
  if (!source) return <Empty title="No form selected" icon={<ClipboardList size={20} />} />;
  const model = readForm(source);
  const count = submissions.filter((item) => item.parentId === source.id).length;
  return (
    <form
      id="duplicate-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const created = await context.mutate.create({
          collection: "forms",
          title: String(data.get("title") ?? `${source.title} copy`),
          status: "draft",
          summary: source.summary,
          body: { ...model, settings: { ...model.settings, version: 1, closed: false } },
        }, `Form ${source.title} duplicated`);
        context.toast("Form duplicated", `${created.title} is a draft at version 1 with no submissions.`);
        close();
        context.navigate(`/o/${context.org.slug}/forms/forms/${created.id}`);
      }}
    >
      <Field label="Name of the copy" required><TextInput name="title" defaultValue={`${source.title} copy`} required /></Field>
      <KeyValueList items={[
        { label: "Questions copied", value: String(model.fields.length) },
        { label: "Rules copied", value: String(model.logic.length) },
        { label: "Submissions copied", value: "None" },
        { label: "Version", value: "Starts again at 1" },
      ]} />
      <Notice tone="warning" title={`${count} submissions stay with the original`}>
        Answers belong to the form they were given to. Copying the questions never copies the answers, so a version number always means one thing.
      </Notice>
    </form>
  );
}

export const formsApp = registerApp({
  code: "FORMS",
  short: "Forms",
  name: "Forms & Data Collection",
  purpose: "Design a form, test its rules, collect real answers",
  icon: ClipboardList,
  nav: [
    { items: [{ label: "All forms", screenId: "ARL-FORMS-001", icon: ClipboardList }] },
    {
      label: "This form", items: [
        { label: "Builder", screenId: "ARL-FORMS-002", icon: SlidersHorizontal },
        { label: "Logic", screenId: "ARL-FORMS-003", icon: Workflow },
        { label: "Submissions", screenId: "ARL-FORMS-004", icon: Inbox },
        { label: "Design & publish", screenId: "ARL-FORMS-005", icon: Send },
        { label: "Analytics", screenId: "ARL-FORMS-006", icon: BarChart3 },
      ],
    },
  ],
  screens: {
    "ARL-FORMS-001": {
      id: "ARL-FORMS-001",
      subtitle: (context) => `Forms in ${context.org.name}. Answers become records here and go nowhere else.`,
      tabs: (["All", "Draft", "Live", "Templates"] as const).map((scope) => ({
        id: scope,
        render: (context: ScreenContext) => <FormsDirectory context={context} scope={scope} />,
      })),
      actions: [
        { id: "Create", label: "New form", placement: "primary", run: (context) => context.openOverlay("New form") },
        {
          id: "review responses", label: "Review responses", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select a form first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/forms/forms/${context.selectedId}/submissions`),
        },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a form first"),
          run: (context) => context.openOverlay("duplicate confirm"),
        },
        {
          id: "archive", label: "Archive", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a form first"),
          run: async (context) => {
            await context.mutate.patch(context.selectedId!, { status: "archived" }, { event: "Form archived" });
            context.toast("Form archived", "Its submissions are kept and stay readable.");
          },
        },
      ],
      overlays: [
        { id: "New form", kind: "modal", title: "New form", width: 600, render: ({ close, ...context }) => <NewFormDialog context={context} close={close} />, footer: submitFooter("new-form", "Create the form") },
        { id: "duplicate confirm", kind: "modal", title: "Duplicate this form", width: 520, render: ({ close, ...context }) => <DuplicateConfirm context={context} close={close} />, footer: submitFooter("duplicate-form", "Make the copy") },
        { id: "share", kind: "drawer", title: "Share", width: 480, render: ({ ...context }) => <ShareDialog context={context} /> },
      ],
    },

    "ARL-FORMS-002": {
      id: "ARL-FORMS-002",
      chrome: "full",
      surface: (context) => <FormBuilder context={context} />,
      tabs: ["Build", "Logic", "Design", "Settings", "Preview"].map((id) => ({
        id,
        render: (context: ScreenContext) => <FormBuilder context={context} />,
      })),
      actions: [
        { id: "Insert field", label: "Insert a field", placement: "primary", run: (context) => context.openOverlay("insert field") },
        {
          id: "change type", label: "Change the field type", placement: "secondary",
          guard: () => (useFormsUi.getState().selectedFieldId ? undefined : "Select a field first"),
          run: (context) => context.openOverlay("Field inspector"),
        },
        { id: "reorder", label: "Reorder a field", placement: "overflow", run: (context) => context.openOverlay("move field") },
        { id: "publish", label: "Publish", placement: "overflow", run: (context) => context.openOverlay("publish review") },
      ],
      overlays: [
        { id: "Field inspector", kind: "drawer", title: "Field", width: 460, render: ({ ...context }) => <FieldInspectorOverlay context={context} /> },
        { id: "validation", kind: "modal", title: "Validation on this form", width: 620, render: ({ ...context }) => <ValidationOverlay context={context} />, footer: closeFooter() },
        { id: "publish review", kind: "modal", title: "Publish review", width: 600, render: ({ close, ...context }) => <PublishReviewForm context={context} close={close} /> },
        insertField, moveField,
      ],
    },

    "ARL-FORMS-003": {
      id: "ARL-FORMS-003",
      title: () => "Conditional logic",
      record: formRecordHeader,
      tabs: (["Rules", "Preview", "Test", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LogicScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create condition", label: "Create a condition", placement: "primary", run: (context) => context.openOverlay("Rule editor") },
        { id: "test", label: "Test a scenario", placement: "secondary", run: (context) => context.setTab("Test") },
        { id: "connect", label: "Connect a condition", placement: "overflow", run: (context) => context.openOverlay("connect rule") },
        { id: "fix", label: "Fix a logic problem", placement: "overflow", run: (context) => context.openOverlay("fix logic") },
        { id: "check branches", label: "Check the branches", placement: "overflow", run: (context) => context.openOverlay("invalid path") },
        { id: "scenario tester", label: "Scenario tester", placement: "overflow", run: (context) => context.openOverlay("scenario tester") },
      ],
      overlays: [
        { id: "Rule editor", kind: "modal", title: "Rule", width: 600, render: ({ close, ...context }) => <RuleEditorForm context={context} close={close} />, footer: submitFooter("rule-editor", "Save rule") },
        { id: "invalid path", kind: "drawer", title: "Branch check", width: 520, render: ({ ...context }) => <InvalidPathPanel context={context} /> },
        { id: "scenario tester", kind: "drawer", title: "Scenario", width: 480, render: ({ ...context }) => <ScenarioTester context={context} /> },
        connectRule, fixLogic,
      ],
    },

    "ARL-FORMS-004": {
      id: "ARL-FORMS-004",
      title: () => "Submissions",
      record: formRecordHeader,
      tabs: (["All", "New", "Reviewed", "Routed"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SubmissionsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Inspect", label: "Inspect", placement: "primary", guard: (context) => context.selectedId ? undefined : "Select a submission first", run: (context) => context.openOverlay("Submission drawer", { id: context.selectedId }) },
        { id: "export", label: "Export CSV", placement: "secondary", capability: "export_data", run: (context) => exportSubmissions(context) },
        { id: "assign", label: "Assign", placement: "overflow", run: openAct("assign submission") },
        { id: "delete under policy", label: "Delete under the retention policy", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("privacy control") },
        { id: "routing", label: "Notification routing", placement: "overflow", run: (context) => context.openOverlay("route retry") },
      ],
      overlays: [
        { id: "Submission drawer", kind: "drawer", title: "Submission", width: 520, render: ({ ...context }) => <SubmissionDrawer context={context} /> },
        { id: "privacy control", kind: "modal", title: "Retention and privacy", tone: "danger", width: 560, render: ({ ...context }) => <PrivacyControl context={context} />, footer: closeFooter() },
        { id: "route retry", kind: "modal", title: "Routing", width: 520, render: ({ ...context }) => <RouteRetry context={context} />, footer: closeFooter() },
        assignSubmission,
      ],
    },

    "ARL-FORMS-005": {
      id: "ARL-FORMS-005",
      title: () => "Design & publish",
      record: formRecordHeader,
      tabs: (["Design", "Embed", "Access", "Analytics"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PublishScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "publish", label: "Publish a version", placement: "primary", run: (context) => context.openOverlay("publish review") },
        { id: "generate link", label: "Generate a link", placement: "secondary", run: (context) => context.openOverlay("share") },
        { id: "Style", label: "Style the form", placement: "overflow", run: (context) => context.openOverlay("Theme inspector") },
        { id: "preview", label: "Preview the embed", placement: "overflow", run: (context) => context.openOverlay("embed tester") },
      ],
      overlays: [
        { id: "Theme inspector", kind: "drawer", title: "Appearance", width: 420, render: ({ ...context }) => <ThemeInspector context={context} /> },
        { id: "access control", kind: "modal", title: "Who can answer", width: 520, render: ({ ...context }) => <AccessControlPanel context={context} />, footer: closeFooter() },
        { id: "embed tester", kind: "drawer", title: "Embed test", width: 560, render: ({ ...context }) => <EmbedTester context={context} /> },
        { id: "publish review", kind: "modal", title: "Publish review", width: 600, render: ({ close, ...context }) => <PublishReviewForm context={context} close={close} /> },
        { id: "share", kind: "drawer", title: "Share", width: 480, render: ({ ...context }) => <ShareDialog context={context} /> },
      ],
    },

    "ARL-FORMS-006": {
      id: "ARL-FORMS-006",
      title: () => "Form analytics",
      record: formRecordHeader,
      tabs: (["Funnel", "Responses", "Sources", "Timing"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <FormAnalytics context={context} lens={lens} />,
      })),
      actions: [
        { id: "Compare", label: "Compare versions", placement: "primary", run: (context) => context.openOverlay("compare versions") },
        { id: "export", label: "Export", placement: "secondary", capability: "export_data", run: (context) => exportAnalytics(context) },
        { id: "create experiment", label: "Create an experiment", placement: "overflow", run: (context) => context.openOverlay("create experiment") },
        { id: "methods", label: "How each figure is made", placement: "overflow", run: (context) => context.openOverlay("Metric methods") },
        { id: "test report", label: "Experiment report", placement: "overflow", run: (context) => context.openOverlay("test report") },
        { id: "field insight", label: "Field insight", placement: "overflow", run: (context) => context.openOverlay("field insight") },
      ],
      overlays: [
        { id: "Metric methods", kind: "modal", title: "How each figure is made", width: 640, render: ({ ...context }) => <MetricMethods context={context} />, footer: closeFooter() },
        { id: "test report", kind: "drawer", title: "Experiment report", width: 520, render: ({ ...context }) => <ExperimentReport context={context} /> },
        { id: "compare versions", kind: "modal", title: "Compare versions", width: 640, render: ({ ...context }) => <CompareVersions context={context} />, footer: closeFooter() },
        createExperiment,
        { id: "field insight", kind: "drawer", title: "Field insight", width: 480, render: ({ ...context }) => <FieldInsight context={context} /> },
      ],
    },
  },
});
