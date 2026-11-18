import { useMemo, useState } from "react";
import { GitCompareArrows, Target } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, DrawerActions, DrawerUnsavedChanges, Empty, Field, Grid, LineChart, MoneyInput, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { accountCode, accountMovements, budgetVariance, cashBalance, periodLabel, recentPeriods, trialForRange, unbudgetedActuals, variancePercent } from "@/domain/fin-ledger";
import type { VarianceRow } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import type { FinData } from "./data";
import { Amount, BooksLoading, SourceNote, StatementRow } from "./parts";
import { clockIso, wallMs } from "@/platform/clock";
import "./variance.css";

/* ---------------------------- FIN-010 ---------------------------- */

interface Assumption {
  id: string;
  label: string;
  valueMinor: number;
  note: string;
}

function assumptionsOf(record: Rec | undefined): Assumption[] {
  const body = record?.body as { assumptions?: Assumption[] } | undefined;
  return body?.assumptions ?? [];
}

export function BudgetsTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const approved = data.budgets.filter((budget) => budget.fields.kind === "budget" && budget.status === "approved");
  const periods = useMemo(() => [...new Set(approved.map((budget) => String(budget.fields.period ?? "")))].filter(Boolean).sort().reverse(), [approved]);
  const [period, setPeriod] = useState(periods[0] ?? data.currentPeriod);

  const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
  const rows = useMemo(
    () => budgetVariance(approved.filter((budget) => String(budget.fields.period ?? "") === period), scoped.rows, data.accounts),
    [approved, period, scoped.rows, data.accounts],
  );

  if (approved.length === 0) {
    return (
      <Empty title="No approved budget" icon={<Target size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("budget approval")}>Review the drafts</Button>}>
        A draft budget is never used for variance. Approve one and the comparison appears here.
      </Empty>
    );
  }

  const budgetTotal = rows.reduce((sum, row) => sum + row.budgetMinor, 0);
  const actualTotal = rows.reduce((sum, row) => sum + row.actualMinor, 0);
  const adverse = rows.filter((row) => !row.favourable && row.varianceMinor !== 0);
  const unbudgeted = unbudgetedActuals(approved.filter((budget) => String(budget.fields.period ?? "") === period), scoped.rows);

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Period">
          <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
          </Select>
        </Field>
        <span className="ds-grow" />
        <SourceNote>Actuals are movement on each account in posted journals dated inside {periodLabel(period, org.locale)}. {scoped.journalCount} journals qualify.</SourceNote>
      </Row>

      <StatRow>
        <Stat prov="human" label="Budgeted" value={context.money(budgetTotal)} meta={`${rows.length} lines approved`} />
        <Stat prov="posted" label="Actual" value={context.money(actualTotal)} meta="Posted journals only" />
        <Stat prov="human" label="Variance" value={context.money(actualTotal - budgetTotal)} meta={`${adverse.length} adverse lines`} />
        <Stat prov="human" label="Unspent budget lines" value={String(rows.filter((row) => !row.hasActual).length)} meta="Nothing posted against them" />
      </StatRow>

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Budget against actual"
        columns={[
          { key: "code", header: "Code", width: "80px", cell: (row) => <code className="ds-num">{row.accountCode}</code>, sortValue: (row) => row.accountCode },
          { key: "label", header: "Line", primary: true, cell: (row) => row.label, filterValue: (row) => `${row.label} ${row.accountCode}` },
          { key: "budget", header: "Budget", align: "end", cell: (row) => <Amount minor={row.budgetMinor} context={context} />, sortValue: (row) => row.budgetMinor },
          { key: "actual", header: "Actual", align: "end",
            cell: (row) => row.hasActual ? <Amount minor={row.actualMinor} context={context} /> : <span className="ds-subtle">Nothing posted</span>,
            sortValue: (row) => row.actualMinor },
          { key: "variance", header: "Variance", align: "end", cell: (row) => <Amount minor={row.varianceMinor} context={context} bold tone={row.favourable ? "success" : "danger"} />, sortValue: (row) => row.varianceMinor },
          { key: "pct", header: "%", align: "end", hideBelow: 900, cell: (row) => {
            const pct = variancePercent(row);
            return <span className="ds-num">{pct === undefined ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}</span>;
          }, sortValue: (row) => variancePercent(row) ?? 0 },
          { key: "verdict", header: "Verdict", cell: (row) => row.varianceMinor === 0
            ? <Pill tone="neutral">On budget</Pill>
            : <Pill tone={row.favourable ? "success" : "danger"} dot>{row.favourable ? "Favourable" : "Adverse"}</Pill> },
          { key: "drill", header: "", cell: (row) => (
            <Button size="sm" variant="ghost" aria-label={`Explain ${row.label}`}
              onClick={(event) => { event.stopPropagation(); context.openOverlay("variance drilldown", { code: row.accountCode, period, budgetId: row.id }); }}>
              Explain
            </Button>
          ) },
        ]}
        onOpen={(id) => {
          const row = rows.find((item) => item.id === id);
          if (row) context.openOverlay("variance drilldown", { code: row.accountCode, period, budgetId: row.id });
        }}
        summary={<>
          <Amount minor={budgetTotal} context={context} bold />
          <span className="ds-subtle">vs</span>
          <Amount minor={actualTotal} context={context} bold />
        </>}
      />

      {unbudgeted.length > 0 && (
        <Card prov="posted" eyebrow="NOT IN THE BUDGET" title="Posted with no budget line"
          subtitle={`${unbudgeted.length} revenue or expense account${unbudgeted.length === 1 ? "" : "s"} moved in ${periodLabel(period, org.locale)} without an approved budget line, so no variance can be judged`}
          actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("revision history")}>Budget revisions</Button>}>
          <DataGrid
            rows={unbudgeted}
            rowId={(row) => row.accountId}
            label="Actuals with no budget line"
            filterable={false}
            columns={[
              { key: "code", header: "Code", width: "80px", cell: (row) => <code className="ds-num">{row.code}</code> },
              { key: "name", header: "Account", primary: true, cell: (row) => row.name },
              { key: "type", header: "Type", cell: (row) => <Pill tone={row.type === "revenue" ? "success" : "neutral"}>{row.type}</Pill> },
              { key: "actual", header: "Actual", align: "end", cell: (row) => <Amount minor={row.balanceMinor} context={context} /> },
              { key: "drill", header: "", cell: (row) => (
                <Button size="sm" variant="ghost" aria-label={`Explain ${row.code} ${row.name}`}
                  onClick={(event) => { event.stopPropagation(); context.openOverlay("variance drilldown", { code: row.code, period }); }}>Explain</Button>
              ) },
            ]}
          />
        </Card>
      )}

      <Card prov="human" title="Variance by line" subtitle="Budget against posted actual">
        <BarChart
          title="Budget against actual by account"
          height={240}
          format={(value) => context.money(value)}
          series={[
            { name: "Budget", points: rows.map((row) => ({ label: row.accountCode, value: row.budgetMinor })) },
            { name: "Actual", points: rows.map((row) => ({ label: row.accountCode, value: row.actualMinor })) },
          ]}
          footer="A bar with no actual means nothing has been posted to that account in the period, not that the figure is unknown."
        />
      </Card>
    </Stack>
  );
}

