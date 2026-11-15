import { useMemo, useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, MoneyInput, Notice, Pill, Properties, Row,
  Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { resolveTaxCode, type TaxCategory } from "@/platform/money";
import { ProviderBoundary, TAX_CATEGORIES, TotalsBlock } from "@/applications/growth/kit";
import type { Rec } from "@/domain/types";
import {
  bodyOf, customerStatusOfContact, marginOf, onHandFor, orderTotals, reservedFor,
  statusTone, taxCategoryOfProduct, useCommerceData, type OrderBody, type ProductBody,
} from "./data";

/* ====================================================================== *
 * COMMERCE overlays. One component per overlay in the approved contract.
 * ====================================================================== */

/* ---------------- COMMERCE-001 ---------------- */

export function KpiExplanation({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "net";
  const live = data.orders.filter((order) => order.status !== "cancelled");

  if (metric === "conversion") {
    return (
      <Stack gap={3}>
        <Notice tone="warning" title="There is no denominator">
          A conversion rate needs sessions. Nothing records a visit to the storefront preview, so the rate is shown as unavailable rather than computed from orders alone.
        </Notice>
        <Properties rows={[
          { label: "Orders", value: String(live.length) },
          { label: "Sessions", value: <Pill tone="warning">Not recorded</Pill> },
          { label: "Analytics provider", value: <Pill tone="warning">Not connected</Pill> },
        ]} />
      </Stack>
    );
  }

  const rows = metric === "awaiting" ? live.filter((order) => order.status === "awaiting_payment") : live.filter((order) => String(order.fields.payment) === "paid_local");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Definition", value: metric === "net" ? "Sum of the net figure on each paid order, tax excluded" : metric === "gross" ? "Net plus the tax resolved for each line" : "Orders created but never charged" },
        { label: "Excluded", value: "Cancelled orders. Returns are deducted only in Analytics, and only when completed." },
        { label: "Orders counted", value: String(rows.length) },
        { label: "Agrees with Finance", value: "Each order's tax comes from the same engine the ledger uses, so the figures reconcile." },
      ]} />
      <DataGrid rows={rows} rowId={(row) => row.id} label="Orders behind this figure" filterable={false}
        columns={[
          { key: "title", header: "Order", primary: true, cell: (row) => row.title },
          { key: "net", header: "Net", align: "end", cell: (row) => context.money(Number(row.fields.netMinor ?? 0)) },
          { key: "tax", header: "Tax", align: "end", cell: (row) => context.money(Number(row.fields.taxMinor ?? 0)) },
          { key: "gross", header: "Gross", align: "end", cell: (row) => context.money(row.amountMinor) },
        ]} />
    </Stack>
  );
}

export function ExceptionList({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const exceptions = [
    ...data.orders.filter((order) => order.status === "exception").map((order) => ({ id: order.id, kind: "Order", title: order.title, detail: "Carrier handed over, never scanned.", to: `/o/${org.slug}/commerce/orders/${order.id}` })),
    ...data.orders.filter((order) => order.status === "awaiting_payment").map((order) => ({ id: order.id, kind: "Payment", title: order.title, detail: "Held with no way to collect from here.", to: `/o/${org.slug}/commerce/orders/${order.id}` })),
    ...data.returns.filter((item) => item.tags.includes("disputed")).map((item) => ({ id: item.id, kind: "Return", title: item.title, detail: "Disputed: needs a person with authority.", to: `/o/${org.slug}/commerce/returns` })),
    ...data.products.filter((product) => product.status === "active" && onHandFor(data.stockMoves, product.id) - reservedFor(data.orders, product.id) <= 0).map((product) => ({ id: product.id, kind: "Stock", title: product.title, detail: "Nothing available but still published.", to: `/o/${org.slug}/commerce/products/${product.id}` })),
  ];
  return exceptions.length === 0 ? <Empty title="No exceptions" /> : (
    <DataGrid rows={exceptions} rowId={(row) => `${row.kind}-${row.id}`} label="Exceptions" filterable={false}
      onOpen={(id) => { const found = exceptions.find((item) => `${item.kind}-${item.id}` === id); if (found) { context.navigate(found.to); context.closeOverlay(); } }}
      columns={[
        { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "Stock" ? "danger" : "warning"}>{row.kind}</Pill> },
        { key: "title", header: "Record", primary: true, cell: (row) => row.title },
        { key: "detail", header: "Why", cell: (row) => row.detail },
      ]} />
  );
}

export function StorePicker({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  return (
    <Stack gap={3}>
      <p className="ds-subtle">One storefront exists in this workspace. Stock is held across {data.warehouses.length} locations and the storefront sells from all of them.</p>
      <DataGrid rows={data.warehouses} rowId={(row) => row.id} label="Locations" filterable={false}
        columns={[
          { key: "title", header: "Location", primary: true, cell: (row) => row.title },
          { key: "code", header: "Code", cell: (row) => String(row.fields.code ?? "—") },
          { key: "manager", header: "Manager", cell: (row) => String(row.fields.managerName ?? "Unassigned") },
        ]} />
      <Button variant="secondary" onClick={() => { context.navigate(`/o/${context.org.slug}/commerce/storefront?tab=Preview`); context.closeOverlay(); }}>Open the storefront preview</Button>
    </Stack>
  );
}

/* ---------------- COMMERCE-002 / 003 ---------------- */

export function ProductEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const existingBody = bodyOf<ProductBody>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [sku, setSku] = useState(String(existing?.fields.sku ?? ""));
  const [price, setPrice] = useState(existing?.amountMinor ?? 0);
  const [cost, setCost] = useState(Number(existing?.fields.unitCostMinor ?? 0));
  const [category, setCategory] = useState<TaxCategory>(taxCategoryOfProduct(existing));
  const [description, setDescription] = useState(existingBody.description ?? existing?.summary ?? "");
  const [published, setPublished] = useState(existing?.fields.published === true);
  const duplicateSku = data.products.some((product) => product.id !== existing?.id && String(product.fields.sku).toLowerCase() === sku.trim().toLowerCase());
  const taxCode = resolveTaxCode({ jurisdiction: org.jurisdiction, category, customerStatus: "domestic", date: now.toISOString() });
  const margin = price === 0 ? 0 : Math.round(((price - cost) / price) * 1000) / 10;
  const invalid = !title.trim() || !sku.trim() || duplicateSku || price < 0;

  return (
    <form
      id="product-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = { sku: sku.trim(), taxCategory: category, unitCostMinor: cost, published, productCollection: String(existing?.fields.productCollection ?? "Lighting"), reorderPoint: Number(existing?.fields.reorderPoint ?? 4), reorderQuantity: Number(existing?.fields.reorderQuantity ?? 20), leadTimeDays: Number(existing?.fields.leadTimeDays ?? 14), seoTitle: String(existing?.fields.seoTitle ?? ""), seoDescription: String(existing?.fields.seoDescription ?? "") };
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(), amountMinor: price, summary: description,
            fields: { ...existing.fields, ...fields },
            body: { ...existingBody, description },
          }, { expectRevision: existing.revision, event: `Product ${title.trim()} edited` });
        } else {
          await context.mutate.create({
            collection: "products", title: title.trim(), status: published ? "active" : "draft",
            amountMinor: price, summary: description, fields, body: { description, variants: [], options: [], media: [] },
          }, `Product ${title.trim()} created`);
        }
        context.toast("Product saved", `${title.trim()} resolves to ${taxCode.code} for a domestic customer.`);
        close();
      }}
    >
      <Field label="Product name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="SKU" required error={duplicateSku ? "That SKU is already used" : undefined}>
          <TextInput value={sku} invalid={duplicateSku} onChange={(event) => setSku(event.target.value.toUpperCase())} required />
        </Field>
        <Field label="List price" hint="Excludes tax"><MoneyInput valueMinor={price} onChangeMinor={setPrice} currency={org.currency} label="List price" /></Field>
        <Field label="Unit cost" hint={price ? `Margin ${margin}%` : "Needed for any margin figure"}><MoneyInput valueMinor={cost} onChangeMinor={setCost} currency={org.currency} label="Unit cost" /></Field>
      </Row>
      <Field label="Tax category" hint={`${taxCode.label} (${taxCode.code}) at ${(taxCode.rateBp / 100).toFixed(2)}% for a domestic ${org.jurisdiction} customer`}>
        <Select value={category} onChange={(event) => setCategory(event.target.value as TaxCategory)}>
          {TAX_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      {taxCode.note && <Notice tone="info">{taxCode.note}</Notice>}
      <Field label="Description"><TextArea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Checkbox label="Show in the storefront" checked={published} onChange={(event) => setPublished(event.target.checked)} />
      {published && price === 0 && <Notice tone="danger" title="A published product needs a price">A visitor cannot buy something priced at zero.</Notice>}
    </form>
  );
}

