import type { Role } from "@/domain/types";
import type { AttentionItem } from "@/platform/attention";
import { isSnoozed } from "@/platform/notificationPolicy";
import { clockNow } from "@/platform/clock";

/** Browser-local personal receipts; never a business approval or source resolution. */
export interface AttentionReceipt {
  read?: boolean;
  acknowledged?: boolean;
  snoozedUntil?: string;
}

/** An actor-scoped key prevents one employee's dismissal affecting another in this browser.
 * Actor is optional to retain compatibility with earlier saved role-level receipts and tests.
 * Production multi-device sync requires authenticated server-backed identities.
 */
export function attentionReceiptKey(orgId: string, role: Role, itemId: string, actor?: string): string {
  return actor
    ? `${orgId}:${encodeURIComponent(actor)}:${role}:${itemId}`
    : `${orgId}:${role}:${itemId}`;
}

export type PresentedAttentionItem = AttentionItem & { snoozedUntil?: string; snoozed?: boolean };

export function applyAttentionReceipts<T extends AttentionItem>(
  items: T[],
  receipts: Record<string, AttentionReceipt>,
  orgId: string,
  role: Role,
  actor?: string,
  now = clockNow(),
): (T & PresentedAttentionItem)[] {
  return items.map((item) => {
    const receipt = receipts[attentionReceiptKey(orgId, role, item.id, actor)];
    if (!receipt) return item;
    return {
      ...item,
      read: receipt.read ?? item.read,
      acknowledged: receipt.acknowledged ?? item.acknowledged,
      snoozedUntil: receipt.snoozedUntil,
      snoozed: isSnoozed(receipt.snoozedUntil, now),
    };
  });
}
