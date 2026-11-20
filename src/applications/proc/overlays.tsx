import { useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, DrawerActions, DrawerInFlight, DrawerUnsavedChanges, Empty, FactGrid, Field, ModalActions, ModalInFlight, ModalUnsavedChanges, Notice, OverlayActions, OverlayCancel,
  KeyValueList, OverlaySection, OverlaySummary, Pill, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { ProviderBoundary } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import type { TaxCategory } from "@/platform/money";
import { applyScenario, approvalLimitFor } from "./actions";
import { ReceiptStockLinks } from "./supplierInsights";
import { blankLine, chainForOrder, chainForRequisition, CountList, LineEditor, ProcChain, Totals } from "./kit";
import {
  approverFor, APPROVAL_LIMITS, billTotals, bodyOf, findSupplier, isPurchaseOrder, MATCH_LABEL, matchTone, resolveSupplierId,
  outstandingFor, poTotals, statusTone, threeWayMatch, useProcData,
  type ContractBody, type PoBody, type PoLine, type ReceiptBody, type SupplierBody,
} from "./data";

/* ====================================================================== *
 * PROC overlays. Approvals, receipting against a purchase order and the
 * three-way match between order, receipt and supplier invoice.
 * ====================================================================== */

/* ---------------- PROC-001 / 004 ---------------- */

export function RequisitionForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; productIds?: string[] } | undefined;
  const existing = useRecord(payload?.id);
  const data = useProcData();
  if ((payload?.id && !existing) || data.suppliers.length === 0 || ((payload?.productIds ?? []).length > 0 && data.products.length === 0)) return <Empty title="Loading" />;
  return <RequisitionFormBody key={existing?.id ?? (payload?.productIds ?? []).join("|")} context={context} close={close} existing={existing} loaded={data} />;
}

function RequisitionFormBody({ context, close, existing, loaded }: { context: ScreenContext; close: () => void; existing: Rec | undefined; loaded: ReturnType<typeof useProcData> }) {
  const live = useProcData();
  const data = live.suppliers.length ? live : loaded;
  const { org, now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string; productIds?: string[] } | undefined;
  const existingBody = bodyOf<PoBody>(existing, {});
  const seeded: PoLine[] = (payload?.productIds ?? []).map((productId, index) => {
    const product = data.products.find((item) => item.id === productId);
    return {
      id: `l${index + 1}`,
      description: product?.title ?? "Line",
      productId,
      quantity: Number(product?.fields.reorderQuantity ?? 1),
      unitPriceMinor: Number(product?.fields.unitCostMinor ?? 0),
      taxCategory: "standard" as TaxCategory,
      receivedQuantity: 0,
    };
  });
  const [supplierId, setSupplierId] = useState(resolveSupplierId(data.supplierAliases, String(existing?.fields.supplierId ?? data.suppliers[0]?.id ?? "")));
  const [budget, setBudget] = useState(String(existing?.fields.budgetLine ?? "Workshop materials"));
  const [priority, setPriority] = useState(String(existing?.fields.priority ?? "normal"));
  const [note, setNote] = useState(existing?.summary ?? "");
  const [lines, setLines] = useState<PoLine[]>(existingBody.lines ?? (seeded.length ? seeded : [blankLine(0)]));

  const supplier = findSupplier(data, supplierId);
  const draft = { ...(existing ?? ({} as Rec)), at: now.toISOString(), body: { lines } } as Rec;
  const totals = poTotals(draft, supplier, org.jurisdiction);
  const invalid = lines.length === 0 || lines.some((line) => !line.description.trim() || line.quantity <= 0) || !note.trim();

  return (
    <form
      id="requisition-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const number = `REQ-${320 + data.purchaseOrders.length}`;
        const fields = {
          kind: "requisition",
          number,
          supplierId,
          requester: actor,
          approver: "",
          approvedAt: "",
          budgetLine: budget,
          priority,
          netMinor: totals.netMinor,
          taxMinor: totals.taxMinor,
          version: 1,
          sentAt: "",
          delivery: "not_connected",
          warehouseId: data.warehouses[0]?.id ?? "",
        };
        if (existing) {
          const ok1 = await context.mutate.patch(existing.id, {
            summary: note, amountMinor: totals.grossMinor,
            fields: { ...existing.fields, ...fields, number: String(existing.fields.number ?? number) },
            body: { lines, revisions: existingBody.revisions ?? [] },
          }, { expectRevision: existing.revision, event: `Requisition ${existing.title} edited` });
          if (!ok1) return; // the platform has already said the record changed elsewhere
        } else {
          await context.mutate.create({
            collection: "purchaseOrders", title: number, status: "awaiting_approval",
            amountMinor: totals.grossMinor, at: now.toISOString(), summary: note,
            ownerName: actor, tags: ["requisition"], fields, body: { lines, revisions: [] },
          }, `Requisition ${number} raised by ${actor}`);
        }
        context.toast("Requisition submitted", `${context.money(totals.grossMinor)} needs ${approverFor(totals.grossMinor)} approval before anything is committed.`);
        close();
      }}
    >
      <OverlaySection title="Request" hint="Who supplies it, which budget pays and why. The approver reads this before committing money.">
        <Stack gap={3}>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              {data.suppliers.filter((item) => item.status !== "archived").map((item) => (
                <option key={item.id} value={item.id}>{item.title}{item.status === "review" ? " (under review)" : ""}</option>
              ))}
            </Select>
          </Field>
          {supplier?.status === "review" && <Notice tone="warning" title="This supplier is under review">A requisition can name them, but the approver will see the review state before committing.</Notice>}
          <Row gap={3} wrap>
            <Field label="Budget line"><Select value={budget} onChange={(event) => setBudget(event.target.value)}>{["Workshop materials", "Packaging", "Workshop equipment", "Logistics", "Finishing"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Priority"><Select value={priority} onChange={(event) => setPriority(event.target.value)}>{["low", "normal", "high"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
          </Row>
          <Field label="Why it is needed" required>
            <TextArea value={note} rows={2} onChange={(event) => setNote(event.target.value)} required />
          </Field>
        </Stack>
      </OverlaySection>
      <OverlaySection title="Lines">
        <LineEditor lines={lines} setLines={setLines} currency={org.currency} money={context.money} />
      </OverlaySection>
      <OverlaySection title="Value and approval">
        <Stack gap={3}>
          <Totals totals={totals} money={context.money} label="Requisition" />
          <Notice tone="info" title={`${approverFor(totals.grossMinor)} has to approve this`}>
            The approval level follows the value, not the requester, and converting a requisition into an order keeps it.
          </Notice>
        </Stack>
      </OverlaySection>
    </form>
  );
}

/**
 * Separation of duties: the person who raised a requisition does not approve
 * it. The owner is the exception, because nobody sits above the owner in the
 * approval chain; that approval is allowed and recorded as a self-approval.
 */
export function separationOfDuties(requisition: Rec, actor: string, role: string): { refused?: string; ownerSelfApproval: boolean } {
  const requester = String(requisition.fields.requester ?? requisition.ownerName ?? "");
  if (requester !== actor) return { ownerSelfApproval: false };
  if (role === "owner") return { ownerSelfApproval: true };
  return {
    refused: `${actor} raised ${requisition.title}, so ${actor} cannot also approve it. Separation of duties needs a different person with the approval limit to approve it; it stays awaiting approval.`,
    ownerSelfApproval: false,
  };
}

