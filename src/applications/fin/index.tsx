import {
  Banknote, BookOpen, Building2, CircleDollarSign, FileText, Landmark, Percent, PieChart, Receipt,
  ReceiptText, Scale, ScrollText, Wallet,
} from "lucide-react";
import { Button, Empty, Notice, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import type { AccountType } from "@/domain/fin-ledger";
import {
  CashflowTab, CorrectionProposal, FinanceInsights, FinanceOverview, FinanceOverviewHeader, FinanceTasks,
  MetricDrilldown, PeriodSelector,
} from "./overview";
import {
  AccountEditor, AccountHistory, CategoryMapper, ChartOfAccounts, DeactivationImpact, exportAccounts,
} from "./accounts";
import {
  BalancingValidator, JournalForm, JournalSearch, LedgerAudit, LedgerEntries, LedgerJournals, LedgerPeriods,
  LedgerStrip, ReverseConfirmation,
} from "./ledger";
import {
  BulkActionPreview, DocumentPreview, EmailPreview, InvoiceActivity, InvoiceHeader, InvoiceInspector,
  InvoiceLineItems, InvoiceList, InvoiceOverview, InvoicePayments, LineEditor, NewInvoice, PaymentForm,
  ReminderApproval, VoidReason, exportInvoices, issueLines, useInvoice,
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
import { useFinData } from "./data";

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
        { id: "issue report", label: "Choose a period", placement: "secondary", run: (context) => context.openOverlay("reporting-period selector") },
        { id: "ask Finance", label: "Ask Finance", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/ai/chat`) },
      ],
      overlays: [
        { id: "Metric drilldown", kind: "drawer", title: "Where this figure comes from", width: 560, render: ({ ...context }) => <MetricDrilldown context={context} /> },
        { id: "reporting-period selector", kind: "modal", title: "Reporting period", width: 520, render: ({ close, ...context }) => <PeriodSelector context={context} close={close} /> },
        { id: "correction proposal", kind: "modal", title: "Propose a correction", width: 540, render: ({ close, ...context }) => <CorrectionProposal context={context} close={close} /> },
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
        { id: "map category", label: "Map a category", placement: "overflow", run: (context) => context.openOverlay("category mapper") },
        { id: "export", label: "Export the chart", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export confirm") },
      ],
      overlays: [
        { id: "Account editor", kind: "modal", title: "Account", width: 580, render: ({ close, ...context }) => <AccountEditor context={context} close={close} /> },
        { id: "account history", kind: "drawer", title: "Postings on this account", width: 620, render: ({ ...context }) => <AccountHistory context={context} /> },
        { id: "deactivation impact", kind: "modal", title: "What deactivating would do", width: 560, tone: "danger", render: ({ close, ...context }) => <DeactivationImpact context={context} close={close} /> },
        { id: "category mapper", kind: "modal", title: "Map a category to an account", width: 560, render: ({ close, ...context }) => <CategoryMapper context={context} close={close} /> },
        { id: "export confirm", kind: "modal", title: "Export the chart of accounts", width: 460, render: ({ close, ...context }) => <ExportAccounts context={context} close={close} /> },
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
        { id: "Post approved journal", label: "New journal", placement: "primary", capability: "post_journal", run: (context) => context.openOverlay("Journal form") },
        { id: "inspect lines", label: "Open the journal", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a journal first"), run: (context) => context.openOverlay("Journal form", { id: context.selectedId }) },
        { id: "reverse", label: "Reverse", placement: "secondary", capability: "post_journal", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a posted journal first"), run: (context) => context.openOverlay("reverse confirmation", { id: context.selectedId }) },
        { id: "search", label: "Search the ledger", placement: "overflow", run: (context) => context.openOverlay("journal search") },
      ],
      overlays: [
        { id: "Journal form", kind: "drawer", title: (context) => (context.selectedId ? "Journal" : "New journal"), width: 920, render: ({ close, ...context }) => <JournalForm context={context} close={close} /> },
        { id: "balancing validator", kind: "drawer", title: "Draft journals checked", width: 620, render: ({ ...context }) => <BalancingValidator context={context} /> },
        { id: "reverse confirmation", kind: "modal", title: "Reverse a posted journal", width: 640, tone: "danger", render: ({ close, ...context }) => <ReverseConfirmation context={context} close={close} /> },
        { id: "journal search", kind: "modal", title: "Search the ledger", width: 720, render: ({ close, ...context }) => <JournalSearch context={context} close={close} /> },
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
        { id: "Create", label: "New invoice", placement: "primary", run: (context) => context.openOverlay("New invoice") },
        { id: "open record", label: "Open", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an invoice first"), run: (context) => context.navigate(`/o/${context.org.slug}/fin/invoices/${context.selectedId}`) },
        { id: "bulk reminders", label: "Draft reminders", placement: "secondary", run: (context) => context.openOverlay("reminder approval") },
        { id: "filter", label: "Ageing report", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/fin/reports?tab=Statements`) },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export invoices") },
      ],
      overlays: [
        { id: "New invoice", kind: "modal", title: "New invoice", width: 720, render: ({ close, ...context }) => <NewInvoice context={context} close={close} /> },
        { id: "bulk action preview", kind: "modal", title: "Reminders to be drafted", width: 680, render: ({ close, ...context }) => <BulkActionPreview context={context} close={close} /> },
        { id: "reminder approval", kind: "modal", title: "Approve reminders", width: 620, render: ({ close, ...context }) => <ReminderApproval context={context} close={close} /> },
        { id: "export invoices", kind: "modal", title: "Export invoices", width: 460, render: ({ close, ...context }) => <ExportInvoices context={context} close={close} /> },
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
        { id: "preview", label: "Preview", placement: "secondary", run: (context) => context.openOverlay("document preview") },
        { id: "record payment", label: "Record a payment", placement: "overflow", capability: "post_journal", run: (context) => context.openOverlay("payment form") },
        { id: "send", label: "Draft an email", placement: "overflow", run: (context) => context.openOverlay("email preview") },
        { id: "void", label: "Void or credit", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("void reason") },
      ],
      overlays: [
        { id: "Line item editor", kind: "drawer", title: "Line items", width: 1080, render: ({ close, ...context }) => <LineEditor context={context} close={close} /> },
        { id: "email preview", kind: "modal", title: "Draft an email", width: 640, render: ({ close, ...context }) => <EmailPreview context={context} close={close} /> },
        { id: "payment form", kind: "modal", title: "Record a payment", width: 620, render: ({ close, ...context }) => <PaymentForm context={context} close={close} /> },
        { id: "void reason", kind: "modal", title: "Void or credit this invoice", width: 580, tone: "danger", render: ({ close, ...context }) => <VoidReason context={context} close={close} /> },
        { id: "document preview", kind: "drawer", title: "Document preview", width: 860, render: ({ ...context }) => <DocumentPreview context={context} /> },
        { id: "approve invoice", kind: "modal", title: "Approve and post", width: 620, render: ({ close, ...context }) => <ApproveInvoice context={context} close={close} /> },
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
        { id: "approve", label: "Approve", placement: "secondary", capability: "approve_payment", guard: (context) => (context.selectedId ? undefined : "Select a bill first"), run: (context) => context.openOverlay("match inspector", { id: context.selectedId }) },
        { id: "schedule payment", label: "Record a payment run", placement: "overflow", capability: "approve_payment", run: (context) => context.openOverlay("payment authorization") },
      ],
      overlays: [
        { id: "Bill capture", kind: "modal", title: "Capture a bill", width: 680, render: ({ close, ...context }) => <BillCapture context={context} close={close} /> },
        { id: "match inspector", kind: "drawer", title: "Bill", width: 580, render: ({ close, ...context }) => <MatchInspector context={context} close={close} /> },
        { id: "payment authorization", kind: "modal", title: "Record a payment run", width: 760, tone: "danger", render: ({ close, ...context }) => <PaymentAuthorization context={context} close={close} /> },
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
        { id: "Upload receipt", label: "New claim", placement: "primary", run: (context) => context.openOverlay("Receipt capture") },
        { id: "assign category", label: "Map a category", placement: "secondary", run: (context) => context.openOverlay("category mapper") },
        { id: "approve", label: "Open the claim", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a claim first"), run: (context) => context.openOverlay("expense detail", { id: context.selectedId }) },
        { id: "reimburse", label: "Approval chain", placement: "overflow", run: (context) => context.openOverlay("approval chain") },
      ],
      overlays: [
        { id: "Receipt capture", kind: "modal", title: "New expense claim", width: 640, render: ({ close, ...context }) => <ReceiptCapture context={context} close={close} /> },
        { id: "expense detail", kind: "drawer", title: "Expense claim", width: 560, render: ({ close, ...context }) => <ExpenseDetail context={context} close={close} /> },
        { id: "approval chain", kind: "drawer", title: "Approval chain", width: 620, render: ({ ...context }) => <ApprovalChain context={context} /> },
        { id: "category mapper", kind: "modal", title: "Map a category to an account", width: 560, render: ({ close, ...context }) => <CategoryMapper context={context} close={close} /> },
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
        { id: "inspect mismatch", label: "Feed incidents", placement: "overflow", run: (context) => context.openOverlay("feed incident") },
      ],
      overlays: [
        { id: "Bank connection", kind: "modal", title: "Connect a bank account", width: 580, render: ({ close, ...context }) => <BankConnection context={context} close={close} /> },
        { id: "CSV mapper", kind: "drawer", title: "Import a CSV statement", width: 820, render: ({ close, ...context }) => <CsvMapper context={context} close={close} /> },
        { id: "feed incident", kind: "drawer", title: "Feed incidents", width: 560, render: ({ ...context }) => <FeedIncident context={context} /> },
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
        { id: "revision history", label: "Revision history", placement: "overflow", run: (context) => context.openOverlay("revision history") },
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
        { id: "review filing", label: "Code configuration", placement: "secondary", run: (context) => context.openOverlay("Tax configuration") },
        { id: "export", label: "Export the figures", placement: "overflow", capability: "export_data", run: (context) => context.setTab("Returns") },
      ],
      overlays: [
        { id: "Tax configuration", kind: "drawer", title: "Tax configuration", width: 620, render: ({ close, ...context }) => <TaxConfiguration context={context} close={close} /> },
        { id: "return review", kind: "modal", title: "Validate the return", width: 620, render: ({ ...context }) => <ReturnReview context={context} /> },
        { id: "filing authorization", kind: "modal", title: "Before filing", width: 640, tone: "danger", render: ({ close, ...context }) => <FilingAuthorization context={context} close={close} /> },
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
        { id: "drill down", label: "Drill into an account", placement: "secondary", run: (context) => context.openOverlay("drill down") },
        { id: "filter", label: "Source note", placement: "secondary", run: (context) => context.openOverlay("source note") },
        { id: "export", label: "Report designer", placement: "overflow", run: (context) => context.openOverlay("Report designer") },
        { id: "schedule", label: "Schedule", placement: "overflow", run: (context) => context.openOverlay("schedule") },
      ],
      overlays: [
        { id: "Report designer", kind: "modal", title: "Report designer", width: 620, render: ({ close, ...context }) => <ReportDesigner context={context} close={close} /> },
        { id: "source note", kind: "drawer", title: "Where these statements come from", width: 600, render: ({ ...context }) => <SourceNoteOverlay context={context} /> },
        { id: "schedule", kind: "modal", title: "Schedule a report", width: 520, render: ({ close, ...context }) => <ReportSchedule context={context} close={close} /> },
        { id: "drill down", kind: "drawer", title: "Account postings", width: 680, render: ({ ...context }) => <DrillDown context={context} /> },
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
        { id: "eliminate intercompany", label: "Intercompany", placement: "secondary", run: (context) => context.setTab("Intercompany") },
        { id: "inspect postings", label: "Inspect postings", placement: "overflow", run: (context) => context.openOverlay("inspect postings") },
      ],
      overlays: [
        { id: "Entity config", kind: "modal", title: "Legal entity", width: 620, render: ({ close, ...context }) => <EntityConfig context={context} close={close} /> },
        { id: "consolidation preview", kind: "modal", title: "Consolidation preview", width: 680, render: ({ close, ...context }) => <ConsolidationPreview context={context} close={close} /> },
        { id: "FX sources", kind: "drawer", title: "Exchange rates", width: 560, render: () => <FxSources /> },
        { id: "inspect postings", kind: "drawer", title: "Postings by entity", width: 680, render: ({ ...context }) => <EntityPostings context={context} /> },
      ],
    },
  },

  fallback: (context) => <Unavailable context={context} what={`${context.screen.title} is not implemented in Finance yet`} />,
});

