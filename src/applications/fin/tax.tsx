import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  Button, Card, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, ModalActions, ModalInFlight, ModalUnsavedChanges, Notice, OverlayActions, OverlayCancel, OverlaySummary, Pill, Row, Select, Stack, Stat, StatRow, TextArea,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useEvents, useWorkspace } from "@/platform/workspace";
import { TAX_RULES, taxCodesFor } from "@/platform/money";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  CUSTOMER_TAX_STATUSES, TAX_CATEGORIES, buildReturn, documentDate, readLines, resolveTaxCode, statusFor, totalsFor,
} from "@/domain/fin-invoice";
import type { CustomerTaxStatus, ReturnBoxes, TaxCategory } from "@/domain/fin-invoice";
import { periodLabel } from "@/domain/fin-ledger";
import { contactOf, useFinData } from "./data";
import { FormFooter, Amount, CapabilityNotice, CapabilityPill, SourceNote, StatementRow, TaxCodePill, taxRateText } from "./parts";
import { clockIso } from "@/platform/clock";

/* ---------------------------- FIN-011 ---------------------------- */

export function TaxCodesTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const engineCodes = taxCodesFor(org.jurisdiction);
  const [category, setCategory] = useState<TaxCategory>("standard");
  const [status, setStatus] = useState<CustomerTaxStatus>("domestic");
  const [date, setDate] = useState(context.now.toISOString().slice(0, 10));

  const resolved = resolveTaxCode({ jurisdiction: org.jurisdiction, category, customerStatus: status, date });

  /** Where a stored tax-code record disagrees with the engine. */
  const drift = useMemo(() => data.taxCodes
    .filter((record) => String(record.fields.jurisdiction ?? "") === org.jurisdiction)
    .map((record) => {
      const code = String(record.fields.code ?? "");
      const engine = engineCodes.find((item) => item.code === code);
      const recorded = Number(record.fields.rateBp ?? 0);
      return {
        record,
        code,
        recorded,
        engineRateBp: engine?.rateBp,
        drifted: engine ? engine.rateBp !== recorded : true,
        reason: !engine ? "No rule in the engine resolves to this code." : engine.rateBp !== recorded ? `The engine applies ${engine.rateBp / 100}% here.` : undefined,
      };
    }), [data.taxCodes, engineCodes, org.jurisdiction]);

  const drifted = drift.filter((item) => item.drifted && item.record.status === "active");

  return (
    <Stack gap={4}>
      <Notice tone="info" title="The engine is the source of truth, not these records">
        Every figure on an invoice is resolved by the rules below from the jurisdiction, the line's category, the customer's status and the date. A stored code record is reference material, and the check beneath it flags where the two disagree.
      </Notice>

      {drifted.length > 0 && (
        <Notice tone="danger" title={`${drifted.length} active code record${drifted.length === 1 ? "" : "s"} disagree${drifted.length === 1 ? "s" : ""} with the engine`}>
          {drifted.map((item) => `${item.record.title} (${item.code}): ${item.reason}`).join(" ")}
        </Notice>
      )}

      <Grid>
        <Card eyebrow="TAX ENGINE" span={7} title={`Rules for ${org.jurisdiction}`} subtitle={`${TAX_RULES.filter((rule) => rule.jurisdiction === org.jurisdiction).length} approved combinations`} flush>
          <DataGrid
            rows={TAX_RULES.filter((rule) => rule.jurisdiction === org.jurisdiction)}
            rowId={(row) => `${row.category}-${row.code.code}-${row.customerStatus.join("")}`}
            label="Approved tax rules"
            columns={[
              { key: "category", header: "Line category", primary: true, cell: (row) => TAX_CATEGORIES.find((entry) => entry.value === row.category)?.label ?? row.category, filterValue: (row) => row.category },
              { key: "customer", header: "Customer status", cell: (row) => row.customerStatus.map((item) => CUSTOMER_TAX_STATUSES.find((entry) => entry.value === item)?.label ?? item).join(", "), filterValue: (row) => row.customerStatus.join(" ") },
              { key: "from", header: "In force from", cell: (row) => <span className="ds-num">{row.from}</span>, sortValue: (row) => row.from },
              { key: "code", header: "Code", cell: (row) => <TaxCodePill code={row.code} /> },
              { key: "rate", header: "Rate", align: "end", cell: (row) => <span className="ds-num">{taxRateText(row.code, org.locale)}</span> },
              { key: "reportable", header: "On the return", cell: (row) => row.code.reportable ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">No</Pill> },
            ]}
          />
        </Card>

        <Card eyebrow="RESOLVER" span={5} title="Resolve a combination" subtitle="The same function the invoice editor calls">
          <Stack gap={3}>
            <Field label="Line category">
              <Select aria-label="Line category" value={category} onChange={(event) => setCategory(event.target.value as TaxCategory)}>
                {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </Select>
            </Field>
            <Field label="Customer tax status">
              <Select aria-label="Customer tax status" value={status} onChange={(event) => setStatus(event.target.value as CustomerTaxStatus)}>
                {CUSTOMER_TAX_STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </Select>
            </Field>
            <Field label="Transaction date" hint="A rule only applies from the date it came into force.">
              <input aria-label="Transaction date" className="ds-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <div className="ds-panel" style={{ padding: "var(--space-4)" }}>
              <Row gap={2}>
                <TaxCodePill code={resolved} />
                <span className="ds-grow">{resolved.label}</span>
                <strong className="ds-num">{taxRateText(resolved, org.locale)}</strong>
              </Row>
              <p className="ds-subtle" style={{ marginBlockStart: "var(--space-2)" }}>
                {resolved.note ?? (resolved.reportable ? "Reported on the return." : "Not part of the taxable base.")}
              </p>
              {resolved.code === "UNKNOWN" && (
                <Notice tone="danger" title="Nothing approved covers this combination">
                  It resolves to UNKNOWN, not to zero. A document with an unresolved line cannot be issued.
                </Notice>
              )}
            </div>
            <SourceNote>Jurisdiction comes from the organisation profile ({org.jurisdiction}), never from the currency ({org.currency}).</SourceNote>
          </Stack>
        </Card>

        <Card prov="posted" span={12} title="Stored code records" subtitle="Reference records in this workspace, checked against the engine" flush>
          <DataGrid
            rows={drift}
            rowId={(row) => row.record.id}
            label="Stored tax code records"
            rowTone={(row) => (row.drifted && row.record.status === "active" ? "danger" : undefined)}
            columns={[
              { key: "title", header: "Record", primary: true, cell: (row) => row.record.title, filterValue: (row) => row.record.title },
              { key: "code", header: "Code", cell: (row) => <span className="ds-num">{row.code}</span> },
              { key: "recorded", header: "Recorded rate", align: "end", cell: (row) => <span className="ds-num">{(row.recorded / 100).toFixed(2)}%</span> },
              { key: "engine", header: "Engine rate", align: "end", cell: (row) => <span className="ds-num">{row.engineRateBp === undefined ? "No rule" : `${(row.engineRateBp / 100).toFixed(2)}%`}</span> },
              { key: "status", header: "Record status", cell: (row) => <Pill tone={row.record.status === "active" ? "success" : "neutral"}>{row.record.status}</Pill> },
              { key: "check", header: "Check", cell: (row) => row.drifted
                ? <Pill tone={row.record.status === "active" ? "danger" : "warning"}>{row.reason}</Pill>
                : <Pill tone="success" dot>Agrees</Pill> },
            ]}
          />
        </Card>
      </Grid>
    </Stack>
  );
}

export function periodsWithDocuments(invoices: Rec[]): string[] {
  const set = new Set<string>();
  for (const invoice of invoices) {
    if (["draft", "void"].includes(invoice.status)) continue;
    set.add((invoice.at ?? invoice.createdAt).slice(0, 7));
  }
  return [...set].sort().reverse();
}

export function TaxPeriodsTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const periods = periodsWithDocuments(data.invoices);

  if (periods.length === 0) return <Empty title="No issued document in any period">A draft is never on a return.</Empty>;

  const rows = periods.map((period) => ({
    period,
    boxes: buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now }),
    locked: data.locked.includes(period),
    filed: data.taxCodes.some((record) => record.fields.kind === "return" && String(record.fields.period ?? "") === period),
  }));

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Periods with activity" value={String(periods.length)} />
        <Stat prov="posted" label="Output tax to date" value={context.money(rows.reduce((sum, row) => sum + row.boxes.outputTaxMinor, 0))} meta="Across every period" />
        <Stat prov="human" label="Input tax to date" value={context.money(rows.reduce((sum, row) => sum + row.boxes.inputTaxMinor, 0))} meta="From recorded bills" />
        <Stat prov="posted" label="Documents with no rate" value={String(rows.reduce((sum, row) => sum + row.boxes.unknownDocumentIds.length, 0))} meta="Held as UNKNOWN" />
      </StatRow>
      <DataGrid
        rows={rows}
        rowId={(row) => row.period}
        label="Tax periods"
        columns={[
          { key: "period", header: "Period", primary: true, cell: (row) => periodLabel(row.period, org.locale), sortValue: (row) => row.period },
          { key: "net", header: "Taxable net", align: "end", cell: (row) => <Amount minor={row.boxes.outputNetMinor} context={context} /> },
          { key: "output", header: "Output tax", align: "end", cell: (row) => <Amount minor={row.boxes.outputTaxMinor} context={context} /> },
          { key: "input", header: "Input tax", align: "end", cell: (row) => <Amount minor={row.boxes.inputTaxMinor} context={context} /> },
          { key: "payable", header: "Payable", align: "end", cell: (row) => <Amount minor={row.boxes.payableMinor} context={context} bold /> },
          { key: "exempt", header: "Exempt net", align: "end", hideBelow: 1200, cell: (row) => <Amount minor={row.boxes.exemptNetMinor} context={context} /> },
          { key: "unknown", header: "Unresolved", align: "end", cell: (row) => row.boxes.unknownDocumentIds.length
            ? <Pill tone="danger">{row.boxes.unknownDocumentIds.length}</Pill>
            : <span className="ds-subtle">—</span> },
          { key: "ledger", header: "Ledger period", cell: (row) => row.locked ? <Pill tone="warning" dot>Closed</Pill> : <Pill tone="success" dot>Open</Pill> },
        ]}
        onOpen={(id) => context.openOverlay("return review", { period: id })}
      />
      <Notice tone="info" title="A tax period and a ledger period are different things">
        Closing a ledger month stops new postings. It does not file anything, and nothing here has been submitted to a tax authority.
      </Notice>
    </Stack>
  );
}

