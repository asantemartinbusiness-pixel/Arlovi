import { useSyncExternalStore } from "react";
import { Button, Empty, Pill, Row, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import type { Rec } from "@/domain/types";

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
  const version = String(policy.fields.version ?? "1.0");
  const { listChildren } = await import("@/platform/repo");
  const existing = (await listChildren(context.org.id, policy.id)).filter((row) => row.collection === "acknowledgements" && row.fields.person === context.actor && String(row.fields.version) === version);
  if (existing.length > 0) { context.toast("Already acknowledged", `${context.actor} acknowledged v${version} ${context.relative(existing[0].createdAt)}.`, "info"); return; }
  await context.mutate.create({ collection: "acknowledgements", title: `${policy.title} v${version} · ${context.actor}`, status: "acknowledged", summary: `Acknowledged by ${context.actor}.`, parentId: policy.id, fields: { policyId: policy.id, person: context.actor, version } }, `${context.actor} acknowledged ${policy.title} v${version}`);
  await context.mutate.patch(policy.id, { fields: { ...policy.fields, acknowledged: Number(policy.fields.acknowledged ?? 0) + 1 } }, { expectRevision: policy.revision, event: `Acknowledgement count for ${policy.title} v${version} increased` });
  context.toast("Policy acknowledged", `${policy.title} v${version} is recorded against ${context.actor}.`);
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