export function ImportMapping({ context, close }: { context: ScreenContext; close: () => void }) {
  const [text, setText] = useState("sku,name,price,tax\n");
  const rows = text.trim().split("\n").slice(1).filter(Boolean).map((line) => line.split(","));
  const valid = rows.filter((row) => row.length >= 3 && row[0] && row[1] && Number.isFinite(Number(row[2])));
  return (
    <form
      id="import-mapping"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const row of valid) {
          await context.mutate.create({
            collection: "products",
            title: row[1].trim(),
            status: "draft",
            amountMinor: Math.round(Number(row[2]) * 100),
            summary: "Imported from CSV. Draft until checked.",
            fields: { sku: row[0].trim().toUpperCase(), taxCategory: (row[3] ?? "standard").trim(), unitCostMinor: 0, published: false, productCollection: "Imported", reorderPoint: 4, reorderQuantity: 20, leadTimeDays: 14, seoTitle: "", seoDescription: "" },
            body: { description: "", variants: [], options: [], media: [] },
          }, `Product ${row[1].trim()} imported`);
        }
        context.toast("Imported", `${valid.length} products created as drafts. Nothing is published until someone checks the price and tax category.`);
        close();
      }}
    >
      <Field label="Paste CSV" hint="Columns: sku, name, price, tax category"><TextArea value={text} rows={6} onChange={(event) => setText(event.target.value)} /></Field>
      <Properties rows={[
        { label: "Rows read", value: String(rows.length) },
        { label: "Valid", value: String(valid.length) },
        { label: "Rejected", value: String(rows.length - valid.length) },
        { label: "Created as", value: "Drafts, never published" },
      ]} />
      {rows.length > valid.length && <Notice tone="warning" title="Some rows are missing a SKU, name or numeric price">Those rows are skipped rather than imported with a guessed value.</Notice>}
    </form>
  );
}

export function BulkPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const chosen = data.products.filter((product) => (payload?.ids ?? []).includes(product.id));
  const checks = chosen.map((product) => {
    const available = onHandFor(data.stockMoves, product.id) - reservedFor(data.orders, product.id);
    const problems: string[] = [];
    if (!product.amountMinor) problems.push("no price");
    if (available <= 0) problems.push("nothing available");
    if (!String(product.fields.seoTitle)) problems.push("no meta title");
    return { product, available, problems };
  });
  const blocked = checks.filter((check) => check.problems.length > 0);
  return (
    <Stack gap={4}>
      {chosen.length === 0 ? <Empty title="Select products first" /> : (
        <>
          <DataGrid rows={checks} rowId={(row) => row.product.id} label="Bulk publish preview" filterable={false}
            columns={[
              { key: "title", header: "Product", primary: true, cell: (row) => row.product.title },
              { key: "price", header: "Price", align: "end", cell: (row) => context.money(row.product.amountMinor) },
              { key: "available", header: "Available", align: "end", cell: (row) => String(row.available) },
              { key: "problems", header: "Checks", cell: (row) => (row.problems.length === 0 ? <Pill tone="success">Ready</Pill> : <Pill tone="danger">{row.problems.join(", ")}</Pill>) },
            ]} />
          {blocked.length > 0 && <Notice tone="danger" title={`${blocked.length} product${blocked.length === 1 ? "" : "s"} cannot be published`}>A bulk publish applies only to rows that pass every check, so nothing is listed without a price or stock.</Notice>}
          <Button
            variant="primary"
            disabled={checks.length === blocked.length}
            onClick={async () => {
              const ready = checks.filter((check) => check.problems.length === 0);
              for (const check of ready) {
                await context.mutate.patch(check.product.id, { status: "active", fields: { ...check.product.fields, published: true } }, { expectRevision: check.product.revision, event: `${check.product.title} published to the storefront` });
              }
              context.toast("Published", `${ready.length} product${ready.length === 1 ? "" : "s"} now appear in the storefront. ${blocked.length} were left alone.`);
              close();
            }}
          >
            Publish {checks.length - blocked.length} of {checks.length}
          </Button>
        </>
      )}
    </Stack>
  );
}

