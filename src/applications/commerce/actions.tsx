import { useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, MoneyInput, FactGrid, ModalUnsavedChanges, Notice, OverlaySection, OverlaySummary, Pill, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { getRecord, listByCollection } from "@/platform/repo";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { computeInvoice } from "@/platform/money";
import { ACTOR_BY_ROLE, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE, createStore, downloadCsv, ProviderBoundary, TotalsBlock, type ConfirmSpec } from "@/applications/market/kit";
import {
  bodyOf, marginOf, onHandFor, orderTotals, PAYMENT_LABEL, reservedFor, taxCategoryOfProduct, useCommerceData,
  type OrderBody,
} from "./data";

/* ====================================================================== *
 * COMMERCE contract actions that change a record. Prices and totals run
 * through computeInvoice; nothing here derives tax from the currency.
 * ====================================================================== */

const iso = (context: ScreenContext) => context.now.toISOString();
const confirm = (context: ScreenContext, spec: ConfirmSpec) => context.openOverlay("confirm", spec);

async function load(context: ScreenContext, id = context.selectedId): Promise<Rec | undefined> {
  if (!id) return undefined;
  const record = await getRecord(id);
  if (!record) context.toast("Not found", "That record is no longer in this workspace.", "failed");
  return record;
}

/** One unit at list price through the tax engine, for a domestic buyer today. */
export function listPriceTotals(product: Rec, priceMinor: number, jurisdiction: string, date: string) {
  return computeInvoice({
    lines: [{ id: product.id, description: product.title, quantity: 1, unitPriceMinor: priceMinor, taxCategory: taxCategoryOfProduct(product) }],
    jurisdiction,
    customerStatus: "domestic",
    date,
  });
}

/* ---------------- COMMERCE-001 inspect product ---------------- */

export function ProductInspect({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const [chosen, setChosen] = useState("");
  const product = data.products.find((item) => item.id === chosen) ?? data.products.find((item) => item.status === "active") ?? data.products[0];
  if (!product) return <Empty title="No products">Add a product to the catalogue first.</Empty>;
  const onHand = onHandFor(data.stockMoves, product.id);
  const reserved = reservedFor(data.orders, product.id);
  const totals = listPriceTotals(product, product.amountMinor ?? 0, org.jurisdiction, now.toISOString());
  const margin = marginOf(product);
  const sold = data.orders.filter((order) => order.status !== "cancelled").flatMap((order) => bodyOf<OrderBody>(order, {}).lines ?? []).filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Stack gap={4}>
      <Field label="Product">
        <Select value={product.id} onChange={(event) => setChosen(event.target.value)}>
          {data.products.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.sku ?? "")}</option>)}
        </Select>
      </Field>
      <FactGrid columns={2} items={[
        { label: "Status", value: <Pill>{product.status}</Pill> },
        { label: "In the storefront", value: product.fields.published === true ? "Yes" : "No" },
        { label: "On hand", value: <span className="ds-num">{onHand}</span> },
        { label: "Reserved by open orders", value: <span className="ds-num">{reserved}</span> },
        { label: "Available", value: <strong className="ds-num">{onHand - reserved}</strong> },
        { label: "Units sold (recorded orders)", value: <span className="ds-num">{sold}</span> },
        { label: "Margin at list", value: margin.costMinor ? `${(margin.marginBp / 100).toFixed(1)}%` : "Unavailable — no cost recorded" },
      ]} />
      <TotalsBlock totals={totals} money={context.money} label="One unit" />
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${org.slug}/commerce/products/${product.id}`); }}>Open the product</Button>
    </Stack>
  );
}

/* ---------------- COMMERCE-001 location scope (store picker) ---------------- */

export const locationScope = createStore<string>("");

export function useLocationScope() {
  return useSyncExternalStore(locationScope.subscribe, locationScope.get, locationScope.get);
}

export function LocationScopeNote({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const scope = useLocationScope();
  const site = data.warehouses.find((item) => item.id === scope);
  return (
    <Row gap={2} wrap>
      <Pill tone={scope ? "info" : "neutral"} dot>{scope ? `Location: ${site?.title ?? "loading"}` : "All locations"}</Pill>
      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("store picker")}>Change location</Button>
      {scope && <span className="ds-subtle">Orders and stock below count this location only. Orders without a location are left out, not guessed.</span>}
    </Row>
  );
}

export function StorePicker({ close }: { close: () => void }) {
  const data = useCommerceData();
  const current = useLocationScope();
  const [chosen, setChosen] = useState(current);
  return (
    <form id="store-picker" className="ds-stack ds-gap-4" onSubmit={(event) => { event.preventDefault(); locationScope.set(chosen); close(); }}>
      <p className="ds-subtle">One storefront sells from {data.warehouses.length} locations. Pick one to see the overview for that location alone.</p>
      <Field label="Location">
        <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          <option value="">All locations</option>
          {data.warehouses.map((site) => <option key={site.id} value={site.id}>{site.title} · {String(site.fields.code ?? "")}</option>)}
        </Select>
      </Field>
      <FactGrid columns={2} items={data.warehouses.map((site) => ({ label: site.title, value: `${data.orders.filter((order) => String(order.fields.warehouseId ?? "") === site.id).length} orders · manager ${String(site.fields.managerName ?? "unassigned")}` }))} />
    </form>
  );
}

/* ---------------- COMMERCE-002 categorise, duplicate, archive ---------------- */

export function Categorise({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const product = useRecord(context.selectedId);
  const existing = [...new Set(data.products.map((item) => String(item.fields.productCollection ?? "")).filter(Boolean))];
  const [choice, setChoice] = useState("");
  const [fresh, setFresh] = useState("");
  if (!product) return <Empty title="Select a product" />;
  const current = String(product.fields.productCollection ?? "Uncategorised");
  const target = (choice === "__new" ? fresh : choice || current).trim();
  return (
    <form
      id="categorise"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!target || target === current) return;
        const saved = await context.mutate.patch(product.id, { fields: { ...product.fields, productCollection: target } }, { expectRevision: product.revision, event: `${product.title} moved from ${current} to ${target}` });
        if (!saved) return;
        context.toast("Categorised", `${product.title} is in ${target}.`);
        close();
      }}
    >
      <FactGrid columns={2} items={[{ label: "Product", value: product.title }, { label: "Collection now", value: current }]} />
      <Field label="Collection">
        <Select value={choice || current} onChange={(event) => setChoice(event.target.value)}>
          {existing.map((name) => <option key={name}>{name}</option>)}
          <option value="__new">A new collection…</option>
        </Select>
      </Field>
      {choice === "__new" && <Field label="New collection name" required><TextInput value={fresh} onChange={(event) => setFresh(event.target.value)} /></Field>}
      {target === current && <Notice tone="info">Choose a different collection to move it.</Notice>}
    </form>
  );
}

export async function duplicateProduct(context: ScreenContext) {
  const product = await load(context);
  if (!product) return;
  const copy = await context.mutate.create({
    collection: "products",
    title: `${product.title} (copy)`,
    status: "draft",
    summary: product.summary,
    amountMinor: product.amountMinor,
    tags: product.tags,
    fields: { ...product.fields, sku: `${String(product.fields.sku ?? "SKU")}-COPY`, published: false, duplicatedFrom: product.id },
    body: product.body,
  }, `Product ${product.title} duplicated as a draft by ${context.actor}`);
  context.select(copy.id);
  context.toast("Duplicated", `${copy.title} is a draft with SKU ${String(copy.fields.sku)}. No stock was copied: stock is the sum of movements, and the copy has none.`);
  context.openOverlay("Product editor", { id: copy.id });
}

export async function archiveProduct(context: ScreenContext) {
  const product = await load(context);
  if (!product) return;
  const [orders, moves] = await Promise.all([listByCollection(context.org.id, "orders"), listByCollection(context.org.id, "stockMoves")]);
  const reserved = reservedFor(orders, product.id);
  const onHand = onHandFor(moves, product.id);
  confirm(context, {
    title: `Archive ${product.title}`,
    tone: "danger",
    consequence: "The product leaves the storefront and the active catalogue. Its orders, movements and history are kept, and it can be restored by editing its status.",
    facts: [
      { label: "SKU", value: String(product.fields.sku ?? "—") },
      { label: "On hand", value: String(onHand) },
      { label: "Reserved by open orders", value: String(reserved) },
    ],
    blocked: product.status === "archived" ? "Already archived."
      : reserved > 0 ? `${reserved} unit${reserved === 1 ? " is" : "s are"} reserved by open orders. Fulfil or cancel them first, so no order points at an archived product.` : undefined,
    confirmLabel: "Archive product",
    run: async () => {
      const saved = await context.mutate.patch(product.id, { status: "archived", fields: { ...product.fields, published: false, archivedBy: context.actor, archivedAt: iso(context) } }, { expectRevision: product.revision, event: `${product.title} archived by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Archived", `${product.title} is archived${onHand ? `; ${onHand} units stay on hand until moved or written off` : ""}.`);
    },
  });
}

