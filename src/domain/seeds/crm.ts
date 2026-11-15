import { registerSeed, type SeedRecordInput } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";
import { computeInvoice, type CustomerTaxStatus, type TaxCategory } from "@/platform/money";

/* ------------------------------------------------------------------ *
 * CRM fixtures.
 *
 * Nine companies, eleven contacts with recorded consent and tax status, deals
 * in every stage with the evidence each stage needs, quotes priced through the
 * same tax engine as an invoice, a logged conversation history and leads with
 * sources that the score can be argued from. Ids start at n:20.
 * ------------------------------------------------------------------ */

interface CompanySpec {
  n: number;
  title: string;
  industry: string;
  status: string;
  owner: string;
  summary: string;
  city: string;
  since: string;
}

const COMPANIES: CompanySpec[] = [
  { n: 720, title: "Fitzrovia House", industry: "Residential", status: "active", owner: "Priya Shah", summary: "Six-storey townhouse conversion. Pendants on the stair, phase two under discussion.", city: "London", since: "2026-06-18" },
  { n: 721, title: "Ravensworth Hotel", industry: "Hospitality", status: "active", owner: "Priya Shah", summary: "Forty-room refurbishment. Lighting plan stage one invoiced.", city: "Harrogate", since: "2026-09-01" },
  { n: 722, title: "Ellis & Ward Interiors", industry: "Interior design", status: "active", owner: "Priya Shah", summary: "Specifies for private clients. Shade replacements still unpaid.", city: "Bath", since: "2025-11-04" },
  { n: 723, title: "Pike Lighting Trade", industry: "Wholesale", status: "active", owner: "Priya Shah", summary: "Trade reseller. Buys pendants at the eight-piece discount.", city: "Manchester", since: "2026-02-20" },
  { n: 724, title: "Solheim Interiør", industry: "Retail", status: "active", owner: "Priya Shah", summary: "Oslo retailer. Export orders, zero-rated with evidence on file.", city: "Oslo", since: "2026-08-12" },
  { n: 725, title: "Dooley Lighting", industry: "Wholesale", status: "prospect", owner: "Priya Shah", summary: "Dublin reseller. A reverse-charge trade pilot is in draft.", city: "Dublin", since: "2026-11-02" },
  { n: 726, title: "Southwark Community Hall", industry: "Charity", status: "active", owner: "Maya Chen", summary: "Charity refit. Exempt supply under the community buildings relief.", city: "London", since: "2026-10-28" },
  { n: 727, title: "Hartley Developments", industry: "Property", status: "prospect", owner: "Priya Shah", summary: "Show flat lighting for a Bermondsey scheme. Budget confirmed verbally.", city: "London", since: "2026-10-09" },
  { n: 728, title: "Kemble Mews", industry: "Residential", status: "prospect", owner: "Priya Shah", summary: "Mews house rewire. Enquiry from the showroom.", city: "London", since: "2026-11-05" },
  { n: 729, title: "Linden Row Lofts", industry: "Property", status: "archived", owner: "Priya Shah", summary: "Scheme shelved in 2025. Kept for history.", city: "Leeds", since: "2025-03-14" },
];

interface ContactSpec {
  n: number;
  title: string;
  role: string;
  email: string;
  phone: string;
  companyId: string;
  consent?: string;
  suppressed?: boolean;
  taxStatus?: CustomerTaxStatus;
  summary: string;
  owner: string;
  restricted?: string;
  status?: string;
}

