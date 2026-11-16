import { registerSeed, type SeedContext } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Projects, Portfolios & Work fixtures.
 *
 * Seven Northline projects across two programmes, with a plan that holds
 * together: milestones carry dependencies, tasks carry estimates and logged
 * hours, and the timeline dates are derived from the seed clock so the Gantt
 * always straddles today.
 * ====================================================================== */

function dayOf(now: string, offsetDays: number, hour = 9): string {
  const base = new Date(now);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hour, 0, 0, 0);
  return base.toISOString();
}

interface ProjectSeed {
  n: number; title: string; summary: string; status: string; health: string; priority: string;
  programme: string; owner: string; departmentId: string; start: number; end: number;
  budgetMinor: number; spentMinor: number;
}

const PROJECTS: ProjectSeed[] = [
  { n: 20, title: "Clerkenwell showroom refit", summary: "New track lighting, a trade counter and a quieter back office.", status: "active", health: "at_risk", priority: "high", programme: "Studio estate", owner: "Priya Shah", departmentId: "nl-departments-002", start: -34, end: 38, budgetMinor: 4_200_000, spentMinor: 2_940_000 },
  { n: 21, title: "Arc Lamp production run", summary: "Two hundred units for the winter trade list.", status: "active", health: "on_track", priority: "high", programme: "Winter 2026", owner: "Rowan Patel", departmentId: "nl-departments-030", start: -21, end: 27, budgetMinor: 3_600_000, spentMinor: 1_410_000 },
  { n: 22, title: "Trade catalogue 2027", summary: "Photography, copy and a printed price list for trade accounts.", status: "planning", health: "on_track", priority: "normal", programme: "Winter 2026", owner: "Amara Bello", departmentId: "nl-departments-002", start: 6, end: 76, budgetMinor: 1_800_000, spentMinor: 120_000 },
  { n: 23, title: "Workshop safety upgrade", summary: "Extraction, guarding and a refreshed accident procedure.", status: "active", health: "off_track", priority: "high", programme: "Studio estate", owner: "Rowan Patel", departmentId: "nl-departments-030", start: -58, end: 9, budgetMinor: 2_400_000, spentMinor: 2_610_000 },
  { n: 24, title: "Storefront refresh", summary: "Rebuild the product pages around the winter collection.", status: "active", health: "on_track", priority: "normal", programme: "Commerce", owner: "Theo Marsh", departmentId: "nl-departments-001", start: -12, end: 44, budgetMinor: 1_200_000, spentMinor: 340_000 },
  { n: 25, title: "Spring collection research", summary: "Material studies and three concept directions.", status: "planning", health: "on_track", priority: "low", programme: "Spring 2027", owner: "Fiona Buchanan", departmentId: "nl-departments-001", start: 20, end: 118, budgetMinor: 900_000, spentMinor: 0 },
  { n: 26, title: "Harrow House install", summary: "Twelve bespoke pendants for a listed townhouse.", status: "done", health: "on_track", priority: "normal", programme: "Commissions", owner: "Maya Chen", departmentId: "nl-departments-001", start: -140, end: -26, budgetMinor: 5_600_000, spentMinor: 5_310_000 },
];

interface TaskSeed {
  n: number; project: number; title: string; stage: string; assignee: string; priority: string;
  estimate: number; logged: number; start: number; end: number; kind?: "milestone";
  dependsOn?: number[]; labels?: string; summary: string; sprint: string;
  /** Planned dates when the project was baselined; omitted when they never moved. */
  baseStart?: number; baseEnd?: number;
}

