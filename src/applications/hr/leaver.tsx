import { ClipboardCheck } from "lucide-react";
import { Button, Card, Checkbox, Empty, Meter, Notice, Pill, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { clockIso } from "@/platform/clock";
import { ADMIN_GROUP, leaverProgress, leaverTasks } from "./offboarding";

/**
 * The leaver checklist on an employee's Access lens. People, Finance and the
 * manager tick their own steps; the workspace-access step is completed only
 * from Administration, so it shows its state and a way there instead of a box
 * anyone could tick.
 */
export function LeaverChecklist({ context, employee, tasks }: { context: ScreenContext; employee: Rec; tasks: Rec[] }) {
  const steps = leaverTasks(tasks, employee.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const progress = leaverProgress(steps);
  const canEdit = context.can("edit_people");
  if (steps.length === 0) {
    return employee.status === "alumni" ? (
      <Empty title="No leaver checklist" icon={<ClipboardCheck size={20} />}>
        This departure was recorded before leaver checklists existed. Check equipment, final pay and workspace access by hand.
      </Empty>
    ) : null;
  }
  return (
    <Card eyebrow="LEAVER CHECKLIST" prov="human" title={`${progress.done} of ${progress.total} steps done`}
      subtitle={progress.waitingOnAdmin ? "Waiting on Administration to suspend workspace access" : progress.done === progress.total ? "Every recorded step is done" : "In progress"}
      actions={<Pill tone={progress.done === progress.total ? "success" : progress.waitingOnAdmin ? "warning" : "info"} dot>{progress.done === progress.total ? "Complete" : "Open"}</Pill>}>
      <Stack gap={3}>
        <Meter value={progress.done} max={progress.total} label={`Leaver checklist for ${employee.title}`} />
        <div className="hr-onboarding-step-list">
          {steps.map((step) => {
            const admin = step.fields.group === ADMIN_GROUP;
            return (
              <div key={step.id} className="hr-onboarding-step">
                <Checkbox
                  label={step.title}
                  checked={step.status === "done"}
                  disabled={!canEdit || admin}
                  onChange={async (event) => {
                    if (!canEdit || admin) return;
                    const next = event.target.checked ? "done" : "ready";
                    await context.mutate.patch(step.id, {
                      status: next, fields: { ...step.fields, stage: next, completedBy: context.actor, completedAt: clockIso() },
                    }, { expectRevision: step.revision, event: `Leaver step “${step.title}” for ${employee.title} ${next === "done" ? "completed" : "reopened"} by ${context.actor}` });
                  }}
                />
                <div className="hr-onboarding-step-meta">
                  <Pill tone={step.status === "done" ? "success" : admin ? "warning" : "neutral"}>
                    {step.status === "done" ? "Done" : admin ? "In Administration" : "Ready"}
                  </Pill>
                  <span>{String(step.fields.group)} · {String(step.status === "done" && step.fields.completedBy ? `done by ${String(step.fields.completedBy)}` : step.fields.assignee ?? "Unassigned")}</span>
                </div>
                <p className="ds-subtle hr-leaver-detail">{step.summary.replace(/^.*? leaver step for .*?\. /, "")}</p>
                {admin && step.status !== "done" && (
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/admin/members?tab=Members`)}>
                    Open Members in Administration
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <Notice tone="info" title="Suspending here is not revoking elsewhere">
          Administration suspends the workspace member and revokes its sessions and keys in this workspace. Email, payroll, building
          and identity-provider accounts outside Arlovi still need to be closed by the people who run them.
        </Notice>
      </Stack>
    </Card>
  );
}
