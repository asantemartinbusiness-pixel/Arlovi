/* ====================================================================== *
 * Responsive layout of a designed screen. The generated app uses the same
 * twelve-column grid as this workspace, which collapses to a single
 * column under 900px. This packs components into rows exactly that way,
 * so the device preview is computed rather than drawn by eye.
 * ====================================================================== */

export const DEVICES = {
  mobile: { label: "Mobile", width: 390 },
  tablet: { label: "Tablet", width: 768 },
  desktop: { label: "Desktop", width: 1280 },
} as const;
export type Device = keyof typeof DEVICES;

export const COLLAPSE_BELOW = 900;

export interface Placed { id: string; title: string; span: number; column: number }

export function layoutRows(components: { id: string; title: string; span: number }[], width: number): Placed[][] {
  const rows: Placed[][] = [];
  let current: Placed[] = [];
  let used = 0;
  for (const component of components) {
    const span = width < COLLAPSE_BELOW ? 12 : Math.max(1, Math.min(12, component.span));
    if (used + span > 12 && current.length) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push({ id: component.id, title: component.title, span, column: used + 1 });
    used += span;
  }
  if (current.length) rows.push(current);
  return rows;
}

/** Plain-language notes about what changes at a width. */
export function layoutNotes(components: { span: number }[], width: number): string[] {
  const notes: string[] = [];
  if (width < COLLAPSE_BELOW) {
    const side = components.filter((component) => component.span < 12).length;
    if (side) notes.push(`${side} component${side === 1 ? "" : "s"} that sit side by side on desktop stack full width here.`);
  } else {
    const rows = layoutRows(components.map((component, index) => ({ id: String(index), title: "", span: component.span })), width);
    const gaps = rows.filter((row) => row.reduce((sum, item) => sum + item.span, 0) < 12).length;
    if (gaps) notes.push(`${gaps} row${gaps === 1 ? " does" : "s do"} not fill all twelve columns, leaving space on the right.`);
  }
  return notes;
}