const TASKS: TaskSeed[] = [
  // Clerkenwell showroom refit
  { n: 20, project: 20, title: "Measured survey signed off", stage: "done", assignee: "Theo Marsh", priority: "high", estimate: 8, logged: 9, start: -34, end: -28, kind: "milestone", summary: "Survey drawings agreed with the landlord.", sprint: "Sprint 21" },
  { n: 21, project: 20, title: "Track lighting layout", stage: "done", assignee: "Marcus Reiss", priority: "high", estimate: 14, logged: 16, start: -27, end: -18, dependsOn: [20], summary: "Three circuits, dimmable, with a spare run for the trade counter.", sprint: "Sprint 21" },
  { n: 22, project: 20, title: "Electrical first fix", stage: "doing", assignee: "Marcus Reiss", priority: "high", estimate: 24, logged: 18, start: -14, end: 4, dependsOn: [21], summary: "Contractor on site Tuesdays and Thursdays.", sprint: "Sprint 22" },
  { n: 23, project: 20, title: "Trade counter joinery", stage: "blocked", assignee: "Sable Nguyen", priority: "high", estimate: 20, logged: 4, start: -6, end: 12, baseStart: -6, baseEnd: -2, dependsOn: [21], labels: "supplier", summary: "Oak delivery slipped a fortnight. This is why the project is at risk.", sprint: "Sprint 22" },
  { n: 24, project: 20, title: "Repaint and make good", stage: "ready", assignee: "Daniel Okafor", priority: "normal", estimate: 12, logged: 0, start: 8, end: 18, baseStart: 0, baseEnd: 10, dependsOn: [22, 23], summary: "After first fix and joinery, before the reopening.", sprint: "Sprint 23" },
  { n: 25, project: 20, title: "Showroom reopens", stage: "ready", assignee: "Priya Shah", priority: "high", estimate: 0, logged: 0, start: 36, end: 38, baseStart: 22, baseEnd: 24, kind: "milestone", dependsOn: [24], summary: "Trade preview evening, then normal hours.", sprint: "Sprint 24" },
  // Arc Lamp production run
  { n: 26, project: 21, title: "Brass collar tooling ready", stage: "done", assignee: "Sable Nguyen", priority: "high", estimate: 16, logged: 15, start: -21, end: -14, kind: "milestone", summary: "Jig built and proved on ten units.", sprint: "Sprint 22" },
  { n: 27, project: 21, title: "First batch of 60", stage: "doing", assignee: "Sable Nguyen", priority: "high", estimate: 40, logged: 26, start: -13, end: 6, dependsOn: [26], summary: "Running at eleven units a day on one bench.", sprint: "Sprint 22" },
  { n: 28, project: 21, title: "Glaze test approval", stage: "review", assignee: "Maya Chen", priority: "normal", estimate: 4, logged: 4, start: -8, end: 1, summary: "Warm glaze approved for the winter run; the cool glaze is parked.", sprint: "Sprint 22" },
  { n: 29, project: 21, title: "Second batch of 140", stage: "ready", assignee: "Rowan Patel", priority: "high", estimate: 80, logged: 0, start: 7, end: 24, dependsOn: [27, 28], summary: "Needs the second bench, which is waiting on the maker hire.", sprint: "Sprint 23" },
  { n: 30, project: 21, title: "Production complete", stage: "ready", assignee: "Rowan Patel", priority: "high", estimate: 0, logged: 0, start: 25, end: 27, kind: "milestone", dependsOn: [29], summary: "Two hundred units packed and counted into stock.", sprint: "Sprint 24" },
  // Trade catalogue
  { n: 31, project: 22, title: "Shot list agreed", stage: "ready", assignee: "Amara Bello", priority: "normal", estimate: 6, logged: 0, start: 6, end: 11, summary: "Thirty products, six lifestyle sets.", sprint: "Sprint 23" },
  { n: 32, project: 22, title: "Studio photography", stage: "backlog", assignee: "Kenji Watanabe", priority: "normal", estimate: 32, logged: 0, start: 14, end: 30, dependsOn: [31], summary: "Two days in the workshop, one in the showroom.", sprint: "Sprint 24" },
  { n: 33, project: 22, title: "Copy and price list", stage: "backlog", assignee: "Amara Bello", priority: "normal", estimate: 18, logged: 0, start: 24, end: 46, dependsOn: [31], summary: "Trade prices come from the commerce price book.", sprint: "Sprint 24" },
  { n: 34, project: 22, title: "Print-ready files", stage: "backlog", assignee: "Theo Marsh", priority: "low", estimate: 10, logged: 0, start: 50, end: 72, dependsOn: [32, 33], summary: "Layout, proofing and the printer handover.", sprint: "Sprint 25" },
  // Workshop safety upgrade
  { n: 35, project: 23, title: "Extraction survey", stage: "done", assignee: "Rowan Patel", priority: "high", estimate: 8, logged: 10, start: -58, end: -50, summary: "Two bench positions failed the airflow check.", sprint: "Sprint 19" },
  { n: 36, project: 23, title: "Install new extraction", stage: "done", assignee: "Rowan Patel", priority: "high", estimate: 24, logged: 38, start: -46, end: -20, baseStart: -46, baseEnd: -34, dependsOn: [35], summary: "Ran over: the ductwork needed a structural fixing.", sprint: "Sprint 20" },
  { n: 37, project: 23, title: "Guarding on the lathe", stage: "review", assignee: "Sable Nguyen", priority: "high", estimate: 6, logged: 7, start: -16, end: -2, summary: "Fitted and awaiting a second check before sign-off.", sprint: "Sprint 22" },
  { n: 38, project: 23, title: "Rewrite the accident procedure", stage: "doing", assignee: "Elena Voss", priority: "normal", estimate: 8, logged: 5, start: -12, end: 7, summary: "Links to the published health and safety policy.", sprint: "Sprint 22" },
  { n: 39, project: 23, title: "Safety sign-off", stage: "ready", assignee: "Maya Chen", priority: "high", estimate: 0, logged: 0, start: 7, end: 9, baseStart: -12, baseEnd: -10, kind: "milestone", dependsOn: [37, 38], summary: "Final walkthrough with the whole bench present.", sprint: "Sprint 23" },
  // Storefront refresh
  { n: 40, project: 24, title: "Product page template", stage: "doing", assignee: "Theo Marsh", priority: "normal", estimate: 16, logged: 11, start: -12, end: 5, summary: "One template for pendants, one for floor lamps.", sprint: "Sprint 22" },
  { n: 41, project: 24, title: "Migrate the winter products", stage: "ready", assignee: "Iris Lindqvist", priority: "normal", estimate: 12, logged: 0, start: 6, end: 20, dependsOn: [40], summary: "Twenty-two products with new photography.", sprint: "Sprint 23" },
  { n: 42, project: 24, title: "Checkout copy review", stage: "backlog", assignee: "Amara Bello", priority: "low", estimate: 4, logged: 0, start: 22, end: 32, dependsOn: [41], summary: "Delivery promises must match the real lead times.", sprint: "Sprint 24" },
  { n: 43, project: 24, title: "Storefront live", stage: "backlog", assignee: "Theo Marsh", priority: "normal", estimate: 0, logged: 0, start: 42, end: 44, kind: "milestone", dependsOn: [42], summary: "Publishing needs a hosting connection, which is not set up.", sprint: "Sprint 25" },
  // Spring research
  { n: 44, project: 25, title: "Material studies", stage: "backlog", assignee: "Fiona Buchanan", priority: "low", estimate: 30, logged: 0, start: 20, end: 60, summary: "Stone, paper composite and recycled brass.", sprint: "Sprint 25" },
  { n: 45, project: 25, title: "Three concept directions", stage: "backlog", assignee: "Theo Marsh", priority: "low", estimate: 24, logged: 0, start: 55, end: 100, dependsOn: [44], summary: "Each with a maquette and a costing sketch.", sprint: "Sprint 26" },
  // Harrow House (closed)
  { n: 46, project: 26, title: "Install complete", stage: "done", assignee: "Maya Chen", priority: "normal", estimate: 0, logged: 0, start: -30, end: -26, kind: "milestone", summary: "Twelve pendants hung and commissioned.", sprint: "Sprint 18" },
  { n: 47, project: 26, title: "Snagging visit", stage: "done", assignee: "Sable Nguyen", priority: "low", estimate: 6, logged: 5, start: -29, end: -26, summary: "One shade re-seated; the case is still open in Customer Care.", sprint: "Sprint 18" },
];

