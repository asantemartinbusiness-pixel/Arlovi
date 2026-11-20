import { Activity, Database, GitMerge, LayoutDashboard, LineChart, Ruler, Send, Sparkles } from "lucide-react";
import { Button, Notice, OVERLAY_WIDTH, OverlayActions, Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import { knownRecord } from "@/platform/repo";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { db } from "@/platform/workspace";
import {
  DashboardDirectory, DashboardEditor, DashboardSetup, QueryEditor, SharingPanel,
  SourceDependencyOverlay, WidgetChooser, readDashboard,
} from "./dashboards";
import {
  CreateReport, Distribution, DeliveryMethod, FailureDetail, RecipientPreview, ReportBlockOverlay,
  ReportBuilder, ScheduleOverlay, SourceInspection, checkBlocks, readReport,
} from "./reports";
import {
  DataModelling, DatasetCatalogue, DatasetDetails, DatasetSummary, DocumentDataset, FormulaEditor, GrantReview,
  ImpactReview, JoinProperties, MetricDefinitionInspector, MetricDefinitions, MetricQA, ModelTest, QualityPanel, TransformEditor,
} from "./catalogue";
import {
  AssumptionInspector, ConfidenceNote, DataFreshness, DelegateInvestigation, ForecastScreen,
  InsightDetail, InsightsOverview, MetricInspector, QuestionComposer, SaveView, ScenarioEditor,
} from "./overview";
import { ANALYTICS_COLLECTIONS, allMeasures, dimensionById, formatMeasure, measureById, runQuery, type QueryContext } from "./metrics";
import { exploreCsvCell } from "./explore";
import {
  AdjustInputs, CiteFigures, CompareMeasures, CompareScenarios, DeployModel, GrantDataset, RefreshDataset, RefreshModel,
  ResizeTile, SetFilter, TestMeasure, ValidateModel,
} from "./actions";
import { gateScreens } from "./ready";
import "./analytics.css";

/* ====================================================================== *
 * ANALYTICS — Analytics, BI & Reporting
 *
 * Every figure on every screen is recomputed from records in this workspace by
 * ./metrics.ts. A measure with no source is declared unavailable with the
 * reason and the provenance material that says so; nothing is ever filled in
 * with a plausible number. Delivery stops at the provider boundary.
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

/** The same query context the screens use, built from the stored records so an export matches what is shown. */
async function exportQueryContext(context: ScreenContext): Promise<QueryContext> {
  const all = await db.records.where("organizationId").equals(context.org.id).toArray();
  const records = all.filter((record) => ANALYTICS_COLLECTIONS.includes(record.collection));
  return { records, byId: new Map(records.map((record) => [record.id, record])), now: context.now, locale: context.org.locale };
}

function downloadCsv(name: string, header: string[], rows: (string | number)[][], context: ScreenContext) {
  const escape = exploreCsvCell;
  const text = [header.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  context.toast("Exported", `${name} downloaded from this browser. Nothing was uploaded.`);
}

function recordHead(context: ScreenContext, collection: string, eyebrow: string): RecordHeaderProps | null {
  const record = knownRecord(context.params.id);
  if (!record || record.organizationId !== context.org.id || record.collection !== collection) return null;
  return {
    eyebrow,
    title: record.title,
    status: <Pill tone={record.status === "published" ? "success" : "neutral"} dot>{record.status}</Pill>,
    meta: [record.ownerName ? `Owner ${record.ownerName}` : undefined, record.fields.shared === true ? "Shared with the workspace" : "Private to its owner"],
  };
}

export const analyticsApp = registerApp({
  code: "ANALYTICS",
  short: "Analytics",
  name: "Analytics, BI & Reporting",
  purpose: "Figures that name the records they came from",
  icon: Activity,
  nav: [
    {
      items: [
        { label: "Insights Overview", screenId: "ARL-ANALYTICS-001", icon: Sparkles },
        { label: "Dashboards", screenId: "ARL-ANALYTICS-002", icon: LayoutDashboard },
        { label: "Report Builder", screenId: "ARL-ANALYTICS-004", icon: Activity },
      ],
    },
    {
      label: "Governance",
      items: [
        { label: "Datasets", screenId: "ARL-ANALYTICS-005", icon: Database },
        { label: "Metric Definitions", screenId: "ARL-ANALYTICS-006", icon: Ruler },
        { label: "Data Modelling", screenId: "ARL-ANALYTICS-007", icon: GitMerge },
      ],
    },
    {
      label: "Forward",
      items: [
        { label: "Forecasts", screenId: "ARL-ANALYTICS-008", icon: LineChart },
        { label: "Distribution", screenId: "ARL-ANALYTICS-009", icon: Send },
      ],
    },
  ],

  screens: gateScreens({
    /* ------------------------------ 001 ------------------------------ */
    "ARL-ANALYTICS-001": {
      id: "ARL-ANALYTICS-001",
      subtitle: () => "Each figure is recomputed from records in this browser and shows where it came from.",
      tabs: ["Executive", "Financial", "Customers", "Operations", "AI"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <InsightsOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Ask question", label: "Ask a question", placement: "primary", run: (context) => context.openOverlay("ask") },
        { id: "inspect source", label: "Inspect the source of a figure", placement: "secondary", run: (context) => context.openOverlay("Metric inspector") },
        { id: "save view", label: "Save this view", placement: "overflow", run: (context) => context.openOverlay("save view") },
        { id: "delegate investigation", label: "Delegate an investigation", placement: "overflow", run: (context) => context.openOverlay("delegate investigation") },
      ],
      overlays: [
        { id: "Metric inspector", kind: "drawer", title: "Where this figure comes from", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <MetricInspector context={context} /> },
        { id: "insight detail", kind: "drawer", title: "The month behind the observation", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <InsightDetail context={context} /> },
        { id: "data freshness", kind: "drawer", title: "Data freshness", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <DataFreshness context={context} /> },
        { id: "save view", kind: "modal", title: "Save this view", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <SaveView context={context} close={close} />, footer: submitFooter("analytics-save-view", "Save view") },
        { id: "delegate investigation", kind: "modal", title: "Delegate an investigation", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DelegateInvestigation context={context} close={close} /> },
        { id: "ask", kind: "drawer", title: "Ask the workspace", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <QuestionComposer context={context} /> },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-ANALYTICS-002": {
      id: "ARL-ANALYTICS-002",
      subtitle: () => "Each tile names a measure, and each measure names the collection it reads.",
      tabs: ["All", "Mine", "Shared", "Templates"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <DashboardDirectory context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create", label: "Create a dashboard", placement: "primary", run: (context) => context.openOverlay("Dashboard setup") },
        {
          id: "open", label: "Open", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select a dashboard first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/analytics/dashboards/${context.selectedId}`),
        },
        {
          id: "pin", label: "Pin", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a dashboard first"),
          run: async (context) => {
            const record = context.selectedId ? await db.records.get(context.selectedId) : undefined;
            if (!record) return;
            const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, pinned: record.fields.pinned !== true } }, { event: record.fields.pinned === true ? "Dashboard unpinned" : "Dashboard pinned" });
            if (!saved) return;
            context.toast(record.fields.pinned === true ? "Unpinned" : "Pinned", "The change is on the record.");
          },
        },
        { id: "share", label: "Share", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a dashboard first"), run: (context) => context.openOverlay("sharing") },
        {
          id: "archive", label: "Archive", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a dashboard first"),
          run: async (context) => {
            if (!context.selectedId) return;
            const saved = await context.mutate.patch(context.selectedId, { status: "archived" }, { event: "Dashboard archived" });
            if (!saved) return;
            context.toast("Archived", "It no longer appears in the working directory. Its tiles are kept on the record.");
          },
        },
        { id: "dependencies", label: "Source dependencies", placement: "overflow", run: (context) => context.openOverlay("source dependency") },
      ],
      overlays: [
        { id: "Dashboard setup", kind: "modal", title: "New dashboard", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DashboardSetup context={context} close={close} />, footer: submitFooter("dashboard-setup", "Create dashboard") },
        { id: "sharing", kind: "modal", title: "Sharing", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <SharingPanel context={context} close={close} /> },
        { id: "source dependency", kind: "drawer", title: "What this dashboard depends on", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SourceDependencyOverlay context={context} /> },
        { id: "create report", kind: "modal", title: "New report", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CreateReport context={context} close={close} />, footer: submitFooter("create-report", "Create report") },
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-ANALYTICS-003": {
      id: "ARL-ANALYTICS-003",
      title: () => "Dashboard editor",
      record: (context) => recordHead(context, "dashboards", "Dashboard"),
      tabs: ["Layout", "Data", "Style", "Access"].map((tab) => ({ id: tab, render: () => null })),
      surface: (context) => <DashboardEditor context={context} />,
      actions: [
        { id: "Drag widget", label: "Place a tile", placement: "primary", run: (context) => context.openOverlay("Widget chooser") },
        { id: "resize", label: "Resize a tile", placement: "secondary", run: (context) => context.openOverlay("resize tile") },
        { id: "set filter", label: "Set a filter", placement: "secondary", run: (context) => context.openOverlay("set filter") },
        {
          id: "publish", label: "Publish", placement: "overflow",
          run: async (context) => {
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!record) return;
            const tiles = readDashboard(record).tiles;
            const missing = tiles.filter((tile) => measureById(tile.measureId)?.unavailable);
            if (missing.length > 0) {
              context.toast("Published with gaps", `${missing.length} tile${missing.length === 1 ? "" : "s"} have no source and will read Unavailable.`, "info");
            }
            if (record.status === "published") { context.toast("Already published", `${record.title} is already marked published.`, "info"); return; }
            const saved = await context.mutate.patch(record.id, { status: "published", fields: { ...record.fields, publishedAt: new Date(context.now).toISOString() } }, { expectRevision: record.revision, event: "Dashboard published" });
            if (!saved) return;
            context.toast("Published", `${record.title} is marked published on the record.`);
          },
        },
        {
          id: "export", label: "Export the figures", placement: "overflow", capability: "export_data",
          run: async (context) => {
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!record) return;
            const body = readDashboard(record);
            const queryContext = await exportQueryContext(context);
            const filters = body.filters.map((filter) => `${dimensionById(filter.dimensionId)?.name ?? filter.dimensionId} ${filter.op} ${filter.value}`).join("; ") || "None";
            const rows: (string | number)[][] = [];
            for (const tile of body.tiles) {
              const measure = measureById(tile.measureId);
              const result = runQuery({ measureIds: [tile.measureId], dimensionId: tile.dimensionId, filters: body.filters }, queryContext);
              const base = [tile.title, measure?.name ?? tile.measureId];
              const tail = [String(result.recordCount), result.asOf ?? "Unknown", filters, measure?.formula ?? ""];
              if (!measure || measure.unavailable) { rows.push([...base, "", "Unavailable", ...tail]); continue; }
              if (tile.dimensionId && tile.viz !== "line") {
                for (const row of result.rows) rows.push([...base, row.key, formatMeasure(measure, row.values[0] ?? null, context.money), ...tail]);
              } else {
                rows.push([...base, "", formatMeasure(measure, result.totals[0] ?? null, context.money), ...tail]);
              }
            }
            downloadCsv(`${record.title.replace(/\s+/g, "-").toLowerCase()}-figures.csv`, ["Tile", "Measure", "Group", "Value", "Records", "Newest record", "Filters", "Formula"], rows, context);
          },
        },
      ],
      overlays: [
        { id: "Widget chooser", kind: "modal", title: "Add a tile", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <WidgetChooser context={context} close={close} /> },
        { id: "query editor", kind: "drawer", title: "The query behind this tile", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <QueryEditor context={context} /> },
        { id: "share", kind: "modal", title: "Sharing", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <SharingPanel context={context} close={close} /> },
        { id: "resize tile", kind: "modal", title: "Resize a tile", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ResizeTile context={context} close={close} /> },
        { id: "set filter", kind: "modal", title: "Dashboard filters", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <SetFilter context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-ANALYTICS-004": {
      id: "ARL-ANALYTICS-004",
      title: () => "Report builder",
      record: (context) => recordHead(context, "reports", "Report"),
      tabs: ["Content", "Data", "Layout", "Distribution"].map((tab) => ({ id: tab, render: () => null })),
      surface: (context) => <ReportBuilder context={context} />,
      actions: [
        { id: "Create report", label: "Create a report", placement: "secondary", run: (context) => context.openOverlay("create report") },
        { id: "add chart", label: "Add a chart", placement: "primary", run: (context) => context.openOverlay("Report block", { kind: "chart" }) },
        { id: "add block", label: "Add another block", placement: "overflow", run: (context) => context.openOverlay("Report block") },
        { id: "cite", label: "Cite the figures", placement: "secondary", run: (context) => context.openOverlay("cite figures") },
        { id: "check citations", label: "Check the citations", placement: "overflow", run: (context) => context.openOverlay("source inspection") },
        {
          id: "publish", label: "Publish", placement: "overflow",
          run: async (context) => {
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!record || record.collection !== "reports") {
              context.toast("Open a report first", "The address does not point at a report.", "blocked");
              return;
            }
            const body = readReport(record);
            const queryRecords = await db.records.where("organizationId").equals(record.organizationId).toArray();
            const byId = new Map(queryRecords.map((row) => [row.id, row]));
            const checks = checkBlocks(body, context, { records: queryRecords, byId, now: context.now, locale: context.org.slug });
            const blockers = checks.filter((check) => !check.ok);
            if (blockers.length > 0) {
              context.toast("Publishing is blocked", `${blockers.length} figure${blockers.length === 1 ? "" : "s"} cannot be cited: ${blockers[0].reason}`, "blocked");
              context.openOverlay("source inspection");
              return;
            }
            const saved = await context.mutate.patch(record.id, {
              status: "published",
              fields: { ...record.fields, publishedAt: new Date(context.now).toISOString(), citedFigures: checks.length },
            }, { expectRevision: record.revision, event: `Report published with ${checks.length} cited figures` });
            if (!saved) return;
            context.toast("Published", `${record.title} is published with ${checks.length} figures, each citing its records.`);
          },
        },
        {
          id: "export", label: "Export the figures", placement: "overflow", capability: "export_data",
          run: async (context) => {
            const record = context.params.id ? await db.records.get(context.params.id) : undefined;
            if (!record || record.collection !== "reports") {
              context.toast("Open a report first", "The address does not point at a report.", "blocked");
              return;
            }
            const body = readReport(record);
            const queryContext = await exportQueryContext(context);
            const filters = (body.filters ?? []).map((filter) => `${dimensionById(filter.dimensionId)?.name ?? filter.dimensionId} ${filter.op} ${filter.value}`).join("; ") || "None";
            const rows: (string | number)[][] = [];
            for (const block of body.blocks.filter((item) => item.measureId)) {
              const measure = measureById(block.measureId!);
              const label = block.text ?? measure?.name ?? "";
              const result = runQuery({ measureIds: [block.measureId!], dimensionId: block.dimensionId, filters: body.filters ?? [] }, queryContext);
              const tail = [String(result.recordCount), result.asOf ?? "Unknown", filters, measure?.formula ?? ""];
              if (!measure || measure.unavailable) { rows.push([label, measure?.name ?? "", "", "Unavailable", ...tail]); continue; }
              if (block.dimensionId) for (const row of result.rows) rows.push([label, measure.name, row.key, formatMeasure(measure, row.values[0] ?? null, context.money), ...tail]);
              else rows.push([label, measure.name, "", formatMeasure(measure, result.totals[0] ?? null, context.money), ...tail]);
            }
            downloadCsv(`${record.title.replace(/\s+/g, "-").toLowerCase()}-figures.csv`, ["Block", "Measure", "Group", "Value", "Records", "Newest record", "Filters", "Formula"], rows, context);
          },
        },
      ],
      overlays: [
        { id: "Report block", kind: "modal", title: "Add a block", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReportBlockOverlay context={context} close={close} /> },
        { id: "schedule", kind: "modal", title: "Schedule", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleOverlay context={context} close={close} /> },
        { id: "source inspection", kind: "drawer", title: "Citations", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <SourceInspection context={context} /> },
        { id: "create report", kind: "modal", title: "New report", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CreateReport context={context} close={close} />, footer: submitFooter("create-report", "Create report") },
        { id: "cite figures", kind: "modal", title: "Cite the figures", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <CiteFigures context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-ANALYTICS-005": {
      id: "ARL-ANALYTICS-005",
      subtitle: () => "Freshness is the age of the newest record, not of an extract.",
      tabs: ["All", "Connected", "Native", "Issues"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <DatasetCatalogue context={context} tab={tab} />,
      })),
      actions: [
        { id: "Browse", label: "Browse", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a dataset first"), run: (context) => context.openOverlay("Dataset details") },
        { id: "document", label: "Document", placement: "secondary", run: (context) => context.openOverlay("document dataset") },
        { id: "grant", label: "Grant access", placement: "overflow", capability: "manage_policy", run: (context) => context.openOverlay("grant dataset") },
        { id: "access", label: "Who has access", placement: "overflow", run: (context) => context.openOverlay("grant review") },
        { id: "refresh", label: "Refresh", placement: "overflow", run: (context) => context.openOverlay("refresh dataset") },
        { id: "quality", label: "Data quality", placement: "overflow", run: (context) => context.openOverlay("quality") },
        {
          id: "retire", label: "Retire", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a dataset first"),
          run: async (context) => {
            const collection = context.selectedId;
            if (!collection) return;
            const existing = (await db.records.where("organizationId").equals(context.org.id).toArray())
              .find((record) => record.collection === "datasets" && record.fields.collection === collection);
            if (existing) {
              const saved = await context.mutate.patch(existing.id, { status: "retired" }, { expectRevision: existing.revision, event: `Dataset ${collection} retired` });
              if (!saved) return;
            } else {
              await context.mutate.create({
                collection: "datasets",
                title: collection,
                status: "retired",
                summary: `Retired from the catalogue. The ${collection} records themselves are untouched.`,
                fields: { collection, kind: "native" },
              }, `Dataset ${collection} retired`);
            }
            context.toast("Retired in the catalogue", "The records are untouched; the dataset is marked retired so no new measure should be built on it.");
          },
        },
      ],
      overlays: [
        { id: "Dataset details", kind: "drawer", title: "Dataset", width: OVERLAY_WIDTH.form, summary: ({ ...context }) => <DatasetSummary context={context} />, render: ({ ...context }) => <DatasetDetails context={context} /> },
        { id: "grant review", kind: "modal", title: "Access to this dataset", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <GrantReview context={context} /> },
        { id: "quality", kind: "drawer", title: "Data quality", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <QualityPanel context={context} /> },
        { id: "document dataset", kind: "modal", title: "Document a dataset", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DocumentDataset context={context} close={close} /> },
        { id: "grant dataset", kind: "modal", title: "Grant access to a dataset", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <GrantDataset context={context} close={close} /> },
        { id: "refresh dataset", kind: "modal", title: "Refresh a dataset", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <RefreshDataset context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-ANALYTICS-006": {
      id: "ARL-ANALYTICS-006",
      subtitle: () => "One definition per figure: its formula, its source and its owner.",
      inspectorTitle: "Definition",
      inspector: (context) => <MetricDefinitionInspector context={context} />,
      tabs: ["Metrics", "Dimensions", "Versions", "Validation"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <MetricDefinitions context={context} tab={tab} />,
      })),
      actions: [
        { id: "Define measure", label: "Define a measure", placement: "primary", run: (context) => context.openOverlay("Formula editor") },
        { id: "test", label: "Test a measure", placement: "secondary", run: (context) => context.openOverlay("test measure") },
        { id: "approve", label: "Approve a version", placement: "secondary", capability: "manage_policy", run: (context) => context.openOverlay("impact review") },
        { id: "compare", label: "Compare two measures", placement: "overflow", run: (context) => context.openOverlay("compare measures") },
        { id: "lineage", label: "Lineage", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a measure first"), run: (context) => context.openOverlay("metric QA") },
        {
          id: "export", label: "Export the catalogue", placement: "overflow", capability: "export_data",
          run: (context) => {
            const rows = allMeasures().map((measure) => [measure.name, measure.id, measure.collection, measure.unit, `v${measure.version}`, measure.owner, measure.formula, measure.unavailable ?? "computable"]);
            downloadCsv("metric-catalogue.csv", ["Measure", "Id", "Collection", "Unit", "Version", "Owner", "Formula", "State"], rows, context);
          },
        },
      ],
      overlays: [
        { id: "Formula editor", kind: "modal", title: "Define a measure", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <FormulaEditor context={context} close={close} /> },
        { id: "impact review", kind: "modal", title: "What changing this definition affects", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ImpactReview context={context} /> },
        { id: "metric QA", kind: "drawer", title: "Metric lineage", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <MetricQA context={context} /> },
        { id: "test measure", kind: "modal", title: "Test a measure", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <TestMeasure context={context} close={close} /> },
        { id: "compare measures", kind: "drawer", title: "Two measures side by side", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <CompareMeasures context={context} /> },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-ANALYTICS-007": {
      id: "ARL-ANALYTICS-007",
      subtitle: () => "Each join is checked against real records so a fan-out cannot inflate a total unnoticed.",
      tabs: ["Schema", "Transformations", "Tests", "Lineage"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <DataModelling context={context} tab={tab} />,
      })),
      actions: [
        { id: "Add relation", label: "Add a relation", placement: "primary", run: (context) => context.openOverlay("transform editor") },
        { id: "validate", label: "Validate the model", placement: "secondary", run: (context) => context.openOverlay("validate model") },
        { id: "refresh", label: "Refresh the joins", placement: "overflow", run: (context) => context.openOverlay("refresh model") },
        { id: "deploy", label: "Deploy", placement: "overflow", capability: "manage_policy", run: (context) => context.openOverlay("deploy model") },
        { id: "join properties", label: "Join properties", placement: "overflow", run: (context) => context.openOverlay("Join properties") },
        { id: "tests", label: "Model tests", placement: "overflow", run: (context) => context.openOverlay("test") },
      ],
      overlays: [
        { id: "Join properties", kind: "drawer", title: "Join", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <JoinProperties context={context} /> },
        { id: "transform editor", kind: "modal", title: "Add a relation", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <TransformEditor context={context} close={close} /> },
        { id: "test", kind: "drawer", title: "Model tests", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ModelTest context={context} /> },
        { id: "validate model", kind: "modal", title: "Validate the data model", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <ValidateModel context={context} close={close} /> },
        { id: "refresh model", kind: "drawer", title: "Refresh the joins", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <RefreshModel context={context} close={close} /> },
        { id: "deploy model", kind: "modal", title: "Deploy the data model", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DeployModel context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-ANALYTICS-008": {
      id: "ARL-ANALYTICS-008",
      subtitle: () => "A straight line through the posted months. Actuals and projections never share a series.",
      tabs: ["Forecast", "Scenarios", "Inputs", "Accuracy"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <ForecastScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Adjust inputs", label: "Adjust inputs", placement: "primary", run: (context) => context.openOverlay("adjust inputs") },
        { id: "compare", label: "Compare scenarios", placement: "secondary", run: (context) => context.openOverlay("compare scenarios") },
        { id: "save", label: "Save a scenario", placement: "secondary", run: (context) => context.openOverlay("scenario editor") },
        {
          id: "request review", label: "Request a review", placement: "overflow",
          run: async (context) => {
            await context.mutate.create({
              collection: "tasks",
              title: "Review the revenue projection",
              status: "ready",
              summary: "The projection is a straight line through the posted months. Check the assumptions on the Inputs tab and the backtest on Accuracy.",
              fields: { stage: "ready", assignee: context.actor, source: "ANALYTICS-008" },
            }, "Forecast review requested");
            context.toast("Review requested", `A task is assigned to ${context.actor} with the assumptions named.`);
          },
        },
      ],
      overlays: [
        { id: "Assumption inspector", kind: "drawer", title: "Assumptions", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <AssumptionInspector context={context} /> },
        { id: "scenario editor", kind: "modal", title: "Save a scenario", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ScenarioEditor context={context} close={close} /> },
        { id: "confidence note", kind: "modal", title: "What the band means", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ConfidenceNote context={context} /> },
        { id: "adjust inputs", kind: "modal", title: "Adjust a scenario's inputs", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <AdjustInputs context={context} close={close} /> },
        { id: "compare scenarios", kind: "drawer", title: "Scenarios compared", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <CompareScenarios context={context} /> },
      ],
    },

    /* ------------------------------ 009 ------------------------------ */
    "ARL-ANALYTICS-009": {
      id: "ARL-ANALYTICS-009",
      subtitle: () => "Delivery stops at the provider boundary, so a prepared delivery is never shown as sent.",
      tabs: ["Schedules", "Audiences", "Deliveries", "Failures"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <Distribution context={context} tab={tab} />,
      })),
      actions: [
        { id: "Schedule", label: "Schedule", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a report first"), run: (context) => context.openOverlay("schedule") },
        { id: "test", label: "Test a delivery", placement: "secondary", run: (context) => context.openOverlay("Recipient preview") },
        {
          id: "pause", label: "Pause", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a report first"),
          run: async (context) => {
            const record = context.selectedId ? await db.records.get(context.selectedId) : undefined;
            if (!record) return;
            const paused = record.fields.schedulePaused === true;
            const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, schedulePaused: !paused } }, { expectRevision: record.revision, event: paused ? "Report schedule resumed" : "Report schedule paused" });
            if (!saved) return;
            context.toast(paused ? "Resumed" : "Paused", paused ? "Its next run is computed again." : "No next run is computed for it.");
          },
        },
        {
          id: "resend safely", label: "Resend safely", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a delivery or a report first"),
          run: async (context) => {
            const record = context.selectedId ? await db.records.get(context.selectedId) : undefined;
            if (!record || record.collection !== "reportDeliveries") {
              context.toast("Choose a delivery", "Resend safely works on a delivery on the Deliveries tab, so the period key can be moved on.", "blocked");
              return;
            }
            const periodKey = `${String(record.fields.periodKey ?? "")}-resend-${new Date(context.now).toISOString().slice(0, 10)}`;
            await context.mutate.create({
              collection: "reportDeliveries",
              title: `${record.title} (resend)`,
              status: "queued_local",
              summary: "Prepared again under a new period key so the de-duplication rule treats it as a distinct send.",
              parentId: record.parentId,
              at: new Date(context.now).toISOString(),
              fields: { ...record.fields, periodKey, resentFrom: record.id },
            }, "Delivery prepared again under a new period key");
            context.toast("Prepared again", "A new delivery record exists under a distinct period key. Nothing was sent; no provider is connected.", "blocked");
          },
        },
      ],
      overlays: [
        { id: "Recipient preview", kind: "modal", title: "Prepare a delivery", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <RecipientPreview context={context} close={close} /> },
        { id: "delivery method", kind: "modal", title: "How a report would be delivered", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <DeliveryMethod context={context} /> },
        { id: "failure detail", kind: "drawer", title: "Why it did not go out", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <FailureDetail context={context} /> },
        { id: "schedule", kind: "modal", title: "Schedule", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleOverlay context={context} close={close} /> },
        { id: "create report", kind: "modal", title: "New report", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CreateReport context={context} close={close} />, footer: submitFooter("create-report", "Create report") },
      ],
    },
  }),

  fallback: (context) => (
    <Notice tone="warning" title={`${context.screen.title} is not built yet`}>
      {context.screen.purpose} It is recorded as outstanding for the Analytics application rather than shown as a generic page.
    </Notice>
  ),
});

export { formatMeasure, runQuery };
