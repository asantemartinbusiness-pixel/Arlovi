import { useMemo, useState } from "react";
import { LayoutPanelTop } from "lucide-react";
import { BarChart, Button, Empty, Field, Notice, Pill, Properties, Row, Segmented, Select, Stack } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { addMonths, startOfMonth, wallMs } from "@/platform/clock";
import { actOverlay, type ActInput } from "@/applications/t6kit/act";
import { downloadCsv } from "@/applications/t6kit/kit";
import {
  BLOCK_LABELS, BLOCK_TYPES, auditSite, issueCounts, makeBlock, pageHtml, readSite,
  type BlockType, type SiteModel,
} from "./model";
import { NoSite, SiteFormTester, useSiteRecord } from "./panels";
import { saveSite, useWebUi, BREAKPOINTS, type Breakpoint } from "./state";
import { siteSummary } from "./summary";

/* ====================================================================== *
 * WEB contract actions. Structural writes go through saveSite (undo stack
 * plus expectRevision); anything that would reach a host stops there.
 * ====================================================================== */

const nowIso = (context: ScreenContext) => context.now.toISOString();
const routeSite = (records: Rec[], context: ScreenContext) => {
  const routed = records.find((row) => row.id === context.params.id);
  return routed ? [routed] : records.filter((row) => row.status !== "archived");
};
const site = (record?: Rec): SiteModel => readSite(record);

function activePageId(app: SiteModel): string {
  const ui = useWebUi.getState();
  return app.pages.find((page) => page.id === ui.pageId)?.id ?? app.pages[0]?.id ?? "";
}

/* ------------------------------ Dashboard ------------------------------ */

export function SitePreview({ context }: { context: ScreenContext }) {
  const { record, site: model } = useSiteRecord(context);
  const [pageId, setPageId] = useState("");
  const [width, setWidth] = useState<Breakpoint>("desktop");
  if (!record) return <NoSite />;
  const page = model.pages.find((item) => item.id === pageId) ?? model.pages[0];
  if (!page) return <Empty title="This site has no pages" icon={<LayoutPanelTop size={20} />} />;
  const html = pageHtml(model, page);
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Field label="Page" htmlFor="preview-page">
          <Select id="preview-page" value={page.id} onChange={(event) => setPageId(event.target.value)}>
            {model.pages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.path})</option>)}
          </Select>
        </Field>
        <Segmented label="Width" value={width} onChange={setWidth} options={(Object.keys(BREAKPOINTS) as Breakpoint[]).map((key) => ({ value: key, label: `${BREAKPOINTS[key].label} ${BREAKPOINTS[key].width}px` }))} />
      </Row>
      <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md, 8px)" }}>
        <iframe
          title={`Preview of ${page.name} at ${BREAKPOINTS[width].width} pixels`}
          srcDoc={html}
          sandbox=""
          style={{ width: BREAKPOINTS[width].width, maxWidth: "none", height: 560, border: 0, display: "block", background: "white" }}
        />
      </div>
      <Notice tone="info" title="This is the export, rendered by the browser">The frame shows the exact HTML the export writes, at a real viewport width, sandboxed with scripts off. It is not served anywhere.</Notice>
    </Stack>
  );
}

/* ------------------------------ Page builder ------------------------------ */

