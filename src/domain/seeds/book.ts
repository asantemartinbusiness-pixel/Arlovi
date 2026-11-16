import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/** Team 4 id block: every fixture id sits at nl-<collection>-6NN so it cannot
 *  collide with another workstream's contributor. */
const B = 600;

/* ====================================================================== *
 * BOOK fixtures — the Clerkenwell showroom takes consultations, paid
 * specification visits and installation surveys. Bookings are placed
 * relative to the seeded clock so the calendar always has something in it.
 * ====================================================================== */

const at = (now: string, days: number, hour: number, minute = 0) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const plus = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

registerSeed("book", (ctx) => {
  const records: Rec[] = [];
  const rec = (input: Parameters<typeof ctx.rec>[0]) => ctx.rec({ ...input, n: input.n + B });
  const id = (org: "nl" | "hb", collection: string, n: number) => ctx.id(org, collection, n + B);
  const now = ctx.now;
  const S = (n: number) => id("nl", "services", n);
  const R = (n: number) => id("nl", "resources", n);
  const C = (n: number) => id("nl", "contacts", n);

  /* ---------------- Services ---------------- */
  const services: { n: number; title: string; minutes: number; price: number; deposit: number; status: string; category: string; buffer: number; summary: string; resources: string[]; slug: string }[] = [
    { n: 20, title: "Showroom consultation", minutes: 45, price: 0, deposit: 0, status: "active", category: "Showroom", buffer: 15, slug: "showroom-consult",
      summary: "Forty-five minutes at the consultation table with samples.", resources: ["nl-resources-001", "nl-resources-002"] },
    { n: 21, title: "Paid specification visit", minutes: 90, price: 180_00, deposit: 60_00, status: "active", category: "On site", buffer: 30, slug: "specification",
      summary: "On-site survey with a written specification afterwards.", resources: ["nl-resources-002"] },
    { n: 22, title: "Installation survey", minutes: 60, price: 90_00, deposit: 30_00, status: "active", category: "On site", buffer: 30, slug: "install-survey",
      summary: "Measure, check fixings and confirm the method.", resources: ["nl-resources-002"] },
    { n: 23, title: "Trade sample morning", minutes: 120, price: 0, deposit: 0, status: "active", category: "Showroom", buffer: 0, slug: "trade-morning",
      summary: "Group session for up to six practices. Seats, not slots.", resources: ["nl-resources-001"] },
    { n: 24, title: "Restoration clinic", minutes: 30, price: 45_00, deposit: 0, status: "draft", category: "Workshop", buffer: 15, slug: "restoration-clinic",
      summary: "Bench time for a single fitting. Pricing not settled.", resources: [] },
    { n: 25, title: "Evening design hour", minutes: 60, price: 60_00, deposit: 20_00, status: "archived", category: "Showroom", buffer: 15, slug: "design-hour",
      summary: "Withdrawn in October. One booking is still open against it.", resources: ["nl-resources-001"] },
  ];
  for (const service of services) {
    records.push(rec({
      org: "nl", collection: "services", n: service.n, title: service.title, status: service.status,
      amountMinor: service.price, summary: service.summary,
      tags: [service.category.toLowerCase().replace(/\s+/g, "-")],
      fields: {
        minutes: service.minutes,
        bufferMinutes: service.buffer,
        depositMinor: service.deposit,
        category: service.category,
        slug: service.slug,
        taxCategory: "standard",
        seats: service.n === 23 ? 6 : 1,
        published: service.status === "active",
        cancellationNoticeHours: service.n === 21 ? 48 : 24,
        cancellationFeeBp: service.n === 21 ? 5_000 : 0,
      },
      body: { resources: service.resources, description: service.summary },
    }));
  }

  /* ---------------- Packages ---------------- */
  records.push(
    rec({ org: "nl", collection: "services", n: 30, title: "Specification package — three visits", status: "active",
      amountMinor: 480_00, summary: "Three specification visits bought together, valid twelve months.",
      tags: ["package"],
      fields: { minutes: 270, bufferMinutes: 30, depositMinor: 160_00, category: "Package", slug: "spec-package", taxCategory: "standard", seats: 1, published: true, kind: "package", sessions: 3, cancellationNoticeHours: 48, cancellationFeeBp: 5_000 },
      body: { resources: ["nl-resources-002"], includes: ["nl-services-621", "nl-services-621", "nl-services-621"] } }),
  );

  /* ---------------- Resources (rooms, people, equipment) ---------------- */
  const resources: { n: number; title: string; kind: string; summary: string; capacity: number; hours: string; linked?: string }[] = [
    { n: 20, title: "Sample room", kind: "room", summary: "Second consultation space on the mezzanine.", capacity: 1, hours: "Tue–Sat 10:00–18:00" },
    { n: 21, title: "Theo Marsh", kind: "person", summary: "Workshop lead. Takes installation surveys.", capacity: 1, hours: "Mon–Fri 08:00–16:00" },
    { n: 22, title: "Maya Chen", kind: "person", summary: "Owner. Takes specification visits for hotel work.", capacity: 1, hours: "Mon–Thu 09:00–17:00" },
    { n: 23, title: "Survey kit", kind: "equipment", summary: "Laser measure, sample case and ladder. One kit only.", capacity: 1, hours: "Mon–Sat 08:00–19:00", linked: "nl-resources-621" },
    { n: 24, title: "Van", kind: "equipment", summary: "Shared with deliveries, so on-site visits compete with dispatch.", capacity: 1, hours: "Mon–Sat 07:00–19:00" },
  ];
  for (const resource of resources) {
    records.push(rec({
      org: "nl", collection: "resources", n: resource.n, title: resource.title, summary: resource.summary,
      status: "active",
      tags: [resource.kind],
      fields: {
        kind: resource.kind,
        capacity: resource.capacity,
        workingHours: resource.hours,
        timezone: "Europe/London",
        linkedResourceId: resource.linked ?? "",
        bookable: true,
      },
      body: { blackouts: resource.n === 22 ? [{ from: at(now, 9, 0), to: at(now, 12, 23), reason: "Milan fair" }] : [] },
    }));
  }

  /* ---------------- Bookings ---------------- */
  const bookings: { n: number; title: string; service: number; resource: string; days: number; hour: number; minute?: number; status: string; contact?: number; deposit?: number; depositState?: string; notes?: string; seats?: number }[] = [
    { n: 20, title: "Harrow House · specification", service: 21, resource: "nl-resources-002", days: 0, hour: 11, status: "confirmed", contact: 20, deposit: 60_00, depositState: "awaiting_payment" },
    { n: 21, title: "Mireille Okafor · consultation", service: 20, resource: "nl-resources-001", days: 0, hour: 14, status: "confirmed", contact: 21 },
    { n: 22, title: "Walk-in hold", service: 20, resource: R(20), days: 0, hour: 16, status: "hold", notes: "Held at the desk, not confirmed with the customer." },
    { n: 23, title: "Studio Vellum · install survey", service: 22, resource: R(21), days: 1, hour: 9, status: "confirmed", contact: 22, deposit: 30_00, depositState: "paid_local" },
    { n: 24, title: "Fenwick & Gray · specification", service: 21, resource: R(22), days: 1, hour: 13, status: "confirmed", contact: 24, deposit: 60_00, depositState: "awaiting_payment" },
    { n: 25, title: "Trade sample morning", service: 23, resource: "nl-resources-001", days: 2, hour: 10, status: "confirmed", seats: 4, notes: "Four of six seats taken." },
    { n: 26, title: "Nadia Brandt · consultation", service: 20, resource: R(20), days: 2, hour: 15, status: "confirmed", contact: 25 },
    { n: 27, title: "Yusuf Demir · consultation", service: 20, resource: "nl-resources-001", days: 3, hour: 11, status: "confirmed", contact: 29 },
    { n: 28, title: "Ledbury Hotel Group · specification", service: 21, resource: R(22), days: 4, hour: 10, status: "confirmed", contact: 30, deposit: 60_00, depositState: "awaiting_payment" },
    { n: 29, title: "Calder Joinery · install survey", service: 22, resource: R(21), days: 5, hour: 14, status: "confirmed", contact: 28, deposit: 30_00, depositState: "awaiting_payment" },
    { n: 30, title: "Tobias Lund · consultation", service: 20, resource: R(20), days: -2, hour: 11, status: "completed", contact: 23 },
    { n: 31, title: "Priyanka Rao · consultation", service: 20, resource: "nl-resources-001", days: -3, hour: 15, status: "no_show", contact: 27, notes: "Did not arrive. No reminder could be sent." },
    { n: 32, title: "Esme Whitlock · design hour", service: 25, resource: "nl-resources-001", days: 6, hour: 18, status: "confirmed", contact: 31, deposit: 20_00, depositState: "awaiting_payment", notes: "Still open against the archived evening service." },
    { n: 33, title: "Hoxton Rooms · specification", service: 21, resource: R(22), days: -8, hour: 10, status: "cancelled", contact: 26, notes: "Cancelled nineteen hours ahead, inside the forty-eight hour notice." },
    { n: 34, title: "Studio Vellum · consultation", service: 20, resource: "nl-resources-001", days: -6, hour: 12, status: "completed", contact: 22 },
    { n: 35, title: "Van run · dispatch", service: 22, resource: R(24), days: 1, hour: 11, status: "confirmed", notes: "Delivery run. Blocks the van for on-site visits." },
  ];
  for (const booking of bookings) {
    const service = services.find((item) => item.n === booking.service);
    const start = at(now, booking.days, booking.hour, booking.minute ?? 0);
    records.push(rec({
      org: "nl", collection: "bookings", n: booking.n, title: booking.title,
      status: booking.status,
      amountMinor: service?.price ?? 0,
      startAt: start,
      endAt: plus(start, service?.minutes ?? 45),
      at: start,
      summary: booking.notes ?? `${service?.title ?? "Appointment"} · ${service?.minutes ?? 45} minutes`,
      parentId: booking.contact ? C(booking.contact) : undefined,
      fields: {
        serviceId: S(booking.service),
        resourceId: booking.resource,
        contactId: booking.contact ? C(booking.contact) : "",
        depositMinor: booking.deposit ?? 0,
        depositState: booking.depositState ?? (service?.deposit ? "not_requested" : "none"),
        payment: booking.depositState === "paid_local" ? "paid_local" : "not_connected",
        seats: booking.seats ?? 1,
        reminderState: booking.days >= 0 ? "queued_local" : "not_sent",
        source: booking.n === 22 ? "desk" : booking.contact ? "public_page" : "internal",
        checkedIn: booking.status === "completed",
      },
      body: {
        messages: booking.contact
          ? [{ at: at(now, booking.days - 3, 10), direction: "out", body: `Your ${service?.title.toLowerCase()} is booked. We keep a local record; no email has left this browser.` }]
          : [],
      },
    }));
  }

  /* ---------------- Reminder rules and templates ---------------- */
  records.push(
    rec({ org: "nl", collection: "templates", n: 40, title: "Booking reminder — 24 hours", status: "approved",
      summary: "Sent a day ahead with the address and the cancellation notice.",
      tags: ["reminder"],
      fields: { kind: "reminder", channel: "email", offsetHours: 24, approval: "approved", delivery: "not_connected", enabled: true },
      body: { subject: "Tomorrow: {{service}} at {{time}}", body: "Hello {{first_name}}, this is a reminder of your {{service}} tomorrow at {{time}}. We hold the slot for fifteen minutes. Cancelling within {{notice_hours}} hours may incur a fee." } }),
    rec({ org: "nl", collection: "templates", n: 41, title: "Booking reminder — 2 hours", status: "approved",
      summary: "Short nudge with the door code.",
      tags: ["reminder"],
      fields: { kind: "reminder", channel: "sms", offsetHours: 2, approval: "approved", delivery: "not_connected", enabled: true },
      body: { subject: "", body: "{{first_name}}, see you at {{time}} today. Door code 2241. Reply STOP to opt out." } }),
    rec({ org: "nl", collection: "templates", n: 42, title: "No-show follow up", status: "review",
      summary: "Offers a new slot after a missed appointment.",
      tags: ["reminder"],
      fields: { kind: "reminder", channel: "email", offsetHours: -2, approval: "awaiting_approval", delivery: "not_connected", enabled: false },
      body: { subject: "Sorry we missed you", body: "We held {{service}} at {{time}} and did not see you. Here is a link to rebook." } }),
  );

  /* ---------------- Public booking page model ---------------- */
  records.push(
    rec({ org: "nl", collection: "sites", n: 30, title: "Book a consultation", status: "published",
      summary: "Public booking page model. Published locally; no host is connected.",
      fields: { kind: "bookingPage", slug: "showroom-consult", published: true, views: 612, bookings: 23, theme: "studio", timezone: "Europe/London", showPrices: true },
      body: {
        intro: "Choose a time at the Clerkenwell showroom. We confirm by email the same day.",
        services: ["nl-services-620", "nl-services-621", "nl-services-622"],
        fields: [
          { id: "f1", label: "Full name", type: "text", required: true },
          { id: "f2", label: "Email", type: "email", required: true },
          { id: "f3", label: "Practice or company", type: "text", required: false },
          { id: "f4", label: "What are you working on?", type: "textarea", required: false },
          { id: "f5", label: "I agree to the privacy notice", type: "consent", required: true },
        ],
      } }),
  );

  /* ---------------- Harbor ---------------- */
  records.push(
    rec({ org: "hb", collection: "services", n: 20, title: "Dock survey", status: "active", amountMinor: 150_00,
      summary: "Harbor Supply site survey. New York sales tax applies, not VAT.",
      fields: { minutes: 60, bufferMinutes: 30, depositMinor: 50_00, category: "On site", slug: "dock-survey", taxCategory: "standard", seats: 1, published: true, cancellationNoticeHours: 24, cancellationFeeBp: 0 },
      body: { resources: [id("hb", "resources", 20)], description: "One hour at the slip." } }),
    rec({ org: "hb", collection: "resources", n: 20, title: "Elena Ward", summary: "Harbor owner, takes surveys.",
      fields: { kind: "person", capacity: 1, workingHours: "Mon–Fri 08:00–16:00", timezone: "America/New_York", linkedResourceId: "", bookable: true },
      body: { blackouts: [] } }),
    rec({ org: "hb", collection: "bookings", n: 20, title: "Chris Hale · dock survey", status: "confirmed",
      amountMinor: 150_00, startAt: at(now, 1, 10), endAt: at(now, 1, 11), summary: "Harbor booking. Must not appear in Northline.",
      fields: { serviceId: id("hb", "services", 20), resourceId: id("hb", "resources", 20), contactId: "hb-contacts-001", depositMinor: 50_00, depositState: "awaiting_payment", payment: "not_connected", seats: 1, reminderState: "queued_local", source: "internal", checkedIn: false },
      body: { messages: [] } }),
  );

  return { records };
});
