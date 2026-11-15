import { describe, expect, it } from "vitest";
import { computeInvoice, resolveTaxCode, taxCodesFor } from "../../src/platform/money";
import { buildReturn, documentTotals, readLines, statusFor } from "../../src/domain/fin-invoice";
import type { InvoiceLine } from "../../src/domain/fin-invoice";
import type { Rec } from "../../src/domain/types";

/* ------------------------------------------------------------------ *
 * Tax resolution (audit A09).
 *
 * A rate comes from the organisation's jurisdiction, the line's tax category,
 * the customer's tax status and the transaction date. Currency never enters
 * the calculation, and an unmatched combination resolves to UNKNOWN rather
 * than to zero.
 * ------------------------------------------------------------------ */

function rec(partial: Partial<Rec> & { id: string }): Rec {
  return {
    organizationId: "org-northline",
    collection: "invoices",
    title: partial.id,
    status: "awaiting_payment",
    ownerName: "Jonah Adeyemi",
    summary: "",
    currency: "GBP",
    tags: [],
    fields: {},
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    revision: 1,
    createdBy: "Jonah Adeyemi",
    updatedBy: "Jonah Adeyemi",
    history: [],
    ...partial,
  } as Rec;
}

const NOW = new Date("2026-11-14T09:30:00.000Z");

describe("tax resolution by jurisdiction, category, customer status and date", () => {
  it("resolves the standard domestic rate per jurisdiction", () => {
    const gb = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "domestic", date: "2026-11-14" });
    expect([gb.code, gb.rateBp, gb.reportable]).toEqual(["GB-S20", 2000, true]);

    const ny = resolveTaxCode({ jurisdiction: "US-NY", category: "standard", customerStatus: "domestic", date: "2026-11-14" });
    expect([ny.code, ny.rateBp]).toEqual(["NY-ST", 888]);
  });

  it("keeps exempt and zero-rated apart", () => {
    const zero = resolveTaxCode({ jurisdiction: "GB", category: "zero_rated", customerStatus: "domestic", date: "2026-11-14" });
    const exempt = resolveTaxCode({ jurisdiction: "GB", category: "exempt", customerStatus: "domestic", date: "2026-11-14" });
    expect(zero.rateBp).toBe(0);
    expect(exempt.rateBp).toBe(0);
    // The distinction that matters: a zero-rated supply is on the return, an exempt one is not.
    expect(zero.reportable).toBe(true);
    expect(exempt.reportable).toBe(false);
    expect(zero.code).not.toBe(exempt.code);
  });

  it("changes the code with the customer's tax status", () => {
    const domestic = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "domestic", date: "2026-11-14" });
    const exported = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "export", date: "2026-11-14" });
    const reverse = resolveTaxCode({ jurisdiction: "GB", category: "reverse_charge", customerStatus: "eu_business", date: "2026-11-14" });
    expect(domestic.rateBp).toBe(2000);
    expect([exported.code, exported.rateBp, exported.reportable]).toEqual(["GB-EXP", 0, true]);
    expect([reverse.code, reverse.rateBp]).toEqual(["GB-RC", 0]);
  });

  it("respects the date a rule came into force", () => {
    const before = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "export", date: "2019-06-01" });
    const after = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "export", date: "2026-11-14" });
    expect(before.code).toBe("UNKNOWN");
    expect(after.code).toBe("GB-EXP");

    const earlyStandard = resolveTaxCode({ jurisdiction: "GB", category: "standard", customerStatus: "domestic", date: "2010-01-01" });
    expect(earlyStandard.code).toBe("UNKNOWN");
  });

  it("resolves UNKNOWN rather than zero for a combination nothing approves", () => {
    const cases = [
      { jurisdiction: "GB", category: "reduced", customerStatus: "eu_business" },
      { jurisdiction: "GB", category: "standard", customerStatus: "unknown" },
      { jurisdiction: "GB", category: "reverse_charge", customerStatus: "domestic" },
      { jurisdiction: "FR", category: "standard", customerStatus: "domestic" },
      { jurisdiction: "US-NY", category: "reverse_charge", customerStatus: "eu_business" },
    ] as const;
    for (const input of cases) {
      const code = resolveTaxCode({ ...input, date: "2026-11-14" });
      expect([input.jurisdiction, input.category, input.customerStatus, code.code]).toEqual([input.jurisdiction, input.category, input.customerStatus, "UNKNOWN"]);
      expect(code.reportable).toBe(false);
      expect(code.note).toMatch(/review/i);
    }
  });

  it("never derives a rate from the currency", () => {
    // Same lines, same date, same customer; only the jurisdiction differs.
    const lines: InvoiceLine[] = [{ id: "l1", description: "Arc Lamp", quantity: 1, unitPriceMinor: 100_000, taxCategory: "standard" }];
    const gb = computeInvoice({ lines, jurisdiction: "GB", customerStatus: "domestic", date: "2026-11-14" });
    const ny = computeInvoice({ lines, jurisdiction: "US-NY", customerStatus: "domestic", date: "2026-11-14" });
    expect(gb.taxMinor).toBe(20_000);
    expect(ny.taxMinor).toBe(8_880);
  });

  it("lists the codes a jurisdiction can produce without duplicates", () => {
    const codes = taxCodesFor("GB").map((code) => code.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("GB-S20");
    expect(codes).not.toContain("NY-ST");
  });
});

