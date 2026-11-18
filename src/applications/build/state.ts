import { create } from "zustand";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { readApp, type AppModel, type ScreenComponent } from "./model";

interface BuildUi {
  screenId: string;
  componentId: string;
  entityId: string;
  previewRole: string;
  setScreen: (id: string) => void;
  selectComponent: (id: string) => void;
  selectEntity: (id: string) => void;
  setPreviewRole: (id: string) => void;
}

export const useBuildUi = create<BuildUi>((set) => ({
  screenId: "",
  componentId: "",
  entityId: "",
  previewRole: "",
  setScreen: (id) => set({ screenId: id, componentId: "" }),
  selectComponent: (id) => set({ componentId: id }),
  selectEntity: (id) => set({ entityId: id }),
  setPreviewRole: (id) => set({ previewRole: id }),
}));

export async function saveApp(context: ScreenContext, record: Rec, next: AppModel, label: string): Promise<void> {
  await context.mutate.patch(record.id, { body: next }, { expectRevision: record.revision, event: label });
}

/*
 * Component edits arrive faster than the live record updates (a select
 * change right after typing a filter value). Each edit is queued, applied
 * to the latest stored model and saved with that revision, so one edit
 * never overwrites or conflicts with the one before it.
 */
let componentQueue: Promise<void> = Promise.resolve();

/** A change to one component: fields to set, or a function of the latest stored component. */
export type ComponentPatch = Partial<ScreenComponent> | ((current: ScreenComponent) => Partial<ScreenComponent>);

export function editComponent(context: ScreenContext, recordId: string, componentId: string, patch: ComponentPatch, label: string): Promise<void> {
  const run = async () => {
    const repo = await import("@/platform/repo");
    const latest = await repo.getRecordInOrg(context.org.id, recordId);
    if (!latest) return;
    const model = readApp(latest);
    if (!model.screens.some((screen) => screen.components.some((component) => component.id === componentId))) return;
    const next: AppModel = {
      ...model,
      screens: model.screens.map((screen) => ({
        ...screen,
        components: screen.components.map((component) => (component.id === componentId ? { ...component, ...(typeof patch === "function" ? patch(component) : patch) } : component)),
      })),
    };
    await saveApp(context, latest, next, label);
  };
  componentQueue = componentQueue.then(run, run);
  return componentQueue;
}
