import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Governance, Legal Operations & Risk fixtures.
 *
 * Contracts carry a clause list and two stored versions so the redline view
 * has something real to compare. Obligations are dated from the seed clock so
 * the calendar always shows a mix of overdue, due and future work.
 * ====================================================================== */

function day(now: string, offsetDays: number): string {
  const base = new Date(now);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(9, 0, 0, 0);
  return base.toISOString();
}

interface Clause {
  id: string; title: string; text: string; risk: "standard" | "review" | "unusual"; note?: string;
}

interface ContractSeed {
  n: number; title: string; counterparty: string; type: string; status: string; owner: string;
  valueMinor: number; start: number; end: number; signed?: number; noticeDays: number;
  summary: string; clauses: Clause[]; priorText?: string; currentText?: string;
}

const STANDARD_CLAUSES: Clause[] = [
  { id: "c1", title: "Definitions", text: "Terms used in this agreement have the meanings given in Schedule 1.", risk: "standard" },
  { id: "c2", title: "Term", text: "This agreement begins on the start date and continues for twelve months unless ended earlier under clause 9.", risk: "standard" },
  { id: "c3", title: "Payment", text: "Invoices are payable within thirty days of the invoice date.", risk: "standard" },
  { id: "c4", title: "Liability", text: "Neither party is liable for indirect or consequential loss. Liability is capped at the fees paid in the preceding twelve months.", risk: "review", note: "The cap is the usual position; confirm it is twelve months and not the whole term." },
  { id: "c5", title: "Termination", text: "Either party may end this agreement on sixty days written notice.", risk: "standard" },
  { id: "c6", title: "Governing law", text: "This agreement is governed by the law of England and Wales.", risk: "standard" },
];