export const insertBlock = actOverlay({
  id: "insert panel",
  summary: siteSummary,
  title: "Insert a block",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "The block is written into the page at the position you choose. Dragging from the palette does the same write; this is its keyboard and single-pointer equivalent, and it can be undone.",
  fields: ({ record }) => {
    const app = site(record);
    return [
      { name: "type", label: "Block", kind: "select", initial: useWebUi.getState().lastInserted || "text", options: BLOCK_TYPES.map((type) => ({ value: type, label: BLOCK_LABELS[type] })) },
      { name: "page", label: "Page", kind: "select", initial: activePageId(app), options: app.pages.map((page) => ({ value: page.id, label: page.name })) },
      { name: "position", label: "Where", kind: "select", options: [{ value: "after", label: "After the selected block" }, { value: "end", label: "At the end of the page" }, { value: "start", label: "At the top of the page" }] },
    ];
  },
  blocked: ({ record }) => (record && site(record).pages.length === 0 ? "Add a page first." : undefined),
  submit: "Insert",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const page = app.pages.find((item) => item.id === values.page) ?? app.pages[0];
    const block = makeBlock(values.type as BlockType);
    const selected = page.blocks.findIndex((item) => item.id === useWebUi.getState().selectedBlockId);
    const index = values.position === "start" ? 0 : values.position === "after" && selected >= 0 ? selected + 1 : page.blocks.length;
    const blocks = [...page.blocks];
    blocks.splice(index, 0, block);
    await saveSite(context, record, { ...app, pages: app.pages.map((item) => (item.id === page.id ? { ...item, blocks } : item)) }, `${BLOCK_LABELS[block.type]} block inserted on ${page.name}`);
    useWebUi.getState().setPage(page.id);
    useWebUi.getState().select(block.id);
    useWebUi.getState().noteInsert(block.type);
    return `${BLOCK_LABELS[block.type]} inserted at position ${index + 1} on ${page.name}. Undo is available.`;
  },
});

function selectedBlock(record?: Rec) {
  const app = site(record);
  const ui = useWebUi.getState();
  for (const page of app.pages) {
    const index = page.blocks.findIndex((block) => block.id === ui.selectedBlockId);
    if (index >= 0) return { app, page, block: page.blocks[index], index };
  }
  return undefined;
}

export const resizeBlock = actOverlay({
  id: "resize block",
  summary: siteSummary,
  title: "Resize the block",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  useWatch: () => useWebUi((state) => state.selectedBlockId),
  consequence: () => "Changes how much room the selected block takes: its column count and its vertical padding. Columns collapse to one on a phone and two on a tablet, which the responsive canvas shows at real widths.",
  blocked: ({ record }) => (selectedBlock(record) ? undefined : "Select a block on the canvas first."),
  fields: ({ record }) => {
    const found = selectedBlock(record);
    return [
      { name: "columns", label: "Columns on a desktop", kind: "select", initial: String(found?.block.props.columns ?? 3), options: [1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) })) },
      { name: "padding", label: "Height (padding)", kind: "select", initial: found?.block.props.padding ?? "normal", options: [{ value: "tight", label: "Tight" }, { value: "normal", label: "Normal" }, { value: "roomy", label: "Roomy" }] },
    ];
  },
  submit: "Resize",
  apply: async ({ record, values, context }) => {
    const found = selectedBlock(record);
    if (!record || !found) return;
    const props = { ...found.block.props, columns: Number(values.columns), padding: values.padding as "tight" | "normal" | "roomy" };
    await saveSite(context, record, { ...found.app, pages: found.app.pages.map((page) => (page.id === found.page.id ? { ...page, blocks: page.blocks.map((block) => (block.id === found.block.id ? { ...block, props } : block)) } : page)) }, `${BLOCK_LABELS[found.block.type]} block on ${found.page.name} resized to ${values.columns} columns, ${values.padding} padding`);
    return `Resized. ${values.columns} columns on a desktop, one on a phone.`;
  },
});

export const reorderBlock = actOverlay({
  id: "reorder blocks",
  summary: siteSummary,
  title: "Move the block",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  useWatch: () => useWebUi((state) => state.selectedBlockId),
  consequence: () => "Moves the selected block to the position you choose on its page. This is the keyboard equivalent of dragging its grip, and it can be undone.",
  blocked: ({ record }) => (selectedBlock(record) ? undefined : "Select a block on the canvas first."),
  fields: ({ record }) => {
    const found = selectedBlock(record);
    return [{ name: "to", label: "Move to position", kind: "select", initial: String(found?.index ?? 0), options: (found?.page.blocks ?? []).map((block, index) => ({ value: String(index), label: `${index + 1} — ${index === found?.index ? "where it is now" : `${BLOCK_LABELS[block.type]}: ${block.props.title || "untitled"}`}` })) }];
  },
  submit: "Move it",
  apply: async ({ record, values, context }) => {
    const found = selectedBlock(record);
    if (!record || !found) return;
    const to = Number(values.to);
    if (to === found.index) return { body: "It is already there.", tone: "info" };
    const blocks = [...found.page.blocks];
    const [moved] = blocks.splice(found.index, 1);
    blocks.splice(to, 0, moved);
    await saveSite(context, record, { ...found.app, pages: found.app.pages.map((page) => (page.id === found.page.id ? { ...page, blocks } : page)) }, `${BLOCK_LABELS[moved.type]} block moved from ${found.index + 1} to ${to + 1} on ${found.page.name}`);
    return `Moved to position ${to + 1}.`;
  },
});

