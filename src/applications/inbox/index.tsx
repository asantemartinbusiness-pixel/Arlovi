import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock, AlertTriangle, Bell, CalendarClock, CheckCheck, Inbox, Mail, Megaphone,
  ShieldAlert, Users,
} from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill,
  Properties, Row, Segmented, Select, Stack, Stat, StatRow, Switch, TextArea, TextInput,
} from "@/design-system";
import { findScreen } from "@/app/catalog";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { db, useCollection, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById, CAPABILITY_LABELS, CAPABILITY_TONE } from "@/platform/capability";
import { ROLE_LABELS, can as roleCan, type Capability } from "@/platform/policy";
import { freshness } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  activeQueue, approvalRows, attentionBus, busItem, csv, groupBy, PRIORITIES, PRIORITY_LABEL, PRIORITY_TONE,
  routeReason, targetDrift, useInboxData, usePublishedItems, useSeeded, useSeededList, writeTriage,
  type ApprovalTab, type InboxItem,
} from "./engine";
import {
  AcknowledgeIncident, DelegateApproval, EscalateIncident, FollowSource, RevokeRule, SetDigest, ToggleChannel,
} from "./actions";

/* ====================================================================== *
 * INBOX — Inbox, Notifications & Attention Engine
 *
 * The attention surface for the whole workspace: what needs a person, in what
 * order, routed by role, with read, acknowledged and resolved kept apart.
 * Approving happens on the record; this module takes you there.
 * ====================================================================== */

/* ----------------------------- shared pieces ----------------------------- */

function PriorityTag({ priority }: { priority: InboxItem["priority"] }) {
  return <Pill tone={PRIORITY_TONE[priority]} dot>{priority} · {PRIORITY_LABEL[priority]}</Pill>;
}

function StateTags({ item }: { item: InboxItem }) {
  return (
    <Row gap={1} wrap>
      {!item.read && <Pill tone="accent">Unread</Pill>}
      {item.read && !item.acknowledged && !item.resolved && <Pill>Read</Pill>}
      {item.acknowledged && !item.resolved && <Pill tone="info">Acknowledged</Pill>}
      {item.resolved && <Pill tone="success">Resolved</Pill>}
      {item.snoozed && <Pill tone="warning">Snoozed</Pill>}
    </Row>
  );
}

/** Probe a deep-link target without claiming it exists before we know. */
function useProbe(id: string | undefined): "none" | "checking" | "found" | "missing" {
  const record = useRecord(id);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), 300);
    return () => window.clearTimeout(timer);
  }, [id]);
  if (!id) return "none";
  if (record) return "found";
  return settled ? "missing" : "checking";
}

function DeepLink({ item, context }: { item: InboxItem; context: ScreenContext }) {
  const probe = useProbe(item.entityId);
  const route = item.route?.replace(":org", context.org.slug);
  const known = route ? findScreen(route) : null;

  if (!route) return <Notice tone="info" title="Nothing to open">This item is informational; no record is linked to it.</Notice>;
  if (!known) {
    return (
      <Notice tone="warning" title="That address is not a workspace screen">
        <span className="ds-num">{route}</span> is not one of the approved screens, so this item cannot be opened. The item itself is kept.
      </Notice>
    );
  }
  if (probe === "missing") {
    return (
      <Notice tone="warning" title="Record unavailable">
        <span className="ds-num">{item.entityId}</span> is no longer in this browser. The screen would open empty, so the link is held back rather than
        sending you to a page with nothing on it. Resolve the item if the record was deleted on purpose.
      </Notice>
    );
  }
  return (
    <Row gap={2} wrap>
      <Button variant="primary" busy={probe === "checking"} onClick={() => context.navigate(route)}>
        Open record
      </Button>
      <span className="ds-subtle">{known.screen.title}{item.entityId ? ` · ${item.entityId}` : ""}</span>
    </Row>
  );
}

function openItem(context: ScreenContext, item: InboxItem | undefined) {
  if (!item) {
    context.toast("Nothing selected", "Choose an item in the queue first.", "info");
    return;
  }
  const route = item.route?.replace(":org", context.org.slug);
  if (!route || !findScreen(route)) {
    context.openOverlay("Notification detail", { itemId: item.id });
    return;
  }
  context.navigate(route);
}

function queueColumns(context: ScreenContext) {
  return [
    {
      key: "priority", header: "Priority", width: "168px",
      cell: (row: InboxItem) => <PriorityTag priority={row.priority} />,
      sortValue: (row: InboxItem) => row.priority,
      filterValue: (row: InboxItem) => `${row.priority} ${PRIORITY_LABEL[row.priority]}`,
    },
    {
      key: "title", header: "Item", primary: true,
      cell: (row: InboxItem) => (
        <div>
          <strong style={{ fontWeight: row.read ? 500 : 650 }}>{row.title}</strong>
          <p className="ds-subtle ds-truncate" style={{ maxWidth: "62ch" }}>{row.body}</p>
        </div>
      ),
      sortValue: (row: InboxItem) => row.title,
      filterValue: (row: InboxItem) => `${row.title} ${row.body} ${row.sourceLabel} ${row.group}`,
    },
    { key: "group", header: "Group", hideBelow: 1100, cell: (row: InboxItem) => <Pill>{row.group}</Pill>, sortValue: (row: InboxItem) => row.group },
    { key: "source", header: "Source", hideBelow: 1280, cell: (row: InboxItem) => row.sourceLabel, sortValue: (row: InboxItem) => row.sourceLabel },
    { key: "state", header: "State", hideBelow: 900, cell: (row: InboxItem) => <StateTags item={row} /> },
    { key: "at", header: "When", align: "end" as const, cell: (row: InboxItem) => context.relative(row.at), sortValue: (row: InboxItem) => row.at },
  ];
}

function bulkTriageActions(context: ScreenContext) {
  return [
    {
      label: "Mark read",
      onRun: (rows: InboxItem[]) => {
        void Promise.all(rows.map((row) => writeTriage(context.mutate, row, { read: true }, `Marked read in the inbox: ${row.title}`)))
          .then(() => context.toast("Marked read", `${rows.length} ${rows.length === 1 ? "item" : "items"} changed. Reading is not approving.`));
      },
      disabled: (rows: InboxItem[]) => rows.every((row) => row.read),
    },
    {
      label: "Acknowledge",
      onRun: (rows: InboxItem[]) => {
        void Promise.all(rows.map((row) => writeTriage(context.mutate, row, { read: true, acknowledged: true }, `Acknowledged in the inbox: ${row.title}`)))
          .then(() => context.toast("Acknowledged", "Acknowledging records that you have seen it. The underlying record still needs its own decision."));
      },
    },
    {
      label: "Snooze…",
      onRun: (rows: InboxItem[]) => context.openOverlay("snooze picker", { itemIds: rows.map((row) => row.id) }),
    },
    {
      label: "Resolve",
      onRun: (rows: InboxItem[]) => context.openOverlay("action preview", { itemIds: rows.map((row) => row.id), intent: "resolve" }),
      disabled: (rows: InboxItem[]) => rows.some((row) => row.kind === "approval"),
    },
  ];
}

/* ---------------------------- INBOX-001 ---------------------------- */

type ForYouLens = "queue" | "unread" | "mine" | "urgent" | "snoozed";

