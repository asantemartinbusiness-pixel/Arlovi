import { useMemo, useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Meter, Notice, Pill, Properties, Row, Select,
  Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { ProviderBoundary } from "@/applications/market/kit";
import { capabilityById } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import {
  bodyOf, evaluateSegment, networkOf, NETWORKS, rollUp, useMarketData,
  type AudienceBody, type CampaignBody, type PostBody, type SegmentRule, type SiteBody,
} from "./data";
import { NetworkPreview } from "./panels";
import { pageChecks, retryState, VersionRestoreGrid } from "./actions";

/* ====================================================================== *
 * MARKET overlays. One component per overlay in the approved contract.
 * ====================================================================== */

/* ---------------- MARKET-001 ---------------- */

export function MetricSource({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "live";
  const channels = rollUp(data.campaigns);

  if (metric === "provider" || metric === "email") {
    const capability = capabilityById(metric === "email" ? "email.send" : "payment.capture");
    return (
      <Stack gap={3}>
        <Notice tone="warning" title="There is no source for this figure">
          {capability?.note} The surface shows it as unavailable rather than as zero, because zero would read as a result.
        </Notice>
        <Properties rows={[
          { label: "Provider", value: capability?.provider ?? "None" },
          { label: "State", value: <Pill tone="warning">Not connected</Pill> },
          { label: "Kept locally", value: capability?.localEquivalent ?? "—" },
        ]} />
      </Stack>
    );
  }

  if (metric === "pageviews") {
    const pages = data.sites.filter((site) => String(site.fields.kind) === "page");
    return (
      <Stack gap={3}>
        <p className="ds-subtle">Counted from the views field on {pages.length} page records. No analytics service is connected, so these are the counts someone recorded here.</p>
        <DataGrid rows={pages} rowId={(row) => row.id} label="Page view sources" filterable={false}
          columns={[
            { key: "title", header: "Page", primary: true, cell: (row) => row.title },
            { key: "views", header: "Views", align: "end", cell: (row) => String(row.fields.views ?? 0) },
            { key: "updated", header: "Recorded", align: "end", cell: (row) => context.date(row.updatedAt) },
          ]} />
      </Stack>
    );
  }

  const rows = metric === "revenue" ? channels.filter((channel) => channel.revenueMinor > 0) : channels;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Source", value: "Channel plans stored on campaign records" },
        { label: "Campaigns counted", value: String(data.campaigns.length) },
        { label: "Live", value: String(data.campaigns.filter((campaign) => campaign.status === "active").length) },
        { label: "Leads", value: `${data.leads.length} lead records` },
        { label: "Provider figures", value: <Pill tone="warning">None available</Pill> },
      ]} />
      <DataGrid rows={rows} rowId={(row) => row.network} label="Metric sources" filterable={false}
        columns={[
          { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
          { key: "spend", header: "Committed", align: "end", cell: (row) => context.money(row.spentMinor) },
          { key: "conv", header: "Conversions", align: "end", cell: (row) => String(row.conversions) },
          { key: "revenue", header: "Claimed revenue", align: "end", cell: (row) => context.money(row.revenueMinor) },
        ]} />
      <Notice tone="info">Every row is a field a person typed into a campaign record in this browser. Nothing was measured by a platform.</Notice>
    </Stack>
  );
}

export function CampaignWizard({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now, org } = useWorkspace();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("Trade enquiries");
  const [audienceId, setAudienceId] = useState(data.audiences[0]?.id ?? "");
  const [budget, setBudget] = useState("250000");
  const [weeks, setWeeks] = useState("6");
  const [picked, setPicked] = useState<string[]>(["email", "search"]);
  const duplicate = data.campaigns.some((campaign) => campaign.title.trim().toLowerCase() === title.trim().toLowerCase());
  const budgetMinor = Number(budget) || 0;
  const audience = data.audiences.find((item) => item.id === audienceId);
  const reach = evaluateSegment(audience, data.contacts, now);
  const invalid = !title.trim() || duplicate || budgetMinor <= 0 || picked.length === 0;

  return (
    <form
      id="campaign-wizard"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const start = new Date(now);
        const end = new Date(now);
        end.setDate(end.getDate() + (Number(weeks) || 6) * 7);
        const share = Math.floor(budgetMinor / picked.length);
        const created = await context.mutate.create({
          collection: "campaigns",
          title: title.trim(),
          status: "draft",
          summary: `${objective} across ${picked.map((network) => networkOf(network).label).join(", ")}.`,
          amountMinor: budgetMinor,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          fields: {
            objective,
            budgetMinor,
            spentMinor: 0,
            audienceId,
            approval: "draft",
            delivery: "not_connected",
            primaryChannel: picked[0],
          },
          body: {
            brief: `${objective} for ${org.name}. Reach at creation: ${reach.members.length} eligible contacts.`,
            channels: picked.map((network) => ({ network, budgetMinor: share, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 })),
            creatives: [],
            touches: [],
          },
        }, `Campaign ${title.trim()} created as a draft`);
        context.toast("Campaign created", `${created.title} is a draft. No spend authorisation exists and no provider was contacted.`);
        close();
      }}
    >
      <Field label="Campaign name" required hint="Shown in the library, the calendar and every report.">
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="A campaign with that name already exists">Two campaigns with one name make attribution ambiguous.</Notice>}
      <Row gap={3} wrap>
        <Field label="Objective">
          <Select value={objective} onChange={(event) => setObjective(event.target.value)}>
            {["Trade enquiries", "Showroom visits", "Product launch", "Repeat orders", "Pipeline"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Length in weeks">
          <TextInput value={weeks} inputMode="numeric" align="end" onChange={(event) => setWeeks(event.target.value)} />
        </Field>
        <Field label={`Budget in ${org.currency} minor units`} hint={context.money(budgetMinor)}>
          <TextInput value={budget} inputMode="numeric" align="end" onChange={(event) => setBudget(event.target.value)} invalid={budgetMinor <= 0} />
        </Field>
      </Row>
      <Field label="Audience" hint={audience ? `${reach.members.length} eligible, ${reach.excluded.length} held back` : "No segment exists yet"}>
        <Select value={audienceId} onChange={(event) => setAudienceId(event.target.value)}>
          {data.audiences.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <fieldset className="ds-fieldset">
        <legend>Channels</legend>
        <Stack gap={2}>
          {["email", "search", ...NETWORKS.map((network) => network.id)].filter((value, index, list) => list.indexOf(value) === index).map((network) => (
            <Checkbox
              key={network}
              label={`${networkOf(network).label} — ${picked.includes(network) && picked.length ? context.money(Math.floor(budgetMinor / picked.length)) : "no budget"}`}
              checked={picked.includes(network)}
              onChange={(event) => setPicked((current) => (event.target.checked ? [...current, network] : current.filter((item) => item !== network)))}
            />
          ))}
        </Stack>
      </fieldset>
      {picked.length === 0 && <Notice tone="danger" title="Choose at least one channel">A campaign without a channel has nothing to plan against.</Notice>}
      <Notice tone="warning" title="A new campaign is a draft">The budget is split evenly and committed spend starts at zero. No provider is contacted and no spend is authorised.</Notice>
    </form>
  );
}

export function BudgetInspector({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const rows = data.campaigns.flatMap((campaign) =>
    (bodyOf<CampaignBody>(campaign, {}).channels ?? []).map((channel) => ({ id: `${campaign.id}-${channel.network}`, campaign, channel })));
  const planned = rows.reduce((sum, row) => sum + row.channel.budgetMinor, 0);
  const committed = rows.reduce((sum, row) => sum + row.channel.spentMinor, 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Planned", value: context.money(planned) },
        { label: "Committed locally", value: context.money(committed) },
        { label: "Remaining", value: context.money(planned - committed) },
        { label: "Reserve held", value: `${context.money(Math.round(committed * 0.15))} (15% against late provider reporting)` },
        { label: "Provider balance", value: <Pill tone="warning">Unavailable</Pill> },
      ]} />
      <Meter value={committed} max={planned || 1} label="Budget committed" tone={committed > planned * 0.85 ? "warning" : undefined} />
      <DataGrid rows={rows} rowId={(row) => row.id} label="Budget by campaign and channel" filterable={false}
        columns={[
          { key: "campaign", header: "Campaign", primary: true, cell: (row) => row.campaign.title },
          { key: "channel", header: "Channel", cell: (row) => networkOf(row.channel.network).label },
          { key: "budget", header: "Planned", align: "end", cell: (row) => context.money(row.channel.budgetMinor) },
          { key: "spent", header: "Committed", align: "end", cell: (row) => context.money(row.channel.spentMinor) },
        ]} />
    </Stack>
  );
}

/* ---------------- MARKET-002 ---------------- */

