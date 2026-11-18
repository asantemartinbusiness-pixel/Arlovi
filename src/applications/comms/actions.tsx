import { useMemo, useState } from "react";
import { Avatar, Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { askFirst, Boundary, boundaryText, logBoundary, pickRecord, recordOf, selectedOf } from "@/applications/hr/opsKit";
import { messagesOf, useCommsData } from "./panels";
import { clockIso } from "@/platform/clock";
import { instant, localDate, localParts } from "./schedule";

/* ------------------------------------------------------------------ *
 * Contract actions for the Communications module that change records.
 * ------------------------------------------------------------------ */

const NO_CONFERENCING = "No conferencing service is connected, so no audio, video or screen leaves or enters this browser.";

export function membersOf(channel: Rec): string[] {
  return String(channel.fields.members ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}

export function isMember(channel: Rec, actor: string): boolean {
  const members = membersOf(channel);
  return members[0] === "Everyone" || members.includes(actor);
}

/** A private channel the person is not in is invisible to their search and summaries. */
export function visibleTo(channel: Rec, actor: string): boolean {
  return channel.fields.visibility !== "private" || isMember(channel, actor);
}

const listOf = (value: unknown) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function toggleIn(value: unknown, name: string): { list: string[]; on: boolean } {
  const list = listOf(value);
  const on = !list.includes(name);
  return { list: on ? [...list, name] : list.filter((item) => item !== name), on };
}

/* ---------------- message composer (reply, Reply, mention, Send, attach) ---------------- */

export interface ComposerPayload { channelId?: string; replyToId?: string; mode?: "post" | "mention" | "attach"; dm?: boolean }

export function MessageComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = (context.overlayPayload as ComposerPayload | undefined) ?? {};
  const data = useCommsData();
  const { actor } = useWorkspace();
  const conversations = data.channels.filter((channel) => channel.status !== "archived" && (payload.dm ? channel.fields.kind === "group" : true) && isMember(channel, actor));
  const replyTo = data.messages.find((message) => message.id === payload.replyToId);
  const [channelIdRaw, setChannelId] = useState<string | null>(null);
  const channelId = channelIdRaw ?? (payload.channelId ?? replyTo?.parentId ?? conversations[0]?.id ?? "");
  const [text, setText] = useState("");
  const [mention, setMention] = useState("");
  const [fileRef, setFileRef] = useState("");
  const channel = data.channels.find((row) => row.id === channelId);
  const mode = payload.mode ?? "post";
  const people = [...data.employees.filter((row) => row.status !== "alumni").map((row) => ({ name: row.title, ai: false })), ...data.members.filter((row) => row.fields.kind === "ai").map((row) => ({ name: row.title, ai: true }))];
  const mentionedOutside = mention && channel && !isMember(channel, mention);
  const invalid = !channel || !text.trim() || (mode === "mention" && !mention) || (mode === "attach" && !fileRef);
  return (
    <form
      id="cm-message"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid || !channel) return;
        const body = mode === "mention" ? `@${mention} ${text.trim()}` : text.trim();
        const found = body.match(/@([A-Z][a-z]+ [A-Z][a-z]+)/g)?.map((hit) => hit.slice(1)) ?? [];
        const mentions = [...new Set([...(mention ? [mention] : []), ...found])];
        const root = replyTo ? (String(replyTo.fields.threadRootId ?? "") || replyTo.id) : "";
        await context.mutate.create({
          collection: "messages",
          title: replyTo ? `Re: ${replyTo.title}` : body.split(/[.!?]/)[0].slice(0, 60) || "Message",
          status: "sent",
          summary: body,
          parentId: channel.id,
          at: clockIso(),
          fields: { author: actor, kind: "human", threadRootId: root, reactions: "", mentions: mentions.join(","), fileRef, pinned: false },
        }, `${actor} ${replyTo ? "replied" : "posted"} in ${channel.title}${mentions.length ? `, mentioning ${mentions.join(", ")}` : ""}`);
        context.toast(replyTo ? "Reply posted" : "Message posted", `It is in ${channel.title} in this workspace. Nothing was sent anywhere else.`);
        close();
      }}
    >
      {replyTo ? (
        <Properties rows={[{ label: "Replying to", value: `${String(replyTo.fields.author ?? replyTo.ownerName)}: ${replyTo.summary.slice(0, 120)}` }]} />
      ) : (
        <Field label={payload.dm ? "Conversation" : "Channel or conversation"} required>
          <Select value={channelId} onChange={(event) => setChannelId(event.target.value)} required>
            {conversations.map((row) => <option key={row.id} value={row.id}>{row.fields.kind === "group" ? row.title : `#${row.title}`}</option>)}
          </Select>
        </Field>
      )}
      {mode === "mention" && (
        <Field label="Mention" required>
          <Select value={mention} onChange={(event) => setMention(event.target.value)} required>
            <option value="">Choose a person or an AI employee</option>
            {people.map((person) => <option key={person.name} value={person.name}>{person.name}{person.ai ? " (AI employee)" : ""}</option>)}
          </Select>
        </Field>
      )}
      {mode === "attach" && (
        <Field label="Document from this workspace" required>
          <Select value={fileRef} onChange={(event) => setFileRef(event.target.value)} required>
            <option value="">Choose a document</option>
            {data.documents.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Message" required><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} required /></Field>
      {mode === "mention" && (
        <Notice tone="info" title="A mention notifies; it grants nothing">
          {mentionedOutside ? `${mention} is not a member of this conversation and will not be able to read it. ` : ""}
          Mentioning someone does not give them, or an AI employee, access to any tool, file or channel.
        </Notice>
      )}
      {mode === "attach" && <Notice tone="info">The message points at a document already in this workspace. Nothing is uploaded or copied.</Notice>}
    </form>
  );
}

export function replyToMessage(context: ScreenContext): void {
  pickRecord(context, {
    title: "Reply to a message",
    collection: "messages",
    filter: (row) => row.fields.kind !== "ticket" && String(row.fields.author ?? "") !== context.actor,
    describe: (row) => `${String(row.fields.author ?? row.ownerName)} · ${context.relative(row.at)}`,
    pickLabel: "Reply",
    onPick: (row) => context.openOverlay("message composer", { replyToId: row.id } satisfies ComposerPayload),
  });
}

/* ---------------- ARL-COMMS-001 · Join meeting / ask summary / notifications ---------------- */

export function joinMeeting(context: ScreenContext): void {
  const today = localDate(context.now);
  pickRecord(context, {
    title: "Join a meeting",
    collection: "meetings",
    filter: (row) => Boolean(row.startAt && row.endAt) && row.status !== "finished" && new Date(row.endAt!) >= context.now && localParts(row.startAt).date <= today
      && (String(row.fields.attendees ?? "") === "Everyone" || listOf(row.fields.attendees).includes(context.actor)),
    describe: (row) => `${context.dateTime(row.startAt)} · ${String(row.fields.where ?? "")}`,
    pickLabel: "Join",
    empty: `No meeting with ${context.actor} is on today`,
    onPick: async (meeting) => {
      const joined = listOf(meeting.fields.joined);
      if (!joined.includes(context.actor)) {
        await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, joined: [...joined, context.actor].join(",") } }, { expectRevision: meeting.revision, event: `${context.actor} joined ${meeting.title}` });
      }
      context.toast("Joined the meeting record", `You are marked present on ${meeting.title}. ${NO_CONFERENCING}`);
      context.navigate(`/o/${context.org.slug}/comms/meetings/${meeting.id}`);
    },
  });
}

