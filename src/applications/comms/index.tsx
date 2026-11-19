import { useState } from "react";
import { AtSign, CalendarDays, Hash, Mail, Megaphone, MessageSquare, Phone, Settings2, Video } from "lucide-react";
import {
  Button, Checkbox, Empty, FactGrid, Field, ModalActions, Notice, OverlayActions, OverlaySummary, OVERLAY_WIDTH, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import {
  Announcements, Calendar, CallsScreen, ChannelConversation, ChannelCreation, ChannelsDirectory, CommsHome,
  DirectMessages, EmailThread, MailBoundary,
  MemberManagement, Preferences, PhishingReport, QuickSwitcher, useCommsData,
} from "./panels";
import { DraftComposer } from "./mail";
import { EmailExperience, mailTabCount, type EmailArea } from "./EmailExperience";
import { EventForm, MeetingWorkspace } from "./meetings";
import "./comms.css";
import { kitOverlays, needsSelection } from "@/applications/hr/opsKit";
import {
  AddCc, AddMember, AskSummary, AttachCrm, AttachToThread, ChannelSearch, Dialer, DraftAnnouncement, FindTime, ForwardMail,
  InviteToMeeting, LabelThread, MessageActions, MessageComposer, MessageSearch, NotificationPreferences, RecordingConsent,
  RescheduleMeeting, SendConfirmation, Voicemail, WorkingHours, archiveThread, blockSender, createTaskFromMessage, endMeeting,
  joinChannel, joinMeeting, muteChannel, pinMessage, placeCall, replyToMessage, requestMailboxConnection, returnCall,
  toggleHand, toggleMute,
} from "./actions";
import { clockIso } from "@/platform/clock";

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

function ChannelHeading({ id, part }: { id: string | undefined; part: "title" | "status" | "meta" }) {
  const channel = useRecord(id);
  if (!channel) return part === "title" ? <>Channel</> : null;
  if (part === "title") return <>{channel.fields.kind === "group" ? channel.title : `#${channel.title}`}</>;
  if (part === "status") return <Pill tone={channel.fields.visibility === "private" ? "warning" : "neutral"} dot>{String(channel.fields.visibility ?? "public")}</Pill>;
  const declared = Number(channel.fields.memberCount ?? 0);
  const listed = String(channel.fields.members ?? "").split(",").filter(Boolean).length;
  const count = declared > 0 ? declared : listed;
  return <>{channel.summary}{count > 0 ? ` · ${count} ${count === 1 ? "member" : "members"}` : " · Membership not recorded"}</>;
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
      <OverlayActions
        variant="confirm"
        end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        primary={<Button variant="danger" onClick={async () => {
          await context.mutate.patch(channel.id, { status: "archived" }, { expectRevision: channel.revision, event: `${channel.title} archived by ${context.actor}` });
          context.toast("Channel archived", "The messages are kept and the channel is out of the list.");
          close();
        }}>Archive the channel</Button>}
      />
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
          at: clockIso(),
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
      <FactGrid columns={2} items={[
        { label: "People employed", value: String(staff.length), mono: true },
        { label: "Reaches", value: String(post.fields.audience ?? "Everyone") === "Everyone" ? String(staff.length) : "The people in that group", mono: String(post.fields.audience ?? "Everyone") === "Everyone" },
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
      <p className="ds-subtle">This is what a reader sees. Nothing is reformatted on publish.</p>
    </Stack>
  );
}

function PublishReviewSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  if (!post) return null;
  const published = post.status === "published";
  return (
    <OverlaySummary
      eyebrow="Announcement"
      title={post.title}
      status={<Pill tone={published ? "success" : post.status === "scheduled" ? "info" : "neutral"} dot>{post.status}</Pill>}
      meta={[String(post.fields.audience ?? "Everyone"), post.at ? context.date(post.at) : undefined]}
    />
  );
}

function PublishReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const data = useCommsData();
  const staff = data.employees.filter((employee) => employee.status !== "alumni").length;
  if (!post) return <Empty title="Select an announcement" />;
  const audience = String(post.fields.audience ?? "Everyone");
  const wide = audience === "Everyone";
  const needsReview = wide || post.fields.sensitive === true;
  const published = post.status === "published";
  return (
    <Stack gap={4}>
      <FactGrid columns={3} items={[
        { label: "Reaches", value: wide ? `${staff} people` : audience },
        { label: "Acknowledgement", value: post.fields.requiresAck === true ? "Required" : "Not required" },
        { label: "On the board", value: "Visible in Arlovi at once" },
      ]} />
      <Notice tone="info" title="Not emailed">No mail or push service is connected, so only people who open Arlovi see this.</Notice>
      {wide && <Notice tone="warning" title="This goes to everyone">Readers cannot reply to it in private. Check the wording before publishing.</Notice>}
      {needsReview && <Checkbox label={`I have reviewed the wording and the audience${post.fields.sensitive === true ? " of this sensitive post" : ""}`} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />}
      <ModalActions>
        <OverlayActions
          busy={busy}
          primary={(
            <Button variant="primary" disabled={published || (needsReview && !reviewed)} onClick={async () => {
              setBusy(true);
              try {
                const saved = await context.mutate.patch(post.id, { status: "published", at: clockIso(), fields: { ...post.fields, publishedBy: context.actor, reviewedBy: needsReview ? context.actor : "" } }, { expectRevision: post.revision, event: `${post.title} published by ${context.actor}${needsReview ? " after review" : ""}` });
                if (!saved) {
                  context.toast("Not published", "The announcement changed after this was opened. Close, check the latest version and try again.", "failed");
                  return;
                }
                context.toast("Published to the board", "People see it in Arlovi. Nothing was emailed.");
                close();
              } catch (error) {
                context.toast("Not published", error instanceof Error ? error.message : "The announcement changed after this was opened. Close, check the latest version and try again.", "failed");
              } finally { setBusy(false); }
            }}>{published ? "Already published" : "Publish to the board"}</Button>
          )}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
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

function AccountSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No mail service is connected">A connection request is recorded for an administrator. No credential is asked for here.</Notice>
      <Properties rows={[
        { label: "Provider", value: "None configured" },
        { label: "What a connection would add", value: "Sending, receiving and real delivery status" },
        { label: "What already works", value: "Threads, drafts, labels, rules and links to records" },
      ]} />
      <OverlayActions
        primary={<Button variant="primary" disabled={!context.can("manage_connectors")} onClick={async () => { await requestMailboxConnection(context); close(); }}>Record the connection request</Button>}
        end={<Button variant="ghost" onClick={close}>Close</Button>}
      />
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
        { id: "reply", label: "Reply to a message", placement: "primary", run: (context) => replyToMessage(context) },
        { id: "browse", label: "Browse and jump to", placement: "secondary", run: (context) => context.openOverlay("quick switcher") },
        { id: "Join meeting", label: "Join a meeting", placement: "overflow", run: (context) => joinMeeting(context) },
        { id: "ask summary", label: "Ask for a summary", placement: "overflow", run: (context) => context.openOverlay("summary") },
        { id: "compose", label: "Compose an email", placement: "overflow", run: (context) => context.openOverlay("Compose") },
        { id: "notifications", label: "Notification settings", placement: "overflow", run: (context) => context.openOverlay("notification preferences") },
        { id: "diary", label: "Today's diary", placement: "overflow", run: (context) => context.setTab("Calendar") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "message composer", kind: "modal", title: "Write a message", width: 560, render: ({ close, ...context }) => <MessageComposer context={context} close={close} />, footer: submitFooter("cm-message", "Post") },
        { id: "summary", kind: "drawer", title: "What needs you", width: 520, render: ({ ...context }) => <AskSummary context={context} /> },
        { id: "Compose", kind: "modal", title: "Draft an email", width: 660, render: ({ close, ...context }) => <DraftComposer context={context} close={close} />, footer: submitFooter("cm-compose", "Save as a draft") },
        { id: "quick switcher", kind: "modal", title: "Jump to", width: 520, render: ({ close, ...context }) => <QuickSwitcher context={context} close={close} /> },
        { id: "notification preferences", kind: "modal", title: "Notifications", width: 520, render: ({ close, ...context }) => <NotificationPreferences context={context} close={close} />, footer: submitFooter("cm-notifications", "Save notifications") },
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
        { id: "join", label: "Join the channel", placement: "secondary", guard: needsSelection("a channel"), run: (context) => joinChannel(context) },
        { id: "mute", label: "Mute or unmute", placement: "overflow", guard: needsSelection("a channel"), run: (context) => muteChannel(context) },
        { id: "search", label: "Search channels", placement: "overflow", run: (context) => context.openOverlay("channel search") },
        { id: "members", label: "Members", placement: "overflow", guard: needsSelection("a channel"), run: (context) => context.openOverlay("member management") },
        { id: "archive", label: "Archive a channel", placement: "overflow", tone: "danger", guard: needsSelection("a channel"), run: (context) => context.openOverlay("channel archive") },
      ],
      overlays: [
        { id: "channel search", kind: "modal", title: "Search channels", width: 560, render: ({ close, ...context }) => <ChannelSearch context={context} close={close} /> },
        { id: "Channel creation", kind: "modal", title: "Create a channel", width: 560, render: ({ close, ...context }) => <ChannelCreation context={context} close={close} />, footer: submitFooter("cm-channel", "Create channel") },
        { id: "member management", kind: "drawer", title: "Members", width: 480, render: ({ ...context }) => <MemberManagement context={context} /> },
        { id: "channel archive", kind: "modal", title: "Archive this channel", tone: "danger", width: 520, render: ({ close, ...context }) => <ChannelArchive context={context} close={close} /> },
      ],
    },

    "ARL-COMMS-003": {
      id: "ARL-COMMS-003",
      title: () => "Channel",
      record: (context) => ({
        title: <ChannelHeading id={context.params.id} part="title" />,
        status: <ChannelHeading id={context.params.id} part="status" />,
        meta: [<ChannelHeading key="m" id={context.params.id} part="meta" />],
      }),
      tabs: (["Conversation", "Files", "Pinned", "Tasks"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ChannelConversation context={context} lens={lens} />,
      })),
      actions: [
        { id: "create task", label: "Make a task", placement: "primary", run: (context) => createTaskFromMessage(context) },
        { id: "thread", label: "Threads", placement: "secondary", run: (context) => context.openOverlay("Thread drawer") },
        { id: "pin", label: "Pin a message", placement: "overflow", run: (context) => pinMessage(context) },
        { id: "Reply", label: "Reply in the channel", placement: "overflow", run: (context) => context.openOverlay("message composer", { channelId: context.params.id }) },
        { id: "mention", label: "Mention someone", placement: "overflow", run: (context) => context.openOverlay("message composer", { channelId: context.params.id, mode: "mention" }) },
        { id: "files", label: "Files", placement: "overflow", run: (context) => context.openOverlay("file preview") },
        { id: "report", label: "Report a message", placement: "overflow", run: (context) => context.openOverlay("moderation report") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "message composer", kind: "modal", title: "Write a message", width: 560, render: ({ close, ...context }) => <MessageComposer context={context} close={close} />, footer: submitFooter("cm-message", "Post") },
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
        { id: "Send", label: "Send a message", placement: "primary", run: (context) => context.openOverlay("message composer", { dm: true }) },
        { id: "search", label: "Search messages", placement: "secondary", run: (context) => context.openOverlay("message search") },
        { id: "attach", label: "Attach a document", placement: "overflow", run: (context) => context.openOverlay("message composer", { dm: true, mode: "attach" }) },
        { id: "audio message", label: "Audio message", placement: "overflow", run: (context) => context.toast("Audio messages need an audio service", "No audio or speech service is connected, so nothing was recorded. Write the message instead; it is kept exactly as typed.", "blocked") },
        { id: "call", label: "Call", placement: "overflow", run: (context) => placeCall(context) },
        { id: "new conversation", label: "New conversation", placement: "overflow", run: (context) => context.openOverlay("new conversation") },
        { id: "add member", label: "Add someone", placement: "overflow", run: (context) => context.openOverlay("add member") },
        { id: "message actions", label: "Message actions", placement: "overflow", run: (context) => context.openOverlay("message actions") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "message composer", kind: "modal", title: "Write a message", width: 560, render: ({ close, ...context }) => <MessageComposer context={context} close={close} />, footer: submitFooter("cm-message", "Post") },
        { id: "message search", kind: "drawer", title: "Search messages", width: 520, render: ({ ...context }) => <MessageSearch context={context} /> },
        { id: "new conversation", kind: "modal", title: "Start a conversation", width: 520, render: ({ close, ...context }) => <ChannelCreation context={context} close={close} />, footer: submitFooter("cm-channel", "Create") },
        { id: "Conversation info", kind: "drawer", title: "Conversation", width: 440, render: ({ ...context }) => <ConversationInfo context={context} /> },
        { id: "conversation info", kind: "drawer", title: "Conversation", width: 440, render: ({ ...context }) => <ConversationInfo context={context} /> },
        { id: "add member", kind: "modal", title: "Add someone to a conversation", width: 520, render: ({ close, ...context }) => <AddMember context={context} close={close} />, footer: submitFooter("cm-add-member", "Add") },
        { id: "message actions", kind: "modal", title: "Message actions", width: 560, render: ({ ...context }) => <MessageActions context={context} /> },
      ],
    },

    "ARL-COMMS-005": {
      id: "ARL-COMMS-005",
      subtitle: () => "Mail is kept in this browser. No mail service is connected, so nothing is delivered.",
      tabs: (["Inbox", "Sent", "Drafts", "Archive", "Spam", "Shared inboxes", "Accounts & domains", "Sender identities"] as EmailArea[]).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <EmailExperience context={context} lens={lens} />, count: () => mailTabCount(lens),
      })),
      actions: [
        { id: "Compose", label: "Compose", placement: "primary", run: (context) => context.openOverlay("Compose window") },
        { id: "archive", label: "Archive", placement: "secondary", guard: needsSelection("a thread"), run: (context) => archiveThread(context) },
        { id: "reply", label: "Reply", placement: "overflow", guard: needsSelection("a thread"), run: (context) => context.openOverlay("reply") },
        { id: "forward", label: "Forward", placement: "overflow", guard: needsSelection("a thread"), run: (context) => context.openOverlay("forward") },
        { id: "label", label: "Label", placement: "overflow", guard: needsSelection("a thread"), run: (context) => context.openOverlay("label") },
        { id: "rules", label: "Rules", placement: "overflow", run: (context) => context.openOverlay("rule editor") },
        { id: "open thread", label: "Open a thread", placement: "overflow", guard: needsSelection("a thread"), run: (context) => context.navigate(`/o/${context.org.slug}/comms/email/${context.selectedId}`) },
      ],
      overlays: [
        { id: "reply", kind: "modal", title: "Reply", width: 640, render: ({ close, ...context }) => <ReplyEditor context={context} close={close} />, footer: submitFooter("cm-reply", "Save the draft reply") },
        { id: "forward", kind: "modal", title: "Forward", width: 600, render: ({ ...context }) => <ForwardMail context={context} />, footer: submitFooter("cm-forward", "Check recipients") },
        { id: "label", kind: "modal", title: "Label this thread", width: 480, render: ({ close, ...context }) => <LabelThread context={context} close={close} />, footer: submitFooter("cm-label", "Save labels") },
        { id: "Compose window", kind: "modal", title: "Compose email", width: 760, render: ({ close, ...context }) => <DraftComposer context={context} close={close} />, footer: submitFooter("cm-compose", "Save as a draft") },
        { id: "send confirmation", kind: "modal", title: "Confirm the recipients", width: 600, presentation: { noRecordContext: true, guidance: "Review recipients, external destinations and sensitive content before queuing a local draft." }, render: ({ close, ...context }) => <SendConfirmation context={context} close={close} /> },
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
          const { getRecord } = await import("@/platform/repo");
          const thread = await getRecord(context.params.id ?? "");
          if (!thread || thread.collection !== "emailThreads") { context.toast("Open a thread first", "No task was created.", "blocked"); return; }
          const task = await context.mutate.create({
            collection: "tasks",
            title: `Follow up: ${thread.title}`,
            status: "ready",
            summary: `Raised from the email thread “${thread.title}” by ${context.actor}.`,
            fields: { stage: "ready", assignee: context.actor, priority: "normal", estimateHours: 1, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false, sourceThreadId: thread.id },
          }, `Task raised from ${thread.title} by ${context.actor}`);
          await context.mutate.patch(thread.id, { fields: { ...thread.fields, taskId: task.id } }, { event: `Thread linked to task ${task.title}` });
          context.toast("Task created", "It is in Projects, assigned to you, with a link back to this thread.");
        } },
        { id: "add CC", label: "Add a CC", placement: "overflow", run: (context) => context.openOverlay("add cc") },
        { id: "attach", label: "Attach a document", placement: "overflow", run: (context) => context.openOverlay("attach") },
        { id: "block sender", label: "Block the sender", placement: "overflow", tone: "danger", run: (context) => blockSender(context) },
        { id: "contact", label: "Contact", placement: "overflow", run: (context) => context.openOverlay("contact inspector") },
        { id: "report phishing", label: "Report phishing", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("report phishing") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "add cc", kind: "modal", title: "Add a CC", width: 500, render: ({ close, ...context }) => <AddCc context={context} close={close} />, footer: submitFooter("cm-cc", "Add to CC") },
        { id: "attach", kind: "modal", title: "Attach a document", width: 520, render: ({ close, ...context }) => <AttachToThread context={context} close={close} />, footer: submitFooter("cm-attach", "Attach") },
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
        { id: "find time", label: "Find a time", placement: "secondary", run: (context) => context.openOverlay("find time") },
        { id: "invite", label: "Invite someone", placement: "overflow", run: (context) => context.openOverlay("invite") },
        { id: "move", label: "Move a meeting", placement: "overflow", run: (context) => context.openOverlay("reschedule meeting", { mode: "move" }) },
        { id: "reschedule", label: "Reschedule a meeting", placement: "overflow", run: (context) => context.openOverlay("reschedule meeting", { mode: "reschedule" }) },
        { id: "check clashes", label: "Check for clashes", placement: "overflow", run: (context) => context.openOverlay("conflict inspector") },
        { id: "attendee status", label: "Attendee status", placement: "overflow", run: (context) => context.openOverlay("attendee status") },
      ],
      overlays: [
        { id: "find time", kind: "drawer", title: "Find a time", width: 540, render: ({ close, ...context }) => <FindTime context={context} close={close} /> },
        { id: "invite", kind: "modal", title: "Invite someone", width: 520, render: ({ close, ...context }) => <InviteToMeeting context={context} close={close} />, footer: submitFooter("cm-invite", "Invite") },
        { id: "reschedule meeting", kind: "modal", title: "Move or reschedule a meeting", width: 540, render: ({ close, ...context }) => <RescheduleMeeting context={context} close={close} />, footer: submitFooter("cm-reschedule", "Save the new time") },
        { id: "Event editor", kind: "modal", title: "New event", width: 640, render: ({ close, ...context }) => <EventForm context={context} close={close} />, footer: submitFooter("cm-event", "Create event") },
        { id: "edit event", kind: "modal", title: "Edit event", width: 640, render: ({ close, ...context }) => <EventForm context={context} close={close} formId="cm-event-edit" />, footer: submitFooter("cm-event-edit", "Save changes") },
        { id: "conflict inspector", kind: "drawer", title: "Clashes", width: 520, render: ({ ...context }) => <ClashInspector context={context} /> },
        { id: "attendee status", kind: "drawer", title: "Attendee status", width: 480, render: ({ ...context }) => <AttendeeStatus context={context} /> },
      ],
    },

    "ARL-COMMS-008": {
      id: "ARL-COMMS-008",
      title: () => "Meeting",
      subtitle: () => "The record of a meeting: time, people, agenda, notes and actions.",
      tabs: (["Call", "Chat", "Notes", "Participants"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <MeetingWorkspace context={context} lens={lens} />,
      })),
      actions: [
        { id: "record consent", label: "Recording and consent", placement: "primary", run: (context) => context.openOverlay("recording consent") },
        { id: "edit details", label: "Edit details", placement: "overflow", run: (context) => context.openOverlay("edit event", { id: context.params.id }) },
        { id: "end", label: "End the meeting", placement: "secondary", run: (context) => endMeeting(context) },
        { id: "Mute", label: "Mute or unmute", placement: "overflow", run: (context) => toggleMute(context) },
        { id: "share", label: "Share — invite someone", placement: "overflow", run: (context) => context.openOverlay("invite") },
        { id: "raise hand", label: "Raise or lower a hand", placement: "overflow", run: (context) => toggleHand(context) },
        { id: "device permissions", label: "Device permissions", placement: "overflow", run: (context) => context.openOverlay("Device permissions") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Device permissions", kind: "modal", title: "Device permissions", width: 520, render: () => <DevicePermissions /> },
        { id: "invite", kind: "modal", title: "Invite someone to this meeting", width: 520, render: ({ close, ...context }) => <InviteToMeeting context={context} close={close} />, footer: submitFooter("cm-invite", "Invite") },
        { id: "recording consent", kind: "modal", title: "Recording and consent", width: 580, render: ({ close, ...context }) => <RecordingConsent context={context} close={close} /> },
        { id: "edit event", kind: "modal", title: "Edit event", width: 640, render: ({ close, ...context }) => <EventForm context={context} close={close} formId="cm-event-edit" />, footer: submitFooter("cm-event-edit", "Save changes") },
      ],
    },

    "ARL-COMMS-009": {
      id: "ARL-COMMS-009",
      subtitle: () => "Notes about calls that happened on a real phone.",
      tabs: (["Recent", "Missed", "Voicemail", "Queues"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <CallsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "attach CRM", label: "Attach to a contact", placement: "primary", guard: needsSelection("a call"), run: (context) => context.openOverlay("attach to contact") },
        { id: "Call", label: "Call", placement: "secondary", run: (context) => context.openOverlay("Dialer") },
        { id: "return call", label: "Return a call", placement: "overflow", run: (context) => returnCall(context) },
        { id: "play voicemail", label: "Play voicemail", placement: "overflow", guard: needsSelection("a voicemail on the Voicemail tab"), run: (context) => context.openOverlay("voicemail") },
        { id: "transcript", label: "Open the call record", placement: "overflow", guard: needsSelection("a call"), run: (context) => context.openOverlay("call transcript") },
        { id: "recording rules", label: "Recording rules", placement: "overflow", run: (context) => context.openOverlay("recording notice") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "attach to contact", kind: "modal", title: "Attach the call to a contact", width: 520, render: ({ close, ...context }) => <AttachCrm context={context} close={close} />, footer: submitFooter("cm-crm", "Attach") },
        { id: "voicemail", kind: "modal", title: "Voicemail", width: 520, render: ({ close, ...context }) => <Voicemail context={context} close={close} /> },
        { id: "Dialer", kind: "modal", title: "Dialer", tone: "danger", width: 520, render: ({ close, ...context }) => <Dialer context={context} close={close} /> },
        { id: "recording notice", kind: "modal", title: "Call recording", width: 520, render: () => <RecordingNotice /> },
        { id: "call transcript", kind: "drawer", title: "Call", width: 480, render: ({ ...context }) => <CallTranscript context={context} /> },
      ],
    },

    "ARL-COMMS-010": {
      id: "ARL-COMMS-010",
      subtitle: () => "Posts appear on the announcement board in Arlovi. Nothing is emailed: no mail service is connected.",
      tabs: (["All", "Draft", "Scheduled", "Published"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Announcements context={context} lens={lens} />,
      })),
      actions: [
        { id: "Draft", label: "Draft an announcement", placement: "primary", run: (context) => context.openOverlay("draft announcement") },
        { id: "publish", label: "Publish", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose an announcement first"), run: (context) => context.openOverlay("publish review") },
        { id: "target audience", label: "Audience", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose an announcement first"), run: (context) => context.openOverlay("Audience selector") },
        { id: "preview", label: "Preview", placement: "overflow", guard: needsSelection("an announcement"), run: (context) => context.openOverlay("post preview") },
      ],
      overlays: [
        { id: "draft announcement", kind: "modal", title: "Draft an announcement", width: 600, render: ({ close, ...context }) => <DraftAnnouncement context={context} close={close} />, footer: submitFooter("cm-draft", "Save the draft") },
        { id: "Audience selector", kind: "modal", title: "Audience", width: 520, render: ({ close, ...context }) => <AudienceSelector context={context} close={close} />, footer: submitFooter("cm-audience", "Save audience") },
        { id: "post preview", kind: "modal", title: "Preview", width: 620, render: ({ ...context }) => <PostPreview context={context} /> },
        { id: "publish review", kind: "modal", title: "Publish this announcement", width: OVERLAY_WIDTH.form, summary: (context) => <PublishReviewSummary context={context} />, render: ({ close, ...context }) => <PublishReview context={context} close={close} /> },
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
        { id: "set schedule", label: "Set working hours", placement: "overflow", run: (context) => context.openOverlay("working hours") },
      ],
      overlays: [
        { id: "working hours", kind: "modal", title: "Set your working hours", width: 520, render: ({ close, ...context }) => <WorkingHours context={context} close={close} />, footer: submitFooter("cm-hours", "Save the schedule") },
        { id: "Signature editor", kind: "modal", title: "Signature", width: 560, render: ({ close, ...context }) => <SignatureEditor context={context} close={close} />, footer: submitFooter("cm-signature", "Save signature") },
        { id: "account setup", kind: "modal", title: "Connect a mailbox", width: 560, render: ({ close, ...context }) => <AccountSetup context={context} close={close} /> },
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