describe("invoice totals with discounts and mixed tax codes", () => {
  it("applies a line discount before tax", () => {
    const totals = documentTotals({
      lines: [{ id: "l1", description: "Pendant", quantity: 10, unitPriceMinor: 30_000, taxCategory: "standard", discountBp: 1_000 }],
      jurisdiction: "GB",
      customerStatus: "domestic",
      date: "2026-11-14",
    });
    // 10 × 300.00 = 3,000.00, less 10% = 2,700.00, tax 20% = 540.00
    expect(totals.netMinor).toBe(270_000);
    expect(totals.taxMinor).toBe(54_000);
    expect(totals.grossMinor).toBe(324_000);
    expect(totals.discountMinor).toBe(30_000);
  });

  it("groups tax by resolved code across mixed lines", () => {
    const totals = documentTotals({
      lines: [
        { id: "l1", description: "Rewiring labour", quantity: 4, unitPriceMinor: 9_500, taxCategory: "standard" },
        { id: "l2", description: "Care guide", quantity: 20, unitPriceMinor: 900, taxCategory: "zero_rated" },
        { id: "l3", description: "Hall refit", quantity: 1, unitPriceMinor: 140_000, taxCategory: "exempt" },
      ],
      jurisdiction: "GB",
      customerStatus: "domestic",
      date: "2026-11-14",
    });
    const byCode = Object.fromEntries(totals.byCode.map((group) => [group.code.code, group]));
    expect(Object.keys(byCode).sort()).toEqual(["GB-EX", "GB-S20", "GB-Z0"]);
    expect(byCode["GB-S20"].netMinor).toBe(38_000);
    expect(byCode["GB-S20"].taxMinor).toBe(7_600);
    expect(byCode["GB-Z0"].taxMinor).toBe(0);
    expect(byCode["GB-EX"].taxMinor).toBe(0);
    expect(totals.netMinor).toBe(38_000 + 18_000 + 140_000);
    expect(totals.taxMinor).toBe(7_600);
    expect(totals.hasUnknownRate).toBe(false);
  });

  it("flags a document with an unresolved line instead of quietly zeroing it", () => {
    const totals = documentTotals({
      lines: [
        { id: "l1", description: "Pendant, trade", quantity: 8, unitPriceMinor: 30_000, taxCategory: "reverse_charge" },
        { id: "l2", description: "Printing", quantity: 1, unitPriceMinor: 12_000, taxCategory: "reduced" },
      ],
      jurisdiction: "GB",
      customerStatus: "eu_business",
      date: "2026-11-14",
    });
    expect(totals.hasUnknownRate).toBe(true);
    const unknown = totals.byCode.find((group) => group.code.code === "UNKNOWN");
    expect(unknown?.netMinor).toBe(12_000);
    expect(unknown?.taxMinor).toBe(0);
    // The net is still counted, so the figure is never lost — only the rate is unknown.
    expect(totals.netMinor).toBe(252_000);
  });

  it("rounds each line's tax independently to the penny", () => {
    const totals = documentTotals({
      lines: [
        { id: "l1", description: "Odd one", quantity: 3, unitPriceMinor: 333, taxCategory: "standard" },
        { id: "l2", description: "Odd two", quantity: 1, unitPriceMinor: 999, taxCategory: "standard" },
      ],
      jurisdiction: "US-NY",
      customerStatus: "domestic",
      date: "2026-11-14",
    });
    expect(totals.lines[0].netMinor).toBe(999);
    expect(totals.lines[0].taxMinor).toBe(Math.round((999 * 888) / 10_000));
    expect(totals.taxMinor).toBe(totals.lines.reduce((sum, line) => sum + line.taxMinor, 0));
    expect(totals.grossMinor).toBe(totals.netMinor + totals.taxMinor);
  });

  it("reads the legacy line shape and the document's own status override", () => {
    const legacy = rec({
      id: "nl-invoices-001",
      body: { lines: [{ description: "Arc Lamp", qty: 2, unitMinor: 90_000 }] },
      fields: { customerTaxStatus: "export" },
    });
    const lines = readLines(legacy);
    expect([lines.length, lines[0].quantity, lines[0].unitPriceMinor]).toEqual([1, 2, 90_000]);
    expect(statusFor(legacy, undefined)).toBe("export");

    const totals = documentTotals({ lines, jurisdiction: "GB", customerStatus: statusFor(legacy, undefined), date: "2026-11-14" });
    expect(totals.netMinor).toBe(180_000);
    expect(totals.taxMinor).toBe(0);
    expect(totals.byCode[0].code.code).toBe("GB-EXP");
  });

  it("falls back to the customer record when the document has no override", () => {
    const customer = rec({ id: "nl-contacts-720", collection: "contacts", fields: { taxStatus: "domestic_exempt" } });
    const nothing = rec({ id: "nl-contacts-729", collection: "contacts", fields: {} });
    expect(statusFor(undefined, customer)).toBe("domestic_exempt");
    expect(statusFor(undefined, nothing)).toBe("domestic");
    expect(statusFor(undefined, undefined)).toBe("unknown");
  });
});

