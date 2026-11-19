import { Button, OverlayActions, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { bodyOf, isPurchaseOrder, type PoBody } from "./data";
import { purchaseTrail, type StepState } from "./lifecycle";
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

export interface ChainStage { key: string; label: string; state: StepState; fact: string }

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
    <ol className="pr-chain" aria-label={label}>
      {stages.map((stage) => (
        <li key={stage.key} className="pr-chain-stage" data-state={stage.state}>
          <span className="pr-chain-dot" aria-hidden="true" />
          <span className="pr-chain-label">{stage.label}</span>
          <span className="pr-chain-fact">{stage.fact}</span>
          <span className="pr-chain-state">{STATE_WORD[stage.state]}</span>
        </li>
      ))}
    </ol>
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
