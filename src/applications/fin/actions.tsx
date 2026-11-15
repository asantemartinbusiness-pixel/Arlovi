import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { capabilityById, CAPABILITY_LABELS } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import { buildReturn } from "@/domain/fin-invoice";
import {
  accountCode, accountType, cashBalance, checkPosting, consolidate, entityOf, journalDate, journalLines, periodLabel,
  periodOf, reconcile, trialForRange,
} from "@/domain/fin-ledger";
import type { JLine } from "@/domain/fin-ledger";
import { supplierOf, useFinData } from "./data";
import type { FinData } from "./data";
import { useInvoice } from "./invoices";
import { exportReturn, periodsWithDocuments } from "./tax";
import { exportStatement, STATEMENT_LABEL, type Statement } from "./reports";
import { AccountLabel, Amount, CapabilityNotice, CapabilityPill, SourceNote, StatementRow } from "./parts";

/* ====================================================================== *
 * Contract actions that perform the named operation.
 *
 * Every overlay here changes a record (or writes a file the person asked
 * for), states its consequence before the principal button, and stops at
 * the provider boundary where a real product would call out.
 * ====================================================================== */

const EXPENSE_CATEGORIES = ["travel", "materials", "marketing", "entertaining", "delivery", "software", "other"];

/** The reimbursement limit above which only the Owner role view may approve. */
const OWNER_APPROVAL_ABOVE_MINOR = 20_000;