/* ---------------- COMMERCE-003 change price ---------------- */

export function ChangePrice({ context, close }: { context: ScreenContext; close: () => void }) {
  const product = useRecord(context.params.id);
  if (!product) return <Empty title="Loading the product" />;
  return <ChangePriceForm key={product.id} context={context} close={close} product={product} />;
}

function ChangePriceForm({ context, close, product }: { context: ScreenContext; close: () => void; product: Rec }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const [price, setPrice] = useState(product.amountMinor ?? 0);
  const [reason, setReason] = useState("");
  const margin = marginOf(product, price);
  const totals = listPriceTotals(product, price, org.jurisdiction, now.toISOString());
  const live = data.promotions.filter((promotion) => promotion.status === "active");
  const breaches = margin.costMinor ? live.map((promotion) => {
    const discounted = String(promotion.fields.kind) === "amount" ? price - Number(promotion.fields.value ?? 0) : Math.round(price * (1 - Number(promotion.fields.value ?? 0) / 100));
    const bp = discounted <= 0 ? -10_000 : Math.round(((discounted - margin.costMinor) / discounted) * 10_000);
    return { promotion, discounted, bp, floor: Number(promotion.fields.floorMarginBp ?? 0) };
  }).filter((row) => row.bp < row.floor) : [];
  const unchanged = price === (product.amountMinor ?? 0);
  const invalid = price <= 0 || unchanged || breaches.length > 0 || !reason.trim();
  return (
    <form
      id="change-price"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const saved = await context.mutate.patch(product.id, {
          amountMinor: price,
          fields: { ...product.fields, previousPriceMinor: product.amountMinor ?? 0, priceChangedBy: context.actor, priceChangedAt: now.toISOString(), priceChangeReason: reason.trim() },
        }, { expectRevision: product.revision, event: `${product.title} price changed from ${product.amountMinor ?? 0} to ${price} by ${context.actor}: ${reason.trim()}` });
        if (!saved) return;
        context.toast("Price changed", `${product.title} is now ${context.money(price)} net. Existing orders keep the price they were placed at.`);
        close();
      }}
    >
      <ModalUnsavedChanges when={price !== (product.amountMinor ?? 0) || Boolean(reason.trim())} />
      <OverlaySummary eyebrow="Change price" title={product.title} status={breaches.length ? <Pill tone="danger" dot>Breaks a margin floor</Pill> : undefined}
        meta={[String(product.fields.sku ?? ""), `${live.length} live offer${live.length === 1 ? "" : "s"} checked`]} />
      <OverlaySection title="New price">
        <Stack gap={3}>
          <div style={{ maxWidth: 240 }}><Field label="New net price"><MoneyInput valueMinor={price} onChangeMinor={setPrice} currency={org.currency} label="New net price" /></Field></div>
          <Field label="Reason" required hint="Recorded with the change."><TextInput value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        </Stack>
      </OverlaySection>
      <FactGrid columns={3} items={[
        { label: "Price now", value: context.money(product.amountMinor), mono: true },
        { label: "Unit cost", value: margin.costMinor ? context.money(margin.costMinor) : "Not recorded", mono: true, tone: margin.costMinor ? undefined : "warning" },
        { label: "Margin now → new", value: margin.costMinor ? `${(marginOf(product).marginBp / 100).toFixed(1)}% → ${(margin.marginBp / 100).toFixed(1)}%` : "Unavailable", mono: true },
      ]} />
      <TotalsBlock totals={totals} money={context.money} label="One unit" />
      {breaches.length > 0 && (
        <Notice tone="danger" title="This price breaks a live offer's margin floor">
          {breaches.map((row) => `${row.promotion.title} would sell at ${context.money(row.discounted)} (${(row.bp / 100).toFixed(1)}% against a ${(row.floor / 100).toFixed(0)}% floor)`).join("; ")}. Pause the offer or choose another price.
        </Notice>
      )}
      {!margin.costMinor && <Notice tone="warning" title="No unit cost is recorded">The margin floor cannot be checked without a cost, so offers are not evaluated.</Notice>}
    </form>
  );
}

