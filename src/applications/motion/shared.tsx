import { cloneElement, useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { Clapperboard } from "lucide-react";
import { Button, Empty, Field } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord } from "@/platform/workspace";
import { useDoc, useStore, type DocHandle } from "@/applications/visual/kit";
import type { MotionAsset, MotionDoc } from "./anim";
import { motionSession, motionUi, parseMotion, starterMotion } from "./model";
import { useMotionPlayback } from "./parts";

/* ====================================================================== *
 * The open composition, shared by the four editor screens.
 * ====================================================================== */

/**
 * The handle of the composition being rendered right now. Guards are
 * evaluated while the toolbar renders, so they read this plain reference,
 * which is current for that render; the session store (for overlays,
 * which render outside the editor) is updated after commit.
 */
export const live: { handle?: DocHandle<MotionDoc>; recordId?: string; title?: string } = {};

export function useMotionDoc(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useDoc<MotionDoc>(record, parseMotion, context.screen.id);
  live.handle = handle;
  live.recordId = record?.id;
  live.title = record?.title;
  useEffect(() => {
    motionSession.set({ recordId: record?.id, title: record?.title, handle });
  });
  useEffect(() => () => { motionSession.set({}); live.handle = undefined; live.recordId = undefined; }, []);
  useEffect(() => {
    motionUi.set((current) => ({ ...current, time: 0, playing: false, selectedKeyframeId: undefined, selectedTriggerId: undefined, selectedLayerId: undefined, selectedStateId: undefined, staggerIds: [] }));
  }, [record?.id]);
  /* Open on the settled last frame, so the stage shows the composition rather than an empty first frame. */
  const opened = handle.doc !== null;
  const duration = handle.doc?.duration;
  useEffect(() => {
    if (opened && duration) motionUi.set((current) => ({ ...current, time: duration }));
  }, [opened, record?.id]);
  const playback = useMotionPlayback(handle.doc);
  return { record, handle, doc: handle.doc, playback };
}

/** The open handle for an action or guard. */
export function current(): { handle: DocHandle<MotionDoc>; doc: MotionDoc; recordId: string; title: string } | null {
  const handle = live.handle ?? motionSession.get().handle;
  const recordId = live.recordId ?? motionSession.get().recordId;
  if (!handle?.doc || !recordId) return null;
  return { handle, doc: handle.doc, recordId, title: live.title ?? motionSession.get().title ?? "Composition" };
}

/** For overlays, which render in the screen host rather than inside the editor. */
export function useSession(): { handle?: DocHandle<MotionDoc>; doc?: MotionDoc; recordId?: string; title?: string } {
  const session = useStore(motionSession);
  return { handle: session.handle, doc: session.handle?.doc ?? undefined, recordId: session.recordId, title: session.title };
}

export function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return Boolean(reduced);
}

/* ------------------------------ assets ------------------------------ */

export const ASSET_COLLECTIONS = ["photos", "designs", "motions"];

export interface AssetStatus { asset: MotionAsset; found: boolean; title?: string }

/** Look up whether each linked asset's record still exists in this organisation. */
export function useAssetLookup(): { ready: boolean; status: (asset: MotionAsset) => AssetStatus; candidates: { id: string; title: string; collection: string }[] } {
  const data = useCollections(ASSET_COLLECTIONS);
  const all = Object.values(data).flat();
  return {
    ready: all.length > 0,
    status: (asset) => {
      const record = asset.recordId ? all.find((item) => item.id === asset.recordId) : undefined;
      return { asset, found: Boolean(record), title: record?.title };
    },
    candidates: all.map((record) => ({ id: record.id, title: record.title, collection: record.collection })),
  };
}

export function MissingComposition({ context }: { context: ScreenContext }) {
  return (
    <Empty
      title="No composition at this address"
      icon={<Clapperboard size={20} />}
      action={
        <Button
          variant="primary"
          onClick={async () => {
            const made = await context.mutate.create({
              collection: "motions", title: "Untitled composition", status: "draft",
              summary: "Created in the composition editor.", body: starterMotion("Untitled composition"),
              fields: { kind: "composition" },
            }, "Composition created");
            context.navigate(context.path("/o/:org/motion/projects/:id", made.id));
          }}
        >
          Create a composition here
        </Button>
      }
    >
      {context.params.id ? <>The record <code className="ds-num">{context.params.id}</code> is not in {context.org.shortName}.</> : <>Open one from Motion Projects.</>}
    </Empty>
  );
}

export const SHORTCUTS = [
  { keys: "Space", does: "Play or pause at the composition's frame rate" },
  { keys: "← / →", does: "Step one frame (Shift: ten frames); on a keyframe, move it one frame" },
  { keys: "Home / End", does: "Go to the first or last frame" },
  { keys: "K", does: "Set a keyframe on the selected property at the playhead" },
  { keys: "Enter", does: "On a keyframe, open the keyframe editor" },
  { keys: "Delete", does: "On a keyframe, delete it" },
  { keys: "Arrow keys on a curve handle", does: "Move the control point (Shift: larger steps)" },
  { keys: "Ctrl/Cmd + Z, Shift + Z", does: "Undo, redo" },
];

/** A design-system Field whose label is tied to its single control by id. */
export function FormField({ label, hint, error, required, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>{cloneElement(children, { id })}</Field>;
}