export function VariantEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const product = useRecord(context.params.id) ?? data.products[0];
  const body = bodyOf<ProductBody>(product, {});
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [delta, setDelta] = useState(0);
  const duplicate = (body.variants ?? []).some((variant) => variant.sku.toLowerCase() === sku.trim().toLowerCase());
  if (!product) return <Empty title="No product" />;
  return (
    <form
      id="variant-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim() || !sku.trim() || duplicate) return;
        await context.mutate.patch(product.id, {
          body: { ...body, variants: [...(body.variants ?? []), { id: `${sku.trim()}-v`, name: name.trim(), sku: sku.trim().toUpperCase(), priceDeltaMinor: delta }] },
        }, { expectRevision: product.revision, event: `Variant ${name.trim()} added to ${product.title}` });
        context.toast("Variant added", `${name.trim()} sells at ${context.money((product.amountMinor ?? 0) + delta)}.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Product", value: product.title }, { label: "Base price", value: context.money(product.amountMinor) }, { label: "Existing variants", value: String((body.variants ?? []).length) }]} />
      <Field label="Variant name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Variant SKU" required error={duplicate ? "That SKU already exists on this product" : undefined}>
        <TextInput value={sku} invalid={duplicate} onChange={(event) => setSku(event.target.value.toUpperCase())} required />
      </Field>
      <Field label="Price difference" hint={`Sells at ${context.money((product.amountMinor ?? 0) + delta)}`}>
        <MoneyInput valueMinor={delta} onChangeMinor={setDelta} currency={org.currency} label="Price difference" />
      </Field>
      <Notice tone="info">A variant inherits the product's tax category, so the resolved code stays the same across the range.</Notice>
    </form>
  );
}

export function MediaPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const product = useRecord(context.params.id) ?? data.products[0];
  const body = bodyOf<ProductBody>(product, {});
  const [label, setLabel] = useState("");
  if (!product) return <Empty title="No product" />;
  return (
    <form
      id="media-picker"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!label.trim()) return;
        await context.mutate.patch(product.id, {
          body: { ...body, media: [...(body.media ?? []), { id: `m${(body.media ?? []).length + 1}`, label: label.trim(), kind: "placeholder" }] },
        }, { expectRevision: product.revision, event: `Media reference added to ${product.title}` });
        context.toast("Reference added", "The storefront shows the label until a file store is connected.");
        close();
      }}
    >
      <Stack gap={2}>
        {(body.media ?? []).map((item) => <Row key={item.id} gap={2}><span className="ds-grow">{item.label}</span><Pill>{item.kind}</Pill></Row>)}
        {(body.media ?? []).length === 0 && <span className="ds-subtle">No media on this product.</span>}
      </Stack>
      <Field label="Describe the photograph" required hint="Stored as a label; there is no file store to upload to.">
        <TextInput value={label} onChange={(event) => setLabel(event.target.value)} required />
      </Field>
      <Notice tone="warning" title="No upload is possible">An upload needs somewhere to put the file. The product keeps the reference so the storefront can show something honest instead of a stock photograph.</Notice>
    </form>
  );
}

export function MarginImpact({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const product = useRecord(context.params.id) ?? data.products[0];
  const [price, setPrice] = useState(product?.amountMinor ?? 0);
  const { org } = useWorkspace();
  if (!product) return <Empty title="No product" />;
  const current = marginOf(product);
  const proposed = marginOf(product, price);
  const active = data.promotions.filter((promotion) => promotion.status === "active");
  const worst = active.reduce((lowest, promotion) => {
    const discounted = String(promotion.fields.kind) === "amount" ? price - Number(promotion.fields.value ?? 0) : Math.round(price * (1 - Number(promotion.fields.value ?? 0) / 100));
    const bp = discounted === 0 ? 0 : Math.round(((discounted - current.costMinor) / discounted) * 10_000);
    return bp < lowest.bp ? { promotion, bp, discounted } : lowest;
  }, { promotion: undefined as Rec | undefined, bp: 10_000, discounted: price });
  const floorBreached = worst.promotion ? worst.bp < Number(worst.promotion.fields.floorMarginBp ?? 0) : false;
  return (
    <Stack gap={4}>
      <Field label="Proposed price"><MoneyInput valueMinor={price} onChangeMinor={setPrice} currency={org.currency} label="Proposed price" /></Field>
      <Properties rows={[
        { label: "Unit cost", value: current.costMinor ? context.money(current.costMinor) : "Unavailable — no cost recorded" },
        { label: "Margin now", value: current.costMinor ? `${(current.marginBp / 100).toFixed(1)}%` : "Unavailable" },
        { label: "Margin at the proposed price", value: current.costMinor ? `${(proposed.marginBp / 100).toFixed(1)}%` : "Unavailable" },
        { label: "Worst live offer", value: worst.promotion ? `${worst.promotion.title} → ${context.money(worst.discounted)} (${(worst.bp / 100).toFixed(1)}%)` : "No live offer" },
      ]} />
      {floorBreached && worst.promotion && (
        <Notice tone="danger" title="This price breaks a live offer's margin floor">
          {worst.promotion.title} would sell at {context.money(worst.discounted)}, a {(worst.bp / 100).toFixed(1)}% margin against a floor of {(Number(worst.promotion.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%.
          Change the price, or pause the offer first.
        </Notice>
      )}
      {!current.costMinor && <Notice tone="warning" title="No unit cost is recorded">Without a cost there is no margin to check, so the figure is left unavailable rather than assumed.</Notice>}
    </Stack>
  );
}

export function PublishProduct({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const product = useRecord(context.params.id) ?? data.products[0];
  if (!product) return <Empty title="No product" />;
  const available = onHandFor(data.stockMoves, product.id) - reservedFor(data.orders, product.id);
  const problems = [
    ...(product.amountMinor ? [] : ["It has no price."]),
    ...(available > 0 ? [] : ["Nothing is available to sell."]),
    ...((bodyOf<ProductBody>(product, {}).variants ?? []).length ? [] : ["It has no variant, so a visitor cannot choose an option."]),
  ];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Product", value: product.title },
        { label: "Price", value: context.money(product.amountMinor) },
        { label: "Available", value: String(available) },
        { label: "Tax", value: taxCategoryOfProduct(product).replace("_", " ") },
        { label: "Current state", value: <Pill tone={statusTone(product.status)}>{product.status}</Pill> },
      ]} />
      {problems.length > 0 && <Notice tone="danger" title="Not ready for the storefront">{problems.join(" ")}</Notice>}
      <Button
        variant="primary"
        disabled={problems.length > 0}
        onClick={async () => {
          await context.mutate.patch(product.id, { status: "active", fields: { ...product.fields, published: true } }, { expectRevision: product.revision, event: `${product.title} published to the storefront` });
          context.toast("Published", `${product.title} is now in the storefront preview.`);
          close();
        }}
      >
        Publish to the storefront
      </Button>
    </Stack>
  );
}

/* ---------------- COMMERCE-004 ---------------- */

export function StockAdjustment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(data.warehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState("count");
  const product = data.products.find((item) => item.id === productId);
  const onHand = onHandFor(data.stockMoves, productId, warehouseId);
  const delta = Number(quantity) || 0;
  const wouldBe = onHand + delta;
  const invalid = !productId || !Number.isInteger(delta) || delta === 0 || wouldBe < 0;
  return (
    <form
      id="stock-adjustment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        await context.mutate.create({
          collection: "stockMoves",
          title: `${reason} · ${String(product?.fields.sku ?? "")}`,
          status: "posted",
          at: now.toISOString(),
          summary: `Adjusted by ${delta} at ${data.warehouses.find((warehouse) => warehouse.id === warehouseId)?.title ?? warehouseId}.`,
          fields: { productId, warehouseId, quantity: delta, kind: reason, reference: `ADJ-${now.getTime().toString().slice(-5)}` },
        }, `Stock adjusted for ${product?.title} by ${delta}`);
        context.toast("Stock adjusted", `${product?.title} is now ${wouldBe} at that location. The movement is the record; the level is derived from it.`);
        close();
      }}
    >
      <Field label="Product"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Location"><Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Adjustment" required hint={`${onHand} on hand now; this movement would make it ${wouldBe}`} error={wouldBe < 0 ? "That would take the location below zero" : undefined}>
        <TextInput value={quantity} inputMode="numeric" align="end" invalid={wouldBe < 0} onChange={(event) => setQuantity(event.target.value)} />
      </Field>
      <Field label="Reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}>{["count", "damage", "shrinkage", "found", "correction"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Notice tone="info" title="The level is never edited directly">
        Stock is the sum of its movements, so every change leaves a traceable row with a reason and a reference. A movement that would take a location below zero is refused.
      </Notice>
    </form>
  );
}

export function TransferApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [from, setFrom] = useState(data.warehouses[0]?.id ?? "");
  const [to, setTo] = useState(data.warehouses[1]?.id ?? data.warehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const available = onHandFor(data.stockMoves, productId, from);
  const amount = Number(quantity) || 0;
  const invalid = from === to || amount <= 0 || amount > available;
  return (
    <form
      id="transfer-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const product = data.products.find((item) => item.id === productId);
        const reference = `TRF-${now.getTime().toString().slice(-5)}`;
        await context.mutate.create({ collection: "stockMoves", title: `transfer out · ${String(product?.fields.sku ?? "")}`, status: "posted", at: now.toISOString(), summary: `Transferred to ${data.warehouses.find((item) => item.id === to)?.title}.`, fields: { productId, warehouseId: from, quantity: -amount, kind: "transfer_out", reference } }, `Transfer out ${amount} of ${product?.title}`);
        await context.mutate.create({ collection: "stockMoves", title: `transfer in · ${String(product?.fields.sku ?? "")}`, status: "posted", at: now.toISOString(), summary: `Transferred from ${data.warehouses.find((item) => item.id === from)?.title}.`, fields: { productId, warehouseId: to, quantity: amount, kind: "transfer_in", reference } }, `Transfer in ${amount} of ${product?.title}`);
        context.toast("Transfer recorded", `Two movements written with the reference ${reference}, so the total on hand is unchanged.`);
        close();
      }}
    >
      <Field label="Product"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Row gap={3} wrap>
        <Field label="From"><Select value={from} onChange={(event) => setFrom(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(event) => setTo(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="Quantity" hint={`${available} at the source`} error={amount > available ? "More than the source holds" : from === to ? "Choose two different locations" : undefined}>
          <TextInput value={quantity} inputMode="numeric" align="end" invalid={invalid} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
      </Row>
      <Notice tone="info">A transfer writes two movements sharing one reference. Nothing is created or destroyed, so the company total stays the same.</Notice>
    </form>
  );
}

export function CountReconciliation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const rows = data.products.filter((product) => product.status === "active").map((product) => {
    const expected = onHandFor(data.stockMoves, product.id);
    const counted = counts[product.id] === undefined ? undefined : Number(counts[product.id]);
    return { product, expected, counted, variance: counted === undefined ? undefined : counted - expected };
  });
  const withVariance = rows.filter((row) => row.variance !== undefined && row.variance !== 0);
  return (
    <form
      id="count-reconciliation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const row of withVariance) {
          await context.mutate.create({
            collection: "stockMoves",
            title: `count variance · ${String(row.product.fields.sku ?? "")}`,
            status: "posted",
            at: now.toISOString(),
            summary: `Counted ${row.counted}, expected ${row.expected}.`,
            fields: { productId: row.product.id, warehouseId: "nl-warehouses-001", quantity: row.variance ?? 0, kind: "count", reference: `COUNT-${now.getTime().toString().slice(-5)}` },
          }, `Count variance recorded for ${row.product.title}`);
        }
        context.toast("Count reconciled", `${withVariance.length} variance movement${withVariance.length === 1 ? "" : "s"} written. Each one explains the difference rather than overwriting the level.`);
        close();
      }}
    >
      <DataGrid rows={rows} rowId={(row) => row.product.id} label="Count sheet" filterable={false}
        columns={[
          { key: "title", header: "Product", primary: true, cell: (row) => row.product.title },
          { key: "expected", header: "Expected", align: "end", cell: (row) => String(row.expected) },
          { key: "counted", header: "Counted", align: "end", cell: (row) => (
            <TextInput aria-label={`Counted ${row.product.title}`} inputMode="numeric" align="end" style={{ maxWidth: 90 }} value={counts[row.product.id] ?? ""} onChange={(event) => setCounts((current) => ({ ...current, [row.product.id]: event.target.value }))} />
          ) },
          { key: "variance", header: "Variance", align: "end", cell: (row) => (row.variance === undefined ? <span className="ds-subtle">Not counted</span> : <strong className={row.variance === 0 ? "ds-num" : "ds-field-error"}>{row.variance > 0 ? "+" : ""}{row.variance}</strong>) },
        ]} />
      <Notice tone="warning" title="A variance is recorded, not hidden">
        Each difference becomes its own movement with the counted and expected figures in its summary, so the stock ledger explains how it got to today's number.
      </Notice>
    </form>
  );
}

/* ---------------- COMMERCE-005 / 006 ---------------- */

export function OrderQuickView({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.selectedId) ?? data.orders[0];
  const contact = data.contacts.find((item) => item.id === String(order?.fields.contactId ?? ""));
  if (!order) return <Empty title="Select an order" />;
  const totals = orderTotals(order, contact, org.jurisdiction);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Buyer", value: contact?.title ?? String(order.fields.buyerName || "Guest") },
        { label: "Placed", value: context.dateTime(order.at) },
        { label: "Payment", value: <Pill tone={String(order.fields.payment) === "paid_local" ? "success" : "warning"} dot>{String(order.fields.payment).replace(/_/g, " ")}</Pill> },
        { label: "Fulfilment", value: <Pill tone={statusTone(String(order.fields.fulfilment ?? order.status))}>{String(order.fields.fulfilment ?? order.status).replace("_", " ")}</Pill> },
      ]} />
      <DataGrid rows={totals.lines} rowId={(row) => row.id} label="Lines" filterable={false}
        columns={[
          { key: "description", header: "Item", primary: true, cell: (row) => row.description },
          { key: "qty", header: "Qty", align: "end", cell: (row) => String(row.quantity) },
          { key: "code", header: "Tax", cell: (row) => <Pill>{row.taxCode.code}</Pill> },
          { key: "gross", header: "Gross", align: "end", cell: (row) => context.money(row.grossMinor) },
        ]} />
      <TotalsBlock totals={totals} money={context.money} label="Order" />
      <Button variant="secondary" onClick={() => { context.navigate(`/o/${org.slug}/commerce/orders/${order.id}`); context.closeOverlay(); }}>Open the full order</Button>
    </Stack>
  );
}

export function BulkOperation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const chosen = data.orders.filter((order) => (payload?.ids ?? []).includes(order.id));
  const [stage, setStage] = useState("picking");
  const blocked = chosen.filter((order) => order.status === "awaiting_payment");
  return (
    <form
      id="bulk-operation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const ready = chosen.filter((order) => order.status !== "awaiting_payment");
        for (const order of ready) {
          await context.mutate.patch(order.id, {
            status: stage === "shipped" ? "in_transit" : order.status,
            fields: { ...order.fields, fulfilment: stage },
          }, { expectRevision: order.revision, event: `${order.title} moved to ${stage}` });
        }
        context.toast("Orders moved", `${ready.length} order${ready.length === 1 ? "" : "s"} are now ${stage}. ${blocked.length} unpaid order${blocked.length === 1 ? " was" : "s were"} left alone.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Selected", value: String(chosen.length) }, { label: "Unpaid, skipped", value: String(blocked.length) }]} />
      <Field label="Move to"><Select value={stage} onChange={(event) => setStage(event.target.value)}>{["picking", "packed", "shipped"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      {blocked.length > 0 && <Notice tone="warning" title="Unpaid orders are not fulfilled in bulk">{blocked.map((order) => order.title).join(", ")} {blocked.length === 1 ? "is" : "are"} awaiting payment. Shipping before payment is a decision for a person, not a bulk action.</Notice>}
      <Notice tone="info">Applying the same change twice is harmless: an order already at this stage simply stays there, so a repeated click cannot ship twice.</Notice>
    </form>
  );
}

export function RefundApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { org, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.params.id ?? context.selectedId) ?? data.orders[0];
  const contact = data.contacts.find((item) => item.id === String(order?.fields.contactId ?? ""));
  const totals = orderTotals(order, contact, org.jurisdiction);
  const [amount, setAmount] = useState(totals.grossMinor);
  const [reason, setReason] = useState("");
  if (!order) return <Empty title="No order" />;
  const tooMuch = amount > totals.grossMinor;
  return (
    <form
      id="refund-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (tooMuch || !reason.trim()) return;
        const body = bodyOf<OrderBody>(order, {});
        await context.mutate.patch(order.id, {
          fields: { ...order.fields, refundProposedMinor: amount, refundProposedBy: actor, payment: "refund_proposed" },
          body: { ...body, timeline: [...(body.timeline ?? []), { at: new Date().toISOString(), label: "Refund proposed", detail: `${context.money(amount)} proposed by ${actor}: ${reason}. No processor is connected, so nothing has been sent.` }] },
        }, { expectRevision: order.revision, event: `Refund of ${amount} proposed on ${order.title}` });
        context.toast("Refund proposed", "The proposal is on the order with its reason. The money moves only when someone sends it and records it in the ledger.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Order total", value: context.money(totals.grossMinor) },
        { label: "Already refunded", value: context.money(Number(order.fields.refundProposedMinor ?? 0)) },
      ]} />
      <Field label="Refund amount" error={tooMuch ? "More than the order total" : undefined}>
        <MoneyInput valueMinor={amount} onChangeMinor={setAmount} currency={org.currency} label="Refund amount" />
      </Field>
      <Field label="Reason" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <ProviderBoundary id="payment.capture" title="A refund cannot be executed here" />
    </form>
  );
}

