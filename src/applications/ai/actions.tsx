import { useState } from "react";
import { Button, Empty, Field, Notice, Properties, Row, Select, Stack, TextArea, TextInput, ModalActions, OverlayActions } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useOrgRecords, useRecord } from "@/platform/workspace";
import { internalPeople } from "@/applications/brain/people";
import type { Rec } from "@/domain/types";
import { clockIso, wallMs } from "@/platform/clock";

/* ====================================================================== *
 * AI contract actions that change the record they name.
 * ====================================================================== */

const ATTACHABLE = ["deals", "invoices", "contacts", "documents", "tasks", "missions", "tickets", "quotes"];

/** Attaches a workspace record to a specialist conversation as a message the thread can cite. */
export function AttachToSpecialist({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const agent = useRecord(context.params.id);
  const [collection, setCollection] = useState("deals");
  const [recordId, setRecordId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!agent || agent.collection !== "agents") return <Empty title="Open a specialist first" />;
  const pool = records.filter((record) => record.collection === collection).slice(0, 80);
  const record = pool.find((item) => item.id === recordId);
  const already = records.some((item) => item.collection === "messages" && item.parentId === agent.id && item.fields.attachedRecordId === recordId);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Attaching shares a record, not a copy">
        The record is linked into this conversation so {agent.title} can cite it within its grants. Nothing is sent anywhere and no model reads it: none is connected.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Kind">
          <Select aria-label="Kind" value={collection} onChange={(event) => { setCollection(event.target.value); setRecordId(""); }}>
            {ATTACHABLE.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Record" required>
          <Select aria-label="Record" value={recordId} onChange={(event) => setRecordId(event.target.value)}>
            <option value="">Choose a record</option>
            {pool.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      </Row>
      {already && <Notice tone="warning" title="Already attached">This record is already in the conversation.</Notice>}
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!record || already}
          onClick={async () => {
            if (!record) return;
            setBusy(true);
            await context.mutate.create({
              collection: "messages",
              title: `Attached ${record.title}`,
              status: "sent",
              summary: `${context.actor} attached ${record.collection} ${record.title}.`,
              parentId: agent.id,
              at: clockIso(),
              fields: { author: context.actor, kind: "attachment", attachedRecordId: record.id, attachedCollection: record.collection },
            }, `${record.title} attached to the conversation with ${agent.title}`);
            context.toast("Record attached", `${record.title} is in the conversation with ${agent.title}.`);
            setBusy(false);
            close();
          }}
        >
          Attach
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/** Internal, active people (no clients or external parties) once each, plus active AI employees when asked. */
export function internalRoster(records: Rec[], withAgents = false): Rec[] {
  const people = internalPeople(records.filter((record) => record.collection === "members" && record.status === "active"));
  if (!withAgents) return people;
  const seen = new Set(people.map((person) => person.title));
  const agents = records.filter((record) => record.collection === "agents" && record.status === "active" && !seen.has(record.title));
  return [...people, ...agents.filter((agent, index) => agents.findIndex((other) => other.title === agent.title) === index)];
}

function participantsOf(room: Rec | undefined, records: Rec[]): Rec[] {
  const ids = String(room?.fields.participants ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return ids.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
}

/** Creates a task owned by a room participant and records the assignment in the room. */
export function AssignRoomTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const room = useRecord(context.params.id);
  const people = participantsOf(room, records);
  const [assignee, setAssignee] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(new Date(context.now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  if (!room || room.collection !== "channels") return <Empty title="Open a room first" />;
  const person = people.find((item) => item.title === assignee);
  return (
    <Stack gap={4}>
      <Field label="Task" required><TextInput aria-label="Task" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Row gap={3} wrap>
        <Field label="Owner" required hint="Only people and AI employees in this room.">
          <Select aria-label="Owner" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Choose a participant</option>
            {people.map((item) => <option key={item.id} value={item.title}>{item.title}{item.collection === "agents" ? " · AI" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Due"><TextInput aria-label="Due" type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
      </Row>
      {person?.collection === "agents" && (
        <Notice tone="info" title="An AI employee works within its grants">Assigning in a room does not widen what it may do. A step that needs an external tool still stops at its policy.</Notice>
      )}
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!title.trim() || !person}
          onClick={async () => {
            if (!person) return;
            setBusy(true);
            const task = await context.mutate.create({
              collection: "tasks",
              title: title.trim(),
              status: "ready",
              summary: `Assigned in ${room.title} by ${context.actor}.`,
              dueAt: `${due}T17:00:00.000Z`,
              fields: { stage: "ready", assignee: person.title, kind: person.collection === "agents" ? "ai" : "human", roomId: room.id, assignedBy: context.actor },
            }, `Task ${title.trim()} assigned to ${person.title}`);
            await context.mutate.create({
              collection: "messages",
              title: `Task for ${person.title}`,
              status: "sent",
              summary: `${context.actor} assigned “${task.title}” to ${person.title}, due ${context.date(due)}.`,
              parentId: room.id,
              at: clockIso(),
              fields: { author: context.actor, kind: "assignment", taskId: task.id },
            }, `Assignment posted in ${room.title}`);
            context.toast("Task assigned", `${person.title} owns “${task.title}”.`);
            setBusy(false);
            close();
          }}
        >
          Assign the task
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/** Puts a named reviewer on a mission task's review gate. The reviewer cannot be the task owner. */
export function AssignReviewer({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const tasks = records.filter((record) => record.collection === "missionTasks" && record.parentId === context.params.id);
  const gated = tasks.filter((task) => task.fields.approvalRequired === true);
  const pool = gated.length ? gated : tasks;
  const people = internalRoster(records);
  const [taskIdPicked, setTaskId] = useState<string>();
  const taskId = taskIdPicked ?? (pool[0]?.id ?? "");
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const task = pool.find((item) => item.id === taskId);
  if (pool.length === 0) return <Empty title="This mission has no task to review" />;
  const blocked = !reviewer ? "Choose a reviewer." : task && String(task.fields.assignee ?? "") === reviewer ? "The owner of a task cannot review it." : undefined;
  return (
    <Stack gap={4}>
      <Field label="Task">
        <Select aria-label="Task" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
          {pool.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.stage ?? "")}</option>)}
        </Select>
      </Field>
      {task && <Properties rows={[
        { label: "Owner", value: String(task.fields.assignee ?? task.ownerName) },
        { label: "Current reviewer", value: String(task.fields.reviewer ?? "None") },
      ]} />}
      <Field label="Reviewer" required>
        <Select aria-label="Reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)}>
          <option value="">Choose a person</option>
          {people.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
        </Select>
      </Field>
      {blocked && reviewer && <Notice tone="warning" title="Cannot assign">{blocked}</Notice>}
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !task}
          onClick={async () => {
            if (!task) return;
            setBusy(true);
            const saved = await context.mutate.patch(task.id, {
              fields: { ...task.fields, reviewer, approvalRequired: true, reviewerAssignedBy: context.actor },
            }, { expectRevision: task.revision, event: `${reviewer} assigned to review ${task.title} by ${context.actor}` });
            if (saved) context.toast("Reviewer assigned", `${reviewer} reviews ${task.title}. The mission stops at that gate until they decide.`);
            setBusy(false);
            close();
          }}
        >
          Assign the reviewer
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

interface TranscriptEntry { id: string; at: string; speaker: string; text: string; source: string; corrected?: { from: string; at: string; by: string } }

/** Corrects one transcript line and keeps the original on it. */
export function CorrectTranscript({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const session = records.find((record) => record.collection === "meetings" && record.fields.kind === "voice");
  const transcript = ((session?.body as { transcript?: TranscriptEntry[] } | undefined)?.transcript) ?? [];
  const [lineIdPicked, setLineId] = useState<string>();
  const lineId = lineIdPicked ?? (transcript.at(-1)?.id ?? "");
  const line = transcript.find((entry) => entry.id === lineId);
  const [value, setValue] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!session || transcript.length === 0) return <Empty title="No transcript line to correct">Start a typed session and add a turn first.</Empty>;
  const text = value ?? line?.text ?? "";
  return (
    <Stack gap={4}>
      <Field label="Line">
        <Select aria-label="Line" value={lineId} onChange={(event) => { setLineId(event.target.value); setValue(undefined); }}>
          {transcript.map((entry) => <option key={entry.id} value={entry.id}>{entry.speaker}: {entry.text.slice(0, 60)}</option>)}
        </Select>
      </Field>
      <Field label="Corrected text" required><TextArea aria-label="Corrected text" value={text} rows={3} onChange={(event) => setValue(event.target.value)} /></Field>
      <Notice tone="info" title="The original is kept">The line records what it said before, who corrected it and when. A correction never triggers an action.</Notice>
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!line || !text.trim() || text === line.text}
          onClick={async () => {
            if (!line) return;
            setBusy(true);
            const next = transcript.map((entry) => (entry.id === line.id ? { ...entry, text: text.trim(), corrected: { from: entry.corrected?.from ?? entry.text, at: clockIso(), by: context.actor } } : entry));
            const saved = await context.mutate.patch(session.id, { body: { ...(session.body as object), transcript: next } }, { expectRevision: session.revision, event: `Transcript line corrected by ${context.actor}` });
            if (saved) context.toast("Line corrected", "The previous text is kept on the line.");
            setBusy(false);
            close();
          }}
        >
          Save the correction
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/** Adds a comment to the artifact's comment thread. */
export function CommentOnArtifact({ context, close }: { context: ScreenContext; close: () => void }) {
  const artifact = useRecord(context.params.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!artifact || artifact.collection !== "documents") return <Empty title="Open an artifact first" />;
  const body = (artifact.body ?? {}) as { comments?: { id: string; at: string; author: string; text: string }[] };
  const comments = body.comments ?? [];
  return (
    <Stack gap={4}>
      <Field label="Comment" required><TextArea aria-label="Comment" value={text} rows={4} onChange={(event) => setText(event.target.value)} /></Field>
      <p className="ds-subtle">{comments.length} comment{comments.length === 1 ? "" : "s"} already on {artifact.title}.</p>
      <ModalActions><OverlayActions primary={<Button
          variant="primary"
          busy={busy}
          disabled={!text.trim()}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(artifact.id, {
              body: { ...body, comments: [...comments, { id: `c-${wallMs()}`, at: clockIso(), author: context.actor, text: text.trim() }] },
            }, { expectRevision: artifact.revision, event: `Comment added to ${artifact.title} by ${context.actor}` });
            if (saved) { context.toast("Comment added", "It shows on the Comments tab."); context.setTab("Comments"); }
            setBusy(false);
            close();
          }}
        >
          Add the comment
        </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/** AI-004: convenes a review in the room: a review record with its participants and a notice in the room. */
export function HostReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const room = useRecord(context.params.id);
  const listed = participantsOf(room, records);
  // A room with no recorded participants can still host a review: offer the active people and AI employees.
  const people = listed.length ? listed : internalRoster(records, true);
  const [topic, setTopic] = useState("");
  const [picked, setPicked] = useState<string[]>();
  const chosen = picked ?? (listed.length ? listed.map((person) => person.id) : []);
  const [busy, setBusy] = useState(false);
  if (!room || room.collection !== "channels") return <Empty title="Open a room first" />;
  return (
    <Stack gap={4}>
      <Field label="What is being reviewed" required><TextInput aria-label="What is being reviewed" value={topic} onChange={(event) => setTopic(event.target.value)} /></Field>
      <Stack gap={1}>
        {people.map((person) => (
          <label key={person.id} className="ds-row ds-gap-2">
            <input type="checkbox" checked={chosen.includes(person.id)} onChange={(event) => setPicked(event.target.checked ? [...chosen, person.id] : chosen.filter((id) => id !== person.id))} />
            {person.title}{person.collection === "agents" ? " · AI" : ""}
          </label>
        ))}
      </Stack>
      <Notice tone="info" title="A review is decided by people">AI employees in the review contribute within their grants; a mention in the room never overrides an external tool policy.</Notice>
      <ModalActions><OverlayActions primary={<Button variant="primary" busy={busy} disabled={!topic.trim() || chosen.length === 0} onClick={async () => {
          setBusy(true);
          const review = await context.mutate.create({
            collection: "meetings", title: `Review: ${topic.trim()}`, status: "scheduled", summary: `Hosted in ${room.title} by ${context.actor}.`,
            startAt: clockIso(), parentId: room.id,
            fields: { kind: "review", host: context.actor, roomId: room.id },
            body: { participants: people.filter((person) => chosen.includes(person.id)).map((person) => ({ id: person.id, name: person.title, kind: person.collection === "agents" ? "ai" : "human" })) },
          }, `Review on ${topic.trim()} hosted by ${context.actor}`);
          await context.mutate.create({
            collection: "messages", title: `Review: ${topic.trim()}`, status: "sent", summary: `${context.actor} opened a review of ${topic.trim()} with ${chosen.length} participant${chosen.length === 1 ? "" : "s"}.`,
            parentId: room.id, at: clockIso(), fields: { author: context.actor, kind: "review", reviewId: review.id },
          }, `Review announced in ${room.title}`);
          context.toast("Review hosted", `${review.title} is open with ${chosen.length} participant${chosen.length === 1 ? "" : "s"}.`);
          setBusy(false);
          close();
        }}>Host the review</Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/** AI-005: the coordinator settles a disagreement between agents and records why. */
export function ResolveDisagreement({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const messages = records.filter((record) => record.collection === "messages" && record.parentId === context.params.id);
  const disputes = messages.filter((message) => (message.fields.loop === true || message.fields.disagreement === true) && !message.fields.resolvedBy);
  const [picked, setPicked] = useState<string>();
  const id = picked ?? disputes[0]?.id ?? "";
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const dispute = disputes.find((message) => message.id === id);
  if (disputes.length === 0) return <Empty title="No open disagreement">Nothing in this room is flagged as a loop or a disagreement.</Empty>;
  return (
    <Stack gap={4}>
      <Field label="Disagreement">
        <Select aria-label="Disagreement" value={id} onChange={(event) => setPicked(event.target.value)}>
          {disputes.map((message) => <option key={message.id} value={message.id}>{message.title}</option>)}
        </Select>
      </Field>
      {dispute && <Properties rows={[{ label: "What was said", value: dispute.summary }]} />}
      <Field label="The coordinator's decision" required><TextArea aria-label="The coordinator's decision" value={decision} rows={3} onChange={(event) => setDecision(event.target.value)} /></Field>
      <ModalActions><OverlayActions primary={<Button variant="primary" busy={busy} disabled={!dispute || !decision.trim()} onClick={async () => {
          if (!dispute) return;
          setBusy(true);
          if (!(await context.mutate.patch(dispute.id, { fields: { ...dispute.fields, resolvedBy: context.actor, resolvedAt: clockIso(), resolution: decision.trim() } }, { expectRevision: dispute.revision, event: `Disagreement resolved by ${context.actor}` }))) return;
          await context.mutate.create({
            collection: "messages", title: `Decision: ${decision.trim().slice(0, 60)}`, status: "posted", summary: decision.trim(), parentId: context.params.id,
            at: clockIso(), fields: { author: context.actor, kind: "human", decision: true, resolves: dispute.id },
          }, `Coordinator decision recorded in the mission room`);
          context.toast("Resolved", "The decision is in the room and the disagreement is marked resolved.");
          setBusy(false);
          close();
        }}>Record the decision</Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}
