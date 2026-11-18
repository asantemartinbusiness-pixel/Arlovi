import { useEffect, useRef, useState } from "react";
import { Mail, PlugZap } from "lucide-react";
import {
  Avatar, Button, DataGrid, Empty, Field, Notice, Pill, Row, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { requestMailboxConnection } from "./actions";
import { useCommsData } from "./panels";
import {
  MAIL_FOLDERS, checkDraft, draftInput, draftRecord, folderCounts, folderOf, searchThreads, senderAddress,
  type DraftInput, type MailFolder,
} from "./mailbox";

/* ====================================================================== *
 * ARL-COMMS-005 · Email — folders, search and drafts kept in this browser.
 * No mail provider is connected: nothing on these screens is delivered.
 * ====================================================================== */

export function NotSentNotice({ context }: { context: ScreenContext }) {
  return (
    <div className="cm-notsent">
    <Notice
      tone="warning"
      title="Not sent — no mail provider connected"
      actions={(
        <Button size="sm" variant="secondary" icon={<PlugZap size={14} />} onClick={() => void requestMailboxConnection(context)}>
          Request a mailbox connection
        </Button>
      )}
    >
      Drafts stay in this browser with their recipients and body. Nothing is delivered, queued with a provider or shown to the
      recipient until a mailbox is connected.
    </Notice>
    </div>
  );
}

function counterpart(row: Rec): string {
  const folder = folderOf(row);
  return String(folder === "sent" || folder === "drafts" ? row.fields.to || "No recipient yet" : row.fields.from ?? "");
}

export function MailWorkspace({ context, lens }: { context: ScreenContext; lens: MailFolder }) {
  const data = useCommsData();
  const { org } = useWorkspace();
  const [query, setQuery] = useState("");
  const folder = lens.toLowerCase();
  const searching = query.trim().length > 0;
  const rows = searchThreads(data.emailThreads, query, folder);
  const counts = folderCounts(data.emailThreads);
  const openRow = (id: string) => {
    const row = data.emailThreads.find((thread) => thread.id === id);
    if (row && folderOf(row) === "drafts") context.openOverlay("Compose window", { id });
    else context.navigate(`/o/${org.slug}/comms/email/${id}`);
  };

  return (
    <div className="cm-mail">
      <aside className="cm-mail-folders" aria-label="Mail folders">
        {MAIL_FOLDERS.map((name) => (
          <button
            key={name}
            type="button"
            className="cm-channel cm-mail-folder"
            aria-current={name === lens && !searching ? "true" : undefined}
            onClick={() => { setQuery(""); context.setTab(name); }}
          >
            <Mail size={14} aria-hidden="true" />
            <span className="ds-grow">{name}</span>
            <span className="ds-subtle ds-num">{counts[name.toLowerCase()] ?? 0}</span>
          </button>
        ))}
        <Button size="sm" variant="primary" className="cm-mail-new" onClick={() => context.openOverlay("Compose window")}>
          New draft
        </Button>
      </aside>
      <Stack gap={3}>
        {folder === "drafts" && !searching && <NotSentNotice context={context} />}
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={searching ? "Mail search results" : `${lens} mail`}
          filterable={false}
          toolbar={(
            <>
              <TextInput
                type="search"
                aria-label="Search all mail"
                placeholder="Search all folders"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{ maxWidth: 260, minHeight: "var(--control-h-sm)" }}
              />
              <span className="ds-subtle" role="status">
                {searching ? `${rows.length} ${rows.length === 1 ? "thread" : "threads"} match across every folder` : `${rows.length} in ${lens}`}
              </span>
            </>
          )}
          selectedId={context.selectedId}
          rowTone={(row) => (row.fields.risk === "phishing" ? "danger" : undefined)}
          columns={[
            { key: "from", header: folder === "sent" || folder === "drafts" ? "To" : "From", cell: (row) => (
              <Row gap={2}>
                <Avatar name={counterpart(row)} size="sm" />
                <span className="ds-truncate">{counterpart(row)}</span>
              </Row>
            ), sortValue: (row) => counterpart(row) },
            { key: "subject", header: "Subject", primary: true, cell: (row) => (
              <Row gap={2}>
                {row.fields.unread === true && <Pill tone="accent">New</Pill>}
                <span className="ds-truncate">{row.title}</span>
                {folderOf(row) === "drafts" && <Pill tone="warning" dot>Not sent</Pill>}
                {row.fields.risk === "phishing" && <Pill tone="danger" dot>Suspected phishing</Pill>}
              </Row>
            ), sortValue: (row) => row.title },
            ...(searching ? [{ key: "folder", header: "Folder", cell: (row: Rec) => <Pill>{folderOf(row)}</Pill>, sortValue: (row: Rec) => folderOf(row) }] : []),
            { key: "labels", header: "Labels", cell: (row) => <Row gap={1} wrap>{String(row.fields.labels ?? "").split(",").filter(Boolean).map((label) => <Pill key={label}>{label}</Pill>)}</Row>, hideBelow: 1100 },
            { key: "when", header: "When", align: "end", cell: (row) => context.date(row.at), sortValue: (row) => row.at ?? "" },
          ]}
          onSelect={(id) => context.select(id)}
          onOpen={openRow}
          empty={searching
            ? <Empty title="No mail matches" icon={<Mail size={20} />}>Nothing in any folder contains “{query.trim()}”. Search looks at subjects, addresses, labels and message text.</Empty>
            : <Empty title={`${lens} is empty`} icon={<Mail size={20} />}>{folder === "drafts" ? "Start a new draft; it is kept in this browser as you type." : "Nothing is in this folder."}</Empty>}
          bulkActions={folder === "drafts" && !searching ? [
            { label: "Discard", tone: "danger", onRun: (selected) => selected.forEach((thread) => { void context.mutate.remove(thread.id, `Draft “${thread.title}” discarded by ${context.actor}`); }) },
          ] : [
            { label: "Archive", onRun: (selected) => selected.forEach((thread) => { void context.mutate.patch(thread.id, { status: "archive", fields: { ...thread.fields, folder: "archive" } }, { event: `${thread.title} archived` }); }) },
            { label: "Mark read", onRun: (selected) => selected.forEach((thread) => { void context.mutate.patch(thread.id, { fields: { ...thread.fields, unread: false } }, { event: `${thread.title} marked read` }); }) },
          ]}
        />
      </Stack>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Draft composer — opens new or an existing draft, keeps it as you type.
 * ------------------------------------------------------------------ */

const EMPTY: DraftInput = { to: "", cc: "", subject: "", body: "" };
const AUTOSAVE_MS = 900;

export function DraftComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; to?: string; subject?: string } | undefined;
  const existing = useRecord(payload?.id);
  const [draft, setDraft] = useState<DraftInput>({ ...EMPTY, to: payload?.to ?? "", subject: payload?.subject ?? "" });
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const idRef = useRef<string | undefined>(payload?.id);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const from = senderAddress(context.actor, context.org.slug);
  const check = checkDraft(draft);

  // Read an existing draft into the editor once, when it arrives.
  if (existing && existing.collection === "emailThreads" && loadedFrom !== existing.id) {
    setLoadedFrom(existing.id);
    setDraft(draftInput(existing));
    setSavedAt(String(existing.fields.savedLocallyAt ?? existing.updatedAt));
  }

  const edit = (patch: Partial<DraftInput>) => { setDraft((value) => ({ ...value, ...patch })); setDirty(true); };

  /** Writes are chained, so a quick typist never creates two drafts. */
  const save = (value: DraftInput): Promise<boolean> => {
    const run = chain.current.then(async () => {
      if (checkDraft(value).blocking.length) return false;
      const at = clockIso();
      try {
        if (idRef.current) {
          const previous = existing && existing.id === idRef.current ? existing : undefined;
          await context.mutate.patch(idRef.current, draftRecord(value, from, at, previous), { event: `Email draft updated by ${context.actor}` });
        } else {
          const created = await context.mutate.create({ collection: "emailThreads", tags: ["draft"], ...draftRecord(value, from, at) }, `Email draft saved by ${context.actor}`);
          idRef.current = created.id;
        }
        setSavedAt(at);
        setFailure("");
        return true;
      } catch (error) {
        setFailure(error instanceof Error ? error.message : "The draft could not be saved.");
        return false;
      }
    });
    chain.current = run;
    return run;
  };

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => { setDirty(false); void save(draft); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty]);

  const status = failure
    ? <Pill tone="danger" dot>Not saved</Pill>
    : check.blocking.length && (draft.to || draft.cc)
      ? <Pill tone="danger" dot>Fix the addresses to save</Pill>
      : dirty
        ? <Pill tone="neutral" dot>Unsaved changes</Pill>
        : savedAt
          ? <Pill tone="success" dot>Saved in this browser {context.date(savedAt, { hour: "2-digit", minute: "2-digit" })}</Pill>
          : <Pill tone="neutral">Not saved yet</Pill>;

  return (
    <form
      id="cm-compose"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setDirty(false);
        if (check.blocking.length) return;
        const ok = await save(draft);
        if (!ok) return;
        context.toast("Draft saved", "The draft is in this workspace with its recipients and body. No mail provider is connected, so nothing was sent.");
        close();
      }}
    >
      <Row gap={2} wrap>
        <span className="ds-subtle ds-grow">From {from}</span>
        <span role="status" aria-live="polite">{status}</span>
      </Row>
      <Field label="To" hint="Separate addresses with a comma.">
        <TextInput value={draft.to} onChange={(event) => edit({ to: event.target.value })} invalid={check.invalid.some((value) => draft.to.includes(value))} />
      </Field>
      <Field label="Cc"><TextInput value={draft.cc ?? ""} onChange={(event) => edit({ cc: event.target.value })} invalid={check.invalid.some((value) => (draft.cc ?? "").includes(value))} /></Field>
      <Field label="Subject"><TextInput value={draft.subject} onChange={(event) => edit({ subject: event.target.value })} /></Field>
      <Field label="Message"><TextArea value={draft.body} onChange={(event) => edit({ body: event.target.value })} rows={7} /></Field>
      {check.invalid.length > 0 && <Notice tone="danger" title="One of those is not an address">{check.blocking[0]}. The draft is not saved until every recipient is an email address.</Notice>}
      {failure && <Notice tone="danger" title="Draft not saved">{failure}</Notice>}
      {check.invalid.length === 0 && check.warnings.length > 0 && (draft.to || draft.subject || draft.body) && (
        <p className="ds-subtle">Before it could be sent: {check.warnings.join(" ")}</p>
      )}
      <NotSentNotice context={context} />
      {idRef.current && (
        <Row gap={2}>
          <Button type="button" size="sm" variant="outline-danger" onClick={async () => {
            const id = idRef.current;
            if (!id) return;
            await chain.current;
            await context.mutate.remove(id, `Draft “${draft.subject || "(no subject)"}” discarded by ${context.actor}`);
            context.toast("Draft discarded", "It was removed from this browser.");
            close();
          }}>Discard draft</Button>
        </Row>
      )}
    </form>
  );
}
