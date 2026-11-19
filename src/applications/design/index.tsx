import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useMemo, useState } from "react";
import {
  PenTool, Square, Circle, Type as TypeIcon, Frame as FrameIcon, Minus, Hexagon,
  MousePointer2, Hand, Grid3x3, Magnet, Link2, Play, FileCode2, Download, Plus, Component,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row,
  Select, Stack, Stat, StatRow, TextArea, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ActionDef, type ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import {
  EditorFrame, PanelGroup, RecoveryNotice, SaveState, ShortcutTable, downloadBlob, downloadText,
  slug, useStore, type DocHandle,
} from "@/applications/visual/kit";
import { canUndoShared, editShared, readShared, sharedHandle, undoShared, useGuardRefresh, useSharedDoc } from "./sharedDoc";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { fitRect, rectCenter } from "@/applications/visual/geometry";
import {
  absoluteRect, activePage, addNode, applyAutoLayout, isEditable, makeNode, childrenOf, contrastRatio, createComponent,
  detachInstance, findDuplicates, flatten, fontAvailable, FONT_STACK, groupNodes, instancesOf,
  instantiate, layoutConflicts, pageBounds, parentOf, patchNode, patchNodes, removeNodes, reorder,
  resizeFrame, selectionBounds, updatePage, wcagGrade,
  type DesignDoc, type SceneNode, type ScenePage,
} from "./scene";
import { ellipseToPath, polygonToPath, rectToPath, simplifyPath, combinePaths, joinEnds, moveHandle, offsetPath, setAnchorType, splitSegment, pathLength, subpathCount } from "./path";
import { NodeView, pageToSvg, svgToPng } from "./render";
import { DesignCanvas, PathCanvas } from "./canvas";
import { DesignThumb, GeometryInspector, LayersPanel, PagesPanel } from "./panels";
import { designUi, importSvg, parseDesign, requestFit, setSelection, setTool, starterDoc, type DesignTool, type ImportReport } from "./model";
import { clockIso, wallMs } from "@/platform/clock";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";

/* ====================================================================== *
 * DESIGN — Vector Design & UI Studio
 * ====================================================================== */

function useDesignDoc(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const handle = useSharedDoc<DesignDoc>(record, parseDesign, context.screen.id);
  useStore(designUi);
  useGuardRefresh(context);
  return { record, handle };
}

function MissingFile({ context }: { context: ScreenContext }) {
  const mutate = context.mutate;
  return (
    <Empty
      title="No design file at this address"
      icon={<PenTool size={20} />}
      action={
        <Button
          variant="primary"
          onClick={async () => {
            const made = await mutate.create({
              collection: "designs", title: "Untitled design", status: "draft",
              summary: "Created in the design canvas.", body: starterDoc("Untitled design"),
              fields: { kind: "file", width: 960, height: 540 },
            }, "Design file created");
            context.navigate(context.path("/o/:org/design/files/:id", made.id));
          }}
        >
          Create a file here
        </Button>
      }
    >
      {context.params.id
        ? <>The record <code>{context.params.id}</code> is not in {context.org.shortName}. Design files are per organisation; this one may belong to another workspace.</>
        : <>Open a file from the gallery, or create one now.</>}
    </Empty>
  );
}

/* ---------------------------- DESIGN-001 ---------------------------- */

function FilesGallery({ context, lens }: { context: ScreenContext; lens: "Recent" | "Shared" | "Brand" | "Templates" }) {
  const designs = useCollection("designs");
  const { relative } = useWorkspace();
  const docs = useMemo(() => designs.map((record) => ({ record, doc: parseDesign(record.body) })), [designs]);

  if (lens === "Brand") {
    const colors = new Map<string, { value: string; files: string[] }>();
    const texts = new Map<string, { style: { size: number; weight: number; family: string }; files: string[] }>();
    for (const { record, doc } of docs) {
      for (const token of doc.colors) {
        const entry = colors.get(token.name) ?? { value: token.value, files: [] };
        entry.files.push(record.title);
        colors.set(token.name, entry);
      }
      for (const style of doc.textStyles) {
        const entry = texts.get(style.name) ?? { style, files: [] };
        entry.files.push(record.title);
        texts.set(style.name, entry);
      }
    }
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Counted from the files in this workspace">
          Every swatch and text style below is read out of a design record here. Nothing is a stock palette.
        </Notice>
        <Card title="Colour tokens" subtitle={`${colors.size} tokens across ${docs.length} files`}>
          <Grid>
            {[...colors.entries()].map(([name, entry]) => (
              <Card key={name} span={3}>
                <div style={{ height: 56, borderRadius: 8, background: entry.value, border: "1px solid var(--border-default)" }} />
                <strong style={{ display: "block", marginBlockStart: 8 }}>{name}</strong>
                <code className="ds-num">{entry.value}</code>
                <p className="vx-mini">Used in {entry.files.length} file{entry.files.length === 1 ? "" : "s"} · contrast on white {contrastRatio(entry.value, "#FFFFFF")}:1 ({wcagGrade(contrastRatio(entry.value, "#FFFFFF"), false)})</p>
              </Card>
            ))}
          </Grid>
        </Card>
        <Card title="Text styles" subtitle={`${texts.size} styles`}>
          <Stack gap={2}>
            {[...texts.entries()].map(([name, entry]) => (
              <Row key={name} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <span style={{ fontFamily: entry.style.family, fontSize: Math.min(entry.style.size, 28), fontWeight: entry.style.weight }} className="ds-grow">{name}</span>
                <Pill>{entry.style.size}px / {entry.style.weight}</Pill>
                {!fontAvailable(entry.style.family) && <Pill tone="warning">{entry.style.family} not loaded</Pill>}
              </Row>
            ))}
          </Stack>
        </Card>
      </Stack>
    );
  }

  const filtered = docs.filter(({ record }) => {
    if (lens === "Shared") return Boolean(record.fields.sharedWith);
    if (lens === "Templates") return record.fields.kind === "template";
    return record.fields.kind !== "template";
  });

  if (filtered.length === 0) {
    return (
      <Empty title={`No ${lens.toLowerCase()} files`} icon={<PenTool size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("File setup")}>New file</Button>}>
        {lens === "Shared" ? "A file appears here once it has collaborators." : lens === "Templates" ? "Mark a file as a template in File setup to reuse its structure." : "Create a file to start drawing."}
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Files" value={docs.filter((item) => item.record.fields.kind !== "template").length} meta={`${docs.length} records in ${context.org.shortName}`} />
        <Stat label="Layers in total" value={docs.reduce((sum, item) => sum + item.doc.pages.reduce((n, page) => n + Object.keys(page.nodes).length, 0), 0)} meta="Counted from the documents" />
        <Stat label="Published components" value={docs.reduce((sum, item) => sum + item.doc.components.filter((c) => c.published).length, 0)} meta="Across all files" />
        <Stat label="Files with import notes" value={docs.filter((item) => item.doc.unsupported.length > 0).length} meta="Unsupported features disclosed" />
      </StatRow>
      <Grid>
        {filtered.map(({ record, doc }) => (
          <Card
            key={record.id}
            span={4}
            title={record.title}
            subtitle={`${doc.pages.length} page${doc.pages.length === 1 ? "" : "s"} · edited ${relative(record.updatedAt)}`}
            actions={<Button size="sm" variant="secondary" onClick={() => { context.select(record.id); context.navigate(context.path("/o/:org/design/files/:id", record.id)); }}>Open</Button>}
          >
            <Stack gap={2}>
              <DesignThumb doc={doc} />
              <Row gap={2} wrap>
                <Pill tone={record.status === "draft" ? "warning" : "info"} dot>{record.status}</Pill>
                {record.fields.sharedWith && <Pill tone="accent">{String(record.fields.sharedWith).split(",").length} collaborators</Pill>}
                {record.fields.format && <Pill>{String(record.fields.format)}</Pill>}
                {doc.unsupported.length > 0 && (
                  <button type="button" className="ds-pill" data-tone="warning" onClick={() => context.openOverlay("import issues", { id: record.id })}>
                    {doc.unsupported.length} unsupported feature{doc.unsupported.length === 1 ? "" : "s"}
                  </button>
                )}
              </Row>
              {record.fields.assetLink && <p className="vx-mini">Linked asset: {String(record.fields.assetLink)}</p>}
              <p className="vx-mini">Owner {record.ownerName}</p>
              <Row gap={1} wrap>
                <Button size="sm" variant="ghost" onClick={() => context.select(record.id)}>Select</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("sharing", { id: record.id })}>Sharing</Button>
              </Row>
            </Stack>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

function FileSetupForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const draftScope = `design:new-file:${context.org.id}:${context.actor}`;
  const [name, setName] = useWorkingField(draftScope, "name", "");
  const [format, setFormat] = useWorkingField(draftScope, "format", "Desktop 1440 × 900");
  const [kind, setKind] = useWorkingField(draftScope, "kind", "file");
  const sizes: Record<string, { w: number; h: number }> = {
    "Desktop 1440 × 900": { w: 1440, h: 900 },
    "Tablet 834 × 1112": { w: 834, h: 1112 },
    "Mobile 390 × 844": { w: 390, h: 844 },
    "Social 1080 × 1080": { w: 1080, h: 1080 },
    "A4 print 2480 × 3508": { w: 2480, h: 3508 },
  };
  return (
    <form
      id="design-file-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const size = sizes[format];
        const doc = starterDoc(name || "Untitled design");
        const page = doc.pages[0];
        const frameId = Object.keys(page.nodes).find((id) => page.nodes[id].kind === "frame");
        if (frameId) {
          page.nodes[frameId] = { ...page.nodes[frameId], w: size.w, h: size.h, name: `${name || "Untitled"} — ${format}` };
        }
        const made = await context.mutate.create({
          collection: "designs", title: name || "Untitled design",
          status: kind === "template" ? "template" : "draft",
          summary: `${format}. Created in the design studio.`,
          body: doc,
          fields: { kind, format, width: size.w, height: size.h },
        }, `Design file ${name || "Untitled design"} created`);
        clearWorkingDraft(draftScope);
        context.toast("File created", `${made.title} is open with a ${format} artboard.`);
        close();
        context.navigate(context.path("/o/:org/design/files/:id", made.id));
      }}
    >
      <Field label="File name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="Winter trade card" /></Field>
      <Field label="Artboard" hint="The first frame is created at this size; you can add more.">
        <Select value={format} onChange={(event) => setFormat(event.target.value)}>
          {Object.keys(sizes).map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="file">Design file</option>
          <option value="template">Template others can fork</option>
        </Select>
      </Field>
      <Notice tone="info" title="Stays in this browser">The file is a record in this workspace. Nothing is uploaded.</Notice>
      <Row gap={2}>
        <WorkingDraftStatus scope={draftScope} />
        <Button type="button" variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
    </form>
  );
}

function ImportSvgOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileName, setFileName] = useState("");
  const record = useRecord(context.selectedId ?? context.params.id);
  return (
    <Stack gap={3}>
      <Field label="SVG file" hint="Parsed by this browser; nothing is uploaded.">
        <input
          type="file"
          accept=".svg,image/svg+xml"
          aria-label="Choose an SVG file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            setReport(importSvg(await file.text(), file.name.replace(/\.svg$/i, "")));
          }}
        />
      </Field>
      {report && (
        <>
          <Notice tone={report.count > 0 ? "success" : "warning"} title={`${report.count} shape${report.count === 1 ? "" : "s"} can be imported`}>
            {report.count > 0 ? "Each one becomes an editable layer." : "Nothing in this file maps to an editable layer."}
          </Notice>
          {report.unsupported.length > 0 && (
            <Notice tone="warning" title={`${report.unsupported.length} feature${report.unsupported.length === 1 ? "" : "s"} will not come across`}>
              <ul>{report.unsupported.map((item) => <li key={item}>{item}</li>)}</ul>
            </Notice>
          )}
          {report.fontsMissing.length > 0 && (
            <Notice tone="warning" title="Fonts not available in this browser">
              {report.fontsMissing.join(", ")} are referenced by the file and are not loaded. Text will render in a substitute and the file records the substitution.
            </Notice>
          )}
          <Row gap={2}>
            <Button
              variant="primary"
              onClick={async () => {
                const target = record;
                if (target) {
                  const doc = parseDesign(target.body);
                  const next: DesignDoc = {
                    ...doc,
                    pages: [...doc.pages, report.page],
                    activePageId: report.page.id,
                    unsupported: [...new Set([...doc.unsupported, ...report.unsupported, ...report.fontsMissing.map((font) => `substituted font: ${font}`)])],
                  };
                  await context.mutate.patch(target.id, { body: next }, { event: `Imported ${fileName}` });
                  context.toast("Imported", `${report.count} layers added to ${target.title} as a new page.`);
                } else {
                  const doc = starterDoc(fileName || "Imported SVG");
                  const next: DesignDoc = {
                    ...doc, pages: [report.page], activePageId: report.page.id,
                    unsupported: [...report.unsupported, ...report.fontsMissing.map((font) => `substituted font: ${font}`)],
                  };
                  const made = await context.mutate.create({
                    collection: "designs", title: fileName || "Imported SVG", status: "draft",
                    summary: `Imported from ${fileName}.`, body: next, fields: { kind: "file", format: "Imported" },
                  }, `Imported ${fileName}`);
                  context.navigate(context.path("/o/:org/design/files/:id", made.id));
                }
                close();
              }}
            >
              Import {report.count} layers
            </Button>
            <Button variant="ghost" onClick={close}>Cancel</Button>
          </Row>
        </>
      )}
    </Stack>
  );
}

/* ---------------------------- DESIGN-002 ---------------------------- */

const TOOLS: { tool: DesignTool; label: string; icon: React.ReactNode; key: string }[] = [
  { tool: "select", label: "Select", icon: <MousePointer2 size={15} />, key: "V" },
  { tool: "frame", label: "Frame", icon: <FrameIcon size={15} />, key: "F" },
  { tool: "rect", label: "Rectangle", icon: <Square size={15} />, key: "R" },
  { tool: "ellipse", label: "Ellipse", icon: <Circle size={15} />, key: "O" },
  { tool: "line", label: "Line", icon: <Minus size={15} />, key: "L" },
  { tool: "polygon", label: "Polygon", icon: <Hexagon size={15} />, key: "Y" },
  { tool: "pen", label: "Pen", icon: <PenTool size={15} />, key: "P" },
  { tool: "text", label: "Text", icon: <TypeIcon size={15} />, key: "T" },
  { tool: "hand", label: "Hand", icon: <Hand size={15} />, key: "H" },
];

function CanvasScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  const mode = context.tab === "Prototype" ? "prototype" : context.tab === "Comments" ? "comments" : context.tab === "Inspect" ? "inspect" : "design";
  if (!record) return <div className="pg-body"><MissingFile context={context} /></div>;
  const doc = handle.doc;
  const page = doc ? activePage(doc) : null;

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Design" }, { id: "Prototype" }, { id: "Inspect" }, { id: "Comments" }]}
      title={record.title}
      subtitle={<Row gap={2} wrap><SaveState handle={handle} /><span>{page ? `${page.name} · ${Object.keys(page.nodes).length} layers` : ""}</span></Row>}
      backTo={{ label: "Design", to: `/o/${context.org.slug}/design/files` }}
      tools={
        <>
          <Toolbar label="Drawing tools">
            {TOOLS.map((item) => (
              <Tool key={item.tool} label={`${item.label} (${item.key})`} icon={item.icon} active={ui.tool === item.tool} onClick={() => setTool(item.tool)} />
            ))}
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="Canvas options">
            <Tool label="Snap to peers and grid" icon={<Magnet size={15} />} active={ui.snap} onClick={() => designUi.set((c) => ({ ...c, snap: !c.snap }))} />
            <Tool label="Show grid" icon={<Grid3x3 size={15} />} active={ui.gridVisible} onClick={() => designUi.set((c) => ({ ...c, gridVisible: !c.gridVisible }))} />
            <Tool label="Prototype links" icon={<Link2 size={15} />} active={ui.tool === "link"} onClick={() => setTool(ui.tool === "link" ? "select" : "link")} />
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="History">
            <Button size="sm" variant="ghost" disabled={!handle.canUndo} onClick={handle.undo}>Undo</Button>
            <Button size="sm" variant="ghost" disabled={!handle.canRedo} onClick={handle.redo}>Redo</Button>
            <Button size="sm" variant="ghost" onClick={requestFit}>Fit</Button>
          </Toolbar>
        </>
      }
      left={
        <Stack gap={3}>
          <RecoveryNotice handle={handle as DocHandle<unknown>} />
          <PagesPanel handle={handle} />
          <PanelGroup title="Layers"><LayersPanel handle={handle} context={context} /></PanelGroup>
        </Stack>
      }
      leftLabel="Pages and layers"
      right={
        mode === "inspect" ? <InspectPanel handle={handle} />
          : mode === "comments" ? <CommentsPanel handle={handle} context={context} />
            : mode === "prototype" ? <PrototypePanel handle={handle} context={context} />
              : <GeometryInspector handle={handle} context={context} />
      }
      rightLabel={mode === "inspect" ? "Code" : mode === "comments" ? "Comments" : mode === "prototype" ? "Interaction" : "Properties"}
      status={
        <>
          <span>{ui.selected.length} selected</span>
          <span>Tool: {ui.tool}</span>
          <span>Zoom {Math.round(ui.view.zoom * 100)}%</span>
          <span className="ds-grow" />
          <span>{handle.canUndo ? `Undo: ${handle.lastLabel}` : "No history yet"}</span>
          <span title="⌘A select all · ⌘C / ⌘X / ⌘V copy, cut, paste · ⌘D duplicate · ⇧⌘G ungroup · ⇧⌘H hide · ⇧⌘L lock · ⇧⌘[ / ⇧⌘] send to back or front">Arrow keys nudge · Alt+arrows resize · ⌘[ / ⌘] reorder · ⌘G / ⇧⌘G group · ⌘C ⌘V copy</span>
        </>
      }
    >
      <DesignCanvas
        handle={handle}
        context={context}
        mode={mode}
        onPlaceComment={(point) => {
          handle.edit((current) => ({
            ...current,
            comments: [...current.comments, {
              id: `c-${wallMs().toString(36)}`, pageId: current.activePageId,
              x: point.x, y: point.y, author: context.actor, at: clockIso(),
              text: "", resolved: false,
            }],
          }), "Add comment pin");
          context.openOverlay("Comment editor");
        }}
        onLinkNodes={(fromId, toId) => {
          handle.edit((current) => updatePage(current, (p) => patchNode(p, fromId, { link: { to: toId, trigger: "click", transition: "dissolve", duration: 300 } })), "Link screens");
          context.toast("Linked", "A click on the first layer now moves to the second. Set the trigger in the interaction panel.");
        }}
      />
    </EditorFrame>
  );
}

function InspectPanel({ handle }: { handle: DocHandle<DesignDoc> }) {
  const ui = useStore(designUi);
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const node = ui.selected.length === 1 ? page.nodes[ui.selected[0]] : undefined;
  if (!node) return <Notice tone="info" title="Select one layer">The inspect tab shows the CSS and the measurements for a single layer.</Notice>;
  const rect = absoluteRect(page, node);
  const css = [
    `width: ${Math.round(node.w)}px;`,
    `height: ${Math.round(node.h)}px;`,
    node.radius ? `border-radius: ${node.radius}px;` : "",
    node.fill?.type === "solid" ? `background: ${node.fill.color};` : node.fill?.type === "linear" ? `background: linear-gradient(${node.fill.angle ?? 90}deg, ${node.fill.color}, ${node.fill.to});` : "",
    node.stroke ? `border: ${node.stroke.width}px solid ${node.stroke.color};` : "",
    node.shadow ? `box-shadow: ${node.shadow.x}px ${node.shadow.y}px ${node.shadow.blur}px ${node.shadow.color};` : "",
    node.opacity < 1 ? `opacity: ${node.opacity};` : "",
    node.rotation ? `transform: rotate(${node.rotation}deg);` : "",
    node.textStyle ? `font: ${node.textStyle.weight} ${node.textStyle.size}px/${node.textStyle.lineHeight} "${node.textStyle.family}";` : "",
    node.textStyle ? `color: ${node.textStyle.color};` : "",
  ].filter(Boolean).join("\n");
  return (
    <Stack gap={3}>
      <PanelGroup title="Measurements">
        <Properties rows={[
          { label: "Page position", value: `${Math.round(rect.x)}, ${Math.round(rect.y)}` },
          { label: "Size", value: `${Math.round(node.w)} × ${Math.round(node.h)}` },
          { label: "Parent", value: parentOf(page, node.id) === page.id ? "page root" : page.nodes[parentOf(page, node.id) ?? ""]?.name ?? "—" },
        ]} />
      </PanelGroup>
      <PanelGroup title="CSS">
        <pre style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", whiteSpace: "pre-wrap", background: "var(--bg-inset)", padding: 8, borderRadius: 6, margin: 0 }}>{css}</pre>
        <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(css); }}>Copy CSS</Button>
      </PanelGroup>
    </Stack>
  );
}

