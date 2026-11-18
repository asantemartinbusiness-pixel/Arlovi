import { registerSeed } from "@/domain/seedRegistry";

/**
 * Headquarters fixtures. The base seed carries two departments and six members;
 * a company this product is meant to run needs enough structure for the
 * directory, chart, goals, locations and timeline to be worth looking at.
 */
registerSeed("hq", (ctx) => {
  const records = [
    ctx.rec({ org: "nl", collection: "departments", n: 20, title: "Workshop", summary: "Fabrication, finishing and quality.", fields: { lead: "Theo Marsh", members: 3 } }),
    ctx.rec({ org: "nl", collection: "departments", n: 21, title: "People & Operations", summary: "Hiring, payroll, workplace and policy.", fields: { lead: "Elena Voss", members: 2 } }),

    ctx.rec({ org: "nl", collection: "members", n: 20, title: "Theo Marsh", summary: "Workshop lead. Runs fabrication and finishing.", fields: { kind: "human", role: "member", departmentId: "nl-departments-020", title: "Workshop lead" }, tags: ["human"] }),
    ctx.rec({ org: "nl", collection: "members", n: 21, title: "Sable Nguyen", summary: "Product photography and showroom styling.", fields: { kind: "human", role: "member", departmentId: "nl-departments-001", title: "Studio photographer" }, tags: ["human"] }),
    ctx.rec({ org: "nl", collection: "members", n: 22, title: "Rowan Hale", summary: "Finishing and assembly.", fields: { kind: "human", role: "member", departmentId: "nl-departments-020", title: "Finisher" }, tags: ["human"] }),
    ctx.rec({ org: "nl", collection: "members", n: 23, title: "Ada Fernsby", summary: "Commercial support and showroom diary.", fields: { kind: "human", role: "sales", departmentId: "nl-departments-002", title: "Commercial coordinator" }, tags: ["human"] }),
    ctx.rec({ org: "nl", collection: "members", n: 24, title: "Soren Vale", summary: "Research agent. Reads only permitted sources in this workspace.", fields: { kind: "ai", role: "agent", departmentId: "nl-departments-001", title: "Research agent", agentId: "nl-agents-003" }, tags: ["ai"] }),
    ctx.rec({ org: "nl", collection: "members", n: 25, title: "Juno Pike", summary: "Customer care agent. Drafts replies from approved articles.", fields: { kind: "ai", role: "agent", departmentId: "nl-departments-002", title: "Care agent", agentId: "nl-agents-004" }, tags: ["ai"] }),

    ctx.rec({
      org: "nl", collection: "objectives", n: 20, title: "Hold gross margin above 54%", status: "active",
      summary: "Material cost rises absorbed by batch purchasing, not price rises.",
      startAt: "2026-10-01T00:00:00.000Z", dueAt: "2026-12-31T00:00:00.000Z",
      fields: { measure: "Gross margin %", target: 54, current: 51, baseline: 49, departmentId: "nl-departments-002" },
      body: {
        keyResults: [
          { id: "kr-1", title: "Gross margin on the last 30 days of orders", start: 49, current: 51, target: 54, unit: "%", owner: "Jonah Adeyemi" },
          { id: "kr-2", title: "Brass bought on batch contracts", start: 20, current: 55, target: 80, unit: "%", owner: "Theo Marsh" },
          { id: "kr-3", title: "Quotes repriced to the winter list", start: 0, current: 14, target: 20, unit: "quotes", owner: "Priya Shah" },
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "objectives", n: 21, title: "Cut lead time to fourteen days", status: "active",
      summary: "From order confirmation to dispatch, measured on the last ten orders.",
      startAt: "2026-09-01T00:00:00.000Z", dueAt: "2026-12-15T00:00:00.000Z",
      fields: { measure: "Days", target: 14, current: 19, baseline: 22, departmentId: "nl-departments-020" },
      body: {
        keyResults: [
          { id: "kr-1", title: "Median days from order to dispatch", start: 22, current: 19, target: 14, unit: "days", owner: "Theo Marsh" },
          { id: "kr-2", title: "Finishing queue older than five days", start: 9, current: 6, target: 0, unit: "orders", owner: "Rowan Hale" },
        ],
      },
    }),
    ctx.rec({ org: "nl", collection: "objectives", n: 22, title: "Open a second showroom", status: "proposed", summary: "Shortlist of three sites, decision in the new year.", fields: { measure: "Sites signed", target: 1, current: 0 } }),
    ctx.rec({ org: "nl", collection: "objectives", n: 23, title: "Replace solvent lacquer", status: "achieved", summary: "Water-based finish qualified on the whole Arc range.", fields: { measure: "Ranges converted", target: 3, current: 3 } }),

    ctx.rec({ org: "nl", collection: "locations", n: 20, title: "Hackney workshop", summary: "Mon–Fri 08:00–17:00.", fields: { timezone: "Europe/London", kind: "workshop" } }),
    ctx.rec({ org: "nl", collection: "locations", n: 21, title: "Rotterdam fulfilment", summary: "Mon–Fri 09:00–17:00 CET.", fields: { timezone: "Europe/Amsterdam", kind: "warehouse" } }),

    ctx.rec({ org: "nl", collection: "legalEntities", n: 20, title: "Northline Atelier Ltd", summary: "England and Wales, company 11842207.", fields: { jurisdiction: "GB", number: "11842207" } }),

    ctx.rec({ org: "nl", collection: "timelineEvents", n: 20, title: "Water-based finish qualified", at: "2026-09-18T10:00:00.000Z", summary: "Workshop signed off the new lacquer on the Arc range after six weeks of testing.", fields: { kind: "technology" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 21, title: "Theo Marsh joined as workshop lead", at: "2026-08-04T09:00:00.000Z", summary: "Fabrication and finishing brought under one lead.", fields: { kind: "people" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 22, title: "Rotterdam fulfilment opened", at: "2026-07-21T09:00:00.000Z", summary: "European orders now ship from Rotterdam rather than Hackney.", fields: { kind: "decision", decidedBy: "Maya Chen", linkedId: "nl-locations-021", linkedTitle: "Rotterdam fulfilment", linkedRoute: "/o/:org/hq/locations" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 25, title: "Qualify a second brass supplier", at: "2026-10-20T10:00:00.000Z", summary: "One supplier covers 80% of brass. Two candidates sampled; Hollis Metalwork goes to a trial order before the new year.", fields: { kind: "decision", decidedBy: "Theo Marsh", recordedBy: "Maya Chen", linkedId: "nl-risks-020", linkedTitle: "Single brass supplier", linkedRoute: "/o/:org/hq/company?tab=Compliance", reviewBy: "2026-11-10T09:00:00.000Z" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 26, title: "Winter prices apply to new quotes only", at: "2026-10-11T15:00:00.000Z", summary: "Open quotes keep the autumn list so no client sees a price move mid-conversation.", fields: { kind: "decision", decidedBy: "Priya Shah", recordedBy: "Priya Shah", linkedId: "nl-objectives-020", linkedTitle: "Hold gross margin above 54%", linkedRoute: "/o/:org/hq/goals", reviewBy: "2027-01-15T09:00:00.000Z" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 23, title: "Price list revised for the winter range", at: "2026-10-12T09:00:00.000Z", summary: "Average increase of four percent, applied to new quotes only.", fields: { kind: "financial" } }),
    ctx.rec({ org: "nl", collection: "timelineEvents", n: 24, title: "Showroom diary moved into Arlovi", at: "2026-10-02T11:00:00.000Z", summary: "Appointments kept in this workspace rather than a shared spreadsheet.", fields: { kind: "technology" } }),

    ctx.rec({ org: "nl", collection: "risks", n: 20, title: "Single brass supplier", status: "open", summary: "One supplier covers 80% of brass. A second source is being qualified.", fields: { severity: "high", owner: "Theo Marsh" } }),
    ctx.rec({ org: "nl", collection: "risks", n: 21, title: "Showroom lease renewal", status: "monitoring", summary: "Clerkenwell lease ends in fourteen months.", fields: { severity: "medium", owner: "Maya Chen" } }),

    ctx.rec({ org: "hb", collection: "departments", n: 20, title: "Operations", summary: "Warehouse, dispatch and returns.", fields: { lead: "Elena Ward", members: 2 } }),
    ctx.rec({ org: "hb", collection: "members", n: 20, title: "Marcus Oyelaran", summary: "Warehouse and dispatch.", fields: { kind: "human", role: "member", departmentId: "hb-departments-020", title: "Operations lead" }, tags: ["human"] }),
    ctx.rec({ org: "hb", collection: "objectives", n: 20, title: "Ship same day on stocked lines", status: "active", summary: "Orders placed before 14:00 leave the same day.", fields: { measure: "Same-day %", target: 95, current: 88 } }),
    ctx.rec({ org: "hb", collection: "locations", n: 20, title: "Red Hook warehouse", summary: "Mon–Fri 07:00–16:00.", fields: { timezone: "America/New_York", kind: "warehouse" } }),
    ctx.rec({ org: "hb", collection: "timelineEvents", n: 20, title: "Harbor Supply opened its workspace", at: "2026-10-02T09:00:00.000Z", summary: "Separate records, separate ledger, separate currency.", fields: { kind: "decision" } }),
  ];
  return { records };
});
