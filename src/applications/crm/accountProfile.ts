import type { Rec } from "@/domain/types";
import { ACTIVITY_LABEL, activityKind, probabilityOf, stageOf } from "@/domain/crm-pipeline";

/**
 * Everything an account manager needs about one company, derived from the
 * records already in the workspace: who we know, what is in the pipeline, what
 * Finance has invoiced and is still owed, what was said and what is due next.
 * Pure, so the figures on the account page are testable without a browser.
 */

export interface AccountInputs {
  company: Rec;
  contacts: Rec[];
  deals: Rec[];
  leads: Rec[];
  quotes: Rec[];
  invoices: Rec[];
  activities: Rec[];
  now: Date;
}

export type TimelineGroup = "conversation" | "pipeline" | "finance";

export interface TimelineEntry {
  id: string;
  at: string;
  group: TimelineGroup;
  kind: string;
  title: string;
  detail: string;
  /** Route below /o/:org/ for the record, when it has a screen of its own. */
  href?: string;
  status?: string;
}

export type ChainStep = "lead" | "deal" | "quote" | "accepted" | "invoiced" | "paid" | "lost";

export interface DealChain {
  deal: Rec;
  lead?: Rec;
  quotes: Rec[];
  acceptedQuote?: Rec;
  invoices: Rec[];
  step: ChainStep;
  /** The next thing that has to happen for the money to arrive, in plain words. */
  next: string;
}

export interface AccountProfile {
  contacts: Rec[];
  deals: Rec[];
  openDeals: Rec[];
  quotes: Rec[];
  invoices: Rec[];
  activities: Rec[];
  openMinor: number;
  weightedMinor: number;
  wonMinor: number;
  /** Gross of invoices Finance has issued (not drafts, not voided). */
  invoicedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueInvoices: Rec[];
  lastTouchAt?: string;
  daysSinceTouch?: number;
  openTasks: Rec[];
  overdueTasks: Rec[];
  chains: DealChain[];
  timeline: TimelineEntry[];
  risks: string[];
}

const ISSUED = ["awaiting_payment", "part_paid", "paid"];
const OPEN_INVOICE = ["awaiting_payment", "part_paid"];
const DAY = 86_400_000;

function whenOf(record: Rec): string {
  return record.startAt ?? record.at ?? record.createdAt;
}

export function invoiceOutstanding(invoice: Rec): number {
  if (!OPEN_INVOICE.includes(invoice.status)) return 0;
  return Math.max(0, Number(invoice.amountMinor ?? 0) - Number(invoice.fields.paidMinor ?? 0));
}

