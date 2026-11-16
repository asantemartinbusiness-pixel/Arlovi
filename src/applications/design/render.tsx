import type { ReactNode } from "react";
import { childrenOf, type DesignDoc, type ScenePage, type SceneNode } from "./scene";
import { pathToD, polygonPoints } from "./path";

/* ====================================================================== *
 * One renderer for the canvas and for SVG export. The React path and the
 * string path build the same geometry so what is exported is what is seen.
 * ====================================================================== */

function nodeTransform(node: SceneNode): string {
  const spin = node.rotation ? ` rotate(${node.rotation} ${node.w / 2} ${node.h / 2})` : "";
  return `translate(${node.x} ${node.y})${spin}`;
}

function fillValue(node: SceneNode, gradientId: string): string {
  if (!node.fill) return "none";
  if (node.fill.type === "linear") return `url(#${gradientId})`;
  return node.fill.color;
}

function shadowFilterId(node: SceneNode): string | undefined {
  return node.shadow ? `shadow-${node.id}` : undefined;
}

export function NodeView({
  page, node, doc, selected, onPointerDown, onDoubleClick, depth = 0,
}: {
  page: ScenePage;
  node: SceneNode;
  doc: DesignDoc;
  selected: string[];
  onPointerDown?: (node: SceneNode, event: React.PointerEvent) => void;
  onDoubleClick?: (node: SceneNode) => void;
  depth?: number;
}): ReactNode {
  if (!node.visible) return null;
  const gradientId = `grad-${node.id}`;
  const filterId = shadowFilterId(node);
  const common = {
    opacity: node.opacity,
    filter: filterId ? `url(#${filterId})` : undefined,
    onPointerDown: onPointerDown ? (event: React.PointerEvent) => onPointerDown(node, event) : undefined,
    onDoubleClick: onDoubleClick ? () => onDoubleClick(node) : undefined,
    style: { cursor: node.locked ? "not-allowed" : "default" } as React.CSSProperties,
  };
  const strokeProps = node.stroke
    ? { stroke: node.stroke.color, strokeWidth: node.stroke.width, strokeDasharray: node.stroke.dash ? `${node.stroke.dash} ${node.stroke.dash}` : undefined }
    : {};

  const defs = (
    <>
      {node.fill?.type === "linear" && (
        <linearGradient id={gradientId} gradientTransform={`rotate(${node.fill.angle ?? 90} 0.5 0.5)`}>
          <stop offset="0%" stopColor={node.fill.color} />
          <stop offset="100%" stopColor={node.fill.to ?? node.fill.color} />
        </linearGradient>
      )}
      {node.shadow && filterId && (
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx={node.shadow.x} dy={node.shadow.y} stdDeviation={node.shadow.blur / 2} floodColor={node.shadow.color} />
        </filter>
      )}
    </>
  );

  let shape: ReactNode = null;
  if (node.kind === "rect" || node.kind === "frame" || node.kind === "instance") {
    shape = <rect width={Math.max(node.w, 0)} height={Math.max(node.h, 0)} rx={node.radius ?? 0} fill={fillValue(node, gradientId)} {...strokeProps} {...common} />;
  } else if (node.kind === "ellipse") {
    shape = <ellipse cx={node.w / 2} cy={node.h / 2} rx={Math.max(node.w / 2, 0)} ry={Math.max(node.h / 2, 0)} fill={fillValue(node, gradientId)} {...strokeProps} {...common} />;
  } else if (node.kind === "line") {
    shape = <line x1={0} y1={0} x2={node.w} y2={node.h} {...strokeProps} strokeLinecap="round" {...common} />;
  } else if (node.kind === "polygon") {
    shape = <polygon points={polygonPoints(node.w, node.h, node.sides ?? 6).map((p) => `${p.x},${p.y}`).join(" ")} fill={fillValue(node, gradientId)} {...strokeProps} {...common} />;
  } else if (node.kind === "path" && node.path) {
    shape = <path d={pathToD(node.path)} fill={node.fill ? fillValue(node, gradientId) : "none"} fillRule={node.path.fillRule} {...strokeProps} strokeLinejoin="round" {...common} />;
  } else if (node.kind === "text") {
    const style = node.textStyle;
    const lines = (node.text ?? "").split("\n");
    const size = style?.size ?? 16;
    const lineHeight = size * (style?.lineHeight ?? 1.3);
    shape = (
      <text
        fontFamily={style?.family ?? "Inter"}
        fontSize={size}
        fontWeight={style?.weight ?? 400}
        letterSpacing={style?.letterSpacing ?? 0}
        fill={style?.color ?? "#17223A"}
        textAnchor={style?.align === "center" ? "middle" : style?.align === "end" ? "end" : "start"}
        {...common}
      >
        {lines.map((line, index) => (
          <tspan
            key={index}
            x={style?.align === "center" ? node.w / 2 : style?.align === "end" ? node.w : 0}
            y={lineHeight * (index + 0.8)}
          >
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  const kids = (node.kind === "frame" || node.kind === "group")
    ? childrenOf(page, node.id).map((child) => (
      <NodeView key={child.id} page={page} node={child} doc={doc} selected={selected} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} depth={depth + 1} />
    ))
    : null;

  return (
    <g transform={nodeTransform(node)} data-node={node.id} data-kind={node.kind} aria-hidden={false}>
      <defs>{defs}</defs>
      {node.kind === "frame" ? (
        <>
          {shape}
          <g clipPath={`url(#clip-${node.id})`}>
            <defs><clipPath id={`clip-${node.id}`}><rect width={Math.max(node.w, 0)} height={Math.max(node.h, 0)} rx={node.radius ?? 0} /></clipPath></defs>
            {kids}
          </g>
        </>
      ) : (
        <>
          {shape}
          {kids}
        </>
      )}
    </g>
  );
}

/* ------------------------------ string export ------------------------------ */

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nodeToSvg(page: ScenePage, node: SceneNode): string {
  if (!node.visible) return "";
  const gradientId = `grad-${node.id}`;
  const filterId = shadowFilterId(node);
  const defs: string[] = [];
  if (node.fill?.type === "linear") {
    defs.push(`<linearGradient id="${gradientId}" gradientTransform="rotate(${node.fill.angle ?? 90} 0.5 0.5)"><stop offset="0%" stop-color="${node.fill.color}"/><stop offset="100%" stop-color="${node.fill.to ?? node.fill.color}"/></linearGradient>`);
  }
  if (node.shadow && filterId) {
    defs.push(`<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${node.shadow.x}" dy="${node.shadow.y}" stdDeviation="${node.shadow.blur / 2}" flood-color="${node.shadow.color}"/></filter>`);
  }
  const paint = [
    node.fill ? `fill="${node.fill.type === "linear" ? `url(#${gradientId})` : node.fill.color}"` : 'fill="none"',
    node.stroke ? `stroke="${node.stroke.color}" stroke-width="${node.stroke.width}"` : "",
    filterId ? `filter="url(#${filterId})"` : "",
    node.opacity < 1 ? `opacity="${node.opacity}"` : "",
  ].filter(Boolean).join(" ");

  let shape = "";
  if (node.kind === "rect" || node.kind === "frame" || node.kind === "instance") {
    shape = `<rect width="${node.w}" height="${node.h}" rx="${node.radius ?? 0}" ${paint}/>`;
  } else if (node.kind === "ellipse") {
    shape = `<ellipse cx="${node.w / 2}" cy="${node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" ${paint}/>`;
  } else if (node.kind === "line") {
    shape = `<line x1="0" y1="0" x2="${node.w}" y2="${node.h}" ${paint} stroke-linecap="round"/>`;
  } else if (node.kind === "polygon") {
    shape = `<polygon points="${polygonPoints(node.w, node.h, node.sides ?? 6).map((p) => `${p.x},${p.y}`).join(" ")}" ${paint}/>`;
  } else if (node.kind === "path" && node.path) {
    shape = `<path d="${pathToD(node.path)}" fill-rule="${node.path.fillRule}" ${paint}/>`;
  } else if (node.kind === "text") {
    const style = node.textStyle;
    const size = style?.size ?? 16;
    const lineHeight = size * (style?.lineHeight ?? 1.3);
    const anchorValue = style?.align === "center" ? "middle" : style?.align === "end" ? "end" : "start";
    const x = style?.align === "center" ? node.w / 2 : style?.align === "end" ? node.w : 0;
    const spans = (node.text ?? "").split("\n").map((line, index) => `<tspan x="${x}" y="${lineHeight * (index + 0.8)}">${escapeXml(line)}</tspan>`).join("");
    shape = `<text font-family="${escapeXml(style?.family ?? "Inter")}" font-size="${size}" font-weight="${style?.weight ?? 400}" letter-spacing="${style?.letterSpacing ?? 0}" fill="${style?.color ?? "#17223A"}" text-anchor="${anchorValue}">${spans}</text>`;
  }

  const kids = (node.kind === "frame" || node.kind === "group")
    ? childrenOf(page, node.id).map((child) => nodeToSvg(page, child)).join("")
    : "";

  const spin = node.rotation ? ` rotate(${node.rotation} ${node.w / 2} ${node.h / 2})` : "";
  const inner = node.kind === "frame"
    ? `${shape}<g clip-path="url(#clip-${node.id})">${kids}</g>`
    : `${shape}${kids}`;
  const clip = node.kind === "frame" ? `<clipPath id="clip-${node.id}"><rect width="${node.w}" height="${node.h}" rx="${node.radius ?? 0}"/></clipPath>` : "";
  const defsBlock = defs.length || clip ? `<defs>${defs.join("")}${clip}</defs>` : "";
  return `<g transform="translate(${node.x} ${node.y})${spin}">${defsBlock}${inner}</g>`;
}

/** Full-page SVG. `only` exports one node (and its children) instead. */
export function pageToSvg(page: ScenePage, bounds: { x: number; y: number; w: number; h: number }, only?: SceneNode): string {
  const content = only
    ? nodeToSvg(page, { ...only, x: only.x, y: only.y })
    : childrenOf(page, page.id).map((node) => nodeToSvg(page, node)).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(bounds.w)}" height="${Math.round(bounds.h)}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">`,
    `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${page.background}"/>`,
    content,
    "</svg>",
  ].join("");
}

/** Rasterise an SVG string through an off-screen canvas — a real PNG. */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not decode the exported SVG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser did not provide a 2-D canvas context.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The canvas produced no PNG data."))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