function ForYou({ context }: { context: ScreenContext }) {
  const { items, rules, hiddenByRole } = useInboxData();
  const { role, actor } = useWorkspace();
  const [lens, setLens] = useState<ForYouLens>("queue");

  const rows = useMemo(() => {
    if (lens === "snoozed") return items.filter((item) => item.snoozed);
    const live = activeQueue(items);
    if (lens === "unread") return live.filter((item) => !item.read);
    if (lens === "mine") return live.filter((item) => item.assignee === actor || item.kind === "assignment" || item.kind === "approval");
    if (lens === "urgent") return live.filter((item) => item.priority === "P0" || item.priority === "P1");
    return live;
  }, [items, lens, actor]);

  usePublishedItems(rows);

  const missionActivity = groupBy(items.filter((item) => item.group === "Missions" || item.kind === "interruption"), (item) => item.entityId ?? "Missions");
  const groups = groupBy(activeQueue(items), (item) => item.group);

  return (
    <Stack gap={4}>
      <InboxStats context={context} />
      <Grid>
      <Card
        eyebrow="ATTENTION QUEUE"
        prov="posted"
        span={8}
        title="Your queue"
        subtitle={`${rows.length} of ${items.length} items routed to the ${ROLE_LABELS[role]} view`}
        flush
      >
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Attention queue"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Notification detail", { itemId: id }); }}
          rowTone={(row) => (row.priority === "P0" ? "danger" : row.priority === "P1" ? "warning" : undefined)}
          columns={queueColumns(context)}
          bulkActions={bulkTriageActions(context)}
          toolbar={
            <Segmented
              label="Queue filter"
              value={lens}
              onChange={setLens}
              options={[
                { value: "queue", label: "Everything" },
                { value: "unread", label: "Unread" },
                { value: "mine", label: "Needs me" },
                { value: "urgent", label: "P0–P1" },
                { value: "snoozed", label: "Snoozed" },
              ]}
            />
          }
          empty={
            <Empty title={lens === "snoozed" ? "Nothing is snoozed" : "The queue is clear"} icon={<CheckCheck size={20} />}>
              {lens === "snoozed"
                ? "Snoozed items come back to the queue when their time passes."
                : "Items arrive here when a record needs a decision, falls past its date, or names you."}
            </Empty>
          }
        />
      </Card>

      <Stack gap={4} className="ds-col-4">
        <Card machine eyebrow="AI WORKFORCE" prov="agent" span={4} title="Grouped mission activity" subtitle={`${missionActivity.length} ${missionActivity.length === 1 ? "mission" : "missions"} with open items`}>
          {missionActivity.length === 0 ? (
            <Empty title="No mission is waiting" icon={<Megaphone size={20} />}>Missions that stop for a decision are grouped here instead of arriving one line at a time.</Empty>
          ) : (
            <Stack gap={3}>
              {missionActivity.map((group) => (
                <div key={group.label}>
                  <Row gap={2}>
                    <strong className="ds-grow ds-truncate">{group.rows[0].title}</strong>
                    <span className="ds-num">{group.rows.length} {group.rows.length === 1 ? "item" : "items"}</span>
                  </Row>
                  <p className="ds-subtle">{group.rows[0].body}</p>
                  <Row gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
                    <Button size="sm" variant="secondary" onClick={() => openItem(context, group.rows[0])}>Open the mission</Button>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Notification detail", { itemId: group.rows[0].id })}>Details</Button>
                  </Row>
                </div>
              ))}
            </Stack>
          )}
        </Card>

        <Card eyebrow="QUEUE SHAPE" prov="posted" span={4} title="By group" subtitle="Open items only">
          <Stack gap={2}>
            {groups.map((group) => (
              <Row key={group.label} gap={3}>
                <span className="ds-grow">{group.label}</span>
                <Meter value={group.rows.length} max={Math.max(1, groups[0].rows.length)} label={`${group.label} share`} />
                <strong className="ds-num" style={{ width: 24, textAlign: "end" }}>{group.rows.length}</strong>
              </Row>
            ))}
            {groups.length === 0 && <span className="ds-subtle">Nothing open.</span>}
          </Stack>
        </Card>

        <Card eyebrow="ROUTING" prov="human" span={4} title="Why you are seeing this" subtitle="Routing, not a feed">
          <Stack gap={3}>
            <p className="ds-subtle">
              {hiddenByRole === 0
                ? `Every item in this workspace is routed to the ${ROLE_LABELS[role]} view.`
                : `${hiddenByRole} ${hiddenByRole === 1 ? "item is" : "items are"} routed to other views and are not shown here.`}
            </p>
            {rules.filter((rule) => rule.fields.enabled === true).slice(0, 3).map((rule) => (
              <div key={rule.id}>
                <strong>{rule.title}</strong>
                <p className="ds-subtle">{rule.summary}</p>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/escalations`)}>Routing rules</Button>
          </Stack>
        </Card>
      </Stack>
      </Grid>
    </Stack>
  );
}

function ApprovalsPreview({ context }: { context: ScreenContext }) {
  const { items } = useInboxData();
  const approvals = items.filter((item) => item.kind === "approval" && !item.resolved);
  usePublishedItems(approvals);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Reading is not approving">
        This list shows which decisions are waiting and where they live. Approving, denying and asking for changes happen on the
        record in Approvals, where the exact action and its plan version are shown.
      </Notice>
      {approvals.length === 0 ? (
        <Empty title="No decision is waiting" icon={<CheckCheck size={20} />}>Items appear here when a record is submitted for a decision.</Empty>
      ) : (
        <Grid>
          {approvals.map((item) => (
            <Card key={item.id} eyebrow="DECISION" prov={item.sourceLabel === "Approvals" ? "agent" : "human"} span={6} title={item.title} subtitle={`${item.sourceLabel} · ${context.relative(item.at)}`}>
              <Stack gap={3}>
                <Row gap={2} wrap><PriorityTag priority={item.priority} /><StateTags item={item} /></Row>
                <p>{item.body}</p>
                <Row gap={2} wrap>
                  <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/approvals`)}>Review on the record</Button>
                  <Button variant="ghost" onClick={() => context.openOverlay("Notification detail", { itemId: item.id })}>Why me?</Button>
                </Row>
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

function MessagesPreview({ context }: { context: ScreenContext }) {
  const { data } = useInboxData();
  const { role } = useWorkspace();
  const visible = data.messages.filter((message) => {
    const restricted = csv(message.fields.restrictedTo);
    return restricted.length === 0 || restricted.includes(role);
  });
  const hidden = data.messages.length - visible.length;
  return (
    <Stack gap={4}>
      {hidden > 0 && (
        <Notice tone="warning" title="Restricted channels are not shown here">
          {hidden} {hidden === 1 ? "thread is" : "threads are"} in channels this role view does not hold. Role views shape the interface;
          they are not an account security boundary.
        </Notice>
      )}
      <Stack gap={2}>
        {visible.slice(0, 8).map((message) => (
          <Row key={message.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
            <Avatar name={String(message.fields.author ?? message.ownerName)} kind={message.fields.authorKind === "ai" ? "ai" : "human"} />
            <div className="ds-grow">
              <Row gap={2} wrap>
                <strong>{String(message.fields.author ?? message.ownerName)}</strong>
                <Pill>{String(message.fields.channel ?? "Direct")}</Pill>
                {message.fields.unread === true && <Pill tone="accent">Unread</Pill>}
                {message.fields.kind === "escalation" && <Pill tone="danger">Escalated</Pill>}
              </Row>
              <p style={{ marginBlock: 4 }}>{message.summary}</p>
              <span className="ds-subtle">{context.relative(message.at)} · {Number(message.fields.replies ?? 0)} replies</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/messages`)}>Open thread</Button>
          </Row>
        ))}
        {visible.length === 0 && <Empty title="No messages in this view" icon={<Mail size={20} />}>Mentions and escalations routed to you appear here.</Empty>}
      </Stack>
    </Stack>
  );
}

function UpdatesPanel({ context }: { context: ScreenContext }) {
  const { items } = useInboxData();
  const updates = items.filter((item) => item.kind === "update" || item.kind === "system");
  usePublishedItems(updates);
  const groups = groupBy(updates, (item) => item.group);
  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Button variant="secondary" onClick={() => context.openOverlay("action preview", { itemIds: updates.filter((item) => !item.read).map((item) => item.id), intent: "read" })}>
          Mark this group read
        </Button>
        <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/notifications`)}>Full notifications feed</Button>
      </Row>
      {groups.length === 0 ? (
        <Empty title="No updates" icon={<Bell size={20} />}>Routine changes are collected here so they do not interrupt you one by one.</Empty>
      ) : (
        <Grid>
          {groups.map((group) => (
            <Card key={group.label} eyebrow="UPDATES" prov="posted" span={6} title={group.label} subtitle={`${group.rows.length} ${group.rows.length === 1 ? "update" : "updates"}`}>
              <Stack gap={2}>
                {group.rows.map((item) => (
                  <Row key={item.id} gap={2} style={{ alignItems: "flex-start" }}>
                    <PriorityTag priority={item.priority} />
                    <div className="ds-grow">
                      <strong style={{ fontWeight: item.read ? 500 : 650 }}>{item.title}</strong>
                      <p className="ds-subtle">{item.body}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Notification detail", { itemId: item.id })}>Details</Button>
                  </Row>
                ))}
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

function ActivityPanel({ context }: { context: ScreenContext }) {
  const events = useEvents(undefined, 40);
  return (
    <Card eyebrow="ACTIVITY" prov="posted" title="What has happened" subtitle={`${events.length} most recent entries from the workspace log`} flush>
      <DataGrid
        rows={events}
        rowId={(row) => row.id}
        label="Workspace activity"
        columns={[
          { key: "at", header: "When", width: "150px", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at },
          { key: "actor", header: "Who", width: "180px", cell: (row) => <Row gap={2}><Avatar name={row.actor} size="sm" kind={row.actor === "system" ? "ai" : "human"} />{row.actor}</Row>, filterValue: (row) => row.actor },
          { key: "message", header: "Entry", primary: true, cell: (row) => <div><strong>{row.type}</strong><p className="ds-subtle">{row.message}</p></div>, filterValue: (row) => `${row.type} ${row.message}` },
          {
            key: "capability", header: "Outcome", align: "end", hideBelow: 900,
            cell: (row) => (row.capability ? <Pill tone={CAPABILITY_TONE[row.capability]}>{CAPABILITY_LABELS[row.capability]}</Pill> : <span className="ds-subtle">—</span>),
          },
        ]}
        empty={<Empty title="No activity yet" icon={<CalendarClock size={20} />}>Every write in this workspace is logged here.</Empty>}
      />
    </Card>
  );
}

/** One compact line for the status strip: context the cards do not carry. */
function InboxStripLine({ context }: { context: ScreenContext }) {
  const { items, hiddenByRole, rules } = useInboxData();
  const { role } = useWorkspace();
  const live = activeQueue(items);
  const oldest = [...live].sort((a, b) => a.at.localeCompare(b.at))[0];
  const active = rules.filter((rule) => rule.fields.enabled === true).length;
  return (
    <>
      <span>Routed to the {ROLE_LABELS[role]} view</span>
      <span>{hiddenByRole === 0 ? "nothing is held back from it" : `${hiddenByRole} items are routed elsewhere`}</span>
      <span>oldest open item <strong className="ds-num">{oldest ? context.relative(oldest.at) : "none"}</strong></span>
      <span><strong className="ds-num">{active}</strong> routing rules are on</span>
      <span className="ds-grow" />
      <span>Reading an item never approves it</span>
    </>
  );
}

function InboxStats({ context }: { context: ScreenContext }) {
  const { items } = useInboxData();
  const live = activeQueue(items);
  return (
    <StatRow>
      <Stat prov="posted" label="Needs attention" value={String(live.length)} meta={`${items.filter((item) => item.snoozed).length} snoozed`} />
      <Stat prov="posted" label="Unread" value={String(live.filter((item) => !item.read).length)} meta="Reading never approves" />
      <Stat prov="posted" label="P0–P1" value={String(live.filter((item) => item.priority === "P0" || item.priority === "P1").length)} meta="Critical and urgent" />
      <Stat
        prov="human"
        label="Decisions waiting"
        value={String(live.filter((item) => item.kind === "approval").length)}
        meta="Approve on the record"
        onClick={() => context.navigate(`/o/${context.org.slug}/inbox/approvals`)}
      />
    </StatRow>
  );
}

/* ---------------------------- overlays: 001 ---------------------------- */

function NotificationDetail({ context }: { context: ScreenContext }) {
  const { items, rules } = useInboxData();
  const { role } = useWorkspace();
  const payload = context.overlayPayload as { itemId?: string } | undefined;
  const item = items.find((row) => row.id === (payload?.itemId ?? context.selectedId));
  if (!item) return <Empty title="Select an item" icon={<Inbox size={20} />}>Choose a row in the queue to see where it came from.</Empty>;

  return (
    <Stack gap={4}>
      <Row gap={2} wrap><PriorityTag priority={item.priority} /><StateTags item={item} /></Row>
      <div>
        <h3 style={{ marginBlockEnd: 4 }}>{item.title}</h3>
        <p>{item.body}</p>
      </div>
      <Properties rows={[
        { label: "Kind", value: item.kind },
        { label: "Group", value: item.group },
        { label: "Raised by", value: item.sourceLabel },
        { label: "When", value: `${context.dateTime(item.at)} (${context.relative(item.at)})` },
        { label: "Stored as", value: item.sourceKind === "notification" ? `Record ${item.record?.id}` : "Derived from the record it points at" },
        { label: "Audience", value: item.audience.length ? item.audience.map((entry) => ROLE_LABELS[entry]).join(", ") : "Everyone in the workspace" },
        { label: "Snoozed until", value: item.snoozedUntil ? context.dateTime(item.snoozedUntil) : "Not snoozed" },
        { label: "Assigned to", value: item.assignee ?? "Nobody" },
      ]} />
      <Notice tone="info" title="Why this reached you">{routeReason(item, rules, role)}</Notice>
      <DeepLink item={item} context={context} />
      <Row gap={2} wrap>
        <Button
          variant="secondary"
          disabled={item.read}
          onClick={() => void writeTriage(context.mutate, item, { read: true }, `Marked read: ${item.title}`).then(() => context.toast("Marked read", "The item is still open. Reading does not approve or resolve it."))}
        >
          Mark read
        </Button>
        <Button
          variant="secondary"
          disabled={item.acknowledged}
          onClick={() => void writeTriage(context.mutate, item, { read: true, acknowledged: true }, `Acknowledged: ${item.title}`).then(() => context.toast("Acknowledged", "Recorded that you have seen it."))}
        >
          Acknowledge
        </Button>
        <Button variant="secondary" onClick={() => context.openOverlay("snooze picker", { itemIds: [item.id] })}>Snooze</Button>
        {item.kind === "approval" ? (
          <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/approvals`)}>Decide on the record</Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void writeTriage(context.mutate, item, { read: true, resolved: true }, `Resolved from the inbox: ${item.title}`).then(() => context.toast("Resolved", "The item left the queue and the change is on the record."))}
          >
            Resolve
          </Button>
        )}
      </Row>
    </Stack>
  );
}

function SnoozePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { items } = useInboxData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { itemIds?: string[] } | undefined;
  const ids = payload?.itemIds ?? (context.selectedId ? [context.selectedId] : []);
  const chosen = items.filter((item) => ids.includes(item.id));
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const presets = [
    { label: "In one hour", at: new Date(now.getTime() + 3_600_000) },
    { label: "This afternoon", at: new Date(new Date(now).setHours(14, 0, 0, 0)) },
    { label: "Tomorrow morning", at: new Date(new Date(now.getTime() + 86_400_000).setHours(8, 0, 0, 0)) },
    { label: "Next week", at: new Date(now.getTime() + 7 * 86_400_000) },
  ].filter((preset) => preset.at > now);

  async function apply(until: Date) {
    setBusy(true);
    try {
      for (const item of chosen) {
        await writeTriage(context.mutate, item, { read: true, snoozedUntil: until.toISOString() }, `Snoozed until ${until.toISOString()}: ${item.title}`);
      }
      context.toast("Snoozed", `${chosen.length} ${chosen.length === 1 ? "item returns" : "items return"} to the queue on ${context.dateTime(until)}.`);
      close();
    } finally {
      setBusy(false);
    }
  }

  if (chosen.length === 0) return <Empty title="Nothing selected" icon={<AlarmClock size={20} />}>Select at least one item to snooze.</Empty>;

  return (
    <Stack gap={4}>
      <p>{chosen.length === 1 ? chosen[0].title : `${chosen.length} items`} will leave the queue and come back at the time you choose.</p>
      {chosen.some((item) => item.priority === "P0") && (
        <Notice tone="warning" title="A critical item is in this selection">
          P0 items still appear in Incident alerts while snoozed, so a snooze never hides a critical alert completely.
        </Notice>
      )}
      <Stack gap={2}>
        {presets.map((preset) => (
          <Button key={preset.label} variant="secondary" busy={busy} style={{ justifyContent: "space-between" }} onClick={() => void apply(preset.at)}>
            <span>{preset.label}</span>
            <span className="ds-subtle">{context.dateTime(preset.at)}</span>
          </Button>
        ))}
      </Stack>
      <Field label="Or pick a time" hint="Kept in this browser against the item.">
        <TextInput type="datetime-local" value={custom} onChange={(event) => setCustom(event.target.value)} />
      </Field>
      <Button
        variant="primary"
        busy={busy}
        disabled={!custom || new Date(custom) <= now}
        title={custom && new Date(custom) <= now ? "Choose a time in the future" : undefined}
        onClick={() => void apply(new Date(custom))}
      >
        Snooze until the chosen time
      </Button>
    </Stack>
  );
}

function ActionPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const { items } = useInboxData();
  const payload = context.overlayPayload as { itemIds?: string[]; intent?: "read" | "resolve" | "acknowledge" } | undefined;
  const intent = payload?.intent ?? "read";
  const ids = payload?.itemIds ?? activeQueue(items).filter((item) => !item.read).map((item) => item.id);
  const chosen = items.filter((item) => ids.includes(item.id));
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const label = intent === "resolve" ? "Resolve" : intent === "acknowledge" ? "Acknowledge" : "Mark read";
  const blocked = chosen.filter((item) => intent === "resolve" && item.kind === "approval");
  const willChange = chosen.filter((item) => !blocked.includes(item));

  async function apply() {
    setBusy(true);
    try {
      for (const item of willChange) {
        await writeTriage(
          context.mutate,
          item,
          intent === "resolve" ? { read: true, resolved: true } : intent === "acknowledge" ? { read: true, acknowledged: true } : { read: true },
          `${label} from bulk triage${reason ? ` (${reason})` : ""}: ${item.title}`,
        );
      }
      context.toast(`${label}: ${willChange.length} ${willChange.length === 1 ? "item" : "items"}`, "Each change is on the record behind the item, not only in this view.");
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <Notice tone={blocked.length ? "warning" : "info"} title={`${willChange.length} ${willChange.length === 1 ? "record" : "records"} will change`}>
        {label} writes to the notification record, or to a triage record for an item that is derived from money or work. Nothing else
        about the underlying record is touched.
      </Notice>
      {blocked.length > 0 && (
        <Notice tone="warning" title={`${blocked.length} cannot be resolved here`}>
          A decision cannot be closed from the inbox. {blocked.map((item) => item.title).join("; ")} must be approved, denied or sent
          back on the record.
        </Notice>
      )}
      <Card eyebrow="PREVIEW" prov="posted" title="Exactly what changes" flush>
        <DataGrid
          rows={willChange}
          rowId={(row) => row.id}
          label="Items in this triage"
          filterable={false}
          dense
          columns={[
            { key: "title", header: "Item", primary: true, cell: (row) => row.title },
            { key: "from", header: "Now", cell: (row) => <StateTags item={row} /> },
            { key: "to", header: "After", cell: () => <Pill tone={intent === "resolve" ? "success" : "info"}>{intent === "resolve" ? "Resolved" : intent === "acknowledge" ? "Acknowledged" : "Read"}</Pill> },
            { key: "where", header: "Written to", align: "end", cell: (row) => (row.sourceKind === "notification" ? row.record?.id ?? "" : "Triage record") },
          ]}
          empty={<Empty title="Nothing left to change" />}
        />
      </Card>
      <Field label="Note for the log" hint="Optional. Stored with each change so the log says why.">
        <TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cleared during the Monday review" />
      </Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" busy={busy} disabled={willChange.length === 0} onClick={() => void apply()}>{label} {willChange.length}</Button>
      </Row>
    </Stack>
  );
}

/* ---------------------------- INBOX-002 ---------------------------- */


function ApprovalsScreen({ context, tab }: { context: ScreenContext; tab: ApprovalTab }) {
  const approvals = useCollection("approvals");
  const { actor, now } = useWorkspace();
  const rows = approvalRows(approvals, tab, actor);

  return (
    <Stack gap={4}>
      {tab === "Delegated" && (
        <Notice tone="info" title="Delegation never widens authority">
          A backup approver may only decide what their own role view already allows. Where a delegation would exceed that, the request
          stays with the original approver and is listed as a conflict in Escalations.
        </Notice>
      )}
      <Card
        eyebrow="APPROVALS"
        prov="human"
        title={tab === "History" ? "Decided" : `${rows.length} waiting`}
        subtitle={tab === "Mine" ? `Assigned to ${actor}` : tab === "Delegated" ? "Covered by a backup approver" : tab === "Pending" ? "Every open request in this workspace" : "Decisions already taken"}
        flush
      >
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Approval requests"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Approval review", { id }); }}
          rowTone={(row) => (row.fields.risk === "high" ? "warning" : undefined)}
          columns={[
            {
              key: "title", header: "Request", primary: true,
              cell: (row) => (
                <div>
                  <strong>{row.title}</strong>
                  <p className="ds-subtle">{String(row.fields.action ?? "")} · plan version {String(row.fields.planVersion ?? "1")}</p>
                </div>
              ),
              sortValue: (row) => row.title,
              filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.requester ?? "")} ${String(row.fields.action ?? "")}`,
            },
            {
              key: "requester", header: "Requested by", hideBelow: 1100,
              cell: (row) => <Row gap={2}><Avatar name={String(row.fields.requester ?? row.ownerName)} size="sm" kind={row.fields.requesterKind === "ai" ? "ai" : "human"} />{String(row.fields.requester ?? row.ownerName)}</Row>,
              sortValue: (row) => String(row.fields.requester ?? ""),
            },
            {
              key: "risk", header: "Risk", width: "110px",
              cell: (row) => <Pill tone={row.fields.risk === "high" ? "danger" : row.fields.risk === "medium" ? "warning" : "neutral"}>{String(row.fields.risk ?? "low")}</Pill>,
              sortValue: (row) => String(row.fields.risk ?? ""),
            },
            {
              key: "amount", header: "Amount", align: "end", width: "130px",
              cell: (row) => (row.amountMinor === undefined ? <span className="ds-subtle">No money</span> : <span className="ds-num">{context.money(row.amountMinor)}</span>),
              sortValue: (row) => row.amountMinor ?? -1,
            },
            { key: "accounts", header: "Affected", hideBelow: 1280, cell: (row) => String(row.fields.accounts ?? "—"), filterValue: (row) => String(row.fields.accounts ?? "") },
            {
              key: "expiry", header: tab === "History" ? "Decided" : "Expires", align: "end",
              cell: (row) => {
                if (tab === "History") return <Pill tone={row.status === "approved" ? "success" : row.status === "denied" ? "danger" : "warning"}>{row.status.replace("_", " ")}</Pill>;
                if (!row.dueAt) return <span className="ds-subtle">No expiry</span>;
                const late = new Date(row.dueAt) < now;
                return <Pill tone={late ? "danger" : "neutral"}>{late ? "Expired " : ""}{context.date(row.dueAt)}</Pill>;
              },
              sortValue: (row) => row.dueAt ?? "~",
            },
          ]}
          bulkActions={[
            {
              label: "Ask for changes",
              onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("Approval review", { id: selected[0]?.id, intent: "changes" }); },
              disabled: (selected) => selected.length !== 1,
            },
          ]}
          empty={
            <Empty title={tab === "History" ? "No decisions yet" : "Nothing is waiting"} icon={<CheckCheck size={20} />}>
              {tab === "Delegated" ? "No request is currently covered by a backup approver." : "Requests appear here when a person or an agent asks for a decision."}
            </Empty>
          }
        />
      </Card>
    </Stack>
  );
}

function ApprovalEvidence({ record, context }: { record: Rec; context: ScreenContext }) {
  const target = useRecord(String(record.fields.targetId ?? ""));
  const planVersion = String(record.fields.planVersion ?? "1");
  const currentVersion = target ? String(target.revision) : undefined;
  const { checked, drifted, boundRevision } = targetDrift(record, target);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Exact action", value: <span className="ds-num">{String(record.fields.action ?? "")}</span> },
        { label: "Scope", value: String(record.fields.scope ?? "Not stated") },
        { label: "Requested by", value: `${String(record.fields.requester ?? record.ownerName)}${record.fields.requesterKind === "ai" ? " (agent)" : ""}` },
        { label: "Risk", value: <Pill tone={record.fields.risk === "high" ? "danger" : record.fields.risk === "medium" ? "warning" : "neutral"}>{String(record.fields.risk ?? "low")}</Pill> },
        { label: "Amount", value: record.amountMinor === undefined ? "No money moves" : context.money(record.amountMinor) },
        { label: "Affected accounts", value: String(record.fields.accounts ?? "—") },
        { label: "Target record", value: target ? `${target.title} (revision ${target.revision})` : `${String(record.fields.targetTitle ?? "Unknown")} — not in this browser` },
        { label: "Plan version approved", value: planVersion },
        { label: "Target revision when requested", value: boundRevision ?? "Not recorded" },
        { label: "Expires", value: record.dueAt ? context.date(record.dueAt) : "No expiry" },
      ]} />
      <Notice tone="info" title="Evidence as recorded">
        {String(record.fields.evidence ?? "No evidence was attached to this request.")}
      </Notice>
      {drifted && (
        <Notice tone="warning" title="The target changed after this request was made">
          The request was raised against revision {boundRevision} of the target; the record is now at revision {currentVersion}. Approving would apply a
          decision to something the requester did not describe, so it is blocked until the request is re-submitted.
        </Notice>
      )}
      {target && !checked && (
        <Notice tone="neutral" title="The target's revision was not recorded">
          This request did not record which revision of {target.title} it describes, so a change since it was raised cannot be detected here.
        </Notice>
      )}
      {record.fields.decisionNote ? <Notice tone="neutral" title="Decision note">{String(record.fields.decisionNote)}</Notice> : null}
    </Stack>
  );
}

function ApprovalReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const approvals = useCollection("approvals");
  const payload = context.overlayPayload as { id?: string; intent?: string } | undefined;
  const record = approvals.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { actor } = useWorkspace();

  if (!record) return <Empty title="Select a request" icon={<CheckCheck size={20} />}>Choose a row to see the action, the evidence and the scope.</Empty>;

  const capability = String(record.fields.capability ?? "") as Capability;
  const allowed = capability ? context.can(capability) : true;

  async function decide(decision: "denied" | "changes_requested") {
    setBusy(true);
    try {
      await context.mutate.patch(record!.id, {
        status: decision,
        fields: { ...record!.fields, decision, decisionNote: note, decidedBy: actor },
      }, { event: `${decision === "denied" ? "Denied" : "Changes requested on"} ${record!.title}${note ? `: ${note}` : ""}`, expectRevision: record!.revision });
      context.toast(decision === "denied" ? "Denied" : "Sent back for changes", "The request record now carries the decision and the note.");
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <div>
        <h3 style={{ marginBlockEnd: 4 }}>{record.title}</h3>
        <p>{record.summary}</p>
      </div>
      <ApprovalEvidence record={record} context={context} />
      {!allowed && (
        <Notice tone="warning" title={`The ${ROLE_LABELS[context.role]} view cannot take this decision`}>
          This request needs the {capability.replace(/_/g, " ")} capability. Deciding is offered to the views that hold it; this shapes
          the interface and is not an account security boundary.
        </Notice>
      )}
      <Field label="Note" hint="Required to deny or to ask for changes. Stored on the request.">
        <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Row gap={2} wrap>
        <Button variant="outline-danger" busy={busy} disabled={!note.trim()} title={!note.trim() ? "Add a note first" : undefined} onClick={() => void decide("denied")}>Deny</Button>
        <Button variant="secondary" busy={busy} disabled={!note.trim()} title={!note.trim() ? "Add a note first" : undefined} onClick={() => void decide("changes_requested")}>Ask for changes</Button>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={() => context.openOverlay("scope diff", { id: record.id })}>Scope</Button>
        <Button variant="primary" disabled={!allowed} onClick={() => context.openOverlay("step-up auth", { id: record.id })}>Approve…</Button>
      </Row>
    </Stack>
  );
}

function StepUpAuth({ context, close }: { context: ScreenContext; close: () => void }) {
  const approvals = useCollection("approvals");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = approvals.find((row) => row.id === (payload?.id ?? context.selectedId));
  const target = useRecord(record ? String(record.fields.targetId ?? "") : undefined);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const { actor } = useWorkspace();

  if (!record) return <Empty title="Select a request" />;
  const planVersion = String(record.fields.planVersion ?? "1");
  const { drifted, boundRevision } = targetDrift(record, target);
  const expected = "APPROVE";

  async function approve() {
    setBusy(true);
    try {
      await context.mutate.patch(record!.id, {
        status: "approved",
        fields: { ...record!.fields, decision: "approved", decidedBy: actor, decidedPlanVersion: planVersion },
      }, { event: `Approved ${record!.title} at plan version ${planVersion}`, expectRevision: record!.revision });
      if (target) {
        await context.mutate.patch(target.id, {
          fields: { ...target.fields, approvedBy: actor, approvedAt: new Date().toISOString(), approvalId: record!.id },
        }, { event: `Approval recorded against ${target.title}` });
      }
      await context.mutate.log(`Step-up confirmation entered for ${record!.title}. Local confirmation only.`, { entityId: record!.id, type: "approval.step_up", capability: "ready_local" });
      context.toast("Approved", target ? `${record!.title} is approved and ${target.title} carries the approval.` : `${record!.title} is approved.`);
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="This is a local confirmation, not a second factor">
        Nothing here checks a device or a provider. Typing the word below records a deliberate confirmation in the audit log so a
        consequential approval is never one stray click.
      </Notice>
      <Properties rows={[
        { label: "Request", value: record.title },
        { label: "Action", value: <span className="ds-num">{String(record.fields.action ?? "")}</span> },
        { label: "Amount", value: record.amountMinor === undefined ? "No money moves" : context.money(record.amountMinor) },
        { label: "Bound to", value: `Plan version ${planVersion}` },
        { label: "Approving as", value: `${actor} · ${ROLE_LABELS[context.role]} view` },
      ]} />
      {drifted ? (
        <Notice tone="danger" title="Blocked: the plan changed">
          The target record is now at revision {target?.revision}, not revision {boundRevision}, which this request was raised against. Ask the requester to
          re-submit so the decision matches what will actually happen.
        </Notice>
      ) : (
        <Field label={`Type ${expected} to confirm`} required>
          <TextInput value={phrase} onChange={(event) => setPhrase(event.target.value.toUpperCase())} autoComplete="off" />
        </Field>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" busy={busy} disabled={drifted || phrase !== expected} onClick={() => void approve()}>Approve this action</Button>
      </Row>
    </Stack>
  );
}

function ScopeDiff({ context }: { context: ScreenContext }) {
  const approvals = useCollection("approvals");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = approvals.find((row) => row.id === (payload?.id ?? context.selectedId));
  if (!record) return <Empty title="Select a request" />;
  const capability = String(record.fields.capability ?? "");
  const requester = String(record.fields.requester ?? record.ownerName);
  const isAgent = record.fields.requesterKind === "ai";

  return (
    <Stack gap={4}>
      <Card eyebrow="REQUESTED" prov={isAgent ? "agent" : "human"} title="Requested" subtitle="What the request would allow">
        <Properties rows={[
          { label: "Action", value: <span className="ds-num">{String(record.fields.action ?? "")}</span> },
          { label: "Scope", value: String(record.fields.scope ?? "Not stated") },
          { label: "Accounts", value: String(record.fields.accounts ?? "—") },
          { label: "Ceiling", value: record.amountMinor === undefined ? "No money" : context.money(record.amountMinor) },
        ]} />
      </Card>
      <Card eyebrow="HELD TODAY" prov="posted" title="Held today" subtitle={`What ${requester} can already do`}>
        <Properties rows={[
          { label: "Requester", value: isAgent ? "Agent, draft mode" : "Person" },
          { label: "Capability needed", value: capability || "None recorded" },
          { label: "Already held", value: isAgent ? "No — agents draft and request" : "Depends on their role view" },
          { label: "Difference", value: isAgent ? "The whole action: an agent never holds this grant." : "One action, once, on the record named above." },
        ]} />
      </Card>
      <Notice tone="info" title="One action, not a standing grant">
        Approving decides this request only. Standing authority lives in Administration under Autonomy, where a grant is recorded with
        its cap and its expiry.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- INBOX-003 ---------------------------- */

type MessageTab = "Unread" | "Assigned" | "Mentions" | "Escalated";

function MessagesScreen({ context, tab }: { context: ScreenContext; tab: MessageTab }) {
  const messages = useCollection("messages");
  const { role, actor } = useWorkspace();
  const permitted = messages.filter((message) => {
    const restricted = csv(message.fields.restrictedTo);
    return restricted.length === 0 || restricted.includes(role);
  });
  const hidden = messages.length - permitted.length;

  const rows = tab === "Unread"
    ? permitted.filter((message) => message.fields.unread === true)
    : tab === "Assigned"
      ? permitted.filter((message) => String(message.fields.assignee ?? "") === actor)
      : tab === "Mentions"
        ? permitted.filter((message) => message.fields.kind === "mention")
        : permitted.filter((message) => message.fields.kind === "escalation");

  return (
    <Grid>
      <Card eyebrow="THREADS" prov="human" span={8} title={`${tab} · ${rows.length}`} subtitle={`${permitted.length} threads in the ${ROLE_LABELS[role]} view`} flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Message threads"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Message inspector", { id }); }}
          rowTone={(row) => (row.fields.kind === "escalation" ? "warning" : undefined)}
          columns={[
            {
              key: "author", header: "From", width: "200px",
              cell: (row) => <Row gap={2}><Avatar name={String(row.fields.author ?? row.ownerName)} size="sm" kind={row.fields.authorKind === "ai" ? "ai" : "human"} />{String(row.fields.author ?? row.ownerName)}</Row>,
              sortValue: (row) => String(row.fields.author ?? ""),
              filterValue: (row) => String(row.fields.author ?? ""),
            },
            {
              key: "title", header: "Thread", primary: true,
              cell: (row) => (
                <div>
                  <strong style={{ fontWeight: row.fields.unread === true ? 650 : 500 }}>{row.title}</strong>
                  <p className="ds-subtle ds-truncate" style={{ maxWidth: "60ch" }}>{row.summary}</p>
                </div>
              ),
              filterValue: (row) => `${row.title} ${row.summary}`,
              sortValue: (row) => row.title,
            },
            { key: "channel", header: "Channel", hideBelow: 1100, cell: (row) => <Pill tone={csv(row.fields.restrictedTo).length ? "warning" : "neutral"}>{String(row.fields.channel ?? "Direct")}</Pill>, sortValue: (row) => String(row.fields.channel ?? "") },
            { key: "assignee", header: "Owner", hideBelow: 1280, cell: (row) => String(row.fields.assignee ?? "Unassigned") },
            { key: "at", header: "Last activity", align: "end", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          ]}
          bulkActions={[
            {
              label: "Mark read",
              onRun: (selected) => {
                void Promise.all(selected.map((row) => context.mutate.patch(row.id, { fields: { ...row.fields, unread: false } }, { event: `Message marked read: ${row.title}` })))
                  .then(() => context.toast("Marked read", `${selected.length} ${selected.length === 1 ? "thread" : "threads"} updated.`));
              },
            },
            {
              label: "Convert to task",
              onRun: (selected) => { context.select(selected[0]?.id); void convertToTask(context, selected[0]); },
              disabled: (selected) => selected.length !== 1,
            },
          ]}
          empty={<Empty title={`No ${tab.toLowerCase()} threads`} icon={<Mail size={20} />}>Threads arrive from channels, care escalations and agents in this workspace.</Empty>}
        />
      </Card>

      <Stack gap={4} className="ds-col-4">
        <Card eyebrow="VISIBILITY" prov="human" span={4} title="Routing" subtitle="What this role view can see">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Role view", value: ROLE_LABELS[role] },
              { label: "Threads visible", value: String(permitted.length) },
              { label: "Restricted and hidden", value: String(hidden) },
            ]} />
            {hidden > 0 && (
              <Notice tone="warning" title="Restricted channels stay closed">
                {hidden} {hidden === 1 ? "thread names" : "threads name"} a channel this view does not hold, so neither the thread nor a
                summary of it is shown. Summaries are built only from threads you can already open.
              </Notice>
            )}
          </Stack>
        </Card>
        <Card eyebrow="WAITING" prov="posted" span={4} title="Unanswered the longest" subtitle="Oldest unread first">
          <Stack gap={2}>
            {[...permitted].filter((row) => row.fields.unread === true).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).slice(0, 4).map((row) => (
              <Row key={row.id} gap={2}>
                <span className="ds-grow ds-truncate">{row.title}</span>
                <Pill tone="warning">{context.relative(row.at)}</Pill>
              </Row>
            ))}
            {permitted.every((row) => row.fields.unread !== true) && <span className="ds-subtle">Everything visible has been read.</span>}
          </Stack>
        </Card>
      </Stack>
    </Grid>
  );
}

async function convertToTask(context: ScreenContext, message: Rec | undefined) {
  if (!message) {
    context.toast("Nothing selected", "Choose a thread first.", "info");
    return;
  }
  const task = await context.mutate.create({
    collection: "tasks",
    title: `Follow up: ${message.title}`,
    status: "ready",
    summary: message.summary,
    fields: { stage: "ready", assignee: String(message.fields.assignee ?? context.actor), sourceMessageId: message.id, origin: "Messages inbox" },
  }, `Task created from the message "${message.title}"`);
  await context.mutate.patch(message.id, { fields: { ...message.fields, taskId: task.id, unread: false } }, { event: `Converted to task ${task.id}` });
  context.toast("Task created", `"${task.title}" is in Projects and the thread now links to it.`);
}

function MessageInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const messages = useCollection("messages");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const message = messages.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const mail = capabilityById("email.send");

  if (!message) return <Empty title="Select a thread" icon={<Mail size={20} />}>Choose a thread to read it and reply.</Empty>;

  const restricted = csv(message.fields.restrictedTo);

  async function send() {
    setBusy(true);
    try {
      await context.mutate.create({
        collection: "messages",
        title: `Re: ${message!.title}`,
        status: "draft",
        summary: reply,
        parentId: message!.id,
        fields: { author: context.actor, authorKind: "human", channel: String(message!.fields.channel ?? "Direct"), kind: "chat", unread: false, deliveryState: "ready_local", threadId: String(message!.fields.threadId ?? message!.id) },
      }, `Reply drafted in the thread "${message!.title}"`);
      await context.mutate.patch(message!.id, { fields: { ...message!.fields, unread: false, replies: Number(message!.fields.replies ?? 0) + 1 } }, { event: "Reply added to the thread" });
      context.toast("Reply saved to the thread", "It is a record in this workspace. No mail provider is connected, so nothing was sent.");
      setReply("");
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={String(message.fields.author ?? message.ownerName)} kind={message.fields.authorKind === "ai" ? "ai" : "human"} size="lg" />
        <div className="ds-grow">
          <h3 style={{ marginBlockEnd: 2 }}>{message.title}</h3>
          <span className="ds-subtle">{String(message.fields.author ?? message.ownerName)} · {String(message.fields.channel ?? "Direct")} · {context.relative(message.at)}</span>
        </div>
      </Row>
      <p className="ds-prose">{message.summary}</p>
      <Properties rows={[
        { label: "Thread", value: String(message.fields.threadId ?? message.id) },
        { label: "Replies", value: String(message.fields.replies ?? 0) },
        { label: "Owner", value: String(message.fields.assignee ?? "Unassigned") },
        { label: "Visibility", value: restricted.length ? `Restricted to ${restricted.map((entry) => ROLE_LABELS[entry as keyof typeof ROLE_LABELS] ?? entry).join(", ")}` : "Everyone in the workspace" },
        { label: "Linked task", value: message.fields.taskId ? String(message.fields.taskId) : "None" },
      ]} />
      <Field label="Reply" hint="Saved as a message record in this thread.">
        <TextArea rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />
      </Field>
      {mail && (
        <Notice tone={CAPABILITY_TONE[mail.state] === "warning" ? "warning" : "info"} title={`${mail.label}: ${CAPABILITY_LABELS[mail.state]}`}>
          {mail.localEquivalent} {mail.note}
        </Notice>
      )}
      <Row gap={2} wrap>
        <Button variant="primary" busy={busy} disabled={!reply.trim()} onClick={() => void send()}>Save reply to the thread</Button>
        <Button variant="secondary" onClick={() => context.openOverlay("reassignment", { id: message.id })}>Reassign</Button>
        <Button variant="secondary" onClick={() => void convertToTask(context, message)}>Convert to task</Button>
        <Button variant="ghost" onClick={() => context.openOverlay("mute", { id: message.id })}>Mute</Button>
      </Row>
    </Stack>
  );
}

function Reassignment({ context, close }: { context: ScreenContext; close: () => void }) {
  const messages = useCollection("messages");
  const members = useCollection("members");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const message = messages.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!message) return <Empty title="Select a thread" />;

  return (
    <Stack gap={4}>
      <p>{message.title} is owned by {String(message.fields.assignee ?? "nobody")}.</p>
      <Field label="New owner" required>
        <Select value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose a person or an agent</option>
          {members.filter((member) => member.status === "active").map((member) => (
            <option key={member.id} value={member.title}>{member.title}{member.fields.kind === "ai" ? " (agent)" : ""}</option>
          ))}
        </Select>
      </Field>
      <Field label="Handover note" hint="Stored on the thread so the next owner knows why.">
        <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {members.find((member) => member.title === to)?.fields.kind === "ai" && (
        <Notice tone="warning" title="An agent cannot decide on this thread">
          An agent may draft a reply and summarise the thread. Anything consequential still comes back for a human decision.
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          busy={busy}
          disabled={!to}
          onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.patch(message.id, {
                fields: { ...message.fields, assignee: to, handoverNote: note, handoverBy: context.actor },
              }, { event: `Thread reassigned to ${to}${note ? `: ${note}` : ""}`, expectRevision: message.revision });
              context.toast("Reassigned", `${to} now owns the thread, and the note is on the record.`);
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Reassign thread
        </Button>
      </Row>
    </Stack>
  );
}

function MuteThread({ context, close }: { context: ScreenContext; close: () => void }) {
  const messages = useCollection("messages");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const message = messages.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [scope, setScope] = useState("thread");
  if (!message) return <Empty title="Select a thread" />;
  return (
    <Stack gap={4}>
      <Field label="What to mute">
        <Select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="thread">This thread</option>
          <option value="channel">The channel {String(message.fields.channel ?? "")}</option>
        </Select>
      </Field>
      <Notice tone="warning" title="Muting never hides a security escalation">
        Security and platform items keep their floor priority and are delivered on every enabled channel. Muting applies to
        conversation activity only.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(message.id, { fields: { ...message.fields, muted: true, mutedScope: scope, mutedBy: context.actor } }, { event: `Muted ${scope === "thread" ? "thread" : `channel ${String(message.fields.channel ?? "")}`}` });
          context.toast("Muted", scope === "thread" ? "This thread will not raise new items for you." : "The channel will not raise new items for you.");
          close();
        }}
      >
        Mute {scope === "thread" ? "thread" : "channel"}
      </Button>
    </Stack>
  );
}

/* ---------------------------- INBOX-004 ---------------------------- */

type FeedTab = "All" | "Milestones" | "Routine" | "Archived";

function NotificationsFeed({ context, tab }: { context: ScreenContext; tab: FeedTab }) {
  const { items, data } = useInboxData();
  const [source, setSource] = useState("all");
  const sources = [...new Set(items.map((item) => item.sourceLabel))].sort();

  const base = tab === "Archived" ? items.filter((item) => item.resolved) : items.filter((item) => !item.resolved);
  const byCategory = tab === "Milestones" ? base.filter((item) => item.category === "milestone") : tab === "Routine" ? base.filter((item) => item.category !== "milestone") : base;
  const rows = source === "all" ? byCategory : byCategory.filter((item) => item.sourceLabel === source);
  usePublishedItems(rows);

  const grouped = groupBy(rows, (item) => item.group);
  const followed = data.preferences.filter((record) => record.fields.kind === "followedSource");

  return (
    <Grid>
      <Card eyebrow="FEED" prov="posted" span={8} title={`${tab} · ${rows.length}`} subtitle="Company events with their source and time" flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Notifications"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Event detail", { itemId: id }); }}
          columns={queueColumns(context)}
          bulkActions={bulkTriageActions(context)}
          toolbar={
            <Row gap={2} wrap>
              <Select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="all">Every source</option>
                {sources.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("grouped items", { group: grouped[0]?.label })}>Open a group</Button>
            </Row>
          }
          empty={<Empty title={tab === "Archived" ? "Nothing archived" : "No events"} icon={<Bell size={20} />}>Events are written by the applications in this workspace as records change.</Empty>}
        />
      </Card>
      <Stack gap={4} className="ds-col-4">
        <Card eyebrow="GROUPS" prov="posted" span={4} title="Grouped" subtitle="Related work collapsed into one line">
          <Stack gap={2}>
            {grouped.map((group) => (
              <Row key={group.label} gap={2}>
                <Button variant="ghost" className="ds-grow" style={{ justifyContent: "flex-start" }} onClick={() => context.openOverlay("grouped items", { group: group.label })}>
                  {group.label}
                </Button>
                <Pill>{group.rows.length}</Pill>
              </Row>
            ))}
            {grouped.length === 0 && <span className="ds-subtle">Nothing to group.</span>}
          </Stack>
        </Card>
        <Card eyebrow="SOURCES" prov="human" span={4} title="Sources you follow" subtitle={`${followed.length} followed`}>
          <Stack gap={2}>
            {sources.map((entry) => {
              const record = followed.find((row) => String(row.fields.source) === entry);
              return (
                <Row key={entry} gap={2}>
                  <span className="ds-grow">{entry}</span>
                  <Switch
                    label={`Follow ${entry}`}
                    checked={Boolean(record)}
                    onChange={async (next) => {
                      if (next) {
                        await context.mutate.create({ collection: "preferences", title: `Following ${entry}`, status: "active", summary: `Every event from ${entry} stays in the feed.`, fields: { kind: "followedSource", source: entry } }, `Followed the ${entry} source`);
                        context.toast("Following", `${entry} events stay in your feed.`);
                      } else if (record) {
                        await context.mutate.remove(record.id, `Stopped following the ${entry} source`);
                        context.toast("Unfollowed", `${entry} events will only appear in digests.`);
                      }
                    }}
                  />
                </Row>
              );
            })}
          </Stack>
        </Card>
      </Stack>
    </Grid>
  );
}

function EventDetail({ context }: { context: ScreenContext }) {
  const { items, rules } = useInboxData();
  const { role } = useWorkspace();
  const payload = context.overlayPayload as { itemId?: string } | undefined;
  const item = items.find((row) => row.id === (payload?.itemId ?? context.selectedId));
  if (!item) return <Empty title="Select an event" icon={<Bell size={20} />}>Choose a row to see its source and its deep link.</Empty>;
  return (
    <Stack gap={4}>
      <Row gap={2} wrap><PriorityTag priority={item.priority} /><Pill>{item.category}</Pill><StateTags item={item} /></Row>
      <div>
        <h3 style={{ marginBlockEnd: 4 }}>{item.title}</h3>
        <p>{item.body}</p>
      </div>
      <Properties rows={[
        { label: "Source", value: item.sourceLabel },
        { label: "Recorded", value: context.dateTime(item.at) },
        { label: "Deep link", value: item.route ? <span className="ds-num">{item.route.replace(":org", context.org.slug)}</span> : "None" },
        { label: "Target record", value: item.entityId ?? "None" },
      ]} />
      <DeepLink item={item} context={context} />
      <Notice tone="info" title="Routing">{routeReason(item, rules, role)}</Notice>
    </Stack>
  );
}

function GroupedItems({ context }: { context: ScreenContext }) {
  const { items } = useInboxData();
  const payload = context.overlayPayload as { group?: string } | undefined;
  const group = payload?.group ?? groupBy(items, (item) => item.group)[0]?.label;
  const rows = items.filter((item) => item.group === group);
  if (!group || rows.length === 0) return <Empty title="No group selected" icon={<Bell size={20} />}>Choose a group from the feed.</Empty>;
  return (
    <Stack gap={4}>
      <h3>{group} · {rows.length} {rows.length === 1 ? "item" : "items"}</h3>
      <Stack gap={2}>
        {rows.map((item) => (
          <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
            <PriorityTag priority={item.priority} />
            <div className="ds-grow">
              <strong>{item.title}</strong>
              <p className="ds-subtle">{item.body}</p>
              <span className="ds-subtle">{item.sourceLabel} · {context.relative(item.at)}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => openItem(context, item)}>Open</Button>
          </Row>
        ))}
      </Stack>
      <Button
        variant="primary"
        onClick={() => context.openOverlay("action preview", { itemIds: rows.filter((item) => !item.read).map((item) => item.id), intent: "read" })}
      >
        Mark the group read
      </Button>
    </Stack>
  );
}