function projectCash(data: FinData, record: Rec | undefined, months: string[]): { label: string; value: number }[] {
  const assumptions = assumptionsOf(record);
  const value = (label: string) => assumptions.find((item) => item.label.toLowerCase().includes(label))?.valueMinor ?? 0;
  const inflow = value("product revenue") + value("service revenue");
  const outflow = value("payroll") + value("rent") + value("marketing");
  let running = cashBalance(data.accounts, data.journals).amountMinor;
  return months.map((period) => {
    running += inflow - outflow;
    return { label: period.slice(5), value: running };
  });
}

export function ForecastsTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const forecasts = data.budgets.filter((budget) => budget.fields.kind === "forecast");
  const [id, setId] = useState(forecasts[0]?.id ?? "");
  const chosen = forecasts.find((forecast) => forecast.id === id) ?? forecasts[0];
  const horizon = Number(chosen?.fields.horizonMonths ?? 3);
  const future = Array.from({ length: horizon }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const history = recentPeriods(now, 3);
  const opening = cashBalance(data.accounts, data.journals);

  if (forecasts.length === 0) {
    return <Empty title="No forecast model" icon={<GitCompareArrows size={20} />}>A forecast is a set of named assumptions with a basis, kept beside the posted actuals it starts from.</Empty>;
  }

  const projected = chosen ? projectCash(data, chosen, future) : [];
  const actualSeries = history.map((period) => {
    const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
    const revenue = scoped.rows.filter((row) => row.type === "revenue").reduce((sum, row) => sum + row.balanceMinor, 0);
    const expense = scoped.rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.balanceMinor, 0);
    return { label: period.slice(5), value: revenue - expense };
  });

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A forecast is an estimate and is never mixed with the posted ledger">
        The actual line below stops at today. Everything after it is computed from the named assumptions, which you can read and change.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Model">
          <Select aria-label="Model" value={chosen?.id ?? ""} onChange={(event) => setId(event.target.value)}>
            {forecasts.map((forecast) => <option key={forecast.id} value={forecast.id}>{forecast.title}</option>)}
          </Select>
        </Field>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={() => context.openOverlay("Model assumptions", { id: chosen?.id })}>Edit the assumptions</Button>
      </Row>

      <Grid>
        <Card prov="human" span={8} title="Projected cash" subtitle={`Opening ${context.money(opening.amountMinor)} from posted journals, then ${horizon} months of assumptions`}>
          <LineChart
            title="Projected cash balance"
            height={240}
            format={(value) => context.money(value)}
            series={[{ name: "Projected cash", points: projected }]}
            footer={`${chosen?.title}: ${String(chosen?.fields.basis ?? "no basis recorded")}`}
          />
        </Card>
        <Card prov="human" span={4} title="Assumptions" subtitle="Each one is a figure you can argue with">
          <Stack gap={3}>
            {assumptionsOf(chosen).map((assumption) => (
              <div key={assumption.id}>
                <Row gap={2}>
                  <span className="ds-grow">{assumption.label}</span>
                  <Amount minor={assumption.valueMinor} context={context} bold />
                </Row>
                <span className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{assumption.note}</span>
              </div>
            ))}
            {assumptionsOf(chosen).length === 0 && <span className="ds-subtle">This model records no assumptions.</span>}
          </Stack>
        </Card>
        <Card prov="posted" span={12} title="Posted result by month" subtitle="For comparison. These are actuals, not estimates.">
          <BarChart
            title="Posted monthly result"
            height={200}
            format={(value) => context.money(value)}
            series={[{ name: "Posted result", points: actualSeries }]}
            footer="Revenue less expense from posted journals in each month."
          />
        </Card>
      </Grid>
    </Stack>
  );
}

