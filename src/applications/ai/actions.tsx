import { useState } from "react";
import { Button, Empty, Field, Notice, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useOrgRecords, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";

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
      <Row gap={2}>
        <Button
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
              at: new Date().toISOString(),
              fields: { author: context.actor, kind: "attachment", attachedRecordId: record.id, attachedCollection: record.collection },
            }, `${record.title} attached to the conversation with ${agent.title}`);
            context.toast("Record attached", `${record.title} is in the conversation with ${agent.title}.`);
            setBusy(false);
            close();
          }}
        >
          Attach
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
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
      <Row gap={2}>
        <Button
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
              at: new Date().toISOString(),
              fields: { author: context.actor, kind: "assignment", taskId: task.id },
            }, `Assignment posted in ${room.title}`);
            context.toast("Task assigned", `${person.title} owns “${task.title}”.`);
            setBusy(false);
            close();
          }}
        >
          Assign the task
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

/** Puts a named reviewer on a mission task's review gate. The reviewer cannot be the task owner. */
export function AssignReviewer({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const tasks = records.filter((record) => record.collection === "missionTasks" && record.parentId === context.params.id);
  const gated = tasks.filter((task) => task.fields.approvalRequired === true);
  const pool = gated.length ? gated : tasks;
  const people = records.filter((record) => record.collection === "members" && String(record.fields.kind ?? "human") === "human" && record.status === "active");
  const [taskId, setTaskId] = useState(pool[0]?.id ?? "");
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
      <Row gap={2}>
        <Button
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
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

interface TranscriptEntry { id: string; at: string; speaker: string; text: string; source: string; corrected?: { from: string; at: string; by: string } }

/** Corrects one transcript line and keeps the original on it. */
export function CorrectTranscript({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const session = records.find((record) => record.collection === "meetings" && record.fields.kind === "voice");
  const transcript = ((session?.body as { transcript?: TranscriptEntry[] } | undefined)?.transcript) ?? [];
  const [lineId, setLineId] = useState(transcript.at(-1)?.id ?? "");
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
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!line || !text.trim() || text === line.text}
          onClick={async () => {
            if (!line) return;
            setBusy(true);
            const next = transcript.map((entry) => (entry.id === line.id ? { ...entry, text: text.trim(), corrected: { from: entry.corrected?.from ?? entry.text, at: new Date().toISOString(), by: context.actor } } : entry));
            const saved = await context.mutate.patch(session.id, { body: { ...(session.body as object), transcript: next } }, { expectRevision: session.revision, event: `Transcript line corrected by ${context.actor}` });
            if (saved) context.toast("Line corrected", "The previous text is kept on the line.");
            setBusy(false);
            close();
          }}
        >
          Save the correction
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
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
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={!text.trim()}
          onClick={async () => {
            setBusy(true);
            const saved = await context.mutate.patch(artifact.id, {
              body: { ...body, comments: [...comments, { id: `c-${Date.now()}`, at: new Date().toISOString(), author: context.actor, text: text.trim() }] },
            }, { expectRevision: artifact.revision, event: `Comment added to ${artifact.title} by ${context.actor}` });
            if (saved) { context.toast("Comment added", "It shows on the Comments tab."); context.setTab("Comments"); }
            setBusy(false);
            close();
          }}
        >
          Add the comment
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}
