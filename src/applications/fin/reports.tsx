import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, FileDown } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  ACCOUNT_TYPE_LABEL, ageBuckets, balanceSheet, cashFlow, consolidate, journalLines, monthlyMovement,
  periodLabel, profitAndLoss, recentPeriods, trialForRange,
} from "@/domain/fin-ledger";
import type { AccountType, TrialRow } from "@/domain/fin-ledger";
import { openInvoices, outstandingMinor, useFinData } from "./data";
import { Amount, BooksLoading, LedgerHealth, SourceNote, StatementRow } from "./parts";
import { statementCsv } from "./statementExport";

/* ---------------------------- FIN-012 ---------------------------- */

export type Statement = "pl" | "bs" | "cf" | "tb" | "aged";

export const STATEMENT_LABEL: Record<Statement, string> = {
  pl: "Profit and loss",
  bs: "Balance sheet",
  cf: "Cash flow",
  tb: "Trial balance",
  aged: "Receivables ageing",
};

export function StatementsTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const [params] = useSearchParams();
  const wanted = params.get("statement");
  const wantedPeriod = params.get("period");
  const [statement, setStatement] = useState<Statement>(wanted && wanted in STATEMENT_LABEL ? (wanted as Statement) : "pl");
  const [period, setPeriod] = useState<string>(wantedPeriod ?? "all");
  useEffect(() => {
    if (wanted && wanted in STATEMENT_LABEL) setStatement(wanted as Statement);
    if (wantedPeriod) setPeriod(wantedPeriod);
  }, [wanted, wantedPeriod]);

  const scoped = trialForRange(data.accounts, data.journals, org.id, period === "all" ? undefined : { period });
  // P&L is movement INSIDE the selected month; the trial balance and balance
  // sheet are the cumulative position THROUGH that month's end.
  const cumulative = trialForRange(data.accounts, data.journals, org.id,
    period === "all" ? undefined : { to: `${period}-31` });
  const rows = period === "all" ? data.trialRows : cumulative.rows;
  const pl = profitAndLoss(period === "all" ? rows : scoped.rows);
  const bs = balanceSheet(rows);
  const flow = cashFlow(data.accounts, data.journals, period === "all" ? undefined : { from: `${period}-01`, to: `${period}-31` });
  const open = openInvoices(data.invoices);

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Segmented
          label="Statement"
          value={statement}
          onChange={setStatement}
          options={(Object.keys(STATEMENT_LABEL) as Statement[]).map((key) => ({ value: key, label: STATEMENT_LABEL[key] }))}
        />
        <Field label="Period">
          <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="all">Since the first posting</option>
            {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
          </Select>
        </Field>
        <span className="ds-grow" />
        <Button variant="secondary" icon={<FileDown size={15} />} onClick={() => {
          const csv = statementCsv({
            statement, period, pl, bs, flow, trialRows: rows, invoices: data.invoices,
          });
          const scope = statement === "aged" ? "live" : period;
          downloadFile(`${org.slug}-${statement}-${scope}.csv`, csv, "text/csv");
          context.toast("Statement exported", `${STATEMENT_LABEL[statement]} exported from posted/local records as ${scope === "live" ? "the live receivables position" : scope}. No external filing occurred.`);
        }}>Export</Button>
      </Row>

      {!data.ready ? <BooksLoading /> : <>
      <LedgerHealth
        context={context}
        booksBalance={data.statements.booksBalance}
        equationHolds={data.statements.equationHolds}
        difference={data.statements.debit - data.statements.credit}
      />

      <Notice tone="info" title="Posted journals only">
        {period === "all"
          ? `Every posted journal in this workspace: ${data.postedCount} entries.`
          : `${scoped.journalCount} posted journals dated inside ${periodLabel(period, org.locale)}.`}
        {" "}{data.draftJournals.length} draft{data.draftJournals.length === 1 ? "" : "s"} and every forecast are excluded. The selected month shows P&L movements and the cumulative trial balance/balance sheet at month-end. Receivables ageing remains live.
      </Notice>

      {statement === "pl" && (
        <Grid>
          <Card prov="posted" eyebrow="P&L" span={7} title="Profit and loss" subtitle={period === "all" ? "Since the first posting" : periodLabel(period, org.locale)}>
            <StatementRow
              context={context}
              rows={[
                { label: "Revenue", minor: pl.revenueMinor, bold: true },
                ...pl.revenue.map((line) => ({ label: `${line.code} ${line.name}`, minor: line.amountMinor, indent: true })),
                { label: "Cost of sales", minor: pl.costOfSalesMinor },
                { label: "Gross margin", minor: pl.grossMarginMinor, bold: true, note: pl.revenueMinor ? `${Math.round((pl.grossMarginMinor / pl.revenueMinor) * 100)}% of revenue` : undefined },
                { label: "Overheads", minor: pl.expenseMinor - pl.costOfSalesMinor },
                ...pl.expense.filter((line) => !line.code.startsWith("5")).map((line) => ({ label: `${line.code} ${line.name}`, minor: line.amountMinor, indent: true })),
                { label: "Result", minor: pl.netMinor, bold: true },
              ]}
            />
          </Card>
          <Card prov="posted" span={5} title="Revenue and cost by month" subtitle="Six months of posted movement">
            <BarChart
              title="Revenue and expense by month"
              height={240}
              format={(value) => context.money(value)}
              series={[
                { name: "Revenue", points: monthlyMovement(data.accounts, data.journals, "revenue", recentPeriods(now, 6)).map((point) => ({ label: point.period.slice(5), value: point.amountMinor })) },
                { name: "Expense", points: monthlyMovement(data.accounts, data.journals, "expense", recentPeriods(now, 6)).map((point) => ({ label: point.period.slice(5), value: point.amountMinor })) },
              ]}
            />
          </Card>
        </Grid>
      )}

      {statement === "bs" && (
        <Grid>
          <Card prov="posted" eyebrow="BALANCE SHEET" span={6} title="Balance sheet" subtitle={period === "all" ? "All posted journals, cumulative" : `At end of ${periodLabel(period, org.locale)}, cumulative`}>
            <StatementRow
              context={context}
              rows={[
                { label: "Assets", minor: bs.assetsMinor, bold: true },
                ...bs.assets.map((line) => ({ label: `${line.code} ${line.name}`, minor: line.amountMinor, indent: true })),
                { label: "Liabilities", minor: bs.liabilitiesMinor, bold: true },
                ...bs.liabilities.map((line) => ({ label: `${line.code} ${line.name}`, minor: line.amountMinor, indent: true })),
                { label: "Equity", minor: bs.equityMinor, bold: true },
                ...bs.equity.map((line) => ({ label: `${line.code} ${line.name}`, minor: line.amountMinor, indent: true })),
                { label: "Result for the period", minor: bs.retainedMinor, indent: true },
                { label: "Liabilities and equity", minor: bs.liabilitiesMinor + bs.equityMinor + bs.retainedMinor, bold: true },
              ]}
            />
          </Card>
          <Card prov="posted" span={6} title="Does it tie?" subtitle="Assets against liabilities plus equity plus the result">
            <Stack gap={3}>
              <StatementRow
                context={context}
                rows={[
                  { label: "Assets", minor: bs.assetsMinor },
                  { label: "Liabilities + equity + result", minor: bs.liabilitiesMinor + bs.equityMinor + bs.retainedMinor },
                  { label: "Difference", minor: bs.differenceMinor, bold: true },
                ]}
              />
              {bs.differenceMinor === 0
                ? <Notice tone="success" title="The accounting equation holds">Every posted journal balances, so the two sides agree to the penny.</Notice>
                : <Notice tone="danger" title="The equation does not hold">A difference of {context.money(bs.differenceMinor)} is shown rather than hidden. Look for a posted journal whose lines do not balance.</Notice>}
              <SourceNote>The result for the period is revenue less expense from the same posted journals, not a separate figure.</SourceNote>
            </Stack>
          </Card>
        </Grid>
      )}

      {statement === "cf" && (
        <Grid>
          <Card prov="posted" eyebrow="CASH FLOW" span={6} title="Cash flow" subtitle={period === "all" ? "Since the first posting" : periodLabel(period, org.locale)}>
            <StatementRow
              context={context}
              rows={[
                { label: "Opening cash", minor: flow.openingMinor },
                { label: "Operating", minor: flow.operatingMinor },
                { label: "Investing", minor: flow.investingMinor },
                { label: "Financing", minor: flow.financingMinor },
                { label: "Net movement", minor: flow.movementMinor, bold: true },
                { label: "Closing cash", minor: flow.closingMinor, bold: true },
              ]}
            />
          </Card>
          <Card prov="posted" span={6} title="Movements by counterpart" subtitle="Each row is a posted journal's other side" flush>
            <DataGrid
              rows={flow.rows}
              rowId={(row) => `${row.activity}-${row.label}`}
              label="Cash movements"
              filterable={false}
              pageSize={12}
              columns={[
                { key: "activity", header: "Activity", cell: (row) => <Pill tone={row.activity === "operating" ? "info" : row.activity === "financing" ? "accent" : "warning"}>{row.activity}</Pill> },
                { key: "label", header: "Account", primary: true, cell: (row) => row.label },
                { key: "amount", header: "Cash effect", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
              ]}
            />
          </Card>
        </Grid>
      )}

      {statement === "tb" && (
        <DataGrid
          rows={rows.filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0)}
          rowId={(row) => row.accountId}
          label="Trial balance"
          columns={[
            { key: "code", header: "Code", width: "80px", cell: (row) => <code className="ds-num">{row.code}</code>, sortValue: (row) => row.code },
            { key: "name", header: "Account", primary: true, cell: (row) => row.name, filterValue: (row) => `${row.code} ${row.name}` },
            { key: "type", header: "Type", cell: (row) => ACCOUNT_TYPE_LABEL[row.type] ?? row.type, filterValue: (row) => row.type },
            { key: "debit", header: "Debit", align: "end", cell: (row) => <Amount minor={row.debitMinor} context={context} />, sortValue: (row) => row.debitMinor },
            { key: "credit", header: "Credit", align: "end", cell: (row) => <Amount minor={row.creditMinor} context={context} />, sortValue: (row) => row.creditMinor },
            { key: "balance", header: "Balance", align: "end", cell: (row) => <Amount minor={row.balanceMinor} context={context} bold />, sortValue: (row) => row.balanceMinor },
          ]}
          summary={<>
            <Amount minor={rows.reduce((sum, row) => sum + row.debitMinor, 0)} context={context} bold />
            <span className="ds-subtle">/</span>
            <Amount minor={rows.reduce((sum, row) => sum + row.creditMinor, 0)} context={context} bold />
          </>}
        />
      )}

      {statement === "aged" && period !== "all" && (
        <Notice tone="warning" title="Receivables ageing is a live position">
          The selected historic month does not reconstruct past invoice allocations. This view and its CSV
          show invoices outstanding now; choose P&L, balance sheet or cash flow for a historic period.
        </Notice>
      )}
      {statement === "aged" && (
        <Grid>
          <Card prov="posted" span={5} title="Receivables ageing" subtitle={`${open.length} open invoices at ${context.date(now)}`}>
            <StatementRow
              context={context}
              rows={ageBuckets(open, now).map((bucket) => ({ label: bucket.bucket, minor: bucket.amountMinor, note: `${bucket.count} invoice${bucket.count === 1 ? "" : "s"}` }))}
            />
          </Card>
          <Card prov="posted" span={7} title="Open invoices" flush>
            <DataGrid
              rows={open}
              rowId={(row) => row.id}
              label="Open invoices"
              columns={[
                { key: "number", header: "Invoice", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
                { key: "due", header: "Due", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span>, sortValue: (row) => row.dueAt ?? "" },
                { key: "amount", header: "Outstanding", align: "end", cell: (row) => <Amount minor={outstandingMinor(row)} context={context} />, sortValue: (row) => outstandingMinor(row) },
              ]}
              onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
              summary={<Amount minor={open.reduce((sum, row) => sum + outstandingMinor(row), 0)} context={context} bold />}
            />
          </Card>
        </Grid>
      )}
      </>}
    </Stack>
  );
}