/* ------------------------------ Components ------------------------------ */

export const publishComponent = actOverlay({
  id: "publish component",
  summary: siteSummary,
  title: "Publish a component",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "Publishing shares the component with every site in this workspace, so another site can import it. It changes no page by itself.",
  fields: ({ record, context }) => {
    const payload = context.overlayPayload as { componentId?: string } | undefined;
    return [{ name: "component", label: "Component", kind: "select", initial: payload?.componentId, options: site(record).components.map((component) => ({ value: component.id, label: `${component.name}${component.shared ? " (already shared)" : ""}` })) }];
  },
  blocked: ({ record }) => (record && site(record).components.length === 0 ? "Extract a component first." : record && site(record).components.every((component) => component.shared) ? "Every component on this site is already published." : undefined),
  submit: "Publish to the workspace",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const component = app.components.find((item) => item.id === values.component);
    if (!component) throw new Error("Choose a component.");
    if (component.shared) return { body: `${component.name} is already published.`, tone: "info" };
    await saveSite(context, record, { ...app, components: app.components.map((item) => (item.id === component.id ? { ...item, shared: true } : item)) }, `Component ${component.name} published to the workspace`);
    return `${component.name} is published and can be imported by other sites.`;
  },
});

export const importComponents = actOverlay({
  id: "import components",
  summary: siteSummary,
  title: "Import a component",
  collection: "sites",
  noun: "site to import into",
  candidates: routeSite,
  consequence: () => "Copies a published component from another site in this workspace into this one. The copy is local: later changes on either site do not reach the other.",
  fields: ({ record, records }) => [{
    name: "source", label: "Published component", kind: "select",
    options: records.filter((row) => row.id !== record?.id).flatMap((row) => site(row).components.filter((component) => component.shared).map((component) => ({ value: `${row.id}|${component.id}`, label: `${component.name} · from ${row.title}` }))),
  }],
  blocked: ({ record, records }) => (records.filter((row) => row.id !== record?.id).some((row) => site(row).components.some((component) => component.shared)) ? undefined : "No other site in this workspace has published a component yet."),
  submit: "Import",
  apply: async ({ record, records, values, context }) => {
    if (!record) return;
    const [siteId, componentId] = values.source.split("|");
    const source = site(records.find((row) => row.id === siteId)).components.find((component) => component.id === componentId);
    if (!source) throw new Error("Choose a component.");
    const app = site(record);
    const copy = { ...source, id: `c-${wallMs().toString(36)}`, shared: false, usedOn: [], blocks: source.blocks.map((block) => ({ ...block, id: makeBlock(block.type).id })) };
    await saveSite(context, record, { ...app, components: [...app.components, copy] }, `Component ${source.name} imported`);
    return `${source.name} imported with ${copy.blocks.length} blocks.`;
  },
});

function matchesFor(app: SiteModel, componentId: string) {
  const component = app.components.find((item) => item.id === componentId) ?? app.components[0];
  if (!component) return { component, pages: [] };
  return { component, pages: app.pages.filter((page) => page.blocks.some((block) => component.blocks.some((inner) => inner.type === block.type))) };
}

