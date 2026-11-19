import { Button, FactGrid, MoneyInput, Notice, OverlayActions, Pill, Select, TextInput } from "@/design-system";
import type { InvoiceTotals, TaxCategory } from "@/platform/money";
import type { Rec } from "@/domain/types";
import { bodyOf, isPurchaseOrder, type PoBody, type PoLine } from "./data";
import { purchaseTrail, type StepState } from "./lifecycle";
import { useWorkspace } from "@/platform/workspace";
import type { ScreenContext } from "@/platform/registry";
import { statusTone, findSupplier, useProcData } from "./data";
import "./proc-lifecycle.css";

/** Footer for a form overlay: submit first on the left, Cancel at the end. */
export const procFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

/* ====================================================================== *
 * The three-way chain: request, approval, order, goods receipt, invoice.
 * Each stage is a separate fact on a separate record; none implies another.
 * ====================================================================== */

export interface ChainStage { key: string; label: string; state: StepState; fact: string; /** Replaces the default state word (for example "Outside Arlovi"). */ word?: string }

const STATE_WORD: Record<StepState, string> = { done: "Done", partial: "Partly", blocked: "Blocked", pending: "Waiting", skipped: "Not used" };

/** Stages for an order, derived from the same trail the Purchase trail drawer uses. */
export function chainForOrder(order: Rec, all: Rec[], receipts: Rec[], bills: Rec[]): ChainStage[] {
  const trail = purchaseTrail(order, all, receipts, bills);
  const step = (key: string) => trail.find((item) => item.key === key)!;
  const requisition = all.find((item) => item.id === String(order.fields.requisitionId ?? ""));
  const approver = String(order.fields.approver ?? "");
  const lines = bodyOf<PoBody>(order, {}).lines ?? [];
  const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
  const received = lines.reduce((sum, line) => sum + Math.min(line.receivedQuantity, line.quantity), 0);
  return [
    { key: "request", label: "Request", state: requisition ? "done" : "skipped", fact: requisition ? requisition.title : "No requisition" },
    { key: "approval", label: "Approval", state: approver ? "done" : "pending", fact: approver ? `by ${approver}` : "Not approved" },
    { key: "order", label: "Order", state: step("order").state, fact: `${order.title} v${String(order.fields.version ?? 1)}` },
    { key: "receipt", label: "Goods receipt", state: step("receive").state, fact: ordered ? `${received} of ${ordered} units` : "No lines" },
    { key: "match", label: "Invoice match", state: step("match").state, fact: step("match").recordIds.length ? `${step("match").recordIds.length} invoice${step("match").recordIds.length === 1 ? "" : "s"}` : "No invoice" },
  ];
}

export function ProcChain({ stages, label = "Request to payment" }: { stages: ChainStage[]; label?: string }) {
  return (
    <div className="pr-chain-wrap">
    <ol className="pr-chain" aria-label={label}>
      {stages.map((stage) => (
        <li key={stage.key} className="pr-chain-stage" data-state={stage.state}>
          <span className="pr-chain-dot" aria-hidden="true" />
          <span className="pr-chain-label">{stage.label}</span>
          <span className="pr-chain-fact">{stage.fact}</span>
          <span className="pr-chain-state">{stage.word ?? STATE_WORD[stage.state]}</span>
        </li>
      ))}
    </ol>
    </div>
  );
}

/** A requisition has only its own first two stages; this keeps it honest. */
export function chainForRequisition(requisition: Rec, all: Rec[]): ChainStage[] {
  const converted = all.find((item) => isPurchaseOrder(item) && String(item.fields.requisitionId ?? "") === requisition.id);
  const approver = String(requisition.fields.approver ?? "");
  const rejected = requisition.status === "rejected";
  return [
    { key: "request", label: "Request", state: "done", fact: `${String(requisition.fields.requester ?? requisition.ownerName ?? "—")}` },
    { key: "approval", label: "Approval", state: rejected ? "blocked" : approver ? "done" : "pending", fact: rejected ? "Rejected" : approver ? `by ${approver}` : "Awaiting a decision" },
    { key: "order", label: "Order", state: converted ? "done" : "pending", fact: converted ? converted.title : "Not converted" },
    { key: "receipt", label: "Goods receipt", state: "pending", fact: converted ? "After issue" : "—" },
  ];
}

