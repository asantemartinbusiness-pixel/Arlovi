import { Clapperboard, Cpu, Download, FolderOpen, MousePointerClick, Spline } from "lucide-react";
import { OVERLAY_WIDTH, OverlayActions, OverlayCancel } from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { stagger } from "./anim";
import { motionUi, parseMotion } from "./model";
import { current } from "./shared";
import {
  AssetLibrary, CompositionSetup, ImportComposition, ProjectsTab, PublishTemplate, type ProjectLens,
} from "./projects";
import {
  EditorScreen, KeyboardHelp, KeyframeEditor, KeyframeSummary, LayerInspector, LayerSummary, MotionPicker, selectedKeyframe, selectedLayer, setKeyframeHere,
} from "./editor";
import { CurveEditor, EasingScreen, LoopValidation, TimingPreview, runMotionTest } from "./easing";
import { loopSeams } from "./anim";
import {
  BindTrigger, DevicePreview, InteractionGuard, InteractiveScreen, RemoveTrigger, StateInspector, exportInteractions, recordInteractionTest,
} from "./interactive";
import {
  CompatibilityOverlay, ExportOptionsOverlay, ExportScreen, FORMATS, PublishExport, ReducedMotionReview, exportOptions, testFallback,
} from "./export";
import "./motion.css";

/* ====================================================================== *
 * MOTION — Motion Graphics & Animation
 *
 * A keyframe editor on real properties (position, scale, rotation,
 * opacity, colour, letter spacing, blur), an easing graph with draggable
 * and keyboard-movable handles, playback at the composition's frame rate,
 * interaction states and triggers driven by one reducer, and exports that
 * write real CSS, HTML, SVG, WebM, GIF and JSON files.
 * ====================================================================== */

const noDoc = () => (current() ? undefined : "Open a composition first");

/* ---------------------------- MOTION-001 ---------------------------- */

const PROJECT_ACTIONS: ActionDef[] = [
  { id: "Create", label: "Create a composition", placement: "primary", run: (context) => context.openOverlay("Composition setup") },
  { id: "import", label: "Import a file", placement: "secondary", run: (context) => context.openOverlay("import composition") },
  {
    id: "duplicate", label: "Duplicate", placement: "overflow",
    guard: (context) => (context.selectedId ? undefined : "Select a composition first"),
    run: async (context) => {
      const { db } = await import("@/runtime/db");
      const record = await db.records.get(context.selectedId!);
      if (!record || record.collection !== "motions") { context.toast("Nothing duplicated", "Select a composition first.", "blocked"); return; }
      const doc = parseMotion(record.body);
      const made = await context.mutate.create({
        collection: "motions", title: `${record.title} copy`, status: "draft",
        summary: `Duplicated from ${record.title}. Keyframes, states and asset links are copied; render history and tests start empty.`,
        body: { ...doc, renders: [], tests: [], review: { state: "not_required", reasons: [] }, fallbackReview: undefined },
        fields: { ...record.fields, kind: "composition", duplicatedFrom: record.id, sharedWith: "", publishedBy: "", publishedAt: "" },
      }, `Duplicated ${record.title}`);
      context.select(made.id);
      context.setTab("Recent");
      context.toast("Duplicated", `${made.title} is its own record, selected in Recent.`);
    },
  },
  {
    id: "open", label: "Open in the editor", placement: "secondary",
    guard: (context) => (context.selectedId ? undefined : "Select a composition first"),
    run: (context) => context.navigate(context.path("/o/:org/motion/projects/:id", context.selectedId)),
  },
  {
    id: "publish template", label: "Publish as a brand template", placement: "overflow",
    guard: (context) => (context.selectedId ? undefined : "Select a composition first"),
    run: (context) => context.openOverlay("publish", { id: context.selectedId }),
  },
  {
    id: "asset links", label: "Linked assets", placement: "overflow",
    guard: (context) => (context.selectedId ? undefined : "Select a composition first"),
    run: (context) => context.openOverlay("asset library", { id: context.selectedId }),
  },
];

/* ---------------------------- MOTION-002 ---------------------------- */

