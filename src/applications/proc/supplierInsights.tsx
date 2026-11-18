import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card, DataGrid, Empty, Field, Notice, Pill, Properties, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import { newRecord, revisedRecord } from "@/platform/repo";
import type { Rec } from "@/domain/types";
import { bodyOf, useProcData, type PoBody } from "./data";
import {
  freshReturnId, RETURN_REASONS, returnReasonLabel, returnableUnits, supplierPerformance, suppliedItems,
  type ReceiptBodyWithReturns, type ReceiptReturn,
} from "./performance";

/* ====================================================================== *
 * Supplier performance and the inventory behind each goods receipt.
 * Every figure is measured from recorded orders, receipts and invoices.
 * ====================================================================== */

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

export function SupplierPerformanceCard({ context, supplier }: { context: ScreenContext; supplier: Rec }) {
  const data = useProcData();
  const { now } = useWorkspace();
  const perf = supplierPerformance(supplier.id, data, now);
  const late = perf.deliveries.filter((row) => row.onTime === false);
  const scored = perf.deliveries.filter((row) => row.onTime !== null);
  const stated = supplier.fields.onTimeRatePct;
  return (
    <Card span={12} eyebrow="PERFORMANCE" prov="posted" title="Delivery performance"
      subtitle={`Measured from ${perf.deliveries.length} goods receipt${perf.deliveries.length === 1 ? "" : "s"} against ${perf.ordersPlaced} committed order${perf.ordersPlaced === 1 ? "" : "s"} worth ${context.money(perf.committedNetMinor)} net (drafts and cancellations excluded)`}>
      <Stack gap={3}>
        <StatRow>
          <Stat label="On time" value={pct(perf.onTimePct)} prov="posted"
            meta={scored.length ? `${scored.length - late.length} of ${scored.length} receipts by the promised date` : perf.deliveries.length ? "No promised dates to measure against" : "Nothing received yet"} />
          <Stat label="Quality accepted" value={pct(perf.qualityPct)} prov="posted"
            meta={perf.unitsReceived ? `${perf.unitsReturned} returned, ${perf.unitsDamaged} flagged of ${perf.unitsReceived} units` : "No units received"} />
          <Stat label="Price variance" value={perf.billedLines ? context.money(perf.priceVarianceMinor) : "—"} prov="posted"
            meta={perf.billedLines ? `${perf.priceVariancePct ?? 0}% against ordered prices on ${perf.billedLines} billed line${perf.billedLines === 1 ? "" : "s"}` : "No invoice matched to an order"} />
        </StatRow>
        {perf.overdueOrders.length > 0 && (
          <Notice tone="warning" title={`${perf.overdueOrders.length} order${perf.overdueOrders.length === 1 ? " is" : "s are"} past the promised date`}>
            {perf.overdueOrders.map((order) => `${order.title}: ${order.outstanding} units outstanding, ${order.daysOverdue} day${order.daysOverdue === 1 ? "" : "s"} late`).join("; ")}. These count against the supplier once they arrive.
          </Notice>
        )}
        {late.length > 0 && (
          <Notice tone="warning" title={`${late.length} receipt${late.length === 1 ? "" : "s"} arrived late`}>
            The longest was {Math.max(...late.map((row) => row.lateDays))} days after the promised date.
          </Notice>
        )}
        {stated !== undefined && stated !== "" && perf.onTimePct !== null && Number(stated) !== perf.onTimePct && (
          <p className="ds-subtle">The supplier record states {String(stated)}% on time; the measured figure above is what the receipts show.</p>
        )}
        {perf.deliveries.length > 0 && (
          <DataGrid rows={perf.deliveries} rowId={(row) => row.receiptId} label="Deliveries measured" filterable={false}
            columns={[
              { key: "receipt", header: "Receipt", primary: true, cell: (row) => <span className="ds-num">{row.receipt}</span> },
              { key: "order", header: "Order", cell: (row) => <span className="ds-num">{row.order}</span> },
              { key: "promised", header: "Promised", cell: (row) => <span className="ds-num">{row.promisedAt ? context.date(row.promisedAt) : "Not set"}</span>, hideBelow: 700 },
              { key: "received", header: "Received", cell: (row) => <span className="ds-num">{context.date(row.receivedAt)}</span>, sortValue: (row) => row.receivedAt },
              { key: "late", header: "Result", cell: (row) => row.onTime === null ? <Pill>No promised date</Pill> : row.onTime ? <Pill tone="success">On time</Pill> : <Pill tone="warning">{row.lateDays}d late</Pill> },
            ]} />
        )}
        {perf.variances.length > 0 && (
          <DataGrid rows={perf.variances} rowId={(row) => `${row.billId}:${row.description}`} label="Price variances" filterable={false}
            columns={[
              { key: "bill", header: "Invoice", primary: true, cell: (row) => <span className="ds-num">{row.bill}</span> },
              { key: "item", header: "Item", cell: (row) => row.description },
              { key: "ordered", header: "Ordered at", align: "end", cell: (row) => <span className="ds-num">{context.money(row.orderedPriceMinor)}</span> },
              { key: "billed", header: "Billed at", align: "end", cell: (row) => <span className="ds-num">{context.money(row.billedPriceMinor)}</span> },
              { key: "variance", header: "Variance", align: "end", cell: (row) => <strong className="ds-num">{row.varianceMinor > 0 ? "+" : ""}{context.money(row.varianceMinor)}</strong> },
            ]} />
        )}
        {perf.returns.length > 0 && (
          <DataGrid rows={perf.returns} rowId={(row) => row.id} label="Quality returns" filterable={false}
            columns={[
              { key: "receipt", header: "Receipt", primary: true, cell: (row) => <span className="ds-num">{row.receipt}</span> },
              { key: "item", header: "Item", cell: (row) => row.description },
              { key: "qty", header: "Returned", align: "end", cell: (row) => <span className="ds-num">{row.quantity}</span> },
              { key: "reason", header: "Reason", cell: (row) => returnReasonLabel(row.reason), hideBelow: 700 },
              { key: "at", header: "Recorded", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, hideBelow: 900 },
            ]} />
        )}
      </Stack>
    </Card>
  );
}

