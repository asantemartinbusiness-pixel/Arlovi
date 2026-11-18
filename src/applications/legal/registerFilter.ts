import { useSyncExternalStore } from "react";
import { EMPTY_FILTER, type RegisterFilter } from "./register";

/* The register filter outlives a tab switch, so moving from Active to
   Expiring keeps the counterparty somebody chose. It is per-browser UI
   state, remembered for the session only. */

const KEY = "arlovi.legal.registerFilter";
let value: RegisterFilter = read();
const listeners = new Set<() => void>();

function read(): RegisterFilter {
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(KEY);
    return raw ? { ...EMPTY_FILTER, ...(JSON.parse(raw) as Partial<RegisterFilter>) } : EMPTY_FILTER;
  } catch {
    return EMPTY_FILTER;
  }
}

export function setRegisterFilter(next: RegisterFilter): void {
  value = next;
  try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  listeners.forEach((listener) => listener());
}

export function useRegisterFilter(): RegisterFilter {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => value);
}
