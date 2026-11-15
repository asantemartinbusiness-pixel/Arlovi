import { registerSeed } from "@/domain/seedRegistry";

/** A fuller app project than the single-table sketch in the base seed. */
registerSeed("build", (context) => {
  const now = new Date(context.now);
  const day = 86_400_000;
  const iso = (offsetDays: number, hour = 11) => {
    const date = new Date(now.getTime() - offsetDays * day);
    date.setUTCHours(hour, 5, 0, 0);
    return date.toISOString();
  };

  const consultationBody = {
    settings: { name: "Consultation desk", description: "Books showroom consultations against a company and a quote.", environment: "preview", locale: "en-GB" },
    entities: [
      {
        id: "e-company", name: "Company", collection: "companies",
        fields: [
          { id: "c-name", name: "Name", kind: "text", required: true, unique: true, options: [], references: "" },
          { id: "c-owner", name: "Owner", kind: "text", required: false, unique: false, options: [], references: "" },
          { id: "c-status", name: "Status", kind: "choice", required: true, unique: false, options: ["prospect", "trade", "dormant"], references: "" },
        ],
      },
      {
        id: "e-consult", name: "Consultation", collection: "bookings",
        fields: [
          { id: "k-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
          { id: "k-when", name: "Date", kind: "date", required: true, unique: false, options: [], references: "" },
          { id: "k-stage", name: "Status", kind: "choice", required: true, unique: false, options: ["requested", "confirmed", "held", "cancelled"], references: "" },
          { id: "k-company", name: "Company", kind: "reference", required: false, unique: false, options: [], references: "Company" },
        ],
      },
      {
        id: "e-quote", name: "Quote", collection: "quotes",
        fields: [
          { id: "q-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
          { id: "q-amount", name: "Amount", kind: "money", required: true, unique: false, options: [], references: "" },
          { id: "q-status", name: "Status", kind: "choice", required: true, unique: false, options: ["draft", "sent", "accepted", "declined"], references: "" },
          { id: "q-company", name: "Company", kind: "reference", required: false, unique: false, options: [], references: "Company" },
        ],
      },
    ],
    screens: [
      {
        id: "s-desk", name: "Desk", route: "/desk",
        components: [
          { id: "d-stat", kind: "stat", title: "Consultations", entityId: "e-consult", fieldIds: [], aggregate: "count", text: "", span: 4 },
          { id: "d-value", kind: "stat", title: "Quoted value", entityId: "e-quote", fieldIds: ["q-amount"], aggregate: "sum", text: "", span: 4 },
          { id: "d-chart", kind: "chart", title: "Quotes by status", entityId: "e-quote", fieldIds: ["q-status"], aggregate: "count", text: "", span: 4 },
          { id: "d-table", kind: "table", title: "Open quotes", entityId: "e-quote", fieldIds: ["q-title", "q-amount", "q-status"], aggregate: "count", text: "", span: 8 },
          { id: "d-list", kind: "list", title: "Companies", entityId: "e-company", fieldIds: ["c-name"], aggregate: "count", text: "", span: 4 },
        ],
      },
      {
        id: "s-book", name: "Booking", route: "/book",
        components: [
          { id: "b-text", kind: "text", title: "How this works", entityId: "", fieldIds: [], aggregate: "count", text: "A consultation is held in the Clerkenwell showroom and lasts about an hour. The form writes against the booking record.", span: 12 },
          { id: "b-form", kind: "form", title: "Request a consultation", entityId: "e-consult", fieldIds: ["k-title", "k-when", "k-stage"], aggregate: "count", text: "", span: 6 },
          { id: "b-detail", kind: "detail", title: "Most recent booking", entityId: "e-consult", fieldIds: ["k-title", "k-when", "k-stage"], aggregate: "count", text: "", span: 6 },
        ],
      },
    ],
    automations: [
      {
        id: "a-confirm", name: "Confirm a requested consultation", trigger: "record_updated", entityId: "e-consult",
        condition: { fieldId: "k-stage", operator: "equals", value: "confirmed" },
        steps: [
          { id: "s1", kind: "update_field", detail: "Set the company status to trade" },
          { id: "s2", kind: "notify", detail: "Tell the showroom the booking is confirmed" },
        ],
        enabled: true,
      },
      {
        id: "a-chase", name: "Chase an unanswered quote", trigger: "schedule", entityId: "e-quote",
        condition: { fieldId: "q-status", operator: "equals", value: "sent" },
        steps: [{ id: "s3", kind: "approve", detail: "Ask finance before a reminder goes out" }],
        enabled: false,
      },
    ],
    roles: [
      { id: "r-owner", name: "Owner", grants: { "e-company": "write", "e-consult": "write", "e-quote": "write" }, canApprove: true },
      { id: "r-desk", name: "Desk", grants: { "e-company": "read", "e-consult": "write", "e-quote": "read" }, canApprove: false },
      { id: "r-new", name: "New member", grants: { "e-company": "read", "e-consult": "read", "e-quote": "none" }, canApprove: false },
    ],
    versions: [
      { id: "v1", label: "v1", at: iso(40), note: "Company and quote only.", actor: "Maya Chen", entities: 2, screens: 1 },
      { id: "v2", label: "v2", at: iso(12), note: "Added consultations and the booking screen.", actor: "Maya Chen", entities: 3, screens: 2 },
    ],
    endpoints: [
      { id: "ep-list", method: "GET", path: "/api/quotes", entityId: "e-quote", auth: "role", note: "Used by the desk screen." },
      { id: "ep-create", method: "POST", path: "/api/consultations", entityId: "e-consult", auth: "role", note: "Used by the booking form." },
      { id: "ep-public", method: "GET", path: "/api/availability", entityId: "e-consult", auth: "none", note: "Deliberately open so the website can read free slots." },
    ],
    releases: [
      { id: "rel-1", environment: "staging", at: iso(11), state: "built", note: "Model snapshot taken for review.", actor: "Maya Chen" },
      { id: "rel-2", environment: "production", at: iso(5), state: "blocked", note: "Checks passed. Stopped at the runtime boundary: nothing hosts this app.", actor: "Maya Chen" },
    ],
    files: [
      { path: "README.md", content: "# Consultation desk\n\nThe model is the source of truth. Everything under src/ is generated from it.\n" },
    ],
  };

  const harborBody = {
    settings: { name: "Counter orders", description: "Walk-in orders against a part and a customer.", environment: "preview", locale: "en-US" },
    entities: [
      {
        id: "h-part", name: "Part", collection: "products",
        fields: [
          { id: "p-name", name: "Name", kind: "text", required: true, unique: true, options: [], references: "" },
          { id: "p-price", name: "Price", kind: "money", required: true, unique: false, options: [], references: "" },
          { id: "p-cat", name: "Category", kind: "choice", required: false, unique: false, options: ["deck", "rigging", "fastener"], references: "" },
        ],
      },
      {
        id: "h-order", name: "Counter order", collection: "orders",
        fields: [
          { id: "o-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
          { id: "o-total", name: "Total", kind: "money", required: true, unique: false, options: [], references: "" },
          { id: "o-state", name: "Status", kind: "choice", required: true, unique: false, options: ["held", "paid", "collected"], references: "" },
          { id: "o-part", name: "Part", kind: "reference", required: false, unique: false, options: [], references: "Widget" },
        ],
      },
    ],
    screens: [
      {
        id: "h-screen", name: "Counter", route: "/counter",
        components: [
          { id: "h-c1", kind: "stat", title: "Orders", entityId: "h-order", fieldIds: [], aggregate: "count", text: "", span: 6 },
          { id: "h-c2", kind: "table", title: "Today", entityId: "h-order", fieldIds: ["o-title", "o-total", "o-state"], aggregate: "count", text: "", span: 12 },
          { id: "h-c3", kind: "table", title: "Unbound panel", entityId: "", fieldIds: [], aggregate: "count", text: "", span: 6 },
        ],
      },
    ],
    automations: [],
    roles: [{ id: "h-r1", name: "Counter staff", grants: { "h-part": "read", "h-order": "write" }, canApprove: false }],
    versions: [],
    endpoints: [],
    releases: [],
    files: [],
  };

  return {
    records: [
      context.rec({
        org: "nl", collection: "appProjects", n: 20, title: "Consultation desk",
        status: "active",
        summary: "Three entities bound to workspace collections, two screens and two automations.",
        fields: { delivery: "not_connected", lastCheckAt: iso(6) },
        createdAt: iso(90),
        body: consultationBody,
      }),
      context.rec({
        org: "hb", collection: "appProjects", n: 20, title: "Counter orders", owner: "Elena Ward",
        status: "draft",
        summary: "Two entities, one screen, and one deliberately broken reference so the checks have something to find.",
        fields: { delivery: "not_connected" },
        createdAt: iso(30),
        body: harborBody,
      }),
    ],
  };
});