export function ReturnsTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const periods = periodsWithDocuments(data.invoices);
  const [period, setPeriod] = useState(periods[0] ?? data.currentPeriod);
  const boxes = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });

  return (
    <Stack gap={4}>
      <CapabilityNotice id="tax.file" title="This return cannot be filed from here" />
      <Row gap={3} wrap>
        <Field label="Period">
          <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
          </Select>
        </Field>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={() => exportReturn(context, boxes, org.jurisdiction)}>Export the figures</Button>
        <Button variant="primary" onClick={() => context.openOverlay("filing authorization", { period })}>Review before filing</Button>
      </Row>

      <Grid>
        <Card prov="posted" span={6} title={`The return this workspace would file for ${periodLabel(period, org.locale)}`} subtitle={`${org.jurisdiction} rules`}>
          <StatementRow
            context={context}
            rows={[
              { label: "Taxable sales, net", minor: boxes.outputNetMinor, note: "Lines whose code is reported on the return" },
              { label: "Tax charged on sales", minor: boxes.outputTaxMinor, bold: true },
              { label: "Purchases, net", minor: boxes.inputNetMinor, note: "From bills with a recorded tax amount" },
              { label: "Tax reclaimed on purchases", minor: boxes.inputTaxMinor, bold: true },
              { label: "Net payable", minor: boxes.payableMinor, bold: true },
              { label: "Zero-rated sales, net", minor: boxes.zeroRatedNetMinor, note: "Taxable at 0%, still on the return" },
              { label: "Exempt sales, net", minor: boxes.exemptNetMinor, note: "Outside the taxable base, not zero-rated" },
            ]}
          />
        </Card>

        <Card prov="posted" span={6} title="Resolved codes in the period" subtitle="Grouped by the code the engine produced">
          {boxes.outputs.length === 0 ? <span className="ds-subtle">Nothing was issued in this period.</span> : (
            <div className="ds-grid-scroll">
              <table className="ds-table">
                <caption className="ds-sr-only">Tax by resolved code</caption>
                <thead><tr><th>Code</th><th>Treatment</th><th data-align="end">Net</th><th data-align="end">Tax</th><th data-align="end">Documents</th></tr></thead>
                <tbody>
                  {boxes.outputs.map((group) => (
                    <tr key={group.code.code} data-tone={group.code.code === "UNKNOWN" ? "danger" : undefined}>
                      <td><TaxCodePill code={group.code} /></td>
                      <td>
                        {group.code.label}
                        <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>
                          {group.code.reportable ? "Reported on the return" : "Not in the taxable base"}
                        </span>
                      </td>
                      <td data-align="end"><Amount minor={group.netMinor} context={context} /></td>
                      <td data-align="end"><Amount minor={group.taxMinor} context={context} bold /></td>
                      <td data-align="end"><span className="ds-num">{new Set(group.documentIds).size}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {(boxes.unknownDocumentIds.length > 0 || boxes.missingStatusDocumentIds.length > 0) && (
          <div className="ds-col-12">
            <Notice tone="danger" title="This return is not complete">
              <Stack gap={2}>
                {boxes.unknownDocumentIds.length > 0 && (
                  <span>
                    {boxes.unknownDocumentIds.length} document{boxes.unknownDocumentIds.length === 1 ? "" : "s"} contain a line with no approved rate:
                    {" "}{boxes.unknownDocumentIds.map((id) => data.invoices.find((invoice) => invoice.id === id)?.title ?? id).join(", ")}.
                    Their value is excluded from the boxes above rather than counted at zero.
                  </span>
                )}
                {boxes.missingStatusDocumentIds.length > 0 && (
                  <span>
                    {boxes.missingStatusDocumentIds.length} document{boxes.missingStatusDocumentIds.length === 1 ? " has" : "s have"} a customer with no tax status:
                    {" "}{boxes.missingStatusDocumentIds.map((id) => data.invoices.find((invoice) => invoice.id === id)?.title ?? id).join(", ")}.
                  </span>
                )}
              </Stack>
            </Notice>
          </div>
        )}

        <Card prov="posted" span={12} title="Documents behind the figures" subtitle="Every invoice counted in this period" flush>
          <DocumentsInPeriod context={context} period={period} />
        </Card>
      </Grid>
    </Stack>
  );
}

function DocumentsInPeriod({ context, period }: { context: ScreenContext; period: string }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const rows = data.invoices.filter((invoice) =>
    !["draft", "void"].includes(invoice.status) && (invoice.at ?? invoice.createdAt).slice(0, 7) === period);
  if (rows.length === 0) return <div className="ds-card-body"><span className="ds-subtle">Nothing issued in this period.</span></div>;
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Documents in the period"
      columns={[
        { key: "number", header: "Invoice", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "customer", header: "Customer", cell: (row) => contactOf(data, row)?.title ?? "Not linked" },
        { key: "status", header: "Customer status", cell: (row) => {
          const status = statusFor(row, contactOf(data, row));
          return <Pill tone={status === "unknown" ? "danger" : "neutral"}>{CUSTOMER_TAX_STATUSES.find((entry) => entry.value === status)?.label ?? status}</Pill>;
        } },
        { key: "codes", header: "Resolved codes", cell: (row) => {
          const totals = totalsFor({ record: row, customer: contactOf(data, row), jurisdiction: org.jurisdiction, now: context.now });
          return <Row gap={1} wrap>{totals.byCode.map((group) => <TaxCodePill key={group.code.code} code={group.code} />)}</Row>;
        } },
        { key: "net", header: "Net", align: "end", cell: (row) => <Amount minor={Number(row.fields.netMinor ?? 0)} context={context} /> },
        { key: "tax", header: "Tax", align: "end", cell: (row) => <Amount minor={Number(row.fields.taxMinor ?? 0)} context={context} bold /> },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
    />
  );
}

export function TaxAuditTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const events = useEvents(undefined, 200).filter((event) => /tax|invoice|return|code/i.test(event.message));

  const perLine = useMemo(() => {
    const out: { id: string; invoice: Rec; description: string; category: TaxCategory; status: CustomerTaxStatus; code: string; rate: string; netMinor: number; taxMinor: number }[] = [];
    for (const invoice of data.invoices) {
      if (invoice.status === "void") continue;
      const customer = contactOf(data, invoice);
      const status = statusFor(invoice, customer);
      const date = documentDate(invoice, context.now);
      for (const line of readLines(invoice)) {
        const code = resolveTaxCode({ jurisdiction: org.jurisdiction, category: line.taxCategory, customerStatus: status, date });
        const gross = Math.round(line.quantity * line.unitPriceMinor);
        const net = Math.round(gross * (1 - (line.discountBp ?? 0) / 10_000));
        out.push({
          id: `${invoice.id}-${line.id}`,
          invoice,
          description: line.description,
          category: line.taxCategory,
          status,
          code: code.code,
          rate: taxRateText(code, org.locale),
          netMinor: net,
          taxMinor: Math.round((net * code.rateBp) / 10_000),
        });
      }
    }
    return out;
  }, [data.invoices, data, org, context.now]);

  const unknown = perLine.filter((row) => row.code === "UNKNOWN");

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Lines resolved" value={String(perLine.length)} meta="Across every live document" />
        <Stat prov="posted" label="Distinct codes used" value={String(new Set(perLine.map((row) => row.code)).size)} />
        <Stat prov="human" label="Unresolved lines" value={String(unknown.length)} meta={unknown.length ? "Each one is listed below" : "Every line has an approved rate"} />
        <Stat label="Filing" value="Not connected" unavailable meta="No tax authority connection exists" />
      </StatRow>
      {unknown.length > 0 && (
        <Notice tone="danger" title={`${unknown.length} line${unknown.length === 1 ? "" : "s"} resolve to UNKNOWN`}>
          {unknown.map((row) => `${row.invoice.title}: ${row.description} (${row.category}, ${row.status})`).join("; ")}
        </Notice>
      )}
      <Card prov="posted" title="Every line and the code it resolved to" subtitle="The audit a reviewer would ask for" flush>
        <DataGrid
          rows={perLine}
          rowId={(row) => row.id}
          label="Line by line tax resolution"
          rowTone={(row) => (row.code === "UNKNOWN" ? "danger" : undefined)}
          columns={[
            { key: "document", header: "Document", cell: (row) => row.invoice.title, filterValue: (row) => row.invoice.title, sortValue: (row) => row.invoice.title },
            { key: "line", header: "Line", primary: true, cell: (row) => row.description, filterValue: (row) => row.description },
            { key: "category", header: "Category", cell: (row) => TAX_CATEGORIES.find((entry) => entry.value === row.category)?.label ?? row.category, filterValue: (row) => row.category },
            { key: "status", header: "Customer", cell: (row) => CUSTOMER_TAX_STATUSES.find((entry) => entry.value === row.status)?.label ?? row.status, filterValue: (row) => row.status },
            { key: "code", header: "Code", cell: (row) => <span className="ds-num">{row.code}</span>, filterValue: (row) => row.code },
            { key: "rate", header: "Rate", align: "end", cell: (row) => <span className="ds-num">{row.code === "UNKNOWN" ? "—" : row.rate}</span> },
            { key: "net", header: "Net", align: "end", cell: (row) => <Amount minor={row.netMinor} context={context} /> },
            { key: "tax", header: "Tax", align: "end", cell: (row) => <Amount minor={row.taxMinor} context={context} /> },
          ]}
          onOpen={(id) => {
            const row = perLine.find((item) => item.id === id);
            if (row) context.navigate(`/o/${org.slug}/fin/invoices/${row.invoice.id}`);
          }}
        />
      </Card>
      <Card prov="posted" title="Recorded events" subtitle={`${events.length} tax-related entries in this browser`}>
        {events.length === 0 ? <span className="ds-subtle">Nothing recorded yet.</span> : (
          <Stack gap={2}>
            {events.slice(0, 12).map((event) => (
              <Row key={event.id} gap={3}>
                <span className="ds-num ds-subtle" style={{ width: 150 }}>{context.dateTime(event.at)}</span>
                <span className="ds-grow">{event.message}</span>
                <span className="ds-subtle">{event.actor}</span>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}

function exportReturn(context: ScreenContext, boxes: ReturnBoxes, jurisdiction: string): void {
  const rows = [
    ["period", boxes.period],
    ["jurisdiction", jurisdiction],
    ["taxable_sales_net_minor", String(boxes.outputNetMinor)],
    ["tax_on_sales_minor", String(boxes.outputTaxMinor)],
    ["purchases_net_minor", String(boxes.inputNetMinor)],
    ["tax_on_purchases_minor", String(boxes.inputTaxMinor)],
    ["net_payable_minor", String(boxes.payableMinor)],
    ["zero_rated_net_minor", String(boxes.zeroRatedNetMinor)],
    ["exempt_net_minor", String(boxes.exemptNetMinor)],
    ["documents_with_unresolved_rate", String(boxes.unknownDocumentIds.length)],
  ];
  downloadFile(`${context.org.slug}-return-${boxes.period}.csv`, `box,value\n${rows.map((row) => row.join(",")).join("\n")}`, "text/csv");
  context.toast("Exported", `The figures for ${boxes.period} are in a CSV file in this browser. Nothing was submitted.`);
}

export { exportReturn };

/* --------------------------- Overlays --------------------------- */

export function TaxConfiguration({ context }: { context: ScreenContext; close?: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const engineCodes = taxCodesFor(org.jurisdiction);
  const [busy, setBusy] = useState(false);

  const stale = data.taxCodes.filter((record) => {
    if (String(record.fields.jurisdiction ?? "") !== org.jurisdiction) return false;
    const engine = engineCodes.find((item) => item.code === String(record.fields.code ?? ""));
    return record.status === "active" && engine && engine.rateBp !== Number(record.fields.rateBp ?? 0);
  });

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Rates are not configurable here, by design">
        A rate comes from the approved rule set in the tax engine, keyed on jurisdiction, line category, customer status and date. If a stored record disagrees, the record is wrong, not the engine.
      </Notice>
      <FactGrid columns={3} items={[
        { label: "Jurisdiction", value: org.jurisdiction, mono: true },
        { label: "Approved rules", value: String(TAX_RULES.filter((rule) => rule.jurisdiction === org.jurisdiction).length), mono: true },
        { label: "Stored records that disagree", value: String(stale.length), mono: true, tone: stale.length ? "warning" : "success" },
        { label: "Codes in use", value: engineCodes.map((code) => code.code).join(", "), mono: true, hint: `Reporting currency ${org.currency} has no bearing on the rate` },
      ]} />
      {stale.length > 0 && (
        <Stack gap={3}>
          {stale.map((record) => {
            const engine = engineCodes.find((item) => item.code === String(record.fields.code ?? ""));
            return (
              <Row key={record.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow">
                  <strong>{record.title}</strong>
                  <p className="ds-subtle">Records {(Number(record.fields.rateBp ?? 0) / 100).toFixed(2)}%, the engine applies {((engine?.rateBp ?? 0) / 100).toFixed(2)}%.</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const saved18 = await context.mutate.patch(record.id, {
                        status: "superseded",
                        fields: { ...record.fields, supersededBy: "tax engine", supersededAt: clockIso() },
                      }, { expectRevision: record.revision, event: `Tax code record ${record.title} marked superseded` });
                      if (!saved18) return;
                      context.toast("Marked superseded", `${record.title} no longer claims to be current. No computed figure changed, because the engine was always the source.`);
                    } catch (error) {
                      context.toast("Not marked", error instanceof Error ? error.message : "The record changed. Reopen and retry.", "failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Mark superseded
                </Button>
              </Row>
            );
          })}
        </Stack>
      )}
      <DrawerActions>
        <OverlayActions primary={<OverlayCancel>Close</OverlayCancel>} />
      </DrawerActions>
    </Stack>
  );
}

export function ReturnReview({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { period?: string } | undefined;
  const period = payload?.period ?? data.currentPeriod;
  const boxes = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });

  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Return review"
        title={periodLabel(period, org.locale)}
        status={boxes.unknownDocumentIds.length > 0 ? <Pill tone="danger" dot>Validation failed</Pill> : <Pill tone="success" dot>Validation passed</Pill>}
        meta={[org.jurisdiction, <span className="ds-num" key="p">Computed {context.dateTime(context.now)}</span>, <CapabilityPill key="f" id="tax.file" />]}
      />
      {boxes.unknownDocumentIds.length > 0 ? (
        <Notice tone="danger" title="Validation failed">
          {boxes.unknownDocumentIds.length} document{boxes.unknownDocumentIds.length === 1 ? " has" : "s have"} a line with no approved rate. The return cannot be prepared as final while that is true.
        </Notice>
      ) : (
        <Notice tone="success" title="Validation passed">Every line in the period resolved to an approved code.</Notice>
      )}
      <FactGrid columns={4} items={[
        { label: "Taxable sales, net", value: context.money(boxes.outputNetMinor), mono: true },
        { label: "Tax on sales", value: context.money(boxes.outputTaxMinor), mono: true },
        { label: "Tax on purchases", value: context.money(boxes.inputTaxMinor), mono: true },
        { label: "Net payable", value: context.money(boxes.payableMinor), mono: true, tone: "accent" },
      ]} />
      <FormFooter>
        <Button variant="secondary" onClick={() => exportReturn(context, boxes, org.jurisdiction)}>Export the figures</Button>
      </FormFooter>
    </Stack>
  );
}

export function FilingAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { period?: string } | undefined;
  const period = payload?.period ?? data.currentPeriod;
  const boxes = buildReturn({ period, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = boxes.unknownDocumentIds.length > 0
    ? `${boxes.unknownDocumentIds.length} document(s) have an unresolved tax rate.`
    : boxes.missingStatusDocumentIds.length > 0
      ? `${boxes.missingStatusDocumentIds.length} document(s) have a customer with no tax status.`
      : undefined;

  return (
    <Stack gap={4}>
      <ModalUnsavedChanges when={note.trim() !== ""} />
      <ModalInFlight when={busy} />
      <Notice tone="danger" title="This workspace makes no compliance claim">
        It is not certified by any tax authority, it is not a filing service and nothing here is legal or accounting advice. The figures are arithmetic over the records in this browser. Your accountant files the return.
      </Notice>
      <CapabilityNotice id="tax.file" />
      {blocked && <Notice tone="warning" title="Preparation is blocked">{blocked}</Notice>}
      <FactGrid columns={4} items={[
        { label: "Period", value: periodLabel(period, org.locale) },
        { label: "Tax on sales", value: context.money(boxes.outputTaxMinor), mono: true },
        { label: "Tax on purchases", value: context.money(boxes.inputTaxMinor), mono: true },
        { label: "Net payable", value: context.money(boxes.payableMinor), mono: true, tone: "accent" },
      ]} />
      <Field label="Note for the file" hint="Kept with the prepared return in this workspace.">
        <TextArea aria-label="Note for the file" value={note} rows={3} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("export_data")}
          title={blocked}
          onClick={async () => {
            setBusy(true);
            try {
            await context.mutate.create({
              collection: "taxCodes",
              title: `Return prepared · ${periodLabel(period, org.locale)}`,
              status: "prepared",
              summary: note || `Figures computed from posted documents for ${period}. Not submitted anywhere.`,
              amountMinor: boxes.payableMinor,
              fields: {
                kind: "return", period, jurisdiction: org.jurisdiction,
                outputTaxMinor: boxes.outputTaxMinor, inputTaxMinor: boxes.inputTaxMinor,
                payableMinor: boxes.payableMinor, preparedBy: context.actor,
              },
            }, `Return prepared for ${period}`);
            context.toast("Return prepared", `The figures for ${period} are recorded as prepared. Submission needs an authorised filing connection, which does not exist here.`, "info");
            close();
            } catch (error) {
              context.toast("Return not recorded", error instanceof Error ? error.message : "Try again.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Record it as prepared
        </Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </ModalActions>
      <SourceNote><ShieldAlert size={13} aria-hidden="true" /> Recording a return as prepared changes a record in this browser and nothing else.</SourceNote>
    </Stack>
  );
}

export function TaxStrip({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const boxes = buildReturn({ period: data.currentPeriod, invoices: data.invoices, bills: data.bills, contacts: data.contacts, jurisdiction: org.jurisdiction, now: context.now });
  return (
    <div className="fin-strip">
      <Pill tone="neutral" dot>{org.jurisdiction}</Pill>
      <span>{periodLabel(data.currentPeriod, org.locale)} output <Amount minor={boxes.outputTaxMinor} context={context} bold /></span>
      <span>Input <Amount minor={boxes.inputTaxMinor} context={context} bold /></span>
      <span>Payable <Amount minor={boxes.payableMinor} context={context} bold /></span>
      {boxes.unknownDocumentIds.length > 0 && <Pill tone="danger" dot>{boxes.unknownDocumentIds.length} unresolved</Pill>}
      <span className="ds-grow" />
      <CapabilityPill id="tax.file" />
    </div>
  );
}
