import type { Rec } from "@/domain/types";
import { rankKnowledge } from "@/applications/brain/knowledge/model";

/* ====================================================================== *
 * Local answer engine for the intelligence applications.
 *
 * Audit A16: the previous surface matched a keyword and returned one string.
 * This engine reads named collections, composes an answer only from the
 * records it actually read, returns those records as citations, and says
 * plainly what it could not answer. No model provider is called anywhere.
 * ====================================================================== */

export interface Citation {
  id: string;
  title: string;
  collection: string;
}

export interface Answer {
  /** Composed from the records named in `citations`. */
  text: string;
  citations: Citation[];
  /** Collections the engine read to compose the answer. */
  read: string[];
  /** What the answer cannot cover, and why. */
  limits: string[];
  /** Set when the request needs a provider that is not connected. */
  boundary?: { capability: string; asked: string };
  /** Set when the target of the request is ambiguous. */
  clarify?: { question: string; options: Citation[] };
}

export interface AskInput {
  records: Rec[];
  prompt: string;
  /** Records the person pinned into scope in the composer. */
  scope: Rec[];
  now: Date;
  money: (minor: number | undefined) => string;
  date: (value: string | Date | undefined) => string;
  /** Narrows the answer to one specialist's remit. */
  remit?: string;
}

const cite = (records: Rec[], limit = 5): Citation[] =>
  records.slice(0, limit).map((record) => ({ id: record.id, title: record.title, collection: record.collection }));

function of(records: Rec[], collection: string): Rec[] {
  return records.filter((record) => record.collection === collection);
}

/** External verbs that must stop at the provider boundary. */
const EXTERNAL: { test: RegExp; capability: string; asked: string }[] = [
  { test: /\b(send|email|e-mail|mail out|chase by email|reply to)\b/, capability: "email.send", asked: "send a message" },
  { test: /\b(charge|take payment|collect payment|refund)\b/, capability: "payment.capture", asked: "take a payment" },
  { test: /\b(publish|go live|push the site|deploy)\b/, capability: "site.publish", asked: "publish" },
  { test: /\b(file|submit the return|submit vat)\b/, capability: "tax.file", asked: "file a return" },
  { test: /\b(call|text|sms|ring)\b/, capability: "telephony", asked: "place a call or text" },
  { test: /\b(sync|pull the bank|fetch statements)\b/, capability: "bank.feed", asked: "pull a bank feed" },
];

export function detectBoundary(prompt: string): { capability: string; asked: string } | undefined {
  const text = prompt.toLowerCase();
  return EXTERNAL.find((entry) => entry.test.test(text));
}

/** Names mentioned with @ in a draft, matched against people and agents. */
export function mentionsIn(prompt: string, records: Rec[]): Rec[] {
  const handles = [...prompt.matchAll(/@([\w.-]+)/g)].map((match) => match[1].toLowerCase());
  if (handles.length === 0) return [];
  const candidates = [...of(records, "agents"), ...of(records, "members")];
  return candidates.filter((candidate) => handles.some((handle) => handleFor(candidate.title).startsWith(handle)));
}

export function handleFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

interface Topic {
  id: string;
  label: string;
  test: RegExp;
  answer: (input: AskInput) => { text: string; citations: Citation[]; read: string[]; limits?: string[] } | null;
}

