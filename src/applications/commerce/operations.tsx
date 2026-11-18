import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button, Card, DataGrid, Empty, Field, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { bodyOf, onHandFor, useCommerceData, type OrderBody } from "./data";
import {
  ADJUSTMENT_REASONS, adjustmentProblems, derivedFulfilment, lineProgress, nextShipmentNumber, nextShipmentState,
  REFUND_METHODS, refundableMinor, refundedMinor, refundProblems, refundsOf, returnableQuantity, SHIPMENT_LABEL,
  shipmentProblems, shipmentsOf, stockHistory, type FulfilmentBody, type RefundRecord, type Shipment, type ShipmentState,
} from "./fulfilment";
import "./commerce-operations.css";

/* ====================================================================== *
 * COMMERCE operations: shipments with partial fulfilment, return requests,
 * refund records and stock adjustments with history. Every change is a
 * record in this workspace; no carrier and no payment provider is involved.
 * ====================================================================== */

const stateTone = (state: ShipmentState) => (state === "delivered" ? "success" : state === "shipped" ? "info" : "warning");

/* ---------------- Shipments on an order ---------------- */

export function ShipmentsPanel({ context, order }: { context: ScreenContext; order: Rec }) {
  const data = useCommerceData();
  const progress = lineProgress(order);
  const shipments = shipmentsOf(order);
  const remaining = progress.reduce((sum, row) => sum + row.remaining, 0);
  const paid = String(order.fields.payment) === "paid_local";
  const closed = ["cancelled"].includes(order.status);
  return (
    <Stack gap={4}>
      <Card title="Fulfilment by line" subtitle={remaining > 0 ? `${remaining} unit${remaining === 1 ? "" : "s"} not yet on a shipment` : "Every unit is on a shipment"} flush
        actions={<Button size="sm" variant="primary" disabled={remaining === 0 || closed || !paid}
          onClick={() => context.openOverlay("fulfil lines", { id: order.id })}>Fulfil lines</Button>}>
        <DataGrid rows={progress} rowId={(row) => row.line.id} label="Fulfilment by line" filterable={false}
          columns={[
            { key: "line", header: "Line", primary: true, cell: (row) => row.line.description },
            { key: "ordered", header: "Ordered", align: "end", cell: (row) => <span className="ds-num">{row.ordered}</span> },
            { key: "allocated", header: "On shipments", align: "end", cell: (row) => <span className="ds-num">{row.allocated}</span> },
            { key: "shipped", header: "Shipped", align: "end", cell: (row) => <span className="ds-num">{row.shipped}</span> },
            { key: "remaining", header: "Remaining", align: "end", cell: (row) => row.remaining ? <strong className="ds-num">{row.remaining}</strong> : <span className="ds-subtle">0</span> },
            { key: "stock", header: "Available", align: "end", hideBelow: 700, cell: (row) => row.line.productId
              ? <span className="ds-num">{onHandFor(data.stockMoves, row.line.productId, String(order.fields.warehouseId ?? "") || undefined)}</span>
              : <span className="ds-subtle">Not stocked</span> },
          ]} />
      </Card>
      {!paid && !closed && <Notice tone="warning" title="Awaiting payment">Nothing is picked before payment is recorded on the order, so the physical and financial states cannot drift apart.</Notice>}
      {shipments.length === 0
        ? <Empty title="No shipments yet">Fulfil some or all lines to start a shipment. A balance can follow in a later shipment.</Empty>
        : <div className="t4-shipments" role="list" aria-label="Shipments">
          {shipments.map((shipment) => <ShipmentCard key={shipment.id} context={context} order={order} shipment={shipment} />)}
        </div>}
      <Notice tone="info" title="No carrier is connected">
        A shipment moves from picking to packed to shipped to delivered when a person records it. Tracking is what you type in; nothing is booked with or confirmed by a carrier. Units leave stock when a shipment is marked shipped.
      </Notice>
    </Stack>
  );
}

