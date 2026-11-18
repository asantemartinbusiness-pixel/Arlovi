import { resourceCapacity } from "./availability";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Button, Card, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice, Pill,
  Properties, Row, Segmented, Select, Stack, Stat, StatRow,
} from "@/design-system";
import { CalendarClock, CalendarDays, Clock, Users, Wrench } from "lucide-react";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, resolveRange, sameDay, startOfWeek } from "@/platform/clock";
import { computeInvoice } from "@/platform/money";
import { ProviderBoundary, TotalsBlock } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  blackoutFor, bodyOf, bookedMinutes, conflictsWithLinks, DEPOSIT_LABEL, isBookable, isLive, rememberedResource, rememberResource, statusTone,
  useBookData, workingHours, type BookingBody, type PublicPageBody, type ServiceBody,
} from "./data";
import { AvailabilityGrid } from "./calendar";
import { applyReportFilter, bookingInvoiceBlock, raiseBookingInvoice, ReportFilterNote, useReportFilter } from "./actions";

/* ====================================================================== *
 * BOOK panels — capacity, a real availability calendar with conflict
 * detection, and deposits that stop at the payment boundary.
 * ====================================================================== */

function serviceOf(data: ReturnType<typeof useBookData>, booking: Rec | undefined): Rec | undefined {
  return data.services.find((item) => item.id === String(booking?.fields.serviceId ?? ""));
}

function resourceOf(data: ReturnType<typeof useBookData>, booking: Rec | undefined): Rec | undefined {
  return data.resources.find((item) => item.id === String(booking?.fields.resourceId ?? ""));
}

function minutesOf(booking: Rec): number {
  if (!booking.startAt || !booking.endAt) return 0;
  return (new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60_000;
}

/* ---------------------------- BOOK-001 ---------------------------- */

export function BookingsOverview({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { now, org } = useWorkspace();
  const today = resolveRange("today", now);
  const week = resolveRange("week", now);

  const inWindow = (booking: Rec, from: Date, to: Date) =>
    Boolean(booking.startAt) && new Date(booking.startAt!) >= from && new Date(booking.startAt!) < to;

  const todays = data.bookings.filter((booking) => inWindow(booking, today.start, today.end));
  const weeks = data.bookings.filter((booking) => inWindow(booking, week.start, week.end));
  const cancellations = data.bookings.filter((booking) => booking.status === "cancelled");
  const noShows = data.bookings.filter((booking) => booking.status === "no_show");

  if (lens === "Capacity") {
    const bookable = data.resources.filter((resource) => isBookable(resource));
    return (
      <Stack gap={4}>
        <Grid>
          {bookable.map((resource) => {
            const window = workingHours(resource);
            // Seat-minutes: a resource that holds several at once has that much more capacity.
            const capacity = (window.endHour - window.startHour) * 60 * window.days.length * resourceCapacity(resource);
            const booked = bookedMinutes(data.bookings, resource.id, week.start, week.end);
            return (
              <Card key={resource.id} span={4} eyebrow={String(resource.fields.kind ?? "resource").toUpperCase()} prov="human" title={resource.title} subtitle={String(resource.fields.workingHours ?? "")}
                actions={<Pill tone={booked / capacity > 0.8 ? "warning" : "success"}>{Math.round((booked / Math.max(1, capacity)) * 100)}%</Pill>}>
                <Stack gap={3}>
                  <Meter value={booked} max={capacity || 1} label={`${resource.title} utilisation`} tone={booked / capacity > 0.8 ? "warning" : undefined} />
                  <Properties rows={[
                    { label: "Booked this week", value: <span className="ds-num">{Math.round(booked / 60)}h</span> },
                    { label: "Working hours", value: <span className="ds-num">{Math.round(capacity / 60)}h</span> },
                    { label: "Appointments", value: <span className="ds-num">{String(data.bookings.filter((booking) => String(booking.fields.resourceId) === resource.id && isLive(booking) && inWindow(booking, week.start, week.end)).length)}</span> },
                  ]} />
                </Stack>
              </Card>
            );
          })}
        </Grid>
        <Notice tone="info" title="Capacity is read from each resource's recorded hours">
          Utilisation divides booked minutes by the working hours on the resource record. A resource with no hours recorded is not counted rather than assumed to be available all week.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Insights") {
    const findings: { title: string; body: string }[] = [];
    const unconfirmed = data.bookings.filter((booking) => booking.status === "hold");
    if (unconfirmed.length) findings.push({ title: `${unconfirmed.length} slot${unconfirmed.length === 1 ? " is" : "s are"} held but not confirmed`, body: "A held slot blocks the resource without a customer behind it. It is shown as held, never as confirmed." });
    const depositsOwed = data.bookings.filter((booking) => String(booking.fields.depositState) === "awaiting_payment");
    if (depositsOwed.length) findings.push({ title: `${depositsOwed.length} deposits are awaiting payment`, body: `${context.money(depositsOwed.reduce((sum, booking) => sum + Number(booking.fields.depositMinor ?? 0), 0))} is owed. No payment processor is connected, so each one waits for the studio to collect it another way.` });
    const archivedWithBookings = data.services.filter((service) => service.status === "archived" && data.bookings.some((booking) => String(booking.fields.serviceId) === service.id && isLive(booking) && booking.startAt && new Date(booking.startAt) > now));
    if (archivedWithBookings.length) findings.push({ title: `${archivedWithBookings.length} archived service${archivedWithBookings.length === 1 ? " still has" : "s still have"} future bookings`, body: `${archivedWithBookings.map((service) => service.title).join(", ")}. The service cannot be fully retired until those are reconciled.` });
    if (noShows.length) findings.push({ title: `${noShows.length} no-show${noShows.length === 1 ? "" : "s"} recorded`, body: "No reminder could be sent for any of them, because no mail or telephony provider is connected." });
    return findings.length === 0
      ? <Empty title="Nothing stands out" icon={<CalendarClock size={20} />}>Findings come from booking, service and resource records only.</Empty>
      : <Stack gap={3}>{findings.map((finding) => <Card key={finding.title} prov="human" title={finding.title} subtitle={finding.body} />)}</Stack>;
  }

  const rows = lens === "Week" ? weeks : todays;
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Appointments today" value={String(todays.filter(isLive).length)} prov="human" meta={`${weeks.filter(isLive).length} this week`} onClick={() => context.openOverlay("capacity alert")} />
        <Stat label="Held, not confirmed" value={String(data.bookings.filter((booking) => booking.status === "hold").length)} prov="human" meta="Blocking a resource" />
        <Stat label="Deposits awaiting payment" value={context.money(data.bookings.filter((booking) => String(booking.fields.depositState) === "awaiting_payment").reduce((sum, booking) => sum + Number(booking.fields.depositMinor ?? 0), 0))} prov="human" meta="No processor is connected" />
        <Stat label="Cancellations" value={String(cancellations.length)} prov="human" meta={`${noShows.length} no-shows recorded`} />
        <Stat label="Online bookings today" value="Unavailable" unavailable meta="The public page is not hosted" />
      </StatRow>

      <Grid>
        <Card span={8} eyebrow={lens === "Week" ? "THIS WEEK" : "TODAY"} prov="human" title={lens === "Week" ? "This week" : "Today"} subtitle={`${rows.length} appointments between ${context.date(lens === "Week" ? week.start : today.start)} and ${context.date(addDays(lens === "Week" ? week.end : today.end, -1))}`} flush>
          {rows.length === 0 ? (
            <div className="ds-card-body"><Empty title="Nothing in this window" icon={<CalendarDays size={20} />}>Create a booking from the calendar, where free slots are checked before anything is offered.</Empty></div>
          ) : (
            <DataGrid
              rows={[...rows].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))}
              rowId={(row) => row.id}
              label="Appointments"
              filterable={false}
              selectedId={context.selectedId}
              onSelect={(id) => context.select(id)}
              onOpen={(id) => context.navigate(`/o/${org.slug}/book/bookings/${id}`)}
              rowTone={(row) => (row.status === "hold" ? "warning" : row.status === "cancelled" ? "danger" : undefined)}
              columns={[
                { key: "time", header: "Time", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.startAt)}</span>, sortValue: (row) => row.startAt ?? "" },
                { key: "title", header: "Booking", cell: (row) => row.title },
                { key: "service", header: "Service", cell: (row) => serviceOf(data, row)?.title ?? "—" },
                { key: "resource", header: "Resource", cell: (row) => resourceOf(data, row)?.title ?? "—" },
                { key: "deposit", header: "Deposit", cell: (row) => (Number(row.fields.depositMinor ?? 0) ? <Pill tone={String(row.fields.depositState) === "paid_local" ? "success" : "warning"}>{context.money(Number(row.fields.depositMinor))}</Pill> : <span className="ds-subtle">None</span>) },
                { key: "status", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status.replace("_", " ")}</Pill> },
              ]}
            />
          )}
        </Card>

        <Card span={4} eyebrow="STAFF LOAD" prov="human" title="Who is busy" subtitle="Booked minutes in this window">
          <Stack gap={3}>
            {data.resources.filter((resource) => String(resource.fields.kind) === "person").map((resource) => {
              const window = workingHours(resource);
              const capacity = (window.endHour - window.startHour) * 60;
              const booked = bookedMinutes(data.bookings, resource.id, lens === "Week" ? week.start : today.start, lens === "Week" ? week.end : today.end);
              return (
                <div key={resource.id}>
                  <Row gap={2}><span className="ds-grow">{resource.title}</span><span className="ds-num">{Math.round(booked / 60)}h</span></Row>
                  <Meter value={booked} max={(lens === "Week" ? capacity * window.days.length : capacity) || 1} label={`${resource.title} load`} />
                </div>
              );
            })}
          </Stack>
        </Card>

        <Card span={12} eyebrow="REVENUE" prov="human" title="Service value in this window" subtitle="List price on each booked service; deposits are shown separately because they have not been collected">
          <BarChart
            title="Booked service value by service"
            height={190}
            format={(value) => context.money(value)}
            series={[{
              name: "Booked value",
              points: data.services.filter((service) => service.status !== "archived").map((service) => ({
                label: (() => { const same = data.services.filter((other) => other.status !== "archived" && other.title === service.title); return same.length > 1 ? `${service.title} (${same.indexOf(service) + 1})` : service.title; })(),
                value: rows.filter((booking) => String(booking.fields.serviceId) === service.id && isLive(booking)).reduce((sum) => sum + (service.amountMinor ?? 0), 0),
              })),
            }]}
            footer="Value is the recorded list price of each booked service. Nothing has been invoiced or paid from here."
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- BOOK-002 ---------------------------- */

