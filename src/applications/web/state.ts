import { create } from "zustand";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import type { BlockType, SiteModel } from "./model";

export type Breakpoint = "mobile" | "tablet" | "desktop";

export const BREAKPOINTS: Record<Breakpoint, { label: string; width: number; note: string }> = {
  mobile: { label: "Mobile", width: 390, note: "One column; the menu stacks." },
  tablet: { label: "Tablet", width: 768, note: "Two columns; headings step down." },
  desktop: { label: "Desktop", width: 1280, note: "Full column count." },
};

interface UndoEntry { siteId: string; body: unknown; label: string }

interface WebUi {
  pageId: string;
  breakpoint: Breakpoint;
  selectedBlockId: string;
  lastInserted: BlockType | "";
  undo: UndoEntry[];
  setPage: (id: string) => void;
  setBreakpoint: (value: Breakpoint) => void;
  cycleBreakpoint: () => Breakpoint;
  select: (id: string) => void;
  noteInsert: (type: BlockType) => void;
  pushUndo: (entry: UndoEntry) => void;
  popUndo: (siteId: string) => UndoEntry | undefined;
  undoDepth: (siteId: string) => number;
}

const ORDER: Breakpoint[] = ["mobile", "tablet", "desktop"];

export const useWebUi = create<WebUi>((set, get) => ({
  pageId: "",
  breakpoint: "desktop",
  selectedBlockId: "",
  lastInserted: "",
  undo: [],
  setPage: (id) => set({ pageId: id, selectedBlockId: "" }),
  setBreakpoint: (value) => set({ breakpoint: value }),
  cycleBreakpoint: () => {
    const next = ORDER[(ORDER.indexOf(get().breakpoint) + 1) % ORDER.length];
    set({ breakpoint: next });
    return next;
  },
  select: (id) => set({ selectedBlockId: id }),
  noteInsert: (type) => set({ lastInserted: type }),
  pushUndo: (entry) => set((state) => ({ undo: [entry, ...state.undo].slice(0, 20) })),
  popUndo: (siteId) => {
    const found = get().undo.find((entry) => entry.siteId === siteId);
    if (!found) return undefined;
    set((state) => ({ undo: state.undo.filter((entry) => entry !== found) }));
    return found;
  },
  undoDepth: (siteId) => get().undo.filter((entry) => entry.siteId === siteId).length,
}));

/** Every structural write goes through here so undo and the audit event exist. */
export async function saveSite(context: ScreenContext, record: Rec, next: SiteModel, label: string): Promise<boolean> {
  if (!(await context.mutate.patch(record.id, { body: next }, { expectRevision: record.revision, event: label }))) return false;
  useWebUi.getState().pushUndo({ siteId: record.id, body: record.body, label });
  return true;
}

export async function undoSite(context: ScreenContext, record: Rec): Promise<boolean> {
  const entry = useWebUi.getState().popUndo(record.id);
  if (!entry) return false;
  return Boolean(await context.mutate.patch(record.id, { body: entry.body }, { event: `Undid: ${entry.label}` }));
}
