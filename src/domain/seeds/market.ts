import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/** Team 4 id block: every fixture id sits at nl-<collection>-6NN so it cannot
 *  collide with another workstream's contributor. */
const B = 600;

/* ====================================================================== *
 * MARKET fixtures — campaigns, scheduled content, audiences, templates and
 * landing pages for Northline Atelier. Nothing has been published to a
 * provider: every delivery field records the local state instead.
 * ====================================================================== */

const shift = (now: string, days: number, hour = 9, minute = 0) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

registerSeed("market", (ctx) => {
  const records: Rec[] = [];
  const rec = (input: Parameters<typeof ctx.rec>[0]) => ctx.rec({ ...input, n: input.n + B });
  const id = (org: "nl" | "hb", collection: string, n: number) => ctx.id(org, collection, n + B);
  const now = ctx.now;
  const CAMP = (n: number) => id("nl", "campaigns", n);
  const AUD = (n: number) => id("nl", "audiences", n);

  /* ---------------- Campaigns ---------------- */
  const campaigns: {
    n: number; title: string; status: string; objective: string; start: number; end: number;
    budget: number; spent: number; audience: number; owner: string; summary: string;
    channels: { network: string; budgetMinor: number; spentMinor: number; impressions: number; clicks: number; conversions: number; revenueMinor: number }[];
    creatives: { id: string; title: string; kind: string; status: string }[];
    approval: string;
  }[] = [
    { n: 20, title: "Winter trade list 2026", status: "active", objective: "Trade enquiries", start: -21, end: 24, budget: 480_000, spent: 196_400, audience: 20, owner: "Priya Shah",
      summary: "Email, showroom invitations and paid search for the winter trade range.",
      approval: "approved",
      channels: [
        { network: "email", budgetMinor: 60_000, spentMinor: 0, impressions: 412, clicks: 96, conversions: 11, revenueMinor: 1_842_000 },
        { network: "search", budgetMinor: 260_000, spentMinor: 142_400, impressions: 38_400, clicks: 1_210, conversions: 9, revenueMinor: 974_000 },
        { network: "instagram", budgetMinor: 160_000, spentMinor: 54_000, impressions: 92_100, clicks: 2_240, conversions: 4, revenueMinor: 412_000 },
      ],
      creatives: [
        { id: "cr-1", title: "Beacon on grey — square", kind: "image", status: "approved" },
        { id: "cr-2", title: "Winter trade list — email hero", kind: "image", status: "approved" },
        { id: "cr-3", title: "Showroom walkthrough — 20s", kind: "video", status: "in_review" },
      ] },
    { n: 21, title: "Clerkenwell open studio", status: "approval", objective: "Showroom visits", start: 10, end: 38, budget: 220_000, spent: 0, audience: 21, owner: "Priya Shah",
      summary: "Invitation sequence for the December open studio weekend.",
      approval: "awaiting_approval",
      channels: [
        { network: "email", budgetMinor: 20_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
        { network: "instagram", budgetMinor: 200_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
      ],
      creatives: [{ id: "cr-4", title: "Open studio — carousel", kind: "image", status: "draft" }] },
    { n: 22, title: "Drift Pendant launch", status: "draft", objective: "Product launch", start: 28, end: 70, budget: 310_000, spent: 0, audience: 22, owner: "Maya Chen",
      summary: "Launch plan for the three new drop lengths. Nothing scheduled yet.",
      approval: "draft",
      channels: [
        { network: "email", budgetMinor: 30_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
        { network: "search", budgetMinor: 180_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
        { network: "linkedin", budgetMinor: 100_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
      ],
      creatives: [] },
    { n: 23, title: "Autumn restock reminder", status: "completed", objective: "Repeat orders", start: -92, end: -54, budget: 180_000, spent: 174_800, audience: 20, owner: "Priya Shah",
      summary: "Finished in October. Kept for the attribution comparison.",
      approval: "approved",
      channels: [
        { network: "email", budgetMinor: 20_000, spentMinor: 0, impressions: 388, clicks: 104, conversions: 14, revenueMinor: 1_205_000 },
        { network: "search", budgetMinor: 160_000, spentMinor: 174_800, impressions: 41_900, clicks: 1_402, conversions: 12, revenueMinor: 1_380_000 },
      ],
      creatives: [{ id: "cr-5", title: "Autumn restock — email hero", kind: "image", status: "approved" }] },
    { n: 24, title: "Hotel fitout outreach", status: "active", objective: "Pipeline", start: -7, end: 52, budget: 150_000, spent: 18_200, audience: 24, owner: "Maya Chen",
      summary: "Direct outreach to hotel groups with a specification pack.",
      approval: "approved",
      channels: [
        { network: "linkedin", budgetMinor: 150_000, spentMinor: 18_200, impressions: 7_410, clicks: 182, conversions: 2, revenueMinor: 3_120_000 },
      ],
      creatives: [{ id: "cr-6", title: "Specification pack cover", kind: "document", status: "approved" }] },
  ];

  for (const campaign of campaigns) {
    records.push(rec({
      org: "nl", collection: "campaigns", n: campaign.n, title: campaign.title,
      status: campaign.status, summary: campaign.summary, owner: campaign.owner,
      amountMinor: campaign.budget,
      at: shift(now, campaign.start, 9),
      startAt: shift(now, campaign.start, 9),
      endAt: shift(now, campaign.end, 18),
      tags: [campaign.objective.toLowerCase().replace(/\s+/g, "-")],
      fields: {
        objective: campaign.objective,
        budgetMinor: campaign.budget,
        spentMinor: campaign.spent,
        audienceId: AUD(campaign.audience),
        approval: campaign.approval,
        delivery: "not_connected",
        primaryChannel: campaign.channels[0]?.network ?? "email",
      },
      body: {
        brief: `${campaign.summary} Figures below come from records in this workspace, never from an ad platform.`,
        channels: campaign.channels,
        creatives: campaign.creatives,
        touches: campaign.channels.map((channel) => ({ network: channel.network, firstTouch: Math.round(channel.conversions * 0.4), lastTouch: Math.round(channel.conversions * 0.5), assisted: channel.conversions })),
      },
    }));
  }

  /* ---------------- Audiences ---------------- */
  const audiences: { n: number; title: string; summary: string; rules: { field: string; op: string; value: string }[]; exclusions: string[] }[] = [
    { n: 20, title: "Trade accounts with consent", summary: "Trade segment holding marketing consent.",
      rules: [{ field: "segment", op: "is", value: "trade" }, { field: "consentEmail", op: "is", value: "true" }], exclusions: ["suppressed"] },
    { n: 21, title: "London retail, last 90 days", summary: "Retail buyers in London who ordered recently.",
      rules: [{ field: "segment", op: "is", value: "retail" }, { field: "city", op: "is", value: "London" }, { field: "orderedWithinDays", op: "lte", value: "90" }], exclusions: ["suppressed"] },
    { n: 22, title: "Lapsed buyers", summary: "Ordered once, nothing in the last 180 days.",
      rules: [{ field: "orderedWithinDays", op: "gt", value: "180" }], exclusions: ["suppressed", "no_marketing_consent"] },
    { n: 23, title: "Newsletter subscribers", summary: "Everyone who opted into the newsletter tag.",
      rules: [{ field: "tag", op: "has", value: "newsletter" }], exclusions: ["suppressed"] },
    { n: 24, title: "High value trade", summary: "Trade accounts above five thousand lifetime.",
      rules: [{ field: "segment", op: "is", value: "trade" }, { field: "spendMinor", op: "gte", value: "500000" }], exclusions: ["suppressed"] },
  ];
  for (const audience of audiences) {
    records.push(rec({
      org: "nl", collection: "audiences", n: audience.n, title: audience.title, summary: audience.summary,
      status: "active",
      fields: { consentRequired: true, source: "workspace contacts", sync: "not_connected", lastCountedAt: now },
      body: { rules: audience.rules, exclusions: audience.exclusions },
    }));
  }

  /* ---------------- Social posts ---------------- */
  const posts: { n: number; title: string; network: string; days: number; hour: number; status: string; campaign?: number; caption: string; media: string; url?: string; error?: string }[] = [
    { n: 20, title: "Beacon in the showroom", network: "instagram", days: -6, hour: 9, status: "published", campaign: 20,
      caption: "Beacon, spun in Clerkenwell this week. Natural brass, weighted base, trade pricing on request.", media: "beacon-grey.jpg", url: "local://published/ig-8841" },
    { n: 21, title: "Halo sconce detail", network: "instagram", days: -3, hour: 12, status: "published", campaign: 20,
      caption: "Halo, double arm. The arms pivot so a stairwell can be lit without glare.", media: "halo-detail.jpg", url: "local://published/ig-8853" },
    { n: 22, title: "Drift drop lengths", network: "instagram", days: 2, hour: 9, status: "scheduled", campaign: 22,
      caption: "Three drops, one pendant. Which length for a 2.7m ceiling? Reply and we will spec it.", media: "drift-three.jpg" },
    { n: 23, title: "Open studio save the date", network: "facebook", days: 4, hour: 17, status: "scheduled", campaign: 21,
      caption: "Open studio, the first weekend of December. Coffee, offcuts and the winter range.", media: "studio-door.jpg" },
    { n: 24, title: "Specification pack", network: "linkedin", days: 1, hour: 8, status: "scheduled", campaign: 24,
      caption: "Our 2027 specification pack is ready for hotel and hospitality projects. Lead times, finishes, IP ratings.", media: "spec-cover.pdf" },
    { n: 25, title: "Brass offcut giveaway", network: "instagram", days: 8, hour: 11, status: "draft",
      caption: "Offcut bundles for makers. Caption needs the terms before this goes anywhere.", media: "offcuts.jpg" },
    { n: 26, title: "Trade day reminder", network: "x", days: -1, hour: 14, status: "failed", campaign: 20,
      caption: "Trade day tomorrow from ten. Bring your plans.", media: "", error: "No account is connected, so the scheduled time passed with the post unsent." },
    { n: 27, title: "Restoration guide", network: "facebook", days: -11, hour: 10, status: "published", campaign: 23,
      caption: "Our restoration guide is back in print. Twelve pounds, zero rated, free with any trade order.", media: "guide-cover.jpg", url: "local://published/fb-2210" },
    { n: 28, title: "Workshop in winter", network: "instagram", days: 6, hour: 15, status: "scheduled", campaign: 21,
      caption: "Cold mornings, warm metal. A look at the winter bench.", media: "bench.jpg" },
    { n: 29, title: "Hoxton Rooms case study", network: "linkedin", days: 11, hour: 9, status: "scheduled", campaign: 24,
      caption: "Forty-four sconces across two floors at the Hoxton Rooms. Case study in the comments.", media: "hoxton.jpg" },
  ];
  for (const post of posts) {
    records.push(rec({
      org: "nl", collection: "socialPosts", n: post.n, title: post.title,
      status: post.status,
      summary: post.status === "published"
        ? "Recorded as published locally. No social account is connected, so there is no external post."
        : post.status === "failed"
          ? "The scheduled time passed without a connected account."
          : "Scheduled in this workspace only.",
      startAt: shift(now, post.days, post.hour),
      at: shift(now, post.days, post.hour),
      tags: [post.network],
      fields: {
        network: post.network,
        campaignId: post.campaign ? CAMP(post.campaign) : "",
        delivery: post.status === "published" ? "ready_local" : post.status === "failed" ? "failed" : "queued_local",
        externalRef: post.url ?? "",
        error: post.error ?? "",
        mediaName: post.media,
        approval: post.status === "draft" ? "draft" : "approved",
      },
      body: { caption: post.caption, media: post.media ? [{ name: post.media, kind: post.media.endsWith(".pdf") ? "document" : "image" }] : [], link: "" },
    }));
  }

  /* ---------------- Landing pages (sites collection) ---------------- */
  records.push(
    rec({ org: "nl", collection: "sites", n: 20, title: "Winter trade list", status: "published",
      summary: "Landing page for the trade campaign. Exported HTML only; no host is connected.",
      at: shift(now, -20, 9),
      fields: { kind: "page", slug: "winter-trade", published: true, views: 1_842, conversions: 46, campaignId: CAMP(20), variant: "A", metaTitle: "Winter trade list — Northline Atelier", metaDescription: "Trade pricing on the winter lighting range." },
      body: { blocks: [
        { id: "b1", kind: "hero", heading: "The winter trade list", body: "Twelve pieces, trade pricing, four week lead time." },
        { id: "b2", kind: "products", heading: "In the list", productSkus: ["BCN-01", "HAL-02", "DRF-03"] },
        { id: "b3", kind: "form", heading: "Request the list", fields: ["Name", "Practice", "Email"] },
      ] } }),
    rec({ org: "nl", collection: "sites", n: 21, title: "Winter trade list — variant B", status: "testing",
      summary: "Variant with the form above the product grid.",
      at: shift(now, -12, 9),
      fields: { kind: "page", slug: "winter-trade-b", published: false, views: 1_790, conversions: 61, campaignId: CAMP(20), variant: "B", metaTitle: "Winter trade list — Northline Atelier", metaDescription: "Trade pricing on the winter lighting range." },
      body: { blocks: [
        { id: "b1", kind: "hero", heading: "The winter trade list", body: "Twelve pieces, trade pricing, four week lead time." },
        { id: "b2", kind: "form", heading: "Request the list", fields: ["Name", "Practice", "Email"] },
        { id: "b3", kind: "products", heading: "In the list", productSkus: ["BCN-01", "HAL-02", "DRF-03"] },
      ] } }),
    rec({ org: "nl", collection: "sites", n: 22, title: "Open studio December", status: "draft",
      summary: "Not published. Date block still has a placeholder.",
      at: shift(now, -2, 9),
      fields: { kind: "page", slug: "open-studio", published: false, views: 0, conversions: 0, campaignId: CAMP(21), variant: "A", metaTitle: "", metaDescription: "" },
      body: { blocks: [{ id: "b1", kind: "hero", heading: "Open studio", body: "First weekend of December." }] } }),
    rec({ org: "nl", collection: "sites", n: 23, title: "northline.example — site audit", status: "active",
      summary: "Technical and content audit of the public site, run locally against the saved page model.",
      at: shift(now, -5, 7),
      fields: { kind: "audit", slug: "northline.example", published: true, issuesHigh: 2, issuesMedium: 5, issuesLow: 9, crawledPages: 34, lastRunAt: shift(now, -5, 7) },
      body: {
        issues: [
          { id: "i1", severity: "high", page: "/products/drift-pendant", title: "Missing meta description", detail: "Six product pages have no description, so the snippet is generated by the search engine.", assignee: "" },
          { id: "i2", severity: "high", page: "/", title: "Largest contentful paint 4.1s", detail: "The hero image is 2.4MB and unsized.", assignee: "Theo Marsh" },
          { id: "i3", severity: "medium", page: "/trade", title: "Duplicate H1", detail: "Two H1 elements on the trade page.", assignee: "" },
          { id: "i4", severity: "medium", page: "/products/halo-wall-sconce", title: "Thin content", detail: "84 words. Competing pages average 420.", assignee: "" },
          { id: "i5", severity: "low", page: "/about", title: "Image alt text missing", detail: "Three images carry no alternative text.", assignee: "" },
        ],
        keywords: [
          { term: "brass floor lamp uk", volume: 1_300, position: 14, difficulty: 42, page: "/products/beacon-floor-lamp" },
          { term: "trade lighting london", volume: 480, position: 6, difficulty: 31, page: "/trade" },
          { term: "linen pendant shade", volume: 920, position: 28, difficulty: 38, page: "/products/drift-pendant" },
          { term: "wall sconce stairwell", volume: 210, position: 9, difficulty: 22, page: "/products/halo-wall-sconce" },
          { term: "clerkenwell lighting studio", volume: 90, position: 2, difficulty: 11, page: "/" },
        ],
        briefs: [
          { id: "br1", title: "How to light a stairwell", stage: "drafting", owner: "Priya Shah", keyword: "wall sconce stairwell" },
          { id: "br2", title: "Choosing a pendant drop length", stage: "outline", owner: "Maya Chen", keyword: "linen pendant shade" },
        ],
      } }),
  );

  /* ---------------- Templates ---------------- */
  const templates: { n: number; title: string; kind: string; status: string; summary: string; body: unknown }[] = [
    { n: 20, title: "Trade list announcement", kind: "email", status: "approved", summary: "Seasonal trade list email with a product grid.",
      body: { subject: "The winter trade list is ready", preheader: "Twelve pieces, trade pricing", blocks: ["hero", "product-grid", "lead-time", "footer"] } },
    { n: 21, title: "Showroom invitation", kind: "email", status: "approved", summary: "Invitation with a date, address and map block.",
      body: { subject: "You are invited to the open studio", preheader: "First weekend of December", blocks: ["hero", "details", "map", "footer"] } },
    { n: 22, title: "Product carousel", kind: "post", status: "approved", summary: "Three-slide carousel caption frame for Instagram.",
      body: { caption: "{{product}} — {{one_line}}. Trade pricing on request.", slides: 3, networks: ["instagram", "facebook"] } },
    { n: 23, title: "Search ad — product", kind: "ad", status: "review", summary: "Responsive search ad skeleton with pinned brand headline.",
      body: { headlines: ["{{product}} from Northline", "Made in Clerkenwell", "Trade pricing available"], descriptions: ["Four week lead time. UK made."] } },
    { n: 24, title: "Launch campaign plan", kind: "plan", status: "approved", summary: "Six week product launch plan across email, search and social.",
      body: { weeks: 6, channels: ["email", "search", "instagram"], stages: ["tease", "launch", "proof", "reminder"] } },
    { n: 25, title: "Lead capture page", kind: "page", status: "approved", summary: "Hero, product grid and a three-field form.",
      body: { blocks: ["hero", "products", "form"], fields: ["Name", "Practice", "Email"] } },
    { n: 26, title: "Sale announcement", kind: "email", status: "archived", summary: "Retired after the summer sample sale.",
      body: { subject: "Sample sale, three days only", blocks: ["hero", "grid", "footer"] } },
  ];
  for (const template of templates) {
    records.push(rec({
      org: "nl", collection: "templates", n: template.n, title: template.title, status: template.status,
      summary: template.summary,
      tags: [template.kind],
      fields: { kind: template.kind, approval: template.status, usedBy: template.kind === "email" ? 2 : 1, brandChecked: template.status === "approved", version: 3 },
      body: template.body,
    }));
  }

  /* ---------------- Harbor ---------------- */
  records.push(
    rec({ org: "hb", collection: "campaigns", n: 20, title: "Spring dock hardware", status: "draft",
      summary: "Harbor Supply plan. Separate workspace, dollars, no shared audience.",
      amountMinor: 250_000, startAt: shift(now, 14, 9), endAt: shift(now, 60, 18),
      fields: { objective: "Repeat orders", budgetMinor: 250_000, spentMinor: 0, approval: "draft", delivery: "not_connected", primaryChannel: "email" },
      body: { brief: "Harbor only.", channels: [{ network: "email", budgetMinor: 250_000, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 }], creatives: [], touches: [] } }),
    rec({ org: "hb", collection: "audiences", n: 20, title: "Harbor marina accounts", summary: "Harbor's own contacts only.",
      fields: { consentRequired: true, source: "workspace contacts", sync: "not_connected", lastCountedAt: now },
      body: { rules: [{ field: "segment", op: "is", value: "trade" }], exclusions: ["suppressed"] } }),
  );

  return { records };
});
