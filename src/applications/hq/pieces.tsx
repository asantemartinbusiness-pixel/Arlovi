import { Empty, FactGrid, Notice, OverlaySummary, Pill, Stack } from "@/design-system";
import { useCollections } from "@/platform/workspace";
import type { ScreenContext } from "@/platform/registry";

/** Impact of changing a department: what would move, and what blocks removal. */
export function Building({ departmentId, context }: { departmentId?: string; context: ScreenContext }) {
  const data = useCollections(["departments", "members", "tasks", "documents"]);
  const dept = data.departments.find((item) => item.id === departmentId) ?? data.departments[0];
  if (!dept) return <Empty title="No department selected" />;
  const members = data.members.filter((member) => member.fields.departmentId === dept.id);
  const work = data.tasks.filter((task) => members.some((member) => member.title === String(task.fields.assignee ?? task.ownerName)) && task.status !== "done");
  const blocked = members.length > 0 || work.length > 0;
  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Department"
        title={dept.title}
        status={blocked ? <Pill tone="warning" dot>Cannot be removed</Pill> : <Pill tone="success" dot>Safe to change</Pill>}
        meta={[`Lead ${String(dept.fields.lead ?? "unassigned")}`]}
      />
      <FactGrid columns={3} items={[
        { label: "Members", value: String(members.length), mono: true },
        { label: "Open work", value: String(work.length), mono: true, tone: work.length ? "warning" : undefined },
        { label: "Lead", value: String(dept.fields.lead ?? "Unassigned") },
      ]} />
      {blocked ? (
        <Notice tone="warning" title="This department cannot be removed yet">
          {members.length} {members.length === 1 ? "member reports" : "members report"} into it and {work.length} {work.length === 1 ? "item is" : "items are"} still open.
          Reassign them first so no record is left without an owner in {context.org.shortName}.
        </Notice>
      ) : (
        <Notice tone="success" title="Safe to change">Nothing is assigned to this department.</Notice>
      )}
    </Stack>
  );
}
