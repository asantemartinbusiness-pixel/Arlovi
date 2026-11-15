import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, accountCode, accountType, isDebitNormal, journalLines, periodOf, journalDate } from "@/domain/fin-ledger";
import type { AccountType, TrialRow } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import { AccountTypePill, Amount, SourceNote } from "./parts";

/* ---------------------------- FIN-002 ---------------------------- */

interface Node {
  group: string;
  type: AccountType;
  accounts: { account: Rec; row?: TrialRow }[];
  totalMinor: number;
}

/** 1000–1099 becomes "10xx Cash and bank", so the tree has real groups. */
const GROUP_NAMES: Record<string, string> = {
  "10": "Cash and bank",
  "11": "Receivables",
  "12": "Inventory",
  "15": "Fixed assets",
  "19": "Intercompany",
  "20": "Payables",
  "21": "Tax control",
  "22": "Payroll",
  "27": "Loans",
  "29": "Intercompany",
  "30": "Capital",
  "31": "Reserves",
  "40": "Trading revenue",
  "41": "Service revenue",
  "42": "Other revenue",
  "43": "Delivery income",
  "50": "Cost of sales",
  "51": "Inbound freight",
  "60": "Marketing",
  "61": "Premises",
  "62": "Software",
  "63": "People",
  "64": "Insurance",
  "65": "Depreciation",
  "66": "Finance costs",
  "67": "Professional",
  "68": "Retired",
};

function groupOf(account: Rec): string {
  const code = accountCode(account).slice(0, 2);
  return `${code}xx ${GROUP_NAMES[code] ?? "Other"}`;
}

function buildTree(accounts: Rec[], rows: TrialRow[], type?: AccountType): Node[] {
  const scoped = accounts.filter((account) => !type || accountType(account) === type);
  const groups = new Map<string, Node>();
  for (const account of scoped) {
    const key = groupOf(account);
    const row = rows.find((candidate) => candidate.accountId === account.id);
    const found = groups.get(key);
    if (found) {
      found.accounts.push({ account, row });
      found.totalMinor += row?.balanceMinor ?? 0;
    } else {
      groups.set(key, { group: key, type: accountType(account), accounts: [{ account, row }], totalMinor: row?.balanceMinor ?? 0 });
    }
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group));
}

