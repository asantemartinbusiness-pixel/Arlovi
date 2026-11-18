import { useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, FileWarning, Landmark, ReceiptText, ScrollText } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, Empty, Grid, LineChart, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, Field, TextArea,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import {
  ageBuckets, cashFlow, monthlyMovement, periodLabel, recentPeriods, reconcile, trialForRange,
} from "@/domain/fin-ledger";
import { contactOf, openInvoices, outstandingMinor, receivablePosition, useFinData } from "./data";
import { Amount, BooksLoading, CapabilityNotice, CapabilityPill, LedgerHealth, OverdueBadge, SourceNote, StatementRow, StatusPill } from "./parts";

/* ---------------------------- FIN-001 ---------------------------- */

export function FinanceOverview({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const { open, receivableMinor: receivable, overdue } = receivablePosition(data.invoices, now);
  const payables = data.bills.filter((bill) => !["paid", "void"].includes(bill.status));
  const payableMinor = payables.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0);
  const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
  const age = freshness(data.cash.lastPosted, now, 7);
  const months = recentPeriods(now, 6);
  const month = trialForRange(data.accounts, data.journals, org.id, { period: data.currentPeriod });
  const pl = { revenue: month.rows.filter((row) => row.type === "revenue").reduce((sum, row) => sum + row.balanceMinor, 0), expense: month.rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.balanceMinor, 0) };

  if (!data.ready) return <BooksLoading />;
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat prov="posted"
          label="Cash on the ledger"
          value={context.money(data.cash.amountMinor)}
          meta={age.known ? `Last posting ${context.relative(data.cash.lastPosted)}${age.stale ? " · stale" : ""}` : "No posting recorded"}
          onClick={() => context.openOverlay("Metric drilldown", { metric: "cash" })}
        />
        <Stat
          label="Bank statement balance"
          value={recon.statementClosingMinor === undefined ? "Unverified" : context.money(recon.statementClosingMinor)}
          unavailable={recon.statementClosingMinor === undefined}
          meta={recon.statement ? `From ${recon.statement.filename}, imported by hand` : "No feed and no statement imported"}
          onClick={() => context.openOverlay("Metric drilldown", { metric: "bank" })}
        />
        <Stat prov="posted"
          label="Receivable"
          value={context.money(receivable)}
          meta={`${open.length} open · ${overdue.length} past due`}
          delta={overdue.length ? { dir: "down", text: `${context.money(overdue.reduce((sum, invoice) => sum + outstandingMinor(invoice), 0))} late` } : undefined}
          onClick={() => context.openOverlay("Metric drilldown", { metric: "receivable" })}
        />
        <Stat prov="posted"
          label="Payable"
          value={context.money(payableMinor)}
          meta={`${payables.length} bills unpaid`}
          onClick={() => context.openOverlay("Metric drilldown", { metric: "payable" })}
        />
        <Stat prov="posted"
          label={`Result · ${periodLabel(data.currentPeriod, org.locale)}`}
          value={context.money(pl.revenue - pl.expense)}
          meta={`${month.journalCount} posted journals this month`}
          onClick={() => context.openOverlay("Metric drilldown", { metric: "result" })}
        />
      </StatRow>

      <LedgerHealth
        context={context}
        booksBalance={data.statements.booksBalance}
        equationHolds={data.statements.equationHolds}
        difference={data.statements.debit - data.statements.credit}
      />

      <Grid>
        <Card prov="posted" eyebrow="LEDGER" span={8} title="Revenue and cost by month" subtitle="Posted journals only. Drafts and forecasts are excluded.">
          <BarChart
            title="Revenue and cost of sales by month"
            height={220}
            format={(value) => context.money(value)}
            series={[
              { name: "Revenue", points: monthlyMovement(data.accounts, data.journals, "revenue", months).map((point) => ({ label: periodLabel(point.period, org.locale).slice(0, 3), value: point.amountMinor })) },
              { name: "Expense", points: monthlyMovement(data.accounts, data.journals, "expense", months).map((point) => ({ label: periodLabel(point.period, org.locale).slice(0, 3), value: point.amountMinor })) },
            ]}
            footer={`Six months to ${periodLabel(data.currentPeriod, org.locale)}. ${data.postedCount} journals are posted in this workspace.`}
          />
        </Card>

        <Card prov="human" eyebrow="BANK" span={4} title="Reconciling" subtitle={recon.statement ? `${recon.statement.filename}` : "Nothing imported"}
          actions={<CapabilityPill id="bank.feed" />}>
          {recon.statement ? (
            <Stack gap={3}>
              <StatementRow
                context={context}
                rows={[
                  { label: "Statement closing", minor: recon.statementClosingMinor },
                  { label: "Ledger on 1000", minor: recon.ledgerMinor },
                  { label: "Difference", minor: recon.differenceMinor, bold: true },
                  { label: "Explained by open lines", minor: recon.needsPostingMinor },
                  { label: "Unexplained", minor: recon.unexplainedMinor, bold: true, note: recon.unexplainedMinor === 0 ? "Every penny of the difference is accounted for." : "Investigate before confirming." },
                ]}
              />
              <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/fin/reconciliation`)}>
                Open reconciliation
              </Button>
            </Stack>
          ) : (
            <Empty title="No statement imported" icon={<Banknote size={20} />}>
              Import a CSV statement to reconcile. No bank feed is connected, so there is no balance to verify against.
            </Empty>
          )}
        </Card>

        <Card prov="posted" eyebrow="RECEIVABLES" span={7} title="Invoices due" subtitle={`${open.length} open, oldest first`} flush>
          {open.length === 0 ? (
            <Empty title="Nothing outstanding" icon={<ReceiptText size={20} />}>Every issued invoice is settled in this ledger.</Empty>
          ) : (
            <DataGrid
              rows={[...open].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))}
              rowId={(row) => row.id}
              label="Invoices due"
              filterable={false}
              pageSize={6}
              rowTone={(row) => (row.dueAt && new Date(row.dueAt) < now ? "warning" : undefined)}
              columns={[
                { key: "number", header: "Invoice", primary: true, cell: (row) => <Link to={`/o/${org.slug}/fin/invoices/${row.id}`} style={{ color: "inherit" }}>{row.title}</Link> },
                { key: "customer", header: "Customer", cell: (row) => contactOf(data, row)?.title ?? "Not linked", hideBelow: 900 },
                { key: "due", header: "Due", cell: (row) => <OverdueBadge record={row} context={context} /> },
                { key: "amount", header: "Outstanding", align: "end", cell: (row) => <Amount minor={outstandingMinor(row)} context={context} /> },
              ]}
              onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
              summary={<Amount minor={receivable} context={context} bold />}
            />
          )}
        </Card>

        <Card prov="posted" eyebrow="AGEING" span={5} title="Receivables ageing" subtitle="By days past the due date">
          <Stack gap={3}>
            {ageBuckets(open, now).map((bucket) => (
              <Row key={bucket.bucket} gap={3}>
                <span className="ds-grow">{bucket.bucket}</span>
                <span className="ds-subtle">{bucket.count}</span>
                <Amount minor={bucket.amountMinor} context={context} />
              </Row>
            ))}
            <SourceNote>Computed from {open.length} open invoice records at {context.date(now)}.</SourceNote>
          </Stack>
        </Card>

        <Card prov="unknown" eyebrow="SOURCES" span={12} title="Source status" subtitle="What this workspace can and cannot verify">
          <Grid>
            <div className="ds-col-6"><CapabilityNotice id="bank.feed" /></div>
            <div className="ds-col-6"><CapabilityNotice id="tax.file" /></div>
          </Grid>
        </Card>
      </Grid>
    </Stack>
  );
}

export function CashflowTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const [horizon, setHorizon] = useState<"3" | "6" | "12">("6");
  const months = recentPeriods(now, Number(horizon));
  const flow = cashFlow(data.accounts, data.journals);
  const byMonth = months.map((period) => {
    const scoped = cashFlow(data.accounts, data.journals, { from: `${period}-01`, to: `${period}-31` });
    return { period, amountMinor: scoped.movementMinor };
  });
  let running = flow.closingMinor - byMonth.reduce((sum, point) => sum + point.amountMinor, 0);
  const cumulative = byMonth.map((point) => { running += point.amountMinor; return { label: periodLabel(point.period, org.locale).slice(0, 3), value: running }; });

  return (
    <Grid>
      <Card prov="human"
        span={8}
        title="Cash on the ledger"
        subtitle="Closing balance on the cash accounts at the end of each month"
        actions={<Segmented label="Horizon" value={horizon} onChange={setHorizon} options={[{ value: "3", label: "3m" }, { value: "6", label: "6m" }, { value: "12", label: "12m" }]} />}
      >
        <LineChart
          title="Cash balance by month"
          height={230}
          format={(value) => context.money(value)}
          series={[{ name: "Cash", points: cumulative }]}
          footer={`Derived from ${data.postedCount} posted journals touching ${flow.cashAccountIds.length} cash accounts. No bank feed confirms these balances.`}
        />
      </Card>
      <Card prov="posted" eyebrow="CASH FLOW" span={4} title="Movement by activity" subtitle="Classified by the account on the other side of each entry">
        <StatementRow
          context={context}
          rows={[
            { label: "Operating", minor: flow.operatingMinor },
            { label: "Investing", minor: flow.investingMinor },
            { label: "Financing", minor: flow.financingMinor },
            { label: "Net movement", minor: flow.movementMinor, bold: true },
            { label: "Closing cash", minor: flow.closingMinor, bold: true },
          ]}
        />
        <SourceNote>Equity and 27xx loan accounts count as financing, 15xx fixed assets as investing, everything else as operating.</SourceNote>
      </Card>
      <Card prov="posted" eyebrow="CASH FLOW" span={12} title="Largest cash movements" subtitle="Every line is a posted journal, not an estimate" flush>
        <DataGrid
          rows={flow.rows}
          rowId={(row) => `${row.activity}-${row.label}`}
          label="Cash movements by account"
          columns={[
            { key: "activity", header: "Activity", cell: (row) => <Pill tone={row.activity === "operating" ? "info" : row.activity === "financing" ? "accent" : "warning"}>{row.activity}</Pill>, filterValue: (row) => row.activity },
            { key: "label", header: "Counterpart account", primary: true, cell: (row) => row.label, filterValue: (row) => row.label },
            { key: "amount", header: "Cash effect", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} />, sortValue: (row) => row.amountMinor },
          ]}
        />
      </Card>
    </Grid>
  );
}

export function FinanceTasks({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
  const unresolvedTax = data.invoices.filter((invoice) => invoice.fields.taxUnresolved === true && invoice.status !== "void");
  const open = openInvoices(data.invoices);
  const overdue = open.filter((invoice) => invoice.dueAt && new Date(invoice.dueAt) < now);
  const billExceptions = data.bills.filter((bill) => bill.fields.exception);
  const receiptless = data.expenses.filter((expense) => expense.fields.hasReceipt === false && expense.status !== "rejected");

  const tasks = [
    { id: "drafts", title: `${data.draftJournals.length} draft journal${data.draftJournals.length === 1 ? "" : "s"} waiting to post`, body: "A draft journal is not in any statement until it is posted.", to: `/o/${org.slug}/fin/ledger`, count: data.draftJournals.length, tone: "info" as const },
    { id: "recon", title: `${recon.needsPosting.length + recon.suggested.length} statement lines open`, body: recon.blockedReason ?? "The statement reconciles.", to: `/o/${org.slug}/fin/reconciliation`, count: recon.needsPosting.length + recon.suggested.length, tone: "warning" as const },
    { id: "tax", title: `${unresolvedTax.length} document${unresolvedTax.length === 1 ? "" : "s"} with an unresolved tax rate`, body: "No approved rate matches the jurisdiction, category, customer status and date.", to: `/o/${org.slug}/fin/tax`, count: unresolvedTax.length, tone: "danger" as const },
    { id: "overdue", title: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past due`, body: "Reminders are drafted locally; no mail provider is connected.", to: `/o/${org.slug}/fin/invoices`, count: overdue.length, tone: "warning" as const },
    { id: "bills", title: `${billExceptions.length} bill exception${billExceptions.length === 1 ? "" : "s"}`, body: "Unmatched suppliers, possible duplicates and past-due bills.", to: `/o/${org.slug}/fin/bills`, count: billExceptions.length, tone: "warning" as const },
    { id: "receipts", title: `${receiptless.length} expense claim${receiptless.length === 1 ? "" : "s"} with no receipt`, body: "Policy requires a receipt above 1.00.", to: `/o/${org.slug}/fin/expenses`, count: receiptless.length, tone: "info" as const },
  ].filter((task) => task.count > 0);

  if (tasks.length === 0) {
    return <Empty title="Nothing is waiting on Finance" icon={<ScrollText size={20} />}>Drafts, open statement lines, unresolved tax codes and overdue invoices all appear here.</Empty>;
  }

  return (
    <Grid>
      {tasks.map((task) => (
        <Card prov="posted" key={task.id} span={6} title={task.title} subtitle={task.body}
          actions={<Pill tone={task.tone}>{task.count}</Pill>}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(task.to)}>Open</Button>}
        />
      ))}
    </Grid>
  );
}

