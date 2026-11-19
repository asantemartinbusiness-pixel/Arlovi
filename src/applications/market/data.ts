import { useLiveQuery } from "dexie-react-hooks";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { listByCollection } from "@/platform/repo";
import type { Rec } from "@/domain/types";

/* ---------------- Record body shapes used by MARKET ---------------- */

export interface ChannelPlan {
  network: string;
  budgetMinor: number;
  spentMinor: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueMinor: number;
}

export interface Creative { id: string; title: string; kind: string; status: string }

export interface Touch { network: string; firstTouch: number; lastTouch: number; assisted: number }

export interface CampaignBody {
  brief?: string;
  channels?: ChannelPlan[];
  creatives?: Creative[];
  touches?: Touch[];
}

export interface PostBody {
  caption?: string;
  media?: { name: string; kind: string }[];
  link?: string;
}

export interface SegmentRule { field: string; op: string; value: string }
export interface AudienceBody { rules?: SegmentRule[]; exclusions?: string[] }

export interface PageBlock { id: string; kind: string; heading?: string; body?: string; productSkus?: string[]; fields?: string[] }
export interface SiteBody {
  blocks?: PageBlock[];
  issues?: { id: string; severity: string; page: string; title: string; detail: string; assignee: string }[];
  keywords?: { term: string; volume: number; position: number; difficulty: number; page: string }[];
  briefs?: { id: string; title: string; stage: string; owner: string; keyword: string }[];
}

export function bodyOf<T>(record: Rec | undefined, fallback: T): T {
  return (record?.body as T | undefined) ?? fallback;
}

export function useMarketData() {
  return useCollections(["campaigns", "socialPosts", "audiences", "templates", "sites", "contacts", "leads", "deals", "orders"]);
}

/** True once the contacts and audiences collections have been read from the database (not merely empty). */
export function useAudienceDataLoaded(): boolean {
  const { org } = useWorkspace();
  const loaded = useLiveQuery(async () => {
    await Promise.all([listByCollection(org.id, "contacts"), listByCollection(org.id, "audiences")]);
    return true;
  }, [org.id]);
  return loaded === true;
}

export const NETWORKS: { id: string; label: string; limit: number; media: string }[] = [
  { id: "instagram", label: "Instagram", limit: 2_200, media: "Square or 4:5 image, or video up to 90s" },
  { id: "facebook", label: "Facebook", limit: 63_206, media: "Any ratio, link preview from the first URL" },
  { id: "linkedin", label: "LinkedIn", limit: 3_000, media: "1.91:1 image or a PDF document post" },
  { id: "x", label: "X", limit: 280, media: "Up to four images, 16:9 preferred" },
];

export function networkOf(id: string) {
  return NETWORKS.find((item) => item.id === id) ?? { id, label: id, limit: 2_200, media: "Unknown provider requirements" };
}

/** Channel roll-up across campaigns, computed from records only. */
export function rollUp(campaigns: Rec[]): ChannelPlan[] {
  const map = new Map<string, ChannelPlan>();
  for (const campaign of campaigns) {
    for (const channel of bodyOf<CampaignBody>(campaign, {}).channels ?? []) {
      const found = map.get(channel.network);
      if (found) {
        found.budgetMinor += channel.budgetMinor;
        found.spentMinor += channel.spentMinor;
        found.impressions += channel.impressions;
        found.clicks += channel.clicks;
        found.conversions += channel.conversions;
        found.revenueMinor += channel.revenueMinor;
      } else {
        map.set(channel.network, { ...channel });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.revenueMinor - a.revenueMinor);
}

/* ---------------- Audience evaluation against workspace contacts ---------------- */

export interface SegmentResult {
  members: Rec[];
  excluded: { contact: Rec; reason: string }[];
  rules: SegmentRule[];
  exclusions: string[];
}

function daysSince(value: unknown, now: Date): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.round((now.getTime() - date.getTime()) / 86_400_000);
}

export function matchesRule(contact: Rec, rule: SegmentRule, now: Date): boolean {
  const fields = contact.fields;
  switch (rule.field) {
    case "segment": return String(fields.segment ?? "") === rule.value;
    case "city": return String(fields.city ?? "") === rule.value;
    case "consentEmail": return String(fields.consentEmail === true) === rule.value;
    case "tag": return contact.tags.includes(rule.value);
    case "spendMinor": {
      const spend = Number(fields.spendMinor ?? 0);
      const target = Number(rule.value);
      return rule.op === "gte" ? spend >= target : rule.op === "lte" ? spend <= target : spend === target;
    }
    case "orderedWithinDays": {
      const since = daysSince(fields.lastOrderAt, now);
      const target = Number(rule.value);
      if (since === undefined) return rule.op === "gt";
      return rule.op === "lte" ? since <= target : rule.op === "gt" ? since > target : since === target;
    }
    case "ordersCount": {
      const count = Number(fields.ordersCount ?? 0);
      const target = Number(rule.value);
      return rule.op === "gte" ? count >= target : rule.op === "lte" ? count <= target : count === target;
    }
    default: return false;
  }
}

export function evaluateSegment(audience: Rec | undefined, contacts: Rec[], now: Date): SegmentResult {
  const body = bodyOf<AudienceBody>(audience, {});
  const rules = body.rules ?? [];
  const exclusions = body.exclusions ?? [];
  const members: Rec[] = [];
  const excluded: { contact: Rec; reason: string }[] = [];
  for (const contact of contacts) {
    if (!rules.every((rule) => matchesRule(contact, rule, now))) continue;
    if (exclusions.includes("suppressed") && contact.fields.suppressed === true) {
      excluded.push({ contact, reason: "On the suppression list" });
      continue;
    }
    if (exclusions.includes("no_marketing_consent") && contact.fields.consentMarketing !== true) {
      excluded.push({ contact, reason: "No marketing consent recorded" });
      continue;
    }
    if (contact.fields.consentEmail !== true && rules.some((rule) => rule.field === "consentEmail")) {
      excluded.push({ contact, reason: "No email consent" });
      continue;
    }
    members.push(contact);
  }
  return { members, excluded, rules, exclusions };
}