export const updateEverywhere = actOverlay({
  id: "breaking change",
  summary: siteSummary,
  title: "Update everywhere",
  tone: "danger",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequenceTitle: "A global edit, previewed before it is applied",
  consequence: () => "Every block on every page whose type matches a block in the component takes the component's content. The pages are listed below before anything is written, and the whole edit is one undoable step.",
  fields: ({ record, context }) => {
    const payload = context.overlayPayload as { id?: string } | undefined;
    return [{ name: "component", label: "Component", kind: "select", initial: payload?.id, options: site(record).components.map((component) => ({ value: component.id, label: component.name })) }];
  },
  Details: ({ record }: ActInput) => {
    const app = site(record);
    return (
      <Stack gap={2}>
        {app.components.map((component) => {
          const { pages } = matchesFor(app, component.id);
          return <Row key={component.id} gap={2} wrap><strong className="ds-grow">{component.name}</strong><span className="ds-subtle">{pages.map((page) => page.name).join(", ") || "no page"}</span><Pill tone={pages.length > 1 ? "danger" : "warning"}>{`${pages.length} pages would change`}</Pill></Row>;
        })}
      </Stack>
    );
  },
  blocked: ({ record }) => (record && site(record).components.length === 0 ? "Extract a component first." : undefined),
  submit: "Replace on every listed page",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const { component, pages } = matchesFor(app, values.component);
    if (!component) throw new Error("Choose a component.");
    if (pages.length === 0) return { body: "No page uses blocks of these types, so nothing changed.", tone: "info" };
    const byType = new Map(component.blocks.map((block) => [block.type, block.props]));
    const next = { ...app, pages: app.pages.map((page) => (pages.some((item) => item.id === page.id) ? { ...page, blocks: page.blocks.map((block) => (byType.has(block.type) ? { ...block, props: { ...byType.get(block.type)! } } : block)) } : page)), components: app.components.map((item) => (item.id === component.id ? { ...item, usedOn: pages.map((page) => page.name) } : item)) };
    await saveSite(context, record, next, `Component ${component.name} applied to ${pages.length} pages: ${pages.map((page) => page.name).join(", ")}`);
    return `${component.name} applied to ${pages.length} pages. One undo reverses it.`;
  },
});

/* ------------------------------ CMS ------------------------------ */

export const bulkPublish = actOverlay({
  id: "bulk publish",
  summary: siteSummary,
  title: "Publish entries",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "Ticked draft entries become published in one write. An entry with an empty required field is not offered: publishing it would put a gap on a live page.",
  fields: ({ record }) => {
    const app = site(record);
    return app.cms.entries.filter((entry) => entry.status === "draft").map((entry) => {
      const collection = app.cms.collections.find((item) => item.id === entry.collectionId);
      const missing = (collection?.fields ?? []).filter((field) => field.required && !entry.values[field.id]);
      return { name: `entry:${entry.id}`, kind: "checkbox" as const, checked: missing.length === 0, label: `${collection?.name ?? "Entry"} · ${entry.title}${missing.length ? ` — missing ${missing.map((field) => field.name).join(", ")}, will be skipped` : ""}` };
    });
  },
  blocked: ({ record }) => (record && !site(record).cms.entries.some((entry) => entry.status === "draft") ? "There is no draft entry to publish." : undefined),
  submit: "Publish the ticked entries",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const ticked = Object.entries(values).filter(([key, value]) => key.startsWith("entry:") && value).map(([key]) => key.slice(6));
    const publishable = app.cms.entries.filter((entry) => ticked.includes(entry.id)).filter((entry) => {
      const collection = app.cms.collections.find((item) => item.id === entry.collectionId);
      return (collection?.fields ?? []).every((field) => !field.required || entry.values[field.id]);
    }).map((entry) => entry.id);
    if (publishable.length === 0) throw new Error("Nothing ticked can be published; each needs its required fields filled.");
    await saveSite(context, record, { ...app, cms: { ...app.cms, entries: app.cms.entries.map((entry) => (publishable.includes(entry.id) ? { ...entry, status: "published" as const } : entry)) } }, `${publishable.length} entries published`);
    context.setTab("Entries");
    return `${publishable.length} entries published${ticked.length > publishable.length ? `; ${ticked.length - publishable.length} skipped for empty required fields` : ""}.`;
  },
});

