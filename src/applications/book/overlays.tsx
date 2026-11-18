import { useMemo, useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, ModalActions, ModalInFlight, ModalUnsavedChanges, MoneyInput, Notice, Pill, Properties, Row,
  Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, clockIso } from "@/platform/clock";
import { computeInvoice } from "@/platform/money";
import { CHANGED_ELSEWHERE, ProviderBoundary, TotalsBlock } from "@/applications/market/kit";
import {
  blackoutFor, bodyOf, conflictsWithLinks, DEPOSIT_LABEL, isBookable, isLive, rememberResource, statusTone, useBookData,
  workingHours, type BookingBody, type PublicPageBody, type ResourceBody, type ServiceBody,
} from "./data";
import { ConflictNotice, SlotPicker } from "./calendar";
import { overlappingOn, reasonError, reasonLabel, RESCHEDULE_REASONS, resourceCapacity, seatsOf, slotProblems } from "./availability";
import { recordTestSend } from "./actions";
import type { Rec } from "@/domain/types";
import "./deposit-modal.css";

/* ====================================================================== *
 * BOOK overlays. Every slot a form offers has been checked for a conflict
 * with findBookingConflict before it is shown as available.
 * ====================================================================== */

export function freeSlots(
  bookings: ReturnType<typeof useBookData>["bookings"],
  resources: ReturnType<typeof useBookData>["resources"],
  orgId: string,
  resourceId: string,
  minutes: number,
  from: Date,
  days = 5,
) {
  const resource = resources.find((item) => item.id === resourceId);
  const window = workingHours(resource);
  const slots: { startAt: string; endAt: string; label: string }[] = [];
  for (let day = 0; day < days && slots.length < 8; day += 1) {
    const date = addDays(from, day);
    if (!window.days.includes(date.getDay())) continue;
    for (let hour = window.startHour; hour < window.endHour; hour += 1) {
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);
      if (start < from) continue;
      const end = new Date(start.getTime() + minutes * 60_000);
      if (end.getHours() > window.endHour || (end.getHours() === 0 && end.getDate() !== start.getDate())) continue;
      if (blackoutFor(resource, start.toISOString(), end.toISOString())) continue;
      if (conflictsWithLinks(bookings, resources, orgId, resourceId, start.toISOString(), end.toISOString()).length > 0) continue;
      slots.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        label: `${start.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} ${start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
      });
      if (slots.length >= 8) break;
    }
  }
  return slots;
}

/* ---------------- BOOK-001 / 002 ---------------- */

export function BookingForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const { org, now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string; resourceId?: string; startAt?: string } | undefined;
  const existing = useRecord(payload?.id);
  const bookable = data.resources.filter((resource) => isBookable(resource));
  const publishedServices = data.services.filter((service) => service.status === "active");

  const [serviceId, setServiceId] = useState(String(existing?.fields.serviceId ?? publishedServices[0]?.id ?? ""));
  const [resourceId, setResourceId] = useState(String(existing?.fields.resourceId ?? payload?.resourceId ?? bookable[0]?.id ?? ""));
  const [contactId, setContactId] = useState(String(existing?.fields.contactId ?? ""));
  const [startAt, setStartAt] = useState(
    (existing?.startAt ?? payload?.startAt ?? new Date(now.getTime() + 3_600_000).toISOString()).slice(0, 16),
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [hold, setHold] = useState(existing?.status === "hold");
  const [seatsText, setSeatsText] = useState(String(existing ? seatsOf(existing) : 1));

  const service = data.services.find((item) => item.id === serviceId);
  const resource = data.resources.find((item) => item.id === resourceId);
  const minutes = Number(service?.fields.minutes ?? 45) + Number(service?.fields.bufferMinutes ?? 0);
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  const capacity = resourceCapacity(resource);
  const seats = capacity > 1 ? Math.floor(Number(seatsText)) : 1;
  const seatsError = capacity > 1 && (!Number.isFinite(seats) || seats < 1) ? "Enter at least one place" : capacity > 1 && seats > capacity ? `${resource?.title} holds ${capacity} at a time` : undefined;
  const clashes = useMemo(
    () => (resourceId && !Number.isNaN(start.getTime())
      ? conflictsWithLinks(data.bookings, data.resources, org.id, resourceId, start.toISOString(), end.toISOString(), existing?.id, Math.max(1, seats || 1))
      : []),
    [data.bookings, data.resources, org.id, resourceId, startAt, minutes, existing?.id, seats],
  );
  const inPast = !existing && !Number.isNaN(start.getTime()) && start < now;
  const usedSeats = capacity > 1 && !Number.isNaN(start.getTime())
    ? overlappingOn(data.bookings, org.id, resourceId, start.toISOString(), end.toISOString(), existing?.id).reduce((sum, item) => sum + seatsOf(item), 0)
    : 0;
  const blackout = blackoutFor(resource, start.toISOString(), end.toISOString());
  const outsideHours = (() => {
    const window = workingHours(resource);
    return !window.days.includes(start.getDay()) || start.getHours() < window.startHour || end.getHours() > window.endHour;
  })();
  const suggestions = freeSlots(data.bookings, data.resources, org.id, resourceId, minutes, now);
  const invalid = !serviceId || !resourceId || clashes.length > 0 || Boolean(blackout) || Number.isNaN(start.getTime()) || inPast || Boolean(seatsError);

  return (
    <form
      id="booking-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        rememberResource(org.id, resourceId);
        const contact = data.contacts.find((item) => item.id === contactId);
        const name = title.trim() || `${contact?.title ?? "Walk-in"} · ${service?.title.toLowerCase() ?? "appointment"}`;
        const fields = {
          serviceId,
          resourceId,
          contactId,
          depositMinor: Number(service?.fields.depositMinor ?? 0),
          depositState: Number(service?.fields.depositMinor ?? 0) ? "not_requested" : "none",
          payment: "not_connected",
          seats: Math.max(1, seats || 1),
          reminderState: contactId ? "queued_local" : "not_sent",
          source: "internal",
          checkedIn: false,
        };
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: name,
            status: hold ? "hold" : "confirmed",
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            at: start.toISOString(),
            amountMinor: service?.amountMinor ?? 0,
            fields: { ...existing.fields, ...fields },
          }, { expectRevision: existing.revision, event: `${name} rescheduled by ${actor}` });
        } else {
          await context.mutate.create({
            collection: "bookings",
            title: name,
            status: hold ? "hold" : "confirmed",
            amountMinor: service?.amountMinor ?? 0,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            at: start.toISOString(),
            summary: `${service?.title ?? "Appointment"} · ${minutes} minutes`,
            parentId: contactId || undefined,
            fields,
            body: { messages: [] },
          }, `Booking ${name} created`);
        }
        context.toast(hold ? "Slot held" : "Booking confirmed", `${name} holds ${resource?.title} from ${context.dateTime(start)}. The slot was checked for a conflict before it was written.`);
        close();
      }}
    >
      <Field label="Service" required>
        <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
          {publishedServices.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.minutes)}m</option>)}
        </Select>
      </Field>
      <Field label="Resource" required hint={resource ? String(resource.fields.workingHours ?? "") : undefined}>
        <Select value={resourceId} onChange={(event) => setResourceId(event.target.value)} required>
          {bookable.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Customer" hint="A booking with no contact cannot be reminded.">
        <Select value={contactId} onChange={(event) => setContactId(event.target.value)}>
          <option value="">No contact — internal hold</option>
          {data.contacts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Starts" required error={inPast ? "That time has already passed" : undefined} hint={Number.isNaN(end.getTime()) ? undefined : `Ends ${end.toLocaleTimeString(org.locale, { hour: "2-digit", minute: "2-digit" })} including a ${service?.fields.bufferMinutes ?? 0} minute buffer`}>
        <TextInput type="datetime-local" value={startAt} invalid={inPast} onChange={(event) => setStartAt(event.target.value)} required />
      </Field>
      {capacity > 1 && (
        <Field label="Places" required error={seatsError} hint={`${resource?.title} holds ${capacity} at a time · ${usedSeats} already taken in this window`}>
          <TextInput value={seatsText} inputMode="numeric" align="end" invalid={Boolean(seatsError)} onChange={(event) => setSeatsText(event.target.value)} />
        </Field>
      )}
      <Field label="Label" hint="Shown on the calendar. Left empty it is built from the customer and the service.">
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Checkbox label="Hold the slot without confirming it" checked={hold} onChange={(event) => setHold(event.target.checked)} />

      <ConflictNotice clashes={clashes} resources={data.resources} />
      {blackout && <Notice tone="danger" title="The resource is unavailable then">{resource?.title} has a blackout for {blackout.reason} covering that window.</Notice>}
      {!blackout && clashes.length === 0 && outsideHours && (
        <Notice tone="warning" title="Outside the recorded working hours">
          {resource?.title} works {String(resource?.fields.workingHours ?? "unrecorded hours")}. The booking can still be made, but it will not appear as available on the public page.
        </Notice>
      )}
      {(clashes.length > 0 || blackout) && (
        <Stack gap={2}>
          <strong>Free slots for this service</strong>
          <SlotPicker suggestions={suggestions} onPick={(iso) => setStartAt(iso.slice(0, 16))} />
        </Stack>
      )}
      {Number(service?.fields.depositMinor ?? 0) > 0 && (
        <Notice tone="warning" title={`This service asks for a ${context.money(Number(service?.fields.depositMinor))} deposit`}>
          The deposit is recorded as not requested. No processor is connected, so it cannot be taken here.
        </Notice>
      )}
    </form>
  );
}

export function BookingInspector({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const booking = useRecord(payload?.id ?? context.selectedId) ?? data.bookings[0];
  const { org } = useWorkspace();
  if (!booking) return <Empty title="Select a booking" />;
  const service = data.services.find((item) => item.id === String(booking.fields.serviceId));
  const resource = data.resources.find((item) => item.id === String(booking.fields.resourceId));
  const clashes = booking.startAt && booking.endAt
    ? conflictsWithLinks(data.bookings, data.resources, org.id, String(booking.fields.resourceId), booking.startAt, booking.endAt, booking.id)
    : [];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Booking", value: booking.title },
        { label: "Service", value: service?.title ?? "—" },
        { label: "Resource", value: resource?.title ?? "—" },
        { label: "When", value: <span className="ds-num">{context.dateTime(booking.startAt)}</span> },
        { label: "State", value: <Pill tone={statusTone(booking.status)} dot>{booking.status.replace("_", " ")}</Pill> },
        { label: "Deposit", value: DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? String(booking.fields.depositState) },
      ]} />
      <ConflictNotice clashes={clashes} resources={data.resources} />
      <Button variant="secondary" onClick={() => { context.navigate(`/o/${org.slug}/book/bookings/${booking.id}`); context.closeOverlay(); }}>Open the booking</Button>
    </Stack>
  );
}

export function CapacityAlert() {
  const data = useBookData();
  const { now } = useWorkspace();
  const rows = data.resources.filter((resource) => isBookable(resource)).map((resource) => {
    const window = workingHours(resource);
    const slots: { startAt: string; free: boolean }[] = [];
    for (let hour = window.startHour; hour < window.endHour; hour += 1) {
      const start = new Date(now);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60_000);
      slots.push({ startAt: start.toISOString(), free: conflictsWithLinks(data.bookings, data.resources, resource.organizationId, resource.id, start.toISOString(), end.toISOString()).length === 0 });
    }
    return { resource, free: slots.filter((slot) => slot.free).length, total: slots.length };
  });
  return (
    <Stack gap={4}>
      <DataGrid rows={rows} rowId={(row) => row.resource.id} label="Capacity today" filterable={false}
        columns={[
          { key: "title", header: "Resource", primary: true, cell: (row) => row.resource.title },
          { key: "free", header: "Free hours today", align: "end", cell: (row) => <span className="ds-num">{String(row.free)}</span> },
          { key: "total", header: "Working hours", align: "end", cell: (row) => <span className="ds-num">{String(row.total)}</span> },
          { key: "state", header: "State", cell: (row) => <Pill tone={row.free === 0 ? "danger" : row.free < 2 ? "warning" : "success"}>{row.free === 0 ? "Full" : row.free < 2 ? "Nearly full" : "Space"}</Pill> },
        ]} />
      <Notice tone="info">A slot counts as free only when nothing holds it, including a linked resource. A held slot counts as taken, because offering it would risk a double booking.</Notice>
    </Stack>
  );
}

export function ConflictReview({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { org } = useWorkspace();
  const clashing = data.bookings.filter((booking) =>
    booking.startAt && booking.endAt && isLive(booking)
    && conflictsWithLinks(data.bookings, data.resources, org.id, String(booking.fields.resourceId), booking.startAt, booking.endAt, booking.id).length > 0);
  return (
    <Stack gap={4}>
      {clashing.length === 0 ? (
        <Notice tone="success" title="Nothing overlaps">
          Every live booking has its resource to itself for its whole window, including resources linked to it.
        </Notice>
      ) : (
        <DataGrid rows={clashing} rowId={(row) => row.id} label="Conflicting bookings" filterable={false}
          onOpen={(id) => { context.navigate(`/o/${org.slug}/book/bookings/${id}`); context.closeOverlay(); }}
          columns={[
            { key: "title", header: "Booking", primary: true, cell: (row) => row.title },
            { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt)}</span> },
            { key: "resource", header: "Resource", cell: (row) => data.resources.find((item) => item.id === String(row.fields.resourceId))?.title ?? "—" },
            { key: "with", header: "Clashes with", cell: (row) => conflictsWithLinks(data.bookings, data.resources, org.id, String(row.fields.resourceId), row.startAt!, row.endAt!, row.id).map((clash) => clash.booking.title).join(", ") },
          ]} />
      )}
      <Notice tone="info" title="How a conflict is found">
        Two bookings conflict when they hold the same resource and their windows overlap at all. The rule lives in the shared domain layer, so the calendar, the forms and the public page all refuse the same slots.
      </Notice>
    </Stack>
  );
}

/* ---------------- BOOK-003 ---------------- */

export function RescheduleBooking({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const target = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!target) return <Empty title="Select a booking" />;
  return <RescheduleForm key={target.id} context={context} close={close} booking={target} />;
}

function RescheduleForm({ context, close, booking }: { context: ScreenContext; close: () => void; booking: Rec }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const service = data.services.find((item) => item.id === String(booking?.fields.serviceId ?? ""));
  const minutes = booking?.startAt && booking?.endAt ? (new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60_000 : Number(service?.fields.minutes ?? 45);
  const [startAt, setStartAt] = useState((booking?.startAt ?? now.toISOString()).slice(0, 16));
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  if (!booking) return <Empty title="No booking" />;
  const resourceId = String(booking.fields.resourceId);
  const resource = data.resources.find((item) => item.id === resourceId);
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  const valid = !Number.isNaN(start.getTime());
  const seats = seatsOf(booking);
  const clashes = valid ? conflictsWithLinks(data.bookings, data.resources, org.id, resourceId, start.toISOString(), end.toISOString(), booking.id, seats) : [];
  const problems = slotProblems({
    startAt: start, endAt: end, now, hours: workingHours(resource),
    blackout: valid ? blackoutFor(resource, start.toISOString(), end.toISOString()) : undefined,
    seats, capacity: resourceCapacity(resource),
  });
  const blocking = problems.filter((problem) => problem.blocking);
  const unchanged = valid && booking.startAt === start.toISOString();
  const reasonProblem = reasonError(reasonCode, reason);
  const suggestions = freeSlots(data.bookings, data.resources, org.id, resourceId, minutes, now);
  const noticeHours = Number(service?.fields.cancellationNoticeHours ?? 24);
  const hoursAway = booking.startAt ? (new Date(booking.startAt).getTime() - now.getTime()) / 3_600_000 : 0;
  const finished = ["cancelled", "completed", "no_show"].includes(booking.status);

  return (
    <form
      id="reschedule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (finished || clashes.length > 0 || blocking.length > 0 || unchanged || reasonProblem) return;
        const body = bodyOf<BookingBody>(booking, {});
        const label = reasonLabel(RESCHEDULE_REASONS, reasonCode);
        const saved = await context.mutate.patch(booking.id, {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          at: start.toISOString(),
          fields: {
            ...booking.fields,
            previousStartAt: booking.startAt ?? "",
            rescheduleCount: Number(booking.fields.rescheduleCount ?? 0) + 1,
            rescheduleReason: reasonCode,
            rescheduledBy: context.actor,
            rescheduledAt: now.toISOString(),
          },
          body: { ...body, messages: [...(body.messages ?? []), { at: now.toISOString(), direction: "out", body: `Moved from ${context.dateTime(booking.startAt)} to ${context.dateTime(start)} by ${context.actor}: ${label}${reason.trim() ? ` — ${reason.trim()}` : ""}. Kept as a local record; no message was sent.` }] },
        }, { expectRevision: booking.revision, event: `${booking.title} moved to ${start.toISOString()}: ${label}` });
        if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
        context.toast("Rescheduled", `${booking.title} is now ${context.dateTime(start)}. The customer has not been told: no provider is connected.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Booking", value: booking.title },
        { label: "Currently", value: <span className="ds-num">{context.dateTime(booking.startAt)}</span> },
        { label: "Length", value: <span className="ds-num">{minutes} minutes</span> },
        { label: "Resource", value: `${resource?.title ?? "—"}${resourceCapacity(resource) > 1 ? ` · holds ${resourceCapacity(resource)} at a time` : ""}` },
        ...(Number(booking.fields.rescheduleCount ?? 0) > 0 ? [{ label: "Moved before", value: <span className="ds-num">{String(booking.fields.rescheduleCount)} time{Number(booking.fields.rescheduleCount) === 1 ? "" : "s"}</span> }] : []),
      ]} />
      {finished && <Notice tone="warning" title="This booking cannot move">{booking.title} is {booking.status.replace("_", " ")}.</Notice>}
      <Field label="New start" required error={unchanged && touched ? "Choose a different time" : blocking[0]?.message}>
        <TextInput type="datetime-local" value={startAt} invalid={blocking.length > 0} onChange={(event) => setStartAt(event.target.value)} required />
      </Field>
      <ConflictNotice clashes={clashes} resources={data.resources} />
      {problems.filter((problem) => !problem.blocking).map((problem) => <Notice key={problem.kind} tone="warning" title="Check the time">{problem.message} {resource?.title} works {String(resource?.fields.workingHours ?? "unrecorded hours")}.</Notice>)}
      {(clashes.length > 0 || blocking.length > 0) && <SlotPicker suggestions={suggestions} onPick={(iso) => setStartAt(iso.slice(0, 16))} />}
      {hoursAway < noticeHours && hoursAway > 0 && (
        <Notice tone="warning" title={`Inside the ${noticeHours} hour notice period`}>
          Moving an appointment this close is treated as a courtesy, not an entitlement. The fee recorded on the service is {(Number(service?.fields.cancellationFeeBp ?? 0) / 100).toFixed(0)}% and is shown before anything is changed.
        </Notice>
      )}
      <Field label="Reason" required error={touched && !reasonCode ? "Choose a reason" : undefined}>
        <Select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
          <option value="">Choose a reason</option>
          {RESCHEDULE_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Note for the record" required={reasonCode === "other"} error={touched && reasonCode === "other" && reasonProblem ? reasonProblem : undefined}>
        <TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <ProviderBoundary id="email.send" title="The customer is not notified automatically" />
    </form>
  );
}

