import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Customer Care & Service fixtures.
 *
 * A queue with a real shape: a few breached cases, a few close to breach, a
 * long tail of resolved work with CSAT, and a knowledge base the macros
 * actually cite. Every clock-dependent value is offset from the seed clock
 * so SLA timers are live rather than frozen.
 * ====================================================================== */

function at(now: string, offsetHours: number): string {
  return new Date(new Date(now).getTime() + offsetHours * 3_600_000).toISOString();
}

interface TicketSeed {
  n: number; ref: string; subject: string; status: string; priority: string; channel: string;
  queue: string; assignee: string; contact: number; openedHoursAgo: number;
  firstResponseHours?: number; resolvedHoursAgo?: number; csat?: number; reopened?: boolean;
  summary: string; slaN: number; tags?: string[];
}

const TICKETS: TicketSeed[] = [
  { n: 40, ref: "CARE-31", subject: "Pendant flickers on a dimmer", status: "open", priority: "urgent", channel: "phone", queue: "Technical", assignee: "Marcus Reiss", contact: 20, openedHoursAgo: 31, summary: "Trailing-edge dimmer incompatible with the LED driver. Customer has three fittings affected.", slaN: 20 },
  { n: 41, ref: "CARE-32", subject: "Wrong finish delivered", status: "open", priority: "high", channel: "email", queue: "Orders", assignee: "Clara Mendoza", contact: 21, openedHoursAgo: 19, firstResponseHours: 2, summary: "Brushed brass ordered, polished brass shipped. Photographs attached by the customer.", slaN: 21 },
  { n: 42, ref: "CARE-33", subject: "Lead time for twelve pendants", status: "open", priority: "normal", channel: "email", queue: "Trade", assignee: "Priya Shah", contact: 22, openedHoursAgo: 7, firstResponseHours: 1, summary: "Trade account asking whether twelve units can land before the new year.", slaN: 22 },
  { n: 43, ref: "CARE-34", subject: "Replacement glass shade", status: "waiting", priority: "normal", channel: "portal", queue: "Orders", assignee: "Clara Mendoza", contact: 23, openedHoursAgo: 52, firstResponseHours: 3, summary: "Waiting on the customer to confirm the shade diameter.", slaN: 22 },
  { n: 44, ref: "CARE-35", subject: "Invoice does not match the quote", status: "open", priority: "high", channel: "email", queue: "Billing", assignee: "Hugh Tennant", contact: 24, openedHoursAgo: 11, summary: "Delivery line was quoted as included. Needs a finance decision before a reply goes out.", slaN: 21 },
  { n: 45, ref: "CARE-36", subject: "Showroom appointment moved", status: "resolved", priority: "low", channel: "phone", queue: "Trade", assignee: "Iris Lindqvist", contact: 25, openedHoursAgo: 74, firstResponseHours: 1, resolvedHoursAgo: 70, csat: 5, summary: "Moved from Thursday to Saturday morning.", slaN: 23 },
  { n: 46, ref: "CARE-37", subject: "Driver buzzing at low brightness", status: "open", priority: "high", channel: "chat", queue: "Technical", assignee: "Marcus Reiss", contact: 26, openedHoursAgo: 4, firstResponseHours: 1, summary: "Audible buzz below twenty percent. Likely the same driver batch as CARE-31.", slaN: 21 },
  { n: 47, ref: "CARE-38", subject: "Return request — floor lamp", status: "pending", priority: "normal", channel: "email", queue: "Orders", assignee: "Clara Mendoza", contact: 27, openedHoursAgo: 96, firstResponseHours: 4, summary: "Within the fourteen-day window. Awaiting the carrier collection slot.", slaN: 22 },
  { n: 48, ref: "CARE-39", subject: "Missing fixing kit", status: "resolved", priority: "normal", channel: "email", queue: "Orders", assignee: "Daniel Okafor", contact: 28, openedHoursAgo: 140, firstResponseHours: 2, resolvedHoursAgo: 120, csat: 4, summary: "Kit posted the same day with a note.", slaN: 22 },
  { n: 49, ref: "CARE-40", subject: "Can I specify a longer cable?", status: "resolved", priority: "low", channel: "portal", queue: "Technical", assignee: "Marcus Reiss", contact: 29, openedHoursAgo: 190, firstResponseHours: 6, resolvedHoursAgo: 160, csat: 5, summary: "Three metre drop confirmed as a standard option.", slaN: 23 },
  { n: 50, ref: "CARE-41", subject: "Damaged in transit", status: "resolved", priority: "urgent", channel: "phone", queue: "Orders", assignee: "Clara Mendoza", contact: 20, openedHoursAgo: 260, firstResponseHours: 1, resolvedHoursAgo: 220, csat: 3, reopened: true, summary: "Replacement sent. Reopened once when the second shade also arrived chipped.", slaN: 20 },
  { n: 51, ref: "CARE-42", subject: "Trade pricing for a new account", status: "resolved", priority: "normal", channel: "email", queue: "Trade", assignee: "Priya Shah", contact: 21, openedHoursAgo: 310, firstResponseHours: 5, resolvedHoursAgo: 280, csat: 5, summary: "Account opened with standard trade terms.", slaN: 22 },
  { n: 52, ref: "CARE-43", subject: "Certificate of conformity", status: "resolved", priority: "high", channel: "email", queue: "Technical", assignee: "Marcus Reiss", contact: 22, openedHoursAgo: 360, firstResponseHours: 3, resolvedHoursAgo: 330, csat: 4, summary: "Issued from the compliance file.", slaN: 21 },
  { n: 53, ref: "CARE-44", subject: "Bulb replacement guidance", status: "closed", priority: "low", channel: "portal", queue: "Technical", assignee: "Wren Ashby", contact: 23, openedHoursAgo: 420, firstResponseHours: 1, resolvedHoursAgo: 410, csat: 5, summary: "Answered from the approved article. A person sent the reply.", slaN: 23 },
  { n: 54, ref: "CARE-45", subject: "Duplicate charge on the deposit", status: "closed", priority: "urgent", channel: "phone", queue: "Billing", assignee: "Jonah Adeyemi", contact: 24, openedHoursAgo: 500, firstResponseHours: 1, resolvedHoursAgo: 470, csat: 2, summary: "Refund raised locally. No processor is connected, so it was recorded as pending.", slaN: 20 },
  { n: 55, ref: "CARE-46", subject: "Showroom accessibility question", status: "closed", priority: "normal", channel: "email", queue: "Trade", assignee: "Iris Lindqvist", contact: 25, openedHoursAgo: 560, firstResponseHours: 4, resolvedHoursAgo: 540, csat: 5, summary: "Step-free entrance confirmed; the refit keeps it.", slaN: 22 },
  { n: 56, ref: "CARE-47", subject: "Does the brass patina?", status: "closed", priority: "low", channel: "chat", queue: "Technical", assignee: "Wren Ashby", contact: 26, openedHoursAgo: 610, firstResponseHours: 1, resolvedHoursAgo: 600, csat: 4, summary: "Answered from the finishes article.", slaN: 23 },
  { n: 57, ref: "CARE-48", subject: "Order has not arrived", status: "closed", priority: "high", channel: "phone", queue: "Orders", assignee: "Daniel Okafor", contact: 27, openedHoursAgo: 700, firstResponseHours: 2, resolvedHoursAgo: 660, csat: 3, summary: "Carrier had the wrong postcode. Redelivered.", slaN: 21 },
  { n: 58, ref: "CARE-49", subject: "Can you quote for a stairwell?", status: "closed", priority: "normal", channel: "portal", queue: "Trade", assignee: "Priya Shah", contact: 28, openedHoursAgo: 760, firstResponseHours: 8, resolvedHoursAgo: 700, csat: 4, summary: "Became the Harrow House commission.", slaN: 22 },
  { n: 59, ref: "CARE-50", subject: "Shade seating guidance", status: "closed", priority: "low", channel: "email", queue: "Technical", assignee: "Clara Mendoza", contact: 29, openedHoursAgo: 820, firstResponseHours: 2, resolvedHoursAgo: 800, csat: 5, summary: "Prompted the shade-seating article.", slaN: 23 },
  { n: 60, ref: "CARE-51", subject: "Unassigned: pendant height advice", status: "new", priority: "normal", channel: "chat", queue: "Technical", assignee: "", contact: 20, openedHoursAgo: 2, summary: "No owner yet. Sitting in the unassigned queue.", slaN: 22 },
  { n: 61, ref: "CARE-52", subject: "Unassigned: bulk order enquiry", status: "new", priority: "high", channel: "email", queue: "Trade", assignee: "", contact: 21, openedHoursAgo: 6, summary: "Forty units for a hotel refurbishment. Needs a trade owner.", slaN: 21 },
  { n: 62, ref: "CARE-53", subject: "Unassigned: spare parts list", status: "new", priority: "low", channel: "portal", queue: "Technical", assignee: "", contact: 22, openedHoursAgo: 20, summary: "Asking whether collars are sold separately.", slaN: 23 },
];