export function exportStatement(context: ScreenContext, statement: Statement, rows: TrialRow[], period: string): void {
  const header = "code,name,type,debit_minor,credit_minor,balance_minor\n";
  const body = rows.map((row) => [row.code, row.name, row.type, row.debitMinor, row.creditMinor, row.balanceMinor]
    .map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile(`${context.org.slug}-${statement}-${period}.csv`, header + body, "text/csv");
  context.toast("Exported", `${STATEMENT_LABEL[statement]} for ${period === "all" ? "every period" : period} written to a CSV file in this browser.`);
}

export function ManagementTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const months = recentPeriods(now, 6);
  const series = months.map((period) => {
    const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
    const revenue = scoped.rows.filter((row) => row.type === "revenue").reduce((sum, row) => sum + row.balanceMinor, 0);
    const expense = scoped.rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.balanceMinor, 0);
    const cost = scoped.rows.filter((row) => row.type === "expense" && row.code.startsWith("5")).reduce((sum, row) => sum + row.balanceMinor, 0);
    return { period, revenue, expense, cost, result: revenue - expense, journals: scoped.journalCount };
  });
  const withActivity = series.filter((row) => row.journals > 0);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Months with postings" value={String(withActivity.length)} meta={`of the last ${months.length}`} />
        <Stat label="Average monthly revenue" value={withActivity.length ? context.money(Math.round(withActivity.reduce((sum, row) => sum + row.revenue, 0) / withActivity.length)) : "Unavailable"} unavailable={withActivity.length === 0} meta="Months with no posting are excluded, not counted as zero" />
        <Stat label="Average gross margin" value={withActivity.some((row) => row.revenue) ? `${Math.round((withActivity.reduce((sum, row) => sum + (row.revenue - row.cost), 0) / Math.max(1, withActivity.reduce((sum, row) => sum + row.revenue, 0))) * 100)}%` : "Unavailable"} unavailable={!withActivity.some((row) => row.revenue)} />
        <Stat prov="posted" label="Posted journals" value={String(data.postedCount)} />
      </StatRow>
      <DataGrid
        rows={series}
        rowId={(row) => row.period}
        label="Management figures by month"
        filterable={false}
        columns={[
          { key: "period", header: "Month", primary: true, cell: (row) => periodLabel(row.period, org.locale), sortValue: (row) => row.period },
          { key: "journals", header: "Posted", align: "end", cell: (row) => <span className="ds-num">{row.journals}</span> },
          { key: "revenue", header: "Revenue", align: "end", cell: (row) => row.journals ? <Amount minor={row.revenue} context={context} /> : <span className="ds-subtle">No postings</span> },
          { key: "cost", header: "Cost of sales", align: "end", cell: (row) => row.journals ? <Amount minor={row.cost} context={context} /> : <span className="ds-subtle">—</span> },
          { key: "margin", header: "Gross margin", align: "end", cell: (row) => row.journals ? <Amount minor={row.revenue - row.cost} context={context} /> : <span className="ds-subtle">—</span> },
          { key: "expense", header: "Total cost", align: "end", cell: (row) => row.journals ? <Amount minor={row.expense} context={context} /> : <span className="ds-subtle">—</span> },
          { key: "result", header: "Result", align: "end", cell: (row) => row.journals ? <Amount minor={row.result} context={context} bold /> : <span className="ds-subtle">—</span> },
        ]}
      />
      <SourceNote>A month with no posted journal shows “No postings” rather than a zero, because the two mean different things.</SourceNote>
    </Stack>
  );
}