const CONTACTS: ContactSpec[] = [
  { n: 720, title: "Imogen Hart", role: "Owner", email: "imogen@fitzroviahouse.example", phone: "+44 20 7946 0210", companyId: "nl-companies-720", consent: "email-2026-06-18", taxStatus: "domestic", owner: "Priya Shah", summary: "Signed off the stair pendants. Prefers a call to an email." },
  { n: 721, title: "Daniel Okafor", role: "Operations director", email: "d.okafor@ravensworth.example", phone: "+44 1423 500 118", companyId: "nl-companies-721", consent: "email-2026-09-01", taxStatus: "domestic", owner: "Priya Shah", summary: "Holds the refurbishment budget. Reviews on Mondays." },
  { n: 722, title: "Rosa Ward", role: "Partner", email: "rosa@ellisward.example", phone: "+44 1225 447 902", companyId: "nl-companies-722", consent: "email-2025-11-04", taxStatus: "domestic", owner: "Priya Shah", summary: "Two shade invoices are past due; payment has been promised twice." },
  { n: 723, title: "Marcus Pike", role: "Buying manager", email: "marcus@pikelighting.example", phone: "+44 161 496 0033", companyId: "nl-companies-723", consent: "email-2026-02-20", taxStatus: "domestic", owner: "Priya Shah", summary: "Buys to a trade price list. Wants a standing eight-piece discount." },
  { n: 724, title: "Ingrid Solheim", role: "Owner", email: "ingrid@solheim.example", phone: "+47 22 44 18 07", companyId: "nl-companies-724", consent: "email-2026-08-12", taxStatus: "export", owner: "Priya Shah", summary: "Export customer. Shipping evidence is filed against each order." },
  { n: 725, title: "Niamh Dooley", role: "Director", email: "niamh@dooleylighting.example", phone: "+353 1 557 2290", companyId: "nl-companies-725", taxStatus: "eu_business", owner: "Priya Shah", summary: "No marketing consent recorded, so outreach stays manual. VAT number held." },
  { n: 726, title: "Alice Oyelaran", role: "Trustee", email: "alice@southwarkhall.example", phone: "+44 20 7525 4411", companyId: "nl-companies-726", consent: "email-2026-10-28", taxStatus: "domestic_exempt", owner: "Maya Chen", summary: "Charity trustee. The refit is an exempt supply, not zero-rated.", restricted: "Grant correspondence is held by the owner only." },
  { n: 727, title: "Jo Hartley", role: "Development manager", email: "jo@hartleydev.example", phone: "+44 20 7183 6600", companyId: "nl-companies-727", consent: "email-2026-10-09", taxStatus: "domestic", owner: "Priya Shah", summary: "Show flat decision expected before the December sales launch." },
  { n: 728, title: "Priti Raval", role: "Owner", email: "priti@kemblemews.example", phone: "+44 20 7490 1182", companyId: "nl-companies-728", consent: "form-2026-11-05", taxStatus: "domestic", owner: "Priya Shah", summary: "Walked into the showroom and asked about a full rewire." },
  { n: 729, title: "Owen Price", role: "Buyer", email: "owen.price@example.com", phone: "+44 7700 900 412", companyId: "", owner: "Priya Shah", summary: "Collected shades from the showroom. No tax status recorded, so a rate cannot be resolved for him yet." },
  { n: 730, title: "Hugh Tierney", role: "Procurement", email: "hugh@lindenrow.example", phone: "+44 113 496 0001", companyId: "nl-companies-729", suppressed: true, taxStatus: "domestic", owner: "Priya Shah", summary: "Asked to be removed from the trade list in 2025. Suppression must survive any merge.", status: "suppressed" },
  { n: 731, title: "Rosa Ward", role: "Partner", email: "rosa.ward@ellisward.example", phone: "+44 1225 447 902", companyId: "nl-companies-722", consent: "email-2026-03-02", taxStatus: "domestic", owner: "Priya Shah", summary: "Duplicate created by the November list import. Same person as nl-contacts-722.", status: "duplicate" },
];

interface DealSpec {
  n: number;
  title: string;
  stage: string;
  amount: number;
  probability?: number;
  contactId: string;
  companyId: string;
  owner: string;
  summary: string;
  closeDate?: string;
  budgetConfirmed?: boolean;
  quoteId?: string;
  invoiceId?: string;
  lostReason?: string;
  campaignId?: string;
  createdAt: string;
}

