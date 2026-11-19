import { useState } from "react";
import { Button, Empty, Field, Notice, Properties, Row, Select, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { useCrmData } from "./data";
import { isExpired } from "./parts";
import { quoteTotals } from "./quotes";

/** Manual evidence capture, not a claim that a mail or e-sign provider verified acceptance. */
export function RecordCustomerAcceptance({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now, org } = useWorkspace();
  const quote = data.quotes.find((item) => item.id === context.selectedId);
  const [source, setSource] = useState("signed_quote");
  const [reference, setReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!quote) return <Empty title="Select a quote first">Choose a sent quote to record the customer's response.</Empty>;
  const totals = quoteTotals(data, quote, org.jurisdiction, now);
  const blocked = quote.status !== "sent"
    ? "Only a sent quote can be recorded as customer-accepted."
    : isExpired(quote, now)
      ? "This quote has expired. Duplicate and re-price it before recording acceptance."
      : totals.hasUnknownRate || quote.fields.taxUnresolved === true
        ? "This quote has unresolved tax. Resolve pricing before recording acceptance."
        : !quote.fields.approvedBy
          ? "This quote has not been internally approved."
          : undefined;
  const invalid = Boolean(blocked || !customerName.trim() || reference.trim().length < 5);
  return <Stack gap={4}>
    <Notice tone={blocked ? "danger" : "warning"} title={blocked ?? "Record evidence of the customer's acceptance"}>
      This creates a browser-local record of acceptance, supplied by a person. No email,
      signature platform or external customer identity has been verified by Arlovi.
      Only record this when evidence already exists outside this workspace.
    </Notice>
    <Properties rows={[
      { label: "Quote", value: quote.title },
      { label: "Version", value: String(quote.fields.version ?? 1) },
      { label: "Amount", value: context.money(totals.grossMinor) },
    ]} />
    <Field label="Evidence source">
      <Select aria-label="Evidence source" value={source} onChange={(event) => setSource(event.target.value)}>
        <option value="signed_quote">Signed quote / document</option>
        <option value="customer_email">Customer email</option>
        <option value="recorded_call">Recorded customer call</option>
        <option value="other">Other verifiable reference</option>
      </Select>
    </Field>
    <Field label="Accepted by" hint="The customer's name as stated in the evidence.">
      <TextInput aria-label="Accepted by" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer contact name" />
    </Field>
    <Field label="Acceptance reference" hint="A document ID, message subject, or call reference (at least five characters).">
      <TextInput aria-label="Acceptance reference" value={reference} onChange={(event) => setReference(event.target.value)}
        placeholder="e.g. signed quotation Q-126, email received 14 Nov" />
    </Field>
    <Row gap={2}>
      <Button variant="primary" busy={busy} disabled={invalid || !context.can("edit_pipeline")}
        onClick={async () => {
          if (invalid || busy || !quote) return;
          setBusy(true);
          try {
            const saved = await context.mutate.patch(quote.id, {
              status: "accepted",
              fields: {
                ...quote.fields,
                acceptedAt: now.toISOString(),
                acceptedVersion: Number(quote.fields.version ?? 1),
                acceptedGrossMinor: totals.grossMinor,
                acceptedByCustomer: customerName.trim(),
                acceptanceEvidenceSource: source,
                acceptanceEvidenceReference: reference.trim(),
                acceptanceRecordedBy: context.actor,
                acceptanceVerification: "manual_local",
              },
            }, {
              expectRevision: quote.revision,
              event: `Customer acceptance of ${quote.title} recorded by ${context.actor} from ${source}: ${reference.trim()}`,
            });
            if (!saved) return;
            context.toast("Customer acceptance recorded", `${quote.title} v${String(quote.fields.version ?? 1)} is marked accepted from your cited evidence. No external verification was performed.`);
            close();
          } catch (error) {
            context.toast("Acceptance was not recorded", error instanceof Error ? error.message : "The quote changed. Reopen and retry.", "failed");
          } finally {
            setBusy(false);
          }
        }}>
        Record customer acceptance
      </Button>
      <span className="ds-grow" />
      <Button variant="ghost" onClick={close}>Cancel</Button>
    </Row>
  </Stack>;
}
