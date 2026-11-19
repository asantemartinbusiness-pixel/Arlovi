import { VariantsWorkspace } from "./VariantsWorkspace";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Button, Card, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice, Pill,
  KeyValueList, Row, Segmented, Select, Stack, Stat, StatRow,
} from "@/design-system";
import { Boxes, Package, PackageCheck, RotateCcw, ShoppingBag, Tags, Truck } from "lucide-react";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { resolveTaxCode } from "@/platform/money";
import { ProviderBoundary, TotalsBlock } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  bodyOf, marginOf, onHandFor, orderTaxStatus, orderTotals, withDelivery, reservedFor, statusTone,
  stockRows, taxCategoryOfProduct, useCommerceData, PAYMENT_LABEL, paymentLabel, paymentTone,
  type OrderBody, type ProductBody,
} from "./data";
import { lineProgress, refundableMinor, refundedMinor, refundStateLabel, shipmentsOf } from "./fulfilment";
import { RefundHistory, ShipmentsPanel } from "./operations";
import { StorefrontPreview } from "./storefront";
import { applyOrderFilter, LocationScopeNote, orderFilter, useLocationScope, useOrderFilter } from "./actions";

/* ====================================================================== *
 * COMMERCE panels — catalogue, inventory, orders, fulfilment, returns,
 * promotions and a storefront a visitor could actually use.
 * ====================================================================== */

function warehouseName(warehouses: Rec[], id: string): string {
  return warehouses.find((warehouse) => warehouse.id === id)?.title ?? "Unassigned";
}

/* ---------------------------- COMMERCE-001 ---------------------------- */

export function CommerceOverview({ context, lens }: { context: ScreenContext; lens: string }) {
  return (
    <Stack gap={3}>
      <LocationScopeNote context={context} />
      <CommerceOverviewBody context={context} lens={lens} />
    </Stack>
  );
}

