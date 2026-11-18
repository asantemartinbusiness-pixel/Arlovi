import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Knowledge fixtures: sources with provenance and freshness, assertions
 * with confidence and a citation, and conflicts that a person must settle.
 * Nothing here is marked verified without a source record behind it.
 * ------------------------------------------------------------------ */

registerSeed("brain", (ctx) => {
  const at = (days: number, hours = 0) =>
    new Date(new Date(ctx.now).getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();
  const day = (days: number) => at(days).slice(0, 10);

  const source = (n: number, title: string, input: {
    kind: "file" | "website" | "integration" | "media";
    status: string;
    summary: string;
    classification: "public" | "internal" | "confidential";
    owner: string;
    freshnessDays: number;
    scanned?: boolean;
    pages?: number;
    extracted?: string[];
    note?: string;
  }) => ctx.rec({
    org: "nl", collection: "sources", n, title, status: input.status, owner: input.owner,
    summary: input.summary, at: at(input.freshnessDays),
    fields: {
      kind: input.kind,
      classification: input.classification,
      freshness: day(input.freshnessDays),
      scanned: input.scanned ?? false,
      pages: input.pages ?? 0,
      indexing: input.status,
    },
    body: { extracted: input.extracted ?? [], note: input.note ?? "" },
  });

  const fact = (n: number, title: string, input: {
    status: "verified" | "proposed" | "conflicting" | "expired";
    summary: string;
    subject: string;
    predicate: string;
    value: string;
    sourceId: string;
    domain: string;
    owner: string;
    validFromDays: number;
    validToDays?: number;
    confidence: number;
  }) => ctx.rec({
    org: "nl", collection: "facts", n, title, status: input.status, owner: input.owner,
    summary: input.summary, at: at(input.validFromDays),
    fields: {
      confidence: input.status,
      confidenceScore: input.confidence,
      sourceId: input.sourceId,
      subject: input.subject,
      predicate: input.predicate,
      value: input.value,
      domain: input.domain,
      validFrom: day(input.validFromDays),
      validTo: input.validToDays === undefined ? "" : day(input.validToDays),
    },
  });

  const records: Rec[] = [
    source(60, "Trade price list — November", {
      kind: "file", status: "indexed", classification: "internal", owner: "Maya Chen", freshnessDays: -13, scanned: true, pages: 4,
      summary: "Signed-off price sheet for trade accounts, parsed in this browser.",
      extracted: ["Arc Lamp — £900 ex VAT", "Pendant trio — £1,450 ex VAT", "Collar spare — £38 ex VAT"],
    }),
    source(61, "Showroom opening hours board", {
      kind: "media", status: "review", classification: "public", owner: "Priya Shah", freshnessDays: -4, scanned: true,
      summary: "Photograph of the board by the door. Text typed in by hand.",
      extracted: ["Tue–Fri 10:00–18:00", "Saturday 10:00–17:00"],
      note: "The typed hours disagree with the location record, which is why a conflict is open.",
    }),
    source(62, "northline.example trade page", {
      kind: "website", status: "indexed", classification: "public", owner: "Priya Shah", freshnessDays: -30, scanned: true,
      summary: "Saved copy of the public trade page as it stood a month ago.",
      extracted: ["Prices shown excluding VAT", "Lead time 4 weeks"],
      note: "A saved copy, not a live fetch: nothing in this browser can re-crawl the page.",
    }),
    source(63, "Thames Brass supply agreement", {
      kind: "file", status: "indexed", classification: "confidential", owner: "Maya Chen", freshnessDays: -60, scanned: true, pages: 9,
      summary: "Supply agreement under review. Payment terms and the sole-source clause were extracted.",
      extracted: ["Payment terms: 30 days", "No exclusivity granted to Northline", "Collar price fixed for 6 months"],
    }),
    source(64, "Bank statement export — October", {
      kind: "file", status: "quarantined", classification: "confidential", owner: "Jonah Adeyemi", freshnessDays: -14, scanned: false,
      summary: "CSV export dropped into intake. Held until a person reviews it.",
      note: "No scanner is connected, so the file is isolated and excluded from retrieval until a person marks it reviewed.",
    }),
    source(65, "Glaze supplier catalogue", {
      kind: "file", status: "failed", classification: "internal", owner: "Maya Chen", freshnessDays: -2, scanned: false,
      summary: "Parsing stopped: the file declares 1,400 pages and no page text could be read.",
      note: "Isolated and reported rather than partially indexed.",
    }),
    source(66, "Accounting system export", {
      kind: "integration", status: "not_connected", classification: "confidential", owner: "Jonah Adeyemi", freshnessDays: -45, scanned: false,
      summary: "A linked accounting service would refresh ledger figures. Nothing is connected.",
      note: "The last figures came from a manual export, so their age is the export date, not today.",
    }),
    source(67, "Customer care article set", {
      kind: "file", status: "indexed", classification: "internal", owner: "Priya Shah", freshnessDays: -20, scanned: true, pages: 11,
      summary: "Approved replies for shades, lead times and warranty.",
      extracted: ["Warranty: 24 months on shades", "Replacement shade lead time: 3 weeks"],
    }),
    source(68, "Studio voice and tone note", {
      kind: "file", status: "indexed", classification: "internal", owner: "Maya Chen", freshnessDays: -90, scanned: true, pages: 2,
      summary: "Two pages on how Northline writes. The brand voice rules cite this.",
      extracted: ["Warm, precise, never theatrical", "No superlatives in trade copy"],
    }),
    source(69, "Winter run production notes", {
      kind: "media", status: "review", classification: "internal", owner: "Maya Chen", freshnessDays: -6, scanned: true,
      summary: "Photographs of the bench notes for the winter run.",
      extracted: ["Collar batch 42 approved", "Warm glaze approved for winter"],
    }),

    fact(60, "Arc Lamp trade price", {
      status: "verified", summary: "£900 excluding VAT for trade accounts, effective 1 November.",
      subject: "Arc Lamp", predicate: "trade price", value: "£900 ex VAT", sourceId: "nl-sources-060",
      domain: "pricing", owner: "Maya Chen", validFromDays: -13, confidence: 95,
    }),
    fact(61, "Pendant trio trade price", {
      status: "verified", summary: "£1,450 excluding VAT, from the November price list.",
      subject: "Pendant trio", predicate: "trade price", value: "£1,450 ex VAT", sourceId: "nl-sources-060",
      domain: "pricing", owner: "Maya Chen", validFromDays: -13, confidence: 95,
    }),
    fact(62, "Saturday closing time", {
      status: "conflicting", summary: "The board photograph says 17:00; the location record says 18:00.",
      subject: "Showroom", predicate: "Saturday closing time", value: "17:00", sourceId: "nl-sources-061",
      domain: "operations", owner: "Priya Shah", validFromDays: -4, confidence: 45,
    }),
    fact(63, "Supplier payment terms", {
      status: "verified", summary: "Thames Brass invoices are due 30 days after issue.",
      subject: "Thames Brass", predicate: "payment terms", value: "30 days", sourceId: "nl-sources-063",
      domain: "supply", owner: "Jonah Adeyemi", validFromDays: -60, confidence: 90,
    }),
    fact(64, "Brass collar price fixed until spring", {
      status: "verified", summary: "The collar price is fixed for six months from the agreement date.",
      subject: "Brass collar", predicate: "price fixed until", value: day(120), sourceId: "nl-sources-063",
      domain: "supply", owner: "Maya Chen", validFromDays: -60, validToDays: 120, confidence: 85,
    }),
    fact(65, "Shade warranty", {
      status: "verified", summary: "24 months on shades, from the approved article set.",
      subject: "Shade", predicate: "warranty", value: "24 months", sourceId: "nl-sources-067",
      domain: "care", owner: "Priya Shah", validFromDays: -20, confidence: 90,
    }),
    fact(66, "Replacement shade lead time", {
      status: "proposed", summary: "Three weeks, taken from the article set but not confirmed against production.",
      subject: "Replacement shade", predicate: "lead time", value: "3 weeks", sourceId: "nl-sources-067",
      domain: "care", owner: "Priya Shah", validFromDays: -20, confidence: 60,
    }),
    fact(67, "Public lead time", {
      status: "expired", summary: "Four weeks on the saved trade page. The page copy is a month old.",
      subject: "Northline", predicate: "published lead time", value: "4 weeks", sourceId: "nl-sources-062",
      domain: "operations", owner: "Priya Shah", validFromDays: -30, validToDays: -3, confidence: 40,
    }),
    fact(68, "October closing bank balance", {
      status: "proposed", summary: "A figure appears in the quarantined statement export. It is not usable until the file is reviewed.",
      subject: "Operating bank", predicate: "closing balance", value: "Unavailable — source quarantined", sourceId: "nl-sources-064",
      domain: "finance", owner: "Jonah Adeyemi", validFromDays: -14, confidence: 20,
    }),
    fact(69, "Winter glaze approved", {
      status: "verified", summary: "The warm glaze is approved for the winter run.",
      subject: "Winter run", predicate: "glaze", value: "Warm", sourceId: "nl-sources-069",
      domain: "production", owner: "Maya Chen", validFromDays: -6, confidence: 80,
    }),
    fact(70, "Brand voice rule", {
      status: "verified", summary: "Warm, precise, never theatrical. No superlatives in trade copy.",
      subject: "Northline", predicate: "voice", value: "Warm, precise, never theatrical", sourceId: "nl-sources-068",
      domain: "brand", owner: "Maya Chen", validFromDays: -90, confidence: 85,
    }),
    fact(71, "Collar spare price", {
      status: "proposed", summary: "£38 ex VAT in the price list. Nobody has confirmed it against a sale.",
      subject: "Collar spare", predicate: "trade price", value: "£38 ex VAT", sourceId: "nl-sources-060",
      domain: "pricing", owner: "Maya Chen", validFromDays: -13, confidence: 55,
    }),

    ctx.rec({
      org: "nl", collection: "conflicts", n: 60, title: "Saturday closing time",
      status: "open", owner: "Priya Shah",
      summary: "The board photograph and the location record disagree by an hour.",
      at: at(-4),
      fields: { domain: "operations", urgency: "high", requiresLedgerReview: false, factId: "nl-facts-062" },
      body: {
        options: [
          { id: "o1", value: "17:00", factId: "nl-facts-062", sourceId: "nl-sources-061", recordedAt: day(-4), note: "Typed from the photograph of the board." },
          { id: "o2", value: "18:00", factId: "", sourceId: "nl-locations-001", recordedAt: day(-40), note: "The location record, last edited when the showroom opened." },
        ],
        affected: ["nl-agents-004", "nl-agents-001"],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conflicts", n: 61, title: "October bank balance",
      status: "open", owner: "Jonah Adeyemi",
      summary: "The quarantined export and the posted journals do not agree.",
      at: at(-13),
      fields: { domain: "finance", urgency: "critical", requiresLedgerReview: true },
      body: {
        options: [
          { id: "o1", value: "From the statement export", factId: "nl-facts-068", sourceId: "nl-sources-064", recordedAt: day(-14), note: "File is quarantined and unscanned." },
          { id: "o2", value: "From posted journals", factId: "", sourceId: "nl-journals-001", recordedAt: day(-13), note: "Trial balance from this workspace." },
        ],
        affected: ["nl-agents-002"],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conflicts", n: 62, title: "Published lead time",
      status: "in_review", owner: "Priya Shah",
      summary: "The saved page says four weeks; production notes imply three for shades.",
      at: at(-3),
      fields: { domain: "operations", urgency: "medium", requiresLedgerReview: false },
      body: {
        options: [
          { id: "o1", value: "4 weeks", factId: "nl-facts-067", sourceId: "nl-sources-062", recordedAt: day(-30), note: "Saved page copy, now expired." },
          { id: "o2", value: "3 weeks for shades", factId: "nl-facts-066", sourceId: "nl-sources-067", recordedAt: day(-20), note: "Article set; covers shades only." },
        ],
        affected: ["nl-agents-004"],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conflicts", n: 63, title: "Collar spare price",
      status: "resolved", owner: "Maya Chen",
      summary: "Settled on the price list figure; the older quote line was superseded.",
      at: at(-10),
      fields: { domain: "pricing", urgency: "low", requiresLedgerReview: false, chosen: "nl-facts-071", resolvedBy: "Maya Chen", resolvedAt: day(-10) },
      body: {
        options: [
          { id: "o1", value: "£38 ex VAT", factId: "nl-facts-071", sourceId: "nl-sources-060", recordedAt: day(-13), note: "Price list." },
          { id: "o2", value: "£34 ex VAT", factId: "", sourceId: "nl-quotes-001", recordedAt: day(-45), note: "Old quote line." },
        ],
        affected: [],
      },
    }),

    ctx.rec({
      org: "nl", collection: "decisions", n: 60, title: "Hold distribution inside the workspace",
      status: "approved", owner: "Maya Chen", at: at(-5),
      summary: "Launch material is drafted and approved locally; distribution needs its own mission and grants.",
      fields: { approvers: "Maya Chen,Priya Shah", missionId: "nl-missions-001", domain: "operations", approvedAt: day(-5) },
      body: {
        rationale: "No mail or hosting connection exists. Drafting locally keeps the record honest and avoids a half-sent campaign.",
        alternatives: ["Wait for a mail connection before drafting", "Draft and send manually from a personal mailbox"],
        outcome: "Mission scope now ends at an approved draft.",
      },
    }),
    ctx.rec({
      org: "nl", collection: "decisions", n: 61, title: "Quarantine unscanned uploads",
      status: "approved", owner: "Jonah Adeyemi", at: at(-12),
      summary: "Uploads stay out of retrieval until a person reviews them, because no scanner is connected.",
      fields: { approvers: "Maya Chen,Jonah Adeyemi", domain: "knowledge", approvedAt: day(-12) },
      body: {
        rationale: "An unscanned file cannot be treated as safe content. Isolation is the honest default.",
        alternatives: ["Index everything immediately", "Refuse uploads entirely"],
        outcome: "Two files are isolated today.",
      },
    }),
    ctx.rec({
      org: "nl", collection: "decisions", n: 62, title: "Second brass supplier",
      status: "proposed", owner: "Maya Chen", at: at(-2),
      summary: "Qualify a second collar supplier before the winter run. Awaiting the research review.",
      fields: { approvers: "", domain: "supply", researchId: "nl-research-061" },
      body: {
        rationale: "One open risk records a sole source. The research workspace reports no delivery history, so the case rests on exposure, not on a predicted delay.",
        alternatives: ["Carry the risk for one run", "Hold more collar stock"],
        outcome: "",
      },
    }),
    ctx.rec({
      org: "nl", collection: "decisions", n: 63, title: "Show retail prices including VAT",
      status: "superseded", owner: "Maya Chen", at: at(-200),
      summary: "Replaced by the current ex-VAT decision for trade, kept visible for audit.",
      fields: { approvers: "Maya Chen", domain: "pricing", supersededBy: "nl-decisions-001", approvedAt: day(-200) },
      body: {
        rationale: "Retail-first pricing made sense before the trade list existed.",
        alternatives: [],
        outcome: "Superseded. Quotes and the site now show ex VAT with VAT on the invoice.",
      },
    }),

    ctx.rec({
      org: "nl", collection: "policies", n: 60, title: "Knowledge sensitivity groups",
      status: "active", owner: "Maya Chen",
      summary: "Three groups: public, internal and confidential. Confidential sources are excluded from agent retrieval.",
      fields: { kind: "sensitivity", residency: "This browser only", retrievalDefault: "internal" },
      body: {
        groups: [
          { id: "public", label: "Public", roles: ["owner", "finance", "sales", "people", "member", "client"], agents: true },
          { id: "internal", label: "Internal", roles: ["owner", "finance", "sales", "people", "member"], agents: true },
          { id: "confidential", label: "Confidential", roles: ["owner", "finance"], agents: false },
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "policies", n: 61, title: "Agent source grants",
      status: "active", owner: "Maya Chen",
      summary: "Which AI employee may read which source group.",
      fields: { kind: "grants" },
      body: {
        grants: [
          { agentId: "nl-agents-001", groups: ["public", "internal"], note: "Chief of Staff reads internal knowledge, not confidential files." },
          { agentId: "nl-agents-002", groups: ["public", "internal", "confidential"], note: "Finance agent may read the supply agreement and exports." },
          { agentId: "nl-agents-003", groups: ["public", "internal"], note: "Creative agent reads brand and product knowledge." },
          { agentId: "nl-agents-004", groups: ["public"], note: "Care agent answers only from approved articles." },
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "policies", n: 62, title: "Knowledge retention schedule",
      status: "active", owner: "Jonah Adeyemi",
      summary: "Sources are kept six years; conversations two years unless a legal hold is set.",
      fields: { kind: "retention", sourceYears: 6, conversationYears: 2 },
      body: { holds: [{ id: "nl-conversations-063", reason: "Supplier dispute correspondence", setBy: "Maya Chen", at: day(-21) }] },
    }),

    ctx.rec({
      org: "nl", collection: "brands", n: 60, title: "Trade variant",
      status: "proposed", owner: "Sable Nguyen",
      summary: "Proposed extraction from the voice note and the saved trade page. Not applied to approved tokens.",
      fields: { variant: "trade", extractedFrom: "nl-sources-068", approved: false },
      body: {
        voice: "Plain, specific, no superlatives.",
        colours: [{ name: "Cobalt", value: "#234FE8", approved: true }, { name: "Slate ink", value: "#1B2437", approved: false }],
        rules: [
          { id: "r1", rule: "No superlatives in trade copy", source: "nl-sources-068", status: "approved" },
          { id: "r2", rule: "Prices shown excluding VAT in trade material", source: "nl-decisions-001", status: "approved" },
          { id: "r3", rule: "Use sentence case in headings", source: "nl-sources-062", status: "proposed" },
        ],
      },
    }),

    ctx.rec({
      org: "nl", collection: "graphLinks", n: 60, title: "Harrow House buys Arc Lamp",
      status: "confirmed", summary: "Confirmed by the paid invoice line.",
      fields: { fromId: "nl-contacts-001", toId: "nl-products-001", kind: "purchases", confidence: 90, sourceId: "nl-invoices-001" },
    }),
    ctx.rec({
      org: "nl", collection: "graphLinks", n: 61, title: "Thames Brass supplies collars",
      status: "confirmed", summary: "From the supply agreement.",
      fields: { fromId: "nl-suppliers-001", toId: "nl-products-001", kind: "supplies", confidence: 85, sourceId: "nl-sources-063" },
    }),
    ctx.rec({
      org: "nl", collection: "graphLinks", n: 62, title: "Harrow House and Harrow House Ltd may be one account",
      status: "candidate", summary: "Two records with similar names and one shared address line.",
      fields: { fromId: "nl-contacts-001", toId: "nl-companies-001", kind: "same_as", confidence: 55, sourceId: "" },
    }),
    ctx.rec({
      org: "nl", collection: "graphLinks", n: 63, title: "Maya Chen owns the pricing decision",
      status: "confirmed", summary: "Recorded on the decision.",
      fields: { fromId: "nl-members-001", toId: "nl-decisions-001", kind: "owns", confidence: 100, sourceId: "nl-decisions-001" },
    }),
    ctx.rec({
      org: "nl", collection: "graphLinks", n: 64, title: "Showroom hours link is unresolved",
      status: "exception", summary: "The hours fact points at two sources that disagree.",
      fields: { fromId: "nl-locations-001", toId: "nl-facts-062", kind: "asserts", confidence: 45, sourceId: "nl-sources-061" },
    }),
  ];

  /* ---------------- Knowledge workspace: collections and records ---------------- */
  const collection = (n: number, title: string, summary: string, owner: string, reviewIntervalDays: number) => ctx.rec({
    org: "nl", collection: "knowledgeCollections", n, title, status: "active", owner, summary, fields: { reviewIntervalDays },
  });
  const review = (id: string, days: number, by: string, action: string, note = "", extra: Record<string, string> = {}) => ({ id, at: at(days), by, action, note, ...extra });
  const knowledge = (n: number, title: string, input: {
    status: "draft" | "needs_review" | "verified" | "archived";
    collectionId: string;
    owner: string;
    summary: string;
    content: string;
    provenance?: "human" | "model_generated" | "imported";
    reviewer?: string;
    lastReviewedDays?: number;
    dueDays?: number;
    tags?: string[];
    sources?: { id: string; sourceId?: string; label: string; locator?: string }[];
    related?: string[];
    reviews: ReturnType<typeof review>[];
  }) => ctx.rec({
    org: "nl", collection: "knowledge", n, title, status: input.status, owner: input.owner, summary: input.summary,
    tags: input.tags ?? [], dueAt: input.dueDays === undefined ? undefined : at(input.dueDays),
    createdAt: input.reviews[0]?.at,
    fields: {
      collectionId: input.collectionId,
      provenance: input.provenance ?? "human",
      reviewer: input.reviewer ?? "",
      ...(input.lastReviewedDays === undefined ? {} : { lastReviewedAt: at(input.lastReviewedDays), lastReviewedBy: input.reviewer ?? input.owner }),
    },
    body: { content: input.content, sources: input.sources ?? [], related: input.related ?? [], reviews: input.reviews },
  });

  records.push(
    collection(1, "Customer care answers", "Approved answers the care team gives about shades, lead times and warranty.", "Priya Shah", 60),
    collection(2, "Operations procedures", "How the workshop and showroom run day to day.", "Theo Marsh", 120),
    collection(3, "Trade and pricing", "How trade pricing works and who approves a change.", "Maya Chen", 45),
    knowledge(1, "Shade warranty: what we cover", {
      status: "verified", collectionId: "nl-knowledgeCollections-001", owner: "Priya Shah", reviewer: "Maya Chen", lastReviewedDays: -20,
      summary: "Shades carry a 24-month warranty from delivery. Fittings and bulbs are excluded.",
      content: "Every shade carries a 24-month warranty from the delivery date.\n\nCovered: glaze crazing, seam failure, fixing collar defects.\nNot covered: bulbs, accidental damage, fittings installed by a third party.\n\nAsk for the order number and a photograph before promising a replacement.",
      tags: ["warranty", "care"],
      sources: [{ id: "s1", sourceId: "nl-sources-067", label: "Customer care article set", locator: "Article 3" }],
      related: ["nl-facts-065", "nl-knowledge-002"],
      reviews: [review("k1a", -40, "Priya Shah", "created"), review("k1b", -21, "Priya Shah", "requested", "", { reviewer: "Maya Chen" }), review("k1c", -20, "Maya Chen", "approved", "Checked against the article set.")],
    }),
    knowledge(2, "Replacement shade lead time", {
      status: "needs_review", collectionId: "nl-knowledgeCollections-001", owner: "Priya Shah", reviewer: "Theo Marsh", dueDays: 3,
      summary: "Three weeks for a replacement shade, pending confirmation from the workshop.",
      content: "Quote three weeks for a replacement shade from the day the order is confirmed.\n\nThe workshop has not yet confirmed this against the current production schedule.",
      tags: ["lead time", "care"],
      sources: [{ id: "s1", sourceId: "nl-sources-067", label: "Customer care article set", locator: "Article 5" }],
      related: ["nl-facts-066", "nl-knowledge-001"],
      reviews: [review("k2a", -6, "Priya Shah", "created"), review("k2b", -4, "Priya Shah", "requested", "Please confirm against the winter run.", { reviewer: "Theo Marsh", dueAt: at(3) })],
    }),
    knowledge(3, "Answering a trade price question", {
      status: "needs_review", collectionId: "nl-knowledgeCollections-003", owner: "Maya Chen", provenance: "model_generated", reviewer: "Maya Chen", dueDays: -2,
      summary: "Draft reply pasted in from an assistant outside this workspace. No source cited yet.",
      content: "Thank you for asking about trade pricing. Our trade prices are shown excluding VAT and are available to registered trade accounts. Please contact the studio for the current price list.",
      tags: ["trade", "pricing"],
      reviews: [review("k3a", -9, "Jonah Adeyemi", "created", "Pasted in as model-generated text."), review("k3b", -8, "Jonah Adeyemi", "requested", "", { reviewer: "Maya Chen", dueAt: at(-2) })],
    }),
    knowledge(4, "Who approves a trade price change", {
      status: "verified", collectionId: "nl-knowledgeCollections-003", owner: "Maya Chen", reviewer: "Jonah Adeyemi", lastReviewedDays: -70,
      summary: "Maya Chen approves trade price changes; finance records the effective date.",
      content: "A trade price change is proposed in the price list, approved by Maya Chen and given an effective date by finance.\n\nNo price is quoted to a customer before its effective date.",
      tags: ["pricing", "approval"],
      sources: [{ id: "s1", sourceId: "nl-sources-060", label: "Trade price list — November" }],
      related: ["nl-decisions-060", "nl-facts-060"],
      reviews: [review("k4a", -95, "Maya Chen", "created"), review("k4b", -70, "Jonah Adeyemi", "approved")],
    }),
    knowledge(5, "Opening the showroom on a Saturday", {
      status: "draft", collectionId: "nl-knowledgeCollections-002", owner: "Theo Marsh",
      summary: "Checklist for the Saturday opener. Closing time is disputed and left out.",
      content: "1. Disarm the alarm and switch on the display lighting.\n2. Check the board by the door shows the correct hours.\n3. Open the till and count the float.\n\nClosing time: not written here until the open conflict on Saturday hours is resolved.",
      tags: ["showroom"],
      sources: [{ id: "s1", sourceId: "nl-sources-061", label: "Showroom opening hours board" }],
      related: ["nl-facts-062"],
      reviews: [review("k5a", -3, "Theo Marsh", "created")],
    }),
    knowledge(6, "Receiving a brass delivery", {
      status: "verified", collectionId: "nl-knowledgeCollections-002", owner: "Theo Marsh", reviewer: "Maya Chen", lastReviewedDays: -30,
      summary: "Count, check the batch number, and record the goods receipt the same day.",
      content: "Count the collars against the delivery note.\nCheck the batch number matches the approved batch.\nRecord the goods receipt the same day. Payment terms are 30 days from invoice.",
      tags: ["supplier", "workshop"],
      sources: [{ id: "s1", sourceId: "nl-sources-063", label: "Thames Brass supply agreement", locator: "Clause 4" }, { id: "s2", label: "Bench notes, winter run", locator: "Batch 42" }],
      related: ["nl-facts-063"],
      reviews: [review("k6a", -60, "Theo Marsh", "created"), review("k6b", -30, "Maya Chen", "approved")],
    }),
    knowledge(7, "Retail prices including VAT", {
      status: "archived", collectionId: "nl-knowledgeCollections-003", owner: "Maya Chen",
      summary: "Superseded: retail prices are no longer shown including VAT in trade material.",
      content: "Show retail prices including VAT on every price list.",
      tags: ["pricing"],
      related: ["nl-decisions-063"],
      reviews: [review("k7a", -210, "Maya Chen", "created"), review("k7b", -190, "Maya Chen", "archived", "Superseded by the trade pricing decision.")],
    }),
  );

  return { records, events: [] };
});