/* ---------------- COMMERCE-004 reorder ---------------- */

export async function reorderStock(context: ScreenContext) {
  const products = await listByCollection(context.org.id, "products");
  const product = products.find((item) => context.selectedId === item.id || context.selectedId?.startsWith(`${item.id}-`));
  if (!product) {
    context.toast("Select a stock line", "Pick a row on the Stock tab to reorder that product.", "blocked");
    return;
  }
  context.openOverlay("Requisition form", { productIds: [product.id] });
}

/* ---------------- COMMERCE-005 filter, export, assign ---------------- */

export const orderFilter = createStore<{ payment: string; channel: string }>({ payment: "", channel: "" });

export function useOrderFilter() {
  return useSyncExternalStore(orderFilter.subscribe, orderFilter.get, orderFilter.get);
}

export function applyOrderFilter(orders: Rec[], filter: { payment: string; channel: string }) {
  return orders.filter((order) => (!filter.payment || String(order.fields.payment) === filter.payment) && (!filter.channel || String(order.fields.channel) === filter.channel));
}

export function OrderFilter({ close }: { close: () => void }) {
  const data = useCommerceData();
  const current = useOrderFilter();
  const [payment, setPayment] = useState(current.payment);
  const [channel, setChannel] = useState(current.channel);
  const channels = [...new Set(data.orders.map((order) => String(order.fields.channel ?? "")).filter(Boolean))];
  const matches = applyOrderFilter(data.orders, { payment, channel }).length;
  return (
    <form id="order-filter" className="ds-stack ds-gap-4" onSubmit={(event) => { event.preventDefault(); orderFilter.set({ payment, channel }); close(); }}>
      <Field label="Payment state">
        <Select value={payment} onChange={(event) => setPayment(event.target.value)}>
          <option value="">Any</option>
          {Object.entries(PAYMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Channel">
        <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="">Any</option>
          {channels.map((item) => <option key={item}>{item}</option>)}
        </Select>
      </Field>
      <Notice tone="info">{matches} of {data.orders.length} orders match. The filter applies to every tab until it is cleared.</Notice>
      <Button variant="ghost" onClick={() => { setPayment(""); setChannel(""); }}>Clear</Button>
    </form>
  );
}

export async function exportOrders(context: ScreenContext) {
  const [orders, contacts] = await Promise.all([listByCollection(context.org.id, "orders"), listByCollection(context.org.id, "contacts")]);
  const rows = applyOrderFilter(orders, orderFilter.get()).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const count = downloadCsv(`${context.org.slug}-orders.csv`,
    ["order", "placed", "buyer", "payment", "fulfilment", "net_minor", "tax_minor", "gross_minor", "currency", "tax_codes"],
    rows.map((order) => {
      const contact = contacts.find((item) => item.id === String(order.fields.contactId));
      const totals = orderTotals(order, contact, context.org.jurisdiction);
      return [order.title, order.at, contact?.title ?? String(order.fields.buyerName || "Guest checkout"), String(order.fields.payment ?? ""), String(order.fields.fulfilment ?? order.status), totals.netMinor, totals.taxMinor, totals.grossMinor, context.org.currency, totals.byCode.map((group) => group.code.code).join(" ")];
    }));
  await context.mutate.log(`Orders exported as CSV (${count} rows)`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} orders downloaded from this browser, with totals recomputed through the tax engine.`);
}

const TEAM = Object.entries(ACTOR_BY_ROLE).filter(([role]) => role !== "client").map(([, name]) => name);

export function AssignOrder({ context, close }: { context: ScreenContext; close: () => void }) {
  const order = useRecord(context.selectedId);
  if (!order) return <Empty title="Select an order" />;
  return <AssignOrderForm key={order.id} context={context} close={close} order={order} />;
}

function AssignOrderForm({ context, close, order }: { context: ScreenContext; close: () => void; order: Rec }) {
  const [owner, setOwner] = useState(order.ownerName);
  return (
    <form
      id="assign-order"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (owner === order.ownerName) return;
        const saved = await context.mutate.patch(order.id, { ownerName: owner, fields: { ...order.fields, assignedBy: context.actor, assignedAt: iso(context) } }, { expectRevision: order.revision, event: `${order.title} assigned to ${owner} by ${context.actor}` });
        if (!saved) return;
        context.toast("Assigned", `${order.title} is owned by ${owner}. No notification was sent.`);
        close();
      }}
    >
      <FactGrid columns={2} items={[{ label: "Order", value: order.title }, { label: "Owner now", value: order.ownerName }, { label: "Payment", value: PAYMENT_LABEL[String(order.fields.payment)] ?? String(order.fields.payment) }]} />
      <Field label="Owner"><Select value={owner} onChange={(event) => setOwner(event.target.value)}>{TEAM.map((name) => <option key={name}>{name}</option>)}</Select></Field>
      {owner === order.ownerName && <Notice tone="info">Choose someone else to reassign it.</Notice>}
    </form>
  );
}

/* ---------------- COMMERCE-006 / 010 message the buyer ---------------- */

export function BuyerMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const subject = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const data = useCommerceData();
  if (!subject) return <Empty title="Select an order or return" />;
  const order = subject.collection === "orders" ? subject : data.orders.find((item) => item.id === String(subject.fields.orderId));
  const contact = data.contacts.find((item) => item.id === String(order?.fields.contactId ?? subject.fields.contactId ?? ""));
  return <BuyerMessageForm key={subject.id} context={context} close={close} subject={subject} to={String(contact?.fields.email ?? bodyOf<OrderBody>(order, {}).shipTo?.email ?? "")} name={contact?.title ?? bodyOf<OrderBody>(order, {}).shipTo?.name ?? "the buyer"} />;
}

function BuyerMessageForm({ context, close, subject, to, name }: { context: ScreenContext; close: () => void; subject: Rec; to: string; name: string }) {
  const [title, setTitle] = useState(`About ${subject.title}`);
  const [text, setText] = useState("");
  const invalid = !title.trim() || !text.trim() || !to;
  return (
    <form
      id="buyer-message"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        await context.mutate.create({
          collection: "outbox", title: title.trim(), status: "draft", parentId: subject.id, summary: text.trim(),
          fields: { to, channel: "email", relatesTo: subject.id, delivery: "not_connected", draftedBy: context.actor },
        }, `Message to ${name} about ${subject.title} kept as a local draft`);
        const body = subject.collection === "orders" ? bodyOf<OrderBody>(subject, {}) : undefined;
        const ok27 = await context.mutate.patch(subject.id, {
          fields: { ...subject.fields, lastContactDraftAt: iso(context), lastContactDraftBy: context.actor },
          ...(body ? { body: { ...body, timeline: [...(body.timeline ?? []), { at: iso(context), label: "Message drafted", detail: `${title.trim()} — kept locally for ${to}; not sent.` }] } } : {}),
        }, { expectRevision: subject.revision });
        if (!ok27) { context.toast("Not saved", "The record changed after it was opened. Close, check the latest version and try again.", "blocked"); return; }
        await context.mutate.log(`Message to ${to} drafted for ${subject.title}; no mail provider is connected.`, { entityId: subject.id, type: "email.draft", capability: "ready_local" });
        context.toast("Kept as a draft", `The message to ${name} is saved against ${subject.title}. It was not sent.`);
        close();
      }}
    >
      <FactGrid columns={2} items={[{ label: "To", value: to || <Pill tone="danger">No email recorded</Pill> }, { label: "About", value: subject.title }]} />
      <Field label="Subject" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Message" required><TextArea rows={5} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      {!to && <Notice tone="danger" title="There is no address to write to">Record the buyer's email on their contact first.</Notice>}
      <ProviderBoundary id="email.send" />
    </form>
  );
}

/* ---------------- COMMERCE-007 / 008 storefront record ---------------- */

export interface StoreBody {
  sections?: string[];
  versions?: { version: number; at: string; by: string; sections: string[]; theme: Record<string, string>; layout: string }[];
}

export const DEFAULT_SECTIONS = ["Hero", "Product shelf", "Discount code", "Basket", "Delivery note"];
export const THEMES = ["Studio brass on paper", "Graphite on paper", "Aqua annotation"];

export function useStorefront(): Rec | undefined {
  const data = useCommerceData();
  return data.sites.find((site) => String(site.fields.kind) === "storefront");
}

async function storefrontRecord(context: ScreenContext): Promise<Rec> {
  const sites = await listByCollection(context.org.id, "sites");
  const found = sites.find((site) => String(site.fields.kind) === "storefront");
  if (found) return found;
  return context.mutate.create({
    collection: "sites", title: `${context.org.shortName} storefront`, status: "draft",
    summary: "Storefront settings, theme, layout and publication versions.",
    fields: { kind: "storefront", theme: THEMES[0], headingFace: "Display", radius: "Rounded", layout: "Shelf and basket", publishedVersion: 0, liveVersion: 0, publishState: "not_connected", guestCheckout: true, minimumOrderMinor: 0, checkoutVersion: 1, checkoutDeployedVersion: 0 },
    body: { sections: DEFAULT_SECTIONS, versions: [] } satisfies StoreBody,
  }, "Storefront settings record created");
}

export async function setStoreLayout(context: ScreenContext, layout: string) {
  const record = await storefrontRecord(context);
  const ok28 = await context.mutate.patch(record.id, { fields: { ...record.fields, layout } }, { expectRevision: record.revision, event: `Storefront layout template set to ${layout} by ${context.actor}` });
  if (!ok28) { context.toast("Not saved", "The record changed after it was opened. Close, check the latest version and try again.", "blocked"); return; }
}

export function ThemeInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const store = useStorefront();
  return <ThemeForm key={store?.id ?? "new"} context={context} close={close} store={store} />;
}

function ThemeForm({ context, close, store }: { context: ScreenContext; close: () => void; store: Rec | undefined }) {
  const [theme, setTheme] = useState(String(store?.fields.theme ?? THEMES[0]));
  const [heading, setHeading] = useState(String(store?.fields.headingFace ?? "Display"));
  const [radius, setRadius] = useState(String(store?.fields.radius ?? "Rounded"));
  return (
    <form
      id="theme-inspector"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const record = store ?? await storefrontRecord(context);
        const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, theme, headingFace: heading, radius, themeEditedBy: context.actor } }, { expectRevision: record.revision, event: `Storefront theme set to ${theme}, ${heading} headings, ${radius} corners by ${context.actor}` });
        if (!saved) return;
        context.toast("Theme saved", "The storefront record holds the new theme. It reaches visitors with the next published version.");
        close();
      }}
    >
      <Field label="Palette"><Select value={theme} onChange={(event) => setTheme(event.target.value)}>{THEMES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Headings"><Select value={heading} onChange={(event) => setHeading(event.target.value)}>{["Display", "Body"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Corners"><Select value={radius} onChange={(event) => setRadius(event.target.value)}>{["Rounded", "Square"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <div className="t4-swatches">
        {["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "var(--bg-sunken)"].map((colour) => <span key={colour} className="t4-swatch" style={{ background: colour }} title={colour} />)}
      </div>
      <Notice tone="info">Each palette maps to the workspace tokens, so a theme change stays consistent rather than becoming a second design system.</Notice>
    </form>
  );
}

export function LayoutEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const store = useStorefront();
  return <LayoutForm key={store?.id ?? "new"} context={context} close={close} store={store} />;
}

function LayoutForm({ context, close, store }: { context: ScreenContext; close: () => void; store: Rec | undefined }) {
  const [sections, setSections] = useState<string[]>(bodyOf<StoreBody>(store, {}).sections ?? DEFAULT_SECTIONS);
  const [message, setMessage] = useState("");
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    setMessage(`${sections[index]} moved to position ${target + 1}.`);
  };
  return (
    <form
      id="layout-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const record = store ?? await storefrontRecord(context);
        const saved = await context.mutate.patch(record.id, { body: { ...bodyOf<StoreBody>(record, {}), sections } }, { expectRevision: record.revision, event: `Storefront sections arranged: ${sections.join(", ")}` });
        if (!saved) return;
        context.toast("Layout saved", "The new order is on the storefront record and goes out with the next published version.");
        close();
      }}
    >
      <ol className="ds-stack ds-gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sections.map((section, index) => (
          <li key={section} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); if (!Number.isNaN(from)) move(from, index - from); }}>
            <Row gap={2}>
              <span className="ds-num">{index + 1}</span>
              <strong className="ds-grow">{section}</strong>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${section} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${section} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            </Row>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="ds-subtle">{message || "Drag a section, or use its arrow buttons."}</p>
    </form>
  );
}

export async function publishStorefront(context: ScreenContext) {
  const record = await storefrontRecord(context);
  const products = await listByCollection(context.org.id, "products");
  const body = bodyOf<StoreBody>(record, {});
  const version = Number(record.fields.publishedVersion ?? 0) + 1;
  const live = Number(record.fields.liveVersion ?? 0);
  const listed = products.filter((product) => product.status === "active" && product.fields.published === true).length;
  confirm(context, {
    title: `Publish storefront version ${version}`,
    consequence: `Version ${version} is recorded with the current theme, layout and ${listed} listed products. Its state is "${CAPABILITY_LABELS.queued_local}". The version visitors would see stays at ${live ? `version ${live}` : "none (nothing is hosted)"} until a host confirms the new one, so a failed publish cannot replace it.`,
    facts: [
      { label: "Sections", value: (body.sections ?? DEFAULT_SECTIONS).join(" · ") },
      { label: "Theme", value: String(record.fields.theme ?? THEMES[0]) },
      { label: "Products listed", value: String(listed) },
    ],
    blocked: listed === 0 ? "No product is active and published, so the storefront would be empty." : undefined,
    boundary: "site.publish",
    confirmLabel: `Publish version ${version} locally`,
    run: async () => {
      const entry = { version, at: iso(context), by: context.actor, sections: body.sections ?? DEFAULT_SECTIONS, theme: { theme: String(record.fields.theme ?? THEMES[0]), headingFace: String(record.fields.headingFace ?? "Display"), radius: String(record.fields.radius ?? "Rounded") }, layout: String(record.fields.layout ?? "") };
      const saved = await context.mutate.patch(record.id, {
        status: "published",
        fields: { ...record.fields, publishedVersion: version, previousPublishedVersion: Number(record.fields.publishedVersion ?? 0), publishState: "queued_local", publishedBy: context.actor, exportedAt: iso(context) },
        body: { ...body, versions: [...(body.versions ?? []), entry] },
      }, { expectRevision: record.revision, event: `Storefront version ${version} published locally by ${context.actor}; live version unchanged` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Published locally", `Version ${version} is queued. No host is connected, so visitors see no change.`);
    },
  });
}

export async function rollbackStorefront(context: ScreenContext) {
  const record = await storefrontRecord(context);
  const body = bodyOf<StoreBody>(record, {});
  const versions = body.versions ?? [];
  const current = Number(record.fields.publishedVersion ?? 0);
  const previous = [...versions].reverse().find((entry) => entry.version < current);
  confirm(context, {
    title: previous ? `Roll back to version ${previous.version}` : "Roll back",
    tone: "danger",
    consequence: previous
      ? `The storefront returns to version ${previous.version} from ${context.dateTime(previous.at)}: its sections, theme and layout. Version ${current} stays in the history and can be published again.`
      : "There is no earlier published version to return to.",
    facts: previous ? [
      { label: "Current version", value: String(current) },
      { label: "Rolls back to", value: `${previous.version} · ${previous.by}` },
      { label: "Sections then", value: previous.sections.join(" · ") },
    ] : [],
    blocked: previous ? undefined : current ? `Version ${current} is the first published version.` : "Nothing has been published yet.",
    boundary: "site.publish",
    confirmLabel: previous ? `Roll back to version ${previous.version}` : "Roll back",
    run: async () => {
      if (!previous) return;
      const saved = await context.mutate.patch(record.id, {
        fields: { ...record.fields, ...previous.theme, layout: previous.layout || String(record.fields.layout ?? ""), publishedVersion: previous.version, rolledBackFrom: current, rolledBackBy: context.actor, rolledBackAt: iso(context), publishState: "queued_local" },
        body: { ...body, sections: previous.sections },
      }, { expectRevision: record.revision, event: `Storefront rolled back from version ${current} to ${previous.version} by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Rolled back", `The storefront is at version ${previous.version} again.`);
    },
  });
}

