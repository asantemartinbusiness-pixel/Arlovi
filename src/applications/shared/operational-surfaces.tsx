import type { ReactNode } from "react";
import "./operational-surfaces.css";

export function OpsHeader({ eyebrow, title, description, actions, note }: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className="ops-header" aria-label={title}>
      <div className="ops-header-copy">
        <span className="ops-eyebrow">{eyebrow}</span>
        <h2 className="ops-heading">{title}</h2>
        <p className="ops-description">{description}</p>
        {note && <div className="ops-header-note">{note}</div>}
      </div>
      {actions && <div className="ops-header-actions">{actions}</div>}
    </section>
  );
}

export function OpsMetrics({ children, label = "Overview" }: {
  children: ReactNode;
  label?: string;
}) {
  return <div className="ops-metrics" aria-label={label}>{children}</div>;
}

export function OpsMetric({ label, value, detail, emphasis = "neutral" }: {
  label: string;
  value: string | number;
  detail?: string;
  emphasis?: "neutral" | "attention" | "positive";
}) {
  return (
    <div className="ops-metric" data-emphasis={emphasis}>
      <span className="ops-metric-label">{label}</span>
      <strong className="ops-metric-value">{value}</strong>
      {detail && <span className="ops-metric-detail">{detail}</span>}
    </div>
  );
}
