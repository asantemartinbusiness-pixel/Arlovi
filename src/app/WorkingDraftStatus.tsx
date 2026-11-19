import { useEffect } from "react";
import { FilePenLine } from "lucide-react";
import { useAllWorkingDraftCount, useWorkingDraftCount, useWorkingDraftPresence } from "@/platform/workingDrafts";
import "./working-draft-status.css";

export function WorkingDraftStatus({ scope }: { scope: string }) {
  const present = useWorkingDraftPresence(scope);
  return <div className="arl-draft-status" data-state={present ? "temporary" : "empty"}
    role="status" aria-live="polite" aria-atomic="true">
    <FilePenLine size={15} aria-hidden="true"/>
    <span className="arl-draft-status__label">{present ? "Working draft" : "No temporary draft"}</span>
    <span className="arl-draft-status__detail">{present
      ? "Kept in this tab only · not saved to the record"
      : "New edits will stay in this tab until saved or discarded"}</span>
  </div>;
}
export function TemporaryDraftCounter({ orgId, actor }: { orgId: string; actor: string }) {
  const count = useWorkingDraftCount(orgId, actor);
  // This covers drafts from any company in the current tab, because switching
  // companies should not make the browser reload/close warning disappear.
  const total = useAllWorkingDraftCount();
  useEffect(() => {
    if (!total) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [total]);
  if (!count) return null;
  return <span className="arl-draft-counter" role="status"
    aria-label={`${count} temporary ${count === 1 ? "draft" : "drafts"} kept in this tab, not saved`}
    title="Reopen the editor to resume. Reloading may erase temporary drafts.">
    <FilePenLine size={14} aria-hidden="true"/>
    <span>{count} {count === 1 ? "draft" : "drafts"}</span>
    <span className="arl-draft-counter__qualifier">tab only</span>
  </span>;
}