export function StorefrontVersions({ context }: { context: ScreenContext }) {
  const store = useStorefront();
  const data = useCommerceData();
  const versions = [...(bodyOf<StoreBody>(store, {}).versions ?? [])].reverse();
  const listed = data.products.filter((product) => product.status === "active" && product.fields.published === true).length;
  return (
    <Stack gap={4}>
      <FactGrid columns={2} items={[
        { label: "Products in the storefront", value: String(listed) },
        { label: "Active discount codes", value: String(data.promotions.filter((promotion) => promotion.status === "active" && promotion.fields.code).length) },
        { label: "Published version", value: store?.fields.publishedVersion ? `version ${String(store.fields.publishedVersion)}` : "None" },
        { label: "Publication state", value: <Pill tone="warning">{CAPABILITY_LABELS[(String(store?.fields.publishState ?? "not_connected")) as keyof typeof CAPABILITY_LABELS] ?? "Not connected"}</Pill> },
        { label: "Checkout", value: "Stops at payment, collects no card data" },
      ]} />
      {versions.length > 0 && (
        <DataGrid rows={versions} rowId={(row) => String(row.version)} label="Published versions" filterable={false}
          columns={[
            { key: "version", header: "Version", primary: true, cell: (row) => <span className="ds-num">v{row.version}</span> },
            { key: "at", header: "Published", cell: (row) => context.dateTime(row.at) },
            { key: "by", header: "By", cell: (row) => row.by },
            { key: "theme", header: "Theme", cell: (row) => row.theme.theme },
          ]} />
      )}
      <ProviderBoundary id="site.publish" title="Nothing is published to the internet">
        A publish records a new version here. The previous version stays the one visitors would see until a host verifies the new one, so a failed publish cannot take a live site down.
      </ProviderBoundary>
    </Stack>
  );
}

