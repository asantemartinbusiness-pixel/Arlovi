import type { Audit, Rec } from "./types";
import { ORG_HARBOR, ORG_NORTHLINE, SEED_NOW, currencyFor } from "./types";
import { imbalance, journalLines, statements } from "./finance";

const NOW = SEED_NOW;

interface Org {
  id: string;
  prefix: string;
  currency: string;
  owner: string;
}

const NORTH: Org = { id: ORG_NORTHLINE, prefix: "nl", currency: "GBP", owner: "Maya Chen" };
const HARBOR: Org = { id: ORG_HARBOR, prefix: "hb", currency: "USD", owner: "Elena Ward" };

function rec(org: Org, collection: string, n: number, title: string, extra: Partial<Rec> = {}): Rec {
  return {
    id: `${org.prefix}-${collection}-${String(n).padStart(3, "0")}`,
    organizationId: org.id,
    collection,
    title,
    status: extra.status ?? "active",
    ownerName: extra.ownerName ?? org.owner,
    summary: extra.summary ?? "",
    amountMinor: extra.amountMinor,
    currency: extra.currency ?? org.currency,
    at: extra.at ?? NOW,
    dueAt: extra.dueAt,
    startAt: extra.startAt,
    endAt: extra.endAt,
    parentId: extra.parentId,
    tags: extra.tags ?? [],
    fields: extra.fields ?? {},
    body: extra.body,
    createdAt: extra.createdAt ?? "2026-10-02T09:00:00.000Z",
    updatedAt: extra.updatedAt ?? NOW,
    revision: extra.revision ?? 1,
    createdBy: extra.createdBy ?? org.owner,
    updatedBy: extra.updatedBy ?? org.owner,
    history: extra.history ?? [],
  };
}

function account(org: Org, n: number, code: string, title: string, type: string): Rec {
  return rec(org, "accounts", n, title, {
    summary: `${type} account ${code}`,
    fields: { code, type },
    tags: [type],
  });
}

function journal(org: Org, n: number, title: string, lines: { accountId: string; debitMinor: number; creditMinor: number; memo?: string }[], status = "posted", memo = title): Rec {
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  return rec(org, "journals", n, title, {
    status,
    summary: memo,
    amountMinor: debit,
    at: "2026-11-01T00:00:00.000Z",
    fields: { date: "2026-11-01" },
    body: { date: "2026-11-01", memo, lines },
    tags: ["ledger"],
  });
}

export const REQUIRED_COLLECTIONS = [
  "accounts", "activities", "agents", "announcements", "appProjects", "applicants", "approvals", "articles", "assets",
  "audiences", "bankTransactions", "bills", "bookings", "brands", "budgets", "calls", "campaigns", "channels",
  "companies", "conflicts", "connectors", "contacts", "contracts", "conversations", "datasets", "deals", "decisions",
  "decks", "departments", "designs", "documents", "emailThreads", "employees", "evaluations", "expenses", "facts",
  "forms", "incidents", "invoices", "journals", "leads", "leaveRequests", "legalEntities", "locations", "macros",
  "meetings", "members", "messages", "missions", "motions", "notifications", "objectives", "obligations", "orders",
  "payrollRuns", "photos", "policies", "portals", "preferences", "products", "projects", "promotions", "publications",
  "purchaseOrders", "quotes", "receipts", "resources", "returns", "reviews", "risks", "services", "shifts", "sites",
  "skills", "slas", "socialPosts", "sources", "stockMoves", "suppliers", "tasks", "taxCodes", "templates", "tickets",
  "timelineEvents", "videos", "warehouses", "workbooks", "workflowRuns", "workflows",
];

