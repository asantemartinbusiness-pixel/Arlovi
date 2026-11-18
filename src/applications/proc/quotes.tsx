import { useState } from "react";
import { Check, Circle, CircleAlert, CircleDot, Minus, Trash2 } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE } from "@/applications/market/kit";
import { bodyOf, findSupplier, isRequisition, poTotals, statusTone, useProcData, type PoLine } from "./data";
import {
  awardBlock, awardedLines, compareQuotes, purchaseTrail, quoteProblems, type QuoteBody, type QuoteRow, type StepState, type SupplierQuote,
} from "./lifecycle";
import "./proc-lifecycle.css";

/* ====================================================================== *
 * PROC quote comparison on a requisition, and the purchase trail of an
 * order. Quotes are what suppliers told us, typed in here; nothing is sent
 * to or received from a supplier automatically.
 * ====================================================================== */

export function QuoteComparison({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const requisition = useRecord(payload?.id ?? context.selectedId);
  if (!requisition) return <Empty title="Select a requisition" />;
  if (!isRequisition(requisition)) return <Empty title="Not a requisition">Quotes are compared on a requisition, before it becomes an order.</Empty>;
  return <QuoteComparisonBody key={requisition.id} context={context} requisition={requisition} />;
}

function QuoteComparisonBody({ context, requisition }: { context: ScreenContext; requisition: Rec }) {
  const data = useProcData();
  const { org, now, actor } = useWorkspace();
  const today = now.toISOString().slice(0, 10);
  const body = bodyOf<QuoteBody>(requisition, {});
  const lines = body.lines ?? [];
  const quotes = body.quotes ?? [];
  const rows = compareQuotes(lines, quotes, today);
  const awardedId = String(requisition.fields.awardedQuoteId ?? "");
  const supplierName = (id: string) => findSupplier(data, id)?.title ?? "Unknown supplier";
  const grossFor = (row: QuoteRow) => poTotals({ ...requisition, body: { lines: awardedLines(lines, row.quote) } } as Rec, findSupplier(data, row.quote.supplierId), org.jurisdiction).grossMinor;

  const award = async (row: QuoteRow) => {
    const gross = grossFor(row);
    const blocked = awardBlock(requisition, row, gross);
    if (blocked) { context.toast("Cannot award", blocked, "blocked"); return; }
    const saved = await context.mutate.patch(requisition.id, {
      amountMinor: requisition.status === "approved" ? requisition.amountMinor : gross,
      fields: { ...requisition.fields, supplierId: row.quote.supplierId, awardedQuoteId: row.quote.id, awardedBy: actor, awardedAt: now.toISOString(), awardedLeadTimeDays: row.quote.leadTimeDays },
      body: { ...body, lines: awardedLines(lines, row.quote) },
    }, { expectRevision: requisition.revision, event: `${requisition.title}: quote from ${supplierName(row.quote.supplierId)} awarded by ${actor} at ${context.money(row.netMinor)} net` });
    if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Quote awarded", `${supplierName(row.quote.supplierId)} is now the supplier on ${requisition.title} at the quoted prices.${requisition.status === "approved" ? " Convert it to a purchase order when ready." : " It still needs approval before it can become an order."}`);
  };

  const remove = async (quote: SupplierQuote) => {
    if (quote.id === awardedId) { context.toast("Awarded quote", "The awarded quote stays on the record as evidence.", "blocked"); return; }
    const saved = await context.mutate.patch(requisition.id, { body: { ...body, quotes: quotes.filter((item) => item.id !== quote.id) } }, { expectRevision: requisition.revision, event: `${requisition.title}: quote from ${supplierName(quote.supplierId)} removed by ${actor}` });
    if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Quote removed", `${supplierName(quote.supplierId)}'s quote is no longer compared.`);
  };

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Requisition", value: <span className="ds-num">{requisition.title}</span> },
        { label: "State", value: <Pill tone={statusTone(requisition.status)} dot>{requisition.status.replace(/_/g, " ")}</Pill> },
        { label: "Approved amount", value: requisition.status === "approved" ? <span className="ds-num">{context.money(requisition.amountMinor)}</span> : <span className="ds-subtle">Not approved yet</span> },
        { label: "Lines", value: <span className="ds-num">{lines.length}</span> },
      ]} />
      {rows.length === 0 ? (
        <Empty title="No quotes recorded">Record what each supplier quoted below. Two or more quotes make a comparison.</Empty>
      ) : (
        <DataGrid rows={rows} rowId={(row) => row.quote.id} label="Quote comparison" filterable={false}
          rowTone={(row) => (row.expired || !row.complete ? "warning" : undefined)}
          columns={[
            { key: "supplier", header: "Supplier", primary: true, cell: (row) => (
              <Stack gap={1}>
                <strong>{supplierName(row.quote.supplierId)}</strong>
                <Row gap={1} wrap>
                  {row.quote.id === awardedId && <Pill tone="success" dot>Awarded</Pill>}
                  {row.lowest && <Pill tone="accent">Lowest</Pill>}
                  {row.fastest && <Pill tone="info">Fastest</Pill>}
                  {row.expired && <Pill tone="warning">Expired</Pill>}
                  {!row.complete && <Pill tone="warning">Missing {row.missing.length}</Pill>}
                </Row>
              </Stack>
            ) },
            ...lines.map((line) => ({
              key: `line-${line.id}`, header: `${line.description} ×${line.quantity}`, align: "end" as const,
              cell: (row: QuoteRow) => (row.quote.prices[line.id] === undefined ? <span className="ds-subtle">—</span> : <span className="ds-num">{context.money(row.quote.prices[line.id])}</span>),
            })),
            { key: "net", header: "Net total", align: "end", cell: (row) => <strong className="ds-num">{context.money(row.netMinor)}</strong>, sortValue: (row) => row.netMinor },
            { key: "over", header: "vs lowest", align: "end", cell: (row) => (row.complete && row.overLowestMinor > 0 ? <span className="ds-num">+{context.money(row.overLowestMinor)}</span> : <span className="ds-subtle">—</span>) },
            { key: "lead", header: "Lead time", align: "end", cell: (row) => <span className="ds-num">{row.quote.leadTimeDays}d</span>, sortValue: (row) => row.quote.leadTimeDays },
            { key: "valid", header: "Valid until", cell: (row) => <span className="ds-num">{row.quote.validUntil}</span> },
            { key: "do", header: "", cell: (row) => (
              <Row gap={1}>
                <Button size="sm" variant={row.lowest ? "primary" : "secondary"} disabled={row.quote.id === awardedId} aria-label={`Award ${supplierName(row.quote.supplierId)}`} onClick={() => award(row)}>{row.quote.id === awardedId ? "Awarded" : "Award"}</Button>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${supplierName(row.quote.supplierId)} quote`} onClick={() => remove(row.quote)}><Trash2 size={14} /></Button>
              </Row>
            ) },
          ]} />
      )}
      {requisition.status === "converted" ? (
        <Notice tone="info" title="Already an order">Quotes stay here as evidence for why this supplier was chosen.</Notice>
      ) : (
        <RecordQuote context={context} requisition={requisition} lines={lines} quotes={quotes} body={body} />
      )}
      <Notice tone="info">Quotes are typed in from what suppliers sent. No request or award is sent to a supplier from here.</Notice>
    </Stack>
  );
}

function RecordQuote({ context, requisition, lines, quotes, body }: { context: ScreenContext; requisition: Rec; lines: PoLine[]; quotes: SupplierQuote[]; body: QuoteBody }) {
  const data = useProcData();
  const { now, actor } = useWorkspace();
  const today = now.toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lead, setLead] = useState("14");
  const [validUntil, setValidUntil] = useState(new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [touched, setTouched] = useState(false);
  const problems = quoteProblems({ supplierId, prices, lines, leadTimeDays: lead, validUntil, today, existing: quotes });
  const suppliers = data.suppliers.filter((supplier) => supplier.status !== "archived");

  return (
    <Card eyebrow="RECORD A QUOTE" prov="human" title="What a supplier quoted" subtitle="Unit prices per line, before tax">
      <form id="record-quote" className="ds-stack ds-gap-3" onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (problems.length) return;
        const quote: SupplierQuote = {
          id: `q-${wallMs()}`, supplierId, leadTimeDays: Number(lead), validUntil, note: "", recordedBy: actor, at: now.toISOString(),
          prices: Object.fromEntries(lines.filter((line) => (prices[line.id] ?? "").trim() !== "").map((line) => [line.id, Math.round(Number(prices[line.id]) * 100)])),
        };
        const saved = await context.mutate.patch(requisition.id, { body: { ...body, quotes: [...quotes, quote] } }, { expectRevision: requisition.revision, event: `${requisition.title}: quote recorded from ${findSupplier(data, supplierId)?.title ?? supplierId} by ${actor}` });
        if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
        context.toast("Quote recorded", `${findSupplier(data, supplierId)?.title} is now in the comparison.`);
        setSupplierId(""); setPrices({}); setTouched(false);
      }}>
        <Field label="Supplier" required>
          <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Choose a supplier</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id} disabled={quotes.some((quote) => quote.supplierId === supplier.id)}>{supplier.title}</option>)}
          </Select>
        </Field>
        <div className="t4-quote-lines">
          {lines.map((line) => (
            <Field key={line.id} label={`${line.description} · unit price`} hint={`× ${line.quantity}`}>
              <TextInput inputMode="decimal" align="end" value={prices[line.id] ?? ""} placeholder="0.00" onChange={(event) => setPrices({ ...prices, [line.id]: event.target.value })} />
            </Field>
          ))}
        </div>
        <Row gap={3} wrap>
          <Field label="Lead time in days" required><TextInput inputMode="numeric" align="end" value={lead} onChange={(event) => setLead(event.target.value)} /></Field>
          <Field label="Valid until" required><TextInput type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
        </Row>
        {touched && problems.length > 0 && <Notice tone="danger" title="Check the quote">{problems.join(" ")}</Notice>}
        <Row gap={2}><span className="ds-grow" /><Button type="submit" variant="secondary">Add to comparison</Button></Row>
      </form>
    </Card>
  );
}

/* ---------------- Purchase trail ---------------- */

const STEP_ICON: Record<StepState, typeof Check> = { done: Check, partial: CircleDot, blocked: CircleAlert, pending: Circle, skipped: Minus };
const STEP_TONE: Record<StepState, "success" | "warning" | "danger" | "neutral"> = { done: "success", partial: "warning", blocked: "danger", pending: "neutral", skipped: "neutral" };
const STEP_LABEL: Record<StepState, string> = { done: "Done", partial: "Partly", blocked: "Blocked", pending: "Waiting", skipped: "Not used" };

export function PurchaseTrail({ context }: { context: ScreenContext }) {
  const data = useProcData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const order = useRecord(payload?.id ?? context.selectedId);
  if (!order) return <Empty title="Select a purchase order" />;
  const steps = purchaseTrail(order, data.purchaseOrders, data.receipts, data.bills);
  const supplier = findSupplier(data, String(order.fields.supplierId));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Order", value: <span className="ds-num">{order.title}</span> },
        { label: "Supplier", value: supplier?.title ?? "—" },
        { label: "Value", value: <span className="ds-num">{context.money(order.amountMinor)}</span> },
      ]} />
      <ol className="t4-trail" aria-label="Purchase trail">
        {steps.map((step) => {
          const Icon = STEP_ICON[step.state];
          return (
            <li key={step.key} className="t4-trail-step" data-state={step.state}>
              <span className="t4-trail-icon" aria-hidden="true"><Icon size={14} /></span>
              <div className="ds-grow">
                <Row gap={2} wrap><strong>{step.label}</strong><Pill tone={STEP_TONE[step.state]}>{STEP_LABEL[step.state]}</Pill></Row>
                <p className="ds-subtle">{step.detail}</p>
                {step.key === "match" && step.recordIds.map((id) => (
                  <Button key={id} size="sm" variant="ghost" onClick={() => context.openOverlay("three-way match", { id })}>Open the match for {data.bills.find((bill) => bill.id === id)?.title}</Button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {(["sent", "approved"].includes(order.status)) && steps[3].state !== "done" && (
        <Button variant="secondary" onClick={() => context.openOverlay("receive", { id: order.id })}>Receive goods against {order.title}</Button>
      )}
    </Stack>
  );
}
