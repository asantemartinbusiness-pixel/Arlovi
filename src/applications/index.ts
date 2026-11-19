/**
 * Demand-based native application loader. Each screen and seed module is
 * imported only when its application is visited or intentionally prefetched.
 * The core HQ remains the only hard startup dependency.
 */
import { notifyApplicationRegistry } from "@/platform/registry";
import { seedLateContributors } from "@/runtime/db";

export interface LoadFailure { group: string; message: string; }
export type ApplicationLoadStatus = "idle" | "loading" | "ready" | "failed";
interface NativeLoader { group: string; load: () => Promise<unknown>; }
const HQ: NativeLoader = {
  group: "Headquarters",
  load: () => Promise.all([import("@/domain/seeds/hq"),import("@/domain/seeds/flagshipCollective"),import("@/domain/seeds/flagshipStudio"),import("./hq/index")]),
};
const NATIVE: Record<string, NativeLoader> = {
  INBOX: { group: "Workplace / inbox", load: () => Promise.all([import("@/domain/seeds/inbox"),import("./inbox/index")]) },
  ADMIN: { group: "Workplace / admin", load: () => Promise.all([import("@/domain/seeds/admin"),import("./admin/index")]) },
  ASSET: { group: "Workplace / asset", load: () => Promise.all([import("@/domain/seeds/asset"),import("./asset/index")]) },
  AI: { group: "Intelligence / ai", load: () => Promise.all([import("@/domain/seeds/ai"),import("./ai/index")]) },
  BRAIN: { group: "Intelligence / brain", load: () => Promise.all([import("@/domain/seeds/brain"),import("./brain/index")]) },
  TEAM: { group: "Intelligence / team", load: () => Promise.all([import("@/domain/seeds/team"),import("./team/index")]) },
  MISSION: { group: "Intelligence / mission", load: () => Promise.all([import("@/domain/seeds/mission"),import("./mission/index")]) },
  AUTO: { group: "Automation / auto", load: () => Promise.all([import("@/domain/seeds/auto"),import("./auto/index")]) },
  ANALYTICS: { group: "Automation / analytics", load: () => Promise.all([import("@/domain/seeds/analytics"),import("./analytics/index")]) },
  FIN: { group: "Finance and CRM / fin", load: () => Promise.all([import("@/domain/seeds/fin"),import("./fin/index")]) },
  CRM: { group: "Finance and CRM / crm", load: () => Promise.all([import("@/domain/seeds/crm"),import("./crm/index")]) },
  HR: { group: "People and operations / hr", load: () => Promise.all([import("@/domain/seeds/hr"),import("./hr/index")]) },
  PROJECT: { group: "People and operations / project", load: () => Promise.all([import("@/domain/seeds/project"),import("./project/index")]) },
  COMMS: { group: "People and operations / comms", load: () => Promise.all([import("@/domain/seeds/comms"),import("./comms/index")]) },
  CARE: { group: "People and operations / care", load: () => Promise.all([import("@/domain/seeds/care"),import("./care/index")]) },
  LEGAL: { group: "People and operations / legal", load: () => Promise.all([import("@/domain/seeds/legal"),import("./legal/index")]) },
  MARKET: { group: "Growth / market", load: () => Promise.all([import("@/domain/seeds/market"),import("./market/index")]) },
  COMMERCE: { group: "Growth / commerce", load: () => Promise.all([import("@/domain/seeds/commerce"),import("./commerce/index")]) },
  BOOK: { group: "Growth / book", load: () => Promise.all([import("@/domain/seeds/book"),import("./book/index")]) },
  PROC: { group: "Growth / proc", load: () => Promise.all([import("@/domain/seeds/proc"),import("./proc/index")]) },
  PORTAL: { group: "Growth / portal", load: () => Promise.all([import("@/domain/seeds/portal"),import("./portal/index")]) },
  DOCS: { group: "Documents / docs", load: () => Promise.all([import("@/domain/seeds/docs"),import("./docs/index")]) },
  SHEETS: { group: "Documents / sheets", load: () => Promise.all([import("@/domain/seeds/sheets"),import("./sheets/index")]) },
  PRESENT: { group: "Documents / present", load: () => Promise.all([import("@/domain/seeds/present"),import("./present/index")]) },
  DESIGN: { group: "Visual tools / design", load: () => Promise.all([import("@/domain/seeds/design"),import("./design/index")]) },
  PHOTO: { group: "Visual tools / photo", load: () => Promise.all([import("@/domain/seeds/photo"),import("./photo/index")]) },
  LAYOUT: { group: "Visual tools / layout", load: () => Promise.all([import("@/domain/seeds/layout"),import("./layout/index")]) },
  VIDEO: { group: "Visual tools / video", load: () => Promise.all([import("@/domain/seeds/video"),import("./video/index")]) },
  MOTION: { group: "Visual tools / motion", load: () => Promise.all([import("@/domain/seeds/motion"),import("./motion/index")]) },
  WEB: { group: "Platform / web", load: () => Promise.all([import("@/domain/seeds/web"),import("./web/index")]) },
  FORMS: { group: "Platform / forms", load: () => Promise.all([import("@/domain/seeds/forms"),import("./forms/index")]) },
  BUILD: { group: "Platform / build", load: () => Promise.all([import("@/domain/seeds/build"),import("./build/index")]) },
  CONNECT: { group: "Platform / connect", load: () => Promise.all([import("@/domain/seeds/connect"),import("./connect/index")]) },
  IT: { group: "Platform / it", load: () => Promise.all([import("@/domain/seeds/it"),import("./it/index")]) },
};
const SEED_MODULES: Record<string, () => Promise<unknown>> = {
  INBOX: () => import("@/domain/seeds/inbox"),
  ADMIN: () => import("@/domain/seeds/admin"),
  ASSET: () => import("@/domain/seeds/asset"),
  AI: () => import("@/domain/seeds/ai"),
  BRAIN: () => import("@/domain/seeds/brain"),
  TEAM: () => import("@/domain/seeds/team"),
  MISSION: () => import("@/domain/seeds/mission"),
  AUTO: () => import("@/domain/seeds/auto"),
  ANALYTICS: () => import("@/domain/seeds/analytics"),
  FIN: () => import("@/domain/seeds/fin"),
  CRM: () => import("@/domain/seeds/crm"),
  HR: () => import("@/domain/seeds/hr"),
  PROJECT: () => import("@/domain/seeds/project"),
  COMMS: () => import("@/domain/seeds/comms"),
  CARE: () => import("@/domain/seeds/care"),
  LEGAL: () => import("@/domain/seeds/legal"),
  MARKET: () => import("@/domain/seeds/market"),
  COMMERCE: () => import("@/domain/seeds/commerce"),
  BOOK: () => import("@/domain/seeds/book"),
  PROC: () => import("@/domain/seeds/proc"),
  PORTAL: () => import("@/domain/seeds/portal"),
  DOCS: () => import("@/domain/seeds/docs"),
  SHEETS: () => import("@/domain/seeds/sheets"),
  PRESENT: () => import("@/domain/seeds/present"),
  DESIGN: () => import("@/domain/seeds/design"),
  PHOTO: () => import("@/domain/seeds/photo"),
  LAYOUT: () => import("@/domain/seeds/layout"),
  VIDEO: () => import("@/domain/seeds/video"),
  MOTION: () => import("@/domain/seeds/motion"),
  WEB: () => import("@/domain/seeds/web"),
  FORMS: () => import("@/domain/seeds/forms"),
  BUILD: () => import("@/domain/seeds/build"),
  CONNECT: () => import("@/domain/seeds/connect"),
  IT: () => import("@/domain/seeds/it"),
};
const states = new Map<string, ApplicationLoadStatus>();
const pending = new Map<string, Promise<void>>();
const failures = new Map<string, LoadFailure>();
let core: Promise<void> | null = null;

