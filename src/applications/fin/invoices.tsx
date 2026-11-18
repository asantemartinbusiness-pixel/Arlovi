import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, Printer, Send, Trash2 } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  CUSTOMER_TAX_STATUSES, TAX_CATEGORIES, blankLine, documentDate, documentTotals, readLines, statusFor, taxCategoryLabel, writeLines,
} from "@/domain/fin-invoice";
import type { CustomerTaxStatus, DocumentTotals, InvoiceLine, TaxCategory } from "@/domain/fin-invoice";
import { accountCode, accountType, ageBuckets, checkPosting, daysOverdue } from "@/domain/fin-ledger";
import type { JLine } from "@/domain/fin-ledger";
import { contactOf, openInvoices, outstandingMinor, useFinData } from "./data";
import type { FinData } from "./data";
import { Amount, CapabilityNotice, CapabilityPill, OverdueBadge, SourceNote, StatementRow, StatusPill, TaxCodePill, taxRateText } from "./parts";
import { CollectionsByCustomer } from "./collectionsView";
import { clockIso } from "@/platform/clock";
import { prepareInvoiceIssue, prepareInvoiceReceipt } from "./settlement";
import { assessTimeBilling } from "./timeBilling";
import { OpsHeader, OpsMetric, OpsMetrics } from "@/applications/shared/operational-surfaces";

/* ------------------------------------------------------------------ *
 * FIN-004 Invoice list and FIN-005 Invoice detail.
 *
 * Every total on both screens comes from `documentTotals`, which resolves one
 * tax code per line from the organisation's jurisdiction, the line's category,
 * the customer's tax status and the invoice date.
 * ------------------------------------------------------------------ */

function invoiceTotals(data: FinData, invoice: Rec | undefined, jurisdiction: string, now: Date, overrides?: { lines?: InvoiceLine[]; status?: CustomerTaxStatus }): DocumentTotals {
  const customer = contactOf(data, invoice);
  return documentTotals({
    lines: overrides?.lines ?? readLines(invoice),
    jurisdiction,
    customerStatus: overrides?.status ?? statusFor(invoice, customer),
    date: documentDate(invoice, now),
  });
}

/* ---------------------------- FIN-004 ---------------------------- */

const TAB_FILTER: Record<string, (invoice: Rec, now: Date) => boolean> = {
  Draft: (invoice) => invoice.status === "draft",
  "Awaiting payment": (invoice) => ["awaiting_payment", "part_paid"].includes(invoice.status),
  Overdue: (invoice, now) => ["awaiting_payment", "part_paid"].includes(invoice.status) && Boolean(invoice.dueAt) && new Date(invoice.dueAt!) < now,
  Paid: (invoice) => invoice.status === "paid",
  Void: (invoice) => invoice.status === "void",
};

export function InvoiceList({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const rows = useMemo(
    () => data.invoices.filter((invoice) => (TAB_FILTER[tab] ?? (() => true))(invoice, now))
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [data.invoices, tab, now],
  );
  const total = rows.reduce((sum, invoice) => sum + Number(invoice.amountMinor ?? 0), 0);
  const outstanding = rows.reduce((sum, invoice) => sum + outstandingMinor(invoice), 0);
  const unresolved = rows.filter((invoice) => invoice.fields.taxUnresolved === true);

  if (rows.length === 0) {
    return (
      <Empty
        title={`No ${tab.toLowerCase()} invoices`}
        icon={<FileText size={20} />}
        action={tab === "Draft" ? <Button variant="primary" onClick={() => context.openOverlay("New invoice")}>New invoice</Button> : undefined}
      >
        {tab === "Overdue" ? "Nothing is past its due date in this ledger." : `Invoices appear here once they are ${tab.toLowerCase()}.`}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label={`${tab} invoices`} value={String(rows.length)} meta={`of ${data.invoices.length} in total`} />
        <Stat prov="posted" label="Gross value" value={context.money(total)} meta="Net plus resolved tax" />
        <Stat prov="posted" label="Outstanding" value={context.money(outstanding)} meta="Gross less payments recorded" />
        <Stat prov="unknown"
          label="Unresolved tax"
          value={String(unresolved.length)}
          meta={unresolved.length ? "Held as UNKNOWN, never as zero" : "Every line resolves to a code"}
        />
      </StatRow>

      {unresolved.length > 0 && (
        <Notice tone="danger" title={`${unresolved.length} invoice${unresolved.length === 1 ? "" : "s"} in this view cannot resolve a tax rate`}>
          {unresolved.map((invoice) => invoice.title).join(", ")} — no approved rate matches the jurisdiction, line category, customer status and date. They cannot be issued until the combination is approved.
        </Notice>
      )}

      {tab === "Overdue" && <CollectionsByCustomer context={context} />}

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} invoices`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (daysOverdue(row, now) ? "warning" : row.fields.taxUnresolved === true ? "danger" : undefined)}
        columns={[
          { key: "number", header: "Number", width: "116px", primary: true,
            cell: (row) => <Link to={`/o/${org.slug}/fin/invoices/${row.id}`} style={{ color: "inherit", fontWeight: 600 }}>{row.title}</Link>,
            sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "customer", header: "Customer",
            cell: (row) => {
              const customer = contactOf(data, row);
              return customer ? <span className="ds-truncate">{customer.title}</span> : <span className="ds-subtle">Not linked</span>;
            },
            filterValue: (row) => contactOf(data, row)?.title ?? "", sortValue: (row) => contactOf(data, row)?.title ?? "" },
          { key: "issued", header: "Issued", hideBelow: 1200, cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "due", header: "Due", cell: (row) => <OverdueBadge record={row} context={context} />, sortValue: (row) => row.dueAt ?? "" },
          { key: "status", header: "Status", cell: (row) => <StatusPill status={row.status} />, filterValue: (row) => row.status },
          { key: "tax", header: "Tax", align: "end", hideBelow: 900,
            cell: (row) => row.fields.taxUnresolved === true
              ? <Pill tone="danger">UNKNOWN</Pill>
              : <Amount minor={Number(row.fields.taxMinor ?? 0)} context={context} /> },
          { key: "amount", header: "Gross", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
          { key: "outstanding", header: "Outstanding", align: "end", hideBelow: 1400, cell: (row) => <Amount minor={outstandingMinor(row)} context={context} />, sortValue: (row) => outstandingMinor(row) },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
        bulkActions={[
          {
            label: "Draft reminders",
            disabled: (selected) => selected.every((row) => !["awaiting_payment", "part_paid"].includes(row.status)),
            onRun: (selected) => context.openOverlay("bulk action preview", { ids: selected.map((row) => row.id), action: "reminder" }),
          },
          {
            label: "Export selected",
            onRun: (selected) => exportInvoices(context, data, selected),
          },
        ]}
        summary={<>
          <span className="ds-subtle">Outstanding</span>
          <Amount minor={outstanding} context={context} bold />
        </>}
      />

      <Grid>
        <Card prov="posted" span={6} title="Ageing in this view" subtitle="Days past the due date">
          <Stack gap={2}>
            {ageBuckets(rows.filter((row) => ["awaiting_payment", "part_paid"].includes(row.status)), now).map((bucket) => (
              <Row key={bucket.bucket} gap={3}>
                <span className="ds-grow">{bucket.bucket}</span>
                <span className="ds-subtle">{bucket.count}</span>
                <Amount minor={bucket.amountMinor} context={context} />
              </Row>
            ))}
          </Stack>
        </Card>
        <Card prov="posted" span={6} title="Sending" subtitle="What happens when you press Send" actions={<CapabilityPill id="email.send" />}>
          <CapabilityNotice id="email.send" />
          <SourceNote>A reminder is written as a draft against the invoice with its recipient and body, and the invoice records that a reminder exists. Nothing leaves this browser, so a duplicate send is impossible.</SourceNote>
        </Card>
      </Grid>
    </Stack>
  );
}

/**
 * Finance sees linked source records rather than an invented invoice subtotal.
 * This is a review queue: approval by People is necessary but not sufficient
 * to charge a customer, resolve tax or create a posted receivable.
 */
export function FinanceTimeInputs({ context }: { context: ScreenContext }) {
  const data = useCollections(["shifts", "employees", "projects", "invoices"]);
  const [view, setView] = useState<"all" | "attention" | "ready" | "reviewed">("all");
  const sourceRows = data.shifts
    .filter((row) => row.fields.kind === "time" && row.fields.billable === true)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const assess = (entry: Rec) => assessTimeBilling(entry, data.employees, data.projects, data.invoices);
  const ready = sourceRows.filter((entry) => assess(entry).state === "ready");
  const reviewed = sourceRows.filter((entry) => assess(entry).state === "reviewed");
  const needsWork = sourceRows.filter((entry) => !["ready", "reviewed", "invoiced"].includes(assess(entry).state));
  const rows = view === "attention" ? needsWork : view === "ready" ? ready : view === "reviewed" ? reviewed : sourceRows;
  const approvedEstimate = reviewed.reduce((sum, entry) => sum + Number(assess(entry).netEstimateMinor ?? 0), 0);
  return (
    <Stack gap={4}>
      <OpsHeader
        eyebrow="Finance / Invoices / Time inputs"
        title="From recorded time to accountable billing."
        description="An evidence-led review surface for approved project work. See what's ready, what's missing and what Finance has already reviewed before preparing an invoice."
        actions={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/fin/invoices?tab=Draft`)}>
          Open draft invoices
        </Button>}
        note="Illustrative amounts are exclusive of tax and are not posted revenue."
      />
      <OpsMetrics label="Finance time input review">
        <OpsMetric label="Time inputs" value={sourceRows.length} detail="Marked potentially billable" />
        <OpsMetric label="Needs source work" value={needsWork.length} detail="Approvals, links, rates or hours" emphasis={needsWork.length ? "attention" : "neutral"} />
        <OpsMetric label="Ready for review" value={ready.length} detail="Verified source and recorded rate" />
        <OpsMetric label="Reviewed estimate" value={reviewed.length ? context.money(approvedEstimate) : "—"}
          detail={`${reviewed.length} reviewed records · before tax`} emphasis={reviewed.length ? "positive" : "neutral"} />
      </OpsMetrics>
      <div className="ops-toolbar" aria-label="Filter time inputs">
        <strong className="ops-toolbar-heading">Time input queue</strong>
        <Button size="sm" variant={view === "all" ? "secondary" : "ghost"} aria-pressed={view === "all"} onClick={() => setView("all")}>All ({sourceRows.length})</Button>
        <Button size="sm" variant={view === "attention" ? "secondary" : "ghost"} aria-pressed={view === "attention"} onClick={() => setView("attention")}>Needs work ({needsWork.length})</Button>
        <Button size="sm" variant={view === "ready" ? "secondary" : "ghost"} aria-pressed={view === "ready"} onClick={() => setView("ready")}>Ready ({ready.length})</Button>
        <Button size="sm" variant={view === "reviewed" ? "secondary" : "ghost"} aria-pressed={view === "reviewed"} onClick={() => setView("reviewed")}>Reviewed ({reviewed.length})</Button>
      </div>
      <Notice tone="info" title="Source records, not an invoice or revenue">
        These entries come from People and Projects. A recorded time approval does not prove a contractual rate, tax status, customer
        or invoice. Finance must independently prepare and approve the invoice; nothing here posts to the ledger or sends a bill.
      </Notice>
      {rows.length === 0 ? (
        <Empty title={sourceRows.length ? "Nothing in this review filter" : "No billable time submitted"}>
          {sourceRows.length ? "Select another queue filter to inspect the remaining time inputs." : "Project time entries marked billable will appear here for Finance review, including those that still need a People approval."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(entry) => entry.id}
          label="Billable time source records"
          filterable
          onOpen={(id) => context.openOverlay("finance time review", { id })}
          card={(entry) => {
            const person = data.employees.find((record) => record.id === entry.fields.employeeId);
            const project = data.projects.find((record) => record.id === entry.fields.projectId);
            const state = assess(entry);
            return <>
              <strong>{person?.title ?? String(entry.fields.employeeName ?? "Unlinked person")}</strong>
              <span className="ds-subtle">{project?.title ?? "Unlinked Project"} · {String(entry.fields.hours ?? "—")}h · {state.netEstimateMinor !== undefined
                ? context.money(state.netEstimateMinor) + " illustrative net" : "Rate not recorded"}</span>
              <Pill tone={state.state === "reviewed" ? "success" : state.state === "ready" ? "info" : "warning"}>{state.label}</Pill>
            </>;
          }}
          rowTone={(entry) => ["identity_missing", "project_missing", "invoice_missing", "invalid_hours"].includes(assess(entry).state)
            ? "danger" : ["unapproved", "rate_missing"].includes(assess(entry).state) ? "warning" : undefined}
          columns={[
            { key: "person", header: "Employee", primary: true,
              cell: (entry) => data.employees.find((person) => person.id === entry.fields.employeeId)?.title
                ?? <span className="ds-subtle">{String(entry.fields.employeeName ?? "Unlinked")} · verify</span>,
              filterValue: (entry) => String(entry.fields.employeeName ?? "") },
            { key: "project", header: "Project",
              cell: (entry) => data.projects.find((project) => project.id === entry.fields.projectId)?.title
                ?? <span className="ds-subtle">Not linked</span> },
            { key: "hours", header: "Hours", align: "end",
              cell: (entry) => <span className="ds-num">{String(entry.fields.hours ?? "—")}</span>,
              sortValue: (entry) => Number(entry.fields.hours ?? 0) },
            { key: "estimate", header: "Net estimate", align: "end",
              cell: (entry) => assess(entry).netEstimateMinor !== undefined
                ? context.money(assess(entry).netEstimateMinor ?? 0) : <span className="ds-subtle">Unpriced</span>,
              sortValue: (entry) => assess(entry).netEstimateMinor ?? 0 },
            { key: "state", header: "Review",
              cell: (entry) => {
                const state = assess(entry);
                return <Pill tone={state.state === "reviewed" ? "success" : state.state === "ready" ? "info" : "warning"}>{state.label}</Pill>;
              }},
          ]}
          summary={<>
            <span className="ds-subtle">Reviewed-only illustrative net subtotal, excluding tax</span>
            <strong>{reviewed.length ? context.money(approvedEstimate) : "No reviewed rated time"}</strong>
          </>}
        />
      )}
      <Notice tone="warning" title="Amounts are not invoice totals">
        Estimates include only recorded positive rates and valid approved hours; customer rates and applicable tax must be checked on the actual invoice.
        Unpriced or unapproved entries are never silently valued at zero.
      </Notice>
    </Stack>
  );
}

