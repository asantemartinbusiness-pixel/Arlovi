import type { Role, Rec } from "@/domain/types";
import type { Mutations } from "@/platform/workspace";
import type { AttentionKind, Priority } from "@/platform/attention";
import { NATIVE_APP_NOTIFICATION_SOURCES } from "./notificationPolicy";

const REGISTERED = new Set<string>(Object.values(NATIVE_APP_NOTIFICATION_SOURCES).flat());

/**
 * One integration contract for all native applications.
 * This publishes an in-app browser-local record ONLY. It does not deliver email, push or SMS,
 * and it is not a substitute for a server-side authorisation or event-outbox service.
 */
export interface WorkspaceNotificationInput {
  sourceApp: string;
  sourceId: string;
  category: string;
  kind: AttentionKind;
  priority: Priority;
  title: string;
  summary: string;
  group: string;
  route?: string;
  entityId?: string;
  audience: Role[];
  dedupeKey: string;
}
export type PublishResult = { created: boolean; id?: string; reason?: string };

export function prepareNotificationEvent(input: WorkspaceNotificationInput, orgSlug: string) {
  if (!REGISTERED.has(input.sourceApp)) throw new Error("Unregistered native application source.");
  if (!input.sourceId.trim() || !input.title.trim() || !input.dedupeKey.trim()) throw new Error("Missing notification identity.");
  if (input.route && !input.route.startsWith(`/o/${encodeURIComponent(orgSlug)}/`)
    && !input.route.startsWith(`/o/${orgSlug}/`)) {
    throw new Error("Notification routes must remain inside the active organisation.");
  }
  const highestAllowed = input.category === "security" ? input.priority : input.priority === "P0" ? "P1" : input.priority;
  return {
    collection: "notifications" as const,
    title: input.title,
    summary: input.summary,
    status: "open",
    fields: {
      kind: input.kind,
      priority: highestAllowed,
      source: input.sourceApp,
      sourceId: input.sourceId,
      category: input.category,
      group: input.group,
      route: input.route ?? "",
      entityId: input.entityId ?? "",
      audience: input.audience.join(","),
      dedupeKey: input.dedupeKey,
      read: false,
      acknowledged: false,
      resolved: false,
      deliveryState: "in_app_local",
    },
  };
}

export async function publishLocalNotification(
  mutate: Pick<Mutations, "create">,
  existing: Rec[],
  input: WorkspaceNotificationInput,
  orgSlug: string,
): Promise<PublishResult> {
  const record = prepareNotificationEvent(input, orgSlug);
  const previous = existing.find(item => item.collection === "notifications"
    && item.fields.dedupeKey === input.dedupeKey && item.status !== "resolved");
  if (previous) return { created: false, id: previous.id, reason: "A matching open event already exists." };
  const created = await mutate.create(record, `Notification published from ${input.sourceApp}: ${input.title}`);
  return { created: true, id: created.id };
}