function CommentsPanel({ handle, context }: { handle: DocHandle<DesignDoc>; context: ScreenContext }) {
  const doc = handle.doc;
  if (!doc) return null;
  const comments = doc.comments.filter((comment) => comment.pageId === doc.activePageId);
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Click the canvas to pin a comment">Pins are stored on the page with their position, so they stay where the work is.</Notice>
      {comments.length === 0 ? <Empty title="No comments on this page" /> : comments.map((comment, index) => (
        <div key={comment.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}>
            <Pill tone={comment.resolved ? "success" : "accent"}>{index + 1}</Pill>
            <strong className="ds-grow">{comment.author}</strong>
            <span className="vx-mini">{context.relative(comment.at)}</span>
          </Row>
          <TextArea
            rows={2}
            aria-label={`Comment ${index + 1}`}
            value={comment.text}
            onChange={(event) => handle.live((current) => ({ ...current, comments: current.comments.map((item) => (item.id === comment.id ? { ...item, text: event.target.value } : item)) }))}
            onBlur={handle.beginGesture}
          />
          <Row gap={1}>
            <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, comments: current.comments.map((item) => (item.id === comment.id ? { ...item, resolved: !item.resolved } : item)) }), "Resolve comment")}>
              {comment.resolved ? "Reopen" : "Resolve"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, comments: current.comments.filter((item) => item.id !== comment.id) }), "Delete comment")}>Delete</Button>
          </Row>
        </div>
      ))}
    </Stack>
  );
}

function PrototypePanel({ handle, context }: { handle: DocHandle<DesignDoc>; context: ScreenContext }) {
  const ui = useStore(designUi);
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const node = ui.selected.length === 1 ? page.nodes[ui.selected[0]] : undefined;
  const frames = childrenOf(page, page.id).filter((item) => item.kind === "frame");
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Linking">Pick the prototype tool, click a layer, then click the destination frame. Or set the destination below with the keyboard.</Notice>
      {!node ? <Empty title="Select a layer to give it an interaction" /> : (
        <PanelGroup title={node.name}>
          <Field label="Destination">
            <Select
              value={node.link?.to ?? ""}
              onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, event.target.value ? { link: { to: event.target.value, trigger: node.link?.trigger ?? "click", transition: node.link?.transition ?? "dissolve", duration: node.link?.duration ?? 300 } } : { link: undefined })), "Set destination")}
            >
              <option value="">No interaction</option>
              {frames.filter((frame) => frame.id !== node.id).map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}
            </Select>
          </Field>
          {node.link && (
            <>
              <Field label="Trigger">
                <Select value={node.link.trigger} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { link: { ...node.link!, trigger: event.target.value as "click" } })), "Set trigger")}>
                  {["click", "hover", "drag", "key"].map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </Field>
              <Field label="Transition">
                <Select value={node.link.transition} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { link: { ...node.link!, transition: event.target.value as "dissolve" } })), "Set transition")}>
                  {["instant", "dissolve", "slide-left", "slide-up", "smart"].map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </Field>
              {node.link.trigger === "hover" && <Notice tone="warning" title="Hover has no touch equivalent">A hover trigger needs a keyboard and touch alternative before this prototype is shared. Add a click trigger as well.</Notice>}
            </>
          )}
        </PanelGroup>
      )}
      <Button size="sm" variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id/prototype", context.params.id))}>Open the flow screen</Button>
    </Stack>
  );
}

/* ---------------------------- DESIGN-003 ---------------------------- */

function LayersScreen({ context, lens }: { context: ScreenContext; lens: "Pages" | "Layers" | "Assets" | "Components" }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);

  if (lens === "Pages") {
    return (
      <Grid>
        {doc.pages.map((item) => (
          <Card
            key={item.id}
            span={4}
            title={item.name}
            subtitle={`${Object.keys(item.nodes).length} layers`}
            actions={
              <Row gap={1}>
                <Button size="sm" variant={item.id === doc.activePageId ? "primary" : "secondary"} onClick={() => handle.edit((current) => ({ ...current, activePageId: item.id }), "Switch page")}>
                  {item.id === doc.activePageId ? "Current" : "Open"}
                </Button>
              </Row>
            }
          >
            <Stack gap={2}>
              <DesignThumb doc={doc} pageId={item.id} height={120} />
              <Field label="Name"><TextInput value={item.name} onChange={(event) => handle.live((current) => ({ ...current, pages: current.pages.map((p) => (p.id === item.id ? { ...p, name: event.target.value } : p)) }))} onBlur={handle.beginGesture} /></Field>
              <Row gap={1} wrap>
                <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, pages: current.pages.map((p) => (p.id === item.id ? { ...p, grid: { ...p.grid, visible: !p.grid.visible } } : p)) }), "Toggle grid")}>
                  {item.grid.visible ? "Hide grid" : "Show grid"}
                </Button>
                <Button size="sm" variant="ghost" disabled={doc.pages.length < 2} onClick={() => handle.edit((current) => ({ ...current, pages: current.pages.filter((p) => p.id !== item.id), activePageId: current.pages.find((p) => p.id !== item.id)?.id ?? current.activePageId }), "Delete page")}>Delete</Button>
              </Row>
            </Stack>
          </Card>
        ))}
        <Card span={4} title="New page">
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => handle.edit((current) => {
              const id = `page-${wallMs().toString(36)}`;
              return { ...current, pages: [...current.pages, { id, name: `Page ${current.pages.length + 1}`, background: "#F2F4F8", grid: { kind: "square" as const, size: 8, count: 12, gutter: 24, visible: true }, children: { [id]: [] }, nodes: {} }], activePageId: id };
            }, "Add page")}
          >
            Add a page
          </Button>
        </Card>
      </Grid>
    );
  }

  if (lens === "Assets") {
    return (
      <Card title="Assets in this file" subtitle={`${doc.assets.length} records`}>
        {doc.assets.length === 0 ? (
          <Empty title="No assets linked" action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id/assets", context.params.id))}>Open assets and export</Button>}>
            Link an image or icon from the asset screen; rights and credit travel with it.
          </Empty>
        ) : (
          <DataGrid
            rows={doc.assets}
            rowId={(row) => row.id}
            label="Assets"
            columns={[
              { key: "name", header: "Asset", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
              { key: "kind", header: "Kind", cell: (row) => row.kind },
              { key: "size", header: "Pixels", align: "end", cell: (row) => `${row.width} × ${row.height}` },
              { key: "license", header: "Licence", cell: (row) => row.license },
              { key: "credit", header: "Credit", cell: (row) => row.credit },
            ]}
          />
        )}
      </Card>
    );
  }

  if (lens === "Components") {
    return (
      <Card title="Components in this file" subtitle={`${doc.components.length} definitions`}>
        {doc.components.length === 0 ? (
          <Empty title="No components yet" action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id/components", context.params.id))}>Open components</Button>}>
            Select a frame on the canvas and create a component from it.
          </Empty>
        ) : (
          <Stack gap={2}>
            {doc.components.map((component) => (
              <Row key={component.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <strong className="ds-grow">{component.name}</strong>
                <Pill tone={component.published ? "success" : "warning"}>{component.published ? `published v${component.version}` : "local"}</Pill>
                <Pill>{instancesOf(doc, component.id).length} instances</Pill>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("component detach")}>Detach an instance</Button>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    );
  }

  const rows = flatten(page);
  return (
    <Grid>
      <Card span={5} title="Layer tree" subtitle={`${rows.length} layers on ${page.name}`}>
        <LayersPanel handle={handle} context={context} />
      </Card>
      <Card span={7} title="Layer table" subtitle="Sortable, filterable, and keyboard reorderable">
        <DataGrid
          rows={rows}
          rowId={(row) => row.node.id}
          label="Layers"
          selectedId={ui.selected[0]}
          onSelect={(id) => setSelection([id])}
          columns={[
            { key: "name", header: "Layer", primary: true, cell: (row) => <span style={{ paddingInlineStart: row.depth * 12 }}>{row.node.name}</span>, sortValue: (row) => row.node.name, filterValue: (row) => row.node.name },
            { key: "kind", header: "Kind", cell: (row) => row.node.kind, sortValue: (row) => row.node.kind },
            { key: "size", header: "Size", align: "end", cell: (row) => `${Math.round(row.node.w)} × ${Math.round(row.node.h)}` },
            { key: "state", header: "State", cell: (row) => <Row gap={1}>{!row.node.visible && <Pill tone="warning">hidden</Pill>}{row.node.locked && <Pill tone="warning">locked</Pill>}</Row> },
            {
              key: "z", header: "Order", align: "end", cell: (row) => (
                <Row gap={1}>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${row.node.name} forwards`} onClick={() => handle.edit((current) => updatePage(current, (p) => reorder(p, row.node.id, 1)), "Move forwards")}>↑</Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${row.node.name} backwards`} onClick={() => handle.edit((current) => updatePage(current, (p) => reorder(p, row.node.id, -1)), "Move backwards")}>↓</Button>
                </Row>
              ),
            },
          ]}
          bulkActions={[
            { label: "Lock", onRun: (selected) => handle.edit((current) => updatePage(current, (p) => patchNodes(p, selected.map((row) => row.node.id), () => ({ locked: true }))), "Lock layers") },
            { label: "Unlock", onRun: (selected) => handle.edit((current) => updatePage(current, (p) => patchNodes(p, selected.map((row) => row.node.id), () => ({ locked: false }))), "Unlock layers") },
            { label: "Hide", onRun: (selected) => handle.edit((current) => updatePage(current, (p) => patchNodes(p, selected.map((row) => row.node.id), () => ({ visible: false }))), "Hide layers") },
            { label: "Group", onRun: (selected) => { setSelection(selected.map((row) => row.node.id)); context.openOverlay("Layer context"); } },
          ]}
          onOpen={(id) => { setSelection([id]); context.openOverlay("Layer context", { id }); }}
        />
      </Card>
      {ui.isolate && (
        <Card span={12} title="Isolation mode" subtitle={`Only ${page.nodes[ui.isolate]?.name ?? "one layer"} and its children are editable`}>
          <Button variant="secondary" onClick={() => designUi.set((current) => ({ ...current, isolate: undefined }))}>Leave isolation</Button>
        </Card>
      )}
    </Grid>
  );
}

/* ---------------------------- DESIGN-004 ---------------------------- */

function PathScreen({ context, actions }: { context: ScreenContext; actions: ActionDef[] }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record) return <div className="pg-body"><MissingFile context={context} /></div>;
  const doc = handle.doc;
  const page = doc ? activePage(doc) : null;
  const paths = page ? Object.values(page.nodes).filter((node) => node.kind === "path") : [];
  const convertible = page ? Object.values(page.nodes).filter((node) => ["rect", "ellipse", "polygon"].includes(node.kind)) : [];
  const active = page && ui.pathNodeId ? page.nodes[ui.pathNodeId] : paths[0];
  const anchorId = ui.selectedAnchors[0];
  const anchor = active?.path?.anchors.find((item) => item.id === anchorId);

  const convert = (node: SceneNode) => {
    const ids = Array.from({ length: 8 }, (_, index) => `a-${wallMs().toString(36)}-${index}`);
    const path = node.kind === "ellipse" ? ellipseToPath(node.w, node.h, ids)
      : node.kind === "polygon" ? polygonToPath(node.w, node.h, node.sides ?? 6, ids)
        : rectToPath(node.w, node.h, node.radius ?? 0, ids);
    handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { kind: "path", path, name: `${node.name} (path)` })), "Convert to path");
    designUi.set((current) => ({ ...current, pathNodeId: node.id, selected: [node.id] }));
  };

  return (
    <EditorFrame
      context={context}
      actions={actions}
      tabs={[{ id: "Pen" }, { id: "Curves" }, { id: "Boolean" }, { id: "Offset" }]}
      title={`${record.title} — paths`}
      subtitle={<Row gap={2}><SaveState handle={handle} /><span>{paths.length} path layer{paths.length === 1 ? "" : "s"}</span></Row>}
      backTo={{ label: record.title, to: context.path("/o/:org/design/files/:id", context.params.id) }}
      tools={
        <>
          <Toolbar label="Path tools">
            <Tool label="Select points" icon={<MousePointer2 size={15} />} active={ui.tool === "select"} onClick={() => setTool("select")} />
            <Tool label="Pen — click to add a point" icon={<PenTool size={15} />} active={ui.tool === "pen"} onClick={() => setTool("pen")} />
          </Toolbar>
          <ToolbarSeparator />
          <Toolbar label="History">
            <Button size="sm" variant="ghost" disabled={!handle.canUndo} onClick={handle.undo}>Undo</Button>
            <Button size="sm" variant="ghost" disabled={!handle.canRedo} onClick={handle.redo}>Redo</Button>
          </Toolbar>
        </>
      }
      left={
        <Stack gap={3}>
          <PanelGroup title="Path layers">
            {paths.length === 0 ? <p className="vx-mini">No path layers yet. Convert a shape below or draw with the pen.</p> : (
              <div className="vx-tree">
                {paths.map((node) => (
                  <button key={node.id} type="button" className="vx-node" data-selected={node.id === active?.id} onClick={() => designUi.set((current) => ({ ...current, pathNodeId: node.id, selected: [node.id], selectedAnchors: [] }))}>
                    <span className="vx-node-label">{node.name}</span>
                    <Pill>{node.path?.anchors.length ?? 0}</Pill>
                  </button>
                ))}
              </div>
            )}
          </PanelGroup>
          <PanelGroup title="Convert a shape">
            {convertible.length === 0 ? <p className="vx-mini">Draw a rectangle, ellipse or polygon on the canvas first.</p> : (
              <Stack gap={1}>
                {convertible.map((node) => (
                  <Button key={node.id} size="sm" variant="ghost" onClick={() => convert(node)}>{node.name} → path</Button>
                ))}
              </Stack>
            )}
          </PanelGroup>
        </Stack>
      }
      leftLabel="Paths"
      right={<PathInspector handle={handle} context={context} tab={context.tab} />}
      rightLabel={context.tab === "Boolean" ? "Combine" : context.tab === "Offset" ? "Offset" : "Point"}
      status={
        <>
          <span>{active ? `${active.name}: ${active.path?.anchors.length ?? 0} anchors, ${subpathCount(active.path!)} contour${subpathCount(active.path!) === 1 ? "" : "s"}, ${pathLength(active.path!)}px` : "No path selected"}</span>
          <span className="ds-grow" />
          <span>{anchor ? `Point ${anchor.id}: ${Math.round(anchor.x)}, ${Math.round(anchor.y)} (${anchor.type})` : "Tab cycles points · arrows move the selected point"}</span>
        </>
      }
    >
      <PathCanvas handle={handle} nodeId={active?.id} onConvert={convert} />
    </EditorFrame>
  );
}

function PathInspector({ handle, context, tab }: { handle: DocHandle<DesignDoc>; context: ScreenContext; tab: string }) {
  const ui = useStore(designUi);
  const [offsetAmount, setOffsetAmount] = useState(6);
  const [mode, setMode] = useState<"unite" | "subtract">("subtract");
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const node = ui.pathNodeId ? page.nodes[ui.pathNodeId] : Object.values(page.nodes).find((item) => item.kind === "path");
  if (!node?.path) return <Notice tone="info" title="No path selected">Pick a path layer on the left.</Notice>;
  const path = node.path;
  const anchorId = ui.selectedAnchors[0];
  const anchor = path.anchors.find((item) => item.id === anchorId);
  const others = Object.values(page.nodes).filter((item) => item.kind === "path" && item.id !== node.id);

  if (tab === "Boolean") {
    return (
      <Stack gap={3}>
        <Notice tone="warning" title="Fill-rule combination, not boolean geometry">
          Combining adds the second path as another contour of this one and sets the fill rule. No intersection points are computed, so an overlapping subtract shows the even-odd result rather than a new outline. The screen does not claim otherwise.
        </Notice>
        <Field label="Operation">
          <Select value={mode} onChange={(event) => setMode(event.target.value as "unite")}>
            <option value="unite">Unite (non-zero fill)</option>
            <option value="subtract">Subtract (even-odd fill)</option>
          </Select>
        </Field>
        {others.length === 0 ? <p className="vx-mini">Convert a second shape to a path to combine.</p> : (
          <Stack gap={1}>
            {others.map((other) => (
              <Button
                key={other.id}
                size="sm"
                variant="secondary"
                onClick={() => {
                  handle.edit((current) => updatePage(current, (p) => {
                    const offset = { x: other.x - node.x, y: other.y - node.y };
                    const combined = combinePaths(path, other.path!, offset, mode);
                    return removeNodes(patchNode(p, node.id, { path: combined }), [other.id]);
                  }), `${mode} paths`);
                  context.toast("Combined", `${other.name} is now a contour of ${node.name} with the ${mode === "subtract" ? "even-odd" : "non-zero"} fill rule.`);
                }}
              >
                {mode === "unite" ? "Unite with" : "Subtract"} {other.name}
              </Button>
            ))}
          </Stack>
        )}
        <Properties rows={[{ label: "Contours", value: subpathCount(path) }, { label: "Fill rule", value: path.fillRule }]} />
      </Stack>
    );
  }

  if (tab === "Offset") {
    return (
      <Stack gap={3}>
        <PanelGroup title="Offset the contour">
          <Field label="Distance (px)"><TextInput type="number" value={offsetAmount} onChange={(event) => setOffsetAmount(Number(event.target.value))} /></Field>
          <Button size="sm" variant="primary" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: offsetPath(path, offsetAmount) })), "Offset path")}>Offset by {offsetAmount}px</Button>
          <p className="vx-mini">Each anchor moves along the local normal. Undo returns the previous geometry exactly.</p>
        </PanelGroup>
        <PanelGroup title="Simplify">
          <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: simplifyPath(path, 4) })), "Simplify path")}>
            Simplify (tolerance 4px)
          </Button>
          <p className="vx-mini">Ramer–Douglas–Peucker on the anchor polyline, then smooth tangents refitted. {path.anchors.length} anchors now.</p>
        </PanelGroup>
        <PanelGroup title="Stroke">
          <Field label="Stroke width">
            <TextInput
              type="number"
              value={node.stroke?.width ?? 0}
              onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { stroke: { color: node.stroke?.color ?? "#17223A", width: Number(event.target.value), align: node.stroke?.align ?? "center" } })), "Stroke width")}
            />
          </Field>
        </PanelGroup>
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <PanelGroup title={`${path.anchors.length} anchors`}>
        <Row gap={1} wrap>
          <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: joinEnds(path) })), "Join path")}>
            {path.closed ? "Already closed" : "Join ends"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!anchorId}
            onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: splitSegment(path, anchorId, `a-${wallMs().toString(36)}`) })), "Split segment")}
          >
            Insert a point after the selected one
          </Button>
        </Row>
        <Field label="Fill rule">
          <Select value={path.fillRule} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: { ...path, fillRule: event.target.value as "nonzero" } })), "Fill rule")}>
            <option value="nonzero">non-zero</option>
            <option value="evenodd">even-odd</option>
          </Select>
        </Field>
      </PanelGroup>
      {anchor ? (
        <PanelGroup title="Selected point">
          <Properties rows={[
            { label: "Position", value: `${Math.round(anchor.x)}, ${Math.round(anchor.y)}` },
            { label: "In handle", value: `${Math.round(anchor.in.x)}, ${Math.round(anchor.in.y)}` },
            { label: "Out handle", value: `${Math.round(anchor.out.x)}, ${Math.round(anchor.out.y)}` },
          ]} />
          <div className="vx-fieldrow">
            {(["in", "out"] as const).flatMap((which) => (["x", "y"] as const).map((axis) => (
              <div key={`${which}${axis}`}>
                <label className="vx-label" htmlFor={`handle-${which}-${axis}`}>{which === "in" ? "In" : "Out"} handle {axis}</label>
                <input
                  id={`handle-${which}-${axis}`}
                  className="vx-num"
                  type="number"
                  value={Math.round(anchor[which][axis])}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: moveHandle(path, anchor.id, which, { x: axis === "x" ? value : anchor[which].x, y: axis === "y" ? value : anchor[which].y }) })), "Adjust a handle");
                  }}
                />
              </div>
            )))}
          </div>
          <Field label="Point type">
            <Select value={anchor.type} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: setAnchorType(path, anchor.id, event.target.value as "smooth") })), "Point type")}>
              <option value="corner">Corner — handles move freely</option>
              <option value="smooth">Smooth — handles stay in line</option>
              <option value="symmetric">Symmetric — handles mirror</option>
            </Select>
          </Field>
          <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { path: { ...path, anchors: path.anchors.filter((item) => item.id !== anchor.id) } })), "Delete point")}>Delete this point</Button>
        </PanelGroup>
      ) : <p className="vx-mini">Click an anchor on the canvas, or press Tab to walk the points.</p>}
    </Stack>
  );
}

/* ---------------------------- DESIGN-005 ---------------------------- */

