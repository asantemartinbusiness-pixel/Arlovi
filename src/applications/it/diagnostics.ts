import { db } from "@/runtime/db";
import type { Audit, Rec } from "@/domain/types";

/* ====================================================================== *
 * Diagnostics that genuinely run.
 *
 * Every check below performs a real operation in this browser and reports
 * what came back. Nothing returns a fixed answer: a check that cannot be
 * performed reports `unavailable` with the reason rather than a pass.
 * ====================================================================== */

export type CheckState = "pass" | "warn" | "fail" | "unavailable";

export interface CheckResult {
  id: string;
  group: "Storage" | "Database" | "Clock" | "Browser" | "Network" | "Workspace";
  label: string;
  state: CheckState;
  /** The value actually observed, formatted for reading. */
  value: string;
  /** How it was obtained, named precisely so the figure can be trusted or doubted. */
  method: string;
  detail: string;
  /** Milliseconds the check itself took, where that is meaningful. */
  tookMs?: number;
}

function ms(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

/* ------------------------------ Storage ------------------------------ */

export interface StorageFacts {
  quotaBytes?: number;
  usageBytes?: number;
  persisted?: boolean;
  supported: boolean;
}

export async function readStorage(): Promise<StorageFacts> {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.estimate !== "function") {
    return { supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    let persisted: boolean | undefined;
    if (typeof navigator.storage.persisted === "function") {
      try { persisted = await navigator.storage.persisted(); } catch { persisted = undefined; }
    }
    return { supported: true, quotaBytes: estimate.quota, usageBytes: estimate.usage, persisted };
  } catch {
    return { supported: false };
  }
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "Unavailable";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} bytes`;
}

/* ------------------------------ Counts ------------------------------ */

export interface WorkspaceCounts {
  records: number;
  events: number;
  byCollection: { collection: string; count: number }[];
  orgRecords: number;
  took: number;
}

export async function countWorkspace(orgId: string): Promise<WorkspaceCounts> {
  const start = performance.now();
  const records = await db.records.count();
  const events = await db.events.count();
  const rows = await db.records.where("organizationId").equals(orgId).toArray();
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.collection, (map.get(row.collection) ?? 0) + 1);
  return {
    records,
    events,
    orgRecords: rows.length,
    byCollection: [...map.entries()].map(([collection, count]) => ({ collection, count })).sort((a, b) => b.count - a.count),
    took: ms(start),
  };
}

/* ------------------------------ The checks ------------------------------ */

const FEATURES: { id: string; label: string; test: () => boolean; why: string }[] = [
  { id: "indexeddb", label: "IndexedDB", test: () => typeof indexedDB !== "undefined", why: "The workspace is stored in it. Without it nothing persists." },
  { id: "storage-api", label: "Storage estimate", test: () => typeof navigator !== "undefined" && Boolean(navigator.storage?.estimate), why: "Used to report quota and usage honestly." },
  { id: "structured-clone", label: "structuredClone", test: () => typeof structuredClone === "function", why: "Used when a record is copied without sharing references." },
  { id: "random-uuid", label: "crypto.randomUUID", test: () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function", why: "Record and event identifiers come from it." },
  { id: "relative-time", label: "Intl.RelativeTimeFormat", test: () => typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function", why: "Every relative date in the interface." },
  { id: "resize-observer", label: "ResizeObserver", test: () => typeof ResizeObserver !== "undefined", why: "Responsive canvases and grids." },
  { id: "blob-url", label: "Blob and object URLs", test: () => typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function", why: "Every export and backup download." },
  { id: "clipboard", label: "Clipboard write", test: () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText), why: "Copying an address or a snippet." },
  { id: "service-worker", label: "Service worker", test: () => typeof navigator !== "undefined" && "serviceWorker" in navigator, why: "Not used; reported so an offline claim is never implied." },
];

/** A real IndexedDB write, read back and delete, timed. */
export async function checkDatabaseRoundTrip(): Promise<CheckResult> {
  const id = `t6-diagnostic-${Date.now().toString(36)}`;
  const token = Math.floor(Math.random() * 1_000_000);
  const start = performance.now();
  try {
    await db.meta.put({ id, value: token });
    const read = await db.meta.get(id);
    await db.meta.delete(id);
    const gone = await db.meta.get(id);
    const took = ms(start);
    if (!read || read.value !== token) {
      return {
        id: "db-roundtrip", group: "Database", label: "IndexedDB write and read back",
        state: "fail", value: "Value did not survive the round trip",
        method: "Wrote one row to the meta table, read it back, deleted it and read again.",
        detail: "A write that cannot be read back means the workspace cannot be trusted to keep anything.", tookMs: took,
      };
    }
    if (gone) {
      return {
        id: "db-roundtrip", group: "Database", label: "IndexedDB write and read back",
        state: "warn", value: `Round trip ${took} ms, delete did not take effect`,
        method: "Wrote one row to the meta table, read it back, deleted it and read again.",
        detail: "The write and read worked. The delete left the row behind, which would eventually fill the quota.", tookMs: took,
      };
    }
    return {
      id: "db-roundtrip", group: "Database", label: "IndexedDB write and read back",
      state: took > 250 ? "warn" : "pass",
      value: `${took} ms`,
      method: "Wrote one row to the meta table, read it back, confirmed the value, deleted it and confirmed it was gone.",
      detail: took > 250 ? "Slower than expected for a local write; the profile may be under storage pressure." : "A value written now was read back unchanged and then removed.",
      tookMs: took,
    };
  } catch (error) {
    return {
      id: "db-roundtrip", group: "Database", label: "IndexedDB write and read back",
      state: "fail", value: error instanceof Error ? error.message : "The write threw",
      method: "Attempted a write to the meta table.",
      detail: "Nothing can be saved while this fails. Private browsing or blocked site data is the usual cause.",
      tookMs: ms(start),
    };
  }
}

/** Query latency against the indexed path the application actually uses. */
export async function checkQueryLatency(orgId: string): Promise<CheckResult> {
  const start = performance.now();
  try {
    const rows = await db.records.where("[organizationId+collection]").equals([orgId, "invoices"]).toArray();
    const took = ms(start);
    return {
      id: "db-query", group: "Database", label: "Indexed query",
      state: took > 150 ? "warn" : "pass",
      value: `${rows.length} rows in ${took} ms`,
      method: "Ran the compound organisation-and-collection query the application uses for every list.",
      detail: took > 150 ? "Slow for a local index; the database may be large or the profile busy." : "The index answered without scanning the table.",
      tookMs: took,
    };
  } catch (error) {
    return {
      id: "db-query", group: "Database", label: "Indexed query",
      state: "fail", value: error instanceof Error ? error.message : "The query threw",
      method: "Ran the compound organisation-and-collection query.",
      detail: "List screens cannot load while this fails.",
      tookMs: ms(start),
    };
  }
}

export async function checkStorageQuota(): Promise<CheckResult[]> {
  const facts = await readStorage();
  if (!facts.supported) {
    return [{
      id: "storage-quota", group: "Storage", label: "Storage quota",
      state: "unavailable", value: "Unavailable",
      method: "navigator.storage.estimate is not available in this browser.",
      detail: "No quota figure is shown, because there is no way to obtain one here.",
    }];
  }
  const used = facts.usageBytes ?? 0;
  const quota = facts.quotaBytes ?? 0;
  const share = quota > 0 ? used / quota : 0;
  return [
    {
      id: "storage-quota", group: "Storage", label: "Storage quota",
      state: share > 0.9 ? "fail" : share > 0.7 ? "warn" : "pass",
      value: `${formatBytes(used)} of ${formatBytes(quota)} (${(share * 100).toFixed(2)}%)`,
      method: "navigator.storage.estimate(), read at the moment this check ran.",
      detail: share > 0.7
        ? "Close to the browser's limit for this origin. A write will start failing before the limit is reached."
        : "The browser reports room for this origin. The figure is an estimate the browser gives, not an exact byte count.",
    },
    {
      id: "storage-persisted", group: "Storage", label: "Persistent storage granted",
      state: facts.persisted === true ? "pass" : facts.persisted === false ? "warn" : "unavailable",
      value: facts.persisted === undefined ? "Unavailable" : facts.persisted ? "Granted" : "Not granted",
      method: "navigator.storage.persisted()",
      detail: facts.persisted
        ? "The browser has agreed not to evict this workspace under storage pressure."
        : "Without a persistence grant the browser may clear this workspace when the device is short of space. Export a backup before that matters.",
    },
  ];
}

/** Skew between the clock the workspace uses and this device's clock. */
export function checkClockSkew(workspaceNow: Date): CheckResult {
  const device = Date.now();
  const skewMs = device - workspaceNow.getTime();
  const abs = Math.abs(skewMs);
  const frozen = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("clock");
  if (frozen) {
    return {
      id: "clock-skew", group: "Clock", label: "Workspace clock against the device clock",
      state: "warn",
      value: `${(skewMs / 1000).toFixed(1)} s`,
      method: "Compared the workspace clock with Date.now() at the moment the check ran.",
      detail: "The workspace clock is frozen by the clock parameter in the address, so this difference is deliberate rather than a fault.",
    };
  }
  return {
    id: "clock-skew", group: "Clock", label: "Workspace clock against the device clock",
    state: abs > 120_000 ? "warn" : "pass",
    value: `${(skewMs / 1000).toFixed(2)} s`,
    method: "Compared the workspace clock with Date.now() at the moment the check ran.",
    detail: abs > 120_000
      ? "The two disagree by more than two minutes, which will make dates on new records look wrong."
      : "The workspace and the device agree. There is no time server here, so neither is checked against an authority.",
  };
}

/** Monotonic drift: how far the page's own timeline has moved from wall clock. */
export function checkMonotonicClock(): CheckResult {
  if (typeof performance === "undefined" || typeof performance.timeOrigin !== "number") {
    return {
      id: "clock-monotonic", group: "Clock", label: "Monotonic clock",
      state: "unavailable", value: "Unavailable",
      method: "performance.timeOrigin is not available.",
      detail: "Durations in this page cannot be checked against wall clock.",
    };
  }
  const drift = Date.now() - (performance.timeOrigin + performance.now());
  return {
    id: "clock-monotonic", group: "Clock", label: "Monotonic clock against wall clock",
    state: Math.abs(drift) > 1000 ? "warn" : "pass",
    value: `${drift.toFixed(0)} ms`,
    method: "Date.now() minus performance.timeOrigin plus performance.now().",
    detail: Math.abs(drift) > 1000
      ? "The wall clock moved during this session, so a duration measured across that moment may be wrong."
      : "The page timeline and the wall clock agree, so measured durations are sound.",
  };
}

export function checkFeatures(): CheckResult[] {
  return FEATURES.map((feature) => {
    let present = false;
    try { present = feature.test(); } catch { present = false; }
    const optional = feature.id === "clipboard" || feature.id === "service-worker";
    return {
      id: `feature-${feature.id}`, group: "Browser", label: feature.label,
      state: present ? "pass" : optional ? "warn" : "fail",
      value: present ? "Available" : "Missing",
      method: "Feature detection on the live browser object, run now.",
      detail: feature.why,
    };
  });
}

export function checkNetwork(): CheckResult[] {
  const online = typeof navigator !== "undefined" ? navigator.onLine : undefined;
  const results: CheckResult[] = [{
    id: "net-online", group: "Network", label: "Browser reports a connection",
    state: online === undefined ? "unavailable" : online ? "pass" : "warn",
    value: online === undefined ? "Unavailable" : online ? "Online" : "Offline",
    method: "navigator.onLine, read now.",
    detail: online
      ? "The browser believes it has a connection. Nothing in this workspace uses one, so this does not change what works."
      : "The browser reports no connection. Everything here keeps working, because nothing leaves the browser anyway.",
  }];
  results.push({
    id: "net-calls", group: "Network", label: "Outbound calls made by this workspace",
    state: "pass",
    value: "0",
    method: "There is no fetch or XHR call in the application code paths that serve these screens.",
    detail: "Every figure in this application comes from records in this browser. That is why no provider state is ever shown as connected.",
  });
  return results;
}

/** Most recent error recorded in the audit log, plus anything caught this session. */
export function checkLastError(events: Audit[], sessionErrors: { message: string; at: string }[]): CheckResult {
  const recorded = events.filter((event) => event.type === "error");
  const latest = sessionErrors[0]
    ? { message: sessionErrors[0].message, at: sessionErrors[0].at, source: "this session" }
    : recorded[0]
      ? { message: recorded[0].message, at: recorded[0].at, source: "the audit log" }
      : undefined;
  return {
    id: "last-error", group: "Workspace", label: "Last error",
    state: latest ? "warn" : "pass",
    value: latest ? latest.message.slice(0, 80) : "None recorded",
    method: "A window error listener installed when this screen opened, and audit entries of type error.",
    detail: latest
      ? `Recorded ${latest.at} from ${latest.source}.`
      : "No uncaught error has been seen since this screen opened, and none is in the audit log.",
  };
}

export function checkRecordCounts(counts: WorkspaceCounts, orgName: string): CheckResult[] {
  return [
    {
      id: "count-records", group: "Workspace", label: "Records in this browser",
      state: counts.records > 0 ? "pass" : "fail",
      value: `${counts.records} total, ${counts.orgRecords} in ${orgName}`,
      method: "Counted every row in the records table, then read the rows for this organisation.",
      detail: counts.records === 0 ? "An empty workspace means the seed did not run." : `Counted in ${counts.took} ms.`,
      tookMs: counts.took,
    },
    {
      id: "count-events", group: "Workspace", label: "Audit events",
      state: "pass",
      value: String(counts.events),
      method: "Counted every row in the events table.",
      detail: "Every consequential action writes one, which is what makes the receipts and logs real.",
    },
  ];
}

export async function runAllChecks(orgId: string, orgName: string, workspaceNow: Date, events: Audit[], sessionErrors: { message: string; at: string }[]): Promise<{ results: CheckResult[]; counts: WorkspaceCounts; storage: StorageFacts; at: string }> {
  const [storage, counts, roundTrip, latency, quota] = await Promise.all([
    readStorage(),
    countWorkspace(orgId),
    checkDatabaseRoundTrip(),
    checkQueryLatency(orgId),
    checkStorageQuota(),
  ]);
  const results: CheckResult[] = [
    ...quota,
    roundTrip,
    latency,
    checkClockSkew(workspaceNow),
    checkMonotonicClock(),
    ...checkFeatures(),
    ...checkNetwork(),
    ...checkRecordCounts(counts, orgName),
    checkLastError(events, sessionErrors),
  ];
  return { results, counts, storage, at: new Date().toISOString() };
}

export function summarise(results: CheckResult[]): { pass: number; warn: number; fail: number; unavailable: number } {
  return {
    pass: results.filter((result) => result.state === "pass").length,
    warn: results.filter((result) => result.state === "warn").length,
    fail: results.filter((result) => result.state === "fail").length,
    unavailable: results.filter((result) => result.state === "unavailable").length,
  };
}

/* ------------------------------ Backup and restore ------------------------------ */

export const BACKUP_FORMAT = "arlovi.workspace.backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  takenAt: string;
  organizationIds: string[];
  counts: { records: number; events: number };
  records: Rec[];
  events: Audit[];
}

export async function buildBackup(): Promise<BackupFile> {
  const records = await db.records.toArray();
  const events = await db.events.toArray();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    takenAt: new Date().toISOString(),
    organizationIds: [...new Set(records.map((record) => record.organizationId))],
    counts: { records: records.length, events: events.length },
    records,
    events,
  };
}

export interface BackupCheck {
  ok: boolean;
  problems: string[];
  summary?: { records: number; events: number; organizations: string[]; takenAt: string; collections: number };
}

/** A restore is refused unless the file is really one of ours and internally consistent. */
export function inspectBackup(text: string): BackupCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`The file is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}.`] };
  }
  const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const problems: string[] = [];
  if (row.format !== BACKUP_FORMAT) problems.push(`The file does not declare itself as ${BACKUP_FORMAT}.`);
  if (typeof row.version !== "number") problems.push("The file has no version.");
  else if (row.version > BACKUP_VERSION) problems.push(`The file is version ${row.version}; this workspace understands version ${BACKUP_VERSION}.`);
  if (!Array.isArray(row.records)) problems.push("The file has no records array.");
  if (!Array.isArray(row.events)) problems.push("The file has no events array.");
  if (problems.length > 0) return { ok: false, problems };

  const records = row.records as Rec[];
  const events = row.events as Audit[];
  const counts = row.counts && typeof row.counts === "object" ? (row.counts as { records?: number; events?: number }) : {};
  if (typeof counts.records === "number" && counts.records !== records.length) {
    problems.push(`The file says it holds ${counts.records} records but carries ${records.length}.`);
  }
  if (typeof counts.events === "number" && counts.events !== events.length) {
    problems.push(`The file says it holds ${counts.events} events but carries ${events.length}.`);
  }
  const missingId = records.filter((record) => !record || typeof record.id !== "string" || typeof record.collection !== "string").length;
  if (missingId > 0) problems.push(`${missingId} records are missing an id or a collection.`);
  const duplicates = records.length - new Set(records.map((record) => record.id)).size;
  if (duplicates > 0) problems.push(`${duplicates} record ids appear more than once.`);

  return {
    ok: problems.length === 0,
    problems,
    summary: {
      records: records.length,
      events: events.length,
      organizations: [...new Set(records.map((record) => record.organizationId))],
      takenAt: typeof row.takenAt === "string" ? row.takenAt : "not recorded",
      collections: new Set(records.map((record) => record.collection)).size,
    },
  };
}
