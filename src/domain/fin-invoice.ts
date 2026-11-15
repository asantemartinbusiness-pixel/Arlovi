import type { Rec } from "./types";
import {
  computeInvoice, customerStatusOf, linesFromRecord, resolveTaxCode, taxCodesFor,
  type CustomerTaxStatus, type InvoiceLine, type InvoiceTotals, type TaxCategory, type TaxCode,
} from "@/platform/money";

/* ------------------------------------------------------------------ *
 * Invoice and quote documents.
 *
 * Every figure on a document comes from `computeInvoice` in
 * `src/platform/money.ts`: a line's tax is resolved from the organisation's
 * jurisdiction, the line's tax category, the customer's tax status and the
 * document date. Nothing here looks at the currency.
 * ------------------------------------------------------------------ */

export const TAX_CATEGORIES: { value: TaxCategory; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "The default rate for this jurisdiction." },
  { value: "reduced", label: "Reduced", hint: "A lower statutory rate for qualifying supplies." },
  { value: "zero_rated", label: "Zero-rated", hint: "Taxable at 0% and reported on the return." },
  { value: "exempt", label: "Exempt", hint: "Outside the taxable base. Not the same as zero-rated." },
  { value: "outside_scope", label: "Outside the scope", hint: "Not a taxable supply at all." },
  { value: "reverse_charge", label: "Reverse charge", hint: "The customer accounts for the tax." },
];

export const CUSTOMER_TAX_STATUSES: { value: CustomerTaxStatus; label: string; hint: string }[] = [
  { value: "domestic", label: "Domestic", hint: "Registered in the same jurisdiction." },
  { value: "domestic_exempt", label: "Domestic, exempt", hint: "Holds an exemption or resale certificate." },
  { value: "eu_business", label: "EU business", hint: "Cross-border business customer." },
  { value: "export", label: "Export", hint: "Delivered outside the jurisdiction." },
  { value: "unknown", label: "Not recorded", hint: "No tax status captured for this customer." },
];

export function taxCategoryLabel(category: TaxCategory): string {
  return TAX_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}

export function customerStatusLabel(status: CustomerTaxStatus): string {
  return CUSTOMER_TAX_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

/**
 * Lines from a document record. `linesFromRecord` tolerates the legacy shape;
 * this adds the base seed's `unitMinor` spelling so an older invoice still
 * prices correctly instead of showing zero.
 */
export function readLines(record: Rec | undefined): InvoiceLine[] {
  const lines = linesFromRecord(record);
  const raw = ((record?.body as { lines?: unknown[] } | undefined)?.lines ?? []) as Record<string, unknown>[];
  return lines.map((line, index) => {
    if (line.unitPriceMinor !== 0) return line;
    const legacy = Number(raw[index]?.unitMinor ?? raw[index]?.netMinor ?? 0);
    return legacy ? { ...line, unitPriceMinor: legacy } : line;
  });
}

/** The date a document's tax is resolved at: its own date, else today. */
export function documentDate(record: Rec | undefined, now: Date): string {
  const value = record?.at ?? record?.createdAt;
  return (value ?? now.toISOString()).slice(0, 10);
}

export interface DocumentTotals extends InvoiceTotals {
  jurisdiction: string;
  customerStatus: CustomerTaxStatus;
  date: string;
  /** Total line discount given, in minor units. */
  discountMinor: number;
}

export function documentTotals(input: {
  lines: InvoiceLine[];
  jurisdiction: string;
  customerStatus: CustomerTaxStatus;
  date: string;
}): DocumentTotals {
  const totals = computeInvoice(input);
  const discountMinor = input.lines.reduce((sum, line) => {
    const gross = Math.round(line.quantity * line.unitPriceMinor);
    return sum + (gross - Math.round(gross * (1 - (line.discountBp ?? 0) / 10_000)));
  }, 0);
  return {
    ...totals,
    discountMinor,
    jurisdiction: input.jurisdiction,
    customerStatus: input.customerStatus,
    date: input.date,
  };
}

/** Totals for a stored document, reading its customer and the active org. */
export function totalsFor(input: {
  record: Rec | undefined;
  customer: Rec | undefined;
  jurisdiction: string;
  now: Date;
}): DocumentTotals {
  return documentTotals({
    lines: readLines(input.record),
    jurisdiction: input.jurisdiction,
    customerStatus: statusFor(input.record, input.customer),
    date: documentDate(input.record, input.now),
  });
}

/** An override stored on the document wins over the customer record. */
export function statusFor(record: Rec | undefined, customer: Rec | undefined): CustomerTaxStatus {
  const override = record?.fields.customerTaxStatus;
  if (typeof override === "string" && CUSTOMER_TAX_STATUSES.some((entry) => entry.value === override)) {
    return override as CustomerTaxStatus;
  }
  return customerStatusOf(customer);
}

export function blankLine(index: number): InvoiceLine {
  return {
    id: `line-${Date.now().toString(36)}-${index}`,
    description: "",
    quantity: 1,
    unitPriceMinor: 0,
    taxCategory: "standard",
    discountBp: 0,
    accountCode: undefined,
  };
}

/** Serialised form written back to `body.lines`. */
export function writeLines(lines: InvoiceLine[]): { lines: InvoiceLine[] } {
  return {
    lines: lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxCategory: line.taxCategory,
      discountBp: line.discountBp ?? 0,
      accountCode: line.accountCode,
    })),
  };
}

