import { create } from "zustand";

/* ------------------------------------------------------------------ *
 * Composer state for every conversation surface in the intelligence
 * applications. It is held outside the composer so a screen action in the
 * page toolbar can send, attach or pin scope, and so the Context Manager can
 * show and clear exactly what a thread will read.
 *
 * Audit A19 edge: a context switch invalidates everything cached for the
 * previous organisation rather than carrying its records into the new one.
 * ------------------------------------------------------------------ */

export interface LocalAttachment {
  id: string;
  name: string;
  /** Bytes, read from the file handle in this browser. Never uploaded. */
  size: number;
  type: string;
  /** Set when the attachment is a reference to a workspace record. */
  recordId?: string;
}

interface ChatState {
  orgId: string | null;
  drafts: Record<string, string>;
  scope: Record<string, string[]>;
  attachments: Record<string, LocalAttachment[]>;
  sendSignal: Record<string, number>;
  focusSignal: Record<string, number>;
  ensureOrg: (orgId: string) => void;
  setDraft: (thread: string, value: string) => void;
  addScope: (thread: string, ids: string[]) => void;
  removeScope: (thread: string, id: string) => void;
  clearScope: (thread: string) => void;
  addAttachment: (thread: string, attachment: LocalAttachment) => void;
  removeAttachment: (thread: string, id: string) => void;
  requestSend: (thread: string) => void;
  requestFocus: (thread: string) => void;
}

export const useChatState = create<ChatState>((set) => ({
  orgId: null,
  drafts: {},
  scope: {},
  attachments: {},
  sendSignal: {},
  focusSignal: {},
  ensureOrg: (orgId) => set((state) => (state.orgId === orgId
    ? state
    : { orgId, drafts: {}, scope: {}, attachments: {}, sendSignal: {}, focusSignal: {} })),
  setDraft: (thread, value) => set((state) => ({ drafts: { ...state.drafts, [thread]: value } })),
  addScope: (thread, ids) => set((state) => ({
    scope: { ...state.scope, [thread]: [...new Set([...(state.scope[thread] ?? []), ...ids])] },
  })),
  removeScope: (thread, id) => set((state) => ({
    scope: { ...state.scope, [thread]: (state.scope[thread] ?? []).filter((item) => item !== id) },
  })),
  clearScope: (thread) => set((state) => ({ scope: { ...state.scope, [thread]: [] } })),
  addAttachment: (thread, attachment) => set((state) => ({
    attachments: { ...state.attachments, [thread]: [...(state.attachments[thread] ?? []), attachment] },
  })),
  removeAttachment: (thread, id) => set((state) => ({
    attachments: { ...state.attachments, [thread]: (state.attachments[thread] ?? []).filter((item) => item.id !== id) },
  })),
  requestSend: (thread) => set((state) => ({ sendSignal: { ...state.sendSignal, [thread]: (state.sendSignal[thread] ?? 0) + 1 } })),
  requestFocus: (thread) => set((state) => ({ focusSignal: { ...state.focusSignal, [thread]: (state.focusSignal[thread] ?? 0) + 1 } })),
}));

/* ------------------------------------------------------------------ *
 * Agent builder draft (TEAM-004) and mission creation draft (MISSION-002).
 * Both wizards keep their draft outside the panel so the page toolbar can
 * validate and activate, and so moving between steps keeps the answers.
 * ------------------------------------------------------------------ */

export interface AgentDraft {
  name: string;
  role: string;
  departmentId: string;
  brief: string;
  skills: string[];
  sources: string[];
  tools: string[];
  autonomy: "suggest" | "draft" | "act_with_approval";
  spendCapMinor: number;
  provider: string;
  evaluated: boolean;
  evaluationScore?: number;
  evaluationAt?: string;
}

export const EMPTY_AGENT: AgentDraft = {
  name: "", role: "", departmentId: "", brief: "", skills: [], sources: [], tools: [],
  autonomy: "draft", spendCapMinor: 50_000, provider: "", evaluated: false,
};

interface AgentBuilderState {
  draft: AgentDraft;
  set: (patch: Partial<AgentDraft>) => void;
  reset: () => void;
}

export const useAgentBuilder = create<AgentBuilderState>((set) => ({
  draft: EMPTY_AGENT,
  set: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  reset: () => set({ draft: EMPTY_AGENT }),
}));

export interface MissionDraft {
  goal: string;
  successCriteria: string;
  contextIds: string[];
  targetId: string;
  departmentId: string;
  agentIds: string[];
  steps: { title: string; kind: "read" | "compute" | "draft" | "approval" | "provider"; capability?: string }[];
  budgetMinor: number;
  spendCapMinor: number;
  grants: string[];
  dueAt: string;
  templateId?: string;
}

export const EMPTY_MISSION: MissionDraft = {
  goal: "", successCriteria: "", contextIds: [], targetId: "", departmentId: "", agentIds: [],
  steps: [], budgetMinor: 0, spendCapMinor: 0, grants: [], dueAt: "",
};

interface MissionWizardState {
  draft: MissionDraft;
  set: (patch: Partial<MissionDraft>) => void;
  reset: () => void;
}

export const useMissionWizard = create<MissionWizardState>((set) => ({
  draft: EMPTY_MISSION,
  set: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  reset: () => set({ draft: EMPTY_MISSION }),
}));

/* ------------------------------------------------------------------ *
 * Small per-panel flags (an inline editor open, a board announcement) so a
 * page-toolbar action can reach into the panel it belongs to.
 * ------------------------------------------------------------------ */

interface FlagState {
  flags: Record<string, boolean>;
  notes: Record<string, string>;
  set: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
  note: (key: string, value: string) => void;
}

export const usePanelFlags = create<FlagState>((set) => ({
  flags: {},
  notes: {},
  set: (key, value) => set((state) => ({ flags: { ...state.flags, [key]: value } })),
  toggle: (key) => set((state) => ({ flags: { ...state.flags, [key]: !state.flags[key] } })),
  note: (key, value) => set((state) => ({ notes: { ...state.notes, [key]: value } })),
}));
