import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, Field, MoneyInput, Notice, Pill, Row, Stack, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE } from "@/applications/market/kit";
import { bodyOf, type ProductBody, type ProductOption, type Variant } from "./data";
import { combinations, generateVariants, validateVariants, variantMarginBp } from "./variants";
import "./commerce-variants.css";

/* ====================================================================== *
 * COMMERCE product variants (ARL-COMMERCE-003 · Variants): options that
 * generate combinations, and an editable price list with live validation.
 * Nothing is saved until "Save variants", and a stale record is refused.
 * ====================================================================== */

export function VariantsWorkspace({ context, product, taxCode }: { context: ScreenContext; product: Rec; taxCode: string }) {
  return <VariantsForm key={`${product.id}-${product.revision}`} context={context} product={product} taxCode={taxCode} />;
}

function VariantsForm({ context, product, taxCode }: { context: ScreenContext; product: Rec; taxCode: string }) {
  const { org } = useWorkspace();
  const body = bodyOf<ProductBody>(product, {});
  const savedVariants = body.variants ?? [];
  const savedOptions = body.options ?? [];
  const [variants, setVariants] = useState<Variant[]>(savedVariants);
  const [options, setOptions] = useState<ProductOption[]>(savedOptions);
  const [optionName, setOptionName] = useState("");
  const [optionValues, setOptionValues] = useState("");
  const base = product.amountMinor ?? 0;
  const cost = Number(product.fields.unitCostMinor ?? 0);
  const baseSku = String(product.fields.sku ?? product.title.slice(0, 3)).toUpperCase();
  const issues = validateVariants(variants, base);
  const issueFor = (id: string, field: string) => issues.find((issue) => issue.id === id && issue.field === field)?.message;
  const dirty = JSON.stringify(variants) !== JSON.stringify(savedVariants) || JSON.stringify(options) !== JSON.stringify(savedOptions);
  const toAdd = generateVariants(options, variants, baseSku);
  const update = (id: string, patch: Partial<Variant>) => setVariants(variants.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));

  const save = async () => {
    if (issues.length) return;
    const saved = await context.mutate.patch(product.id, {
      body: { ...body, variants: variants.map((variant) => ({ ...variant, name: variant.name.trim(), sku: variant.sku.trim().toUpperCase() })), options },
    }, { expectRevision: product.revision, event: `${product.title}: ${variants.length} variants saved by ${context.actor}` });
    if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Variants saved", `${product.title} now sells in ${variants.length} variant${variants.length === 1 ? "" : "s"}.`);
  };

  return (
    <Stack gap={4}>
      <Card eyebrow="OPTIONS" prov="human" title="Options" subtitle="Each combination of option values can become a variant">
        <Stack gap={3}>
          {options.length === 0 && <span className="ds-subtle">No options yet. Add one such as Finish with the values Natural, Blackened.</span>}
          {options.map((option, index) => (
            <Row key={option.name} gap={2} wrap className="t4-option-row">
              <strong>{option.name}</strong>
              {option.values.map((value) => <Pill key={value}>{value}</Pill>)}
              <span className="ds-grow" />
              <Button size="sm" variant="ghost" iconOnly aria-label={`Remove option ${option.name}`} onClick={() => setOptions(options.filter((_, i) => i !== index))}><Trash2 size={14} /></Button>
            </Row>
          ))}
          <form className="t4-option-add" onSubmit={(event) => {
            event.preventDefault();
            const values = [...new Set(optionValues.split(",").map((value) => value.trim()).filter(Boolean))];
            if (!optionName.trim() || values.length === 0 || options.some((option) => option.name.toLowerCase() === optionName.trim().toLowerCase())) return;
            setOptions([...options, { name: optionName.trim(), values }]);
            setOptionName(""); setOptionValues("");
          }}>
            <Field label="Option name" error={options.some((option) => option.name.toLowerCase() === optionName.trim().toLowerCase()) && optionName.trim() ? "That option exists" : undefined}>
              <TextInput value={optionName} placeholder="Finish" onChange={(event) => setOptionName(event.target.value)} />
            </Field>
            <Field label="Values, comma separated"><TextInput value={optionValues} placeholder="Natural, Blackened" onChange={(event) => setOptionValues(event.target.value)} /></Field>
            <Button type="submit" size="sm" variant="secondary" disabled={!optionName.trim() || !optionValues.trim()}><Plus size={14} /> Add option</Button>
          </form>
          <Row gap={2} wrap>
            <span className="ds-subtle">{combinations(options).length} combination{combinations(options).length === 1 ? "" : "s"} · {toAdd.length} not yet a variant</span>
            <span className="ds-grow" />
            <Button size="sm" variant="secondary" disabled={toAdd.length === 0} onClick={() => setVariants([...variants, ...toAdd])}>Add {toAdd.length} missing variant{toAdd.length === 1 ? "" : "s"}</Button>
          </Row>
        </Stack>
      </Card>

      <Card eyebrow="PRICE LIST" prov="human" title={`${variants.length} variant${variants.length === 1 ? "" : "s"}`} subtitle={`Base price ${context.money(base)} · tax ${taxCode} applies to every variant`}
        actions={dirty ? <Pill tone="warning" dot>Unsaved changes</Pill> : <Pill tone="success" dot>Saved</Pill>}
        footer={<div className="t4-foot-wrap">
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setVariants(savedVariants); setOptions(savedOptions); }}>Discard</Button>
          <Button size="sm" variant="ghost" onClick={() => setVariants([...variants, { id: `v-${variants.length + 1}-${wallMs().toString(36)}`, name: "", sku: `${baseSku}-`, priceDeltaMinor: 0 }])}><Plus size={14} /> Add a blank variant</Button>
          <span className="ds-grow" />
          <Button size="sm" variant="primary" disabled={!dirty || issues.length > 0} onClick={save}>Save variants</Button>
        </div>}>
        {variants.length === 0 ? <Empty title="No variants">A product with no variant cannot be chosen on the storefront. Add options above or a blank variant.</Empty> : (
          <ul className="t4-variant-list" aria-label="Variants">
            {variants.map((variant) => {
              const margin = variantMarginBp(base, variant.priceDeltaMinor, cost);
              return (
                <li key={variant.id} className="t4-variant-row">
                  <Field label="Variant" error={issueFor(variant.id, "name")}>
                    <TextInput value={variant.name} invalid={Boolean(issueFor(variant.id, "name"))} onChange={(event) => update(variant.id, { name: event.target.value })} />
                  </Field>
                  <Field label="SKU" error={issueFor(variant.id, "sku")}>
                    <TextInput value={variant.sku} invalid={Boolean(issueFor(variant.id, "sku"))} onChange={(event) => update(variant.id, { sku: event.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="Price difference" error={issueFor(variant.id, "price")}>
                    <MoneyInput valueMinor={variant.priceDeltaMinor} onChangeMinor={(minor) => update(variant.id, { priceDeltaMinor: minor })} currency={org.currency} label={`Price difference for ${variant.name || "new variant"}`} />
                  </Field>
                  <div className="t4-variant-figures">
                    <span className="ds-num"><strong>{context.money(base + variant.priceDeltaMinor)}</strong></span>
                    <span className="ds-subtle ds-num">{margin === undefined ? "No cost recorded" : `${(margin / 100).toFixed(1)}% margin`}</span>
                  </div>
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${variant.name || "variant"}`} onClick={() => setVariants(variants.filter((item) => item.id !== variant.id))}><Trash2 size={14} /></Button>
                </li>
              );
            })}
          </ul>
        )}
        {issues.length > 0 && <Notice tone="danger" title="Fix before saving">{issues.length} problem{issues.length === 1 ? "" : "s"} on the variants above.</Notice>}
      </Card>
    </Stack>
  );
}
