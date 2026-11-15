import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Button, Card, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice, Pill,
  Properties, Row, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import { Boxes, FileText, PackageCheck, Truck, Warehouse } from "lucide-react";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import { ProviderBoundary } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  approverFor, bodyOf, isPurchaseOrder, isRequisition, MATCH_LABEL, matchTone,
  statusTone, threeWayMatch, useProcData,
  type ContractBody, type PoBody, type SupplierBody,
} from "./data";

/* ====================================================================== *
 * PROC panels — suppliers, requisitions with approval, purchase orders,
 * goods receipt and the three-way match against supplier invoices.
 * ====================================================================== */

function supplierOf(data: ReturnType<typeof useProcData>, record: Rec | undefined): Rec | undefined {
  return data.suppliers.find((item) => item.id === String(record?.fields.supplierId ?? ""));
}

/* ---------------------------- PROC-001 ---------------------------- */

export function ProcurementOverview({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const { org, now } = useWorkspace();
  const requisitions = data.purchaseOrders.filter(isRequisition);
  const orders = data.purchaseOrders.filter(isPurchaseOrder);
  const awaiting = requisitions.filter((item) => item.status === "awaiting_approval");
  const openOrders = orders.filter((item) => ["approved", "sent"].includes(item.status));
  const dueReceipts = data.receipts.filter((receipt) => receipt.status === "expected");
  const overdue = dueReceipts.filter((receipt) => receipt.dueAt && new Date(receipt.dueAt) < now);
  const blockedBills = data.bills.filter((bill) => threeWayMatch(bill, data.purchaseOrders, data.receipts).state !== "matched");

  if (lens === "Approvals") {
    return (
      <Stack gap={4}>
        {awaiting.length === 0 ? (
          <Empty title="Nothing is waiting for approval" icon={<FileText size={20} />}>A requisition appears here when it is submitted for a decision.</Empty>
        ) : (
          <DataGrid rows={awaiting} rowId={(row) => row.id} label="Requisitions awaiting approval" filterable={false}
            onSelect={(id) => context.select(id)}
            columns={[
              { key: "title", header: "Requisition", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
              { key: "requester", header: "Requester", cell: (row) => String(row.fields.requester ?? row.ownerName) },
              { key: "budget", header: "Budget line", cell: (row) => String(row.fields.budgetLine ?? "—") },
              { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span>, sortValue: (row) => row.amountMinor ?? 0 },
              { key: "approver", header: "Needs", cell: (row) => <Pill tone="warning">{approverFor(row.amountMinor ?? 0)}</Pill> },
              { key: "priority", header: "Priority", cell: (row) => <Pill tone={String(row.fields.priority) === "high" ? "danger" : "neutral"}>{String(row.fields.priority ?? "normal")}</Pill> },
            ]}
            bulkActions={[{ label: "Review", disabled: (rows) => rows.length !== 1, onRun: (rows) => context.openOverlay("Requisition", { id: rows[0].id }) }]} />
        )}
        <Card eyebrow="INVOICES" prov="posted" title="Supplier invoices that cannot be paid" subtitle={`${blockedBills.length} blocked by the three-way match`} flush>
          <DataGrid rows={blockedBills} rowId={(row) => row.id} label="Blocked invoices" filterable={false}
            onOpen={(id) => context.openOverlay("cost inspector", { id })}
            columns={[
              { key: "title", header: "Invoice", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
              { key: "supplier", header: "Supplier", cell: (row) => supplierOf(data, row)?.title ?? "—" },
              { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
              { key: "state", header: "Match", cell: (row) => {
                const match = threeWayMatch(row, data.purchaseOrders, data.receipts);
                return <Pill tone={matchTone(match.state)} dot>{MATCH_LABEL[match.state]}</Pill>;
              } },
            ]}
            empty={<Empty title="Every invoice matches its order and receipt" />} />
        </Card>
      </Stack>
    );
  }

  if (lens === "Suppliers") {
    return (
      <Grid>
        {data.suppliers.filter((supplier) => supplier.status !== "archived").map((supplier) => {
          const theirOrders = orders.filter((order) => String(order.fields.supplierId) === supplier.id);
          const exposure = theirOrders.filter((order) => ["approved", "sent"].includes(order.status)).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0);
          return (
            <Card key={supplier.id} span={4} eyebrow={String(supplier.fields.category ?? "").toUpperCase()} prov="human"
              title={<Link to={`/o/${org.slug}/proc/suppliers/${supplier.id}`} style={{ color: "inherit", textDecoration: "none" }}>{supplier.title}</Link>}
              subtitle={supplier.summary}
              actions={<Pill tone={supplier.status === "approved" ? "success" : "warning"}>{supplier.status}</Pill>}>
              <Properties rows={[
                { label: "Open exposure", value: <span className="ds-num">{context.money(exposure)}</span> },
                { label: "On time", value: <span className="ds-num">{String(supplier.fields.onTimeRatePct ?? "—")}%</span> },
                { label: "Lead time", value: <span className="ds-num">{String(supplier.fields.leadTimeDays ?? "—")} days</span> },
                { label: "Terms", value: String(supplier.fields.terms ?? "—") },
              ]} />
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Stock") {
    const atRisk = data.products.filter((product) => product.status === "active").map((product) => {
      const onHand = data.stockMoves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
      const inbound = orders.filter((order) => ["approved", "sent"].includes(order.status))
        .flatMap((order) => bodyOf<PoBody>(order, {}).lines ?? [])
        .filter((line) => line.productId === product.id)
        .reduce((sum, line) => sum + (line.quantity - line.receivedQuantity), 0);
      return { product, onHand, inbound, point: Number(product.fields.reorderPoint ?? 0), lead: Number(product.fields.leadTimeDays ?? 0) };
    }).filter((row) => row.onHand <= row.point);
    return atRisk.length === 0
      ? <Empty title="Nothing is below its reorder point" icon={<Boxes size={20} />} />
      : (
        <DataGrid rows={atRisk} rowId={(row) => row.product.id} label="Stock at risk" filterable={false}
          columns={[
            { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
            { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className="ds-num">{String(row.onHand)}</span> },
            { key: "point", header: "Reorder point", align: "end", cell: (row) => <span className="ds-num">{String(row.point)}</span> },
            { key: "inbound", header: "On order", align: "end", cell: (row) => (row.inbound ? <span className="ds-num">{String(row.inbound)}</span> : <span className="ds-subtle">None</span>) },
            { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.lead)} days</span> },
            { key: "risk", header: "Risk", cell: (row) => <Pill tone={row.inbound > 0 ? "warning" : "danger"} dot>{row.inbound > 0 ? "Covered by an order" : "Nothing on order"}</Pill> },
          ]} />
      );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Awaiting approval" value={String(awaiting.length)} prov="human" meta={context.money(awaiting.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0))} onClick={() => context.setTab("Approvals")} />
        <Stat label="Open purchase orders" value={String(openOrders.length)} prov="human" meta={context.money(openOrders.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0))} />
        <Stat label="Receipts due" value={String(dueReceipts.length)} prov="human" meta={`${overdue.length} overdue`} onClick={() => context.navigate(`/o/${org.slug}/proc/receiving`)} />
        <Stat label="Invoices blocked" value={String(blockedBills.length)} prov="posted" meta="Three-way match does not agree" />
        <Stat label="Supplier portal feeds" value="Unavailable" unavailable meta="No supplier system is connected" />
      </StatRow>

      <Grid>
        <Card span={7} eyebrow="COMMITMENTS" prov="human" title="Open commitments by supplier" subtitle="Approved and sent orders only; cancellations are excluded">
          <BarChart
            title="Open commitment by supplier"
            height={210}
            format={(value) => context.money(value)}
            series={[{
              name: "Committed",
              points: data.suppliers.filter((supplier) => supplier.status !== "archived").map((supplier) => ({
                label: supplier.title.split(" ")[0],
                value: openOrders.filter((order) => String(order.fields.supplierId) === supplier.id).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0),
              })),
            }]}
            footer="A commitment is an approved or sent order. Nothing was transmitted to a supplier, because no supplier connection exists."
          />
        </Card>
        <Card span={5} eyebrow="RECEIPTS" prov="human" title="What is expected" subtitle={`${dueReceipts.length} deliveries outstanding`}>
          <Stack gap={2}>
            {dueReceipts.map((receipt) => {
              const age = freshness(receipt.dueAt, now, 0);
              return (
                <Row key={receipt.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <strong className="ds-num">{receipt.title}</strong>
                    <p className="ds-subtle">{supplierOf(data, receipt)?.title ?? "—"} · expected {context.date(receipt.dueAt)}</p>
                  </div>
                  <Pill tone={age.known && age.days > 0 ? "danger" : "warning"} dot>{age.known && age.days > 0 ? `${age.days} days late` : "Due"}</Pill>
                </Row>
              );
            })}
            {dueReceipts.length === 0 && <span className="ds-subtle">Nothing is expected.</span>}
          </Stack>
        </Card>
      </Grid>
      <ProviderBoundary id="email.send" title="Orders are not transmitted to suppliers" />
    </Stack>
  );
}

/* ---------------------------- PROC-002 ---------------------------- */

export function Suppliers({ context, state }: { context: ScreenContext; state: string }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const map: Record<string, string[]> = { All: [], Approved: ["approved"], Review: ["review"], Archived: ["archived"] };
  const wanted = map[state] ?? [];
  const rows = wanted.length === 0 ? data.suppliers : data.suppliers.filter((supplier) => wanted.includes(supplier.status));

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} suppliers`} icon={<Truck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Supplier form")}>Add a supplier</Button>} />;
  }

  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${state} suppliers`}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/proc/suppliers/${id}`)}
      rowTone={(row) => (row.status === "review" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Supplier", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "category", header: "Category", cell: (row) => <Pill>{String(row.fields.category ?? "—")}</Pill> },
        { key: "contact", header: "Contact", cell: (row) => String(row.fields.contactName ?? "—"), hideBelow: 1100 },
        { key: "terms", header: "Terms", cell: (row) => String(row.fields.terms ?? "—") },
        { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.leadTimeDays ?? "—")}d</span>, sortValue: (row) => Number(row.fields.leadTimeDays ?? 0) },
        { key: "ontime", header: "On time", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.onTimeRatePct ?? "—")}%</span>, sortValue: (row) => Number(row.fields.onTimeRatePct ?? 0) },
        { key: "spend", header: "Spend to date", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.fields.spendToDateMinor ?? 0))}</span>, sortValue: (row) => Number(row.fields.spendToDateMinor ?? 0) },
        { key: "bank", header: "Bank detail", cell: (row) => (String(row.fields.bankLast4) ? <Pill tone="success">Verified ···{String(row.fields.bankLast4)}</Pill> : <Pill tone="warning">Not verified</Pill>) },
        { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status}</Pill> },
      ]}
      summary={<span>{rows.length} of {data.suppliers.length} suppliers</span>}
    />
  );
}

/* ---------------------------- PROC-003 ---------------------------- */

export function SupplierDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const { org, now } = useWorkspace();
  const supplier = useRecord(context.params.id) ?? data.suppliers[0];
  if (!supplier) return <Empty title="Supplier not found" />;
  const orders = data.purchaseOrders.filter((order) => String(order.fields.supplierId) === supplier.id && isPurchaseOrder(order));
  const bills = data.bills.filter((bill) => String(bill.fields.supplierId) === supplier.id);
  const contracts = data.contracts.filter((contract) => String(contract.fields.supplierId) === supplier.id);
  const body = bodyOf<SupplierBody>(supplier, {});

  if (lens === "Contracts") {
    return contracts.length === 0
      ? <Empty title="No contract recorded" icon={<FileText size={20} />} />
      : (
        <Stack gap={3}>
          {contracts.map((contract) => {
            const clauses = bodyOf<ContractBody>(contract, {}).clauses ?? [];
            const high = clauses.filter((clause) => clause.risk === "high");
            return (
              <Card key={contract.id} eyebrow="CONTRACT" prov="human" title={contract.title} subtitle={contract.summary}
                actions={<Pill tone={statusTone(contract.status)} dot>{contract.status.replace("_", " ")}</Pill>}
                footer={<Button size="sm" variant="secondary" onClick={() => { context.select(contract.id); context.openOverlay("contract viewer", { id: contract.id }); }}>Open clauses</Button>}>
                <Stack gap={3}>
                  <Properties rows={[
                    { label: "Value", value: <span className="ds-num">{context.money(contract.amountMinor)}</span> },
                    { label: "Review by", value: <span className="ds-num">{context.date(contract.dueAt)}</span> },
                    { label: "Renewal", value: String(contract.fields.renewal ?? "—") },
                    { label: "Notice", value: <span className="ds-num">{String(contract.fields.noticeDays ?? 0)} days</span> },
                    { label: "Signed", value: contract.fields.signed === true ? <Pill tone="success">Signed</Pill> : <Pill tone="warning">Not signed — no e-signature provider</Pill> },
                    { label: "Reviewed by", value: String(contract.fields.reviewedBy || "Nobody yet") },
                  ]} />
                  {high.length > 0 && (
                    <Notice tone="danger" title={`${high.length} clause${high.length === 1 ? "" : "s"} need qualified review`}>
                      {high.map((clause) => clause.title).join(", ")}. These are read and summarised here, not interpreted: a clause of this kind needs someone qualified to advise on it.
                    </Notice>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Stack>
      );
  }

  if (lens === "Orders") {
    return (
      <Stack gap={4}>
        <DataGrid rows={orders} rowId={(row) => row.id} label="Orders with this supplier" filterable={false}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.navigate(`/o/${org.slug}/proc/orders?tab=Sent&id=${id}`)}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
            { key: "placed", header: "Placed", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
            { key: "due", header: "Due", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span> },
            { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
            { key: "received", header: "Received", cell: (row) => {
              const lines = bodyOf<PoBody>(row, {}).lines ?? [];
              const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
              const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
              return <Meter value={received} max={ordered || 1} label={`${row.title} received`} tone={received < ordered ? "warning" : "success"} />;
            } },
            { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status}</Pill> },
          ]} />
        <Card eyebrow="THREE-WAY MATCH" prov="posted" title="Invoices from this supplier" subtitle="Order, receipt and invoice compared line by line" flush>
          <DataGrid rows={bills} rowId={(row) => row.id} label="Supplier invoices" filterable={false}
            onOpen={(id) => context.openOverlay("three-way match", { id })}
            columns={[
              { key: "title", header: "Invoice", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
              { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
              { key: "po", header: "Order", cell: (row) => data.purchaseOrders.find((order) => order.id === String(row.fields.purchaseOrderId))?.title ?? <span className="ds-subtle">None</span> },
              { key: "match", header: "Match", cell: (row) => {
                const match = threeWayMatch(row, data.purchaseOrders, data.receipts);
                return <Pill tone={matchTone(match.state)} dot>{MATCH_LABEL[match.state]}</Pill>;
              } },
              { key: "payment", header: "Payment", cell: (row) => <Pill tone={String(row.fields.payment) === "paid_local" ? "success" : "warning"}>{String(row.fields.payment ?? "").replace("_", " ")}</Pill> },
            ]}
            empty={<Empty title="No invoices from this supplier" />} />
        </Card>
      </Stack>
    );
  }

  if (lens === "Communications") {
    return (
      <Stack gap={4}>
        <ProviderBoundary id="email.send" title="Nothing has been sent to this supplier" />
        <Card eyebrow="ON FILE" prov="human" title="What is recorded" subtitle="Contact details held in this workspace">
          <Properties rows={[
            { label: "Contact", value: String(supplier.fields.contactName ?? "—") },
            { label: "Email", value: String(supplier.fields.email ?? "—") },
            { label: "City", value: String(supplier.fields.city ?? "—") },
            { label: "Terms", value: String(supplier.fields.terms ?? "—") },
            { label: "Notes", value: body.notes || "None" },
          ]} />
        </Card>
      </Stack>
    );
  }

  const deliveries = body.deliveries ?? [];
  const late = deliveries.filter((delivery) => delivery.lateDays > 0);
  return (
    <Grid>
      <Card span={5} eyebrow="SUPPLIER" prov="human" title={supplier.title} subtitle={supplier.summary}
        actions={<Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill>}>
        <Properties rows={[
          { label: "Category", value: String(supplier.fields.category ?? "—") },
          { label: "Contact", value: String(supplier.fields.contactName ?? "—") },
          { label: "Email", value: String(supplier.fields.email ?? "—") },
          { label: "Terms", value: String(supplier.fields.terms ?? "—") },
          { label: "Lead time", value: <span className="ds-num">{String(supplier.fields.leadTimeDays ?? "—")} days</span> },
          { label: "Tax status", value: String(supplier.fields.taxStatus ?? "unknown").replace("_", " ") },
          { label: "Approved by", value: String(supplier.fields.approvedBy || "Not approved") },
        ]} />
      </Card>
      <Card span={7} eyebrow="PERFORMANCE" prov="posted" title="Delivery performance" subtitle={`${deliveries.length} recorded deliveries, ${late.length} late`}>
        <Stack gap={3}>
          <StatRow>
            <Stat label="On time" value={`${supplier.fields.onTimeRatePct ?? "—"}%`} prov="posted" meta={`${deliveries.length - late.length} of ${deliveries.length} on the promised date`} />
            <Stat label="Quality accepted" value={`${supplier.fields.qualityRatePct ?? "—"}%`} prov="posted" meta="Receipts accepted without a damage flag" />
            <Stat label="Orders placed" value={String(supplier.fields.ordersPlaced ?? 0)} prov="posted" meta="Since the record was opened" />
            <Stat label="Spend to date" value={context.money(Number(supplier.fields.spendToDateMinor ?? 0))} prov="posted" meta="Excludes cancelled orders" />
          </StatRow>
          {late.length > 0 && (
            <Notice tone="warning" title={`${late.length} deliveries arrived late`}>
              The longest was {Math.max(...late.map((delivery) => delivery.lateDays))} days after the promised date. Lead times on this record are what the supplier states, not what they have achieved.
            </Notice>
          )}
        </Stack>
      </Card>
      <Card span={12} eyebrow="BANK DETAIL" prov={String(supplier.fields.bankLast4) ? "posted" : "unknown"} title="Payment details" subtitle="Changed only through a separate verification">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Account on file", value: String(supplier.fields.bankLast4) ? <span className="ds-num">ends ···{String(supplier.fields.bankLast4)}</span> : "None recorded" },
            { label: "Verified", value: String(supplier.fields.bankVerifiedAt) ? <span className="ds-num">{context.date(String(supplier.fields.bankVerifiedAt))}</span> : <Pill tone="warning">Never</Pill> },
            { label: "Age", value: String(supplier.fields.bankVerifiedAt) ? `${freshness(String(supplier.fields.bankVerifiedAt), now, 365).days} days` : "Unknown" },
          ]} />
          <Notice tone="danger" title="A bank change is the most common fraud in procurement">
            Changing these details is not an ordinary edit. It requires a separate verification against a known contact, recorded with who confirmed it, which is why the field is read-only here.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- PROC-004 ---------------------------- */

export function Requisitions({ context, state }: { context: ScreenContext; state: string }) {
  const data = useProcData();
  const { actor } = useWorkspace();
  const all = data.purchaseOrders.filter(isRequisition);
  const rows = state === "Mine" ? all.filter((item) => String(item.fields.requester ?? item.ownerName) === actor)
    : state === "Team" ? all
      : state === "Awaiting approval" ? all.filter((item) => item.status === "awaiting_approval")
        : all.filter((item) => ["approved", "rejected", "converted"].includes(item.status));

  if (rows.length === 0) {
    return <Empty title={`No requisitions in ${state.toLowerCase()}`} icon={<FileText size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Requisition form")}>Raise a requisition</Button>}>
      {state === "Mine" ? `Nothing raised by ${actor}.` : "A requisition records what is needed and who has to approve it before anything is committed."}
    </Empty>;
  }

  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${state} requisitions`}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.openOverlay("Requisition", { id })}
      rowTone={(row) => (row.status === "rejected" ? "danger" : row.status === "awaiting_approval" ? "warning" : undefined)}
      columns={[
        { key: "title", header: "Requisition", primary: true, cell: (row) => <span className="ds-num">{row.title}</span>, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "requester", header: "Requester", cell: (row) => String(row.fields.requester ?? row.ownerName) },
        { key: "budget", header: "Budget line", cell: (row) => String(row.fields.budgetLine ?? "—") },
        { key: "items", header: "Lines", align: "end", cell: (row) => <span className="ds-num">{String((bodyOf<PoBody>(row, {}).lines ?? []).length)}</span> },
        { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span>, sortValue: (row) => row.amountMinor ?? 0 },
        { key: "priority", header: "Priority", cell: (row) => <Pill tone={String(row.fields.priority) === "high" ? "danger" : "neutral"}>{String(row.fields.priority ?? "normal")}</Pill> },
        { key: "approver", header: "Approval", cell: (row) => (row.fields.approver ? <Pill tone="success">{String(row.fields.approver)}</Pill> : <Pill tone="warning">{approverFor(row.amountMinor ?? 0)} must approve</Pill>) },
        { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status.replace("_", " ")}</Pill> },
      ]}
      summary={<span>{rows.length} requisitions · {context.money(rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0))}</span>}
    />
  );
}

