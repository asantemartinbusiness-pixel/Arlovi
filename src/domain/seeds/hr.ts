import { registerSeed, type SeedContext } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * People, HR & Payroll fixtures.
 *
 * Northline Atelier is a fourteen-person lighting studio in Clerkenwell with
 * five AI employees on local contracts. Harbor Supply keeps a smaller US
 * roster so the organisation switch is never an empty screen.
 *
 * Every date is derived from the seed clock, so leave balances, probation
 * dates and payroll periods stay coherent whenever the workspace is opened.
 * ====================================================================== */

function dayOf(now: string, offsetDays: number, hour = 9, minute = 0): string {
  const base = new Date(now);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hour, minute, 0, 0);
  return base.toISOString();
}

function monthKey(now: string, back: number): string {
  const base = new Date(now);
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() - back);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface Person {
  n: number;
  name: string;
  title: string;
  departmentId: string;
  manager: string;
  employment: "full-time" | "part-time" | "contractor";
  status: "active" | "probation" | "notice" | "alumni";
  office: string;
  salaryMinor: number;
  startOffsetDays: number;
  allowance: number;
  taken: number;
  pronouns: string;
  skills: string;
  summary: string;
  endOffsetDays?: number;
}

const STUDIO = "nl-departments-001";
const COMMERCIAL = "nl-departments-002";
const WORKSHOP = "nl-departments-030";
const PEOPLE_OPS = "nl-departments-031";

