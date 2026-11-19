import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { Button, Checkbox, Field, Row, Select, Stack, TextArea, TextInput, Tool } from "@/design-system";
import { useCollection } from "@/platform/workspace";
import { createStore, useStore } from "@/applications/visual/kit";
import {
  addComment, blockIndex, blockText, emptyBlock, insertBlockAfter, setLink, toggleMark,
  setBlockType, type Block, type BlockType, type DocRange, type MarkType,
} from "./model";
import type { DocEditor } from "./state";

/* ====================================================================== *
 * Lightweight editor popovers. Style, link, table, image, comment and
 * format tools open a small non-modal panel anchored to the tool that was
 * pressed. They write through the editor's one `commit`, so every change is
 * a single undo step, and Escape or a click in the page dismisses them
 * without touching the text.
 * ====================================================================== */

type Toast = (title: string, body: string, tone?: "blocked") => void;
export type DocPopoverKind = "link" | "table" | "image" | "styles" | "comment" | "format";
interface DocPopoverState { kind: DocPopoverKind; range: DocRange | null; blockId?: string }

/** Which popover is open. Contract actions and shortcuts set it; the matching tool renders the panel. */
export const docPopover = createStore<DocPopoverState | null>(null);

export function openDocPopover(kind: DocPopoverKind, extra: { range?: DocRange | null; blockId?: string } = {}): void {
  docPopover.set({ kind, range: extra.range ?? null, blockId: extra.blockId });
}

const isCollapsed = (range: DocRange | null | undefined) =>
  !range || (range.anchor.blockId === range.head.blockId && range.anchor.offset === range.head.offset);

/** A tool button that owns one popover. */
export function PopoverTool({
  kind, label, icon, editor, title, width = 300, disabled, pressed, children, trigger,
}: {
  kind: DocPopoverKind;
  label: string;
  icon?: ReactNode;
  editor: DocEditor;
  title: string;
  width?: number;
  disabled?: boolean;
  pressed?: boolean;
  /** Receives `done`, which closes the panel and puts the caret back. */
  children: (done: () => void, range: DocRange | null, blockId?: string) => ReactNode;
  /** Replace the default Tool button (for example the block-type select). */
  trigger?: (open: () => void) => ReactNode;
}) {
  const state = useStore(docPopover);
  const open = state?.kind === kind;
  const range = state?.range ?? editor.selection;
  const close = (restore: boolean) => {
    const saved = docPopover.get()?.range ?? null;
    docPopover.set(null);
    if (restore && saved) editor.moveCaret(saved);
  };
  const show = () => openDocPopover(kind, { range: editor.selection });
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(true); }}>
      <PopoverPrimitive.Anchor asChild>
        <span className="dx-pop-anchor">
          {trigger ? trigger(show) : (
            <Tool label={label} icon={icon} disabled={disabled} pressed={pressed ?? open} onClick={() => (open ? close(true) : show())} />
          )}
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="ds-popover dx-pop"
          style={{ width }}
          sideOffset={6}
          align="start"
          collisionPadding={12}
          aria-label={title}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="dx-pop-head">{title}</div>
          {children(() => close(true), range, state?.blockId)}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/* ----------------------------------- Link ---------------------------------- */

export function LinkPopoverBody({ editor, range, done, toast }: {
  editor: DocEditor; range: DocRange | null; done: () => void; toast: Toast;
}) {
  const [href, setHref] = useState(() => {
    if (!range) return "";
    const block = editor.model.blocks[blockIndex(editor.model, range.anchor.blockId)];
    const at = Math.min(range.anchor.offset, range.head.offset);
    let cursor = 0;
    for (const run of block?.runs ?? []) {
      if (at < cursor + run.text.length && run.link) return run.link;
      cursor += run.text.length;
    }
    return "";
  });
  const expanded = !isCollapsed(range);
  const apply = (value: string | undefined) => {
    if (!range || !expanded) return;
    const result = setLink(editor.model, range, value);
    editor.commit(result.model, value ? "Add link" : "Remove link", result.selection);
    toast(value ? "Link added" : "Link removed", value ? "Applied to the selected words only." : "The selected words are plain text again.");
    done();
  };
  return (
    <form className="dx-pop-form" onSubmit={(event) => { event.preventDefault(); apply(href.trim() || undefined); }}>
      {!expanded && <p className="dx-pop-note">Select the words to link first.</p>}
      <Field label="Address">
        <TextInput aria-label="Link address" value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://" autoFocus disabled={!expanded} />
      </Field>
      <Row gap={2}>
        <Button size="sm" variant="primary" type="submit" disabled={!expanded || !href.trim()}>Apply link</Button>
        <Button size="sm" variant="ghost" type="button" disabled={!expanded} onClick={() => apply(undefined)}>Remove link</Button>
      </Row>
    </form>
  );
}

/* ---------------------------------- Table ---------------------------------- */

