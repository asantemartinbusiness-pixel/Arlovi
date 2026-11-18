import type { AttentionItem } from "@/platform/attention";

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
  return Boolean(receipt?.snoozedUntil && Date.parse(receipt.snoozedUntil) > now.getTime());
}
