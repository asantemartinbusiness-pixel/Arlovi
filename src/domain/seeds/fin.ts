import { registerSeed, type SeedContext, type SeedRecordInput } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";
import type { JLine } from "@/domain/finance";
import { computeInvoice, type CustomerTaxStatus, type TaxCategory } from "@/platform/money";

/* ------------------------------------------------------------------ *
 * Finance fixtures.
 *
 * A credible small company: a real chart of accounts, three months of
 * balanced journals, a dozen invoices across every state, suppliers, bills,
 * receipted expenses, an imported bank statement that does not quite tie, and
 * budgets to vary against. Ids start at n:20 so nothing collides with the base
 * seed. Every posted journal balances to the penny.
 * ------------------------------------------------------------------ */

const E1 = "nl-legalEntities-001";
const E2 = "nl-legalEntities-720";

/** Northline account ids by code, including the twelve from the base seed. */
const NL: Record<string, string> = {
  "1000": "nl-accounts-001",
  "1100": "nl-accounts-002",
  "1200": "nl-accounts-003",
  "2000": "nl-accounts-004",
  "2100": "nl-accounts-005",
  "3000": "nl-accounts-006",
  "4000": "nl-accounts-007",
  "4100": "nl-accounts-008",
  "5000": "nl-accounts-009",
  "6100": "nl-accounts-010",
  "6200": "nl-accounts-011",
  "6300": "nl-accounts-012",
  "1010": "nl-accounts-720",
  "1500": "nl-accounts-721",
  "1510": "nl-accounts-722",
  "1900": "nl-accounts-723",
  "2200": "nl-accounts-724",
  "2700": "nl-accounts-725",
  "2900": "nl-accounts-726",
  "3100": "nl-accounts-727",
  "4300": "nl-accounts-728",
  "5100": "nl-accounts-729",
  "6000": "nl-accounts-730",
  "6400": "nl-accounts-731",
  "6500": "nl-accounts-732",
  "6600": "nl-accounts-733",
  "6700": "nl-accounts-734",
};

const HB: Record<string, string> = {
  "1000": "hb-accounts-001",
  "3000": "hb-accounts-002",
  "1100": "hb-accounts-720",
  "2100": "hb-accounts-721",
  "4000": "hb-accounts-722",
  "5000": "hb-accounts-723",
  "6100": "hb-accounts-724",
};

interface AccountSpec {
  n: number;
  code: string;
  title: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  summary: string;
  parentCode?: string;
  cash?: boolean;
  status?: string;
}

const NL_ACCOUNTS: AccountSpec[] = [
  { n: 720, code: "1010", title: "Savings account", type: "asset", summary: "Instant-access reserve held against the winter run.", cash: true },
  { n: 721, code: "1500", title: "Workshop equipment", type: "asset", summary: "Benches, press and the brass lathe at cost." },
  { n: 722, code: "1510", title: "Accumulated depreciation", type: "asset", summary: "Contra-asset. Carries a credit balance against 1500." },
  { n: 723, code: "1900", title: "Intercompany receivable", type: "asset", summary: "Owed to Northline Atelier by Northline Studio." },
  { n: 724, code: "2200", title: "Payroll liabilities", type: "liability", summary: "Net pay and deductions accrued but not yet paid." },
  { n: 725, code: "2700", title: "Director loan", type: "liability", summary: "Loan from the founder, repayable on demand." },
  { n: 726, code: "2900", title: "Intercompany payable", type: "liability", summary: "Owed by Northline Studio to Northline Atelier." },
  { n: 727, code: "3100", title: "Retained earnings", type: "equity", summary: "Brought-forward result. Nothing has been posted to it yet." },
  { n: 728, code: "4300", title: "Delivery income", type: "revenue", summary: "Carriage charged on trade orders." },
  { n: 729, code: "5100", title: "Carriage inwards", type: "expense", summary: "Inbound freight on components." },
  { n: 730, code: "6000", title: "Marketing", type: "expense", summary: "Trade press, photography and paid social." },
  { n: 731, code: "6400", title: "Insurance", type: "expense", summary: "Public liability and stock cover." },
  { n: 732, code: "6500", title: "Depreciation", type: "expense", summary: "Straight line over five years on workshop equipment." },
  { n: 733, code: "6600", title: "Bank charges", type: "expense", summary: "Account and card fees." },
  { n: 734, code: "6700", title: "Professional fees", type: "expense", summary: "Accountancy and legal." },
  { n: 735, code: "6800", title: "Trade show (closed)", type: "expense", summary: "Used for the 2025 fair. Kept for history, no longer selectable.", status: "inactive" },
];

const HB_ACCOUNTS: AccountSpec[] = [
  { n: 720, code: "1100", title: "Accounts receivable", type: "asset", summary: "Open customer balances in dollars." },
  { n: 721, code: "2100", title: "Sales tax payable", type: "liability", summary: "New York State and City sales tax collected." },
  { n: 722, code: "4000", title: "Product revenue", type: "revenue", summary: "Hardware and fittings." },
  { n: 723, code: "5000", title: "Cost of goods", type: "expense", summary: "Landed cost of goods sold." },
  { n: 724, code: "6100", title: "Rent", type: "expense", summary: "Brooklyn unit." },
];

interface JournalSpec {
  n: number;
  date: string;
  title: string;
  memo: string;
  lines: [code: string, debit: number, credit: number][];
  status?: string;
  entityId?: string;
  intercompany?: boolean;
  source?: string;
}

