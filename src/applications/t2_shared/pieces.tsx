import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, Paperclip, Send, ShieldAlert, Sparkles } from "lucide-react";
import { Button, Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import { routeForRecord } from "@/platform/attention";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { handleFor, type Answer, type Citation } from "./engine";
import { useChatState, type LocalAttachment } from "./store";

/* ====================================================================== *
 * Shared conversation parts. Nothing here calls a provider: the composer
 * collects a request, the transcript shows what was composed from records,
 * and the capability line states which provider would be needed.
 * ====================================================================== */

/** Stable fallbacks: a fresh literal in a store selector loops the renderer. */
const NO_IDS: string[] = [];
const NO_ATTACHMENTS: LocalAttachment[] = [];

export interface Turn {
  id: string;
  role: "person" | "arlovi" | "agent" | "note";
  author: string;
  text: string;
  at: string;
  citations?: Citation[];
  limits?: string[];
  kind?: "answer" | "blocked" | "clarify" | "message";
  boundary?: { capability: string; asked: string };
  clarify?: { question: string; options: Citation[] };
  attachments?: LocalAttachment[];
  scope?: string[];
}

export function readTurns(record: Rec | undefined): Turn[] {
  const body = record?.body as { turns?: Turn[] } | undefined;
  return Array.isArray(body?.turns) ? body!.turns! : [];
}

export function turnFromAnswer(answer: Answer, at: string, author = "Arlovi"): Turn {
  return {
    id: `turn-${at}-${Math.random().toString(36).slice(2, 8)}`,
    role: "arlovi",
    author,
    text: answer.text,
    at,
    citations: answer.citations,
    limits: answer.limits,
    boundary: answer.boundary,
    clarify: answer.clarify,
    kind: answer.clarify ? "clarify" : answer.boundary ? "blocked" : "answer",
  };
}

/** The honest provider line: state, what is kept locally, and why. */
export function CapabilityLine({ id, title, children }: { id: string; title?: string; children?: ReactNode }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return (
    <Notice
      tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : CAPABILITY_TONE[capability.state]}
      title={<Row gap={2}><span>{title ?? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}`}</span><Pill tone={CAPABILITY_TONE[capability.state]}>{capability.provider}</Pill></Row>}
    >
      {capability.note} {capability.localEquivalent} {children}
    </Notice>
  );
}

export function ScopeChips({
  thread, records, context, editable = true,
}: { thread: string; records: Rec[]; context: ScreenContext; editable?: boolean }) {
  const scope = useChatState((state) => state.scope[thread] ?? NO_IDS);
  const removeScope = useChatState((state) => state.removeScope);
  const pinned = scope.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
  if (pinned.length === 0) {
    return <span className="ds-subtle">Nothing is pinned, so an answer reads the whole {context.org.shortName} workspace.</span>;
  }
  return (
    <Row gap={2} wrap>
      <span className="ds-subtle">In scope:</span>
      {pinned.map((record) => (
        <span key={record.id} className="ds-pill" data-tone="accent">
          {record.collection} · {record.title}
          {editable && (
            <button
              type="button"
              aria-label={`Remove ${record.title} from scope`}
              onClick={() => removeScope(thread, record.id)}
              style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </span>
      ))}
    </Row>
  );
}

export function Composer({
  thread, records, context, onSend, placeholder, blocked, extraTools, mentionPool,
}: {
  thread: string;
  records: Rec[];
  context: ScreenContext;
  onSend: (input: { text: string; scope: Rec[]; attachments: LocalAttachment[] }) => void | Promise<void>;
  placeholder: string;
  /** Reason the composer cannot send; it stays visible and explains itself. */
  blocked?: string;
  extraTools?: ReactNode;
  mentionPool?: Rec[];
}) {
  const draft = useChatState((state) => state.drafts[thread] ?? "");
  const scopeIds = useChatState((state) => state.scope[thread] ?? NO_IDS);
  const attachments = useChatState((state) => state.attachments[thread] ?? NO_ATTACHMENTS);
  const sendSignal = useChatState((state) => state.sendSignal[thread] ?? 0);
  const focusSignal = useChatState((state) => state.focusSignal[thread] ?? 0);
  const { setDraft, addScope, removeAttachment } = useChatState.getState();
  const [busy, setBusy] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const firstSignal = useRef({ send: sendSignal, focus: focusSignal });

  const pool = useMemo(
    () => mentionPool ?? records.filter((record) => record.collection === "agents" || record.collection === "members"),
    [mentionPool, records],
  );

  const mentionQuery = useMemo(() => {
    const match = /@([\w.-]*)$/.exec(draft);
    return match ? match[1].toLowerCase() : null;
  }, [draft]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return pool
      .filter((record) => handleFor(record.title).includes(mentionQuery) || record.title.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, pool]);

  useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

  async function submit() {
    const text = draft.trim();
    if (!text || blocked) return;
    setBusy(true);
    try {
      const scope = scopeIds.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
      await onSend({ text, scope, attachments });
      setDraft(thread, "");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (sendSignal === firstSignal.current.send) return;
    firstSignal.current.send = sendSignal;
    // The send signal is the only input that may trigger a send.
    void submit();
  }, [sendSignal]);

  useEffect(() => {
    if (focusSignal === firstSignal.current.focus) return;
    firstSignal.current.focus = focusSignal;
    area.current?.focus();
  }, [focusSignal]);

  function insertMention(record: Rec) {
    setDraft(thread, draft.replace(/@([\w.-]*)$/, `@${handleFor(record.title)} `));
    addScope(thread, [record.id]);
    area.current?.focus();
  }

  return (
    <div className="ds-panel" style={{ padding: "var(--space-3)" }}>
      <Stack gap={2}>
        <ScopeChips thread={thread} records={records} context={context} />
        {attachments.length > 0 && (
          <Row gap={2} wrap>
            <span className="ds-subtle">Attached by reference:</span>
            {attachments.map((attachment) => (
              <span key={attachment.id} className="ds-pill" data-tone="info">
                {attachment.name} · {(attachment.size / 1024).toFixed(0)} kB
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(thread, attachment.id)}
                  style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </Row>
        )}

        {mentionMatches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention a participant"
            className="ds-stack ds-gap-1"
            style={{ listStyle: "none", margin: 0, padding: "var(--space-2)", background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-2)" }}
          >
            {mentionMatches.map((record, index) => (
              <li key={record.id} role="option" aria-selected={index === mentionIndex}>
                <button
                  type="button"
                  className="ds-record-card"
                  data-active={index === mentionIndex ? "true" : undefined}
                  style={{ width: "100%", textAlign: "start", background: index === mentionIndex ? "var(--bg-selected)" : undefined }}
                  onClick={() => insertMention(record)}
                >
                  <Row gap={2}>
                    <AtSign size={14} />
                    <strong className="ds-grow">{handleFor(record.title)}</strong>
                    <Pill tone={record.collection === "agents" || record.fields.kind === "ai" ? "accent" : "neutral"}>
                      {record.collection === "agents" || record.fields.kind === "ai" ? "AI" : "Person"}
                    </Pill>
                  </Row>
                  <span className="ds-subtle">{record.title} — {String(record.fields.role ?? record.fields.title ?? record.summary)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Row gap={2} style={{ alignItems: "flex-end" }}>
          <textarea
            ref={area}
            className="ds-textarea"
            aria-label={placeholder}
            placeholder={blocked ? "Sending is unavailable — see the note above" : placeholder}
            value={draft}
            rows={2}
            disabled={Boolean(blocked)}
            style={{ minHeight: 52 }}
            onChange={(event) => setDraft(thread, event.target.value)}
            onKeyDown={(event) => {
              if (mentionMatches.length > 0) {
                if (event.key === "ArrowDown") { event.preventDefault(); setMentionIndex((index) => (index + 1) % mentionMatches.length); return; }
                if (event.key === "ArrowUp") { event.preventDefault(); setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length); return; }
                if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
                if (event.key === "Escape") { event.preventDefault(); setDraft(thread, `${draft} `); return; }
              }
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
            }}
          />
          <Button
            variant="primary"
            busy={busy}
            disabled={!draft.trim() || Boolean(blocked)}
            title={blocked}
            onClick={() => void submit()}
            icon={<Send size={16} />}
          >
            Send
          </Button>
        </Row>

        <Row gap={2} wrap>
          {extraTools}
          <span className="ds-grow" />
          <span className="ds-subtle">Enter sends · Shift+Enter adds a line · @ mentions a participant</span>
        </Row>
      </Stack>
    </div>
  );
}

export function TurnList({
  turns, context, emptyTitle, emptyBody, onInspect,
}: {
  turns: Turn[];
  context: ScreenContext;
  emptyTitle: string;
  emptyBody: ReactNode;
  onInspect?: (turn: Turn) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length]);
  const addScope = useChatState((state) => state.addScope);

  if (turns.length === 0) {
    return <Empty title={emptyTitle} icon={<Sparkles size={20} />}>{emptyBody}</Empty>;
  }

  return (
    <div role="log" aria-live="polite" aria-label="Conversation" className="ds-stack ds-gap-4" style={{ maxHeight: "52vh", overflowY: "auto" }}>
      {turns.map((turn) => (
        <article key={turn.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${turn.role === "person" ? "var(--border-strong)" : turn.kind === "blocked" ? "var(--warning)" : "var(--accent)"}` }}>
          <Row gap={2} wrap>
            <Pill tone={turn.role === "person" ? "neutral" : turn.role === "note" ? "info" : "accent"} dot>{turn.author}</Pill>
            <span className="ds-subtle">{context.dateTime(turn.at)} · {context.relative(turn.at)}</span>
            <span className="ds-grow" />
            {turn.kind === "blocked" && <Pill tone="warning">Stopped at the provider boundary</Pill>}
            {turn.kind === "clarify" && <Pill tone="warning">Needs clarification</Pill>}
            {onInspect && (
              <Button size="sm" variant="ghost" onClick={() => onInspect(turn)} aria-label={`Message actions for the turn from ${turn.author}`}>Actions</Button>
            )}
          </Row>
          <p className="ds-prose" style={{ whiteSpace: "pre-wrap", marginBlockStart: "var(--space-2)" }}>{turn.text}</p>

          {turn.attachments && turn.attachments.length > 0 && (
            <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
              {turn.attachments.map((attachment) => (
                <Pill key={attachment.id} tone="info">{attachment.name} · kept locally</Pill>
              ))}
            </Row>
          )}

          {turn.clarify && (
            <Notice tone="warning" title="I need to know which record you mean">
              {turn.clarify.question}
              <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                {turn.clarify.options.map((option) => (
                  <Button key={option.id} size="sm" variant="secondary" onClick={() => addScope(threadKeyFor(context), [option.id])}>
                    {option.title}
                  </Button>
                ))}
              </Row>
            </Notice>
          )}

          {turn.boundary && <CapabilityLine id={turn.boundary.capability} title={`Asked to ${turn.boundary.asked} — not connected`} />}

          {turn.citations && turn.citations.length > 0 && (
            <div className="ds-stack ds-gap-1" style={{ marginBlockStart: "var(--space-2)" }}>
              <span className="ds-subtle">Read from {turn.citations.length} record{turn.citations.length === 1 ? "" : "s"}</span>
              <Row gap={2} wrap>
                {turn.citations.map((citation) => (
                  <Button
                    key={citation.id}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const route = routeForCitation(citation, context.org.slug);
                      if (route) context.navigate(route);
                      else context.toast("No screen for that record", `${citation.title} has no record screen in this workspace.`, "info");
                    }}
                  >
                    {citation.collection} · {citation.title}
                  </Button>
                ))}
              </Row>
            </div>
          )}

          {turn.limits && turn.limits.length > 0 && (
            <ul className="ds-subtle" style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "1.1rem" }}>
              {turn.limits.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          )}
        </article>
      ))}
      <div ref={end} />
    </div>
  );
}

