import { detailRoute, enrichCreated, nextStage } from "./create";
import { issueInvoice, matchBankLine, postJournal, recordPayment, reverseJournal, voidInvoice } from "./finance";
import { authorize, quantityOnHand } from "./ops";
import type { Audit, CapabilityState, Rec, Role } from "./types";
import { byId, currencyFor, inOrg, isPaused, replaceRec, touch } from "./types";

export interface ScreenRef {
  id: string;
  title: string;
  route: string;
  archetype: string;
  applicationCode: string;
  collection: string;
  actions: string[];
  overlays: string[];
  tabs: string[];
}

export interface ActionContext {
  screen: ScreenRef;
  action: string;
  role: Role;
  orgId: string;
  actor: string;
  now: string;
  selectedId?: string;
  ids: () => string;
  title?: string;
  summary?: string;
}

export interface ActionEffect {
  records: Rec[];
  events: Audit[];
  toastTitle: string;
  toastBody: string;
  tone: "ok" | "blocked" | "failed" | "info";
  overlay?: string;
  navigate?: string;
  download?: { filename: string; text: string; mime: string };
  tool?: string;
  selectId?: string;
  ask?: string;
  pickFile?: boolean;
  capability?: CapabilityState;
}

const GROUP_WORDS: Record<string, string[]> = {
  create: ["create", "add", "new", "upload", "invite", "hire", "compose", "draft", "write", "define", "register", "assemble", "book"],
  update: ["edit", "update", "revise", "correct", "adjust", "assign", "move", "qualify", "convert", "tag", "link", "set", "change", "rename", "reschedule", "reassign", "delegate", "complete", "pin", "map", "configure", "validate", "annotate", "restrict", "redact", "reorder", "rearrange", "prioritize", "modify", "reparent", "transfer", "label", "categorize", "format", "style", "align", "group", "lock", "reorder", "swap", "fork", "alter", "seed", "tune", "flag", "allocate", "role", "toggle", "bind", "apply", "use", "suggest", "type", "arrange", "manage", "clone", "install", "route", "split", "merge", "duplicate", "schedule", "submit", "activate", "compare", "select", "switch", "choose", "refine", "fix", "save", "drag", "bulk", "attach", "insert", "place", "flow", "snap", "wrap", "fill", "paste", "collapse", "show", "sequence", "reduce", "advance", "transform", "reset", "branch", "commit", "promote", "cite", "document", "hash", "bookmark", "limit", "cap", "require", "retention", "remind", "mitigate", "put", "mark", "clear", "turn", "target", "segment", "model", "handoff", "restock", "fulfil", "browse", "join", "launch", "portfolio", "thread", "audio", "raise", "return", "play", "present", "visually", "revert", "acknowledge"],
  approve: ["approve", "grant", "authorize", "accept", "confirm", "verify", "resolve", "score"],
  reject: ["reject", "deny", "decline", "void", "cancel", "archive", "delete", "deactivate", "retire", "offboard", "disable", "block", "remove"],
  pause: ["pause", "stop", "snooze", "defer", "suspend"],
  resume: ["resume", "continue", "retry", "reopen", "restore", "rollback", "replay", "retest"],
  export: ["export", "download", "batch"],
  import: ["import"],
  inspect: ["inspect", "open", "drill", "view", "focus", "explore", "follow", "preview", "find", "search", "filter", "jump", "review", "monitor", "investigate", "refresh"],
  ask: ["ask", "message", "dictate", "mention", "reply", "comment", "host", "request", "respond", "contact", "communicate", "forward"],
  external: ["send", "publish", "pay", "connect", "deploy", "reconnect", "resend", "take", "call"],
  run: ["run", "test", "simulate", "execute", "build", "generate", "recalculate", "render", "reindex", "reprocess", "evaluate", "audit", "check", "scan", "count", "demonstrate", "automate", "proxy", "audition", "animate", "proof"],
  finance: ["post", "reverse", "reconcile", "match", "reimburse", "refund", "eliminate", "prepare", "record", "receive"],
  tool: ["draw", "zoom", "crop", "brush", "paint", "lasso", "invert", "mask", "blend", "trim", "ripple", "scrub", "pan", "rotate", "resize", "undo", "loop", "stagger", "simplify", "subtract", "detach", "isolate", "relink", "bypass", "time"],
};