const NORTHLINE_PEOPLE: Person[] = [
  { n: 20, name: "Elena Voss", title: "People lead", departmentId: PEOPLE_OPS, manager: "Maya Chen", employment: "full-time", status: "active", office: "Clerkenwell studio", salaryMinor: 6_200_000, startOffsetDays: -1_420, allowance: 25, taken: 11, pronouns: "she/her", skills: "Employment law, onboarding, payroll inputs", summary: "Runs people operations, payroll inputs and the policy library." },
  { n: 21, name: "Theo Marsh", title: "Studio designer", departmentId: STUDIO, manager: "Maya Chen", employment: "full-time", status: "active", office: "Clerkenwell studio", salaryMinor: 4_600_000, startOffsetDays: -980, allowance: 25, taken: 17, pronouns: "he/him", skills: "Concept drawing, CAD, prototyping", summary: "Draws the collection and keeps the prototype shelf honest." },
  { n: 22, name: "Sable Nguyen", title: "Senior maker", departmentId: WORKSHOP, manager: "Rowan Patel", employment: "full-time", status: "active", office: "Clerkenwell workshop", salaryMinor: 4_100_000, startOffsetDays: -1_190, allowance: 25, taken: 9, pronouns: "they/them", skills: "Brass work, glazing, finishing", summary: "Leads the bench on brass collars and glaze tests." },
  { n: 23, name: "Rowan Patel", title: "Workshop manager", departmentId: WORKSHOP, manager: "Maya Chen", employment: "full-time", status: "active", office: "Clerkenwell workshop", salaryMinor: 5_200_000, startOffsetDays: -1_610, allowance: 25, taken: 14, pronouns: "he/him", skills: "Production planning, safety, tooling", summary: "Plans the bench, owns the safety file and the tool register." },
  { n: 24, name: "Iris Lindqvist", title: "Showroom associate", departmentId: COMMERCIAL, manager: "Priya Shah", employment: "part-time", status: "active", office: "Showroom", salaryMinor: 2_600_000, startOffsetDays: -410, allowance: 15, taken: 6, pronouns: "she/her", skills: "Showroom hosting, trade accounts", summary: "Hosts the showroom Thursday to Saturday and keeps the trade diary." },
  { n: 25, name: "Daniel Okafor", title: "Despatch coordinator", departmentId: WORKSHOP, manager: "Rowan Patel", employment: "full-time", status: "active", office: "Clerkenwell workshop", salaryMinor: 3_400_000, startOffsetDays: -620, allowance: 25, taken: 20, pronouns: "he/him", skills: "Packing, carriers, stock moves", summary: "Packs, books carriers and reconciles despatch notes." },
  { n: 26, name: "Fiona Buchanan", title: "Product designer", departmentId: STUDIO, manager: "Maya Chen", employment: "full-time", status: "active", office: "Clerkenwell studio", salaryMinor: 4_900_000, startOffsetDays: -745, allowance: 25, taken: 4, pronouns: "she/her", skills: "Materials, colour, technical drawing", summary: "Owns materials and colourways across the winter run." },
  { n: 27, name: "Marcus Reiss", title: "Lighting engineer", departmentId: STUDIO, manager: "Maya Chen", employment: "full-time", status: "active", office: "Clerkenwell studio", salaryMinor: 5_400_000, startOffsetDays: -300, allowance: 25, taken: 3, pronouns: "he/him", skills: "Electrical compliance, LED drivers, CE marking", summary: "Keeps every fitting compliant and the driver spec current." },
  { n: 28, name: "Amara Bello", title: "Content and marketing", departmentId: COMMERCIAL, manager: "Priya Shah", employment: "contractor", status: "active", office: "Remote — Manchester", salaryMinor: 3_600_000, startOffsetDays: -210, allowance: 0, taken: 0, pronouns: "she/her", skills: "Copy, campaign planning, photography direction", summary: "Day-rate contractor on the winter campaign. Invoices monthly." },
  { n: 29, name: "Kenji Watanabe", title: "Photographer", departmentId: COMMERCIAL, manager: "Priya Shah", employment: "contractor", status: "active", office: "Remote — London", salaryMinor: 2_400_000, startOffsetDays: -150, allowance: 0, taken: 0, pronouns: "he/him", skills: "Still life, retouching, lighting sets", summary: "Shoots the catalogue and the storefront stills." },
  { n: 30, name: "Clara Mendoza", title: "Customer care specialist", departmentId: COMMERCIAL, manager: "Priya Shah", employment: "full-time", status: "active", office: "Showroom", salaryMinor: 3_200_000, startOffsetDays: -480, allowance: 25, taken: 12, pronouns: "she/her", skills: "Case handling, returns, knowledge base", summary: "First responder on care cases and the knowledge base editor." },
  { n: 31, name: "Hugh Tennant", title: "Finance assistant", departmentId: COMMERCIAL, manager: "Jonah Adeyemi", employment: "full-time", status: "probation", office: "Clerkenwell studio", salaryMinor: 2_900_000, startOffsetDays: -48, allowance: 25, taken: 1, pronouns: "he/him", skills: "Bookkeeping, reconciliation", summary: "Six-month probation ends in the new year. Reconciles the local ledger." },
  { n: 32, name: "Yvonne Serrano", title: "Studio manager", departmentId: STUDIO, manager: "Maya Chen", employment: "full-time", status: "notice", office: "Clerkenwell studio", salaryMinor: 4_700_000, startOffsetDays: -1_890, allowance: 25, taken: 22, pronouns: "she/her", skills: "Scheduling, supplier liaison", summary: "Working notice. Handover to Rowan Patel is in progress.", endOffsetDays: 34 },
  { n: 33, name: "Oliver Grant", title: "Maker", departmentId: WORKSHOP, manager: "Rowan Patel", employment: "full-time", status: "alumni", office: "Clerkenwell workshop", salaryMinor: 3_300_000, startOffsetDays: -1_240, allowance: 25, taken: 25, pronouns: "he/him", skills: "Brass work, assembly", summary: "Left in the summer for a furniture workshop in Margate.", endOffsetDays: -126 },
];

/** Offset so these ids cannot collide with another application's member fixtures. */
const AI_BASE = 800;

const AI_EMPLOYEES = [
  { n: 20, name: "Wren Ashby", title: "Customer care agent", departmentId: COMMERCIAL, summary: "Drafts care replies from approved articles. A person sends every reply.", scope: "Care inbox, knowledge base (read)", concurrency: 4 },
  { n: 21, name: "Tobias Lund", title: "Scheduling agent", departmentId: WORKSHOP, summary: "Proposes shift cover and flags clashes. Never publishes a roster alone.", scope: "Shifts, leave calendar (read)", concurrency: 2 },
  { n: 22, name: "Marla Quist", title: "Recruiting screener", departmentId: PEOPLE_OPS, summary: "Summarises job-relevant evidence from applications. Does not score candidates.", scope: "Applicants (consented fields only)", concurrency: 3 },
];

