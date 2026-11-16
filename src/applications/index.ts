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
  { group: "Workplace", load: () => Promise.all([
    import("@/domain/seeds/inbox"), import("./inbox/index"),
    import("@/domain/seeds/admin"), import("./admin/index"),
    import("@/domain/seeds/asset"), import("./asset/index"),
  ]) },
  { group: "Intelligence", load: () => Promise.all([
    import("@/domain/seeds/ai"), import("./ai/index"),
    import("@/domain/seeds/brain"), import("./brain/index"),
    import("@/domain/seeds/team"), import("./team/index"),
    import("@/domain/seeds/mission"), import("./mission/index"),
  ]) },
  { group: "Automation", load: () => Promise.all([
    import("@/domain/seeds/auto"), import("./auto/index"),
    import("@/domain/seeds/analytics"), import("./analytics/index"),
  ]) },
  { group: "Finance and CRM", load: () => Promise.all([
    import("@/domain/seeds/fin"), import("./fin/index"),
    import("@/domain/seeds/crm"), import("./crm/index"),
  ]) },
  { group: "People and operations", load: () => Promise.all([
    import("@/domain/seeds/hr"), import("./hr/index"),
    import("@/domain/seeds/project"), import("./project/index"),
    import("@/domain/seeds/comms"), import("./comms/index"),
    import("@/domain/seeds/care"), import("./care/index"),
    import("@/domain/seeds/legal"), import("./legal/index"),
  ]) },
  { group: "Growth", load: () => Promise.all([
    import("@/domain/seeds/market"), import("./market/index"),
    import("@/domain/seeds/commerce"), import("./commerce/index"),
    import("@/domain/seeds/book"), import("./book/index"),
    import("@/domain/seeds/proc"), import("./proc/index"),
    import("@/domain/seeds/portal"), import("./portal/index"),
  ]) },
  { group: "Documents", load: () => Promise.all([
    import("@/domain/seeds/docs"), import("./docs/index"),
    import("@/domain/seeds/sheets"), import("./sheets/index"),
    import("@/domain/seeds/present"), import("./present/index"),
  ]) },
  { group: "Visual tools", load: () => Promise.all([
    import("@/domain/seeds/design"), import("./design/index"),
    import("@/domain/seeds/photo"), import("./photo/index"),
    import("@/domain/seeds/layout"), import("./layout/index"),
    import("@/domain/seeds/video"), import("./video/index"),
    import("@/domain/seeds/motion"), import("./motion/index"),
  ]) },
  { group: "Platform", load: () => Promise.all([
    import("@/domain/seeds/web"), import("./web/index"),
    import("@/domain/seeds/forms"), import("./forms/index"),
    import("@/domain/seeds/build"), import("./build/index"),
    import("@/domain/seeds/connect"), import("./connect/index"),
    import("@/domain/seeds/it"), import("./it/index"),
  ]) },
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
