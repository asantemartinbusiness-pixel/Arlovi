import { useState } from "react";
import { AtSign, FileText, Link2, Paperclip, Search, X } from "lucide-react";
import { Button, TextInput } from "@/design-system";
import type { Rec } from "@/domain/types";
import {
  addComposeRecipient, contactQuery, documentSuggestions, findComposeContacts,
  insertComposeLink, safeComposeLink, type ComposeReference,
} from "./composeTools";

export function RecipientPicker({
  id, value, label, onChange, contacts, invalid,
}: {
  id: string; value: string; label: string; onChange: (next: string) => void; contacts: Rec[]; invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = contactQuery(value);
  const matches = findComposeContacts(contacts, query);
  return (
    <div className="cm-compose-picker">
      <TextInput id={id} value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Search contacts or enter an email" invalid={invalid} autoComplete="off"
        aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={`${id}-suggestions`} />
      {open && matches.length > 0 && (
        <div id={`${id}-suggestions`} className="cm-compose-suggestions" role="listbox" aria-label={`${label} contact suggestions`}>
          <div className="cm-compose-suggestions-heading"><Search size={12}/> Workspace contacts</div>
          {matches.map((person) => (
            <button key={person.id} type="button" role="option" aria-selected={false}
              onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(addComposeRecipient(value, person.address)); setOpen(false); }}>
              <span className="cm-compose-contact-avatar">{person.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{person.name}</strong><small>{person.address}</small></span>
              <AtSign size={13} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComposeTools({
  documents, references, onReferencesChange, message, onMessageChange,
}: {
  documents: Rec[]; references: ComposeReference[]; onReferencesChange: (next: ComposeReference[]) => void;
  message: string; onMessageChange: (next: string) => void;
}) {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const matches = documentSuggestions(documents, query).filter((row) => !references.some((ref) => ref.id === row.id));
  return (
    <div className="cm-compose-tools">
      <div className="cm-compose-tool-buttons" role="group" aria-label="Email composition tools">
        <button type="button" aria-expanded={showDocuments} onClick={() => { setShowDocuments(!showDocuments); setShowLink(false); }}>
          <Paperclip size={15}/> Add document reference
        </button>
        <button type="button" aria-expanded={showLink} onClick={() => { setShowLink(!showLink); setShowDocuments(false); }}>
          <Link2 size={15}/> Insert link
        </button>
      </div>
      {showLink && (
        <form className="cm-compose-tool-panel" onSubmit={(event) => {
          event.preventDefault();
          if (!safeComposeLink(url)) { setError("Use a valid http:// or https:// link."); return; }
          onMessageChange(insertComposeLink(message, url));
          setUrl(""); setError(""); setShowLink(false);
        }}>
          <label htmlFor="cm-link-url">Web address</label>
          <div className="cm-compose-tool-entry">
            <TextInput id="cm-link-url" type="url" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="https://example.com" />
            <Button type="submit" size="sm" variant="secondary">Insert</Button>
          </div>
          {error && <small role="alert">{error}</small>}
        </form>
      )}
      {showDocuments && (
        <div className="cm-compose-tool-panel">
          <label htmlFor="cm-document-search">Search workspace documents</label>
          <TextInput id="cm-document-search" type="search" placeholder="Find a document to reference" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="cm-compose-document-results">
            {matches.map((doc) => <button type="button" key={doc.id} onClick={() => { onReferencesChange([...references, doc]); setShowDocuments(false); setQuery(""); }}>
              <FileText size={14}/><span>{doc.title}</span><span>Add reference</span>
            </button>)}
            {matches.length === 0 && <span className="cm-compose-tool-muted">No more matching documents.</span>}
          </div>
          <small className="cm-compose-tool-muted">References stay inside Arlovi. No file is uploaded or attached to a provider email.</small>
        </div>
      )}
      {references.length > 0 && (
        <div className="cm-compose-reference-list" aria-label="Referenced documents">
          {references.map((doc) => <span key={doc.id}><FileText size={13}/>{doc.title}<button type="button" aria-label={`Remove ${doc.title}`} onClick={() => onReferencesChange(references.filter((row) => row.id !== doc.id))}><X size={12}/></button></span>)}
        </div>
      )}
    </div>
  );
}