export function FinanceTimeReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["employees", "projects", "invoices"]);
  if (!entry || entry.organizationId !== context.org.id || entry.collection !== "shifts"
    || entry.fields.kind !== "time" || entry.fields.billable !== true) {
    return <Empty title="Time entry unavailable">Select an actual billable time entry in this company.</Empty>;
  }
  const person = data.employees.find((row) => row.id === entry.fields.employeeId);
  const project = data.projects.find((row) => row.id === entry.fields.projectId);
  const assessment = assessTimeBilling(entry, data.employees, data.projects, data.invoices);
  const canReview = context.can("post_journal");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Employee", value: person?.title ?? "No linked employee" },
        { label: "Project", value: project?.title ?? "No linked Project" },
        { label: "Hours", value: String(entry.fields.hours ?? "Not recorded") },
        { label: "Recorded rate", value: entry.fields.rateMinor !== undefined ? context.money(Number(entry.fields.rateMinor)) : "Not recorded" },
        { label: "Illustrative net", value: assessment.netEstimateMinor !== undefined ? context.money(assessment.netEstimateMinor) : "Unavailable" },
        { label: "People approval", value: entry.status === "approved" && entry.fields.approved === true
          ? `Approved by ${String(entry.fields.approvedBy ?? "Unknown")}`
          : "Not approved" },
        { label: "Finance review", value: assessment.label },
        { label: "Reviewed by", value: String(entry.fields.billingReviewedBy || "No Finance review yet") },
      ]} />
      <Notice tone={assessment.eligible || assessment.state === "reviewed" ? "info" : "warning"} title={assessment.label}>
        {assessment.eligible
          ? "This record can be marked reviewed locally. That does not set a customer, tax code or invoice number."
          : "Resolve the underlying source record in People or Projects before using this time for Finance invoicing."}
      </Notice>
      <Row gap={2} wrap>
        {context.role === "owner" && <Button variant="secondary" onClick={() => {
          close(); context.navigate(`/o/${context.org.slug}/hr/scheduling?tab=Timesheets`);
        }}>Open People timesheets</Button>}
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
        {assessment.eligible && <Button variant="primary" disabled={!canReview} onClick={async () => {
          const updated = await context.mutate.patch(entry.id, {
            fields: {
              ...entry.fields,
              billingReviewStatus: "ready",
              billingReviewedBy: context.actor,
              billingReviewedAt: clockIso(),
            },
          }, { expectRevision: entry.revision,
            event: `Approved billable time reviewed by Finance: ${entry.title}. No invoice created.` });
          if (!updated) return;
          context.toast("Finance review saved", "This time input is ready for manual invoice preparation. No ledger entry or invoice was created.");
          close();
        }}>Mark reviewed for billing</Button>}
      </Row>
      {!canReview && <Notice tone="warning">Only an owner or Finance role with journal-review capability can record this Finance decision in the local workspace.</Notice>}
    </Stack>
  );
}

function exportInvoices(context: ScreenContext, data: FinData, rows: Rec[]): void {
  const header = "number,customer,issued,due,status,net_minor,tax_minor,gross_minor,outstanding_minor,tax_codes\n";
  const body = rows.map((invoice) => {
    const totals = invoiceTotals(data, invoice, context.org.jurisdiction, context.now);
    return [
      invoice.title,
      contactOf(data, invoice)?.title ?? "",
      (invoice.at ?? "").slice(0, 10),
      (invoice.dueAt ?? "").slice(0, 10),
      invoice.status,
      totals.netMinor,
      totals.taxMinor,
      totals.grossMinor,
      outstandingMinor(invoice),
      totals.byCode.map((group) => group.code.code).join(" "),
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",");
  }).join("\n");
  downloadFile(`${context.org.slug}-invoices.csv`, header + body, "text/csv");
  context.toast("Exported", `${rows.length} invoices written to a CSV file in this browser.`);
}

