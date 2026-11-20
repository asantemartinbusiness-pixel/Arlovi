import { BarChart3, Boxes, CreditCard, Package, RotateCcw, ShoppingBag, Store, Tags, Truck } from "lucide-react";
import { Empty, KeyValueList, Notice, OVERLAY_WIDTH, Pill, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { GrowthOverviewNav } from "@/app/GrowthOverviewNav";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { confirmOverlay } from "@/applications/market/kit";
import { commerceFooter, hasPayloadIds, OrderHeading, orderMeta, ProductHeading } from "./kit";
import { RequisitionForm, ScanOverlay } from "@/applications/proc/overlays";
import {
  archiveProduct, AssignOrder, BuyerMessage, Categorise, ChangePrice, CheckoutPolicy, createLabel, CustomerSegments,
  deployCheckout, duplicateProduct, exportAnalytics, exportOrders, LayoutEditor, OrderFilter, pauseOffer, PeriodCompare,
  ProductInspect, publishStorefront, reorderStock, rollbackStorefront, ScanParcel, ScheduleOffer, StorefrontVersions, StorePicker, ThemeInspector,
} from "./actions";
import "@/applications/market/growth.css";
import { AdvanceShipment, FulfilLines, RaiseReturn, RecordRefund, StockAdjustmentForm, StockHistory } from "./operations";
import { bodyOf, taxCategoryOfProduct, type ProductBody } from "./data";
import {
  CheckoutAdmin, CommerceAnalytics, CommerceOverview, Fulfilment, Inventory, OrderDetail,
  Orders, ProductDetail, Products, Promotions, Returns, StorefrontBuilder,
} from "./panels";
import {
  BulkOperation, BulkPreview, CancellationImpact, CarrierSelector, ChartBuilder, CheckoutTest,
  CountReconciliation, DeliveryException, ExceptionList, ImportMapping, KpiExplanation, KpiInspector,
  LabelPreview, MarginCheck, MarginImpact, MediaPicker, OfferBuilder, OfferLaunchApproval,
  OrderQuickView, ProductEditor, ProviderSetup, PublishProduct,
  RefundApproval, RefundConfirmation, ReportSchedule, RestockAssessment,
  ReturnInspector, ShippingLabel, TemplatePicker,
  TransferApproval, VariantEditor,
} from "./overlays";

/* ====================================================================== *
 * COMMERCE — Catalogue, Storefront & Orders
 * A catalogue with variants, stock held as movements, orders whose totals
 * run through the tax engine, and a storefront a visitor can genuinely use
 * up to the payment boundary.
 * ====================================================================== */

const needsSelection = (context: ScreenContext) => (context.selectedId ? undefined : "Select a row first");

export const commerceApp = registerApp({
  code: "COMMERCE",
  short: "Commerce",
  name: "Commerce & Storefront",
  purpose: "Sell, fulfil and account for every order",
  icon: ShoppingBag,
  nav: [
    { items: [
      { label: "Commerce Overview", screenId: "ARL-COMMERCE-001", icon: BarChart3 },
    ] },
    { label: "Catalogue", items: [
      { label: "Products", screenId: "ARL-COMMERCE-002", icon: Package },
      { label: "Inventory", screenId: "ARL-COMMERCE-004", icon: Boxes },
      { label: "Promotions", screenId: "ARL-COMMERCE-011", icon: Tags },
    ] },
    { label: "Selling", items: [
      { label: "Storefront", screenId: "ARL-COMMERCE-007", icon: Store },
      { label: "Checkout & Payments", screenId: "ARL-COMMERCE-008", icon: CreditCard },
    ] },
    { label: "Orders", items: [
      { label: "Orders", screenId: "ARL-COMMERCE-005", icon: ShoppingBag },
      { label: "Fulfilment", screenId: "ARL-COMMERCE-009", icon: Truck },
      { label: "Returns & Refunds", screenId: "ARL-COMMERCE-010", icon: RotateCcw },
    ] },
    { label: "Measurement", items: [
      { label: "Commerce Analytics", screenId: "ARL-COMMERCE-012", icon: BarChart3 },
    ] },
  ],
  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-COMMERCE-001": {
      id: "ARL-COMMERCE-001",
      header: (context: ScreenContext) => <GrowthOverviewNav context={context} code="COMMERCE" />,
      subtitle: (context) => `Orders, stock and money for ${context.org.name}, reconciled to the records behind them.`,
      tabs: ["Overview", "Sales", "Operations", "Insights"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CommerceOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Review order", label: "Review orders", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/commerce/orders`) },
        { id: "create promotion", label: "New promotion", placement: "secondary", run: (context) => context.openOverlay("Offer builder") },
        { id: "inspect product", label: "Inspect a product", placement: "secondary", run: (context) => context.openOverlay("product inspector") },
        { id: "ask Commerce", label: "Ask Commerce", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/ai/chat`) },
        { id: "exceptions", label: "Exceptions", placement: "overflow", run: (context) => context.openOverlay("exception list") },
        { id: "location", label: "Choose a location", placement: "overflow", run: (context) => context.openOverlay("store picker") },
      ],
      overlays: [
        { id: "KPI explanation", kind: "drawer", title: "How this figure is built", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <KpiExplanation context={context} /> },
        { id: "exception list", kind: "drawer", title: "Exceptions", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <ExceptionList context={context} /> },
        { id: "store picker", kind: "modal", title: "Choose a location", width: OVERLAY_WIDTH.form, render: ({ close }) => <StorePicker close={close} />, footer: commerceFooter("store-picker", "Show this location") },
        { id: "Offer builder", kind: "drawer", title: "Offer", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <OfferBuilder context={context} close={close} />, footer: commerceFooter("offer-builder", "Save offer") },
        { id: "product inspector", kind: "drawer", title: "Product", width: OVERLAY_WIDTH.record, presentation: { noRecordContext: true }, render: ({ ...context }) => <ProductInspect context={context} /> },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-COMMERCE-002": {
      id: "ARL-COMMERCE-002",
      subtitle: () => "Every product with its SKU, variants, tax category, price and stock.",
      tabs: ["All", "Active", "Draft", "Collections", "Archived"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Products context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "New product", placement: "primary", run: (context) => context.openOverlay("Product editor") },
        { id: "bulk edit", label: "Bulk publish preview", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("bulk preview", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "categorize", label: "Categorise", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("categorise") },
        { id: "duplicate", label: "Duplicate", placement: "overflow", guard: needsSelection, run: (context) => duplicateProduct(context) },
        { id: "archive", label: "Archive selected", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => archiveProduct(context) },
        { id: "import", label: "Import from CSV", placement: "overflow", run: (context) => context.openOverlay("import mapping") },
      ],
      overlays: [
        { id: "Product editor", kind: "drawer", title: "Product", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <ProductEditor context={context} close={close} />, footer: commerceFooter("product-editor", "Save product") },
        { id: "import mapping", kind: "modal", title: "Import products", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ImportMapping context={context} close={close} />, footer: commerceFooter("import-mapping", "Import as drafts") },
        { id: "bulk preview", kind: "modal", title: "Bulk publish preview", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <BulkPreview context={context} close={close} /> },
        { id: "categorise", kind: "modal", title: "Categorise", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <Categorise context={context} close={close} />, footer: commerceFooter("categorise", "Move to collection") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-COMMERCE-003": {
      id: "ARL-COMMERCE-003",
      title: () => "Product",
      record: (context) => ({
        title: <ProductHeading context={context} part="title" />,
        status: <ProductHeading context={context} part="status" />,
        subtitle: <ProductHeading context={context} part="subtitle" />,
        meta: [<ProductHeading key="facts" context={context} part="meta" />],
      }),
      tabs: ["Overview", "Variants", "Media", "Pricing", "SEO", "History"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ProductDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Edit", label: "Edit product", placement: "primary", run: (context) => context.openOverlay("Product editor", { id: context.params.id }) },
        { id: "publish", label: "Publish", placement: "primary", run: (context) => context.openOverlay("publish") },
        { id: "add variant", label: "Add variant", placement: "secondary", run: (context) => context.openOverlay("Variant editor") },
        { id: "change price", label: "Change price", placement: "secondary", run: (context) => context.openOverlay("change price") },
        { id: "margin", label: "Margin impact", placement: "overflow", run: (context) => context.openOverlay("margin impact") },
        { id: "media", label: "Media", placement: "overflow", run: (context) => context.openOverlay("media picker") },
      ],
      overlays: [
        { id: "Variant editor", kind: "modal", title: "New variant", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <VariantEditor context={context} close={close} />, footer: commerceFooter("variant-editor", "Add variant") },
        { id: "media picker", kind: "modal", title: "Media", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <MediaPicker context={context} close={close} />, footer: commerceFooter("media-picker", "Add reference") },
        { id: "margin impact", kind: "drawer", title: "Margin impact", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ ...context }) => <MarginImpact context={context} /> },
        { id: "publish", kind: "modal", title: "Publish to the storefront", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <PublishProduct context={context} close={close} /> },
        { id: "Product editor", kind: "drawer", title: "Product", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <ProductEditor context={context} close={close} />, footer: commerceFooter("product-editor", "Save product") },
        { id: "change price", kind: "modal", title: "Change price", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <ChangePrice context={context} close={close} />, footer: commerceFooter("change-price", "Change price") },
      ],
      inspector: (context) => <ProductInspector context={context} />,
      inspectorTitle: "Product facts",
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-COMMERCE-004": {
      id: "ARL-COMMERCE-004",
      subtitle: () => "Stock is the sum of its movements. Available is on hand minus what open orders reserve.",
      tabs: ["Stock", "Movements", "Locations", "Replenishment"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Inventory context={context} lens={lens} />,
      })),
      actions: [
        { id: "Adjust", label: "Adjust stock", placement: "primary", run: (context) => context.openOverlay("Stock adjustment") },
        { id: "history", label: "Stock history", placement: "secondary", run: (context) => context.openOverlay("stock history") },
        { id: "transfer", label: "Transfer", placement: "secondary", run: (context) => context.openOverlay("transfer approval") },
        { id: "count", label: "Stock count", placement: "secondary", run: (context) => context.openOverlay("count reconciliation") },
        { id: "receive", label: "Receive against a PO", placement: "overflow", run: (context) => context.openOverlay("receive goods") },
        { id: "reorder", label: "Reorder selected", placement: "overflow", guard: needsSelection, run: (context) => reorderStock(context) },
        { id: "receiving", label: "Open Receiving", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/proc/receiving`) },
      ],
      overlays: [
        { id: "Stock adjustment", kind: "modal", title: "Adjust stock", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <StockAdjustmentForm context={context} close={close} />, footer: commerceFooter("stock-adjustment", "Record movement") },
        { id: "stock history", kind: "drawer", title: "Stock history", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <StockHistory context={context} /> },
        { id: "transfer approval", kind: "modal", title: "Transfer between locations", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <TransferApproval context={context} close={close} />, footer: commerceFooter("transfer-approval", "Record transfer") },
        { id: "count reconciliation", kind: "drawer", title: "Stock count", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <CountReconciliation context={context} close={close} />, footer: commerceFooter("count-reconciliation", "Record variances") },
        { id: "Requisition form", kind: "drawer", title: "Reorder: raise a requisition", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <RequisitionForm context={context} close={close} />, footer: commerceFooter("requisition-form", "Submit for approval") },
        { id: "receive goods", kind: "drawer", title: "Receive goods", width: OVERLAY_WIDTH.wide, render: ({ close, ...context }) => <ScanOverlay context={context} close={close} />, footer: commerceFooter("scan-overlay", "Record receipt") },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-COMMERCE-005": {
      id: "ARL-COMMERCE-005",
      subtitle: () => "Payment state and fulfilment state are separate, because they move for different reasons.",
      tabs: ["All", "Unfulfilled", "In transit", "Delivered", "Returns"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Orders context={context} state={state} />,
      })),
      actions: [
        { id: "View", label: "Quick view", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("Order quick view", { id: context.selectedId }) },
        { id: "bulk fulfil", label: "Bulk fulfil", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("bulk operation", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "filter", label: "Filter", placement: "secondary", run: (context) => context.openOverlay("order filter") },
        { id: "export", label: "Export CSV", placement: "overflow", capability: "export_data", run: (context) => exportOrders(context) },
        { id: "assign", label: "Assign selected", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("assign order") },
        { id: "propose refund", label: "Propose a refund", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("refund approval", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Order quick view", kind: "drawer", title: "Order", width: OVERLAY_WIDTH.record, presentation: { noRecordContext: true }, render: ({ ...context }) => <OrderQuickView context={context} /> },
        { id: "bulk operation", kind: "modal", title: "Bulk fulfilment", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <BulkOperation context={context} close={close} />, footer: commerceFooter("bulk-operation", "Apply to selected") },
        { id: "refund approval", kind: "modal", title: "Propose a refund", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <RefundApproval context={context} close={close} />, footer: commerceFooter("refund-approval", "Record proposal") },
        { id: "order filter", kind: "modal", title: "Filter orders", width: OVERLAY_WIDTH.form, render: ({ close }) => <OrderFilter close={close} />, footer: commerceFooter("order-filter", "Apply filter") },
        { id: "assign order", kind: "modal", title: "Assign order", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <AssignOrder context={context} close={close} />, footer: commerceFooter("assign-order", "Assign") },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-COMMERCE-006": {
      id: "ARL-COMMERCE-006",
      title: () => "Order",
      record: (context) => ({
        title: <OrderHeading context={context} part="title" />,
        status: <OrderHeading context={context} part="status" />,
        subtitle: <OrderHeading context={context} part="subtitle" />,
        meta: orderMeta(context),
      }),
      tabs: ["Overview", "Fulfilment", "Payments", "Returns", "Activity"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <OrderDetail context={context} lens={lens} />,
      })),
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>No payment processor</Pill>
          <span className="ds-subtle">Payment state is a local record. No charge, capture or refund has been attempted from this browser.</span>
        </Row>
      ),
      actions: [
        { id: "Fulfil", label: "Fulfil lines", placement: "primary", run: (context) => context.openOverlay("fulfil lines", { id: context.params.id }) },
        { id: "raise return", label: "Raise a return", placement: "secondary", run: (context) => context.openOverlay("raise return", { id: context.params.id }) },
        { id: "handover", label: "Whole-order handover", placement: "overflow", run: (context) => context.openOverlay("Shipping label") },
        { id: "refund proposal", label: "Propose a refund", placement: "secondary", run: (context) => context.openOverlay("refund approval", { id: context.params.id }) },
        { id: "contact buyer", label: "Contact the buyer", placement: "overflow", run: (context) => context.openOverlay("buyer message", { id: context.params.id }) },
        { id: "refund state", label: "Refund state", placement: "overflow", run: (context) => context.openOverlay("refund confirmation") },
        { id: "cancel", label: "Cancel order", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("cancellation impact") },
      ],
      overlays: [
        { id: "Shipping label", kind: "modal", title: "Carrier handover", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ShippingLabel context={context} close={close} /> },
        { id: "fulfil lines", kind: "drawer", title: "Fulfil lines", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <FulfilLines context={context} close={close} />, footer: commerceFooter("fulfil-lines", "Start shipment") },
        { id: "advance shipment", kind: "modal", title: "Update shipment", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <AdvanceShipment context={context} close={close} />, footer: commerceFooter("advance-shipment", "Record") },
        { id: "raise return", kind: "modal", title: "Raise a return", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <RaiseReturn context={context} close={close} />, footer: commerceFooter("raise-return", "Raise return") },
        { id: "refund authorization", kind: "modal", title: "Record a refund", width: OVERLAY_WIDTH.form, presentation: { selectedRecord: true, collection: "returns", noRecordContext: true }, render: ({ close, ...context }) => <RecordRefund context={context} close={close} />, footer: commerceFooter("record-refund", "Record refund") },
        { id: "cancellation impact", kind: "modal", title: "What cancelling does", tone: "danger", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <CancellationImpact context={context} close={close} /> },
        { id: "refund confirmation", kind: "drawer", title: "Refund", width: OVERLAY_WIDTH.record, presentation: { noRecordContext: true }, render: ({ ...context }) => <RefundConfirmation context={context} /> },
        { id: "refund approval", kind: "modal", title: "Propose a refund", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <RefundApproval context={context} close={close} />, footer: commerceFooter("refund-approval", "Record proposal") },
        { id: "buyer message", kind: "modal", title: "Contact the buyer", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <BuyerMessage context={context} close={close} />, footer: commerceFooter("buyer-message", "Keep as a draft") },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-COMMERCE-007": {
      id: "ARL-COMMERCE-007",
      subtitle: () => "Every block reads a record, so the shop cannot drift from the catalogue. The Preview tab is shoppable.",
      tabs: ["Pages", "Design", "Content", "Settings", "Preview"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <StorefrontBuilder context={context} lens={lens} />,
      })),
      actions: [
        { id: "preview", label: "Open the preview", placement: "primary", run: (context) => context.setTab("Preview") },
        { id: "edit theme", label: "Edit theme", placement: "secondary", run: (context) => context.openOverlay("Theme inspector") },
        { id: "Drag layout", label: "Arrange layout", placement: "secondary", run: (context) => context.openOverlay("layout editor") },
        { id: "publish", label: "Publish", placement: "overflow", run: (context) => publishStorefront(context) },
        { id: "rollback", label: "Roll back", placement: "overflow", tone: "danger", run: (context) => rollbackStorefront(context) },
        { id: "layout template", label: "Layout template", placement: "overflow", run: (context) => context.openOverlay("template picker") },
        { id: "publication", label: "Publication review", placement: "overflow", run: (context) => context.openOverlay("publication review") },
      ],
      overlays: [
        { id: "Theme inspector", kind: "drawer", title: "Theme", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ThemeInspector context={context} close={close} />, footer: commerceFooter("theme-inspector", "Save theme") },
        { id: "template picker", kind: "modal", title: "Storefront layout", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TemplatePicker context={context} close={close} />, footer: commerceFooter("storefront-template", "Save layout") },
        { id: "publication review", kind: "modal", title: "Publication review", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <StorefrontVersions context={context} /> },
        { id: "layout editor", kind: "modal", title: "Arrange the storefront", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <LayoutEditor context={context} close={close} />, footer: commerceFooter("layout-editor", "Save arrangement") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-COMMERCE-008": {
      id: "ARL-COMMERCE-008",
      subtitle: () => "What the checkout asks for, what it never asks for, and where it stops.",
      tabs: ["Experience", "Payments", "Tax", "Recovery"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CheckoutAdmin context={context} lens={lens} />,
      })),
      actions: [
        { id: "Configure", label: "Configure checkout", placement: "primary", run: (context) => context.openOverlay("policy change review") },
        { id: "test", label: "Test checkout", placement: "secondary", run: (context) => context.openOverlay("checkout test") },
        { id: "preview", label: "Preview in the storefront", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/commerce/storefront?tab=Preview`) },
        { id: "deploy", label: "Deploy policy", placement: "overflow", run: (context) => deployCheckout(context) },
        { id: "connect", label: "Connect a processor", placement: "overflow", capability: "manage_connectors", run: (context) => context.openOverlay("Provider setup") },
        { id: "monitor", label: "Monitor held orders", placement: "overflow", run: (context) => context.setTab("Recovery") },
      ],
      overlays: [
        { id: "Provider setup", kind: "modal", title: "Connect a payment provider", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ProviderSetup context={context} close={close} />, footer: commerceFooter("provider-setup", "Record the request") },
        { id: "checkout test", kind: "drawer", title: "Checkout checks", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <CheckoutTest context={context} /> },
        { id: "policy change review", kind: "modal", title: "Checkout policy", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CheckoutPolicy context={context} close={close} />, footer: commerceFooter("policy-change", "Save policy") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 009 ------------------------------ */
    "ARL-COMMERCE-009": {
      id: "ARL-COMMERCE-009",
      subtitle: () => "Pick, pack and handover. No carrier is connected, so nothing here is confirmed by a carrier.",
      tabs: ["Pick", "Pack", "Ship", "Track", "Exceptions"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Fulfilment context={context} lens={lens} />,
      })),
      actions: [
        { id: "fulfil lines", label: "Fulfil lines", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("fulfil lines", { id: context.selectedId }) },
        { id: "Create label", label: "Create label", placement: "secondary", guard: needsSelection, run: (context) => createLabel(context) },
        { id: "scan", label: "Scan", placement: "secondary", run: (context) => context.openOverlay("scan parcel") },
        { id: "handoff", label: "Hand off to carrier", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("handoff", { id: context.selectedId }) },
        { id: "carrier", label: "Choose a carrier", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("Carrier selector", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "label", label: "Label preview", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("label preview") },
        { id: "report exception", label: "Record an exception", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("delivery exception", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Carrier selector", kind: "modal", title: "Choose a carrier", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CarrierSelector context={context} close={close} />, footer: commerceFooter("carrier-selector", "Assign carrier", { ready: hasPayloadIds }) },
        { id: "label preview", kind: "drawer", title: "Label preview", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ ...context }) => <LabelPreview context={context} /> },
        { id: "delivery exception", kind: "modal", title: "Delivery exception", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <DeliveryException context={context} close={close} />, footer: commerceFooter("delivery-exception", "Record decision") },
        { id: "scan parcel", kind: "drawer", title: "Scan", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <ScanParcel context={context} /> },
        { id: "handoff", kind: "modal", title: "Hand off to the carrier", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ShippingLabel context={context} close={close} /> },
        { id: "fulfil lines", kind: "drawer", title: "Fulfil lines", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <FulfilLines context={context} close={close} />, footer: commerceFooter("fulfil-lines", "Start shipment") },
        { id: "advance shipment", kind: "modal", title: "Update shipment", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <AdvanceShipment context={context} close={close} />, footer: commerceFooter("advance-shipment", "Record") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 010 ------------------------------ */
    "ARL-COMMERCE-010": {
      id: "ARL-COMMERCE-010",
      subtitle: () => "Eligibility comes from the recorded policy. A dispute is escalated to a person, never decided by a rule.",
      tabs: ["Requested", "In review", "Approved", "Completed"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <Returns context={context} state={state} />,
      })),
      actions: [
        { id: "Approve", label: "Review and approve", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("Return inspector", { id: context.selectedId }) },
        { id: "restock", label: "Assess restocking", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("restock assessment", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "refund", label: "Record a refund", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("refund authorization", { id: context.selectedId }) },
        { id: "raise return", label: "Raise a return", placement: "secondary", run: (context) => context.openOverlay("raise return") },
        { id: "communicate", label: "Message the customer", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("buyer message", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Return inspector", kind: "drawer", title: "Return", width: OVERLAY_WIDTH.record, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <ReturnInspector context={context} close={close} /> },
        { id: "restock assessment", kind: "modal", title: "Restocking", width: OVERLAY_WIDTH.modal, presentation: { noRecordContext: true }, render: ({ close, ...context }) => <RestockAssessment context={context} close={close} />, footer: commerceFooter("restock-assessment", "Save assessment", { ready: hasPayloadIds }) },
        { id: "refund authorization", kind: "modal", title: "Record a refund", width: OVERLAY_WIDTH.form, presentation: { selectedRecord: true, collection: "returns", noRecordContext: true }, render: ({ close, ...context }) => <RecordRefund context={context} close={close} />, footer: commerceFooter("record-refund", "Record refund") },
        { id: "raise return", kind: "modal", title: "Raise a return", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <RaiseReturn context={context} close={close} />, footer: commerceFooter("raise-return", "Raise return") },
        { id: "buyer message", kind: "modal", title: "Message the customer", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <BuyerMessage context={context} close={close} />, footer: commerceFooter("buyer-message", "Keep as a draft") },
      ],
    },

    /* ------------------------------ 011 ------------------------------ */
    "ARL-COMMERCE-011": {
      id: "ARL-COMMERCE-011",
      subtitle: () => "Every offer carries a margin floor, and stacking cannot take a line below it.",
      tabs: ["Offers", "Codes", "Rules", "History"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Promotions context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create promotion", label: "New offer", placement: "primary", run: (context) => context.openOverlay("Offer builder") },
        { id: "model margin", label: "Model margin", placement: "secondary", run: (context) => context.openOverlay("margin check", { id: context.selectedId }) },
        { id: "schedule", label: "Schedule selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("schedule offer") },
        { id: "make live", label: "Make it live now", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("launch approval", { id: context.selectedId }) },
        { id: "pause", label: "Pause selected", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => pauseOffer(context) },
      ],
      overlays: [
        { id: "Offer builder", kind: "drawer", title: "Offer", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <OfferBuilder context={context} close={close} />, footer: commerceFooter("offer-builder", "Save offer") },
        { id: "margin check", kind: "drawer", title: "Margin check", width: OVERLAY_WIDTH.record, presentation: { noRecordContext: true }, render: ({ ...context }) => <MarginCheck context={context} /> },
        { id: "launch approval", kind: "modal", title: "Make this offer live", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <OfferLaunchApproval context={context} close={close} />, footer: commerceFooter("offer-launch", "Make live") },
        { id: "schedule offer", kind: "modal", title: "Schedule an offer", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ScheduleOffer context={context} close={close} />, footer: commerceFooter("schedule-offer", "Schedule") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 012 ------------------------------ */
    "ARL-COMMERCE-012": {
      id: "ARL-COMMERCE-012",
      subtitle: () => "Each figure names which returns it includes and which it does not.",
      tabs: ["Sales", "Products", "Customers", "Operations"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CommerceAnalytics context={context} lens={lens} />,
      })),
      actions: [
        { id: "Compare", label: "Compare periods", placement: "primary", run: (context) => context.openOverlay("period compare") },
        { id: "segment", label: "Segment customers", placement: "secondary", run: (context) => context.openOverlay("customer segments") },
        { id: "inspect source", label: "Inspect the source", placement: "secondary", run: (context) => context.openOverlay("KPI inspector", { metric: "returns" }) },
        { id: "export", label: "Export CSV", placement: "overflow", capability: "export_data", run: (context) => exportAnalytics(context) },
        { id: "chart", label: "Build a chart", placement: "overflow", run: (context) => context.openOverlay("Chart builder") },
        { id: "report", label: "Schedule a report", placement: "overflow", run: (context) => context.openOverlay("report schedule") },
      ],
      overlays: [
        { id: "Chart builder", kind: "modal", title: "Chart", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ChartBuilder context={context} close={close} />, footer: commerceFooter("chart-builder", "Save chart") },
        { id: "KPI inspector", kind: "drawer", title: "What this figure includes", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <KpiInspector context={context} /> },
        { id: "report schedule", kind: "modal", title: "Schedule a report", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ReportSchedule context={context} close={close} />, footer: commerceFooter("report-schedule", "Save schedule") },
        { id: "period compare", kind: "drawer", title: "Compare periods", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <PeriodCompare context={context} /> },
        { id: "customer segments", kind: "drawer", title: "Customer segments", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <CustomerSegments context={context} /> },
      ],
    },
  },
});

/* ---------------- Inspectors ---------------- */

function ProductInspector({ context }: { context: ScreenContext }) {
  const product = useRecord(context.params.id);
  const { org } = useWorkspace();
  if (!product) return <Empty title="No product" >Open a product from the catalogue to see its facts here.</Empty>;
  const body = bodyOf<ProductBody>(product, {});
  return (
    <Stack gap={4}>
      <KeyValueList items={[
        { label: "Variants", value: <span className="ds-num">{String((body.variants ?? []).length)}</span> },
        { label: "Tax category", value: taxCategoryOfProduct(product).replace("_", " ") },
        { label: "Jurisdiction", value: org.jurisdiction },
        { label: "Revision", value: <span className="ds-num">{String(product.revision)}</span> },
        { label: "Updated", value: context.relative(product.updatedAt) },
      ]} />
      <Notice tone="info" title="Where the stock figure comes from">
        On hand is the sum of every movement for this product. Nothing writes the level directly, so each change is traceable to a count, receipt, sale or adjustment.
      </Notice>
    </Stack>
  );
}
