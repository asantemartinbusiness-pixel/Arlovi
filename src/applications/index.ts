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
  { group: "Growth", load: () => import("./t4_growth") },
  { group: "Documents", load: () => import("./t5a_documents") },
  { group: "Visual tools", load: () => import("./t5b_visual") },
  { group: "Platform", load: () => import("./t6_platform") },
];

let loading: Promise<LoadFailure[]> | null = null;
let failures: LoadFailure[] = [];

export function loadApplications(): Promise<LoadFailure[]> {
  loading ??= Promise.allSettled(GROUPS.map((item) => item.load())).then((results) => {
    failures = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      const reason = result.reason as unknown;
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`Arlovi: the ${GROUPS[index].group} applications failed to load. ${message}`);
      return [{ group: GROUPS[index].group, message }];
    });
    return failures;
  });
  return loading;
}

export function applicationLoadFailures(): LoadFailure[] {
  return failures;
}
