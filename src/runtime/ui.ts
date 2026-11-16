import { create } from "zustand";
import type { PaletteId } from "@/brand";
import type { Role } from "@/domain/types";
import type { AttentionReceipt } from "@/platform/attentionReceipts";

export interface Toast {
  id: string;
  title: string;
  body: string;
  tone: "ok" | "blocked" | "failed" | "info";
}

interface UiState {
  role: Role;
  theme: "light" | "dark";
  density: "comfortable" | "balanced" | "compact";
  palette: PaletteId;
  collapsed: boolean;
  mobileNav: boolean;
  command: boolean;
  ask: boolean;
  askSeed: string;
  notes: boolean;
  tool: string;
  offline: boolean;
  toasts: Toast[];
  attentionReceipts: Record<string, AttentionReceipt>;
  setAttentionReceipt: (key: string, update: AttentionReceipt) => void;
  setRole: (role: Role) => void;
  setTheme: (theme: "light" | "dark") => void;
  setDensity: (density: UiState["density"]) => void;
  setPalette: (palette: PaletteId) => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileNav: (open: boolean) => void;
  setCommand: (open: boolean) => void;
  setAsk: (open: boolean, seed?: string) => void;
  setNotes: (open: boolean) => void;
  setTool: (tool: string) => void;
  setOffline: (offline: boolean) => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

function storedUi(): Partial<UiState> {
  try {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("arlovi-ui");
    return stored ? (JSON.parse(stored) as Partial<UiState>) : {};
  } catch {
    // Corrupted or blocked browser storage should not prevent the application from booting.
    return {};
  }
}
const initial = storedUi();

export const useUi = create<UiState>((set) => ({
  role: initial.role ?? "owner",
  theme: initial.theme ?? "light",
  density: initial.density ?? "balanced",
  palette: initial.palette ?? "cobalt",
  collapsed: initial.collapsed ?? false,
  mobileNav: false,
  command: false,
  ask: false,
  askSeed: "",
  notes: false,
  tool: "select",
  offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  toasts: [],
  attentionReceipts: initial.attentionReceipts ?? {},
  setAttentionReceipt: (key, update) => set((state) => ({
    attentionReceipts: {
      ...state.attentionReceipts,
      [key]: { ...state.attentionReceipts[key], ...update },
    },
  })),
  setRole: (role) => set({ role }),
  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setPalette: (palette) => set({ palette }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setMobileNav: (mobileNav) => set({ mobileNav }),
  setCommand: (command) => set({ command }),
  setAsk: (ask, askSeed = "") => set({ ask, askSeed }),
  setNotes: (notes) => set({ notes }),
  setTool: (tool) => set({ tool }),
  setOffline: (offline) => set({ offline }),
  pushToast: (toast) =>
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id: crypto.randomUUID() }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

useUi.subscribe((state) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
    "arlovi-ui",
    JSON.stringify({
      role: state.role,
      theme: state.theme,
      density: state.density,
      palette: state.palette,
      collapsed: state.collapsed,
      attentionReceipts: state.attentionReceipts,
    }),
    );
  } catch {
    // Storage may be unavailable in privacy-constrained browsers.
  }
});
