import { BarChart3, Boxes, FileText, PackageCheck, Truck, Warehouse } from "lucide-react";
import { Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { GrowthOverviewNav } from "@/app/GrowthOverviewNav";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { confirmOverlay, submitFooter } from "@/applications/market/kit";
import {
  approveAdjustment, approvePurchase, approveSuggestions, auditLocation, closeOrder, convertToPo, countReceipt,
  exportMovements, exportSpend, LinkContract, LocationInspector, PutAway, QuoteRequest, RejectRequisition, SpendCompare,
  SupplierCompare, SupplierInspect,
} from "./actions";
import "@/applications/market/growth.css";
import { PurchaseTrail, QuoteComparison } from "./quotes";
import { QualityReturn } from "./supplierInsights";
import { approverFor, statusTone } from "./data";
import {
  ProcurementAnalytics, ProcurementOverview, PurchaseOrders, Receiving, Replenishment,
  Requisitions, StockMovements, SupplierDetail, Suppliers, Warehouses,
} from "./panels";
import {
  BudgetCheck, ChangeImpact, ContractViewer, CostInspector, Discrepancy, LocationEditor,
  MetricSource, MovementAuthorization, MovementInspector, PoEditor, PurchasePreview,
  ReceiptConfirmation, ReorderPolicy, ReportDesigner, RequisitionForm,
  RequisitionReview, RiskEscalation, SanctionsReview, ScanOverlay, Scenario, SendPreview,
  StockAlert, StockCount, SupplierForm, SupplierReview, SupplierVerification, ThreeWayMatch,
  TransferForm,
} from "./overlays";

/* ====================================================================== *
 * PROC — Procurement & Receiving
 * Requisitions with a real approval limit, purchase orders that version
 * rather than duplicate, goods receipt that writes the stock movement, and
 * a three-way match that blocks an invoice which does not agree.
 * ====================================================================== */

const needsSelection = (context: ScreenContext) => (context.selectedId ? undefined : "Select a row first");

export const procApp = registerApp({
  code: "PROC",
  short: "Procurement",
  name: "Procurement & Receiving",
  purpose: "Buy, receive and match everything the studio spends",
  icon: Truck,
  nav: [
    { items: [
      { label: "Procurement Overview", screenId: "ARL-PROC-001", icon: BarChart3 },
    ] },
    { label: "Buying", items: [
      { label: "Purchase Requisitions", screenId: "ARL-PROC-004", icon: FileText },
      { label: "Purchase Orders", screenId: "ARL-PROC-005", icon: Truck },
      { label: "Replenishment", screenId: "ARL-PROC-009", icon: Boxes },
    ] },
    { label: "Suppliers", items: [
      { label: "Suppliers", screenId: "ARL-PROC-002", icon: Truck },
    ] },
    { label: "Goods", items: [
      { label: "Receiving", screenId: "ARL-PROC-007", icon: PackageCheck },
      { label: "Stock Movements", screenId: "ARL-PROC-008", icon: Boxes },
      { label: "Warehouses", screenId: "ARL-PROC-006", icon: Warehouse },
    ] },
    { label: "Measurement", items: [
      { label: "Procurement Analytics", screenId: "ARL-PROC-010", icon: BarChart3 },
    ] },
  ],
  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-PROC-001": {
      id: "ARL-PROC-001",
      header: (context: ScreenContext) => <GrowthOverviewNav context={context} code="PROC" />,
      subtitle: (context) => `What ${context.org.shortName} has committed, what is due in, and what cannot be paid yet.`,
      tabs: ["Overview", "Approvals", "Suppliers", "Stock"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ProcurementOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create requisition", label: "Raise a requisition", placement: "primary", run: (context) => context.openOverlay("Requisition form") },
        { id: "approve PO", label: "Approve selected", placement: "secondary", capability: "approve_payment", guard: (context) => (context.selectedId ? undefined : "Select an order awaiting approval on the Approvals tab"), run: (context) => approvePurchase(context) },
        { id: "inspect risk", label: "Stock risk", placement: "secondary", run: (context) => context.openOverlay("stock alert") },
        { id: "costs", label: "Inspect an invoice", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("cost inspector", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Requisition form", kind: "drawer", title: "Raise a requisition", width: 720, render: ({ close, ...context }) => <RequisitionForm context={context} close={close} />, footer: submitFooter("requisition-form", "Submit for approval") },
        { id: "Requisition", kind: "drawer", title: "Requisition review", width: 740, presentation: { noRecordContext: true, guidance: "Choose an actual submitted requisition, inspect the budget and approval limit, and decide with a named reviewer and a recorded reason." }, render: ({ close, ...context }) => <RequisitionReview context={context} close={close} /> },
        { id: "stock alert", kind: "drawer", title: "Stock risk", width: 620, render: ({ ...context }) => <StockAlert context={context} /> },
        { id: "cost inspector", kind: "drawer", title: "Invoice", width: 620, render: ({ ...context }) => <CostInspector context={context} /> },
        { id: "three-way match", kind: "drawer", title: "Three-way match", width: 780, render: ({ close, ...context }) => <ThreeWayMatch context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-PROC-002": {
      id: "ARL-PROC-002",
      subtitle: () => "Who is approved to supply, what they promise and what they have actually delivered.",
      tabs: ["All", "Approved", "Review", "Archived"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Suppliers context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "Add a supplier", placement: "primary", run: (context) => context.openOverlay("Supplier form") },
        { id: "evaluate", label: "Evaluate selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("supplier review", { id: context.selectedId }) },
        { id: "link contract", label: "Link a contract", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("link contract") },
        { id: "open", label: "Open supplier", placement: "overflow", guard: needsSelection, run: (context) => context.navigate(`/o/${context.org.slug}/proc/suppliers/${context.selectedId}`) },
        { id: "verify bank", label: "Verify bank detail", placement: "overflow", guard: needsSelection, capability: "approve_payment", run: (context) => context.openOverlay("verification", { id: context.selectedId }) },
        { id: "compliance", label: "Compliance screening", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("sanctions/compliance review", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Supplier form", kind: "drawer", title: "Supplier", width: 640, render: ({ close, ...context }) => <SupplierForm context={context} close={close} />, footer: submitFooter("supplier-form", "Save supplier") },
        { id: "verification", kind: "modal", title: "Verify bank detail", width: 600, render: ({ close, ...context }) => <SupplierVerification context={context} close={close} />, footer: submitFooter("supplier-verification", "Record verification") },
        { id: "sanctions/compliance review", kind: "drawer", title: "Compliance", width: 560, render: ({ ...context }) => <SanctionsReview context={context} /> },
        { id: "supplier review", kind: "modal", title: "Evaluate supplier", width: 620, render: ({ close, ...context }) => <SupplierReview context={context} close={close} />, footer: submitFooter("supplier-review", "Record evaluation") },
        { id: "link contract", kind: "modal", title: "Link a contract", width: 560, render: ({ close, ...context }) => <LinkContract context={context} close={close} />, footer: submitFooter("link-contract", "Link contract") },
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-PROC-003": {
      id: "ARL-PROC-003",
      title: () => "Supplier",
      subtitle: () => "Performance from recorded deliveries, contracts as written, and every order and invoice.",
      tabs: ["Overview", "Contracts", "Orders", "Communications"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SupplierDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Request quote", label: "Request a quote", placement: "primary", run: (context) => context.openOverlay("quote request") },
        { id: "update", label: "Update supplier", placement: "secondary", run: (context) => context.openOverlay("Supplier editor", { id: context.params.id }) },
        { id: "compare", label: "Compare suppliers", placement: "secondary", run: (context) => context.openOverlay("supplier compare") },
        { id: "review", label: "Review performance", placement: "overflow", run: (context) => context.openOverlay("supplier review", { id: context.params.id }) },
        { id: "requisition", label: "Raise a requisition", placement: "overflow", run: (context) => context.openOverlay("Requisition form") },
        { id: "flag", label: "Flag a risk", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("risk escalation") },
      ],
      overlays: [
        { id: "Supplier editor", kind: "drawer", title: "Supplier", width: 640, render: ({ close, ...context }) => <SupplierForm context={context} close={close} />, footer: submitFooter("supplier-form", "Save supplier") },
        { id: "contract viewer", kind: "drawer", title: "Contract", width: 640, render: ({ ...context }) => <ContractViewer context={context} /> },
        { id: "risk escalation", kind: "modal", title: "Flag a risk", width: 580, render: ({ close, ...context }) => <RiskEscalation context={context} close={close} />, footer: submitFooter("risk-escalation", "Flag for review") },
        { id: "supplier review", kind: "modal", title: "Supplier review", width: 620, render: ({ close, ...context }) => <SupplierReview context={context} close={close} />, footer: submitFooter("supplier-review", "Record review") },
        { id: "three-way match", kind: "drawer", title: "Three-way match", width: 780, render: ({ close, ...context }) => <ThreeWayMatch context={context} close={close} /> },
        { id: "Requisition form", kind: "drawer", title: "Raise a requisition", width: 720, render: ({ close, ...context }) => <RequisitionForm context={context} close={close} />, footer: submitFooter("requisition-form", "Submit for approval") },
        { id: "quote request", kind: "modal", title: "Request a quote", width: 600, render: ({ close, ...context }) => <QuoteRequest context={context} close={close} />, footer: submitFooter("quote-request", "Keep as a draft") },
        { id: "supplier compare", kind: "drawer", title: "Compare suppliers", width: 820, render: ({ ...context }) => <SupplierCompare context={context} /> },
      ],
      inspector: (context) => <SupplierFacts context={context} />,
      inspectorTitle: "Supplier facts",
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-PROC-004": {
      id: "ARL-PROC-004",
      subtitle: () => "A requisition commits nothing until someone with the right limit approves it.",
      tabs: ["Mine", "Team", "Awaiting approval", "Closed"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Requisitions context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "Raise a requisition", placement: "primary", run: (context) => context.openOverlay("Requisition form") },
        { id: "approve", label: "Approve selected", placement: "secondary", capability: "approve_payment", guard: needsSelection, run: (context) => context.openOverlay("Requisition", { id: context.selectedId }) },
        { id: "reject", label: "Reject selected", placement: "secondary", capability: "approve_payment", guard: needsSelection, run: (context) => context.openOverlay("rejection reason", { id: context.selectedId }) },
        { id: "convert to PO", label: "Convert to a purchase order", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an approved requisition"), run: (context) => convertToPo(context) },
        { id: "compare quotes", label: "Compare quotes", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("quote comparison", { id: context.selectedId }) },
        { id: "budget", label: "Budget check", placement: "overflow", run: (context) => context.openOverlay("budget check") },
      ],
      overlays: [
        { id: "Requisition form", kind: "drawer", title: "Requisition", width: 720, render: ({ close, ...context }) => <RequisitionForm context={context} close={close} />, footer: submitFooter("requisition-form", "Submit for approval") },
        { id: "Requisition", kind: "drawer", title: "Requisition review", width: 700, render: ({ close, ...context }) => <RequisitionReview context={context} close={close} /> },
        { id: "budget check", kind: "drawer", title: "Budget and limits", width: 660, render: ({ ...context }) => <BudgetCheck context={context} /> },
        { id: "quote comparison", kind: "drawer", title: "Supplier quotes", width: 900, render: ({ ...context }) => <QuoteComparison context={context} /> },
        { id: "rejection reason", kind: "modal", title: "Reject with a reason", width: 600, render: ({ close, ...context }) => <RejectRequisition context={context} close={close} />, footer: submitFooter("reject-requisition", "Reject requisition") },
        { id: "PO editor", kind: "drawer", title: "Purchase order", width: 760, render: ({ close, ...context }) => <PoEditor context={context} close={close} />, footer: submitFooter("po-editor", "Save order") },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-PROC-005": {
      id: "ARL-PROC-005",
      subtitle: () => "Issued orders are versioned, never duplicated, and a receipt is always raised against one.",
      tabs: ["Draft", "Approved", "Sent", "Received", "Closed"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <PurchaseOrders context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "Raise a purchase order", placement: "primary", run: (context) => context.openOverlay("PO editor") },
        { id: "send", label: "Issue selected", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("send preview", { id: context.selectedId }) },
        { id: "receive", label: "Receive against it", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("receive", { id: context.selectedId }) },
        { id: "revise", label: "Revise selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("PO editor", { id: context.selectedId }) },
        { id: "close", label: "Close selected", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => closeOrder(context) },
        { id: "revisions", label: "Revision history", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("change impact", { id: context.selectedId }) },
        { id: "purchase trail", label: "Purchase trail", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("purchase trail", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "PO editor", kind: "drawer", title: "Purchase order", width: 760, render: ({ close, ...context }) => <PoEditor context={context} close={close} />, footer: submitFooter("po-editor", "Save order") },
        { id: "change impact", kind: "drawer", title: "Revisions", width: 620, render: ({ ...context }) => <ChangeImpact context={context} /> },
        { id: "purchase trail", kind: "drawer", title: "Purchase trail", width: 640, render: ({ ...context }) => <PurchaseTrail context={context} /> },
        { id: "three-way match", kind: "drawer", title: "Three-way match", width: 780, render: ({ close, ...context }) => <ThreeWayMatch context={context} close={close} /> },
        { id: "send preview", kind: "drawer", title: "Issue the order", width: 680, render: ({ close, ...context }) => <SendPreview context={context} close={close} /> },
        { id: "receive", kind: "drawer", title: "Receive goods", width: 780, render: ({ close, ...context }) => <ScanOverlay context={context} close={close} />, footer: submitFooter("scan-overlay", "Record receipt") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-PROC-006": {
      id: "ARL-PROC-006",
      subtitle: () => "Sites, their capacity and everything that has moved through them.",
      tabs: ["Sites", "Bins", "Capacity", "Activity"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Warehouses context={context} lens={lens} />,
      })),
      actions: [
        { id: "Add bin", label: "Add a location", placement: "primary", run: (context) => context.openOverlay("Location editor") },
        { id: "transfer", label: "Transfer stock", placement: "secondary", run: (context) => context.openOverlay("transfer") },
        { id: "inspect", label: "Inspect selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("location inspector") },
        { id: "audit", label: "Audit selected", placement: "overflow", guard: needsSelection, run: (context) => auditLocation(context) },
        { id: "count", label: "Count a site", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("stock count", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Location editor", kind: "modal", title: "Location", width: 620, render: ({ close, ...context }) => <LocationEditor context={context} close={close} />, footer: submitFooter("location-editor", "Save location") },
        { id: "stock count", kind: "drawer", title: "Stock count", width: 720, render: ({ close, ...context }) => <StockCount context={context} close={close} />, footer: submitFooter("stock-count", "Record variances") },
        { id: "transfer", kind: "modal", title: "Transfer stock", width: 640, render: ({ close, ...context }) => <TransferForm context={context} close={close} />, footer: submitFooter("transfer-form", "Record transfer") },
        { id: "location inspector", kind: "drawer", title: "Location", width: 600, render: ({ ...context }) => <LocationInspector context={context} /> },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-PROC-007": {
      id: "ARL-PROC-007",
      subtitle: () => "Goods are received against a purchase order, and each receipt writes the stock movement behind it.",
      tabs: ["Expected", "Receiving", "Exceptions", "Complete"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Receiving context={context} state={state} />,
      })),
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Scans are local</Pill>
          <span className="ds-subtle">Each barcode is recorded once per receipt. A repeated scan is refused rather than counted again, so an offline count re-entered later cannot double the quantity.</span>
        </Row>
      ),
      actions: [
        { id: "Scan", label: "Scan a delivery", placement: "primary", run: (context) => context.openOverlay("Scan overlay") },
        { id: "count", label: "Count selected", placement: "secondary", guard: needsSelection, run: (context) => countReceipt(context) },
        { id: "flag damage", label: "Flag a discrepancy", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("discrepancy", { id: context.selectedId }) },
        { id: "put away", label: "Put away selected", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("put away") },
        { id: "quality return", label: "Return to supplier", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("quality return", { id: context.selectedId }) },
        { id: "open receipt", label: "Open selected", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("receipt confirmation", { id: context.selectedId }) },
        { id: "movements", label: "Stock movements", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/proc/movements`) },
      ],
      overlays: [
        { id: "Scan overlay", kind: "drawer", title: "Receive goods", width: 780, render: ({ close, ...context }) => <ScanOverlay context={context} close={close} />, footer: submitFooter("scan-overlay", "Record receipt") },
        { id: "discrepancy", kind: "modal", title: "Discrepancy", width: 620, render: ({ close, ...context }) => <Discrepancy context={context} close={close} />, footer: submitFooter("discrepancy", "Record discrepancy") },
        { id: "receipt confirmation", kind: "drawer", title: "Receipt", width: 700, render: ({ ...context }) => <ReceiptConfirmation context={context} /> },
        { id: "put away", kind: "modal", title: "Put away", width: 600, render: ({ close, ...context }) => <PutAway context={context} close={close} />, footer: submitFooter("put-away", "Put away") },
        { id: "quality return", kind: "modal", title: "Return to supplier", width: 620, render: ({ close, ...context }) => <QualityReturn context={context} close={close} />, footer: submitFooter("quality-return", "Record return") },
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-PROC-008": {
      id: "ARL-PROC-008",
      subtitle: () => "The inventory ledger is append-only: every level is the sum of movements that each name their source.",
      tabs: ["All", "Transfers", "Adjustments", "Counts"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <StockMovements context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create move", label: "Record a movement", placement: "primary", run: (context) => context.openOverlay("authorization") },
        { id: "approve adjustment", label: "Approve adjustment", placement: "secondary", guard: needsSelection, run: (context) => approveAdjustment(context) },
        { id: "reconcile", label: "Count reconciliation", placement: "secondary", run: (context) => context.openOverlay("count reconciliation") },
        { id: "export", label: "Export movements (CSV)", placement: "overflow", capability: "export_data", run: (context) => exportMovements(context) },
        { id: "inspect", label: "Inspect selected", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("Movement inspector", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Movement inspector", kind: "drawer", title: "Movement", width: 600, render: ({ ...context }) => <MovementInspector context={context} /> },
        { id: "count reconciliation", kind: "drawer", title: "Count reconciliation", width: 720, render: ({ close, ...context }) => <StockCount context={context} close={close} />, footer: submitFooter("stock-count", "Record variances") },
        { id: "authorization", kind: "modal", title: "Record a movement", width: 640, render: ({ close, ...context }) => <MovementAuthorization context={context} close={close} />, footer: submitFooter("movement-authorization", "Record movement") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 009 ------------------------------ */
    "ARL-PROC-009": {
      id: "ARL-PROC-009",
      subtitle: () => "Suggestions from the recorded reorder point and lead time. Nothing here commits money.",
      tabs: ["Suggested", "Planned", "Ordered", "Exceptions"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Replenishment context={context} lens={lens} />,
      })),
      actions: [
        { id: "create requisition", label: "Raise a requisition", placement: "primary", run: (context) => context.openOverlay("purchase preview", { productIds: context.selectedId ? [context.selectedId] : [] }) },
        { id: "Adjust forecast", label: "Adjust reorder points", placement: "secondary", run: (context) => context.openOverlay("scenario") },
        { id: "approve", label: "Approve suggestions", placement: "secondary", capability: "approve_payment", run: (context) => approveSuggestions(context) },
        { id: "policy", label: "How a suggestion is made", placement: "overflow", run: (context) => context.openOverlay("Reorder policy") },
      ],
      overlays: [
        { id: "Reorder policy", kind: "drawer", title: "Reorder policy", width: 660, render: () => <ReorderPolicy /> },
        { id: "scenario", kind: "drawer", title: "Scenario", width: 660, render: ({ ...context }) => <Scenario context={context} /> },
        { id: "purchase preview", kind: "drawer", title: "Raise a requisition", width: 720, render: ({ close, ...context }) => <PurchasePreview context={context} close={close} />, footer: submitFooter("requisition-form", "Submit for approval") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 010 ------------------------------ */
    "ARL-PROC-010": {
      id: "ARL-PROC-010",
      subtitle: () => "Spend counts approved, issued, received and closed orders. Cancelled and draft orders are excluded and named.",
      tabs: ["Spend", "Service", "Inventory", "Forecast"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ProcurementAnalytics context={context} lens={lens} />,
      })),
      actions: [
        { id: "Compare", label: "Compare periods", placement: "primary", run: (context) => context.openOverlay("spend compare") },
        { id: "inspect", label: "Inspect a supplier", placement: "secondary", run: (context) => context.openOverlay("supplier inspector") },
        { id: "report", label: "Save a report", placement: "secondary", run: (context) => context.openOverlay("report designer") },
        { id: "export", label: "Export spend (CSV)", placement: "overflow", capability: "export_data", run: (context) => exportSpend(context) },
        { id: "counted", label: "What is counted", placement: "overflow", run: (context) => context.openOverlay("Metric source") },
        { id: "review", label: "Review a supplier", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("supplier review", { id: context.selectedId }) },
        { id: "match", label: "Three-way match", placement: "overflow", run: (context) => context.openOverlay("three-way match") },
      ],
      overlays: [
        { id: "Metric source", kind: "drawer", title: "What spend counts", width: 700, render: ({ ...context }) => <MetricSource context={context} /> },
        { id: "report designer", kind: "modal", title: "Save a report", width: 560, render: ({ close, ...context }) => <ReportDesigner context={context} close={close} />, footer: submitFooter("proc-report", "Save report") },
        { id: "supplier review", kind: "modal", title: "Supplier review", width: 620, render: ({ close, ...context }) => <SupplierReview context={context} close={close} />, footer: submitFooter("supplier-review", "Record review") },
        { id: "three-way match", kind: "drawer", title: "Three-way match", width: 780, render: ({ close, ...context }) => <ThreeWayMatch context={context} close={close} /> },
        { id: "spend compare", kind: "drawer", title: "Compare periods", width: 700, render: ({ ...context }) => <SpendCompare context={context} /> },
        { id: "supplier inspector", kind: "drawer", title: "Supplier", width: 600, render: ({ ...context }) => <SupplierInspect context={context} /> },
      ],
    },
  },
});

function SupplierFacts({ context }: { context: ScreenContext }) {
  const supplier = useRecord(context.params.id);
  const { org } = useWorkspace();
  if (!supplier) return <Empty title="No supplier" >Open a supplier to see their facts here.</Empty>;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Record", value: <code>{supplier.id}</code> },
        { label: "State", value: <Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill> },
        { label: "Terms", value: String(supplier.fields.terms ?? "—") },
        { label: "Tax status", value: String(supplier.fields.taxStatus ?? "unknown").replace("_", " ") },
        { label: "Jurisdiction", value: org.jurisdiction },
        { label: "Approval limit for their orders", value: approverFor(Number(supplier.fields.spendToDateMinor ?? 0)) },
        { label: "Revision", value: <span className="ds-num">{String(supplier.revision)}</span> },
      ]} />
      <Notice tone="info" title="Performance is recorded, not reported by the supplier">
        On-time and acceptance rates come from delivery rows stored against this record. The supplier has no way to write to this workspace.
      </Notice>
    </Stack>
  );
}