function taskId(n: number): string {
  return `nl-tasks-${String(n).padStart(3, "0")}`;
}

function timeEntries(ctx: SeedContext): Rec[] {
  const rows: { n: number; who: string; taskN: number; project: number; offset: number; hours: number; billable: boolean; approved: boolean }[] = [
    { n: 60, who: "Marcus Reiss", taskN: 22, project: 20, offset: -2, hours: 6, billable: false, approved: false },
    { n: 61, who: "Marcus Reiss", taskN: 22, project: 20, offset: -4, hours: 6, billable: false, approved: true },
    { n: 62, who: "Sable Nguyen", taskN: 27, project: 21, offset: -1, hours: 7.5, billable: true, approved: false },
    { n: 63, who: "Sable Nguyen", taskN: 27, project: 21, offset: -2, hours: 8, billable: true, approved: true },
    { n: 64, who: "Sable Nguyen", taskN: 27, project: 21, offset: -3, hours: 8, billable: true, approved: true },
    { n: 65, who: "Theo Marsh", taskN: 40, project: 24, offset: -1, hours: 4, billable: false, approved: false },
    { n: 66, who: "Theo Marsh", taskN: 40, project: 24, offset: -5, hours: 7, billable: false, approved: true },
    { n: 67, who: "Elena Voss", taskN: 38, project: 23, offset: -2, hours: 2.5, billable: false, approved: false },
    { n: 68, who: "Rowan Patel", taskN: 37, project: 23, offset: -6, hours: 7, billable: false, approved: true },
    { n: 69, who: "Daniel Okafor", taskN: 24, project: 20, offset: -8, hours: 5, billable: false, approved: true },
    { n: 70, who: "Maya Chen", taskN: 28, project: 21, offset: -1, hours: 1.5, billable: false, approved: false },
    { n: 71, who: "Kenji Watanabe", taskN: 47, project: 26, offset: -27, hours: 6, billable: true, approved: true },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "shifts", n: 800 + row.n,
    title: `${row.who.split(" ")[0]} · ${row.hours}h`,
    status: row.approved ? "approved" : "submitted",
    summary: `Logged against ${TASKS.find((task) => task.n === row.taskN)?.title ?? "a task"}.`,
    owner: row.who,
    startAt: dayOf(ctx.now, row.offset, 9),
    endAt: dayOf(ctx.now, row.offset, 9 + Math.round(row.hours)),
    amountMinor: row.billable ? Math.round(row.hours * 6_500) : undefined,
    tags: ["time"],
    fields: {
      kind: "time", employeeName: row.who, taskId: taskId(row.taskN),
      projectId: `nl-projects-${String(row.project).padStart(3, "0")}`,
      hours: row.hours, billable: row.billable, approved: row.approved, rateMinor: 6_500,
    },
  }));
}

