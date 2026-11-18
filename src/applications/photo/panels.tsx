import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown } from "lucide-react";
import { Button, Empty, Field, Notice, Pill, Properties, Row, Select, Stack } from "@/design-system";
import { ColorBox, NumberBox, PanelGroup, SliderBox, useStore, type DocHandle } from "@/applications/visual/kit";
import { clamp } from "@/applications/visual/geometry";
import {
  BLEND_MODES, NEUTRAL_ADJUST, compositeImageData, curveLut, describeAdjust, histogram,
  moveLayer, patchLayer, removeLayer, type Adjust, type CurvePoint, type Histogram, type RasterDoc,
} from "./raster";
import { LayerThumb, type ImageBank } from "./canvas";
import { photoUi } from "./model";

/* ====================================================================== *
 * Histogram, curve editor and layer list — all reading real pixel data.
 * ====================================================================== */

export function useHistogram(doc: RasterDoc | null, bank: ImageBank, options: { bypassAdjustments?: boolean } = {}): Histogram | null {
  const ui = useStore(photoUi);
  const [value, setValue] = useState<Histogram | null>(null);
  useEffect(() => {
    if (!doc || !bank.ready) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      try {
        const frame = compositeImageData(doc, bank.images, bank.masks, options, 300);
        if (!cancelled) setValue(histogram(frame.data));
      } catch {
        if (!cancelled) setValue(null);
      }
    }, 90);
    return () => { cancelled = true; window.clearTimeout(id); };
    // the pixel counter is what says a brush stroke landed
  }, [doc, bank.ready, bank.version, ui.pixelVersion, options.bypassAdjustments]);
  return value;
}