function capabilityLine(id: string): string {
  const capability = capabilityById(id);
  return capability ? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}. ${capability.note}` : "";
}

/* ------------------------------ FIN-001 ------------------------------ */

/** Issues a management report for one period from posted journals only. */
export function IssueReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [period, setPeriod] = useState(data.periods[0] ?? data.currentPeriod);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const scoped = trialForRange(data.accounts, data.journals, org.id, { period });
  const revenue = scoped.rows.filter((row) => row.type === "revenue").reduce((sum, row) => sum + row.balanceMinor, 0);
  const expense = scoped.rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + row.balanceMinor, 0);
  const drafts = data.draftJournals.filter((journal) => periodOf(journalDate(journal)) === period);
  const cash = cashBalance(data.accounts, data.journals);
  const bank = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
  const bankVerified = false; // No bank feed exists: the balance is never verified by a provider here.

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Issuing writes a report record">
        The figures below are frozen into a report with your name and the time, and a CSV is written in this browser. Drafts are excluded and listed. Nothing is emailed.
      </Notice>
      <Field label="Reporting period" hint="Only months with at least one posted journal are listed.">
        <Select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {(data.periods.length ? data.periods : [data.currentPeriod]).map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
        </Select>
      </Field>
      <StatementRow
        context={context}
        rows={[
          { label: "Posted journals", minor: undefined, note: `${scoped.journalCount} in ${periodLabel(period, org.locale)}` },
          { label: "Revenue", minor: revenue },
          { label: "Expense", minor: expense },
          { label: "Result", minor: revenue - expense, bold: true },
          { label: "Cash per the ledger", minor: cash.amountMinor, note: "Unverified: no bank feed is connected" },
        ]}
      />
      {!bankVerified && (
        <Notice tone="warning" title="The bank balance is unverified">
          {capabilityLine("bank.feed")} {bank.statement ? `The last imported statement closes at ${context.money(bank.statementClosingMinor ?? 0)}.` : "No statement has been imported."}
        </Notice>
      )}
      {drafts.length > 0 && (
        <Notice tone="warning" title={`${drafts.length} draft journal${drafts.length === 1 ? " is" : "s are"} excluded`}>
          {drafts.map((journal) => journal.title).join(", ")}. A draft is not in any statement until it is posted.
        </Notice>
      )}
      <Field label="Commentary" hint="Kept with the issued report.">
        <TextArea aria-label="Commentary" value={note} rows={3} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={scoped.journalCount === 0}
          title={scoped.journalCount === 0 ? "Nothing is posted in this period" : undefined}
          onClick={async () => {
            setBusy(true);
            const issuedAt = new Date().toISOString();
            const report = await context.mutate.create({
              collection: "reports",
              title: `Management report · ${periodLabel(period, org.locale)}`,
              status: "issued",
              summary: note || `Result ${context.money(revenue - expense)} from ${scoped.journalCount} posted journals.`,
              amountMinor: revenue - expense,
              at: issuedAt,
              tags: ["finance", "management-report"],
              fields: {
                kind: "finance-management", period, revenueMinor: revenue, expenseMinor: expense, resultMinor: revenue - expense,
                cashMinor: cash.amountMinor, bankVerified, journalCount: scoped.journalCount, excludedDrafts: drafts.length,
                issuedBy: context.actor, issuedAt,
              },
              body: { rows: scoped.rows.filter((row) => row.balanceMinor !== 0) },
            }, `Management report issued for ${period}`);
            exportStatement(context, "pl", scoped.rows, period);
            context.toast("Report issued", `${report.title} is recorded with ${context.actor} as issuer. Cash is marked unverified because no bank feed exists.`);
            setBusy(false);
            close();
          }}
        >
          Issue the report
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-002 ------------------------------ */

/** Maps expense and bill categories to the selected account. */
export function MapCategory({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const account = data.accounts.find((item) => item.id === context.selectedId);
  const current = String(account?.fields.mappedCategories ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const [chosen, setChosen] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  if (!account) return <Empty title="Select an account first" />;
  const type = accountType(account);
  const elsewhere = (category: string) => data.accounts.find((item) => item.id !== account.id
    && String(item.fields.mappedCategories ?? "").split(",").map((value) => value.trim()).includes(category));
  const blocked = account.status === "inactive"
    ? "A deactivated account cannot receive new postings."
    : !["expense", "asset"].includes(type) ? "Only expense or asset accounts take spending categories." : undefined;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A mapping decides where new claims and bills post">
        It changes no posted entry. A category mapped here is removed from any other account, so each category posts to exactly one place.
      </Notice>
      <Properties rows={[{ label: "Account", value: <AccountLabel account={account} /> }, { label: "Type", value: type }]} />
      {blocked && <Notice tone="danger" title="This account cannot be mapped">{blocked}</Notice>}
      <Stack gap={2}>
        {EXPENSE_CATEGORIES.map((category) => {
          const other = elsewhere(category);
          return (
            <Row key={category} gap={3}>
              <Checkbox
                label={category}
                checked={chosen.includes(category)}
                disabled={Boolean(blocked)}
                onChange={(event) => setChosen((list) => (event.target.checked ? [...list, category] : list.filter((item) => item !== category)))}
              />
              <span className="ds-grow" />
              {other && <span className="ds-subtle">now {accountCode(other)} {other.title}</span>}
            </Row>
          );
        })}
      </Stack>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("post_journal")}
          onClick={async () => {
            setBusy(true);
            for (const category of chosen) {
              const other = elsewhere(category);
              if (!other) continue;
              const rest = String(other.fields.mappedCategories ?? "").split(",").map((item) => item.trim()).filter((item) => item && item !== category);
              await context.mutate.patch(other.id, { fields: { ...other.fields, mappedCategories: rest.join(",") } }, { expectRevision: other.revision, event: `Category ${category} unmapped from ${accountCode(other)}` });
            }
            await context.mutate.patch(account.id, {
              fields: { ...account.fields, mappedCategories: chosen.join(","), mappedBy: context.actor },
            }, { expectRevision: account.revision, event: `Categories mapped to ${accountCode(account)}: ${chosen.join(", ") || "none"}` });
            context.toast("Mapping saved", `${chosen.length} categor${chosen.length === 1 ? "y posts" : "ies post"} to ${accountCode(account)} ${account.title}.`);
            setBusy(false);
            close();
          }}
        >
          Save the mapping
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-004 ------------------------------ */

export function InvoiceExport({ close, run }: { context: ScreenContext; close: () => void; run: (rows: Rec[], data: FinData) => void }) {
  const data = useFinData();
  const [scope, setScope] = useState("all");
  const rows = scope === "all" ? data.invoices : data.invoices.filter((invoice) => invoice.status === scope);
  return (
    <Stack gap={4}>
      <Field label="Which invoices">
        <Select aria-label="Which invoices" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">Every invoice ({data.invoices.length})</option>
          {["draft", "awaiting_payment", "part_paid", "paid", "void"].map((status) => (
            <option key={status} value={status}>{status.replace(/_/g, " ")} ({data.invoices.filter((invoice) => invoice.status === status).length})</option>
          ))}
        </Select>
      </Field>
      <SourceNote>Each row carries the tax code its lines resolved to. The file is written in this browser; nothing is uploaded.</SourceNote>
      <Row gap={2}>
        <Button variant="primary" disabled={rows.length === 0} onClick={() => { run(rows, data); close(); }}>Download {rows.length} invoices as CSV</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-005 ------------------------------ */

/** Sending an issued invoice: the version is frozen and the send is queued locally. */
export function SendInvoice({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, totals, customer } = useInvoice(context);
  const { org } = useWorkspace();
  const [busy, setBusy] = useState(false);
  if (!invoice) return <Empty title="No invoice selected" />;
  const to = String(customer?.fields.email ?? "");
  const sends = ((invoice.body as { sends?: { revision: number; at: string; by: string; to: string }[] })?.sends ?? []);
  const sameVersion = sends.find((send) => send.revision === invoice.revision);
  const blocked = invoice.status === "draft"
    ? "A draft cannot be sent. Approve and post it first, so the customer receives an immutable version."
    : invoice.status === "void"
      ? "A void invoice cannot be sent."
      : !to ? "The contact record has no email address." : undefined;

  return (
    <Stack gap={4}>
      <CapabilityNotice id="email.send" title="Sending stops at the mail provider" />
      <Properties rows={[
        { label: "To", value: to || "No email on the contact record" },
        { label: "Subject", value: `${org.name} · invoice ${invoice.title}` },
        { label: "Version", value: `Revision ${invoice.revision}, ${context.money(totals.grossMinor)}` },
        { label: "Earlier sends", value: sends.length ? sends.map((send) => `${context.date(send.at)} to ${send.to}`).join(" · ") : "None" },
        { label: "Delivery state", value: <CapabilityPill id="email.send" /> },
      ]} />
      {sameVersion && (
        <Notice tone="warning" title="This exact version is already queued">
          It was queued on {context.dateTime(sameVersion.at)} by {sameVersion.by}. Queuing it again would let a provider send it twice, so it is refused.
        </Notice>
      )}
      {blocked && <Notice tone="danger" title="This invoice cannot be sent">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || Boolean(sameVersion)}
          onClick={async () => {
            setBusy(true);
            const at = new Date().toISOString();
            await context.mutate.patch(invoice.id, {
              body: {
                ...(invoice.body as object ?? {}),
                sends: [...sends, { revision: invoice.revision, at, by: context.actor, to, grossMinor: totals.grossMinor, state: "queued_local" }],
              },
              fields: { ...invoice.fields, sendState: "queued_local", lastQueuedAt: at, sentRevision: invoice.revision },
            }, { expectRevision: invoice.revision, event: `${invoice.title} queued to send to ${to}. Not sent: no mail provider is connected` });
            await context.mutate.log(`Send of ${invoice.title} held at the mail provider boundary`, { entityId: invoice.id, type: "finance.send", capability: "queued_local" });
            context.toast("Queued, not sent", `${invoice.title} revision ${invoice.revision} is queued locally for ${to}. No mail provider is connected, so nothing left this browser.`, "info");
            setBusy(false);
            close();
          }}
        >
          Queue the send
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-006 ------------------------------ */

/** Approving a bill records the approver and, if nothing is posted yet, posts the purchase. */
export function ApproveBill({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const [busy, setBusy] = useState(false);
  const bill = data.bills.find((item) => item.id === context.selectedId);
  if (!bill) return <Empty title="Select a bill first" />;
  const supplier = supplierOf(data, bill);
  const posted = data.journals.find((journal) => journal.id === String(bill.fields.journalId ?? ""));
  const expense = data.accounts.find((account) => accountCode(account) === String(bill.fields.accountCode ?? "6100"));
  const tax = data.accounts.find((account) => accountCode(account) === "2100");
  const ap = data.accounts.find((account) => accountCode(account) === "2000");
  const net = Number(bill.fields.netMinor ?? bill.amountMinor ?? 0);
  const taxMinor = Number(bill.fields.taxMinor ?? 0);
  const gross = Number(bill.amountMinor ?? net + taxMinor);
  const date = (bill.at ?? context.now.toISOString()).slice(0, 10);
  const lines: JLine[] = posted || !expense || !ap ? [] : [
    { accountId: expense.id, debitMinor: net, creditMinor: 0, memo: `${bill.title} · ${expense.title}` },
    ...(taxMinor && tax ? [{ accountId: tax.id, debitMinor: taxMinor, creditMinor: 0, memo: `${bill.title} · input tax` }] : []),
    { accountId: ap.id, debitMinor: 0, creditMinor: taxMinor && tax ? gross : net, memo: `${bill.title} · ${supplier?.title ?? "supplier"}` },
  ];
  const check = posted ? undefined : checkPosting({ lines, period: periodOf(date), locked: data.locked, accounts: data.accounts });
  const blocked = ["approved", "scheduled", "paid"].includes(bill.status)
    ? `${bill.title} is already ${bill.status}${bill.fields.approvedBy ? ` (approved by ${String(bill.fields.approvedBy)})` : ""}.`
    : bill.fields.exception ? `${String(bill.fields.exception)}. Clear the exception before approving.`
      : !bill.fields.supplierId ? "Match the bill to a supplier first."
        : !posted && (!expense || !ap) ? "The chart of accounts lacks the expense account or the 2000 payables account."
          : check?.reason;

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Approval is recorded against your name">
        {posted
          ? `The purchase is already posted as ${posted.title}. Approving records ${context.actor} as approver and makes the bill payable. No money moves.`
          : "Approving records you as approver and posts the purchase: the expense and any input tax are debited and payables is credited. No money moves."}
      </Notice>
      <Properties rows={[
        { label: "Bill", value: bill.title },
        { label: "Supplier", value: supplier?.title ?? "Not matched" },
        { label: "Gross", value: <Amount minor={gross} context={context} bold /> },
        { label: "Due", value: context.date(bill.dueAt) },
      ]} />
      {!posted && lines.length > 0 && (
        <div className="ds-grid-wrap"><div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Purchase journal that will be posted</caption>
            <thead><tr><th>Account</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.accountId}-${index}`}>
                  <td className="ds-table-primary"><AccountLabel account={data.accounts.find((account) => account.id === line.accountId)} /></td>
                  <td data-align="end"><Amount minor={line.debitMinor} context={context} /></td>
                  <td data-align="end"><Amount minor={line.creditMinor} context={context} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {blocked && <Notice tone="danger" title="This bill cannot be approved">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("approve_payment")}
          title={!context.can("approve_payment") ? "Approving needs the Finance or Owner role view" : blocked}
          onClick={async () => {
            setBusy(true);
            let journalId = posted?.id;
            if (!posted) {
              const journal = await context.mutate.create({
                collection: "journals",
                title: `Bill ${bill.title}`,
                status: "posted",
                summary: `Purchase from ${supplier?.title ?? "a supplier"}, approved by ${context.actor}.`,
                amountMinor: lines.reduce((sum, line) => sum + line.debitMinor, 0),
                at: `${date}T09:00:00.000Z`,
                parentId: bill.id,
                tags: ["ledger", "bill"],
                fields: { date, source: "bill", billId: bill.id, postedBy: context.actor },
                body: { date, memo: `Bill ${bill.title}`, lines },
              }, `Purchase posted for bill ${bill.title}`);
              journalId = journal.id;
            }
            const approvedAt = new Date().toISOString();
            const saved = await context.mutate.patch(bill.id, {
              status: "approved",
              fields: { ...bill.fields, approvedBy: context.actor, approvedAt, ...(journalId ? { journalId } : {}) },
            }, { expectRevision: bill.revision, event: `Bill ${bill.title} approved by ${context.actor}` });
            if (saved) context.toast("Bill approved", `${bill.title} is approved by ${context.actor}${posted ? "" : " and the purchase is posted"}. No money has moved.`);
            setBusy(false);
            close();
          }}
        >
          Approve {context.money(gross)}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Scheduling records an intended payment date. Nothing is posted and no money moves. */