export function AskSummary({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const { actor } = useWorkspace();
  const visible = data.channels.filter((channel) => channel.status !== "archived" && visibleTo(channel, actor));
  const withheld = data.channels.filter((channel) => channel.status !== "archived" && !visibleTo(channel, actor)).length;
  const unread = visible.filter((channel) => Number(channel.fields.unread ?? 0) > 0);
  const visibleIds = new Set(visible.map((channel) => channel.id));
  const mentions = data.messages.filter((message) => visibleIds.has(String(message.parentId)) && listOf(message.fields.mentions).includes(actor));
  const upcoming = data.meetings.filter((meeting) => meeting.startAt && new Date(meeting.startAt) >= context.now && (String(meeting.fields.attendees ?? "") === "Everyone" || listOf(meeting.fields.attendees).includes(actor)))
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt))).slice(0, 3);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Unread", value: unread.length ? unread.map((channel) => `${channel.fields.kind === "group" ? "" : "#"}${channel.title} (${String(channel.fields.unread)})`).join(", ") : "Nothing unread" },
        { label: "Mentions of you", value: mentions.length ? `${mentions.length}: ${mentions.slice(0, 3).map((message) => `${String(message.fields.author ?? "")} — “${message.summary.slice(0, 60)}”`).join("; ")}` : "None" },
        { label: "Next on your diary", value: upcoming.length ? upcoming.map((meeting) => `${meeting.title}, ${context.dateTime(meeting.startAt)}`).join("; ") : "Nothing booked" },
      ]} />
      <Notice tone="info" title="Restricted channels are left out">
        {withheld > 0 ? `${withheld} private channel${withheld === 1 ? " you are" : "s you are"} not a member of ${withheld === 1 ? "is" : "are"} not read for this summary. ` : ""}
        Private channels are only summarised for their members.
      </Notice>
      <Boundary id="model.inference" title="Composed from records, not by a model" />
    </Stack>
  );
}

export function NotificationPreferences({ context, close }: { context: ScreenContext; close: () => void }) {
  const prefs = useCollections(["preferences"]).preferences;
  const mine = prefs.find((row) => row.fields.kind === "commsNotifications" && row.fields.person === context.actor);
  return (
    <form
      id="cm-notifications"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const fields = { kind: "commsNotifications", person: context.actor, mentions: form.get("mentions") === "on", direct: form.get("direct") === "on", everyMessage: form.get("every") === "on", announcements: form.get("announcements") === "on" };
        if (mine) await context.mutate.patch(mine.id, { fields }, { expectRevision: mine.revision, event: `Notification preferences changed by ${context.actor}` });
        else await context.mutate.create({ collection: "preferences", title: `${context.actor} · notifications`, status: "active", summary: "Notification preferences.", fields }, `Notification preferences saved by ${context.actor}`);
        context.toast("Notifications saved", "They shape badges in this workspace only.");
        close();
      }}
    >
      <Checkbox name="mentions" label="Mentions of my name" defaultChecked={mine ? mine.fields.mentions === true : true} />
      <Checkbox name="direct" label="Direct messages" defaultChecked={mine ? mine.fields.direct === true : true} />
      <Checkbox name="every" label="Every message in a channel I am in" defaultChecked={mine?.fields.everyMessage === true} />
      <Checkbox name="announcements" label="Announcements that need acknowledgement" defaultChecked={mine ? mine.fields.announcements === true : true} />
      <Notice tone="info" title="Nothing leaves this browser">There is no push service and no mail provider, so a notification is a badge in this workspace.</Notice>
    </form>
  );
}

/* ---------------- ARL-COMMS-002 · join / mute / search ---------------- */

export async function joinChannel(context: ScreenContext): Promise<void> {
  const channel = await selectedOf(context, "channels", "a channel");
  if (!channel) return;
  if (isMember(channel, context.actor)) { context.toast("Already a member", `${context.actor} is already in #${channel.title}.`, "info"); return; }
  if (channel.fields.visibility === "private") { context.toast("Private channel", `#${channel.title} is private. A member has to add you; joining is not offered.`, "blocked"); return; }
  const next = [...membersOf(channel), context.actor];
  await context.mutate.patch(channel.id, { fields: { ...channel.fields, members: next.join(","), memberCount: next.length } }, { expectRevision: channel.revision, event: `${context.actor} joined ${channel.title}` });
  context.toast("Joined", `${context.actor} is now a member of #${channel.title}.`);
}

export async function muteChannel(context: ScreenContext): Promise<void> {
  const channel = await selectedOf(context, "channels", "a channel");
  if (!channel) return;
  const { list, on } = toggleIn(channel.fields.mutedBy, context.actor);
  await context.mutate.patch(channel.id, { fields: { ...channel.fields, mutedBy: list.join(",") } }, { expectRevision: channel.revision, event: `${channel.title} ${on ? "muted" : "unmuted"} by ${context.actor}` });
  context.toast(on ? "Muted" : "Unmuted", `#${channel.title} ${on ? "no longer badges" : "badges again"} for ${context.actor}. Other members are unaffected.`);
}