export function TablePopoverBody({ editor, done, toast }: {
  editor: DocEditor; done: () => void; toast: Toast;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const clamp = (value: number, max: number) => Math.max(1, Math.min(max, value || 1));
  return (
    <form
      className="dx-pop-form"
      onSubmit={(event) => {
        event.preventDefault();
        const table = {
          header,
          rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (header && r === 0 ? `Column ${c + 1}` : ""))),
        };
        const result = insertBlockAfter(editor.model, editor.selection?.head.blockId, { ...emptyBlock("table"), table });
        editor.commit(result.model, "Insert table", result.selection);
        toast("Table inserted", `${rows} × ${cols}, after the current block. Undo removes it.`);
        done();
      }}
    >
      <div className="dx-pop-grid">
        <Field label="Rows"><TextInput aria-label="Rows" inputMode="numeric" align="end" value={String(rows)} autoFocus onChange={(event) => setRows(clamp(Number(event.target.value), 20))} /></Field>
        <Field label="Columns"><TextInput aria-label="Columns" inputMode="numeric" align="end" value={String(cols)} onChange={(event) => setCols(clamp(Number(event.target.value), 8))} /></Field>
      </div>
      <Checkbox label="First row is a header" checked={header} onChange={(event) => setHeader(event.target.checked)} />
      <Row gap={2}><Button size="sm" variant="primary" type="submit">Insert table</Button></Row>
    </form>
  );
}

/* ----------------------------------- Image --------------------------------- */

export function ImagePopoverBody({ editor, blockId, done, toast }: {
  editor: DocEditor; blockId?: string; done: () => void; toast: Toast;
}) {
  const assets = useCollection("assets");
  const existing = blockId ? editor.model.blocks[blockIndex(editor.model, blockId)] : undefined;
  const [assetId, setAssetId] = useState(existing?.image?.assetId ?? assets[0]?.id ?? "");
  const [alt, setAlt] = useState(existing?.image?.alt ?? "");
  const [caption, setCaption] = useState(existing?.image?.caption ?? "");
  const [width, setWidth] = useState(String(existing?.image?.widthPercent ?? 100));
  return (
    <form
      className="dx-pop-form"
      onSubmit={(event) => {
        event.preventDefault();
        const image = { assetId: assetId || undefined, alt, caption, widthPercent: Number(width) || 100 };
        if (existing) {
          editor.commit({ ...editor.model, blocks: editor.model.blocks.map((block) => (block.id === existing.id ? { ...block, image } : block)) }, "Image reference");
        } else {
          const block: Block = { ...emptyBlock("image"), image };
          const result = insertBlockAfter(editor.model, editor.selection?.head.blockId, block);
          editor.commit(result.model, "Insert image", result.selection);
        }
        toast("Image reference saved", assetId ? "The document points at the asset record; no file is copied in." : "No asset is referenced yet; the frame says so.");
        done();
      }}
    >
      <Field label="Asset" hint={assets.length ? undefined : "No assets in this workspace yet."}>
        <Select aria-label="Asset" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
          <option value="">No asset yet</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
        </Select>
      </Field>
      <Field label="Alternative text" required><TextInput aria-label="Alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} required autoFocus /></Field>
      <div className="dx-pop-grid">
        <Field label="Caption"><TextInput aria-label="Caption" value={caption} onChange={(event) => setCaption(event.target.value)} /></Field>
        <Field label="Width (%)"><TextInput aria-label="Width (%)" inputMode="numeric" align="end" value={width} onChange={(event) => setWidth(event.target.value)} /></Field>
      </div>
      <Row gap={2}><Button size="sm" variant="primary" type="submit">{existing ? "Save image" : "Insert image"}</Button></Row>
    </form>
  );
}

/* ---------------------------------- Styles --------------------------------- */

