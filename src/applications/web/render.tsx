import type { CSSProperties } from "react";
import type { Block, SiteModel, Theme } from "./model";

/* ====================================================================== *
 * Block renderer. The same model the HTML export walks, drawn in React so
 * the canvas is editable. `width` is the breakpoint width in pixels and
 * genuinely changes the layout: column counts and type scale are computed
 * from it, so switching breakpoint re-renders rather than re-labels.
 * ====================================================================== */

export function columnsAt(width: number, requested: number): number {
  if (width < 640) return 1;
  if (width < 900) return Math.min(2, requested);
  return Math.max(1, Math.min(4, requested));
}

export function scaleAt(width: number, base: number): number {
  if (width < 640) return base * 1.6;
  if (width < 900) return base * 1.9;
  return base * 2.4;
}

function toneStyle(block: Block, theme: Theme): CSSProperties {
  if (block.props.tone === "accent") return { background: theme.accent, color: "#fff" };
  if (block.props.tone === "soft") return { background: "color-mix(in srgb, currentColor 7%, transparent)" };
  return {};
}

const PAD = { tight: 14, normal: 24, roomy: 40 } as const;

export function BlockView({
  block, width, theme, formName, selected, onSelect, onEdit,
}: {
  block: Block;
  width: number;
  theme: Theme;
  formName?: string;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: (patch: Partial<Block["props"]>) => void;
}) {
  const { props } = block;
  const base = (theme.scale / 100) * 16;
  const cols = columnsAt(width, props.columns);
  const pad = width < 640 ? Math.max(12, PAD[props.padding] - 8) : PAD[props.padding];
  const style: CSSProperties = {
    ...toneStyle(block, theme),
    padding: pad,
    textAlign: props.align === "center" ? "center" : "start",
    fontSize: base,
    borderRadius: 0,
  };

  const heading = block.type === "hero"
    ? <h1 style={{ fontSize: scaleAt(width, base) }}>{editable("title")}</h1>
    : props.title || onEdit ? <h2 style={{ fontSize: base * 1.4 }}>{editable("title")}</h2> : null;

  function editable(key: "title" | "body") {
    const value = props[key];
    if (!onEdit) return value;
    return (
      <span
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        aria-label={`${block.type} ${key}`}
        data-edit={`${block.id}-${key}`}
        style={{ outline: "none", display: "inline-block", minWidth: 40, borderRadius: 4 }}
        onBlur={(event) => {
          const next = event.currentTarget.textContent ?? "";
          if (next !== value) onEdit({ [key]: next } as Partial<Block["props"]>);
        }}
      >
        {value}
      </span>
    );
  }

  const cta = props.ctaLabel ? (
    <span style={{
      display: "inline-block", marginTop: 8, padding: "9px 16px", borderRadius: theme.radius,
      background: props.tone === "accent" ? "#fff" : theme.ink,
      color: props.tone === "accent" ? theme.accent : theme.paper,
      fontWeight: 600, fontSize: base * 0.9,
    }}>{props.ctaLabel}</span>
  ) : null;

  let inner: React.ReactNode = null;
  if (block.type === "hero" || block.type === "text") {
    inner = <>{heading}<p style={{ maxWidth: props.align === "center" ? "60ch" : undefined, marginInline: props.align === "center" ? "auto" : undefined }}>{editable("body")}</p>{cta}</>;
  } else if (block.type === "columns") {
    inner = <>{heading}<div className="t6-render-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {props.items.map((item, index) => <div key={`${item}-${index}`} className="t6-render-tile" style={props.tone === "accent" ? { background: "color-mix(in srgb, #fff 18%, transparent)" } : undefined}><strong>{item}</strong></div>)}
    </div></>;
  } else if (block.type === "image") {
    inner = <>{heading}<figure style={{ margin: 0 }}><div className="t6-render-img" style={{ borderRadius: theme.radius }} role="img" aria-label={props.alt || "Image with no alternative description"}>{props.alt || "No alternative description"}</div>{props.body && <figcaption style={{ fontSize: base * 0.85, marginTop: 6 }}>{props.body}</figcaption>}</figure></>;
  } else if (block.type === "gallery") {
    inner = <>{heading}<div className="t6-render-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {props.items.map((item, index) => (
        <figure key={`${item}-${index}`} style={{ margin: 0 }}>
          <div className="t6-render-img" style={{ borderRadius: theme.radius, minHeight: width < 640 ? 76 : 96 }} role="img" aria-label={item}>{item}</div>
          <figcaption style={{ fontSize: base * 0.8, marginTop: 4 }}>{item}</figcaption>
        </figure>
      ))}
    </div></>;
  } else if (block.type === "pricing") {
    inner = <>{heading}<div className="t6-render-cols" style={{ gridTemplateColumns: `repeat(${Math.min(cols, Math.max(1, props.plans.length))}, minmax(0,1fr))` }}>
      {props.plans.map((plan) => (
        <div key={plan.name} className="t6-render-price" style={{ borderRadius: theme.radius }}>
          <strong style={{ display: "block" }}>{plan.name}</strong>
          <span style={{ fontSize: base * 1.5, fontWeight: 700, display: "block" }}>{plan.price}</span>
          <span style={{ fontSize: base * 0.8, opacity: 0.7 }}>{plan.note}</span>
        </div>
      ))}
    </div></>;
  } else if (block.type === "form") {
    inner = <>{heading}<p>{editable("body")}</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 380, marginInline: props.align === "center" ? "auto" : undefined, textAlign: "start" }}>
        {(props.items.length ? props.items : ["Name", "Email", "Message"]).map((label, index) => (
          <label key={`${label}-${index}`} style={{ display: "grid", gap: 3, fontSize: base * 0.85, fontWeight: 600 }}>
            {label}
            <span style={{ height: 34, border: "1px solid color-mix(in srgb, currentColor 28%, transparent)", borderRadius: theme.radius / 2, background: "#fff" }} />
          </label>
        ))}
        <span style={{ marginTop: 4, padding: "9px 14px", borderRadius: theme.radius, background: theme.ink, color: theme.paper, fontWeight: 600, textAlign: "center", fontSize: base * 0.9 }}>{props.ctaLabel || "Send"}</span>
      </div>
      <p style={{ fontSize: base * 0.75, opacity: 0.7, marginTop: 8 }}>
        {formName ? `Submissions are written to ${formName} in this workspace.` : "No form is bound, so a submission would have nowhere to go."}
      </p>
    </>;
  } else {
    inner = <div className="t6-render-foot" style={{ margin: -pad, padding: pad }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: props.align === "center" ? "center" : "flex-start", marginBottom: 6 }}>
        {props.items.map((item, index) => <span key={`${item}-${index}`} style={{ fontWeight: 600 }}>{item}</span>)}
      </div>
      {props.body && <p style={{ fontSize: base * 0.85 }}>{props.body}</p>}
    </div>;
  }

  return (
    <div
      className="t6-render-block"
      style={style}
      data-selected={selected ? "true" : undefined}
      data-block={block.type}
      onMouseDown={onSelect}
    >
      {inner}
    </div>
  );
}

