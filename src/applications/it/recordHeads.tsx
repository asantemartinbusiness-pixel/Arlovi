import { Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { knownRecord } from "@/platform/repo";
import { scopedDetailRecord } from "@/platform/recordScope";
import { SEVERITY_TONE, STAGE_LABELS, incidentClock, stageOf } from "./register";

/**
 * The incident is the page head: its title, severity, where it is in the
 * lifecycle and the elapsed clock (opened to now, or to resolution). Owner,
 * service and origin sit beside the clock because they decide who acts next.
 */
export function incidentRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const record = scopedDetailRecord(knownRecord(context.params.id), context.org.id, "incidents");
  if (!record) return null;
  const f = record.fields;
  const severity = String(f.severity ?? "medium");
  const clock = incidentClock(record, context.now);
  const owner = String(f.owner ?? record.ownerName ?? "");
  const connector = String(f.connectorName ?? "");
  const service = String(f.service ?? (connector ? "Connectors" : "Workspace"));
  return {
    title: record.title,
    subtitle: record.summary || undefined,
    status: (
      <>
        <Pill tone={SEVERITY_TONE[severity] ?? "warning"} dot>{severity}</Pill>
        <Pill tone={record.status === "resolved" || record.status === "closed" ? "success" : "info"}>{STAGE_LABELS[stageOf(record)]}</Pill>
      </>
    ),
    meta: [
      <span key="clock" className="ds-num">{clock.stopped ? "Open for" : "Open"} {clock.label}{clock.stopped ? "" : " so far"}</span>,
      owner ? `Owner ${owner}` : "No owner yet",
      connector ? `${service} · ${connector}` : service,
      String(f.origin ?? "ours") === "provider" ? "Provider-side incident" : "Our infrastructure",
    ],
  };
}