interface ContactSeed { n: number; name: string; company: string; email: string; kind: string; since: number; consent: string }

const CONTACTS: ContactSeed[] = [
  { n: 20, name: "Harriet Vale", company: "Vale & Co Interiors", email: "h.vale@valeco.example", kind: "trade", since: -420, consent: "Marketing consent given" },
  { n: 21, name: "Oscar Delacroix", company: "Delacroix Hotels", email: "o.delacroix@delacroix.example", kind: "trade", since: -300, consent: "Marketing consent withheld" },
  { n: 22, name: "Nadia Haddad", company: "Haddad Architects", email: "n.haddad@haddad.example", kind: "trade", since: -180, consent: "Marketing consent given" },
  { n: 23, name: "Tom Whitfield", company: "", email: "tom.whitfield@example.com", kind: "retail", since: -95, consent: "Marketing consent withheld" },
  { n: 24, name: "Grace Oyelaran", company: "Oyelaran Developments", email: "g.oyelaran@oyedev.example", kind: "trade", since: -640, consent: "Marketing consent given" },
  { n: 25, name: "Pierre Lambert", company: "Lambert Interiors", email: "p.lambert@lambert.example", kind: "trade", since: -260, consent: "Marketing consent given" },
  { n: 26, name: "Suzanne Fitzgerald", company: "", email: "s.fitz@example.com", kind: "retail", since: -60, consent: "Marketing consent withheld" },
  { n: 27, name: "Dylan Pryce", company: "", email: "d.pryce@example.com", kind: "retail", since: -30, consent: "Marketing consent given" },
  { n: 28, name: "Beatrice Okafor", company: "Okafor Studio", email: "b.okafor@okaforstudio.example", kind: "trade", since: -800, consent: "Marketing consent given" },
  { n: 29, name: "Rafael Ortiz", company: "", email: "r.ortiz@example.com", kind: "retail", since: -150, consent: "Marketing consent withheld" },
];