export function SuppliedItemsCard({ context, supplier }: { context: ScreenContext; supplier: Rec }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const items = suppliedItems(supplier.id, data);
  return (
    <Card span={12} eyebrow="INVENTORY" prov="posted" title="Catalogue items from this supplier"
      subtitle="Ordered, received and returned per item, with stock on hand from posted movements" flush>
      {items.length === 0
        ? <div className="ds-card-body"><Empty title="No catalogue item ordered">Order lines without a catalogue product move no stock, so nothing is tracked here yet.</Empty></div>
        : <DataGrid rows={items} rowId={(row) => row.productId} label="Supplied items" filterable={false}
          columns={[
            { key: "item", header: "Item", primary: true, cell: (row) => {
              const product = data.products.find((item) => item.id === row.productId);
              return product ? <Link to={`/o/${org.slug}/commerce/products/${product.id}`}>{product.title}</Link> : <span>{row.description}</span>;
            } },
            { key: "line", header: "Ordered as", cell: (row) => row.description, hideBelow: 900 },
            { key: "ordered", header: "Ordered", align: "end", cell: (row) => <span className="ds-num">{row.ordered}</span> },
            { key: "received", header: "Received", align: "end", cell: (row) => <span className="ds-num">{row.received}</span> },
            { key: "returned", header: "Returned", align: "end", cell: (row) => <span className="ds-num">{row.returned}</span> },
            { key: "onhand", header: "On hand now", align: "end", cell: (row) => <span className="ds-num">{row.onHand}</span> },
            { key: "last", header: "Last received", cell: (row) => <span className="ds-num">{row.lastReceivedAt ? context.date(row.lastReceivedAt) : "Not yet"}</span>, hideBelow: 700 },
            { key: "orders", header: "Orders", cell: (row) => <span className="ds-num">{row.orders.join(", ")}</span>, hideBelow: 1100 },
          ]} />}
    </Card>
  );
}