const T2_ROUTES: Record<string, (slug: string, id: string) => string> = {
  facts: (slug) => `/o/${slug}/brain/facts`,
  sources: (slug, id) => `/o/${slug}/brain/sources/${id}`,
  conflicts: (slug) => `/o/${slug}/brain/conflicts`,
  decisions: (slug) => `/o/${slug}/brain/decisions`,
  brands: (slug) => `/o/${slug}/brain/brand`,
  policies: (slug) => `/o/${slug}/brain/permissions`,
  skills: (slug) => `/o/${slug}/team/skills`,
  evaluations: (slug) => `/o/${slug}/team/evaluations`,
  connectors: (slug) => `/o/${slug}/team/models`,
  members: (slug) => `/o/${slug}/team/organization`,
  conversations: (slug) => `/o/${slug}/ai/conversations`,
  channels: (slug, id) => `/o/${slug}/ai/rooms/${id}`,
  meetings: (slug, id) => `/o/${slug}/ai/meetings/${id}`,
  research: (slug, id) => `/o/${slug}/ai/research/${id}`,
  templates: (slug) => `/o/${slug}/mission/templates`,
  missionTasks: (slug) => `/o/${slug}/mission/missions`,
  missionSteps: (slug) => `/o/${slug}/mission/missions`,
};

