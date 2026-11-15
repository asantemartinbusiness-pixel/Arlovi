import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileSignature, Plus, Trash2 } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import {
  CUSTOMER_TAX_STATUSES, TAX_CATEGORIES, blankLine, documentDate, documentTotals, readLines, statusFor, writeLines,
} from "@/domain/fin-invoice";
import type { CustomerTaxStatus, DocumentTotals, InvoiceLine, TaxCategory } from "@/domain/fin-invoice";
import { stageOf } from "@/domain/crm-pipeline";
import { contactById, quotesOfDeal, useCrmData } from "./data";
import type { CrmData } from "./data";
import { CapabilityNotice, CapabilityPill, Money, QuoteStatusPill, isExpired } from "./parts";

/* ---------------------------- CRM-008 ---------------------------- *
 * Quotes priced through the same tax engine as an invoice: one resolved code
 * per line from the jurisdiction, the line's category, the customer's tax
 * status and the quote date.
 * ------------------------------------------------------------------ */

export function quoteTotals(data: CrmData, quote: Rec | undefined, jurisdiction: string, now: Date, overrides?: { lines?: InvoiceLine[]; status?: CustomerTaxStatus }): DocumentTotals {
  const customer = contactById(data, String(quote?.fields.contactId ?? ""));
  return documentTotals({
    lines: overrides?.lines ?? readLines(quote),
    jurisdiction,
    customerStatus: overrides?.status ?? statusFor(quote, customer),
    date: documentDate(quote, now),
  });
}

const QUOTE_TABS: Record<string, (quote: Rec, now: Date) => boolean> = {
  Draft: (quote) => quote.status === "draft",
  Review: (quote) => quote.status === "review",
  Sent: (quote, now) => quote.status === "sent" && !isExpired(quote, now),
  Accepted: (quote) => quote.status === "accepted",
  Expired: (quote, now) => isExpired(quote, now) && quote.status !== "accepted",
};