export function RequisitionReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { org, now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [selectedId, setSelectedId] = useState(payload?.id ?? context.selectedId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingRecords = data.purchaseOrders.filter(item => item.status === "awaiting_approval");
  const requisition = selectedId ? data.purchaseOrders.find(item => item.id === selectedId) : undefined;
  const supplier = findSupplier(data, String(requisition?.fields.supplierId ?? ""));
  if (!requisition) return (
    <Stack gap={3}>
      <Notice tone={selectedId ? "warning" : "info"}
        title={selectedId ? "Selected requisition unavailable" : "Choose a requisition to review"}>
        {selectedId ? "This requisition is no longer available. It may have changed since you opened the panel." :
          "No requisition has been selected. Choose one awaiting review; Arlovi will not substitute the first order."}
      </Notice>
      {pendingRecords.length ? (
        <Field label="Requisition awaiting a decision">
          <Select aria-label="Requisition awaiting a decision" value={selectedId}
            onChange={event => { setSelectedId(event.target.value); setReason(""); setError(""); }}>
            <option value="">Select a requisition</option>
            {pendingRecords.map(item => <option key={item.id} value={item.id}>{item.title} · {context.money(item.amountMinor ?? 0)}</option>)}
          </Select>
        </Field>
      ) : <Empty title="No requisitions awaiting approval">New requests appear when submitted by the purchasing team.</Empty>}
    </Stack>
  );
  const totals = poTotals(requisition, supplier, org.jurisdiction);
  const needed = approverFor(totals.grossMinor);
  const limit = approvalLimitFor(context);
  const pending = requisition.status === "awaiting_approval";
  const withinLimit = totals.grossMinor <= limit.limitMinor;
  const canApprove = (context.can("approve_payment") || context.role === "owner");
  const separation = separationOfDuties(requisition, actor, context.role);

  return (
    <Stack gap={4}>
      <DrawerUnsavedChanges when={Boolean(reason.trim())} />
      <DrawerInFlight when={busy} />
      <OverlaySummary
        eyebrow="Requisition"
        title={<span className="ds-num">{requisition.title}</span>}
        status={<Pill tone={statusTone(requisition.status)} dot>{requisition.status.replace("_", " ")}</Pill>}
        meta={[`Requested by ${String(requisition.fields.requester ?? requisition.ownerName)}`, supplier?.title, String(requisition.fields.budgetLine ?? "")]}
      />
      <ProcChain stages={chainForRequisition(requisition, data.purchaseOrders)} />
      <FactGrid columns={3} items={[
        { label: "Value", value: <strong>{context.money(totals.grossMinor)}</strong>, mono: true },
        { label: "Approval needed", value: needed, tone: "warning" },
        { label: "Your limit", value: canApprove ? `${limit.role} · up to ${context.money(limit.limitMinor)}` : "May not approve", tone: canApprove ? (withinLimit ? "success" : "danger") : "danger" },
      ]} />
      <OverlaySection title="Why it is needed" flush><p style={{ margin: 0 }}>{requisition.summary || "No reason was given."}</p></OverlaySection>
      <OverlaySection title="Lines" flush>
      <DataGrid rows={bodyOf<PoBody>(requisition, {}).lines ?? []} rowId={(row) => row.id} label="Requisition lines" filterable={false}
        columns={[
          { key: "description", header: "Item", primary: true, cell: (row) => row.description },
          { key: "qty", header: "Quantity", align: "end", cell: (row) => <span className="ds-num">{String(row.quantity)}</span> },
          { key: "unit", header: "Unit", align: "end", cell: (row) => <span className="ds-num">{context.money(row.unitPriceMinor)}</span> },
          { key: "line", header: "Line total", align: "end", cell: (row) => <span className="ds-num">{context.money(row.quantity * row.unitPriceMinor)}</span> },
        ]} />
      </OverlaySection>
      {totals.hasUnknownRate && <Notice tone="danger" title="A line has no approved tax rate">Resolve the unknown tax rate before approving; the figure above is shown without tax.</Notice>}
      {!canApprove ? (
        <Notice tone="danger" title="This role view does not approve commitments">
          Approving a requisition commits money, so it is limited to the views that hold the approval capability. Role views shape what this interface offers; they are not an account security boundary.
        </Notice>
      ) : (
        <>
          {!pending && <Notice tone="warning" title={`This is ${requisition.status.replace("_", " ")}`}>Only something awaiting approval can be approved or rejected here.</Notice>}
          {pending && !withinLimit && (
            <Notice tone="danger" title={`Above your approval limit`}>
              {context.money(totals.grossMinor)} needs {needed} approval. The {limit.role.toLowerCase()} limit is {context.money(limit.limitMinor)}, so this cannot be approved from this view; it stays awaiting approval.
            </Notice>
          )}
          {pending && separation.refused && (
            <Notice tone="danger" title="You cannot approve your own requisition">
              {separation.refused}
            </Notice>
          )}
          {pending && separation.ownerSelfApproval && (
            <Notice tone="warning" title="You raised this requisition">
              Separation of duties keeps a requester from approving their own spend. The owner is the last approver in the chain, with no one above to pass it to, so an owner approval of their own requisition is allowed but recorded as a self-approval on the requisition and in the audit trail.
            </Notice>
          )}
          <Field label="Note for the record" hint="Required when declining; optional when approving."><TextInput value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></Field>
          {error && <Notice tone="danger" title="Decision could not be recorded">{error}</Notice>}
          <DrawerActions>
            <OverlayActions
              primary={<Button
              variant="primary"
              busy={busy}
              disabled={busy || !canApprove || !pending || !withinLimit || Boolean(separation.refused) || totals.hasUnknownRate}
              title={separation.refused || (totals.hasUnknownRate ? "Resolve unknown tax rates before approving" : undefined)}
              onClick={async () => {
                if (busy || !canApprove || !pending || !withinLimit || separation.refused || totals.hasUnknownRate) return;
                setBusy(true);
                setError("");
                try {
                  const saved = await context.mutate.patch(requisition.id, {
                    status: "approved",
                    fields: { ...requisition.fields, approver: actor, approverRole: limit.role,
                      approvedAt: now.toISOString(), approvalNote: reason.trim(),
                      selfApproved: separation.ownerSelfApproval },
                  }, { expectRevision: requisition.revision,
                    event: `${requisition.title} approved by ${actor}${separation.ownerSelfApproval ? " (self-approval by owner)" : ""}` });
                  if (!saved) { setError("The requisition changed. Reload before approving it."); return; }
                  context.toast("Requisition approved", `${requisition.title} may now be converted to a purchase order. No supplier payment was sent.`);
                  close();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Review and retry the approval.");
                } finally { setBusy(false); }
              }}
            >Approve requisition</Button>}
              secondary={<Button
              variant="outline-danger"
              busy={busy}
              disabled={busy || !canApprove || !pending || !reason.trim()}
              onClick={async () => {
                if (busy || !canApprove || !pending || !reason.trim()) return;
                setBusy(true);
                setError("");
                try {
                  const saved = await context.mutate.patch(requisition.id, {
                    status: "rejected",
                    fields: { ...requisition.fields, approver: actor,
                      approvedAt: now.toISOString(), rejectionReason: reason.trim() },
                  }, { expectRevision: requisition.revision,
                    event: `${requisition.title} rejected by ${actor}: ${reason.trim()}` });
                  if (!saved) { setError("The requisition changed. Reload before rejecting it."); return; }
                  context.toast("Requisition rejected", "The reason was saved on the record for the requester.");
                  close();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Review and retry the rejection.");
                } finally { setBusy(false); }
              }}
            >Reject with reason</Button>}
              end={<OverlayCancel disabled={busy}>Close review</OverlayCancel>}
            />
          </DrawerActions>
        </>
      )}
    </Stack>
  );
}

export function BudgetCheck({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const lines = [...new Set(data.purchaseOrders.map((order) => String(order.fields.budgetLine ?? "Unassigned")))];
  return (
    <Stack gap={4}>
      <OverlaySection title="Commitment by budget line" flush>
      <DataGrid rows={lines} rowId={(row) => row} label="Budget lines" filterable={false}
        columns={[
          { key: "line", header: "Budget line", primary: true, cell: (row) => row },
          { key: "committed", header: "Committed", align: "end", cell: (row) => (
            <span className="ds-num">{context.money(data.purchaseOrders.filter((order) => String(order.fields.budgetLine ?? "Unassigned") === row && ["approved", "sent", "received", "closed"].includes(order.status)).reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))}</span>
          ) },
          { key: "pending", header: "Awaiting approval", align: "end", cell: (row) => (
            <span className="ds-num">{context.money(data.purchaseOrders.filter((order) => String(order.fields.budgetLine ?? "Unassigned") === row && order.status === "awaiting_approval").reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))}</span>
          ) },
          { key: "budget", header: "Budget set", cell: () => <Pill tone="warning">Not recorded</Pill> },
        ]} />
      </OverlaySection>
      <Notice tone="warning" title="No budget figure is held for these lines">
        Commitments are counted from the orders themselves. A budget to compare them with would come from Finance, so no percentage of budget is shown rather than an invented one.
      </Notice>
      <OverlaySection title="Approval limits" hint={`Expressed in ${org.currency}. The limit follows the value, not the requester.`}>
        <FactGrid columns={3} items={APPROVAL_LIMITS.map((limit) => ({ label: limit.role, value: limit.limitMinor === 0 ? "Raises, cannot approve" : `Up to ${context.money(limit.limitMinor)}`, mono: limit.limitMinor !== 0 }))} />
      </OverlaySection>
    </Stack>
  );
}

export function CostInspector({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const bill = useRecord(payload?.id ?? context.selectedId) ?? data.bills[0];
  if (!bill) return <Empty title="No invoice selected" />;
  const supplier = findSupplier(data, String(bill.fields.supplierId));
  const totals = billTotals(bill, supplier, org.jurisdiction);
  const match = threeWayMatch(bill, data.purchaseOrders, data.receipts);
  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Supplier invoice"
        title={<span className="ds-num">{bill.title}</span>}
        status={<Pill tone={matchTone(match.state)} dot>{MATCH_LABEL[match.state]}</Pill>}
        meta={[supplier?.title, bill.dueAt ? `Due ${context.date(bill.dueAt)}` : undefined]}
        actions={<Button variant="secondary" size="sm" onClick={() => context.openOverlay("three-way match", { id: bill.id })}>Open the three-way match</Button>}
      />
      <Totals totals={totals} money={context.money} label="Invoice" />
      {match.blockedReason && <Notice tone="danger" title="Payment is blocked">{match.blockedReason}</Notice>}
    </Stack>
  );
}

export function StockAlert({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const rows = data.products.filter((product) => product.status === "active").map((product) => {
    const onHand = data.stockMoves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
    return { product, onHand, point: Number(product.fields.reorderPoint ?? 0) };
  }).filter((row) => row.onHand <= row.point);
  return rows.length === 0 ? <Empty title="Nothing is below its reorder point" /> : (
    <Stack gap={3}>
    <OverlaySection title={`${rows.length} product${rows.length === 1 ? "" : "s"} at or below the reorder point`} hint="On hand is the sum of recorded stock movements across every site." flush>
    <DataGrid rows={rows} rowId={(row) => row.product.id} label="Stock alerts" filterable={false}
      onOpen={() => { context.navigate(`/o/${context.org.slug}/proc/replenishment`); context.closeOverlay(); }}
      columns={[
        { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
        { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className="ds-num">{String(row.onHand)}</span> },
        { key: "point", header: "Reorder point", align: "end", cell: (row) => <span className="ds-num">{String(row.point)}</span> },
        { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.product.fields.leadTimeDays ?? "—")} days</span> },
      ]} />
    </OverlaySection>
    <OverlayActions primary={<Button variant="primary" onClick={() => { context.navigate(`/o/${context.org.slug}/proc/replenishment`); context.closeOverlay(); }}>Plan replenishment</Button>} />
    </Stack>
  );
}

/* ---------------- PROC-002 / 003 ---------------- */

