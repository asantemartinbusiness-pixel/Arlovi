import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/** Team 4 id block: every fixture id sits at nl-<collection>-6NN so it cannot
 *  collide with another workstream's contributor. */
const B = 600;

/* ====================================================================== *
 * PORTAL fixtures — branded external spaces. A portal grants nothing by
 * default: every shared record is listed on the portal itself, and the
 * client role view only ever reads what a portal shares.
 * ====================================================================== */

const shift = (now: string, days: number, hour = 10) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

registerSeed("portal", (ctx) => {
  const records: Rec[] = [];
  const rec = (input: Parameters<typeof ctx.rec>[0]) => ctx.rec({ ...input, n: input.n + B });
  const id = (org: "nl" | "hb", collection: string, n: number) => ctx.id(org, collection, n + B);
  const now = ctx.now;
  const PORTAL = (n: number) => id("nl", "portals", n);
  const C = (n: number) => id("nl", "contacts", n);

  /* ---------------- Portals ---------------- */
  const portals: {
    n: number; title: string; audience: string; status: string; contact: number; accent: string; domain: string;
    users: number; invitesPending: number; visits: number; lastVisitDays: number; summary: string;
    shared: { collection: string; ids: string[] }[]; pages: string[];
  }[] = [
    { n: 20, title: "Harrow House Interiors", audience: "client", status: "live", contact: 20, accent: "#234fe8", domain: "harrow.northline.example",
      users: 3, invitesPending: 0, visits: 142, lastVisitDays: -1,
      summary: "Project space for the Harrow House fitout: orders, documents and the shade ticket.",
      shared: [
        { collection: "orders", ids: ["nl-orders-620"] },
        { collection: "invoices", ids: ["nl-invoices-001"] },
        { collection: "bookings", ids: ["nl-bookings-620"] },
        { collection: "documents", ids: ["nl-documents-620", "nl-documents-621"] },
      ],
      pages: ["Overview", "Work", "Files", "Messages", "Billing"] },
    { n: 21, title: "Ledbury Hotel Group", audience: "client", status: "live", contact: 30, accent: "#0f8780", domain: "ledbury.northline.example",
      users: 5, invitesPending: 2, visits: 61, lastVisitDays: -4,
      summary: "Fitout programme space with the specification pack and the milestone plan.",
      shared: [
        { collection: "documents", ids: ["nl-documents-622"] },
        { collection: "bookings", ids: ["nl-bookings-628"] },
      ],
      pages: ["Overview", "Work", "Files", "Messages", "Billing"] },
    { n: 22, title: "Studio Vellum", audience: "customer", status: "live", contact: 22, accent: "#b43e18", domain: "",
      users: 1, invitesPending: 0, visits: 23, lastVisitDays: -9,
      summary: "Light customer space: order status, returns and invoices.",
      shared: [
        { collection: "orders", ids: ["nl-orders-621"] },
        { collection: "returns", ids: ["nl-returns-620"] },
      ],
      pages: ["Overview", "Files", "Messages", "Billing"] },
    { n: 23, title: "Thames Brass Founders", audience: "supplier", status: "live", contact: 0, accent: "#5b4dff", domain: "",
      users: 2, invitesPending: 0, visits: 48, lastVisitDays: -2,
      summary: "Supplier space showing open purchase orders and expected receipts.",
      shared: [{ collection: "purchaseOrders", ids: ["nl-purchaseOrders-631"] }],
      pages: ["Overview", "Work", "Files", "Messages"] },
    { n: 24, title: "Fenwick & Gray Architects", audience: "partner", status: "draft", contact: 24, accent: "#a33a63", domain: "",
      users: 0, invitesPending: 1, visits: 0, lastVisitDays: 0,
      summary: "Specification partner space. Not published: no pages have been bound to data yet.",
      shared: [],
      pages: ["Overview"] },
    { n: 25, title: "The Hoxton Rooms", audience: "client", status: "suspended", contact: 26, accent: "#1a369e", domain: "",
      users: 2, invitesPending: 0, visits: 87, lastVisitDays: -3,
      summary: "Suspended while the disputed consignment is escalated. Links no longer resolve.",
      shared: [{ collection: "orders", ids: ["nl-orders-626"] }],
      pages: ["Overview", "Billing", "Messages"] },
  ];

  for (const portal of portals) {
    records.push(rec({
      org: "nl", collection: "portals", n: portal.n, title: portal.title, status: portal.status,
      summary: portal.summary,
      at: shift(now, -60, 9),
      tags: [portal.audience],
      fields: {
        audience: portal.audience,
        contactId: portal.contact ? C(portal.contact) : "",
        accent: portal.accent,
        customDomain: portal.domain,
        domainVerified: false,
        externalUsers: portal.users,
        invitesPending: portal.invitesPending,
        visits90d: portal.visits,
        lastVisitAt: portal.visits ? shift(now, portal.lastVisitDays, 15) : "",
        publishedAt: portal.status === "live" ? shift(now, -58, 9) : "",
        inheritsInternalAccess: false,
        linkExpiryDays: 30,
        termsVersion: "2026-09",
        // The base workspace keeps Harrow House as a bare stub (nl-portals-001);
        // this record is its full definition, and both ids read and write it.
        ...(portal.n === 20 ? { canonicalFor: "nl-portals-001" } : {}),
      },
      body: {
        pages: portal.pages.map((page, index) => ({
          id: `pg-${index + 1}`,
          name: page,
          modules: page === "Overview"
            ? ["welcome", "milestones", "next-actions"]
            : page === "Work" ? ["orders", "bookings"]
            : page === "Files" ? ["documents"]
            : page === "Messages" ? ["thread"]
            : ["invoices", "requests"],
          gate: page === "Billing" ? "billing_contact" : "any_member",
        })),
        shared: portal.shared,
        users: Array.from({ length: portal.users }, (_, index) => ({
          id: `u-${portal.n}-${index + 1}`,
          name: index === 0 ? portal.title.split(" ")[0] + " admin" : `${portal.title.split(" ")[0]} user ${index + 1}`,
          email: `user${index + 1}@${(portal.domain || `${portal.title.toLowerCase().replace(/[^a-z]+/g, "")}.example`)}`,
          role: index === 0 ? "portal_admin" : "portal_member",
          lastSeenAt: shift(now, portal.lastVisitDays - index, 12),
          expiresAt: shift(now, 30 - index * 3, 23),
        })),
        activity: [
          { at: shift(now, portal.lastVisitDays, 15), actor: "external", detail: "Opened the overview page." },
          { at: shift(now, portal.lastVisitDays - 2, 11), actor: "external", detail: "Downloaded a shared document." },
          { at: shift(now, -58, 9), actor: "Maya Chen", detail: "Published the portal and shared the first records." },
        ],
      },
    }));
  }

  /* ---------------- Shared documents ---------------- */
  const documents: { n: number; title: string; portal: number; status: string; kind: string; days: number; size: string; version: number; signature: string; summary: string }[] = [
    { n: 20, title: "Harrow House — lighting schedule v4", portal: 20, status: "shared", kind: "spreadsheet", days: -12, size: "84 KB", version: 4, signature: "none",
      summary: "Room by room schedule with finishes and quantities." },
    { n: 21, title: "Harrow House — installation method", portal: 20, status: "needs_review", kind: "document", days: -3, size: "212 KB", version: 2, signature: "requested",
      summary: "Method statement awaiting the client's sign-off before the fitters are booked." },
    { n: 22, title: "Ledbury — specification pack 2027", portal: 21, status: "shared", kind: "pdf", days: -6, size: "4.1 MB", version: 1, signature: "none",
      summary: "Finishes, IP ratings and lead times for the hotel programme." },
    { n: 23, title: "Harrow House — order confirmation ORD-401", portal: 20, status: "signed", kind: "pdf", days: -12, size: "96 KB", version: 1, signature: "signed_local",
      summary: "Confirmation accepted in the portal. The acceptance is a local record, not a qualified e-signature." },
    { n: 24, title: "Studio Vellum — return authorisation RET-18", portal: 22, status: "needs_review", kind: "pdf", days: -4, size: "72 KB", version: 1, signature: "requested",
      summary: "Return authorisation for the bent sconce arm." },
    { n: 25, title: "Hoxton Rooms — consignment photos", portal: 25, status: "archived", kind: "image", days: -7, size: "2.8 MB", version: 1, signature: "none",
      summary: "Archived with the portal while the dispute is escalated." },
    { n: 26, title: "Thames Brass — PO-206 revision 2", portal: 23, status: "shared", kind: "pdf", days: -12, size: "64 KB", version: 2, signature: "none",
      summary: "Revised purchase order sent to the supplier space." },
  ];
  for (const document of documents) {
    records.push(rec({
      org: "nl", collection: "documents", n: document.n, title: document.title, status: document.status,
      summary: document.summary, at: shift(now, document.days, 11),
      tags: ["portal", document.kind],
      parentId: PORTAL(document.portal),
      fields: {
        portalId: PORTAL(document.portal),
        kind: document.kind,
        sizeLabel: document.size,
        version: document.version,
        signature: document.signature,
        downloadable: document.status !== "archived",
        linkExpiresAt: document.status === "archived" ? shift(now, -1, 23) : shift(now, 24, 23),
        sharedBy: "Maya Chen",
        downloads: document.status === "shared" ? 4 : 1,
      },
      body: {
        versions: Array.from({ length: document.version }, (_, index) => ({
          version: index + 1,
          at: shift(now, document.days - (document.version - index - 1) * 7, 11),
          by: "Maya Chen",
          note: index + 1 === document.version ? "Current version shared with the portal." : "Superseded.",
        })),
      },
    }));
  }

  /* ---------------- External messages and requests ---------------- */
  const messages: { n: number; portal: number; days: number; hour: number; direction: string; author: string; kind: string; body: string; status: string }[] = [
    { n: 20, portal: 20, days: -5, hour: 9, direction: "in", author: "Harrow House admin", kind: "message", status: "answered",
      body: "The hallway sconce sits about 15mm off centre. Can someone look before the handover walk?" },
    { n: 21, portal: 20, days: -5, hour: 14, direction: "out", author: "Priya Shah", kind: "message", status: "answered",
      body: "Theo can be with you Thursday morning. I have put a hold on the survey kit; nothing is confirmed until you reply." },
    { n: 22, portal: 20, days: -1, hour: 16, direction: "in", author: "Harrow House admin", kind: "request", status: "open",
      body: "Please quote for two more Drift pendants at the 900mm drop for the stair return." },
    { n: 23, portal: 21, days: -4, hour: 11, direction: "in", author: "Ledbury admin", kind: "request", status: "open",
      body: "We need the IP rating evidence for the bathroom sconces for building control." },
    { n: 24, portal: 21, days: -4, hour: 17, direction: "out", author: "Maya Chen", kind: "message", status: "answered",
      body: "The IP44 certificate is in the specification pack, section 6. I have also shared the test report." },
    { n: 25, portal: 22, days: -9, hour: 10, direction: "in", author: "Studio Vellum", kind: "complaint", status: "escalated",
      body: "One sconce arrived with a bent arm. We need a replacement before Friday's install." },
    { n: 26, portal: 25, days: -2, hour: 9, direction: "in", author: "Hoxton Rooms", kind: "complaint", status: "escalated",
      body: "The consignment never arrived and we are being invoiced. We are disputing the whole order." },
    { n: 27, portal: 23, days: -3, hour: 8, direction: "in", author: "Ruth Ellory", kind: "message", status: "open",
      body: "The remaining 80 collars ship Monday. Revision 2 is on our system." },
  ];
  for (const message of messages) {
    records.push(rec({
      org: "nl", collection: "messages", n: message.n, title: `${message.kind === "request" ? "Request" : message.kind === "complaint" ? "Complaint" : "Message"} · ${message.author}`,
      status: message.status,
      summary: message.body,
      at: shift(now, message.days, message.hour),
      parentId: PORTAL(message.portal),
      tags: ["portal", message.kind],
      fields: {
        portalId: PORTAL(message.portal),
        direction: message.direction,
        kind: message.kind,
        author: message.author,
        delivery: "not_connected",
        attachments: message.kind === "complaint" ? 2 : 0,
        internalOnly: false,
      },
      body: { text: message.body },
    }));
  }

  /* ---------------- Portal billing requests ---------------- */
  records.push(
    rec({ org: "nl", collection: "invoices", n: 20, title: "INV-1061", status: "awaiting_payment",
      amountMinor: 1_968_00, at: shift(now, -12, 9), dueAt: shift(now, 18, 9),
      summary: "Harrow House fitout, stage two. Shared on the portal; no payment link exists.",
      parentId: C(20),
      fields: { contactId: C(20), netMinor: 1_640_00, taxMinor: 328_00, number: "INV-1061", portalId: PORTAL(20), payment: "not_connected", taxStatus: "domestic" },
      body: { lines: [
        { id: "l1", description: "Beacon Floor Lamp · Natural brass", quantity: 8, unitPriceMinor: 185_00, taxCategory: "standard" },
        { id: "l2", description: "On-site installation · Full day", quantity: 1, unitPriceMinor: 400_00, taxCategory: "standard" },
      ] } }),
    rec({ org: "nl", collection: "invoices", n: 21, title: "INV-1058", status: "paid",
      amountMinor: 739_20, at: shift(now, -40, 9), dueAt: shift(now, -10, 9),
      summary: "Harrow House fitout, stage one. Settled by bank transfer, recorded locally.",
      parentId: C(20),
      fields: { contactId: C(20), netMinor: 616_00, taxMinor: 123_20, number: "INV-1058", portalId: PORTAL(20), payment: "paid_local", taxStatus: "domestic" },
      body: { lines: [{ id: "l1", description: "Halo Wall Sconce · Double arm", quantity: 4, unitPriceMinor: 129_40, taxCategory: "standard" }, { id: "l2", description: "On-site installation · Half day", quantity: 1, unitPriceMinor: 98_40, taxCategory: "standard" }] } }),
    rec({ org: "nl", collection: "invoices", n: 22, title: "INV-1060", status: "disputed",
      amountMinor: 1_863_36, at: shift(now, -7, 9), dueAt: shift(now, 23, 9),
      summary: "Hoxton Rooms consignment. Disputed in the portal; payment is not pursued while escalated.",
      parentId: C(26),
      fields: { contactId: C(26), netMinor: 1_552_80, taxMinor: 310_56, number: "INV-1060", portalId: PORTAL(25), payment: "disputed", taxStatus: "domestic" },
      body: { lines: [{ id: "l1", description: "Halo Wall Sconce · Double arm", quantity: 12, unitPriceMinor: 129_40, taxCategory: "standard" }] } }),
  );

  /* ---------------- Harbor ---------------- */
  records.push(
    rec({ org: "hb", collection: "portals", n: 20, title: "Chris Hale", status: "live", summary: "Harbor Supply customer space. Isolated from Northline.",
      tags: ["customer"],
      fields: { audience: "customer", contactId: "hb-contacts-001", accent: "#0f8780", customDomain: "", domainVerified: false, externalUsers: 1, invitesPending: 0, visits90d: 4, lastVisitAt: shift(now, -2, 10), publishedAt: shift(now, -30, 9), inheritsInternalAccess: false, linkExpiryDays: 30, termsVersion: "2026-09" },
      body: {
        pages: [{ id: "pg-1", name: "Overview", modules: ["welcome", "next-actions"], gate: "any_member" }, { id: "pg-2", name: "Billing", modules: ["invoices"], gate: "billing_contact" }],
        shared: [{ collection: "orders", ids: [id("hb", "orders", 20)] }],
        users: [{ id: "u-hb-1", name: "Chris Hale", email: "chris@harborcustomer.example", role: "portal_admin", lastSeenAt: shift(now, -2, 10), expiresAt: shift(now, 28, 23) }],
        activity: [{ at: shift(now, -2, 10), actor: "external", detail: "Opened the overview page." }],
      } }),
  );

  return { records };
});