const EDITOR_ACTIONS: ActionDef[] = [
  {
    id: "Set keyframe", label: "Set keyframe (K)", placement: "primary", shortcut: "K",
    guard: () => {
      const open = current();
      if (!open) return "Open a composition first";
      const layer = selectedLayer(open.doc);
      if (!layer) return "Select a layer first";
      return layer.locked ? `${layer.name} is locked` : undefined;
    },
    run: (context) => {
      const open = current();
      if (!open) return;
      const blocked = setKeyframeHere(open.handle);
      if (blocked) context.toast("No keyframe set", blocked, "blocked");
    },
  },
  {
    id: "drag curve", label: "Drag the easing curve", placement: "secondary",
    guard: () => {
      const open = current();
      if (!open) return "Open a composition first";
      const found = selectedKeyframe(open.doc);
      if (!found) return "Select a keyframe on the timeline first";
      return found.next ? undefined : "The last keyframe of a property has no curve after it";
    },
    run: (context) => context.openOverlay("Keyframe editor"),
  },
  {
    id: "animate", label: "Animate mode (auto-key)", placement: "secondary",
    guard: noDoc,
    run: (context) => {
      const next = !motionUi.get().animate;
      motionUi.set((currentUi) => ({ ...currentUi, animate: next }));
      context.toast(next ? "Animate mode on" : "Animate mode off", next ? "Changing a property or dragging on the stage now writes a keyframe at the playhead." : "Changes now move the whole property and keep its animation.", "info");
    },
  },
  {
    id: "preview", label: "Preview", placement: "secondary",
    guard: noDoc,
    run: (context) => {
      context.setTab("Preview");
      motionUi.set((currentUi) => ({ ...currentUi, time: 0, playing: true }));
    },
  },
  {
    id: "undo", label: "Undo", placement: "secondary", shortcut: "Ctrl+Z",
    guard: () => {
      const open = current();
      if (!open) return "Open a composition first";
      return open.handle.canUndo ? undefined : "Nothing to undo";
    },
    run: () => { current()?.handle.undo(); },
  },
  {
    id: "redo", label: "Redo", placement: "overflow",
    guard: () => (current()?.handle.canRedo ? undefined : "Nothing to redo"),
    run: () => { current()?.handle.redo(); },
  },
  {
    id: "motion preset", label: "Apply a motion preset…", placement: "overflow",
    guard: () => (current() && selectedLayer(current()!.doc) ? undefined : "Select a layer first"),
    run: (context) => context.openOverlay("motion picker"),
  },
  {
    id: "inspect layer", label: "Layer inspector", placement: "overflow",
    guard: () => (current() && selectedLayer(current()!.doc) ? undefined : "Select a layer first"),
    run: (context) => context.openOverlay("layer inspector"),
  },
];

/* ---------------------------- MOTION-003 ---------------------------- */

const EASING_ACTIONS: ActionDef[] = [
  {
    id: "Edit easing", label: "Edit easing", placement: "primary",
    guard: () => {
      const open = current();
      if (!open) return "Open a composition first";
      return selectedKeyframe(open.doc) ? undefined : "Choose a segment on the left first";
    },
    run: (context) => context.openOverlay("Curve editor"),
  },
  {
    id: "stagger", label: "Stagger", placement: "secondary",
    guard: () => (motionUi.get().staggerIds.length >= 2 ? undefined : "Choose two or more layers on the Timing tab"),
    run: (context) => {
      const open = current();
      if (!open) return;
      const { staggerIds, staggerStep } = motionUi.get();
      open.handle.edit((doc) => stagger(doc, staggerIds, staggerStep), `Stagger ${staggerIds.length} layers by ${staggerStep}s`);
      context.toast("Staggered", `${staggerIds.length} layers now start ${staggerStep}s apart, in the order chosen.`);
    },
  },
  {
    id: "loop", label: "Loop on or off", placement: "secondary",
    guard: noDoc,
    run: (context) => {
      const open = current();
      if (!open) return;
      const turningOn = !open.doc.loop;
      open.handle.edit((doc) => ({ ...doc, loop: turningOn }), turningOn ? "Loop" : "Play once");
      if (turningOn && loopSeams(open.doc).length > 0) context.openOverlay("loop validation");
      else context.toast(turningOn ? "Looping" : "Plays once", turningOn ? "The loop is seamless." : "The composition stops on its last frame.", "info");
    },
  },
  {
    id: "test", label: "Test for flashing and fast motion", placement: "secondary",
    guard: noDoc,
    run: (context) => {
      const open = current();
      if (!open) return;
      const result = runMotionTest(open.handle, context.actor);
      if (!result) return;
      context.toast(result.pass ? "Motion test passed" : "Accessibility review required", result.pass ? "No flashing, large-area travel or fast zoom was found." : `${result.findings.length} finding(s). The review is required before publishing.`, result.pass ? "ok" : "blocked");
    },
  },
  { id: "timing", label: "Timing preview", placement: "overflow", guard: () => (current() && selectedKeyframe(current()!.doc)?.next ? undefined : "Choose a segment first"), run: (context) => context.openOverlay("timing preview") },
  { id: "check loop", label: "Loop validation", placement: "overflow", guard: noDoc, run: (context) => context.openOverlay("loop validation") },
];

/* ---------------------------- MOTION-004 ---------------------------- */