const TOPICS: Topic[] = [
  {
    id: "money",
    label: "Invoices and cash",
    test: /invoice|owed|receivable|overdue|paid|cash|revenue|ledger|journal|quote/,
    answer: ({ records, now, money, date }) => {
      const invoices = of(records, "invoices");
      if (invoices.length === 0) return null;
      const open = invoices.filter((invoice) => !["paid", "void", "draft"].includes(invoice.status));
      const overdue = open.filter((invoice) => invoice.dueAt && new Date(invoice.dueAt) < now);
      const total = open.reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0);
      const journals = of(records, "journals").filter((journal) => journal.status === "posted");
      const latest = journals.map((journal) => journal.at ?? journal.updatedAt).sort().at(-1);
      return {
        text: [
          `${open.length} invoice${open.length === 1 ? " is" : "s are"} open, ${money(total)} in total.`,
          overdue.length
            ? `${overdue.length} ${overdue.length === 1 ? "is" : "are"} past due: ${overdue.map((invoice) => `${invoice.title} (${money(invoice.amountMinor)}, due ${date(invoice.dueAt)})`).join(", ")}.`
            : "None of them is past its due date.",
          latest ? `The last posted journal in this workspace is dated ${date(latest)}.` : "No journal has been posted yet, so there is no ledger date to quote.",
        ].join(" "),
        citations: cite([...overdue, ...open, ...journals]),
        read: ["invoices", "journals"],
        limits: ["Balances come from posted local journals, not from a bank feed."],
      };
    },
  },
  {
    id: "missions",
    label: "Missions",
    test: /mission|plan|execution|deliverable|budget|step|approval/,
    answer: ({ records, money }) => {
      const missions = of(records, "missions");
      if (missions.length === 0) return null;
      const running = missions.filter((mission) => ["running", "executing", "dispatched"].includes(mission.status));
      const waiting = missions.filter((mission) => ["waiting", "awaiting_approval", "needs_decision"].includes(mission.status));
      const steps = of(records, "missionSteps");
      const blocked = steps.filter((step) => step.status === "blocked");
      return {
        text: [
          `${missions.length} mission${missions.length === 1 ? " is" : "s are"} recorded: ${running.length} running, ${waiting.length} waiting on a decision.`,
          running.length
            ? `Running now: ${running.map((mission) => `${mission.title} (${money(Number(mission.fields.spentMinor ?? 0))} of ${money(Number(mission.fields.budgetMinor ?? 0))} spent)`).join("; ")}.`
            : "Nothing is executing.",
          blocked.length
            ? `${blocked.length} step${blocked.length === 1 ? " is" : "s are"} stopped at a provider boundary: ${blocked.map((step) => step.title).join(", ")}.`
            : "No step is stopped at a provider boundary.",
        ].join(" "),
        citations: cite([...running, ...waiting, ...blocked]),
        read: ["missions", "missionSteps"],
        limits: ["A step that needs an external service is recorded as stopped, never as done."],
      };
    },
  },
  {
    id: "workforce",
    label: "AI workforce",
    test: /agent|specialist|workforce|employee|hire|skill|evaluation|model/,
    answer: ({ records }) => {
      const agents = of(records, "agents");
      if (agents.length === 0) return null;
      const paused = agents.filter((agent) => agent.status === "paused");
      const evaluations = of(records, "evaluations").filter((item) => item.fields.kind !== "scenario");
      const passed = evaluations.filter((item) => item.status === "passed").length;
      return {
        text: [
          `${agents.length} AI employee contract${agents.length === 1 ? " exists" : "s exist"} in this workspace: ${agents.filter((agent) => agent.status === "active").length} active, ${paused.length} paused, ${agents.filter((agent) => agent.status === "draft").length} draft.`,
          `Roles on the roster: ${[...new Set(agents.map((agent) => String(agent.fields.role ?? "unspecified")))].join(", ")}.`,
          evaluations.length ? `${passed} of ${evaluations.length} recorded evaluation runs passed.` : "No evaluation run has been recorded.",
          "Every contract reads model: not connected, so none of them can call a model.",
        ].join(" "),
        citations: cite([...agents, ...evaluations]),
        read: ["agents", "evaluations"],
        limits: ["An agent contract describes allowed work. Without a model provider it cannot generate text."],
      };
    },
  },
  {
    id: "knowledge",
    label: "Knowledge",
    test: /fact|know|source|conflict|decision|brand|policy|truth|provenance/,
    answer: ({ records, date }) => {
      const facts = of(records, "facts");
      const sources = of(records, "sources");
      if (facts.length === 0 && sources.length === 0) return null;
      const verified = facts.filter((fact) => fact.status === "verified");
      const proposed = facts.filter((fact) => fact.status === "proposed");
      const conflicts = of(records, "conflicts").filter((conflict) => conflict.status === "open");
      return {
        text: [
          `${facts.length} assertion${facts.length === 1 ? " is" : "s are"} in the fact registry: ${verified.length} verified, ${proposed.length} proposed.`,
          verified.length ? `Verified examples: ${verified.slice(0, 3).map((fact) => `${fact.title} — ${fact.summary}`).join(" ")}` : "Nothing is verified yet.",
          `${sources.length} source${sources.length === 1 ? " is" : "s are"} registered; the most recent freshness date is ${date(sources.map((source) => String(source.fields.freshness ?? source.updatedAt)).sort().at(-1))}.`,
          conflicts.length ? `${conflicts.length} open conflict${conflicts.length === 1 ? "" : "s"} — ${conflicts.map((conflict) => conflict.title).join(", ")}. I will not pick a side on a financial conflict.` : "No conflict is open.",
        ].join(" "),
        citations: cite([...verified, ...proposed, ...conflicts, ...sources]),
        read: ["facts", "sources", "conflicts"],
        limits: ["A proposed fact is not authoritative until a person verifies it."],
      };
    },
  },
  {
    id: "knowledgeRecords",
    label: "Written knowledge",
    test: /how (do|should|to)|procedure|process|checklist|warranty|lead time|return|policy|guide|what is our|who approves|knowledge/,
    answer: ({ records, prompt }) => {
      const hits = rankKnowledge(records, prompt);
      if (hits.length === 0) return null;
      const label = (record: Rec) => (record.status === "verified" ? "verified" : record.status === "needs_review" ? "in review, not verified" : "draft, not verified");
      return {
        text: [
          `${hits.length} knowledge record${hits.length === 1 ? " matches" : "s match"} the words you used (${[...new Set(hits.flatMap((hit) => hit.matched))].join(", ")}).`,
          ...hits.map(({ record }) => `“${record.title}” (${label(record)}${record.fields.provenance === "model_generated" ? ", model-generated text" : ""}): ${record.summary || "no summary written."}`),
        ].join(" "),
        citations: cite(hits.map((hit) => hit.record)),
        read: ["knowledge"],
        limits: [
          "Matched by the words in your question and quoted from each record's summary. Nothing was paraphrased or generated.",
          ...(hits.some(({ record }) => record.status !== "verified") ? ["A record that is not verified is not an authoritative answer."] : []),
        ],
      };
    },
  },
  {
    id: "work",
    label: "Work and tasks",
    test: /\btask|\bwork\b|\bdue\b|today|assigned|board|blocked/,
    answer: ({ records, now, date }) => {
      const tasks = [...of(records, "tasks"), ...of(records, "missionTasks")];
      if (tasks.length === 0) return null;
      const open = tasks.filter((task) => task.status !== "done");
      const overdue = open.filter((task) => task.dueAt && new Date(task.dueAt) < now);
      return {
        text: [
          `${open.length} of ${tasks.length} work items are still open.`,
          overdue.length ? `${overdue.length} passed their date: ${overdue.map((task) => `${task.title} (${date(task.dueAt)})`).join(", ")}.` : "None is past its date.",
          `Stages in use: ${[...new Set(open.map((task) => String(task.fields.stage ?? task.status)))].join(", ")}.`,
        ].join(" "),
        citations: cite([...overdue, ...open]),
        read: ["tasks", "missionTasks"],
      };
    },
  },
  {
    id: "customers",
    label: "Customers",
    test: /customer|contact|account|client|deal|pipeline|order|ticket/,
    answer: ({ records, money }) => {
      const contacts = of(records, "contacts");
      const deals = of(records, "deals");
      const tickets = of(records, "tickets");
      if (contacts.length === 0 && deals.length === 0) return null;
      return {
        text: [
          `${contacts.length} contact${contacts.length === 1 ? "" : "s"} and ${deals.length} deal${deals.length === 1 ? "" : "s"} are recorded in this workspace.`,
          deals.length ? `Open pipeline: ${deals.filter((deal) => !["won", "lost"].includes(deal.status)).map((deal) => `${deal.title} (${money(deal.amountMinor)}, ${deal.status})`).join("; ")}.` : "No deal is recorded.",
          tickets.length ? `${tickets.filter((ticket) => ticket.status !== "resolved").length} service ticket${tickets.length === 1 ? "" : "s"} are open.` : "",
        ].filter(Boolean).join(" "),
        citations: cite([...deals, ...contacts, ...tickets]),
        read: ["contacts", "deals", "tickets"],
      };
    },
  },
  {
    id: "calendar",
    label: "Meetings and bookings",
    test: /meeting|booking|appointment|calendar|agenda|transcript/,
    answer: ({ records, date }) => {
      const meetings = of(records, "meetings");
      const bookings = of(records, "bookings");
      if (meetings.length === 0 && bookings.length === 0) return null;
      return {
        text: [
          meetings.length ? `${meetings.length} meeting${meetings.length === 1 ? " is" : "s are"} recorded: ${meetings.map((meeting) => `${meeting.title} (${date(meeting.startAt ?? meeting.at)})`).join("; ")}.` : "No meeting is recorded.",
          bookings.length ? `${bookings.filter((booking) => booking.status !== "cancelled").length} booking${bookings.length === 1 ? "" : "s"} are on the calendar.` : "",
          "Transcripts and notes are typed into this workspace; no audio service is connected to produce them.",
        ].filter(Boolean).join(" "),
        citations: cite([...meetings, ...bookings]),
        read: ["meetings", "bookings"],
      };
    },
  },
];