export function RefundRule({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const booking = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const service = data.services.find((item) => item.id === String(booking?.fields.serviceId ?? ""));
  if (!booking) return <Empty title="No booking" />;
  const notice = Number(service?.fields.cancellationNoticeHours ?? 24);
  const feeBp = Number(service?.fields.cancellationFeeBp ?? 0);
  const hoursAway = booking.startAt ? (new Date(booking.startAt).getTime() - now.getTime()) / 3_600_000 : 0;
  const inside = hoursAway < notice;
  const deposit = Number(booking.fields.depositMinor ?? 0);
  const fee = Math.round(((service?.amountMinor ?? 0) * feeBp) / 10_000);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Service", value: service?.title ?? "—" },
        { label: "Notice required", value: <span className="ds-num">{notice} hours</span> },
        { label: "Starts in", value: <span className="ds-num">{hoursAway > 0 ? `${Math.round(hoursAway)} hours` : "It has passed"}</span> },
        { label: "Fee inside notice", value: <span className="ds-num">{feeBp ? `${(feeBp / 100).toFixed(0)}% (${context.money(fee)})` : "None"}</span> },
        { label: "Deposit held", value: <span className="ds-num">{deposit ? context.money(deposit) : "None"}</span> },
        { label: "Deposit state", value: DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? "" },
      ]} />
      <Notice tone={inside ? "warning" : "info"} title={inside ? "Cancelling now is inside the notice period" : "Cancelling now is outside the notice period"}>
        {inside
          ? `The recorded policy allows a fee of ${context.money(fee)}. Whether to charge it is a decision for a person, and no money can move from here in either direction.`
          : "No fee applies under the recorded policy."}
      </Notice>
      {deposit > 0 && String(booking.fields.depositState) === "paid_local" && (
        <ProviderBoundary id="payment.capture" title="Returning the deposit cannot be done here" />
      )}
    </Stack>
  );
}

