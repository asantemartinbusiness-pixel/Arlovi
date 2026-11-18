import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { findScreen } from "@/app/catalog";
import { workspaceDestination } from "@/app/workspaceSidebarModel";
import { ArrowUp, Clock3, FileText, Landmark, ListChecks, MessageSquarePlus, Sparkles, Target, Info } from "lucide-react";
import { Button, Drawer, TextArea } from "@/design-system";
import { brand } from "@/app/brand";
import { localAssistantReply } from "@/domain/assistant";
import { routeForRecord } from "@/platform/attention";
import { useOrgRecords, useWorkspace } from "@/platform/workspace";
import "./ask-panel.css";

interface Turn {
  id: string;
  role: "person" | "arlovi";
  text: string;
  sources?: { id: string; title: string; route?: string }[];
  at: string;
}

const PROMPTS = [
  { title: "Priorities", detail: "What needs attention today?", icon: ListChecks },
  { title: "Finance", detail: "How much are we owed, and by whom?", icon: Landmark },
  { title: "Missions", detail: "Which missions are waiting on a decision?", icon: Target },
  { title: "Commitments", detail: "Summarise this week's commitments.", icon: Clock3 },
] as const;

/** Local, cited workspace answers. No AI provider is connected. */
export function AskPanel({ onClose, seed }: { onClose: () => void; seed: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const context = workspaceDestination(location.pathname)?.title ?? findScreen(location.pathname)?.screen.applicationName ?? "Workspace";
  const { org, now, relative } = useWorkspace();
  const records = useOrgRecords();
  const [prompt, setPrompt] = useState(seed);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const recordCount = useMemo(() => records.length, [records]);
  const replyContext = context === "Workspace" ? org.name : context;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  function ask(text: string) {
    const question = text.trim();
    if (!question) return;
    const reply = localAssistantReply(records, org.id, question);
    const cited = records
      .filter((record) => reply.text.includes(record.title))
      .slice(0, 4)
      .map((record) => ({ id: record.id, title: record.title, route: routeForRecord(record, org.slug) }));
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "person", text: question, at: now.toISOString() },
      { id: crypto.randomUUID(), role: "arlovi", text: reply.text, sources: cited, at: now.toISOString() },
    ]);
    setPrompt("");
  }

  function newConversation() {
    setTurns([]);
    setPrompt("");
    document.querySelector<HTMLTextAreaElement>(".ask-composer textarea")?.focus();
  }

  return (
    <Drawer
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={<span className="ds-row ds-gap-2"><Sparkles size={18} aria-hidden="true" /> {brand.ask}</span>}
      subtitle={`${org.name} · ${context}`}
      width={520}
      footer={
        <div className="ask-composer-wrap">
          <form className="ask-composer" onSubmit={(event) => { event.preventDefault(); ask(prompt); }}>
            <TextArea
              aria-label={`Ask about ${org.name}`}
              placeholder={`Ask about ${org.shortName}…`}
              value={prompt}
              rows={2}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  ask(prompt);
                }
              }}
            />
            <div className="ask-composer-actions">
              <span className="ask-composer-hint">Enter to ask · Shift+Enter for a new line</span>
              <Button type="submit" variant="primary" iconOnly aria-label="Send question" disabled={!prompt.trim()}><ArrowUp size={17} /></Button>
            </div>
          </form>
          <p className="ask-composer-caption">Local workspace answers · Records referenced where available</p>
        </div>
      }
    >
      <section className="ask-panel" aria-label="Ask Arlovi conversation">
        <div className="ask-panel-toolbar">
          <span className="ask-context"><span className="ask-context-dot" /> {replyContext} <span className="ask-context-count">· {recordCount} records available</span></span>
          <Button size="sm" variant="ghost" icon={<MessageSquarePlus size={15} />} onClick={newConversation} disabled={turns.length === 0 && !prompt} aria-label="New conversation">New</Button>
        </div>
        <div className="ask-connection" role="status">
          <Info size={16} aria-hidden="true" />
          <div><strong>Using local workspace records</strong><p>No language model is connected. Answers come from records in {org.name}, not from an AI model.</p></div>
        </div>

        {turns.length === 0 ? (
          <div className="ask-welcome">
            <div className="ask-welcome-mark"><Sparkles size={25} strokeWidth={1.7} aria-hidden="true" /></div>
            <h2>How can I help?</h2>
            <p>Find the details, decisions and activity that matter in your workspace.</p>
            <div className="ask-suggestion-heading">Explore your workspace</div>
            <div className="ask-suggestions">
              {PROMPTS.map(({ title, detail, icon: Icon }) => (
                <button type="button" key={title} className="ask-suggestion" onClick={() => ask(detail)}>
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ask-conversation" role="log" aria-live="polite" aria-label="Conversation">
            {turns.map((turn) => (
              <article key={turn.id} className={`ask-turn ask-turn--${turn.role}`}>
                <div className="ask-turn-meta">
                  <span className="ask-turn-identity">{turn.role === "arlovi" ? <Sparkles size={15} /> : null}{turn.role === "arlovi" ? brand.companion : "You"}</span>
                  <time dateTime={turn.at}>{relative(turn.at)}</time>
                </div>
                <p className="ask-turn-body">{turn.text}</p>
                {turn.sources && turn.sources.length > 0 && (
                  <div className="ask-sources">
                    <span className="ask-sources-title"><FileText size={14} /> Referenced records</span>
                    {turn.sources.map((source) => (
                      <button type="button" key={source.id} className="ask-source-link" disabled={!source.route}
                        onClick={() => { if (source.route) { navigate(source.route); onClose(); } }}>
                        {source.title}<span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </section>
    </Drawer>
  );
}