/* --------------------------- Tax return -------------------------- */

export interface ReturnBoxes {
  period: string;
  /** Tax charged on sales in the period, by resolved code. */
  outputs: { code: TaxCode; netMinor: number; taxMinor: number; documentIds: string[] }[];
  outputTaxMinor: number;
  outputNetMinor: number;
  /** Tax on purchases, from bills with a recorded tax amount. */
  inputTaxMinor: number;
  inputNetMinor: number;
  payableMinor: number;
  exemptNetMinor: number;
  zeroRatedNetMinor: number;
  unknownDocumentIds: string[];
  missingStatusDocumentIds: string[];
}

/**
 * The return this workspace would file for a period, computed from issued
 * invoices and recorded bills. A document whose rate resolves to UNKNOWN is
 * listed rather than folded in at zero.
 */
export function buildReturn(input: {
  period: string;
  invoices: Rec[];
  bills: Rec[];
  contacts: Rec[];
  jurisdiction: string;
  now: Date;
}): ReturnBoxes {
  const outputs = new Map<string, { code: TaxCode; netMinor: number; taxMinor: number; documentIds: string[] }>();
  const unknown: string[] = [];
  const missingStatus: string[] = [];
  let exemptNet = 0;
  let zeroNet = 0;

  const inPeriod = (record: Rec) => (record.at ?? record.createdAt).slice(0, 7) === input.period;

  for (const invoice of input.invoices) {
    if (!inPeriod(invoice)) continue;
    if (["draft", "void"].includes(invoice.status)) continue;
    const customer = input.contacts.find((contact) => contact.id === String(invoice.fields.contactId ?? invoice.parentId ?? ""));
    const status = statusFor(invoice, customer);
    if (status === "unknown") missingStatus.push(invoice.id);
    const totals = totalsFor({ record: invoice, customer, jurisdiction: input.jurisdiction, now: input.now });
    if (totals.hasUnknownRate) unknown.push(invoice.id);
    for (const group of totals.byCode) {
      const found = outputs.get(group.code.code);
      if (found) {
        found.netMinor += group.netMinor;
        found.taxMinor += group.taxMinor;
        found.documentIds.push(invoice.id);
      } else {
        outputs.set(group.code.code, { code: group.code, netMinor: group.netMinor, taxMinor: group.taxMinor, documentIds: [invoice.id] });
      }
    }
    for (const line of totals.lines) {
      if (line.taxCategory === "exempt") exemptNet += line.netMinor;
      if (line.taxCategory === "zero_rated") zeroNet += line.netMinor;
    }
  }

  let inputTax = 0;
  let inputNet = 0;
  for (const bill of input.bills) {
    if (!inPeriod(bill)) continue;
    if (!["approved", "paid", "scheduled"].includes(bill.status)) continue;
    const tax = Number(bill.fields.taxMinor ?? 0);
    const net = Number(bill.fields.netMinor ?? (Number(bill.amountMinor ?? 0) - tax));
    inputTax += tax;
    inputNet += net;
  }

  const list = [...outputs.values()].sort((a, b) => a.code.code.localeCompare(b.code.code));
  const outputTax = list.filter((group) => group.code.reportable).reduce((sum, group) => sum + group.taxMinor, 0);
  const outputNet = list.filter((group) => group.code.reportable).reduce((sum, group) => sum + group.netMinor, 0);
  return {
    period: input.period,
    outputs: list,
    outputTaxMinor: outputTax,
    outputNetMinor: outputNet,
    inputTaxMinor: inputTax,
    inputNetMinor: inputNet,
    payableMinor: outputTax - inputTax,
    exemptNetMinor: exemptNet,
    zeroRatedNetMinor: zeroNet,
    unknownDocumentIds: unknown,
    missingStatusDocumentIds: missingStatus,
  };
}

export { computeInvoice, resolveTaxCode, taxCodesFor, customerStatusOf };
export type { InvoiceLine, InvoiceTotals, TaxCategory, TaxCode, CustomerTaxStatus };
