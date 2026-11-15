import { useMemo } from "react";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { forecast, stageOf, type Forecast, type Stage } from "@/domain/crm-pipeline";

const COLLECTIONS = [
  "deals", "contacts", "companies", "leads", "quotes", "activities", "invoices",
  "workflows", "workflowRuns", "campaigns", "tickets", "templates", "emailThreads", "messages", "members", "preferences",
];

export interface CrmData {
  deals: Rec[];
  contacts: Rec[];
  companies: Rec[];
  leads: Rec[];
  quotes: Rec[];
  activities: Rec[];
  invoices: Rec[];
  workflows: Rec[];
  runs: Rec[];
  campaigns: Rec[];
  tickets: Rec[];
  templates: Rec[];
  threads: Rec[];
  messages: Rec[];
  members: Rec[];
  preferences: Rec[];
  forecast: Forecast;
  owners: string[];
}

export function useCrmData(): CrmData {
  const data = useCollections(COLLECTIONS);
  const { org } = useWorkspace();
  void org;
  return useMemo(() => ({
    deals: data.deals,
    // A merged-away contact is kept as evidence but is no longer a live record.
    contacts: data.contacts.filter((contact) => contact.status !== "merged"),
    companies: data.companies,
    leads: data.leads,
    quotes: data.quotes,
    activities: data.activities,
    invoices: data.invoices,
    workflows: data.workflows,
    runs: data.workflowRuns,
    campaigns: data.campaigns,
    tickets: data.tickets,
    templates: data.templates,
    threads: data.emailThreads,
    messages: data.messages,
    members: data.members,
    preferences: data.preferences,
    forecast: forecast(data.deals),
    owners: [...new Set(data.deals.map((deal) => String(deal.fields.owner ?? deal.ownerName)))].sort(),
  }), [data]);
}

export function contactById(data: CrmData, id: string | undefined): Rec | undefined {
  return id ? data.contacts.find((contact) => contact.id === id) : undefined;
}

export function companyById(data: CrmData, id: string | undefined): Rec | undefined {
  return id ? data.companies.find((company) => company.id === id) : undefined;
}

export function contactOfDeal(data: CrmData, deal: Rec | undefined): Rec | undefined {
  return contactById(data, String(deal?.fields.contactId ?? ""));
}

export function companyOfDeal(data: CrmData, deal: Rec | undefined): Rec | undefined {
  return companyById(data, String(deal?.fields.companyId ?? deal?.parentId ?? ""));
}

export function contactsOfCompany(data: CrmData, companyId: string | undefined): Rec[] {
  return companyId ? data.contacts.filter((contact) => String(contact.fields.companyId ?? "") === companyId) : [];
}

export function dealsOfCompany(data: CrmData, companyId: string | undefined): Rec[] {
  return companyId ? data.deals.filter((deal) => String(deal.fields.companyId ?? deal.parentId ?? "") === companyId) : [];
}

export function dealsOfContact(data: CrmData, contactId: string | undefined): Rec[] {
  return contactId ? data.deals.filter((deal) => String(deal.fields.contactId ?? "") === contactId) : [];
}

export function quotesOfDeal(data: CrmData, dealId: string | undefined): Rec[] {
  return dealId ? data.quotes.filter((quote) => String(quote.fields.dealId ?? quote.parentId ?? "") === dealId) : [];
}

export function invoicesOfContact(data: CrmData, contactId: string | undefined): Rec[] {
  return contactId ? data.invoices.filter((invoice) => String(invoice.fields.contactId ?? invoice.parentId ?? "") === contactId) : [];
}

export function invoicesOfDeal(data: CrmData, deal: Rec | undefined): Rec[] {
  if (!deal) return [];
  const direct = String(deal.fields.invoiceId ?? "");
  return data.invoices.filter((invoice) =>
    invoice.id === direct || String(invoice.fields.dealId ?? "") === deal.id);
}

export function ticketsOfContact(data: CrmData, contactId: string | undefined): Rec[] {
  return contactId ? data.tickets.filter((ticket) => String(ticket.fields.contactId ?? "") === contactId) : [];
}

export function stagesWithDeals(data: CrmData): { stage: Stage; deals: Rec[] }[] {
  const byStage = new Map<string, Rec[]>();
  for (const deal of data.deals) {
    const stage = stageOf(deal);
    const found = byStage.get(stage.id);
    if (found) found.push(deal);
    else byStage.set(stage.id, [deal]);
  }
  return data.forecast.byStage.map((entry) => ({ stage: entry.stage, deals: byStage.get(entry.stage.id) ?? [] }));
}