function ShipmentCard({ context, order, shipment }: { context: ScreenContext; order: Rec; shipment: Shipment }) {
  const lines = bodyOf<OrderBody>(order, {}).lines ?? [];
  const next = nextShipmentState(shipment.state);
  const units = shipment.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <article role="listitem" className="t4-shipment" aria-label={`Shipment ${shipment.number}`}>
      <Row gap={2} wrap>
        <strong className="ds-num ds-grow">{shipment.number}</strong>
        <Pill tone={stateTone(shipment.state)} dot>{SHIPMENT_LABEL[shipment.state]}</Pill>
      </Row>
      <ol className="t4-shipment-steps" aria-label={`${shipment.number} progress`}>
        {(["picking", "packed", "shipped", "delivered"] as ShipmentState[]).map((state) => {
          const done = ["picking", "packed", "shipped", "delivered"].indexOf(state) <= ["picking", "packed", "shipped", "delivered"].indexOf(shipment.state);
          return <li key={state} data-done={done || undefined}>{SHIPMENT_LABEL[state]}</li>;
        })}
      </ol>
      <ul className="t4-shipment-lines">
        {shipment.lines.map((line) => <li key={line.lineId}><span className="ds-num">{line.quantity} ×</span> {lines.find((item) => item.id === line.lineId)?.description ?? line.lineId}</li>)}
      </ul>
      <span className="ds-subtle">{units} unit{units === 1 ? "" : "s"} · {shipment.carrier || "no carrier"}{shipment.tracking ? ` · ${shipment.tracking}` : ""}</span>
      {next && <Button size="sm" variant="secondary" onClick={() => context.openOverlay("advance shipment", { id: order.id, shipmentId: shipment.id })}>
        Mark {SHIPMENT_LABEL[next].toLowerCase()}
      </Button>}
    </article>
  );
}

/* ---------------- Fulfil lines (create a shipment) ---------------- */

export function FulfilLines({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!order) return <Empty title="Loading" />;
  if (order.collection !== "orders") return <Empty title="Select an order" />;
  return <FulfilLinesForm key={order.id} context={context} close={close} order={order} />;
}

function FulfilLinesForm({ context, close, order }: { context: ScreenContext; close: () => void; order: Rec }) {
  const data = useCommerceData();
  const { now, actor } = useWorkspace();
  const progress = lineProgress(order);
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(progress.map((row) => [row.line.id, String(row.remaining)])));
  const [error, setError] = useState("");
  const request = Object.fromEntries(Object.entries(counts).map(([id, value]) => [id, Number(value || 0)]));
  const problems = shipmentProblems(order, request, { paid: String(order.fields.payment) === "paid_local" });
  const warehouseId = String(order.fields.warehouseId ?? "");
  const short = progress.filter((row) => row.line.productId && (request[row.line.id] ?? 0) > onHandFor(data.stockMoves, row.line.productId, warehouseId || undefined));
  return (
    <form id="fulfil-lines" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (problems.length) { setError(problems[0]); return; }
      const body = bodyOf<FulfilmentBody>(order, {});
      const shipment: Shipment = {
        id: `sh-${now.getTime().toString(36)}`,
        number: nextShipmentNumber(order),
        state: "picking",
        lines: Object.entries(request).filter(([, quantity]) => quantity > 0).map(([lineId, quantity]) => ({ lineId, quantity })),
        carrier: String(order.fields.carrier ?? ""),
        tracking: "",
        createdAt: now.toISOString(),
        createdBy: actor,
      };
      const units = shipment.lines.reduce((sum, line) => sum + line.quantity, 0);
      const nextOrder = { ...order, body: { ...body, shipments: [...(body.shipments ?? []), shipment] } };
      const derived = derivedFulfilment(nextOrder);
      const partial = lineProgress(nextOrder).some((row) => row.remaining > 0);
      const saved = await context.mutate.patch(order.id, {
        status: derived.status,
        fields: { ...order.fields, fulfilment: derived.fulfilment },
        body: { ...nextOrder.body, timeline: [...(body.timeline ?? []), { at: now.toISOString(), label: `Shipment ${shipment.number} started`, detail: `${units} unit${units === 1 ? "" : "s"} to pick${partial ? "; a balance remains for a later shipment" : ""}.` }] },
      }, { expectRevision: order.revision, event: `${shipment.number} started for ${order.title}: ${units} units` });
      if (!saved) { setError("The order changed elsewhere. Reopen it and try again."); return; }
      context.toast("Shipment started", `${shipment.number} holds ${units} unit${units === 1 ? "" : "s"}${partial ? ". The rest of the order stays open." : "."}`);
      close();
    }}>
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Shipment", value: <span className="ds-num">{nextShipmentNumber(order)}</span> },
        { label: "Ship from", value: data.warehouses.find((item) => item.id === warehouseId)?.title ?? "Not set" },
      ]} />
      <DataGrid rows={progress} rowId={(row) => row.line.id} label="Units to put on this shipment" filterable={false}
        columns={[
          { key: "line", header: "Line", primary: true, cell: (row) => row.line.description },
          { key: "remaining", header: "Remaining", align: "end", cell: (row) => <span className="ds-num">{row.remaining}</span> },
          { key: "qty", header: "This shipment", align: "end", cell: (row) => (
            <TextInput aria-label={`Units of ${row.line.description} on this shipment`} inputMode="numeric" align="end" style={{ maxWidth: 90 }}
              value={counts[row.line.id] ?? "0"} disabled={row.remaining === 0}
              invalid={(request[row.line.id] ?? 0) > row.remaining}
              onChange={(event) => { setCounts((current) => ({ ...current, [row.line.id]: event.target.value })); setError(""); }} />
          ) },
        ]} />
      {short.length > 0 && (
        <Notice tone="warning" title="Less on hand than you are picking">
          {short.map((row) => row.line.description).join(", ")} {short.length === 1 ? "has" : "have"} fewer units at this location than requested. Pick what is there and leave the balance for a later shipment.
        </Notice>
      )}
      {error && <p role="alert" className="ds-field-error">{error}</p>}
    </form>
  );
}

