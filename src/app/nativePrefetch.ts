/**
 * Demand-based speculative application loading.
 *
 * Loading the actual route is always higher priority and is invoked directly
 * by the shell. This controller is only for speculative navigation hints.
 * Hover/focus work is delayed and cancellable before import starts; once an
 * import begins the browser cannot cancel that JavaScript request.
 */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}
export function allowsSpeculation(connection?: ConnectionHint | null, visible = true, online = true): boolean {
  if (!visible || !online) return false;
  if (!connection) return true;
  if (connection.saveData) return false;
  if (["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "")) return false;
  if (typeof connection.downlink === "number" && connection.downlink < 1.5) return false;
  return true;
}
export function browserAllowsSpeculation(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const hint = (navigator as Navigator & { connection?: ConnectionHint }).connection;
  return allowsSpeculation(hint, document.visibilityState === "visible", navigator.onLine);
}
export class IntentPrefetchController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingCode: string | null = null;
  private busy = false;
  private disposed = false;

  constructor(
    private readonly load: (code: string) => Promise<void>,
    private readonly canSpeculate: () => boolean = browserAllowsSpeculation,
  ) {}

  /** Returns without fetching if the connection is restricted or prefetch is busy. */
  schedule(code: string, delayMs = 180): void {
    if (this.disposed || !code || !this.canSpeculate()) return;
    if (this.pendingCode === code && this.timer !== null) return;
    this.cancel();
    // Do not pile up speculative downloads as the user brushes past a menu.
    if (this.busy) return;
    this.pendingCode = code;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pendingCode = null;
      if (this.disposed || this.busy || !this.canSpeculate()) return;
      this.busy = true;
      void this.load(code).catch(() => {
        // An explicit navigation remains able to retry the requested module.
      }).finally(() => { this.busy = false; });
    }, Math.max(0, delayMs));
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pendingCode = null;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}
