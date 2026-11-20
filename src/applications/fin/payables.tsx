import { useMemo, useRef, useState } from "react";
import { Paperclip, Receipt, Upload } from "lucide-react";
import {
  Button, Card, DataGrid, DrawerActions, DrawerUnsavedChanges, Empty, FactGrid, Field, ModalActions, ModalInFlight, MoneyInput, Notice, OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, Pill, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import { newRecord, revisedRecord } from "@/platform/repo";
import type { Rec } from "@/domain/types";
import { accountCode, accountType, ageBuckets, daysOverdue, periodOf } from "@/domain/fin-ledger";
import type { JLine } from "@/domain/fin-ledger";
import { TAX_CATEGORIES, documentTotals } from "@/domain/fin-invoice";
import type { TaxCategory } from "@/domain/fin-invoice";
import { supplierOf, useFinData } from "./data";
import type { FinData } from "./data";
import { Amount, CapabilityNotice, OverdueBadge, SourceNote, StatementRow, TaxCodePill } from "./parts";

/* ---------------------------- FIN-006 ---------------------------- */

const BILL_TABS: Record<string, (bill: Rec, now: Date) => boolean> = {
  Inbox: (bill) => ["inbox", "captured"].includes(bill.status),
  Due: (bill, now) => !["paid", "void"].includes(bill.status) && Boolean(bill.dueAt) && new Date(bill.dueAt!) <= new Date(now.getTime() + 14 * 86_400_000),
  Approved: (bill) => ["approved", "scheduled"].includes(bill.status),
  Paid: (bill) => bill.status === "paid",
  Exceptions: (bill) => Boolean(bill.fields.exception) || bill.status === "exception",
};

export function BillsTable({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const rows = useMemo(
    () => data.bills.filter((bill) => (BILL_TABS[tab] ?? (() => true))(bill, now)).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    [data.bills, tab, now],
  );
  const unpaid = data.bills.filter((bill) => !["paid", "void"].includes(bill.status));
  const total = rows.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0);

  if (rows.length === 0) {
    return (
      <Empty title={`No bills in ${tab.toLowerCase()}`} icon={<Receipt size={20} />}
        action={tab === "Inbox" ? <Button variant="primary" onClick={() => context.openOverlay("Bill capture")}>Upload a bill</Button> : undefined}>
        {tab === "Exceptions" ? "No bill is flagged as a duplicate, unmatched or past due without approval." : "Bills arrive here when they are captured."}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label={`${tab}`} value={String(rows.length)} meta={`${data.bills.length} bills in total`} />
        <Stat prov="posted" label="Value in view" value={context.money(total)} />
        <Stat prov="human" label="Unpaid overall" value={context.money(unpaid.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0))} meta={`${unpaid.length} bills`} />
        <Stat prov="human" label="Past due" value={String(unpaid.filter((bill) => daysOverdue(bill, now)).length)} meta="Beyond the supplier's terms" />
      </StatRow>

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} bills`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.fields.exception ? "danger" : daysOverdue(row, now) ? "warning" : undefined)}
        columns={[
          { key: "number", header: "Bill", primary: true, width: "120px", cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "supplier", header: "Supplier", cell: (row) => {
            const supplier = supplierOf(data, row);
            return supplier ? supplier.title : <Pill tone="danger">No supplier match</Pill>;
          }, filterValue: (row) => supplierOf(data, row)?.title ?? "" },
          { key: "received", header: "Received", hideBelow: 1200, cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "due", header: "Due", cell: (row) => <OverdueBadge record={row} context={context} />, sortValue: (row) => row.dueAt ?? "" },
          { key: "status", header: "Status", cell: (row) => (
            <Pill tone={row.status === "paid" ? "success" : row.status === "exception" ? "danger" : row.status === "approved" || row.status === "scheduled" ? "info" : "neutral"} dot>
              {row.status}
            </Pill>
          ), filterValue: (row) => row.status },
          { key: "attachment", header: "Attached", hideBelow: 900, cell: (row) => (row.body ? <Paperclip size={14} aria-label="Attachment held locally" /> : <span className="ds-subtle">—</span>) },
          { key: "net", header: "Net", align: "end", hideBelow: 1400, cell: (row) => <Amount minor={Number(row.fields.netMinor ?? 0)} context={context} /> },
          { key: "tax", header: "Tax", align: "end", hideBelow: 1400, cell: (row) => <Amount minor={Number(row.fields.taxMinor ?? 0)} context={context} /> },
          { key: "amount", header: "Gross", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("match inspector", { id }); }}
        bulkActions={[
          {
            label: "Approve",
            disabled: (selected) => !context.can("approve_payment") || selected.every((bill) => bill.status === "paid" || bill.fields.exception),
            onRun: async (selected) => {
              let approved = 0;
              let refused = 0;
              for (const bill of selected) {
                if (bill.status === "paid" || bill.fields.exception || !bill.fields.supplierId) { refused += 1; continue; }
                const saved2 = await context.mutate.patch(bill.id, { status: "approved", fields: { ...bill.fields, approvedBy: context.actor } }, { event: `Bill ${bill.title} approved` });
                if (!saved2) return;
                approved += 1;
              }
              context.toast(approved ? "Bills approved" : "Nothing approved",
                `${approved} approved. ${refused} refused: a bill with an exception or no supplier match cannot be approved.`,
                refused && !approved ? "blocked" : "ok");
            },
          },
          {
            label: "Schedule payment",
            disabled: (selected) => !context.can("approve_payment") || selected.every((bill) => bill.status !== "approved"),
            onRun: (selected) => context.openOverlay("payment authorization", { ids: selected.filter((bill) => bill.status === "approved").map((bill) => bill.id) }),
          },
        ]}
        summary={<Amount minor={total} context={context} bold />}
      />

      <Card prov="human" title="Payables ageing" subtitle="Unpaid bills by days past due">
        <Stack gap={2}>
          {ageBuckets(unpaid, now).map((bucket) => (
            <Row key={bucket.bucket} gap={3}>
              <span className="ds-grow">{bucket.bucket}</span>
              <span className="ds-subtle ds-num">{bucket.count}</span>
              <Amount minor={bucket.amountMinor} context={context} />
            </Row>
          ))}
          <SourceNote>Computed from {unpaid.length} unpaid bill records at {context.date(now)}. Approval is a local control, not an account security boundary.</SourceNote>
        </Stack>
      </Card>
    </Stack>
  );
}

export function BillCapture({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now, org } = useWorkspace();
  const [number, setNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [net, setNet] = useState(0);
  const [category, setCategory] = useState<TaxCategory>("standard");
  const [accountCodeValue, setAccountCodeValue] = useState("6100");
  const [dueDays, setDueDays] = useState(30);
  const [note, setNote] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const totals = documentTotals({
    lines: [{ id: "l1", description: note || "Bill", quantity: 1, unitPriceMinor: net, taxCategory: category }],
    jurisdiction: org.jurisdiction,
    customerStatus: "domestic",
    date: now.toISOString().slice(0, 10),
  });
  const duplicate = data.bills.find((bill) =>
    Number(bill.amountMinor ?? 0) === totals.grossMinor
    && String(bill.fields.supplierId ?? "") === supplierId
    && supplierId !== "");
  const expenseAccounts = data.accounts.filter((account) => ["expense", "asset"].includes(accountType(account)) && account.status !== "inactive");

  return (
    <form
      id="bill-capture"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!number.trim()) return;
        setBusy(true);
        const due = new Date(now.getTime() + dueDays * 86_400_000);
        const fields: Record<string, string | number | boolean> = {
          number: number.trim(),
          netMinor: totals.netMinor,
          taxMinor: totals.taxMinor,
          taxCategory: category,
          accountCode: accountCodeValue,
        };
        if (supplierId) fields.supplierId = supplierId;
        else fields.exception = "No supplier match";
        if (duplicate) fields.exception = `Possible duplicate of ${duplicate.title}`;
        const created = await context.mutate.create({
          collection: "bills",
          title: number.trim(),
          status: supplierId && !duplicate ? "inbox" : "exception",
          summary: note || "Captured by hand in this workspace.",
          amountMinor: totals.grossMinor,
          at: now.toISOString(),
          dueAt: due.toISOString(),
          fields,
          body: filename ? { attachment: { filename, pages: 1, capturedAt: now.toISOString(), kept: "local" } } : { attachment: null },
        }, `Bill ${number.trim()} captured`);
        context.toast(
          "Bill captured",
          duplicate
            ? `${created.title} looks like a duplicate of ${duplicate.title} and is held as an exception.`
            : supplierId
              ? `${created.title} is in the inbox awaiting approval. Nothing is posted to the ledger yet.`
              : `${created.title} has no supplier match and is held as an exception.`,
          duplicate || !supplierId ? "blocked" : "ok",
        );
        setBusy(false);
        close();
      }}
    >
      <Notice tone="info" title="Capture is manual here">
        There is no document-extraction service connected. The fields below are what you type; the file name is recorded so the paper can be found again.
      </Notice>
      <div className="fin-form-grid">
        <Field label="Bill number" required><TextInput aria-label="Bill number" value={number} onChange={(event) => setNumber(event.target.value)} required placeholder="BILL-255" /></Field>
        <Field label="Terms" hint="Days from today"><TextInput aria-label="Terms" align="end" inputMode="numeric" value={String(dueDays)} onChange={(event) => setDueDays(Number(event.target.value.replace(/\D/g, "")) || 0)} /></Field>
      </div>
      <Field label="Supplier" hint="A bill with no supplier record is held as an exception rather than guessed.">
        <Select aria-label="Supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
          <option value="">No match</option>
          {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.title} · {String(supplier.fields.terms ?? "")}</option>)}
        </Select>
      </Field>
      <div className="fin-form-grid">
        <Field label="Net amount"><MoneyInput label="Net amount" currency={org.currency} valueMinor={net} onChangeMinor={setNet} /></Field>
        <Field label="Tax category">
          <Select aria-label="Tax category" value={category} onChange={(event) => setCategory(event.target.value as TaxCategory)}>
            {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
        <Field label="Post to">
          <Select aria-label="Post to" value={accountCodeValue} onChange={(event) => setAccountCodeValue(event.target.value)}>
            {expenseAccounts.map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="File name" hint="The document stays wherever you keep it. Nothing is uploaded.">
        <TextInput aria-label="File name" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="bill-255.pdf" />
      </Field>
      <Field label="What it is for"><TextArea aria-label="What it is for" value={note} rows={2} onChange={(event) => setNote(event.target.value)} /></Field>

      <Card prov="posted" title="Resolved tax" subtitle={`${org.jurisdiction} rules at ${context.date(now)}`}>
        <Row gap={3} wrap>
          {totals.byCode.map((group) => (
            <span key={group.code.code} className="ds-row ds-gap-2">
              <TaxCodePill code={group.code} />
              <Amount minor={group.taxMinor} context={context} />
            </span>
          ))}
          <span className="ds-grow" />
          <span>Gross <Amount minor={totals.grossMinor} context={context} bold /></span>
        </Row>
      </Card>

      {duplicate && (
        <Notice tone="danger" title={`This looks like ${duplicate.title}`}>
          Same supplier and same gross amount. It will be captured as an exception so it cannot be approved by accident.
        </Notice>
      )}

      <OverlayActions
        primary={<Button type="submit" variant="primary" busy={busy} icon={<Upload size={15} />} disabled={!number.trim()}>Capture the bill</Button>}
        end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
      />
    </form>
  );
}

export function MatchInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const bill = data.bills.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [supplierId, setSupplierId] = useState(String(bill?.fields.supplierId ?? ""));
  const [busy, setBusy] = useState(false);
  if (!bill) return <Empty title="Select a bill first" />;

  const supplier = supplierOf(data, bill);
  const journal = data.journals.find((item) => item.id === String(bill.fields.journalId ?? ""));
  const similar = data.bills.filter((item) => item.id !== bill.id && Number(item.amountMinor ?? 0) === Number(bill.amountMinor ?? 0));
  const attachment = (bill.body as { attachment?: { filename?: string; capturedAt?: string } } | undefined)?.attachment;

  const needsMatch = !bill.fields.supplierId;
  const canApprove = context.can("approve_payment") && !bill.fields.exception && !needsMatch && bill.status !== "paid";
  const run = async (task: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await task(); close(); }
    catch (error) { context.toast(failure, error instanceof Error ? error.message : "This bill changed. Reopen it and retry.", "failed"); }
    finally { setBusy(false); }
  };
  const saveMatch = (
    <Button
      variant={needsMatch ? "primary" : "secondary"}
      busy={busy}
      disabled={!supplierId || supplierId === String(bill.fields.supplierId ?? "")}
      onClick={() => run(async () => {
        const fields: Record<string, string | number | boolean> = { ...bill.fields, supplierId };
        if (String(fields.exception ?? "") === "No supplier match") delete fields.exception;
        const saved3 = await context.mutate.patch(bill.id, {
          status: fields.exception ? bill.status : "inbox",
          fields,
        }, { replaceFields: true, expectRevision: bill.revision, event: `Bill ${bill.title} matched to a supplier` });
        if (!saved3) return;
        context.toast("Supplier matched", `${bill.title} now belongs to ${data.suppliers.find((item) => item.id === supplierId)?.title}.`);
      }, "The match was not saved")}
    >
      Save the match
    </Button>
  );
  const approve = (
    <Button
      variant={needsMatch ? "secondary" : "primary"}
      busy={busy}
      disabled={!canApprove}
      title={bill.fields.exception ? String(bill.fields.exception) : needsMatch ? "Match a supplier first" : undefined}
      onClick={() => run(async () => {
        const saved4 = await context.mutate.patch(bill.id, { status: "approved", fields: { ...bill.fields, approvedBy: context.actor } }, { expectRevision: bill.revision, event: `Bill ${bill.title} approved` });
        if (!saved4) return;
        context.toast("Bill approved", `${bill.title} is approved for payment by ${context.actor}. No money has moved.`);
      }, "The bill was not approved")}
    >
      Approve
    </Button>
  );

  return (
    <Stack gap={4}>
      <DrawerUnsavedChanges when={supplierId !== String(bill.fields.supplierId ?? "")} />
      <OverlaySummary
        eyebrow="Bill"
        title={<span className="ds-num">{bill.title}</span>}
        status={<Pill tone={bill.status === "paid" ? "success" : bill.status === "exception" ? "danger" : "neutral"} dot>{bill.status}</Pill>}
        meta={[supplier?.title ?? "No supplier matched", `Due ${context.date(bill.dueAt)}`, journal ? `Posted: ${journal.title}` : "Nothing posted to the ledger"]}
      />

      {bill.fields.exception && (
        <Notice tone="danger" title={String(bill.fields.exception)}>
          A bill in exception cannot be approved. Match the supplier, or confirm it is not a duplicate, first.
        </Notice>
      )}

      {similar.length > 0 && (
        <Notice tone="warning" title={`${similar.length} other bill${similar.length === 1 ? " has" : "s have"} the same gross amount`}>
          {similar.map((item) => `${item.title} (${item.status}, due ${context.date(item.dueAt)})`).join(", ")}
        </Notice>
      )}

      <FactGrid columns={3} items={[
        { label: "Net", value: <Amount minor={Number(bill.fields.netMinor ?? 0)} context={context} />, mono: true },
        { label: "Tax", value: <Amount minor={Number(bill.fields.taxMinor ?? 0)} context={context} />, mono: true },
        { label: "Gross", value: <Amount minor={bill.amountMinor} context={context} bold />, mono: true, tone: "accent" },
      ]} />

      <OverlaySection title="Supplier match" hint={`Attachment: ${attachment?.filename ? `${attachment.filename}, kept locally` : "none recorded"}`}>
        <Field label="Match to a supplier">
          <Select aria-label="Match to a supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">No match</option>
            {data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      </OverlaySection>

      <DrawerActions>
        <OverlayActions
          primary={needsMatch ? saveMatch : approve}
          secondary={needsMatch ? approve : saveMatch}
          end={<>
            <Button
              variant="outline-danger"
              busy={busy}
              disabled={bill.status === "paid"}
              onClick={() => run(async () => {
                const saved5 = await context.mutate.patch(bill.id, { status: "exception", fields: { ...bill.fields, exception: "Held for query" } }, { expectRevision: bill.revision, event: `Bill ${bill.title} held for query` });
                if (!saved5) return;
                context.toast("Held for query", `${bill.title} is in exceptions until someone clears it.`, "blocked");
              }, "The bill was not held")}
            >
              Hold for query
            </Button>
            <OverlayCancel disabled={busy}>Close</OverlayCancel>
          </>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function PaymentAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const chosen = (payload?.ids ?? data.bills.filter((bill) => bill.status === "approved").map((bill) => bill.id))
    .map((id) => data.bills.find((bill) => bill.id === id))
    .filter((bill): bill is Rec => Boolean(bill));
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  // Revisions as they were when this dialog opened; a bill changed since then is a conflict.
  const openedRevisions = useRef<Record<string, number>>({});
  for (const bill of chosen) if (openedRevisions.current[bill.id] === undefined) openedRevisions.current[bill.id] = bill.revision;
  const payableNow = (bill: Rec) => ["approved", "scheduled"].includes(bill.status) && Boolean(bill.fields.approvedBy);
  const payable = chosen.filter(payableNow);
  const excluded = chosen.filter((bill) => !payableNow(bill));
  // The bills this run was opened with; if any of them changes, the whole run stops.
  const openedIds = useRef<string[] | undefined>(undefined);
  if (!openedIds.current && payable.length > 0) openedIds.current = payable.map((bill) => bill.id);
  const why = (bill: Rec) => !["approved", "scheduled"].includes(bill.status) ? `${bill.title} is ${bill.status}, not approved` : `${bill.title} has no recorded approver`;

  const cash = data.accounts.filter((account) => accountType(account) === "asset" && (account.tags.includes("cash") || accountCode(account).startsWith("10")));
  const ap = data.accounts.find((account) => accountCode(account) === "2000");
  const total = payable.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0);
  const blocked = !ap
    ? "The chart of accounts has no 2000 payables account."
    : payable.length === 0
      ? "No selected bill is approved with a recorded approver."
      : data.locked.includes(periodOf(date))
        ? `${periodOf(date)} is a closed period.`
        : undefined;

  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Notice tone="warning" title="This records a payment, it does not make one">
        No bank mandate exists in this workspace. Confirming below posts the ledger entry for money you have already sent, and marks the bills paid.
      </Notice>
      <div className="fin-form-grid">
        <Field label="Payment date" required><TextInput aria-label="Payment date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
        <Field label="Paid from" required>
          <Select aria-label="Paid from" value={accountId || cash[0]?.id || ""} onChange={(event) => setAccountId(event.target.value)}>
            {cash.map((account) => <option key={account.id} value={account.id}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
      </div>
      {excluded.length > 0 && (
        <Notice tone="warning" title={`${excluded.length} bill${excluded.length === 1 ? " is" : "s are"} left out of this run`}>
          {excluded.map(why).join("; ")}. Approve {excluded.length === 1 ? "it" : "them"} from the bill drawer first.
        </Notice>
      )}
      <DataGrid
        rows={payable}
        rowId={(row) => row.id}
        label="Bills to pay"
        filterable={false}
        columns={[
          { key: "bill", header: "Bill", primary: true, cell: (row) => row.title },
          { key: "supplier", header: "Supplier", cell: (row) => supplierOf(data, row)?.title ?? "Not matched" },
          { key: "due", header: "Due", cell: (row) => context.date(row.dueAt) },
          { key: "approved", header: "Approved by", cell: (row) => String(row.fields.approvedBy ?? "Not approved") },
          { key: "amount", header: "Gross", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
        ]}
        summary={<Amount minor={total} context={context} bold />}
      />
      {blocked && <Notice tone="danger" title="This cannot be posted">{blocked}</Notice>}
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("approve_payment") || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
          onClick={async () => {
            if (!ap || busy) return;
            const from = accountId || cash[0]?.id;
            if (!from) return;
            setBusy(true);
            try {
              // Re-read every bill now: one paid or changed elsewhere stops the whole run.
              const ids = openedIds.current ?? payable.map((bill) => bill.id);
              const live = ids.map((id) => data.bills.find((item) => item.id === id));
              const stale = live.some((bill, index) => !bill || !payableNow(bill) || bill.revision !== openedRevisions.current[ids[index]]);
              if (stale) {
                context.toast("Payment run stopped", "A bill in this run changed or was already paid. Nothing was posted; reopen the run to review it.", "blocked");
                return;
              }
              const ctx = { actor: context.actor, now: clockIso(), screenId: context.screen.id };
              const lines: JLine[] = [
                { accountId: ap.id, debitMinor: total, creditMinor: 0, memo: `Paid ${payable.length} bills` },
                { accountId: from, debitMinor: 0, creditMinor: total, memo: `Paid ${payable.length} bills` },
              ];
              const journal = newRecord({
                organizationId: context.org.id,
                currency: context.org.currency,
                collection: "journals",
                title: `Supplier payment run ${date}`,
                status: "posted",
                summary: `${ids.length} bills settled: ${(live as Rec[]).map((bill) => bill.title).join(", ")}.`,
                amountMinor: total,
                at: `${date}T09:00:00.000Z`,
                tags: ["ledger", "payment"],
                fields: { date, source: "payment-run" },
                body: { date, memo: `Supplier payment run`, lines },
              }, ctx);
              const paid = (live as Rec[]).map((bill) => revisedRecord(bill, {
                status: "paid",
                fields: { ...bill.fields, paymentJournalId: journal.id, paidAt: `${date}T09:00:00.000Z` },
              }, ctx));
              // Journal and every bill commit together, against the revisions this dialog opened with.
              await context.mutate.putMany(
                [journal, ...paid],
                [`Supplier payment run posted for ${context.money(total)}`, ...paid.map((bill) => `Bill ${bill.title} marked paid`)],
                Object.fromEntries(ids.map((id) => [id, openedRevisions.current[id]])),
                ["create", ...paid.map(() => "update" as const)],
              );
              context.toast("Payment recorded", `${context.money(total)} posted against payables and cash. ${payable.length} bills are marked paid.`);
              close();
            } catch (error) {
              context.toast("Payment not recorded", error instanceof Error ? error.message : "A bill changed. Reopen the run and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Record the payment of {context.money(total)}
        </Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}

/* ---------------------------- FIN-007 ---------------------------- */

const EXPENSE_TABS: Record<string, (expense: Rec, actor: string) => boolean> = {
  "My expenses": (expense, actor) => expense.ownerName === actor || String(expense.fields.claimant ?? "") === actor,
  "Team review": (expense) => ["review", "submitted"].includes(expense.status),
  Approved: (expense) => expense.status === "approved",
  Reimbursed: (expense) => expense.status === "reimbursed",
};

export function ExpensesTable({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useFinData();
  const rows = useMemo(
    () => data.expenses.filter((expense) => (EXPENSE_TABS[tab] ?? (() => true))(expense, context.actor))
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [data.expenses, tab, context.actor],
  );
  const total = rows.reduce((sum, expense) => sum + Number(expense.amountMinor ?? 0), 0);
  const noReceipt = rows.filter((expense) => expense.fields.hasReceipt === false);

  if (rows.length === 0) {
    return (
      <Empty title={`No claims in ${tab.toLowerCase()}`} icon={<Receipt size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Receipt capture")}>Upload a receipt</Button>}>
        {tab === "My expenses" ? `Nothing is claimed by ${context.actor}. A claim needs a receipt above 1.00.` : "Claims appear here as they move through approval."}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label={tab} value={String(rows.length)} meta={`${data.expenses.length} claims in total`} />
        <Stat prov="posted" label="Value in view" value={context.money(total)} />
        <Stat prov="human" label="Without a receipt" value={String(noReceipt.length)} meta={noReceipt.length ? "Cannot be approved" : "Every claim has one"} />
        <Stat prov="human" label="Recoverable tax" value={context.money(rows.reduce((sum, expense) => sum + recoverableTax(expense, context.org.jurisdiction, context.now), 0))} meta="Only where the category allows it" />
      </StatRow>

      {tab === "My expenses" && (
        <Notice tone="info" title="You see your own claims here">
          Team review shows what others have submitted. A role view shapes what this interface offers; it is not an account security boundary, so do not treat it as privacy for sensitive claims.
        </Notice>
      )}

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} expense claims`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.fields.hasReceipt === false ? "danger" : row.fields.policyNote ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Claim", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "claimant", header: "Claimant", cell: (row) => String(row.fields.claimant ?? row.ownerName), filterValue: (row) => String(row.fields.claimant ?? row.ownerName) },
          { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "category", header: "Category", cell: (row) => <Pill>{String(row.fields.category ?? "uncategorised")}</Pill>, filterValue: (row) => String(row.fields.category ?? "") },
          { key: "account", header: "Posts to", hideBelow: 1200, cell: (row) => <span className="ds-subtle ds-num">{String(row.fields.accountCode ?? "—")}</span> },
          { key: "receipt", header: "Receipt", cell: (row) => row.fields.hasReceipt === false ? <Pill tone="danger">Missing</Pill> : <Pill tone="success" dot>Held</Pill> },
          { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "reimbursed" ? "success" : row.status === "approved" ? "info" : "neutral"} dot>{row.status}</Pill> },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("expense detail", { id }); }}
        bulkActions={[
          {
            label: "Approve",
            disabled: (selected) => !context.can("approve_payment") || selected.every((expense) => expense.fields.hasReceipt === false),
            onRun: async (selected) => {
              let approved = 0;
              let refused = 0;
              for (const expense of selected) {
                if (expense.fields.hasReceipt === false) { refused += 1; continue; }
                const saved6 = await context.mutate.patch(expense.id, { status: "approved", fields: { ...expense.fields, approvedBy: context.actor } }, { event: `Expense ${expense.title} approved` });
                if (!saved6) return;
                approved += 1;
              }
              context.toast(approved ? "Claims approved" : "Nothing approved", `${approved} approved. ${refused} refused for want of a receipt.`, refused && !approved ? "blocked" : "ok");
            },
          },
        ]}
        summary={<Amount minor={total} context={context} bold />}
      />
    </Stack>
  );
}