interface PositionSeed {
  n: number; title: string; department: string; status: string; hiringManager: string;
  salaryLowMinor: number; salaryHighMinor: number; openedOffset: number; employment: string; location: string; summary: string;
}

const POSITIONS: PositionSeed[] = [
  { n: 20, title: "Showroom associate", department: COMMERCIAL, status: "open", hiringManager: "Priya Shah", salaryLowMinor: 2_600_000, salaryHighMinor: 3_000_000, openedOffset: -52, employment: "part-time", location: "Showroom", summary: "Thursday to Saturday cover for the trade diary and walk-ins." },
  { n: 21, title: "Maker — brass bench", department: WORKSHOP, status: "open", hiringManager: "Rowan Patel", salaryLowMinor: 3_200_000, salaryHighMinor: 3_800_000, openedOffset: -31, employment: "full-time", location: "Clerkenwell workshop", summary: "Second bench for the winter run and the Harrow House order." },
  { n: 22, title: "Studio manager", department: STUDIO, status: "open", hiringManager: "Maya Chen", salaryLowMinor: 4_500_000, salaryHighMinor: 5_200_000, openedOffset: -12, employment: "full-time", location: "Clerkenwell studio", summary: "Backfill for Yvonne Serrano, who is working notice." },
  { n: 23, title: "Junior product designer", department: STUDIO, status: "on_hold", hiringManager: "Maya Chen", salaryLowMinor: 3_000_000, salaryHighMinor: 3_400_000, openedOffset: -88, employment: "full-time", location: "Clerkenwell studio", summary: "Paused until the spring collection budget is agreed." },
  { n: 24, title: "Finance assistant", department: COMMERCIAL, status: "filled", hiringManager: "Jonah Adeyemi", salaryLowMinor: 2_700_000, salaryHighMinor: 3_100_000, openedOffset: -140, employment: "full-time", location: "Clerkenwell studio", summary: "Filled by Hugh Tennant, who started in the autumn." },
];

interface ApplicantSeed {
  n: number; name: string; positionN: number; stage: string; source: string;
  appliedOffset: number; rating: number; email: string; summary: string; consentMonths: number;
}

const APPLICANTS: ApplicantSeed[] = [
  { n: 20, name: "Priyanka Rao", positionN: 20, stage: "screening", source: "Studio newsletter", appliedOffset: -18, rating: 3, email: "p.rao@example.com", summary: "Four years on a furniture showroom floor. Available weekends.", consentMonths: 6 },
  { n: 21, name: "Tomas Bianchi", positionN: 20, stage: "interview", source: "Referral — Iris Lindqvist", appliedOffset: -24, rating: 4, email: "t.bianchi@example.com", summary: "Lighting retail background, strong on trade accounts.", consentMonths: 6 },
  { n: 22, name: "Jade Ferreira", positionN: 20, stage: "applied", source: "Job board", appliedOffset: -5, rating: 0, email: "jade.f@example.com", summary: "Hospitality background, first retail application.", consentMonths: 6 },
  { n: 23, name: "Samuel Achebe", positionN: 21, stage: "interview", source: "Craft guild", appliedOffset: -21, rating: 5, email: "s.achebe@example.com", summary: "Eight years brazing and brass finishing. Portfolio reviewed by Sable.", consentMonths: 12 },
  { n: 24, name: "Marta Nowak", positionN: 21, stage: "offer", source: "Craft guild", appliedOffset: -40, rating: 5, email: "m.nowak@example.com", summary: "Offer drafted at £34,500. Nothing has been sent to the candidate.", consentMonths: 12 },
  { n: 25, name: "Dev Sharma", positionN: 21, stage: "rejected", source: "Job board", appliedOffset: -46, rating: 2, email: "dev.sharma@example.com", summary: "Metalwork experience did not cover finishing. Declined after the first call.", consentMonths: 6 },
  { n: 26, name: "Ruth Calloway", positionN: 22, stage: "screening", source: "Direct approach", appliedOffset: -9, rating: 4, email: "r.calloway@example.com", summary: "Ran a ceramics studio of eleven people. Notice period is three months.", consentMonths: 12 },
  { n: 27, name: "Felix Mbeki", positionN: 22, stage: "applied", source: "Referral — Theo Marsh", appliedOffset: -3, rating: 0, email: "f.mbeki@example.com", summary: "Studio coordinator at a lighting importer.", consentMonths: 12 },
  { n: 28, name: "Ana Petrova", positionN: 23, stage: "withdrawn", source: "University fair", appliedOffset: -72, rating: 3, email: "a.petrova@example.com", summary: "Withdrew when the role was put on hold. Asked to be contacted in spring.", consentMonths: 6 },
];

