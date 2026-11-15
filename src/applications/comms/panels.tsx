import { useMemo, useState } from "react";
import {
  AtSign, CalendarDays, Hash, Mail, Megaphone, MessageSquare, Phone, ShieldAlert, Users, Video,
} from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Select,
  Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById } from "@/platform/capability";
import { sameDay } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { ChannelList, Conversation } from "./chat";
import { CalendarSurface, type CalendarView } from "./calendar";

export function useCommsData() {
  return useCollections(["channels", "messages", "emailThreads", "meetings", "calls", "announcements", "preferences", "members", "employees", "contacts", "documents"]);
}

export function MailBoundary({ what = "Sending" }: { what?: string }) {
  const capability = capabilityById("email.send");
  return (
    <Notice tone="warning" title={`${what} stops at the mail provider`}>
      {capability?.note} {capability?.localEquivalent}
    </Notice>
  );
}

function channelMessages(messages: Rec[], channelId: string): Rec[] {
  return messages.filter((message) => message.parentId === channelId && message.fields.kind !== "ticket");
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-001 · Communications Home
 * ------------------------------------------------------------------ */

export function CommsHome({ context, lens }: { context: ScreenContext; lens: "Overview" | "Channels" | "DMs" | "Calls" | "Calendar" }) {
  const data = useCommsData();
  const { org, now, actor } = useWorkspace();
  const channels = data.channels.filter((channel) => channel.status !== "archived");
  const mentions = data.messages.filter((message) => String(message.fields.mentions ?? "").includes(actor));
  const today = data.meetings.filter((meeting) => meeting.startAt && sameDay(new Date(meeting.startAt), now));
  const unread = channels.reduce((sum, channel) => sum + Number(channel.fields.unread ?? 0), 0);

  if (lens === "Channels") {
    return <ChannelsDirectory context={context} lens="All" />;
  }

  if (lens === "DMs") {
    const groups = data.channels.filter((channel) => channel.fields.kind === "group");
    return groups.length === 0 ? <Empty title="No direct messages" icon={<MessageSquare size={20} />} /> : (
      <Stack gap={3}>
        {groups.map((group) => {
          const messages = channelMessages(data.messages, group.id);
          const latest = [...messages].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
          return (
            <Card
              key={group.id}
              title={<Row gap={2}>{String(group.fields.members ?? "").split(",").slice(0, 3).map((name) => <Avatar key={name} name={name.trim()} size="sm" />)}<span>{group.title}</span></Row>}
              subtitle={latest ? `${String(latest.fields.author ?? "")} · ${context.relative(latest.at)}` : "No messages yet"}
              actions={Number(group.fields.unread ?? 0) > 0 ? <Pill tone="accent">{String(group.fields.unread)} unread</Pill> : undefined}
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/comms/channels/${group.id}`)}>Open</Button>}
            >
              <p className="ds-subtle">{latest?.summary ?? "Start the conversation."}</p>
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (lens === "Calls") {
    return <CallsScreen context={context} lens="Recent" />;
  }

  if (lens === "Calendar") {
    return (
      <CalendarSurface
        context={context}
        meetings={data.meetings}
        view="Day"
        onPick={(meeting) => context.navigate(`/o/${org.slug}/comms/meetings/${meeting.id}`)}
        onCreateAt={() => context.navigate(`/o/${org.slug}/comms/calendar`)}
      />
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Unread" value={String(unread)} meta={`across ${channels.length} channels`} onClick={() => context.setTab("Channels")} />
        <Stat label="Mentions" value={String(mentions.length)} meta={mentions.length ? `latest ${context.relative(mentions.at(-1)?.at)}` : "Nobody has mentioned you"} />
        <Stat label="Meetings today" value={String(today.length)} meta={today[0] ? `next ${context.dateTime(today[0].startAt)}` : "Nothing in the diary"} onClick={() => context.setTab("Calendar")} />
        <Stat label="Mail delivery" value="Not connected" unavailable meta="Drafts are kept locally" />
      </StatRow>

      <Grid>
        <Card span={7} title="Unread channels" subtitle={`${channels.filter((channel) => Number(channel.fields.unread ?? 0) > 0).length} with something new`}>
          {channels.filter((channel) => Number(channel.fields.unread ?? 0) > 0).length === 0 ? (
            <Empty title="Everything is read" icon={<Hash size={20} />} />
          ) : (
            <Stack gap={2}>
              {channels.filter((channel) => Number(channel.fields.unread ?? 0) > 0).map((channel) => (
                <Row key={channel.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Hash size={14} aria-hidden="true" />
                  <div className="ds-grow">
                    <strong>{channel.title}</strong>
                    <p className="ds-subtle">{channel.summary}</p>
                  </div>
                  <Pill tone="accent">{String(channel.fields.unread)}</Pill>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/comms/channels/${channel.id}`)}>Open</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={5} title="Mentions" subtitle="Where somebody named you">
          {mentions.length === 0 ? <Empty title="No mentions" icon={<AtSign size={20} />} /> : (
            <Stack gap={2}>
              {mentions.map((message) => (
                <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2}><Avatar name={String(message.fields.author ?? "")} size="sm" /><strong className="ds-grow">{String(message.fields.author ?? "")}</strong><span className="ds-subtle">{context.relative(message.at)}</span></Row>
                  <p className="ds-subtle">{message.summary}</p>
                </div>
              ))}
            </Stack>
          )}
          <Notice tone="info">A mention notifies somebody. It gives them no access to a file or a tool they did not already have.</Notice>
        </Card>

        <Card span={7} title="Today" subtitle={context.date(now, { weekday: "long", day: "numeric", month: "long" })}>
          {today.length === 0 ? <Empty title="Nothing in the diary today" icon={<CalendarDays size={20} />} /> : (
            <Stack gap={2}>
              {today.map((meeting) => (
                <Row key={meeting.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <strong className="ds-num" style={{ width: 56 }}>{context.date(meeting.startAt, { hour: "2-digit", minute: "2-digit" }).split(", ").pop()}</strong>
                  <div className="ds-grow">
                    <strong>{meeting.title}</strong>
                    <p className="ds-subtle">{String(meeting.fields.where ?? "")}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/comms/meetings/${meeting.id}`)}>Open</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={5} title="Announcements" subtitle={`${data.announcements.filter((post) => post.status === "published").length} published`}>
          <Stack gap={2}>
            {data.announcements.filter((post) => post.status === "published").slice(0, 3).map((post) => (
              <div key={post.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}><Megaphone size={14} aria-hidden="true" /><strong className="ds-grow">{post.title}</strong><span className="ds-subtle">{context.relative(post.at)}</span></Row>
                <p className="ds-subtle">{post.summary}</p>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-002 · Channels
 * ------------------------------------------------------------------ */

export function ChannelsDirectory({ context, lens }: { context: ScreenContext; lens: "All" | "My channels" | "Departments" | "Archived" }) {
  const data = useCommsData();
  const { org, actor } = useWorkspace();
  const rows = lens === "Archived"
    ? data.channels.filter((channel) => channel.status === "archived")
    : lens === "My channels"
      ? data.channels.filter((channel) => String(channel.fields.members ?? "").includes(actor) || channel.fields.members === "Everyone")
      : lens === "Departments"
        ? data.channels.filter((channel) => ["workshop", "commercial", "design-review", "finance-private"].includes(channel.title))
        : data.channels.filter((channel) => channel.status !== "archived" && channel.fields.kind === "channel");

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()}`} icon={<Hash size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Channel creation")}>Create a channel</Button>} />
  ) : (
    <Grid>
      {rows.map((channel) => {
        const messages = channelMessages(data.messages, channel.id);
        return (
          <Card
            key={channel.id}
            span={4}
            title={<Row gap={2}><Hash size={16} aria-hidden="true" />{channel.title}</Row>}
            subtitle={channel.summary}
            actions={channel.fields.visibility === "private" ? <Pill tone="warning" dot>Private</Pill> : <Pill tone="neutral">Public</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/comms/channels/${channel.id}`)}>Open</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(channel.id); context.openOverlay("member management", { id: channel.id }); }}>Members</Button>
              <span className="ds-grow" />
              {Number(channel.fields.unread ?? 0) > 0 && <Pill tone="accent">{String(channel.fields.unread)} unread</Pill>}
            </>}
          >
            <Properties rows={[
              { label: "Members", value: String(channel.fields.memberCount ?? 0) },
              { label: "Messages", value: String(messages.length) },
              { label: "Muted", value: channel.fields.muted === true ? "Yes" : "No" },
            ]} />
          </Card>
        );
      })}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-003 · Channel Conversation
 * ------------------------------------------------------------------ */

export function ChannelConversation({ context, lens }: { context: ScreenContext; lens: "Conversation" | "Files" | "Pinned" | "Tasks" }) {
  const data = useCommsData();
  const record = useRecord(context.params.id);
  const raised = useCollections(["tasks"]).tasks;
  const { org } = useWorkspace();
  const channel = record ?? data.channels[0];
  if (!channel) return <Empty title="No channel" icon={<Hash size={20} />} />;
  const messages = channelMessages(data.messages, channel.id);

  if (lens === "Files") {
    const referenced = messages.filter((message) => Boolean(message.fields.fileRef));
    return referenced.length === 0 ? <Empty title="No files referenced here" icon={<Hash size={20} />}>A message can point at a document already in this workspace.</Empty> : (
      <DataGrid
        rows={referenced}
        rowId={(row) => row.id}
        label="Files referenced in this channel"
        filterable={false}
        columns={[
          { key: "file", header: "Document", primary: true, cell: (row) => data.documents.find((document) => document.id === row.fields.fileRef)?.title ?? String(row.fields.fileRef) },
          { key: "by", header: "Shared by", cell: (row) => String(row.fields.author ?? "") },
          { key: "when", header: "When", align: "end", cell: (row) => context.dateTime(row.at) },
        ]}
      />
    );
  }

  if (lens === "Pinned") {
    const pinned = messages.filter((message) => message.fields.pinned === true);
    return pinned.length === 0 ? <Empty title="Nothing is pinned" icon={<Hash size={20} />}>Pin a decision so it is easy to find later.</Empty> : (
      <Stack gap={3}>
        {pinned.map((message) => (
          <Card key={message.id} title={String(message.fields.author ?? "")} subtitle={context.dateTime(message.at)} actions={<Pill tone="info">Pinned</Pill>}
            footer={<Button size="sm" variant="ghost" onClick={async () => {
              await context.mutate.patch(message.id, { status: "sent", fields: { ...message.fields, pinned: false } }, { event: `${message.title} unpinned by ${context.actor}` });
            }}>Unpin</Button>}>
            <p>{message.summary}</p>
          </Card>
        ))}
      </Stack>
    );
  }

  if (lens === "Tasks") {
    const tasks = raised.filter((task) => String(task.fields.fromChannelId ?? "") === channel.id);
    return tasks.length === 0 ? (
      <Empty title="No tasks came from this channel" icon={<MessageSquare size={20} />}>
        Use “Make a task” on a message to turn a decision into work, with a link back to what was said.
      </Empty>
    ) : (
      <DataGrid
        rows={tasks}
        rowId={(row) => row.id}
        label="Tasks created from this channel"
        filterable={false}
        columns={[
          { key: "title", header: "Task", primary: true, cell: (row) => row.title },
          { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
          { key: "stage", header: "Stage", align: "end", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)}
      />
    );
  }

  return (
    <div className="cm-chat">
      <aside>
        <ChannelList
          channels={data.channels.filter((item) => item.status !== "archived")}
          activeId={channel.id}
          unreadOf={(item) => Number(item.fields.unread ?? 0)}
          onPick={(id) => context.navigate(`/o/${org.slug}/comms/channels/${id}`)}
        />
      </aside>
      <div>
        <Conversation
          context={context}
          channel={channel}
          messages={messages}
          onCreateTask={async (message) => {
            await context.mutate.create({
              collection: "tasks",
              title: message.title,
              status: "ready",
              summary: `${message.summary} — raised from #${channel.title} by ${context.actor}.`,
              fields: { stage: "ready", assignee: context.actor, priority: "normal", estimateHours: 2, loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false, fromChannelId: channel.id },
            }, `Task raised from a message in ${channel.title}`);
            context.toast("Task created", "It is in Projects with a note of where it came from.");
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-004 · Direct Messages
 * ------------------------------------------------------------------ */

export function DirectMessages({ context, lens }: { context: ScreenContext; lens: "Recent" | "Unread" | "Groups" | "Archived" }) {
  const data = useCommsData();
  const { actor } = useWorkspace();
  const [activeId, setActiveId] = useState<string>("");
  const conversations = data.channels.filter((channel) => channel.fields.kind === "group");
  const rows = lens === "Unread"
    ? conversations.filter((channel) => Number(channel.fields.unread ?? 0) > 0)
    : lens === "Groups"
      ? conversations.filter((channel) => Number(channel.fields.memberCount ?? 0) > 2)
      : lens === "Archived"
        ? conversations.filter((channel) => channel.status === "archived")
        : conversations.filter((channel) => channel.status !== "archived");
  const active = rows.find((channel) => channel.id === activeId) ?? rows[0];

  if (rows.length === 0) {
    return <Empty title={`No ${lens.toLowerCase()} conversations`} icon={<MessageSquare size={20} />}>Direct messages are kept in this browser like everything else.</Empty>;
  }

  return (
    <div className="cm-chat">
      <aside>
        <ChannelList
          channels={rows}
          activeId={active?.id}
          unreadOf={(channel) => Number(channel.fields.unread ?? 0)}
          onPick={setActiveId}
        />
        <Notice tone="info" title="Who you are talking to">
          A message from an AI employee carries its own badge beside the name, so a draft is never mistaken for a colleague's words.
        </Notice>
      </aside>
      <div>
        {active ? (
          <Conversation context={context} channel={active} messages={channelMessages(data.messages, active.id)} />
        ) : <Empty title="Choose a conversation" />}
        <p className="ds-sr-only">Signed in as {actor}.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-005 / 006 · Email
 * ------------------------------------------------------------------ */

export interface MailMessage { from: string; at: string; body: string; external: boolean }

export function messagesOf(thread: Rec): MailMessage[] {
  return (thread.body as { messages?: MailMessage[] } | undefined)?.messages ?? [];
}

const FOLDERS = ["Inbox", "Sent", "Drafts", "Archive", "Spam"] as const;

export function EmailInbox({ context, lens }: { context: ScreenContext; lens: (typeof FOLDERS)[number] }) {
  const data = useCommsData();
  const { org } = useWorkspace();
  const folder = lens.toLowerCase();
  const rows = data.emailThreads.filter((thread) => String(thread.fields.folder ?? "inbox") === folder);

  return (
    <div className="cm-mail">
      <aside className="cm-mail-folders">
        {FOLDERS.map((name) => {
          const count = data.emailThreads.filter((thread) => String(thread.fields.folder ?? "inbox") === name.toLowerCase()).length;
          return (
            <button
              key={name}
              type="button"
              className="cm-channel"
              aria-current={name === lens ? "true" : undefined}
              onClick={() => context.setTab(name)}
            >
              <Mail size={14} aria-hidden="true" />
              <span className="ds-grow">{name}</span>
              <span className="ds-subtle ds-num">{count}</span>
            </button>
          );
        })}
        <MailBoundary />
      </aside>
      <div>
        {rows.length === 0 ? <Empty title={`${lens} is empty`} icon={<Mail size={20} />} /> : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label={`${lens} mail`}
            selectedId={context.selectedId}
            rowTone={(row) => (row.fields.risk === "phishing" ? "danger" : undefined)}
            columns={[
              { key: "from", header: folder === "sent" || folder === "drafts" ? "To" : "From", cell: (row) => (
                <Row gap={2}>
                  <Avatar name={String(folder === "sent" || folder === "drafts" ? row.fields.to : row.fields.from)} size="sm" />
                  <span className="ds-truncate">{String(folder === "sent" || folder === "drafts" ? row.fields.to : row.fields.from)}</span>
                </Row>
              ), sortValue: (row) => String(row.fields.from ?? ""), filterValue: (row) => `${String(row.fields.from ?? "")} ${String(row.fields.to ?? "")}` },
              { key: "subject", header: "Subject", primary: true, cell: (row) => (
                <Row gap={2}>
                  {row.fields.unread === true && <Pill tone="accent">New</Pill>}
                  <span className="ds-truncate">{row.title}</span>
                  {row.fields.risk === "phishing" && <Pill tone="danger" dot>Suspected phishing</Pill>}
                </Row>
              ), sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "labels", header: "Labels", cell: (row) => <Row gap={1} wrap>{String(row.fields.labels ?? "").split(",").filter(Boolean).map((label) => <Pill key={label}>{label}</Pill>)}</Row>, hideBelow: 1100 },
              { key: "when", header: "When", align: "end", cell: (row) => context.date(row.at), sortValue: (row) => row.at ?? "" },
            ]}
            onSelect={(id) => context.select(id)}
            onOpen={(id) => context.navigate(`/o/${org.slug}/comms/email/${id}`)}
            bulkActions={[
              { label: "Archive", onRun: (selected) => selected.forEach((thread) => { void context.mutate.patch(thread.id, { status: "archive", fields: { ...thread.fields, folder: "archive" } }, { event: `${thread.title} archived` }); }) },
              { label: "Mark read", onRun: (selected) => selected.forEach((thread) => { void context.mutate.patch(thread.id, { fields: { ...thread.fields, unread: false } }, { event: `${thread.title} marked read` }); }) },
            ]}
          />
        )}
      </div>
    </div>
  );
}

export function EmailThread({ context, lens }: { context: ScreenContext; lens: "Messages" | "Related records" | "Activity" }) {
  const data = useCommsData();
  const record = useRecord(context.params.id);
  const thread = record ?? data.emailThreads[0];
  const { org } = useWorkspace();
  if (!thread) return <Empty title="No thread" icon={<Mail size={20} />} />;
  const messages = messagesOf(thread);

  if (lens === "Related records") {
    const contact = data.contacts.find((row) => String(row.fields.email ?? "") === String(thread.fields.from ?? "") || String(row.fields.email ?? "") === String(thread.fields.to ?? ""));
    return (
      <Grid>
        <Card span={6} title="Contact" subtitle={contact ? String(contact.fields.company ?? "") : "No matching contact"}>
          {contact ? (
            <Properties rows={[
              { label: "Name", value: contact.title },
              { label: "Email", value: String(contact.fields.email ?? "") },
              { label: "Consent", value: String(contact.fields.consent ?? "Not recorded") },
            ]} />
          ) : <span className="ds-subtle">No contact in this workspace matches the address on this thread.</span>}
        </Card>
        <Card span={6} title="Labels and links">
          <Row gap={2} wrap>
            {String(thread.fields.labels ?? "").split(",").filter(Boolean).map((label) => <Pill key={label}>{label}</Pill>)}
          </Row>
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.navigate(`/o/${org.slug}/care/tickets`)}>Open customer care</Button>
        </Card>
      </Grid>
    );
  }

  if (lens === "Activity") {
    return (
      <Properties rows={[
        { label: "Received", value: context.dateTime(thread.at) },
        { label: "Folder", value: String(thread.fields.folder ?? "") },
        { label: "Messages", value: String(messages.length) },
        { label: "Delivery", value: <Pill tone="warning">Not connected</Pill> },
        { label: "Risk", value: thread.fields.risk === "phishing" ? <Pill tone="danger">Suspected phishing</Pill> : <Pill tone="neutral">Nothing flagged</Pill> },
        { label: "Last change", value: `${context.dateTime(thread.updatedAt)} by ${thread.updatedBy}` },
      ]} />
    );
  }

  return (
    <Stack gap={4}>
      {thread.fields.risk === "phishing" && (
        <Notice tone="danger" title="This message is treated as untrusted">
          The sender domain does not match a supplier on record. Any instruction inside it, including a change of bank details,
          is data to be checked by a person. Nothing in this workspace acts on the contents of an email.
        </Notice>
      )}
      <Stack gap={3}>
        {messages.map((message, index) => (
          <Card
            key={index}
            title={<Row gap={2}><Avatar name={message.from} size="sm" />{message.from}</Row>}
            subtitle={context.dateTime(message.at)}
            actions={message.external ? <Pill tone="warning" dot>External</Pill> : <Pill tone="neutral">From this workspace</Pill>}
          >
            <p className="ds-prose">{message.body}</p>
            {message.external && (
              <p className="ds-subtle" style={{ marginBlockStart: "var(--space-2)" }}>
                Text from outside this workspace is quoted, never followed. It cannot change what an agent is allowed to do.
              </p>
            )}
          </Card>
        ))}
        {messages.length === 0 && <Empty title="No messages in this thread" icon={<Mail size={20} />} />}
      </Stack>
      <MailBoundary what="Replying" />
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-007 · Calendar
 * ------------------------------------------------------------------ */

export function Calendar({ context, lens }: { context: ScreenContext; lens: "Day" | "Week" | "Month" | "Agenda" | "Team" }) {
  const data = useCommsData();
  const { org, actor } = useWorkspace();
  const meetings = lens === "Team"
    ? data.meetings
    : data.meetings.filter((meeting) => String(meeting.fields.attendees ?? "").includes(actor) || String(meeting.fields.attendees ?? "") === "Everyone" || meeting.ownerName === actor);

  if (lens === "Team") {
    const people = [...new Set(data.meetings.flatMap((meeting) => String(meeting.fields.attendees ?? "").split(",").map((name) => name.trim())))].filter((name) => name && name !== "Everyone");
    return (
      <Stack gap={4}>
        <Grid>
          {people.slice(0, 9).map((person) => {
            const theirs = data.meetings.filter((meeting) => String(meeting.fields.attendees ?? "").includes(person) && meeting.startAt && new Date(meeting.startAt) >= context.now);
            return (
              <Card key={person} span={4} title={<Row gap={2}><Avatar name={person} size="sm" />{person}</Row>} subtitle={`${theirs.length} upcoming`}>
                <Stack gap={2}>
                  {theirs.slice(0, 3).map((meeting) => (
                    <Row key={meeting.id} gap={2}>
                      <span className="ds-grow ds-truncate">{meeting.title}</span>
                      <span className="ds-subtle">{context.date(meeting.startAt, { day: "numeric", month: "short" })}</span>
                    </Row>
                  ))}
                  {theirs.length === 0 && <span className="ds-subtle">Nothing booked.</span>}
                </Stack>
              </Card>
            );
          })}
        </Grid>
        <Notice tone="info" title="Availability is what this workspace knows">
          A free slot here means nothing is recorded here. It does not mean the person is free, because no external calendar is attached.
        </Notice>
      </Stack>
    );
  }

  return (
    <CalendarSurface
      context={context}
      meetings={meetings}
      view={lens as CalendarView}
      onPick={(meeting) => context.navigate(`/o/${org.slug}/comms/meetings/${meeting.id}`)}
      onCreateAt={(day) => context.openOverlay("Event editor", { date: day.toISOString().slice(0, 10) })}
    />
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-008 · Meeting Room
 * ------------------------------------------------------------------ */

interface MeetingAction { label: string; owner: string; done: boolean }

export function MeetingRoom({ context, lens }: { context: ScreenContext; lens: "Call" | "Chat" | "Notes" | "Participants" }) {
  const data = useCommsData();
  const record = useRecord(context.params.id);
  const meeting = record ?? data.meetings[0];
  const [notes, setNotes] = useState("");
  if (!meeting) return <Empty title="No meeting" icon={<CalendarDays size={20} />} />;
  const attendees = String(meeting.fields.attendees ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const body = meeting.body as { notes?: string; actions?: MeetingAction[] } | undefined;

  if (lens === "Chat") {
    return (
      <Stack gap={4}>
        <Empty title="No meeting chat was recorded" icon={<MessageSquare size={20} />}>
          Chat during a call would be kept with the meeting record. Nothing was captured for this one.
        </Empty>
        <Notice tone="info">Discussion that matters belongs in a channel, where it can be found again.</Notice>
      </Stack>
    );
  }

  if (lens === "Notes") {
    return (
      <Stack gap={4}>
        <Card title="Notes" subtitle={body?.notes ? "Recorded in this workspace" : "Nothing recorded yet"}>
          <form
            className="ds-stack ds-gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await context.mutate.patch(meeting.id, {
                body: { ...(meeting.body as object ?? {}), notes: notes || body?.notes },
              }, { expectRevision: meeting.revision, event: `Notes saved on ${meeting.title}` });
              context.toast("Notes saved", "They are on the meeting record.");
              setNotes("");
            }}
          >
            <Field label="What was decided"><TextArea rows={5} value={notes || body?.notes || ""} onChange={(event) => setNotes(event.target.value)} /></Field>
            <Row gap={2}><Button type="submit" variant="primary">Save notes</Button></Row>
          </form>
        </Card>
        <Card title="Actions" subtitle={`${(body?.actions ?? []).length} recorded`}>
          <Stack gap={2}>
            {(body?.actions ?? []).map((action, index) => (
              <Checkbox
                key={action.label}
                label={`${action.label} — ${action.owner}`}
                checked={action.done}
                onChange={async (event) => {
                  const next = (body?.actions ?? []).map((item, position) => (position === index ? { ...item, done: event.target.checked } : item));
                  await context.mutate.patch(meeting.id, { body: { ...(meeting.body as object ?? {}), actions: next } }, { event: `Meeting action updated on ${meeting.title}` });
                }}
              />
            ))}
            {(body?.actions ?? []).length === 0 && <span className="ds-subtle">No actions were recorded.</span>}
          </Stack>
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("recording consent")}>Record an action</Button>
        </Card>
      </Stack>
    );
  }

  if (lens === "Participants") {
    return (
      <Stack gap={4}>
        <DataGrid
          rows={attendees.map((name) => ({ id: name, name }))}
          rowId={(row) => row.id}
          label="Participants"
          filterable={false}
          columns={[
            { key: "name", header: "Person", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.name} size="sm" />{row.name}</Row> },
            { key: "status", header: "Invite status", align: "end", cell: () => <Pill tone="neutral" dot>Invited</Pill> },
          ]}
        />
        <Notice tone="warning" title="Nobody is shown as accepted">
          No calendar provider is connected, so an acceptance made elsewhere is not known here. Everyone stays invited until
          somebody records an answer in this workspace.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={8} title={meeting.title} subtitle={`${context.dateTime(meeting.startAt)} · ${String(meeting.fields.minutes ?? 0)} minutes · ${String(meeting.fields.where ?? "")}`}>
        <Stack gap={4}>
          <div className="ds-panel" style={{ padding: "var(--space-6)", textAlign: "center" }}>
            <Video size={28} aria-hidden="true" />
            <h3 style={{ marginBlock: "var(--space-2)" }}>No conferencing service is connected</h3>
            <p className="ds-prose" style={{ margin: "0 auto" }}>
              This workspace cannot open a microphone, a camera or a call. The meeting record holds its time, place, attendees,
              agenda, notes and actions, which is what the rest of the workspace reads.
            </p>
          </div>
          <Row gap={2} wrap>
            <Button variant="secondary" disabled title="No conferencing service is connected">Mute</Button>
            <Button variant="secondary" disabled title="No conferencing service is connected">Share a screen</Button>
            <Button variant="secondary" disabled title="No conferencing service is connected">Raise a hand</Button>
            <Button variant="secondary" onClick={() => context.openOverlay("recording consent")}>Record consent</Button>
            <Button variant="outline-danger" onClick={async () => {
              await context.mutate.patch(meeting.id, { status: "finished" }, { expectRevision: meeting.revision, event: `${meeting.title} marked finished by ${context.actor}` });
              context.toast("Meeting closed", "The record is marked finished.");
            }}>End the meeting</Button>
          </Row>
        </Stack>
      </Card>
      <Card span={4} title="Agenda">
        <p>{String(meeting.fields.agenda ?? "No agenda recorded.")}</p>
        <Properties rows={[
          { label: "Organiser", value: String(meeting.fields.organizer ?? "") },
          { label: "Attendees", value: String(attendees.length) },
          { label: "Recording", value: <Pill tone="warning">Not possible here</Pill> },
        ]} />
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-009 · Calls & Voicemail
 * ------------------------------------------------------------------ */

export function CallsScreen({ context, lens }: { context: ScreenContext; lens: "Recent" | "Missed" | "Voicemail" | "Queues" }) {
  const data = useCommsData();
  const rows = lens === "Missed"
    ? data.calls.filter((call) => call.status === "missed")
    : lens === "Voicemail"
      ? data.calls.filter((call) => call.fields.voicemail === true)
      : data.calls;

  if (lens === "Queues") {
    const queues = [...new Set(data.calls.map((call) => String(call.fields.queue ?? "Direct")))];
    return (
      <Stack gap={4}>
        <Grid>
          {queues.map((queue) => (
            <Card key={queue} span={4} title={queue} subtitle={`${data.calls.filter((call) => String(call.fields.queue ?? "Direct") === queue).length} calls recorded`}>
              <Properties rows={[
                { label: "Missed", value: String(data.calls.filter((call) => String(call.fields.queue ?? "Direct") === queue && call.status === "missed").length) },
                { label: "Routing", value: "Recorded against the call, not handled by a service" },
              ]} />
            </Card>
          ))}
        </Grid>
        <Notice tone="danger" title="This workspace cannot place a call">
          There is no telephony service and no emergency calling. A call record here is a note somebody wrote about a conversation
          that happened on a real phone.
        </Notice>
      </Stack>
    );
  }

  return rows.length === 0 ? <Empty title={`No ${lens.toLowerCase()} calls`} icon={<Phone size={20} />} /> : (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${lens} calls`}
        selectedId={context.selectedId}
        columns={[
          { key: "title", header: "Call", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "direction", header: "Direction", cell: (row) => <Pill tone={String(row.fields.direction) === "inbound" ? "info" : "neutral"}>{String(row.fields.direction ?? "")}</Pill> },
          { key: "length", header: "Length", align: "end", cell: (row) => (Number(row.fields.seconds ?? 0) === 0 ? "—" : `${Math.round(Number(row.fields.seconds ?? 0) / 60)} min`) },
          { key: "outcome", header: "Outcome", cell: (row) => String(row.fields.outcome ?? ""), hideBelow: 900 },
          { key: "when", header: "When", align: "end", cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at ?? "" },
        ]}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => { context.select(id); context.openOverlay("call transcript", { id }); }}
      />
      <Notice tone="warning" title="No telephony service is connected">
        Nothing here dials. A voicemail is a note somebody typed, and there is no emergency calling from this workspace.
      </Notice>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-010 · Announcements
 * ------------------------------------------------------------------ */

export function Announcements({ context, lens }: { context: ScreenContext; lens: "All" | "Draft" | "Scheduled" | "Published" }) {
  const data = useCommsData();
  const rows = lens === "All" ? data.announcements : data.announcements.filter((post) => post.status === lens.toLowerCase());
  const staffCount = data.employees.filter((employee) => employee.status !== "alumni").length;

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} announcements`} icon={<Megaphone size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("post preview")}>Draft one</Button>} />
  ) : (
    <Stack gap={3}>
      {rows.map((post) => (
        <Card
          key={post.id}
          title={post.title}
          subtitle={`${String(post.fields.audience ?? "Everyone")} · ${post.status === "scheduled" ? `scheduled for ${context.date(post.at)}` : context.relative(post.at)}`}
          actions={<Pill tone={post.status === "published" ? "success" : post.status === "scheduled" ? "info" : "neutral"} dot>{post.status}</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { context.select(post.id); context.openOverlay("post preview", { id: post.id }); }}>Preview</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(post.id); context.openOverlay("Audience selector", { id: post.id }); }}>Audience</Button>
            {post.status !== "published" && (
              <>
                <span className="ds-grow" />
                <Button size="sm" variant="primary" onClick={() => { context.select(post.id); context.openOverlay("publish review", { id: post.id }); }}>Publish</Button>
              </>
            )}
          </>}
        >
          <Stack gap={2}>
            <p>{post.summary}</p>
            {post.fields.requiresAck === true && (
              <Row gap={2}>
                <Pill tone={Number(post.fields.acknowledgements ?? 0) >= staffCount ? "success" : "warning"}>
                  {String(post.fields.acknowledgements ?? 0)} of {staffCount} acknowledged
                </Pill>
              </Row>
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-COMMS-011 · Preferences
 * ------------------------------------------------------------------ */

export function Preferences({ context, lens }: { context: ScreenContext; lens: "Identity" | "Availability" | "Notifications" | "Privacy" }) {
  const data = useCommsData();
  const { actor, org } = useWorkspace();
  const record = data.preferences.find((row) => row.fields.kind === "commsIdentity");
  const mine = record && record.title.startsWith(actor.split(" ")[0]);

  if (lens === "Availability") {
    return (
      <Grid>
        <Card span={6} title="Working hours" subtitle={`All times in ${org.timezone}`}>
          <form
            className="ds-stack ds-gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (!record) return;
              await context.mutate.patch(record.id, {
                fields: { ...record.fields, workingStart: String(form.get("start") ?? ""), workingEnd: String(form.get("end") ?? ""), presence: String(form.get("presence") ?? "") },
              }, { expectRevision: record.revision, event: `Working hours changed by ${context.actor}` });
              context.toast("Saved", "Your hours are on the preference record.");
            }}
          >
            <Row gap={3}>
              <Field label="Start"><TextInput name="start" type="time" defaultValue={String(record?.fields.workingStart ?? "09:00")} /></Field>
              <Field label="End"><TextInput name="end" type="time" defaultValue={String(record?.fields.workingEnd ?? "17:30")} /></Field>
            </Row>
            <Field label="Presence note"><TextInput name="presence" defaultValue={String(record?.fields.presence ?? "")} /></Field>
            <Row gap={2}><Button type="submit" variant="primary" disabled={!record}>Save</Button></Row>
          </form>
        </Card>
        <Card span={6} title="Quiet hours">
          <Properties rows={[
            { label: "Quiet hours", value: String(record?.fields.quietHours ?? "Not set") },
            { label: "Time zone", value: org.timezone },
            { label: "What quiet hours do", value: "Hold notifications in this browser until the window ends" },
          ]} />
        </Card>
      </Grid>
    );
  }

  if (lens === "Notifications") {
    return (
      <Stack gap={4}>
        <Card title="What interrupts you">
          <Stack gap={3}>
            <Checkbox label="Every message in a channel I am in" />
            <Checkbox label="Mentions of my name" defaultChecked />
            <Checkbox label="Direct messages" defaultChecked />
            <Checkbox label="Announcements that need acknowledgement" defaultChecked />
            <Checkbox label="Meeting reminders fifteen minutes before" defaultChecked />
          </Stack>
        </Card>
        <Notice tone="info" title="Notifications stay in this browser">
          There is no push service and no mail provider, so a notification is a badge in this workspace. Nothing reaches a phone.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Privacy") {
    return (
      <Stack gap={4}>
        <Card title="What other people can see">
          <Stack gap={3}>
            <Checkbox label="Show my working hours in the directory" defaultChecked />
            <Checkbox label="Show my presence note" defaultChecked />
            <Checkbox label="Show my phone number to the workspace" />
            <Checkbox label="Let colleagues see my calendar detail rather than busy or free" />
          </Stack>
        </Card>
        <Notice tone="warning" title="These settings are yours only">
          A role view cannot change another person's privacy settings from this screen, and these preferences shape the interface
          rather than enforcing access. Everything here lives in one browser database.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title="Mail identity" subtitle={mine ? "Your identity in this workspace" : "The identity on record"}>
        {record ? (
          <form
            className="ds-stack ds-gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await context.mutate.patch(record.id, {
                fields: { ...record.fields, displayName: String(form.get("display") ?? ""), signature: String(form.get("signature") ?? "") },
              }, { expectRevision: record.revision, event: `Mail identity updated by ${context.actor}` });
              context.toast("Identity saved", "It is on the preference record in this browser.");
            }}
          >
            <Field label="Address"><TextInput defaultValue={String(record.fields.address ?? "")} readOnly /></Field>
            <Field label="Display name"><TextInput name="display" defaultValue={String(record.fields.displayName ?? "")} /></Field>
            <Field label="Signature"><TextArea name="signature" rows={4} defaultValue={String(record.fields.signature ?? "")} /></Field>
            <Row gap={2}><Button type="submit" variant="primary">Save identity</Button></Row>
          </form>
        ) : <Empty title="No identity recorded" icon={<Mail size={20} />} />}
      </Card>
      <Card span={5} title="Mailbox connection">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Provider", value: "None" },
            { label: "State", value: <Pill tone="warning" dot>Not connected</Pill> },
            { label: "What works anyway", value: "Drafts, threads, labels and rules, all kept here" },
          ]} />
          <MailBoundary />
          <Button variant="secondary" onClick={() => context.openOverlay("account setup")}>Connect a mailbox</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function ComposeMail({ context, close }: { context: ScreenContext; close: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const recipients = to.split(",").map((value) => value.trim()).filter(Boolean);
  const bulk = recipients.length > 4;
  const [confirmed, setConfirmed] = useState(false);
  const invalid = recipients.some((value) => !value.includes("@"));

  return (
    <form
      id="cm-compose"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid || (bulk && !confirmed)) return;
        await context.mutate.create({
          collection: "emailThreads",
          title: subject || "(no subject)",
          status: "draft",
          summary: body.slice(0, 160),
          at: new Date().toISOString(),
          tags: ["draft"],
          fields: {
            folder: "drafts", from: `${context.actor.split(" ")[0].toLowerCase()}@${context.org.slug}.example`,
            to: recipients.join(", "), unread: false, risk: "none", labels: "draft",
            delivery: "not_connected", messageCount: 1,
          },
          body: { messages: [{ from: `${context.actor.split(" ")[0].toLowerCase()}@${context.org.slug}.example`, at: new Date().toISOString(), body, external: false }] },
        }, `Email draft saved by ${context.actor}`);
        context.toast("Draft saved", "The draft is in this workspace with its recipients and body. No mail provider is connected, so nothing was sent.");
        close();
      }}
    >
      <Field label="To" required hint="Separate addresses with a comma.">
        <TextInput value={to} onChange={(event) => setTo(event.target.value)} invalid={invalid} required />
      </Field>
      {invalid && <Notice tone="danger" title="One of those is not an address">Every recipient needs an @ in it.</Notice>}
      <Field label="Subject"><TextInput value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
      <Field label="Message"><TextArea value={body} onChange={(event) => setBody(event.target.value)} rows={6} /></Field>
      {bulk && (
        <Notice tone="warning" title={`${recipients.length} recipients is a bulk send`}>
          <Checkbox label="I have checked this list and it is right" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        </Notice>
      )}
      <MailBoundary />
    </form>
  );
}

export function QuickSwitcher({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    const all = [
      ...data.channels.map((channel) => ({ id: channel.id, label: `#${channel.title}`, to: `/o/${org.slug}/comms/channels/${channel.id}` })),
      ...data.meetings.map((meeting) => ({ id: meeting.id, label: meeting.title, to: `/o/${org.slug}/comms/meetings/${meeting.id}` })),
      ...data.emailThreads.map((thread) => ({ id: thread.id, label: thread.title, to: `/o/${org.slug}/comms/email/${thread.id}` })),
    ];
    return text ? all.filter((item) => item.label.toLowerCase().includes(text)).slice(0, 12) : all.slice(0, 12);
  }, [query, data, org.slug]);
  return (
    <Stack gap={3}>
      <Field label="Jump to"><TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Channel, meeting or thread" autoFocus /></Field>
      <Stack gap={1}>
        {matches.map((match) => (
          <button key={match.id} type="button" className="cm-channel" onClick={() => { context.navigate(match.to); close(); }}>
            <span className="ds-grow ds-truncate">{match.label}</span>
          </button>
        ))}
        {matches.length === 0 && <span className="ds-subtle">Nothing matches.</span>}
      </Stack>
    </Stack>
  );
}

export function ChannelCreation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCommsData();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("public");
  const duplicate = data.channels.some((channel) => channel.title.trim().toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      id="cm-channel"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (duplicate || !name.trim()) return;
        const form = new FormData(event.currentTarget);
        const created = await context.mutate.create({
          collection: "channels",
          title: name.trim().toLowerCase().replace(/\s+/g, "-"),
          status: "active",
          summary: String(form.get("topic") ?? ""),
          tags: [visibility, "channel"],
          fields: { kind: "channel", visibility, topic: String(form.get("topic") ?? ""), members: context.actor, memberCount: 1, unread: 0, muted: false },
        }, `Channel created: ${name.trim()}`);
        context.toast("Channel created", `#${created.title} is in the directory.`);
        close();
      }}
    >
      <Field label="Channel name" required hint="Lower case, words joined with hyphens.">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="That channel exists">Two channels with one name make a link ambiguous.</Notice>}
      <Field label="What it is for"><TextInput name="topic" /></Field>
      <Field label="Visibility">
        <Select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="public">Public — anyone in the workspace can read it</option>
          <option value="private">Private — only members</option>
        </Select>
      </Field>
      {visibility === "private" && (
        <Notice tone="warning" title="Private means out of workspace search">
          A private channel is left out of workspace-wide search and out of any summary offered to somebody who is not a member.
          The role view shapes the interface; it is not an account security boundary.
        </Notice>
      )}
    </form>
  );
}

export function MemberManagement({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const channel = useRecord(payload?.id ?? context.selectedId);
  const data = useCommsData();
  if (!channel) return <Empty title="Select a channel" icon={<Users size={20} />} />;
  const members = String(channel.fields.members ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const everyone = members[0] === "Everyone";
  const candidates = data.employees.filter((employee) => employee.status !== "alumni" && !members.includes(employee.title));
  return (
    <Stack gap={4}>
      <h3>#{channel.title}</h3>
      <Stack gap={2}>
        {everyone ? <span className="ds-subtle">Everyone in the workspace is a member.</span> : members.map((member) => (
          <Row key={member} gap={2}>
            <Avatar name={member} kind={data.members.some((row) => row.title === member && row.fields.kind === "ai") ? "ai" : "human"} size="sm" />
            <span className="ds-grow">{member}</span>
            <Button size="sm" variant="ghost" onClick={async () => {
              const next = members.filter((name) => name !== member);
              await context.mutate.patch(channel.id, { fields: { ...channel.fields, members: next.join(","), memberCount: next.length } }, { event: `${member} removed from ${channel.title}` });
            }}>Remove</Button>
          </Row>
        ))}
      </Stack>
      {!everyone && candidates.length > 0 && (
        <Field label="Add someone">
          <Select
            defaultValue=""
            onChange={async (event) => {
              const name = event.target.value;
              if (!name) return;
              const next = [...members, name];
              await context.mutate.patch(channel.id, { fields: { ...channel.fields, members: next.join(","), memberCount: next.length } }, { event: `${name} added to ${channel.title}` });
              context.toast("Member added", `${name} can see this channel.`);
            }}
          >
            <option value="">Choose a colleague</option>
            {candidates.map((employee) => <option key={employee.id}>{employee.title}</option>)}
          </Select>
        </Field>
      )}
      <Notice tone="info">Adding somebody to a channel lets them read what was said there from now on; it grants nothing else.</Notice>
    </Stack>
  );
}

export function EventEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { date?: string; id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const data = useCommsData();
  const [date, setDate] = useState(payload?.date ?? new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState("10:00");
  const [minutes, setMinutes] = useState(30);
  const [attendees, setAttendees] = useState<string[]>([]);

  const startAt = new Date(`${date}T${start}:00.000Z`);
  const endAt = new Date(startAt.getTime() + minutes * 60_000);
  const clashes = data.meetings.filter((meeting) =>
    meeting.id !== existing?.id
    && meeting.startAt && meeting.endAt
    && new Date(meeting.startAt) < endAt && new Date(meeting.endAt) > startAt
    && attendees.some((name) => String(meeting.fields.attendees ?? "").includes(name)));

  return (
    <form
      id="cm-event"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.create({
          collection: "meetings",
          title: String(form.get("title") ?? "Meeting"),
          status: clashes.length > 0 ? "tentative" : "scheduled",
          summary: String(form.get("agenda") ?? ""),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          at: startAt.toISOString(),
          fields: {
            where: String(form.get("where") ?? ""), organizer: context.actor,
            attendees: [context.actor, ...attendees].join(","), agenda: String(form.get("agenda") ?? ""),
            minutes, recurring: false, conferencing: "not_connected", accepted: 0,
          },
        }, `Meeting created by ${context.actor}`);
        context.toast("Meeting created", clashes.length > 0 ? "Saved as tentative because of a clash." : "It is in the calendar in this workspace.");
        close();
      }}
    >
      <Field label="Title" required><TextInput name="title" required defaultValue={existing?.title ?? ""} /></Field>
      <Row gap={3}>
        <Field label="Date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Start"><TextInput type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="Minutes"><TextInput inputMode="numeric" align="end" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value) || 30)} /></Field>
      </Row>
      <Field label="Where"><TextInput name="where" defaultValue="Studio table" /></Field>
      <Field label="Attendees">
        <Select
          multiple
          value={attendees}
          onChange={(event) => setAttendees(Array.from(event.target.selectedOptions).map((option) => option.value))}
          style={{ minHeight: 120 }}
        >
          {data.employees.filter((employee) => employee.status !== "alumni").map((employee) => <option key={employee.id} value={employee.title}>{employee.title}</option>)}
        </Select>
      </Field>
      <Field label="Agenda"><TextArea name="agenda" rows={3} /></Field>
      {clashes.length > 0 && (
        <Notice tone="warning" title={`${clashes.length} clash${clashes.length === 1 ? "" : "es"} with this time`}>
          {clashes.map((meeting) => `${meeting.title} at ${context.dateTime(meeting.startAt)}`).join("; ")}.
          The meeting can still be created; it is saved as tentative.
        </Notice>
      )}
      <Notice tone="info" title="Invites are not sent">
        No calendar provider is connected. Attendees appear on the record as invited, and their answer is only known here if
        somebody records it.
      </Notice>
    </form>
  );
}

export function PhishingReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const thread = useRecord(context.params.id ?? context.selectedId);
  if (!thread) return <Empty title="Open a thread first" icon={<ShieldAlert size={20} />} />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Subject", value: thread.title },
        { label: "Sender", value: String(thread.fields.from ?? "") },
        { label: "Currently flagged", value: thread.fields.risk === "phishing" ? "Yes" : "No" },
      ]} />
      <Notice tone="warning" title="What reporting does here">
        It moves the thread to Spam and records the report against your name. There is no provider to notify and no filter to train.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="danger" onClick={async () => {
          await context.mutate.patch(thread.id, { status: "spam", fields: { ...thread.fields, folder: "spam", risk: "phishing", reportedBy: context.actor } }, { expectRevision: thread.revision, event: `${thread.title} reported as phishing by ${context.actor}` });
          context.toast("Reported", "The thread is in Spam and the report is on the record.");
          close();
        }}>Report and move to Spam</Button>
      </Row>
    </Stack>
  );
}