const NL_JOURNALS: JournalSpec[] = [
  { n: 720, date: "2026-09-02", title: "Issue INV-1020", memo: "Six pendants for Fitzrovia House.", source: "invoice",
    lines: [["1100", 252_000, 0], ["4000", 0, 210_000], ["2100", 0, 42_000]] },
  { n: 721, date: "2026-09-05", title: "Rent September", memo: "Clerkenwell studio rent accrued.",
    lines: [["6100", 250_000, 0], ["2000", 0, 250_000]] },
  { n: 722, date: "2026-09-08", title: "Pay rent September", memo: "Bank transfer to the landlord.",
    lines: [["2000", 250_000, 0], ["1000", 0, 250_000]] },
  { n: 723, date: "2026-09-15", title: "Receipt INV-1020", memo: "Faster payment received in full.", source: "payment",
    lines: [["1000", 252_000, 0], ["1100", 0, 252_000]] },
  { n: 724, date: "2026-09-20", title: "Wages September", memo: "Four people, gross and deductions accrued.",
    lines: [["6300", 920_000, 0], ["2200", 0, 920_000]] },
  { n: 725, date: "2026-09-22", title: "Pay September payroll", memo: "Net pay leaves the current account.",
    lines: [["2200", 920_000, 0], ["1000", 0, 920_000]] },
  { n: 726, date: "2026-09-25", title: "Buy brass lathe", memo: "Capital purchase, five-year life.",
    lines: [["1500", 480_000, 0], ["1000", 0, 480_000]] },
  { n: 727, date: "2026-09-30", title: "Depreciation September", memo: "Straight line on workshop equipment.",
    lines: [["6500", 8_000, 0], ["1510", 0, 8_000]] },

  { n: 728, date: "2026-10-01", title: "Rent October", memo: "Clerkenwell studio rent accrued.",
    lines: [["6100", 250_000, 0], ["2000", 0, 250_000]] },
  { n: 729, date: "2026-10-03", title: "Issue INV-1024", memo: "Specification visit for Martins Studio.", source: "invoice",
    lines: [["1100", 144_000, 0], ["4100", 0, 120_000], ["2100", 0, 24_000]] },
  { n: 730, date: "2026-10-06", title: "Paid social October", memo: "Card payment for the winter campaign.",
    lines: [["6000", 36_000, 0], ["1000", 0, 36_000]] },
  { n: 731, date: "2026-10-10", title: "Brass collars received", memo: "PO-184 goods into inventory.",
    lines: [["1200", 192_000, 0], ["2000", 0, 192_000]] },
  { n: 732, date: "2026-10-12", title: "Insurance renewal", memo: "Annual public liability premium.",
    lines: [["6400", 72_000, 0], ["1000", 0, 72_000]] },
  { n: 733, date: "2026-10-18", title: "Receipt INV-1024", memo: "Bank transfer received.", source: "payment",
    lines: [["1000", 144_000, 0], ["1100", 0, 144_000]] },
  { n: 734, date: "2026-10-20", title: "Wages October", memo: "Four people, gross and deductions accrued.",
    lines: [["6300", 920_000, 0], ["2200", 0, 920_000]] },
  { n: 735, date: "2026-10-21", title: "Pay October payroll", memo: "Net pay leaves the current account.",
    lines: [["2200", 920_000, 0], ["1000", 0, 920_000]] },
  { n: 736, date: "2026-10-26", title: "Director loan drawn", memo: "Founder lends against the winter stock build.",
    lines: [["1000", 1_500_000, 0], ["2700", 0, 1_500_000]] },
  { n: 737, date: "2026-10-28", title: "Cost of goods October", memo: "Components consumed on despatched orders.",
    lines: [["5000", 128_000, 0], ["1200", 0, 128_000]] },
  { n: 738, date: "2026-10-31", title: "Depreciation October", memo: "Straight line on workshop equipment.",
    lines: [["6500", 8_000, 0], ["1510", 0, 8_000]] },
  { n: 739, date: "2026-10-31", title: "Bank charges October", memo: "Account fee and card charges.",
    lines: [["6600", 2_400, 0], ["1000", 0, 2_400]] },

  { n: 740, date: "2026-11-04", title: "Carriage inwards", memo: "Freight on the brass collar delivery.",
    lines: [["5100", 14_400, 0], ["2000", 0, 14_400]] },
  { n: 741, date: "2026-11-03", title: "Issue INV-1055", memo: "Four Arc Lamps and delivery for Berg Interiors.", source: "invoice",
    lines: [["1100", 468_000, 0], ["4000", 0, 380_000], ["4300", 0, 10_000], ["2100", 0, 78_000]] },
  { n: 742, date: "2026-11-05", title: "Issue INV-1056", memo: "Lighting plan for Ravensworth Hotel.", source: "invoice",
    lines: [["1100", 86_400, 0], ["4100", 0, 72_000], ["2100", 0, 14_400]] },
  { n: 743, date: "2026-11-06", title: "Accountancy quarter", memo: "Quarterly bookkeeping review.",
    lines: [["6700", 45_000, 0], ["2000", 0, 45_000]] },
  { n: 744, date: "2026-11-07", title: "Receipt INV-1055 part", memo: "Part payment on account.", source: "payment",
    lines: [["1000", 200_000, 0], ["1100", 0, 200_000]] },
  { n: 745, date: "2026-11-09", title: "Fund Northline Studio", memo: "Working capital advanced to the subsidiary.", entityId: E1, intercompany: true,
    lines: [["1900", 300_000, 0], ["1000", 0, 300_000]] },
  { n: 746, date: "2026-11-09", title: "Studio receives funding", memo: "Mirror of the intercompany advance.", entityId: E2, intercompany: true,
    lines: [["1000", 300_000, 0], ["2900", 0, 300_000]] },
  { n: 747, date: "2026-11-10", title: "Cost of goods November", memo: "Components consumed on the Berg order.",
    lines: [["5000", 96_000, 0], ["1200", 0, 96_000]] },
  { n: 748, date: "2026-11-11", title: "Paid social November", memo: "Card payment for the trade list campaign.",
    lines: [["6000", 28_000, 0], ["1000", 0, 28_000]] },
  { n: 749, date: "2026-11-12", title: "Transfer to savings", memo: "Reserve set aside for the January VAT payment.",
    lines: [["1010", 500_000, 0], ["1000", 0, 500_000]] },
  { n: 750, date: "2026-11-13", title: "Depreciation November", memo: "Straight line on workshop equipment.",
    lines: [["6500", 8_000, 0], ["1510", 0, 8_000]] },

  { n: 751, date: "2026-11-14", title: "Accrue November wages", memo: "Prepared by Idris Cole. Balanced and waiting for Finance to post.", status: "draft",
    lines: [["6300", 940_000, 0], ["2200", 0, 940_000]] },
  { n: 752, date: "2026-11-14", title: "Courier charge from statement", memo: "Drafted from an unmatched statement line. One side is still missing.", status: "draft",
    lines: [["6600", 14_000, 0], ["1000", 0, 0]] },
];

