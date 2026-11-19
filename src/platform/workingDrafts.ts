import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

/**
 * Explicitly opt-in, in-memory working drafts. Sensitive draft fields never
 * enter localStorage, sessionStorage, navigation URLs or cross-tenant history.
 * Drafts survive an in-app detour and unmount, but not a browser reload.
 */
const workingDrafts = new Map<string, Map<string, unknown>>();
const draftListeners = new Set<() => void>();
let draftRevision = 0;
function notifyDraftChange(): void { draftRevision++; draftListeners.forEach(listener => listener()); }
export function subscribeWorkingDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => { draftListeners.delete(listener); };
}
export function workingDraftRevision(): number { return draftRevision; }
export function hasWorkingDraft(scope: string): boolean {
  const fields = workingDrafts.get(scope);
  if (!fields?.size) return false;
  // Loading a saved quote hydrates its lines. Count it only after the person
  // actually changes a value; hydration alone is not an unsaved edit.
  if (scope.startsWith("crm:quote:")) return fields.get("dirty") === true;
  return true;
}
export function countAllWorkingDrafts(): number {
  return [...workingDrafts.keys()].filter(hasWorkingDraft).length;
}
export function countWorkingDrafts(orgId: string, actor: string): number {
  const marker = `:${orgId}:${actor}`;
  return [...workingDrafts.keys()].filter(scope =>
    hasWorkingDraft(scope) && (scope.endsWith(marker) || scope.includes(marker + ":"))).length;
}
export function useWorkingDraftPresence(scope: string): boolean {
  useSyncExternalStore(subscribeWorkingDrafts, workingDraftRevision, () => 0);
  return hasWorkingDraft(scope);
}
export function useWorkingDraftCount(orgId: string, actor: string): number {
  useSyncExternalStore(subscribeWorkingDrafts, workingDraftRevision, () => 0);
  return countWorkingDrafts(orgId, actor);
}
export function useAllWorkingDraftCount(): number {
  useSyncExternalStore(subscribeWorkingDrafts, workingDraftRevision, () => 0);
  return countAllWorkingDrafts();
}

export function readWorkingField<T>(scope: string, field: string, fallback: T): T {
  const fields = workingDrafts.get(scope);
  return fields?.has(field) ? fields.get(field) as T : fallback;
}
export function rememberWorkingField<T>(scope: string, field: string, value: T): void {
  let fields = workingDrafts.get(scope);
  if (!fields) {
    fields = new Map<string, unknown>();
    workingDrafts.set(scope, fields);
  }
  fields.set(field, value);
  notifyDraftChange();
}
export function clearWorkingDraft(scope: string): void {
  if (workingDrafts.delete(scope)) notifyDraftChange();
}
export function useWorkingField<T>(scope: string, field: string, fallback: T): [T, (next: T) => void] {
  // A mounted editor must never display another organisation's earlier
  // draft during a company / actor switch. Resolve the keyed value immediately,
  // rather than waiting for an effect after the component has painted.
  const key = `${scope}:${field}`;
  const [entry, setEntry] = useState<{ key: string; value: T }>(
    () => ({ key, value: readWorkingField(scope, field, fallback) }),
  );
  const value = entry.key === key ? entry.value : readWorkingField(scope, field, fallback);
  const update = useCallback((next: T) => {
    rememberWorkingField(scope, field, next);
    setEntry({ key, value: next });
  }, [scope, field, key]);
  return [value, update];
}

/** Opt-in working state that supports React functional updates, useful for
 * multi-line quote editors. Keep authoritative values in memory, not URLs. */
export function useWorkingState<T>(scope: string, field: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, write] = useWorkingField(scope, field, fallback);
  // Keep the dispatch stable while the value changes; callers may use it in
  // effects that hydrate an editor from an existing record.
  const current = useRef(value);
  useEffect(() => { current.current = value; }, [value]);
  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const latest = readWorkingField(scope, field, current.current);
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(latest) : next;
    write(resolved);
  }, [scope, field, write]);
  return [value, update];
}