const DEALS: DealSpec[] = [
  { n: 720, title: "Ravensworth lighting plan", stage: "negotiation", amount: 680_000, probability: 80, contactId: "nl-contacts-721", companyId: "nl-companies-721", owner: "Priya Shah",
    summary: "Stage one invoiced. Stages two and three under negotiation on payment terms.", closeDate: "2026-12-05", budgetConfirmed: true, quoteId: "nl-quotes-720", createdAt: "2026-09-01T10:00:00.000Z", campaignId: "nl-campaigns-001" },
  { n: 721, title: "Pike trade account", stage: "proposal", amount: 420_000, probability: 55, contactId: "nl-contacts-723", companyId: "nl-companies-723", owner: "Priya Shah",
    summary: "Standing order for pendants at the eight-piece discount. Quote with Marcus.", closeDate: "2026-12-12", budgetConfirmed: true, quoteId: "nl-quotes-721", createdAt: "2026-10-04T09:30:00.000Z" },
  { n: 722, title: "Fitzrovia stair phase two", stage: "qualified", amount: 260_000, contactId: "nl-contacts-720", companyId: "nl-companies-720", owner: "Priya Shah",
    summary: "Second landing and the hallway. Imogen wants to see the brass finish again.", budgetConfirmed: true, createdAt: "2026-10-22T11:00:00.000Z" },
  { n: 723, title: "Kemble Mews rewire", stage: "discovery", amount: 95_000, contactId: "nl-contacts-728", companyId: "nl-companies-728", owner: "Priya Shah",
    summary: "Needs a site visit before anything can be priced.", createdAt: "2026-11-05T15:20:00.000Z" },
  { n: 724, title: "Hartley show flat", stage: "qualified", amount: 310_000, contactId: "nl-contacts-727", companyId: "nl-companies-727", owner: "Priya Shah",
    summary: "Show flat for the Bermondsey scheme. Budget confirmed on the call, nothing in writing.", budgetConfirmed: true, createdAt: "2026-10-09T14:00:00.000Z", campaignId: "nl-campaigns-001" },
  { n: 725, title: "Solheim winter order", stage: "negotiation", amount: 540_000, probability: 75, contactId: "nl-contacts-724", companyId: "nl-companies-724", owner: "Priya Shah",
    summary: "Export order for the Oslo shop. Freight and lead time are the open points.", closeDate: "2026-11-28", budgetConfirmed: true, quoteId: "nl-quotes-722", createdAt: "2026-08-12T08:40:00.000Z" },
  { n: 726, title: "Ellis & Ward retainer", stage: "lost", amount: 180_000, contactId: "nl-contacts-722", companyId: "nl-companies-722", owner: "Priya Shah",
    summary: "Monthly specification retainer. Lost on price against a London supplier.", lostReason: "Price", createdAt: "2026-07-15T09:00:00.000Z" },
  { n: 727, title: "Southwark hall refit", stage: "won", amount: 140_000, contactId: "nl-contacts-726", companyId: "nl-companies-726", owner: "Maya Chen",
    summary: "Closed won. Invoice INV-1060 is in draft as an exempt supply.", budgetConfirmed: true, invoiceId: "nl-invoices-728", createdAt: "2026-10-28T13:00:00.000Z" },
  { n: 728, title: "Dooley trade pilot", stage: "proposal", amount: 336_000, probability: 45, contactId: "nl-contacts-725", companyId: "nl-companies-725", owner: "Priya Shah",
    summary: "Reverse-charge pilot order for Dublin. Draft invoice INV-1059 has an unresolved line.", budgetConfirmed: true, quoteId: "nl-quotes-723", createdAt: "2026-11-02T10:10:00.000Z" },
];

interface QuoteLineSpec {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
  discountBp?: number;
}

interface QuoteSpec {
  n: number;
  number: string;
  status: string;
  dealId: string;
  contactId: string;
  at: string;
  expires: string;
  version: number;
  summary: string;
  customerStatus: CustomerTaxStatus;
  lines: QuoteLineSpec[];
  approvedBy?: string;
  discountApproval?: string;
}