interface ArticleSeed { n: number; title: string; audience: string; status: string; version: string; helpful: number; unhelpful: number; body: string; summary: string }

const ARTICLES: ArticleSeed[] = [
  { n: 20, title: "Choosing a dimmer for our LED drivers", audience: "public", status: "published", version: "2.1", helpful: 34, unhelpful: 2, summary: "Trailing-edge dimmers only, with the compatible model list.", body: "<p>Every Northline fitting uses a trailing-edge driver. A leading-edge dimmer will flicker and may buzz below twenty percent.</p><p>Compatible models are listed on the product page. If a fitting flickers on an existing dimmer, the dimmer is almost always the cause.</p>" },
  { n: 21, title: "Seating the Arc shade", audience: "public", status: "published", version: "1.3", helpful: 51, unhelpful: 1, summary: "Press until the pin clicks; never force the collar.", body: "<p>Seat the shade until the pin clicks. Do not force the brass collar — a shade that sits off centre is usually a pin that has not seated.</p>" },
  { n: 22, title: "Finishes and patina", audience: "public", status: "published", version: "1.0", helpful: 22, unhelpful: 3, summary: "How brushed and polished brass age.", body: "<p>Brushed brass develops an even patina within a year. Polished brass is lacquered and stays bright; the lacquer can be removed if you prefer it to age.</p>" },
  { n: 23, title: "Lead times and what changes them", audience: "public", status: "published", version: "3.0", helpful: 40, unhelpful: 6, summary: "Six weeks standard, longer for bespoke finishes.", body: "<p>Standard fittings ship in six weeks from deposit. Bespoke finishes, non-standard drops and listed-building installs add two to four weeks.</p>" },
  { n: 24, title: "Handling a damaged delivery", audience: "internal", status: "published", version: "2.2", helpful: 18, unhelpful: 0, summary: "Photograph, log, replace, then claim.", body: "<p>Ask for photographs before promising anything. Raise the replacement in Commerce, then log the carrier claim. Never tell a customer a refund has been taken: no payment processor is connected to this workspace.</p>" },
  { n: 25, title: "Trade account onboarding", audience: "internal", status: "published", version: "1.4", helpful: 11, unhelpful: 1, summary: "Credit check, terms, price book and first order.", body: "<p>Open the account in CRM, set the trade price book and record the agreed terms. Trade pricing is never quoted from memory.</p>" },
  { n: 26, title: "Refund and return policy", audience: "public", status: "published", version: "4.0", helpful: 29, unhelpful: 8, summary: "Fourteen days for stock items; bespoke is excluded.", body: "<p>Stock items may be returned within fourteen days in their original packaging. Bespoke commissions are excluded unless the fault is ours.</p>" },
  { n: 27, title: "Escalating to a maker", audience: "internal", status: "draft", version: "0.3", helpful: 0, unhelpful: 0, summary: "Draft: when a case needs the bench rather than care.", body: "<p>Draft. Escalate when the fault is structural, when a tolerance is involved, or when the customer has already had one replacement.</p>" },
  { n: 28, title: "Old dimmer guidance", audience: "public", status: "retired", version: "1.0", helpful: 9, unhelpful: 14, summary: "Retired: superseded by the trailing-edge article.", body: "<p>Retired. This article recommended leading-edge dimmers, which is wrong for our current drivers. Kept so earlier replies can be read in context.</p>" },
  { n: 29, title: "Installing on a listed building", audience: "public", status: "published", version: "1.1", helpful: 14, unhelpful: 2, summary: "Surface fixings, consent and what we need from you.", body: "<p>Listed buildings usually need surface fixings and consent before installation. Send us the consent reference and we will design the fixing around it.</p>" },
  { n: 30, title: "What our care team can and cannot do", audience: "internal", status: "published", version: "1.0", helpful: 7, unhelpful: 0, summary: "The honest boundary: drafts, records and approvals.", body: "<p>We can record, draft and schedule. We cannot take a payment, send mail from this workspace, or issue a refund to a card. Say so plainly rather than implying an action happened.</p>" },
];

