import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Notice, Pill, Row, Select, Stack, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { capabilityById, PROVIDER_CAPABILITIES } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import {
  ACCESS_LABEL, APPROVAL_LEVELS, accessOf, approvalRequired, assignmentHistory, contractChanges, contractFromAgent,
  contractProblems, executionAvailability, normaliseScopeId, requiresReauthorisation,
  type ApprovalLevel, type ContractDraft, type ScopeAccess, type ToolScope,
} from "./contract";
import { commitTogether } from "@/platform/commit";
import "./team-contract.css";

/* ====================================================================== *
 * Contract panels for the AI employee profile (TEAM-003): honest execution
 * availability, an editable contract (approval level, permitted actions,
 * tool scopes) and the assignment history.
 * ====================================================================== */

const connected = (capability: string) => capabilityById(capability)?.state === "verified_external";

export function ExecutionAvailabilityCard({ context, agent, activation }: { context: ScreenContext; agent: Rec; activation: string[] }) {
  const model = capabilityById("model.inference");
  const availability = executionAvailability(agent, model?.state ?? "not_connected", activation);
  return (
    <Card span={12} eyebrow="EXECUTION" prov="unknown" title="Can it run work?"
      subtitle="Configuration is saved and enforced in this workspace. Running work needs a model provider and a trusted server, and neither exists here."
      actions={<Pill tone="warning">Cannot execute</Pill>}>
      <div className="team-avail">
        <div>
          <h3 className="ds-eyebrow">Configured</h3>
          <ul className="team-avail-list" data-tone="ok">
            {availability.configured.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="ds-eyebrow">Why it cannot run</h3>
          <ul className="team-avail-list" data-tone="blocked">
            {availability.blockers.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      </div>
      <Row gap={2} wrap style={{ marginTop: "var(--space-3)" }}>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/team/models`)}>Model routing and providers</Button>
        <Button size="sm" variant="ghost" onClick={() => context.setTab("Permissions")}>Edit the contract</Button>
      </Row>
    </Card>
  );
}

/* ------------------------------ Editor ------------------------------ */

export function ContractEditor({ context, agent, queued }: { context: ScreenContext; agent: Rec; queued: Rec[] }) {
  const saved = useMemo(() => contractFromAgent(agent), [agent]);
  const [draft, setDraft] = useState<ContractDraft>(saved);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [newScope, setNewScope] = useState({ id: "", label: "", access: "read" as ScopeAccess, capability: "" });
  const [scopeError, setScopeError] = useState("");

  // A save elsewhere (another tab, the drawer) replaces the draft with what is stored.
  useEffect(() => { setDraft(contractFromAgent(agent)); }, [agent.id, agent.revision]);

  const problems = contractProblems(draft, connected);
  const changes = contractChanges(saved, draft);
  const reauth = requiresReauthorisation(saved, draft);
  const canEdit = context.can("edit_people");

  const setTool = (index: number, change: Partial<ToolScope>) => setDraft((value) => ({ ...value, tools: value.tools.map((tool, i) => (i === index ? { ...tool, ...change } : tool)) }));
  const setLine = (index: number, text: string) => setDraft((value) => ({ ...value, authority: value.authority.map((line, i) => (i === index ? text : line)) }));

  const addScope = () => {
    const id = normaliseScopeId(newScope.id);
    if (!id || !newScope.label.trim()) { setScopeError("Give the scope an identifier (such as crm.read) and a label."); return; }
    if (draft.tools.some((tool) => normaliseScopeId(tool.id) === id)) { setScopeError(`${id} is already on the contract.`); return; }
    setDraft((value) => ({
      ...value,
      tools: [...value.tools, {
        id, label: newScope.label.trim(), access: newScope.access, granted: false,
        capability: newScope.capability || undefined, requiresApproval: newScope.access === "act" ? true : undefined,
      }],
    }));
    setNewScope({ id: "", label: "", access: "read", capability: "" });
    setScopeError("");
  };

  const save = async () => {
    setShowProblems(true);
    if (problems.length > 0 || changes.length === 0) return;
    setBusy(true);
    try {
      const tools = draft.tools.map((tool) => ({ ...tool, id: normaliseScopeId(tool.id), label: tool.label.trim() }));
      const authority = draft.authority.map((line) => line.trim());
      /* The contract and every queued item it invalidates are one change: a stale revision rolls all of it back. */
      const saved = await commitTogether(context, [
        {
          record: agent,
          patch: { fields: { ...agent.fields, autonomy: draft.approval }, body: { ...(agent.body as object), tools, authority } },
          event: `${agent.title} contract changed by ${context.actor}: ${changes.join("; ")}`,
        },
        ...(reauth ? queued.map((task) => ({
          record: task,
          // fields merge, so naming only the flag cannot revert a newer save of the task.
          patch: { fields: { reauthorisationRequired: true } },
          event: `${task.title} needs re-authorisation after ${agent.title}'s contract changed`,
        })) : []),
      ]);
      if (!saved) return;
      context.toast("Contract saved", reauth && queued.length > 0
        ? `${changes.length} change${changes.length === 1 ? "" : "s"} recorded. ${queued.length} queued item${queued.length === 1 ? "" : "s"} now need re-authorisation before they run.`
        : `${changes.length} change${changes.length === 1 ? "" : "s"} recorded on revision ${agent.revision + 1}.`);
      setShowProblems(false);
    } catch {
      context.toast("Not saved", "The contract could not be written to this browser's storage.", "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={4}>
      {!canEdit && <Notice tone="info">Your role can read this contract but not change it.</Notice>}

      <Card title="Approval level" subtitle="How far it may go before a person signs off">
        <div className="team-levels" role="radiogroup" aria-label="Approval level">
          {APPROVAL_LEVELS.map((level) => (
            <label key={level.value} className="team-level" data-selected={draft.approval === level.value ? "true" : undefined}>
              <input type="radio" name={`approval-${agent.id}`} value={level.value} checked={draft.approval === level.value} disabled={!canEdit}
                onChange={() => setDraft((value) => ({ ...value, approval: level.value as ApprovalLevel }))} />
              <span><strong>{level.label}</strong><span className="ds-subtle">{level.detail}</span></span>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Permitted actions" subtitle={`${draft.authority.length} recorded · what the contract says it may and may not do`}>
        <Stack gap={2}>
          {draft.authority.length === 0 && <span className="ds-subtle">Nothing is permitted yet.</span>}
          {draft.authority.map((line, index) => (
            <Row key={index} gap={2}>
              <TextInput className="ds-grow" aria-label={`Permitted action ${index + 1}`} value={line} disabled={!canEdit} onChange={(event) => setLine(index, event.target.value)} />
              <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} aria-label={`Remove permitted action ${index + 1}`} disabled={!canEdit}
                onClick={() => setDraft((value) => ({ ...value, authority: value.authority.filter((_, i) => i !== index) }))} />
            </Row>
          ))}
          <div>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!canEdit} onClick={() => setDraft((value) => ({ ...value, authority: [...value.authority, ""] }))}>Add a permitted action</Button>
          </div>
        </Stack>
      </Card>

      <Card title="Tool scopes" subtitle={`${draft.tools.filter((tool) => tool.granted).length} of ${draft.tools.length} granted`} flush>
        <div className="team-scopes">
          {draft.tools.length === 0 && <div className="team-scope"><span className="ds-subtle">No tool scope is recorded.</span></div>}
          {draft.tools.map((tool, index) => {
            const blocked = Boolean(tool.capability) && !connected(String(tool.capability));
            return (
              <div key={`${tool.id}-${index}`} className="team-scope">
                <div className="team-scope-main">
                  <Checkbox label={<span><strong>{tool.label || tool.id}</strong> <code className="ds-num ds-subtle">{normaliseScopeId(tool.id)}</code></span>}
                    checked={tool.granted} disabled={!canEdit || (blocked && !tool.granted)}
                    onChange={(event) => setTool(index, { granted: event.target.checked })} />
                  <Row gap={1} wrap>
                    {blocked && <Pill tone="warning">{capabilityById(String(tool.capability))?.label ?? tool.capability}: not connected</Pill>}
                    {approvalRequired(tool) && <Pill tone="info">Each use needs approval</Pill>}
                  </Row>
                </div>
                <Select aria-label={`Access for ${tool.label || tool.id}`} value={accessOf(tool)} disabled={!canEdit}
                  onChange={(event) => setTool(index, { access: event.target.value as ScopeAccess, requiresApproval: event.target.value === "act" ? true : tool.requiresApproval })}>
                  {(Object.keys(ACCESS_LABEL) as ScopeAccess[]).map((access) => <option key={access} value={access}>{ACCESS_LABEL[access]}</option>)}
                </Select>
                <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={14} />} aria-label={`Remove scope ${tool.label || tool.id}`} disabled={!canEdit}
                  onClick={() => setDraft((value) => ({ ...value, tools: value.tools.filter((_, i) => i !== index) }))} />
              </div>
            );
          })}
          {canEdit && (
            <div className="team-scope team-scope-new" role="group" aria-label="Add a tool scope">
              <Field label="Identifier"><TextInput value={newScope.id} placeholder="crm.read" onChange={(event) => setNewScope({ ...newScope, id: event.target.value })} /></Field>
              <Field label="Label"><TextInput value={newScope.label} placeholder="Read customer records" onChange={(event) => setNewScope({ ...newScope, label: event.target.value })} /></Field>
              <Field label="Access">
                <Select value={newScope.access} onChange={(event) => setNewScope({ ...newScope, access: event.target.value as ScopeAccess })}>
                  {(Object.keys(ACCESS_LABEL) as ScopeAccess[]).map((access) => <option key={access} value={access}>{ACCESS_LABEL[access]}</option>)}
                </Select>
              </Field>
              <Field label="Needs provider">
                <Select value={newScope.capability} onChange={(event) => setNewScope({ ...newScope, capability: event.target.value })}>
                  <option value="">None (inside this workspace)</option>
                  {PROVIDER_CAPABILITIES.map((capability) => <option key={capability.id} value={capability.id}>{capability.label}</option>)}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addScope}>Add scope</Button>
              {scopeError && <span className="ds-field-error" role="alert">{scopeError}</span>}
            </div>
          )}
        </div>
      </Card>

      {showProblems && problems.length > 0 && (
        <Notice tone="danger" title="The contract cannot be saved yet">
          <ul className="team-avail-list">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </Notice>
      )}
      {changes.length > 0 && (
        <Notice tone={reauth && queued.length > 0 ? "warning" : "info"} title={`${changes.length} unsaved change${changes.length === 1 ? "" : "s"}`}>
          <ul className="team-avail-list">{changes.map((change) => <li key={change}>{change}</li>)}</ul>
          {reauth && queued.length > 0 && <p style={{ margin: "var(--space-2) 0 0" }}>{queued.length} queued item{queued.length === 1 ? "" : "s"} will need re-authorisation, so nothing runs under a grant that changed.</p>}
        </Notice>
      )}
      <Row gap={2} className="team-savebar">
        <span className="ds-subtle ds-grow">{changes.length === 0 ? `Saved · revision ${agent.revision}` : "Unsaved changes"}</span>
        <Button variant="ghost" disabled={changes.length === 0 || busy} onClick={() => { setDraft(saved); setShowProblems(false); }}>Discard</Button>
        <Button variant="primary" busy={busy} disabled={!canEdit || changes.length === 0} onClick={() => void save()}>Save contract</Button>
      </Row>
    </Stack>
  );
}

