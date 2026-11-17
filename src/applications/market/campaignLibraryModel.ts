import type { Rec } from "@/domain/types";
import type { CampaignBody } from "./data";

export type CampaignLibrarySort = "recent" | "name" | "budget" | "start";
export type CampaignLibraryState = "All" | "Draft" | "Approval" | "Active" | "Completed";

const STATE_MATCH: Record<CampaignLibraryState, readonly string[]> = {
  All: [],
  Draft: ["draft"],
  Approval: ["approval", "approved"],
  Active: ["active"],
  Completed: ["completed", "archived"],
};

export function campaignChannels(record: Rec): string[] {
  const configured = (record.body as CampaignBody | undefined)?.channels ?? [];
  const primary = record.fields.primaryChannel;
  return [...new Set([
    ...configured.map(channel => channel.network).filter(Boolean),
    ...(typeof primary === "string" && primary.length > 0 ? [primary] : []),
  ])];
}

export function campaignStageRows(records: Rec[], state: string): Rec[] {
  const statuses = STATE_MATCH[state as CampaignLibraryState];
  if (!statuses || statuses.length === 0) return records;
  return records.filter(record => statuses.includes(record.status));
}

export function campaignLibraryRows(
  records: Rec[],
  { state, query, channel, sort }: {
    state: string;
    query: string;
    channel: string;
    sort: CampaignLibrarySort;
  },
): Rec[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matched = campaignStageRows(records, state).filter(record => {
    const channels = campaignChannels(record);
    if (channel !== "all" && !channels.includes(channel)) return false;
    if (words.length === 0) return true;
    const searchText = [
      record.title, record.summary, record.ownerName,
      String(record.fields.objective ?? ""), String(record.fields.primaryChannel ?? ""),
      ...channels,
    ].join(" ").toLocaleLowerCase();
    return words.every(word => searchText.includes(word));
  });
  const byName = (a: Rec, b: Rec) => a.title.localeCompare(b.title);
  return [...matched].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "budget") {
      const aBudget = Number(a.fields.budgetMinor ?? a.amountMinor ?? 0);
      const bBudget = Number(b.fields.budgetMinor ?? b.amountMinor ?? 0);
      return bBudget - aBudget || byName(a, b);
    }
    if (sort === "start") {
      // Undated campaigns follow scheduled campaigns rather than appearing first.
      const aTime = a.startAt ? Date.parse(a.startAt) : Number.POSITIVE_INFINITY;
      const bTime = b.startAt ? Date.parse(b.startAt) : Number.POSITIVE_INFINITY;
      return aTime - bTime || byName(a, b);
    }
    return b.updatedAt.localeCompare(a.updatedAt) || byName(a, b);
  });
}

export function campaignPortfolioStats(records: Rec[]) {
  return {
    total: records.length,
    active: records.filter(row => row.status === "active").length,
    awaiting: records.filter(row => row.status === "approval").length,
    drafts: records.filter(row => row.status === "draft").length,
    budgetMinor: records.reduce((sum, row) => sum + Number(row.fields.budgetMinor ?? row.amountMinor ?? 0), 0),
    spentMinor: records.reduce((sum, row) => sum + Number(row.fields.spentMinor ?? 0), 0),
  };
}