const HB_JOURNALS: JournalSpec[] = [
  { n: 720, date: "2026-10-08", title: "Issue HB-204", memo: "Dock cleats for Pier 9 Marina.", source: "invoice",
    lines: [["1100", 108_880, 0], ["4000", 0, 100_000], ["2100", 0, 8_880]] },
  { n: 721, date: "2026-10-22", title: "Receipt HB-204", memo: "ACH received in full.", source: "payment",
    lines: [["1000", 108_880, 0], ["1100", 0, 108_880]] },
  { n: 722, date: "2026-11-01", title: "Rent November", memo: "Brooklyn unit rent paid.",
    lines: [["6100", 180_000, 0], ["1000", 0, 180_000]] },
  { n: 723, date: "2026-11-05", title: "Cost of goods November", memo: "Cleats and fixings shipped.",
    lines: [["5000", 42_000, 0], ["1000", 0, 42_000]] },
  { n: 724, date: "2026-11-10", title: "Issue HB-208", memo: "Stainless fittings, resale certificate on file.", source: "invoice",
    lines: [["1100", 64_000, 0], ["4000", 0, 64_000]] },
];

interface LineSpec {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
  discountBp?: number;
  accountCode?: string;
}

interface InvoiceSpec {
  n: number;
  number: string;
  status: string;
  at: string;
  dueAt: string;
  contactId: string;
  summary: string;
  lines: LineSpec[];
  journalId?: string;
  paymentJournalId?: string;
  paidMinor?: number;
  customerTaxStatus?: CustomerTaxStatus;
  voidReason?: string;
  revenueCode?: string;
}

/**
 * Seed totals come from the same engine the screens use, so a fixture can
 * never claim a figure the application would not compute.
 */
function lineTotals(spec: InvoiceSpec, jurisdiction: string) {
  const totals = computeInvoice({
    lines: spec.lines.map((line, index) => ({ id: `l${index + 1}`, ...line })),
    jurisdiction,
    customerStatus: spec.customerTaxStatus ?? "domestic",
    date: spec.at,
  });
  return { netMinor: totals.netMinor, taxMinor: totals.taxMinor, hasUnknownRate: totals.hasUnknownRate };
}