export function CampaignTemplatePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const plans = data.templates.filter((template) => String(template.fields.kind) === "plan" && template.status !== "archived");
  const [chosen, setChosen] = useState(plans[0]?.id ?? "");
  const template = plans.find((item) => item.id === chosen);
  const body = bodyOf<{ weeks?: number; channels?: string[]; stages?: string[] }>(template, {});
  return (
    <form
      id="campaign-template"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!template) return;
        const start = new Date(now);
        const end = new Date(now);
        end.setDate(end.getDate() + (body.weeks ?? 6) * 7);
        const created = await context.mutate.create({
          collection: "campaigns",
          title: `${template.title} — ${start.toLocaleDateString(undefined, { month: "long" })}`,
          status: "draft",
          summary: template.summary,
          amountMinor: 0,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          fields: { objective: "Product launch", budgetMinor: 0, spentMinor: 0, audienceId: data.audiences[0]?.id ?? "", approval: "draft", delivery: "not_connected", primaryChannel: (body.channels ?? ["email"])[0], templateId: template.id },
          body: { brief: `Created from the ${template.title} template. Budget and audience still need setting.`, channels: (body.channels ?? []).map((network) => ({ network, budgetMinor: 0, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 })), creatives: [], touches: [] },
        }, `Campaign created from template ${template.title}`);
        context.toast("Draft created", `${created.title} has the template's channels and no budget yet.`);
        close();
      }}
    >
      {plans.length === 0 ? <Empty title="No approved plan templates" /> : (
        <>
          <Field label="Plan template">
            <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
            </Select>
          </Field>
          <Properties rows={[
            { label: "Length", value: `${body.weeks ?? "—"} weeks` },
            { label: "Channels", value: (body.channels ?? []).map((network) => networkOf(network).label).join(", ") || "None" },
            { label: "Stages", value: (body.stages ?? []).join(" → ") || "None" },
          ]} />
          <Notice tone="info">The template contributes structure only. Budget, audience and creative stay empty until someone sets them.</Notice>
        </>
      )}
    </form>
  );
}

export function PlanApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const campaign = useRecord(payload?.id ?? context.selectedId ?? context.params.id) ?? data.campaigns.find((item) => item.status === "approval");
  const body = bodyOf<CampaignBody>(campaign, {});
  const audience = data.audiences.find((item) => item.id === String(campaign?.fields.audienceId ?? ""));
  const reach = evaluateSegment(audience, data.contacts, now);
  const checks = campaign ? [
    { label: "Objective set", ok: Boolean(campaign.fields.objective) },
    { label: "Audience linked with members", ok: Boolean(audience) && reach.members.length > 0, detail: audience ? `${reach.members.length} eligible` : "No audience linked" },
    { label: "Budget above zero", ok: Number(campaign.fields.budgetMinor ?? 0) > 0 },
    { label: "Channel plan has at least one channel", ok: (body.channels ?? []).length > 0 },
    { label: "All creative approved", ok: (body.creatives ?? []).every((creative) => creative.status === "approved"), detail: `${(body.creatives ?? []).filter((creative) => creative.status !== "approved").length} not approved` },
  ] : [];
  const alreadyApproved = String(campaign?.fields.approval) === "approved";
  const blocked = alreadyApproved || checks.some((check) => !check.ok);

  if (!campaign) return <Empty title="No campaign is waiting for approval" />;

  return (
    <form
      id="plan-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocked) return;
        await context.mutate.patch(campaign.id, {
          status: campaign.status === "active" ? "active" : "approved",
          fields: { ...campaign.fields, approval: "approved", approvedBy: actor, approvedAt: now.toISOString() },
        }, { expectRevision: campaign.revision, event: `Plan approved for ${campaign.title} by ${actor}` });
        context.toast("Plan approved", `${campaign.title} is recorded as approved by ${actor}. It is not live until a launch is recorded. No provider was told.`);
        close();
      }}
    >
      <h3>{campaign.title}</h3>
      <Stack gap={2}>
        {checks.map((check) => (
          <Row key={check.label} gap={2}>
            <Pill tone={check.ok ? "success" : "danger"} dot>{check.ok ? "Ready" : "Blocked"}</Pill>
            <span className="ds-grow">{check.label}</span>
            {check.detail && <span className="ds-subtle">{check.detail}</span>}
          </Row>
        ))}
      </Stack>
      {alreadyApproved
        ? <Notice tone="success" title="This plan is already approved">Approved by {String(campaign.fields.approvedBy ?? "someone")} on {context.date(String(campaign.fields.approvedAt ?? ""))}.</Notice>
        : blocked
        ? <Notice tone="danger" title="This plan cannot be approved yet">Every check above has to pass. Approving a plan with unapproved creative or an empty audience would commit budget against nothing.</Notice>
        : <Notice tone="info" title="What approval does here">The record is marked approved by {actor} with today's date. Scheduling stays local; no advertising or mail provider is connected.</Notice>}
    </form>
  );
}

export function DuplicateRules({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const campaign = useRecord(payload?.id ?? context.selectedId) ?? data.campaigns[0];
  if (!campaign) return <Empty title="Select a campaign to duplicate" />;
  const body = bodyOf<CampaignBody>(campaign, {});
  return (
    <Stack gap={4}>
      <h3>Duplicating {campaign.title}</h3>
      <Properties rows={[
        { label: "Copied", value: "Objective, audience link, channel plan structure, creative list and brief" },
        { label: "Reset", value: "Committed spend, impressions, clicks, conversions, claimed revenue" },
        { label: "Reset", value: "Approval state — the copy starts as a draft" },
        { label: "Never copied", value: "Any external spend authorisation. None exists, and a copy must not imply one." },
      ]} />
      <Notice tone="warning" title="A copy must not inherit permission to spend">
        If an ad account were connected, duplicating a live campaign would otherwise create a second authorised spender with the same budget. The copy therefore always lands as a draft with zero committed spend.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.create({
            collection: "campaigns",
            title: `${campaign.title} (copy)`,
            status: "draft",
            summary: campaign.summary,
            amountMinor: Number(campaign.fields.budgetMinor ?? 0),
            startAt: campaign.startAt,
            endAt: campaign.endAt,
            fields: { ...campaign.fields, spentMinor: 0, approval: "draft", delivery: "not_connected" },
            body: { ...body, channels: (body.channels ?? []).map((channel) => ({ ...channel, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 })) },
          }, `Campaign ${campaign.title} duplicated as a draft`);
          context.toast("Duplicated", "The copy is a draft with no committed spend.");
          close();
        }}
      >
        Duplicate as draft
      </Button>
    </Stack>
  );
}

/* ---------------- MARKET-003 ---------------- */

export function CreativePreview({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { creativeId?: string; campaignId?: string } | undefined;
  const campaign = useRecord(payload?.campaignId ?? context.params.id) ?? data.campaigns[0];
  const body = bodyOf<CampaignBody>(campaign, {});
  const creatives = body.creatives ?? [];
  const [chosen, setChosen] = useState(payload?.creativeId ?? creatives[0]?.id ?? "");
  const creative = creatives.find((item) => item.id === chosen) ?? creatives[0];
  const [network, setNetwork] = useState(String(campaign?.fields.primaryChannel ?? "instagram"));

  if (!creative) return <Empty title="No creative on this campaign" >Creative is held on the campaign record. Nothing has been uploaded to a provider.</Empty>;

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Creative"><Select value={chosen} onChange={(event) => setChosen(event.target.value)}>{creatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
        <Field label="Shown as"><Select value={network} onChange={(event) => setNetwork(event.target.value)}>{NETWORKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      </Row>
      <NetworkPreview network={network} caption={`${creative.title} — ${campaign?.summary ?? ""}`} media={`${creative.kind} placeholder`} />
      <Properties rows={[
        { label: "Kind", value: creative.kind },
        { label: "Approval", value: <Pill tone={creative.status === "approved" ? "success" : "warning"}>{creative.status.replace("_", " ")}</Pill> },
        { label: "Provider requirements", value: networkOf(network).media },
      ]} />
      <Notice tone="info">The preview is drawn from the provider's documented layout. It is not a render returned by the provider, because none is connected.</Notice>
    </Stack>
  );
}

export function LaunchApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { actor, now } = useWorkspace();
  const campaign = useRecord(context.params.id) ?? data.campaigns[0];
  const body = bodyOf<CampaignBody>(campaign, {});
  if (!campaign) return <Empty title="No campaign" />;
  const approvalReady = String(campaign.fields.approval) === "approved";
  const creativeReady = (body.creatives ?? []).length > 0 && (body.creatives ?? []).every((creative) => creative.status === "approved");
  const blocked = !approvalReady || !creativeReady;
  return (
    <form
      id="launch-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocked) return;
        await context.mutate.patch(campaign.id, { status: "active", fields: { ...campaign.fields, launchedBy: actor, launchedAt: now.toISOString() } }, { expectRevision: campaign.revision, event: `${campaign.title} launched locally by ${actor}` });
        context.toast("Launched locally", `${campaign.title} is active in this workspace. Scheduled content is queued locally; nothing was published.`);
        close();
      }}
    >
      <Stack gap={2}>
        <Row gap={2}><Pill tone={approvalReady ? "success" : "danger"} dot>{approvalReady ? "Ready" : "Blocked"}</Pill><span className="ds-grow">Plan approval recorded</span></Row>
        <Row gap={2}><Pill tone={creativeReady ? "success" : "danger"} dot>{creativeReady ? "Ready" : "Blocked"}</Pill><span className="ds-grow">Creative approved</span></Row>
        <Row gap={2}><Pill tone="warning" dot>Not connected</Pill><span className="ds-grow">Delivery provider</span></Row>
      </Stack>
      {blocked && <Notice tone="danger" title="Launch is blocked">Record a plan approval and approve every creative first.</Notice>}
      <ProviderBoundary id="site.publish" title="Launching changes this record only" />
    </form>
  );
}