const INTERACTIVE_ACTIONS: ActionDef[] = [
  { id: "Bind trigger", label: "Bind a trigger", placement: "primary", guard: noDoc, run: (context) => context.openOverlay("bind trigger") },
  {
    id: "test", label: "Test pointer, keyboard and touch", placement: "secondary", guard: noDoc,
    run: (context) => {
      const open = current();
      if (!open) return;
      const result = recordInteractionTest(open.handle, context.actor);
      if (!result) return;
      if (!result.pass) context.openOverlay("interaction guard");
      else context.toast("Interaction test passed", "Every trigger reaches its state by pointer, keyboard and touch.");
    },
  },
  {
    id: "remove", label: "Remove the trigger", placement: "overflow", tone: "danger",
    guard: () => (motionUi.get().selectedTriggerId && current()?.doc.triggers.some((trigger) => trigger.id === motionUi.get().selectedTriggerId) ? undefined : "Select a trigger on the Triggers tab"),
    run: (context) => context.openOverlay("remove trigger"),
  },
  {
    id: "export", label: "Export the interactions", placement: "secondary",
    guard: () => (current() ? (current()!.doc.triggers.length > 0 ? undefined : "Bind a trigger first") : "Open a composition first"),
    run: (context) => exportInteractions(context),
  },
  { id: "inspect state", label: "State inspector", placement: "overflow", guard: noDoc, run: (context) => context.openOverlay("State inspector") },
  { id: "devices", label: "Device preview", placement: "overflow", guard: noDoc, run: (context) => context.openOverlay("device preview") },
];

/* ---------------------------- MOTION-005 ---------------------------- */

const EXPORT_ACTIONS: ActionDef[] = [
  {
    id: "Render", label: "Render video or GIF", placement: "primary", guard: noDoc,
    run: (context) => {
      if (FORMATS.find((format) => format.id === exportOptions.get().format)?.kind !== "raster") exportOptions.set((options) => ({ ...options, format: "gif", width: Math.min(options.width, 640), fps: Math.min(options.fps, 15) }));
      context.openOverlay("Export options", { mode: "render" });
    },
  },
  {
    id: "test fallback", label: "Test the reduced-motion fallback", placement: "secondary", guard: noDoc,
    run: (context) => {
      const open = current();
      if (!open) return;
      testFallback(open.handle, context.actor, open.title);
      context.openOverlay("reduced-motion review");
    },
  },
  {
    id: "export", label: "Export a file", placement: "primary", guard: noDoc,
    run: (context) => {
      const format = FORMATS.find((item) => item.id === exportOptions.get().format);
      if (format?.kind !== "text") exportOptions.set((options) => ({ ...options, format: "css" }));
      context.openOverlay("Export options", { mode: "export" });
    },
  },
  {
    id: "publish", label: "Publish", placement: "overflow",
    guard: () => {
      const open = current();
      if (!open) return "Open a composition first";
      if (open.doc.review.state === "required") return "The accessibility review on Easing & Timing is outstanding";
      return open.doc.renders.some((render) => render.state === "done") ? undefined : "Export or render a file first";
    },
    run: (context) => context.openOverlay("publish export"),
  },
  { id: "compat", label: "Compatibility matrix", placement: "overflow", guard: noDoc, run: (context) => context.openOverlay("compatibility") },
];

/* ---------------------------- registration ---------------------------- */

const closeFooter = (_context: ScreenContext & { close: () => void }) => <OverlayActions end={<OverlayCancel>Close</OverlayCancel>} />;