interface MacroSeed { n: number; title: string; summary: string; articleN?: number; status: string; uses: number; steps: string[] }

const MACROS: MacroSeed[] = [
  { n: 20, title: "Dimmer compatibility reply", summary: "Cites the trailing-edge article and asks for the dimmer model.", articleN: 20, status: "active", uses: 46, steps: ["Insert the trailing-edge dimmer article", "Ask for the dimmer make and model", "Set the queue to Technical", "Set priority to high if three or more fittings are affected"] },
  { n: 21, title: "Shade seating reply", summary: "Approved shade-seating guidance with an offer of a visit.", articleN: 21, status: "active", uses: 38, steps: ["Insert the shade-seating article", "Offer a bench visit if the customer is inside the M25", "Tag the case as technical"] },
  { n: 22, title: "Wrong item received", summary: "Apology, photograph request and a replacement record.", articleN: 24, status: "active", uses: 21, steps: ["Apologise and ask for photographs", "Raise a replacement in Commerce", "Set the case to pending", "Never state that a refund has been taken"] },
  { n: 23, title: "Lead time answer", summary: "Six weeks standard, with the bespoke caveat.", articleN: 23, status: "active", uses: 57, steps: ["Insert the lead time article", "Confirm the deposit date", "Add the trade account owner as a watcher"] },
  { n: 24, title: "Close with a satisfaction request", summary: "Closes the case and records a CSAT request locally.", status: "active", uses: 88, steps: ["Set the case to resolved", "Record a CSAT request against the case", "No survey is emailed: no mail provider is connected"] },
  { n: 25, title: "Escalate to the bench", summary: "Moves a technical case to a named maker.", status: "draft", uses: 0, steps: ["Set the queue to Technical", "Assign to the named maker", "Post to #care-escalations"] },
  { n: 26, title: "Billing dispute hold", summary: "Holds a billing case until finance has decided.", status: "active", uses: 12, steps: ["Set the queue to Billing", "Add an internal note with the quote reference", "Set the case to pending", "Do not quote a credit amount before finance confirms it"] },
];