export function ScenariosTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const forecasts = data.budgets.filter((budget) => budget.fields.kind === "forecast");
  const months = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const opening = cashBalance(data.accounts, data.journals).amountMinor;

  if (forecasts.length < 2) {
    return <Empty title="Fewer than two scenarios" icon={<GitCompareArrows size={20} />}>Comparison needs at least two models with their own assumptions.</Empty>;
  }

  return (
    <Stack gap={4}>
      <Card prov="human" title="Scenarios side by side" subtitle={`Opening cash ${context.money(opening)} is the same in every scenario because it comes from the posted ledger`}>
        <LineChart
          title="Projected cash by scenario"
          height={260}
          format={(value) => context.money(value)}
          series={forecasts.map((forecast) => ({
            name: String(forecast.fields.scenario ?? forecast.title),
            points: projectCash(data, forecast, months),
          }))}
          footer="Each line is the opening balance plus the net of that scenario's monthly assumptions."
        />
      </Card>

      <DataGrid
        rows={forecasts.flatMap((forecast) => assumptionsOf(forecast).map((assumption) => ({
          id: `${forecast.id}-${assumption.id}`,
          scenario: String(forecast.fields.scenario ?? forecast.title),
          label: assumption.label,
          valueMinor: assumption.valueMinor,
          note: assumption.note,
        })))}
        rowId={(row) => row.id}
        label="Assumptions by scenario"
        columns={[
          { key: "scenario", header: "Scenario", cell: (row) => <Pill tone={row.scenario === "base" ? "info" : "warning"}>{row.scenario}</Pill>, filterValue: (row) => row.scenario },
          { key: "label", header: "Assumption", primary: true, cell: (row) => row.label, filterValue: (row) => row.label },
          { key: "value", header: "Monthly", align: "end", cell: (row) => <Amount minor={row.valueMinor} context={context} /> },
          { key: "note", header: "Why", cell: (row) => <span className="ds-subtle">{row.note}</span> },
        ]}
      />

      <Notice tone="info" title="Nothing here feeds a statement">
        A scenario is a planning device. The profit and loss, the balance sheet and the cash flow statement are all built from posted journals only.
      </Notice>
    </Stack>
  );
}

