import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

/**
 * Roving-tabindex tab strip. Each tab owns real content: the caller renders a
 * distinct panel per tab id rather than filtering one shared list.
 */
export function Tabs({
  items, value, onChange, label, trailing,
}: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string; trailing?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === value);
    if (index < 0) return;
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % enabled.length;
    if (event.key === "ArrowLeft") next = (index - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(enabled[next].id);
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(enabled[next].id)}"]`)?.focus();
    });
  }
  return (
    <div className="ds-row ds-gap-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
      <div className="ds-tabs ds-grow" role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown} style={{ border: 0 }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab={item.id}
            id={`tab-${item.id}`}
            className="ds-tab"
            aria-selected={item.id === value}
            aria-controls={`panel-${item.id}`}
            tabIndex={item.id === value ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {typeof item.count === "number" && <span className="ds-tab-count">{item.count}</span>}
          </button>
        ))}
      </div>
      {trailing && <div className="ds-row ds-gap-2" style={{ paddingBottom: 6 }}>{trailing}</div>}
    </div>
  );
}

export function TabPanel({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} style={{ outline: "none", ...style }}>
      {children}
    </div>
  );
}
