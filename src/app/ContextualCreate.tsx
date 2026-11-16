import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { routeForRecord } from "@/platform/attention";
import { useMutations, useToast, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./contextual-create.css";

export type CreationKind = "task" | "project" | "document";
export type CreationScope = { type: "department" | "project"; id: string; title: string } | null;
const kinds: { id: CreationKind; label: string; collection: string }[] = [
  { id: "task", label: "Task", collection: "tasks" },
  { id: "project", label: "Project", collection: "projects" },
  { id: "document", label: "Document", collection: "documents" },
];

/**
 * One creation contract for headquarters and nested workspaces. The scope is
 * explicit and recorded on the created object; it is never inferred from a
 * misleading text label. Backend tenant enforcement remains a separate task.
 */
export function ContextualCreate({
  scope = null, label = "Create", onCreated,
}: {
  scope?: CreationScope; label?: string; onCreated?: (record: Rec) => void;
}) {
  const { org, actor } = useWorkspace();
  const mutate = useMutations("workspace-contextual-create");
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CreationKind>("task");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !busy) setOpen(false);
  }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, busy]);

  function dismiss() {
    if (busy) return;
    setOpen(false);
    setError("");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    const definition = kinds.find(item => item.id === kind)!;
    try {
      const scopeFields = scope?.type === "department" ? { departmentId: scope.id } :
        scope?.type === "project" ? { projectId: scope.id } : {};
      const record = await mutate.create({
        collection: definition.collection,
        title: name.trim(),
        status: kind === "task" ? "backlog" : kind === "project" ? "planning" : "draft",
        summary: description.trim(),
        ...(scope?.type === "project" && kind !== "project" ? { parentId: scope.id } : {}),
        fields: {
          ...scopeFields,
          source: "workspace",
          ...(kind === "task" ? { stage: "backlog", assignee: actor, priority: "normal", kind: "task" } : {}),
          ...(kind === "project" ? { health: "on_track", priority: "normal" } : {}),
        },
        ...(kind === "document" ? { body: { type: "doc", content: [] } } : {}),
      }, `${definition.label} created${scope ? ` in ${scope.title}` : ""}: ${name.trim()}`);
      setOpen(false); setName(""); setDescription("");
      toast(definition.label + " created", scope ? `Linked to ${scope.title}.` : `Created in ${org.name}.`);
      onCreated?.(record);
      // Project creation opens its new, real work space. Tasks and documents
      // remain in context so the new row can appear without losing position.
      if (kind === "project") navigate(`/o/${org.slug}/workspace/work/project/${record.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save. Please try again.");
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="ws-create-trigger" onClick={() => { setOpen(true); setError(""); }}><Plus size={16} aria-hidden="true"/>{label}</button>
    {open && <div className="ws-create-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="ws-create-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-create-title">
        <div className="ws-create-heading"><div><span className="ws-create-eyebrow">{scope ? `IN ${scope.title}` : org.name.toUpperCase()}</span><h2 id="ws-create-title">Create new work</h2></div><button type="button" aria-label="Close creation dialog" className="ws-create-close" onClick={dismiss} disabled={busy}><X size={18}/></button></div>
        <form onSubmit={event => { void create(event); }}>
          <fieldset className="ws-create-types"><legend>What would you like to create?</legend>{kinds.filter(item => !(scope?.type === "project" && item.id === "project")).map(item => <label key={item.id}><input type="radio" name="creation-kind" checked={kind === item.id} onChange={() => setKind(item.id)} />{item.label}</label>)}</fieldset>
          <label className="ws-create-field"><span>Name</span><input autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder={kind === "task" ? "What needs to be done?" : kind === "project" ? "Project name" : "Document title"}/></label>
          <label className="ws-create-field"><span>Description <small>(optional)</small></span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="Add context for the team" /></label>
          <p className="ws-create-scope">{scope ? `Automatically linked to ${scope.title}.` : `Saved in ${org.name}.`} You can manage it from the relevant native application.</p>
          {error && <p role="alert" className="ws-create-error">{error}</p>}
          <div className="ws-create-actions"><button type="button" onClick={dismiss} disabled={busy}>Cancel</button><button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create " + kinds.find(item=>item.id===kind)?.label.toLowerCase()}</button></div>
        </form>
      </div>
    </div>}
  </>;
}