export function buildSeed(): { records: Rec[]; events: Audit[] } {
  const records: Rec[] = [];
  const events: Audit[] = [];
  records.push(
    rec(NORTH, "organizations", 1, "Northline Atelier", {
      summary: "Design-led lighting studio. Local workspace, London.",
      fields: { slug: "northline", executionPaused: false, locale: "en-GB", legalName: "Northline Atelier Ltd" },
    }),
  );
  // The organization record id must be the org id for pause lookups.
  records[0] = { ...records[0], id: ORG_NORTHLINE };

  const A = {
    bank: `${NORTH.prefix}-accounts-001`,
    ar: `${NORTH.prefix}-accounts-002`,
    inventory: `${NORTH.prefix}-accounts-003`,
    ap: `${NORTH.prefix}-accounts-004`,
    vat: `${NORTH.prefix}-accounts-005`,
    equity: `${NORTH.prefix}-accounts-006`,
    product: `${NORTH.prefix}-accounts-007`,
    service: `${NORTH.prefix}-accounts-008`,
    cogs: `${NORTH.prefix}-accounts-009`,
    rent: `${NORTH.prefix}-accounts-010`,
    software: `${NORTH.prefix}-accounts-011`,
    wages: `${NORTH.prefix}-accounts-012`,
  };

  records.push(
    account(NORTH, 1, "1000", "Bank", "asset"),
    account(NORTH, 2, "1100", "Accounts receivable", "asset"),
    account(NORTH, 3, "1200", "Inventory", "asset"),
    account(NORTH, 4, "2000", "Accounts payable", "liability"),
    account(NORTH, 5, "2100", "VAT payable", "liability"),
    account(NORTH, 6, "3000", "Owner equity", "equity"),
    account(NORTH, 7, "4000", "Product revenue", "revenue"),
    account(NORTH, 8, "4100", "Service revenue", "revenue"),
    account(NORTH, 9, "5000", "Cost of goods", "expense"),
    account(NORTH, 10, "6100", "Rent", "expense"),
    account(NORTH, 11, "6200", "Software", "expense"),
    account(NORTH, 12, "6300", "Wages", "expense"),
    journal(NORTH, 1, "Opening balances", [
      { accountId: A.bank, debitMinor: 8_500_000, creditMinor: 0 },
      { accountId: A.inventory, debitMinor: 2_400_000, creditMinor: 0 },
      { accountId: A.equity, debitMinor: 0, creditMinor: 10_900_000 },
    ]),
    journal(NORTH, 2, "Issue INV-1041", [
      { accountId: A.ar, debitMinor: 216_000, creditMinor: 0 },
      { accountId: A.product, debitMinor: 0, creditMinor: 180_000 },
      { accountId: A.vat, debitMinor: 0, creditMinor: 36_000 },
    ]),
    journal(NORTH, 3, "Receipt INV-1041", [
      { accountId: A.bank, debitMinor: 216_000, creditMinor: 0 },
      { accountId: A.ar, debitMinor: 0, creditMinor: 216_000 },
    ]),
    journal(NORTH, 4, "Rent bill November", [
      { accountId: A.rent, debitMinor: 250_000, creditMinor: 0 },
      { accountId: A.ap, debitMinor: 0, creditMinor: 250_000 },
    ]),
    journal(NORTH, 5, "COGS Arc Lamp order", [
      { accountId: A.cogs, debitMinor: 64_000, creditMinor: 0 },
      { accountId: A.inventory, debitMinor: 0, creditMinor: 64_000 },
    ]),
    journal(NORTH, 6, "Software subscription", [
      { accountId: A.software, debitMinor: 9_600, creditMinor: 0 },
      { accountId: A.bank, debitMinor: 0, creditMinor: 9_600 },
    ]),
    journal(NORTH, 7, "Issue INV-1048", [
      { accountId: A.ar, debitMinor: 115_200, creditMinor: 0 },
      { accountId: A.service, debitMinor: 0, creditMinor: 96_000 },
      { accountId: A.vat, debitMinor: 0, creditMinor: 19_200 },
    ]),
    journal(NORTH, 8, "Wage accrual draft", [
      { accountId: A.wages, debitMinor: 100_000, creditMinor: 0 },
      { accountId: A.bank, debitMinor: 0, creditMinor: 100_000 },
    ], "draft", "Balanced draft waiting for Finance approval."),
  );

  records.push(
    rec(NORTH, "invoices", 1, "INV-1041", {
      status: "paid",
      amountMinor: 216_000,
      summary: "Arc Lamp pair for Harrow House.",
      dueAt: "2026-10-28T00:00:00.000Z",
      parentId: "nl-contacts-001",
      fields: { contactId: "nl-contacts-001", netMinor: 180_000, taxMinor: 36_000, journalId: "nl-journals-002", paymentJournalId: "nl-journals-003", number: "INV-1041" },
      body: { lines: [{ description: "Arc Lamp", qty: 2, unitMinor: 90_000, netMinor: 180_000, taxMinor: 36_000 }] },
    }),
    rec(NORTH, "invoices", 2, "INV-1048", {
      status: "awaiting_payment",
      amountMinor: 115_200,
      summary: "Showroom consultation and specification.",
      dueAt: "2026-11-20T00:00:00.000Z",
      parentId: "nl-contacts-002",
      fields: { contactId: "nl-contacts-002", netMinor: 96_000, taxMinor: 19_200, journalId: "nl-journals-007", number: "INV-1048", revenueCode: "4100" },
      body: { lines: [{ description: "Specification fee", qty: 1, unitMinor: 96_000, netMinor: 96_000, taxMinor: 19_200 }] },
    }),
    rec(NORTH, "invoices", 3, "INV-1052", {
      status: "draft",
      amountMinor: 60_000,
      summary: "Draft for a second Arc Lamp. Not yet posted.",
      dueAt: "2026-12-01T00:00:00.000Z",
      parentId: "nl-contacts-003",
      fields: { contactId: "nl-contacts-003", netMinor: 50_000, taxMinor: 10_000, number: "INV-1052" },
      body: { lines: [{ description: "Arc Lamp", qty: 1, unitMinor: 50_000, netMinor: 50_000, taxMinor: 10_000 }] },
    }),
    rec(NORTH, "bills", 1, "BILL-220", {
      status: "approved",
      amountMinor: 250_000,
      summary: "Studio rent for November.",
      dueAt: "2026-11-18T00:00:00.000Z",
      fields: { supplierId: "nl-suppliers-001", journalId: "nl-journals-004" },
    }),
    rec(NORTH, "bills", 2, "BILL-226", {
      status: "inbox",
      amountMinor: 42_000,
      summary: "Packaging invoice waiting for a supplier match.",
      dueAt: "2026-11-30T00:00:00.000Z",
      fields: { supplierId: "nl-suppliers-002" },
    }),
    rec(NORTH, "expenses", 1, "Software receipt", {
      status: "reimbursed",
      amountMinor: 9_600,
      summary: "Design tool subscription paid from the bank account.",
      ownerName: "Jonah Adeyemi",
      fields: { category: "software", journalId: "nl-journals-006" },
    }),
    rec(NORTH, "expenses", 2, "Sample courier", {
      status: "review",
      amountMinor: 1_850,
      summary: "Courier receipt uploaded by Priya. Not posted.",
      ownerName: "Priya Shah",
      fields: { category: "delivery" },
    }),
    rec(NORTH, "bankTransactions", 1, "Statement · INV-1041", {
      status: "matched",
      amountMinor: 216_000,
      summary: "Imported from a CSV statement. Matched to the local receipt journal.",
      at: "2026-10-30T00:00:00.000Z",
      fields: { matched: true, journalId: "nl-journals-003", source: "statement-import" },
    }),
    rec(NORTH, "bankTransactions", 2, "Statement · card 4412", {
      status: "unmatched",
      amountMinor: -4_200,
      summary: "Imported statement line with no ledger match yet.",
      at: "2026-11-12T00:00:00.000Z",
      fields: { matched: false, source: "statement-import" },
    }),
    rec(NORTH, "bankTransactions", 3, "Statement · software", {
      status: "unmatched",
      amountMinor: -9_600,
      summary: "Amount matches the software journal but is not matched yet.",
      at: "2026-11-08T00:00:00.000Z",
      fields: { matched: false, source: "statement-import" },
    }),
    rec(NORTH, "budgets", 1, "Studio operating budget", {
      status: "approved",
      amountMinor: 4_800_000,
      summary: "Q4 operating ceiling for rent, wages and software.",
      fields: { actualMinor: 359_600, period: "2026-Q4" },
    }),
    rec(NORTH, "taxCodes", 1, "UK VAT standard", {
      status: "active",
      summary: "20% output VAT used on local invoices. Filing is not submitted to a tax authority from this workspace.",
      fields: { rateBps: 2000, jurisdiction: "GB" },
    }),
    rec(NORTH, "legalEntities", 1, "Northline Atelier Ltd", {
      status: "active",
      summary: "Primary legal entity for this local workspace.",
      fields: { currency: "GBP", country: "GB", number: "10449821" },
    }),
  );

  records.push(
    rec(NORTH, "contacts", 1, "Amina Rahman", {
      summary: "Harrow House studio lead. Consent recorded for showroom email.",
      fields: { email: "amina@harrow.example", companyId: "nl-companies-001", consent: "email-2026-09-12" },
      tags: ["customer"],
    }),
    rec(NORTH, "contacts", 2, "Leo Martins", {
      summary: "Architect specifying the Clerkenwell installation.",
      fields: { email: "leo@martins.example", companyId: "nl-companies-002", consent: "email-2026-10-02" },
      tags: ["customer"],
    }),
    rec(NORTH, "contacts", 3, "Sofia Berg", {
      summary: "New enquiry from the public site form.",
      status: "new",
      fields: { email: "sofia@berg.example", companyId: "nl-companies-003", consent: "form-2026-11-13" },
    }),
    rec(NORTH, "companies", 1, "Harrow House", {
      summary: "Residential client, invoice INV-1041 paid.",
      fields: { industry: "Residential", owner: "Priya Shah" },
    }),
    rec(NORTH, "companies", 2, "Martins Studio", {
      summary: "Architecture practice with an open specification.",
      fields: { industry: "Architecture", owner: "Priya Shah" },
    }),
    rec(NORTH, "companies", 3, "Berg Interiors", {
      summary: "Prospect account created from the November enquiry.",
      status: "prospect",
      fields: { industry: "Interiors", owner: "Priya Shah" },
    }),
    rec(NORTH, "leads", 1, "Clerkenwell pendant enquiry", {
      status: "qualified",
      amountMinor: 240_000,
      summary: "Eight pendants for a restaurant fit-out.",
      fields: { source: "website", contactId: "nl-contacts-002", stage: "qualified" },
    }),
    rec(NORTH, "leads", 2, "Showroom walk-in", {
      status: "new",
      amountMinor: 90_000,
      summary: "Asked for a brass Arc Lamp and a consultation.",
      fields: { source: "showroom", contactId: "nl-contacts-003", stage: "new" },
    }),
    rec(NORTH, "deals", 1, "Harrow House lamps", {
      status: "won",
      amountMinor: 180_000,
      summary: "Closed-won. Invoice INV-1041 is paid in the local ledger.",
      fields: { stage: "won", contactId: "nl-contacts-001", probability: 100 },
    }),
    rec(NORTH, "deals", 2, "Clerkenwell pendants", {
      status: "proposal",
      amountMinor: 240_000,
      summary: "Quote Q-118 is in review.",
      fields: { stage: "proposal", contactId: "nl-contacts-002", probability: 60 },
    }),
    rec(NORTH, "deals", 3, "Berg starter set", {
      status: "discovery",
      amountMinor: 90_000,
      summary: "Needs a qualification call.",
      fields: { stage: "discovery", contactId: "nl-contacts-003", probability: 20 },
    }),
    rec(NORTH, "quotes", 1, "Q-118 Clerkenwell", {
      status: "review",
      amountMinor: 240_000,
      summary: "Eight pendants at the trade price. Not sent to an external mailbox.",
      dueAt: "2026-11-28T00:00:00.000Z",
      parentId: "nl-deals-002",
      fields: { dealId: "nl-deals-002", contactId: "nl-contacts-002", netMinor: 200_000, taxMinor: 40_000 },
    }),
    rec(NORTH, "activities", 1, "Specification call", {
      status: "scheduled",
      summary: "Review pendant finish with Leo.",
      startAt: "2026-11-16T15:00:00.000Z",
      endAt: "2026-11-16T15:30:00.000Z",
      parentId: "nl-deals-002",
      fields: { kind: "call", contactId: "nl-contacts-002" },
    }),
  );

  records.push(
    rec(NORTH, "departments", 1, "Studio", { summary: "Design, making and showroom.", fields: { lead: "Maya Chen", members: 4 } }),
    rec(NORTH, "departments", 2, "Commercial", { summary: "Sales, care and finance.", fields: { lead: "Priya Shah", members: 3 } }),
    rec(NORTH, "members", 1, "Maya Chen", { summary: "Founder. Owner view.", fields: { kind: "human", role: "owner", departmentId: "nl-departments-001", title: "Founder" }, tags: ["human"] }),
    rec(NORTH, "members", 2, "Jonah Adeyemi", { summary: "Keeps the local ledger.", fields: { kind: "human", role: "finance", departmentId: "nl-departments-002", title: "Finance lead" }, tags: ["human"] }),
    rec(NORTH, "members", 3, "Priya Shah", { summary: "Sales and showroom.", fields: { kind: "human", role: "sales", departmentId: "nl-departments-002", title: "Commercial lead" }, tags: ["human"] }),
    rec(NORTH, "members", 4, "Elena Voss", { summary: "People operations.", fields: { kind: "human", role: "people", departmentId: "nl-departments-001", title: "People lead" }, tags: ["human"] }),
    rec(NORTH, "members", 5, "Nia Okonkwo", { summary: "Chief of Staff. Local agent contract, not an external model connection.", fields: { kind: "ai", role: "agent", departmentId: "nl-departments-002", title: "Chief of Staff", agentId: "nl-agents-001" }, tags: ["ai"] }),
    rec(NORTH, "members", 6, "Idris Cole", { summary: "Finance specialist agent.", fields: { kind: "ai", role: "agent", departmentId: "nl-departments-002", title: "Finance agent", agentId: "nl-agents-002" }, tags: ["ai"] }),
    rec(NORTH, "objectives", 1, "Ship the winter lamp collection", { status: "active", summary: "Eight trade accounts and a balanced showroom diary by December.", fields: { measure: "Trade accounts", target: 8, current: 3 } }),
    rec(NORTH, "objectives", 2, "Close the books each Friday", { status: "active", summary: "Local ledger balanced and unmatched statement lines reviewed.", fields: { measure: "Unmatched lines", target: 0, current: 2 } }),
    rec(NORTH, "locations", 1, "Clerkenwell showroom", { summary: "Tue–Sat 10:00–18:00.", fields: { timezone: "Europe/London", kind: "showroom" } }),
    rec(NORTH, "brands", 1, "Northline", { summary: "Electric cobalt, papaya and aqua. Working brand, rename-ready.", fields: { cobalt: "#234FE8", papaya: "#FFAE7C", aqua: "#36C5BA" }, body: { voice: "Warm, precise, never theatrical." } }),
    rec(NORTH, "preferences", 1, "Workspace preferences", {
      summary: "Local appearance and pinned apps for this browser profile.",
      fields: { theme: "light", density: "balanced", palette: "cobalt" },
      body: { pinned: ["HQ", "FIN", "CRM", "DOCS"], dismissed: [] as string[] },
    }),
  );

  records.push(
    rec(NORTH, "employees", 1, "Maya Chen", { summary: "Founder, full time.", fields: { memberId: "nl-members-001", employment: "full-time", start: "2019-04-01" } }),
    rec(NORTH, "employees", 2, "Jonah Adeyemi", { summary: "Finance lead, full time.", fields: { memberId: "nl-members-002", employment: "full-time", start: "2022-01-10" } }),
    rec(NORTH, "employees", 3, "Priya Shah", { summary: "Commercial lead, full time.", fields: { memberId: "nl-members-003", employment: "full-time", start: "2021-06-01" } }),
    rec(NORTH, "applicants", 1, "Noah Ellis", { status: "interview", summary: "Showroom associate. Portfolio reviewed.", fields: { role: "Showroom associate", stage: "interview" } }),
    rec(NORTH, "applicants", 2, "Hana Iqbal", { status: "offer", summary: "Maker. Offer drafted, not dispatched externally.", fields: { role: "Maker", stage: "offer" } }),
    rec(NORTH, "leaveRequests", 1, "Priya · 2 Dec", { status: "requested", summary: "Annual leave, one day.", startAt: "2026-12-02T00:00:00.000Z", endAt: "2026-12-03T00:00:00.000Z", fields: { employeeId: "nl-employees-003" } }),
    rec(NORTH, "shifts", 1, "Showroom Saturday", { status: "scheduled", summary: "Priya covers the showroom.", startAt: "2026-11-15T10:00:00.000Z", endAt: "2026-11-15T18:00:00.000Z", fields: { employeeId: "nl-employees-003", resourceId: "nl-resources-001" } }),
    rec(NORTH, "payrollRuns", 1, "November inputs", { status: "draft", amountMinor: 1_840_000, summary: "Local payroll inputs only. No statutory submission is connected.", fields: { period: "2026-11" } }),
    rec(NORTH, "reviews", 1, "Priya mid-year", { status: "scheduled", summary: "Commercial targets and showroom quality.", fields: { employeeId: "nl-employees-003" } }),
    rec(NORTH, "policies", 1, "Local authority policy", { summary: "Agents may draft invoices. Only Finance or Owner can post journals.", fields: { executionPaused: false, missionSpendCapMinor: 200_000 } }),
    rec(NORTH, "policies", 2, "Retention schedule", { summary: "Customer records kept 6 years unless a legal hold is present.", fields: { years: 6 } }),
  );

  records.push(
    rec(NORTH, "projects", 1, "Winter collection", { status: "active", summary: "Lamps, photography and trade list.", fields: { departmentId: "nl-departments-001" } }),
    rec(NORTH, "tasks", 1, "Photograph Arc Lamp", { status: "ready", summary: "Needed for the storefront and the deck.", parentId: "nl-projects-001", fields: { stage: "ready", assignee: "Sable Nguyen" } }),
    rec(NORTH, "tasks", 2, "Confirm brass supplier", { status: "doing", summary: "PO-184 is approved locally.", parentId: "nl-projects-001", fields: { stage: "doing", assignee: "Maya Chen" } }),
    rec(NORTH, "tasks", 3, "Reconcile statement", { status: "review", summary: "Two imported lines are still unmatched.", parentId: "nl-projects-001", fields: { stage: "review", assignee: "Jonah Adeyemi" } }),
    rec(NORTH, "templates", 1, "Trade launch mission", { summary: "Reusable plan: research, quote, make, invoice.", fields: { kind: "mission" } }),
  );

  records.push(
    rec(NORTH, "channels", 1, "Studio floor", { summary: "Internal channel for making and showroom.", fields: { kind: "channel" } }),
    rec(NORTH, "messages", 1, "Glaze test notes", { summary: "The warm glaze is approved for the winter run.", parentId: "nl-channels-001", at: "2026-11-13T16:10:00.000Z", fields: { author: "Maya Chen", kind: "human" } }),
    rec(NORTH, "messages", 2, "Ledger note", { summary: "INV-1048 is issued and still open. I can draft a reminder, not send it.", parentId: "nl-channels-001", at: "2026-11-14T08:40:00.000Z", fields: { author: "Idris Cole", kind: "ai" } }),
    rec(NORTH, "emailThreads", 1, "Quote for Clerkenwell", { status: "draft", summary: "Local draft to Leo Martins. Delivery is not connected.", fields: { to: "leo@martins.example", delivery: "not_connected" } }),
    rec(NORTH, "meetings", 1, "Friday close", { status: "scheduled", summary: "Finance and founder review unmatched lines.", startAt: "2026-11-14T16:00:00.000Z", endAt: "2026-11-14T16:30:00.000Z", fields: { where: "Showroom mezzanine" } }),
    rec(NORTH, "calls", 1, "Voicemail · Sofia", { status: "open", summary: "Asked to visit Saturday. Local recording reference only.", fields: { contactId: "nl-contacts-003" } }),
    rec(NORTH, "announcements", 1, "Showroom hours", { summary: "Open Saturday with Priya on the floor.", status: "published" }),
  );

  records.push(
    rec(NORTH, "tickets", 1, "CARE-19 Shade alignment", { status: "open", summary: "Harrow House reports a shade sitting slightly off centre.", fields: { contactId: "nl-contacts-001", priority: "normal", slaDue: "2026-11-16" } }),
    rec(NORTH, "tickets", 2, "CARE-22 Finish sample", { status: "waiting", summary: "Leo asked for a brushed brass sample.", fields: { contactId: "nl-contacts-002", priority: "low" } }),
    rec(NORTH, "articles", 1, "How to seat the Arc shade", { summary: "Approved care article. Safe for local replies.", status: "approved", body: { html: "<p>Seat the shade until the pin clicks. Do not force the brass collar.</p>" } }),
    rec(NORTH, "macros", 1, "Shade seating reply", { summary: "Inserts the approved shade article into a local reply.", status: "active" }),
    rec(NORTH, "slas", 1, "Showroom care", { summary: "First response within one business day.", fields: { hours: 24 } }),
  );

  records.push(
    rec(NORTH, "products", 1, "Arc Lamp", { status: "active", amountMinor: 90_000, summary: "Brass table lamp. Local catalogue price excludes VAT.", fields: { sku: "ARC-01", onHand: 14, vat: "standard" }, body: { description: "Hand-finished brass, linen shade." } }),
    rec(NORTH, "products", 2, "Pendant Eight", { status: "active", amountMinor: 30_000, summary: "Trade pendant used in Q-118.", fields: { sku: "PEN-08", onHand: 40, vat: "standard" } }),
    rec(NORTH, "products", 3, "Shade linen", { status: "active", amountMinor: 8_000, summary: "Replacement shade.", fields: { sku: "SHD-02", onHand: 22, vat: "standard" } }),
    rec(NORTH, "stockMoves", 1, "Opening Arc Lamp", { status: "posted", summary: "Opening quantity.", fields: { productId: "nl-products-001", quantity: 16 } }),
    rec(NORTH, "stockMoves", 2, "Fulfil ORD-300", { status: "posted", summary: "Two lamps left the studio.", fields: { productId: "nl-products-001", quantity: -2, orderId: "nl-orders-001" } }),
    rec(NORTH, "stockMoves", 3, "Opening pendants", { status: "posted", fields: { productId: "nl-products-002", quantity: 40 }, summary: "Opening quantity." }),
    rec(NORTH, "stockMoves", 4, "Opening shades", { status: "posted", fields: { productId: "nl-products-003", quantity: 22 }, summary: "Opening quantity." }),
    rec(NORTH, "orders", 1, "ORD-300", { status: "fulfilled", amountMinor: 216_000, summary: "Harrow House. Invoice paid in the local ledger.", fields: { contactId: "nl-contacts-001", invoiceId: "nl-invoices-001" } }),
    rec(NORTH, "orders", 2, "ORD-318", { status: "awaiting_payment", amountMinor: 108_000, summary: "Cart held locally. Card capture is not connected.", fields: { contactId: "nl-contacts-003", payment: "not_connected" } }),
    rec(NORTH, "returns", 1, "RET-4", { status: "requested", amountMinor: 8_000, summary: "Shade exchange requested. Refund is not executed externally.", fields: { orderId: "nl-orders-001", productId: "nl-products-003" } }),
    rec(NORTH, "promotions", 1, "Trade 10", { status: "active", summary: "Ten percent on pendant orders of eight or more.", fields: { percent: 10 } }),
    rec(NORTH, "carts", 1, "Showroom cart", { status: "open", summary: "Local cart for the storefront.", body: { lines: [] as { productId: string; qty: number }[] } }),
  );

  records.push(
    rec(NORTH, "services", 1, "Showroom consultation", { status: "active", amountMinor: 0, summary: "45 minutes in Clerkenwell.", fields: { minutes: 45, slug: "showroom-consult" } }),
    rec(NORTH, "services", 2, "On-site specification", { status: "active", amountMinor: 18_000, summary: "Paid specification visit.", fields: { minutes: 90, slug: "specification" } }),
    rec(NORTH, "resources", 1, "Consultation table", { summary: "One booking at a time.", fields: { kind: "room" } }),
    rec(NORTH, "resources", 2, "Priya Shah", { summary: "Showroom host.", fields: { kind: "person", employeeId: "nl-employees-003" } }),
    rec(NORTH, "bookings", 1, "Leo · specification", {
      status: "confirmed",
      summary: "Held for the consultation table.",
      startAt: "2026-11-18T14:00:00.000Z",
      endAt: "2026-11-18T15:30:00.000Z",
      fields: { resourceId: "nl-resources-001", serviceId: "nl-services-002", contactId: "nl-contacts-002" },
    }),
    rec(NORTH, "bookings", 2, "Open Saturday hold", {
      status: "held",
      summary: "Tentative hold. Expires if not confirmed in the workspace.",
      startAt: "2026-11-15T11:00:00.000Z",
      endAt: "2026-11-15T11:45:00.000Z",
      fields: { resourceId: "nl-resources-001", serviceId: "nl-services-001", contactId: "nl-contacts-003" },
    }),
  );

  records.push(
    rec(NORTH, "suppliers", 1, "Thames Brass", { summary: "Brass components. Local supplier record.", fields: { email: "orders@thamesbrass.example", terms: "30 days" } }),
    rec(NORTH, "suppliers", 2, "Millboard Packaging", { summary: "Cartons and tissue.", fields: { email: "hello@millboard.example", terms: "14 days" } }),
    rec(NORTH, "purchaseOrders", 1, "PO-184", { status: "approved", amountMinor: 320_000, summary: "Brass collars for the winter run.", fields: { supplierId: "nl-suppliers-001" } }),
    rec(NORTH, "purchaseOrders", 2, "PO-190", { status: "draft", amountMinor: 42_000, summary: "Cartons. Not sent to the supplier.", fields: { supplierId: "nl-suppliers-002" } }),
    rec(NORTH, "receipts", 1, "GRN-77", { status: "draft", summary: "Awaiting a count of brass collars.", fields: { purchaseOrderId: "nl-purchaseOrders-001", productId: "nl-products-001", quantity: 0 } }),
    rec(NORTH, "warehouses", 1, "Clerkenwell cage", { summary: "Finished goods and components.", fields: { locationId: "nl-locations-001" } }),
  );

  records.push(
    rec(NORTH, "campaigns", 1, "Winter trade list", { status: "draft", summary: "Email and showroom sequence. Nothing has been published externally.", fields: { channel: "email", delivery: "not_connected" } }),
    rec(NORTH, "audiences", 1, "Trade architects", { summary: "Contacts tagged architect with email consent.", fields: { consentRequired: true, size: 2 } }),
    rec(NORTH, "socialPosts", 1, "Arc Lamp daylight", { status: "scheduled", summary: "Local schedule only. No social account is connected.", startAt: "2026-11-20T09:00:00.000Z", fields: { network: "instagram", delivery: "not_connected" } }),
  );

  const docHtml = "<h2>Winter collection brief</h2><p>The Arc Lamp stays in brushed brass. Copy stays specific: materials, lead times, and care. Do not invent reviews.</p><h2>Offer</h2><ul><li>Arc Lamp at £900 ex VAT</li><li>Showroom consultation, 45 minutes</li></ul>";
  records.push(
    rec(NORTH, "documents", 1, "Winter collection brief", {
      summary: "Working brief for trade and showroom.",
      body: { html: docHtml, comments: [{ id: "c1", text: "Keep the price ex VAT.", quote: "£900" }] },
    }),
    rec(NORTH, "workbooks", 1, "Trade pipeline", {
      summary: "Local grid with a SUM formula.",
      body: {
        sheets: [{
          name: "Pipeline",
          rows: 12,
          cols: 6,
          cells: { A1: "Deal", B1: "Net", A2: "Harrow", B2: "1800", A3: "Clerkenwell", B3: "2400", A4: "Berg", B4: "900", A5: "Total", B5: "=SUM(B2:B4)" },
        }],
      },
    }),
    rec(NORTH, "decks", 1, "Winter trade story", {
      summary: "Three editable slides.",
      body: {
        theme: { background: "#F7F8FC", ink: "#17223A", accent: "#234FE8" },
        index: 0,
        slides: [
          { id: "s1", title: "Northline", elements: [{ id: "e1", type: "text", x: 48, y: 64, w: 400, h: 80, text: "Winter collection", fill: "#17223A" }] },
          { id: "s2", title: "Arc Lamp", elements: [{ id: "e2", type: "text", x: 48, y: 48, w: 420, h: 60, text: "Brushed brass, linen shade", fill: "#17223A" }, { id: "e3", type: "shape", x: 48, y: 140, w: 180, h: 100, text: "", fill: "#234FE8" }] },
          { id: "s3", title: "Ask", elements: [{ id: "e4", type: "text", x: 48, y: 80, w: 420, h: 80, text: "Book the Clerkenwell table", fill: "#17223A" }] },
        ],
      },
    }),
    rec(NORTH, "designs", 1, "Arc Lamp card", {
      summary: "Vector card with editable frames.",
      body: {
        nodes: [
          { id: "n1", type: "rect", x: 40, y: 40, w: 280, h: 160, fill: "#234FE8", text: "" },
          { id: "n2", type: "text", x: 56, y: 64, w: 220, h: 48, fill: "#F7F8FC", text: "Arc Lamp" },
          { id: "n3", type: "ellipse", x: 300, y: 70, w: 80, h: 80, fill: "#FFAE7C", text: "" },
        ],
      },
    }),
    rec(NORTH, "photos", 1, "Arc Lamp study", {
      summary: "Layer stack. Upload replaces the base colour with a local image.",
      body: {
        width: 640,
        height: 400,
        layers: [
          { id: "l1", name: "Ground", kind: "solid", color: "#141A30", opacity: 1, brightness: 0, contrast: 0, hidden: false },
          { id: "l2", name: "Lamp glow", kind: "solid", color: "#FFAE7C", opacity: 0.85, brightness: 0, contrast: 0, hidden: false, x: 180, y: 80, w: 200, h: 220 },
          { id: "l3", name: "Exposure", kind: "adjustment", color: "#ffffff", opacity: 1, brightness: 8, contrast: 6, hidden: false },
        ],
      },
    }),
    rec(NORTH, "publications", 1, "Trade lookbook", {
      summary: "Two-page local layout.",
      body: {
        pages: [
          { id: "p1", name: "Cover", frames: [{ id: "f1", x: 40, y: 48, w: 320, h: 80, text: "Northline winter" }] },
          { id: "p2", name: "Arc", frames: [{ id: "f2", x: 40, y: 48, w: 320, h: 120, text: "Brushed brass. Linen shade. Forty-five minute consultation." }] },
        ],
      },
    }),
    rec(NORTH, "videos", 1, "Showroom walkthrough", {
      summary: "Timeline with captions. Export writes a project file and SRT, not a hosted film.",
      body: {
        duration: 20,
        tracks: [{ id: "t1", name: "Picture", clips: [{ id: "c1", title: "Door", start: 0, duration: 8, color: "#234FE8" }, { id: "c2", title: "Arc Lamp", start: 8, duration: 12, color: "#FFAE7C" }] }],
        captions: [{ start: 0, end: 8, text: "Clerkenwell showroom" }, { start: 8, end: 18, text: "Arc Lamp in daylight" }],
      },
    }),
    rec(NORTH, "motions", 1, "Wordmark settle", {
      summary: "Two keyframed values. Playback runs in the browser.",
      body: {
        duration: 2,
        layers: [
          { id: "m1", name: "Opacity", keyframes: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
          { id: "m2", name: "Y", keyframes: [{ t: 0, v: 24 }, { t: 1, v: 0 }] },
        ],
      },
    }),
    rec(NORTH, "sites", 1, "northline.local", {
      summary: "Local site model. Publishing a hostname is not connected.",
      fields: { delivery: "not_connected" },
      body: {
        pages: [{
          id: "home",
          name: "Home",
          blocks: [
            { id: "b1", type: "hero", props: { title: "Lamps for rooms you live in", body: "Brass, linen, and a showroom in Clerkenwell." } },
            { id: "b2", type: "text", props: { title: "Arc Lamp", body: "£900 ex VAT. Made to order in three weeks." } },
            { id: "b3", type: "form", props: { title: "Ask for a consultation", body: "Saved locally until email delivery is connected." } },
          ],
        }],
      },
    }),
    rec(NORTH, "appProjects", 1, "Trade desk", {
      summary: "Local app schema and a sandboxed preview. No hosted deployment.",
      fields: { delivery: "not_connected" },
      body: {
        files: [{ path: "readme.md", content: "# Trade desk\nTracks account, quote and consultation in this workspace.\n" }],
        schema: { tables: [{ name: "accounts", fields: ["name", "owner", "status"] }] },
      },
    }),
    rec(NORTH, "forms", 1, "Showroom enquiry", {
      summary: "Public enquiry form stored in this browser.",
      body: {
        fields: [
          { id: "f1", type: "text", label: "Name", required: true },
          { id: "f2", type: "email", label: "Email", required: true },
          { id: "f3", type: "select", label: "Interest", required: true, options: ["Arc Lamp", "Pendants", "Consultation"] },
        ],
      },
    }),
    rec(NORTH, "submissions", 1, "Sofia Berg", { summary: "Enquiry received in the local form box.", parentId: "nl-forms-001", fields: { name: "Sofia Berg", email: "sofia@berg.example", interest: "Consultation" } }),
  );

  records.push(
    rec(NORTH, "agents", 1, "Nia Okonkwo", { status: "active", summary: "Chief of Staff. Drafts plans from local records and waits for approval.", fields: { role: "Chief of Staff", model: "not_connected", autonomy: "draft" } }),
    rec(NORTH, "agents", 2, "Idris Cole", { status: "active", summary: "Finance agent. Can prepare journals. Cannot post them.", fields: { role: "Finance", model: "not_connected", autonomy: "draft" } }),
    rec(NORTH, "agents", 3, "Sable Nguyen", { status: "active", summary: "Creative agent for briefs, decks and layout notes.", fields: { role: "Creative", model: "not_connected", autonomy: "draft" } }),
    rec(NORTH, "agents", 4, "Remy Alves", { status: "active", summary: "Care agent. Replies only from approved articles.", fields: { role: "Care", model: "not_connected", autonomy: "suggest" } }),
    rec(NORTH, "skills", 1, "Ledger check", { summary: "Confirms a journal balances before a person posts it.", fields: { version: "1.2" } }),
    rec(NORTH, "evaluations", 1, "Ledger check · November", { status: "passed", summary: "Balanced and unbalanced fixtures both behaved as expected.", fields: { skillId: "nl-skills-001", passed: 12, failed: 0 } }),
    rec(NORTH, "conversations", 1, "Morning brief", { summary: "Maya and Nia, 14 November.", fields: { agentId: "nl-agents-001" } }),
    rec(NORTH, "missions", 1, "Winter trade launch", { status: "running", summary: "Coordinate quote, photography and a local campaign draft.", fields: { agentId: "nl-agents-001", budgetMinor: 200_000, spentMinor: 0 } }),
    rec(NORTH, "missionTasks", 1, "Assemble evidence", { status: "done", parentId: "nl-missions-001", summary: "Invoice, quote and stock figures cited from the workspace.", fields: { stage: "done" } }),
    rec(NORTH, "missionTasks", 2, "Draft the campaign", { status: "ready", parentId: "nl-missions-001", summary: "Waiting for Maya to approve the copy.", fields: { stage: "ready" } }),
    rec(NORTH, "workflows", 1, "Invoice reminder", {
      status: "active",
      summary: "When an invoice is overdue, create a local reminder draft. Do not send email.",
      body: {
        nodes: [
          { id: "w1", type: "trigger", label: "Invoice overdue", x: 40, y: 80 },
          { id: "w2", type: "condition", label: "Older than 7 days", x: 220, y: 80 },
          { id: "w3", type: "action", label: "Draft reminder", x: 420, y: 40 },
          { id: "w4", type: "approval", label: "Finance approves", x: 420, y: 140 },
        ],
        edges: [
          { from: "w1", to: "w2" },
          { from: "w2", to: "w3" },
          { from: "w3", to: "w4" },
        ],
      },
    }),
    rec(NORTH, "workflowRuns", 1, "Run · INV-1048 reminder", { status: "waiting_approval", summary: "Draft reminder is ready. Email delivery is not connected.", parentId: "nl-workflows-001", fields: { capability: "awaiting_external_confirmation" } }),
    rec(NORTH, "facts", 1, "Arc Lamp price", { status: "verified", summary: "£900 ex VAT as of 1 November 2026.", fields: { confidence: "verified", sourceId: "nl-sources-001" } }),
    rec(NORTH, "facts", 2, "Showroom Saturday hours", { status: "proposed", summary: "10:00–18:00. Awaiting Maya.", fields: { confidence: "proposed", sourceId: "nl-sources-002" } }),
    rec(NORTH, "sources", 1, "Price list November", { status: "indexed", summary: "Uploaded price sheet. Parsed locally.", fields: { kind: "file", freshness: "2026-11-01" } }),
    rec(NORTH, "sources", 2, "Hours note", { status: "review", summary: "Note from the showroom board.", fields: { kind: "note", freshness: "2026-11-10" } }),
    rec(NORTH, "conflicts", 1, "Saturday close time", { status: "open", summary: "One note says 17:00 and the location record says 18:00.", fields: { factId: "nl-facts-002" } }),
    rec(NORTH, "decisions", 1, "Keep prices ex VAT", { status: "approved", summary: "Trade quotes and the site show ex VAT, with VAT on the invoice.", at: "2026-11-01T12:00:00.000Z" }),
    rec(NORTH, "datasets", 1, "Ledger snapshot", { summary: "Posted journals in this workspace. Freshness is the latest journal date.", fields: { source: "journals", asOf: "2026-11-01" } }),
    rec(NORTH, "connectors", 1, "Bank statement import", { status: "not_connected", summary: "CSV import works. A live bank feed is not connected.", fields: { capability: "not_connected", provider: "bank" } }),
    rec(NORTH, "connectors", 2, "Mailbox", { status: "not_connected", summary: "Drafts stay in the workspace until a mailbox is connected.", fields: { capability: "not_connected", provider: "email" } }),
    rec(NORTH, "connectors", 3, "Card payments", { status: "not_connected", summary: "Orders can be held. Cards are not captured.", fields: { capability: "not_connected", provider: "payments" } }),
    rec(NORTH, "incidents", 1, "INC-7 Mailbox", { status: "open", summary: "Mailbox connector has no grant. Outbound mail stays in draft.", fields: { connectorId: "nl-connectors-002", severity: "medium" } }),
    rec(NORTH, "notifications", 1, "Approve wage journal", { status: "open", summary: "Draft journal is balanced and waiting.", fields: { route: "/o/northline/fin/ledger", recordId: "nl-journals-008", kind: "approval", read: false } }),
    rec(NORTH, "notifications", 2, "Shade ticket", { status: "open", summary: "CARE-19 needs a reply from the approved article.", fields: { route: "/o/northline/care/tickets/nl-tickets-001", recordId: "nl-tickets-001", kind: "care", read: false } }),
    rec(NORTH, "approvals", 1, "Wage accrual", { status: "pending", summary: "Posting the draft wage journal.", fields: { recordId: "nl-journals-008", kind: "journal" } }),
    rec(NORTH, "assets", 1, "Wordmark", { summary: "SVG wordmark for local layouts.", fields: { kind: "logo", licence: "owned" }, body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect rx='14' width='64' height='64' fill='#234FE8'/><circle cx='24' cy='32' r='6' fill='#FFAE7C'/><circle cx='40' cy='32' r='6' fill='#36C5BA'/></svg>" } }),
    rec(NORTH, "contracts", 1, "Thames Brass supply", { status: "in_review", summary: "30-day terms. Not e-signed.", dueAt: "2027-01-15T00:00:00.000Z", fields: { supplierId: "nl-suppliers-001" } }),
    rec(NORTH, "obligations", 1, "Insurance renewal", { status: "upcoming", summary: "Public liability renewal.", dueAt: "2026-12-01T00:00:00.000Z" }),
    rec(NORTH, "risks", 1, "Single brass supplier", { status: "open", summary: "Thames Brass is the only collar source on the winter run.", fields: { impact: "high", likelihood: "medium" } }),
    rec(NORTH, "portals", 1, "Harrow House portal", { summary: "Scoped local view of their invoice, order and shade ticket.", fields: { contactId: "nl-contacts-001" } }),
    rec(NORTH, "timelineEvents", 1, "Company opened the local workspace", { summary: "Northline Atelier records were loaded for this browser.", at: "2026-10-02T09:00:00.000Z", fields: { kind: "decision" } }),
    rec(NORTH, "timelineEvents", 2, "INV-1041 paid in the ledger", { summary: "Local receipt posted. No bank feed confirmed it.", at: "2026-10-30T10:00:00.000Z", fields: { kind: "financial" } }),
  );

  // Link bank journal 3 to the matched statement line for the matcher.
  const receipt = records.find((item) => item.id === "nl-journals-003");
  if (receipt) receipt.fields = { ...receipt.fields, bankLineId: "nl-bankTransactions-001" };

  records.push(
    rec(HARBOR, "organizations", 1, "Harbor Supply", {
      summary: "Second legal entity used to prove record isolation. Dollars, not pounds.",
      fields: { slug: "harbor", executionPaused: false, locale: "en-US", legalName: "Harbor Supply LLC" },
    }),
  );
  const harborOrg = records[records.length - 1];
  harborOrg.id = ORG_HARBOR;
  records.push(
    account(HARBOR, 1, "1000", "Operating bank", "asset"),
    account(HARBOR, 2, "3000", "Owner equity", "equity"),
    journal(HARBOR, 1, "Harbor opening", [
      { accountId: "hb-accounts-001", debitMinor: 500_000, creditMinor: 0 },
      { accountId: "hb-accounts-002", debitMinor: 0, creditMinor: 500_000 },
    ]),
    rec(HARBOR, "contacts", 1, "Chris Hale", { summary: "Harbor's only seeded customer. Must not appear in Northline." }),
    rec(HARBOR, "objectives", 1, "Keep Harbor separate", { summary: "No shared invoices with Northline." }),
    rec(HARBOR, "members", 1, "Elena Ward", { summary: "Harbor owner.", fields: { kind: "human", role: "owner" }, tags: ["human"] }),
    rec(HARBOR, "policies", 1, "Harbor local policy", { summary: "Separate ledger and currency." }),
  );

  const present = new Set(records.map((item) => item.id));
  for (const collection of REQUIRED_COLLECTIONS) {
    const id = `nl-${collection}-001`;
    if (!present.has(id)) {
      records.push(
        rec(NORTH, collection, 1, collection, {
          summary: "Local workspace record for this register.",
          status: "active",
        }),
      );
      present.add(id);
    }
  }

  for (const item of records) {
    if (item.collection === "journals" && item.status === "posted") {
      const diff = imbalance(journalLines(item));
      if (diff !== 0) throw new Error(`Unbalanced seed journal ${item.id}`);
    }
  }
  for (const orgId of [ORG_NORTHLINE, ORG_HARBOR]) {
    const report = statements(records, orgId);
    if (!report.booksBalance || !report.equationHolds) {
      throw new Error(`Seed ledger does not balance for ${orgId}`);
    }
  }

  events.push({
    id: "evt-seed-1",
    organizationId: ORG_NORTHLINE,
    at: NOW,
    actor: "local",
    type: "workspace.ready_local",
    message: "Local workspace loaded. External providers are not connected.",
    capability: "ready_local",
  });

  return { records, events };
}

export function currencyOfRecord(orgId: string): string {
  return currencyFor(orgId);
}