export function BookingCalendar({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { now, org } = useWorkspace();
  const [anchor, setAnchor] = useState(() => new Date(now));
  const [resourceId, setResourceId] = useState(() => rememberedResource(org.id));

  const bookable = data.resources.filter((resource) => isBookable(resource));
  const active = bookable.find((resource) => resource.id === resourceId) ?? bookable[0];

  const move = async ({ bookingId, startAt, endAt, columnId }: { bookingId: string; startAt: string; endAt: string; columnId: string }) => {
    const booking = data.bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    const nextResource = bookable.some((resource) => resource.id === columnId) ? columnId : String(booking.fields.resourceId);
    await context.mutate.patch(bookingId, {
      startAt, endAt, at: startAt,
      fields: { ...booking.fields, resourceId: nextResource },
    }, { expectRevision: booking.revision, event: `${booking.title} rescheduled to ${startAt}` });
    context.toast("Booking moved", `${booking.title} is now ${context.dateTime(startAt)}. The slot was checked for a conflict before the move.`);
  };

  if (lens === "Month") {
    const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1), 1);
    const cells = Array.from({ length: 35 }, (_, index) => addDays(start, index));
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} aria-label="Previous month">←</Button>
          <strong style={{ minWidth: 170, textAlign: "center" }}>{anchor.toLocaleDateString(org.locale, { month: "long", year: "numeric" })}</strong>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} aria-label="Next month">→</Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date(now))}>Today</Button>
          <span className="ds-grow" />
          <span className="ds-subtle">Month shows load per day. Open a day to move a booking.</span>
        </Row>
        <div className="t4-cal">
          <div className="t4-cal-head" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor, 1), index)).map((day) => <span key={day.toISOString()}>{day.toLocaleDateString(org.locale, { weekday: "short" })}</span>)}
          </div>
          <div className="t4-cal-grid" data-mode="month" role="grid" aria-label="Bookings by day">
            {cells.map((day) => {
              const here = data.bookings.filter((booking) => booking.startAt && sameDay(new Date(booking.startAt), day) && booking.status !== "cancelled");
              return (
                <div key={day.toISOString()} role="gridcell" className="t4-cal-cell" data-today={sameDay(day, now) ? "true" : undefined} data-outside={day.getMonth() !== anchor.getMonth() ? "true" : undefined}>
                  <span className="t4-cal-date">{day.getDate()}</span>
                  {here.slice(0, 3).map((booking) => (
                    <button key={booking.id} type="button" className="t4-cal-item" data-tone={booking.status === "hold" ? "warning" : "success"} onFocus={() => context.select(booking.id)} onClick={() => context.navigate(`/o/${org.slug}/book/bookings/${booking.id}`)}>
                      <strong>{booking.title}</strong>
                      <span className="ds-num">{new Date(booking.startAt!).toLocaleTimeString(org.locale, { hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  ))}
                  {here.length > 3 && <span className="ds-subtle">+{here.length - 3} more</span>}
                </div>
              );
            })}
          </div>
        </div>
      </Stack>
    );
  }

  if (lens === "Staff" || lens === "Resource") {
    const columns = (lens === "Staff" ? bookable.filter((resource) => String(resource.fields.kind) === "person") : bookable.filter((resource) => String(resource.fields.kind) !== "person"))
      .map((resource) => ({ id: resource.id, label: resource.title }));
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, -1))} aria-label="Previous day">←</Button>
          <strong className="ds-num" style={{ minWidth: 190, textAlign: "center" }}>{context.date(anchor, { weekday: "long", day: "numeric", month: "long" })}</strong>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, 1))} aria-label="Next day">→</Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date(now))}>Today</Button>
        </Row>
        {columns.length === 0 ? <Empty title={`No bookable ${lens === "Staff" ? "people" : "rooms or equipment"}`} icon={<Users size={20} />} /> : (
          <AvailabilityGrid
            bookings={data.bookings}
            resources={data.resources}
            columns={columns}
            mode="day"
            anchor={anchor}
            now={now}
            orgId={org.id}
            label={`${lens} availability`}
            resourceForColumn={(id) => id}
            onMove={move}
            onOpen={(id) => context.navigate(`/o/${org.slug}/book/bookings/${id}`)}
            onSelect={(id) => context.select(id)}
            selectedId={context.selectedId}
            onCreate={(columnId, startAt) => context.openOverlay("Booking form", { resourceId: columnId, startAt })}
          />
        )}
      </Stack>
    );
  }

  const mode = lens === "Week" ? "week" : "day";
  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, mode === "week" ? -7 : -1))} aria-label={`Previous ${mode}`}>←</Button>
        <strong className="ds-num" style={{ minWidth: 200, textAlign: "center" }}>
          {mode === "week" ? `Week of ${context.date(startOfWeek(anchor, 1), { day: "numeric", month: "long" })}` : context.date(anchor, { weekday: "long", day: "numeric", month: "long" })}
        </strong>
        <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, mode === "week" ? 7 : 1))} aria-label={`Next ${mode}`}>→</Button>
        <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date(now))}>Today</Button>
        <Field label="Resource">
          <Select value={active?.id ?? ""} onChange={(event) => { setResourceId(event.target.value); rememberResource(org.id, event.target.value); }}>
            {bookable.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}
          </Select>
        </Field>
      </Row>
      {!active ? <Empty title="No bookable resource" icon={<Wrench size={20} />} /> : (
        <AvailabilityGrid
          bookings={data.bookings}
          resources={data.resources}
          columns={[{ id: active.id, label: active.title }]}
          mode={mode}
          anchor={anchor}
          now={now}
          orgId={org.id}
          label={`${active.title} availability`}
          resourceForColumn={() => active.id}
          onMove={move}
          onOpen={(id) => context.navigate(`/o/${org.slug}/book/bookings/${id}`)}
          onSelect={(id) => context.select(id)}
          selectedId={context.selectedId}
          onCreate={(_columnId, startAt) => context.openOverlay("Booking form", { resourceId: active.id, startAt })}
        />
      )}
      <Notice tone="info" title="Two people cannot take the same slot">
        Every move and every new booking is checked against the existing bookings for that resource, and for any resource linked to it, before it is written. A clash is refused with the booking that already holds the slot.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- BOOK-003 ---------------------------- */