export function CustomReportTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [types, setTypes] = useState<AccountType[]>(["revenue", "expense"]);
  const [period, setPeriod] = useState<string>("all");
  const [minimum, setMinimum] = useState("0");

  const scoped = trialForRange(data.accounts, data.journals, org.id, period === "all" ? undefined : { period });
  const rows = (period === "all" ? data.trialRows : scoped.rows)
    .filter((row) => types.includes(row.type))
    .filter((row) => Math.abs(row.balanceMinor) >= (Number(minimum) || 0) * 100);

  return (
    <Stack gap={4}>
      <Card eyebrow="BUILDER" title="Build a report" subtitle="Choose the account types, the period and a floor">
        <Row gap={4} wrap>
          <Stack gap={2}>
            <span className="ds-stat-label">Account types</span>
            <Row gap={3} wrap>
              {(["asset", "liability", "equity", "revenue", "expense"] as AccountType[]).map((type) => (
                <Checkbox
                  key={type}
                  label={ACCOUNT_TYPE_LABEL[type]}
                  checked={types.includes(type)}
                  onChange={(event) => setTypes((current) => (event.target.checked ? [...current, type] : current.filter((item) => item !== type)))}
                />
              ))}
            </Row>
          </Stack>
          <Field label="Period">
            <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="all">Since the first posting</option>
              {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
            </Select>
          </Field>
          <Field label="Only balances above" hint="In whole units">
            <TextInput aria-label="Only balances above" align="end" inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value.replace(/[^0-9.]/g, ""))} />
          </Field>
        </Row>
      </Card>

      {rows.length === 0 ? (
        <Empty title="Nothing matches" icon={<BarChart3 size={20} />}>Widen the types, the period or the floor.</Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.accountId}
          label="Custom report"
          columns={[
            { key: "code", header: "Code", cell: (row) => <code className="ds-num">{row.code}</code>, sortValue: (row) => row.code },
            { key: "name", header: "Account", primary: true, cell: (row) => row.name, filterValue: (row) => row.name },
            { key: "type", header: "Type", cell: (row) => ACCOUNT_TYPE_LABEL[row.type] },
            { key: "balance", header: "Balance", align: "end", cell: (row) => <Amount minor={row.balanceMinor} context={context} bold />, sortValue: (row) => row.balanceMinor },
          ]}
          summary={<Amount minor={rows.reduce((sum, row) => sum + row.balanceMinor, 0)} context={context} bold />}
        />
      )}
      <Row gap={2}>
        <Button variant="secondary" onClick={() => exportStatement(context, "tb", rows, period)}>Export this report</Button>
        <Button variant="ghost" onClick={() => context.openOverlay("Report designer")}>Save it as a definition</Button>
      </Row>
    </Stack>
  );
}