/** Accounts a request could mean, used to force clarification before action. */
function ambiguousTargets(records: Rec[], prompt: string): Rec[] {
  const words = prompt.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  if (words.length === 0) return [];
  const candidates = [...of(records, "contacts"), ...of(records, "companies"), ...of(records, "suppliers")];
  return candidates.filter((candidate) => words.some((word) => candidate.title.toLowerCase().includes(word)));
}

export function composeAnswer(input: AskInput): Answer {
  const prompt = input.prompt.trim();
  const lower = prompt.toLowerCase();
  const limits: string[] = [];
  const boundary = detectBoundary(lower);
  const mentioned = mentionsIn(prompt, input.records);
  const targets = ambiguousTargets(input.records, lower);

  const matched = TOPICS.filter((topic) => topic.test.test(lower));
  const parts: string[] = [];
  const citations: Citation[] = [];
  const read: string[] = [];

  if (input.scope.length > 0) {
    parts.push(
      `Reading the ${input.scope.length} record${input.scope.length === 1 ? "" : "s"} you put in scope: ${input.scope.map((record) => record.title).join(", ")}.`,
    );
    citations.push(...cite(input.scope, 6));
    read.push(...new Set(input.scope.map((record) => record.collection)));
  }

  for (const topic of matched.slice(0, 2)) {
    const result = topic.answer(input);
    if (!result) continue;
    parts.push(result.text);
    citations.push(...result.citations);
    read.push(...result.read);
    if (result.limits) limits.push(...result.limits);
  }

  if (input.remit && matched.length > 0 && !matched.some((topic) => topic.id === input.remit)) {
    limits.push(`This is outside the remit recorded on this specialist, so it is answered as a referral rather than as its own work.`);
  }

  if (parts.length === 0) {
    const counts = ["invoices", "missions", "agents", "facts", "sources", "tasks", "meetings"]
      .map((collection) => ({ collection, count: of(input.records, collection).length }))
      .filter((entry) => entry.count > 0);
    parts.push(
      `I did not find records that answer that. I answer only from this workspace, and no language model is connected, so I will not guess. I can read: ${counts.map((entry) => `${entry.count} ${entry.collection}`).join(", ")}.`,
    );
    limits.push("Ask about invoices, missions, the AI workforce, knowledge and facts, work items, customers or meetings.");
  }

  if (mentioned.length > 0) {
    parts.push(
      `You mentioned ${mentioned.map((record) => record.title).join(" and ")}. A mention records a request against ${mentioned.length === 1 ? "that participant" : "those participants"}; it does not grant ${mentioned.length === 1 ? "them" : "any of them"} an external tool.`,
    );
    citations.push(...cite(mentioned, 3));
  }

  if (boundary) {
    parts.push(
      `You also asked me to ${boundary.asked}. Nothing leaves this browser, so I have not done it and will not report it as done.`,
    );
  }

  const unique = new Map(citations.map((citation) => [citation.id, citation]));
  return {
    text: parts.join(" "),
    citations: [...unique.values()].slice(0, 8),
    read: [...new Set(read)],
    limits: [...new Set(limits)],
    boundary,
    clarify: boundary && targets.length > 1
      ? { question: `Which account does this concern? ${targets.length} records match the words you used.`, options: cite(targets, 6) }
      : undefined,
  };
}

/** Suggested openers derived from what the workspace actually holds. */
export function suggestions(records: Rec[]): string[] {
  const list: string[] = [];
  if (of(records, "invoices").some((invoice) => invoice.status !== "paid")) list.push("How much are we owed, and by whom?");
  if (of(records, "missions").length) list.push("Where are the missions, and what is blocked?");
  if (of(records, "conflicts").some((conflict) => conflict.status === "open")) list.push("What knowledge conflicts are open?");
  if (of(records, "agents").length) list.push("Which AI employees are active, and what can they do?");
  list.push("What work is open and past its date?");
  return list.slice(0, 4);
}