export function CheckoutPolicy({ context, close }: { context: ScreenContext; close: () => void }) {
  const store = useStorefront();
  return <CheckoutPolicyForm key={store?.id ?? "new"} context={context} close={close} store={store} />;
}

function CheckoutPolicyForm({ context, close, store }: { context: ScreenContext; close: () => void; store: Rec | undefined }) {
  const { org } = useWorkspace();
  const [guest, setGuest] = useState(store?.fields.guestCheckout !== false);
  const [minimum, setMinimum] = useState(Number(store?.fields.minimumOrderMinor ?? 0));
  return (
    <form
      id="policy-change"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const record = store ?? await storefrontRecord(context);
        const version = Number(record.fields.checkoutVersion ?? 1) + 1;
        const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, guestCheckout: guest, minimumOrderMinor: minimum, checkoutVersion: version, checkoutChangedBy: context.actor, checkoutChangedAt: iso(context) } }, { expectRevision: record.revision, event: `Checkout policy v${version}: guest checkout ${guest ? "allowed" : "blocked"}, minimum order ${minimum}, by ${context.actor}` });
        if (!saved) return;
        context.toast("Checkout configured", `Policy version ${version} is saved. Deploy it to make it the checkout's policy.`);
        close();
      }}
    >
      <Checkbox label="Allow guest checkout" checked={guest} onChange={(event) => setGuest(event.target.checked)} />
      <Field label="Minimum order value (net)"><MoneyInput valueMinor={minimum} onChangeMinor={setMinimum} currency={org.currency} label="Minimum order value" /></Field>
      {!guest && <Notice tone="warning" title="Blocking guest checkout turns visitors away">Every held order in this workspace came from a guest. Requiring an account before payment is even possible would lose them.</Notice>}
      <Notice tone="info">The policy is saved as a new version with your name. It applies to the checkout once deployed.</Notice>
    </form>
  );
}

