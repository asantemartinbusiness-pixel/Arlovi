import type { ProductOption, Variant } from "./data";

/* ====================================================================== *
 * COMMERCE variant rules — option combinations, SKU generation and the
 * validation every save runs. Pure functions only.
 * ====================================================================== */

/** Every combination of option values, in option order. Empty options are ignored. */
export function combinations(options: ProductOption[]): string[][] {
  const used = options.map((option) => option.values.map((value) => value.trim()).filter(Boolean)).filter((values) => values.length > 0);
  if (used.length === 0) return [];
  return used.reduce<string[][]>((acc, values) => acc.flatMap((combo) => values.map((value) => [...combo, value])), [[]]);
}

/** A short, stable SKU part for a value: initials of words, or the digits of a measurement. */
export function skuPart(value: string): string {
  const digits = value.match(/\d+/)?.[0];
  if (digits && /^\d+\s*[a-z]*$/i.test(value.trim().split(/\s+/)[0])) return digits;
  const words = value.trim().split(/[\s-]+/).filter(Boolean);
  const part = words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "").slice(0, 3);
  return part.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function skuFor(baseSku: string, values: string[]): string {
  return [baseSku.trim().toUpperCase(), ...values.map(skuPart)].filter(Boolean).join("-");
}

/**
 * Variants to add for the combinations not already on the product. A
 * combination counts as present when a variant has its name or its SKU; a
 * generated SKU that collides is suffixed rather than overwriting anything.
 */
export function generateVariants(options: ProductOption[], existing: Variant[], baseSku: string): Variant[] {
  const names = new Set(existing.map((variant) => variant.name.trim().toLowerCase()));
  const skus = new Set(existing.map((variant) => variant.sku.trim().toUpperCase()));
  const out: Variant[] = [];
  for (const combo of combinations(options)) {
    const name = combo.join(" / ");
    if (names.has(name.toLowerCase())) continue;
    let sku = skuFor(baseSku, combo);
    for (let n = 2; skus.has(sku); n += 1) sku = `${skuFor(baseSku, combo)}-${n}`;
    skus.add(sku);
    names.add(name.toLowerCase());
    out.push({ id: `${sku}-v`, name, sku, priceDeltaMinor: 0 });
  }
  return out;
}

export interface VariantIssue { id: string; field: "name" | "sku" | "price"; message: string }

export function validateVariants(variants: Variant[], basePriceMinor: number): VariantIssue[] {
  const issues: VariantIssue[] = [];
  const seenSku = new Map<string, string>();
  const seenName = new Map<string, string>();
  for (const variant of variants) {
    const sku = variant.sku.trim().toUpperCase();
    const name = variant.name.trim().toLowerCase();
    if (!name) issues.push({ id: variant.id, field: "name", message: "Name the variant" });
    else if (seenName.has(name)) issues.push({ id: variant.id, field: "name", message: "Another variant has this name" });
    if (!sku) issues.push({ id: variant.id, field: "sku", message: "Give it a SKU" });
    else if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(sku)) issues.push({ id: variant.id, field: "sku", message: "Letters, digits and hyphens only" });
    else if (seenSku.has(sku)) issues.push({ id: variant.id, field: "sku", message: "Another variant uses this SKU" });
    if (!Number.isFinite(variant.priceDeltaMinor) || basePriceMinor + variant.priceDeltaMinor < 0) issues.push({ id: variant.id, field: "price", message: "The selling price cannot fall below zero" });
    if (name) seenName.set(name, variant.id);
    if (sku) seenSku.set(sku, variant.id);
  }
  return issues;
}

/** Margin of one variant in basis points of its selling price, or undefined without a cost. */
export function variantMarginBp(basePriceMinor: number, deltaMinor: number, unitCostMinor: number): number | undefined {
  const price = basePriceMinor + deltaMinor;
  if (!unitCostMinor || price <= 0) return undefined;
  return Math.round(((price - unitCostMinor) / price) * 10_000);
}
