import { useState } from "react";
import {
  Button, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { getRecord, listByCollection } from "@/platform/repo";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE, downloadCsv, ProviderBoundary, type ConfirmSpec } from "@/applications/market/kit";
import {
  approverFor, APPROVAL_LIMITS, bodyOf, isPurchaseOrder, isRequisition, outstandingFor, poTotals, statusTone, useProcData,
  type PoBody, type PoLine, type ReceiptBody, type SupplierBody,
} from "./data";

/* ====================================================================== *
 * PROC contract actions that change a record. Nothing here commits money
 * beyond the approval limit of the person acting, and nothing leaves the
 * browser: supplier messages stop at the mail boundary.
 * ====================================================================== */

const iso = (context: ScreenContext) => context.now.toISOString();
const confirm = (context: ScreenContext, spec: ConfirmSpec) => context.openOverlay("confirm", spec);

async function load(context: ScreenContext, id = context.selectedId): Promise<Rec | undefined> {
  if (!id) return undefined;
  const record = await getRecord(id);
  if (!record) context.toast("Not found", "That record is no longer in this workspace.", "failed");
  return record;
}

/** The approval limit the active role view carries. Role views are not a security boundary. */
export function approvalLimitFor(context: Pick<ScreenContext, "role" | "can">): { role: string; limitMinor: number } {
  if (context.role === "owner") return APPROVAL_LIMITS[2];
  if (context.can("approve_payment")) return APPROVAL_LIMITS[1];
  return APPROVAL_LIMITS[0];
}

/* ---------------- PROC-001 approve PO ---------------- */

export async function approvePurchase(context: ScreenContext) {
  const record = await load(context);
  if (!record) return;
  if (record.collection !== "purchaseOrders" || record.status !== "awaiting_approval") {
    context.toast("Nothing to approve", `${record.title} is ${record.status.replace("_", " ")}. Pick an order or requisition that is awaiting approval on the Approvals tab.`, "blocked");
    return;
  }
  context.openOverlay("Requisition", { id: record.id });
}

/* ---------------- PROC-002 link contract ---------------- */

export function LinkContract({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const supplier = useRecord(context.selectedId);
  const [contractId, setContractId] = useState("");
  if (!supplier) return <Empty title="Select a supplier" />;
  const linked = data.contracts.filter((contract) => String(contract.fields.supplierId) === supplier.id);
  const available = data.contracts.filter((contract) => String(contract.fields.supplierId) !== supplier.id);
  const chosen = data.contracts.find((contract) => contract.id === (contractId || available[0]?.id));
  const takenBy = chosen && String(chosen.fields.supplierId) ? data.suppliers.find((item) => item.id === String(chosen.fields.supplierId)) : undefined;
  return (
    <form
      id="link-contract"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!chosen) return;
        const saved = await context.mutate.patch(chosen.id, { fields: { ...chosen.fields, supplierId: supplier.id, linkedBy: context.actor, linkedAt: iso(context), previousSupplierId: String(chosen.fields.supplierId ?? "") } }, { expectRevision: chosen.revision, event: `${chosen.title} linked to ${supplier.title} by ${context.actor}` });
        if (!saved) return;
        await context.mutate.patch(supplier.id, { fields: { ...supplier.fields, contractCount: linked.length + 1 } }, { expectRevision: supplier.revision, event: `${chosen.title} linked to ${supplier.title}` });
        context.toast("Contract linked", `${chosen.title} now belongs to ${supplier.title}. Its clauses still need a qualified review.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Supplier", value: supplier.title },
        { label: "Contracts already linked", value: linked.map((contract) => contract.title).join(", ") || "None" },
      ]} />
      {available.length === 0 ? <Empty title="No other contract on file">Add the contract in Legal first, then link it here.</Empty> : (
        <Field label="Contract">
          <Select value={chosen?.id ?? ""} onChange={(event) => setContractId(event.target.value)}>
            {available.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}
          </Select>
        </Field>
      )}
      {takenBy && <Notice tone="warning" title={`This contract is currently linked to ${takenBy.title}`}>Linking moves it to {supplier.title}; the previous supplier is kept on the contract record.</Notice>}
      <Notice tone="info">Linking records which supplier a contract governs. It does not review the clauses: those need a qualified reviewer.</Notice>
    </form>
  );
}

/* ---------------- PROC-003 request quote, compare ---------------- */

export function QuoteRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const supplier = useRecord(context.params.id);
  const { now } = useWorkspace();
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [neededBy, setNeededBy] = useState(new Date(now.getTime() + 21 * 86_400_000).toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  if (!supplier) return <Empty title="Loading the supplier" />;
  const email = String(supplier.fields.email ?? "");
  const invalid = !item.trim() || !(Number(quantity) > 0);
  return (
    <form
      id="quote-request"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const record = await context.mutate.create({
          collection: "quoteRequests", title: `RFQ · ${item.trim()}`, status: "draft", parentId: supplier.id,
          dueAt: new Date(`${neededBy}T12:00:00`).toISOString(), summary: note.trim() || `${quantity} × ${item.trim()}`,
          fields: { supplierId: supplier.id, item: item.trim(), quantity: Number(quantity), to: email, delivery: "not_connected", requestedBy: context.actor },
        }, `Quote requested from ${supplier.title}: ${quantity} × ${item.trim()} (kept as a local draft)`);
        await context.mutate.log(`Quote request ${record.title} to ${email || supplier.title} kept locally; no mail provider is connected.`, { entityId: supplier.id, type: "email.draft", capability: "ready_local" });
        context.toast("Quote request drafted", `The request to ${supplier.title} is on the supplier's Communications tab. It was not sent and commits nothing.`);
        close();
      }}
    >
      <Field label="What is needed" required><TextInput value={item} onChange={(event) => setItem(event.target.value)} /></Field>
      <Row gap={3} wrap>
        <Field label="Quantity" required><TextInput value={quantity} inputMode="numeric" align="end" onChange={(event) => setQuantity(event.target.value)} /></Field>
        <Field label="Needed by"><TextInput type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} /></Field>
      </Row>
      <Field label="Note for the supplier"><TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Notice tone="info">A quote request asks for a price. It is not a requisition or an order and commits no money.</Notice>
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export function QuoteRequests({ context, supplierId }: { context: ScreenContext; supplierId: string }) {
  const rows = useCollection("quoteRequests").filter((row) => String(row.fields.supplierId) === supplierId);
  if (rows.length === 0) return null;
  return (
    <DataGrid rows={rows} rowId={(row) => row.id} label="Quote requests" filterable={false}
      columns={[
        { key: "title", header: "Request", primary: true, cell: (row) => row.title },
        { key: "qty", header: "Quantity", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.quantity ?? "")}</span> },
        { key: "due", header: "Needed by", cell: (row) => context.date(row.dueAt) },
        { key: "state", header: "State", cell: () => <Pill tone="warning">Draft · not sent</Pill> },
      ]} />
  );
}

