import { registerSeed } from "@/domain/seedRegistry";

/**
 * One connector record per capability in src/platform/capability.ts that the
 * base seed does not already cover (it has bank, email and payments for
 * Northline), plus the full set for Harbor and one custom adapter draft.
 * Every record carries `capabilityId` so the directory resolves it exactly.
 */
registerSeed("connect", (context) => {
  const now = new Date(context.now);
  const day = 86_400_000;
  const iso = (offsetDays: number) => new Date(now.getTime() - offsetDays * day).toISOString();

  const northlineExtra: { n: number; title: string; capabilityId: string; provider: string; summary: string }[] = [
    { n: 20, title: "VAT filing", capabilityId: "tax.file", provider: "tax", summary: "Returns are prepared from posted journals. Submission needs an authorised filing connection." },
    { n: 21, title: "Language model", capabilityId: "model.inference", provider: "model", summary: "Answers are composed from records in this workspace, with the records named." },
    { n: 22, title: "Site hosting", capabilityId: "site.publish", provider: "hosting", summary: "Sites export as real HTML. Serving them needs a host." },
    { n: 23, title: "Calendar", capabilityId: "calendar.sync", provider: "calendar", summary: "Bookings live here and export as an ICS file." },
    { n: 24, title: "Voice and SMS", capabilityId: "telephony", provider: "telephony", summary: "Call notes and message drafts are recorded against the customer." },
  ];

  const harborAll: { n: number; title: string; capabilityId: string; provider: string; summary: string }[] = [
    { n: 20, title: "Bank feed", capabilityId: "bank.feed", provider: "bank", summary: "Statement lines are imported from CSV and reconciled by hand." },
    { n: 21, title: "Mailbox", capabilityId: "email.send", provider: "email", summary: "Counter replies stay as drafts against the customer." },
    { n: 22, title: "Card payments", capabilityId: "payment.capture", provider: "payments", summary: "Counter orders are held as awaiting payment with full line detail." },
    { n: 23, title: "Sales tax filing", capabilityId: "tax.file", provider: "tax", summary: "The New York return is prepared from posted journals." },
    { n: 24, title: "Language model", capabilityId: "model.inference", provider: "model", summary: "Answers cite the records they came from." },
    { n: 25, title: "Site hosting", capabilityId: "site.publish", provider: "hosting", summary: "The catalog site exports as HTML." },
    { n: 26, title: "Calendar", capabilityId: "calendar.sync", provider: "calendar", summary: "Collection slots are tracked in the workspace." },
    { n: 27, title: "Voice and SMS", capabilityId: "telephony", provider: "telephony", summary: "Counter calls are written up by hand." },
  ];

  return {
    records: [
      ...northlineExtra.map((entry) => context.rec({
        org: "nl", collection: "connectors", n: entry.n, title: entry.title,
        status: "not_connected",
        summary: entry.summary,
        createdAt: iso(70),
        fields: { capability: "not_connected", capabilityId: entry.capabilityId, provider: entry.provider, kind: "capability" },
      })),
      ...harborAll.map((entry) => context.rec({
        org: "hb", collection: "connectors", n: entry.n, title: entry.title, owner: "Elena Ward",
        status: "not_connected",
        summary: entry.summary,
        createdAt: iso(50),
        fields: { capability: "not_connected", capabilityId: entry.capabilityId, provider: entry.provider, kind: "capability" },
      })),
      context.rec({
        org: "nl", collection: "connectors", n: 30, title: "Thames Brass order desk",
        status: "draft",
        summary: "A draft adapter for the brass supplier's order desk. Declaration written, contract tests pass, no provider reachable.",
        createdAt: iso(14),
        fields: { capability: "configuration_required", kind: "custom", provider: "supplier" },
        body: {
          operations: [
            { name: "send_order", kind: "action", scopes: ["orders.write"], localEquivalent: "The purchase order is prepared and left awaiting approval." },
            { name: "list_prices", kind: "read", scopes: ["catalogue.read"], localEquivalent: "Prices come from the supplier record and the last paper price list." },
          ],
        },
      }),
      context.rec({
        org: "nl", collection: "conflicts", n: 20, title: "Two prices for the brass collar",
        status: "open",
        summary: "The supplier record says £14.20 and the November price list says £15.00. No feed exists to settle it, so both are kept until someone chooses.",
        createdAt: iso(9),
        fields: { source: "supplier record", other: "price list" },
      }),
    ],
    events: [
      {
        id: "nl-connect-event-1",
        organizationId: context.northline,
        at: iso(5),
        actor: "Maya Chen",
        type: "capability",
        message: "Authorisation attempted for Send email: stopped before the provider redirect. No grant, no token, no connection.",
        screenId: "ARL-CONNECT-003",
        capability: "not_connected" as const,
      },
      {
        id: "nl-connect-event-2",
        organizationId: context.northline,
        at: iso(5),
        actor: "Maya Chen",
        type: "capability",
        message: "Connector health test: 2 local checks passed, 2 not met, 1 not attempted. No provider was contacted.",
        screenId: "ARL-CONNECT-008",
        capability: "not_connected" as const,
      },
      {
        id: "nl-connect-event-3",
        organizationId: context.northline,
        at: iso(3),
        actor: "Jonah Adeyemi",
        type: "capability",
        message: "Mapping recorded: Bank feed lands in bankTransactions, matched on provider transaction id.",
        screenId: "ARL-CONNECT-007",
        capability: "ready_local" as const,
      },
    ],
  };
});