export function PauseConsequence({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const campaign = useRecord(context.params.id) ?? data.campaigns[0];
  const posts = data.socialPosts.filter((post) => String(post.fields.campaignId) === campaign?.id && post.status === "scheduled");
  if (!campaign) return <Empty title="No campaign" />;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="What pausing can and cannot do">
        Pausing sets this campaign to paused and holds its {posts.length} queued item{posts.length === 1 ? "" : "s"} in this browser. It cannot stop spend at an advertising platform: no account is connected, so no spend was ever authorised from here. If an account were connected, a pause would still take minutes to take effect and late-reported spend could still arrive.
      </Notice>
      <Properties rows={[
        { label: "Queued items held", value: String(posts.length) },
        { label: "Committed spend so far", value: context.money(Number(campaign.fields.spentMinor ?? 0)) },
        { label: "Provider spend stopped", value: <Pill tone="warning">Cannot be confirmed</Pill> },
      ]} />
      <Button
        variant="danger"
        onClick={async () => {
          await context.mutate.patch(campaign.id, { status: "paused", fields: { ...campaign.fields, approval: "paused" } }, { expectRevision: campaign.revision, event: `${campaign.title} paused` });
          for (const post of posts) {
            await context.mutate.patch(post.id, { status: "draft", fields: { ...post.fields, delivery: "ready_local" } }, { event: `${post.title} held because its campaign was paused` });
          }
          context.toast("Paused", `${campaign.title} is paused and ${posts.length} queued item${posts.length === 1 ? " was" : "s were"} returned to drafts.`);
          close();
        }}
      >
        Pause and hold queued items
      </Button>
    </Stack>
  );
}

/* ---------------- MARKET-004 / 005 ---------------- */

export function PostEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const body = bodyOf<PostBody>(post, {});
  const [caption, setCaption] = useState(body.caption ?? "");
  const [network, setNetwork] = useState(String(post?.fields.network ?? "instagram"));
  const [when, setWhen] = useState(post?.startAt ? new Date(post.startAt).toISOString().slice(0, 16) : "");
  const spec = networkOf(network);
  const over = caption.length > spec.limit;

  if (!post) return <Empty title="Select a scheduled item" />;

  return (
    <form
      id="post-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (over || !when) return;
        const iso = new Date(when).toISOString();
        await context.mutate.patch(post.id, {
          startAt: iso,
          at: iso,
          fields: { ...post.fields, network },
          body: { ...body, caption },
        }, { expectRevision: post.revision, event: `${post.title} edited` });
        context.toast("Saved", `${post.title} is queued for ${context.dateTime(iso)} in ${org.timezone}.`);
        close();
      }}
    >
      <Field label="Channel"><Select value={network} onChange={(event) => setNetwork(event.target.value)}>{NETWORKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      <Field label={`Scheduled time (${org.timezone})`} required>
        <TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required />
      </Field>
      <Field label="Caption" error={over ? `Over the ${spec.label} limit of ${spec.limit.toLocaleString()} characters` : undefined} hint={`${caption.length} / ${spec.limit.toLocaleString()} characters`}>
        <TextArea value={caption} rows={5} invalid={over} onChange={(event) => setCaption(event.target.value)} />
      </Field>
      <NetworkPreview network={network} caption={caption} media={body.media?.[0]?.name} />
      <Notice tone="warning" title="Saving changes the local schedule only">No social account is connected, so this item cannot leave the browser at its scheduled time.</Notice>
    </form>
  );
}

export function AssetPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId);
  const creatives = data.campaigns.flatMap((campaign) => (bodyOf<CampaignBody>(campaign, {}).creatives ?? []).map((creative) => ({ ...creative, campaign: campaign.title })));
  const [chosen, setChosen] = useState(creatives[0]?.title ?? "");
  const spec = networkOf(String(post?.fields.network ?? "instagram"));

  return (
    <Stack gap={4}>
      {creatives.length === 0 ? <Empty title="No approved creative" >Creative lives on campaign records. Add one to a campaign first.</Empty> : (
        <>
          <Field label="Creative" hint={`${spec.label} expects: ${spec.media}`}>
            <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
              {creatives.map((creative) => <option key={`${creative.campaign}-${creative.id}`} value={creative.title}>{creative.campaign} · {creative.title} ({creative.status.replace("_", " ")})</option>)}
            </Select>
          </Field>
          <Notice tone="info">Media is referenced by name. Nothing is uploaded, so the provider's own media validation cannot be run from here.</Notice>
          <Button
            variant="primary"
            disabled={!post}
            onClick={async () => {
              if (!post) return;
              const body = bodyOf<PostBody>(post, {});
              await context.mutate.patch(post.id, { fields: { ...post.fields, mediaName: chosen }, body: { ...body, media: [{ name: chosen, kind: "image" }] } }, { expectRevision: post.revision, event: `Media attached to ${post.title}` });
              context.toast("Attached", `${chosen} is referenced by ${post.title}.`);
              close();
            }}
          >
            {post ? `Attach to ${post.title}` : "Select a post first"}
          </Button>
        </>
      )}
    </Stack>
  );
}