export function ChartOfAccounts({ context, type }: { context: ScreenContext; type?: AccountType }) {
  const data = useFinData();
  const [open, setOpen] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(true);
  const [mode, setMode] = useState<"tree" | "table">("tree");

  const accounts = useMemo(
    () => data.accounts.filter((account) => showInactive || account.status !== "inactive"),
    [data.accounts, showInactive],
  );
  const tree = useMemo(() => buildTree(accounts, data.trialRows, type), [accounts, data.trialRows, type]);
  const scoped = accounts.filter((account) => !type || accountType(account) === type);
  const totalMinor = tree.reduce((sum, node) => sum + node.totalMinor, 0);
  const postedTo = useMemo(() => {
    const used = new Set<string>();
    for (const journal of data.journals) {
      if (journal.status !== "posted") continue;
      for (const line of journalLines(journal)) used.add(line.accountId);
    }
    return used;
  }, [data.journals]);

  if (scoped.length === 0) {
    return (
      <Empty title={type ? `No ${ACCOUNT_TYPE_LABEL[type].toLowerCase()} accounts` : "No accounts"}
        action={<Button variant="primary" onClick={() => context.openOverlay("Account editor")}>Create account</Button>}>
        An account needs a code and a type before anything can be posted to it.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label={type ? `${ACCOUNT_TYPE_LABEL[type]} balance` : "Accounts"} value={type ? context.money(totalMinor) : String(scoped.length)} meta={type ? `${scoped.length} accounts` : `${postedTo.size} have postings`} />
        <Stat label="Posted debits" value={context.money(data.trialDebit)} meta="Across every posted journal" />
        <Stat label="Posted credits" value={context.money(data.trialCredit)} meta={data.trialDebit === data.trialCredit ? "Equal to debits" : "Does not match debits"} />
        <Stat label="Never posted to" value={String(scoped.filter((account) => !postedTo.has(account.id)).length)} meta="Safe to deactivate or rename" />
      </StatRow>

      <Row gap={3} wrap>
        <div className="ds-btn-group" role="group" aria-label="Account display">
          <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "tree"} onClick={() => setMode("tree")}>Tree</button>
          <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</button>
        </div>
        <Checkbox label="Show deactivated accounts" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
        <span className="ds-grow" />
        <SourceNote>Balances are the sum of posted journal lines. A draft journal never moves a balance.</SourceNote>
      </Row>

      {mode === "table" ? (
        <DataGrid
          rows={scoped}
          rowId={(row) => row.id}
          label="Chart of accounts"
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          columns={[
            { key: "code", header: "Code", width: "88px", cell: (row) => <code className="ds-num">{accountCode(row)}</code>, sortValue: (row) => accountCode(row), filterValue: (row) => accountCode(row) },
            { key: "name", header: "Account", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "type", header: "Type", cell: (row) => <AccountTypePill type={accountType(row)} />, sortValue: (row) => accountType(row), filterValue: (row) => accountType(row) },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.status === "inactive" ? "warning" : "success"}>{row.status === "inactive" ? "Deactivated" : "Active"}</Pill> },
            { key: "postings", header: "Entries", align: "end", hideBelow: 900, cell: (row) => <span className="ds-num">{data.journals.filter((journal) => journal.status === "posted" && journalLines(journal).some((line) => line.accountId === row.id)).length}</span> },
            { key: "debit", header: "Debit", align: "end", cell: (row) => <Amount minor={data.trialRows.find((item) => item.accountId === row.id)?.debitMinor} context={context} />, sortValue: (row) => data.trialRows.find((item) => item.accountId === row.id)?.debitMinor ?? 0 },
            { key: "credit", header: "Credit", align: "end", cell: (row) => <Amount minor={data.trialRows.find((item) => item.accountId === row.id)?.creditMinor} context={context} />, sortValue: (row) => data.trialRows.find((item) => item.accountId === row.id)?.creditMinor ?? 0 },
            { key: "balance", header: "Balance", align: "end", cell: (row) => <Amount minor={data.trialRows.find((item) => item.accountId === row.id)?.balanceMinor} context={context} bold />, sortValue: (row) => data.trialRows.find((item) => item.accountId === row.id)?.balanceMinor ?? 0 },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("Account editor", { id }); }}
          summary={<Amount minor={totalMinor} context={context} bold />}
        />
      ) : (
        <Stack gap={2}>
          {tree.map((node) => {
            const expanded = open.includes(node.group) || tree.length <= 3;
            return (
              <Card key={node.group} flush>
                <button
                  type="button"
                  className="ds-card-head"
                  aria-expanded={expanded}
                  onClick={() => setOpen((current) => (current.includes(node.group) ? current.filter((item) => item !== node.group) : [...current, node.group]))}
                  style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "start" }}
                >
                  <span aria-hidden="true">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                  <span className="ds-grow"><strong>{node.group}</strong> <span className="ds-subtle">· {node.accounts.length} accounts</span></span>
                  <AccountTypePill type={node.type} />
                  <Amount minor={node.totalMinor} context={context} bold />
                </button>
                {expanded && (
                  <div className="ds-grid-scroll">
                    <table className="ds-table">
                      <caption className="ds-sr-only">{node.group} accounts</caption>
                      <thead>
                        <tr>
                          <th style={{ width: 88 }}>Code</th>
                          <th>Account</th>
                          <th>State</th>
                          <th data-align="end">Debit</th>
                          <th data-align="end">Credit</th>
                          <th data-align="end">Balance</th>
                          <th><span className="ds-sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {node.accounts.map(({ account, row }) => (
                          <tr key={account.id} tabIndex={0} aria-selected={account.id === context.selectedId}
                            onFocus={() => context.select(account.id)}
                            onClick={() => context.select(account.id)}
                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); context.openOverlay("Account editor", { id: account.id }); } }}>
                            <td><code className="ds-num">{accountCode(account)}</code></td>
                            <td className="ds-table-primary">
                              {account.title}
                              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{account.summary}</span>
                            </td>
                            <td>{account.status === "inactive" ? <Pill tone="warning">Deactivated</Pill> : <span className="ds-subtle">{isDebitNormal(accountType(account)) ? "Debit normal" : "Credit normal"}</span>}</td>
                            <td data-align="end"><Amount minor={row?.debitMinor} context={context} /></td>
                            <td data-align="end"><Amount minor={row?.creditMinor} context={context} /></td>
                            <td data-align="end"><Amount minor={row?.balanceMinor} context={context} bold /></td>
                            <td>
                              <Row gap={1}>
                                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("account history", { id: account.id })}>Entries</Button>
                                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Account editor", { id: account.id })}>Edit</Button>
                              </Row>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function AccountEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const [code, setCode] = useState(existing ? accountCode(existing) : "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [type, setType] = useState<AccountType>(existing ? accountType(existing) : "expense");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [cash, setCash] = useState(existing?.tags.includes("cash") ?? false);
  const [busy, setBusy] = useState(false);

  const duplicate = data.accounts.some((account) => accountCode(account) === code.trim() && account.id !== existing?.id);
  const codeValid = /^\d{4}$/.test(code.trim());
  const hasPostings = existing
    ? data.journals.some((journal) => journal.status === "posted" && journalLines(journal).some((line) => line.accountId === existing.id))
    : false;
  const typeChanged = existing ? type !== accountType(existing) : false;

  return (
    <form
      id="account-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!codeValid || duplicate || !title.trim() || (typeChanged && hasPostings)) return;
        setBusy(true);
        const tags = cash ? [type, "cash"] : [type];
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(), summary, tags,
            fields: { ...existing.fields, code: code.trim(), type },
          }, { expectRevision: existing.revision, event: `Account ${code.trim()} updated` });
          context.toast("Account saved", `${code.trim()} ${title.trim()} is updated in the chart of accounts.`);
        } else {
          const created = await context.mutate.create({
            collection: "accounts", title: title.trim(), status: "active", summary, tags,
            fields: { code: code.trim(), type },
          }, `Account ${code.trim()} created`);
          context.select(created.id);
          context.toast("Account created", `${code.trim()} ${title.trim()} can now be used on a journal line.`);
        }
        setBusy(false);
        close();
      }}
    >
      <Row gap={3} wrap>
        <Field label="Code" required hint="Four digits. The first two group the account in the tree.">
          <TextInput value={code} inputMode="numeric" align="end" invalid={Boolean(code) && (!codeValid || duplicate)} onChange={(event) => setCode(event.target.value)} required />
        </Field>
        <Field label="Type" required hint={isDebitNormal(type) ? "Debit normal: a positive balance is a debit." : "Credit normal: a positive balance is a credit."}>
          <Select value={type} onChange={(event) => setType(event.target.value as AccountType)} disabled={hasPostings}>
            {ACCOUNT_TYPES.map((item) => <option key={item} value={item}>{ACCOUNT_TYPE_LABEL[item]}</option>)}
          </Select>
        </Field>
      </Row>
      <Field label="Account name" required>
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Field label="What it is for">
        <TextArea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} />
      </Field>
      <Checkbox label="Treat as a cash account in the cash flow statement" checked={cash} onChange={(event) => setCash(event.target.checked)} />
      {duplicate && <Notice tone="danger" title={`Code ${code.trim()} is already used`}>Two accounts with the same code make a trial balance ambiguous.</Notice>}
      {Boolean(code) && !codeValid && <Notice tone="warning" title="A code is four digits">The group in the tree comes from the first two digits.</Notice>}
      {hasPostings && (
        <Notice tone="warning" title="This account has posted entries">
          The type is fixed once something is posted, because changing it would move a balance between the profit and loss and the balance sheet. Create a new account and reverse instead.
        </Notice>
      )}
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!codeValid || duplicate || !title.trim()}>{existing ? "Save account" : "Create account"}</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </form>
  );
}