export function HistogramView({ data, height = 84, channel = "all" }: { data: Histogram | null; height?: number; channel?: "all" | "luma" }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    ctx.clearRect(0, 0, width, canvas.height);
    ctx.fillStyle = "#0B1020";
    ctx.fillRect(0, 0, width, canvas.height);
    if (!data) return;
    const series: { values: number[]; color: string }[] = channel === "luma"
      ? [{ values: data.luma, color: "rgba(235,240,255,0.9)" }]
      : [
        { values: data.r, color: "rgba(255,80,80,0.7)" },
        { values: data.g, color: "rgba(80,230,140,0.7)" },
        { values: data.b, color: "rgba(90,150,255,0.7)" },
      ];
    const peak = Math.max(1, ...series.flatMap((item) => item.values));
    ctx.globalCompositeOperation = "lighter";
    for (const item of series) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let index = 0; index < 256; index += 1) {
        const x = (index / 255) * width;
        const y = canvas.height - (item.values[index] / peak) * (canvas.height - 2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, canvas.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [data, channel]);
  return (
    <div>
      <canvas ref={ref} width={300} height={height} className="vx-hist" role="img" aria-label={data ? `Histogram of ${data.counted.toLocaleString()} pixels, mean luminance ${Math.round(data.mean)}` : "Histogram not computed yet"} />
      {data && (
        <table className="ds-table" style={{ fontSize: "var(--text-2xs)" }}>
          <caption className="ds-subtle" style={{ captionSide: "bottom", textAlign: "start" }}>Counted from the composited pixels, sampled at 300px wide.</caption>
          <tbody>
            <tr><th scope="row">Pixels counted</th><td>{data.counted.toLocaleString()}</td></tr>
            <tr><th scope="row">Mean luminance</th><td>{Math.round(data.mean)} / 255</td></tr>
            <tr><th scope="row">Clipped black</th><td>{((data.clippedBlack / Math.max(1, data.counted)) * 100).toFixed(2)}%</td></tr>
            <tr><th scope="row">Clipped white</th><td>{((data.clippedWhite / Math.max(1, data.counted)) * 100).toFixed(2)}%</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------ curve editor ------------------------------ */

export function CurveEditor({ points, onChange, size = 240 }: { points: CurvePoint[]; onChange: (next: CurvePoint[]) => void; size?: number }) {
  const [selected, setSelected] = useState(0);
  const lut = useMemo(() => curveLut(points), [points]);
  const toSvg = (point: CurvePoint) => ({ x: (point.x / 255) * size, y: size - (point.y / 255) * size });
  const path = useMemo(() => {
    const parts: string[] = [];
    for (let index = 0; index < 256; index += 4) {
      const x = (index / 255) * size;
      const y = size - (lut[index] / 255) * size;
      parts.push(`${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return parts.join(" ");
  }, [lut, size]);

  const drag = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    event.stopPropagation();
    setSelected(index);
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const move = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const x = clamp(((ev.clientX - rect.left) / rect.width) * 255, 0, 255);
      const y = clamp(255 - ((ev.clientY - rect.top) / rect.height) * 255, 0, 255);
      const next = points.map((point, i) => (i === index
        ? { x: index === 0 ? 0 : index === points.length - 1 ? 255 : Math.round(x), y: Math.round(y) }
        : point));
      onChange(next.sort((a, b) => a.x - b.x));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <Stack gap={2}>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="application"
        tabIndex={0}
        aria-label={`Tone curve with ${points.length} control points. Tab selects a point, arrow keys move it.`}
        style={{ background: "#0B1020", borderRadius: 6, touchAction: "none" }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 8 : 2;
          const update = (dx: number, dy: number) => {
            event.preventDefault();
            onChange(points.map((point, i) => (i === selected
              ? { x: i === 0 ? 0 : i === points.length - 1 ? 255 : clamp(point.x + dx * step, 0, 255), y: clamp(point.y + dy * step, 0, 255) }
              : point)).sort((a, b) => a.x - b.x));
          };
          if (event.key === "ArrowLeft") return update(-1, 0);
          if (event.key === "ArrowRight") return update(1, 0);
          if (event.key === "ArrowUp") return update(0, 1);
          if (event.key === "ArrowDown") return update(0, -1);
          if (event.key === "Tab") { event.preventDefault(); setSelected((current) => (current + (event.shiftKey ? -1 : 1) + points.length) % points.length); }
        }}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.round(clamp(((event.clientX - rect.left) / rect.width) * 255, 1, 254));
          const y = Math.round(clamp(255 - ((event.clientY - rect.top) / rect.height) * 255, 0, 255));
          onChange([...points, { x, y }].sort((a, b) => a.x - b.x));
        }}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <g key={fraction}>
            <line x1={size * fraction} y1={0} x2={size * fraction} y2={size} stroke="rgba(255,255,255,0.12)" />
            <line x1={0} y1={size * fraction} x2={size} y2={size * fraction} stroke="rgba(255,255,255,0.12)" />
          </g>
        ))}
        <line x1={0} y1={size} x2={size} y2={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="#7FB4FF" strokeWidth={2} />
        {points.map((point, index) => {
          const position = toSvg(point);
          return (
            <circle
              key={index}
              cx={position.x}
              cy={position.y}
              r={index === selected ? 7 : 5}
              fill={index === selected ? "#7FB4FF" : "#ffffff"}
              stroke="#0B1020"
              strokeWidth={2}
              style={{ cursor: "grab" }}
              onPointerDown={drag(index)}
            />
          );
        })}
      </svg>
      <Row gap={1} wrap>
        <Button size="sm" variant="ghost" onClick={() => onChange([{ x: 0, y: 0 }, { x: 255, y: 255 }])}>Reset the curve</Button>
        <Button size="sm" variant="ghost" disabled={points.length <= 2 || selected === 0 || selected === points.length - 1} onClick={() => { onChange(points.filter((_, i) => i !== selected)); setSelected(0); }}>Delete the point</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([{ x: 0, y: 12 }, { x: 64, y: 54 }, { x: 192, y: 206 }, { x: 255, y: 243 }])}>Film contrast</Button>
      </Row>
      <p className="vx-mini">Double-click the grid to add a point. The curve is monotone, so it never invents contrast by overshooting.</p>
    </Stack>
  );
}

/* ------------------------------ adjustments ------------------------------ */

export function AdjustControls({ adjust, onChange }: { adjust: Adjust; onChange: (next: Adjust) => void }) {
  return (
    <Stack gap={3}>
      <SliderBox label="Exposure" value={adjust.exposure} min={-3} max={3} step={0.05} onChange={(value) => onChange({ ...adjust, exposure: value })} format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(2)} EV`} />
      <SliderBox label="Contrast" value={adjust.contrast} min={-100} max={100} onChange={(value) => onChange({ ...adjust, contrast: value })} />
      <SliderBox label="Highlights" value={adjust.highlights} min={-100} max={100} onChange={(value) => onChange({ ...adjust, highlights: value })} />
      <SliderBox label="Shadows" value={adjust.shadows} min={-100} max={100} onChange={(value) => onChange({ ...adjust, shadows: value })} />
      <SliderBox label="Saturation" value={adjust.saturation} min={-100} max={100} onChange={(value) => onChange({ ...adjust, saturation: value })} />
      <SliderBox label="Temperature" value={adjust.temperature} min={-100} max={100} onChange={(value) => onChange({ ...adjust, temperature: value })} format={(value) => (value === 0 ? "neutral" : value > 0 ? `+${Math.round(value)} warm` : `${Math.round(value)} cool`)} />
      <SliderBox label="Tint" value={adjust.tint} min={-100} max={100} onChange={(value) => onChange({ ...adjust, tint: value })} format={(value) => (value === 0 ? "neutral" : value > 0 ? `+${Math.round(value)} green` : `${Math.round(value)} magenta`)} />
      <Button size="sm" variant="ghost" onClick={() => onChange({ ...NEUTRAL_ADJUST, curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] })}>Reset every slider</Button>
      <p className="vx-mini">Now: {describeAdjust(adjust)}</p>
    </Stack>
  );
}

/* ------------------------------ layers ------------------------------ */

export function PhotoLayers({ handle, bank, onOpenBlend }: { handle: DocHandle<RasterDoc>; bank: ImageBank; onOpenBlend?: (id: string) => void }) {
  const doc = handle.doc;
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!doc) return null;
  const ordered = [...doc.layers].reverse();
  return (
    <Stack gap={2}>
      <div className="vx-tree" role="list" aria-label="Layers, topmost first">
        {ordered.map((layer) => {
          const selected = layer.id === doc.activeLayerId;
          return (
            <div key={layer.id} className="ds-row" style={{ gap: 2 }}>
              <button
                type="button"
                className="vx-node"
                data-selected={selected}
                data-hidden={!layer.visible}
                onClick={() => handle.edit((current) => ({ ...current, activeLayerId: layer.id }), "Select a layer")}
                onDoubleClick={() => setRenaming(layer.id)}
                onKeyDown={(event) => {
                  if (event.key === "F2") { event.preventDefault(); setRenaming(layer.id); }
                  if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); handle.edit((current) => moveLayer(current, layer.id, 1), "Raise the layer"); }
                  if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); handle.edit((current) => moveLayer(current, layer.id, -1), "Lower the layer"); }
                }}
              >
                <LayerThumb doc={doc} layer={layer} bank={bank} size={28} />
                {renaming === layer.id ? (
                  <input
                    autoFocus
                    className="vx-num"
                    aria-label={`Rename ${layer.name}`}
                    defaultValue={layer.name}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => { handle.edit((current) => patchLayer(current, layer.id, { name: event.target.value || layer.name }), "Rename the layer"); setRenaming(null); }}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(null); }}
                  />
                ) : (
                  <span className="vx-node-label">
                    {layer.name}
                    <span className="vx-mini" style={{ display: "block" }}>
                      {layer.kind}{layer.blend !== "normal" ? ` · ${layer.blend}` : ""}{layer.opacity < 1 ? ` · ${Math.round(layer.opacity * 100)}%` : ""}{layer.mask ? " · masked" : ""}
                    </span>
                  </span>
                )}
              </button>
              <button type="button" className="vx-node-btn" aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} aria-pressed={!layer.visible} onClick={() => handle.edit((current) => patchLayer(current, layer.id, { visible: !layer.visible }), layer.visible ? "Hide the layer" : "Show the layer")}>
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button type="button" className="vx-node-btn" data-on={layer.locked ? "true" : undefined} aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} aria-pressed={layer.locked} onClick={() => handle.edit((current) => patchLayer(current, layer.id, { locked: !layer.locked }), "Lock the layer")}>
                {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
            </div>
          );
        })}
      </div>
      <Row gap={1} wrap>
        <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} onClick={() => handle.edit((current) => moveLayer(current, current.activeLayerId, 1), "Raise the layer")}>Up</Button>
        <Button size="sm" variant="ghost" icon={<ArrowDown size={13} />} onClick={() => handle.edit((current) => moveLayer(current, current.activeLayerId, -1), "Lower the layer")}>Down</Button>
        <Button size="sm" variant="ghost" disabled={doc.layers.length < 2} onClick={() => handle.edit((current) => removeLayer(current, current.activeLayerId), "Delete the layer")}>Delete</Button>
        {onOpenBlend && <Button size="sm" variant="ghost" onClick={() => onOpenBlend(doc.activeLayerId)}>Blend…</Button>}
      </Row>
      <p className="vx-mini">F2 renames. Alt with the up or down arrow reorders without the pointer.</p>
    </Stack>
  );
}

