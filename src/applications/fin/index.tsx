import {
  Banknote, BookOpen, Building2, CircleDollarSign, FileText, Landmark, Percent, PieChart, Receipt,
  ReceiptText, Scale, ScrollText, Wallet,
} from "lucide-react";
import { Button, Empty } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import type { AccountType } from "@/domain/fin-ledger";
import {
  CashflowTab, CorrectionProposal, FinanceInsights, FinanceOverview, FinanceOverviewHeader, FinanceTasks,
  MetricDrilldown, PeriodSelector,
} from "./overview";
import { AccountEditor, AccountHistory, ChartOfAccounts, DeactivationImpact } from "./accounts";
import {
  BalancingValidator, JournalForm, JournalSearch, LedgerAudit, LedgerEntries, LedgerJournals, LedgerPeriods, LedgerStrip,
  ReverseConfirmation,
} from "./ledger";
import {
  ApproveInvoice, BulkActionPreview, DocumentPreview, EmailPreview, exportInvoices, InvoiceActivity, InvoiceHeader,
  InvoiceInspector, InvoiceLineItems, InvoiceList, InvoiceOverview, InvoicePayments, LineEditor, NewInvoice,
  PaymentForm, ReminderApproval, VoidReason,
} from "./invoices";
import {
  ApprovalChain, BillCapture, BillsTable, ExpenseDetail, ExpensesTable, MatchInspector, PayablesStrip,
  PaymentAuthorization, ReceiptCapture,
} from "./payables";
import {
  AdjustmentReview, BankAccounts, BankConnection, BankTransactions, CsvMapper, FeedHealth, FeedIncident,
  ImportJobs, MatchCandidatesOverlay, MatchedLines, ReconciliationApproval, ReconciliationExceptions,
  ReconciliationHistory, ReconciliationStrip, ToReconcile,
} from "./banking";
import {
  BudgetApprovalOverlay, BudgetApprovalTab, BudgetRevisionHistory, BudgetsTab, ForecastsTab, ModelAssumptions,
  PlanningStrip, ScenariosTab,
} from "./planning";
import {
  FilingAuthorization, ReturnReview, ReturnsTab, TaxAuditTab, TaxCodesTab, TaxConfiguration, TaxPeriodsTab, TaxStrip,
} from "./tax";
import {
  CustomReportTab, DrillDown, ManagementTab, ReportDesigner, ReportSchedule, ScheduledTab, SourceNoteOverlay,
  StatementsTab,
} from "./reports";
import {
  ConsolidationPreview, ConsolidationTab, EntitiesStrip, EntitiesTab, EntityConfig, EntityPostings, FxSources, FxTab,
  IntercompanyTab,
} from "./entities";
import {
  ApproveBill, ApproveExpense, AskFinance, AssignCategory, EliminateIntercompany, ExportReturnOverlay, ExportStatements, InspectMismatch,
  InvoiceExport, IssueReport, MapCategory, ReimburseExpense, ReviewFiling, SchedulePayment, SendInvoice, StatementFilter,
} from "./actions";

/* ====================================================================== *
 * FIN — Finance & Accounting
 *
 * Native double-entry: a journal posts only when debits equal credits and the
 * period is open, a posted entry is immutable and corrected by reversal, and
 * every statement is derived from posted journals alone. Tax is resolved by
 * the engine in `src/platform/money.ts` from jurisdiction, line category,
 * customer status and date — never from the currency.
 * ====================================================================== */