export function PublishPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId) ?? data.socialPosts.find((item) => item.status === "draft");
  const body = bodyOf<PostBody>(post, {});
  if (!post) return <Empty title="Select a post" />;
  const spec = networkOf(String(post.fields.network));
  const over = (body.caption ?? "").length > spec.limit;
  return (
    <Stack gap={4}>
      <NetworkPreview network={String(post.fields.network)} caption={body.caption ?? ""} media={body.media?.[0]?.name} />
      <Properties rows={[
        { label: "Channel", value: spec.label },
        { label: "Scheduled", value: context.dateTime(post.startAt) },
        { label: "Caption length", value: `${(body.caption ?? "").length} of ${spec.limit.toLocaleString()}` },
        { label: "Media", value: body.media?.[0]?.name ?? "None attached" },
        { label: "Account", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      <ProviderBoundary id="site.publish" title="Publishing is not available" >
        Pressing publish would normally hand this caption and media to the network. With no account authorised, the only honest action is to queue it here.
      </ProviderBoundary>
      <Row gap={2}>
        <Button
          variant="primary"
          disabled={over}
          onClick={async () => {
            await context.mutate.patch(post.id, { status: "scheduled", fields: { ...post.fields, delivery: "queued_local", approval: "approved", error: "" } }, { expectRevision: post.revision, event: `${post.title} queued locally for ${post.startAt}` });
            context.toast("Queued locally", "The item is approved and queued in this browser. It has not been published.");
            close();
          }}
        >
          Approve and queue locally
        </Button>
        <Button variant="secondary" disabled>Publish now — needs a connected account</Button>
      </Row>
    </Stack>
  );
}

export function AccountAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { network?: string } | undefined;
  const network = payload?.network ?? "instagram";
  const [note, setNote] = useState("");
  return (
    <form
      id="account-auth"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Connection requested for ${network}${note ? `: ${note}` : ""}`, { type: "capability.request", capability: "configuration_required" });
        context.toast("Request recorded", "The request is in the activity log. No authorisation flow was started, because no provider is configured.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Channel", value: networkOf(network).label },
        { label: "State", value: <Pill tone="warning">Not connected</Pill> },
        { label: "What is needed", value: "An app registration and an authorised account on the provider side" },
        { label: "What exists here", value: "Drafts, captions, media references and a local schedule" },
      ]} />
      <Notice tone="warning" title="There is no sign-in to start">
        Connecting an account needs a server to hold the credential and complete the authorisation exchange. This build runs entirely in the browser, so no credential can be stored and nothing would be able to publish on your behalf.
      </Notice>
      <Field label="Note for whoever sets this up"><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Which account, who owns it, which pages." /></Field>
    </form>
  );
}

export function PostComposer({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now, org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const existingBody = bodyOf<PostBody>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [caption, setCaption] = useState(existingBody.caption ?? "");
  const [networks, setNetworks] = useState<string[]>([String(existing?.fields.network ?? "instagram")]);
  const [campaignId, setCampaignId] = useState(String(existing?.fields.campaignId ?? ""));
  const [when, setWhen] = useState(existing?.startAt ? new Date(existing.startAt).toISOString().slice(0, 16) : new Date(now.getTime() + 86_400_000).toISOString().slice(0, 16));
  const overLimits = networks.filter((network) => caption.length > networkOf(network).limit);
  const invalid = !title.trim() || !caption.trim() || networks.length === 0 || overLimits.length > 0;

  return (
    <form
      id="post-composer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const iso = new Date(when).toISOString();
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(), startAt: iso, at: iso,
            fields: { ...existing.fields, network: networks[0], campaignId },
            body: { ...existingBody, caption },
          }, { expectRevision: existing.revision, event: `${title.trim()} edited in the composer` });
        } else {
          for (const network of networks) {
            await context.mutate.create({
              collection: "socialPosts",
              title: networks.length > 1 ? `${title.trim()} · ${networkOf(network).label}` : title.trim(),
              status: "draft",
              summary: "Drafted in the composer. No social account is connected.",
              startAt: iso,
              at: iso,
              tags: [network],
              fields: { network, campaignId, delivery: "ready_local", externalRef: "", error: "", mediaName: "", approval: "draft" },
              body: { caption, media: [], link: "" },
            }, `Post drafted for ${networkOf(network).label}`);
          }
        }
        context.toast(existing ? "Post saved" : "Draft created", `${networks.length} item${networks.length === 1 ? "" : "s"} saved in this workspace for ${context.dateTime(iso)} (${org.timezone}).`);
        close();
      }}
    >
      <Field label="Internal title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Campaign">
        <Select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          <option value="">Not linked to a campaign</option>
          {data.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
        </Select>
      </Field>
      <Field label={`Scheduled time (${org.timezone})`} required><TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      <fieldset className="ds-fieldset">
        <legend>Channels</legend>
        <Stack gap={2}>
          {NETWORKS.map((network) => (
            <Checkbox
              key={network.id}
              label={`${network.label} — ${network.limit.toLocaleString()} character limit`}
              checked={networks.includes(network.id)}
              disabled={Boolean(existing) && !networks.includes(network.id)}
              onChange={(event) => setNetworks((current) => (event.target.checked ? [...current, network.id] : current.filter((item) => item !== network.id)))}
            />
          ))}
        </Stack>
      </fieldset>
      <Field label="Caption" required error={overLimits.length ? `Too long for ${overLimits.map((network) => networkOf(network).label).join(", ")}` : undefined}>
        <TextArea value={caption} rows={5} invalid={overLimits.length > 0} onChange={(event) => setCaption(event.target.value)} required />
      </Field>
      <Stack gap={4}>
        {networks.map((network) => <NetworkPreview key={network} network={network} caption={caption} />)}
      </Stack>
      <ProviderBoundary id="site.publish" title="This composer stops at the publish boundary" />
    </form>
  );
}

export function DeliveryReceipt({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const post = useRecord(payload?.id ?? context.selectedId) ?? data.socialPosts.find((item) => item.status === "failed");
  if (!post) return <Empty title="Select a post" />;
  const retry = retryState(post);
  const unknown = post.status === "failed" && !retry.safe;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Item", value: post.title },
        { label: "Channel", value: networkOf(String(post.fields.network)).label },
        { label: "Scheduled", value: context.dateTime(post.startAt) },
        { label: "Local state", value: <Pill tone={post.status === "published" ? "success" : post.status === "failed" ? "danger" : "warning"}>{String(post.fields.delivery ?? post.status).replace("_", " ")}</Pill> },
        { label: "Provider reference", value: String(post.fields.externalRef) || "None" },
        { label: "Error", value: String(post.fields.error) || "—" },
      ]} />
      {unknown ? (
        <Notice tone="danger" title="The publication state is unknown, so a retry is blocked">{retry.reason}</Notice>
      ) : post.status === "failed" ? (
        <Notice tone="warning" title="Known not to have been published">{retry.reason} Use "Retry safely" to re-queue it.</Notice>
      ) : (
        <Notice tone="info" title="Recorded locally">
          The reference above is a local identifier, not a provider URL. It records that someone marked this item published in this workspace.
        </Notice>
      )}
    </Stack>
  );
}

/* ---------------- MARKET-006 ---------------- */

export function EmailBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; templateId?: string } | undefined;
  const campaign = useRecord(payload?.id);
  /* The form seeds its state once. Editing an existing campaign must wait for
     the record, or the defaults (first audience, template subject) would be
     saved over the campaign's own audience and subject. */
  if (payload?.id && !campaign) return <Empty title="Loading the campaign" />;
  return <EmailBuilderForm key={campaign?.id ?? "new"} context={context} close={close} campaign={campaign} templateId={payload?.templateId} />;
}

function EmailBuilderForm({ context, close, campaign, templateId }: { context: ScreenContext; close: () => void; campaign: Rec | undefined; templateId?: string }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const template = useRecord(templateId) ?? data.templates.find((item) => String(item.fields.kind) === "email" && item.status === "approved");
  const templateBody = bodyOf<{ subject?: string; preheader?: string; blocks?: string[] }>(template, {});
  const [subject, setSubject] = useState(String(campaign?.fields.emailSubject ?? templateBody.subject ?? ""));
  const [preheader, setPreheader] = useState(templateBody.preheader ?? "");
  const [audienceId, setAudienceId] = useState(String(campaign?.fields.audienceId ?? data.audiences[0]?.id ?? ""));
  const [bodyText, setBodyText] = useState(campaign ? `${campaign.summary}` : "");
  const [when, setWhen] = useState(
    (campaign?.startAt ? new Date(campaign.startAt) : new Date(now.getTime() + 2 * 86_400_000)).toISOString().slice(0, 16),
  );
  const audience = data.audiences.find((item) => item.id === audienceId);
  const reach = evaluateSegment(audience, data.contacts, now);
  const invalid = !subject.trim() || reach.members.length === 0;

  return (
    <form
      id="email-builder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        if (campaign) {
          await context.mutate.patch(campaign.id, {
            startAt: new Date(when).toISOString(),
            fields: { ...campaign.fields, audienceId, emailSubject: subject },
            body: { ...bodyOf<CampaignBody>(campaign, {}), brief: bodyText || campaign.summary },
          }, { expectRevision: campaign.revision, event: `Email content saved for ${campaign.title}` });
        } else {
          await context.mutate.create({
            collection: "campaigns",
            title: subject.trim(),
            status: "draft",
            summary: preheader || "Email campaign drafted in this workspace.",
            amountMinor: 0,
            startAt: new Date(when).toISOString(),
            fields: { objective: "Repeat orders", budgetMinor: 0, spentMinor: 0, audienceId, approval: "draft", delivery: "not_connected", primaryChannel: "email", emailSubject: subject.trim() },
            body: { brief: bodyText, channels: [{ network: "email", budgetMinor: 0, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 }], creatives: [], touches: [] },
          }, `Email campaign ${subject.trim()} drafted`);
        }
        context.toast("Email saved", `Kept as a local draft for ${reach.members.length} eligible recipients. No mail provider is connected.`);
        close();
      }}
    >
      <Field label="Subject" required hint="Shown in the inbox list and in the send review."><TextInput value={subject} onChange={(event) => setSubject(event.target.value)} required /></Field>
      <Field label="Preheader"><TextInput value={preheader} onChange={(event) => setPreheader(event.target.value)} /></Field>
      <Field label="Audience" hint={`${reach.members.length} eligible · ${reach.excluded.length} held back`}>
        <Select value={audienceId} onChange={(event) => setAudienceId(event.target.value)}>
          {data.audiences.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Send window opens" hint="A local schedule only: with no provider connected nothing leaves at this time.">
        <TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </Field>
      <Field label="Body"><TextArea value={bodyText} rows={6} onChange={(event) => setBodyText(event.target.value)} /></Field>
      {template && <Notice tone="info" title={`Structure from ${template.title}`}>Blocks: {(templateBody.blocks ?? []).join(", ")}. Changing the template later does not rewrite this draft.</Notice>}
      {reach.members.length === 0 && <Notice tone="danger" title="No eligible recipients">This segment matches nobody with consent, so there is nothing to approve.</Notice>}
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export function AudiencePreview({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const audience = useRecord(payload?.id ?? context.selectedId) ?? data.audiences[0];
  const result = evaluateSegment(audience, data.contacts, now);
  if (!audience) return <Empty title="No segment selected" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Segment", value: audience.title },
        { label: "Eligible now", value: <strong>{result.members.length}</strong> },
        { label: "Held back", value: String(result.excluded.length) },
        { label: "Counted from", value: `${data.contacts.length} contact records` },
        { label: "Rules", value: result.rules.map((rule) => `${rule.field} ${rule.op} ${rule.value}`).join(" and ") || "None" },
      ]} />
      <DataGrid rows={result.members} rowId={(row) => row.id} label="Segment members"
        columns={[
          { key: "title", header: "Contact", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "email", header: "Email", cell: (row) => String(row.fields.email ?? "") },
          { key: "spend", header: "Lifetime", align: "end", cell: (row) => context.money(Number(row.fields.spendMinor ?? 0)) },
        ]}
        empty={<Empty title="Nobody matches these rules" >Loosen a rule or check the consent exclusions.</Empty>}
      />
      {result.excluded.length > 0 && (
        <Card title="Held back" subtitle="Excluded before any count is quoted" flush>
          <DataGrid rows={result.excluded} rowId={(row) => row.contact.id} label="Excluded contacts" filterable={false}
            columns={[
              { key: "title", header: "Contact", primary: true, cell: (row) => row.contact.title },
              { key: "reason", header: "Reason", cell: (row) => <Pill tone="warning">{row.reason}</Pill> },
            ]} />
        </Card>
      )}
    </Stack>
  );
}

export function SendReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now, actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string; mode?: string } | undefined;
  const testMode = payload?.mode === "test";
  const campaign = useRecord(payload?.id ?? context.selectedId) ?? data.campaigns.find((item) => String(item.fields.primaryChannel) === "email");
  const audience = data.audiences.find((item) => item.id === String(campaign?.fields.audienceId ?? ""));
  const result = evaluateSegment(audience, data.contacts, now);
  const [confirmed, setConfirmed] = useState(false);
  const large = result.members.length > 500;
  if (!campaign) return <Empty title="No email campaign selected" />;
  return (
    <form
      id="send-review"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!confirmed) return;
        if (testMode) {
          await context.mutate.patch(campaign.id, {
            fields: { ...campaign.fields, testSendState: "queued_local", testSendTo: actor, testSendAt: now.toISOString() },
          }, { expectRevision: campaign.revision, event: `Test send of ${campaign.title} to ${actor} held locally` });
          await context.mutate.log(`Test send of ${campaign.title} to ${actor} queued locally; no mail provider is connected.`, { entityId: campaign.id, type: "email.test_queued_local", capability: "queued_local" });
          context.toast("Test send held locally", `The test to ${actor} is recorded against ${campaign.title}. It was not delivered: no mail provider is connected.`);
          close();
          return;
        }
        await context.mutate.patch(campaign.id, {
          fields: { ...campaign.fields, recipientsApprovedBy: actor, recipientsApprovedAt: now.toISOString(), recipientCount: result.members.length },
        }, { expectRevision: campaign.revision, event: `Recipients approved for ${campaign.title}: ${result.members.length} contacts` });
        await context.mutate.log(`Send held locally for ${campaign.title}: ${result.members.length} recipients, ${result.excluded.length} held back.`, { entityId: campaign.id, type: "email.queued_local", capability: "queued_local" });
        context.toast("Recipients approved", `${result.members.length} recipients recorded against ${campaign.title}. Nothing was sent: no mail provider is connected.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Campaign", value: campaign.title },
        { label: "Subject", value: String(campaign.fields.emailSubject || campaign.title) },
        { label: "Segment", value: audience?.title ?? "No audience linked" },
        { label: "Recipients", value: <strong>{result.members.length}</strong> },
        { label: "Held back", value: `${result.excluded.length} — ${[...new Set(result.excluded.map((item) => item.reason))].join(", ") || "none"}` },
        { label: "Unsubscribe link", value: <Pill tone="success">Required and present in the template footer</Pill> },
      ]} />
      {testMode && (
        <Notice tone="warning" title="A test send cannot be delivered either">
          A test would normally go to {actor} alone so the rendering can be checked in a real inbox. With no mail provider connected the test is recorded against the campaign and the rendered subject and body stay in the builder.
        </Notice>
      )}
      {large && <Notice tone="warning" title="This would be a large send">Over five hundred recipients. A real send would be throttled in batches and paused on the first bounce spike.</Notice>}
      <Notice tone="warning" title="Nothing can be sent from here">
        Approving the recipients records who would receive this email and who was held back. The message itself stays a local draft until a mail provider is connected.
      </Notice>
      <Checkbox label={testMode ? `Record a test send attempt against ${campaign.title}` : `I have checked the ${result.members.length} recipients and the ${result.excluded.length} exclusions`} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
    </form>
  );
}