export function CustomerMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const booking = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const contact = data.contacts.find((item) => item.id === String(booking?.fields.contactId ?? ""));
  const [text, setText] = useState("");
  if (!booking) return <Empty title="No booking" />;
  return (
    <form
      id="customer-message"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        const body = bodyOf<BookingBody>(booking, {});
        await context.mutate.patch(booking.id, {
          body: { ...body, messages: [...(body.messages ?? []), { at: now.toISOString(), direction: "out", body: text.trim() }] },
        }, { expectRevision: booking.revision, event: `Message recorded against ${booking.title}` });
        context.toast("Recorded against the booking", "No mail or telephony provider is connected, so the message is a local record rather than something that was sent.");
        close();
      }}
    >
      <Properties rows={[
        { label: "To", value: contact?.title ?? "No contact on this booking" },
        { label: "Email on file", value: String(contact?.fields.email ?? "None") },
        { label: "Consent", value: contact?.fields.consentEmail === true ? <Pill tone="success">Recorded</Pill> : <Pill tone="warning">Not recorded</Pill> },
      ]} />
      {!contact && <Notice tone="warning" title="This booking has no customer record">A message cannot be addressed to anyone. Link a contact first.</Notice>}
      <Field label="Message" required><TextArea value={text} rows={5} onChange={(event) => setText(event.target.value)} required /></Field>
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export function TakeDeposit({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const target = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!target) return <Empty title="Select a booking" />;
  return <TakeDepositGate context={context} close={close} booking={target} />;
}