function employeeRecords(ctx: SeedContext): Rec[] {
  return NORTHLINE_PEOPLE.map((person) => ctx.rec({
    org: "nl",
    collection: "employees",
    n: person.n,
    title: person.name,
    status: person.status,
    summary: person.summary,
    owner: "Elena Voss",
    startAt: dayOf(ctx.now, person.startOffsetDays),
    endAt: person.endOffsetDays === undefined ? undefined : dayOf(ctx.now, person.endOffsetDays),
    tags: [person.employment, person.status],
    fields: {
      kind: "human",
      title: person.title,
      departmentId: person.departmentId,
      manager: person.manager,
      employment: person.employment,
      office: person.office,
      pronouns: person.pronouns,
      skills: person.skills,
      email: `${person.name.split(" ")[0].toLowerCase()}@northline.example`,
      phone: "Held under this person's privacy setting",
      salaryMinor: person.salaryMinor,
      salaryBasis: person.employment === "contractor" ? "day rate, invoiced" : "annual",
      leaveAllowance: person.allowance,
      leaveTaken: person.taken,
      nationalInsurance: "QQ 12 34 56 C",
      dateOfBirth: "Recorded in the personal file",
      emergencyContact: "Recorded in the personal file",
      pensionPct: person.employment === "contractor" ? 0 : 5,
    },
  }));
}

function onboardingTasks(ctx: SeedContext): Rec[] {
  const plans: { employeeN: number; items: { label: string; status: string; owner: string; group: string }[] }[] = [
    {
      employeeN: 31,
      items: [
        { label: "Signed contract filed", status: "done", owner: "Elena Voss", group: "People" },
        { label: "Right to work check recorded", status: "done", owner: "Elena Voss", group: "People" },
        { label: "Ledger read access granted", status: "done", owner: "Jonah Adeyemi", group: "IT access" },
        { label: "Payroll inputs added", status: "done", owner: "Elena Voss", group: "Finance" },
        { label: "Probation review booked", status: "doing", owner: "Jonah Adeyemi", group: "Manager" },
        { label: "Health and safety module", status: "ready", owner: "Hugh Tennant", group: "Learning" },
      ],
    },
    {
      employeeN: 27,
      items: [
        { label: "Signed contract filed", status: "done", owner: "Elena Voss", group: "People" },
        { label: "Workshop induction", status: "done", owner: "Rowan Patel", group: "Manager" },
        { label: "Compliance toolkit access", status: "waiting", owner: "Maya Chen", group: "IT access" },
        { label: "Mentor assigned", status: "done", owner: "Elena Voss", group: "People" },
      ],
    },
  ];
  const records: Rec[] = [];
  let n = 200;
  for (const plan of plans) {
    const employeeId = `nl-employees-${String(plan.employeeN).padStart(3, "0")}`;
    for (const item of plan.items) {
      n += 1;
      records.push(ctx.rec({
        org: "nl",
        collection: "tasks",
        n,
        title: item.label,
        status: item.status,
        summary: `${item.group} step for the ${plan.employeeN === 31 ? "Hugh Tennant" : "Marcus Reiss"} checklist.`,
        owner: item.owner,
        parentId: employeeId,
        dueAt: dayOf(ctx.now, item.status === "done" ? -20 : 6),
        tags: ["onboarding"],
        fields: { kind: "onboarding", employeeId, stage: item.status, assignee: item.owner, group: item.group },
      }));
    }
  }
  return records;
}

