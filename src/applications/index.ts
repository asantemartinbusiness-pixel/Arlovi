/**
 * Application registry. Each module registers its own screens, tabs, actions
 * and overlays. Loading this file wires every native application into the
 * shell; nothing here renders a shared page for another application.
 *
 * Each workstream loads independently. With one static import graph, a single
 * broken module failed the whole graph at link time and blanked every
 * application at once. Loading each group on its own means a failure is
 * recorded and the rest of headquarters keeps working.
 */

import { notifyApplicationRegistry } from "@/platform/registry";

export interface LoadFailure {
  group: string;
  message: string;
}

const GROUPS: { group: string; load: () => Promise<unknown> }[] = [
  { group: "Headquarters", load: () => Promise.all([import("@/domain/seeds/hq"), import("./hq/index")]) },
  { group: "Workplace", load: () => import("./t1_workplace") },
  { group: "Intelligence", load: () => import("./t2_intelligence") },
  { group: "Automation", load: () => import("./t2b_automation") },
  { group: "Finance and CRM", load: () => import("./t3a_money") },
  { group: "People and operations", load: () => import("./t3b_people") },
  { group: "Growth", load: () => Promise.all([
    import("@/domain/seeds/market"), import("./market/index"),
    import("@/domain/seeds/commerce"), import("./commerce/index"),
    import("@/domain/seeds/book"), import("./book/index"),
    import("@/domain/seeds/proc"), import("./proc/index"),
    import("@/domain/seeds/portal"), import("./portal/index"),
  ]) },
  { group: "Documents", load: () => import("./t5a_documents") },
  { group: "Visual tools", load: () => Promise.all([
    import("@/domain/seeds/design"), import("./design/index"),
    import("@/domain/seeds/photo"), import("./photo/index"),
    import("@/domain/seeds/layout"), import("./layout/index"),
    import("@/domain/seeds/video"), import("./video/index"),
    import("@/domain/seeds/motion"), import("./motion/index"),
  ]) },
  { group: "Platform", load: () => import("./t6_platform") },
];

let loading: Promise<LoadFailure[]> | null = null;
let coreLoading: Promise<void> | null = null;
let complete = false;
export function applicationsLoading(): boolean { return !complete; }
/** Load only HQ and its seed contributor to prepare the local workspace. */
export function loadCoreApplications(): Promise<void> {
  coreLoading ??= GROUPS[0].load().then(() => undefined);
  return coreLoading;
}
let failures: LoadFailure[] = [];

export function loadApplications(): Promise<LoadFailure[]> {
  loading ??= Promise.allSettled(GROUPS.map((item, index) => index === 0 ? loadCoreApplications() : item.load())).then((results) => {
    failures = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      const reason = result.reason as unknown;
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`Arlovi: the ${GROUPS[index].group} applications failed to load. ${message}`);
      return [{ group: GROUPS[index].group, message }];
    });
    complete = true;
    notifyApplicationRegistry();
    return failures;
  });
  return loading;
}

export function applicationLoadFailures(): LoadFailure[] {
  return failures;
}