function TakeDepositGate({ context, close, booking }: { context: ScreenContext; close: () => void; booking: Rec }) {
  const data = useBookData();
  if (data.services.length === 0) return <Empty title="Loading" />;
  return <TakeDepositForm key={booking.id} context={context} close={close} booking={booking} loaded={data} />;
}

function TakeDepositForm({ context, close, booking, loaded }: { context: ScreenContext; close: () => void; booking: Rec; loaded: ReturnType<typeof useBookData> }) {
  const live = useBookData();
  const data = live.services.length ? live : loaded;
  const { org, now } = useWorkspace();
  const service = data.services.find((item) => item.id === String(booking.fields.serviceId ?? ""));
  const startingAmount = Number(booking.fields.depositMinor ?? service?.fields.depositMinor ?? 0);
  const [amount, setAmount] = useState(startingAmount);
  const [confirmReceived, setConfirmReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = String(booking.fields.depositState ?? "none");
  const recorded = state === "paid_local";
  const serviceValue = service?.amountMinor ?? 0;
  const totals = computeInvoice({
    lines: [{ id: "deposit", description: `Deposit · ${service?.title ?? "service"}`, quantity: 1, unitPriceMinor: amount, taxCategory: "standard" }],
    jurisdiction: org.jurisdiction,
    customerStatus: "domestic",
    date: now.toISOString(),
  });
  const invalidAmount = !Number.isSafeInteger(amount) || amount <= 0 || (serviceValue > 0 && amount > serviceValue);
  const canRecord = !recorded && !busy && !invalidAmount && !totals.hasUnknownRate;
  const hasUnsavedWork = !recorded && (amount !== startingAmount || confirmReceived);

  async function recordDeposit(received: boolean) {
    if (!canRecord || (received && !confirmReceived)) return;
    setBusy(true);
    try {
      const result = await context.mutate.patch(booking.id, {
        fields: {
          ...booking.fields,
          depositMinor: amount,
          depositState: received ? "paid_local" : "awaiting_payment",
          ...(received ? { payment: "paid_local" } : {}),
        },
      }, {
        expectRevision: booking.revision,
        event: received
          ? `Deposit of ${amount} marked as received outside Arlovi on ${booking.title}`
          : `Deposit of ${amount} requested on ${booking.title}`,
      });
      if (!result) {
        context.toast("Deposit not updated", CHANGED_ELSEWHERE, "failed");
        return;
      }
      context.toast(
        received ? "External receipt recorded" : "Deposit requested",
        received
          ? `${context.money(amount)} was marked as received outside Arlovi. No charge was made here.`
          : `${context.money(amount)} is awaiting payment. No charge was made.`,
      );
      close();
    } catch (error) {
      context.toast("Deposit not updated", error instanceof Error ? error.message : "Reload and try again.", "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="book-deposit-flow">
      <ModalUnsavedChanges when={hasUnsavedWork} />
      <ModalInFlight when={busy} />

      <section className="book-deposit-booking" aria-label="Booking context">
        <span className="book-deposit-eyebrow">Booking</span>
        <h3 className="book-deposit-booking-title">{booking.title}</h3>
        <div className="book-deposit-metadata">
          <span>Service value <strong className="ds-num">{context.money(serviceValue)}</strong></span>
          <Pill tone={state === "paid_local" ? "success" : state === "awaiting_payment" ? "warning" : "neutral"}>
            {DEPOSIT_LABEL[state] ?? "Deposit status unavailable"}
          </Pill>
        </div>
      </section>

      <section className="book-deposit-calculation" aria-label="Deposit calculation">
        <div className="book-deposit-section-head">
          <div>
            <span className="book-deposit-eyebrow">Amount & tax</span>
            <h3>Set the deposit request</h3>
          </div>
          <span className="book-deposit-hint">{org.currency}</span>
        </div>
        <Field label="Deposit amount" hint="Amount before applicable tax. No card is charged.">
          <MoneyInput valueMinor={amount} onChangeMinor={(value) => { setAmount(value); setConfirmReceived(false); }}
            currency={org.currency} label="Deposit amount" disabled={busy || recorded} />
        </Field>
        {invalidAmount && <Notice tone="danger" title="Enter a valid deposit">
          The amount must be greater than zero{serviceValue > 0 ? " and cannot exceed the service value" : ""}.
        </Notice>}
        <div className="book-deposit-totals">
          <TotalsBlock totals={totals} money={context.money} label="Deposit" />
        </div>
      </section>

      <div className="book-deposit-provider">
        <ProviderBoundary id="payment.capture" title="Payment collection is not connected">
          No card details are entered and no charge is attempted. A request is recorded as awaiting payment;
          an external receipt is recorded only after you confirm the money arrived.
        </ProviderBoundary>
      </div>

      {recorded && (
        <Notice tone="info" title="This deposit is already marked as received">
          This dialog cannot collect a second payment or reverse an existing receipt. Review the booking's payment history before making any adjustment.
        </Notice>
      )}

      {confirmReceived && !recorded && (
        <Notice tone="warning" title="Confirm money arrived outside Arlovi">
          Only confirm receipt if the payment is visible in your external bank or payment records.
          This changes the booking's local payment status; it does not charge a card or create an external bank transaction.
        </Notice>
      )}

      <ModalActions>
        {recorded ? (
          <Button variant="secondary" size="sm" onClick={close}>Done</Button>
        ) : confirmReceived ? (
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmReceived(false)}>Back</Button>
            <Button variant="primary" size="sm" busy={busy} disabled={!canRecord} onClick={() => { void recordDeposit(true); }}>
              Confirm external receipt
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" busy={busy} disabled={!canRecord} onClick={() => { void recordDeposit(false); }}>
              Record deposit request
            </Button>
            <Button variant="secondary" size="sm" disabled={!canRecord} onClick={() => setConfirmReceived(true)}>
              Money received elsewhere
            </Button>
          </>
        )}
      </ModalActions>
    </div>
  );
}

/* ---------------- BOOK-004 ---------------- */

export function ServiceEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const existingBody = bodyOf<ServiceBody>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [minutes, setMinutes] = useState(String(existing?.fields.minutes ?? 45));
  const [buffer, setBuffer] = useState(String(existing?.fields.bufferMinutes ?? 15));
  const [price, setPrice] = useState(existing?.amountMinor ?? 0);
  const [deposit, setDeposit] = useState(Number(existing?.fields.depositMinor ?? 0));
  const [category, setCategory] = useState(String(existing?.fields.category ?? "Showroom"));
  const [resources, setResources] = useState<string[]>(existingBody.resources ?? []);
  const futureBookings = existing
    ? data.bookings.filter((booking) => String(booking.fields.serviceId) === existing.id && isLive(booking) && booking.startAt && new Date(booking.startAt) > now)
    : [];
  const invalid = !title.trim() || Number(minutes) <= 0 || deposit > price;

  return (
    <form
      id="service-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = {
          minutes: Number(minutes),
          bufferMinutes: Number(buffer),
          depositMinor: deposit,
          category,
          slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          taxCategory: "standard",
          seats: Number(existing?.fields.seats ?? 1),
          published: existing ? existing.fields.published === true : true,
          cancellationNoticeHours: Number(existing?.fields.cancellationNoticeHours ?? 24),
          cancellationFeeBp: Number(existing?.fields.cancellationFeeBp ?? 0),
        };
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(), amountMinor: price,
            fields: { ...existing.fields, ...fields },
            body: { ...existingBody, resources },
          }, { expectRevision: existing.revision, event: `Service ${title.trim()} edited` });
        } else {
          await context.mutate.create({
            collection: "services", title: title.trim(), status: "active", amountMinor: price,
            summary: `${minutes} minutes${Number(buffer) ? ` plus a ${buffer} minute buffer` : ""}.`,
            fields, body: { resources, description: "" },
          }, `Service ${title.trim()} created`);
        }
        context.toast("Service saved", `${title.trim()} occupies ${Number(minutes) + Number(buffer)} minutes of a resource including its buffer.`);
        close();
      }}
    >
      <Field label="Service name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Length in minutes" required><TextInput value={minutes} inputMode="numeric" align="end" onChange={(event) => setMinutes(event.target.value)} required /></Field>
        <Field label="Buffer after" hint="Added to the slot so the room can be reset"><TextInput value={buffer} inputMode="numeric" align="end" onChange={(event) => setBuffer(event.target.value)} /></Field>
        <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{["Showroom", "On site", "Workshop", "Package"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      </Row>
      <Row gap={3} wrap>
        <Field label="Price" hint={`Excludes ${org.jurisdiction} tax, which resolves when a booking is priced`}>
          <MoneyInput valueMinor={price} onChangeMinor={setPrice} currency={org.currency} label="Price" />
        </Field>
        <Field label="Deposit" hint={deposit > price ? "A deposit cannot exceed the price" : "Requested, never charged from here"}>
          <MoneyInput valueMinor={deposit} onChangeMinor={setDeposit} currency={org.currency} label="Deposit" />
        </Field>
      </Row>
      <fieldset className="ds-fieldset">
        <legend>Resources that can deliver it</legend>
        <Stack gap={2}>
          {data.resources.filter((resource) => isBookable(resource)).map((resource) => (
            <Checkbox
              key={resource.id}
              label={`${resource.title} — ${String(resource.fields.workingHours ?? "hours not recorded")}`}
              checked={resources.includes(resource.id)}
              onChange={(event) => setResources((current) => (event.target.checked ? [...current, resource.id] : current.filter((item) => item !== resource.id)))}
            />
          ))}
        </Stack>
      </fieldset>
      {deposit > price && <Notice tone="danger" title="The deposit is more than the price">A deposit larger than the service value cannot be right.</Notice>}
      {existing?.status === "archived" && futureBookings.length > 0 && (
        <Notice tone="danger" title={`${futureBookings.length} future booking${futureBookings.length === 1 ? "" : "s"} still use this archived service`}>
          {futureBookings.map((booking) => booking.title).join(", ")}. Archiving hides the service from the public page, but it cannot be removed until those appointments are moved or completed.
        </Notice>
      )}
    </form>
  );
}

