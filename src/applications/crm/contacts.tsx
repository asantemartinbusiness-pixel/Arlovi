import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Mail, UserRound, Users } from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import { CUSTOMER_TAX_STATUSES } from "@/domain/fin-invoice";
import type { CustomerTaxStatus } from "@/domain/fin-invoice";
import { ACTIVITY_LABEL, activitiesFor, activityKind, stageOf } from "@/domain/crm-pipeline";
import {
  companyById, contactsOfCompany, dealsOfCompany, bookingsOfContact, dealsOfContact, invoicesOfContact, ticketsOfContact, useCrmData,
} from "./data";
import type { CrmData } from "./data";
import { ActivityPill, CapabilityNotice, ConsentPill, Money, StagePill } from "./parts";
import { MergeGroups } from "./actions";
import { clockIso } from "@/platform/clock";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { accountHref } from "./account";

/* ---------------------------- CRM-002 ---------------------------- */

function duplicateGroups(contacts: Rec[]): { key: string; rows: Rec[] }[] {
  const byKey = new Map<string, Rec[]>();
  for (const contact of contacts) {
    const key = contact.title.trim().toLowerCase();
    const found = byKey.get(key);
    if (found) found.push(contact);
    else byKey.set(key, [contact]);
  }
  return [...byKey.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, rows }));
}