export function ChannelSearch({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const { actor, org } = useWorkspace();
  const [query, setQuery] = useState("");
  const visible = data.channels.filter((channel) => visibleTo(channel, actor));
  const visibleIds = new Set(visible.map((channel) => channel.id));
  const text = query.trim().toLowerCase();
  const channels = text ? visible.filter((channel) => `${channel.title} ${channel.summary}`.toLowerCase().includes(text)) : visible.slice(0, 8);
  const messages = text ? data.messages.filter((message) => visibleIds.has(String(message.parentId)) && message.summary.toLowerCase().includes(text)).slice(0, 8) : [];
  return (
    <Stack gap={3}>
      <Field label="Search channels and messages"><TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></Field>
      <Stack gap={1}>
        {channels.map((channel) => (
          <button key={channel.id} type="button" className="cm-channel" onClick={() => { context.navigate(`/o/${org.slug}/comms/channels/${channel.id}`); close(); }}>
            <span className="ds-grow ds-truncate">#{channel.title}</span>
            {channel.fields.visibility === "private" && <Pill tone="warning">Private</Pill>}
          </button>
        ))}
        {messages.map((message) => (
          <button key={message.id} type="button" className="cm-channel" onClick={() => { context.navigate(`/o/${org.slug}/comms/channels/${String(message.parentId)}`); close(); }}>
            <span className="ds-grow ds-truncate">{String(message.fields.author ?? "")}: {message.summary}</span>
          </button>
        ))}
        {channels.length === 0 && messages.length === 0 && <span className="ds-subtle">Nothing matches.</span>}
      </Stack>
      <Notice tone="info">Private channels you are not a member of, and their messages, are never in these results.</Notice>
    </Stack>
  );
}

/* ---------------- ARL-COMMS-003 · create task / pin ---------------- */

function channelMessage(context: ScreenContext, title: string, label: string, onPick: (row: Rec) => void): void {
  pickRecord(context, {
    title,
    collection: "messages",
    filter: (row) => row.parentId === context.params.id && row.fields.kind !== "ticket" && row.status !== "deleted",
    describe: (row) => `${String(row.fields.author ?? row.ownerName)} · ${context.relative(row.at)}${row.fields.pinned === true ? " · pinned" : ""}`,
    pickLabel: label,
    empty: "No messages in this conversation",
    onPick,
  });
}

export async function messageToTask(context: ScreenContext, message: Rec): Promise<void> {
  const channelId = String(message.parentId ?? "");
  const task = await context.mutate.create({
    collection: "tasks", title: message.title, status: "ready",
    summary: `${message.summary} — raised from a message by ${context.actor}.`,
    fields: { stage: "ready", assignee: context.actor, priority: "normal", estimateHours: 2, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false, fromChannelId: channelId, sourceMessageId: message.id },
  }, `Task raised from a message by ${context.actor}`);
  await context.mutate.patch(message.id, { fields: { ...message.fields, taskId: task.id } }, { event: `Message linked to task ${task.title}` });
  context.toast("Task created", "It is in Projects with a link back to the message.");
}

export function createTaskFromMessage(context: ScreenContext): void {
  channelMessage(context, "Make a task from a message", "Make a task", (row) => messageToTask(context, row));
}

export async function togglePinned(context: ScreenContext, message: Rec): Promise<void> {
  const on = message.fields.pinned !== true;
  await context.mutate.patch(message.id, { status: on ? "pinned" : "sent", fields: { ...message.fields, pinned: on } }, { expectRevision: message.revision, event: `${message.title} ${on ? "pinned" : "unpinned"} by ${context.actor}` });
  context.toast(on ? "Pinned" : "Unpinned", on ? "It is on the Pinned tab." : "It is off the Pinned tab.");
}

export function pinMessage(context: ScreenContext): void {
  channelMessage(context, "Pin or unpin a message", "Pin / unpin", (row) => togglePinned(context, row));
}

/* ---------------- ARL-COMMS-004 · search / call / add member / message actions ---------------- */

export function MessageSearch({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const { actor } = useWorkspace();
  const [query, setQuery] = useState("");
  const mine = useMemo(() => new Set(data.channels.filter((channel) => channel.fields.kind === "group" && isMember(channel, actor)).map((channel) => channel.id)), [data.channels, actor]);
  const text = query.trim().toLowerCase();
  const hits = text ? data.messages.filter((message) => mine.has(String(message.parentId)) && `${message.summary} ${String(message.fields.author ?? "")}`.toLowerCase().includes(text)).slice(0, 20) : [];
  return (
    <Stack gap={3}>
      <Field label="Search your conversations"><TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus /></Field>
      {text && hits.length === 0 && <span className="ds-subtle">Nothing matches.</span>}
      {hits.map((message) => {
        const ai = message.fields.kind === "ai";
        const conversation = data.channels.find((channel) => channel.id === message.parentId);
        return (
          <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}>
              <Avatar name={String(message.fields.author ?? "")} kind={ai ? "ai" : "human"} size="sm" />
              <strong className="ds-grow">{String(message.fields.author ?? "")}</strong>
              {ai ? <Pill tone="accent">AI employee</Pill> : <Pill tone="neutral">Person</Pill>}
            </Row>
            <p>{message.summary}</p>
            <p className="ds-subtle">{conversation?.title} · {context.dateTime(message.at)}</p>
          </div>
        );
      })}
      <Notice tone="info">Only conversations you are in are searched. Every result says whether a person or an AI employee wrote it.</Notice>
    </Stack>
  );
}

export function placeCall(context: ScreenContext): void {
  pickRecord(context, {
    title: "Call someone in a conversation",
    collection: "channels",
    filter: (row) => row.fields.kind === "group" && isMember(row, context.actor),
    describe: (row) => membersOf(row).filter((name) => name !== context.actor).join(", "),
    pickLabel: "Call",
    onPick: (conversation) => askFirst(context, {
      title: "Call",
      body: `Records a call attempt to ${membersOf(conversation).filter((name) => name !== context.actor).join(", ")}. Nothing dials: there is no telephony service, and no emergency calling.`,
      boundary: "telephony",
      confirm: "Record the call attempt",
      run: async () => {
        const call = await context.mutate.create({ collection: "calls", title: `${conversation.title} — not placed`, status: "not placed", summary: `Call attempt recorded by ${context.actor}; no telephony service is connected.`, at: clockIso(), fields: { direction: "outbound", seconds: 0, outcome: "not placed", voicemail: false, queue: "Direct", conversationId: conversation.id } }, `Call attempt recorded by ${context.actor}`);
        await logBoundary(context, "telephony", `Call to ${conversation.title} not placed`, call.id);
        context.toast("Call not placed", boundaryText("telephony"), "info");
      },
    }),
  });
}

export function AddMember({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const { actor } = useWorkspace();
  const conversations = data.channels.filter((channel) => channel.fields.kind === "group" && channel.status !== "archived" && isMember(channel, actor));
  const [channelIdRaw, setChannelId] = useState<string | null>(null);
  const channelId = channelIdRaw ?? (conversations.find((row) => row.id === context.selectedId)?.id ?? conversations[0]?.id ?? "");
  const channel = conversations.find((row) => row.id === channelId);
  const members = channel ? membersOf(channel) : [];
  const candidates = [...data.employees.filter((row) => row.status !== "alumni"), ...data.members.filter((row) => row.fields.kind === "ai")].filter((row) => !members.includes(row.title));
  return (
    <form
      id="cm-add-member"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("person") ?? "");
        if (!channel || !name) return;
        const next = [...members, name];
        await context.mutate.patch(channel.id, { title: channel.title, fields: { ...channel.fields, members: next.join(","), memberCount: next.length } }, { expectRevision: channel.revision, event: `${name} added to ${channel.title} by ${actor}` });
        context.toast("Member added", `${name} can read ${channel.title} from now on.`);
        close();
      }}
    >
      {conversations.length === 0 ? <Empty title="You are in no conversations" /> : (
        <>
          <Field label="Conversation"><Select value={channelId} onChange={(event) => setChannelId(event.target.value)}>{conversations.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>
          <Properties rows={[{ label: "In it now", value: members.join(", ") }]} />
          <Field label="Add" required>
            <Select name="person" required defaultValue="">
              <option value="">Choose a person</option>
              {candidates.map((row) => <option key={row.id} value={row.title}>{row.title}{row.fields.kind === "ai" ? " (AI employee)" : ""}</option>)}
            </Select>
          </Field>
          <Notice tone="info">A new member reads what is said from now on and is marked as a person or an AI employee beside every message.</Notice>
        </>
      )}
    </form>
  );
}

