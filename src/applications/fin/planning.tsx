import { useMemo, useState } from "react";
import { GitCompareArrows, Target } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, Empty, Field, Grid, LineChart, MoneyInput, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { accountCode, budgetVariance, cashBalance, periodLabel, recentPeriods, trialForRange } from "@/domain/fin-ledger";
import type { VarianceRow } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import type { FinData } from "./data";
import { Amount, SourceNote, StatementRow } from "./parts";
import { wallMs } from "@/platform/clock";

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
          { key: "verdict", header: "Verdict", cell: (row) => row.varianceMinor === 0
            ? <Pill tone="neutral">On budget</Pill>
            : <Pill tone={row.favourable ? "success" : "danger"} dot>{row.favourable ? "Favourable" : "Adverse"}</Pill> },
        ]}
        onOpen={() => context.openOverlay("revision history")}
        summary={<>
          <Amount minor={budgetTotal} context={context} bold />
          <span className="ds-subtle">vs</span>
          <Amount minor={actualTotal} context={context} bold />
        </>}
      />

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
