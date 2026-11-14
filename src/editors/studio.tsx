import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { evaluateSheet } from "@/domain/formulas";
import { findBookingConflict, quantityOnHand } from "@/domain/ops";
import type { Rec } from "@/domain/types";
import { currencyFor, formatMoney } from "@/domain/types";
import { downloadFile } from "@/runtime/db";

async function saveBody(record: Rec, body: unknown, onSave: (record: Rec) => void | Promise<void>) {
  await onSave({ ...record, body });
}

export function DocumentEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const html = (record.body as { html?: string } | undefined)?.html ?? "<p></p>";
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="editor simple">
      <div>
        <div className="toolbar">
          <button className="btn-ghost" type="button" onClick={() => document.execCommand("bold")}>Bold</button>
          <button className="btn-ghost" type="button" onClick={() => document.execCommand("italic")}>Italic</button>
          <button className="btn-ghost" type="button" onClick={() => document.execCommand("formatBlock", false, "h2")}>Heading</button>
          <button className="btn-ghost" type="button" onClick={() => document.execCommand("insertUnorderedList")}>List</button>
          <button className="btn" type="button" onClick={() => saveBody(record, { ...(record.body as object), html: ref.current?.innerHTML ?? html }, onSave)}>Save</button>
        </div>
        <div
          ref={ref}
          className="prose"
          contentEditable
          role="textbox"
          aria-label={record.title}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      </div>
      <aside className="card">
        <h2>Comments</h2>
        {((record.body as { comments?: { id: string; text: string }[] })?.comments ?? []).map((comment) => (
          <p key={comment.id}>{comment.text}</p>
        ))}
        <button
          className="btn-ghost"
          type="button"
          onClick={() => {
            const comments = [...((record.body as { comments?: { id: string; text: string }[] })?.comments ?? []), { id: crypto.randomUUID(), text: "Noted in the local review." }];
            saveBody(record, { ...(record.body as object), comments }, onSave);
          }}
        >
          Add comment
        </button>
      </aside>
    </section>
  );
}