export function MessageActions({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const { actor } = useWorkspace();
  const mine = new Set(data.channels.filter((channel) => channel.fields.kind === "group" && isMember(channel, actor)).map((channel) => channel.id));
  const recent = data.messages.filter((message) => mine.has(String(message.parentId)) && message.status !== "deleted").sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  const [idRaw, setId] = useState<string | null>(null);
  const id = idRaw ?? (recent[0]?.id ?? "");
  const message = recent.find((row) => row.id === id);
  return (
    <Stack gap={4}>
      {recent.length === 0 ? <Empty title="No messages in your conversations" /> : (
        <>
          <Field label="Message">
            <Select value={id} onChange={(event) => setId(event.target.value)}>
              {recent.map((row) => <option key={row.id} value={row.id}>{String(row.fields.author ?? "")}: {row.summary.slice(0, 60)}</option>)}
            </Select>
          </Field>
          {message && (
            <Row gap={2} wrap>
              <Button variant="secondary" onClick={() => togglePinned(context, message)}>{message.fields.pinned === true ? "Unpin" : "Pin"}</Button>
              <Button variant="secondary" disabled={Boolean(message.fields.taskId)} onClick={() => messageToTask(context, message)}>{message.fields.taskId ? "Task already made" : "Make a task"}</Button>
              <Button
                variant="outline-danger"
                disabled={String(message.fields.author ?? "") !== actor}
                title={String(message.fields.author ?? "") !== actor ? "Only the author can delete a message" : undefined}
                onClick={async () => {
                  await context.mutate.patch(message.id, { status: "deleted", summary: "This message was deleted by its author.", fields: { ...message.fields, deletedBy: actor } }, { expectRevision: message.revision, event: `Message deleted by ${actor}; the earlier text is kept in its history` });
                  context.toast("Message deleted", "A tombstone keeps the thread's shape; the earlier version is in the record history.");
                }}
              >
                Delete
              </Button>
            </Row>
          )}
        </>
      )}
      <Notice tone="info">Everything a message action does is a change to a record in {context.org.shortName}, with an audit entry.</Notice>
    </Stack>
  );
}

/* ---------------- ARL-COMMS-005 · archive / label / forward ---------------- */

export async function archiveThread(context: ScreenContext): Promise<void> {
  const thread = await selectedOf(context, "emailThreads", "a thread");
  if (!thread) return;
  await context.mutate.patch(thread.id, { status: "archive", fields: { ...thread.fields, folder: "archive", archivedBy: context.actor } }, { expectRevision: thread.revision, event: `${thread.title} archived by ${context.actor}` });
  context.toast("Archived", `${thread.title} is in Archive.`);
}

export function LabelThread({ context, close }: { context: ScreenContext; close: () => void }) {
  const thread = useRecord(context.selectedId);
  if (!thread || thread.collection !== "emailThreads") return <Empty title="Select a thread first" />;
  return (
    <form
      id="cm-label"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const labels = listOf(new FormData(event.currentTarget).get("labels")).map((label) => label.toLowerCase());
        await context.mutate.patch(thread.id, { tags: labels, fields: { ...thread.fields, labels: labels.join(",") } }, { expectRevision: thread.revision, event: `Labels on ${thread.title} set to ${labels.join(", ") || "none"} by ${context.actor}` });
        context.toast("Labels saved", labels.length ? labels.join(", ") : "The thread has no labels.");
        close();
      }}
    >
      <h3>{thread.title}</h3>
      <Field label="Labels" hint="Separate with commas."><TextInput name="labels" defaultValue={listOf(thread.fields.labels).join(", ")} /></Field>
    </form>
  );
}

export interface SendRequest { to: string[]; subject: string; body: string; sourceId?: string; kind: "forward" }

const SENSITIVE = ["confidential", "payroll", "legal", "hr", "contract", "personal"];

export function ForwardMail({ context }: { context: ScreenContext }) {
  const thread = useRecord(context.selectedId);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  if (!thread || thread.collection !== "emailThreads") return <Empty title="Select a thread first" />;
  const recipients = listOf(to);
  const invalid = recipients.length === 0 || recipients.some((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
  const quoted = messagesOf(thread).map((message) => `> ${message.from} (${message.at.slice(0, 10)}): ${message.body}`).join("\n");
  return (
    <form
      id="cm-forward"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        context.openOverlay("send confirmation", { to: recipients, subject: `Fwd: ${thread.title}`, body: `${note}\n\n${quoted}`, sourceId: thread.id, kind: "forward" } satisfies SendRequest);
      }}
    >
      <Properties rows={[{ label: "Forwarding", value: thread.title }, { label: "Messages included", value: String(messagesOf(thread).length) }]} />
      <Field label="To" required hint="Separate addresses with a comma."><TextInput value={to} onChange={(event) => setTo(event.target.value)} invalid={to.length > 0 && invalid} required /></Field>
      <Field label="Note"><TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Notice tone="info">The next step confirms the recipients before anything is queued.</Notice>
    </form>
  );
}