function leaveRecords(ctx: SeedContext): Rec[] {
  const rows: { n: number; employeeN: number; name: string; type: string; from: number; to: number; status: string; note: string }[] = [
    { n: 20, employeeN: 21, name: "Theo Marsh", type: "annual", from: 4, to: 8, status: "requested", note: "Family visit to Lisbon." },
    { n: 21, employeeN: 22, name: "Sable Nguyen", type: "annual", from: 11, to: 15, status: "requested", note: "Workshop course in Sheffield." },
    { n: 22, employeeN: 24, name: "Iris Lindqvist", type: "annual", from: 3, to: 4, status: "requested", note: "Saturday off — cover needed on the floor." },
    { n: 23, employeeN: 26, name: "Fiona Buchanan", type: "annual", from: 20, to: 27, status: "approved", note: "Pre-booked before the winter run." },
    { n: 24, employeeN: 25, name: "Daniel Okafor", type: "sick", from: -3, to: -2, status: "approved", note: "Absence recorded. No health detail is held in the team calendar." },
    { n: 25, employeeN: 30, name: "Clara Mendoza", type: "annual", from: -12, to: -8, status: "approved", note: "Half term." },
    { n: 26, employeeN: 23, name: "Rowan Patel", type: "annual", from: 32, to: 39, status: "requested", note: "Christmas week — clashes with the Harrow House install." },
    { n: 27, employeeN: 20, name: "Elena Voss", type: "annual", from: -30, to: -26, status: "approved", note: "Autumn break." },
    { n: 28, employeeN: 21, name: "Theo Marsh", type: "unpaid", from: -60, to: -58, status: "declined", note: "Declined: clashed with the catalogue shoot." },
    { n: 29, employeeN: 27, name: "Marcus Reiss", type: "parental", from: 46, to: 74, status: "approved", note: "Shared parental leave, agreed in writing." },
    { n: 30, employeeN: 22, name: "Sable Nguyen", type: "annual", from: -45, to: -41, status: "approved", note: "Summer break." },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl",
    collection: "leaveRequests",
    n: row.n,
    title: `${row.name.split(" ")[0]} · ${row.type}`,
    status: row.status,
    summary: row.note,
    owner: row.name,
    startAt: dayOf(ctx.now, row.from, 0),
    endAt: dayOf(ctx.now, row.to, 0),
    at: dayOf(ctx.now, Math.min(row.from - 9, -1)),
    tags: [row.type],
    fields: {
      employeeId: `nl-employees-${String(row.employeeN).padStart(3, "0")}`,
      employeeName: row.name,
      type: row.type,
      days: Math.max(1, row.to - row.from),
      approver: "Elena Voss",
      halfDay: false,
    },
  }));
}

function shiftRecords(ctx: SeedContext): Rec[] {
  const roster: { who: string; employeeN: number; offset: number; start: number; end: number; place: string }[] = [];
  const crew = [
    { who: "Iris Lindqvist", employeeN: 24, place: "Showroom", start: 10, end: 18 },
    { who: "Priya Shah", employeeN: 3, place: "Showroom", start: 9, end: 17 },
    { who: "Sable Nguyen", employeeN: 22, place: "Workshop bench", start: 8, end: 16 },
    { who: "Rowan Patel", employeeN: 23, place: "Workshop bench", start: 8, end: 16 },
    { who: "Daniel Okafor", employeeN: 25, place: "Despatch", start: 7, end: 15 },
  ];
  for (let day = -5; day <= 9; day += 1) {
    const date = new Date(ctx.now);
    date.setUTCDate(date.getUTCDate() + day);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue;
    for (const person of crew) {
      if (weekday === 6 && person.place === "Workshop bench") continue;
      if (weekday === 6 && person.place === "Despatch") continue;
      roster.push({ ...person, offset: day });
    }
  }
  let index = 19;
  return roster.map((entry) => {
    index += 1;
    const hours = entry.end - entry.start;
    return ctx.rec({
      org: "nl",
      collection: "shifts",
      n: index,
      title: `${entry.place} · ${entry.who.split(" ")[0]}`,
      status: entry.offset < 0 ? "worked" : "scheduled",
      summary: `${entry.start}:00–${entry.end}:00 at the ${entry.place.toLowerCase()}.`,
      owner: entry.who,
      startAt: dayOf(ctx.now, entry.offset, entry.start),
      endAt: dayOf(ctx.now, entry.offset, entry.end),
      tags: ["roster"],
      fields: {
        kind: "shift",
        employeeId: `nl-employees-${String(entry.employeeN).padStart(3, "0")}`,
        employeeName: entry.who,
        place: entry.place,
        hours,
        overtime: hours > 8,
        approved: entry.offset < -1,
      },
    });
  });
}