export function StylesPopoverBody({ editor, done, toast }: {
  editor: DocEditor; done: () => void; toast: Toast;
}) {
  const current = editor.model.blocks[blockIndex(editor.model, editor.selection?.head.blockId ?? "")]?.styleId;
  const [styleId, setStyleId] = useState(current ?? editor.model.styles[0]?.id ?? "");
  const style = editor.model.styles.find((item) => item.id === styleId);
  const [edit, setEdit] = useState<{ fontSize: string; weight: string; spaceBefore: string } | null>(null);
  if (!style) return <p className="dx-pop-note">This document has no named styles.</p>;
  const values = edit ?? { fontSize: String(style.fontSize), weight: String(style.weight), spaceBefore: String(style.spaceBefore) };
  const used = editor.model.blocks.filter((block) => block.styleId === style.id).length;
  return (
    <form
      className="dx-pop-form"
      onSubmit={(event) => {
        event.preventDefault();
        const styles = editor.model.styles.map((item) => (item.id === style.id
          ? { ...item, fontSize: Number(values.fontSize) || item.fontSize, weight: Number(values.weight) || item.weight, spaceBefore: Number(values.spaceBefore) || item.spaceBefore }
          : item));
        editor.commit({ ...editor.model, styles }, "Edit style");
        toast("Style saved", `${used} block${used === 1 ? "" : "s"} using ${style.name} updated.`);
        done();
      }}
    >
      <Field label="Named style">
        <Select aria-label="Style to edit" value={styleId} onChange={(event) => { setStyleId(event.target.value); setEdit(null); }} autoFocus>
          {editor.model.styles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <div className="dx-pop-grid" data-cols="3">
        <Field label="Size"><TextInput aria-label="Size" inputMode="numeric" align="end" value={values.fontSize} onChange={(event) => setEdit({ ...values, fontSize: event.target.value })} /></Field>
        <Field label="Weight"><TextInput aria-label="Weight" inputMode="numeric" align="end" value={values.weight} onChange={(event) => setEdit({ ...values, weight: event.target.value })} /></Field>
        <Field label="Space before"><TextInput aria-label="Space before" inputMode="numeric" align="end" value={values.spaceBefore} onChange={(event) => setEdit({ ...values, spaceBefore: event.target.value })} /></Field>
      </div>
      <p className="dx-pop-note">{used ? `Changes every one of the ${used} block${used === 1 ? "" : "s"} using it.` : "No block uses this style yet."}</p>
      <Row gap={2}><Button size="sm" variant="primary" type="submit">Save style</Button></Row>
    </form>
  );
}

/* --------------------------------- Comment --------------------------------- */

export function CommentPopoverBody({ editor, range, done, toast }: {
  editor: DocEditor; range: DocRange | null; done: () => void; toast: Toast;
}) {
  const [body, setBody] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const spans = !isCollapsed(range);
  const quote = spans && range ? (() => {
    const block = editor.model.blocks[blockIndex(editor.model, range.anchor.blockId)];
    if (!block) return "";
    const from = Math.min(range.anchor.offset, range.head.offset);
    const to = Math.max(range.anchor.offset, range.head.offset);
    return blockText(block).slice(from, to);
  })() : "";
  return (
    <form
      className="dx-pop-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!range || !spans || !body.trim()) return;
        const result = addComment(editor.model, range, body.trim(), editor.actor, mandatory);
        if (!result) { toast("Select some text first", "A comment anchors to selected words.", "blocked"); return; }
        editor.commit(result.model, "Add comment");
        toast("Comment added", mandatory ? "It must be resolved before approval." : "Anchored to the selected words.");
        done();
      }}
    >
      {quote ? <blockquote className="dx-pop-quote">{quote}</blockquote> : <p className="dx-pop-note">Select the words the comment is about first.</p>}
      <TextArea aria-label="Comment" value={body} onChange={(event) => setBody(event.target.value)} rows={3} required autoFocus disabled={!spans} placeholder="Say what needs to change" />
      <Checkbox label="Must be resolved before approval" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />
      <Row gap={2}><Button size="sm" variant="primary" type="submit" disabled={!spans || !body.trim()}>Add comment</Button></Row>
    </form>
  );
}

/* ---------------------------------- Format --------------------------------- */

const MARKS: { mark: MarkType; label: string }[] = [
  { mark: "bold", label: "Bold" }, { mark: "italic", label: "Italic" }, { mark: "underline", label: "Underline" },
  { mark: "strike", label: "Strikethrough" }, { mark: "code", label: "Code" },
];
const BLOCKS: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Body text" }, { value: "heading1", label: "Heading 1" }, { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" }, { value: "bulletItem", label: "Bulleted list" }, { value: "numberItem", label: "Numbered list" },
  { value: "quote", label: "Quote" }, { value: "code", label: "Code" },
];

export function FormatPopoverBody({ editor, range }: { editor: DocEditor; range: DocRange | null }) {
  if (!range) return <p className="dx-pop-note">Put the caret in the text to format it.</p>;
  const block = editor.model.blocks[blockIndex(editor.model, range.head.blockId)];
  const spans = !isCollapsed(range);
  return (
    <Stack gap={3}>
      <Row gap={1} wrap>
        {MARKS.map((item) => (
          <Button
            key={item.mark} size="sm" variant={editor.marks.includes(item.mark) ? "primary" : "secondary"} disabled={!spans}
            aria-pressed={editor.marks.includes(item.mark)}
            onClick={() => { const result = toggleMark(editor.model, range, item.mark); editor.commit(result.model, item.label, result.selection); }}
          >{item.label}</Button>
        ))}
      </Row>
      {!spans && <p className="dx-pop-note">Select words to apply a mark. The paragraph type below works from the caret.</p>}
      <Field label="Paragraph type">
        <Select
          aria-label="Paragraph type" value={block?.type ?? "paragraph"}
          onChange={(event) => { const result = setBlockType(editor.model, range, event.target.value as BlockType); editor.commit(result.model, "Paragraph type", result.selection); }}
        >
          {BLOCKS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Field>
    </Stack>
  );
}
