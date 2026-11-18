import type { Rec } from "@/domain/types";

/**
 * Receivables collections, worked by customer rather than by invoice: what
 * each customer owes, how late, what was last done about it and whether a
 * promise to pay is still good. Figures use what is still outstanding on each
 * invoice, not its gross, so a part-paid invoice is chased for the balance.
 */

export const COLLECTION_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

export interface PromiseToPay {
  invoiceId: string;
  invoiceTitle: string;
  date: string;
  amountMinor: number;
  by: string;
  note: string;
  /** The promised amount has been paid since the promise was made. */
  kept: boolean;
  /** The promised date has passed and less than the promised amount has been paid since the promise. */
  broken: boolean;
}

export interface CustomerCollection {
  customerId: string;
  name: string;
  email: string;
  invoices: Rec[];
  overdue: Rec[];
  outstandingMinor: number;
  overdueMinor: number;
  /** Outstanding by bucket, in COLLECTION_BUCKETS order. */
  bucketsMinor: number[];
  oldestDays: number;
  lastReminderAt?: string;
  reminderCount: number;
  promises: PromiseToPay[];
  nextAction: string;
}

const OPEN = ["awaiting_payment", "part_paid"];
const DAY = 86_400_000;

export function invoiceBalance(invoice: Rec): number {
  if (!OPEN.includes(invoice.status)) return 0;
  return Math.max(0, Number(invoice.amountMinor ?? 0) - Number(invoice.fields.paidMinor ?? 0));
}

export function daysLate(invoice: Rec, now: Date): number {
  if (!invoice.dueAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(invoice.dueAt).getTime()) / DAY));
}

export function bucketIndex(days: number): number {
  return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
}

export function promiseOf(invoice: Rec, now: Date): PromiseToPay | undefined {
  const date = String(invoice.fields.promiseDate ?? "");
  if (!date) return undefined;
  const balance = invoiceBalance(invoice);
  const amountMinor = Number(invoice.fields.promiseMinor ?? balance);
  const past = `${date}T23:59:59.999Z` < now.toISOString();
  const kept = promiseKept(invoice, balance, amountMinor);
  return {
    invoiceId: invoice.id,
    invoiceTitle: invoice.title,
    date,
    amountMinor,
    by: String(invoice.fields.promiseBy ?? ""),
    note: String(invoice.fields.promiseNote ?? ""),
    kept,
    broken: past && !kept,
  };
}

/**
 * A promise is kept once the customer has paid what they promised since it
 * was made. With the balance recorded at promise time that is measured
 * directly, so a promise for part of the balance is kept when that part
 * arrives. An older promise without the stored balance is kept only when
 * nothing is left owed.
 */
function promiseKept(invoice: Rec, balance: number, amountMinor: number): boolean {
  const stored = invoice.fields.promiseBalanceMinor;
  if (stored === undefined || stored === "" || !Number.isFinite(Number(stored))) return balance <= 0;
  return Number(stored) - balance >= amountMinor;
}

export function collectionsWorklist(invoices: Rec[], contacts: Rec[], now: Date): CustomerCollection[] {
  const groups = new Map<string, Rec[]>();
  for (const invoice of invoices) {
    if (invoiceBalance(invoice) <= 0) continue;
    const key = String(invoice.fields.contactId ?? invoice.parentId ?? "") || `unlinked:${invoice.id}`;
    groups.set(key, [...(groups.get(key) ?? []), invoice]);
  }
  const out: CustomerCollection[] = [];
  for (const [key, rows] of groups) {
    const contact = contacts.find((item) => item.id === key);
    const bucketsMinor = COLLECTION_BUCKETS.map(() => 0);
    let oldestDays = 0;
    for (const invoice of rows) {
      const days = daysLate(invoice, now);
      bucketsMinor[bucketIndex(days)] += invoiceBalance(invoice);
      oldestDays = Math.max(oldestDays, days);
    }
    const overdue = rows.filter((invoice) => daysLate(invoice, now) > 0);
    const reminders = rows.map((invoice) => String(invoice.fields.lastReminderAt ?? "")).filter(Boolean).sort();
    const reminderCount = rows.reduce((sum, invoice) => sum + Number(invoice.fields.reminderCount ?? 0), 0);
    const promises = rows.map((invoice) => promiseOf(invoice, now)).filter((item): item is PromiseToPay => Boolean(item))
      .sort((a, b) => a.date.localeCompare(b.date));
    const overdueMinor = overdue.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0);
    const lastReminderAt = reminders.at(-1);
    const daysSinceReminder = lastReminderAt ? Math.floor((now.getTime() - new Date(lastReminderAt).getTime()) / DAY) : undefined;
    const live = promises.filter((item) => !item.broken && !item.kept);
    let nextAction: string;
    if (promises.some((item) => item.broken)) nextAction = "Promise broken. Call the customer and agree a new date.";
    else if (live.length > 0) nextAction = `Promised for ${live[0].date}. Check the bank on the day.`;
    else if (overdue.length === 0) nextAction = "Nothing late yet. No chase needed.";
    else if (daysSinceReminder === undefined) nextAction = "No reminder yet. Draft the first reminder.";
    else if (daysSinceReminder >= 7 && oldestDays > 30) nextAction = "Reminded and still late. Call and ask for a payment date.";
    else if (daysSinceReminder >= 7) nextAction = "Send a second reminder.";
    else nextAction = `Reminded ${daysSinceReminder === 0 ? "today" : `${daysSinceReminder} day${daysSinceReminder === 1 ? "" : "s"} ago`}. Give it a week.`;
    out.push({
      customerId: key,
      name: contact?.title ?? rows[0].title,
      email: String(contact?.fields.email ?? ""),
      invoices: rows,
      overdue,
      outstandingMinor: rows.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0),
      overdueMinor,
      bucketsMinor,
      oldestDays,
      lastReminderAt,
      reminderCount,
      promises,
      nextAction,
    });
  }
  return out.sort((a, b) => b.overdueMinor - a.overdueMinor || b.oldestDays - a.oldestDays || b.outstandingMinor - a.outstandingMinor);
}
