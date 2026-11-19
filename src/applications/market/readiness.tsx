import type { ReactNode } from "react";
import { Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { bodyOf, evaluateSegment, networkOf, type CampaignBody } from "./data";

/**
 * What a campaign needs before it can be launched, in the order a person
 * checks it: why, who, what, where, how much, when, then the one thing that
 * cannot be satisfied here, the provider boundary. Computed from the campaign
 * record and its linked audience; nothing is assumed.
 */
export interface LaunchRow {
  id: string;
  label: string;
  value: ReactNode;
  state: "ready" | "blocked" | "note";
  detail?: string;
}

export function launchRows(context: ScreenContext, campaign: Rec, audience: Rec | undefined, contacts: Rec[], now: Date): LaunchRow[] {
  const body = bodyOf<CampaignBody>(campaign, {});
  const channels = body.channels ?? [];
  const creatives = body.creatives ?? [];
  const approvedCreative = creatives.filter((creative) => creative.status === "approved").length;
  const reach = evaluateSegment(audience, contacts, now);
  const budget = Number(campaign.fields.budgetMinor ?? campaign.amountMinor ?? 0);
  const committed = channels.reduce((sum, channel) => sum + channel.spentMinor, 0);
  const objective = String(campaign.fields.objective ?? "").trim();
  return [
    { id: "objective", label: "Objective", state: objective ? "ready" : "blocked", value: objective || "Not set" },
    {
      id: "audience", label: "Audience", state: audience && reach.members.length > 0 ? "ready" : "blocked",
      value: audience ? audience.title : "No audience linked",
      detail: audience ? `${reach.members.length} eligible, ${reach.excluded.length} held back` : undefined,
    },
    {
      id: "creative", label: "Creative", state: creatives.length > 0 && approvedCreative === creatives.length ? "ready" : "blocked",
      value: creatives.length === 0 ? "None attached" : `${approvedCreative} of ${creatives.length} approved`,
    },
    {
      id: "channel", label: "Channel", state: channels.length > 0 ? "ready" : "blocked",
      value: channels.length ? channels.map((channel) => networkOf(channel.network).label).join(", ") : "None planned",
      detail: channels.length ? "No account connected" : undefined,
    },
    {
      id: "budget", label: "Budget", state: budget > 0 ? "ready" : "blocked",
      value: <span className="ds-num">{context.money(budget)}</span>,
      detail: `${context.money(committed)} committed in this workspace`,
    },
    {
      id: "schedule", label: "Schedule", state: campaign.startAt && campaign.endAt ? "ready" : "blocked",
      value: campaign.startAt && campaign.endAt ? <span className="ds-num">{context.date(campaign.startAt)} to {context.date(campaign.endAt)}</span> : "Not scheduled",
    },
    {
      id: "approval", label: "Plan approval", state: String(campaign.fields.approval) === "approved" ? "ready" : "blocked",
      value: String(campaign.fields.approval ?? "draft").replaceAll("_", " "),
    },
    {
      id: "boundary", label: "Publish boundary", state: "note",
      value: "Nothing is published", detail: "No advertising or mail provider is connected",
    },
  ];
}

/** True when the launch can be recorded here: an approved plan and approved creative. */
export function launchBlocked(campaign: Rec): boolean {
  const body = bodyOf<CampaignBody>(campaign, {});
  const creatives = body.creatives ?? [];
  const approvalReady = String(campaign.fields.approval) === "approved";
  const creativeReady = creatives.length > 0 && creatives.every((creative) => creative.status === "approved");
  return !approvalReady || !creativeReady;
}

export function LaunchChecklist({ rows }: { rows: LaunchRow[] }) {
  return (
    <ol className="mk-launch" aria-label="Launch checklist">
      {rows.map((row, index) => (
        <li key={row.id} className="mk-launch-row" data-state={row.state}>
          <span className="mk-launch-n" aria-hidden="true">{index + 1}</span>
          <span className="mk-launch-label">{row.label}</span>
          <span className="mk-launch-value">{row.value}{row.detail && <small>{row.detail}</small>}</span>
          <span className="mk-launch-state">
            {row.state === "ready" && <Pill tone="success" dot>Ready</Pill>}
            {row.state === "blocked" && <Pill tone="danger" dot>Needs attention</Pill>}
            {row.state === "note" && <Pill tone="warning" dot>Not connected</Pill>}
          </span>
        </li>
      ))}
    </ol>
  );
}