export { exportInvoices };

/* ---------------------------- FIN-005 ---------------------------- */

export function useInvoice(context: ScreenContext): { invoice?: Rec; data: FinData; totals: DocumentTotals; customer?: Rec } {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const fromRoute = useRecord(context.params.id);
  // An unknown or wrong-collection detail URL never substitutes another invoice.
  const invoice = context.params.id
    ? (fromRoute?.collection === "invoices" ? fromRoute : undefined)
    : data.invoices.find((item) => item.id === context.selectedId) ?? data.invoices[0];
  const customer = contactOf(data, invoice);
  const totals = invoiceTotals(data, invoice, org.jurisdiction, now);
  return { invoice, data, totals, customer };
}

export function InvoiceHeader({ context }: { context: ScreenContext }) {
  const { invoice, totals, customer } = useInvoice(context);
  if (!invoice) return null;
  const late = daysOverdue(invoice, context.now);
  return (
    <Card prov="posted" flush>
      <div className="ds-card-body">
        <Row gap={4} wrap>
          <div className="ds-grow">
            <Row gap={2}>
              <h2 style={{ fontSize: "var(--text-xl)" }}>{invoice.title}</h2>
              <StatusPill status={invoice.status} />
              {late && <Pill tone="danger" dot>{late} days late</Pill>}
              {totals.hasUnknownRate && <Pill tone="danger" dot>Tax unresolved</Pill>}
            </Row>
            <p className="ds-subtle">{invoice.summary}</p>
          </div>
          <Properties rows={[
            { label: "Customer", value: customer?.title ?? "Not linked" },
            { label: "Issued", value: <span className="ds-num">{context.date(invoice.at)}</span> },
            { label: "Due", value: <span className="ds-num">{context.date(invoice.dueAt)}</span> },
          ]} />
          <div style={{ textAlign: "end" }}>
            <span className="ds-stat-label">Gross</span>
            <div className="ds-stat-value">{context.money(totals.grossMinor)}</div>
            <span className="ds-subtle">{context.money(totals.netMinor)} net + {context.money(totals.taxMinor)} tax</span>
          </div>
        </Row>
      </div>
    </Card>
  );
}