export function SupplierCompare({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const current = data.suppliers.find((supplier) => supplier.id === context.params.id);
  if (!current) return <Empty title="Loading suppliers" />;
  const peers = data.suppliers.filter((supplier) => supplier.status !== "archived" && (supplier.id === current.id || String(supplier.fields.category ?? "") === String(current.fields.category ?? "")));
  const rows = (peers.length > 1 ? peers : data.suppliers.filter((supplier) => supplier.status !== "archived")).map((supplier) => {
    const orders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && String(order.fields.supplierId) === supplier.id && !["cancelled", "draft"].includes(order.status));
    const deliveries = bodyOf<SupplierBody>(supplier, {}).deliveries ?? [];
    const late = deliveries.filter((delivery) => delivery.lateDays > 0).length;
    return {
      supplier,
      spend: orders.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0),
      orders: orders.length,
      onTime: deliveries.length ? Math.round(((deliveries.length - late) / deliveries.length) * 100) : undefined,
      accepted: deliveries.length ? Math.round((deliveries.filter((delivery) => delivery.accepted).length / deliveries.length) * 100) : undefined,
      lead: Number(supplier.fields.leadTimeDays ?? 0),
    };
  });
  return (
    <Stack gap={4}>
      <p className="ds-subtle">{current.title} against {rows.length - 1} other supplier{rows.length === 2 ? "" : "s"}{peers.length > 1 ? ` in ${String(current.fields.category ?? "the same category")}` : ""}.</p>
      <DataGrid rows={rows} rowId={(row) => row.supplier.id} label="Supplier comparison" filterable={false}
        columns={[
          { key: "title", header: "Supplier", primary: true, cell: (row) => (row.supplier.id === current.id ? <strong>{row.supplier.title}</strong> : row.supplier.title) },
          { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.supplier.status)}>{row.supplier.status}</Pill> },
          { key: "spend", header: "Spend counted", align: "end", cell: (row) => <span className="ds-num">{context.money(row.spend)}</span>, sortValue: (row) => row.spend },
          { key: "orders", header: "Orders", align: "end", cell: (row) => <span className="ds-num">{row.orders}</span> },
          { key: "ontime", header: "On time (recorded)", align: "end", cell: (row) => (row.onTime === undefined ? <span className="ds-subtle">No deliveries</span> : <span className="ds-num">{row.onTime}%</span>) },
          { key: "accepted", header: "Accepted", align: "end", cell: (row) => (row.accepted === undefined ? <span className="ds-subtle">—</span> : <span className="ds-num">{row.accepted}%</span>) },
          { key: "lead", header: "Stated lead time", align: "end", cell: (row) => <span className="ds-num">{row.lead}d</span> },
        ]} />
      <Notice tone="info">On-time and acceptance come from delivery rows recorded here, not from the supplier. A supplier with no recorded delivery shows none rather than a perfect score.</Notice>
    </Stack>
  );
}

