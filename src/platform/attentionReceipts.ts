import type { AttentionItem } from "@/platform/attention";
import type { Rec } from "@/domain/types";

/** Local personal state. Does not resolve, approve or mutate the underlying business event. */
export interface AttentionReceipt {
  read?: boolean;
  acknowledged?: boolean;
  snoozedUntil?: string;
}

export function attentionReceiptKey(orgId: string, actor: string, itemId: string): string {
  return JSON.stringify([orgId, actor.trim().toLowerCase(), itemId]);
}

/** Intentionally no fallback to legacy role-scoped receipts: a role is shared by many users. */
export function applyAttentionReceipts(
  items: AttentionItem[],
  receipts: Record<string, AttentionReceipt>,
  orgId: string,
  actor: string,
): AttentionItem[] {
  return items.map((item) => {
    const receipt = receipts[attentionReceiptKey(orgId, actor, item.id)];
    return receipt
      ? {
          ...item,
          read: item.read || receipt.read === true,
          acknowledged: item.acknowledged || receipt.acknowledged === true,
        }
      : item;
  });
}

export function attentionSnoozed(
  item: Pick<AttentionItem, "id" | "priority" | "kind">,
  receipts: Record<string, AttentionReceipt>,
  orgId: string,
  actor: string,
  now: Date,
): boolean {
  if (item.priority === "P0" && item.kind === "system") return false;
  const receipt = receipts[attentionReceiptKey(orgId, actor, item.id)];
  const local = receipt?.snoozedUntil;
  const itemSnooze = "snoozedUntil" in item && typeof item.snoozedUntil === "string" ? item.snoozedUntil : undefined;
  return Boolean((local && Date.parse(local) > now.getTime()) || (itemSnooze && Date.parse(itemSnooze) > now.getTime()));
}

/** Keep the global bell aligned with locally triaged items from the full Inbox. */
export function applyInboxAttentionState(items: AttentionItem[], stateRecords: Rec[]): AttentionItem[] {
  const states = new Map(stateRecords.map((row) => [String(row.fields.itemId ?? ""), row]));
  return items.map((item) => {
    const row = states.get(item.id);
    if (!row) return item;
    return {
      ...item,
      read: item.read || row.fields.read === true,
      acknowledged: item.acknowledged || row.fields.acknowledged === true,
      resolved: item.resolved || row.fields.resolved === true,
      snoozedUntil: typeof row.fields.snoozedUntil === "string" ? row.fields.snoozedUntil : undefined,
    };
  });
}