function PreferenceQuickView({ context }: { context: ScreenContext }) {
  const { channels, categories } = useInboxData();
  return (
    <Stack gap={4}>
      <Properties rows={channels.map((channel) => ({
        label: channel.title,
        value: <Pill tone={channel.fields.enabled === true ? "success" : "neutral"}>{channel.fields.enabled === true ? `On, from ${String(channel.fields.minPriority)}` : "Off"}</Pill>,
      }))} />
      <Properties rows={categories.map((category) => ({
        label: category.title,
        value: category.fields.digestOnly === true ? "Digest only" : `In-app${category.fields.email === true ? ", email" : ""}${category.fields.push === true ? ", push" : ""}`,
      }))} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/settings`)}>Open notification preferences</Button>
    </Stack>
  );
}

/* ---------------------------- INBOX-005 ---------------------------- */

type IncidentTab = "Urgent" | "Waiting" | "Resolved" | "Security";

function IncidentBoard({ context, tab }: { context: ScreenContext; tab: IncidentTab }) {
  const incidents = useCollection("incidents");
  const rows = tab === "Security"
    ? incidents.filter((row) => row.fields.category === "security")
    : incidents.filter((row) => row.status === tab.toLowerCase());
  const lanes: { label: string; rows: Rec[] }[] = [
    { label: "Needs action now", rows: rows.filter((row) => row.fields.severity === "sev1") },
    { label: "Serious", rows: rows.filter((row) => row.fields.severity === "sev2") },
    { label: "Tracked", rows: rows.filter((row) => row.fields.severity === "sev3") },
  ];
  const osPermission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  return (
    <Stack gap={4}>
      <Notice tone={osPermission === "granted" ? "info" : "warning"} title={`Critical alerts outside this tab: ${osPermission === "granted" ? "allowed by the browser" : osPermission === "denied" ? "blocked by the browser" : osPermission === "unsupported" ? "not supported here" : "not granted"}`}>
        A sev1 alert can only leave this tab if the browser has been given permission, and that is the operating system's decision, not
        ours. Nothing is requested in the background: the Preferences screen asks for it only when you press the button there.
      </Notice>
      <Grid>
        {lanes.map((lane) => (
          <Card key={lane.label} eyebrow="INCIDENTS" prov="human" span={4} title={lane.label} subtitle={`${lane.rows.length} ${lane.rows.length === 1 ? "incident" : "incidents"}`}>
            {lane.rows.length === 0 ? (
              <Empty title="Clear" icon={<ShieldAlert size={18} />}>Nothing at this severity.</Empty>
            ) : (
              <Stack gap={3}>
                {lane.rows.map((row) => (
                  <div key={row.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <Row gap={2} wrap>
                      <Pill tone={row.fields.severity === "sev1" ? "danger" : row.fields.severity === "sev2" ? "warning" : "neutral"} dot>{String(row.fields.severity).toUpperCase()}</Pill>
                      <Pill>{String(row.fields.service ?? "")}</Pill>
                      {row.fields.category === "security" && <Pill tone="danger">Security</Pill>}
                      {row.fields.acknowledgedBy ? <Pill tone="info">Acknowledged</Pill> : null}
                    </Row>
                    <strong style={{ display: "block", marginBlockStart: "var(--space-2)" }}>{row.title}</strong>
                    <p className="ds-subtle">{row.summary}</p>
                    <Properties rows={[
                      { label: "Owner", value: String(row.fields.owner ?? "Unassigned") },
                      { label: "Escalation", value: String(row.fields.escalation ?? "No route set") },
                      { label: "Raised", value: context.relative(row.at) },
                    ]} />
                    <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                      <Button size="sm" variant="secondary" onClick={() => { context.select(row.id); context.openOverlay("Incident summary", { id: row.id }); }}>Summary</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(row.fields.acknowledgedBy)}
                        onClick={async () => {
                          await context.mutate.patch(row.id, { status: row.status === "urgent" ? "waiting" : row.status, fields: { ...row.fields, acknowledgedBy: context.actor, acknowledgedAt: new Date().toISOString() } }, { event: `Incident acknowledged: ${row.title}`, expectRevision: row.revision });
                          context.toast("Acknowledged", "The incident record now names you and the time.");
                        }}
                      >
                        Acknowledge
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { context.select(row.id); context.openOverlay("owner handoff", { id: row.id }); }}>Hand over</Button>
                    </Row>
                  </div>
                ))}
              </Stack>
            )}
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

function IncidentSummary({ context }: { context: ScreenContext }) {
  const incidents = useCollection("incidents");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = incidents.find((row) => row.id === (payload?.id ?? context.selectedId));
  if (!record) return <Empty title="Select an incident" icon={<ShieldAlert size={20} />}>Choose an incident from the board.</Empty>;
  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <Pill tone={record.fields.severity === "sev1" ? "danger" : "warning"} dot>{String(record.fields.severity).toUpperCase()}</Pill>
        <Pill>{String(record.fields.service ?? "")}</Pill>
        <Pill tone={record.status === "resolved" ? "success" : "neutral"}>{record.status}</Pill>
      </Row>
      <div><h3 style={{ marginBlockEnd: 4 }}>{record.title}</h3><p>{record.summary}</p></div>
      <Properties rows={[
        { label: "Impact", value: String(record.fields.impact ?? "Not recorded") },
        { label: "What the records show", value: String(record.fields.diagnosis ?? "No diagnosis recorded") },
        { label: "Safe recovery", value: String(record.fields.recovery ?? "No recovery step recorded") },
        { label: "Owner", value: String(record.fields.owner ?? "Unassigned") },
        { label: "Escalation route", value: String(record.fields.escalation ?? "None") },
        { label: "Acknowledged", value: record.fields.acknowledgedBy ? `${String(record.fields.acknowledgedBy)} · ${context.relative(String(record.fields.acknowledgedAt ?? record.updatedAt))}` : "Not yet" },
      ]} />
      <Notice tone="info" title="Diagnosis comes from records, not a guess">
        Every line above is stored on this incident record. Where a cause is unknown the field says so rather than offering a likely
        story.
      </Notice>
      <Row gap={2} wrap>
        <Button
          variant="primary"
          disabled={record.status === "resolved"}
          onClick={async () => {
            await context.mutate.patch(record.id, { status: "resolved", fields: { ...record.fields, resolvedBy: context.actor, resolvedAt: new Date().toISOString() } }, { event: `Incident resolved: ${record.title}`, expectRevision: record.revision });
            context.toast("Resolved", "The incident moved to Resolved with your name and the time.");
          }}
        >
          Mark resolved
        </Button>
        <Button variant="secondary" onClick={() => context.openOverlay("owner handoff", { id: record.id })}>Hand over</Button>
        {record.fields.severity === "sev1" && <Button variant="outline-danger" onClick={() => context.openOverlay("emergency pause", { id: record.id })}>Emergency pause…</Button>}
      </Row>
    </Stack>
  );
}

function OwnerHandoff({ context, close }: { context: ScreenContext; close: () => void }) {
  const incidents = useCollection("incidents");
  const members = useCollection("members");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = incidents.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [to, setTo] = useState("");
  const [brief, setBrief] = useState("");
  if (!record) return <Empty title="Select an incident" />;
  return (
    <Stack gap={4}>
      <p>{record.title} is owned by {String(record.fields.owner ?? "nobody")}.</p>
      <Field label="Hand over to" required>
        <Select value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose a person</option>
          {members.filter((member) => member.fields.kind === "human" && member.status === "active").map((member) => (
            <option key={member.id} value={member.title}>{member.title}</option>
          ))}
        </Select>
      </Field>
      <Field label="What they need to know" required hint="Written onto the incident so the next owner starts from the facts.">
        <TextArea rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Rig is isolated; second circuit is free; client viewing at 14:00." />
      </Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!to || !brief.trim()}
          onClick={async () => {
            await context.mutate.patch(record.id, {
              fields: { ...record.fields, owner: to, handoverBrief: brief, handoverBy: context.actor, handoverAt: new Date().toISOString() },
            }, { event: `Incident handed to ${to}: ${brief}`, expectRevision: record.revision });
            context.toast("Handed over", `${to} owns the incident and the brief is on the record.`);
            close();
          }}
        >
          Hand over
        </Button>
      </Row>
    </Stack>
  );
}

function EmergencyPause({ context, close }: { context: ScreenContext; close: () => void }) {
  const organisation = useRecord(context.org.id);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const paused = organisation?.fields.executionPaused === true;

  return (
    <Stack gap={4}>
      <Notice tone="danger" title={paused ? "Automation is paused" : "This stops every agent and mission step"}>
        Pausing writes to the organisation record. Agents stop taking steps, missions hold at their current step, and nothing is
        discarded. People keep working as normal.
      </Notice>
      <Properties rows={[
        { label: "Organisation", value: context.org.name },
        { label: "Current state", value: <Pill tone={paused ? "danger" : "success"}>{paused ? "Paused" : "Running"}</Pill> },
        { label: "Changed by", value: String(organisation?.fields.pausedBy ?? "Nobody yet") },
      ]} />
      {paused ? (
        <Button
          variant="primary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await context.mutate.patch(context.org.id, { fields: { ...(organisation?.fields ?? {}), executionPaused: false, pausedBy: context.actor } }, { event: "Automation resumed from an incident" });
              context.toast("Resumed", "Agents and missions may take steps again.");
              close();
            } finally { setBusy(false); }
          }}
        >
          Resume automation
        </Button>
      ) : (
        <>
          <Field label="Type PAUSE to confirm" required>
            <TextInput value={phrase} onChange={(event) => setPhrase(event.target.value.toUpperCase())} autoComplete="off" />
          </Field>
          <Button
            variant="outline-danger"
            busy={busy}
            disabled={phrase !== "PAUSE"}
            onClick={async () => {
              setBusy(true);
              try {
                await context.mutate.patch(context.org.id, { fields: { ...(organisation?.fields ?? {}), executionPaused: true, pausedBy: context.actor } }, { event: "Automation paused from an incident" });
                context.toast("Paused", "Every agent and mission step is held. The organisation record carries the pause.", "blocked");
                close();
              } finally { setBusy(false); }
            }}
          >
            Pause all automation
          </Button>
        </>
      )}
    </Stack>
  );
}

/* ---------------------------- INBOX-006 ---------------------------- */

function ChannelSettings({ context }: { context: ScreenContext }) {
  const { channels } = useInboxData();
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Two of these channels cannot deliver anything yet">
        Email and SMS need a provider. Until one is connected, an item routed to them is kept as a local draft and the inbox stays the
        channel that actually works.
      </Notice>
      <Grid>
        {channels.map((channel) => {
          const capability = capabilityById(String(channel.fields.capability ?? ""));
          return (
            <Card key={channel.id} eyebrow="CHANNEL" prov="human" span={6} title={channel.title} subtitle={channel.summary}>
              <Stack gap={3}>
                <Row gap={3}>
                  <span className="ds-grow">Deliver to this channel</span>
                  <Switch
                    label={`${channel.title} enabled`}
                    checked={channel.fields.enabled === true}
                    onChange={async (next) => {
                      if (channel.fields.locked === true) {
                        context.toast("Cannot be turned off", "The in-app inbox is the only channel that always works, so it stays on.", "blocked");
                        return;
                      }
                      await context.mutate.patch(channel.id, { fields: { ...channel.fields, enabled: next } }, { event: `${channel.title} ${next ? "enabled" : "disabled"}`, expectRevision: channel.revision });
                      context.toast(next ? "Channel on" : "Channel off", `${channel.title} is ${next ? "on" : "off"} for this workspace.`);
                    }}
                  />
                </Row>
                <Field label="Lowest priority delivered">
                  <Select
                    value={String(channel.fields.minPriority ?? "P3")}
                    onChange={async (event) => {
                      await context.mutate.patch(channel.id, { fields: { ...channel.fields, minPriority: event.target.value } }, { event: `${channel.title} floor set to ${event.target.value}` });
                      context.toast("Floor changed", `${channel.title} now delivers ${event.target.value} and above.`);
                    }}
                  >
                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority} · {PRIORITY_LABEL[priority]}</option>)}
                  </Select>
                </Field>
                {capability ? (
                  <Notice tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : "warning"} title={`${capability.provider}: ${CAPABILITY_LABELS[capability.state]}`}>
                    {capability.localEquivalent}
                  </Notice>
                ) : (
                  <Notice tone={channel.fields.capability === "local" ? "success" : "info"} title={channel.fields.capability === "local" ? "Works with no provider" : "Needs the browser's permission"}>
                    {channel.fields.capability === "local"
                      ? "Shown in this browser, immediately, with nothing sent anywhere."
                      : "The browser decides whether anything may be shown outside this tab."}
                  </Notice>
                )}
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Delivery test", { id: channel.id })}>Test this channel</Button>
              </Stack>
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

function CategorySettings({ context }: { context: ScreenContext }) {
  const { categories } = useInboxData();
  return (
    <Card eyebrow="CATEGORIES" prov="human" title="Categories" subtitle="What each kind of item is allowed to do" flush>
      <DataGrid
        rows={categories}
        rowId={(row) => row.id}
        label="Notification categories"
        columns={[
          { key: "title", header: "Category", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "inApp", header: "Inbox", cell: () => <Pill tone="success">Always</Pill> },
          {
            key: "email", header: "Email", cell: (row) => (
              <Checkbox
                label={`Email for ${row.title}`}
                checked={row.fields.email === true}
                onChange={async (event) => {
                  await context.mutate.patch(row.id, { fields: { ...row.fields, email: event.target.checked } }, { event: `${row.title}: email ${event.target.checked ? "on" : "off"}` });
                }}
              />
            ),
          },
          {
            key: "push", header: "Push", cell: (row) => (
              <Checkbox
                label={`Push for ${row.title}`}
                checked={row.fields.push === true}
                disabled={row.fields.securityFloor === true}
                onChange={async (event) => {
                  await context.mutate.patch(row.id, { fields: { ...row.fields, push: event.target.checked } }, { event: `${row.title}: push ${event.target.checked ? "on" : "off"}` });
                }}
              />
            ),
          },
          {
            key: "floor", header: "Floor", align: "end",
            cell: (row) => (row.fields.securityFloor === true
              ? <Pill tone="danger">P1 floor, cannot be muted</Pill>
              : row.fields.digestOnly === true ? <Pill tone="info">Digest only</Pill> : <Pill>{String(row.fields.minPriority ?? "P3")}</Pill>),
          },
        ]}
        empty={<Empty title="No categories" />}
      />
    </Card>
  );
}

function ScheduleSettings({ context }: { context: ScreenContext }) {
  const { quietHours, digests } = useInboxData();
  return (
    <Grid>
      <Card eyebrow="SCHEDULE" prov="human" span={7} title="Quiet hours and focus" subtitle={`${quietHours.length} windows`} actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("quiet-hour rules")}>Add a window</Button>}>
        <Stack gap={3}>
          {quietHours.map((window) => (
            <div key={window.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Row gap={2} wrap>
                <strong className="ds-grow">{window.title}</strong>
                <Pill tone={window.status === "active" ? "success" : "neutral"}>{window.status}</Pill>
              </Row>
              <p className="ds-subtle">{window.summary}</p>
              <Properties rows={[
                { label: "From", value: `${String(window.fields.start)} to ${String(window.fields.end)} (${String(window.fields.timezone ?? context.org.timezone)})` },
                { label: "Days", value: String(window.fields.days ?? "Every day") },
                { label: "Still delivered", value: `${String(window.fields.allowAbove ?? "P1")} and above` },
              ]} />
              <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const next = window.status === "active" ? "paused" : "active";
                    await context.mutate.patch(window.id, { status: next }, { event: `${window.title} ${next}`, expectRevision: window.revision });
                    context.toast(next === "active" ? "Window on" : "Window paused", `${window.title} is ${next}.`);
                  }}
                >
                  {window.status === "active" ? "Pause" : "Resume"}
                </Button>
              </Row>
            </div>
          ))}
        </Stack>
      </Card>
      <Card eyebrow="DIGESTS" prov="human" span={5} title="Digests" subtitle={`${digests.length} scheduled`}>
        <Stack gap={3}>
          {digests.map((digest) => (
            <Row key={digest.id} gap={2} wrap>
              <div className="ds-grow">
                <strong>{digest.title}</strong>
                <p className="ds-subtle">{String(digest.fields.cadence)} · {String(digest.fields.sendAt)}</p>
              </div>
              <Pill tone={digest.fields.paused === true ? "neutral" : "success"}>{digest.fields.paused === true ? "Paused" : "On"}</Pill>
            </Row>
          ))}
          <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/inbox/digests`)}>Open the digest centre</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

