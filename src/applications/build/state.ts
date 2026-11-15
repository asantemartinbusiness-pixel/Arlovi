import { create } from "zustand";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import type { AppModel } from "./model";

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
