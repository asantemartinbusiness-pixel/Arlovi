import type { Rec } from "@/domain/types";
import type { CampaignBody } from "./data";

export type MarketingArea = "calendar" | "social" | "email" | "audiences";

export function marketAreaCounts(area: MarketingArea, data: {
  socialPosts: Rec[];
  campaigns: Rec[];
  audiences: Rec[];
  contacts: Rec[];
  templates: Rec[];
}) {
  if (area === "calendar") return [
    { label: "Dated content", count: data.socialPosts.filter(post => Boolean(post.startAt)).length },
    { label: "Queued locally", count: data.socialPosts.filter(post => post.status === "scheduled").length },
    { label: "Failed", count: data.socialPosts.filter(post => post.status === "failed").length },
  ];
  if (area === "social") return [
    { label: "Drafts", count: data.socialPosts.filter(post => post.status === "draft").length },
    { label: "Queued locally", count: data.socialPosts.filter(post => post.status === "scheduled").length },
    { label: "Failed", count: data.socialPosts.filter(post => post.status === "failed").length },
  ];
  if (area === "email") return [
    { label: "Campaign plans", count: data.campaigns.filter(campaign =>
      ((campaign.body as CampaignBody | undefined)?.channels ?? []).some(channel => channel.network === "email")).length },
    { label: "Email templates", count: data.templates.filter(template => String(template.fields.kind) === "email").length },
    { label: "Consent recorded", count: data.contacts.filter(contact =>
      contact.fields.consentEmail === true && contact.fields.suppressed !== true).length },
  ];
  return [
    { label: "Audience segments", count: data.audiences.length },
    { label: "Contacts", count: data.contacts.length },
    { label: "Suppressed", count: data.contacts.filter(contact => contact.fields.suppressed === true).length },
  ];
}
