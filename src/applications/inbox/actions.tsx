import { useState } from "react";
import { Button, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import { capabilityById, CAPABILITY_LABELS } from "@/platform/capability";
import { can as roleCan, type Capability } from "@/platform/policy";
import type { Rec, Role } from "@/domain/types";
import { useInboxData } from "./engine";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * Inbox contract actions that change the record they name.
 * ====================================================================== */

function boundary(id: string): string {
  const capability = capabilityById(id);
  return capability ? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}. ${capability.note}` : "";
}

/* ------------------------------ INBOX-002 ------------------------------ */

/** Delegates a request to a backup who holds the same authority, never more than they hold. */
export function DelegateApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const approvals = useCollection("approvals");
  const members = useCollection("members");
  const rules = useCollection("preferences").filter((record) => record.fields.kind === "escalationRule");
  const record = approvals.find((row) => row.id === context.selectedId);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Select a request first" />;
  const capability = String(record.fields.capability ?? "") as Capability;
  const amount = Number(record.amountMinor ?? 0);
  const people = members.filter((member) => String(member.fields.kind ?? "human") === "human" && member.status === "active" && member.title !== context.actor);
  const assess = (member: Rec): string | undefined => {
    const role = String(member.fields.role ?? "member") as Role;
    if (capability && !roleCan(role, capability)) return `${member.title}'s ${role} view does not hold ${capability.replace(/_/g, " ")}`;
    const rule = rules.find((item) => String(item.fields.backup ?? "") === member.title);
    const cap = Number(rule?.fields.authorityCap ?? 0);
    if (rule && cap > 0 && amount > cap) return `${member.title}'s delegated authority stops at ${context.money(cap)}`;
    return undefined;
  };
  const chosen = people.find((member) => member.title === to);
  const blocked = ["approved", "denied"].includes(record.status) ? `This request is already ${record.status}.`
    : !chosen ? "Choose who covers it." : assess(chosen);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A delegate never holds more than their own authority">
        The request moves to the person you choose and is bound to the same plan version. Someone whose view lacks the capability, or whose delegated cap is below the amount, cannot be chosen.
      </Notice>
      <Properties rows={[
        { label: "Request", value: record.title },
        { label: "Needs", value: capability ? capability.replace(/_/g, " ") : "No capability recorded" },
        { label: "Amount", value: amount ? context.money(amount) : "None" },
        { label: "Plan version", value: String(record.fields.planVersion ?? record.revision) },
      ]} />
      <Field label="Delegate to" required>
        <Select aria-label="Delegate to" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose a person</option>
          {people.map((member) => {
            const why = assess(member);
            return <option key={member.id} value={member.title} disabled={Boolean(why)}>{member.title}{why ? ` · ${why}` : ""}</option>;
          })}
        </Select>
      </Field>
      <Field label="Note for the delegate"><TextArea aria-label="Note for the delegate" value={note} rows={2} onChange={(event) => setNote(event.target.value)} /></Field>
      {blocked && to && <Notice tone="danger" title="Cannot delegate to them">{blocked}</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked)}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(record.id, {
                fields: { ...record.fields, delegatedTo: to, delegatedBy: context.actor, delegatedAt: clockIso(), assignee: to, delegationNote: note },
              }, { expectRevision: record.revision, event: `${record.title} delegated by ${context.actor} to ${to}` });
              if (saved) context.toast("Delegated", `${to} now holds ${record.title}. It shows under Delegated.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Delegate
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ INBOX-004 ------------------------------ */

export function FollowSource({ context, close }: { context: ScreenContext; close: () => void }) {
  const { items, data } = useInboxData();
  const sources = [...new Set(items.map((item) => item.sourceLabel))].sort();
  const followed = data.preferences.filter((record) => record.fields.kind === "followedSource");
  const [sourcePicked, setSource] = useState<string>();
  const source = sourcePicked ?? (sources.find((item) => !followed.some((record) => record.fields.source === item)) ?? sources[0] ?? "");
  const [busy, setBusy] = useState(false);
  const already = followed.find((record) => record.fields.source === source);
  return (
    <Stack gap={4}>
      <Field label="Source">
        <Select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
          {sources.map((item) => <option key={item} value={item}>{item}{followed.some((record) => record.fields.source === item) ? " · followed" : ""}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "Events from it now", value: String(items.filter((item) => item.sourceLabel === source).length) },
        { label: "Already followed", value: followed.map((record) => String(record.fields.source)).join(", ") || "None" },
      ]} />
      <Row gap={2}>
        {already ? (
          <Button variant="secondary" busy={busy} onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.remove(already.id, `Stopped following the ${source} source`);
              context.toast("Unfollowed", `${source} events are no longer pinned to the feed.`);
              close();
            } finally {
              setBusy(false);
            }
          }}>Stop following {source}</Button>
        ) : (
          <Button variant="primary" busy={busy} disabled={!source} onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.create({ collection: "preferences", title: `Following ${source}`, status: "active", summary: `Every event from ${source} stays in the feed.`, fields: { kind: "followedSource", source, followedBy: context.actor } }, `Followed the ${source} source`);
              context.toast("Following", `Every event from ${source} stays in the feed.`);
              close();
            } finally {
              setBusy(false);
            }
          }}>Follow {source}</Button>
        )}
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ INBOX-005 ------------------------------ */

export function AcknowledgeIncident({ context, close }: { context: ScreenContext; close: () => void }) {
  const incidents = useCollection("incidents");
  const record = incidents.find((row) => row.id === context.selectedId);
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Select an incident first" />;
  const done = Boolean(record.fields.acknowledgedBy);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Incident", value: record.title },
        { label: "Severity", value: <Pill tone={record.fields.severity === "sev1" ? "danger" : "warning"}>{String(record.fields.severity ?? "")}</Pill> },
        { label: "Owner", value: String(record.fields.owner ?? "Nobody") },
        { label: "Acknowledged", value: done ? `${String(record.fields.acknowledgedBy)}, ${context.dateTime(String(record.fields.acknowledgedAt ?? ""))}` : "Not yet" },
      ]} />
      <Notice tone="info" title="Acknowledging is not resolving">
        It records that {context.actor} has seen the incident and is on it, and moves it from Urgent to Waiting. The incident stays open until it is resolved.
      </Notice>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={done || record.status === "resolved"}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(record.id, {
                status: record.status === "urgent" ? "waiting" : record.status,
                fields: { ...record.fields, acknowledgedBy: context.actor, acknowledgedAt: clockIso() },
              }, { expectRevision: record.revision, event: `Incident acknowledged by ${context.actor}: ${record.title}` });
              if (saved) context.toast("Acknowledged", `${record.title} is acknowledged by ${context.actor}. It is still open.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Acknowledge
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function EscalateIncident({ context, close }: { context: ScreenContext; close: () => void }) {
  const incidents = useCollection("incidents");
  const members = useCollection("members");
  const record = incidents.find((row) => row.id === context.selectedId);
  const known = new Set(members.map((member) => member.title));
  // Only names that are people in this workspace count as a step in the chain; prose such as "only" is ignored.
  const chain = String(record?.fields.escalation ?? "").split("→")
    .map((part) => [...known].find((name) => part.includes(name)))
    .filter((name): name is string => Boolean(name));
  const owner = String(record?.fields.owner ?? "");
  const next = chain[chain.indexOf(owner) + 1] ?? chain.find((name) => name !== owner);
  const [toPicked, setTo] = useState<string>();
  const to = toPicked ?? (next ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!record) return <Empty title="Select an incident first" />;
  const people = [...new Set([...chain, ...members.filter((member) => String(member.fields.kind ?? "human") === "human" && member.status === "active").map((member) => member.title)])].filter((name) => name !== owner);
  const blocked = record.status === "resolved" ? "A resolved incident cannot be escalated." : !to ? "Choose who it escalates to." : to === owner ? `${to} already owns it.` : !reason.trim() ? "Say why it is escalating." : undefined;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Escalating moves ownership up the chain">
        {record.fields.escalation ? `The recorded chain is ${String(record.fields.escalation)}.` : "No chain is recorded on this incident."} The record changes owner now. {boundary("telephony")} Nobody is paged from this browser; tell them yourself.
      </Notice>
      <Properties rows={[
        { label: "Incident", value: record.title },
        { label: "Current owner", value: owner || "Nobody" },
        { label: "Escalation level", value: String(record.fields.escalationLevel ?? 0) },
      ]} />
      <Field label="Escalate to" required>
        <Select aria-label="Escalate to" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose a person</option>
          {people.map((name) => <option key={name} value={name}>{name}{name === next ? " · next in the chain" : ""}</option>)}
        </Select>
      </Field>
      <Field label="Why" required><TextInput aria-label="Why" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={Boolean(blocked)}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(record.id, {
                status: record.status === "waiting" ? "urgent" : record.status,
                fields: {
                  ...record.fields, owner: to, previousOwner: owner, escalatedBy: context.actor, escalatedAt: clockIso(),
                  escalationLevel: Number(record.fields.escalationLevel ?? 0) + 1, escalationReason: reason.trim(), pageState: "not_connected",
                },
              }, { expectRevision: record.revision, event: `Incident escalated by ${context.actor} from ${owner || "nobody"} to ${to}: ${reason.trim()}` });
              await context.mutate.log(`Page to ${to} for ${record.title} not sent: no telephony provider is connected`, { entityId: record.id, type: "incident.page", capability: "not_connected" });
              if (saved) context.toast("Escalated, not paged", `${to} now owns ${record.title}. No page or call left this browser.`, "info");
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Escalate to {to || "…"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ INBOX-006 ------------------------------ */

export function ToggleChannel({ context, close }: { context: ScreenContext; close: () => void }) {
  const { channels } = useInboxData();
  const [idPicked, setId] = useState<string>();
  const id = idPicked ?? (channels.find((channel) => channel.id === context.selectedId)?.id ?? channels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const channel = channels.find((item) => item.id === id);
  if (channels.length === 0) return <Empty title="No delivery channel is recorded" />;
  const on = channel?.fields.enabled === true;
  const locked = channel?.fields.locked === true;
  return (
    <Stack gap={4}>
      <Field label="Channel">
        <Select aria-label="Channel" value={id} onChange={(event) => setId(event.target.value)}>
          {channels.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.fields.enabled === true ? "on" : "off"}</option>)}
        </Select>
      </Field>
      {channel && <Properties rows={[
        { label: "Now", value: <Pill tone={on ? "success" : "neutral"} dot>{on ? "On" : "Off"}</Pill> },
        { label: "Provider", value: capabilityById(String(channel.fields.capability ?? ""))?.label ?? "In this browser" },
      ]} />}
      <Notice tone="info" title="Security escalation is not affected">
        Turning a channel off is casual muting. Security incidents still reach the in-app inbox, which cannot be turned off.
      </Notice>
      {locked && <Notice tone="warning" title="This channel cannot be turned off">The in-app inbox is the only channel that always works.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!channel || locked}
          onClick={async () => {
            if (!channel) return;
            setBusy(true);
            try {
              const saved = await context.mutate.patch(channel.id, { fields: { ...channel.fields, enabled: !on, toggledBy: context.actor } }, { expectRevision: channel.revision, event: `${channel.title} ${on ? "disabled" : "enabled"} by ${context.actor}` });
              if (saved) context.toast(on ? "Channel off" : "Channel on", `${channel.title} is ${on ? "off" : "on"} for this workspace.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Turn {on ? "off" : "on"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function SetDigest({ context, close }: { context: ScreenContext; close: () => void }) {
  const { data } = useInboxData();
  const existing = data.preferences.find((record) => record.fields.kind === "digestDelivery");
  const [cadencePicked, setCadence] = useState<string>();
  const cadence = cadencePicked ?? (String(existing?.fields.cadence ?? "daily"));
  const [sendAtPicked, setSendAt] = useState<string>();
  const sendAt = sendAtPicked ?? (String(existing?.fields.sendAt ?? "08:00"));
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The digest collects routine items">
        Routine updates wait for the digest instead of interrupting. Decisions and security alerts never wait for it. {boundary("email.send")} The digest is built in the inbox.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Cadence">
          <Select aria-label="Cadence" value={cadence} onChange={(event) => setCadence(event.target.value)}>
            <option value="daily">Daily</option><option value="weekly">Weekly, Monday</option><option value="off">Off: deliver routine items as they arrive</option>
          </Select>
        </Field>
        <Field label="Built at"><TextInput aria-label="Built at" type="time" value={sendAt} onChange={(event) => setSendAt(event.target.value)} /></Field>
      </Row>
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const fields = { kind: "digestDelivery", cadence, sendAt, setBy: context.actor, timezone: context.org.timezone };
              if (existing) { if (!(await context.mutate.patch(existing.id, { fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Digest set to ${cadence} at ${sendAt}` }))) return; }
              else await context.mutate.create({ collection: "preferences", title: "Digest delivery", status: "active", summary: `Routine items collected ${cadence}.`, fields }, `Digest set to ${cadence} at ${sendAt}`);
              context.toast("Digest set", cadence === "off" ? "Routine items arrive as they happen." : `Routine items are collected ${cadence} at ${sendAt}.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Save the digest
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------------ INBOX-008 ------------------------------ */

export function RevokeRule({ context, close }: { context: ScreenContext; close: () => void }) {
  const rules = useCollection("preferences").filter((record) => record.fields.kind === "escalationRule");
  const rule = rules.find((record) => record.id === context.selectedId);
  const approvals = useCollection("approvals");
  const [busy, setBusy] = useState(false);
  if (!rule) return <Empty title="Select a rule first" />;
  const covering = approvals.filter((row) => String(row.fields.delegatedTo ?? "") === String(rule.fields.backup ?? "") && !["approved", "denied"].includes(row.status));
  return (
    <Stack gap={4}>
      <Notice tone="warning" title={`Revoke ${String(rule.fields.backup ?? "")} as backup`}>
        {String(rule.fields.condition ?? "")} stops escalating to {String(rule.fields.backup ?? "")}. {covering.length} open request{covering.length === 1 ? " they cover returns" : "s they cover return"} to {String(rule.fields.owner ?? "the owner")}. The rule stays on the record as revoked.
      </Notice>
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={rule.status === "revoked" || !context.can("manage_policy")}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await context.mutate.patch(rule.id, {
                status: "revoked",
                fields: { ...rule.fields, enabled: false, revokedBy: context.actor, revokedAt: clockIso() },
              }, { expectRevision: rule.revision, event: `Escalation rule revoked by ${context.actor}: ${String(rule.fields.condition)} → ${String(rule.fields.backup)}` });
              if (!saved) return;
              for (const row of covering) {
                const fields = { ...row.fields, assignee: String(rule.fields.owner ?? row.fields.assignee ?? "") };
                delete (fields as Record<string, unknown>).delegatedTo;
                if (!(await context.mutate.patch(row.id, { fields }, { event: `${row.title} returned from ${String(rule.fields.backup)} when the delegation was revoked` }))) return;
              }
              context.toast("Revoked", `${String(rule.fields.backup)} no longer covers ${String(rule.fields.condition)}.`, "blocked");
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Revoke the delegation
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}