/* ---------------- Advance a shipment ---------------- */

export function AdvanceShipment({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; shipmentId?: string } | undefined;
  const order = useRecord(payload?.id ?? context.params.id);
  const shipment = shipmentsOf(order).find((item) => item.id === payload?.shipmentId);
  if (!order) return <Empty title="Loading" />;
  if (!shipment) return <Empty title="Shipment not found">No other shipment was substituted.</Empty>;
  return <AdvanceShipmentForm key={shipment.id + shipment.state} context={context} close={close} order={order} shipment={shipment} />;
}

function AdvanceShipmentForm({ context, close, order, shipment }: { context: ScreenContext; close: () => void; order: Rec; shipment: Shipment }) {
  const { now, actor } = useWorkspace();
  const next = nextShipmentState(shipment.state);
  const [carrier, setCarrier] = useState(shipment.carrier || "Royal Mail");
  const [tracking, setTracking] = useState(shipment.tracking);
  const [error, setError] = useState("");
  const lines = bodyOf<OrderBody>(order, {}).lines ?? [];
  if (!next) return <Empty title="Already delivered" />;
  return (
    <form id="advance-shipment" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (next === "shipped" && !carrier) { setError("Choose the carrier that collected it."); return; }
      const body = bodyOf<FulfilmentBody>(order, {});
      const stamp = now.toISOString();
      const reference = next === "shipped" ? (tracking.trim() || `LOCAL-${shipment.number.replace(/[^A-Z0-9]/gi, "")}`) : shipment.tracking;
      const updated: Shipment = {
        ...shipment, state: next, carrier: next === "shipped" ? carrier : shipment.carrier, tracking: reference,
        ...(next === "packed" ? { packedAt: stamp } : next === "shipped" ? { shippedAt: stamp } : { deliveredAt: stamp }),
      };
      const shipments = (body.shipments ?? []).map((item) => (item.id === shipment.id ? updated : item));
      const nextOrder = { ...order, body: { ...body, shipments } };
      const derived = derivedFulfilment(nextOrder);
      const detail = next === "shipped"
        ? `${carrier} · ${tracking.trim() ? `tracking ${reference} entered by ${actor}` : `local reference ${reference}`}. No carrier API confirmed this.`
        : next === "delivered" ? `Recorded as delivered by ${actor}.` : `Packed by ${actor}.`;
      const saved = await context.mutate.patch(order.id, {
        status: derived.status,
        fields: { ...order.fields, fulfilment: derived.fulfilment, carrier: next === "shipped" ? carrier : order.fields.carrier, tracking: next === "shipped" && !String(order.fields.tracking ?? "") ? reference : order.fields.tracking },
        body: { ...nextOrder.body, timeline: [...(body.timeline ?? []), { at: stamp, label: `${shipment.number} ${SHIPMENT_LABEL[next].toLowerCase()}`, detail }] },
      }, { expectRevision: order.revision, event: `${shipment.number} marked ${next}` });
      if (!saved) { setError("The order changed elsewhere. Reopen it and try again."); return; }
      if (next === "shipped") {
        for (const line of shipment.lines) {
          const orderLine = lines.find((item) => item.id === line.lineId);
          if (!orderLine?.productId) continue;
          await context.mutate.create({
            collection: "stockMoves", title: `sale · ${order.title}`, status: "posted", at: stamp,
            summary: `${orderLine.description} shipped on ${shipment.number}.`,
            fields: { productId: orderLine.productId, warehouseId: String(order.fields.warehouseId ?? ""), quantity: -line.quantity, kind: "sale", reference: order.title, shipmentId: shipment.id },
          }, `${line.quantity} × ${orderLine.description} left stock on ${shipment.number}`);
        }
      }
      context.toast(`${shipment.number} ${SHIPMENT_LABEL[next].toLowerCase()}`, next === "shipped" ? "Stock left with the shipment. Nothing was booked with a carrier." : "Recorded on the order.");
      close();
    }}>
      <Properties rows={[
        { label: "Shipment", value: <span className="ds-num">{shipment.number}</span> },
        { label: "Now", value: <Pill tone={stateTone(shipment.state)}>{SHIPMENT_LABEL[shipment.state]}</Pill> },
        { label: "Next", value: <Pill tone={stateTone(next)}>{SHIPMENT_LABEL[next]}</Pill> },
        { label: "Units", value: <span className="ds-num">{shipment.lines.reduce((sum, line) => sum + line.quantity, 0)}</span> },
      ]} />
      {next === "shipped" && (
        <>
          <Field label="Carrier" required>
            <Select value={carrier} onChange={(event) => setCarrier(event.target.value)}>
              {["Royal Mail", "Evri Business", "Pallet North", "Collection"].map((item) => <option key={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label="Tracking number" hint="Typed from the carrier's receipt. Leave empty to record a local reference instead.">
            <TextInput value={tracking} onChange={(event) => setTracking(event.target.value)} />
          </Field>
          <Notice tone="warning" title="Stock leaves when you confirm">
            Each catalogue line on this shipment writes a sale movement from the order's location. No label is bought and no collection is booked.
          </Notice>
        </>
      )}
      {error && <p role="alert" className="ds-field-error">{error}</p>}
    </form>
  );
}

/* ---------------- Raise a return ---------------- */

export function RaiseReturn({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const data = useCommerceData();
  const routed = useRecord(payload?.id ?? context.params.id);
  const eligibleOrders = data.orders.filter((order) => (bodyOf<OrderBody>(order, {}).lines ?? []).some((line) => returnableQuantity(order, line.id, data.returns) > 0));
  const [orderId, setOrderId] = useState(routed?.collection === "orders" ? routed.id : "");
  const order = data.orders.find((item) => item.id === (orderId || eligibleOrders[0]?.id));
  if (data.orders.length === 0) return <Empty title="Loading" />;
  return (
    <Stack gap={4}>
      {!routed && (
        <Field label="Order">
          <Select value={order?.id ?? ""} onChange={(event) => setOrderId(event.target.value)}>
            {eligibleOrders.length === 0 && <option value="">No shipped order has units left to return</option>}
            {eligibleOrders.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.summary}</option>)}
          </Select>
        </Field>
      )}
      {order ? <RaiseReturnForm key={order.id} context={context} close={close} order={order} returns={data.returns} /> : <Empty title="Nothing to return">Only units that have shipped can be returned.</Empty>}
    </Stack>
  );
}

