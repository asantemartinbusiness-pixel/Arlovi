import { UserMinus } from "lucide-react";
import { Button, Card, Notice, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { clockIso } from "@/platform/clock";
import { pendingAdminHandoffs } from "@/applications/hr/offboarding";

/* ====================================================================== *
 * Leavers handed over from People. A recorded departure opens an
 * "Admin access" step; it is closed here, when the member is suspended and
 * their sessions and keys revoked, or when Administration confirms there is
 * no member to suspend.
 * ====================================================================== */

export function useLeaverHandoffs(): Rec[] {
  return pendingAdminHandoffs(useCollections(["tasks"]).tasks);
}

/** Close every pending handoff for these member names, after a suspension. */
export async function completeHandoffs(context: ScreenContext, handoffs: Rec[], names: string[], note: string): Promise<number> {
  const matching = handoffs.filter((task) => names.includes(String(task.fields.employeeName ?? "")));
  for (const task of matching) {
    await context.mutate.patch(task.id, {
      status: "done",
      fields: { ...task.fields, stage: "done", completedBy: context.actor, completedAt: clockIso(), outcome: note },
    }, { expectRevision: task.revision, event: `Leaver access step for ${String(task.fields.employeeName)} completed in Administration by ${context.actor}: ${note}` });
  }
  return matching.length;
}

export function LeaverHandoffs({ context, members, sessions }: { context: ScreenContext; members: Rec[]; sessions: Rec[] }) {
  const handoffs = useLeaverHandoffs();
  if (handoffs.length === 0) return null;
  return (
    <Card eyebrow="FROM PEOPLE" prov="human" title={`${handoffs.length} ${handoffs.length === 1 ? "leaver needs" : "leavers need"} workspace access removed`}
      subtitle="People recorded these departures. Suspending the member here closes the leaver step on their record.">
      <Stack gap={3}>
        {handoffs.map((task) => {
          const name = String(task.fields.employeeName ?? "");
          const member = members.find((row) => row.id === task.fields.memberId) ?? members.find((row) => row.title === name);
          const active = sessions.filter((session) => String(session.fields.member) === name && session.status === "active").length;
          return (
            <div key={task.id} className="ds-panel" style={{ padding: "var(--space-3)" }} role="group" aria-label={`Leaver ${name}`}>
              <Row gap={2} wrap>
                <UserMinus size={16} aria-hidden="true" />
                <strong className="ds-grow">{name}</strong>
                {member
                  ? <Pill tone={member.status === "suspended" ? "neutral" : "warning"} dot>{member.status === "suspended" ? "Already suspended" : `Member ${member.status}`}</Pill>
                  : <Pill tone="neutral">No member record</Pill>}
                <span className="ds-subtle">Departure recorded {context.relative(task.createdAt)} by {task.createdBy}</span>
              </Row>
              <p className="ds-subtle" style={{ marginBlock: "var(--space-2)" }}>
                {member
                  ? `${active} active ${active === 1 ? "session" : "sessions"} recorded. Suspending revokes them and any keys ${name} created.`
                  : "No workspace member carries this name, so there is nothing to suspend here."}
              </p>
              <Row gap={2} wrap>
                {member && member.status !== "suspended" ? (
                  <Button size="sm" variant="danger" onClick={() => { context.select(member.id); context.openOverlay("revoke confirmation", { ids: [member.id] }); }}>
                    Review and suspend {name}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={async () => {
                    const closed = await completeHandoffs(context, [task], [name], member ? "member was already suspended" : "no workspace member to suspend");
                    if (closed) context.toast("Leaver step closed", `${name}'s workspace access step is done on their People record.`);
                  }}>
                    Confirm and close the step
                  </Button>
                )}
              </Row>
            </div>
          );
        })}
        <Notice tone="info">Suspending a member does not close their email, payroll or building access outside Arlovi.</Notice>
      </Stack>
    </Card>
  );
}