function Unavailable({ context, what }: { context: ScreenContext; what: string }) {
  return (
    <Empty title={what} action={<Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/fin/home`)}>Back to the overview</Button>} />
  );
}

export const finApp = registerApp({
  code: "FIN",
  short: "Finance",
  name: "Finance & Accounting",
  purpose: "Double-entry books, invoicing and tax, computed in this browser",
  icon: CircleDollarSign,
  nav: [
    { items: [
      { label: "Finance Overview", screenId: "ARL-FIN-001", icon: PieChart },
      { label: "Financial Reports", screenId: "ARL-FIN-012", icon: ScrollText },
    ] },
    { label: "Ledger", items: [
      { label: "Chart of Accounts", screenId: "ARL-FIN-002", icon: BookOpen },
      { label: "General Ledger", screenId: "ARL-FIN-003", icon: Scale },
      { label: "Multi-Entity", screenId: "ARL-FIN-013", icon: Building2 },
    ] },
    { label: "Receivables", items: [
      { label: "Invoices", screenId: "ARL-FIN-004", icon: ReceiptText },
    ] },
    { label: "Payables", items: [
      { label: "Bills & Payables", screenId: "ARL-FIN-006", icon: Receipt },
      { label: "Expenses", screenId: "ARL-FIN-007", icon: Wallet },
    ] },
    { label: "Cash", items: [
      { label: "Banking & Feeds", screenId: "ARL-FIN-008", icon: Banknote },
      { label: "Bank Reconciliation", screenId: "ARL-FIN-009", icon: Landmark },
    ] },
    { label: "Planning", items: [
      { label: "Budgets & Forecasts", screenId: "ARL-FIN-010", icon: FileText },
      { label: "Tax & Compliance", screenId: "ARL-FIN-011", icon: Percent },
    ] },
  ],

  screens: {
    /* --------------------------- FIN-001 --------------------------- */
    "ARL-FIN-001": {
      id: "ARL-FIN-001",
      subtitle: (context) => `Cash, receivables, payables and the month's result for ${context.org.name}, from posted journals in this browser.`,
      header: () => <FinanceOverviewHeader />,
      tabs: [
        { id: "Overview", render: (context) => <FinanceOverview context={context} /> },
        { id: "Cashflow", render: (context) => <CashflowTab context={context} /> },
        { id: "Tasks", render: (context) => <FinanceTasks context={context} />, count: () => undefined },
        { id: "Insights", render: (context) => <FinanceInsights context={context} /> },
      ],
      actions: [
        { id: "Inspect metric", label: "Inspect a figure", placement: "primary", run: (context) => context.openOverlay("Metric drilldown", { metric: "cash" }) },
        { id: "start reconciliation", label: "Reconcile", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/fin/reconciliation`) },
        { id: "issue report", label: "Issue a report", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("issue report") },
        { id: "choose period", label: "Choose a period", placement: "overflow", run: (context) => context.openOverlay("reporting-period selector") },
        { id: "ask Finance", label: "Ask Finance", placement: "overflow", run: (context) => context.openOverlay("ask finance") },
        { id: "chief of staff", label: "Open the Chief of Staff chat", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/ai/chat`) },
      ],
      overlays: [
        { id: "Metric drilldown", kind: "drawer", title: "Where this figure comes from", width: 560, render: ({ ...context }) => <MetricDrilldown context={context} /> },
        { id: "reporting-period selector", kind: "modal", title: "Reporting period", width: 520, render: ({ close, ...context }) => <PeriodSelector context={context} close={close} /> },
        { id: "correction proposal", kind: "modal", title: "Propose a correction", width: 540, render: ({ close, ...context }) => <CorrectionProposal context={context} close={close} /> },
        { id: "issue report", kind: "modal", title: "Issue a management report", width: 600, render: ({ close, ...context }) => <IssueReport context={context} close={close} /> },
        { id: "ask finance", kind: "drawer", title: "Ask Finance", width: 620, render: ({ close, ...context }) => <AskFinance context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-002 --------------------------- */
    "ARL-FIN-002": {
      id: "ARL-FIN-002",
      subtitle: (context) => `Codes, types and posted balances for ${context.org.name}. A balance only moves when a journal is posted.`,
      tabs: [
        { id: "All", render: (context) => <ChartOfAccounts context={context} /> },
        ...(["asset", "liability", "equity", "revenue", "expense"] as AccountType[]).map((type, index) => ({
          id: ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"][index],
          render: (context: ScreenContext) => <ChartOfAccounts context={context} type={type} />,
        })),
      ],
      actions: [
        { id: "Create account", label: "New account", placement: "primary", capability: "post_journal", run: (context) => context.openOverlay("Account editor") },
        { id: "deactivate", label: "Deactivate", placement: "secondary", capability: "post_journal", guard: (context) => (context.selectedId ? undefined : "Select an account first"), run: (context) => context.openOverlay("deactivation impact") },
        { id: "map category", label: "Map categories to this account", placement: "overflow", capability: "post_journal", guard: (context) => (context.selectedId ? undefined : "Select an account first"), run: (context) => context.openOverlay("map category") },
        { id: "account detail", label: "Categories posting here", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an account first"), run: (context) => context.openOverlay("account history", { id: context.selectedId }) },
        { id: "export", label: "Export the chart", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("account history", { export: true }) },
      ],
      overlays: [
        { id: "Account editor", kind: "modal", title: "Account", width: 580, render: ({ close, ...context }) => <AccountEditor context={context} close={close} /> },
        { id: "account history", kind: "drawer", title: "Account detail", width: 660, render: ({ close, ...context }) => <AccountHistory context={context} close={close} /> },
        { id: "deactivation impact", kind: "modal", title: "What deactivating would do", width: 560, tone: "danger", render: ({ close, ...context }) => <DeactivationImpact context={context} close={close} /> },
        { id: "map category", kind: "modal", title: "Map spending categories", width: 560, render: ({ close, ...context }) => <MapCategory context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-003 --------------------------- */
    "ARL-FIN-003": {
      id: "ARL-FIN-003",
      subtitle: () => "Debits must equal credits before anything posts. A posted entry is immutable and corrected by a reversal.",
      statusStrip: (context) => <LedgerStrip context={context} />,
      tabs: [
        { id: "Entries", render: (context) => <LedgerEntries context={context} /> },
        { id: "Journals", render: (context) => <LedgerJournals context={context} /> },
        { id: "Periods", render: (context) => <LedgerPeriods context={context} /> },
        { id: "Audit", render: (context) => <LedgerAudit context={context} /> },
      ],
      actions: [
        { id: "Post approved journal", label: "Post a journal", placement: "primary", capability: "post_journal", run: (context) => context.openOverlay("Journal form", context.selectedId ? { id: context.selectedId } : undefined) },
        { id: "inspect lines", label: "Inspect lines", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a journal first"), run: (context) => context.openOverlay("Journal form", { id: context.selectedId }) },
        { id: "reverse", label: "Reverse", placement: "secondary", capability: "post_journal", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a posted journal first"), run: (context) => context.openOverlay("reverse confirmation", { id: context.selectedId }) },
        { id: "search", label: "Search the ledger", placement: "overflow", run: (context) => context.openOverlay("journal search") },
      ],
      overlays: [
        { id: "Journal form", kind: "drawer", title: (context) => (context.selectedId ? "Journal" : "New journal"), width: 920, render: ({ close, ...context }) => <JournalForm context={context} close={close} /> },
        { id: "balancing validator", kind: "drawer", title: "Draft journals checked", width: 620, render: ({ ...context }) => <BalancingValidator context={context} /> },
        { id: "reverse confirmation", kind: "modal", title: "Reverse a posted journal", width: 640, tone: "danger", render: ({ close, ...context }) => <ReverseConfirmation context={context} close={close} /> },
        { id: "journal search", kind: "drawer", title: "Search the ledger", width: 760, render: ({ close, ...context }) => <JournalSearch context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-004 --------------------------- */
    "ARL-FIN-004": {
      id: "ARL-FIN-004",
      subtitle: (context) => `Every invoice in ${context.org.name}, with the tax code each line resolved to.`,
      tabs: ["Draft", "Awaiting payment", "Overdue", "Paid", "Void"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <InvoiceList context={context} tab={tab} />,
        count: () => undefined,
      })),
      actions: [
        { id: "Create", label: "Create an invoice", placement: "primary", run: (context) => context.openOverlay("New invoice") },
        { id: "open record", label: "Open the invoice", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an invoice first"), run: (context) => context.navigate(`/o/${context.org.slug}/fin/invoices/${context.selectedId}`) },
        { id: "bulk reminders", label: "Draft reminders", placement: "secondary", run: (context) => context.openOverlay("reminder approval") },
        { id: "filter", label: "Filter the list", placement: "overflow", run: () => { window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(), 60); } },
        { id: "ageing report", label: "Ageing report", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/fin/reports?tab=Statements&statement=aged`) },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export invoices") },
      ],
      overlays: [
        { id: "New invoice", kind: "modal", title: "New invoice", width: 720, render: ({ close, ...context }) => <NewInvoice context={context} close={close} /> },
        { id: "bulk action preview", kind: "modal", title: "Reminders to be drafted", width: 680, render: ({ close, ...context }) => <BulkActionPreview context={context} close={close} /> },
        { id: "reminder approval", kind: "modal", title: "Approve reminders", width: 620, render: ({ close, ...context }) => <ReminderApproval context={context} close={close} /> },
        { id: "export invoices", kind: "modal", title: "Export invoices", width: 520, render: ({ close, ...context }) => <InvoiceExport context={context} close={close} run={(rows, data) => exportInvoices(context, data, rows)} /> },
      ],
    },

    /* --------------------------- FIN-005 --------------------------- */
    "ARL-FIN-005": {
      id: "ARL-FIN-005",
      title: () => "Invoice",
      header: (context) => <InvoiceHeader context={context} />,
      inspectorTitle: "Invoice",
      inspector: (context) => <InvoiceInspector context={context} />,
      tabs: [
        { id: "Overview", render: (context) => <InvoiceOverview context={context} /> },
        { id: "Line items", render: (context) => <InvoiceLineItems context={context} /> },
        { id: "Payments", render: (context) => <InvoicePayments context={context} /> },
        { id: "Activity", render: (context) => <InvoiceActivity context={context} /> },
      ],
      actions: [
        { id: "approve", label: "Approve and post", placement: "primary", capability: "post_journal", run: (context) => context.openOverlay("approve invoice") },
        { id: "Edit draft", label: "Edit the lines", placement: "secondary", run: (context) => context.openOverlay("Line item editor") },
        { id: "preview", label: "Preview the document", placement: "secondary", run: (context) => context.openOverlay("email preview") },
        { id: "record payment", label: "Record a payment", placement: "overflow", capability: "post_journal", run: (context) => context.openOverlay("payment form") },
        { id: "send", label: "Send (queued locally)", placement: "overflow", run: (context) => context.openOverlay("send invoice") },
        { id: "draft email", label: "Draft an email", placement: "overflow", run: (context) => context.openOverlay("email preview") },
        { id: "void", label: "Void or credit", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("void reason") },
      ],
      overlays: [
        { id: "Line item editor", kind: "drawer", title: "Line items", width: 1080, render: ({ close, ...context }) => <><LineEditor context={context} close={close} /><ApproveInvoice context={context} close={close} /></> },
        { id: "email preview", kind: "drawer", title: "Document and message", width: 900, render: ({ close, ...context }) => <><DocumentPreview context={context} /><EmailPreview context={context} close={close} /></> },
        { id: "payment form", kind: "modal", title: "Record a payment", width: 620, render: ({ close, ...context }) => <PaymentForm context={context} close={close} /> },
        { id: "void reason", kind: "modal", title: "Void or credit this invoice", width: 580, tone: "danger", render: ({ close, ...context }) => <VoidReason context={context} close={close} /> },
        { id: "approve invoice", kind: "modal", title: "Approve and post this invoice", width: 680, render: ({ close, ...context }) => <ApproveInvoice context={context} close={close} /> },
        { id: "send invoice", kind: "modal", title: "Send this invoice", width: 620, render: ({ close, ...context }) => <SendInvoice context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-006 --------------------------- */
    "ARL-FIN-006": {
      id: "ARL-FIN-006",
      subtitle: () => "Supplier bills, their approvals and what a payment would post. No bank mandate exists here.",
      statusStrip: (context) => <PayablesStrip context={context} />,
      tabs: ["Inbox", "Due", "Approved", "Paid", "Exceptions"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <BillsTable context={context} tab={tab} />,
      })),
      actions: [
        { id: "Upload bill", label: "Capture a bill", placement: "primary", run: (context) => context.openOverlay("Bill capture") },
        { id: "match supplier", label: "Match", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a bill first"), run: (context) => context.openOverlay("match inspector", { id: context.selectedId }) },
        { id: "approve", label: "Approve", placement: "secondary", capability: "approve_payment", guard: (context) => (context.selectedId ? undefined : "Select a bill first"), run: (context) => context.openOverlay("approve bill") },
        { id: "schedule payment", label: "Schedule a payment", placement: "overflow", capability: "approve_payment", run: (context) => context.openOverlay("schedule payment") },
        { id: "record payment run", label: "Record a payment run", placement: "overflow", capability: "approve_payment", run: (context) => context.openOverlay("payment authorization") },
      ],
      overlays: [
        { id: "Bill capture", kind: "modal", title: "Capture a bill", width: 680, render: ({ close, ...context }) => <BillCapture context={context} close={close} /> },
        { id: "match inspector", kind: "drawer", title: "Bill", width: 580, render: ({ close, ...context }) => <MatchInspector context={context} close={close} /> },
        { id: "payment authorization", kind: "modal", title: "Record a payment run", width: 760, tone: "danger", render: ({ close, ...context }) => <PaymentAuthorization context={context} close={close} /> },
        { id: "approve bill", kind: "modal", title: "Approve a bill", width: 640, render: ({ close, ...context }) => <ApproveBill context={context} close={close} /> },
        { id: "schedule payment", kind: "modal", title: "Schedule a supplier payment", width: 640, render: ({ close, ...context }) => <SchedulePayment context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-007 --------------------------- */
    "ARL-FIN-007": {
      id: "ARL-FIN-007",
      subtitle: (context) => `Claims, receipts and what each one would post. You are viewing as ${context.actor}.`,
      tabs: ["My expenses", "Team review", "Approved", "Reimbursed"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <ExpensesTable context={context} tab={tab} />,
      })),
      actions: [
        { id: "Upload receipt", label: "Upload a receipt", placement: "primary", run: (context) => context.openOverlay("Receipt capture") },
        { id: "assign category", label: "Assign a category", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a claim first"), run: (context) => context.openOverlay("assign category") },
        { id: "approve", label: "Approve", placement: "secondary", capability: "approve_payment", guard: (context) => (context.selectedId ? undefined : "Select a claim first"), run: (context) => context.openOverlay("approve claim") },
        { id: "reimburse", label: "Reimburse", placement: "overflow", capability: "post_journal", run: (context) => context.openOverlay("reimburse claim") },
        { id: "open claim", label: "Open the claim", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a claim first"), run: (context) => context.openOverlay("expense detail", { id: context.selectedId }) },
        { id: "approval chain", label: "Approval chain", placement: "overflow", run: (context) => context.openOverlay("approval chain") },
        { id: "chart of accounts", label: "Chart of accounts", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/fin/accounts`) },
      ],
      overlays: [
        { id: "Receipt capture", kind: "modal", title: "New expense claim", width: 640, render: ({ close, ...context }) => <ReceiptCapture context={context} close={close} /> },
        { id: "expense detail", kind: "drawer", title: "Expense claim", width: 560, render: ({ close, ...context }) => <ExpenseDetail context={context} close={close} /> },
        { id: "approval chain", kind: "drawer", title: "Approval chain", width: 620, render: ({ ...context }) => <ApprovalChain context={context} /> },
        { id: "assign category", kind: "modal", title: "Assign a category", width: 540, render: ({ close, ...context }) => <AssignCategory context={context} close={close} /> },
        { id: "approve claim", kind: "modal", title: "Approve an expense claim", width: 580, render: ({ close, ...context }) => <ApproveExpense context={context} close={close} /> },
        { id: "reimburse claim", kind: "modal", title: "Reimburse an approved claim", width: 620, render: ({ close, ...context }) => <ReimburseExpense context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-008 --------------------------- */
    "ARL-FIN-008": {
      id: "ARL-FIN-008",
      subtitle: () => "Honestly not connected. CSV import works, and an imported line is never marked reconciled on arrival.",
      tabs: [
        { id: "Accounts", render: (context) => <BankAccounts context={context} /> },
        { id: "Transactions", render: (context) => <BankTransactions context={context} /> },
        { id: "Imports", render: (context) => <ImportJobs context={context} /> },
        { id: "Feed health", render: (context) => <FeedHealth context={context} /> },
      ],
      actions: [
        { id: "import statement", label: "Import a statement", placement: "primary", run: (context) => context.openOverlay("CSV mapper") },
        { id: "Connect account", label: "Connect a bank", placement: "secondary", capability: "manage_connectors", run: (context) => context.openOverlay("Bank connection") },
        { id: "reconcile", label: "Reconcile", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/fin/reconciliation`) },
        { id: "inspect mismatch", label: "Inspect a mismatch", placement: "overflow", run: (context) => context.openOverlay("inspect mismatch") },
        { id: "feed incidents", label: "Feed incidents", placement: "overflow", run: (context) => context.openOverlay("feed incident") },
      ],
      overlays: [
        { id: "Bank connection", kind: "modal", title: "Connect a bank account", width: 580, render: ({ close, ...context }) => <BankConnection context={context} close={close} /> },
        { id: "CSV mapper", kind: "drawer", title: "Import a CSV statement", width: 820, render: ({ close, ...context }) => <CsvMapper context={context} close={close} /> },
        { id: "feed incident", kind: "drawer", title: "Feed incidents", width: 560, render: ({ ...context }) => <FeedIncident context={context} /> },
        { id: "inspect mismatch", kind: "drawer", title: "Statement against ledger", width: 760, render: ({ ...context }) => <InspectMismatch context={context} /> },
      ],
    },

    /* --------------------------- FIN-009 --------------------------- */
    "ARL-FIN-009": {
      id: "ARL-FIN-009",
      subtitle: () => "Statement against ledger, with the difference explained line by line. Confirming needs nothing unexplained.",
      statusStrip: (context) => <ReconciliationStrip context={context} />,
      tabs: [
        { id: "To reconcile", render: (context) => <ToReconcile context={context} /> },
        { id: "Matched", render: (context) => <MatchedLines context={context} /> },
        { id: "Exceptions", render: (context) => <ReconciliationExceptions context={context} /> },
        { id: "History", render: (context) => <ReconciliationHistory context={context} /> },
      ],
      actions: [
        { id: "confirm statement", label: "Confirm the statement", placement: "primary", capability: "post_journal", run: (context) => context.openOverlay("reconciliation approval") },
        { id: "Match", label: "Match candidates", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a statement line first"), run: (context) => context.openOverlay("Match candidates", { id: context.selectedId }) },
        { id: "create adjustment", label: "Create an adjustment", placement: "secondary", capability: "post_journal", guard: (context) => (context.selectedId ? undefined : "Select a statement line first"), run: (context) => context.openOverlay("adjustment review", { id: context.selectedId }) },
        { id: "split", label: "Split a line", placement: "overflow", capability: "post_journal", guard: (context) => (context.selectedId ? undefined : "Select a statement line first"), run: (context) => context.openOverlay("adjustment review", { id: context.selectedId, split: true }) },
      ],
      overlays: [
        { id: "Match candidates", kind: "drawer", title: "Candidates for this line", width: 640, render: ({ close, ...context }) => <MatchCandidatesOverlay context={context} close={close} /> },
        { id: "adjustment review", kind: "drawer", title: "Post an adjustment", width: 720, render: ({ close, ...context }) => <AdjustmentReview context={context} close={close} /> },
        { id: "reconciliation approval", kind: "modal", title: "Confirm the reconciliation", width: 600, render: ({ close, ...context }) => <ReconciliationApproval context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-010 --------------------------- */
    "ARL-FIN-010": {
      id: "ARL-FIN-010",
      subtitle: () => "Approved budgets against posted actuals, and forecasts kept visibly separate from both.",
      statusStrip: (context) => <PlanningStrip context={context} />,
      tabs: [
        { id: "Budgets", render: (context) => <BudgetsTab context={context} /> },
        { id: "Forecasts", render: (context) => <ForecastsTab context={context} /> },
        { id: "Scenarios", render: (context) => <ScenariosTab context={context} /> },
        { id: "Approval", render: (context) => <BudgetApprovalTab context={context} /> },
      ],
      actions: [
        { id: "Edit assumptions", label: "Edit assumptions", placement: "primary", run: (context) => context.openOverlay("Model assumptions") },
        { id: "submit budget", label: "Submit a budget", placement: "secondary", run: (context) => context.openOverlay("budget approval") },
        { id: "compare scenarios", label: "Compare scenarios", placement: "secondary", run: (context) => context.setTab("Scenarios") },
      ],
      overlays: [
        { id: "Model assumptions", kind: "drawer", title: "Forecast assumptions", width: 760, render: ({ close, ...context }) => <ModelAssumptions context={context} close={close} /> },
        { id: "revision history", kind: "drawer", title: "Budget revisions", width: 640, render: ({ ...context }) => <BudgetRevisionHistory context={context} /> },
        { id: "budget approval", kind: "modal", title: "Submit a budget", width: 620, render: ({ close, ...context }) => <BudgetApprovalOverlay context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-011 --------------------------- */
    "ARL-FIN-011": {
      id: "ARL-FIN-011",
      subtitle: (context) => `Resolved codes for ${context.org.jurisdiction} and the return this workspace would file. It files nothing and makes no compliance claim.`,
      statusStrip: (context) => <TaxStrip context={context} />,
      tabs: [
        { id: "Codes", render: (context) => <TaxCodesTab context={context} /> },
        { id: "Periods", render: (context) => <TaxPeriodsTab context={context} /> },
        { id: "Returns", render: (context) => <ReturnsTab context={context} /> },
        { id: "Audit", render: (context) => <TaxAuditTab context={context} /> },
      ],
      actions: [
        { id: "Prepare return", label: "Prepare a return", placement: "primary", run: (context) => context.openOverlay("filing authorization") },
        { id: "validate", label: "Validate", placement: "secondary", run: (context) => context.openOverlay("return review") },
        { id: "review filing", label: "Review the filing", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("review filing") },
        { id: "export", label: "Export the figures", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export return") },
        { id: "code configuration", label: "Code configuration", placement: "overflow", run: (context) => context.openOverlay("Tax configuration") },
      ],
      overlays: [
        { id: "Tax configuration", kind: "drawer", title: "Tax configuration", width: 620, render: ({ close, ...context }) => <TaxConfiguration context={context} close={close} /> },
        { id: "return review", kind: "modal", title: "Validate the return", width: 620, render: ({ ...context }) => <ReturnReview context={context} /> },
        { id: "filing authorization", kind: "modal", title: "Before filing", width: 640, tone: "danger", render: ({ close, ...context }) => <FilingAuthorization context={context} close={close} /> },
        { id: "review filing", kind: "modal", title: "Review a prepared return", width: 640, render: ({ close, ...context }) => <ReviewFiling context={context} close={close} /> },
        { id: "export return", kind: "modal", title: "Export the return figures", width: 520, render: ({ close, ...context }) => <ExportReturnOverlay context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-012 --------------------------- */
    "ARL-FIN-012": {
      id: "ARL-FIN-012",
      subtitle: () => "Profit and loss, balance sheet, cash flow, trial balance and ageing, all from posted journals.",
      tabs: [
        { id: "Statements", render: (context) => <StatementsTab context={context} /> },
        { id: "Management", render: (context) => <ManagementTab context={context} /> },
        { id: "Custom", render: (context) => <CustomReportTab context={context} /> },
        { id: "Scheduled", render: (context) => <ScheduledTab context={context} /> },
      ],
      actions: [
        { id: "Build report", label: "Build a report", placement: "primary", run: (context) => context.setTab("Custom") },
        { id: "drill down", label: "Drill into an account", placement: "secondary", run: (context) => context.openOverlay("source note", { drill: true }) },
        { id: "filter", label: "Filter statements", placement: "secondary", run: (context) => context.openOverlay("filter statements") },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export statements") },
        { id: "source note", label: "Source note", placement: "overflow", run: (context) => context.openOverlay("source note") },
        { id: "report designer", label: "Report designer", placement: "overflow", run: (context) => context.openOverlay("Report designer") },
        { id: "schedule", label: "Schedule", placement: "overflow", run: (context) => context.openOverlay("schedule") },
      ],
      overlays: [
        { id: "Report designer", kind: "modal", title: "Report designer", width: 620, render: ({ close, ...context }) => <ReportDesigner context={context} close={close} /> },
        { id: "source note", kind: "drawer", title: "Where these statements come from", width: 700, render: ({ ...context }) => <><SourceNoteOverlay context={context} /><DrillDown context={context} /></> },
        { id: "schedule", kind: "modal", title: "Schedule a report", width: 520, render: ({ close, ...context }) => <ReportSchedule context={context} close={close} /> },
        { id: "filter statements", kind: "modal", title: "Filter the statements", width: 520, render: ({ close, ...context }) => <StatementFilter context={context} close={close} /> },
        { id: "export statements", kind: "modal", title: "Export a statement", width: 520, render: ({ close, ...context }) => <ExportStatements context={context} close={close} /> },
      ],
    },

    /* --------------------------- FIN-013 --------------------------- */
    "ARL-FIN-013": {
      id: "ARL-FIN-013",
      subtitle: (context) => `Entities inside ${context.org.name}, their intercompany balances and a consolidation that counts each journal once.`,
      statusStrip: (context) => <EntitiesStrip context={context} />,
      tabs: [
        { id: "Entities", render: (context) => <EntitiesTab context={context} /> },
        { id: "Intercompany", render: (context) => <IntercompanyTab context={context} /> },
        { id: "Consolidation", render: (context) => <ConsolidationTab context={context} /> },
        { id: "FX", render: (context) => <FxTab context={context} /> },
      ],
      actions: [
        { id: "Create consolidation", label: "Prepare a consolidation", placement: "primary", run: (context) => context.openOverlay("consolidation preview") },
        { id: "eliminate intercompany", label: "Eliminate intercompany", placement: "secondary", capability: "post_journal", run: (context) => context.openOverlay("eliminate intercompany") },
        { id: "inspect postings", label: "Inspect postings", placement: "overflow", run: (context) => context.openOverlay("consolidation preview") },
      ],
      overlays: [
        { id: "Entity config", kind: "modal", title: "Legal entity", width: 620, render: ({ close, ...context }) => <EntityConfig context={context} close={close} /> },
        { id: "consolidation preview", kind: "drawer", title: "Consolidation preview", width: 760, render: ({ close, ...context }) => <><ConsolidationPreview context={context} close={close} /><EntityPostings context={context} /></> },
        { id: "FX sources", kind: "drawer", title: "Exchange rates", width: 560, render: () => <FxSources /> },
        { id: "eliminate intercompany", kind: "modal", title: "Eliminate intercompany balances", width: 700, render: ({ close, ...context }) => <EliminateIntercompany context={context} close={close} /> },
      ],
    },
  },

  fallback: (context) => <Unavailable context={context} what={`${context.screen.title} is not implemented in Finance yet`} />,
});

/* ----------------------- Small overlay bodies ---------------------- */



