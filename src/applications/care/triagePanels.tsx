import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  Button, Card, Field, Notice, Pill, Properties, Row, Segmented, Select, Stack, TextArea,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import type { SlaState } from "./sla";
import {
  RESOLUTION_REASONS, STATUS_LABEL, allowedMoves, deliveryOf, isOpen, type QueueCounts,
} from "./triage";

/* ------------------------------------------------------------------ *
 * Triage surfaces shared by the inbox (ARL-CARE-002) and the case
 * (ARL-CARE-004): the queue bar, delivery state on a message, the
 * triage card, the resolution card and the linked-records card.
 * ------------------------------------------------------------------ */

export type InboxView = "all" | "breaching";
export type InboxSort = "sla" | "newest";

export function QueueBar({ counts, view, sort, onView, onSort, inView }: {
  counts: QueueCounts; view: InboxView; sort: InboxSort; inView: { total: number; breaching: number };
  onView: (view: InboxView) => void; onSort: (sort: InboxSort) => void;
}) {
  return (
    <div className="cr-queuebar">
      <div className="cr-queue-counts" aria-label="Open cases by queue">
        <span><strong className="ds-num">{counts.mine}</strong> mine</span>
        <span><strong className="ds-num">{counts.unassigned}</strong> unassigned</span>
        <span data-tone={counts.breaching ? "danger" : undefined}><strong className="ds-num">{counts.breaching}</strong> breaching or at risk</span>
      </div>
      <Segmented<InboxView>
        label="Show"
        value={view}
        onChange={onView}
        options={[
          { value: "all", label: `All ${inView.total}` },
          { value: "breaching", label: `SLA risk ${inView.breaching}` },
        ]}
      />
      <Segmented<InboxSort>
        label="Order"
        value={sort}
        onChange={onSort}
        options={[{ value: "sla", label: "Most urgent" }, { value: "newest", label: "Newest" }]}
      />
    </div>
  );
}

export function DeliveryPill({ message }: { message: Rec }) {
  const delivery = deliveryOf(message);
  if (delivery === "not_sent") return <Pill tone="warning" dot>Recorded — not sent</Pill>;
  if (delivery === "draft") return <Pill tone="neutral" dot>Draft</Pill>;
  return null;
}

const PRIORITIES = ["low", "normal", "high", "urgent"];