export function SupplierForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [email, setEmail] = useState(String(existing?.fields.email ?? ""));
  const [terms, setTerms] = useState(String(existing?.fields.terms ?? "30 days"));
  const [lead, setLead] = useState(String(existing?.fields.leadTimeDays ?? 14));
  const [category, setCategory] = useState(String(existing?.fields.category ?? "Metal"));
  const [taxStatus, setTaxStatus] = useState(String(existing?.fields.taxStatus ?? "domestic"));
  const duplicate = data.suppliers.some((supplier) => supplier.id !== existing?.id && supplier.title.trim().toLowerCase() === title.trim().toLowerCase())
    || (email.trim() !== "" && data.suppliers.some((supplier) => supplier.id !== existing?.id && String(supplier.fields.email ?? "").trim().toLowerCase() === email.trim().toLowerCase()));
  const invalid = !title.trim() || duplicate;
  return (
    <form
      id="supplier-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = {
          email: email.trim(), terms, leadTimeDays: Number(lead) || 0, category, taxStatus,
          city: String(existing?.fields.city ?? ""), onTimeRatePct: Number(existing?.fields.onTimeRatePct ?? 0),
          qualityRatePct: Number(existing?.fields.qualityRatePct ?? 0), ordersPlaced: Number(existing?.fields.ordersPlaced ?? 0),
          spendToDateMinor: Number(existing?.fields.spendToDateMinor ?? 0), approvedBy: String(existing?.fields.approvedBy ?? ""),
          bankLast4: String(existing?.fields.bankLast4 ?? ""), bankVerifiedAt: String(existing?.fields.bankVerifiedAt ?? ""),
          contactName: String(existing?.fields.contactName ?? ""),
        };
        if (existing) {
          const ok2 = await context.mutate.patch(existing.id, { title: title.trim(), fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Supplier ${title.trim()} edited` });
          if (!ok2) return; // the platform has already said the record changed elsewhere
        } else {
          await context.mutate.create({ collection: "suppliers", title: title.trim(), status: "review", summary: "", tags: [category.toLowerCase()], fields, body: { deliveries: [], notes: "" } }, `Supplier ${title.trim()} added for review`);
        }
        context.toast("Supplier saved", existing ? "The record is updated." : "The supplier starts under review until someone approves them.");
        close();
      }}
    >
      <OverlaySection title="Identity">
      <Stack gap={3}>
      <Field label="Supplier name" required error={duplicate ? "A supplier with that name already exists" : undefined}>
        <TextInput value={title} invalid={duplicate} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Row gap={3} wrap>
        <Field label="Email"><TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{["Metal", "Packaging", "Textile", "Electrical", "Glass", "Logistics", "Finishing"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      </Row>
      </Stack>
      </OverlaySection>
      <OverlaySection title="Terms">
      <Row gap={3} wrap>
        <Field label="Payment terms"><Select value={terms} onChange={(event) => setTerms(event.target.value)}>{["On receipt", "14 days", "30 days", "60 days", "50% deposit"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Lead time in days"><TextInput value={lead} inputMode="numeric" align="end" onChange={(event) => setLead(event.target.value)} /></Field>
        <Field label="Tax status" hint="Decides which rate applies to their invoices.">
          <Select value={taxStatus} onChange={(event) => setTaxStatus(event.target.value)}>{["domestic", "eu_business", "export", "domestic_exempt"].map((item) => <option key={item}>{item}</option>)}</Select>
        </Field>
      </Row>
      </OverlaySection>
      <Notice tone="danger" title="Bank details are not set here">
        Bank changes go through a separate verification with a known contact: an emailed change of account is the most common purchasing fraud.
      </Notice>
    </form>
  );
}

export function SupplierVerification({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { actor, now } = useWorkspace();
  const routed = useRecord(context.params.id ?? context.selectedId);
  const supplier = findSupplier(data, routed?.id) ?? routed ?? data.suppliers[0];
  const [calledBack, setCalledBack] = useState(false);
  const [contact, setContact] = useState("");
  const [last4, setLast4] = useState("");
  if (!supplier) return <Empty title="No supplier" />;
  const invalid = !calledBack || !contact.trim() || last4.trim().length !== 4;
  return (
    <form
      id="supplier-verification"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const ok3 = await context.mutate.patch(supplier.id, {
          status: "approved",
          fields: { ...supplier.fields, bankLast4: last4.trim(), bankVerifiedAt: now.toISOString(), approvedBy: actor, verifiedWith: contact.trim() },
        }, { expectRevision: supplier.revision, event: `Bank detail verified for ${supplier.title} with ${contact.trim()} by ${actor}` });
        if (!ok3) return; // the platform has already said the record changed elsewhere
        context.toast("Verification recorded", `${supplier.title} is approved with an account ending ${last4.trim()}, verified with ${contact.trim()}.`);
        close();
      }}
    >
      <OverlaySummary eyebrow="Bank detail" title={supplier.title} status={<Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill>} />
      <FactGrid columns={2} items={[
        { label: "Current account", value: supplier.fields.bankLast4 ? `···${String(supplier.fields.bankLast4)}` : "None recorded", mono: true },
        { label: "Last verified", value: supplier.fields.bankVerifiedAt ? context.date(String(supplier.fields.bankVerifiedAt)) : "Never", mono: true, tone: supplier.fields.bankVerifiedAt ? undefined : "warning" },
      ]} />
      <OverlaySection title="Call-back verification" flush>
      <Stack gap={3}>
      <Checkbox label="I called the supplier back on a number we already held, not one from the request" checked={calledBack} onChange={(event) => setCalledBack(event.target.checked)} />
      <Field label="Who confirmed it" required><TextInput value={contact} onChange={(event) => setContact(event.target.value)} required /></Field>
      <Field label="Last four digits" required><TextInput value={last4} inputMode="numeric" align="end" maxLength={4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, ""))} required /></Field>
      </Stack>
      </OverlaySection>
      <Notice tone="warning" title="Only the last four digits are kept">
        The full account number is never stored here. What is recorded is that someone verified the change, with whom, and when.
      </Notice>
    </form>
  );
}

export function SanctionsReview({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const routed = useRecord(context.params.id ?? context.selectedId);
  const supplier = findSupplier(data, routed?.id) ?? routed ?? data.suppliers[0];
  if (!supplier) return <Empty title="No supplier" />;
  return (
    <Stack gap={4}>
      <OverlaySummary eyebrow="Compliance screening" title={supplier.title} status={<Pill tone="warning" dot>Not screened</Pill>} meta={[String(supplier.fields.city ?? ""), `Internal state: ${supplier.status}`]} />
      <Notice tone="warning" title="No screening service is connected">
        Sanctions and compliance screening needs an authoritative list from a provider. Nothing here has been screened, and showing a clear result would be worse than showing none.
      </Notice>
      <Notice tone="info" title="What is known locally">
        {bodyOf<SupplierBody>(supplier, {}).notes || "No internal notes are recorded against this supplier."}
      </Notice>
    </Stack>
  );
}

export function ContractViewer({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const contract = useRecord(payload?.id ?? context.selectedId) ?? data.contracts[0];
  if (!contract) return <Empty title="No contract" />;
  const clauses = bodyOf<ContractBody>(contract, {}).clauses ?? [];
  return (
    <Stack gap={4}>
      <OverlaySummary eyebrow="Contract" title={contract.title}
        status={contract.fields.signed === true ? <Pill tone="success" dot>Signed</Pill> : <Pill tone="warning" dot>Not signed</Pill>}
        meta={[`Value ${context.money(contract.amountMinor)}`, contract.dueAt ? `Review by ${context.date(contract.dueAt)}` : undefined]} />
      {contract.fields.signed !== true && <span className="ds-subtle">No e-signature provider is connected, so signing is not recorded here.</span>}
      <OverlaySection title={`${clauses.length} clause${clauses.length === 1 ? "" : "s"}, grouped by assigned risk`} flush>
      <Stack gap={3}>
        {clauses.map((clause) => (
          <Card key={clause.id} prov={clause.risk === "high" ? "unknown" : "human"} eyebrow={clause.risk.toUpperCase()} title={clause.title} subtitle={clause.detail} />
        ))}
      </Stack>
      </OverlaySection>
      <Notice tone="danger" title="These are summaries, not advice">
        Clauses are recorded as written and grouped by the risk someone assigned them. Interpreting a liability, governing law or price variation clause needs a qualified reviewer.
      </Notice>
    </Stack>
  );
}

export function RiskEscalation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { actor } = useWorkspace();
  const routed = useRecord(context.params.id ?? context.selectedId);
  const supplier = findSupplier(data, routed?.id) ?? routed ?? data.suppliers[0];
  const [reason, setReason] = useState("");
  if (!supplier) return <Empty title="No supplier" />;
  return (
    <form
      id="risk-escalation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        const ok4 = await context.mutate.patch(supplier.id, {
          status: "review",
          fields: { ...supplier.fields, flaggedBy: actor, flagReason: reason.trim() },
        }, { expectRevision: supplier.revision, event: `${supplier.title} flagged for review by ${actor}: ${reason.trim()}` });
        if (!ok4) return; // the platform has already said the record changed elsewhere
        context.toast("Flagged for review", `${supplier.title} is under review. New requisitions will show the state to the approver.`);
        close();
      }}
    >
      <OverlaySummary eyebrow="Supplier" title={supplier.title} status={<Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill>} />
      <FactGrid columns={2} items={[
        { label: "Open orders", value: String(data.purchaseOrders.filter((order) => String(order.fields.supplierId) === supplier.id && ["approved", "sent"].includes(order.status)).length), mono: true },
        { label: "On time", value: `${String(supplier.fields.onTimeRatePct ?? "—")}%`, mono: true },
      ]} />
      <Field label="Why" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <Notice tone="warning" title="Flagging does not cancel anything">
        Orders already placed stay as they are. The flag puts the supplier under review so the next approver sees it before committing more.
      </Notice>
    </form>
  );
}

/* ---------------- PROC-005 ---------------- */

export function PoEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; fromRequisition?: string } | undefined;
  const existing = useRecord(payload?.id);
  const preset = useRecord(payload?.fromRequisition);
  const data = useProcData();
  if ((payload?.id && !existing) || (payload?.fromRequisition && !preset) || data.suppliers.length === 0) return <Empty title="Loading" />;
  return <PoEditorForm key={existing?.id ?? preset?.id ?? "new"} context={context} close={close} existing={existing} preset={preset} loaded={data} />;
}

function PoEditorForm({ context, close, existing, preset, loaded }: { context: ScreenContext; close: () => void; existing: Rec | undefined; preset: Rec | undefined; loaded: ReturnType<typeof useProcData> }) {
  const live = useProcData();
  const data = live.suppliers.length ? live : loaded;
  const { org, now, actor } = useWorkspace();
  const existingBody = bodyOf<PoBody>(existing ?? preset, {});
  const approvedRequisitions = data.purchaseOrders.filter((item) => String(item.fields.kind) === "requisition" && item.status === "approved" && Boolean(item.fields.approver));
  const [fromRequisition, setFromRequisition] = useState(preset && preset.status === "approved" ? preset.id : "");
  const [supplierId, setSupplierId] = useState(resolveSupplierId(data.supplierAliases, String((existing ?? preset)?.fields.supplierId ?? data.suppliers[0]?.id ?? "")));
  const [dueAt, setDueAt] = useState((existing?.dueAt ?? new Date(now.getTime() + 14 * 86_400_000).toISOString()).slice(0, 10));
  const [note, setNote] = useState(existing?.summary ?? preset?.summary ?? "");
  const [lines, setLines] = useState<PoLine[]>(existingBody.lines ?? [blankLine(0)]);

  const supplier = findSupplier(data, supplierId);
  const draft = { ...(existing ?? ({} as Rec)), at: now.toISOString(), body: { lines } } as Rec;
  const totals = poTotals(draft, supplier, org.jurisdiction);
  const source = approvedRequisitions.find((item) => item.id === fromRequisition);
  const alreadySent = existing?.status === "sent";
  const receivedUnits = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const valueChange = existing ? totals.grossMinor - (existing.amountMinor ?? 0) : 0;
  const invalid = lines.length === 0 || lines.some((line) => !line.description.trim() || line.quantity <= 0) || !supplierId;

  return (
    <form
      id="po-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const number = `PO-${210 + data.purchaseOrders.filter(isPurchaseOrder).length}`;
        const fields = {
          kind: "po",
          number: String(existing?.fields.number ?? number),
          supplierId,
          requester: String(source?.fields.requester ?? existing?.fields.requester ?? actor),
          approver: String(source?.fields.approver ?? existing?.fields.approver ?? ""),
          approvedAt: String(source?.fields.approvedAt ?? existing?.fields.approvedAt ?? ""),
          budgetLine: String(source?.fields.budgetLine ?? existing?.fields.budgetLine ?? "Workshop materials"),
          priority: String(source?.fields.priority ?? existing?.fields.priority ?? "normal"),
          netMinor: totals.netMinor,
          taxMinor: totals.taxMinor,
          version: existing ? Number(existing.fields.version ?? 1) + (alreadySent ? 1 : 0) : 1,
          sentAt: String(existing?.fields.sentAt ?? ""),
          delivery: "not_connected",
          warehouseId: String(existing?.fields.warehouseId ?? data.warehouses[0]?.id ?? ""),
          requisitionId: fromRequisition || String(existing?.fields.requisitionId ?? ""),
        };
        if (existing) {
          const ok5 = await context.mutate.patch(existing.id, {
            summary: note, amountMinor: totals.grossMinor, dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
            fields: { ...existing.fields, ...fields },
            body: {
              lines,
              revisions: alreadySent
                ? [...(existingBody.revisions ?? []), { version: Number(existing.fields.version ?? 1) + 1, at: now.toISOString(), change: `Revised by ${actor} after the order was issued.` }]
                : existingBody.revisions ?? [],
            },
          }, { expectRevision: existing.revision, event: `${existing.title} revised to version ${fields.version}` });
          if (!ok5) return; // the platform has already said the record changed elsewhere
          context.toast(alreadySent ? "Revision recorded" : "Order saved", alreadySent ? `${existing.title} is now version ${fields.version}. The supplier would need the revision, not a second order.` : "The draft is saved.");
        } else {
          await context.mutate.create({
            collection: "purchaseOrders", title: number, status: source ? "approved" : "draft",
            amountMinor: totals.grossMinor, at: now.toISOString(), dueAt: new Date(`${dueAt}T12:00:00`).toISOString(),
            summary: note || source?.summary || "", ownerName: actor, tags: ["po"], fields, body: { lines, revisions: [] },
          }, `Purchase order ${number} raised`);
          if (source) {
            const ok6 = await context.mutate.patch(source.id, { status: "converted" }, { expectRevision: source.revision, event: `${source.title} converted into ${number}` });
            if (!ok6) return; // the platform has already said the record changed elsewhere
          }
          context.toast("Purchase order raised", source ? `${number} carries ${source.title}'s approval by ${String(source.fields.approver)}.` : `${number} is a draft and needs approval before it can be issued.`);
        }
        close();
      }}
    >
      {existing && (
        <>
          <OverlaySummary
            eyebrow={alreadySent ? "Issued order, revision" : "Purchase order"}
            title={<span className="ds-num">{existing.title}</span>}
            status={<Pill tone={statusTone(existing.status)} dot>{existing.status.replace("_", " ")}</Pill>}
            meta={[alreadySent ? `Version ${String(existing.fields.version ?? 1)}, saving makes v${Number(existing.fields.version ?? 1) + 1}` : `Version ${String(existing.fields.version ?? 1)}`, existing.fields.approver ? `Approved by ${String(existing.fields.approver)}` : "Not approved"]}
          />
          <ProcChain stages={chainForOrder(existing, data.purchaseOrders, data.receipts, data.bills)} />
        </>
      )}
      <OverlaySection title="Source and supplier">
        <Stack gap={3}>
          {!existing && (
            <Field label="From an approved requisition" hint="Converting carries the approval across; raising from scratch does not.">
              <Select value={fromRequisition} onChange={(event) => {
                setFromRequisition(event.target.value);
                const chosen = data.purchaseOrders.find((item) => item.id === event.target.value);
                if (chosen) {
                  setSupplierId(String(chosen.fields.supplierId));
                  setLines(bodyOf<PoBody>(chosen, {}).lines ?? []);
                  setNote(chosen.summary);
                }
              }}>
                <option value="">Raise from scratch — needs its own approval</option>
                {approvedRequisitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {context.money(item.amountMinor)} · approved by {String(item.fields.approver)}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
              {data.suppliers.filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </Field>
          <Row gap={3} wrap>
            <Field label="Delivery expected"><TextInput type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
            <Field label="Reference note"><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          </Row>
          {supplier && supplierStatusNote(supplier)}
        </Stack>
      </OverlaySection>
      <OverlaySection title="Lines" hint={existing && receivedUnits > 0 ? `${receivedUnits} units are already received; a revision does not change what arrived.` : undefined}>
        <LineEditor lines={lines} setLines={setLines} currency={org.currency} money={context.money} withTax />
      </OverlaySection>
      <OverlaySection title={existing ? "Change impact" : "Value"} tone={alreadySent && valueChange !== 0 ? "warning" : "neutral"}>
        <Stack gap={3}>
          <Totals totals={totals} money={context.money} label="Order" />
          {existing && (
            <FactGrid columns={3} dense items={[
              { label: "Saved value", value: context.money(existing.amountMinor), mono: true },
              { label: "After this save", value: context.money(totals.grossMinor), mono: true },
              { label: "Change", value: `${valueChange > 0 ? "+" : ""}${context.money(valueChange)}`, mono: true, tone: valueChange === 0 ? undefined : valueChange > 0 ? "warning" : "success" },
            ]} />
          )}
          {alreadySent && (
            <Notice tone="warning" title={`Saving records version ${Number(existing?.fields.version ?? 1) + 1} of the same order`}>
              The supplier needs the revision, never a second order: a second order risks a double delivery.
            </Notice>
          )}
          {!existing && !fromRequisition && (
            <Notice tone="warning" title="Raised from scratch, so it starts as a draft">
              With no approved requisition behind it, this order carries no approval and cannot be issued until someone with the right limit approves it.
            </Notice>
          )}
        </Stack>
      </OverlaySection>
    </form>
  );
}

function supplierStatusNote(supplier: Rec) {
  if (String(supplier.fields.taxStatus) === "eu_business") {
    return <Notice tone="info" title="Reverse charge applies to this supplier">Tax is resolved as reverse charge for an EU business, so the order carries no local tax and the liability sits with the buyer.</Notice>;
  }
  if (supplier.status === "review") {
    return <Notice tone="warning" title="This supplier is under review">Orders can still be drafted, but the review state is shown to whoever approves the commitment.</Notice>;
  }
  return null;
}

export function ChangeImpact({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.selectedId) ?? data.purchaseOrders[0];
  if (!order) return <Empty title="No order" />;
  const body = bodyOf<PoBody>(order, {});
  const revisions = body.revisions ?? [];
  const lines = body.lines ?? [];
  const supplier = findSupplier(data, String(order.fields.supplierId ?? ""));
  const totals = poTotals(order, supplier, org.jurisdiction);
  const receipts = data.receipts.filter((receipt) => String(receipt.fields.purchaseOrderId) === order.id && receipt.status !== "expected");
  const bills = data.bills.filter((bill) => String(bill.fields.purchaseOrderId) === order.id);
  const requisition = data.purchaseOrders.find((item) => item.id === String(order.fields.requisitionId ?? ""));
  const receivedValue = lines.reduce((sum, line) => sum + Math.min(line.receivedQuantity, line.quantity) * line.unitPriceMinor, 0);
  const orderedValue = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  const approved = Boolean(order.fields.approver);
  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Purchase order"
        title={<span className="ds-num">{order.title}</span>}
        status={<Pill tone={statusTone(order.status)} dot>{order.status.replace("_", " ")}</Pill>}
        meta={[supplier?.title, `Version ${String(order.fields.version ?? 1)}`, String(order.fields.sentAt ?? "") ? `Issued ${context.date(String(order.fields.sentAt))}` : "Not issued"]}
      />
      <ProcChain stages={chainForOrder(order, data.purchaseOrders, data.receipts, data.bills)} />
      <FactGrid columns={4} items={[
        { label: "Order value", value: <strong>{context.money(totals.grossMinor)}</strong>, mono: true },
        { label: "Tax", value: context.money(totals.taxMinor), mono: true },
        { label: "Received so far", value: context.money(receivedValue), mono: true, hint: orderedValue ? `${Math.round((receivedValue / orderedValue) * 100)}% of lines` : undefined },
        { label: "Approval", value: approved ? `${String(order.fields.approver)}` : "Not approved", tone: approved ? "success" : "warning", hint: approved && order.fields.approvedAt ? context.date(String(order.fields.approvedAt)) : undefined },
      ]} />
      <OverlaySection title="Lines" hint="Ordered against received. Receiving is a separate record from the order." flush>
        <DataGrid rows={lines} rowId={(row) => row.id} label="Order lines" filterable={false}
          columns={[
            { key: "description", header: "Item", primary: true, cell: (row) => row.description },
            { key: "ordered", header: "Ordered", align: "end", cell: (row) => <span className="ds-num">{String(row.quantity)}</span> },
            { key: "received", header: "Received", align: "end", cell: (row) => <span className="ds-num">{String(row.receivedQuantity)}</span> },
            { key: "unit", header: "Unit", align: "end", cell: (row) => <span className="ds-num">{context.money(row.unitPriceMinor)}</span> },
          ]}
          empty={<Empty title="This order has no lines" />} />
      </OverlaySection>
      <OverlaySection title="Related records" flush>
        <KeyValueList items={[
          { label: "Requisition", value: requisition ? <Button size="sm" variant="ghost" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/proc/requisitions`); }}>{requisition.title}</Button> : <span className="ds-subtle">Raised directly</span> },
          { label: "Goods receipts", value: receipts.length ? receipts.map((receipt) => (
            <Button key={receipt.id} size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/proc/receiving`)}>{receipt.title}</Button>
          )) : <span className="ds-subtle">None yet</span> },
          { label: "Supplier invoices", value: bills.length ? bills.map((bill) => (
            <Button key={bill.id} size="sm" variant="ghost" onClick={() => context.openOverlay("three-way match", { id: bill.id })}>{bill.title}</Button>
          )) : <span className="ds-subtle">None recorded</span> },
        ]} />
      </OverlaySection>
      <OverlaySection title="Revision history" hint="A revision bumps the version on this record; it never adds an order." flush>
        {revisions.length === 0 ? (
          <span className="ds-subtle">No revision has been recorded; this order is on its original version.</span>
        ) : (
          <DataGrid rows={revisions} rowId={(row) => String(row.version)} label="Revisions" filterable={false}
            columns={[
              { key: "version", header: "Version", primary: true, cell: (row) => <span className="ds-num">v{String(row.version)}</span> },
              { key: "at", header: "Changed", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span> },
              { key: "change", header: "What changed", cell: (row) => row.change },
            ]} />
        )}
      </OverlaySection>
    </Stack>
  );
}