export function ContactsTable({ context, tab }: { context: ScreenContext; tab: string }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const duplicates = useMemo(() => duplicateGroups(data.contacts), [data.contacts]);

  if (tab === "Duplicates") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="A merge must preserve consent and suppression">
          When two records are merged, the result keeps the strictest setting: a suppression on either record survives, and the earliest recorded consent is kept so nothing is silently re-permissioned.
        </Notice>
        {duplicates.length === 0 ? (
          <Empty title="No duplicate names" icon={<Users size={20} />}>Duplicates are found by matching the full name exactly.</Empty>
        ) : (
          <Stack gap={3}>
            {duplicates.map((group) => (
              <Card prov="human" key={group.key} title={group.rows[0].title} subtitle={`${group.rows.length} records with this name`}
                footer={<Button size="sm" variant="primary" onClick={() => { context.select(group.rows[0].id); context.openOverlay("merge preview", { ids: group.rows.map((row) => row.id) }); }}>Review the merge</Button>}>
                <Stack gap={2}>
                  {group.rows.map((row) => (
                    <Row key={row.id} gap={3}>
                      <span className="ds-grow">{String(row.fields.email ?? "no email")}</span>
                      <ConsentPill contact={row} />
                      <span className="ds-subtle">{dealsOfContact(data, row.id).length} deals</span>
                      <span className="ds-subtle">created {context.date(row.createdAt)}</span>
                    </Row>
                  ))}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  if (tab === "Segments") {
    const segments = [
      { id: "consented", label: "Email consent on file", rows: data.contacts.filter((contact) => contact.fields.consent && contact.fields.suppressed !== true), why: "A consent string is recorded on the contact." },
      { id: "suppressed", label: "Suppressed", rows: data.contacts.filter((contact) => contact.fields.suppressed === true), why: "The contact asked not to be contacted." },
      { id: "nostatus", label: "No tax status", rows: data.contacts.filter((contact) => !contact.fields.taxStatus), why: "An invoice to them cannot resolve a tax rate." },
      { id: "open", label: "With an open deal", rows: data.contacts.filter((contact) => dealsOfContact(data, contact.id).some((deal) => stageOf(deal).kind === "open")), why: "At least one linked deal is in an open stage." },
      { id: "nocompany", label: "No account linked", rows: data.contacts.filter((contact) => !contact.fields.companyId), why: "No company record is set on the contact." },
    ];
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Every segment states its rule">
          A segment here is a filter over records in this browser, not a score. The rule is shown so you can tell exactly who is in it and why.
        </Notice>
        <Grid>
          {segments.map((segment) => (
            <Card prov="human" key={segment.id} span={4} title={segment.label} subtitle={segment.why} actions={<Pill tone="neutral">{segment.rows.length}</Pill>}
              footer={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("bulk action confirmation", { ids: segment.rows.map((row) => row.id), segment: segment.label })}>Tag this segment</Button>}>
              <Stack gap={1}>
                {segment.rows.slice(0, 5).map((row) => (
                  <Link key={row.id} to={`/o/${org.slug}/crm/contacts/${row.id}`} style={{ color: "inherit" }}>{row.title}</Link>
                ))}
                {segment.rows.length > 5 && <span className="ds-subtle">and {segment.rows.length - 5} more</span>}
                {segment.rows.length === 0 && <span className="ds-subtle">Nobody matches.</span>}
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  const rows = tab === "My contacts"
    ? data.contacts.filter((contact) => String(contact.fields.owner ?? contact.ownerName) === context.actor)
    : data.contacts;

  if (rows.length === 0) {
    return (
      <Empty title={tab === "My contacts" ? `No contact is owned by ${context.actor}` : "No contacts"} icon={<UserRound size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Contact form")}>New contact</Button>} />
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label={tab} value={String(rows.length)} meta={`${data.contacts.length} in total`} />
        <Stat prov="human" label="With consent" value={String(rows.filter((contact) => contact.fields.consent && contact.fields.suppressed !== true).length)} meta="Outreach is allowed, once a provider exists" />
        <Stat prov="unknown" label="Suppressed" value={String(rows.filter((contact) => contact.fields.suppressed === true).length)} meta="Never contacted by any automation" />
        <Stat prov="human" label="Possible duplicates" value={String(duplicates.reduce((sum, group) => sum + group.rows.length, 0))} meta="Matched on an identical name" />
      </StatRow>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${tab} contacts`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.fields.suppressed === true ? "warning" : undefined)}
        columns={[
          { key: "name", header: "Person", primary: true, cell: (row) => (
            <Row gap={2}>
              <Avatar name={row.title} size="sm" />
              <Link to={`/o/${org.slug}/crm/contacts/${row.id}`} style={{ color: "inherit" }}>{row.title}</Link>
            </Row>
          ), sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.email ?? "")}` },
          { key: "role", header: "Role", hideBelow: 1200, cell: (row) => String(row.fields.role ?? "—") },
          { key: "company", header: "Account", cell: (row) => companyById(data, String(row.fields.companyId ?? ""))?.title ?? <span className="ds-subtle">None</span>, filterValue: (row) => companyById(data, String(row.fields.companyId ?? ""))?.title ?? "" },
          { key: "owner", header: "Owner", hideBelow: 1400, cell: (row) => String(row.fields.owner ?? row.ownerName) },
          { key: "consent", header: "Consent", cell: (row) => <ConsentPill contact={row} /> },
          { key: "tax", header: "Tax status", hideBelow: 1200, cell: (row) => row.fields.taxStatus
            ? <Pill tone="neutral">{CUSTOMER_TAX_STATUSES.find((entry) => entry.value === row.fields.taxStatus)?.label ?? String(row.fields.taxStatus)}</Pill>
            : <Pill tone="danger">Not recorded</Pill> },
          { key: "deals", header: "Deals", align: "end", cell: (row) => <span className="ds-num">{dealsOfContact(data, row.id).length}</span> },
          { key: "touches", header: "Last touch", align: "end", cell: (row) => {
            const last = activitiesFor(data.activities, row.id)[0];
            return last ? <span className="ds-subtle">{context.relative(last.startAt ?? last.at)}</span> : <span className="ds-subtle">Never</span>;
          } },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/crm/contacts/${id}`)}
        bulkActions={[
          { label: "Tag", onRun: (selected) => context.openOverlay("bulk action confirmation", { ids: selected.map((row) => row.id) }) },
          { label: "Export", onRun: (selected) => exportContacts(context, data, selected) },
        ]}
      />
    </Stack>
  );
}

function exportContacts(context: ScreenContext, data: CrmData, rows: Rec[]): void {
  const header = "name,role,email,phone,account,owner,consent,suppressed,tax_status,deals\n";
  const body = rows.map((contact) => [
    contact.title,
    String(contact.fields.role ?? ""),
    String(contact.fields.email ?? ""),
    String(contact.fields.phone ?? ""),
    companyById(data, String(contact.fields.companyId ?? ""))?.title ?? "",
    String(contact.fields.owner ?? contact.ownerName),
    String(contact.fields.consent ?? ""),
    contact.fields.suppressed === true ? "yes" : "no",
    String(contact.fields.taxStatus ?? ""),
    String(dealsOfContact(data, contact.id).length),
  ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile(`${context.org.slug}-contacts.csv`, header + body, "text/csv");
  context.toast("Exported", `${rows.length} contacts written to a CSV file in this browser. Suppression is exported with them.`);
}

export { exportContacts };

/* --------------------------- CRM-002 overlays --------------------------- */

export function ContactForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id ?? context.selectedId);
  const contact = existing?.collection === "contacts" ? existing : undefined;
  const draftScope = `crm:contact:${context.org.id}:${context.actor}:${payload?.id ?? contact?.id ?? "new"}`;
  const [titleDraft, setTitle] = useWorkingField<string | undefined>(draftScope, "title", undefined);
  const [emailDraft, setEmail] = useWorkingField<string | undefined>(draftScope, "email", undefined);
  const [phoneDraft, setPhone] = useWorkingField<string | undefined>(draftScope, "phone", undefined);
  const [roleDraft, setRole] = useWorkingField<string | undefined>(draftScope, "role", undefined);
  const [companyDraft, setCompanyId] = useWorkingField<string | undefined>(draftScope, "company", undefined);
  const [taxDraft, setTaxStatus] = useWorkingField<CustomerTaxStatus | "" | undefined>(draftScope, "taxStatus", undefined);
  const [consentDraft, setConsent] = useWorkingField<boolean | undefined>(draftScope, "consent", undefined);
  const [suppressedDraft, setSuppressed] = useWorkingField<boolean | undefined>(draftScope, "suppressed", undefined);
  const [summaryDraft, setSummary] = useWorkingField<string | undefined>(draftScope, "summary", undefined);
  const title = titleDraft ?? contact?.title ?? "";
  const email = emailDraft ?? String(contact?.fields.email ?? "");
  const phone = phoneDraft ?? String(contact?.fields.phone ?? "");
  const role = roleDraft ?? String(contact?.fields.role ?? "");
  const companyId = companyDraft ?? String(contact?.fields.companyId ?? "");
  const taxStatus = taxDraft ?? (contact?.fields.taxStatus as CustomerTaxStatus | undefined) ?? "";
  const consent = consentDraft ?? Boolean(contact?.fields.consent);
  const suppressed = suppressedDraft ?? (contact?.fields.suppressed === true);
  const summary = summaryDraft ?? contact?.summary ?? "";
  const [busy, setBusy] = useState(false);

  const duplicateEmail = email.trim() && data.contacts.some((item) => String(item.fields.email ?? "").toLowerCase() === email.trim().toLowerCase() && item.id !== contact?.id);

  return (
    <form
      id="contact-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const fields: Record<string, string | number | boolean> = { email: email.trim(), phone, role, owner: contact ? String(contact.fields.owner ?? context.actor) : context.actor };
        if (companyId) fields.companyId = companyId;
        if (taxStatus) fields.taxStatus = taxStatus;
        if (suppressed) fields.suppressed = true;
        if (consent && !suppressed) fields.consent = contact?.fields.consent ? String(contact.fields.consent) : `recorded-${clockIso().slice(0, 10)}`;
        if (contact) {
          await context.mutate.patch(contact.id, {
            title: title.trim(), summary, fields,
            tags: suppressed ? [...new Set([...contact.tags, "suppressed"])] : contact.tags.filter((tag) => tag !== "suppressed"),
          }, { expectRevision: contact.revision, event: `Contact ${title.trim()} updated` });
          context.toast("Contact saved", suppressed ? `${title.trim()} is suppressed and no automation will contact them.` : `${title.trim()} is updated.`);
        } else {
          const created = await context.mutate.create({
            collection: "contacts", title: title.trim(), status: suppressed ? "suppressed" : "active",
            summary, fields, tags: suppressed ? ["customer", "suppressed"] : ["customer"],
          }, `Contact ${title.trim()} created`);
          context.select(created.id);
          context.toast("Contact created", taxStatus ? `${created.title} is on file with a ${taxStatus} tax status.` : `${created.title} is on file. Without a tax status an invoice to them cannot resolve a rate.`);
        }
        clearWorkingDraft(draftScope);
        setBusy(false);
        close();
      }}
    >
      <Field label="Full name" required><TextInput aria-label="Full name" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Email" error={duplicateEmail ? "Another contact already uses this address" : undefined}>
          <TextInput aria-label="Email" type="email" value={email} invalid={Boolean(duplicateEmail)} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Phone"><TextInput aria-label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
        <Field label="Role"><TextInput aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)} /></Field>
      </Row>
      <Row gap={3} wrap>
        <Field label="Account">
          <Select aria-label="Account" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">None</option>
            {data.companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
          </Select>
        </Field>
        <Field label="Tax status" hint="Finance needs this to resolve a rate on any invoice.">
          <Select aria-label="Tax status" value={taxStatus} onChange={(event) => setTaxStatus(event.target.value as CustomerTaxStatus)}>
            <option value="">Not recorded</option>
            {CUSTOMER_TAX_STATUSES.filter((entry) => entry.value !== "unknown").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
        </Field>
      </Row>
      <Checkbox label="Email consent is recorded" checked={consent} disabled={suppressed} onChange={(event) => setConsent(event.target.checked)} />
      <Checkbox label="Suppressed: never contact this person" checked={suppressed} onChange={(event) => { setSuppressed(event.target.checked); if (event.target.checked) setConsent(false); }} />
      {suppressed && <Notice tone="warning" title="Suppression wins over consent">No automation and no bulk action will include this contact, and the flag survives a merge.</Notice>}
      <Field label="Notes"><TextArea aria-label="Notes" value={summary} rows={3} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>{contact ? "Save the contact" : "Create the contact"}</Button>
        <Button variant="ghost" onClick={close}>Close & keep draft</Button>
        <Button variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
      <p className="ds-subtle">Unfinished edits stay in this browser tab until saved or discarded. No customer message is sent.</p>
    </form>
  );
}

export function MergePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const [picked, setPicked] = useState<string[] | undefined>(payload?.ids);
  const rows = (picked ?? []).map((id) => data.contacts.find((contact) => contact.id === id)).filter((contact): contact is Rec => Boolean(contact));
  const [keepId, setKeepId] = useState(rows[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => duplicateGroups(data.contacts), [data.contacts]);

  if (rows.length < 2) {
    const forSelected = context.selectedId ? groups.filter((group) => group.rows.some((row) => row.id === context.selectedId)) : [];
    return <MergeGroups groups={forSelected.length ? forSelected : groups} context={context} onPick={(ids) => { setPicked(ids); setKeepId(ids[0]); }} />;
  }

  const keep = rows.find((row) => row.id === keepId) ?? rows[0];
  const others = rows.filter((row) => row.id !== keep.id);
  const anySuppressed = rows.some((row) => row.fields.suppressed === true);
  const consents = rows.map((row) => String(row.fields.consent ?? "")).filter(Boolean).sort();
  const mergedDeals = rows.flatMap((row) => dealsOfContact(data, row.id));
  const mergedInvoices = rows.flatMap((row) => invoicesOfContact(data, row.id));

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A merge keeps the strictest contact setting">
        {anySuppressed
          ? "One of these records is suppressed, so the merged record stays suppressed and all consent is dropped."
          : consents.length > 0
            ? `The earliest recorded consent (${consents[0]}) is kept. Nothing is re-permissioned by merging.`
            : "Neither record has consent recorded, so the merged record has none."}
      </Notice>
      <Field label="Record to keep">
        <Select aria-label="Record to keep" value={keep.id} onChange={(event) => setKeepId(event.target.value)}>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.title} · {String(row.fields.email ?? "no email")} · created {row.createdAt.slice(0, 10)}</option>)}
        </Select>
      </Field>
      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Field by field comparison</caption>
            <thead><tr><th>Field</th>{rows.map((row) => <th key={row.id}>{row.id === keep.id ? "Keeping" : "Merging in"}</th>)}<th>Result</th></tr></thead>
            <tbody>
              {["email", "phone", "role", "companyId", "taxStatus", "consent", "suppressed"].map((field) => (
                <tr key={field}>
                  <th scope="row" style={{ textAlign: "start" }}>{field}</th>
                  {rows.map((row) => <td key={row.id} className="ds-subtle">{String(row.fields[field] ?? "—")}</td>)}
                  <td>
                    {field === "suppressed"
                      ? (anySuppressed ? "yes" : "no")
                      : field === "consent"
                        ? (anySuppressed ? "dropped" : consents[0] ?? "—")
                        : String(keep.fields[field] ?? others.map((row) => row.fields[field]).find(Boolean) ?? "—")}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" style={{ textAlign: "start" }}>Source ids</th>
                {rows.map((row) => <td key={row.id} className="ds-subtle">{row.id}</td>)}
                <td className="ds-subtle">All kept on the record</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Properties rows={[
        { label: "Deals that will point at the kept record", value: String(mergedDeals.length) },
        { label: "Invoices that will point at it", value: String(mergedInvoices.length) },
        { label: "Records kept as merged evidence", value: String(others.length) },
      ]} />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!context.can("edit_pipeline")}
          onClick={async () => {
            setBusy(true);
            const fields: Record<string, string | number | boolean> = { ...keep.fields };
            for (const other of others) {
              for (const [field, value] of Object.entries(other.fields)) {
                if (fields[field] === undefined || fields[field] === "") fields[field] = value;
              }
            }
            if (anySuppressed) { fields.suppressed = true; delete fields.consent; }
            else if (consents.length > 0) fields.consent = consents[0];
            fields.mergedFrom = [String(keep.fields.mergedFrom ?? ""), ...others.map((row) => row.id)].filter(Boolean).join(" ");
            fields.mergedBy = context.actor;
            await context.mutate.patch(keep.id, {
              status: anySuppressed ? "suppressed" : keep.status,
              fields,
              tags: anySuppressed ? [...new Set([...keep.tags, "suppressed"])] : keep.tags,
            }, { replaceFields: true, expectRevision: keep.revision, event: `Contacts merged into ${keep.title}` });
            for (const other of others) {
              for (const deal of dealsOfContact(data, other.id)) {
                await context.mutate.patch(deal.id, { fields: { ...deal.fields, contactId: keep.id } }, { event: `${deal.title} repointed to the merged contact` });
              }
              for (const invoice of invoicesOfContact(data, other.id)) {
                await context.mutate.patch(invoice.id, { parentId: keep.id, fields: { ...invoice.fields, contactId: keep.id } }, { event: `${invoice.title} repointed to the merged contact` });
              }
              // Keep the merged-away record as evidence: its fields, consent and history stay readable.
              await context.mutate.patch(other.id, {
                status: "merged",
                fields: { ...other.fields, mergedInto: keep.id, mergedAt: clockIso(), mergedBy: context.actor },
              }, { expectRevision: other.revision, event: `Duplicate contact ${other.title} merged into ${keep.title}; the original record is kept` });
            }
            context.toast("Contacts merged", `${others.length} record${others.length === 1 ? "" : "s"} merged into ${keep.title}. ${anySuppressed ? "The suppression survived the merge." : "The earliest consent was kept."}`);
            setBusy(false);
            close();
          }}
        >
          Merge into {keep.title}
        </Button>
        <Button variant="ghost" onClick={close}>Close & keep draft</Button>
        <Button variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
      <p className="ds-subtle">Message text is held in this tab only until you save or discard it. Nothing is sent externally.</p>
    </Stack>
  );
}

export function BulkActionConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { ids?: string[]; segment?: string; export?: boolean } | undefined;
  const rows = (payload?.ids ?? []).map((id) => data.contacts.find((contact) => contact.id === id)).filter((contact): contact is Rec => Boolean(contact));
  const [tag, setTag] = useState(payload?.segment ? payload.segment.toLowerCase().replace(/\s+/g, "-") : "trade");
  const [busy, setBusy] = useState(false);
  const suppressed = rows.filter((row) => row.fields.suppressed === true);
  const eligible = rows.filter((row) => row.fields.suppressed !== true);

  if (payload?.export) {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="The file is written in this browser">
          {data.contacts.length} contacts with their consent and suppression flags. Nothing is uploaded, and a suppressed
          contact is exported with that flag intact so it cannot be lost in a round trip.
        </Notice>
        <Button variant="primary" onClick={() => { exportContacts(context, data, data.contacts); close(); }}>Download the CSV</Button>
      </Stack>
    );
  }

  if (rows.length === 0) return <Empty title="Nothing selected">Tick contacts in the list, then choose Tag.</Empty>;

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Selected", value: String(rows.length) },
        { label: "Will be tagged", value: String(eligible.length) },
        { label: "Skipped as suppressed", value: String(suppressed.length) },
      ]} />
      {suppressed.length > 0 && (
        <Notice tone="warning" title={`${suppressed.length} suppressed contact${suppressed.length === 1 ? "" : "s"} will be skipped`}>
          {suppressed.map((row) => row.title).join(", ")} asked not to be contacted, so they are left out of any segment used for outreach.
        </Notice>
      )}
      <Field label="Tag"><TextInput aria-label="Tag" value={tag} onChange={(event) => setTag(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={eligible.length === 0 || !tag.trim()}
          onClick={async () => {
            setBusy(true);
            for (const contact of eligible) {
              await context.mutate.patch(contact.id, { tags: [...new Set([...contact.tags, tag.trim()])] }, { event: `Contact ${contact.title} tagged ${tag.trim()}` });
            }
            context.toast("Tagged", `${eligible.length} contact${eligible.length === 1 ? "" : "s"} tagged ${tag.trim()}. ${suppressed.length} suppressed records were skipped.`);
            setBusy(false);
            close();
          }}
        >
          Tag {eligible.length} contact{eligible.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- CRM-003 ---------------------------- */

export function useContact(context: ScreenContext): { contact?: Rec; data: CrmData } {
  const data = useCrmData();
  const fromRoute = useRecord(context.params.id);
  const contact = fromRoute?.collection === "contacts" ? fromRoute : data.contacts.find((item) => item.id === context.selectedId) ?? data.contacts[0];
  return { contact, data };
}

export function ContactHeader({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  if (!contact) return null;
  const company = companyById(data, String(contact.fields.companyId ?? ""));
  const deals = dealsOfContact(data, contact.id);
  const open = deals.filter((deal) => stageOf(deal).kind === "open");
  return (
    <Card prov="human" flush>
      <div className="ds-card-body">
        <Row gap={4} wrap>
          <Avatar name={contact.title} size="lg" />
          <div className="ds-grow">
            <Row gap={2}>
              <h2 style={{ fontSize: "var(--text-xl)" }}>{contact.title}</h2>
              <ConsentPill contact={contact} />
            </Row>
            <p className="ds-subtle">{String(contact.fields.role ?? "")}{company && <>{" at "}<Link to={accountHref(context.org.slug, company.id)} style={{ color: "inherit" }}>{company.title}</Link></>}</p>
            <Row gap={3} wrap style={{ marginBlockStart: "var(--space-2)" }}>
              <span className="ds-subtle"><Mail size={13} aria-hidden="true" /> {String(contact.fields.email ?? "no email")}</span>
              <span className="ds-subtle">{String(contact.fields.phone ?? "no phone")}</span>
              <span className="ds-subtle">Owner {String(contact.fields.owner ?? contact.ownerName)}</span>
            </Row>
          </div>
          <Properties rows={[
            { label: "Open deals", value: String(open.length) },
            { label: "Open value", value: context.money(open.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)) },
            { label: "Customer since", value: company?.fields.customerSince ? context.date(String(company.fields.customerSince)) : context.date(contact.createdAt) },
          ]} />
        </Row>
      </div>
    </Card>
  );
}

export function ContactOverview({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  const { org } = useWorkspace();
  if (!contact) return <Empty title="No contact selected" />;
  const company = companyById(data, String(contact.fields.companyId ?? ""));
  const deals = dealsOfContact(data, contact.id);
  const invoices = invoicesOfContact(data, contact.id);
  const activities = activitiesFor(data.activities, contact.id);
  const tickets = ticketsOfContact(data, contact.id);
  const unpaid = invoices.filter((invoice) => ["awaiting_payment", "part_paid"].includes(invoice.status));

  return (
    <Grid>
      <Card prov="human" span={4} title="Identity" subtitle="What is recorded, and what is not">
        <Properties rows={[
          { label: "Name", value: contact.title },
          { label: "Role", value: String(contact.fields.role ?? "Not recorded") },
          { label: "Email", value: String(contact.fields.email ?? "Not recorded") },
          { label: "Phone", value: String(contact.fields.phone ?? "Not recorded") },
          { label: "Owner", value: String(contact.fields.owner ?? contact.ownerName) },
          { label: "Consent", value: <ConsentPill contact={contact} /> },
          { label: "Tax status", value: contact.fields.taxStatus
            ? CUSTOMER_TAX_STATUSES.find((entry) => entry.value === contact.fields.taxStatus)?.label ?? String(contact.fields.taxStatus)
            : "Not recorded — an invoice cannot resolve a rate" },
        ]} />
      </Card>

      <Card prov="human" span={4} title="Relationship context" subtitle={company ? company.title : "No account linked"}>
        {company ? (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Industry", value: String(company.fields.industry ?? "Not recorded") },
              { label: "City", value: String(company.fields.city ?? "Not recorded") },
              { label: "Account owner", value: String(company.fields.owner ?? company.ownerName) },
              { label: "Other contacts", value: String(contactsOfCompany(data, company.id).length - 1) },
              { label: "Deals at this account", value: String(dealsOfCompany(data, company.id).length) },
            ]} />
            <Stack gap={2}>
              <span className="ds-stat-label">Others at {company.title}</span>
              {contactsOfCompany(data, company.id).filter((item) => item.id !== contact.id).map((item) => (
                <Row key={item.id} gap={2}>
                  <Avatar name={item.title} size="sm" />
                  <Link to={`/o/${org.slug}/crm/contacts/${item.id}`} className="ds-grow" style={{ color: "inherit" }}>{item.title}</Link>
                  <span className="ds-subtle">{String(item.fields.role ?? "")}</span>
                </Row>
              ))}
              {contactsOfCompany(data, company.id).length <= 1 && <span className="ds-subtle">Nobody else is recorded at this account.</span>}
            </Stack>
          </Stack>
        ) : (
          <Empty title="No account" icon={<Building2 size={20} />}>Linking an account gives this person a company, an owner and the rest of the relationship.</Empty>
        )}
      </Card>

      <Card prov="human" span={4} title="Commercial position" subtitle="Deals and money, from real records">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Deals", value: String(deals.length) },
            { label: "Open value", value: <Money minor={deals.filter((deal) => stageOf(deal).kind === "open").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)} context={context} bold /> },
            { label: "Won value", value: <Money minor={deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)} context={context} /> },
            { label: "Invoices", value: String(invoices.length) },
            { label: "Outstanding", value: <Money minor={unpaid.reduce((sum, invoice) => sum + (Number(invoice.amountMinor ?? 0) - Number(invoice.fields.paidMinor ?? 0)), 0)} context={context} bold /> },
            { label: "Open tickets", value: String(tickets.filter((ticket) => ticket.status !== "closed").length) },
          ]} />
          {unpaid.length > 0 && (
            <Notice tone="warning" title={`${unpaid.length} invoice${unpaid.length === 1 ? " is" : "s are"} unpaid`}>
              Worth knowing before the next conversation. Open them in Finance to see the ageing.
            </Notice>
          )}
        </Stack>
      </Card>

      {contact.fields.restrictedNote && (
        <div className="ds-col-12">
          <Notice tone="info" title="A restricted note exists on this contact">
            {String(contact.fields.restrictedNote)} It is shown here because you hold a role view that includes it. A role view shapes the interface and is not an account security boundary.
          </Notice>
        </div>
      )}

      <Card prov="human" span={12} title="Latest touches" subtitle={`${activities.length} activities recorded against this person`} flush>
        {activities.length === 0 ? (
          <div className="ds-card-body"><Empty title="Nothing logged">A call, meeting, email draft or note recorded here becomes the conversation history.</Empty></div>
        ) : (
          <DataGrid
            rows={activities.slice(0, 8)}
            rowId={(row) => row.id}
            label="Latest activity"
            filterable={false}
            columns={[
              { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt ?? row.at)}</span> },
              { key: "kind", header: "Kind", cell: (row) => <ActivityPill activity={row} /> },
              { key: "title", header: "What", primary: true, cell: (row) => row.title },
              { key: "outcome", header: "Outcome", cell: (row) => row.fields.outcome ? String(row.fields.outcome) : <span className="ds-subtle">—</span> },
            ]}
          />
        )}
      </Card>
    </Grid>
  );
}

export function ContactTimeline({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  const events = useEvents(contact?.id, 60);
  if (!contact) return <Empty title="No contact selected" />;
  const activities = activitiesFor(data.activities, contact.id);
  const deals = dealsOfContact(data, contact.id);
  const invoices = invoicesOfContact(data, contact.id);
  const bookings = bookingsOfContact(data, contact.id);

  const entries = [
    ...activities.map((activity) => ({ id: activity.id, at: activity.startAt ?? activity.at ?? activity.createdAt, kind: ACTIVITY_LABEL[activityKind(activity)], title: activity.title, detail: activity.summary, who: String(activity.fields.owner ?? activity.ownerName), outcome: String(activity.fields.outcome ?? "") })),
    ...deals.map((deal) => ({ id: deal.id, at: deal.createdAt, kind: "Deal", title: `${deal.title} created`, detail: deal.summary, who: String(deal.fields.owner ?? deal.ownerName), outcome: stageOf(deal).label })),
    ...invoices.map((invoice) => ({ id: invoice.id, at: invoice.at ?? invoice.createdAt, kind: "Invoice", title: `${invoice.title} ${invoice.status.replace(/_/g, " ")}`, detail: invoice.summary, who: invoice.ownerName, outcome: context.money(Number(invoice.amountMinor ?? 0)) })),
    ...bookings.map((booking) => ({ id: booking.id, at: booking.startAt ?? booking.at ?? booking.createdAt, kind: "Booking", title: `${booking.title} ${booking.status.replace(/_/g, " ")}`, detail: booking.fields.invoiceNumber ? `Invoiced as ${String(booking.fields.invoiceNumber)}.` : booking.summary, who: booking.ownerName, outcome: booking.amountMinor ? context.money(booking.amountMinor) : "" })),
    ...events.map((event) => ({ id: event.id, at: event.at, kind: "Record", title: event.message, detail: "", who: event.actor, outcome: "" })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  if (entries.length === 0) return <Empty title="No history for this contact" />;

  return (
    <ol className="ds-stack ds-gap-4">
      {entries.map((entry) => (
        <li key={`${entry.kind}-${entry.id}-${entry.at}`}>
          <Row gap={4} style={{ alignItems: "flex-start" }}>
            <div style={{ width: 150, flex: "none" }}>
              <strong className="ds-num">{context.date(entry.at)}</strong>
              <div className="ds-subtle">{context.relative(entry.at)}</div>
            </div>
            <div className="ds-panel ds-grow" style={{ padding: "var(--space-4)" }}>
              <Row gap={2}>
                <strong className="ds-grow">{entry.title}</strong>
                <Pill tone={entry.kind === "Invoice" ? "accent" : entry.kind === "Deal" ? "info" : "neutral"}>{entry.kind}</Pill>
              </Row>
              {entry.detail && <p className="ds-subtle" style={{ marginBlockStart: 4 }}>{entry.detail}</p>}
              <Row gap={3} style={{ marginBlockStart: "var(--space-2)" }}>
                <span className="ds-subtle">{entry.who}</span>
                {entry.outcome && <span className="ds-subtle">{entry.outcome}</span>}
              </Row>
            </div>
          </Row>
        </li>
      ))}
    </ol>
  );
}

export function ContactDeals({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  const { org } = useWorkspace();
  if (!contact) return <Empty title="No contact selected" />;
  const deals = dealsOfContact(data, contact.id);
  if (deals.length === 0) {
    return <Empty title="No deal for this contact" action={<Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/crm/deals`)}>Open the pipeline</Button>} />;
  }
  return (
    <DataGrid
      rows={deals}
      rowId={(row) => row.id}
      label="Deals for this contact"
      columns={[
        { key: "title", header: "Deal", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} /> },
        { key: "close", header: "Expected close", cell: (row) => row.dueAt ? <span className="ds-num">{context.date(row.dueAt)}</span> : <span className="ds-subtle">Not set</span> },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold /> },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/crm/deals/${id}`)}
      summary={<Money minor={deals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)} context={context} bold />}
    />
  );
}

export function ContactService({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  if (!contact) return <Empty title="No contact selected" />;
  const tickets = ticketsOfContact(data, contact.id);
  const invoices = invoicesOfContact(data, contact.id);
  return (
    <Grid>
      <Card prov="human" span={6} title="Tickets" subtitle={`${tickets.length} recorded`} flush>
        {tickets.length === 0 ? <div className="ds-card-body"><span className="ds-subtle">No support ticket.</span></div> : (
          <DataGrid
            rows={tickets}
            rowId={(row) => row.id}
            label="Tickets"
            filterable={false}
            columns={[
              { key: "title", header: "Ticket", primary: true, cell: (row) => row.title },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "open" ? "warning" : "neutral"} dot>{row.status}</Pill> },
              { key: "priority", header: "Priority", cell: (row) => String(row.fields.priority ?? "normal") },
            ]}
          />
        )}
      </Card>
      <Card prov="human" span={6} title="Invoices" subtitle={`${invoices.length} recorded`} flush>
        {invoices.length === 0 ? <div className="ds-card-body"><span className="ds-subtle">No invoice.</span></div> : (
          <DataGrid
            rows={invoices}
            rowId={(row) => row.id}
            label="Invoices"
            filterable={false}
            columns={[
              { key: "title", header: "Invoice", primary: true, cell: (row) => row.title },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "paid" ? "success" : "info"} dot>{row.status.replace(/_/g, " ")}</Pill> },
              { key: "amount", header: "Gross", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
            ]}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/fin/invoices/${id}`)}
          />
        )}
      </Card>
    </Grid>
  );
}

export function ContactFiles({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  if (!contact) return <Empty title="No contact selected" />;
  const quotes = data.quotes.filter((quote) => String(quote.fields.contactId ?? "") === contact.id);
  const threads = data.threads.filter((thread) => String(thread.fields.to ?? "") === String(contact.fields.email ?? "~"));
  const attached = ((contact.body as { attached?: { id: string; collection: string; title: string; by: string; at: string }[] })?.attached) ?? [];
  return (
    <Grid>
      <Card prov="human" span={12} title="Attached records" subtitle={`${attached.length} linked by hand`}>
        <Stack gap={2}>
          {attached.map((item) => <Row key={item.id} gap={3}><Pill>{item.collection}</Pill><span className="ds-grow">{item.title}</span><span className="ds-subtle">{item.by}, {context.date(item.at)}</span></Row>)}
          {attached.length === 0 && <span className="ds-subtle">Nothing attached. Use Attach a record.</span>}
        </Stack>
      </Card>
      <Card prov="human" span={6} title="Quotes" subtitle={`${quotes.length} documents`} flush>
        {quotes.length === 0 ? <div className="ds-card-body"><span className="ds-subtle">No quote for this person.</span></div> : (
          <DataGrid
            rows={quotes}
            rowId={(row) => row.id}
            label="Quotes"
            filterable={false}
            columns={[
              { key: "number", header: "Quote", primary: true, cell: (row) => String(row.fields.number ?? row.title) },
              { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
              { key: "amount", header: "Total", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
            ]}
            onOpen={(id) => { context.navigate(`/o/${context.org.slug}/crm/quotes`); context.select(id); }}
          />
        )}
      </Card>
      <Card prov="human" span={6} title="Message drafts" subtitle={`${threads.length} local drafts`}>
        <Stack gap={2}>
          {threads.map((thread) => <Row key={thread.id} gap={2}><span className="ds-grow">{thread.title}</span><Pill tone="warning">Not sent</Pill></Row>)}
          {threads.length === 0 && <span className="ds-subtle">Nothing drafted to this address.</span>}
        </Stack>
        <CapabilityNotice id="email.send" />
      </Card>
    </Grid>
  );
}

export function ComposeMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const { contact } = useContact(context);
  const { org } = useWorkspace();
  const draftScope = `crm:contact-message:${org.id}:${context.actor}:${contact?.id ?? "none"}`;
  const [body, setBody] = useWorkingField(draftScope, "body", "");
  const [busy, setBusy] = useState(false);
  if (!contact) return <Empty title="No contact selected" />;
  const to = String(contact.fields.email ?? "");
  const suppressed = contact.fields.suppressed === true;
  const blocked = suppressed
    ? `${contact.title} asked not to be contacted, so no message is drafted.`
    : !to
      ? "No email address is recorded for this contact."
      : undefined;

  return (
    <Stack gap={4}>
      <CapabilityNotice id="email.send" title="Nothing leaves this browser" />
      <Properties rows={[
        { label: "To", value: to || "Not recorded" },
        { label: "Consent", value: <ConsentPill contact={contact} /> },
      ]} />
      {blocked && <Notice tone="danger" title="This message cannot be drafted">{blocked}</Notice>}
      <Field label="Message"><TextArea aria-label="Message" value={body} rows={8} onChange={(event) => setBody(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !body.trim()}
          onClick={async () => {
            setBusy(true);
            await context.mutate.create({
              collection: "emailThreads",
              title: `Draft to ${contact.title}`,
              status: "draft",
              summary: body.slice(0, 160),
              fields: { to, delivery: "not_connected", contactId: contact.id, author: context.actor },
              body: { messages: [{ at: clockIso(), from: `${context.actor} at ${org.name}`, body }] },
            }, `Message drafted to ${contact.title}`);
            await context.mutate.create({
              collection: "activities",
              title: `Email drafted to ${contact.title}`,
              status: "draft",
              summary: body.slice(0, 120),
              startAt: clockIso(),
              at: clockIso(),
              parentId: contact.id,
              fields: { kind: "email", contactId: contact.id, delivery: "not_connected", owner: context.actor },
            }, `Activity logged for the draft to ${contact.title}`);
            clearWorkingDraft(draftScope);
            context.toast("Draft saved", `The message to ${to} is kept in this workspace and logged as an activity. No mail provider is connected.`, "info");
            setBusy(false);
            close();
          }}
        >
          Save the draft
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function ActivityComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const { contact } = useContact(context);
  const data = useCrmData();
  const { now } = useWorkspace();
  const [kind, setKind] = useState((context.overlayPayload as { kind?: string } | undefined)?.kind ?? "call");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(now.toISOString().slice(0, 16));
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [dealId, setDealId] = useState("");
  const [busy, setBusy] = useState(false);
  const deals = contact ? dealsOfContact(data, contact.id) : [];

  return (
    <form
      id="activity-composer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const fields: Record<string, string | number | boolean> = { kind, owner: context.actor };
        if (contact) fields.contactId = contact.id;
        if (dealId) fields.dealId = dealId;
        if (outcome) fields.outcome = outcome;
        await context.mutate.create({
          collection: "activities",
          title: title.trim(),
          status: new Date(when) > now ? "open" : "done",
          summary: note,
          startAt: new Date(when).toISOString(),
          at: new Date(when).toISOString(),
          parentId: dealId || contact?.id,
          fields,
        }, `Activity ${title.trim()} logged`);
        context.toast("Activity logged", new Date(when) > now
          ? `${title.trim()} is scheduled for ${context.dateTime(when)}. No calendar is connected, so nothing was invited.`
          : `${title.trim()} is on the record with its outcome.`);
        setBusy(false);
        close();
      }}
    >
      <Row gap={3} wrap>
        <Field label="Kind">
          <Select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            {["call", "meeting", "email", "task", "note"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="When"><TextInput aria-label="When" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></Field>
        {deals.length > 0 && (
          <Field label="Deal">
            <Select aria-label="Deal" value={dealId} onChange={(event) => setDealId(event.target.value)}>
              <option value="">Not linked to a deal</option>
              {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
            </Select>
          </Field>
        )}
      </Row>
      <Field label="What happened" required><TextInput aria-label="What happened" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Outcome" hint="What changed as a result. This is what a stage requirement is judged on.">
        <TextInput aria-label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} />
      </Field>
      <Field label="Notes"><TextArea aria-label="Notes" value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>Log the activity</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </form>
  );
}

export function ContactInspector({ context }: { context: ScreenContext }) {
  const { contact, data } = useContact(context);
  const { org } = useWorkspace();
  if (!contact) return <Empty title="No contact" />;
  const deals = dealsOfContact(data, contact.id);
  const invoices = invoicesOfContact(data, contact.id);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Owner", value: String(contact.fields.owner ?? contact.ownerName) },
        { label: "Consent", value: <ConsentPill contact={contact} /> },
        { label: "Deals", value: String(deals.length) },
        { label: "Invoices", value: String(invoices.length) },
        { label: "Revision", value: String(contact.revision) },
      ]} />
      <Stack gap={2}>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("activity composer")}>Log an activity</Button>
        <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Compose message")}>Draft a message</Button>
        <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/contacts`)}>All contacts</Button>
      </Stack>
      {contact.fields.mergedFrom && (
        <Notice tone="info" title="Merged record">
          Source ids kept: {String(contact.fields.mergedFrom)}.
        </Notice>
      )}
    </Stack>
  );
}