/* ---------------- PROC-004 reject, convert ---------------- */

export function RejectRequisition({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const requisition = useRecord(payload?.id ?? context.selectedId);
  const [reason, setReason] = useState("");
  if (!requisition) return <Empty title="Select a requisition" />;
  const allowed = context.can("approve_payment") || context.role === "owner";
  const pending = requisition.status === "awaiting_approval";
  return (
    <form
      id="reject-requisition"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim() || !allowed || !pending) return;
        const saved = await context.mutate.patch(requisition.id, {
          status: "rejected",
          fields: { ...requisition.fields, approver: context.actor, approvedAt: iso(context), rejectionReason: reason.trim() },
        }, { expectRevision: requisition.revision, event: `${requisition.title} rejected by ${context.actor}: ${reason.trim()}` });
        if (!saved) return;
        context.toast("Rejected", "The reason is recorded on the requisition so the requester can see why. Nothing was committed.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Requisition", value: <span className="ds-num">{requisition.title}</span> },
        { label: "Requester", value: String(requisition.fields.requester ?? requisition.ownerName) },
        { label: "Amount", value: <span className="ds-num">{context.money(requisition.amountMinor)}</span> },
        { label: "State", value: <Pill tone={statusTone(requisition.status)}>{requisition.status.replace("_", " ")}</Pill> },
      ]} />
      {!pending && <Notice tone="warning" title="Only a requisition awaiting approval can be rejected">This one is {requisition.status.replace("_", " ")}.</Notice>}
      {!allowed && <Notice tone="danger" title="This role view does not decide requisitions">Rejecting is limited to the views that hold the approval capability. Role views shape the interface; they are not an account security boundary.</Notice>}
      <Field label="Reason" required hint="Shown to the requester."><TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    </form>
  );
}

export async function convertToPo(context: ScreenContext) {
  const requisition = await load(context);
  if (!requisition) return;
  if (!isRequisition(requisition)) {
    context.toast("Not a requisition", `${requisition.title} is not a requisition.`, "blocked");
    return;
  }
  if (requisition.status !== "approved" || !requisition.fields.approver) {
    context.toast("Approval first", `${requisition.title} is ${requisition.status.replace("_", " ")}. Only an approved requisition converts, so the approval chain cannot be skipped by converting.`, "blocked");
    return;
  }
  context.openOverlay("PO editor", { fromRequisition: requisition.id });
}

/* ---------------- PROC-005 close ---------------- */