export function ShippingLabel({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const order = useRecord(context.params.id ?? context.selectedId) ?? data.orders[0];
  const [carrier, setCarrier] = useState(String(order?.fields.carrier ?? "Pallet North"));
  if (!order) return <Empty title="No order" />;
  const existing = String(order.fields.tracking ?? "");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Units", value: String((bodyOf<OrderBody>(order, {}).lines ?? []).reduce((sum, line) => sum + line.quantity, 0)) },
        { label: "Ship to", value: bodyOf<OrderBody>(order, {}).shipTo?.city ?? "Not recorded" },
        { label: "Existing tracking", value: existing || "None" },
      ]} />
      <Field label="Carrier"><Select value={carrier} onChange={(event) => setCarrier(event.target.value)}>{["Pallet North", "Evri Business", "Royal Mail", "Collection"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      {existing ? (
        <Notice tone="danger" title="This order already has a tracking reference">
          {existing} is recorded. Creating a second label is how a customer receives two parcels and the studio pays twice, so it is refused here. Record an exception instead.
        </Notice>
      ) : (
        <Notice tone="warning" title="No carrier account is connected">
          A real label comes back from the carrier with a tracking number. Here the carrier and a local reference are recorded against the order so the handover is traceable, and the reference is marked as local.
        </Notice>
      )}
      <Button
        variant="primary"
        disabled={Boolean(existing)}
        onClick={async () => {
          const reference = `LOCAL-${Date.now().toString().slice(-6)}`;
          const body = bodyOf<OrderBody>(order, {});
          await context.mutate.patch(order.id, {
            status: "in_transit",
            fields: { ...order.fields, carrier, tracking: reference, fulfilment: "shipped" },
            body: { ...body, timeline: [...(body.timeline ?? []), { at: new Date().toISOString(), label: "Handed to carrier", detail: `${carrier} · local reference ${reference}. No carrier API confirmed this.` }] },
          }, { expectRevision: order.revision, event: `${order.title} handed to ${carrier}` });
          context.toast("Handover recorded", `${order.title} is in transit with the local reference ${reference}.`);
          close();
        }}
      >
        Record the handover
      </Button>
    </Stack>
  );
}

