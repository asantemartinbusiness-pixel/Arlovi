import { useRef, useState } from "react";
import { Download, FlipHorizontal2, FlipVertical2, ImagePlus, RotateCcw, RotateCw } from "lucide-react";
import { Tool, Toolbar } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { downloadBlob, slug, type DocHandle } from "@/applications/visual/kit";
import { uid } from "@/applications/visual/geometry";
import { exportComposite, loadImage, makeCanvas, type RasterDoc } from "./raster";
import { placePhoto, transformBlocked, transformImage, transformMaskImage, type ImageTransform } from "./transform";
import { bumpPixels, unsupportedReason } from "./model";
import type { ImageBank } from "./canvas";

/* ====================================================================== *
 * The raster editor's image strip: open a photograph from disk, turn or
 * mirror the whole image, and write a PNG of the composite — all in this
 * browser, all on the editor's undo stack.
 * ====================================================================== */

const TRANSFORMS: { id: ImageTransform; label: string; icon: React.ReactNode }[] = [
  { id: "rotate-ccw", label: "Rotate the image 90° left", icon: <RotateCcw size={15} /> },
  { id: "rotate-cw", label: "Rotate the image 90° right", icon: <RotateCw size={15} /> },
  { id: "flip-x", label: "Flip the image horizontally", icon: <FlipHorizontal2 size={15} /> },
  { id: "flip-y", label: "Flip the image vertically", icon: <FlipVertical2 size={15} /> },
];

/** True when the image is still the generated raster a record opens with. */
function onlyGenerated(doc: RasterDoc): boolean {
  const pixels = doc.layers.filter((layer) => layer.kind === "pixel");
  return pixels.length === 1 && /generated/i.test(doc.origin ?? "");
}

export function ImageTools({ context, handle, bank, title }: { context: ScreenContext; handle: DocHandle<RasterDoc>; bank: ImageBank; title: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const doc = handle.doc;

  const open = async (file: File) => {
    const reason = unsupportedReason(file);
    if (reason) { context.toast("This file cannot be opened", reason, "blocked"); return; }
    setBusy(true);
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The file could not be read."));
        reader.readAsDataURL(file);
      });
      const image = await loadImage(src);
      const current = handle.doc;
      if (!current) return;
      const resize = onlyGenerated(current);
      handle.edit(placePhoto(current, { id: uid("layer"), name: file.name, src, width: image.naturalWidth, height: image.naturalHeight }, resize), `Open ${file.name}`);
      bumpPixels();
      context.toast(
        "Photo opened",
        resize
          ? `${file.name} is ${image.naturalWidth} × ${image.naturalHeight}; the image now has its size and the generated background stays beneath it as a layer.`
          : `${file.name} was placed as a new layer, fitted inside the ${current.width} × ${current.height} image.`,
      );
    } catch (error) {
      context.toast("The photo could not be opened", error instanceof Error ? error.message : "The browser could not decode it.", "failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const transform = async (id: ImageTransform, label: string) => {
    const current = handle.doc;
    if (!current) return;
    /* Every mask — enabled or not — is turned with the picture so it stays
       over the same pixels when it is switched back on. */
    const masked = current.layers.filter((layer) => layer.mask);
    const turned: Record<string, string> = {};
    const undecodable: string[] = [];
    if (masked.length > 0) setBusy(true);
    try {
      for (const layer of masked) {
        try {
          const source = await loadImage(layer.mask!);
          turned[layer.id] = transformMaskImage(source, current, id, makeCanvas);
        } catch {
          undecodable.push(layer.id);
        }
      }
    } finally {
      if (masked.length > 0) setBusy(false);
    }
    const blocked = transformBlocked(current, undecodable);
    if (blocked) { context.toast("The image cannot be turned yet", blocked, "blocked"); return; }
    handle.edit(transformImage(current, id, turned), masked.length > 0 ? `${label} (with ${masked.length === 1 ? "its mask" : `${masked.length} masks`})` : label);
    bumpPixels();
  };

  const exportPng = async () => {
    const current = handle.doc;
    if (!current || !bank.ready) return;
    setBusy(true);
    try {
      const result = await exportComposite(current, bank.images, bank.masks, { format: "png", quality: 1 });
      const name = `${slug(title)}-${result.width}x${result.height}.png`;
      downloadBlob(name, result.blob);
      if (context.params.id) await context.mutate.log(`Exported ${name} (${result.blob.size} bytes)`, { entityId: context.params.id, type: "export" });
      context.toast("PNG written", `${name}: ${result.width} × ${result.height}, ${(result.blob.size / 1024).toFixed(0)} kB, encoded by this browser.`);
    } catch (error) {
      context.toast("Export failed", error instanceof Error ? error.message : "The browser produced no image data.", "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Toolbar label="Image">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Photo file to open"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void open(file); }}
      />
      <Tool label="Open a photo from this device" icon={<ImagePlus size={15} />} disabled={!doc || busy} onClick={() => input.current?.click()} />
      {TRANSFORMS.map((item) => (
        <Tool key={item.id} label={item.label} icon={item.icon} disabled={!doc || busy} onClick={() => { void transform(item.id, item.label); }} />
      ))}
      <Tool label="Export the composite as PNG" icon={<Download size={15} />} disabled={!doc || !bank.ready || busy} onClick={() => { void exportPng(); }}>PNG</Tool>
    </Toolbar>
  );
}
