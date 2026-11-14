import { aging, statements } from "./finance";
import { quantityOnHand } from "./ops";
import type { Rec } from "./types";
import { formatMoney, inOrg } from "./types";

export interface AssistantReply {
  text: string;
  citations: { id: string; title: string }[];
}

export function localAssistantReply(records: Rec[], orgId: string, prompt: string): AssistantReply {
  const text = prompt.toLowerCase();
  const cite = (items: Rec[]) => items.slice(0, 4).map((item) => ({ id: item.id, title: item.title }));
  const money = (minor: number) => formatMoney(minor, records.find((item) => item.id === orgId)?.currency ?? "GBP");

  if (/invoice|receivable|overdue|cash|profit|ledger|revenue/.test(text)) {
    const report = statements(records, orgId);
    const open = inOrg(records, orgId, "invoices").filter((item) => item.status === "awaiting_payment");
    const buckets = aging(records, orgId, "2026-11-14T09:30:00.000Z");
    const aged = buckets.filter((bucket) => bucket.count > 0).map((bucket) => bucket.bucket).join(", ") || "none overdue";
    return {
      text: `From local ledger records: revenue ${money(report.revenue)}, expenses ${money(report.expense)}, net ${money(report.net)}. Cash-account movement is inside the trial balance. ${open.length} invoice${open.length === 1 ? "" : "s"} await payment (${open.map((item) => item.title).join(", ") || "none"}). Aging buckets with items: ${aged}. Books ${report.booksBalance ? "balance" : "do not balance"}.`,
      citations: cite([...open, ...inOrg(records, orgId, "journals").slice(0, 2)]),
    };
  }
  if (/stock|inventory|order|product/.test(text)) {
    const products = inOrg(records, orgId, "products");
    const lines = products.map((product) => `${product.title}: ${quantityOnHand(records, orgId, product.id)} on hand`);
    return {
      text: `From local stock movements: ${lines.join("; ") || "no products"}.`,
      citations: cite(products),
    };
  }
  if (/book|appointment|calendar|showroom/.test(text)) {
    const bookings = inOrg(records, orgId, "bookings").filter((item) => item.status !== "cancelled");
    return {
      text: bookings.length
        ? `From local bookings: ${bookings.map((item) => `${item.title} (${item.status})`).join("; ")}.`
        : "No local bookings are on the calendar.",
      citations: cite(bookings),
    };
  }
  if (/ticket|care|customer|complaint/.test(text)) {
    const tickets = inOrg(records, orgId, "tickets");
    return {
      text: `Open service records: ${tickets.map((item) => `${item.title} is ${item.status}. ${item.summary}`).join(" ")}`,
      citations: cite(tickets),
    };
  }
  const missions = inOrg(records, orgId, "missions");
  return {
    text: `I can work from records in this workspace. I do not have a connected language model, so I will not invent research. Ask about invoices, stock, bookings, or service tickets, or start a mission from the current screen. Active missions: ${missions.map((item) => item.title).join(", ") || "none"}.`,
    citations: cite(missions),
  };
}