export function SendConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const request = context.overlayPayload as SendRequest | undefined;
  const source = useRecord(request?.sourceId);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!request) {
    return (
      <Stack gap={4}>
        <Boundary id="email.send" />
        <Properties rows={[
          { label: "What happens when you send", value: "A queued draft record with its recipients, subject and body" },
          { label: "What does not happen", value: "No message is transmitted and no recipient is contacted" },
        ]} />
      </Stack>
    );
  }
  const domain = `${context.org.slug}.example`;
  const external = request.to.filter((address) => !address.endsWith(`@${domain}`));
  const sensitive = SENSITIVE.some((word) => `${source?.title ?? ""} ${String(source?.fields.labels ?? "")}`.toLowerCase().includes(word));
  const bulk = request.to.length > 4;
  const needsCheck = sensitive || bulk || external.length > 0;
  return (
    <Stack gap={4}>
      <ModalInFlight when={busy} />
      <Properties rows={[
        { label: "To", value: request.to.join(", ") },
        { label: "Subject", value: request.subject },
        { label: "Outside the company", value: external.length ? external.join(", ") : "None" },
        { label: "Sensitive", value: sensitive ? <Pill tone="warning">Labelled sensitive</Pill> : "No" },
      ]} />
      {needsCheck && <Checkbox label={`I have checked these ${request.to.length} recipients and they should receive this`} checked={checked} onChange={(event) => setChecked(event.target.checked)} />}
      <Boundary id="email.send" />
      <ModalActions>
        <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={busy || (needsCheck && !checked)}
          busy={busy}
          onClick={async () => {
            if (busy || (needsCheck && !checked)) return;
            setBusy(true);
            try {
              const from = `${context.actor.split(" ")[0].toLowerCase()}@${domain}`;
            const draft = await context.mutate.create({
              collection: "emailThreads", title: request.subject, status: "draft", summary: request.body.slice(0, 160), at: clockIso(), tags: ["draft"],
              fields: { folder: "drafts", from, to: request.to.join(", "), unread: false, risk: "none", labels: "draft", delivery: "queued_local", messageCount: 1, forwardedFrom: request.sourceId ?? "", recipientsConfirmedBy: needsCheck ? context.actor : "" },
              body: { messages: [{ from, at: clockIso(), body: request.body, external: false }] },
            }, `Forward of ${source?.title ?? "a thread"} queued by ${context.actor}`);
            await logBoundary(context, "email.send", `Forward to ${request.to.join(", ")} queued locally`, draft.id);
            context.toast("Forward queued locally", boundaryText("email.send"));
            close();
            } catch (error) {
              context.toast("Forward not queued", error instanceof Error ? error.message : "Review the recipients and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Queue the forward
        </Button>
      </ModalActions>
    </Stack>
  );
}

/* ---------------- ARL-COMMS-006 · add CC / attach / block sender ---------------- */

export function AddCc({ context, close }: { context: ScreenContext; close: () => void }) {
  const thread = useRecord(context.params.id);
  const [value, setValue] = useState("");
  if (!thread) return <Empty title="Open a thread first" />;
  const current = listOf(thread.fields.cc);
  const addresses = listOf(value);
  const invalid = addresses.length === 0 || addresses.some((address) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address));
  return (
    <form
      id="cm-cc"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const next = [...new Set([...current, ...addresses])];
        await context.mutate.patch(thread.id, { fields: { ...thread.fields, cc: next.join(", ") } }, { expectRevision: thread.revision, event: `CC on ${thread.title} set to ${next.join(", ")} by ${context.actor}` });
        context.toast("CC added", `${addresses.join(", ")} will be copied on the next reply drafted here.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Copied now", value: current.join(", ") || "Nobody" }]} />
      <Field label="Add to CC" required hint="Separate addresses with a comma."><TextInput value={value} onChange={(event) => setValue(event.target.value)} invalid={value.length > 0 && invalid} required /></Field>
      <Notice tone="info">Adding a CC changes this thread's record. Nobody is contacted until a mailbox is connected.</Notice>
    </form>
  );
}

export function AttachToThread({ context, close }: { context: ScreenContext; close: () => void }) {
  const thread = useRecord(context.params.id);
  const documents = useCollections(["documents"]).documents;
  if (!thread) return <Empty title="Open a thread first" />;
  const current = listOf(thread.fields.attachments);
  return (
    <form
      id="cm-attach"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const id = String(new FormData(event.currentTarget).get("document") ?? "");
        const document = documents.find((row) => row.id === id);
        if (!document) return;
        await context.mutate.patch(thread.id, { fields: { ...thread.fields, attachments: [...new Set([...current, document.title])].join(", "), attachmentIds: [...new Set([...listOf(thread.fields.attachmentIds), document.id])].join(",") } }, { expectRevision: thread.revision, event: `${document.title} attached to ${thread.title} by ${context.actor}` });
        context.toast("Attached", `${document.title} is attached to the draft reply on this thread.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Attached now", value: current.join(", ") || "Nothing" }]} />
      <Field label="Document from this workspace" required>
        <Select name="document" required defaultValue="">
          <option value="">Choose a document</option>
          {documents.map((row) => <option key={row.id} value={row.id}>{row.title}{row.fields.confidential === true ? " (confidential)" : ""}</option>)}
        </Select>
      </Field>
      <Boundary id="email.send" />
    </form>
  );
}

export async function blockSender(context: ScreenContext): Promise<void> {
  const thread = await recordOf(context, context.params.id, "emailThreads");
  if (!thread) { context.toast("Open a thread first", "Nothing was blocked.", "blocked"); return; }
  const sender = String(thread.fields.from ?? "");
  if (!sender.trim()) { context.toast("No sender to block", "This thread has no sender address on record (it is your own draft). Nothing was blocked.", "blocked"); return; }
  askFirst(context, {
    title: `Block ${sender}`,
    body: `Future threads from ${sender} are filed in Spam by a rule in this workspace, and this thread moves to Spam now. Nothing in a message from this sender can change the rule or any agent policy.`,
    confirm: "Block the sender",
    tone: "danger",
    run: async () => {
      await context.mutate.create({ collection: "preferences", title: `Blocked sender: ${sender}`, status: "active", summary: `Threads from ${sender} are filed in Spam.`, fields: { kind: "mailRule", match: sender, label: "blocked", folder: "spam", createdBy: context.actor } }, `${sender} blocked by ${context.actor}`);
      await context.mutate.patch(thread.id, { status: "spam", fields: { ...thread.fields, folder: "spam", blockedBy: context.actor } }, { expectRevision: thread.revision, event: `${thread.title} moved to Spam after blocking ${sender}` });
      context.toast("Sender blocked", `${sender} is on the block rule and this thread is in Spam.`);
    },
  });
}

/* ---------------- ARL-COMMS-007 · find time / invite / move / reschedule ---------------- */

function busy(meetings: Rec[], people: string[], start: Date, end: Date, except?: string): Rec[] {
  return meetings.filter((meeting) => meeting.id !== except && meeting.startAt && meeting.endAt && meeting.status !== "cancelled"
    && new Date(meeting.startAt) < end && new Date(meeting.endAt) > start
    && (String(meeting.fields.attendees ?? "") === "Everyone" || listOf(meeting.fields.attendees).some((name) => people.includes(name))));
}

export function FindTime({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const { now, actor } = useWorkspace();
  const [people, setPeople] = useState<string[]>([actor]);
  const [minutes, setMinutes] = useState(30);
  const [title, setTitle] = useState("");
  const slots = useMemo(() => {
    const found: Date[] = [];
    for (let day = 0; day < 10 && found.length < 6; day += 1) {
      const date = new Date(now.getTime() + day * 86_400_000);
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      for (let hour = 9; hour < 17 && found.length < 6; hour += 0.5) {
        const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), Math.floor(hour), (hour % 1) * 60));
        const end = new Date(start.getTime() + minutes * 60_000);
        if (start <= now || end.getUTCHours() + end.getUTCMinutes() / 60 > 17.5) continue;
        if (busy(data.meetings, people, start, end).length === 0) found.push(start);
      }
    }
    return found;
  }, [data.meetings, people, minutes, now]);
  return (
    <Stack gap={4}>
      <Field label="Meeting title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Who needs to be there">
        <Select multiple value={people} onChange={(event) => setPeople(Array.from(event.target.selectedOptions).map((option) => option.value))} style={{ minHeight: 110 }}>
          {data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id} value={row.title}>{row.title}</option>)}
        </Select>
      </Field>
      <Field label="Minutes"><TextInput inputMode="numeric" align="end" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value) || 30)} /></Field>
      <Stack gap={2}>
        <strong>First free times, 09:00–17:30 UTC on weekdays</strong>
        {slots.length === 0 && <span className="ds-subtle">No common free time in the next ten days.</span>}
        {slots.map((slot) => (
          <Row key={slot.toISOString()} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <span className="ds-grow ds-num">{context.dateTime(slot)}</span>
            <Button size="sm" variant="secondary" disabled={!title.trim()} onClick={async () => {
              const end = new Date(slot.getTime() + minutes * 60_000);
              await context.mutate.create({ collection: "meetings", title: title.trim(), status: "scheduled", summary: "Booked from a free time found in this workspace.", startAt: slot.toISOString(), endAt: end.toISOString(), at: slot.toISOString(), fields: { where: "Studio table", organizer: actor, attendees: people.join(","), agenda: "", minutes, recurring: false, conferencing: "not_connected", accepted: 0 } }, `${title.trim()} booked at a free time by ${actor}`);
              context.toast("Booked", `${title.trim()} is at ${context.dateTime(slot)}. Attendees are invited, not accepted.`);
              close();
            }}>Book this time</Button>
          </Row>
        ))}
      </Stack>
      <Notice tone="info">Free time is worked out from meetings in this workspace only; an external calendar is not attached.</Notice>
    </Stack>
  );
}