export function PricingReview({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const rows = data.services.filter((service) => service.status !== "archived").map((service) => {
    const totals = computeInvoice({
      lines: [{ id: service.id, description: service.title, quantity: 1, unitPriceMinor: service.amountMinor ?? 0, taxCategory: "standard" }],
      jurisdiction: org.jurisdiction,
      customerStatus: "domestic",
      date: now.toISOString(),
    });
    return { service, totals };
  });
  return (
    <Stack gap={4}>
      <DataGrid rows={rows} rowId={(row) => row.service.id} label="Pricing review" filterable={false}
        columns={[
          { key: "title", header: "Service", primary: true, cell: (row) => row.service.title },
          { key: "net", header: "Net", align: "end", cell: (row) => <span className="ds-num">{context.money(row.totals.netMinor)}</span> },
          { key: "code", header: "Tax code", cell: (row) => <Pill>{row.totals.byCode[0]?.code.code ?? "—"}</Pill> },
          { key: "tax", header: "Tax", align: "end", cell: (row) => <span className="ds-num">{context.money(row.totals.taxMinor)}</span> },
          { key: "gross", header: "Customer pays", align: "end", cell: (row) => <strong className="ds-num">{context.money(row.totals.grossMinor)}</strong> },
          { key: "deposit", header: "Deposit", align: "end", cell: (row) => <span className="ds-num">{Number(row.service.fields.depositMinor ?? 0) ? context.money(Number(row.service.fields.depositMinor)) : "—"}</span> },
        ]} />
      <Notice tone="info" title={`Rates resolved for ${org.jurisdiction}`}>
        Every figure above comes from the tax engine for this jurisdiction and today's date. Nothing is derived from the currency, so changing the reporting currency would not change a rate.
      </Notice>
    </Stack>
  );
}

export function AvailabilityTest({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const service = useRecord(payload?.id ?? context.selectedId) ?? data.services[0];
  const resources = bodyOf<ServiceBody>(service, {}).resources ?? [];
  if (!service) return <Empty title="No service" />;
  const minutes = Number(service.fields.minutes ?? 45) + Number(service.fields.bufferMinutes ?? 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Service", value: service.title },
        { label: "Occupies", value: <span className="ds-num">{minutes} minutes</span> },
        { label: "Resources", value: resources.length ? resources.map((id) => data.resources.find((item) => item.id === id)?.title ?? id).join(", ") : "None — this service cannot be booked" },
      ]} />
      {resources.length === 0 ? (
        <Notice tone="danger" title="No resource can deliver this service">A service with no resource has no availability at all, so the public page would show nothing.</Notice>
      ) : resources.map((resourceId) => {
        const slots = freeSlots(data.bookings, data.resources, org.id, resourceId, minutes, now);
        return (
          <Card key={resourceId} eyebrow="NEXT FREE" prov="human" title={data.resources.find((item) => item.id === resourceId)?.title ?? resourceId} subtitle={`${slots.length} free slots in the next five working days`}>
            <SlotPicker suggestions={slots} onPick={() => undefined} />
          </Card>
        );
      })}
    </Stack>
  );
}