export function SiteNavView({ site, width }: { site: SiteModel; width: number }) {
  const stacked = width < 640;
  return (
    <nav
      aria-label="Site menu"
      style={{
        display: "flex", flexDirection: stacked ? "column" : "row", gap: stacked ? 6 : 16,
        padding: stacked ? 12 : "14px 20px", borderBottom: "1px solid color-mix(in srgb, currentColor 12%, transparent)",
        fontSize: (site.theme.scale / 100) * 15, fontWeight: 600,
      }}
    >
      {site.nav.header.length === 0 && <span style={{ opacity: 0.55, fontWeight: 400 }}>No menu links yet</span>}
      {site.nav.header.map((link) => <span key={link.id}>{link.label}</span>)}
    </nav>
  );
}

export function PageView({
  site, pageId, width, selectedId, onSelect, onEdit, formNames,
}: {
  site: SiteModel; pageId: string; width: number; selectedId?: string;
  onSelect?: (id: string) => void;
  onEdit?: (blockId: string, patch: Partial<Block["props"]>) => void;
  formNames: Record<string, string>;
}) {
  const page = site.pages.find((item) => item.id === pageId) ?? site.pages[0];
  return (
    <div className="t6-render" style={{ background: site.theme.paper, color: site.theme.ink, fontFamily: site.theme.font === "Inter" ? "Inter, sans-serif" : site.theme.font === "Source Serif" ? "Georgia, serif" : "ui-monospace, monospace" }}>
      <SiteNavView site={site} width={width} />
      {page.blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          width={width}
          theme={site.theme}
          formName={formNames[block.props.formId]}
          selected={block.id === selectedId}
          onSelect={onSelect ? () => onSelect(block.id) : undefined}
          onEdit={onEdit ? (patch) => onEdit(block.id, patch) : undefined}
        />
      ))}
    </div>
  );
}