const QUOTES: QuoteSpec[] = [
  { n: 720, number: "Q-124", status: "sent", dealId: "nl-deals-720", contactId: "nl-contacts-721", at: "2026-11-02", expires: "2026-12-02", version: 2,
    summary: "Stages two and three of the Ravensworth lighting plan.", customerStatus: "domestic", approvedBy: "Maya Chen",
    lines: [
      { description: "Lighting plan, stage two", quantity: 1, unitPriceMinor: 180_000, taxCategory: "standard" },
      { description: "Pendant Eight, antique brass", quantity: 12, unitPriceMinor: 32_000, taxCategory: "standard", discountBp: 500 },
      { description: "Site supervision, per day", quantity: 4, unitPriceMinor: 24_000, taxCategory: "standard" },
    ] },
  { n: 721, number: "Q-126", status: "review", dealId: "nl-deals-721", contactId: "nl-contacts-723", at: "2026-11-11", expires: "2026-12-11", version: 1,
    summary: "Trade standing order. The 15% discount is above the 10% policy ceiling.", customerStatus: "domestic", discountApproval: "Needs owner approval: 15% exceeds the 10% ceiling.",
    lines: [
      { description: "Pendant Eight, trade", quantity: 40, unitPriceMinor: 30_000, taxCategory: "standard", discountBp: 1_500 },
      { description: "Carriage, quarterly", quantity: 4, unitPriceMinor: 4_500, taxCategory: "standard" },
    ] },
  { n: 722, number: "Q-121", status: "accepted", dealId: "nl-deals-725", contactId: "nl-contacts-724", at: "2026-10-26", expires: "2026-11-26", version: 3,
    summary: "Winter order for Oslo. Zero-rated export with shipping evidence.", customerStatus: "export", approvedBy: "Maya Chen",
    lines: [
      { description: "Arc Lamp, brushed brass", quantity: 5, unitPriceMinor: 95_000, taxCategory: "standard" },
      { description: "Freight to Oslo", quantity: 1, unitPriceMinor: 32_000, taxCategory: "standard" },
    ] },
  { n: 723, number: "Q-128", status: "draft", dealId: "nl-deals-728", contactId: "nl-contacts-725", at: "2026-11-13", expires: "2026-12-13", version: 1,
    summary: "Dublin pilot. The printing line has no approved rate for an EU business customer.", customerStatus: "eu_business",
    lines: [
      { description: "Pendant Eight, trade", quantity: 8, unitPriceMinor: 30_000, taxCategory: "reverse_charge" },
      { description: "Installation guide printing", quantity: 1, unitPriceMinor: 12_000, taxCategory: "reduced" },
    ] },
  { n: 724, number: "Q-109", status: "expired", dealId: "nl-deals-726", contactId: "nl-contacts-722", at: "2026-08-04", expires: "2026-09-04", version: 1,
    summary: "Specification retainer. Expired pricing; it cannot be sent as current.", customerStatus: "domestic",
    lines: [{ description: "Specification retainer, monthly", quantity: 6, unitPriceMinor: 30_000, taxCategory: "standard" }] },
];

interface ActivitySpec {
  n: number;
  title: string;
  kind: string;
  status: string;
  start: string;
  minutes?: number;
  dealId?: string;
  contactId?: string;
  owner: string;
  summary: string;
  outcome?: string;
  delivery?: string;
}