export function InviteToMeeting({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const upcoming = data.meetings.filter((meeting) => meeting.startAt && new Date(meeting.startAt) >= context.now && meeting.status !== "cancelled");
  const fixed = context.params.id ? data.meetings.find((row) => row.id === context.params.id) : undefined;
  const [meetingIdRaw, setMeetingId] = useState<string | null>(null);
  const meetingId = meetingIdRaw ?? (fixed?.id ?? upcoming.find((row) => row.id === context.selectedId)?.id ?? upcoming[0]?.id ?? "");
  const meeting = data.meetings.find((row) => row.id === meetingId);
  const attendees = meeting ? listOf(meeting.fields.attendees) : [];
  const everyone = attendees[0] === "Everyone";
  return (
    <form
      id="cm-invite"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("person") ?? "");
        if (!meeting || !name || everyone) return;
        await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, attendees: [...attendees, name].join(","), invitedPending: [...listOf(meeting.fields.invitedPending), name].join(",") } }, { expectRevision: meeting.revision, event: `${name} invited to ${meeting.title} by ${context.actor}` });
        await logBoundary(context, "calendar.sync", `Invitation for ${name} to ${meeting.title} kept locally`, meeting.id);
        context.toast("Invited", `${name} is on ${meeting.title} as invited. Their answer is unknown until somebody records it.`);
        close();
      }}
    >
      {!fixed && (
        <Field label="Meeting"><Select value={meetingId} onChange={(event) => setMeetingId(event.target.value)}>{upcoming.map((row) => <option key={row.id} value={row.id}>{row.title} · {context.dateTime(row.startAt)}</option>)}</Select></Field>
      )}
      {meeting && <Properties rows={[{ label: "Meeting", value: `${meeting.title} · ${context.dateTime(meeting.startAt)}` }, { label: "Attendees", value: attendees.join(", ") }]} />}
      {everyone ? <Notice tone="info">Everyone is already invited to this meeting.</Notice> : (
        <Field label="Invite" required>
          <Select name="person" required defaultValue="">
            <option value="">Choose a person</option>
            {data.employees.filter((row) => row.status !== "alumni" && !attendees.includes(row.title)).map((row) => <option key={row.id}>{row.title}</option>)}
          </Select>
        </Field>
      )}
      <Boundary id="calendar.sync" />
    </form>
  );
}

export function RescheduleMeeting({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { mode?: "move" | "reschedule" } | undefined;
  const mode = payload?.mode ?? "reschedule";
  const data = useCommsData();
  const upcoming = data.meetings.filter((meeting) => meeting.startAt && meeting.endAt && new Date(meeting.endAt) >= context.now && meeting.status !== "finished");
  const [meetingIdRaw, setMeetingId] = useState<string | null>(null);
  const meetingId = meetingIdRaw ?? (upcoming.find((row) => row.id === context.selectedId)?.id ?? upcoming[0]?.id ?? "");
  const meeting = upcoming.find((row) => row.id === meetingId);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  if (upcoming.length === 0) return <Empty title="Nothing upcoming to move" />;
  if (!meeting) return <Empty title="Choose a meeting" />;
  const length = new Date(meeting.endAt!).getTime() - new Date(meeting.startAt!).getTime();
  const current = localParts(meeting.startAt);
  const day = date || current.date;
  const at = time || current.time;
  const start = new Date(instant(day, at) || Number.NaN);
  const end = new Date(start.getTime() + length);
  const clashes = busy(data.meetings, listOf(meeting.fields.attendees), start, end, meeting.id);
  const past = start < context.now;
  const unchanged = start.toISOString() === new Date(meeting.startAt!).toISOString();
  return (
    <form
      id="cm-reschedule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (past || unchanged || Number.isNaN(start.getTime())) return;
        await context.mutate.patch(meeting.id, {
          startAt: start.toISOString(), endAt: end.toISOString(), at: start.toISOString(),
          status: clashes.length ? "tentative" : mode === "reschedule" ? "scheduled" : meeting.status,
          fields: { ...meeting.fields, previousStartAt: meeting.startAt!, accepted: mode === "reschedule" ? 0 : Number(meeting.fields.accepted ?? 0), movedBy: context.actor },
        }, { expectRevision: meeting.revision, event: `${meeting.title} ${mode === "move" ? "moved" : "rescheduled"} from ${meeting.startAt} to ${start.toISOString()} by ${context.actor}` });
        if (mode === "reschedule") await logBoundary(context, "calendar.sync", `New time for ${meeting.title} kept locally; attendees must confirm again`, meeting.id);
        context.toast(mode === "move" ? "Moved" : "Rescheduled", `${meeting.title} is at ${context.dateTime(start)}${clashes.length ? ", tentative because of a clash" : ""}.`);
        close();
      }}
    >
      <Field label="Meeting"><Select value={meetingId} onChange={(event) => { setMeetingId(event.target.value); setDate(""); setTime(""); }}>{upcoming.map((row) => <option key={row.id} value={row.id}>{row.title} · {context.dateTime(row.startAt)}</option>)}</Select></Field>
      <Row gap={3}>
        <Field label="New date"><TextInput type="date" value={day} onChange={(event) => setDate(event.target.value)} invalid={past} /></Field>
        <Field label="Start (local time)"><TextInput type="time" value={at} onChange={(event) => setTime(event.target.value)} /></Field>
      </Row>
      <Properties rows={[{ label: "Length kept", value: `${Math.round(length / 60_000)} minutes` }, { label: "Now", value: context.dateTime(meeting.startAt) }]} />
      {past && <Notice tone="danger" title="That time has passed">Choose a time after now.</Notice>}
      {clashes.length > 0 && <Notice tone="warning" title="Clashes with attendees' other meetings">{clashes.map((row) => `${row.title} at ${context.dateTime(row.startAt)}`).join("; ")}. It will be saved as tentative.</Notice>}
      {mode === "reschedule" && <Notice tone="info">Rescheduling resets recorded acceptances: an answer to the old time is not assumed for the new one.</Notice>}
    </form>
  );
}