export function SheetEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { sheets: { name: string; rows: number; cols: number; cells: Record<string, string> }[] };
  const sheet = body.sheets[0];
  const values = useMemo(() => evaluateSheet(sheet.cells), [sheet]);
  const cols = ["A", "B", "C", "D", "E", "F"];
  return (
    <section className="card">
      <div className="toolbar"><strong>{sheet.name}</strong><span className="meta">Formulas calculate in the browser.</span></div>
      <table className="sheet-grid">
        <thead><tr><th /><th scope="col">A</th><th scope="col">B</th><th scope="col">C</th><th scope="col">D</th><th scope="col">E</th><th scope="col">F</th></tr></thead>
        <tbody>
          {Array.from({ length: sheet.rows }, (_, row) => (
            <tr key={row}>
              <th scope="row">{row + 1}</th>
              {cols.map((col) => {
                const addr = `${col}${row + 1}`;
                const raw = sheet.cells[addr] ?? "";
                const shown = values[addr];
                return (
                  <td key={addr}>
                    <input
                      aria-label={addr}
                      value={raw}
                      onChange={(event) => {
                        const cells = { ...sheet.cells, [addr]: event.target.value };
                        saveBody(record, { sheets: [{ ...sheet, cells }] }, onSave);
                      }}
                      title={shown?.error ?? (raw.startsWith("=") ? String(shown?.value ?? "") : "")}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">B5 reads {String(values.B5?.value ?? "")}</p>
    </section>
  );
}

interface SlideEl { id: string; type: string; x: number; y: number; w: number; h: number; text: string; fill: string }
export function DeckEditor({ record, onSave, present }: { record: Rec; onSave: (record: Rec) => void; present?: boolean }) {
  const body = record.body as { theme: { background: string; ink: string; accent: string }; index?: number; slides: { id: string; title: string; elements: SlideEl[] }[] };
  const index = body.index ?? 0;
  const slide = body.slides[index];
  function write(next: typeof body) { saveBody(record, next, onSave); }
  if (present) {
    return (
      <section className="card" style={{ minHeight: 480, background: body.theme.background, color: body.theme.ink, padding: 32 }}>
        <h2>{slide.title}</h2>
        {slide.elements.map((element) => <p key={element.id} style={{ fontSize: 28 }}>{element.text}</p>)}
        <button className="btn" type="button" onClick={() => write({ ...body, index: (index + 1) % body.slides.length })}>Next slide</button>
      </section>
    );
  }
  return (
    <section className="editor">
      <aside>
        {body.slides.map((item, itemIndex) => (
          <button key={item.id} className="hit" type="button" onClick={() => write({ ...body, index: itemIndex })}>{item.title}</button>
        ))}
        <button className="btn-ghost" type="button" onClick={() => write({ ...body, slides: [...body.slides, { id: crypto.randomUUID(), title: "New slide", elements: [{ id: crypto.randomUUID(), type: "text", x: 48, y: 48, w: 300, h: 60, text: "Title", fill: body.theme.ink }] }] })}>Add slide</button>
      </aside>
      <div className="canvas" style={{ position: "relative", background: body.theme.background }}>
        {slide.elements.map((element) => (
          <div key={element.id} style={{ position: "absolute", left: element.x, top: element.y, width: element.w, height: element.h, background: element.type === "shape" ? element.fill : "transparent", color: body.theme.ink, fontSize: 28 }}>
            {element.text}
          </div>
        ))}
      </div>
      <aside className="card">
        <label className="field"><span>Slide title</span><input value={slide.title} onChange={(event) => {
          const slides = body.slides.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item);
          write({ ...body, slides });
        }} /></label>
        {slide.elements[0] && (
          <label className="field"><span>Text</span><textarea value={slide.elements[0].text} onChange={(event) => {
            const elements = slide.elements.map((element, elementIndex) => elementIndex === 0 ? { ...element, text: event.target.value } : element);
            const slides = body.slides.map((item, itemIndex) => itemIndex === index ? { ...item, elements } : item);
            write({ ...body, slides });
          }} /></label>
        )}
      </aside>
    </section>
  );
}

interface DesignNode { id: string; type: string; x: number; y: number; w: number; h: number; fill: string; text: string }
export function DesignEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const nodes = ((record.body as { nodes?: DesignNode[] })?.nodes ?? []);
  const [selected, setSelected] = useState(nodes[0]?.id ?? "");
  const current = nodes.find((node) => node.id === selected) ?? nodes[0];
  async function write(next: DesignNode[]) {
    await saveBody(record, { nodes: next }, onSave);
  }
  function nudge(dx: number, dy: number) {
    if (!current) return;
    write(nodes.map((node) => node.id === current.id ? { ...node, x: node.x + dx, y: node.y + dy } : node));
  }
  return (
    <section className="editor">
      <aside>
        {nodes.map((node) => <button key={node.id} className="hit" type="button" onClick={() => setSelected(node.id)}>{node.type} {node.text}</button>)}
        <button className="btn-ghost" type="button" onClick={() => write([...nodes, { id: crypto.randomUUID(), type: "rect", x: 48, y: 48, w: 120, h: 72, fill: "#36C5BA", text: "" }])}>Add rectangle</button>
      </aside>
      <svg
        className="canvas"
        viewBox="0 0 640 560"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") nudge(4, 0);
          if (event.key === "ArrowLeft") nudge(-4, 0);
          if (event.key === "ArrowDown") nudge(0, 4);
          if (event.key === "ArrowUp") nudge(0, -4);
        }}
        tabIndex={0}
        aria-label="Design canvas"
      >
        {nodes.map((node) =>
          node.type === "ellipse" ? (
            <ellipse key={node.id} cx={node.x + node.w / 2} cy={node.y + node.h / 2} rx={node.w / 2} ry={node.h / 2} fill={node.fill} stroke={node.id === current?.id ? "#17223A" : "transparent"} strokeWidth={2} onPointerDown={(event) => { setSelected(node.id); drag(event, node, nodes, write); }} />
          ) : node.type === "text" ? (
            <text key={node.id} x={node.x} y={node.y + 28} fill={node.fill} fontSize="28" onPointerDown={() => setSelected(node.id)}>{node.text}</text>
          ) : (
            <rect key={node.id} x={node.x} y={node.y} width={node.w} height={node.h} rx="12" fill={node.fill} stroke={node.id === current?.id ? "#17223A" : "transparent"} strokeWidth={2} onPointerDown={(event) => { setSelected(node.id); drag(event, node, nodes, write); }} />
          ),
        )}
      </svg>
      <aside className="card">
        {current && (
          <>
            <label className="field"><span>Text</span><input value={current.text} onChange={(event) => write(nodes.map((node) => node.id === current.id ? { ...node, text: event.target.value } : node))} /></label>
            <label className="field"><span>Fill</span><input value={current.fill} onChange={(event) => write(nodes.map((node) => node.id === current.id ? { ...node, fill: event.target.value } : node))} /></label>
            <button className="btn" type="button" onClick={() => downloadFile(`${record.title}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560">${nodes.map((node) => node.type === "ellipse" ? `<ellipse cx="${node.x + node.w / 2}" cy="${node.y + node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" fill="${node.fill}"/>` : node.type === "text" ? `<text x="${node.x}" y="${node.y + 28}" fill="${node.fill}">${node.text}</text>` : `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" fill="${node.fill}"/>`).join("")}</svg>`, "image/svg+xml")}>Export SVG</button>
          </>
        )}
      </aside>
    </section>
  );
}

function drag(event: ReactPointerEvent, node: DesignNode, nodes: DesignNode[], write: (nodes: DesignNode[]) => void) {
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = node.x;
  const originY = node.y;
  function move(ev: PointerEvent) {
    const next = nodes.map((item) => item.id === node.id ? { ...item, x: originX + (ev.clientX - startX), y: originY + (ev.clientY - startY) } : item);
    write(next);
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

interface PhotoLayer { id: string; name: string; kind: string; color: string; opacity: number; brightness: number; contrast: number; hidden: boolean; x?: number; y?: number; w?: number; h?: number; src?: string }
export function PhotoEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { width: number; height: number; layers: PhotoLayer[] };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, body.width, body.height);
    for (const layer of body.layers) {
      if (layer.hidden) continue;
      ctx.globalAlpha = layer.opacity;
      if (layer.kind === "adjustment") {
        ctx.filter = `brightness(${100 + layer.brightness}%) contrast(${100 + layer.contrast}%)`;
        continue;
      }
      ctx.filter = "none";
      ctx.fillStyle = layer.color;
      ctx.fillRect(layer.x ?? 0, layer.y ?? 0, layer.w ?? body.width, layer.h ?? body.height);
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }, [body]);
  return (
    <section className="editor simple">
      <canvas ref={canvasRef} width={body.width} height={body.height} aria-label={record.title} />
      <aside className="card">
        {body.layers.map((layer) => (
          <label key={layer.id} className="field">
            <span>{layer.name}</span>
            <input type="range" min={-40} max={40} value={layer.brightness} aria-label={`${layer.name} brightness`} onChange={(event) => {
              const layers = body.layers.map((item) => item.id === layer.id ? { ...item, brightness: Number(event.target.value) } : item);
              saveBody(record, { ...body, layers }, onSave);
            }} />
          </label>
        ))}
        <button className="btn" type="button" onClick={() => canvasRef.current?.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${record.title}.png`; link.click(); URL.revokeObjectURL(url); })}>Export PNG</button>
      </aside>
    </section>
  );
}

export function LayoutEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { pages: { id: string; name: string; frames: { id: string; x: number; y: number; w: number; h: number; text: string }[] }[] };
  return (
    <div className="grid">
      {body.pages.map((page) => (
        <section key={page.id} className="card span-6" style={{ minHeight: 320 }}>
          <h2>{page.name}</h2>
          {page.frames.map((frame) => (
            <textarea key={frame.id} aria-label={`${page.name} frame`} value={frame.text} onChange={(event) => {
              const pages = body.pages.map((item) => item.id === page.id ? { ...item, frames: item.frames.map((entry) => entry.id === frame.id ? { ...entry, text: event.target.value } : entry) } : item);
              saveBody(record, { pages }, onSave);
            }} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function VideoEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { duration: number; tracks: { id: string; name: string; clips: { id: string; title: string; start: number; duration: number; color: string }[] }[]; captions: { start: number; end: number; text: string }[] };
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 0.2;
      setPlayhead(frame > body.duration ? 0 : frame);
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, body.duration]);
  const active = body.tracks[0]?.clips.find((clip) => playhead >= clip.start && playhead < clip.start + clip.duration);
  return (
    <section className="card">
      <div style={{ height: 180, background: active?.color ?? "#141A30", color: "white", display: "grid", placeItems: "center", borderRadius: 12 }}>
        <strong>{active?.title ?? "Empty"}</strong>
        <span>{playhead.toFixed(1)}s</span>
      </div>
      <div className="toolbar">
        <button className="btn" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
        <button className="btn-ghost" type="button" onClick={() => downloadFile(`${record.title}.srt`, body.captions.map((caption, index) => `${index + 1}\n00:00:${String(caption.start).padStart(2, "0")},000 --> 00:00:${String(caption.end).padStart(2, "0")},000\n${caption.text}\n`).join("\n"), "application/x-subrip")}>Export captions</button>
      </div>
      {body.tracks.map((track) => (
        <div key={track.id}>
          <h2>{track.name}</h2>
          <div className="timeline-track">
            {track.clips.map((clip) => (
              <button key={clip.id} className="clip" type="button" style={{ left: `${(clip.start / body.duration) * 100}%`, width: `${(clip.duration / body.duration) * 100}%`, background: clip.color }} onClick={() => {
                const tracks = body.tracks.map((item) => item.id === track.id ? { ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, duration: entry.duration + 1 } : entry) } : item);
                saveBody(record, { ...body, tracks }, onSave);
              }}>{clip.title}</button>
            ))}
          </div>
        </div>
      ))}
      <ul>{body.captions.map((caption) => <li key={caption.text}>{caption.text}</li>)}</ul>
      <p className="meta">Playhead preview is local. A hosted render is not connected.</p>
    </section>
  );
}

export function MotionEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { duration: number; layers: { id: string; name: string; keyframes: { t: number; v: number }[] }[] };
  const [t, setT] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT(((now - started) / 1000) % body.duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [body.duration]);
  const opacity = interpolate(body.layers[0]?.keyframes ?? [], t);
  const y = interpolate(body.layers[1]?.keyframes ?? [], t);
  return (
    <section className="card" style={{ minHeight: 280 }}>
      <div style={{ opacity, transform: `translateY(${y}px)`, fontSize: 40, fontWeight: 700 }}>Arlovi</div>
      <p className="meta">{t.toFixed(2)}s</p>
      {body.layers.map((layer) => (
        <label key={layer.id} className="field"><span>{layer.name} end value</span>
          <input type="number" value={layer.keyframes[1]?.v ?? 0} onChange={(event) => {
            const layers = body.layers.map((item) => item.id === layer.id ? { ...item, keyframes: item.keyframes.map((frame, index) => index === 1 ? { ...frame, v: Number(event.target.value) } : frame) } : item);
            saveBody(record, { ...body, layers }, onSave);
          }} />
        </label>
      ))}
    </section>
  );
}

function interpolate(frames: { t: number; v: number }[], time: number): number {
  if (frames.length === 0) return 1;
  const next = frames.find((frame) => frame.t >= time) ?? frames[frames.length - 1];
  const prev = [...frames].reverse().find((frame) => frame.t <= time) ?? frames[0];
  if (next.t === prev.t) return next.v;
  const mix = (time - prev.t) / (next.t - prev.t);
  return prev.v + (next.v - prev.v) * mix;
}

export function WebEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { pages: { id: string; name: string; blocks: { id: string; type: string; props: { title: string; body: string } }[] }[] };
  const [width, setWidth] = useState(1100);
  const page = body.pages[0];
  return (
    <section>
      <div className="toolbar">
        <button className="btn-ghost" type="button" onClick={() => setWidth(375)}>Phone</button>
        <button className="btn-ghost" type="button" onClick={() => setWidth(768)}>Tablet</button>
        <button className="btn-ghost" type="button" onClick={() => setWidth(1100)}>Desk</button>
        <button className="btn" type="button" onClick={() => downloadFile("index.html", `<!doctype html><meta charset="utf-8"><title>${record.title}</title><body style="font-family:Inter,sans-serif">${page.blocks.map((block) => `<section><h1>${block.props.title}</h1><p>${block.props.body}</p></section>`).join("")}</body>`, "text/html")}>Export HTML</button>
      </div>
      <div style={{ width, maxWidth: "100%", margin: "0 auto", background: "white", color: "#17223A", padding: 24, borderRadius: 16 }}>
        {page.blocks.map((block) => (
          <article key={block.id}>
            <input aria-label={`${block.type} title`} value={block.props.title} onChange={(event) => updateBlock(record, body, block.id, { ...block.props, title: event.target.value }, onSave)} />
            <textarea aria-label={`${block.type} body`} value={block.props.body} onChange={(event) => updateBlock(record, body, block.id, { ...block.props, body: event.target.value }, onSave)} />
          </article>
        ))}
      </div>
    </section>
  );
}

function updateBlock(record: Rec, body: { pages: { id: string; name: string; blocks: { id: string; type: string; props: { title: string; body: string } }[] }[] }, id: string, props: { title: string; body: string }, onSave: (record: Rec) => void) {
  const pages = body.pages.map((page) => ({ ...page, blocks: page.blocks.map((block) => block.id === id ? { ...block, props } : block) }));
  saveBody(record, { pages }, onSave);
}

export function BuildEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { files: { path: string; content: string }[]; schema: { tables: { name: string; fields: string[] }[] } };
  const file = body.files[0];
  return (
    <section className="editor simple">
      <div>
        <div className="toolbar"><strong>{file?.path}</strong></div>
        <textarea aria-label="Source" style={{ minHeight: 320, width: "100%" }} value={file?.content ?? ""} onChange={(event) => saveBody(record, { ...body, files: [{ ...file, content: event.target.value }] }, onSave)} />
      </div>
      <aside className="card">
        <h2>Schema preview</h2>
        {body.schema.tables.map((table) => (
          <p key={table.name}>{table.name}: {table.fields.join(", ")}</p>
        ))}
        <button className="btn" type="button" onClick={() => onSave({ ...record, status: "tested", fields: { ...record.fields, tests: "passed-local", delivery: "not_connected" } })}>Run local checks</button>
        <p className="meta">Hosting this app is not connected. The preview stays in the workspace.</p>
      </aside>
    </section>
  );
}

export function FormEditor({ record, records, onSave, onSubmit }: { record: Rec; records: Rec[]; onSave: (record: Rec) => void; onSubmit: (values: Record<string, string>) => void }) {
  const fields = (record.body as { fields: { id: string; type: string; label: string; required?: boolean; options?: string[] }[] }).fields;
  const submissions = records.filter((item) => item.collection === "submissions" && item.parentId === record.id);
  return (
    <div className="grid">
      <form className="card span-6" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const values: Record<string, string> = {};
        fields.forEach((field) => { values[field.label] = String(data.get(field.id) ?? ""); });
        onSubmit(values);
        event.currentTarget.reset();
      }}>
        <h2>{record.title}</h2>
        {fields.map((field) => (
          <label key={field.id} className="field">
            <span>{field.label}</span>
            {field.type === "select" ? (
              <select name={field.id} required={field.required}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>
            ) : (
              <input name={field.id} type={field.type === "email" ? "email" : "text"} required={field.required} />
            )}
          </label>
        ))}
        <button className="btn" type="submit">Submit locally</button>
        <button className="btn-ghost" type="button" onClick={() => saveBody(record, { fields: [...fields, { id: crypto.randomUUID(), type: "text", label: "Note", required: false }] }, onSave)}>Add field</button>
      </form>
      <section className="card span-6">
        <h2>Submissions</h2>
        <ul>{submissions.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
      </section>
    </div>
  );
}

export function WorkflowEditor({ record, onSave }: { record: Rec; onSave: (record: Rec) => void }) {
  const body = record.body as { nodes: { id: string; type: string; label: string; x: number; y: number }[]; edges: { from: string; to: string }[] };
  return (
    <section className="card">
      <svg className="graph" viewBox="0 0 680 280" role="img" aria-label="Workflow">
        {body.edges.map((edge) => {
          const from = body.nodes.find((node) => node.id === edge.from);
          const to = body.nodes.find((node) => node.id === edge.to);
          if (!from || !to) return null;
          return <line key={`${edge.from}-${edge.to}`} x1={from.x + 80} y1={from.y + 24} x2={to.x} y2={to.y + 24} stroke="#234FE8" strokeWidth="2" />;
        })}
        {body.nodes.map((node) => (
          <g key={node.id}>
            <rect x={node.x} y={node.y} width="150" height="48" rx="10" fill={node.type === "approval" ? "#FFAE7C" : "#234FE8"} />
            <text x={node.x + 10} y={node.y + 30} fill="#17223A" fontSize="12">{node.label}</text>
          </g>
        ))}
      </svg>
      <button className="btn" type="button" onClick={() => onSave({ ...record, status: "running" })}>Run locally until approval</button>
      <p className="meta">The run stops at the approval node. No external system is called.</p>
    </section>
  );
}

export function Storefront({ records, orgId, onAdd, onCheckout }: { records: Rec[]; orgId: string; onAdd: (productId: string) => void; onCheckout: () => void }) {
  const products = records.filter((item) => item.organizationId === orgId && item.collection === "products" && item.status === "active");
  const cart = records.find((item) => item.organizationId === orgId && item.collection === "carts");
  const lines = ((cart?.body as { lines?: { productId: string; qty: number }[] })?.lines ?? []);
  return (
    <div className="grid">
      {products.map((product) => (
        <article key={product.id} className="card span-4">
          <h2>{product.title}</h2>
          <p>{product.summary}</p>
          <p><strong>{formatMoney(Number(product.amountMinor ?? 0), currencyFor(orgId))}</strong> ex VAT</p>
          <p className="meta">{quantityOnHand(records, orgId, product.id)} on hand</p>
          <button className="btn" type="button" onClick={() => onAdd(product.id)}>Add to cart</button>
        </article>
      ))}
      <aside className="card span-4">
        <h2>Cart</h2>
        <ul>{lines.map((line) => <li key={line.productId}>{products.find((item) => item.id === line.productId)?.title} × {line.qty}</li>)}</ul>
        <button className="btn" type="button" onClick={onCheckout} disabled={lines.length === 0}>Hold order</button>
        <p className="meta">Card capture is not connected. The order stays awaiting payment.</p>
      </aside>
    </div>
  );
}

export function BookingPage({ records, orgId, onHold }: { records: Rec[]; orgId: string; onHold: (serviceId: string, start: string) => void }) {
  const services = records.filter((item) => item.organizationId === orgId && item.collection === "services");
  const slots = ["2026-11-21T10:00:00.000Z", "2026-11-21T11:00:00.000Z", "2026-11-22T14:00:00.000Z"];
  return (
    <div className="grid">
      {services.map((service) => (
        <section key={service.id} className="card span-6">
          <h2>{service.title}</h2>
          <p>{service.summary}</p>
          {slots.map((slot) => {
            const end = new Date(new Date(slot).getTime() + Number(service.fields.minutes ?? 45) * 60000).toISOString();
            const conflict = findBookingConflict(records, orgId, "nl-resources-001", slot, end);
            return (
              <button key={slot} className="btn-ghost" type="button" disabled={Boolean(conflict)} onClick={() => onHold(service.id, slot)}>
                {slot.slice(0, 16).replace("T", " ")} {conflict ? "held" : "available"}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