export function BookingDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const booking = useRecord(context.params.id) ?? data.bookings.find((item) => item.id === context.params.id);
  const service = serviceOf(data, booking);
  const resource = resourceOf(data, booking);
  const contact = data.contacts.find((item) => item.id === String(booking?.fields.contactId ?? ""));
  const invoice = useRecord(booking?.fields.invoiceId ? String(booking.fields.invoiceId) : undefined);
  if (!booking) return <Empty title="Booking not found" />;

  const totals = computeInvoice({
    lines: service ? [{ id: "l1", description: service.title, quantity: Number(booking.fields.seats ?? 1), unitPriceMinor: service.amountMinor ?? 0, taxCategory: "standard" }] : [],
    jurisdiction: org.jurisdiction,
    customerStatus: contact ? "domestic" : "unknown",
    date: booking.startAt ?? now.toISOString(),
  });

  if (lens === "Payments") {
    const deposit = Number(booking.fields.depositMinor ?? 0);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Service value" value={context.money(totals.grossMinor)} prov="human" meta="List price with resolved tax" />
          <Stat label="Deposit" value={deposit ? context.money(deposit) : "None"} prov={deposit ? "human" : undefined} meta={DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? String(booking.fields.depositState)} />
          <Stat label="Collected" value={String(booking.fields.depositState) === "paid_local" ? context.money(deposit) : context.money(0)} prov="posted" meta="Recorded in the local ledger" />
          <Stat label="Processor reference" value="Unavailable" unavailable meta="No payment processor is connected" />
        </StatRow>
        <TotalsBlock totals={totals} money={context.money} label="Service" />
        <ProviderBoundary id="payment.capture" title="A deposit cannot be taken here" >
          The deposit amount, the service and the person it belongs to are recorded against this booking. Collecting it needs a processor, so the booking says awaiting payment rather than implying money arrived.
        </ProviderBoundary>
      </Stack>
    );
  }

  if (lens === "Messages") {
    const messages = bodyOf<BookingBody>(booking, {}).messages ?? [];
    return (
      <Stack gap={4}>
        {messages.length === 0 ? <Empty title="No messages" icon={<Clock size={20} />}>Messages written here are kept against the booking; no mail or telephony provider is connected.</Empty> : (
          <ol className="t4-timeline">
            {messages.map((message, index) => (
              <li key={`${message.at}-${index}`}>
                <div>
                  <strong className="ds-num">{context.dateTime(message.at)}</strong>
                  <div className="ds-subtle">{message.direction === "out" ? "From the studio" : "From the customer"}</div>
                </div>
                <div className="ds-panel" style={{ padding: "var(--space-3)" }}>{message.body}</div>
              </li>
            ))}
          </ol>
        )}
        <ProviderBoundary id="email.send" />
      </Stack>
    );
  }

  if (lens === "History") {
    return booking.history.length === 0
      ? <Empty title="No earlier version" >A version is stored each time this booking is saved.</Empty>
      : (
        <DataGrid rows={booking.history} rowId={(row) => row.at} label="Booking history" filterable={false}
          columns={[
            { key: "at", header: "Saved", primary: true, cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span> },
            { key: "status", header: "State then", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status}</Pill> },
            { key: "title", header: "Title then", cell: (row) => row.title },
            { key: "deposit", header: "Deposit then", cell: (row) => String(row.fields.depositState ?? "—").replace(/_/g, " ") },
          ]} />
      );
  }

  const clashes = booking.startAt && booking.endAt
    ? conflictsWithLinks(data.bookings, data.resources, org.id, String(booking.fields.resourceId), booking.startAt, booking.endAt, booking.id)
    : [];
  const noticeHours = Number(service?.fields.cancellationNoticeHours ?? 24);
  const hoursAway = booking.startAt ? (new Date(booking.startAt).getTime() - now.getTime()) / 3_600_000 : 0;

  return (
    <Grid>
      <Card span={5} eyebrow="GUEST" prov="human" title={contact?.title ?? "No contact linked"} subtitle={contact ? String(contact.fields.email ?? "") : "Walk-in or internal hold"}>
        <Properties rows={[
          { label: "Service", value: service?.title ?? "—" },
          { label: "Resource", value: resource?.title ?? "—" },
          { label: "Starts", value: <span className="ds-num">{context.dateTime(booking.startAt)}</span> },
          { label: "Length", value: <span className="ds-num">{minutesOf(booking)} minutes</span> },
          { label: "Seats", value: <span className="ds-num">{String(booking.fields.seats ?? 1)}</span> },
          { label: "Source", value: String(booking.fields.source ?? "internal").replace("_", " ") },
        ]} />
      </Card>
      <Card span={7} eyebrow="STATE" prov="human" title="Status and deposit" subtitle={`${booking.status.replace("_", " ")} · ${DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? ""}`}>
        <Stack gap={3}>
          <Properties rows={[
            { label: "Booking state", value: <Pill tone={statusTone(booking.status)} dot>{booking.status.replace("_", " ")}</Pill> },
            { label: "Deposit", value: Number(booking.fields.depositMinor ?? 0) ? <span className="ds-num">{context.money(Number(booking.fields.depositMinor))}</span> : "None for this service" },
            { label: "Reminder", value: <Pill tone="warning">{String(booking.fields.reminderState ?? "not_sent").replace(/_/g, " ")}</Pill> },
            { label: "Checked in", value: booking.fields.checkedIn === true ? "Yes" : "No" },
          ]} />
          {booking.status === "hold" && (
            <Notice tone="warning" title="This slot is held, not confirmed">
              A held slot blocks the resource but has not been agreed with the customer. It is never shown to anyone as a confirmed appointment.
            </Notice>
          )}
          {clashes.length > 0 && (
            <Notice tone="danger" title="This booking overlaps another">
              {clashes.map((clash) => `${clash.booking.title} holds ${data.resources.find((item) => item.id === clash.resourceId)?.title ?? clash.resourceId}`).join("; ")}. One of them has to move.
            </Notice>
          )}
          <Notice tone={hoursAway < noticeHours ? "warning" : "info"} title={`Cancellation notice: ${noticeHours} hours`}>
            {booking.startAt
              ? hoursAway < 0
                ? "This appointment is in the past."
                : hoursAway < noticeHours
                  ? `It starts in ${Math.round(hoursAway)} hours, inside the notice period. Cancelling now may incur a fee of ${((Number(service?.fields.cancellationFeeBp ?? 0)) / 100).toFixed(0)}% of the service value.`
                  : `It starts in ${Math.round(hoursAway)} hours, outside the notice period, so no fee applies.`
              : "No start time is recorded."}
          </Notice>
        </Stack>
      </Card>
      <Card span={12} eyebrow="SERVICE HISTORY" prov="human" title="Invoice" subtitle={invoice ? `${invoice.title} · ${invoice.status.replace("_", " ")}` : "No invoice raised for this booking"}>
        {invoice ? (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Invoice", value: <Link to={`/o/${org.slug}/fin/invoices/${invoice.id}`}>{invoice.title}</Link> },
              { label: "State in Finance", value: <Pill tone={invoice.status === "paid" ? "success" : "warning"}>{invoice.status.replace("_", " ")}</Pill> },
              { label: "Gross", value: <span className="ds-num">{context.money(invoice.amountMinor)}</span> },
              { label: "Customer", value: contact ? <Link to={`/o/${org.slug}/crm/contacts/${contact.id}`}>{contact.title}</Link> : "—" },
              { label: "Raised by", value: `${String(booking.fields.invoicedBy ?? invoice.createdBy)} on ${context.dateTime(String(booking.fields.invoicedAt ?? invoice.createdAt))}` },
            ]} />
            {invoice.status === "draft" && <Notice tone="info" title="A draft invoice is not in the ledger">Finance approves and posts it; until then nothing is receivable.</Notice>}
          </Stack>
        ) : (() => {
          const why = bookingInvoiceBlock(booking, service);
          return (
            <Stack gap={3}>
              <p className="ds-prose">
                {why ?? `${booking.title} is completed. Raise a draft invoice in Finance for ${context.money(totals.grossMinor)}, linked to this booking and to the customer's record.`}
              </p>
              {!why && <Row gap={2}><Button variant="primary" onClick={() => raiseBookingInvoice(context, booking.id)}>Raise an invoice</Button></Row>}
            </Stack>
          );
        })()}
      </Card>
      {resource && blackoutFor(resource, booking.startAt ?? "", booking.endAt ?? "") && (
        <Card span={12} prov="unknown" title="The resource is marked unavailable in this window">
          <Notice tone="danger">{resource.title} has a blackout covering this appointment. It needs moving or the blackout needs changing.</Notice>
        </Card>
      )}
    </Grid>
  );
}

