import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pill } from "@/design-system";
import { clamp, rectFromPoints, type Pt, type Rect } from "@/applications/visual/geometry";
import { dragPointer, useMeasure, useStore, type DocHandle } from "@/applications/visual/kit";
import {
  brushDab, compositeDoc, context2d, loadImage, makeCanvas, strokePoints,
  type PhotoLayer, type RasterDoc,
} from "./raster";
import { bumpPixels, photoUi } from "./model";

/* ====================================================================== *
 * The raster canvas. Layer images are decoded once and kept in a map; the
 * compositor paints them every frame. Painting writes into the layer's own
 * canvas and then back into the document as PNG data.
 * ====================================================================== */

export interface ImageBank {
  images: Map<string, HTMLImageElement>;
  masks: Map<string, HTMLImageElement>;
  ready: boolean;
  failures: { id: string; reason: string }[];
  version: number;
}

/** Decode every layer's pixel data, re-decoding only what changed. */
export function useImageBank(doc: RasterDoc | null): ImageBank {
  const images = useRef(new Map<string, HTMLImageElement>());
  const masks = useRef(new Map<string, HTMLImageElement>());
  const sources = useRef(new Map<string, string>());
  const [state, setState] = useState<{ ready: boolean; failures: { id: string; reason: string }[]; version: number }>({ ready: false, failures: [], version: 0 });

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const run = async () => {
      const failures: { id: string; reason: string }[] = [];
      let changed = false;
      for (const layer of doc.layers) {
        if (layer.src && sources.current.get(layer.id) !== layer.src) {
          try {
            const image = await loadImage(layer.src);
            if (cancelled) return;
            images.current.set(layer.id, image);
            sources.current.set(layer.id, layer.src);
            changed = true;
          } catch {
            failures.push({ id: layer.id, reason: `${layer.name}: the stored pixel data could not be decoded by this browser.` });
          }
        }
        if (!layer.src) images.current.delete(layer.id);
        const maskKey = `${layer.id}:mask`;
        if (layer.mask && sources.current.get(maskKey) !== layer.mask) {
          try {
            const image = await loadImage(layer.mask);
            if (cancelled) return;
            masks.current.set(layer.id, image);
            sources.current.set(maskKey, layer.mask);
            changed = true;
          } catch {
            failures.push({ id: layer.id, reason: `${layer.name}: the mask could not be decoded.` });
          }
        }
        if (!layer.mask) masks.current.delete(layer.id);
      }
      if (cancelled) return;
      setState((current) => ({ ready: true, failures, version: changed ? current.version + 1 : current.version }));
    };
    void run();
    return () => { cancelled = true; };
  }, [doc]);

  return { images: images.current, masks: masks.current, ready: state.ready, failures: state.failures, version: state.version };
}

export interface PhotoCanvasProps {
  handle: DocHandle<RasterDoc>;
  bank: ImageBank;
  /** Paint mode targets the active layer; mask mode paints its mask. */
  paintTarget?: "layer" | "mask";
  showSelectionOverlay?: boolean;
  onSample?: (color: string) => void;
}