export const pickEntry = actOverlay({
  id: "pick entry",
  summary: siteSummary,
  title: "Edit an entry",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "Choose the entry to edit. Its fields open in the entry editor, validated against its collection's schema.",
  fields: ({ record }) => {
    const app = site(record);
    return [{ name: "entry", label: "Entry", kind: "select", options: app.cms.entries.map((entry) => ({ value: entry.id, label: `${app.cms.collections.find((item) => item.id === entry.collectionId)?.name ?? "Entry"} · ${entry.title} (${entry.status})` })) }];
  },
  blocked: ({ record }) => (record && site(record).cms.entries.length === 0 ? "There is no entry yet. Create one first." : undefined),
  submit: "Edit this entry",
  closeOnDone: false,
  apply: async ({ record, values, context }) => {
    const entry = site(record).cms.entries.find((item) => item.id === values.entry);
    if (!entry) throw new Error("Choose an entry.");
    context.openOverlay("entry detail", { id: entry.id, collectionId: entry.collectionId });
  },
});

/* ------------------------------ Navigation ------------------------------ */

export const reorderMenu = actOverlay({
  id: "reorder menu",
  summary: siteSummary,
  title: "Reorder the menu",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "Moves one menu link to a new position. This is the keyboard equivalent of dragging its grip, and the change is undoable.",
  fields: ({ record, context }) => {
    const app = site(record);
    const which = context.tab === "Footer" ? "footer" : "header";
    const links = app.nav[which];
    return [
      { name: "which", label: "Menu", kind: "select", initial: which, options: [{ value: "header", label: "Header" }, { value: "footer", label: "Footer" }] },
      { name: "link", label: "Link", kind: "select", options: [...app.nav.header.map((link) => ({ value: `header|${link.id}`, label: `Header · ${link.label}` })), ...app.nav.footer.map((link) => ({ value: `footer|${link.id}`, label: `Footer · ${link.label}` }))] },
      { name: "to", label: "New position", kind: "select", options: Array.from({ length: Math.max(app.nav.header.length, app.nav.footer.length, links.length) }, (_, index) => ({ value: String(index), label: String(index + 1) })) },
    ];
  },
  blocked: ({ record }) => (record && site(record).nav.header.length + site(record).nav.footer.length < 2 ? "A menu needs two links before there is an order to change." : undefined),
  submit: "Move the link",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const [which, id] = values.link.split("|") as ["header" | "footer", string];
    const links = [...app.nav[which]];
    const from = links.findIndex((link) => link.id === id);
    const to = Math.min(Number(values.to), links.length - 1);
    if (from < 0) throw new Error("Choose a link.");
    if (from === to) return { body: "It is already there.", tone: "info" };
    const [moved] = links.splice(from, 1);
    links.splice(to, 0, moved);
    await saveSite(context, record, { ...app, nav: { ...app.nav, [which]: links } }, `${which === "header" ? "Header" : "Footer"} link ${moved.label} moved from ${from + 1} to ${to + 1}`);
    context.setTab(which === "header" ? "Header" : "Footer");
    return `${moved.label} is now at position ${to + 1}.`;
  },
});

/* ------------------------------ Site forms ------------------------------ */