function DelegationSettings({ context }: { context: ScreenContext }) {
  const { rules } = useInboxData();
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Delegation here is about delivery, not authority">
        Sending a copy to a backup never gives them a decision they do not already hold. Authority lives in Escalations and in
        Administration.
      </Notice>
      <Card eyebrow="DELEGATION" prov="human" title="Who else sees your items" flush>
        <DataGrid
          rows={rules}
          rowId={(row) => row.id}
          label="Delegation rules"
          columns={[
            { key: "title", header: "Rule", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => row.title },
            { key: "owner", header: "Owner", cell: (row) => String(row.fields.owner ?? "") },
            { key: "backup", header: "Backup", cell: (row) => String(row.fields.backup ?? "") },
            { key: "after", header: "After", align: "end", cell: (row) => `${Number(row.fields.timerMinutes ?? 0) / 60} h` },
            { key: "state", header: "State", align: "end", cell: (row) => <Pill tone={row.fields.enabled === true ? "success" : "neutral"}>{row.fields.enabled === true ? "On" : "Off"}</Pill> },
          ]}
          onOpen={() => context.navigate(`/o/${context.org.slug}/inbox/escalations`)}
          empty={<Empty title="No delegation" icon={<Users size={20} />}>Add a rule in Escalations so nothing waits on one person.</Empty>}
        />
      </Card>
    </Stack>
  );
}

