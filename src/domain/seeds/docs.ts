import { registerSeed } from "@/domain/seedRegistry";
import { DEFAULT_PAGE, DEFAULT_STYLES, nextId, textBlock, type Block, type DocModel } from "@/applications/docs/model";

/* Fixtures for Documents. Ids start at n: 20 so they cannot collide with the
 * base seed. The content is what a small lighting manufacturer would really
 * be drafting — no lorem ipsum. */

function doc(blocks: Block[], extra: Partial<DocModel> = {}): DocModel {
  return {
    blocks,
    comments: [], suggestions: [], bookmarks: [],
    styles: DEFAULT_STYLES, page: DEFAULT_PAGE, references: [],
    suggestMode: false, shares: [],
    ...extra,
  };
}

registerSeed("docs", (context) => {
  const policyBlocks: Block[] = [
    textBlock("heading1", "Trade pricing and discount policy"),
    textBlock("paragraph", "This policy sets how Northline quotes trade customers. It applies to every quotation, proforma and invoice raised in the workspace. Prices are quoted excluding VAT; the VAT treatment is resolved from the customer's tax code, never from the currency on the order."),
    textBlock("heading2", "Who may approve a discount"),
    textBlock("paragraph", "Discounts up to 10% are at the account owner's discretion. Between 10% and 20% the finance view must approve the quotation before it is sent. Above 20% the owner approves, and the reason is recorded against the opportunity."),
    textBlock("bulletItem", "Up to 10% — account owner"),
    textBlock("bulletItem", "10% to 20% — finance approval recorded on the quotation"),
    textBlock("bulletItem", "Above 20% — owner approval with a written reason"),
    textBlock("heading2", "Lead times quoted to trade"),
    textBlock("paragraph", "Standard brass finishes ship in six weeks from order confirmation. Bespoke shade fabrics add two weeks. A lead time is only quoted once the finish and fabric are confirmed, because a changed finish restarts the brass polishing queue."),
    { ...textBlock("quote", "Never quote a lead time from memory. Read it from the production board and say which week it came from."), id: nextId() },
    textBlock("heading2", "Price list integrity"),
    textBlock("paragraph", "The published trade list is the only source for a quoted price. Where a customer asks for a figure that is not on the list, the quotation is raised as a bespoke line with its own cost build-up attached."),
    { ...textBlock("heading3", "Currency"), id: nextId() },
    textBlock("paragraph", "Northline quotes in pounds sterling. Harbor quotes in US dollars. A quotation is never converted between the two: a cross-border order is raised against the entity that will invoice it."),
  ];

  const proposalBlocks: Block[] = [
    textBlock("heading1", "Clerkenwell showroom — lighting proposal"),
    textBlock("paragraph", "Prepared for the Clerkenwell fit-out. Twelve Arc Lamps in brushed brass with natural linen shades, delivered in two phases so the ground floor can open before the mezzanine is complete."),
    textBlock("heading2", "Scope"),
    textBlock("numberItem", "Site survey and lux measurement across both floors"),
    textBlock("numberItem", "Twelve Arc Lamp pendants, brushed brass, 2700K"),
    textBlock("numberItem", "Phase one delivery to the ground floor"),
    textBlock("numberItem", "Phase two delivery and commissioning on the mezzanine"),
    textBlock("heading2", "Commercials"),
    textBlock("paragraph", "Unit price £900 excluding VAT on the published trade list. A 12% trade discount applies and is recorded against the opportunity with finance approval. Delivery is quoted separately once the phase dates are fixed."),
    { ...textBlock("paragraph", ""), id: nextId(), type: "table", table: { header: true, rows: [["Line", "Quantity", "Unit (ex VAT)", "Phase"], ["Arc Lamp, brushed brass", "8", "£900", "One"], ["Arc Lamp, brushed brass", "4", "£900", "Two"], ["Site survey", "1", "£450", "One"]] } },
    textBlock("heading2", "What we need from you"),
    textBlock("paragraph", "Confirm the mezzanine ceiling height and whether the existing track can be reused. Both change the drop length, and a changed drop restarts the brass queue."),
  ];

  const handbookBlocks: Block[] = [
    textBlock("heading1", "Workshop handbook"),
    textBlock("paragraph", "How the Walthamstow workshop runs: opening, the brass queue, finishing, and what to do when a batch fails inspection."),
    textBlock("heading2", "Opening the workshop"),
    textBlock("paragraph", "The extraction runs for ten minutes before any polishing starts. Check the dust bin level on the log sheet; a full bin stops the shift."),
    textBlock("heading2", "The brass queue"),
    textBlock("paragraph", "Brass moves through degrease, polish, lacquer, cure. A piece that re-enters the queue goes to the back of it, which is why a changed finish adds a week rather than a day."),
    textBlock("heading3", "Failed inspection"),
    textBlock("paragraph", "A failed piece is tagged with the batch number and the fault, photographed, and logged against the production order. It is never quietly re-polished: the fault rate is what tells us whether the lacquer batch is good."),
    textBlock("heading2", "Safety"),
    textBlock("bulletItem", "Eye protection in the polishing bay at all times"),
    textBlock("bulletItem", "No loose sleeves near the buffing wheel"),
    textBlock("bulletItem", "Lacquer only in the spray booth with extraction running"),
  ];

  return {
    records: [
      context.rec({
        org: "nl", collection: "documents", n: 320, title: "Trade pricing and discount policy",
        status: "in_review", owner: "Maya Chen",
        summary: "Governs every quotation raised in the workspace.",
        tags: ["policy", "finance"],
        fields: { kind: "policy", confidential: false, folder: "Policies", reviewCycle: "annual", approvalRequired: true },
        body: doc(policyBlocks, {
          comments: [{
            id: "docs-c20",
            anchor: { blockId: policyBlocks[3].id, start: 0, end: 46 },
            quote: "Discounts up to 10% are at the account owner's",
            author: "Jonah Adeyemi",
            at: context.now,
            body: "Finance needs the 10–20% band to require an approval record on the quotation, not an email. Can we word it as a record?",
            resolved: false,
            mandatory: true,
            replies: [],
          }],
        }),
      }),
      context.rec({
        org: "nl", collection: "documents", n: 321, title: "Clerkenwell showroom — lighting proposal",
        status: "draft", owner: "Priya Shah",
        summary: "Twelve Arc Lamps across two phases for the Clerkenwell fit-out.",
        tags: ["proposal", "sales"],
        fields: { kind: "proposal", confidential: true, folder: "Proposals", signatureStatus: "not_requested" },
        body: doc(proposalBlocks),
      }),
      context.rec({
        org: "nl", collection: "documents", n: 322, title: "Workshop handbook",
        status: "published", owner: "Theo Marsh",
        summary: "How the Walthamstow workshop runs, shift by shift.",
        tags: ["handbook", "operations"],
        fields: { kind: "handbook", confidential: false, folder: "Operations" },
        body: doc(handbookBlocks),
      }),
      context.rec({
        org: "nl", collection: "documents", n: 323, title: "Supplier onboarding checklist",
        status: "archived", owner: "Jonah Adeyemi",
        summary: "Superseded by the procurement policy.",
        tags: ["archive"],
        fields: { kind: "checklist", confidential: false, folder: "Procurement" },
        body: doc([
          textBlock("heading1", "Supplier onboarding checklist"),
          textBlock("paragraph", "Retained for reference. The current process lives in the procurement policy."),
          textBlock("bulletItem", "Company number and registered address verified"),
          textBlock("bulletItem", "Bank details confirmed by callback, never by email"),
          textBlock("bulletItem", "Insurance certificate on file and in date"),
        ]),
      }),
      context.rec({
        org: "nl", collection: "templates", n: 320, title: "Trade proposal",
        status: "published", summary: "Scope, commercials and a signature block, with company fields filled from the workspace.",
        tags: ["template", "sales"],
        fields: { kind: "document", scope: "company", tokens: "company.name, company.registration, customer.name, quote.total", usedBy: 6 },
        body: doc([
          textBlock("heading1", "{{customer.name}} — lighting proposal"),
          textBlock("paragraph", "Prepared by {{company.name}}, registered {{company.registration}}. Prices exclude VAT."),
          textBlock("heading2", "Scope"),
          textBlock("bulletItem", "Describe each line of work"),
          textBlock("heading2", "Commercials"),
          textBlock("paragraph", "Total {{quote.total}} excluding VAT. Payment terms thirty days from invoice."),
        ]),
      }),
      context.rec({
        org: "nl", collection: "templates", n: 321, title: "Policy document",
        status: "published", summary: "Numbered sections with a review cycle and an approval block.",
        tags: ["template", "governance"],
        fields: { kind: "document", scope: "company", tokens: "company.name, policy.owner, policy.reviewDate", usedBy: 3 },
        body: doc([
          textBlock("heading1", "{{policy.title}}"),
          textBlock("paragraph", "Owner {{policy.owner}}. Next review {{policy.reviewDate}}."),
          textBlock("heading2", "Purpose"),
          textBlock("heading2", "Scope"),
          textBlock("heading2", "Responsibilities"),
        ]),
      }),
      context.rec({
        org: "nl", collection: "templates", n: 322, title: "Workshop shift note",
        status: "draft", summary: "Short daily note for the workshop board.",
        tags: ["template", "operations"],
        fields: { kind: "document", scope: "department", department: "Workshop", tokens: "shift.date, shift.lead", usedBy: 0 },
        body: doc([
          textBlock("heading2", "Shift note {{shift.date}}"),
          textBlock("paragraph", "Lead {{shift.lead}}."),
          textBlock("bulletItem", "What shipped"),
          textBlock("bulletItem", "What failed inspection and why"),
        ]),
      }),
      context.rec({
        org: "hb", collection: "documents", n: 320, title: "Harbor distribution agreement — draft",
        status: "in_review", owner: "Elena Ward",
        summary: "Terms for the US distribution of the Arc range.",
        tags: ["legal", "confidential"],
        fields: { kind: "contract", confidential: true, folder: "Legal", signatureStatus: "not_requested" },
        body: doc([
          textBlock("heading1", "Distribution agreement"),
          textBlock("paragraph", "Between Harbor Supply Co and Northline Lighting Ltd, for the distribution of the Arc range in the United States."),
          textBlock("heading2", "Territory"),
          textBlock("paragraph", "The fifty states and the District of Columbia. Canada is excluded and is handled directly."),
          textBlock("heading2", "Minimum volumes"),
          textBlock("paragraph", "Four hundred units in the first twelve months, reviewed quarterly against the shipped total."),
        ]),
      }),
    ],
  };
});