export function SchedulePayment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const approved = data.bills.filter((bill) => bill.status === "approved");
  const [chosen, setChosen] = useState<string[]>(context.selectedId && approved.some((bill) => bill.id === context.selectedId) ? [context.selectedId] : approved.map((bill) => bill.id));
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const rows = approved.filter((bill) => chosen.includes(bill.id));
  const total = rows.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0);
  const past = date < now.toISOString().slice(0, 10);

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Scheduling does not pay anyone">
        No bank mandate exists here and no agent can move money. Scheduling records the date you intend to pay and who decided it. When the money has left your bank, record the payment run to post it.
      </Notice>
      {approved.length === 0 ? <Empty title="No approved bill is waiting">Approve a bill first. Only an approved bill can be scheduled.</Empty> : (
        <Stack gap={2}>
          {approved.map((bill) => (
            <Row key={bill.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={`${bill.title} · ${supplierOf(data, bill)?.title ?? "no supplier"} · due ${context.date(bill.dueAt)}`}
                checked={chosen.includes(bill.id)}
                onChange={(event) => setChosen((list) => (event.target.checked ? [...list, bill.id] : list.filter((id) => id !== bill.id)))}
              />
              <span className="ds-grow" />
              <Amount minor={bill.amountMinor} context={context} />
            </Row>
          ))}
        </Stack>
      )}
      <Field label="Pay on" required hint={past ? "That date is in the past." : undefined}>
        <TextInput aria-label="Pay on" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={rows.length === 0 || past || !context.can("approve_payment")}
          onClick={async () => {
            setBusy(true);
            for (const bill of rows) {
              await context.mutate.patch(bill.id, {
                status: "scheduled",
                fields: { ...bill.fields, scheduledFor: date, scheduledBy: context.actor, paymentState: "queued_local" },
              }, { expectRevision: bill.revision, event: `Payment of ${bill.title} scheduled for ${date} by ${context.actor}. No money moved` });
            }
            await context.mutate.log(`${rows.length} supplier payments scheduled for ${date}; held locally, no bank mandate`, { type: "finance.payment", capability: "queued_local" });
            context.toast("Payment scheduled", `${rows.length} bill${rows.length === 1 ? "" : "s"} for ${context.money(total)} scheduled for ${context.date(date)}. Nothing was paid: there is no bank connection.`, "info");
            setBusy(false);
            close();
          }}
        >
          Schedule {context.money(total)}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-007 ------------------------------ */

export function AssignCategory({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const expense = data.expenses.find((item) => item.id === context.selectedId);
  const [category, setCategory] = useState(String(expense?.fields.category ?? "travel"));
  const mapped = data.accounts.find((account) => String(account.fields.mappedCategories ?? "").split(",").map((item) => item.trim()).includes(category));
  const [code, setCode] = useState(String(expense?.fields.accountCode ?? "6000"));
  const [busy, setBusy] = useState(false);
  if (!expense) return <Empty title="Select a claim first" />;
  const options = data.accounts.filter((account) => accountType(account) === "expense" && account.status !== "inactive");
  const locked = ["reimbursed"].includes(expense.status);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Claim", value: expense.title },
        { label: "Current", value: `${String(expense.fields.category ?? "uncategorised")} → ${String(expense.fields.accountCode ?? "not set")}` },
      ]} />
      {locked && <Notice tone="warning" title="This claim is already posted">A reimbursed claim is in the ledger. Correct it with a reversal from the General Ledger.</Notice>}
      <Field label="Category">
        <Select aria-label="Category" value={category} onChange={(event) => {
          setCategory(event.target.value);
          const next = data.accounts.find((account) => String(account.fields.mappedCategories ?? "").split(",").map((item) => item.trim()).includes(event.target.value));
          if (next) setCode(accountCode(next));
        }}>
          {EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Posts to" hint={mapped ? `Mapped to ${accountCode(mapped)} ${mapped.title} in the chart of accounts.` : "No account is mapped to this category yet."}>
        <Select aria-label="Posts to" value={code} onChange={(event) => setCode(event.target.value)}>
          {options.map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={locked}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(expense.id, {
              fields: { ...expense.fields, category, accountCode: code, categorisedBy: context.actor },
            }, { expectRevision: expense.revision, event: `Expense ${expense.title} categorised as ${category} → ${code}` });
            if (saved) context.toast("Category assigned", `${expense.title} is ${category} and will post to ${code}.`);
            setBusy(false);
            close();
          }}
        >
          Assign
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

function expenseRule(expense: Rec, actor: string, role: string): string | undefined {
  const claimant = String(expense.fields.claimant ?? expense.ownerName);
  if (expense.fields.hasReceipt === false) return "No receipt is attached.";
  if (claimant === actor) return `${actor} cannot approve their own claim.`;
  const amount = Number(expense.amountMinor ?? 0);
  if ((amount > OWNER_APPROVAL_ABOVE_MINOR || String(expense.fields.category ?? "") === "entertaining") && role !== "owner") {
    return "Claims over 200.00, and any entertaining, need the Owner to approve.";
  }
  return undefined;
}

export function ApproveExpense({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { role } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const expense = data.expenses.find((item) => item.id === context.selectedId);
  if (!expense) return <Empty title="Select a claim first" />;
  const blocked = ["approved", "reimbursed"].includes(expense.status)
    ? `${expense.title} is already ${expense.status}${expense.fields.approvedBy ? ` by ${String(expense.fields.approvedBy)}` : ""}.`
    : expenseRule(expense, context.actor, role);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Claim", value: expense.title },
        { label: "Claimant", value: String(expense.fields.claimant ?? expense.ownerName) },
        { label: "Amount", value: <Amount minor={expense.amountMinor} context={context} bold /> },
        { label: "Category", value: `${String(expense.fields.category ?? "uncategorised")} → ${String(expense.fields.accountCode ?? "not set")}` },
        { label: "Receipt", value: expense.fields.hasReceipt === false ? <Pill tone="danger">Missing</Pill> : <Pill tone="success" dot>Held</Pill> },
      ]} />
      <Notice tone={blocked ? "danger" : "info"} title={blocked ? "This claim cannot be approved by you" : "Approval records you as approver"}>
        {blocked ?? `${context.actor} is recorded as approver. Nothing is posted until the claim is reimbursed.`}
      </Notice>
      <SourceNote>The limit and the no-self-approval rule are local controls. They shape this interface and are not an account security boundary.</SourceNote>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("approve_payment")}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(expense.id, {
              status: "approved",
              fields: { ...expense.fields, approvedBy: context.actor, approvedAt: new Date().toISOString() },
            }, { expectRevision: expense.revision, event: `Expense ${expense.title} approved by ${context.actor}` });
            if (saved) context.toast("Claim approved", `${expense.title} is approved by ${context.actor}.`);
            setBusy(false);
            close();
          }}
        >
          Approve the claim
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Reimbursement posts the ledger entry and stops at the payment boundary. */
export function ReimburseExpense({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const approved = data.expenses.filter((expense) => expense.status === "approved");
  const initial = approved.find((expense) => expense.id === context.selectedId)?.id ?? approved[0]?.id ?? "";
  const [id, setId] = useState(initial);
  const cash = data.accounts.filter((account) => accountType(account) === "asset" && (account.tags.includes("cash") || accountCode(account).startsWith("10")));
  const [cashId, setCashId] = useState(cash[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const expense = approved.find((item) => item.id === id);
  const account = expense ? data.accounts.find((item) => accountCode(item) === String(expense.fields.accountCode ?? "6000")) : undefined;
  const amount = Number(expense?.amountMinor ?? 0);
  const date = context.now.toISOString().slice(0, 10);
  const lines: JLine[] = expense && account && cashId ? [
    { accountId: account.id, debitMinor: amount, creditMinor: 0, memo: expense.title },
    { accountId: cashId, debitMinor: 0, creditMinor: amount, memo: `Reimbursed ${String(expense.fields.claimant ?? expense.ownerName)}` },
  ] : [];
  const check = checkPosting({ lines, period: periodOf(date), locked: data.locked, accounts: data.accounts });
  const blocked = !expense ? "No approved claim is selected."
    : !expense.fields.approvedBy ? "The claim has no recorded approver."
      : !account ? `No account ${String(expense.fields.accountCode ?? "")} is in the chart of accounts.`
        : check.reason;

  if (approved.length === 0) return <Empty title="No approved claim is waiting">Only an approved claim can be reimbursed.</Empty>;

  return (
    <Stack gap={4}>
      <CapabilityNotice id="payment.capture" title="The money is paid from your bank, not from here" />
      <Field label="Claim">
        <Select aria-label="Claim" value={id} onChange={(event) => setId(event.target.value)}>
          {approved.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.claimant ?? item.ownerName)} · {context.money(item.amountMinor)}</option>)}
        </Select>
      </Field>
      <Field label="Paid from">
        <Select aria-label="Paid from" value={cashId} onChange={(event) => setCashId(event.target.value)}>
          {cash.map((item) => <option key={item.id} value={item.id}>{accountCode(item)} {item.title}</option>)}
        </Select>
      </Field>
      {expense && <Properties rows={[
        { label: "Approved by", value: String(expense.fields.approvedBy ?? "Nobody") },
        { label: "Debit", value: account ? `${accountCode(account)} ${account.title}` : "Missing" },
        { label: "Credit", value: cash.find((item) => item.id === cashId)?.title ?? "Missing" },
        { label: "Amount", value: <Amount minor={amount} context={context} bold /> },
      ]} />}
      {blocked && <Notice tone="danger" title="This reimbursement cannot be recorded">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
          onClick={async () => {
            if (!expense) return;
            setBusy(true);
            const journal = await context.mutate.create({
              collection: "journals",
              title: `Reimburse ${expense.title}`,
              status: "posted",
              summary: `Reimbursement to ${String(expense.fields.claimant ?? expense.ownerName)} recorded locally. Payment itself is made outside this workspace.`,
              amountMinor: amount,
              at: `${date}T09:00:00.000Z`,
              parentId: expense.id,
              tags: ["ledger", "expense"],
              fields: { date, source: "expense", expenseId: expense.id, postedBy: context.actor },
              body: { date, memo: expense.title, lines },
            }, `Expense ${expense.title} reimbursement posted`);
            await context.mutate.patch(expense.id, {
              status: "reimbursed",
              fields: { ...expense.fields, journalId: journal.id, reimbursedAt: new Date().toISOString(), reimbursedBy: context.actor, paymentState: "awaiting_external_confirmation" },
            }, { expectRevision: expense.revision, event: `Expense ${expense.title} reimbursed by ${context.actor}; payment awaits external confirmation` });
            await context.mutate.log(`Reimbursement of ${expense.title} held at the payment boundary`, { entityId: expense.id, type: "finance.payment", capability: "awaiting_external_confirmation" });
            context.toast("Reimbursement recorded", `${context.money(amount)} is posted as a balanced journal. No money moved: pay the claimant from your bank.`, "info");
            setBusy(false);
            close();
          }}
        >
          Record the reimbursement
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-008 ------------------------------ */

export function InspectMismatch({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
  const unmatched = [...recon.suggested.map((item) => item.line), ...recon.needsPosting];
  const linked = new Set(data.bankLines.map((line) => String(line.fields.journalId ?? line.fields.matchedJournalId ?? "")).filter(Boolean));
  const ledgerOnly = data.journals.filter((journal) => journal.status === "posted" && recon.bankAccountId
    && journalLines(journal).some((line) => line.accountId === recon.bankAccountId)
    && !linked.has(journal.id) && !journal.fields.bankLineId
    && (!recon.statement || (journalDate(journal) >= String(recon.statement.from ?? "").slice(0, 10) && journalDate(journal) <= String(recon.statement.to ?? "9999").slice(0, 10))));

  return (
    <Stack gap={4}>
      <CapabilityNotice id="bank.feed" title="The comparison is against an imported statement, not a feed" />
      <StatementRow
        context={context}
        rows={[
          { label: "Statement closing", minor: recon.statementClosingMinor },
          { label: "Ledger balance, 1000", minor: recon.ledgerMinor },
          { label: "Difference", minor: recon.differenceMinor, bold: true },
          { label: "Explained by unmatched lines", minor: recon.needsPostingMinor },
          { label: "Unexplained", minor: recon.unexplainedMinor, bold: true },
        ]}
      />
      {!recon.statement && <Notice tone="warning" title="No statement imported">Import a CSV statement to compare it with the ledger.</Notice>}
      <DataGrid
        rows={unmatched}
        rowId={(row) => row.id}
        label="Statement lines with no ledger match"
        filterable={false}
        empty={<Empty title="Every statement line is matched" />}
        columns={[
          { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
          { key: "line", header: "Statement line", primary: true, cell: (row) => row.title },
          { key: "why", header: "Why", cell: (row) => recon.needsPosting.includes(row) ? "Nothing in the ledger" : "Candidates exist, not confirmed" },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
        ]}
      />
      <DataGrid
        rows={ledgerOnly}
        rowId={(row) => row.id}
        label="Ledger postings to 1000 with no statement line"
        filterable={false}
        empty={<Empty title="No ledger-only postings in the statement window" />}
        columns={[
          { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span> },
          { key: "journal", header: "Journal", primary: true, cell: (row) => row.title },
          { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={journalLines(row).reduce((sum, line) => sum + (line.accountId === recon.bankAccountId ? line.debitMinor - line.creditMinor : 0), 0)} context={context} /> },
        ]}
      />
      <Row gap={2}>
        <Button variant="primary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/fin/reconciliation`); }}>Resolve in reconciliation</Button>
      </Row>
      <SourceNote>Nothing is marked reconciled from here. A mismatch stays open until a person matches or adjusts it.</SourceNote>
    </Stack>
  );
}

/* ------------------------------ FIN-011 ------------------------------ */

/** Reviews a prepared return. Filing itself stops at the tax authority boundary. */
export function ReviewFiling({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const prepared = data.taxCodes.filter((record) => record.fields.kind === "return").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [id, setId] = useState(prepared[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const record = prepared.find((item) => item.id === id);
  const period = String(record?.fields.period ?? "");
  const now = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });
  const drift = record ? now.payableMinor !== Number(record.fields.payableMinor ?? 0) : false;
  const blocked = !record ? "No return has been prepared. Prepare one first."
    : record.status !== "prepared" ? `This return is already ${record.status}${record.fields.reviewedBy ? ` by ${String(record.fields.reviewedBy)}` : ""}.`
      : String(record.fields.preparedBy ?? "") === context.actor ? `${context.actor} prepared this return, so a second person must review it.`
        : drift ? "The documents in the period changed after preparation. Prepare the return again." : undefined;

  if (prepared.length === 0) return <Empty title="No prepared return">Use Prepare a return first. A review needs a prepared set of figures.</Empty>;

  return (
    <Stack gap={4}>
      <Notice tone="danger" title="No compliance claim">
        This workspace is not certified by any tax authority and is not advice. Reviewing records that a second person checked the figures. Filing needs an authorised filing connection, which does not exist here.
      </Notice>
      <Field label="Prepared return">
        <Select aria-label="Prepared return" value={id} onChange={(event) => setId(event.target.value)}>
          {prepared.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
        </Select>
      </Field>
      {record && (
        <Properties rows={[
          { label: "Prepared by", value: String(record.fields.preparedBy ?? "Unknown") },
          { label: "Tax on sales", value: <Amount minor={Number(record.fields.outputTaxMinor ?? 0)} context={context} /> },
          { label: "Tax on purchases", value: <Amount minor={Number(record.fields.inputTaxMinor ?? 0)} context={context} /> },
          { label: "Net payable", value: <Amount minor={Number(record.fields.payableMinor ?? 0)} context={context} bold /> },
          { label: "Recomputed now", value: <Amount minor={now.payableMinor} context={context} /> },
          { label: "Filing state", value: <CapabilityPill id="tax.file" /> },
        ]} />
      )}
      {blocked && <Notice tone="warning" title="The review cannot be recorded">{blocked}</Notice>}
      <Field label="Review note"><TextArea aria-label="Review note" value={note} rows={2} onChange={(event) => setNote(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("export_data")}
          onClick={async () => {
            if (!record) return;
            setBusy(true);
            const saved = await context.mutate.patch(record.id, {
              status: "reviewed",
              fields: { ...record.fields, reviewedBy: context.actor, reviewedAt: new Date().toISOString(), filingState: "not_connected", reviewNote: note },
            }, { expectRevision: record.revision, event: `Return for ${period} reviewed by ${context.actor}. Not filed: no filing connection` });
            await context.mutate.log(`Return for ${period} is ready to file but cannot be submitted from this browser`, { entityId: record.id, type: "finance.tax", capability: "not_connected" });
            if (saved) context.toast("Review recorded", `The ${period} return is reviewed by ${context.actor}. Nothing was submitted to the tax authority.`, "info");
            setBusy(false);
            close();
          }}
        >
          Record the review
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ExportReturnOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const periods = periodsWithDocuments(data.invoices);
  const [period, setPeriod] = useState(periods[0] ?? data.currentPeriod);
  const boxes = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });
  return (
    <Stack gap={4}>
      <Field label="Period">
        <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {(periods.length ? periods : [data.currentPeriod]).map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
        </Select>
      </Field>
      <StatementRow context={context} rows={[
        { label: "Tax on sales", minor: boxes.outputTaxMinor },
        { label: "Tax on purchases", minor: boxes.inputTaxMinor },
        { label: "Net payable", minor: boxes.payableMinor, bold: true },
      ]} />
      {boxes.unknownDocumentIds.length > 0 && <Notice tone="warning" title="Unresolved rates are excluded">{boxes.unknownDocumentIds.length} document(s) are left out of the boxes and counted in the file.</Notice>}
      <Row gap={2}>
        <Button variant="primary" onClick={() => { exportReturn(context, boxes, org.jurisdiction); close(); }}>Download the figures</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-012 ------------------------------ */

export function StatementFilter({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const navigate = useNavigate();
  const [statement, setStatement] = useState<Statement>("pl");
  const [period, setPeriod] = useState("all");
  return (
    <Stack gap={4}>
      <Field label="Statement">
        <Select aria-label="Statement" value={statement} onChange={(event) => setStatement(event.target.value as Statement)}>
          {(Object.keys(STATEMENT_LABEL) as Statement[]).map((key) => <option key={key} value={key}>{STATEMENT_LABEL[key]}</option>)}
        </Select>
      </Field>
      <Field label="Period">
        <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="all">Since the first posting</option>
          {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Button variant="primary" onClick={() => {
          close();
          navigate(`/o/${org.slug}/fin/reports?tab=Statements&statement=${statement}&period=${period}`);
          context.setTab("Statements");
        }}>Apply the filter</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ExportStatements({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [statement, setStatement] = useState<Statement>("pl");
  const [period, setPeriod] = useState("all");
  const rows = useMemo(
    () => (period === "all" ? data.trialRows : trialForRange(data.accounts, data.journals, org.id, { period }).rows),
    [period, data.trialRows, data.accounts, data.journals, org.id],
  );
  return (
    <Stack gap={4}>
      <Field label="Statement">
        <Select aria-label="Statement" value={statement} onChange={(event) => setStatement(event.target.value as Statement)}>
          {(Object.keys(STATEMENT_LABEL) as Statement[]).map((key) => <option key={key} value={key}>{STATEMENT_LABEL[key]}</option>)}
        </Select>
      </Field>
      <Field label="Period">
        <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="all">Since the first posting</option>
          {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
        </Select>
      </Field>
      {data.draftJournals.length > 0 && (
        <Notice tone="info" title="Drafts are not in the file">{data.draftJournals.length} draft journal(s) are excluded. The file holds posted figures only.</Notice>
      )}
      <Row gap={2}>
        <Button variant="primary" onClick={() => { exportStatement(context, statement, rows, period); close(); }}>Download the CSV</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ FIN-013 ------------------------------ */

/** Records the intercompany eliminations for a consolidation. Entity ledgers are untouched. */
export function EliminateIntercompany({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const consolidation = consolidate(data.entities, data.journals);
  const journals = consolidation.eliminatedJournalIds.map((id) => data.journals.find((journal) => journal.id === id)).filter((journal): journal is Rec => Boolean(journal));
  const receivable = data.trialRows.find((row) => row.code === "1900")?.balanceMinor ?? 0;
  const payable = data.trialRows.find((row) => row.code === "2900")?.balanceMinor ?? 0;
  const mismatch = receivable !== payable;
  const already = data.entities.find((record) => record.fields.kind === "elimination"
    && String(record.fields.journalIds ?? "") === consolidation.eliminatedJournalIds.join(" "));
  const [busy, setBusy] = useState(false);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Eliminations live in the consolidation only">
        Each intercompany journal is removed once from the group figures so the same balance is not counted in two entities. No entity ledger is changed and no journal is posted.
      </Notice>
      <StatementRow context={context} rows={[
        { label: "Intercompany receivable, 1900", minor: receivable },
        { label: "Intercompany payable, 2900", minor: payable },
        { label: "To eliminate", minor: consolidation.eliminationMinor, bold: true },
      ]} />
      {mismatch && (
        <Notice tone="danger" title="The two sides do not agree">
          The receivable and the payable differ by {context.money(Math.abs(receivable - payable))}. Eliminating now would leave a difference in the group figures. Find the unmatched intercompany posting first.
        </Notice>
      )}
      {already && <Notice tone="warning" title="These journals are already eliminated">Recorded as {already.title} by {String(already.fields.preparedBy ?? "someone")}.</Notice>}
      <DataGrid
        rows={journals}
        rowId={(row) => row.id}
        label="Intercompany journals to eliminate"
        filterable={false}
        empty={<Empty title="No intercompany journal is posted" />}
        columns={[
          { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span> },
          { key: "journal", header: "Journal", primary: true, cell: (row) => row.title },
          { key: "entity", header: "Entity", cell: (row) => data.entities.find((entity) => entity.id === entityOf(row))?.title ?? entityOf(row) ?? "Untagged" },
          { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={journalLines(row).reduce((sum, line) => sum + line.debitMinor, 0)} context={context} /> },
        ]}
      />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={journals.length === 0 || mismatch || Boolean(already) || !context.can("post_journal")}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "legalEntities",
              title: `Intercompany elimination ${context.date(context.now)}`,
              status: "prepared",
              summary: `${journals.length} intercompany journals eliminated from the group figures. Entity ledgers unchanged.`,
              amountMinor: consolidation.eliminationMinor,
              fields: {
                kind: "elimination", preparedBy: context.actor, journalIds: consolidation.eliminatedJournalIds.join(" "),
                eliminationMinor: consolidation.eliminationMinor, receivableMinor: receivable, payableMinor: payable,
              },
            }, `Intercompany elimination recorded for ${journals.length} journals`);
            context.toast("Elimination recorded", `${context.money(consolidation.eliminationMinor)} across ${journals.length} journals is eliminated in the consolidation. No entity ledger changed.`);
            setBusy(false);
            close();
          }}
        >
          Record the elimination
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