const CONTRACTS: ContractSeed[] = [
  {
    n: 20, title: "Thames Timber — supply agreement", counterparty: "Thames Timber Ltd", type: "supply", status: "in_review",
    owner: "Rowan Patel", valueMinor: 1_800_000, start: -4, end: 361, noticeDays: 60,
    summary: "Oak and ash for the showroom joinery. Under review after the delivery slip.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 3),
      { id: "c4", title: "Delivery", text: "The supplier will deliver within fourteen days of order. Delay beyond twenty-eight days entitles the customer to cancel without charge.", risk: "review", note: "This is the clause the current delay engages. Confirm the twenty-eight day count starts at order, not at kiln load." },
      { id: "c5", title: "Liability", text: "The supplier's liability is limited to the price of the goods supplied.", risk: "unusual", note: "Hypothesis for legal review: a goods-price cap leaves the studio exposed to its own downstream delay costs. Cited from clause 5 of the supplied draft." },
      ...STANDARD_CLAUSES.slice(4),
    ],
    priorText: "The supplier will deliver within fourteen days of order. Delay beyond forty-two days entitles the customer to cancel without charge.",
    currentText: "The supplier will deliver within fourteen days of order. Delay beyond twenty-eight days entitles the customer to cancel without charge.",
  },
  {
    n: 21, title: "Clerkenwell studio lease", counterparty: "Marchbank Estates", type: "lease", status: "active",
    owner: "Maya Chen", valueMinor: 4_800_000, start: -1_020, end: 445, signed: -1_025, noticeDays: 180,
    summary: "Studio and workshop on a five-year lease with a break at year four.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 2),
      { id: "c3", title: "Rent review", text: "Rent is reviewed on the third anniversary by reference to the retail price index, upward only.", risk: "unusual", note: "Hypothesis: an upward-only review is common in this market but is not a neutral term. Clause 3 of the executed lease." },
      { id: "c4", title: "Repair", text: "The tenant keeps the demised premises in good repair, fair wear and tear excepted.", risk: "review" },
      { id: "c5", title: "Break", text: "The tenant may break at the fourth anniversary on six months written notice.", risk: "standard", note: "The break notice window opens soon — tracked as an obligation." },
      ...STANDARD_CLAUSES.slice(5),
    ],
  },
  {
    n: 22, title: "Vale & Co — trade terms", counterparty: "Vale & Co Interiors", type: "customer", status: "active",
    owner: "Priya Shah", valueMinor: 0, start: -400, end: 330, signed: -398, noticeDays: 30,
    summary: "Standard trade account terms. Thirty-day payment, six-week lead time.",
    clauses: STANDARD_CLAUSES,
  },
  {
    n: 23, title: "Delacroix Hotels — framework", counterparty: "Delacroix Hotels SA", type: "customer", status: "awaiting_signature",
    owner: "Priya Shah", valueMinor: 9_600_000, start: 14, end: 745, noticeDays: 90,
    summary: "Two-year framework for hotel refurbishments. Waiting on counter-signature.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 4),
      { id: "c5", title: "Exclusivity", text: "The studio will not supply a competing hotel group within the same city during the term.", risk: "unusual", note: "Hypothesis for legal review: a city-level exclusivity would bind the studio well beyond this customer's spend. Clause 5 of the counterparty draft." },
      { id: "c6", title: "Termination for convenience", text: "The customer may end this agreement at any time on thirty days notice.", risk: "unusual", note: "One-sided: the studio has no equivalent right in this draft." },
      ...STANDARD_CLAUSES.slice(5),
    ],
    priorText: "The studio will not supply a competing hotel group within the same country during the term.",
    currentText: "The studio will not supply a competing hotel group within the same city during the term.",
  },
  {
    n: 24, title: "Kestrel Brokers — public liability", counterparty: "Kestrel Brokers", type: "insurance", status: "expiring",
    owner: "Jonah Adeyemi", valueMinor: 240_000, start: -348, end: 17, signed: -350, noticeDays: 30,
    summary: "Public liability cover. Lapses in under three weeks unless renewed.",
    clauses: STANDARD_CLAUSES.slice(0, 5),
  },
  {
    n: 25, title: "Harrow House commission", counterparty: "A. Rahman", type: "customer", status: "active",
    owner: "Maya Chen", valueMinor: 5_600_000, start: -160, end: 200, signed: -158, noticeDays: 0,
    summary: "Twelve bespoke pendants with a twelve-month defects period.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 4),
      { id: "c5", title: "Defects", text: "The studio will make good any manufacturing defect notified within twelve months of installation.", risk: "review", note: "The open care case sits inside this window." },
      ...STANDARD_CLAUSES.slice(5),
    ],
  },
  {
    n: 26, title: "Amara Bello — contractor agreement", counterparty: "Amara Bello", type: "employment", status: "active",
    owner: "Elena Voss", valueMinor: 3_600_000, start: -210, end: 155, signed: -212, noticeDays: 14,
    summary: "Day-rate marketing contractor. Intellectual property assigned on payment.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 3),
      { id: "c4", title: "Intellectual property", text: "All work product is assigned to the studio on payment of the relevant invoice.", risk: "standard" },
      { id: "c5", title: "Status", text: "The contractor is not an employee and is responsible for their own tax.", risk: "review", note: "Status tests are fact-specific; this wording does not decide the question." },
      ...STANDARD_CLAUSES.slice(5),
    ],
  },
  {
    n: 27, title: "Lumen Cloud — workspace tooling", counterparty: "Lumen Cloud Ltd", type: "saas", status: "draft",
    owner: "Maya Chen", valueMinor: 420_000, start: 30, end: 395, noticeDays: 30,
    summary: "Draft only. Nothing has been agreed and no account exists.",
    clauses: [
      ...STANDARD_CLAUSES.slice(0, 3),
      { id: "c4", title: "Data processing", text: "The supplier processes personal data only on documented instructions from the studio.", risk: "review", note: "Needs an annex listing what is actually processed before anyone signs." },
      ...STANDARD_CLAUSES.slice(4),
    ],
  },
  {
    n: 28, title: "Brass collar supply — superseded", counterparty: "Thames Brass", type: "supply", status: "archived",
    owner: "Rowan Patel", valueMinor: 1_200_000, start: -760, end: -30, signed: -762, noticeDays: 30,
    summary: "Replaced by the current arrangement. Kept because orders were placed under it.",
    clauses: STANDARD_CLAUSES.slice(0, 4),
  },
  {
    n: 29, title: "Mutual NDA — Delacroix", counterparty: "Delacroix Hotels SA", type: "nda", status: "active",
    owner: "Priya Shah", valueMinor: 0, start: -70, end: 660, signed: -69, noticeDays: 0,
    summary: "Mutual confidentiality for the framework negotiation.",
    clauses: STANDARD_CLAUSES.slice(0, 3).concat([
      { id: "c4", title: "Confidentiality", text: "Each party keeps the other's confidential information private for three years after disclosure.", risk: "standard" },
      STANDARD_CLAUSES[5],
    ]),
  },
];

