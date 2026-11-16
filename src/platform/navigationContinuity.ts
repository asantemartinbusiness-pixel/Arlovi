import { useEffect, useState } from "react";

export interface NavigationItem {
  path: string;
  visitedAt: string;
}
interface NavigationState {
  recent: NavigationItem[];
  pinned: string[];
}
const MAX_RECENT = 20;
const MAX_PINNED = 24;
const EVENT = "arlovi:navigation-changed";
const empty = (): NavigationState => ({ recent: [], pinned: [] });

function key(orgId: string): string { return `arlovi-navigation-v1:${orgId}`; }
function allowed(path: string, slug: string): boolean {
  return typeof path === "string"
    && path.startsWith(`/o/${slug}/`)
    && !path.includes("//") && !path.includes("\\")
    && !/[?#]/.test(path)
    && path.length <= 500;
}
export function readNavigation(orgId: string, slug: string): NavigationState {
  try {
    const raw = localStorage.getItem(key(orgId));
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();
    const state = parsed as Partial<NavigationState>;
    const recent = Array.isArray(state.recent) ? state.recent
      .filter((item): item is NavigationItem => Boolean(item && allowed(item.path, slug) && typeof item.visitedAt === "string"))
      .slice(0, MAX_RECENT) : [];
    const pinned = Array.isArray(state.pinned) ? state.pinned.filter((path): path is string => allowed(path, slug)).slice(0, MAX_PINNED) : [];
    return { recent, pinned: [...new Set(pinned)] };
  } catch { return empty(); }
}
function commit(orgId: string, state: NavigationState): void {
  try {
    localStorage.setItem(key(orgId), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: orgId }));
  } catch { /* Browsers with blocked local storage still support navigation. */ }
}
export function recordNavigation(orgId: string, slug: string, pathname: string): void {
  if (!allowed(pathname, slug)) return;
  const current = readNavigation(orgId, slug);
  if (current.recent[0]?.path === pathname) return;
  commit(orgId, { ...current, recent: [
    { path: pathname, visitedAt: new Date().toISOString() },
    ...current.recent.filter(item => item.path !== pathname),
  ].slice(0, MAX_RECENT) });
}
export function toggleSavedNavigation(orgId: string, slug: string, pathname: string): boolean {
  if (!allowed(pathname, slug)) return false;
  const current = readNavigation(orgId, slug);
  const saved = current.pinned.includes(pathname);
  commit(orgId, { ...current, pinned: saved
    ? current.pinned.filter(path => path !== pathname)
    : [pathname, ...current.pinned].slice(0, MAX_PINNED) });
  return !saved;
}
export function removeRecentNavigation(orgId: string, slug: string, pathname: string): void {
  const current = readNavigation(orgId, slug);
  commit(orgId, { ...current, recent: current.recent.filter(item => item.path !== pathname) });
}
export function clearRecentNavigation(orgId: string, slug: string): void {
  const current = readNavigation(orgId, slug);
  commit(orgId, { ...current, recent: [] });
}
export function useNavigationContinuity(orgId: string, slug: string): NavigationState {
  const [state, setState] = useState(() => readNavigation(orgId, slug));
  useEffect(() => {
    const update = () => setState(readNavigation(orgId, slug));
    const inTab = (event: Event) => {
      if ((event as CustomEvent<string>).detail === orgId) update();
    };
    const crossTab = (event: StorageEvent) => {
      if (event.key === key(orgId)) update();
    };
    update();
    window.addEventListener(EVENT, inTab);
    window.addEventListener("storage", crossTab);
    return () => {
      window.removeEventListener(EVENT, inTab);
      window.removeEventListener("storage", crossTab);
    };
  }, [orgId, slug]);
  return state;
}
