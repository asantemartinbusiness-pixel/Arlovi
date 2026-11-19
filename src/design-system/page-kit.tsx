import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "./primitives";
import type { Fact } from "./overlay-kit";
import "./page-kit.css";

/**
 * Page kit: the shared building blocks for record and long-form pages.
 * Every piece has a `.pk-*` class contract (see page-kit.css) so applications
 * inherit the compact hierarchy instead of re-deriving it.
 */

export interface RecordHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode[];
  avatar?: ReactNode;
  actions?: ReactNode;
}

/**
 * The single identity block of a record or detail page. On a screen that
 * declares `ScreenDef.record` it REPLACES the generic page head: the title is
 * the page h1 (`level={1}`), the eyebrow names the screen and the screen
 * actions sit in the actions slot. `flat` drops the card chrome so the block
 * lives directly in `.pg-head`.
 */
export function RecordHeader({
  eyebrow, title, subtitle, status, meta, avatar, actions, level = 2, flat,
}: RecordHeaderProps & { level?: 1 | 2; flat?: boolean }) {
  const Heading = level === 1 ? "h1" : "h2";
  const facts = (meta ?? []).filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  return (
    <div className="pk-rh" data-flat={flat ? "true" : undefined}>
      <div className="pk-rh-main">
        {avatar && <div className="pk-rh-avatar">{avatar}</div>}
        <div className="pk-rh-id">
          {eyebrow && <div className="pk-rh-eyebrow ds-eyebrow">{eyebrow}</div>}
          <div className="pk-rh-titlerow">
            <Heading className="pk-rh-title">{title}</Heading>
            {status && <span className="pk-rh-status">{status}</span>}
          </div>
          {subtitle && <div className="pk-rh-subtitle">{subtitle}</div>}
          {facts.length > 0 && (
            <ul className="pk-rh-meta" aria-label="Details">
              {facts.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          )}
        </div>
        {actions && <div className="pk-rh-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** A Card-based section with the standard compact head. */
export function PageSection({
  title, hint, actions, children, flush, span,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
}) {
  return (
    <Card className="pk-section" title={title} subtitle={hint} actions={actions} pad="none" span={span}>
      <div className="pk-section-body" data-flush={flush ? "true" : undefined}>{children}</div>
    </Card>
  );
}

/**
 * In-page section switcher: a segmented pill control (deliberately not the
 * tab-strip style) that scrolls horizontally on narrow screens. The selected
 * section is mirrored in the URL as `?section=` (history replaced).
 */
export function SectionNav({
  items, value, onChange, label = "Sections",
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("section");
  useEffect(() => {
    if (fromUrl && fromUrl !== value && items.some((item) => item.id === fromUrl)) onChange(fromUrl);
    // Adopt the URL only when it changes (deep link, back/forward), not on every value change.
  }, [fromUrl]);
  function select(id: string) {
    onChange(id);
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("section", id); return next; }, { replace: true });
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const index = items.findIndex((item) => item.id === value);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(items[next].id);
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-section="${CSS.escape(items[next].id)}"]`)?.focus();
    });
  }
  return (
    <nav className="pk-sectionnav" aria-label={label}>
      <div className="pk-sectionnav-track" ref={ref} onKeyDown={onKeyDown}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-section={item.id}
            className="pk-sectionnav-item"
            aria-pressed={item.id === value}
            tabIndex={item.id === value ? 0 : -1}
            onClick={() => select(item.id)}
          >
            {item.label}
            {typeof item.count === "number" && <span className="pk-sectionnav-count">{item.count}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Compact definition list (shares the overlay-kit fact shape). Replaces ad-hoc `.ds-props` tables. */
export function KeyValueList({
  items, columns = 1,
}: {
  items: Fact[];
  columns?: 1 | 2;
}) {
  return (
    <div className="pk-kv-box">
      <dl className="pk-kv" data-columns={columns}>
        {items.map((item, index) => (
          <div className="pk-kv-row" key={index} data-tone={item.tone}>
            <dt className="pk-kv-label">{item.label}</dt>
            <dd className="pk-kv-value" data-mono={item.mono ? "true" : undefined}>
              {item.value ?? "\u2014"}
              {item.hint && <span className="pk-kv-hint">{item.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