interface ObligationSeed {
  n: number; title: string; owner: string; offset: number; kind: string; contractN?: number;
  status: string; recurrence: string; jurisdiction: string; summary: string; evidence?: string;
}

const OBLIGATIONS: ObligationSeed[] = [
  { n: 20, title: "Renew public liability cover", owner: "Jonah Adeyemi", offset: 14, kind: "insurance", contractN: 24, status: "upcoming", recurrence: "Annual", jurisdiction: "GB", summary: "The policy lapses two days after this date." },
  { n: 21, title: "Serve lease break notice if breaking", owner: "Maya Chen", offset: 62, kind: "contract", contractN: 21, status: "upcoming", recurrence: "One-off", jurisdiction: "GB", summary: "Six months before the fourth anniversary. Missing the window keeps the studio in for the full term." },
  { n: 22, title: "VAT return — current quarter", owner: "Jonah Adeyemi", offset: 23, kind: "filing", status: "upcoming", recurrence: "Quarterly", jurisdiction: "GB", summary: "Figures are computed from posted journals. No filing connection exists." },
  { n: 23, title: "Confirmation statement", owner: "Maya Chen", offset: 41, kind: "filing", status: "upcoming", recurrence: "Annual", jurisdiction: "GB", summary: "Registered office, officers and shareholding confirmed." },
  { n: 24, title: "Annual PAT testing", owner: "Rowan Patel", offset: -6, kind: "compliance", status: "overdue", recurrence: "Annual", jurisdiction: "GB", summary: "Workshop and showroom appliances. Six days past the due date." },
  { n: 25, title: "Fire risk assessment review", owner: "Rowan Patel", offset: -22, kind: "compliance", status: "overdue", recurrence: "Annual", jurisdiction: "GB", summary: "The refit changed the showroom layout, so the assessment needs redoing." },
  { n: 26, title: "Data retention sweep", owner: "Elena Voss", offset: 8, kind: "privacy", status: "upcoming", recurrence: "Half-yearly", jurisdiction: "GB", summary: "Applicant records past their consent date must be removed." },
  { n: 27, title: "Trade terms review — Vale & Co", owner: "Priya Shah", offset: 95, kind: "contract", contractN: 22, status: "upcoming", recurrence: "Annual", jurisdiction: "GB", summary: "Price book and payment terms reviewed before renewal." },
  { n: 28, title: "Counter-sign Delacroix framework", owner: "Priya Shah", offset: 5, kind: "contract", contractN: 23, status: "upcoming", recurrence: "One-off", jurisdiction: "FR", summary: "Counterparty is French; the exclusivity clause needs local advice before signature." },
  { n: 29, title: "Employers liability certificate display", owner: "Elena Voss", offset: -1, kind: "compliance", status: "overdue", recurrence: "Annual", jurisdiction: "GB", summary: "Certificate must be available to employees. One day past due." },
  { n: 30, title: "PAYE month-end submission", owner: "Elena Voss", offset: 4, kind: "filing", status: "upcoming", recurrence: "Monthly", jurisdiction: "GB", summary: "Prepared locally from payroll inputs. Submission is not connected." },
  { n: 31, title: "Accessibility statement review", owner: "Theo Marsh", offset: 120, kind: "compliance", status: "upcoming", recurrence: "Annual", jurisdiction: "GB", summary: "Storefront statement reviewed after the refresh ships." },
  { n: 32, title: "Supplier assurance — Thames Timber", owner: "Rowan Patel", offset: 30, kind: "contract", contractN: 20, status: "upcoming", recurrence: "Annual", jurisdiction: "GB", summary: "Evidence of timber sourcing for the sustainability file.", evidence: "nl-documents-021" },
  { n: 33, title: "Defects period check — Harrow House", owner: "Maya Chen", offset: 55, kind: "contract", contractN: 25, status: "upcoming", recurrence: "One-off", jurisdiction: "GB", summary: "Six-month check inside the twelve-month defects period." },
  { n: 34, title: "Annual accounts filing", owner: "Jonah Adeyemi", offset: -70, kind: "filing", status: "done", recurrence: "Annual", jurisdiction: "GB", summary: "Completed with the accountant. Evidence pack assembled.", evidence: "nl-documents-020" },
  { n: 35, title: "Policy acknowledgement sweep", owner: "Elena Voss", offset: -40, kind: "privacy", status: "done", recurrence: "Half-yearly", jurisdiction: "GB", summary: "Nine of fourteen people acknowledged the handbook." },
];