/* ---------------- ARL-COMMS-008 · consent / end / mute / raise hand ---------------- */

export function RecordingConsent({ context, close }: { context: ScreenContext; close: () => void }) {
  const meeting = useRecord(context.params.id);
  const attendees = meeting ? listOf(meeting.fields.attendees) : [];
  const [consented, setConsented] = useState<string[]>(meeting ? listOf(meeting.fields.recordingConsent) : []);
  if (!meeting) return <Empty title="Open a meeting first" />;
  const everyoneMode = attendees[0] === "Everyone";
  const all = !everyoneMode && attendees.length > 0 && attendees.every((name) => consented.includes(name));
  return (
    <Stack gap={4}>
      <p className="ds-prose">Record each participant's answer. Recording needs everyone's agreement first, and in some places that agreement has to come before recording starts.</p>
      {everyoneMode ? <Notice tone="warning" title="Attendees are not listed by name">Consent cannot be recorded for “Everyone”. List the attendees first.</Notice> : (
        <Stack gap={2}>
          {attendees.map((name) => (
            <Checkbox key={name} label={`${name} agrees to be recorded`} checked={consented.includes(name)} onChange={(event) => setConsented((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} />
          ))}
        </Stack>
      )}
      <Properties rows={[
        { label: "Agreed", value: `${consented.length} of ${everyoneMode ? "?" : attendees.length}` },
        { label: "Recording possible here", value: <Pill tone="warning">No — no conferencing service</Pill> },
      ]} />
      <Notice tone="info">Even with everyone's consent recorded, nothing is recorded: {NO_CONFERENCING}</Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button variant="primary" disabled={everyoneMode} onClick={async () => {
          await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, recordingConsent: consented.join(","), consentComplete: all, consentRecordedBy: context.actor, consentRecordedAt: clockIso() } }, { expectRevision: meeting.revision, event: `Recording consent recorded on ${meeting.title} by ${context.actor}: ${consented.length} of ${attendees.length} agreed` });
          context.toast("Consent recorded", all ? "Everyone agreed. Recording is still not available in this workspace." : `${consented.length} of ${attendees.length} agreed, so recording would not be allowed.`);
          close();
        }}>Record the answers</Button>
      </Row>
    </Stack>
  );
}

export async function endMeeting(context: ScreenContext): Promise<void> {
  const meeting = await recordOf(context, context.params.id, "meetings");
  if (!meeting) { context.toast("Open a meeting first", "Nothing was ended.", "blocked"); return; }
  if (meeting.status === "finished") { context.toast("Already ended", `${meeting.title} is already finished.`, "info"); context.setTab("Notes"); return; }
  askFirst(context, {
    title: "End the meeting",
    body: `${meeting.title} is marked finished at ${context.dateTime(context.now)}, ended by ${context.actor}. Notes and actions stay editable.`,
    confirm: "End the meeting",
    run: async () => {
      await context.mutate.patch(meeting.id, { status: "finished", fields: { ...meeting.fields, endedBy: context.actor, endedAt: clockIso() } }, { expectRevision: meeting.revision, event: `${meeting.title} ended by ${context.actor}` });
      context.toast("Meeting ended", "The record is finished; write up what was decided.");
      context.setTab("Notes");
    },
  });
}

async function toggleMeetingList(context: ScreenContext, field: "muted" | "handsRaised", on: string, off: string): Promise<void> {
  const meeting = await recordOf(context, context.params.id, "meetings");
  if (!meeting) { context.toast("Open a meeting first", "Nothing changed.", "blocked"); return; }
  const { list, on: now } = toggleIn(meeting.fields[field], context.actor);
  await context.mutate.patch(meeting.id, { fields: { ...meeting.fields, [field]: list.join(",") } }, { expectRevision: meeting.revision, event: `${context.actor} ${now ? on : off} in ${meeting.title}` });
  context.toast(now ? `${on[0].toUpperCase()}${on.slice(1)}` : `${off[0].toUpperCase()}${off.slice(1)}`, `Shown on the Participants tab. ${NO_CONFERENCING}`);
}

export const toggleMute = (context: ScreenContext) => toggleMeetingList(context, "muted", "muted", "unmuted");
export const toggleHand = (context: ScreenContext) => toggleMeetingList(context, "handsRaised", "raised a hand", "lowered a hand");

/* ---------------- ARL-COMMS-009 · attach CRM / Call / return call / voicemail ---------------- */