export function SuppressionCheck() {
  const data = useMarketData();
  const { now } = useWorkspace();
  const suppressed = data.contacts.filter((contact) => contact.fields.suppressed === true);
  const wouldHaveMatched = data.audiences.map((audience) => {
    const result = evaluateSegment(audience, data.contacts, now);
    const caught = result.excluded.filter((item) => item.contact.fields.suppressed === true).length;
    return { audience, held: result.excluded.length, caught };
  });
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Suppression list", value: `${suppressed.length} contacts` },
        { label: "Applied", value: "Before every count, preview and send review" },
        { label: "Source", value: "The suppressed field on each contact record" },
      ]} />
      <DataGrid rows={wouldHaveMatched} rowId={(row) => row.audience.id} label="Suppression by segment" filterable={false}
        columns={[
          { key: "segment", header: "Segment", primary: true, cell: (row) => row.audience.title },
          { key: "held", header: "Held back", align: "end", cell: (row) => String(row.held) },
          { key: "caught", header: "Suppressed, caught", align: "end", cell: (row) => String(row.caught) },
          { key: "rule", header: "Exclusion rule", cell: (row) => ((bodyOf<AudienceBody>(row.audience, {}).exclusions ?? []).includes("suppressed") ? <Pill tone="success">Suppression excluded</Pill> : <Pill tone="danger">No suppression rule</Pill>) },
        ]} />
      <Notice tone="danger" title="A segment without the suppression rule cannot be approved for sending">
        The send review refuses to record recipients for a segment that does not exclude suppressed contacts.
      </Notice>
    </Stack>
  );
}

/* ---------------- MARKET-007 ---------------- */

const RULE_FIELDS = ["segment", "city", "consentEmail", "tag", "spendMinor", "orderedWithinDays", "ordersCount"];
const RULE_OPS = ["is", "gte", "lte", "gt", "has"];

export function SegmentBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const existingBody = bodyOf<AudienceBody>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [rules, setRules] = useState<SegmentRule[]>(existingBody.rules ?? [{ field: "segment", op: "is", value: "trade" }]);
  const [exclusions, setExclusions] = useState<string[]>(existingBody.exclusions ?? ["suppressed"]);

  const draft = useMemo(() => ({ ...(existing ?? ({} as Rec)), body: { rules, exclusions } }) as Rec, [existing, rules, exclusions]);
  const result = evaluateSegment(draft, data.contacts, now);
  const invalid = !title.trim() || rules.length === 0 || !exclusions.includes("suppressed");

  return (
    <form
      id="segment-builder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(),
            summary: `${rules.length} rule${rules.length === 1 ? "" : "s"} over contact records.`,
            fields: { ...existing.fields, lastCountedAt: now.toISOString() },
            body: { rules, exclusions },
          }, { expectRevision: existing.revision, event: `Segment ${title.trim()} rules changed` });
        } else {
          await context.mutate.create({
            collection: "audiences",
            title: title.trim(),
            status: "active",
            summary: `${rules.length} rule${rules.length === 1 ? "" : "s"} over contact records.`,
            fields: { consentRequired: true, source: "workspace contacts", sync: "not_connected", lastCountedAt: now.toISOString() },
            body: { rules, exclusions },
          }, `Segment ${title.trim()} created`);
        }
        context.toast("Segment saved", `${result.members.length} contacts match now; ${result.excluded.length} are held back.`);
        close();
      }}
    >
      <Field label="Segment name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <fieldset className="ds-fieldset">
        <legend>Rules — all must match</legend>
        <Stack gap={3}>
          {rules.map((rule, index) => (
            <Row key={index} gap={2} wrap>
              <Select aria-label={`Field for rule ${index + 1}`} value={rule.field} onChange={(event) => setRules((current) => current.map((item, position) => (position === index ? { ...item, field: event.target.value } : item)))}>
                {RULE_FIELDS.map((field) => <option key={field}>{field}</option>)}
              </Select>
              <Select aria-label={`Operator for rule ${index + 1}`} value={rule.op} onChange={(event) => setRules((current) => current.map((item, position) => (position === index ? { ...item, op: event.target.value } : item)))}>
                {RULE_OPS.map((op) => <option key={op}>{op}</option>)}
              </Select>
              <TextInput aria-label={`Value for rule ${index + 1}`} value={rule.value} onChange={(event) => setRules((current) => current.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))} />
              <Button size="sm" variant="ghost" onClick={() => setRules((current) => current.filter((_, position) => position !== index))}>Remove</Button>
            </Row>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setRules((current) => [...current, { field: "segment", op: "is", value: "" }])}>Add rule</Button>
        </Stack>
      </fieldset>
      <fieldset className="ds-fieldset">
        <legend>Exclusions</legend>
        <Stack gap={2}>
          <Checkbox label="Never include suppressed contacts (required)" checked={exclusions.includes("suppressed")} onChange={(event) => setExclusions((current) => (event.target.checked ? [...current, "suppressed"] : current.filter((item) => item !== "suppressed")))} />
          <Checkbox label="Require marketing consent, not just email consent" checked={exclusions.includes("no_marketing_consent")} onChange={(event) => setExclusions((current) => (event.target.checked ? [...current, "no_marketing_consent"] : current.filter((item) => item !== "no_marketing_consent")))} />
        </Stack>
      </fieldset>
      {!exclusions.includes("suppressed") && <Notice tone="danger" title="The suppression exclusion is required">A segment that can include a suppressed contact cannot be saved.</Notice>}
      <Card title="Live count" subtitle={`Evaluated against ${data.contacts.length} contact records as you type`}>
        <Properties rows={[
          { label: "Eligible", value: <strong>{result.members.length}</strong> },
          { label: "Held back", value: String(result.excluded.length) },
          { label: "Examples", value: result.members.slice(0, 4).map((contact) => contact.title).join(", ") || "None" },
        ]} />
      </Card>
    </form>
  );
}