export function TestSubmissionPanel({ context }: { context: ScreenContext }) {
  const { record, site: model } = useSiteRecord(context);
  const [formId, setFormId] = useState("");
  if (!record) return <NoSite />;
  const form = model.forms.find((item) => item.id === formId) ?? model.forms[0];
  if (!form) return <Empty title="This site has no form" icon={<LayoutPanelTop size={20} />}>Add one on the Forms tab first.</Empty>;
  return (
    <Stack gap={3}>
      <Field label="Site form" htmlFor="test-form">
        <Select id="test-form" value={form.id} onChange={(event) => setFormId(event.target.value)}>
          {model.forms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title={`Written inside ${context.org.name} only`}>The submission is created against the bound form record in this organisation, marked as a test, and checked against the same required-field and consent rules a visitor meets. Nothing is emailed.</Notice>
      <SiteFormTester key={form.id} context={context} formRecordId={form.formRecordId} fields={form.fields} consent={form.consent} />
    </Stack>
  );
}

export const publishSiteForm = actOverlay({
  id: "publish site form",
  summary: siteSummary,
  title: "Publish a site form",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "Publishing fixes the form's current fields as a numbered version inside the workspace, so submissions can be traced to what was asked. Putting it on a live page needs a host, which is not connected; the export carries the published version.",
  boundary: { id: "site.publish", action: "Putting the form on a live page" },
  useWatch: () => useCollection("forms"),
  fields: ({ record }) => [{ name: "form", label: "Site form", kind: "select", options: site(record).forms.map((form) => ({ value: form.id, label: `${form.name}${form.publishedVersion ? ` (v${form.publishedVersion} published)` : " (never published)"}` })) }],
  blocked: ({ record, watched, context }) => {
    const app = site(record);
    if (record && app.forms.length === 0) return "Add a site form first.";
    const bound = ((watched as Rec[] | undefined) ?? []).map((row) => row.id);
    const unbound = app.forms.filter((form) => !form.formRecordId || !bound.includes(form.formRecordId));
    if (record && unbound.length === app.forms.length) return `No site form is bound to a form record in ${context.org.name}, so a submission would have nowhere to go.`;
    return undefined;
  },
  submit: "Publish the version",
  apply: async ({ record, values, context, watched }) => {
    if (!record) return;
    const app = site(record);
    const form = app.forms.find((item) => item.id === values.form);
    if (!form) throw new Error("Choose a form.");
    if (!form.formRecordId || !((watched as Rec[] | undefined) ?? []).some((row) => row.id === form.formRecordId)) throw new Error(`${form.name} is not bound to a form record in ${context.org.name}. Bind it on the Forms tab first.`);
    if (form.fields.length === 0) throw new Error(`${form.name} has no fields.`);
    const version = (form.publishedVersion ?? 0) + 1;
    await saveSite(context, record, { ...app, forms: app.forms.map((item) => (item.id === form.id ? { ...item, publishedVersion: version, publishedAt: nowIso(context), publishedBy: context.actor } : item)) }, `Site form ${form.name} published as version ${version}`);
    return { body: `${form.name} v${version} is published in the workspace. It reaches a live page only through the export until a host is connected.`, tone: "ok" };
  },
});

/* ------------------------------ Quality ------------------------------ */

export async function retestAudit(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const sites = await repo.listByCollection(context.org.id, "sites");
  const forms = await repo.listByCollection(context.org.id, "forms");
  const record = sites.find((item) => item.id === context.params.id) ?? sites[0];
  if (!record) { context.toast("No site", "Create a site first.", "blocked"); return; }
  const counts = issueCounts(auditSite(readSite(record), Object.fromEntries(forms.map((form) => [form.id, form.title]))));
  const before = record.fields.lastAuditAt ? { fail: Number(record.fields.auditFail ?? 0), warn: Number(record.fields.auditWarn ?? 0) } : undefined;
  await context.mutate.patch(record.id, {
    fields: { ...record.fields, lastAuditAt: nowIso(context), auditFail: counts.fail, auditWarn: counts.warn, auditPass: counts.pass, previousAuditFail: before?.fail ?? "", previousAuditWarn: before?.warn ?? "" },
  }, { expectRevision: record.revision, event: `Audit re-run: ${counts.fail} failing, ${counts.warn} to review, ${counts.pass} passing${before ? ` (was ${before.fail} failing, ${before.warn} to review)` : ""}` });
  context.toast("Retested", before ? `Failing ${before.fail} → ${counts.fail}, to review ${before.warn} → ${counts.warn}.` : `${counts.fail} failing, ${counts.warn} to review. This is the first recorded run.`, counts.fail ? "blocked" : "ok");
}

/* ------------------------------ Publishing ------------------------------ */

export const rollbackDeployment = actOverlay({
  id: "rollback deployment",
  summary: siteSummary,
  title: "Roll back a deployment",
  tone: "danger",
  collection: "sites",
  noun: "site",
  candidates: routeSite,
  consequence: () => "The chosen attempt is marked rolled back to the most recent earlier export. Nothing is served, so the rollback changes the deployment history and the export you would take away, not a live server.",
  fields: ({ record }) => [{ name: "deployment", label: "Deployment", kind: "select", options: [...site(record).deployments].filter((entry) => entry.state !== "rolled_back").sort((a, b) => b.at.localeCompare(a.at)).map((entry) => ({ value: entry.id, label: `${entry.at.slice(0, 16).replace("T", " ")} · ${entry.environment} · ${entry.state}` })) }],
  blocked: ({ record }) => {
    const deployments = site(record).deployments;
    if (record && deployments.filter((entry) => entry.state !== "rolled_back").length === 0) return "No deployment attempt is recorded to roll back.";
    if (record && !deployments.some((entry) => entry.state === "exported")) return "No earlier successful export is recorded, so there is nothing to roll back to.";
    return undefined;
  },
  submit: "Roll back",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = site(record);
    const entry = app.deployments.find((item) => item.id === values.deployment);
    const previous = app.deployments.filter((item) => item.id !== entry?.id && item.state === "exported" && item.at < (entry?.at ?? "")).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!entry || !previous) throw new Error("There is no earlier export before that attempt to roll back to.");
    await saveSite(context, record, { ...app, deployments: app.deployments.map((item) => (item.id === entry.id ? { ...item, state: "rolled_back" as const, note: `Rolled back to the export from ${previous.at}.` } : item)) }, `Deployment ${entry.id} rolled back to the export from ${previous.at}`);
    return "Rolled back. The history shows it.";
  },
});