const RETURN_REASONS = [
  { value: "damaged", label: "Arrived damaged" },
  { value: "wrong_finish", label: "Wrong finish or variant" },
  { value: "changed_mind", label: "Changed their mind" },
  { value: "not_received", label: "Not received" },
  { value: "faulty", label: "Faulty in use" },
];

function RaiseReturnForm({ context, close, order, returns }: { context: ScreenContext; close: () => void; order: Rec; returns: Rec[] }) {
  const { now, actor } = useWorkspace();
  const lines = (bodyOf<OrderBody>(order, {}).lines ?? []).filter((line) => returnableQuantity(order, line.id, returns) > 0);
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const line = lines.find((item) => item.id === lineId);
  const max = line ? returnableQuantity(order, line.id, returns) : 0;
  const count = Number(quantity);
  const valueMinor = line ? Math.round(line.unitPriceMinor * (1 - (line.discountBp ?? 0) / 10_000)) * (Number.isInteger(count) ? count : 0) : 0;
  if (lines.length === 0) return <Empty title="Nothing on this order can be returned">Only shipped units, less earlier returns, can be returned.</Empty>;
  return (
    <form id="raise-return" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      const problem = !line ? "Choose a line." : !Number.isInteger(count) || count <= 0 ? "Enter a whole number of units." : count > max ? `Only ${max} can be returned.` : !reason ? "Choose a reason." : "";
      if (problem) { setError(problem); return; }
      const number = `RET-${23 + returns.length}`;
      await context.mutate.create({
        collection: "returns", title: number, status: "requested", amountMinor: valueMinor, at: now.toISOString(),
        summary: `${count} × ${line!.description} on ${order.title}: ${RETURN_REASONS.find((item) => item.value === reason)?.label.toLowerCase()}.`,
        parentId: String(order.fields.contactId ?? "") || undefined,
        fields: { orderId: order.id, lineId: line!.id, productId: line!.productId ?? "", contactId: String(order.fields.contactId ?? ""), reason, quantity: count, restock: false, refundState: "not_refunded", photos: 0, raisedBy: actor },
        body: { note: note.trim(), refunds: [] },
      }, `Return ${number} raised on ${order.title}`);
      context.toast("Return raised", `${number} is waiting for review. No refund has been recorded.`);
      close();
    }}>
      <Field label="Line" required>
        <Select value={lineId} onChange={(event) => { setLineId(event.target.value); setError(""); }}>
          {lines.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
        </Select>
      </Field>
      <Field label="Units" required hint={`${max} shipped and not yet returned`}>
        <TextInput inputMode="numeric" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(""); }} />
      </Field>
      <Field label="Reason" required>
        <Select value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }}>
          <option value="">Choose a reason</option>
          {RETURN_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="What the customer said"><TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Properties rows={[{ label: "Value at the line price", value: <span className="ds-num">{context.money(valueMinor)}</span> }]} />
      {error && <p role="alert" className="ds-field-error">{error}</p>}
    </form>
  );
}