export function InvoiceOverview({ context }: { context: ScreenContext }) {
  const { invoice, data, totals, customer } = useInvoice(context);
  const { org } = useWorkspace();
  if (!invoice) return <Empty title="No invoice selected" />;
  const status = statusFor(invoice, customer);
  const paid = invoice.status === "paid" ? totals.grossMinor : Math.max(0, Number(invoice.fields.paidMinor ?? 0));
  const journal = data.journals.find((item) => item.id === String(invoice.fields.journalId ?? ""));

  return (
    <Grid>
      <Card prov="human" span={5} title="Customer and billing" subtitle={customer ? String(customer.fields.email ?? "") : "No contact record is linked"}>
        {customer ? (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Customer", value: <Link to={`/o/${org.slug}/crm/contacts/${customer.id}`}>{customer.title}</Link> },
              { label: "Role", value: String(customer.fields.role ?? "Not recorded") },
              { label: "Email", value: String(customer.fields.email ?? "Not recorded") },
              { label: "Tax status", value: <Pill tone={status === "unknown" ? "danger" : "neutral"}>{CUSTOMER_TAX_STATUSES.find((entry) => entry.value === status)?.label ?? status}</Pill> },
              { label: "Consent", value: customer.fields.consent ? String(customer.fields.consent) : "None recorded" },
            ]} />
            {status === "unknown" && (
              <Notice tone="danger" title="No tax status is recorded for this customer">
                Without it the engine cannot resolve a rate, so every line is held as UNKNOWN. Set the status on the contact record or override it on this invoice.
              </Notice>
            )}
          </Stack>
        ) : (
          <Empty title="No customer linked">An invoice without a customer record cannot resolve a tax status, so its rate stays unknown.</Empty>
        )}
      </Card>

      <Card prov="posted" span={4} title="Tax" subtitle={`${org.jurisdiction} rules at ${context.date(documentDate(invoice, context.now))}`}>
        <TaxSummary totals={totals} context={context} />
      </Card>

      <Card prov="posted" span={3} title="Totals">
        <StatementRow
          context={context}
          rows={[
            { label: "Lines", minor: undefined, note: `${totals.lines.length} line${totals.lines.length === 1 ? "" : "s"}` },
            { label: "Discount given", minor: -totals.discountMinor },
            { label: "Net", minor: totals.netMinor },
            { label: "Tax", minor: totals.taxMinor },
            { label: "Gross", minor: totals.grossMinor, bold: true },
            { label: "Paid", minor: paid },
            { label: "Outstanding", minor: outstandingMinor(invoice), bold: true },
          ]}
        />
      </Card>

      <Card prov="posted" span={6} title="Ledger posting" subtitle={journal ? "This invoice is on the ledger" : "Nothing has been posted yet"}>
        {journal ? (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Journal", value: journal.title },
              { label: "Ledger date", value: <span className="ds-num">{context.date(journal.at)}</span> },
              { label: "Status", value: <Pill tone={journal.status === "posted" ? "success" : "warning"} dot>{journal.status}</Pill> },
              { label: "Value", value: <Amount minor={journal.amountMinor} context={context} bold /> },
            ]} />
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/fin/ledger`)}>Open the general ledger</Button>
          </Stack>
        ) : (
          <Notice tone="info" title="A draft invoice is not in the ledger">
            Approving it posts receivables, revenue by account and the tax control account in one balanced journal. Until then it affects no statement.
          </Notice>
        )}
      </Card>

      <Card prov="posted" span={6} title="Versions" subtitle="An issued invoice is immutable; each change is a version">
        <InvoiceVersions invoice={invoice} context={context} />
      </Card>
    </Grid>
  );
}

function InvoiceVersions({ invoice, context }: { invoice: Rec; context: ScreenContext }) {
  const versions = ((invoice.body as { versions?: { at: string; by: string; note: string; grossMinor: number }[] })?.versions) ?? [];
  if (versions.length === 0 && invoice.history.length === 0) {
    return <span className="ds-subtle">No version has been frozen yet. The invoice is still a draft.</span>;
  }
  return (
    <Stack gap={2}>
      {versions.map((version, index) => (
        <Row key={`${version.at}-${index}`} gap={3}>
          <span className="ds-num" style={{ width: 110 }}>{context.date(version.at)}</span>
          <span className="ds-grow">{version.note}</span>
          <span className="ds-subtle">{version.by}</span>
          <Amount minor={version.grossMinor} context={context} />
        </Row>
      ))}
      <SourceNote>{invoice.history.length} earlier snapshot{invoice.history.length === 1 ? "" : "s"} are kept on the record, at revision {invoice.revision}.</SourceNote>
    </Stack>
  );
}

export function TaxSummary({ totals, context }: { totals: DocumentTotals; context: ScreenContext }) {
  const { org } = useWorkspace();
  if (totals.lines.length === 0) return <span className="ds-subtle">No lines, so there is nothing to tax.</span>;
  return (
    <Stack gap={3}>
      <div className="ds-grid-scroll">
        <table className="ds-table">
          <caption className="ds-sr-only">Tax by resolved code</caption>
          <thead><tr><th>Code</th><th data-align="end">Rate</th><th data-align="end">Net</th><th data-align="end">Tax</th></tr></thead>
          <tbody>
            {totals.byCode.map((group) => (
              <tr key={group.code.code} data-tone={group.code.code === "UNKNOWN" ? "danger" : undefined}>
                <td><TaxCodePill code={group.code} /></td>
                <td data-align="end"><span className="ds-num">{group.code.code === "UNKNOWN" ? "—" : taxRateText(group.code, org.locale)}</span></td>
                <td data-align="end"><Amount minor={group.netMinor} context={context} /></td>
                <td data-align="end"><Amount minor={group.taxMinor} context={context} bold /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} style={{ textAlign: "start" }}>Total</th>
              <td data-align="end"><Amount minor={totals.netMinor} context={context} bold /></td>
              <td data-align="end"><Amount minor={totals.taxMinor} context={context} bold /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Stack gap={2}>
        {totals.byCode.filter((group) => group.code.note).map((group) => (
          <span key={group.code.code} className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>
            <strong>{group.code.code}</strong> {group.code.note}
          </span>
        ))}
      </Stack>
      {totals.hasUnknownRate && (
        <Notice tone="danger" title="One or more lines have no approved rate">
          An unresolved line is not zero-rated and is not exempt. It is held as UNKNOWN so the figure is never quietly treated as nil.
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------- Line editor -------------------------- */

interface EditorState {
  lines: InvoiceLine[];
  status: CustomerTaxStatus;
}

/**
 * The line editor. Each keystroke recomputes the line's tax through the engine,
 * so the per-line code, the summary by code and the totals move together.
 */
export function LineEditor({ context, close }: { context: ScreenContext; close?: () => void }) {
  const { invoice, data, customer } = useInvoice(context);
  const { org, now } = useWorkspace();
  const [state, setState] = useState<EditorState>({ lines: [], status: "domestic" });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setState({ lines: readLines(invoice), status: statusFor(invoice, customer) });
    setDirty(false);
  }, [invoice, customer]);

  const totals = useMemo(() => invoice
    ? documentTotals({ lines: state.lines, jurisdiction: org.jurisdiction, customerStatus: state.status, date: documentDate(invoice, now) })
    : undefined, [invoice, state, org.jurisdiction, now]);

  if (!invoice || !totals) return <Empty title="No invoice selected" />;

  const locked = invoice.status !== "draft";
  const revenueAccounts = data.accounts.filter((account) => accountType(account) === "revenue" && account.status !== "inactive");

  function update(id: string, patch: Partial<InvoiceLine>) {
    setDirty(true);
    setState((current) => ({ ...current, lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) }));
  }

  if (locked) {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title={`${invoice.title} is ${invoice.status.replace(/_/g, " ")} and cannot be edited`}>
          It is on the ledger and has been treated as issued. Correct it with a credit note from the Void action, which leaves both documents on the record.
        </Notice>
        <LineTable totals={totals} context={context} data={data} />
        <TaxSummary totals={totals} context={context} />
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Customer tax status" hint="Overrides the status on the contact record for this document only.">
          <Select aria-label="Customer tax status" value={state.status} onChange={(event) => { setDirty(true); setState((current) => ({ ...current, status: event.target.value as CustomerTaxStatus })); }}>
            {CUSTOMER_TAX_STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
        <div className="ds-grow" />
        <Stack gap={1}>
          <span className="ds-stat-label">Recomputed live</span>
          <Row gap={3}>
            <span>Net <Amount minor={totals.netMinor} context={context} bold /></span>
            <span>Tax <Amount minor={totals.taxMinor} context={context} bold /></span>
            <span>Gross <Amount minor={totals.grossMinor} context={context} bold /></span>
          </Row>
        </Stack>
      </Row>

      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Invoice lines</caption>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Description</th>
                <th data-align="end" style={{ width: 90 }}>Qty</th>
                <th data-align="end" style={{ width: 150 }}>Unit price</th>
                <th data-align="end" style={{ width: 96 }}>Disc %</th>
                <th style={{ width: 170 }}>Tax category</th>
                <th style={{ width: 160 }}>Revenue account</th>
                <th style={{ width: 118 }}>Code</th>
                <th data-align="end" style={{ width: 120 }}>Net</th>
                <th data-align="end" style={{ width: 110 }}>Tax</th>
                <th style={{ width: 44 }}><span className="ds-sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((computed, index) => (
                <tr key={computed.id} data-tone={computed.taxCode.code === "UNKNOWN" ? "danger" : undefined}>
                  <td>
                    <TextInput
                      aria-label={`Description for line ${index + 1}`}
                      value={computed.description}
                      onChange={(event) => update(computed.id, { description: event.target.value })}
                    />
                  </td>
                  <td data-align="end">
                    <TextInput
                      aria-label={`Quantity for line ${index + 1}`}
                      align="end"
                      inputMode="decimal"
                      value={String(computed.quantity)}
                      onChange={(event) => update(computed.id, { quantity: Number(event.target.value.replace(/[^0-9.]/g, "")) || 0 })}
                    />
                  </td>
                  <td data-align="end">
                    <MoneyInput
                      label={`Unit price for line ${index + 1}`}
                      currency={org.currency}
                      valueMinor={computed.unitPriceMinor}
                      onChangeMinor={(minor) => update(computed.id, { unitPriceMinor: minor })}
                    />
                  </td>
                  <td data-align="end">
                    <TextInput
                      aria-label={`Discount percent for line ${index + 1}`}
                      align="end"
                      inputMode="decimal"
                      value={String((computed.discountBp ?? 0) / 100)}
                      onChange={(event) => update(computed.id, { discountBp: Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100) })}
                    />
                  </td>
                  <td>
                    <Select
                      aria-label={`Tax category for line ${index + 1}`}
                      value={computed.taxCategory}
                      onChange={(event) => update(computed.id, { taxCategory: event.target.value as TaxCategory })}
                    >
                      {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                    </Select>
                  </td>
                  <td>
                    <Select
                      aria-label={`Revenue account for line ${index + 1}`}
                      value={computed.accountCode ?? ""}
                      onChange={(event) => update(computed.id, { accountCode: event.target.value || undefined })}
                    >
                      <option value="">Not set</option>
                      {revenueAccounts.map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
                    </Select>
                  </td>
                  <td><TaxCodePill code={computed.taxCode} /></td>
                  <td data-align="end"><Amount minor={computed.netMinor} context={context} /></td>
                  <td data-align="end"><Amount minor={computed.taxMinor} context={context} /></td>
                  <td>
                    <Button
                      size="sm" variant="ghost" iconOnly
                      aria-label={`Remove line ${index + 1}`}
                      disabled={totals.lines.length <= 1}
                      onClick={() => { setDirty(true); setState((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== computed.id) })); }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={7} style={{ textAlign: "start" }}>Totals</th>
                <td data-align="end"><Amount minor={totals.netMinor} context={context} bold /></td>
                <td data-align="end"><Amount minor={totals.taxMinor} context={context} bold /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="ds-grid-foot">
          <Button
            size="sm" variant="secondary" icon={<Plus size={14} />}
            onClick={() => { setDirty(true); setState((current) => ({ ...current, lines: [...current.lines, blankLine(current.lines.length)] })); }}
          >
            Add line
          </Button>
          <span className="ds-row ds-gap-3">
            {totals.discountMinor > 0 && <span className="ds-subtle">Discount {context.money(totals.discountMinor)}</span>}
            {totals.hasUnknownRate ? <Pill tone="danger" dot>Unresolved rate</Pill> : <Pill tone="success" dot>All lines resolved</Pill>}
          </span>
        </div>
      </div>

      <TaxSummary totals={totals} context={context} />

      <Row gap={2} wrap>
        <Button
          variant="primary"
          busy={busy}
          disabled={!dirty || state.lines.some((line) => !line.description.trim())}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(invoice.id, {
              amountMinor: totals.grossMinor,
              body: { ...(invoice.body as object ?? {}), ...writeLines(state.lines) },
              fields: {
                ...invoice.fields,
                netMinor: totals.netMinor,
                taxMinor: totals.taxMinor,
                customerTaxStatus: state.status,
                taxUnresolved: totals.hasUnknownRate,
              },
            }, { expectRevision: invoice.revision, event: `Lines edited on ${invoice.title}` });
            context.toast("Lines saved", `${state.lines.length} lines, ${context.money(totals.netMinor)} net and ${context.money(totals.taxMinor)} tax across ${totals.byCode.length} tax ${totals.byCode.length === 1 ? "code" : "codes"}.`);
            setDirty(false);
            setBusy(false);
            close?.();
          }}
        >
          Save lines
        </Button>
        {dirty && <span className="ds-subtle">Unsaved. The totals above are recomputed, the record still holds {context.money(Number(invoice.amountMinor ?? 0))}.</span>}
        <span className="ds-grow" />
        {close && <Button variant="ghost" onClick={close}>Close</Button>}
      </Row>
    </Stack>
  );
}

function LineTable({ totals, context, data }: { totals: DocumentTotals; context: ScreenContext; data: FinData }) {
  return (
    <div className="ds-grid-wrap">
      <div className="ds-grid-scroll">
        <table className="ds-table">
          <caption className="ds-sr-only">Invoice lines</caption>
          <thead>
            <tr>
              <th>Description</th>
              <th data-align="end">Qty</th>
              <th data-align="end">Unit</th>
              <th data-align="end">Disc</th>
              <th>Category</th>
              <th>Account</th>
              <th>Code</th>
              <th data-align="end">Net</th>
              <th data-align="end">Tax</th>
              <th data-align="end">Gross</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((line) => (
              <tr key={line.id} data-tone={line.taxCode.code === "UNKNOWN" ? "danger" : undefined}>
                <td className="ds-table-primary">{line.description}</td>
                <td data-align="end"><span className="ds-num">{line.quantity}</span></td>
                <td data-align="end"><Amount minor={line.unitPriceMinor} context={context} /></td>
                <td data-align="end"><span className="ds-num">{line.discountBp ? `${(line.discountBp / 100).toFixed(1)}%` : "—"}</span></td>
                <td><span className="ds-subtle">{taxCategoryLabel(line.taxCategory)}</span></td>
                <td><span className="ds-subtle">{line.accountCode ? `${line.accountCode} ${data.accounts.find((account) => accountCode(account) === line.accountCode)?.title ?? ""}` : "Not set"}</span></td>
                <td><TaxCodePill code={line.taxCode} /></td>
                <td data-align="end"><Amount minor={line.netMinor} context={context} /></td>
                <td data-align="end"><Amount minor={line.taxMinor} context={context} /></td>
                <td data-align="end"><Amount minor={line.grossMinor} context={context} bold /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={7} style={{ textAlign: "start" }}>Totals</th>
              <td data-align="end"><Amount minor={totals.netMinor} context={context} bold /></td>
              <td data-align="end"><Amount minor={totals.taxMinor} context={context} bold /></td>
              <td data-align="end"><Amount minor={totals.grossMinor} context={context} bold /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function InvoiceLineItems({ context }: { context: ScreenContext }) {
  const { invoice } = useInvoice(context);
  if (!invoice) return <Empty title="No invoice selected" />;
  return (
    <Stack gap={4}>
      {invoice.status === "draft" && (
        <Notice tone="info" title="This draft is editable in place">
          Change a quantity, price, discount or tax category and the resolved code, the summary by code and the totals all recompute before you save.
        </Notice>
      )}
      <LineEditor context={context} />
    </Stack>
  );
}

/* --------------------------- Payments --------------------------- */

export function InvoicePayments({ context }: { context: ScreenContext }) {
  const { invoice, data, totals } = useInvoice(context);
  if (!invoice) return <Empty title="No invoice selected" />;

  const receipts = data.journals.filter((journal) =>
    String(journal.fields.invoiceId ?? "") === invoice.id && journal.fields.source === "payment");
  const legacy = data.journals.filter((journal) => journal.id === String(invoice.fields.paymentJournalId ?? ""));
  const all = [...new Map([...receipts, ...legacy]
    .filter((journal) => journal.status === "posted")
    .map((journal) => [journal.id, journal])).values()];
  const outstanding = outstandingMinor(invoice);
  const recordedPaid = Number(invoice.fields.paidMinor ?? 0);
  const paid = invoice.status === "paid"
    ? totals.grossMinor
    : Math.min(totals.grossMinor, Math.max(0, recordedPaid));
  const unlinkedHistoricPayment = invoice.status === "paid" && all.length === 0;

  return (
    <Grid>
      <Card prov="human" span={7} title="Payment allocations" subtitle={`${all.length} receipt${all.length === 1 ? "" : "s"} posted against this invoice`} flush>
        {all.length === 0 ? (
          <Empty title="No payment recorded">
            Recording a payment posts a balanced receipt: cash debited, receivables credited. No payment provider confirms it.
          </Empty>
        ) : (
          <DataGrid
            rows={all}
            rowId={(row) => row.id}
            label="Payments"
            filterable={false}
            columns={[
              { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
              { key: "journal", header: "Journal", primary: true, cell: (row) => row.title },
              { key: "method", header: "Method", cell: (row) => <span className="ds-subtle">{String(row.fields.method ?? "Bank transfer")}</span> },
              { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} bold /> },
            ]}
          />
        )}
      </Card>
      <Card prov="posted" span={5} title="Settlement">
        <Stack gap={3}>
          <StatementRow
            context={context}
            rows={[
              { label: "Gross invoiced", minor: totals.grossMinor },
              { label: "Paid", minor: paid },
              { label: "Outstanding", minor: outstanding, bold: true },
            ]}
          />
          {unlinkedHistoricPayment && (
            <Notice tone="warning" title="Paid status has no linked posted receipt">
              This historical invoice is marked paid, but no receipt journal is linked to it.
              Its zero outstanding amount follows the recorded status; verify the ledger before reconciliation.
            </Notice>
          )}
          <CapabilityNotice id="payment.capture" />
          <Button
            variant="primary"
            disabled={outstanding <= 0 || invoice.status === "draft" || invoice.status === "void"}
            title={invoice.status === "draft" ? "Approve the invoice first so receivables exist" : undefined}
            onClick={() => context.openOverlay("payment form")}
          >
            Record a payment
          </Button>
          {paid > 0 && outstanding > 0 && <Pill tone="info" dot>Part paid</Pill>}
          <SourceNote>Current receipts update the invoice allocation and post a journal together. Historical paid records without a linked journal are flagged for ledger review; no bank feed is connected.</SourceNote>
        </Stack>
      </Card>
      <Card prov="human" span={12} title="Receivables ageing for this customer" subtitle="Every open invoice on the same contact">
        <CustomerAgeing context={context} />
      </Card>
    </Grid>
  );
}

function CustomerAgeing({ context }: { context: ScreenContext }) {
  const { invoice, data } = useInvoice(context);
  const { org } = useWorkspace();
  const customerId = String(invoice?.fields.contactId ?? invoice?.parentId ?? "");
  const rows = openInvoices(data.invoices).filter((item) => String(item.fields.contactId ?? item.parentId ?? "") === customerId);
  if (rows.length === 0) return <span className="ds-subtle">Nothing else is outstanding for this customer.</span>;
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Customer open invoices"
      filterable={false}
      columns={[
        { key: "number", header: "Invoice", primary: true, cell: (row) => row.title },
        { key: "due", header: "Due", cell: (row) => <OverdueBadge record={row} context={context} /> },
        { key: "amount", header: "Outstanding", align: "end", cell: (row) => <Amount minor={outstandingMinor(row)} context={context} /> },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/fin/invoices/${id}`)}
      summary={<Amount minor={rows.reduce((sum, row) => sum + outstandingMinor(row), 0)} context={context} bold />}
    />
  );
}