const NL_INVOICES: InvoiceSpec[] = [
  { n: 720, number: "INV-1020", status: "paid", at: "2026-09-02", dueAt: "2026-09-30", contactId: "nl-contacts-720",
    summary: "Six pendants for the Fitzrovia stair.", journalId: "nl-journals-720", paymentJournalId: "nl-journals-723", paidMinor: 252_000,
    lines: [{ description: "Pendant Eight, antique brass", quantity: 6, unitPriceMinor: 35_000, taxCategory: "standard", accountCode: "4000" }] },
  { n: 721, number: "INV-1024", status: "paid", at: "2026-10-03", dueAt: "2026-10-24", contactId: "nl-contacts-002",
    summary: "On-site specification visit and drawing pack.", journalId: "nl-journals-729", paymentJournalId: "nl-journals-733", paidMinor: 144_000, revenueCode: "4100",
    lines: [{ description: "On-site specification, 8 hours", quantity: 8, unitPriceMinor: 15_000, taxCategory: "standard", accountCode: "4100" }] },
  { n: 722, number: "INV-1055", status: "awaiting_payment", at: "2026-11-03", dueAt: "2026-11-24", contactId: "nl-contacts-003",
    summary: "Four Arc Lamps with delivery to Shoreditch.", journalId: "nl-journals-741", paidMinor: 200_000,
    lines: [
      { description: "Arc Lamp, brushed brass", quantity: 4, unitPriceMinor: 95_000, taxCategory: "standard", accountCode: "4000" },
      { description: "Delivery and installation", quantity: 1, unitPriceMinor: 10_000, taxCategory: "standard", accountCode: "4300" },
    ] },
  { n: 723, number: "INV-1056", status: "awaiting_payment", at: "2026-11-05", dueAt: "2026-11-26", contactId: "nl-contacts-721",
    summary: "Lighting plan for the Ravensworth refurbishment.", journalId: "nl-journals-742", revenueCode: "4100",
    lines: [{ description: "Lighting plan, stage one", quantity: 1, unitPriceMinor: 72_000, taxCategory: "standard", accountCode: "4100" }] },
  { n: 724, number: "INV-1042", status: "awaiting_payment", at: "2026-09-18", dueAt: "2026-10-09", contactId: "nl-contacts-722",
    summary: "Replacement shades. Chased twice, still open.",
    lines: [{ description: "Shade linen, replacement", quantity: 9, unitPriceMinor: 8_000, taxCategory: "standard", accountCode: "4000" }] },
  { n: 725, number: "INV-1047", status: "awaiting_payment", at: "2026-10-08", dueAt: "2026-10-22", contactId: "nl-contacts-723",
    summary: "Trade order with the eight-piece discount applied.",
    lines: [
      { description: "Pendant Eight, trade", quantity: 12, unitPriceMinor: 30_000, taxCategory: "standard", discountBp: 1_000, accountCode: "4000" },
      { description: "Carriage", quantity: 1, unitPriceMinor: 4_500, taxCategory: "standard", accountCode: "4300" },
    ] },
  { n: 726, number: "INV-1058", status: "awaiting_payment", at: "2026-11-10", dueAt: "2026-12-08", contactId: "nl-contacts-724",
    summary: "Export order to Oslo. Zero-rated with evidence of export on file.", customerTaxStatus: "export",
    lines: [{ description: "Arc Lamp, brushed brass", quantity: 3, unitPriceMinor: 95_000, taxCategory: "standard", accountCode: "4000" }] },
  { n: 727, number: "INV-1059", status: "draft", at: "2026-11-12", dueAt: "2026-12-10", contactId: "nl-contacts-725",
    summary: "Draft for a Dublin trade customer. The reduced-rate line has no approved rate for an EU business.", customerTaxStatus: "eu_business",
    lines: [
      { description: "Pendant Eight, trade", quantity: 8, unitPriceMinor: 30_000, taxCategory: "reverse_charge", accountCode: "4000" },
      { description: "Installation guide printing", quantity: 1, unitPriceMinor: 12_000, taxCategory: "reduced", accountCode: "4100" },
    ] },
  { n: 728, number: "INV-1060", status: "draft", at: "2026-11-13", dueAt: "2026-12-11", contactId: "nl-contacts-726",
    summary: "Draft for the Southwark community hall. Exempt supply under the charity exemption.",
    lines: [{ description: "Hall lighting refit, labour", quantity: 1, unitPriceMinor: 140_000, taxCategory: "exempt", accountCode: "4100" }] },
  { n: 729, number: "INV-1051", status: "void", at: "2026-10-20", dueAt: "2026-11-03", contactId: "nl-contacts-727",
    summary: "Raised against the wrong account and voided the same week.", voidReason: "Raised against the wrong customer record.",
    lines: [{ description: "Arc Lamp, brushed brass", quantity: 1, unitPriceMinor: 95_000, taxCategory: "standard", accountCode: "4000" }] },
  { n: 730, number: "INV-1061", status: "awaiting_payment", at: "2026-11-13", dueAt: "2026-12-13", contactId: "nl-contacts-728",
    summary: "Replacement parts, zero-rated books and care guide bundled with labour.",
    lines: [
      { description: "Care guide, printed", quantity: 20, unitPriceMinor: 900, taxCategory: "zero_rated", accountCode: "4000" },
      { description: "Rewiring labour", quantity: 4, unitPriceMinor: 9_500, taxCategory: "standard", accountCode: "4100" },
    ] },
  { n: 731, number: "INV-1062", status: "awaiting_payment", at: "2026-11-11", dueAt: "2026-11-13", contactId: "nl-contacts-729",
    summary: "Short-dated invoice for a showroom collection. No tax status recorded for this customer yet.",
    lines: [{ description: "Shade linen, replacement", quantity: 2, unitPriceMinor: 8_000, taxCategory: "standard", accountCode: "4000" }] },
];

const HB_INVOICES: InvoiceSpec[] = [
  { n: 720, number: "HB-204", status: "paid", at: "2026-10-08", dueAt: "2026-10-29", contactId: "hb-contacts-001",
    summary: "Dock cleats for Pier 9 Marina.", journalId: "hb-journals-720", paymentJournalId: "hb-journals-721", paidMinor: 108_880,
    lines: [{ description: "Stainless dock cleat, 10 inch", quantity: 20, unitPriceMinor: 5_000, taxCategory: "standard", accountCode: "4000" }] },
  { n: 721, number: "HB-208", status: "awaiting_payment", at: "2026-11-10", dueAt: "2026-12-10", contactId: "hb-contacts-720",
    summary: "Stainless fittings. Resale certificate held, so no sales tax is charged.", journalId: "hb-journals-724", customerTaxStatus: "domestic_exempt",
    lines: [{ description: "Stainless fittings, assorted", quantity: 1, unitPriceMinor: 64_000, taxCategory: "exempt", accountCode: "4000" }] },
];

/* ----------------------- Bank statement ------------------------ */

interface StatementSpec {
  n: number;
  title: string;
  date: string;
  amountMinor: number;
  matchedJournalId?: string;
  reference: string;
}