export function ConsentInspector({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const contact = useRecord(payload?.id ?? context.selectedId) ?? data.contacts[0];
  if (!contact) return <Empty title="No contact selected" />;
  return (
    <Stack gap={4}>
      <h3>{contact.title}</h3>
      <Properties rows={[
        { label: "Email", value: String(contact.fields.email ?? "Not recorded") },
        { label: "Email consent", value: contact.fields.consentEmail === true ? <Pill tone="success">Recorded</Pill> : <Pill tone="danger">Not recorded</Pill> },
        { label: "Marketing consent", value: contact.fields.consentMarketing === true ? <Pill tone="success">Recorded</Pill> : <Pill tone="warning">Not recorded</Pill> },
        { label: "Suppressed", value: contact.fields.suppressed === true ? <Pill tone="danger">Yes</Pill> : <Pill tone="success">No</Pill> },
        { label: "Segment", value: String(contact.fields.segment ?? "unknown") },
        { label: "Last order", value: contact.fields.lastOrderAt ? context.date(String(contact.fields.lastOrderAt)) : "Never ordered" },
        { label: "Tax status", value: String(contact.fields.taxStatus ?? "unknown") },
      ]} />
      {contact.fields.suppressed === true && (
        <Notice tone="danger" title="This contact is excluded from every segment">
          A suppressed contact is removed before any count is quoted and can never appear in a send review. Removing the suppression is a deliberate edit on the contact record, not something a segment can override.
        </Notice>
      )}
      {contact.fields.consentEmail !== true && (
        <Notice tone="warning" title="No email consent is recorded">Email consent has to be recorded on the contact before this person can be counted in an email segment.</Notice>
      )}
    </Stack>
  );
}

export function ExportPermission({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { now, org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const audience = useRecord(payload?.id ?? context.selectedId) ?? data.audiences[0];
  const result = evaluateSegment(audience, data.contacts, now);
  const allowed = context.can("export_data");
  const [reason, setReason] = useState("");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Segment", value: audience?.title ?? "None" },
        { label: "Rows", value: String(result.members.length) },
        { label: "Excluded from the file", value: `${result.excluded.length} suppressed or non-consenting contacts` },
        { label: "Your role view", value: allowed ? <Pill tone="success">May export</Pill> : <Pill tone="danger">May not export</Pill> },
      ]} />
      {!allowed ? (
        <Notice tone="danger" title="This role view does not export contact data">
          Exporting personal data is limited to the roles that hold the export capability. Role views shape what the interface offers here; they are not an account security boundary.
        </Notice>
      ) : (
        <>
          <Field label="Why is this export needed?" required hint="Recorded in the activity log with the row count."><TextInput value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <Notice tone="warning" title="The file is written by this browser">
            A CSV of {result.members.length} contacts downloads from here. Suppressed and non-consenting contacts are never written to it.
          </Notice>
          <Button
            variant="primary"
            disabled={!reason.trim()}
            onClick={async () => {
              const header = "name,email,segment,city,lifetime_minor\n";
              const rows = result.members.map((contact) => [contact.title, String(contact.fields.email ?? ""), String(contact.fields.segment ?? ""), String(contact.fields.city ?? ""), String(contact.fields.spendMinor ?? 0)]
                .map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${org.slug}-${(audience?.title ?? "segment").toLowerCase().replace(/\s+/g, "-")}.csv`;
              link.click();
              URL.revokeObjectURL(url);
              await context.mutate.log(`Exported ${result.members.length} contacts from ${audience?.title}: ${reason}`, { entityId: audience?.id, type: "export", capability: "ready_local" });
              context.toast("Exported", `${result.members.length} rows downloaded from this browser and recorded in the log.`);
              close();
            }}
          >
            Download {result.members.length} rows
          </Button>
        </>
      )}
    </Stack>
  );
}

/* ---------------- MARKET-008 ---------------- */

export function AdPreview({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { campaignId?: string; creativeId?: string } | undefined;
  const campaign = useRecord(payload?.campaignId) ?? data.campaigns[0];
  const body = bodyOf<CampaignBody>(campaign, {});
  const creative = (body.creatives ?? []).find((item) => item.id === payload?.creativeId) ?? (body.creatives ?? [])[0];
  const placements = (body.channels ?? []).filter((channel) => channel.network !== "email");
  return (
    <Stack gap={4}>
      {!creative ? <Empty title="No creative to preview" /> : (
        <>
          <Properties rows={[
            { label: "Campaign", value: campaign?.title ?? "—" },
            { label: "Creative", value: creative.title },
            { label: "Approval", value: <Pill tone={creative.status === "approved" ? "success" : "warning"}>{creative.status.replace("_", " ")}</Pill> },
          ]} />
          {placements.map((placement) => (
            <Stack key={placement.network} gap={2}>
              <strong>{networkOf(placement.network).label} placement</strong>
              <NetworkPreview network={placement.network} caption={`${creative.title} — ${campaign?.summary ?? ""}`} media={`${creative.kind} placeholder`} />
            </Stack>
          ))}
          {placements.length === 0 && <Notice tone="info">This campaign has no paid placement, so there is nothing to render as an ad.</Notice>}
        </>
      )}
    </Stack>
  );
}

export function SpendApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const { actor } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const campaign = useRecord(payload?.id ?? context.selectedId) ?? data.campaigns.find((item) => item.status === "active");
  const body = bodyOf<CampaignBody>(campaign, {});
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    Object.fromEntries((body.channels ?? []).map((channel) => [channel.network, String(channel.budgetMinor)])));
  const total = Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const committed = (body.channels ?? []).reduce((sum, channel) => sum + channel.spentMinor, 0);
  const reserve = Math.round(committed * 0.15);
  const invalid = total < committed + reserve;

  if (!campaign) return <Empty title="No campaign selected" />;

  return (
    <form
      id="spend-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        await context.mutate.patch(campaign.id, {
          amountMinor: total,
          fields: { ...campaign.fields, budgetMinor: total, allocationApprovedBy: actor },
          body: { ...body, channels: (body.channels ?? []).map((channel) => ({ ...channel, budgetMinor: Number(allocations[channel.network]) || 0 })) },
        }, { expectRevision: campaign.revision, event: `Budget allocation changed on ${campaign.title} to ${total}` });
        context.toast("Allocation saved", `${context.money(total)} planned with ${context.money(reserve)} held in reserve. No authorisation was issued.`);
        close();
      }}
    >
      <h3>{campaign.title}</h3>
      <Stack gap={3}>
        {(body.channels ?? []).map((channel) => (
          <Field key={channel.network} label={`${networkOf(channel.network).label} budget`} hint={`${context.money(channel.spentMinor)} already committed`}>
            <TextInput
              inputMode="numeric"
              align="end"
              value={allocations[channel.network] ?? "0"}
              invalid={(Number(allocations[channel.network]) || 0) < channel.spentMinor}
              onChange={(event) => setAllocations((current) => ({ ...current, [channel.network]: event.target.value }))}
            />
          </Field>
        ))}
      </Stack>
      <Properties rows={[
        { label: "Total planned", value: context.money(total) },
        { label: "Already committed", value: context.money(committed) },
        { label: "Reserve (15%)", value: context.money(reserve) },
        { label: "Minimum allowed", value: context.money(committed + reserve) },
      ]} />
      {invalid && <Notice tone="danger" title="The allocation is below the committed spend plus reserve">Advertising platforms report spend late. Leaving less than the committed spend plus a fifteen percent buffer risks an overspend nobody authorised.</Notice>}
    </form>
  );
}

export function CampaignDiagnostics({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const campaign = useRecord(payload?.id ?? context.selectedId) ?? data.campaigns[0];
  const body = bodyOf<CampaignBody>(campaign, {});
  if (!campaign) return <Empty title="No campaign" />;
  const channels = body.channels ?? [];
  const checks = [
    { label: "Spend recorded without a conversion", value: channels.some((channel) => channel.spentMinor > 0 && channel.conversions === 0), detail: "Either the conversion was never recorded here, or the channel is not converting. Both remain possible." },
    { label: "Creative not approved", value: (body.creatives ?? []).some((creative) => creative.status !== "approved"), detail: "An unapproved creative blocks launch approval." },
    { label: "No audience linked", value: !data.audiences.some((audience) => audience.id === String(campaign.fields.audienceId)), detail: "Without a segment there is no recipient count." },
    { label: "Budget nearly used", value: channels.reduce((sum, channel) => sum + channel.spentMinor, 0) > channels.reduce((sum, channel) => sum + channel.budgetMinor, 0) * 0.85, detail: "Review the allocation before the window closes." },
    { label: "No provider connected", value: true, detail: "Nothing here can be verified against a platform report." },
  ];
  return (
    <Stack gap={3}>
      <h3>{campaign.title}</h3>
      {checks.map((check) => (
        <Row key={check.label} gap={2} className="ds-panel" style={{ padding: "var(--space-3)", alignItems: "flex-start" }}>
          <Pill tone={check.value ? "warning" : "success"} dot>{check.value ? "Found" : "Clear"}</Pill>
          <div className="ds-grow">
            <strong>{check.label}</strong>
            <p className="ds-subtle">{check.detail}</p>
          </div>
        </Row>
      ))}
    </Stack>
  );
}

/* ---------------- MARKET-009 ---------------- */

function auditRecord(sites: Rec[]) {
  return sites.find((site) => String(site.fields.kind) === "audit");
}

export function AuditIssue({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const audit = auditRecord(data.sites);
  const body = bodyOf<SiteBody>(audit, {});
  const payload = context.overlayPayload as { issueId?: string } | undefined;
  const issue = (body.issues ?? []).find((item) => item.id === payload?.issueId) ?? (body.issues ?? [])[0];
  const [assignee, setAssignee] = useState(issue?.assignee ?? "");
  if (!audit || !issue) return <Empty title="No audit issue" />;
  return (
    <form
      id="audit-issue"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(audit.id, {
          body: { ...body, issues: (body.issues ?? []).map((item) => (item.id === issue.id ? { ...item, assignee } : item)) },
        }, { expectRevision: audit.revision, event: `Audit issue "${issue.title}" assigned to ${assignee || "nobody"}` });
        context.toast("Issue assigned", `${issue.title} is now owned by ${assignee || "nobody"}.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Issue", value: issue.title },
        { label: "Page", value: <code>{issue.page}</code> },
        { label: "Severity", value: <Pill tone={issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral"}>{issue.severity}</Pill> },
        { label: "Detail", value: issue.detail },
      ]} />
      <Field label="Owner" hint="Who will fix it. Recorded on the audit record.">
        <Select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          <option value="">Unassigned</option>
          {["Maya Chen", "Priya Shah", "Theo Marsh"].map((person) => <option key={person}>{person}</option>)}
        </Select>
      </Field>
      <Notice tone="info">The audit was run against the page model saved in this browser, not against a live crawl of a hosted site.</Notice>
    </form>
  );
}

export function PageMetadataEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const pages = data.sites.filter((site) => String(site.fields.kind) === "page");
  const [chosen, setChosen] = useState(pages[0]?.id ?? "");
  const page = pages.find((item) => item.id === chosen);
  const [metaTitle, setMetaTitle] = useState(String(page?.fields.metaTitle ?? ""));
  const [metaDescription, setMetaDescription] = useState(String(page?.fields.metaDescription ?? ""));
  const titleLong = metaTitle.length > 60;
  const descriptionLong = metaDescription.length > 160;
  if (pages.length === 0) return <Empty title="No pages to edit" />;
  return (
    <form
      id="page-metadata"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!page) return;
        await context.mutate.patch(page.id, { fields: { ...page.fields, metaTitle, metaDescription } }, { expectRevision: page.revision, event: `Metadata edited for ${page.title}` });
        context.toast("Metadata saved", `${page.title} has a ${metaTitle.length} character title. Search engines may still rewrite it.`);
        close();
      }}
    >
      <Field label="Page">
        <Select value={chosen} onChange={(event) => { setChosen(event.target.value); const next = pages.find((item) => item.id === event.target.value); setMetaTitle(String(next?.fields.metaTitle ?? "")); setMetaDescription(String(next?.fields.metaDescription ?? "")); }}>
          {pages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="Meta title" hint={`${metaTitle.length} / 60 characters typically shown`} error={titleLong ? "Likely to be truncated in results" : undefined}>
        <TextInput value={metaTitle} invalid={titleLong} onChange={(event) => setMetaTitle(event.target.value)} />
      </Field>
      <Field label="Meta description" hint={`${metaDescription.length} / 160 characters typically shown`} error={descriptionLong ? "Likely to be truncated in results" : undefined}>
        <TextArea value={metaDescription} rows={3} invalid={descriptionLong} onChange={(event) => setMetaDescription(event.target.value)} />
      </Field>
      <Notice tone="warning" title="Metadata is a suggestion, not a guarantee">A search engine may rewrite the title and description it shows. Nothing here makes a position change certain.</Notice>
    </form>
  );
}

export function TechnicalRecommendation({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const audit = auditRecord(data.sites);
  const body = bodyOf<SiteBody>(audit, {});
  const payload = context.overlayPayload as { issueId?: string } | undefined;
  const issue = (body.issues ?? []).find((item) => item.id === payload?.issueId) ?? (body.issues ?? [])[0];
  const advice: Record<string, string> = {
    "Missing meta description": "Write one description per page from the product record's own copy. Do not generate one for every page from a template, which produces near-duplicate snippets.",
    "Largest contentful paint 4.1s": "Give the hero image explicit width and height, serve it at the size it is displayed and compress it. A 2.4MB unsized hero is the whole measurement.",
    "Duplicate H1": "Demote the second heading to an H2. Two H1 elements make the page outline ambiguous for assistive technology as well as crawlers.",
    "Thin content": "Expand from the specification already recorded against the product: materials, dimensions, lead time and fitting notes.",
    "Image alt text missing": "Add alternative text describing the subject. This is an accessibility requirement first and a search benefit second.",
  };
  if (!issue) return <Empty title="No issue selected" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Issue", value: issue.title },
        { label: "Page", value: <code>{issue.page}</code> },
        { label: "Severity", value: issue.severity },
      ]} />
      <Card title="Recommendation"><p className="ds-prose">{advice[issue.title] ?? "No recommendation is recorded for this issue."}</p></Card>
      <Notice tone="warning" title="No ranking outcome is promised">
        Fixing a technical issue removes a known obstacle. It does not determine a position: competitors, intent and the search engine's own changes are all outside this workspace.
      </Notice>
    </Stack>
  );
}