/* ---------------------------- PROC-005 ---------------------------- */

export function PurchaseOrders({ context, state }: { context: ScreenContext; state: string }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const orders = data.purchaseOrders.filter(isPurchaseOrder);
  const map: Record<string, string[]> = { Draft: ["draft"], Approved: ["approved"], Sent: ["sent"], Received: ["received"], Closed: ["closed", "cancelled"] };
  const rows = orders.filter((order) => (map[state] ?? []).includes(order.status));

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} purchase orders`} icon={<Truck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("PO editor")}>Raise a purchase order</Button>} />;
  }

  return (
    <Stack gap={4}>
      {state === "Sent" && (
        <Notice tone="warning" title="A sent order is a local record">
          No supplier connection exists, so sending means the order is marked as issued and versioned here. A revision bumps the version rather than creating a second order, which is what stops a double delivery.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${state} purchase orders`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("PO editor", { id })}
        columns={[
          { key: "title", header: "PO", primary: true, cell: (row) => <span className="ds-num">{row.title}</span>, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "supplier", header: "Supplier", cell: (row) => (
            <Link to={`/o/${org.slug}/proc/suppliers/${String(row.fields.supplierId)}`} style={{ color: "inherit" }}>{supplierOf(data, row)?.title ?? "—"}</Link>
          ) },
          { key: "lines", header: "Lines", align: "end", cell: (row) => <span className="ds-num">{String((bodyOf<PoBody>(row, {}).lines ?? []).length)}</span> },
          { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span>, sortValue: (row) => row.amountMinor ?? 0 },
          { key: "due", header: "Delivery due", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span>, sortValue: (row) => row.dueAt ?? "" },
          { key: "received", header: "Receipted", cell: (row) => {
            const lines = bodyOf<PoBody>(row, {}).lines ?? [];
            const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
            const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
            return <Row gap={2}><Meter value={received} max={ordered || 1} label={`${row.title} receipted`} tone={received < ordered ? "warning" : "success"} /><span className="ds-num">{received}/{ordered}</span></Row>;
          } },
          { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)}</span> },
          { key: "approval", header: "Approved by", cell: (row) => (row.fields.approver ? <Pill tone="success">{String(row.fields.approver)}</Pill> : <Pill tone="warning">Not approved</Pill>) },
        ]}
        bulkActions={[
          { label: "Receive against", disabled: (selected) => selected.length !== 1 || !["sent", "approved"].includes(selected[0].status), onRun: (selected) => context.openOverlay("receive", { id: selected[0].id }) },
          { label: "Send preview", disabled: (selected) => selected.length !== 1, onRun: (selected) => context.openOverlay("send preview", { id: selected[0].id }) },
        ]}
        summary={<span>{rows.length} orders · {context.money(rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0))}</span>}
      />
    </Stack>
  );
}

