import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, FolderPlus, Link2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  Button, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
  type Tone,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import { wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { internalPeople } from "../people";
import {
  DEFAULT_FILTERS, KNOWLEDGE, KNOWLEDGE_COLLECTIONS, NO_COLLECTION, PROVENANCE_LABEL, STATUS_LABEL, TIMING_LABEL,
  collectionProblems, isUnfiled, recordsInCollection,
  backlinks, draftFromRecord, draftProblems, emptyDraft, filterKnowledge, intervalFor, isSubstantiveChange,
  knowledgeBody, nextOriginProvenance, originProvenanceOf, parseTags, provenanceChoices, provenanceOf, reviewEvent, reviewRequestProblems, reviewTiming, sortKnowledge,
  statusAfterEdit, statusOf, summarize, verificationBlockers,
  type KnowledgeBody, type KnowledgeDraft, type KnowledgeFilters, type KnowledgeProvenance, type KnowledgeSort,
  type KnowledgeStatus, type ReviewEvent, type ReviewTiming, type SourceRef,
} from "./model";
import "./knowledge.css";

/* ====================================================================== *
 * Knowledge workspace (BRAIN-001 Overview).
 *
 * Collections on the left, a searchable list in the middle and the record
 * on the right. Everything is a record in this organisation's local store;
 * a review is a person's recorded decision, never inferred.
 * ====================================================================== */

const STATUS_TONE: Record<KnowledgeStatus, Tone> = { draft: "neutral", needs_review: "info", verified: "success", archived: "neutral" };
const TIMING_TONE: Record<ReviewTiming, Tone> = { fresh: "success", review_due: "info", overdue: "danger", stale: "warning", unreviewed: "neutral", archived: "neutral" };
const PROVENANCE_TONE: Record<KnowledgeProvenance, Tone> = { human: "neutral", model_generated: "warning", imported: "accent" };

const ACTION_LABEL: Record<ReviewEvent["action"], string> = {
  created: "Created",
  edited: "Edited",
  requested: "Review requested",
  approved: "Verified",
  changes_requested: "Changes requested",
  archived: "Archived",
  restored: "Restored",
  returned: "Returned to review after an edit",
};

type Mode = { kind: "view" } | { kind: "edit" } | { kind: "new" };

function useWorkspaceData() {
  return useCollections([KNOWLEDGE, KNOWLEDGE_COLLECTIONS, "sources", "facts", "decisions", "members"]);
}

function endOfDayIso(date: string): string {
  return new Date(`${date}T23:59:00`).toISOString();
}

function inDays(now: Date, days: number): string {
  const next = new Date(now.getTime() + days * 86_400_000);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/* ------------------------------ Workspace ------------------------------ */

export function KnowledgeWorkspace({ context }: { context: ScreenContext }) {
  const data = useWorkspaceData();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("record") ?? "";
  const [filters, setFilters] = useState<KnowledgeFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<KnowledgeSort>("relevance");
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [addingCollection, setAddingCollection] = useState(false);

  const records = data[KNOWLEDGE];
  const collections = useMemo(() => [...data[KNOWLEDGE_COLLECTIONS]].sort((a, b) => a.title.localeCompare(b.title)), [data]);
  const filterContext = useMemo(() => ({ now: context.now, collections }), [context.now, collections]);
  const unfiled = useMemo(() => records.filter((record) => statusOf(record) !== "archived" && isUnfiled(record, collections)).length, [records, collections]);
  const results = useMemo(
    () => sortKnowledge(filterKnowledge(records, filters, filterContext), filters.query.trim() ? sort : sort === "relevance" ? "updated" : sort, filterContext),
    [records, filters, filterContext, sort],
  );
  const summary = useMemo(() => summarize(records, filterContext), [records, filterContext]);
  const selected = records.find((record) => record.id === selectedId);

  const select = (id: string) => {
    setMode({ kind: "view" });
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("record", id); else next.delete("record");
      return next;
    }, { replace: true });
  };

  const set = <K extends keyof KnowledgeFilters>(key: K, value: KnowledgeFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const reviewers = [...new Set(records.map((record) => String(record.fields.reviewer ?? "")).filter(Boolean))].sort();
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const detailOpen = Boolean(selected) || mode.kind === "new";

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Verified records" value={String(summary.verified)} prov="human" meta={`of ${summary.total} active records`} onClick={() => setFilters({ ...DEFAULT_FILTERS, status: "verified" })} />
        <Stat label="In review" value={String(summary.inReview)} prov="human" meta={summary.overdue > 0 ? `${summary.overdue} past the due date` : "None past the due date"} onClick={() => setFilters({ ...DEFAULT_FILTERS, status: "needs_review" })} />
        <Stat label="Stale" value={String(summary.stale)} prov="unknown" meta="Verified, but past the review interval" onClick={() => setFilters({ ...DEFAULT_FILTERS, timing: "stale" })} />
        <Stat label="Model-generated, unverified" value={String(summary.modelUnverified)} prov="agent" meta="Not authoritative until a person verifies" onClick={() => setFilters({ ...DEFAULT_FILTERS, provenance: "model_generated" })} />
      </StatRow>

      <div className="brain-kw" data-detail={detailOpen ? "open" : "closed"}>
        <nav className="brain-kw-collections" aria-label="Knowledge collections">
          <div className="brain-kw-colhead">
            <span className="ds-eyebrow">Collections</span>
            <Button size="sm" variant="ghost" icon={<FolderPlus size={14} />} onClick={() => setAddingCollection((value) => !value)} aria-expanded={addingCollection}>New</Button>
          </div>
          {addingCollection && <NewCollectionForm context={context} existing={collections} onDone={(id) => { setAddingCollection(false); if (id) set("collectionId", id); }} />}
          <ul className="brain-kw-collist">
            <li>
              <button type="button" className="brain-kw-col" aria-current={filters.collectionId === "" ? "true" : undefined} onClick={() => set("collectionId", "")}>
                <span className="ds-grow">All knowledge</span><span className="ds-num">{records.filter((record) => statusOf(record) !== "archived").length}</span>
              </button>
            </li>
            {collections.map((collection) => (
              <li key={collection.id}>
                <button type="button" className="brain-kw-col" aria-current={filters.collectionId === collection.id ? "true" : undefined} onClick={() => set("collectionId", collection.id)} title={collection.summary || undefined}>
                  <span className="ds-grow ds-truncate">{collection.title}</span>
                  <span className="ds-num">{records.filter((record) => record.fields.collectionId === collection.id && statusOf(record) !== "archived").length}</span>
                </button>
              </li>
            ))}
            {(unfiled > 0 || filters.collectionId === NO_COLLECTION) && (
              <li>
                <button type="button" className="brain-kw-col" aria-current={filters.collectionId === NO_COLLECTION ? "true" : undefined} onClick={() => set("collectionId", NO_COLLECTION)} title="Records whose collection was deleted or never set">
                  <span className="ds-grow ds-truncate">No collection</span>
                  <span className="ds-num">{unfiled}</span>
                </button>
              </li>
            )}
          </ul>
          {filters.collectionId === NO_COLLECTION && (
            <div className="brain-kw-colnote"><span className="ds-subtle">Records here kept their content, sources and review state when their collection was deleted. Edit a record to file it again.</span></div>
          )}
          {filters.collectionId && filters.collectionId !== NO_COLLECTION && (
            <CollectionNote
              key={filters.collectionId}
              context={context}
              collection={collections.find((item) => item.id === filters.collectionId)}
              collections={collections}
              records={records}
              onDeleted={() => set("collectionId", NO_COLLECTION)}
            />
          )}
        </nav>

        <section className="brain-kw-list" aria-label="Knowledge records">
          <div className="brain-kw-filters">
            <Row gap={2}>
              <div className="brain-kw-search ds-grow">
                <Search size={14} aria-hidden="true" />
                <TextInput type="search" aria-label="Search knowledge" placeholder="Search titles, content, tags, sources" value={filters.query} onChange={(event) => set("query", event.target.value)} />
              </div>
                <Button size="sm" variant="primary" icon={<Plus size={14} />} disabled={collections.length === 0}
                title={collections.length === 0 ? "Create a collection first" : undefined}
                onClick={() => { setParams((current) => { const next = new URLSearchParams(current); next.delete("record"); return next; }, { replace: true }); setMode({ kind: "new" }); }}>
                New record
              </Button>
            </Row>
            <div className="brain-kw-filterrow">
              <Select aria-label="Status" value={filters.status} onChange={(event) => set("status", event.target.value as KnowledgeFilters["status"])}>
                <option value="active">Active (not archived)</option>
                <option value="">Every status</option>
                {(Object.keys(STATUS_LABEL) as KnowledgeStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
              </Select>
              <Select aria-label="Provenance" value={filters.provenance} onChange={(event) => set("provenance", event.target.value as KnowledgeFilters["provenance"])}>
                <option value="">Any provenance</option>
                {(Object.keys(PROVENANCE_LABEL) as KnowledgeProvenance[]).map((value) => <option key={value} value={value}>{PROVENANCE_LABEL[value]}</option>)}
              </Select>
              <Select aria-label="Review timing" value={filters.timing} onChange={(event) => set("timing", event.target.value as KnowledgeFilters["timing"])}>
                <option value="">Any freshness</option>
                <option value="attention">Needs attention</option>
                {(["fresh", "review_due", "overdue", "stale", "unreviewed"] as ReviewTiming[]).map((value) => <option key={value} value={value}>{TIMING_LABEL[value]}</option>)}
              </Select>
              <Select aria-label="Reviewer" value={filters.reviewer} onChange={(event) => set("reviewer", event.target.value)}>
                <option value="">Any reviewer</option>
                {reviewers.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </div>
            <Row gap={2} wrap>
              <span className="ds-subtle ds-grow" role="status" aria-live="polite">
                {results.length} of {records.length} record{records.length === 1 ? "" : "s"}
              </span>
              {filtered && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setFilters(DEFAULT_FILTERS)}>Clear</Button>}
              <Select aria-label="Sort" className="brain-kw-sort" value={sort} onChange={(event) => setSort(event.target.value as KnowledgeSort)}>
                <option value="relevance">Best match</option>
                <option value="updated">Recently updated</option>
                <option value="due">Review date</option>
                <option value="title">Title A–Z</option>
              </Select>
            </Row>
          </div>

          {records.length === 0 ? (
            <Empty icon={<BookOpen size={20} />} title="No knowledge recorded yet">
              {collections.length === 0 ? "Create a collection, then write the first record into it." : "Write the first record: a procedure, an answer or a policy explanation."}
            </Empty>
          ) : results.length === 0 ? (
            <Empty icon={<Search size={20} />} title="Nothing matches" action={<Button size="sm" variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}>
              Every search term must appear in the record. Try fewer words or another collection.
            </Empty>
          ) : (
            <ul className="brain-kw-results">
              {results.map((record) => {
                const timing = reviewTiming(record, context.now, intervalFor(record, collections));
                const status = statusOf(record);
                const provenance = provenanceOf(record);
                const collection = collections.find((item) => item.id === record.fields.collectionId);
                return (
                  <li key={record.id}>
                    <button type="button" className="ds-record-card brain-kw-item" aria-selected={record.id === selectedId} onClick={() => select(record.id)}>
                      <Row gap={2}>
                        <strong className="ds-grow ds-truncate">{record.title}</strong>
                        <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
                      </Row>
                      {record.summary && <span className="ds-subtle brain-kw-clamp">{record.summary}</span>}
                      <Row gap={1} wrap className="brain-kw-meta">
                        <span className="ds-subtle">{collection?.title ?? "No collection"}</span>
                        <span aria-hidden="true" className="ds-subtle">·</span>
                        <Pill tone={TIMING_TONE[timing.state]} dot>{TIMING_LABEL[timing.state]}</Pill>
                        {provenance !== "human" && <Pill tone={PROVENANCE_TONE[provenance]}>{PROVENANCE_LABEL[provenance]}</Pill>}
                      </Row>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="brain-kw-detail" aria-label="Knowledge record">
          {mode.kind === "new" ? (
            <RecordEditor context={context} data={data} collections={collections}
              initial={emptyDraft((filters.collectionId !== NO_COLLECTION && filters.collectionId) || collections[0]?.id || "")}
              onCancel={() => setMode({ kind: "view" })}
              onSaved={(id) => { select(id); }} />
          ) : selected && mode.kind === "edit" ? (
            <RecordEditor context={context} data={data} collections={collections} record={selected}
              initial={draftFromRecord(selected)}
              onCancel={() => setMode({ kind: "view" })}
              onSaved={() => setMode({ kind: "view" })} />
          ) : selected ? (
            <RecordDetail context={context} data={data} record={selected} collections={collections}
              onBack={() => select("")} onEdit={() => setMode({ kind: "edit" })} onOpen={select} />
          ) : (
            <div className="brain-kw-placeholder">
              <Empty icon={<BookOpen size={20} />} title="Choose a record">
                Its content, sources, related records and review history open here.
              </Empty>
            </div>
          )}
        </section>
      </div>
    </Stack>
  );
}

function CollectionNote({ context, collection, collections, records, onDeleted }: {
  context: ScreenContext; collection?: Rec; collections: Rec[]; records: Rec[]; onDeleted: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [name, setName] = useState(collection?.title ?? "");
  const [description, setDescription] = useState(collection?.summary ?? "");
  const [interval, setInterval] = useState(String(collection?.fields.reviewIntervalDays ?? 90));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!collection) return null;
  const members = recordsInCollection(records, collection.id);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const problems = collectionProblems({ name, interval }, collections, collection.id);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const renamed = name.trim() !== collection.title;
      const saved = await context.mutate.patch(collection.id, {
        title: name.trim(), summary: description.trim(), fields: { ...collection.fields, reviewIntervalDays: Number(interval) },
      }, { expectRevision: collection.revision, event: renamed ? `Knowledge collection “${collection.title}” renamed to “${name.trim()}”` : `Knowledge collection “${collection.title}” updated` });
      if (saved) {
        context.toast("Collection saved", renamed ? `${members.length} record${members.length === 1 ? "" : "s"} now show under ${saved.title}.` : `${saved.title} is updated.`);
        setMode("view");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      for (const record of members) {
        if (!(await context.mutate.patch(record.id, { fields: { ...record.fields, collectionId: "" } }, { event: `Moved to No collection: “${collection.title}” was deleted` }))) return;
      }
      await context.mutate.remove(collection.id, `Knowledge collection “${collection.title}” deleted; ${members.length} record${members.length === 1 ? "" : "s"} moved to No collection`);
      context.toast("Collection deleted", `${members.length} record${members.length === 1 ? "" : "s"} moved to No collection. No record was deleted.`);
      onDeleted();
    } catch {
      context.toast("Not deleted", "The collection could not be removed from this browser's storage. Records already moved stay under No collection.", "failed");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "edit") {
    return (
      <form className="brain-kw-newcol" onSubmit={save} aria-label="Edit collection">
        <Field label="Name" error={errors.name} required><TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus /></Field>
        <Field label="What belongs here"><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Review every (days)" error={errors.interval}><TextInput type="number" min={1} max={730} value={interval} onChange={(event) => setInterval(event.target.value)} /></Field>
        <Row gap={2}>
          <Button size="sm" variant="primary" type="submit" busy={busy}>Save collection</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMode("view"); setErrors({}); }}>Cancel</Button>
        </Row>
      </form>
    );
  }

  return (
    <div className="brain-kw-colnote">
      {collection.summary && <p className="ds-subtle">{collection.summary}</p>}
      <span className="ds-subtle">Owner {collection.ownerName} · reviewed every {String(collection.fields.reviewIntervalDays ?? 90)} days</span>
      {mode === "delete" ? (
        <div className="brain-kw-confirm" role="alertdialog" aria-label={`Delete ${collection.title}`}>
          <p>Delete “{collection.title}”? {members.length === 0 ? "It holds no records." : `Its ${members.length} record${members.length === 1 ? "" : "s"} move to No collection with their content, sources and review state unchanged.`} No record is deleted.</p>
          <Row gap={2} wrap>
            <Button size="sm" variant="outline-danger" busy={busy} onClick={() => void remove()}>Delete collection</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>Keep it</Button>
          </Row>
        </div>
      ) : (
        <Row gap={1} wrap>
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setMode("edit")}>Rename or edit</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setMode("delete")}>Delete</Button>
        </Row>
      )}
    </div>
  );
}

/* --------------------------- New collection --------------------------- */

function NewCollectionForm({ context, existing, onDone }: { context: ScreenContext; existing: Rec[]; onDone: (id?: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [interval, setInterval] = useState("90");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = collectionProblems({ name, interval }, existing);
    const days = Number(interval);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const record = await context.mutate.create({
        collection: KNOWLEDGE_COLLECTIONS, title: name.trim(), status: "active", summary: description.trim(),
        ownerName: context.actor, fields: { reviewIntervalDays: days },
      }, `Knowledge collection “${name.trim()}” created by ${context.actor}`);
      context.toast("Collection created", `${record.title} is ready for records.`);
      onDone(record.id);
    } catch {
      context.toast("Not saved", "The collection could not be written to this browser's storage.", "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="brain-kw-newcol" onSubmit={submit} aria-label="New collection">
      <Field label="Name" error={errors.name} required><TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus /></Field>
      <Field label="What belongs here"><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Field label="Review every (days)" error={errors.interval}><TextInput type="number" min={1} max={730} value={interval} onChange={(event) => setInterval(event.target.value)} /></Field>
      <Row gap={2}>
        <Button size="sm" variant="primary" type="submit" busy={busy}>Create collection</Button>
        <Button size="sm" variant="ghost" onClick={() => onDone()}>Cancel</Button>
      </Row>
    </form>
  );
}

/* ------------------------------ Detail ------------------------------ */

type Data = Record<string, Rec[]>;

function linkedRecord(data: Data, id: string): Rec | undefined {
  for (const collection of [KNOWLEDGE, "facts", "decisions", "sources"]) {
    const found = (data[collection] ?? []).find((record) => record.id === id);
    if (found) return found;
  }
  return undefined;
}

const KIND_LABEL: Record<string, string> = { knowledge: "Knowledge", facts: "Assertion", decisions: "Decision", sources: "Source" };

function RecordDetail({ context, data, record, collections, onBack, onEdit, onOpen }: {
  context: ScreenContext; data: Data; record: Rec; collections: Rec[];
  onBack: () => void; onEdit: () => void; onOpen: (id: string) => void;
}) {
  const body = knowledgeBody(record);
  const status = statusOf(record);
  const provenance = provenanceOf(record);
  const collection = collections.find((item) => item.id === record.fields.collectionId);
  const interval = intervalFor(record, collections);
  const timing = reviewTiming(record, context.now, interval);
  const inbound = backlinks(data[KNOWLEDGE] ?? [], record.id);

  const openLinked = (target: Rec) => {
    if (target.collection === KNOWLEDGE) onOpen(target.id);
    else if (target.collection === "sources") context.navigate(`/o/${context.org.slug}/brain/sources/${target.id}`);
    else if (target.collection === "facts") context.navigate(`/o/${context.org.slug}/brain/facts?tab=${encodeURIComponent({ verified: "Verified", proposed: "Proposed", conflicting: "Conflicting", expired: "Expired" }[target.status] ?? "Verified")}`);
    else if (target.collection === "decisions") context.navigate(`/o/${context.org.slug}/brain/decisions`);
  };

  return (
    <Stack gap={4}>
      <div className="brain-kw-dethead">
        <Button size="sm" variant="ghost" className="brain-kw-back" icon={<ArrowLeft size={14} />} onClick={onBack}>All records</Button>
        <Row gap={2} wrap>
          <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
          <Pill tone={PROVENANCE_TONE[provenance]}>{PROVENANCE_LABEL[provenance]}</Pill>
          <Pill tone={TIMING_TONE[timing.state]} dot>{TIMING_LABEL[timing.state]}</Pill>
        </Row>
        <h2 className="brain-kw-title">{record.title}</h2>
        {record.summary && <p className="ds-subtle">{record.summary}</p>}
        <Row gap={2} wrap>
          <Button size="sm" variant="secondary" onClick={onEdit} disabled={status === "archived"} title={status === "archived" ? "Restore it to draft before editing" : undefined}>Edit</Button>
        </Row>
      </div>

      {provenance === "model_generated" && status !== "verified" && (
        <Notice tone="warning" title="Model-generated text">
          This text was produced by a model outside this workspace and pasted in. It is not authoritative and is not used as a verified answer until a person checks it against a cited source.
        </Notice>
      )}

      <Properties rows={[
        { label: "Collection", value: collection?.title ?? "None" },
        { label: "Owner", value: record.ownerName },
        { label: "Reviewer", value: String(record.fields.reviewer ?? "") || "Not assigned" },
        { label: status === "needs_review" ? "Review due" : "Next review", value: timing.dueAt ? `${context.date(timing.dueAt)} · ${timing.label}` : timing.label },
        { label: "Last verified", value: record.fields.lastReviewedAt ? `${context.date(String(record.fields.lastReviewedAt))} by ${String(record.fields.lastReviewedBy ?? "unknown")}` : "Never" },
        { label: "Review interval", value: `${interval} days${record.fields.reviewIntervalDays ? "" : " (from the collection)"}` },
        { label: "Updated", value: `${context.relative(record.updatedAt)} by ${record.updatedBy} · revision ${record.revision}` },
        ...(record.tags.length ? [{ label: "Tags", value: <Row gap={1} wrap>{record.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}</Row> }] : []),
      ]} />

      <section aria-label="Content" className="brain-kw-section">
        <h3 className="ds-eyebrow">Content</h3>
        {body.content.trim() ? <div className="brain-kw-content">{body.content}</div> : <span className="ds-subtle">No content written yet.</span>}
      </section>

      <section aria-label="Sources" className="brain-kw-section">
        <h3 className="ds-eyebrow">Sources · {body.sources.length}</h3>
        {body.sources.length === 0 ? (
          <span className="ds-subtle">No source is cited. {provenance === "human" ? "A person can still verify it, but readers cannot check it." : "It cannot be verified until one is."}</span>
        ) : (
          <ul className="brain-kw-links">
            {body.sources.map((ref) => {
              const library = ref.sourceId ? (data.sources ?? []).find((source) => source.id === ref.sourceId) : undefined;
              return (
                <li key={ref.id}>
                  {library ? (
                    <button type="button" className="brain-kw-link" onClick={() => openLinked(library)}>
                      <Link2 size={13} aria-hidden="true" /> <span className="ds-grow ds-truncate">{library.title}</span>
                      {ref.locator && <span className="ds-subtle">{ref.locator}</span>}
                      <Pill tone={library.status === "indexed" ? "success" : "warning"}>{library.status}</Pill>
                    </button>
                  ) : (
                    <div className="brain-kw-link" data-static="true">
                      <span className="ds-grow ds-truncate">{ref.label || "Removed source"}</span>
                      {ref.locator && <span className="ds-subtle">{ref.locator}</span>}
                      <Pill tone="neutral">{ref.sourceId ? "Not in this library" : "External reference"}</Pill>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Related records" className="brain-kw-section">
        <h3 className="ds-eyebrow">Related · {body.related.length + inbound.length}</h3>
        {body.related.length + inbound.length === 0 ? <span className="ds-subtle">Not linked to any other record.</span> : (
          <ul className="brain-kw-links">
            {body.related.map((id) => {
              const target = linkedRecord(data, id);
              return (
                <li key={id}>
                  {target ? (
                    <button type="button" className="brain-kw-link" onClick={() => openLinked(target)}>
                      <Pill tone="accent">{KIND_LABEL[target.collection] ?? target.collection}</Pill>
                      <span className="ds-grow ds-truncate">{target.title}</span>
                    </button>
                  ) : <div className="brain-kw-link" data-static="true"><span className="ds-subtle">A linked record that no longer exists</span></div>}
                </li>
              );
            })}
            {inbound.map((source) => (
              <li key={`in-${source.id}`}>
                <button type="button" className="brain-kw-link" onClick={() => onOpen(source.id)}>
                  <Pill tone="neutral">Links here</Pill>
                  <span className="ds-grow ds-truncate">{source.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewPanel context={context} data={data} record={record} />

      <section aria-label="Review history" className="brain-kw-section">
        <h3 className="ds-eyebrow">History · {body.reviews.length}</h3>
        {body.reviews.length === 0 ? <span className="ds-subtle">Nothing recorded.</span> : (
          <ol className="brain-kw-history">
            {[...body.reviews].reverse().map((event) => (
              <li key={event.id}>
                <strong>{ACTION_LABEL[event.action] ?? event.action}</strong>
                <span className="ds-subtle"> · {event.by} · {context.dateTime(event.at)}</span>
                {event.reviewer && <span className="ds-subtle"> · reviewer {event.reviewer}{event.dueAt ? `, due ${context.date(event.dueAt)}` : ""}</span>}
                {event.note && <div>{event.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Stack>
  );
}

/* ------------------------------ Review ------------------------------ */

async function writeReview(context: ScreenContext, record: Rec, patch: Partial<Rec>, event: Omit<ReviewEvent, "id" | "at" | "by">, message: string): Promise<boolean> {
  const body = knowledgeBody(record);
  const entry = reviewEvent({ ...event, at: context.now.toISOString(), by: context.actor }, wallMs());
  const saved = await context.mutate.patch(record.id, {
    ...patch,
    body: { ...body, reviews: [...body.reviews, entry] } satisfies KnowledgeBody,
  }, { expectRevision: record.revision, event: message });
  return Boolean(saved);
}

function ReviewPanel({ context, data, record }: { context: ScreenContext; data: Data; record: Rec }) {
  const status = statusOf(record);
  const people = internalPeople(data.members ?? []);
  const [request, setRequest] = useState({ reviewer: String(record.fields.reviewer ?? "") || people[0]?.title || "", dueAt: inDays(context.now, 7), note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [busy, setBusy] = useState("");
  const [requesting, setRequesting] = useState(false);
  const canVerify = context.can("edit_knowledge");
  const blockers = verificationBlockers(record, context.actor, canVerify);

  useEffect(() => {
    setRequesting(false); setErrors({}); setNote(""); setNoteError("");
    setRequest({ reviewer: String(record.fields.reviewer ?? "") || people[0]?.title || "", dueAt: inDays(context.now, 7), note: "" });
    // Reset only when a different record is shown.
  }, [record.id]);

  const run = async (label: string, work: () => Promise<boolean>, success: [string, string]) => {
    setBusy(label);
    try {
      const ok = await work();
      if (ok) { context.toast(success[0], success[1]); setRequesting(false); setNote(""); }
    } catch {
      context.toast("Not saved", "The change could not be written to this browser's storage.", "failed");
    } finally {
      setBusy("");
    }
  };

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    const problems = reviewRequestProblems({ ...request, dueAt: request.dueAt ? endOfDayIso(request.dueAt) : "" }, context.now);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const dueAt = endOfDayIso(request.dueAt);
    void run("request", () => writeReview(context, record, {
      status: "needs_review", dueAt, fields: { ...record.fields, reviewer: request.reviewer },
    }, { action: "requested", note: request.note.trim(), reviewer: request.reviewer, dueAt },
    `Review of “${record.title}” requested from ${request.reviewer} by ${context.actor}, due ${request.dueAt}`),
    ["Review requested", `${request.reviewer} is the reviewer, due ${context.date(dueAt)}. Nothing is sent outside this workspace; they see it in this list.`]);
  };

  return (
    <section aria-label="Review" className="brain-kw-section brain-kw-review">
      <h3 className="ds-eyebrow">Review</h3>
      {status === "archived" ? (
        <Row gap={2} wrap>
          <span className="ds-subtle ds-grow">Archived records are kept, excluded from answers and not reviewed.</span>
          <Button size="sm" variant="secondary" busy={busy === "restore"} onClick={() => void run("restore", () => writeReview(context, record, { status: "draft" }, { action: "restored", note: "" }, `“${record.title}” restored to draft by ${context.actor}`), ["Restored", "The record is a draft again."])}>Restore to draft</Button>
        </Row>
      ) : (
        <Stack gap={3}>
          {status === "needs_review" && (
            <>
              {blockers.length > 0 ? (
                <Notice tone="warning" title="Cannot be verified yet">
                  <ul className="brain-kw-blockers">{blockers.map((item) => <li key={item}>{item}</li>)}</ul>
                </Notice>
              ) : (
                <span className="ds-subtle">Verifying records you, {context.actor}, as the person who checked it, today.</span>
              )}
              <Field label="Review note" hint="Required when asking for changes." error={noteError}>
                <TextArea rows={2} value={note} onChange={(event) => { setNote(event.target.value); setNoteError(""); }} />
              </Field>
              <Row gap={2} wrap>
                <Button size="sm" variant="primary" disabled={blockers.length > 0} busy={busy === "approve"}
                  onClick={() => void run("approve", () => writeReview(context, record, {
                    status: "verified", dueAt: undefined,
                    fields: { ...record.fields, reviewer: context.actor, lastReviewedAt: context.now.toISOString(), lastReviewedBy: context.actor },
                  }, { action: "approved", note: note.trim() }, `“${record.title}” verified by ${context.actor}`),
                  ["Verified", `${context.actor} is recorded as the verifier. The next review is due in ${intervalFor(record, data[KNOWLEDGE_COLLECTIONS] ?? [])} days.`])}>
                  Verify
                </Button>
                <Button size="sm" variant="secondary" busy={busy === "changes"}
                  onClick={() => {
                    if (!note.trim()) { setNoteError("Say what needs to change."); return; }
                    void run("changes", () => writeReview(context, record, { status: "draft" }, { action: "changes_requested", note: note.trim() }, `Changes requested on “${record.title}” by ${context.actor}`),
                      ["Changes requested", "The record is back in draft with your note in its history."]);
                  }}>
                  Request changes
                </Button>
              </Row>
            </>
          )}

          {(status === "draft" || status === "verified") && !requesting && (
            <Row gap={2} wrap>
              <span className="ds-subtle ds-grow">{status === "draft" ? "A draft is not used as an answer until it is verified." : "Ask for a fresh review before the interval runs out, or after something changed."}</span>
              <Button size="sm" variant={status === "draft" ? "primary" : "secondary"} onClick={() => setRequesting(true)}>{status === "draft" ? "Request review" : "Request re-review"}</Button>
            </Row>
          )}
          {status === "needs_review" && !requesting && (
            <Row gap={2} wrap>
              <span className="ds-subtle ds-grow">Reviewer {String(record.fields.reviewer ?? "not set")}{record.dueAt ? `, due ${context.date(record.dueAt)}` : ""}.</span>
              <Button size="sm" variant="ghost" onClick={() => setRequesting(true)}>Change reviewer or due date</Button>
            </Row>
          )}

          {requesting && (
            <form className="brain-kw-reqform" onSubmit={submitRequest} aria-label="Request a review">
              <Field label="Reviewer" error={errors.reviewer} required>
                <Select value={request.reviewer} onChange={(event) => setRequest({ ...request, reviewer: event.target.value })}>
                  <option value="">Choose a person</option>
                  {people.map((person) => <option key={person.id} value={person.title}>{person.title}</option>)}
                </Select>
              </Field>
              <Field label="Due" error={errors.dueAt} required>
                <TextInput type="date" value={request.dueAt} onChange={(event) => setRequest({ ...request, dueAt: event.target.value })} />
              </Field>
              <Field label="Note for the reviewer">
                <TextInput value={request.note} onChange={(event) => setRequest({ ...request, note: event.target.value })} />
              </Field>
              <Row gap={2}>
                <Button size="sm" variant="primary" type="submit" busy={busy === "request"}>Send for review</Button>
                <Button size="sm" variant="ghost" onClick={() => { setRequesting(false); setErrors({}); }}>Cancel</Button>
              </Row>
            </form>
          )}

          <Row gap={2}>
            <span className="ds-grow" />
            <Button size="sm" variant="ghost" busy={busy === "archive"}
              onClick={() => void run("archive", () => writeReview(context, record, { status: "archived", dueAt: undefined }, { action: "archived", note: "" }, `“${record.title}” archived by ${context.actor}`), ["Archived", "It is kept with its history and hidden from the active list."])}>
              Archive
            </Button>
          </Row>
        </Stack>
      )}
    </section>
  );
}

/* ------------------------------ Editor ------------------------------ */

function RecordEditor({ context, data, collections, record, initial, onCancel, onSaved }: {
  context: ScreenContext; data: Data; collections: Rec[]; record?: Rec; initial: KnowledgeDraft;
  onCancel: () => void; onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<KnowledgeDraft>(initial);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [relatedPick, setRelatedPick] = useState("");
  const status = record ? statusOf(record) : "draft";
  const current = { ...draft, tags: parseTags(tags) };
  const substantive = record ? isSubstantiveChange(initial, current) : false;
  const nextStatus = statusAfterEdit(status, substantive);
  const origin = record ? originProvenanceOf(record) : "human";

  const patch = (change: Partial<KnowledgeDraft>) => setDraft((value) => ({ ...value, ...change }));
  const setSource = (index: number, change: Partial<SourceRef>) => patch({ sources: draft.sources.map((item, i) => (i === index ? { ...item, ...change } : item)) });

  const linkable = [
    ...(data[KNOWLEDGE] ?? []).filter((item) => item.id !== record?.id),
    ...(data.facts ?? []), ...(data.decisions ?? []), ...(data.sources ?? []),
  ].filter((item) => !draft.related.includes(item.id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = draftProblems(current);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const fields: Rec["fields"] = {
        ...(record?.fields ?? {}),
        collectionId: current.collectionId,
        provenance: current.provenance,
        originProvenance: nextOriginProvenance(record, current.provenance),
        reviewIntervalDays: current.reviewIntervalDays === "" ? 0 : current.reviewIntervalDays,
      };
      const sources = current.sources.map((item) => {
        const library = item.sourceId ? (data.sources ?? []).find((source) => source.id === item.sourceId) : undefined;
        return { ...item, label: item.label.trim() || library?.title || "", locator: item.locator?.trim() || undefined };
      });
      if (!record) {
        const created = await context.mutate.create({
          collection: KNOWLEDGE, title: current.title.trim(), status: "draft", summary: current.summary.trim(),
          ownerName: context.actor, tags: current.tags, fields,
          body: {
            content: current.content, sources, related: current.related,
            reviews: [reviewEvent({ at: context.now.toISOString(), by: context.actor, action: "created", note: current.provenance === "model_generated" ? "Pasted in as model-generated text." : "" }, wallMs())],
          } satisfies KnowledgeBody,
        }, `Knowledge record “${current.title.trim()}” drafted by ${context.actor}`);
        context.toast("Draft saved", `${created.title} is saved as a draft in this workspace.`);
        onSaved(created.id);
        return;
      }
      const body = knowledgeBody(record);
      const reviews = [...body.reviews, reviewEvent({
        at: context.now.toISOString(), by: context.actor,
        action: nextStatus !== status ? "returned" : "edited",
        note: nextStatus !== status ? "The content changed after verification, so the earlier verification no longer covers it." : "",
      }, wallMs())];
      const saved = await context.mutate.patch(record.id, {
        title: current.title.trim(), summary: current.summary.trim(), tags: current.tags, status: nextStatus,
        fields: nextStatus !== status ? { ...fields, reviewer: String(record.fields.reviewer ?? "") } : fields,
        dueAt: nextStatus !== status ? endOfDayIso(inDays(context.now, 7)) : record.dueAt,
        body: { content: current.content, sources, related: current.related, reviews } satisfies KnowledgeBody,
      }, { expectRevision: record.revision, event: `Knowledge record “${current.title.trim()}” edited by ${context.actor}${nextStatus !== status ? "; returned to review" : ""}` });
      if (!saved) return;
      context.toast(nextStatus !== status ? "Saved and returned to review" : "Saved", nextStatus !== status
        ? "The content changed after it was verified, so it needs a fresh review (due in 7 days)."
        : "The record is updated.");
      onSaved(record.id);
    } catch {
      context.toast("Not saved", "The record could not be written to this browser's storage.", "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="brain-kw-editor" onSubmit={submit} aria-label={record ? `Edit ${record.title}` : "New knowledge record"} noValidate>
      <Row gap={2}>
        <h2 className="brain-kw-title ds-grow">{record ? "Edit record" : "New record"}</h2>
      </Row>
      {record && status === "verified" && (
        <Notice tone={substantive ? "warning" : "info"}>
          {substantive
            ? "You changed what was verified. Saving returns the record to review."
            : "Changing the title, summary, content, provenance or sources returns this verified record to review. Tags and the collection do not."}
        </Notice>
      )}
      <Field label="Title" error={errors.title} required>
        <TextInput value={draft.title} onChange={(event) => patch({ title: event.target.value })} autoFocus={!record} />
      </Field>
      <div className="brain-kw-two">
        <Field label="Collection" error={errors.collectionId} required>
          <Select value={draft.collectionId} onChange={(event) => patch({ collectionId: event.target.value })}>
            <option value="">Choose a collection</option>
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </Select>
        </Field>
        <Field label="Provenance" hint={origin !== "human"
          ? `This text was ${origin === "imported" ? "imported" : "model-generated"}, so it cannot be relabelled as written by a person and needs a cited source before it can be verified.`
          : draft.provenance === "model_generated" ? "Needs a cited source before it can be verified." : undefined}>
          <Select value={draft.provenance} onChange={(event) => patch({ provenance: event.target.value as KnowledgeProvenance })}>
            {provenanceChoices(origin).map((value) => <option key={value} value={value}>{PROVENANCE_LABEL[value]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Summary" hint="One or two sentences shown in the list.">
        <TextInput value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} />
      </Field>
      <Field label="Content">
        <TextArea rows={8} value={draft.content} onChange={(event) => patch({ content: event.target.value })} />
      </Field>
      <div className="brain-kw-two">
        <Field label="Tags" hint="Comma separated.">
          <TextInput value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
        <Field label="Review every (days)" hint="Blank uses the collection's interval." error={errors.reviewIntervalDays}>
          <TextInput type="number" min={1} max={730} value={draft.reviewIntervalDays === "" ? "" : String(draft.reviewIntervalDays)}
            onChange={(event) => patch({ reviewIntervalDays: event.target.value === "" ? "" : Number(event.target.value) })} />
        </Field>
      </div>

      <fieldset className="brain-kw-fieldset">
        <legend className="ds-eyebrow">Sources</legend>
        {draft.sources.length === 0 && <span className="ds-subtle">No source cited.</span>}
        {draft.sources.map((source, index) => (
          <div key={source.id} className="brain-kw-sourcerow">
            <Field label={`Source ${index + 1}`} error={errors[`source-${index}`]}>
              <Select value={source.sourceId ?? ""} onChange={(event) => setSource(index, { sourceId: event.target.value || undefined })}>
                <option value="">External reference (type a name)</option>
                {(data.sources ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </Select>
            </Field>
            {!source.sourceId && (
              <Field label="Reference name"><TextInput value={source.label} onChange={(event) => setSource(index, { label: event.target.value })} /></Field>
            )}
            <Field label="Page or section"><TextInput value={source.locator ?? ""} onChange={(event) => setSource(index, { locator: event.target.value })} /></Field>
            <Button size="sm" variant="ghost" aria-label={`Remove source ${index + 1}`} icon={<X size={14} />} onClick={() => patch({ sources: draft.sources.filter((_, i) => i !== index) })} />
          </div>
        ))}
        <div>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => patch({ sources: [...draft.sources, { id: `src-${wallMs().toString(36)}-${draft.sources.length}`, label: "", sourceId: data.sources?.[0]?.id }] })}>Cite a source</Button>
        </div>
      </fieldset>

      <fieldset className="brain-kw-fieldset">
        <legend className="ds-eyebrow">Related records</legend>
        {draft.related.length === 0 && <span className="ds-subtle">No links.</span>}
        <Row gap={1} wrap>
          {draft.related.map((id) => {
            const target = linkedRecord(data, id);
            return (
              <span key={id} className="brain-kw-chip">
                {target ? `${KIND_LABEL[target.collection] ?? target.collection}: ${target.title}` : "Missing record"}
                <button type="button" aria-label={`Remove link to ${target?.title ?? "missing record"}`} onClick={() => patch({ related: draft.related.filter((item) => item !== id) })}><X size={12} /></button>
              </span>
            );
          })}
        </Row>
        <Row gap={2} className="brain-kw-addlink">
          <Select aria-label="Record to link" value={relatedPick} onChange={(event) => setRelatedPick(event.target.value)} className="ds-grow">
            <option value="">Choose a record to link</option>
            {(["knowledge", "facts", "decisions", "sources"] as const).map((group) => {
              const options = linkable.filter((item) => item.collection === group);
              return options.length ? (
                <optgroup key={group} label={KIND_LABEL[group]}>
                  {options.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </optgroup>
              ) : null;
            })}
          </Select>
          <Button size="sm" variant="secondary" disabled={!relatedPick} onClick={() => { patch({ related: [...draft.related, relatedPick] }); setRelatedPick(""); }}>Link</Button>
        </Row>
      </fieldset>

      <Row gap={2} className="brain-kw-editorfoot">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" type="submit" busy={busy}>{record ? (nextStatus !== status ? "Save and return to review" : "Save changes") : "Save draft"}</Button>
      </Row>
    </form>
  );
}
