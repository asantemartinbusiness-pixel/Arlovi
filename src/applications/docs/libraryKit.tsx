import { useState, type ReactNode } from "react";
import { Segmented } from "@/design-system";
import "./libraryKit.css";

/* ====================================================================== *
 * Library kit shared by the Docs, Sheets and Present libraries: a one-line
 * summary strip, a table/cards view switch, and a compact record card with
 * Open / Duplicate / Share actions. Pure presentation; each library keeps
 * its own data and mutations.
 * ====================================================================== */

export interface StripItem { label: string; value: ReactNode; tone?: "warning" | "danger" }

/** One line of real counts (replaces the stat-tile row on library screens). */
export function LibraryStrip({ label, items, children }: { label: string; items: StripItem[]; children?: ReactNode }) {
  return (
    <div className="lk-strip" role="group" aria-label={label}>
      <dl className="lk-strip-items">
        {items.map((item) => (
          <div key={item.label} className="lk-stat" data-tone={item.tone}>
            <dd>{item.value}</dd>
            <dt>{item.label}</dt>
          </div>
        ))}
      </dl>
      {children && <div className="lk-strip-actions">{children}</div>}
    </div>
  );
}

export type LibraryView = "table" | "cards";

/** Remembers the person's view per library; storage failures fall back to the default. */
export function useLibraryView(key: string, fallback: LibraryView = "table"): [LibraryView, (next: LibraryView) => void] {
  const storageKey = `arlovi:library-view:${key}`;
  const [view, setView] = useState<LibraryView>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "cards" || stored === "table" ? stored : fallback;
    } catch { return fallback; }
  });
  const set = (next: LibraryView) => {
    setView(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* storage is optional */ }
  };
  return [view, set];
}

export function ViewToggle({ value, onChange, label }: { value: LibraryView; onChange: (next: LibraryView) => void; label: string }) {
  return (
    <Segmented<LibraryView>
      label={label}
      value={value}
      onChange={onChange}
      options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]}
    />
  );
}

export interface RecordCardProps {
  id: string;
  title: string;
  icon?: ReactNode;
  status?: ReactNode;
  meta: ReactNode[];
  preview?: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  actions: ReactNode;
}

/** Compact record card: the title opens it, the footer carries open / duplicate / share. */
export function RecordCardGrid({ cards, label }: { cards: RecordCardProps[]; label: string }) {
  return (
    <ul className="lk-cards" aria-label={label}>
      {cards.map((card) => (
        <li key={card.id} className="lk-card" data-selected={card.selected || undefined}>
          <div className="lk-card-head">
            {card.icon && <span className="lk-card-icon" aria-hidden="true">{card.icon}</span>}
            <button type="button" className="lk-card-title" onClick={card.onSelect} onDoubleClick={card.onOpen} aria-pressed={card.selected}>{card.title}</button>
            {card.status}
          </div>
          {card.preview && <div className="lk-card-preview">{card.preview}</div>}
          <div className="lk-card-meta">{card.meta.filter(Boolean).map((item, index) => <span key={index}>{item}</span>)}</div>
          <div className="lk-card-actions">{card.actions}</div>
        </li>
      ))}
    </ul>
  );
}