/** Route for a cited record, covering the intelligence collections first. */
export function routeForCitation(citation: { id: string; collection: string }, slug: string): string | undefined {
  const own = T2_ROUTES[citation.collection];
  if (own) return own(slug, citation.id);
  return routeForRecord({ id: citation.id, collection: citation.collection } as Rec, slug);
}

export function threadKeyFor(context: ScreenContext): string {
  return `${context.screen.id}:${context.params.id ?? "root"}`;
}

/** Attachment picker used by the upload-review overlays. Reads metadata only. */
export function AttachmentPicker({ thread, onPicked }: { thread: string; onPicked?: (attachment: LocalAttachment) => void }) {
  const addAttachment = useChatState((state) => state.addAttachment);
  const [picked, setPicked] = useState<LocalAttachment[]>([]);
  return (
    <Stack gap={3}>
      <input
        type="file"
        multiple
        aria-label="Choose files to attach by reference"
        className="ds-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          for (const file of files) {
            const attachment: LocalAttachment = { id: `att-${file.name}-${file.size}`, name: file.name, size: file.size, type: file.type || "unknown" };
            addAttachment(thread, attachment);
            setPicked((current) => [...current, attachment]);
            onPicked?.(attachment);
          }
        }}
      />
      {picked.length > 0 && (
        <Properties rows={picked.map((attachment) => ({ label: attachment.name, value: `${(attachment.size / 1024).toFixed(0)} kB · ${attachment.type}` }))} />
      )}
      <Notice tone="info" title="Attached by reference">
        The file name, size and type are recorded against the conversation in this browser. The bytes are not copied anywhere and no upload is performed.
      </Notice>
    </Stack>
  );
}

