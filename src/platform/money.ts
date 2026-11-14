import type { Rec } from "@/domain/types";
import type { OrgProfile } from "./org";

/* ------------------------------------------------------------------ *
 * Tax engine.
 *
 * Audit A09: tax was derived from currency (`GBP ? 0.2 : 0`). Currency does
 * not determine tax. A rate is resolved from the organisation's jurisdiction,
 * the line's tax category, the customer's tax status and the transaction date.
 * Unknown combinations resolve to an explicit `unknown` code rather than 0.
 * ------------------------------------------------------------------ */

export type TaxCategory =
  | "standard" | "reduced" | "zero_rated" | "exempt" | "outside_scope" | "reverse_charge";

export type CustomerTaxStatus = "domestic" | "domestic_exempt" | "eu_business" | "export" | "unknown";

export interface TaxCode {
  code: string;
  label: string;
  /** Rate in basis points (2000 = 20%). */
  rateBp: number;
  reportable: boolean;
  note?: string;
}

interface TaxRule {
  jurisdiction: string;
  category: TaxCategory;
  customerStatus: CustomerTaxStatus[];
  from: string;
  to?: string;
  code: TaxCode;
}

const UNKNOWN_CODE: TaxCode = {
  code: "UNKNOWN",
  label: "Rate not determined",
  rateBp: 0,
  reportable: false,
  note: "No approved rate matches this jurisdiction, category, customer status and date. Review before issuing.",
};

export const TAX_RULES: TaxRule[] = [
  { jurisdiction: "GB", category: "standard", customerStatus: ["domestic"], from: "2011-01-04",
    code: { code: "GB-S20", label: "UK standard 20%", rateBp: 2000, reportable: true } },
  { jurisdiction: "GB", category: "reduced", customerStatus: ["domestic"], from: "2011-01-04",
    code: { code: "GB-R5", label: "UK reduced 5%", rateBp: 500, reportable: true } },
  { jurisdiction: "GB", category: "zero_rated", customerStatus: ["domestic", "export"], from: "1973-04-01",
    code: { code: "GB-Z0", label: "UK zero-rated", rateBp: 0, reportable: true, note: "Zero-rated supply: reported on the return at 0%." } },
  { jurisdiction: "GB", category: "exempt", customerStatus: ["domestic", "domestic_exempt"], from: "1973-04-01",
    code: { code: "GB-EX", label: "UK exempt", rateBp: 0, reportable: false, note: "Exempt supply: outside the taxable base, not zero-rated." } },
  { jurisdiction: "GB", category: "standard", customerStatus: ["export"], from: "2021-01-01",
    code: { code: "GB-EXP", label: "Export, zero-rated", rateBp: 0, reportable: true, note: "Evidence of export must be retained." } },
  { jurisdiction: "GB", category: "reverse_charge", customerStatus: ["eu_business"], from: "2021-01-01",
    code: { code: "GB-RC", label: "Reverse charge", rateBp: 0, reportable: true, note: "Customer accounts for the tax." } },
  { jurisdiction: "GB", category: "outside_scope", customerStatus: ["domestic", "export", "eu_business", "domestic_exempt"], from: "1973-04-01",
    code: { code: "GB-OS", label: "Outside the scope", rateBp: 0, reportable: false } },

  { jurisdiction: "US-NY", category: "standard", customerStatus: ["domestic"], from: "2005-06-01",
    code: { code: "NY-ST", label: "NY State + local 8.875%", rateBp: 888, reportable: true, note: "Combined state 4% and New York City 4.875%." } },
  { jurisdiction: "US-NY", category: "reduced", customerStatus: ["domestic"], from: "2005-06-01",
    code: { code: "NY-RED", label: "NY reduced 4%", rateBp: 400, reportable: true } },
  { jurisdiction: "US-NY", category: "exempt", customerStatus: ["domestic", "domestic_exempt"], from: "2005-06-01",
    code: { code: "NY-EX", label: "Exemption certificate held", rateBp: 0, reportable: false, note: "A valid resale or exemption certificate must be on file." } },
  { jurisdiction: "US-NY", category: "zero_rated", customerStatus: ["domestic", "export"], from: "2005-06-01",
    code: { code: "NY-NT", label: "Not taxable", rateBp: 0, reportable: true } },
  { jurisdiction: "US-NY", category: "outside_scope", customerStatus: ["domestic", "export", "eu_business", "domestic_exempt"], from: "2005-06-01",
    code: { code: "NY-OS", label: "Outside the scope", rateBp: 0, reportable: false } },
  { jurisdiction: "US-NY", category: "standard", customerStatus: ["export"], from: "2005-06-01",
    code: { code: "NY-OOS", label: "Out of state, no nexus", rateBp: 0, reportable: true, note: "Destination outside the registered nexus." } },
];