/** Stock movements written by a receipt (and by returns from it), with links to the product and the movement log. */
export function ReceiptStockLinks({ context, receipt }: { context: ScreenContext; receipt: Rec }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const order = data.purchaseOrders.find((item) => item.id === String(receipt.fields.purchaseOrderId));
  const moves = data.stockMoves.filter((move) =>
    String(move.fields.receiptId ?? "") === receipt.id
    || (order && String(move.fields.reference ?? "") === order.title && ["receipt", "return_to_supplier"].includes(String(move.fields.kind))));
  const returns = bodyOf<ReceiptBodyWithReturns>(receipt, {}).returns ?? [];
  return (
    <Stack gap={3}>
      <Card eyebrow="STOCK" prov="posted" title="Inventory this receipt moved" subtitle={order ? `Movements referencing ${order.title}` : "No order linked"} flush>
        {moves.length === 0
          ? <div className="ds-card-body"><p className="ds-subtle">No stock moved. Lines without a catalogue product are received for the record only.</p></div>
          : <DataGrid rows={moves} rowId={(row) => row.id} label="Stock movements from this receipt" filterable={false}
            columns={[
              { key: "product", header: "Product", primary: true, cell: (row) => {
                const product = data.products.find((item) => item.id === String(row.fields.productId));
                return product ? <Link to={`/o/${org.slug}/commerce/products/${product.id}`}>{product.title}</Link> : String(row.fields.productId);
              } },
              { key: "kind", header: "Movement", cell: (row) => <Pill tone={Number(row.fields.quantity) < 0 ? "warning" : "success"}>{String(row.fields.kind).replace(/_/g, " ")}</Pill> },
              { key: "qty", header: "Quantity", align: "end", cell: (row) => <span className="ds-num">{Number(row.fields.quantity) > 0 ? "+" : ""}{String(row.fields.quantity)}</span> },
              { key: "site", header: "Site", cell: (row) => data.warehouses.find((item) => item.id === String(row.fields.warehouseId))?.title ?? "—", hideBelow: 700 },
            ]} />}
        <div className="ds-card-body"><Link to={`/o/${org.slug}/proc/movements`}>Open the stock movement log</Link></div>
      </Card>
      {returns.length > 0 && (
        <Card eyebrow="RETURNS" prov="human" title="Returned to the supplier" subtitle={`${returns.reduce((sum, row) => sum + row.quantity, 0)} units sent back`} flush>
          <DataGrid rows={returns} rowId={(row) => row.id} label="Returns from this receipt" filterable={false}
            columns={[
              { key: "item", header: "Item", primary: true, cell: (row) => row.description },
              { key: "qty", header: "Units", align: "end", cell: (row) => <span className="ds-num">{row.quantity}</span> },
              { key: "reason", header: "Reason", cell: (row) => returnReasonLabel(row.reason) },
              { key: "by", header: "Recorded by", cell: (row) => `${row.by} · ${context.date(row.at)}`, hideBelow: 700 },
            ]} />
        </Card>
      )}
    </Stack>
  );
}

/* ---------------- Quality return overlay ---------------- */

