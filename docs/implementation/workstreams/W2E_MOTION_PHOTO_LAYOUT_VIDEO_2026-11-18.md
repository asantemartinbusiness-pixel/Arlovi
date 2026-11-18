# W2E — MOTION, PHOTO, LAYOUT, VIDEO editors (2026-11-18)

Branch `w2-visual-studio`, from `29537d4`. Scope: the four studio editors and
their own files only. `src/applications/visual/kit.tsx` (shared with WEB,
CONNECT and IT) was not edited; the PHOTO-only workaround for the old
`useMeasure` bug (a measured ref on the loading placeholder) was removed now
that `kit.tsx` re-observes. No seeds needed changing.

## ARL-MOTION-002 Composition Editor — `/o/:org/motion/projects/:id`

**Status: Verified**

The editor already had layers, a scrubbable keyframe timeline, per-property
keyframes, easing presets, a draggable curve, playback and undo. This pass
closes the gaps that made it feel unfinished:

- Selected-keyframe panel: **Time** and **Value** fields (colour keyframes get
  a colour box), ← Previous / Next → through the property's keyframes, Go to
  it, **Delete keyframe**.
- **Easing preview**: an eased ball against a linear one over the real
  segment length, at the composition's frame rate; Play/Pause; starts paused
  when the OS asks for reduced motion.
- Curve drags and handle arrow keys are one undo step each (`EasingGraph`
  gained `onCommit`); the old "Mark the curve change as one undo step" button
  is gone. The Easing & Timing screen uses the same commit.
- Timeline: double-click a property row to add a keyframe there at the
  sampled value; Delete/Backspace removes the selected keyframe from anywhere
  in the editor (locked layers refuse with a reason).
- Transport: **Loop** toggle stored on the composition (undoable, exported).
- Layers: **Duplicate** (own keyframe ids, placed above, offset 16px).
- Output in the tool row: **PNG** writes the playhead frame at full
  composition size via `canvas.toBlob` and logs it on the record; **WebM**
  records the composition in real time with this browser's MediaRecorder
  (the same path as the Export screen; disabled with the browser's reason
  when there is no canvas recorder). A "recording n/m" pill shows progress.
  Toasts say "written by this browser"; nothing is uploaded or server-rendered.
- Tool row compacted to one line (`.mo-tools`, same pattern as video/layout).

Persistence: every change goes through the shared document handle; e2e reloads
and finds the retimed/revalued keyframe, the added keyframe and Loop on.
Responsive: 1440 and 390 screenshots checked; no horizontal page scroll.
Tests: `tests/unit/w2e-motion-keyframes.test.ts` (5); e2e in
`e2e/w2e-video-motion.spec.ts` (3 motion tests incl. a real WebM download).
Gaps: no multi-keyframe selection or marquee; no per-keyframe copy/paste;
"scenes" are separate compositions (the projects list), not a scene list
inside one composition.

## ARL-LAYOUT-002 Publication Editor — `/o/:org/layout/publications/:id`

**Status: Verified**

- **Multi-select**: Shift-click frames on the page or in the frames list,
  ⌘A / "Select all" for the active page. Selection stays on one page.
  Selected frames are outlined with a dashed union box.
- **Multi-frame panel**: align left/centre/right/top/middle/bottom relative to
  the selection, the margins or the trim; **distribute** horizontally or
  vertically (3+ frames, outermost stay, equal gaps); lock/unlock all;
  delete all. Locked frames never move.
- Drag any selected frame to move the group, with the same snapping to the
  grid and unselected frames; arrows nudge all; Delete removes all; one undo
  step each.
- **Rotation**: frames now render their `rotation` (it existed in the model
  but was ignored); a **rotate handle** above the selected frame (Shift snaps
  to 15°) and a Rotation (°) field. Turned frames resize in their own axes
  with the opposite handle pinned. SVG export carries the rotation.

Persistence: e2e checks the stored record after align, distribute, nudge,
undo and rotation, and that the rotation survives a reload.
Responsive: 390 checked (Select all from the Pages drawer, no overflow).
Tests: `tests/unit/w2e-layout-multi.test.ts` (10); e2e
`e2e/w2e-layout-photo.spec.ts` (2 layout tests). WS5 layout spec still green.
Gaps: no marquee (rubber-band) selection; snapping uses unrotated boxes for
turned frames (resize of a turned frame does not snap); text in a turned
frame is composed in the frame's own axes, which is correct, but overset
reporting is unchanged.

