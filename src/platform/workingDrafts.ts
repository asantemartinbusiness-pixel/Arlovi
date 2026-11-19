import { useCallback, useState } from "react";

/**
 * Explicitly opt-in, in-memory working drafts. Sensitive draft fields never
 * enter localStorage, sessionStorage, navigation URLs or cross-tenant history.
 * Drafts survive an in-app detour and unmount, but not a browser reload.
 */
const workingDrafts = new Map<string, Map<string, unknown>>();

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
}
export function clearWorkingDraft(scope: string): void {
  workingDrafts.delete(scope);
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