/* ---------------- Record a refund ---------------- */

export function RecordRefund({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = useRecord(payload?.id ?? context.selectedId);
  if (!item) return <Empty title="Select a return" />;
  if (item.collection !== "returns") return <Empty title="Select a return" />;
  return <RecordRefundForm key={item.id} context={context} close={close} item={item} />;
}

function RecordRefundForm({ context, close, item }: { context: ScreenContext; close: () => void; item: Rec }) {
  const { now, actor, org } = useWorkspace();
  const remaining = refundableMinor(item);
  const [amount, setAmount] = useState<number>(remaining);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const problems = refundProblems(item, amount, method, reference);
  return (
    <form id="record-refund" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (problems.length) { setError(problems[0]); return; }
      const refund: RefundRecord = { id: `rf-${now.getTime().toString(36)}`, amountMinor: amount, method: method as RefundRecord["method"], reference: reference.trim(), note: note.trim(), at: now.toISOString(), by: actor };
      const refunds = [...refundsOf(item), refund];
      const total = refunds.reduce((sum, entry) => sum + entry.amountMinor, 0);
      const full = total >= (item.amountMinor ?? 0);
      const body = (item.body ?? {}) as Record<string, unknown>;
      await context.mutate.patch(item.id, {
        status: full ? "completed" : item.status === "in_review" ? "approved" : item.status,
        fields: { ...item.fields, refundState: full ? (method === "credit_note" ? "credit_note_local" : "refund_recorded") : "partly_refunded", refundedMinor: total, authorisedBy: actor },
        body: { ...body, refunds },
      }, { expectRevision: item.revision, event: `${context.money(amount)} refund recorded on ${item.title} (${REFUND_METHODS.find((entry) => entry.value === method)?.label})` });
      context.toast("Refund recorded", `${context.money(amount)} is recorded on ${item.title}${full ? ", which is now settled" : `; ${context.money((item.amountMinor ?? 0) - total)} remains`}. No money moved from Arlovi.`);
      close();
    }}>
      <Properties rows={[
        { label: "Return", value: item.title },
        { label: "Value", value: <span className="ds-num">{context.money(item.amountMinor)}</span> },
        { label: "Already refunded", value: <span className="ds-num">{context.money(refundedMinor(item))}</span> },
        { label: "Left to refund", value: <strong className="ds-num">{context.money(remaining)}</strong> },
      ]} />
      <Notice tone="warning" title="No payment provider is connected">
        Arlovi cannot send money. Make the refund in your bank, card terminal or ledger first, then record it here with its reference so the return, the order and the books agree.
      </Notice>
      <Field label="Amount refunded" required><MoneyInput valueMinor={amount} onChangeMinor={(value) => { setAmount(value); setError(""); }} currency={org.currency} label="Amount refunded" /></Field>
      <Field label="How it was refunded" required>
        <Select value={method} onChange={(event) => { setMethod(event.target.value); setError(""); }}>
          <option value="">Choose a method</option>
          {REFUND_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </Select>
      </Field>
      <Field label="Reference" hint="Bank reference, terminal receipt or credit note number"><TextInput value={reference} onChange={(event) => { setReference(event.target.value); setError(""); }} /></Field>
      <Field label="Note"><TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      {(error || (problems.length > 0 && item.tags.includes("disputed"))) && <p role="alert" className="ds-field-error">{error || problems[0]}</p>}
    </form>
  );
}