## ARL-PHOTO-002 / -003 Raster editor, Selections & masks — `/o/:org/photo/photos/:id`

**Status: Verified**

- **Bug fixed — masks never hid anything.** Masks are stored as opaque
  greyscale (white shows, black hides) but were composited with
  `destination-in`, which uses alpha. The compositor now converts brightness
  to alpha (cached per decoded mask).
- **Masks follow transforms.** Each mask records the layer geometry it was
  painted for (`maskFrame`); moving, resizing, rotating or mirroring the layer
  carries the mask with it at composite time, without resampling. Painting on
  a moved mask starts from where it now shows. Old masks get a frame on open.
- **Whole-image rotate/flip no longer blocked by a mask**: each mask bitmap is
  redrawn through the same transform; only an undecodable mask blocks, with
  its layer named. Crop/straighten also cuts and turns masks.

Persistence/output: the e2e composites the saved record with the editor's own
compositor and checks the hidden half moves from left → top (rotate right) →
bottom (flip vertical), then reloads.
Tests: `tests/unit/w2e-photo-masks.test.ts` (8). The WS5 unit assertion
"refuses to turn an image whose masks would no longer line up" was updated:
that block was intentionally removed, the test now asserts the new rule.
Gaps: pixels of a layer moved beyond the canvas edge into view are hidden by
the moved mask (the mask has no data outside the canvas).

## ARL-VIDEO-002 Video Timeline — `/o/:org/video/projects/:id`

**Status: Verified**

- **Split at the playhead** (S, or the toolbar): the selected clip if the
  playhead is inside it, otherwise every clip it crosses on unlocked tracks.
- **Trim head/tail to the playhead** (Q / W, toolbar, and in the Clip panel);
  ripple when the ripple tool is active.
- The V/T/R/N/C tool keys the toolbar already advertised now actually switch
  tools.
- **Track lock** button in each track header; locked rows are hatched and
  every timeline edit (move, trim, roll, slip, split, ripple delete, move onto
  a locked track) is refused; the Clip panel says why.
- **Caption lane** under the tracks for the current language: cues as blocks;
  drag to move, drag either end to retime (on frame, never overlapping the
  neighbouring cues), arrows/Alt+arrows from the keyboard, Delete. Selecting
  a cue opens a **Selected cue** panel on the Captions tab: text, in/out by a
  frame, in/out/move to the playhead, mark checked, delete, reading speed.
  "+" on the lane adds a cue at the playhead that stops at the next cue.
- The timeline area scrolls when the tracks plus caption lane are taller than
  its room, so the monitor transport stays on screen (WS5 spec still green).

Persistence: e2e reloads and finds the trimmed split, the locked track and the
edited cue text. Export unchanged: WebM via MediaRecorder in this browser.
Tests: `tests/unit/w2e-video-edits.test.ts` (9); e2e
`e2e/w2e-video-motion.spec.ts` (3 video tests, incl. 390px).
Gaps: no multi-clip selection; captions lane shows one language at a time.

## Verification

- `npx tsc --noEmit`: 0 errors. ESLint on all four apps, new tests and specs: clean.
- `npx vitest run`: 58 files, **524 passed, 0 failed**.
- Playwright (own server on 5185, `--workers=1`): `w2e-layout-photo` 3/3,
  `w2e-video-motion` 6/6, `ws5-layout-editor` 3/3, `ws5-photo-editor` 2/2,
  `ws5-video-monitor` 3/3, `ws5-present-presenter` 3/3,
  `all-native-app-entrypoints` 6/6, `on-demand-native-apps` 3/3.
- Screenshots at 1440 and 390 under the session scratchpad `w2e/`.

## Shared-file proposals (not made)

- `Tool` (`src/design-system/primitives.tsx`) drops `aria-label` when it has
  children, so a tool labelled "Save the frame at the playhead as PNG" with
  text "PNG" is announced only as "PNG". Suggest keeping the label as the
  accessible name (or `aria-describedby`) when both are given.
- `.vx-tl` (visual.css) has no vertical overflow; editors that add rows must
  wrap it in their own scroller (VIDEO does).