/* ---------------------------- BOOK-004 ---------------------------- */

export function ServicesAndPricing({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { org, now } = useWorkspace();

  if (lens === "Categories") {
    const categories = [...new Set(data.services.map((service) => String(service.fields.category ?? "Uncategorised")))];
    return (
      <Grid>
        {categories.map((category) => {
          const members = data.services.filter((service) => String(service.fields.category ?? "Uncategorised") === category);
          return (
            <Card key={category} span={4} eyebrow="CATEGORY" prov="human" title={category} subtitle={`${members.length} services`}>
              <Stack gap={2}>
                {members.map((service) => (
                  <Row key={service.id} gap={2}>
                    <span className="ds-grow ds-truncate">{service.title}</span>
                    <span className="ds-num">{service.amountMinor ? context.money(service.amountMinor) : "Free"}</span>
                  </Row>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Packages") {
    const packages = data.services.filter((service) => String(service.fields.kind) === "package");
    return packages.length === 0
      ? <Empty title="No packages" icon={<CalendarClock size={20} />}>A package sells several sessions together and books them individually.</Empty>
      : (
        <Grid>
          {packages.map((pack) => (
            <Card key={pack.id} span={6} eyebrow="PACKAGE" prov="human" title={pack.title} subtitle={pack.summary}
              actions={<span className="ds-num">{context.money(pack.amountMinor)}</span>}>
              <Properties rows={[
                { label: "Sessions", value: <span className="ds-num">{String(pack.fields.sessions ?? 1)}</span> },
                { label: "Total minutes", value: <span className="ds-num">{String(pack.fields.minutes ?? 0)}</span> },
                { label: "Deposit", value: <span className="ds-num">{context.money(Number(pack.fields.depositMinor ?? 0))}</span> },
                { label: "Value against single visits", value: <span className="ds-num">{context.money((data.services.find((service) => service.id === "nl-services-621")?.amountMinor ?? 0) * Number(pack.fields.sessions ?? 1))}</span> },
              ]} />
            </Card>
          ))}
        </Grid>
      );
  }

  if (lens === "Rules") {
    return (
      <Stack gap={4}>
        <DataGrid rows={data.services} rowId={(row) => row.id} label="Booking rules" filterable={false}
          columns={[
            { key: "title", header: "Service", primary: true, cell: (row) => row.title },
            { key: "minutes", header: "Length", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.minutes ?? 0)}m</span> },
            { key: "buffer", header: "Buffer after", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.bufferMinutes ?? 0)}m</span> },
            { key: "seats", header: "Seats", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.seats ?? 1)}</span> },
            { key: "notice", header: "Cancellation notice", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.cancellationNoticeHours ?? 0)}h</span> },
            { key: "fee", header: "Fee inside notice", align: "end", cell: (row) => <span className="ds-num">{(Number(row.fields.cancellationFeeBp ?? 0) / 100).toFixed(0)}%</span> },
          ]} />
        <Notice tone="info" title="The buffer is part of the slot">
          A service with a buffer occupies its own length plus the buffer, so the next appointment cannot start until the room has been reset.
        </Notice>
      </Stack>
    );
  }

  return (
    <DataGrid
      rows={data.services.filter((service) => String(service.fields.kind) !== "package")}
      rowId={(row) => row.id}
      label="Services"
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.openOverlay("Service editor", { id })}
      columns={[
        { key: "title", header: "Service", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "category", header: "Category", cell: (row) => <Pill>{String(row.fields.category ?? "—")}</Pill> },
        { key: "minutes", header: "Length", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.minutes ?? 0)}m</span>, sortValue: (row) => Number(row.fields.minutes ?? 0) },
        { key: "buffer", header: "Buffer", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.bufferMinutes ?? 0)}m</span> },
        { key: "price", header: "Price", align: "end", cell: (row) => <span className="ds-num">{row.amountMinor ? context.money(row.amountMinor) : "Free"}</span>, sortValue: (row) => row.amountMinor ?? 0 },
        { key: "deposit", header: "Deposit", align: "end", cell: (row) => <span className="ds-num">{Number(row.fields.depositMinor ?? 0) ? context.money(Number(row.fields.depositMinor)) : "—"}</span> },
        { key: "resources", header: "Resources", cell: (row) => String((bodyOf<ServiceBody>(row, {}).resources ?? []).length) },
        { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "active" ? "success" : row.status === "archived" ? "neutral" : "warning"}>{row.status}</Pill> },
        { key: "open", header: "Future bookings", align: "end", cell: (row) => {
          const open = data.bookings.filter((booking) => String(booking.fields.serviceId) === row.id && isLive(booking) && booking.startAt && new Date(booking.startAt) > now).length;
          return open ? <Pill tone={row.status === "archived" ? "danger" : "info"}>{open}</Pill> : <span className="ds-subtle">None</span>;
        } },
      ]}
      summary={<span>{data.services.length} services · prices exclude {org.jurisdiction} tax until a booking is priced</span>}
    />
  );
}