export function BudgetApprovalTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const drafts = data.budgets.filter((budget) => budget.status === "draft");
  const approved = data.budgets.filter((budget) => budget.status === "approved" && budget.fields.kind === "budget");
  const [busy, setBusy] = useState<string>();

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Submitted" value={String(drafts.length)} meta="Waiting on an approval" />
        <Stat prov="human" label="Approved" value={String(approved.length)} meta="Used for variance" />
        <Stat prov="human" label="Approved value" value={context.money(approved.reduce((sum, budget) => sum + Number(budget.amountMinor ?? 0), 0))} />
      </StatRow>
      {drafts.length === 0 ? (
        <Empty title="Nothing is waiting for approval">A submitted budget appears here with who submitted it.</Empty>
      ) : (
        <Stack gap={3}>
          {drafts.map((budget) => (
            <Card prov="human"
              key={budget.id}
              title={budget.title}
              subtitle={budget.summary}
              actions={<Amount minor={budget.amountMinor} context={context} bold />}
              footer={<>
                <Button
                  size="sm"
                  variant="primary"
                  busy={busy === budget.id}
                  disabled={!context.can("approve_payment")}
                  title={!context.can("approve_payment") ? "Approving a budget needs the Finance or Owner role view" : undefined}
                  onClick={async () => {
                    setBusy(budget.id);
                    await context.mutate.patch(budget.id, { status: "approved", fields: { ...budget.fields, approvedBy: context.actor } }, { expectRevision: budget.revision, event: `Budget ${budget.title} approved` });
                    context.toast("Budget approved", `${budget.title} is now used for variance in ${String(budget.fields.period ?? "its period")}.`);
                    setBusy(undefined);
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  busy={busy === budget.id}
                  onClick={async () => {
                    setBusy(budget.id);
                    await context.mutate.patch(budget.id, { status: "returned", fields: { ...budget.fields, returnedBy: context.actor } }, { expectRevision: budget.revision, event: `Budget ${budget.title} returned` });
                    context.toast("Returned", `${budget.title} goes back to ${String(budget.fields.submittedBy ?? "its author")} unapproved.`, "blocked");
                    setBusy(undefined);
                  }}
                >
                  Return
                </Button>
              </>}
            >
              <Properties rows={[
                { label: "Account", value: String(budget.fields.accountCode ?? "Not set") },
                { label: "Period", value: String(budget.fields.period ?? "Not set") },
                { label: "Submitted by", value: String(budget.fields.submittedBy ?? budget.ownerName) },
              ]} />
            </Card>
          ))}
        </Stack>
      )}
      <Notice tone="info" title="A budget approval is a local control">
        It decides whether a line is used in the variance comparison. Nothing is filed and no spending limit is enforced anywhere else.
      </Notice>
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function ModelAssumptions({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const forecasts = data.budgets.filter((budget) => budget.fields.kind === "forecast");
  const record = forecasts.find((forecast) => forecast.id === payload?.id) ?? forecasts[0];
  const [rows, setRows] = useState<Assumption[]>(assumptionsOf(record));
  const [busy, setBusy] = useState(false);

  if (!record) return <Empty title="No forecast model" />;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Each assumption needs a reason">
        The note is shown beside the figure wherever the forecast is used, so a reader can tell where the number came from.
      </Notice>
      <Stack gap={3}>
        {rows.map((row, index) => (
          <Row key={row.id} gap={3} wrap className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Field label={`Assumption ${index + 1}`}>
              <TextInput value={row.label} onChange={(event) => setRows(rows.map((item) => (item.id === row.id ? { ...item, label: event.target.value } : item)))} />
            </Field>
            <Field label="Monthly value">
              <MoneyInput
                label={`Value for ${row.label}`}
                currency={context.org.currency}
                valueMinor={row.valueMinor}
                onChangeMinor={(minor) => setRows(rows.map((item) => (item.id === row.id ? { ...item, valueMinor: minor } : item)))}
              />
            </Field>
            <Field label="Why">
              <TextInput aria-label="Why" value={row.note} onChange={(event) => setRows(rows.map((item) => (item.id === row.id ? { ...item, note: event.target.value } : item)))} />
            </Field>
          </Row>
        ))}
      </Stack>
      <Row gap={2}>
        <Button variant="secondary" onClick={() => setRows([...rows, { id: `a${rows.length + 1}${wallMs().toString(36)}`, label: "", valueMinor: 0, note: "" }])}>Add an assumption</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={rows.some((row) => !row.label.trim())}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(record.id, {
              body: { ...(record.body as object ?? {}), assumptions: rows },
            }, { expectRevision: record.revision, event: `Assumptions edited on ${record.title}` });
            context.toast("Assumptions saved", `${record.title} now projects from ${rows.length} named assumptions.`);
            setBusy(false);
            close();
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Why one budget line came out where it did: the posted lines behind its actual, and a recorded explanation. */
export function VarianceDrilldown({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = (context.overlayPayload ?? {}) as { code?: string; period?: string; budgetId?: string };
  const code = payload.code ?? "";
  const period = payload.period ?? data.currentPeriod;
  const account = data.accounts.find((item) => accountCode(item) === code);
  const budget = payload.budgetId ? data.budgets.find((item) => item.id === payload.budgetId) : undefined;
  const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
  const row = budget ? budgetVariance([budget], scoped.rows, data.accounts)[0] : undefined;
  const movements = accountMovements(data.accounts, data.journals, code, period);
  const actual = movements.reduce((sum, item) => sum + item.netMinor, 0);
  const originalNote = String(budget?.fields.varianceNote ?? "");
  const [saved, setSaved] = useState<{ budgetId: string; value: string } | null>(null);
  const savedNote = saved && saved.budgetId === budget?.id ? saved.value : originalNote;
  const [draft, setDraft] = useState<{ budgetId: string; value: string } | null>(null);
  const note = draft && draft.budgetId === budget?.id ? draft.value : savedNote;
  const [busy, setBusy] = useState(false);
  const dirty = note.trim() !== savedNote.trim();

  if (!data.ready) return <BooksLoading />;
  if (!account) return <Empty title="That account is not in the chart">Choose a line from the budget table.</Empty>;
  const pct = row ? variancePercent(row) : undefined;

  return (
    <div className="fin-variance-flow">
      <DrawerUnsavedChanges when={dirty || busy} />

      <section className="fin-variance-overview" aria-label="Budget variance overview">
        <div className="fin-variance-overview-head">
          <div>
            <span className="fin-variance-eyebrow">Budget line</span>
            <strong className="fin-variance-account">{code} {account.title}</strong>
          </div>
          <span className="fin-variance-period">{periodLabel(period, org.locale)}</span>
        </div>
        <div className="fin-variance-metrics" role="group" aria-label="Budget versus actual">
          <div className="fin-variance-metric">
            <span className="fin-variance-metric-label">Budget</span>
            <div className="fin-variance-metric-value">{row ? <Amount minor={row.budgetMinor} context={context} /> : "Not budgeted"}</div>
          </div>
          <div className="fin-variance-metric">
            <span className="fin-variance-metric-label">Posted actual</span>
            <div className="fin-variance-metric-value"><Amount minor={actual} context={context} bold /></div>
          </div>
          <div className="fin-variance-metric">
            <span className="fin-variance-metric-label">Variance</span>
            {row ? (
              <>
                <div className="fin-variance-change">
                  <span className="fin-variance-metric-value"><Amount minor={row.varianceMinor} context={context} bold tone={row.favourable ? "success" : "danger"} /></span>
                  {pct !== undefined && <span className="ds-num ds-subtle">{pct > 0 ? "+" : ""}{pct}%</span>}
                </div>
                {row.varianceMinor === 0
                  ? <Pill>On budget</Pill>
                  : <Pill tone={row.favourable ? "success" : "danger"} dot>{row.favourable ? "Favourable" : "Adverse"}</Pill>}
              </>
            ) : <span className="ds-subtle">No approved comparison</span>}
          </div>
        </div>
      </section>

      <Card prov="posted" eyebrow="WHAT MAKES UP THE ACTUAL" title={`${movements.length} posted journal${movements.length === 1 ? "" : "s"}`}
        subtitle="Largest first. These posted movements reconcile to the actual above." flush>
        {movements.length === 0 ? (
          <div className="ds-card-body"><span className="ds-subtle">Nothing was posted to {code} in {periodLabel(period, org.locale)}, so the actual is zero rather than unknown.</span></div>
        ) : (
          <DataGrid
            rows={movements}
            rowId={(item) => item.journal.id}
            label="Posted lines behind the actual"
            filterable={false}
            columns={[
              { key: "date", header: "Date", cell: (item) => <span className="ds-num">{context.date(item.date)}</span>, sortValue: (item) => item.date },
              { key: "journal", header: "Journal", primary: true, cell: (item) => (
                <div style={{ minWidth: 0 }}>
                  <span>{item.journal.title}</span>
                  {item.memo && <span className="ds-subtle ds-truncate" style={{ display: "block", fontSize: "var(--text-xs)" }}>{item.memo}</span>}
                </div>
              ) },
              { key: "net", header: "Amount", align: "end", cell: (item) => <Amount minor={item.netMinor} context={context} />, sortValue: (item) => item.netMinor },
              { key: "share", header: "Share", align: "end", hideBelow: 700, cell: (item) => <span className="ds-num">{actual ? `${Math.round((item.netMinor / actual) * 100)}%` : "—"}</span> },
            ]}
            summary={<Amount minor={actual} context={context} bold />}
          />
        )}
      </Card>

      {budget ? (
        <section className="fin-variance-note" aria-label="Month-end explanation">
          <Field label="Variance explanation" hint="Saved against the approved budget line with your name for the month-end pack.">
            <TextArea
              aria-label="Variance explanation"
              rows={4}
              value={note}
              onChange={(event) => setDraft({ budgetId: budget.id, value: event.target.value })}
              placeholder="Describe what drove the difference, whether it is one-off, and any action required."
            />
          </Field>
          {budget.fields.varianceNoteBy && (
            <SourceNote>Last explained by {String(budget.fields.varianceNoteBy)} {budget.fields.varianceNoteAt ? `on ${context.date(String(budget.fields.varianceNoteAt))}` : ""}.</SourceNote>
          )}
        </section>
      ) : (
        <Notice tone="info" title="No budget line to explain against">
          Add {code} to next period's budget from the Approval tab if this movement is expected to recur.
        </Notice>
      )}

      <DrawerActions>
        {budget && (
          <Button variant="primary" size="sm" busy={busy} disabled={busy || !dirty}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                const value = note.trim();
                await context.mutate.patch(budget.id, {
                  fields: { ...budget.fields, varianceNote: value, varianceNoteBy: context.actor, varianceNoteAt: clockIso() },
                }, { expectRevision: budget.revision, event: `Variance on ${budget.title} explained by ${context.actor}` });
                setSaved({ budgetId: budget.id, value });
                setDraft(null);
                context.toast("Explanation saved", `${budget.title} now carries the explanation. No figure changed.`);
              } catch (error) {
                context.toast("Explanation not saved", error instanceof Error ? error.message : "Reload and retry.", "failed");
              } finally {
                setBusy(false);
              }
            }}>Save explanation</Button>
        )}
        <Button variant="secondary" size="sm" disabled={dirty || busy}
          title={dirty ? "Save or discard your changes before leaving" : undefined}
          onClick={() => context.navigate(`/o/${org.slug}/fin/ledger?tab=Entries`)}>
          Open General Ledger
        </Button>
        {budget && <span className="fin-variance-status" role="status" aria-live="polite">
          {busy ? "Saving…" : dirty ? "Unsaved changes" : saved?.budgetId === budget.id ? "Saved" : ""}
        </span>}
      </DrawerActions>
    </div>
  );
}

export function BudgetRevisionHistory({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const records = data.budgets;
  const withHistory = records.filter((record) => record.history.length > 0 || record.revision > 1);
  return (
    <Stack gap={4}>
      {withHistory.length === 0 ? (
        <Empty title="No budget has been revised">Each edit keeps a snapshot, so a changed ceiling can be traced.</Empty>
      ) : (
        <Stack gap={3}>
          {withHistory.map((record) => (
            <Card prov="posted" key={record.id} title={record.title} subtitle={`Revision ${record.revision}`}>
              <DataGrid
                rows={record.history}
                rowId={(row) => row.at}
                label={`${record.title} revisions`}
                filterable={false}
                columns={[
                  { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span> },
                  { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
                  { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
                ]}
              />
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function BudgetApprovalOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [accountCodeValue, setAccountCodeValue] = useState("6300");
  const [period, setPeriod] = useState(data.currentPeriod);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = data.budgets.find((budget) =>
    String(budget.fields.accountCode ?? "") === accountCodeValue && String(budget.fields.period ?? "") === period);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A submitted budget is not used until it is approved">
        Variance only ever compares against approved lines, so a draft cannot quietly change a report.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Account">
          <Select aria-label="Account" value={accountCodeValue} onChange={(event) => setAccountCodeValue(event.target.value)}>
            {data.accounts.filter((account) => ["expense", "revenue"].includes(String(account.fields.type)) && account.status !== "inactive")
              .map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
        <Field label="Period">
          <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {[...new Set([data.currentPeriod, ...recentPeriods(context.now, 4), ...data.periods])].sort().reverse()
              .map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
          </Select>
        </Field>
        <Field label="Ceiling"><MoneyInput label="Budget ceiling" currency={org.currency} valueMinor={amount} onChangeMinor={setAmount} /></Field>
      </Row>
      <Field label="Basis"><TextArea aria-label="Basis" value={note} rows={2} onChange={(event) => setNote(event.target.value)} placeholder="Why this figure" /></Field>
      {existing && <Notice tone="warning" title={`${accountCodeValue} already has a ${period} budget`}>{existing.title} is {existing.status} at {context.money(existing.amountMinor)}. Submitting another would double the ceiling in the comparison.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={amount <= 0 || Boolean(existing)}
          onClick={async () => {
            setBusy(true);
            const account = data.accounts.find((item) => accountCode(item) === accountCodeValue);
            await context.mutate.create({
              collection: "budgets",
              title: `${account?.title ?? accountCodeValue} · ${periodLabel(period, org.locale)}`,
              status: "draft",
              summary: note || `Submitted ceiling for ${accountCodeValue} in ${period}.`,
              amountMinor: amount,
              fields: { kind: "budget", accountCode: accountCodeValue, period, submittedBy: context.actor },
            }, `Budget submitted for ${accountCodeValue} ${period}`);
            context.toast("Budget submitted", "It is a draft until someone approves it, so no variance has changed.");
            setBusy(false);
            close();
          }}
        >
          Submit for approval
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function PlanningStrip({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const approved = data.budgets.filter((budget) => budget.fields.kind === "budget" && budget.status === "approved" && String(budget.fields.period ?? "") === data.currentPeriod);
  const scoped = trialForRange(data.accounts, data.journals, org.id, { period: data.currentPeriod });
  const rows: VarianceRow[] = budgetVariance(approved, scoped.rows, data.accounts);
  const adverse = rows.filter((row) => !row.favourable && row.varianceMinor !== 0);
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{periodLabel(data.currentPeriod, org.locale)}</Pill>
      <span>Budget <Amount minor={rows.reduce((sum, row) => sum + row.budgetMinor, 0)} context={context} bold /></span>
      <span>Actual <Amount minor={rows.reduce((sum, row) => sum + row.actualMinor, 0)} context={context} bold /></span>
      <Pill tone={adverse.length ? "warning" : "success"} dot>{adverse.length} adverse</Pill>
      <span className="ds-grow" />
      <span className="ds-subtle">Forecast figures are never blended into these actuals.</span>
    </Row>
  );
}

export function ScenarioCompare({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const forecasts = data.budgets.filter((budget) => budget.fields.kind === "forecast");
  if (forecasts.length < 2) return <Empty title="Need two scenarios to compare" />;
  const [left, right] = forecasts;
  const labels = [...new Set([...assumptionsOf(left), ...assumptionsOf(right)].map((item) => item.label))];
  return (
    <Stack gap={3}>
      <StatementRow
        context={context}
        rows={labels.map((label) => {
          const a = assumptionsOf(left).find((item) => item.label === label)?.valueMinor ?? 0;
          const b = assumptionsOf(right).find((item) => item.label === label)?.valueMinor ?? 0;
          return { label, minor: b - a, note: `${context.money(a)} in ${left.title} against ${context.money(b)} in ${right.title}` };
        })}
      />
      <Segmented label="Scenario" value="base" onChange={() => undefined} options={forecasts.map((forecast) => ({ value: String(forecast.fields.scenario ?? forecast.id), label: forecast.title }))} />
    </Stack>
  );
}