export function SendPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { org, now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.selectedId) ?? data.purchaseOrders.find(isPurchaseOrder);
  if (!order) return <Empty title="No order" />;
  const supplier = findSupplier(data, String(order.fields.supplierId));
  const totals = poTotals(order, supplier, org.jurisdiction);
  const approved = Boolean(order.fields.approver);
  const alreadySent = Boolean(order.fields.sentAt);
  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Issue the order"
        title={<span className="ds-num">{order.title} v{String(order.fields.version ?? 1)}</span>}
        status={<Pill tone={approved ? "success" : "danger"} dot>{approved ? `Approved by ${String(order.fields.approver)}` : "Not approved"}</Pill>}
        meta={[`To ${supplier?.title ?? "—"} · ${String(supplier?.fields.email ?? "no email on file")}`]}
      />
      <ProcChain stages={chainForOrder(order, data.purchaseOrders, data.receipts, data.bills)} />
      {(bodyOf<PoBody>(order, {}).lines ?? []).length === 0 && <Notice tone="warning" title="This order has no lines">There is nothing to issue. Add lines in the order editor first.</Notice>}
      <OverlaySection title="What the supplier would receive" hint={`From ${org.name}`} flush>
        <DataGrid rows={bodyOf<PoBody>(order, {}).lines ?? []} rowId={(row) => row.id} label="Order lines" filterable={false}
          columns={[
            { key: "description", header: "Item", primary: true, cell: (row) => row.description },
            { key: "qty", header: "Quantity", align: "end", cell: (row) => <span className="ds-num">{String(row.quantity)}</span> },
            { key: "unit", header: "Unit", align: "end", cell: (row) => <span className="ds-num">{context.money(row.unitPriceMinor)}</span> },
            { key: "line", header: "Line total", align: "end", cell: (row) => <span className="ds-num">{context.money(row.quantity * row.unitPriceMinor)}</span> },
          ]} />
      </OverlaySection>
      <Totals totals={totals} money={context.money} label="Order" />
      {!approved && <Notice tone="danger" title="This order is not approved">An unapproved order cannot be issued. Approve the requisition behind it, or have it approved on its own.</Notice>}
      {alreadySent && <Notice tone="warning" title="Already issued">It was issued on {context.date(String(order.fields.sentAt))}. Issuing again would re-send the same number; record a revision instead.</Notice>}
      <ProviderBoundary id="email.send" title="The order cannot be transmitted" kept="The order marked as issued, with who recorded it and when." />
      <DrawerActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={!approved || (bodyOf<PoBody>(order, {}).lines ?? []).length === 0}
              onClick={async () => {
                const ok7 = await context.mutate.patch(order.id, {
                  status: "sent",
                  fields: { ...order.fields, sentAt: now.toISOString(), sentBy: actor },
                }, { expectRevision: order.revision, event: `${order.title} marked as issued by ${actor}` });
                if (!ok7) return; // the platform has already said the record changed elsewhere
                context.toast("Marked as issued", `${order.title} is recorded as issued. Nothing was sent: no supplier connection exists.`);
                close();
              }}
            >
              {alreadySent ? "Re-record the issue date" : "Mark as issued"}
            </Button>
          }
          end={<OverlayCancel>Cancel</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

/* ---------------- PROC-006 / 007 ---------------- */

export function LocationEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [code, setCode] = useState(String(existing?.fields.code ?? ""));
  const [capacity, setCapacity] = useState(String(existing?.fields.capacityUnits ?? 500));
  const [bins, setBins] = useState(String(existing?.fields.bins ?? 12));
  const [manager, setManager] = useState(String(existing?.fields.managerName ?? ""));
  const duplicate = data.warehouses.some((warehouse) => warehouse.id !== existing?.id && String(warehouse.fields.code).toUpperCase() === code.trim().toUpperCase() && code.trim() !== "");
  const invalid = !title.trim() || duplicate;
  return (
    <form
      id="location-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = { code: code.trim().toUpperCase(), capacityUnits: Number(capacity) || 0, bins: Number(bins) || 0, managerName: manager.trim(), locationId: String(existing?.fields.locationId ?? "") };
        if (existing) {
          const ok8 = await context.mutate.patch(existing.id, { title: title.trim(), fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Warehouse ${title.trim()} edited` });
          if (!ok8) return; // the platform has already said the record changed elsewhere
        } else {
          await context.mutate.create({ collection: "warehouses", title: title.trim(), status: "active", summary: "", fields }, `Warehouse ${title.trim()} created`);
        }
        context.toast("Location saved", `${title.trim()} holds up to ${capacity} units across ${bins} bins.`);
        close();
      }}
    >
      <OverlaySection title="Site">
      <Stack gap={3}>
      <Field label="Location name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Code" error={duplicate ? "That code is already used" : undefined}><TextInput value={code} invalid={duplicate} onChange={(event) => setCode(event.target.value.toUpperCase())} /></Field>
        <Field label="Capacity in units"><TextInput value={capacity} inputMode="numeric" align="end" onChange={(event) => setCapacity(event.target.value)} /></Field>
        <Field label="Bins"><TextInput value={bins} inputMode="numeric" align="end" onChange={(event) => setBins(event.target.value)} /></Field>
      </Row>
      <Field label="Manager"><TextInput value={manager} onChange={(event) => setManager(event.target.value)} /></Field>
      </Stack>
      </OverlaySection>
      <Notice tone="info">Capacity warns when a site is nearly full. It never blocks a receipt: the goods have already arrived.</Notice>
    </form>
  );
}

export function StockCount({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const warehouse = useRecord(payload?.id ?? context.selectedId) ?? data.warehouses[0];
  const [counts, setCounts] = useState<Record<string, string>>({});
  if (!warehouse) return <Empty title="No location" />;
  const rows = data.products.filter((product) => product.status !== "archived").map((product) => {
    const expected = data.stockMoves.filter((move) => String(move.fields.productId) === product.id && String(move.fields.warehouseId) === warehouse.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
    const counted = counts[product.id] === undefined || counts[product.id] === "" ? undefined : Number(counts[product.id]);
    return { product, expected, counted, variance: counted === undefined ? undefined : counted - expected };
  });
  const variances = rows.filter((row) => row.variance !== undefined && row.variance !== 0);
  return (
    <form
      id="stock-count"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const row of variances) {
          await context.mutate.create({
            collection: "stockMoves",
            title: `count variance · ${String(row.product.fields.sku ?? row.product.title)}`,
            status: "posted",
            at: now.toISOString(),
            summary: `Counted ${row.counted} at ${warehouse.title}, expected ${row.expected}.`,
            fields: { productId: row.product.id, warehouseId: warehouse.id, quantity: row.variance ?? 0, kind: "count", reference: `COUNT-${now.getTime().toString().slice(-5)}` },
          }, `Count variance recorded for ${row.product.title}`);
        }
        context.toast("Count recorded", `${variances.length} variance movement${variances.length === 1 ? "" : "s"} written against ${warehouse.title}.`);
        close();
      }}
    >
      <DrawerUnsavedChanges when={Object.values(counts).some((value) => value !== "")} />
      <OverlaySummary eyebrow="Stock count" title={warehouse.title}
        meta={[`${rows.filter((row) => row.counted !== undefined).length} of ${rows.length} lines counted`, `${variances.length} variance${variances.length === 1 ? "" : "s"} to record`]} />
      <OverlaySection title="Count sheet" hint="Leave a line blank if it was not counted." flush>
      <CountList label="Count sheet" rows={rows.map((row) => ({
        id: row.product.id, title: row.product.title,
        facts: [{ label: "Expected", value: String(row.expected) }, { label: "Variance", value: row.variance === undefined ? "Not counted" : `${row.variance > 0 ? "+" : ""}${row.variance}`, tone: row.variance ? "danger" : undefined }],
        inputHeader: "Counted", inputLabel: `Counted ${row.product.title}`,
        value: counts[row.product.id] ?? "", onChange: (next) => setCounts((current) => ({ ...current, [row.product.id]: next })),
      }))} />
      </OverlaySection>
      <Notice tone="warning" title="A variance becomes its own movement">
        The level is never overwritten. Each difference is written as a movement carrying the counted and expected figures.
      </Notice>
    </form>
  );
}

export function TransferForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { now } = useWorkspace();
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [from, setFrom] = useState(data.warehouses[0]?.id ?? "");
  const [to, setTo] = useState(data.warehouses[1]?.id ?? data.warehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const available = data.stockMoves.filter((move) => String(move.fields.productId) === productId && String(move.fields.warehouseId) === from).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
  const amount = Number(quantity) || 0;
  const invalid = from === to || amount <= 0 || amount > available;
  return (
    <form
      id="transfer-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const product = data.products.find((item) => item.id === productId);
        const reference = `TRF-${now.getTime().toString().slice(-5)}`;
        await context.mutate.create({ collection: "stockMoves", title: `transfer out · ${String(product?.fields.sku ?? "")}`, status: "posted", at: now.toISOString(), summary: `To ${data.warehouses.find((item) => item.id === to)?.title}.`, fields: { productId, warehouseId: from, quantity: -amount, kind: "transfer_out", reference } }, `Transfer out ${amount}`);
        await context.mutate.create({ collection: "stockMoves", title: `transfer in · ${String(product?.fields.sku ?? "")}`, status: "posted", at: now.toISOString(), summary: `From ${data.warehouses.find((item) => item.id === from)?.title}.`, fields: { productId, warehouseId: to, quantity: amount, kind: "transfer_in", reference } }, `Transfer in ${amount}`);
        context.toast("Transfer recorded", `Two movements written under ${reference}; the company total is unchanged.`);
        close();
      }}
    >
      <OverlaySection title="What moves and where">
      <Stack gap={3}>
      <Field label="Product"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{data.products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Row gap={3} wrap>
        <Field label="From"><Select value={from} onChange={(event) => setFrom(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(event) => setTo(event.target.value)}>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="Quantity" hint={`${available} at the source`} error={amount > available ? "More than the source holds" : from === to ? "Choose two different sites" : undefined}>
          <TextInput value={quantity} inputMode="numeric" align="end" invalid={invalid} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
      </Row>
      </Stack>
      </OverlaySection>
      <FactGrid columns={3} dense items={[
        { label: "At the source", value: String(available), mono: true },
        { label: "After, at the source", value: String(available - amount), mono: true, tone: available - amount < 0 ? "danger" : undefined },
        { label: "Company total", value: "Unchanged", hint: "Two movements under one reference" },
      ]} />
    </form>
  );
}

export function ScanOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const chosen = useRecord(payload?.id ?? context.selectedId);
  // A selected receipt or order presets the form; any other selection (a stock row, say) is ignored.
  const target = chosen && ["receipts", "purchaseOrders"].includes(chosen.collection) ? chosen : undefined;
  const data = useProcData();
  if (payload?.id && !target) return <Empty title="Loading the record" />;
  if (target?.collection === "receipts" && target.status !== "expected") {
    return (
      <Notice tone="warning" title={`${target.title} has already been counted`}>
        It was received as {target.status}. Counting it again would add the same goods twice; record a discrepancy against it instead.
      </Notice>
    );
  }
  const presetOrder = target?.collection === "purchaseOrders" ? target.id : target ? String(target.fields.purchaseOrderId ?? "") : "";
  if (data.purchaseOrders.length === 0) return <Empty title="No purchase order to receive against yet" />;
  return <ScanOverlayForm key={target?.id ?? "new"} context={context} close={close} receipt={target?.collection === "receipts" ? target : undefined} presetOrder={presetOrder} loaded={data} />;
}

function ScanOverlayForm({ context, close, receipt, presetOrder, loaded }: { context: ScreenContext; close: () => void; receipt: Rec | undefined; presetOrder: string; loaded: ReturnType<typeof useProcData> }) {
  const live = useProcData();
  const data = live.purchaseOrders.length ? live : loaded;
  const { org, now, actor } = useWorkspace();
  const openOrders = data.purchaseOrders.filter((order) => isPurchaseOrder(order) && ["approved", "sent"].includes(order.status));
  const [orderId, setOrderId] = useState(presetOrder || String((openOrders.find((item) => outstandingFor(item).length > 0) ?? openOrders[0])?.id ?? ""));
  const order = data.purchaseOrders.find((item) => item.id === orderId);
  const supplier = findSupplier(data, String(order?.fields.supplierId ?? ""));
  const outstanding = outstandingFor(order);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<string[]>(bodyOf<ReceiptBody>(receipt, {}).scans ?? []);
  const [scan, setScan] = useState("");
  const [damaged, setDamaged] = useState(false);

  const countFor = (lineId: string) => Number(received[lineId] ?? 0);
  const outstandingTotal = outstanding.reduce((sum, row) => sum + row.outstanding, 0);
  const addScan = () => {
    const code = scan.trim().toUpperCase();
    if (!code) return;
    if (scans.includes(code)) { context.toast("Already scanned", `${code} is already on this receipt, so it was not counted twice.`, "blocked"); setScan(""); return; }
    setScans((current) => [...current, code]);
    setScan("");
  };
  const totalReceived = outstanding.reduce((sum, row) => sum + countFor(row.line.id), 0);
  const over = outstanding.some((row) => countFor(row.line.id) > row.outstanding);
  const invalid = !order || totalReceived <= 0 || over;

  return (
    <form
      id="scan-overlay"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid || !order) return;
        const body = bodyOf<PoBody>(order, {});
        const lines = (body.lines ?? []).map((line) => ({ ...line, receivedQuantity: line.receivedQuantity + countFor(line.id) }));
        const complete = lines.every((line) => line.receivedQuantity >= line.quantity);
        const receiptLines = outstanding.filter((row) => countFor(row.line.id) > 0).map((row) => ({
          lineId: row.line.id,
          description: row.line.description,
          expected: row.line.quantity,
          received: row.line.receivedQuantity + countFor(row.line.id),
          condition: damaged ? "damaged" : "good",
          bin: String(order.fields.warehouseId ?? ""),
        }));
        const number = `GRN-${85 + data.receipts.length}`;

        if (receipt && receipt.status === "expected") {
          const ok9 = await context.mutate.patch(receipt.id, {
            status: damaged ? "exception" : complete ? "complete" : "exception",
            at: now.toISOString(),
            fields: {
              ...receipt.fields,
              receivedBy: actor,
              scanned: scans.length > 0,
              discrepancy: damaged ? "damaged" : complete ? "none" : "short",
              quantityReceived: totalReceived,
            },
            body: { lines: receiptLines, scans },
          }, { expectRevision: receipt.revision, event: `${receipt.title} received by ${actor}` });
          if (!ok9) return; // the platform has already said the record changed elsewhere
        } else {
          await context.mutate.create({
            collection: "receipts",
            title: number,
            status: damaged ? "exception" : complete ? "complete" : "exception",
            at: now.toISOString(),
            summary: `${totalReceived} units received against ${order.title}.`,
            fields: {
              purchaseOrderId: order.id,
              supplierId: String(order.fields.supplierId ?? ""),
              warehouseId: String(order.fields.warehouseId ?? ""),
              receivedBy: actor,
              scanned: scans.length > 0,
              discrepancy: damaged ? "damaged" : complete ? "none" : "short",
              lineCount: receiptLines.length,
              quantityExpected: outstanding.reduce((sum, row) => sum + row.outstanding, 0),
              quantityReceived: totalReceived,
            },
            body: { lines: receiptLines, scans },
          }, `Goods receipt ${number} raised against ${order.title}`);
        }

        const ok10 = await context.mutate.patch(order.id, {
          status: complete ? "received" : order.status,
          body: { ...body, lines },
        }, { expectRevision: order.revision, event: `${order.title} receipted: ${totalReceived} units` });
        if (!ok10) return; // the platform has already said the record changed elsewhere

        for (const row of outstanding) {
          const quantity = countFor(row.line.id);
          if (quantity <= 0 || !row.line.productId) continue;
          await context.mutate.create({
            collection: "stockMoves",
            title: `receipt · ${row.line.description}`,
            status: "posted",
            at: now.toISOString(),
            summary: `Received against ${order.title}.`,
            fields: { productId: row.line.productId, warehouseId: String(order.fields.warehouseId ?? ""), quantity, kind: "receipt", reference: order.title },
          }, `Stock received for ${row.line.description}`);
        }

        context.toast("Goods received", `${totalReceived} units recorded against ${order.title}${complete ? " and the order is now complete" : ", leaving the balance outstanding"}. Stock moved only for catalogue lines.`);
        close();
      }}
    >
      <DrawerUnsavedChanges when={totalReceived > 0 || scans.length > 0 || damaged} />
      <OverlaySection title="Order being received">
        <Stack gap={3}>
          <Field label="Receive against" required>
            <Select value={orderId} onChange={(event) => { setOrderId(event.target.value); setReceived({}); }} required>
              {openOrders.map((item) => <option key={item.id} value={item.id}>{item.title} · {findSupplier(data, String(item.fields.supplierId))?.title}</option>)}
            </Select>
          </Field>
          {order && (
            <FactGrid columns={4} dense items={[
              { label: "Supplier", value: supplier?.title ?? "—" },
              { label: "Expected", value: order.dueAt ? context.date(order.dueAt) : "No date", mono: true },
              { label: "Order value", value: context.money(poTotals(order, supplier, org.jurisdiction).grossMinor), mono: true },
              { label: "Approved by", value: String(order.fields.approver ?? "") || "Not recorded", tone: order.fields.approver ? undefined : "warning" },
            ]} />
          )}
        </Stack>
      </OverlaySection>
      {!order ? <Notice tone="warning" title="No order is open for receipt">Goods are only ever received against an approved or issued purchase order.</Notice> : (
        <>
          <OverlaySection title="Count what arrived" hint="Enter what is physically here. The receipt is its own record, separate from the order and the invoice." flush>
          {outstanding.length === 0 ? <Notice tone="success" title="Everything on this order has been received">There is nothing outstanding to receipt.</Notice> : (
            <CountList label="Outstanding lines" rows={outstanding.map((row) => ({
              id: row.line.id, title: row.line.description,
              facts: [{ label: "Ordered", value: String(row.line.quantity) }, { label: "Already received", value: String(row.line.receivedQuantity) }, { label: "Outstanding", value: String(row.outstanding) }],
              inputHeader: "Received now", inputLabel: `Received now for ${row.line.description}`,
              invalid: countFor(row.line.id) > row.outstanding,
              value: received[row.line.id] ?? "", onChange: (next) => setReceived((current) => ({ ...current, [row.line.id]: next })),
            }))} />
          )}
          </OverlaySection>
          {outstanding.length > 0 && (
            <FactGrid columns={3} dense items={[
              { label: "Counted now", value: String(totalReceived), mono: true },
              { label: "Still outstanding after", value: String(Math.max(0, outstandingTotal - totalReceived)), mono: true, tone: totalReceived > 0 && outstandingTotal - totalReceived > 0 ? "warning" : undefined },
              { label: "Receipt will be", value: totalReceived <= 0 ? "Not started" : damaged ? "An exception (damage)" : outstandingTotal - totalReceived > 0 ? "An exception (short)" : "Complete", tone: totalReceived <= 0 ? undefined : damaged || outstandingTotal - totalReceived > 0 ? "warning" : "success" },
            ]} />
          )}
          <OverlaySection title="Scans and condition">
            <Stack gap={3}>
              <Row gap={2} wrap>
                <Field label="Scan a barcode" hint="Each code is recorded once; a repeated scan is ignored. Enter adds the scan.">
                  <TextInput value={scan} onChange={(event) => setScan(event.target.value)} placeholder="TB-COL-60"
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addScan(); } }} />
                </Field>
                <Button size="sm" variant="secondary" onClick={addScan}>Add scan</Button>
              </Row>
              {scans.length > 0 && <Row gap={1} wrap>{scans.map((code) => <Pill key={code}>{code}</Pill>)}</Row>}
              <Checkbox label="Something arrived damaged" checked={damaged} onChange={(event) => setDamaged(event.target.checked)} />
            </Stack>
          </OverlaySection>
          {over && <Notice tone="danger" title="More than the order allows">A receipt cannot exceed what was ordered. Raise a revision if the supplier genuinely sent more.</Notice>}
          <Notice tone="info" title="What recording writes">
            A goods receipt, the received quantities on the order and one stock movement per catalogue line. Stock never changes without a receipt behind it. It does not approve or pay the supplier invoice.
          </Notice>
        </>
      )}
    </form>
  );
}

export function Discrepancy({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const receipt = useRecord(payload?.id ?? context.selectedId) ?? data.receipts.find((item) => item.status === "exception");
  const order = data.purchaseOrders.find((item) => item.id === String(receipt?.fields.purchaseOrderId ?? ""));
  const [kind, setKind] = useState("short");
  const [note, setNote] = useState("");
  if (!receipt) return <Empty title="No receipt selected" />;
  const expected = Number(receipt.fields.quantityExpected ?? 0);
  const received = Number(receipt.fields.quantityReceived ?? 0);
  return (
    <form
      id="discrepancy"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!note.trim()) return;
        const ok11 = await context.mutate.patch(receipt.id, {
          status: "exception",
          fields: { ...receipt.fields, discrepancy: kind, discrepancyNote: note.trim(), flaggedBy: actor },
        }, { expectRevision: receipt.revision, event: `Discrepancy on ${receipt.title}: ${kind}` });
        if (!ok11) return; // the platform has already said the record changed elsewhere
        context.toast("Discrepancy recorded", "The supplier invoice for this order will not match until it is resolved.");
        close();
      }}
    >
      <ModalUnsavedChanges when={Boolean(note.trim()) || kind !== "short"} />
      <OverlaySummary eyebrow="Receipt" title={<span className="ds-num">{receipt.title}</span>}
        status={<Pill tone={statusTone(receipt.status)} dot>{receipt.status.replace("_", " ")}</Pill>}
        meta={[order ? `Against ${order.title}` : undefined, order ? findSupplier(data, String(order.fields.supplierId))?.title : undefined]} />
      <FactGrid columns={3} items={[
        { label: "Expected", value: String(expected), mono: true },
        { label: "Received", value: String(received), mono: true },
        { label: "Difference", value: `${received - expected > 0 ? "+" : ""}${received - expected}`, mono: true, tone: received - expected === 0 ? undefined : "danger" },
      ]} />
      <OverlaySection title="What went wrong">
        <Stack gap={3}>
          <Field label="Classification">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              {["short", "over", "damaged", "wrong_item", "late"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="What happened" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
        </Stack>
      </OverlaySection>
      <Notice tone="warning" title="A discrepancy blocks payment, it does not adjust stock">
        Stock reflects what physically arrived. The difference is carried into the three-way match, so the invoice cannot be paid in full until it is settled.
      </Notice>
    </form>
  );
}

export function ReceiptConfirmation({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const receipt = useRecord(payload?.id ?? context.selectedId) ?? data.receipts[0];
  if (!receipt) return <Empty title="No receipt" />;
  const order = data.purchaseOrders.find((item) => item.id === String(receipt.fields.purchaseOrderId));
  const supplier = findSupplier(data, String(receipt.fields.supplierId ?? order?.fields.supplierId ?? ""));
  const lines = bodyOf<ReceiptBody>(receipt, {}).lines ?? [];
  const scans = bodyOf<ReceiptBody>(receipt, {}).scans ?? [];
  const bills = order ? data.bills.filter((bill) => String(bill.fields.purchaseOrderId) === order.id) : [];
  const discrepancy = String(receipt.fields.discrepancy ?? "none");
  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Goods receipt"
        title={<span className="ds-num">{receipt.title}</span>}
        status={<Pill tone={statusTone(receipt.status)} dot>{receipt.status.replace("_", " ")}</Pill>}
        meta={[order ? `Against ${order.title}` : undefined, supplier?.title, receipt.at ? context.dateTime(receipt.at) : undefined]}
      />
      {order && <ProcChain stages={chainForOrder(order, data.purchaseOrders, data.receipts, data.bills)} />}
      <FactGrid columns={4} items={[
        { label: "Received by", value: String(receipt.fields.receivedBy || "Nobody yet") },
        { label: "Units received", value: String(receipt.fields.quantityReceived ?? "—"), mono: true, hint: receipt.fields.quantityExpected !== undefined ? `of ${String(receipt.fields.quantityExpected)} expected` : undefined },
        { label: "Scans", value: receipt.fields.scanned === true ? `${scans.length} codes` : "Not scanned", mono: true, tone: receipt.fields.scanned === true ? "success" : "warning" },
        { label: "Discrepancy", value: discrepancy.replace("_", " "), tone: discrepancy === "none" ? "success" : "danger" },
      ]} />
      {discrepancy !== "none" && String(receipt.fields.discrepancyNote ?? "") && (
        <Notice tone="danger" title={`Discrepancy: ${discrepancy.replace("_", " ")}`}>{String(receipt.fields.discrepancyNote)}</Notice>
      )}
      {lines.length > 0 && (
        <OverlaySection title="Lines received" flush>
          <DataGrid rows={lines} rowId={(row) => row.lineId} label="Receipt lines" filterable={false}
            columns={[
              { key: "description", header: "Item", primary: true, cell: (row) => row.description },
              { key: "expected", header: "Expected", align: "end", cell: (row) => <span className="ds-num">{String(row.expected)}</span> },
              { key: "received", header: "Received", align: "end", cell: (row) => <span className="ds-num">{String(row.received)}</span> },
              { key: "condition", header: "Condition", cell: (row) => <Pill tone={row.condition === "good" ? "success" : "danger"}>{row.condition || "not recorded"}</Pill> },
            ]} />
        </OverlaySection>
      )}
      {receipt.status !== "expected" && <ReceiptStockLinks context={context} receipt={receipt} />}
      <OverlaySection title="Supplier invoices against this order" hint="The invoice is matched separately; this receipt does not approve payment." flush>
        {bills.length === 0 ? <span className="ds-subtle">No invoice has been recorded against this order.</span> : (
          <Row gap={2} wrap>{bills.map((bill) => <Button key={bill.id} size="sm" variant="secondary" onClick={() => context.openOverlay("three-way match", { id: bill.id })}>Match {bill.title}</Button>)}</Row>
        )}
      </OverlaySection>
    </Stack>
  );
}

/* ---------------- PROC-008 ---------------- */

export function MovementInspector({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const move = useRecord(payload?.id ?? context.selectedId) ?? data.stockMoves[0];
  if (!move) return <Empty title="No movement" />;
  const product = data.products.find((item) => item.id === String(move.fields.productId));
  const reference = String(move.fields.reference ?? "");
  const order = data.purchaseOrders.find((item) => item.title === reference);
  return (
    <Stack gap={4}>
      <OverlaySummary eyebrow={String(move.fields.kind ?? "move").replace("_", " ")} title={move.title}
        status={<Pill tone={Number(move.fields.quantity) >= 0 ? "success" : "warning"} dot>{Number(move.fields.quantity) > 0 ? "+" : ""}{String(move.fields.quantity)} units</Pill>}
        meta={[context.dateTime(move.at), `by ${move.createdBy}`]} />
      <FactGrid columns={2} items={[
        { label: "Product", value: product?.title ?? String(move.fields.productId) },
        { label: "Site", value: data.warehouses.find((item) => item.id === String(move.fields.warehouseId))?.title ?? "—" },
        { label: "Reference", value: reference || "None", mono: true, tone: reference ? undefined : "danger" },
        { label: "Quantity", value: `${Number(move.fields.quantity) > 0 ? "+" : ""}${String(move.fields.quantity)}`, mono: true },
      ]} />
      {order ? (
        <Notice tone="success" title="Traceable to a purchase order">{order.title} from {findSupplier(data, String(order.fields.supplierId))?.title ?? "an unknown supplier"}.</Notice>
      ) : reference ? (
        <Notice tone="info" title="Traceable to a reference">{reference} is recorded, but it is not a purchase order in this workspace.</Notice>
      ) : (
        <Notice tone="danger" title="This movement has no reference">Nothing links it to an order, a receipt or a count. It is the kind of row an audit asks about first.</Notice>
      )}
    </Stack>
  );
}

export function MovementAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { now, actor } = useWorkspace();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [kind, setKind] = useState("adjustment");
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const product = data.products.find(row => row.id === productId);
  const warehouse = data.warehouses.find(row => row.id === warehouseId);
  const onHand = data.stockMoves
    .filter(move => String(move.fields.productId) === productId && String(move.fields.warehouseId) === warehouseId)
    .reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
  const delta = Number(quantity);
  const validQuantity = /^-?\d+$/.test(quantity.trim()) && Number.isSafeInteger(delta) && delta !== 0;
  const signError = (kind === "damage" || kind === "shrinkage") && delta > 0
    ? "Damage and shrinkage must reduce the stock count (negative quantity)."
    : kind === "found" && delta < 0
      ? "Found stock must increase the stock count (positive quantity)."
      : "";
  const invalid = !product || !warehouse || !validQuantity || !Number.isSafeInteger(onHand)
    || onHand + delta < 0 || Boolean(signError) || reason.trim().length < 10;
  const permitted = context.can("approve_payment") || context.role === "owner";
  const canRecord = !busy && !invalid && reviewed && permitted;

  return (
    <form id="movement-authorization" className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canRecord || !product || !warehouse) return;
        setBusy(true);
        setError("");
        try {
          await context.mutate.create({
            collection: "stockMoves",
            title: `${kind} · ${String(product.fields.sku ?? product.title)}`,
            status: "posted",
            at: now.toISOString(),
            summary: reason.trim(),
            fields: {
              productId, warehouseId, quantity: delta, kind,
              reference: `ADJ-${now.getTime().toString().slice(-5)}`,
              authorisedBy: actor,
            },
          }, `Stock ${kind} of ${delta} recorded by ${actor}`);
          context.toast("Stock movement recorded",
            `${product.title} at ${warehouse.title}: ${delta > 0 ? "+" : ""}${delta} recorded locally. Reconcile the warehouse count before relying on the new on-hand estimate.`);
          close();
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Review the movement and try again.";
          setError(message);
          context.toast("Stock movement not recorded", message, "failed");
        } finally { setBusy(false); }
      }}>
      <ModalUnsavedChanges when={Boolean(productId || warehouseId || quantity || reason.trim() || reviewed)} />
      <ModalInFlight when={busy} />
      <OverlaySection title="What moves" hint="Counts come from recorded movements, not independently verified warehouse stock. No inventory provider is connected.">
      <Stack gap={3}>
      <Field label="Product" required>
        <Select aria-label="Product" value={productId} disabled={busy}
          onChange={event => { setProductId(event.target.value); setReviewed(false); setError(""); }}>
          <option value="">Select product</option>
          {data.products.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Warehouse" required>
        <Select aria-label="Warehouse" value={warehouseId} disabled={busy}
          onChange={event => { setWarehouseId(event.target.value); setReviewed(false); setError(""); }}>
          <option value="">Select warehouse</option>
          {data.warehouses.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Movement type">
          <Select aria-label="Movement type" value={kind} disabled={busy}
            onChange={event => { setKind(event.target.value); setReviewed(false); }}>
            {["adjustment", "damage", "shrinkage", "found", "correction"].map(option =>
              <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Field label="Signed quantity" required
          hint="Use a negative number to remove stock and a positive number to add stock."
          error={signError || ((product && warehouse && validQuantity && onHand + delta < 0) ? "This would produce a negative stock balance." : undefined)}>
          <TextInput aria-label="Signed quantity" value={quantity} disabled={busy}
            inputMode="numeric" align="end"
            onChange={event => { setQuantity(event.target.value); setReviewed(false); setError(""); }} />
        </Field>
      </Row>
      </Stack>
      </OverlaySection>
      <FactGrid columns={4} dense items={[
        { label: "Recorded on hand", value: product && warehouse ? String(onHand) : "—", mono: true },
        { label: "Movement", value: validQuantity ? `${delta > 0 ? "+" : ""}${delta}` : "—", mono: true, tone: validQuantity ? (delta < 0 ? "warning" : "success") : undefined },
        { label: "After", value: product && warehouse && validQuantity ? String(onHand + delta) : "—", mono: true },
        { label: "Authorised by", value: actor },
      ]} />
      <Field label="Reason for adjustment" required
        hint="Minimum 10 characters. Include the source count, damage record or authorisation reference.">
        <TextArea aria-label="Reason for adjustment" rows={2} value={reason} disabled={busy}
          onChange={event => { setReason(event.target.value); setReviewed(false); setError(""); }} />
      </Field>
      {!permitted && <Notice tone="warning" title="A permitted procurement reviewer is required">
        This local role view does not have approval capability. It is a UI guard, not server-side authorisation.
      </Notice>}
      <Checkbox checked={reviewed} disabled={busy || invalid}
        onChange={event => setReviewed(event.target.checked)}
        label="I checked the selected product, site, direction, quantity and supporting reason." />
      {error && <Notice tone="danger" title="Movement could not be recorded">{error}</Notice>}
      <ModalActions>
        <OverlayActions
          primary={<Button variant="primary" type="submit" form="movement-authorization" disabled={!canRecord} busy={busy}>Record stock movement</Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </form>
  );
}

/* ---------------- PROC-009 ---------------- */

export function ReorderPolicy() {
  const data = useProcData();
  return (
    <Stack gap={4}>
      <OverlaySection title="How a suggestion is made" flush>
      <KeyValueList items={[
        { label: "Suggested when", value: "On hand plus units already on order falls to or below the reorder point" },
        { label: "Suggested quantity", value: "The reorder quantity recorded on the product, unchanged" },
        { label: "Lead time", value: "Shown so the buyer can judge whether it will arrive in time" },
        { label: "Not used", value: "Seasonality, promotions, or any projection of future demand" },
      ]} />
      </OverlaySection>
      <DataGrid rows={data.products.filter((product) => product.status === "active")} rowId={(row) => row.id} label="Reorder policy" filterable={false}
        columns={[
          { key: "product", header: "Product", primary: true, cell: (row) => row.title },
          { key: "point", header: "Reorder point", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.reorderPoint ?? 0)}</span> },
          { key: "quantity", header: "Reorder quantity", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.reorderQuantity ?? 0)}</span> },
          { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.leadTimeDays ?? 0)}d</span> },
        ]} />
      <Notice tone="warning" title="These figures were set by a person, not learned">
        Nothing adjusts a reorder point automatically. If demand has changed, the point is wrong until someone changes it.
      </Notice>
    </Stack>
  );
}

export function Scenario({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const [uplift, setUplift] = useState("0");
  const factor = 1 + (Number(uplift) || 0) / 100;
  const rows = data.products.filter((product) => product.status === "active").map((product) => {
    const onHand = data.stockMoves.filter((move) => String(move.fields.productId) === product.id).reduce((sum, move) => sum + Number(move.fields.quantity ?? 0), 0);
    const point = Math.round(Number(product.fields.reorderPoint ?? 0) * factor);
    return { product, onHand, point, short: onHand < point };
  });
  return (
    <Stack gap={4}>
      <Field label="Raise every reorder point by a percentage" hint="A what-if on the recorded points, not a forecast.">
        <TextInput value={uplift} inputMode="numeric" align="end" onChange={(event) => setUplift(event.target.value)} />
      </Field>
      <DataGrid rows={rows} rowId={(row) => row.product.id} label="Scenario" filterable={false}
        rowTone={(row) => (row.short ? "warning" : undefined)}
        columns={[
          { key: "product", header: "Product", primary: true, cell: (row) => row.product.title },
          { key: "onhand", header: "On hand", align: "end", cell: (row) => <span className="ds-num">{String(row.onHand)}</span> },
          { key: "point", header: "Point in this scenario", align: "end", cell: (row) => <span className="ds-num">{String(row.point)}</span> },
          { key: "short", header: "Would suggest an order", cell: (row) => (row.short ? <Pill tone="warning">Yes</Pill> : <Pill tone="success">No</Pill>) },
        ]} />
      <FactGrid columns={2} dense items={[
        { label: "Would suggest an order", value: `${rows.filter((row) => row.short).length} of ${rows.length} products`, mono: true, tone: rows.some((row) => row.short) ? "warning" : undefined },
        { label: "Money committed", value: context.money(0), mono: true, hint: "Applying changes reorder points only" },
      ]} />
      <Notice tone="warning" title="A scenario changes nothing until you apply it">
        Applying changes reorder points only; no order is created.
      </Notice>
      <DrawerActions>
        <OverlayActions primary={<Button variant="primary" disabled={!(Number(uplift) || 0)} onClick={() => applyScenario(context, Number(uplift) || 0)}>Apply to reorder points…</Button>} end={<OverlayCancel>Close</OverlayCancel>} />
      </DrawerActions>
    </Stack>
  );
}

export function PurchasePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  return <RequisitionForm context={context} close={close} />;
}

/* ---------------- PROC-010 and the three-way match ---------------- */

export function ThreeWayMatch({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { org, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const bill = useRecord(payload?.id ?? context.selectedId) ?? data.bills[0];
  if (!bill) return <Empty title="No supplier invoice" />;
  const supplier = findSupplier(data, String(bill.fields.supplierId));
  const match = threeWayMatch(bill, data.purchaseOrders, data.receipts);
  const totals = billTotals(bill, supplier, org.jurisdiction);
  const payable = match.state === "matched";

  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Three-way match"
        title={<span className="ds-num">{bill.title}</span>}
        status={<Pill tone={matchTone(match.state)} dot>{MATCH_LABEL[match.state]}</Pill>}
        meta={[supplier?.title]}
      />
      <FactGrid columns={3} items={[
        { label: "Purchase order", value: match.order?.title ?? "None referenced", mono: true, tone: match.order ? undefined : "danger" },
        { label: "Goods receipts", value: match.receipts.length ? match.receipts.map((receipt) => receipt.title).join(", ") : "None", mono: true, tone: match.receipts.length ? undefined : "warning" },
        { label: "Invoice", value: <strong>{context.money(totals.grossMinor)}</strong>, mono: true },
      ]} />

      {match.lines.length > 0 && (
        <DataGrid rows={match.lines} rowId={(row) => row.description} label="Three-way match" filterable={false}
          rowTone={(row) => (!row.quantityAgrees || !row.priceAgrees ? "danger" : undefined)}
          columns={[
            { key: "description", header: "Item", primary: true, cell: (row) => row.description },
            { key: "ordered", header: "Ordered", align: "end", cell: (row) => <span className="ds-num">{String(row.ordered)}</span> },
            { key: "received", header: "Received", align: "end", cell: (row) => <span className="ds-num">{String(row.received)}</span> },
            { key: "billed", header: "Billed", align: "end", cell: (row) => <strong className={row.quantityAgrees ? "ds-num" : "ds-field-error"}>{String(row.billed)}</strong> },
            { key: "orderPrice", header: "Order price", align: "end", cell: (row) => <span className="ds-num">{context.money(row.orderedPriceMinor)}</span> },
            { key: "billPrice", header: "Billed price", align: "end", cell: (row) => <strong className={row.priceAgrees ? "ds-num" : "ds-field-error"}>{context.money(row.billedPriceMinor)}</strong> },
            { key: "agrees", header: "Agrees", cell: (row) => (row.quantityAgrees && row.priceAgrees ? <Pill tone="success">Yes</Pill> : <Pill tone="danger">{!row.quantityAgrees ? "Quantity" : "Price"}</Pill>) },
          ]} />
      )}

      <Totals totals={totals} money={context.money} label="Invoice" />

      {match.blockedReason ? (
        <Notice tone="danger" title="This invoice cannot be approved for payment">{match.blockedReason}</Notice>
      ) : (
        <Notice tone="success" title="Order, receipt and invoice agree">Every line was ordered, received and billed at the same quantity and price.</Notice>
      )}

      <ProviderBoundary id="payment.capture" title="Payment itself happens outside this workspace" kept="The match result and who approved the invoice for payment." />

      <DrawerActions>
        <OverlayActions
          primary={
            <Button
              variant="primary"
              disabled={!payable || String(bill.fields.payment) === "paid_local"}
              onClick={async () => {
                const ok12 = await context.mutate.patch(bill.id, {
                  status: "approved",
                  fields: { ...bill.fields, matchState: "matched", approvedBy: actor, payment: "approved_local" },
                }, { expectRevision: bill.revision, event: `${bill.title} approved for payment by ${actor} after a three-way match` });
                if (!ok12) return; // the platform has already said the record changed elsewhere
                context.toast("Approved for payment", `${bill.title} is cleared by the match. Paying it is a separate step in the ledger, outside this screen.`);
                close();
              }}
            >
              {String(bill.fields.payment) === "paid_local" ? "Already paid in the ledger" : payable ? "Approve for payment" : "Blocked by the match"}
            </Button>
          }
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function MetricSource({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const orders = data.purchaseOrders.filter(isPurchaseOrder);
  return (
    <Stack gap={4}>
      <KeyValueList items={[
        { label: "Counted", value: "Approved, sent, received and closed purchase orders" },
        { label: "Excluded", value: `${orders.filter((order) => order.status === "cancelled").length} cancelled and ${orders.filter((order) => order.status === "draft").length} draft orders` },
        { label: "Requisitions", value: "Never counted as spend — they commit nothing" },
        { label: "Tax", value: `Resolved per line through the ${context.org.jurisdiction} rules for each supplier's status` },
      ]} />
      <DataGrid rows={orders} rowId={(row) => row.id} label="Every order and whether it counts" filterable={false}
        columns={[
          { key: "title", header: "Order", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
          { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status}</Pill> },
          { key: "value", header: "Value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
          { key: "counted", header: "In spend", cell: (row) => (["approved", "sent", "received", "closed"].includes(row.status) ? <Pill tone="success">Counted</Pill> : <Pill tone="neutral">Excluded</Pill>) },
        ]} />
    </Stack>
  );
}

export function ReportDesigner({ context, close }: { context: ScreenContext; close: () => void }) {
  const [measure, setMeasure] = useState("Spend by supplier");
  const [period, setPeriod] = useState("Quarter");
  return (
    <form
      id="proc-report"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: `Procurement report · ${measure}`,
          status: "active",
          summary: `Saved report definition over the last ${period.toLowerCase()}.`,
          fields: { kind: "savedReport", measure, period, scope: "PROC" },
        }, `Procurement report ${measure} saved`);
        context.toast("Report saved", "It appears in your saved views for this workspace.");
        close();
      }}
    >
      <Field label="Measure"><Select value={measure} onChange={(event) => setMeasure(event.target.value)}>{["Spend by supplier", "Spend by category", "On-time delivery", "Invoices blocked"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Period"><Select value={period} onChange={(event) => setPeriod(event.target.value)}>{["Month", "Quarter", "Year"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Notice tone="info">Only measures that can be counted from order, receipt and invoice records are offered.</Notice>
    </form>
  );
}

