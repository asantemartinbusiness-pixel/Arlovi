import { BarChart3, CalendarClock, CalendarDays, Clock, Globe, Users } from "lucide-react";
import { Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { GrowthOverviewNav } from "@/app/GrowthOverviewNav";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { confirmOverlay, submitFooter } from "@/applications/market/kit";
import {
  archiveService, ArrangeFields, askReceptionist, AssignResource, cancelBooking, ComparePeriods, confirmBooking,
  exportBookings, PageTestResult, publishService, raiseBookingInvoice, ReportFilter, RescheduleNotice, scheduleReminders, ScheduleReport,
  sendReminder, testBookingPage,
} from "./actions";
import "@/applications/market/growth.css";
import { CancelBooking } from "./cancel";
import { conflictsWithLinks, DEPOSIT_LABEL, statusTone, useBookData } from "./data";
import {
  BookingCalendar, BookingDetail, BookingReports, BookingsOverview, PublicBookingPage,
  RemindersAndNoShows, ServicesAndPricing, StaffAndResources,
} from "./panels";
import {
  AvailabilityTest, BookingForm, BookingInspector, CapacityAlert, ConflictReview, CustomerMessage,
  FormFieldInspector, MetricCalculation, PricingReview, PrivacyPolicy, PublishBookingPage, Recurrence,
  RefundRule, ReminderSuppression, ReminderTemplateEditor, ReportDesign, RescheduleBooking,
  ResourceConflictDialog, ResourceEditor, SendPreview, ServiceEditor, SourceProof, TakeDeposit,
} from "./overlays";

/* ====================================================================== *
 * BOOK — Bookings & Capacity
 * A real availability calendar whose every write is checked against
 * findBookingConflict, and deposits that stop at the payment boundary.
 * ====================================================================== */

const needsSelection = (context: ScreenContext) => (context.selectedId ? undefined : "Select a row first");

export const bookApp = registerApp({
  code: "BOOK",
  short: "Bookings",
  name: "Bookings & Capacity",
  purpose: "Appointments, resources and the capacity behind them",
  icon: CalendarClock,
  nav: [
    { items: [
      { label: "Bookings Overview", screenId: "ARL-BOOK-001", icon: BarChart3 },
      { label: "Booking Calendar", screenId: "ARL-BOOK-002", icon: CalendarDays },
    ] },
    { label: "What is offered", items: [
      { label: "Services & Pricing", screenId: "ARL-BOOK-004", icon: CalendarClock },
      { label: "Staff & Resources", screenId: "ARL-BOOK-005", icon: Users },
      { label: "Public Booking Page", screenId: "ARL-BOOK-006", icon: Globe },
    ] },
    { label: "Follow-up", items: [
      { label: "Reminders & No-shows", screenId: "ARL-BOOK-007", icon: Clock },
      { label: "Booking Reports", screenId: "ARL-BOOK-008", icon: BarChart3 },
    ] },
  ],
  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-BOOK-001": {
      id: "ARL-BOOK-001",
      header: (context: ScreenContext) => <GrowthOverviewNav context={context} code="BOOK" />,
      subtitle: (context) => `Today's appointments and capacity for ${context.org.shortName}, from the booking records in this browser.`,
      tabs: ["Today", "Week", "Capacity", "Insights"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <BookingsOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create booking", label: "New booking", placement: "primary", run: (context) => context.openOverlay("Quick booking") },
        { id: "check in", label: "Check in", placement: "secondary", guard: needsSelection, run: async (context) => {
          const id = context.selectedId!;
          await context.mutate.patch(id, { fields: { checkedIn: true }, status: "completed" }, { event: "Guest checked in" });
          context.toast("Checked in", "The appointment is marked completed on its record.");
        } },
        { id: "reschedule", label: "Reschedule selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Reschedule", { id: context.selectedId }) },
        { id: "ask receptionist", label: "Ask the receptionist", placement: "overflow", run: () => askReceptionist() },
        { id: "capacity", label: "Capacity today", placement: "overflow", run: (context) => context.openOverlay("capacity alert") },
        { id: "calendar", label: "Open the calendar", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/book/calendar`) },
        { id: "inspect", label: "Inspect a booking", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("booking inspector", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Quick booking", kind: "drawer", title: "New booking", width: 620, render: ({ close, ...context }) => <BookingForm context={context} close={close} />, footer: submitFooter("booking-form", "Save booking") },
        { id: "booking inspector", kind: "drawer", title: "Booking", width: 540, render: ({ ...context }) => <BookingInspector context={context} /> },
        { id: "capacity alert", kind: "modal", title: "Capacity today", width: 620, render: () => <CapacityAlert /> },
        { id: "Reschedule", kind: "modal", title: "Reschedule", width: 620, render: ({ close, ...context }) => <RescheduleBooking context={context} close={close} />, footer: submitFooter("reschedule", "Move booking") },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-BOOK-002": {
      id: "ARL-BOOK-002",
      subtitle: () => "Drag an appointment to another slot, or focus one and press Enter to move it with the arrow keys. Every move is checked for a conflict first.",
      tabs: ["Day", "Week", "Month", "Resource", "Staff"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <BookingCalendar context={context} lens={lens} />,
      })),
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Slot reservation is local</Pill>
          <span className="ds-subtle">Two surfaces in this browser cannot double-book a resource: each write re-checks the slot and a clash is refused with the booking that holds it.</span>
        </Row>
      ),
      actions: [
        { id: "create", label: "New booking", placement: "primary", run: (context) => context.openOverlay("Booking form") },
        { id: "confirm", label: "Confirm held slot", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a held booking"), run: (context) => confirmBooking(context, context.selectedId) },
        { id: "move", label: "Move selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Reschedule", { id: context.selectedId }) },
        { id: "Drag booking", label: "Edit time and resource", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("Booking form", { id: context.selectedId }) },
        { id: "cancel", label: "Cancel selected", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => cancelBooking(context) },
        { id: "conflicts", label: "Review conflicts", placement: "overflow", run: (context) => context.openOverlay("conflict review") },
        { id: "notice", label: "Reschedule notice", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("reschedule notice", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Booking form", kind: "drawer", title: "Booking", width: 620, render: ({ close, ...context }) => <BookingForm context={context} close={close} />, footer: submitFooter("booking-form", "Save booking") },
        { id: "conflict review", kind: "drawer", title: "Conflicts", width: 640, render: ({ ...context }) => <ConflictReview context={context} /> },
        { id: "reschedule notice", kind: "modal", title: "Reschedule notice", width: 580, render: ({ close, ...context }) => <RescheduleNotice context={context} close={close} />, footer: submitFooter("reschedule-notice", "Keep as a draft") },
        { id: "Reschedule", kind: "modal", title: "Move booking", width: 620, render: ({ close, ...context }) => <RescheduleBooking context={context} close={close} />, footer: submitFooter("reschedule", "Move booking") },
        { id: "cancel booking", kind: "modal", title: "Cancel booking", tone: "danger", width: 600, render: ({ close, ...context }) => <CancelBooking context={context} close={close} />, footer: submitFooter("cancel-booking", "Cancel booking") },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-BOOK-003": {
      id: "ARL-BOOK-003",
      title: () => "Booking",
      subtitle: () => "Guest, service, resource, deposit and every message kept against the appointment.",
      tabs: ["Overview", "Payments", "Messages", "History"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <BookingDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Confirm", label: "Confirm", placement: "primary", run: (context) => confirmBooking(context, context.params.id) },
        { id: "take payment", label: "Take payment (deposit)", placement: "primary", run: (context) => context.openOverlay("take deposit") },
        { id: "reschedule", label: "Reschedule", placement: "secondary", run: (context) => context.openOverlay("Reschedule") },
        { id: "send reminder", label: "Send a reminder", placement: "secondary", run: (context) => sendReminder(context) },
        { id: "raise invoice", label: "Raise an invoice", placement: "secondary", run: (context) => raiseBookingInvoice(context, context.params.id) },
        { id: "message", label: "Message the customer", placement: "overflow", run: (context) => context.openOverlay("customer message") },
        { id: "cancellation", label: "Cancellation policy", placement: "overflow", run: (context) => context.openOverlay("refund rule") },
        { id: "cancel booking", label: "Cancel booking", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("cancel booking", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Reschedule", kind: "modal", title: "Reschedule", width: 620, render: ({ close, ...context }) => <RescheduleBooking context={context} close={close} />, footer: submitFooter("reschedule", "Move booking") },
        { id: "cancel booking", kind: "modal", title: "Cancel booking", tone: "danger", width: 600, render: ({ close, ...context }) => <CancelBooking context={context} close={close} />, footer: submitFooter("cancel-booking", "Cancel booking") },
        { id: "refund rule", kind: "drawer", title: "Cancellation and fees", width: 560, render: ({ ...context }) => <RefundRule context={context} /> },
        { id: "customer message", kind: "modal", title: "Message the customer", width: 600, render: ({ close, ...context }) => <CustomerMessage context={context} close={close} />, footer: submitFooter("customer-message", "Record message") },
        { id: "take deposit", kind: "modal", title: "Deposit", description: "Review the deposit and record its status without charging a card.", width: 600, render: ({ close, ...context }) => <TakeDeposit context={context} close={close} /> },
        confirmOverlay,
      ],
      inspector: (context) => <BookingFacts context={context} />,
      inspectorTitle: "Booking facts",
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-BOOK-004": {
      id: "ARL-BOOK-004",
      subtitle: () => "What is offered, how long it takes, what it costs and what it occupies.",
      tabs: ["Services", "Categories", "Packages", "Rules"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ServicesAndPricing context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create service", label: "New service", placement: "primary", run: (context) => context.openOverlay("Service editor") },
        { id: "edit buffers", label: "Edit buffers", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Service editor", { id: context.selectedId }) },
        { id: "publish", label: "Publish selected", placement: "secondary", guard: needsSelection, run: (context) => publishService(context) },
        { id: "archive", label: "Archive selected", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => archiveService(context) },
        { id: "pricing", label: "Pricing review", placement: "overflow", run: (context) => context.openOverlay("pricing review") },
        { id: "availability", label: "Availability test", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("availability test", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Service editor", kind: "drawer", title: "Service", width: 640, render: ({ close, ...context }) => <ServiceEditor context={context} close={close} />, footer: submitFooter("service-editor", "Save service") },
        { id: "pricing review", kind: "drawer", title: "Pricing and tax", width: 680, render: ({ ...context }) => <PricingReview context={context} /> },
        { id: "availability test", kind: "modal", title: "Availability test", width: 620, render: ({ ...context }) => <AvailabilityTest context={context} /> },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-BOOK-005": {
      id: "ARL-BOOK-005",
      subtitle: () => "People, rooms and equipment, with the hours they work and the periods they are unavailable.",
      tabs: ["People", "Rooms", "Equipment", "Availability"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <StaffAndResources context={context} lens={lens} />,
      })),
      actions: [
        { id: "Set availability", label: "Set availability", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("Resource editor", { id: context.selectedId }) },
        { id: "assign resource", label: "Assign to a service", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("assign resource") },
        { id: "new resource", label: "New resource", placement: "overflow", run: (context) => context.openOverlay("Resource editor") },
        { id: "block period", label: "Block a period", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("recurrence", { id: context.selectedId }) },
        { id: "conflicts", label: "Conflicts", placement: "overflow", run: (context) => context.openOverlay("conflict dialog") },
      ],
      overlays: [
        { id: "Resource editor", kind: "drawer", title: "Resource", width: 600, render: ({ close, ...context }) => <ResourceEditor context={context} close={close} />, footer: submitFooter("resource-editor", "Save resource") },
        { id: "conflict dialog", kind: "drawer", title: "Conflicts", width: 640, render: ({ ...context }) => <ResourceConflictDialog context={context} /> },
        { id: "recurrence", kind: "modal", title: "Block a period", width: 600, render: ({ close, ...context }) => <Recurrence context={context} close={close} />, footer: submitFooter("recurrence", "Block period") },
        { id: "assign resource", kind: "modal", title: "Assign to a service", width: 560, render: ({ close, ...context }) => <AssignResource context={context} close={close} />, footer: submitFooter("assign-resource", "Assign") },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-BOOK-006": {
      id: "ARL-BOOK-006",
      title: () => "Public booking page",
      subtitle: (context) => `Slots are offered in ${context.org.timezone} and a slot that is already held is never offered.`,
      tabs: ["Design", "Availability", "Fields", "Preview"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PublicBookingPage context={context} lens={lens} />,
      })),
      actions: [
        { id: "publish", label: "Publish (export)", placement: "primary", run: (context) => context.openOverlay("publish") },
        { id: "preview", label: "Preview", placement: "secondary", run: (context) => context.setTab("Preview") },
        { id: "Arrange fields", label: "Arrange fields", placement: "secondary", run: (context) => context.openOverlay("arrange fields") },
        { id: "test", label: "Test the page", placement: "secondary", run: (context) => testBookingPage(context) },
        { id: "edit field", label: "Edit a field", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("Form field inspector", { fieldId: context.selectedId }) },
        { id: "privacy", label: "Privacy notice", placement: "overflow", run: (context) => context.openOverlay("privacy policy") },
      ],
      overlays: [
        { id: "Form field inspector", kind: "modal", title: "Form field", width: 560, render: ({ close, ...context }) => <FormFieldInspector context={context} close={close} />, footer: submitFooter("form-field", "Save field") },
        { id: "publish", kind: "modal", title: "Export the booking page", width: 580, render: ({ close, ...context }) => <PublishBookingPage context={context} close={close} /> },
        { id: "privacy policy", kind: "drawer", title: "Privacy notice", width: 560, render: () => <PrivacyPolicy /> },
        { id: "arrange fields", kind: "modal", title: "Arrange the form", width: 620, render: ({ close, ...context }) => <ArrangeFields context={context} close={close} />, footer: submitFooter("arrange-fields", "Save order") },
        { id: "page test", kind: "drawer", title: "Booking page test", width: 560, render: ({ ...context }) => <PageTestResult context={context} /> },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-BOOK-007": {
      id: "ARL-BOOK-007",
      subtitle: () => "Rules, templates and the honest state of every reminder that would have gone out.",
      tabs: ["Rules", "Templates", "History", "Metrics"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <RemindersAndNoShows context={context} lens={lens} />,
      })),
      actions: [
        { id: "Schedule reminders", label: "Schedule reminders", placement: "primary", run: (context) => scheduleReminders(context) },
        { id: "new rule", label: "New rule", placement: "overflow", run: (context) => context.openOverlay("Template editor") },
        { id: "edit template", label: "Edit selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Template editor", { id: context.selectedId }) },
        { id: "test send", label: "Test send", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("send preview", { id: context.selectedId }) },
        { id: "suppression", label: "Who is left out", placement: "overflow", run: (context) => context.openOverlay("suppression") },
      ],
      overlays: [
        { id: "Template editor", kind: "drawer", title: "Reminder", width: 620, render: ({ close, ...context }) => <ReminderTemplateEditor context={context} close={close} />, footer: submitFooter("reminder-template", "Save reminder") },
        { id: "send preview", kind: "drawer", title: "Send preview", width: 560, render: ({ ...context }) => <SendPreview context={context} /> },
        { id: "suppression", kind: "drawer", title: "Left out of the queue", width: 640, render: ({ ...context }) => <ReminderSuppression context={context} /> },
        confirmOverlay,
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-BOOK-008": {
      id: "ARL-BOOK-008",
      subtitle: () => "Utilisation, revenue and no-shows, each saying what it counts and what it cannot.",
      tabs: ["Utilization", "Revenue", "No-shows", "Forecast"].map((lens) => ({
        id: lens,
        label: lens === "Utilization" ? "Utilisation" : lens,
        render: (context: ScreenContext) => <BookingReports context={context} lens={lens === "Utilization" ? "Utilisation" : lens} />,
      })),
      actions: [
        { id: "Filter", label: "Filter", placement: "primary", run: (context) => context.openOverlay("report filter") },
        { id: "compare", label: "Compare periods", placement: "secondary", run: (context) => context.openOverlay("compare periods") },
        { id: "export", label: "Export CSV", placement: "secondary", capability: "export_data", run: (context) => exportBookings(context) },
        { id: "schedule", label: "Schedule a report", placement: "overflow", run: (context) => context.openOverlay("schedule report") },
        { id: "counted", label: "How this is counted", placement: "overflow", run: (context) => context.openOverlay("Metric calculation") },
        { id: "seats", label: "Seats and slots", placement: "overflow", run: (context) => context.openOverlay("Metric calculation", { metric: "seats" }) },
        { id: "sources", label: "Every source record", placement: "overflow", run: (context) => context.openOverlay("source proof") },
        { id: "save report", label: "Save a report", placement: "overflow", run: (context) => context.openOverlay("report design") },
      ],
      overlays: [
        { id: "Metric calculation", kind: "drawer", title: "How this is counted", width: 620, render: ({ ...context }) => <MetricCalculation context={context} /> },
        { id: "report design", kind: "modal", title: "Save a report", width: 560, render: ({ close, ...context }) => <ReportDesign context={context} close={close} />, footer: submitFooter("report-design", "Save report") },
        { id: "source proof", kind: "drawer", title: "Source records", width: 700, render: ({ ...context }) => <SourceProof context={context} /> },
        { id: "report filter", kind: "modal", title: "Filter reports", width: 520, render: ({ close }) => <ReportFilter close={close} />, footer: submitFooter("report-filter", "Apply filter") },
        { id: "compare periods", kind: "drawer", title: "Compare periods", width: 620, render: ({ ...context }) => <ComparePeriods context={context} /> },
        { id: "schedule report", kind: "modal", title: "Schedule a report", width: 540, render: ({ close, ...context }) => <ScheduleReport context={context} close={close} />, footer: submitFooter("schedule-report", "Save schedule") },
      ],
    },
  },
});

function BookingFacts({ context }: { context: ScreenContext }) {
  const booking = useRecord(context.params.id);
  const { org } = useWorkspace();
  if (!booking) return <Empty title="No booking" >Open an appointment to see its facts here.</Empty>;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Record", value: <code>{booking.id}</code> },
        { label: "State", value: <Pill tone={statusTone(booking.status)} dot>{booking.status.replace("_", " ")}</Pill> },
        { label: "Starts", value: <span className="ds-num">{context.dateTime(booking.startAt)}</span> },
        { label: "Ends", value: <span className="ds-num">{context.dateTime(booking.endAt)}</span> },
        { label: "Deposit", value: DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? "—" },
        { label: "Source", value: String(booking.fields.source ?? "internal").replace("_", " ") },
        { label: "Revision", value: <span className="ds-num">{String(booking.revision)}</span> },
      ]} />
      <ConflictSummary bookingId={booking.id} orgId={org.id} />
    </Stack>
  );
}

function ConflictSummary({ bookingId, orgId }: { bookingId: string; orgId: string }) {
  const data = useBookData();
  const booking = data.bookings.find((item) => item.id === bookingId);
  if (!booking?.startAt || !booking.endAt) return null;
  const clashes = conflictsWithLinks(data.bookings, data.resources, orgId, String(booking.fields.resourceId), booking.startAt, booking.endAt, booking.id);
  return clashes.length > 0 ? (
    <Notice tone="danger" title="This appointment overlaps another">
      {clashes.map((clash) => clash.booking.title).join(", ")} already hold this resource. One of them has to move before either can be treated as confirmed.
    </Notice>
  ) : (
    <Notice tone="info" title="How this slot is protected">
      Every write re-checks this resource, and anything linked to it, with the shared conflict rule before it is saved. A clash is refused and names the booking that already holds the window.
    </Notice>
  );
}
