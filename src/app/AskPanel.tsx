import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { findScreen } from "@/app/catalog";
import { workspaceDestination } from "@/app/workspaceSidebarModel";
import { Send, Sparkles } from "lucide-react";
import { Button, Drawer, Notice, Pill, TextArea } from "@/design-system";
import { brand } from "@/app/brand";
import { localAssistantReply } from "@/domain/assistant";
import { capabilityById } from "@/platform/capability";
import { routeForRecord } from "@/platform/attention";
import { useOrgRecords, useWorkspace } from "@/platform/workspace";

interface Turn {
  id: string;
  role: "person" | "arlovi";
  text: string;
  sources?: { id: string; title: string; route?: string }[];
  at: string;
}

/**
 * Audit A05 and A16: the panel reads the organisation in the address bar, keeps
 * a conversation rather than a single reply, names the records an answer came
 * from, and states plainly that no model is connected.
 */
export function AskPanel({ onClose, seed }: { onClose: () => void; seed: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const context = workspaceDestination(location.pathname)?.title ?? findScreen(location.pathname)?.screen.applicationName ?? "Workspace";
  const { org, now, relative } = useWorkspace();
  const records = useOrgRecords();
  const [prompt, setPrompt] = useState(seed);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const capability = capabilityById("model.inference");

  const suggestions = useMemo(() => [
    "What needs attention today?",
    "How much are we owed, and by whom?",
    "Which missions are waiting on a decision?",
    "Summarise this week's commitments.",
  ], []);

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
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  return (
    <Drawer
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={<span className="ds-row ds-gap-2"><Sparkles size={18} /> {brand.ask}</span>}
      subtitle={`${org.name} · ${context} · local assistant`}
      width={480}
      footer={
        <form
          className="ds-row ds-gap-2"
          style={{ width: "100%" }}
          onSubmit={(event) => { event.preventDefault(); ask(prompt); }}
        >
          <TextArea
            aria-label={`Ask about ${org.name}`}
            placeholder={`Ask about ${org.shortName}…`}
            value={prompt}
            rows={2}
            style={{ minHeight: 44 }}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); ask(prompt); }
            }}
          />
          <Button type="submit" variant="primary" iconOnly aria-label="Ask" disabled={!prompt.trim()}><Send size={16} /></Button>
        </form>
      }
    >
      <div className="ds-stack ds-gap-4">
        <Notice tone="warning" title="No language model is connected">
          {capability?.localEquivalent} You are viewing {context}. Responses are composed from local {org.name} records, not from an AI model. They name the records used when available.
        </Notice>

        {turns.length === 0 && (
          <div className="ds-stack ds-gap-2">
            <span className="ds-subtle">Try one of these:</span>
            {suggestions.map((item) => (
              <Button key={item} variant="secondary" size="sm" style={{ justifyContent: "flex-start" }} onClick={() => ask(item)}>{item}</Button>
            ))}
          </div>
        )}

        {turns.map((turn) => (
          <article key={turn.id} className="ds-stack ds-gap-2">
            <div className="ds-row ds-gap-2">
              <Pill tone={turn.role === "arlovi" ? "accent" : "neutral"}>{turn.role === "arlovi" ? brand.companion : "You"}</Pill>
              <span className="ds-subtle">{relative(turn.at)}</span>
            </div>
            <p className="ds-prose" style={{ whiteSpace: "pre-wrap" }}>{turn.text}</p>
            {turn.sources && turn.sources.length > 0 && (
              <div className="ds-stack ds-gap-1">
                <span className="ds-subtle">Read from</span>
                {turn.sources.map((source) => (
                  <Button
                    key={source.id}
                    size="sm"
                    variant="ghost"
                    style={{ justifyContent: "flex-start" }}
                    disabled={!source.route}
                    onClick={() => { if (source.route) { navigate(source.route); onClose(); } }}
                  >
                    {source.title}
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </Drawer>
  );
}
