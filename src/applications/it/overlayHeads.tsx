import { OverlaySummary, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import { SEVERITY_TONE, STAGE_LABELS, incidentClock, stageOf } from "./register";

/**
 * Overlay head for anything about one incident: the title, its severity and
 * stage, and the elapsed clock. The incident is the payload id, else the
 * selection, else the route.
 */
export function IncidentSummary({ context, eyebrow }: { context: ScreenContext; eyebrow?: string }) {
  const incidents = useCollection("incidents");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const id = payload?.id ?? context.selectedId ?? context.params.id;
  const record = incidents.find((row) => row.id === id);
  if (!record) return null;
  const severity = String(record.fields.severity ?? "medium");
  const clock = incidentClock(record, context.now);
  return (
    <OverlaySummary
      eyebrow={eyebrow ?? "Incident"}
      title={record.title}
      status={<>
        <Pill tone={SEVERITY_TONE[severity] ?? "warning"} dot>{severity}</Pill>
        <Pill tone={record.status === "resolved" || record.status === "closed" ? "success" : "info"}>{STAGE_LABELS[stageOf(record)]}</Pill>
      </>}
      meta={[
        `${clock.stopped ? "Open for" : "Open"} ${clock.label}${clock.stopped ? "" : " so far"}`,
        `Owner ${String(record.fields.owner ?? record.ownerName ?? "none")}`,
        String(record.fields.service ?? "Workspace"),
      ]}
    />
  );
}

export const incidentSummary = (eyebrow?: string) =>
  ({ close: _close, ...context }: ScreenContext & { close: () => void }) => <IncidentSummary context={context} eyebrow={eyebrow} />;
