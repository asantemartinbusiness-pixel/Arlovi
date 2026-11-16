import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Fixtures for the conversation surfaces. Every assistant turn in here is
 * written the way the local engine writes one: it names the records it read
 * and stops at the provider boundary instead of claiming an external action.
 * ------------------------------------------------------------------ */

registerSeed("ai", (ctx) => {
  const at = (days: number, hours = 0) =>
    new Date(new Date(ctx.now).getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();

  const turn = (input: {
    id: string;
    role: "person" | "arlovi" | "agent" | "note";
    author: string;
    text: string;
    at: string;
    citations?: { id: string; title: string; collection: string }[];
    limits?: string[];
    kind?: "answer" | "blocked" | "clarify" | "message";
    boundary?: { capability: string; asked: string };
  }) => input;

  const records: Rec[] = [
    ctx.rec({
      org: "nl", collection: "conversations", n: 60, title: "Winter launch planning",
      status: "active", owner: "Maya Chen",
      summary: "Chief of Staff thread behind the winter trade launch mission.",
      at: at(-1, -2),
      fields: { agentId: "nl-agents-001", kind: "chief", pinned: true, shared: false, archived: false, missionId: "nl-missions-001" },
      body: {
        turns: [
          turn({ id: "t20-1", role: "person", author: "Maya Chen", at: at(-1, -3), text: "Where is the winter trade launch, and what is blocking it?" }),
          turn({
            id: "t20-2", role: "arlovi", author: "Arlovi", at: at(-1, -3), kind: "answer",
            text: "1 mission is running: Winter trade launch, £0.00 of £2,000.00 spent. Two of its tasks are recorded: Assemble evidence is done and Draft the campaign is ready, waiting for you to approve the copy. Nothing is stopped at a provider boundary yet.",
            citations: [
              { id: "nl-missions-001", title: "Winter trade launch", collection: "missions" },
              { id: "nl-missionTasks-002", title: "Draft the campaign", collection: "missionTasks" },
            ],
            limits: ["A step that needs an external service is recorded as stopped, never as done."],
          }),
          turn({ id: "t20-3", role: "person", author: "Maya Chen", at: at(-1, -2), text: "Email the trade list about the launch." }),
          turn({
            id: "t20-4", role: "arlovi", author: "Arlovi", at: at(-1, -2), kind: "blocked",
            text: "You asked me to send a message. No mail service is connected, so nothing has left this browser and I have not sent anything. I have kept the request against the mission so the draft can be written and approved first.",
            boundary: { capability: "email.send", asked: "send a message" },
            citations: [{ id: "nl-connectors-002", title: "Mailbox", collection: "connectors" }],
          }),
        ],
        attachments: [{ id: "att-pricelist", name: "price-list-november.pdf", size: 184_320, type: "application/pdf", recordId: "nl-sources-001" }],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conversations", n: 61, title: "Cash position before Friday close",
      status: "active", owner: "Jonah Adeyemi",
      summary: "Receivables and the last posted journal, read from the ledger.",
      at: at(0, -4),
      fields: { agentId: "nl-agents-002", kind: "specialist", pinned: false, shared: true, archived: false },
      body: {
        turns: [
          turn({ id: "t21-1", role: "person", author: "Jonah Adeyemi", at: at(0, -4), text: "How much are we owed and is anything overdue?" }),
          turn({
            id: "t21-2", role: "agent", author: "Idris Cole", at: at(0, -4), kind: "answer",
            text: "Read from the invoice records in this workspace: the open invoices are listed with their due dates, and the last posted journal gives the ledger date. I can prepare a journal but I cannot post one — posting is held for Finance or Owner.",
            citations: [{ id: "nl-invoices-001", title: "INV-1048", collection: "invoices" }],
            limits: ["Balances come from posted local journals, not from a bank feed."],
          }),
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conversations", n: 62, title: "Shade complaint wording",
      status: "active", owner: "Priya Shah",
      summary: "Care reply drafted only from approved articles.",
      at: at(-3),
      fields: { agentId: "nl-agents-004", kind: "specialist", pinned: false, shared: true, archived: false },
      body: {
        turns: [
          turn({ id: "t22-1", role: "person", author: "Priya Shah", at: at(-3), text: "What can we say about the cracked shade?" }),
          turn({
            id: "t22-2", role: "agent", author: "Remy Alves", at: at(-3), kind: "answer",
            text: "The approved article covers replacement within the warranty window. I reply only from approved articles, so anything outside them stays a draft for a person to write.",
            citations: [{ id: "nl-tickets-001", title: "CARE-19", collection: "tickets" }],
          }),
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conversations", n: 63, title: "Brass supplier concentration",
      status: "archived", owner: "Maya Chen",
      summary: "Archived thread about the single-supplier risk. Kept for the retention schedule.",
      at: at(-21),
      fields: { agentId: "nl-agents-001", kind: "chief", pinned: false, shared: false, archived: true, legalHold: true },
      body: {
        turns: [
          turn({ id: "t23-1", role: "person", author: "Maya Chen", at: at(-21), text: "What is the exposure if Thames Brass is late?" }),
          turn({
            id: "t23-2", role: "arlovi", author: "Arlovi", at: at(-21), kind: "answer",
            text: "The risk register holds one open risk: Thames Brass is the only collar source on the winter run. One contract is in review with 30-day terms and is not e-signed. I cannot estimate a delay probability from these records, so I am not giving one.",
            citations: [
              { id: "nl-risks-001", title: "Single brass supplier", collection: "risks" },
              { id: "nl-contracts-001", title: "Thames Brass supply", collection: "contracts" },
            ],
            limits: ["No forecast is produced: the records contain no lead-time history to compute one from."],
          }),
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "conversations", n: 64, title: "Pricing policy questions",
      status: "active", owner: "Maya Chen",
      summary: "Pinned thread used when quoting trade customers.",
      at: at(-7),
      fields: { agentId: "nl-agents-001", kind: "chief", pinned: true, shared: true, archived: false },
      body: {
        turns: [
          turn({ id: "t24-1", role: "person", author: "Maya Chen", at: at(-7), text: "Remind me what we decided about VAT on trade quotes." }),
          turn({
            id: "t24-2", role: "arlovi", author: "Arlovi", at: at(-7), kind: "answer",
            text: "One approved decision covers it: trade quotes and the site show prices excluding VAT, with VAT added on the invoice. The decision record carries its approval date.",
            citations: [{ id: "nl-decisions-001", title: "Keep prices ex VAT", collection: "decisions" }],
          }),
        ],
      },
    }),

    /* Team room: a channel with human and AI participants. */
    ctx.rec({
      org: "nl", collection: "channels", n: 60, title: "Winter launch room",
      status: "active", summary: "Humans and AI employees working the winter trade launch.",
      fields: { kind: "room", missionId: "nl-missions-001", participants: "nl-members-001,nl-members-003,nl-agents-001,nl-agents-003" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 60, title: "Launch scope",
      parentId: "nl-channels-060", at: at(-2, -5),
      summary: "Quote, photography and a campaign draft. No external posting in this mission.",
      fields: { author: "Maya Chen", kind: "human" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 61, title: "Evidence assembled",
      parentId: "nl-channels-060", at: at(-2, -3),
      summary: "Read the quote, the open invoice and the stock figures; all three are cited on the mission task.",
      fields: { author: "Nia Okonkwo", kind: "ai" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 62, title: "Decision: ex-VAT pricing on the launch sheet",
      parentId: "nl-channels-060", at: at(-2, -2), status: "decided",
      summary: "Agreed in the room and recorded against the decision register.",
      fields: { author: "Maya Chen", kind: "human", pinned: true, decision: true, decisionId: "nl-decisions-001" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 63, title: "Asked to post the launch to the shop window",
      parentId: "nl-channels-060", at: at(-1, -6), status: "blocked",
      summary: "A mention cannot grant a tool: publishing needs a hosting connection, which is not connected.",
      fields: { author: "Priya Shah", kind: "human", capability: "site.publish", blocked: true },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 64, title: "Photography brief ready for review",
      parentId: "nl-channels-060", at: at(-1, -1),
      summary: "Draft brief written from the product records. Nothing is published.",
      fields: { author: "Sable Nguyen", kind: "ai" },
    }),

    /* Mission room discussion, including the loop that was stopped. */
    ctx.rec({
      org: "nl", collection: "messages", n: 70, title: "Status request to Idris Cole",
      parentId: "nl-missions-001", at: at(-1, -4),
      summary: "Nia asked Idris for the invoice position before drafting the campaign budget.",
      fields: { author: "Nia Okonkwo", kind: "ai", room: "mission", requestTo: "Idris Cole" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 71, title: "Invoice position returned",
      parentId: "nl-missions-001", at: at(-1, -4),
      summary: "Open invoices and their due dates, cited from the ledger. No forecast given.",
      fields: { author: "Idris Cole", kind: "ai", room: "mission" },
    }),
    ctx.rec({
      org: "nl", collection: "messages", n: 72, title: "Delegation loop stopped",
      parentId: "nl-missions-001", at: at(-1, -3), status: "halted",
      summary: "The same request passed between Nia and Sable three times without new evidence, so the coordinator was asked to decide instead.",
      fields: { author: "Arlovi", kind: "system", room: "mission", loop: true, repeats: 3 },
    }),

    /* Meeting with consent state and a typed transcript. */
    ctx.rec({
      org: "nl", collection: "meetings", n: 60, title: "Winter launch kickoff",
      status: "held", owner: "Maya Chen",
      summary: "Thirty minutes on scope, photography and the campaign draft.",
      startAt: at(-2, -6), endAt: at(-2, -5),
      fields: { where: "Showroom mezzanine", recording: "not_connected", consentComplete: false },
      body: {
        agenda: [
          { id: "ag1", title: "Scope of the launch", minutes: 10, owner: "Maya Chen" },
          { id: "ag2", title: "Photography and brief", minutes: 10, owner: "Sable Nguyen" },
          { id: "ag3", title: "What we will not do externally", minutes: 10, owner: "Nia Okonkwo" },
        ],
        participants: [
          { id: "nl-members-001", name: "Maya Chen", kind: "human", consent: "given", at: at(-2, -6) },
          { id: "nl-members-003", name: "Priya Shah", kind: "human", consent: "given", at: at(-2, -6) },
          { id: "nl-agents-001", name: "Nia Okonkwo", kind: "ai", consent: "not_applicable" },
          { id: "nl-contacts-001", name: "Harrow House (guest)", kind: "human", consent: "not_given" },
        ],
        transcript: [
          { id: "tr1", at: at(-2, -6), speaker: "Maya Chen", text: "We keep the launch inside the workspace until the copy is approved.", source: "typed" },
          { id: "tr2", at: at(-2, -6), speaker: "Priya Shah", text: "Trade list first, retail later.", source: "typed" },
          { id: "tr3", at: at(-2, -5), speaker: "Nia Okonkwo", text: "Nothing can be sent or published from here: neither connector is connected.", source: "typed" },
        ],
      },
    }),

    /* Research workspace records. */
    ctx.rec({
      org: "nl", collection: "research", n: 60, title: "Is the Arc Lamp trade price still right?",
      status: "working", owner: "Maya Chen",
      summary: "Checks the recorded price against the price list, the quote and the last paid invoice.",
      at: at(-4),
      fields: { confidence: "mixed", reviewRequested: false },
      body: {
        question: "Is £900 ex VAT still the right trade price for the Arc Lamp, and what evidence supports it?",
        assumptions: [
          "Trade price means the price before VAT, per the approved pricing decision.",
          "Only records in this workspace are evidence; no market data is available here.",
        ],
        findings: [
          { id: "f1", claim: "The price list records £900 ex VAT, effective 1 November.", confidence: "verified", sourceId: "nl-sources-001", factId: "nl-facts-001" },
          { id: "f2", claim: "The open quote uses the same figure.", confidence: "verified", sourceId: "nl-quotes-001" },
          { id: "f3", claim: "Material cost movement cannot be checked: no supplier invoice for brass collars is recorded in this period.", confidence: "unavailable", sourceId: "" },
        ],
        methods: [
          "Read the price list source and the fact registry entry that cites it.",
          "Compared the quote line against the recorded price.",
          "Looked for supplier bills in the period and found none, so no cost trend is claimed.",
        ],
        gaps: ["No competitor pricing exists in this workspace, so no comparison is offered."],
      },
    }),
    ctx.rec({
      org: "nl", collection: "research", n: 61, title: "Does the brass supply need a second source?",
      status: "review", owner: "Maya Chen",
      summary: "Risk register, contract terms and the winter run requirement.",
      at: at(-9),
      fields: { confidence: "low", reviewRequested: true },
      body: {
        question: "Should Northline qualify a second brass collar supplier before the winter run?",
        assumptions: ["The winter run quantity is the one recorded on the mission."],
        findings: [
          { id: "f1", claim: "One open risk records Thames Brass as the only collar source.", confidence: "verified", sourceId: "nl-risks-001" },
          { id: "f2", claim: "The supply contract is in review on 30-day terms and is not e-signed.", confidence: "verified", sourceId: "nl-contracts-001" },
          { id: "f3", claim: "No delivery history is recorded, so lateness cannot be estimated.", confidence: "unavailable", sourceId: "" },
        ],
        methods: ["Read the risk register and the contract record. No external supplier directory is reachable from this browser."],
        gaps: ["Alternative suppliers would have to be entered as records before they can be compared."],
      },
    }),

    /* Conversation artifact with local versions. */
    ctx.rec({
      org: "nl", collection: "documents", n: 60, title: "Winter launch brief",
      status: "review", owner: "Nia Okonkwo",
      summary: "Artifact written from the winter launch conversation and the product records.",
      at: at(-1),
      fields: { artifact: true, conversationId: "nl-conversations-060", missionId: "nl-missions-001", version: 3, reviewers: "Maya Chen,Priya Shah" },
      body: {
        text: "Winter trade launch — brief\n\nAudience: trade accounts already in the workspace.\nProducts: the recorded winter run items and their ex-VAT prices.\nProof: the open quote and the last paid invoice.\nOut of scope: anything that leaves this browser. No mail or hosting connection exists, so distribution is a separate mission with its own grants.",
        versions: [
          { version: 1, at: at(-3), author: "Nia Okonkwo", summary: "First draft from the conversation; product list only." },
          { version: 2, at: at(-2), author: "Sable Nguyen", summary: "Added the photography note and removed a claim with no source." },
          { version: 3, at: at(-1), author: "Nia Okonkwo", summary: "Added the out-of-scope paragraph after the publish request was blocked." },
        ],
        comments: [
          { id: "c1", at: at(-1), author: "Maya Chen", text: "Keep the out-of-scope paragraph. It is the part people forget." },
          { id: "c2", at: at(0, -5), author: "Priya Shah", text: "Trade first. Retail wording comes later." },
        ],
        sources: ["nl-conversations-060", "nl-products-001", "nl-quotes-001"],
      },
    }),
  ];

  return {
    records,
    events: [
      {
        id: "evt-ai-20",
        organizationId: ctx.northline,
        at: ctx.now,
        actor: "Arlovi",
        type: "conversation.boundary",
        message: "A request to email the trade list was recorded and stopped: no mail provider is connected.",
        entityId: "nl-conversations-060",
        capability: "not_connected",
      },
    ],
  };
});