const NL_STATEMENT: StatementSpec[] = [
  { n: 720, title: "Faster payment · Berg Interiors", date: "2026-11-07", amountMinor: 200_000, matchedJournalId: "nl-journals-744", reference: "FP BERG INTERIORS INV1055" },
  { n: 721, title: "Transfer · Northline Studio", date: "2026-11-09", amountMinor: -300_000, matchedJournalId: "nl-journals-745", reference: "TFR NORTHLINE STUDIO" },
  { n: 722, title: "Card · paid social", date: "2026-11-11", amountMinor: -28_000, matchedJournalId: "nl-journals-748", reference: "CRD SOCIAL ADS 4412" },
  { n: 723, title: "Transfer · savings", date: "2026-11-12", amountMinor: -500_000, matchedJournalId: "nl-journals-749", reference: "TFR SAVINGS RESERVE" },
  { n: 724, title: "Bank charges", date: "2026-10-31", amountMinor: -2_400, matchedJournalId: "nl-journals-739", reference: "ACCOUNT FEE OCT" },
  { n: 725, title: "Card · courier", date: "2026-11-10", amountMinor: -14_000, reference: "CRD CITY COURIER 4412" },
  { n: 726, title: "Unidentified credit", date: "2026-11-13", amountMinor: 45_000, reference: "BACS CREDIT REF 88213" },
  { n: 727, title: "Direct debit · utilities", date: "2026-11-12", amountMinor: -7_200, reference: "DD CLERKENWELL POWER" },
  { n: 728, title: "Insurance premium", date: "2026-10-12", amountMinor: -72_000, matchedJournalId: "nl-journals-732", reference: "DD LIABILITY COVER" },
  { n: 729, title: "Card · paid social October", date: "2026-10-06", amountMinor: -36_000, matchedJournalId: "nl-journals-730", reference: "CRD SOCIAL ADS 4412" },
];

/** Closing balance on the imported statement for account 1000. */
const STATEMENT_CLOSING_MINOR = 7_613_600;

/* --------------------------- Builder --------------------------- */

function journalRecord(context: SeedContext, org: "nl" | "hb", codes: Record<string, string>, spec: JournalSpec): Rec {
  const lines: JLine[] = spec.lines.map(([code, debit, credit]) => ({
    accountId: codes[code] ?? code,
    debitMinor: debit,
    creditMinor: credit,
    memo: spec.memo,
  }));
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const fields: Record<string, string | number | boolean> = { date: spec.date };
  if (spec.entityId) fields.entityId = spec.entityId;
  if (spec.intercompany) fields.intercompany = true;
  if (spec.source) fields.source = spec.source;
  return context.rec({
    org,
    collection: "journals",
    n: spec.n,
    title: spec.title,
    status: spec.status ?? "posted",
    summary: spec.memo,
    amountMinor: debit,
    at: `${spec.date}T09:00:00.000Z`,
    createdAt: `${spec.date}T08:30:00.000Z`,
    owner: "Jonah Adeyemi",
    tags: spec.intercompany ? ["ledger", "intercompany"] : ["ledger"],
    fields,
    body: { date: spec.date, memo: spec.memo, lines },
  });
}

function invoiceRecord(context: SeedContext, org: "nl" | "hb", spec: InvoiceSpec, jurisdiction: string): Rec {
  const totals = lineTotals(spec, jurisdiction);
  const fields: Record<string, string | number | boolean> = {
    number: spec.number,
    contactId: spec.contactId,
    netMinor: totals.netMinor,
    taxMinor: totals.taxMinor,
  };
  if (totals.hasUnknownRate) fields.taxUnresolved = true;
  if (spec.journalId) fields.journalId = spec.journalId;
  if (spec.paymentJournalId) fields.paymentJournalId = spec.paymentJournalId;
  if (spec.paidMinor) fields.paidMinor = spec.paidMinor;
  if (spec.customerTaxStatus) fields.customerTaxStatus = spec.customerTaxStatus;
  if (spec.voidReason) fields.voidReason = spec.voidReason;
  if (spec.revenueCode) fields.revenueCode = spec.revenueCode;
  return context.rec({
    org,
    collection: "invoices",
    n: spec.n,
    title: spec.number,
    status: spec.status,
    summary: spec.summary,
    amountMinor: totals.netMinor + totals.taxMinor,
    at: `${spec.at}T09:00:00.000Z`,
    dueAt: `${spec.dueAt}T00:00:00.000Z`,
    createdAt: `${spec.at}T08:00:00.000Z`,
    owner: org === "nl" ? "Jonah Adeyemi" : "Elena Ward",
    parentId: spec.contactId,
    tags: spec.status === "draft" ? ["draft"] : ["issued"],
    fields,
    body: { lines: spec.lines.map((line, index) => ({ id: `l${index + 1}`, ...line })) },
  });
}

function accountRecord(context: SeedContext, org: "nl" | "hb", spec: AccountSpec): Rec {
  return context.rec({
    org,
    collection: "accounts",
    n: spec.n,
    title: spec.title,
    status: spec.status ?? "active",
    summary: spec.summary,
    owner: org === "nl" ? "Jonah Adeyemi" : "Elena Ward",
    tags: spec.cash ? [spec.type, "cash"] : [spec.type],
    fields: spec.parentCode ? { code: spec.code, type: spec.type, parentCode: spec.parentCode } : { code: spec.code, type: spec.type },
  });
}