function LayoutScreen({ context, lens }: { context: ScreenContext; lens: "Layout" | "Constraints" | "Responsive" | "Grid" }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);
  const frames = Object.values(page.nodes).filter((node) => node.kind === "frame");
  const frame = (ui.selected.map((id) => page.nodes[id]).find((node) => node?.kind === "frame")) ?? frames[0];
  const conflicts = frame ? layoutConflicts(page, frame.id) : [];

  if (!frame) {
    return <Empty title="No frames on this page" action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id", context.params.id))}>Draw a frame on the canvas</Button>}>Auto layout applies to a frame and its children.</Empty>;
  }

  const setLayout = (patch: Partial<NonNullable<SceneNode["layout"]>>, label: string) => {
    handle.edit((current) => updatePage(current, (p) => {
      const existing = p.nodes[frame.id].layout ?? { direction: "vertical" as const, gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 }, align: "start" as const, wrap: false, widthMode: "fixed" as const, heightMode: "hug" as const };
      return applyAutoLayout(patchNode(p, frame.id, { layout: { ...existing, ...patch } }), frame.id);
    }), label);
  };

  const preview = (
    <Card title="Live preview" subtitle={`${frame.name} at ${Math.round(frame.w)} × ${Math.round(frame.h)}`}>
      <div style={{ overflow: "auto", background: "var(--bg-sunken)", padding: 16, borderRadius: 8 }}>
        <svg width={Math.min(frame.w, 980)} height={Math.min(frame.h, 520)} viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} role="img" aria-label={`${frame.name} preview`} style={{ background: page.background, display: "block" }}>
          <DesignThumbInner page={page} doc={doc} frameId={frame.id} />
        </svg>
      </div>
    </Card>
  );

  if (lens === "Constraints") {
    const kids = childrenOf(page, frame.id);
    return (
      <Grid>
        <Card span={7} title="Child constraints" subtitle="How each child answers when the frame resizes">
          {kids.length === 0 ? <Empty title="This frame has no children" /> : (
            <DataGrid
              rows={kids}
              rowId={(row) => row.id}
              label="Constraints"
              columns={[
                { key: "name", header: "Child", primary: true, cell: (row) => row.name, sortValue: (row) => row.name },
                {
                  key: "h", header: "Horizontal", cell: (row) => (
                    <Select
                      aria-label={`${row.name} horizontal constraint`}
                      value={row.constraints?.h ?? "min"}
                      onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, row.id, { constraints: { h: event.target.value as "min", v: row.constraints?.v ?? "min" } })), "Set constraint")}
                    >
                      {["min", "max", "center", "stretch", "scale"].map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  ),
                },
                {
                  key: "v", header: "Vertical", cell: (row) => (
                    <Select
                      aria-label={`${row.name} vertical constraint`}
                      value={row.constraints?.v ?? "min"}
                      onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, row.id, { constraints: { h: row.constraints?.h ?? "min", v: event.target.value as "min" } })), "Set constraint")}
                    >
                      {["min", "max", "center", "stretch", "scale"].map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  ),
                },
                { key: "box", header: "Box", align: "end", cell: (row) => `${Math.round(row.x)},${Math.round(row.y)} ${Math.round(row.w)}×${Math.round(row.h)}` },
              ]}
            />
          )}
          {conflicts.length > 0 && (
            <Notice tone="danger" title={`${conflicts.length} constraint conflict${conflicts.length === 1 ? "" : "s"}`} actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("constraint conflict")}>Review</Button>}>
              <ul>{conflicts.map((item) => <li key={item}>{item}</li>)}</ul>
            </Notice>
          )}
        </Card>
        <Card span={5} title="Resize the frame to test" subtitle="Each child follows its constraint">
          <Stack gap={3}>
            <Field label={`Width ${Math.round(frame.w)}px`}>
              <input className="vx-range" type="range" min={240} max={1600} value={frame.w} aria-label="Frame width" onChange={(event) => handle.live((current) => updatePage(current, (p) => resizeFrame(p, frame.id, Number(event.target.value), frame.h)))} onPointerUp={handle.beginGesture} />
            </Field>
            <Field label={`Height ${Math.round(frame.h)}px`}>
              <input className="vx-range" type="range" min={160} max={1400} value={frame.h} aria-label="Frame height" onChange={(event) => handle.live((current) => updatePage(current, (p) => resizeFrame(p, frame.id, frame.w, Number(event.target.value))))} onPointerUp={handle.beginGesture} />
            </Field>
            {preview}
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Responsive") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="The same frame at each breakpoint">
          Changing a breakpoint resizes the frame and runs the constraints, so what you see is the real result rather than a mock-up.
        </Notice>
        <Row gap={2} wrap>
          {doc.breakpoints.map((breakpoint) => (
            <Button
              key={breakpoint.id}
              size="sm"
              variant={ui.breakpoint === breakpoint.width ? "primary" : "secondary"}
              onClick={() => {
                designUi.set((current) => ({ ...current, breakpoint: breakpoint.width }));
                handle.edit((current) => updatePage(current, (p) => resizeFrame(p, frame.id, breakpoint.width, frame.h)), `Preview ${breakpoint.name}`);
              }}
            >
              {breakpoint.name} · {breakpoint.width}px
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("breakpoint preview")}>Compare all</Button>
        </Row>
        {preview}
      </Stack>
    );
  }

  if (lens === "Grid") {
    return (
      <Grid>
        <Card span={5} title="Layout grid" subtitle="Drawn on the canvas over every frame">
          <Stack gap={3}>
            <Field label="Kind">
              <Select value={page.grid.kind} onChange={(event) => handle.edit((current) => updatePage(current, (p) => ({ ...p, grid: { ...p.grid, kind: event.target.value as "square" } })), "Grid kind")}>
                <option value="square">Square grid</option>
                <option value="columns">Columns</option>
              </Select>
            </Field>
            <Field label="Square size / column count">
              <TextInput type="number" value={page.grid.kind === "square" ? page.grid.size : page.grid.count} onChange={(event) => handle.edit((current) => updatePage(current, (p) => ({ ...p, grid: { ...p.grid, [p.grid.kind === "square" ? "size" : "count"]: Math.max(1, Number(event.target.value)) } })), "Grid size")} />
            </Field>
            <Field label="Gutter"><TextInput type="number" value={page.grid.gutter} onChange={(event) => handle.edit((current) => updatePage(current, (p) => ({ ...p, grid: { ...p.grid, gutter: Math.max(0, Number(event.target.value)) } })), "Grid gutter")} /></Field>
            <Checkbox label="Show the grid on the canvas" checked={page.grid.visible} onChange={(event) => handle.edit((current) => updatePage(current, (p) => ({ ...p, grid: { ...p.grid, visible: event.target.checked } })), "Grid visibility")} />
            <p className="vx-mini">Snapping uses the square size when the grid is visible. {page.grid.kind === "columns" ? `Column width at this frame: ${Math.round((frame.w - page.grid.gutter * (page.grid.count - 1)) / page.grid.count)}px.` : ""}</p>
          </Stack>
        </Card>
        <Card span={7} title="On the frame">{preview}</Card>
      </Grid>
    );
  }

  const layout = frame.layout;
  return (
    <Grid>
      <Card span={5} title={`Auto layout — ${frame.name}`} subtitle={layout ? "On" : "Off"}>
        <Stack gap={3}>
          <Checkbox
            label="Lay children out automatically"
            checked={Boolean(layout)}
            onChange={(event) => {
              if (event.target.checked) setLayout({}, "Enable auto layout");
              else handle.edit((current) => updatePage(current, (p) => patchNode(p, frame.id, { layout: undefined })), "Disable auto layout");
            }}
          />
          {layout && (
            <>
              <Field label="Direction">
                <Select value={layout.direction} onChange={(event) => setLayout({ direction: event.target.value as "horizontal" }, "Layout direction")}>
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                </Select>
              </Field>
              <Field label="Gap"><TextInput type="number" value={layout.gap} onChange={(event) => setLayout({ gap: Math.max(0, Number(event.target.value)) }, "Layout gap")} /></Field>
              <Row gap={2} wrap>
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <Field key={side} label={`Padding ${side}`}>
                    <TextInput type="number" value={layout.padding[side]} onChange={(event) => setLayout({ padding: { ...layout.padding, [side]: Math.max(0, Number(event.target.value)) } }, "Layout padding")} />
                  </Field>
                ))}
              </Row>
              <Field label="Cross-axis alignment">
                <Select value={layout.align} onChange={(event) => setLayout({ align: event.target.value as "start" }, "Layout alignment")}>
                  <option value="start">Start</option>
                  <option value="center">Centre</option>
                  <option value="end">End</option>
                </Select>
              </Field>
              <Checkbox label="Wrap when the children do not fit" checked={layout.wrap} onChange={(event) => setLayout({ wrap: event.target.checked }, "Layout wrap")} />
              <Row gap={2}>
                <Field label="Width">
                  <Select value={layout.widthMode} onChange={(event) => setLayout({ widthMode: event.target.value as "fixed" }, "Width mode")}>
                    {["fixed", "hug", "fill"].map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </Field>
                <Field label="Height">
                  <Select value={layout.heightMode} onChange={(event) => setLayout({ heightMode: event.target.value as "fixed" }, "Height mode")}>
                    {["fixed", "hug", "fill"].map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </Field>
              </Row>
            </>
          )}
          {conflicts.length > 0 && (
            <Notice tone="danger" title="This configuration cannot resolve">
              <ul>{conflicts.map((item) => <li key={item}>{item}</li>)}</ul>
            </Notice>
          )}
          <Row gap={2} wrap>
            {frames.map((item) => (
              <Button key={item.id} size="sm" variant={item.id === frame.id ? "primary" : "ghost"} onClick={() => setSelection([item.id])}>{item.name}</Button>
            ))}
          </Row>
        </Stack>
      </Card>
      <Card span={7} title="Children in order" subtitle="Reorder with the buttons or with Alt and the arrow keys">
        <Stack gap={2}>
          {childrenOf(page, frame.id).map((child, index) => (
            <Row key={child.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{index + 1}. {child.name}</span>
              <Pill>{Math.round(child.w)} × {Math.round(child.h)}</Pill>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${child.name} earlier`} disabled={index === 0} onClick={() => handle.edit((current) => updatePage(current, (p) => applyAutoLayout(reorder(p, child.id, -1), frame.id)), "Reorder child")}>↑</Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${child.name} later`} onClick={() => handle.edit((current) => updatePage(current, (p) => applyAutoLayout(reorder(p, child.id, 1), frame.id)), "Reorder child")}>↓</Button>
            </Row>
          ))}
        </Stack>
      </Card>
      <div className="ds-col-12">{preview}</div>
    </Grid>
  );
}

function DesignThumbInner({ page, doc, frameId }: { page: ScenePage; doc: DesignDoc; frameId: string }) {
  const frame = page.nodes[frameId];
  if (!frame) return null;
  return <NodeView page={page} node={frame} doc={doc} selected={[]} />;
}

/* ---------------------------- DESIGN-006 ---------------------------- */

