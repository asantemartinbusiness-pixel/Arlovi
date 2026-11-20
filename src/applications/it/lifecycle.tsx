import { useState } from "react";
import { Button, Card, Field, Grid, Notice, Pill, Row, Select, Stack, TextArea } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents } from "@/platform/workspace";
import { clockIso, wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import {
  SEVERITIES, STAGES, STAGE_LABELS, STAGE_STATUS, nextStage, readTimeline, stageBlockers, stageOf, withEntry,
  type Stage, type TimelineEntry, type TimelineKind,
} from "./register";
import { useItUi } from "./state";
import "./register.css";

/* ====================================================================== *
 * Incident lifecycle: open → triage → mitigate → resolve → postmortem.
 * Each move is gated by stageBlockers, writes the matching status so the
 * queue tabs stay right, and appends to the incident's own timeline.
 * ====================================================================== */

let entryCounter = 0;
export function makeEntry(by: string, kind: TimelineKind, text: string): TimelineEntry {
  entryCounter += 1;
  return { id: `t${wallMs().toString(36)}${entryCounter}`, at: clockIso(), by, kind, text };
}

/**
 * A workspace diagnostics run recorded after the incident opened, in this
 * session or in the audit log. Diagnostic events carry no incident reference:
 * they check the whole workspace, so this is evidence that a check ran, not
 * that this incident's fix was verified specifically.
 */
export function useVerified(record: Rec | undefined): boolean {
  const ranAt = useItUi((state) => state.ranAt);
  const events = useEvents();
  if (!record) return false;
  const opened = record.at ?? record.createdAt;
  if (ranAt && ranAt > opened) return true;
  return events.some((event) => event.type === "diagnostic" && event.at > opened);
}

const KIND_LABEL: Record<TimelineKind, string> = {
  note: "Note", stage: "Stage", severity: "Severity", assignee: "Owner", mitigation: "Mitigation", verification: "Verification",
};

const NOTE_LABEL: Partial<Record<Stage, string>> = {
  mitigate: "Mitigation being applied",
  resolve: "What fixed it",
  postmortem: "Postmortem: what happened, why, and what changes",
};

export function IncidentLifecycle({ context, record }: { context: ScreenContext; record: Rec }) {
  const members = useCollection("members").filter((member) => String(member.fields.kind ?? "human") === "human");
  const verified = useVerified(record);
  const stage = stageOf(record);
  const target = nextStage(stage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const blockers = target ? stageBlockers(record, target, { verified, note }) : [];
  const owner = String(record.fields.owner ?? "");
  // Raising an incident to critical commits people and money, so it follows the approval permission of the role view.
  const canEscalate = context.can("approve_mission");
  const owners = [...new Set([...members.map((member) => member.title), owner, context.actor].filter(Boolean))];

  async function setField(key: "severity" | "owner", value: string) {
    const kind: TimelineKind = key === "severity" ? "severity" : "assignee";
    const text = key === "severity" ? `Severity set to ${value}` : `Owner set to ${value}`;
    const saved = await context.mutate.patch(record.id, {
      ...(key === "owner" ? { ownerName: value } : {}),
      fields: { ...record.fields, [key]: value },
      ...withEntry(record, makeEntry(context.actor, kind, text)),
    }, { expectRevision: record.revision, event: `${record.title}: ${text}` });
    return saved;
  }

  async function advance() {
    if (!target || blockers.length) return;
    setBusy(true);
    try {
      const entries: TimelineEntry[] = [];
      if (note.trim() && (target === "mitigate" || target === "resolve")) entries.push(makeEntry(context.actor, "mitigation", note.trim()));
      if (target === "resolve") entries.push(makeEntry(context.actor, "verification", "A workspace diagnostics run was recorded since the incident opened (it checks the whole workspace, not this incident alone)"));
      entries.push(makeEntry(context.actor, "stage", `Moved to ${STAGE_LABELS[target]}`));
      const timeline = [...readTimeline(record), ...entries];
      const saved = await context.mutate.patch(record.id, {
        status: STAGE_STATUS[target],
        ...(target === "resolve" ? { endAt: clockIso() } : {}),
        fields: {
          ...record.fields,
          stage: target,
          ...(target === "resolve" ? { verifiedBy: context.actor } : {}),
          ...(target === "postmortem" ? { postmortem: note.trim() || String(record.fields.postmortem ?? "") } : {}),
        },
        body: { ...(record.body && typeof record.body === "object" ? record.body as Record<string, unknown> : {}), timeline },
      }, { expectRevision: record.revision, event: `${record.title} moved to ${STAGE_LABELS[target]}` });
      if (!saved) return;
      setNote("");
      context.toast(`Moved to ${STAGE_LABELS[target]}`, "The change is on the incident timeline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="it-lifecycle" aria-label="Incident lifecycle">
      <ol className="it-stages">
        {STAGES.map((item, index) => {
          const state = index < STAGES.indexOf(stage) ? "done" : item === stage ? "current" : "todo";
          return (
            <li key={item} data-state={state} aria-current={item === stage ? "step" : undefined}>
              <span className="it-stage-dot" aria-hidden="true">{index + 1}</span>
              <span>{STAGE_LABELS[item]}</span>
            </li>
          );
        })}
      </ol>
      <Grid>
        <Card span={5} prov="human" title="Triage" subtitle="Severity and owner; each change is written to the timeline">
          <Stack gap={3}>
            <Field label="Severity" htmlFor="it-severity">
              <Select id="it-severity" value={String(record.fields.severity ?? "")} onChange={(event) => void setField("severity", event.target.value)}>
                <option value="" disabled>Choose a severity</option>
                {SEVERITIES.map((level) => <option key={level} value={level} disabled={level === "critical" && !canEscalate && record.fields.severity !== "critical"}>{level}{level === "critical" && !canEscalate ? " (needs approval authority)" : ""}</option>)}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="it-owner">
              <Select id="it-owner" value={owner} onChange={(event) => void setField("owner", event.target.value)}>
                <option value="" disabled>Choose an owner</option>
                {owners.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </Field>
          </Stack>
        </Card>
        <Card span={7} prov="human"
          title={target ? `Next: ${STAGE_LABELS[target]}` : "Lifecycle complete"}
          subtitle={target ? `Currently ${STAGE_LABELS[stage]}` : "The postmortem is written and the incident is closed"}>
          {target ? (
            <Stack gap={3}>
              {NOTE_LABEL[target] && (
                <Field label={NOTE_LABEL[target]!} htmlFor="it-stage-note">
                  <TextArea id="it-stage-note" rows={target === "postmortem" ? 6 : 3} value={note} onChange={(event) => setNote(event.target.value)}
                    placeholder={target === "postmortem" ? String(record.fields.postmortem ?? "") : undefined} />
                </Field>
              )}
              {blockers.length > 0 ? (
                <Notice tone="warning" title="Before this can move">
                  <ul className="it-blockers">{blockers.map((item) => <li key={item}>{item}</li>)}</ul>
                </Notice>
              ) : <Row gap={2}><Pill tone="success" dot>Ready to move</Pill></Row>}
              <Row gap={2} wrap>
                <Button variant="primary" busy={busy} disabled={blockers.length > 0} onClick={() => void advance()}>Move to {STAGE_LABELS[target]}</Button>
                {target === "resolve" && !verified && (
                  <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/health`)}>Run the diagnostics</Button>
                )}
              </Row>
            </Stack>
          ) : (
            <p className="ds-prose">{String(record.fields.postmortem ?? "")}</p>
          )}
        </Card>
      </Grid>
    </section>
  );
}

export function TimelineComposer({ context, record }: { context: ScreenContext; record: Rec }) {
  const [kind, setKind] = useState<TimelineKind>("note");
  const [text, setText] = useState("");
  return (
    <form
      className="it-composer"
      aria-label="Add a timeline entry"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        const saved = await context.mutate.patch(record.id, withEntry(record, makeEntry(context.actor, kind, text.trim())), {
          expectRevision: record.revision, event: `${KIND_LABEL[kind]} added to ${record.title}`,
        });
        if (!saved) return;
        setText("");
        context.toast("Entry added", "It is on the incident timeline with your name and the time.");
      }}
    >
      <Row gap={2} wrap style={{ alignItems: "flex-end" }}>
        <Field label="Entry type" htmlFor="it-entry-kind">
          <Select id="it-entry-kind" value={kind} onChange={(event) => setKind(event.target.value as TimelineKind)}>
            <option value="note">Note</option>
            <option value="mitigation">Mitigation step</option>
            <option value="verification">Verification</option>
          </Select>
        </Field>
        <div className="ds-grow" style={{ minWidth: 220 }}>
          <Field label="What happened" htmlFor="it-entry-text">
            <TextArea id="it-entry-text" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={!text.trim()}>Add to timeline</Button>
      </Row>
    </form>
  );
}

export function timelineKindLabel(kind: TimelineKind): string {
  return KIND_LABEL[kind];
}
