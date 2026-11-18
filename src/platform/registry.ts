import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { ScreenInfo } from "@/app/catalog";
import type { Rec, Role } from "@/domain/types";
import type { Capability } from "./policy";
import type { OrgProfile } from "./org";
import type { Mutations } from "./workspace";

/* ------------------------------------------------------------------ *
 * Typed screen registry.
 *
 * Audits A01–A04: screens, tabs, actions and overlays are declared by the
 * application that owns them. A tab names the panel it renders, an action
 * names the handler it runs, an overlay names its own component. Nothing is
 * inferred from a label with a regular expression.
 * ------------------------------------------------------------------ */

export interface ScreenContext {
  /** The approved contract row for this screen. */
  screen: ScreenInfo;
  org: OrgProfile;
  role: Role;
  actor: string;
  now: Date;
  params: Record<string, string>;
  /** Active tab id. */
  tab: string;
  setTab: (id: string) => void;
  selectedId?: string;
  select: (id?: string) => void;
  openOverlay: (id: string, payload?: unknown) => void;
  closeOverlay: () => void;
  overlayPayload: unknown;
  navigate: (path: string) => void;
  /** Resolve a route pattern with the active org and an optional record id. */
  path: (route: string, id?: string) => string;
  toast: (title: string, body: string, tone?: "ok" | "blocked" | "failed" | "info") => void;
  mutate: Mutations;
  can: (capability: Capability) => boolean;
  money: (minor: number | undefined) => string;
  date: (value: string | Date | undefined, options?: Intl.DateTimeFormatOptions) => string;
  dateTime: (value: string | Date | undefined) => string;
  relative: (value: string | Date | undefined) => string;
}

export interface TabDef {
  /** Matches a tab name in the approved registry contract. */
  id: string;
  label?: string;
  render: (context: ScreenContext) => ReactNode;
  count?: (context: ScreenContext) => number | undefined;
  capability?: Capability;
}

export type ActionPlacement = "primary" | "secondary" | "overflow" | "toolbar";

export interface ActionDef {
  /** Matches an action name in the approved registry contract. */
  id: string;
  label?: string;
  placement: ActionPlacement;
  icon?: ReactNode;
  capability?: Capability;
  /** Preconditions; returning a string explains why the action is unavailable. */
  guard?: (context: ScreenContext) => string | undefined;
  run: (context: ScreenContext) => void | Promise<void>;
  tone?: "danger";
  shortcut?: string;
  group?: string;
}

export interface OverlayDef {
  /** Matches an overlay name in the approved registry contract. */
  id: string;
  kind: "modal" | "drawer";
  title?: string | ((context: ScreenContext) => string);
  description?: string;
  width?: number;
  tone?: "danger";
  blocking?: boolean;
  /** Presentation hints owned by the application; never inferred from title text. */
  presentation?: {
    /** Optional task-specific instructions when description is absent. */
    guidance?: string;
    /** Opt in to including the page's selected record in overlay context. */
    selectedRecord?: boolean;
    /** Omit record context on creation or sensitive confirmation surfaces. */
    noRecordContext?: boolean;
  };
  /** Visible role-view guard for direct-link overlays. Backend authorization remains separate. */
  capability?: Capability;
  render: (context: ScreenContext & { close: () => void }) => ReactNode;
  footer?: (context: ScreenContext & { close: () => void }) => ReactNode;
}

export interface ScreenDef {
  id: string;
  /** Replaces the standard page body with a purpose-built surface. */
  surface?: (context: ScreenContext) => ReactNode;
  /** Replaces the whole page chrome (editors, consoles, public pages). */
  chrome?: "standard" | "full";
  /** Extra content beneath the title, e.g. a record header card. */
  header?: (context: ScreenContext) => ReactNode;
  /** Right-hand contextual inspector. */
  inspector?: (context: ScreenContext) => ReactNode;
  inspectorTitle?: string;
  tabs?: TabDef[];
  actions?: ActionDef[];
  overlays?: OverlayDef[];
  /** Status strip under the toolbar. */
  statusStrip?: (context: ScreenContext) => ReactNode;
  /** Override the page title/description from the registry contract. */
  title?: (context: ScreenContext) => string;
  subtitle?: (context: ScreenContext) => ReactNode;
}

export interface AppNavSection {
  label?: string;
  items: { label: string; screenId: string; icon?: ComponentType<{ size?: number }>; badge?: (records: Rec[]) => number | undefined }[];
}

export interface AppModule {
  code: string;
  /** Short product name shown in navigation, e.g. "Finance". */
  short: string;
  name: string;
  purpose: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** App-specific secondary navigation. */
  nav: AppNavSection[];
  screens: Record<string, ScreenDef>;
  /**
   * App-owned renderer for registry screens this module has not yet given a
   * bespoke definition. It must still be specific to the application.
   */
  fallback?: (context: ScreenContext) => ReactNode;
}

const REGISTRY = new Map<string, AppModule>();
const listeners = new Set<() => void>();
let revision = 0;
/** React-safe external store: late native app registration refreshes routed screens. */
export function notifyApplicationRegistry(): void {
  revision += 1;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getRevision(): number { return revision; }
export function useApplicationRegistryRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}

export function registerApp(module: AppModule): AppModule {
  REGISTRY.set(module.code, module);
  notifyApplicationRegistry();
  return module;
}

export function getApp(code: string): AppModule | undefined {
  return REGISTRY.get(code);
}

export function allApps(): AppModule[] {
  return [...REGISTRY.values()];
}

export function getScreenDef(code: string, screenId: string): ScreenDef | undefined {
  return REGISTRY.get(code)?.screens[screenId];
}

/** Coverage figures for the implementation ledger — counted, never estimated. */
export function registryCoverage(screens: ScreenInfo[]) {
  let bespoke = 0;
  let appFallback = 0;
  let unregistered = 0;
  let tabs = 0;
  let overlays = 0;
  let actions = 0;
  for (const screen of screens) {
    const app = REGISTRY.get(screen.applicationCode);
    const def = app?.screens[screen.id];
    if (def) {
      bespoke += 1;
      tabs += def.tabs?.length ?? 0;
      overlays += def.overlays?.length ?? 0;
      actions += def.actions?.length ?? 0;
    } else if (app?.fallback) appFallback += 1;
    else unregistered += 1;
  }
  return { bespoke, appFallback, unregistered, tabs, overlays, actions, total: screens.length };
}
