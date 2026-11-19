import { Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { knownRecord } from "@/platform/repo";
import { scopedDetailRecord } from "@/platform/recordScope";
import { useChildren } from "@/platform/workspace";
import { STRUCTURAL, readForm } from "./model";

function ResponseCount({ id }: { id: string }) {
  const rows = useChildren(id);
  const fresh = rows.filter((row) => row.status === "new").length;
  return <>{rows.length} {rows.length === 1 ? "response" : "responses"}{fresh ? ` · ${fresh} new` : ""}</>;
}

/**
 * The form is the page head on every per-form screen: its name, whether it is
 * live, the version a response will be recorded against and where the answers
 * go (this workspace only; no mail provider is connected).
 */
export function formRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const record = scopedDetailRecord(knownRecord(context.params.id), context.org.id, "forms");
  if (!record) return null;
  const model = readForm(record);
  const questions = model.fields.filter((field) => !STRUCTURAL.includes(field.type)).length;
  return {
    title: record.title,
    status: (
      <>
        <Pill tone={record.status === "live" ? "success" : "neutral"} dot>{record.status}</Pill>
        <Pill tone="info">Version {model.settings.version}</Pill>
      </>
    ),
    meta: [
      `${questions} ${questions === 1 ? "question" : "questions"}`,
      <ResponseCount key="n" id={record.id} />,
      model.settings.notifyEnabled ? "Notification wanted, not sendable" : "Answers stay in this workspace",
    ],
  };
}