function payrollRecords(ctx: SeedContext): Rec[] {
  return [
    ctx.rec({
      org: "nl", collection: "payrollRuns", n: 20, title: `Payroll ${monthKey(ctx.now, 1)}`, status: "approved",
      summary: "Approved locally. No statutory submission and no bank file left this browser.",
      owner: "Elena Voss", at: dayOf(ctx.now, -16), amountMinor: 0,
      fields: { period: monthKey(ctx.now, 1), approvedBy: "Maya Chen", payDay: dayOf(ctx.now, -16).slice(0, 10), filed: false, banked: false },
    }),
    ctx.rec({
      org: "nl", collection: "payrollRuns", n: 21, title: `Payroll ${monthKey(ctx.now, 2)}`, status: "approved",
      summary: "Approved locally. Exported as CSV for the accountant.",
      owner: "Elena Voss", at: dayOf(ctx.now, -47), amountMinor: 0,
      fields: { period: monthKey(ctx.now, 2), approvedBy: "Maya Chen", payDay: dayOf(ctx.now, -47).slice(0, 10), filed: false, banked: false },
    }),
    ctx.rec({
      org: "nl", collection: "payrollRuns", n: 22, title: `Payroll ${monthKey(ctx.now, 3)}`, status: "approved",
      summary: "Approved locally.",
      owner: "Elena Voss", at: dayOf(ctx.now, -78), amountMinor: 0,
      fields: { period: monthKey(ctx.now, 3), approvedBy: "Maya Chen", payDay: dayOf(ctx.now, -78).slice(0, 10), filed: false, banked: false },
    }),
  ];
}

function reviewRecords(ctx: SeedContext): Rec[] {
  const rows: { n: number; employeeN: number; name: string; reviewer: string; status: string; rating: string; cycle: string; offset: number; aiAssisted: boolean; note: string }[] = [
    { n: 20, employeeN: 21, name: "Theo Marsh", reviewer: "Maya Chen", status: "acknowledged", rating: "exceeding", cycle: "Mid-year", offset: -102, aiAssisted: false, note: "Carried the winter concept work on his own for six weeks." },
    { n: 21, employeeN: 22, name: "Sable Nguyen", reviewer: "Rowan Patel", status: "submitted", rating: "meeting", cycle: "Year end", offset: -6, aiAssisted: true, note: "Draft assembled from task records. A person must confirm the rating." },
    { n: 22, employeeN: 24, name: "Iris Lindqvist", reviewer: "Priya Shah", status: "draft", rating: "", cycle: "Year end", offset: -2, aiAssisted: false, note: "Opened after the trade weekend." },
    { n: 23, employeeN: 25, name: "Daniel Okafor", reviewer: "Rowan Patel", status: "calibrated", rating: "meeting", cycle: "Year end", offset: -9, aiAssisted: false, note: "Despatch accuracy improved after the October relabel." },
    { n: 24, employeeN: 26, name: "Fiona Buchanan", reviewer: "Maya Chen", status: "submitted", rating: "exceeding", cycle: "Year end", offset: -4, aiAssisted: false, note: "Materials library is now the reference for the whole studio." },
    { n: 25, employeeN: 30, name: "Clara Mendoza", reviewer: "Priya Shah", status: "acknowledged", rating: "meeting", cycle: "Mid-year", offset: -118, aiAssisted: false, note: "Case handling steady; knowledge base contributions noted." },
    { n: 26, employeeN: 31, name: "Hugh Tennant", reviewer: "Jonah Adeyemi", status: "scheduled", rating: "", cycle: "Probation", offset: 42, aiAssisted: false, note: "Six-month probation review." },
    { n: 27, employeeN: 23, name: "Rowan Patel", reviewer: "Maya Chen", status: "draft", rating: "", cycle: "Year end", offset: -1, aiAssisted: false, note: "Covers the safety upgrade and the bench plan." },
    { n: 28, employeeN: 27, name: "Marcus Reiss", reviewer: "Maya Chen", status: "scheduled", rating: "", cycle: "Probation", offset: 18, aiAssisted: false, note: "Three-month check-in before parental leave." },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "reviews", n: row.n, title: `${row.name} · ${row.cycle}`, status: row.status,
    summary: row.note, owner: row.reviewer, at: dayOf(ctx.now, row.offset),
    dueAt: dayOf(ctx.now, row.offset + 14), tags: [row.cycle.toLowerCase().replace(" ", "-")],
    fields: {
      employeeId: `nl-employees-${String(row.employeeN).padStart(3, "0")}`,
      employeeName: row.name, reviewer: row.reviewer, cycle: row.cycle, rating: row.rating,
      aiAssisted: row.aiAssisted, confidential: row.status === "draft",
    },
  }));
}