/* ------------------------------ Analytics ------------------------------ */

function useSiteSubmissions(context: ScreenContext) {
  const { record, site: model, forms } = useSiteRecord(context);
  const submissions = useCollection("submissions");
  const bound = useMemo(() => model.pages.flatMap((page) => page.blocks).filter((block) => block.type === "form").map((block) => block.props.formId).filter(Boolean), [model]);
  return { record, model, forms, rows: submissions.filter((row) => bound.includes(String(row.parentId ?? ""))) };
}

export function ChartBuilder({ context }: { context: ScreenContext }) {
  const { record, rows, forms } = useSiteSubmissions(context);
  const events = useEvents(record?.id);
  const { now, org } = useWorkspace();
  const [measure, setMeasure] = useState("submissions");
  const [group, setGroup] = useState("month");
  if (!record) return <NoSite />;
  const months = [5, 4, 3, 2, 1, 0].map((back) => startOfMonth(addMonths(now, -back)));
  const points = measure === "events-by-type"
    ? Object.entries(events.reduce<Record<string, number>>((map, event) => ({ ...map, [event.type]: (map[event.type] ?? 0) + 1 }), {})).map(([label, value]) => ({ label, value }))
    : group === "form"
      ? forms.filter((form) => rows.some((row) => row.parentId === form.id)).map((form) => ({ label: form.title, value: rows.filter((row) => row.parentId === form.id).length }))
      : months.map((start) => {
        const end = addMonths(start, 1);
        const source = measure === "submissions" ? rows.map((row) => row.at ?? row.createdAt) : events.map((event) => event.at);
        return { label: start.toLocaleString(org.locale, { month: "short" }), value: source.filter((at) => new Date(at) >= start && new Date(at) < end).length };
      });
  const title = measure === "submissions" ? `Form submissions by ${group}` : measure === "events" ? "Editing and publishing events by month" : "Site events by kind";
  return (
    <Stack gap={3}>
      <Row gap={2} wrap>
        <Field label="Measure" htmlFor="chart-measure">
          <Select id="chart-measure" value={measure} onChange={(event) => setMeasure(event.target.value)}>
            <option value="submissions">Form submissions (counted from records)</option>
            <option value="events">Site events (audit log)</option>
            <option value="events-by-type">Site events by kind</option>
            <option value="visits" disabled>Visits — unavailable, nothing counts them</option>
          </Select>
        </Field>
        {measure === "submissions" && (
          <Field label="Grouped by" htmlFor="chart-group">
            <Select id="chart-group" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="month">Month</option>
              <option value="form">Form</option>
            </Select>
          </Field>
        )}
      </Row>
      <BarChart title={title} height={220} format={(value) => String(Math.round(value))} series={[{ name: title, points }]} footer="Every bar is a count of records or audit events in this workspace. No visit or rate is estimated." />
      <Button variant="secondary" onClick={async () => {
        await context.mutate.patch(record.id, { fields: { ...record.fields, savedChart: JSON.stringify({ measure, group, title }) } }, { expectRevision: record.revision, event: `Analytics chart saved: ${title}` });
        context.toast("Chart saved", `${title} is saved on the site.`);
      }}>Save this chart on the site</Button>
    </Stack>
  );
}