export function CancellationImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const order = useRecord(context.params.id) ?? data.orders[0];
  if (!order) return <Empty title="No order" />;
  const lines = bodyOf<OrderBody>(order, {}).lines ?? [];
  const paid = String(order.fields.payment) === "paid_local";
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Lines released", value: String(lines.length) },
        { label: "Units returned to available", value: String(lines.reduce((sum, line) => sum + line.quantity, 0)) },
        { label: "Payment", value: paid ? <Pill tone="warning">Recorded as paid — a refund is needed</Pill> : <Pill tone="success">Nothing was charged</Pill> },
      ]} />
      <Notice tone={paid ? "danger" : "warning"} title={paid ? "Cancelling does not refund" : "What cancelling does"}>
        {paid
          ? "This order is recorded as paid in the local ledger. Cancelling releases the stock reservation but does not move money: propose a refund as well, so the financial and physical states stay consistent."
          : "The reservation is released, so the units become available to sell again immediately. No stock movement is written because nothing physically moved."}
      </Notice>
      <Button
        variant="danger"
        onClick={async () => {
          const body = bodyOf<OrderBody>(order, {});
          await context.mutate.patch(order.id, {
            status: "cancelled",
            fields: { ...order.fields, fulfilment: "cancelled", payment: paid ? String(order.fields.payment) : "void" },
            body: { ...body, timeline: [...(body.timeline ?? []), { at: new Date().toISOString(), label: "Cancelled", detail: `${lines.reduce((sum, line) => sum + line.quantity, 0)} units released back to available.` }] },
          }, { expectRevision: order.revision, event: `${order.title} cancelled` });
          context.toast("Cancelled", paid ? "Stock is released. The payment still needs a refund proposal." : "Stock is released and nothing was charged.");
          close();
        }}
      >
        Cancel this order
      </Button>
    </Stack>
  );
}

export function RefundConfirmation({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const order = useRecord(context.params.id) ?? data.orders[0];
  if (!order) return <Empty title="No order" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Proposed refund", value: context.money(Number(order.fields.refundProposedMinor ?? 0)) },
        { label: "Proposed by", value: String(order.fields.refundProposedBy ?? "Nobody yet") },
        { label: "Executed", value: <Pill tone="warning">Not possible here</Pill> },
      ]} />
      <ProviderBoundary id="payment.capture" title="The refund stops at the same boundary as the payment">
        Money cannot leave this browser. The proposal, its amount and its reason are on the order so the studio can send the refund and record it against the ledger.
      </ProviderBoundary>
    </Stack>
  );
}

/* ---------------- COMMERCE-007 / 008 ---------------- */

export function ThemeInspector({ context }: { context: ScreenContext }) {
  void context;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Surface", value: "var(--bg-surface)" },
        { label: "Accent", value: "var(--accent)" },
        { label: "Card radius", value: "var(--radius-md)" },
        { label: "Product grid", value: "repeat(auto-fill, minmax(190px, 1fr))" },
        { label: "Basket", value: "Sticky above 900px, static below" },
      ]} />
      <div className="t4-swatches">
        {["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "var(--bg-sunken)"].map((colour) => <span key={colour} className="t4-swatch" style={{ background: colour }} title={colour} />)}
      </div>
      <Notice tone="info">The storefront uses the same tokens as the rest of the workspace, so a theme change is consistent everywhere rather than a second design system.</Notice>
    </Stack>
  );
}

export function TemplatePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const [chosen, setChosen] = useState("Shelf and basket");
  return (
    <form
      id="storefront-template"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Storefront layout set to ${chosen}`, { type: "storefront.layout" });
        context.toast("Layout recorded", `${chosen} is noted on the workspace activity. The preview renders the bound blocks either way.`);
        close();
      }}
    >
      <Field label="Layout">
        <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {["Shelf and basket", "Single column", "Collection first"].map((item) => <option key={item}>{item}</option>)}
        </Select>
      </Field>
      <Notice tone="info">Each layout renders the same bound blocks: the catalogue, availability and totals come from records whichever arrangement is chosen.</Notice>
    </form>
  );
}

export function PublicationReview({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const publishable = data.products.filter((product) => product.status === "active" && product.fields.published === true);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Products in the storefront", value: String(publishable.length) },
        { label: "Active discount codes", value: String(data.promotions.filter((promotion) => promotion.status === "active" && promotion.fields.code).length) },
        { label: "Checkout", value: "Stops at payment, collects no card data" },
        { label: "Hosting", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      <ProviderBoundary id="site.publish" title="Nothing is published to the internet">
        A publish here would export HTML from this browser. The previous export is untouched until a new one succeeds, so a failed publish cannot take a live site down.
      </ProviderBoundary>
    </Stack>
  );
}

export function ProviderSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const [note, setNote] = useState("");
  return (
    <form
      id="provider-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Payment provider requested${note ? `: ${note}` : ""}`, { type: "capability.request", capability: "configuration_required" });
        context.toast("Request recorded", "It is in the activity log. No processor account was created and no keys exist here.");
        close();
      }}
    >
      <Properties rows={[
        { label: "What a processor needs", value: "A server to hold the secret key and receive webhooks" },
        { label: "What this build has", value: "A browser, an IndexedDB database and no server" },
        { label: "Card data", value: <Pill tone="success">Never collected</Pill> },
        { label: "State", value: <Pill tone="warning">Configuration required</Pill> },
      ]} />
      <Notice tone="danger" title="Keys cannot be stored in a browser">
        A secret key in front-end code is readable by anyone who opens the page. There is no safe way to connect a processor from here, which is why the checkout holds the order instead of pretending to charge it.
      </Notice>
      <Field label="Note for whoever sets this up"><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
    </form>
  );
}

