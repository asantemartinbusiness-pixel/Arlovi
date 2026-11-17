import { useSyncExternalStore } from "react";
import { Button, Empty, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { listChildren, newRecord } from "@/platform/repo";
import { clockIso } from "@/platform/clock";

/* Pieces of the People actions that the panels also render. Kept apart so
   panels.tsx and actions.tsx do not import each other. */

let directoryTeam = "";
const listeners = new Set<() => void>();
export function setDirectoryTeam(id: string): void {
  directoryTeam = id;
  listeners.forEach((listener) => listener());
}
export function useDirectoryTeam(): string {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => directoryTeam);
}

/** One acknowledgement per person per version; earlier versions' acknowledgements are kept. */
export async function recordAcknowledgement(context: ScreenContext, policy: Rec): Promise<void> {
  if (policy.organizationId !== context.org.id || policy.collection !== "policies"
      || policy.fields.kind !== "hr" || !context.actor.trim()) {
    context.toast("Acknowledgement unavailable", "Choose a valid HR policy and a named company user.", "blocked");
    return;
  }
  const version = String(policy.fields.version ?? "1.0");
  try {
    const linked = (await listChildren(context.org.id, policy.id)).filter((row) =>
      row.collection === "acknowledgements" && String(row.fields.version) === version);
    const prior = linked.find((row) => row.fields.person === context.actor);
    if (prior) {
      context.toast("Already acknowledged",
        `${context.actor} acknowledged v${version} ${context.relative(prior.createdAt)}.`, "info");
      return;
    }
    const now = clockIso();
    const acknowledgement = newRecord({
      organizationId: context.org.id, currency: context.org.currency,
      collection: "acknowledgements",
      title: `${policy.title} v${version} · ${context.actor}`,
      status: "acknowledged", summary: `Policy acknowledgement by ${context.actor}`,
      parentId: policy.id,
      fields: { policyId: policy.id, person: context.actor, version },
    }, { actor: context.actor, now });
    const unique = new Set(linked.map((row) => String(row.fields.person || "").trim()).filter(Boolean));
    unique.add(context.actor);
    const revised: Rec = {
      ...policy,
      revision: policy.revision + 1, updatedAt: now, updatedBy: context.actor,
      fields: { ...policy.fields, acknowledged: unique.size },
      history: [{
        title: policy.title, status: policy.status, summary: policy.summary,
        fields: { ...policy.fields }, body: policy.body, amountMinor: policy.amountMinor, at: now,
      }, ...policy.history].slice(0, 25),
    };
    await context.mutate.putMany(
      [acknowledgement, revised],
      [`${context.actor} acknowledged ${policy.title} v${version}`,
       `Policy ${policy.title} v${version} acknowledgement count reconciled to ${unique.size}`],
      { [policy.id]: policy.revision }, ["create", "update"],
    );
    context.toast("Policy acknowledged",
      `${policy.title} v${version} was recorded for ${context.actor}; the count and linked acknowledgement saved together.`);
  } catch (reason) {
    context.toast("Acknowledgement not saved", reason instanceof Error
      ? reason.message : "The policy changed. Reload before acknowledging it.", "blocked");
  }
}

/** My learning: only what is actually assigned to or completed by this person. */
export function MyLearning({ context }: { context: ScreenContext }) {
  const data = useCollections(["learningRecords", "courses"]);
  const mine = data.learningRecords.filter((row) => row.fields.person === context.actor);
  if (mine.length === 0) {
    return <Empty title={`Nothing is assigned to ${context.actor}`}>Assigned courses appear here with their due date. Progress is never estimated.</Empty>;
  }
  return (
    <Stack gap={3}>
      {mine.map((row) => {
        const course = data.courses.find((item) => item.id === row.fields.courseId);
        return (
          <div key={row.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}>
              <strong className="ds-grow">{course?.title ?? row.title}</strong>
              <Pill tone={row.status === "complete" ? "success" : "info"}>{row.status === "complete" ? "Complete" : "Assigned"}</Pill>
            </Row>
            <p className="ds-subtle">{row.status === "complete" ? `Completed ${context.relative(String(row.fields.completedAt ?? row.updatedAt))}` : row.dueAt ? `Due ${context.date(row.dueAt)}` : "No due date"} · assigned by {String(row.fields.assignedBy ?? "")}</p>
            {row.status !== "complete" && course && <Button size="sm" variant="ghost" onClick={() => context.openOverlay("quiz", { id: course.id })}>Check what was understood</Button>}
          </div>
        );
      })}
    </Stack>
  );
}
