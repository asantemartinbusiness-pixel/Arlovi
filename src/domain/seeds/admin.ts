import { registerSeed } from "@/domain/seedRegistry";
import type { Audit, Rec } from "@/domain/types";
import { ORG_NORTHLINE } from "@/domain/types";

/* ====================================================================== *
 * ADMIN fixtures — identity, policy, autonomy grants, sessions, audit,
 * privacy requests, subscription records, backups and developer access.
 *
 * Nothing here implies a server: sessions, keys and invitations are records
 * in this browser, and every figure a screen shows is derived from them.
 * ====================================================================== */

registerSeed("admin", (ctx) => {
  const base = Date.parse(ctx.now);
  const at = (hoursAgo: number) => new Date(base - hoursAgo * 3_600_000).toISOString();
  const inDays = (days: number) => new Date(base + days * 86_400_000).toISOString();
  const records: Rec[] = [];
  const events: Audit[] = [];

  /* ---------------- People with administrative state ---------------- */
  const member = (n: number, name: string, fields: Record<string, string | number | boolean>, status = "active", summary = "") =>
    records.push(ctx.rec({ org: "nl", collection: "members", n, title: name, status, summary, fields, tags: [String(fields.kind ?? "human")] }));

  member(20, "Theo Marsh", {
    kind: "human", role: "member", departmentId: "nl-departments-003", title: "Install lead", email: "theo@northline.example",
    lastAccessAt: at(4), mfa: true, seat: "full", invitedBy: "Maya Chen", joinedAt: at(9_000),
  }, "active", "Runs installs. Member view.");
  member(21, "Amara Diallo", {
    kind: "human", role: "sales", departmentId: "nl-departments-002", title: "Showroom assistant", email: "amara@northline.example",
    lastAccessAt: at(31), mfa: false, seat: "full", invitedBy: "Priya Shah", joinedAt: at(4_200),
  }, "active", "Weekend showroom cover. Sales view.");
  member(22, "Rowan Pike", {
    kind: "human", role: "member", departmentId: "nl-departments-003", title: "Workshop", email: "rowan@northline.example",
    lastAccessAt: at(1_900), mfa: false, seat: "full", suspendedReason: "Left the workshop in September. Access suspended, records kept.",
    invitedBy: "Maya Chen", joinedAt: at(16_000),
  }, "suspended", "Suspended. Kept for the audit trail.");
  member(23, "Hollis Metalwork (Dana Rees)", {
    kind: "human", role: "client", departmentId: "", title: "Supplier contact", email: "dana@hollismetal.example",
    lastAccessAt: at(220), mfa: false, seat: "external", external: true, scope: "Purchase orders and delivery notes only",
    invitedBy: "Jonah Adeyemi", joinedAt: at(5_400),
  }, "active", "External collaborator. Sees only what is shared with the portal.");
  member(24, "Lumen Hotel Group (Sam Okafor)", {
    kind: "human", role: "client", departmentId: "", title: "Client contact", email: "sam@lumenhotels.example",
    lastAccessAt: at(78), mfa: false, seat: "external", external: true, scope: "Their own quotes, invoices and bookings",
    invitedBy: "Priya Shah", joinedAt: at(2_600),
  }, "active", "Client portal access for one account.");
  member(25, "Sable Nguyen", {
    kind: "ai", role: "agent", departmentId: "nl-departments-002", title: "Creative agent", agentId: "nl-agents-003",
    lastAccessAt: at(9), mfa: false, seat: "agent", autonomy: "draft", grantedBy: "Maya Chen",
  }, "active", "Creative agent. Drafts only, no publishing grant.");

  /* ---------------- Invitations ---------------- */
  const invite = (n: number, email: string, fields: Record<string, string | number | boolean>, status: string, summary: string) =>
    records.push(ctx.rec({ org: "nl", collection: "invitations", n, title: email, status, summary, fields, dueAt: String(fields.expiresAt ?? "") || undefined }));

  invite(20, "fin.temp@northline.example", {
    role: "finance", invitedBy: "Maya Chen", sentAt: at(20), expiresAt: inDays(5), seat: "full", deliveryState: "not_connected", note: "Maternity cover for the November close",
  }, "pending", "Kept as a local draft: no mail provider is connected to send it.");
  invite(21, "studio.intern@northline.example", {
    role: "member", invitedBy: "Elena Voss", sentAt: at(60), expiresAt: inDays(2), seat: "full", deliveryState: "not_connected", note: "Winter studio intern",
  }, "pending", "Draft invitation. Nothing has been emailed.");
  invite(22, "contractor@kinsale.example", {
    role: "client", invitedBy: "Theo Marsh", sentAt: at(400), expiresAt: at(50), seat: "external", deliveryState: "not_connected", note: "Kinsale site access",
  }, "expired", "Expired before it was ever delivered.");
  invite(23, "ex.bookkeeper@northline.example", {
    role: "finance", invitedBy: "Maya Chen", sentAt: at(900), expiresAt: at(200), seat: "full", deliveryState: "not_connected", revokedBy: "Maya Chen", note: "Replaced by Jonah",
  }, "revoked", "Revoked once Jonah took the ledger over.");

  /* ---------------- Policies: roles, autonomy, retention, residency ---------------- */
  const policy = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status = "published", amountMinor?: number) =>
    records.push(ctx.rec({ org: "nl", collection: "policies", n, title, status, summary, fields, amountMinor, tags: [String(fields.kind)] }));

  policy(20, "Showroom host", "A narrow role for weekend cover: bookings and the showroom calendar, no money.", {
    kind: "role", basedOn: "member", capabilities: "", apps: "HQ,INBOX,BOOK,CARE,ASSET", holders: 1, deny: "export_data,delete_records", author: "Elena Voss",
  }, "published");
  policy(21, "Bookkeeper (draft)", "Proposed least-privilege finance role: post journals, no payment approval.", {
    kind: "role", basedOn: "finance", capabilities: "post_journal,export_data", apps: "HQ,INBOX,FIN,PROC,ANALYTICS", holders: 0, deny: "approve_payment", author: "Nia Okonkwo", proposedBy: "agent",
  }, "draft");
  policy(22, "Install supervisor (draft)", "Projects and bookings with people editing, drafted from Theo's actual usage.", {
    kind: "role", basedOn: "member", capabilities: "run_automation", apps: "HQ,INBOX,PROJECT,BOOK,ASSET,DOCS", holders: 0, deny: "view_payroll", author: "Nia Okonkwo", proposedBy: "agent",
  }, "draft");
  policy(23, "Company autonomy", "Agents draft; a human decides. No agent holds a posting or payment grant.", {
    kind: "autonomyGrant", scope: "company", mode: "draft", maxSpendMinor: 200_000, requiresApproval: "post_journal,approve_payment,publish_campaign,delete_records",
    pausedBy: "", globalUnrestricted: false, author: "Maya Chen",
  }, "published", 200_000);
  policy(24, "Finance department autonomy", "The finance agent may prepare journals and reconcile locally.", {
    kind: "autonomyGrant", scope: "department", departmentId: "nl-departments-002", mode: "draft", maxSpendMinor: 50_000,
    requiresApproval: "post_journal,approve_payment", globalUnrestricted: false, author: "Jonah Adeyemi",
  }, "published", 50_000);
  policy(25, "Creative department autonomy", "Briefs, layout notes and asset variants without publishing.", {
    kind: "autonomyGrant", scope: "department", departmentId: "nl-departments-001", mode: "suggest", maxSpendMinor: 0,
    requiresApproval: "publish_campaign,site.publish", globalUnrestricted: false, author: "Maya Chen",
  }, "published", 0);
  policy(26, "Nia Okonkwo grant", "Chief of Staff: plans and drafts, spends nothing without approval.", {
    kind: "autonomyGrant", scope: "agent", agentId: "nl-agents-001", mode: "draft", maxSpendMinor: 0,
    requiresApproval: "all", tools: "read_records,draft_documents,propose_missions", globalUnrestricted: false, author: "Maya Chen",
  }, "published", 0);
  policy(27, "Idris Cole grant", "Finance agent: prepare journals and match bills. Cannot post.", {
    kind: "autonomyGrant", scope: "agent", agentId: "nl-agents-002", mode: "draft", maxSpendMinor: 0,
    requiresApproval: "post_journal,approve_payment", tools: "read_records,draft_journals,match_bills", globalUnrestricted: false, author: "Jonah Adeyemi",
  }, "published", 0);
  policy(28, "Remy Alves grant", "Care agent: may reply only from approved articles.", {
    kind: "autonomyGrant", scope: "agent", agentId: "nl-agents-004", mode: "suggest", maxSpendMinor: 0,
    requiresApproval: "all", tools: "read_articles,draft_replies", globalUnrestricted: false, author: "Maya Chen",
  }, "published", 0);
  policy(29, "Autumn showroom mission grant", "One mission, one period, capped at £2,000 of committed spend.", {
    kind: "autonomyGrant", scope: "mission", missionId: "nl-missions-001", mode: "execute_with_approval", maxSpendMinor: 200_000,
    requiresApproval: "approve_payment", expiresAt: inDays(21), globalUnrestricted: false, author: "Maya Chen",
  }, "published", 200_000);
  policy(30, "Customer records", "Kept six years from the last transaction unless a legal hold applies.", {
    kind: "retention", collections: "contacts,companies,quotes,invoices", years: 6, basis: "UK statutory record keeping", legalHold: false, nextReviewAt: inDays(120),
  }, "published");
  policy(31, "Employment records", "Kept six years after leaving. Payroll detail is restricted to the people and owner views.", {
    kind: "retention", collections: "employees,payrollRuns,leaveRequests", years: 6, basis: "UK employment and payroll", legalHold: true, holdReason: "Open grievance file from September", nextReviewAt: inDays(60),
  }, "published");
  policy(32, "Marketing and asset originals", "Kept two years, or until the licence expires, whichever is first.", {
    kind: "retention", collections: "assets,campaigns,socialPosts", years: 2, basis: "Licence terms", legalHold: false, nextReviewAt: inDays(45),
  }, "published");
  policy(33, "Support conversations", "Kept 18 months so warranty claims can be checked.", {
    kind: "retention", collections: "tickets,conversations,messages", years: 2, basis: "Warranty period", legalHold: false, nextReviewAt: inDays(200),
  }, "published");
  policy(34, "Data residency", "Every record in this workspace is in this browser, on this device.", {
    kind: "residency", region: "This browser", processors: "None", transfers: "None", note: "No data leaves the device, so no transfer mechanism applies yet.",
  }, "published");
  policy(35, "Marketing consent", "Consent is recorded per contact and is never assumed from a purchase.", {
    kind: "consent", subject: "Contacts", lawfulBasis: "Consent", recorded: 412, granted: 268, withdrawn: 19, lastAuditAt: at(400),
  }, "published");
  policy(36, "AI data policy", "Records are never sent to a model provider, because none is connected.", {
    kind: "consent", subject: "AI processing", lawfulBasis: "Not applicable", recorded: 0, granted: 0, withdrawn: 0, note: "Agent answers are composed from local records and name them.",
  }, "published");
  policy(37, "Sign-in policy", "Role views are chosen in this browser. There is no identity provider.", {
    kind: "authPolicy", sso: "not_connected", provider: "None", mfaRequired: false, mfaRequiredForOwner: true,
    sessionHours: 12, trustedIps: "", passwordless: false, stepUpForSensitive: true,
  }, "published");
  policy(38, "Subscription", "Studio plan, billed yearly. Nothing is charged from this browser.", {
    kind: "subscription", plan: "Studio", seatsIncluded: 10, seatsUsed: 8, agentSeats: 4, renewsAt: inDays(142),
    term: "annual", processor: "not_connected", balanceMinor: 0, pricePerSeatMinor: 2_400,
  }, "published", 24_000);

  /* ---------------- Sessions and devices ---------------- */
  const session = (n: number, title: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number) =>
    records.push(ctx.rec({ org: "nl", collection: "sessions", n, title, status, summary: String(fields.agent ?? ""), at: at(hoursAgo), fields, owner: String(fields.member) }));

  session(20, "Maya Chen · this browser", {
    member: "Maya Chen", device: "MacBook Pro", platform: "macOS", agent: "Chromium 140 on macOS", ip: "82.14.x.x", location: "London, UK",
    current: true, startedAt: at(2), lastSeenAt: at(0), mfa: true, trusted: true,
  }, "active", 2);
  session(21, "Maya Chen · showroom tablet", {
    member: "Maya Chen", device: "Showroom iPad", platform: "iPadOS", agent: "Safari 18 on iPadOS", ip: "82.14.x.x", location: "London, UK",
    current: false, startedAt: at(27), lastSeenAt: at(6), mfa: true, trusted: true,
  }, "active", 27);
  session(22, "Maya Chen · unrecognised laptop", {
    member: "Maya Chen", device: "Unknown laptop", platform: "Windows", agent: "Chromium 139 on Windows", ip: "51.6.x.x", location: "London, UK",
    current: false, startedAt: at(11), lastSeenAt: at(10), mfa: false, trusted: false, anomaly: "New device, no second factor",
  }, "active", 11);
  session(23, "Maya Chen · second unrecognised sign-in", {
    member: "Maya Chen", device: "Unknown laptop", platform: "Windows", agent: "Chromium 139 on Windows", ip: "51.6.x.x", location: "London, UK",
    current: false, startedAt: at(11), lastSeenAt: at(11), mfa: false, trusted: false, anomaly: "Two sign-ins four minutes apart",
  }, "active", 11);
  session(24, "Jonah Adeyemi · desktop", {
    member: "Jonah Adeyemi", device: "Studio desktop", platform: "Linux", agent: "Firefox 134 on Linux", ip: "82.14.x.x", location: "London, UK",
    current: false, startedAt: at(5), lastSeenAt: at(1), mfa: true, trusted: true,
  }, "active", 5);
  session(25, "Priya Shah · phone", {
    member: "Priya Shah", device: "Pixel 9", platform: "Android", agent: "Chromium 140 on Android", ip: "188.29.x.x", location: "Manchester, UK",
    current: false, startedAt: at(30), lastSeenAt: at(8), mfa: false, trusted: true,
  }, "active", 30);
  session(26, "Rowan Pike · workshop desktop", {
    member: "Rowan Pike", device: "Workshop desktop", platform: "Windows", agent: "Chromium 136 on Windows", ip: "82.14.x.x", location: "London, UK",
    current: false, startedAt: at(1_900), lastSeenAt: at(1_890), mfa: false, trusted: false, revokedBy: "Maya Chen", revokedAt: at(1_880),
  }, "revoked", 1_900);
  session(27, "Sam Okafor · client portal", {
    member: "Lumen Hotel Group (Sam Okafor)", device: "iPhone 15", platform: "iOS", agent: "Safari 18 on iOS", ip: "90.200.x.x", location: "Bristol, UK",
    current: false, startedAt: at(78), lastSeenAt: at(77), mfa: false, trusted: false, external: true,
  }, "expired", 78);

  const device = (n: number, title: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number) =>
    records.push(ctx.rec({ org: "nl", collection: "devices", n, title, status, summary: String(fields.note ?? ""), at: at(hoursAgo), fields, owner: String(fields.member) }));

  device(20, "MacBook Pro", { member: "Maya Chen", platform: "macOS 15", trusted: true, lastSeenAt: at(0), firstSeenAt: at(9_000), note: "Primary device for the owner view." }, "trusted", 0);
  device(21, "Showroom iPad", { member: "Shared", platform: "iPadOS 18", trusted: true, lastSeenAt: at(6), firstSeenAt: at(6_000), note: "Shared showroom device. Signs out after 12 hours." }, "trusted", 6);
  device(22, "Unknown laptop", { member: "Maya Chen", platform: "Windows 11", trusted: false, lastSeenAt: at(10), firstSeenAt: at(11), note: "First seen 11 hours ago. Not recognised." }, "untrusted", 10);
  device(23, "Studio desktop", { member: "Jonah Adeyemi", platform: "Linux", trusted: true, lastSeenAt: at(1), firstSeenAt: at(12_000), note: "Finance desk." }, "trusted", 1);
  device(24, "Workshop desktop", { member: "Rowan Pike", platform: "Windows 10", trusted: false, lastSeenAt: at(1_890), firstSeenAt: at(16_000), note: "Access removed with the suspension." }, "blocked", 1_890);

  /* ---------------- Budgets and AI usage ---------------- */
  const budget = (n: number, title: string, summary: string, amountMinor: number, fields: Record<string, string | number | boolean>, status = "active") =>
    records.push(ctx.rec({ org: "nl", collection: "budgets", n, title, status, summary, amountMinor, fields, tags: [String(fields.kind)] }));

  budget(20, "Company AI quota", "No model provider is connected, so no token spend has been recorded against it.", 50_000, {
    kind: "aiQuota", period: "month", scope: "company", committedMinor: 0, reservedMinor: 0, provider: "model.inference", usageKnown: false,
  });
  budget(21, "Mission spend cap", "Committed against local supplier quotes by the autumn showroom mission.", 200_000, {
    kind: "missionCap", period: "mission", scope: "nl-missions-001", committedMinor: 86_000, reservedMinor: 24_000, provider: "local", usageKnown: true,
  });
  budget(22, "Finance department tools", "Spreadsheet and reconciliation tooling for the finance desk.", 12_000, {
    kind: "toolSpend", period: "month", scope: "nl-departments-002", committedMinor: 7_400, reservedMinor: 0, provider: "local", usageKnown: true,
  });
  budget(23, "Creative department tools", "Asset storage and rendering, all local to this browser.", 9_000, {
    kind: "toolSpend", period: "month", scope: "nl-departments-001", committedMinor: 3_150, reservedMinor: 1_200, provider: "local", usageKnown: true,
  });
  budget(24, "Provider charges", "Would hold invoices from connected providers. None is connected.", 0, {
    kind: "providerSpend", period: "month", scope: "company", committedMinor: 0, reservedMinor: 0, provider: "none", usageKnown: false, lagDays: 2,
  });

  /* ---------------- Subscription invoices ---------------- */
  const bill = (n: number, title: string, summary: string, amountMinor: number, status: string, hoursAgo: number, fields: Record<string, string | number | boolean>) =>
    records.push(ctx.rec({ org: "nl", collection: "billingInvoices", n, title, status, summary, amountMinor, at: at(hoursAgo), fields }));

  bill(20, "ARL-2026-0004", "Studio plan, 8 seats, annual term.", 230_400, "unpaid", 2, { period: "This year", seats: 8, agentSeats: 4, processor: "not_connected", dueAt: inDays(12), lines: "8 seats × £24.00/mo × 12" });
  bill(21, "ARL-2025-0003", "Studio plan, 6 seats, annual term.", 172_800, "paid_locally", 8_800, { period: "Last year", seats: 6, agentSeats: 2, processor: "not_connected", paidAt: at(8_700), lines: "6 seats × £24.00/mo × 12" });
  bill(22, "ARL-2025-0002", "Studio plan upgrade, pro-rated.", 43_200, "paid_locally", 12_000, { period: "Upgrade", seats: 2, agentSeats: 0, processor: "not_connected", paidAt: at(11_900), lines: "2 seats × £24.00/mo × 9 months" });
  bill(23, "ARL-2024-0001", "Starter plan, 3 seats.", 64_800, "paid_locally", 20_000, { period: "First year", seats: 3, agentSeats: 0, processor: "not_connected", paidAt: at(19_900), lines: "3 seats × £18.00/mo × 12" });

  /* ---------------- Privacy requests ---------------- */
  const request = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number, dueAt: string) =>
    records.push(ctx.rec({ org: "nl", collection: "dataRequests", n, title, status, summary, at: at(hoursAgo), dueAt, fields, tags: [String(fields.type)] }));

  request(20, "Sam Okafor — copy of their data", "Client asked for everything held about them and their hotel group.", {
    type: "access", subject: "Lumen Hotel Group (Sam Okafor)", channel: "Email, recorded by Priya", lawfulBasis: "UK GDPR Article 15",
    collections: "contacts,companies,quotes,invoices,bookings,tickets", recordCount: 34, legalHold: false, handler: "Maya Chen",
  }, "open", 40, inDays(21));
  request(21, "Rowan Pike — erasure of personal data", "Former workshop member asked to be removed.", {
    type: "erasure", subject: "Rowan Pike", channel: "In person, recorded by Elena", lawfulBasis: "UK GDPR Article 17",
    collections: "members,employees,payrollRuns,leaveRequests", recordCount: 11, legalHold: true,
    holdReason: "Employment records are kept six years, and a grievance file from September is open.", handler: "Elena Voss",
  }, "open", 90, inDays(8));
  request(22, "Dana Rees — correct a supplier contact", "Supplier contact asked for a corrected job title and phone number.", {
    type: "rectification", subject: "Hollis Metalwork (Dana Rees)", channel: "Portal message", lawfulBasis: "UK GDPR Article 16",
    collections: "contacts,suppliers", recordCount: 3, legalHold: false, handler: "Jonah Adeyemi",
  }, "completed", 400, at(380));
  request(23, "Amara Diallo — portable copy of her records", "Weekend assistant asked for a machine-readable copy before a course application.", {
    type: "portability", subject: "Amara Diallo", channel: "Direct message", lawfulBasis: "UK GDPR Article 20",
    collections: "members,shifts,tasks", recordCount: 46, legalHold: false, handler: "Elena Voss",
  }, "open", 14, inDays(26));

  /* ---------------- Backups, exports, restores ---------------- */
  const backup = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number) =>
    records.push(ctx.rec({ org: "nl", collection: "backups", n, title, status, summary, at: at(hoursAgo), fields, tags: [String(fields.kind)] }));

  backup(20, "Nightly snapshot", "Written to this browser's storage. Not copied anywhere else.", {
    kind: "snapshot", records: 612, bytes: 1_942_000, destination: "This browser", retainUntil: inDays(14), verified: true, durationSeconds: 3,
  }, "ok", 9);
  backup(21, "Nightly snapshot", "Previous night's snapshot, still inside the retention window.", {
    kind: "snapshot", records: 604, bytes: 1_910_400, destination: "This browser", retainUntil: inDays(13), verified: true, durationSeconds: 3,
  }, "ok", 33);
  backup(22, "Pre-close export", "Full JSON export downloaded before the October close.", {
    kind: "export", records: 598, bytes: 1_880_000, destination: "Downloads folder", format: "json", requestedBy: "Jonah Adeyemi", reason: "October close evidence", verified: true,
  }, "ok", 320);
  backup(23, "Weekly snapshot", "Failed before anything was written.", {
    kind: "snapshot", records: 0, bytes: 0, destination: "This browser", failureReason: "Browser storage quota reached at 78% of the estimate.", retryable: true,
  }, "failed", 170);
  backup(24, "Restore rehearsal", "Dry run against the previous night's snapshot. No record was overwritten.", {
    kind: "restore", records: 604, bytes: 1_910_400, source: "Nightly snapshot", mode: "dry_run", newerRecords: 18, plan: "approved", requestedBy: "Maya Chen",
  }, "ok", 28);
  backup(25, "Restore rehearsal", "Blocked: 18 records had changed since the snapshot and no plan was approved.", {
    kind: "restore", records: 604, bytes: 1_910_400, source: "Nightly snapshot", mode: "dry_run", newerRecords: 18, plan: "missing", requestedBy: "Nia Okonkwo",
    failureReason: "A restore may not overwrite newer changes without an approved plan.",
  }, "blocked", 120);

  /* ---------------- Developer access ---------------- */
  const key = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number) =>
    records.push(ctx.rec({ org: "nl", collection: "apiKeys", n, title, status, summary, at: at(hoursAgo), fields }));

  key(20, "Showroom tablet reader", "Read-only key for the showroom tablet's catalogue view.", {
    prefix: "arl_live_7f2a", last4: "9c41", scopes: "records:read", environment: "live", createdBy: "Maya Chen", lastUsedAt: at(6), expiresAt: inDays(60), shownOnce: true,
  }, "active", 2_000);
  key(21, "Ledger export job", "Used by the nightly export rehearsal.", {
    prefix: "arl_live_b104", last4: "22de", scopes: "records:read,export:write", environment: "live", createdBy: "Jonah Adeyemi", lastUsedAt: at(33), expiresAt: inDays(14), shownOnce: true,
  }, "active", 5_000);
  key(22, "Sandbox experiment", "Rotated after it appeared in a shared document.", {
    prefix: "arl_test_3e90", last4: "5b77", scopes: "records:read,records:write", environment: "sandbox", createdBy: "Maya Chen", lastUsedAt: at(900), rotatedAt: at(880), shownOnce: true,
  }, "rotated", 1_400);
  key(23, "Old integration key", "Revoked when the integration was dropped.", {
    prefix: "arl_live_a55c", last4: "01f3", scopes: "records:read,records:write,export:write", environment: "live", createdBy: "Maya Chen", revokedAt: at(2_200), revokedBy: "Maya Chen", shownOnce: true,
  }, "revoked", 6_000);

  const hook = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status: string) =>
    records.push(ctx.rec({ org: "nl", collection: "webhooks", n, title, status, summary, fields }));

  hook(20, "https://hooks.northline.example/invoice-paid", "Would be called when an invoice is marked paid. Never called: nothing posts from this browser.", {
    events: "invoice.paid,invoice.voided", secretPrefix: "whsec_1d", attempts: 0, failures: 0, environment: "live", createdBy: "Maya Chen",
  }, "disabled");
  hook(21, "https://hooks.northline.example/order-created", "Order events. Disabled while no processor is connected.", {
    events: "order.created,order.paid", secretPrefix: "whsec_9a", attempts: 0, failures: 0, environment: "live", createdBy: "Jonah Adeyemi",
  }, "disabled");
  hook(22, "https://localhost:4000/dev", "Local development endpoint used for a shape check.", {
    events: "record.updated", secretPrefix: "whsec_c4", attempts: 0, failures: 0, environment: "sandbox", createdBy: "Maya Chen",
  }, "disabled");

  /* ---------------- Audit events (append-only) ---------------- */
  const evt = (n: number, hoursAgo: number, actor: string, type: string, message: string, extra: Partial<Audit> = {}) =>
    events.push({
      id: `nl-audit-${String(n).padStart(3, "0")}`,
      organizationId: ORG_NORTHLINE,
      at: at(hoursAgo),
      actor,
      type,
      message,
      ...extra,
    });

  evt(20, 0.5, "Maya Chen", "access.session_started", "Signed in on MacBook Pro from London.", { entityId: "nl-sessions-020", screenId: "ARL-ADMIN-006", capability: "ready_local" });
  evt(21, 2, "Idris Cole", "ai.journal_drafted", "Prepared JRN-0008 from the October timesheets and requested approval.", { entityId: "nl-journals-008", screenId: "ARL-FIN-010", capability: "ready_local" });
  evt(22, 2, "Idris Cole", "ai.approval_requested", "Asked for a posting decision on JRN-0008. The agent holds no posting grant.", { entityId: "nl-approvals-020", screenId: "ARL-INBOX-002", capability: "blocked" });
  evt(23, 3, "Nia Okonkwo", "ai.mission_planned", "Drafted the autumn showroom plan and stopped before committing spend.", { entityId: "nl-missions-001", screenId: "ARL-MISSION-002", capability: "ready_local" });
  evt(24, 4, "Maya Chen", "policy.grant_changed", "Raised the autumn showroom mission cap to £2,000.", { entityId: "nl-policies-029", screenId: "ARL-ADMIN-004", capability: "ready_local" });
  evt(25, 6, "Jonah Adeyemi", "financial.journal_posted", "Posted JRN-0007 Rent for November.", { entityId: "nl-journals-007", screenId: "ARL-FIN-010", capability: "ready_local" });
  evt(26, 8, "Jonah Adeyemi", "financial.bill_matched", "Matched BILL-220 to PO-118 and the goods receipt.", { entityId: "nl-bills-001", screenId: "ARL-PROC-004", capability: "ready_local" });
  evt(27, 10, "Maya Chen", "access.session_started", "Signed in on an unrecognised Windows laptop without a second factor.", { entityId: "nl-sessions-022", screenId: "ARL-ADMIN-006", capability: "blocked" });
  evt(28, 11, "Maya Chen", "access.session_started", "Second sign-in from the same unrecognised laptop four minutes later.", { entityId: "nl-sessions-023", screenId: "ARL-ADMIN-006", capability: "blocked" });
  evt(29, 12, "Priya Shah", "data.export_requested", "Asked to export 412 contacts for the showroom event.", { entityId: "nl-approvals-025", screenId: "ARL-ADMIN-007", capability: "queued_local" });
  evt(30, 13, "Maya Chen", "data.export_authorised", "Authorised the contact export, name and email only, for 90 days of event use.", { entityId: "nl-approvals-025", screenId: "ARL-ADMIN-007", capability: "ready_local" });
  evt(31, 14, "Remy Alves", "ai.reply_drafted", "Drafted a reply to CARE-19 from the approved shade article.", { entityId: "nl-tickets-001", screenId: "ARL-CARE-003", capability: "ready_local" });
  evt(32, 16, "system", "capability.blocked", "Two card payments could not be taken: no processor is connected.", { entityId: "nl-orders-001", screenId: "ARL-COMMERCE-006", capability: "not_connected" });
  evt(33, 20, "Elena Voss", "people.record_updated", "Updated leave balances for four people after the October review.", { entityId: "nl-employees-001", screenId: "ARL-HR-003", capability: "ready_local" });
  evt(34, 26, "system", "delivery.held", "Nine outbound messages stayed as drafts: no mail provider is connected.", { screenId: "ARL-INBOX-006", capability: "not_connected" });
  evt(35, 28, "Maya Chen", "recovery.restore_rehearsed", "Ran a restore rehearsal against last night's snapshot. No record was overwritten.", { entityId: "nl-backups-024", screenId: "ARL-ADMIN-010", capability: "ready_local" });
  evt(36, 33, "Priya Shah", "sales.quote_sent", "Marked the Lumen quote as sent by hand after the mail draft was printed.", { entityId: "nl-quotes-001", screenId: "ARL-CRM-008", capability: "ready_local" });
  evt(37, 48, "Maya Chen", "policy.role_drafted", "Accepted a least-privilege draft for a bookkeeper role, not yet published.", { entityId: "nl-policies-021", screenId: "ARL-ADMIN-003", capability: "ready_local" });
  evt(38, 90, "Elena Voss", "privacy.request_received", "Recorded an erasure request from Rowan Pike.", { entityId: "nl-dataRequests-021", screenId: "ARL-ADMIN-008", capability: "queued_local" });
  evt(39, 92, "Elena Voss", "privacy.hold_applied", "Applied a legal hold: employment records and an open grievance file.", { entityId: "nl-dataRequests-021", screenId: "ARL-ADMIN-008", capability: "blocked" });
  evt(40, 120, "Nia Okonkwo", "recovery.restore_blocked", "A restore was blocked: 18 records were newer than the snapshot and no plan was approved.", { entityId: "nl-backups-025", screenId: "ARL-ADMIN-010", capability: "blocked" });
  evt(41, 170, "system", "recovery.backup_failed", "A weekly snapshot failed at the browser storage quota.", { entityId: "nl-backups-023", screenId: "ARL-ADMIN-010", capability: "failed" });
  evt(42, 880, "Maya Chen", "developer.key_rotated", "Rotated the sandbox key after it appeared in a shared document.", { entityId: "nl-apiKeys-022", screenId: "ARL-ADMIN-011", capability: "ready_local" });
  evt(43, 1_880, "Maya Chen", "access.session_revoked", "Revoked Rowan Pike's workshop session and suspended the account.", { entityId: "nl-sessions-026", screenId: "ARL-ADMIN-002", capability: "ready_local" });
  evt(44, 2_200, "Maya Chen", "developer.key_revoked", "Revoked the old integration key when the integration was dropped.", { entityId: "nl-apiKeys-023", screenId: "ARL-ADMIN-011", capability: "ready_local" });

  return { records, events };
});
