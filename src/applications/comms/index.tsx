import { AtSign, CalendarDays, Hash, Mail, Megaphone, MessageSquare, Phone, Settings2, Video } from "lucide-react";
import {
  Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import {
  Announcements, Calendar, CallsScreen, ChannelConversation, ChannelCreation, ChannelsDirectory, CommsHome,
  ComposeMail, DirectMessages, EmailInbox, EmailThread, EventEditor, MailBoundary, MeetingRoom,
  MemberManagement, Preferences, PhishingReport, QuickSwitcher, useCommsData,
} from "./panels";
import "./comms.css";

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

function NotificationPreferences() {
  return (
    <Stack gap={3}>
      <Checkbox label="Mentions of my name" defaultChecked />
      <Checkbox label="Direct messages" defaultChecked />
      <Checkbox label="Every message in a channel I am in" />
      <Checkbox label="Announcements that need acknowledgement" defaultChecked />
      <Notice tone="info" title="Nothing leaves this browser">
        There is no push service and no mail provider, so a notification is a badge in this workspace.
      </Notice>
    </Stack>
  );
}

function ChannelArchive({ context, close }: { context: ScreenContext; close: () => void }) {
  const channel = useRecord(context.params.id ?? context.selectedId);
  if (!channel) return <Empty title="Select a channel" icon={<Hash size={20} />} />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Archiving #{channel.title} takes it out of the channel list. Every message stays on the record, so decisions made there can
        still be read.
      </p>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="danger" onClick={async () => {
          await context.mutate.patch(channel.id, { status: "archived" }, { expectRevision: channel.revision, event: `${channel.title} archived by ${context.actor}` });
          context.toast("Channel archived", "The messages are kept and the channel is out of the list.");
          close();
        }}>Archive the channel</Button>
      </Row>
    </Stack>
  );
}

function ThreadDrawer({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const channel = useRecord(context.params.id) ?? data.channels[0];
  if (!channel) return <Empty title="No channel" />;
  const messages = data.messages.filter((message) => message.parentId === channel.id && message.fields.kind !== "ticket");
  const threads = messages.filter((message) => messages.some((reply) => reply.fields.threadRootId === message.id));
  return threads.length === 0 ? <Empty title="No threads yet" icon={<MessageSquare size={20} />}>A reply in a thread keeps a side conversation out of the main flow.</Empty> : (
    <Stack gap={3}>
      {threads.map((root) => {
        const replies = messages.filter((message) => message.fields.threadRootId === root.id);
        return (
          <div key={root.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}><strong className="ds-grow">{root.title}</strong><Pill>{replies.length} replies</Pill></Row>
            <p className="ds-subtle">{root.summary}</p>
            <p className="ds-subtle">Last reply {context.relative(replies.at(-1)?.at)} by {String(replies.at(-1)?.fields.author ?? "")}.</p>
          </div>
        );
      })}
    </Stack>
  );
}

function FilePreview({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const channel = useRecord(context.params.id) ?? data.channels[0];
  const referenced = data.messages.filter((message) => message.parentId === channel?.id && Boolean(message.fields.fileRef));
  return referenced.length === 0 ? <Empty title="No files in this channel" /> : (
    <Stack gap={3}>
      {referenced.map((message) => {
        const document = data.documents.find((row) => row.id === message.fields.fileRef);
        return (
          <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <strong>{document?.title ?? String(message.fields.fileRef)}</strong>
            <p className="ds-subtle">Shared by {String(message.fields.author ?? "")} on {context.date(message.at)}.</p>
            <Notice tone="info">The document lives in this workspace. Referencing it in a channel does not copy it anywhere.</Notice>
          </div>
        );
      })}
    </Stack>
  );
}

function ModerationReport({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="cm-moderation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.log(`Moderation report by ${context.actor}: ${String(form.get("reason") ?? "")}`, { type: "moderation" });
        context.toast("Report recorded", "It is in the workspace activity log for a person to read.");
        close();
      }}
    >
      <Field label="What is wrong" required>
        <Select name="kind" required>{["Harassment", "Confidential information in the wrong place", "Spam", "Something else"].map((option) => <option key={option}>{option}</option>)}</Select>
      </Field>
      <Field label="Detail" required><TextArea name="reason" rows={4} required /></Field>
      <Notice tone="info">A report is recorded for a person to read. Nothing is deleted or hidden automatically.</Notice>
    </form>
  );
}