function templateRecords(ctx: SeedContext): Rec[] {
  const rows: { n: number; title: string; scope: string; summary: string; phases: { name: string; tasks: string[] }[] }[] = [
    {
      n: 20, title: "New collection launch", scope: "Company",
      summary: "Concept, prototype, production, catalogue and trade preview.",
      phases: [
        { name: "Concept", tasks: ["Material studies", "Three concept directions", "Costing sketch"] },
        { name: "Prototype", tasks: ["Bench prototype", "Glaze and finish tests", "Compliance check"] },
        { name: "Production", tasks: ["Tooling", "First batch", "Quality sample"] },
        { name: "Launch", tasks: ["Photography", "Price list", "Trade preview"] },
      ],
    },
    {
      n: 21, title: "Bespoke commission", scope: "Company",
      summary: "Survey, quote, make, install and snag. Used for Harrow House.",
      phases: [
        { name: "Agree", tasks: ["Site survey", "Quote and deposit", "Drawing sign-off"] },
        { name: "Make", tasks: ["Bench build", "Finishing", "Pre-install test"] },
        { name: "Install", tasks: ["Delivery booking", "Install day", "Snagging visit"] },
      ],
    },
    {
      n: 22, title: "Studio estate works", scope: "Company",
      summary: "Survey, contractor, works, sign-off. Used for the refit and the safety upgrade.",
      phases: [
        { name: "Survey", tasks: ["Measured survey", "Risk assessment"] },
        { name: "Works", tasks: ["First fix", "Second fix", "Make good"] },
        { name: "Close", tasks: ["Sign-off walkthrough", "Update the safety file"] },
      ],
    },
    {
      n: 23, title: "Seasonal campaign", scope: "Industry",
      summary: "A generic retail campaign plan. Adapt the channel mix before use.",
      phases: [
        { name: "Plan", tasks: ["Audience and offer", "Budget"] },
        { name: "Make", tasks: ["Assets", "Copy", "Landing page"] },
        { name: "Run", tasks: ["Schedule", "Weekly read", "Close report"] },
      ],
    },
    {
      n: 24, title: "My weekly studio plan", scope: "Personal",
      summary: "Maya's own repeating week: bench review, numbers, one long design block.",
      phases: [{ name: "Week", tasks: ["Bench review", "Numbers with Jonah", "Design block", "Friday close"] }],
    },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "templates", n: row.n, title: row.title, status: "published",
    summary: row.summary, owner: row.scope === "Personal" ? "Maya Chen" : "Maya Chen",
    tags: ["project", row.scope.toLowerCase()],
    fields: { kind: "project", scope: row.scope, phases: row.phases.length, tasks: row.phases.reduce((sum, phase) => sum + phase.tasks.length, 0) },
    body: { phases: row.phases },
  }));
}

