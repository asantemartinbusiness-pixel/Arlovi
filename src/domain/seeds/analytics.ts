import { registerSeed } from "@/domain/seedRegistry";

/**
 * ANALYTICS fixtures.
 *
 * The base seed holds one month of trading, which is not enough to compute a
 * trend, an anomaly or a forecast — the screens would honestly report "not
 * enough history" everywhere. These records give Northline a plausible first
 * half-year: invoices migrated from the previous bookkeeper (marked as not
 * posted to this ledger, because they were not), a few decided deals and some
 * support history. Ids start at n: 20 so nothing collides with the base seed.
 */
registerSeed("analytics", (ctx) => {
  const invoice = (
    n: number, number: string, netMinor: number, at: string, dueAt: string,
    status: string, contactId: string, summary: string, posted = false,
  ) => ctx.rec({
    org: "nl", collection: "invoices", n, title: number,
    status,
    amountMinor: Math.round(netMinor * 1.2),
    summary,
    at, dueAt,
    owner: "Jonah Adeyemi",
    parentId: contactId,
    fields: {
      contactId,
      netMinor,
      taxMinor: Math.round(netMinor * 0.2),
      number,
      ledgerPosted: posted,
      origin: posted ? "arlovi" : "migrated",
    },
    body: { lines: [{ description: summary, qty: 1, unitMinor: netMinor, netMinor, taxMinor: Math.round(netMinor * 0.2) }] },
    createdAt: at,
  });

  return {
    records: [
      /* Overdue work in hand — the only invoice past its due date on the workspace clock. */
      invoice(20, "INV-1039", 40_000, "2026-09-24T10:00:00.000Z", "2026-10-24T00:00:00.000Z", "awaiting_payment", "nl-contacts-002",
        "Pendant specification revision for the Clerkenwell fit-out."),

      /* Migrated trading history, five months of it. */
      invoice(21, "INV-1012", 72_000, "2026-06-12T10:00:00.000Z", "2026-07-12T00:00:00.000Z", "paid", "nl-contacts-001", "Two Arc Lamps for a residential project."),
      invoice(22, "INV-1016", 54_000, "2026-07-03T10:00:00.000Z", "2026-08-02T00:00:00.000Z", "paid", "nl-contacts-002", "Pendant trio for a studio reception."),
      invoice(23, "INV-1021", 96_000, "2026-08-14T10:00:00.000Z", "2026-09-13T00:00:00.000Z", "paid", "nl-contacts-001", "Showroom lighting consultation and fittings."),
      invoice(24, "INV-1027", 230_000, "2026-09-05T10:00:00.000Z", "2026-10-05T00:00:00.000Z", "paid", "nl-contacts-003", "Restaurant fit-out, first phase."),
      invoice(25, "INV-1033", 61_000, "2026-10-09T10:00:00.000Z", "2026-11-08T00:00:00.000Z", "paid", "nl-contacts-002", "Replacement shades and a brass collar set."),
      invoice(26, "INV-1036", 48_000, "2026-10-28T10:00:00.000Z", "2026-11-27T00:00:00.000Z", "awaiting_payment", "nl-contacts-003", "Second phase deposit for the restaurant fit-out."),

      /* Decided deals, so a win rate can be computed rather than guessed. */
      ctx.rec({
        org: "nl", collection: "deals", n: 20, title: "Shoreditch studio pendants", status: "won", amountMinor: 230_000,
        summary: "Closed in September. Invoiced as INV-1027.", at: "2026-09-02T09:00:00.000Z", owner: "Priya Shah",
        fields: { stage: "won", contactId: "nl-contacts-003", probability: 100 }, createdAt: "2026-08-04T09:00:00.000Z",
      }),
      ctx.rec({
        org: "nl", collection: "deals", n: 21, title: "Hotel lobby retrofit", status: "lost", amountMinor: 410_000,
        summary: "Lost on lead time; the contractor needed delivery in three weeks.", at: "2026-08-21T09:00:00.000Z", owner: "Priya Shah",
        fields: { stage: "lost", contactId: "nl-contacts-001", probability: 0, lostReason: "lead time" }, createdAt: "2026-07-15T09:00:00.000Z",
      }),
      ctx.rec({
        org: "nl", collection: "deals", n: 22, title: "Barbican apartment set", status: "won", amountMinor: 96_000,
        summary: "Closed in August after a showroom visit.", at: "2026-08-09T09:00:00.000Z", owner: "Maya Chen",
        fields: { stage: "won", contactId: "nl-contacts-001", probability: 100 }, createdAt: "2026-07-02T09:00:00.000Z",
      }),
      ctx.rec({
        org: "nl", collection: "deals", n: 23, title: "Shepherd's Bush café", status: "lost", amountMinor: 85_000,
        summary: "Lost on price against an import supplier.", at: "2026-10-16T09:00:00.000Z", owner: "Priya Shah",
        fields: { stage: "lost", contactId: "nl-contacts-002", probability: 0, lostReason: "price" }, createdAt: "2026-09-20T09:00:00.000Z",
      }),

      /* Support history, so ticket volume has more than one point. */
      ctx.rec({
        org: "nl", collection: "tickets", n: 20, title: "CARE-11 Dimmer compatibility", status: "closed",
        summary: "Resolved with a replacement driver.", at: "2026-08-19T11:00:00.000Z", owner: "Priya Shah",
        fields: { contactId: "nl-contacts-001", priority: "normal" }, createdAt: "2026-08-18T11:00:00.000Z",
      }),
      ctx.rec({
        org: "nl", collection: "tickets", n: 21, title: "CARE-14 Late delivery", status: "closed",
        summary: "Courier delay on the September order.", at: "2026-09-24T11:00:00.000Z", owner: "Priya Shah",
        fields: { contactId: "nl-contacts-003", priority: "high" }, createdAt: "2026-09-23T11:00:00.000Z",
      }),
      ctx.rec({
        org: "nl", collection: "tickets", n: 22, title: "CARE-17 Finish mismatch", status: "open",
        summary: "Brushed and polished collars supplied in the same crate.", at: "2026-11-11T11:00:00.000Z", owner: "Priya Shah",
        fields: { contactId: "nl-contacts-002", priority: "high" }, createdAt: "2026-11-11T11:00:00.000Z",
      }),

      /* Running costs, so an expense trend exists. */
      ctx.rec({ org: "nl", collection: "expenses", n: 20, title: "Workshop rent, September", status: "reimbursed", amountMinor: 250_000, summary: "Studio rent.", at: "2026-09-01T09:00:00.000Z", owner: "Jonah Adeyemi", fields: { category: "premises" }, createdAt: "2026-09-01T09:00:00.000Z" }),
      ctx.rec({ org: "nl", collection: "expenses", n: 21, title: "Workshop rent, October", status: "reimbursed", amountMinor: 250_000, summary: "Studio rent.", at: "2026-10-01T09:00:00.000Z", owner: "Jonah Adeyemi", fields: { category: "premises" }, createdAt: "2026-10-01T09:00:00.000Z" }),
      ctx.rec({ org: "nl", collection: "expenses", n: 22, title: "Brass stock, October", status: "reimbursed", amountMinor: 118_000, summary: "Collar blanks from Thames Brass.", at: "2026-10-12T09:00:00.000Z", owner: "Maya Chen", fields: { category: "materials" }, createdAt: "2026-10-12T09:00:00.000Z" }),

      /* A published dashboard and a report, so the directories are not empty. */
      ctx.rec({
        org: "nl", collection: "dashboards", n: 20, title: "Trading overview", status: "published",
        summary: "Receivable, revenue by month and the open pipeline, for the Monday review.",
        owner: "Maya Chen",
        fields: { department: "Company", shared: true, pinned: true, sensitive: false },
        body: {
          tiles: [
            { id: "t1", title: "Revenue recognised", measureId: "revenue.paid", viz: "stat", w: 3, h: 1, order: 0 },
            { id: "t2", title: "Receivable", measureId: "receivable.open", viz: "stat", w: 3, h: 1, order: 1 },
            { id: "t3", title: "Overdue", measureId: "receivable.overdue", viz: "stat", w: 3, h: 1, order: 2 },
            { id: "t4", title: "Win rate", measureId: "deals.winrate", viz: "stat", w: 3, h: 1, order: 3 },
            { id: "t5", title: "Revenue by month", measureId: "revenue.paid", viz: "line", w: 8, h: 2, order: 4 },
            { id: "t6", title: "Receivable by status", measureId: "receivable.open", dimensionId: "status", viz: "donut", w: 4, h: 2, order: 5 },
            { id: "t7", title: "Pipeline by owner", measureId: "pipeline.open", dimensionId: "owner", viz: "bar", w: 12, h: 2, order: 6 },
          ],
          filters: [],
        },
      }),
      ctx.rec({
        org: "nl", collection: "dashboards", n: 21, title: "Workshop and support", status: "draft",
        summary: "Open work and ticket load, kept private while the definitions settle.",
        owner: "Priya Shah",
        fields: { department: "Operations", shared: false, pinned: false, sensitive: true },
        body: {
          tiles: [
            { id: "t1", title: "Open tickets", measureId: "tickets.open", viz: "stat", w: 4, h: 1, order: 0 },
            { id: "t2", title: "Open work items", measureId: "tasks.open", viz: "stat", w: 4, h: 1, order: 1 },
            { id: "t3", title: "Tickets by priority", measureId: "tickets.open", dimensionId: "priority", viz: "bar", w: 12, h: 2, order: 2 },
          ],
          filters: [],
        },
      }),
      ctx.rec({
        org: "nl", collection: "reports", n: 20, title: "Monthly trading review", status: "draft",
        summary: "What the month did, with every figure cited back to the records it came from.",
        owner: "Jonah Adeyemi",
        fields: { period: "monthly", audience: "Owners", scheduleFrequency: "monthly", scheduleDay: 1, scheduleHour: 8, scheduleMinute: 30 },
        body: {
          blocks: [
            { id: "b1", kind: "heading", text: "Trading in the month" },
            { id: "b2", kind: "metric", measureId: "revenue.paid", text: "Revenue recognised from posted journals." },
            { id: "b3", kind: "chart", measureId: "revenue.paid", viz: "line", text: "Revenue by month" },
            { id: "b6", kind: "metric", measureId: "invoices.paid", text: "Cash collected: paid invoices, gross of VAT, by invoice date." },
            { id: "b4", kind: "commentary", text: "Written by the person who signs it off. Nothing on this page is generated by a model; no model is connected." },
            { id: "b5", kind: "table", measureId: "receivable.open", dimensionId: "company", text: "Receivable by company" },
          ],
        },
      }),
    ],
  };
});