function DeliveryTest({ context, close }: { context: ScreenContext; close: () => void }) {
  const { channels } = useInboxData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const channel = channels.find((row) => row.id === payload?.id) ?? channels[0];
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!channel) return <Empty title="No channel" />;
  const capability = capabilityById(String(channel.fields.capability ?? ""));

  return (
    <Stack gap={4}>
      <h3>{channel.title}</h3>
      <p>{channel.summary}</p>
      {capability && (
        <Notice tone="warning" title={`${capability.provider}: ${CAPABILITY_LABELS[capability.state]}`}>
          {capability.note} {capability.localEquivalent}
        </Notice>
      )}
      <Button
        variant="primary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const target = String(channel.fields.channel);
            if (target === "in_app") {
              context.toast("Test delivered", "This toast is the in-app channel working, with nothing sent anywhere.");
              setResult("Delivered in this browser.");
            } else if (target === "push") {
              if (typeof Notification === "undefined") {
                setResult("This browser does not support notifications outside the tab.");
              } else if (Notification.permission === "granted") {
                setResult("The browser has already granted permission. A real alert would appear outside this tab.");
              } else if (Notification.permission === "denied") {
                setResult("The browser has blocked notifications. Only the operating system can change that.");
              } else {
                const permission = await Notification.requestPermission();
                setResult(permission === "granted" ? "Permission granted by the browser." : "Permission was not granted, so nothing can be shown outside this tab.");
              }
            } else {
              setResult(`No ${target} provider is connected, so the test was kept as a local draft instead of being sent.`);
            }
            await context.mutate.log(`Delivery test on the ${channel.title} channel.`, { entityId: channel.id, type: "delivery.test", capability: target === "in_app" ? "ready_local" : "not_connected" });
          } finally {
            setBusy(false);
          }
        }}
      >
        Run the test
      </Button>
      {result && <Notice tone="info" title="Result">{result}</Notice>}
      <Row gap={2}><span className="ds-grow" /><Button variant="ghost" onClick={close}>Close</Button></Row>
    </Stack>
  );
}