function recoverableTax(expense: Rec, jurisdiction: string, now: Date): number {
  const category = String(expense.fields.taxCategory ?? "standard") as TaxCategory;
  const totals = documentTotals({
    lines: [{ id: "l1", description: expense.title, quantity: 1, unitPriceMinor: Number(expense.amountMinor ?? 0), taxCategory: category }],
    jurisdiction,
    customerStatus: "domestic",
    date: (expense.at ?? now.toISOString()).slice(0, 10),
  });
  return totals.taxMinor;
}

export function ReceiptCapture({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now, org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState("travel");
  const [code, setCode] = useState("6000");
  const [taxCategory, setTaxCategory] = useState<TaxCategory>("standard");
  const [filename, setFilename] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const needsReceipt = amount > 100 && !filename.trim();
  const expenseAccounts = data.accounts.filter((account) => accountType(account) === "expense" && account.status !== "inactive");

  return (
    <form
      id="receipt-capture"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const created = await context.mutate.create({
          collection: "expenses",
          title: title.trim(),
          status: "review",
          summary: note || "Claim captured in this workspace.",
          amountMinor: amount,
          at: now.toISOString(),
          fields: {
            category, accountCode: code, taxCategory, claimant: context.actor,
            hasReceipt: Boolean(filename.trim()),
            ...(needsReceipt ? { policyNote: "A receipt is required above 1.00." } : {}),
          },
          body: filename.trim()
            ? { receipt: { filename: filename.trim(), capturedAt: now.toISOString(), kept: "local" } }
            : { receipt: null },
        }, `Expense claim ${title.trim()} submitted`);
        context.toast(
          "Claim submitted",
          needsReceipt
            ? `${created.title} is in review and flagged: it cannot be approved without a receipt.`
            : `${created.title} is in review for ${context.money(amount)}.`,
          needsReceipt ? "blocked" : "ok",
        );
        setBusy(false);
        close();
      }}
    >
      <div className="fin-form-grid">
        <Field label="What it was for" required><TextInput aria-label="What it was for" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
        <Field label="Amount" required><MoneyInput label="Amount" currency={org.currency} valueMinor={amount} onChangeMinor={setAmount} /></Field>
        <Field label="Category">
          <Select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["travel", "materials", "marketing", "entertaining", "delivery", "software", "other"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Posts to">
          <Select aria-label="Posts to" value={code} onChange={(event) => setCode(event.target.value)}>
            {expenseAccounts.map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
        <Field label="Tax category" hint="Entertaining is outside the scope and nothing is recoverable.">
          <Select aria-label="Tax category" value={taxCategory} onChange={(event) => setTaxCategory(event.target.value as TaxCategory)}>
            {TAX_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Receipt file name" hint="The image stays on your device. Only the name and the date are recorded.">
        <TextInput aria-label="Receipt file name" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="rail-16-nov.jpg" />
      </Field>
      <Field label="Note"><TextArea aria-label="Note" value={note} rows={2} onChange={(event) => setNote(event.target.value)} /></Field>
      {needsReceipt && (
        <Notice tone="warning" title="A receipt is required above 1.00">
          The claim can still be submitted, and it will be flagged so an approver can see why it is blocked.
        </Notice>
      )}
      <OverlayActions
        primary={<Button type="submit" variant="primary" busy={busy} disabled={!title.trim() || amount <= 0}>Submit the claim</Button>}
        end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
      />
    </form>
  );
}

export function ExpenseDetail({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const expense = data.expenses.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!expense) return <Empty title="Select a claim first" />;

  const receipt = (expense.body as { receipt?: { filename?: string; capturedAt?: string } | null } | undefined)?.receipt;
  const tax = recoverableTax(expense, context.org.jurisdiction, context.now);
  const blocked = expense.fields.hasReceipt === false ? "No receipt is attached." : undefined;

  return (
    <Stack gap={4}>
      <DrawerUnsavedChanges when={busy} />
      {blocked && <Notice tone="danger" title="Cannot be approved">{blocked} Ask the claimant to add the receipt name.</Notice>}
      <FactGrid columns={3} items={[
        { label: "Amount", value: <Amount minor={expense.amountMinor} context={context} bold />, mono: true, tone: "accent" },
        { label: "Recoverable tax", value: <Amount minor={tax} context={context} zero="0" />, mono: true },
        { label: "Posts to", value: String(expense.fields.accountCode ?? "Not set"), mono: true, hint: String(expense.fields.category ?? "uncategorised") },
      ]} />
      <SourceNote>Receipt: {receipt?.filename ? `${receipt.filename}, captured ${context.date(receipt.capturedAt)}` : "none"}</SourceNote>
      {expense.fields.policyNote && <Notice tone="warning" title="Policy">{String(expense.fields.policyNote)}</Notice>}
      {receipt?.filename && (
        <Notice tone="info" title="The receipt image is not stored here">
          Only the file name and capture date are kept, so nothing personal is held in this browser database beyond what you typed.
        </Notice>
      )}
      <DrawerActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("approve_payment") || ["approved", "reimbursed"].includes(expense.status)}
          title={blocked}
          onClick={async () => {
            setBusy(true);
            const saved7 = await context.mutate.patch(expense.id, { status: "approved", fields: { ...expense.fields, approvedBy: context.actor } }, { expectRevision: expense.revision, event: `Expense ${expense.title} approved` });
            if (!saved7) { setBusy(false); return; }
            context.toast("Claim approved", `${expense.title} is approved by ${context.actor}. Reimbursement posts the ledger entry.`);
            setBusy(false);
            close();
          }}
        >
          Approve
        </Button>}
          secondary={<Button
          variant="secondary"
          busy={busy}
          disabled={expense.status !== "approved" || !context.can("post_journal")}
          onClick={async () => {
            const account = data.accounts.find((item) => accountCode(item) === String(expense.fields.accountCode ?? "6000"));
            const cash = data.accounts.find((item) => accountCode(item) === "1000");
            if (!account || !cash) {
              context.toast("Cannot post", "The expense account or the cash account is missing from the chart of accounts.", "failed");
              return;
            }
            setBusy(true);
            try {
              const ctx = { actor: context.actor, now: clockIso(), screenId: context.screen.id };
              const amount = Number(expense.amountMinor ?? 0);
              const date = context.now.toISOString().slice(0, 10);
              const lines: JLine[] = [
                { accountId: account.id, debitMinor: amount, creditMinor: 0, memo: expense.title },
                { accountId: cash.id, debitMinor: 0, creditMinor: amount, memo: `Reimbursed ${String(expense.fields.claimant ?? expense.ownerName)}` },
              ];
              const journalRecord = newRecord({
                organizationId: context.org.id,
                currency: context.org.currency,
                collection: "journals",
                title: `Reimburse ${expense.title}`,
                status: "posted",
                summary: `Expense claim reimbursed to ${String(expense.fields.claimant ?? expense.ownerName)}.`,
                amountMinor: amount,
                at: context.now.toISOString(),
                parentId: expense.id,
                tags: ["ledger", "expense"],
                fields: { date, source: "expense", expenseId: expense.id },
                body: { date, memo: expense.title, lines },
              }, ctx);
              const reimbursed = revisedRecord(expense, {
                status: "reimbursed",
                fields: { ...expense.fields, journalId: journalRecord.id, reimbursedAt: context.now.toISOString() },
              }, ctx);
              await context.mutate.putMany(
                [journalRecord, reimbursed],
                [`Expense ${expense.title} reimbursed`, `Expense ${expense.title} marked reimbursed`],
                { [expense.id]: expense.revision }, ["create", "update"],
              );
              context.toast("Reimbursed", `${context.money(amount)} posted to ${accountCode(account)} and out of cash.`);
              close();
            } catch (error) {
              context.toast("Reimbursement not recorded", error instanceof Error ? error.message : "The claim changed. Reopen it and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Reimburse and post
        </Button>}
          end={<>
        <Button
          variant="outline-danger"
          busy={busy}
          disabled={expense.status === "reimbursed"}
          onClick={async () => {
            setBusy(true);
            const saved9 = await context.mutate.patch(expense.id, { status: "rejected", fields: { ...expense.fields, rejectedBy: context.actor } }, { expectRevision: expense.revision, event: `Expense ${expense.title} rejected` });
            if (!saved9) { setBusy(false); return; }
            context.toast("Claim rejected", `${expense.title} is rejected and stays on the record.`, "blocked");
            setBusy(false);
            close();
          }}
        >
          Reject
        </Button>
        <OverlayCancel disabled={busy}>Close</OverlayCancel>
          </>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function ApprovalChain({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const steps = [
    { label: "Claimant submits with a receipt", who: "Anyone" },
    { label: "Finance checks the category and the account", who: "Finance" },
    { label: "Owner approves anything over 200.00 or any entertaining", who: "Owner" },
    { label: "Reimbursement posts a balanced journal", who: "Finance" },
  ];
  const waiting = data.expenses.filter((expense) => expense.status === "review");

  return (
    <Stack gap={4}>
      <Notice tone="info" title="The chain is a local control">
        It decides what this interface offers at each step. Nothing is enforced on a server, and no money moves at any step.
      </Notice>
      <Stack gap={3}>
        {steps.map((step, index) => (
          <Row key={step.label} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Pill tone="neutral">{index + 1}</Pill>
            <span className="ds-grow">{step.label}</span>
            <span className="ds-subtle">{step.who}</span>
          </Row>
        ))}
      </Stack>
      <Card prov="human" title={`${waiting.length} claims in review`} subtitle="Everything that needs a decision now" flush>
        {waiting.length === 0 ? <div className="ds-card-body"><span className="ds-subtle">Nothing is waiting.</span></div> : (
          <DataGrid
            rows={waiting}
            rowId={(row) => row.id}
            label="Claims in review"
            filterable={false}
            columns={[
              { key: "title", header: "Claim", primary: true, cell: (row) => row.title },
              { key: "claimant", header: "Claimant", cell: (row) => String(row.fields.claimant ?? row.ownerName) },
              { key: "receipt", header: "Receipt", cell: (row) => row.fields.hasReceipt === false ? <Pill tone="danger">Missing</Pill> : <Pill tone="success">Held</Pill> },
              { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
            ]}
            onOpen={(id) => context.openOverlay("expense detail", { id })}
          />
        )}
      </Card>
    </Stack>
  );
}

export function PayablesStrip({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const unpaid = data.bills.filter((bill) => !["paid", "void"].includes(bill.status));
  const dueSoon = unpaid.filter((bill) => bill.dueAt && new Date(bill.dueAt) <= new Date(now.getTime() + 7 * 86_400_000));
  return (
    <div className="fin-strip">
      <Pill tone="neutral">{unpaid.length} unpaid</Pill>
      <span>Due within 7 days <Amount minor={dueSoon.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0)} context={context} bold /></span>
      <span>Total payable <Amount minor={unpaid.reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0)} context={context} bold /></span>
    </div>
  );
}

export function ExpenseCapabilityNote() {
  return <CapabilityNotice id="payment.capture" title="Reimbursement cannot be paid from here" />;
}

export function PayablesTotals({ data, context }: { data: FinData; context: ScreenContext }) {
  return (
    <StatementRow
      context={context}
      rows={[
        { label: "Inbox", minor: data.bills.filter((bill) => bill.status === "inbox").reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0) },
        { label: "Approved", minor: data.bills.filter((bill) => ["approved", "scheduled"].includes(bill.status)).reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0) },
        { label: "Exceptions", minor: data.bills.filter((bill) => bill.fields.exception).reduce((sum, bill) => sum + Number(bill.amountMinor ?? 0), 0) },
      ]}
    />
  );
}