export async function deployCheckout(context: ScreenContext) {
  const record = await storefrontRecord(context);
  const version = Number(record.fields.checkoutVersion ?? 1);
  const deployed = Number(record.fields.checkoutDeployedVersion ?? 0);
  confirm(context, {
    title: `Deploy checkout policy v${version}`,
    consequence: `Policy v${version} (guest checkout ${record.fields.guestCheckout === false ? "blocked" : "allowed"}, minimum ${context.money(Number(record.fields.minimumOrderMinor ?? 0))}) becomes the checkout's policy in this workspace. Payment collection itself stays with the processor, which is not connected, so checkout still ends with the order held awaiting payment.`,
    facts: [{ label: "Deployed now", value: deployed ? `v${deployed}` : "None" }, { label: "Card data collected here", value: "Never" }],
    blocked: deployed === version ? `v${version} is already deployed. Change the policy first.` : undefined,
    boundary: "payment.capture",
    confirmLabel: `Deploy v${version}`,
    run: async () => {
      const saved = await context.mutate.patch(record.id, { fields: { ...record.fields, checkoutDeployedVersion: version, checkoutDeployedBy: context.actor, checkoutDeployedAt: iso(context), paymentState: "not_connected" } }, { expectRevision: record.revision, event: `Checkout policy v${version} deployed locally by ${context.actor}; payment processor not connected` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Deployed locally", `Checkout policy v${version} is in force here. No processor was contacted.`);
    },
  });
}

/* ---------------- COMMERCE-009 create label, scan ---------------- */

export async function createLabel(context: ScreenContext) {
  const order = await load(context);
  if (!order) return;
  const labelRef = String(order.fields.labelRef ?? "");
  const tracking = String(order.fields.tracking ?? "");
  const carrier = String(order.fields.carrier ?? "");
  const pending = String(order.fields.labelState ?? "") === "awaiting_external_confirmation";
  const reference = `LBL-${order.title.replace(/[^A-Z0-9]/gi, "")}-1`;
  confirm(context, {
    title: `Create a label for ${order.title}`,
    consequence: `A local label ${reference} is recorded for ${carrier || "the chosen carrier"}. It is keyed to the order, so the same order can never get a second label from a retry.`,
    facts: [
      { label: "Carrier", value: carrier || "Not chosen" },
      { label: "Existing label", value: labelRef || "None" },
      { label: "Tracking", value: tracking || "None" },
    ],
    blocked: pending ? "An earlier label request has no confirmed carrier response. Creating another could produce a duplicate; record an exception and resolve it first."
      : labelRef || tracking ? `${order.title} already has ${labelRef ? `label ${labelRef}` : `tracking ${tracking}`}. A second label is how a customer gets two parcels.`
        : !carrier ? "Choose a carrier first." : String(order.fields.payment) === "not_connected" ? "The order is awaiting payment, so nothing ships yet." : undefined,
    boundary: "carrier.label",
    boundaryTitle: "No carrier account is connected",
    boundaryNote: `The label is "${CAPABILITY_LABELS.ready_local}": it carries no carrier barcode and does not book a collection.`,
    confirmLabel: "Create the label locally",
    run: async () => {
      const body = bodyOf<OrderBody>(order, {});
      const saved = await context.mutate.patch(order.id, {
        fields: { ...order.fields, labelRef: reference, labelState: "ready_local", labelCreatedBy: context.actor, labelCreatedAt: iso(context), fulfilment: "packed" },
        body: { ...body, timeline: [...(body.timeline ?? []), { at: iso(context), label: "Label created", detail: `${reference} for ${carrier}, local only.` }] },
      }, { expectRevision: order.revision, event: `Label ${reference} created locally for ${order.title} (${carrier})` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Label created locally", `${reference} is on ${order.title}. Record the handover when the carrier collects.`);
    },
  });
}

export function ScanParcel({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const open = data.orders.filter((order) => ["unfulfilled", "picking", "packed"].includes(String(order.fields.fulfilment ?? order.status)));
  async function scan() {
    const value = code.trim().toUpperCase();
    if (!value) return;
    const order = data.orders.find((item) => item.title.toUpperCase() === value || String(item.fields.labelRef ?? "").toUpperCase() === value);
    setCode("");
    if (!order) { setResult({ tone: "danger", text: `${value} matches no order or label in this workspace.` }); return; }
    const scans = String(order.fields.scans ?? "").split(",").filter(Boolean);
    if (scans.includes(value)) { setResult({ tone: "warning", text: `${value} was already scanned for ${order.title}. The repeat was refused, not counted.` }); return; }
    if (String(order.fields.payment) === "not_connected") { setResult({ tone: "warning", text: `${order.title} is awaiting payment, so it cannot be packed.` }); return; }
    const stage = String(order.fields.fulfilment ?? order.status);
    const next = stage === "unfulfilled" ? "picking" : stage === "picking" ? "packed" : stage;
    const saved = await context.mutate.patch(order.id, { fields: { ...order.fields, scans: [...scans, value].join(","), fulfilment: next, lastScanAt: iso(context), lastScanBy: context.actor } }, { expectRevision: order.revision, event: `${value} scanned for ${order.title}: ${stage} → ${next}` });
    if (!saved) { setResult({ tone: "danger", text: "The order changed elsewhere; scan again." }); return; }
    setResult({ tone: "success", text: `${order.title} scanned: ${stage} → ${next}.` });
  }
  return (
    <Stack gap={4}>
      <form className="ds-stack ds-gap-3" onSubmit={(event) => { event.preventDefault(); void scan(); }}>
        <Field label="Scan or type an order or label reference" hint="A scanner that types and presses Enter works here.">
          <TextInput autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder={open[0]?.title ?? "ORD-000"} />
        </Field>
        <Row gap={2}><Button type="submit" variant="primary" disabled={!code.trim()}>Record scan</Button></Row>
      </form>
      {result && <Notice tone={result.tone} title={result.tone === "success" ? "Scanned" : "Not counted"}>{result.text}</Notice>}
      <Card title="Waiting to be scanned" flush>
        <DataGrid rows={open} rowId={(row) => row.id} label="Orders waiting to be scanned" filterable={false}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => row.title },
            { key: "stage", header: "Stage", cell: (row) => <Pill>{String(row.fields.fulfilment ?? row.status)}</Pill> },
            { key: "scans", header: "Scans", align: "end", cell: (row) => String(String(row.fields.scans ?? "").split(",").filter(Boolean).length) },
          ]} />
      </Card>
    </Stack>
  );
}

/* ---------------- COMMERCE-011 schedule, pause ---------------- */

export function ScheduleOffer({ context, close }: { context: ScreenContext; close: () => void }) {
  const promotion = useRecord(context.selectedId);
  if (!promotion) return <Empty title="Select an offer" />;
  return <ScheduleOfferForm key={promotion.id} context={context} close={close} promotion={promotion} />;
}

function ScheduleOfferForm({ context, close, promotion }: { context: ScreenContext; close: () => void; promotion: Rec }) {
  const day = (value: string | undefined, fallback: Date) => (value ? new Date(value) : fallback).toISOString().slice(0, 10);
  const [start, setStart] = useState(day(promotion.startAt, new Date(context.now.getTime() + 86_400_000)));
  const [end, setEnd] = useState(day(promotion.endAt, new Date(context.now.getTime() + 15 * 86_400_000)));
  const startAt = new Date(`${start}T00:00:00`);
  const endAt = new Date(`${end}T23:59:00`);
  const problem = endAt <= startAt ? "The end must be after the start."
    : endAt <= context.now ? "That window has already ended."
      : promotion.status === "ended" ? "A finished offer cannot be rescheduled; duplicate it instead." : undefined;
  return (
    <form
      id="schedule-offer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (problem) return;
        const status = startAt <= context.now ? "active" : "scheduled";
        const saved = await context.mutate.patch(promotion.id, { status, startAt: startAt.toISOString(), endAt: endAt.toISOString(), fields: { ...promotion.fields, scheduledBy: context.actor, scheduledAt: iso(context) } }, { expectRevision: promotion.revision, event: `${promotion.title} scheduled ${start} to ${end} by ${context.actor}` });
        if (!saved) return;
        context.toast("Scheduled", status === "active" ? `${promotion.title} starts now and ends ${context.date(endAt)}.` : `${promotion.title} starts ${context.date(startAt)} and ends ${context.date(endAt)}.`);
        close();
      }}
    >
      <Row gap={3} wrap>
        <Field label="Starts"><TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Ends" error={problem}><TextInput type="date" value={end} invalid={Boolean(problem)} onChange={(event) => setEnd(event.target.value)} /></Field>
      </Row>
      <FactGrid columns={2} items={[{ label: "Offer", value: promotion.title }, { label: "State now", value: promotion.status }, { label: "Margin floor", value: `${(Number(promotion.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%` }]} />
      <Notice tone="info">The basket applies an offer only inside its window, and the margin floor still holds for every line.</Notice>
    </form>
  );
}

