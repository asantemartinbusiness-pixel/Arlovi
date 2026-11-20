import type { ReactNode } from "react";
import "./library.css";

/**
 * Compact status strip that opens a Build screen: the counts that decide what to do
 * next, one honest boundary line, and the two or three jumps that follow from them.
 * Replaces the headline-and-paragraph hero so content starts at the top of the page.
 */
export function BuildBrief({
  label, metricsLabel, stats, actions, note,
}: {
  label: string;
  metricsLabel: string;
  stats: { label: string; value: ReactNode; tone?: "danger" | "warning" }[];
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className="bb-brief" aria-label={label}>
      <div className="bb-brief-stats" aria-label={metricsLabel} role="group">
        {stats.map((stat) => (
          <div key={stat.label} className="bb-stat" data-tone={stat.value === 0 || stat.value === "0" ? undefined : stat.tone}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
      {(actions || note) && (
        <div className="bb-brief-foot">
          {note && <p className="bb-brief-note">{note}</p>}
          {actions && <div className="bb-brief-actions">{actions}</div>}
        </div>
      )}
    </section>
  );
}