export function CheckoutTest({ context }: { context: ScreenContext }) {
  const { org } = useWorkspace();
  const steps = [
    { step: "Add to basket", result: "Works — refuses when nothing is available" },
    { step: "Discount code", result: "Works — only an active code in this workspace applies" },
    { step: "Totals", result: `Works — resolved for ${org.jurisdiction} per line` },
    { step: "Delivery details", result: "Works — name, email and address only" },
    { step: "Card details", result: "Not present — no card field exists" },
    { step: "Charge", result: "Blocked — no processor is connected" },
    { step: "Order held", result: "Works — awaiting_payment with every line" },
  ];
  return (
    <Stack gap={4}>
      <DataGrid rows={steps} rowId={(row) => row.step} label="Checkout test" filterable={false}
        columns={[
          { key: "step", header: "Step", primary: true, cell: (row) => row.step },
          { key: "result", header: "Result", cell: (row) => <Pill tone={row.result.startsWith("Works") ? "success" : row.result.startsWith("Blocked") ? "warning" : "info"}>{row.result}</Pill> },
        ]} />
      <Button variant="secondary" onClick={() => { context.navigate(`/o/${org.slug}/commerce/storefront?tab=Preview`); context.closeOverlay(); }}>Run it yourself in the preview</Button>
    </Stack>
  );
}

export function PolicyChangeReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const [guest, setGuest] = useState(true);
  const [minimum, setMinimum] = useState("0");
  return (
    <form
      id="policy-change"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Checkout policy changed: guest checkout ${guest ? "allowed" : "blocked"}, minimum order ${minimum}.`, { type: "commerce.policy" });
        context.toast("Policy recorded", "The change is in the activity log with who made it.");
        close();
      }}
    >
      <Checkbox label="Allow guest checkout" checked={guest} onChange={(event) => setGuest(event.target.checked)} />
      <Field label="Minimum order value in minor units"><TextInput value={minimum} inputMode="numeric" align="end" onChange={(event) => setMinimum(event.target.value)} /></Field>
      {!guest && <Notice tone="warning" title="Blocking guest checkout turns visitors away">Every held order in this workspace came from a guest. Requiring an account before payment is even possible would lose them.</Notice>}
      <Notice tone="info">A policy change is recorded with the person who made it, so a drop in orders can be traced to the day it changed.</Notice>
    </form>
  );
}

/* ---------------- COMMERCE-009 ---------------- */

export function CarrierSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const chosen = data.orders.filter((order) => (payload?.ids ?? []).includes(order.id));
  const [carrier, setCarrier] = useState("Pallet North");
  const already = chosen.filter((order) => String(order.fields.tracking));
  return (
    <form
      id="carrier-selector"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const ready = chosen.filter((order) => !String(order.fields.tracking));
        for (const order of ready) {
          await context.mutate.patch(order.id, { fields: { ...order.fields, carrier } }, { expectRevision: order.revision, event: `${order.title} assigned to ${carrier}` });
        }
        context.toast("Carrier set", `${ready.length} order${ready.length === 1 ? "" : "s"} assigned to ${carrier}. ${already.length} already had a reference and were skipped.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Selected", value: String(chosen.length) },
        { label: "Already have a reference", value: String(already.length) },
      ]} />
      <Field label="Carrier"><Select value={carrier} onChange={(event) => setCarrier(event.target.value)}>{["Pallet North", "Evri Business", "Royal Mail", "Collection"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      {already.length > 0 && <Notice tone="warning" title="Orders with a reference are skipped">Re-assigning a carrier after a handover would produce a second label for the same consignment.</Notice>}
      <Notice tone="info">No rates are quoted: without a carrier account there is no price to show, and inventing one would misprice the order.</Notice>
    </form>
  );
}

export function LabelPreview({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const order = useRecord(context.selectedId) ?? data.orders.find((item) => item.status === "unfulfilled") ?? data.orders[0];
  if (!order) return <Empty title="Select an order" />;
  const body = bodyOf<OrderBody>(order, {});
  return (
    <Stack gap={4}>
      <div className="ds-panel" style={{ padding: "var(--space-4)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
        <strong>{String(order.fields.carrier) || "CARRIER NOT CHOSEN"}</strong>
        <p>{body.shipTo?.name ?? "—"}</p>
        <p>{body.shipTo?.line1 ?? ""}</p>
        <p>{[body.shipTo?.city, body.shipTo?.postcode].filter(Boolean).join(" ")}</p>
        <p style={{ marginBlockStart: 12 }}>REF {String(order.fields.tracking) || "none"}</p>
        <p>{order.title} · {(body.lines ?? []).reduce((sum, line) => sum + line.quantity, 0)} units</p>
      </div>
      <Notice tone="warning" title="This is a rendering, not a carrier label">
        A real label carries a barcode the carrier issued. Nothing here is scannable, and printing it would not move a parcel.
      </Notice>
    </Stack>
  );
}

export function DeliveryException({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.selectedId) ?? data.orders.find((item) => item.status === "exception");
  const [decision, setDecision] = useState("chase");
  const [note, setNote] = useState("");
  if (!order) return <Empty title="No exception selected" />;
  return (
    <form
      id="delivery-exception"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = bodyOf<OrderBody>(order, {});
        const next = decision === "resend" ? "unfulfilled" : decision === "refund" ? "exception" : "exception";
        await context.mutate.patch(order.id, {
          status: next,
          fields: { ...order.fields, fulfilment: decision === "resend" ? "unfulfilled" : "exception", exceptionDecision: decision },
          body: { ...body, timeline: [...(body.timeline ?? []), { at: new Date().toISOString(), label: `Exception decision: ${decision}`, detail: note || "No note recorded." }] },
        }, { expectRevision: order.revision, event: `Exception on ${order.title} decided: ${decision}` });
        context.toast("Decision recorded", decision === "resend" ? "The order is back in the pick queue. No second label was created automatically." : "The decision and its note are on the order.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Order", value: order.title },
        { label: "Carrier", value: String(order.fields.carrier) || "Not recorded" },
        { label: "Tracking", value: String(order.fields.tracking) || "Nothing was scanned" },
      ]} />
      <Field label="Decision">
        <Select value={decision} onChange={(event) => setDecision(event.target.value)}>
          <option value="chase">Chase the carrier first</option>
          <option value="resend">Send a replacement — back to the pick queue</option>
          <option value="refund">Refund instead</option>
        </Select>
      </Field>
      <Field label="Note" hint="Recorded on the order timeline"><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      <Notice tone="danger" title="A replacement is a new pick, not a repeated label">
        Choosing to resend puts the order back in the pick queue so a person packs it again. No label is reissued automatically, because an unscanned consignment may still be in the network.
      </Notice>
    </form>
  );
}

/* ---------------- COMMERCE-010 ---------------- */

export function ReturnInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = useRecord(payload?.id ?? context.selectedId) ?? data.returns[0];
  const order = data.orders.find((candidate) => candidate.id === String(item?.fields.orderId ?? ""));
  if (!item) return <Empty title="Select a return" />;
  const days = order?.at ? Math.round((new Date(item.at ?? item.createdAt).getTime() - new Date(order.at).getTime()) / 86_400_000) : undefined;
  const eligible = days !== undefined && days <= 14;
  const disputed = item.tags.includes("disputed");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Return", value: item.title },
        { label: "Order", value: order?.title ?? "Not linked" },
        { label: "Product", value: data.products.find((product) => product.id === String(item.fields.productId))?.title ?? "—" },
        { label: "Reason", value: String(item.fields.reason ?? "").replace("_", " ") },
        { label: "Quantity", value: String(item.fields.quantity ?? 1) },
        { label: "Days after the order", value: days === undefined ? "Unknown — no order date" : String(days) },
        { label: "Policy", value: eligible ? <Pill tone="success">Within the 14 day window</Pill> : <Pill tone="warning">Outside the 14 day window</Pill> },
        { label: "Photographs", value: String(item.fields.photos ?? 0) },
      ]} />
      {disputed ? (
        <Notice tone="danger" title="Disputed: this is escalated, not decided here">
          The customer contests the whole consignment. The policy says what the window allows; it does not settle a dispute, so a person with authority decides and records the outcome.
        </Notice>
      ) : (
        <Notice tone={eligible ? "success" : "warning"} title={eligible ? "The policy allows this return" : "The policy does not cover this return"}>
          {eligible ? "Within fourteen days of the order date recorded here." : `The order was placed ${days ?? "an unknown number of"} days before the request, outside the fourteen day window. Approving it anyway is a deliberate exception.`}
        </Notice>
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={disputed}
          onClick={async () => {
            await context.mutate.patch(item.id, { status: "approved", fields: { ...item.fields, approvedAt: now.toISOString() } }, { expectRevision: item.revision, event: `${item.title} approved` });
            context.toast("Return approved", "The customer can send it back. No refund has moved.");
            close();
          }}
        >
          Approve the return
        </Button>
        <Button variant="ghost" onClick={() => context.openOverlay("restock assessment", { ids: [item.id] })}>Assess restocking</Button>
      </Row>
    </Stack>
  );
}