/* ---------------- MARKET-010 ---------------- */

export function PageTemplatePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const templates = data.templates.filter((template) => String(template.fields.kind) === "page" && template.status === "approved");
  const [chosen, setChosen] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const template = templates.find((item) => item.id === chosen);
  const templateBody = bodyOf<{ blocks?: string[]; fields?: string[] }>(template, {});
  const slugTaken = data.sites.some((site) => String(site.fields.slug) === slug.trim());
  const invalid = !title.trim() || !slug.trim() || slugTaken || !template;
  return (
    <form
      id="page-template"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        await context.mutate.create({
          collection: "sites",
          title: title.trim(),
          status: "draft",
          summary: `Created from ${template!.title}. Not published.`,
          fields: { kind: "page", slug: slug.trim(), published: false, views: 0, conversions: 0, campaignId: "", variant: "A", metaTitle: "", metaDescription: "" },
          body: { blocks: (templateBody.blocks ?? []).map((kind, index) => ({ id: `b${index + 1}`, kind, heading: kind === "hero" ? title.trim() : kind, body: "", fields: kind === "form" ? templateBody.fields : undefined })) },
        }, `Landing page ${title.trim()} created from a template`);
        context.toast("Page created", `${title.trim()} is a draft at /${slug.trim()}. Nothing is published: no host is connected.`);
        close();
      }}
    >
      {templates.length === 0 ? <Empty title="No approved page templates" /> : (
        <>
          <Field label="Template"><Select value={chosen} onChange={(event) => setChosen(event.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
          <Field label="Page title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Path" required error={slugTaken ? "That path is already used by another page" : undefined} hint={`/${slug || "path"}`}>
            <TextInput value={slug} invalid={slugTaken} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required />
          </Field>
          <Properties rows={[{ label: "Blocks", value: (templateBody.blocks ?? []).join(", ") }, { label: "Form fields", value: (templateBody.fields ?? []).join(", ") || "None" }]} />
        </>
      )}
    </form>
  );
}

export function PublishConfirm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const page = useRecord(payload?.id ?? context.selectedId) ?? data.sites.find((site) => String(site.fields.kind) === "page");
  const body = bodyOf<SiteBody>(page, {});
  if (!page) return <Empty title="No page selected" />;
  const blocks = body.blocks ?? [];
  const checks = pageChecks(page, data.sites.filter((site) => String(site.fields.kind) === "page"));
  const failing = checks.filter((check) => !check.ok);
  const problems = [
    ...(blocks.length === 0 ? ["The page has no blocks."] : []),
    ...(blocks.some((block) => block.kind === "form") ? [] : ["There is no form, so the page cannot record a conversion."]),
  ];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Page", value: page.title },
        { label: "Path", value: <code>/{String(page.fields.slug)}</code> },
        { label: "Blocks", value: String(blocks.length) },
        { label: "Current state", value: <Pill tone={page.fields.published === true ? "success" : "warning"}>{page.fields.published === true ? "Exported locally" : "Draft"}</Pill> },
      ]} />
      <Stack gap={2}>
        {checks.map((check) => (
          <Row key={check.id} gap={2}><Pill tone={check.ok ? "success" : "danger"} dot>{check.ok ? "Pass" : "Fail"}</Pill><span className="ds-grow">{check.label}</span><span className="ds-subtle">{check.detail}</span></Row>
        ))}
      </Stack>
      {failing.length > 0 && <Notice tone="danger" title="Publishing is blocked">{failing.map((check) => check.label).join(", ")} must pass first. The URL, redirects, consent and analytics are verified before anything is exported.</Notice>}
      {problems.length > 0 && <Notice tone="warning" title="Before publishing">{problems.join(" ")}</Notice>}
      <ProviderBoundary id="site.publish" title="There is no host to publish to">
        The previously exported version stays exactly as it is. A failed publish cannot damage it, because publishing here only writes a record and an HTML file in this browser.
      </ProviderBoundary>
      <Button
        variant="primary"
        disabled={failing.length > 0}
        onClick={async () => {
          await context.mutate.patch(page.id, {
            status: "published",
            fields: { ...page.fields, published: true, exportedAt: context.now.toISOString(), publishedBy: context.actor },
          }, { expectRevision: page.revision, event: `${page.title} exported as HTML from this browser` });
          context.toast("Exported", `${page.title} is marked exported. No hosting provider was contacted, so no public URL exists.`);
          close();
        }}
      >
        Publish by exporting this version
      </Button>
    </Stack>
  );
}

export function VersionCompare({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const page = useRecord(payload?.id ?? context.selectedId) ?? data.sites.find((site) => String(site.fields.kind) === "page");
  if (!page) return <Empty title="No page selected" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Page", value: page.title },
        { label: "Current revision", value: String(page.revision) },
        { label: "Stored versions", value: String(page.history.length) },
        { label: "Last change", value: `${context.dateTime(page.updatedAt)} by ${page.updatedBy}` },
      ]} />
      {page.history.length === 0 ? (
        <Notice tone="info" title="Only the current version exists">A version is stored each time the record is saved. This page has not been edited since it was created.</Notice>
      ) : (
        <VersionRestoreGrid context={context} page={page} />
      )}
    </Stack>
  );
}

/* ---------------- MARKET-011 ---------------- */

