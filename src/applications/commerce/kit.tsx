import type { ReactNode } from "react";
import { Button, OverlayActions, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import { statusTone, paymentTone, paymentLabel, bodyOf, marginOf, onHandFor, useCommerceData, type OrderBody } from "./data";

/** Footer for a form overlay: submit first on the left, Cancel at the end. */
export const commerceFooter = (formId: string, label: string, options?: { tone?: "danger"; ready?: (context: ScreenContext) => boolean }) => (context: ScreenContext & { close: () => void }) => (
  options?.ready && !options.ready(context)
    /* The body says nothing is chosen; the footer offers only a way out, never an action that does nothing. */
    ? <OverlayActions primary={<Button variant="ghost" onClick={context.close}>Close</Button>} />
    : (
      <OverlayActions
        primary={<Button variant={options?.tone === "danger" ? "danger" : "primary"} type="submit" form={formId}>{label}</Button>}
        end={<Button variant="ghost" onClick={context.close}>Cancel</Button>}
      />
    )
);

/** True when the overlay was opened with at least one record id in its payload. */
export const hasPayloadIds = (context: ScreenContext): boolean => {
  const ids = (context.overlayPayload as { ids?: unknown } | undefined)?.ids;
  return Array.isArray(ids) && ids.length > 0;
};

type Part = "title" | "status" | "subtitle" | "meta";

/** Order identity for the record header: reference, fulfilment and payment state, buyer, value. */
export function OrderHeading({ context, part }: { context: ScreenContext; part: Part }) {
  const order = useRecord(context.params.id);
  const contact = useRecord(String(order?.fields.contactId ?? "") || undefined);
  if (!order) return part === "title" ? <>Order</> : null;
  if (part === "title") return <span className="ds-num">{order.title}</span>;
  if (part === "status") {
    const payment = String(order.fields.payment ?? "not_connected");
    return (
      <>
        <Pill tone={statusTone(String(order.fields.fulfilment ?? order.status))} dot>{String(order.fields.fulfilment ?? order.status).replace(/_/g, " ")}</Pill>
        <Pill tone={paymentTone(payment)}>{paymentLabel(order.fields.payment)}</Pill>
      </>
    );
  }
  const body = bodyOf<OrderBody>(order, {});
  if (part === "subtitle") return <>{contact?.title ?? String(order.fields.buyerName ?? body.shipTo?.name ?? "Guest checkout")}{order.fields.channel ? ` · ${String(order.fields.channel)}` : ""}</>;
  return null;
}

export function orderMeta(context: ScreenContext): ReactNode[] {
  return [<OrderFacts key="facts" context={context} />];
}

function OrderFacts({ context }: { context: ScreenContext }) {
  const order = useRecord(context.params.id);
  if (!order) return null;
  const lines = bodyOf<OrderBody>(order, {}).lines ?? [];
  return <span>Placed {context.dateTime(order.at)} · {lines.length} line{lines.length === 1 ? "" : "s"}, {lines.reduce((sum, line) => sum + line.quantity, 0)} units</span>;
}

/** Product identity for the record header: name, state, SKU, price and margin. */
export function ProductHeading({ context, part }: { context: ScreenContext; part: Part }) {
  const product = useRecord(context.params.id);
  const data = useCommerceData();
  if (!product) return part === "title" ? <>Product</> : null;
  if (part === "title") return <>{product.title}</>;
  if (part === "status") {
    return (
      <>
        <Pill tone={statusTone(product.status)} dot>{product.status}</Pill>
        {product.fields.published === true ? <Pill tone="success">In the storefront</Pill> : <Pill tone="neutral">Not published</Pill>}
      </>
    );
  }
  const margin = marginOf(product);
  const onHand = onHandFor(data.stockMoves, product.id);
  if (part === "subtitle") return <>{String(product.fields.productCollection ?? "") || "No collection"}</>;
  return <span className="ds-num">{String(product.fields.sku ?? "")} · {context.money(product.amountMinor)} list · {margin.costMinor ? `${(margin.marginBp / 100).toFixed(1)}% margin` : "no cost recorded"} · {onHand} on hand</span>;
}