const ACTIVITIES: ActivitySpec[] = [
  { n: 720, title: "Discovery call with Daniel", kind: "call", status: "done", start: "2026-09-03T10:00:00.000Z", minutes: 30, dealId: "nl-deals-720", contactId: "nl-contacts-721", owner: "Priya Shah",
    summary: "Forty rooms, two phases, decision with the board in December.", outcome: "Budget range confirmed at 6,000 to 7,500." },
  { n: 721, title: "Site visit, Harrogate", kind: "meeting", status: "done", start: "2026-09-18T11:00:00.000Z", minutes: 120, dealId: "nl-deals-720", contactId: "nl-contacts-721", owner: "Priya Shah",
    summary: "Measured the stair and the two function rooms.", outcome: "Stage one agreed and invoiced as INV-1056." },
  { n: 722, title: "Send Q-124", kind: "email", status: "draft", start: "2026-11-02T09:00:00.000Z", dealId: "nl-deals-720", contactId: "nl-contacts-721", owner: "Priya Shah",
    summary: "Quote attached with the stage two drawing pack.", delivery: "not_connected" },
  { n: 723, title: "Chase Q-124", kind: "task", status: "open", start: "2026-11-17T09:00:00.000Z", dealId: "nl-deals-720", contactId: "nl-contacts-721", owner: "Priya Shah",
    summary: "Daniel reviews on Mondays. Call rather than email." },
  { n: 724, title: "Trade terms call", kind: "call", status: "done", start: "2026-10-06T14:00:00.000Z", minutes: 25, dealId: "nl-deals-721", contactId: "nl-contacts-723", owner: "Priya Shah",
    summary: "Marcus wants 15% standing. Policy ceiling is 10%.", outcome: "Escalated to Maya for a decision." },
  { n: 725, title: "Pricing decision with Maya", kind: "meeting", status: "open", start: "2026-11-17T15:00:00.000Z", minutes: 30, dealId: "nl-deals-721", owner: "Maya Chen",
    summary: "Decide whether the 15% trade discount is approved." },
  { n: 726, title: "Finish sample sent", kind: "note", status: "done", start: "2026-10-24T16:20:00.000Z", dealId: "nl-deals-722", contactId: "nl-contacts-720", owner: "Priya Shah",
    summary: "Brushed and antique brass samples left with Imogen." },
  { n: 727, title: "Site visit, Kemble Mews", kind: "meeting", status: "open", start: "2026-11-19T10:00:00.000Z", minutes: 60, dealId: "nl-deals-723", contactId: "nl-contacts-728", owner: "Priya Shah",
    summary: "Needed before the rewire can be priced." },
  { n: 728, title: "Show flat requirements", kind: "call", status: "done", start: "2026-10-10T09:30:00.000Z", minutes: 40, dealId: "nl-deals-724", contactId: "nl-contacts-727", owner: "Priya Shah",
    summary: "Nine rooms, December launch, budget confirmed verbally.", outcome: "Asked for written confirmation; still outstanding." },
  { n: 729, title: "Freight and lead time", kind: "email", status: "done", start: "2026-11-04T08:15:00.000Z", dealId: "nl-deals-725", contactId: "nl-contacts-724", owner: "Priya Shah",
    summary: "Three weeks from order, freight at cost.", outcome: "Ingrid accepted Q-121." },
  { n: 730, title: "Retainer outcome", kind: "note", status: "done", start: "2026-09-12T17:00:00.000Z", dealId: "nl-deals-726", contactId: "nl-contacts-722", owner: "Priya Shah",
    summary: "Lost on price. Rosa stayed with a London supplier for the retainer only." },
  { n: 731, title: "Chase INV-1042", kind: "call", status: "done", start: "2026-11-06T11:00:00.000Z", contactId: "nl-contacts-722", owner: "Jonah Adeyemi",
    summary: "Second chase on the shade invoice.", outcome: "Payment promised for the week of 17 November." },
  { n: 732, title: "Trustee call", kind: "call", status: "done", start: "2026-10-29T13:00:00.000Z", dealId: "nl-deals-727", contactId: "nl-contacts-726", owner: "Maya Chen",
    summary: "Exempt supply confirmed with the hall's own adviser." },
  { n: 733, title: "Reverse charge check", kind: "task", status: "open", start: "2026-11-16T09:00:00.000Z", dealId: "nl-deals-728", contactId: "nl-contacts-725", owner: "Jonah Adeyemi",
    summary: "One line on Q-128 has no approved rate. Confirm before anything is sent." },
  { n: 734, title: "Showroom collection", kind: "note", status: "done", start: "2026-11-11T15:40:00.000Z", contactId: "nl-contacts-729", owner: "Priya Shah",
    summary: "Owen collected two shades. No tax status captured at the counter." },
  { n: 735, title: "Weekly pipeline review", kind: "meeting", status: "open", start: "2026-11-16T09:30:00.000Z", minutes: 45, owner: "Priya Shah",
    summary: "Stage movement, stalled deals and the December forecast." },
];

interface LeadSpec {
  n: number;
  title: string;
  status: string;
  amount: number;
  source: string;
  contactId?: string;
  companyId?: string;
  owner?: string;
  summary: string;
  createdAt: string;
  disqualifiedReason?: string;
}