function ComponentsScreen({ context, lens }: { context: ScreenContext; lens: "Library" | "Local" | "Variants" | "Usage" }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);

  if (lens === "Usage") {
    const rows = doc.components.flatMap((component) => instancesOf(doc, component.id).map((use) => ({ id: `${component.id}-${use.node.id}`, component, ...use })));
    return (
      <Card title="Where components are used" subtitle={`${rows.length} instances across ${doc.pages.length} pages`}>
        {rows.length === 0 ? <Empty title="No instances yet">Place a component from the library tab to create an instance.</Empty> : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Component usage"
            columns={[
              { key: "component", header: "Component", primary: true, cell: (row) => row.component.name, sortValue: (row) => row.component.name, filterValue: (row) => row.component.name },
              { key: "page", header: "Page", cell: (row) => row.pageName },
              { key: "layer", header: "Layer", cell: (row) => row.node.name },
              { key: "box", header: "Size", align: "end", cell: (row) => `${Math.round(row.node.w)} × ${Math.round(row.node.h)}` },
              { key: "overrides", header: "Overrides", cell: (row) => Object.keys(row.node.overrides ?? {}).length || "—" },
            ]}
            onOpen={(id) => {
              const found = rows.find((row) => row.id === id);
              if (found) {
                handle.edit((current) => ({ ...current, activePageId: found.pageId }), "Switch page");
                setSelection([found.node.id]);
                context.navigate(context.path("/o/:org/design/files/:id", context.params.id));
              }
            }}
          />
        )}
      </Card>
    );
  }

  if (lens === "Variants") {
    const component = doc.components.find((item) => item.id === ui.selected[0]) ?? doc.components[0];
    return (
      <Grid>
        <Card span={4} title="Components">
          {doc.components.length === 0 ? <Empty title="None yet" /> : (
            <div className="vx-tree">
              {doc.components.map((item) => (
                <button key={item.id} type="button" className="vx-node" data-selected={item.id === component?.id} onClick={() => setSelection([item.id])}>
                  <span className="vx-node-label">{item.name}</span>
                  <Pill>{item.properties.length}</Pill>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card span={8} title={component ? `${component.name} — properties` : "No component"} subtitle="A property with values becomes a variant set">
          {!component ? <Empty title="Create a component first" /> : (
            <Stack gap={3}>
              {component.properties.length === 0 ? <p className="ds-subtle">No properties. Add one, for example “state” with the values default, hover, disabled.</p> : component.properties.map((property, index) => (
                <Row key={property.name} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <strong>{property.name}</strong>
                  <span className="ds-grow">{property.values.join(" · ")}</span>
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, components: current.components.map((item) => (item.id === component.id ? { ...item, properties: item.properties.filter((_, i) => i !== index) } : item)) }), "Remove property")}>Remove</Button>
                </Row>
              ))}
              <Button variant="secondary" onClick={() => context.openOverlay("Variant editor", { componentId: component.id })}>Add a property</Button>
              <Notice tone="info" title={`${instancesOf(doc, component.id).length} instances would be offered this property`}>
                Variants are stored on the component and resolved per instance; nothing is duplicated into the page.
              </Notice>
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  const duplicates = findDuplicates(page);
  const candidates = Object.values(page.nodes).filter((node) => node.kind === "frame" || node.kind === "group");

  return (
    <Stack gap={4}>
      {lens === "Library" && duplicates.length > 0 && (
        <Notice tone="warning" title={`${duplicates.length} repeated shape${duplicates.length === 1 ? "" : "s"} on this page`}>
          Identical geometry and fill appear more than once: {duplicates.slice(0, 3).map((group) => `${group.ids.length}× ${group.signature.split(":")[0]}`).join(", ")}. Making one a component removes the duplication.
        </Notice>
      )}
      <Grid>
        {doc.components.filter((component) => (lens === "Library" ? component.published : !component.published)).map((component) => {
          const uses = instancesOf(doc, component.id);
          return (
            <Card
              key={component.id}
              span={4}
              title={component.name}
              subtitle={`${uses.length} instance${uses.length === 1 ? "" : "s"} · v${component.version}`}
              actions={<Pill tone={component.published ? "success" : "warning"}>{component.published ? "published" : "local"}</Pill>}
            >
              <Stack gap={2}>
                <p className="ds-subtle">{component.description}</p>
                <Row gap={1} wrap>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const centre = rectCenter(pageBounds(page));
                      handle.edit((current) => instantiate(current, component.id, { x: centre.x, y: centre.y }).doc, "Place instance");
                      context.toast("Instance placed", `${component.name} added to ${page.name}.`);
                    }}
                  >
                    Place
                  </Button>
                  {!component.published && (
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("library publish", { componentId: component.id })}>Publish</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("breaking-change diff", { componentId: component.id })}>Impact</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
        {lens === "Local" && (
          <Card span={4} title="Create a component" subtitle="From a frame or group on this page">
            {candidates.length === 0 ? <p className="ds-subtle">Draw a frame on the canvas first.</p> : (
              <Stack gap={1}>
                {candidates.map((node) => (
                  <Button
                    key={node.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      handle.edit((current) => createComponent(current, node.id, node.name).doc, "Create component");
                      context.toast("Component created", `${node.name} is now a component; the layer on the page became its first instance.`);
                    }}
                  >
                    {node.name} → component
                  </Button>
                ))}
              </Stack>
            )}
          </Card>
        )}
      </Grid>
      {doc.components.length === 0 && lens === "Library" && (
        <Empty title="No published components" icon={<Component size={20} />}>Create a component on the Local tab, then publish it to the library.</Empty>
      )}
    </Stack>
  );
}

/* ---------------------------- DESIGN-007 ---------------------------- */

function StylesScreen({ context, lens }: { context: ScreenContext; lens: "Text" | "Colour" | "Effects" | "Variables" }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);
  const selected = ui.selected.map((id) => page.nodes[id]).filter(Boolean);

  if (lens === "Text") {
    return (
      <Grid>
        <Card span={7} title="Text styles" subtitle={`${doc.textStyles.length} styles · applied to ${Object.values(page.nodes).filter((n) => n.textStyle?.styleId).length} layers`}>
          <Stack gap={3}>
            {doc.textStyles.map((style) => {
              const users = Object.values(page.nodes).filter((node) => node.textStyle?.styleId === style.id);
              const available = fontAvailable(style.family);
              return (
                <div key={style.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2} wrap>
                    <span className="ds-grow" style={{ fontFamily: style.family, fontSize: Math.min(style.size, 30), fontWeight: style.weight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing }}>
                      {style.name}
                    </span>
                    {!available && <Pill tone="warning">{style.family} substituted</Pill>}
                    <Pill>{style.size}px</Pill>
                  </Row>
                  <Row gap={2} wrap style={{ marginBlockStart: 8 }}>
                    <Field label="Size"><TextInput type="number" value={style.size} onChange={(event) => handle.edit((current) => ({ ...current, textStyles: current.textStyles.map((item) => (item.id === style.id ? { ...item, size: Math.max(1, Number(event.target.value)) } : item)) }), "Style size")} /></Field>
                    <Field label="Weight"><TextInput type="number" step={50} value={style.weight} onChange={(event) => handle.edit((current) => ({ ...current, textStyles: current.textStyles.map((item) => (item.id === style.id ? { ...item, weight: Number(event.target.value) } : item)) }), "Style weight")} /></Field>
                    <Field label="Family">
                      <Select value={style.family} onChange={(event) => handle.edit((current) => ({ ...current, textStyles: current.textStyles.map((item) => (item.id === style.id ? { ...item, family: event.target.value } : item)) }), "Style family")}>
                        {FONT_STACK.map((family) => <option key={family} value={family}>{family}{fontAvailable(family) ? "" : " (not loaded)"}</option>)}
                      </Select>
                    </Field>
                  </Row>
                  <Row gap={1} wrap style={{ marginBlockStart: 8 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={selected.filter((node) => node.kind === "text").length === 0}
                      onClick={() => {
                        const ids = selected.filter((node) => node.kind === "text").map((node) => node.id);
                        handle.edit((current) => updatePage(current, (p) => patchNodes(p, ids, (node) => ({
                          textStyle: { ...node.textStyle!, family: style.family, size: style.size, weight: style.weight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, styleId: style.id },
                        }))), "Apply text style");
                        context.toast("Applied", `${ids.length} text layer${ids.length === 1 ? "" : "s"} now use ${style.name}.`);
                      }}
                    >
                      Apply to selection
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("style impact", { styleId: style.id })}>{users.length} using it</Button>
                  </Row>
                </div>
              );
            })}
          </Stack>
        </Card>
        <Card span={5} title="Font availability" subtitle="Checked against this browser, not assumed">
          <Stack gap={2}>
            {FONT_STACK.map((family) => (
              <Row key={family} gap={2}>
                <span className="ds-grow" style={{ fontFamily: family }}>{family}</span>
                <Pill tone={fontAvailable(family) ? "success" : "warning"}>{fontAvailable(family) ? "available" : "would be substituted"}</Pill>
              </Row>
            ))}
            <Notice tone="warning" title="Substitution is disclosed, never silent">
              Where a style names a font this browser has not loaded, the layer renders in the fallback and the style carries the warning above. Exported SVG keeps the requested family name so a machine with the font renders it correctly.
            </Notice>
            <Button variant="secondary" onClick={() => context.openOverlay("Font browser")}>Open the font browser</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Colour") {
    return (
      <Grid>
        {doc.colors.map((token) => {
          const onWhite = contrastRatio(token.value, "#FFFFFF");
          const onInk = contrastRatio(token.value, "#17223A");
          return (
            <Card key={token.id} span={4} title={token.name} subtitle={token.group}>
              <Stack gap={2}>
                <div style={{ height: 64, borderRadius: 8, background: token.value, border: "1px solid var(--border-default)" }} />
                <Row gap={2}>
                  <input type="color" aria-label={`${token.name} value`} value={/^#[0-9a-f]{6}$/i.test(token.value) ? token.value : "#000000"} onChange={(event) => handle.edit((current) => ({ ...current, colors: current.colors.map((item) => (item.id === token.id ? { ...item, value: event.target.value } : item)) }), "Edit token")} style={{ width: 34, height: 28 }} />
                  <code className="ds-num ds-grow">{token.value}</code>
                </Row>
                <Properties rows={[
                  { label: "On white", value: `${onWhite}:1 (${wcagGrade(onWhite, false)})` },
                  { label: "On ink", value: `${onInk}:1 (${wcagGrade(onInk, false)})` },
                ]} />
                <Row gap={1} wrap>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={selected.length === 0}
                    onClick={() => {
                      handle.edit((current) => updatePage(current, (p) => patchNodes(p, ui.selected, (node) => (node.kind === "text"
                        ? { textStyle: { ...node.textStyle!, color: token.value } }
                        : { fill: { type: "solid", color: token.value } }))), "Apply colour token");
                      context.toast("Applied", `${ui.selected.length} layer${ui.selected.length === 1 ? "" : "s"} now use ${token.name}.`);
                    }}
                  >
                    Apply to selection
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("gradient editor", { from: token.value })}>Gradient</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
        <Card span={4} title="Add a token">
          <Button
            variant="primary"
            onClick={() => handle.edit((current) => ({ ...current, colors: [...current.colors, { id: `tok-${wallMs().toString(36)}`, name: `Colour ${current.colors.length + 1}`, value: "#234FE8", group: "Custom" }] }), "Create style")}
          >
            New colour token
          </Button>
        </Card>
      </Grid>
    );
  }

  if (lens === "Effects") {
    return (
      <Grid>
        {doc.effects.map((effect) => (
          <Card key={effect.id} span={6} title={effect.name}>
            <Stack gap={3}>
              <div style={{ display: "grid", placeItems: "center", height: 120, background: "var(--bg-inset)", borderRadius: 8 }}>
                <div style={{ width: 120, height: 64, borderRadius: 10, background: "#fff", boxShadow: `${effect.shadow.x}px ${effect.shadow.y}px ${effect.shadow.blur}px ${effect.shadow.color}` }} />
              </div>
              <Row gap={2} wrap>
                {(["x", "y", "blur"] as const).map((key) => (
                  <Field key={key} label={key}>
                    <TextInput type="number" value={effect.shadow[key]} onChange={(event) => handle.edit((current) => ({ ...current, effects: current.effects.map((item) => (item.id === effect.id ? { ...item, shadow: { ...item.shadow, [key]: Number(event.target.value) } } : item)) }), "Edit effect")} />
                  </Field>
                ))}
              </Row>
              <Button
                size="sm"
                variant="secondary"
                disabled={selected.length === 0}
                onClick={() => {
                  handle.edit((current) => updatePage(current, (p) => patchNodes(p, ui.selected, () => ({ shadow: effect.shadow, styleRefs: { effect: effect.id } }))), "Apply effect");
                  context.toast("Applied", `${effect.name} applied to ${ui.selected.length} layer${ui.selected.length === 1 ? "" : "s"}.`);
                }}
              >
                Apply to selection
              </Button>
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  const usage = (token: string) => Object.values(page.nodes).filter((node) => node.fill?.color === token || node.textStyle?.color === token).length;
  return (
    <Card title="Variable tokens" subtitle="Every token with where it is used on this page">
      <DataGrid
        rows={doc.colors}
        rowId={(row) => row.id}
        label="Variables"
        columns={[
          { key: "name", header: "Token", primary: true, cell: (row) => <Row gap={2}><i className="vx-swatchdot" style={{ background: row.value }} />{row.name}</Row>, sortValue: (row) => row.name, filterValue: (row) => row.name },
          { key: "group", header: "Group", cell: (row) => row.group, sortValue: (row) => row.group },
          { key: "value", header: "Value", cell: (row) => <code className="ds-num">{row.value}</code> },
          { key: "uses", header: "Layers using it", align: "end", cell: (row) => usage(row.value), sortValue: (row) => usage(row.value) },
          { key: "contrast", header: "On white", align: "end", cell: (row) => `${contrastRatio(row.value, "#FFFFFF")}:1` },
        ]}
        summary={<span>{doc.colors.length} tokens · {doc.textStyles.length} text styles · {doc.effects.length} effects</span>}
      />
    </Card>
  );
}

/* ---------------------------- DESIGN-008 ---------------------------- */

function PrototypeScreen({ context, lens }: { context: ScreenContext; lens: "Flow" | "Interactions" | "Preview" | "Share" }) {
  const { record, handle } = useDesignDoc(context);
  const [previewAt, setPreviewAt] = useState<string | undefined>(undefined);
  const [transitioning, setTransitioning] = useState(false);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);
  const frames = childrenOf(page, page.id).filter((node) => node.kind === "frame");
  const links = flatten(page).filter((entry) => entry.node.link).map((entry) => ({ from: entry.node, to: page.nodes[entry.node.link!.to] }));

  if (lens === "Flow") {
    const bounds = pageBounds(page);
    return (
      <Stack gap={4}>
        <Notice tone="info" title={`${frames.length} frames, ${links.length} connection${links.length === 1 ? "" : "s"}`}>
          The flow is drawn from the links stored on the layers. Add one on the canvas with the prototype tool, or on the Interactions tab.
        </Notice>
        <Card title="Screen flow" flush>
          <svg viewBox={`${bounds.x - 40} ${bounds.y - 40} ${bounds.w + 80} ${bounds.h + 80}`} style={{ width: "100%", height: 420, background: "var(--bg-inset)" }} role="img" aria-label={`Flow of ${frames.length} frames with ${links.length} connections`}>
            {links.map(({ from, to }) => {
              if (!to) return null;
              const a = rectCenter(absoluteRect(page, from));
              const b = rectCenter(absoluteRect(page, to));
              return (
                <g key={`${from.id}-${to.id}`}>
                  <path d={`M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`} fill="none" stroke="var(--accent)" strokeWidth={2} />
                  <circle cx={b.x} cy={b.y} r={6} fill="var(--accent)" />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} fontSize={12} fill="var(--fg-muted)" textAnchor="middle">{from.link?.trigger} · {from.link?.transition}</text>
                </g>
              );
            })}
            {frames.map((frame) => {
              const rect = absoluteRect(page, frame);
              return (
                <g key={frame.id}>
                  <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="#fff" stroke={doc.prototype.startNodeId === frame.id ? "var(--success)" : "var(--border-strong)"} strokeWidth={doc.prototype.startNodeId === frame.id ? 4 : 2} />
                  <text x={rect.x + 12} y={rect.y + 26} fontSize={16} fontWeight={650} fill="#17223A">{frame.name}</text>
                  {doc.prototype.startNodeId === frame.id && <text x={rect.x + 12} y={rect.y + 48} fontSize={13} fill="var(--success)">start</text>}
                </g>
              );
            })}
          </svg>
        </Card>
        <Row gap={2} wrap>
          {frames.map((frame) => (
            <Button key={frame.id} size="sm" variant={doc.prototype.startNodeId === frame.id ? "primary" : "secondary"} onClick={() => handle.edit((current) => ({ ...current, prototype: { ...current.prototype, startNodeId: frame.id } }), "Set start frame")}>
              Start at {frame.name}
            </Button>
          ))}
        </Row>
      </Stack>
    );
  }

  if (lens === "Interactions") {
    const rows = flatten(page).map((entry) => entry.node);
    return (
      <Card title="Interactions" subtitle="Every layer and whether it links somewhere">
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Interactions"
          columns={[
            { key: "layer", header: "Layer", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
            {
              key: "to", header: "Destination", cell: (row) => (
                <Select
                  aria-label={`${row.name} destination`}
                  value={row.link?.to ?? ""}
                  onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, row.id, event.target.value
                    ? { link: { to: event.target.value, trigger: row.link?.trigger ?? "click", transition: row.link?.transition ?? "dissolve", duration: row.link?.duration ?? 300 } }
                    : { link: undefined })), "Link screens")}
                >
                  <option value="">—</option>
                  {frames.filter((frame) => frame.id !== row.id).map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}
                </Select>
              ),
            },
            {
              key: "trigger", header: "Trigger", cell: (row) => row.link ? (
                <Select
                  aria-label={`${row.name} trigger`}
                  value={row.link.trigger}
                  onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, row.id, { link: { ...row.link!, trigger: event.target.value as "click" } })), "Set trigger")}
                >
                  {["click", "hover", "drag", "key"].map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              ) : "—",
            },
            { key: "transition", header: "Transition", cell: (row) => row.link?.transition ?? "—" },
            {
              key: "a11y", header: "Keyboard", cell: (row) => row.link
                ? (row.link.trigger === "hover" || row.link.trigger === "drag"
                  ? <Pill tone="warning">needs an alternative</Pill>
                  : <Pill tone="success">reachable</Pill>)
                : "—",
            },
          ]}
          onOpen={(id) => { setSelection([id]); context.openOverlay("Interaction editor", { id }); }}
        />
      </Card>
    );
  }

  if (lens === "Preview") {
    const current = previewAt ? page.nodes[previewAt] : (doc.prototype.startNodeId ? page.nodes[doc.prototype.startNodeId] : frames[0]);
    const outgoing = current ? flatten(page).filter((entry) => entry.node.link && (entry.parentId === current.id || entry.node.id === current.id)) : [];
    if (!current) return <Empty title="Draw a frame to preview" />;
    const rect = absoluteRect(page, current);
    return (
      <Stack gap={3}>
        <Row gap={2} wrap>
          <Pill tone="info">{current.name}</Pill>
          <Button size="sm" variant="secondary" onClick={() => setPreviewAt(doc.prototype.startNodeId ?? frames[0]?.id)}>Restart</Button>
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("device preview")}>Device frame</Button>
          <span className="ds-grow" />
          <Pill tone="warning">Local preview — no backend is connected</Pill>
        </Row>
        <Card flush>
          <div style={{ display: "grid", placeItems: "center", background: "var(--bg-inset)", padding: 24 }}>
            <svg
              width={Math.min(rect.w, 900)}
              height={Math.min(rect.h, 540)}
              viewBox={`${rect.x} ${rect.y} ${rect.w} ${rect.h}`}
              style={{ background: page.background, borderRadius: 10, boxShadow: "var(--shadow-2)", opacity: transitioning ? 0.25 : 1, transition: "opacity 300ms ease" }}
              role="img"
              aria-label={`Prototype preview of ${current.name}`}
            >
              <NodeView page={page} node={current} doc={doc} selected={[]} />
            </svg>
          </div>
        </Card>
        <Card title="Hotspots on this frame" subtitle="Keyboard reachable, as the accessibility note requires">
          {outgoing.length === 0 ? <p className="ds-subtle">No layer on this frame links anywhere.</p> : (
            <Stack gap={2}>
              {outgoing.map((entry) => (
                <Row key={entry.node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                  <span className="ds-grow">{entry.node.name} → {page.nodes[entry.node.link!.to]?.name ?? "missing frame"}</span>
                  <Pill>{entry.node.link!.trigger}</Pill>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTransitioning(true);
                      window.setTimeout(() => { setPreviewAt(entry.node.link!.to); setTransitioning(false); }, entry.node.link!.transition === "instant" ? 0 : entry.node.link!.duration);
                    }}
                  >
                    Follow
                  </Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A prototype here is not a product">
        This preview runs entirely in this browser against records in this workspace. It cannot sign anyone in, take a payment or read a live system, and it must not be shown as if it could. Publishing a link needs a hosting connection, which is not connected.
      </Notice>
      <Card title="Share" subtitle="What is possible without a provider">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Frames", value: frames.length },
            { label: "Connections", value: links.length },
            { label: "Start frame", value: doc.prototype.startNodeId ? page.nodes[doc.prototype.startNodeId]?.name ?? "—" : "not set" },
            { label: "Hosting", value: "Not connected" },
          ]} />
          <Row gap={2} wrap>
            <Button
              variant="primary"
              onClick={() => {
                const spec = {
                  file: record.title, page: page.name, device: doc.prototype.device,
                  start: doc.prototype.startNodeId,
                  frames: frames.map((frame) => ({ id: frame.id, name: frame.name, w: frame.w, h: frame.h })),
                  links: links.map(({ from, to }) => ({ from: from.name, to: to?.name, trigger: from.link?.trigger, transition: from.link?.transition, duration: from.link?.duration })),
                };
                downloadText(`${slug(record.title)}-prototype.json`, JSON.stringify(spec, null, 2), "application/json");
                context.toast("Downloaded", "The flow specification was written in this browser. It is not a hosted prototype.");
              }}
            >
              Download the flow specification
            </Button>
            <Button variant="secondary" onClick={() => context.openOverlay("transition options")}>Transition defaults</Button>
          </Row>
        </Stack>
      </Card>
    </Stack>
  );
}

/* ---------------------------- DESIGN-009 ---------------------------- */

function AssetsScreen({ context, lens }: { context: ScreenContext; lens: "Assets" | "Symbols" | "Exports" | "History" }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  const [busy, setBusy] = useState(false);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);

  const exportNode = async (node: SceneNode | null, format: "svg" | "png", scale: number) => {
    setBusy(true);
    try {
      const bounds = node ? absoluteRect(page, node) : pageBounds(page);
      const svg = pageToSvg(page, bounds, node ?? undefined);
      if (format === "svg") {
        downloadText(`${slug(record.title)}${node ? `-${slug(node.name)}` : ""}.svg`, svg, "image/svg+xml");
        context.toast("SVG written", `${Math.round(bounds.w)} × ${Math.round(bounds.h)} at 1×. The file came from this browser.`);
      } else {
        const blob = await svgToPng(svg, bounds.w, bounds.h, scale);
        downloadBlob(`${slug(record.title)}${node ? `-${slug(node.name)}` : ""}@${scale}x.png`, blob);
        context.toast("PNG written", `${Math.round(bounds.w * scale)} × ${Math.round(bounds.h * scale)} pixels, ${(blob.size / 1024).toFixed(0)} kB.`);
      }
    } catch (error) {
      context.toast("Export failed", error instanceof Error ? error.message : "The browser could not rasterise the document.", "failed");
    } finally {
      setBusy(false);
    }
  };

  if (lens === "Exports") {
    const nodes = flatten(page).map((entry) => entry.node);
    return (
      <Stack gap={4}>
        <Card title="Export the page" subtitle={`${Math.round(pageBounds(page).w)} × ${Math.round(pageBounds(page).h)} at 1×`}>
          <Row gap={2} wrap>
            <Button variant="primary" busy={busy} onClick={() => void exportNode(null, "svg", 1)}>Export SVG</Button>
            <Button variant="secondary" busy={busy} onClick={() => void exportNode(null, "png", 1)}>PNG 1×</Button>
            <Button variant="secondary" busy={busy} onClick={() => void exportNode(null, "png", 2)}>PNG 2×</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("export settings")}>Settings</Button>
          </Row>
        </Card>
        <Card title="Export slices" subtitle={`${doc.exports.length} configured`}>
          {doc.exports.length === 0 ? <p className="ds-subtle">Add a slice below to export one layer repeatedly at a fixed scale.</p> : (
            <Stack gap={2}>
              {doc.exports.map((slice) => {
                const node = page.nodes[slice.nodeId];
                return (
                  <Row key={slice.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <span className="ds-grow">{node?.name ?? "missing layer"}{slice.suffix}</span>
                    <Pill>{slice.format.toUpperCase()} {slice.scale}×</Pill>
                    <Button size="sm" variant="secondary" busy={busy} disabled={!node} onClick={() => void exportNode(node ?? null, slice.format, slice.scale)}>Export</Button>
                    <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, exports: current.exports.filter((item) => item.id !== slice.id) }), "Remove slice")}>Remove</Button>
                  </Row>
                );
              })}
            </Stack>
          )}
          <Row gap={2} wrap style={{ marginBlockStart: 12 }}>
            <Button
              variant="secondary"
              disabled={ui.selected.length === 0}
              onClick={() => handle.edit((current) => ({
                ...current,
                exports: [...current.exports, ...ui.selected.map((id, index) => ({ id: `ex-${wallMs().toString(36)}-${index}`, nodeId: id, format: "png" as const, scale: 2, suffix: "@2x" }))],
              }), "Add export slices")}
            >
              Add slices for the selection
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={doc.exports.length === 0}
              onClick={async () => {
                for (const slice of doc.exports) {
                  const node = page.nodes[slice.nodeId];
                  if (node) await exportNode(node, slice.format, slice.scale);
                }
                context.toast("Batch complete", `${doc.exports.length} file${doc.exports.length === 1 ? "" : "s"} written from this browser.`);
              }}
            >
              Batch export {doc.exports.length} slices
            </Button>
          </Row>
        </Card>
        <Card title="Layers you can export" subtitle="Pick one to export on its own">
          <DataGrid
            rows={nodes}
            rowId={(row) => row.id}
            label="Exportable layers"
            columns={[
              { key: "name", header: "Layer", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
              { key: "kind", header: "Kind", cell: (row) => row.kind },
              { key: "size", header: "Size", align: "end", cell: (row) => `${Math.round(row.w)} × ${Math.round(row.h)}` },
              {
                key: "do", header: "Export", align: "end", cell: (row) => (
                  <Row gap={1}>
                    <Button size="sm" variant="ghost" busy={busy} onClick={() => void exportNode(row, "svg", 1)}>SVG</Button>
                    <Button size="sm" variant="ghost" busy={busy} onClick={() => void exportNode(row, "png", 2)}>PNG</Button>
                  </Row>
                ),
              },
            ]}
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Symbols") {
    return (
      <Card title="Symbols" subtitle="Components usable as icons across this file">
        {doc.components.length === 0 ? (
          <Empty title="No symbols" action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/design/files/:id/components", context.params.id))}>Create a component</Button>}>
            A published component is reusable as a symbol.
          </Empty>
        ) : (
          <Grid>
            {doc.components.map((component) => (
              <Card key={component.id} span={3} title={component.name} subtitle={`${instancesOf(doc, component.id).length} uses`}>
                <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => instantiate(current, component.id, { x: 40, y: 40 }).doc, "Place symbol")}>Place</Button>
              </Card>
            ))}
          </Grid>
        )}
      </Card>
    );
  }

  if (lens === "History") {
    return (
      <Card title="Version history" subtitle={`${doc.versions.length} saved marks · record revision ${record.revision}`}>
        <Stack gap={3}>
          <Row gap={2}>
            <Button
              variant="secondary"
              onClick={() => handle.edit((current) => ({
                ...current,
                versions: [{ id: `v-${wallMs().toString(36)}`, at: clockIso(), by: context.actor, label: `Mark at revision ${record.revision}`, nodeCount: Object.keys(activePage(current).nodes).length }, ...current.versions],
              }), "Mark a version")}
            >
              Mark this version
            </Button>
          </Row>
          {doc.versions.length === 0 ? <p className="ds-subtle">No marks yet. The record itself keeps its last {record.history.length} snapshots.</p> : (
            <DataGrid
              rows={doc.versions}
              rowId={(row) => row.id}
              label="Versions"
              columns={[
                { key: "label", header: "Mark", primary: true, cell: (row) => row.label },
                { key: "at", header: "When", cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
                { key: "by", header: "By", cell: (row) => row.by },
                { key: "nodes", header: "Layers", align: "end", cell: (row) => row.nodeCount },
              ]}
            />
          )}
          <Card title="Record snapshots" subtitle="Written by the repository on every save">
            {record.history.length === 0 ? <p className="ds-subtle">The record has no snapshots yet.</p> : (
              <Stack gap={1}>
                {record.history.slice(0, 8).map((snapshot, index) => (
                  <Row key={index} gap={2}><span className="ds-grow">{snapshot.title}</span><span className="vx-mini">{context.dateTime(snapshot.at)}</span></Row>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Rights travel with the asset">Each asset keeps its licence and credit; export and placement carry them.</Notice>
      <Card
        title="Assets"
        subtitle={`${doc.assets.length} in this file`}
        actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Asset picker")}>Add an asset</Button>}
      >
        {doc.assets.length === 0 ? <Empty title="No assets yet">Add one from the picker; an image is held as a data URL in this browser.</Empty> : (
          <Grid>
            {doc.assets.map((asset) => (
              <Card key={asset.id} span={4} title={asset.name} subtitle={`${asset.width} × ${asset.height} · ${asset.kind}`}>
                <Stack gap={2}>
                  {asset.src
                    ? <img src={asset.src} alt={asset.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }} />
                    : <div className="vx-checker" style={{ height: 120, borderRadius: 6, display: "grid", placeItems: "center" }}><span className="vx-mini">No pixels stored</span></div>}
                  <Properties rows={[{ label: "Licence", value: asset.license }, { label: "Credit", value: asset.credit }]} />
                  <Row gap={1}>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("license note", { id: asset.id })}>Licence note</Button>
                    <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, assets: current.assets.filter((item) => item.id !== asset.id) }), "Remove asset")}>Remove</Button>
                  </Row>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Card>
    </Stack>
  );
}

/* ---------------------------- DESIGN-010 ---------------------------- */

function ReviewScreen({ context, lens }: { context: ScreenContext; lens: "Comments" | "Reviews" | "Diff" | "History" }) {
  const { record, handle } = useDesignDoc(context);
  if (!record) return <MissingFile context={context} />;
  const doc = handle.doc;
  if (!doc) return <Empty title="Opening the file…" />;
  const page = activePage(doc);

  if (lens === "Reviews") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="An approval binds to one revision">
          Each approval records the record revision it was given at. A later edit raises the revision, so the approval no longer covers the current file and says so.
        </Notice>
        <Card title="Reviews" subtitle={`${doc.reviews.length} recorded · the record is at revision ${record.revision}`}>
          {doc.reviews.length === 0 ? <Empty title="No reviews yet" action={<Button variant="primary" onClick={() => context.openOverlay("signoff")}>Record a review</Button>} /> : (
            <Stack gap={2}>
              {doc.reviews.map((review) => (
                <Row key={review.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <strong>{review.by}</strong>
                    <p className="ds-subtle">{review.note}</p>
                  </div>
                  <Pill tone={review.state === "approved" ? "success" : review.state === "changes" ? "warning" : "info"} dot>{review.state}</Pill>
                  <Pill tone={review.digest ? (review.digest === designDigest(doc) ? "success" : "warning") : "warning"}>
                    {review.digest
                      ? (review.digest === designDigest(doc) ? `covers this version (${review.digest})` : `given for an earlier version, at revision ${review.version}`)
                      : `given at revision ${review.version}; no digest was recorded`}
                  </Pill>
                  <span className="vx-mini">{context.dateTime(review.at)}</span>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    );
  }

  if (lens === "Diff") {
    const snapshot = record.history[0];
    const previous = snapshot ? parseDesign(snapshot.body) : null;
    const previousPage = previous?.pages.find((item) => item.id === page.id) ?? previous?.pages[0];
    const added = previousPage ? Object.keys(page.nodes).filter((id) => !previousPage.nodes[id]) : [];
    const removed = previousPage ? Object.keys(previousPage.nodes).filter((id) => !page.nodes[id]) : [];
    const changed = previousPage
      ? Object.keys(page.nodes).filter((id) => previousPage.nodes[id] && JSON.stringify(previousPage.nodes[id]) !== JSON.stringify(page.nodes[id]))
      : [];
    return (
      <Stack gap={4}>
        {!previousPage ? (
          <Notice tone="warning" title="No earlier snapshot to compare">The record has not been saved twice yet, so there is nothing to diff. Make an edit on the canvas and come back.</Notice>
        ) : (
          <>
            <StatRow>
              <Stat label="Layers added" value={added.length} meta="since the previous snapshot" />
              <Stat label="Layers removed" value={removed.length} />
              <Stat label="Layers changed" value={changed.length} />
              <Stat label="Snapshot taken" value={context.dateTime(snapshot.at)} meta={`revision ${record.revision}`} />
            </StatRow>
            <Grid>
              <Card span={6} title="Previous" subtitle={context.dateTime(snapshot.at)}>
                {previous && <DesignThumb doc={previous} height={240} pageId={previousPage.id} />}
              </Card>
              <Card span={6} title="Current" subtitle={`revision ${record.revision}`}>
                <DesignThumb doc={doc} height={240} />
              </Card>
            </Grid>
            <Card title="What changed" subtitle="Layer by layer">
              <DataGrid
                rows={[
                  ...added.map((id) => ({ id, state: "added", name: page.nodes[id].name })),
                  ...removed.map((id) => ({ id, state: "removed", name: previousPage.nodes[id].name })),
                  ...changed.map((id) => ({ id, state: "changed", name: page.nodes[id].name })),
                ]}
                rowId={(row) => `${row.state}-${row.id}`}
                label="Changes"
                columns={[
                  { key: "name", header: "Layer", primary: true, cell: (row) => row.name, sortValue: (row) => row.name },
                  { key: "state", header: "Change", cell: (row) => <Pill tone={row.state === "added" ? "success" : row.state === "removed" ? "danger" : "warning"}>{row.state}</Pill>, sortValue: (row) => row.state },
                ]}
                empty={<Empty title="Nothing changed between these two snapshots" />}
              />
            </Card>
          </>
        )}
      </Stack>
    );
  }

  if (lens === "History") {
    const events = record.history;
    return (
      <Card title="Edit history" subtitle={`${events.length} snapshots on the record`}>
        {events.length === 0 ? <Empty title="No history yet" /> : (
          <DataGrid
            rows={events.map((item, index) => ({ ...item, id: `${index}` }))}
            rowId={(row) => row.id}
            label="History"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "title", header: "Title at the time", cell: (row) => row.title },
              { key: "status", header: "Status", cell: (row) => row.status },
            ]}
          />
        )}
      </Card>
    );
  }

  const comments = doc.comments;
  const bounds = pageBounds(page);
  return (
    <Grid>
      <Card span={7} title="Comment pins" subtitle={`${comments.filter((c) => !c.resolved).length} open of ${comments.length}`} flush>
        <svg viewBox={`${bounds.x - 20} ${bounds.y - 20} ${bounds.w + 40} ${bounds.h + 40}`} style={{ width: "100%", height: 400, background: page.background }} role="img" aria-label="Design with comment pins">
          {childrenOf(page, page.id).map((node) => <NodeView key={node.id} page={page} node={node} doc={doc} selected={[]} />)}
          {comments.filter((comment) => comment.pageId === page.id).map((comment, index) => (
            <g key={comment.id} transform={`translate(${comment.x} ${comment.y})`}>
              <circle r={16} fill={comment.resolved ? "var(--success)" : "var(--accent)"} stroke="#fff" strokeWidth={3} />
              <text y={6} textAnchor="middle" fontSize={16} fill="#fff" fontWeight={700}>{index + 1}</text>
            </g>
          ))}
        </svg>
      </Card>
      <Card span={5} title="Threads" actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Comment editor")}>Annotate</Button>}>
        {comments.length === 0 ? <Empty title="No comments">Open the canvas, choose the Comments tab and click where the issue is.</Empty> : (
          <Stack gap={2}>
            {comments.map((comment, index) => (
              <div key={comment.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}>
                  <Pill tone={comment.resolved ? "success" : "accent"}>{index + 1}</Pill>
                  <strong className="ds-grow">{comment.author}</strong>
                  <span className="vx-mini">{context.relative(comment.at)}</span>
                </Row>
                <p>{comment.text || <span className="ds-subtle">No text yet</span>}</p>
                <Row gap={1}>
                  <Button size="sm" variant="ghost" onClick={() => handle.edit((current) => ({ ...current, comments: current.comments.map((item) => (item.id === comment.id ? { ...item, resolved: !item.resolved } : item)) }), "Resolve comment")}>{comment.resolved ? "Reopen" : "Resolve"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Comment editor", { id: comment.id })}>Edit</Button>
                </Row>
              </div>
            ))}
          </Stack>
        )}
      </Card>
      <Card span={12} title="Accessibility notes" subtitle="Computed from the layers on this page">
        <AccessibilityNotes handle={handle} />
      </Card>
    </Grid>
  );
}

function AccessibilityNotes({ handle }: { handle: DocHandle<DesignDoc> }) {
  const doc = handle.doc;
  if (!doc) return null;
  const page = activePage(doc);
  const issues: { layer: string; note: string; tone: "danger" | "warning" }[] = [];
  for (const node of Object.values(page.nodes)) {
    if (node.kind === "text" && node.textStyle) {
      const ratio = contrastRatio(node.textStyle.color, page.background);
      const grade = wcagGrade(ratio, node.textStyle.size >= 24);
      if (grade === "fail") issues.push({ layer: node.name, note: `Text contrast ${ratio}:1 against the page fails WCAG AA at ${node.textStyle.size}px.`, tone: "danger" });
      if (node.textStyle.size < 12) issues.push({ layer: node.name, note: `Text is ${node.textStyle.size}px, below a comfortable minimum.`, tone: "warning" });
    }
    if (node.link && (node.link.trigger === "hover" || node.link.trigger === "drag")) {
      issues.push({ layer: node.name, note: `A ${node.link.trigger} trigger has no keyboard or touch equivalent.`, tone: "warning" });
    }
    if ((node.kind === "rect" || node.kind === "frame") && node.w < 44 && node.h < 44 && node.link) {
      issues.push({ layer: node.name, note: `Interactive target is ${Math.round(node.w)} × ${Math.round(node.h)}, under the 44px guidance.`, tone: "warning" });
    }
  }
  if (issues.length === 0) return <Notice tone="success" title="No accessibility problems found on this page">Contrast, text size, trigger type and target size were all checked against the layers here.</Notice>;
  return (
    <Stack gap={2}>
      {issues.map((issue, index) => (
        <Notice key={index} tone={issue.tone} title={issue.layer}>{issue.note}</Notice>
      ))}
    </Stack>
  );
}

/* ====================================================================== *
 * Registration
 * ====================================================================== */

function submitFooter(formId: string, label: string) {
  return ({ close }: { close: () => void }) => (
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <span className="ds-grow" />
      <Button variant="primary" type="submit" form={formId}>{label}</Button>
    </>
  );
}

async function withDoc(context: ScreenContext, change: (doc: DesignDoc) => DesignDoc, event: string): Promise<void> {
  await editShared<DesignDoc>(context, parseDesign, change, event);
}

function openDesign(context: ScreenContext): DesignDoc | undefined {
  return sharedHandle<DesignDoc>(context.params.id)?.doc ?? undefined;
}

/** A digest of what the file draws, so an approval binds to this exact design. */
export function designDigest(doc: DesignDoc): string {
  const material = JSON.stringify(doc.pages.map((page) => ({ id: page.id, children: page.children, nodes: page.nodes, background: page.background })))
    + JSON.stringify(doc.components.map((component) => [component.id, component.version, component.nodes]));
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The frame the selection names: the selected frame itself. */
function selectedFrame(doc: DesignDoc | undefined): SceneNode | undefined {
  if (!doc) return undefined;
  const node = activePage(doc).nodes[designUi.get().selected[0]];
  return node?.kind === "frame" ? node : undefined;
}

const needsSelection = () => (designUi.get().selected.length ? undefined : "Select a layer first");

/** Refuse an edit that would touch a hidden or locked layer, or one inside a locked group. */
function editableSelection(context: ScreenContext): string | undefined {
  const selected = designUi.get().selected;
  if (selected.length === 0) return "Select a layer first";
  const doc = openDesign(context);
  if (!doc) return undefined;
  const page = activePage(doc);
  const blocked = selected.find((id) => page.nodes[id] && !isEditable(page, id));
  return blocked ? `${page.nodes[blocked].name} is hidden or locked` : undefined;
}

/** The component behind the selected instance, if one is selected. */
function selectedComponentId(doc: DesignDoc | undefined): string | undefined {
  if (!doc) return undefined;
  const node = activePage(doc).nodes[designUi.get().selected[0]];
  return node?.kind === "instance" ? node.componentId : undefined;
}

/**
 * The path the path screen is editing: the chosen one, then a selected path
 * layer, then the path the screen itself shows as active (the first on the
 * page, highlighted in its list), so the actions and the canvas agree.
 */
function targetPathId(doc: DesignDoc | undefined): string | undefined {
  if (!doc) return undefined;
  const page = activePage(doc);
  const ui = designUi.get();
  if (ui.pathNodeId && page.nodes[ui.pathNodeId]?.path) return ui.pathNodeId;
  const selected = ui.selected.find((id) => page.nodes[id]?.path);
  return selected ?? Object.values(page.nodes).find((node) => node.kind === "path" && node.path)?.id;
}

const needsPath = (context: ScreenContext) => (targetPathId(openDesign(context)) ? undefined : "Choose a path layer first");

const CANVAS_ACTIONS: ActionDef[] = [
  {
    id: "Select", label: "Select all", placement: "toolbar", shortcut: "⌘A",
    run: (context) => {
      const doc = openDesign(context);
      if (!doc) return;
      const page = activePage(doc);
      setSelection(childrenOf(page, page.id).filter((node) => node.visible && !node.locked).map((node) => node.id));
      setTool("select");
    },
  },
  {
    id: "draw", label: "Draw a rectangle", placement: "toolbar",
    guard: (context) => (openDesign(context) ? undefined : "Open a file first"),
    run: async (context) => {
      const doc = openDesign(context);
      if (!doc) return;
      const view = designUi.get().view;
      const centre = { x: (450 - view.x) / view.zoom, y: (280 - view.y) / view.zoom };
      const node = makeNode("rect", { x: Math.round(centre.x - 80), y: Math.round(centre.y - 50), w: 160, h: 100 }, { name: "Rectangle", fill: { type: "solid", color: doc.colors[0]?.value ?? "#234FE8" } });
      await withDoc(context, (current) => updatePage(current, (page) => addNode(page, node, page.id)), "Draw a rectangle");
      setSelection([node.id]);
    },
  },
  { id: "insert", label: "Insert tools…", placement: "overflow", run: (context) => context.openOverlay("Insert tools") },
  { id: "drag", label: "Drag the selection by…", placement: "overflow", guard: editableSelection, run: (context) => context.openOverlay("move selection") },
  { id: "hand", label: "Hand tool (H)", placement: "overflow", run: () => setTool("hand") },
  { id: "resize", label: "Resize…", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("style inspector") },
  {
    id: "rotate", label: "Rotate 15°", placement: "overflow",
    guard: editableSelection,
    run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => patchNodes(page, designUi.get().selected, (node) => ({ rotation: Math.round((node.rotation + 15) % 360) }))), "Rotate the selection by 15 degrees"),
  },
  {
    id: "crop", label: "Crop the frame to the selection", placement: "overflow",
    guard: editableSelection,
    run: async (context) => {
      let reason = "";
      await withDoc(context, (doc) => updatePage(doc, (page) => {
        const ids = designUi.get().selected;
        const bounds = selectionBounds(page, ids);
        const parentId = parentOf(page, ids[0]);
        if (!bounds || !parentId || parentId === page.id) { reason = "The selection is not inside a frame."; return page; }
        const frame = page.nodes[parentId];
        if (!frame) return page;
        const offset = absoluteRect(page, frame);
        let next = patchNode(page, parentId, { x: frame.x + (bounds.x - offset.x), y: frame.y + (bounds.y - offset.y), w: bounds.w, h: bounds.h });
        for (const child of childrenOf(page, parentId)) {
          next = patchNode(next, child.id, { x: child.x - (bounds.x - offset.x), y: child.y - (bounds.y - offset.y) });
        }
        return next;
      }), "Crop the frame to the selection");
      if (reason) context.toast("Nothing cropped", reason, "blocked");
    },
  },
  { id: "zoom", label: "Zoom to fit", placement: "secondary", shortcut: "0", run: () => requestFit() },
  {
    id: "pan", label: "Pan to the selection", placement: "overflow",
    run: (context) => {
      const doc = openDesign(context);
      if (!doc) return;
      const page = activePage(doc);
      const bounds = selectionBounds(page, designUi.get().selected) ?? pageBounds(page);
      designUi.set((current) => ({ ...current, view: fitRect(bounds, 900, 560, 80) }));
    },
  },
  {
    id: "undo", label: "Undo", placement: "overflow", shortcut: "⌘Z",
    guard: (context) => (canUndoShared(context) ? undefined : "Nothing to undo yet"),
    run: (context) => { undoShared(context); },
  },
];

const PATH_ACTIONS: ActionDef[] = [
  {
    id: "Add point", label: "Add a point", placement: "primary",
    guard: needsPath,
    run: async (context) => {
      const doc = openDesign(context);
      const nodeId = targetPathId(doc);
      if (!doc || !nodeId) return;
      const path = activePage(doc).nodes[nodeId].path!;
      const after = designUi.get().selectedAnchors[0] ?? path.anchors[path.anchors.length - (path.closed ? 1 : 2)]?.id;
      const id = `a-${wallMs().toString(36)}`;
      const next = after ? splitSegment(path, after, id) : path;
      if (next === path) { context.toast("No segment to split", "A path needs two points before one can be added between them; use the pen tool to start one.", "blocked"); return; }
      await withDoc(context, (current) => updatePage(current, (page) => patchNode(page, nodeId, { path: next })), "Add a point");
      designUi.set((current) => ({ ...current, selectedAnchors: [id] }));
    },
  },
  { id: "pen", label: "Pen tool (P)", placement: "overflow", run: () => setTool("pen") },
  {
    id: "adjust handle", label: "Adjust the point's handles…", placement: "secondary",
    guard: (context) => needsPath(context) ?? (designUi.get().selectedAnchors.length ? undefined : "Select a point on the path first"),
    run: (context) => context.openOverlay("Point inspector"),
  },
  {
    id: "join", label: "Join the ends", placement: "secondary",
    guard: needsPath,
    run: async (context) => {
      const doc = openDesign(context);
      const nodeId = targetPathId(doc);
      if (!nodeId) return;
      const node = activePage(doc!).nodes[nodeId];
      if (node.path?.closed) { context.toast("Already closed", `${node.name} is a closed contour.`, "info"); return; }
      await withDoc(context, (current) => updatePage(current, (page) => patchNode(page, nodeId, { path: joinEnds(page.nodes[nodeId].path!) })), "Join the path ends");
    },
  },
  {
    id: "subtract", label: "Subtract the second selected path", placement: "overflow",
    guard: (context) => {
      const doc = openDesign(context);
      if (!doc) return "Open a file first";
      const page = activePage(doc);
      const paths = designUi.get().selected.filter((id) => page.nodes[id]?.path);
      return paths.length === 2 ? undefined : "Select exactly two path layers: the shape to keep, then the one to cut";
    },
    run: async (context) => {
      const selected = designUi.get().selected;
      await withDoc(context, (doc) => updatePage(doc, (page) => {
        const [keepId, cutId] = selected.filter((id) => page.nodes[id]?.path);
        const keep = page.nodes[keepId];
        const cut = page.nodes[cutId];
        if (!keep?.path || !cut?.path) return page;
        const combined = combinePaths(keep.path, cut.path, { x: cut.x - keep.x, y: cut.y - keep.y }, "subtract");
        return removeNodes(patchNode(page, keep.id, { path: combined }), [cut.id]);
      }), "Subtract a path");
      setSelection(selected.slice(0, 1));
      context.toast("Subtracted with the even-odd rule", "The second path is now a contour of the first. No intersection geometry was computed, so where they overlap the result is the even-odd fill.", "info");
    },
  },
  { id: "combine", label: "Combine options…", placement: "overflow", run: (context) => context.setTab("Boolean") },
  {
    id: "simplify", label: "Simplify", placement: "overflow",
    guard: needsPath,
    run: (context) => withDoc(context, (doc) => {
      const nodeId = targetPathId(doc);
      return nodeId ? updatePage(doc, (page) => patchNode(page, nodeId, { path: simplifyPath(page.nodes[nodeId].path!, 4) })) : doc;
    }, "Simplify the path"),
  },
];

/* --------------------------- action overlays --------------------------- */

function MoveSelection({ context, close }: { context: ScreenContext; close: () => void }) {
  const ui = useStore(designUi);
  const [dx, setDx] = useState("10");
  const [dy, setDy] = useState("0");
  return (
    <form
      id="design-move-selection"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const x = Number(dx);
        const y = Number(dy);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        await withDoc(context, (doc) => updatePage(doc, (page) => patchNodes(page, ui.selected.filter((id) => isEditable(page, id)), (node) => ({ x: node.x + x, y: node.y + y }))), `Drag the selection ${x}, ${y}`);
        close();
      }}
    >
      <p className="ds-prose">The keyboard equivalent of dragging: move the {ui.selected.length} selected layer{ui.selected.length === 1 ? "" : "s"} by an exact distance. Arrow keys on the canvas nudge by 1px, with Shift by 10px.</p>
      <Row gap={3} wrap>
        <Field label="Across (px)"><TextInput type="number" value={dx} onChange={(event) => setDx(event.target.value)} autoFocus /></Field>
        <Field label="Down (px)"><TextInput type="number" value={dy} onChange={(event) => setDy(event.target.value)} /></Field>
      </Row>
    </form>
  );
}

function SwapInstance({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const page = activePage(doc);
  const node = page.nodes[ui.selected[0]];
  if (node?.kind !== "instance") return <Notice tone="info" title="Select an instance">Swapping replaces the component an instance points at.</Notice>;
  const others = doc.components.filter((component) => component.id !== node.componentId);
  return (
    <Stack gap={2}>
      <Properties rows={[
        { label: "Instance", value: node.name },
        { label: "Now", value: doc.components.find((component) => component.id === node.componentId)?.name ?? "missing component" },
        { label: "Overrides kept", value: Object.keys(node.overrides ?? {}).length },
      ]} />
      {others.length === 0 ? <Empty title="No other component to swap to">Create another component first.</Empty> : others.map((component) => {
        const root = component.nodes[component.root];
        return (
          <Row key={component.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <span className="ds-grow">{component.name} <span className="vx-mini">v{component.version}</span></span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, {
                  componentId: component.id, name: component.name,
                  w: root?.w ?? node.w, h: root?.h ?? node.h, fill: root?.fill ?? node.fill, radius: root?.radius ?? node.radius,
                })), `Swap ${node.name} to ${component.name}`);
                void context.mutate.log(`Swapped ${node.name} to ${component.name}`, { entityId: record.id, type: "update" });
                close();
              }}
            >
              Swap to this
            </Button>
          </Row>
        );
      })}
    </Stack>
  );
}

function TokenEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const [chosenToken, setTokenId] = useState("");
  const tokenId = chosenToken || handle.doc?.colors[0]?.id || "";
  const token = handle.doc?.colors.find((item) => item.id === tokenId);
  const [draftName, setName] = useState<string | null>(null);
  const [draftValue, setValue] = useState<string | null>(null);
  const name = draftName ?? token?.name ?? "";
  const value = draftValue ?? token?.value ?? "#234FE8";
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  if (doc.colors.length === 0) return <Empty title="No colour tokens yet">Create one with New colour token.</Empty>;
  const uses = doc.pages.reduce((sum, page) => sum + Object.values(page.nodes).filter((node) => node.styleRefs?.fill === tokenId || node.fill?.color?.toLowerCase() === token?.value.toLowerCase()).length, 0);
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <form
      id="design-token-editor"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!token || !valid || !name.trim()) return;
        const old = token.value.toLowerCase();
        handle.edit((current) => ({
          ...current,
          colors: current.colors.map((item) => (item.id === token.id ? { ...item, name: name.trim(), value } : item)),
          pages: current.pages.map((page) => ({
            ...page,
            nodes: Object.fromEntries(Object.entries(page.nodes).map(([id, node]) => [id, (node.styleRefs?.fill === token.id || node.fill?.color?.toLowerCase() === old) && node.fill
              ? { ...node, fill: { ...node.fill, color: value } }
              : node])),
          })),
        }), `Edit the token ${name.trim()}`);
        void context.mutate.log(`Colour token ${name.trim()} set to ${value}; ${uses} layers follow it`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      <Field label="Token">
        <Select value={tokenId} onChange={(event) => { const next = doc.colors.find((item) => item.id === event.target.value); setTokenId(event.target.value); setName(next?.name ?? ""); setValue(next?.value ?? "#000000"); }}>
          {doc.colors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.value}</option>)}
        </Select>
      </Field>
      <Row gap={3} wrap>
        <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Value" error={valid ? undefined : "Use a six-digit hex value, like #234FE8."}><TextInput value={value} onChange={(event) => setValue(event.target.value)} /></Field>
        <Field label="Pick"><input type="color" aria-label="Pick the token colour" value={valid ? value : "#000000"} onChange={(event) => setValue(event.target.value)} /></Field>
      </Row>
      <Notice tone={uses > 0 ? "warning" : "info"} title={`${uses} layer${uses === 1 ? "" : "s"} use this token`}>Saving changes their fill to the new value. Undo puts every one back.</Notice>
    </form>
  );
}

function ApplyStyle({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const page = activePage(doc);
  const nodes = ui.selected.map((id) => page.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return <Notice tone="info" title="Select a layer">Pick the layers first, then the style.</Notice>;
  const texts = nodes.filter((node) => node.kind === "text");
  const shapes = nodes.filter((node) => node.kind !== "text");
  const apply = (change: (node: SceneNode) => Partial<SceneNode>, label: string, ids: string[]) => {
    handle.edit((current) => updatePage(current, (p) => patchNodes(p, ids.filter((id) => isEditable(p, id)), change)), label);
    void context.mutate.log(label, { entityId: record.id, type: "update" });
    close();
  };
  return (
    <Stack gap={3}>
      <PanelGroup title={`Text style · ${texts.length} text layer${texts.length === 1 ? "" : "s"}`}>
        {texts.length === 0 ? <p className="vx-mini">No text layer is selected.</p> : (
          <Stack gap={1}>
            {doc.textStyles.map((style) => (
              <Row key={style.id} gap={2} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
                <span className="ds-grow" style={{ fontFamily: style.family }}>{style.name} <span className="vx-mini">{style.family} {style.size}/{style.weight}</span></span>
                <Button size="sm" variant="secondary" onClick={() => apply((node) => ({ textStyle: { ...node.textStyle!, size: style.size, weight: style.weight, family: style.family, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, styleId: style.id } }), `Apply ${style.name}`, texts.map((node) => node.id))}>Apply</Button>
              </Row>
            ))}
          </Stack>
        )}
      </PanelGroup>
      <PanelGroup title={`Colour token · ${shapes.length} shape${shapes.length === 1 ? "" : "s"}`}>
        {shapes.length === 0 ? <p className="vx-mini">No shape layer is selected.</p> : (
          <Stack gap={1}>
            {doc.colors.map((token) => (
              <Row key={token.id} gap={2} className="ds-panel" style={{ padding: "var(--space-1) var(--space-2)" }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, background: token.value, border: "1px solid var(--border-default)" }} />
                <span className="ds-grow">{token.name} <span className="ds-num vx-mini">{token.value}</span></span>
                <Button size="sm" variant="secondary" onClick={() => apply((node) => ({ fill: { type: "solid", color: token.value }, styleRefs: { ...node.styleRefs, fill: token.id } }), `Apply ${token.name}`, shapes.map((node) => node.id))}>Apply</Button>
              </Row>
            ))}
          </Stack>
        )}
      </PanelGroup>
      {nodes.some((node) => !isEditable(page, node.id)) && <Notice tone="warning" title="Locked or hidden layers are skipped">They keep their current style.</Notice>}
    </Stack>
  );
}

function LinkScreens({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  const page = handle.doc ? activePage(handle.doc) : undefined;
  const frames = page ? childrenOf(page, page.id).filter((item) => item.kind === "frame") : [];
  const [from, setFrom] = useState(ui.selected[0] ?? "");
  const [to, setTo] = useState("");
  const [trigger, setTrigger] = useState<"click" | "hover" | "drag" | "key">("click");
  if (!record || !handle.doc || !page) return <Empty title="Open a file first" />;
  const layers = flatten(page).map((entry) => entry.node).filter((node) => node.visible);
  return (
    <form
      id="design-link-screens"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const source = page.nodes[from];
        const target = page.nodes[to];
        if (!source || !target || from === to) return;
        handle.edit((current) => updatePage(current, (p) => patchNode(p, from, { link: { to, trigger, transition: source.link?.transition ?? "dissolve", duration: source.link?.duration ?? 300 } })), `Link ${source.name} to ${target.name}`);
        void context.mutate.log(`Linked ${source.name} to ${target.name} on ${trigger}`, { entityId: record.id, type: "update" });
        close();
      }}
    >
      <Field label="From (the hotspot)" required>
        <Select value={from} onChange={(event) => setFrom(event.target.value)} required>
          <option value="">Choose a layer</option>
          {layers.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
        </Select>
      </Field>
      <Field label="To (the destination screen)" required>
        <Select value={to} onChange={(event) => setTo(event.target.value)} required>
          <option value="">Choose a frame</option>
          {frames.filter((frame) => frame.id !== from).map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}
        </Select>
      </Field>
      <Field label="Trigger">
        <Select value={trigger} onChange={(event) => setTrigger(event.target.value as "click")}>
          {["click", "hover", "drag", "key"].map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </Field>
      {trigger === "hover" && <Notice tone="warning" title="Hover has no touch equivalent">Add a click link as well before the prototype is shared.</Notice>}
    </form>
  );
}

function PublishPrototype({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const page = activePage(doc);
  const links = Object.values(page.nodes).filter((node) => node.link).length;
  return (
    <form
      id="design-publish-prototype"
      className="ds-stack ds-gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const publication = { state: "queued_local" as const, at: clockIso(), by: context.actor, digest: designDigest(doc) };
        handle.edit((current) => ({ ...current, prototype: { ...current.prototype, publication } }), "Queue the prototype for publishing");
        void context.mutate.log("Prototype publication queued locally; no hosting is connected", { entityId: record.id, type: "publish", capability: "queued_local" });
        context.toast("Queued locally, not published", "No hosting provider is connected, so no link exists and nothing left this browser. The request is recorded on the file.", "info");
        close();
      }}
    >
      <Properties rows={[
        { label: "Start screen", value: doc.prototype.startNodeId ? page.nodes[doc.prototype.startNodeId]?.name ?? "missing" : "the first frame" },
        { label: "Links on this page", value: links },
        { label: "Device", value: doc.prototype.device },
        { label: "Hosting", value: <Pill tone="warning">{CAPABILITY_LABELS.not_connected}</Pill> },
        { label: "Last request", value: doc.prototype.publication ? `${CAPABILITY_LABELS[doc.prototype.publication.state]} by ${doc.prototype.publication.by}, ${context.relative(doc.prototype.publication.at)}` : "none" },
      ]} />
      <Notice tone="warning" title="A prototype is not a product">It has no backend: forms submit nothing and data on its screens is drawn, not loaded. Anyone shown it should be told so.</Notice>
      <Notice tone="info" title="What publishing does here">It records the request against this version of the file as queued locally. No URL is created until a hosting provider is connected.</Notice>
    </form>
  );
}

function CropAsset({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const images = handle.doc?.assets.filter((asset) => asset.kind === "image" && asset.src) ?? [];
  const [chosenAsset, setAssetId] = useState("");
  const assetId = chosenAsset || images[0]?.id || "";
  const asset = images.find((item) => item.id === assetId);
  const [draftRect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const rect = draftRect ?? { x: 0, y: 0, w: asset?.width ?? 0, h: asset?.height ?? 0 };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  if (images.length === 0) return <Empty title="No image with pixels to crop">Add an image asset first. Icons are vectors and are resized, not cropped.</Empty>;
  const field = (key: "x" | "y" | "w" | "h", label: string) => (
    <Field label={label}><TextInput type="number" value={rect[key]} onChange={(event) => setRect({ ...rect, [key]: Math.round(Number(event.target.value)) })} /></Field>
  );
  return (
    <form
      id="design-crop-asset"
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!asset?.src) return;
        if (rect.w < 1 || rect.h < 1 || rect.x < 0 || rect.y < 0 || rect.x + rect.w > asset.width || rect.y + rect.h > asset.height) {
          setError(`The crop must sit inside the ${asset.width} × ${asset.height} image.`);
          return;
        }
        setBusy(true);
        try {
          const image = new Image();
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The image could not be decoded.")); image.src = asset.src!; });
          const canvas = document.createElement("canvas");
          canvas.width = rect.w;
          canvas.height = rect.h;
          canvas.getContext("2d")?.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
          const src = canvas.toDataURL("image/png");
          handle.edit((current) => ({
            ...current,
            assets: current.assets.map((item) => (item.id === asset.id ? { ...item, src, width: rect.w, height: rect.h } : item)),
          }), `Crop ${asset.name}`);
          void context.mutate.log(`Cropped ${asset.name} to ${rect.w} × ${rect.h}; licence and credit kept`, { entityId: record.id, type: "update" });
          close();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "The crop failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger" title="Not cropped">{error}</Notice>}
      <Field label="Asset">
        <Select value={assetId} onChange={(event) => { const next = images.find((item) => item.id === event.target.value); setAssetId(event.target.value); setRect({ x: 0, y: 0, w: next?.width ?? 0, h: next?.height ?? 0 }); }}>
          {images.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.width} × {item.height}</option>)}
        </Select>
      </Field>
      {asset?.src && <img src={asset.src} alt={asset.name} style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6 }} />}
      <Row gap={2} wrap>{field("x", "Left")}{field("y", "Top")}{field("w", "Width")}{field("h", "Height")}</Row>
      <Properties rows={[{ label: "Licence kept", value: asset?.license ?? "" }, { label: "Credit kept", value: asset?.credit ?? "" }]} />
      {busy && <p className="vx-mini">Cropping in this browser…</p>}
    </form>
  );
}