export function SupplierReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProcData();
  const { actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const routed = useRecord(payload?.id ?? context.selectedId);
  const supplier = findSupplier(data, routed?.id) ?? routed ?? data.suppliers[0];
  const [outcome, setOutcome] = useState("keep");
  const [note, setNote] = useState("");
  if (!supplier) return <Empty title="No supplier" />;
  const deliveries = bodyOf<SupplierBody>(supplier, {}).deliveries ?? [];
  return (
    <form
      id="supplier-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!note.trim()) return;
        const ok13 = await context.mutate.patch(supplier.id, {
          status: outcome === "approve" ? "approved" : outcome === "archive" ? "archived" : "review",
          fields: { ...supplier.fields, reviewedBy: actor, reviewNote: note.trim() },
        }, { expectRevision: supplier.revision, event: `${supplier.title} reviewed by ${actor}: ${outcome}` });
        if (!ok13) return; // the platform has already said the record changed elsewhere
        context.toast("Review recorded", `${supplier.title} is now ${outcome === "approve" ? "approved" : outcome === "archive" ? "archived" : "still under review"}.`);
        close();
      }}
    >
      <OverlaySummary eyebrow="Supplier review" title={supplier.title} status={<Pill tone={statusTone(supplier.status)} dot>{supplier.status}</Pill>} />
      <FactGrid columns={4} items={[
        { label: "On time", value: `${String(supplier.fields.onTimeRatePct ?? "—")}%`, mono: true },
        { label: "Late deliveries", value: String(deliveries.filter((delivery) => delivery.lateDays > 0).length), mono: true },
        { label: "Spend to date", value: context.money(Number(supplier.fields.spendToDateMinor ?? 0)), mono: true },
        { label: "Open orders", value: String(data.purchaseOrders.filter((order) => String(order.fields.supplierId) === supplier.id && ["approved", "sent"].includes(order.status)).length), mono: true },
      ]} />
      <Field label="Outcome">
        <Select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="keep">Keep under review</option>
          <option value="approve">Approve</option>
          <option value="archive">Archive — stop using them</option>
        </Select>
      </Field>
      <Field label="Note" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      {outcome === "archive" && data.purchaseOrders.some((order) => String(order.fields.supplierId) === supplier.id && ["approved", "sent"].includes(order.status)) && (
        <Notice tone="danger" title="Open orders remain with this supplier">
          Archiving stops new orders. The ones already issued still have to be received and paid, so they stay visible on the supplier record.
        </Notice>
      )}
    </form>
  );
}
