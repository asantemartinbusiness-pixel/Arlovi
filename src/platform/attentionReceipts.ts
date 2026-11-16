import type { Role } from "@/domain/types";
import type { AttentionItem } from "@/platform/attention";

/** A local view receipt is not an approval and does not resolve the source. */
export interface AttentionReceipt {
  read?: boolean;
  acknowledged?: boolean;
}

export function attentionReceiptKey(orgId: string, role: Role, itemId: string): string {
  return `${orgId}:${role}:${itemId}`;
}

export function applyAttentionReceipts(
  items: AttentionItem[],
  receipts: Record<string, AttentionReceipt>,
  orgId: string,
  role: Role,
): AttentionItem[] {
  return items.map((item) => {
    const receipt = receipts[attentionReceiptKey(orgId, role, item.id)];
    return receipt
      ? { ...item, read: item.read || receipt.read === true, acknowledged: item.acknowledged || receipt.acknowledged === true }
      : item;
  });
}
