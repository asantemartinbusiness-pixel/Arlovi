import { FileQuestion } from "lucide-react";
import { Pill, Row } from "@/design-system";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Asset previews.
 *
 * Three honest states, and the interface never mixes them up:
 *   stored_svg         the record holds the markup; what you see is the asset
 *   generated_preview  no file is stored; the picture is drawn here from the
 *                      record's own palette, shape and aspect ratio
 *   metadata_only      nothing is stored and nothing is drawn
 * A record uploaded in this session carries a data URL in its body, which is
 * the real file the person chose, held in this browser.
 * ====================================================================== */

export type FileState = "stored_svg" | "generated_preview" | "metadata_only" | "uploaded";

export function fileState(record: Rec): FileState {
  const body = record.body as { dataUrl?: string; svg?: string } | undefined;
  if (body?.dataUrl) return "uploaded";
  if (body?.svg) return "stored_svg";
  const declared = String(record.fields.fileState ?? "");
  if (declared === "stored_svg") return "stored_svg";
  if (declared === "metadata_only") return "metadata_only";
  return "generated_preview";
}

export const FILE_STATE_LABEL: Record<FileState, string> = {
  stored_svg: "Markup stored here",
  uploaded: "File held in this browser",
  generated_preview: "Preview drawn here",
  metadata_only: "Metadata only",
};

export const FILE_STATE_TONE: Record<FileState, "success" | "info" | "warning"> = {
  stored_svg: "success",
  uploaded: "success",
  generated_preview: "info",
  metadata_only: "warning",
};

