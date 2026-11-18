import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, DataGrid, Empty, Field, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import { useFinData } from "./data";
import { Amount, SourceNote } from "./parts";
import { COLLECTION_BUCKETS, collectionsWorklist, daysLate, invoiceBalance, promiseOf } from "./collections";
import type { CustomerCollection } from "./collections";

/* ------------------- FIN-004 collections by customer ------------------- */

export function CollectionsByCustomer({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const rows = useMemo(
    () => collectionsWorklist(data.invoices, data.contacts, now).filter((row) => row.overdueMinor > 0),
    [data.invoices, data.contacts, now],
  );
  if (rows.length === 0) return null;
  const broken = rows.filter((row) => row.promises.some((item) => item.broken)).length;

  return (
    <Card prov="posted" eyebrow="COLLECTIONS" title="Who to chase, by customer"
      subtitle={`${rows.length} customer${rows.length === 1 ? "" : "s"} with a late balance, worst first. Ageing uses what is still owed, not the invoice gross.${broken ? ` ${broken} with a broken promise.` : ""}`}
      flush>
      <DataGrid
        rows={rows}
        rowId={(row) => row.customerId}
        label="Collections by customer"
        filterable={false}
        columns={[
          { key: "customer", header: "Customer", primary: true, cell: (row) => (
            <div style={{ minWidth: 0 }}>
              <span>{row.name}</span>
              <span className="ds-subtle ds-truncate" style={{ display: "block", fontSize: "var(--text-xs)" }}>{row.nextAction}</span>
            </div>
          ), sortValue: (row) => row.name },
          { key: "oldest", header: "Oldest", align: "end", cell: (row) => <span className="ds-num">{row.oldestDays} d</span>, sortValue: (row) => row.oldestDays },
          ...COLLECTION_BUCKETS.slice(1).map((bucket, offset) => ({
            key: `b${offset + 1}`, header: bucket, align: "end" as const, hideBelow: offset >= 2 ? 1700 : 1300,
            cell: (row: CustomerCollection) => row.bucketsMinor[offset + 1] ? <Amount minor={row.bucketsMinor[offset + 1]} context={context} /> : <span className="ds-subtle">—</span>,
          })),
          { key: "late", header: "Late", align: "end", cell: (row) => <Amount minor={row.overdueMinor} context={context} bold tone="danger" />, sortValue: (row) => row.overdueMinor },
          { key: "chased", header: "Last chased", hideBelow: 1500, cell: (row) => row.lastReminderAt ? <span className="ds-num">{context.date(row.lastReminderAt)}</span> : <span className="ds-subtle">Never</span> },
          { key: "promise", header: "Promise", cell: (row) => {
            const first = row.promises[0];
            if (!first) return <span className="ds-subtle">None</span>;
            const broken = row.promises.some((item) => item.broken);
            const pending = row.promises.find((item) => !item.kept);
            if (!broken && !pending) return <Pill tone="success" dot>Kept</Pill>;
            return <Pill tone={broken ? "danger" : "info"} dot>{broken ? "Broken" : `By ${context.date((pending ?? first).date)}`}</Pill>;
          } },
          { key: "act", header: "", cell: (row) => (
            <Row gap={1}>
              <Button size="sm" variant="secondary" aria-label={`Record a promise from ${row.name}`}
                onClick={(event) => { event.stopPropagation(); context.openOverlay("promise to pay", { customerId: row.customerId }); }}>Promise</Button>
              <Button size="sm" variant="ghost" aria-label={`Draft reminders to ${row.name}`}
                onClick={(event) => { event.stopPropagation(); context.openOverlay("bulk action preview", { ids: row.overdue.map((invoice) => invoice.id), action: "reminder" }); }}>Remind</Button>
            </Row>
          ) },
        ]}
        summary={<Amount minor={rows.reduce((sum, row) => sum + row.overdueMinor, 0)} context={context} bold />}
      />
    </Card>
  );
}

export function PromiseToPayForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const payload = (context.overlayPayload ?? {}) as { customerId?: string; invoiceId?: string };
  const open = data.invoices.filter((invoice) => invoiceBalance(invoice) > 0
    && (payload.invoiceId ? invoice.id === payload.invoiceId
      : String(invoice.fields.contactId ?? invoice.parentId ?? "") === (payload.customerId ?? "")));
  const customer = data.contacts.find((contact) => contact.id === (payload.customerId ?? String(open[0]?.fields.contactId ?? "")));
  const [picked, setPicked] = useState<string>();
  const invoiceId = picked ?? open[0]?.id ?? "";
  const invoice = open.find((item) => item.id === invoiceId);
  const balance = invoice ? invoiceBalance(invoice) : 0;
  const [amountMinor, setAmount] = useState<number>();
  const amount = amountMinor ?? balance;
  const today = now.toISOString().slice(0, 10);
  const [date, setDate] = useState(new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!invoice) return <Empty title="Nothing is owed here">Every invoice for this customer is paid or void.</Empty>;
  const existing = promiseOf(invoice, now);
  const problem = !date ? "Choose a date." : date < today ? "A promise is for today or later." : amount <= 0 ? "Enter the promised amount." : amount > balance ? `No more than the ${context.money(balance)} still owed.` : undefined;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A promise is a note, not a payment">
        It records what the customer said, when and by whom. The invoice stays owed until a receipt is posted, and nothing is sent to the customer.
      </Notice>
      <Properties rows={[
        { label: "Customer", value: customer?.title ?? "Not linked" },
        { label: "Still owed", value: <Amount minor={balance} context={context} bold /> },
        { label: "Days late", value: String(daysLate(invoice, now)) },
        ...(existing ? [{ label: "Current promise", value: `${context.money(existing.amountMinor)} by ${context.date(existing.date)}${existing.broken ? " (broken)" : ""}` }] : []),
      ]} />
      <Field label="Invoice">
        <Select aria-label="Invoice" value={invoiceId} onChange={(event) => { setPicked(event.target.value); setAmount(undefined); }}>
          {open.map((item) => <option key={item.id} value={item.id}>{item.title} · {context.money(invoiceBalance(item))} owed</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Promised by" required hint={problem && date < today ? problem : undefined}>
          <TextInput aria-label="Promised by" type="date" value={date} min={today} invalid={Boolean(date) && date < today} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Amount promised" required>
          <MoneyInput label="Amount promised" currency={org.currency} valueMinor={amount} onChangeMinor={setAmount} />
        </Field>
      </Row>
      <Field label="What they said"><TextArea aria-label="What they said" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Accounts payable will release it on Friday's run" /></Field>
      {problem && <span className="ds-subtle" role="status">{problem}</span>}
      <Row gap={2}>
        <Button variant="primary" busy={busy} disabled={Boolean(problem)}
          onClick={async () => {
            setBusy(true);
            try {
              // The balance at promise time lets a later part payment of the
              // promised amount count as kept, not broken.
              const saved = await context.mutate.patch(invoice.id, {
                fields: {
                  ...invoice.fields, promiseDate: date, promiseMinor: amount, promiseBalanceMinor: balance, promiseBy: context.actor,
                  promiseNote: note.trim(), promiseRecordedAt: clockIso(),
                },
              }, { expectRevision: invoice.revision, event: `Promise to pay ${context.money(amount)} by ${date} recorded on ${invoice.title}` });
              // A conflict is already reported; the form stays open to retry.
              if (!saved) return;
              context.toast("Promise recorded", `${invoice.title}: ${context.money(amount)} by ${context.date(date)}. Still owed until a receipt is posted.`);
              close();
            } catch (error) {
              context.toast("Promise not saved", error instanceof Error ? error.message : "Reload and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}>Record the promise</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
      <SourceNote>
        <Link to={`/o/${org.slug}/fin/invoices/${invoice.id}`}>Open {invoice.title}</Link> to post a receipt when the money arrives.
      </SourceNote>
    </Stack>
  );
}