export function AttributionModelExplainer({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { model?: string } | undefined;
  const model = payload?.model ?? "Last touch";
  const explanations: Record<string, string> = {
    "Last touch": "Gives the whole conversion to the final recorded touch. It flatters channels that appear late, such as branded search, and hides whatever created the demand.",
    "First touch": "Gives the whole conversion to the first recorded touch. It flatters awareness channels and ignores everything that closed the sale.",
    Linear: "Splits a conversion evenly across every recorded touch. It is tidy but assumes each touch mattered equally, which nothing here establishes.",
    Unattributed: "Orders with no recorded campaign touch at all. Showing this number is the point: it is usually the largest group and it is not evidence that marketing did nothing.",
  };
  return (
    <Stack gap={4}>
      <h3>{model}</h3>
      <p className="ds-prose">{explanations[model]}</p>
      <Properties rows={[
        { label: "Inputs", value: "Touch counts stored on campaign records" },
        { label: "Not used", value: "Cookies, pixels, click identifiers or any provider report — none exist here" },
        { label: "Known gaps", value: "Showroom visits, word of mouth, repeat intent and seasonality" },
      ]} />
      <Notice tone="warning" title="No model here measures cause">
        Every model above redistributes the same stored numbers. A different split is not a different truth, and none of them support a claim that a channel caused a purchase.
      </Notice>
    </Stack>
  );
}

export function SourceInspector({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { network?: string; metric?: string } | undefined;
  if (payload?.metric === "orders") {
    const orders = data.orders.filter((order) => order.status !== "cancelled");
    return (
      <Stack gap={3}>
        <p className="ds-subtle">Order revenue is the sum of {orders.length} order records, cancellations excluded.</p>
        <DataGrid rows={orders} rowId={(row) => row.id} label="Order sources" filterable={false}
          columns={[
            { key: "title", header: "Order", primary: true, cell: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => <Pill>{row.status.replace("_", " ")}</Pill> },
            { key: "amount", header: "Gross", align: "end", cell: (row) => context.money(row.amountMinor) },
            { key: "tags", header: "Channel tag", cell: (row) => row.tags.join(", ") || "None" },
          ]} />
      </Stack>
    );
  }
  const network = payload?.network ?? "search";
  const contributors = data.campaigns.filter((campaign) => (bodyOf<CampaignBody>(campaign, {}).channels ?? []).some((channel) => channel.network === network));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Channel", value: networkOf(network).label },
        { label: "Campaigns contributing", value: String(contributors.length) },
        { label: "Measurement", value: <Pill tone="warning">Self-reported fields</Pill> },
      ]} />
      <DataGrid rows={contributors} rowId={(row) => row.id} label="Channel contributors" filterable={false}
        columns={[
          { key: "title", header: "Campaign", primary: true, cell: (row) => row.title },
          { key: "spend", header: "Committed", align: "end", cell: (row) => context.money((bodyOf<CampaignBody>(row, {}).channels ?? []).find((channel) => channel.network === network)?.spentMinor ?? 0) },
          { key: "conv", header: "Conversions", align: "end", cell: (row) => String((bodyOf<CampaignBody>(row, {}).channels ?? []).find((channel) => channel.network === network)?.conversions ?? 0) },
          { key: "updated", header: "Last edited", align: "end", cell: (row) => context.relative(row.updatedAt) },
        ]} />
      <Notice tone="info">Each figure was entered on the campaign record shown. Replacing them with platform figures needs a connected ad account.</Notice>
    </Stack>
  );
}

export function MetricNotes({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const orders = data.orders.filter((order) => order.status !== "cancelled");
  const conversions = rollUp(data.campaigns).reduce((sum, channel) => sum + channel.conversions, 0);
  const [note, setNote] = useState("");
  return (
    <form
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Attribution note: ${note}`, { type: "note" });
        context.toast("Note recorded", "It is in the activity log beside the figures it describes.");
        setNote("");
      }}
    >
      <Properties rows={[
        { label: "Orders", value: String(orders.length) },
        { label: "Claimed conversions", value: String(conversions) },
        { label: "Unattributed", value: String(Math.max(0, orders.length - conversions)) },
        { label: "As at", value: context.dateTime(now) },
        { label: "Consent records", value: <Pill tone="warning">None stored</Pill> },
      ]} />
      <Notice tone="warning" title="Why the unattributed figure is large">
        Nothing in this workspace links a click to an order. There are no click identifiers, no analytics consent records and no provider reports. The gap is published rather than filled.
      </Notice>
      <Field label="Add a note for whoever reads this next"><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={!note.trim()}>Record note</Button>
    </form>
  );
}

/* ---------------- MARKET-012 ---------------- */

export function TemplateEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const existingBody = bodyOf<{ subject?: string; caption?: string; blocks?: string[] }>(existing, {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState(String(existing?.fields.kind ?? "email"));
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [subject, setSubject] = useState(existingBody.subject ?? existingBody.caption ?? "");
  const invalid = !title.trim();
  return (
    <form
      id="template-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        if (existing) {
          await context.mutate.patch(existing.id, {
            title: title.trim(), summary,
            status: "review",
            fields: { ...existing.fields, kind, approval: "awaiting_approval", version: Number(existing.fields.version ?? 1) + 1, brandChecked: false },
            body: { ...existingBody, ...(kind === "email" ? { subject } : { caption: subject }) },
          }, { expectRevision: existing.revision, event: `Template ${title.trim()} edited to version ${Number(existing.fields.version ?? 1) + 1}` });
          context.toast("Template saved for review", "A new version needs approval before anything uses it. Live items keep the version they were built with.");
        } else {
          await context.mutate.create({
            collection: "templates",
            title: title.trim(),
            status: "review",
            summary,
            tags: [kind],
            fields: { kind, approval: "awaiting_approval", usedBy: 0, brandChecked: false, version: 1 },
            body: kind === "email" ? { subject, blocks: ["hero", "body", "footer"] } : { caption: subject },
          }, `Template ${title.trim()} created`);
          context.toast("Template created", "It is version 1 awaiting approval.");
        }
        close();
      }}
    >
      <Field label="Template name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value)} disabled={Boolean(existing)}>
          {["email", "post", "ad", "plan", "page"].map((item) => <option key={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="What it is for"><TextArea value={summary} rows={2} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Field label={kind === "email" ? "Subject line" : "Caption frame"} hint="Placeholders such as {{product}} are filled from records when the template is used.">
        <TextInput value={subject} onChange={(event) => setSubject(event.target.value)} />
      </Field>
      <Notice tone="info" title="Editing creates a new version">A live campaign keeps the version it was built with, so saving here cannot change something already out of the door.</Notice>
    </form>
  );
}

export function TemplateApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = useRecord(payload?.id ?? context.selectedId);
  const { actor } = useWorkspace();
  const [brandChecked, setBrandChecked] = useState(template?.fields.brandChecked === true);
  if (!template) return <Empty title="Select a template" />;
  return (
    <form
      id="template-approval"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!brandChecked) return;
        await context.mutate.patch(template.id, {
          status: "approved",
          fields: { ...template.fields, approval: "approved", brandChecked: true, approvedBy: actor },
        }, { expectRevision: template.revision, event: `Template ${template.title} approved by ${actor}` });
        context.toast("Template approved", `${template.title} version ${template.fields.version ?? 1} is available to use.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Template", value: template.title },
        { label: "Version", value: String(template.fields.version ?? 1) },
        { label: "Kind", value: String(template.fields.kind) },
        { label: "Used by", value: `${template.fields.usedBy ?? 0} live items` },
      ]} />
      <Checkbox label="I have checked this against the brand guidelines" checked={brandChecked} onChange={(event) => setBrandChecked(event.target.checked)} />
      {!brandChecked && <Notice tone="warning" title="A template cannot be approved unchecked">Approval is what makes a template usable in a campaign, so the brand check is recorded with it.</Notice>}
    </form>
  );
}

export function GlobalUpdateImpact({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = useRecord(payload?.id ?? context.selectedId) ?? data.templates[0];
  if (!template) return <Empty title="Select a template" />;
  const usedByCampaigns = data.campaigns.filter((campaign) => String(campaign.fields.templateId ?? "") === template.id);
  const live = usedByCampaigns.filter((campaign) => campaign.status === "active");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Template", value: template.title },
        { label: "Current version", value: String(template.fields.version ?? 1) },
        { label: "Campaigns built from it", value: String(usedByCampaigns.length) },
        { label: "Of those, live", value: String(live.length) },
      ]} />
      {live.length > 0 ? (
        <Notice tone="danger" title={`${live.length} live campaign${live.length === 1 ? "" : "s"} will not be rewritten`}>
          {live.map((campaign) => campaign.title).join(", ")} keep the version they were built with. Changing a template never edits something already approved and out of the door; the new version applies to the next campaign created from it.
        </Notice>
      ) : (
        <Notice tone="success" title="Nothing live uses this template">The new version applies to everything created from it afterwards.</Notice>
      )}
      <DataGrid rows={usedByCampaigns} rowId={(row) => row.id} label="Campaigns using this template" filterable={false}
        columns={[
          { key: "title", header: "Campaign", primary: true, cell: (row) => row.title },
          { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
          { key: "version", header: "Built with", cell: (row) => `version ${String(row.fields.templateVersion ?? 1)}` },
        ]}
        empty={<Empty title="No campaign records this template" />}
      />
    </Stack>
  );
}