export function AttachCrm({ context, close }: { context: ScreenContext; close: () => void }) {
  const call = useRecord(context.selectedId);
  const contacts = useCollections(["contacts"]).contacts;
  if (!call || call.collection !== "calls") return <Empty title="Select a call first" />;
  return (
    <form
      id="cm-crm"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const contact = contacts.find((row) => row.id === String(form.get("contact") ?? ""));
        if (!contact) return;
        await context.mutate.patch(call.id, { fields: { ...call.fields, contactId: contact.id, contactName: contact.title, crmNote: String(form.get("note") ?? "") } }, { expectRevision: call.revision, event: `${call.title} attached to ${contact.title} by ${context.actor}` });
        context.toast("Attached to the contact", `${call.title} is on ${contact.title}'s record.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Call", value: call.title }, { label: "Currently attached to", value: contacts.find((row) => row.id === call.fields.contactId)?.title ?? "Nobody" }]} />
      <Field label="Contact" required>
        <Select name="contact" required defaultValue={String(call.fields.contactId ?? "")}>
          <option value="">Choose a contact</option>
          {contacts.map((row) => <option key={row.id} value={row.id}>{row.title}{row.fields.company ? ` · ${String(row.fields.company)}` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Note for the contact record"><TextArea name="note" rows={3} defaultValue={call.summary} /></Field>
    </form>
  );
}

export function Dialer({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { returnOf?: string } | undefined;
  const original = useRecord(payload?.returnOf);
  const contacts = useCollections(["contacts"]).contacts;
  const [contactIdRaw, setContactId] = useState<string | null>(null);
  const contactId = contactIdRaw ?? (String(original?.fields.contactId ?? ""));
  const [number, setNumber] = useState("");
  const contact = contacts.find((row) => row.id === contactId);
  const target = contact?.title ?? number.trim();
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="There is no telephony service">
        Nothing here can place a call, and emergency calling is not available from this workspace. Dial from a real phone.
      </Notice>
      {original && <Properties rows={[{ label: "Returning", value: `${original.title} · ${context.dateTime(original.at)}` }]} />}
      <Field label="Contact">
        <Select value={contactId} onChange={(event) => setContactId(event.target.value)}>
          <option value="">Not a saved contact</option>
          {contacts.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {!contact && <Field label="Number"><TextInput inputMode="tel" value={number} onChange={(event) => setNumber(event.target.value)} /></Field>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button variant="primary" disabled={!target} onClick={async () => {
          const call = await context.mutate.create({ collection: "calls", title: `${target} — not placed`, status: "not placed", summary: `${original ? "Return call" : "Call"} recorded by ${context.actor}; no telephony service is connected.`, at: clockIso(), fields: { contactId: contact?.id ?? "", direction: "outbound", seconds: 0, outcome: "not placed", voicemail: false, queue: "Direct", returnOf: original?.id ?? "", number: contact ? String(contact.fields.phone ?? "") : number.trim() } }, `${original ? "Return call" : "Call"} to ${target} recorded by ${context.actor}`);
          if (original) await context.mutate.patch(original.id, { fields: { ...original.fields, returnedBy: context.actor, returnCallId: call.id } }, { expectRevision: original.revision, event: `${original.title} returned by ${context.actor} (not placed: no telephony)` });
          await logBoundary(context, "telephony", `Call to ${target} not placed`, call.id);
          context.toast("Call recorded, not placed", boundaryText("telephony"), "info");
          close();
        }}>{original ? "Record the return call" : "Record the call"}</Button>
      </Row>
    </Stack>
  );
}

export async function returnCall(context: ScreenContext): Promise<void> {
  const open = (call: Rec) => context.openOverlay("Dialer", { returnOf: call.id });
  const chosen = await recordOf(context, context.selectedId, "calls");
  if (chosen && (chosen.status === "missed" || chosen.fields.voicemail === true)) { open(chosen); return; }
  pickRecord(context, {
    title: "Return a call",
    collection: "calls",
    filter: (row) => (row.status === "missed" || row.fields.voicemail === true) && !row.fields.returnedBy,
    describe: (row) => context.dateTime(row.at),
    pickLabel: "Return",
    empty: "No missed call is waiting",
    onPick: open,
  });
}

export function Voicemail({ context, close }: { context: ScreenContext; close: () => void }) {
  const call = useRecord(context.selectedId);
  if (!call || call.collection !== "calls" || call.fields.voicemail !== true) return <Empty title="Select a voicemail on the Voicemail tab" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "From", value: call.title },
        { label: "Left", value: context.dateTime(call.at) },
        { label: "Note", value: call.summary },
        { label: "Reviewed", value: call.fields.heardBy ? `By ${String(call.fields.heardBy)}` : "Not yet" },
      ]} />
      <Boundary id="telephony" title="There is no audio to play" />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button variant="primary" disabled={Boolean(call.fields.heardBy)} onClick={async () => {
          await context.mutate.patch(call.id, { fields: { ...call.fields, heardBy: context.actor, heardAt: clockIso() } }, { expectRevision: call.revision, event: `Voicemail note from ${call.title} reviewed by ${context.actor}` });
          context.toast("Marked reviewed", "The voicemail note is recorded as dealt with.");
          close();
        }}>Mark the voicemail reviewed</Button>
      </Row>
    </Stack>
  );
}

/* ---------------- ARL-COMMS-010 · Draft ---------------- */

export function DraftAnnouncement({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="cm-draft"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();
        const body = String(form.get("body") ?? "").trim();
        if (!title || !body) return;
        const created = await context.mutate.create({ collection: "announcements", title, status: "draft", summary: body, at: clockIso(), fields: { audience: String(form.get("audience") ?? "Everyone"), acknowledgements: 0, requiresAck: form.get("ack") === "on", reach: 0, sensitive: form.get("sensitive") === "on" } }, `Announcement drafted by ${context.actor}`);
        context.select(created.id);
        context.toast("Draft saved", "It is on the Draft tab. Nobody sees it until it is published.");
        close();
      }}
    >
      <Field label="Headline" required><TextInput name="title" required /></Field>
      <Field label="Announcement" required><TextArea name="body" rows={6} required /></Field>
      <Field label="Who it is for"><Select name="audience" defaultValue="Everyone">{["Everyone", "Workshop", "Commercial", "Studio", "Managers"].map((audience) => <option key={audience}>{audience}</option>)}</Select></Field>
      <Checkbox name="ack" label="Require an acknowledgement" />
      <Checkbox name="sensitive" label="Sensitive — needs a second reviewer before publishing" />
    </form>
  );
}

/* ---------------- ARL-COMMS-011 · set schedule / connect mailbox ---------------- */

export function WorkingHours({ context, close }: { context: ScreenContext; close: () => void }) {
  const prefs = useCollections(["preferences"]).preferences;
  const { actor, org } = useWorkspace();
  const record = prefs.find((row) => row.fields.kind === "commsIdentity" && row.title.startsWith(actor.split(" ")[0]));
  const [start, setStart] = useState(String(record?.fields.workingStart ?? "09:00"));
  const [end, setEnd] = useState(String(record?.fields.workingEnd ?? "17:30"));
  if (!record) return <Notice tone="warning" title="Only your own schedule can be set">No preference record belongs to {actor} in this role view. Another person's settings are not editable here.</Notice>;
  const backwards = end <= start;
  return (
    <form
      id="cm-hours"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (backwards) return;
        const form = new FormData(event.currentTarget);
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].filter((day) => form.get(day) === "on");
        await context.mutate.patch(record.id, { fields: { ...record.fields, workingStart: start, workingEnd: end, workingDays: days.join(","), timezone: org.timezone } }, { expectRevision: record.revision, event: `Working schedule set by ${actor}: ${days.join(" ")} ${start}–${end}` });
        context.toast("Schedule saved", `${days.join(", ")} ${start}–${end} in ${org.timezone}.`);
        close();
      }}
    >
      <Row gap={3}>
        <Field label="Start"><TextInput type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="End"><TextInput type="time" value={end} onChange={(event) => setEnd(event.target.value)} invalid={backwards} /></Field>
      </Row>
      <Row gap={2} wrap>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <Checkbox key={day} name={day} label={day} defaultChecked={listOf(record.fields.workingDays ?? "Mon,Tue,Wed,Thu,Fri").includes(day)} />)}
      </Row>
      {backwards && <Notice tone="danger" title="The day ends before it starts">Choose an end time after the start.</Notice>}
      <Notice tone="info">This changes your own record only. Changing a colleague's schedule is not offered in any role view.</Notice>
    </form>
  );
}

export async function requestMailboxConnection(context: ScreenContext): Promise<void> {
  await context.mutate.create({ collection: "preferences", title: `Mailbox connection requested by ${context.actor}`, status: "configuration_required", summary: "Waiting for a mail provider to be configured. Nothing is connected.", fields: { kind: "mailboxConnection", requestedBy: context.actor, state: "configuration_required" } }, `Mailbox connection requested by ${context.actor}`);
  await logBoundary(context, "email.send", "Mailbox connection request recorded");
  context.toast("Request recorded", "The connection is recorded as configuration required. No credential was asked for and nothing connected.", "info");
}