function ConversationInfo({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const groups = data.channels.filter((channel) => channel.fields.kind === "group");
  const channel = useRecord(context.selectedId) ?? groups[0];
  if (!channel) return <Empty title="No conversation" />;
  return (
    <Stack gap={4}>
      <h3>{channel.title}</h3>
      <Properties rows={[
        { label: "People", value: String(channel.fields.members ?? "") },
        { label: "Messages", value: String(data.messages.filter((message) => message.parentId === channel.id).length) },
        { label: "Started", value: context.date(channel.createdAt) },
      ]} />
      <Notice tone="info" title="Human or agent, always marked">
        Every message carries the name of who wrote it and a badge when it came from an AI employee.
      </Notice>
    </Stack>
  );
}

function MessageActions({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Edit", value: "Keeps the earlier version in the record history" },
        { label: "Delete", value: "Leaves a tombstone so a thread does not lose its shape" },
        { label: "Pin", value: "Puts it on the channel's pinned tab" },
        { label: "Make a task", value: "Creates a task in Projects with a link back here" },
      ]} />
      <Notice tone="info">Everything a message action does is a change to a record in {context.org.shortName}, with an audit entry.</Notice>
    </Stack>
  );
}

function SendConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <Stack gap={4}>
      <MailBoundary />
      <Properties rows={[
        { label: "What happens when you save", value: "A draft record with its recipients, subject and body" },
        { label: "What does not happen", value: "No message is transmitted and no recipient is contacted" },
        { label: "To actually send", value: "Connect a mail provider, then send from a connected mailbox" },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Back</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={() => { context.openOverlay("Compose"); }}>Open the composer</Button>
      </Row>
    </Stack>
  );
}

function RuleEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <form
      id="cm-rule"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.create({
          collection: "preferences",
          title: `Mail rule: ${String(form.get("label") ?? "")}`,
          status: "active",
          summary: `When the sender contains ${String(form.get("match") ?? "")}, label it ${String(form.get("label") ?? "")}.`,
          fields: { kind: "mailRule", match: String(form.get("match") ?? ""), label: String(form.get("label") ?? ""), folder: String(form.get("folder") ?? "inbox") },
        }, `Mail rule created by ${context.actor}`);
        context.toast("Rule saved", "It is applied as new threads are filed in this workspace.");
        close();
      }}
    >
      <Field label="When the sender contains" required><TextInput name="match" placeholder="thamestimber.example" required /></Field>
      <Field label="Apply this label" required><TextInput name="label" placeholder="supplier" required /></Field>
      <Field label="And file it in"><Select name="folder">{["inbox", "archive", "spam"].map((folder) => <option key={folder}>{folder}</option>)}</Select></Field>
      <Notice tone="info">A rule here files threads in this workspace. It cannot touch a mailbox that is not connected.</Notice>
    </form>
  );
}

function ContactInspector({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const thread = useRecord(context.params.id) ?? data.emailThreads[0];
  const contact = data.contacts.find((row) => String(row.fields.email ?? "") === String(thread?.fields.from ?? ""));
  return (
    <Stack gap={4}>
      {contact ? (
        <>
          <Row gap={3}><span><strong>{contact.title}</strong><p className="ds-subtle">{String(contact.fields.company ?? "")}</p></span></Row>
          <Properties rows={[
            { label: "Email", value: String(contact.fields.email ?? "") },
            { label: "Kind", value: String(contact.fields.kind ?? "") },
            { label: "Consent", value: String(contact.fields.consent ?? "Not recorded") },
            { label: "Phone", value: String(contact.fields.phone ?? "Not shared") },
          ]} />
        </>
      ) : (
        <Empty title="No contact matches this sender" icon={<AtSign size={20} />}>
          The address on this thread is not in the contact list, so nothing is assumed about who sent it.
        </Empty>
      )}
    </Stack>
  );
}

function ReplyEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const thread = useRecord(context.params.id ?? context.selectedId);
  if (!thread) return <Empty title="Open a thread first" icon={<Mail size={20} />} />;
  return (
    <form
      id="cm-reply"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const existing = (thread.body as { messages?: { from: string; at: string; body: string; external: boolean }[] } | undefined)?.messages ?? [];
        const reply = {
          from: `${context.actor.split(" ")[0].toLowerCase()}@${context.org.slug}.example`,
          at: new Date().toISOString(),
          body: String(form.get("body") ?? ""),
          external: false,
        };
        await context.mutate.patch(thread.id, {
          status: "draft",
          summary: reply.body.slice(0, 160),
          body: { ...(thread.body as object ?? {}), messages: [...existing, reply] },
          fields: { ...thread.fields, folder: "drafts", messageCount: existing.length + 1 },
        }, { expectRevision: thread.revision, event: `Reply drafted on ${thread.title} by ${context.actor}` });
        context.toast("Reply saved as a draft", "It is on the thread with your name and the time. Nothing was sent.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Thread", value: thread.title },
        { label: "To", value: String(thread.fields.from ?? thread.fields.to ?? "") },
      ]} />
      <Field label="Your reply" required><TextArea name="body" rows={6} required /></Field>
      <MailBoundary what="Replying" />
    </form>
  );
}