/* ---------------- BOOK-005 ---------------- */

export function ResourceEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState(String(existing?.fields.kind ?? "person"));
  const [hours, setHours] = useState(String(existing?.fields.workingHours ?? "Mon–Fri 09:00–17:00"));
  const [linked, setLinked] = useState(String(existing?.fields.linkedResourceId ?? ""));
  const [bookable, setBookable] = useState(existing ? isBookable(existing) : true);
  const [capacityText, setCapacityText] = useState(String(existing ? resourceCapacity(existing) : 1));
  const capacity = Math.floor(Number(capacityText));
  const capacityError = !Number.isFinite(capacity) || capacity < 1 || capacity > 200 ? "Enter a whole number from 1 to 200" : undefined;
  const invalid = !title.trim() || !/\d{2}:\d{2}\D+\d{2}:\d{2}/.test(hours) || Boolean(capacityError);
  return (
    <form
      id="resource-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = { kind, capacity, workingHours: hours.trim(), timezone: org.timezone, linkedResourceId: linked, bookable };
        if (existing) {
          await context.mutate.patch(existing.id, { title: title.trim(), fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Resource ${title.trim()} edited` });
        } else {
          await context.mutate.create({ collection: "resources", title: title.trim(), status: "active", summary: "", fields, body: { blackouts: [] } }, `Resource ${title.trim()} created`);
        }
        context.toast("Resource saved", `${title.trim()} is bookable ${hours.trim()} in ${org.timezone}.`);
        close();
      }}
    >
      <Field label="Resource name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Kind"><Select value={kind} onChange={(event) => setKind(event.target.value)}>{["person", "room", "equipment"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Working hours" required hint="For example Tue–Sat 10:00–18:00. The calendar shades everything outside it." error={invalid && hours ? "Include start and end times as HH:MM" : undefined}>
        <TextInput value={hours} invalid={invalid && Boolean(hours)} onChange={(event) => setHours(event.target.value)} required />
      </Field>
      <Field label="Capacity" required error={capacityError} hint="How many bookings it takes at once. A person or a single kit is 1; a workshop table might be 6.">
        <TextInput value={capacityText} inputMode="numeric" align="end" invalid={Boolean(capacityError)} onChange={(event) => setCapacityText(event.target.value)} />
      </Field>
      <Field label="Linked resource" hint="A booking on either one blocks the other.">
        <Select value={linked} onChange={(event) => setLinked(event.target.value)}>
          <option value="">Not linked</option>
          {data.resources.filter((item) => item.id !== existing?.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Checkbox label="Can be booked" checked={bookable} onChange={(event) => setBookable(event.target.checked)} />
      {linked && <Notice tone="info">Linking means a confirmed slot on one is refused on the other, which is what stops the survey kit being promised twice.</Notice>}
    </form>
  );
}

export function ResourceConflictDialog({ context }: { context: ScreenContext }) {
  return <ConflictReview context={context} />;
}

export function Recurrence({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const resource = useRecord(payload?.id ?? context.selectedId) ?? data.resources[0];
  const [from, setFrom] = useState(addDays(now, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(addDays(now, 3).toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  if (!resource) return <Empty title="No resource" />;
  const startIso = new Date(`${from}T00:00:00`).toISOString();
  const endIso = new Date(`${to}T23:59:59`).toISOString();
  const affected = data.bookings.filter((booking) =>
    String(booking.fields.resourceId) === resource.id && isLive(booking) && booking.startAt && booking.startAt >= startIso && booking.startAt <= endIso);
  return (
    <form
      id="recurrence"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim() || affected.length > 0) return;
        const body = bodyOf<ResourceBody>(resource, {});
        await context.mutate.patch(resource.id, {
          body: { ...body, blackouts: [...(body.blackouts ?? []), { from: startIso, to: endIso, reason: reason.trim() }] },
        }, { expectRevision: resource.revision, event: `${resource.title} blocked from ${from} to ${to}` });
        context.toast("Period blocked", `${resource.title} is unavailable ${from} to ${to}. The calendar shades it and the public page will not offer it.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Resource", value: resource.title }, { label: "Existing blackouts", value: String((bodyOf<ResourceBody>(resource, {}).blackouts ?? []).length) }]} />
      <Row gap={3} wrap>
        <Field label="From" required><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
        <Field label="To" required><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></Field>
      </Row>
      <Field label="Reason" required hint="Shown on the calendar in place of free slots"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} required /></Field>
      {affected.length > 0 && (
        <Notice tone="danger" title={`${affected.length} booking${affected.length === 1 ? " falls" : "s fall"} inside that period`}>
          {affected.map((booking) => booking.title).join(", ")}. Move them first: blocking the period would leave confirmed appointments on a resource that is marked unavailable.
        </Notice>
      )}
    </form>
  );
}

/* ---------------- BOOK-006 ---------------- */

export function FormFieldInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const page = data.sites.find((site) => String(site.fields.kind) === "bookingPage");
  const body = bodyOf<PublicPageBody>(page, {});
  const payload = context.overlayPayload as { fieldId?: string } | undefined;
  const field = (body.fields ?? []).find((item) => item.id === payload?.fieldId) ?? (body.fields ?? [])[0];
  const [required, setRequired] = useState(field?.required ?? false);
  const [label, setLabel] = useState(field?.label ?? "");
  if (!page || !field) return <Empty title="No field selected" />;
  return (
    <form
      id="form-field"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(page.id, {
          body: { ...body, fields: (body.fields ?? []).map((item) => (item.id === field.id ? { ...item, label: label.trim() || item.label, required } : item)) },
        }, { expectRevision: page.revision, event: `Public booking field "${field.label}" edited` });
        context.toast("Field saved", `${label || field.label} is ${required ? "required" : "optional"} on the public page.`);
        close();
      }}
    >
      <Field label="Label" required><TextInput value={label} onChange={(event) => setLabel(event.target.value)} required /></Field>
      <Properties rows={[{ label: "Type", value: field.type }, { label: "Field id", value: <code>{field.id}</code> }]} />
      <Checkbox label="Required" checked={required} onChange={(event) => setRequired(event.target.checked)} disabled={field.type === "consent"} />
      {field.type === "consent" && <Notice tone="warning" title="A consent field stays required and unticked">Consent that is pre-ticked or optional is not consent.</Notice>}
    </form>
  );
}

