import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * Where a fact came from. Rendered as the 2px material on the leading edge of
 * anything that asserts one, so a page can be read for trust before it is read
 * for content.
 */
export type Provenance = "posted" | "human" | "agent" | "unknown";

/* ---------------- Button ---------------- */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: "primary" | "secondary" | "ghost" | "soft" | "danger" | "outline-danger";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
  iconOnly?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit" | "reset";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy, iconOnly, icon, children, type = "button", disabled, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ds-btn${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-size={size}
      data-busy={busy ? "true" : undefined}
      data-icon-only={iconOnly ? "true" : undefined}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span className="ds-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function ButtonGroup({ children, label }: { children: ReactNode; label: string }) {
  return <div className="ds-btn-group" role="group" aria-label={label}>{children}</div>;
}

/* ---------------- Surfaces ---------------- */
export function Card({
  title, subtitle, actions, children, footer, flush, pad, className, span, prov, machine, eyebrow, as: As = "section", ...rest
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; footer?: ReactNode;
  flush?: boolean; pad?: "none" | "tight" | "default"; className?: string; span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  /** Material on the leading edge: where this card's content came from. */
  prov?: Provenance;
  /** A surface an AI employee is working on; carries the machine gradient. */
  machine?: boolean;
  eyebrow?: string;
  as?: "section" | "article" | "div";
} & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <As
      className={`ds-card${span ? ` ds-col-${span}` : ""}${className ? ` ${className}` : ""}`}
      data-prov={prov}
      data-machine={machine ? "true" : undefined}
      {...rest}
    >
      {(title || actions) && (
        <header className="ds-card-head">
          <div className="ds-grow">
            {eyebrow && <div className="ds-eyebrow" style={{ marginBottom: 3 }}>{eyebrow}</div>}
            {typeof title === "string" ? <h2>{title}</h2> : title}
            {subtitle && <div className="ds-card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="ds-row ds-gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && (
        flush ? children : <div className="ds-card-body" data-pad={pad === "default" ? undefined : pad}>{children}</div>
      )}
      {footer && <footer className="ds-card-foot">{footer}</footer>}
    </As>
  );
}

export function Panel({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-panel${className ? ` ${className}` : ""}`} {...rest}>{children}</div>;
}

export function Stack({ gap = 4, children, className, ...rest }: { gap?: 1 | 2 | 3 | 4 | 5 | 6 } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-stack ds-gap-${gap}${className ? ` ${className}` : ""}`} {...rest}>{children}</div>;
}

export function Row({ gap = 2, wrap, children, className, ...rest }: { gap?: 1 | 2 | 3 | 4 | 5 | 6; wrap?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-row ds-gap-${gap}${wrap ? " ds-wrap" : ""}${className ? ` ${className}` : ""}`} {...rest}>{children}</div>;
}

export function Grid({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ds-grid${className ? ` ${className}` : ""}`} {...rest}>{children}</div>;
}

/* ---------------- Status ---------------- */
export function Pill({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className="ds-pill" data-tone={tone === "neutral" ? undefined : tone}>
      {dot && <i className="ds-pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children, actions }: { tone?: Tone; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ds-notice" data-tone={tone === "neutral" ? undefined : tone} role={tone === "danger" ? "alert" : "status"}>
      <div className="ds-grow">
        {title && <strong className="ds-notice-title">{title}</strong>}
        {children}
      </div>
      {actions && <div className="ds-row ds-gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Stats ---------------- */
export function Stat({
  label, value, meta, delta, unavailable, onClick, prov,
}: {
  label: string; value: ReactNode; meta?: ReactNode;
  delta?: { dir: "up" | "down" | "flat"; text: string };
  unavailable?: boolean; onClick?: () => void;
  /** Where the figure came from. Defaults to unknown when it is unavailable. */
  prov?: Provenance;
}) {
  const material = prov ?? (unavailable ? "unknown" : undefined);
  const body = (
    <>
      <span className="ds-stat-label">{label}</span>
      <span className="ds-stat-value" data-unavailable={unavailable ? "true" : undefined}>{value}</span>
      <span className="ds-row ds-gap-2">
        {delta && <span className="ds-stat-delta" data-dir={delta.dir}>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "■"} {delta.text}</span>}
        {meta && <span className="ds-stat-meta">{meta}</span>}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="ds-stat" data-prov={material} onClick={onClick} style={{ textAlign: "start", cursor: "pointer" }}>
        {body}
      </button>
    );
  }
  return <div className="ds-stat" data-prov={material}>{body}</div>;
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="ds-statrow">{children}</div>;
}

/* ---------------- Empty / loading ---------------- */
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ds-empty">
      {icon && <div className="ds-empty-icon" aria-hidden="true">{icon}</div>}
      <h3>{title}</h3>
      {children && <p className="ds-prose">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius }: { height?: number | string; width?: number | string; radius?: number }) {
  return <div className="ds-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

/* ---------------- Small parts ---------------- */
/** Every hue carries white text at 4.5:1 or better; checked with axe. */
const AVATAR_HUES = ["#234fe8", "#0d7c76", "#a8441c", "#5b4dff", "#a33a63", "#1b359b", "#5a6478"];

export function Avatar({ name, kind = "human", size = "md" }: { name: string; kind?: "human" | "ai"; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span
      className="ds-avatar"
      data-kind={kind}
      data-size={size === "md" ? undefined : size}
      style={{ background: AVATAR_HUES[hash % AVATAR_HUES.length] }}
      aria-hidden="true"
      title={name}
    >
      {initials}
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="ds-crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="ds-row ds-gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ds-kbd">{children}</kbd>;
}

export function Meter({ value, max = 100, tone, label }: { value: number; max?: number; tone?: "danger" | "warning" | "success"; label?: string }) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="ds-meter" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <i style={{ width: `${pct}%` }} data-tone={tone} />
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="ds-segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children, label }: { children: ReactNode; label: string }) {
  return <div className="ds-toolbar" role="toolbar" aria-label={label}>{children}</div>;
}

export function ToolbarSeparator() {
  return <span className="ds-toolbar-sep" aria-hidden="true" />;
}

export function Tool({
  active, label, icon, onClick, disabled, pressed, children,
}: { active?: boolean; label: string; icon?: ReactNode; onClick?: () => void; disabled?: boolean; pressed?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      className="ds-tool"
      title={label}
      aria-label={children ? undefined : label}
      aria-pressed={pressed ?? active}
      data-active={active ? "true" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

export function Properties({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="ds-props">
      {rows.map((row) => (
        <div key={row.label} style={{ display: "contents" }}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InspectorSection({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="ds-inspector-section">
      <div className="ds-row ds-gap-2">
        <h4 className="ds-grow">{title}</h4>
        {actions}
      </div>
      {children}
    </section>
  );
}