export async function pauseOffer(context: ScreenContext) {
  const promotion = await load(context);
  if (!promotion) return;
  confirm(context, {
    title: `Pause ${promotion.title}`,
    tone: "danger",
    consequence: "The offer stops applying at the storefront checkout immediately. Orders already placed keep the discount they were given.",
    facts: [{ label: "State now", value: promotion.status }, { label: "Uses so far", value: String(promotion.fields.uses ?? 0) }],
    blocked: !["active", "scheduled"].includes(promotion.status) ? `${promotion.title} is ${promotion.status}, so there is nothing to pause.` : undefined,
    confirmLabel: "Pause offer",
    run: async () => {
      const saved = await context.mutate.patch(promotion.id, { status: "paused", fields: { ...promotion.fields, pausedBy: context.actor, pausedAt: iso(context) } }, { expectRevision: promotion.revision, event: `Offer ${promotion.title} paused by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Paused", `${promotion.title} no longer applies at checkout.`);
    },
  });
}

/* ---------------- COMMERCE-012 compare, segment, export ---------------- */

export function PeriodCompare({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const [days, setDays] = useState(30);
  const end = context.now.getTime();
  const window = (from: number, to: number) => {
    const orders = data.orders.filter((order) => order.status !== "cancelled" && order.at && new Date(order.at).getTime() > from && new Date(order.at).getTime() <= to);
    const returns = data.returns.filter((item) => item.status === "completed" && item.at && new Date(item.at).getTime() > from && new Date(item.at).getTime() <= to);
    const gross = orders.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
    const refunded = returns.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
    const units = orders.flatMap((order) => bodyOf<OrderBody>(order, {}).lines ?? []).reduce((sum, line) => sum + line.quantity, 0);
    return { orders: orders.length, gross, refunded, net: gross - refunded, units, returns: returns.length };
  };
  const span = days * 86_400_000;
  const now = window(end - span, end);
  const before = window(end - 2 * span, end - span);
  const change = (a: number, b: number) => (b === 0 ? (a === 0 ? "No change" : "New") : `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(1)}%`);
  const rows = [
    { label: "Orders", a: String(now.orders), b: String(before.orders), d: change(now.orders, before.orders) },
    { label: "Units", a: String(now.units), b: String(before.units), d: change(now.units, before.units) },
    { label: "Order value", a: context.money(now.gross), b: context.money(before.gross), d: change(now.gross, before.gross) },
    { label: "Refunded (completed returns)", a: context.money(now.refunded), b: context.money(before.refunded), d: change(now.refunded, before.refunded) },
    { label: "Net of refunds", a: context.money(now.net), b: context.money(before.net), d: change(now.net, before.net) },
  ];
  return (
    <Stack gap={4}>
      <Field label="Period length"><Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((value) => <option key={value} value={value}>{value} days</option>)}</Select></Field>
      <DataGrid rows={rows} rowId={(row) => row.label} label="Period comparison" filterable={false}
        columns={[
          { key: "label", header: "Measure", primary: true, cell: (row) => row.label },
          { key: "a", header: `Last ${days} days`, align: "end", cell: (row) => <span className="ds-num">{row.a}</span> },
          { key: "b", header: `The ${days} before`, align: "end", cell: (row) => <span className="ds-num">{row.b}</span> },
          { key: "d", header: "Change", align: "end", cell: (row) => <span className="ds-num">{row.d}</span> },
        ]} />
      <Notice tone="info" title="What is included">Cancelled orders are excluded. Refunds count completed returns only; requested or approved returns have not moved money and are left out.</Notice>
    </Stack>
  );
}

export function CustomerSegments({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const live = data.orders.filter((order) => order.status !== "cancelled");
  const segments = [...new Set(data.contacts.map((contact) => String(contact.fields.segment ?? "unknown")))];
  const rows = segments.map((segment) => {
    const members = data.contacts.filter((contact) => String(contact.fields.segment ?? "unknown") === segment);
    const orders = live.filter((order) => members.some((contact) => contact.id === String(order.fields.contactId)));
    const value = orders.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
    const buyers = new Set(orders.map((order) => String(order.fields.contactId))).size;
    return { segment, members: members.length, buyers, orders: orders.length, value, average: orders.length ? Math.round(value / orders.length) : 0 };
  }).sort((a, b) => b.value - a.value);
  const guest = live.filter((order) => !data.contacts.some((contact) => contact.id === String(order.fields.contactId)));
  return (
    <Stack gap={4}>
      <DataGrid rows={rows} rowId={(row) => row.segment} label="Customer segments" filterable={false}
        columns={[
          { key: "segment", header: "Segment", primary: true, cell: (row) => <Pill>{row.segment}</Pill> },
          { key: "members", header: "Contacts", align: "end", cell: (row) => String(row.members) },
          { key: "buyers", header: "With an order", align: "end", cell: (row) => String(row.buyers) },
          { key: "orders", header: "Orders", align: "end", cell: (row) => String(row.orders) },
          { key: "value", header: "Order value", align: "end", cell: (row) => context.money(row.value), sortValue: (row) => row.value },
          { key: "average", header: "Average order", align: "end", cell: (row) => (row.orders ? context.money(row.average) : <span className="ds-subtle">No orders</span>) },
        ]} />
      <Notice tone="info" title="Segments come from the contact record">{guest.length} order{guest.length === 1 ? "" : "s"} came from guest checkout with no contact, so {guest.length === 1 ? "it belongs" : "they belong"} to no segment and {guest.length === 1 ? "is" : "are"} not counted above.</Notice>
    </Stack>
  );
}

export async function exportAnalytics(context: ScreenContext) {
  const [orders, contacts, returns] = await Promise.all([listByCollection(context.org.id, "orders"), listByCollection(context.org.id, "contacts"), listByCollection(context.org.id, "returns")]);
  const live = orders.filter((order) => order.status !== "cancelled");
  const count = downloadCsv(`${context.org.slug}-commerce-sales.csv`,
    ["order", "placed", "segment", "net_minor", "tax_minor", "gross_minor", "refunded_minor", "refund_included", "currency"],
    live.map((order) => {
      const contact = contacts.find((item) => item.id === String(order.fields.contactId));
      const totals = orderTotals(order, contact, context.org.jurisdiction);
      const refunded = returns.filter((item) => String(item.fields.orderId) === order.id && item.status === "completed").reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
      return [order.title, order.at, String(contact?.fields.segment ?? "guest"), totals.netMinor, totals.taxMinor, totals.grossMinor, refunded, refunded ? "completed returns only" : "none", context.org.currency];
    }));
  await context.mutate.log(`Commerce sales exported as CSV (${count} orders, cancellations excluded)`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} orders downloaded. Cancelled orders are excluded and refunds count completed returns only.`);
}