function policyRecords(ctx: SeedContext): Rec[] {
  const rows: { n: number; title: string; version: string; summary: string; ack: boolean; offset: number }[] = [
    { n: 20, title: "Employee handbook", version: "4.2", summary: "How the studio works: hours, conduct, expenses and escalation.", ack: true, offset: -210 },
    { n: 21, title: "Leave and absence policy", version: "2.1", summary: "25 days plus bank holidays, pro rata for part-time. Carry-over capped at five days.", ack: true, offset: -140 },
    { n: 22, title: "Workshop health and safety", version: "3.0", summary: "Bench rules, extraction checks and the accident book.", ack: true, offset: -58 },
    { n: 23, title: "Working with AI employees", version: "1.4", summary: "An AI employee drafts; a named person approves anything that leaves the workspace.", ack: true, offset: -33 },
    { n: 24, title: "Expenses and travel", version: "2.0", summary: "Receipts within ten days, approval above £250.", ack: false, offset: -300 },
    { n: 25, title: "Flexible working", version: "1.1", summary: "Request route, trial period and how a decision is recorded.", ack: false, offset: -420 },
    { n: 26, title: "Data protection for people data", version: "2.3", summary: "What the people file holds, who can open it and how long it is kept.", ack: true, offset: -95 },
    { n: 27, title: "Grievance and disciplinary", version: "1.0", summary: "Stages, who hears each stage and the right to be accompanied.", ack: false, offset: -510 },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "policies", n: 800 + row.n, title: row.title, status: "published",
    summary: row.summary, owner: "Elena Voss", at: dayOf(ctx.now, row.offset),
    dueAt: dayOf(ctx.now, row.offset + 365), tags: ["hr"],
    fields: { kind: "hr", version: row.version, acknowledgementRequired: row.ack, acknowledged: row.ack ? 9 : 0, audience: "All employees" },
  }));
}

function courseRecords(ctx: SeedContext): Rec[] {
  const rows: { n: number; title: string; summary: string; minutes: number; required: boolean; completions: number }[] = [
    { n: 20, title: "Workshop safety essentials", summary: "Extraction, guarding, hot work and the accident book.", minutes: 45, required: true, completions: 8 },
    { n: 21, title: "Electrical compliance for fittings", summary: "What CE and UKCA marking need from a small manufacturer.", minutes: 70, required: true, completions: 4 },
    { n: 22, title: "Showroom selling", summary: "Trade accounts, lead times and how to quote honestly.", minutes: 35, required: false, completions: 5 },
    { n: 23, title: "Working alongside an AI employee", summary: "What an agent may draft, and what a person must approve.", minutes: 25, required: true, completions: 11 },
    { n: 24, title: "Handling customer data", summary: "What to record on a case and what to leave out.", minutes: 30, required: true, completions: 10 },
    { n: 25, title: "Brass finishing masterclass", summary: "Recorded bench session with Sable Nguyen.", minutes: 95, required: false, completions: 3 },
  ];
  return rows.map((row) => ctx.rec({
    org: "nl", collection: "courses", n: row.n, title: row.title, status: "published",
    summary: row.summary, owner: "Elena Voss", tags: row.required ? ["required"] : ["optional"],
    fields: { minutes: row.minutes, required: row.required, completions: row.completions, format: "Recorded in this workspace" },
  }));
}