function mark(code: string, state: ApplicationLoadStatus): void {
  states.set(code, state);
  notifyApplicationRegistry();
}
export function applicationStatus(code: string): ApplicationLoadStatus {
  if(code === "HQ") return states.get("HQ") ?? "idle";
  return states.get(code) ?? "idle";
}
/** Kept for existing callers; it now describes only ongoing explicit loads. */
export function applicationsLoading(): boolean {
  return [...states.values()].some(state => state === "loading");
}
export function applicationLoadFailures(): LoadFailure[] {
  return [...failures.values()];
}
export function loadCoreApplications(): Promise<void> {
  if(core) return core;
  mark("HQ","loading");
  core = HQ.load().then(() => {mark("HQ","ready");}).catch(error => {
    mark("HQ","failed");
    failures.set("HQ",{group:HQ.group,message:error instanceof Error?error.message:String(error)});
    throw error;
  });
  return core;
}
/** Reuse the same promise for navigation, prefetch, and repeated visits. */
export function loadNativeApplication(code: string): Promise<void> {
  if(code === "HQ") return loadCoreApplications();
  const entry = NATIVE[code];
  if(!entry) return Promise.reject(new Error(`Unregistered native application: ${code}`));
  const existing = pending.get(code);
  if(existing) return existing;
  mark(code,"loading");
  const task = entry.load()
    .then(async () => { await seedLateContributors(); failures.delete(code); mark(code,"ready"); })
    .catch(error => {
      const message = error instanceof Error?error.message:String(error);
      failures.set(code,{group:entry.group,message});
      console.error(`Arlovi: ${entry.group} failed to load.`,error);
      mark(code,"failed");
      pending.delete(code); // Retrying explicitly is allowed after a network failure.
      throw error;
    });
  pending.set(code,task);
  return task;
}
/** Prefetch only on a concrete user navigation hint, not automatically on boot. */
export function prefetchNativeApplication(code: string): Promise<void> {
  if(code === "HQ" || !NATIVE[code] || states.get(code) === "ready") return Promise.resolve();
  return loadNativeApplication(code);
}
/** Opt-in full registry loading for diagnostics and deliberate compatibility tests. */
export async function loadApplications(): Promise<LoadFailure[]> {
  await Promise.allSettled([loadCoreApplications(),...Object.keys(NATIVE).map(code=>loadNativeApplication(code))]);
  return applicationLoadFailures();
}
/**
 * Every application's fixtures, without its screens. Records in one
 * application routinely reference another's (a care case names a CRM account,
 * a mission names an AI employee), so those references must resolve before the
 * owning application has been opened. Seed modules are data-only and load in
 * the background after the workspace is ready; screen code stays on demand.
 */
let allSeeds: Promise<void> | null = null;
export function loadAllSeeds(): Promise<void> {
  if (allSeeds) return allSeeds;
  const codes = Object.keys(NATIVE);
  allSeeds = Promise.allSettled(codes.map(code => SEED_MODULES[code]?.()))
    .then(async (outcomes) => {
      // Seed whatever did load, then report a partial load as a failure so a
      // screen that counts across applications never treats it as complete.
      await seedLateContributors();
      const missing = codes.filter((_, index) => outcomes[index].status === "rejected");
      if (missing.length) throw new Error(`Fixtures did not load for: ${missing.join(", ")}`);
    })
    .catch(error => {
      allSeeds = null; // A later call may retry.
      console.error("Arlovi: background fixtures failed to load.", error);
      throw error;
    });
  return allSeeds;
}
export const NATIVE_APPLICATION_CODES: readonly string[] = Object.keys(NATIVE);