export function PublishBookingPage({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useBookData();
  const page = data.sites.find((site) => String(site.fields.kind) === "bookingPage");
  if (!page) return <Empty title="No page" />;
  const body = bodyOf<PublicPageBody>(page, {});
  const problems = [
    ...((body.services ?? []).length ? [] : ["No service is offered on the page."]),
    ...((body.fields ?? []).some((field) => field.type === "consent") ? [] : ["There is no consent field."]),
  ];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Page", value: page.title },
        { label: "Path", value: <code>/book/{String(page.fields.slug)}</code> },
        { label: "Services offered", value: String((body.services ?? []).length) },
        { label: "Fields", value: String((body.fields ?? []).length) },
      ]} />
      {problems.length > 0 && <Notice tone="warning" title="Before publishing">{problems.join(" ")}</Notice>}
      <ProviderBoundary id="site.publish" title="There is nowhere to publish to">
        The page model, its services and its fields are saved here and export as HTML. Until hosting is connected, no visitor can reach it, so the booking page cannot take a booking on its own.
      </ProviderBoundary>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(page.id, { status: "published", fields: { ...page.fields, published: true, exportedAt: clockIso() } }, { expectRevision: page.revision, event: `${page.title} exported locally` });
          context.toast("Exported", "The page is marked exported in this workspace. No public URL exists.");
          close();
        }}
      >
        Export this version locally
      </Button>
    </Stack>
  );
}

export function PrivacyPolicy() {
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Collected", value: "Name, email, company and what the visitor is working on" },
        { label: "Why", value: "To hold the appointment and contact the person about it" },
        { label: "Stored", value: "In this browser, as a booking and a contact record" },
        { label: "Shared", value: "With nobody — no provider is connected" },
        { label: "Consent", value: <Pill tone="success">Required, never pre-ticked</Pill> },
      ]} />
      <Notice tone="info" title="What a visitor is told">
        The page says what is collected, why, and that it stays in the studio's workspace. Marketing consent is a separate box from the booking itself, so agreeing to an appointment is not agreeing to a newsletter.
      </Notice>
    </Stack>
  );
}

/* ---------------- BOOK-007 ---------------- */

export function ReminderTemplateEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const existingBody = bodyOf<{ subject?: string; body?: string }>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [channel, setChannel] = useState(String(existing?.fields.channel ?? "email"));
  const [offset, setOffset] = useState(String(existing?.fields.offsetHours ?? 24));
  const [subject, setSubject] = useState(existingBody.subject ?? "");
  const [text, setText] = useState(existingBody.body ?? "");
  const hasOptOut = channel !== "sms" || /stop/i.test(text);
  const invalid = !title.trim() || !text.trim() || !hasOptOut;
  return (
    <form
      id="reminder-template"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const fields = { kind: "reminder", channel, offsetHours: Number(offset), approval: "awaiting_approval", delivery: "not_connected", enabled: existing ? existing.fields.enabled === true : false };
        if (existing) {
          await context.mutate.patch(existing.id, { title: title.trim(), fields: { ...existing.fields, ...fields }, body: { subject, body: text } }, { expectRevision: existing.revision, event: `Reminder ${title.trim()} edited` });
        } else {
          await context.mutate.create({ collection: "templates", title: title.trim(), status: "review", summary: `${channel} reminder ${offset} hours before.`, tags: ["reminder"], fields, body: { subject, body: text } }, `Reminder ${title.trim()} created`);
        }
        context.toast("Reminder saved", "It needs approval before it is enabled, and it cannot be delivered until a provider is connected.");
        close();
      }}
    >
      <Field label="Rule name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Channel"><Select value={channel} onChange={(event) => setChannel(event.target.value)}>{["email", "sms"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Hours before" hint="Negative sends after the appointment"><TextInput value={offset} inputMode="numeric" align="end" onChange={(event) => setOffset(event.target.value)} /></Field>
      </Row>
      {channel === "email" && <Field label="Subject"><TextInput value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>}
      <Field label="Message" required hint="Placeholders such as {{first_name}} and {{time}} fill from the booking record">
        <TextArea value={text} rows={5} onChange={(event) => setText(event.target.value)} required />
      </Field>
      {!hasOptOut && <Notice tone="danger" title="An SMS needs an opt-out">Include how to stop receiving messages, for example "Reply STOP to opt out".</Notice>}
      <ProviderBoundary id="telephony" title={channel === "sms" ? "No telephony provider is connected" : "No mail provider is connected"} />
    </form>
  );
}

