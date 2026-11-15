import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft, Bold, Braces, CheckCheck, ChevronDown, ChevronUp, CornerDownRight, FileDown, FileText,
  Highlighter, Image as ImageIcon, Italic, Link2, List, ListOrdered, MessageSquare, Minus, Quote,
  Redo2, Search, Strikethrough, Table as TableIcon, Underline, Undo2, Upload,
} from "lucide-react";
import {
  BarChart, Button, ButtonGroup, Card, Checkbox, DataGrid, Empty, Field, Grid, InspectorSection,
  Meter, Notice, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, Switch, Tabs,
  TextArea, TextInput, Tool, Toolbar, ToolbarSeparator,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { capabilityById } from "@/platform/capability";
import { freshness } from "@/platform/clock";
import { downloadFile } from "@/runtime/db";
import type { Rec } from "@/domain/types";
import {
  addComment, blockIndex, blockText, commentDrifted, documentStats, emptyBlock, findAll,
  headingLevel, insertBlockAfter, isTextBlock, moveSection, nextId, openSuggestions, outline,
  paginate, readDoc, removeBlock, replaceAll, resolveSuggestion, sectionSpan, setBlockType,
  setLink, setStyle, structureWarnings, toHtml, toMarkdown, toPlainText, visibleText,
  type Block, type BlockType, type DocModel, type DocRange, type Hit, type MarkType,
} from "./model";
import { DocumentCanvas, type EditIntent } from "./canvas";
import { SAVE_LABEL, SAVE_TONE, useDocEditor, type DocEditor } from "./state";
import "./docs.css";

/* ====================================================================== *
 * DOCS — Documents & Knowledge Writing
 *
 * A controlled rich-text engine with its own document model. No
 * `document.execCommand` anywhere; every edit is a command over the model in
 * `./model.ts`, exercised by the unit tests in tests/unit/docs-model.test.ts.
 * ====================================================================== */

/* ----------------------------- Shared pieces ----------------------------- */

function useDocument(context: ScreenContext): Rec | undefined {
  const fromRoute = useRecord(context.params.id);
  const all = useCollection("documents");
  return fromRoute ?? all.find((record) => !record.tags.includes("recovered")) ?? all[0];
}

function SaveBadge({ editor, context }: { editor: DocEditor; context: ScreenContext }) {
  return (
    <Row gap={2}>
      <Pill tone={SAVE_TONE[editor.saveState]} dot>{SAVE_LABEL[editor.saveState]}</Pill>
      {editor.lastSavedAt && editor.saveState !== "conflict" && (
        <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{context.relative(editor.lastSavedAt)}</span>
      )}
    </Row>
  );
}

function ConflictNotice({ editor }: { editor: DocEditor }) {
  if (!editor.conflict) return null;
  return (
    <Notice
      tone="danger"
      title="This document changed somewhere else while you were typing"
      actions={<>
        <Button size="sm" variant="primary" onClick={() => void editor.recoverToVersion()}>Keep both as a recovery version</Button>
        <Button size="sm" variant="secondary" onClick={() => void editor.resolveConflict("mine")}>Overwrite with mine</Button>
        <Button size="sm" variant="ghost" onClick={() => void editor.resolveConflict("theirs")}>Discard mine</Button>
      </>}
    >
      Autosave was refused because the stored revision moved on. Nothing has been overwritten. A recovery version keeps your text as a separate document linked to this one.
    </Notice>
  );
}

const BLOCK_OPTIONS: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Body text" },
  { value: "heading1", label: "Heading 1" },
  { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" },
  { value: "bulletItem", label: "Bulleted list" },
  { value: "numberItem", label: "Numbered list" },
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code" },
];

function currentBlock(editor: DocEditor): Block | undefined {
  const id = editor.selection?.head.blockId;
  if (!id) return editor.model.blocks[0];
  return editor.model.blocks[blockIndex(editor.model, id)];
}

function OutlineTree({
  model, activeId, onJump, onMove, collapsedIds, onToggle,
}: {
  model: DocModel;
  activeId?: string;
  onJump: (blockId: string) => void;
  onMove?: (blockId: string, direction: -1 | 1) => void;
  collapsedIds?: string[];
  onToggle?: (blockId: string) => void;
}) {
  const nodes = useMemo(() => outline(model), [model]);
  if (nodes.length === 0) {
    return <Empty title="No headings yet" icon={<AlignLeft size={18} />}>Apply heading 1 to 3 in the Write ribbon and the outline builds itself.</Empty>;
  }
  let hiddenUnder: number | null = null;
  return (
    <ul className="dx-tree">
      {nodes.map((node) => {
        if (hiddenUnder !== null && node.level > hiddenUnder) return null;
        hiddenUnder = null;
        const isCollapsed = collapsedIds?.includes(node.blockId) ?? false;
        if (isCollapsed) hiddenUnder = node.level;
        return (
          <li key={node.blockId} className={`dx-tree-level-${node.level}`}>
            <div className="dx-tree-row">
              {onToggle && (
                <Button
                  size="sm" variant="ghost" iconOnly
                  aria-label={isCollapsed ? `Expand ${node.text}` : `Collapse ${node.text}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => onToggle(node.blockId)}
                >
                  {isCollapsed ? <CornerDownRight size={14} /> : <ChevronDown size={14} />}
                </Button>
              )}
              <button
                type="button"
                className="dx-tree-link"
                aria-current={node.blockId === activeId ? "true" : undefined}
                onClick={() => onJump(node.blockId)}
              >
                <span className="ds-truncate">{node.text}</span>
                <span className="dx-tree-meta">{node.comments > 0 ? `${node.comments} open · ` : ""}{node.words}w</span>
              </button>
              {onMove && (
                <>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${node.text} earlier`} onClick={() => onMove(node.blockId, -1)}><ChevronUp size={14} /></Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${node.text} later`} onClick={() => onMove(node.blockId, 1)}><ChevronDown size={14} /></Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ====================================================================== *
 * ARL-DOCS-001 — Document Library
 * ====================================================================== */

type LibraryTab = "Recent" | "My docs" | "Shared" | "Templates" | "Archive";

function DocumentLibrary({ context, tab }: { context: ScreenContext; tab: LibraryTab }) {
  const data = useCollections(["documents", "templates"]);
  const { org, actor, now } = useWorkspace();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string>("All folders");

  const documents = data.documents.filter((record) => !record.tags.includes("recovered"));
  const folders = ["All folders", ...new Set(documents.map((record) => String(record.fields.folder ?? "Unfiled")))];

  const rows = useMemo(() => {
    let list = documents;
    if (tab === "Recent") list = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
    if (tab === "My docs") list = documents.filter((record) => record.ownerName === actor);
    if (tab === "Shared") list = documents.filter((record) => record.ownerName !== actor && record.status !== "archived");
    if (tab === "Archive") list = documents.filter((record) => record.status === "archived");
    if (tab === "Templates") list = data.templates.filter((record) => record.fields.kind === "document");
    if (tab !== "Archive") list = list.filter((record) => record.status !== "archived" || tab === "Recent");
    if (folder !== "All folders" && tab !== "Templates") list = list.filter((record) => String(record.fields.folder ?? "Unfiled") === folder);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((record) => {
        const confidential = record.fields.confidential === true;
        const haystack = confidential
          ? `${record.title} ${record.tags.join(" ")}`.toLowerCase()
          : `${record.title} ${record.summary} ${record.tags.join(" ")} ${toPlainText(readDoc(record.body, record.ownerName, record.updatedAt)).slice(0, 4000)}`.toLowerCase();
        return haystack.includes(needle);
      });
    }
    return list;
  }, [documents, data.templates, tab, folder, query, actor]);

  const confidentialHidden = query.trim().length > 0 && documents.some((record) => record.fields.confidential === true);

  if (tab === "Templates") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Templates are governed here and edited in Templates">
          A template change never rewrites a document that was already created from it. Open Templates to edit a master and see what it would affect.
        </Notice>
        <Grid>
          {rows.map((record) => (
            <Card key={record.id} span={4} eyebrow="TEMPLATE" prov="human" title={record.title} subtitle={record.summary}
              actions={<Pill tone={record.status === "published" ? "success" : "neutral"}>{record.status}</Pill>}
              footer={<>
                <Button size="sm" variant="primary" onClick={() => context.openOverlay("New doc", { templateId: record.id })}>Use</Button>
                <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/docs/templates`)}>Open master</Button>
              </>}
            >
              <Properties rows={[
                { label: "Scope", value: String(record.fields.scope ?? "company") },
                { label: "Used by", value: `${Number(record.fields.usedBy ?? 0)} documents` },
              ]} />
            </Card>
          ))}
          {rows.length === 0 && <Empty title="No document templates" icon={<FileText size={20} />} />}
        </Grid>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Search" hint="Confidential documents match on title and tags only.">
          <TextInput aria-label="Search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles and text" />
        </Field>
        <Field label="Folder">
          <Select aria-label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
            {folders.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
      </Row>

      {confidentialHidden && (
        <Notice tone="warning" title="Confidential documents are excluded from full-text preview">
          A document marked confidential is matched on its title and tags. Its body is not read into the search index or shown in a preview, so a broad search cannot surface a clause that was meant to stay in the document.
        </Notice>
      )}

      {rows.length === 0 ? (
        <Empty
          title={tab === "Archive" ? "Nothing archived" : "No documents here"}
          icon={<FileText size={20} />}
          action={<Button variant="primary" onClick={() => context.openOverlay("New doc")}>New document</Button>}
        >
          {tab === "Shared" ? "Documents owned by someone else appear here." : "Create a document, or start from a governed template."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${tab} documents`}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.navigate(`/o/${org.slug}/docs/documents/${id}`)}
          columns={[
            {
              key: "title", header: "Document", primary: true, sortValue: (row) => row.title, filterValue: (row) => row.title,
              cell: (row) => (
                <Row gap={2}>
                  <FileText size={15} aria-hidden />
                  <span className="ds-truncate">{row.title}</span>
                  {row.fields.confidential === true && <Pill tone="warning">Confidential</Pill>}
                </Row>
              ),
            },
            { key: "folder", header: "Folder", cell: (row) => String(row.fields.folder ?? "Unfiled"), sortValue: (row) => String(row.fields.folder ?? ""), hideBelow: 900 },
            { key: "owner", header: "Owner", cell: (row) => row.ownerName, sortValue: (row) => row.ownerName, hideBelow: 1100 },
            { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "published" ? "success" : row.status === "in_review" ? "warning" : "neutral"}>{row.status.replace("_", " ")}</Pill> },
            { key: "versions", header: "Versions", align: "end", cell: (row) => String(row.history.length), hideBelow: 1280 },
            {
              key: "updated", header: "Changed", align: "end", sortValue: (row) => row.updatedAt,
              cell: (row) => <span title={context.dateTime(row.updatedAt)}>{context.relative(row.updatedAt)}</span>,
            },
          ]}
          bulkActions={[
            { label: "Move to folder", onRun: (selected) => context.openOverlay("folder selector", { ids: selected.map((row) => row.id) }) },
            { label: "Archive", onRun: (selected) => selected.forEach((row) => void context.mutate.patch(row.id, { status: "archived" }, { expectRevision: row.revision, event: `${row.title} archived` })) },
            { label: "Move to trash", tone: "danger", onRun: (selected) => context.openOverlay("trash confirm", { ids: selected.map((row) => row.id) }) },
          ]}
          summary={<Row gap={3}><span>{rows.length} documents</span><span className="ds-subtle">Last change {freshness([...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt, now).days} days ago</span></Row>}
        />
      )}
    </Stack>
  );
}

function LibraryInspector({ context }: { context: ScreenContext }) {
  const record = useRecord(context.selectedId);
  const { org } = useWorkspace();
  if (!record) return <Empty title="Select a document" icon={<FileText size={18} />}>Its folder, access, tags and version history appear here.</Empty>;
  const model = readDoc(record.body, record.ownerName, record.updatedAt);
  const stats = documentStats(model);
  const confidential = record.fields.confidential === true;
  return (
    <Stack gap={5}>
      <InspectorSection title="Document">
        <Properties rows={[
          { label: "Owner", value: record.ownerName },
          { label: "Folder", value: String(record.fields.folder ?? "Unfiled") },
          { label: "Status", value: <Pill tone={record.status === "published" ? "success" : "neutral"}>{record.status.replace("_", " ")}</Pill> },
          { label: "Words", value: String(stats.words) },
          { label: "Changed", value: context.dateTime(record.updatedAt) },
        ]} />
      </InspectorSection>
      <InspectorSection title="Access">
        {confidential
          ? <Notice tone="warning" title="Confidential">The body is excluded from search previews. Role views shape what the interface offers and are not an account security boundary.</Notice>
          : <p className="ds-subtle">Visible to the workspace. No public link is active.</p>}
        <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("sharing", { id: record.id })}>Sharing</Button>
          <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/docs/documents/${record.id}/publish`)}>Publish</Button>
        </Row>
      </InspectorSection>
      <InspectorSection title="Tags">
        <Row gap={1} wrap>
          {record.tags.length ? record.tags.map((tag) => <Pill key={tag}>{tag}</Pill>) : <span className="ds-subtle">No tags</span>}
        </Row>
      </InspectorSection>
      <InspectorSection title={`Versions (${record.history.length})`}>
        {record.history.length === 0 ? <span className="ds-subtle">No earlier version is stored.</span> : (
          <Stack gap={2}>
            {record.history.slice(0, 6).map((snapshot) => (
              <Row key={snapshot.at} gap={2}><span className="ds-grow ds-truncate">{snapshot.title}</span><span className="ds-subtle">{context.relative(snapshot.at)}</span></Row>
            ))}
          </Stack>
        )}
      </InspectorSection>
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-DOCS-002 — Document Editor
 * ====================================================================== */

function WriteRibbon({ editor, context }: { editor: DocEditor; context: ScreenContext }) {
  const block = currentBlock(editor);
  const selection = editor.selection;
  const expanded = Boolean(selection && !(selection.anchor.blockId === selection.head.blockId && selection.anchor.offset === selection.head.offset));
  const mark = (type: MarkType) => () => selection && editor.handleEdit({ kind: "toggleMark", mark: type, range: selection });
  return (
    <Toolbar label="Writing tools">
      <Tool label="Undo (Cmd+Z)" icon={<Undo2 size={16} />} disabled={!editor.canUndo} onClick={editor.undo} />
      <Tool label="Redo (Cmd+Shift+Z)" icon={<Redo2 size={16} />} disabled={!editor.canRedo} onClick={editor.redo} />
      <ToolbarSeparator />
      <Select
        aria-label="Block type"
        value={block?.type ?? "paragraph"}
        onChange={(event) => selection && editor.handleEdit({ kind: "setHeading", level: 0, range: selection }) === undefined
          && editor.commit(setBlockType(editor.model, selection!, event.target.value as BlockType).model, "Block type", selection)}
      >
        {BLOCK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      <Select
        aria-label="Named style"
        value={block?.styleId ?? ""}
        onChange={(event) => selection && editor.commit(setStyle(editor.model, selection, event.target.value || undefined).model, "Style", selection)}
      >
        <option value="">No named style</option>
        {editor.model.styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
      </Select>
      <ToolbarSeparator />
      <Tool label="Bold (Cmd+B)" icon={<Bold size={16} />} pressed={editor.marks.includes("bold")} disabled={!expanded} onClick={mark("bold")} />
      <Tool label="Italic (Cmd+I)" icon={<Italic size={16} />} pressed={editor.marks.includes("italic")} disabled={!expanded} onClick={mark("italic")} />
      <Tool label="Underline (Cmd+U)" icon={<Underline size={16} />} pressed={editor.marks.includes("underline")} disabled={!expanded} onClick={mark("underline")} />
      <Tool label="Strikethrough (Cmd+Shift+X)" icon={<Strikethrough size={16} />} pressed={editor.marks.includes("strike")} disabled={!expanded} onClick={mark("strike")} />
      <Tool label="Inline code (Cmd+E)" icon={<Braces size={16} />} pressed={editor.marks.includes("code")} disabled={!expanded} onClick={mark("code")} />
      <Tool label="Link (Cmd+Shift+L)" icon={<Link2 size={16} />} disabled={!expanded} onClick={() => context.openOverlay("link", { range: selection })} />
      <ToolbarSeparator />
      <Tool label="Bulleted list" icon={<List size={16} />} pressed={block?.type === "bulletItem"} onClick={() => selection && editor.commit(setBlockType(editor.model, selection, "bulletItem").model, "Bulleted list", selection)} />
      <Tool label="Numbered list" icon={<ListOrdered size={16} />} pressed={block?.type === "numberItem"} onClick={() => selection && editor.commit(setBlockType(editor.model, selection, "numberItem").model, "Numbered list", selection)} />
      <Tool label="Quote" icon={<Quote size={16} />} pressed={block?.type === "quote"} onClick={() => selection && editor.commit(setBlockType(editor.model, selection, "quote").model, "Quote", selection)} />
      <ToolbarSeparator />
      <Tool label="Insert table" icon={<TableIcon size={16} />} onClick={() => context.openOverlay("insert table")} />
      <Tool label="Insert image reference" icon={<ImageIcon size={16} />} onClick={() => context.openOverlay("insert table", { mode: "image" })} />
      <Tool label="Insert page break" icon={<Minus size={16} />} onClick={() => {
        const result = insertBlockAfter(editor.model, editor.selection?.head.blockId, emptyBlock("pageBreak"));
        editor.commit(result.model, "Page break", result.selection);
      }} />
      <ToolbarSeparator />
      <Tool label="Comment on the selection" icon={<MessageSquare size={16} />} disabled={!expanded} onClick={() => context.openOverlay("citations", { mode: "comment", range: selection })} />
      <Tool label="Find and replace (Cmd+F)" icon={<Search size={16} />} onClick={() => context.openOverlay("Styles", { mode: "find" })} />
    </Toolbar>
  );
}

function ReviewRibbon({ editor, context }: { editor: DocEditor; context: ScreenContext }) {
  const open = openSuggestions(editor.model);
  return (
    <Toolbar label="Review tools">
      <Switch
        label="Suggest changes"
        checked={editor.model.suggestMode}
        onChange={(next) => editor.commit({ ...editor.model, suggestMode: next }, next ? "Suggesting on" : "Suggesting off", editor.selection)}
      />
      <ToolbarSeparator />
      <Pill tone={open.length ? "warning" : "neutral"}>{open.length} open suggestion{open.length === 1 ? "" : "s"}</Pill>
      <Tool
        label="Accept every open suggestion" icon={<CheckCheck size={16} />} disabled={open.length === 0}
        onClick={() => {
          let next = editor.model;
          for (const suggestion of open) next = resolveSuggestion(next, suggestion.id, "accepted");
          editor.commit(next, "Accept all suggestions", editor.selection);
          context.toast("Suggestions accepted", `${open.length} tracked change${open.length === 1 ? "" : "s"} merged into the text.`);
        }}
      />
      <ToolbarSeparator />
      <Tool label="Comment on the selection" icon={<MessageSquare size={16} />} onClick={() => context.openOverlay("citations", { mode: "comment", range: editor.selection })} />
      <Tool label="Open the full review desk" icon={<Highlighter size={16} />} onClick={() => context.navigate(context.path("/o/:org/docs/documents/:id/review", context.params.id))} />
    </Toolbar>
  );
}

function LayoutRibbon({ editor }: { editor: DocEditor }) {
  const page = editor.model.page;
  return (
    <Toolbar label="Layout">
      <Select aria-label="Page size" value={page.size} onChange={(event) => editor.commit({ ...editor.model, page: { ...page, size: event.target.value as "A4" | "Letter" } }, "Page size")}>
        <option value="A4">A4</option>
        <option value="Letter">Letter</option>
      </Select>
      <Select aria-label="Columns" value={String(page.columns)} onChange={(event) => editor.commit({ ...editor.model, page: { ...page, columns: Number(event.target.value) as 1 | 2 } }, "Columns")}>
        <option value="1">One column</option>
        <option value="2">Two columns</option>
      </Select>
      <Select aria-label="Margin" value={String(page.margin)} onChange={(event) => editor.commit({ ...editor.model, page: { ...page, margin: Number(event.target.value) } }, "Margin")}>
        <option value="54">Narrow margin</option>
        <option value="72">Normal margin</option>
        <option value="96">Wide margin</option>
      </Select>
      <ToolbarSeparator />
      <Switch label="Page numbers" checked={page.showPageNumbers} onChange={(next) => editor.commit({ ...editor.model, page: { ...page, showPageNumbers: next } }, "Page numbers")} />
    </Toolbar>
  );
}

function ReferenceRibbon({ editor, context }: { editor: DocEditor; context: ScreenContext }) {
  return (
    <Toolbar label="References">
      <Tool label="Add a reference" icon={<Link2 size={16} />} onClick={() => context.openOverlay("citations", { mode: "reference" })} />
      <Pill tone="neutral">{editor.model.references.length} references</Pill>
      <ToolbarSeparator />
      <Tool label="Export Markdown" icon={<FileDown size={16} />} onClick={() => context.openOverlay("export")} />
    </Toolbar>
  );
}

function CommentColumn({ editor, context, activeId, onActivate }: { editor: DocEditor; context: ScreenContext; activeId?: string; onActivate: (id: string) => void }) {
  const comments = editor.model.comments.filter((comment) => !comment.resolved);
  if (comments.length === 0) {
    return <Empty title="No open comments" icon={<MessageSquare size={18} />}>Select text and use the comment tool. A comment is anchored to that block range, not to a copy of the words.</Empty>;
  }
  return (
    <Stack gap={3}>
      {comments.map((comment) => {
        const drifted = commentDrifted(editor.model, comment);
        return (
          <div key={comment.id} className="dx-commentcard" data-active={comment.id === activeId}>
            <Row gap={2}>
              <strong className="ds-grow ds-truncate">{comment.author}</strong>
              {comment.mandatory && <Pill tone="warning">Must resolve</Pill>}
              <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>{context.relative(comment.at)}</span>
            </Row>
            <blockquote>{comment.quote || "(empty selection)"}</blockquote>
            <p style={{ fontSize: "var(--text-sm)" }}>{comment.body}</p>
            {drifted && <Notice tone="warning">The text under this anchor has changed since the comment was made.</Notice>}
            {comment.replies.map((reply) => (
              <Row key={reply.id} gap={2} style={{ paddingInlineStart: "var(--space-3)" }}>
                <span className="ds-subtle">{reply.author}:</span><span style={{ fontSize: "var(--text-sm)" }}>{reply.body}</span>
              </Row>
            ))}
            <Row gap={2}>
              <Button size="sm" variant="ghost" onClick={() => { onActivate(comment.id); editor.moveCaret({ anchor: { blockId: comment.anchor.blockId, offset: comment.anchor.start }, head: { blockId: comment.anchor.blockId, offset: comment.anchor.end } }); }}>Go to text</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Comment thread", { id: comment.id })}>Reply</Button>
              <Button size="sm" variant="secondary" onClick={() => editor.commit({ ...editor.model, comments: editor.model.comments.map((item) => (item.id === comment.id ? { ...item, resolved: true } : item)) }, "Resolve comment")}>Resolve</Button>
            </Row>
          </div>
        );
      })}
    </Stack>
  );
}

function DocumentEditorScreen({ context }: { context: ScreenContext }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [activeCommentId, setActiveCommentId] = useState<string | undefined>();
  const [focusBlockId, setFocusBlockId] = useState<string | undefined>();
  const [mobilePanel, setMobilePanel] = useState<"doc" | "side" | "aside">("doc");
  const [find, setFind] = useState({ needle: "", replacement: "", caseSensitive: false, wholeWord: false, open: false });
  const [title, setTitle] = useState(record?.title ?? "");
  const titleFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (record && titleFor.current !== record.id) {
      titleFor.current = record.id;
      setTitle(record.title);
    }
  }, [record]);

  const payload = context.overlayPayload as { mode?: string } | undefined;
  useEffect(() => {
    if (payload?.mode === "find") setFind((current) => ({ ...current, open: true }));
  }, [payload?.mode]);

  const hits: Hit[] = useMemo(
    () => (find.open && find.needle ? findAll(editor.model, find.needle, { caseSensitive: find.caseSensitive, wholeWord: find.wholeWord }) : []),
    [find, editor.model],
  );

  if (!record) {
    return (
      <div className="dx-shell">
        <div className="dx-scroll">
          <Empty title="No document is open" icon={<FileText size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/docs/files`)}>Open the library</Button>} />
        </div>
      </div>
    );
  }

  const stats = documentStats(editor.model);
  const tab = context.tab || "Write";

  function onEdit(intent: EditIntent) {
    editor.handleEdit(intent, {
      onRequestLink: (range) => context.openOverlay("link", { range }),
      onRequestFind: () => setFind((current) => ({ ...current, open: true })),
    });
  }

  function setTableCell(blockId: string, row: number, col: number, value: string) {
    const index = blockIndex(editor.model, blockId);
    if (index < 0) return;
    const block = editor.model.blocks[index];
    if (!block.table) return;
    const rows = block.table.rows.map((line, lineIndex) => (lineIndex === row ? line.map((cell, cellIndex) => (cellIndex === col ? value : cell)) : line));
    const blocks = editor.model.blocks.map((item) => (item.id === blockId ? { ...item, table: { ...block.table!, rows } } : item));
    editor.commit({ ...editor.model, blocks }, "Table cell", editor.selection, true);
  }

  return (
    <div className="dx-shell">
      <div className="dx-bar">
        <div className="dx-bar-title">
          <input
            aria-label="Document title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() && title !== record.title) {
                void context.mutate.patch(record.id, { title: title.trim() }, { event: `Document renamed to ${title.trim()}` });
              } else setTitle(record.title);
            }}
          />
          <span>{String(record.fields.folder ?? "Unfiled")} · {record.ownerName}</span>
        </div>
        <span className="ds-grow" />
        <SaveBadge editor={editor} context={context} />
        <Button size="sm" variant="secondary" onClick={() => void editor.saveNow()} disabled={editor.saveState === "clean" || editor.saveState === "saved"}>Save now</Button>
        <Button size="sm" variant="primary" onClick={() => context.openOverlay("export")} icon={<FileDown size={15} />}>Export</Button>
      </div>

      <div className="dx-tabstrip">
        <Tabs
          label="Editor modes"
          value={tab}
          onChange={context.setTab}
          items={[
            { id: "Write", label: "Write" },
            { id: "Review", label: "Review", count: editor.model.comments.filter((comment) => !comment.resolved).length + openSuggestions(editor.model).length },
            { id: "Layout", label: "Layout", count: paginate(editor.model).pages.length },
            { id: "References", label: "References", count: editor.model.references.length },
          ]}
          trailing={
            <ButtonGroup label="Panels on narrow screens">
              <Button size="sm" variant={mobilePanel === "side" ? "secondary" : "ghost"} onClick={() => setMobilePanel(mobilePanel === "side" ? "doc" : "side")}>Outline</Button>
              <Button size="sm" variant={mobilePanel === "aside" ? "secondary" : "ghost"} onClick={() => setMobilePanel(mobilePanel === "aside" ? "doc" : "aside")}>Details</Button>
            </ButtonGroup>
          }
        />
      </div>

      <div className="dx-ribbon">
        {tab === "Write" && <WriteRibbon editor={editor} context={context} />}
        {tab === "Review" && <ReviewRibbon editor={editor} context={context} />}
        {tab === "Layout" && <LayoutRibbon editor={editor} />}
        {tab === "References" && <ReferenceRibbon editor={editor} context={context} />}
      </div>

      {find.open && (
        <div className="dx-ribbon">
          <Toolbar label="Find and replace">
            <TextInput
              type="search" aria-label="Find" placeholder="Find" value={find.needle} autoFocus
              onChange={(event) => setFind((current) => ({ ...current, needle: event.target.value }))}
            />
            <TextInput
              aria-label="Replace with" placeholder="Replace with" value={find.replacement}
              onChange={(event) => setFind((current) => ({ ...current, replacement: event.target.value }))}
            />
            <Checkbox label="Match case" checked={find.caseSensitive} onChange={(event) => setFind((current) => ({ ...current, caseSensitive: event.target.checked }))} />
            <Checkbox label="Whole word" checked={find.wholeWord} onChange={(event) => setFind((current) => ({ ...current, wholeWord: event.target.checked }))} />
            <Pill tone={hits.length ? "info" : "neutral"}>{hits.length} match{hits.length === 1 ? "" : "es"}</Pill>
            <Button size="sm" variant="secondary" disabled={hits.length === 0} onClick={() => {
              const first = hits[0];
              setFocusBlockId(first.blockId);
              editor.moveCaret({ anchor: { blockId: first.blockId, offset: first.start }, head: { blockId: first.blockId, offset: first.end } });
            }}>Go to first</Button>
            <Button size="sm" variant="primary" disabled={hits.length === 0} onClick={() => {
              const result = replaceAll(editor.model, find.needle, find.replacement, { caseSensitive: find.caseSensitive, wholeWord: find.wholeWord });
              editor.commit(result.model, "Replace all", null);
              context.toast("Replaced", `${result.count} occurrence${result.count === 1 ? "" : "s"} of “${find.needle}” replaced.`);
            }}>Replace all</Button>
            <Button size="sm" variant="ghost" onClick={() => setFind((current) => ({ ...current, open: false, needle: "" }))}>Close</Button>
          </Toolbar>
        </div>
      )}

      <div className="dx-body" data-mobile={mobilePanel}>
        <div className="dx-side">
          <InspectorSection title="Outline" actions={<Button size="sm" variant="ghost" onClick={() => context.navigate(context.path("/o/:org/docs/documents/:id/outline", record.id))}>Open</Button>}>
            <OutlineTree
              model={editor.model}
              activeId={editor.selection?.head.blockId}
              onJump={(blockId) => { setFocusBlockId(blockId); editor.moveCaret({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 0 } }); }}
              onMove={(blockId, direction) => editor.commit(moveSection(editor.model, blockId, direction).model, "Move section", editor.selection)}
            />
          </InspectorSection>
          <InspectorSection title="Word count">
            <Properties rows={[
              { label: "Words", value: String(stats.words) },
              { label: "Characters", value: String(stats.characters) },
              { label: "Without spaces", value: String(stats.charactersNoSpaces) },
              { label: "Paragraphs", value: String(stats.paragraphs) },
              { label: "Headings", value: String(stats.headings) },
              { label: "Reading time", value: `${stats.readingMinutes} min` },
            ]} />
          </InspectorSection>
        </div>

        <div className="dx-scroll">
          <Stack gap={4}>
            <ConflictNotice editor={editor} />
            {editor.model.suggestMode && (
              <Notice tone="info" title="Suggesting is on">
                Your edits are recorded as tracked changes. Nothing is written into the text until a change is accepted in Review.
              </Notice>
            )}
            {tab === "Layout" ? (
              <PaginationPreview model={editor.model} />
            ) : tab === "References" ? (
              <ReferencesPanel editor={editor} context={context} />
            ) : (
              <DocumentCanvas
                model={editor.model}
                showSuggestions={tab === "Review" || editor.model.suggestMode}
                hits={hits}
                activeCommentId={activeCommentId}
                focusBlockId={focusBlockId}
                selection={editor.selection}
                restoreToken={editor.restoreToken}
                onEdit={onEdit}
                onSelection={editor.setSelection}
                onCommentClick={setActiveCommentId}
                onTableCell={setTableCell}
                onBlockClick={(blockId) => context.openOverlay("insert table", { mode: "image", blockId })}
                pageWidth={editor.model.page.size === "A4" ? 820 : 860}
              />
            )}
          </Stack>
        </div>

        <div className="dx-aside">
          {tab === "Review" ? (
            <>
              <InspectorSection title="Tracked changes">
                {openSuggestions(editor.model).length === 0 ? <span className="ds-subtle">No open tracked change.</span> : (
                  <Stack gap={2}>
                    {openSuggestions(editor.model).map((suggestion) => (
                      <div key={suggestion.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                        <Row gap={2}><Pill tone={suggestion.kind === "insert" ? "success" : "danger"}>{suggestion.kind}</Pill><span className="ds-subtle ds-grow">{suggestion.author}</span></Row>
                        <p style={{ fontSize: "var(--text-sm)", marginBlock: 6 }}>{suggestion.note}</p>
                        <Row gap={2}>
                          <Button size="sm" variant="secondary" onClick={() => editor.commit(resolveSuggestion(editor.model, suggestion.id, "accepted"), "Accept change")}>Accept</Button>
                          <Button size="sm" variant="ghost" onClick={() => editor.commit(resolveSuggestion(editor.model, suggestion.id, "rejected"), "Reject change")}>Reject</Button>
                        </Row>
                      </div>
                    ))}
                  </Stack>
                )}
              </InspectorSection>
              <InspectorSection title="Comments">
                <CommentColumn editor={editor} context={context} activeId={activeCommentId} onActivate={setActiveCommentId} />
              </InspectorSection>
            </>
          ) : (
            <>
              <InspectorSection title="Selection">
                <Properties rows={[
                  { label: "Block", value: currentBlock(editor)?.type ?? "none" },
                  { label: "Named style", value: editor.model.styles.find((style) => style.id === currentBlock(editor)?.styleId)?.name ?? "None" },
                  { label: "Marks", value: editor.marks.length ? editor.marks.join(", ") : "None" },
                  { label: "Last action", value: editor.undoLabel ?? "None" },
                ]} />
                <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                  <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Styles")}>Styles</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    const block = currentBlock(editor);
                    if (!block) return;
                    editor.commit({ ...editor.model, bookmarks: [...editor.model.bookmarks, { id: nextId("bm"), blockId: block.id, label: visibleText(block).slice(0, 40) || "Bookmark" }] }, "Bookmark");
                  }}>Bookmark</Button>
                </Row>
              </InspectorSection>
              <InspectorSection title="Comments">
                <CommentColumn editor={editor} context={context} activeId={activeCommentId} onActivate={setActiveCommentId} />
              </InspectorSection>
              <InspectorSection title="Keyboard">
                <Properties rows={[
                  { label: "Bold / italic / underline", value: "Cmd+B / I / U" },
                  { label: "Inline code", value: "Cmd+E" },
                  { label: "Strikethrough", value: "Cmd+Shift+X" },
                  { label: "Link", value: "Cmd+Shift+L" },
                  { label: "Headings", value: "Cmd+Alt+1…3, Cmd+Alt+0 for body" },
                  { label: "Find and replace", value: "Cmd+F" },
                  { label: "Save now", value: "Cmd+S" },
                  { label: "Undo / redo", value: "Cmd+Z / Cmd+Shift+Z" },
                ]} />
                <p className="ds-subtle" style={{ marginBlockStart: "var(--space-2)" }}>Cmd+K is left to the workspace command palette.</p>
              </InspectorSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PaginationPreview({ model }: { model: DocModel }) {
  const pages = paginate(model);
  const width = model.page.size === "A4" ? 794 : 816;
  const height = model.page.size === "A4" ? 1123 : 1056;
  const scale = 0.52;
  return (
    <Stack gap={4}>
      <Notice tone="info" title={`${pages.pages.length} page${pages.pages.length === 1 ? "" : "s"} at ${model.page.size}`}>
        Page boundaries are estimated from block heights and the margin, and a page break block always starts a new page. This is a layout preview, not a print driver.
      </Notice>
      <div className="dx-pages">
        {pages.pages.map((page) => (
          <div key={page.index} className="dx-sheet" style={{ width: width * scale, height: height * scale }}>
            <div className="dx-sheet-inner" style={{ padding: model.page.margin * scale, columnCount: model.page.columns }}>
              {page.blockIds.map((blockId) => {
                const block = model.blocks.find((item) => item.id === blockId);
                if (!block) return null;
                if (block.type === "pageBreak") return <hr key={blockId} />;
                if (headingLevel(block)) return <h4 key={blockId}>{visibleText(block)}</h4>;
                if (block.type === "table") return <p key={blockId}><em>Table, {(block.table?.rows.length ?? 0)} rows</em></p>;
                if (block.type === "image") return <p key={blockId}><em>Image reference</em></p>;
                return <p key={blockId} style={{ margin: "0 0 4px" }}>{visibleText(block).slice(0, 320)}</p>;
              })}
            </div>
            <span className="dx-sheet-label">{model.page.showPageNumbers ? `Page ${page.index} · ${page.words} words` : `${page.words} words`}</span>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function ReferencesPanel({ editor, context }: { editor: DocEditor; context: ScreenContext }) {
  const records = useCollections(["documents", "workbooks", "invoices", "products"]);
  const pool = [...records.documents, ...records.workbooks, ...records.invoices, ...records.products];
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A reference points at a record in this workspace or it has no source">
        Nothing here invents a citation. A reference either names a record that exists in this browser, or it is marked as having no source so a reviewer can see it needs one.
      </Notice>
      {editor.model.references.length === 0 ? (
        <Empty title="No references yet" icon={<Link2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("citations", { mode: "reference" })}>Add a reference</Button>} />
      ) : (
        <DataGrid
          rows={editor.model.references}
          rowId={(row) => row.id}
          label="References"
          filterable={false}
          columns={[
            { key: "label", header: "Reference", primary: true, cell: (row) => row.label },
            {
              key: "source", header: "Source", cell: (row) => {
                const found = pool.find((record) => record.id === row.recordId);
                return found ? <Pill tone="success">{found.title}</Pill> : <Pill tone="warning">No source recorded</Pill>;
              },
            },
            { key: "note", header: "Note", cell: (row) => row.note || "—" },
          ]}
          bulkActions={[{
            label: "Remove", tone: "danger",
            onRun: (selected) => editor.commit({ ...editor.model, references: editor.model.references.filter((item) => !selected.some((row) => row.id === item.id)) }, "Remove references"),
          }]}
        />
      )}
    </Stack>
  );
}

/* ====================================================================== *
 * ARL-DOCS-003 — Outline & Navigation
 * ====================================================================== */

function OutlineScreen({ context, tab }: { context: ScreenContext; tab: "Headings" | "Bookmarks" | "Comments" }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const warnings = useMemo(() => structureWarnings(editor.model), [editor.model]);

  if (!record) return <Empty title="No document is open" icon={<FileText size={20} />} />;

  if (tab === "Bookmarks") {
    return (
      <Grid>
        <Card span={8} eyebrow="BOOKMARKS" prov="human" title="Bookmarks" subtitle={`${editor.model.bookmarks.length} saved positions`}>
          {editor.model.bookmarks.length === 0 ? (
            <Empty title="No bookmarks" icon={<CornerDownRight size={20} />}>Bookmark a block from the editor inspector to jump straight back to it.</Empty>
          ) : (
            <Stack gap={2}>
              {editor.model.bookmarks.map((bookmark) => {
                const block = editor.model.blocks[blockIndex(editor.model, bookmark.blockId)];
                return (
                  <Row key={bookmark.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <div className="ds-grow">
                      <strong>{bookmark.label}</strong>
                      <p className="ds-subtle">{block ? `${block.type} · ${visibleText(block).slice(0, 70)}` : "The block this bookmark pointed at has been deleted."}</p>
                    </div>
                    <Button size="sm" variant="secondary" disabled={!block} onClick={() => context.navigate(context.path("/o/:org/docs/documents/:id", record.id))}>Open</Button>
                    <Button size="sm" variant="ghost" onClick={() => editor.commit({ ...editor.model, bookmarks: editor.model.bookmarks.filter((item) => item.id !== bookmark.id) }, "Remove bookmark")}>Remove</Button>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>
        <Card span={4} eyebrow="POSITION" prov="human" title="Position" subtitle="Where each bookmark sits">
          <Properties rows={editor.model.bookmarks.map((bookmark) => ({
            label: bookmark.label,
            value: `Block ${blockIndex(editor.model, bookmark.blockId) + 1} of ${editor.model.blocks.length}`,
          }))} />
        </Card>
      </Grid>
    );
  }

  if (tab === "Comments") {
    const byHeading = outline(editor.model).map((node) => {
      const span = sectionSpan(editor.model, node.index);
      const ids = editor.model.blocks.slice(node.index, node.index + span).map((block) => block.id);
      return { node, comments: editor.model.comments.filter((comment) => ids.includes(comment.anchor.blockId)) };
    });
    const orphans = editor.model.comments.filter((comment) => !byHeading.some((entry) => entry.comments.includes(comment)));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Comments are listed under the heading that owns their block">
          Reordering a section moves its comments with it, because a comment is anchored to a block id and an offset range rather than to a page position.
        </Notice>
        {byHeading.filter((entry) => entry.comments.length > 0).map((entry) => (
          <Card key={entry.node.blockId} title={entry.node.text} subtitle={`${entry.comments.length} comment${entry.comments.length === 1 ? "" : "s"}`}>
            <Stack gap={2}>
              {entry.comments.map((comment) => (
                <Row key={comment.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <Row gap={2}><strong>{comment.author}</strong>{comment.resolved && <Pill tone="success">Resolved</Pill>}{comment.mandatory && <Pill tone="warning">Must resolve</Pill>}</Row>
                    <p className="ds-subtle">“{comment.quote}” — {comment.body}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Heading properties", { blockId: comment.anchor.blockId })}>Anchor</Button>
                </Row>
              ))}
            </Stack>
          </Card>
        ))}
        {orphans.length > 0 && (
          <Card title="Outside any heading" subtitle={`${orphans.length} comments`}>
            <Stack gap={2}>{orphans.map((comment) => <span key={comment.id}>“{comment.quote}” — {comment.body}</span>)}</Stack>
          </Card>
        )}
        {editor.model.comments.length === 0 && <Empty title="No comments" icon={<MessageSquare size={20} />} />}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow="OUTLINE" prov="human" title="Heading tree" subtitle={`${outline(editor.model).length} headings · reorder with the arrows or the keyboard`}
        actions={<SaveBadge editor={editor} context={context} />}>
        <OutlineTree
          model={editor.model}
          collapsedIds={collapsedIds}
          onToggle={(blockId) => setCollapsedIds((current) => (current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId]))}
          onJump={(blockId) => context.navigate(`${context.path("/o/:org/docs/documents/:id", record.id)}?block=${blockId}`)}
          onMove={(blockId, direction) => {
            const result = moveSection(editor.model, blockId, direction);
            if (result.model === editor.model) return;
            editor.commit(result.model, "Move section");
            context.toast("Section moved", "Its paragraphs, comments and bookmarks moved with it.");
          }}
        />
        <Notice tone="neutral">The arrows move a whole section: the heading and everything under it until the next heading at the same level or above.</Notice>
      </Card>
      <Card span={5} eyebrow="SECTIONS" prov="human" title="Sections" subtitle="Word count per section">
        <Stack gap={3}>
          {outline(editor.model).map((node) => (
            <div key={node.blockId}>
              <Row gap={2}><span className="ds-grow ds-truncate">{node.text}</span><span className="ds-num">{node.words}w</span></Row>
              <Meter value={node.words} max={Math.max(1, ...outline(editor.model).map((item) => item.words))} label={`${node.text} length`} />
            </div>
          ))}
          {outline(editor.model).length === 0 && <span className="ds-subtle">No sections yet.</span>}
        </Stack>
      </Card>
      <Card span={12} eyebrow="STRUCTURE" prov="human" title="Structure" subtitle={`${warnings.length} finding${warnings.length === 1 ? "" : "s"}`}
        footer={<Button size="sm" variant="secondary" disabled={warnings.length === 0} onClick={() => context.openOverlay("document structure warning")}>Review findings</Button>}>
        {warnings.length === 0
          ? <Notice tone="success" title="The outline is sound">Headings start at level one and step down one level at a time.</Notice>
          : <Stack gap={2}>{warnings.slice(0, 4).map((warning) => <Notice key={warning.id} tone="warning">{warning.message}</Notice>)}</Stack>}
      </Card>
      <Card span={12} title="Add a section" subtitle="Appends a heading and an empty paragraph at the end">
        <Row gap={2} wrap>
          {([1, 2, 3] as const).map((level) => (
            <Button key={level} variant="secondary" onClick={() => {
              const type = `heading${level}` as BlockType;
              const last = editor.model.blocks[editor.model.blocks.length - 1];
              let result = insertBlockAfter(editor.model, last?.id, { ...emptyBlock(type), runs: [{ text: `New heading ${level}`, marks: [] }] });
              result = insertBlockAfter(result.model, result.selection.head.blockId, emptyBlock("paragraph"));
              editor.commit(result.model, "Add section", result.selection);
              context.toast("Section added", `A heading ${level} and an empty paragraph were appended.`);
            }}>Add heading {level}</Button>
          ))}
        </Row>
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * ARL-DOCS-004 — Review & Comments
 * ====================================================================== */

function ReviewScreen({ context, tab }: { context: ScreenContext; tab: "Comments" | "Changes" | "Approvals" | "Versions" }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const members = useCollection("members");
  const [reply, setReply] = useState<Record<string, string>>({});

  if (!record) return <Empty title="No document is open" icon={<FileText size={20} />} />;

  if (tab === "Changes") {
    const open = openSuggestions(editor.model);
    const closed = editor.model.suggestions.filter((item) => item.status !== "open");
    return (
      <Stack gap={4}>
        <Row gap={3} wrap>
          <Switch label="Suggesting mode" checked={editor.model.suggestMode} onChange={(next) => editor.commit({ ...editor.model, suggestMode: next }, "Suggesting")} />
          <span className="ds-grow" />
          <Button variant="secondary" disabled={open.length === 0} onClick={() => {
            let next = editor.model;
            for (const suggestion of open) next = resolveSuggestion(next, suggestion.id, "accepted");
            editor.commit(next, "Accept all");
          }}>Accept all</Button>
          <Button variant="ghost" disabled={open.length === 0} onClick={() => {
            let next = editor.model;
            for (const suggestion of open) next = resolveSuggestion(next, suggestion.id, "rejected");
            editor.commit(next, "Reject all");
          }}>Reject all</Button>
        </Row>
        {open.length === 0 ? (
          <Empty title="No open tracked changes" icon={<CheckCheck size={20} />}>
            Turn suggesting on and edit the document. Every insertion and deletion is recorded as a change you can accept or reject.
          </Empty>
        ) : (
          <DataGrid
            rows={open}
            rowId={(row) => row.id}
            label="Tracked changes"
            filterable={false}
            columns={[
              { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.kind === "insert" ? "success" : "danger"}>{row.kind}</Pill> },
              { key: "note", header: "Change", primary: true, cell: (row) => row.note },
              { key: "author", header: "By", cell: (row) => row.author },
              { key: "at", header: "When", align: "end", cell: (row) => context.relative(row.at) },
            ]}
            bulkActions={[
              { label: "Accept", onRun: (rows) => { let next = editor.model; for (const row of rows) next = resolveSuggestion(next, row.id, "accepted"); editor.commit(next, "Accept changes"); } },
              { label: "Reject", onRun: (rows) => { let next = editor.model; for (const row of rows) next = resolveSuggestion(next, row.id, "rejected"); editor.commit(next, "Reject changes"); } },
            ]}
            onOpen={(id) => context.openOverlay("diff", { id })}
          />
        )}
        {closed.length > 0 && (
          <Card eyebrow="TRACKED CHANGES" prov="human" title="Decided" subtitle={`${closed.length} change${closed.length === 1 ? "" : "s"}`}>
            <Stack gap={2}>
              {closed.map((item) => (
                <Row key={item.id} gap={2}><Pill tone={item.status === "accepted" ? "success" : "neutral"}>{item.status}</Pill><span className="ds-grow">{item.note}</span><span className="ds-subtle">{item.author}</span></Row>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  if (tab === "Approvals") {
    const mandatoryOpen = editor.model.comments.filter((comment) => comment.mandatory && !comment.resolved);
    const approvals = (record.fields.approvals ? String(record.fields.approvals).split("|").filter(Boolean) : []);
    return (
      <Grid>
        <Card span={7} eyebrow="APPROVAL" prov="human" title="Approval" subtitle={`Document status: ${record.status.replace("_", " ")}`}>
          {mandatoryOpen.length > 0 && (
            <Notice tone="danger" title={`${mandatoryOpen.length} mandatory review${mandatoryOpen.length === 1 ? "" : "s"} is still open`}>
              Approval is blocked while a comment marked “must resolve” is open. Approving would otherwise bury a reviewer's objection without a record of it.
            </Notice>
          )}
          <Stack gap={3}>
            <Properties rows={[
              { label: "Owner", value: record.ownerName },
              { label: "Mandatory reviews", value: `${editor.model.comments.filter((comment) => comment.mandatory).length} (${mandatoryOpen.length} open)` },
              { label: "Open comments", value: String(editor.model.comments.filter((comment) => !comment.resolved).length) },
              { label: "Open changes", value: String(openSuggestions(editor.model).length) },
            ]} />
            <Row gap={2}>
              <Button
                variant="primary"
                disabled={mandatoryOpen.length > 0 || record.status === "published"}
                title={mandatoryOpen.length > 0 ? "Resolve the mandatory reviews first" : undefined}
                onClick={async () => {
                  await context.mutate.patch(record.id, {
                    status: "published",
                    fields: { ...record.fields, approvals: [...approvals, `${context.actor} ${context.now.toISOString()}`].join("|") },
                  }, { expectRevision: record.revision, event: `${record.title} approved by ${context.actor}` });
                  context.toast("Approved", `${record.title} is published in this workspace and the approval is on the record.`);
                }}
              >Approve</Button>
              <Button variant="secondary" onClick={() => context.openOverlay("reviewer assignment")}>Assign reviewers</Button>
            </Row>
          </Stack>
        </Card>
        <Card span={5} eyebrow="APPROVAL" prov="posted" title="Approval history" subtitle={`${approvals.length} recorded`}>
          {approvals.length === 0 ? <Empty title="Not approved yet" /> : (
            <Stack gap={2}>
              {approvals.map((entry) => {
                const [name, at] = entry.split(" ");
                return <Row key={entry} gap={2}><strong className="ds-grow">{name}</strong><span className="ds-subtle">{context.dateTime(at)}</span></Row>;
              })}
            </Stack>
          )}
          <Notice tone="neutral">An approval is a record on the document, not a toast. No e-signature provider is connected.</Notice>
        </Card>
      </Grid>
    );
  }

  if (tab === "Versions") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Keystrokes do not create versions">
          Autosave writes the body with history suppressed, so the version list holds deliberate saves and structural changes rather than one entry per character.
        </Notice>
        {record.history.length === 0 ? <Empty title="No earlier version stored" /> : (
          <DataGrid
            rows={record.history.map((snapshot, index) => ({ ...snapshot, id: `${snapshot.at}-${index}` }))}
            rowId={(row) => row.id}
            label="Versions"
            filterable={false}
            columns={[
              { key: "title", header: "Title", primary: true, cell: (row) => row.title },
              { key: "status", header: "Status", cell: (row) => <Pill>{String(row.status).replace("_", " ")}</Pill> },
              { key: "words", header: "Words", align: "end", cell: (row) => String(documentStats(readDoc(row.body, record.ownerName, row.at)).words) },
              { key: "at", header: "Saved", align: "end", cell: (row) => context.dateTime(row.at) },
            ]}
            onOpen={(id) => context.openOverlay("diff", { snapshotId: id })}
          />
        )}
      </Stack>
    );
  }

  const comments = editor.model.comments;
  return (
    <Grid>
      <Card span={8} eyebrow="REVIEW" prov="human" title="Comments" subtitle={`${comments.filter((comment) => !comment.resolved).length} open of ${comments.length}`}
        actions={<SaveBadge editor={editor} context={context} />}>
        {comments.length === 0 ? (
          <Empty title="No comments" icon={<MessageSquare size={20} />} action={<Button variant="secondary" onClick={() => context.navigate(context.path("/o/:org/docs/documents/:id", record.id))}>Open the editor</Button>}>
            Select text in the editor and comment on it. The comment stores the block it is anchored to and the offsets inside it.
          </Empty>
        ) : (
          <Stack gap={3}>
            {comments.map((comment) => (
              <div key={comment.id} className="dx-commentcard">
                <Row gap={2}>
                  <strong className="ds-grow">{comment.author}</strong>
                  {comment.mandatory && <Pill tone="warning">Must resolve</Pill>}
                  <Pill tone={comment.resolved ? "success" : "neutral"}>{comment.resolved ? "Resolved" : "Open"}</Pill>
                  <span className="ds-subtle">{context.relative(comment.at)}</span>
                </Row>
                <blockquote>{comment.quote}</blockquote>
                {commentDrifted(editor.model, comment) && <Notice tone="warning">The anchored text has changed since this was written.</Notice>}
                <p>{comment.body}</p>
                {comment.replies.map((item) => (
                  <Row key={item.id} gap={2} style={{ paddingInlineStart: "var(--space-4)" }}>
                    <strong>{item.author}</strong><span className="ds-grow">{item.body}</span><span className="ds-subtle">{context.relative(item.at)}</span>
                  </Row>
                ))}
                <Row gap={2}>
                  <TextInput
                    aria-label={`Reply to ${comment.author}`}
                    placeholder={`Reply, mention with @${members[0]?.title.split(" ")[0] ?? "name"}`}
                    value={reply[comment.id] ?? ""}
                    onChange={(event) => setReply((current) => ({ ...current, [comment.id]: event.target.value }))}
                  />
                  <Button size="sm" variant="secondary" disabled={!(reply[comment.id] ?? "").trim()} onClick={() => {
                    const body = (reply[comment.id] ?? "").trim();
                    editor.commit({
                      ...editor.model,
                      comments: editor.model.comments.map((item) => (item.id === comment.id
                        ? { ...item, replies: [...item.replies, { id: nextId("rp"), author: context.actor, at: context.now.toISOString(), body }] }
                        : item)),
                    }, "Reply");
                    setReply((current) => ({ ...current, [comment.id]: "" }));
                    const mentioned = members.find((member) => body.toLowerCase().includes(`@${member.title.split(" ")[0].toLowerCase()}`));
                    if (mentioned) {
                      void context.mutate.log(`${mentioned.title} mentioned on ${record.title}`, { entityId: record.id, type: "mention" });
                      context.toast("Mention recorded", `${mentioned.title} is noted on the document. No notification service is connected, so nothing was sent.`, "info");
                    }
                  }}>Reply</Button>
                  <Button size="sm" variant="ghost" onClick={() => editor.commit({ ...editor.model, comments: editor.model.comments.map((item) => (item.id === comment.id ? { ...item, resolved: !item.resolved } : item)) }, "Toggle resolved")}>
                    {comment.resolved ? "Reopen" : "Resolve"}
                  </Button>
                </Row>
              </div>
            ))}
          </Stack>
        )}
      </Card>
      <Card span={4} eyebrow="ROSTER" prov="human" title="Reviewers" subtitle="From the workspace roster">
        <Stack gap={2}>
          {members.slice(0, 6).map((member) => {
            const count = comments.filter((comment) => comment.author === member.title).length;
            return <Row key={member.id} gap={2}><span className="ds-grow ds-truncate">{member.title}</span><Pill tone={count ? "info" : "neutral"}>{count} comment{count === 1 ? "" : "s"}</Pill></Row>;
          })}
        </Stack>
        <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("reviewer assignment")}>Assign a reviewer</Button>
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * ARL-DOCS-005 — Templates
 * ====================================================================== */

function TemplatesScreen({ context, tab }: { context: ScreenContext; tab: "All" | "Company" | "Department" | "My templates" }) {
  const data = useCollections(["templates", "documents"]);
  const { actor } = useWorkspace();
  const templates = data.templates.filter((record) => record.fields.kind === "document");
  const rows = tab === "All" ? templates
    : tab === "Company" ? templates.filter((record) => record.fields.scope === "company")
      : tab === "Department" ? templates.filter((record) => record.fields.scope === "department")
        : templates.filter((record) => record.ownerName === actor);

  if (rows.length === 0) {
    return <Empty title={`No ${tab.toLowerCase()} templates`} icon={<FileText size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Template editor")}>Create template</Button>}>
      A template carries the sections and the company fields a document should start from.
    </Empty>;
  }

  return (
    <Grid>
      {rows.map((record) => {
        const model = readDoc(record.body, record.ownerName, record.updatedAt);
        const tokens = String(record.fields.tokens ?? "").split(",").map((token) => token.trim()).filter(Boolean);
        const created = data.documents.filter((document) => document.fields.templateId === record.id);
        const signed = created.filter((document) => document.fields.signatureStatus === "signed");
        return (
          <Card
            key={record.id}
            span={4}
            eyebrow="TEMPLATE"
            prov="human"
            title={record.title}
            subtitle={record.summary}
            actions={<Pill tone={record.status === "published" ? "success" : record.status === "retired" ? "neutral" : "warning"}>{record.status}</Pill>}
            footer={<>
              <Button size="sm" variant="primary" disabled={record.status === "retired"} onClick={() => context.openOverlay("Template editor", { id: record.id, mode: "use" })}>Use</Button>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Template editor", { id: record.id })}>Edit master</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("change impact", { id: record.id })}>Impact</Button>
            </>}
          >
            <Stack gap={3}>
              <Properties rows={[
                { label: "Scope", value: String(record.fields.scope ?? "company") },
                { label: "Sections", value: String(outline(model).length) },
                { label: "Documents created", value: String(created.length) },
                { label: "Signed and frozen", value: String(signed.length) },
              ]} />
              <div>
                <span className="ds-subtle" style={{ fontSize: "var(--text-2xs)" }}>Company fields</span>
                <Row gap={1} wrap>{tokens.length ? tokens.map((token) => <Pill key={token} tone="accent">{token}</Pill>) : <span className="ds-subtle">None mapped</span>}</Row>
              </div>
              {signed.length > 0 && (
                <Notice tone="warning">{signed.length} signed document{signed.length === 1 ? " was" : "s were"} created from this master. Editing the master does not change {signed.length === 1 ? "it" : "them"}.</Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ====================================================================== *
 * ARL-DOCS-006 — Publishing & Export
 * ====================================================================== */

function PublishScreen({ context, tab }: { context: ScreenContext; tab: "Export" | "Share" | "Publish" | "History" }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const events = useCollection("documents");
  const signing = capabilityById("site.publish");

  if (!record) return <Empty title="No document is open" icon={<FileText size={20} />} />;

  if (tab === "Share") {
    const active = editor.model.shares.filter((share) => !share.revokedAt);
    return (
      <Grid>
        <Card span={7} eyebrow="SHARING" prov="human" title="Links" subtitle={`${active.length} active`}>
          {active.length === 0 ? (
            <Empty title="No link is active" icon={<Link2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("link permissions")}>Create a link</Button>}>
              A link created here is bounded to this browser's workspace and is revocable at any time.
            </Empty>
          ) : (
            <Stack gap={3}>
              {active.map((share) => (
                <Row key={share.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <Row gap={2}><strong>{share.scope === "link" ? "Anyone with the link" : "Workspace only"}</strong><Pill tone={share.scope === "link" ? "warning" : "neutral"}>{share.scope}</Pill></Row>
                    <p className="ds-subtle">{share.note} · created {context.relative(share.at)}</p>
                  </div>
                  <Button size="sm" variant="outline-danger" onClick={() => {
                    editor.commit({ ...editor.model, shares: editor.model.shares.map((item) => (item.id === share.id ? { ...item, revokedAt: context.now.toISOString() } : item)) }, "Revoke link");
                    void context.mutate.log(`Share link revoked on ${record.title}`, { entityId: record.id, type: "revoke" });
                    context.toast("Link revoked", "The link is marked revoked on the record and no longer appears as active.");
                  }}>Revoke</Button>
                </Row>
              ))}
            </Stack>
          )}
          <Notice tone="warning" title="What a link can and cannot do here">
            Nothing leaves this browser. A link is a record of intent with a scope and a revocation time; there is no public host to serve it from, so no document is reachable outside this workspace.
          </Notice>
        </Card>
        <Card span={5} eyebrow="SHARING" prov="posted" title="Revoked" subtitle={`${editor.model.shares.filter((share) => share.revokedAt).length} links`}>
          {editor.model.shares.filter((share) => share.revokedAt).length === 0 ? <span className="ds-subtle">Nothing has been revoked.</span> : (
            <Stack gap={2}>
              {editor.model.shares.filter((share) => share.revokedAt).map((share) => (
                <Row key={share.id} gap={2}><span className="ds-grow">{share.scope}</span><span className="ds-subtle">revoked {context.relative(share.revokedAt!)}</span></Row>
              ))}
            </Stack>
          )}
        </Card>
      </Grid>
    );
  }

  if (tab === "Publish") {
    const signature = String(record.fields.signatureStatus ?? "not_requested");
    return (
      <Grid>
        <Card span={6} eyebrow="PUBLISHING" prov="human" title="Publish in the workspace" subtitle={`Current status: ${record.status.replace("_", " ")}`}>
          <Stack gap={3}>
            <Properties rows={[
              { label: "Status", value: <Pill tone={record.status === "published" ? "success" : "neutral"}>{record.status.replace("_", " ")}</Pill> },
              { label: "Open comments", value: String(editor.model.comments.filter((comment) => !comment.resolved).length) },
              { label: "Open changes", value: String(openSuggestions(editor.model).length) },
            ]} />
            <Row gap={2}>
              <Button variant="primary" disabled={record.status === "published"} onClick={async () => {
                await context.mutate.patch(record.id, { status: "published" }, { expectRevision: record.revision, event: `${record.title} published in the workspace` });
                context.toast("Published", "The document status changed on the record.");
              }}>Publish</Button>
              <Button variant="secondary" disabled={record.status !== "published"} onClick={async () => {
                await context.mutate.patch(record.id, { status: "draft" }, { expectRevision: record.revision, event: `${record.title} unpublished` });
              }}>Unpublish</Button>
            </Row>
          </Stack>
        </Card>
        <Card span={6} eyebrow="SIGNING" title="Signing" subtitle="Electronic signature">
          <Stack gap={3}>
            <Notice tone="warning" title={`${signing?.provider ?? "Signature provider"} is not connected`}>
              {signing?.localEquivalent ?? "The request is recorded locally with its signatories."} No document has been sent for signature.
            </Notice>
            <Properties rows={[
              { label: "Signature status", value: <Pill tone={signature === "signed" ? "success" : signature === "requested" ? "warning" : "neutral"}>{signature.replace("_", " ")}</Pill> },
              { label: "Signatories", value: String(record.fields.signatories ?? "None recorded") },
            ]} />
            <Button variant="secondary" onClick={() => context.openOverlay("signature request")}>Request signature</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (tab === "History") {
    const related = events.filter((item) => item.parentId === record.id);
    return (
      <Stack gap={4}>
        <Card eyebrow="HISTORY" prov="posted" title="Export and publish history" subtitle="Recorded on the document">
          {record.history.length === 0 && related.length === 0 ? <Empty title="Nothing recorded yet" /> : (
            <Stack gap={2}>
              {record.history.map((snapshot) => (
                <Row key={snapshot.at} gap={2}><Pill tone="neutral">{String(snapshot.status).replace("_", " ")}</Pill><span className="ds-grow">{snapshot.title}</span><span className="ds-subtle">{context.dateTime(snapshot.at)}</span></Row>
              ))}
            </Stack>
          )}
        </Card>
        {related.length > 0 && (
          <Card eyebrow="RECOVERY" prov="human" title="Recovery versions" subtitle={`${related.length} created from autosave conflicts`}>
            <Stack gap={2}>
              {related.map((item) => (
                <Row key={item.id} gap={2}><span className="ds-grow">{item.title}</span><Button size="sm" variant="ghost" onClick={() => context.navigate(context.path("/o/:org/docs/documents/:id", item.id))}>Open</Button></Row>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  const pages = paginate(editor.model);
  const stats = documentStats(editor.model);
  return (
    <Grid>
      <Card span={7} eyebrow="PAGINATION" prov="human" title="Preview" subtitle={`${pages.pages.length} page${pages.pages.length === 1 ? "" : "s"} · ${stats.words} words`}>
        <PaginationPreview model={editor.model} />
      </Card>
      <Card span={5} eyebrow="EXPORT" title="Export" subtitle="Deterministic renderers, run in this browser">
        <Stack gap={3}>
          <Properties rows={[
            { label: "HTML", value: "Semantic headings, lists, tables and image references" },
            { label: "Markdown", value: "CommonMark with tables" },
            { label: "Plain text", value: "Reading order with blank lines between blocks" },
            { label: "PDF", value: <Pill tone="warning">Print dialog only</Pill> },
          ]} />
          <Row gap={2} wrap>
            <Button variant="primary" icon={<FileDown size={15} />} onClick={() => {
              downloadFile(`${record.title}.html`, toHtml(editor.model, record.title), "text/html");
              void context.mutate.log(`${record.title} exported as HTML`, { entityId: record.id, type: "export" });
            }}>HTML</Button>
            <Button variant="secondary" onClick={() => {
              downloadFile(`${record.title}.md`, toMarkdown(editor.model, record.title), "text/markdown");
              void context.mutate.log(`${record.title} exported as Markdown`, { entityId: record.id, type: "export" });
            }}>Markdown</Button>
            <Button variant="secondary" onClick={() => downloadFile(`${record.title}.txt`, toPlainText(editor.model), "text/plain")}>Plain text</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("PDF settings")}>PDF settings</Button>
          </Row>
          <Notice tone="neutral">A pending tracked deletion is left out of every export, and a pending insertion is included once it is accepted.</Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * ARL-DOCS-007 — Document Insights
 * ====================================================================== */

interface Proposal { id: string; title: string; detail: string; blockId?: string; apply?: (model: DocModel) => DocModel }

function writingProposals(model: DocModel): Proposal[] {
  const list: Proposal[] = [];
  for (const block of model.blocks) {
    if (!isTextBlock(block)) continue;
    const text = visibleText(block);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    if (words > 90) {
      list.push({
        id: `long-${block.id}`, blockId: block.id,
        title: "Split a long paragraph",
        detail: `This block runs to ${words} words. A reader loses the thread past about sixty.`,
      });
    }
    const doubleSpace = text.includes("  ");
    if (doubleSpace) {
      list.push({
        id: `space-${block.id}`, blockId: block.id,
        title: "Remove a double space",
        detail: "Two consecutive spaces appear in this block.",
        apply: (current) => ({
          ...current,
          blocks: current.blocks.map((item) => (item.id === block.id
            ? { ...item, runs: item.runs.map((run) => ({ ...run, text: run.text.replace(/ {2,}/g, " ") })) }
            : item)),
        }),
      });
    }
    const passive = text.match(/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi);
    if (passive && passive.length > 1) {
      list.push({
        id: `passive-${block.id}`, blockId: block.id,
        title: "Passive voice",
        detail: `${passive.length} passive constructions in this block: ${passive.slice(0, 3).join(", ")}.`,
      });
    }
  }
  return list;
}

const CLAIM_PATTERN = /\b(\d+(\.\d+)?%|£\s?\d[\d,.]*|\$\s?\d[\d,.]*|\d+\s?(weeks?|days?|units?|customers?))\b/gi;

function InsightsScreen({ context, tab }: { context: ScreenContext; tab: "Writing" | "Accuracy" | "Brand" | "Sources" }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const pool = useCollections(["workbooks", "invoices", "products", "documents"]);
  const model = capabilityById("model.inference");

  if (!record) return <Empty title="No document is open" icon={<FileText size={20} />} />;

  const stats = documentStats(editor.model);

  if (tab === "Writing") {
    const proposals = writingProposals(editor.model);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="human" label="Words" value={String(stats.words)} meta={`${stats.paragraphs} paragraphs`} />
          <Stat prov="human" label="Sentences" value={String(stats.sentences)} meta={stats.averageSentenceWords ? `${stats.averageSentenceWords} words on average` : "No sentence ending found"} />
          <Stat prov="human" label="Long paragraphs" value={String(stats.longParagraphs)} meta="Over 90 words" />
          <Stat prov="human" label="Reading time" value={`${stats.readingMinutes} min`} meta="At 220 words a minute" />
        </StatRow>
        <Notice tone="warning" title={`${model?.provider ?? "Model provider"} is not connected`}>
          Every suggestion below is computed from the text in this browser by a deterministic rule. Nothing is generated, and nothing was sent anywhere.
        </Notice>
        {proposals.length === 0 ? (
          <Empty title="Nothing flagged" icon={<CheckCheck size={20} />}>No paragraph exceeds ninety words, and no double spaces or repeated passive constructions were found.</Empty>
        ) : (
          <DataGrid
            rows={proposals}
            rowId={(row) => row.id}
            label="Writing suggestions"
            filterable={false}
            columns={[
              { key: "title", header: "Suggestion", primary: true, cell: (row) => row.title },
              { key: "detail", header: "Why", cell: (row) => row.detail },
              { key: "apply", header: "Can apply", align: "end", cell: (row) => (row.apply ? <Pill tone="success">Yes</Pill> : <Pill tone="neutral">Manual</Pill>) },
            ]}
            onOpen={(id) => context.openOverlay("Suggestion diff", { id })}
            bulkActions={[{
              label: "Apply selected",
              disabled: (rows) => rows.every((row) => !row.apply),
              onRun: (rows) => {
                let next = editor.model;
                let applied = 0;
                for (const row of rows) if (row.apply) { next = row.apply(next); applied += 1; }
                if (applied === 0) return;
                editor.commit(next, "Apply writing suggestions");
                context.toast("Applied", `${applied} suggestion${applied === 1 ? "" : "s"} written into the document. The rest need a human edit.`);
              },
            }]}
          />
        )}
        <Card eyebrow="WRITING" prov="human" title="Sentence length" subtitle="Per section, from the text in this browser">
          <BarChart
            title="Words per section"
            height={200}
            format={(value) => `${Math.round(value)}w`}
            series={[{ name: "Words", points: outline(editor.model).map((node) => ({ label: node.text.slice(0, 18), value: node.words })) }]}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Accuracy") {
    const claims: { id: string; blockId: string; text: string; claim: string; supported?: Rec }[] = [];
    for (const block of editor.model.blocks) {
      if (!isTextBlock(block)) continue;
      const text = visibleText(block);
      const found = text.match(CLAIM_PATTERN);
      if (!found) continue;
      for (const claim of new Set(found)) {
        const normalized = claim.replace(/\s/g, "");
        const supported = [...pool.workbooks, ...pool.invoices, ...pool.products].find((candidate) => {
          const haystack = `${candidate.title} ${candidate.summary} ${JSON.stringify(candidate.body ?? "")} ${candidate.amountMinor ?? ""}`.replace(/\s/g, "");
          return haystack.includes(normalized.replace(/[£$,]/g, "")) || haystack.includes(normalized);
        });
        claims.push({ id: `${block.id}-${claim}`, blockId: block.id, text: text.slice(0, 120), claim, supported });
      }
    }
    const unsupported = claims.filter((item) => !item.supported);
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="A figure with no record behind it is flagged, not corrected">
          Each number in the document is matched against workbooks, invoices and products in this workspace. Where nothing matches, the claim is listed as unsupported. No citation is invented and no legal or financial advice is produced.
        </Notice>
        <StatRow>
          <Stat prov="human" label="Figures in the text" value={String(claims.length)} />
          <Stat prov="human" label="Matched to a record" value={String(claims.length - unsupported.length)} />
          <Stat prov="human" label="Unsupported" value={String(unsupported.length)} meta={unsupported.length ? "Needs a source" : "Everything traced"} />
        </StatRow>
        {claims.length === 0 ? <Empty title="No figures in the text" icon={<Search size={20} />}>Percentages, money and counted quantities are checked. This document has none.</Empty> : (
          <DataGrid
            rows={claims}
            rowId={(row) => row.id}
            label="Factual checks"
            filterable={false}
            rowTone={(row) => (row.supported ? undefined : "warning")}
            columns={[
              { key: "claim", header: "Figure", primary: true, cell: (row) => <strong className="ds-num">{row.claim}</strong> },
              { key: "text", header: "In context", cell: (row) => <span className="ds-truncate">{row.text}</span> },
              { key: "source", header: "Source", cell: (row) => (row.supported ? <Pill tone="success">{row.supported.title}</Pill> : <Pill tone="warning">No record matches</Pill>) },
            ]}
            onOpen={(id) => context.openOverlay("source inspection", { id })}
          />
        )}
      </Stack>
    );
  }

  if (tab === "Brand") {
    const banned = ["world-class", "best-in-class", "revolutionary", "synergy", "game-changing", "seamless", "cutting-edge"];
    const text = toPlainText(editor.model).toLowerCase();
    const hits = banned.filter((phrase) => text.includes(phrase));
    const headingStyle = editor.model.blocks.filter((block) => headingLevel(block) && /[.!?]$/.test(visibleText(block).trim()));
    const sentenceCase = editor.model.blocks.filter((block) => headingLevel(block) && visibleText(block).trim().split(/\s+/).filter((word) => /^[A-Z]/.test(word)).length > 2);
    return (
      <Grid>
        <Card span={6} eyebrow="BRAND" prov="human" title="House style" subtitle="Checked against the rules kept in this workspace">
          <Stack gap={3}>
            {hits.length === 0
              ? <Notice tone="success" title="No banned phrase found">The marketing vocabulary list is clean for this document.</Notice>
              : <Notice tone="warning" title={`${hits.length} phrase${hits.length === 1 ? "" : "s"} from the banned list`}>{hits.join(", ")}</Notice>}
            {headingStyle.length > 0 && <Notice tone="warning">{headingStyle.length} heading{headingStyle.length === 1 ? "" : "s"} end in punctuation. House style is no full stop on a heading.</Notice>}
            {sentenceCase.length > 0 && <Notice tone="info">{sentenceCase.length} heading{sentenceCase.length === 1 ? " uses" : "s use"} title case. House style is sentence case.</Notice>}
          </Stack>
        </Card>
        <Card span={6} eyebrow="READABILITY" prov="human" title="Readability" subtitle="Structural, not a score out of a hat">
          <Properties rows={[
            { label: "Average sentence", value: stats.averageSentenceWords ? `${stats.averageSentenceWords} words` : "Unavailable — no sentence ending found" },
            { label: "Paragraphs over 90 words", value: String(stats.longParagraphs) },
            { label: "Passive constructions", value: String(stats.passiveHints) },
            { label: "Headings", value: `${stats.headings} across ${stats.paragraphs} paragraphs` },
          ]} />
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("style settings")}>Style settings</Button>
        </Card>
      </Grid>
    );
  }

  const pool_ = [...pool.documents, ...pool.workbooks, ...pool.invoices, ...pool.products];
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Sources are records, not footnotes">
        A reference either names a record that exists in this workspace or it is shown as having no source. That is the whole mechanism: there is no citation database to draw on.
      </Notice>
      {editor.model.references.length === 0 ? (
        <Empty title="No references recorded" icon={<Link2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("citations", { mode: "reference" })}>Add a reference</Button>} />
      ) : (
        <DataGrid
          rows={editor.model.references}
          rowId={(row) => row.id}
          label="Sources"
          filterable={false}
          columns={[
            { key: "label", header: "Reference", primary: true, cell: (row) => row.label },
            { key: "record", header: "Record", cell: (row) => { const found = pool_.find((item) => item.id === row.recordId); return found ? <Pill tone="success">{found.title}</Pill> : <Pill tone="warning">Unsourced</Pill>; } },
            { key: "collection", header: "Kind", cell: (row) => pool_.find((item) => item.id === row.recordId)?.collection ?? "—" },
            { key: "note", header: "Note", cell: (row) => row.note || "—" },
          ]}
          onOpen={(id) => context.openOverlay("source inspection", { referenceId: id })}
        />
      )}
    </Stack>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function NewDocumentOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const templates = useCollection("templates").filter((record) => record.fields.kind === "document" && record.status !== "retired");
  const payload = context.overlayPayload as { templateId?: string } | undefined;
  const { org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(payload?.templateId ?? "");
  const [folder, setFolder] = useState("Unfiled");
  const [confidential, setConfidential] = useState(false);
  const existing = useCollection("documents");
  const duplicate = existing.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());

  return (
    <form
      id="new-doc"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const template = templates.find((record) => record.id === templateId);
        const body = template ? readDoc(template.body, context.actor, context.now.toISOString()) : readDoc(undefined, context.actor, context.now.toISOString());
        const created = await context.mutate.create({
          collection: "documents",
          title: title.trim(),
          status: "draft",
          summary: template ? `Started from ${template.title}.` : "New document.",
          tags: confidential ? ["confidential"] : [],
          fields: { folder, confidential, kind: template ? String(template.fields.kind ?? "document") : "document", templateId: templateId || "" },
          body,
        }, `Document ${title.trim()} created`);
        if (template) {
          await context.mutate.patch(template.id, { fields: { ...template.fields, usedBy: Number(template.fields.usedBy ?? 0) + 1 } }, { skipHistory: true });
        }
        context.toast("Document created", `${created.title} is in ${folder}.`);
        close();
        context.navigate(`/o/${org.slug}/docs/documents/${created.id}`);
      }}
    >
      <Field label="Title" required hint="Shown in the library, the outline and every export.">
        <TextInput aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required autoFocus />
      </Field>
      {duplicate && <Notice tone="danger" title="A document already has that title">Two documents with the same title make a search result ambiguous.</Notice>}
      <Field label="Start from" hint="A template fills the sections and leaves the company fields as tokens.">
        <Select aria-label="Start from" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Blank document</option>
          {templates.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
        </Select>
      </Field>
      <Field label="Folder">
        <Select aria-label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
          {["Unfiled", "Policies", "Proposals", "Operations", "Legal", "Procurement"].map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Checkbox label="Confidential — keep the body out of search previews" checked={confidential} onChange={(event) => setConfidential(event.target.checked)} />
    </form>
  );
}

function FolderSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const documents = useCollection("documents");
  const ids = payload?.ids ?? (context.selectedId ? [context.selectedId] : []);
  const targets = documents.filter((record) => ids.includes(record.id));
  const [folder, setFolder] = useState("Unfiled");
  return (
    <form
      id="folder-selector"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        for (const record of targets) {
          await context.mutate.patch(record.id, { fields: { ...record.fields, folder } }, { expectRevision: record.revision, event: `${record.title} moved to ${folder}` });
        }
        context.toast("Moved", `${targets.length} document${targets.length === 1 ? "" : "s"} moved to ${folder}.`);
        close();
      }}
    >
      {targets.length === 0 ? <Notice tone="warning" title="Nothing selected">Choose a document in the list first.</Notice> : (
        <>
          <Properties rows={targets.map((record) => ({ label: record.title, value: String(record.fields.folder ?? "Unfiled") }))} />
          <Field label="Move to">
            <Select aria-label="Move to" value={folder} onChange={(event) => setFolder(event.target.value)}>
              {["Unfiled", "Policies", "Proposals", "Operations", "Legal", "Procurement"].map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </Field>
        </>
      )}
    </form>
  );
}

function SharingOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const [scope, setScope] = useState<"workspace" | "link">("workspace");
  const [note, setNote] = useState("");
  if (!record) return <Empty title="Select a document first" />;
  const model = readDoc(record.body, record.ownerName, record.updatedAt);
  return (
    <form
      id="sharing"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const next: DocModel = {
          ...model,
          shares: [{ id: nextId("sh"), at: context.now.toISOString(), scope, note: note || "No note" }, ...model.shares],
        };
        await context.mutate.patch(record.id, { body: next }, { expectRevision: record.revision, event: `Share link created on ${record.title} (${scope})` });
        context.toast("Share recorded", "The link is on the record with its scope and can be revoked from Publishing.");
        close();
      }}
    >
      <Field label="Who can open it">
        <Select aria-label="Who can open it" value={scope} onChange={(event) => setScope(event.target.value as "workspace" | "link")}>
          <option value="workspace">This workspace only</option>
          <option value="link">Anyone with the link</option>
        </Select>
      </Field>
      <Field label="Why" hint="Recorded with the link so a later reviewer knows what it was for.">
        <TextInput aria-label="Why" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Sent to the Clerkenwell project manager" />
      </Field>
      {scope === "link" && (
        <Notice tone="warning" title="A link here is a local record, not a public URL">
          No hosting is connected, so nothing becomes reachable outside this browser. The link appears under Publishing with a revoke button, and revoking is recorded with its time.
        </Notice>
      )}
      {record.fields.confidential === true && (
        <Notice tone="danger" title="This document is marked confidential">Confidential documents are excluded from broad previews. Creating a link anyway is recorded against the document.</Notice>
      )}
    </form>
  );
}

function TrashConfirm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const documents = useCollection("documents");
  const ids = payload?.ids ?? (context.selectedId ? [context.selectedId] : []);
  const targets = documents.filter((record) => ids.includes(record.id));
  const [confirm, setConfirm] = useState("");
  const signed = targets.filter((record) => record.fields.signatureStatus === "signed");
  return (
    <form
      id="trash-confirm"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (confirm !== "delete") return;
        for (const record of targets) await context.mutate.remove(record.id, `${record.title} deleted from the library`);
        context.toast("Deleted", `${targets.length} document${targets.length === 1 ? "" : "s"} removed from this browser.`, "blocked");
        close();
      }}
    >
      <Notice tone="danger" title={`Delete ${targets.length} document${targets.length === 1 ? "" : "s"}`}>
        This removes the record and its version history from this browser. There is no server copy to restore from.
      </Notice>
      <Properties rows={targets.map((record) => ({ label: record.title, value: `${record.history.length} versions` }))} />
      {signed.length > 0 && <Notice tone="warning" title="A signed document is in this selection">Deleting a signed document removes the only copy of what was agreed.</Notice>}
      <Field label="Type delete to confirm" required>
        <TextInput aria-label="Type delete to confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="delete" />
      </Field>
    </form>
  );
}

function StylesOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [edits, setEdits] = useState<Record<string, { fontSize: string; weight: string; spaceBefore: string }>>({});
  if (!record) return <Empty title="No document is open" />;
  return (
    <form
      id="styles"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const styles = editor.model.styles.map((style) => {
          const edit = edits[style.id];
          if (!edit) return style;
          return {
            ...style,
            fontSize: Number(edit.fontSize) || style.fontSize,
            weight: Number(edit.weight) || style.weight,
            spaceBefore: Number(edit.spaceBefore) || style.spaceBefore,
          };
        });
        editor.commit({ ...editor.model, styles }, "Edit styles");
        context.toast("Styles saved", "Every block carrying a changed style updates in the canvas.");
        close();
      }}
    >
      <p className="ds-subtle">A named style is applied to blocks, so changing it here changes every block that uses it.</p>
      <Stack gap={3}>
        {editor.model.styles.map((style) => {
          const used = editor.model.blocks.filter((block) => block.styleId === style.id).length;
          const edit = edits[style.id] ?? { fontSize: String(style.fontSize), weight: String(style.weight), spaceBefore: String(style.spaceBefore) };
          return (
            <div key={style.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Row gap={2}><strong className="ds-grow">{style.name}</strong><Pill tone={used ? "info" : "neutral"}>{used} block{used === 1 ? "" : "s"}</Pill></Row>
              <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                <Field label="Size"><TextInput aria-label="Size" inputMode="numeric" align="end" value={edit.fontSize} onChange={(event) => setEdits((current) => ({ ...current, [style.id]: { ...edit, fontSize: event.target.value } }))} /></Field>
                <Field label="Weight"><TextInput aria-label="Weight" inputMode="numeric" align="end" value={edit.weight} onChange={(event) => setEdits((current) => ({ ...current, [style.id]: { ...edit, weight: event.target.value } }))} /></Field>
                <Field label="Space before"><TextInput aria-label="Space before" inputMode="numeric" align="end" value={edit.spaceBefore} onChange={(event) => setEdits((current) => ({ ...current, [style.id]: { ...edit, spaceBefore: event.target.value } }))} /></Field>
              </Row>
            </div>
          );
        })}
      </Stack>
    </form>
  );
}

function InsertOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const assets = useCollection("assets");
  const payload = context.overlayPayload as { mode?: string; blockId?: string } | undefined;
  const mode = payload?.mode === "image" ? "image" : "table";
  const [rows, setRows] = useState("3");
  const [cols, setCols] = useState("3");
  const [header, setHeader] = useState(true);
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [width, setWidth] = useState("100");
  if (!record) return <Empty title="No document is open" />;
  const existing = payload?.blockId ? editor.model.blocks[blockIndex(editor.model, payload.blockId)] : undefined;

  return (
    <form
      id="insert"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "image") {
          if (existing) {
            const blocks = editor.model.blocks.map((block) => (block.id === existing.id
              ? { ...block, image: { assetId: assetId || undefined, alt, caption, widthPercent: Number(width) || 100 } }
              : block));
            editor.commit({ ...editor.model, blocks }, "Image reference");
          } else {
            const block: Block = { ...emptyBlock("image"), image: { assetId: assetId || undefined, alt, caption, widthPercent: Number(width) || 100 } };
            const result = insertBlockAfter(editor.model, editor.selection?.head.blockId, block);
            editor.commit(result.model, "Insert image", result.selection);
          }
          context.toast("Image reference saved", assetId ? "The document points at the asset record; no file was copied into the document." : "No asset is referenced yet, which is shown in the frame.");
          close();
          return;
        }
        const rowCount = Math.max(1, Math.min(20, Number(rows) || 3));
        const colCount = Math.max(1, Math.min(8, Number(cols) || 3));
        const table = {
          header,
          rows: Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: colCount }, (_, colIndex) => (header && rowIndex === 0 ? `Column ${colIndex + 1}` : ""))),
        };
        const result = insertBlockAfter(editor.model, editor.selection?.head.blockId, { ...emptyBlock("table"), table });
        editor.commit(result.model, "Insert table", result.selection);
        context.toast("Table inserted", `${rowCount} × ${colCount}. Cells are plain text inputs and are keyboard reachable.`);
        close();
      }}
    >
      {mode === "image" ? (
        <>
          <Notice tone="info" title="Images are held by reference">
            The document stores the asset's record id. Nothing is copied into the document body, so the asset stays the single source.
          </Notice>
          <Field label="Asset" hint={assets.length ? undefined : "No assets are in this workspace yet."}>
            <Select aria-label="Asset" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">No asset yet</option>
              {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
            </Select>
          </Field>
          <Field label="Alternative text" required hint="Read out instead of the image. An empty value is reported in Insights.">
            <TextInput aria-label="Alternative text" value={alt} onChange={(event) => setAlt(event.target.value)} required />
          </Field>
          <Field label="Caption"><TextInput aria-label="Caption" value={caption} onChange={(event) => setCaption(event.target.value)} /></Field>
          <Field label="Width (%)"><TextInput aria-label="Width (%)" inputMode="numeric" align="end" value={width} onChange={(event) => setWidth(event.target.value)} /></Field>
        </>
      ) : (
        <>
          <Row gap={3}>
            <Field label="Rows"><TextInput aria-label="Rows" inputMode="numeric" align="end" value={rows} onChange={(event) => setRows(event.target.value)} /></Field>
            <Field label="Columns"><TextInput aria-label="Columns" inputMode="numeric" align="end" value={cols} onChange={(event) => setCols(event.target.value)} /></Field>
          </Row>
          <Checkbox label="First row is a header" checked={header} onChange={(event) => setHeader(event.target.checked)} />
          <Notice tone="neutral">Table cells hold plain text. For a calculation, link a workbook range from Sheets instead.</Notice>
        </>
      )}
    </form>
  );
}

function CitationsOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const pool = useCollections(["workbooks", "invoices", "products", "documents"]);
  const payload = context.overlayPayload as { mode?: string; range?: DocRange } | undefined;
  const mode = payload?.mode === "comment" ? "comment" : "reference";
  const [label, setLabel] = useState("");
  const [recordId, setRecordId] = useState("");
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [mandatory, setMandatory] = useState(false);
  if (!record) return <Empty title="No document is open" />;
  const candidates = [...pool.workbooks, ...pool.invoices, ...pool.products, ...pool.documents.filter((item) => item.id !== record.id)];
  const range = payload?.range ?? editor.selection;

  if (mode === "comment") {
    const quote = range ? (() => {
      const block = editor.model.blocks[blockIndex(editor.model, range.anchor.blockId)];
      if (!block) return "";
      const from = Math.min(range.anchor.offset, range.head.offset);
      const to = Math.max(range.anchor.offset, range.head.offset);
      return blockText(block).slice(from, to);
    })() : "";
    return (
      <form
        id="citations"
        className="ds-stack ds-gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!range || !body.trim()) return;
          const result = addComment(editor.model, range, body.trim(), editor.actor, mandatory);
          if (!result) {
            context.toast("Select some text first", "A comment anchors to a block range, so it needs a selection.", "blocked");
            return;
          }
          editor.commit(result.model, "Add comment");
          context.toast("Comment added", `Anchored to ${result.comment.anchor.start}–${result.comment.anchor.end} in that block.`);
          close();
        }}
      >
        {quote ? <blockquote style={{ margin: 0, paddingInlineStart: "var(--space-3)", borderInlineStart: "2px solid var(--warning-border)", color: "var(--fg-muted)" }}>{quote}</blockquote>
          : <Notice tone="warning" title="No text is selected">Select the words the comment is about in the editor, then comment. The anchor is a block id and an offset range.</Notice>}
        <Field label="Comment" required><TextArea aria-label="Comment" value={body} onChange={(event) => setBody(event.target.value)} rows={4} required /></Field>
        <Checkbox label="Mandatory — approval is blocked until this is resolved" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />
      </form>
    );
  }

  return (
    <form
      id="citations"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim()) return;
        editor.commit({
          ...editor.model,
          references: [...editor.model.references, { id: nextId("rf"), label: label.trim(), recordId: recordId || undefined, note }],
        }, "Add reference");
        context.toast("Reference added", recordId ? "It points at a record in this workspace." : "It is recorded as unsourced so a reviewer can see it needs one.");
        close();
      }}
    >
      <Field label="Reference" required hint="How it should read in the document.">
        <TextInput aria-label="Reference" value={label} onChange={(event) => setLabel(event.target.value)} required autoFocus />
      </Field>
      <Field label="Record in this workspace" hint="Leave empty to record it honestly as unsourced.">
        <Select aria-label="Record in this workspace" value={recordId} onChange={(event) => setRecordId(event.target.value)}>
          <option value="">No source recorded</option>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.collection}: {candidate.title}</option>)}
        </Select>
      </Field>
      <Field label="Note"><TextInput aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Figures read from the Pipeline sheet, column B" /></Field>
      <Notice tone="warning">No external citation index is connected. A reference without a record stays marked unsourced rather than being filled in.</Notice>
    </form>
  );
}

function LinkOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const payload = context.overlayPayload as { range?: DocRange } | undefined;
  const range = payload?.range ?? editor.selection;
  const [href, setHref] = useState("");
  if (!record) return <Empty title="No document is open" />;
  const expanded = Boolean(range && !(range.anchor.blockId === range.head.blockId && range.anchor.offset === range.head.offset));
  return (
    <form
      id="link"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!range) return;
        const result = setLink(editor.model, range, href.trim() || undefined);
        editor.commit(result.model, href.trim() ? "Add link" : "Remove link", result.selection);
        close();
      }}
    >
      {expanded ? <p className="ds-subtle">The link is applied to the selected run and nothing else.</p>
        : <Notice tone="warning" title="No text is selected">Select the words to link first. A link is an inline mark on a run, not a separate node.</Notice>}
      <Field label="Address" hint="Leave empty and save to remove an existing link.">
        <TextInput aria-label="Address" value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://" autoFocus />
      </Field>
    </form>
  );
}

function ExportOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [format, setFormat] = useState<"html" | "markdown" | "text">("html");
  if (!record) return <Empty title="No document is open" />;
  const content = format === "html" ? toHtml(editor.model, record.title) : format === "markdown" ? toMarkdown(editor.model, record.title) : toPlainText(editor.model);
  return (
    <form
      id="export"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const extension = format === "html" ? "html" : format === "markdown" ? "md" : "txt";
        const mime = format === "html" ? "text/html" : format === "markdown" ? "text/markdown" : "text/plain";
        downloadFile(`${record.title}.${extension}`, content, mime);
        void context.mutate.log(`${record.title} exported as ${format}`, { entityId: record.id, type: "export" });
        context.toast("Exported", `${record.title}.${extension} was written by the local renderer.`);
        close();
      }}
    >
      <Segmented
        label="Format"
        value={format}
        onChange={setFormat}
        options={[{ value: "html", label: "HTML" }, { value: "markdown", label: "Markdown" }, { value: "text", label: "Plain text" }]}
      />
      <Field label="Preview" hint={`${content.length} characters`}>
        <TextArea aria-label="Preview" readOnly rows={12} value={content.slice(0, 4000)} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }} />
      </Field>
      <Notice tone="neutral">The renderer is deterministic: the same document always produces the same bytes. Pending tracked deletions are excluded.</Notice>
    </form>
  );
}

function HeadingProperties({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const payload = context.overlayPayload as { blockId?: string } | undefined;
  const block = payload?.blockId ? editor.model.blocks[blockIndex(editor.model, payload.blockId)] : currentBlock(editor);
  const [level, setLevel] = useState<string>(block ? String(headingLevel(block) || 2) : "2");
  const [styleId, setStyleId] = useState(block?.styleId ?? "");
  if (!record || !block) return <Empty title="Select a heading first" />;
  const span = sectionSpan(editor.model, blockIndex(editor.model, block.id));
  return (
    <form
      id="heading-properties"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const type = `heading${Number(level)}` as BlockType;
        const range = { anchor: { blockId: block.id, offset: 0 }, head: { blockId: block.id, offset: 0 } };
        let next = setBlockType(editor.model, range, type).model;
        next = setStyle(next, range, styleId || undefined).model;
        editor.commit(next, "Heading properties", range);
        close();
      }}
    >
      <Properties rows={[
        { label: "Text", value: visibleText(block) || "(empty)" },
        { label: "Section length", value: `${span} block${span === 1 ? "" : "s"}` },
        { label: "Comments anchored here", value: String(editor.model.comments.filter((comment) => comment.anchor.blockId === block.id).length) },
      ]} />
      <Field label="Level">
        <Select aria-label="Level" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
        </Select>
      </Field>
      <Field label="Named style">
        <Select aria-label="Named style" value={styleId} onChange={(event) => setStyleId(event.target.value)}>
          <option value="">No named style</option>
          {editor.model.styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
        </Select>
      </Field>
    </form>
  );
}

function StructureWarningOverlay({ context }: { context: ScreenContext }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  if (!record) return <Empty title="No document is open" />;
  const warnings = structureWarnings(editor.model);
  if (warnings.length === 0) return <Notice tone="success" title="The outline is sound">Headings start at level one and step down one level at a time.</Notice>;
  return (
    <Stack gap={3}>
      {warnings.map((warning) => (
        <div key={warning.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <p>{warning.message}</p>
          {warning.blockId && warning.id.startsWith("skip-") && (
            <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => {
              const block = editor.model.blocks[blockIndex(editor.model, warning.blockId!)];
              if (!block) return;
              const level = headingLevel(block);
              const previous = outline(editor.model).filter((node) => node.index < blockIndex(editor.model, block.id)).at(-1);
              const target = Math.min(3, (previous?.level ?? 1) + 1) as 1 | 2 | 3;
              if (target === level) return;
              const range = { anchor: { blockId: block.id, offset: 0 }, head: { blockId: block.id, offset: 0 } };
              editor.commit(setBlockType(editor.model, range, `heading${target}` as BlockType).model, "Fix heading level", range);
              context.toast("Heading level fixed", `“${visibleText(block)}” is now heading ${target}.`);
            }}>Step it down one level</Button>
          )}
          {warning.blockId && warning.id.startsWith("empty-") && (
            <Button size="sm" variant="ghost" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => {
              editor.commit(removeBlock(editor.model, warning.blockId!).model, "Remove empty heading");
            }}>Remove the empty heading</Button>
          )}
        </div>
      ))}
    </Stack>
  );
}

function CommentThread({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const comment = editor.model.comments.find((item) => item.id === payload?.id);
  const [body, setBody] = useState("");
  if (!record || !comment) return <Empty title="Comment not found" />;
  return (
    <form
      id="comment-thread"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        editor.commit({
          ...editor.model,
          comments: editor.model.comments.map((item) => (item.id === comment.id
            ? { ...item, replies: [...item.replies, { id: nextId("rp"), author: context.actor, at: context.now.toISOString(), body: body.trim() }] }
            : item)),
        }, "Reply");
        close();
      }}
    >
      <blockquote style={{ margin: 0, paddingInlineStart: "var(--space-3)", borderInlineStart: "2px solid var(--warning-border)", color: "var(--fg-muted)" }}>{comment.quote}</blockquote>
      <Stack gap={2}>
        <Row gap={2}><strong>{comment.author}</strong><span className="ds-subtle">{context.dateTime(comment.at)}</span></Row>
        <p>{comment.body}</p>
        {comment.replies.map((reply) => (
          <Row key={reply.id} gap={2} style={{ paddingInlineStart: "var(--space-4)" }}>
            <strong>{reply.author}</strong><span className="ds-grow">{reply.body}</span><span className="ds-subtle">{context.relative(reply.at)}</span>
          </Row>
        ))}
      </Stack>
      <Field label="Reply" required><TextArea aria-label="Reply" value={body} onChange={(event) => setBody(event.target.value)} rows={3} required /></Field>
    </form>
  );
}

function DiffOverlay({ context }: { context: ScreenContext }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const payload = context.overlayPayload as { id?: string; snapshotId?: string } | undefined;
  if (!record) return <Empty title="No document is open" />;
  if (payload?.snapshotId) {
    const index = Number(payload.snapshotId.split("-").pop());
    const snapshot = record.history[index];
    if (!snapshot) return <Empty title="Version not found" />;
    const before = readDoc(snapshot.body, record.ownerName, snapshot.at);
    const beforeStats = documentStats(before);
    const afterStats = documentStats(editor.model);
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Version saved", value: context.dateTime(snapshot.at) },
          { label: "Words then / now", value: `${beforeStats.words} → ${afterStats.words}` },
          { label: "Blocks then / now", value: `${before.blocks.length} → ${editor.model.blocks.length}` },
          { label: "Headings then / now", value: `${beforeStats.headings} → ${afterStats.headings}` },
        ]} />
        <Card eyebrow="REMOVED" prov="posted" title="Blocks only in the stored version">
          <Stack gap={1}>
            {before.blocks.filter((block) => !editor.model.blocks.some((item) => visibleText(item) === visibleText(block))).slice(0, 8).map((block) => (
              <span key={block.id} className="ds-truncate" style={{ color: "var(--danger)" }}>− {visibleText(block) || `(${block.type})`}</span>
            ))}
          </Stack>
        </Card>
        <Card eyebrow="ADDED" prov="human" title="Blocks only in the current document">
          <Stack gap={1}>
            {editor.model.blocks.filter((block) => !before.blocks.some((item) => visibleText(item) === visibleText(block))).slice(0, 8).map((block) => (
              <span key={block.id} className="ds-truncate" style={{ color: "var(--success)" }}>+ {visibleText(block) || `(${block.type})`}</span>
            ))}
          </Stack>
        </Card>
      </Stack>
    );
  }
  const suggestion = editor.model.suggestions.find((item) => item.id === payload?.id);
  if (!suggestion) return <Empty title="Select a change" />;
  const affected = editor.model.blocks.filter((block) => block.runs.some((run) => run.suggestion?.id === suggestion.id));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Kind", value: suggestion.kind },
        { label: "By", value: suggestion.author },
        { label: "When", value: context.dateTime(suggestion.at) },
        { label: "Status", value: suggestion.status },
      ]} />
      {affected.map((block) => (
        <Card key={block.id} title="In context">
          <p>
            {block.runs.map((run, index) => (
              <span
                key={index}
                style={run.suggestion?.id === suggestion.id
                  ? { color: run.suggestion.kind === "insert" ? "var(--success)" : "var(--danger)", textDecoration: run.suggestion.kind === "insert" ? "underline" : "line-through" }
                  : undefined}
              >{run.text}</span>
            ))}
          </p>
        </Card>
      ))}
      <Row gap={2}>
        <Button variant="primary" onClick={() => editor.commit(resolveSuggestion(editor.model, suggestion.id, "accepted"), "Accept change")}>Accept</Button>
        <Button variant="secondary" onClick={() => editor.commit(resolveSuggestion(editor.model, suggestion.id, "rejected"), "Reject change")}>Reject</Button>
      </Row>
    </Stack>
  );
}

function ReviewerAssignment({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const members = useCollection("members").filter((member) => member.fields.kind === "human");
  const [chosen, setChosen] = useState<string[]>([]);
  const [mandatory, setMandatory] = useState(true);
  if (!record) return <Empty title="No document is open" />;
  return (
    <form
      id="reviewer-assignment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (chosen.length === 0) return;
        await context.mutate.patch(record.id, {
          status: "in_review",
          fields: { ...record.fields, reviewers: chosen.join("|"), reviewMandatory: mandatory },
        }, { expectRevision: record.revision, event: `Reviewers assigned to ${record.title}: ${chosen.join(", ")}` });
        context.toast("Reviewers assigned", `${chosen.length} reviewer${chosen.length === 1 ? "" : "s"} recorded on the document. No notification service is connected, so nobody was emailed.`);
        close();
      }}
    >
      <Stack gap={2}>
        {members.map((member) => (
          <Checkbox
            key={member.id}
            label={`${member.title} — ${String(member.fields.title ?? "member")}`}
            checked={chosen.includes(member.title)}
            onChange={(event) => setChosen((current) => (event.target.checked ? [...current, member.title] : current.filter((name) => name !== member.title)))}
          />
        ))}
      </Stack>
      <Checkbox label="Their review is mandatory before approval" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />
      <Notice tone="neutral">Assignment changes the document status to in review and records the names. Role views shape the interface and are not an account security boundary.</Notice>
    </form>
  );
}

function TemplateEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; mode?: string } | undefined;
  const template = useRecord(payload?.id);
  const documents = useCollection("documents");
  const { org } = useWorkspace();
  const [title, setTitle] = useState(template?.title ?? "");
  const [summary, setSummary] = useState(template?.summary ?? "");
  const [scope, setScope] = useState(String(template?.fields.scope ?? "company"));
  const [tokens, setTokens] = useState(String(template?.fields.tokens ?? ""));
  const [documentTitle, setDocumentTitle] = useState("");

  if (payload?.mode === "use" && template) {
    return (
      <form
        id="template-editor"
        className="ds-stack ds-gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!documentTitle.trim()) return;
          const created = await context.mutate.create({
            collection: "documents",
            title: documentTitle.trim(),
            status: "draft",
            summary: `Created from ${template.title}.`,
            fields: { folder: "Unfiled", templateId: template.id, kind: String(template.fields.kind ?? "document"), confidential: false },
            body: readDoc(template.body, context.actor, context.now.toISOString()),
          }, `Document created from ${template.title}`);
          await context.mutate.patch(template.id, { fields: { ...template.fields, usedBy: Number(template.fields.usedBy ?? 0) + 1 } }, { skipHistory: true });
          close();
          context.navigate(`/o/${org.slug}/docs/documents/${created.id}`);
        }}
      >
        <Field label="New document title" required>
          <TextInput aria-label="New document title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} required autoFocus />
        </Field>
        <Notice tone="info" title="Tokens stay as tokens">
          {String(template.fields.tokens ?? "No tokens mapped")}. They are left in the text so a person fills them in deliberately rather than finding a wrong figure already there.
        </Notice>
      </form>
    );
  }

  return (
    <form
      id="template-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        if (template) {
          await context.mutate.patch(template.id, {
            title: title.trim(), summary,
            fields: { ...template.fields, scope, tokens },
          }, { expectRevision: template.revision, event: `Template ${title.trim()} updated` });
          const created = documents.filter((record) => record.fields.templateId === template.id);
          context.toast("Master updated", created.length
            ? `${created.length} existing document${created.length === 1 ? "" : "s"} were left exactly as they are.`
            : "No document has been created from this template yet.");
        } else {
          await context.mutate.create({
            collection: "templates",
            title: title.trim(), status: "draft", summary,
            fields: { kind: "document", scope, tokens, usedBy: 0 },
            body: readDoc(undefined, context.actor, context.now.toISOString()),
          }, `Template ${title.trim()} created`);
          context.toast("Template created", "It is a draft until you publish it.");
        }
        close();
      }}
    >
      <Field label="Template name" required><TextInput aria-label="Template name" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="What it is for"><TextInput aria-label="What it is for" value={summary} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Field label="Scope">
        <Select aria-label="Scope" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="company">Company</option><option value="department">Department</option><option value="personal">Mine</option>
        </Select>
      </Field>
      <Field label="Company fields" hint="Comma separated tokens, written as {{token}} in the body.">
        <TextInput aria-label="Company fields" value={tokens} onChange={(event) => setTokens(event.target.value)} placeholder="company.name, customer.name, quote.total" />
      </Field>
      {template && (
        <Notice tone="warning" title="Documents already created keep their own body">
          A template is a starting point, not a live link. Editing the master never rewrites a document that was created from it, which is what keeps a signed document trustworthy.
        </Notice>
      )}
    </form>
  );
}

function TokenMapping({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const fromRoute = useRecord(payload?.id);
  const templates = useCollection("templates");
  const template = fromRoute ?? templates[0];
  const { org } = useWorkspace();
  const [map, setMap] = useState<Record<string, string>>({});
  if (!template) return <Empty title="No template selected" />;
  const tokens = String(template.fields.tokens ?? "").split(",").map((token) => token.trim()).filter(Boolean);
  const sources: Record<string, string> = {
    "company.name": org.name,
    "company.registration": org.registration ?? "Not recorded",
    "company.jurisdiction": org.jurisdiction,
    "company.currency": org.currency,
  };
  return (
    <form
      id="token-mapping"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(template.id, { fields: { ...template.fields, tokenMap: JSON.stringify(map) } }, { expectRevision: template.revision, event: `Token mapping updated on ${template.title}` });
        context.toast("Mapping saved", "Tokens with a workspace source are filled when a document is created; the rest stay as tokens.");
        close();
      }}
    >
      {tokens.length === 0 ? <Notice tone="warning" title="This template maps no tokens">Add company fields to the template first.</Notice> : (
        <Stack gap={3}>
          {tokens.map((token) => (
            <Field key={token} label={token} hint={sources[token] ? `Workspace value: ${sources[token]}` : "No workspace field matches this token — it stays as a token."}>
              <Select value={map[token] ?? (sources[token] ? "workspace" : "manual")} onChange={(event) => setMap((current) => ({ ...current, [token]: event.target.value }))}>
                <option value="workspace" disabled={!sources[token]}>Fill from the workspace</option>
                <option value="manual">Leave as a token for a person to fill</option>
              </Select>
            </Field>
          ))}
        </Stack>
      )}
      <Notice tone="neutral">A token is never guessed. If the workspace has no value, the document keeps the token so the gap is visible.</Notice>
    </form>
  );
}

function ChangeImpact({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = useRecord(payload?.id);
  const documents = useCollection("documents");
  if (!template) return <Empty title="No template selected" />;
  const created = documents.filter((record) => record.fields.templateId === template.id);
  const signed = created.filter((record) => record.fields.signatureStatus === "signed");
  const published = created.filter((record) => record.status === "published");
  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Documents created" value={String(created.length)} />
        <Stat prov="human" label="Published" value={String(published.length)} />
        <Stat prov="human" label="Signed" value={String(signed.length)} meta={signed.length ? "Frozen" : "None"} />
      </StatRow>
      <Notice tone="warning" title="Editing this master changes nothing that already exists">
        Each document holds its own body. A template edit only affects documents created after it, which is why a signed document cannot be altered by changing the template it came from.
      </Notice>
      {created.length === 0 ? <Empty title="Nothing created from this template yet" /> : (
        <DataGrid
          rows={created}
          rowId={(row) => row.id}
          label="Documents from this template"
          filterable={false}
          columns={[
            { key: "title", header: "Document", primary: true, cell: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "published" ? "success" : "neutral"}>{row.status.replace("_", " ")}</Pill> },
            { key: "signature", header: "Signature", cell: (row) => <Pill tone={row.fields.signatureStatus === "signed" ? "warning" : "neutral"}>{String(row.fields.signatureStatus ?? "not requested").replace("_", " ")}</Pill> },
            { key: "updated", header: "Changed", align: "end", cell: (row) => context.relative(row.updatedAt) },
          ]}
        />
      )}
    </Stack>
  );
}

function PdfSettings({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [includeComments, setIncludeComments] = useState(false);
  if (!record) return <Empty title="No document is open" />;
  return (
    <form
      id="pdf-settings"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const html = toHtml(editor.model, record.title);
        const extra = includeComments && editor.model.comments.length
          ? `<section><h2>Comments</h2><ol>${editor.model.comments.map((comment) => `<li><strong>${comment.author}</strong>: ${comment.body} <em>(on “${comment.quote}”)</em></li>`).join("")}</ol></section>`
          : "";
        downloadFile(`${record.title}.print.html`, html.replace("</body>", `${extra}</body>`), "text/html");
        context.toast("Print-ready HTML written", "Open it and print to PDF from the browser. No PDF engine is bundled, so nothing is rendered server side.");
        close();
      }}
    >
      <Notice tone="warning" title="No PDF engine is connected">
        A PDF is produced by printing the exported HTML from the browser. Saying it is a native PDF renderer would be untrue, so the export is named for what it is.
      </Notice>
      <Properties rows={[
        { label: "Page size", value: editor.model.page.size },
        { label: "Margin", value: `${editor.model.page.margin}pt` },
        { label: "Columns", value: String(editor.model.page.columns) },
        { label: "Estimated pages", value: String(paginate(editor.model).pages.length) },
      ]} />
      <Checkbox label="Append the comment list" checked={includeComments} onChange={(event) => setIncludeComments(event.target.checked)} />
    </form>
  );
}

function LinkPermissions({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const [scope, setScope] = useState<"workspace" | "link">("workspace");
  const [note, setNote] = useState("");
  if (!record) return <Empty title="No document is open" />;
  return (
    <form
      id="link-permissions"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        editor.commit({
          ...editor.model,
          shares: [{ id: nextId("sh"), at: context.now.toISOString(), scope, note: note || "No note" }, ...editor.model.shares],
        }, "Create link");
        void context.mutate.log(`Share link created on ${record.title} (${scope})`, { entityId: record.id, type: "share" });
        context.toast("Link recorded", "It appears under Share with a revoke button.");
        close();
      }}
    >
      <Field label="Scope">
        <Select aria-label="Scope" value={scope} onChange={(event) => setScope(event.target.value as "workspace" | "link")}>
          <option value="workspace">This workspace only</option>
          <option value="link">Anyone with the link</option>
        </Select>
      </Field>
      <Field label="Note"><TextInput aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Notice tone="warning" title="Bounded and revocable by design">
        Every link carries the time it was created, the scope it was created with, and a revocation time once revoked. Nothing is served outside this browser, so the bound is absolute rather than a promise.
      </Notice>
    </form>
  );
}

function SignatureRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const contacts = useCollections(["contacts", "members"]);
  const [signatories, setSignatories] = useState<string[]>([]);
  const capability = capabilityById("site.publish");
  if (!record) return <Empty title="No document is open" />;
  const people = [...contacts.contacts, ...contacts.members];
  return (
    <form
      id="signature-request"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (signatories.length === 0) return;
        await context.mutate.patch(record.id, {
          fields: { ...record.fields, signatureStatus: "requested", signatories: signatories.join(", ") },
        }, { expectRevision: record.revision, event: `Signature requested on ${record.title} from ${signatories.join(", ")}` });
        void context.mutate.log(`Signature request queued locally for ${record.title}`, { entityId: record.id, type: "capability", capability: "queued_local" });
        context.toast("Request recorded locally", "The signatories and the document are on the record. Nothing was sent, because no signature provider is connected.", "info");
        close();
      }}
    >
      <Notice tone="warning" title={`${capability?.provider ?? "Signature provider"} is not connected`}>
        The request is kept in this workspace with its signatories and the document version. There is no envelope and nobody has been emailed.
      </Notice>
      <Stack gap={2}>
        {people.slice(0, 8).map((person) => (
          <Checkbox
            key={person.id}
            label={person.title}
            checked={signatories.includes(person.title)}
            onChange={(event) => setSignatories((current) => (event.target.checked ? [...current, person.title] : current.filter((name) => name !== person.title)))}
          />
        ))}
      </Stack>
    </form>
  );
}

function SuggestionDiff({ context, close }: { context: ScreenContext; close: () => void }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <Empty title="No document is open" />;
  const proposals = writingProposals(editor.model);
  const proposal = proposals.find((item) => item.id === payload?.id);
  if (!proposal) return <Empty title="Suggestion not found" />;
  const block = proposal.blockId ? editor.model.blocks[blockIndex(editor.model, proposal.blockId)] : undefined;
  const after = proposal.apply ? proposal.apply(editor.model) : undefined;
  const afterBlock = after && proposal.blockId ? after.blocks[blockIndex(after, proposal.blockId)] : undefined;
  return (
    <form
      id="suggestion-diff"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!after) return;
        editor.commit(after, "Apply suggestion");
        context.toast("Applied", proposal.title);
        close();
      }}
    >
      <Properties rows={[{ label: "Suggestion", value: proposal.title }, { label: "Why", value: proposal.detail }]} />
      {block && <Card title="Now"><p>{visibleText(block)}</p></Card>}
      {afterBlock ? <Card title="After"><p>{visibleText(afterBlock)}</p></Card>
        : <Notice tone="warning" title="This one needs a human edit">A rule can see the problem but cannot rewrite the sentence without changing what it says.</Notice>}
    </form>
  );
}

function SourceInspection({ context }: { context: ScreenContext }) {
  const record = useDocument(context);
  const editor = useDocEditor(context, record);
  const pool = useCollections(["workbooks", "invoices", "products", "documents"]);
  const payload = context.overlayPayload as { id?: string; referenceId?: string } | undefined;
  if (!record) return <Empty title="No document is open" />;
  const reference = editor.model.references.find((item) => item.id === payload?.referenceId);
  const all = [...pool.workbooks, ...pool.invoices, ...pool.products, ...pool.documents];
  if (reference) {
    const found = all.find((item) => item.id === reference.recordId);
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Reference", value: reference.label },
          { label: "Record", value: found ? `${found.collection}: ${found.title}` : "No record recorded" },
          { label: "Note", value: reference.note || "—" },
        ]} />
        {found
          ? <Notice tone="success" title="Traceable">The reference points at a record that exists in this workspace. Its figures can be read from it.</Notice>
          : <Notice tone="warning" title="Unsourced">No record backs this reference. It is shown as unsourced rather than given an invented citation.</Notice>}
      </Stack>
    );
  }
  const claimId = payload?.id ?? "";
  const claim = claimId.split("-").pop() ?? "";
  const matches = all.filter((item) => `${item.title} ${item.summary} ${JSON.stringify(item.body ?? "")}`.includes(claim.replace(/[£$,\s]/g, "")));
  return (
    <Stack gap={4}>
      <Properties rows={[{ label: "Figure", value: claim || "Unknown" }, { label: "Records searched", value: String(all.length) }]} />
      {matches.length === 0
        ? <Notice tone="warning" title="Nothing in this workspace contains that figure">The claim is flagged for a human to source. No external lookup is performed and no citation is generated.</Notice>
        : <DataGrid rows={matches} rowId={(row) => row.id} label="Possible sources" filterable={false} columns={[
          { key: "title", header: "Record", primary: true, cell: (row) => row.title },
          { key: "collection", header: "Kind", cell: (row) => row.collection },
          { key: "updated", header: "Changed", align: "end", cell: (row) => context.relative(row.updatedAt) },
        ]} />}
    </Stack>
  );
}

function StyleSettings({ context, close }: { context: ScreenContext; close: () => void }) {
  const [banned, setBanned] = useState("world-class, best-in-class, revolutionary, synergy, game-changing, seamless, cutting-edge");
  const [maxWords, setMaxWords] = useState("90");
  const preferences = useCollection("preferences");
  const existing = preferences.find((record) => record.fields.kind === "docsStyle");
  return (
    <form
      id="style-settings"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (existing) {
          await context.mutate.patch(existing.id, { fields: { ...existing.fields, banned, maxWords: Number(maxWords) || 90 } }, { expectRevision: existing.revision, event: "House style updated" });
        } else {
          await context.mutate.create({
            collection: "preferences", title: "Documents house style", status: "active",
            summary: "Banned phrases and the paragraph length the writing checks use.",
            fields: { kind: "docsStyle", banned, maxWords: Number(maxWords) || 90 },
          }, "House style saved");
        }
        context.toast("House style saved", "The writing and brand checks read these rules from the workspace.");
        close();
      }}
    >
      <Field label="Banned phrases" hint="Comma separated. The brand check reports any that appear.">
        <TextArea aria-label="Banned phrases" value={banned} onChange={(event) => setBanned(event.target.value)} rows={3} />
      </Field>
      <Field label="Flag paragraphs over this many words">
        <TextInput aria-label="Flag paragraphs over this many words" inputMode="numeric" align="end" value={maxWords} onChange={(event) => setMaxWords(event.target.value)} />
      </Field>
      <Notice tone="neutral">These are the rules the deterministic checks use. There is no model behind them, so the result is the same every time.</Notice>
    </form>
  );
}

/* ====================================================================== *
 * Registration
 * ====================================================================== */

registerApp({
  code: "DOCS",
  short: "Docs",
  name: "Documents & Knowledge Writing",
  purpose: "Write, review and publish company documents with a real text engine.",
  icon: FileText,
  nav: [
    { label: "Library", items: [{ label: "Documents", screenId: "ARL-DOCS-001", icon: FileText }, { label: "Templates", screenId: "ARL-DOCS-005", icon: TableIcon }] },
    { label: "This document", items: [
      { label: "Editor", screenId: "ARL-DOCS-002", icon: AlignLeft },
      { label: "Outline", screenId: "ARL-DOCS-003", icon: List },
      { label: "Review", screenId: "ARL-DOCS-004", icon: MessageSquare },
      { label: "Publishing", screenId: "ARL-DOCS-006", icon: Upload },
      { label: "Insights", screenId: "ARL-DOCS-007", icon: Search },
    ] },
  ],
  screens: {
    "ARL-DOCS-001": {
      id: "ARL-DOCS-001",
      inspectorTitle: "Document",
      inspector: (context) => <LibraryInspector context={context} />,
      tabs: (["Recent", "My docs", "Shared", "Templates", "Archive"] as LibraryTab[]).map((id) => ({
        id,
        render: (context) => <DocumentLibrary context={context} tab={id} />,
      })),
      actions: [
        { id: "Create", label: "New document", placement: "primary", run: (context) => context.openOverlay("New doc") },
        { id: "upload", label: "Upload", placement: "secondary", icon: <Upload size={15} />, run: (context) => context.openOverlay("New doc", { upload: true }) },
        { id: "search", label: "Search", placement: "overflow", run: (context) => context.toast("Search is on the page", "The search field above the list reads titles, tags and — for documents that are not confidential — their text.", "info") },
        { id: "move", label: "Move to folder", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a document first"), run: (context) => context.openOverlay("folder selector") },
        { id: "share", label: "Share", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a document first"), run: (context) => context.openOverlay("sharing") },
      ],
      overlays: [
        { id: "New doc", kind: "modal", title: "New document", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-doc">Create</Button></>, render: (context) => <NewDocumentOverlay context={context} close={context.close} /> },
        { id: "folder selector", kind: "modal", title: "Move to folder", width: 480, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="folder-selector">Move</Button></>, render: (context) => <FolderSelector context={context} close={context.close} /> },
        { id: "sharing", kind: "drawer", title: "Sharing", width: 460, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="sharing">Record link</Button></>, render: (context) => <SharingOverlay context={context} close={context.close} /> },
        { id: "trash confirm", kind: "modal", title: "Delete documents", tone: "danger", blocking: true, width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Keep them</Button><Button variant="outline-danger" type="submit" form="trash-confirm">Delete</Button></>, render: (context) => <TrashConfirm context={context} close={context.close} /> },
      ],
    },

    "ARL-DOCS-002": {
      id: "ARL-DOCS-002",
      chrome: "full",
      surface: (context) => <DocumentEditorScreen context={context} />,
      tabs: ["Write", "Review", "Layout", "References"].map((id) => ({ id, render: () => null })),
      actions: [
        { id: "Type", label: "Focus the page", placement: "toolbar", run: () => undefined },
        { id: "format", label: "Formatting", placement: "toolbar", run: () => undefined },
        { id: "insert", label: "Insert", placement: "toolbar", run: (context) => context.openOverlay("insert table") },
        { id: "comment", label: "Comment", placement: "toolbar", run: (context) => context.openOverlay("citations", { mode: "comment" }) },
        { id: "accept changes", label: "Accept changes", placement: "toolbar", run: (context) => context.setTab("Review") },
        { id: "export", label: "Export", placement: "toolbar", run: (context) => context.openOverlay("export") },
      ],
      overlays: [
        { id: "Styles", kind: "drawer", title: "Styles", width: 480, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="styles">Save styles</Button></>, render: (context) => <StylesOverlay context={context} close={context.close} /> },
        { id: "insert table", kind: "modal", title: "Insert", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="insert">Insert</Button></>, render: (context) => <InsertOverlay context={context} close={context.close} /> },
        { id: "citations", kind: "modal", title: "Comment or reference", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="citations">Save</Button></>, render: (context) => <CitationsOverlay context={context} close={context.close} /> },
        { id: "link", kind: "modal", title: "Link", width: 460, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="link">Apply</Button></>, render: (context) => <LinkOverlay context={context} close={context.close} /> },
        { id: "export", kind: "modal", title: "Export", width: 620, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="export">Download</Button></>, render: (context) => <ExportOverlay context={context} close={context.close} /> },
      ],
    },

    "ARL-DOCS-003": {
      id: "ARL-DOCS-003",
      title: () => "Outline & navigation",
      tabs: (["Headings", "Bookmarks", "Comments"] as const).map((id) => ({ id, render: (context) => <OutlineScreen context={context} tab={id} /> })),
      actions: [
        { id: "add section", label: "Add section", placement: "primary", run: (context) => context.setTab("Headings") },
        { id: "jump", label: "Open the editor", placement: "secondary", run: (context) => context.navigate(context.path("/o/:org/docs/documents/:id", context.params.id)) },
        { id: "Reorder heading", label: "How reordering works", placement: "overflow", run: (context) => context.toast("Reordering moves a whole section", "The heading and every block under it move together, and anchored comments and bookmarks travel with them.", "info") },
        { id: "collapse", label: "Collapse all", placement: "overflow", run: (context) => context.toast("Use the chevrons", "Each heading has a collapse control in the tree.", "info") },
      ],
      overlays: [
        { id: "Heading properties", kind: "modal", title: "Heading properties", width: 480, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="heading-properties">Save</Button></>, render: (context) => <HeadingProperties context={context} close={context.close} /> },
        { id: "document structure warning", kind: "drawer", title: "Document structure", width: 520, render: (context) => <StructureWarningOverlay context={context} /> },
      ],
    },

    "ARL-DOCS-004": {
      id: "ARL-DOCS-004",
      title: () => "Review & comments",
      tabs: (["Comments", "Changes", "Approvals", "Versions"] as const).map((id) => ({ id, render: (context) => <ReviewScreen context={context} tab={id} /> })),
      actions: [
        { id: "approve", label: "Approve", placement: "primary", capability: "edit_knowledge", run: (context) => context.setTab("Approvals") },
        { id: "Suggest edit", label: "Suggest an edit", placement: "secondary", run: (context) => { context.setTab("Changes"); context.toast("Turn suggesting on", "With suggesting on, every edit in the editor is recorded as a tracked change instead of being written straight into the text.", "info"); } },
        { id: "accept/reject", label: "Accept or reject", placement: "overflow", run: (context) => context.setTab("Changes") },
        { id: "mention", label: "Mention someone", placement: "overflow", run: (context) => { context.setTab("Comments"); context.toast("Mention in a reply", "Type @ and a first name in a reply. The mention is recorded against the document; no notification service is connected.", "info"); } },
      ],
      overlays: [
        { id: "Comment thread", kind: "drawer", title: "Comment thread", width: 480, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="comment-thread">Reply</Button></>, render: (context) => <CommentThread context={context} close={context.close} /> },
        { id: "diff", kind: "drawer", title: "Compare", width: 560, render: (context) => <DiffOverlay context={context} /> },
        { id: "reviewer assignment", kind: "modal", title: "Assign reviewers", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="reviewer-assignment">Assign</Button></>, render: (context) => <ReviewerAssignment context={context} close={context.close} /> },
      ],
    },

    "ARL-DOCS-005": {
      id: "ARL-DOCS-005",
      tabs: (["All", "Company", "Department", "My templates"] as const).map((id) => ({ id, render: (context) => <TemplatesScreen context={context} tab={id} /> })),
      actions: [
        { id: "Create", label: "New template", placement: "primary", run: (context) => context.openOverlay("Template editor") },
        { id: "use", label: "Use a template", placement: "secondary", run: (context) => context.openOverlay("Template editor", { mode: "use" }) },
        { id: "edit master", label: "Edit master", placement: "overflow", run: (context) => context.openOverlay("Template editor") },
        {
          id: "retire", label: "Retire", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a template first"),
          run: async (context) => {
            const id = context.selectedId;
            if (!id) return;
            await context.mutate.patch(id, { status: "retired" }, { event: "Template retired" });
            context.toast("Retired", "It can no longer be used for a new document. Documents already created keep their own body.");
          },
        },
      ],
      overlays: [
        { id: "Template editor", kind: "drawer", title: "Template", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="template-editor">Save</Button></>, render: (context) => <TemplateEditor context={context} close={context.close} /> },
        { id: "token mapping", kind: "modal", title: "Token mapping", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="token-mapping">Save mapping</Button></>, render: (context) => <TokenMapping context={context} close={context.close} /> },
        { id: "change impact", kind: "drawer", title: "Change impact", width: 560, render: (context) => <ChangeImpact context={context} /> },
      ],
    },

    "ARL-DOCS-006": {
      id: "ARL-DOCS-006",
      title: () => "Publishing & export",
      tabs: (["Export", "Share", "Publish", "History"] as const).map((id) => ({ id, render: (context) => <PublishScreen context={context} tab={id} /> })),
      actions: [
        { id: "export", label: "Export", placement: "primary", capability: "export_data", run: (context) => context.setTab("Export") },
        { id: "Preview", label: "Preview", placement: "secondary", run: (context) => context.setTab("Export") },
        { id: "request e-sign", label: "Request signature", placement: "overflow", run: (context) => context.openOverlay("signature request") },
        { id: "revoke link", label: "Revoke a link", placement: "overflow", tone: "danger", run: (context) => context.setTab("Share") },
      ],
      overlays: [
        { id: "PDF settings", kind: "modal", title: "PDF settings", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="pdf-settings">Write print HTML</Button></>, render: (context) => <PdfSettings context={context} close={context.close} /> },
        { id: "link permissions", kind: "modal", title: "Link permissions", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="link-permissions">Create link</Button></>, render: (context) => <LinkPermissions context={context} close={context.close} /> },
        { id: "signature request", kind: "modal", title: "Signature request", width: 540, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="signature-request">Record request</Button></>, render: (context) => <SignatureRequest context={context} close={context.close} /> },
      ],
    },

    "ARL-DOCS-007": {
      id: "ARL-DOCS-007",
      title: () => "Document insights",
      tabs: (["Writing", "Accuracy", "Brand", "Sources"] as const).map((id) => ({ id, render: (context) => <InsightsScreen context={context} tab={id} /> })),
      actions: [
        { id: "apply selected", label: "Apply selected", placement: "primary", run: (context) => { context.setTab("Writing"); context.toast("Select the suggestions", "Tick the rows you want and use Apply selected in the grid. Only suggestions a rule can apply without changing meaning are applied.", "info"); } },
        { id: "Review suggestion", label: "Review suggestions", placement: "secondary", run: (context) => context.setTab("Writing") },
        { id: "inspect citations", label: "Inspect citations", placement: "overflow", run: (context) => context.setTab("Sources") },
      ],
      overlays: [
        { id: "Suggestion diff", kind: "modal", title: "Suggestion", width: 560, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Close</Button><Button variant="primary" type="submit" form="suggestion-diff">Apply</Button></>, render: (context) => <SuggestionDiff context={context} close={context.close} /> },
        { id: "source inspection", kind: "drawer", title: "Source", width: 520, render: (context) => <SourceInspection context={context} /> },
        { id: "style settings", kind: "modal", title: "Style settings", width: 520, footer: ({ close }) => <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="style-settings">Save</Button></>, render: (context) => <StyleSettings context={context} close={context.close} /> },
      ],
    },
  },
});