export function FinanceInsights({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const months = recentPeriods(now, 3);
  const revenue = monthlyMovement(data.accounts, data.journals, "revenue", months);
  const expense = monthlyMovement(data.accounts, data.journals, "expense", months);
  const open = openInvoices(data.invoices);
  const worst = [...open].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0];
  const unresolved = data.invoices.filter((invoice) => invoice.fields.taxUnresolved === true);

  const notes: { id: string; title: string; body: string; evidence: string; to?: string }[] = [];
  const latest = revenue.at(-1);
  const previous = revenue.at(-2);
  if (latest && previous && previous.amountMinor !== 0) {
    const change = ((latest.amountMinor - previous.amountMinor) / Math.abs(previous.amountMinor)) * 100;
    notes.push({
      id: "revenue",
      title: `Revenue is ${change >= 0 ? "up" : "down"} ${Math.abs(Math.round(change))}% on last month`,
      body: `${context.money(latest.amountMinor)} posted in ${periodLabel(latest.period, org.locale)} against ${context.money(previous.amountMinor)} in ${periodLabel(previous.period, org.locale)}.`,
      evidence: "Movement on revenue accounts in posted journals for each month.",
      to: `/o/${org.slug}/fin/reports`,
    });
  }
  const latestExpense = expense.at(-1);
  if (latest && latestExpense) {
    notes.push({
      id: "margin",
      title: latest.amountMinor - latestExpense.amountMinor >= 0 ? "The month is in profit on posted entries" : "The month is in loss on posted entries",
      body: `${context.money(latest.amountMinor)} of revenue against ${context.money(latestExpense.amountMinor)} of cost gives ${context.money(latest.amountMinor - latestExpense.amountMinor)}.`,
      evidence: "Revenue and expense account movement for the current month, posted journals only.",
      to: `/o/${org.slug}/fin/reports`,
    });
  }
  if (worst?.dueAt && new Date(worst.dueAt) < now) {
    notes.push({
      id: "oldest",
      title: `${worst.title} is the oldest unpaid invoice`,
      body: `${context.money(outstandingMinor(worst))} outstanding, due ${context.date(worst.dueAt)}.`,
      evidence: `Invoice record ${worst.id}. Chasing is a local draft; no mail provider is connected.`,
      to: `/o/${org.slug}/fin/invoices/${worst.id}`,
    });
  }
  if (unresolved.length > 0) {
    notes.push({
      id: "tax",
      title: `${unresolved.length} document${unresolved.length === 1 ? "" : "s"} carry an unresolved tax code`,
      body: "An unresolved line is not treated as zero-rated. It is held as UNKNOWN until a rate is approved.",
      evidence: unresolved.map((invoice) => invoice.title).join(", "),
      to: `/o/${org.slug}/fin/tax`,
    });
  }

  return (
    <Stack gap={4}>
      <Notice tone="info" title="These notes are arithmetic, not a model">
        No language model is connected. Each note below names the records it was computed from, and you can open them.
      </Notice>
      <Grid>
        {notes.map((note) => (
          <Card prov="posted" key={note.id} span={6} title={note.title} subtitle={note.body}
            footer={<>
              {note.to && <Button size="sm" variant="secondary" onClick={() => context.navigate(note.to!)}>Open the source</Button>}
              <span className="ds-grow" />
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("correction proposal", { note: note.title })}>Propose a correction</Button>
            </>}
          >
            <Properties rows={[{ label: "Computed from", value: note.evidence }]} />
          </Card>
        ))}
        {notes.length === 0 && <Empty title="Nothing notable" icon={<FileWarning size={20} />}>Notes appear when a month moves, an invoice ages or a tax code cannot be resolved.</Empty>}
      </Grid>
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function MetricDrilldown({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "cash";

  if (metric === "bank") {
    const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
    return (
      <Stack gap={4}>
        <CapabilityNotice id="bank.feed" />
        {recon.statement ? (
          <Properties rows={[
            { label: "Source", value: `${recon.statement.filename}, uploaded by hand` },
            { label: "Period", value: `${context.date(recon.statement.from)} to ${context.date(recon.statement.to)}` },
            { label: "Opening", value: context.money(recon.statement.openingMinor) },
            { label: "Closing", value: context.money(recon.statement.closingMinor) },
            { label: "Ledger balance", value: context.money(recon.ledgerMinor) },
            { label: "Difference", value: context.money(recon.differenceMinor ?? 0) },
            { label: "Verified by a provider", value: <Pill tone="warning">No</Pill> },
          ]} />
        ) : <Empty title="No statement" />}
      </Stack>
    );
  }

  if (metric === "cash") {
    const cashAccounts = data.accounts.filter((account) => cashFlow(data.accounts, data.journals).cashAccountIds.includes(account.id));
    return (
      <Stack gap={4}>
        <p className="ds-subtle">The balance is the sum of posted debits less posted credits on every cash account. Nothing is taken from a feed.</p>
        <StatementRow
          context={context}
          rows={[
            ...cashAccounts.map((account) => ({
              label: `${String(account.fields.code)} ${account.title}`,
              minor: data.trialRows.find((row) => row.accountId === account.id)?.balanceMinor,
            })),
            { label: "Total cash", minor: data.cash.amountMinor, bold: true },
          ]}
        />
        <Properties rows={[
          { label: "Last posting", value: data.cash.lastPosted ? context.date(data.cash.lastPosted) : "None" },
          { label: "Age", value: data.cash.lastPosted ? `${freshness(data.cash.lastPosted, now).days} days` : "Unknown" },
        ]} />
      </Stack>
    );
  }

  if (metric === "result") {
    const month = trialForRange(data.accounts, data.journals, org.id, { period: data.currentPeriod });
    return (
      <Stack gap={4}>
        <p className="ds-subtle">{month.journalCount} journals are posted with a ledger date inside {periodLabel(data.currentPeriod, org.locale)}. Drafts are excluded.</p>
        <StatementRow
          context={context}
          rows={month.rows.filter((row) => ["revenue", "expense"].includes(row.type) && row.balanceMinor !== 0)
            .map((row) => ({ label: `${row.code} ${row.name}`, minor: row.balanceMinor }))}
        />
      </Stack>
    );
  }

  const rows = metric === "payable"
    ? data.bills.filter((bill) => !["paid", "void"].includes(bill.status))
    : openInvoices(data.invoices);
  return (
    <Stack gap={3}>
      <p className="ds-subtle">Each row below is the record the figure was summed from.</p>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Metric sources"
        filterable={false}
        columns={[
          { key: "title", header: metric === "payable" ? "Bill" : "Invoice", primary: true, cell: (row) => row.title },
          { key: "status", header: "Status", cell: (row) => <StatusPill status={row.status} /> },
          { key: "due", header: "Due", cell: (row) => context.date(row.dueAt) },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={metric === "payable" ? row.amountMinor : outstandingMinor(row)} context={context} /> },
        ]}
        onOpen={(id) => { context.closeOverlay(); context.navigate(`/o/${org.slug}/fin/${metric === "payable" ? "bills" : `invoices/${id}`}`); }}
      />
    </Stack>
  );
}

export function PeriodSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [period, setPeriod] = useState(data.periods[0] ?? data.currentPeriod);
  const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
  const revenue = scoped.rows.filter((row) => row.type === "revenue").reduce((sum, row) => sum + row.balanceMinor, 0);
  const expense = scoped.rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.balanceMinor, 0);
  return (
    <Stack gap={4}>
      <Field label="Reporting period" hint="Only months with at least one posted journal are listed.">
        <Select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
        </Select>
      </Field>
      <StatementRow
        context={context}
        rows={[
          { label: "Posted journals", minor: undefined, note: `${scoped.journalCount} in ${periodLabel(period, org.locale)}` },
          { label: "Revenue", minor: revenue },
          { label: "Expense", minor: expense },
          { label: "Result", minor: revenue - expense, bold: true },
        ]}
      />
      {data.locked.includes(period) && <Notice tone="warning" title="This period is closed">No journal can be posted into it until it is reopened from the General Ledger.</Notice>}
      <Row gap={2}>
        <Button variant="primary" onClick={() => { context.navigate(`/o/${org.slug}/fin/reports?tab=Statements`); close(); }}>Open the statements</Button>
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

export function CorrectionProposal({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { note?: string } | undefined;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      id="correction-proposal"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await context.mutate.create({
          collection: "approvals",
          title: `Correction: ${payload?.note ?? "finance figure"}`,
          status: "pending",
          summary: note,
          fields: { kind: "correction", raisedBy: context.actor, screenId: context.screen.id },
        }, "Correction proposed on a finance figure");
        context.toast("Correction recorded", "It is on the approvals list for Finance to action. Nothing in the ledger has changed.");
        setBusy(false);
        close();
      }}
    >
      <Notice tone="info" title="A proposal does not change the ledger">
        This records what you think is wrong. Correcting a posted entry needs a reversal, which Finance posts from the General Ledger.
      </Notice>
      <Field label="What looks wrong" required hint={payload?.note ? `About: ${payload.note}` : undefined}>
        <TextArea aria-label="What looks wrong" value={note} onChange={(event) => setNote(event.target.value)} rows={4} required />
      </Field>
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!note.trim()}>Record the proposal</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </form>
  );
}

export function FinanceOverviewHeader() {
  const data = useFinData();
  const { org } = useWorkspace();
  return (
    <Row gap={3} wrap>
      <Pill tone="neutral" dot>{org.jurisdiction} · {org.currency}</Pill>
      <Pill tone="neutral">{data.accounts.length} accounts</Pill>
      <Pill tone="neutral">{data.postedCount} posted journals</Pill>
      {data.locked.length > 0 && <Pill tone="warning">{data.locked.length} closed period{data.locked.length === 1 ? "" : "s"}</Pill>}
      <span className="ds-grow" />
      <span className="ds-subtle"><Landmark size={14} aria-hidden="true" /> Everything on this screen is computed in this browser.</span>
    </Row>
  );
}