describe("the return a period would file", () => {
  const contacts = [
    rec({ id: "c-domestic", collection: "contacts", fields: { taxStatus: "domestic" } }),
    rec({ id: "c-export", collection: "contacts", fields: { taxStatus: "export" } }),
    rec({ id: "c-eu", collection: "contacts", fields: { taxStatus: "eu_business" } }),
  ];
  const invoices = [
    rec({
      id: "i-standard", at: "2026-11-03T09:00:00.000Z", status: "awaiting_payment",
      fields: { contactId: "c-domestic" },
      body: { lines: [{ id: "l1", description: "Lamps", quantity: 4, unitPriceMinor: 95_000, taxCategory: "standard" }] },
    }),
    rec({
      id: "i-export", at: "2026-11-10T09:00:00.000Z", status: "awaiting_payment",
      fields: { contactId: "c-export" },
      body: { lines: [{ id: "l1", description: "Lamps", quantity: 3, unitPriceMinor: 95_000, taxCategory: "standard" }] },
    }),
    rec({
      id: "i-unknown", at: "2026-11-12T09:00:00.000Z", status: "awaiting_payment",
      fields: { contactId: "c-eu" },
      body: { lines: [{ id: "l1", description: "Printing", quantity: 1, unitPriceMinor: 12_000, taxCategory: "reduced" }] },
    }),
    rec({
      id: "i-draft", at: "2026-11-13T09:00:00.000Z", status: "draft",
      fields: { contactId: "c-domestic" },
      body: { lines: [{ id: "l1", description: "Lamps", quantity: 1, unitPriceMinor: 95_000, taxCategory: "standard" }] },
    }),
    rec({
      id: "i-other-period", at: "2026-10-03T09:00:00.000Z", status: "paid",
      fields: { contactId: "c-domestic" },
      body: { lines: [{ id: "l1", description: "Lamps", quantity: 1, unitPriceMinor: 50_000, taxCategory: "standard" }] },
    }),
  ];
  const bills = [
    rec({ id: "b-1", collection: "bills", status: "approved", at: "2026-11-06T09:00:00.000Z", amountMinor: 54_000, fields: { netMinor: 45_000, taxMinor: 9_000 } }),
    rec({ id: "b-draft", collection: "bills", status: "inbox", at: "2026-11-06T09:00:00.000Z", amountMinor: 12_000, fields: { netMinor: 10_000, taxMinor: 2_000 } }),
  ];

  const boxes = buildReturn({ period: "2026-11", invoices, bills, contacts, jurisdiction: "GB", now: NOW });

  it("counts only issued documents dated in the period", () => {
    const counted = boxes.outputs.flatMap((group) => group.documentIds);
    expect(counted).toContain("i-standard");
    expect(counted).not.toContain("i-draft");
    expect(counted).not.toContain("i-other-period");
  });

  it("puts the output tax and the reclaimable input tax in the right boxes", () => {
    expect(boxes.outputTaxMinor).toBe(76_000);
    expect(boxes.outputNetMinor).toBe(380_000 + 285_000);
    expect(boxes.inputTaxMinor).toBe(9_000);
    expect(boxes.payableMinor).toBe(76_000 - 9_000);
  });

  it("lists an unresolved document rather than folding it in at zero", () => {
    expect(boxes.unknownDocumentIds).toEqual(["i-unknown"]);
    const unknownGroup = boxes.outputs.find((group) => group.code.code === "UNKNOWN");
    expect(unknownGroup?.netMinor).toBe(12_000);
    // UNKNOWN is not reportable, so its net stays out of the taxable box.
    expect(boxes.outputNetMinor).not.toContain(12_000);
  });
});
