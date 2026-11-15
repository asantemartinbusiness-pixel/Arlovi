import { useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  Columns3, Image as ImageIcon, LayoutPanelTop, Link2, ListOrdered, PanelBottom,
  PoundSterling, Rows3, Smartphone, Tablet, Monitor, Type, Undo2,
} from "lucide-react";
import {
  Button, Card, Checkbox, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented,
  Select, Stack, Tabs, TextArea, TextInput, Toolbar, ToolbarSeparator,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { MiniField, PaletteChip, ReorderArea, SortableRow, move, downloadFile } from "@/applications/t6kit/kit";
import {
  BLOCK_HINTS, BLOCK_LABELS, BLOCK_TYPES, contrastRatio, makeBlock, pageHtml, readSite,
  type Block, type BlockType, type SiteModel,
} from "./model";
import { BlockView } from "./render";
import { BREAKPOINTS, saveSite, undoSite, useWebUi, type Breakpoint } from "./state";

const PALETTE_ICONS: Record<BlockType, React.ReactNode> = {
  hero: <LayoutPanelTop size={15} />,
  columns: <Columns3 size={15} />,
  text: <Type size={15} />,
  image: <ImageIcon size={15} />,
  gallery: <Rows3 size={15} />,
  form: <ListOrdered size={15} />,
  pricing: <PoundSterling size={15} />,
  footer: <PanelBottom size={15} />,
};

export function useSite(context: ScreenContext): { record?: Rec; site: SiteModel; forms: Rec[]; formNames: Record<string, string> } {
  const sites = useCollection("sites");
  const routed = useRecord(context.params.id);
  const record = routed?.collection === "sites" ? routed : sites[0];
  const forms = useCollection("forms");
  const site = useMemo(() => readSite(record), [record]);
  const formNames = useMemo(() => Object.fromEntries(forms.map((form) => [form.id, form.title])), [forms]);
  return { record, site, forms, formNames };
}

export function activePage(site: SiteModel, pageId: string) {
  return site.pages.find((page) => page.id === pageId) ?? site.pages[0];
}

/* ====================================================================== *
 * ARL-WEB-003 — Visual Page Builder (full chrome)
 * ====================================================================== */

export function PageBuilder({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSite(context);
  const ui = useWebUi();
  const page = activePage(site, ui.pageId);
  const breakpoint = ui.breakpoint;
  const width = BREAKPOINTS[breakpoint].width;
  const selected = page?.blocks.find((block) => block.id === ui.selectedBlockId);
  const [busy, setBusy] = useState(false);

  if (!record || !page) {
    return <Empty title="No site in this workspace" icon={<LayoutPanelTop size={20} />}>Create a site in the website directory first.</Empty>;
  }

  async function writePages(nextPages: SiteModel["pages"], label: string) {
    setBusy(true);
    try { await saveSite(context, record!, { ...site, pages: nextPages }, label); } finally { setBusy(false); }
  }

  function replaceBlocks(blocks: Block[], label: string) {
    return writePages(site.pages.map((item) => (item.id === page!.id ? { ...item, blocks } : item)), label);
  }

  function insertBlock(type: BlockType, index?: number) {
    const block = makeBlock(type);
    const at = index ?? (selected ? page!.blocks.findIndex((item) => item.id === selected.id) + 1 : page!.blocks.length);
    const blocks = [...page!.blocks];
    blocks.splice(at, 0, block);
    ui.select(block.id);
    ui.noteInsert(type);
    void replaceBlocks(blocks, `Inserted a ${BLOCK_LABELS[type].toLowerCase()} block into ${page!.name}`);
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    const paletteType = (event.active.data.current as { palette?: string } | undefined)?.palette;
    if (paletteType) {
      const index = overId ? page!.blocks.findIndex((block) => block.id === overId) : page!.blocks.length;
      insertBlock(paletteType as BlockType, index < 0 ? page!.blocks.length : index);
      return;
    }
    if (!overId || activeId === overId) return;
    const from = page!.blocks.findIndex((block) => block.id === activeId);
    const to = page!.blocks.findIndex((block) => block.id === overId);
    if (from < 0 || to < 0) return;
    void replaceBlocks(move(page!.blocks, from, to), `Moved ${BLOCK_LABELS[page!.blocks[from].type].toLowerCase()} to position ${to + 1} on ${page!.name}`);
  }

  function editProps(blockId: string, patch: Partial<Block["props"]>) {
    const blocks = page!.blocks.map((block) => (block.id === blockId ? { ...block, props: { ...block.props, ...patch } } : block));
    void replaceBlocks(blocks, `Edited a ${BLOCK_LABELS[page!.blocks.find((b) => b.id === blockId)?.type ?? "text"].toLowerCase()} block on ${page!.name}`);
  }

  function removeBlock(blockId: string) {
    void replaceBlocks(page!.blocks.filter((block) => block.id !== blockId), `Removed a block from ${page!.name}`);
    ui.select("");
  }

  const blockCanvas = (
    <div className="t6-pane" data-kind="canvas" key="canvas">
      <div className="t6-device">
        <div style={{ width: "100%", maxWidth: width }}>
          <div className="t6-device-label">
            <Pill tone="info">{BREAKPOINTS[breakpoint].label} · laid out at {width}px</Pill>
            <span>{BREAKPOINTS[breakpoint].note} The frame fits the pane; the Responsive tab renders at the true width.</span>
          </div>
          <div className="t6-device-frame">
            <div className="t6-render" style={{ background: site.theme.paper, color: site.theme.ink }}>
              <ReorderArea ids={page.blocks.map((block) => block.id)} onDragEnd={onDragEnd} label={`Blocks on ${page.name}`}>
                {page.blocks.map((block, index) => (
                  <SortableRow
                    key={block.id}
                    id={block.id}
                    name={`${BLOCK_LABELS[block.type]} block`}
                    index={index}
                    count={page.blocks.length}
                    selected={block.id === ui.selectedBlockId}
                    onSelect={() => ui.select(block.id)}
                    onMove={(from, to) => void replaceBlocks(move(page.blocks, from, to), `Moved ${BLOCK_LABELS[block.type].toLowerCase()} to position ${to + 1} on ${page.name}`)}
                    plain
                  >
                    {({ handle }) => (
                      <div data-canvas-block={block.type} style={{ position: "relative" }}>
                        <div style={{ position: "absolute", inset: "4px 4px auto auto", zIndex: 2, display: "flex", gap: 4, alignItems: "center", background: "var(--bg-surface)", color: "var(--fg-default)", borderRadius: "var(--radius-sm)", padding: 2, border: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontSize: "var(--text-2xs)", paddingInline: 4, fontWeight: 600 }}>{BLOCK_LABELS[block.type]}</span>
                          {handle}
                        </div>
                        <BlockView block={block} width={width} theme={site.theme} formName={formNames[block.props.formId]} selected={block.id === ui.selectedBlockId} onSelect={() => ui.select(block.id)} onEdit={(patch) => editProps(block.id, patch)} />
                      </div>
                    )}
                  </SortableRow>
                ))}
              </ReorderArea>
              {page.blocks.length === 0 && (
                <div style={{ padding: 28, color: site.theme.ink }}>
                  <strong>This page has no blocks yet.</strong>
                  <p style={{ fontSize: 13, opacity: 0.7 }}>Use the palette on the left: press a block to add it at the end, or drag it onto a position.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const palette = (
    <div className="t6-pane" key="palette">
      <Stack gap={4}>
        <div>
          <h3 style={{ fontSize: "var(--text-md)" }}>Blocks</h3>
          <p className="ds-subtle">Press to add after the selection, or drag onto a position. Both paths write the same model.</p>
        </div>
        <div className="t6-palette">
          {BLOCK_TYPES.map((type) => (
            <PaletteChip key={type} type={type} label={BLOCK_LABELS[type]} hint={BLOCK_HINTS[type]} icon={PALETTE_ICONS[type]} onInsert={() => insertBlock(type)} />
          ))}
        </div>
        <Notice tone="info" title="Keyboard equivalent">
          Each block has <strong>Move up</strong> and <strong>Move down</strong> buttons, and the grip handle picks the block up with Space and moves it with the arrow keys.
        </Notice>
      </Stack>
    </div>
  );

  const tree = (
    <div className="t6-pane" data-kind="inspector" key="tree">
      <Stack gap={4}>
        <div>
          <h3 style={{ fontSize: "var(--text-md)" }}>Element tree</h3>
          <p className="ds-subtle">{page.blocks.length} blocks on {page.name}</p>
        </div>
        <Stack gap={1}>
          {page.blocks.map((block, index) => (
            <button
              key={block.id}
              type="button"
              className="ds-record-card"
              aria-current={block.id === ui.selectedBlockId ? "true" : undefined}
              onClick={() => ui.select(block.id)}
            >
              <Row gap={2}>
                <span className="ds-subtle ds-num" style={{ width: 18 }}>{index + 1}</span>
                <span className="ds-grow ds-truncate" style={{ textAlign: "start" }}>{BLOCK_LABELS[block.type]}</span>
                {block.id === ui.selectedBlockId && <Pill tone="accent">Selected</Pill>}
              </Row>
              <span className="ds-subtle ds-truncate">{block.props.title || block.props.body || BLOCK_HINTS[block.type]}</span>
            </button>
          ))}
        </Stack>
        {selected ? (
          <BlockInspector block={selected} site={site} onEdit={(patch) => editProps(selected.id, patch)} onRemove={() => removeBlock(selected.id)} forms={formNames} />
        ) : (
          <Notice tone="neutral">Select a block to edit its content.</Notice>
        )}
      </Stack>
    </div>
  );

  const styleEditor = (
    <div className="t6-pane" key="styleEditor">
      <ThemeEditor site={site} onChange={(theme) => void saveSite(context, record, { ...site, theme }, "Theme changed")} />
    </div>
  );

  const styleInspector = (
    <div className="t6-pane" data-kind="inspector" key="styleInspector">
      {selected
        ? <BlockStyleInspector block={selected} onEdit={(patch) => editProps(selected.id, patch)} />
        : <Empty title="No block selected" icon={<Type size={18} />}>Pick a block on the canvas to change its tone, alignment and padding.</Empty>}
    </div>
  );

  const responsive = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="responsive">
      <Stack gap={4}>
        <Notice tone="info" title="Rendered by the browser, not redrawn by hand">
          Each frame below is the exported HTML for {page.name} loaded in a real document at that width, so the layout you see is the layout a visitor gets.
        </Notice>
        <Row gap={4} wrap style={{ alignItems: "flex-start" }}>
          {(Object.keys(BREAKPOINTS) as Breakpoint[]).map((key) => (
            <div key={key} style={{ flex: `0 1 ${BREAKPOINTS[key].width / 2.2}px`, minWidth: 260 }}>
              <div className="t6-device-label"><strong>{BREAKPOINTS[key].label}</strong><span>{BREAKPOINTS[key].width}px</span></div>
              <div className="t6-device-frame">
                <iframe
                  className="t6-frame"
                  title={`${page.name} at ${BREAKPOINTS[key].width} pixels`}
                  srcDoc={pageHtml(site, page)}
                  style={{ width: BREAKPOINTS[key].width, height: 520, transform: `scale(${Math.min(1, 420 / BREAKPOINTS[key].width)})`, transformOrigin: "top left" }}
                />
              </div>
            </div>
          ))}
        </Row>
      </Stack>
    </div>
  );

  const interactions = (
    <div className="t6-pane" data-kind="canvas" style={{ gridColumn: "1 / -1" }} key="interactions">
      <Interactions site={site} pageId={page.id} formNames={formNames} onEdit={editProps} />
    </div>
  );

  const panes = context.tab === "Build" ? [palette, blockCanvas, tree]
    : context.tab === "Style" ? [styleEditor, blockCanvas, styleInspector]
      : context.tab === "Responsive" ? [responsive]
        : [interactions];

  return (
    <div className="t6-shell">
      <div className="t6-shell-bar">
        <Toolbar label="Page builder">
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}`)}>Site dashboard</Button>
          <ToolbarSeparator />
          <MiniField label="Page">
            <Select value={page.id} onChange={(event) => ui.setPage(event.target.value)} aria-label="Page being edited">
              {site.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </MiniField>
          <ToolbarSeparator />
          <Segmented
            label="Breakpoint"
            value={breakpoint}
            onChange={(value) => ui.setBreakpoint(value)}
            options={[
              { value: "mobile" as Breakpoint, label: "Mobile" },
              { value: "tablet" as Breakpoint, label: "Tablet" },
              { value: "desktop" as Breakpoint, label: "Desktop" },
            ]}
          />
          <span aria-hidden="true" style={{ display: "inline-flex", gap: 4, color: "var(--fg-subtle)" }}>
            {breakpoint === "mobile" ? <Smartphone size={15} /> : breakpoint === "tablet" ? <Tablet size={15} /> : <Monitor size={15} />}
          </span>
        </Toolbar>
        <span className="ds-grow" />
        <Row gap={2}>
          <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={ui.undoDepth(record.id) === 0} busy={busy} onClick={async () => {
            const done = await undoSite(context, record);
            context.toast(done ? "Undone" : "Nothing to undo", done ? "The previous structure was written back to the record." : "No builder change is on the undo stack for this site.");
          }}>Undo{ui.undoDepth(record.id) > 0 ? ` (${ui.undoDepth(record.id)})` : ""}</Button>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("insert panel")}>Insert</Button>
          <Button size="sm" variant="secondary" onClick={() => {
            downloadFile(`${context.org.slug}-${page.path === "/" ? "index" : page.path.replace(/\//g, "")}.html`, pageHtml(site, page), "text/html");
            context.toast("Page exported", `${page.name} downloaded as HTML from this browser.`);
          }}>Export page</Button>
        </Row>
      </div>
      <div className="t6-shell-tabs">
        <Tabs
          label="Builder views"
          value={context.tab}
          onChange={context.setTab}
          items={[{ id: "Build", label: "Build" }, { id: "Style", label: "Style" }, { id: "Responsive", label: "Responsive" }, { id: "Interactions", label: "Interactions" }]}
        />
      </div>
      <div className="t6-shell-body" data-panes={panes.length === 1 ? "1" : panes.length === 2 ? "2" : undefined}>
        {panes}
      </div>
    </div>
  );
}

/* ------------------------------ Inspectors ------------------------------ */

export function BlockInspector({
  block, site, onEdit, onRemove, forms,
}: { block: Block; site: SiteModel; onEdit: (patch: Partial<Block["props"]>) => void; onRemove?: () => void; forms: Record<string, string> }) {
  const needsItems = block.type === "columns" || block.type === "gallery" || block.type === "footer" || block.type === "form";
  return (
    <Stack gap={3}>
      <Row gap={2}><strong className="ds-grow">{BLOCK_LABELS[block.type]} block</strong><Pill tone="neutral">{block.id}</Pill></Row>
      {block.type !== "footer" && (
        <Field label="Heading"><TextInput value={block.props.title} onChange={(event) => onEdit({ title: event.target.value })} /></Field>
      )}
      {["hero", "text", "image", "form", "footer", "pricing", "columns"].includes(block.type) && (
        <Field label={block.type === "image" ? "Caption" : "Body"}><TextArea rows={3} value={block.props.body} onChange={(event) => onEdit({ body: event.target.value })} /></Field>
      )}
      {(block.type === "image" || block.type === "gallery") && (
        <Field label="Alternative description" required hint="Read aloud in place of the figure. An empty value is reported by the accessibility audit.">
          <TextInput value={block.props.alt} invalid={!block.props.alt.trim()} onChange={(event) => onEdit({ alt: event.target.value })} />
        </Field>
      )}
      {needsItems && (
        <Field label={block.type === "form" ? "Field labels" : block.type === "footer" ? "Footer links" : "Items"} hint="One per line.">
          <TextArea rows={4} value={block.props.items.join("\n")} onChange={(event) => onEdit({ items: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} />
        </Field>
      )}
      {(block.type === "columns" || block.type === "gallery") && (
        <Field label="Columns on desktop" hint="Mobile always collapses to one column; tablet caps at two.">
          <Select value={String(block.props.columns)} onChange={(event) => onEdit({ columns: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
          </Select>
        </Field>
      )}
      {block.type === "pricing" && (
        <Stack gap={2}>
          {block.props.plans.map((plan, index) => (
            <Row key={`${plan.name}-${index}`} gap={2}>
              <TextInput aria-label={`Plan ${index + 1} name`} value={plan.name} onChange={(event) => onEdit({ plans: block.props.plans.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })} />
              <TextInput aria-label={`Plan ${index + 1} price`} value={plan.price} align="end" onChange={(event) => onEdit({ plans: block.props.plans.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)) })} />
            </Row>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onEdit({ plans: [...block.props.plans, { name: "New plan", price: "", note: "Ex VAT" }] })}>Add plan</Button>
        </Stack>
      )}
      {block.type === "form" && (
        <Field label="Bound form" hint="Submissions are written against this form record.">
          <Select value={block.props.formId} onChange={(event) => onEdit({ formId: event.target.value })}>
            <option value="">Not bound</option>
            {Object.entries(forms).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </Select>
        </Field>
      )}
      {["hero", "text", "form"].includes(block.type) && (
        <Row gap={2}>
          <Field label="Action label"><TextInput value={block.props.ctaLabel} onChange={(event) => onEdit({ ctaLabel: event.target.value })} /></Field>
          <Field label="Action target">
            <Select value={block.props.ctaTarget} onChange={(event) => onEdit({ ctaTarget: event.target.value })}>
              <option value="">No target</option>
              {site.pages.map((page) => <option key={page.id} value={page.path}>{page.path}</option>)}
            </Select>
          </Field>
        </Row>
      )}
      {onRemove && <Button size="sm" variant="outline-danger" onClick={onRemove}>Remove this block</Button>}
    </Stack>
  );
}

export function BlockStyleInspector({ block, onEdit }: { block: Block; onEdit: (patch: Partial<Block["props"]>) => void }) {
  return (
    <Stack gap={4}>
      <div>
        <h3 style={{ fontSize: "var(--text-md)" }}>{BLOCK_LABELS[block.type]} style</h3>
        <p className="ds-subtle">These three properties are the whole style surface of a block, so nothing is set that the export cannot carry.</p>
      </div>
      <Field label="Tone">
        <Segmented
          label="Block tone"
          value={block.props.tone}
          onChange={(tone) => onEdit({ tone })}
          options={[{ value: "plain" as const, label: "Plain" }, { value: "soft" as const, label: "Soft" }, { value: "accent" as const, label: "Accent" }]}
        />
      </Field>
      <Field label="Alignment">
        <Segmented
          label="Block alignment"
          value={block.props.align}
          onChange={(align) => onEdit({ align })}
          options={[{ value: "start" as const, label: "Start" }, { value: "center" as const, label: "Centre" }]}
        />
      </Field>
      <Field label="Padding">
        <Segmented
          label="Block padding"
          value={block.props.padding}
          onChange={(padding) => onEdit({ padding })}
          options={[{ value: "tight" as const, label: "Tight" }, { value: "normal" as const, label: "Normal" }, { value: "roomy" as const, label: "Roomy" }]}
        />
      </Field>
      <Notice tone="info">Padding and type size are reduced automatically under 640px; the canvas shows the reduced values when the mobile breakpoint is selected.</Notice>
    </Stack>
  );
}

export function ThemeEditor({ site, onChange }: { site: SiteModel; onChange: (theme: SiteModel["theme"]) => void }) {
  const theme = site.theme;
  const bodyContrast = contrastRatio(theme.ink, theme.paper);
  const accentContrast = contrastRatio("#ffffff", theme.accent);
  return (
    <Stack gap={4}>
      <div>
        <h3 style={{ fontSize: "var(--text-md)" }}>Theme</h3>
        <p className="ds-subtle">One set of tokens drives the canvas, the responsive frames and the HTML export.</p>
      </div>
      <Field label="Typeface">
        <Select value={theme.font} onChange={(event) => onChange({ ...theme, font: event.target.value as SiteModel["theme"]["font"] })}>
          {["Inter", "Source Serif", "IBM Plex Mono"].map((font) => <option key={font} value={font}>{font}</option>)}
        </Select>
      </Field>
      <Row gap={2} wrap>
        <Field label="Accent"><TextInput type="color" value={theme.accent} onChange={(event) => onChange({ ...theme, accent: event.target.value })} style={{ minWidth: 72 }} /></Field>
        <Field label="Ink"><TextInput type="color" value={theme.ink} onChange={(event) => onChange({ ...theme, ink: event.target.value })} style={{ minWidth: 72 }} /></Field>
        <Field label="Paper"><TextInput type="color" value={theme.paper} onChange={(event) => onChange({ ...theme, paper: event.target.value })} style={{ minWidth: 72 }} /></Field>
      </Row>
      <Field label={`Corner radius · ${theme.radius}px`}>
        <input type="range" min={0} max={28} value={theme.radius} aria-label="Corner radius" onChange={(event) => onChange({ ...theme, radius: Number(event.target.value) })} />
      </Field>
      <Field label={`Type scale · ${theme.scale}%`}>
        <input type="range" min={85} max={125} step={5} value={theme.scale} aria-label="Type scale" onChange={(event) => onChange({ ...theme, scale: Number(event.target.value) })} />
      </Field>
      <Properties rows={[
        { label: "Body contrast", value: bodyContrast === null ? "Unavailable" : <Pill tone={bodyContrast >= 4.5 ? "success" : bodyContrast >= 3 ? "warning" : "danger"}>{bodyContrast.toFixed(2)}:1</Pill> },
        { label: "White on accent", value: accentContrast === null ? "Unavailable" : <Pill tone={accentContrast >= 4.5 ? "success" : accentContrast >= 3 ? "warning" : "danger"}>{accentContrast.toFixed(2)}:1</Pill> },
      ]} />
      <p className="ds-subtle">Ratios are computed from the WCAG 2.1 relative luminance of the chosen colours, not estimated.</p>
    </Stack>
  );
}

function Interactions({
  site, pageId, formNames, onEdit,
}: { site: SiteModel; pageId: string; formNames: Record<string, string>; onEdit: (blockId: string, patch: Partial<Block["props"]>) => void }) {
  const page = site.pages.find((item) => item.id === pageId) ?? site.pages[0];
  const withCta = page.blocks.filter((block) => block.props.ctaLabel || block.type === "form");
  return (
    <Grid>
      <Card span={7} title="Interactions on this page" subtitle="Everything a static export can carry on its own">
        {withCta.length === 0 ? (
          <Empty title="No interactive block on this page" icon={<Link2 size={20} />}>Add a call to action to a hero or text block, or embed a form.</Empty>
        ) : (
          <Stack gap={3}>
            {withCta.map((block) => (
              <div key={block.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}><strong className="ds-grow">{BLOCK_LABELS[block.type]}</strong><Pill tone={block.type === "form" ? "info" : "neutral"}>{block.type === "form" ? "Form submit" : "Link"}</Pill></Row>
                <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                  <Field label="Label"><TextInput value={block.props.ctaLabel} onChange={(event) => onEdit(block.id, { ctaLabel: event.target.value })} /></Field>
                  <Field label="Goes to">
                    <Select value={block.props.ctaTarget} onChange={(event) => onEdit(block.id, { ctaTarget: event.target.value })}>
                      <option value="">Nowhere yet</option>
                      {site.pages.map((item) => <option key={item.id} value={item.path}>{item.path}</option>)}
                    </Select>
                  </Field>
                </Row>
                {block.type === "form" && (
                  <p className="ds-subtle" style={{ marginBlockStart: 6 }}>
                    {block.props.formId && formNames[block.props.formId]
                      ? `A submission creates a record against ${formNames[block.props.formId]}.`
                      : "This embed has no bound form, so a submission has nowhere to go."}
                  </p>
                )}
              </div>
            ))}
          </Stack>
        )}
      </Card>
      <Card span={5} title="What needs a runtime" subtitle="Stated rather than implied">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Anchor and page links", value: <Pill tone="success">Carried by the export</Pill> },
            { label: "Responsive menu", value: <Pill tone="success">Carried by the export</Pill> },
            { label: "Form delivery", value: <Pill tone="warning">Needs a server</Pill> },
            { label: "Scroll animation", value: <Pill tone="warning">Not modelled</Pill> },
            { label: "Analytics events", value: <Pill tone="warning">No provider connected</Pill> },
          ]} />
          <Notice tone="warning" title="The exported form posts nowhere">
            Inside this workspace a submission creates a record. In the exported HTML the form has no endpoint, and the export says so in the page itself rather than failing silently.
          </Notice>
          <Checkbox label="Show the consent line above the submit button" defaultChecked />
        </Stack>
      </Card>
    </Grid>
  );
}