/* ---------------------------- PROC-006 ---------------------------- */

export function Warehouses({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const onHandAt = (warehouseId: string) =>
    data.stockMoves.filter((move) => String(move.fields.warehouseId) === warehouseId).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);

  if (lens === "Bins") {
    const bins = data.warehouses.flatMap((warehouse) =>
      Array.from({ length: Math.min(6, Number(warehouse.fields.bins ?? 0)) }, (_, index) => ({
        id: `${warehouse.id}-${index}`,
        warehouse,
        code: `${String(warehouse.fields.code ?? "W")}-${String(index + 1).padStart(2, "0")}`,
        used: data.stockMoves.filter((move) => String(move.fields.warehouseId) === warehouse.id && String(move.fields.bin ?? "") === `${String(warehouse.fields.code ?? "W")}-${String(index + 1).padStart(2, "0")}`).length,
      })));
    return (
      <Stack gap={4}>
        <DataGrid rows={bins} rowId={(row) => row.id} label="Bins" filterable={false}
          columns={[
            { key: "code", header: "Bin", primary: true, cell: (row) => <span className="ds-num">{row.code}</span> },
            { key: "warehouse", header: "Site", cell: (row) => row.warehouse.title },
            { key: "moves", header: "Movements recorded", align: "end", cell: (row) => <span className="ds-num">{String(row.used)}</span> },
          ]} />
        <Notice tone="warning" title="Bin-level stock is not tracked yet">
          Movements record the site, not the bin, so a bin shows the movements explicitly tagged to it rather than a calculated quantity. Counting by bin needs the scan step to capture it.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Capacity") {
    return (
      <Grid>
        {data.warehouses.map((warehouse) => {
          const units = onHandAt(warehouse.id);
          const capacity = Number(warehouse.fields.capacityUnits ?? 0);
          return (
            <Card key={warehouse.id} span={6} eyebrow="SITE" prov="human" title={warehouse.title} subtitle={warehouse.summary}
              actions={<Pill tone={capacity && units / capacity > 0.9 ? "danger" : "neutral"}>{capacity ? `${Math.round((units / capacity) * 100)}%` : "No capacity recorded"}</Pill>}>
              <Stack gap={3}>
                <Meter value={units} max={capacity || 1} label={`${warehouse.title} capacity`} tone={capacity && units / capacity > 0.9 ? "danger" : undefined} />
                <Properties rows={[
                  { label: "Units held", value: <span className="ds-num">{String(units)}</span> },
                  { label: "Capacity", value: capacity ? <span className="ds-num">{String(capacity)}</span> : "Not recorded" },
                  { label: "Bins", value: <span className="ds-num">{String(warehouse.fields.bins ?? 0)}</span> },
                  { label: "Manager", value: String(warehouse.fields.managerName ?? "Unassigned") },
                ]} />
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Activity") {
    return (
      <DataGrid
        rows={[...data.stockMoves].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
        rowId={(row) => row.id}
        label="Warehouse activity"
        columns={[
          { key: "title", header: "Movement", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "warehouse", header: "Site", cell: (row) => data.warehouses.find((item) => item.id === String(row.fields.warehouseId))?.title ?? "—" },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "move").replace("_", " ")}</Pill> },
          { key: "qty", header: "Quantity", align: "end", cell: (row) => <span className="ds-num">{Number(row.fields.quantity) > 0 ? "+" : ""}{String(row.fields.quantity)}</span> },
          { key: "ref", header: "Reference", cell: (row) => <span className="ds-num">{String(row.fields.reference ?? "—")}</span> },
          { key: "at", header: "When", align: "end", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
        ]}
      />
    );
  }

  return (
    <Grid>
      {data.warehouses.map((warehouse) => (
        <Card key={warehouse.id} span={4} eyebrow="SITE" prov="human" title={warehouse.title} subtitle={warehouse.summary}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { context.select(warehouse.id); context.openOverlay("Location editor", { id: warehouse.id }); }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(warehouse.id); context.openOverlay("stock count", { id: warehouse.id }); }}>Count</Button>
          </>}>
          <Properties rows={[
            { label: "Code", value: <span className="ds-num">{String(warehouse.fields.code ?? "—")}</span> },
            { label: "Units held", value: <span className="ds-num">{String(onHandAt(warehouse.id))}</span> },
            { label: "Bins", value: <span className="ds-num">{String(warehouse.fields.bins ?? 0)}</span> },
            { label: "Manager", value: String(warehouse.fields.managerName ?? "Unassigned") },
          ]} />
        </Card>
      ))}
      {data.warehouses.length === 0 && <Empty title="No warehouses" icon={<Warehouse size={20} />} />}
    </Grid>
  );
}

/* ---------------------------- PROC-007 ---------------------------- */

export function Receiving({ context, state }: { context: ScreenContext; state: string }) {
  const data = useProcData();
  const map: Record<string, string[]> = { Expected: ["expected"], Receiving: ["receiving"], Exceptions: ["exception"], Complete: ["complete"] };
  const rows = data.receipts.filter((receipt) => (map[state] ?? []).includes(receipt.status));

  if (rows.length === 0) {
    return <Empty title={`Nothing ${state.toLowerCase()}`} icon={<PackageCheck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Scan overlay")}>Receive a delivery</Button>}>
      A goods receipt is always raised against a purchase order, so stock cannot appear without a traceable transaction.
    </Empty>;
  }

  return (
    <Stack gap={4}>
      {state === "Exceptions" && (
        <Notice tone="danger" title="A short or damaged delivery is not quietly accepted">
          The receipt records what was expected and what arrived. The difference blocks the supplier invoice at the three-way match rather than being written off.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${state} receipts`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("receipt confirmation", { id })}
        rowTone={(row) => (row.status === "exception" ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Receipt", primary: true, cell: (row) => <span className="ds-num">{row.title}</span>, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "po", header: "Against", cell: (row) => data.purchaseOrders.find((order) => order.id === String(row.fields.purchaseOrderId))?.title ?? "—" },
          { key: "supplier", header: "Supplier", cell: (row) => supplierOf(data, row)?.title ?? "—" },
          { key: "expected", header: "Expected", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.quantityExpected ?? 0)}</span> },
          { key: "received", header: "Received", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.quantityReceived ?? 0)}</span> },
          { key: "diff", header: "Difference", align: "end", cell: (row) => {
            const diff = Number(row.fields.quantityReceived ?? 0) - Number(row.fields.quantityExpected ?? 0);
            return diff === 0 ? <span className="ds-subtle">None</span> : <strong className="ds-field-error">{diff > 0 ? "+" : ""}{diff}</strong>;
          } },
          { key: "scanned", header: "Scanned", cell: (row) => (row.fields.scanned === true ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">Not scanned</Pill>) },
          { key: "due", header: "Expected on", cell: (row) => <span className="ds-num">{context.date(row.dueAt ?? row.at)}</span>, sortValue: (row) => row.dueAt ?? "" },
        ]}
        bulkActions={[
          { label: "Record a count", disabled: (selected) => selected.length !== 1 || selected[0].status === "complete", onRun: (selected) => context.openOverlay("Scan overlay", { id: selected[0].id }) },
          { label: "Flag a discrepancy", disabled: (selected) => selected.length !== 1, onRun: (selected) => context.openOverlay("discrepancy", { id: selected[0].id }) },
        ]}
      />
    </Stack>
  );
}

/* ---------------------------- PROC-008 ---------------------------- */

export function StockMovements({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const map: Record<string, string[]> = {
    All: [],
    Transfers: ["transfer_in", "transfer_out"],
    Adjustments: ["adjustment", "damage", "shrinkage", "correction", "found"],
    Counts: ["count"],
  };
  const wanted = map[lens] ?? [];
  const rows = wanted.length === 0 ? data.stockMoves : data.stockMoves.filter((move) => wanted.includes(String(move.fields.kind ?? "")));
  const unexplained = rows.filter((move) => !String(move.fields.reference ?? "") && !String(move.summary ?? ""));

  return (
    <Stack gap={4}>
      {unexplained.length > 0 && (
        <Notice tone="danger" title={`${unexplained.length} movements have no reference`}>
          A movement without a reference cannot be traced to an order, a receipt or a count. These are the rows to investigate first.
        </Notice>
      )}
      <DataGrid
        rows={[...rows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
        rowId={(row) => row.id}
        label={`${lens} movements`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Movement inspector", { id })}
        rowTone={(row) => (!String(row.fields.reference ?? "") ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Movement", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "product", header: "Product", cell: (row) => data.products.find((product) => product.id === String(row.fields.productId))?.title ?? String(row.fields.productId) },
          { key: "warehouse", header: "Site", cell: (row) => data.warehouses.find((item) => item.id === String(row.fields.warehouseId))?.title ?? "—" },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "move").replace("_", " ")}</Pill> },
          { key: "qty", header: "Quantity", align: "end", cell: (row) => <strong className={Number(row.fields.quantity) < 0 ? "ds-field-error" : "ds-num"}>{Number(row.fields.quantity) > 0 ? "+" : ""}{String(row.fields.quantity)}</strong>, sortValue: (row) => Number(row.fields.quantity ?? 0) },
          { key: "ref", header: "Traceable to", cell: (row) => (String(row.fields.reference) ? <span className="ds-num">{String(row.fields.reference)}</span> : <Pill tone="danger">No reference</Pill>) },
          { key: "at", header: "When", align: "end", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at ?? "" },
        ]}
        summary={<span>Net movement {rows.reduce((sum, row) => sum + Number(row.fields.quantity ?? 0), 0)} units across {rows.length} rows</span>}
      />
      <Notice tone="info" title="The inventory ledger is only ever appended">
        A level is never edited. Every change is a movement with a kind, a reference and a date, so the quantity on hand can always be explained by the rows that produced it.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- PROC-009 ---------------------------- */

export function Replenishment({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const [horizon, setHorizon] = useState("30");

  const suggestions = data.products.filter((product) => product.status === "active").map((product) => {
    const onHand = data.stockMoves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
    const sold = data.orders.filter((order) => order.status !== "cancelled")
      .flatMap((order) => (order.body as { lines?: { productId?: string; quantity: number }[] } | undefined)?.lines ?? [])
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    const onOrder = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && ["approved", "sent"].includes(order.status))
      .flatMap((order) => bodyOf<PoBody>(order, {}).lines ?? [])
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + (line.quantity - line.receivedQuantity), 0);
    const point = Number(product.fields.reorderPoint ?? 0);
    const quantity = Number(product.fields.reorderQuantity ?? 0);
    return { product, onHand, sold, onOrder, point, quantity, lead: Number(product.fields.leadTimeDays ?? 0), gap: point - (onHand + onOrder) };
  });

  if (lens === "Planned" || lens === "Ordered") {
    const orders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && (lens === "Planned" ? ["draft", "approved"].includes(order.status) : order.status === "sent"));
    return orders.length === 0
      ? <Empty title={`Nothing ${lens.toLowerCase()}`} icon={<Truck size={20} />} />
      : (
        <DataGrid rows={orders} rowId={(row) => row.id} label={`${lens} orders`} filterable={false}
          onOpen={(id) => context.navigate(`/o/${org.slug}/proc/orders?tab=${lens === "Planned" ? "Approved" : "Sent"}&id=${id}`)}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
            { key: "supplier", header: "Supplier", cell: (row) => supplierOf(data, row)?.title ?? "—" },
            { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
            { key: "due", header: "Expected", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span> },
            { key: "units", header: "Units", align: "end", cell: (row) => <span className="ds-num">{String((bodyOf<PoBody>(row, {}).lines ?? []).reduce((sum, line) => sum + line.quantity, 0))}</span> },
          ]} />
      );
  }

  if (lens === "Exceptions") {
    const problems = suggestions.filter((row) => row.lead === 0 || row.quantity === 0 || (row.gap > 0 && row.onOrder === 0));
    return problems.length === 0
      ? <Empty title="No exceptions" >Every product below its point has an order covering it, and each has a lead time and reorder quantity recorded.</Empty>
      : (
        <Stack gap={3}>
          {problems.map((row) => (
            <Card key={row.product.id} eyebrow="EXCEPTION" prov={row.lead === 0 || row.quantity === 0 ? "unknown" : "human"} title={row.product.title}
              subtitle={row.lead === 0 ? "No lead time is recorded, so no reorder date can be worked out."
                : row.quantity === 0 ? "No reorder quantity is recorded, so there is nothing to suggest."
                  : `Below its reorder point with nothing on order. Lead time is ${row.lead} days.`}>
              <Properties rows={[
                { label: "On hand", value: <span className="ds-num">{String(row.onHand)}</span> },
                { label: "On order", value: <span className="ds-num">{String(row.onOrder)}</span> },
                { label: "Reorder point", value: <span className="ds-num">{String(row.point)}</span> },
              ]} />
            </Card>
          ))}
        </Stack>
      );
  }

  const needed = suggestions.filter((row) => row.gap > 0);
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Demand window in days" hint="Used only to describe the suggestion, never to predict demand">
          <TextInput value={horizon} inputMode="numeric" align="end" onChange={(event) => setHorizon(event.target.value)} />
        </Field>
        <Button variant="secondary" onClick={() => context.openOverlay("reorder policy")}>How a suggestion is made</Button>
      </Row>
      <Notice tone="warning" title="A suggestion is not a forecast and never commits money">
        These rows come from the reorder point, the reorder quantity and the lead time recorded on each product, with units already on order deducted. Nothing extrapolates seasonality, and no purchase order is created without a requisition and an approval.
      </Notice>
      {needed.length === 0 ? <Empty title="Nothing needs reordering" icon={<Boxes size={20} />} /> : (
        <DataGrid rows={needed} rowId={(row) => row.product.id} label="Suggested purchases" filterable={false}
          onSelect={(id) => context.select(id)}
          columns={[
            { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
            { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className="ds-num">{String(row.onHand)}</span> },
            { key: "onorder", header: "On order", align: "end", cell: (row) => <span className="ds-num">{String(row.onOrder)}</span> },
            { key: "point", header: "Point", align: "end", cell: (row) => <span className="ds-num">{String(row.point)}</span> },
            { key: "suggest", header: "Suggested", align: "end", cell: (row) => <strong className="ds-num">{String(row.quantity)}</strong> },
            { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.lead)} days</span> },
            { key: "sold", header: "Units sold to date", align: "end", cell: (row) => <span className="ds-num">{String(row.sold)}</span> },
          ]}
          bulkActions={[{ label: "Raise a requisition", onRun: (selected) => context.openOverlay("purchase preview", { productIds: selected.map((row) => row.product.id) }) }]} />
      )}
    </Stack>
  );
}

/* ---------------------------- PROC-010 ---------------------------- */

export function ProcurementAnalytics({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProcData();
  const { org, now } = useWorkspace();
  const orders = data.purchaseOrders.filter(isPurchaseOrder);
  const counted = orders.filter((order) => order.status !== "cancelled" && order.status !== "draft");
  const cancelled = orders.filter((order) => order.status === "cancelled");

  if (lens === "Service") {
    return (
      <Stack gap={4}>
        <DataGrid rows={data.suppliers.filter((supplier) => supplier.status !== "archived")} rowId={(row) => row.id} label="Supplier reliability" filterable={false}
          columns={[
            { key: "title", header: "Supplier", primary: true, cell: (row) => row.title },
            { key: "ontime", header: "On time", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.onTimeRatePct ?? "—")}%</span>, sortValue: (row) => Number(row.fields.onTimeRatePct ?? 0) },
            { key: "quality", header: "Accepted", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.qualityRatePct ?? "—")}%</span> },
            { key: "lead", header: "Stated lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.leadTimeDays ?? "—")}d</span> },
            { key: "late", header: "Late deliveries recorded", align: "end", cell: (row) => <span className="ds-num">{String((bodyOf<SupplierBody>(row, {}).deliveries ?? []).filter((delivery) => delivery.lateDays > 0).length)}</span> },
            { key: "open", header: "Open orders", align: "end", cell: (row) => <span className="ds-num">{String(counted.filter((order) => String(order.fields.supplierId) === row.id && order.status !== "closed").length)}</span> },
          ]} />
        <Notice tone="warning" title="Stated lead time is not measured lead time">
          The lead time column is what the supplier says. The late deliveries column is what was recorded here. Where the two disagree, the recorded figure is the one to plan with.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Inventory") {
    const turns = data.products.filter((product) => product.status === "active").map((product) => {
      const onHand = data.stockMoves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
      const out = data.stockMoves.filter((move) => String(move.fields.productId) === product.id && Number(move.fields.quantity ?? 0) < 0).reduce((sum, move) => sum + Math.abs(Number(move.fields.quantity ?? 0)), 0);
      return { product, onHand, out, turns: onHand === 0 ? 0 : out / onHand };
    });
    return (
      <Stack gap={4}>
        <DataGrid rows={turns} rowId={(row) => row.product.id} label="Stock turns" filterable={false}
          columns={[
            { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
            { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className="ds-num">{String(row.onHand)}</span> },
            { key: "out", header: "Units issued", align: "end", cell: (row) => <span className="ds-num">{String(row.out)}</span> },
            { key: "turns", header: "Issued per unit held", align: "end", cell: (row) => (row.onHand === 0 ? <span className="ds-subtle">Nothing held</span> : <span className="ds-num">{row.turns.toFixed(2)}</span>) },
          ]} />
        <Notice tone="warning" title="This is not an annualised turn rate">
          A real stock turn needs cost of goods over a period and an average holding. This workspace holds movements since the opening count only, so the ratio is reported as issued units per unit held and labelled as such.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Forecast") {
    const expected = data.receipts.filter((receipt) => receipt.status === "expected");
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="On order" value={context.money(counted.filter((order) => order.status === "sent").reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} prov="human" meta="Sent and not yet closed" />
          <Stat label="Deliveries expected" value={String(expected.length)} prov="human" meta={`${expected.filter((receipt) => receipt.dueAt && new Date(receipt.dueAt) < now).length} already overdue`} />
          <Stat label="Committed next 30 days" value={context.money(counted.filter((order) => order.dueAt && new Date(order.dueAt) > now && new Date(order.dueAt).getTime() - now.getTime() < 30 * 86_400_000).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} prov="human" meta="By expected delivery date" />
          <Stat label="Demand forecast" value="Unavailable" unavailable meta="No demand history is kept in this workspace" />
        </StatRow>
        <Notice tone="warning" title="What is on order is not a forecast">
          These figures are commitments already made. Predicting what will be needed would require a demand history that this workspace does not hold, so nothing is extrapolated.
        </Notice>
      </Stack>
    );
  }

  const bySupplier = data.suppliers.map((supplier) => ({
    supplier,
    spend: counted.filter((order) => String(order.fields.supplierId) === supplier.id).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0),
  })).filter((row) => row.spend > 0).sort((a, b) => b.spend - a.spend);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Spend counted" value={context.money(bySupplier.reduce((sum, row) => sum + row.spend, 0))} prov="posted" meta={`${counted.length} approved, sent, received or closed orders`} onClick={() => context.openOverlay("Metric source")} />
        <Stat label="Excluded" value={context.money(cancelled.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} prov="posted" meta={`${cancelled.length} cancelled and ${orders.filter((order) => order.status === "draft").length} draft orders`} />
        <Stat label="Suppliers used" value={String(bySupplier.length)} prov="posted" meta={`of ${data.suppliers.length} on file`} />
        <Stat label="Invoiced" value={context.money(data.bills.reduce((sum, bill) => sum + (bill.amountMinor ?? 0), 0))} prov="posted" meta={`${data.bills.length} supplier invoices`} />
      </StatRow>
      <Grid>
        <Card span={7} eyebrow="SPEND" prov="posted" title="Spend by supplier" subtitle="Cancelled and draft orders are excluded">
          <BarChart title="Spend by supplier" height={220} format={(value) => context.money(value)}
            series={[{ name: "Spend", points: bySupplier.map((row) => ({ label: row.supplier.title.split(" ")[0], value: row.spend })) }]}
            footer={`Reported in ${org.currency}. Tax on each order resolves through the ${org.jurisdiction} rules for the supplier's status.`} />
        </Card>
        <Card span={5} eyebrow="CATEGORY" prov="posted" title="Spend by category">
          <DonutChart title="Spend by category" format={(value) => context.money(value)}
            points={[...new Set(data.suppliers.map((supplier) => String(supplier.fields.category ?? "Other")))].map((category) => ({
              label: category,
              value: bySupplier.filter((row) => String(row.supplier.fields.category ?? "Other") === category).reduce((sum, row) => sum + row.spend, 0),
            })).filter((point) => point.value > 0)} />
        </Card>
      </Grid>
    </Stack>
  );
}