export function AccountHistory({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const account = data.accounts.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!account) return <Empty title="Select an account" />;
  const row = data.trialRows.find((item) => item.accountId === account.id);
  const entries = data.journals
    .filter((journal) => journalLines(journal).some((line) => line.accountId === account.id))
    .sort((a, b) => journalDate(b).localeCompare(journalDate(a)));

  let running = 0;
  const rows = [...entries].reverse().filter((journal) => journal.status === "posted").map((journal) => {
    const line = journalLines(journal).find((item) => item.accountId === account.id)!;
    running += isDebitNormal(accountType(account)) ? line.debitMinor - line.creditMinor : line.creditMinor - line.debitMinor;
    return { journal, line, running };
  }).reverse();

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Account", value: `${accountCode(account)} ${account.title}` },
        { label: "Type", value: <AccountTypePill type={accountType(account)} /> },
        { label: "Normal side", value: isDebitNormal(accountType(account)) ? "Debit" : "Credit" },
        { label: "Posted entries", value: String(rows.length) },
        { label: "Balance", value: <Amount minor={row?.balanceMinor} context={context} bold /> },
      ]} />
      {rows.length === 0 ? (
        <Empty title="Nothing posted to this account" />
      ) : (
        <DataGrid
          rows={rows}
          rowId={(item) => item.journal.id}
          label={`Entries on ${account.title}`}
          filterable={false}
          columns={[
            { key: "date", header: "Date", cell: (item) => <span className="ds-num">{context.date(journalDate(item.journal))}</span> },
            { key: "journal", header: "Journal", primary: true, cell: (item) => item.journal.title },
            { key: "debit", header: "Debit", align: "end", cell: (item) => <Amount minor={item.line.debitMinor} context={context} /> },
            { key: "credit", header: "Credit", align: "end", cell: (item) => <Amount minor={item.line.creditMinor} context={context} /> },
            { key: "running", header: "Balance", align: "end", cell: (item) => <Amount minor={item.running} context={context} bold /> },
          ]}
          onOpen={() => { context.closeOverlay(); context.navigate(`/o/${org.slug}/fin/ledger`); }}
        />
      )}
      {entries.some((journal) => journal.status === "draft") && (
        <Notice tone="info" title="Draft journals are not in this balance">
          {entries.filter((journal) => journal.status === "draft").length} draft journal mentions this account. A draft moves nothing until it is posted.
        </Notice>
      )}
    </Stack>
  );
}