/** Status, owner and priority, changed in place with the move recorded on the case. */
export function TriageCard({ context, ticket, state }: { context: ScreenContext; ticket: Rec; state: SlaState }) {
  const { employees } = useCollections(["employees"]);
  const current = String(ticket.fields.assignee ?? "");
  const staff = [...new Set([...employees.filter((employee) => employee.status !== "alumni").map((employee) => employee.title), context.actor, ...(current ? [current] : [])])].sort((a, b) => a.localeCompare(b));
  const moves = allowedMoves(ticket.status);
  const ref = String(ticket.fields.ref ?? ticket.title);

  async function patch(fields: Record<string, string | number | boolean>, status: string | undefined, event: string, toast: string) {
    const saved = await context.mutate.patch(ticket.id, { ...(status ? { status } : {}), fields: { ...ticket.fields, ...fields } }, { expectRevision: ticket.revision, event });
    if (!saved) return;
    context.toast("Case updated", toast);
  }

  return (
    <Card span={5} eyebrow="TRIAGE" prov="human" title="Triage" subtitle={STATUS_LABEL[ticket.status] ?? ticket.status}>
      <Stack gap={3}>
        <Row gap={3} wrap>
          <Field label="Owner">
            <Select
              aria-label="Case owner"
              value={String(ticket.fields.assignee ?? "")}
              onChange={(event) => void patch({ assignee: event.target.value }, ticket.status === "new" && event.target.value ? "open" : undefined, `${ref} assigned to ${event.target.value || "nobody"} by ${context.actor}`, event.target.value ? `${event.target.value} owns ${ref}.` : `${ref} is unassigned.`)}
            >
              <option value="">Unassigned</option>
              {staff.map((name) => <option key={name}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              aria-label="Case priority"
              value={String(ticket.fields.priority ?? "normal")}
              onChange={(event) => void patch({ priority: event.target.value }, undefined, `${ref} priority changed to ${event.target.value} by ${context.actor}`, `Priority is ${event.target.value}. The SLA clock follows the policy for that priority unless one is pinned.`)}
            >
              {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
            </Select>
          </Field>
        </Row>
        {String(ticket.fields.assignee ?? "") !== context.actor && isOpen(ticket) && (
          <Row gap={2}><Button size="sm" variant="secondary" onClick={() => void patch({ assignee: context.actor }, ticket.status === "new" ? "open" : undefined, `${ref} taken by ${context.actor}`, `You own ${ref}.`)}>Assign to me</Button></Row>
        )}
        {moves.length > 0 && (
          <div className="ds-stack ds-gap-2">
            <span className="ds-subtle">Move to</span>
            <Row gap={2} wrap>
              {moves.map((to) => (
                <Button key={to} size="sm" variant="secondary" onClick={() => void patch({}, to, `${ref} moved from ${ticket.status} to ${to} by ${context.actor}`, to === "waiting" ? "Waiting on the customer. The resolution clock pauses where the policy allows." : `${ref} is ${STATUS_LABEL[to]?.toLowerCase() ?? to}.`)}>
                  {STATUS_LABEL[to] ?? to}
                </Button>
              ))}
            </Row>
          </div>
        )}
        {ticket.fields.escalatedBy && (
          <Notice tone="warning" title="Escalated">Escalated by {String(ticket.fields.escalatedBy)}; the reason is in the internal notes.</Notice>
        )}
        {state.status === "breached" && isOpen(ticket) && (
          <Notice tone="danger" title="Past its target">The {state.which} target has passed. Escalate it or record why it is late in an internal note.</Notice>
        )}
        <Row gap={2}>
          <Button size="sm" variant="outline-danger" onClick={() => context.openOverlay("escalation", { id: ticket.id })} disabled={!isOpen(ticket)}>Escalate</Button>
        </Row>
      </Stack>
    </Card>
  );
}

/** Resolution with a reason; reopening keeps the first resolution on the record. */
export function ResolutionCard({ context, ticket }: { context: ScreenContext; ticket: Rec }) {
  const [reason, setReason] = useState<string>(RESOLUTION_REASONS[0]);
  const [note, setNote] = useState("");
  const ref = String(ticket.fields.ref ?? ticket.title);
  if (ticket.fields.resolvedAt) {
    return (
      <Card span={6} eyebrow="RESOLUTION" prov="human" title="Resolution">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Resolved", value: context.dateTime(String(ticket.fields.resolvedAt)) },
            { label: "By", value: String(ticket.fields.resolvedBy || "Not recorded") },
            { label: "Reason", value: String(ticket.fields.resolutionReason || "Not recorded") },
            ...(ticket.fields.resolutionNote ? [{ label: "Note", value: String(ticket.fields.resolutionNote) }] : []),
          ]} />
          <Row gap={2} wrap>
            <Button variant="secondary" onClick={() => context.openOverlay("internal note")}>Reopen this case</Button>
            {ticket.status === "resolved" && (
              <Button variant="ghost" onClick={async () => {
                const saved = await context.mutate.patch(ticket.id, { status: "closed" }, { expectRevision: ticket.revision, event: `${ref} closed by ${context.actor}` });
                if (!saved) return;
                context.toast("Case closed", "It moves to the archive. Reopening is still possible.");
              }}>Close the case</Button>
            )}
          </Row>
        </Stack>
      </Card>
    );
  }
  return (
    <Card span={6} eyebrow="RESOLUTION" prov="human" title="Resolution">
      <Stack gap={3}>
        <span className="ds-subtle">This case is still open.</span>
        <Field label="Reason">
          <Select aria-label="Resolution reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            {RESOLUTION_REASONS.map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
        <Field label="Resolution note"><TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        <Row gap={2}>
          <Button
            variant="primary"
            onClick={async () => {
              const saved = await context.mutate.patch(ticket.id, {
                status: "resolved",
                fields: { ...ticket.fields, resolvedAt: context.now.toISOString(), resolvedBy: context.actor, assignee: String(ticket.fields.assignee || context.actor), resolutionReason: reason, resolutionNote: note.trim(), replyDraft: "" },
              }, { expectRevision: ticket.revision, event: `${ref} resolved by ${context.actor}: ${reason}` });
              if (!saved) return;
              context.toast("Case resolved", "The record changed and the clock stopped. The customer was not told from here.");
            }}
          >
            Mark resolved
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}

function looselyEqual(a: string, b: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/\b(ltd|limited|sa|llc|inc|plc|co)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const x = clean(a); const y = clean(b);
  return Boolean(x && y) && (x === y || (x.length > 4 && y.startsWith(x)) || (y.length > 4 && x.startsWith(y)));
}

/** What the rest of the workspace holds about this customer: orders, CRM, contracts. */
export function LinkedContextCard({ context, ticket, contact }: { context: ScreenContext; ticket: Rec; contact: Rec | undefined }) {
  const { org } = useWorkspace();
  const data = useCollections(["orders", "companies", "deals", "contracts"]);
  const company = String(contact?.fields.company ?? "");
  const linkedOrder = data.orders.find((order) => order.id === String(ticket.fields.orderId ?? ""));
  const recentOrders = contact ? data.orders.filter((order) => order.parentId === contact.id || String(order.fields.contactId ?? "") === contact.id).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 3) : [];
  const crmCompany = company ? data.companies.find((row) => looselyEqual(row.title, company)) : undefined;
  const deals = crmCompany ? data.deals.filter((deal) => deal.parentId === crmCompany.id).slice(0, 2) : [];
  const contracts = company ? data.contracts.filter((row) => looselyEqual(String(row.fields.counterparty ?? ""), company)).slice(0, 3) : [];
  const nothing = !linkedOrder && recentOrders.length === 0 && !crmCompany && contracts.length === 0;

  return (
    <Card span={6} eyebrow="CONTEXT" prov="human" title="Linked records" subtitle={company || (contact ? "Retail customer" : "No customer linked")} actions={<Button size="sm" variant="secondary" onClick={() => { context.select(ticket.id); context.openOverlay("link record", { id: ticket.id }); }}>Link an order</Button>}>
      <Stack gap={2}>
        {linkedOrder && (
          <Row gap={2}>
            <Link2 size={14} aria-hidden="true" />
            <span className="ds-grow ds-truncate">Order on this case: <strong>{linkedOrder.title}</strong> <span className="ds-subtle">· {linkedOrder.status.replace(/_/g, " ")} · {context.money(linkedOrder.amountMinor)}</span></span>
            <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/commerce/orders/${linkedOrder.id}`)}>Open order</Button>
          </Row>
        )}
        {recentOrders.filter((order) => order.id !== linkedOrder?.id).map((order) => (
          <Row key={order.id} gap={2}>
            <span className="ds-grow ds-truncate ds-subtle">Order {order.title} · {context.date(order.at)} · {order.status.replace(/_/g, " ")}</span>
            <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/commerce/orders/${order.id}`)}>Open</Button>
          </Row>
        ))}
        {crmCompany && (
          <Row gap={2}>
            <Link2 size={14} aria-hidden="true" />
            <span className="ds-grow ds-truncate">CRM account: <strong>{crmCompany.title}</strong>{deals.length ? <span className="ds-subtle"> · {deals.length} {deals.length === 1 ? "deal" : "deals"}</span> : null}</span>
            {deals[0]
              ? <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/deals/${deals[0].id}`)}>Open deal</Button>
              : <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/crm/companies`)}>Companies</Button>}
          </Row>
        )}
        {contracts.map((contract) => (
          <Row key={contract.id} gap={2}>
            <Link2 size={14} aria-hidden="true" />
            <span className="ds-grow ds-truncate">Contract: <strong>{contract.title}</strong> <span className="ds-subtle">· {contract.status.replace(/_/g, " ")}</span></span>
            <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/legal/contracts/${contract.id}`)}>Open contract</Button>
          </Row>
        ))}
        {nothing && <span className="ds-subtle">No order, CRM account or contract matches this customer.</span>}
        {(crmCompany || contracts.length > 0) && <span className="ds-subtle">Matched on the company name recorded on the customer. Check it is the same organisation before relying on it.</span>}
      </Stack>
    </Card>
  );
}
