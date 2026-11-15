import { useMemo, useState } from "react";
import { CalendarClock, Globe, Inbox, Radio } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select,
  Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CONDITION_OPS, matchTrigger, type ConditionOp, type WfNode, type WfNodeConfig } from "./engine";
import { setDraftGraph, useBuilderDraft } from "./store";
import { useGraphRecords } from "./runner";
import { classifyDeliveries, describeSchedule, nextOccurrences, readSchedule, type Delivery } from "./schedule";

function useTriggerContext(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  const trigger = draft?.graph.nodes.find((node) => node.type === "trigger");
  return { record, draft, pool, trigger };
}

function deliveriesOf(records: Rec[], workflowId: string): Delivery[] {
  return records
    .filter((item) => item.parentId === workflowId)
    .map((item) => ({
      id: item.id,
      key: String(item.fields.key ?? item.id),
      receivedAt: String(item.fields.receivedAt ?? item.createdAt),
      eventAt: String(item.fields.eventAt ?? item.at ?? item.createdAt),
      payload: (item.body as Record<string, string | number | boolean>) ?? {},
    }));
}

export function TriggerConfiguration({ context }: { context: ScreenContext }) {
  const { record, draft, pool, trigger } = useTriggerContext(context);
  const deliveryRecords = useCollection("workflowDeliveries");
  const collectionsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of pool) counts.set(item.collection, (counts.get(item.collection) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [pool]);

  if (!record) {
    return (
      <Empty title="That automation is not in this company" icon={<Radio size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows`)}>Back to the library</Button>}>
        Trigger configuration belongs to one automation. Open it from the library.
      </Empty>
    );
  }
  if (!draft) return <Empty title="Opening the graph…" />;

  const config: WfNodeConfig = trigger?.config ?? {};
  const matched = trigger ? matchTrigger(config, pool, context.now) : [];
  const schedule = readSchedule(record.fields, context.org.timezone);
  const deliveries = classifyDeliveries(deliveriesOf(deliveryRecords, record.id));

  function patchTrigger(next: Partial<WfNodeConfig>, note: string) {
    if (!trigger || !draft) return;
    setDraftGraph(record!.id, {
      ...draft.graph,
      nodes: draft.graph.nodes.map((node) => (node.id === trigger.id ? { ...node, config: { ...node.config, ...next } } : node)),
    }, note);
  }

  if (!trigger) {
    return (
      <Notice tone="danger" title="This automation has no trigger">
        A trigger is the only way a run starts. Add one in the builder, then come back to configure what it watches.
      </Notice>
    );
  }

  if (context.tab === "Schedules") {
    const occurrences = nextOccurrences(schedule, context.now, 8);
    const dstShift = occurrences.find((item) => item.dstShift);
    return (
      <Grid>
        <Card span={6} title="Recurrence" subtitle={describeSchedule(schedule)}>
          <Stack gap={4}>
            <Field label="Frequency">
              <Select
                value={schedule.frequency}
                onChange={(event) => context.mutate.patch(record.id, { fields: { ...record.fields, scheduleFrequency: event.target.value } }, { event: "Schedule frequency changed" })}
              >
                {["hourly", "daily", "weekly", "monthly"].map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </Field>
            <Row gap={2}>
              <Field label="Hour">
                <TextInput type="number" min={0} max={23} value={String(schedule.hour)} onChange={(event) => context.mutate.patch(record.id, { fields: { ...record.fields, scheduleHour: Number(event.target.value) } }, { event: "Schedule hour changed" })} />
              </Field>
              <Field label="Minute">
                <TextInput type="number" min={0} max={59} value={String(schedule.minute)} onChange={(event) => context.mutate.patch(record.id, { fields: { ...record.fields, scheduleMinute: Number(event.target.value) } }, { event: "Schedule minute changed" })} />
              </Field>
            </Row>
            <Field label="Time zone" hint="Firings are resolved in this zone, so a clock change moves the UTC instant, not the local time.">
              <Select
                value={schedule.timezone}
                onChange={(event) => { void context.mutate.patch(record.id, { fields: { ...record.fields, scheduleTimezone: event.target.value } }, { event: "Schedule time zone changed" }); patchTrigger({ timezone: event.target.value }, "Trigger time zone changed"); }}
              >
                {["Europe/London", "America/New_York", "Europe/Paris", "Australia/Sydney", "UTC"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </Select>
            </Field>
            <Notice tone="warning" title="No scheduler is running">
              This browser has no background worker. The recurrence is recorded so the firings can be reasoned about and so a run started by hand uses the same zone.
            </Notice>
          </Stack>
        </Card>

        <Card span={6} title="Next eight firings" subtitle={`Computed in ${schedule.timezone} from the workspace clock`}>
          {dstShift && (
            <Notice tone="warning" title="A clock change falls inside this window">
              The zone offset changes at {dstShift.localLabel}. The local time stays as configured and the UTC instant moves by the offset difference, which is what a correct scheduler does.
            </Notice>
          )}
          <Stack gap={2}>
            {occurrences.map((item, position) => (
              <Row key={`${position}-${item.at.toISOString()}`} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <span className="ds-grow">{item.localLabel}</span>
                <span className="ds-subtle ds-num" style={{ fontSize: "var(--text-xs)" }}>UTC {item.at.toISOString().slice(11, 16)}</span>
                {item.dstShift && <Pill tone="warning">offset changed</Pill>}
                {item.duplicate && <Pill tone="danger">duplicate dropped</Pill>}
              </Row>
            ))}
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Filters") {
    const filters = config.filters ?? [];
    return (
      <Grid>
        <Card span={7} title="Filters applied before a record is bound" subtitle={`${matched.length} of ${pool.filter((item) => item.collection === config.collection).length} ${config.collection ?? "records"} pass`}>
          <Stack gap={3}>
            {filters.length === 0 && <p className="ds-subtle">No filter. Every record the event selects is a candidate.</p>}
            {filters.map((filter, index) => (
              <Row key={`${filter.field}-${index}`} gap={2} wrap className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Field label="Field">
                  <TextInput
                    value={filter.field}
                    onChange={(event) => patchTrigger({ filters: filters.map((item, position) => (position === index ? { ...item, field: event.target.value } : item)) }, "Filter field changed")}
                  />
                </Field>
                <Field label="Test">
                  <Select
                    value={filter.op}
                    onChange={(event) => patchTrigger({ filters: filters.map((item, position) => (position === index ? { ...item, op: event.target.value as ConditionOp } : item)) }, "Filter test changed")}
                  >
                    {CONDITION_OPS.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
                  </Select>
                </Field>
                <Field label="Value">
                  <TextInput
                    value={filter.value}
                    onChange={(event) => patchTrigger({ filters: filters.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)) }, "Filter value changed")}
                  />
                </Field>
                <Button variant="ghost" onClick={() => patchTrigger({ filters: filters.filter((_item, position) => position !== index) }, "Filter removed")}>Remove</Button>
              </Row>
            ))}
            <Row gap={2}>
              <Button
                variant="secondary"
                onClick={() => patchTrigger({ filters: [...filters, { field: "record.status", op: "neq", value: "paid" }] }, "Filter added")}
              >
                Add a filter
              </Button>
              {draft.dirty && <Pill tone="warning" dot>Unsaved — save on the builder's Design tab</Pill>}
            </Row>
          </Stack>
        </Card>

        <Card span={5} title="Records that pass right now" subtitle="Evaluated against this company's records as you type">
          {matched.length === 0 ? (
            <Empty title="Nothing passes the filters" icon={<Inbox size={20} />}>A run started now would fail at the trigger, because there is nothing to work on.</Empty>
          ) : (
            <Stack gap={2}>
              {matched.slice(0, 8).map((item) => (
                <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <span className="ds-grow ds-truncate">{item.title}</span>
                  <Pill tone="neutral">{item.status}</Pill>
                  {item.amountMinor !== undefined && <span className="ds-num">{context.money(item.amountMinor)}</span>}
                </Row>
              ))}
              {matched.length > 8 && <span className="ds-subtle">and {matched.length - 8} more.</span>}
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Tests") {
    return (
      <Stack gap={5}>
        <StatRow>
          <Stat label="Deliveries recorded" value={String(deliveries.length)} meta="Each one keeps its idempotency key" />
          <Stat label="Accepted" value={String(deliveries.filter((item) => item.verdict === "accepted").length)} meta="First delivery of a key, in order" />
          <Stat label="Duplicates dropped" value={String(deliveries.filter((item) => item.verdict === "duplicate").length)} meta="Same key seen twice" />
          <Stat label="Out of order" value={String(deliveries.filter((item) => item.verdict === "reordered").length)} meta="Older event than one already handled" />
        </StatRow>

        <Card
          title="Test deliveries"
          subtitle="A test delivery records what the trigger would have received, and is de-duplicated by key"
          actions={<Button variant="secondary" onClick={() => context.openOverlay("sample inspection")}>Inspect a sample payload</Button>}
        >
          {deliveries.length === 0 ? (
            <Empty title="No delivery recorded" icon={<Radio size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Webhook setup")}>Record a test delivery</Button>}>
              Use Test on this screen to record a delivery. Recording the same key twice shows the de-duplication rule working on real rows.
            </Empty>
          ) : (
            <DataGrid
              rows={deliveries}
              rowId={(row) => row.id}
              label="Test deliveries"
              rowTone={(row) => (row.verdict === "duplicate" ? "warning" : undefined)}
              columns={[
                { key: "seq", header: "#", cell: (row) => String(row.sequence), sortValue: (row) => row.sequence },
                { key: "key", header: "Idempotency key", primary: true, cell: (row) => <code className="ds-num">{row.key}</code>, filterValue: (row) => row.key },
                { key: "event", header: "Event time", cell: (row) => context.dateTime(row.eventAt), sortValue: (row) => row.eventAt },
                { key: "received", header: "Arrived", cell: (row) => context.dateTime(row.receivedAt), sortValue: (row) => row.receivedAt, hideBelow: 900 },
                { key: "verdict", header: "Verdict", cell: (row) => <Pill tone={row.verdict === "accepted" ? "success" : row.verdict === "duplicate" ? "warning" : "info"} dot>{row.verdict}</Pill> },
                { key: "reason", header: "Why", cell: (row) => <span style={{ fontSize: "var(--text-xs)" }}>{row.reason}</span>, hideBelow: 1200 },
              ]}
            />
          )}
        </Card>
      </Stack>
    );
  }

  /* Events */
  return (
    <Grid>
      <Card span={5} title="App events" subtitle="Events a trigger can watch in this company">
        <Stack gap={4}>
          <Field label="Collection watched">
            <Select value={config.collection ?? ""} onChange={(event) => patchTrigger({ collection: event.target.value }, "Trigger collection changed")}>
              <option value="">Choose a collection</option>
              {["invoices", "bills", "quotes", "orders", "deals", "leads", "tasks", "tickets", "expenses"].map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Event">
            <Select value={config.event ?? "record.matches"} onChange={(event) => patchTrigger({ event: event.target.value as WfNodeConfig["event"] }, "Trigger event changed")}>
              <option value="record.matches">Any record in the collection</option>
              <option value="record.overdue">Past its due date and not closed</option>
              <option value="schedule">On the recurrence set on the Schedules tab</option>
              <option value="webhook">On an inbound webhook</option>
            </Select>
          </Field>
          <Properties rows={[
            { label: "Matching now", value: <Pill tone={matched.length ? "success" : "warning"}>{matched.length}</Pill> },
            { label: "Records loaded", value: String(pool.length) },
            { label: "Time zone", value: config.timezone ?? context.org.timezone },
          ]} />
          {draft.dirty && <Notice tone="warning" title="Unsaved trigger change">The builder's Save graph button writes it to the record.</Notice>}
        </Stack>
      </Card>

      <Card span={4} title="What this company holds" subtitle="Counts from the collections this graph reads">
        {collectionsWithCounts.length === 0 ? (
          <Empty title="Nothing loaded" >Choose a collection to see how many records a trigger would see.</Empty>
        ) : (
          <Properties rows={collectionsWithCounts.map(([name, count]) => ({ label: name, value: String(count) }))} />
        )}
      </Card>

      <Card span={3} title="Webhooks" subtitle="Inbound endpoint">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Path", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{String(record.fields.webhookPath ?? `/hooks/${record.id}`)}</code> },
            { label: "Secret", value: record.fields.webhookSecretSet === true ? "Recorded locally" : "Not set" },
            { label: "Listener", value: <Pill tone="warning" dot>Not listening</Pill> },
          ]} />
          <Notice tone="warning" title="Nothing can reach this browser">
            An inbound webhook needs a public endpoint. The path and the de-duplication rule are recorded so the behaviour is defined; no request can arrive here.
          </Notice>
          <Button variant="secondary" icon={<Globe size={15} />} onClick={() => context.openOverlay("Webhook setup")}>Webhook setup</Button>
        </Stack>
      </Card>

      <Card span={12} title="Sample payload" subtitle="The projection a step would actually see, from a real record">
        {matched[0] ? (
          <pre className="auto-code">{JSON.stringify({
            id: matched[0].id, title: matched[0].title, status: matched[0].status,
            amountMinor: matched[0].amountMinor, currency: matched[0].currency,
            dueAt: matched[0].dueAt, owner: matched[0].ownerName, ...matched[0].fields,
          }, null, 2)}</pre>
        ) : (
          <Empty title="No record matches" icon={<CalendarClock size={20} />}>The sample is taken from a real record, so there is nothing to show until one matches.</Empty>
        )}
      </Card>
    </Grid>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function WebhookSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("awaiting_payment");
  if (!record) return <Empty title="Open an automation first" />;
  const path = String(record.fields.webhookPath ?? `/hooks/${record.id}`);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Endpoint that would be registered", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>{path}</code> },
        { label: "Signature header", value: <code className="ds-num" style={{ fontSize: "var(--text-xs)" }}>X-Arlovi-Signature</code> },
        { label: "De-duplication", value: "By the Idempotency-Key header, for 24 hours" },
      ]} />
      <Notice tone="warning" title="This endpoint does not exist">
        Nothing is hosted from this browser, so no provider can post to it. Recording a test delivery below exercises the de-duplication and ordering rules on real rows instead.
      </Notice>
      <Field label="Idempotency key" hint="Use the same key twice to see the duplicate dropped.">
        <TextInput value={key} onChange={(event) => setKey(event.target.value)} placeholder="evt-1001" />
      </Field>
      <Field label="Payload status field">
        <TextInput value={status} onChange={(event) => setStatus(event.target.value)} />
      </Field>
      <Button
        variant="primary"
        disabled={key.trim() === ""}
        onClick={async () => {
          const received = new Date(context.now.getTime()).toISOString();
          await context.mutate.create({
            collection: "workflowDeliveries",
            title: `Delivery ${key.trim()}`,
            status: "received",
            summary: `Test delivery recorded for ${record.title}.`,
            parentId: record.id,
            at: received,
            fields: { key: key.trim(), receivedAt: received, eventAt: received, source: "test" },
            body: { status, source: "test", workflowId: record.id },
          }, `Test delivery ${key.trim()} recorded`);
          context.toast("Delivery recorded", "The Tests tab now classifies it as accepted, duplicate or out of order.");
          close();
        }}
      >
        Record a test delivery
      </Button>
    </Stack>
  );
}

export function ScheduleRecurrence({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const [spec, setSpec] = useState<{ frequency: string; hour: number; minute: number; weekday: number; timezone: string } | null>(null);
  if (!record) return <Empty title="Open an automation first" />;
  const current = readSchedule(record.fields, context.org.timezone);
  const value = spec ?? { frequency: current.frequency, hour: current.hour, minute: current.minute, weekday: current.weekday, timezone: current.timezone };
  const preview = nextOccurrences({ ...current, ...value, frequency: value.frequency as typeof current.frequency }, context.now, 4);
  return (
    <Stack gap={4}>
      <Field label="Frequency">
        <Select value={value.frequency} onChange={(event) => setSpec({ ...value, frequency: event.target.value })}>
          {["hourly", "daily", "weekly", "monthly"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Row gap={2}>
        <Field label="Hour"><TextInput type="number" min={0} max={23} value={String(value.hour)} onChange={(event) => setSpec({ ...value, hour: Number(event.target.value) })} /></Field>
        <Field label="Minute"><TextInput type="number" min={0} max={59} value={String(value.minute)} onChange={(event) => setSpec({ ...value, minute: Number(event.target.value) })} /></Field>
      </Row>
      {value.frequency === "weekly" && (
        <Field label="Weekday">
          <Select value={String(value.weekday)} onChange={(event) => setSpec({ ...value, weekday: Number(event.target.value) })}>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Time zone">
        <Select value={value.timezone} onChange={(event) => setSpec({ ...value, timezone: event.target.value })}>
          {["Europe/London", "America/New_York", "Europe/Paris", "Australia/Sydney", "UTC"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </Select>
      </Field>
      <Stack gap={1}>
        <strong>Next firings with this recurrence</strong>
        {preview.map((item, position) => (
          <Row key={`${position}-${item.at.toISOString()}`} gap={2}>
            <span className="ds-grow">{item.localLabel}</span>
            {item.dstShift && <Pill tone="warning">offset changed</Pill>}
          </Row>
        ))}
      </Stack>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(record.id, {
            fields: {
              ...record.fields,
              scheduleFrequency: value.frequency,
              scheduleHour: value.hour,
              scheduleMinute: value.minute,
              scheduleWeekday: value.weekday,
              scheduleTimezone: value.timezone,
            },
          }, { expectRevision: record.revision, event: "Recurrence changed" });
          context.toast("Recurrence saved", describeSchedule({ ...current, ...value, frequency: value.frequency as typeof current.frequency }));
          close();
        }}
      >
        Save recurrence
      </Button>
    </Stack>
  );
}

export function SampleInspection({ context }: { context: ScreenContext }) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  const trigger = draft?.graph.nodes.find((node: WfNode) => node.type === "trigger");
  const matched = trigger ? matchTrigger(trigger.config ?? {}, pool, context.now) : [];
  const [index, setIndex] = useState(0);
  if (!trigger) return <Empty title="No trigger to sample" />;
  const chosen = matched[index];
  return (
    <Stack gap={4}>
      <Field label="Record sampled">
        <Select value={String(index)} onChange={(event) => setIndex(Number(event.target.value))}>
          {matched.map((item, position) => <option key={item.id} value={position}>{item.title}</option>)}
        </Select>
      </Field>
      {chosen ? (
        <>
          <pre className="auto-code">{JSON.stringify({ id: chosen.id, title: chosen.title, status: chosen.status, amountMinor: chosen.amountMinor, dueAt: chosen.dueAt, ...chosen.fields }, null, 2)}</pre>
          <Properties rows={[
            { label: "Collection", value: chosen.collection },
            { label: "Owner", value: chosen.ownerName },
            { label: "Updated", value: context.dateTime(chosen.updatedAt) },
            { label: "Overdue by", value: chosen.dueAt ? `${Math.max(0, Math.floor((context.now.getTime() - new Date(chosen.dueAt).getTime()) / 86_400_000))} days` : "No due date" },
          ]} />
          <Notice tone="info" title="This is the real projection">
            A step reads exactly these keys. Nothing is added for the sample, so a template that refers to a key not shown here will fail at run time and say so.
          </Notice>
        </>
      ) : (
        <Empty title="No record matches the trigger">The sample comes from a record, so there is nothing to inspect until one matches.</Empty>
      )}
    </Stack>
  );
}

export function TriggerSelection({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  const trigger = draft?.graph.nodes.find((node: WfNode) => node.type === "trigger");
  const [collection, setCollection] = useState(trigger?.config?.collection ?? "invoices");
  const [event, setEvent] = useState<WfNodeConfig["event"]>(trigger?.config?.event ?? "record.overdue");
  const pool = useGraphRecords(draft?.graph ?? { nodes: [], edges: [] });
  if (!record || !draft || !trigger) return <Empty title="Open an automation with a trigger first" />;
  const candidate = matchTrigger({ collection, event }, pool, context.now);
  return (
    <Stack gap={4}>
      <Field label="Collection">
        <Select value={collection} onChange={(item) => setCollection(item.target.value)}>
          {["invoices", "bills", "quotes", "orders", "deals", "leads", "tasks", "tickets", "expenses"].map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Event">
        <Select value={event} onChange={(item) => setEvent(item.target.value as WfNodeConfig["event"])}>
          <option value="record.matches">Any record in the collection</option>
          <option value="record.overdue">Past its due date and not closed</option>
          <option value="schedule">On a recurrence</option>
          <option value="webhook">On an inbound webhook</option>
        </Select>
      </Field>
      <Notice tone={candidate.length ? "info" : "warning"} title={`${candidate.length} record${candidate.length === 1 ? "" : "s"} would match`}>
        {candidate.length === 0
          ? "A run started with this trigger would fail at the first step, because nothing matches."
          : `The first match is ${candidate[0].title}.`}
      </Notice>
      <Button
        variant="primary"
        onClick={() => {
          setDraftGraph(record.id, {
            ...draft.graph,
            nodes: draft.graph.nodes.map((node) => (node.id === trigger.id ? { ...node, config: { ...node.config, collection, event } } : node)),
          }, "Trigger selected");
          context.toast("Trigger selected", `${collection} · ${event}. Save the graph on the builder's Design tab to keep it.`);
          close();
        }}
      >
        Use this trigger
      </Button>
    </Stack>
  );
}