export function ScheduledTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const schedules = data.budgets.filter((budget) => budget.fields.kind === "reportSchedule");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A schedule cannot run on its own here">
        Nothing in this workspace runs in the background and no mail provider is connected, so a scheduled report is a reminder of what to export, not a delivery.
      </Notice>
      {schedules.length === 0 ? (
        <Empty title="No schedule defined" action={<Button variant="primary" onClick={() => context.openOverlay("schedule")}>Define one</Button>}>
          A definition records which statement, which period and who wants it.
        </Empty>
      ) : (
        <DataGrid
          rows={schedules}
          rowId={(row) => row.id}
          label="Scheduled reports"
          columns={[
            { key: "title", header: "Report", primary: true, cell: (row) => row.title },
            { key: "cadence", header: "Cadence", cell: (row) => String(row.fields.cadence ?? "monthly") },
            { key: "recipient", header: "For", cell: (row) => String(row.fields.recipient ?? row.ownerName) },
            { key: "state", header: "Delivery", cell: () => <Pill tone="warning">Not connected</Pill> },
          ]}
        />
      )}
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function ReportDesigner({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState<Statement>("pl");
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Field label="Report name" required><TextInput aria-label="Report name" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Based on">
        <Select aria-label="Based on" value={statement} onChange={(event) => setStatement(event.target.value as Statement)}>
          {(Object.keys(STATEMENT_LABEL) as Statement[]).map((key) => <option key={key} value={key}>{STATEMENT_LABEL[key]}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Source", value: "Posted journals in this workspace" },
        { label: "Accounts available", value: String(data.accounts.length) },
        { label: "Periods available", value: data.periods.length ? data.periods.join(", ") : "None" },
      ]} />
      <Notice tone="info" title="A definition is a record, not a file">
        Saving stores which statement and period you chose. Exporting still writes the CSV from live records.
      </Notice>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!title.trim()}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "budgets",
              title: title.trim(),
              status: "active",
              summary: `Report definition over ${STATEMENT_LABEL[statement]}.`,
              fields: { kind: "reportSchedule", statement, cadence: "monthly", recipient: context.actor },
            }, `Report definition ${title.trim()} saved`);
            context.toast("Definition saved", "It appears under Scheduled. Nothing will be sent, because no mail provider is connected.");
            setBusy(false);
            close();
          }}
        >
          Save the definition
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function SourceNoteOverlay({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const consolidation = consolidate(data.entities, data.journals);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Source", value: "Posted journals and the chart of accounts in this browser" },
        { label: "Posted journals", value: String(data.postedCount) },
        { label: "Drafts excluded", value: String(data.draftJournals.length) },
        { label: "Earliest posting", value: data.periods.length ? periodLabel(data.periods[data.periods.length - 1], org.locale) : "None" },
        { label: "Latest posting", value: data.periods.length ? periodLabel(data.periods[0], org.locale) : "None" },
        { label: "Bank feed", value: <Pill tone="warning">Not connected</Pill> },
        { label: "Entities with postings", value: String(consolidation.columns.filter((column) => column.debitMinor > 0).length) },
      ]} />
      <Notice tone="info" title="What is never mixed in">
        A draft journal, a forecast assumption and an imported statement line are all excluded from these statements. Only a posted journal moves a reported figure.
      </Notice>
      <Card prov="posted" title="Journals that would break a statement" subtitle="Posted entries whose lines do not balance">
        <UnbalancedPosted context={context} />
      </Card>
    </Stack>
  );
}