export function DeactivationImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const account = data.accounts.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!account) return <Empty title="Select an account first" />;

  const postings = data.journals.filter((journal) => journalLines(journal).some((line) => line.accountId === account.id));
  const posted = postings.filter((journal) => journal.status === "posted");
  const row = data.trialRows.find((item) => item.accountId === account.id);
  const budgets = data.budgets.filter((budget) => String(budget.fields.accountCode ?? "") === accountCode(account));
  const expenses = data.expenses.filter((expense) => String(expense.fields.accountCode ?? "") === accountCode(account));
  const deleteBlocked = posted.length > 0;
  const balanceBlocked = (row?.balanceMinor ?? 0) !== 0;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Account", value: `${accountCode(account)} ${account.title}` },
        { label: "Posted entries", value: String(posted.length) },
        { label: "Draft entries", value: String(postings.length - posted.length) },
        { label: "Balance", value: <Amount minor={row?.balanceMinor} context={context} bold /> },
        { label: "Budgets referencing it", value: String(budgets.length) },
        { label: "Expense claims coded to it", value: String(expenses.length) },
      ]} />

      {deleteBlocked ? (
        <Notice tone="danger" title="This account cannot be deleted">
          {posted.length} posted {posted.length === 1 ? "journal line references" : "journal lines reference"} it. Deleting it would leave those entries without an account and break the trial balance. It can be deactivated instead, which keeps the history and stops it appearing on new journal lines.
        </Notice>
      ) : (
        <Notice tone="success" title="Nothing is posted to this account">It can be deleted outright, or deactivated to keep it on record.</Notice>
      )}

      {balanceBlocked && (
        <Notice tone="warning" title="It still carries a balance">
          Deactivating an account with a balance of {context.money(row?.balanceMinor ?? 0)} leaves that balance in the statements. Clear it with a journal first if that is not what you want.
        </Notice>
      )}

      <Row gap={2} wrap>
        <Button
          variant="secondary"
          busy={busy}
          disabled={account.status === "inactive"}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(account.id, { status: "inactive" }, { expectRevision: account.revision, event: `Account ${accountCode(account)} deactivated` });
            context.toast("Account deactivated", `${account.title} stays in the history and no longer appears on new journal lines.`);
            setBusy(false);
            close();
          }}
        >
          {account.status === "inactive" ? "Already deactivated" : "Deactivate"}
        </Button>
        {account.status === "inactive" && (
          <Button
            variant="secondary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              await context.mutate.patch(account.id, { status: "active" }, { expectRevision: account.revision, event: `Account ${accountCode(account)} reactivated` });
              context.toast("Account reactivated", `${account.title} can be used on a journal line again.`);
              setBusy(false);
              close();
            }}
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="outline-danger"
          busy={busy}
          disabled={deleteBlocked || !context.can("delete_records")}
          title={deleteBlocked ? "Posted journal lines reference this account" : undefined}
          onClick={async () => {
            setBusy(true);
            await context.mutate.remove(account.id, `Account ${accountCode(account)} deleted`);
            context.toast("Account deleted", "It had no posted entries, so nothing in the ledger changed.");
            setBusy(false);
            close();
          }}
        >
          Delete account
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

