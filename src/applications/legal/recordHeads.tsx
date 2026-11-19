import { Pill } from "@/design-system";
import type { RecordHeaderProps } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { knownRecord } from "@/platform/repo";
import { STATUS_TONE, lifecycleLabel } from "./panels";

/**
 * The contract is the page head: its title, who it is with, its lifecycle
 * state, and the facts a lawyer reads first (term, notice, value, execution).
 */
export function contractRecordHeader(context: ScreenContext): RecordHeaderProps | null {
  const contract = knownRecord(context.params.id);
  if (!contract || contract.organizationId !== context.org.id || contract.collection !== "contracts") return null;
  const f = contract.fields;
  const notice = Number(f.noticeDays ?? 0);
  return {
    title: contract.title,
    subtitle: [f.counterparty, f.type].filter(Boolean).map(String).join(" · ") || undefined,
    status: <Pill tone={STATUS_TONE[contract.status] ?? "neutral"} dot>{lifecycleLabel(contract.status)}</Pill>,
    meta: [
      `Owner ${String(f.owner ?? contract.ownerName)}`,
      contract.startAt || contract.endAt ? `${context.date(contract.startAt)} – ${context.date(contract.endAt)}` : null,
      notice > 0 ? `${notice} days notice` : null,
      contract.amountMinor ? context.money(contract.amountMinor) : null,
      f.signedAt ? `Signed ${context.date(String(f.signedAt))}` : "Not signed",
    ],
  };
}