function verbOf(action: string): string {
  return action.trim().toLowerCase().split(/[\s/]+/)[0] ?? "update";
}

function groupOf(verb: string): string {
  for (const [group, words] of Object.entries(GROUP_WORDS)) {
    if (words.includes(verb)) return group;
  }
  return "touch";
}

function overlayFor(screen: ScreenRef, pattern: RegExp): string | undefined {
  return screen.overlays.find((name) => pattern.test(name)) ?? screen.overlays[0];
}

function done(
  records: Rec[],
  events: Audit[],
  toastTitle: string,
  toastBody: string,
  extra: Partial<ActionEffect> = {},
): ActionEffect {
  return { records, events, toastTitle, toastBody, tone: extra.tone ?? "ok", ...extra };
}

function audit(ctx: ActionContext, type: string, message: string, entityId?: string, capability?: CapabilityState): Audit {
  return {
    id: ctx.ids(),
    organizationId: ctx.orgId,
    at: ctx.now,
    actor: ctx.actor,
    type,
    message,
    entityId,
    screenId: ctx.screen.id,
    capability,
  };
}

function selected(records: Rec[], ctx: ActionContext): Rec | undefined {
  const chosen = byId(records, ctx.selectedId);
  if (chosen && chosen.organizationId === ctx.orgId) return chosen;
  return inOrg(records, ctx.orgId, ctx.screen.collection)[0];
}

function blank(ctx: ActionContext, title: string, status = "draft"): Rec {
  return {
    id: ctx.ids(),
    organizationId: ctx.orgId,
    collection: ctx.screen.collection,
    title,
    status,
    ownerName: ctx.actor,
    summary: "",
    currency: currencyFor(ctx.orgId),
    tags: ["local"],
    fields: {},
    createdAt: ctx.now,
    updatedAt: ctx.now,
    revision: 1,
    createdBy: ctx.actor,
    updatedBy: ctx.actor,
    history: [],
  };
}