export function RefundHistory({ context, item }: { context: ScreenContext; item: Rec }) {
  const refunds = refundsOf(item);
  if (refunds.length === 0) return <p className="ds-subtle">No refund recorded on {item.title}.</p>;
  return (
    <DataGrid rows={refunds} rowId={(row) => row.id} label={`Refunds on ${item.title}`} filterable={false}
      columns={[
        { key: "at", header: "Recorded", primary: true, cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
        { key: "method", header: "Method", cell: (row) => REFUND_METHODS.find((entry) => entry.value === row.method)?.label ?? row.method },
        { key: "ref", header: "Reference", cell: (row) => row.reference || "—", hideBelow: 700 },
        { key: "by", header: "By", cell: (row) => row.by, hideBelow: 900 },
      ]} />
  );
}

/* ---------------- Stock adjustment with reasons ---------------- */

export function StockAdjustmentForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now, actor } = useWorkspace();
  const payload = context.overlayPayload as { productId?: string; warehouseId?: string } | undefined;
  const selected = (context.selectedId ?? "").match(/^(.*)-((?:[a-z]+-)?warehouses-\d+)$/);
  const [productId, setProductId] = useState(payload?.productId ?? selected?.[1] ?? data.products[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(payload?.warehouseId ?? selected?.[2] ?? data.warehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("count");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const product = data.products.find((item) => item.id === productId);
  const onHand = onHandFor(data.stockMoves, productId, warehouseId);
  const delta = Number(quantity);
  const problems = adjustmentProblems({ productId, delta, onHand, reason, note });
  const reasonInfo = ADJUSTMENT_REASONS.find((item) => item.value === reason);
  return (
    <form id="stock-adjustment" className="ds-stack ds-gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (problems.length) { setError(problems[0]); return; }
      const reference = `ADJ-${now.getTime().toString().slice(-5)}`;
      await context.mutate.create({
        collection: "stockMoves", title: `${reasonInfo?.label ?? reason} · ${String(product?.fields.sku ?? "")}`, status: "posted", at: now.toISOString(),
        summary: note.trim() || `Adjusted by ${delta} at ${data.warehouses.find((warehouse) => warehouse.id === warehouseId)?.title ?? warehouseId}.`,
        fields: { productId, warehouseId, quantity: delta, kind: reason, reference, reason, note: note.trim(), by: actor },
      }, `Stock adjusted for ${product?.title} by ${delta}: ${reasonInfo?.label ?? reason}`);
      context.toast("Stock adjusted", `${product?.title} is now ${onHand + delta} at that location. ${reference} records who, why and when.`);
      close();
    }}>
      <Field label="Product"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Location"><Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Adjustment" required hint={`${onHand} on hand now${Number.isInteger(delta) && delta ? `; this movement would make it ${onHand + delta}` : ". Use a minus sign to take stock out."}`}
        error={Number.isInteger(delta) && onHand + delta < 0 ? "That would take the location below zero" : undefined}>
        <TextInput value={quantity} inputMode="numeric" align="end" placeholder="e.g. -2" invalid={Number.isInteger(delta) && onHand + delta < 0} onChange={(event) => { setQuantity(event.target.value); setError(""); }} />
      </Field>
      <Field label="Reason" required>
        <Select value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }}>
          {ADJUSTMENT_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Note" required={reasonInfo?.needsNote} hint={reasonInfo?.needsNote ? "This reason needs a note" : "Optional"}>
        <TextArea rows={2} value={note} onChange={(event) => { setNote(event.target.value); setError(""); }} />
      </Field>
      <Notice tone="info" title="The level is never edited directly">
        Stock is the sum of its movements, so every change leaves a row with a reason, a note and the person who made it.
      </Notice>
      {error && <p role="alert" className="ds-field-error">{error}</p>}
    </form>
  );
}

