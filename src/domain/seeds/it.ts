import { registerSeed } from "@/domain/seedRegistry";

/** Incidents, runbooks and release attempts for the operations console. Incident numbers start at 50 so they do not collide with the inbox seed, which uses 20–23. */
registerSeed("it", (context) => {
  const now = new Date(context.now);
  const day = 86_400_000;
  const iso = (offsetDays: number, hour = 9) => {
    const date = new Date(now.getTime() - offsetDays * day);
    date.setUTCHours(hour, 40, 0, 0);
    return date.toISOString();
  };

  return {
    records: [
      context.rec({
        org: "nl", collection: "incidents", n: 50, title: "INC-11 Storage persistence was never granted",
        status: "open",
        summary: "The browser has not granted persistent storage for this origin, so the workspace can be evicted under storage pressure.",
        at: iso(6), createdAt: iso(6),
        fields: {
          kind: "incident", severity: "high", service: "Storage", origin: "ours", owner: "Maya Chen",
          impact: "Every record in this browser could be cleared without warning. The backup export is the only mitigation.",
          cause: "no persistence grant",
        },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 51, title: "INC-10 Quote reminders never left the workspace",
        status: "awaiting_user",
        summary: "A workflow prepared three reminder drafts. With no mail provider connected they stayed as drafts, which is correct but was not noticed for a week.",
        at: iso(13), createdAt: iso(13),
        fields: {
          kind: "incident", severity: "medium", service: "Connectors", origin: "ours", owner: "Jonah Adeyemi",
          connectorId: "nl-connectors-002",
          impact: "Three customers were not chased. The drafts are intact.",
          cause: "capability not connected",
        },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 52, title: "INC-9 Site publish stopped at the hosting boundary",
        status: "resolved",
        summary: "A publish attempt for northline.co.uk was recorded as blocked. The export was taken instead and the pages were reviewed from the file.",
        at: iso(27), endAt: iso(26), createdAt: iso(27),
        fields: {
          kind: "incident", severity: "low", service: "Site export", origin: "ours", owner: "Maya Chen",
          impact: "No site went live. The export was complete.",
          cause: "capability not connected",
          verifiedBy: "Maya Chen",
          postmortem: "Publishing was attempted before a host existed. The attempt was recorded as blocked rather than as a failure, and the HTML export served the review instead. Nothing was lost. The fix is to connect a host; until then the publish review names the export as the outcome, which is what happened here.",
        },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 53, title: "INC-8 Clock skew on a shared machine",
        status: "resolved",
        summary: "The showroom machine's clock was forty minutes behind, so three records were dated wrongly before anyone noticed.",
        at: iso(44), endAt: iso(43), createdAt: iso(44),
        fields: {
          kind: "incident", severity: "medium", service: "Workspace", origin: "ours", owner: "Theo Marsh",
          impact: "Three task due dates were an hour out.",
          cause: "device clock",
          verifiedBy: "Theo Marsh",
          postmortem: "The device clock had drifted. The diagnostics now compare the workspace clock with the device clock on every run, so the same drift would be reported rather than discovered through a wrong date.",
        },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 30, title: "Verify the workspace before closing an incident",
        status: "active",
        summary: "Read the storage estimate, write and read back one row, run the indexed query, compare the clocks and detect the browser features the interface needs.",
        createdAt: iso(60),
        fields: { kind: "runbook", allowed: true, runbookId: "diagnostics" },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 31, title: "Take a backup before a risky change",
        status: "active",
        summary: "Export every record and event as JSON, confirm the counts match, and keep the file outside this browser.",
        createdAt: iso(60),
        fields: { kind: "runbook", allowed: true, runbookId: "backup" },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 40, title: "Site export · northline.co.uk",
        status: "blocked",
        summary: "Checks passed. Promotion to production stopped at the hosting boundary.",
        at: iso(4), createdAt: iso(4),
        fields: { kind: "release", environment: "production", gates: "quality clear, no verified domain" },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 41, title: "Consultation desk · model snapshot",
        status: "staging",
        summary: "A snapshot of the app model taken for review. No runtime received it.",
        at: iso(11), createdAt: iso(11),
        fields: { kind: "release", environment: "staging", gates: "model checks clear" },
      }),
      context.rec({
        org: "nl", collection: "incidents", n: 42, title: "Trade application form · version 3",
        status: "released",
        summary: "Published inside the workspace. Submissions from then on record version 3.",
        at: iso(18), createdAt: iso(18),
        fields: { kind: "release", environment: "workspace", gates: "labels, options and branches clear" },
      }),
      context.rec({
        org: "nl", collection: "it_changes", n: 20, title: "Move the showroom diary to the shared calendar",
        status: "submitted", owner: "Maya Chen",
        summary: "Export bookings as ICS and import them into the shared studio calendar.",
        at: iso(2), createdAt: iso(2),
        fields: {
          requestedBy: "Maya Chen", scope: "team", reversible: true, tested: false, target: "remote",
          plan: "Export bookings as ICS and import them into the shared studio calendar.",
          rollbackPlan: "Delete the imported events; the bookings remain the source in this workspace.",
          window: iso(-3).slice(0, 10), risk: "medium", riskScore: 2,
        },
      }),
      context.rec({
        org: "nl", collection: "it_changes", n: 21, title: "Turn on the retention policy for trade applications",
        status: "draft", owner: "Maya Chen",
        summary: "Apply the 540-day retention period to the trade application form.",
        at: iso(1), createdAt: iso(1),
        fields: {
          requestedBy: "Maya Chen", scope: "workspace", reversible: true, tested: true, target: "local",
          plan: "Apply the 540-day retention period to the trade application form.", rollbackPlan: "", window: "",
        },
      }),
      context.rec({
        org: "nl", collection: "it_assets", n: 20, title: "northline.co.uk domain", status: "active", owner: "Maya Chen",
        summary: "Registered with an external registrar.", createdAt: iso(40),
        fields: { kind: "domain", location: "remote", owner: "Maya Chen", verifiedAt: iso(20), verifiedBy: "Maya Chen", verifiedNote: "Registrar shows renewal due next spring." },
        body: { config: [{ key: "registrar", value: "External, not connected" }, { key: "auto_renew", value: "on" }] },
      }),
      context.rec({
        org: "nl", collection: "it_assets", n: 21, title: "Showroom laptop", status: "active", owner: "Ada Fernsby",
        summary: "Used for the showroom diary and counter.", createdAt: iso(40),
        fields: { kind: "device", location: "remote", owner: "Ada Fernsby" },
        body: { config: [{ key: "disk_encryption", value: "unknown" }, { key: "os", value: "unknown" }] },
      }),
      context.rec({
        org: "nl", collection: "it_assets", n: 22, title: "Workspace backup policy", status: "active", owner: "Maya Chen",
        summary: "How often the workspace is exported from this browser.", createdAt: iso(40),
        fields: { kind: "configuration", location: "local", owner: "Maya Chen" },
        body: { config: [{ key: "frequency", value: "weekly" }, { key: "keep", value: "4 exports" }] },
      }),
      context.rec({
        org: "hb", collection: "incidents", n: 20, title: "INC-4 Counter orders cannot take a card",
        status: "open", owner: "Elena Ward",
        summary: "Orders are held as awaiting payment. No processor is connected, which is correct but leaves the counter reconciling by hand.",
        at: iso(8), createdAt: iso(8),
        fields: {
          kind: "incident", severity: "medium", service: "Connectors", origin: "ours", owner: "Elena Ward",
          impact: "Every counter order is reconciled against the bank line by hand.",
          cause: "capability not connected",
        },
      }),
    ],
    events: [
      {
        id: "nl-it-event-1",
        organizationId: context.northline,
        at: iso(6, 10),
        actor: "Maya Chen",
        type: "diagnostic",
        message: "Diagnostics run: 14 passed, 2 to review, 0 failed, 1 could not be measured in a browser.",
        screenId: "ARL-IT-004",
      },
      {
        id: "nl-it-event-2",
        organizationId: context.northline,
        at: iso(6, 11),
        actor: "Maya Chen",
        type: "export",
        message: "Workspace backup exported: 318 records and 44 events.",
        screenId: "ARL-IT-004",
      },
      {
        id: "nl-it-event-3",
        organizationId: context.northline,
        at: iso(26, 14),
        actor: "Maya Chen",
        type: "diagnostic",
        message: "Diagnostics run: 15 passed, 1 to review, 0 failed, 1 could not be measured in a browser.",
        screenId: "ARL-IT-004",
      },
    ],
  };
});
