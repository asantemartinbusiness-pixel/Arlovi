import { useState, useSyncExternalStore } from "react";
import { ShoppingBag } from "lucide-react";
import {
  Button, Card, Empty, Field, KeyValueList, Notice, Pill, Row, Select, Stack, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { computeInvoice, type CustomerTaxStatus } from "@/platform/money";
import { ProviderBoundary, TotalsBlock } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  availableFor, bodyOf, createCartStore, taxCategoryOfProduct,
  type ProductBody, type Variant,
} from "./cart";
import { withDelivery } from "./data";

/* ====================================================================== *
 * Storefront preview — a visitor can genuinely browse, choose a variant,
 * add to the basket and check out. Checkout stops at the payment boundary:
 * the order is held as awaiting payment with its full line detail and no
 * card field is ever shown, because no processor is connected.
 * ====================================================================== */

const cart = createCartStore();

export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.get, cart.get);
}

export { cart };

function priceOf(product: Rec, variant: Variant | undefined): number {
  return (product.amountMinor ?? 0) + (variant?.priceDeltaMinor ?? 0);
}

export function StorefrontPreview({ context, products, moves, orders, promotions }: {
  context: ScreenContext;
  products: Rec[];
  moves: Rec[];
  orders: Rec[];
  promotions: Rec[];
}) {
  const { org, now } = useWorkspace();
  const lines = useCart();
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"shop" | "checkout" | "held">("shop");
  const [held, setHeld] = useState<{ number: string; id: string } | null>(null);
  const [code, setCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<Rec | null>(null);
  const [buyer, setBuyer] = useState({ name: "", email: "", line1: "", postcode: "", city: "" });
  const [status, setStatus] = useState<CustomerTaxStatus>("domestic");
  const [refusal, setRefusal] = useState("");

  const shoppable = products.filter((product) => product.status === "active" && product.fields.published === true);

  const invoiceLines = lines.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxCategory: line.taxCategory,
    discountBp: appliedCode ? Number(appliedCode.fields.value ?? 0) * 100 : undefined,
  }));
  const totals = computeInvoice({ lines: invoiceLines, jurisdiction: org.jurisdiction, customerStatus: status, date: now.toISOString() });
  const shippingMinor = lines.length === 0 ? 0 : totals.netMinor >= 50_000 ? 0 : 695;
  const due = withDelivery(totals, shippingMinor);

  function addToCart(product: Rec) {
    const body = bodyOf<ProductBody>(product, {});
    const variants = body.variants ?? [];
    const variant = variants.find((item) => item.id === variantChoice[product.id]) ?? variants[0];
    const available = availableFor(product, moves, orders);
    const already = lines.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
    if (available - already < 1) {
      setRefusal(`${product.title} cannot be added: ${available} available and ${already} already in this basket. Stock is reserved by order, so the basket cannot exceed what exists.`);
      return;
    }
    setRefusal("");
    cart.set((current) => {
      const key = `${product.id}:${variant?.id ?? "base"}`;
      const found = current.find((line) => line.key === key);
      if (found) return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, {
        key,
        id: `line-${current.length + 1}`,
        productId: product.id,
        variantId: variant?.id,
        description: variant ? `${product.title} · ${variant.name}` : product.title,
        quantity: 1,
        unitPriceMinor: priceOf(product, variant),
        taxCategory: taxCategoryOfProduct(product),
      }];
    });
  }

  if (stage === "held" && held) {
    return (
      <Stack gap={4}>
        <div className="t4-store">
          <div className="t4-store-bar"><span className="t4-store-dot" /><span className="t4-store-dot" /><span className="t4-store-dot" /><span>northline.example/checkout/complete</span></div>
          <div className="t4-store-body" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
            <Card title={`Order ${held.number} is held`} subtitle="Awaiting payment">
              <Stack gap={3}>
                <p className="ds-prose">
                  Thank you. Your order is recorded with every line, the tax resolved for {org.jurisdiction} and the address you gave.
                  Nothing has been charged: this storefront has no payment processor, so the order waits as <strong>awaiting payment</strong> until the studio contacts you.
                </p>
                <KeyValueList items={[
                  { label: "Order", value: held.number },
                  { label: "State", value: <Pill tone="warning" dot>Awaiting payment</Pill> },
                  { label: "Total held", value: context.money(due.grossMinor) },
                  { label: "Card details collected", value: <Pill tone="success">None — no card field was shown</Pill> },
                ]} />
                <Row gap={2}>
                  <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/commerce/orders/${held.id}`)}>Open the order record</Button>
                  <Button variant="ghost" onClick={() => { cart.set([]); setStage("shop"); setHeld(null); setAppliedCode(null); }}>Shop again</Button>
                </Row>
              </Stack>
            </Card>
          </div>
        </div>
        <ProviderBoundary id="payment.capture" />
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <div className="t4-store">
        <div className="t4-store-bar">
          <span className="t4-store-dot" /><span className="t4-store-dot" /><span className="t4-store-dot" />
          <span>northline.example{stage === "checkout" ? "/checkout" : "/shop"}</span>
          <span className="ds-grow" />
          <Pill tone="warning">Preview — rendered from this workspace</Pill>
        </div>
        <div className="t4-store-body">
          <Stack gap={4}>
            {stage === "shop" ? (
              <>
                <div className="t4-store-hero">
                  <h3>Lighting made in Clerkenwell</h3>
                  <p>Spun brass, linen shades and a four week lead time. Trade pricing on request.</p>
                </div>
                {refusal && <Notice tone="danger" title="That cannot be added">{refusal}</Notice>}
                {shoppable.length === 0 ? (
                  <Empty title="Nothing is published" icon={<ShoppingBag size={20} />}>A product appears in the storefront when it is active and published.</Empty>
                ) : (
                  <div className="t4-shelf">
                    {shoppable.map((product) => {
                      const body = bodyOf<ProductBody>(product, {});
                      const variants = body.variants ?? [];
                      const chosen = variants.find((item) => item.id === variantChoice[product.id]) ?? variants[0];
                      const available = availableFor(product, moves, orders);
                      return (
                        <div key={product.id} className="t4-tile">
                          <div className="t4-tile-media">{body.media?.[0]?.label ?? "No photograph"}</div>
                          <div>
                            <strong>{product.title}</strong>
                            <p className="ds-subtle">{product.summary}</p>
                          </div>
                          {variants.length > 1 && (
                            <Field label="Option">
                              <Select
                                value={chosen?.id ?? ""}
                                onChange={(event) => setVariantChoice((current) => ({ ...current, [product.id]: event.target.value }))}
                              >
                                {variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.name}{variant.priceDeltaMinor ? ` (+${context.money(variant.priceDeltaMinor)})` : ""}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          )}
                          <Row gap={2}>
                            <strong className="ds-num ds-grow">{context.money(priceOf(product, chosen))}</strong>
                            <span className="ds-subtle">{taxCategoryOfProduct(product) === "standard" ? "plus VAT" : taxCategoryOfProduct(product).replace("_", " ")}</span>
                          </Row>
                          <Row gap={2}>
                            <Pill tone={available > 3 ? "success" : available > 0 ? "warning" : "danger"} dot>
                              {available > 0 ? `${available} available` : "Out of stock"}
                            </Pill>
                          </Row>
                          <Button variant="primary" size="sm" disabled={available <= 0} onClick={() => addToCart(product)}>
                            {available <= 0 ? "Out of stock" : "Add to basket"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <Card title="Checkout" subtitle="Delivery details only. No card details are requested anywhere on this page.">
                <form
                  id="storefront-checkout"
                  className="ds-stack ds-gap-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (lines.length === 0) return;
                    const number = `ORD-${500 + orders.length}`;
                    const created = await context.mutate.create({
                      collection: "orders",
                      title: number,
                      status: "awaiting_payment",
                      summary: `${buyer.name} · ${lines.length} line${lines.length === 1 ? "" : "s"} · storefront checkout`,
                      amountMinor: due.grossMinor,
                      at: now.toISOString(),
                      tags: ["storefront"],
                      fields: {
                        number,
                        contactId: "",
                        payment: "not_connected",
                        fulfilment: "unfulfilled",
                        channel: "storefront",
                        carrier: "",
                        tracking: "",
                        warehouseId: "nl-warehouses-001",
                        netMinor: totals.netMinor,
                        taxMinor: totals.taxMinor,
                        shippingMinor,
                        buyerEmail: buyer.email,
                        buyerName: buyer.name,
                        taxStatus: status,
                        promotionCode: appliedCode ? String(appliedCode.fields.code ?? "") : "",
                      },
                      body: {
                        lines: lines.map((line) => ({
                          id: line.id,
                          description: line.description,
                          productId: line.productId,
                          variantId: line.variantId,
                          quantity: line.quantity,
                          unitPriceMinor: line.unitPriceMinor,
                          taxCategory: line.taxCategory,
                          discountBp: appliedCode ? Number(appliedCode.fields.value ?? 0) * 100 : undefined,
                        })),
                        shipTo: { name: buyer.name, email: buyer.email, line1: buyer.line1, postcode: buyer.postcode, city: buyer.city },
                        timeline: [
                          { at: now.toISOString(), label: "Order placed in the storefront", detail: `Checkout completed in this browser. Totals resolved for ${org.jurisdiction} as ${status}.` },
                          { at: now.toISOString(), label: "Held awaiting payment", detail: "No payment processor is connected, so no charge was attempted and no card data was collected." },
                        ],
                      },
                    }, `${number} placed from the storefront and held awaiting payment`);
                    await context.mutate.log(`${number} is awaiting payment: ${context.money(due.grossMinor)} across ${lines.length} lines. No processor is connected.`, { entityId: created.id, type: "commerce.payment.not_connected", capability: "not_connected" });
                    setHeld({ number, id: created.id });
                    setStage("held");
                    context.toast("Order held", `${number} is awaiting payment with its full line detail. Nothing was charged.`);
                  }}
                >
                  <Field label="Full name" required><TextInput value={buyer.name} required onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="Email" required hint="Used to contact you about payment. Nothing is sent from this preview."><TextInput type="email" value={buyer.email} required onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))} /></Field>
                  <Field label="Address" required><TextInput value={buyer.line1} required onChange={(event) => setBuyer((current) => ({ ...current, line1: event.target.value }))} /></Field>
                  <Row gap={3} wrap>
                    <Field label="Town or city" required><TextInput value={buyer.city} required onChange={(event) => setBuyer((current) => ({ ...current, city: event.target.value }))} /></Field>
                    <Field label="Postcode" required><TextInput value={buyer.postcode} required onChange={(event) => setBuyer((current) => ({ ...current, postcode: event.target.value }))} /></Field>
                  </Row>
                  <Field label="Tax treatment" hint="Resolved through the tax engine for this jurisdiction, not from the currency.">
                    <Select value={status} onChange={(event) => setStatus(event.target.value as CustomerTaxStatus)}>
                      <option value="domestic">Domestic customer</option>
                      <option value="eu_business">EU business (reverse charge)</option>
                      <option value="export">Export outside the UK</option>
                      <option value="domestic_exempt">Exempt customer</option>
                    </Select>
                  </Field>
                  <ProviderBoundary id="payment.capture" title="Payment stops here, on purpose">
                    A real checkout would hand the total to a processor in a hosted field. This build has no server and no processor, so the order is held with its full line detail instead and no card number, expiry or security code is ever requested.
                  </ProviderBoundary>
                </form>
              </Card>
            )}
          </Stack>

          <div className="t4-cart">
            <Row gap={2}><ShoppingBag size={16} /><strong className="ds-grow">Basket</strong><Pill>{lines.reduce((sum, line) => sum + line.quantity, 0)}</Pill></Row>
            {lines.length === 0 ? (
              <span className="ds-subtle">Nothing in the basket yet.</span>
            ) : (
              <>
                <Stack gap={2}>
                  {lines.map((line) => (
                    <div key={line.key} className="t4-cart-line">
                      <span>{line.description}</span>
                      <strong className="ds-num">{context.money(line.unitPriceMinor * line.quantity)}</strong>
                      <Row gap={1}>
                        <Button size="sm" variant="ghost" aria-label={`Fewer ${line.description}`} onClick={() => cart.set((current) => current.flatMap((item) => (item.key === line.key ? (item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []) : [item])))}>−</Button>
                        <span className="ds-num">{line.quantity}</span>
                        <Button size="sm" variant="ghost" aria-label={`More ${line.description}`} onClick={() => { const product = products.find((item) => item.id === line.productId); if (product) addToCart(product); }}>+</Button>
                      </Row>
                      <span className="ds-subtle">{line.taxCategory.replace("_", " ")}</span>
                    </div>
                  ))}
                </Stack>
                <Row gap={2}>
                  <Field label="Discount code">
                    <TextInput value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="WELCOME10" />
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const found = promotions.find((promotion) => String(promotion.fields.code ?? "").toUpperCase() === code.trim() && promotion.status === "active");
                      if (!found) { setRefusal(`${code || "That code"} is not an active discount in this workspace.`); setAppliedCode(null); return; }
                      setRefusal("");
                      setAppliedCode(found);
                    }}
                  >
                    Apply
                  </Button>
                </Row>
                {appliedCode && <Pill tone="success">{String(appliedCode.fields.code)} · {String(appliedCode.fields.value)}% off each line</Pill>}
                <TotalsBlock
                  totals={due}
                  money={context.money}
                  label="Order"
                  extraRows={[{ label: "Delivery", value: <span className="ds-num">{shippingMinor === 0 ? "Free over £500 net" : context.money(shippingMinor)}</span> }]}
                />
                {stage === "shop" ? (
                  <Button variant="primary" onClick={() => setStage("checkout")}>Checkout</Button>
                ) : (
                  <Stack gap={2}>
                    <Button variant="primary" type="submit" form="storefront-checkout">Place order — held for payment</Button>
                    <Button variant="ghost" onClick={() => setStage("shop")}>Back to the shop</Button>
                  </Stack>
                )}
                <span className="ds-subtle">No card details are collected at any point in this flow.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Stack>
  );
}