registerSeed("fin", (context) => {
  const records: Rec[] = [];
  const push = (input: SeedRecordInput) => records.push(context.rec(input));

  for (const spec of NL_ACCOUNTS) records.push(accountRecord(context, "nl", spec));
  for (const spec of HB_ACCOUNTS) records.push(accountRecord(context, "hb", spec));
  for (const spec of NL_JOURNALS) records.push(journalRecord(context, "nl", NL, spec));
  for (const spec of HB_JOURNALS) records.push(journalRecord(context, "hb", HB, spec));
  for (const spec of NL_INVOICES) records.push(invoiceRecord(context, "nl", spec, "GB"));
  for (const spec of HB_INVOICES) records.push(invoiceRecord(context, "hb", spec, "US-NY"));

  /* Suppliers and bills ---------------------------------------- */
  const suppliers: { n: number; title: string; summary: string; terms: string; email: string }[] = [
    { n: 720, title: "Clerkenwell Estates", summary: "Landlord for the studio and showroom.", terms: "On the 1st", email: "accounts@clerkenwellestates.example" },
    { n: 721, title: "Verity & Co Accountants", summary: "Quarterly bookkeeping review and the annual return.", terms: "14 days", email: "billing@verityco.example" },
    { n: 722, title: "Coldharbour Freight", summary: "Inbound freight on brass components.", terms: "30 days", email: "ops@coldharbourfreight.example" },
    { n: 723, title: "Linen Mill Dorset", summary: "Shade linen by the roll.", terms: "30 days", email: "sales@linenmill.example" },
    { n: 724, title: "Clerkenwell Power", summary: "Electricity for the workshop.", terms: "Direct debit", email: "support@clerkenwellpower.example" },
  ];
  for (const supplier of suppliers) {
    push({ org: "nl", collection: "suppliers", n: supplier.n, title: supplier.title, summary: supplier.summary,
      owner: "Jonah Adeyemi", fields: { email: supplier.email, terms: supplier.terms } });
  }

  const bills: { n: number; number: string; status: string; supplier: string; net: number; tax: number; at: string; due: string; summary: string; journalId?: string; approver?: string; exception?: string }[] = [
    { n: 720, number: "BILL-231", status: "approved", supplier: "nl-suppliers-720", net: 250_000, tax: 50_000, at: "2026-10-01", due: "2026-10-05", summary: "Studio rent for October.", journalId: "nl-journals-728", approver: "Maya Chen" },
    { n: 721, number: "BILL-238", status: "paid", supplier: "nl-suppliers-720", net: 250_000, tax: 50_000, at: "2026-09-05", due: "2026-09-08", summary: "Studio rent for September.", journalId: "nl-journals-721", approver: "Maya Chen" },
    { n: 722, number: "BILL-244", status: "approved", supplier: "nl-suppliers-721", net: 45_000, tax: 9_000, at: "2026-11-06", due: "2026-11-20", summary: "Quarterly bookkeeping review.", journalId: "nl-journals-743", approver: "Maya Chen" },
    { n: 723, number: "BILL-247", status: "inbox", supplier: "nl-suppliers-722", net: 14_400, tax: 2_880, at: "2026-11-04", due: "2026-12-04", summary: "Freight on the brass collar delivery. Supplier matched, not yet approved.", journalId: "nl-journals-740" },
    { n: 724, number: "BILL-249", status: "inbox", supplier: "", net: 7_200, tax: 1_440, at: "2026-11-12", due: "2026-11-26", summary: "Utility bill captured from a PDF. No supplier record matches the name on it.", exception: "No supplier match" },
    { n: 725, number: "BILL-251", status: "scheduled", supplier: "nl-suppliers-723", net: 96_000, tax: 19_200, at: "2026-11-09", due: "2026-11-23", summary: "Shade linen, four rolls. Payment scheduled locally; no bank mandate exists.", approver: "Jonah Adeyemi" },
    { n: 726, number: "BILL-252", status: "exception", supplier: "nl-suppliers-722", net: 14_400, tax: 2_880, at: "2026-11-05", due: "2026-12-05", summary: "Looks like a duplicate of BILL-247: same supplier, same amount, one day apart.", exception: "Possible duplicate of BILL-247" },
    { n: 727, number: "BILL-254", status: "due", supplier: "nl-suppliers-724", net: 7_200, tax: 1_440, at: "2026-10-12", due: "2026-10-26", summary: "September electricity. Past due and unapproved.", exception: "Past due" },
  ];
  for (const bill of bills) {
    const fields: Record<string, string | number | boolean> = { netMinor: bill.net, taxMinor: bill.tax, number: bill.number, taxCategory: "standard" };
    if (bill.supplier) fields.supplierId = bill.supplier;
    if (bill.journalId) fields.journalId = bill.journalId;
    if (bill.approver) fields.approvedBy = bill.approver;
    if (bill.exception) fields.exception = bill.exception;
    push({ org: "nl", collection: "bills", n: bill.n, title: bill.number, status: bill.status, summary: bill.summary,
      amountMinor: bill.net + bill.tax, at: `${bill.at}T09:00:00.000Z`, dueAt: `${bill.due}T00:00:00.000Z`,
      createdAt: `${bill.at}T08:00:00.000Z`, owner: "Jonah Adeyemi", fields,
      body: { attachment: { filename: `${bill.number}.pdf`, pages: 1, capturedAt: `${bill.at}T08:05:00.000Z`, kept: "local" } } });
  }

  /* Expenses with receipts -------------------------------------- */
  const expenses: { n: number; title: string; status: string; claimant: string; amount: number; category: string; code: string; taxCategory: string; at: string; summary: string; receipt?: string; policy?: string }[] = [
    { n: 720, title: "Trade fair travel", status: "approved", claimant: "Priya Shah", amount: 18_650, category: "travel", code: "6000", taxCategory: "zero_rated", at: "2026-11-04", summary: "Return rail to the Birmingham trade fair.", receipt: "rail-04-nov.jpg" },
    { n: 721, title: "Client lunch, Martins Studio", status: "review", claimant: "Priya Shah", amount: 6_240, category: "entertaining", code: "6000", taxCategory: "outside_scope", at: "2026-11-10", summary: "Lunch with Leo Martins after the specification visit.", receipt: "lunch-10-nov.jpg", policy: "Entertaining is not recoverable and needs owner approval." },
    { n: 722, title: "Workshop consumables", status: "approved", claimant: "Maya Chen", amount: 4_380, category: "materials", code: "5100", taxCategory: "standard", at: "2026-11-06", summary: "Abrasives and polishing compound.", receipt: "consumables-06-nov.jpg" },
    { n: 723, title: "Courier, shade sample", status: "review", claimant: "Priya Shah", amount: 1_440, category: "delivery", code: "6000", taxCategory: "standard", at: "2026-11-10", summary: "Same-day courier for the brushed brass sample.", receipt: "courier-10-nov.jpg" },
    { n: 724, title: "Photography licence", status: "reimbursed", claimant: "Maya Chen", amount: 24_000, category: "marketing", code: "6000", taxCategory: "standard", at: "2026-10-18", summary: "Product photography licence for the trade list.", receipt: "licence-18-oct.pdf" },
    { n: 725, title: "Parking, Ravensworth site", status: "review", claimant: "Theo Marsh", amount: 1_200, category: "travel", code: "6000", taxCategory: "standard", at: "2026-11-12", summary: "No receipt attached. Cannot be approved without one.", policy: "A receipt is required above 1.00." },
  ];
  for (const expense of expenses) {
    const fields: Record<string, string | number | boolean> = {
      category: expense.category, accountCode: expense.code, taxCategory: expense.taxCategory, claimant: expense.claimant,
      hasReceipt: Boolean(expense.receipt),
    };
    if (expense.policy) fields.policyNote = expense.policy;
    push({ org: "nl", collection: "expenses", n: expense.n, title: expense.title, status: expense.status, summary: expense.summary,
      amountMinor: expense.amount, at: `${expense.at}T12:00:00.000Z`, createdAt: `${expense.at}T12:05:00.000Z`,
      owner: expense.claimant, fields,
      body: expense.receipt
        ? { receipt: { filename: expense.receipt, capturedAt: `${expense.at}T12:04:00.000Z`, kept: "local", bytes: 184_320 } }
        : { receipt: null } });
  }

  /* Bank statement ---------------------------------------------- */
  for (const line of NL_STATEMENT) {
    const fields: Record<string, string | number | boolean> = {
      matched: Boolean(line.matchedJournalId),
      source: "statement-import",
      reference: line.reference,
      bankAccountCode: "1000",
      importBatch: "nl-import-nov",
    };
    if (line.matchedJournalId) fields.journalId = line.matchedJournalId;
    push({ org: "nl", collection: "bankTransactions", n: line.n, title: line.title,
      status: line.matchedJournalId ? "matched" : "unmatched", summary: `Imported from statement-2026-11.csv. ${line.reference}`,
      amountMinor: line.amountMinor, at: `${line.date}T00:00:00.000Z`, createdAt: "2026-11-13T18:20:00.000Z",
      owner: "Jonah Adeyemi", fields });
  }
  push({ org: "nl", collection: "bankTransactions", n: 740, title: "statement-2026-11.csv",
    status: "imported", summary: "CSV statement for the current account, 1 October to 13 November. Uploaded by hand; no bank feed is connected.",
    amountMinor: STATEMENT_CLOSING_MINOR, at: "2026-11-13T18:20:00.000Z", owner: "Jonah Adeyemi",
    fields: {
      kind: "statement", bankAccountCode: "1000", filename: "statement-2026-11.csv", rows: 10,
      openingMinor: 8_706_400, closingMinor: STATEMENT_CLOSING_MINOR,
      from: "2026-10-01", to: "2026-11-13", importBatch: "nl-import-nov", importedBy: "Jonah Adeyemi",
    } });

  /* Budgets, forecasts, scenarios -------------------------------- */
  const budgets: { n: number; code: string; label: string; period: string; amount: number }[] = [
    { n: 720, code: "4000", label: "Product revenue", period: "2026-11", amount: 450_000 },
    { n: 721, code: "4100", label: "Service revenue", period: "2026-11", amount: 100_000 },
    { n: 722, code: "5000", label: "Cost of goods", period: "2026-11", amount: 120_000 },
    { n: 723, code: "6100", label: "Rent", period: "2026-11", amount: 250_000 },
    { n: 724, code: "6300", label: "Wages", period: "2026-11", amount: 940_000 },
    { n: 725, code: "6000", label: "Marketing", period: "2026-11", amount: 40_000 },
    { n: 726, code: "6200", label: "Software", period: "2026-11", amount: 12_000 },
    { n: 727, code: "6700", label: "Professional fees", period: "2026-11", amount: 20_000 },
  ];
  for (const budget of budgets) {
    push({ org: "nl", collection: "budgets", n: budget.n, title: `${budget.label} · November`, status: "approved",
      summary: `Approved ceiling for ${budget.code} in ${budget.period}.`, amountMinor: budget.amount,
      owner: "Jonah Adeyemi", fields: { accountCode: budget.code, period: budget.period, kind: "budget", approvedBy: "Maya Chen" } });
  }
  push({ org: "nl", collection: "budgets", n: 730, title: "Winter base case", status: "active",
    summary: "Cash forecast to the end of February, built from the order book and the standing costs.",
    owner: "Jonah Adeyemi",
    fields: { kind: "forecast", scenario: "base", horizonMonths: 3, basis: "Posted actuals to 13 November, then the order book." },
    body: {
      assumptions: [
        { id: "a1", label: "Monthly payroll", valueMinor: 940_000, note: "Four people at the November run rate." },
        { id: "a2", label: "Monthly rent", valueMinor: 250_000, note: "Lease fixed until September 2027." },
        { id: "a3", label: "Product revenue per month", valueMinor: 450_000, note: "Average of September to November." },
        { id: "a4", label: "Service revenue per month", valueMinor: 100_000, note: "Two specification visits a month." },
        { id: "a5", label: "Marketing per month", valueMinor: 40_000, note: "Trade list and paid social." },
      ],
    } });
  push({ org: "nl", collection: "budgets", n: 731, title: "Winter cautious case", status: "active",
    summary: "The same cost base with trade orders down a third.", owner: "Jonah Adeyemi",
    fields: { kind: "forecast", scenario: "cautious", horizonMonths: 3, basis: "Base case with revenue reduced by a third." },
    body: {
      assumptions: [
        { id: "a1", label: "Monthly payroll", valueMinor: 940_000, note: "No change: notice periods run to February." },
        { id: "a2", label: "Monthly rent", valueMinor: 250_000, note: "Lease fixed until September 2027." },
        { id: "a3", label: "Product revenue per month", valueMinor: 300_000, note: "Two of the six trade accounts pause." },
        { id: "a4", label: "Service revenue per month", valueMinor: 60_000, note: "One specification visit a month." },
        { id: "a5", label: "Marketing per month", valueMinor: 20_000, note: "Paid social paused." },
      ],
    } });
  push({ org: "nl", collection: "budgets", n: 732, title: "December budget draft", status: "draft",
    summary: "Submitted for approval by the studio. Not yet approved, so it is not used for variance.",
    amountMinor: 1_320_000, owner: "Maya Chen",
    fields: { kind: "budget", accountCode: "6300", period: "2026-12", submittedBy: "Maya Chen" } });

  /* Tax configuration -------------------------------------------- */
  const taxCodes: { n: number; title: string; code: string; rateBp: number; summary: string; status?: string }[] = [
    { n: 720, title: "UK standard 20%", code: "GB-S20", rateBp: 2_000, summary: "Default rate for domestic sales." },
    { n: 721, title: "UK reduced 5%", code: "GB-R5", rateBp: 500, summary: "Qualifying supplies only." },
    { n: 722, title: "UK zero-rated", code: "GB-Z0", rateBp: 0, summary: "Reported on the return at 0%." },
    { n: 723, title: "UK exempt", code: "GB-EX", rateBp: 0, summary: "Outside the taxable base. Not the same as zero-rated." },
    { n: 724, title: "Reverse charge", code: "GB-RC", rateBp: 0, summary: "The customer accounts for the tax." },
    { n: 725, title: "Export, zero-rated", code: "GB-EXP", rateBp: 0, summary: "Evidence of export must be retained." },
    { n: 726, title: "UK standard (stale copy)", code: "GB-S20", rateBp: 1_750, summary: "Left over from the 2009 rate change. Kept so the drift check has something to find.", status: "superseded" },
  ];
  for (const code of taxCodes) {
    push({ org: "nl", collection: "taxCodes", n: code.n, title: code.title, status: code.status ?? "active",
      summary: code.summary, owner: "Jonah Adeyemi",
      fields: { code: code.code, rateBp: code.rateBp, jurisdiction: "GB", reviewedAt: "2026-10-01" } });
  }
  push({ org: "hb", collection: "taxCodes", n: 720, title: "NY State and local 8.875%", status: "active",
    summary: "Combined state 4% and New York City 4.875%.", owner: "Elena Ward",
    fields: { code: "NY-ST", rateBp: 888, jurisdiction: "US-NY", reviewedAt: "2026-10-01" } });
  push({ org: "hb", collection: "taxCodes", n: 721, title: "Exemption certificate held", status: "active",
    summary: "A valid resale or exemption certificate must be on file.", owner: "Elena Ward",
    fields: { code: "NY-EX", rateBp: 0, jurisdiction: "US-NY", reviewedAt: "2026-10-01" } });

  /* Legal entities and FX ---------------------------------------- */
  push({ org: "nl", collection: "legalEntities", n: 720, title: "Northline Studio Ltd", status: "active",
    summary: "Wholly owned subsidiary holding the workshop lease and the making team.",
    owner: "Maya Chen",
    fields: { currency: "GBP", country: "GB", number: "11920544", parentId: E1, ownership: 100, jurisdiction: "GB" } });
  push({ org: "nl", collection: "legalEntities", n: 721, title: "Northline Trade Ireland Ltd", status: "dormant",
    summary: "Registered for EU trade and dormant since incorporation. No journals have been posted to it.",
    owner: "Maya Chen",
    fields: { currency: "EUR", country: "IE", number: "IE729104", parentId: E1, ownership: 100, jurisdiction: "IE" } });

  /* Accounting periods ------------------------------------------- */
  push({ org: "nl", collection: "preferences", n: 720, title: "Accounting periods", status: "active",
    summary: "Closed months. A journal cannot be posted into a closed period.",
    owner: "Jonah Adeyemi",
    fields: { kind: "accountingPeriods", yearEnd: "03-31" },
    body: { locked: ["2026-09"], closedBy: { "2026-09": "Jonah Adeyemi" }, closedAt: { "2026-09": "2026-10-04T10:00:00.000Z" } } });

  return { records };
});

export const FIN_SEED_FACTS = {
  statementClosingMinor: STATEMENT_CLOSING_MINOR,
  northlineAccountIdByCode: NL,
  harborAccountIdByCode: HB,
};