function RecordingConsent({ context, close }: { context: ScreenContext; close: () => void }) {
  const meeting = useRecord(context.params.id);
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Recording a meeting needs every participant to agree, and in some places it needs that agreement before the recording
        starts rather than after. This workspace cannot record anything: there is no microphone access and no conferencing service.
      </p>
      <Properties rows={[
        { label: "Meeting", value: meeting?.title ?? "—" },
        { label: "Participants", value: String(meeting?.fields.attendees ?? "").split(",").length.toString() },
        { label: "Recording capability", value: <Pill tone="warning">Not available here</Pill> },
      ]} />
      <Notice tone="info" title="What can be recorded instead">
        Notes and actions typed by a person, attributed to them, kept on the meeting record.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={async () => {
          if (!meeting) return;
          const body = meeting.body as { actions?: { label: string; owner: string; done: boolean }[] } | undefined;
          await context.mutate.patch(meeting.id, {
            body: { ...(meeting.body as object ?? {}), actions: [...(body?.actions ?? []), { label: "Write up what was agreed", owner: context.actor, done: false }] },
          }, { event: `Action added to ${meeting.title} by ${context.actor}` });
          context.toast("Action added", "It is on the meeting record under Notes.");
          close();
        }}>Add an action instead</Button>
      </Row>
    </Stack>
  );
}

function DevicePermissions() {
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Microphone", value: <Pill tone="warning">Not requested</Pill> },
        { label: "Camera", value: <Pill tone="warning">Not requested</Pill> },
        { label: "Screen share", value: <Pill tone="warning">Not requested</Pill> },
      ]} />
      <Notice tone="info" title="No device permission is asked for">
        This workspace never asks for a microphone or a camera, because it has nothing to do with them. A meeting here is a record.
      </Notice>
    </Stack>
  );
}