/* ---------------- Stock history ---------------- */

export function StockHistory({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { productId?: string; warehouseId?: string } | undefined;
  const selected = (context.selectedId ?? "").match(/^(.*)-((?:[a-z]+-)?warehouses-\d+)$/);
  const [productId, setProductId] = useState(payload?.productId ?? selected?.[1] ?? data.products[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(payload?.warehouseId ?? selected?.[2] ?? "");
  const [kind, setKind] = useState("");
  const history = stockHistory(data.stockMoves, productId, warehouseId || undefined);
  const kinds = [...new Set(history.map((row) => String(row.move.fields.kind ?? "move")))].sort();
  const shown = [...history].reverse().filter((row) => !kind || String(row.move.fields.kind ?? "move") === kind);
  const product = data.products.find((item) => item.id === productId);
  return (
    <Stack gap={4}>
      <div className="t4-history-filters">
        <Field label="Product"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="Location"><Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
          <option value="">Every location</option>
          {data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select></Field>
        <Field label="Movement"><Select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">All movements</option>
          {kinds.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
        </Select></Field>
      </div>
      <Properties rows={[
        { label: "On hand now", value: <strong className="ds-num">{history.at(-1)?.balance ?? 0}</strong> },
        { label: "Movements", value: <span className="ds-num">{history.length}</span> },
        { label: "Product", value: product ? <Link to={`/o/${org.slug}/commerce/products/${product.id}`}>{product.title}</Link> : "—" },
      ]} />
      {shown.length === 0 ? <Empty title="No movements match">Every change to stock appears here as a row with its reason.</Empty> : (
        <DataGrid rows={shown} rowId={(row) => row.move.id} label="Stock history" filterable={false}
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.move.at ?? row.move.createdAt)}</span> },
            { key: "kind", header: "Movement", cell: (row) => <Pill tone={row.quantity < 0 ? "warning" : "success"}>{String(row.move.fields.kind ?? "move").replace(/_/g, " ")}</Pill> },
            { key: "qty", header: "Change", align: "end", cell: (row) => <span className="ds-num">{row.quantity > 0 ? "+" : ""}{row.quantity}</span> },
            { key: "balance", header: "Balance", align: "end", cell: (row) => <strong className="ds-num">{row.balance}</strong> },
            { key: "why", header: "Why", cell: (row) => String(row.move.fields.note || row.move.summary || row.move.fields.reference || "—"), hideBelow: 700 },
            { key: "by", header: "By", cell: (row) => String(row.move.fields.by || row.move.createdBy || "—"), hideBelow: 1000 },
          ]} />
      )}
      {!warehouseId && <p className="ds-subtle">Balances are across every location. Choose a location to see its own running balance.</p>}
    </Stack>
  );
}