/* ---------------------------- BOOK-005 ---------------------------- */

export function StaffAndResources({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { now, org } = useWorkspace();
  const week = resolveRange("week", now);
  const kinds: Record<string, string> = { People: "person", Rooms: "room", Equipment: "equipment" };

  if (lens === "Availability") {
    return (
      <Stack gap={4}>
        <DataGrid rows={data.resources} rowId={(row) => row.id} label="Availability" filterable={false}
          onSelect={(id) => context.select(id)}
          columns={[
            { key: "title", header: "Resource", primary: true, cell: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "")}</Pill> },
            { key: "hours", header: "Working hours", cell: (row) => <span className="ds-num">{String(row.fields.workingHours ?? "Not recorded")}</span> },
            { key: "capacity", header: "Holds at once", align: "end", cell: (row) => <span className="ds-num">{resourceCapacity(row)}</span>, sortValue: (row) => resourceCapacity(row) },
            { key: "tz", header: "Time zone", cell: (row) => String(row.fields.timezone ?? org.timezone) },
            { key: "blackouts", header: "Blackouts", align: "end", cell: (row) => {
              const list = bodyOf<import("./data").ResourceBody>(row, {}).blackouts ?? [];
              return list.length ? <Pill tone="warning">{list.length}</Pill> : <span className="ds-subtle">None</span>;
            } },
            { key: "linked", header: "Linked to", cell: (row) => data.resources.find((item) => item.id === String(row.fields.linkedResourceId))?.title ?? <span className="ds-subtle">—</span> },
          ]} />
        <Notice tone="warning" title="Linked resources block each other">
          The survey kit travels with a fitter, so booking one holds the other. A conflict on either is refused, which is why a confirmed slot can never double-book the kit.
        </Notice>
      </Stack>
    );
  }

  const rows = data.resources.filter((resource) => String(resource.fields.kind) === kinds[lens]);
  if (rows.length === 0) return <Empty title={`No ${lens.toLowerCase()}`} icon={<Wrench size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Resource editor")}>Add a resource</Button>} />;

  return (
    <Grid>
      {rows.map((resource) => {
        const window = workingHours(resource);
        // Seat-minutes: a resource that holds several at once has that much more capacity.
        const capacity = (window.endHour - window.startHour) * 60 * window.days.length * resourceCapacity(resource);
        const booked = bookedMinutes(data.bookings, resource.id, week.start, week.end);
        const blackouts = bodyOf<import("./data").ResourceBody>(resource, {}).blackouts ?? [];
        return (
          <Card key={resource.id} span={4} eyebrow={String(resource.fields.kind ?? "").toUpperCase()} prov="human" title={resource.title} subtitle={resource.summary}
            actions={<Pill tone={isBookable(resource) ? "success" : "neutral"}>{isBookable(resource) ? "Bookable" : "Not bookable"}</Pill>}
            footer={<>
              <Button size="sm" variant={context.selectedId === resource.id ? "primary" : "secondary"} aria-pressed={context.selectedId === resource.id} onClick={() => context.select(context.selectedId === resource.id ? undefined : resource.id)}>{context.selectedId === resource.id ? "Selected" : "Select"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(resource.id); context.openOverlay("Resource editor", { id: resource.id }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(resource.id); context.openOverlay("recurrence", { id: resource.id }); }}>Block a period</Button>
            </>}>
            <Stack gap={3}>
              <Properties rows={[
                { label: "Hours", value: <span className="ds-num">{String(resource.fields.workingHours ?? "Not recorded")}</span> },
                { label: "Holds at once", value: <span className="ds-num">{resourceCapacity(resource)}</span> },
                { label: "Booked this week", value: <span className="ds-num">{Math.round(booked / 60)}h of {Math.round(capacity / 60)}h</span> },
                { label: "Blackouts", value: blackouts.length ? `${blackouts.length} (${blackouts[0].reason})` : "None" },
              ]} />
              <Meter value={booked} max={capacity || 1} label={`${resource.title} utilisation`} tone={booked / capacity > 0.8 ? "warning" : undefined} />
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- BOOK-006 ---------------------------- */

export function PublicBookingPage({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { org, now } = useWorkspace();
  const page = data.sites.find((site) => String(site.fields.kind) === "bookingPage");
  const body = bodyOf<PublicPageBody>(page, {});
  const [device, setDevice] = useState<"phone" | "desktop">("desktop");
  const [serviceId, setServiceId] = useState(body.services?.[0] ?? data.services[0]?.id ?? "");
  const service = data.services.find((item) => item.id === serviceId);

  if (!page) return <Empty title="No public page is configured" icon={<CalendarDays size={20} />} />;

  if (lens === "Availability") {
    const resource = data.resources.find((item) => item.id === (bodyOf<ServiceBody>(service, {}).resources ?? [])[0]) ?? data.resources[0];
    const window = workingHours(resource);
    const days = Array.from({ length: 7 }, (_, index) => addDays(now, index + 1));
    return (
      <Stack gap={4}>
        <Field label="Service">
          <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            {(body.services ?? []).map((id) => <option key={id} value={id}>{data.services.find((item) => item.id === id)?.title ?? id}</option>)}
          </Select>
        </Field>
        <Card eyebrow="OFFERED SLOTS" prov="human" title="What a visitor would be offered" subtitle={`${resource?.title ?? "No resource"} · ${String(resource?.fields.timezone ?? org.timezone)}`}>
          <Stack gap={3}>
            {days.map((day) => {
              if (!window.days.includes(day.getDay())) return null;
              const slots = Array.from({ length: window.endHour - window.startHour }, (_, index) => {
                const start = new Date(day);
                start.setHours(window.startHour + index, 0, 0, 0);
                const end = new Date(start.getTime() + Number(service?.fields.minutes ?? 45) * 60_000);
                const clash = resource ? conflictsWithLinks(data.bookings, data.resources, org.id, resource.id, start.toISOString(), end.toISOString()).length > 0 : true;
                return { start, free: !clash };
              });
              return (
                <div key={day.toISOString()}>
                  <strong className="ds-num">{context.date(day, { weekday: "long", day: "numeric", month: "long" })}</strong>
                  <Row gap={2} wrap style={{ marginBlockStart: 6 }}>
                    {slots.map((slot) => (
                      <Pill key={slot.start.toISOString()} tone={slot.free ? "success" : "neutral"}>
                        <span className="ds-num">{slot.start.toLocaleTimeString(org.locale, { hour: "2-digit", minute: "2-digit" })}</span>
                        {slot.free ? "" : " taken"}
                      </Pill>
                    ))}
                  </Row>
                </div>
              );
            })}
          </Stack>
        </Card>
        <Notice tone="warning" title={`Times are offered in ${String(resource?.fields.timezone ?? org.timezone)}`}>
          A slot that is already held is never offered. Daylight saving is resolved by the browser's own time zone database when the slot is rendered, so a visitor in another zone sees their local time for the same instant.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Fields") {
    return (
      <Stack gap={4}>
        <DataGrid rows={body.fields ?? []} rowId={(row) => row.id} label="Form fields" filterable={false}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.openOverlay("Form field inspector", { fieldId: id })}
          columns={[
            { key: "label", header: "Field", primary: true, cell: (row) => row.label },
            { key: "type", header: "Type", cell: (row) => <Pill>{row.type}</Pill> },
            { key: "required", header: "Required", cell: (row) => (row.required ? <Pill tone="warning">Required</Pill> : <span className="ds-subtle">Optional</span>) },
          ]} />
        <Notice tone="info" title="Only what the appointment needs">
          Each field has to earn its place: a longer form loses bookings, and anything collected has to be justified to the person filling it in.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Preview") {
    return (
      <Stack gap={4}>
        <Row gap={2}>
          <Segmented label="Preview width" value={device} onChange={setDevice} options={[{ value: "phone", label: "390" }, { value: "desktop", label: "Full" }]} />
          <span className="ds-subtle">The public page is a model in this workspace. It is not hosted, so no visitor can reach it.</span>
        </Row>
        <div className="t4-device" style={{ maxWidth: device === "phone" ? 390 : undefined, marginInline: device === "phone" ? "auto" : undefined }}>
          <div className="t4-device-head">northline.example/book/{String(page.fields.slug)}</div>
          <div className="t4-device-body">
            <h3>{page.title}</h3>
            <p className="ds-subtle">{body.intro}</p>
            <Stack gap={2}>
              {(body.services ?? []).map((id) => {
                const item = data.services.find((candidate) => candidate.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <Row gap={2}>
                      <strong className="ds-grow">{item.title}</strong>
                      <span className="ds-num">{item.amountMinor ? context.money(item.amountMinor) : "Free"}</span>
                    </Row>
                    <span className="ds-subtle">{String(item.fields.minutes)} minutes · {item.summary}</span>
                  </div>
                );
              })}
            </Stack>
            <Stack gap={2}>
              {(body.fields ?? []).map((field) => (
                <Field key={field.id} label={field.label} required={field.required}>
                  <span className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-subtle)", fontSize: "var(--text-sm)" }}>
                    {field.type === "consent" ? "Checkbox" : field.type}
                  </span>
                </Field>
              ))}
            </Stack>
            <Button variant="primary" disabled>Request this time — needs hosting</Button>
          </div>
        </div>
        <ProviderBoundary id="site.publish" title="The booking page is not published" />
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={6} eyebrow="BRAND" prov="human" title="Theme" subtitle="The page uses the workspace tokens, so it matches the studio">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Theme", value: String(page.fields.theme ?? "studio") },
            { label: "Time zone", value: String(page.fields.timezone ?? org.timezone) },
            { label: "Show prices", value: page.fields.showPrices === true ? "Yes" : "No" },
            { label: "Path", value: <code>/book/{String(page.fields.slug)}</code> },
          ]} />
          <div className="t4-swatches">
            {["var(--accent)", "var(--bg-sunken)", "var(--success)", "var(--fg-strong)"].map((colour) => <span key={colour} className="t4-swatch" style={{ background: colour }} title={colour} />)}
          </div>
        </Stack>
      </Card>
      <Card span={6} eyebrow="RECORDED" prov="human" title="What the page has done" subtitle="Counts stored on the page record">
        <Properties rows={[
          { label: "Views", value: <span className="ds-num">{String(page.fields.views ?? 0)}</span> },
          { label: "Bookings taken", value: <span className="ds-num">{String(page.fields.bookings ?? 0)}</span> },
          { label: "Published", value: <Pill tone="warning">Model only, not hosted</Pill> },
        ]} />
      </Card>
      <Card span={12} eyebrow="ACCESSIBILITY" prov="human" title="What the page commits to">
        <Notice tone="info">
          Every field has a visible label, the slot list is a list of buttons rather than a grid of divs, and the consent box is required rather than pre-ticked. The preview renders at 390px as well as full width.
        </Notice>
      </Card>
    </Grid>
  );
}

/* ---------------------------- BOOK-007 ---------------------------- */

export function RemindersAndNoShows({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const reminders = data.templates.filter((template) => String(template.fields.kind) === "reminder");
  const noShows = data.bookings.filter((booking) => booking.status === "no_show");
  const completed = data.bookings.filter((booking) => booking.status === "completed");

  if (lens === "Templates") {
    return reminders.length === 0
      ? <Empty title="No reminder templates" icon={<Clock size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Template editor")}>Write one</Button>} />
      : (
        <Grid>
          {reminders.map((template) => {
            const body = bodyOf<{ subject?: string; body?: string }>(template, {});
            return (
              <Card key={template.id} span={6} eyebrow={String(template.fields.channel ?? "").toUpperCase()} prov="human" title={template.title} subtitle={body.subject || "No subject"}
                actions={<Pill tone={template.status === "approved" ? "success" : "warning"}>{template.status}</Pill>}
                footer={<>
                  <Button size="sm" variant="secondary" onClick={() => { context.select(template.id); context.openOverlay("Template editor", { id: template.id }); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => { context.select(template.id); context.openOverlay("send preview", { id: template.id }); }}>Preview</Button>
                </>}>
                <p className="ds-prose" style={{ whiteSpace: "pre-wrap" }}>{body.body}</p>
              </Card>
            );
          })}
        </Grid>
      );
  }

  if (lens === "History") {
    const queued = data.bookings.filter((booking) => String(booking.fields.reminderState) === "queued_local");
    return (
      <Stack gap={4}>
        <ProviderBoundary id="email.send" title="No reminder has ever been delivered" />
        <DataGrid rows={data.bookings.filter((booking) => booking.startAt)} rowId={(row) => row.id} label="Reminder history"
          columns={[
            { key: "title", header: "Booking", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "when", header: "Appointment", cell: (row) => <span className="ds-num">{context.dateTime(row.startAt)}</span>, sortValue: (row) => row.startAt ?? "" },
            { key: "state", header: "Reminder", cell: (row) => <Pill tone={String(row.fields.reminderState) === "queued_local" ? "warning" : "neutral"} dot>{String(row.fields.reminderState ?? "not_sent").replace(/_/g, " ")}</Pill> },
            { key: "contact", header: "Contactable", cell: (row) => (String(row.fields.contactId) ? <Pill tone="success">Contact on file</Pill> : <Pill tone="warning">No contact</Pill>) },
            { key: "outcome", header: "Outcome", cell: (row) => <Pill tone={statusTone(row.status)}>{row.status.replace("_", " ")}</Pill> },
          ]} />
        <Notice tone="warning" title={`${queued.length} reminders are queued locally`}>
          A queued reminder is a record of what would be sent and when. With no provider connected the queue never drains, which is why the no-show figures below cannot be blamed on the reminder.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Metrics") {
    const rate = completed.length + noShows.length === 0 ? 0 : noShows.length / (completed.length + noShows.length);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="No-shows" value={String(noShows.length)} prov="posted" meta="Recorded against past bookings" />
          <Stat label="Completed" value={String(completed.length)} prov="posted" meta="Checked in and finished" />
          <Stat label="No-show rate" value={completed.length + noShows.length === 0 ? "Unavailable" : `${(rate * 100).toFixed(0)}%`} unavailable={completed.length + noShows.length === 0} prov={completed.length + noShows.length === 0 ? undefined : "posted"} meta={`${completed.length + noShows.length} finished appointments`} />
          <Stat label="Reminders delivered" value="0" meta="No provider has ever been connected" />
        </StatRow>
        <Notice tone="warning" title="A no-show rate from a handful of appointments is not a trend">
          {completed.length + noShows.length} finished appointments are recorded. At that number a single missed appointment moves the rate by several points, so it is reported as a count first.
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <DataGrid rows={reminders} rowId={(row) => row.id} label="Reminder rules" filterable={false}
        onSelect={(id) => context.select(id)}
        columns={[
          { key: "title", header: "Rule", primary: true, cell: (row) => row.title },
          { key: "channel", header: "Channel", cell: (row) => <Pill>{String(row.fields.channel ?? "")}</Pill> },
          { key: "offset", header: "When", align: "end", cell: (row) => <span className="ds-num">{Number(row.fields.offsetHours ?? 0) >= 0 ? `${row.fields.offsetHours}h before` : `${Math.abs(Number(row.fields.offsetHours))}h after`}</span> },
          { key: "enabled", header: "Enabled", cell: (row) => (row.fields.enabled === true ? <Pill tone="success">On</Pill> : <Pill tone="neutral">Off</Pill>) },
          { key: "delivery", header: "Delivery", cell: (row) => <Pill tone="warning">{String(row.fields.delivery ?? "").replace("_", " ")}</Pill> },
        ]} />
      <Notice tone="warning" title="Contact preferences are honoured before any queue is built">
        A booking with no contact record, or a contact without consent for that channel, is left out of the queue entirely rather than queued and silently dropped. {data.bookings.filter((booking) => !String(booking.fields.contactId)).length} bookings have no contact on file and would never be reminded.
      </Notice>
      <Card eyebrow="LOAD" prov="human" title="What the rules would send this week" subtitle="Computed from the bookings in the next seven days">
        <BarChart
          title="Reminders by channel"
          height={170}
          format={(value) => String(Math.round(value))}
          series={[{
            name: "Would be queued",
            points: ["email", "sms"].map((channel) => ({
              label: channel,
              value: reminders.filter((template) => String(template.fields.channel) === channel && template.fields.enabled === true).length
                * data.bookings.filter((booking) => booking.startAt && new Date(booking.startAt) > now && new Date(booking.startAt) < addDays(now, 7) && String(booking.fields.contactId)).length,
            })),
          }]}
        />
      </Card>
    </Stack>
  );
}

/* ---------------------------- BOOK-008 ---------------------------- */

export function BookingReports({ context, lens }: { context: ScreenContext; lens: string }) {
  return (
    <Stack gap={3}>
      <ReportFilterNote />
      <BookingReportsBody context={context} lens={lens} />
    </Stack>
  );
}

function BookingReportsBody({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useBookData();
  const { now, org } = useWorkspace();
  const week = resolveRange("week", now);
  const filter = useReportFilter();
  const bookings = applyReportFilter(data.bookings, filter);
  const live = bookings.filter(isLive);

  if (lens === "Revenue") {
    const byService = data.services.map((service) => {
      const theirs = live.filter((booking) => String(booking.fields.serviceId) === service.id);
      return { service, count: theirs.length, value: theirs.length * (service.amountMinor ?? 0), deposits: theirs.reduce((sum, booking) => sum + Number(booking.fields.depositMinor ?? 0), 0) };
    }).filter((row) => row.count > 0);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Booked value" value={context.money(byService.reduce((sum, row) => sum + row.value, 0))} prov="human" meta="List price of every live booking" />
          <Stat label="Deposits requested" value={context.money(byService.reduce((sum, row) => sum + row.deposits, 0))} prov="human" meta="Across all live bookings" />
          <Stat label="Deposits collected" value={context.money(live.filter((booking) => String(booking.fields.depositState) === "paid_local").reduce((sum, booking) => sum + Number(booking.fields.depositMinor ?? 0), 0))} prov="posted" meta="Recorded in the local ledger" />
          <Stat label="Invoiced" value="Unavailable" unavailable meta="Bookings are not invoiced from here" />
        </StatRow>
        <DataGrid rows={byService} rowId={(row) => row.service.id} label="Revenue by service" filterable={false}
          columns={[
            { key: "service", header: "Service", primary: true, cell: (row) => row.service.title },
            { key: "count", header: "Bookings", align: "end", cell: (row) => <span className="ds-num">{String(row.count)}</span>, sortValue: (row) => row.count },
            { key: "price", header: "List price", align: "end", cell: (row) => <span className="ds-num">{context.money(row.service.amountMinor)}</span> },
            { key: "value", header: "Booked value", align: "end", cell: (row) => <span className="ds-num">{context.money(row.value)}</span>, sortValue: (row) => row.value },
            { key: "deposit", header: "Deposits", align: "end", cell: (row) => <span className="ds-num">{context.money(row.deposits)}</span> },
          ]} />
      </Stack>
    );
  }

  if (lens === "No-shows") {
    const noShows = bookings.filter((booking) => booking.status === "no_show");
    const cancelled = bookings.filter((booking) => booking.status === "cancelled");
    return (
      <Stack gap={4}>
        <Grid>
          <Card span={6} eyebrow="OUTCOMES" prov="posted" title="Finished appointments by outcome">
            <DonutChart
              title="Outcomes"
              format={(value) => String(Math.round(value))}
              points={[
                { label: "Completed", value: bookings.filter((booking) => booking.status === "completed").length },
                { label: "No-show", value: noShows.length },
                { label: "Cancelled", value: cancelled.length },
              ]}
            />
          </Card>
          <Card span={6} eyebrow="CANCELLATIONS" prov="posted" title="Cancelled inside the notice period">
            <Stack gap={2}>
              {cancelled.map((booking) => {
                const service = serviceOf(data, booking);
                const notice = Number(service?.fields.cancellationNoticeHours ?? 24);
                return (
                  <Row key={booking.id} gap={2}>
                    <span className="ds-grow ds-truncate">{booking.title}</span>
                    <span className="ds-subtle">{notice}h notice</span>
                    <Pill tone="warning">{booking.summary.includes("inside") ? "Inside notice" : "Unknown"}</Pill>
                  </Row>
                );
              })}
              {cancelled.length === 0 && <span className="ds-subtle">Nothing cancelled.</span>}
            </Stack>
          </Card>
        </Grid>
        <Notice tone="warning" title="No fee has been charged for any of these">
          Cancellation fees are recorded on the service, but collecting one needs a payment processor. Every fee here is a figure, not money that moved.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Forecast") {
    const ahead = Array.from({ length: 4 }, (_, index) => {
      const start = addDays(week.start, index * 7);
      const end = addDays(start, 7);
      return {
        label: `Week of ${start.toLocaleDateString(org.locale, { day: "numeric", month: "short" })}`,
        value: bookings.filter((booking) => isLive(booking) && booking.startAt && new Date(booking.startAt) >= start && new Date(booking.startAt) < end).length,
      };
    });
    return (
      <Stack gap={4}>
        <Card eyebrow="ON THE BOOKS" prov="human" title="Appointments already booked" subtitle="Counted from booking records, four weeks ahead">
          <BarChart title="Bookings by week ahead" height={200} format={(value) => String(Math.round(value))} series={[{ name: "Booked", points: ahead }]} />
        </Card>
        <Notice tone="warning" title="This is what is booked, not a forecast">
          Nothing here predicts bookings that have not been made. A real forecast would need a history of how far ahead people book, which this workspace does not hold, so the count stops at what exists.
        </Notice>
      </Stack>
    );
  }

  const resources = data.resources.filter((resource) => isBookable(resource));
  return (
    <Stack gap={4}>
      <DataGrid rows={resources} rowId={(row) => row.id} label="Utilisation" filterable={false}
        columns={[
          { key: "title", header: "Resource", primary: true, cell: (row) => row.title },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "")}</Pill> },
          { key: "hours", header: "Available", align: "end", cell: (row) => {
            const window = workingHours(row);
            return <span className="ds-num">{Math.round(((window.endHour - window.startHour) * window.days.length))}h</span>;
          } },
          { key: "booked", header: "Booked", align: "end", cell: (row) => <span className="ds-num">{Math.round(bookedMinutes(bookings, row.id, week.start, week.end) / 60)}h</span> },
          { key: "util", header: "Utilisation", cell: (row) => {
            const window = workingHours(row);
            const capacity = (window.endHour - window.startHour) * 60 * window.days.length * resourceCapacity(row);
            const booked = bookedMinutes(bookings, row.id, week.start, week.end);
            return <Meter value={booked} max={capacity || 1} label={`${row.title} utilisation`} tone={booked / capacity > 0.8 ? "warning" : undefined} />;
          } },
        ]} />
      <Notice tone="info" title="Group bookings count seats, not slots">
        The trade sample morning seats six. It occupies one slot on the room but counts its seats separately, so utilisation is not inflated by counting each guest as an appointment.
      </Notice>
      <Card eyebrow="SEATS" prov="human" title="Group bookings" subtitle="Where seats and slots differ">
        <Stack gap={2}>
          {bookings.filter((booking) => Number(booking.fields.seats ?? 1) > 1).map((booking) => (
            <Row key={booking.id} gap={2}>
              <Link to={`/o/${org.slug}/book/bookings/${booking.id}`} className="ds-grow" style={{ color: "inherit" }}>{booking.title}</Link>
              <span className="ds-num">{String(booking.fields.seats)} of {String(serviceOf(data, booking)?.fields.seats ?? "?")} seats</span>
              <span className="ds-num">1 slot</span>
            </Row>
          ))}
          {bookings.filter((booking) => Number(booking.fields.seats ?? 1) > 1).length === 0 && <span className="ds-subtle">No group bookings.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}