registerSeed("care", (ctx) => {
  const records: Rec[] = [
    ...CONTACTS.map((contact) => ctx.rec({
      org: "nl", collection: "contacts", n: contact.n, title: contact.name, status: "active",
      summary: contact.company ? `${contact.kind === "trade" ? "Trade account" : "Retail customer"} · ${contact.company}` : "Retail customer",
      owner: "Priya Shah", at: at(ctx.now, contact.since * 24),
      tags: [contact.kind],
      fields: { company: contact.company, email: contact.email, kind: contact.kind, consent: contact.consent, phone: "Held under this customer's privacy setting", verifiedIdentity: contact.kind === "trade" },
    })),
    ...[
      { n: 20, title: "Urgent — technical", first: 2, resolve: 8, priority: "urgent" },
      { n: 21, title: "High — next business day", first: 4, resolve: 24, priority: "high" },
      { n: 22, title: "Standard care", first: 24, resolve: 72, priority: "normal" },
      { n: 23, title: "Low — best effort", first: 48, resolve: 240, priority: "low" },
    ].map((sla) => ctx.rec({
      org: "nl", collection: "slas", n: sla.n, title: sla.title, status: "active",
      summary: `First response within ${sla.first}h, resolution within ${sla.resolve}h, counted in business hours.`,
      owner: "Priya Shah",
      fields: {
        priority: sla.priority, firstResponseHours: sla.first, resolutionHours: sla.resolve,
        businessHours: "Mon–Fri 09:00–17:30 Europe/London", holidaysExcluded: true, pauseWhileWaiting: true,
      },
    })),
    ...TICKETS.map((ticket) => ctx.rec({
      org: "nl", collection: "tickets", n: ticket.n, title: `${ticket.ref} ${ticket.subject}`, status: ticket.status,
      summary: ticket.summary, owner: ticket.assignee || "Unassigned",
      at: at(ctx.now, -ticket.openedHoursAgo),
      dueAt: at(ctx.now, -ticket.openedHoursAgo + (ticket.priority === "urgent" ? 8 : ticket.priority === "high" ? 24 : ticket.priority === "normal" ? 72 : 240)),
      tags: [ticket.priority, ticket.channel, ...(ticket.tags ?? [])],
      fields: {
        ref: ticket.ref, priority: ticket.priority, channel: ticket.channel, queue: ticket.queue,
        assignee: ticket.assignee, contactId: `nl-contacts-${String(ticket.contact).padStart(3, "0")}`,
        slaId: `nl-slas-${String(ticket.slaN).padStart(3, "0")}`,
        firstResponseAt: ticket.firstResponseHours === undefined ? "" : at(ctx.now, -ticket.openedHoursAgo + ticket.firstResponseHours),
        resolvedAt: ticket.resolvedHoursAgo === undefined ? "" : at(ctx.now, -ticket.resolvedHoursAgo),
        csat: ticket.csat ?? 0, reopened: Boolean(ticket.reopened),
        aiDrafted: ticket.assignee === "Wren Ashby",
      },
    })),
    ...TICKETS.flatMap((ticket) => {
      const base: Rec[] = [ctx.rec({
        org: "nl", collection: "messages", n: 300 + ticket.n * 3, title: `${ticket.ref} — customer`,
        status: "received", summary: ticket.summary, owner: "Customer",
        parentId: `nl-tickets-${String(ticket.n).padStart(3, "0")}`,
        at: at(ctx.now, -ticket.openedHoursAgo),
        fields: { kind: "ticket", author: CONTACTS.find((contact) => contact.n === ticket.contact)?.name ?? "Customer", side: "customer", channel: ticket.channel, internal: false },
      })];
      if (ticket.firstResponseHours !== undefined) {
        base.push(ctx.rec({
          org: "nl", collection: "messages", n: 301 + ticket.n * 3, title: `${ticket.ref} — reply`,
          status: "sent", summary: `Thank you for letting us know. ${ticket.queue === "Technical" ? "This looks like a driver or dimmer question, so I have checked the approved guidance." : "I have checked the order record and will come back to you with a date."}`,
          owner: ticket.assignee || "Clara Mendoza",
          parentId: `nl-tickets-${String(ticket.n).padStart(3, "0")}`,
          at: at(ctx.now, -ticket.openedHoursAgo + ticket.firstResponseHours),
          fields: { kind: "ticket", author: ticket.assignee || "Clara Mendoza", side: "agent", channel: ticket.channel, internal: false },
        }));
      }
      if (ticket.status === "open" || ticket.status === "pending") {
        base.push(ctx.rec({
          org: "nl", collection: "messages", n: 302 + ticket.n * 3, title: `${ticket.ref} — internal note`,
          status: "note", summary: ticket.queue === "Billing" ? "Finance must confirm the delivery line before we quote a credit." : "Checked against the open production plan before promising a date.",
          owner: ticket.assignee || "Clara Mendoza",
          parentId: `nl-tickets-${String(ticket.n).padStart(3, "0")}`,
          at: at(ctx.now, -ticket.openedHoursAgo + 1),
          fields: { kind: "ticket", author: ticket.assignee || "Clara Mendoza", side: "agent", channel: "internal", internal: true },
        }));
      }
      return base;
    }),
    ...ARTICLES.map((article) => ctx.rec({
      org: "nl", collection: "articles", n: article.n, title: article.title, status: article.status,
      summary: article.summary, owner: "Clara Mendoza",
      at: at(ctx.now, -24 * (article.status === "draft" ? 3 : 40)),
      tags: [article.audience],
      fields: { audience: article.audience, version: article.version, helpful: article.helpful, unhelpful: article.unhelpful, supersededBy: article.n === 28 ? "nl-articles-020" : "" },
      body: { html: article.body },
    })),
    ...MACROS.map((macro) => ctx.rec({
      org: "nl", collection: "macros", n: macro.n, title: macro.title, status: macro.status,
      summary: macro.summary, owner: "Clara Mendoza",
      fields: { uses: macro.uses, articleId: macro.articleN ? `nl-articles-${String(macro.articleN).padStart(3, "0")}` : "", steps: macro.steps.length, prohibitedTopics: "refund amounts, legal advice, medical claims" },
      body: { steps: macro.steps },
    })),
    ctx.rec({
      org: "hb", collection: "tickets", n: 20, title: "HB-04 Pallet arrived short", status: "open",
      summary: "Two cases missing from the Tuesday intake.", owner: "Marcus Hale",
      at: at(ctx.now, -14), dueAt: at(ctx.now, 10),
      tags: ["high", "email"],
      fields: { ref: "HB-04", priority: "high", channel: "email", queue: "Orders", assignee: "Marcus Hale", contactId: "hb-contacts-001", slaId: "", firstResponseAt: at(ctx.now, -12), resolvedAt: "", csat: 0, reopened: false, aiDrafted: false },
    }),
    ctx.rec({
      org: "hb", collection: "slas", n: 20, title: "Standard — Harbor", status: "active",
      summary: "First response within 8h, resolution within 48h, Eastern business hours.", owner: "Elena Ward",
      fields: { priority: "normal", firstResponseHours: 8, resolutionHours: 48, businessHours: "Mon–Fri 08:00–17:00 America/New_York", holidaysExcluded: true, pauseWhileWaiting: true },
    }),
  ];
  return { records };
});