export function CategoryMapper({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const [category, setCategory] = useState("travel");
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const expense of data.expenses) set.add(String(expense.fields.category ?? "uncategorised"));
    for (const bill of data.bills) if (bill.fields.category) set.add(String(bill.fields.category));
    return [...set].sort();
  }, [data.expenses, data.bills]);
  const current = data.expenses.filter((expense) => String(expense.fields.category ?? "") === category);
  const mapped = current.map((expense) => String(expense.fields.accountCode ?? "")).filter(Boolean);
  const [target, setTarget] = useState(mapped[0] ?? "6000");
  const [busy, setBusy] = useState(false);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A mapping is a proposal until you apply it">
        Applying it rewrites the account code on the claims listed below. Nothing already posted to the ledger moves.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Category">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Post to account">
          <Select value={target} onChange={(event) => setTarget(event.target.value)}>
            {data.accounts.filter((account) => ["expense", "asset"].includes(accountType(account)) && account.status !== "inactive")
              .map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
      </Row>
      <Properties rows={[
        { label: "Claims in this category", value: String(current.length) },
        { label: "Codes currently used", value: mapped.length ? [...new Set(mapped)].join(", ") : "None recorded" },
        { label: "Total value", value: <Amount minor={current.reduce((sum, expense) => sum + Number(expense.amountMinor ?? 0), 0)} context={context} /> },
      ]} />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={current.length === 0}
          onClick={async () => {
            setBusy(true);
            for (const expense of current) {
              await context.mutate.patch(expense.id, { fields: { ...expense.fields, accountCode: target } }, { event: `Category ${category} mapped to ${target}` });
            }
            context.toast("Mapping applied", `${current.length} ${current.length === 1 ? "claim" : "claims"} now code to ${target}.`);
            setBusy(false);
            close();
          }}
        >
          Apply to {current.length} {current.length === 1 ? "claim" : "claims"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function exportAccounts(context: ScreenContext, accounts: Rec[], rows: TrialRow[]): void {
  const header = "code,name,type,state,debit_minor,credit_minor,balance_minor\n";
  const body = accounts.map((account) => {
    const row = rows.find((item) => item.accountId === account.id);
    return [accountCode(account), account.title, accountType(account), account.status, row?.debitMinor ?? 0, row?.creditMinor ?? 0, row?.balanceMinor ?? 0]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",");
  }).join("\n");
  downloadFile(`${context.org.slug}-chart-of-accounts.csv`, header + body, "text/csv");
  context.toast("Exported", `${accounts.length} accounts written to a CSV file in this browser.`);
}

export function PeriodLockCard() {
  const data = useFinData();
  const { org } = useWorkspace();
  return (
    <Card title="Closed periods" subtitle="A journal cannot be posted into a closed month" actions={<Lock size={16} aria-hidden="true" />}>
      <Stack gap={2}>
        {data.locked.length === 0 ? <span className="ds-subtle">No period is closed.</span> : data.locked.map((period) => (
          <Row key={period} gap={2}>
            <span className="ds-grow ds-num">{period}</span>
            <Pill tone="warning">Closed</Pill>
          </Row>
        ))}
        <SourceNote>Year end is recorded as {String(data.periodRecord?.fields.yearEnd ?? "not set")} for {org.name}.</SourceNote>
      </Stack>
    </Card>
  );
}

export function accountsForPeriod(data: ReturnType<typeof useFinData>, period: string): number {
  return data.journals.filter((journal) => journal.status === "posted" && periodOf(journalDate(journal)) === period).length;
}

export function TypeTabGrid({ context, type }: { context: ScreenContext; type: AccountType }) {
  return (
    <Grid>
      <div className="ds-col-12"><ChartOfAccounts context={context} type={type} /></div>
    </Grid>
  );
}