function Dialer({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="There is no telephony service">
        Nothing here can place a call, and emergency calling is not available from this workspace. Dial from a real phone and
        record what happened against the contact.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/comms/calls`)}>Back to the call log</Button>
    </Stack>
  );
}

function CallTranscript({ context }: { context: ScreenContext }) {
  const call = useRecord(context.selectedId);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const chosen = useRecord(payload?.id) ?? call;
  if (!chosen) return <Empty title="Select a call" icon={<Phone size={20} />} />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Call", value: chosen.title },
        { label: "When", value: context.dateTime(chosen.at) },
        { label: "Outcome", value: String(chosen.fields.outcome ?? "") },
        { label: "Length", value: Number(chosen.fields.seconds ?? 0) === 0 ? "No answer" : `${Math.round(Number(chosen.fields.seconds ?? 0) / 60)} minutes` },
      ]} />
      <Notice tone="warning" title="No recording and no transcript exist">
        {chosen.summary} A note typed by a person is the only record of this call.
      </Notice>
    </Stack>
  );
}

function RecordingNotice() {
  return (
    <Notice tone="warning" title="Call recording is not available">
      Recording a call has legal requirements that differ by jurisdiction, and in any case there is no telephony service here.
      Write a note instead and say who wrote it.
    </Notice>
  );
}

function AudienceSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const data = useCommsData();
  const staff = data.employees.filter((employee) => employee.status !== "alumni");
  if (!post) return <Empty title="Select an announcement" icon={<Megaphone size={20} />} />;
  return (
    <form
      id="cm-audience"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(post.id, {
          fields: { ...post.fields, audience: String(form.get("audience") ?? "Everyone"), requiresAck: form.get("ack") === "on" },
        }, { expectRevision: post.revision, event: `Audience set on ${post.title}` });
        context.toast("Audience saved", "It is on the announcement record.");
        close();
      }}
    >
      <Field label="Who this is for">
        <Select name="audience" defaultValue={String(post.fields.audience ?? "Everyone")}>
          {["Everyone", "Workshop", "Commercial", "Studio", "Managers"].map((audience) => <option key={audience}>{audience}</option>)}
        </Select>
      </Field>
      <Checkbox name="ack" label="Require an acknowledgement" defaultChecked={post.fields.requiresAck === true} />
      <Properties rows={[
        { label: "People employed", value: String(staff.length) },
        { label: "Reaches", value: String(post.fields.audience ?? "Everyone") === "Everyone" ? String(staff.length) : "The people in that group" },
      ]} />
    </form>
  );
}

function PostPreview({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const data = useCommsData();
  const chosen = post ?? data.announcements[0];
  if (!chosen) return <Empty title="No announcement" icon={<Megaphone size={20} />} />;
  const html = (chosen.body as { html?: string } | undefined)?.html;
  return (
    <Stack gap={4}>
      <div className="ds-panel" style={{ padding: "var(--space-5)" }}>
        <h3>{chosen.title}</h3>
        <p className="ds-subtle">{String(chosen.fields.audience ?? "Everyone")} · {context.date(chosen.at)}</p>
        <p className="ds-prose">{html ? html.replace(/<[^>]+>/g, "") : chosen.summary}</p>
      </div>
      <Notice tone="info">This is exactly what a reader sees. Nothing is reformatted when it is published.</Notice>
    </Stack>
  );
}

function PublishReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const data = useCommsData();
  const staff = data.employees.filter((employee) => employee.status !== "alumni").length;
  if (!post) return <Empty title="Select an announcement" />;
  const wide = String(post.fields.audience ?? "") === "Everyone";
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Publishing {post.title} makes it visible to {wide ? `all ${staff} people in this workspace` : String(post.fields.audience)}.
      </p>
      <Properties rows={[
        { label: "Audience", value: String(post.fields.audience ?? "Everyone") },
        { label: "Acknowledgement", value: post.fields.requiresAck === true ? "Required" : "Not required" },
        { label: "Delivery outside this workspace", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      {wide && (
        <Notice tone="warning" title="This goes to everyone">
          A company-wide announcement is read by people who cannot reply to it in private. Check the wording before publishing.
        </Notice>
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={async () => {
          await context.mutate.patch(post.id, { status: "published", at: new Date().toISOString() }, { expectRevision: post.revision, event: `${post.title} published by ${context.actor}` });
          context.toast("Published", "It is on the announcement board in this workspace.");
          close();
        }}>Publish</Button>
      </Row>
    </Stack>
  );
}

function SignatureEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const record = data.preferences.find((row) => row.fields.kind === "commsIdentity");
  if (!record) return <Empty title="No identity recorded" icon={<Settings2 size={20} />} />;
  return (
    <form
      id="cm-signature"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(record.id, { fields: { ...record.fields, signature: String(form.get("signature") ?? "") } }, { expectRevision: record.revision, event: `Signature updated by ${context.actor}` });
        context.toast("Signature saved", "It is on your preference record in this browser.");
        close();
      }}
    >
      <Field label="Signature"><TextArea name="signature" rows={6} defaultValue={String(record.fields.signature ?? "")} /></Field>
      <Notice tone="info">The signature is added to drafts composed here. It travels nowhere until a mailbox is connected.</Notice>
    </form>
  );
}

function AccountSetup() {
  return (
    <Stack gap={4}>
      <MailBoundary what="Connecting a mailbox" />
      <Properties rows={[
        { label: "Provider", value: "None configured" },
        { label: "What a connection would add", value: "Sending, receiving and real delivery status" },
        { label: "What already works", value: "Threads, drafts, labels, rules and links to records" },
      ]} />
      <Notice tone="info">No credential is asked for here, because there is nothing to authenticate against.</Notice>
    </Stack>
  );
}

function PrivacyWarning() {
  return (
    <Notice tone="warning" title="A role view is not an account security boundary">
      Changing another person's preferences is not offered, and what each role view shows is a choice about the interface.
      Everything in this workspace is in one browser database; a future service would enforce this on the server.
    </Notice>
  );
}

export const commsApp = registerApp({
  code: "COMMS",
  short: "Communications",
  name: "Communications, Email, Calendar & Meetings",
  purpose: "Channels, mail, the diary and what was decided",
  icon: MessageSquare,
  nav: [
    { items: [
      { label: "Home", screenId: "ARL-COMMS-001", icon: MessageSquare },
      { label: "Channels", screenId: "ARL-COMMS-002", icon: Hash },
      { label: "Direct messages", screenId: "ARL-COMMS-004", icon: AtSign },
    ] },
    { label: "Mail", items: [
      { label: "Email", screenId: "ARL-COMMS-005", icon: Mail },
    ] },
    { label: "Diary", items: [
      { label: "Calendar", screenId: "ARL-COMMS-007", icon: CalendarDays },
      { label: "Calls & voicemail", screenId: "ARL-COMMS-009", icon: Phone },
    ] },
    { label: "Company", items: [
      { label: "Announcements", screenId: "ARL-COMMS-010", icon: Megaphone },
      { label: "Preferences", screenId: "ARL-COMMS-011", icon: Settings2 },
    ] },
  ],
  screens: {
    "ARL-COMMS-001": {
      id: "ARL-COMMS-001",
      subtitle: (context) => `Unread, mentions and the diary for ${context.actor}.`,
      tabs: (["Overview", "Channels", "DMs", "Calls", "Calendar"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <CommsHome context={context} lens={lens} />,
      })),
      actions: [
        { id: "reply", label: "Compose", placement: "primary", run: (context) => context.openOverlay("Compose") },
        { id: "browse", label: "Jump to", placement: "secondary", run: (context) => context.openOverlay("quick switcher") },
        { id: "Join meeting", label: "Today's diary", placement: "overflow", run: (context) => context.setTab("Calendar") },
        { id: "ask summary", label: "Notification settings", placement: "overflow", run: (context) => context.openOverlay("notification preferences") },
      ],
      overlays: [
        { id: "Compose", kind: "modal", title: "Compose", width: 620, render: ({ close, ...context }) => <ComposeMail context={context} close={close} />, footer: submitFooter("cm-compose", "Save as a draft") },
        { id: "quick switcher", kind: "modal", title: "Jump to", width: 520, render: ({ close, ...context }) => <QuickSwitcher context={context} close={close} /> },
        { id: "notification preferences", kind: "modal", title: "Notifications", width: 520, render: () => <NotificationPreferences /> },
      ],
    },

    "ARL-COMMS-002": {
      id: "ARL-COMMS-002",
      subtitle: () => "Team and project channels, their membership and what is unread.",
      tabs: (["All", "My channels", "Departments", "Archived"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ChannelsDirectory context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create channel", label: "Create a channel", placement: "primary", run: (context) => context.openOverlay("Channel creation") },
        { id: "join", label: "Members", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a channel first"), run: (context) => context.openOverlay("member management") },
        { id: "mute", label: "Archive a channel", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a channel first"), run: (context) => context.openOverlay("channel archive") },
        { id: "search", label: "Jump to a channel", placement: "overflow", run: (context) => context.openOverlay("Channel creation") },
      ],
      overlays: [
        { id: "Channel creation", kind: "modal", title: "Create a channel", width: 560, render: ({ close, ...context }) => <ChannelCreation context={context} close={close} />, footer: submitFooter("cm-channel", "Create channel") },
        { id: "member management", kind: "drawer", title: "Members", width: 480, render: ({ ...context }) => <MemberManagement context={context} /> },
        { id: "channel archive", kind: "modal", title: "Archive this channel", tone: "danger", width: 520, render: ({ close, ...context }) => <ChannelArchive context={context} close={close} /> },
      ],
    },

    "ARL-COMMS-003": {
      id: "ARL-COMMS-003",
      title: () => "Channel",
      subtitle: () => "Threads, reactions, mentions and the files a message points at.",
      tabs: (["Conversation", "Files", "Pinned", "Tasks"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ChannelConversation context={context} lens={lens} />,
      })),
      actions: [
        { id: "create task", label: "Make a task", placement: "primary", run: (context) => context.setTab("Conversation") },
        { id: "thread", label: "Threads", placement: "secondary", run: (context) => context.openOverlay("Thread drawer") },
        { id: "pin", label: "Pinned", placement: "overflow", run: (context) => context.setTab("Pinned") },
        { id: "Reply", label: "Files", placement: "overflow", run: (context) => context.openOverlay("file preview") },
        { id: "mention", label: "Report a message", placement: "overflow", run: (context) => context.openOverlay("moderation report") },
      ],
      overlays: [
        { id: "Thread drawer", kind: "drawer", title: "Threads in this channel", width: 520, render: ({ ...context }) => <ThreadDrawer context={context} /> },
        { id: "file preview", kind: "drawer", title: "Files referenced here", width: 480, render: ({ ...context }) => <FilePreview context={context} /> },
        { id: "moderation report", kind: "modal", title: "Report a message", width: 520, render: ({ close, ...context }) => <ModerationReport context={context} close={close} />, footer: submitFooter("cm-moderation", "Record the report") },
      ],
    },

    "ARL-COMMS-004": {
      id: "ARL-COMMS-004",
      subtitle: () => "One-to-one and small group conversations, with the sender always named.",
      tabs: (["Recent", "Unread", "Groups", "Archived"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <DirectMessages context={context} lens={lens} />,
      })),
      actions: [
        { id: "Send", label: "New conversation", placement: "primary", run: (context) => context.openOverlay("add member") },
        { id: "search", label: "Jump to", placement: "secondary", run: (context) => context.openOverlay("conversation info") },
        { id: "attach", label: "Message actions", placement: "overflow", run: (context) => context.openOverlay("message actions") },
        { id: "audio message", label: "Audio message", placement: "overflow", guard: () => "No microphone is used by this workspace", run: () => undefined },
        { id: "call", label: "Call", placement: "overflow", guard: () => "No telephony service is connected", run: () => undefined },
      ],
      overlays: [
        { id: "Conversation info", kind: "drawer", title: "Conversation", width: 440, render: ({ ...context }) => <ConversationInfo context={context} /> },
        { id: "conversation info", kind: "drawer", title: "Conversation", width: 440, render: ({ ...context }) => <ConversationInfo context={context} /> },
        { id: "add member", kind: "modal", title: "Start a conversation", width: 520, render: ({ close, ...context }) => <ChannelCreation context={context} close={close} />, footer: submitFooter("cm-channel", "Create") },
        { id: "message actions", kind: "modal", title: "What a message action does", width: 520, render: ({ ...context }) => <MessageActions context={context} /> },
      ],
    },

    "ARL-COMMS-005": {
      id: "ARL-COMMS-005",
      subtitle: () => "Threads kept in this browser. Composing works; delivery needs a provider.",
      tabs: (["Inbox", "Sent", "Drafts", "Archive", "Spam"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <EmailInbox context={context} lens={lens} />,
      })),
      actions: [
        { id: "Compose", label: "Compose", placement: "primary", run: (context) => context.openOverlay("Compose window") },
        { id: "archive", label: "Rules", placement: "secondary", run: (context) => context.openOverlay("rule editor") },
        { id: "reply", label: "Open a thread", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a thread first"), run: (context) => context.navigate(`/o/${context.org.slug}/comms/email/${context.selectedId}`) },
        { id: "forward", label: "What sending does", placement: "overflow", run: (context) => context.openOverlay("send confirmation") },
        { id: "label", label: "Spam", placement: "overflow", run: (context) => context.setTab("Spam") },
      ],
      overlays: [
        { id: "Compose window", kind: "modal", title: "Compose", width: 640, render: ({ close, ...context }) => <ComposeMail context={context} close={close} />, footer: submitFooter("cm-compose", "Save as a draft") },
        { id: "send confirmation", kind: "modal", title: "What sending does here", width: 560, render: ({ close, ...context }) => <SendConfirmation context={context} close={close} /> },
        { id: "rule editor", kind: "modal", title: "Mail rule", width: 560, render: ({ close, ...context }) => <RuleEditor context={context} close={close} />, footer: submitFooter("cm-rule", "Save rule") },
      ],
    },

    "ARL-COMMS-006": {
      id: "ARL-COMMS-006",
      title: () => "Email thread",
      subtitle: () => "The messages, who sent them and which of them came from outside.",
      tabs: (["Messages", "Related records", "Activity"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <EmailThread context={context} lens={lens} />,
      })),
      actions: [
        { id: "Reply", label: "Reply", placement: "primary", run: (context) => context.openOverlay("Reply editor") },
        { id: "turn into task", label: "Make a task", placement: "secondary", run: async (context) => {
          const title = context.screen.title;
          await context.mutate.create({
            collection: "tasks",
            title: `Follow up: ${title}`,
            status: "ready",
            summary: `Raised from an email thread by ${context.actor}.`,
            fields: { stage: "ready", assignee: context.actor, priority: "normal", estimateHours: 1, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false },
          }, "Task raised from an email thread");
          context.toast("Task created", "It is in Projects, assigned to you.");
        } },
        { id: "add CC", label: "Contact", placement: "overflow", run: (context) => context.openOverlay("contact inspector") },
        { id: "attach", label: "Report phishing", placement: "overflow", run: (context) => context.openOverlay("report phishing") },
        { id: "block sender", label: "Block the sender", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("report phishing") },
      ],
      overlays: [
        { id: "Reply editor", kind: "modal", title: "Reply", width: 640, render: ({ close, ...context }) => <ReplyEditor context={context} close={close} />, footer: submitFooter("cm-reply", "Save the draft reply") },
        { id: "contact inspector", kind: "drawer", title: "Contact", width: 460, render: ({ ...context }) => <ContactInspector context={context} /> },
        { id: "report phishing", kind: "modal", title: "Report this message", tone: "danger", width: 540, render: ({ close, ...context }) => <PhishingReport context={context} close={close} /> },
      ],
    },

    "ARL-COMMS-007": {
      id: "ARL-COMMS-007",
      subtitle: (context) => `Day, week and month, all drawn around ${context.date(context.now)} in ${context.org.timezone}.`,
      tabs: (["Day", "Week", "Month", "Agenda", "Team"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Calendar context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create event", label: "Create an event", placement: "primary", run: (context) => context.openOverlay("Event editor") },
        { id: "find time", label: "Check for clashes", placement: "secondary", run: (context) => context.openOverlay("conflict inspector") },
        { id: "invite", label: "Attendee status", placement: "overflow", run: (context) => context.openOverlay("attendee status") },
        { id: "move", label: "Month view", placement: "overflow", run: (context) => context.setTab("Month") },
        { id: "reschedule", label: "Week view", placement: "overflow", run: (context) => context.setTab("Week") },
      ],
      overlays: [
        { id: "Event editor", kind: "modal", title: "New event", width: 620, render: ({ close, ...context }) => <EventEditor context={context} close={close} />, footer: submitFooter("cm-event", "Create event") },
        { id: "conflict inspector", kind: "drawer", title: "Clashes", width: 520, render: ({ ...context }) => <ClashInspector context={context} /> },
        { id: "attendee status", kind: "drawer", title: "Attendee status", width: 480, render: ({ ...context }) => <AttendeeStatus context={context} /> },
      ],
    },

    "ARL-COMMS-008": {
      id: "ARL-COMMS-008",
      title: () => "Meeting",
      subtitle: () => "The record of a meeting: time, people, agenda, notes and actions.",
      tabs: (["Call", "Chat", "Notes", "Participants"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <MeetingRoom context={context} lens={lens} />,
      })),
      actions: [
        { id: "record consent", label: "Recording and consent", placement: "primary", run: (context) => context.openOverlay("recording consent") },
        { id: "end", label: "End the meeting", placement: "secondary", run: (context) => context.setTab("Notes") },
        { id: "Mute", label: "Device permissions", placement: "overflow", run: (context) => context.openOverlay("Device permissions") },
        { id: "share", label: "Invite someone", placement: "overflow", run: (context) => context.openOverlay("invite") },
        { id: "raise hand", label: "Participants", placement: "overflow", run: (context) => context.setTab("Participants") },
      ],
      overlays: [
        { id: "Device permissions", kind: "modal", title: "Device permissions", width: 520, render: () => <DevicePermissions /> },
        { id: "invite", kind: "modal", title: "Invite somebody", width: 560, render: ({ close, ...context }) => <EventEditor context={context} close={close} />, footer: submitFooter("cm-event", "Save") },
        { id: "recording consent", kind: "modal", title: "Recording and consent", width: 580, render: ({ close, ...context }) => <RecordingConsent context={context} close={close} /> },
      ],
    },

    "ARL-COMMS-009": {
      id: "ARL-COMMS-009",
      subtitle: () => "Notes about calls that happened on a real phone.",
      tabs: (["Recent", "Missed", "Voicemail", "Queues"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <CallsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "attach CRM", label: "Open the transcript", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a call first"), run: (context) => context.openOverlay("call transcript") },
        { id: "Call", label: "Dialer", placement: "secondary", run: (context) => context.openOverlay("Dialer") },
        { id: "return call", label: "Recording rules", placement: "overflow", run: (context) => context.openOverlay("recording notice") },
        { id: "play voicemail", label: "Voicemail", placement: "overflow", run: (context) => context.setTab("Voicemail") },
      ],
      overlays: [
        { id: "Dialer", kind: "modal", title: "Dialer", tone: "danger", width: 520, render: ({ ...context }) => <Dialer context={context} /> },
        { id: "recording notice", kind: "modal", title: "Call recording", width: 520, render: () => <RecordingNotice /> },
        { id: "call transcript", kind: "drawer", title: "Call", width: 480, render: ({ ...context }) => <CallTranscript context={context} /> },
      ],
    },

    "ARL-COMMS-010": {
      id: "ARL-COMMS-010",
      subtitle: () => "Company posts, who they are for and who has acknowledged them.",
      tabs: (["All", "Draft", "Scheduled", "Published"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Announcements context={context} lens={lens} />,
      })),
      actions: [
        { id: "Draft", label: "Draft an announcement", placement: "primary", run: (context) => context.openOverlay("post preview") },
        { id: "publish", label: "Publish", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose an announcement first"), run: (context) => context.openOverlay("publish review") },
        { id: "target audience", label: "Audience", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose an announcement first"), run: (context) => context.openOverlay("Audience selector") },
        { id: "preview", label: "Preview", placement: "overflow", run: (context) => context.openOverlay("post preview") },
      ],
      overlays: [
        { id: "Audience selector", kind: "modal", title: "Audience", width: 520, render: ({ close, ...context }) => <AudienceSelector context={context} close={close} />, footer: submitFooter("cm-audience", "Save audience") },
        { id: "post preview", kind: "modal", title: "Preview", width: 620, render: ({ ...context }) => <PostPreview context={context} /> },
        { id: "publish review", kind: "modal", title: "Publish this announcement", tone: "danger", width: 560, render: ({ close, ...context }) => <PublishReview context={context} close={close} /> },
      ],
    },

    "ARL-COMMS-011": {
      id: "ARL-COMMS-011",
      subtitle: () => "Your identity, hours, notifications and what colleagues can see.",
      tabs: (["Identity", "Availability", "Notifications", "Privacy"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Preferences context={context} lens={lens} />,
      })),
      actions: [
        { id: "Edit signature", label: "Edit signature", placement: "primary", run: (context) => context.openOverlay("Signature editor") },
        { id: "connect mailbox", label: "Connect a mailbox", placement: "secondary", capability: "manage_connectors", run: (context) => context.openOverlay("account setup") },
        { id: "set schedule", label: "Working hours", placement: "overflow", run: (context) => context.setTab("Availability") },
      ],
      overlays: [
        { id: "Signature editor", kind: "modal", title: "Signature", width: 560, render: ({ close, ...context }) => <SignatureEditor context={context} close={close} />, footer: submitFooter("cm-signature", "Save signature") },
        { id: "account setup", kind: "modal", title: "Connect a mailbox", width: 560, render: () => <AccountSetup /> },
        { id: "privacy warning", kind: "modal", title: "About these settings", width: 520, render: () => <PrivacyWarning /> },
      ],
    },
  },
});

function ClashInspector({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const { now } = useWorkspace();
  const upcoming = data.meetings.filter((meeting) => meeting.startAt && new Date(meeting.startAt) >= now);
  const clashes: { a: string; b: string; when: string }[] = [];
  for (let i = 0; i < upcoming.length; i += 1) {
    for (let j = i + 1; j < upcoming.length; j += 1) {
      const first = upcoming[i];
      const second = upcoming[j];
      if (!first.startAt || !first.endAt || !second.startAt || !second.endAt) continue;
      const overlap = new Date(first.startAt) < new Date(second.endAt) && new Date(second.startAt) < new Date(first.endAt);
      const shared = String(first.fields.attendees ?? "").split(",").some((name) => String(second.fields.attendees ?? "").includes(name.trim()) && name.trim());
      if (overlap && shared) clashes.push({ a: first.title, b: second.title, when: context.dateTime(first.startAt) });
    }
  }
  return clashes.length === 0 ? (
    <Stack gap={3}>
      <Notice tone="success" title="No clashes in the diary">Nobody is double-booked in what this workspace holds.</Notice>
      <p className="ds-subtle">A clash elsewhere is not visible here, because no calendar provider is connected.</p>
    </Stack>
  ) : (
    <Stack gap={3}>
      {clashes.map((clash, index) => (
        <Notice key={index} tone="warning" title={`${clash.a} overlaps ${clash.b}`}>
          Both are at {clash.when} with at least one attendee in common.
        </Notice>
      ))}
    </Stack>
  );
}

function AttendeeStatus({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const { now } = useWorkspace();
  const next = data.meetings.filter((meeting) => meeting.startAt && new Date(meeting.startAt) >= now).sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))[0];
  if (!next) return <Empty title="Nothing is coming up" icon={<CalendarDays size={20} />} />;
  const attendees = String(next.fields.attendees ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  return (
    <Stack gap={4}>
      <h3>{next.title}</h3>
      <p className="ds-subtle">{context.dateTime(next.startAt)} · {String(next.fields.where ?? "")}</p>
      <Stack gap={2}>
        {attendees.map((name) => (
          <Row key={name} gap={2}>
            <span className="ds-grow">{name}</span>
            <Pill tone="neutral" dot>Invited</Pill>
          </Row>
        ))}
      </Stack>
      <Notice tone="warning" title="Nobody is marked as accepted">
        An acceptance made in somebody's own calendar is not known to this workspace, so it is never shown as accepted here.
      </Notice>
      <Row gap={2}>
        <Video size={16} aria-hidden="true" />
        <span className="ds-subtle">Conferencing: not connected.</span>
      </Row>
    </Stack>
  );
}