/* ----------------------- Small overlay bodies ---------------------- */

function ExportAccounts({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The file is written in this browser">
        {data.accounts.length} accounts with their posted debits, credits and balances. Nothing is uploaded.
      </Notice>
      <Button variant="primary" onClick={() => { exportAccounts(context, data.accounts, data.trialRows); close(); }}>Download the CSV</Button>
    </Stack>
  );
}

function ExportInvoices({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The file is written in this browser">
        {data.invoices.length} invoices with their net, tax, gross, outstanding amount and the tax codes each one resolved to.
      </Notice>
      <Button variant="primary" onClick={() => { exportInvoices(context, data, data.invoices); close(); }}>Download the CSV</Button>
    </Stack>
  );
}

/** Approving a draft invoice freezes a version and posts the balanced journal. */
function ApproveInvoice({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, data, totals } = useInvoice(context);
  if (!invoice) return <Empty title="No invoice selected" />;

  if (invoice.status !== "draft") {
    return (
      <Notice tone="warning" title={`${invoice.title} is already ${invoice.status.replace(/_/g, " ")}`}>
        An issued invoice is immutable. Correct it with a credit note from the Void action.
      </Notice>
    );
  }

  const posting = issueLines(data, totals, invoice);
  const period = (invoice.at ?? context.now.toISOString()).slice(0, 7);
  const blocked = posting.problem
    ?? (totals.grossMinor <= 0 ? "The invoice has no positive value to post." : undefined)
    ?? (data.locked.includes(period) ? `${period} is a closed period.` : undefined);

  return (
    <Stack gap={4}>
      <Notice tone={blocked ? "danger" : "info"} title={blocked ? "This invoice cannot be approved" : "Approving posts a balanced journal"}>
        {blocked ?? "Receivables are debited with the gross, each revenue account is credited with its net, and the tax control account takes the resolved tax. The invoice then becomes immutable."}
      </Notice>
      {!blocked && (
        <div className="ds-grid-wrap">
          <div className="ds-grid-scroll">
            <table className="ds-table">
              <caption className="ds-sr-only">Journal that will be posted</caption>
              <thead><tr><th>Account</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
              <tbody>
                {posting.lines.map((line, index) => {
                  const account = data.accounts.find((item) => item.id === line.accountId);
                  return (
                    <tr key={`${line.accountId}-${index}`}>
                      <td className="ds-table-primary">{account ? `${String(account.fields.code)} ${account.title}` : "Account missing"}</td>
                      <td data-align="end" className="ds-num">{line.debitMinor ? context.money(line.debitMinor) : "—"}</td>
                      <td data-align="end" className="ds-num">{line.creditMinor ? context.money(line.creditMinor) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "start" }}>Totals</th>
                  <td data-align="end" className="ds-num">{context.money(posting.lines.reduce((sum, line) => sum + line.debitMinor, 0))}</td>
                  <td data-align="end" className="ds-num">{context.money(posting.lines.reduce((sum, line) => sum + line.creditMinor, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <Button
        variant="primary"
        disabled={Boolean(blocked) || !context.can("post_journal")}
        title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
        onClick={async () => {
          const date = (invoice.at ?? context.now.toISOString()).slice(0, 10);
          const journal = await context.mutate.create({
            collection: "journals",
            title: `Issue ${invoice.title}`,
            status: "posted",
            summary: `Receivable raised for ${invoice.title}.`,
            amountMinor: totals.grossMinor,
            at: `${date}T09:00:00.000Z`,
            parentId: invoice.id,
            tags: ["ledger", "invoice"],
            fields: { date, source: "invoice", invoiceId: invoice.id },
            body: { date, memo: invoice.title, lines: posting.lines },
          }, `Issued ${invoice.title} and posted a balanced journal`);
          const versions = ((invoice.body as { versions?: unknown[] })?.versions ?? []) as unknown[];
          await context.mutate.patch(invoice.id, {
            status: "awaiting_payment",
            amountMinor: totals.grossMinor,
            body: {
              ...(invoice.body as object ?? {}),
              versions: [...versions, { at: new Date().toISOString(), by: context.actor, note: "Issued and posted", grossMinor: totals.grossMinor }],
            },
            fields: { ...invoice.fields, journalId: journal.id, netMinor: totals.netMinor, taxMinor: totals.taxMinor, issuedAt: new Date().toISOString() },
          }, { expectRevision: invoice.revision, event: `${invoice.title} approved and issued` });
          context.toast("Invoice issued", `${context.money(totals.grossMinor)} is on the ledger as a balanced journal. The invoice is now immutable.`);
          close();
        }}
      >
        Approve and post {context.money(totals.grossMinor)}
      </Button>
    </Stack>
  );
}