function UnbalancedPosted({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const bad = data.journals.filter((journal) => {
    if (journal.status !== "posted") return false;
    const lines = journalLines(journal);
    return lines.reduce((sum, line) => sum + line.debitMinor, 0) !== lines.reduce((sum, line) => sum + line.creditMinor, 0);
  });
  if (bad.length === 0) return <Pill tone="success" dot>Every posted journal balances</Pill>;
  return (
    <Stack gap={2}>
      {bad.map((journal) => (
        <Row key={journal.id} gap={3}>
          <span className="ds-grow">{journal.title}</span>
          <Amount minor={journalLines(journal).reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0)} context={context} bold tone="danger" />
        </Row>
      ))}
    </Stack>
  );
}

export function ReportSchedule({ context, close }: { context: ScreenContext; close: () => void }) {
  const [cadence, setCadence] = useState("monthly");
  const [recipient, setRecipient] = useState(context.actor);
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Nothing will be delivered">
        No mail provider is connected and nothing in this workspace runs while the tab is closed. A schedule is a note of intent.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Cadence">
          <Select aria-label="Cadence" value={cadence} onChange={(event) => setCadence(event.target.value)}>
            {["weekly", "monthly", "quarterly"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="For"><TextInput aria-label="For" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></Field>
      </Row>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "budgets",
              title: `${cadence} statements for ${recipient}`,
              status: "active",
              summary: "A reminder of which statements to export and for whom.",
              fields: { kind: "reportSchedule", cadence, recipient, delivery: "not_connected" },
            }, `Report schedule recorded for ${recipient}`);
            context.toast("Schedule recorded", "It is a local reminder. Nothing will be sent.", "info");
            setBusy(false);
            close();
          }}
        >
          Record the schedule
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function DrillDown({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { accountId?: string } | undefined;
  const account = data.accounts.find((item) => item.id === (payload?.accountId ?? context.selectedId));
  const rows = useMemo(() => {
    if (!account) return [] as { id: string; journal: Rec; debitMinor: number; creditMinor: number }[];
    return data.journals
      .filter((journal) => journal.status === "posted")
      .flatMap((journal) => journalLines(journal)
        .filter((line) => line.accountId === account.id)
        .map((line, index) => ({ id: `${journal.id}-${index}`, journal, debitMinor: line.debitMinor, creditMinor: line.creditMinor })));
  }, [data.journals, account]);

  if (!account) return <Empty title="Choose an account to drill into" />;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Account", value: `${String(account.fields.code)} ${account.title}` },
        { label: "Posted lines", value: String(rows.length) },
        { label: "Balance", value: <Amount minor={data.trialRows.find((row) => row.accountId === account.id)?.balanceMinor} context={context} bold /> },
      ]} />
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`Postings on ${account.title}`}
        filterable={false}
        columns={[
          { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(row.journal.at)}</span>, sortValue: (row) => row.journal.at ?? "" },
          { key: "journal", header: "Journal", primary: true, cell: (row) => row.journal.title },
          { key: "debit", header: "Debit", align: "end", cell: (row) => <Amount minor={row.debitMinor} context={context} /> },
          { key: "credit", header: "Credit", align: "end", cell: (row) => <Amount minor={row.creditMinor} context={context} /> },
        ]}
        onOpen={() => { context.closeOverlay(); context.navigate(`/o/${org.slug}/fin/ledger`); }}
      />
    </Stack>
  );
}