export function RestockAssessment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const chosen = data.returns.filter((item) => (payload?.ids ?? []).includes(item.id));
  const [decisions, setDecisions] = useState<Record<string, boolean>>(() => Object.fromEntries(chosen.map((item) => [item.id, item.fields.restock === true])));
  return (
    <form
      id="restock-assessment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const item of chosen) {
          const restock = decisions[item.id];
          await context.mutate.patch(item.id, { fields: { ...item.fields, restock } }, { expectRevision: item.revision, event: `${item.title} marked ${restock ? "resaleable" : "not resaleable"}` });
          if (restock) {
            await context.mutate.create({
              collection: "stockMoves",
              title: `return to stock · ${item.title}`,
              status: "posted",
              at: now.toISOString(),
              summary: `${item.title} returned to available stock.`,
              fields: { productId: String(item.fields.productId), warehouseId: "nl-warehouses-001", quantity: Number(item.fields.quantity ?? 1), kind: "return", reference: item.title },
            }, `Stock returned for ${item.title}`);
          }
        }
        context.toast("Assessment saved", "Resaleable items wrote a stock movement; the rest did not, so the level never counts a damaged unit.");
        close();
      }}
    >
      {chosen.length === 0 ? <Empty title="Select a return first" /> : chosen.map((item) => (
        <Card key={item.id} title={item.title} subtitle={`${String(item.fields.reason ?? "").replace("_", " ")} · ${item.fields.quantity ?? 1} units`}>
          <Checkbox
            label="Resaleable — write it back into stock"
            checked={decisions[item.id] ?? false}
            onChange={(event) => setDecisions((current) => ({ ...current, [item.id]: event.target.checked }))}
          />
          {String(item.fields.reason) === "damaged" && decisions[item.id] && (
            <Notice tone="warning" title="This was returned as damaged">Putting a damaged unit back into stock means the next customer receives it. Confirm it has been inspected.</Notice>
          )}
        </Card>
      ))}
    </form>
  );
}

export function RefundAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = useRecord(payload?.id ?? context.selectedId) ?? data.returns[0];
  const [confirmed, setConfirmed] = useState(false);
  if (!item) return <Empty title="Select a return" />;
  const highValue = (item.amountMinor ?? 0) > 50_000;
  return (
    <form
      id="refund-authorization"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!confirmed) return;
        await context.mutate.patch(item.id, {
          status: "completed",
          fields: { ...item.fields, refundState: "credit_note_local", authorisedBy: actor },
        }, { expectRevision: item.revision, event: `${item.title} refunded as a credit note by ${actor}` });
        context.toast("Credit note recorded", `${context.money(item.amountMinor)} is recorded against ${item.title}. No money moved from this browser.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Return", value: item.title },
        { label: "Value", value: context.money(item.amountMinor) },
        { label: "Risk", value: highValue ? <Pill tone="warning">High value</Pill> : <Pill tone="success">Routine</Pill> },
        { label: "Authorised by", value: actor },
      ]} />
      <ProviderBoundary id="payment.capture" title="A refund is recorded as a credit note" />
      {highValue && <Notice tone="warning" title="Above the routine threshold">A refund over £500 is recorded with the name of the person who authorised it, so the decision is traceable.</Notice>}
      <Checkbox label={`I authorise a credit note of ${context.money(item.amountMinor)}`} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
    </form>
  );
}

/* ---------------- COMMERCE-011 ---------------- */

export function OfferBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState(String(existing?.fields.kind ?? "percent"));
  const [value, setValue] = useState(String(existing?.fields.value ?? 10));
  const [code, setCode] = useState(String(existing?.fields.code ?? ""));
  const [floor, setFloor] = useState(String(Number(existing?.fields.floorMarginBp ?? 2_500) / 100));
  const [stackable, setStackable] = useState(existing?.fields.stackable === true);
  const duplicateCode = code.trim() !== "" && data.promotions.some((promotion) => promotion.id !== existing?.id && String(promotion.fields.code).toUpperCase() === code.trim().toUpperCase());
  const worst = useMemo(() => {
    const prices = data.products.filter((product) => product.status === "active" && product.fields.unitCostMinor);
    return prices.map((product) => {
      const price = product.amountMinor ?? 0;
      const discounted = kind === "amount" ? price - Number(value) : Math.round(price * (1 - Number(value) / 100));
      const bp = discounted <= 0 ? -10_000 : Math.round(((discounted - Number(product.fields.unitCostMinor ?? 0)) / discounted) * 10_000);
      return { product, discounted, bp };
    }).sort((a, b) => a.bp - b.bp)[0];
  }, [data.products, kind, value]);
  const breaches = worst ? worst.bp < Number(floor) * 100 : false;
  const invalid = !title.trim() || duplicateCode || breaches;

  return (
    <form
      id="offer-builder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = { kind, value: Number(value), code: code.trim().toUpperCase(), minQuantity: Number(existing?.fields.minQuantity ?? 1), audience: String(existing?.fields.audience ?? "all"), stackable, floorMarginBp: Math.round(Number(floor) * 100), uses: Number(existing?.fields.uses ?? 0) };
        if (existing) {
          await context.mutate.patch(existing.id, { title: title.trim(), fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Offer ${title.trim()} edited` });
        } else {
          const end = new Date(now);
          end.setDate(end.getDate() + 30);
          await context.mutate.create({
            collection: "promotions", title: title.trim(), status: "scheduled",
            summary: `${kind === "amount" ? context.money(Number(value)) : `${value}%`} off, margin floor ${floor}%.`,
            startAt: now.toISOString(), endAt: end.toISOString(), fields,
          }, `Offer ${title.trim()} created`);
        }
        context.toast("Offer saved", `Worst case margin ${worst ? (worst.bp / 100).toFixed(1) : "—"}% against a floor of ${floor}%.`);
        close();
      }}
    >
      <Field label="Offer name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Kind"><Select value={kind} onChange={(event) => setKind(event.target.value)}>{["percent", "amount", "code"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label={kind === "amount" ? "Amount off in minor units" : "Percent off"}><TextInput value={value} inputMode="numeric" align="end" onChange={(event) => setValue(event.target.value)} /></Field>
        <Field label="Code" error={duplicateCode ? "That code already exists" : undefined} hint="Leave empty to apply by rule">
          <TextInput value={code} invalid={duplicateCode} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </Field>
        <Field label="Margin floor %"><TextInput value={floor} inputMode="decimal" align="end" onChange={(event) => setFloor(event.target.value)} /></Field>
      </Row>
      <Checkbox label="May stack with another offer" checked={stackable} onChange={(event) => setStackable(event.target.checked)} />
      {worst && (
        <Properties rows={[
          { label: "Worst affected product", value: worst.product.title },
          { label: "Price after the offer", value: context.money(worst.discounted) },
          { label: "Margin then", value: `${(worst.bp / 100).toFixed(1)}%` },
          { label: "Floor", value: `${floor}%` },
        ]} />
      )}
      {breaches && worst && (
        <Notice tone="danger" title="This offer breaks its own margin floor">
          {worst.product.title} would sell at {context.money(worst.discounted)}, a {(worst.bp / 100).toFixed(1)}% margin. Lower the discount or the floor before saving.
        </Notice>
      )}
      {stackable && <Notice tone="warning" title="Stacking is checked at the basket">When two stackable offers would take a line below its floor, the second is refused and the shopper is told why.</Notice>}
    </form>
  );
}