export function PhotoCanvas({ handle, bank, paintTarget = "layer", showSelectionOverlay = true, onSample }: PhotoCanvasProps) {
  const ui = useStore(photoUi);
  const [frameRef, size] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const painting = useRef<{ layerId: string; canvas: HTMLCanvasElement; last: Pt } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [lasso, setLasso] = useState<Pt[] | null>(null);
  const doc = handle.doc;

  const fit = useMemo(() => {
    if (!doc || size.width === 0) return { scale: 1, left: 0, top: 0, w: doc?.width ?? 1, h: doc?.height ?? 1 };
    const scale = Math.min((size.width - 40) / doc.width, (size.height - 40) / doc.height) * ui.zoom;
    const w = doc.width * scale;
    const h = doc.height * scale;
    return { scale, left: (size.width - w) / 2 + ui.pan.x, top: (size.height - h) / 2 + ui.pan.y, w, h };
  }, [doc, size.width, size.height, ui.zoom, ui.pan]);

  /* Repaint the composite whenever the document, the pixels or the fit change. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc || !bank.ready) return;
    canvas.width = Math.max(1, Math.round(fit.w));
    canvas.height = Math.max(1, Math.round(fit.h));
    compositeDoc(canvas, doc, bank.images, bank.masks, { bypassAdjustments: ui.compare });
  }, [doc, bank.ready, bank.images, bank.masks, bank.version, fit.w, fit.h, ui.compare, ui.pixelVersion]);

  /* Selection and crop overlay, drawn on a second canvas so it is never baked in. */
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !doc) return;
    canvas.width = Math.max(1, Math.round(fit.w));
    canvas.height = Math.max(1, Math.round(fit.h));
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = fit.w / doc.width;
    if (showSelectionOverlay && doc.selection && ui.showSelection) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      const selection = doc.selection;
      ctx.beginPath();
      if (selection.kind === "rect" && selection.rect) {
        ctx.rect(selection.rect.x * scale, selection.rect.y * scale, selection.rect.w * scale, selection.rect.h * scale);
      } else if (selection.kind === "ellipse" && selection.rect) {
        ctx.ellipse(
          (selection.rect.x + selection.rect.w / 2) * scale, (selection.rect.y + selection.rect.h / 2) * scale,
          Math.abs(selection.rect.w / 2) * scale, Math.abs(selection.rect.h / 2) * scale, 0, 0, Math.PI * 2,
        );
      } else if (selection.points) {
        selection.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x * scale, point.y * scale);
          else ctx.lineTo(point.x * scale, point.y * scale);
        });
        ctx.closePath();
      }
      ctx.stroke();
      ctx.strokeStyle = "#17223A";
      ctx.setLineDash([0, 6, 6, 0]);
      ctx.stroke();
      ctx.restore();
    }
    if (ui.cropDraft) {
      const crop = ui.cropDraft.rect;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
      ctx.globalAlpha = 0.6;
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo((crop.x + (crop.w / 3) * i) * scale, crop.y * scale);
        ctx.lineTo((crop.x + (crop.w / 3) * i) * scale, (crop.y + crop.h) * scale);
        ctx.moveTo(crop.x * scale, (crop.y + (crop.h / 3) * i) * scale);
        ctx.lineTo((crop.x + crop.w) * scale, (crop.y + (crop.h / 3) * i) * scale);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (marquee) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(marquee.x * scale, marquee.y * scale, marquee.w * scale, marquee.h * scale);
      ctx.restore();
    }
    if (lasso && lasso.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      lasso.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x * scale, point.y * scale) : ctx.lineTo(point.x * scale, point.y * scale)));
      ctx.stroke();
      ctx.restore();
    }
  }, [doc, fit.w, fit.h, marquee, lasso, ui.cropDraft, ui.showSelection, showSelectionOverlay]);

  const toImage = useCallback((clientX: number, clientY: number): Pt => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = doc.width / Math.max(1, rect.width);
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }, [doc]);

  /* ------------------------------ painting ------------------------------ */

  const beginPaint = async (event: ReactPointerEvent) => {
    if (!doc) return;
    const layer = doc.layers.find((item) => item.id === doc.activeLayerId);
    if (!layer || layer.locked) return;
    if (paintTarget === "layer" && layer.kind !== "pixel") return;

    const width = doc.width;
    const height = doc.height;
    const canvas = makeCanvas(width, height);
    const ctx = context2d(canvas);
    const existing = paintTarget === "mask" ? layer.mask : layer.src;
    if (existing) {
      try {
        const image = await loadImage(existing);
        ctx.drawImage(image, 0, 0, width, height);
      } catch { /* start from an empty canvas */ }
    } else if (paintTarget === "mask") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    const start = toImage(event.clientX, event.clientY);
    const brush = { ...photoUi.get().brush, color: paintTarget === "mask" ? (photoUi.get().brush.mode === "erase" ? "#ffffff" : "#000000") : photoUi.get().brush.color, mode: paintTarget === "mask" ? "paint" as const : photoUi.get().brush.mode };
    brushDab(ctx, start, brush);
    painting.current = { layerId: layer.id, canvas, last: start };
    paintPreview();

    dragPointer(event, {
      move: (point) => {
        const live = painting.current;
        if (!live) return;
        const next = toImage(point.x, point.y);
        for (const dab of strokePoints(live.last, next, Math.max(1, brush.size / 6))) brushDab(ctx, dab, brush);
        live.last = next;
        paintPreview();
      },
      end: () => {
        const live = painting.current;
        painting.current = null;
        if (!live) return;
        const data = live.canvas.toDataURL("image/png");
        handle.edit((current) => ({
          ...current,
          layers: current.layers.map((item) => (item.id === live.layerId
            ? (paintTarget === "mask"
              ? { ...item, mask: data, maskEnabled: true }
              : { ...item, src: data, naturalWidth: width, naturalHeight: height, w: item.w || width, h: item.h || height })
            : item)),
        }), paintTarget === "mask" ? "Paint on the mask" : photoUi.get().brush.mode === "erase" ? "Erase" : "Brush stroke");
        bumpPixels();
      },
    });
  };

  /** Draw the in-flight stroke straight onto the visible canvas. */
  const paintPreview = () => {
    const live = painting.current;
    const target = canvasRef.current;
    if (!live || !target || !doc) return;
    const ctx = context2d(target);
    if (paintTarget === "mask") {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(live.canvas, 0, 0, target.width, target.height);
      ctx.restore();
      return;
    }
    const layer = doc.layers.find((item) => item.id === live.layerId);
    const temporary: RasterDoc = {
      ...doc,
      layers: doc.layers.map((item) => (item.id === live.layerId ? { ...item, src: "live" } : item)),
    };
    const images = new Map(bank.images);
    images.set(live.layerId, live.canvas as unknown as HTMLImageElement);
    if (layer) compositeDoc(target, temporary, images, bank.masks, { bypassAdjustments: ui.compare });
  };

  /* ------------------------------ gestures ------------------------------ */

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!doc) return;
    const tool = ui.tool;
    if (tool === "hand" || event.button === 1) {
      const origin = { ...ui.pan };
      dragPointer(event, { move: (point, _mods, start) => photoUi.set((c) => ({ ...c, pan: { x: origin.x + (point.x - start.x), y: origin.y + (point.y - start.y) } })) });
      return;
    }
    if (tool === "eyedropper") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = context2d(canvas);
      const pixel = ctx.getImageData(
        clamp(Math.round(event.clientX - rect.left), 0, canvas.width - 1),
        clamp(Math.round(event.clientY - rect.top), 0, canvas.height - 1), 1, 1,
      ).data;
      const hex = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
      photoUi.set((c) => ({ ...c, brush: { ...c.brush, color: hex } }));
      onSample?.(hex);
      return;
    }
    if (tool === "brush" || tool === "eraser" || tool === "clone") {
      void beginPaint(event);
      return;
    }
    if (tool === "crop") {
      const origin = toImage(event.clientX, event.clientY);
      dragPointer(event, {
        move: (point) => {
          const now = toImage(point.x, point.y);
          photoUi.set((c) => ({ ...c, cropDraft: { rect: rectFromPoints(origin, now), angle: c.cropDraft?.angle ?? 0 } }));
        },
      });
      return;
    }
    if (tool === "marquee" || tool === "ellipse") {
      const origin = toImage(event.clientX, event.clientY);
      dragPointer(event, {
        move: (point) => setMarquee(rectFromPoints(origin, toImage(point.x, point.y))),
        end: (moved) => {
          const rect = marqueeRef.current;
          setMarquee(null);
          if (!moved || !rect || rect.w < 2 || rect.h < 2) {
            handle.edit((current) => ({ ...current, selection: undefined }), "Clear the selection");
            return;
          }
          handle.edit((current) => ({ ...current, selection: { kind: tool === "ellipse" ? "ellipse" : "rect", rect, feather: current.selection?.feather ?? 0, inverted: false } }), "Make a selection");
        },
      });
      return;
    }
    if (tool === "lasso") {
      const points: Pt[] = [toImage(event.clientX, event.clientY)];
      setLasso(points);
      dragPointer(event, {
        move: (point) => {
          points.push(toImage(point.x, point.y));
          setLasso([...points]);
        },
        end: () => {
          setLasso(null);
          if (points.length < 4) return;
          handle.edit((current) => ({ ...current, selection: { kind: "lasso", points, feather: current.selection?.feather ?? 0, inverted: false } }), "Lasso selection");
        },
      });
      return;
    }
    if (tool === "move") {
      const layer = doc.layers.find((item) => item.id === doc.activeLayerId);
      if (!layer || layer.locked || layer.kind === "adjustment") return;
      const start = { x: layer.x, y: layer.y };
      const origin = toImage(event.clientX, event.clientY);
      dragPointer(event, {
        move: (point) => {
          const now = toImage(point.x, point.y);
          handle.live((current) => ({
            ...current,
            layers: current.layers.map((item) => (item.id === layer.id ? { ...item, x: start.x + (now.x - origin.x), y: start.y + (now.y - origin.y) } : item)),
          }));
        },
        end: (moved) => { if (moved) handle.beginGesture(); },
      });
    }
  };

  const marqueeRef = useRef<Rect | null>(null);
  marqueeRef.current = marquee;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!doc) return;
    const layer = doc.layers.find((item) => item.id === doc.activeLayerId);
    const step = event.shiftKey ? 10 : 1;
    const nudge = (dx: number, dy: number) => {
      event.preventDefault();
      if (!layer || layer.kind === "adjustment" || layer.locked) return;
      handle.edit((current) => ({ ...current, layers: current.layers.map((item) => (item.id === layer.id ? { ...item, x: item.x + dx * step, y: item.y + dy * step } : item)) }), "Move the layer");
    };
    if (event.key === "ArrowLeft") return nudge(-1, 0);
    if (event.key === "ArrowRight") return nudge(1, 0);
    if (event.key === "ArrowUp") return nudge(0, -1);
    if (event.key === "ArrowDown") return nudge(0, 1);
    if (event.key === "[") { event.preventDefault(); return photoUi.set((c) => ({ ...c, brush: { ...c.brush, size: Math.max(1, c.brush.size - 4) } })); }
    if (event.key === "]") { event.preventDefault(); return photoUi.set((c) => ({ ...c, brush: { ...c.brush, size: Math.min(400, c.brush.size + 4) } })); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); return event.shiftKey ? handle.redo() : handle.undo(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") { event.preventDefault(); return handle.edit((current) => ({ ...current, selection: undefined }), "Deselect"); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i" && doc.selection) {
      event.preventDefault();
      return handle.edit((current) => ({ ...current, selection: current.selection ? { ...current.selection, inverted: !current.selection.inverted } : undefined }), "Invert the selection");
    }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); return photoUi.set((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.2) })); }
    if (event.key === "-") { event.preventDefault(); return photoUi.set((c) => ({ ...c, zoom: Math.max(0.1, c.zoom / 1.2) })); }
    if (event.key === "0") { event.preventDefault(); return photoUi.set((c) => ({ ...c, zoom: 1, pan: { x: 0, y: 0 } })); }
  };

  if (!doc) return <div className="ds-empty" style={{ height: "100%" }}><p>Opening the image…</p></div>;

  const activeLayer = doc.layers.find((item) => item.id === doc.activeLayerId);
  const cursor = ui.tool === "hand" ? "grab" : ui.tool === "eyedropper" ? "crosshair" : ui.tool === "move" ? "move" : "crosshair";

  return (
    <div ref={frameRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }} className="vx-checker">
      <div
        role="application"
        tabIndex={0}
        aria-label={`Image canvas, ${doc.width} by ${doc.height} pixels. Arrow keys move the active layer, square brackets change the brush size.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        style={{ position: "absolute", left: fit.left, top: fit.top, width: fit.w, height: fit.h, cursor, touchAction: "none", outline: "none" }}
      >
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", boxShadow: "0 2px 18px rgba(0,0,0,0.25)" }} />
        <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true" />
      </div>
      <div style={{ position: "absolute", inset: "auto auto 10px 10px", display: "flex", gap: 6, flexWrap: "wrap", pointerEvents: "none" }}>
        <Pill tone="info">{doc.width} × {doc.height}</Pill>
        <Pill tone="neutral">{Math.round(ui.zoom * 100)}%</Pill>
        {activeLayer && <Pill tone="accent">{activeLayer.name}</Pill>}
        {paintTarget === "mask" && <Pill tone="warning">painting the mask</Pill>}
        {ui.compare && <Pill tone="warning">adjustments bypassed</Pill>}
        {bank.failures.length > 0 && <Pill tone="danger">{bank.failures.length} layer could not be decoded</Pill>}
      </div>
    </div>
  );
}

/** A small canvas that draws one layer's thumbnail from its real pixels. */
export function LayerThumb({ doc, layer, bank, size = 36 }: { doc: RasterDoc; layer: PhotoLayer; bank: ImageBank; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = doc.height / Math.max(1, doc.width);
    canvas.width = size;
    canvas.height = Math.max(1, Math.round(size * ratio));
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer.kind === "adjustment") {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "#000");
      gradient.addColorStop(1, "#fff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    compositeDoc(canvas, doc, bank.images, bank.masks, { onlyLayer: layer.id });
  }, [doc, layer, bank.version, bank.ready, size]);
  return <canvas ref={ref} style={{ width: size, borderRadius: 3, border: "1px solid var(--border-default)", flex: "none" }} aria-hidden="true" />;
}