function CommerceOverviewBody({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const scope = useLocationScope();
  const orders = scope ? data.orders.filter((order) => String(order.fields.warehouseId ?? "") === scope) : data.orders;
  const live = orders.filter((order) => order.status !== "cancelled");
  const awaiting = orders.filter((order) => order.status === "awaiting_payment");
  const unfulfilled = orders.filter((order) => ["unfulfilled", "exception"].includes(order.status));
  const grossPaid = live.filter((order) => String(order.fields.payment) === "paid_local").reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
  const netPaid = live.filter((order) => String(order.fields.payment) === "paid_local").reduce((sum, order) => sum + Number(order.fields.netMinor ?? 0), 0);
  const lowStock = data.products.filter((product) => product.status === "active" && onHandFor(data.stockMoves, product.id, scope || undefined) - reservedFor(orders, product.id) <= Number(product.fields.reorderPoint ?? 0));

  if (lens === "Sales") {
    const months = [4, 3, 2, 1, 0].map((back) => {
      const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      const inMonth = live.filter((order) => order.at && new Date(order.at) >= month && new Date(order.at) < next);
      return {
        label: month.toLocaleString(org.locale, { month: "short" }),
        net: inMonth.reduce((sum, order) => sum + Number(order.fields.netMinor ?? 0), 0),
        tax: inMonth.reduce((sum, order) => sum + Number(order.fields.taxMinor ?? 0), 0),
      };
    });
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Net, paid orders" value={context.money(netPaid)} meta="Excludes tax and cancellations" onClick={() => context.openOverlay("KPI explanation", { metric: "net" })} />
          <Stat label="Gross, paid orders" value={context.money(grossPaid)} meta="Net plus resolved tax" onClick={() => context.openOverlay("KPI explanation", { metric: "gross" })} />
          <Stat label="Held awaiting payment" value={context.money(awaiting.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} meta={`${awaiting.length} orders, no processor connected`} />
          <Stat label="Average order" value={live.length ? context.money(Math.round(live.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0) / live.length)) : "Unavailable"} unavailable={live.length === 0} meta={`${live.length} orders counted`} />
        </StatRow>
        <Card title="Net and tax by month" subtitle="From order records; tax resolved per line through the tax engine">
          <BarChart
            title="Order value by month"
            height={230}
            stacked
            format={(value) => context.money(value)}
            series={[
              { name: "Net", points: months.map((month) => ({ label: month.label, value: month.net })) },
              { name: "Tax", points: months.map((month) => ({ label: month.label, value: month.tax })) },
            ]}
            footer={`Reported in ${org.currency}. Tax comes from the ${org.jurisdiction} rules for each line's category, never from the currency.`}
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Operations") {
    return (
      <Grid>
        <Card span={6} title="Fulfilment queue" subtitle={`${unfulfilled.length} orders need action`}>
          {unfulfilled.length === 0 ? <Empty title="Nothing waiting" icon={<PackageCheck size={20} />} /> : (
            <Stack gap={2}>
              {unfulfilled.map((order) => (
                <Row key={order.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Link to={`/o/${org.slug}/commerce/orders/${order.id}`} className="ds-grow" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>{order.title}</Link>
                  <Pill tone={statusTone(order.status)} dot>{String(order.fields.fulfilment ?? order.status).replace("_", " ")}</Pill>
                  <strong className="ds-num">{context.money(order.amountMinor)}</strong>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={6} title="Stock warnings" subtitle={`${lowStock.length} products at or below their reorder point`}>
          {lowStock.length === 0 ? <Empty title="No stock warnings" icon={<Boxes size={20} />} /> : (
            <Stack gap={2}>
              {lowStock.map((product) => {
                const onHand = onHandFor(data.stockMoves, product.id, scope || undefined);
                const reserved = reservedFor(orders, product.id);
                return (
                  <Row key={product.id} gap={2}>
                    <span className="ds-grow">{product.title}</span>
                    <span className="ds-subtle">{onHand} on hand · {reserved} reserved</span>
                    <Pill tone={onHand - reserved <= 0 ? "danger" : "warning"}>{onHand - reserved} available</Pill>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>
        <Card span={12} title="Returns in flight" subtitle={`${data.returns.filter((item) => item.status !== "completed").length} open`} flush>
          <DataGrid
            rows={data.returns.filter((item) => item.status !== "completed")}
            rowId={(row) => row.id}
            label="Open returns"
            filterable={false}
            onOpen={(id) => context.navigate(`/o/${org.slug}/commerce/returns?tab=Requested&id=${id}`)}
            columns={[
              { key: "title", header: "Return", primary: true, cell: (row) => row.title },
              { key: "reason", header: "Reason", cell: (row) => String(row.fields.reason ?? "").replace("_", " ") },
              { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status.replace("_", " ")}</Pill> },
              { key: "refund", header: "Refund", cell: (row) => <Pill tone="warning">{String(row.fields.refundState ?? "").replace(/_/g, " ")}</Pill> },
              { key: "value", header: "Value", align: "end", cell: (row) => context.money(row.amountMinor) },
            ]}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Insights") {
    const byProduct = data.products.map((product) => {
      const sold = orders.filter((order) => order.status !== "cancelled").flatMap((order) => bodyOf<OrderBody>(order, {}).lines ?? []).filter((line) => line.productId === product.id);
      return { product, units: sold.reduce((sum, line) => sum + line.quantity, 0), value: sold.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0) };
    }).filter((row) => row.units > 0).sort((a, b) => b.value - a.value);
    const findings: { title: string; body: string }[] = [];
    for (const row of byProduct.slice(0, 2)) {
      const available = onHandFor(data.stockMoves, row.product.id, scope || undefined) - reservedFor(orders, row.product.id);
      const lead = Number(row.product.fields.leadTimeDays ?? 0);
      if (available <= Number(row.product.fields.reorderPoint ?? 0)) {
        findings.push({ title: `${row.product.title} is selling and nearly out`, body: `${row.units} units sold and ${available} available with a ${lead} day lead time. A purchase order placed today would arrive after the stock runs out.` });
      }
    }
    if (awaiting.length) findings.push({ title: `${awaiting.length} orders are waiting for payment`, body: `${context.money(awaiting.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} is held with no way to collect it from here. Each order keeps its full line detail so it can be invoiced instead.` });
    const drafts = data.products.filter((product) => product.status === "draft");
    if (drafts.length) findings.push({ title: `${drafts.length} product${drafts.length === 1 ? "" : "s"} cannot be bought`, body: `${drafts.map((product) => product.title).join(", ")} ${drafts.length === 1 ? "is" : "are"} still a draft, so the storefront does not show ${drafts.length === 1 ? "it" : "them"}.` });

    return (
      <Stack gap={4}>
        {findings.length === 0 ? <Empty title="Nothing stands out" icon={<ShoppingBag size={20} />}>Findings come from order, stock and product records only.</Empty> : findings.map((finding) => <Card key={finding.title} title={finding.title} subtitle={finding.body} />)}
        <Card title="Best sellers by value" subtitle="Counted from order lines" flush>
          <DataGrid rows={byProduct} rowId={(row) => row.product.id} label="Best sellers" filterable={false}
            columns={[
              { key: "title", header: "Product", primary: true, cell: (row) => row.product.title },
              { key: "units", header: "Units", align: "end", cell: (row) => String(row.units), sortValue: (row) => row.units },
              { key: "value", header: "Line value", align: "end", cell: (row) => context.money(row.value), sortValue: (row) => row.value },
              { key: "margin", header: "Margin at list", align: "end", cell: (row) => `${(marginOf(row.product).marginBp / 100).toFixed(1)}%` },
            ]} />
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Orders" value={String(live.length)} meta={`${unfulfilled.length} need fulfilment`} onClick={() => context.openOverlay("exception list")} />
        <Stat label="Net sales, paid" value={context.money(netPaid)} meta="Reconciles to the order lines" onClick={() => context.openOverlay("KPI explanation", { metric: "net" })} />
        <Stat label="Awaiting payment" value={context.money(awaiting.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} meta={`${awaiting.length} held orders`} onClick={() => context.openOverlay("KPI explanation", { metric: "awaiting" })} />
        <Stat label="Storefront conversion" value="Unavailable" unavailable meta="No analytics records a session" onClick={() => context.openOverlay("KPI explanation", { metric: "conversion" })} />
        <Stat label="Stock warnings" value={String(lowStock.length)} meta="At or below the reorder point" />
      </StatRow>
      <ProviderBoundary id="payment.capture" />
      <Grid>
        <Card span={7} title="Latest orders" subtitle={`${live.length} excluding cancellations`} flush>
          <DataGrid
            rows={[...live].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 8)}
            rowId={(row) => row.id}
            label="Latest orders"
            filterable={false}
            onOpen={(id) => context.navigate(`/o/${org.slug}/commerce/orders/${id}`)}
            columns={[
              { key: "title", header: "Order", primary: true, cell: (row) => row.title },
              { key: "buyer", header: "Buyer", cell: (row) => data.contacts.find((contact) => contact.id === String(row.fields.contactId))?.title ?? String(row.fields.buyerName || "Guest") },
              { key: "payment", header: "Payment", cell: (row) => <Pill tone={paymentTone(String(row.fields.payment))} dot>{paymentLabel(row.fields.payment)}</Pill> },
              { key: "total", header: "Total", align: "end", cell: (row) => context.money(row.amountMinor) },
            ]}
          />
        </Card>
        <Card span={5} title="Fulfilment state" subtitle="Every order by its physical state">
          <DonutChart
            title="Orders by fulfilment"
            format={(value) => String(Math.round(value))}
            points={[...new Set(live.map((order) => String(order.fields.fulfilment ?? order.status)))].map((state) => ({
              label: state.replace("_", " "),
              value: live.filter((order) => String(order.fields.fulfilment ?? order.status) === state).length,
            }))}
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- COMMERCE-002 ---------------------------- */

export function Products({ context, state }: { context: ScreenContext; state: string }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const [view, setView] = useState<"grid" | "list">("list");

  if (state === "Collections") {
    const collections = [...new Set(data.products.map((product) => String(product.fields.productCollection ?? "Uncategorised")))];
    return (
      <Grid>
        {collections.map((collection) => {
          const members = data.products.filter((product) => String(product.fields.productCollection ?? "Uncategorised") === collection);
          return (
            <Card key={collection} span={4} title={collection} subtitle={`${members.length} products`}
              actions={<Pill>{members.filter((product) => product.status === "active").length} active</Pill>}>
              <Stack gap={2}>
                {members.map((product) => (
                  <Row key={product.id} gap={2}>
                    <Link to={`/o/${org.slug}/commerce/products/${product.id}`} className="ds-grow ds-truncate" style={{ color: "inherit", textDecoration: "none" }}>{product.title}</Link>
                    <span className="ds-num">{context.money(product.amountMinor)}</span>
                  </Row>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  const rows = state === "All" ? data.products
    : state === "Active" ? data.products.filter((product) => product.status === "active")
      : state === "Draft" ? data.products.filter((product) => product.status === "draft")
        : data.products.filter((product) => product.status === "archived");

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} products`} icon={<Package size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Product editor")}>Create product</Button>} />;
  }

  if (view === "grid") {
    return (
      <Stack gap={3}>
        <Row gap={2}><Segmented label="Catalogue view" value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "grid", label: "Cards" }]} /></Row>
        <Grid>
          {rows.map((product) => {
            const body = bodyOf<ProductBody>(product, {});
            return (
              <Card key={product.id} span={3} title={<Link to={`/o/${org.slug}/commerce/products/${product.id}`} style={{ color: "inherit", textDecoration: "none" }}>{product.title}</Link>} subtitle={String(product.fields.sku)}
                actions={<Pill tone={statusTone(product.status)}>{product.status}</Pill>}>
                <Stack gap={2}>
                  <div className="t4-tile-media">{body.media?.[0]?.label ?? "No photograph"}</div>
                  <Row gap={2}><strong className="ds-num ds-grow">{context.money(product.amountMinor)}</strong><span className="ds-subtle">{(body.variants ?? []).length} variants</span></Row>
                  <span className="ds-subtle">{onHandFor(data.stockMoves, product.id)} on hand</span>
                </Stack>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    );
  }

  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${state} products`}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/commerce/products/${id}`)}
      toolbar={<Segmented label="Catalogue view" value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "grid", label: "Cards" }]} />}
      columns={[
        { key: "title", header: "Product", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.sku)}` },
        { key: "sku", header: "SKU", cell: (row) => <code>{String(row.fields.sku)}</code>, filterValue: (row) => String(row.fields.sku) },
        { key: "variants", header: "Variants", align: "end", cell: (row) => String((bodyOf<ProductBody>(row, {}).variants ?? []).length) },
        { key: "collection", header: "Collection", cell: (row) => String(row.fields.productCollection ?? "—"), hideBelow: 1000 },
        { key: "price", header: "Price", align: "end", cell: (row) => context.money(row.amountMinor), sortValue: (row) => row.amountMinor ?? 0 },
        { key: "tax", header: "Tax category", cell: (row) => <Pill>{taxCategoryOfProduct(row).replace("_", " ")}</Pill>, hideBelow: 1200 },
        { key: "stock", header: "On hand", align: "end", cell: (row) => String(onHandFor(data.stockMoves, row.id)), sortValue: (row) => onHandFor(data.stockMoves, row.id) },
        { key: "published", header: "Storefront", cell: (row) => (row.fields.published === true ? <Pill tone="success">Published</Pill> : <Pill tone="warning">Not published</Pill>) },
      ]}
      bulkActions={[
        { label: "Preview a bulk publish", onRun: (selected) => context.openOverlay("bulk preview", { ids: selected.map((product) => product.id) }) },
        { label: "Duplicate", onRun: (selected) => selected.forEach(async (product) => {
          await context.mutate.create({
            collection: "products",
            title: `${product.title} (copy)`,
            status: "draft",
            amountMinor: product.amountMinor,
            summary: product.summary,
            fields: { ...product.fields, sku: `${String(product.fields.sku)}-COPY`, published: false },
            body: product.body,
          }, `Product ${product.title} duplicated as a draft`);
          context.toast("Duplicated", "The copy is a draft with a new SKU and is not published.");
        }) },
      ]}
      summary={<span>{rows.length} of {data.products.length} products</span>}
    />
  );
}

/* ---------------------------- COMMERCE-003 ---------------------------- */

export function ProductDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const product = useRecord(context.params.id) ?? data.products.find((item) => item.id === context.params.id);
  const body = bodyOf<ProductBody>(product, {});
  if (!product) return <Empty title="Product not found" />;
  const variants = body.variants ?? [];
  const taxCode = resolveTaxCode({ jurisdiction: org.jurisdiction, category: taxCategoryOfProduct(product), customerStatus: "domestic", date: now.toISOString() });
  const margin = marginOf(product);

  if (lens === "Variants") {
    return <VariantsWorkspace context={context} product={product} taxCode={taxCode.code} />;
  }

  if (lens === "Media") {
    return (
      <Grid>
        {(body.media ?? []).map((item) => (
          <Card key={item.id} span={4} title={item.label} subtitle={item.kind}>
            <div className="t4-tile-media">{item.label}</div>
          </Card>
        ))}
        <Card span={12}>
          <Notice tone="warning" title="No asset store is connected">
            Media is referenced by label on the product record. Uploading a real photograph needs a file store, so the storefront preview shows the label instead of an image rather than a stock photograph that is not yours.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Pricing") {
    const statuses: { status: "domestic" | "eu_business" | "export" | "domestic_exempt"; label: string }[] = [
      { status: "domestic", label: "Domestic customer" },
      { status: "eu_business", label: "EU business" },
      { status: "export", label: "Export" },
      { status: "domestic_exempt", label: "Exempt customer" },
    ];
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="List price" value={context.money(product.amountMinor)} meta="Excludes tax" />
          <Stat label="Unit cost" value={margin.costMinor ? context.money(margin.costMinor) : "Unavailable"} unavailable={!margin.costMinor} meta={margin.costMinor ? "Recorded on the product" : "No cost is recorded"} />
          <Stat label="Margin" value={margin.costMinor ? `${(margin.marginBp / 100).toFixed(1)}%` : "Unavailable"} unavailable={!margin.costMinor} meta={margin.costMinor ? context.money(margin.marginMinor) : "Needs a unit cost"} />
          <Stat label="Tax category" value={taxCategoryOfProduct(product).replace("_", " ")} meta={`${taxCode.code} · ${(taxCode.rateBp / 100).toFixed(2)}%`} onClick={() => context.openOverlay("margin impact")} />
        </StatRow>
        <Card title={`Tax resolved for ${org.jurisdiction}`} subtitle="The rate comes from the jurisdiction, the category, the customer's status and the date — never from the currency" flush>
          <DataGrid rows={statuses} rowId={(row) => row.status} label="Tax by customer status" filterable={false}
            columns={[
              { key: "label", header: "Customer", primary: true, cell: (row) => row.label },
              { key: "code", header: "Code", cell: (row) => <code>{resolveTaxCode({ jurisdiction: org.jurisdiction, category: taxCategoryOfProduct(product), customerStatus: row.status, date: now.toISOString() }).code}</code> },
              { key: "rate", header: "Rate", align: "end", cell: (row) => `${(resolveTaxCode({ jurisdiction: org.jurisdiction, category: taxCategoryOfProduct(product), customerStatus: row.status, date: now.toISOString() }).rateBp / 100).toFixed(2)}%` },
              { key: "price", header: "Price with tax", align: "end", cell: (row) => context.money(Math.round((product.amountMinor ?? 0) * (1 + resolveTaxCode({ jurisdiction: org.jurisdiction, category: taxCategoryOfProduct(product), customerStatus: row.status, date: now.toISOString() }).rateBp / 10_000))) },
              { key: "note", header: "Note", cell: (row) => <span className="ds-subtle">{resolveTaxCode({ jurisdiction: org.jurisdiction, category: taxCategoryOfProduct(product), customerStatus: row.status, date: now.toISOString() }).note ?? "—"}</span>, hideBelow: 1200 },
            ]} />
        </Card>
        {data.promotions.filter((promotion) => promotion.status === "active").length > 0 && (
          <Notice tone="warning" title="Live promotions apply to this price">
            {data.promotions.filter((promotion) => promotion.status === "active").map((promotion) => promotion.title).join(", ")} {data.promotions.filter((promotion) => promotion.status === "active").length === 1 ? "is" : "are"} active.
            Changing the list price changes what those offers discount, so the margin check runs before a price is saved.
          </Notice>
        )}
      </Stack>
    );
  }

  if (lens === "SEO") {
    return (
      <Grid>
        <Card span={7} title="Storefront metadata" subtitle="Used by the storefront page and nothing else">
          <KeyValueList items={[
            { label: "Meta title", value: String(product.fields.seoTitle || "Not set") },
            { label: "Meta description", value: String(product.fields.seoDescription || "Not set") },
            { label: "Handle", value: <code>/{product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</code> },
            { label: "Published", value: product.fields.published === true ? <Pill tone="success">In the storefront</Pill> : <Pill tone="warning">Hidden</Pill> },
          ]} />
        </Card>
        <Card span={5} title="What this cannot do">
          <Notice tone="warning" title="No search engine sees this">
            The storefront is a preview in this browser with no public URL. Metadata is stored so it is ready, but no crawler can read it and no ranking can follow from it.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "History") {
    return product.history.length === 0
      ? <Empty title="No earlier version" >A version is stored each time this product is saved.</Empty>
      : (
        <DataGrid rows={product.history} rowId={(row) => row.at} label="Product history" filterable={false}
          columns={[
            { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at) },
            { key: "status", header: "Status then", cell: (row) => <Pill>{row.status}</Pill> },
            { key: "price", header: "Price then", align: "end", cell: (row) => context.money(row.amountMinor) },
            { key: "published", header: "Published then", cell: (row) => (row.fields.published === true ? "Yes" : "No") },
          ]} />
      );
  }

  const onHand = onHandFor(data.stockMoves, product.id);
  const reserved = reservedFor(data.orders, product.id);
  return (
    <Grid>
      <Card span={5} title="Overview">
        <Stack gap={3}>
          <div className="t4-tile-media" style={{ height: 140 }}>{body.media?.[0]?.label ?? "No photograph"}</div>
          <p className="ds-prose">{body.description ?? product.summary}</p>
          <KeyValueList items={[
            { label: "Variants", value: String(variants.length) },
            { label: "Lead time", value: `${product.fields.leadTimeDays ?? "—"} days` },
          ]} />
        </Stack>
      </Card>
      <Card span={7} title="Price and tax" subtitle={`${taxCode.label} (${taxCode.code})`}>
        <Stack gap={3}>
          <KeyValueList items={[
            { label: "List price", value: <strong className="ds-num">{context.money(product.amountMinor)}</strong> },
            { label: "Tax category", value: taxCategoryOfProduct(product).replace("_", " ") },
            { label: "Resolved code", value: `${taxCode.code} at ${(taxCode.rateBp / 100).toFixed(2)}%` },
            { label: "Price with domestic tax", value: context.money(Math.round((product.amountMinor ?? 0) * (1 + taxCode.rateBp / 10_000))) },
            { label: "Margin at list", value: margin.costMinor ? `${(margin.marginBp / 100).toFixed(1)}% (${context.money(margin.marginMinor)})` : "Unavailable — no unit cost recorded" },
          ]} />
          {taxCode.note && <Notice tone="info">{taxCode.note}</Notice>}
        </Stack>
      </Card>
      <Card span={12} title="Inventory" subtitle={`${onHand} on hand, ${reserved} reserved by open orders`} flush>
        <DataGrid
          rows={stockRows([product], data.stockMoves, data.orders, data.warehouses)}
          rowId={(row) => `${row.product.id}-${row.warehouseId}`}
          label="Stock by warehouse"
          filterable={false}
          columns={[
            { key: "warehouse", header: "Location", primary: true, cell: (row) => warehouseName(data.warehouses, row.warehouseId) },
            { key: "onhand", header: "On hand", align: "end", cell: (row) => String(row.onHand) },
            { key: "reserved", header: "Reserved", align: "end", cell: (row) => String(row.reserved) },
            { key: "available", header: "Available", align: "end", cell: (row) => <strong className={row.available <= 0 ? "ds-field-error" : "ds-num"}>{row.available}</strong> },
          ]} />
      </Card>
    </Grid>
  );
}

/* ---------------------------- COMMERCE-004 ---------------------------- */

export function Inventory({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const rows = stockRows(data.products.filter((product) => product.status !== "archived"), data.stockMoves, data.orders, data.warehouses);

  if (lens === "Movements") {
    return (
      <DataGrid
        rows={[...data.stockMoves].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
        rowId={(row) => row.id}
        label="Stock movements"
        onSelect={(id) => context.select(id)}
        columns={[
          { key: "title", header: "Movement", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "product", header: "Product", cell: (row) => data.products.find((product) => product.id === String(row.fields.productId))?.title ?? String(row.fields.productId) },
          { key: "warehouse", header: "Location", cell: (row) => warehouseName(data.warehouses, String(row.fields.warehouseId)) },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "move").replace("_", " ")}</Pill> },
          { key: "qty", header: "Quantity", align: "end", cell: (row) => <strong className={Number(row.fields.quantity) < 0 ? "ds-field-error" : "ds-num"}>{Number(row.fields.quantity) > 0 ? "+" : ""}{String(row.fields.quantity)}</strong>, sortValue: (row) => Number(row.fields.quantity ?? 0) },
          { key: "why", header: "Reason", cell: (row) => String(row.fields.note || row.summary || "—"), hideBelow: 900 },
          { key: "ref", header: "Reference", cell: (row) => String(row.fields.reference ?? "—"), hideBelow: 1100 },
          { key: "at", header: "When", align: "end", cell: (row) => context.date(row.at), sortValue: (row) => row.at ?? "" },
        ]}
      />
    );
  }

  if (lens === "Locations") {
    return (
      <Grid>
        {data.warehouses.map((warehouse) => {
          const here = rows.filter((row) => row.warehouseId === warehouse.id);
          const units = here.reduce((sum, row) => sum + row.onHand, 0);
          return (
            <Card key={warehouse.id} span={4} title={warehouse.title} subtitle={warehouse.summary}
              actions={<Pill tone={units > Number(warehouse.fields.capacityUnits ?? 0) ? "danger" : "neutral"}>{units} units</Pill>}>
              <Stack gap={3}>
                <KeyValueList items={[
                  { label: "Code", value: String(warehouse.fields.code ?? "—") },
                  { label: "Manager", value: String(warehouse.fields.managerName ?? "Unassigned") },
                  { label: "Capacity", value: `${warehouse.fields.capacityUnits ?? "—"} units` },
                  { label: "Lines held", value: String(here.length) },
                ]} />
                <Meter value={units} max={Number(warehouse.fields.capacityUnits ?? 1)} label={`${warehouse.title} capacity`} tone={units > Number(warehouse.fields.capacityUnits ?? 0) * 0.9 ? "warning" : undefined} />
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Replenishment") {
    const needs = rows.filter((row) => row.available <= Number(row.product.fields.reorderPoint ?? 0));
    return needs.length === 0
      ? <Empty title="Nothing needs reordering" icon={<Boxes size={20} />}>Every product is above its reorder point once reservations are deducted.</Empty>
      : (
        <Stack gap={4}>
          <Notice tone="warning" title="A suggestion is not an order">
            These figures come from the reorder point and lead time stored on each product. Demand is counted from order records only; nothing here forecasts the future, and no purchase order is created without an approval in Procurement.
          </Notice>
          <DataGrid rows={needs} rowId={(row) => `${row.product.id}-${row.warehouseId}`} label="Replenishment suggestions" filterable={false}
            columns={[
              { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
              { key: "warehouse", header: "Location", cell: (row) => warehouseName(data.warehouses, row.warehouseId) },
              { key: "available", header: "Available", align: "end", cell: (row) => String(row.available) },
              { key: "point", header: "Reorder point", align: "end", cell: (row) => String(row.product.fields.reorderPoint ?? 0) },
              { key: "qty", header: "Suggested", align: "end", cell: (row) => String(row.product.fields.reorderQuantity ?? 0) },
              { key: "lead", header: "Lead time", align: "end", cell: (row) => `${row.product.fields.leadTimeDays ?? "—"} days` },
            ]}
            bulkActions={[{ label: "Open Procurement", onRun: () => context.navigate(`/o/${context.org.slug}/proc/replenishment`) }]} />
        </Stack>
      );
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => `${row.product.id}-${row.warehouseId}`}
        label="Stock levels"
        onSelect={(id) => context.select(id)}
        onOpen={(id) => { context.select(id); context.openOverlay("stock history"); }}
        rowTone={(row) => (row.available < 0 ? "danger" : row.available === 0 ? "warning" : undefined)}
        columns={[
          { key: "sku", header: "SKU", primary: true, cell: (row) => <code>{String(row.product.fields.sku)}</code>, filterValue: (row) => `${String(row.product.fields.sku)} ${row.product.title}` },
          { key: "product", header: "Product", cell: (row) => row.product.title, sortValue: (row) => row.product.title },
          { key: "warehouse", header: "Location", cell: (row) => warehouseName(data.warehouses, row.warehouseId) },
          { key: "onhand", header: "On hand", align: "end", cell: (row) => String(row.onHand), sortValue: (row) => row.onHand },
          { key: "reserved", header: "Reserved", align: "end", cell: (row) => String(row.reserved), sortValue: (row) => row.reserved },
          { key: "inbound", header: "Inbound", align: "end", cell: (row) => (row.inbound ? String(row.inbound) : <span className="ds-subtle">None recorded</span>) },
          { key: "available", header: "Available", align: "end", cell: (row) => <strong className={row.available <= 0 ? "ds-field-error" : "ds-num"}>{row.available}</strong>, sortValue: (row) => row.available },
          { key: "alert", header: "Alert", cell: (row) => (row.available <= Number(row.product.fields.reorderPoint ?? 0) ? <Pill tone={row.available <= 0 ? "danger" : "warning"} dot>{row.available <= 0 ? "Out" : "Low"}</Pill> : <Pill tone="success">Fine</Pill>) },
        ]}
        summary={<span>{rows.reduce((sum, row) => sum + row.onHand, 0)} units on hand · {rows.reduce((sum, row) => sum + row.reserved, 0)} reserved</span>}
      />
      <Notice tone="info" title="Available is on hand minus reservations">
        Every open order reserves its lines, so two people cannot sell the same unit. A movement that would take a location below zero is refused rather than recorded.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- COMMERCE-005 ---------------------------- */

export function Orders({ context, state }: { context: ScreenContext; state: string }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const map: Record<string, (order: Rec) => boolean> = {
    All: () => true,
    Unfulfilled: (order) => ["awaiting_payment", "unfulfilled", "exception"].includes(order.status),
    "In transit": (order) => ["in_transit", "shipped"].includes(order.status),
    Delivered: (order) => order.status === "delivered",
    Returns: (order) => data.returns.some((item) => String(item.fields.orderId) === order.id),
  };
  const filter = useOrderFilter();
  const filtered = filter.payment || filter.channel;
  const rows = applyOrderFilter(data.orders.filter(map[state] ?? (() => true)), filter);
  const filterNote = filtered ? (
    <Notice tone="info" title={`Filtered: ${[filter.payment && (PAYMENT_LABEL[filter.payment] ?? filter.payment), filter.channel].filter(Boolean).join(" · ")}`}
      actions={<Button size="sm" variant="ghost" onClick={() => orderFilter.set({ payment: "", channel: "" })}>Clear filter</Button>}>
      Only orders matching the filter are listed on every tab.
    </Notice>
  ) : null;

  if (rows.length === 0) {
    return <Stack gap={3}>{filterNote}<Empty title={`No ${state.toLowerCase()} orders`} icon={<ShoppingBag size={20} />}>Orders arrive from the storefront preview or are entered by the showroom.</Empty></Stack>;
  }

  return (
    <Stack gap={3}>
    {filterNote}
    <DataGrid
      rows={[...rows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
      rowId={(row) => row.id}
      label={`${state} orders`}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/commerce/orders/${id}`)}
      rowTone={(row) => (row.status === "exception" ? "danger" : row.status === "awaiting_payment" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Order", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "buyer", header: "Buyer", cell: (row) => data.contacts.find((contact) => contact.id === String(row.fields.contactId))?.title ?? String(row.fields.buyerName || "Guest checkout") },
        { key: "placed", header: "Placed", cell: (row) => context.date(row.at), sortValue: (row) => row.at ?? "", hideBelow: 900 },
        { key: "payment", header: "Payment", cell: (row) => <Pill tone={paymentTone(String(row.fields.payment))} dot>{paymentLabel(row.fields.payment)}</Pill> },
        { key: "fulfilment", header: "Fulfilment", cell: (row) => <Pill tone={statusTone(String(row.fields.fulfilment ?? row.status))}>{String(row.fields.fulfilment ?? row.status).replace("_", " ")}</Pill> },
        { key: "returns", header: "Return", cell: (row) => { const found = data.returns.find((item) => String(item.fields.orderId) === row.id); return found ? <Pill tone={statusTone(found.status)}>{found.title}</Pill> : <span className="ds-subtle">—</span>; }, hideBelow: 1200 },
        { key: "total", header: "Total", align: "end", cell: (row) => context.money(row.amountMinor), sortValue: (row) => row.amountMinor ?? 0 },
      ]}
      bulkActions={[
        { label: "Bulk fulfil", disabled: (selected) => selected.some((order) => order.status === "awaiting_payment"), onRun: (selected) => context.openOverlay("bulk operation", { ids: selected.map((order) => order.id) }) },
        { label: "Quick view", disabled: (selected) => selected.length !== 1, onRun: (selected) => context.openOverlay("Order quick view", { id: selected[0].id }) },
      ]}
      summary={<span>{rows.length} orders · {context.money(rows.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))}</span>}
    />
    </Stack>
  );
}

/* ---------------------------- COMMERCE-006 ---------------------------- */

export function OrderDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const order = useRecord(context.params.id) ?? data.orders.find((item) => item.id === context.params.id);
  const body = bodyOf<OrderBody>(order, {});
  const contact = data.contacts.find((item) => item.id === String(order?.fields.contactId ?? ""));
  if (!order) return <Empty title="Order not found" />;
  const totals = orderTotals(order, contact, org.jurisdiction);
  const shipping = Number(order.fields.shippingMinor ?? 0);
  const returns = data.returns.filter((item) => String(item.fields.orderId) === order.id);

  if (lens === "Fulfilment") {
    return (
      <Stack gap={4}>
        <Card title="Physical state" subtitle={`${String(order.fields.fulfilment ?? order.status).replace("_", " ")} · ${String(order.fields.carrier) || "no carrier chosen"}`}>
          <Stack gap={3}>
            <KeyValueList items={[
              { label: "Warehouse", value: warehouseName(data.warehouses, String(order.fields.warehouseId)) },
              { label: "Carrier", value: String(order.fields.carrier) || "Not chosen" },
              { label: "Tracking", value: String(order.fields.tracking) || "No tracking recorded" },
              { label: "Ship to", value: `${body.shipTo?.name ?? "—"}${body.shipTo?.city ? `, ${body.shipTo.city}` : ""}` },
            ]} />
            {order.status === "exception" && (
              <Notice tone="danger" title="The carrier response is unknown">
                The consignment was handed over and never scanned. A second label is not created from here: without a carrier API there is no way to tell a lost consignment from an unscanned one, and guessing would mean two parcels or two charges.
              </Notice>
            )}
          </Stack>
        </Card>
        <ShipmentsPanel context={context} order={order} />
      </Stack>
    );
  }

  if (lens === "Payments") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Order total" value={context.money(withDelivery(totals, shipping).grossMinor)} meta="Net, resolved tax and delivery" />
          <Stat label="Recorded as paid" value={String(order.fields.payment) === "paid_local" ? context.money(withDelivery(totals, shipping).grossMinor) : context.money(0)} meta={PAYMENT_LABEL[String(order.fields.payment)] ?? ""} />
          <Stat label="Processor reference" value="Unavailable" unavailable meta="No processor is connected" />
        </StatRow>
        <TotalsBlock totals={withDelivery(totals, shipping)} money={context.money} label="Order" extraRows={[{ label: "Delivery", value: <span className="ds-num">{context.money(shipping)}</span> }]} />
        <ProviderBoundary id="payment.capture" />
        {returns.length > 0 && (
          <Notice tone="warning" title="A refund cannot be executed here">
            {returns.map((item) => item.title).join(", ")} {returns.length === 1 ? "is" : "are"} open against this order. A refund proposal records the amount and the reason; the money moves when the studio sends it, and the ledger records that separately.
          </Notice>
        )}
      </Stack>
    );
  }

  if (lens === "Returns") {
    return returns.length === 0
      ? <Empty title="No returns on this order" icon={<RotateCcw size={20} />}
        action={<Button variant="secondary" onClick={() => context.openOverlay("raise return", { id: order.id })}>Raise a return</Button>}>
        Only units that have shipped can be returned.
      </Empty>
      : (
        <Stack gap={3}>
          <Row gap={2} wrap>
            <span className="ds-subtle ds-grow">{returns.length} return{returns.length === 1 ? "" : "s"} · {context.money(returns.reduce((sum, item) => sum + refundedMinor(item), 0))} refunded and recorded</span>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("raise return", { id: order.id })}>Raise a return</Button>
          </Row>
          {returns.map((item) => (
            <Card key={item.id} title={item.title} subtitle={item.summary}
              actions={<Pill tone={statusTone(item.status)}>{item.status.replace("_", " ")}</Pill>}>
              <KeyValueList items={[
                { label: "Reason", value: String(item.fields.reason ?? "").replace("_", " ") },
                { label: "Quantity", value: String(item.fields.quantity ?? 1) },
                { label: "Restock", value: item.fields.restock === true ? "Back into stock" : "Not resaleable" },
                { label: "Refund state", value: <Pill tone={refundStateLabel(item.fields.refundState).tone}>{refundStateLabel(item.fields.refundState).label}</Pill> },
                { label: "Value", value: context.money(item.amountMinor) },
                { label: "Refunded", value: <span className="ds-num">{context.money(refundedMinor(item))}</span> },
              ]} />
              <RefundHistory context={context} item={item} />
            </Card>
          ))}
        </Stack>
      );
  }

  if (lens === "Activity") {
    return (
      <Stack gap={4}>
        <ol className="t4-timeline">
          {(body.timeline ?? []).map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <div>
                <strong className="ds-num">{context.dateTime(entry.at)}</strong>
                <div className="ds-subtle">{context.relative(entry.at)}</div>
              </div>
              <div className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <strong>{entry.label}</strong>
                <p className="ds-subtle">{entry.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {(body.timeline ?? []).length === 0 && <Empty title="No events recorded on this order" />}
        <KeyValueList items={[
          { label: "Created", value: `${context.dateTime(order.createdAt)} by ${order.createdBy}` },
          { label: "Updated", value: `${context.dateTime(order.updatedAt)} by ${order.updatedBy}` },
          { label: "Revision", value: String(order.revision) },
        ]} />
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={5} title="Customer" subtitle={contact ? undefined : "Guest checkout"}>
        <KeyValueList items={[
          { label: "Name", value: contact?.title ?? String(order.fields.buyerName || "Guest") },
          { label: "Email", value: String(contact?.fields.email ?? order.fields.buyerEmail ?? "Not recorded") },
          { label: "Tax status", value: orderTaxStatus(order, contact).replace("_", " ") },
          { label: "Ship to", value: [body.shipTo?.line1, body.shipTo?.city, body.shipTo?.postcode].filter(Boolean).join(", ") || "Not recorded" },
        ]} />
      </Card>
      <Card span={7} title="Totals" subtitle={`Tax resolved for ${org.jurisdiction} as ${orderTaxStatus(order, contact).replace("_", " ")}`}>
        <TotalsBlock totals={withDelivery(totals, shipping)} money={context.money} label="Order" extraRows={[{ label: "Delivery", value: <span className="ds-num">{context.money(shipping)}</span> }]} />
      </Card>
      <Card span={12} title="Line items" subtitle={`${(body.lines ?? []).length} lines`} flush>
        <DataGrid rows={totals.lines} rowId={(row) => row.id} label="Line items" filterable={false}
          columns={[
            { key: "description", header: "Item", primary: true, cell: (row) => row.description },
            { key: "qty", header: "Qty", align: "end", cell: (row) => String(row.quantity) },
            { key: "unit", header: "Unit", align: "end", cell: (row) => context.money(row.unitPriceMinor) },
            { key: "discount", header: "Discount", align: "end", cell: (row) => (row.discountBp ? `${(row.discountBp / 100).toFixed(1)}%` : "—") },
            { key: "net", header: "Net", align: "end", cell: (row) => context.money(row.netMinor) },
            { key: "code", header: "Tax code", cell: (row) => <Pill>{row.taxCode.code}</Pill> },
            { key: "tax", header: "Tax", align: "end", cell: (row) => context.money(row.taxMinor) },
            { key: "gross", header: "Gross", align: "end", cell: (row) => context.money(row.grossMinor) },
          ]}
          summary={<span>Net {context.money(totals.netMinor)} · tax {context.money(totals.taxMinor)} · gross {context.money(totals.grossMinor)}</span>} />
      </Card>
    </Grid>
  );
}

/* ---------------------------- COMMERCE-007 ---------------------------- */

export function StorefrontBuilder({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const site = data.sites.find((item) => String(item.fields.kind) === "storefront");
  const sections = (site?.body as { sections?: string[] } | undefined)?.sections;

  if (lens === "Preview") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="This preview is the real thing, within its limits">
          Everything below reads the catalogue, stock and promotions in this workspace. You can add to the basket and check out; the order is created and held awaiting payment because no processor is connected.
        </Notice>
        <StorefrontPreview context={context} products={data.products} moves={data.stockMoves} orders={data.orders} promotions={data.promotions} />
      </Stack>
    );
  }

  if (lens === "Design") {
    return (
      <Grid>
        <Card span={6} title="Theme" subtitle="Tokens the storefront reads">
          <Stack gap={3}>
            <KeyValueList items={[
              { label: "Palette", value: String(site?.fields.theme ?? "Studio brass on paper") },
              { label: "Headings", value: String(site?.fields.headingFace ?? "Display") },
              { label: "Corners", value: String(site?.fields.radius ?? "Rounded") },
              { label: "Layout template", value: String(site?.fields.layout ?? "Shelf and basket") },
              { label: "Section order", value: (sections ?? ["Hero", "Product shelf", "Discount code", "Basket", "Delivery note"]).join(" · ") },
              { label: "Published version", value: site?.fields.publishedVersion ? `v${String(site.fields.publishedVersion)}` : "None" },
            ]} />
            <div className="t4-swatches">
              {["var(--accent)", "var(--bg-sunken)", "var(--bg-surface)", "var(--fg-strong)", "var(--success)"].map((colour) => (
                <span key={colour} className="t4-swatch" style={{ background: colour }} title={colour} />
              ))}
            </div>
          </Stack>
        </Card>
        <Card span={6} title="Responsive behaviour">
          <Stack gap={3}>
            <KeyValueList items={[
              { label: "Below 900px", value: "The basket moves beneath the shelf and stops sticking" },
              { label: "Below 600px", value: "One product per row, controls reach 44px" },
              { label: "Checkout", value: "Single column at every width" },
            ]} />
            <Notice tone="info">The preview uses the same stylesheet as the storefront, so what you see at this width is what a visitor gets.</Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Content") {
    return (
      <Grid>
        <Card span={12} title="Bound content" subtitle="Every block reads records, so the storefront cannot drift from the catalogue" flush>
          <DataGrid
            rows={[
              { id: "hero", block: "Hero", source: "Written here", detail: "Lighting made in Clerkenwell" },
              { id: "shelf", block: "Product shelf", source: "products collection", detail: `${data.products.filter((product) => product.fields.published === true && product.status === "active").length} published products` },
              { id: "stock", block: "Availability badge", source: "stockMoves minus reservations", detail: "Refuses an add when nothing is available" },
              { id: "promo", block: "Discount code", source: "promotions collection", detail: `${data.promotions.filter((promotion) => promotion.status === "active" && promotion.fields.code).length} active codes` },
              { id: "tax", block: "Price with tax", source: "tax engine", detail: "Resolved per line from the jurisdiction and category" },
            ]}
            rowId={(row) => row.id}
            label="Bound content"
            filterable={false}
            columns={[
              { key: "block", header: "Block", primary: true, cell: (row) => row.block },
              { key: "source", header: "Source", cell: (row) => <code>{row.source}</code> },
              { key: "detail", header: "Now", cell: (row) => row.detail },
            ]}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Settings") {
    return (
      <Grid>
        <Card span={6} title="Storefront settings">
          <KeyValueList items={[
            { label: "Domain", value: "northline.example (not registered from here)" },
            { label: "Currency", value: context.org.currency },
            { label: "Tax jurisdiction", value: context.org.jurisdiction },
            { label: "Free delivery", value: "Net of £500 and above" },
            { label: "Guest checkout", value: "Allowed — an order can be held without a contact record" },
          ]} />
        </Card>
        <Card span={6} title="Publication">
          <Stack gap={3}>
            <KeyValueList items={[
              { label: "Last export", value: site?.fields.exportedAt ? context.dateTime(String(site.fields.exportedAt)) : "Never exported" },
              { label: "Live site", value: <Pill tone="warning">Not hosted</Pill> },
            ]} />
            <ProviderBoundary id="site.publish" />
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={12} title="Storefront pages" subtitle="A page is a record; the preview renders it" flush>
        <DataGrid
          rows={[
            { id: "shop", name: "Shop", path: "/shop", blocks: "Hero, product shelf", state: "In the preview" },
            { id: "product", name: "Product", path: "/products/:handle", blocks: "Media, description, variants, availability", state: "In the preview" },
            { id: "basket", name: "Basket", path: "/basket", blocks: "Lines, discount code, totals", state: "In the preview" },
            { id: "checkout", name: "Checkout", path: "/checkout", blocks: "Delivery details, tax treatment", state: "Stops at payment" },
            { id: "complete", name: "Order held", path: "/checkout/complete", blocks: "Order number, state, totals", state: "In the preview" },
          ]}
          rowId={(row) => row.id}
          label="Storefront pages"
          filterable={false}
          onOpen={() => context.setTab("Preview")}
          columns={[
            { key: "name", header: "Page", primary: true, cell: (row) => row.name },
            { key: "path", header: "Path", cell: (row) => <code>{row.path}</code> },
            { key: "blocks", header: "Blocks", cell: (row) => row.blocks },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.state === "Stops at payment" ? "warning" : "success"}>{row.state}</Pill> },
          ]}
        />
      </Card>
      <Card span={12}>
        <Notice tone="warning" title="A failed publish cannot damage what is live">
          Nothing is hosted, so there is no production site to break. When hosting is connected, an export writes a new version and the previous one stays served until the new one is verified.
        </Notice>
      </Card>
    </Grid>
  );
}

/* ---------------------------- COMMERCE-008 ---------------------------- */

export function CheckoutAdmin({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const abandoned = data.orders.filter((order) => order.status === "awaiting_payment");

  if (lens === "Payments") {
    return (
      <Stack gap={4}>
        <ProviderBoundary id="payment.capture" title="No payment processor is connected" />
        <Grid>
          {["Card", "Apple Pay and Google Pay", "Bank transfer", "Pay by invoice"].map((method) => (
            <Card key={method} span={6} title={method}
              actions={<Pill tone={method === "Bank transfer" || method === "Pay by invoice" ? "success" : "warning"} dot>{method === "Bank transfer" || method === "Pay by invoice" ? "Possible today" : "Needs a processor"}</Pill>}>
              <p className="ds-prose">
                {method === "Card" || method === "Apple Pay and Google Pay"
                  ? "Card data must never reach this application. A processor supplies a hosted field so the number goes straight to them; this build has no server to hold the keys, so the method cannot be offered."
                  : "An order can be held and an invoice issued from the ledger. That is what the storefront does today: the order waits as awaiting payment with its full line detail."}
              </p>
            </Card>
          ))}
        </Grid>
        <Notice tone="danger" title="Card handling is delegated, never implemented here">
          No card number, expiry or security code is collected anywhere in this build. The checkout has no card field at all, so there is nothing to leak and no cardholder data environment to assess.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Tax") {
    const categories: { category: "standard" | "reduced" | "zero_rated" | "exempt" | "outside_scope" | "reverse_charge"; label: string }[] = [
      { category: "standard", label: "Standard rated" },
      { category: "reduced", label: "Reduced rate" },
      { category: "zero_rated", label: "Zero rated" },
      { category: "exempt", label: "Exempt" },
      { category: "outside_scope", label: "Outside the scope" },
      { category: "reverse_charge", label: "Reverse charge" },
    ];
    return (
      <Stack gap={4}>
        <Notice tone="info" title={`Rates resolve for ${org.jurisdiction} on ${context.date(now)}`}>
          Tax is resolved from the jurisdiction, the line's category, the customer's status and the transaction date. It is never derived from the currency, and an unmatched combination resolves to <code>UNKNOWN</code> rather than zero.
        </Notice>
        <DataGrid rows={categories} rowId={(row) => row.category} label="Tax categories" filterable={false}
          columns={[
            { key: "label", header: "Category", primary: true, cell: (row) => row.label },
            { key: "domestic", header: "Domestic", cell: (row) => <code>{resolveTaxCode({ jurisdiction: org.jurisdiction, category: row.category, customerStatus: "domestic", date: now.toISOString() }).code}</code> },
            { key: "rate", header: "Rate", align: "end", cell: (row) => `${(resolveTaxCode({ jurisdiction: org.jurisdiction, category: row.category, customerStatus: "domestic", date: now.toISOString() }).rateBp / 100).toFixed(2)}%` },
            { key: "export", header: "Export", cell: (row) => <code>{resolveTaxCode({ jurisdiction: org.jurisdiction, category: row.category, customerStatus: "export", date: now.toISOString() }).code}</code> },
            { key: "eu", header: "EU business", cell: (row) => <code>{resolveTaxCode({ jurisdiction: org.jurisdiction, category: row.category, customerStatus: "eu_business", date: now.toISOString() }).code}</code> },
            { key: "products", header: "Products", align: "end", cell: (row) => String(data.products.filter((product) => taxCategoryOfProduct(product) === row.category).length) },
          ]} />
      </Stack>
    );
  }

  if (lens === "Recovery") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Held orders" value={String(abandoned.length)} meta="Awaiting payment with full line detail" />
          <Stat label="Value held" value={context.money(abandoned.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} meta="Recoverable by invoice" />
          <Stat label="Abandoned baskets" value="Unavailable" unavailable meta="A basket is not recorded until checkout" />
          <Stat label="Recovery emails sent" value="0" meta="No mail provider is connected" />
        </StatRow>
        <DataGrid rows={abandoned} rowId={(row) => row.id} label="Held orders" filterable={false}
          onOpen={(id) => context.navigate(`/o/${org.slug}/commerce/orders/${id}`)}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => row.title },
            { key: "buyer", header: "Buyer", cell: (row) => data.contacts.find((contact) => contact.id === String(row.fields.contactId))?.title ?? String(row.fields.buyerName || "Guest") },
            { key: "placed", header: "Placed", cell: (row) => context.relative(row.at) },
            { key: "total", header: "Total", align: "end", cell: (row) => context.money(row.amountMinor) },
          ]}
          empty={<Empty title="Nothing is held" />} />
        <Notice tone="warning" title="A basket left before checkout leaves no record">
          Recovery usually works from abandoned baskets. This storefront only writes a record when checkout completes, so a basket someone walked away from is genuinely not known here rather than estimated.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title="Checkout fields" subtitle="What a visitor is asked for, and what is never asked">
        <DataGrid
          rows={[
            { id: "name", field: "Full name", required: "Required", why: "Needed on the delivery label" },
            { id: "email", field: "Email", required: "Required", why: "How the studio arranges payment" },
            { id: "address", field: "Address, city, postcode", required: "Required", why: "Delivery" },
            { id: "tax", field: "Tax treatment", required: "Chosen", why: "Resolves the rate through the tax engine" },
            { id: "card", field: "Card number, expiry, security code", required: "Never collected", why: "Card data must only ever reach a processor's hosted field" },
          ]}
          rowId={(row) => row.id}
          label="Checkout fields"
          filterable={false}
          columns={[
            { key: "field", header: "Field", primary: true, cell: (row) => row.field },
            { key: "required", header: "State", cell: (row) => <Pill tone={row.required === "Never collected" ? "danger" : row.required === "Required" ? "success" : "info"}>{row.required}</Pill> },
            { key: "why", header: "Why", cell: (row) => row.why },
          ]}
        />
      </Card>
      <Card span={5} title="What happens at the end" subtitle="The payment boundary, stated plainly">
        <Stack gap={3}>
          <KeyValueList items={[
            { label: "On submit", value: "An order record is created" },
            { label: "Status", value: <Pill tone="warning" dot>awaiting_payment</Pill> },
            { label: "Lines kept", value: "Every line with quantity, unit price and tax code" },
            { label: "Event written", value: <code>commerce.payment.not_connected</code> },
            { label: "Charged", value: "Nothing" },
          ]} />
          <Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/commerce/storefront?tab=Preview`)}>Open the storefront preview</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- COMMERCE-009 ---------------------------- */

export function Fulfilment({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org } = useWorkspace();
  const stages: Record<string, string[]> = {
    Pick: ["unfulfilled", "picking", "partially_shipped"],
    Pack: ["packed"],
    Ship: ["shipped"],
    Track: ["in_transit", "delivered"],
    Exceptions: ["exception"],
  };
  const rows = data.orders.filter((order) => (stages[lens] ?? []).includes(String(order.fields.fulfilment ?? order.status)));

  if (lens === "Exceptions") {
    return rows.length === 0
      ? <Empty title="No exceptions" icon={<PackageCheck size={20} />}>An exception is recorded when a carrier response is missing or a consignment cannot be traced.</Empty>
      : (
        <Stack gap={3}>
          <Notice tone="danger" title="A second label is never created automatically">
            Without a carrier API there is no way to tell a lost consignment from an unscanned one. Each exception needs a person to decide, so no duplicate label and no duplicate charge can be produced by a retry.
          </Notice>
          {rows.map((order) => (
            <Card key={order.id} title={order.title} subtitle={order.summary}
              actions={<Pill tone="danger" dot>Exception</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("delivery exception", { id: order.id })}>Record a decision</Button>
                <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/commerce/orders/${order.id}`)}>Open order</Button>
              </>}>
              <KeyValueList items={[
                { label: "Carrier", value: String(order.fields.carrier) || "Not recorded" },
                { label: "Tracking", value: String(order.fields.tracking) || "None — nothing was scanned" },
                { label: "Value", value: context.money(order.amountMinor) },
              ]} />
            </Card>
          ))}
        </Stack>
      );
  }

  return (
    <Stack gap={4}>
      <div className="t4-board">
        {Object.keys(stages).map((stage) => {
          const here = data.orders.filter((order) => (stages[stage] ?? []).includes(String(order.fields.fulfilment ?? order.status)));
          return (
            <div key={stage} className="t4-board-col">
              <h4>{stage} <span className="ds-tab-count">{here.length}</span></h4>
              {here.length === 0 ? <span className="ds-subtle">Empty</span> : here.map((order) => (
                <button key={order.id} type="button" className="ds-record-card" onClick={() => context.navigate(`/o/${org.slug}/commerce/orders/${order.id}`)}>
                  <Row gap={2}><strong className="ds-grow" style={{ textAlign: "start" }}>{order.title}</strong><span className="ds-num">{context.money(order.amountMinor)}</span></Row>
                  <span className="ds-subtle">{(bodyOf<OrderBody>(order, {}).lines ?? []).reduce((sum, line) => sum + line.quantity, 0)} units · {String(order.fields.carrier) || "no carrier"}</span>
                  {String(order.fields.fulfilment) === "partially_shipped" && <Pill tone="info">Part shipped · {lineProgress(order).reduce((sum, row) => sum + row.ordered - row.shipped, 0)} to go</Pill>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <Card title={`${lens} queue`} subtitle={`${rows.length} orders in this stage`} flush>
        <DataGrid rows={rows} rowId={(row) => row.id} label={`${lens} queue`}
          onSelect={(id) => context.select(id)}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "units", header: "Units", align: "end", cell: (row) => String((bodyOf<OrderBody>(row, {}).lines ?? []).reduce((sum, line) => sum + line.quantity, 0)) },
            { key: "shipments", header: "Shipments", cell: (row) => {
              const shipments = shipmentsOf(row);
              const left = lineProgress(row).reduce((sum, item) => sum + item.remaining, 0);
              return shipments.length ? <span className="ds-num">{shipments.length} · {left} left</span> : <span className="ds-subtle">None</span>;
            } },
            { key: "warehouse", header: "From", cell: (row) => warehouseName(data.warehouses, String(row.fields.warehouseId)) },
            { key: "carrier", header: "Carrier", cell: (row) => String(row.fields.carrier) || <span className="ds-subtle">Not chosen</span> },
            { key: "tracking", header: "Tracking", cell: (row) => String(row.fields.tracking) || <span className="ds-subtle">None</span>, hideBelow: 1100 },
          ]}
          bulkActions={[
            { label: "Fulfil lines", disabled: (selected) => selected.length !== 1, onRun: (selected) => context.openOverlay("fulfil lines", { id: selected[0].id }) },
            { label: "Choose a carrier", disabled: (selected) => selected.length === 0, onRun: (selected) => context.openOverlay("Carrier selector", { ids: selected.map((order) => order.id) }) },
          ]}
          empty={<Empty title={`Nothing in ${lens.toLowerCase()}`} icon={<Truck size={20} />} />} />
      </Card>
    </Stack>
  );
}

/* ---------------------------- COMMERCE-010 ---------------------------- */

export function Returns({ context, state }: { context: ScreenContext; state: string }) {
  const data = useCommerceData();
  const map: Record<string, string[]> = { Requested: ["requested"], "In review": ["in_review"], Approved: ["approved"], Completed: ["completed"] };
  const rows = data.returns.filter((item) => (map[state] ?? []).includes(item.status));

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} returns`} icon={<RotateCcw size={20} />}
      action={state === "Requested" ? <Button variant="secondary" onClick={() => context.openOverlay("raise return")}>Raise a return</Button> : undefined}>
      A return is raised against a shipped order line with a reason. Refunds are recorded against it once made outside Arlovi.
    </Empty>;
  }

  return (
    <Stack gap={4}>
      {rows.some((item) => item.tags.includes("disputed")) && (
        <Notice tone="danger" title="A disputed return is escalated, not decided here">
          A high-value dispute needs a person with authority to settle it. The policy engine stops at eligibility; it never approves a refund that the customer is contesting.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${state} returns`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Return inspector", { id })}
        rowTone={(row) => (row.tags.includes("disputed") ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Return", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "order", header: "Order", cell: (row) => data.orders.find((order) => order.id === String(row.fields.orderId))?.title ?? "—" },
          { key: "product", header: "Product", cell: (row) => data.products.find((product) => product.id === String(row.fields.productId))?.title ?? "—" },
          { key: "reason", header: "Reason", cell: (row) => String(row.fields.reason ?? "").replace("_", " ") || <span className="ds-subtle">Not given</span> },
          { key: "photos", header: "Photos", align: "end", cell: (row) => (Number(row.fields.photos ?? 0) ? String(row.fields.photos) : <span className="ds-subtle">None</span>) },
          { key: "eligible", header: "Eligibility", cell: (row) => {
            const order = data.orders.find((item) => item.id === String(row.fields.orderId));
            const days = order?.at ? Math.round((new Date(row.at ?? row.createdAt).getTime() - new Date(order.at).getTime()) / 86_400_000) : undefined;
            if (days === undefined) return <Pill tone="warning">No order date</Pill>;
            return days <= 14 ? <Pill tone="success">Within 14 days</Pill> : <Pill tone="warning">{days} days after the order</Pill>;
          } },
          { key: "refund", header: "Refund", cell: (row) => { const state = refundStateLabel(row.fields.refundState); return <Pill tone={state.tone}>{state.label}</Pill>; } },
          { key: "refunded", header: "Refunded", align: "end", hideBelow: 1000, cell: (row) => <span className="ds-num">{context.money(refundedMinor(row))}</span>, sortValue: (row) => refundedMinor(row) },
          { key: "value", header: "Value", align: "end", cell: (row) => context.money(row.amountMinor), sortValue: (row) => row.amountMinor ?? 0 },
        ]}
        bulkActions={[
          { label: "Assess restocking", disabled: (selected) => selected.length === 0, onRun: (selected) => context.openOverlay("restock assessment", { ids: selected.map((item) => item.id) }) },
          { label: "Record a refund", disabled: (selected) => selected.length !== 1 || selected.some((item) => item.tags.includes("disputed") || refundableMinor(item) === 0), onRun: (selected) => context.openOverlay("refund authorization", { id: selected[0]?.id }) },
        ]}
      />
    </Stack>
  );
}

/* ---------------------------- COMMERCE-011 ---------------------------- */

export function Promotions({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { now } = useWorkspace();

  if (lens === "Codes") {
    const codes = data.promotions.filter((promotion) => String(promotion.fields.code ?? ""));
    return codes.length === 0
      ? <Empty title="No discount codes" icon={<Tags size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Offer builder")}>Create an offer</Button>} />
      : (
        <DataGrid rows={codes} rowId={(row) => row.id} label="Discount codes"
          onSelect={(id) => context.select(id)}
          columns={[
            { key: "code", header: "Code", primary: true, cell: (row) => <code>{String(row.fields.code)}</code>, filterValue: (row) => String(row.fields.code) },
            { key: "title", header: "Offer", cell: (row) => row.title },
            { key: "value", header: "Value", align: "end", cell: (row) => (String(row.fields.kind) === "percent" || String(row.fields.kind) === "code" ? `${row.fields.value}%` : context.money(Number(row.fields.value ?? 0))) },
            { key: "uses", header: "Uses", align: "end", cell: (row) => String(row.fields.uses ?? 0) },
            { key: "stack", header: "Stacking", cell: (row) => (row.fields.stackable === true ? <Pill tone="warning">Stackable</Pill> : <Pill>Exclusive</Pill>) },
            { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status}</Pill> },
          ]} />
      );
  }

  if (lens === "Rules") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Stacking cannot breach the margin floor">
          Each offer records a minimum margin. When two stackable offers would take a line below its floor, the second is refused and the reason is shown to the person applying it, rather than silently selling at a loss.
        </Notice>
        <DataGrid rows={data.promotions} rowId={(row) => row.id} label="Price rules" filterable={false}
          columns={[
            { key: "title", header: "Offer", primary: true, cell: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind)}</Pill> },
            { key: "audience", header: "Applies to", cell: (row) => String(row.fields.audience ?? "all") },
            { key: "min", header: "Minimum", cell: (row) => (row.fields.minQuantity ? `${row.fields.minQuantity} units` : row.fields.minSpendMinor ? context.money(Number(row.fields.minSpendMinor)) : "None") },
            { key: "floor", header: "Margin floor", align: "end", cell: (row) => `${(Number(row.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%` },
            { key: "stack", header: "Stackable", cell: (row) => (row.fields.stackable === true ? "Yes" : "No") },
          ]} />
      </Stack>
    );
  }

  if (lens === "History") {
    const past = data.promotions.filter((promotion) => promotion.status === "ended");
    return past.length === 0
      ? <Empty title="No finished offers" />
      : (
        <DataGrid rows={past} rowId={(row) => row.id} label="Finished offers" filterable={false}
          columns={[
            { key: "title", header: "Offer", primary: true, cell: (row) => row.title },
            { key: "window", header: "Ran", cell: (row) => `${context.date(row.startAt)} – ${context.date(row.endAt)}` },
            { key: "uses", header: "Uses", align: "end", cell: (row) => String(row.fields.uses ?? 0) },
            { key: "value", header: "Discount", align: "end", cell: (row) => (String(row.fields.kind) === "amount" ? context.money(Number(row.fields.value ?? 0)) : `${row.fields.value}%`) },
          ]} />
      );
  }

  return (
    <Grid>
      {data.promotions.map((promotion) => {
        const live = promotion.status === "active" && (!promotion.endAt || new Date(promotion.endAt) > now);
        return (
          <Card key={promotion.id} span={6} title={promotion.title} subtitle={promotion.summary}
            actions={<Pill tone={live ? "success" : statusTone(promotion.status)} dot>{live ? "Live" : promotion.status}</Pill>}
            footer={<>
              <Button size="sm" variant={context.selectedId === promotion.id ? "primary" : "secondary"} aria-pressed={context.selectedId === promotion.id} onClick={() => context.select(context.selectedId === promotion.id ? undefined : promotion.id)}>{context.selectedId === promotion.id ? "Selected" : "Select"}</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Offer builder", { id: promotion.id })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("margin check", { id: promotion.id })}>Margin check</Button>
              {live && <Button size="sm" variant="ghost" onClick={async () => {
                await context.mutate.patch(promotion.id, { status: "paused" }, { expectRevision: promotion.revision, event: `${promotion.title} paused` });
                context.toast("Paused", `${promotion.title} no longer applies at checkout in this workspace.`);
              }}>Pause</Button>}
            </>}>
            <KeyValueList items={[
              { label: "Kind", value: `${String(promotion.fields.kind)} · ${String(promotion.fields.kind) === "amount" ? context.money(Number(promotion.fields.value ?? 0)) : `${promotion.fields.value}%`}` },
              { label: "Code", value: String(promotion.fields.code) || "No code — applied by rule" },
              { label: "Window", value: `${context.date(promotion.startAt)} – ${context.date(promotion.endAt)}` },
              { label: "Audience", value: String(promotion.fields.audience ?? "all") },
              { label: "Margin floor", value: `${(Number(promotion.fields.floorMarginBp ?? 0) / 100).toFixed(0)}%` },
              { label: "Uses", value: String(promotion.fields.uses ?? 0) },
            ]} />
          </Card>
        );
      })}
      {data.promotions.length === 0 && <Empty title="No offers" icon={<Tags size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Offer builder")}>Create an offer</Button>} />}
    </Grid>
  );
}

/* ---------------------------- COMMERCE-012 ---------------------------- */

export function CommerceAnalytics({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCommerceData();
  const { org, now } = useWorkspace();
  const [includeReturns, setIncludeReturns] = useState(true);
  const live = data.orders.filter((order) => order.status !== "cancelled");
  const refunded = data.returns.filter((item) => item.status === "completed").reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
  const gross = live.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
  const net = includeReturns ? gross - refunded : gross;

  if (lens === "Products") {
    const rows = data.products.map((product) => {
      const lines = live.flatMap((order) => bodyOf<OrderBody>(order, {}).lines ?? []).filter((line) => line.productId === product.id);
      const returned = data.returns.filter((item) => String(item.fields.productId) === product.id).reduce((sum, item) => sum + Number(item.fields.quantity ?? 0), 0);
      const units = lines.reduce((sum, line) => sum + line.quantity, 0);
      return { product, units, value: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0), returned, rate: units === 0 ? 0 : returned / units };
    }).filter((row) => row.units > 0 || row.returned > 0);
    return (
      <DataGrid rows={rows} rowId={(row) => row.product.id} label="Product performance"
        columns={[
          { key: "title", header: "Product", primary: true, cell: (row) => row.product.title, filterValue: (row) => row.product.title },
          { key: "units", header: "Units sold", align: "end", cell: (row) => String(row.units), sortValue: (row) => row.units },
          { key: "value", header: "Line value", align: "end", cell: (row) => context.money(row.value), sortValue: (row) => row.value },
          { key: "returned", header: "Units returned", align: "end", cell: (row) => String(row.returned) },
          { key: "rate", header: "Return rate", align: "end", cell: (row) => (row.units === 0 ? <span className="ds-subtle">No sales</span> : `${(row.rate * 100).toFixed(1)}%`) },
          { key: "margin", header: "Margin at list", align: "end", cell: (row) => (row.product.fields.unitCostMinor ? `${(marginOf(row.product).marginBp / 100).toFixed(1)}%` : <span className="ds-subtle">No cost</span>) },
        ]} />
    );
  }

  if (lens === "Customers") {
    const rows = data.contacts.map((contact) => {
      const theirs = live.filter((order) => String(order.fields.contactId) === contact.id);
      return { contact, orders: theirs.length, value: theirs.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0) };
    }).filter((row) => row.orders > 0).sort((a, b) => b.value - a.value);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Customers with an order" value={String(rows.length)} meta={`of ${data.contacts.length} contacts`} />
          <Stat label="Repeat customers" value={String(rows.filter((row) => row.orders > 1).length)} meta="More than one order recorded here" />
          <Stat label="Average per customer" value={rows.length ? context.money(Math.round(rows.reduce((sum, row) => sum + row.value, 0) / rows.length)) : "Unavailable"} unavailable={rows.length === 0} meta="Order value divided by customers" />
          <Stat label="Lifetime value model" value="Unavailable" unavailable meta="Needs a first-order date, which is not stored" />
        </StatRow>
        <DataGrid rows={rows} rowId={(row) => row.contact.id} label="Customers by value" filterable={false}
          columns={[
            { key: "title", header: "Customer", primary: true, cell: (row) => row.contact.title },
            { key: "segment", header: "Segment", cell: (row) => <Pill>{String(row.contact.fields.segment ?? "")}</Pill> },
            { key: "orders", header: "Orders", align: "end", cell: (row) => String(row.orders) },
            { key: "value", header: "Value", align: "end", cell: (row) => context.money(row.value), sortValue: (row) => row.value },
          ]} />
      </Stack>
    );
  }

  if (lens === "Operations") {
    const shipped = live.filter((order) => ["shipped", "in_transit", "delivered"].includes(String(order.fields.fulfilment ?? order.status)));
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Orders shipped" value={String(shipped.length)} meta={`of ${live.length} orders`} />
          <Stat label="Exceptions" value={String(live.filter((order) => order.status === "exception").length)} meta="Carrier response missing" />
          <Stat label="Average days to ship" value="Unavailable" unavailable meta="Only one timestamp per state is recorded" onClick={() => context.openOverlay("KPI inspector", { metric: "speed" })} />
          <Stat label="Return rate" value={`${live.length === 0 ? 0 : ((data.returns.length / live.length) * 100).toFixed(1)}%`} meta={`${data.returns.length} returns over ${live.length} orders`} />
        </StatRow>
        <Notice tone="warning" title="Fulfilment speed cannot be computed honestly">
          Each order keeps a timeline of what happened, but not every state carries a timestamp, and the seeded ones were written at the same moment. Showing an average here would be arithmetic on data that does not support it.
        </Notice>
      </Stack>
    );
  }

  const months = [4, 3, 2, 1, 0].map((back) => {
    const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
    const inMonth = live.filter((order) => order.at && new Date(order.at) >= month && new Date(order.at) < next);
    return { label: month.toLocaleString(org.locale, { month: "short" }), value: inMonth.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0) };
  });

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Returns treatment">
          <Select value={includeReturns ? "net" : "gross"} onChange={(event) => setIncludeReturns(event.target.value === "net")}>
            <option value="net">Net of completed returns</option>
            <option value="gross">Gross, before returns</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => context.openOverlay("KPI inspector", { metric: "returns" })}>What is included</Button>
      </Row>
      <StatRow>
        <Stat label={includeReturns ? "Net of returns" : "Gross"} value={context.money(net)} meta={includeReturns ? `${context.money(refunded)} of completed returns deducted` : "No returns deducted"} />
        <Stat label="Orders" value={String(live.length)} meta="Cancellations excluded" />
        <Stat label="Average order" value={live.length ? context.money(Math.round(gross / live.length)) : "Unavailable"} unavailable={live.length === 0} meta="Gross divided by orders" />
        <Stat label="Conversion" value="Unavailable" unavailable meta="No session is recorded, so there is no denominator" />
      </StatRow>
      <Card title="Order value by month" subtitle={includeReturns ? "Completed returns are deducted from the month they completed" : "Before any return"}>
        <BarChart title="Order value by month" height={220} format={(value) => context.money(value)} series={[{ name: includeReturns ? "Net" : "Gross", points: months }]} />
      </Card>
      <Notice tone="info" title="Which returns are included">
        Only returns with the state <code>completed</code> are deducted. Requested, in-review and approved returns are shown in the Returns screen but are not taken off sales, because the money has not moved.
      </Notice>
    </Stack>
  );
}