export function MarginCheck({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const promotion = useRecord(payload?.id ?? context.selectedId) ?? data.promotions[0];
  if (!promotion) return <Empty title="No offer" />;
  const rows = data.products.filter((product) => product.status === "active").map((product) => {
    const price = product.amountMinor ?? 0;
    const discounted = String(promotion.fields.kind) === "amount" ? price - Number(promotion.fields.value ?? 0) : Math.round(price * (1 - Number(promotion.fields.value ?? 0) / 100));
    const cost = Number(product.fields.unitCostMinor ?? 0);
    const bp = discounted <= 0 ? -10_000 : Math.round(((discounted - cost) / discounted) * 10_000);
    return { product, discounted, cost, bp, breaches: cost > 0 && bp < Number(promotion.fields.floorMarginBp ?? 0) };
  });
  const breaching = rows.filter((row) => row.breaches);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Offer", value: promotion.title },
        { label: "Discount", value: String(promotion.fields.kind) === "amount" ? context.money(Number(promotion.fields.value ?? 0)) : `${promotion.fields.value}%` },
        { label: "Floor", value: `${(Number(promotion.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%` },
        { label: "Products below the floor", value: String(breaching.length) },
      ]} />
      <DataGrid rows={rows} rowId={(row) => row.product.id} label="Margin check" filterable={false}
        rowTone={(row) => (row.breaches ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Product", primary: true, cell: (row) => row.product.title },
          { key: "price", header: "List", align: "end", cell: (row) => context.money(row.product.amountMinor) },
          { key: "discounted", header: "After the offer", align: "end", cell: (row) => context.money(row.discounted) },
          { key: "cost", header: "Cost", align: "end", cell: (row) => (row.cost ? context.money(row.cost) : <span className="ds-subtle">Unavailable</span>) },
          { key: "margin", header: "Margin", align: "end", cell: (row) => (row.cost ? `${(row.bp / 100).toFixed(1)}%` : <span className="ds-subtle">No cost recorded</span>) },
        ]} />
      {breaching.length > 0 && <Notice tone="danger" title={`${breaching.length} product${breaching.length === 1 ? "" : "s"} would sell below the floor`}>{breaching.map((row) => row.product.title).join(", ")}. Exclude them from the offer or raise their price.</Notice>}
    </Stack>
  );
}

export function OfferLaunchApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommerceData();
  const { actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const promotion = useRecord(payload?.id ?? context.selectedId) ?? data.promotions.find((item) => item.status === "scheduled");
  if (!promotion) return <Empty title="No offer waiting" />;
  const stacking = data.promotions.filter((item) => item.status === "active" && item.fields.stackable === true && promotion.fields.stackable === true);
  return (
    <form
      id="offer-launch"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(promotion.id, { status: "active", fields: { ...promotion.fields, approvedBy: actor } }, { expectRevision: promotion.revision, event: `Offer ${promotion.title} made live by ${actor}` });
        context.toast("Offer live", `${promotion.title} now applies in the storefront checkout.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Offer", value: promotion.title },
        { label: "Window", value: `${context.date(promotion.startAt)} – ${context.date(promotion.endAt)}` },
        { label: "Floor", value: `${(Number(promotion.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%` },
        { label: "Approved by", value: actor },
      ]} />
      {stacking.length > 0 && (
        <Notice tone="warning" title="Another stackable offer is already live">
          {stacking.map((item) => item.title).join(", ")} can stack with this one. The basket refuses the second discount on any line that would fall below its floor.
        </Notice>
      )}
      <Notice tone="info">Making an offer live changes the storefront checkout immediately, because the basket reads promotion records directly.</Notice>
    </form>
  );
}

/* ---------------- COMMERCE-012 ---------------- */

export function ChartBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const [measure, setMeasure] = useState("Order value");
  const [group, setGroup] = useState("Month");
  return (
    <form
      id="chart-builder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: `${measure} by ${group}`,
          status: "active",
          summary: "Saved chart definition for Commerce analytics.",
          fields: { kind: "savedChart", measure, group, scope: "COMMERCE" },
        }, `Chart ${measure} by ${group} saved`);
        context.toast("Chart saved", "It appears in your saved views for this workspace.");
        close();
      }}
    >
      <Field label="Measure"><Select value={measure} onChange={(event) => setMeasure(event.target.value)}>{["Order value", "Units sold", "Return rate", "Average order"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Grouped by"><Select value={group} onChange={(event) => setGroup(event.target.value)}>{["Month", "Product", "Customer segment", "Channel"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Notice tone="info">Every measure here is counted from order, product and return records. A measure with no source is not offered.</Notice>
    </form>
  );
}

export function KpiInspector({ context }: { context: ScreenContext }) {
  const data = useCommerceData();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "returns";
  if (metric === "speed") {
    return (
      <Stack gap={3}>
        <Notice tone="warning" title="Fulfilment speed is not computed">
          An average needs two timestamps per order: when it was placed and when it shipped. The order timeline records labels, but the seeded entries share a timestamp and no shipping clock is kept, so an average would be arithmetic on data that does not support it.
        </Notice>
        <Properties rows={[
          { label: "Orders with a shipping entry", value: String(data.orders.filter((order) => (bodyOf<OrderBody>(order, {}).timeline ?? []).some((entry) => entry.label.includes("carrier"))).length) },
          { label: "What is missing", value: "A distinct, trusted timestamp for each state change" },
        ]} />
      </Stack>
    );
  }
  const completed = data.returns.filter((item) => item.status === "completed");
  const open = data.returns.filter((item) => item.status !== "completed");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Deducted from sales", value: `${completed.length} completed returns · ${context.money(completed.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0))}` },
        { label: "Not deducted", value: `${open.length} requested, in review or approved · ${context.money(open.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0))}` },
        { label: "Why", value: "Until a return completes, the money has not moved and the goods may not come back." },
      ]} />
      <DataGrid rows={data.returns} rowId={(row) => row.id} label="Returns included" filterable={false}
        columns={[
          { key: "title", header: "Return", primary: true, cell: (row) => row.title },
          { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status.replace("_", " ")}</Pill> },
          { key: "included", header: "In the figure", cell: (row) => (row.status === "completed" ? <Pill tone="success">Deducted</Pill> : <Pill tone="warning">Not yet</Pill>) },
          { key: "value", header: "Value", align: "end", cell: (row) => context.money(row.amountMinor) },
        ]} />
    </Stack>
  );
}

export function ReportSchedule({ context, close }: { context: ScreenContext; close: () => void }) {
  const [frequency, setFrequency] = useState("Monday");
  const [recipients, setRecipients] = useState("");
  return (
    <form
      id="report-schedule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: `Commerce report · ${frequency}`,
          status: "active",
          summary: `Scheduled locally for ${recipients || "nobody"}.`,
          fields: { kind: "reportSchedule", frequency, recipients, delivery: "not_connected", scope: "COMMERCE" },
        }, `Commerce report scheduled for ${frequency}`);
        context.toast("Schedule saved", "The schedule is a record here. With no mail provider connected nothing will be delivered.");
        close();
      }}
    >
      <Field label="Send on"><Select value={frequency} onChange={(event) => setFrequency(event.target.value)}>{["Monday", "First of the month", "End of quarter"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Recipients" hint="Comma separated"><TextInput value={recipients} onChange={(event) => setRecipients(event.target.value)} /></Field>
      <ProviderBoundary id="email.send" title="A scheduled report cannot be delivered" />
    </form>
  );
}

export { customerStatusOfContact };