export function QuotesList({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const rows = useMemo(
    () => data.quotes.filter((quote) => (QUOTE_TABS[tab] ?? (() => true))(quote, now)).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [data.quotes, tab, now],
  );
  const total = rows.reduce((sum, quote) => sum + Number(quote.amountMinor ?? 0), 0);
  const needsApproval = rows.filter((quote) => quote.fields.discountApproval);
  const unresolved = rows.filter((quote) => quote.fields.taxUnresolved === true);

  if (rows.length === 0) {
    return (
      <Empty title={`No ${tab.toLowerCase()} quote`} icon={<FileSignature size={20} />}
        action={tab === "Draft" ? <Button variant="primary" onClick={() => context.openOverlay("Quote editor")}>New quote</Button> : undefined}>
        {tab === "Expired" ? "No quote has passed its expiry date unaccepted." : `Quotes appear here once they are ${tab.toLowerCase()}.`}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label={`${tab} quotes`} value={String(rows.length)} meta={`${data.quotes.length} in total`} />
        <Stat label="Value" value={context.money(total)} meta="Net plus resolved tax" />
        <Stat label="Need a discount approval" value={String(needsApproval.length)} meta={needsApproval.length ? "Above the policy ceiling" : "All within policy"} />
        <Stat label="Unresolved tax" value={String(unresolved.length)} meta={unresolved.length ? "Held as UNKNOWN" : "Every line resolves"} />
      </StatRow>

      {unresolved.length > 0 && (
        <Notice tone="danger" title={`${unresolved.length} quote${unresolved.length === 1 ? "" : "s"} contain a line with no approved rate`}>
          {unresolved.map((quote) => quote.title).join(", ")} — the line is held as UNKNOWN rather than quoted at zero tax.
        </Notice>
      )}

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} quotes`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (isExpired(row, now) && row.status !== "accepted" ? "warning" : row.fields.taxUnresolved === true ? "danger" : undefined)}
        columns={[
          { key: "number", header: "Quote", primary: true, width: "130px", cell: (row) => <strong>{String(row.fields.number ?? row.title)}</strong>, sortValue: (row) => String(row.fields.number ?? row.title), filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "version", header: "Version", align: "end", hideBelow: 1200, cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)}</span> },
          { key: "deal", header: "Deal", cell: (row) => {
            const deal = data.deals.find((item) => item.id === String(row.fields.dealId ?? row.parentId ?? ""));
            return deal ? <Link to={`/o/${org.slug}/crm/deals/${deal.id}`} style={{ color: "inherit" }}>{deal.title}</Link> : <span className="ds-subtle">Not linked</span>;
          }, filterValue: (row) => data.deals.find((item) => item.id === String(row.fields.dealId ?? ""))?.title ?? "" },
          { key: "recipient", header: "Recipient", hideBelow: 1200, cell: (row) => contactById(data, String(row.fields.contactId ?? ""))?.title ?? "None" },
          { key: "status", header: "Status", cell: (row) => <QuoteStatusPill status={isExpired(row, now) && row.status !== "accepted" ? "expired" : row.status} />, filterValue: (row) => row.status },
          { key: "expires", header: "Expires", cell: (row) => (
            <span className="ds-num">
              {context.date(row.dueAt)}
              {isExpired(row, now) && row.status !== "accepted" && <Pill tone="danger">Expired</Pill>}
            </span>
          ), sortValue: (row) => row.dueAt ?? "" },
          { key: "discount", header: "Discount", align: "end", hideBelow: 1400, cell: (row) => {
            const totals = quoteTotals(data, row, org.jurisdiction, now);
            return totals.discountMinor ? <Money minor={totals.discountMinor} context={context} /> : <span className="ds-subtle">—</span>;
          } },
          { key: "amount", header: "Total", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("Quote editor", { id }); }}
        bulkActions={[
          {
            label: "Duplicate",
            onRun: async (selected) => {
              for (const quote of selected) {
                const number = `${String(quote.fields.number ?? quote.title)}-copy`;
                await context.mutate.create({
                  collection: "quotes",
                  title: `${number} ${quote.summary.split(".")[0]}`,
                  status: "draft",
                  summary: quote.summary,
                  amountMinor: quote.amountMinor,
                  at: now.toISOString(),
                  dueAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
                  parentId: quote.parentId,
                  fields: { ...quote.fields, number, version: Number(quote.fields.version ?? 1) + 1, copiedFrom: quote.id },
                  body: quote.body,
                }, `Quote ${number} created by duplicating ${quote.title}`);
              }
              context.toast("Duplicated", `${selected.length} new draft${selected.length === 1 ? "" : "s"}. Prices are copied and will be re-resolved for tax at today's date when edited.`);
            },
          },
        ]}
        summary={<Money minor={total} context={context} bold />}
      />

      <Grid>
        <Card span={6} title="Pricing policy" subtitle="What needs an approval">
          <Stack gap={2}>
            <Row gap={2}><Pill tone="neutral">Trade discount</Pill><span className="ds-grow">Up to 10% needs no approval</span></Row>
            <Row gap={2}><Pill tone="warning">Above 10%</Pill><span className="ds-grow">Owner approval, recorded on the quote</span></Row>
            <Row gap={2}><Pill tone="danger">Expired</Pill><span className="ds-grow">Cannot be sent as current; duplicate it to re-price</span></Row>
          </Stack>
        </Card>
        <Card span={6} title="Sending a quote" actions={<CapabilityPill id="email.send" />}>
          <CapabilityNotice id="email.send" />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ------------------------- Quote editor ------------------------- */