export function LayerProperties({ handle }: { handle: DocHandle<RasterDoc> }) {
  const doc = handle.doc;
  if (!doc) return null;
  const layer = doc.layers.find((item) => item.id === doc.activeLayerId);
  if (!layer) return <Empty title="No layer selected" />;
  const set = (patch: Parameters<typeof patchLayer>[2], label: string) => handle.edit((current) => patchLayer(current, layer.id, patch), label);
  return (
    <Stack gap={3}>
      <PanelGroup title={layer.name}>
        <Row gap={2} wrap>
          <Pill tone="info">{layer.kind}</Pill>
          {layer.locked && <Pill tone="warning">locked</Pill>}
          {!layer.visible && <Pill tone="warning">hidden</Pill>}
          {layer.mask && <Pill tone="accent">mask</Pill>}
        </Row>
      </PanelGroup>
      <PanelGroup title="Blend">
        <Field label="Mode">
          <Select value={layer.blend} onChange={(event) => set({ blend: event.target.value as typeof layer.blend }, "Change the blend mode")}>
            {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </Select>
        </Field>
        <SliderBox label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} onChange={(value) => set({ opacity: value / 100 }, "Change the opacity")} format={(value) => `${Math.round(value)}%`} />
      </PanelGroup>
      {layer.kind !== "adjustment" && (
        <PanelGroup title="Transform">
          <div className="vx-fieldrow">
            <NumberBox label="X" value={layer.x} onChange={(value) => set({ x: value }, "Move the layer")} />
            <NumberBox label="Y" value={layer.y} onChange={(value) => set({ y: value }, "Move the layer")} />
            <NumberBox label="W" value={layer.w} min={1} onChange={(value) => set({ w: Math.max(1, value) }, "Resize the layer")} />
            <NumberBox label="H" value={layer.h} min={1} onChange={(value) => set({ h: Math.max(1, value) }, "Resize the layer")} />
            <NumberBox label="Rotation" suffix="deg" value={layer.rotation} onChange={(value) => set({ rotation: value }, "Rotate the layer")} />
          </div>
          {layer.naturalWidth && <p className="vx-mini">Stored pixels: {layer.naturalWidth} × {layer.naturalHeight}. Drawing it smaller does not throw them away.</p>}
        </PanelGroup>
      )}
      {layer.kind === "fill" && layer.color && (
        <PanelGroup title="Fill"><ColorBox label="Colour" value={layer.color} onChange={(value) => set({ color: value }, "Change the fill colour")} /></PanelGroup>
      )}
      {layer.mask && (
        <PanelGroup title="Mask">
          <Button size="sm" variant="secondary" onClick={() => set({ maskEnabled: !layer.maskEnabled }, "Toggle the mask")}>{layer.maskEnabled ? "Disable" : "Enable"} the mask</Button>
          <Button size="sm" variant="ghost" onClick={() => set({ mask: undefined, maskEnabled: false, maskFrame: undefined }, "Delete the mask")}>Delete the mask</Button>
          <img src={layer.mask} alt={`Mask for ${layer.name}`} style={{ width: "100%", borderRadius: 4, border: "1px solid var(--border-default)" }} />
        </PanelGroup>
      )}
      {layer.kind === "adjustment" && layer.adjust && (
        <PanelGroup title="Adjustment">
          <Notice tone="info" title="Non-destructive">This layer rewrites the pixels painted below it when the image is composited. The pixels on disk are untouched.</Notice>
          <Properties rows={[{ label: "Settings", value: describeAdjust(layer.adjust) }]} />
        </PanelGroup>
      )}
    </Stack>
  );
}
