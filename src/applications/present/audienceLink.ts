/* ====================================================================== *
 * Two-window presenting. The presenter keeps notes, timer and the next
 * slide in this window; the audience window is a second browser window on
 * the same deck that shows the slide only. The two talk over a
 * BroadcastChannel named after the deck, so either window can reload and
 * pick the session back up: the audience window says hello, the presenter
 * answers with the current state. Nothing leaves this browser.
 * ====================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudienceState {
  slideId: string;
  position: number;
  total: number;
  blackout: boolean;
  annotations: string[];
}

export type LinkMessage =
  | { type: "hello" }
  | { type: "sync" }
  | { type: "bye"; from: "audience" | "presenter" }
  | { type: "state"; state: AudienceState }
  | { type: "nav"; action: "next" | "back" | "first" | "last" | "blank" | "goto"; to?: number };

export function channelName(deckId: string): string {
  return `arlovi-present:${deckId}`;
}

/** The audience window is the Presenter Mode route with `display=window`. */
export function audienceUrl(orgSlug: string, deckId: string): string {
  return `/o/${orgSlug}/present/decks/${encodeURIComponent(deckId)}/present?tab=Audience&display=window`;
}

export function isAudienceWindow(search: string): boolean {
  return new URLSearchParams(search).get("display") === "window";
}

/** Map a key press in either window to the navigation it asks for. */
export function keyToNav(key: string): LinkMessage | null {
  if (["ArrowRight", "ArrowDown", " ", "PageDown", "n", "N"].includes(key)) return { type: "nav", action: "next" };
  if (["ArrowLeft", "ArrowUp", "PageUp", "p", "P"].includes(key)) return { type: "nav", action: "back" };
  if (key === "Home") return { type: "nav", action: "first" };
  if (key === "End") return { type: "nav", action: "last" };
  if (key === "b" || key === "B" || key === ".") return { type: "nav", action: "blank" };
  return null;
}

/** How far to move for a navigation request, given the current position (0-based) and slide count. */
export function navDelta(message: Extract<LinkMessage, { type: "nav" }>, position: number, total: number): number {
  switch (message.action) {
    case "next": return 1;
    case "back": return -1;
    case "first": return -position;
    case "last": return total - 1 - position;
    case "goto": return Math.max(0, Math.min(total - 1, (message.to ?? 1) - 1)) - position;
    default: return 0;
  }
}

function openChannel(deckId: string | undefined): BroadcastChannel | null {
  if (!deckId || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(channelName(deckId));
}

/**
 * Presenter side: opens the audience window, publishes the state whenever it
 * changes (and whenever an audience window says hello) and hands navigation
 * requests from the audience window's keyboard to `onNav`.
 */
export function usePresenterLink(deckId: string | undefined, state: AudienceState | null, onNav: (message: Extract<LinkMessage, { type: "nav" }>) => void) {
  const channel = useRef<BroadcastChannel | null>(null);
  const popup = useRef<Window | null>(null);
  const latest = useRef(state);
  const navRef = useRef(onNav);
  const [connected, setConnected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  latest.current = state;
  navRef.current = onNav;

  useEffect(() => {
    const bc = openChannel(deckId);
    channel.current = bc;
    if (!bc) return;
    bc.onmessage = (event: MessageEvent<LinkMessage>) => {
      const message = event.data;
      if (message.type === "hello") {
        setConnected(true);
        if (latest.current) bc.postMessage({ type: "state", state: latest.current } satisfies LinkMessage);
      } else if (message.type === "bye" && message.from === "audience") {
        setConnected(false);
      } else if (message.type === "nav") {
        setConnected(true);
        navRef.current(message);
      }
    };
    /* Ask an audience window that is already open (this window reloaded) to say hello again. */
    bc.postMessage({ type: "sync" } satisfies LinkMessage);
    return () => { bc.close(); channel.current = null; };
  }, [deckId]);

  const serialised = state ? JSON.stringify(state) : "";
  useEffect(() => {
    if (!serialised) return;
    channel.current?.postMessage({ type: "state", state: JSON.parse(serialised) as AudienceState } satisfies LinkMessage);
  }, [serialised]);

  /* A window closed from its title bar cannot always say goodbye. */
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => { if (popup.current?.closed) { popup.current = null; setConnected(false); } }, 1000);
    return () => window.clearInterval(id);
  }, [connected]);

  const open = useCallback((url: string, name: string) => {
    const opened = window.open(url, name, "popup=yes,width=1280,height=760");
    if (!opened) { setBlocked(true); return false; }
    setBlocked(false);
    popup.current = opened;
    opened.focus();
    return true;
  }, []);

  const close = useCallback(() => {
    channel.current?.postMessage({ type: "bye", from: "presenter" } satisfies LinkMessage);
    popup.current?.close();
    popup.current = null;
    setConnected(false);
  }, []);

  return { connected, blocked, open, close, supported: typeof BroadcastChannel !== "undefined" };
}

/** Audience side: says hello, follows the presenter's state and sends navigation back. */
export function useAudienceLink(deckId: string | undefined) {
  const channel = useRef<BroadcastChannel | null>(null);
  const [state, setState] = useState<AudienceState | null>(null);
  const [presenterGone, setPresenterGone] = useState(false);

  useEffect(() => {
    const bc = openChannel(deckId);
    channel.current = bc;
    if (!bc) return;
    bc.onmessage = (event: MessageEvent<LinkMessage>) => {
      const message = event.data;
      if (message.type === "state") { setState(message.state); setPresenterGone(false); }
      else if (message.type === "sync") bc.postMessage({ type: "hello" } satisfies LinkMessage);
      else if (message.type === "bye" && message.from === "presenter") setPresenterGone(true);
    };
    bc.postMessage({ type: "hello" } satisfies LinkMessage);
    const leave = () => bc.postMessage({ type: "bye", from: "audience" } satisfies LinkMessage);
    window.addEventListener("pagehide", leave);
    return () => { leave(); window.removeEventListener("pagehide", leave); bc.close(); channel.current = null; };
  }, [deckId]);

  const send = useCallback((message: LinkMessage) => { channel.current?.postMessage(message); }, []);
  return { state, presenterGone, send, supported: typeof BroadcastChannel !== "undefined" };
}
