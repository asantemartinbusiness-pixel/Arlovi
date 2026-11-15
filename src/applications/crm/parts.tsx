import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar, Notice, Pill, Row } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { ACTIVITY_LABEL, activityKind, probabilityOf, stageOf } from "@/domain/crm-pipeline";

/* ------------------------------------------------------------------ *
 * CRM presentation pieces. Money stays right-aligned and tabular; a
 * forecast figure is always labelled as a weighted estimate.
 * ------------------------------------------------------------------ */

export function Money({ minor, context, bold }: { minor: number | undefined; context: ScreenContext; bold?: boolean }) {
  if (minor === undefined || minor === null || Number.isNaN(minor)) return <span className="ds-subtle">No value recorded</span>;
  return <span className="ds-num" style={{ fontWeight: bold ? 650 : undefined }}>{context.money(minor)}</span>;
}

export function StagePill({ deal }: { deal: Rec }) {
  const stage = stageOf(deal);
  const tone = stage.kind === "won" ? "success" : stage.kind === "lost" ? "danger" : stage.id === "negotiation" ? "accent" : stage.id === "proposal" ? "info" : "neutral";
  return <Pill tone={tone} dot>{stage.label}</Pill>;
}

export function ProbabilityPill({ deal }: { deal: Rec }) {
  const value = probabilityOf(deal);
  return <Pill tone={value >= 80 ? "success" : value >= 50 ? "info" : "neutral"}>{value}%</Pill>;
}

export function PersonLink({ contact, context }: { contact: Rec | undefined; context: ScreenContext }) {
  if (!contact) return <span className="ds-subtle">No contact linked</span>;
  return (
    <Row gap={2}>
      <Avatar name={contact.title} size="sm" />
      <Link to={`/o/${context.org.slug}/crm/contacts/${contact.id}`} style={{ color: "inherit" }}>{contact.title}</Link>
      {contact.fields.suppressed === true && <Pill tone="danger">Suppressed</Pill>}
    </Row>
  );
}

export function ConsentPill({ contact }: { contact: Rec | undefined }) {
  if (!contact) return null;
  if (contact.fields.suppressed === true) return <Pill tone="danger" dot>Suppressed</Pill>;
  if (contact.fields.consent) return <Pill tone="success" dot>Consent {String(contact.fields.consent)}</Pill>;
  return <Pill tone="warning" dot>No consent recorded</Pill>;
}

export function ActivityPill({ activity }: { activity: Rec }) {
  const kind = activityKind(activity);
  const tone = kind === "call" ? "info" : kind === "meeting" ? "accent" : kind === "email" ? "warning" : "neutral";
  return <Pill tone={tone}>{ACTIVITY_LABEL[kind]}</Pill>;
}

export function CapabilityNotice({ id, title }: { id: string; title?: string }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return (
    <Notice tone={CAPABILITY_TONE[capability.state]} title={title ?? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}`}>
      {capability.note} {capability.localEquivalent}
    </Notice>
  );
}

export function CapabilityPill({ id }: { id: string }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>;
}

export function ForecastNote({ children }: { children: ReactNode }) {
  return <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{children}</p>;
}

export const QUOTE_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger" | "accent"> = {
  draft: "neutral",
  review: "warning",
  sent: "info",
  accepted: "success",
  expired: "danger",
  declined: "danger",
};

export function QuoteStatusPill({ status }: { status: string }) {
  return <Pill tone={QUOTE_STATUS_TONE[status] ?? "neutral"} dot>{status}</Pill>;
}

export function isExpired(quote: Rec, now: Date): boolean {
  return quote.status === "expired" || Boolean(quote.dueAt && new Date(quote.dueAt) < now && quote.status !== "accepted");
}