export function resolveTaxCode(input: {
  jurisdiction: string;
  category: TaxCategory;
  customerStatus: CustomerTaxStatus;
  date: string;
}): TaxCode {
  const stamp = input.date.slice(0, 10);
  const rule = TAX_RULES.find((candidate) =>
    candidate.jurisdiction === input.jurisdiction
    && candidate.category === input.category
    && candidate.customerStatus.includes(input.customerStatus)
    && candidate.from <= stamp
    && (!candidate.to || candidate.to > stamp));
  return rule?.code ?? UNKNOWN_CODE;
}

export function taxCodesFor(jurisdiction: string): TaxCode[] {
  const seen = new Set<string>();
  return TAX_RULES.filter((rule) => rule.jurisdiction === jurisdiction)
    .map((rule) => rule.code)
    .filter((code) => (seen.has(code.code) ? false : (seen.add(code.code), true)));
}

/* ----------------------------- Lines ----------------------------- */

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
  /** Discount in basis points applied to the line net. */
  discountBp?: number;
  accountCode?: string;
}

export interface LineComputation extends InvoiceLine {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  taxCode: TaxCode;
}

export interface InvoiceTotals {
  lines: LineComputation[];
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  /** Tax grouped by resolved code, for the tax summary block. */
  byCode: { code: TaxCode; netMinor: number; taxMinor: number }[];
  hasUnknownRate: boolean;
}

export function computeInvoice(input: {
  lines: InvoiceLine[];
  jurisdiction: string;
  customerStatus: CustomerTaxStatus;
  date: string;
}): InvoiceTotals {
  const computed: LineComputation[] = input.lines.map((line) => {
    const taxCode = resolveTaxCode({
      jurisdiction: input.jurisdiction,
      category: line.taxCategory,
      customerStatus: input.customerStatus,
      date: input.date,
    });
    const gross = Math.round(line.quantity * line.unitPriceMinor);
    const net = Math.round(gross * (1 - (line.discountBp ?? 0) / 10_000));
    const tax = Math.round((net * taxCode.rateBp) / 10_000);
    return { ...line, netMinor: net, taxMinor: tax, grossMinor: net + tax, taxCode };
  });
  const byCodeMap = new Map<string, { code: TaxCode; netMinor: number; taxMinor: number }>();
  for (const line of computed) {
    const found = byCodeMap.get(line.taxCode.code);
    if (found) { found.netMinor += line.netMinor; found.taxMinor += line.taxMinor; }
    else byCodeMap.set(line.taxCode.code, { code: line.taxCode, netMinor: line.netMinor, taxMinor: line.taxMinor });
  }
  const netMinor = computed.reduce((sum, line) => sum + line.netMinor, 0);
  const taxMinor = computed.reduce((sum, line) => sum + line.taxMinor, 0);
  return {
    lines: computed,
    netMinor,
    taxMinor,
    grossMinor: netMinor + taxMinor,
    byCode: [...byCodeMap.values()],
    hasUnknownRate: computed.some((line) => line.taxCode.code === "UNKNOWN"),
  };
}

/** Reads invoice lines from a record body, tolerating the legacy shape. */
export function linesFromRecord(record: Rec | undefined): InvoiceLine[] {
  const body = record?.body as { lines?: unknown[] } | undefined;
  const raw = Array.isArray(body?.lines) ? body!.lines : [];
  return raw.map((item, index) => {
    const line = item as Partial<InvoiceLine> & { price?: number; qty?: number; amountMinor?: number; name?: string };
    return {
      id: line.id ?? `line-${index + 1}`,
      description: line.description ?? line.name ?? "Line",
      quantity: Number(line.quantity ?? line.qty ?? 1),
      unitPriceMinor: Number(line.unitPriceMinor ?? line.price ?? line.amountMinor ?? 0),
      taxCategory: (line.taxCategory as TaxCategory) ?? "standard",
      discountBp: line.discountBp,
      accountCode: line.accountCode,
    };
  });
}

export function customerStatusOf(customer: Rec | undefined): CustomerTaxStatus {
  const value = customer?.fields.taxStatus;
  if (typeof value === "string" && ["domestic", "domestic_exempt", "eu_business", "export", "unknown"].includes(value)) {
    return value as CustomerTaxStatus;
  }
  return customer ? "domestic" : "unknown";
}

export function money(minor: number, org: Pick<OrgProfile, "currency" | "locale">, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(org.locale, { style: "currency", currency: org.currency, ...options }).format(minor / 100);
}

export function compactMoney(minor: number, org: Pick<OrgProfile, "currency" | "locale">): string {
  return money(minor, org, { notation: "compact", maximumFractionDigits: 1 });
}

export function percent(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(value);
}
