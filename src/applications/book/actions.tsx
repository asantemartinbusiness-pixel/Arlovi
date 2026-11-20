import { useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { getRecord, listByCollection } from "@/platform/repo";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { addDays } from "@/platform/clock";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { useUi } from "@/runtime/ui";
import type { Rec } from "@/domain/types";
import { documentTotals, statusFor, writeLines } from "@/domain/fin-invoice";
import type { TaxCategory } from "@/platform/money";
import { CHANGED_ELSEWHERE, createStore, downloadCsv, ProviderBoundary, type ConfirmSpec } from "@/applications/market/kit";
import {
  bodyOf, conflictsWithLinks, DEPOSIT_LABEL, isLive, useBookData,
  type BookingBody, type PublicPageBody, type PublicPageField, type ServiceBody,
} from "./data";

/* ====================================================================== *
 * BOOK contract actions that change a record. Every write that occupies a
 * slot re-checks it with the shared conflict rule first; every message to
 * a customer stops at the mail or telephony boundary.
 * ====================================================================== */

const iso = (context: ScreenContext) => context.now.toISOString();
const confirm = (context: ScreenContext, spec: ConfirmSpec) => context.openOverlay("confirm", spec);

async function load(context: ScreenContext, id: string | undefined): Promise<Rec | undefined> {
  if (!id) return undefined;
  const record = await getRecord(id);
  if (!record) context.toast("Not found", "That record is no longer in this workspace.", "failed");
  return record;
}

const message = (body: BookingBody, at: string, text: string): BookingBody => ({ ...body, messages: [...(body.messages ?? []), { at, direction: "out", body: text }] });

/* ---------------- ask the receptionist ---------------- */

export function askReceptionist() {
  useUi.getState().setAsk(true, "Receptionist: which appointments are booked today, and where is there free capacity?");
}

/* ---------------- confirm ---------------- */

export async function confirmBooking(context: ScreenContext, id: string | undefined) {
  const booking = await load(context, id);
  if (!booking) return;
  const [bookings, resources] = await Promise.all([listByCollection(context.org.id, "bookings"), listByCollection(context.org.id, "resources")]);
  const clashes = booking.startAt && booking.endAt
    ? conflictsWithLinks(bookings, resources, context.org.id, String(booking.fields.resourceId), booking.startAt, booking.endAt, booking.id)
    : [];
  const blocked = booking.status === "confirmed" ? `${booking.title} is already confirmed.`
    : ["cancelled", "completed", "no_show"].includes(booking.status) ? `${booking.title} is ${booking.status.replace("_", " ")}; it cannot be confirmed.`
      : !booking.startAt || !booking.endAt ? "The booking has no time, so the slot cannot be checked."
        : booking.startAt < iso(context) ? "The slot has already passed."
          : clashes.length ? `The slot is taken by ${clashes.map((clash) => clash.booking.title).join(", ")}. Move one of them first; an unavailable slot is never shown as confirmed.` : undefined;
  confirm(context, {
    title: `Confirm ${booking.title}`,
    consequence: `The slot on ${context.dateTime(booking.startAt)} was re-checked against every booking on this resource and anything linked to it, and is free. Confirming changes the booking from ${booking.status} to confirmed.`,
    facts: [{ label: "Starts", value: context.dateTime(booking.startAt) }, { label: "Deposit", value: DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? "—" }],
    blocked,
    boundary: "email.send",
    boundaryTitle: "The customer is not notified automatically",
    confirmLabel: "Confirm booking",
    run: async () => {
      const saved = await context.mutate.patch(booking.id, { status: "confirmed", fields: { ...booking.fields, confirmedBy: context.actor, confirmedAt: iso(context) } }, { expectRevision: booking.revision, event: `${booking.title} confirmed by ${context.actor} after a slot re-check` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Confirmed", `${booking.title} is confirmed. The customer has not been told: no provider is connected.`);
    },
  });
}

/* ---------------- invoice a completed booking ---------------- */

const TAX_CATEGORIES_KNOWN: TaxCategory[] = ["standard", "reduced", "zero_rated", "exempt", "outside_scope", "reverse_charge"];

/**
 * Why a booking cannot be invoiced, or undefined when it can. Only a completed
 * appointment for a priced service is invoiced, and only once.
 */
export function bookingInvoiceBlock(booking: Rec, service: Rec | undefined): string | undefined {
  if (booking.fields.invoiceId) return `${booking.title} is already invoiced as ${String(booking.fields.invoiceNumber || "a draft")}. A second invoice would bill the customer twice.`;
  if (booking.status !== "completed") return `${booking.title} is ${booking.status.replace("_", " ")}. Only a completed appointment is invoiced.`;
  if (!service) return "The booking has no service, so there is nothing to price.";
  if (!(service.amountMinor ?? 0)) return `${service.title} is free, so there is nothing to invoice.`;
  return undefined;
}

/**
 * Raise a draft invoice in Finance from a completed booking. The invoice uses
 * the Finance record shape and the shared tax engine, is linked to the booking
 * and the customer, and stays a draft: it is in no ledger until Finance
 * approves and posts it.
 */
export async function raiseBookingInvoice(context: ScreenContext, id: string | undefined) {
  const booking = await load(context, id);
  if (!booking) return;
  const [service, contact, invoices] = await Promise.all([
    booking.fields.serviceId ? getRecord(String(booking.fields.serviceId)) : Promise.resolve(undefined),
    booking.fields.contactId ? getRecord(String(booking.fields.contactId)) : Promise.resolve(undefined),
    listByCollection(context.org.id, "invoices"),
  ]);
  const category = String(service?.fields.taxCategory ?? "standard") as TaxCategory;
  const seats = Math.max(1, Number(booking.fields.seats ?? 1));
  const line = {
    id: "l1",
    description: `${service?.title ?? "Appointment"} on ${context.dateTime(booking.startAt)}`,
    quantity: seats,
    unitPriceMinor: service?.amountMinor ?? 0,
    taxCategory: TAX_CATEGORIES_KNOWN.includes(category) ? category : "standard",
    discountBp: 0,
  };
  const status = statusFor(undefined, contact);
  const totals = documentTotals({ lines: [line], jurisdiction: context.org.jurisdiction, customerStatus: status, date: (booking.startAt ?? iso(context)).slice(0, 10) });
  const numbers = invoices.map((invoice) => Number(/(\d+)/.exec(String(invoice.fields.number ?? invoice.title))?.[1] ?? 0)).filter((value) => value > 0);
  const number = `INV-${Math.max(1000, ...numbers) + 1}`;
  const deposit = String(booking.fields.depositState) === "paid_local" ? Number(booking.fields.depositMinor ?? 0) : 0;
  confirm(context, {
    title: `Raise an invoice for ${booking.title}`,
    consequence: `A draft invoice ${number} for ${context.money(totals.grossMinor)} is created in Finance, linked to this booking and to ${contact?.title ?? "no customer"}. It is a draft: nothing is posted to the ledger and nothing is sent until Finance approves and issues it.`,
    facts: [
      { label: "Service", value: service?.title ?? "—" },
      { label: "Customer", value: contact?.title ?? "No contact linked" },
      { label: "Net", value: context.money(totals.netMinor) },
      { label: "Tax", value: context.money(totals.taxMinor) },
      { label: "Gross", value: context.money(totals.grossMinor) },
      ...(deposit ? [{ label: "Deposit recorded as received", value: `${context.money(deposit)}, to be allocated against the invoice in Finance` }] : []),
    ],
    blocked: bookingInvoiceBlock(booking, service) ?? (contact ? undefined : "The booking has no customer linked, so the invoice would have no one to bill."),
    confirmLabel: `Create draft ${number}`,
    run: async () => {
      const fresh = await getRecord(booking.id);
      if (!fresh || fresh.revision !== booking.revision) return CHANGED_ELSEWHERE;
      if (fresh.fields.invoiceId) return `${booking.title} already has an invoice.`;
      const invoice = await context.mutate.create({
        collection: "invoices",
        title: number,
        status: "draft",
        summary: `Raised from the completed booking ${booking.title}.`,
        amountMinor: totals.grossMinor,
        at: iso(context),
        dueAt: addDays(context.now, 14).toISOString(),
        parentId: contact?.id,
        tags: ["draft", "from-booking"],
        fields: {
          number,
          contactId: contact?.id ?? "",
          bookingId: booking.id,
          serviceId: service?.id ?? "",
          netMinor: totals.netMinor,
          taxMinor: totals.taxMinor,
          customerTaxStatus: status,
          taxUnresolved: totals.hasUnknownRate,
          depositReceivedMinor: deposit,
        },
        body: writeLines([line]),
      }, `Invoice ${number} drafted from the completed booking ${booking.title}`);
      const saved = await context.mutate.patch(booking.id, {
        fields: { invoiceId: invoice.id, invoiceNumber: number, invoicedBy: context.actor, invoicedAt: iso(context) },
      }, { expectRevision: booking.revision, event: `${booking.title} invoiced as draft ${number} by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Draft invoice created", `${number} for ${context.money(totals.grossMinor)} is a draft in Finance, linked to this booking. It is not on the ledger until Finance approves it.`);
    },
  });
}

/* ---------------- cancel ---------------- */

/** Cancelling asks for a reason first; the form shows the notice policy and fee before anything changes. */
export function cancelBooking(context: ScreenContext) {
  context.openOverlay("cancel booking", { id: context.selectedId });
}

/* ---------------- reschedule notice ---------------- */

export function RescheduleNotice({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const booking = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!booking) return <Empty title="Select a booking" />;
  return <RescheduleNoticeGate context={context} close={close} booking={booking} />;
}

function RescheduleNoticeGate({ context, close, booking }: { context: ScreenContext; close: () => void; booking: Rec }) {
  const data = useBookData();
  if (data.contacts.length === 0) return <Empty title="Loading" />;
  return <RescheduleNoticeForm key={booking.id} context={context} close={close} booking={booking} data={data} />;
}

function RescheduleNoticeForm({ context, close, booking, data }: { context: ScreenContext; close: () => void; booking: Rec; data: ReturnType<typeof useBookData> }) {
  const contact = data.contacts.find((item) => item.id === String(booking.fields.contactId ?? ""));
  const [text, setText] = useState(`Hello ${contact?.title.split(" ")[0] ?? "there"}, your appointment is now on ${context.dateTime(booking.startAt)}. Reply if that time does not suit you.`);
  const allowed = contact?.fields.consentEmail === true;
  return (
    <form
      id="reschedule-notice"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim() || !contact) return;
        const saved = await context.mutate.patch(booking.id, {
          fields: { ...booking.fields, rescheduleNoticeState: "ready_local", rescheduleNoticeAt: iso(context) },
          body: message(bodyOf<BookingBody>(booking, {}), iso(context), `Reschedule notice: ${text.trim()} (kept locally; not sent)`),
        }, { expectRevision: booking.revision, event: `Reschedule notice for ${booking.title} kept as a local draft` });
        if (!saved) return;
        context.toast("Notice kept as a draft", `The notice to ${contact.title} is on the booking. It was not sent.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Booking", value: booking.title },
        { label: "Now starts", value: context.dateTime(booking.startAt) },
        { label: "Last changed", value: `${context.relative(booking.updatedAt)} by ${booking.updatedBy}` },
        { label: "To", value: contact ? `${contact.title} · ${String(contact.fields.email ?? "no email")}` : "No customer on this booking" },
        { label: "Email consent", value: allowed ? <Pill tone="success">Recorded</Pill> : <Pill tone="warning">Not recorded</Pill> },
      ]} />
      <Field label="Notice" required><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      {!contact && <Notice tone="warning" title="Nobody to notify">Link a customer to the booking first.</Notice>}
      {contact && !allowed && <Notice tone="info">A notice about an existing appointment is a service message, so it can be kept without marketing consent; the customer's preference is still shown here.</Notice>}
      <ProviderBoundary kept={"the booking and any message are held locally; no confirmation or reminder has been sent."} id="email.send" />
    </form>
  );
}

/* ---------------- send a reminder ---------------- */

function channelAllowed(contact: Rec | undefined, channel: string): string | undefined {
  if (!contact) return "The booking has no customer record.";
  if (contact.fields.suppressed === true) return `${contact.title} is suppressed and is never contacted.`;
  if (channel === "sms") return contact.fields.consentSms === true && String(contact.fields.phone ?? "") ? undefined : `${contact.title} has not agreed to text messages, or no number is recorded.`;
  return contact.fields.consentEmail === true && String(contact.fields.email ?? "") ? undefined : `${contact.title} has no email consent recorded.`;
}

export async function sendReminder(context: ScreenContext) {
  const booking = await load(context, context.params.id);
  if (!booking) return;
  const [templates, contact, service] = await Promise.all([
    listByCollection(context.org.id, "templates"),
    booking.fields.contactId ? getRecord(String(booking.fields.contactId)) : Promise.resolve(undefined),
    booking.fields.serviceId ? getRecord(String(booking.fields.serviceId)) : Promise.resolve(undefined),
  ]);
  const rules = templates.filter((template) => String(template.fields.kind) === "reminder" && template.fields.enabled === true && Number(template.fields.offsetHours ?? 0) > 0);
  const usable = rules.find((rule) => !channelAllowed(contact, String(rule.fields.channel)));
  const rule = usable ?? rules[0];
  const why = rule ? channelAllowed(contact, String(rule.fields.channel)) : "No reminder rule is enabled.";
  const body = bodyOf<{ subject?: string; body?: string }>(rule, {});
  const text = (body.body ?? "")
    .replace(/\{\{first_name\}\}/g, contact?.title.split(" ")[0] ?? "there")
    .replace(/\{\{service\}\}/g, service?.title ?? "your appointment")
    .replace(/\{\{time\}\}/g, booking.startAt ? new Date(booking.startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "the booked time")
    .replace(/\{\{notice_hours\}\}/g, String(service?.fields.cancellationNoticeHours ?? 24));
  const channel = String(rule?.fields.channel ?? "email");
  confirm(context, {
    title: `Send a reminder for ${booking.title}`,
    consequence: <>The reminder <strong>{rule?.title ?? "—"}</strong> is rendered for this booking and queued by {channel}. Its state becomes "{CAPABILITY_LABELS.queued_local}"; the text is kept on the booking.<br /><em>{text || "No text"}</em></>,
    facts: [
      { label: "Channel", value: channel },
      { label: "To", value: channel === "sms" ? String(contact?.fields.phone ?? "No number") : String(contact?.fields.email ?? "No email") },
      { label: "Starts", value: context.dateTime(booking.startAt) },
    ],
    blocked: !isLive(booking) || booking.status === "completed" ? `${booking.title} is ${booking.status}, so there is nothing to remind about.` : why ? `${why} The customer's contact preference is honoured, so no reminder is queued.` : undefined,
    boundary: channel === "sms" ? "telephony" : "email.send",
    confirmLabel: "Queue the reminder locally",
    run: async () => {
      if (!rule) return;
      const saved = await context.mutate.patch(booking.id, {
        fields: { ...booking.fields, reminderState: "queued_local", lastReminderAt: iso(context), lastReminderRule: rule.id },
        body: message(bodyOf<BookingBody>(booking, {}), iso(context), `Reminder (${channel}): ${text} — queued locally, not sent.`),
      }, { expectRevision: booking.revision, event: `${rule.title} reminder for ${booking.title} queued locally by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Reminder queued locally", `The ${channel} reminder is on the booking. Nothing was sent: no provider is connected.`);
    },
  });
}

/* ---------------- BOOK-004 publish and archive a service ---------------- */

export async function publishService(context: ScreenContext) {
  const service = await load(context, context.selectedId);
  if (!service) return;
  const sites = await listByCollection(context.org.id, "sites");
  const page = sites.find((site) => String(site.fields.kind) === "bookingPage");
  const pageBody = bodyOf<PublicPageBody>(page, {});
  const resources = bodyOf<ServiceBody>(service, {}).resources ?? [];
  const onPage = (pageBody.services ?? []).includes(service.id);
  confirm(context, {
    title: `Publish ${service.title}`,
    consequence: `The service is marked published and offered on ${page?.title ?? "the public booking page"}, at ${context.money(service.amountMinor)} net; the customer price is resolved by the tax engine at booking.`,
    facts: [
      { label: "Length", value: `${String(service.fields.minutes ?? "—")} minutes + ${String(service.fields.bufferMinutes ?? 0)} buffer` },
      { label: "Resources", value: String(resources.length) },
      { label: "On the booking page", value: onPage ? "Already offered" : "Will be added" },
    ],
    blocked: service.status === "archived" ? "An archived service cannot be published."
      : !service.amountMinor ? "The service has no price." : resources.length === 0 ? "No resource can deliver it, so it would have no availability."
        : service.fields.published === true && onPage ? "Already published and offered." : !page ? "There is no public booking page record." : undefined,
    boundary: "site.publish",
    boundaryNote: "The page itself is not hosted, so publishing makes the service bookable in this workspace and in the exported page only.",
    confirmLabel: "Publish service",
    run: async () => {
      const saved = await context.mutate.patch(service.id, { status: "active", fields: { ...service.fields, published: true, publishedBy: context.actor, publishedAt: iso(context) } }, { expectRevision: service.revision, event: `Service ${service.title} published by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      if (page && !onPage) {
        const added = await context.mutate.patch(page.id, { body: { ...pageBody, services: [...(pageBody.services ?? []), service.id] } }, { expectRevision: page.revision, event: `${service.title} offered on ${page.title}` });
        if (!added) return CHANGED_ELSEWHERE;
      }
      context.toast("Published", `${service.title} is offered on the booking page model.`);
    },
  });
}

export async function archiveService(context: ScreenContext) {
  const service = await load(context, context.selectedId);
  if (!service) return;
  const [bookings, sites] = await Promise.all([listByCollection(context.org.id, "bookings"), listByCollection(context.org.id, "sites")]);
  const theirs = bookings.filter((booking) => String(booking.fields.serviceId) === service.id);
  const upcoming = theirs.filter((booking) => ["confirmed", "hold"].includes(booking.status) && (booking.startAt ?? "") >= iso(context));
  const unreconciled = theirs.filter((booking) => ["confirmed", "hold"].includes(booking.status) && (booking.startAt ?? "") < iso(context));
  const owed = theirs.filter((booking) => String(booking.fields.depositState) === "awaiting_payment" && booking.status !== "cancelled");
  const page = sites.find((site) => String(site.fields.kind) === "bookingPage");
  const pageBody = bodyOf<PublicPageBody>(page, {});
  const problems = upcoming.length + unreconciled.length + owed.length;
  confirm(context, {
    title: `Archive ${service.title}`,
    tone: "danger",
    consequence: "The service stops being offered and is removed from the booking page. Past bookings keep pointing at it.",
    facts: [
      { label: "Upcoming bookings", value: String(upcoming.length) },
      { label: "Past bookings not checked in or closed", value: String(unreconciled.length) },
      { label: "Deposits awaiting payment", value: String(owed.length) },
    ],
    blocked: service.status === "archived" ? "Already archived."
      : problems ? `${problems} booking${problems === 1 ? " is" : "s are"} not reconciled: ${[...upcoming, ...unreconciled, ...owed].slice(0, 3).map((booking) => booking.title).join(", ")}${problems > 3 ? "…" : ""}. Move, close or settle them first.` : undefined,
    confirmLabel: "Archive service",
    run: async () => {
      const saved = await context.mutate.patch(service.id, { status: "archived", fields: { ...service.fields, published: false, archivedBy: context.actor, archivedAt: iso(context) } }, { expectRevision: service.revision, event: `Service ${service.title} archived by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      if (page && (pageBody.services ?? []).includes(service.id)) {
        if (!(await context.mutate.patch(page.id, { body: { ...pageBody, services: (pageBody.services ?? []).filter((id) => id !== service.id) } }, { expectRevision: page.revision, event: `${service.title} removed from ${page.title}` }))) return CHANGED_ELSEWHERE;
      }
      context.toast("Archived", `${service.title} is no longer offered.`);
    },
  });
}

/* ---------------- BOOK-005 assign a resource ---------------- */

export function AssignResource({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const resource = useRecord(context.selectedId);
  const [serviceId, setServiceId] = useState("");
  if (!resource || resource.collection !== "resources") return <Empty title="Select a resource" />;
  const candidates = data.services.filter((service) => service.status !== "archived");
  const service = candidates.find((item) => item.id === (serviceId || candidates.find((candidate) => !(bodyOf<ServiceBody>(candidate, {}).resources ?? []).includes(resource.id))?.id));
  const already = service ? (bodyOf<ServiceBody>(service, {}).resources ?? []).includes(resource.id) : false;
  const linked = data.resources.find((item) => item.id === String(resource.fields.linkedResourceId ?? "")) ?? data.resources.find((item) => String(item.fields.linkedResourceId ?? "") === resource.id);
  return (
    <form
      id="assign-resource"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!service || already) return;
        const body = bodyOf<ServiceBody>(service, {});
        const saved = await context.mutate.patch(service.id, { body: { ...body, resources: [...(body.resources ?? []), resource.id] } }, { expectRevision: service.revision, event: `${resource.title} assigned to ${service.title} by ${context.actor}` });
        if (!saved) return;
        context.toast("Assigned", `${service.title} can now be delivered by ${resource.title}. Every booking still re-checks the slot.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Resource", value: resource.title }, { label: "Kind", value: String(resource.fields.kind) }, { label: "Hours", value: String(resource.fields.workingHours ?? "—") }]} />
      <Field label="Assign to service">
        <Select value={service?.id ?? ""} onChange={(event) => setServiceId(event.target.value)}>
          {candidates.map((item) => <option key={item.id} value={item.id}>{item.title}{(bodyOf<ServiceBody>(item, {}).resources ?? []).includes(resource.id) ? " (already assigned)" : ""}</option>)}
        </Select>
      </Field>
      {already && <Notice tone="info">{resource.title} already delivers {service?.title}.</Notice>}
      {linked && <Notice tone="warning" title={`Linked to ${linked.title}`}>A booking on {resource.title} also blocks {linked.title}, and the other way round, so the two can never be confirmed into overlapping slots.</Notice>}
    </form>
  );
}

/* ---------------- BOOK-006 arrange fields, test the page ---------------- */

export function ArrangeFields({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const page = data.sites.find((site) => String(site.fields.kind) === "bookingPage");
  if (!page) return <Empty title="No booking page" />;
  return <ArrangeFieldsForm key={page.id} context={context} close={close} page={page} />;
}

function ArrangeFieldsForm({ context, close, page }: { context: ScreenContext; close: () => void; page: Rec }) {
  const [fields, setFields] = useState<PublicPageField[]>(bodyOf<PublicPageBody>(page, {}).fields ?? []);
  const [note, setNote] = useState("");
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
    setNote(`${fields[index].label} moved to position ${target + 1}.`);
  };
  const consentLast = fields.length > 0 && fields[fields.length - 1].type === "consent";
  return (
    <form
      id="arrange-fields"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await context.mutate.patch(page.id, { body: { ...bodyOf<PublicPageBody>(page, {}), fields } }, { expectRevision: page.revision, event: `Booking page fields arranged: ${fields.map((field) => field.label).join(", ")}` });
        if (!saved) return;
        context.toast("Fields arranged", "The public page asks for them in this order.");
        close();
      }}
    >
      <ol className="ds-stack ds-gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {fields.map((field, index) => (
          <li key={field.id} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}
            draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); if (!Number.isNaN(from)) move(from, index - from); }}>
            <Row gap={2}>
              <span className="ds-num">{index + 1}</span>
              <strong className="ds-grow">{field.label}</strong>
              <Pill>{field.type}</Pill>
              <Checkbox label="Required" checked={field.required} disabled={field.type === "consent"} onChange={(event) => setFields((current) => current.map((item) => (item.id === field.id ? { ...item, required: event.target.checked } : item)))} />
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${field.label} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            </Row>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="ds-subtle">{note || "Drag a field, or use its arrow buttons."}</p>
      {!consentLast && <Notice tone="warning" title="Consent is usually asked last">Visitors agree to the privacy notice after they have seen what they are giving.</Notice>}
    </form>
  );
}

function offsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export async function testBookingPage(context: ScreenContext) {
  const [sites, services, resources, bookings] = await Promise.all([
    listByCollection(context.org.id, "sites"), listByCollection(context.org.id, "services"),
    listByCollection(context.org.id, "resources"), listByCollection(context.org.id, "bookings"),
  ]);
  const page = sites.find((site) => String(site.fields.kind) === "bookingPage");
  if (!page) { context.toast("No booking page", "There is no public booking page record to test.", "blocked"); return; }
  const body = bodyOf<PublicPageBody>(page, {});
  const timeZone = String(page.fields.timezone ?? context.org.timezone);
  // Find the next offset change within a year and check that a 10:00 slot either side keeps its wall-clock time.
  let change: Date | undefined;
  for (let day = 1; day <= 366 && !change; day += 1) {
    if (offsetMinutes(addDays(context.now, day), timeZone) !== offsetMinutes(addDays(context.now, day - 1), timeZone)) change = addDays(context.now, day);
  }
  const wallClock = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const slotAt = (day: Date) => { const base = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 10, 0)); return new Date(base.getTime() - offsetMinutes(base, timeZone) * 60_000); };
  const dstOk = !change || (wallClock(slotAt(addDays(change, -2))) === "10:00" && wallClock(slotAt(addDays(change, 2))) === "10:00");
  const offered = services.filter((service) => (body.services ?? []).includes(service.id));
  const holds = bookings.filter((booking) => booking.status === "hold" && booking.startAt && booking.endAt);
  const heldOffered = holds.some((booking) => conflictsWithLinks(bookings, resources, context.org.id, String(booking.fields.resourceId), booking.startAt!, booking.endAt!).length === 0);
  const checks = [
    { label: `Times shown in ${timeZone}`, ok: timeZone === context.org.timezone },
    { label: change ? `A 10:00 slot stays at 10:00 across the clock change on ${context.date(change)}` : "No clock change in the next year", ok: dstOk },
    { label: "At least one published service is offered", ok: offered.some((service) => service.status !== "archived") },
    { label: "Every offered service has a resource", ok: offered.every((service) => (bodyOf<ServiceBody>(service, {}).resources ?? []).length > 0) },
    { label: "A consent field is required", ok: (body.fields ?? []).some((field) => field.type === "consent" && field.required) },
    { label: `Held slots are not offered as free (${holds.length} checked)`, ok: !heldOffered },
  ];
  const failed = checks.filter((check) => !check.ok);
  const saved = await context.mutate.patch(page.id, { fields: { ...page.fields, testedAt: iso(context), testedBy: context.actor, testsPassed: failed.length === 0, testsFailed: failed.map((check) => check.label).join("; ") } }, { expectRevision: page.revision, event: `Booking page tested by ${context.actor}: ${checks.length - failed.length} of ${checks.length} checks passed` });
  if (!saved) return;
  context.openOverlay("page test", { checks });
}

export function PageTestResult({ context }: { context: ScreenContext }) {
  const checks = (context.overlayPayload as { checks?: { label: string; ok: boolean }[] } | undefined)?.checks ?? [];
  return (
    <Stack gap={3}>
      {checks.map((check) => (
        <Row key={check.label} gap={2}><Pill tone={check.ok ? "success" : "danger"} dot>{check.ok ? "Pass" : "Fail"}</Pill><span className="ds-grow">{check.label}</span></Row>
      ))}
      {checks.length === 0 && <Empty title="Run the test from the page actions" />}
      <Notice tone="info">The result is recorded on the booking page record with your name. The checks run against the page model in this browser; no hosted page exists to test.</Notice>
    </Stack>
  );
}

/* ---------------- BOOK-007 schedule reminders, test send ---------------- */

export async function scheduleReminders(context: ScreenContext) {
  const [templates, bookings, contacts] = await Promise.all([
    listByCollection(context.org.id, "templates"), listByCollection(context.org.id, "bookings"), listByCollection(context.org.id, "contacts"),
  ]);
  const rules = templates.filter((template) => String(template.fields.kind) === "reminder" && template.fields.enabled === true && String(template.fields.approval) === "approved");
  const upcoming = bookings.filter((booking) => ["confirmed", "hold"].includes(booking.status) && (booking.startAt ?? "") > iso(context) && (booking.startAt ?? "") < addDays(context.now, 14).toISOString());
  const plan: { booking: Rec; rule: Rec; at: string }[] = [];
  const skipped: { booking: Rec; rule: Rec; why: string }[] = [];
  for (const booking of upcoming) {
    const contact = contacts.find((item) => item.id === String(booking.fields.contactId));
    const already = String(booking.fields.scheduledReminders ?? "").split(",");
    for (const rule of rules) {
      if (already.includes(rule.id)) continue;
      const why = channelAllowed(contact, String(rule.fields.channel));
      const at = new Date(new Date(booking.startAt!).getTime() - Number(rule.fields.offsetHours ?? 24) * 3_600_000).toISOString();
      if (why) skipped.push({ booking, rule, why });
      else plan.push({ booking, rule, at: at < iso(context) ? iso(context) : at });
    }
  }
  confirm(context, {
    title: "Schedule reminders",
    consequence: `${plan.length} reminder${plan.length === 1 ? "" : "s"} are queued against ${new Set(plan.map((row) => row.booking.id)).size} bookings in the next 14 days, from ${rules.length} approved rule${rules.length === 1 ? "" : "s"}. ${skipped.length} are left out because the customer's preference does not allow that channel. A reminder already scheduled for a booking is never queued twice.`,
    facts: [
      ...plan.slice(0, 5).map((row) => ({ label: `${row.booking.title} · ${row.rule.title}`, value: `${String(row.rule.fields.channel)} · ${context.dateTime(row.at)}` })),
      ...skipped.slice(0, 3).map((row) => ({ label: `Left out · ${row.booking.title} · ${String(row.rule.fields.channel)}`, value: row.why })),
    ],
    blocked: rules.length === 0 ? "No reminder rule is approved and enabled." : plan.length === 0 ? "Every eligible upcoming booking already has its reminders scheduled." : undefined,
    boundary: "email.send",
    boundaryNote: `Each reminder is "${CAPABILITY_LABELS.queued_local}". Nothing will be sent at its time until a provider is connected.`,
    confirmLabel: `Queue ${plan.length} reminder${plan.length === 1 ? "" : "s"}`,
    run: async () => {
      const byBooking = new Map<string, { booking: Rec; rows: typeof plan }>();
      for (const row of plan) byBooking.set(row.booking.id, { booking: row.booking, rows: [...(byBooking.get(row.booking.id)?.rows ?? []), row] });
      for (const { booking, rows } of byBooking.values()) {
        const ids = [...String(booking.fields.scheduledReminders ?? "").split(",").filter(Boolean), ...rows.map((row) => row.rule.id)];
        const saved = await context.mutate.patch(booking.id, {
          fields: { ...booking.fields, reminderState: "queued_local", scheduledReminders: ids.join(","), nextReminderAt: rows.map((row) => row.at).sort()[0] },
        }, { expectRevision: booking.revision, event: `${rows.length} reminder${rows.length === 1 ? "" : "s"} queued locally for ${booking.title}` });
        if (!saved) return CHANGED_ELSEWHERE;
      }
      context.toast("Reminders queued locally", `${plan.length} reminders are scheduled in this browser. ${skipped.length} were left out to honour contact preferences.`);
    },
  });
}

export async function recordTestSend(context: ScreenContext, template: Rec, recipient: string) {
  const saved = await context.mutate.patch(template.id, { fields: { ...template.fields, lastTestAt: iso(context), lastTestBy: context.actor, lastTestState: "queued_local" } }, { expectRevision: template.revision, event: `Test send of ${template.title} to ${recipient} held locally` });
  if (!saved) return;
  await context.mutate.log(`Test of ${template.title} to ${recipient} queued locally; no ${String(template.fields.channel) === "sms" ? "telephony" : "mail"} provider is connected.`, { entityId: template.id, type: "reminder.test", capability: "queued_local" });
  context.toast("Test send held locally", `The rendered test is recorded against ${template.title}. It was not delivered.`);
}

/* ---------------- BOOK-008 filter, compare, export, schedule ---------------- */

export const reportFilter = createStore<{ serviceId: string; resourceId: string }>({ serviceId: "", resourceId: "" });

export function useReportFilter() {
  return useSyncExternalStore(reportFilter.subscribe, reportFilter.get, reportFilter.get);
}

export function applyReportFilter(bookings: Rec[], filter: { serviceId: string; resourceId: string }) {
  return bookings.filter((booking) => (!filter.serviceId || String(booking.fields.serviceId) === filter.serviceId) && (!filter.resourceId || String(booking.fields.resourceId) === filter.resourceId));
}

export function ReportFilterNote() {
  const data = useBookData();
  const filter = useReportFilter();
  if (!filter.serviceId && !filter.resourceId) return null;
  const names = [data.services.find((item) => item.id === filter.serviceId)?.title, data.resources.find((item) => item.id === filter.resourceId)?.title].filter(Boolean).join(" · ");
  return (
    <Notice tone="info" title={`Filtered: ${names || "loading"}`} actions={<Button size="sm" variant="ghost" onClick={() => reportFilter.set({ serviceId: "", resourceId: "" })}>Clear filter</Button>}>
      Every figure below counts only the matching bookings.
    </Notice>
  );
}

export function ReportFilter({ close }: { close: () => void }) {
  const data = useBookData();
  const current = useReportFilter();
  const [serviceId, setServiceId] = useState(current.serviceId);
  const [resourceId, setResourceId] = useState(current.resourceId);
  return (
    <form id="report-filter" className="ds-stack ds-gap-4" onSubmit={(event) => { event.preventDefault(); reportFilter.set({ serviceId, resourceId }); close(); }}>
      <Field label="Service"><Select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Every service</option>{data.services.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Resource"><Select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Every resource</option>{data.resources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Notice tone="info">{applyReportFilter(data.bookings, { serviceId, resourceId }).length} of {data.bookings.length} bookings match. Every report tab uses the filter until it is cleared.</Notice>
      <Button variant="ghost" onClick={() => { setServiceId(""); setResourceId(""); }}>Clear</Button>
    </form>
  );
}

export function ComparePeriods({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const filter = useReportFilter();
  const [days, setDays] = useState(28);
  const end = context.now.getTime();
  const span = days * 86_400_000;
  const scoped = applyReportFilter(data.bookings, filter);
  const window = (from: number, to: number) => {
    const rows = scoped.filter((booking) => booking.startAt && new Date(booking.startAt).getTime() > from && new Date(booking.startAt).getTime() <= to);
    const live = rows.filter(isLive);
    return {
      bookings: live.length,
      seats: live.reduce((sum, booking) => sum + Number(booking.fields.seats ?? 1), 0),
      noShows: rows.filter((booking) => booking.status === "no_show").length,
      cancelled: rows.filter((booking) => booking.status === "cancelled").length,
      value: live.reduce((sum, booking) => sum + (booking.amountMinor ?? 0), 0),
    };
  };
  const a = window(end - span, end);
  const b = window(end - 2 * span, end - span);
  const rows = [
    { label: "Bookings (live)", a: String(a.bookings), b: String(b.bookings) },
    { label: "Seats booked", a: String(a.seats), b: String(b.seats) },
    { label: "No-shows", a: String(a.noShows), b: String(b.noShows) },
    { label: "Cancelled", a: String(a.cancelled), b: String(b.cancelled) },
    { label: "Booked value (net)", a: context.money(a.value), b: context.money(b.value) },
  ];
  return (
    <Stack gap={4}>
      <Field label="Period"><Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>{[7, 28, 91].map((value) => <option key={value} value={value}>{value} days</option>)}</Select></Field>
      <DataGrid rows={rows} rowId={(row) => row.label} label="Booking periods compared" filterable={false}
        columns={[
          { key: "label", header: "Measure", primary: true, cell: (row) => row.label },
          { key: "a", header: `Last ${days} days`, align: "end", cell: (row) => <span className="ds-num">{row.a}</span> },
          { key: "b", header: `The ${days} before`, align: "end", cell: (row) => <span className="ds-num">{row.b}</span> },
        ]} />
      <Notice tone="info" title="How group bookings count">A group booking counts once as a booking and once per seat under seats, so a six-seat workshop is never reported as six appointments.</Notice>
    </Stack>
  );
}

export async function exportBookings(context: ScreenContext) {
  const [bookings, services, resources] = await Promise.all([listByCollection(context.org.id, "bookings"), listByCollection(context.org.id, "services"), listByCollection(context.org.id, "resources")]);
  const rows = applyReportFilter(bookings, reportFilter.get()).sort((x, y) => (x.startAt ?? "").localeCompare(y.startAt ?? ""));
  const count = downloadCsv(`${context.org.slug}-bookings.csv`,
    ["booking", "starts", "ends", "service", "resource", "status", "seats", "net_minor", "deposit_state", "currency"],
    rows.map((booking) => [booking.title, booking.startAt, booking.endAt, services.find((item) => item.id === String(booking.fields.serviceId))?.title ?? "", resources.find((item) => item.id === String(booking.fields.resourceId))?.title ?? "", booking.status, Number(booking.fields.seats ?? 1), booking.amountMinor ?? 0, String(booking.fields.depositState ?? "none"), context.org.currency]));
  await context.mutate.log(`Bookings exported as CSV (${count} rows)`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} bookings downloaded from this browser, one row per booking with its seat count.`);
}

export function ScheduleReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const { actor } = useWorkspace();
  const [measure, setMeasure] = useState("Utilisation");
  const [every, setEvery] = useState("Monday morning");
  const [to, setTo] = useState(actor);
  return (
    <form
      id="schedule-report"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences", title: `${measure} · ${every}`, status: "active", summary: `Booking report delivered ${every.toLowerCase()} to ${to}.`,
          fields: { kind: "scheduledReport", scope: "BOOK", measure, every, to, delivery: "not_connected", filterService: reportFilter.get().serviceId, filterResource: reportFilter.get().resourceId },
        }, `Booking report ${measure} scheduled ${every.toLowerCase()} for ${to}`);
        context.toast("Report scheduled", `The schedule is saved. It is "${CAPABILITY_LABELS.not_connected}": nothing will be emailed until a mail provider is connected.`);
        close();
      }}
    >
      <Field label="Measure"><Select value={measure} onChange={(event) => setMeasure(event.target.value)}>{["Utilisation", "Booked value", "No-show rate", "Seats and slots"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Every"><Select value={every} onChange={(event) => setEvery(event.target.value)}>{["Monday morning", "First of the month", "Friday afternoon"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Deliver to"><Select value={to} onChange={(event) => setTo(event.target.value)}>{["Maya Chen", "Priya Shah", "Theo Marsh", "Jonah Adeyemi"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <ProviderBoundary kept={"the booking and any message are held locally; no confirmation or reminder has been sent."} id="email.send" />
    </form>
  );
}