export function InvoiceActivity({ context }: { context: ScreenContext }) {
  const { invoice } = useInvoice(context);
  const events = useEvents(invoice?.id, 80);
  if (!invoice) return <Empty title="No invoice selected" />;
  const reminders = ((invoice.body as { reminders?: { at: string; by: string; to: string; body: string }[] })?.reminders) ?? [];

  return (
    <Grid>
      <Card prov="posted" span={7} title="History" subtitle={`${events.length} recorded events, newest first`}>
        {events.length === 0 ? (
          <Empty title="Nothing recorded yet">Saving, approving, reminding and paying all write an entry here.</Empty>
        ) : (
          <ol className="ds-stack ds-gap-3">
            {events.map((event) => (
              <li key={event.id}>
                <Row gap={3} style={{ alignItems: "flex-start" }}>
                  <span className="ds-num ds-subtle" style={{ width: 150, flex: "none" }}>{context.dateTime(event.at)}</span>
                  <div className="ds-grow">
                    <strong>{event.message}</strong>
                    <span className="ds-subtle" style={{ display: "block" }}>{event.actor}{event.screenId ? ` · ${event.screenId}` : ""}</span>
                  </div>
                  {event.capability && <Pill tone={event.capability === "ready_local" ? "success" : "warning"}>{event.capability.replace(/_/g, " ")}</Pill>}
                </Row>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card prov="unknown" span={5} title="Reminders drafted" subtitle="Held locally, never sent" actions={<CapabilityPill id="email.send" />}>
        {reminders.length === 0 ? (
          <Empty title="No reminder drafted">A reminder is a record on this invoice with its recipient and body.</Empty>
        ) : (
          <Stack gap={3}>
            {reminders.map((reminder, index) => (
              <div key={`${reminder.at}-${index}`} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}>
                  <strong className="ds-grow">{reminder.to}</strong>
                  <span className="ds-subtle">{context.date(reminder.at)}</span>
                </Row>
                <p className="ds-subtle" style={{ marginBlockStart: 4 }}>{reminder.body}</p>
              </div>
            ))}
          </Stack>
        )}
      </Card>
      <Card prov="posted" span={12} title="Record snapshots" subtitle={`Revision ${invoice.revision}`}>
        {invoice.history.length === 0 ? <span className="ds-subtle">No earlier snapshot.</span> : (
          <DataGrid
            rows={invoice.history}
            rowId={(row) => row.at}
            label="Snapshots"
            filterable={false}
            columns={[
              { key: "at", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span> },
              { key: "status", header: "Status", cell: (row) => <StatusPill status={row.status} /> },
              { key: "amount", header: "Gross", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
              { key: "summary", header: "Summary", primary: true, cell: (row) => row.summary },
            ]}
          />
        )}
      </Card>
    </Grid>
  );
}

/* ------------------------ Invoice actions ----------------------- */

/** Builds the issue journal: receivables debited, revenue and tax credited. */
export function issueLines(data: FinData, totals: DocumentTotals, invoice: Rec): { lines: JLine[]; problem?: string } {
  const ar = data.accounts.find((account) => accountCode(account) === "1100");
  const tax = data.accounts.find((account) => accountCode(account) === "2100");
  if (!ar) return { lines: [], problem: "The chart of accounts has no 1100 receivables account." };
  if (totals.hasUnknownRate) return { lines: [], problem: "A line has no approved tax rate, so the tax control posting cannot be computed." };
  const lines: JLine[] = [{ accountId: ar.id, debitMinor: totals.grossMinor, creditMinor: 0, memo: invoice.title }];
  const byAccount = new Map<string, number>();
  for (const line of totals.lines) {
    const code = line.accountCode ?? String(invoice.fields.revenueCode ?? "4000");
    byAccount.set(code, (byAccount.get(code) ?? 0) + line.netMinor);
  }
  for (const [code, net] of byAccount) {
    const account = data.accounts.find((item) => accountCode(item) === code);
    if (!account) return { lines: [], problem: `No revenue account with code ${code} is in the chart of accounts.` };
    lines.push({ accountId: account.id, debitMinor: 0, creditMinor: net, memo: `${invoice.title} · ${account.title}` });
  }
  if (totals.taxMinor !== 0) {
    if (!tax) return { lines: [], problem: "The chart of accounts has no 2100 tax control account." };
    lines.push({ accountId: tax.id, debitMinor: 0, creditMinor: totals.taxMinor, memo: `${invoice.title} · output tax` });
  }
  return { lines };
}

export function NewInvoice({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  /* Until a person types or chooses, the number and customer follow the
     loaded records, so neither is fixed from an empty first read. */
  const [chosenContact, setContactId] = useState<string>();
  const contactId = chosenContact ?? data.contacts[0]?.id ?? "";
  const [typedNumber, setNumber] = useState<string>();
  const [dueDays, setDueDays] = useState(21);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState<TaxCategory>("standard");
  const [busy, setBusy] = useState(false);

  const suggested = useMemo(() => {
    const numbers = data.invoices
      .map((invoice) => Number(/(\d+)/.exec(String(invoice.fields.number ?? invoice.title))?.[1] ?? 0))
      .filter((value) => value > 0);
    return `INV-${(Math.max(1000, ...numbers) + 1)}`;
  }, [data.invoices]);

  const number = typedNumber ?? suggested;

  const customer = data.contacts.find((contact) => contact.id === contactId);
  const status = statusFor(undefined, customer);
  const date = now.toISOString().slice(0, 10);
  const preview = documentTotals({
    lines: [{ id: "l1", description: description || "Line", quantity, unitPriceMinor: unit, taxCategory: category }],
    jurisdiction: org.jurisdiction,
    customerStatus: status,
    date,
  });
  const duplicate = data.invoices.some((invoice) => String(invoice.fields.number ?? invoice.title).toLowerCase() === number.trim().toLowerCase());

  return (
    <form
      id="new-invoice"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (duplicate || !number.trim()) return;
        setBusy(true);
        const due = new Date(now.getTime() + dueDays * 86_400_000);
        const created = await context.mutate.create({
          collection: "invoices",
          title: number.trim(),
          status: "draft",
          summary: description || "Draft invoice.",
          amountMinor: preview.grossMinor,
          at: now.toISOString(),
          dueAt: due.toISOString(),
          parentId: contactId || undefined,
          tags: ["draft"],
          fields: {
            number: number.trim(),
            contactId,
            netMinor: preview.netMinor,
            taxMinor: preview.taxMinor,
            customerTaxStatus: status,
            taxUnresolved: preview.hasUnknownRate,
          },
          body: writeLines([{ id: "l1", description: description || "Line", quantity, unitPriceMinor: unit, taxCategory: category, discountBp: 0 }]),
        }, `Invoice ${number.trim()} drafted`);
        context.toast("Draft invoice created", `${created.title} is a draft. It is in no statement until it is approved and posted.`);
        setBusy(false);
        close();
        context.navigate(`/o/${org.slug}/fin/invoices/${created.id}`);
      }}
    >
      <Row gap={3} wrap>
        <Field label="Invoice number" required hint={`Next free number is ${suggested}`}>
          <TextInput aria-label="Invoice number" value={number} invalid={duplicate} onChange={(event) => setNumber(event.target.value)} required />
        </Field>
        <Field label="Payment terms" hint="Days from today">
          <TextInput aria-label="Payment terms" align="end" inputMode="numeric" value={String(dueDays)} onChange={(event) => setDueDays(Number(event.target.value.replace(/\D/g, "")) || 0)} />
        </Field>
      </Row>
      {duplicate && <Notice tone="danger" title="That number is already used">Two invoices with the same number make a payment allocation ambiguous.</Notice>}
      <Field label="Customer" required hint="The tax status on the contact decides which rate the engine can resolve.">
        <Select aria-label="Customer" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
          <option value="">No customer</option>
          {data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.title}{contact.fields.taxStatus ? ` · ${String(contact.fields.taxStatus)}` : " · no tax status"}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="First line"><TextInput aria-label="First line" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Arc Lamp, brushed brass" /></Field>
        <Field label="Qty"><TextInput aria-label="Qty" align="end" inputMode="decimal" value={String(quantity)} onChange={(event) => setQuantity(Number(event.target.value.replace(/[^0-9.]/g, "")) || 0)} /></Field>
        <Field label="Unit price"><MoneyInput label="Unit price" currency={org.currency} valueMinor={unit} onChangeMinor={setUnit} /></Field>
        <Field label="Tax category">
          <Select aria-label="Tax category" value={category} onChange={(event) => setCategory(event.target.value as TaxCategory)}>
            {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
      </Row>

      <Card prov="posted" title="Resolved before you save" subtitle={`${org.jurisdiction} · ${CUSTOMER_TAX_STATUSES.find((entry) => entry.value === status)?.label} · ${context.date(date)}`}>
        <TaxSummary totals={preview} context={context} />
      </Card>

      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={duplicate || !number.trim()}>Create draft</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </form>
  );
}

export function EmailPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, totals, customer } = useInvoice(context);
  const { org } = useWorkspace();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!invoice) return <Empty title="No invoice selected" />;
  const to = String(customer?.fields.email ?? "");
  const drafted = body || `Dear ${customer?.title?.split(" ")[0] ?? "customer"},\n\nPlease find invoice ${invoice.title} for ${context.money(totals.grossMinor)}, due ${context.date(invoice.dueAt)}.\n\n${totals.byCode.map((group) => `${group.code.label}: ${context.money(group.taxMinor)} on ${context.money(group.netMinor)}`).join("\n")}\n\nWith thanks,\n${org.name}`;

  return (
    <Stack gap={4}>
      <CapabilityNotice id="email.send" title="This message cannot be sent from here" />
      <Properties rows={[
        { label: "To", value: to || "No email on the contact record" },
        { label: "Subject", value: `${org.name} · invoice ${invoice.title}` },
        { label: "Attachment", value: "The document preview below, rendered in this browser" },
      ]} />
      <Field label="Message" hint="Edit it before it is kept as a draft against the invoice.">
        <TextArea aria-label="Message" value={drafted} rows={10} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          icon={<Send size={15} />}
          disabled={!to}
          title={!to ? "The contact record has no email address" : undefined}
          onClick={async () => {
            setBusy(true);
            const existing = ((invoice.body as { reminders?: unknown[] })?.reminders ?? []) as unknown[];
            await context.mutate.patch(invoice.id, {
              body: { ...(invoice.body as object ?? {}), reminders: [...existing, { at: clockIso(), by: context.actor, to, body: drafted }] },
              fields: { ...invoice.fields, lastReminderAt: clockIso(), reminderCount: existing.length + 1 },
            }, { expectRevision: invoice.revision, event: `Reminder drafted for ${invoice.title}` });
            context.toast("Kept as a draft", `The message for ${to} is stored on the invoice. No mail provider is connected, so nothing was sent.`, "info");
            setBusy(false);
            close();
          }}
        >
          Keep as a draft
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function DocumentPreview({ context }: { context: ScreenContext }) {
  const { invoice, totals, customer, data } = useInvoice(context);
  const { org } = useWorkspace();
  if (!invoice) return <Empty title="No invoice selected" />;
  const entity = data.entities[0];

  return (
    <Stack gap={4}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)" }}>
        <Row gap={4} wrap>
          <div className="ds-grow">
            <strong style={{ fontSize: "var(--text-lg)" }}>{entity?.title ?? org.name}</strong>
            <p className="ds-subtle">{org.registration ? `Registered ${org.registration}` : "No registration recorded"}</p>
          </div>
          <div style={{ textAlign: "end" }}>
            <strong style={{ fontSize: "var(--text-lg)" }}>{invoice.status === "void" ? "VOID · " : ""}Invoice {invoice.title}</strong>
            <p className="ds-subtle">Issued {context.date(invoice.at)} · due {context.date(invoice.dueAt)}</p>
          </div>
        </Row>
        <hr className="ds-divider" />
        <Row gap={6} wrap>
          <div>
            <span className="ds-stat-label">Billed to</span>
            <p>{customer?.title ?? "No customer"}<br /><span className="ds-subtle">{String(customer?.fields.email ?? "")}</span></p>
          </div>
          <div>
            <span className="ds-stat-label">Tax treatment</span>
            <p>{totals.byCode.map((group) => group.code.label).join(", ") || "Nothing to tax"}</p>
          </div>
          <div className="ds-grow" />
          <div style={{ textAlign: "end" }}>
            <span className="ds-stat-label">Amount due</span>
            <div className="ds-stat-value">{context.money(outstandingMinor(invoice))}</div>
          </div>
        </Row>
        <hr className="ds-divider" />
        <LineTable totals={totals} context={context} data={data} />
        <hr className="ds-divider" />
        <Row gap={6} wrap>
          <div className="ds-grow">
            <span className="ds-stat-label">Notes</span>
            <p className="ds-subtle">{invoice.summary}</p>
            {totals.byCode.some((group) => group.code.note) && (
              <ul className="ds-prose">
                {totals.byCode.filter((group) => group.code.note).map((group) => <li key={group.code.code}>{group.code.code}: {group.code.note}</li>)}
              </ul>
            )}
          </div>
          <div style={{ minWidth: 260 }}>
            <StatementRow
              context={context}
              rows={[
                { label: "Net", minor: totals.netMinor },
                ...(totals.discountMinor ? [{ label: "Discount included", minor: -totals.discountMinor }] : []),
                { label: "Tax", minor: totals.taxMinor },
                { label: "Gross", minor: totals.grossMinor, bold: true },
              ]}
            />
          </div>
        </Row>
      </div>
      <Row gap={2}>
        <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>Print this preview</Button>
        <SourceNote>The preview is rendered from the invoice record in this browser. There is no PDF service and nothing is uploaded.</SourceNote>
      </Row>
    </Stack>
  );
}

export function PaymentForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, data, totals } = useInvoice(context);
  const { now } = useWorkspace();
  const paid = Number(invoice?.fields.paidMinor ?? 0);
  const outstanding = Math.max(0, totals.grossMinor - paid);
  const [amount, setAmount] = useState(outstanding);
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [busy, setBusy] = useState(false);

  const cashAccounts = data.accounts.filter((account) => account.status !== "inactive"
    && accountType(account) === "asset"
    && (account.tags.includes("cash") || accountCode(account).startsWith("10")));
  useEffect(() => { setAccountId((current) => current || cashAccounts[0]?.id || ""); }, [cashAccounts]);
  useEffect(() => { setAmount(outstanding); }, [outstanding]);

  if (!invoice) return <Empty title="No invoice selected" />;
  const ar = data.accounts.find((account) => accountCode(account) === "1100");
  const tooMuch = amount > outstanding;
  const blocked = !["awaiting_payment", "part_paid"].includes(invoice.status)
    ? "Only an issued invoice with an outstanding balance can receive a payment."
    : !ar
      ? "The chart of accounts has no 1100 receivables account."
    : !accountId
      ? "Choose the account the money arrived in."
      : amount <= 0
        ? "Enter an amount above zero."
        : tooMuch
          ? `That is more than the ${context.money(outstanding)} outstanding. Record an overpayment as a separate journal.`
          : data.locked.includes(date.slice(0, 7))
            ? `${date.slice(0, 7)} is a closed period.`
            : undefined;

  return (
    <Stack gap={4}>
      <StatementRow
        context={context}
        rows={[
          { label: "Gross invoiced", minor: totals.grossMinor },
          { label: "Already paid", minor: paid },
          { label: "Outstanding", minor: outstanding, bold: true },
        ]}
      />
      <Row gap={3} wrap>
        <Field label="Amount received" required>
          <MoneyInput label="Amount received" currency={context.org.currency} valueMinor={amount} onChangeMinor={setAmount} />
        </Field>
        <Field label="Date received" required>
          <TextInput aria-label="Date received" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Field label="Into" required>
          <Select aria-label="Into" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {cashAccounts.map((account) => <option key={account.id} value={account.id}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
        <Field label="Method">
          <Select aria-label="Method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {["Bank transfer", "Card, taken elsewhere", "Cash", "Cheque", "Offset"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
      </Row>
      <CapabilityNotice id="payment.capture" />
      {blocked && <Notice tone="warning" title="This payment cannot be recorded yet">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
          onClick={async () => {
            if (busy || blocked) return;
            setBusy(true);
            try {
              const result = prepareInvoiceReceipt({
                invoice, grossMinor: totals.grossMinor,
                amountMinor: amount, accounts: data.accounts,
                locked: data.locked, cashAccountId: accountId,
                date, method, actor: context.actor, now,
              });
              if (!result.posting) {
                context.toast("Receipt posting blocked", result.blocked ?? "Review the payment and retry.", "blocked");
                return;
              }
              const prepared = result.posting;
              await context.mutate.putMany(
                [prepared.invoice, prepared.journal],
                [
                  `Payment of ${context.money(amount)} recorded on ${invoice.title}`,
                  `Receipt posted for ${invoice.title}`,
                ],
                prepared.expectedRevisions,
                ["update", "create"],
              );
              const nextPaid = Number(prepared.invoice.fields.paidMinor ?? 0);
              context.toast(
                prepared.invoice.status === "paid" ? "Invoice settled" : "Part payment recorded",
                `${context.money(amount)} posted as a balanced receipt. Outstanding is now ${context.money(totals.grossMinor - nextPaid)}.`,
              );
              close();
            } catch (error) {
              context.toast(
                "Payment was not recorded",
                error instanceof Error ? error.message : "This invoice changed. Reopen the record and retry.",
                "failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Post the receipt
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function VoidReason({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, data, totals } = useInvoice(context);
  const { now } = useWorkspace();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!invoice) return <Empty title="No invoice selected" />;

  const journal = data.journals.find((item) => item.id === String(invoice.fields.journalId ?? ""));
  const paid = Number(invoice.fields.paidMinor ?? 0);
  const creditNoteNeeded = invoice.status === "paid" || paid > 0;

  if (invoice.status === "void") {
    return <Notice tone="warning" title="This invoice is already void">{String(invoice.fields.voidReason ?? "No reason was recorded.")}</Notice>;
  }

  return (
    <Stack gap={4}>
      {creditNoteNeeded ? (
        <Notice tone="warning" title="A settled invoice is corrected with a credit note">
          {context.money(paid)} has been received against {invoice.title}. Voiding it in place would leave the receipt without an invoice. A credit note is raised instead: a linked document with the lines reversed, which keeps both on the record.
        </Notice>
      ) : (
        <Notice tone="info" title="Voiding keeps the number">
          {invoice.title} stays in the list as void with your reason, so the numbering has no gap. {journal ? "Its posted journal is reversed at the same time." : "Nothing is posted, so no reversal is needed."}
        </Notice>
      )}
      <Field label="Reason" required hint="Recorded on the document and in the audit trail.">
        <TextArea aria-label="Reason" value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required />
      </Field>
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            if (creditNoteNeeded) {
              const credited = await context.mutate.create({
                collection: "invoices",
                title: `CN-${invoice.title}`,
                status: "draft",
                summary: `Credit note against ${invoice.title}: ${reason}`,
                amountMinor: -totals.grossMinor,
                at: now.toISOString(),
                dueAt: now.toISOString(),
                parentId: invoice.parentId,
                tags: ["credit-note"],
                fields: {
                  number: `CN-${invoice.title}`,
                  contactId: String(invoice.fields.contactId ?? ""),
                  creditsInvoiceId: invoice.id,
                  netMinor: -totals.netMinor,
                  taxMinor: -totals.taxMinor,
                  customerTaxStatus: String(invoice.fields.customerTaxStatus ?? "domestic"),
                  reason,
                },
                body: writeLines(totals.lines.map((line) => ({ ...line, quantity: -line.quantity }))),
              }, `Credit note raised against ${invoice.title}`);
              await context.mutate.patch(invoice.id, {
                fields: { ...invoice.fields, creditNoteId: credited.id },
              }, { expectRevision: invoice.revision, event: `${invoice.title} credited by ${credited.title}` });
              context.toast("Credit note drafted", `${credited.title} reverses the lines of ${invoice.title}. Approve it to post the correction.`);
            } else {
              if (journal && journal.status === "posted") {
                const reversal = journalLinesFor(journal);
                const created = await context.mutate.create({
                  collection: "journals",
                  title: `Reversal · ${journal.title}`,
                  status: "posted",
                  summary: `Reverses ${journal.title} because ${invoice.title} was voided: ${reason}`,
                  amountMinor: reversal.reduce((sum, line) => sum + line.debitMinor, 0),
                  at: now.toISOString(),
                  parentId: journal.id,
                  tags: ["ledger", "reversal"],
                  fields: { date: now.toISOString().slice(0, 10), source: "reversal", reversesId: journal.id, reason },
                  body: { date: now.toISOString().slice(0, 10), memo: `Reversal of ${journal.title}`, lines: reversal, reversesId: journal.id },
                }, `Reversed ${journal.title}`);
                await context.mutate.patch(journal.id, { status: "reversed", fields: { ...journal.fields, reversedBy: created.id } }, { event: `${journal.title} marked reversed` });
              }
              await context.mutate.patch(invoice.id, {
                status: "void",
                fields: { ...invoice.fields, voidReason: reason, voidedBy: context.actor, voidedAt: now.toISOString() },
              }, { expectRevision: invoice.revision, event: `${invoice.title} voided` });
              context.toast("Invoice voided", journal ? "Its journal was reversed, so the ledger still balances." : "Nothing was posted, so no ledger entry changed.");
            }
            setBusy(false);
            close();
          }}
        >
          {creditNoteNeeded ? "Raise a credit note" : "Void the invoice"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

function journalLinesFor(journal: Rec): JLine[] {
  const body = journal.body as { lines?: JLine[] } | undefined;
  return (body?.lines ?? []).map((line) => ({
    accountId: line.accountId,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
    memo: `Reversal of ${journal.title}`,
  }));
}

export function BulkActionPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const rows = (payload?.ids ?? []).map((id) => data.invoices.find((invoice) => invoice.id === id)).filter((invoice): invoice is Rec => Boolean(invoice));
  const eligible = rows.filter((invoice) => ["awaiting_payment", "part_paid"].includes(invoice.status) && contactOf(data, invoice)?.fields.email);
  const skipped = rows.filter((invoice) => !eligible.includes(invoice));
  const [busy, setBusy] = useState(false);

  if (rows.length === 0) {
    return <Empty title="Nothing selected">Tick invoices in the list, then choose Draft reminders.</Empty>;
  }

  return (
    <Stack gap={4}>
      <CapabilityNotice id="email.send" title="Reminders are drafted, never sent" />
      <Properties rows={[
        { label: "Selected", value: String(rows.length) },
        { label: "Will be drafted", value: String(eligible.length) },
        { label: "Skipped", value: String(skipped.length) },
      ]} />
      {skipped.length > 0 && (
        <Notice tone="warning" title={`${skipped.length} invoice${skipped.length === 1 ? "" : "s"} skipped`}>
          {skipped.map((invoice) => `${invoice.title} (${invoice.status === "paid" ? "already paid" : invoice.status === "draft" ? "still a draft" : contactOf(data, invoice)?.fields.email ? invoice.status : "no email on the contact"})`).join(", ")}
        </Notice>
      )}
      <DataGrid
        rows={eligible}
        rowId={(row) => row.id}
        label="Invoices that will get a reminder draft"
        filterable={false}
        columns={[
          { key: "number", header: "Invoice", primary: true, cell: (row) => row.title },
          { key: "to", header: "To", cell: (row) => String(contactOf(data, row)?.fields.email ?? "") },
          { key: "already", header: "Reminders so far", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.reminderCount ?? 0)}</span> },
          { key: "amount", header: "Outstanding", align: "end", cell: (row) => <Amount minor={outstandingMinor(row)} context={context} /> },
        ]}
      />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={eligible.length === 0}
          onClick={async () => {
            setBusy(true);
            for (const invoice of eligible) {
              const to = String(contactOf(data, invoice)?.fields.email ?? "");
              const existing = ((invoice.body as { reminders?: unknown[] })?.reminders ?? []) as unknown[];
              await context.mutate.patch(invoice.id, {
                body: {
                  ...(invoice.body as object ?? {}),
                  reminders: [...existing, {
                    at: clockIso(),
                    by: context.actor,
                    to,
                    body: `${invoice.title} for ${context.money(outstandingMinor(invoice))} was due ${context.date(invoice.dueAt)}.`,
                  }],
                },
                fields: { ...invoice.fields, lastReminderAt: clockIso(), reminderCount: existing.length + 1 },
              }, { event: `Reminder drafted for ${invoice.title}` });
            }
            context.toast("Reminders drafted", `${eligible.length} drafts are stored on their invoices. Nothing has been sent.`, "info");
            setBusy(false);
            close();
          }}
        >
          Draft {eligible.length} reminder{eligible.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ReminderApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const candidates = openInvoices(data.invoices).filter((invoice) => invoice.dueAt && new Date(invoice.dueAt) < now);
  const [chosen, setChosen] = useState<string[]>(candidates.map((invoice) => invoice.id));

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Approving a reminder writes a draft, not a message">
        Each approved invoice gets a reminder record with its recipient and body. No mail provider is connected, so the same reminder cannot be sent twice by mistake.
      </Notice>
      {candidates.length === 0 ? <Empty title="Nothing is overdue" /> : (
        <Stack gap={2}>
          {candidates.map((invoice) => (
            <Row key={invoice.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={`${invoice.title} · ${contactOf(data, invoice)?.title ?? "no customer"}`}
                checked={chosen.includes(invoice.id)}
                onChange={(event) => setChosen((current) => (event.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id)))}
              />
              <span className="ds-grow" />
              <span className="ds-subtle">{daysOverdue(invoice, now)} days late</span>
              <Amount minor={outstandingMinor(invoice)} context={context} />
            </Row>
          ))}
        </Stack>
      )}
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={chosen.length === 0}
          onClick={() => { context.openOverlay("bulk action preview", { ids: chosen, action: "reminder" }); }}
        >
          Review {chosen.length} reminder{chosen.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function InvoiceInspector({ context }: { context: ScreenContext }) {
  const { invoice, totals, customer, data } = useInvoice(context);
  const { org } = useWorkspace();
  if (!invoice) return <Empty title="No invoice" />;
  const deal = String(invoice.fields.dealId ?? "");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Status", value: <StatusPill status={invoice.status} /> },
        { label: "Revision", value: String(invoice.revision) },
        { label: "Owner", value: invoice.ownerName },
        { label: "Customer", value: customer?.title ?? "Not linked" },
        { label: "Jurisdiction", value: org.jurisdiction },
        { label: "Tax codes", value: totals.byCode.map((group) => group.code.code).join(", ") || "None" },
      ]} />
      {totals.hasUnknownRate && (
        <Notice tone="danger" title="Unresolved rate">
          This invoice cannot be approved until every line resolves to an approved code.
        </Notice>
      )}
      {deal && (
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/crm/deals/${deal}`)}>Open the linked deal</Button>
      )}
      {invoice.fields.creditNoteId && (
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/fin/invoices/${String(invoice.fields.creditNoteId)}`)}>Open the credit note</Button>
      )}
      {invoice.fields.creditsInvoiceId && (
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/fin/invoices/${String(invoice.fields.creditsInvoiceId)}`)}>Open the invoice this credits</Button>
      )}
      <SourceNote>
        {data.journals.filter((journal) => String(journal.fields.invoiceId ?? "") === invoice.id).length} ledger journals reference this invoice.
      </SourceNote>
    </Stack>
  );
}

/** Approving a draft invoice freezes a version and posts the balanced journal. */
export function ApproveInvoice({ context, close }: { context: ScreenContext; close: () => void }) {
  const { invoice, data, totals } = useInvoice(context);
  const [busy, setBusy] = useState(false);
  if (!invoice) return <Empty title="No invoice selected" />;

  if (invoice.status !== "draft") {
    return (
      <Notice tone="warning" title={`${invoice.title} is already ${invoice.status.replace(/_/g, " ")}`}>
        An issued invoice is immutable. Correct it with a credit note from the Void action.
      </Notice>
    );
  }

  const posting = issueLines(data, totals, invoice);
  const period = (invoice.at ?? context.now.toISOString()).slice(0, 7);
  const gate = posting.problem ? undefined : checkPosting({ lines: posting.lines, period, locked: data.locked, accounts: data.accounts });
  const blocked = posting.problem
    ?? (totals.grossMinor <= 0 ? "The invoice has no positive value to post." : undefined)
    ?? gate?.reason;

  return (
    <Stack gap={4}>
      <Notice tone={blocked ? "danger" : "info"} title={blocked ? "This invoice cannot be approved" : "Approving posts a balanced journal"}>
        {blocked ?? "Receivables are debited with the gross, each revenue account is credited with its net, and the tax control account takes the resolved tax. The invoice then becomes immutable."}
      </Notice>
      {!blocked && (
        <div className="ds-grid-wrap">
          <div className="ds-grid-scroll">
            <table className="ds-table">
              <caption className="ds-sr-only">Journal that will be posted</caption>
              <thead><tr><th>Account</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
              <tbody>
                {posting.lines.map((line, index) => {
                  const account = data.accounts.find((item) => item.id === line.accountId);
                  return (
                    <tr key={`${line.accountId}-${index}`}>
                      <td className="ds-table-primary">{account ? `${String(account.fields.code)} ${account.title}` : "Account missing"}</td>
                      <td data-align="end" className="ds-num">{line.debitMinor ? context.money(line.debitMinor) : "—"}</td>
                      <td data-align="end" className="ds-num">{line.creditMinor ? context.money(line.creditMinor) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "start" }}>Totals</th>
                  <td data-align="end" className="ds-num">{context.money(posting.lines.reduce((sum, line) => sum + line.debitMinor, 0))}</td>
                  <td data-align="end" className="ds-num">{context.money(posting.lines.reduce((sum, line) => sum + line.creditMinor, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <Button
        variant="primary"
        busy={busy}
        disabled={Boolean(blocked) || !context.can("post_journal")}
        title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
        onClick={async () => {
          if (busy || blocked) return;
          setBusy(true);
          try {
            const result = prepareInvoiceIssue({
              invoice, totals, lines: posting.lines,
              accounts: data.accounts, locked: data.locked,
              actor: context.actor, now: context.now,
            });
            if (!result.posting) {
              context.toast("Invoice posting blocked", result.blocked ?? "Review this invoice before posting.", "blocked");
              return;
            }
            const prepared = result.posting;
            // Invoice and posted journal become visible together, or neither
            // does; a stale revision cannot leave an unlinked ledger entry.
            await context.mutate.putMany(
              [prepared.invoice, prepared.journal],
              [
                `${invoice.title} approved by ${context.actor} and issued`,
                `Issued ${invoice.title} and posted a balanced journal`,
              ],
              prepared.expectedRevisions,
              ["update", "create"],
            );
            context.toast("Invoice issued", `${context.money(totals.grossMinor)} is on the ledger as a balanced journal. The invoice is now immutable.`);
            close();
          } catch (error) {
            context.toast(
              "Invoice was not issued",
              error instanceof Error ? error.message : "The record changed. Reopen the invoice and retry.",
              "failed",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Approve and post {context.money(totals.grossMinor)}
      </Button>
    </Stack>
  );
}
