import { Fragment, useMemo, useState } from "react";
import { Hash, Lock, MessageSquare, Paperclip, Pin } from "lucide-react";
import { Avatar, Button, Empty, Notice, Pill, Row, Stack, TextArea } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Reactions are stored on the message as "emoji:name,name;emoji:name".
 * Keeping them in typed fields means a reaction is a normal record change
 * with an audit entry, not an untyped blob.
 * ------------------------------------------------------------------ */

export type Reactions = Record<string, string[]>;

export function parseReactions(value: unknown): Reactions {
  const text = String(value ?? "").trim();
  if (!text) return {};
  const result: Reactions = {};
  for (const group of text.split(";")) {
    const [emoji, names] = group.split(":");
    if (!emoji) continue;
    result[emoji.trim()] = (names ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  }
  return result;
}

export function formatReactions(reactions: Reactions): string {
  return Object.entries(reactions)
    .filter(([, names]) => names.length > 0)
    .map(([emoji, names]) => `${emoji}:${names.join(",")}`)
    .join(";");
}

export const QUICK_REACTIONS = ["👍", "🎉", "👀", "🙏", "🔥"];

/** Renders @mentions as marked spans without allowing any raw markup through. */
export function MessageBody({ text, mentions }: { text: string; mentions: string }) {
  const names = mentions.split(",").map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return <p className="cm-msg-body">{text}</p>;
  const pattern = new RegExp(`(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = text.split(pattern);
  return (
    <p className="cm-msg-body">
      {parts.map((part, index) => (
        names.includes(part)
          ? <mark key={index} className="cm-mention">@{part}</mark>
          : <Fragment key={index}>{part}</Fragment>
      ))}
    </p>
  );
}

export function ChannelList({
  channels, activeId, onPick, unreadOf,
}: {
  channels: Rec[]; activeId?: string; onPick: (id: string) => void; unreadOf: (channel: Rec) => number;
}) {
  return (
    <nav className="cm-channels" aria-label="Channels">
      {channels.map((channel) => {
        const unread = unreadOf(channel);
        const isGroup = channel.fields.kind === "group";
        return (
          <button
            key={channel.id}
            type="button"
            className="cm-channel"
            aria-current={channel.id === activeId ? "true" : undefined}
            onClick={() => onPick(channel.id)}
          >
            <span className="cm-channel-hash" aria-hidden="true">
              {isGroup ? <MessageSquare size={14} /> : channel.fields.visibility === "private" ? <Lock size={14} /> : <Hash size={14} />}
            </span>
            <span className="ds-grow ds-truncate">{channel.title}</span>
            {unread > 0 && <Pill tone="accent">{unread}</Pill>}
          </button>
        );
      })}
      {channels.length === 0 && <span className="ds-subtle">No channels here.</span>}
    </nav>
  );
}

export function Conversation({
  context, channel, messages, onCreateTask,
}: {
  context: ScreenContext;
  channel: Rec;
  messages: Rec[];
  onCreateTask?: (message: Rec) => void;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roots = useMemo(
    () => messages.filter((message) => !message.fields.threadRootId).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")),
    [messages],
  );
  const repliesOf = (id: string) => messages.filter((message) => message.fields.threadRootId === id).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  async function toggleReaction(message: Rec, emoji: string) {
    const reactions = parseReactions(message.fields.reactions);
    const names = reactions[emoji] ?? [];
    reactions[emoji] = names.includes(context.actor) ? names.filter((name) => name !== context.actor) : [...names, context.actor];
    await context.mutate.patch(message.id, {
      fields: { ...message.fields, reactions: formatReactions(reactions) },
    }, { event: `${context.actor} reacted ${emoji} to ${message.title}` });
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const mentioned = text.match(/@([A-Z][a-z]+ [A-Z][a-z]+)/g)?.map((hit) => hit.slice(1)) ?? [];
      const root = replyTo ? messages.find((message) => message.id === replyTo) : undefined;
      await context.mutate.create({
        collection: "messages",
        title: root ? `Re: ${root.title}` : text.split(/[.!?]/)[0].slice(0, 60) || "Message",
        status: "sent",
        summary: text,
        parentId: channel.id,
        at: new Date().toISOString(),
        fields: {
          author: context.actor, kind: "human",
          threadRootId: root?.id ?? "", reactions: "", mentions: mentioned.join(","),
          fileRef: "", pinned: false,
        },
      }, `${context.actor} posted in ${channel.title}`);
      setDraft("");
      setReplyTo(null);
      context.toast("Message posted", `It is in ${channel.title} in this workspace. Nothing was sent anywhere else.`);
    } finally {
      setBusy(false);
    }
  }

  function renderMessage(message: Rec, isReply: boolean) {
    const reactions = parseReactions(message.fields.reactions);
    const isAgent = message.fields.kind === "ai";
    return (
      <article key={message.id} className="cm-msg" data-reply={isReply ? "true" : undefined}>
        <Avatar name={String(message.fields.author ?? message.ownerName)} kind={isAgent ? "ai" : "human"} size="sm" />
        <div>
          <header className="cm-msg-head">
            <span className="cm-msg-author">{String(message.fields.author ?? message.ownerName)}</span>
            {isAgent && <Pill tone="accent">AI employee</Pill>}
            <span className="ds-subtle">{context.dateTime(message.at ?? message.updatedAt)}</span>
            {message.fields.pinned === true && <Pill tone="info"><Pin size={11} aria-hidden="true" /> Pinned</Pill>}
          </header>
          <MessageBody text={message.summary} mentions={String(message.fields.mentions ?? "")} />
          {Boolean(message.fields.fileRef) && (
            <Row gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)", marginBlockStart: 6, width: "fit-content" }}>
              <Paperclip size={14} aria-hidden="true" />
              <span className="ds-subtle">A file in this workspace is referenced: {String(message.fields.fileRef)}</span>
            </Row>
          )}
          <div className="cm-msg-actions">
            {Object.entries(reactions).filter(([, names]) => names.length > 0).map(([emoji, names]) => (
              <button
                key={emoji}
                type="button"
                className="cm-react"
                data-mine={names.includes(context.actor) ? "true" : undefined}
                aria-label={`${emoji} from ${names.join(", ")}. ${names.includes(context.actor) ? "Remove your reaction" : "Add your reaction"}`}
                onClick={() => void toggleReaction(message, emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
                <span>{names.length}</span>
              </button>
            ))}
            {QUICK_REACTIONS.filter((emoji) => !reactions[emoji]?.length).slice(0, 3).map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="cm-react"
                aria-label={`React with ${emoji}`}
                onClick={() => void toggleReaction(message, emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
            {!isReply && <Button size="sm" variant="ghost" onClick={() => setReplyTo(message.id)}>Reply in thread</Button>}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await context.mutate.patch(message.id, {
                  status: message.fields.pinned === true ? "sent" : "pinned",
                  fields: { ...message.fields, pinned: message.fields.pinned !== true },
                }, { event: `${message.title} ${message.fields.pinned === true ? "unpinned" : "pinned"} by ${context.actor}` });
              }}
            >
              {message.fields.pinned === true ? "Unpin" : "Pin"}
            </Button>
            {onCreateTask && <Button size="sm" variant="ghost" onClick={() => onCreateTask(message)}>Make a task</Button>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={2} wrap>
        <strong style={{ fontSize: "var(--text-lg)" }}>
          {channel.fields.kind === "group" ? channel.title : `#${channel.title}`}
        </strong>
        <Pill tone={channel.fields.visibility === "private" ? "warning" : "neutral"} dot>{String(channel.fields.visibility ?? "public")}</Pill>
        <span className="ds-subtle ds-grow">{channel.summary}</span>
        <span className="ds-subtle">{String(channel.fields.memberCount ?? 0)} members</span>
      </Row>

      {channel.fields.visibility === "private" && (
        <Notice tone="warning" title="This channel is private">
          Messages here are not included in workspace-wide search or in any summary offered outside its members.
          The role view shapes what this interface offers; it is not an account security boundary.
        </Notice>
      )}

      <div className="cm-thread">
        {roots.length === 0 && <Empty title="Nothing has been said here yet" icon={<MessageSquare size={20} />}>Write the first message below.</Empty>}
        {roots.map((message) => (
          <Fragment key={message.id}>
            {renderMessage(message, false)}
            {repliesOf(message.id).map((reply) => renderMessage(reply, true))}
            {replyTo === message.id && (
              <div className="cm-msg" data-reply="true">
                <span />
                <span className="ds-subtle">Replying in this thread. The box below posts here.</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <form
        className="cm-composer"
        onSubmit={(event) => { event.preventDefault(); void send(); }}
      >
        {replyTo && (
          <Row gap={2}>
            <span className="ds-subtle ds-grow">Replying to {messages.find((message) => message.id === replyTo)?.title}</span>
            <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Post to the channel instead</Button>
          </Row>
        )}
        <TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          aria-label={`Message ${channel.title}`}
          placeholder={`Message ${channel.fields.kind === "group" ? channel.title : `#${channel.title}`}. Type a full name after @ to mention someone.`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); }
          }}
        />
        <Row gap={2}>
          <span className="ds-subtle ds-grow">Messages stay in this browser. Mentioning somebody notifies them here and grants them nothing.</span>
          <Button type="submit" variant="primary" busy={busy} disabled={!draft.trim()}>Send</Button>
        </Row>
      </form>
    </Stack>
  );
}