export function palette(record: Rec): string[] {
  const value = String(record.fields.palette ?? "");
  const colours = value.split(",").map((part) => part.trim()).filter((part) => /^#[0-9a-fA-F]{3,8}$/.test(part));
  return colours.length ? colours : ["#234FE8", "#FFAE7C", "#0B1020"];
}

/** Bytes we can actually account for; undefined when nothing is stored. */
export function storedBytes(record: Rec): number | undefined {
  const body = record.body as { dataUrl?: string; svg?: string } | undefined;
  if (body?.dataUrl) return body.dataUrl.length;
  if (body?.svg) return body.svg.length;
  return undefined;
}

function aspect(record: Rec): { width: number; height: number } {
  const width = Number(record.fields.width ?? 0) || 320;
  const height = Number(record.fields.height ?? 0) || 200;
  return { width, height };
}

function drawn(record: Rec): string {
  const [one, two, three = "#0B1020"] = palette(record);
  const { width, height } = aspect(record);
  const shape = String(record.fields.shape ?? record.fields.kind ?? "image");
  const open = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' preserveAspectRatio='xMidYMid slice'>`;
  const w = width;
  const h = height;
  const cx = w / 2;
  const cy = h / 2;

  const body = (() => {
    switch (shape) {
      case "pendant":
        return `
          <rect width='${w}' height='${h}' fill='${three}'/>
          <rect width='${w}' height='${h}' fill='${one}' opacity='0.18'/>
          <line x1='${cx}' y1='0' x2='${cx}' y2='${cy - h * 0.14}' stroke='${two}' stroke-width='${Math.max(2, w * 0.004)}'/>
          <ellipse cx='${cx}' cy='${cy}' rx='${w * 0.14}' ry='${h * 0.17}' fill='${two}'/>
          <ellipse cx='${cx}' cy='${cy + h * 0.17}' rx='${w * 0.14}' ry='${h * 0.04}' fill='${one}' opacity='0.85'/>
          <circle cx='${cx}' cy='${cy + h * 0.26}' r='${w * 0.02}' fill='${two}' opacity='0.5'/>`;
      case "detail":
        return `
          <rect width='${w}' height='${h}' fill='${three}'/>
          <circle cx='${cx}' cy='${cy}' r='${Math.min(w, h) * 0.42}' fill='${one}' opacity='0.5'/>
          <circle cx='${cx}' cy='${cy}' r='${Math.min(w, h) * 0.26}' fill='${two}'/>
          <circle cx='${cx - w * 0.08}' cy='${cy - h * 0.09}' r='${Math.min(w, h) * 0.05}' fill='#ffffff' opacity='0.65'/>`;
      case "interior":
        return `
          <rect width='${w}' height='${h}' fill='${three}'/>
          <rect x='0' y='${h * 0.62}' width='${w}' height='${h * 0.38}' fill='${one}' opacity='0.35'/>
          <rect x='${w * 0.08}' y='${h * 0.18}' width='${w * 0.22}' height='${h * 0.46}' fill='${two}' opacity='0.8'/>
          <rect x='${w * 0.42}' y='${h * 0.3}' width='${w * 0.16}' height='${h * 0.34}' fill='${one}' opacity='0.7'/>
          <circle cx='${w * 0.74}' cy='${h * 0.32}' r='${h * 0.1}' fill='${two}'/>
          <line x1='${w * 0.74}' y1='0' x2='${w * 0.74}' y2='${h * 0.22}' stroke='${two}' stroke-width='2'/>`;
      case "wave":
        return `
          <rect width='${w}' height='${h}' fill='${one}'/>
          <path d='M0 ${h * 0.62} C ${w * 0.25} ${h * 0.5}, ${w * 0.4} ${h * 0.78}, ${w * 0.62} ${h * 0.66} S ${w * 0.9} ${h * 0.5}, ${w} ${h * 0.6} L ${w} ${h} L 0 ${h} Z' fill='${two}' opacity='0.75'/>
          <path d='M0 ${h * 0.78} C ${w * 0.3} ${h * 0.66}, ${w * 0.55} ${h * 0.9}, ${w} ${h * 0.76} L ${w} ${h} L 0 ${h} Z' fill='${three}' opacity='0.8'/>
          <circle cx='${w * 0.78}' cy='${h * 0.26}' r='${h * 0.1}' fill='${two}' opacity='0.9'/>`;
      case "bench":
        return `
          <rect width='${w}' height='${h}' fill='${three}' opacity='0.92'/>
          <rect x='0' y='${h * 0.58}' width='${w}' height='${h * 0.1}' fill='${one}'/>
          <rect x='${w * 0.1}' y='${h * 0.68}' width='${w * 0.04}' height='${h * 0.3}' fill='${one}' opacity='0.8'/>
          <rect x='${w * 0.84}' y='${h * 0.68}' width='${w * 0.04}' height='${h * 0.3}' fill='${one}' opacity='0.8'/>
          <circle cx='${w * 0.3}' cy='${h * 0.46}' r='${h * 0.07}' fill='${two}'/>
          <rect x='${w * 0.52}' y='${h * 0.36}' width='${w * 0.14}' height='${h * 0.2}' fill='${two}' opacity='0.85'/>`;
      case "window":
        return `
          <rect width='${w}' height='${h}' fill='${three}'/>
          <rect x='${w * 0.12}' y='${h * 0.14}' width='${w * 0.76}' height='${h * 0.68}' fill='${one}' opacity='0.5'/>
          <line x1='${cx}' y1='${h * 0.14}' x2='${cx}' y2='${h * 0.82}' stroke='${three}' stroke-width='${Math.max(2, w * 0.006)}'/>
          <line x1='${w * 0.12}' y1='${cy}' x2='${w * 0.88}' y2='${cy}' stroke='${three}' stroke-width='${Math.max(2, w * 0.006)}'/>
          <circle cx='${w * 0.32}' cy='${h * 0.34}' r='${h * 0.06}' fill='${two}'/>
          <circle cx='${w * 0.68}' cy='${h * 0.62}' r='${h * 0.06}' fill='${two}' opacity='0.8'/>`;
      case "sheet":
        return `
          <rect width='${w}' height='${h}' fill='#ffffff'/>
          <rect width='${w}' height='${h * 0.12}' fill='${three}'/>
          <g fill='${three}' opacity='0.16'>
            <rect x='${w * 0.06}' y='${h * 0.22}' width='${w * 0.44}' height='${h * 0.035}' rx='3'/>
            <rect x='${w * 0.06}' y='${h * 0.3}' width='${w * 0.3}' height='${h * 0.03}' rx='3'/>
            <rect x='${w * 0.06}' y='${h * 0.46}' width='${w * 0.88}' height='${h * 0.03}' rx='3'/>
            <rect x='${w * 0.06}' y='${h * 0.53}' width='${w * 0.88}' height='${h * 0.03}' rx='3'/>
            <rect x='${w * 0.06}' y='${h * 0.6}' width='${w * 0.6}' height='${h * 0.03}' rx='3'/>
          </g>
          <rect x='${w * 0.7}' y='${h * 0.78}' width='${w * 0.24}' height='${h * 0.1}' rx='4' fill='${two}'/>`;
      default:
        return `
          <rect width='${w}' height='${h}' fill='${three}'/>
          <circle cx='${cx}' cy='${cy}' r='${Math.min(w, h) * 0.3}' fill='${one}'/>
          <circle cx='${cx + w * 0.12}' cy='${cy - h * 0.1}' r='${Math.min(w, h) * 0.12}' fill='${two}'/>`;
    }
  })();

  return `${open}${body}</svg>`;
}

/** A data URI for the asset, or undefined when nothing is stored or drawable. */
export function assetPreviewUri(record: Rec): string | undefined {
  const state = fileState(record);
  const body = record.body as { dataUrl?: string; svg?: string } | undefined;
  if (state === "uploaded" && body?.dataUrl) return body.dataUrl;
  if (state === "stored_svg" && body?.svg) return `data:image/svg+xml;utf8,${encodeURIComponent(body.svg)}`;
  if (state === "metadata_only") return undefined;
  return `data:image/svg+xml;utf8,${encodeURIComponent(drawn(record))}`;
}

export function AssetPreview({
  record, height = 140, rounded = true, fit = "cover",
}: { record: Rec; height?: number | string; rounded?: boolean; fit?: "cover" | "contain" }) {
  const uri = assetPreviewUri(record);
  const state = fileState(record);
  const style = {
    height,
    width: "100%",
    borderRadius: rounded ? "var(--radius-md)" : undefined,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-inset)",
  } as const;

  if (!uri) {
    return (
      <div
        style={{ ...style, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--fg-subtle)", textAlign: "center", padding: "var(--space-3)" }}
        role="img"
        aria-label={`${record.title}: no file is stored in this browser`}
      >
        <FileQuestion size={20} aria-hidden="true" />
        <span className="ds-subtle">No file here — {String(record.fields.format ?? "file").toUpperCase()} catalogued as metadata only</span>
      </div>
    );
  }

  return (
    <img
      src={uri}
      alt={`${record.title} — ${FILE_STATE_LABEL[state].toLowerCase()}`}
      style={{ ...style, objectFit: fit, display: "block" }}
    />
  );
}

export function FileStateTag({ record }: { record: Rec }) {
  const state = fileState(record);
  return (
    <Row gap={1} wrap>
      <Pill tone={FILE_STATE_TONE[state]}>{FILE_STATE_LABEL[state]}</Pill>
    </Row>
  );
}