export function toCsv(rows: Rec[]): string {
  const header = ["id", "title", "status", "owner", "summary", "amountMinor", "updatedAt"];
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [row.id, row.title, row.status, row.ownerName, row.summary, String(row.amountMinor ?? ""), row.updatedAt]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function importCsv(records: Rec[], ctx: ActionContext, text: string): ActionEffect {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const created: Rec[] = [];
  lines.slice(1).forEach((line) => {
    const cells = line.split(",").map((cell) => cell.replace(/^"|"$/g, "").replaceAll('""', '"'));
    if (!cells[1]) return;
    created.push({
      ...blank(ctx, cells[1], cells[2] || "draft"),
      summary: cells[4] || "Imported from a local file.",
      amountMinor: cells[5] ? Number(cells[5]) : undefined,
    });
  });
  if (created.length === 0) {
    return done(records, [audit(ctx, "import.failed", "The file had no data rows.")], "Nothing imported", "Add a header and at least one row.", { tone: "failed" });
  }
  return done(
    [...created, ...records],
    [audit(ctx, "import.ready_local", `Imported ${created.length} rows into ${ctx.screen.collection}.`, created[0]?.id, "ready_local")],
    "Import saved",
    `${created.length} records are now in this workspace.`,
    { selectId: created[0]?.id },
  );
}

function external(records: Rec[], ctx: ActionContext, current?: Rec): ActionEffect {
  const capability: CapabilityState = "not_connected";
  const next = current
    ? replaceRec(
        records,
        touch(current, ctx.actor, ctx.now, {
          fields: { ...current.fields, delivery: capability, lastAction: ctx.action },
          summary: current.summary,
        }),
      )
    : records;
  return done(
    next,
    [audit(ctx, "capability.not_connected", `${ctx.action} needs a provider that is not connected.`, current?.id, capability)],
    "Service not connected",
    "The local record is saved. No external account was contacted and nothing was published, paid, or sent.",
    { tone: "info", capability, overlay: overlayFor(ctx.screen, /connect|publish|send|preview|author/i) },
  );
}

export function reduceAction(records: Rec[], ctx: ActionContext): ActionEffect {
  const verb = verbOf(ctx.action);
  const decision = authorize(ctx.role, ctx.screen.collection, verb);
  if (!decision.ok) {
    return done(
      records,
      [audit(ctx, "policy.blocked", decision.reason, ctx.selectedId, "blocked")],
      "Not allowed in this view",
      decision.reason,
      { tone: "blocked", capability: "blocked" },
    );
  }

  const lower = ctx.action.toLowerCase();
  const current = selected(records, ctx);

  if (ctx.screen.collection === "missions" && /create|submit|activate|resume/.test(verb) && isPaused(records, ctx.orgId)) {
    return done(
      records,
      [audit(ctx, "mission.dispatch.blocked", "New mission dispatch is paused.", undefined, "blocked")],
      "Dispatch is paused",
      "An owner paused new local missions. Existing records stay as they are. External effects already accepted cannot be confirmed from here.",
      { tone: "blocked", capability: "blocked" },
    );
  }

  if (ctx.screen.collection === "journals" && verb === "post" && current) {
    const result = postJournal(records, current.id, ctx.actor, ctx.now, ctx.ids());
    if (result.error) return done(records, [], "Journal not posted", result.error, { tone: "failed", overlay: overlayFor(ctx.screen, /balanc|valid/i) });
    return done(result.records, result.events, "Journal posted", "Debits equal credits in the local ledger.", { selectId: current.id });
  }
  if (ctx.screen.collection === "journals" && verb === "reverse" && current) {
    const result = reverseJournal(records, current.id, ctx.actor, ctx.now, { journal: ctx.ids(), event: ctx.ids() });
    if (result.error) return done(records, [], "Not reversed", result.error, { tone: "failed" });
    return done(result.records, result.events, "Journal reversed", "An offsetting journal was posted locally.");
  }
  if (ctx.screen.collection === "invoices" && (verb === "record" || lower.includes("payment"))) {
    const target = current && current.collection === "invoices" ? current : inOrg(records, ctx.orgId, "invoices").find((item) => item.status === "awaiting_payment");
    if (!target) return done(records, [], "No open invoice", "Issue an invoice before recording a receipt.", { tone: "failed" });
    const result = recordPayment(records, target.id, ctx.actor, ctx.now, { journal: ctx.ids(), event: ctx.ids() });
    if (result.error) return done(records, [], "Payment not recorded", result.error, { tone: "failed" });
    return done(result.records, result.events, "Receipt recorded locally", "The ledger now shows cash in and receivables cleared. No payment provider confirmed the transfer.", { selectId: target.id });
  }
  if (ctx.screen.collection === "invoices" && verb === "void" && current) {
    const result = voidInvoice(records, current.id, ctx.actor, ctx.now, { journal: ctx.ids(), event: ctx.ids() });
    if (result.error) return done(records, [], "Invoice not voided", result.error, { tone: "failed" });
    return done(result.records, result.events, "Invoice voided", "Any posted issue journal was reversed locally.", { selectId: current.id });
  }
  if (ctx.screen.collection === "invoices" && (verb === "approve" || lower.includes("issue")) && current?.status === "draft") {
    const result = issueInvoice(records, current.id, ctx.actor, ctx.now, { journal: ctx.ids(), event: ctx.ids() });
    if (result.error) return done(records, [], "Invoice not issued", result.error, { tone: "failed" });
    return done(result.records, result.events, "Invoice issued", "A balanced receivable journal was posted. Sending it still needs a mailbox.", { selectId: current.id });
  }
  if (ctx.screen.collection === "bankTransactions" && /match|reconcile|confirm/.test(lower)) {
    const target = inOrg(records, ctx.orgId, "bankTransactions").find((item) => item.fields.matched !== true) ?? current;
    if (!target) return done(records, [], "Nothing to match", "Import a statement line first.", { tone: "failed" });
    const result = matchBankLine(records, target.id, ctx.actor, ctx.now, ctx.ids());
    if (result.error) return done(records, [], "No match", result.error, { tone: "failed", selectId: target.id });
    return done(result.records, result.events, "Line matched", "The statement line now points at a posted cash journal.", { selectId: target.id });
  }
  if (ctx.screen.collection === "leads" && verb === "convert" && current) {
    const deal: Rec = {
      ...blank(ctx, `${current.title} deal`, "discovery"),
      collection: "deals",
      summary: `Converted from ${current.title}.`,
      amountMinor: current.amountMinor,
      parentId: current.id,
      fields: { stage: "discovery", contactId: String(current.fields.contactId ?? ""), sourceLeadId: current.id },
    };
    const lead = touch(current, ctx.actor, ctx.now, { status: "qualified", fields: { ...current.fields, stage: "qualified", dealId: deal.id } });
    return done(
      [deal, ...replaceRec(records, lead)],
      [audit(ctx, "crm.lead.converted_local", `Created ${deal.title}.`, deal.id, "ready_local")],
      "Lead converted",
      "A discovery deal now carries this lead. No outreach was sent.",
      { selectId: deal.id, navigate: ctx.screen.route.replace("/leads", "/deals") },
    );
  }
  if (current && current.fields.stage && (/^move|^drag/.test(verb) || /stage/.test(lower))) {
    const next = nextStage(String(current.fields.stage));
    const updated = touch(current, ctx.actor, ctx.now, { status: next, fields: { ...current.fields, stage: next } });
    return done(replaceRec(records, updated), [audit(ctx, "record.stage_changed", `${current.title} is now ${next}.`, current.id, "ready_local")], "Stage updated", `${current.title} moved to ${next}.`, { selectId: current.id });
  }
  if (verb === "close" && current?.collection === "deals") {
    const updated = touch(current, ctx.actor, ctx.now, { status: "won", fields: { ...current.fields, stage: "won" } });
    return done(replaceRec(records, updated), [audit(ctx, "crm.deal.won_local", `${current.title} is won in this workspace.`, current.id, "ready_local")], "Deal closed locally", `${current.title} is won. No external contract was filed.`, { selectId: current.id });
  }
  if (current?.collection === "deals" && groupOf(verb) === "create" && /quote|proposal/.test(lower)) {
    const count = inOrg(records, ctx.orgId, "quotes").length + 1;
    const net = Number(current.amountMinor ?? 0);
    const tax = currencyFor(ctx.orgId) === "GBP" ? Math.round(net * 0.2) : 0;
    const quote = blank(ctx, `Q-${200 + count}`, "draft");
    quote.collection = "quotes";
    quote.parentId = current.id;
    quote.amountMinor = net + tax;
    quote.summary = `Proposal for ${current.title}. Not sent.`;
    quote.fields = { dealId: current.id, contactId: String(current.fields.contactId ?? ""), netMinor: net, taxMinor: tax };
    return done(
      [quote, ...records],
      [audit(ctx, "crm.quote.created_local", `Created ${quote.title} from ${current.title}.`, quote.id, "ready_local")],
      "Proposal drafted",
      `${quote.title} is in this workspace. It has not been sent.`,
      { selectId: quote.id },
    );
  }
  if (ctx.screen.id === "ARL-ADMIN-004" && (verb === "suspend" || verb === "pause")) {
    const org = byId(records, ctx.orgId);
    if (!org) return done(records, [], "Organization missing", "The workspace record was not found.", { tone: "failed" });
    const updated = touch(org, ctx.actor, ctx.now, { fields: { ...org.fields, executionPaused: true } });
    return done(
      replaceRec(records, updated),
      [audit(ctx, "company.execution.paused_local", "New mission dispatch is paused.", org.id, "ready_local")],
      "New missions paused",
      "Local dispatch will refuse new missions. This does not reverse any third-party action already accepted.",
      { capability: "ready_local" },
    );
  }
  if (ctx.screen.id === "ARL-ADMIN-004" && verb === "resume") {
    const org = byId(records, ctx.orgId);
    if (!org) return done(records, [], "Organization missing", "The workspace record was not found.", { tone: "failed" });
    const updated = touch(org, ctx.actor, ctx.now, { fields: { ...org.fields, executionPaused: false } });
    return done(replaceRec(records, updated), [audit(ctx, "company.execution.resumed_local", "Mission dispatch resumed.", org.id, "ready_local")], "Dispatch resumed", "New local missions can be created again.");
  }
  if (verb === "undo" && current?.history[0]) {
    const [prev, ...rest] = current.history;
    const restored: Rec = {
      ...current,
      title: prev.title,
      status: prev.status,
      summary: prev.summary,
      fields: prev.fields,
      body: prev.body,
      amountMinor: prev.amountMinor,
      history: rest,
      revision: current.revision + 1,
      updatedAt: ctx.now,
      updatedBy: ctx.actor,
    };
    return done(replaceRec(records, restored), [audit(ctx, "record.undone_local", `Restored ${current.title}.`, current.id, "ready_local")], "Undone", "The previous version of this record is back.");
  }
  if (lower.includes("delete where lawful")) {
    const held = inOrg(records, ctx.orgId, "contacts").filter((item) => item.tags.includes("legal-hold"));
    if (held.length) {
      return done(records, [audit(ctx, "privacy.deletion.blocked", "A legal hold blocks deletion.", held[0].id, "blocked")], "Deletion blocked", `${held[0].title} is on legal hold. The ledger is unchanged.`, { tone: "blocked", capability: "blocked" });
    }
    const contact = inOrg(records, ctx.orgId, "contacts").find((item) => item.status !== "archived");
    if (!contact) return done(records, [], "Nothing to remove", "There is no contact waiting for removal.", { tone: "info" });
    const updated = touch(contact, ctx.actor, ctx.now, { status: "archived", summary: "Archived by a local deletion request. Journals that cite the invoice remain." });
    return done(replaceRec(records, updated), [audit(ctx, "privacy.deletion.ready_local", `Archived ${contact.title}. Posted journals were retained.`, contact.id, "ready_local")], "Contact archived", "The contact is archived in this browser. Posted journals stay because they are the local audit trail.");
  }

  if (groupOf(verb) === "external" || /sso|e-sign|filing/.test(lower)) {
    return external(records, ctx, current);
  }

  const buildingAgent = ctx.screen.id === "ARL-TEAM-004" && verb === "generate";
  if (groupOf(verb) === "create" || buildingAgent) {
    const created = blank(ctx, ctx.title?.trim() || `New ${ctx.screen.title.replace(/s$/, "")}`);
    const enriched = enrichCreated(records, created, {
      orgId: ctx.orgId,
      actor: ctx.actor,
      now: ctx.now,
      ids: ctx.ids,
      collection: created.collection,
      title: ctx.title,
      summary: ctx.summary,
    });
    return done(
      [enriched.primary, ...enriched.extra, ...records],
      [audit(ctx, "record.created_local", `Created ${enriched.primary.title}.`, enriched.primary.id, "ready_local")],
      "Draft created",
      `${enriched.primary.title} is saved in this workspace.`,
      {
        selectId: enriched.primary.id,
        navigate: enriched.navigate,
        overlay: enriched.navigate ? undefined : overlayFor(ctx.screen, /create|edit|form|new|composer|editor/i),
      },
    );
  }

  if (groupOf(verb) === "export") {
    const rows = inOrg(records, ctx.orgId, ctx.screen.collection);
    return done(records, [audit(ctx, "export.ready_local", `Exported ${rows.length} ${ctx.screen.collection} rows.`, undefined, "ready_local")], "Export ready", "A CSV file of the current register was prepared.", {
      download: { filename: `${ctx.screen.collection}.csv`, text: toCsv(rows), mime: "text/csv" },
    });
  }

  if (groupOf(verb) === "import") {
    return done(records, [], "Choose a CSV file", "Rows will be added to this register.", { pickFile: true, tone: "info" });
  }

  if (groupOf(verb) === "ask") {
    return done(
      records,
      [audit(ctx, "assistant.opened_local", ctx.action, current?.id, "ready_local")],
      "Ask Arlovi",
      "The reply will use local records only.",
      { ask: `${ctx.action} · ${ctx.screen.title}`, tone: "info" },
    );
  }

  if (groupOf(verb) === "inspect") {
    const path = detailRoute(current?.collection ?? ctx.screen.collection);
    if (path && current && /^(open|drill|view)$/.test(verb)) {
      return done(records, [audit(ctx, "record.opened_local", current.title, current.id, "ready_local")], current.title, current.summary, {
        tone: "info",
        selectId: current.id,
        navigate: path,
      });
    }
    return done(records, [], current ? current.title : "Nothing selected", current?.summary || "There is no record in this register yet.", {
      tone: "info",
      selectId: current?.id,
      overlay: overlayFor(ctx.screen, /inspect|detail|drawer|preview|drill/i),
    });
  }

  if (groupOf(verb) === "tool" && current) {
    const tool = verb;
    const updated = touch(current, ctx.actor, ctx.now, { fields: { ...current.fields, tool } });
    return done(replaceRec(records, updated), [audit(ctx, "editor.tool_changed", `Tool is ${tool}.`, current.id, "ready_local")], "Tool ready", `${ctx.action} is the active tool on ${current.title}.`, { tool, selectId: current.id });
  }

  if (groupOf(verb) === "run") {
    const run = blank(ctx, `${ctx.action} · ${ctx.screen.title}`, "completed");
    run.collection = "evaluations";
    run.summary = "Local check finished. No external runner was used.";
    run.parentId = current?.id;
    return done([run, ...records], [audit(ctx, "evaluation.completed_local", run.summary, run.id, "ready_local")], "Local check finished", run.summary, { selectId: run.id });
  }

  if (groupOf(verb) === "finance" && current) {
    if (verb === "receive") {
      const productId = String(current.fields.productId ?? "nl-products-001");
      const move = blank(ctx, `Receipt ${current.title}`, "posted");
      move.collection = "stockMoves";
      move.fields = { productId, quantity: 4, purchaseOrderId: current.id };
      const qty = quantityOnHand(records, ctx.orgId, productId) + 4;
      const product = byId(records, productId);
      let next = [move, ...records];
      if (product) next = replaceRec(next, touch(product, ctx.actor, ctx.now, { fields: { ...product.fields, onHand: qty } }));
      const po = touch(current, ctx.actor, ctx.now, { status: "received" });
      next = replaceRec(next, po);
      return done(next, [audit(ctx, "procurement.received_local", `Received 4 into stock. On hand is ${qty}.`, move.id, "ready_local")], "Goods received", "Stock increased locally. The supplier was not emailed.");
    }
    const updated = touch(current, ctx.actor, ctx.now, { fields: { ...current.fields, lastAction: ctx.action } });
    return done(replaceRec(records, updated), [audit(ctx, "finance.action_local", ctx.action, current.id, "ready_local")], "Recorded", `${ctx.action} was saved on ${current.title}.`);
  }

  if (!current) {
    const created = blank(ctx, ctx.screen.title, "draft");
    created.summary = ctx.action;
    return done([created, ...records], [audit(ctx, "record.created_local", ctx.action, created.id, "ready_local")], "Saved", `${ctx.action} created a draft because the register was empty.`, { selectId: created.id });
  }

  const status = nextStatus(verb, current.status);
  const updated = touch(current, ctx.actor, ctx.now, {
    status,
    fields: { ...current.fields, lastAction: ctx.action },
  });
  const title = status === current.status ? "Saved" : "Updated";
  return done(
    replaceRec(records, updated),
    [audit(ctx, "record.updated_local", `${ctx.action} on ${current.title}.`, current.id, "ready_local")],
    title,
    status === current.status ? `${ctx.action} is recorded on ${current.title}.` : `${current.title} is now ${status}.`,
    { selectId: current.id, overlay: verb === "approve" || verb === "reject" ? overlayFor(ctx.screen, /approv|confirm|dialog/i) : undefined },
  );
}

function nextStatus(verb: string, current: string): string {
  if (["approve", "accept", "authorize", "grant", "confirm", "verify"].includes(verb)) return "approved";
  if (["reject", "deny", "decline"].includes(verb)) return "rejected";
  if (["archive", "delete", "deactivate", "retire", "offboard", "remove"].includes(verb)) return "archived";
  if (verb === "void" || verb === "cancel") return verb === "void" ? "void" : "cancelled";
  if (["pause", "suspend", "block", "disable", "stop", "snooze", "defer"].includes(verb)) return "paused";
  if (["resume", "restore", "reopen", "continue", "replay"].includes(verb)) return "active";
  if (["complete", "close", "resolve"].includes(verb)) return "completed";
  if (verb === "submit") return "awaiting_approval";
  if (verb === "activate") return "active";
  if (verb === "qualify") return "qualified";
  return current;
}