export function ComparePeriods({ context }: { context: ScreenContext }) {
  const { record, rows } = useSiteSubmissions(context);
  const { now } = useWorkspace();
  const [days, setDays] = useState("30");
  if (!record) return <NoSite />;
  const span = Number(days) * 86_400_000;
  const count = (from: number, to: number) => rows.filter((row) => { const at = new Date(row.at ?? row.createdAt).getTime(); return at >= from && at < to; }).length;
  const current = count(now.getTime() - span, now.getTime() + 1);
  const previous = count(now.getTime() - 2 * span, now.getTime() - span);
  const change = previous === 0 ? undefined : Math.round(((current - previous) / previous) * 100);
  return (
    <Stack gap={3}>
      <Field label="Period" htmlFor="cmp-days">
        <Select id="cmp-days" value={days} onChange={(event) => setDays(event.target.value)}>
          <option value="7">Last 7 days against the 7 before</option>
          <option value="30">Last 30 days against the 30 before</option>
          <option value="90">Last 90 days against the 90 before</option>
        </Select>
      </Field>
      <Properties rows={[
        { label: "Submissions, this period", value: <span className="ds-num">{String(current)}</span> },
        { label: "Submissions, the period before", value: <span className="ds-num">{String(previous)}</span> },
        { label: "Change", value: change === undefined ? <Pill tone="warning">no earlier submissions to compare</Pill> : <span className="ds-num">{`${change > 0 ? "+" : ""}${change}%`}</span> },
        { label: "Visits and conversion rate", value: <Pill tone="warning">unavailable — nothing counts visits</Pill> },
      ]} />
      <Notice tone="info" title="Counted, not modelled">Both figures are counts of submission records created through a form on this site.</Notice>
    </Stack>
  );
}

export async function exportAnalytics(context: ScreenContext): Promise<void> {
  const repo = await import("@/platform/repo");
  const sites = await repo.listByCollection(context.org.id, "sites");
  const record = sites.find((item) => item.id === context.params.id) ?? sites[0];
  if (!record) return;
  const model = readSite(record);
  const bound = model.pages.flatMap((page) => page.blocks).filter((block) => block.type === "form").map((block) => block.props.formId).filter(Boolean);
  const submissions = (await repo.listByCollection(context.org.id, "submissions")).filter((row) => bound.includes(String(row.parentId ?? "")));
  const months = [5, 4, 3, 2, 1, 0].map((back) => startOfMonth(addMonths(context.now, -back)));
  downloadCsv(`${context.org.slug}-site-analytics.csv`, ["month", "submissions", "visits"], months.map((start) => {
    const end = addMonths(start, 1);
    return [start.toISOString().slice(0, 7), submissions.filter((row) => { const at = new Date(row.at ?? row.createdAt); return at >= start && at < end; }).length, "unavailable"];
  }));
  await context.mutate.log(`Site analytics exported for ${record.title}: ${submissions.length} submissions; visits unavailable.`, { entityId: record.id, type: "export" });
  context.toast("Exported", "Monthly submission counts written to CSV. Visits are marked unavailable rather than filled in.");
}