function objectiveRecords(ctx: SeedContext): Rec[] {
  const rows: {
    n: number; title: string; scope: string; owner: string; measure: string; target: number; current: number;
    summary: string; projects: string; checkIns: { at: string; by: string; note: string; value: number }[];
  }[] = [
    {
      n: 20, title: "Two hundred Arc Lamps in stock by the trade preview", scope: "Company", owner: "Rowan Patel",
      measure: "Units packed", target: 200, current: 74,
      summary: "Counted from packed stock, not from the production plan.",
      projects: "nl-projects-021",
      checkIns: [
        { at: dayOf(ctx.now, -14), by: "Rowan Patel", note: "Tooling proved, first bench running.", value: 22 },
        { at: dayOf(ctx.now, -7), by: "Rowan Patel", note: "Eleven units a day on one bench.", value: 51 },
        { at: dayOf(ctx.now, -1), by: "Sable Nguyen", note: "Second bench still waiting on the maker hire.", value: 74 },
      ],
    },
    {
      n: 21, title: "Showroom reopens inside the agreed budget", scope: "Team", owner: "Priya Shah",
      measure: "Percent of budget committed", target: 100, current: 70,
      summary: "Commitment is read from purchase orders raised in this workspace.",
      projects: "nl-projects-020",
      checkIns: [
        { at: dayOf(ctx.now, -21), by: "Priya Shah", note: "Electrical quote accepted.", value: 44 },
        { at: dayOf(ctx.now, -3), by: "Priya Shah", note: "Joinery delay may push labour costs.", value: 70 },
      ],
    },
    {
      n: 22, title: "Every bench position passes the airflow check", scope: "Team", owner: "Rowan Patel",
      measure: "Positions passing", target: 6, current: 4,
      summary: "Two positions still fail. The sign-off milestone is blocked until both pass.",
      projects: "nl-projects-023",
      checkIns: [{ at: dayOf(ctx.now, -9), by: "Rowan Patel", note: "Four of six pass after the new ductwork.", value: 4 }],
    },
    {
      n: 23, title: "Log my design hours honestly", scope: "Personal", owner: "Maya Chen",
      measure: "Hours logged this month", target: 40, current: 12,
      summary: "Counted from time entries, which is why the number is low rather than flattering.",
      projects: "",
      checkIns: [{ at: dayOf(ctx.now, -2), by: "Maya Chen", note: "Two design blocks lost to the refit.", value: 12 }],
    },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "objectives", n: 800 + row.n, title: row.title, status: "active",
    summary: row.summary, owner: row.owner, tags: [row.scope.toLowerCase()],
    fields: { measure: row.measure, target: row.target, current: row.current, scope: row.scope, projectIds: row.projects },
    body: { checkIns: row.checkIns },
  }));
}