async function batchExport(context: ScreenContext): Promise<void> {
  const doc = openDesign(context) ?? await readShared<DesignDoc>(context, parseDesign);
  const id = context.params.id;
  if (!doc || !id) return;
  const { db } = await import("@/runtime/db");
  const record = await db.records.get(id);
  const base = slug(record?.title ?? "design");
  let written = 0;
  const skipped: string[] = [];
  for (const spec of doc.exports) {
    const page = doc.pages.find((item) => item.nodes[spec.nodeId]);
    const node = page?.nodes[spec.nodeId];
    if (!page || !node) { skipped.push(spec.nodeId); continue; }
    const bounds = absoluteRect(page, node);
    const svg = pageToSvg(page, bounds);
    const name = `${base}-${slug(node.name)}${spec.suffix}`;
    if (spec.format === "svg") downloadText(`${name}.svg`, svg, "image/svg+xml");
    else downloadBlob(`${name}${spec.suffix.includes("@") ? "" : `@${spec.scale}x`}.png`, await svgToPng(svg, bounds.w, bounds.h, spec.scale));
    written += 1;
  }
  await context.mutate.log(`Batch export: ${written} files written${skipped.length ? `, ${skipped.length} skipped` : ""}`, { entityId: id, type: "export" });
  context.toast(
    written ? "Batch export written" : "Nothing exported",
    written ? `${written} file${written === 1 ? "" : "s"} downloaded from this browser, at the scale and format each export setting names.${skipped.length ? ` ${skipped.length} settings point at layers that no longer exist and were skipped.` : ""}` : "No export settings point at a layer. Add them on the Exports tab.",
    written ? "ok" : "blocked",
  );
}