function QuietHourRules({ context, close }: { context: ScreenContext; close: () => void }) {
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("08:00");
  const [allow, setAllow] = useState("P1");
  const [days, setDays] = useState("Mon,Tue,Wed,Thu,Fri");
  return (
    <form
      id="quiet-hours"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: `Quiet ${start}–${end}`,
          status: "active",
          summary: `Nothing below ${allow} is delivered between ${start} and ${end}.`,
          fields: { kind: "quietHours", start, end, days, allowAbove: allow, timezone: context.org.timezone },
        }, `Quiet hours added: ${start}–${end}`);
        context.toast("Window added", "It is in your schedule and applies from now.");
        close();
      }}
    >
      <Row gap={3} wrap>
        <Field label="From" required><TextInput type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
        <Field label="Until" required><TextInput type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></Field>
      </Row>
      <Field label="Days"><TextInput value={days} onChange={(event) => setDays(event.target.value)} /></Field>
      <Field label="Still deliver" hint="Security items keep their own floor whatever you choose here.">
        <Select value={allow} onChange={(event) => setAllow(event.target.value)}>
          {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority} and above</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Security escalations are independent">
        A quiet window never applies to a security or platform item. Those keep delivering so a muted inbox cannot hide an access
        problem.
      </Notice>
    </form>
  );
}

function ExceptionExplanation({ context }: { context: ScreenContext }) {
  const { rules, categories } = useInboxData();
  const floor = rules.find((rule) => rule.fields.securityFloor === true);
  const securityCategory = categories.find((row) => row.fields.securityFloor === true);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Why some items arrive anyway">
        Muting, quiet hours and focus blocks apply to ordinary work. They are deliberately unable to suppress a security or platform
        item, because the person who most wants those silenced is rarely the person who should decide.
      </Notice>
      <Properties rows={[
        { label: "Security floor", value: securityCategory ? `${String(securityCategory.fields.minPriority)} and above` : "P1 and above" },
        { label: "Rule", value: floor?.title ?? "Security escalations" },
        { label: "Escalates after", value: floor ? `${Number(floor.fields.timerMinutes)} minutes` : "15 minutes" },
        { label: "Channels used", value: "Every channel that is enabled, regardless of a quiet window" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/admin/security`)}>Security and sessions</Button>
    </Stack>
  );
}

/* ---------------------------- INBOX-007 ---------------------------- */

type DigestTab = "Daily" | "Weekly" | "Custom" | "History";

interface BriefLine {
  label: string;
  value: string;
  source: string;
  known: boolean;
}

function useBriefLines(): BriefLine[] {
  const { items, data } = useInboxData();
  const { now } = useWorkspace();
  const live = activeQueue(items);
  const ledger = freshness(data.invoices.map((row) => row.at ?? row.updatedAt).sort().at(-1), now, 3);
  const overdue = data.invoices.filter((row) => row.dueAt && new Date(row.dueAt) < now && !["paid", "void", "draft"].includes(row.status));

  return [
    { label: "Decisions waiting", value: String(live.filter((item) => item.kind === "approval").length), source: `${data.approvals.length} approval records`, known: true },
    { label: "Items needing attention", value: String(live.length), source: "Attention engine, derived from records in this browser", known: true },
    { label: "Invoices past due", value: String(overdue.length), source: `${data.invoices.length} invoice records with a due date`, known: true },
    { label: "Open incidents", value: String(data.incidents.filter((row) => row.status !== "resolved").length), source: `${data.incidents.length} incident records`, known: true },
    { label: "Missions waiting on a person", value: String(data.missions.filter((row) => ["needs_decision", "blocked", "paused"].includes(row.status)).length), source: `${data.missions.length} mission records`, known: true },
    { label: "Bank balance", value: "Unavailable", source: "No bank feed is connected; balances would come from a provider", known: false },
    { label: "Model spend", value: "Unavailable", source: "No model provider is connected, so no token spend exists to report", known: false },
    { label: "Invoice records last changed", value: ledger.known ? `${ledger.days} days ago` : "Unknown", source: "Latest invoice record timestamp", known: ledger.known },
  ];
}

function DigestCentre({ context, tab }: { context: ScreenContext; tab: DigestTab }) {
  const { digests } = useInboxData();
  const lines = useBriefLines();
  const rows = tab === "History"
    ? digests.filter((row) => row.fields.lastBuiltAt)
    : digests.filter((row) => String(row.fields.cadence ?? "") === tab.toLowerCase());

  if (tab === "History") {
    return (
      <Card eyebrow="HISTORY" prov="posted" title="Built before" subtitle="When each digest was last composed in this browser" flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Digest history"
          columns={[
            { key: "title", header: "Digest", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "cadence", header: "Cadence", cell: (row) => String(row.fields.cadence) },
            { key: "channel", header: "Channel", cell: (row) => <Pill tone={row.fields.channel === "email" ? "warning" : "success"}>{row.fields.channel === "email" ? "Email · not connected" : "Inbox"}</Pill> },
            { key: "built", header: "Last built", align: "end", cell: (row) => <span className="ds-num">{context.dateTime(String(row.fields.lastBuiltAt ?? ""))}</span>, sortValue: (row) => String(row.fields.lastBuiltAt ?? "") },
          ]}
          empty={<Empty title="No digest has been built yet" icon={<CalendarClock size={20} />}>Press Preview on a digest to compose one from the current records.</Empty>}
        />
      </Card>
    );
  }

  return (
    <Grid>
      <Card eyebrow="DIGESTS" prov="human" span={7} title={`${tab} digests`} subtitle={`${rows.length} configured`} flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${tab} digests`}
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Digest editor", { id }); }}
          columns={[
            { key: "title", header: "Digest", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "sendAt", header: "When", cell: (row) => String(row.fields.sendAt) },
            { key: "recipients", header: "Recipients", hideBelow: 1100, cell: (row) => csv(row.fields.recipients).join(", ") },
            { key: "sections", header: "Sections", hideBelow: 1280, cell: (row) => csv(row.fields.sections).length + " sections" },
            { key: "state", header: "State", align: "end", cell: (row) => <Pill tone={row.fields.paused === true ? "neutral" : "success"}>{row.fields.paused === true ? "Paused" : "Scheduled"}</Pill> },
          ]}
          empty={<Empty title={`No ${tab.toLowerCase()} digest`} icon={<CalendarClock size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Digest editor")}>New digest</Button>}>A digest collects routine items so they arrive once instead of all day.</Empty>}
        />
      </Card>
      <Card eyebrow="BRIEF" prov="posted" span={5} title="Brief as it stands now" subtitle="Every line names where it came from">
        <Stack gap={3}>
          {lines.map((line) => (
            <Row key={line.label} gap={3} style={{ alignItems: "flex-start" }}>
              <div className="ds-grow">
                <strong>{line.label}</strong>
                <p className="ds-subtle">{line.source}</p>
              </div>
              <strong className="ds-num" data-unavailable={line.known ? undefined : "true"} style={{ color: line.known ? undefined : "var(--fg-subtle)" }}>{line.value}</strong>
            </Row>
          ))}
          <Notice tone="info" title="No figure is invented">
            Where a source is not connected the line says Unavailable instead of a number. A digest with a missing total is more useful
            than one with a confident guess.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

function DigestEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { digests } = useInboxData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = digests.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [title, setTitle] = useSeeded(existing?.title ?? "");
  const [cadence, setCadence] = useSeeded(String(existing?.fields.cadence ?? "daily"));
  const [sendAt, setSendAt] = useSeeded(String(existing?.fields.sendAt ?? "07:30"));
  const [sections, setSections] = useSeededList(typeof existing?.fields.sections === "string" ? existing.fields.sections : "approvals,overdue");
  const [error, setError] = useState("");

  const all = ["approvals", "overdue", "missions", "work", "incidents", "activity", "updates", "ledger"];

  return (
    <form
      id="digest-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) { setError("Give the digest a name so people know what it is."); return; }
        if (sections.length === 0) { setError("Choose at least one section; an empty digest would say nothing."); return; }
        setError("");
        if (existing) {
          await context.mutate.patch(existing.id, {
            title,
            summary: `${sections.length} sections, ${cadence} at ${sendAt}.`,
            fields: { ...existing.fields, cadence, sendAt, sections: sections.join(",") },
          }, { event: `Digest updated: ${title}`, expectRevision: existing.revision });
          context.toast("Digest saved", `${title} now has ${sections.length} sections.`);
        } else {
          await context.mutate.create({
            collection: "preferences",
            title,
            status: "active",
            summary: `${sections.length} sections, ${cadence} at ${sendAt}.`,
            fields: { kind: "digest", cadence, sendAt, sections: sections.join(","), recipients: context.actor, channel: "in_app" },
          }, `Digest created: ${title}`);
          context.toast("Digest created", "It is scheduled in this browser and composes from records when it runs.");
        }
        close();
      }}
    >
      <Field label="Name" required error={error && !title.trim() ? error : undefined}>
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Morning brief" required />
      </Field>
      <Row gap={3} wrap>
        <Field label="Cadence">
          <Select value={cadence} onChange={(event) => setCadence(event.target.value)}>
            {["daily", "weekly", "custom"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </Select>
        </Field>
        <Field label="When"><TextInput value={sendAt} onChange={(event) => setSendAt(event.target.value)} /></Field>
      </Row>
      <Field label="Sections" error={error && sections.length === 0 ? error : undefined}>
        <Stack gap={2}>
          {all.map((section) => (
            <Checkbox
              key={section}
              label={section}
              checked={sections.includes(section)}
              onChange={(event) => setSections((current) => (event.target.checked ? [...current, section] : current.filter((entry) => entry !== section)))}
            />
          ))}
        </Stack>
      </Field>
      <Notice tone="info">A digest is composed when it runs, from the records as they are then. Nothing is pre-written.</Notice>
    </form>
  );
}

function DigestAudience({ context, close }: { context: ScreenContext; close: () => void }) {
  const { digests } = useInboxData();
  const members = useCollection("members");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const digest = digests.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? digests[0];
  const [chosen, setChosen] = useSeededList(typeof digest?.fields.recipients === "string" ? digest.fields.recipients : "");
  if (!digest) return <Empty title="No digest selected" />;
  return (
    <Stack gap={4}>
      <h3>{digest.title}</h3>
      <Stack gap={2}>
        {members.filter((member) => member.fields.kind === "human").map((member) => (
          <Checkbox
            key={member.id}
            label={`${member.title} · ${String(member.fields.title ?? member.fields.role ?? "")}`}
            checked={chosen.includes(member.title)}
            onChange={(event) => setChosen((current) => (event.target.checked ? [...current, member.title] : current.filter((entry) => entry !== member.title)))}
          />
        ))}
      </Stack>
      <Notice tone="info" title="Each recipient sees their own version">
        A digest is built per person from the items routed to their role view, so a recipient never reads something their view does not
        hold.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.patch(digest.id, { fields: { ...digest.fields, recipients: chosen.join(",") } }, { event: `Digest audience set to ${chosen.join(", ") || "nobody"}`, expectRevision: digest.revision });
            context.toast("Audience saved", `${chosen.length} ${chosen.length === 1 ? "person" : "people"} on ${digest.title}.`);
            close();
          }}
        >
          Save audience
        </Button>
      </Row>
    </Stack>
  );
}

function DigestSchedule({ context, close }: { context: ScreenContext; close: () => void }) {
  const { digests } = useInboxData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const digest = digests.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? digests[0];
  const [sendAt, setSendAt] = useSeeded(String(digest?.fields.sendAt ?? "07:30"));
  if (!digest) return <Empty title="No digest selected" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Digest", value: digest.title },
        { label: "Cadence", value: String(digest.fields.cadence) },
        { label: "Time zone", value: context.org.timezone },
        { label: "Last built", value: digest.fields.lastBuiltAt ? context.dateTime(String(digest.fields.lastBuiltAt)) : "Never" },
      ]} />
      <Field label="Send at" hint="Written in the workspace time zone.">
        <TextInput value={sendAt} onChange={(event) => setSendAt(event.target.value)} />
      </Field>
      <Notice tone="warning" title="A browser cannot wake itself up">
        A scheduled digest is composed the next time this workspace is open. Nothing runs while the tab is closed, so the schedule is a
        statement of intent, not a server job.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.patch(digest.id, { fields: { ...digest.fields, sendAt } }, { event: `Digest schedule set to ${sendAt}`, expectRevision: digest.revision });
            context.toast("Schedule saved", `${digest.title} is set for ${sendAt}.`);
            close();
          }}
        >
          Save schedule
        </Button>
      </Row>
    </Stack>
  );
}

async function buildDigestPreview(context: ScreenContext, digest: Rec | undefined, lines: BriefLine[]) {
  const name = digest?.title ?? "Brief";
  const body = lines.map((line) => `${line.label}: ${line.value} — ${line.source}`).join("\n");
  await context.mutate.create({
    collection: "documents",
    title: `${name} · ${context.date(new Date())}`,
    status: "draft",
    summary: `Digest composed from ${lines.filter((line) => line.known).length} available sources; ${lines.filter((line) => !line.known).length} unavailable.`,
    fields: { kind: "digest", digestId: digest?.id ?? "", builtBy: context.actor },
    body: { text: body },
  }, `Digest composed: ${name}`);
  if (digest) {
    await context.mutate.patch(digest.id, { fields: { ...digest.fields, lastBuiltAt: new Date().toISOString() } }, { event: `Digest built: ${name}` });
  }
  context.toast("Digest composed", `It is a draft document in Documents, with ${lines.filter((line) => !line.known).length} lines marked unavailable.`);
}

/* ---------------------------- INBOX-008 ---------------------------- */

type EscalationTab = "Rules" | "Coverage" | "History" | "Conflicts";

const CAPABILITY_OF_CONDITION: Record<string, Capability> = {
  "capability:approve_payment": "approve_payment",
  "capability:edit_people": "edit_people",
  "capability:approve_mission": "approve_mission",
  "capability:post_journal": "post_journal",
};

function roleOf(members: Rec[], name: string): string {
  return String(members.find((member) => member.title === name)?.fields.role ?? "member");
}