interface RiskSeed {
  n: number; title: string; category: string; impact: string; likelihood: string; owner: string;
  status: string; mitigation: string; control: string; summary: string;
}

const RISKS: RiskSeed[] = [
  { n: 20, title: "Single brass collar supplier", category: "operational", impact: "high", likelihood: "medium", owner: "Rowan Patel", status: "open", mitigation: "Qualify a second supplier before the 140-unit batch.", control: "Supplier review each quarter", summary: "The whole winter run depends on one collar source." },
  { n: 21, title: "Oak delivery delay stalls the refit", category: "operational", impact: "medium", likelihood: "high", owner: "Priya Shah", status: "open", mitigation: "Ask for a partial delivery of the counter top; reschedule the joinery task.", control: "Weekly site walk", summary: "The joinery task is already blocked." },
  { n: 22, title: "Upward-only rent review", category: "financial", impact: "high", likelihood: "medium", owner: "Maya Chen", status: "open", mitigation: "Model the review at index plus two percent in the cash plan.", control: "Lease obligation calendar", summary: "The studio lease reviews rent upward only at year three." },
  { n: 23, title: "City exclusivity in the hotel framework", category: "legal", impact: "high", likelihood: "medium", owner: "Priya Shah", status: "open", mitigation: "Narrow the clause to named properties before signature.", control: "Contract review gate", summary: "As drafted it would block other London hotel work." },
  { n: 24, title: "Overdue fire risk assessment", category: "compliance", impact: "high", likelihood: "low", owner: "Rowan Patel", status: "open", mitigation: "Book the assessor for the week the refit layout settles.", control: "Obligation calendar", summary: "The showroom layout has changed since the last assessment." },
  { n: 25, title: "Applicant data kept past consent", category: "privacy", impact: "medium", likelihood: "medium", owner: "Elena Voss", status: "mitigating", mitigation: "Retention sweep runs with the consent dates shown on each applicant.", control: "Half-yearly retention sweep", summary: "Consent dates are recorded on every applicant record." },
  { n: 26, title: "Driver batch fault across fittings", category: "operational", impact: "high", likelihood: "medium", owner: "Marcus Reiss", status: "open", mitigation: "Trace the batch through the open care cases before shipping batch two.", control: "Case trend review", summary: "Two open cases describe the same low-brightness buzz." },
  { n: 27, title: "Key person dependency on the founder", category: "operational", impact: "high", likelihood: "medium", owner: "Maya Chen", status: "mitigating", mitigation: "Studio manager backfill is open; handover notes are in the workshop channel.", control: "Succession review", summary: "Design sign-off and supplier relationships both sit with one person." },
  { n: 28, title: "Workspace data lives only in one browser", category: "security", impact: "high", likelihood: "medium", owner: "Maya Chen", status: "open", mitigation: "Export the ledger and people data weekly until a backed-up service exists.", control: "Weekly export", summary: "Nothing in this workspace is backed up anywhere else." },
  { n: 29, title: "Unclear contractor status", category: "legal", impact: "medium", likelihood: "low", owner: "Elena Voss", status: "mitigating", mitigation: "Keep the working practices consistent with the written agreement.", control: "Annual contractor review", summary: "Two contractors work on long engagements." },
  { n: 30, title: "Carrier damage on glass shades", category: "operational", impact: "medium", likelihood: "medium", owner: "Daniel Okafor", status: "closed", mitigation: "Double-walled cartons introduced in the autumn.", control: "Packing standard", summary: "Closed after the packing change; no damage case since." },
];