/** Toggle between a drawn diagram and the list that carries the same facts. */
export function DiagramToggle({
  mode, onChange, note, diagramLabel = "Diagram", listLabel = "List",
}: { mode: "diagram" | "list"; onChange: (next: "diagram" | "list") => void; note: string; diagramLabel?: string; listLabel?: string }) {
  return (
    <Row gap={3} wrap>
      <div className="ds-btn-group" role="group" aria-label="Display">
        <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "diagram"} onClick={() => onChange("diagram")}>{diagramLabel}</button>
        <button type="button" className="ds-btn" data-size="sm" aria-pressed={mode === "list"} onClick={() => onChange("list")}>{listLabel}</button>
      </div>
      <span className="ds-subtle">{note}</span>
    </Row>
  );
}

export function BoundaryStat({ label, reason }: { label: string; reason: string }) {
  return (
    <Row gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
      <ShieldAlert size={16} aria-hidden="true" />
      <div className="ds-grow">
        <strong>{label}</strong>
        <p className="ds-subtle">{reason}</p>
      </div>
      <Pill tone="warning">Not connected</Pill>
    </Row>
  );
}

export function AttachTool({ onClick }: { onClick: () => void }) {
  return <Button size="sm" variant="secondary" icon={<Paperclip size={14} />} onClick={onClick}>Attach</Button>;
}