function EscalationsScreen({ context, tab }: { context: ScreenContext; tab: EscalationTab }) {
  const { rules } = useInboxData();
  const members = useCollection("members");
  const events = useEvents(undefined, 60);

  if (tab === "Rules") {
    return (
      <Card eyebrow="RULES" prov="human" title="Routing rules" subtitle={`${rules.filter((rule) => rule.fields.enabled === true).length} of ${rules.length} enabled`} flush>
        <DataGrid
          rows={rules}
          rowId={(row) => row.id}
          label="Escalation rules"
          selectedId={context.selectedId}
          onSelect={context.select}
          onOpen={(id) => { context.select(id); context.openOverlay("Delegation grant", { id }); }}
          columns={[
            { key: "title", header: "Rule", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "condition", header: "Condition", cell: (row) => <span className="ds-num">{String(row.fields.condition)}</span> },
            { key: "owner", header: "Owner", hideBelow: 1100, cell: (row) => String(row.fields.owner) },
            { key: "backup", header: "Backup", cell: (row) => String(row.fields.backup) },
            { key: "timer", header: "After", align: "end", cell: (row) => `${Number(row.fields.timerMinutes) / 60} h` },
            { key: "cap", header: "Authority cap", align: "end", hideBelow: 1280, cell: (row) => (Number(row.fields.authorityCap ?? 0) > 0 ? context.money(Number(row.fields.authorityCap)) : <span className="ds-subtle">No money</span>) },
            { key: "state", header: "State", align: "end", cell: (row) => <Pill tone={row.fields.enabled === true ? "success" : "neutral"}>{row.fields.enabled === true ? "On" : "Off"}</Pill> },
          ]}
          bulkActions={[
            {
              label: "Revoke",
              tone: "danger",
              onRun: (selected) => {
                void Promise.all(selected.map((row) => context.mutate.patch(row.id, { fields: { ...row.fields, enabled: false, revokedBy: context.actor } }, { event: `Delegation revoked: ${row.title}` })))
                  .then(() => context.toast("Revoked", `${selected.length} ${selected.length === 1 ? "rule" : "rules"} turned off. Items go back to their owner.`));
              },
              disabled: (selected) => selected.some((row) => row.fields.securityFloor === true),
            },
          ]}
          empty={<Empty title="No routing rules" icon={<Users size={20} />}>Without a rule, an item waits on its owner however long that takes.</Empty>}
        />
      </Card>
    );
  }

  if (tab === "Coverage") {
    const owners = [...new Set(rules.map((rule) => String(rule.fields.owner)))];
    return (
      <Grid>
        {owners.map((owner) => {
          const forOwner = rules.filter((rule) => String(rule.fields.owner) === owner);
          const covered = forOwner.filter((rule) => rule.fields.enabled === true);
          return (
            <Card key={owner} eyebrow="COVERAGE" prov="human" span={6} title={owner} subtitle={`${covered.length} of ${forOwner.length} rules active`}>
              <Stack gap={3}>
                <Meter value={covered.length} max={Math.max(1, forOwner.length)} label={`${owner} coverage`} tone={covered.length === forOwner.length ? "success" : "warning"} />
                {forOwner.map((rule) => (
                  <Row key={rule.id} gap={2} wrap>
                    <span className="ds-grow">{String(rule.fields.scope ?? rule.title)}</span>
                    <Pill tone={rule.fields.enabled === true ? "success" : "warning"}>{rule.fields.enabled === true ? `→ ${String(rule.fields.backup)}` : "No cover"}</Pill>
                  </Row>
                ))}
              </Stack>
            </Card>
          );
        })}
        {owners.length === 0 && <Empty title="Nobody has cover" icon={<Users size={20} />}>Add a rule so work does not stop when one person is away.</Empty>}
      </Grid>
    );
  }

  if (tab === "History") {
    const relevant = events.filter((event) => event.type.startsWith("approval") || event.type.includes("delegat") || event.type.includes("escalat") || event.type.startsWith("policy"));
    return (
      <Card eyebrow="HISTORY" prov="posted" title="Delegation and decision history" subtitle={`${relevant.length} entries`} flush>
        <DataGrid
          rows={relevant}
          rowId={(row) => row.id}
          label="Escalation history"
          columns={[
            { key: "at", header: "When", width: "150px", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor },
            { key: "message", header: "Entry", primary: true, cell: (row) => <div><strong>{row.type}</strong><p className="ds-subtle">{row.message}</p></div>, filterValue: (row) => row.message },
          ]}
          empty={<Empty title="No history yet" icon={<CalendarClock size={20} />}>Changes to cover and decisions taken under it are logged here.</Empty>}
        />
      </Card>
    );
  }

  const conflicts: { id: string; title: string; detail: string; tone: "danger" | "warning" }[] = [];
  for (const rule of rules) {
    const condition = String(rule.fields.condition);
    const capability = CAPABILITY_OF_CONDITION[condition];
    const backup = String(rule.fields.backup);
    const backupRole = roleOf(members, backup);
    if (capability && !roleCan(backupRole as never, capability)) {
      conflicts.push({
        id: `${rule.id}-authority`,
        title: `${backup} cannot take over ${condition.replace("capability:", "").replace(/_/g, " ")}`,
        detail: `${rule.title} would route to ${backup}, whose ${backupRole} view does not hold that capability. The item stays with ${String(rule.fields.owner)} and the rule is ignored, because a delegation may never widen authority.`,
        tone: "danger",
      });
    }
    if (String(rule.fields.owner) === backup && rule.fields.enabled === true && !rule.fields.securityFloor) {
      conflicts.push({
        id: `${rule.id}-loop`,
        title: `${rule.title} escalates to the same person`,
        detail: `${backup} is both owner and backup, so the timer changes nothing. Name a different backup or accept that the item waits.`,
        tone: "warning",
      });
    }
  }
  const sameCondition = groupBy(rules.filter((rule) => rule.fields.enabled === true), (rule) => String(rule.fields.condition)).filter((group) => group.rows.length > 1);
  for (const group of sameCondition) {
    conflicts.push({
      id: `overlap-${group.label}`,
      title: `Two rules match ${group.label}`,
      detail: `${group.rows.map((rule) => rule.title).join(" and ")} both match. The shorter timer wins (${Math.min(...group.rows.map((rule) => Number(rule.fields.timerMinutes)))} minutes), and the other never fires.`,
      tone: "warning",
    });
  }

  return (
    <Stack gap={4}>
      {conflicts.length === 0 ? (
        <Empty title="No conflicts" icon={<CheckCheck size={20} />}>Every enabled rule routes to somebody who can actually decide.</Empty>
      ) : (
        conflicts.map((conflict) => (
          <Notice
            key={conflict.id}
            tone={conflict.tone}
            title={conflict.title}
            actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("escalation conflict", { id: conflict.id })}>Explain</Button>}
          >
            {conflict.detail}
          </Notice>
        ))
      )}
    </Stack>
  );
}

function DelegationGrant({ context, close }: { context: ScreenContext; close: () => void }) {
  const { rules } = useInboxData();
  const members = useCollection("members");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = rules.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [owner, setOwner] = useSeeded(String(existing?.fields.owner ?? context.actor));
  const [backup, setBackup] = useSeeded(String(existing?.fields.backup ?? ""));
  const [condition, setCondition] = useSeeded(String(existing?.fields.condition ?? "capability:approve_payment"));
  const [timer, setTimer] = useSeeded(String(existing?.fields.timerMinutes ?? 240));
  const [capMinor, setCapMinor] = useSeeded(Number(existing?.fields.authorityCap ?? 0));

  const capability = CAPABILITY_OF_CONDITION[condition];
  const backupRole = backup ? roleOf(members, backup) : "";
  const backupCan = capability && backupRole ? roleCan(backupRole as never, capability) : true;

  return (
    <form
      id="delegation-grant"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = {
          kind: "escalationRule", condition, owner, backup, timerMinutes: Number(timer),
          authorityCap: capMinor, enabled: backupCan, scope: condition.replace("capability:", "").replace(/_/g, " "),
        };
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: `${owner} → ${backup}`,
            summary: `${condition} escalates to ${backup} after ${Number(timer) / 60} hours.`,
            fields: { ...existing.fields, ...fields },
          }, { event: `Delegation updated: ${owner} → ${backup}`, expectRevision: existing.revision });
        } else {
          await context.mutate.create({
            collection: "preferences",
            title: `${owner} → ${backup}`,
            status: "active",
            summary: `${condition} escalates to ${backup} after ${Number(timer) / 60} hours.`,
            fields,
          }, `Delegation granted: ${owner} → ${backup}`);
        }
        context.toast(
          backupCan ? "Delegation saved" : "Saved, but inactive",
          backupCan ? `${backup} covers ${owner} after ${Number(timer) / 60} hours.` : `${backup} does not hold the capability, so the rule is saved disabled and listed under Conflicts.`,
          backupCan ? "ok" : "blocked",
        );
        close();
      }}
    >
      <Field label="Owner" required>
        <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
          {members.filter((member) => member.fields.kind === "human").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Backup approver" required>
        <Select value={backup} onChange={(event) => setBackup(event.target.value)} required>
          <option value="">Choose a person</option>
          {members.filter((member) => member.fields.kind === "human" && member.title !== owner).map((member) => (
            <option key={member.id} value={member.title}>{member.title} · {String(member.fields.role ?? "member")}</option>
          ))}
        </Select>
      </Field>
      <Field label="Applies to">
        <Select value={condition} onChange={(event) => setCondition(event.target.value)}>
          {Object.keys(CAPABILITY_OF_CONDITION).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          <option value="kind:interruption">kind:interruption</option>
          <option value="category:security">category:security</option>
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Escalate after (minutes)" required>
          <TextInput type="number" min={5} step={5} value={timer} onChange={(event) => setTimer(event.target.value)} required />
        </Field>
        <Field label="Authority cap" hint="Minor units; 0 means no money may move under this cover.">
          <TextInput type="number" min={0} step={1000} value={String(capMinor)} onChange={(event) => setCapMinor(Number(event.target.value))} />
        </Field>
      </Row>
      {backup && !backupCan && (
        <Notice tone="warning" title={`${backup} cannot hold this`}>
          The {backupRole} view does not hold {capability?.replace(/_/g, " ")}. The rule will be saved disabled: a delegated person
          never exceeds their own authority, so the item would stay with {owner}.
        </Notice>
      )}
      {backup && backupCan && capMinor > 0 && (
        <Notice tone="info" title="Capped cover">
          {backup} may decide up to {context.money(capMinor)} under this rule. Anything larger stays with {owner}.
        </Notice>
      )}
    </form>
  );
}

function EscalationSimulation({ context }: { context: ScreenContext }) {
  const { rules, items } = useInboxData();
  const members = useCollection("members");
  const [away, setAway] = useSeeded(String(rules[0]?.fields.owner ?? context.actor));
  const affected = rules.filter((rule) => String(rule.fields.owner) === away);
  const waiting = items.filter((item) => item.kind === "approval" && !item.resolved);

  return (
    <Stack gap={4}>
      <Field label="If this person is unavailable">
        <Select value={away} onChange={(event) => setAway(event.target.value)}>
          {members.filter((member) => member.fields.kind === "human").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Card eyebrow="SIMULATION" prov="human" title="What happens" subtitle={`${affected.length} rules mention ${away}`}>
        <Stack gap={3}>
          {affected.length === 0 ? (
            <Notice tone="warning" title="Nothing covers them">
              No rule names {away} as an owner, so anything waiting on them simply waits. Add a rule to give the work a route.
            </Notice>
          ) : (
            affected.map((rule) => {
              const backup = String(rule.fields.backup);
              const capability = CAPABILITY_OF_CONDITION[String(rule.fields.condition)];
              const can = capability ? roleCan(roleOf(members, backup) as never, capability) : true;
              return (
                <div key={rule.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2} wrap>
                    <strong className="ds-grow">{String(rule.fields.condition)}</strong>
                    <Pill tone={rule.fields.enabled === true && can ? "success" : "warning"}>{rule.fields.enabled === true && can ? `→ ${backup}` : "Stays with the owner"}</Pill>
                  </Row>
                  <p className="ds-subtle">
                    After {Number(rule.fields.timerMinutes) / 60} hours{can ? `, ${backup} may decide up to ${Number(rule.fields.authorityCap ?? 0) > 0 ? context.money(Number(rule.fields.authorityCap)) : "nothing involving money"}.` : `, nothing moves: ${backup} does not hold ${capability?.replace(/_/g, " ")}.`}
                  </p>
                </div>
              );
            })
          )}
          <Properties rows={[
            { label: "Decisions waiting right now", value: String(waiting.length) },
            { label: "Of those, routed to this person", value: String(waiting.filter((item) => item.assignee === away).length) },
          ]} />
        </Stack>
      </Card>
      <Notice tone="info" title="A simulation changes nothing">
        This reads the rules as they are and says what would happen. No item is moved and no rule is written.
      </Notice>
    </Stack>
  );
}

function EscalationConflictOverlay({ context }: { context: ScreenContext }) {
  const { rules } = useInboxData();
  const members = useCollection("members");
  const broken = rules.filter((rule) => {
    const capability = CAPABILITY_OF_CONDITION[String(rule.fields.condition)];
    return capability ? !roleCan(roleOf(members, String(rule.fields.backup)) as never, capability) : false;
  });
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="A delegation can never widen authority">
        If the backup's own role view does not hold the capability, the rule cannot fire. The request stays with its owner rather than
        being decided by somebody who should not decide it.
      </Notice>
      {broken.length === 0 ? (
        <Empty title="No authority conflict" icon={<CheckCheck size={20} />}>Every enabled rule routes to somebody who holds the capability.</Empty>
      ) : (
        <Stack gap={3}>
          {broken.map((rule) => (
            <div key={rule.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <strong>{rule.title}</strong>
              <Properties rows={[
                { label: "Condition", value: String(rule.fields.condition) },
                { label: "Backup", value: `${String(rule.fields.backup)} · ${roleOf(members, String(rule.fields.backup))} view` },
                { label: "Effect", value: "Rule disabled; the item stays with its owner." },
              ]} />
              <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                <Button size="sm" variant="secondary" onClick={() => { context.select(rule.id); context.openOverlay("Delegation grant", { id: rule.id }); }}>Choose another backup</Button>
              </Row>
            </div>
          ))}
        </Stack>
      )}
      <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/admin/roles`)}>Roles and permissions</Button>
    </Stack>
  );
}

/* ---------------------------- registration ---------------------------- */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

function DigestPreviewRunner({ context }: { context: ScreenContext }) {
  const { digests } = useInboxData();
  const lines = useBriefLines();
  const digest = digests.find((row) => row.id === context.selectedId) ?? digests[0];
  const unavailable = lines.filter((line) => !line.known);
  return (
    <Stack gap={4}>
      <h3>{digest?.title ?? "Brief"}</h3>
      <Stack gap={2}>
        {lines.map((line) => (
          <Row key={line.label} gap={3}>
            <span className="ds-grow">{line.label}</span>
            <strong className="ds-num" style={{ color: line.known ? undefined : "var(--fg-subtle)" }}>{line.value}</strong>
          </Row>
        ))}
      </Stack>
      <Notice tone={unavailable.length ? "warning" : "info"} title={`${unavailable.length} ${unavailable.length === 1 ? "line has" : "lines have"} no source`}>
        {unavailable.length ? unavailable.map((line) => line.label).join(", ") + " cannot be reported, because the source is not connected." : "Every line in this digest has a source in this workspace."}
      </Notice>
      <Row gap={2} wrap>
        <Button variant="primary" onClick={() => void buildDigestPreview(context, digest, lines)}>Save this brief as a document</Button>
        <Button
          variant="secondary"
          onClick={() => {
            const text = lines.map((line) => `${line.label},${line.value},"${line.source}"`).join("\n");
            const blob = new Blob([`line,value,source\n${text}`], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${context.org.slug}-brief.csv`;
            link.click();
            URL.revokeObjectURL(url);
            context.toast("Exported", "The CSV downloaded from this browser.");
          }}
        >
          Download CSV
        </Button>
      </Row>
    </Stack>
  );
}