registerApp({
  code: "DESIGN",
  short: "Design",
  name: "Vector Design & UI Studio",
  purpose: "Vector canvas, components and design tokens, all editable in this browser.",
  icon: PenTool,
  nav: [
    { label: "Files", items: [{ label: "Design files", screenId: "ARL-DESIGN-001", icon: FrameIcon }] },
    {
      label: "The open file",
      items: [
        { label: "Canvas", screenId: "ARL-DESIGN-002", icon: MousePointer2 },
        { label: "Layers and pages", screenId: "ARL-DESIGN-003", icon: Square },
        { label: "Vector paths", screenId: "ARL-DESIGN-004", icon: PenTool },
        { label: "Auto layout", screenId: "ARL-DESIGN-005", icon: Grid3x3 },
        { label: "Components", screenId: "ARL-DESIGN-006", icon: Component },
        { label: "Typography and styles", screenId: "ARL-DESIGN-007", icon: TypeIcon },
        { label: "Prototype", screenId: "ARL-DESIGN-008", icon: Play },
        { label: "Assets and export", screenId: "ARL-DESIGN-009", icon: Download },
        { label: "Review", screenId: "ARL-DESIGN-010", icon: FileCode2 },
      ],
    },
  ],
  screens: {
    "ARL-DESIGN-001": {
      id: "ARL-DESIGN-001",
      tabs: (["Recent", "Shared", "Brand", "Templates"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <FilesGallery context={context} lens={lens} />,
      })),
      actions: [
        { id: "New file", label: "New file", placement: "primary", run: (context) => context.openOverlay("File setup") },
        { id: "import SVG", label: "Import SVG", placement: "secondary", run: (context) => context.openOverlay("import issues") },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a file first"),
          run: async (context) => {
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(context.selectedId!);
            if (!record) return;
            const made = await context.mutate.create({
              collection: "designs", title: `${record.title} copy`, status: "draft",
              summary: record.summary, body: parseDesign(record.body),
              fields: { ...record.fields, kind: "file" },
            }, `Duplicated ${record.title}`);
            context.toast("Duplicated", `${made.title} is a separate record with its own history.`);
          },
        },
        {
          id: "fork", label: "Fork from a template", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a template first"),
          run: async (context) => {
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(context.selectedId!);
            if (!record) return;
            const made = await context.mutate.create({
              collection: "designs", title: `${record.title} — ${context.org.shortName}`, status: "draft",
              summary: `Forked from ${record.title}.`, body: parseDesign(record.body),
              fields: { kind: "file", forkedFrom: record.id },
            }, `Forked ${record.title}`);
            context.navigate(context.path("/o/:org/design/files/:id", made.id));
          },
        },
        {
          id: "archive", label: "Archive", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a file first"),
          run: async (context) => {
            await context.mutate.patch(context.selectedId!, { status: "archived" }, { event: "Design file archived" });
            context.toast("Archived", "The record keeps its full document and history; it is out of the Recent tab.");
          },
        },
      ],
      overlays: [
        { id: "File setup", kind: "modal", title: "New design file", width: 520, render: ({ close, ...context }) => <FileSetupForm context={context} close={close} />, footer: submitFooter("design-file-setup", "Create the file") },
        { id: "import issues", kind: "modal", title: "Import an SVG", width: 560, render: ({ close, ...context }) => <ImportSvgOverlay context={context} close={close} /> },
        {
          id: "sharing", kind: "drawer", title: "Sharing", width: 420,
          render: ({ ...context }) => {
            const payload = context.overlayPayload as { id?: string } | undefined;
            return <SharingPanel context={context} id={payload?.id ?? context.selectedId} />;
          },
        },
      ],
    },

    "ARL-DESIGN-002": {
      id: "ARL-DESIGN-002",
      chrome: "full",
      surface: (context) => <CanvasScreen context={context} actions={CANVAS_ACTIONS} />,
      tabs: (["Design", "Prototype", "Inspect", "Comments"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CanvasScreen context={context} actions={CANVAS_ACTIONS} />,
      })),
      actions: CANVAS_ACTIONS,
      overlays: [
        { id: "Insert tools", kind: "modal", title: "Insert", width: 480, render: ({ close }) => <InsertTools close={close} /> },
        { id: "fill picker", kind: "drawer", title: "Fill", width: 380, render: ({ ...context }) => <FillPicker context={context} /> },
        { id: "style inspector", kind: "drawer", title: "Properties", width: 400, render: ({ ...context }) => <InspectorOverlay context={context} /> },
        { id: "export", kind: "modal", title: "Export", width: 520, render: ({ ...context }) => <ExportOverlay context={context} /> },
        { id: "move selection", kind: "modal", title: "Drag the selection", width: 440, render: ({ close, ...context }) => <MoveSelection context={context} close={close} />, footer: submitFooter("design-move-selection", "Move") },
      ],
    },

    "ARL-DESIGN-003": {
      id: "ARL-DESIGN-003",
      tabs: (["Pages", "Layers", "Assets", "Components"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LayersScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Rename", label: "Rename layer", placement: "primary", guard: () => (designUi.get().selected.length === 1 ? undefined : "Select one layer"), run: (context) => context.openOverlay("Layer context") },
        {
          id: "group", label: "Group", placement: "secondary",
          guard: (context) => (designUi.get().selected.length > 1 ? editableSelection(context) : "Select two or more layers"),
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => groupNodes(page, designUi.get().selected).page), "Group layers"),
        },
        {
          id: "reorder", label: "Reorder: bring forwards", placement: "overflow", shortcut: "⌘]",
          guard: editableSelection,
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => designUi.get().selected.reduce((acc, id) => reorder(acc, id, 1), page)), "Bring the selection forwards"),
        },
        {
          id: "send backwards", label: "Send backwards", placement: "overflow", shortcut: "⌘[",
          guard: editableSelection,
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => designUi.get().selected.reduce((acc, id) => reorder(acc, id, -1), page)), "Send the selection backwards"),
        },
        {
          id: "lock", label: "Lock or unlock", placement: "secondary",
          guard: () => (designUi.get().selected.length ? undefined : "Select a layer"),
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => patchNodes(page, designUi.get().selected, (node) => ({ locked: !node.locked }))), "Lock or unlock layers"),
        },
        {
          id: "isolate", label: "Isolate", placement: "overflow",
          guard: () => (designUi.get().selected.length === 1 ? undefined : "Select one layer"),
          run: (context) => {
            designUi.set((current) => ({ ...current, isolate: current.isolate ? undefined : current.selected[0] }));
            context.toast("Isolation", designUi.get().isolate ? "Only that layer and its children are editable." : "Isolation off.");
          },
        },
        {
          id: "select", label: "Select every editable layer", placement: "overflow",
          run: (context) => {
            const doc = openDesign(context);
            if (!doc) return;
            const page = activePage(doc);
            const ids = childrenOf(page, page.id).filter((node) => isEditable(page, node.id)).map((node) => node.id);
            setSelection(ids);
            const skipped = childrenOf(page, page.id).length - ids.length;
            if (skipped > 0) context.toast(`${ids.length} layers selected`, `${skipped} hidden or locked layers were left out so they cannot be edited by accident.`, "info");
          },
        },
        { id: "clear selection", label: "Clear the selection", placement: "overflow", run: () => setSelection([]) },
      ],
      overlays: [
        { id: "Layer context", kind: "modal", title: "Layer", width: 460, render: ({ close, ...context }) => <LayerContext context={context} close={close} /> },
        { id: "move-to-page", kind: "modal", title: "Move to another page", width: 460, render: ({ close, ...context }) => <MoveToPage context={context} close={close} /> },
        { id: "component detach", kind: "modal", title: "Detach an instance", tone: "danger", width: 480, render: ({ close, ...context }) => <DetachInstance context={context} close={close} /> },
      ],
    },

    "ARL-DESIGN-004": {
      id: "ARL-DESIGN-004",
      chrome: "full",
      surface: (context) => <PathScreen context={context} actions={PATH_ACTIONS} />,
      tabs: (["Pen", "Curves", "Boolean", "Offset"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PathScreen context={context} actions={PATH_ACTIONS} />,
      })),
      actions: PATH_ACTIONS,
      overlays: [
        { id: "Point inspector", kind: "drawer", title: "Point", width: 380, render: ({ ...context }) => <PointInspectorOverlay context={context} /> },
        { id: "path operations", kind: "modal", title: "Path operations", width: 520, render: () => (
          <Stack gap={3}>
            <Notice tone="info" title="What each operation does">
              <ul>
                <li><strong>Join</strong> closes the contour, merging the two ends when they are within six pixels.</li>
                <li><strong>Simplify</strong> runs Ramer–Douglas–Peucker over the anchors at a four pixel tolerance and refits smooth tangents.</li>
                <li><strong>Offset</strong> moves each anchor along the local normal.</li>
                <li><strong>Combine</strong> adds a second contour and sets the fill rule; it does not compute intersection geometry.</li>
              </ul>
            </Notice>
            <Notice tone="warning" title="Reversible">Every operation goes through the undo stack, so nothing is destructive.</Notice>
          </Stack>
        ) },
        { id: "stroke editing", kind: "drawer", title: "Stroke", width: 360, render: ({ ...context }) => <StrokeOverlay context={context} /> },
      ],
    },

    "ARL-DESIGN-005": {
      id: "ARL-DESIGN-005",
      tabs: (["Layout", "Constraints", "Responsive", "Grid"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LayoutScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Set size", label: "Set the frame size…", placement: "primary", guard: (context) => (selectedFrame(openDesign(context)) ? undefined : "Select a frame first"), run: (context) => context.openOverlay("Layout inspector") },
        {
          id: "reorder", label: "Reorder: move the child later", placement: "overflow",
          guard: (context) => {
            const doc = openDesign(context);
            if (!doc) return "Open a file first";
            const page = activePage(doc);
            const id = designUi.get().selected[0];
            const parent = id ? parentOf(page, id) : undefined;
            if (!parent || !page.nodes[parent]?.layout) return "Select a child of an auto layout frame";
            return isEditable(page, id) ? undefined : "The layer is hidden or locked";
          },
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => {
            const id = designUi.get().selected[0];
            const parent = parentOf(page, id);
            return parent ? applyAutoLayout(reorder(page, id, 1), parent) : page;
          }), "Move the child later in the layout"),
        },
        {
          id: "reverse", label: "Reverse the frame's children", placement: "overflow",
          guard: (context) => (selectedFrame(openDesign(context))?.layout ? undefined : "Select an auto layout frame"),
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => {
            const frame = selectedFrame(doc);
            if (!frame) return page;
            return applyAutoLayout({ ...page, children: { ...page.children, [frame.id]: [...(page.children[frame.id] ?? [])].reverse() } }, frame.id);
          }), "Reverse the child order"),
        },
        {
          id: "wrap", label: "Wrap or unwrap the frame", placement: "secondary",
          guard: (context) => (selectedFrame(openDesign(context))?.layout ? undefined : "Select an auto layout frame"),
          run: (context) => withDoc(context, (doc) => updatePage(doc, (page) => {
            const frame = selectedFrame(doc);
            if (!frame?.layout) return page;
            return applyAutoLayout(patchNode(page, frame.id, { layout: { ...frame.layout, wrap: !frame.layout.wrap } }), frame.id);
          }), "Toggle wrapping"),
        },
        { id: "preview width", label: "Preview at each breakpoint", placement: "secondary", run: (context) => context.openOverlay("breakpoint preview") },
        {
          id: "apply rules", label: "Apply the layout rules", placement: "overflow",
          guard: (context) => (openDesign(context) ? undefined : "Open a file first"),
          run: async (context) => {
            const frame = selectedFrame(openDesign(context));
            const next = await editShared<DesignDoc>(context, parseDesign, (doc) => updatePage(doc, (page) => (frame
              ? applyAutoLayout(page, frame.id)
              : Object.values(page.nodes).filter((node) => node.layout).reduce((acc, node) => applyAutoLayout(acc, node.id), page))), frame ? `Apply the layout rules to ${frame.name}` : "Apply the layout rules to every frame");
            const doc = next ?? openDesign(context);
            if (!doc) return;
            const page = activePage(doc);
            const conflicts = Object.values(page.nodes).filter((node) => node.layout && (!frame || node.id === frame.id)).flatMap((node) => layoutConflicts(page, node.id));
            if (conflicts.length > 0) context.openOverlay("constraint conflict");
            else context.toast("Layout applied", "Every child sits where its rules put it, with no conflicting constraint.");
          },
        },
      ],
      overlays: [
        { id: "Layout inspector", kind: "drawer", title: "Frame size", width: 380, render: ({ ...context }) => <FrameSizeOverlay context={context} /> },
        { id: "constraint conflict", kind: "modal", title: "Constraint conflicts", tone: "danger", width: 540, render: ({ ...context }) => <ConflictOverlay context={context} /> },
        { id: "breakpoint preview", kind: "modal", title: "Breakpoints side by side", width: 900, render: ({ ...context }) => <BreakpointPreview context={context} /> },
      ],
    },

    "ARL-DESIGN-006": {
      id: "ARL-DESIGN-006",
      tabs: (["Library", "Local", "Variants", "Usage"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ComponentsScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Create component", label: "Create a component", placement: "primary",
          guard: () => (designUi.get().selected.length === 1 ? undefined : "Select one frame or group"),
          run: (context) => withDoc(context, (doc) => createComponent(doc, designUi.get().selected[0], activePage(doc).nodes[designUi.get().selected[0]]?.name ?? "Component").doc, "Create a component"),
        },
        { id: "publish", label: "Publish to the library", placement: "secondary", run: (context) => context.openOverlay("library publish") },
        {
          id: "swap", label: "Swap the selected instance…", placement: "overflow",
          guard: (context) => (selectedComponentId(openDesign(context)) ? undefined : "Select an instance first"),
          run: (context) => context.openOverlay("swap instance"),
        },
        { id: "add property", label: "Add a variant property…", placement: "overflow", run: (context) => context.openOverlay("Variant editor") },
        {
          id: "detach", label: "Detach the selected instance", placement: "overflow", tone: "danger",
          guard: () => (designUi.get().selected.length === 1 ? undefined : "Select one instance"),
          run: (context) => withDoc(context, (doc) => detachInstance(doc, designUi.get().selected[0]), "Detach an instance"),
        },
        {
          id: "inspect uses", label: "Inspect where it is used", placement: "secondary",
          guard: (context) => (selectedComponentId(openDesign(context)) ? undefined : "Select an instance first"),
          run: (context) => context.openOverlay("breaking-change diff"),
        },
        { id: "usage tab", label: "Usage across the file", placement: "overflow", run: (context) => context.setTab("Usage") },
      ],
      overlays: [
        { id: "Variant editor", kind: "modal", title: "Component property", width: 480, render: ({ close, ...context }) => <VariantEditor context={context} close={close} />, footer: submitFooter("variant-editor", "Add the property") },
        { id: "library publish", kind: "modal", title: "Publish to the library", width: 520, render: ({ close, ...context }) => <PublishComponent context={context} close={close} /> },
        { id: "breaking-change diff", kind: "drawer", title: "Instances affected", width: 460, render: ({ ...context }) => <BreakingChange context={context} /> },
        { id: "swap instance", kind: "modal", title: "Swap an instance", width: 480, render: ({ close, ...context }) => <SwapInstance context={context} close={close} /> },
      ],
    },

    "ARL-DESIGN-007": {
      id: "ARL-DESIGN-007",
      tabs: (["Text", "Colour", "Effects", "Variables"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <StylesScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Create style", label: "New text style", placement: "primary",
          run: (context) => withDoc(context, (doc) => ({ ...doc, textStyles: [...doc.textStyles, { id: `ts-${wallMs().toString(36)}`, name: `Style ${doc.textStyles.length + 1}`, family: "Inter", size: 18, weight: 500, lineHeight: 1.4, letterSpacing: 0 }] }), "Create a text style"),
        },
        { id: "edit token", label: "Edit a colour token…", placement: "secondary", guard: (context) => (openDesign(context)?.colors.length ? undefined : "There is no colour token yet"), run: (context) => context.openOverlay("token editor") },
        {
          id: "new token", label: "New colour token", placement: "overflow",
          run: (context) => withDoc(context, (doc) => ({ ...doc, colors: [...doc.colors, { id: `tok-${wallMs().toString(36)}`, name: `Colour ${doc.colors.length + 1}`, value: "#234FE8", group: "Custom" }] }), "Create a colour token"),
        },
        { id: "apply to selection", label: "Apply a style to the selection…", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("apply style") },
        { id: "inspect contrast", label: "Inspect contrast", placement: "secondary", run: (context) => context.openOverlay("style impact") },
      ],
      overlays: [
        { id: "Font browser", kind: "drawer", title: "Fonts", width: 420, render: () => <FontBrowser /> },
        { id: "gradient editor", kind: "modal", title: "Gradient", width: 520, render: ({ ...context }) => <GradientEditor context={context} /> },
        { id: "style impact", kind: "drawer", title: "Style impact", width: 440, render: ({ ...context }) => <StyleImpact context={context} /> },
        { id: "token editor", kind: "modal", title: "Edit a colour token", width: 520, render: ({ close, ...context }) => <TokenEditor context={context} close={close} />, footer: submitFooter("design-token-editor", "Save the token") },
        { id: "apply style", kind: "modal", title: "Apply a style", width: 520, render: ({ close, ...context }) => <ApplyStyle context={context} close={close} /> },
      ],
    },

    "ARL-DESIGN-008": {
      id: "ARL-DESIGN-008",
      tabs: (["Flow", "Interactions", "Preview", "Share"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PrototypeScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Link screens", label: "Link screens…", placement: "primary", guard: (context) => (openDesign(context) ? undefined : "Open a file first"), run: (context) => context.openOverlay("link screens") },
        { id: "link tool", label: "Link on the canvas", placement: "overflow", run: (context) => { setTool("link"); context.navigate(context.path("/o/:org/design/files/:id", context.params.id) + "?tab=Prototype"); } },
        {
          id: "set trigger", label: "Set the trigger…", placement: "secondary",
          guard: (context) => {
            const doc = openDesign(context);
            const node = doc ? activePage(doc).nodes[designUi.get().selected[0]] : undefined;
            if (!node) return "Select a linked layer first";
            return node.link ? undefined : "Link the layer to a screen first";
          },
          run: (context) => context.openOverlay("Interaction editor"),
        },
        { id: "run preview", label: "Run the preview", placement: "secondary", run: (context) => context.setTab("Preview") },
        { id: "publish prototype", label: "Publish the prototype…", placement: "overflow", run: (context) => context.openOverlay("publish prototype") },
      ],
      overlays: [
        { id: "Interaction editor", kind: "drawer", title: "Interaction", width: 420, render: ({ ...context }) => <InteractionOverlay context={context} /> },
        { id: "transition options", kind: "modal", title: "Transitions", width: 520, render: () => (
          <Stack gap={3}>
            <Properties rows={[
              { label: "Instant", value: "No animation; the frame swaps on the next paint." },
              { label: "Dissolve", value: "Opacity crossfade over the duration set on the link." },
              { label: "Slide left / up", value: "The incoming frame translates in; the preview animates opacity only, which is stated on the preview tab." },
              { label: "Smart", value: "Matching layer names would be tweened. Not implemented: the preview falls back to dissolve and says so." },
            ]} />
            <Notice tone="warning" title="Honest about the preview">The local preview animates opacity. Slide and smart transitions are stored on the link for a future renderer but are not played here.</Notice>
          </Stack>
        ) },
        { id: "device preview", kind: "modal", title: "Device and publication", width: 560, render: ({ ...context }) => <DevicePreview context={context} /> },
        { id: "link screens", kind: "modal", title: "Link screens", width: 480, render: ({ close, ...context }) => <LinkScreens context={context} close={close} />, footer: submitFooter("design-link-screens", "Link") },
        { id: "publish prototype", kind: "modal", title: "Publish the prototype", width: 520, render: ({ close, ...context }) => <PublishPrototype context={context} close={close} />, footer: submitFooter("design-publish-prototype", "Queue for publishing") },
      ],
    },

    "ARL-DESIGN-009": {
      id: "ARL-DESIGN-009",
      tabs: (["Assets", "Symbols", "Exports", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AssetsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Replace asset", label: "Replace or add an asset…", placement: "primary", run: (context) => context.openOverlay("Asset picker") },
        {
          id: "crop", label: "Crop an asset…", placement: "overflow",
          guard: (context) => (openDesign(context)?.assets.some((asset) => asset.kind === "image" && asset.src) ? undefined : "No image asset with pixels to crop"),
          run: (context) => context.openOverlay("crop asset"),
        },
        {
          id: "batch export", label: "Batch export", placement: "secondary",
          guard: (context) => (openDesign(context)?.exports.length ? undefined : "Add export settings on the Exports tab first"),
          run: (context) => batchExport(context),
        },
        { id: "export settings", label: "Export settings", placement: "overflow", run: (context) => context.openOverlay("export settings") },
        {
          id: "organize", label: "Organise: sort the assets by name", placement: "overflow",
          run: (context) => withDoc(context, (doc) => ({ ...doc, assets: [...doc.assets].sort((a, b) => a.name.localeCompare(b.name)) }), "Sort the assets by name"),
        },
      ],
      overlays: [
        { id: "Asset picker", kind: "modal", title: "Add an asset", width: 520, render: ({ close, ...context }) => <AssetPicker context={context} close={close} /> },
        { id: "export settings", kind: "modal", title: "Export settings", width: 520, render: ({ ...context }) => <ExportOverlay context={context} /> },
        { id: "license note", kind: "drawer", title: "Licence", width: 400, render: ({ ...context }) => <LicenceNote context={context} /> },
        { id: "crop asset", kind: "modal", title: "Crop an asset", width: 560, render: ({ close, ...context }) => <CropAsset context={context} close={close} />, footer: submitFooter("design-crop-asset", "Crop") },
      ],
    },

    "ARL-DESIGN-010": {
      id: "ARL-DESIGN-010",
      tabs: (["Comments", "Reviews", "Diff", "History"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ReviewScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Annotate", label: "Annotate", placement: "primary", run: (context) => context.openOverlay("Comment editor") },
        { id: "approve", label: "Approve this version", placement: "secondary", run: (context) => context.openOverlay("signoff", { state: "approved" }) },
        { id: "compare", label: "Compare versions", placement: "secondary", run: (context) => context.openOverlay("version compare") },
        {
          id: "assign fixes", label: "Assign the open comments", placement: "overflow",
          run: async (context) => {
            const id = context.params.id;
            const doc = openDesign(context) ?? await readShared<DesignDoc>(context, parseDesign);
            if (!id || !doc) return;
            const { db } = await import("@/runtime/db");
            const record = await db.records.get(id);
            if (!record) return;
            const open = doc.comments.filter((comment) => !comment.resolved && !comment.taskId);
            if (open.length === 0) { context.toast("Nothing to assign", "Every open comment already has a task, or none is open.", "info"); return; }
            const made: Record<string, string> = {};
            for (const comment of open) {
              const task = await context.mutate.create({
                collection: "tasks", title: `Design fix: ${comment.text.slice(0, 60) || "comment"} (${record.title})`,
                status: "todo", summary: `From a comment pin on ${record.title} at ${Math.round(comment.x)}, ${Math.round(comment.y)}.`,
                parentId: record.id, fields: { assignee: context.actor, source: "design review" },
              }, "Design fix task created");
              made[comment.id] = task.id;
            }
            await withDoc(context, (current) => ({ ...current, comments: current.comments.map((comment) => (made[comment.id] ? { ...comment, taskId: made[comment.id] } : comment)) }), "Link the comments to their tasks");
            context.toast("Assigned", `${open.length} task${open.length === 1 ? "" : "s"} created in Projects for ${context.actor}, each linked to this file.`);
          },
        },
      ],
      overlays: [
        { id: "Comment editor", kind: "modal", title: "Comment", width: 480, render: ({ close, ...context }) => <CommentEditor context={context} close={close} /> },
        { id: "version compare", kind: "modal", title: "Version compare", width: 820, render: ({ ...context }) => <ReviewScreen context={context} lens="Diff" /> },
        { id: "signoff", kind: "modal", title: "Record a review decision", width: 520, render: ({ close, ...context }) => <SignOff context={context} close={close} />, footer: submitFooter("design-signoff", "Record the decision") },
      ],
    },
  },
});

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function SharingPanel({ context, id }: { context: ScreenContext; id?: string }) {
  const record = useRecord(id);
  const [people, setPeople] = useState("");
  if (!record) return <Empty title="Select a file first" />;
  const current = String(record.fields.sharedWith ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "File", value: record.title },
        { label: "Owner", value: record.ownerName },
        { label: "Collaborators", value: current.length ? current.join(", ") : "none" },
      ]} />
      <Field label="Add collaborators" hint="Comma separated. They are recorded on the file; no invitation can be sent.">
        <TextInput value={people} onChange={(event) => setPeople(event.target.value)} placeholder="Ravi Patel, Sofia Marín" />
      </Field>
      <Button
        variant="primary"
        disabled={!people.trim()}
        onClick={async () => {
          const next = [...new Set([...current, ...people.split(",").map((item) => item.trim()).filter(Boolean)])];
          await context.mutate.patch(record.id, { fields: { ...record.fields, sharedWith: next.join(", ") } }, { expectRevision: record.revision, event: `Shared ${record.title} with ${people}` });
          setPeople("");
          context.toast("Collaborators recorded", "The file lists them. No mail provider is connected, so no invitation was sent.");
        }}
      >
        Record the collaborators
      </Button>
      <Notice tone="warning" title="No invitation leaves this browser">A real product would email a link. Here the names are stored on the record and the file remains local.</Notice>
    </Stack>
  );
}

