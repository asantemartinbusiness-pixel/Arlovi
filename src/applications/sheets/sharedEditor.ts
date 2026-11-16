import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";

/* ====================================================================== *
 * One editor per open record, for editors built on their own hook.
 *
 * The first component that opens a record owns its editor (document, undo
 * history, autosave); any other component that opens the same record while
 * it is mounted borrows that editor instead of loading a second copy that
 * would save over it. `active(id)` gives screen actions the same editor, so
 * an action is one step on the same undo stack as a keystroke.
 * ====================================================================== */

export function shareEditor<E extends { record?: Rec }>(
  useOwn: (context: ScreenContext, record: Rec | undefined) => E,
  signature: (editor: E) => unknown[],
) {
  interface Slot { editor: E | null }
  const slots = new Map<string, Slot[]>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => { version += 1; for (const listener of listeners) listener(); };
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

  function useShared(context: ScreenContext, record: Rec | undefined): E {
    useSyncExternalStore(subscribe, () => version, () => version);
    const slot = useRef<Slot>({ editor: null });
    const id = record?.id;
    const primary = id ? slots.get(id)?.[0] : undefined;
    const borrowing = Boolean(primary && primary !== slot.current && primary.editor);
    const own = useOwn(context, borrowing ? undefined : record);

    useEffect(() => {
      if (!id) return undefined;
      const current = slot.current;
      slots.set(id, [...(slots.get(id) ?? []), current]);
      emit();
      return () => {
        const rest = (slots.get(id) ?? []).filter((item) => item !== current);
        if (rest.length) slots.set(id, rest); else slots.delete(id);
        emit();
      };
    }, [id]);

    const last = useRef<unknown[]>([]);
    useEffect(() => {
      slot.current.editor = own;
      const next = signature(own);
      if (next.some((value, index) => value !== last.current[index])) {
        last.current = next;
        if (id && slots.get(id)?.[0] === slot.current) emit();
      }
    });

    if (borrowing && primary?.editor) return { ...primary.editor, record: record ?? primary.editor.record };
    return own;
  }

  function active(id: string | undefined): E | undefined {
    return (id ? slots.get(id)?.[0]?.editor : undefined) ?? undefined;
  }

  return { useShared, active };
}