export const inboxApp = registerApp({
  code: "INBOX",
  short: "Inbox",
  name: "Inbox, Notifications & Attention Engine",
  purpose: "What needs a person, in order",
  icon: Inbox,
  nav: [
    { items: [
      { label: "Unified Inbox", screenId: "ARL-INBOX-001", icon: Inbox },
      { label: "Approvals", screenId: "ARL-INBOX-002", icon: CheckCheck },
      { label: "Messages", screenId: "ARL-INBOX-003", icon: Mail },
    ] },
    { label: "Signals", items: [
      { label: "Notifications", screenId: "ARL-INBOX-004", icon: Bell },
      { label: "Incident Alerts", screenId: "ARL-INBOX-005", icon: ShieldAlert },
    ] },
    { label: "Delivery", items: [
      { label: "Preferences", screenId: "ARL-INBOX-006", icon: AlarmClock },
      { label: "Digest Centre", screenId: "ARL-INBOX-007", icon: CalendarClock },
      { label: "Escalations", screenId: "ARL-INBOX-008", icon: Users },
    ] },
  ],
  screens: {
    "ARL-INBOX-001": {
      id: "ARL-INBOX-001",
      subtitle: (context) => `Priority, routing and triage for ${context.org.name}, derived from records in this browser.`,
      statusStrip: (context) => <InboxStripLine context={context} />,
      tabs: [
        { id: "For You", render: (context) => <ForYou context={context} /> },
        { id: "Approvals", render: (context) => <ApprovalsPreview context={context} /> },
        { id: "Messages", render: (context) => <MessagesPreview context={context} /> },
        { id: "Updates", render: (context) => <UpdatesPanel context={context} /> },
        { id: "Activity", render: (context) => <ActivityPanel context={context} /> },
      ],
      actions: [
        { id: "Open record", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select an item in the queue"), run: (context) => openItem(context, busItem(context.selectedId)) },
        {
          id: "mark read", label: "Mark read", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select an item in the queue"),
          run: async (context) => {
            const item = busItem(context.selectedId);
            if (!item) return;
            await writeTriage(context.mutate, item, { read: true }, `Marked read: ${item.title}`);
            context.toast("Marked read", "The item stays open. Reading is not approving.");
          },
        },
        { id: "snooze", label: "Snooze", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an item in the queue"), run: (context) => context.openOverlay("snooze picker", { itemIds: context.selectedId ? [context.selectedId] : [] }) },
        {
          id: "assign", label: "Assign", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select an item in the queue"),
          run: async (context) => {
            const item = busItem(context.selectedId);
            if (!item) return;
            await writeTriage(context.mutate, item, { read: true, assignee: context.actor }, `Assigned to ${context.actor}: ${item.title}`);
            context.toast("Assigned to you", "It now shows under Needs me, and the record names you.");
          },
        },
        { id: "bulk triage", label: "Bulk triage", placement: "overflow", run: (context) => context.openOverlay("action preview", { intent: "read" }) },
      ],
      overlays: [
        { id: "Notification detail", kind: "drawer", title: "Where this came from", width: 520, render: ({ close: _close, ...context }) => <NotificationDetail context={context} /> },
        { id: "snooze picker", kind: "modal", title: "Snooze", width: 480, render: ({ close, ...context }) => <SnoozePicker context={context} close={close} /> },
        { id: "action preview", kind: "modal", title: "Preview this triage", width: 720, render: ({ close, ...context }) => <ActionPreview context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-002": {
      id: "ARL-INBOX-002",
      subtitle: () => "Each request names the exact action, its risk, the accounts it touches and the plan version it is bound to.",
      tabs: (["Mine", "Delegated", "Pending", "History"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <ApprovalsScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Review", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Approval review", { id: context.selectedId }) },
        { id: "approve", label: "Approve", placement: "secondary", capability: "approve_payment", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("step-up auth", { id: context.selectedId }) },
        { id: "deny", label: "Deny", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Approval review", { id: context.selectedId, intent: "deny" }) },
        { id: "ask changes", label: "Ask for changes", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Approval review", { id: context.selectedId, intent: "changes" }) },
        { id: "delegate", label: "Delegate", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("delegate approval") },
        { id: "escalation rules", label: "Escalation rules", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/inbox/escalations`) },
      ],
      overlays: [
        { id: "Approval review", kind: "drawer", title: "Review the request", width: 560, render: ({ close, ...context }) => <ApprovalReview context={context} close={close} /> },
        { id: "step-up auth", kind: "modal", title: "Confirm this approval", width: 540, blocking: true, render: ({ close, ...context }) => <StepUpAuth context={context} close={close} /> },
        { id: "scope diff", kind: "modal", title: "Requested against held", width: 640, render: ({ close: _close, ...context }) => <ScopeDiff context={context} /> },
        { id: "delegate approval", kind: "modal", title: "Delegate this request", width: 580, render: ({ close, ...context }) => <DelegateApproval context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-003": {
      id: "ARL-INBOX-003",
      subtitle: (context) => `Mentions, escalations and agent messages routed to the ${ROLE_LABELS[context.role]} view.`,
      tabs: (["Unread", "Assigned", "Mentions", "Escalated"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <MessagesScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Reply", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a thread"), run: (context) => context.openOverlay("Message inspector", { id: context.selectedId }) },
        { id: "open thread", label: "Open thread", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a thread"), run: (context) => context.openOverlay("Message inspector", { id: context.selectedId }) },
        { id: "open channels", label: "Open Comms channels", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/comms/channels`) },
        { id: "assign", label: "Assign", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a thread"), run: (context) => context.openOverlay("reassignment", { id: context.selectedId }) },
        {
          id: "convert to task", label: "Convert to task", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a thread"),
          run: async (context) => {
            const message = context.selectedId ? await db.records.get(context.selectedId) : undefined;
            if (message?.fields.taskId) { context.toast("Already a task", `This thread is linked to ${String(message.fields.taskId)}.`, "info"); return; }
            await convertToTask(context, message);
          },
        },
      ],
      overlays: [
        { id: "Message inspector", kind: "drawer", title: "Thread", width: 560, render: ({ close, ...context }) => <MessageInspector context={context} close={close} /> },
        { id: "reassignment", kind: "modal", title: "Reassign the thread", width: 520, render: ({ close, ...context }) => <Reassignment context={context} close={close} /> },
        { id: "mute", kind: "modal", title: "Mute", width: 480, render: ({ close, ...context }) => <MuteThread context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-004": {
      id: "ARL-INBOX-004",
      subtitle: () => "Everything the applications in this workspace have recorded, with its source and a deep link that is checked before it is offered.",
      tabs: (["All", "Milestones", "Routine", "Archived"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <NotificationsFeed context={context} tab={tab} />,
      })),
      actions: [
        { id: "Filter", label: "Filter the feed", placement: "secondary", run: () => { window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(), 60); } },
        { id: "follow source", label: "Follow a source", placement: "overflow", run: (context) => context.openOverlay("follow source") },
        { id: "preferences", label: "Delivery preferences", placement: "overflow", run: (context) => context.openOverlay("preference quick view") },
        { id: "grouped", label: "Grouped items", placement: "overflow", run: (context) => context.openOverlay("grouped items") },
        {
          id: "clear read", label: "Clear read items", placement: "secondary",
          run: (context) => context.openOverlay("action preview", { itemIds: attentionBus.items.filter((item) => item.read && !item.resolved).map((item) => item.id), intent: "resolve" }),
        },
        { id: "open deep-link", label: "Open deep link", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select an event"), run: (context) => openItem(context, busItem(context.selectedId)) },
      ],
      overlays: [
        { id: "Event detail", kind: "drawer", title: "Event", width: 520, render: ({ close: _close, ...context }) => <EventDetail context={context} /> },
        { id: "grouped items", kind: "modal", title: "Grouped items", width: 640, render: ({ close: _close, ...context }) => <GroupedItems context={context} /> },
        { id: "preference quick view", kind: "drawer", title: "Delivery at a glance", width: 460, render: ({ close: _close, ...context }) => <PreferenceQuickView context={context} /> },
        { id: "action preview", kind: "modal", title: "Preview this triage", width: 720, render: ({ close, ...context }) => <ActionPreview context={context} close={close} /> },
        { id: "follow source", kind: "modal", title: "Follow a source", width: 520, render: ({ close, ...context }) => <FollowSource context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-005": {
      id: "ARL-INBOX-005",
      subtitle: () => "Critical issues with the service they affect, who owns them and where they escalate.",
      tabs: (["Urgent", "Waiting", "Resolved", "Security"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <IncidentBoard context={context} tab={tab} />,
      })),
      actions: [
        {
          id: "Acknowledge", placement: "primary",
          guard: (context) => (context.selectedId ? undefined : "Select an incident"),
          run: (context) => context.openOverlay("acknowledge incident"),
        },
        { id: "assign", label: "Assign an owner", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an incident"), run: (context) => context.openOverlay("owner handoff", { id: context.selectedId }) },
        { id: "inspect impact", label: "Inspect impact", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an incident"), run: (context) => context.openOverlay("Incident summary", { id: context.selectedId }) },
        { id: "escalate", label: "Escalate", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select an incident"), run: (context) => context.openOverlay("escalate incident") },
        { id: "emergency pause", label: "Emergency pause", placement: "overflow", tone: "danger", capability: "manage_policy", run: (context) => context.openOverlay("emergency pause") },
      ],
      overlays: [
        { id: "Incident summary", kind: "drawer", title: "Incident", width: 560, render: ({ close: _close, ...context }) => <IncidentSummary context={context} /> },
        { id: "owner handoff", kind: "modal", title: "Hand over the incident", width: 520, render: ({ close, ...context }) => <OwnerHandoff context={context} close={close} /> },
        { id: "emergency pause", kind: "modal", title: "Emergency pause", tone: "danger", width: 520, blocking: true, render: ({ close, ...context }) => <EmergencyPause context={context} close={close} /> },
        { id: "acknowledge incident", kind: "modal", title: "Acknowledge an incident", width: 540, render: ({ close, ...context }) => <AcknowledgeIncident context={context} close={close} /> },
        { id: "escalate incident", kind: "modal", title: "Escalate an incident", width: 580, tone: "danger", render: ({ close, ...context }) => <EscalateIncident context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-006": {
      id: "ARL-INBOX-006",
      subtitle: () => "Which channel carries what, when it goes quiet, and what is never allowed to go quiet.",
      tabs: (["Channels", "Categories", "Schedule", "Delegation"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => (
          tab === "Channels" ? <ChannelSettings context={context} />
            : tab === "Categories" ? <CategorySettings context={context} />
              : tab === "Schedule" ? <ScheduleSettings context={context} />
                : <DelegationSettings context={context} />
        ),
      })),
      actions: [
        { id: "Toggle", label: "Toggle a channel", placement: "secondary", run: (context) => context.openOverlay("toggle channel") },
        { id: "test preview", label: "Test a delivery", placement: "primary", run: (context) => context.openOverlay("Delivery test") },
        { id: "set digest", label: "Set the digest", placement: "overflow", run: (context) => context.openOverlay("set digest") },
        { id: "digests", label: "Digest centre", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/inbox/digests`) },
        {
          id: "mute mission", label: "Mute mission updates", placement: "overflow",
          run: async (context) => {
            await context.mutate.create({
              collection: "preferences",
              title: "Mission updates muted",
              status: "active",
              summary: "Routine mission progress goes to the digest instead of the inbox. Decisions still arrive.",
              fields: { kind: "notifyCategory", category: "interruption", inApp: true, email: false, push: false, digestOnly: true, minPriority: "P2" },
            }, "Mission updates muted to digest only");
            context.toast("Muted to digest", "Routine mission progress now arrives in the digest. A mission that needs a decision still interrupts.");
          },
        },
        { id: "quiet hours", label: "Add quiet hours", placement: "overflow", run: (context) => context.openOverlay("quiet-hour rules") },
        { id: "exceptions", label: "Why some items still arrive", placement: "overflow", run: (context) => context.openOverlay("exception explanation") },
      ],
      overlays: [
        { id: "Delivery test", kind: "modal", title: "Delivery test", width: 520, render: ({ close, ...context }) => <DeliveryTest context={context} close={close} /> },
        { id: "quiet-hour rules", kind: "modal", title: "Quiet hours", width: 520, render: ({ close, ...context }) => <QuietHourRules context={context} close={close} />, footer: submitFooter("quiet-hours", "Add window") },
        { id: "exception explanation", kind: "drawer", title: "Exceptions", width: 460, render: ({ close: _close, ...context }) => <ExceptionExplanation context={context} /> },
        { id: "toggle channel", kind: "modal", title: "Toggle a delivery channel", width: 520, render: ({ close, ...context }) => <ToggleChannel context={context} close={close} /> },
        { id: "set digest", kind: "modal", title: "Set the digest", width: 520, render: ({ close, ...context }) => <SetDigest context={context} close={close} /> },
      ],
    },

    "ARL-INBOX-007": {
      id: "ARL-INBOX-007",
      subtitle: () => "Grounded briefs: every line names its source, and a line with no source says so.",
      tabs: (["Daily", "Weekly", "Custom", "History"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <DigestCentre context={context} tab={tab} />,
      })),
      actions: [
        { id: "preview", label: "Preview", placement: "primary", run: (context) => context.openOverlay("digest preview") },
        { id: "Schedule", label: "Schedule", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a digest"), run: (context) => context.openOverlay("schedule", { id: context.selectedId }) },
        { id: "export", label: "Export the brief", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("digest preview") },
        {
          id: "send test", label: "Send a test", placement: "overflow",
          run: async (context) => {
            await context.mutate.log("Digest test requested. No mail provider is connected, so the brief was kept as a local draft.", { type: "digest.test", capability: "not_connected" });
            context.toast("Kept locally", "No mail provider is connected, so the test brief is a draft in this workspace instead of an email.", "blocked");
          },
        },
        { id: "audience", label: "Audience", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a digest"), run: (context) => context.openOverlay("audience", { id: context.selectedId }) },
        { id: "new digest", label: "New digest", placement: "secondary", run: (context) => context.openOverlay("Digest editor") },
      ],
      overlays: [
        { id: "Digest editor", kind: "modal", title: "Digest", width: 560, render: ({ close, ...context }) => <DigestEditor context={context} close={close} />, footer: submitFooter("digest-editor", "Save digest") },
        { id: "audience", kind: "modal", title: "Recipients", width: 520, render: ({ close, ...context }) => <DigestAudience context={context} close={close} /> },
        { id: "schedule", kind: "modal", title: "Schedule", width: 480, render: ({ close, ...context }) => <DigestSchedule context={context} close={close} /> },
        { id: "digest preview", kind: "drawer", title: "Brief preview", width: 520, render: ({ close: _close, ...context }) => <DigestPreviewRunner context={context} /> },
      ],
    },

    "ARL-INBOX-008": {
      id: "ARL-INBOX-008",
      subtitle: () => "Backup approvers, timers and the authority each one actually holds.",
      tabs: (["Rules", "Coverage", "History", "Conflicts"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <EscalationsScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Assign backup", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Delegation grant") },
        { id: "set condition", label: "Set the condition", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a rule"), run: (context) => context.openOverlay("Delegation grant", { id: context.selectedId }) },
        { id: "simulate", label: "Simulate cover", placement: "secondary", run: (context) => context.openOverlay("simulation") },
        {
          id: "revoke", label: "Revoke", placement: "overflow", tone: "danger", capability: "manage_policy",
          guard: (context) => (context.selectedId ? undefined : "Select a rule"),
          run: (context) => context.openOverlay("revoke rule"),
        },
        { id: "conflicts", label: "Authority conflicts", placement: "overflow", run: (context) => context.openOverlay("escalation conflict", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Delegation grant", kind: "modal", title: "Delegation", width: 560, render: ({ close, ...context }) => <DelegationGrant context={context} close={close} />, footer: submitFooter("delegation-grant", "Save delegation") },
        { id: "simulation", kind: "drawer", title: "If someone is away", width: 540, render: ({ close: _close, ...context }) => <EscalationSimulation context={context} /> },
        { id: "escalation conflict", kind: "modal", title: "Authority conflicts", width: 620, render: ({ close: _close, ...context }) => <EscalationConflictOverlay context={context} /> },
        { id: "revoke rule", kind: "modal", title: "Revoke a delegation", width: 560, tone: "danger", render: ({ close, ...context }) => <RevokeRule context={context} close={close} /> },
      ],
    },
  },
  fallback: (context) => (
    <Empty title={`${context.screen.title} is not built yet`} icon={<AlertTriangle size={20} />}>
      This screen is in the approved contract for the inbox but has no implementation in this module. It is recorded as outstanding
      rather than shown as a generic list.
    </Empty>
  ),
});
