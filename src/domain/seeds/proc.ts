import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/** Team 4 id block: every fixture id sits at nl-<collection>-6NN so it cannot
 *  collide with another workstream's contributor. */
const B = 600;

/* ====================================================================== *
 * PROC fixtures — suppliers, requisitions, purchase orders, goods receipts
 * and supplier invoices for the three-way match.
 * ====================================================================== */

const shift = (now: string, days: number, hour = 9) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

interface PoLine {
  id: string;
  description: string;
  productId?: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: string;
  receivedQuantity: number;
}

registerSeed("proc", (ctx) => {
  const records: Rec[] = [];
  const rec = (input: Parameters<typeof ctx.rec>[0]) => ctx.rec({ ...input, n: input.n + B });
  const id = (org: "nl" | "hb", collection: string, n: number) => ctx.id(org, collection, n + B);
  const now = ctx.now;
  const SUP = (n: number) => id("nl", "suppliers", n);
  const PO = (n: number) => id("nl", "purchaseOrders", n);
  const P = (n: number) => id("nl", "products", n);

  /* ---------------- Suppliers ---------------- */
  const suppliers: {
    n: number; title: string; status: string; email: string; terms: string; lead: number; city: string;
    onTime: number; quality: number; orders: number; spend: number; summary: string; category: string; approvedBy: string;
  }[] = [
    { n: 20, title: "Thames Brass Founders", status: "approved", email: "orders@thamesbrass.example", terms: "30 days", lead: 21, city: "London",
      onTime: 92, quality: 97, orders: 14, spend: 4_820_000, category: "Metal", approvedBy: "Maya Chen",
      summary: "Spun and cast brass components. Primary supplier since 2023." },
    { n: 21, title: "Millboard Packaging", status: "approved", email: "hello@millboard.example", terms: "14 days", lead: 7, city: "Leicester",
      onTime: 98, quality: 99, orders: 22, spend: 684_000, category: "Packaging", approvedBy: "Maya Chen",
      summary: "Cartons, tissue and void fill. Rarely late." },
    { n: 22, title: "Vellum Linen Mill", status: "approved", email: "trade@vellumlinen.example", terms: "30 days", lead: 28, city: "Dundee",
      onTime: 74, quality: 95, orders: 9, spend: 1_240_000, category: "Textile", approvedBy: "Maya Chen",
      summary: "Shade linen by the roll. Lead time slipped twice this year." },
    { n: 23, title: "Kestrel Electrical", status: "review", email: "sales@kestrelelec.example", terms: "On receipt", lead: 10, city: "Birmingham",
      onTime: 68, quality: 88, orders: 6, spend: 412_000, category: "Electrical", approvedBy: "",
      summary: "Cable, lamp holders and drivers. Under review after two short deliveries." },
    { n: 24, title: "Aalto Glass", status: "review", email: "export@aaltoglass.example", terms: "50% deposit", lead: 42, city: "Helsinki",
      onTime: 80, quality: 99, orders: 3, spend: 596_000, category: "Glass", approvedBy: "",
      summary: "Opal glass diffusers. EU supply, reverse charge applies." },
    { n: 25, title: "Pallet North", status: "approved", email: "bookings@palletnorth.example", terms: "14 days", lead: 2, city: "Leeds",
      onTime: 86, quality: 90, orders: 31, spend: 238_000, category: "Logistics", approvedBy: "Jonah Adeyemi",
      summary: "Pallet and two-person deliveries." },
    { n: 26, title: "Harlow Timber", status: "archived", email: "office@harlowtimber.example", terms: "30 days", lead: 14, city: "Harlow",
      onTime: 61, quality: 72, orders: 4, spend: 98_000, category: "Timber", approvedBy: "",
      summary: "Dropped in 2025 after repeated moisture failures." },
  ];
  for (const supplier of suppliers) {
    records.push(rec({
      org: "nl", collection: "suppliers", n: supplier.n, title: supplier.title, status: supplier.status,
      summary: supplier.summary,
      tags: [supplier.category.toLowerCase()],
      fields: {
        email: supplier.email,
        terms: supplier.terms,
        leadTimeDays: supplier.lead,
        city: supplier.city,
        category: supplier.category,
        onTimeRatePct: supplier.onTime,
        qualityRatePct: supplier.quality,
        ordersPlaced: supplier.orders,
        spendToDateMinor: supplier.spend,
        approvedBy: supplier.approvedBy,
        taxStatus: supplier.city === "Helsinki" ? "eu_business" : "domestic",
        bankLast4: supplier.n === 20 ? "4412" : supplier.n === 21 ? "9087" : "",
        bankVerifiedAt: supplier.n === 20 ? shift(now, -210, 10) : "",
        contactName: supplier.n === 20 ? "Ruth Ellory" : supplier.n === 22 ? "Callum Reid" : "Accounts desk",
      },
      body: {
        deliveries: Array.from({ length: 5 }, (_, index) => ({
          at: shift(now, -(index + 1) * 21, 11),
          promised: shift(now, -(index + 1) * 21, 11),
          lateDays: index === 1 && supplier.onTime < 90 ? 6 : index === 3 && supplier.onTime < 80 ? 11 : 0,
          accepted: true,
        })),
        notes: supplier.status === "review" ? "Two short deliveries recorded. Buyer asked for a corrective plan." : "",
      },
    }));
  }

  /* ---------------- Contracts ---------------- */
  records.push(
    rec({ org: "nl", collection: "contracts", n: 20, title: "Thames Brass supply agreement 2026/27", status: "active",
      amountMinor: 6_000_000, at: shift(now, -300, 9), dueAt: shift(now, 120, 9),
      summary: "Annual volume agreement with stepped pricing above 400 units.",
      fields: { supplierId: SUP(20), value: 6_000_000, renewal: "auto", noticeDays: 90, signed: false, reviewedBy: "", priceReviewAt: shift(now, 46, 9) },
      body: { clauses: [
        { id: "c1", title: "Stepped pricing", detail: "Unit price falls 6% above 400 units in a contract year.", risk: "low" },
        { id: "c2", title: "Automatic renewal", detail: "Renews for twelve months unless notice is given 90 days ahead.", risk: "medium" },
        { id: "c3", title: "Price variation", detail: "Supplier may pass through metal index movements above 8% with 30 days notice.", risk: "high" },
      ] } }),
    rec({ org: "nl", collection: "contracts", n: 21, title: "Millboard packaging rate card", status: "active",
      amountMinor: 900_000, at: shift(now, -180, 9), dueAt: shift(now, 185, 9),
      summary: "Fixed rate card for cartons and tissue.",
      fields: { supplierId: SUP(21), value: 900_000, renewal: "manual", noticeDays: 30, signed: false, reviewedBy: "Jonah Adeyemi", priceReviewAt: shift(now, 185, 9) },
      body: { clauses: [{ id: "c1", title: "Fixed rates", detail: "Rates held for twelve months.", risk: "low" }] } }),
    rec({ org: "nl", collection: "contracts", n: 22, title: "Aalto Glass pro-forma terms", status: "in_review",
      amountMinor: 1_200_000, at: shift(now, -20, 9), dueAt: shift(now, 25, 9),
      summary: "Fifty percent deposit, reverse charge, Incoterms DAP. Needs qualified review.",
      fields: { supplierId: SUP(24), value: 1_200_000, renewal: "none", noticeDays: 0, signed: false, reviewedBy: "", priceReviewAt: "" },
      body: { clauses: [
        { id: "c1", title: "Deposit", detail: "Fifty percent payable before production starts, non-refundable after cutting.", risk: "high" },
        { id: "c2", title: "Governing law", detail: "Finnish law, Helsinki courts.", risk: "high" },
      ] } }),
  );

  /* ---------------- Requisitions and purchase orders ---------------- */
  const purchases: {
    n: number; number: string; kind: "requisition" | "po"; supplier?: number; status: string; days: number;
    requester: string; approver?: string; budget: string; priority: string; lines: PoLine[]; summary: string;
    dueDays?: number; version?: number; sentAt?: number;
  }[] = [
    { n: 20, number: "REQ-312", kind: "requisition", supplier: 20, status: "awaiting_approval", days: -2, requester: "Theo Marsh", budget: "Workshop materials", priority: "high",
      summary: "Brass collars are below the reorder point for the winter run.",
      lines: [{ id: "l1", description: "Brass collar, 60mm", productId: P(20), quantity: 120, unitPriceMinor: 9_20, taxCategory: "standard", receivedQuantity: 0 }] },
    { n: 21, number: "REQ-313", kind: "requisition", supplier: 23, status: "awaiting_approval", days: -1, requester: "Theo Marsh", budget: "Workshop materials", priority: "normal",
      summary: "Lamp holders and 2m braided cable for the Halo build.",
      lines: [
        { id: "l1", description: "E27 lamp holder, brass", quantity: 80, unitPriceMinor: 3_40, taxCategory: "standard", receivedQuantity: 0 },
        { id: "l2", description: "Braided cable, 2m, black", quantity: 80, unitPriceMinor: 2_10, taxCategory: "standard", receivedQuantity: 0 },
      ] },
    { n: 22, number: "REQ-310", kind: "requisition", supplier: 21, status: "approved", days: -9, requester: "Priya Shah", approver: "Maya Chen", budget: "Packaging", priority: "normal",
      summary: "Cartons for the winter trade orders. Converted to PO-205.",
      lines: [{ id: "l1", description: "Carton 620×240×240", quantity: 300, unitPriceMinor: 1_40, taxCategory: "standard", receivedQuantity: 300 }] },
    { n: 23, number: "REQ-309", kind: "requisition", status: "rejected", days: -16, requester: "Theo Marsh", approver: "Maya Chen", budget: "Workshop equipment", priority: "low",
      summary: "Second laser measure. Rejected: the existing kit is adequate this quarter.",
      lines: [{ id: "l1", description: "Laser measure, 80m", quantity: 1, unitPriceMinor: 189_00, taxCategory: "standard", receivedQuantity: 0 }] },

    { n: 30, number: "PO-205", kind: "po", supplier: 21, status: "received", days: -8, dueDays: -1, requester: "Priya Shah", approver: "Maya Chen", budget: "Packaging", priority: "normal",
      summary: "Cartons. Received in full and matched to invoice MB-9981.", version: 1, sentAt: -8,
      lines: [{ id: "l1", description: "Carton 620×240×240", quantity: 300, unitPriceMinor: 1_40, taxCategory: "standard", receivedQuantity: 300 }] },
    { n: 31, number: "PO-206", kind: "po", supplier: 20, status: "sent", days: -14, dueDays: 7, requester: "Theo Marsh", approver: "Maya Chen", budget: "Workshop materials", priority: "high",
      summary: "Brass collars and weighted bases for the Beacon run.", version: 2, sentAt: -12,
      lines: [
        { id: "l1", description: "Brass collar, 60mm", productId: P(20), quantity: 200, unitPriceMinor: 9_20, taxCategory: "standard", receivedQuantity: 120 },
        { id: "l2", description: "Weighted base, 180mm", quantity: 60, unitPriceMinor: 24_50, taxCategory: "standard", receivedQuantity: 60 },
      ] },
    { n: 32, number: "PO-207", kind: "po", supplier: 22, status: "sent", days: -30, dueDays: -3, requester: "Maya Chen", approver: "Maya Chen", budget: "Workshop materials", priority: "normal",
      summary: "Shade linen, natural. Three days overdue against the promised date.", version: 1, sentAt: -30,
      lines: [{ id: "l1", description: "Shade linen, 1.4m roll", productId: P(23), quantity: 24, unitPriceMinor: 38_00, taxCategory: "standard", receivedQuantity: 0 }] },
    { n: 33, number: "PO-208", kind: "po", supplier: 24, status: "approved", days: -4, dueDays: 38, requester: "Maya Chen", approver: "Maya Chen", budget: "Workshop materials", priority: "normal",
      summary: "Opal diffusers from Helsinki. Reverse charge, not yet sent to the supplier.", version: 1,
      lines: [{ id: "l1", description: "Opal diffuser, 120mm", quantity: 90, unitPriceMinor: 14_60, taxCategory: "reverse_charge", receivedQuantity: 0 }] },
    { n: 34, number: "PO-209", kind: "po", supplier: 23, status: "draft", days: 0, dueDays: 14, requester: "Theo Marsh", budget: "Workshop materials", priority: "normal",
      summary: "Electrical components. Not approved, not sent.", version: 1,
      lines: [
        { id: "l1", description: "E27 lamp holder, brass", quantity: 80, unitPriceMinor: 3_40, taxCategory: "standard", receivedQuantity: 0 },
        { id: "l2", description: "Braided cable, 2m, black", quantity: 80, unitPriceMinor: 2_10, taxCategory: "standard", receivedQuantity: 0 },
      ] },
    { n: 35, number: "PO-203", kind: "po", supplier: 20, status: "closed", days: -62, dueDays: -40, requester: "Theo Marsh", approver: "Maya Chen", budget: "Workshop materials", priority: "normal",
      summary: "Autumn brass order. Closed and paid in the local ledger.", version: 1, sentAt: -62,
      lines: [{ id: "l1", description: "Brass collar, 60mm", productId: P(20), quantity: 180, unitPriceMinor: 8_90, taxCategory: "standard", receivedQuantity: 180 }] },
    { n: 36, number: "PO-204", kind: "po", supplier: 25, status: "cancelled", days: -45, dueDays: -38, requester: "Priya Shah", approver: "Maya Chen", budget: "Logistics", priority: "low",
      summary: "Cancelled before despatch; excluded from spend.", version: 1, sentAt: -45,
      lines: [{ id: "l1", description: "Pallet delivery, Manchester", quantity: 2, unitPriceMinor: 78_00, taxCategory: "standard", receivedQuantity: 0 }] },
  ];

  for (const purchase of purchases) {
    const net = purchase.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
    const tax = purchase.lines.reduce((sum, line) => sum + (line.taxCategory === "standard" ? Math.round(line.quantity * line.unitPriceMinor * 0.2) : 0), 0);
    records.push(rec({
      org: "nl", collection: "purchaseOrders", n: purchase.n, title: purchase.number,
      status: purchase.status, amountMinor: net + tax,
      at: shift(now, purchase.days, 10),
      dueAt: purchase.dueDays !== undefined ? shift(now, purchase.dueDays, 12) : undefined,
      summary: purchase.summary,
      owner: purchase.requester,
      tags: [purchase.kind],
      fields: {
        kind: purchase.kind,
        number: purchase.number,
        supplierId: purchase.supplier ? SUP(purchase.supplier) : "",
        requester: purchase.requester,
        approver: purchase.approver ?? "",
        approvedAt: purchase.approver ? shift(now, purchase.days + 1, 11) : "",
        budgetLine: purchase.budget,
        priority: purchase.priority,
        netMinor: net,
        taxMinor: tax,
        version: purchase.version ?? 1,
        sentAt: purchase.sentAt !== undefined ? shift(now, purchase.sentAt, 12) : "",
        delivery: "not_connected",
        warehouseId: "nl-warehouses-001",
      },
      body: {
        lines: purchase.lines,
        revisions: purchase.version && purchase.version > 1
          ? [{ version: 1, at: shift(now, purchase.days, 10), change: "Original order: 120 collars." },
             { version: 2, at: shift(now, purchase.days + 2, 15), change: "Raised to 200 collars after the November forecast." }]
          : [],
      },
    }));
  }

  /* ---------------- Goods receipts ---------------- */
  records.push(
    rec({ org: "nl", collection: "receipts", n: 20, title: "GRN-81", status: "complete",
      at: shift(now, -7, 11), summary: "Cartons received in full against PO-205.",
      fields: { purchaseOrderId: PO(30), supplierId: SUP(21), warehouseId: "nl-warehouses-001", receivedBy: "Theo Marsh", scanned: true, discrepancy: "none", lineCount: 1, quantityExpected: 300, quantityReceived: 300 },
      body: { lines: [{ lineId: "l1", description: "Carton 620×240×240", expected: 300, received: 300, condition: "good", bin: "A-04" }], scans: ["MB-620-240-240"] } }),
    rec({ org: "nl", collection: "receipts", n: 21, title: "GRN-82", status: "exception",
      at: shift(now, -5, 9), summary: "PO-206 part delivered: 120 of 200 collars, bases complete.",
      fields: { purchaseOrderId: PO(31), supplierId: SUP(20), warehouseId: "nl-warehouses-001", receivedBy: "Theo Marsh", scanned: true, discrepancy: "short", lineCount: 2, quantityExpected: 260, quantityReceived: 180 },
      body: { lines: [
        { lineId: "l1", description: "Brass collar, 60mm", expected: 200, received: 120, condition: "good", bin: "B-02" },
        { lineId: "l2", description: "Weighted base, 180mm", expected: 60, received: 60, condition: "good", bin: "B-03" },
      ], scans: ["TB-COL-60", "TB-BASE-180"] } }),
    rec({ org: "nl", collection: "receipts", n: 22, title: "GRN-83", status: "expected",
      at: shift(now, 7, 10), dueAt: shift(now, 7, 10), summary: "Remaining 80 collars expected against PO-206.",
      fields: { purchaseOrderId: PO(31), supplierId: SUP(20), warehouseId: "nl-warehouses-001", receivedBy: "", scanned: false, discrepancy: "none", lineCount: 1, quantityExpected: 80, quantityReceived: 0 },
      body: { lines: [{ lineId: "l1", description: "Brass collar, 60mm", expected: 80, received: 0, condition: "", bin: "" }], scans: [] } }),
    rec({ org: "nl", collection: "receipts", n: 23, title: "GRN-84", status: "expected",
      at: shift(now, -3, 10), dueAt: shift(now, -3, 10), summary: "Shade linen overdue against PO-207. Nothing has arrived.",
      fields: { purchaseOrderId: PO(32), supplierId: SUP(22), warehouseId: "nl-warehouses-001", receivedBy: "", scanned: false, discrepancy: "late", lineCount: 1, quantityExpected: 24, quantityReceived: 0 },
      body: { lines: [{ lineId: "l1", description: "Shade linen, 1.4m roll", expected: 24, received: 0, condition: "", bin: "" }], scans: [] } }),
    rec({ org: "nl", collection: "receipts", n: 24, title: "GRN-80", status: "complete",
      at: shift(now, -40, 11), summary: "Autumn brass order received in full against PO-203.",
      fields: { purchaseOrderId: PO(35), supplierId: SUP(20), warehouseId: "nl-warehouses-001", receivedBy: "Theo Marsh", scanned: true, discrepancy: "none", lineCount: 1, quantityExpected: 180, quantityReceived: 180 },
      body: { lines: [{ lineId: "l1", description: "Brass collar, 60mm", expected: 180, received: 180, condition: "good", bin: "B-02" }], scans: ["TB-COL-60"] } }),
  );

  /* ---------------- Supplier invoices (bills) for the three-way match ---------------- */
  records.push(
    rec({ org: "nl", collection: "bills", n: 20, title: "MB-9981", status: "matched",
      amountMinor: 50_400, at: shift(now, -6, 9), dueAt: shift(now, 8, 9),
      summary: "Millboard invoice for PO-205. Quantity and price agree with GRN-81.",
      fields: { supplierId: SUP(21), purchaseOrderId: PO(30), receiptId: id("nl", "receipts", 20), netMinor: 42_000, taxMinor: 8_400, matchState: "matched", number: "MB-9981", payment: "not_connected" },
      body: { lines: [{ id: "l1", description: "Carton 620×240×240", quantity: 300, unitPriceMinor: 1_40, taxCategory: "standard" }] } }),
    rec({ org: "nl", collection: "bills", n: 21, title: "TB-44120", status: "exception",
      amountMinor: 220_800, at: shift(now, -4, 9), dueAt: shift(now, 26, 9),
      summary: "Thames Brass billed 200 collars; only 120 were received. Quantity mismatch.",
      tags: ["mismatch"],
      fields: { supplierId: SUP(20), purchaseOrderId: PO(31), receiptId: id("nl", "receipts", 21), netMinor: 184_000, taxMinor: 36_800, matchState: "quantity_mismatch", number: "TB-44120", payment: "blocked" },
      body: { lines: [
        { id: "l1", description: "Brass collar, 60mm", quantity: 200, unitPriceMinor: 9_20, taxCategory: "standard" },
        { id: "l2", description: "Weighted base, 180mm", quantity: 60, unitPriceMinor: 24_50, taxCategory: "standard" },
      ] } }),
    rec({ org: "nl", collection: "bills", n: 22, title: "TB-43980", status: "paid",
      amountMinor: 192_240, at: shift(now, -38, 9), dueAt: shift(now, -8, 9),
      summary: "Autumn brass invoice, matched to GRN-80 and paid in the local ledger.",
      fields: { supplierId: SUP(20), purchaseOrderId: PO(35), receiptId: id("nl", "receipts", 24), netMinor: 160_200, taxMinor: 32_040, matchState: "matched", number: "TB-43980", payment: "paid_local" },
      body: { lines: [{ id: "l1", description: "Brass collar, 60mm", quantity: 180, unitPriceMinor: 8_90, taxCategory: "standard" }] } }),
    rec({ org: "nl", collection: "bills", n: 23, title: "KE-2201", status: "unmatched",
      amountMinor: 58_80, at: shift(now, -2, 9), dueAt: shift(now, -2, 9),
      summary: "Kestrel invoice with no purchase order and no receipt. Payment is blocked.",
      tags: ["no-po"],
      fields: { supplierId: SUP(23), purchaseOrderId: "", receiptId: "", netMinor: 49_00, taxMinor: 9_80, matchState: "no_purchase_order", number: "KE-2201", payment: "blocked" },
      body: { lines: [{ id: "l1", description: "Assorted drivers", quantity: 10, unitPriceMinor: 4_90, taxCategory: "standard" }] } }),
  );

  /* ---------------- Harbor ---------------- */
  records.push(
    rec({ org: "hb", collection: "suppliers", n: 20, title: "Narrows Galvanising", status: "approved",
      summary: "Harbor Supply finisher. Separate workspace.",
      fields: { email: "work@narrowsgalv.example", terms: "30 days", leadTimeDays: 12, city: "Brooklyn", category: "Finishing", onTimeRatePct: 95, qualityRatePct: 96, ordersPlaced: 8, spendToDateMinor: 1_120_000, approvedBy: "Elena Ward", taxStatus: "domestic", bankLast4: "", bankVerifiedAt: "", contactName: "Dana Pryce" },
      body: { deliveries: [], notes: "" } }),
    rec({ org: "hb", collection: "purchaseOrders", n: 20, title: "HB-PO-41", status: "approved",
      amountMinor: 326_25, at: shift(now, -3, 10), dueAt: shift(now, 9, 12),
      summary: "Galvanising run for 240 cleats.",
      fields: { kind: "po", number: "HB-PO-41", supplierId: id("hb", "suppliers", 20), requester: "Elena Ward", approver: "Elena Ward", approvedAt: shift(now, -2, 11), budgetLine: "Finishing", priority: "normal", netMinor: 300_00, taxMinor: 26_25, version: 1, sentAt: "", delivery: "not_connected", warehouseId: id("hb", "warehouses", 20) },
      body: { lines: [{ id: "l1", description: "Galvanise, per cleat", quantity: 240, unitPriceMinor: 1_25, taxCategory: "standard", receivedQuantity: 0 }], revisions: [] } }),
  );

  return { records };
});
