import type { AttentionKind, Priority } from "@/platform/attention";
import type { NotificationCategory } from "@/platform/notificationExperience";

/**
 * Central event contracts for every native application.
 * Applications should publish business events, not hardcode their own popups.
 * This catalog does not itself schedule delivery or grant permissions.
 */
export interface NativeNotificationContract {
  appCode: string;
  name: string;
  category: NotificationCategory;
  kind: AttentionKind;
  defaultPriority: Priority;
  events: readonly string[];
}

const contracts: NativeNotificationContract[] = [
  { appCode: "HQ", name: "Headquarters", category: "work", kind: "update", defaultPriority: "P3", events: ["company.milestone", "goal.changed", "executive.brief"] },
  { appCode: "INBOX", name: "Inbox", category: "work", kind: "assignment", defaultPriority: "P2", events: ["attention.assigned", "decision.escalated"] },
  { appCode: "ASSET", name: "Assets", category: "routine", kind: "update", defaultPriority: "P3", events: ["asset.shared", "licence.expiring"] },
  { appCode: "ADMIN", name: "Administration", category: "security", kind: "system", defaultPriority: "P2", events: ["access.requested", "policy.changed", "account.risk"] },

  { appCode: "AI", name: "Ask Arlovi", category: "agents", kind: "update", defaultPriority: "P4", events: ["assistant.output_ready", "assistant.action_needs_review"] },
  { appCode: "BRAIN", name: "Company Brain", category: "routine", kind: "update", defaultPriority: "P4", events: ["knowledge.updated", "source.review_required"] },
  { appCode: "TEAM", name: "AI Workforce", category: "agents", kind: "interruption", defaultPriority: "P2", events: ["agent.action_requested", "agent.completed", "agent.failed"] },
  { appCode: "MISSION", name: "Missions", category: "agents", kind: "interruption", defaultPriority: "P2", events: ["mission.blocked", "mission.review_required", "mission.completed"] },
  { appCode: "AUTO", name: "Automation", category: "agents", kind: "system", defaultPriority: "P2", events: ["workflow.failed", "workflow.awaiting_approval", "workflow.recovered"] },
  { appCode: "ANALYTICS", name: "Analytics", category: "routine", kind: "update", defaultPriority: "P4", events: ["report.ready", "threshold.exceeded"] },

  { appCode: "FIN", name: "Finance", category: "work", kind: "approval", defaultPriority: "P2", events: ["invoice.approval_requested", "payment.failed", "invoice.overdue"] },
  { appCode: "CRM", name: "CRM", category: "work", kind: "assignment", defaultPriority: "P3", events: ["lead.assigned", "deal.stage_changed", "followup.due"] },
  { appCode: "HR", name: "People", category: "work", kind: "approval", defaultPriority: "P2", events: ["leave.requested", "onboarding.task_due", "access.requested"] },
  { appCode: "PROJECT", name: "Projects", category: "projects", kind: "mention", defaultPriority: "P3", events: ["task.assigned", "project.mentioned", "deadline.at_risk"] },
  { appCode: "COMMS", name: "Communications", category: "messages", kind: "mention", defaultPriority: "P3", events: ["message.mentioned", "shared_inbox.assigned", "mail.delivery_failed"] },
  { appCode: "CARE", name: "Customer Care", category: "work", kind: "assignment", defaultPriority: "P2", events: ["ticket.escalated", "sla.breached", "case.assigned"] },
  { appCode: "LEGAL", name: "Legal", category: "work", kind: "approval", defaultPriority: "P2", events: ["contract.signature_requested", "document.review_required", "renewal.due"] },

  { appCode: "MARKET", name: "Marketing", category: "routine", kind: "update", defaultPriority: "P3", events: ["campaign.review_requested", "campaign.performance_ready"] },
  { appCode: "COMMERCE", name: "Commerce", category: "work", kind: "update", defaultPriority: "P2", events: ["order.failed", "refund.approval_requested", "stock.low"] },
  { appCode: "BOOK", name: "Bookings", category: "work", kind: "update", defaultPriority: "P3", events: ["booking.changed", "booking.cancelled", "appointment.reminder"] },
  { appCode: "PROC", name: "Procurement", category: "work", kind: "approval", defaultPriority: "P2", events: ["purchase.approval_requested", "supplier.delayed", "goods.received"] },
  { appCode: "PORTAL", name: "Portals", category: "messages", kind: "update", defaultPriority: "P3", events: ["customer.submitted", "portal.reply_received"] },

  { appCode: "DOCS", name: "Docs", category: "projects", kind: "mention", defaultPriority: "P3", events: ["document.mentioned", "document.approval_requested", "document.shared"] },
  { appCode: "SHEETS", name: "Sheets", category: "projects", kind: "update", defaultPriority: "P4", events: ["sheet.commented", "sheet.validation_failed"] },
  { appCode: "PRESENT", name: "Present", category: "projects", kind: "update", defaultPriority: "P4", events: ["deck.review_requested", "deck.export_ready"] },
  { appCode: "DESIGN", name: "Design", category: "projects", kind: "mention", defaultPriority: "P3", events: ["design.commented", "design.approval_requested"] },
  { appCode: "PHOTO", name: "Photo", category: "projects", kind: "update", defaultPriority: "P4", events: ["photo.export_ready", "photo.shared"] },
  { appCode: "LAYOUT", name: "Layout", category: "projects", kind: "update", defaultPriority: "P4", events: ["layout.review_requested", "layout.export_ready"] },
  { appCode: "VIDEO", name: "Video", category: "projects", kind: "update", defaultPriority: "P4", events: ["video.export_ready", "video.export_failed"] },
  { appCode: "MOTION", name: "Motion", category: "projects", kind: "update", defaultPriority: "P4", events: ["motion.render_ready", "motion.render_failed"] },

  { appCode: "WEB", name: "Websites", category: "work", kind: "system", defaultPriority: "P2", events: ["deployment.failed", "site.published", "domain.expiring"] },
  { appCode: "BUILD", name: "App Builder", category: "work", kind: "system", defaultPriority: "P2", events: ["build.failed", "deployment.ready", "review.requested"] },
  { appCode: "FORMS", name: "Forms", category: "routine", kind: "update", defaultPriority: "P3", events: ["form.submitted", "form.flagged"] },
  { appCode: "CONNECT", name: "Integrations", category: "security", kind: "system", defaultPriority: "P2", events: ["connection.failed", "token.expiring", "connection.restored"] },
  { appCode: "IT", name: "IT Operations", category: "security", kind: "system", defaultPriority: "P1", events: ["security.incident", "access.revoked", "device.untrusted"] },
];

export const NATIVE_NOTIFICATION_CONTRACTS: Readonly<Record<string, NativeNotificationContract>> =
  Object.fromEntries(contracts.map(contract => [contract.appCode, contract]));

export function nativeNotificationContract(code: unknown): NativeNotificationContract | undefined {
  return typeof code === "string" ? NATIVE_NOTIFICATION_CONTRACTS[code] : undefined;
}

export function isRegisteredNativeEvent(appCode: string, eventType: string): boolean {
  return nativeNotificationContract(appCode)?.events.includes(eventType) ?? false;
}
