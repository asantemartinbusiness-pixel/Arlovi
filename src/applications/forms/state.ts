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

/** Save the form model. Other keys kept on the body (preview runs) survive the save. */
export async function saveForm(context: ScreenContext, record: Rec, next: FormModel, label: string): Promise<void> {
  const body = record.body && typeof record.body === "object" && !Array.isArray(record.body) ? record.body as Record<string, unknown> : {};
  await context.mutate.patch(record.id, { body: { ...body, ...next } }, { expectRevision: record.revision, event: label });
}
