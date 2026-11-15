import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * INBOX fixtures — attention items, approval requests, incident alerts,
 * routed messages and the delivery preferences behind them.
 *
 * Everything here is plausible for a small design-led lighting studio
 * (Northline Atelier) and its separate US company (Harbor Supply). Ids start
 * at n: 20 so they never collide with the base seed.
 * ====================================================================== */

registerSeed("inbox", (ctx) => {
  const base = Date.parse(ctx.now);
  const at = (hoursAgo: number) => new Date(base - hoursAgo * 3_600_000).toISOString();
  const inDays = (days: number) => new Date(base + days * 86_400_000).toISOString();
  const records: Rec[] = [];

  /* ---------------- Notifications: the attention feed ---------------- */
  const notification = (
    n: number,
    title: string,
    summary: string,
    fields: Record<string, string | number | boolean>,
    hoursAgo: number,
    org: "nl" | "hb" = "nl",
    status = "open",
  ) => records.push(ctx.rec({ org, collection: "notifications", n, title, status, summary, at: at(hoursAgo), fields, tags: [String(fields.category ?? "routine")] }));

  notification(20, "Wage journal is balanced and waiting for a decision", "JRN-0008 debits and credits agree. Posting is restricted to Finance and Owner.", {
    kind: "approval", priority: "P1", audience: "owner,finance", route: "/o/northline/fin/ledger", entityId: "nl-journals-008",
    source: "Finance", category: "milestone", read: false, acknowledged: false, group: "Approvals",
  }, 2);
  notification(21, "INV-1047 is 21 days past due", "Lumen Hotel Group has not paid. Chasing is a local draft; no mail provider is connected.", {
    kind: "overdue", priority: "P1", audience: "owner,finance", route: "/o/northline/fin/invoices", entityId: "nl-invoices-003",
    source: "Finance", category: "milestone", read: false, acknowledged: false, group: "Overdue",
  }, 6);
  notification(22, "Nia Okonkwo drafted the autumn showroom plan", "The Chief of Staff agent prepared a mission plan from local records and stopped before spending.", {
    kind: "interruption", priority: "P2", audience: "owner", route: "/o/northline/mission/missions", entityId: "nl-missions-001",
    source: "Missions", category: "milestone", read: false, acknowledged: false, group: "Missions",
  }, 3);
  notification(23, "Priya Shah mentioned you in #showroom", "\"@Maya can you confirm the Ravelin pendant finish before Thursday?\"", {
    kind: "mention", priority: "P2", audience: "owner,sales", route: "/o/northline/comms/channels", entityId: "nl-messages-020",
    source: "Comms", category: "routine", read: false, acknowledged: false, group: "Messages",
  }, 5);
  notification(24, "Stock count for Ravelin pendant finished", "Counted 34 against 36 expected. The variance is recorded against the warehouse.", {
    kind: "update", priority: "P3", audience: "owner,finance", route: "/o/northline/commerce/products", entityId: "nl-products-001",
    source: "Commerce", category: "routine", read: true, acknowledged: false, group: "Updates",
  }, 9);
  notification(25, "Mailbox connector still has no grant", "Outbound mail stays in draft until a mail provider is connected.", {
    kind: "system", priority: "P2", audience: "owner", route: "/o/northline/connect/connectors", entityId: "nl-connectors-002",
    source: "Platform", category: "security", read: false, acknowledged: true, group: "Platform",
  }, 26);
  notification(26, "Theo Marsh asked for help on the Kinsale install", "The electrician slot moved to Friday; the task needs a new owner for Wednesday.", {
    kind: "assignment", priority: "P3", audience: "owner,member", route: "/o/northline/project/tasks", entityId: "nl-tasks-002",
    source: "Projects", category: "routine", read: false, acknowledged: false, group: "Work",
  }, 12);
  notification(27, "Weekly ledger digest is ready", "Six journals posted, one awaiting approval, no bank feed confirmation.", {
    kind: "update", priority: "P5", audience: "owner,finance", route: "/o/northline/inbox/digests",
    source: "Digest", category: "routine", read: true, acknowledged: true, group: "Updates",
  }, 30);
  notification(28, "Deep link target was removed", "This item points at a record that is no longer in this browser.", {
    kind: "update", priority: "P4", audience: "owner", route: "/o/northline/fin/invoices/nl-invoices-404", entityId: "nl-invoices-404",
    source: "Finance", category: "routine", read: false, acknowledged: false, group: "Updates",
  }, 40);
  notification(29, "Harbor Supply quote expires tomorrow", "Harbor records are kept separate; this item is routed to the Harbor workspace only.", {
    kind: "update", priority: "P3", audience: "owner,sales", route: "/o/harbor/crm/quotes",
    source: "Sales", category: "routine", read: false, acknowledged: false, group: "Updates",
  }, 7, "hb");
  notification(30, "Showroom lighting rig tripped the RCD", "Facilities raised it from the showroom tablet. The rig is isolated.", {
    kind: "system", priority: "P0", audience: "owner", route: "/o/northline/inbox/incidents", entityId: "nl-incidents-020",
    source: "Facilities", category: "security", read: false, acknowledged: false, group: "Incidents",
  }, 1);
  notification(31, "Elena Voss published the October people review", "Leave balances and probation dates were updated for four people.", {
    kind: "update", priority: "P4", audience: "owner,people", route: "/o/northline/hr/people",
    source: "People", category: "milestone", read: true, acknowledged: true, group: "Updates",
  }, 52, "nl", "resolved");
  notification(32, "Harbor monthly close checklist opened", "Elena Ward started the Harbor close for this period.", {
    kind: "assignment", priority: "P3", audience: "owner,finance", route: "/o/harbor/fin/ledger",
    source: "Finance", category: "routine", read: false, acknowledged: false, group: "Work",
  }, 20, "hb");
  notification(33, "Two card payments are waiting on a processor", "No processor is connected, so both orders stay as awaiting payment with full line detail.", {
    kind: "system", priority: "P2", audience: "owner,finance", route: "/o/northline/commerce/orders",
    source: "Commerce", category: "routine", read: false, acknowledged: false, group: "Platform",
  }, 16);

  /* ---------------- Approval requests ---------------- */
  const approval = (
    n: number,
    title: string,
    summary: string,
    amountMinor: number | undefined,
    fields: Record<string, string | number | boolean>,
    status: string,
    hoursAgo: number,
    dueAt?: string,
    org: "nl" | "hb" = "nl",
  ) => records.push(ctx.rec({ org, collection: "approvals", n, title, status, summary, amountMinor, at: at(hoursAgo), dueAt, fields, tags: [String(fields.risk ?? "low")] }));

  approval(20, "Post the October wage accrual", "Posts JRN-0008 to Wages and Accruals. The journal is balanced at the amount shown.", 1_842_000, {
    requester: "Idris Cole", requesterKind: "ai", action: "finance.post_journal", targetId: "nl-journals-008", targetTitle: "JRN-0008 Wage accrual",
    risk: "high", accounts: "6300 Wages, 2100 Accruals", planVersion: "1", scope: "Post one journal in the current period",
    assignee: "Maya Chen", capability: "post_journal", evidence: "Debits 18,420.00 equal credits 18,420.00 across two lines.",
  }, "awaiting_approval", 2, inDays(2));
  approval(21, "Pay Hollis Metalwork bill BILL-220", "Marks the payable as paid locally. No payment leaves this browser.", 486_500, {
    requester: "Jonah Adeyemi", requesterKind: "human", action: "finance.mark_bill_paid", targetId: "nl-bills-001", targetTitle: "BILL-220 Hollis Metalwork",
    risk: "medium", accounts: "2000 Accounts payable, 1000 Bank", planVersion: "2", scope: "One payable, current period",
    assignee: "Maya Chen", capability: "approve_payment", evidence: "Invoice matched to purchase order PO-118 and the goods receipt.",
  }, "awaiting_approval", 8, inDays(4));
  approval(22, "Let the showroom mission commit £1,200 of spend", "Raises the mission spend cap for the autumn showroom plan.", 120_000, {
    requester: "Nia Okonkwo", requesterKind: "ai", action: "mission.raise_spend_cap", targetId: "nl-missions-001", targetTitle: "Autumn showroom plan",
    risk: "high", accounts: "Mission budget", planVersion: "3", scope: "One mission, one period, cap £1,200",
    assignee: "Maya Chen", capability: "approve_mission", evidence: "Current cap £2,000; committed £860 against local supplier quotes.",
  }, "awaiting_approval", 4, inDays(1));
  approval(23, "Publish the winter collection campaign", "Moves the campaign from draft to scheduled. Nothing is sent without a provider.", undefined, {
    requester: "Priya Shah", requesterKind: "human", action: "market.publish_campaign", targetId: "nl-campaigns-001", targetTitle: "Winter collection",
    risk: "medium", accounts: "Marketing budget", planVersion: "1", scope: "One campaign, scheduled only",
    assignee: "Maya Chen", capability: "publish_campaign", evidence: "Audience of 412 local contacts; no mail provider is connected.",
  }, "awaiting_approval", 20, inDays(6));
  approval(24, "Approve Theo Marsh's leave 18–22 December", "Five working days. Cover is recorded against the Kinsale install.", undefined, {
    requester: "Theo Marsh", requesterKind: "human", action: "hr.approve_leave", targetId: "nl-leaveRequests-001", targetTitle: "Leave 18–22 December",
    risk: "low", accounts: "Leave balance", planVersion: "1", scope: "One leave request",
    assignee: "Elena Voss", capability: "edit_people", delegatedTo: "Maya Chen", evidence: "Balance after approval: 4 days remaining.",
  }, "awaiting_approval", 34, inDays(9));
  approval(25, "Export the customer list for the showroom event", "Writes a CSV in this browser. The export is logged with the reason.", undefined, {
    requester: "Priya Shah", requesterKind: "human", action: "data.export_contacts", targetId: "nl-contacts-001", targetTitle: "Customer contacts",
    risk: "medium", accounts: "Contacts", planVersion: "1", scope: "412 contacts, name and email only",
    assignee: "Maya Chen", capability: "export_data", evidence: "Retention schedule allows event use for 90 days.",
  }, "approved", 76, undefined);
  approval(26, "Raise the Ravelin pendant price by 8%", "Was denied: the quote to Lumen Hotel Group still holds the old price.", 0, {
    requester: "Priya Shah", requesterKind: "human", action: "commerce.change_price", targetId: "nl-products-001", targetTitle: "Ravelin pendant",
    risk: "medium", accounts: "Product revenue", planVersion: "2", scope: "One product price",
    assignee: "Maya Chen", capability: "edit_pipeline", decision: "denied", decisionNote: "Hold until the Lumen quote expires on the 30th.",
  }, "denied", 120, undefined);
  approval(27, "Harbor: approve the dockside storage lease", "Harbor Supply decision, kept in the Harbor workspace.", 950_000, {
    requester: "Elena Ward", requesterKind: "human", action: "finance.commit_lease", targetId: "hb-contracts-001", targetTitle: "Dockside storage lease",
    risk: "high", accounts: "6100 Rent", planVersion: "1", scope: "12 month lease",
    assignee: "Elena Ward", capability: "approve_payment", evidence: "Quote from two local operators recorded in Harbor contracts.",
  }, "awaiting_approval", 14, inDays(3), "hb");

  /* ---------------- Incident alerts ---------------- */
  const incident = (
    n: number,
    title: string,
    summary: string,
    fields: Record<string, string | number | boolean>,
    status: string,
    hoursAgo: number,
  ) => records.push(ctx.rec({ org: "nl", collection: "incidents", n, title, status, summary, at: at(hoursAgo), fields, tags: [String(fields.category ?? "platform")] }));

  incident(20, "Showroom lighting rig tripped the RCD", "The display rig is isolated. Two pendants on the Kinsale set are unpowered.", {
    service: "Showroom floor", severity: "sev1", owner: "Theo Marsh", escalation: "Theo Marsh → Maya Chen after 30 minutes",
    category: "platform", impact: "Showroom viewing at 14:00 cannot use the main rig.", diagnosis: "RCD tripped when the third circuit was added. Load recorded at 2.9 kW against a 2.4 kW circuit.",
    recovery: "Move the Kinsale set to the second circuit, then reset the RCD with the rig off.",
  }, "urgent", 1);
  incident(21, "Local storage is at 78% of the browser quota", "Records, previews and drafts share one browser store. Nothing is lost yet.", {
    service: "Local workspace", severity: "sev2", owner: "Maya Chen", escalation: "Maya Chen only",
    category: "platform", impact: "A large import could fail once the quota is reached.", diagnosis: "Asset previews account for 61% of the stored bytes.",
    recovery: "Archive superseded asset versions from Asset governance, then export before clearing.",
  }, "urgent", 5);
  incident(22, "Two sign-ins from an unrecognised device", "Both were on the Northline owner view from a new laptop in London.", {
    service: "Identity", severity: "sev2", owner: "Maya Chen", escalation: "Security review in Administration",
    category: "security", impact: "Role views are shaped in this browser; they are not an account boundary.", diagnosis: "Sessions nl-sessions-022 and nl-sessions-023 started within four minutes.",
    recovery: "Revoke the sessions in Administration, then re-enter the workspace on the trusted device.",
  }, "waiting", 11);
  incident(23, "Mailbox connector grant was never completed", "Outbound mail has stayed in draft since the connector was added.", {
    service: "Mail", severity: "sev3", owner: "Maya Chen", escalation: "No escalation route set",
    category: "platform", impact: "Nine drafts are queued locally, including two invoice chasers.", diagnosis: "The connector has no grant, so no provider call is attempted.",
    recovery: "Either connect a mail provider or send the drafts another way and mark them sent.",
  }, "waiting", 48);
  incident(24, "Kinsale install van was double booked", "Resolved: the second booking moved to Friday morning.", {
    service: "Field work", severity: "sev3", owner: "Theo Marsh", escalation: "Theo Marsh → Elena Voss",
    category: "platform", impact: "One install slot was at risk for two hours.", diagnosis: "Two bookings held the same resource window.",
    recovery: "Booking nl-bookings-002 moved; the resource calendar now has no overlap.",
  }, "resolved", 70);
  incident(25, "An export was started without a stated reason", "Resolved: the export was cancelled and re-run with a reason recorded.", {
    service: "Data", severity: "sev3", owner: "Jonah Adeyemi", escalation: "Privacy steward",
    category: "security", impact: "No file left the browser; the first attempt was blocked by the export form.", diagnosis: "Export authorisation requires a reason and a capability.",
    recovery: "Re-run from Audit Trail with the reason field completed.",
  }, "resolved", 96);
  incident(26, "Payment processor webhook endpoint is unreachable", "No processor is connected, so the endpoint has never received a call.", {
    service: "Payments", severity: "sev3", owner: "Jonah Adeyemi", escalation: "Finance admin",
    category: "security", impact: "Orders stay as awaiting payment with their full line detail.", diagnosis: "The webhook in Developer access has no delivery attempts recorded.",
    recovery: "Leave disabled until a processor is connected and the endpoint is verified.",
  }, "waiting", 60);

  /* ---------------- Routed messages ---------------- */
  const message = (
    n: number,
    title: string,
    summary: string,
    fields: Record<string, string | number | boolean>,
    hoursAgo: number,
    status = "open",
  ) => records.push(ctx.rec({ org: "nl", collection: "messages", n, title, status, summary, at: at(hoursAgo), fields, owner: String(fields.author ?? "Maya Chen") }));

  message(20, "Ravelin pendant finish for Thursday", "@Maya can you confirm the Ravelin pendant finish before Thursday? Lumen want brushed, the quote says blackened.", {
    author: "Priya Shah", authorKind: "human", channel: "#showroom", kind: "mention", assignee: "Maya Chen", unread: true, threadId: "nl-conversations-001", replies: 4,
  }, 5);
  message(21, "Lumen Hotel Group is unhappy about the delay", "Escalated from CARE-19. They were promised the pendants for the 20th and the install is now the 27th.", {
    author: "Remy Alves", authorKind: "ai", channel: "Care escalation", kind: "escalation", assignee: "Priya Shah", unread: true, threadId: "nl-tickets-001", replies: 7, severity: "high",
  }, 3);
  message(22, "Wage journal is ready for your decision", "I prepared JRN-0008 from the October timesheets. I cannot post it; Finance or Owner must.", {
    author: "Idris Cole", authorKind: "ai", channel: "Direct", kind: "mention", assignee: "Maya Chen", unread: true, threadId: "nl-conversations-002", replies: 1,
  }, 2);
  message(23, "Payroll figures for the people review", "Restricted to the people and owner views because it names individual pay.", {
    author: "Elena Voss", authorKind: "human", channel: "#people-private", kind: "chat", assignee: "Elena Voss", unread: true, restrictedTo: "owner,people", threadId: "nl-conversations-003", replies: 3,
  }, 7);
  message(24, "Kinsale install sequence", "Running order for Wednesday: scaffold 08:00, first fix 09:30, pendants from 13:00.", {
    author: "Theo Marsh", authorKind: "human", channel: "#install", kind: "chat", assignee: "Theo Marsh", unread: false, threadId: "nl-conversations-004", replies: 12,
  }, 22);
  message(25, "Supplier lead time went from 3 to 5 weeks", "Hollis Metalwork confirmed the change in writing. It affects two open quotes.", {
    author: "Jonah Adeyemi", authorKind: "human", channel: "#supply", kind: "chat", assignee: "Priya Shah", unread: true, threadId: "nl-conversations-005", replies: 2,
  }, 28);
  message(26, "Board pack draft for the November review", "Restricted to the owner view until the figures are checked against the ledger.", {
    author: "Maya Chen", authorKind: "human", channel: "#board", kind: "chat", assignee: "Maya Chen", unread: false, restrictedTo: "owner", threadId: "nl-conversations-006", replies: 1,
  }, 44);
  message(27, "Showroom viewing moved to 14:30", "Confirmed with the client. The calendar entry is updated.", {
    author: "Priya Shah", authorKind: "human", channel: "#showroom", kind: "chat", assignee: "Priya Shah", unread: false, threadId: "nl-conversations-001", replies: 2,
  }, 50, "resolved");
  message(28, "Who owns the Wednesday electrician slot?", "@Theo the slot moved to Friday and Wednesday now has nobody against it.", {
    author: "Elena Voss", authorKind: "human", channel: "#install", kind: "mention", assignee: "Theo Marsh", unread: true, threadId: "nl-conversations-004", replies: 0,
  }, 12);

  /* ---------------- Delivery preferences, digests, escalation rules ---------------- */
  const pref = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status = "active") =>
    records.push(ctx.rec({ org: "nl", collection: "preferences", n, title, status, summary, fields, tags: [String(fields.kind)] }));

  pref(20, "In-app inbox", "Shown in this browser. Always available because it needs no provider.", {
    kind: "notifyChannel", channel: "in_app", capability: "local", enabled: true, categories: "approval,overdue,mention,assignment,update,system", minPriority: "P5", locked: true,
  });
  pref(21, "Email", "Would send a message through a mail provider. None is connected, so each item is kept as a draft.", {
    kind: "notifyChannel", channel: "email", capability: "email.send", enabled: true, categories: "approval,overdue,system", minPriority: "P2", locked: false,
  });
  pref(22, "Browser push", "Needs the browser's own permission before anything can be shown outside the tab.", {
    kind: "notifyChannel", channel: "push", capability: "os", enabled: false, categories: "approval,system", minPriority: "P1", locked: false,
  });
  pref(23, "SMS", "Would need a telephony provider. None is connected.", {
    kind: "notifyChannel", channel: "sms", capability: "telephony", enabled: false, categories: "system", minPriority: "P0", locked: false,
  });
  pref(24, "Approvals", "Decisions that cannot move without you.", { kind: "notifyCategory", category: "approval", inApp: true, email: true, push: true, digestOnly: false, minPriority: "P2" });
  pref(25, "Overdue money", "Receivables and payables past their date.", { kind: "notifyCategory", category: "overdue", inApp: true, email: true, push: false, digestOnly: false, minPriority: "P2" });
  pref(26, "Mentions", "Someone named you in a channel or a thread.", { kind: "notifyCategory", category: "mention", inApp: true, email: false, push: false, digestOnly: false, minPriority: "P3" });
  pref(27, "Routine updates", "Counts, stock movements and completed jobs.", { kind: "notifyCategory", category: "update", inApp: true, email: false, push: false, digestOnly: true, minPriority: "P4" });
  pref(28, "Security and platform", "Sign-ins, grants and connector states. Cannot be muted below P1.", { kind: "notifyCategory", category: "system", inApp: true, email: true, push: true, digestOnly: false, minPriority: "P1", securityFloor: true });
  pref(29, "Quiet hours", "Nothing below P1 is delivered outside working hours.", {
    kind: "quietHours", start: "19:00", end: "08:00", days: "Mon,Tue,Wed,Thu,Fri", weekend: true, allowAbove: "P1", timezone: "Europe/London",
  });
  pref(30, "Focus block", "Showroom mornings. Only P0 and P1 reach the inbox badge.", {
    kind: "quietHours", start: "09:00", end: "11:00", days: "Tue,Thu", weekend: false, allowAbove: "P1", timezone: "Europe/London",
  });
  pref(31, "Morning brief", "What needs a decision today, with the records each line came from.", {
    kind: "digest", cadence: "daily", sendAt: "07:30", recipients: "Maya Chen,Jonah Adeyemi", sections: "approvals,overdue,missions,work", channel: "in_app", lastBuiltAt: at(26),
  });
  pref(32, "Evening summary", "What changed today and what is still open.", {
    kind: "digest", cadence: "daily", sendAt: "18:00", recipients: "Maya Chen", sections: "activity,work,updates", channel: "in_app", lastBuiltAt: at(14),
  });
  pref(33, "Weekly review", "Monday review for the owner and finance views.", {
    kind: "digest", cadence: "weekly", sendAt: "Mon 08:00", recipients: "Maya Chen,Jonah Adeyemi,Priya Shah", sections: "approvals,overdue,ledger,missions,incidents", channel: "email", lastBuiltAt: at(100),
  });
  pref(34, "Showroom week", "Custom digest for showroom weeks only.", {
    kind: "digest", cadence: "custom", sendAt: "Tue 16:00", recipients: "Priya Shah", sections: "work,updates", channel: "in_app", paused: true,
  });
  pref(35, "Finance cover while Jonah is away", "Finance approvals route to the owner view after four hours.", {
    kind: "escalationRule", condition: "capability:approve_payment", owner: "Jonah Adeyemi", backup: "Maya Chen", timerMinutes: 240, authorityCap: 500_000, enabled: true, scope: "Payments and bills",
  });
  pref(36, "Mission decisions", "Mission interruptions escalate to the owner view after one hour.", {
    kind: "escalationRule", condition: "kind:interruption", owner: "Maya Chen", backup: "Maya Chen", timerMinutes: 60, authorityCap: 200_000, enabled: true, scope: "Missions",
  });
  pref(37, "People approvals", "Leave and probation decisions cover to the owner view overnight.", {
    kind: "escalationRule", condition: "capability:edit_people", owner: "Elena Voss", backup: "Maya Chen", timerMinutes: 720, authorityCap: 0, enabled: true, scope: "Leave and people records",
  });
  pref(38, "Sales cover", "Pipeline approvals cover to Priya, who cannot approve payments.", {
    kind: "escalationRule", condition: "capability:approve_payment", owner: "Jonah Adeyemi", backup: "Priya Shah", timerMinutes: 180, authorityCap: 1_000_000, enabled: false, scope: "Payments and bills",
  });
  pref(39, "Security escalations", "Never muted. Delivered on every enabled channel regardless of quiet hours.", {
    kind: "escalationRule", condition: "category:security", owner: "Maya Chen", backup: "Maya Chen", timerMinutes: 15, authorityCap: 0, enabled: true, scope: "Security and platform", securityFloor: true,
  });

  return { records };
});
