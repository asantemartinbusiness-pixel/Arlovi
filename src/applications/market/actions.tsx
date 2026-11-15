import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Notice, Pill, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { getRecord, listByCollection } from "@/platform/repo";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { useRecord } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE, createStore, downloadCsv, type ConfirmSpec } from "@/applications/market/kit";
import { bodyOf, networkOf, rollUp, useMarketData, type CampaignBody, type PageBlock, type PostBody, type SiteBody } from "./data";

/* ====================================================================== *
 * MARKET contract actions that change a record. Each one reads the record
 * first, states the consequence, and writes with the revision it read.
 * ====================================================================== */

const iso = (context: ScreenContext) => context.now.toISOString();

function confirm(context: ScreenContext, spec: ConfirmSpec) {
  context.openOverlay("confirm", spec);
}

async function selected(context: ScreenContext, id = context.selectedId): Promise<Rec | undefined> {
  if (!id) return undefined;
  const record = await getRecord(id);
  if (!record) context.toast("Not found", "That record is no longer in this workspace.", "failed");
  return record;
}

/* ---------------- MARKET-002 archive ---------------- */

export async function archiveCampaign(context: ScreenContext) {
  const campaign = await selected(context);
  if (!campaign) return;
  const blocked = campaign.status === "active"
    ? `${campaign.title} is live. Pause it from the campaign first, so its queued items are held before it leaves the library.`
    : campaign.status === "archived" ? `${campaign.title} is already archived.` : undefined;
  confirm(context, {
    title: `Archive ${campaign.title}`,
    tone: "danger",
    consequence: "The campaign moves to Completed as archived. Its plan, results and activity are kept; nothing is deleted. An archived campaign cannot be approved or launched again without being duplicated.",
    facts: [
      { label: "Current state", value: campaign.status },
      { label: "Committed spend", value: context.money(Number(campaign.fields.spentMinor ?? 0)) },
      { label: "Revision", value: String(campaign.revision) },
    ],
    blocked,
    confirmLabel: "Archive campaign",
    run: async () => {
      const saved = await context.mutate.patch(campaign.id, {
        status: "archived",
        fields: { ...campaign.fields, archivedBy: context.actor, archivedAt: iso(context), statusBeforeArchive: campaign.status },
      }, { expectRevision: campaign.revision, event: `Campaign ${campaign.title} archived by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Archived", `${campaign.title} is archived. Its results and history are kept.`);
    },
  });
}

/* ---------------- MARKET-002 compare ---------------- */

export function CompareCampaigns({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const [picked, setChosen] = useState<string[] | null>(null);
  const first = payload?.id ?? context.selectedId;
  const fallback = [...(first ? [first] : []), ...data.campaigns.filter((campaign) => campaign.id !== first).slice(0, first ? 1 : 2).map((campaign) => campaign.id)];
  const chosen = picked ?? fallback;
  const rows = data.campaigns.filter((campaign) => chosen.includes(campaign.id));
  const metrics = rows.map((campaign) => {
    const channels = bodyOf<CampaignBody>(campaign, {}).channels ?? [];
    const sum = (key: "budgetMinor" | "spentMinor" | "impressions" | "clicks" | "conversions" | "revenueMinor") => channels.reduce((total, channel) => total + channel[key], 0);
    return {
      campaign,
      budget: sum("budgetMinor"),
      spent: sum("spentMinor"),
      clicks: sum("clicks"),
      conversions: sum("conversions"),
      revenue: sum("revenueMinor"),
    };
  });
  const lines: { label: string; value: (row: (typeof metrics)[number]) => string }[] = [
    { label: "Status", value: (row) => row.campaign.status },
    { label: "Planned budget", value: (row) => context.money(row.budget) },
    { label: "Committed spend", value: (row) => context.money(row.spent) },
    { label: "Recorded clicks", value: (row) => (row.clicks ? row.clicks.toLocaleString() : "Not recorded") },
    { label: "Recorded conversions", value: (row) => String(row.conversions) },
    { label: "Cost per conversion", value: (row) => (row.conversions ? context.money(Math.round(row.spent / row.conversions)) : "No conversions recorded") },
    { label: "Claimed revenue", value: (row) => context.money(row.revenue) },
    { label: "Claimed return on spend", value: (row) => (row.spent ? `${(row.revenue / row.spent).toFixed(2)}×` : "No spend recorded") },
  ];
  return (
    <Stack gap={4}>
      <fieldset className="ds-fieldset">
        <legend>Campaigns to compare (up to four)</legend>
        <Stack gap={2}>
          {data.campaigns.map((campaign) => (
            <Checkbox
              key={campaign.id}
              label={`${campaign.title} · ${campaign.status}`}
              checked={chosen.includes(campaign.id)}
              disabled={!chosen.includes(campaign.id) && chosen.length >= 4}
              onChange={(event) => setChosen(event.target.checked ? [...chosen, campaign.id] : chosen.filter((id) => id !== campaign.id))}
            />
          ))}
        </Stack>
      </fieldset>
      {metrics.length < 2 ? <Empty title="Pick at least two campaigns">The comparison reads the channel plan on each campaign record.</Empty> : (
        <div style={{ overflowX: "auto" }}>
          <table className="ds-table">
            <caption className="ds-sr-only">Campaign comparison</caption>
            <thead><tr><th scope="col">Measure</th>{metrics.map((row) => <th key={row.campaign.id} scope="col">{row.campaign.title}</th>)}</tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.label}><th scope="row">{line.label}</th>{metrics.map((row) => <td key={row.campaign.id} className="ds-num">{line.value(row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Notice tone="warning" title="Self-reported figures">
        Clicks, conversions and revenue are fields typed onto each campaign record. More than one campaign can claim the same order, so claimed revenue does not reconcile to order records. Attribution shows the reconciled view.
      </Notice>
    </Stack>
  );
}

/* ---------------- MARKET-003 request review ---------------- */

export async function requestCampaignReview(context: ScreenContext) {
  const campaign = await selected(context, context.params.id);
  if (!campaign) return;
  if (String(campaign.fields.reviewState) === "requested") {
    context.toast("Already requested", `A review was requested by ${String(campaign.fields.reviewRequestedBy)} and is still open.`, "info");
    return;
  }
  const saved = await context.mutate.patch(campaign.id, {
    fields: { ...campaign.fields, reviewState: "requested", reviewRequestedBy: context.actor, reviewRequestedAt: iso(context) },
  }, { expectRevision: campaign.revision, event: `Review requested for ${campaign.title} by ${context.actor}` });
  if (!saved) return;
  context.toast("Review requested", "The campaign now shows an open review request. No notification was sent: no mail provider is connected.");
}

/* ---------------- MARKET-005 schedule and retry ---------------- */

export async function schedulePost(context: ScreenContext) {
  const post = await selected(context);
  if (!post) return;
  const body = bodyOf<PostBody>(post, {});
  const spec = networkOf(String(post.fields.network));
  const when = post.startAt ? new Date(post.startAt) : undefined;
  const blocked = post.status === "published" ? `${post.title} is already recorded as published.`
    : post.status === "failed" ? `${post.title} failed. Use "Retry safely", which checks whether the earlier attempt could have reached the network.`
      : !when || when <= context.now ? "The scheduled time is not in the future. Set a new time in the composer first."
        : (body.caption ?? "").length > spec.limit ? `The caption is over the ${spec.label} limit of ${spec.limit.toLocaleString()} characters.`
          : !(body.caption ?? "").trim() ? "The post has no caption." : undefined;
  confirm(context, {
    title: `Schedule ${post.title}`,
    consequence: `The post moves to the schedule for ${context.dateTime(post.startAt)} and is approved by ${context.actor}. Its delivery state becomes "${CAPABILITY_LABELS.queued_local}".`,
    facts: [
      { label: "Channel", value: spec.label },
      { label: "Caption", value: `${(body.caption ?? "").length} of ${spec.limit.toLocaleString()} characters` },
      { label: "Media", value: body.media?.[0]?.name ?? "None attached" },
    ],
    boundary: "social.publish",
    boundaryTitle: "No social account is connected",
    boundaryNote: "Nothing is posted at the scheduled time. The item waits in this browser until an account is authorised.",
    blocked,
    confirmLabel: "Schedule locally",
    run: async () => {
      const saved = await context.mutate.patch(post.id, {
        status: "scheduled",
        fields: { ...post.fields, delivery: "queued_local", approval: "approved", scheduledBy: context.actor, scheduledAt: iso(context) },
      }, { expectRevision: post.revision, event: `${post.title} scheduled locally for ${post.startAt} by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Scheduled locally", `${post.title} is queued in this browser. It has not been posted.`);
    },
  });
}

/** A failed post may be retried only when it is certain the earlier attempt never reached a network. */
export function retryState(post: Rec): { safe: boolean; reason: string } {
  const reference = String(post.fields.externalRef ?? "");
  const delivery = String(post.fields.delivery ?? "");
  if (post.status !== "failed") return { safe: false, reason: `${post.title} has not failed, so there is nothing to retry.` };
  if (reference || delivery === "awaiting_external_confirmation") {
    return { safe: false, reason: `The earlier attempt carries a provider reference (${reference || "pending"}) with no confirmed outcome. It may already be live, so a retry could post it twice. Check the account and record the outcome first.` };
  }
  return { safe: true, reason: "No attempt ever left this browser (there is no provider reference), so a retry cannot create a duplicate." };
}

export async function retryPost(context: ScreenContext) {
  const post = await selected(context);
  if (!post) return;
  const state = retryState(post);
  const attempts = Number(post.fields.retryCount ?? 0) + 1;
  const next = new Date(Math.max(new Date(post.startAt ?? 0).getTime(), context.now.getTime() + 3_600_000));
  confirm(context, {
    title: `Retry ${post.title}`,
    consequence: `${state.reason} The post is re-queued as attempt ${attempts} for ${context.dateTime(next)} with its own attempt key, and the earlier failure is kept on the record.`,
    facts: [
      { label: "Earlier failure", value: String(post.fields.error || "Not recorded") },
      { label: "Provider reference", value: String(post.fields.externalRef || "None") },
      { label: "Attempt key", value: <code>{`${post.id}#${attempts}`}</code> },
    ],
    blocked: state.safe ? undefined : state.reason,
    boundary: "social.publish",
    boundaryTitle: "No social account is connected",
    boundaryNote: `The retry is "${CAPABILITY_LABELS.queued_local}". It will fail the same way until an account is authorised.`,
    confirmLabel: "Re-queue safely",
    run: async () => {
      const saved = await context.mutate.patch(post.id, {
        status: "scheduled",
        startAt: next.toISOString(),
        at: next.toISOString(),
        fields: { ...post.fields, delivery: "queued_local", retryCount: attempts, attemptKey: `${post.id}#${attempts}`, lastFailure: String(post.fields.error ?? ""), error: "" },
      }, { expectRevision: post.revision, event: `${post.title} re-queued as attempt ${attempts} after a failure that never reached a provider` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Re-queued", `${post.title} is attempt ${attempts}, queued locally.`);
    },
  });
}

/* ---------------- MARKET-006 schedule ---------------- */

export async function scheduleEmail(context: ScreenContext) {
  const campaign = await selected(context);
  if (!campaign) return;
  const approved = Boolean(campaign.fields.recipientsApprovedAt);
  const when = campaign.startAt ? new Date(campaign.startAt) : undefined;
  const count = Number(campaign.fields.recipientCount ?? 0);
  const blocked = !campaign.fields.emailSubject ? "There is no subject. Build the email first."
    : !approved ? "Recipients have not been approved. Approve them first, so the suppression and consent checks are on the record before a send window is set."
      : !when || when <= context.now ? "The send window is not in the future. Set it in the email builder first." : undefined;
  confirm(context, {
    title: `Schedule ${campaign.title}`,
    consequence: `The send is scheduled for ${context.dateTime(campaign.startAt)} to the ${count} recipients approved by ${String(campaign.fields.recipientsApprovedBy ?? "nobody")}.${count > 500 ? " This is a large send: a real provider would throttle it in batches and stop on a bounce spike." : ""}`,
    facts: [
      { label: "Subject", value: String(campaign.fields.emailSubject ?? "—") },
      { label: "Recipients approved", value: approved ? context.dateTime(String(campaign.fields.recipientsApprovedAt)) : "Not yet" },
      { label: "Unsubscribe link", value: "Required in the template footer" },
    ],
    boundary: "email.send",
    blocked,
    confirmLabel: "Schedule the send locally",
    run: async () => {
      const saved = await context.mutate.patch(campaign.id, {
        fields: { ...campaign.fields, sendState: "queued_local", sendScheduledBy: context.actor, sendScheduledAt: iso(context), sendWindow: campaign.startAt ?? "" },
      }, { expectRevision: campaign.revision, event: `Email send for ${campaign.title} scheduled locally for ${campaign.startAt} by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      await context.mutate.log(`Send for ${campaign.title} queued locally; no mail provider is connected.`, { entityId: campaign.id, type: "email.queued_local", capability: "queued_local" });
      context.toast("Scheduled locally", "The send is queued in this browser. No email will leave it.");
    },
  });
}

/* ---------------- MARKET-008 pause and reconcile ---------------- */

export async function pauseAdCampaign(context: ScreenContext) {
  const campaign = await selected(context);
  if (!campaign) return;
  confirm(context, {
    title: `Pause ${campaign.title}`,
    tone: "danger",
    consequence: "The campaign is set to paused in this workspace. No ad account is connected, so no provider spend was ever authorised from here and none can be stopped. If one were connected, late-reported spend could still arrive after a pause.",
    facts: [{ label: "Committed spend", value: context.money(Number(campaign.fields.spentMinor ?? 0)) }, { label: "Current state", value: campaign.status }],
    blocked: campaign.status === "paused" ? "Already paused." : campaign.status === "archived" ? "An archived campaign cannot be paused." : undefined,
    confirmLabel: "Pause locally",
    run: async () => {
      const saved = await context.mutate.patch(campaign.id, { status: "paused", fields: { ...campaign.fields, pausedBy: context.actor, pausedAt: iso(context) } }, { expectRevision: campaign.revision, event: `${campaign.title} paused from Advertising by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Paused locally", `${campaign.title} is paused in this workspace.`);
    },
  });
}

export async function reconcileSpend(context: ScreenContext) {
  const campaign = await selected(context);
  if (!campaign) return;
  const channels = bodyOf<CampaignBody>(campaign, {}).channels ?? [];
  const channelSpend = channels.reduce((sum, channel) => sum + channel.spentMinor, 0);
  const recorded = Number(campaign.fields.spentMinor ?? 0);
  const difference = channelSpend - recorded;
  const budget = channels.reduce((sum, channel) => sum + channel.budgetMinor, 0);
  const reserve = Math.round(channelSpend * 0.15);
  confirm(context, {
    title: `Reconcile ${campaign.title}`,
    consequence: difference === 0
      ? "The campaign's committed spend agrees with the sum of its channel plans. Reconciling records that check, with the reserve still required against late-reported spend."
      : `The channel plans add up to ${context.money(channelSpend)} but the campaign records ${context.money(recorded)}. Reconciling sets the campaign figure to the channel total and keeps the old figure and the difference on the record.`,
    facts: [
      { label: "Campaign committed", value: context.money(recorded) },
      { label: "Sum of channel plans", value: context.money(channelSpend) },
      { label: "Difference", value: context.money(difference) },
      { label: "Reserve required (15%)", value: context.money(reserve) },
      { label: "Headroom after reserve", value: context.money(budget - channelSpend - reserve) },
      { label: "Provider-reported spend", value: <Pill tone="warning">{CAPABILITY_LABELS.not_connected}</Pill> },
    ],
    boundary: "ads.report",
    boundaryTitle: "No ad account is connected",
    boundaryNote: `This is a reconciliation of local records only. Provider spend stays "${CAPABILITY_LABELS.awaiting_external_confirmation}" until an account reports it.`,
    confirmLabel: "Record reconciliation",
    run: async () => {
      const saved = await context.mutate.patch(campaign.id, {
        fields: {
          ...campaign.fields, spentMinor: channelSpend, reconciledBy: context.actor, reconciledAt: iso(context),
          reconciledDifferenceMinor: difference, spentBeforeReconcileMinor: recorded, reserveMinor: reserve, providerSpend: "awaiting_external_confirmation",
        },
      }, { expectRevision: campaign.revision, event: `${campaign.title} spend reconciled to channel plans (difference ${difference}) by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Reconciled locally", difference === 0 ? "Figures agree. The check is on the record." : `Committed spend corrected by ${context.money(difference)}.`);
    },
  });
}

/* ---------------- MARKET-009 run audit and publish metadata ---------------- */

type Issue = NonNullable<SiteBody["issues"]>[number];

function auditPages(pages: Rec[]): Issue[] {
  const issues: Issue[] = [];
  const titles = new Map<string, string[]>();
  for (const page of pages) {
    const slug = `/${String(page.fields.slug ?? "")}`;
    const metaTitle = String(page.fields.metaTitle ?? "");
    const metaDescription = String(page.fields.metaDescription ?? "");
    const blocks = bodyOf<SiteBody>(page, {}).blocks ?? [];
    if (!metaTitle) issues.push({ id: `auto-${page.id}-title`, severity: "high", page: slug, title: "Missing meta title", detail: `${page.title} has no meta title, so the search engine will choose one.`, assignee: "" });
    else if (metaTitle.length > 60) issues.push({ id: `auto-${page.id}-title-long`, severity: "low", page: slug, title: "Meta title likely truncated", detail: `${metaTitle.length} characters; around 60 are usually shown.`, assignee: "" });
    if (!metaDescription) issues.push({ id: `auto-${page.id}-description`, severity: "medium", page: slug, title: "Missing meta description", detail: `${page.title} has no description, so the snippet is generated by the search engine.`, assignee: "" });
    else if (metaDescription.length > 160) issues.push({ id: `auto-${page.id}-description-long`, severity: "low", page: slug, title: "Meta description likely truncated", detail: `${metaDescription.length} characters; around 160 are usually shown.`, assignee: "" });
    if (!blocks.some((block) => block.kind === "hero")) issues.push({ id: `auto-${page.id}-h1`, severity: "medium", page: slug, title: "No main heading block", detail: "The page has no hero block, so it renders without an H1.", assignee: "" });
    if (blocks.filter((block) => block.body || block.heading).length < 2) issues.push({ id: `auto-${page.id}-thin`, severity: "low", page: slug, title: "Thin content", detail: "Fewer than two blocks carry text.", assignee: "" });
    if (metaTitle) titles.set(metaTitle, [...(titles.get(metaTitle) ?? []), slug]);
  }
  for (const [title, slugs] of titles) {
    if (slugs.length > 1) issues.push({ id: `auto-duplicate-${slugs.join("-")}`, severity: "medium", page: slugs.join(", "), title: "Duplicate meta title", detail: `"${title}" is used by ${slugs.length} pages.`, assignee: "" });
  }
  return issues;
}

export async function runSeoAudit(context: ScreenContext) {
  const sites = await listByCollection(context.org.id, "sites");
  const audit = sites.find((site) => String(site.fields.kind) === "audit");
  const pages = sites.filter((site) => String(site.fields.kind) === "page");
  const found = auditPages(pages);
  if (!audit) {
    await context.mutate.create({
      collection: "sites", title: `${context.org.shortName} — site audit`, status: "active",
      summary: "Audit of the page model saved in this browser.",
      fields: { kind: "audit", slug: context.org.slug, published: true, lastRunAt: iso(context), crawledPages: pages.length, issuesHigh: found.filter((issue) => issue.severity === "high").length, issuesMedium: found.filter((issue) => issue.severity === "medium").length, issuesLow: found.filter((issue) => issue.severity === "low").length, lastRunBy: context.actor },
      body: { issues: found },
    }, `SEO audit run over ${pages.length} saved pages: ${found.length} issues`);
    context.toast("Audit recorded", `${found.length} issues found across ${pages.length} saved pages.`);
    return;
  }
  const body = bodyOf<SiteBody>(audit, {});
  const previous = body.issues ?? [];
  // Keep issues that cannot be derived from the page model (speed, images) as they were recorded.
  const recorded = previous.filter((issue) => !issue.id.startsWith("auto-"));
  const merged = found.map((issue) => ({ ...issue, assignee: previous.find((item) => item.id === issue.id)?.assignee ?? "" }));
  const issues = [...recorded, ...merged];
  const resolved = previous.filter((issue) => issue.id.startsWith("auto-") && !found.some((item) => item.id === issue.id)).length;
  const saved = await context.mutate.patch(audit.id, {
    fields: {
      ...audit.fields, lastRunAt: iso(context), lastRunBy: context.actor, crawledPages: pages.length,
      issuesHigh: issues.filter((issue) => issue.severity === "high").length,
      issuesMedium: issues.filter((issue) => issue.severity === "medium").length,
      issuesLow: issues.filter((issue) => issue.severity === "low").length,
    },
    body: { ...body, issues },
  }, { expectRevision: audit.revision, event: `SEO audit run over ${pages.length} saved pages by ${context.actor}: ${merged.length} derived issues, ${resolved} resolved` });
  if (!saved) return;
  context.toast("Audit run", `${pages.length} saved pages checked: ${merged.length} issues from the page model, ${recorded.length} recorded issues kept, ${resolved} resolved. No live site was crawled.`);
}

export async function publishMetadata(context: ScreenContext) {
  const sites = await listByCollection(context.org.id, "sites");
  const pending = sites.filter((site) => String(site.fields.kind) === "page" && String(site.fields.metaTitle ?? "")
    && String(site.fields.metaPublishedTitle ?? "") !== String(site.fields.metaTitle ?? "") + "|" + String(site.fields.metaDescription ?? ""));
  confirm(context, {
    title: "Publish metadata changes",
    consequence: `${pending.length} page${pending.length === 1 ? " has" : "s have"} metadata that differs from what was last published. Publishing marks each as "${CAPABILITY_LABELS.queued_local}" for the host; no position change is implied.`,
    facts: pending.map((page) => ({ label: `/${String(page.fields.slug)}`, value: String(page.fields.metaTitle) })),
    blocked: pending.length === 0 ? "Every page's metadata already matches what was last published." : undefined,
    boundary: "site.publish",
    confirmLabel: `Queue ${pending.length} page${pending.length === 1 ? "" : "s"}`,
    run: async () => {
      for (const page of pending) {
        const saved = await context.mutate.patch(page.id, {
          fields: { ...page.fields, metaState: "queued_local", metaPublishedTitle: `${String(page.fields.metaTitle)}|${String(page.fields.metaDescription ?? "")}`, metaQueuedAt: iso(context), metaQueuedBy: context.actor },
        }, { expectRevision: page.revision, event: `Metadata for ${page.title} queued for publication locally` });
        if (!saved) return CHANGED_ELSEWHERE;
      }
      context.toast("Queued locally", `${pending.length} page${pending.length === 1 ? "" : "s"} queued. No host is connected, so nothing is live.`);
    },
  });
}

/* ---------------- MARKET-010 page checks, visual edit, revert ---------------- */

export interface PageCheck { id: string; label: string; ok: boolean; detail: string }

export function pageChecks(page: Rec, pages: Rec[]): PageCheck[] {
  const slug = String(page.fields.slug ?? "");
  const blocks = bodyOf<SiteBody>(page, {}).blocks ?? [];
  const form = blocks.find((block) => block.kind === "form");
  const previousSlug = String(page.fields.previousSlug ?? "");
  return [
    { id: "url", label: "Path is valid and unique", ok: /^[a-z0-9-]+$/.test(slug) && !pages.some((other) => other.id !== page.id && String(other.fields.slug) === slug), detail: `/${slug}` },
    { id: "redirect", label: "Old path redirects", ok: !previousSlug || String(page.fields.redirectFrom ?? "") === previousSlug, detail: previousSlug ? `/${previousSlug} → /${slug}` : "The path has never changed" },
    { id: "meta", label: "Meta title set", ok: Boolean(String(page.fields.metaTitle ?? "")), detail: String(page.fields.metaTitle || "Missing") },
    { id: "blocks", label: "Page has a heading block", ok: blocks.some((block) => block.kind === "hero"), detail: `${blocks.length} blocks` },
    { id: "consent", label: "Form asks for consent", ok: !form || (form.fields ?? []).some((field) => /consent/i.test(field)), detail: form ? (form.fields ?? []).join(", ") || "No fields" : "No form on the page" },
    { id: "analytics", label: "Conversions can be attributed", ok: Boolean(String(page.fields.campaignId ?? "")), detail: String(page.fields.campaignId) ? "Linked to a campaign" : "No campaign linked, so a submission cannot be credited" },
  ];
}

export async function testPage(context: ScreenContext) {
  const page = await selected(context);
  if (!page) return;
  const pages = (await listByCollection(context.org.id, "sites")).filter((site) => String(site.fields.kind) === "page");
  const checks = pageChecks(page, pages);
  const failed = checks.filter((check) => !check.ok);
  const saved = await context.mutate.patch(page.id, {
    fields: { ...page.fields, checksRunAt: iso(context), checksRunBy: context.actor, checksFailed: failed.map((check) => check.label).join("; "), checksPassed: failed.length === 0 },
  }, { expectRevision: page.revision, event: `Pre-publish checks on ${page.title}: ${checks.length - failed.length} of ${checks.length} passed` });
  if (!saved) return;
  context.setTab("Tests");
  context.toast(failed.length ? "Checks failed" : "Checks passed", failed.length ? `${failed.map((check) => check.label).join(", ")}. Publishing is blocked until these pass.` : `All ${checks.length} checks passed for /${String(page.fields.slug)}.`, failed.length ? "blocked" : "ok");
}

export function PageChecksCard({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const pages = data.sites.filter((site) => String(site.fields.kind) === "page");
  const page = pages.find((item) => item.id === context.selectedId);
  if (!page) return <Notice tone="info" title="Pre-publish checks">Select a page in the Library or Builder, then run "Test the page" to verify its path, redirects, consent and analytics before it is published.</Notice>;
  const checks = pageChecks(page, pages);
  return (
    <Card title={`Pre-publish checks · ${page.title}`} subtitle={page.fields.checksRunAt ? `Last run ${context.dateTime(String(page.fields.checksRunAt))} by ${String(page.fields.checksRunBy)}` : "Not run yet"}>
      <Stack gap={2}>
        {checks.map((check) => (
          <Row key={check.id} gap={2}>
            <Pill tone={check.ok ? "success" : "danger"} dot>{check.ok ? "Pass" : "Fail"}</Pill>
            <span className="ds-grow">{check.label}</span>
            <span className="ds-subtle">{check.detail}</span>
          </Row>
        ))}
      </Stack>
    </Card>
  );
}

const BLOCK_KINDS = ["hero", "text", "products", "form", "quote", "footer"];

export function VisualEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const page = useRecord(payload?.id ?? context.selectedId);
  if (!page) return <Empty title="Select a page">Pick a page in the Library or Builder first.</Empty>;
  return <VisualEditorForm key={page.id} context={context} close={close} page={page} />;
}

function VisualEditorForm({ context, close, page }: { context: ScreenContext; close: () => void; page: Rec }) {
  const [blocks, setBlocks] = useState<PageBlock[]>(() => bodyOf<SiteBody>(page, {}).blocks ?? []);
  const [kind, setKind] = useState("text");
  const move = (index: number, delta: number) => setBlocks((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const update = (index: number, patch: Partial<PageBlock>) => setBlocks((current) => current.map((block, position) => (position === index ? { ...block, ...patch } : block)));
  return (
    <form
      id="visual-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await context.mutate.patch(page.id, { body: { ...bodyOf<SiteBody>(page, {}), blocks } }, { expectRevision: page.revision, event: `${page.title} edited in the visual editor: ${blocks.length} blocks` });
        if (!saved) return;
        context.toast("Page saved", `${blocks.length} blocks saved. The previous version is kept in Versions.`);
        close();
      }}
    >
      <p className="ds-subtle">Move a block with its arrow buttons; the preview on the Builder tab renders the saved order.</p>
      {blocks.map((block, index) => (
        <Card key={block.id} title={`${index + 1}. ${block.kind}`} actions={(
          <Row gap={1}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Move block ${index + 1} down`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Remove block ${index + 1}`} onClick={() => setBlocks((current) => current.filter((_, position) => position !== index))}><Trash2 size={14} /></Button>
          </Row>
        )}>
          <Stack gap={2}>
            <Field label="Heading"><TextInput value={block.heading ?? ""} onChange={(event) => update(index, { heading: event.target.value })} /></Field>
            <Field label="Text"><TextArea rows={2} value={block.body ?? ""} onChange={(event) => update(index, { body: event.target.value })} /></Field>
            {block.kind === "form" && (
              <Field label="Form fields" hint="Comma separated. Include a consent field for marketing sign-ups.">
                <TextInput value={(block.fields ?? []).join(", ")} onChange={(event) => update(index, { fields: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
              </Field>
            )}
          </Stack>
        </Card>
      ))}
      {blocks.length === 0 && <Empty title="No blocks yet" />}
      <Row gap={2}>
        <Field label="Add a block"><Select value={kind} onChange={(event) => setKind(event.target.value)}>{BLOCK_KINDS.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Button variant="secondary" onClick={() => setBlocks((current) => [...current, { id: `b${Date.now().toString(36)}`, kind, heading: kind, body: "", fields: kind === "form" ? ["name", "email", "consent"] : undefined }])}>Add</Button>
      </Row>
    </form>
  );
}

export function restoreVersion(context: ScreenContext, page: Rec, index: number) {
  const version = page.history[index];
  if (!version) return;
  confirm(context, {
    title: `Revert ${page.title}`,
    tone: "danger",
    consequence: `The page goes back to the version saved ${context.dateTime(version.at)}: its title, state, fields and blocks. The current version is not lost; it becomes the newest entry in Versions.`,
    facts: [
      { label: "Title then", value: version.title },
      { label: "State then", value: version.status },
      { label: "Published then", value: version.fields.published === true ? "Yes" : "No" },
    ],
    confirmLabel: "Revert to this version",
    run: async () => {
      const saved = await context.mutate.patch(page.id, {
        title: version.title, status: version.status, summary: version.summary, fields: { ...version.fields }, body: version.body,
      }, { expectRevision: page.revision, event: `${page.title} reverted to the version of ${version.at} by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Reverted", `${version.title} is back to its ${context.dateTime(version.at)} version.`);
    },
  });
}

/* ---------------- MARKET-011 filter and export ---------------- */

export const attributionFilter = createStore<{ networks: string[] }>({ networks: [] });

export function useAttributionFilter() {
  return useSyncExternalStore(attributionFilter.subscribe, attributionFilter.get, attributionFilter.get);
}

export function AttributionFilter({ close }: { close: () => void }) {
  const data = useMarketData();
  const current = useAttributionFilter();
  const available = useMemo(() => rollUp(data.campaigns).map((channel) => channel.network), [data.campaigns]);
  const [networks, setNetworks] = useState<string[]>(current.networks);
  return (
    <form
      id="attribution-filter"
      className="ds-stack ds-gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        attributionFilter.set({ networks });
        close();
      }}
    >
      <fieldset className="ds-fieldset">
        <legend>Channels shown</legend>
        <Stack gap={2}>
          {available.map((network) => (
            <Checkbox key={network} label={networkOf(network).label} checked={networks.includes(network)}
              onChange={(event) => setNetworks((list) => (event.target.checked ? [...list, network] : list.filter((item) => item !== network)))} />
          ))}
        </Stack>
      </fieldset>
      <Notice tone="info">With nothing ticked every channel is shown. The filter narrows the Channels and Models tables; order totals and the unattributed figure always count every order, so filtering cannot hide the gap.</Notice>
      <Button variant="ghost" onClick={() => setNetworks([])}>Clear</Button>
    </form>
  );
}

export async function exportChannelTable(context: ScreenContext) {
  const campaigns = await listByCollection(context.org.id, "campaigns");
  const filter = attributionFilter.get().networks;
  const channels = rollUp(campaigns).filter((channel) => filter.length === 0 || filter.includes(channel.network));
  const count = downloadCsv(`${context.org.slug}-attribution-channels.csv`,
    ["channel", "budget_minor", "committed_minor", "impressions", "clicks", "conversions", "claimed_revenue_minor", "currency", "source"],
    channels.map((channel) => [networkOf(channel.network).label, channel.budgetMinor, channel.spentMinor, channel.impressions, channel.clicks, channel.conversions, channel.revenueMinor, context.org.currency, "self-reported campaign fields"]));
  await context.mutate.log(`Attribution channel table exported (${count} rows${filter.length ? `, filtered to ${filter.join(", ")}` : ""})`, { type: "export", capability: "ready_local" });
  context.toast("Exported", `${count} channel rows downloaded from this browser. Each row is marked as self-reported.`);
}

/* ---------------- MARKET-012 fork and publish ---------------- */

export async function forkTemplate(context: ScreenContext) {
  const template = await selected(context);
  if (!template) return;
  const fork = await context.mutate.create({
    collection: "templates",
    title: `${template.title} (fork)`,
    status: "draft",
    summary: template.summary,
    tags: template.tags,
    fields: { ...template.fields, version: 1, approval: "draft", brandChecked: false, usedBy: 0, forkedFrom: template.id, forkedFromVersion: Number(template.fields.version ?? 1), publishedVersion: "" },
    body: template.body,
  }, `Template ${template.title} forked from version ${Number(template.fields.version ?? 1)} by ${context.actor}`);
  context.select(fork.id);
  context.toast("Forked", `${fork.title} is an independent draft. The original and anything built from it are unchanged.`);
  context.openOverlay("Template editor", { id: fork.id });
}

export async function publishTemplate(context: ScreenContext) {
  const template = await selected(context);
  if (!template) return;
  const campaigns = await listByCollection(context.org.id, "campaigns");
  const users = campaigns.filter((campaign) => String(campaign.fields.templateId ?? "") === template.id);
  const live = users.filter((campaign) => campaign.status === "active");
  const version = Number(template.fields.version ?? 1);
  const previous = Number(template.fields.publishedVersion || 0);
  confirm(context, {
    title: `Publish ${template.title} version ${version}`,
    consequence: `Version ${version} becomes the version new campaigns are built from.${live.length ? ` ${live.length} live campaign${live.length === 1 ? " is" : "s are"} pinned to the version they were built with first, so nothing already out of the door is rewritten.` : ""}`,
    facts: [
      { label: "Previously published", value: previous ? `version ${previous}` : "Never" },
      { label: "Campaigns using it", value: String(users.length) },
      { label: "Live, kept as they are", value: live.map((campaign) => campaign.title).join(", ") || "None" },
    ],
    blocked: template.status !== "approved" ? "Only an approved version can be published. Review it first." : previous === version ? `Version ${version} is already published.` : undefined,
    confirmLabel: `Publish version ${version}`,
    run: async () => {
      for (const campaign of users) {
        if (campaign.fields.templateVersion) continue;
        const pinned = await context.mutate.patch(campaign.id, { fields: { ...campaign.fields, templateVersion: previous || version } }, { expectRevision: campaign.revision, event: `${campaign.title} pinned to template version ${previous || version} before a new version was published` });
        if (!pinned) return CHANGED_ELSEWHERE;
      }
      const saved = await context.mutate.patch(template.id, {
        status: "approved",
        fields: { ...template.fields, publishedVersion: version, publishedBy: context.actor, publishedAt: iso(context) },
      }, { expectRevision: template.revision, event: `Template ${template.title} version ${version} published by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Published", `Version ${version} is the current template. ${live.length} live campaign${live.length === 1 ? "" : "s"} kept their version.`);
    },
  });
}

/* Re-exported for the versions overlay so the grid can offer a restore button. */
export function VersionRestoreGrid({ context, page }: { context: ScreenContext; page: Rec }) {
  return (
    <DataGrid rows={page.history.map((version, index) => ({ ...version, index }))} rowId={(row) => `${row.at}-${row.index}`} label="Page versions" filterable={false}
      columns={[
        { key: "at", header: "Saved", primary: true, cell: (row) => context.dateTime(row.at) },
        { key: "status", header: "State then", cell: (row) => <Pill>{row.status}</Pill> },
        { key: "title", header: "Title then", cell: (row) => row.title },
        { key: "published", header: "Published then", cell: (row) => (row.fields.published === true ? "Yes" : "No") },
        { key: "restore", header: "", align: "end", cell: (row) => <Button size="sm" variant="secondary" onClick={() => restoreVersion(context, page, row.index)}>Revert to this</Button> },
      ]} />
  );
}