registerSeed("project", (ctx) => {
  const records: Rec[] = [
    ...PROJECTS.map((project) => ctx.rec({
      org: "nl", collection: "projects", n: project.n, title: project.title, status: project.status,
      summary: project.summary, owner: project.owner,
      startAt: dayOf(ctx.now, project.start), endAt: dayOf(ctx.now, project.end),
      dueAt: dayOf(ctx.now, project.end),
      amountMinor: project.budgetMinor,
      tags: [project.programme, project.priority],
      fields: {
        departmentId: project.departmentId, health: project.health, priority: project.priority,
        programme: project.programme, budgetMinor: project.budgetMinor, spentMinor: project.spentMinor,
        automationPaused: project.status === "planning",
      },
    })),
    ...TASKS.map((task) => ctx.rec({
      org: "nl", collection: "tasks", n: task.n, title: task.title, status: task.stage,
      summary: task.summary, owner: task.assignee,
      parentId: `nl-projects-${String(task.project).padStart(3, "0")}`,
      startAt: dayOf(ctx.now, task.start), endAt: dayOf(ctx.now, task.end), dueAt: dayOf(ctx.now, task.end),
      tags: task.labels ? [task.labels] : [],
      fields: {
        stage: task.stage, assignee: task.assignee, priority: task.priority,
        estimateHours: task.estimate, loggedHours: task.logged, sprint: task.sprint,
        kind: task.kind ?? "task",
        dependsOn: (task.dependsOn ?? []).map(taskId).join(","),
        delegatedToAgent: false,
        baselineStart: dayOf(ctx.now, task.baseStart ?? task.start),
        baselineEnd: dayOf(ctx.now, task.baseEnd ?? task.end),
      },
      body: {
        checklist: task.kind === "milestone" ? [] : [
          { label: "Scope agreed with the owner", done: task.stage !== "backlog" },
          { label: "Work started", done: ["doing", "review", "done", "blocked"].includes(task.stage) },
          { label: "Checked by a second person", done: task.stage === "done" },
        ],
      },
    })),
    ...timeEntries(ctx),
    ...templateRecords(ctx),
    ...objectiveRecords(ctx),
    ctx.rec({
      org: "hb", collection: "projects", n: 20, title: "Yard racking replacement", status: "active",
      summary: "Replace the north bay racking before the winter intake.", owner: "Elena Ward",
      startAt: dayOf(ctx.now, -20), endAt: dayOf(ctx.now, 30), dueAt: dayOf(ctx.now, 30),
      amountMinor: 1_800_000,
      fields: { health: "on_track", priority: "normal", programme: "Yard", budgetMinor: 1_800_000, spentMinor: 420_000, automationPaused: false },
    }),
    ctx.rec({
      org: "hb", collection: "tasks", n: 20, title: "Measure the north bay", status: "done",
      summary: "Checked against the original yard drawings.", owner: "Marcus Hale",
      parentId: "hb-projects-020", startAt: dayOf(ctx.now, -20), endAt: dayOf(ctx.now, -16), dueAt: dayOf(ctx.now, -16),
      fields: { stage: "done", assignee: "Marcus Hale", priority: "normal", estimateHours: 4, loggedHours: 4, sprint: "Week 46", kind: "task", dependsOn: "", delegatedToAgent: false },
    }),
    ctx.rec({
      org: "hb", collection: "tasks", n: 21, title: "Quote three suppliers", status: "doing",
      summary: "Two quotes in, one chased.", owner: "Elena Ward",
      parentId: "hb-projects-020", startAt: dayOf(ctx.now, -14), endAt: dayOf(ctx.now, 4), dueAt: dayOf(ctx.now, 4),
      fields: { stage: "doing", assignee: "Elena Ward", priority: "high", estimateHours: 6, loggedHours: 3, sprint: "Week 46", kind: "task", dependsOn: "hb-tasks-020", delegatedToAgent: false },
    }),
  ];
  return { records };
});
