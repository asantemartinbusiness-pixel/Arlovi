import { create } from "zustand";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import type { FormModel } from "./model";

interface FormsUi {
  selectedFieldId: string;
  device: "mobile" | "desktop";
  select: (id: string) => void;
  setDevice: (value: "mobile" | "desktop") => void;
}

export const useFormsUi = create<FormsUi>((set) => ({
  selectedFieldId: "",
  device: "desktop",
  select: (id) => set({ selectedFieldId: id }),
  setDevice: (value) => set({ device: value }),
}));

export async function saveForm(context: ScreenContext, record: Rec, next: FormModel, label: string): Promise<void> {
  await context.mutate.patch(record.id, { body: next }, { expectRevision: record.revision, event: label });
}