function InsertTools({ close }: { close: () => void }) {
  return (
    <Stack gap={3}>
      <p className="ds-prose">Pick a tool, then drag on the canvas. Each tool has a single-key shortcut.</p>
      <Grid>
        {TOOLS.filter((item) => item.tool !== "hand" && item.tool !== "select").map((item) => (
          <Card key={item.tool} span={4}>
            <Button variant="secondary" icon={item.icon} onClick={() => { setTool(item.tool); close(); }}>{item.label} ({item.key})</Button>
          </Card>
        ))}
      </Grid>
      <ShortcutTable
        rows={[
          { keys: "Drag", does: "Draw the shape; hold Shift for a square or circle" },
          { keys: "V", does: "Back to the select tool" },
          { keys: "Arrows", does: "Nudge the selection 1px, with Shift 10px" },
          { keys: "Alt + arrows", does: "Resize the selection without the pointer" },
          { keys: "⌘[ / ⌘]", does: "Send backwards / bring forwards" },
          { keys: "⌘G", does: "Group the selection" },
          { keys: "⌘D", does: "Duplicate" },
          { keys: "Tab", does: "Walk the layers" },
          { keys: "0", does: "Zoom to fit" },
          { keys: "Space + drag", does: "Pan the canvas" },
        ]}
      />
    </Stack>
  );
}

function FillPicker({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      {ui.selected.length === 0 ? <Notice tone="info" title="Select a layer">Then pick a token below.</Notice> : (
        <Grid>
          {doc.colors.map((token) => (
            <Card key={token.id} span={4}>
              <button
                type="button"
                aria-label={`Apply ${token.name}`}
                style={{ width: "100%", height: 48, borderRadius: 8, background: token.value, border: "1px solid var(--border-default)" }}
                onClick={() => handle.edit((current) => updatePage(current, (page) => patchNodes(page, ui.selected, (node) => (node.kind === "text" ? { textStyle: { ...node.textStyle!, color: token.value } } : { fill: { type: "solid", color: token.value } }))), "Apply fill")}
              />
              <span className="vx-mini">{token.name}</span>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

function InspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  return <GeometryInspector handle={handle} context={context} />;
}

function ExportOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const bounds = pageBounds(page);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Page", value: page.name },
        { label: "Bounds", value: `${Math.round(bounds.w)} × ${Math.round(bounds.h)}` },
        { label: "PNG at this scale", value: `${Math.round(bounds.w * scale)} × ${Math.round(bounds.h * scale)} pixels` },
      ]} />
      <Field label="Scale">
        <Select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
          {[1, 2, 3, 4].map((option) => <option key={option} value={option}>{option}×</option>)}
        </Select>
      </Field>
      <Row gap={2} wrap>
        <Button
          variant="primary"
          onClick={() => {
            downloadText(`${slug(record.title)}.svg`, pageToSvg(page, bounds), "image/svg+xml");
            context.toast("SVG written", "Scale and fill rules are preserved; the text keeps its requested font family.");
          }}
        >
          Download SVG
        </Button>
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await svgToPng(pageToSvg(page, bounds), bounds.w, bounds.h, scale);
              downloadBlob(`${slug(record.title)}@${scale}x.png`, blob);
              context.toast("PNG written", `${(blob.size / 1024).toFixed(0)} kB rasterised by this browser.`);
            } catch (error) {
              context.toast("Export failed", error instanceof Error ? error.message : "The browser could not rasterise the document.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Download PNG
        </Button>
      </Row>
      <Notice tone="info" title="What the export contains">
        The SVG is generated from the same renderer the canvas uses, so geometry, gradients, shadows and fill rules match what is on screen. A font this browser does not have is named in the file rather than outlined.
      </Notice>
    </Stack>
  );
}

function LayerContext({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const node = page.nodes[ui.selected[0]];
  if (!node) return <Empty title="Select a layer" />;
  return (
    <Stack gap={3}>
      <Field label="Name">
        <TextInput
          defaultValue={node.name}
          onBlur={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { name: event.target.value })), "Rename layer")}
        />
      </Field>
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { locked: !node.locked })), "Lock layer")}>{node.locked ? "Unlock" : "Lock"}</Button>
        <Button size="sm" variant="secondary" onClick={() => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { visible: !node.visible })), "Hide layer")}>{node.visible ? "Hide" : "Show"}</Button>
        <Button size="sm" variant="secondary" disabled={ui.selected.length < 2} onClick={() => handle.edit((current) => updatePage(current, (p) => groupNodes(p, ui.selected).page), "Group selection")}>Group selection</Button>
        <Button size="sm" variant="secondary" onClick={() => context.openOverlay("move-to-page")}>Move to another page</Button>
        {node.componentId && <Button size="sm" variant="outline-danger" onClick={() => context.openOverlay("component detach")}>Detach instance</Button>}
      </Row>
      <Properties rows={[
        { label: "Kind", value: node.kind },
        { label: "Parent", value: parentOf(page, node.id) === page.id ? "page root" : page.nodes[parentOf(page, node.id) ?? ""]?.name ?? "—" },
        { label: "Children", value: (page.children[node.id] ?? []).length },
      ]} />
      <Button variant="ghost" onClick={close}>Close</Button>
    </Stack>
  );
}

