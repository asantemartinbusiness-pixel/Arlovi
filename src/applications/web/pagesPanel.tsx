import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, FilePlus2, Trash2 } from "lucide-react";
import { Button, Checkbox, Field, Notice, Pill, Row, Select, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useSite } from "./builder";
import {
  addPage, deletePage, duplicatePage, freePath, inboundReferences, movePage, pageProblem, slugPath, updatePage,
} from "./pages";
import type { Page } from "./model";
import { saveSite, useWebUi } from "./state";

/* ====================================================================== *
 * Page manager (drawer on the page editor and the site dashboard). Add,
 * rename, move address, mark ready, duplicate, reorder and delete pages.
 * Each change says what else it touches before it is saved, and goes
 * through saveSite so the editor's Undo can reverse it.
 * ====================================================================== */

export function PageManager({ context }: { context: ScreenContext }) {
  const { record, site } = useSite(context);
  const ui = useWebUi();
  const [editingId, setEditingId] = useState<string>(ui.pageId || "");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!record) return <Notice tone="warning" title="No site">This site is not in the workspace.</Notice>;
  const editing = site.pages.find((page) => page.id === editingId) ?? site.pages[0];

  async function commit(run: () => { site: typeof site; notes: string[]; pageId: string }, label: string) {
    setError("");
    let change;
    try { change = run(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return; }
    setBusy(true);
    try {
      await saveSite(context, record!, change.site, label);
      setEditingId(change.pageId);
      ui.setPage(change.pageId);
      context.toast("Pages updated", change.notes.join(" "));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <div className="web-pages-head">
        <p className="ds-subtle">{site.pages.length} {site.pages.length === 1 ? "page" : "pages"} in {record.title}. The order here is the sitemap order.</p>
        <Button size="sm" variant="primary" icon={<FilePlus2 size={14} />} onClick={() => { setAdding(true); setError(""); }}>Add a page</Button>
      </div>
      {error && <Notice tone="danger" title="Not saved">{error}</Notice>}
      {adding && <AddPageForm key="add" site={site} busy={busy} onCancel={() => setAdding(false)}
        onAdd={(name, path, addToMenu) => void commit(() => addPage(site, name, path, { addToMenu }), `Added page ${name} at ${path}`).then(() => setAdding(false))} />}
      <ol className="web-pages-list" aria-label="Pages in this site">
        {site.pages.map((page, index) => {
          const refs = inboundReferences(site, page.path);
          return (
            <li key={page.id} data-current={page.id === editing?.id ? "true" : undefined}>
              <button type="button" className="web-pages-pick" aria-pressed={page.id === editing?.id} onClick={() => { setEditingId(page.id); setError(""); }}>
                <strong>{page.name}</strong>
                <span><code>{page.path}</code> · {page.blocks.length} {page.blocks.length === 1 ? "block" : "blocks"} · {refs.menu + refs.buttons} inbound</span>
              </button>
              <Pill tone={page.status === "published" ? "info" : "neutral"}>{page.status === "published" ? "ready" : "draft"}</Pill>
              <div className="web-pages-order">
                <Button size="sm" variant="ghost" aria-label={`Move ${page.name} up`} iconOnly disabled={busy || index === 0} icon={<ArrowUp size={14} />}
                  onClick={() => void commit(() => ({ site: movePage(site, page.id, -1), notes: [`${page.name} moved up.`], pageId: page.id }), `Moved page ${page.name} up`)} />
                <Button size="sm" variant="ghost" aria-label={`Move ${page.name} down`} iconOnly disabled={busy || index === site.pages.length - 1} icon={<ArrowDown size={14} />}
                  onClick={() => void commit(() => ({ site: movePage(site, page.id, 1), notes: [`${page.name} moved down.`], pageId: page.id }), `Moved page ${page.name} down`)} />
              </div>
            </li>
          );
        })}
      </ol>
      {editing && <PageEditor key={`${editing.id}-${record.revision}`} page={editing} site={site} busy={busy}
        onSave={(patch) => void commit(() => updatePage(site, editing.id, patch), `Page ${editing.name} settings changed`)}
        onDuplicate={() => void commit(() => duplicatePage(site, editing.id), `Duplicated page ${editing.name}`)}
        onDelete={(redirectTo) => void commit(() => deletePage(site, editing.id, { redirectTo }), `Deleted page ${editing.name}`)}
        onOpen={() => { ui.setPage(editing.id); context.closeOverlay(); context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/builder`); }}
      />}
    </Stack>
  );
}

function AddPageForm({ site, busy, onAdd, onCancel }: {
  site: ReturnType<typeof useSite>["site"]; busy: boolean;
  onAdd: (name: string, path: string, addToMenu: boolean) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [addToMenu, setAddToMenu] = useState(true);
  const effectivePath = pathTouched ? path : freePath(site, slugPath(name));
  const problem = name.trim() ? pageProblem(site, name, effectivePath) : undefined;
  return (
    <form className="web-pages-card" aria-label="Add a page" onSubmit={(event) => { event.preventDefault(); if (!problem && name.trim()) onAdd(name, effectivePath, addToMenu); }}>
      <Field label="Page name" htmlFor="web-add-page-name"><TextInput id="web-add-page-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} placeholder="Opening hours" /></Field>
      <Field label="Address" htmlFor="web-add-page-path" hint="Filled from the name until you change it." error={problem}>
        <TextInput id="web-add-page-path" value={effectivePath} onChange={(event) => { setPathTouched(true); setPath(event.target.value); }} />
      </Field>
      <Checkbox label="Add a link to the header menu" checked={addToMenu} onChange={(event) => setAddToMenu(event.target.checked)} />
      <Row gap={2}>
        <Button type="submit" variant="primary" size="sm" busy={busy} disabled={!name.trim() || Boolean(problem)}>Add the page</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </Row>
    </form>
  );
}

function PageEditor({ page, site, busy, onSave, onDuplicate, onDelete, onOpen }: {
  page: Page; site: ReturnType<typeof useSite>["site"]; busy: boolean;
  onSave: (patch: { name: string; path: string; status: Page["status"] }) => void;
  onDuplicate: () => void; onDelete: (redirectTo: string) => void; onOpen: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [path, setPath] = useState(page.path);
  const [status, setStatus] = useState<Page["status"]>(page.status);
  const [confirming, setConfirming] = useState(false);
  const others = site.pages.filter((item) => item.id !== page.id);
  const [redirectTo, setRedirectTo] = useState(others.find((item) => item.path === "/")?.path ?? others[0]?.path ?? "");
  const problem = pageProblem(site, name, path, page.id);
  const refs = useMemo(() => inboundReferences(site, page.path), [site, page.path]);
  const moved = path.trim() !== page.path;
  const dirty = name.trim() !== page.name || moved || status !== page.status;

  return (
    <section className="web-pages-card" aria-label={`Page settings for ${page.name}`}>
      <Row gap={2} wrap>
        <h3 className="ds-grow">{page.name}</h3>
        <Button size="sm" variant="secondary" onClick={onOpen}>Edit blocks</Button>
      </Row>
      <Field label="Page name" htmlFor="web-page-name"><TextInput id="web-page-name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Address" htmlFor="web-page-path" error={problem && !problem.startsWith("Give") ? problem : undefined}
        hint={moved && !problem ? `${page.path} will redirect here (301). ${refs.menu} menu ${refs.menu === 1 ? "link" : "links"} and ${refs.buttons} ${refs.buttons === 1 ? "button" : "buttons"} will follow.` : undefined}>
        <TextInput id="web-page-path" value={path} onChange={(event) => setPath(event.target.value)} />
      </Field>
      <Field label="State" htmlFor="web-page-status" hint="Ready pages are the ones you intend to publish. Publishing itself happens under Domains & publishing.">
        <Select id="web-page-status" value={status} onChange={(event) => setStatus(event.target.value === "published" ? "published" : "draft")}>
          <option value="draft">Draft</option>
          <option value="published">Ready to publish</option>
        </Select>
      </Field>
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" busy={busy} disabled={!dirty || Boolean(problem)} onClick={() => onSave({ name, path, status })}>Save page settings</Button>
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} disabled={busy} onClick={onDuplicate}>Duplicate</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy || site.pages.length <= 1}
          title={site.pages.length <= 1 ? "A site keeps at least one page" : undefined} onClick={() => setConfirming(true)}>Delete…</Button>
      </Row>
      {confirming && (
        <Notice tone="danger" title={`Delete ${page.name}?`}>
          <Stack gap={2}>
            <span>{refs.menu} menu {refs.menu === 1 ? "link points" : "links point"} here and will be removed. {refs.buttons} {refs.buttons === 1 ? "button points" : "buttons point"} here.</span>
            <Field label="Send visitors of the old address to" htmlFor="web-page-delete-redirect">
              <Select id="web-page-delete-redirect" value={redirectTo} onChange={(event) => setRedirectTo(event.target.value)}>
                <option value="">Nowhere (the address will fail)</option>
                {others.map((item) => <option key={item.id} value={item.path}>{item.name} ({item.path})</option>)}
              </Select>
            </Field>
            <Row gap={2}>
              <Button size="sm" variant="danger" busy={busy} onClick={() => { setConfirming(false); onDelete(redirectTo); }}>Delete the page</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
            </Row>
          </Stack>
        </Notice>
      )}
    </section>
  );
}