registerSeed("legal", (ctx) => {
  const records: Rec[] = [
    ...CONTRACTS.map((contract) => ctx.rec({
      org: "nl", collection: "contracts", n: contract.n, title: contract.title, status: contract.status,
      summary: contract.summary, owner: contract.owner,
      amountMinor: contract.valueMinor || undefined,
      startAt: day(ctx.now, contract.start), endAt: day(ctx.now, contract.end), dueAt: day(ctx.now, contract.end),
      at: day(ctx.now, contract.signed ?? contract.start),
      tags: [contract.type, contract.status],
      fields: {
        counterparty: contract.counterparty, type: contract.type, owner: contract.owner,
        noticeDays: contract.noticeDays, signedAt: contract.signed === undefined ? "" : day(ctx.now, contract.signed),
        signatureProvider: "not_connected", clauseCount: contract.clauses.length,
        versions: contract.priorText ? 2 : 1, immutableSigned: contract.signed !== undefined,
        valueMinor: contract.valueMinor,
      },
      body: {
        clauses: contract.clauses,
        versions: contract.priorText
          ? [
            { label: "Counterparty draft", at: day(ctx.now, contract.start - 12), author: contract.counterparty, text: contract.priorText },
            { label: "Our mark-up", at: day(ctx.now, contract.start - 3), author: contract.owner, text: contract.currentText ?? contract.priorText },
          ]
          : [{ label: contract.signed === undefined ? "Working draft" : "Executed version", at: day(ctx.now, contract.signed ?? contract.start), author: contract.owner, text: contract.clauses[0]?.text ?? "" }],
        signatures: contract.signed === undefined
          ? []
          : [
            { party: "Northline Atelier", name: contract.owner, at: day(ctx.now, contract.signed), method: "Signed on paper and scanned into this workspace" },
            { party: contract.counterparty, name: "Authorised signatory", at: day(ctx.now, contract.signed + 1), method: "Signed on paper and scanned into this workspace" },
          ],
      },
    })),
    ...OBLIGATIONS.map((obligation) => ctx.rec({
      org: "nl", collection: "obligations", n: obligation.n, title: obligation.title, status: obligation.status,
      summary: obligation.summary, owner: obligation.owner,
      dueAt: day(ctx.now, obligation.offset), at: day(ctx.now, obligation.offset - 30),
      tags: [obligation.kind, obligation.recurrence.toLowerCase()],
      fields: {
        kind: obligation.kind, owner: obligation.owner, recurrence: obligation.recurrence,
        jurisdiction: obligation.jurisdiction, timezone: obligation.jurisdiction === "FR" ? "Europe/Paris" : "Europe/London",
        contractId: obligation.contractN ? `nl-contracts-${String(obligation.contractN).padStart(3, "0")}` : "",
        evidenceId: obligation.evidence ?? "", reminderDays: 14,
      },
    })),
    ...RISKS.map((risk) => {
      const scoreMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
      const score = (scoreMap[risk.impact] ?? 1) * (scoreMap[risk.likelihood] ?? 1);
      return ctx.rec({
        org: "nl", collection: "risks", n: risk.n, title: risk.title, status: risk.status,
        summary: risk.summary, owner: risk.owner,
        at: day(ctx.now, -45), dueAt: day(ctx.now, 60),
        tags: [risk.category, risk.impact],
        fields: {
          category: risk.category, impact: risk.impact, likelihood: risk.likelihood, score,
          mitigation: risk.mitigation, control: risk.control, reviewedAt: day(ctx.now, -45).slice(0, 10),
          aiSuggested: risk.n === 26,
        },
      });
    }),
    ...[
      { n: 20, title: "Annual accounts evidence pack", items: 14, hold: false, summary: "Trial balance, bank statements and the accountant's queries for the last year end." },
      { n: 21, title: "Timber sourcing assurance", items: 6, hold: false, summary: "Supplier declarations and delivery notes for the showroom joinery." },
      { n: 22, title: "Harrow House commission file", items: 23, hold: true, summary: "Drawings, sign-offs and the open defects case. Held while the shade case is open." },
      { n: 23, title: "Workshop safety file", items: 19, hold: false, summary: "Risk assessments, airflow tests and the accident book extracts." },
      { n: 24, title: "Delacroix negotiation pack", items: 9, hold: false, summary: "Drafts, mark-ups and the NDA covering the framework discussion." },
      { n: 25, title: "Payroll evidence — last three periods", items: 11, hold: false, summary: "Inputs, approvals and the exported CSV for the accountant." },
      { n: 26, title: "Export request — insurer", items: 4, hold: true, summary: "Documents requested by the insurer. Export is restricted while the hold is on." },
    ].map((pack) => ctx.rec({
      org: "nl", collection: "documents", n: pack.n, title: pack.title, status: pack.hold ? "held" : "assembled",
      summary: pack.summary, owner: "Maya Chen", at: day(ctx.now, -20),
      tags: ["evidence"],
      fields: {
        kind: "evidencePack", items: pack.items, legalHold: pack.hold,
        hash: `sha256:${pack.title.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}${pack.items}`,
        assembledBy: "Maya Chen", exportable: !pack.hold,
      },
    })),
    ctx.rec({
      org: "nl", collection: "policies", n: 40, title: "Information security policy", status: "published",
      summary: "What is held in this workspace, who can open it and what is never collected.", owner: "Maya Chen",
      at: day(ctx.now, -120), dueAt: day(ctx.now, 245), tags: ["governance"],
      fields: { kind: "governance", version: "2.0", acknowledgementRequired: true, acknowledged: 12, audience: "All employees" },
    }),
    ctx.rec({
      org: "nl", collection: "policies", n: 41, title: "AI use policy", status: "published",
      summary: "An AI employee drafts and summarises. A named person decides and approves.", owner: "Maya Chen",
      at: day(ctx.now, -33), dueAt: day(ctx.now, 332), tags: ["governance"],
      fields: { kind: "governance", version: "1.2", acknowledgementRequired: true, acknowledged: 11, audience: "All employees" },
    }),
    ctx.rec({
      org: "nl", collection: "policies", n: 42, title: "Anti-bribery policy", status: "due_review",
      summary: "Gifts, hospitality and what must be recorded. Review date has passed.", owner: "Maya Chen",
      at: day(ctx.now, -400), dueAt: day(ctx.now, -35), tags: ["governance"],
      fields: { kind: "governance", version: "1.0", acknowledgementRequired: false, acknowledged: 0, audience: "All employees" },
    }),
    ctx.rec({
      org: "nl", collection: "policies", n: 43, title: "Supplier code of conduct", status: "draft",
      summary: "Draft for the sustainability file. Not published and not acknowledged by anyone.", owner: "Rowan Patel",
      at: day(ctx.now, -8), dueAt: day(ctx.now, 30), tags: ["governance"],
      fields: { kind: "governance", version: "0.4", acknowledgementRequired: false, acknowledged: 0, audience: "Suppliers" },
    }),
    ctx.rec({
      org: "hb", collection: "contracts", n: 20, title: "Brooklyn yard lease", status: "active",
      summary: "Yard and office on a three-year lease.", owner: "Elena Ward",
      amountMinor: 7_200_000, startAt: day(ctx.now, -500), endAt: day(ctx.now, 595), dueAt: day(ctx.now, 595),
      tags: ["lease", "active"],
      fields: { counterparty: "Vanderveer Holdings", type: "lease", owner: "Elena Ward", noticeDays: 90, signedAt: day(ctx.now, -502), signatureProvider: "not_connected", clauseCount: 6, versions: 1, immutableSigned: true, valueMinor: 7_200_000 },
      body: { clauses: STANDARD_CLAUSES, versions: [{ label: "Executed version", at: day(ctx.now, -502), author: "Elena Ward", text: STANDARD_CLAUSES[0].text }], signatures: [{ party: "Harbor Supply", name: "Elena Ward", at: day(ctx.now, -502), method: "Signed on paper and scanned into this workspace" }] },
    }),
    ctx.rec({
      org: "hb", collection: "obligations", n: 20, title: "Sales tax filing", status: "upcoming",
      summary: "Prepared from posted journals. Submission is not connected.", owner: "Elena Ward",
      dueAt: day(ctx.now, 11), tags: ["filing", "quarterly"],
      fields: { kind: "filing", owner: "Elena Ward", recurrence: "Quarterly", jurisdiction: "US-NY", timezone: "America/New_York", contractId: "", evidenceId: "", reminderDays: 14 },
    }),
    ctx.rec({
      org: "hb", collection: "risks", n: 20, title: "Racking replacement interrupts intake", status: "open",
      summary: "Two bays out of service at the busiest intake period.", owner: "Marcus Hale",
      at: day(ctx.now, -20), dueAt: day(ctx.now, 30), tags: ["operational", "medium"],
      fields: { category: "operational", impact: "medium", likelihood: "high", score: 6, mitigation: "Sequence the bays so one is always live.", control: "Weekly yard plan", reviewedAt: day(ctx.now, -20).slice(0, 10), aiSuggested: false },
    }),
  ];
  return { records };
});
