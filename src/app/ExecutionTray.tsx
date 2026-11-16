import { Link } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Rec } from "@/domain/types";
import { useWorkspace } from "@/platform/workspace";
import { Pill } from "@/design-system";

const LIVE = new Set(["running", "executing", "in_progress", "dispatched"]);

/** Persistent execution tray: what the workforce is doing right now. */
export function ExecutionTray({ missions }: { missions: Rec[] }) {
  const { org, relative } = useWorkspace();
  const [open, setOpen] = useState(false);
  const live = missions.filter((mission) => LIVE.has(mission.status));
  const waiting = missions.filter((mission) => mission.status === "needs_decision");
  if (live.length === 0 && waiting.length === 0) return null;

  return (
    <div className="hq-tray" role="region" aria-label="Execution tray">
      <span className="hq-tray-chip">
        <i className="hq-tray-pulse" aria-hidden="true" />
        {live.length} running
      </span>
      {waiting.length > 0 && <Pill tone="warning">{waiting.length} waiting on a decision</Pill>}
      <span className="ds-grow" />
      <button type="button" className="ds-btn" data-variant="ghost" data-size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />} Detail
      </button>
      {open && (
        <ul style={{ position: "absolute", insetInlineEnd: "var(--page-pad)", insetBlockEnd: 44, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-3)", padding: "var(--space-2)", minWidth: 300, zIndex: 30 }}>
          {[...waiting, ...live].slice(0, 6).map((mission) => (
            <li key={mission.id}>
              <Link to={`/o/${org.slug}/mission/missions/${mission.id}`} className="ds-menu-item">
                <span className="ds-grow ds-truncate">{mission.title}</span>
                <span className="ds-subtle">{relative(mission.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
