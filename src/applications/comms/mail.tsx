import { useEffect, useRef, useState } from "react";
import { Mail, PlugZap, UserRound, Link2, ShieldAlert, ChevronDown, ChevronUp, FilePenLine, Save, Signature } from "lucide-react";
import {
  Avatar, Button, DataGrid, Empty, Field, Notice, Pill, Row, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { requestMailboxConnection } from "./actions";
import { useCommsData } from "./panels";
import { configuredIdentities, validateIdentity } from "./mailIdentities";
import { ComposeTools, RecipientPicker } from "./ComposeAddons";
import { parseComposeReferences, type ComposeReference } from "./composeTools";
import { filterMailView, relatedMailContext, type MailView } from "./mailViews";
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
  const [view, setView] = useState<MailView>("all");
  const [manageIdentities, setManageIdentities] = useState(false);
  const [manageConnections, setManageConnections] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const folder = lens.toLowerCase();
  const searching = query.trim().length > 0;
  const rows = filterMailView(searchThreads(data.emailThreads, query, folder), view);
  const counts = folderCounts(data.emailThreads);
  const relatedTasks = useCollections(["tasks"]).tasks;
  const preview = data.emailThreads.find((thread) => thread.id === previewId) ?? null;
  const previewMessages = (preview?.body as { messages?: { from?: string; body?: string; at?: string }[] } | undefined)?.messages ?? [];
  const related = preview ? relatedMailContext(preview, data.contacts, relatedTasks) : null;
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
        <Button size="sm" variant="secondary" onClick={() => setManageConnections((value) => !value)}>
          <PlugZap size={14} /> Accounts & domains
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setManageIdentities((value) => !value)}>
          <UserRound size={14} /> Sender identities
        </Button>
      </aside>
      <Stack gap={3}>
        <div className="cm-mail-views" role="group" aria-label="Filter mail messages">
          {([["all", "All messages"], ["unread", "Unread"], ["followup", "Follow-up"], ["flagged", "Flagged"]] as const).map(([id, label]) => (
            <button key={id} type="button" className="cm-mail-view" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        {manageConnections && <MailConnectionSetup context={context} />}
        {manageIdentities && <MailIdentityManager context={context} />}
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
          onSelect={(id) => { context.select(id); setPreviewId(id); }}
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
        {preview && (
          <section className="cm-mail-preview" aria-label="Selected email preview">
            <Row gap={2} wrap>
              <strong className="ds-grow">{preview.title}</strong>
              <Button size="sm" variant="ghost" onClick={() => setPreviewId(null)}>Close preview</Button>
              <Button size="sm" variant="secondary" onClick={() => openRow(preview.id)}>Open conversation</Button>
            </Row>
            <p className="ds-subtle">From: {String(preview.fields.from ?? "Unknown")} · To: {String(preview.fields.to ?? "Not specified")}</p>
            {previewMessages.map((message, index) => (
              <article className="cm-mail-preview-message" key={index}>
                <p className="ds-subtle">{message.from ?? "Unknown"} {message.at ? "· " + context.dateTime(message.at) : ""}</p>
                <p className="cm-mail-preview-body">{message.body ?? ""}</p>
              </article>
            ))}
            {previewMessages.length === 0 && <p>{preview.summary}</p>}
            <section className="cm-mail-preview-context" aria-label="Related records">
              <Row gap={2}><Link2 size={15} /><strong>Business context</strong></Row>
              {related?.contact ? (
                <Row gap={2} wrap>
                  <span className="ds-grow">Contact: {related.contact.title}</span>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/crm/contacts/${related.contact!.id}`)}>Open in CRM</Button>
                </Row>
              ) : <p className="ds-subtle">No matching contact in the current workspace. A matching email address alone does not grant access to another application.</p>}
              {related?.task ? (
                <Row gap={2} wrap>
                  <span className="ds-grow">Follow-up: {related.task.title}</span>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/project/tasks/${related.task!.id}`)}>Open task</Button>
                </Row>
              ) : <p className="ds-subtle">No linked follow-up task.</p>}
              <Notice tone="info">Context is based on this browser's local records, not synchronised provider data. Use the record's own permissions before opening it.</Notice>
            </section>
          </section>
        )}
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
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [references, setReferences] = useState<ComposeReference[]>([]);
  const idRef = useRef<string | undefined>(payload?.id);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const commsData = useCommsData();
  const identities = configuredIdentities(commsData.preferences, context.actor);
  const contacts = [...commsData.contacts, ...commsData.employees, ...commsData.members];
  const [identityId, setIdentityId] = useState("");
  const identity = identities.find((item) => item.id === identityId);
  const from = identity?.address ?? senderAddress(context.actor, context.org.slug);
  const check = checkDraft(draft);

  // Read an existing draft into the editor once, when it arrives.
  if (existing && existing.collection === "emailThreads" && loadedFrom !== existing.id) {
    setLoadedFrom(existing.id);
    setDraft(draftInput(existing));
    setShowCc(Boolean(existing.fields.cc));
    setShowBcc(Boolean(existing.fields.bcc));
    setReferences(parseComposeReferences(existing.fields.documentReferences));
    setIdentityId(String(existing.fields.senderIdentityId ?? ""));
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
          await context.mutate.patch(idRef.current, { ...draftRecord(value, from, at, previous), fields: { ...draftRecord(value, from, at, previous).fields, senderIdentityId: identity?.id ?? "", senderDisplayName: identity?.name ?? context.actor, senderSignature: identity?.signature ?? "", senderVerified: false, documentReferences: JSON.stringify(references) } }, { event: `Email draft updated by ${context.actor}` });
        } else {
          const created = await context.mutate.create({ collection: "emailThreads", tags: ["draft"], ...{ ...draftRecord(value, from, at), fields: { ...draftRecord(value, from, at).fields, senderIdentityId: identity?.id ?? "", senderDisplayName: identity?.name ?? context.actor, senderSignature: identity?.signature ?? "", senderVerified: false, documentReferences: JSON.stringify(references) } } }, `Email draft saved by ${context.actor}`);
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
    : check.blocking.length && (draft.to || draft.cc || draft.bcc)
      ? <Pill tone="danger" dot>Fix the addresses to save</Pill>
      : dirty
        ? <Pill tone="neutral" dot>Unsaved changes</Pill>
        : savedAt
          ? <Pill tone="success" dot>Saved in this browser {context.date(savedAt, { hour: "2-digit", minute: "2-digit" })}</Pill>
          : <Pill tone="neutral">Not saved yet</Pill>;

  return (
    <form
      id="cm-compose"
      className="cm-compose"
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
      <div className="cm-compose-heading">
        <span className="cm-compose-mark"><FilePenLine size={17} /></span>
        <div><strong>New message</strong><small>Compose within Arlovi · Draft only</small></div>
        <span className="cm-compose-state" role="status" aria-live="polite"><Save size={13}/>{status}</span>
      </div>
      <div className="cm-compose-fields">
        <div className="cm-compose-row">
          <label htmlFor="cm-sender">From</label>
          <div className="cm-compose-control">
            <select id="cm-sender" className="cm-mail-identity-select" value={identityId}
              onChange={(event) => { setIdentityId(event.target.value); setDirty(true); }}>
              <option value="">{context.actor} · {senderAddress(context.actor, context.org.slug)} (placeholder)</option>
              {identities.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.address} (unverified)</option>)}
            </select>
            <small className="cm-compose-help">Provider authorisation required before sending.</small>
          </div>
        </div>
        <div className="cm-compose-row">
          <label htmlFor="cm-to">To</label>
          <div className="cm-compose-recipient">
            <RecipientPicker id="cm-to" label="To" value={draft.to} onChange={(value) => edit({ to: value })}
              contacts={contacts} invalid={check.invalid.some((value) => draft.to.includes(value))} />
            <button type="button" className="cm-compose-inline" onClick={() => setShowCc((value) => !value)}
              aria-expanded={showCc} aria-controls="cm-cc">{showCc ? "Hide Cc" : "Cc"} {showCc ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</button>
            <button type="button" className="cm-compose-inline" onClick={() => setShowBcc((value) => !value)}
              aria-expanded={showBcc} aria-controls="cm-bcc">{showBcc ? "Hide Bcc" : "Bcc"} {showBcc ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</button>
          </div>
        </div>
        {(showCc || Boolean(draft.cc)) && <div className="cm-compose-row" id="cm-cc">
          <label htmlFor="cm-cc-input">Cc</label>
          <RecipientPicker id="cm-cc-input" label="Cc" value={draft.cc ?? ""}
            onChange={(value) => edit({ cc: value })} contacts={contacts}
            invalid={check.invalid.some((value) => (draft.cc ?? "").includes(value))}/>
        </div>}
        {(showBcc || Boolean(draft.bcc)) && <div className="cm-compose-row" id="cm-bcc">
          <label htmlFor="cm-bcc-input">Bcc</label>
          <RecipientPicker id="cm-bcc-input" label="Bcc" value={draft.bcc ?? ""}
            onChange={(value) => edit({ bcc: value })} contacts={contacts}
            invalid={check.invalid.some((value) => (draft.bcc ?? "").includes(value))}/>
        </div>}
        <div className="cm-compose-row">
          <label htmlFor="cm-subject">Subject</label>
          <TextInput id="cm-subject" value={draft.subject} onChange={(event) => edit({ subject: event.target.value })}
            placeholder="What is this message about?" />
        </div>
        <div className="cm-compose-editor">
          <label htmlFor="cm-message">Message</label>
          <TextArea id="cm-message" value={draft.body} onChange={(event) => edit({ body: event.target.value })}
            rows={7} placeholder="Write your message…" />
          <ComposeTools documents={commsData.documents} references={references}
            onReferencesChange={(next) => { setReferences(next); setDirty(true); }}
            message={draft.body} onMessageChange={(next) => edit({ body: next })} />
          <div className="cm-compose-editor-tools">
            <span>{draft.body.length} characters</span>
            <button type="button" disabled={!identity?.signature} onClick={() => setShowSignature((value) => !value)} aria-expanded={showSignature}>
              <Signature size={13}/> {showSignature ? "Hide signature" : "Preview signature"}
            </button>
          </div>
          {showSignature && identity?.signature && <div className="cm-compose-signature"><strong>Signature preview</strong><p>{identity.signature}</p></div>}
        </div>
      </div>
      {check.invalid.length > 0 && <Notice tone="danger" title="One of those is not an address">{check.blocking[0]}. The draft is not saved until every recipient is an email address.</Notice>}
      {failure && <Notice tone="danger" title="Draft not saved">{failure}</Notice>}
      {check.invalid.length === 0 && check.warnings.length > 0 && (draft.to || draft.subject || draft.body) && (
        <p className="ds-subtle">Before it could be sent: {check.warnings.join(" ")}</p>
      )}
      <div className="cm-compose-connect"><ShieldAlert size={16}/><div><strong>Draft only — provider not connected</strong><small>Saved in this browser. Nothing is delivered to recipients.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => void requestMailboxConnection(context)}>Request connection</Button></div>
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

/** Persist local sender presentation only; never treat an arbitrary From address as verified. */
export function MailIdentityManager({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const identities = configuredIdentities(data.preferences, context.actor);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [department, setDepartment] = useState("");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="cm-mail-identities" aria-label="Sender identity configuration">
      <Row gap={2}><UserRound size={16} /><strong>Sender identity presentation</strong></Row>
      <Notice tone="warning" title="Not connected or authorised">
        These settings save an identity and signature in this browser only. Domain DNS, mailboxes, OAuth, send-as permissions and delivery must be verified by the real provider before sending can be enabled.
      </Notice>
      {identities.map((identity) => (
        <Row key={identity.id} gap={2} wrap>
          <span className="ds-grow">{identity.name} · {identity.address} {identity.department ? "· " + identity.department : ""}</span>
          <Pill tone="warning">Unverified</Pill>
          <Button size="sm" variant="ghost" onClick={async () => {
            await context.mutate.remove(identity.id, `Sender identity ${identity.address} removed by ${context.actor}`);
          }}>Remove</Button>
        </Row>
      ))}
      <form className="cm-mail-identity-form" onSubmit={async (event) => {
        event.preventDefault();
        const issue = validateIdentity(name, address);
        if (issue) { setError(issue); return; }
        if (identities.some((item) => item.address.toLowerCase() === address.trim().toLowerCase())) {
          setError("That address has already been configured."); return;
        }
        try {
          await context.mutate.create({
            collection: "preferences", title: name.trim(), status: "draft",
            summary: `Unverified sender presentation for ${address.trim()}`,
            fields: { kind: "mailIdentity", person: context.actor, displayName: name.trim(), address: address.trim(), department: department.trim(), signature: signature.trim(), verified: false },
          }, `Local sender presentation saved by ${context.actor}`);
          setName(""); setAddress(""); setDepartment(""); setSignature(""); setError("");
          context.toast("Identity saved locally", "Provider permission and domain authentication are still required. Sending remains disabled.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "The identity could not be saved.");
        }
      }}>
        <Field label="Display name"><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Email address"><TextInput type="email" value={address} onChange={(event) => setAddress(event.target.value)} required /></Field>
        <Field label="Department"><TextInput value={department} onChange={(event) => setDepartment(event.target.value)} /></Field>
        <Field label="Signature"><TextArea rows={3} value={signature} onChange={(event) => setSignature(event.target.value)} /></Field>
        {error && <Notice tone="danger"><ShieldAlert size={14} /> {error}</Notice>}
        <Button type="submit" size="sm" variant="primary"><Link2 size={14} /> Save local identity</Button>
      </form>
    </section>
  );
}

/**
 * Setup records are intentionally configuration requests, not connections.
 * Real OAuth callbacks, secret storage and DNS verification need a server.
 */
export function MailConnectionSetup({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const [provider, setProvider] = useState("google");
  const [domain, setDomain] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [error, setError] = useState("");
  const requests = data.preferences.filter((item) =>
    item.fields.kind === "mailProviderSetup" && item.fields.requestedBy === context.actor);
  const providers: Record<string, string> = {
    google: "Google Workspace / Gmail",
    microsoft: "Microsoft 365 / Outlook",
    other: "Other IMAP/SMTP provider",
    transactional: "Domain-authenticated system messages",
  };
  const canManage = context.can("manage_connectors");
  return (
    <section className="cm-mail-identities" aria-label="Mail accounts and domain setup">
      <Row gap={2} wrap><PlugZap size={16} /><strong className="ds-grow">Accounts & domain setup</strong><Pill tone="warning">Provider not connected</Pill></Row>
      <Notice tone="info" title="Use the company's existing email provider">
        Google and Microsoft accounts require OAuth with an approved backend callback. Other providers need secure server-side credentials. Domain DNS verification cannot be performed in this browser-only workspace.
      </Notice>
      {requests.length > 0 && (
        <div className="ds-stack ds-gap-2">
          <strong>Configuration requests</strong>
          {requests.map((request) => (
            <Row key={request.id} gap={2} wrap>
              <span className="ds-grow">{providers[String(request.fields.provider)] ?? "Email provider"} · {String(request.fields.mailbox ?? request.fields.domain ?? "")}</span>
              <Pill tone="warning">Configuration required</Pill>
            </Row>
          ))}
        </div>
      )}
      <form className="cm-mail-identity-form" onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        if (!canManage) { setError("You do not have connector management permission."); return; }
        const normalizedDomain = domain.trim().toLowerCase();
        const normalizedMailbox = mailbox.trim().toLowerCase();
        if (normalizedDomain && !/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalizedDomain)) {
          setError("Enter a valid company domain without https:// or a path."); return;
        }
        if (provider !== "transactional" && !/^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(normalizedMailbox)) {
          setError("Enter the existing mailbox address."); return;
        }
        if (provider === "transactional" && !normalizedDomain) {
          setError("Enter the company domain for system messages."); return;
        }
        try {
          await context.mutate.create({
            collection: "preferences",
            title: `Mail provider setup: ${providers[provider]}`,
            status: "configuration_required",
            summary: "A configuration request only. No credentials or DNS changes have been made.",
            fields: { kind: "mailProviderSetup", requestedBy: context.actor, provider, domain: normalizedDomain, mailbox: normalizedMailbox, state: "configuration_required", verified: false, connected: false },
          }, `Email provider configuration requested by ${context.actor}`);
          setDomain(""); setMailbox("");
          context.toast("Configuration request recorded", "Nothing connected, no DNS records were changed and no email can be sent yet.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Setup request could not be saved.");
        }
      }}>
        <Field label="Provider">
          <select className="cm-mail-identity-select" value={provider} onChange={(event) => setProvider(event.target.value)}>
            {Object.entries(providers).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        <Field label="Existing company domain (optional for individual accounts)">
          <TextInput value={domain} placeholder="company.com" onChange={(event) => setDomain(event.target.value)} />
        </Field>
        {provider !== "transactional" && <Field label="Existing mailbox address"><TextInput type="email" placeholder="jane@company.com" value={mailbox} onChange={(event) => setMailbox(event.target.value)} /></Field>}
        <div className="cm-mail-setup-help">
          <strong>What the live connection must verify</strong>
          <p className="ds-subtle">Domain ownership and existing MX records; provider consent; mailbox access; approved send-as aliases; SPF/DKIM/DMARC alignment for any separate system-mail sender. Existing mail hosting must not be overwritten.</p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="sm" variant="primary" disabled={!canManage}>Record setup request</Button>
      </form>
      {!canManage && <Notice tone="warning">Only connector administrators can request a provider setup.</Notice>}
    </section>
  );
}
