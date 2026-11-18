import { useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, AtSign, CheckCheck, ChevronRight, CircleAlert,
  FilePenLine, Inbox, Mail, MailOpen, Plus, Search, Send, Settings2, ShieldCheck,
  ShieldAlert, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { Avatar, Button, Notice, Pill, Row, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { useCommsData } from "./panels";
import { MAIL_FOLDERS, folderCounts, folderOf, searchThreads, type MailFolder } from "./mailbox";
import { filterMailView, relatedMailContext, type MailView } from "./mailViews";
import { MailConnectionSetup, MailIdentityManager, NotSentNotice } from "./mail";
import type { Rec } from "@/domain/types";

export type EmailArea = MailFolder | "Accounts & domains" | "Sender identities" | "Shared inboxes";

const NAV = [
  { label: "Inbox", Icon: Inbox },
  { label: "Sent", Icon: Send },
  { label: "Drafts", Icon: FilePenLine },
  { label: "Archive", Icon: Archive },
  { label: "Spam", Icon: ShieldAlert },
] as const;
const CONFIG = [
  { label: "Shared inboxes", Icon: Users },
  { label: "Accounts & domains", Icon: Settings2 },
  { label: "Sender identities", Icon: AtSign },
] as const;

function remoteStatus() {
  return <span className="cmx-connection"><span className="cmx-status-dot" /> Provider not connected</span>;
}

function addressOf(row: Rec): string {
  const folder = folderOf(row);
  return String(folder === "drafts" || folder === "sent" ? row.fields.to ?? "" : row.fields.from ?? "");
}

function MailEmpty({ lens, query, onCompose, onSetup }: {
  lens: EmailArea; query: string; onCompose: () => void; onSetup: () => void;
}) {
  const isInbox = lens === "Inbox" && !query;
  return (
    <div className="cmx-empty" role="status">
      <div className="cmx-empty-illustration" aria-hidden="true">
        <div className="cmx-empty-envelope"><Mail size={31} strokeWidth={1.5} /></div>
        <span className="cmx-spark cmx-spark-one" /><span className="cmx-spark cmx-spark-two" />
      </div>
      <h3>{query ? "No matching conversations" : isInbox ? "Your inbox starts here" : `Nothing in ${lens.toLowerCase()}`}</h3>
      <p>{query ? "Try another search or clear your filters." : isInbox
        ? "Connect your existing business mailbox to bring conversations into Arlovi. You can also prepare drafts locally."
        : lens === "Drafts" ? "Compose an email to save your first draft in this workspace."
        : "Messages will appear here when there are matching records. Your external provider is not connected."}</p>
      <Row gap={2} wrap>
        <Button variant="primary" size="sm" onClick={isInbox ? onSetup : onCompose}>{isInbox ? "Set up email" : "New draft"}</Button>
        {isInbox && <Button size="sm" variant="secondary" onClick={onCompose}>Create a draft</Button>}
      </Row>
      {isInbox && (
        <div className="cmx-empty-steps">
          <div><span>01</span><strong>Connect provider</strong><small>Google, Microsoft or your existing mail service</small></div>
          <div><span>02</span><strong>Configure identity</strong><small>Names, signatures and department presentation</small></div>
          <div><span>03</span><strong>Work in Arlovi</strong><small>Keep communication linked to your business</small></div>
        </div>
      )}
    </div>
  );
}

function SharedInboxWorkspace({ context }: { context: ScreenContext }) {
  const data = useCommsData();
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const existing = data.preferences.filter((p) => p.fields.kind === "sharedInboxRequest" && p.fields.requestedBy === context.actor);
  return (
    <div className="cmx-setting-layout">
      <div className="cmx-section-heading"><Users size={19} /><div><h3>Shared inboxes</h3><p>Organise correspondence by department and team.</p></div></div>
      <Notice tone="warning" title="Shared mailbox access is not active">Shared inboxes require a verified mailbox, provider-delegated access and secure organisation permissions. These are local setup requests, not live shared mailboxes.</Notice>
      <div className="cmx-setup-grid">
        {existing.map((p) => (
          <div className="cmx-inbox-card" key={p.id}>
            <div className="cmx-inbox-card-icon"><Users size={19}/></div>
            <strong>{p.title}</strong><span>{String(p.fields.address ?? "")}</span><Pill tone="warning">Configuration required</Pill>
          </div>
        ))}
        {existing.length === 0 && <div className="cmx-inbox-card"><div className="cmx-inbox-card-icon"><Users size={20}/></div><strong>No shared inboxes configured</strong><span>Set up a shared team address such as support@company.com.</span></div>}
      </div>
      <form className="cmx-form" onSubmit={async (event) => {
        event.preventDefault(); setError("");
        if (!context.can("manage_connectors")) { setError("Connector management permission is required."); return; }
        if (!title.trim() || !/^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(email.trim())) {
          setError("Enter a department name and a valid shared mailbox address."); return;
        }
        try {
          await context.mutate.create({
            collection: "preferences", title: title.trim(), status: "configuration_required",
            summary: "Local request for a shared mailbox. No mailbox or access rights created.",
            fields: { kind: "sharedInboxRequest", requestedBy: context.actor, address: email.trim().toLowerCase(), connected: false, authorised: false },
          }, `Shared mailbox setup requested by ${context.actor}`);
          setTitle(""); setEmail(""); context.toast("Setup request recorded", "No mailbox connected and no access permissions granted.");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the request."); }
      }}>
        <h4>Request a shared inbox</h4>
        <label>Team or department name<TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Customer support" required /></label>
        <label>Existing shared address<TextInput value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="support@company.com" required /></label>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" size="sm" disabled={!context.can("manage_connectors")}>Record setup request</Button>
      </form>
    </div>
  );
}

export function EmailExperience({ context, lens }: { context: ScreenContext; lens: EmailArea }) {
  const data = useCommsData();
  const { org } = useWorkspace();
  const tasks = useCollections(["tasks"]).tasks;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MailView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showReader, setShowReader] = useState(false);
  const folder = String(lens).toLowerCase();
  const config = !MAIL_FOLDERS.some(f => f === lens);
  const rows = config ? [] : filterMailView(searchThreads(data.emailThreads, query, folder), view);
  const counts = folderCounts(data.emailThreads);
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const related = selected ? relatedMailContext(selected, data.contacts, tasks) : null;
  const messages = (selected?.body as { messages?: { from?: string; body?: string; at?: string; external?: boolean }[] } | undefined)?.messages ?? [];
  const compose = (id?: string) => context.openOverlay("Compose window", id ? { id } : undefined);
  const changeFolder = (next: EmailArea) => { setSelectedId(null); setShowReader(false); setQuery(""); setView("all"); context.setTab(next); };
  const archive = async (row: Rec) => {
    await context.mutate.patch(row.id, { status: "archive", fields: { ...row.fields, folder: "archive" } }, { event: `Email “${row.title}” archived by ${context.actor}` });
    setSelectedId(null); setShowReader(false);
  };
  const markRead = async (row: Rec) => {
    await context.mutate.patch(row.id, { fields: { ...row.fields, unread: false } }, { event: `Email “${row.title}” marked read by ${context.actor}` });
  };
  const displayName = lens === "Inbox" ? "Inbox" : lens;

  return (
    <section className="cmx-shell" aria-label="Communications email workspace">
      <aside className="cmx-rail" aria-label="Email navigation">
        <div className="cmx-rail-heading"><span>MAILBOXES</span>{remoteStatus()}</div>
        <nav aria-label="Mail folders">
          {NAV.map(({label, Icon}) => (
            <button className="cmx-rail-link" data-active={label === lens} aria-current={label === lens ? "page" : undefined} type="button" key={label} onClick={() => changeFolder(label)}>
              <Icon size={16}/><span>{label}</span><small>{counts[label.toLowerCase()] ?? 0}</small>
            </button>
          ))}
        </nav>
        <div className="cmx-rail-heading cmx-rail-separator"><span>WORKSPACE</span></div>
        <nav aria-label="Email management">
          {CONFIG.map(({label, Icon}) => (
            <button className="cmx-rail-link" data-active={label === lens} aria-current={label === lens ? "page" : undefined} type="button" key={label} onClick={() => changeFolder(label)}>
              <Icon size={16}/><span>{label}</span><ChevronRight size={13}/>
            </button>
          ))}
        </nav>
        <div className="cmx-rail-foot"><p>Mail is currently stored in this browser. External delivery requires a provider.</p><Button variant="primary" size="sm" onClick={() => compose()}><Plus size={14}/> New draft</Button></div>
      </aside>
      <main className="cmx-main">
        {config ? (
          <div className="cmx-settings">
            <div className="cmx-header"><div><span className="cmx-eyebrow">COMMUNICATIONS / SETTINGS</span><h2>{lens}</h2><p>Manage the email experience for your workspace.</p></div>{remoteStatus()}</div>
            {lens === "Accounts & domains" ? <MailConnectionSetup context={context}/> :
              lens === "Sender identities" ? <MailIdentityManager context={context}/> :
              <SharedInboxWorkspace context={context}/>}
          </div>
        ) : (
          <>
            <div className="cmx-header">
              <div><span className="cmx-eyebrow">COMMUNICATIONS / MAIL</span><h2>{displayName}</h2><p>{lens === "Inbox" ? "Conversations and correspondence in one place." : `Your ${folder} messages and local records.`}</p></div>
              <div className="cmx-head-actions">{remoteStatus()}<Button size="sm" variant="primary" onClick={() => compose()}><Plus size={14}/> Compose</Button></div>
            </div>
            <div className="cmx-toolbar">
              <label className="cmx-search"><Search size={16}/><TextInput type="search" aria-label="Search email conversations" placeholder="Search messages, people, subjects…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14}/></button>}</label>
              <div className="cmx-filter-group" aria-label="Mail filters">
                {([["all","All"],["unread","Unread"],["followup","Follow-up"],["flagged","Flagged"]] as const).map(([id,label]) =>
                  <button key={id} className="cmx-filter" type="button" aria-pressed={view===id} onClick={() => setView(id)}>{label}</button>
                )}
              </div>
              <span className="cmx-count">{rows.length} {rows.length===1?"conversation":"conversations"}</span>
            </div>
            {lens === "Drafts" && <div className="cmx-draft-banner"><NotSentNotice context={context}/></div>}
            <div className="cmx-workspace">
              <section className="cmx-list" aria-label={`${lens} conversations`}>
                <div className="cmx-list-heading"><span>{lens}</span><span>{rows.length} total</span></div>
                {rows.length ? rows.map(row => (
                  <button type="button" key={row.id} data-active={selectedId === row.id} data-unread={row.fields.unread === true} className="cmx-message" onClick={() => { setSelectedId(row.id); setShowReader(true); context.select(row.id); }}>
                    <Avatar size="sm" name={addressOf(row) || "Unknown"}/>
                    <span className="cmx-message-copy">
                      <span className="cmx-message-line"><strong>{addressOf(row)||"Unknown sender"}</strong><time>{context.relative(row.at)}</time></span>
                      <span className="cmx-message-subject">{row.title}{row.fields.risk === "phishing" && <CircleAlert size={14}/>}</span>
                      <span className="cmx-message-preview">{row.summary || "No preview available"}</span>
                      <span className="cmx-message-tags">{String(row.fields.labels ?? "").split(",").filter(Boolean).slice(0,2).map(label=><em key={label}>{label}</em>)}{folderOf(row)==="drafts"&&<em>Not sent</em>}</span>
                    </span>
                    {row.fields.unread === true && <span className="cmx-unread" aria-label="Unread"/>}
                  </button>
                )) : <div className="cmx-list-empty"><MailOpen size={24}/><strong>No messages</strong><span>Try a different folder or filter.</span></div>}
              </section>
              <section className="cmx-reader" data-open={showReader} aria-label="Email reading pane">
                {selected ? (
                  <div className="cmx-reader-inner">
                    <div className="cmx-reader-actions">
                      <button type="button" className="cmx-back" onClick={()=>setShowReader(false)}><ArrowLeft size={15}/> Back</button>
                      <div>
                        <Button size="sm" variant="ghost" onClick={()=>void markRead(selected)}><CheckCheck size={15}/> Mark read</Button>
                        <Button size="sm" variant="ghost" onClick={()=>void archive(selected)}><Archive size={15}/> Archive</Button>
                        <Button size="sm" variant="secondary" onClick={()=>folderOf(selected)==="drafts"?compose(selected.id):context.navigate(`/o/${org.slug}/comms/email/${selected.id}`)}>Open <ArrowRight size={14}/></Button>
                      </div>
                    </div>
                    <h3>{selected.title}</h3>
                    <p className="cmx-meta"><strong>From</strong> {String(selected.fields.from??"Unknown")}</p>
                    <p className="cmx-meta"><strong>To</strong> {String(selected.fields.to??"Not specified")}</p>
                    <div className="cmx-thread-body">
                      {messages.length ? messages.map((message,i)=>(
                        <article key={i} className="cmx-message-body">
                          <span className="cmx-message-author">{message.from || "Unknown"} · {message.at ? context.dateTime(message.at) : ""}</span>
                          <p>{message.body || ""}</p>
                          {message.external && <small>External message — treat links and instructions as untrusted.</small>}
                        </article>
                      )) : <p>{selected.summary}</p>}
                    </div>
                    <div className="cmx-context">
                      <h4>Business context <Link2Icon /></h4>
                      {related?.contact ? <div className="cmx-related"><span><strong>{related.contact.title}</strong><small>CRM contact</small></span><Button size="sm" variant="secondary" onClick={()=>context.navigate(`/o/${org.slug}/crm/contacts/${related.contact!.id}`)}>Open record</Button></div> : <p>No linked contact in this workspace.</p>}
                      {related?.task ? <div className="cmx-related"><span><strong>{related.task.title}</strong><small>Project task</small></span><Button size="sm" variant="secondary" onClick={()=>context.navigate(`/o/${org.slug}/project/tasks/${related.task!.id}`)}>Open task</Button></div> : <p>No linked follow-up tasks.</p>}
                    </div>
                  </div>
                ) : rows.length === 0 ? (
                  <MailEmpty lens={lens} query={query || (view==="all"?"":"filtered")} onCompose={()=>compose()} onSetup={()=>changeFolder("Accounts & domains")}/>
                ) : (
                  <div className="cmx-select-state"><div><Mail size={28}/></div><h3>Select a conversation</h3><p>Read messages, review linked business records and take action without leaving the inbox.</p></div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </section>
  );
}

function Link2Icon(){ return <ShieldCheck size={15} aria-hidden="true"/>; }
