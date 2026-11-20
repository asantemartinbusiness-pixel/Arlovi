import { Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { knownRecord } from "@/platform/repo";
import { scopedDetailRecord } from "@/platform/recordScope";
import { CAPABILITY_LABELS, CAPABILITY_TONE } from "@/platform/capability";
import { entryById, entryForRecord } from "./catalog";
import { ConnectionStatePill, capabilityIdOf } from "./mappingPanel";
import { connectionState } from "./mapping";

/**
 * The provider is the page head: its name, whether the connection is real
 * (the capability state, never a local claim) and what consent exists.
 * Nothing here can say "connected" unless the capability register does.
 */
export function connectorRecordHeader(context: ScreenContext, kind: "connector" | "authorise" | "connection"): RecordHeaderProps | null {
  const id = context.params.id;
  const record = scopedDetailRecord(knownRecord(id), context.org.id, "connectors");
  const entry = record ? entryForRecord(record.fields) : entryById(id ?? "");
  if (!entry) return null;
  const readScopes = entry.scopes.filter((scope) => scope.kind === "read").length;
  const writeScopes = entry.scopes.length - readScopes;
  return {
    title: record?.title && kind !== "authorise" ? record.title : entry.capability.label,
    subtitle: `${entry.capability.provider} · ${entry.category}`,
    status: (
      <>
        <Pill tone={CAPABILITY_TONE[entry.capability.state]} dot>{CAPABILITY_LABELS[entry.capability.state]}</Pill>
        {record && kind === "connection" && (
          <ConnectionStatePill state={connectionState(record, entry.capability.state, capabilityIdOf(record, entry.capability.id))} />
        )}
      </>
    ),
    meta: [
      `Consent: none given · 0 of ${entry.scopes.length} scopes granted`,
      `${readScopes} read · ${writeScopes} write`,
      kind === "connection" && record?.ownerName ? `Owner ${record.ownerName}` : null,
      entry.version,
    ],
  };
}