const LEADS: LeadSpec[] = [
  { n: 720, title: "Bermondsey show flat", status: "qualified", amount: 310_000, source: "referral", contactId: "nl-contacts-727", companyId: "nl-companies-727", owner: "Priya Shah",
    summary: "Referred by Fitzrovia House. Converted to a deal.", createdAt: "2026-10-09T08:00:00.000Z" },
  { n: 721, title: "Kemble Mews rewire", status: "qualified", amount: 95_000, source: "showroom", contactId: "nl-contacts-728", companyId: "nl-companies-728", owner: "Priya Shah",
    summary: "Walked in on a Saturday. Converted to a deal.", createdAt: "2026-11-05T15:10:00.000Z" },
  { n: 722, title: "Dublin reseller enquiry", status: "new", amount: 336_000, source: "website", contactId: "nl-contacts-725", companyId: "nl-companies-725",
    summary: "No owner assigned yet. No marketing consent recorded, so follow-up must be manual.", createdAt: "2026-11-02T09:50:00.000Z" },
  { n: 723, title: "Hotel group, four sites", status: "new", amount: 1_200_000, source: "referral", owner: "Priya Shah",
    summary: "Referred by Daniel Okafor. No contact record created yet.", createdAt: "2026-11-13T16:30:00.000Z" },
  { n: 724, title: "Interior stylist, one pendant", status: "disqualified", amount: 3_000, source: "website",
    summary: "Single retail pendant below the trade minimum.", createdAt: "2026-11-07T12:00:00.000Z", disqualifiedReason: "Below the trade minimum" },
  { n: 725, title: "Anonymous price request", status: "disqualified", amount: 0, source: "website",
    summary: "No company, no contact details and no budget. Nothing to qualify.", createdAt: "2026-11-10T07:20:00.000Z", disqualifiedReason: "No contactable detail" },
  { n: 726, title: "Trade fair card, Birmingham", status: "new", amount: 180_000, source: "event", owner: "Priya Shah",
    summary: "Card collected at the fair. Needs a contact record and consent before any outreach.", createdAt: "2026-11-12T18:00:00.000Z" },
];

function quoteTotals(spec: QuoteSpec) {
  return computeInvoice({
    lines: spec.lines.map((line, index) => ({ id: `l${index + 1}`, ...line })),
    jurisdiction: "GB",
    customerStatus: spec.customerStatus,
    date: spec.at,
  });
}