export function SendPreview({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = useRecord(payload?.id ?? context.selectedId) ?? data.templates.find((item) => String(item.fields.kind) === "reminder");
  const body = bodyOf<{ subject?: string; body?: string }>(template, {});
  const booking = data.bookings.find((item) => item.startAt && new Date(item.startAt) > now && isLive(item));
  const contact = data.contacts.find((item) => item.id === String(booking?.fields.contactId ?? ""));
  const service = data.services.find((item) => item.id === String(booking?.fields.serviceId ?? ""));
  if (!template) return <Empty title="No template" />;
  const filled = (body.body ?? "")
    .replace(/\{\{first_name\}\}/g, contact?.title.split(" ")[0] ?? "there")
    .replace(/\{\{service\}\}/g, service?.title ?? "your appointment")
    .replace(/\{\{time\}\}/g, booking?.startAt ? new Date(booking.startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "the booked time")
    .replace(/\{\{notice_hours\}\}/g, String(service?.fields.cancellationNoticeHours ?? 24));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Rendered against", value: booking?.title ?? "No upcoming booking" },
        { label: "Channel", value: String(template.fields.channel) },
        { label: "Would send", value: <span className="ds-num">{String(template.fields.offsetHours)} hours before</span> },
        { label: "Recipient", value: String(contact?.fields.email ?? "No contact on the booking") },
      ]} />
      <div className="t4-device">
        <div className="t4-device-head">{String(template.fields.channel) === "email" ? (body.subject ?? "").replace(/\{\{service\}\}/g, service?.title ?? "your appointment").replace(/\{\{time\}\}/g, booking?.startAt ? new Date(booking.startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "the booked time") || "No subject" : "SMS"}</div>
        <div className="t4-device-body"><p style={{ whiteSpace: "pre-wrap" }}>{filled}</p></div>
      </div>
      <ProviderBoundary id={String(template.fields.channel) === "sms" ? "telephony" : "email.send"} />
      {template.fields.lastTestAt ? <span className="ds-subtle">Last test held locally {context.relative(String(template.fields.lastTestAt))} by {String(template.fields.lastTestBy)}.</span> : null}
      <Button variant="primary" onClick={() => recordTestSend(context, template, context.actor)}>Record a test send to {context.actor}</Button>
    </Stack>
  );
}

export function ReminderSuppression({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const noContact = data.bookings.filter((booking) => !String(booking.fields.contactId) && isLive(booking));
  const noConsent = data.bookings.filter((booking) => {
    const contact = data.contacts.find((item) => item.id === String(booking.fields.contactId));
    return contact && contact.fields.consentEmail !== true;
  });
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Bookings with no contact", value: <span className="ds-num">{String(noContact.length)}</span> },
        { label: "Contacts without email consent", value: <span className="ds-num">{String(noConsent.length)}</span> },
        { label: "Suppressed contacts", value: <span className="ds-num">{String(data.contacts.filter((contact) => contact.fields.suppressed === true).length)}</span> },
      ]} />
      <DataGrid rows={[...noContact, ...noConsent]} rowId={(row) => row.id} label="Would not be reminded" filterable={false}
        onOpen={(id) => { context.navigate(`/o/${context.org.slug}/book/bookings/${id}`); context.closeOverlay(); }}
        columns={[
          { key: "title", header: "Booking", primary: true, cell: (row) => row.title },
          { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt)}</span> },
          { key: "why", header: "Why", cell: (row) => (String(row.fields.contactId) ? <Pill tone="warning">No email consent</Pill> : <Pill tone="warning">No contact record</Pill>) },
        ]}
        empty={<Empty title="Everyone with an appointment could be reminded" />} />
      <Notice tone="danger" title="These are left out of the queue, not queued and dropped">
        A reminder nobody consented to is not sent, and a booking with nobody attached has nowhere to send one. Both are shown here rather than counted as delivered.
      </Notice>
    </Stack>
  );
}

/* ---------------- BOOK-008 ---------------- */

export function MetricCalculation({ context }: { context: ScreenContext }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "utilisation";
  if (metric === "seats") {
    const groups = data.bookings.filter((booking) => Number(booking.fields.seats ?? 1) > 1);
    return (
      <Stack gap={3}>
        <Notice tone="info" title="Seats and slots are counted separately">
          A group session occupies one slot on its resource however many people attend. Counting each guest as an appointment would make the room look busier than it is.
        </Notice>
        <DataGrid rows={groups} rowId={(row) => row.id} label="Group bookings" filterable={false}
          columns={[
            { key: "title", header: "Booking", primary: true, cell: (row) => row.title },
            { key: "seats", header: "Seats taken", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.seats)}</span> },
            { key: "capacity", header: "Seats available", align: "end", cell: (row) => <span className="ds-num">{String(data.services.find((item) => item.id === String(row.fields.serviceId))?.fields.seats ?? "?")}</span> },
            { key: "slots", header: "Slots used", align: "end", cell: () => <span className="ds-num">1</span> },
          ]} />
      </Stack>
    );
  }
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Utilisation", value: "Booked minutes divided by the working hours recorded on the resource" },
        { label: "Window", value: "The current week, resolved from the workspace clock" },
        { label: "Counted as booked", value: "Confirmed, held, completed and no-show appointments" },
        { label: "Not counted", value: "Cancelled appointments, and any resource with no recorded hours" },
        { label: "As at", value: <span className="ds-num">{context.dateTime(now)}</span> },
      ]} />
      <Notice tone="warning" title="A held slot counts as busy">
        A slot held without a customer still blocks the resource, so it is counted. That is deliberate: it is the reason a resource can look full while earning nothing.
      </Notice>
    </Stack>
  );
}

export function ReportDesign({ context, close }: { context: ScreenContext; close: () => void }) {
  const [measure, setMeasure] = useState("Utilisation");
  const [period, setPeriod] = useState("Week");
  return (
    <form
      id="report-design"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: `Bookings report · ${measure} by ${period}`,
          status: "active",
          summary: "Saved report definition for Bookings.",
          fields: { kind: "savedReport", measure, period, scope: "BOOK" },
        }, `Bookings report ${measure} saved`);
        context.toast("Report saved", "It appears in your saved views for this workspace.");
        close();
      }}
    >
      <Field label="Measure"><Select value={measure} onChange={(event) => setMeasure(event.target.value)}>{["Utilisation", "Booked value", "No-show rate", "Deposits"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Field label="Period"><Select value={period} onChange={(event) => setPeriod(event.target.value)}>{["Week", "Month", "Quarter"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Notice tone="info">Only measures that can be counted from booking, service and resource records are offered.</Notice>
    </form>
  );
}

export function SourceProof({ context }: { context: ScreenContext }) {
  const data = useBookData();
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Bookings", value: <span className="ds-num">{String(data.bookings.length)}</span> },
        { label: "Live", value: <span className="ds-num">{String(data.bookings.filter(isLive).length)}</span> },
        { label: "Services", value: <span className="ds-num">{String(data.services.length)}</span> },
        { label: "Bookable resources", value: <span className="ds-num">{String(data.resources.filter((resource) => isBookable(resource)).length)}</span> },
        { label: "External calendar", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      <DataGrid rows={data.bookings} rowId={(row) => row.id} label="Every booking behind the reports"
        columns={[
          { key: "title", header: "Booking", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt)}</span>, sortValue: (row) => row.startAt ?? "" },
          { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status.replace("_", " ")}</Pill> },
          { key: "counted", header: "Counted", cell: (row) => (isLive(row) ? <Pill tone="success">Yes</Pill> : <Pill tone="neutral">No</Pill>) },
        ]} />
    </Stack>
  );
}