export function StatusPill({ status, tone }: { status: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <Pill tone={tone} dot>{status.replace(/_/g, " ")}</Pill>;
}

/* ---------------- Shared editors ---------------- */

export const blankLine = (index: number): PoLine => ({ id: `l${index + 1}`, description: "", quantity: 1, unitPriceMinor: 0, taxCategory: "standard", receivedQuantity: 0 });

const TAX_CATEGORIES = ["standard", "reduced", "zero_rated", "exempt", "reverse_charge", "outside_scope"];

/** Order or requisition lines: one aligned grid, a line total on each row. */
export function LineEditor({ lines, setLines, currency, money, withTax = false }: {
  lines: PoLine[];
  setLines: (next: (current: PoLine[]) => PoLine[]) => void;
  currency: string;
  money: (minor: number | undefined) => string;
  withTax?: boolean;
}) {
  const patch = (index: number, change: Partial<PoLine>) => setLines((current) => current.map((item, position) => (position === index ? { ...item, ...change } : item)));
  return (
    <div className="pr-lines" role="group" aria-label="Lines">
      <div className="pr-linegrid pr-linegrid-head" data-tax={withTax} aria-hidden="true">
        <span>Item</span><span>Quantity</span><span>Unit price</span>{withTax && <span>Tax</span>}<span />
      </div>
      {lines.map((line, index) => (
        <div className="pr-linegrid" data-tax={withTax} key={line.id}>
          <TextInput aria-label={`Item ${index + 1}`} placeholder={`Item ${index + 1}`} value={line.description} onChange={(event) => patch(index, { description: event.target.value })} />
          <TextInput aria-label="Quantity" placeholder="Qty" inputMode="numeric" align="end" value={String(line.quantity)} onChange={(event) => patch(index, { quantity: Number(event.target.value) || 0 })} />
          <MoneyInput valueMinor={line.unitPriceMinor} currency={currency} label={`Unit price for line ${index + 1}`} onChangeMinor={(minor) => patch(index, { unitPriceMinor: minor })} />
          {withTax && (
            <Select aria-label="Tax" value={line.taxCategory} onChange={(event) => patch(index, { taxCategory: event.target.value as TaxCategory })}>
              {TAX_CATEGORIES.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
            </Select>
          )}
          <Button size="sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</Button>
          <span className="pr-line-total ds-subtle" style={{ gridColumn: "1 / -1" }}>{money(line.quantity * line.unitPriceMinor)} before tax</span>
        </div>
      ))}
      <div><Button size="sm" variant="secondary" onClick={() => setLines((current) => [...current, blankLine(current.length)])}>Add line</Button></div>
    </div>
  );
}

/** Net, tax and total on one compact row, with the unknown-rate warning. */
export function Totals({ totals, money, label }: { totals: InvoiceTotals; money: (minor: number | undefined) => string; label: string }) {
  return (
    <>
      <FactGrid columns={3} items={[
        { label: "Net", value: money(totals.netMinor), mono: true },
        { label: "Tax", value: money(totals.taxMinor), mono: true, hint: totals.byCode.map((group) => group.code.code).join(", ") || undefined },
        { label: `${label} due`, value: <strong>{money(totals.grossMinor)}</strong>, mono: true },
      ]} />
      {totals.hasUnknownRate && (
        <Notice tone="danger" title="A line has no approved tax rate">One or more lines resolved to <code>UNKNOWN</code> for this jurisdiction, category, customer status and date. The figure is shown without tax and must be reviewed before the document is issued.</Notice>
      )}
    </>
  );
}

/** Supplier identity for the record header: name, state, category, terms and recorded performance. */
export function SupplierHeading({ context, part }: { context: ScreenContext; part: "title" | "status" | "subtitle" | "meta" }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const supplier = findSupplier(data, context.params.id);
  if (!supplier) return part === "title" ? <>Supplier</> : null;
  if (part === "title") return <>{supplier.title}</>;
  if (part === "status") return <Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill>;
  const open = data.purchaseOrders.filter((order) => String(order.fields.supplierId) === supplier.id && ["approved", "sent"].includes(order.status));
  const exposure = open.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
  if (part === "subtitle") return <>{String(supplier.fields.category ?? "")}{supplier.fields.email ? ` · ${String(supplier.fields.email)}` : ""}</>;
  return (
    <span className="ds-num">
      {String(supplier.fields.terms ?? "No terms")} · {String(supplier.fields.leadTimeDays ?? "—")} day lead · {supplier.fields.onTimeRatePct !== undefined ? `${String(supplier.fields.onTimeRatePct)}% on time` : "no delivery record"} · {open.length} open order{open.length === 1 ? "" : "s"}, {new Intl.NumberFormat(undefined, { style: "currency", currency: org.currency }).format(exposure / 100)} exposed
    </span>
  );
}