function unique(records: Rec[]): Rec[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

/** Records belonging to one company: by direct company link, or through its contacts and deals. */
export function accountRecords(input: AccountInputs): {
  contacts: Rec[]; deals: Rec[]; quotes: Rec[]; invoices: Rec[]; activities: Rec[]; leads: Rec[];
} {
  const companyId = input.company.id;
  const contacts = input.contacts.filter((contact) => String(contact.fields.companyId ?? "") === companyId);
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const deals = input.deals.filter((deal) => String(deal.fields.companyId ?? deal.parentId ?? "") === companyId);
  const dealIds = new Set(deals.map((deal) => deal.id));
  const quotes = input.quotes.filter((quote) => dealIds.has(String(quote.fields.dealId ?? quote.parentId ?? "")));
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const invoices = unique(input.invoices.filter((invoice) =>
    String(invoice.fields.companyId ?? "") === companyId
    || dealIds.has(String(invoice.fields.dealId ?? ""))
    || deals.some((deal) => String(deal.fields.invoiceId ?? "") === invoice.id)
    || quoteIds.has(String(invoice.fields.quoteId ?? ""))
    || contactIds.has(String(invoice.fields.contactId ?? invoice.parentId ?? ""))));
  const linked = new Set([companyId, ...contactIds, ...dealIds]);
  const activities = input.activities.filter((activity) =>
    linked.has(String(activity.parentId ?? ""))
    || linked.has(String(activity.fields.companyId ?? ""))
    || linked.has(String(activity.fields.dealId ?? ""))
    || linked.has(String(activity.fields.contactId ?? "")));
  const leadIds = new Set(deals.map((deal) => String(deal.fields.leadId ?? "")).filter(Boolean));
  const leads = input.leads.filter((lead) => leadIds.has(lead.id) || String(lead.fields.companyId ?? "") === companyId);
  return { contacts, deals, quotes, invoices, activities, leads };
}

export function dealChain(deal: Rec, quotes: Rec[], invoices: Rec[], leads: Rec[]): DealChain {
  const own = quotes.filter((quote) => String(quote.fields.dealId ?? quote.parentId ?? "") === deal.id);
  const acceptedQuote = own.find((quote) => quote.status === "accepted");
  const billed = invoices.filter((invoice) =>
    String(invoice.fields.dealId ?? "") === deal.id || String(deal.fields.invoiceId ?? "") === invoice.id
    || (acceptedQuote !== undefined && String(invoice.fields.quoteId ?? "") === acceptedQuote.id));
  const lead = leads.find((item) => item.id === String(deal.fields.leadId ?? ""));
  const stage = stageOf(deal);
  const live = billed.filter((invoice) => invoice.status !== "void");
  const issued = live.filter((invoice) => ISSUED.includes(invoice.status));
  let step: ChainStep;
  let next: string;
  if (stage.kind === "lost") {
    step = "lost";
    next = "Closed lost. Nothing further is expected.";
  } else if (issued.length > 0 && issued.every((invoice) => invoice.status === "paid")) {
    step = "paid";
    next = "Paid in full. Nothing is owed on this deal.";
  } else if (issued.length > 0) {
    step = "invoiced";
    next = "Issued by Finance. Waiting for the customer's payment.";
  } else if (live.length > 0) {
    step = "invoiced";
    next = "A draft invoice exists. Finance must approve and post it before it is owed.";
  } else if (acceptedQuote) {
    step = "accepted";
    next = stage.kind === "won" ? "Won, but no invoice has been drafted yet." : "Quote accepted. Close the deal as won to draft the invoice.";
  } else if (own.length > 0) {
    step = "quote";
    next = own.some((quote) => quote.status === "sent") ? "Quote sent. Record the customer's acceptance when it arrives." : "Quote in preparation. Approve and send it.";
  } else {
    step = "deal";
    next = stage.kind === "won" ? "Won without a quote. Draft the invoice from the deal." : "No quote yet. Price the deal to move it forward.";
  }
  return { deal, lead, quotes: own, acceptedQuote, invoices: live, step, next };
}

export function accountProfile(input: AccountInputs): AccountProfile {
  const records = accountRecords(input);
  const nowMs = input.now.getTime();
  const openDeals = records.deals.filter((deal) => stageOf(deal).kind === "open");
  const openMinor = openDeals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0);
  const weightedMinor = openDeals.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0);
  const wonMinor = records.deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0);
  const issued = records.invoices.filter((invoice) => ISSUED.includes(invoice.status));
  const invoicedMinor = issued.reduce((sum, invoice) => sum + Number(invoice.amountMinor ?? 0), 0);
  const outstandingMinor = issued.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0);
  const overdueInvoices = issued.filter((invoice) => invoiceOutstanding(invoice) > 0 && invoice.dueAt && new Date(invoice.dueAt).getTime() < nowMs);
  const overdueMinor = overdueInvoices.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0);

  const done = records.activities.filter((activity) => activity.status !== "open" && whenOf(activity) <= input.now.toISOString());
  const lastTouchAt = done.map(whenOf).sort().at(-1);
  const daysSinceTouch = lastTouchAt ? Math.max(0, Math.floor((nowMs - new Date(lastTouchAt).getTime()) / DAY)) : undefined;
  const openTasks = records.activities.filter((activity) => activity.status === "open")
    .sort((a, b) => (a.dueAt ?? whenOf(a)).localeCompare(b.dueAt ?? whenOf(b)));
  const overdueTasks = openTasks.filter((task) => new Date(task.dueAt ?? whenOf(task)).getTime() < nowMs);

  const chains = records.deals.map((deal) => dealChain(deal, records.quotes, records.invoices, records.leads))
    .sort((a, b) => (b.deal.updatedAt ?? "").localeCompare(a.deal.updatedAt ?? ""));

  const timeline: TimelineEntry[] = [
    ...records.activities.map((activity) => ({
      id: activity.id, at: whenOf(activity), group: "conversation" as const, kind: ACTIVITY_LABEL[activityKind(activity)],
      title: activity.title, detail: String(activity.fields.outcome ?? (activity.summary !== activity.title ? activity.summary : "") ?? ""), status: activity.status,
    })),
    ...records.leads.map((lead) => ({
      id: lead.id, at: lead.createdAt, group: "pipeline" as const, kind: "Lead", title: `Lead: ${lead.title}`,
      detail: lead.summary, href: "crm/leads", status: lead.status,
    })),
    ...records.deals.map((deal) => ({
      id: deal.id, at: deal.createdAt, group: "pipeline" as const, kind: "Deal", title: `Deal opened: ${deal.title}`,
      detail: `Now ${stageOf(deal).label}.`, href: `crm/deals/${deal.id}`, status: stageOf(deal).kind,
    })),
    ...records.quotes.map((quote) => ({
      id: quote.id, at: quote.updatedAt ?? quote.createdAt, group: "pipeline" as const, kind: "Quote", title: `Quote ${quote.title}`,
      detail: `${quote.status.replace(/_/g, " ")}.`, href: `crm/quotes?tab=${quoteTab(quote.status)}`, status: quote.status,
    })),
    ...records.invoices.map((invoice) => ({
      id: invoice.id, at: invoice.at ?? invoice.createdAt, group: "finance" as const, kind: "Invoice", title: `Invoice ${invoice.title}`,
      detail: `${invoice.status.replace(/_/g, " ")}.`, href: `fin/invoices/${invoice.id}`, status: invoice.status,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const risks: string[] = [];
  if (records.contacts.length === 0) risks.push("No contact is recorded at this account.");
  else if (records.contacts.length === 1) risks.push(`Single-threaded: everything depends on ${records.contacts[0].title}.`);
  if (daysSinceTouch === undefined && records.deals.length > 0) risks.push("No completed conversation is logged against this account.");
  else if (daysSinceTouch !== undefined && daysSinceTouch > 30 && openDeals.length > 0) risks.push(`No conversation for ${daysSinceTouch} days while ${openDeals.length} deal${openDeals.length === 1 ? " is" : "s are"} open.`);
  if (overdueInvoices.length > 0) risks.push(`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} past due.`);
  const unplanned = openDeals.filter((deal) => !openTasks.some((task) => String(task.fields.dealId ?? task.parentId ?? "") === deal.id));
  if (unplanned.length > 0) risks.push(`${unplanned.length} open deal${unplanned.length === 1 ? " has" : "s have"} no follow-up planned.`);
  if (overdueTasks.length > 0) risks.push(`${overdueTasks.length} follow-up${overdueTasks.length === 1 ? " is" : "s are"} overdue.`);

  return {
    contacts: records.contacts, deals: records.deals, openDeals, quotes: records.quotes, invoices: records.invoices,
    activities: records.activities, openMinor, weightedMinor, wonMinor, invoicedMinor, outstandingMinor, overdueMinor,
    overdueInvoices, lastTouchAt, daysSinceTouch, openTasks, overdueTasks, chains, timeline, risks,
  };
}

function quoteTab(status: string): string {
  if (status === "draft") return "Draft";
  if (status === "review" || status === "approved") return "Review";
  if (status === "sent") return "Sent";
  if (status === "accepted") return "Accepted";
  return "Expired";
}

export const CHAIN_STEPS: { id: Exclude<ChainStep, "lost">; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "deal", label: "Deal" },
  { id: "quote", label: "Quote" },
  { id: "accepted", label: "Accepted" },
  { id: "invoiced", label: "Invoiced" },
  { id: "paid", label: "Paid" },
];
