import { create } from "zustand";
import type { CheckResult, StorageFacts, WorkspaceCounts } from "./diagnostics";
import { clockIso } from "@/platform/clock";

export interface SessionError { message: string; at: string }

export interface LogFilter { name: string; kind: string; actor: string; text: string }

export const NO_LOG_FILTER: LogFilter = { name: "", kind: "", actor: "", text: "" };

interface ItUi {
  results: CheckResult[];
  counts?: WorkspaceCounts;
  storage?: StorageFacts;
  ranAt: string;
  running: boolean;
  sessionErrors: SessionError[];
  restorePreview: string;
  /** Filter applied to the audit log on the logs screen. Kept for this session only. */
  logFilter: LogFilter;
  setLogFilter: (filter: LogFilter) => void;
  setRunning: (running: boolean) => void;
  setResults: (payload: { results: CheckResult[]; counts: WorkspaceCounts; storage: StorageFacts; at: string }) => void;
  noteError: (message: string) => void;
  setRestorePreview: (text: string) => void;
}

export const useItUi = create<ItUi>((set) => ({
  results: [],
  ranAt: "",
  running: false,
  sessionErrors: [],
  restorePreview: "",
  logFilter: NO_LOG_FILTER,
  setLogFilter: (filter) => set({ logFilter: filter }),
  setRunning: (running) => set({ running }),
  setResults: ({ results, counts, storage, at }) => set({ results, counts, storage, ranAt: at, running: false }),
  noteError: (message) => set((state) => ({ sessionErrors: [{ message, at: clockIso() }, ...state.sessionErrors].slice(0, 20) })),
  setRestorePreview: (text) => set({ restorePreview: text }),
}));

let installed = false;

/** One window error listener for the session, so "last error" is a real observation. */
export function watchErrors(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    useItUi.getState().noteError(event.message || "An uncaught error was raised.");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    useItUi.getState().noteError(reason instanceof Error ? reason.message : "A promise was rejected and not handled.");
  });
}