export async function closeOrder(context: ScreenContext) {
  const order = await load(context);
  if (!order) return;
  const outstanding = outstandingFor(order).reduce((sum, row) => sum + row.outstanding, 0);
  const bills = (await listByCollection(context.org.id, "bills")).filter((bill) => String(bill.fields.purchaseOrderId) === order.id);
  const unpaid = bills.filter((bill) => !["paid", "approved"].includes(bill.status));
  confirm(context, {
    title: `Close ${order.title}`,
    tone: "danger",
    consequence: outstanding > 0
      ? `${outstanding} unit${outstanding === 1 ? " is" : "s are"} still outstanding. Closing records that nothing more will be received against this order; receipts and invoices stay against it.`
      : "Everything ordered has been received. Closing stops further receipts against it; receipts and invoices stay against it.",
    facts: [
      { label: "State", value: order.status },
      { label: "Outstanding units", value: String(outstanding) },
      { label: "Invoices not yet approved", value: String(unpaid.length) },
    ],
    blocked: order.status === "closed" ? "Already closed." : !["sent", "received", "approved"].includes(order.status) ? `A ${order.status} order cannot be closed; cancel or issue it first.` : undefined,
    confirmLabel: "Close order",
    run: async () => {
      const saved = await context.mutate.patch(order.id, { status: "closed", fields: { ...order.fields, closedBy: context.actor, closedAt: iso(context), closedWithOutstanding: outstanding } }, { expectRevision: order.revision, event: `${order.title} closed by ${context.actor}${outstanding ? ` with ${outstanding} units outstanding` : ""}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Closed", `${order.title} is closed.${unpaid.length ? ` ${unpaid.length} invoice${unpaid.length === 1 ? " still needs" : "s still need"} a three-way match.` : ""}`);
    },
  });
}

/* ---------------- PROC-006 inspect and audit a location ---------------- */

export function LocationInspector({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const site = useRecord(context.selectedId);
  if (!site || site.collection !== "warehouses") return <Empty title="Select a site">Pick a site on the Sites tab.</Empty>;
  const moves = data.stockMoves.filter((move) => String(move.fields.warehouseId) === site.id);
  const stock = data.products.map((product) => ({ product, onHand: moves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0) })).filter((row) => row.onHand !== 0);
  const units = stock.reduce((sum, row) => sum + row.onHand, 0);
  const lastCount = moves.filter((move) => String(move.fields.kind) === "count").sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Site", value: site.title },
        { label: "Code", value: <span className="ds-num">{String(site.fields.code ?? "—")}</span> },
        { label: "Units on hand", value: <span className="ds-num">{units}</span> },
        { label: "Capacity", value: <span className="ds-num">{String(site.fields.capacityUnits ?? "—")}</span> },
        { label: "Movements recorded", value: <span className="ds-num">{moves.length}</span> },
        { label: "Last count", value: lastCount ? context.dateTime(lastCount.at) : "Never counted" },
        { label: "Last audit", value: site.fields.lastAuditAt ? `${context.dateTime(String(site.fields.lastAuditAt))} · ${String(site.fields.lastAuditFindings ?? 0)} findings` : "Never audited" },
      ]} />
      <DataGrid rows={stock} rowId={(row) => row.product.id} label="Stock at this site" filterable={false}
        columns={[
          { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
          { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className={row.onHand < 0 ? "ds-field-error" : "ds-num"}>{row.onHand}</span> },
        ]} empty={<Empty title="Nothing held here" />} />
    </Stack>
  );
}

const PROOF_KINDS = ["receipt", "count", "transfer_in", "transfer_out", "sale", "put_away_in", "put_away_out"];

export async function auditLocation(context: ScreenContext) {
  const site = await load(context);
  if (!site) return;
  if (site.collection !== "warehouses") { context.toast("Select a site", "Pick a site on the Sites tab to audit it.", "blocked"); return; }
  const moves = (await listByCollection(context.org.id, "stockMoves")).filter((move) => String(move.fields.warehouseId) === site.id);
  const unreferenced = moves.filter((move) => !String(move.fields.reference ?? ""));
  const unproven = moves.filter((move) => !PROOF_KINDS.includes(String(move.fields.kind ?? "")) && !move.fields.approvedBy);
  const negative = new Map<string, number>();
  for (const move of moves) negative.set(String(move.fields.productId), (negative.get(String(move.fields.productId)) ?? 0) + Number(move.fields.quantity ?? 0));
  const belowZero = [...negative.values()].filter((value) => value < 0).length;
  const findings = unreferenced.length + unproven.length + belowZero;
  confirm(context, {
    title: `Audit ${site.title}`,
    consequence: `${moves.length} movements were checked for a reference, for scan, receipt or count proof (or a countersigned adjustment), and for any product below zero. The result is recorded on the site with your name.`,
    facts: [
      { label: "Movements without a reference", value: String(unreferenced.length) },
      { label: "Adjustments without a countersignature", value: String(unproven.length) },
      { label: "Products below zero", value: String(belowZero) },
    ],
    confirmLabel: "Record the audit",
    run: async () => {
      const saved = await context.mutate.patch(site.id, { fields: { ...site.fields, lastAuditAt: iso(context), lastAuditBy: context.actor, lastAuditFindings: findings, lastAuditMoves: moves.length } }, { expectRevision: site.revision, event: `${site.title} audited by ${context.actor}: ${findings} findings across ${moves.length} movements` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast(findings ? "Audit recorded with findings" : "Audit clean", findings ? `${findings} findings recorded on ${site.title}.` : `Every movement at ${site.title} is traceable.`, findings ? "blocked" : "ok");
    },
  });
}

/* ---------------- PROC-007 count, put away ---------------- */

export async function countReceipt(context: ScreenContext) {
  const receipt = await load(context);
  if (!receipt) return;
  if (receipt.collection !== "receipts") { context.toast("Select a receipt", "Pick an expected delivery to count it.", "blocked"); return; }
  if (receipt.status !== "expected") {
    context.toast("Already counted", `${receipt.title} was received as ${receipt.status}. Counting again would double the goods; record a discrepancy instead.`, "blocked");
    return;
  }
  context.openOverlay("Scan overlay", { id: receipt.id });
}

export function PutAway({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const receipt = useRecord(context.selectedId);
  const [target, setTarget] = useState("");
  if (!receipt || receipt.collection !== "receipts") return <Empty title="Select a received delivery">Put-away moves goods from the receiving dock of a completed receipt into a site.</Empty>;
  const order = data.purchaseOrders.find((item) => item.id === String(receipt.fields.purchaseOrderId));
  const orderLines = bodyOf<PoBody>(order, {}).lines ?? [];
  const lines = (bodyOf<ReceiptBody>(receipt, {}).lines ?? []).map((line) => ({ line, productId: orderLines.find((item) => item.id === line.lineId)?.productId }));
  const dock = String(receipt.fields.warehouseId ?? order?.fields.warehouseId ?? "");
  const destination = target || data.warehouses.find((item) => item.id !== dock)?.id || "";
  const done = receipt.fields.putAway === true;
  const blocked = receipt.status === "expected" ? "Nothing has been received on this receipt yet." : done ? `Already put away by ${String(receipt.fields.putAwayBy)}.` : destination === dock ? "Choose a site other than the receiving site." : lines.every((row) => !row.productId) ? "None of the lines is linked to a product, so there is no stock to move." : undefined;
  return (
    <form
      id="put-away"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocked) return;
        const reference = `PUT-${receipt.title}`;
        const site = data.warehouses.find((item) => item.id === destination);
        for (const row of lines.filter((item) => item.productId)) {
          const quantity = row.line.received;
          await context.mutate.create({ collection: "stockMoves", title: `put away out · ${row.line.description}`, status: "posted", at: iso(context), summary: `From receiving to ${site?.title}.`, fields: { productId: row.productId!, warehouseId: dock, quantity: -quantity, kind: "put_away_out", reference } }, `Put away ${quantity} × ${row.line.description} from receiving`);
          await context.mutate.create({ collection: "stockMoves", title: `put away in · ${row.line.description}`, status: "posted", at: iso(context), summary: `From ${receipt.title}.`, fields: { productId: row.productId!, warehouseId: destination, quantity, kind: "put_away_in", reference } }, `Put away ${quantity} × ${row.line.description} into ${site?.title}`);
        }
        const saved = await context.mutate.patch(receipt.id, { fields: { ...receipt.fields, putAway: true, putAwayBy: context.actor, putAwayAt: iso(context), putAwayTo: destination } }, { expectRevision: receipt.revision, event: `${receipt.title} put away into ${site?.title} by ${context.actor}` });
        if (!saved) return;
        context.toast("Put away", `${receipt.title} is in ${site?.title}. Each line wrote a pair of movements referencing ${reference}.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Receipt", value: <span className="ds-num">{receipt.title}</span> },
        { label: "Received at", value: data.warehouses.find((item) => item.id === dock)?.title ?? "—" },
        { label: "Lines", value: lines.map((row) => `${row.line.received} × ${row.line.description}`).join(", ") || "None" },
      ]} />
      <Field label="Put away into">
        <Select value={destination} onChange={(event) => setTarget(event.target.value)}>
          {data.warehouses.map((site) => <option key={site.id} value={site.id}>{site.title}{site.id === dock ? " (receiving site)" : ""}</option>)}
        </Select>
      </Field>
      {blocked ? <Notice tone="warning" title="Cannot put away">{blocked}</Notice> : <Notice tone="info">Each line writes a movement out of the receiving site and one into the chosen site, both referencing the receipt, so on-hand never changes without a traceable pair.</Notice>}
    </form>
  );
}

/* ---------------- PROC-008 approve adjustment, export ---------------- */

const ADJUSTMENT_KINDS = ["adjustment", "damage", "shrinkage", "found", "correction"];

export async function approveAdjustment(context: ScreenContext) {
  const move = await load(context);
  if (!move) return;
  const kind = String(move.fields.kind ?? "");
  const author = String(move.fields.authorisedBy ?? move.createdBy);
  confirm(context, {
    title: `Approve ${move.title}`,
    consequence: `Countersigns the ${kind} of ${String(move.fields.quantity)} as reviewed by ${context.actor}. The movement itself is not changed: the ledger stays append-only and the approval is recorded beside it.`,
    facts: [
      { label: "Quantity", value: String(move.fields.quantity) },
      { label: "Reason", value: move.summary || "None recorded" },
      { label: "Authorised by", value: author },
      { label: "Reference", value: String(move.fields.reference || "None") },
    ],
    blocked: !ADJUSTMENT_KINDS.includes(kind) ? `This is a ${kind.replace("_", " ") || "movement"}, which is proven by its own document. Only adjustments are countersigned.`
      : move.fields.approvedBy ? `Already approved by ${String(move.fields.approvedBy)}.`
        : author === context.actor ? "You recorded this adjustment. A second person has to approve it." : undefined,
    confirmLabel: "Approve adjustment",
    run: async () => {
      const saved = await context.mutate.patch(move.id, { fields: { ...move.fields, approvedBy: context.actor, approvedAt: iso(context) } }, { expectRevision: move.revision, event: `${move.title} approved by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Adjustment approved", `${move.title} is countersigned by ${context.actor}.`);
    },
  });
}

export async function exportMovements(context: ScreenContext) {
  const [moves, products, sites] = await Promise.all([
    listByCollection(context.org.id, "stockMoves"), listByCollection(context.org.id, "products"), listByCollection(context.org.id, "warehouses"),
  ]);
  const rows = [...moves].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const count = downloadCsv(`${context.org.slug}-stock-movements.csv`,
    ["when", "movement", "product", "site", "kind", "quantity", "reference", "recorded_by", "approved_by"],
    rows.map((move) => [move.at, move.title, products.find((product) => product.id === String(move.fields.productId))?.title ?? String(move.fields.productId), sites.find((site) => site.id === String(move.fields.warehouseId))?.title ?? "", String(move.fields.kind ?? ""), Number(move.fields.quantity ?? 0), String(move.fields.reference ?? ""), move.createdBy, String(move.fields.approvedBy ?? "")]));
  await context.mutate.log(`Stock movements exported as CSV (${count} rows)`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} movements downloaded from this browser.`);
}

/* ---------------- PROC-009 approve suggestions, apply scenario ---------------- */

export interface Suggestion { product: Rec; onHand: number; onOrder: number; point: number; quantity: number; gap: number }

export function suggestionsFrom(products: Rec[], moves: Rec[], orders: Rec[]): Suggestion[] {
  return products.filter((product) => product.status === "active").map((product) => {
    const onHand = moves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
    const onOrder = orders.filter((order) => (isPurchaseOrder(order) && ["approved", "sent"].includes(order.status)) || (isRequisition(order) && ["awaiting_approval", "approved"].includes(order.status)))
      .flatMap((order) => bodyOf<PoBody>(order, {}).lines ?? [])
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + (line.quantity - line.receivedQuantity), 0);
    const point = Number(product.fields.reorderPoint ?? 0);
    return { product, onHand, onOrder, point, quantity: Number(product.fields.reorderQuantity ?? 0), gap: point - (onHand + onOrder) };
  }).filter((row) => row.gap > 0 && row.quantity > 0);
}

export async function approveSuggestions(context: ScreenContext) {
  const [products, moves, orders, suppliers] = await Promise.all([
    listByCollection(context.org.id, "products"), listByCollection(context.org.id, "stockMoves"),
    listByCollection(context.org.id, "purchaseOrders"), listByCollection(context.org.id, "suppliers"),
  ]);
  const all = suggestionsFrom(products, moves, orders);
  const picked = context.selectedId ? all.filter((row) => row.product.id === context.selectedId) : all;
  const lastSupplierFor = (productId: string) => [...orders].filter(isPurchaseOrder).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .find((order) => (bodyOf<PoBody>(order, {}).lines ?? []).some((line) => line.productId === productId))?.fields.supplierId;
  const fallback = suppliers.find((supplier) => supplier.status === "approved") ?? suppliers[0];
  const groups = new Map<string, Suggestion[]>();
  for (const row of picked) {
    const supplierId = String(lastSupplierFor(row.product.id) ?? fallback?.id ?? "");
    groups.set(supplierId, [...(groups.get(supplierId) ?? []), row]);
  }
  const lineValue = (row: Suggestion) => row.quantity * Number(row.product.fields.unitCostMinor ?? 0);
  const total = picked.reduce((sum, row) => sum + lineValue(row), 0);
  confirm(context, {
    title: picked.length === 1 ? `Approve the suggestion for ${picked[0].product.title}` : `Approve ${picked.length} suggestions`,
    consequence: `${groups.size} requisition${groups.size === 1 ? " is" : "s are"} raised at the suggested quantities, one per supplier, each awaiting approval. Approving a suggestion commits no money: every requisition still needs ${approverFor(total)} approval within their limit before an order can exist.`,
    facts: picked.map((row) => ({ label: row.product.title, value: `${row.quantity} units · ${context.money(lineValue(row))} net at recorded cost` })),
    blocked: picked.length === 0 ? (context.selectedId ? "The selected product does not need reordering, or is already covered by an open requisition or order." : "Nothing needs reordering.") : undefined,
    confirmLabel: `Raise ${groups.size} requisition${groups.size === 1 ? "" : "s"}`,
    run: async () => {
      let index = 0;
      for (const [supplierId, rows] of groups) {
        const supplier = suppliers.find((item) => item.id === supplierId);
        const lines: PoLine[] = rows.map((row, position) => ({ id: `l${position + 1}`, description: row.product.title, productId: row.product.id, quantity: row.quantity, unitPriceMinor: Number(row.product.fields.unitCostMinor ?? 0), taxCategory: "standard", receivedQuantity: 0 }));
        const totals = poTotals({ at: iso(context), createdAt: iso(context), body: { lines } } as Rec, supplier, context.org.jurisdiction);
        const number = `REQ-${320 + orders.length + index}`;
        index += 1;
        await context.mutate.create({
          collection: "purchaseOrders", title: number, status: "awaiting_approval", amountMinor: totals.grossMinor, at: iso(context), ownerName: context.actor,
          summary: `Replenishment suggestion approved by ${context.actor}: below reorder point.`, tags: ["requisition", "replenishment"],
          fields: { kind: "requisition", number, supplierId, requester: context.actor, approver: "", approvedAt: "", budgetLine: "Workshop materials", priority: "normal", netMinor: totals.netMinor, taxMinor: totals.taxMinor, version: 1, sentAt: "", delivery: "not_connected", warehouseId: "", source: "replenishment" },
          body: { lines, revisions: [] },
        }, `Requisition ${number} raised from ${rows.length} replenishment suggestion${rows.length === 1 ? "" : "s"} by ${context.actor}`);
      }
      context.toast("Suggestions approved", `${groups.size} requisition${groups.size === 1 ? "" : "s"} now await approval. Nothing is ordered or committed yet.`);
    },
  });
}

export async function applyScenario(context: ScreenContext, uplift: number) {
  const products = (await listByCollection(context.org.id, "products")).filter((product) => product.status === "active");
  const factor = 1 + uplift / 100;
  const changes = products.map((product) => ({ product, from: Number(product.fields.reorderPoint ?? 0), to: Math.round(Number(product.fields.reorderPoint ?? 0) * factor) })).filter((row) => row.to !== row.from);
  confirm(context, {
    title: `Adjust reorder points by ${uplift > 0 ? "+" : ""}${uplift}%`,
    consequence: `${changes.length} product${changes.length === 1 ? "'s" : "s'"} reorder point changes. This is the figure suggestions are made from, so it changes what is suggested; it does not create an order.`,
    facts: changes.slice(0, 8).map((row) => ({ label: row.product.title, value: `${row.from} → ${row.to}` })),
    blocked: changes.length === 0 ? "No reorder point changes at this percentage." : !context.can("approve_payment") && context.role !== "owner" ? "Changing reorder points is limited to the views that can approve purchasing." : undefined,
    confirmLabel: "Apply to reorder points",
    run: async () => {
      for (const row of changes) {
        const saved = await context.mutate.patch(row.product.id, { fields: { ...row.product.fields, reorderPoint: row.to, reorderPointWas: row.from, reorderPointChangedBy: context.actor } }, { expectRevision: row.product.revision, event: `${row.product.title} reorder point ${row.from} → ${row.to} (${uplift}% scenario applied by ${context.actor})` });
        if (!saved) return CHANGED_ELSEWHERE;
      }
      context.toast("Forecast adjusted", `${changes.length} reorder points changed. Suggestions now use them.`);
    },
  });
}

/* ---------------- PROC-010 compare, inspect, export ---------------- */

export function SpendCompare({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const [days, setDays] = useState(90);
  const end = context.now.getTime();
  const span = days * 86_400_000;
  const counted = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && !["cancelled", "draft"].includes(order.status));
  const inWindow = (order: Rec, from: number, to: number) => { const at = new Date(order.at ?? order.createdAt).getTime(); return at > from && at <= to; };
  const rows = data.suppliers.map((supplier) => {
    const mine = counted.filter((order) => String(order.fields.supplierId) === supplier.id);
    const now = mine.filter((order) => inWindow(order, end - span, end)).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
    const before = mine.filter((order) => inWindow(order, end - 2 * span, end - span)).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
    return { supplier, now, before };
  }).filter((row) => row.now || row.before);
  const cancelled = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && order.status === "cancelled" && inWindow(order, end - span, end));
  return (
    <Stack gap={4}>
      <Field label="Period"><Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>{[30, 90, 180].map((value) => <option key={value} value={value}>{value} days</option>)}</Select></Field>
      <DataGrid rows={rows} rowId={(row) => row.supplier.id} label="Spend compared" filterable={false}
        columns={[
          { key: "supplier", header: "Supplier", primary: true, cell: (row) => row.supplier.title },
          { key: "now", header: `Last ${days} days`, align: "end", cell: (row) => <span className="ds-num">{context.money(row.now)}</span>, sortValue: (row) => row.now },
          { key: "before", header: `The ${days} before`, align: "end", cell: (row) => <span className="ds-num">{context.money(row.before)}</span> },
          { key: "change", header: "Change", align: "end", cell: (row) => <span className="ds-num">{row.before ? `${row.now >= row.before ? "+" : ""}${(((row.now - row.before) / row.before) * 100).toFixed(0)}%` : row.now ? "New" : "—"}</span> },
        ]}
        summary={<span>{context.money(rows.reduce((sum, row) => sum + row.now, 0))} against {context.money(rows.reduce((sum, row) => sum + row.before, 0))}</span>} />
      <Notice tone="info" title="What is counted">Approved, sent, received and closed orders by order date. {cancelled.length} cancelled order{cancelled.length === 1 ? " is" : "s are"} excluded from the current period, as are drafts.</Notice>
    </Stack>
  );
}

export function SupplierInspect({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const [chosen, setChosen] = useState("");
  const supplier = data.suppliers.find((item) => item.id === (chosen || context.selectedId)) ?? data.suppliers[0];
  if (!supplier) return <Empty title="No suppliers" />;
  const orders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && String(order.fields.supplierId) === supplier.id);
  const counted = orders.filter((order) => !["cancelled", "draft"].includes(order.status));
  const totals = counted.map((order) => poTotals(order, supplier, context.org.jurisdiction));
  return (
    <Stack gap={4}>
      <Field label="Supplier"><Select value={supplier.id} onChange={(event) => setChosen(event.target.value)}>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Properties rows={[
        { label: "State", value: <Pill tone={statusTone(supplier.status)}>{supplier.status}</Pill> },
        { label: "Spend counted (gross)", value: <span className="ds-num">{context.money(totals.reduce((sum, item) => sum + item.grossMinor, 0))}</span> },
        { label: "Of which tax", value: <span className="ds-num">{context.money(totals.reduce((sum, item) => sum + item.taxMinor, 0))}</span> },
        { label: "Orders counted", value: <span className="ds-num">{counted.length} of {orders.length}</span> },
        { label: "Excluded", value: `${orders.length - counted.length} draft or cancelled` },
        { label: "On time (recorded)", value: supplier.fields.onTimeRatePct !== undefined ? `${String(supplier.fields.onTimeRatePct)}%` : "Not recorded" },
      ]} />
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/proc/suppliers/${supplier.id}`); }}>Open the supplier</Button>
    </Stack>
  );
}

export async function exportSpend(context: ScreenContext) {
  const [orders, suppliers] = await Promise.all([listByCollection(context.org.id, "purchaseOrders"), listByCollection(context.org.id, "suppliers")]);
  const rows = orders.filter(isPurchaseOrder).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const count = downloadCsv(`${context.org.slug}-procurement-spend.csv`,
    ["order", "date", "supplier", "status", "counted_in_spend", "net_minor", "tax_minor", "gross_minor", "currency"],
    rows.map((order) => {
      const supplier = suppliers.find((item) => item.id === String(order.fields.supplierId));
      const totals = poTotals(order, supplier, context.org.jurisdiction);
      return [order.title, order.at, supplier?.title ?? "", order.status, !["cancelled", "draft"].includes(order.status) ? "yes" : "no — excluded", totals.netMinor, totals.taxMinor, totals.grossMinor, context.org.currency];
    }));
  await context.mutate.log(`Procurement spend exported as CSV (${count} orders, cancelled and draft marked as excluded)`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} orders downloaded. Cancelled and draft orders are included as rows but marked as excluded from spend.`);
}