/* ------------------------- Assignment history ------------------------- */

export function AssignmentHistory({ context, agent, data }: { context: ScreenContext; agent: Rec; data: Record<string, Rec[]> }) {
  const rows = assignmentHistory(agent, {
    assignments: data.agentWorkAssignments ?? [], requests: data.agentExecutionRequests ?? [],
    missionTasks: data.missionTasks ?? [], tasks: data.tasks ?? [],
  });
  return (
    <Card title="Assignment history" subtitle={`${rows.length} recorded · none executed by a model`} flush>
      {rows.length === 0 ? (
        <div style={{ padding: "var(--space-4)" }}><Empty title={`No assignment is recorded for ${agent.title}`}>Assign work from a project task or a mission plan; it is recorded here as awaiting a provider.</Empty></div>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Assignment history"
          columns={[
            { key: "title", header: "Work", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.kind} ${row.state}` },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone="neutral">{row.kind}</Pill> },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.state === "cancelled" || row.state === "dismissed" ? "neutral" : row.state === "blocked" ? "danger" : "info"}>{row.state.replace(/_/g, " ")}</Pill> },
            { key: "detail", header: "What happened", cell: (row) => row.detail, hideBelow: 900 },
            { key: "at", header: "Recorded", align: "end", cell: (row) => context.date(row.at), sortValue: (row) => row.at },
          ]}
          onOpen={(id) => {
            const row = rows.find((item) => item.id === id);
            if (row?.link?.kind === "mission") context.navigate(`/o/${context.org.slug}/mission/missions/${row.link.id}`);
          }}
        />
      )}
    </Card>
  );
}