export function QuoteEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string; dealId?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const quote = existing?.collection === "quotes" ? existing : undefined;

  const [dealId, setDealId] = useState(String(quote?.fields.dealId ?? payload?.dealId ?? ""));
  const [contactId, setContactId] = useState(String(quote?.fields.contactId ?? ""));
  const [number, setNumber] = useState(String(quote?.fields.number ?? ""));
  const [status, setStatus] = useState<CustomerTaxStatus>("domestic");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [expires, setExpires] = useState((quote?.dueAt ?? new Date(now.getTime() + 30 * 86_400_000).toISOString()).slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (quote) {
      setLines(readLines(quote));
      setStatus(statusFor(quote, contactById(data, String(quote.fields.contactId ?? ""))));
      setNumber(String(quote.fields.number ?? quote.title));
      setContactId(String(quote.fields.contactId ?? ""));
      setDealId(String(quote.fields.dealId ?? quote.parentId ?? ""));
      setDirty(false);
    } else {
      const numbers = data.quotes.map((item) => Number(/(\d+)/.exec(String(item.fields.number ?? item.title))?.[1] ?? 0));
      setNumber((current) => current || `Q-${Math.max(100, ...numbers) + 1}`);
      setLines((current) => (current.length ? current : [blankLine(0)]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id]);

  const deal = data.deals.find((item) => item.id === dealId);
  const customer = contactById(data, contactId);
  const effectiveStatus = customer && !dirty && quote ? statusFor(quote, customer) : status;
  const totals = documentTotals({
    lines,
    jurisdiction: org.jurisdiction,
    customerStatus: effectiveStatus,
    date: quote ? documentDate(quote, now) : now.toISOString().slice(0, 10),
  });
  const discountBpMax = Math.max(0, ...lines.map((line) => line.discountBp ?? 0));
  const overPolicy = discountBpMax > 1_000;
  const expired = quote ? isExpired(quote, now) : false;
  const locked = quote?.status === "accepted";

  function update(id: string, patch: Partial<InvoiceLine>) {
    setDirty(true);
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  return (
    <Stack gap={4}>
      {locked && (
        <Notice tone="warning" title="An accepted quote is not edited">
          {quote?.title} has been accepted. Duplicate it to re-price, which keeps the accepted version on the record.
        </Notice>
      )}
      {expired && !locked && (
        <Notice tone="danger" title="This quote has expired">
          It expired on {context.date(quote?.dueAt)}. It cannot be sent as currently valid. Duplicate it to re-price at today's rates and terms.
        </Notice>
      )}

      <Row gap={3} wrap>
        <Field label="Quote number" required><TextInput value={number} onChange={(event) => { setDirty(true); setNumber(event.target.value); }} disabled={locked} required /></Field>
        <Field label="Deal">
          <Select value={dealId} onChange={(event) => { setDirty(true); setDealId(event.target.value); }} disabled={locked}>
            <option value="">Not linked</option>
            {data.deals.map((item) => <option key={item.id} value={item.id}>{item.title} · {stageOf(item).label}</option>)}
          </Select>
        </Field>
        <Field label="Recipient">
          <Select value={contactId} onChange={(event) => { setDirty(true); setContactId(event.target.value); }} disabled={locked}>
            <option value="">Not set</option>
            {data.contacts.map((item) => <option key={item.id} value={item.id}>{item.title}{item.fields.taxStatus ? ` · ${String(item.fields.taxStatus)}` : " · no tax status"}</option>)}
          </Select>
        </Field>
        <Field label="Expires"><TextInput type="date" value={expires} onChange={(event) => { setDirty(true); setExpires(event.target.value); }} disabled={locked} /></Field>
        <Field label="Customer tax status" hint="Overrides the contact record for this quote.">
          <Select value={effectiveStatus} onChange={(event) => { setDirty(true); setStatus(event.target.value as CustomerTaxStatus); }} disabled={locked}>
            {CUSTOMER_TAX_STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
      </Row>

      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Quote lines</caption>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Description</th>
                <th data-align="end" style={{ width: 86 }}>Qty</th>
                <th data-align="end" style={{ width: 150 }}>Unit price</th>
                <th data-align="end" style={{ width: 92 }}>Disc %</th>
                <th style={{ width: 170 }}>Tax category</th>
                <th style={{ width: 110 }}>Code</th>
                <th data-align="end" style={{ width: 120 }}>Net</th>
                <th data-align="end" style={{ width: 110 }}>Tax</th>
                <th style={{ width: 44 }}><span className="ds-sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((line, index) => (
                <tr key={line.id} data-tone={line.taxCode.code === "UNKNOWN" ? "danger" : undefined}>
                  <td><TextInput aria-label={`Description for line ${index + 1}`} value={line.description} disabled={locked} onChange={(event) => update(line.id, { description: event.target.value })} /></td>
                  <td data-align="end"><TextInput aria-label={`Quantity for line ${index + 1}`} align="end" inputMode="decimal" value={String(line.quantity)} disabled={locked} onChange={(event) => update(line.id, { quantity: Number(event.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td>
                  <td data-align="end"><MoneyInput label={`Unit price for line ${index + 1}`} currency={org.currency} valueMinor={line.unitPriceMinor} disabled={locked} onChangeMinor={(minor) => update(line.id, { unitPriceMinor: minor })} /></td>
                  <td data-align="end"><TextInput aria-label={`Discount percent for line ${index + 1}`} align="end" inputMode="decimal" value={String((line.discountBp ?? 0) / 100)} disabled={locked} onChange={(event) => update(line.id, { discountBp: Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100) })} /></td>
                  <td>
                    <Select aria-label={`Tax category for line ${index + 1}`} value={line.taxCategory} disabled={locked} onChange={(event) => update(line.id, { taxCategory: event.target.value as TaxCategory })}>
                      {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                    </Select>
                  </td>
                  <td><Pill tone={line.taxCode.code === "UNKNOWN" ? "danger" : line.taxCode.rateBp > 0 ? "info" : "warning"} dot>{line.taxCode.code}</Pill></td>
                  <td data-align="end"><Money minor={line.netMinor} context={context} /></td>
                  <td data-align="end"><Money minor={line.taxMinor} context={context} /></td>
                  <td>
                    <Button size="sm" variant="ghost" iconOnly aria-label={`Remove line ${index + 1}`} disabled={locked || totals.lines.length <= 1}
                      onClick={() => { setDirty(true); setLines((current) => current.filter((item) => item.id !== line.id)); }}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={6} style={{ textAlign: "start" }}>Totals</th>
                <td data-align="end"><Money minor={totals.netMinor} context={context} bold /></td>
                <td data-align="end"><Money minor={totals.taxMinor} context={context} bold /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="ds-grid-foot">
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={locked}
            onClick={() => { setDirty(true); setLines((current) => [...current, blankLine(current.length)]); }}>
            Add line
          </Button>
          <span className="ds-row ds-gap-3">
            {totals.discountMinor > 0 && <span className="ds-subtle">Discount {context.money(totals.discountMinor)}</span>}
            <span>Total <Money minor={totals.grossMinor} context={context} bold /></span>
          </span>
        </div>
      </div>

      <Card title="Tax summary by resolved code" subtitle={`${org.jurisdiction} rules · ${CUSTOMER_TAX_STATUSES.find((entry) => entry.value === effectiveStatus)?.label}`}>
        <Stack gap={2}>
          {totals.byCode.map((group) => (
            <Row key={group.code.code} gap={3}>
              <Pill tone={group.code.code === "UNKNOWN" ? "danger" : group.code.rateBp > 0 ? "info" : "warning"} dot>{group.code.code}</Pill>
              <span className="ds-grow">{group.code.label}</span>
              <Money minor={group.netMinor} context={context} />
              <Money minor={group.taxMinor} context={context} bold />
            </Row>
          ))}
          {totals.hasUnknownRate && (
            <Notice tone="danger" title="A line has no approved rate">
              It is held as UNKNOWN. The quote can be saved as a draft but should not be sent until the combination is approved.
            </Notice>
          )}
        </Stack>
      </Card>

      {overPolicy && (
        <Notice tone="warning" title={`A ${(discountBpMax / 100).toFixed(1)}% discount is above the 10% policy ceiling`}>
          Saving records that an owner approval is needed. The quote cannot be marked approved until someone with the Owner view does so.
        </Notice>
      )}

      <Row gap={2} wrap>
        <Button
          variant="primary"
          busy={busy}
          disabled={locked || !dirty || !number.trim() || lines.some((line) => !line.description.trim())}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = {
              number: number.trim(),
              netMinor: totals.netMinor,
              taxMinor: totals.taxMinor,
              customerTaxStatus: effectiveStatus,
              taxUnresolved: totals.hasUnknownRate,
              version: Number(quote?.fields.version ?? 0) + 1,
            };
            if (dealId) fields.dealId = dealId;
            if (contactId) fields.contactId = contactId;
            if (overPolicy) fields.discountApproval = `Needs owner approval: ${(discountBpMax / 100).toFixed(1)}% exceeds the 10% ceiling.`;
            if (quote) {
              await context.mutate.patch(quote.id, {
                title: `${number.trim()} ${quote.summary.split(".")[0]}`,
                amountMinor: totals.grossMinor,
                dueAt: `${expires}T00:00:00.000Z`,
                parentId: dealId || undefined,
                body: { ...(quote.body as object ?? {}), ...writeLines(lines) },
                fields: { ...quote.fields, ...fields },
              }, { expectRevision: quote.revision, event: `Quote ${number.trim()} edited to version ${Number(quote.fields.version ?? 0) + 1}` });
              context.toast("Quote saved", `Version ${Number(quote.fields.version ?? 0) + 1} at ${context.money(totals.grossMinor)} across ${totals.byCode.length} tax ${totals.byCode.length === 1 ? "code" : "codes"}.`);
            } else {
              const created = await context.mutate.create({
                collection: "quotes",
                title: `${number.trim()} ${deal?.title ?? "quote"}`,
                status: "draft",
                summary: deal ? `Quote for ${deal.title}.` : "Quote drafted in this workspace.",
                amountMinor: totals.grossMinor,
                at: now.toISOString(),
                dueAt: `${expires}T00:00:00.000Z`,
                parentId: dealId || undefined,
                fields,
                body: writeLines(lines),
              }, `Quote ${number.trim()} created`);
              if (deal) {
                await context.mutate.patch(deal.id, {
                  fields: { ...deal.fields, quoteId: created.id },
                }, { event: `Quote ${created.title} linked to ${deal.title}` });
              }
              context.toast("Quote created", deal
                ? `${created.title} is linked to ${deal.title}, which can now advance past Proposal.`
                : `${created.title} is a draft.`);
              context.select(created.id);
            }
            setDirty(false);
            setBusy(false);
            close();
          }}
        >
          {quote ? "Save the quote" : "Create the quote"}
        </Button>
        {quote && !locked && (
          <Button
            variant="secondary"
            busy={busy}
            disabled={expired || totals.hasUnknownRate || (overPolicy && !context.can("edit_pipeline"))}
            title={expired ? "An expired quote cannot be sent" : totals.hasUnknownRate ? "A line has no approved tax rate" : undefined}
            onClick={() => context.openOverlay("send preview", { id: quote.id })}
          >
            Send
          </Button>
        )}
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

export function PricingPolicy({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const needing = data.quotes.filter((quote) => quote.fields.discountApproval);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The ceiling is a local control">
        It decides what this interface offers. It is not enforced on a server, so treat it as a working agreement rather than a guarantee.
      </Notice>
      <Properties rows={[
        { label: "Trade discount ceiling", value: "10% without an approval" },
        { label: "Approver", value: "Owner view" },
        { label: "Quotes above the ceiling", value: String(needing.length) },
        { label: "Expired quotes", value: String(data.quotes.filter((quote) => isExpired(quote, now) && quote.status !== "accepted").length) },
      ]} />
      {needing.length > 0 && (
        <Stack gap={3}>
          {needing.map((quote) => {
            const totals = quoteTotals(data, quote, org.jurisdiction, now);
            return (
              <Card key={quote.id} title={quote.title} subtitle={String(quote.fields.discountApproval)}
                actions={<Money minor={quote.amountMinor} context={context} bold />}
                footer={<>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!context.can("edit_pipeline")}
                    onClick={async () => {
                      const fields: Record<string, string | number | boolean> = { ...quote.fields, approvedBy: context.actor };
                      delete fields.discountApproval;
                      await context.mutate.patch(quote.id, { status: "review", fields }, { expectRevision: quote.revision, event: `Discount approved on ${quote.title}` });
                      context.toast("Discount approved", `${quote.title} can be sent. ${context.actor} is recorded as the approver.`);
                    }}
                  >
                    Approve the discount
                  </Button>
                  <span className="ds-grow" />
                  <span className="ds-subtle">Discount given {context.money(totals.discountMinor)}</span>
                </>}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

export function SendPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const quote = data.quotes.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!quote) return <Empty title="Select a quote first" />;

  const customer = contactById(data, String(quote.fields.contactId ?? ""));
  const totals = quoteTotals(data, quote, org.jurisdiction, now);
  const expired = isExpired(quote, now);
  const suppressed = customer?.fields.suppressed === true;
  const to = String(customer?.fields.email ?? "");
  const drafted = body || `Dear ${customer?.title?.split(" ")[0] ?? "customer"},\n\n${String(quote.fields.number ?? quote.title)} comes to ${context.money(totals.grossMinor)} including ${context.money(totals.taxMinor)} tax, and holds until ${context.date(quote.dueAt)}.\n\n${totals.lines.map((line) => `${line.description} — ${context.money(line.grossMinor)}`).join("\n")}\n\nWith thanks,\n${org.name}`;

  const blocked = expired
    ? "This quote has expired, so it cannot be sent as currently valid."
    : suppressed
      ? `${customer?.title} asked not to be contacted. No outreach is drafted for a suppressed contact.`
      : !to
        ? "The contact record has no email address."
        : quote.fields.discountApproval
          ? "The discount is above the policy ceiling and needs an approval first."
          : undefined;

  return (
    <Stack gap={4}>
      <CapabilityNotice id="email.send" title="Nothing will be sent from this workspace" />
      <Properties rows={[
        { label: "To", value: to || "No email on the contact record" },
        { label: "Subject", value: `${org.name} · quote ${String(quote.fields.number ?? quote.title)}` },
        { label: "Total", value: <Money minor={totals.grossMinor} context={context} bold /> },
        { label: "Holds until", value: context.date(quote.dueAt) },
        { label: "Consent", value: suppressed ? "Suppressed" : customer?.fields.consent ? String(customer.fields.consent) : "None recorded" },
      ]} />
      {blocked && <Notice tone="danger" title="This quote cannot be sent">{blocked}</Notice>}
      <Field label="Message"><TextArea value={drafted} rows={10} onChange={(event) => setBody(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked)}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(quote.id, {
              status: "sent",
              body: { ...(quote.body as object ?? {}), sends: [...(((quote.body as { sends?: unknown[] })?.sends) ?? []), { at: new Date().toISOString(), by: context.actor, to, body: drafted }] },
              fields: { ...quote.fields, sentAt: new Date().toISOString(), sentBy: context.actor, delivery: "not_connected" },
            }, { expectRevision: quote.revision, event: `Quote ${quote.title} marked sent with a local draft` });
            await context.mutate.create({
              collection: "activities",
              title: `Quote ${String(quote.fields.number ?? quote.title)} sent`,
              status: "draft",
              summary: `Draft message to ${to}. Delivery is not connected, so it stays in this workspace.`,
              startAt: new Date().toISOString(),
              at: new Date().toISOString(),
              parentId: String(quote.fields.dealId ?? quote.parentId ?? ""),
              fields: { kind: "email", dealId: String(quote.fields.dealId ?? ""), contactId: String(quote.fields.contactId ?? ""), delivery: "not_connected", owner: context.actor },
            }, `Activity logged for quote ${quote.title}`);
            context.toast("Marked sent, kept as a draft", `The message for ${to} is stored on the quote and logged as an activity. No mail provider is connected.`, "info");
            setBusy(false);
            close();
          }}
        >
          Mark sent and keep the draft
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function QuotesStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const expired = data.quotes.filter((quote) => isExpired(quote, now) && quote.status !== "accepted");
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{data.quotes.length} quotes</Pill>
      <span>Open value <Money minor={data.quotes.filter((quote) => ["draft", "review", "sent"].includes(quote.status)).reduce((sum, quote) => sum + Number(quote.amountMinor ?? 0), 0)} context={context} bold /></span>
      <span>Accepted <Money minor={data.quotes.filter((quote) => quote.status === "accepted").reduce((sum, quote) => sum + Number(quote.amountMinor ?? 0), 0)} context={context} bold /></span>
      {expired.length > 0 && <Pill tone="danger" dot>{expired.length} expired</Pill>}
      <span className="ds-grow" />
      <CapabilityPill id="email.send" />
    </Row>
  );
}

export function quoteForDeal(data: CrmData, dealId: string): Rec | undefined {
  return quotesOfDeal(data, dealId)[0];
}