function MoveToPage({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const targets = doc.pages.filter((page) => page.id !== doc.activePageId);
  if (ui.selected.length === 0) return <Empty title="Select a layer first" />;
  return (
    <Stack gap={3}>
      <p className="ds-prose">Moving {ui.selected.length} layer{ui.selected.length === 1 ? "" : "s"} keeps its geometry and children.</p>
      {targets.length === 0 ? <Notice tone="warning" title="Only one page">Add a page first.</Notice> : targets.map((page) => (
        <Button
          key={page.id}
          variant="secondary"
          onClick={() => {
            handle.edit((current) => {
              const source = activePage(current);
              const moving = ui.selected.map((id) => source.nodes[id]).filter(Boolean);
              let from = source;
              let to = current.pages.find((item) => item.id === page.id)!;
              for (const node of moving) {
                const descendantIds = [node.id, ...Object.keys(source.children).filter((key) => key === node.id).flatMap((key) => source.children[key] ?? [])];
                for (const id of descendantIds) {
                  const copy = source.nodes[id];
                  if (copy) to = { ...to, nodes: { ...to.nodes, [id]: copy }, children: { ...to.children, [to.id]: id === node.id ? [...(to.children[to.id] ?? []), id] : (to.children[to.id] ?? []), ...(source.children[id] ? { [id]: source.children[id] } : {}) } };
                }
                from = removeNodes(from, [node.id]);
              }
              return { ...current, pages: current.pages.map((item) => (item.id === from.id ? from : item.id === to.id ? to : item)) };
            }, "Move to another page");
            setSelection([]);
            context.toast("Moved", `The layers are on ${page.name}.`);
            close();
          }}
        >
          Move to {page.name}
        </Button>
      ))}
    </Stack>
  );
}

function DetachInstance({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const instances = Object.values(page.nodes).filter((node) => node.kind === "instance");
  const chosen = page.nodes[ui.selected[0]]?.kind === "instance" ? page.nodes[ui.selected[0]] : instances[0];
  if (!chosen) return <Empty title="No instances on this page">Place a component first.</Empty>;
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Detaching cannot be undone by republishing">
        {chosen.name} becomes ordinary layers. Later changes to the component will not reach it. Undo in the editor still works.
      </Notice>
      <Button
        variant="danger"
        onClick={() => {
          handle.edit((current) => detachInstance(current, chosen.id), "Detach instance");
          context.toast("Detached", `${chosen.name} is now ordinary layers.`);
          close();
        }}
      >
        Detach {chosen.name}
      </Button>
    </Stack>
  );
}

function PointInspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  return <PathInspector handle={handle} context={context} tab="Pen" />;
}

function StrokeOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const node = page.nodes[ui.pathNodeId ?? ui.selected[0]] ?? Object.values(page.nodes).find((item) => item.kind === "path");
  if (!node) return <Empty title="Select a layer" />;
  return (
    <Stack gap={3}>
      <Field label="Stroke colour">
        <input type="color" aria-label="Stroke colour" value={node.stroke?.color ?? "#17223A"} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { stroke: { color: event.target.value, width: node.stroke?.width ?? 1, align: node.stroke?.align ?? "center" } })), "Stroke colour")} />
      </Field>
      <Field label="Width"><TextInput type="number" value={node.stroke?.width ?? 0} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { stroke: { color: node.stroke?.color ?? "#17223A", width: Number(event.target.value), align: node.stroke?.align ?? "center" } })), "Stroke width")} /></Field>
      <Field label="Alignment">
        <Select value={node.stroke?.align ?? "center"} onChange={(event) => handle.edit((current) => updatePage(current, (p) => patchNode(p, node.id, { stroke: { color: node.stroke?.color ?? "#17223A", width: node.stroke?.width ?? 1, align: event.target.value as "center" } })), "Stroke alignment")}>
          {["center", "inside", "outside"].map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Stroke alignment in the export">SVG strokes are centred. Inside and outside alignment is recorded on the layer but the exported file renders a centred stroke; the difference is stated here rather than hidden.</Notice>
    </Stack>
  );
}

function FrameSizeOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const frame = (ui.selected.map((id) => page.nodes[id]).find((node) => node?.kind === "frame")) ?? Object.values(page.nodes).find((node) => node.kind === "frame");
  if (!frame) return <Empty title="No frame on this page" />;
  return (
    <Stack gap={3}>
      <Field label="Width"><TextInput type="number" value={Math.round(frame.w)} onChange={(event) => handle.edit((current) => updatePage(current, (p) => resizeFrame(p, frame.id, Math.max(40, Number(event.target.value)), frame.h)), "Set frame width")} /></Field>
      <Field label="Height"><TextInput type="number" value={Math.round(frame.h)} onChange={(event) => handle.edit((current) => updatePage(current, (p) => resizeFrame(p, frame.id, frame.w, Math.max(40, Number(event.target.value)))), "Set frame height")} /></Field>
      <Notice tone="info" title="Children follow their constraints">Resizing runs each child's horizontal and vertical constraint, then re-runs auto layout if the frame has it.</Notice>
    </Stack>
  );
}

function ConflictOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const page = activePage(handle.doc);
  const frames = Object.values(page.nodes).filter((node) => node.kind === "frame" && node.layout);
  const all = frames.flatMap((frame) => layoutConflicts(page, frame.id).map((note) => ({ frame, note })));
  if (all.length === 0) return <Notice tone="success" title="No conflicts">Every frame with auto layout resolves at its current size.</Notice>;
  return (
    <Stack gap={3}>
      {all.map((item, index) => (
        <Notice key={index} tone="danger" title={item.frame.name} actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handle.edit((current) => updatePage(current, (p) => {
              const frame = p.nodes[item.frame.id];
              if (!frame.layout) return p;
              return applyAutoLayout(patchNode(p, frame.id, { layout: { ...frame.layout, wrap: true } }), frame.id);
            }), "Turn wrapping on")}
          >
            Turn wrapping on
          </Button>
        }>
          {item.note}
        </Notice>
      ))}
    </Stack>
  );
}

function BreakpointPreview({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const page = activePage(doc);
  const frame = Object.values(page.nodes).find((node) => node.kind === "frame");
  if (!frame) return <Empty title="No frame to preview" />;
  return (
    <Stack gap={3}>
      <p className="ds-prose">Each preview resizes a copy of the frame to the breakpoint width and runs the constraints, so the layout shown is computed, not drawn.</p>
      <Row gap={3} wrap>
        {doc.breakpoints.map((breakpoint) => {
          const resized = resizeFrame(page, frame.id, breakpoint.width, frame.h);
          const node = resized.nodes[frame.id];
          return (
            <div key={breakpoint.id} style={{ flex: "1 1 240px" }}>
              <strong>{breakpoint.name}</strong>
              <p className="vx-mini">{breakpoint.width}px</p>
              <svg viewBox={`${node.x} ${node.y} ${node.w} ${node.h}`} style={{ width: "100%", height: 180, background: page.background, border: "1px solid var(--border-default)", borderRadius: 6 }} role="img" aria-label={`${frame.name} at ${breakpoint.width}px`}>
                <NodeView page={resized} node={node} doc={doc} selected={[]} />
              </svg>
            </div>
          );
        })}
      </Row>
    </Stack>
  );
}

function VariantEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  const [name, setName] = useState("state");
  const [values, setValues] = useState("default, hover, disabled");
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const component = doc.components.find((item) => item.id === (activePage(doc).nodes[ui.selected[0]]?.componentId ?? ui.selected[0])) ?? doc.components[0];
  if (!component) return <Empty title="No components yet">Create one from a frame first.</Empty>;
  return (
    <form
      id="variant-editor"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => ({
          ...current,
          components: current.components.map((item) => (item.id === component.id
            ? { ...item, properties: [...item.properties, { name, values: values.split(",").map((value) => value.trim()).filter(Boolean) }] }
            : item)),
        }), "Add component property");
        context.toast("Property added", `${component.name} now offers ${name} to each instance.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Component", value: component.name }, { label: "Instances", value: instancesOf(doc, component.id).length }]} />
      <Field label="Property name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Values" hint="Comma separated"><TextInput value={values} onChange={(event) => setValues(event.target.value)} required /></Field>
    </form>
  );
}

function PublishComponent({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const component = doc.components.find((item) => item.id === (activePage(doc).nodes[ui.selected[0]]?.componentId ?? ui.selected[0])) ?? doc.components.find((item) => !item.published) ?? doc.components[0];
  if (!component) return <Empty title="Nothing to publish" />;
  const uses = instancesOf(doc, component.id);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Component", value: component.name },
        { label: "Current version", value: component.version },
        { label: "Instances in this file", value: uses.length },
        { label: "Pages affected", value: [...new Set(uses.map((use) => use.pageName))].join(", ") || "none" },
      ]} />
      <Notice tone="warning" title="Publishing raises the version">Every instance listed above resolves against the new version. Instances with overrides keep them.</Notice>
      <Button
        variant="primary"
        onClick={() => {
          handle.edit((current) => ({
            ...current,
            components: current.components.map((item) => (item.id === component.id ? { ...item, published: true, version: item.version + 1 } : item)),
          }), "Publish component");
          context.toast("Published", `${component.name} is at version ${component.version + 1} in this file's library. A shared team library needs a backend, which is not connected.`);
          close();
        }}
      >
        Publish version {component.version + 1}
      </Button>
    </Stack>
  );
}

function BreakingChange({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const component = doc.components.find((item) => item.id === (activePage(doc).nodes[ui.selected[0]]?.componentId ?? ui.selected[0]));
  if (!component) return <Empty title="No component selected">Select an instance to see every place its component is used.</Empty>;
  const uses = instancesOf(doc, component.id);
  return (
    <Stack gap={3}>
      <Notice tone={uses.length > 0 ? "warning" : "info"} title={`${uses.length} instance${uses.length === 1 ? "" : "s"} would change`}>
        Each one is listed with the overrides it holds; an override survives the change.
      </Notice>
      {uses.length === 0 ? <Empty title="No instances yet" /> : (
        <Stack gap={2}>
          {uses.map((use) => (
            <Row key={use.node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
              <span className="ds-grow">{use.pageName} · {use.node.name}</span>
              <Pill>{Object.keys(use.node.overrides ?? {}).length} overrides</Pill>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function FontBrowser() {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Checked against this browser">Each family below is tested with the font loading API. There is no font service connected, so nothing can be downloaded on demand.</Notice>
      {FONT_STACK.map((family) => (
        <div key={family} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}>
            <strong className="ds-grow">{family}</strong>
            <Pill tone={fontAvailable(family) ? "success" : "warning"}>{fontAvailable(family) ? "available" : "substituted"}</Pill>
          </Row>
          <p style={{ fontFamily: family, fontSize: 20, margin: "6px 0 0" }}>Handgloves 123</p>
        </div>
      ))}
    </Stack>
  );
}

function GradientEditor({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const ui = useStore(designUi);
  const payload = context.overlayPayload as { from?: string } | undefined;
  const [from, setFrom] = useState(payload?.from ?? "#234FE8");
  const [to, setTo] = useState("#36C5BA");
  const [angle, setAngle] = useState(90);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  return (
    <Stack gap={3}>
      <div style={{ height: 96, borderRadius: 8, background: `linear-gradient(${angle}deg, ${from}, ${to})`, border: "1px solid var(--border-default)" }} />
      <Row gap={3} wrap>
        <Field label="From"><input type="color" aria-label="Gradient start" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><input type="color" aria-label="Gradient end" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <Field label="Angle"><TextInput type="number" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></Field>
      </Row>
      <Button
        variant="primary"
        disabled={ui.selected.length === 0}
        onClick={() => {
          handle.edit((current) => updatePage(current, (page) => patchNodes(page, ui.selected, () => ({ fill: { type: "linear", color: from, to, angle } }))), "Apply gradient");
          context.toast("Gradient applied", `${ui.selected.length} layer${ui.selected.length === 1 ? "" : "s"} updated. The exported SVG carries the same two stops.`);
        }}
      >
        Apply to {ui.selected.length} selected layer{ui.selected.length === 1 ? "" : "s"}
      </Button>
      {ui.selected.length === 0 && <p className="vx-mini">Select a layer on the canvas or the layers screen first.</p>}
    </Stack>
  );
}

function StyleImpact({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const page = activePage(doc);
  const texts = Object.values(page.nodes).filter((node) => node.kind === "text" && node.textStyle);
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Contrast measured against the page background">Computed with the WCAG relative luminance formula, not estimated.</Notice>
      {texts.length === 0 ? <Empty title="No text layers on this page" /> : (
        <Stack gap={2}>
          {texts.map((node) => {
            const ratio = contrastRatio(node.textStyle!.color, page.background);
            const grade = wcagGrade(ratio, node.textStyle!.size >= 24);
            return (
              <Row key={node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <span className="ds-grow">{node.name}</span>
                <Pill>{node.textStyle!.size}px</Pill>
                <Pill tone={grade === "fail" ? "danger" : grade === "AA" ? "warning" : "success"}>{ratio}:1 {grade}</Pill>
              </Row>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function InteractionOverlay({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  return <PrototypePanel handle={handle} context={context} />;
}

function DevicePreview({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  return (
    <Stack gap={3}>
      <Field label="Device frame">
        <Select value={doc.prototype.device} onChange={(event) => handle.edit((current) => ({ ...current, prototype: { ...current.prototype, device: event.target.value } }), "Set device")}>
          {["Desktop 1440", "Tablet 834", "Phone 390", "No frame"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="Publishing a prototype link is not connected">
        A hosted prototype needs a hosting provider. Nothing here can serve a URL. The flow specification can be downloaded from the Share tab, and the preview runs locally.
      </Notice>
      <Properties rows={[
        { label: "Provider", value: "Hosting — not connected" },
        { label: "Local equivalent", value: "Run the preview on the Preview tab, or download the flow specification." },
      ]} />
    </Stack>
  );
}

function AssetPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const [name, setName] = useState("");
  const [license, setLicense] = useState("Company-owned");
  const [credit, setCredit] = useState("");
  const [image, setImage] = useState<{ src: string; width: number; height: number } | null>(null);
  const [replaceId, setReplaceId] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const replacing = handle.doc.assets.find((asset) => asset.id === replaceId);
  return (
    <Stack gap={3}>
      <Field label="What to do" hint="Replacing keeps the asset's id, so every place that uses it shows the new image.">
        <Select value={replaceId} onChange={(event) => { setReplaceId(event.target.value); const target = handle.doc?.assets.find((asset) => asset.id === event.target.value); if (target) { setLicense(target.license); setCredit(target.credit); } }}>
          <option value="">Add a new asset</option>
          {handle.doc.assets.map((asset) => <option key={asset.id} value={asset.id}>Replace {asset.name}</option>)}
        </Select>
      </Field>
      <Field label="Image file" hint="Read in this browser and stored as a data URL on the record.">
        <input
          type="file"
          accept="image/*"
          aria-label="Choose an image"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const src = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.readAsDataURL(file);
            });
            const element = new Image();
            await new Promise<void>((resolve) => { element.onload = () => resolve(); element.onerror = () => resolve(); element.src = src; });
            setImage({ src, width: element.naturalWidth || 0, height: element.naturalHeight || 0 });
            setName(file.name);
          }}
        />
      </Field>
      {image && <img src={image.src} alt="Chosen asset" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 6 }} />}
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Licence">
        <Select value={license} onChange={(event) => setLicense(event.target.value)}>
          {["Company-owned", "Licensed — single use", "Licensed — unlimited", "Creative Commons BY", "Unknown — check before use"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="Credit"><TextInput value={credit} onChange={(event) => setCredit(event.target.value)} placeholder="Photographer or source" /></Field>
      <Button
        variant="primary"
        disabled={!name || (Boolean(replacing) && !image)}
        onClick={() => {
          if (replacing && image) {
            handle.edit((current) => ({
              ...current,
              assets: current.assets.map((asset) => (asset.id === replacing.id ? { ...asset, name, src: image.src, width: image.width, height: image.height, license, credit: credit || "not recorded", kind: "image" } : asset)),
            }), `Replace ${replacing.name}`);
            void context.mutate.log(`Asset ${replacing.name} replaced by ${name}; licence ${license}`, { entityId: record.id, type: "update" });
            close();
            return;
          }
          handle.edit((current) => ({
            ...current,
            assets: [...current.assets, {
              id: `as-${wallMs().toString(36)}`, name, kind: "image",
              src: image?.src, license, credit: credit || "not recorded",
              width: image?.width ?? 0, height: image?.height ?? 0,
            }],
          }), "Add asset");
          context.toast("Asset added", license === "Unknown — check before use" ? "Recorded with its licence flagged as unknown." : "Its licence and credit travel with it.");
          close();
        }}
      >
        {replacing ? `Replace ${replacing.name}` : "Add the asset"}
      </Button>
    </Stack>
  );
}

function LicenceNote({ context }: { context: ScreenContext }) {
  const { record, handle } = useDesignDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const asset = handle.doc.assets.find((item) => item.id === payload?.id) ?? handle.doc.assets[0];
  if (!asset) return <Empty title="No assets yet" />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Asset", value: asset.name },
        { label: "Licence", value: asset.license },
        { label: "Credit", value: asset.credit },
        { label: "Pixels", value: `${asset.width} × ${asset.height}` },
      ]} />
      <Field label="Licence">
        <Select value={asset.license} onChange={(event) => handle.edit((current) => ({ ...current, assets: current.assets.map((item) => (item.id === asset.id ? { ...item, license: event.target.value } : item)) }), "Change licence")}>
          {["Company-owned", "Licensed — single use", "Licensed — unlimited", "Creative Commons BY", "Unknown — check before use"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      {asset.license.startsWith("Unknown") && <Notice tone="danger" title="Do not publish this asset">The licence is unknown. Resolve it before the asset leaves the workspace.</Notice>}
    </Stack>
  );
}

function CommentEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [text, setText] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  const doc = handle.doc;
  const existing = doc.comments.find((item) => item.id === payload?.id) ?? doc.comments[doc.comments.length - 1];
  return (
    <Stack gap={3}>
      {existing ? (
        <>
          <Properties rows={[{ label: "Pinned at", value: `${Math.round(existing.x)}, ${Math.round(existing.y)}` }, { label: "By", value: existing.author }]} />
          <Field label="Comment">
            <TextArea rows={4} value={text || existing.text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <Button
            variant="primary"
            onClick={() => {
              handle.edit((current) => ({ ...current, comments: current.comments.map((item) => (item.id === existing.id ? { ...item, text: text || item.text } : item)) }), "Edit comment");
              context.toast("Comment saved", "It is stored on the page with its position.");
              close();
            }}
          >
            Save the comment
          </Button>
        </>
      ) : (
        <>
          <Field label="Comment"><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></Field>
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              const page = activePage(doc);
              const bounds = pageBounds(page);
              handle.edit((current) => ({
                ...current,
                comments: [...current.comments, {
                  id: `c-${wallMs().toString(36)}`, pageId: current.activePageId,
                  x: bounds.x + bounds.w / 2, y: bounds.y + 40,
                  author: context.actor, at: clockIso(), text, resolved: false,
                }],
              }), "Add comment");
              context.toast("Comment added", "Pinned at the top of the page; drag it on the canvas Comments tab.");
              close();
            }}
          >
            Add the comment
          </Button>
          <p className="vx-mini">To pin a comment exactly, open the canvas, choose the Comments tab and click where the issue is.</p>
        </>
      )}
    </Stack>
  );
}

function SignOff({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, handle } = useDesignDoc(context);
  const preset = (context.overlayPayload as { state?: "approved" | "changes" | "pending" } | undefined)?.state;
  const [state, setState] = useState<"approved" | "changes" | "pending">(preset ?? "approved");
  const [note, setNote] = useState("");
  if (!record || !handle.doc) return <Empty title="Open a file first" />;
  return (
    <form
      id="design-signoff"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        handle.edit((current) => ({
          ...current,
          reviews: [{ id: `r-${wallMs().toString(36)}`, version: record.revision, digest: designDigest(current), by: context.actor, at: clockIso(), state, note }, ...current.reviews],
        }), "Record a review");
        void context.mutate.log(`Design review: ${state} by ${context.actor}, version ${designDigest(handle.doc!)}`, { entityId: record.id, type: "approve" });
        context.toast("Decision recorded", `Bound to version ${designDigest(handle.doc!)} of the design. Any later edit changes it, and the approval then shows as given for an earlier version.`);
        close();
      }}
    >
      <Notice tone="info" title={`This decision binds to version ${designDigest(handle.doc)} (revision ${record.revision})`}>
        It does not carry forward to future edits. The reviews tab shows when an approval no longer covers the current file.
      </Notice>
      <Field label="Decision">
        <Select value={state} onChange={(event) => setState(event.target.value as "approved")}>
          <option value="approved">Approved</option>
          <option value="changes">Changes requested</option>
          <option value="pending">Still reviewing</option>
        </Select>
      </Field>
      <Field label="Note" required><TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required /></Field>
    </form>
  );
}