registerSeed("crm", (context) => {
  const records: Rec[] = [];
  const push = (input: SeedRecordInput) => records.push(context.rec(input));

  for (const company of COMPANIES) {
    push({
      org: "nl", collection: "companies", n: company.n, title: company.title, status: company.status,
      summary: company.summary, owner: company.owner, createdAt: `${company.since}T09:00:00.000Z`,
      fields: { industry: company.industry, owner: company.owner, city: company.city, customerSince: company.since },
    });
  }

  for (const contact of CONTACTS) {
    const fields: Record<string, string | number | boolean> = {
      email: contact.email, phone: contact.phone, role: contact.role, owner: contact.owner,
    };
    if (contact.companyId) fields.companyId = contact.companyId;
    if (contact.consent) fields.consent = contact.consent;
    if (contact.suppressed) fields.suppressed = true;
    if (contact.taxStatus) fields.taxStatus = contact.taxStatus;
    if (contact.restricted) fields.restrictedNote = contact.restricted;
    push({
      org: "nl", collection: "contacts", n: contact.n, title: contact.title, status: contact.status ?? "active",
      summary: contact.summary, owner: contact.owner, fields,
      tags: contact.suppressed ? ["customer", "suppressed"] : ["customer"],
    });
  }

  push({
    org: "hb", collection: "contacts", n: 720, title: "Dana Whitfield", status: "active",
    summary: "Buys stainless fittings for resale. Exemption certificate on file.", owner: "Elena Ward",
    fields: { email: "dana@whitfieldmarine.example", phone: "+1 718 555 0144", role: "Owner", taxStatus: "domestic_exempt" },
    tags: ["customer"],
  });

  for (const deal of DEALS) {
    const fields: Record<string, string | number | boolean> = {
      stage: deal.stage, contactId: deal.contactId, companyId: deal.companyId, owner: deal.owner,
      probability: deal.probability ?? 0,
    };
    if (deal.closeDate) fields.closeDate = deal.closeDate;
    if (deal.budgetConfirmed) fields.budgetConfirmed = true;
    if (deal.quoteId) fields.quoteId = deal.quoteId;
    if (deal.invoiceId) fields.invoiceId = deal.invoiceId;
    if (deal.lostReason) fields.lostReason = deal.lostReason;
    if (deal.campaignId) fields.campaignId = deal.campaignId;
    push({
      org: "nl", collection: "deals", n: deal.n, title: deal.title, status: deal.stage, summary: deal.summary,
      amountMinor: deal.amount, owner: deal.owner, createdAt: deal.createdAt,
      dueAt: deal.closeDate ? `${deal.closeDate}T00:00:00.000Z` : undefined,
      parentId: deal.companyId, fields,
    });
  }

  for (const quote of QUOTES) {
    const totals = quoteTotals(quote);
    const fields: Record<string, string | number | boolean> = {
      number: quote.number, dealId: quote.dealId, contactId: quote.contactId, version: quote.version,
      netMinor: totals.netMinor, taxMinor: totals.taxMinor, customerTaxStatus: quote.customerStatus,
    };
    if (totals.hasUnknownRate) fields.taxUnresolved = true;
    if (quote.approvedBy) fields.approvedBy = quote.approvedBy;
    if (quote.discountApproval) fields.discountApproval = quote.discountApproval;
    push({
      org: "nl", collection: "quotes", n: quote.n, title: `${quote.number} ${quote.summary.split(".")[0]}`,
      status: quote.status, summary: quote.summary, amountMinor: totals.netMinor + totals.taxMinor,
      at: `${quote.at}T09:00:00.000Z`, dueAt: `${quote.expires}T00:00:00.000Z`, createdAt: `${quote.at}T08:30:00.000Z`,
      owner: "Priya Shah", parentId: quote.dealId, fields,
      body: { lines: quote.lines.map((line, index) => ({ id: `l${index + 1}`, ...line })) },
    });
  }

  for (const activity of ACTIVITIES) {
    const fields: Record<string, string | number | boolean> = { kind: activity.kind, owner: activity.owner };
    if (activity.dealId) fields.dealId = activity.dealId;
    if (activity.contactId) fields.contactId = activity.contactId;
    if (activity.outcome) fields.outcome = activity.outcome;
    if (activity.delivery) fields.delivery = activity.delivery;
    if (activity.minutes) fields.minutes = activity.minutes;
    push({
      org: "nl", collection: "activities", n: activity.n, title: activity.title, status: activity.status,
      summary: activity.summary, owner: activity.owner,
      startAt: activity.start,
      endAt: activity.minutes ? new Date(new Date(activity.start).getTime() + activity.minutes * 60_000).toISOString() : undefined,
      at: activity.start, createdAt: activity.start,
      parentId: activity.dealId ?? activity.contactId, fields,
    });
  }

  for (const lead of LEADS) {
    const fields: Record<string, string | number | boolean> = { source: lead.source, stage: lead.status };
    if (lead.contactId) fields.contactId = lead.contactId;
    if (lead.companyId) fields.companyId = lead.companyId;
    if (lead.owner) fields.owner = lead.owner;
    if (lead.disqualifiedReason) fields.disqualifiedReason = lead.disqualifiedReason;
    push({
      org: "nl", collection: "leads", n: lead.n, title: lead.title, status: lead.status, summary: lead.summary,
      amountMinor: lead.amount, owner: lead.owner ?? "Priya Shah", createdAt: lead.createdAt, at: lead.createdAt, fields,
    });
  }

  /* Automation ---------------------------------------------------- */
  push({
    org: "nl", collection: "workflows", n: 720, title: "Route new website leads", status: "active",
    summary: "A new lead from the website is assigned to the commercial lead and a qualification task is created.",
    owner: "Priya Shah",
    fields: { trigger: "lead.created", scope: "source = website", runs: 14, lastRunAt: "2026-11-13T16:30:00.000Z" },
    body: {
      nodes: [
        { id: "n1", type: "trigger", label: "Lead created", x: 40, y: 80 },
        { id: "n2", type: "condition", label: "Source is website", x: 220, y: 80 },
        { id: "n3", type: "action", label: "Assign to Priya Shah", x: 420, y: 40 },
        { id: "n4", type: "action", label: "Create qualification task", x: 420, y: 140 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }],
    },
  });
  push({
    org: "nl", collection: "workflows", n: 721, title: "Stalled deal nudge", status: "active",
    summary: "A deal with no activity for ten days raises a follow-up task for its owner. It never contacts the customer.",
    owner: "Priya Shah",
    fields: { trigger: "deal.idle", scope: "open stages only", runs: 6, lastRunAt: "2026-11-12T07:00:00.000Z" },
    body: {
      nodes: [
        { id: "n1", type: "trigger", label: "Deal idle 10 days", x: 40, y: 80 },
        { id: "n2", type: "condition", label: "Stage is open", x: 220, y: 80 },
        { id: "n3", type: "action", label: "Create follow-up task", x: 420, y: 80 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
    },
  });
  push({
    org: "nl", collection: "workflows", n: 722, title: "Quote accepted handover", status: "draft",
    summary: "When a quote is accepted, draft the invoice and tell Finance. Held in draft until the invoice numbering is agreed.",
    owner: "Jonah Adeyemi",
    fields: { trigger: "quote.accepted", scope: "all quotes", runs: 0 },
    body: {
      nodes: [
        { id: "n1", type: "trigger", label: "Quote accepted", x: 40, y: 80 },
        { id: "n2", type: "action", label: "Draft invoice from quote", x: 240, y: 80 },
        { id: "n3", type: "approval", label: "Finance confirms", x: 440, y: 80 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
    },
  });
  push({
    org: "nl", collection: "workflowRuns", n: 720, title: "Run · Dublin reseller enquiry", status: "succeeded",
    summary: "Lead routed to Priya Shah and a qualification task created.", parentId: "nl-workflows-720",
    at: "2026-11-02T09:50:04.000Z", owner: "Priya Shah",
    fields: { workflowId: "nl-workflows-720", recordId: "nl-leads-722", capability: "ready_local", durationMs: 42 },
  });
  push({
    org: "nl", collection: "workflowRuns", n: 721, title: "Run · Trade fair card", status: "failed",
    summary: "No contact record exists for the lead, so the assignment step had nothing to write to.",
    parentId: "nl-workflows-720", at: "2026-11-12T18:00:02.000Z", owner: "Priya Shah",
    fields: { workflowId: "nl-workflows-720", recordId: "nl-leads-726", capability: "failed", error: "Lead has no contactId", durationMs: 18 },
  });
  push({
    org: "nl", collection: "workflowRuns", n: 722, title: "Run · Hartley show flat nudge", status: "succeeded",
    summary: "Follow-up task raised for Priya Shah after ten quiet days.", parentId: "nl-workflows-721",
    at: "2026-11-12T07:00:01.000Z", owner: "Priya Shah",
    fields: { workflowId: "nl-workflows-721", recordId: "nl-deals-724", capability: "ready_local", durationMs: 27 },
  });
  push({
    org: "nl", collection: "workflowRuns", n: 723, title: "Run · Linden Row list import", status: "blocked",
    summary: "Hugh Tierney is suppressed, so no outreach step ran. The run stopped and recorded why.",
    parentId: "nl-workflows-720", at: "2026-11-11T09:14:00.000Z", owner: "Priya Shah",
    fields: { workflowId: "nl-workflows-720", recordId: "nl-contacts-730", capability: "blocked", error: "Contact is suppressed", durationMs: 9 },
  });
  push({
    org: "nl", collection: "templates", n: 720, title: "Qualification call template", status: "active",
    summary: "Five questions used on a first call: rooms, budget, decision, timing, who else is quoting.",
    owner: "Priya Shah", fields: { kind: "activity", channel: "call" },
  });
  push({
    org: "nl", collection: "templates", n: 721, title: "Quote cover note", status: "active",
    summary: "Local draft wording that goes out with a quote once a mailbox is connected.",
    owner: "Priya Shah", fields: { kind: "email", channel: "email", delivery: "not_connected" },
  });

  return { records };
});
