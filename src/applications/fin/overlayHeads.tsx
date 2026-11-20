import { OverlaySummary, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import { buildReturn } from "@/domain/fin-invoice";
import { accountCode, accountType, consolidate, isDebitNormal, periodLabel, reconcile } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import { AccountTypePill, CapabilityPill } from "./parts";

/* Identity blocks for Finance overlays, supplied through `OverlayDef.summary`
   so they replace the generic record chip instead of repeating it. */

function pickId(context: ScreenContext): string | undefined {
  return (context.overlayPayload as { id?: string } | undefined)?.id ?? context.selectedId;
}

export function AccountHead({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const account = data.accounts.find((item) => item.id === pickId(context));
  if (!account) return null;
  return (
    <OverlaySummary
      eyebrow={`Account ${accountCode(account)}`}
      title={account.title}
      status={<AccountTypePill type={accountType(account)} />}
      meta={[`${isDebitNormal(accountType(account)) ? "Debit" : "Credit"} normal`, account.status === "inactive" ? "Deactivated" : undefined]}
    />
  );
}

export function DeactivationHead({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const account = data.accounts.find((item) => item.id === pickId(context));
  if (!account) return null;
  return (
    <OverlaySummary
      eyebrow="Deactivating"
      title={`${accountCode(account)} ${account.title}`}
      status={account.status === "inactive" ? <Pill tone="warning">Deactivated</Pill> : <Pill tone="success" dot>Active</Pill>}
    />
  );
}

export function ExpenseHead({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const expense = data.expenses.find((item) => item.id === pickId(context));
  if (!expense) return null;
  const journal = data.journals.find((item) => item.id === String(expense.fields.journalId ?? ""));
  return (
    <OverlaySummary
      eyebrow="Expense claim"
      title={expense.title}
      status={<Pill tone={expense.status === "reimbursed" ? "success" : expense.status === "rejected" ? "danger" : "neutral"} dot>{expense.status}</Pill>}
      meta={[String(expense.fields.claimant ?? expense.ownerName), <span className="ds-num" key="d">{context.date(expense.at)}</span>, journal ? `Posted: ${journal.title}` : "Nothing posted to the ledger"]}
    />
  );
}

export function ReturnHead({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const period = (context.overlayPayload as { period?: string } | undefined)?.period ?? data.currentPeriod;
  const boxes = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });
  return (
    <OverlaySummary
      eyebrow="Return review"
      title={periodLabel(period, org.locale)}
      status={boxes.unknownDocumentIds.length > 0 ? <Pill tone="danger" dot>Validation failed</Pill> : <Pill tone="success" dot>Validation passed</Pill>}
      meta={[org.jurisdiction, <span className="ds-num" key="p">Computed {context.dateTime(context.now)}</span>, <CapabilityPill key="f" id="tax.file" />]}
    />
  );
}

export function ConsolidationHead() {
  const data = useFinData();
  const consolidation = consolidate(data.entities, data.journals);
  const balanced = consolidation.groupDebitMinor === consolidation.groupCreditMinor;
  return (
    <OverlaySummary eyebrow="Consolidation preview" title={`${consolidation.columns.length} entities`}
      status={balanced ? <Pill tone="success" dot>Group balances</Pill> : <Pill tone="danger" dot>Group does not balance</Pill>}
      meta={["Posted journals only; entity ledgers are never changed"]} />
  );
}

export function MetricHead({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const metric = (context.overlayPayload as { metric?: string } | undefined)?.metric ?? "cash";
  if (metric === "bank") {
    const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: "1000" });
    return <OverlaySummary eyebrow="Figure" title="Bank statement balance" status={<Pill tone="warning" dot>Not verified by a provider</Pill>}
      meta={[recon.statement ? `${recon.statement.filename}, imported by hand` : "No statement imported"]} />;
  }
  if (metric === "cash") {
    return <OverlaySummary eyebrow="Figure" title="Cash on the ledger" status={<Pill tone="success">Posted</Pill>}
      meta={["Posted debits less credits on every cash account", data.cash.lastPosted ? `Last posting ${context.date(data.cash.lastPosted)} (${freshness(data.cash.lastPosted, now).days} days)` : "No posting recorded"]} />;
  }
  if (metric === "result") {
    return <OverlaySummary eyebrow="Figure" title={`Result · ${periodLabel(data.currentPeriod, org.locale)}`} status={<Pill tone="success">Posted</Pill>}
      meta={["Posted journals only; drafts are excluded"]} />;
  }
  return <OverlaySummary eyebrow="Figure" title={metric === "payable" ? "Payable" : "Receivable"} status={<Pill tone="success">Posted</Pill>}
    meta={["Each row below is the record the figure was summed from"]} />;
}

