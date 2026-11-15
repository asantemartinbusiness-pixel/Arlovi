/* ====================================================================== *
 * The presenting session: timer, audience display, rehearsal laps and live
 * annotations. Held here rather than in the presenter panel so the screen's
 * actions (present, advance, annotate, end) drive the same session the
 * panels show. Annotations last for the session and are never saved into
 * the deck; they are drawn on the audience display only while presenting.
 * ====================================================================== */

import { createStore } from "@/applications/visual/kit";
import type { DeckEditor } from "./state";

export interface PresenterSession {
  running: boolean;
  elapsed: number;
  fullscreen: boolean;
  laps: Record<string, number>;
  lapStart: number;
  annotations: Record<string, { id: string; text: string; at: string }[]>;
  lastEnded?: { at: string; elapsed: number; slides: number };
}

export const presenterUi = createStore<PresenterSession>({ running: false, elapsed: 0, fullscreen: false, laps: {}, lapStart: 0, annotations: {} });

export function visibleSlides(editor: DeckEditor) {
  return editor.deck.slides.filter((slide) => !slide.hidden);
}

/** Move through the visible slides, recording the time spent on the one being left. */
export function advanceSlides(editor: DeckEditor, delta: number): boolean {
  const visible = visibleSlides(editor);
  const position = Math.max(0, visible.findIndex((slide) => slide.id === editor.slide.id));
  const current = visible[position];
  const target = visible[Math.max(0, Math.min(visible.length - 1, position + delta))];
  if (!current || !target || target.id === current.id) return false;
  if (delta > 0) {
    presenterUi.set((state) => ({ ...state, laps: { ...state.laps, [current.id]: state.elapsed - state.lapStart }, lapStart: state.elapsed }));
  }
  editor.selectSlide(editor.deck.slides.findIndex((slide) => slide.id === target.id));
  return true;
}

export function endPresenting(editor: DeckEditor | undefined): void {
  presenterUi.set((state) => {
    const current = editor?.slide;
    const laps = current && state.running ? { ...state.laps, [current.id]: state.elapsed - state.lapStart } : state.laps;
    return { ...state, running: false, fullscreen: false, laps, lastEnded: { at: new Date().toISOString(), elapsed: state.elapsed, slides: Object.keys(laps).length } };
  });
}
