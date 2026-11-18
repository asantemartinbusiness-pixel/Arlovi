import { describe, expect, it } from "vitest";
import { combinations, generateVariants, skuFor, skuPart, validateVariants, variantMarginBp } from "@/applications/commerce/variants";

describe("variant combinations and SKUs", () => {
  it("multiplies option values and ignores empty options", () => {
    expect(combinations([{ name: "Finish", values: ["Natural", "Blackened"] }, { name: "Size", values: ["Small", " ", "Large"] }, { name: "Empty", values: [] }]))
      .toEqual([["Natural", "Small"], ["Natural", "Large"], ["Blackened", "Small"], ["Blackened", "Large"]]);
    expect(combinations([])).toEqual([]);
  });

  it("builds readable SKU parts", () => {
    expect(skuPart("Natural brass")).toBe("NB");
    expect(skuPart("600mm drop")).toBe("600");
    expect(skuPart("Large")).toBe("LAR");
    expect(skuFor("bcn-01", ["Natural brass", "600mm drop"])).toBe("BCN-01-NB-600");
  });

  it("adds only missing combinations and never reuses a SKU", () => {
    const existing = [{ id: "a", name: "Natural brass", sku: "BCN-01-NB", priceDeltaMinor: 0 }, { id: "b", name: "Other", sku: "BCN-01-BB", priceDeltaMinor: 0 }];
    const added = generateVariants([{ name: "Finish", values: ["Natural brass", "Blackened brass"] }], existing, "BCN-01");
    expect(added).toEqual([{ id: "BCN-01-BB-2-v", name: "Blackened brass", sku: "BCN-01-BB-2", priceDeltaMinor: 0 }]);
  });

  it("never reuses an existing variant id after a SKU rename and regenerate", () => {
    // "BCN-01-NB-v" was generated, then its SKU and name were renamed by hand.
    const existing = [{ id: "BCN-01-NB-v", name: "Brass custom", sku: "CUSTOM-1", priceDeltaMinor: 0 }];
    const added = generateVariants([{ name: "Finish", values: ["Natural brass"] }], existing, "BCN-01");
    expect(added).toHaveLength(1);
    expect(added[0].sku).toBe("BCN-01-NB");
    expect(added[0].id).not.toBe("BCN-01-NB-v");
    const ids = [...existing, ...added].map((variant) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("variant validation", () => {
  it("flags blank and duplicate names, bad and duplicate SKUs and negative prices", () => {
    const issues = validateVariants([
      { id: "1", name: "Small", sku: "SKU-1", priceDeltaMinor: 0 },
      { id: "2", name: "small", sku: "SKU-1", priceDeltaMinor: -20_000 },
      { id: "3", name: "", sku: "bad sku!", priceDeltaMinor: 0 },
    ], 10_000);
    expect(issues.map((issue) => `${issue.id}:${issue.field}`)).toEqual(["2:name", "2:sku", "2:price", "3:name", "3:sku"]);
    expect(validateVariants([{ id: "1", name: "Small", sku: "SKU-1", priceDeltaMinor: 500 }], 10_000)).toEqual([]);
  });

  it("computes variant margin only when a cost is known", () => {
    expect(variantMarginBp(10_000, 0, 6_000)).toBe(4_000);
    expect(variantMarginBp(10_000, 0, 0)).toBeUndefined();
  });
});