export function QualityReturn({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const receipt = useRecord(payload?.id ?? context.selectedId);
  if (!receipt) return <Empty title="Loading" />;
  if (receipt.collection !== "receipts" || receipt.status === "expected") {
    return <Empty title="Select a received delivery">A return is recorded against goods that have actually arrived.</Empty>;
  }
  return <QualityReturnForm key={receipt.id} context={context} close={close} receipt={receipt} />;
}

function QualityReturnForm({ context, close, receipt }: { context: ScreenContext; close: () => void; receipt: Rec }) {
  const data = useProcData();
  const { now, actor, org } = useWorkspace();
  const lines = bodyOf<ReceiptBodyWithReturns>(receipt, {}).lines ?? [];
  const order = data.purchaseOrders.find((item) => item.id === String(receipt.fields.purchaseOrderId));
  const earlier = data.receipts.filter((other) => other.id !== receipt.id && other.status !== "expected"
    && String(other.fields.purchaseOrderId) === String(receipt.fields.purchaseOrderId) && (other.at ?? "") < (receipt.at ?? ""));
  const [lineId, setLineId] = useState(lines[0]?.lineId ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const line = lines.find((item) => item.lineId === lineId);
  const available = line ? returnableUnits(receipt, line.lineId, earlier) : 0;
  const productId = (bodyOf<PoBody>(order, {}).lines ?? []).find((item) => item.id === lineId)?.productId;
  const count = Number(quantity);
  const problems = [
    !line ? "Choose the line being returned." : "",
    !Number.isInteger(count) || count <= 0 ? "Enter a whole number of units." : count > available ? `Only ${available} unit${available === 1 ? "" : "s"} from this receipt can still be returned.` : "",
    !reason ? "Choose a reason." : "",
  ].filter(Boolean);

  return (
    <form id="quality-return" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (problems.length || !line) { setError(problems[0] ?? ""); return; }
      const body = bodyOf<ReceiptBodyWithReturns>(receipt, {});
      const entry: ReceiptReturn = { id: freshReturnId((body.returns ?? []).map((item) => item.id)), lineId: line.lineId, description: line.description, productId, quantity: count, reason, note: note.trim(), at: now.toISOString(), by: actor };
      const stamp = clockIso();
      const revised = revisedRecord(receipt, {
        fields: { ...receipt.fields, discrepancy: String(receipt.fields.discrepancy) === "none" ? "returned" : receipt.fields.discrepancy },
        body: { ...body, returns: [...(body.returns ?? []), entry] },
      }, { actor, now: stamp });
      const move = productId ? newRecord({
        organizationId: org.id, currency: org.currency,
        collection: "stockMoves", title: `return to supplier · ${line.description}`, status: "posted", at: now.toISOString(),
        summary: `Returned from ${receipt.title}: ${returnReasonLabel(reason)}.`,
        fields: { productId, warehouseId: String(receipt.fields.warehouseId ?? ""), quantity: -count, kind: "return_to_supplier", reference: order?.title ?? receipt.title, receiptId: receipt.id, returnId: entry.id },
      }, { actor, now: stamp }) : undefined;
      // The receipt's return entry and its stock movement commit together,
      // guarded by the receipt's revision. A conflict writes neither, so a
      // retry can never take the same units out of stock twice.
      try {
        await context.mutate.putMany(
          move ? [revised, move] : [revised],
          [`${count} × ${line.description} returned to supplier from ${receipt.title}: ${returnReasonLabel(reason)}`, ...(move ? [`Stock reduced by ${count} for a return from ${receipt.title}`] : [])],
          { [receipt.id]: receipt.revision },
          move ? ["update", "create"] : ["update"],
        );
      } catch (failure) {
        setError(failure instanceof Error && failure.name !== "ConflictError"
          ? failure.message
          : "The receipt changed elsewhere, so nothing was recorded. Reopen it and record the return again.");
        return;
      }
      context.toast("Return recorded", `${count} × ${line.description} recorded as returned${productId ? " and taken out of stock" : ""}. Nothing has been sent to the supplier from here.`);
      close();
    }}>
      <Properties rows={[
        { label: "Receipt", value: <span className="ds-num">{receipt.title}</span> },
        { label: "Against", value: order?.title ?? "—" },
        { label: "Supplier", value: data.suppliers.find((item) => item.id === String(receipt.fields.supplierId))?.title ?? "—" },
      ]} />
      <Field label="Line" required>
        <Select value={lineId} onChange={(event) => { setLineId(event.target.value); setError(""); }}>
          {lines.map((item) => <option key={item.lineId} value={item.lineId}>{item.description}</option>)}
        </Select>
      </Field>
      <Field label="Units returned" required hint={line ? `${available} from this receipt can be returned` : undefined}>
        <TextInput inputMode="numeric" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(""); }} />
      </Field>
      <Field label="Reason" required>
        <Select value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }}>
          <option value="">Choose a reason</option>
          {RETURN_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Note for the supplier conversation">
        <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Notice tone={productId ? "info" : "neutral"} title={productId ? "Stock is reduced" : "No stock movement"}>
        {productId
          ? "This line is a catalogue product, so the returned units are taken out of the receiving site with a return-to-supplier movement."
          : "This line has no catalogue product, so the return is recorded on the receipt only."}{" "}
        The return counts against the supplier's quality rate. No message, credit note or refund is sent from here.
      </Notice>
      {error && <p role="alert" className="ds-field-error">{error}</p>}
    </form>
  );
}
