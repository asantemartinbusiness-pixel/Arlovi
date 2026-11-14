import { create } from "zustand";
import type { PaletteId } from "@/brand";
import type { Role } from "@/domain/types";

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

const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("arlovi-ui");
const initial = stored ? (JSON.parse(stored) as Partial<UiState>) : {};

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
  localStorage.setItem(
    "arlovi-ui",
    JSON.stringify({
      role: state.role,
      theme: state.theme,
      density: state.density,
      palette: state.palette,
      collapsed: state.collapsed,
    }),
  );
});