registerApp({
  code: "MOTION",
  short: "Motion",
  name: "Motion Graphics & Animation",
  purpose: "Keyframes on real properties, easing curves, interaction states, and exports that write real files.",
  icon: Cpu,
  nav: [
    { label: "Projects", items: [{ label: "Motion projects", screenId: "ARL-MOTION-001", icon: FolderOpen }] },
    {
      label: "The open composition",
      items: [
        { label: "Composition editor", screenId: "ARL-MOTION-002", icon: Clapperboard },
        { label: "Easing and timing", screenId: "ARL-MOTION-003", icon: Spline },
        { label: "Interactive motion", screenId: "ARL-MOTION-004", icon: MousePointerClick },
        { label: "Motion export", screenId: "ARL-MOTION-005", icon: Download },
      ],
    },
  ],
  screens: {
    "ARL-MOTION-001": {
      id: "ARL-MOTION-001",
      tabs: (["Recent", "Shared", "Templates", "Renders"] as ProjectLens[]).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ProjectsTab context={context} lens={lens} />,
      })),
      actions: PROJECT_ACTIONS,
      overlays: [
        { id: "Composition setup", kind: "modal", title: "New composition", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <CompositionSetup context={context} close={close} /> },
        { id: "asset library", kind: "drawer", title: "Linked assets", width: OVERLAY_WIDTH.form, render: ({ close: _close, ...context }) => <AssetLibrary context={context} /> },
        { id: "publish", kind: "modal", title: "Publish as a brand template", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <PublishTemplate context={context} close={close} /> },
        { id: "import composition", kind: "modal", title: "Import a composition", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ImportComposition context={context} close={close} /> },
      ],
    },

    "ARL-MOTION-002": {
      id: "ARL-MOTION-002",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <EditorScreen context={context} actions={EDITOR_ACTIONS} />,
      tabs: (["Animate", "Design", "Effects", "Preview"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EditorScreen context={context} actions={EDITOR_ACTIONS} />,
      })),
      actions: EDITOR_ACTIONS,
      overlays: [
        { id: "Keyframe editor", kind: "modal", title: "Keyframe", width: OVERLAY_WIDTH.modal, summary: () => <KeyframeSummary />, render: ({ close }) => <KeyframeEditor close={close} /> },
        { id: "layer inspector", kind: "drawer", title: "Layer", width: OVERLAY_WIDTH.form, summary: () => <LayerSummary />, render: ({ close }) => <LayerInspector close={close} /> },
        { id: "motion picker", kind: "modal", title: "Apply a motion preset", width: OVERLAY_WIDTH.wide, render: ({ close }) => <MotionPicker close={close} /> },
        { id: "keyboard", kind: "modal", title: "Keyboard", width: OVERLAY_WIDTH.form, render: () => <KeyboardHelp />, footer: closeFooter },
      ],
    },

    "ARL-MOTION-003": {
      id: "ARL-MOTION-003",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <EasingScreen context={context} actions={EASING_ACTIONS} />,
      tabs: (["Curves", "Timing", "Presets", "Spring"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EasingScreen context={context} actions={EASING_ACTIONS} />,
      })),
      actions: EASING_ACTIONS,
      overlays: [
        { id: "Curve editor", kind: "modal", title: "Curve editor", width: OVERLAY_WIDTH.modal, render: ({ close }) => <CurveEditor close={close} /> },
        { id: "loop validation", kind: "modal", title: "Loop validation", width: OVERLAY_WIDTH.modal, render: ({ close }) => <LoopValidation close={close} /> },
        { id: "timing preview", kind: "modal", title: "Timing preview", width: OVERLAY_WIDTH.modal, render: () => <TimingPreview />, footer: closeFooter },
      ],
    },

    "ARL-MOTION-004": {
      id: "ARL-MOTION-004",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <InteractiveScreen context={context} actions={INTERACTIVE_ACTIONS} />,
      tabs: (["States", "Triggers", "Preview", "Export"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <InteractiveScreen context={context} actions={INTERACTIVE_ACTIONS} />,
      })),
      actions: INTERACTIVE_ACTIONS,
      overlays: [
        { id: "State inspector", kind: "drawer", title: "State", width: OVERLAY_WIDTH.form, render: ({ close }) => <StateInspector close={close} /> },
        { id: "interaction guard", kind: "modal", title: "Interaction guard", width: OVERLAY_WIDTH.modal, render: ({ close }) => <InteractionGuard close={close} /> },
        { id: "device preview", kind: "modal", title: "Device preview", width: OVERLAY_WIDTH.wide, render: () => <DevicePreview />, footer: closeFooter },
        { id: "bind trigger", kind: "modal", title: "Bind a trigger", width: OVERLAY_WIDTH.form, render: ({ close }) => <BindTrigger close={close} /> },
        { id: "remove trigger", kind: "modal", title: "Remove the trigger", width: OVERLAY_WIDTH.compact, tone: "danger", render: ({ close }) => <RemoveTrigger close={close} /> },
      ],
    },

    "ARL-MOTION-005": {
      id: "ARL-MOTION-005",
      chrome: "full",
      chromeTitle: "surface",
      surface: (context) => <ExportScreen context={context} actions={EXPORT_ACTIONS} />,
      tabs: (["Formats", "Presets", "Queue", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExportScreen context={context} actions={EXPORT_ACTIONS} />,
      })),
      actions: EXPORT_ACTIONS,
      overlays: [
        { id: "Export options", kind: "modal", title: (context) => ((context.overlayPayload as { mode?: string } | undefined)?.mode === "render" ? "Render" : "Export"), width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ExportOptionsOverlay context={context} close={close} /> },
        { id: "reduced-motion review", kind: "modal", title: "Reduced-motion review", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReducedMotionReview context={context} close={close} /> },
        { id: "compatibility", kind: "modal", title: "Compatibility", width: OVERLAY_WIDTH.wide, render: () => <CompatibilityOverlay />, footer: closeFooter },
        { id: "publish export", kind: "modal", title: "Publish", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <PublishExport context={context} close={close} /> },
      ],
    },
  },
});
