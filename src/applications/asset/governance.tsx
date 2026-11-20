import { useMemo, useState } from "react";
import { Copy, HardDrive, Images, Palette, ShieldAlert, Wand2 } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, ModalActions, Notice, OverlayActions, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { AssetPreview, fileState, storedBytes } from "./thumbs";
import { csvList, formatBytes, licence, licenceTone, useAssets, usedIn, useSeeded } from "./panels";
import { clockIso } from "@/platform/clock";

/* ====================================================================== *
 * ASSET — brand kits, transformations, usage and governance.
 * ====================================================================== */

const TOKENS = ["ink", "cobalt", "papaya", "aqua", "paper"] as const;

/* ---------------------------- ASSET-003 ---------------------------- */

export function BrandKits({ context, tab }: { context: ScreenContext; tab: "Brands" | "Tokens" | "Assets" | "Rules" }) {
  const data = useAssets();
  const brands = data.brands;
  const active = brands.find((row) => row.id === context.selectedId) ?? brands.find((row) => row.fields.master === true) ?? brands[0];

  if (tab === "Brands") {
    return (
      <Grid>
        {brands.map((brand) => {
          const logo = data.assets.find((row) => row.id === brand.fields.logoAssetId);
          return (
            <Card
              key={brand.id}
              eyebrow="BRAND KIT"
              prov={brand.fields.proposedBy ? "agent" : "human"}
              span={4}
              title={brand.title}
              subtitle={brand.summary}
              actions={brand.fields.master === true ? <Pill tone="success">Master</Pill> : brand.status === "draft" ? <Pill tone="warning">Draft</Pill> : <Pill>Sub-brand</Pill>}
            >
              <Stack gap={3}>
                {logo ? <AssetPreview record={logo} height={96} fit="contain" /> : <Empty title="No logo linked" icon={<Palette size={18} />}>Link a logo from the library.</Empty>}
                <Row gap={1} wrap>
                  {TOKENS.map((token) => {
                    const value = String(brand.fields[token] ?? "");
                    if (!value) return null;
                    return <i key={token} className="ds-swatch" title={`${token} ${value}`} style={{ background: value, width: 22, height: 22, border: "1px solid var(--border-default)" }} />;
                  })}
                </Row>
                <Properties rows={[
                  { label: "Heading type", value: String(brand.fields.headingFont ?? "—") },
                  { label: "Body type", value: String(brand.fields.bodyFont ?? "—") },
                  { label: "Assets", value: String(csvList(brand.fields.assets).length) },
                  { label: "Approved by", value: String(brand.fields.approvedBy ?? "Not approved") },
                ]} />
                <Row gap={2} wrap>
                  <Button size="sm" variant="secondary" onClick={() => { context.select(brand.id); context.openOverlay("Token editor", { id: brand.id }); }}>Edit tokens</Button>
                  <Button size="sm" variant="ghost" onClick={() => { context.select(brand.id); context.openOverlay("brand selection", { id: brand.id }); }}>Apply</Button>
                </Row>
              </Stack>
            </Card>
          );
        })}
        {brands.length === 0 && (
          <Empty title="No brand kit" icon={<Palette size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Token editor")}>Create a brand kit</Button>}>
            A kit holds the logos, palette, type and the rules that govern their use.
          </Empty>
        )}
      </Grid>
    );
  }

  if (tab === "Tokens") {
    if (!active) return <Empty title="No brand kit" icon={<Palette size={20} />}>Create one first.</Empty>;
    return (
      <Grid>
        <Card eyebrow="TOKENS" prov="human" span={7} title={`${active.title} tokens`} subtitle="The values every application reads">
          <Stack gap={3}>
            {TOKENS.map((token) => {
              const value = String(active.fields[token] ?? "");
              return (
                <Row key={token} gap={3}>
                  <i className="ds-swatch" style={{ background: value || "transparent", width: 28, height: 28, border: "1px solid var(--border-default)" }} aria-hidden="true" />
                  <strong className="ds-grow" style={{ textTransform: "capitalize" }}>{token}</strong>
                  <span className="ds-num">{value || "not set"}</span>
                </Row>
              );
            })}
            <Properties rows={[
              { label: "Type scale", value: String(active.fields.scale ?? "—") },
              { label: "Corner radius", value: String(active.fields.radius ?? "—") },
              { label: "Heading", value: String(active.fields.headingFont ?? "—") },
              { label: "Body", value: String(active.fields.bodyFont ?? "—") },
            ]} />
            <Button variant="primary" onClick={() => context.openOverlay("Token editor", { id: active.id })}>Edit these tokens</Button>
          </Stack>
        </Card>
        <Card eyebrow="CONTRAST" prov="posted" span={5} title="Contrast, checked here" subtitle="Against the paper and ink in this kit">
          <Stack gap={3}>
            {(["cobalt", "papaya", "aqua"] as const).map((token) => {
              const ratio = contrast(String(active.fields[token] ?? "#000000"), String(active.fields.paper ?? "#ffffff"));
              return (
                <Row key={token} gap={3}>
                  <span className="ds-grow" style={{ textTransform: "capitalize" }}>{token} on paper</span>
                  <Pill tone={ratio >= 4.5 ? "success" : ratio >= 3 ? "warning" : "danger"}>{ratio.toFixed(2)}:1</Pill>
                </Row>
              );
            })}
            <Notice tone="info" title="Computed, not asserted">
              The ratios are worked out from the token values in this record. Anything under 4.5:1 should not carry body text.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (tab === "Assets") {
    if (!active) return <Empty title="No brand kit" icon={<Palette size={20} />}>Create one first.</Empty>;
    const ids = csvList(active.fields.assets);
    const linked = data.assets.filter((row) => ids.includes(row.id));
    const unlinked = data.assets.filter((row) => !ids.includes(row.id) && (row.tags.includes("brand") || row.fields.brandId));
    return (
      <Stack gap={4}>
        <Card eyebrow="KIT ASSETS" prov="human" title={`${linked.length} assets in ${active.title}`} subtitle="What a designer may reach for without asking">
          <Grid>
            {linked.map((row) => (
              <Card key={row.id} eyebrow="ASSET" prov="human" span={3} title={row.title} subtitle={String(row.fields.kind ?? "")}>
                <Stack gap={2}>
                  <AssetPreview record={row} height={100} fit="contain" />
                  <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)}>Open</Button>
                </Stack>
              </Card>
            ))}
            {linked.length === 0 && <Empty title="Nothing linked" icon={<Images size={20} />}>Link approved assets so the kit is usable.</Empty>}
          </Grid>
        </Card>
        {unlinked.length > 0 && (
          <Card eyebrow="CANDIDATES" prov="posted" title="Brand-ish assets not in this kit" subtitle={`${unlinked.length} candidates`}>
            <Stack gap={2}>
              {unlinked.map((row) => (
                <Row key={row.id} gap={2}>
                  <span className="ds-grow ds-truncate">{row.title}</span>
                  <Pill tone={row.status === "approved" ? "success" : "warning"}>{row.status.replace(/_/g, " ")}</Pill>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={row.status !== "approved"}
                    title={row.status !== "approved" ? "Only an approved asset may join a kit" : undefined}
                    onClick={async () => {
                      const saved1 = await context.mutate.patch(active.id, { fields: { ...active.fields, assets: [...ids, row.id].join(",") } }, { event: `${row.title} linked into ${active.title}`, expectRevision: active.revision });
                      if (!saved1) return;
                      context.toast("Linked", `${row.title} is part of ${active.title}.`);
                    }}
                  >
                    Add
                  </Button>
                </Row>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  if (!active) return <Empty title="No brand kit" icon={<Palette size={20} />}>Create one first.</Empty>;
  const rules = ((active.body as { rules?: string[] } | undefined)?.rules ?? []);
  const voice = (active.body as { voice?: string } | undefined)?.voice;
  return (
    <Grid>
      <Card eyebrow="RULES" prov="human" span={7} title={`${active.title} rules`} subtitle={`${rules.length} written rules`}>
        {rules.length === 0 ? (
          <Empty title="No rules written" icon={<Palette size={20} />}>Rules are what make a kit usable by somebody who was not in the room.</Empty>
        ) : (
          <Stack gap={3}>
            {rules.map((rule, index) => (
              <Row key={rule} gap={3} style={{ alignItems: "flex-start" }}>
                <strong className="ds-num" style={{ width: 20 }}>{index + 1}</strong>
                <span className="ds-grow">{rule}</span>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
      <Stack gap={4} className="ds-col-5">
        <Card eyebrow="VOICE" prov="human" span={5} title="Voice">{voice ? <p>{voice}</p> : <span className="ds-subtle">Not recorded.</span>}</Card>
        <Card eyebrow="MASTER" prov="human" span={5} title="Replacing the master">
          <Stack gap={3}>
            <Notice tone="warning" title="An unapproved kit cannot become the master">
              {active.status === "draft"
                ? `${active.title} is a draft. It must be approved before it can replace the active identity.`
                : "The master kit changes only through a deliberate, logged action with its impact shown first."}
            </Notice>
            <Button variant="secondary" onClick={() => context.openOverlay("global impact", { id: active.id })}>What publishing would change</Button>
          </Stack>
        </Card>
      </Stack>
    </Grid>
  );
}

/** Short, still unique: trims the middle rather than the end. */
function shortLabel(title: string): string {
  if (title.length <= 18) return title;
  return `${title.slice(0, 9)}…${title.slice(-7)}`;
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.slice(0, 6);
  const parts = [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2) || "0", 16) / 255);
  const linear = parts.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const one = luminance(a);
  const two = luminance(b);
  const light = Math.max(one, two);
  const dark = Math.min(one, two);
  return (light + 0.05) / (dark + 0.05);
}

export function TokenEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const brand = data.brands.find((row) => row.id === (payload?.id ?? context.selectedId));
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    const defaults: Record<string, string> = { ink: "#14213D", cobalt: "#234FE8", papaya: "#B54708", aqua: "#0B7A75", paper: "#FAFAF7" };
    for (const token of TOKENS) seed[token] = String(brand?.fields[token] ?? defaults[token]);
    seed.headingFont = String(brand?.fields.headingFont ?? "Inter");
    seed.bodyFont = String(brand?.fields.bodyFont ?? "Inter");
    seed.title = brand?.title ?? "";
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const bodyRatio = contrast(values.ink, values.paper);

  return (
    <Stack gap={4}>
      {!brand && (
        <Field label="Kit name" required>
          <TextInput value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} placeholder="Winter collection" required />
        </Field>
      )}
      {TOKENS.map((token) => (
        <Row key={token} gap={3}>
          <i className="ds-swatch" style={{ background: values[token], width: 28, height: 28, border: "1px solid var(--border-default)" }} aria-hidden="true" />
          <Field label={token.charAt(0).toUpperCase() + token.slice(1)}>
            <TextInput value={values[token]} onChange={(event) => setValues((current) => ({ ...current, [token]: event.target.value }))} />
          </Field>
        </Row>
      ))}
      <Row gap={3} wrap>
        <Field label="Heading type"><TextInput value={values.headingFont} onChange={(event) => setValues((current) => ({ ...current, headingFont: event.target.value }))} /></Field>
        <Field label="Body type"><TextInput value={values.bodyFont} onChange={(event) => setValues((current) => ({ ...current, bodyFont: event.target.value }))} /></Field>
      </Row>
      <Notice tone={bodyRatio >= 4.5 ? "success" : "warning"} title={`Ink on paper is ${bodyRatio.toFixed(2)}:1`}>
        {bodyRatio >= 4.5 ? "That passes for body text." : "Under 4.5:1. Body text at this pairing would be hard to read."}
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!brand && !values.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              if (brand) {
                const saved2 = await context.mutate.patch(brand.id, {
                  fields: { ...brand.fields, ...Object.fromEntries(TOKENS.map((token) => [token, values[token]])), headingFont: values.headingFont, bodyFont: values.bodyFont },
                }, { event: `Brand tokens updated on ${brand.title}`, expectRevision: brand.revision });
                if (!saved2) return;
                context.toast("Tokens saved", `${brand.title} now carries these values, and the previous set is in its history.`);
              } else {
                await context.mutate.create({
                  collection: "brands",
                  title: values.title,
                  status: "draft",
                  summary: "New kit. It cannot replace the master until it is approved.",
                  tags: ["brand", "draft"],
                  fields: { master: false, ...Object.fromEntries(TOKENS.map((token) => [token, values[token]])), headingFont: values.headingFont, bodyFont: values.bodyFont, scale: "1.25", radius: "10px", assets: "", proposedBy: context.actor },
                  body: { voice: "", rules: [] },
                }, `Brand kit drafted: ${values.title}`);
                context.toast("Kit drafted", "It is a draft: approval is a separate, logged step.");
              }
              close();
            } finally { setBusy(false); }
          }}
        >
          {brand ? "Save tokens" : "Create the kit"}
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function BrandSelection({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const brand = data.brands.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? data.brands[0];
  const [surface, setSurface] = useState("quotes");
  if (!brand) return <Empty title="No kit" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Kit", value: brand.title },
        { label: "State", value: <Pill tone={brand.status === "active" ? "success" : "warning"}>{brand.status}</Pill> },
      ]} />
      <Field label="Apply to">
        <Select value={surface} onChange={(event) => setSurface(event.target.value)}>
          {["quotes", "invoices", "client portal", "decks", "site"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </Select>
      </Field>
      {brand.status === "draft" ? (
        <Notice tone="warning" title="A draft kit may be previewed, not applied">
          Approving the kit is what allows it onto a surface customers see. Until then this records an intention.
        </Notice>
      ) : (
        <Notice tone="info" title="One surface at a time">
          Recording a kit against a surface is how the other applications know which identity to draw on.
        </Notice>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          onClick={async () => {
            const saved3 = await context.mutate.patch(brand.id, { fields: { ...brand.fields, appliedTo: [...new Set([...csvList(brand.fields.appliedTo), surface])].join(",") } }, { event: `${brand.title} recorded against ${surface}`, expectRevision: brand.revision });
            if (!saved3) return;
            context.toast(brand.status === "draft" ? "Recorded as intended" : "Applied", `${brand.title} is recorded against ${surface}.`, brand.status === "draft" ? "info" : "ok");
            close();
          }}
        >
          Record against {surface}
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function GlobalImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const brand = data.brands.find((row) => row.id === (payload?.id ?? context.selectedId)) ?? data.brands[0];
  const master = data.brands.find((row) => row.fields.master === true);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  if (!brand) return <Empty title="No kit" />;
  const linked = csvList(brand.fields.assets).length;
  const approved = Boolean(brand.fields.approvedBy);

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Kit", value: brand.title },
        { label: "Current master", value: master?.title ?? "None" },
        { label: "Assets in the kit", value: String(linked) },
        { label: "Approved", value: approved ? String(brand.fields.approvedBy) : "No" },
        { label: "Surfaces recorded", value: csvList(brand.fields.appliedTo).join(", ") || "None" },
      ]} />
      {!approved ? (
        <Notice tone="danger" title="This kit cannot replace the master">
          Nobody has approved it. An unapproved upload becoming the company identity is exactly the accident this check exists to
          prevent.
        </Notice>
      ) : (
        <>
          <Notice tone="warning" title="Everything that draws on the master changes at once">
            Quotes, invoices, the portal and every deck read the master kit. Publishing {brand.title} changes all of them the next time
            they render.
          </Notice>
          <Field label="Type PUBLISH to confirm" required>
            <TextInput value={phrase} onChange={(event) => setPhrase(event.target.value.toUpperCase())} autoComplete="off" />
          </Field>
        </>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!approved || phrase !== "PUBLISH"}
          onClick={async () => {
            setBusy(true);
            try {
              if (master && master.id !== brand.id) {
                const saved4 = await context.mutate.patch(master.id, { fields: { ...master.fields, master: false } }, { event: `${master.title} is no longer the master kit` });
                if (!saved4) return;
              }
              const saved5 = await context.mutate.patch(brand.id, { status: "active", fields: { ...brand.fields, master: true, publishedBy: context.actor, publishedAt: clockIso() } }, { event: `${brand.title} published as the master kit`, expectRevision: brand.revision });
              if (!saved5) return;
              context.toast("Published", `${brand.title} is the master kit. The previous master is kept and can be restored.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Publish as master
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

/* ---------------------------- ASSET-004 ---------------------------- */

export function Transformations({ context, tab }: { context: ScreenContext; tab: "Presets" | "Jobs" | "History" | "Failed" }) {
  const data = useAssets();
  const presets = data.transforms.filter((row) => row.fields.kind === "preset");
  const jobs = data.transforms.filter((row) => row.fields.kind === "job");

  if (tab === "Presets") {
    return (
      <Grid>
        {presets.map((preset) => (
          <Card
            key={preset.id}
            eyebrow="PRESET"
            prov="human"
            span={4}
            title={preset.title}
            subtitle={preset.summary}
            actions={<Pill tone={preset.status === "published" ? "success" : "warning"}>{preset.status}</Pill>}
          >
            <Stack gap={3}>
              <div
                aria-hidden="true"
                style={{
                  height: 90,
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed var(--border-default)",
                  background: "var(--bg-inset)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <div style={{
                  width: `${Math.min(80, (Number(preset.fields.width) / Math.max(Number(preset.fields.width), Number(preset.fields.height))) * 80)}%`,
                  aspectRatio: `${Number(preset.fields.width)} / ${Number(preset.fields.height)}`,
                  background: "var(--accent)",
                  opacity: 0.25,
                  borderRadius: 4,
                }} />
              </div>
              <Properties rows={[
                { label: "Output", value: `${String(preset.fields.width)} × ${String(preset.fields.height)} ${String(preset.fields.format).toUpperCase()}` },
                { label: "Fit", value: `${String(preset.fields.fit)} · ${String(preset.fields.focus)}` },
                { label: "Quality", value: `${String(preset.fields.quality)}%` },
                { label: "Watermark", value: preset.fields.watermark === true ? "Yes" : "No" },
                { label: "Used", value: `${String(preset.fields.uses ?? 0)} times` },
              ]} />
              <Row gap={2} wrap>
                <Button size="sm" variant="secondary" onClick={() => { context.select(preset.id); context.openOverlay("Transform inspector", { id: preset.id }); }}>Inspect</Button>
                <Button size="sm" variant="ghost" onClick={() => { context.select(preset.id); context.openOverlay("overwrite review", { id: preset.id }); }}>Batch export</Button>
              </Row>
            </Stack>
          </Card>
        ))}
        {presets.length === 0 && (
          <Empty title="No presets" icon={<Wand2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Transform inspector")}>Create a preset</Button>}>
            A preset is a named size, crop and format so the same output is produced the same way every time.
          </Empty>
        )}
      </Grid>
    );
  }

  const rows = tab === "Failed" ? jobs.filter((row) => row.status === "failed") : tab === "History" ? jobs : jobs.filter((row) => row.status !== "failed");

  return (
    <Card eyebrow="JOBS" prov="posted" title={tab} subtitle={`${rows.length} ${rows.length === 1 ? "job" : "jobs"}`} flush>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Transformation jobs"
        selectedId={context.selectedId}
        onSelect={context.select}
        onOpen={(id) => { context.select(id); context.openOverlay("Transform inspector", { id }); }}
        rowTone={(row) => (row.status === "failed" ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Job", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{row.summary}</p></div>, filterValue: (row) => `${row.title} ${row.summary}` },
          { key: "preset", header: "Preset", cell: (row) => data.transforms.find((entry) => entry.id === row.fields.presetId)?.title ?? "—" },
          { key: "assets", header: "Assets", align: "end", cell: (row) => String(csvList(row.fields.assetIds).length) },
          { key: "produced", header: "Produced", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.produced ?? 0)}</span> },
          { key: "failed", header: "Failed", align: "end", cell: (row) => (Number(row.fields.failed ?? 0) > 0 ? <Pill tone="danger">{String(row.fields.failed)}</Pill> : "0") },
          { key: "at", header: "When", align: "end", cell: (row) => <span className="ds-num">{context.relative(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "status", header: "State", align: "end", cell: (row) => <Pill tone={row.status === "done" ? "success" : "danger"}>{row.status}</Pill> },
        ]}
        bulkActions={tab === "Failed" ? [
          {
            label: "Inspect the reason",
            onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("rights", { id: selected[0]?.id }); },
            disabled: (selected) => selected.length !== 1,
          },
        ] : undefined}
        empty={
          <Empty title={tab === "Failed" ? "Nothing has failed" : "No jobs yet"} icon={<Wand2 size={20} />}>
            {tab === "Failed" ? "Jobs that stop for a licence or a missing file would be listed here with the reason." : "Run a preset over some assets to create a job."}
          </Empty>
        }
      />
    </Card>
  );
}

export function TransformInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = data.transforms.find((row) => row.id === (payload?.id ?? context.selectedId));
  const isJob = record?.fields.kind === "job";
  const [title, setTitle] = useSeeded(record && !isJob ? record.title : "");
  const [width, setWidth] = useSeeded(Number(record?.fields.width ?? 1200));
  const [height, setHeight] = useSeeded(Number(record?.fields.height ?? 630));
  const [format, setFormat] = useSeeded(String(record?.fields.format ?? "png"));
  const [quality, setQuality] = useSeeded(Number(record?.fields.quality ?? 82));
  const [watermark, setWatermark] = useSeeded(record?.fields.watermark === true);
  const [busy, setBusy] = useState(false);

  if (isJob && record) {
    const assets = data.assets.filter((row) => csvList(record.fields.assetIds).includes(row.id));
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Job", value: record.title },
          { label: "Preset", value: data.transforms.find((row) => row.id === record.fields.presetId)?.title ?? "—" },
          { label: "Requested by", value: String(record.fields.requestedBy ?? record.ownerName) },
          { label: "Produced", value: String(record.fields.produced ?? 0) },
          { label: "Failed", value: String(record.fields.failed ?? 0) },
          { label: "Overwrote originals", value: record.fields.overwrite === true ? "Yes" : "No, variants were added" },
        ]} />
        {record.fields.failureReason ? <Notice tone="danger" title="Why it stopped">{String(record.fields.failureReason)}</Notice> : null}
        <Grid>
          {assets.map((row) => (
            <Card key={row.id} eyebrow="SOURCE" prov="human" span={6} title={row.title} subtitle={String(row.fields.kind ?? "")}>
              <AssetPreview record={row} height={110} />
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Field label="Preset name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Social card 1200×630" required /></Field>
      <Row gap={3} wrap>
        <Field label="Width"><TextInput type="number" min={16} value={String(width)} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
        <Field label="Height"><TextInput type="number" min={16} value={String(height)} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
        <Field label="Format">
          <Select value={format} onChange={(event) => setFormat(event.target.value)}>
            {["png", "jpg", "webp", "svg"].map((entry) => <option key={entry} value={entry}>{entry.toUpperCase()}</option>)}
          </Select>
        </Field>
      </Row>
      <Field label={`Quality ${quality}%`}>
        <TextInput type="range" min={40} max={100} value={String(quality)} onChange={(event) => setQuality(Number(event.target.value))} />
      </Field>
      <Checkbox label="Apply the brand watermark" checked={watermark} onChange={(event) => setWatermark(event.target.checked)} />
      <Notice tone="info" title="A preset is a named intention">
        It records the size, crop and format. Running it over assets creates variant records with those values; no pixels are
        re-encoded in this browser.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const fields = { kind: "preset", width, height, fit: "cover", focus: "centre", format, quality, watermark, channel: "Custom", uses: Number(record?.fields.uses ?? 0) };
              if (record) {
                const saved6 = await context.mutate.patch(record.id, { title, summary: `${width} × ${height} ${format.toUpperCase()} at ${quality}%.`, fields: { ...record.fields, ...fields } }, { event: `Preset updated: ${title}`, expectRevision: record.revision });
                if (!saved6) return;
                context.toast("Preset saved", `${title} is ${record.status}.`);
              } else {
                await context.mutate.create({
                  collection: "transforms",
                  title,
                  status: "draft",
                  summary: `${width} × ${height} ${format.toUpperCase()} at ${quality}%.`,
                  tags: ["preset"],
                  fields,
                }, `Preset drafted: ${title}`);
                context.toast("Preset drafted", "Publish it when you are happy, and it becomes available to every surface.");
              }
              close();
            } finally { setBusy(false); }
          }}
        >
          {record ? "Save preset" : "Create preset"}
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function TransformRights({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const job = data.transforms.find((row) => row.id === (payload?.id ?? context.selectedId));
  const assets = job ? data.assets.filter((row) => csvList(job.fields.assetIds).includes(row.id)) : data.assets.filter((row) => licence(row, now).state !== "owned");
  const problems = assets.filter((row) => licence(row, now).state === "expired" || fileState(row) === "metadata_only");

  return (
    <Stack gap={4}>
      {job && <Properties rows={[{ label: "Job", value: job.title }, { label: "State", value: <Pill tone={job.status === "failed" ? "danger" : "success"}>{job.status}</Pill> }]} />}
      {problems.length === 0 ? (
        <Notice tone="success" title="Every source is clear">Each asset has a current licence and something to transform.</Notice>
      ) : (
        <Stack gap={3}>
          {problems.map((row) => {
            const state = licence(row, now);
            return (
              <Notice
                key={row.id}
                tone="danger"
                title={row.title}
                actions={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)}>Open</Button>}
              >
                {state.state === "expired"
                  ? `The licence from ${String(row.fields.licensor ?? "the licensor")} ${state.label.toLowerCase()}, so it cannot be used in a produced file.`
                  : "Catalogued as metadata only: there is no file in this browser to resize."}
              </Notice>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

export function OverwriteReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const preset = data.transforms.find((row) => row.id === (payload?.id ?? context.selectedId) && row.fields.kind === "preset") ?? data.transforms.find((row) => row.fields.kind === "preset");
  const candidates = data.assets.filter((row) => row.status !== "archived" && ["image", "logo"].includes(String(row.fields.kind)));
  const [chosen, setChosen] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!preset) return <Empty title="No preset" icon={<Wand2 size={20} />}>Create a preset first.</Empty>;

  const selected = candidates.filter((row) => chosen.includes(row.id));
  const blocked = selected.filter((row) => licence(row, now).state === "expired" || fileState(row) === "metadata_only");
  const runnable = selected.filter((row) => !blocked.includes(row));

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Preset", value: preset.title },
        { label: "Output", value: `${String(preset.fields.width)} × ${String(preset.fields.height)} ${String(preset.fields.format).toUpperCase()}` },
      ]} />
      <Field label="Assets to run it over">
        <Stack gap={2}>
          {candidates.map((row) => (
            <Checkbox
              key={row.id}
              label={`${row.title} — ${licence(row, now).label}`}
              checked={chosen.includes(row.id)}
              onChange={(event) => setChosen((current) => (event.target.checked ? [...current, row.id] : current.filter((entry) => entry !== row.id)))}
            />
          ))}
        </Stack>
      </Field>
      <Checkbox
        label="Overwrite the originals instead of adding variants"
        checked={overwrite}
        onChange={(event) => setOverwrite(event.target.checked)}
      />
      {overwrite && (
        <Notice tone="danger" title="Overwriting is refused here">
          A destructive overwrite needs a stored version to fall back to and an authorisation to do it. Neither exists in this build, so
          the job will add variants and leave every original intact.
        </Notice>
      )}
      {blocked.length > 0 && (
        <Notice tone="warning" title={`${blocked.length} ${blocked.length === 1 ? "asset" : "assets"} will be skipped`}>
          {blocked.map((row) => `${row.title}: ${licence(row, now).state === "expired" ? "licence expired" : "no file stored"}`).join("; ")}
        </Notice>
      )}
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={selected.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              for (const source of runnable) {
                await context.mutate.create({
                  collection: "assets",
                  title: `${source.title} — ${String(preset.fields.width)}×${String(preset.fields.height)}`,
                  status: source.status,
                  summary: `Produced by ${preset.title} from ${source.title}.`,
                  parentId: source.id,
                  tags: ["variant"],
                  fields: {
                    ...source.fields,
                    width: Number(preset.fields.width), height: Number(preset.fields.height),
                    format: String(preset.fields.format), crop: `${String(preset.fields.focus)}, ${(Number(preset.fields.width) / Number(preset.fields.height)).toFixed(2)}:1`,
                    variantOf: source.id, presetId: preset.id, version: 1, usedIn: "",
                    fileState: fileState(source) === "metadata_only" ? "metadata_only" : "generated_preview",
                  },
                }, `Variant produced by ${preset.title} from ${source.title}`);
              }
              await context.mutate.create({
                collection: "transforms",
                title: `${preset.title} over ${selected.length} ${selected.length === 1 ? "asset" : "assets"}`,
                status: blocked.length === selected.length ? "failed" : "done",
                summary: blocked.length
                  ? `${runnable.length} produced, ${blocked.length} skipped.`
                  : `${runnable.length} variants produced. No original was changed.`,
                tags: ["job"],
                fields: {
                  kind: "job", presetId: preset.id, assetIds: selected.map((row) => row.id).join(","),
                  produced: runnable.length, failed: blocked.length, requestedBy: context.actor, overwrite: false,
                  ...(blocked.length ? { failureReason: blocked.map((row) => `${row.title}: ${licence(row, now).state === "expired" ? "licence expired" : "no file stored"}`).join("; ") } : {}),
                },
              }, `Batch export run with ${preset.title}`);
              const saved7 = await context.mutate.patch(preset.id, { fields: { ...preset.fields, uses: Number(preset.fields.uses ?? 0) + runnable.length } }, { event: `${preset.title} used ${runnable.length} more times` });
              if (!saved7) return;
              context.toast(
                blocked.length ? "Run finished with skips" : "Variants produced",
                `${runnable.length} variant ${runnable.length === 1 ? "record" : "records"} added, ${blocked.length} skipped, no original touched.`,
                blocked.length ? "blocked" : "ok",
              );
              close();
            } finally { setBusy(false); }
          }}
        >
          Run over {selected.length} {selected.length === 1 ? "asset" : "assets"}
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

/* ---------------------------- ASSET-005 ---------------------------- */

export function GovernanceScreen({ context, tab }: { context: ScreenContext; tab: "Usage" | "Rights" | "Duplicates" | "Storage" }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const live = data.assets.filter((row) => row.status !== "archived");

  const duplicates = useMemo(() => {
    const map = new Map<string, Rec[]>();
    for (const row of data.assets.filter((asset) => asset.status !== "archived")) {
      const key = String(row.fields.checksum ?? row.id);
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return [...map.values()].filter((group) => group.length > 1);
  }, [data.assets]);

  if (tab === "Usage") {
    const unused = live.filter((row) => usedIn(row).length === 0);
    const heavy = [...live].sort((a, b) => usedIn(b).length - usedIn(a).length).slice(0, 8);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="posted" label="Assets in use" value={String(live.filter((row) => usedIn(row).length > 0).length)} meta={`of ${live.length} live assets`} />
          <Stat prov="posted" label="Never used" value={String(unused.length)} meta="Candidates for archiving" />
          <Stat prov="posted" label="Recorded uses" value={String(live.reduce((sum, row) => sum + usedIn(row).length, 0))} meta="Counted from the asset records" />
          <Stat prov="posted" label="Variants" value={String(live.filter((row) => row.fields.variantOf).length)} meta="Derived from an original" />
        </StatRow>
        <Card eyebrow="USAGE" prov="posted" title="Most used" subtitle="Where a change would be felt first">
          <BarChart
            title="Recorded uses by asset"
            height={210}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Uses", points: heavy.map((row) => ({ label: shortLabel(row.title), value: usedIn(row).length })) }]}
            footer="Uses are recorded on each asset as surfaces reference it; nothing is inferred from file names."
          />
        </Card>
        <Card eyebrow="UNUSED" prov="posted" title="Never used" subtitle={`${unused.length} assets`} flush>
          <DataGrid
            rows={unused}
            rowId={(row) => row.id}
            label="Unused assets"
            selectedId={context.selectedId}
            onSelect={context.select}
            columns={[
              { key: "title", header: "Asset", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "kind", header: "Type", cell: (row) => String(row.fields.kind ?? "") },
              { key: "added", header: "Added", align: "end", cell: (row) => <span className="ds-num">{context.relative(row.createdAt)}</span>, sortValue: (row) => row.createdAt },
              { key: "licence", header: "Licence", align: "end", cell: (row) => <Pill tone={licenceTone(licence(row, now).state)}>{licence(row, now).label}</Pill> },
            ]}
            bulkActions={[
              {
                label: "Set retention",
                onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("expiry warning", { ids: selected.map((row) => row.id) }); },
              },
            ]}
            empty={<Empty title="Everything is used" icon={<Images size={20} />}>No asset is sitting unused.</Empty>}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Rights") {
    const rows = [...data.assets].sort((a, b) => String(a.fields.licenceExpiry ?? "~").localeCompare(String(b.fields.licenceExpiry ?? "~")));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Rights expiry is the thing most likely to catch somebody out">
          An expired licence does not stop an asset existing; it stops it being used. This table is ordered by what expires soonest.
        </Notice>
        <Card eyebrow="LICENCE REGISTER" prov="human" title="Licences" subtitle={`${rows.filter((row) => row.fields.licenceExpiry).length} of ${rows.length} assets have an expiry`} flush>
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Licence register"
            selectedId={context.selectedId}
            onSelect={context.select}
            onOpen={(id) => context.navigate(`/o/${context.org.slug}/asset/assets/${id}`)}
            rowTone={(row) => {
              const state = licence(row, now).state;
              return state === "expired" ? "danger" : state === "expiring" ? "warning" : undefined;
            }}
            columns={[
              { key: "title", header: "Asset", primary: true, cell: (row) => <div><strong>{row.title}</strong><p className="ds-subtle">{String(row.fields.licensor ?? "")}</p></div>, filterValue: (row) => `${row.title} ${String(row.fields.licensor ?? "")}` },
              { key: "licence", header: "Licence", cell: (row) => String(row.fields.licence ?? "").replace(/_/g, " ") },
              { key: "ref", header: "Reference", hideBelow: 1200, cell: (row) => String(row.fields.licenceRef ?? "—") },
              { key: "expiry", header: "Expiry", cell: (row) => (row.fields.licenceExpiry ? <span className="ds-num">{context.date(String(row.fields.licenceExpiry))}</span> : "None"), sortValue: (row) => String(row.fields.licenceExpiry ?? "~") },
              { key: "state", header: "State", cell: (row) => <Pill tone={licenceTone(licence(row, now).state)}>{licence(row, now).label}</Pill> },
              { key: "uses", header: "Live uses", align: "end", cell: (row) => String(usedIn(row).length) },
            ]}
            bulkActions={[
              { label: "Expiry impact", onRun: (selected) => { context.select(selected[0]?.id); context.openOverlay("expiry warning", { ids: selected.map((row) => row.id) }); } },
            ]}
            empty={<Empty title="No assets" />}
          />
        </Card>
      </Stack>
    );
  }

  if (tab === "Duplicates") {
    return (
      <Stack gap={4}>
        {duplicates.length === 0 ? (
          <Empty title="No duplicates" icon={<Copy size={20} />}>No two assets share a checksum.</Empty>
        ) : (
          duplicates.map((group) => (
            <Card
              key={group[0].id}
              eyebrow="DUPLICATES"
              prov="posted"
              title={`${group.length} copies of the same file`}
              subtitle={`Checksum ${String(group[0].fields.checksum ?? "")}`}
              actions={<Button size="sm" variant="secondary" onClick={() => { context.select(group[0].id); context.openOverlay("merge preview", { ids: group.map((row) => row.id) }); }}>Resolve</Button>}
            >
              <Grid>
                {group.map((row) => (
                  <Card key={row.id} eyebrow="COPY" prov="human" span={6} title={row.title} subtitle={`${row.status.replace(/_/g, " ")} · ${usedIn(row).length} ${usedIn(row).length === 1 ? "use" : "uses"}`}>
                    <Stack gap={2}>
                      <AssetPreview record={row} height={110} />
                      <Properties rows={[
                        { label: "Added", value: context.date(row.createdAt) },
                        { label: "Owner", value: row.ownerName },
                        { label: "Dimensions", value: `${String(row.fields.width)} × ${String(row.fields.height)}` },
                      ]} />
                    </Stack>
                  </Card>
                ))}
              </Grid>
            </Card>
          ))
        )}
      </Stack>
    );
  }

  const accounted = live.reduce((sum, row) => sum + (storedBytes(row) ?? 0), 0);
  const byKind = Object.entries(live.reduce<Record<string, number>>((all, row) => {
    const kind = String(row.fields.kind ?? "other");
    all[kind] = (all[kind] ?? 0) + (storedBytes(row) ?? 0);
    return all;
  }, {}));
  const noFile = live.filter((row) => storedBytes(row) === undefined);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Bytes accounted for" value={formatBytes(accounted)} meta={`${live.length - noFile.length} assets with something stored`} />
        <Stat prov="posted" label="Catalogued without a file" value={String(noFile.length)} meta="Size genuinely unknown" />
        <Stat prov="posted" label="Archived" value={String(data.assets.length - live.length)} meta="Kept so old documents resolve" />
        <Stat label="Browser quota" value="Unavailable" unavailable meta="The browser does not report a reliable figure" />
      </StatRow>
      <Card eyebrow="STORAGE" prov="posted" title="Where the stored bytes are" subtitle="Only what this browser actually holds">
        <BarChart
          title="Stored bytes by asset type"
          height={200}
          format={(value) => formatBytes(value)}
          series={[{ name: "Bytes", points: byKind.map(([kind, bytes]) => ({ label: kind, value: bytes })) }]}
          footer="Generated previews and metadata-only records contribute nothing, because nothing is stored for them."
        />
      </Card>
      <Card eyebrow="NO FILE" prov="unknown" title="Assets with no stored file" subtitle={`${noFile.length} records`} flush>
        <DataGrid
          rows={noFile}
          rowId={(row) => row.id}
          label="Assets without a stored file"
          selectedId={context.selectedId}
          onSelect={context.select}
          columns={[
            { key: "title", header: "Asset", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Type", cell: (row) => `${String(row.fields.kind ?? "")} · ${String(row.fields.format ?? "").toUpperCase()}` },
            { key: "state", header: "Why", cell: (row) => (fileState(row) === "metadata_only" ? "Catalogued as metadata only" : "Preview is drawn from the record") },
            { key: "uses", header: "Uses", align: "end", cell: (row) => String(usedIn(row).length) },
          ]}
          empty={<Empty title="Every asset has something stored" icon={<HardDrive size={20} />}>Nothing is catalogued without a file.</Empty>}
        />
      </Card>
    </Stack>
  );
}

export function UsageInspector({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return data.assets.filter((row) => usedIn(row).some((use) => use.toLowerCase().includes(needle)));
  }, [data.assets, query]);

  return (
    <Stack gap={4}>
      <Field label="Find every asset used in" hint="Try a surface name such as deck, quote or catalogue.">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Winter collection deck" />
      </Field>
      {query && matches.length === 0 && <Notice tone="info" title="No asset records that use">Nothing records a use matching that text.</Notice>}
      <Stack gap={3}>
        {matches.map((row) => (
          <Row key={row.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
            <div style={{ width: 90, flex: "none" }}><AssetPreview record={row} height={60} /></div>
            <div className="ds-grow">
              <strong>{row.title}</strong>
              <p className="ds-subtle">{usedIn(row).join(", ")}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/asset/assets/${row.id}`)}>Open</Button>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

export function MergePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const [picked, setPicked] = useState<string[] | undefined>(payload?.ids);
  const group = data.assets.filter((row) => (picked ?? []).includes(row.id));
  const [keepId, setKeepId] = useSeeded(group.find((row) => row.status === "approved")?.id ?? group[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  if (group.length < 2) {
    const map = new Map<string, Rec[]>();
    for (const row of data.assets.filter((asset) => asset.status !== "archived")) {
      const key = String(row.fields.checksum ?? row.id);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    const groups = [...map.values()].filter((rows) => rows.length > 1);
    if (groups.length === 0) return <Empty title="No duplicates" icon={<Copy size={20} />}>No two live assets share a checksum.</Empty>;
    return (
      <Stack gap={3}>
        <p className="ds-subtle">Choose the duplicate group to resolve. Every record and its uses are shown before anything is archived.</p>
        {groups.map((rows) => (
          <Row key={rows[0].id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <strong className="ds-grow">{rows.map((row) => row.title).join(" · ")}</strong>
            <span className="ds-subtle">{rows.length} records</span>
            <Button size="sm" variant="primary" onClick={() => { setPicked(rows.map((row) => row.id)); setKeepId(rows.find((row) => row.status === "approved")?.id ?? rows[0].id); }}>Review</Button>
          </Row>
        ))}
      </Stack>
    );
  }
  const keep = group.find((row) => row.id === keepId);
  const drop = group.filter((row) => row.id !== keepId);
  const movedUses = [...new Set(drop.flatMap((row) => usedIn(row)))];

  return (
    <Stack gap={4}>
      <Field label="Keep which one">
        <Select value={keepId} onChange={(event) => setKeepId(event.target.value)}>
          {group.map((row) => <option key={row.id} value={row.id}>{row.title} — {row.status.replace(/_/g, " ")}, {usedIn(row).length} {usedIn(row).length === 1 ? "use" : "uses"}</option>)}
        </Select>
      </Field>
      <Grid>
        {group.map((row) => (
          <Card key={row.id} eyebrow={row.id === keepId ? "KEEP" : "ARCHIVE"} prov="human" span={6} title={row.title} subtitle={row.id === keepId ? "Kept" : "Archived and pointed at the kept one"}>
            <Stack gap={2}>
              <AssetPreview record={row} height={110} />
              <Properties rows={[
                { label: "Status", value: row.status.replace(/_/g, " ") },
                { label: "Uses", value: usedIn(row).join(", ") || "None" },
              ]} />
            </Stack>
          </Card>
        ))}
      </Grid>
      <Notice tone="info" title="Nothing is deleted">
        The duplicates are archived with a pointer to the one you keep, and their recorded uses move across. Old references still
        resolve.
      </Notice>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!keep}
          onClick={async () => {
            if (!keep) return;
            setBusy(true);
            try {
              for (const row of drop) {
                const saved8 = await context.mutate.patch(row.id, {
                  status: "archived",
                  fields: { ...row.fields, supersededBy: keep.id, archivedBy: context.actor, archivedAt: clockIso() },
                }, { event: `Duplicate archived in favour of ${keep.title}`, expectRevision: row.revision });
                if (!saved8) return;
              }
              const saved9 = await context.mutate.patch(keep.id, {
                fields: { ...keep.fields, usedIn: [...new Set([...usedIn(keep), ...movedUses])].join(", ") },
              }, { event: `Uses merged from ${drop.length} duplicate ${drop.length === 1 ? "record" : "records"}` });
              if (!saved9) return;
              context.toast("Duplicates resolved", `${drop.length} archived, ${movedUses.length} ${movedUses.length === 1 ? "use" : "uses"} moved to ${keep.title}.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Keep one, archive {drop.length}
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function ExpiryWarning({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useAssets();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { ids?: string[] } | undefined;
  const rows = data.assets.filter((row) => (payload?.ids ?? (context.selectedId ? [context.selectedId] : [])).includes(row.id));
  const [until, setUntil] = useState("");
  const [basis, setBasis] = useState("");
  const [busy, setBusy] = useState(false);
  if (rows.length === 0) return <Empty title="Nothing selected" icon={<ShieldAlert size={20} />}>Select one or more assets.</Empty>;

  const held = rows.filter((row) => row.fields.retentionBasis);

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {rows.map((row) => {
          const state = licence(row, now);
          return (
            <Row key={row.id} gap={2}>
              <span className="ds-grow ds-truncate">{row.title}</span>
              <Pill tone={licenceTone(state.state)}>{state.label}</Pill>
              <Pill>{usedIn(row).length} uses</Pill>
            </Row>
          );
        })}
      </Stack>
      {held.length > 0 && (
        <Notice tone="warning" title={`${held.length} ${held.length === 1 ? "asset is" : "assets are"} already under a retention rule`}>
          {held.map((row) => `${row.title}: ${String(row.fields.retentionBasis)}`).join("; ")}. Archiving respects these, so an asset a
          contract or a brand rule requires cannot be quietly removed.
        </Notice>
      )}
      <Field label="Keep until" required hint="Archiving before this date is refused.">
        <TextInput type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
      </Field>
      <Field label="Why" required hint="The reason is what makes the rule defensible later.">
        <TextArea rows={3} value={basis} onChange={(event) => setBasis(event.target.value)} placeholder="Referenced by the Kinsale handover pack" />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!until || !basis.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              for (const row of rows) {
                const saved10 = await context.mutate.patch(row.id, {
                  fields: { ...row.fields, retentionUntil: new Date(`${until}T00:00:00.000Z`).toISOString(), retentionBasis: basis, retentionSetBy: context.actor },
                }, { event: `Retention set on ${row.title} until ${until}: ${basis}`, expectRevision: row.revision });
                if (!saved10) return;
              }
              context.toast("Retention set", `${rows.length} ${rows.length === 1 ? "asset" : "assets"} are protected until ${context.date(until)}.`);
              close();
            } finally { setBusy(false); }
          }}
        >
          Set retention
        </Button>}
          end={<Button variant="ghost" onClick={close}>Cancel</Button>}
        />
      </ModalActions>
    </Stack>
  );
}

export function GovernanceExport({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const { now } = useWorkspace();
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Assets", value: String(data.assets.length) },
        { label: "With an expiry", value: String(data.assets.filter((row) => row.fields.licenceExpiry).length) },
        { label: "Expired", value: String(data.assets.filter((row) => licence(row, now).state === "expired").length) },
        { label: "Format", value: "CSV, written in this browser" },
      ]} />
      <Button
        variant="primary"
        onClick={() => {
          const header = "asset,type,format,licence,licensor,expiry,state,uses,stored bytes,file state\n";
          const body = data.assets.map((row) => [
            row.title, String(row.fields.kind ?? ""), String(row.fields.format ?? ""), String(row.fields.licence ?? ""),
            String(row.fields.licensor ?? ""), String(row.fields.licenceExpiry ?? ""), licence(row, now).state,
            usedIn(row).join(" | "), storedBytes(row) ?? "", fileState(row),
          ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([header + body], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${context.org.slug}-asset-governance.csv`;
          link.click();
          URL.revokeObjectURL(url);
          void context.mutate.log(`Asset governance report exported (${data.assets.length} assets).`, { type: "asset.governance_export", capability: "ready_local" });
          context.toast("Exported", "The governance report downloaded from this browser.");
        }}
      >
        Download the governance report
      </Button>
      <Notice tone="info" title="Stored bytes are blank where nothing is stored">
        The report distinguishes a file held here from a drawn preview and from a metadata-only record, rather than inventing a size.
      </Notice>
    </Stack>
  );
}

/* ---------------------- ASSET-004 compare sources ---------------------- */

/** Compares a preset's output against each source it would read, flagging upscaling and crops. */
export function CompareSources({ context }: { context: ScreenContext }) {
  const data = useAssets();
  const presets = data.transforms.filter((row) => row.fields.kind !== "job");
  const [presetIdPicked, setPresetId] = useState<string>();
  const presetId = presetIdPicked ?? (presets.find((row) => row.id === context.selectedId)?.id ?? presets[0]?.id ?? "");
  const preset = presets.find((row) => row.id === presetId);
  const jobs = data.transforms.filter((row) => row.fields.kind === "job" && row.fields.presetId === presetId);
  const sourceIds = new Set(jobs.flatMap((job) => csvList(job.fields.assetIds)));
  const sources = data.assets.filter((row) => sourceIds.has(row.id) || (sourceIds.size === 0 && row.status === "approved")).slice(0, 12);
  if (!preset) return <Empty title="No preset to compare" icon={<Wand2 size={20} />}>Create a preset first.</Empty>;
  const outW = Number(preset.fields.width ?? 0);
  const outH = Number(preset.fields.height ?? 0);
  return (
    <Stack gap={4}>
      <Field label="Preset">
        <Select aria-label="Preset" value={presetId} onChange={(event) => setPresetId(event.target.value)}>
          {presets.map((row) => <option key={row.id} value={row.id}>{row.title} · {String(row.fields.width)}×{String(row.fields.height)} {String(row.fields.format ?? "").toUpperCase()}</option>)}
        </Select>
      </Field>
      <p className="ds-subtle">{sourceIds.size ? `Sources from ${jobs.length} job${jobs.length === 1 ? "" : "s"} run with this preset.` : "No job has used this preset, so approved assets are compared."}</p>
      <DataGrid
        rows={sources}
        rowId={(row) => row.id}
        label="Sources against the preset"
        filterable={false}
        empty={<Empty title="No source to compare" />}
        rowTone={(row) => (Number(row.fields.width ?? 0) < outW || Number(row.fields.height ?? 0) < outH ? "warning" : undefined)}
        columns={[
          { key: "asset", header: "Source", primary: true, cell: (row) => row.title },
          { key: "dims", header: "Source size", cell: (row) => (row.fields.width ? `${String(row.fields.width)} × ${String(row.fields.height)}` : "Not recorded") },
          { key: "out", header: "Output", cell: () => `${outW} × ${outH}` },
          { key: "fit", header: "Fit", cell: (row) => {
            const w = Number(row.fields.width ?? 0); const h = Number(row.fields.height ?? 0);
            if (!w || !h) return <Pill tone="warning">Unknown</Pill>;
            if (w < outW || h < outH) return <Pill tone="warning">Upscaled</Pill>;
            return Math.abs(w / h - outW / Math.max(1, outH)) > 0.02 ? <Pill tone="info">Cropped</Pill> : <Pill tone="success">Scales cleanly</Pill>;
          } },
          { key: "licence", header: "Licence", cell: (row) => <Pill tone={licenceTone(licence(row, context.now).state)}>{licence(row, context.now).state}</Pill> },
        ]}
      />
    </Stack>
  );
}
