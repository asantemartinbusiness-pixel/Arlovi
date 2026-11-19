import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { Tone } from "./primitives";
import { useOverlayInFlight } from "./overlays";

/**
 * Overlay kit — information-hierarchy primitives for modal and drawer bodies.
 * Action convention: primary first on the left, secondary beside it, and the
 * destructive / dismiss action pushed to the end. Confirm dialogs keep
 * [Cancel] … [Confirm].
 */

/** Width presets for `Modal` / `Drawer` (`width` prop, in CSS pixels). */
export const OVERLAY_WIDTH = { compact: 440, form: 520, record: 640, wide: 760, modal: 560 } as const;
export type OverlayWidth = keyof typeof OVERLAY_WIDTH;

export type OverlayTone = "neutral" | "warning" | "danger" | "info" | "success";

/** Compact titled section inside an overlay body. */
export function OverlaySection({
  title, hint, actions, tone = "neutral", flush = false, children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  tone?: OverlayTone;
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="ds-ov-section" data-tone={tone} data-flush={flush || undefined}>
      <header className="ds-ov-section-head">
        <div className="ds-ov-section-titles">
          <h3 className="ds-ov-section-title">{title}</h3>
          {hint && <p className="ds-ov-section-hint">{hint}</p>}
        </div>
        {actions && <div className="ds-ov-section-actions">{actions}</div>}
      </header>
      <div className="ds-ov-section-body">{children}</div>
    </section>
  );
}

/** @deprecated alias of Fact. */
export type FactItem = Fact;

/** A labelled value; shared with `KeyValueList` in the page kit. */
export interface Fact {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  tone?: Tone;
  hint?: ReactNode;
}

/** Compact label-over-value grid for amounts, dates and statuses. */
export function FactGrid({
  items, columns = 2, dense = false,
}: { items: Fact[]; columns?: 2 | 3 | 4; dense?: boolean }) {
  return (
    <div className="ds-ov-facts-wrap">
      <dl className="ds-ov-facts" data-columns={columns} data-dense={dense || undefined}>
        {items.map((item, index) => (
          <div className="ds-ov-fact" key={index} data-tone={item.tone}>
            <dt>{item.label}</dt>
            <dd data-mono={item.mono || undefined}>{item.value}</dd>
            {item.hint && <dd className="ds-ov-fact-hint">{item.hint}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Record identity block at the top of record drawers. */
export function OverlaySummary({
  eyebrow, title, status, meta, avatar, actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode[];
  avatar?: ReactNode;
  actions?: ReactNode;
}) {
  const parts = (meta ?? []).filter(part => part !== null && part !== undefined && part !== false && part !== "");
  return (
    <div className="ds-ov-summary">
      {avatar && <div className="ds-ov-summary-avatar">{avatar}</div>}
      <div className="ds-ov-summary-main">
        {eyebrow && <span className="ds-ov-summary-eyebrow">{eyebrow}</span>}
        <div className="ds-ov-summary-line">
          <strong className="ds-ov-summary-title">{title}</strong>
          {status && <span className="ds-ov-summary-status">{status}</span>}
        </div>
        {parts.length > 0 && (
          <div className="ds-ov-summary-meta">
            {parts.map((part, index) => <span key={index}>{part}</span>)}
          </div>
        )}
      </div>
      {actions && <div className="ds-ov-summary-actions">{actions}</div>}
    </div>
  );
}

/**
 * Footer convention. variant "form" (default): [primary][secondary] ... [end].
 * variant "confirm": [end/Cancel] ... [primary], like ConfirmModal.
 * The primary button is disabled and shown busy while the overlay is in flight.
 */
export function OverlayActions({
  primary, secondary, end, variant = "form", busy,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  end?: ReactNode;
  variant?: "form" | "confirm";
  busy?: boolean;
}) {
  const inFlight = useOverlayInFlight();
  const working = busy ?? inFlight;
  let main = primary;
  if (working && isValidElement(primary)) {
    main = cloneElement(primary as ReactElement<{ busy?: boolean; disabled?: boolean }>, { busy: true, disabled: true });
  }
  if (variant === "confirm") {
    return (
      <div className="ds-ov-actions" data-variant="confirm">
        {end}{secondary}
        <span className="ds-grow" aria-hidden="true" />
        {main}
      </div>
    );
  }
  return (
    <div className="ds-ov-actions" data-variant="form">
      {main}
      {secondary}
      {end && <><span className="ds-grow" aria-hidden="true" />{end}</>}
    </div>
  );
}