registerSeed("hr", (ctx) => {
  const records: Rec[] = [
    ctx.rec({ org: "nl", collection: "departments", n: 30, title: "Workshop", summary: "Bench, finishing and despatch.", fields: { lead: "Rowan Patel", members: 3 } }),
    ctx.rec({ org: "nl", collection: "departments", n: 31, title: "People & Operations", summary: "Hiring, payroll inputs, policy and the studio calendar.", fields: { lead: "Elena Voss", members: 1 } }),
    ...employeeRecords(ctx),
    ...AI_EMPLOYEES.map((agent) => ctx.rec({
      org: "nl", collection: "members", n: AI_BASE + agent.n, title: agent.name, summary: agent.summary,
      tags: ["ai"],
      fields: {
        kind: "ai", role: "agent", departmentId: agent.departmentId, title: agent.title,
        scope: agent.scope, concurrency: agent.concurrency, contract: "Local agent contract in this workspace",
      },
    })),
    ...POSITIONS.map((position) => ctx.rec({
      org: "nl", collection: "positions", n: position.n, title: position.title, status: position.status,
      summary: position.summary, owner: position.hiringManager, at: dayOf(ctx.now, position.openedOffset),
      amountMinor: position.salaryLowMinor,
      fields: {
        departmentId: position.department, hiringManager: position.hiringManager, employment: position.employment,
        location: position.location, salaryLowMinor: position.salaryLowMinor, salaryHighMinor: position.salaryHighMinor,
        openings: 1,
      },
    })),
    ...APPLICANTS.map((applicant) => ctx.rec({
      org: "nl", collection: "applicants", n: applicant.n, title: applicant.name, status: applicant.stage,
      summary: applicant.summary, owner: "Elena Voss", at: dayOf(ctx.now, applicant.appliedOffset),
      tags: [applicant.stage],
      fields: {
        stage: applicant.stage,
        positionId: `nl-positions-${String(applicant.positionN).padStart(3, "0")}`,
        role: POSITIONS.find((position) => position.n === applicant.positionN)?.title ?? "Open role",
        source: applicant.source, rating: applicant.rating, email: applicant.email,
        consentUntil: dayOf(ctx.now, applicant.appliedOffset + applicant.consentMonths * 30).slice(0, 10),
        interviewAt: applicant.stage === "interview" ? dayOf(ctx.now, 3, 11) : "",
      },
    })),
    ...onboardingTasks(ctx),
    ...leaveRecords(ctx),
    ...shiftRecords(ctx),
    ...payrollRecords(ctx),
    ...reviewRecords(ctx),
    ...policyRecords(ctx),
    ...courseRecords(ctx),
    ctx.rec({
      org: "hb", collection: "employees", n: 20, title: "Elena Ward", status: "active",
      summary: "Owner. Runs Harbor Supply from Brooklyn.", owner: "Elena Ward",
      startAt: dayOf(ctx.now, -2_100),
      fields: { kind: "human", title: "Owner", employment: "full-time", office: "Brooklyn yard", manager: "—", salaryMinor: 9_000_000, leaveAllowance: 15, leaveTaken: 4, email: "elena@harborsupply.example" },
    }),
    ctx.rec({
      org: "hb", collection: "employees", n: 21, title: "Marcus Hale", status: "active",
      summary: "Yard supervisor.", owner: "Elena Ward", startAt: dayOf(ctx.now, -640),
      fields: { kind: "human", title: "Yard supervisor", employment: "full-time", office: "Brooklyn yard", manager: "Elena Ward", salaryMinor: 6_400_000, leaveAllowance: 15, leaveTaken: 7, email: "marcus@harborsupply.example" },
    }),
    ctx.rec({
      org: "hb", collection: "leaveRequests", n: 20, title: "Marcus · annual", status: "requested",
      summary: "Two days either side of Thanksgiving.", owner: "Marcus Hale",
      startAt: dayOf(ctx.now, 12, 0), endAt: dayOf(ctx.now, 14, 0),
      fields: { employeeId: "hb-employees-021", employeeName: "Marcus Hale", type: "annual", days: 2, approver: "Elena Ward", halfDay: false },
    }),
  ];
  return { records };
});
