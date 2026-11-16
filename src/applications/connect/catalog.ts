import { PROVIDER_CAPABILITIES, type ProviderCapability } from "@/platform/capability";

/* ====================================================================== *
 * Connector catalogue.
 *
 * The state of every provider comes from src/platform/capability.ts, which
 * is the single source of truth and says `not_connected` for all of them.
 * What this file adds is the detail a directory needs — category, the
 * scopes an authorisation would request, the normalised actions and reads
 * a capability would expose, and the limits a provider imposes — none of
 * which changes the state. Nothing here can mark anything connected.
 * ====================================================================== */

export type ScopeKind = "read" | "write";

export interface Scope {
  name: string;
  kind: ScopeKind;
  purpose: string;
}

export interface CapabilityAction {
  name: string;
  direction: "action" | "read" | "webhook";
  summary: string;
  /** What Arlovi does with the same intent while nothing is connected. */
  localEquivalent: string;
}

export interface ConnectorEntry {
  capability: ProviderCapability;
  category: "Money" | "Communication" | "Publishing" | "Intelligence" | "Scheduling";
  featured: boolean;
  version: string;
  scopes: Scope[];
  operations: CapabilityAction[];
  limits: string[];
  /** Claims a provider's own marketing makes that this directory does not repeat. */
  unverified: string[];
  risk: { level: "low" | "medium" | "high"; note: string };
}

const DETAIL: Record<string, Omit<ConnectorEntry, "capability">> = {
  "email.send": {
    category: "Communication",
    featured: true,
    version: "contract v2",
    scopes: [
      { name: "mail.send", kind: "write", purpose: "Hand a composed message to the provider for delivery." },
      { name: "mail.read.metadata", kind: "read", purpose: "Read delivery state so a sent message can be reconciled." },
      { name: "identity.basic", kind: "read", purpose: "Confirm which mailbox the grant belongs to." },
    ],
    operations: [
      { name: "send_message", direction: "action", summary: "Deliver one message to named recipients.", localEquivalent: "The message is kept as a draft with its recipients, subject and body." },
      { name: "delivery_state", direction: "read", summary: "Read whether a message was accepted, bounced or deferred.", localEquivalent: "Each draft records that nothing was attempted." },
      { name: "inbound_message", direction: "webhook", summary: "Receive a reply.", localEquivalent: "Replies are recorded by hand against the thread." },
    ],
    limits: [
      "Most providers rate limit by messages per second and per day.",
      "A sending domain usually needs SPF and DKIM records before anything leaves.",
      "Bounce and complaint handling is mandatory on every provider worth using.",
    ],
    unverified: ["Guaranteed inbox placement", "Unlimited sending"],
    risk: { level: "medium", note: "A send grant can reach anyone in your contact records. It is write access to your reputation as well as your mailbox." },
  },
  "payment.capture": {
    category: "Money",
    featured: true,
    version: "contract v3",
    scopes: [
      { name: "charges.write", kind: "write", purpose: "Take a payment against an order." },
      { name: "refunds.write", kind: "write", purpose: "Return money for a captured payment." },
      { name: "payouts.read", kind: "read", purpose: "Reconcile settlement against the ledger." },
    ],
    operations: [
      { name: "capture_payment", direction: "action", summary: "Take a card payment for an order.", localEquivalent: "The order is held as awaiting payment with its full line detail and tax." },
      { name: "refund_payment", direction: "action", summary: "Return a captured amount.", localEquivalent: "A credit note is prepared against the invoice." },
      { name: "settlement_line", direction: "read", summary: "Read a payout line to reconcile.", localEquivalent: "Bank lines are imported from CSV and matched by hand." },
      { name: "payment_succeeded", direction: "webhook", summary: "Confirm a capture out of band.", localEquivalent: "Payment is marked only when a person confirms it." },
    ],
    limits: [
      "Card data never touches this application; a processor hosts the field itself.",
      "Refund windows and chargeback rules are set by the scheme, not by the processor.",
      "Settlement is usually one to three working days behind the capture.",
    ],
    unverified: ["Instant settlement", "Chargeback protection"],
    risk: { level: "high", note: "This moves money. A capture grant is the highest-consequence authorisation in the directory and should be held by one named person." },
  },
  "bank.feed": {
    category: "Money",
    featured: true,
    version: "contract v2",
    scopes: [
      { name: "accounts.read", kind: "read", purpose: "List the accounts the grant covers." },
      { name: "transactions.read", kind: "read", purpose: "Read statement lines for reconciliation." },
    ],
    operations: [
      { name: "list_accounts", direction: "read", summary: "Read the accounts a consent covers.", localEquivalent: "Accounts are recorded by hand in the chart of accounts." },
      { name: "list_transactions", direction: "read", summary: "Read dated statement lines.", localEquivalent: "Statement lines are imported from a CSV file and reconciled locally." },
      { name: "balance", direction: "read", summary: "Read a current balance.", localEquivalent: "Balances are computed from posted journals and labelled as such." },
    ],
    limits: [
      "Open banking consent expires, commonly after ninety days, and must be renewed by the account holder.",
      "History is usually limited to the last twelve to twenty-four months.",
      "A feed is read-only: no payment can be initiated through it.",
    ],
    unverified: ["Real-time balances for every institution", "Permanent consent"],
    risk: { level: "medium", note: "Read-only, but it exposes every transaction on the account to anything that can read this workspace." },
  },
  "tax.file": {
    category: "Money",
    featured: false,
    version: "contract v1",
    scopes: [
      { name: "returns.write", kind: "write", purpose: "Submit a prepared return for a period." },
      { name: "obligations.read", kind: "read", purpose: "Read which periods are open." },
      { name: "liabilities.read", kind: "read", purpose: "Read what the authority says is owed." },
    ],
    operations: [
      { name: "submit_return", direction: "action", summary: "File a return for an open period.", localEquivalent: "The return is prepared and its figures are computed from posted journals." },
      { name: "list_obligations", direction: "read", summary: "Read open periods and their deadlines.", localEquivalent: "Periods are tracked as obligations in the workspace." },
    ],
    limits: [
      "Filing credentials are issued to a person or an agent, never to an application alone.",
      "A submitted return cannot be withdrawn; it is corrected by a later amendment.",
      "Each jurisdiction has its own contract; one connector does not cover several.",
    ],
    unverified: ["Filing in every jurisdiction", "Automatic correction of a rejected return"],
    risk: { level: "high", note: "A submission is a legal statement. It should never be automatic and never be made by an agent on its own." },
  },
  "model.inference": {
    category: "Intelligence",
    featured: true,
    version: "contract v4",
    scopes: [
      { name: "inference.write", kind: "write", purpose: "Send a prompt and receive a completion." },
      { name: "usage.read", kind: "read", purpose: "Read token usage for cost reporting." },
    ],
    operations: [
      { name: "complete", direction: "action", summary: "Answer a prompt with the records named in it.", localEquivalent: "Answers are composed from records in this workspace, with the records named." },
      { name: "embed", direction: "action", summary: "Turn text into a vector for retrieval.", localEquivalent: "Search matches on the text of the records themselves." },
      { name: "usage", direction: "read", summary: "Read tokens consumed in a period.", localEquivalent: "No usage exists, because no call is made." },
    ],
    limits: [
      "Anything sent in a prompt leaves this browser, including whatever the prompt quotes.",
      "Rate limits and context windows are set by the provider and change without notice.",
      "A completion is not a source; it has to be checked against a record before it is acted on.",
    ],
    unverified: ["Factual accuracy", "Data never used for training"],
    risk: { level: "high", note: "The first connector that would send customer records out of the browser. Scope it to the smallest set of records that answers the question." },
  },
  "site.publish": {
    category: "Publishing",
    featured: true,
    version: "contract v2",
    scopes: [
      { name: "sites.write", kind: "write", purpose: "Upload a built site to a host." },
      { name: "domains.verify", kind: "write", purpose: "Prove the domain belongs to this workspace." },
      { name: "certificates.issue", kind: "write", purpose: "Obtain a certificate for the verified domain." },
      { name: "deployments.read", kind: "read", purpose: "Read whether a deployment is serving." },
    ],
    operations: [
      { name: "deploy_site", direction: "action", summary: "Upload pages and make them reachable.", localEquivalent: "The site model, pages and breakpoints are saved and exported as real HTML." },
      { name: "verify_domain", direction: "action", summary: "Confirm the DNS records exist.", localEquivalent: "The records a domain needs are recorded; the domain stays unverified." },
      { name: "deployment_state", direction: "read", summary: "Read whether the site is serving.", localEquivalent: "A site is never described as live without a verified domain and a recorded check." },
    ],
    limits: [
      "A certificate cannot be issued until DNS actually resolves to the host.",
      "Propagation makes verification eventually consistent; a first check often fails legitimately.",
      "Hosts apply their own limits on build minutes and bandwidth.",
    ],
    unverified: ["Zero-downtime for every change", "Unlimited bandwidth"],
    risk: { level: "medium", note: "Publishing makes content public. The gate is whether someone meant it to be, not whether the upload worked." },
  },
  "calendar.sync": {
    category: "Scheduling",
    featured: false,
    version: "contract v2",
    scopes: [
      { name: "events.read", kind: "read", purpose: "Read events so a booking does not double-book." },
      { name: "events.write", kind: "write", purpose: "Create and update bookings in the calendar." },
      { name: "freebusy.read", kind: "read", purpose: "Read availability without reading event detail." },
    ],
    operations: [
      { name: "create_event", direction: "action", summary: "Write a booking into a calendar.", localEquivalent: "Bookings live in this workspace and export as an ICS file." },
      { name: "list_events", direction: "read", summary: "Read events in a window.", localEquivalent: "Only bookings recorded here are known." },
      { name: "event_changed", direction: "webhook", summary: "Hear about a change made elsewhere.", localEquivalent: "A change made in another calendar is invisible until someone records it." },
    ],
    limits: [
      "Free-busy is the narrow scope; reading full events exposes everyone's meeting titles.",
      "Recurring events and time zones are where calendar connectors usually go wrong.",
      "Webhook subscriptions expire and must be renewed.",
    ],
    unverified: ["Conflict-free scheduling", "Instant two-way sync"],
    risk: { level: "low", note: "Prefer free-busy. Full event read is far wider than a booking tool needs." },
  },
  telephony: {
    category: "Communication",
    featured: false,
    version: "contract v1",
    scopes: [
      { name: "sms.send", kind: "write", purpose: "Send a text message." },
      { name: "calls.read", kind: "read", purpose: "Read call metadata for the activity record." },
    ],
    operations: [
      { name: "send_sms", direction: "action", summary: "Send one message to one number.", localEquivalent: "The message is kept as a draft against the customer." },
      { name: "call_record", direction: "read", summary: "Read who called, when and for how long.", localEquivalent: "Call notes are written by hand against the customer." },
      { name: "inbound_sms", direction: "webhook", summary: "Receive a reply.", localEquivalent: "A reply is recorded by hand." },
    ],
    limits: [
      "Numbers must be registered per country, and some require a local presence.",
      "Message content is regulated in several markets.",
      "Delivery receipts are best-effort and often unavailable.",
    ],
    unverified: ["Guaranteed delivery", "Global coverage"],
    risk: { level: "medium", note: "A send grant reaches customers directly on a channel they cannot easily filter." },
  },
};

export const CONNECTOR_ENTRIES: ConnectorEntry[] = PROVIDER_CAPABILITIES.map((capability) => ({
  capability,
  ...(DETAIL[capability.id] ?? {
    category: "Intelligence" as const,
    featured: false,
    version: "contract v1",
    scopes: [],
    operations: [],
    limits: [],
    unverified: [],
    risk: { level: "medium" as const, note: "No scope model has been published for this capability." },
  }),
}));

export function entryById(id: string): ConnectorEntry | undefined {
  return CONNECTOR_ENTRIES.find((entry) => entry.capability.id === id);
}

export const CATEGORIES = ["Money", "Communication", "Publishing", "Intelligence", "Scheduling"] as const;

/** Resolve a connector record in the workspace to its capability entry. */
export function entryForRecord(fields: Record<string, string | number | boolean>): ConnectorEntry | undefined {
  const capabilityId = String(fields.capabilityId ?? "");
  if (capabilityId) return entryById(capabilityId);
  const provider = String(fields.provider ?? "").toLowerCase();
  const map: Record<string, string> = {
    bank: "bank.feed", email: "email.send", payments: "payment.capture", mail: "email.send",
    hosting: "site.publish", model: "model.inference", calendar: "calendar.sync", telephony: "telephony", tax: "tax.file",
  };
  return map[provider] ? entryById(map[provider]) : undefined;
}

/** The steps an authorisation would take, and the one that cannot be reached. */
export interface WizardStep {
  id: string;
  title: string;
  detail: string;
  state: "done" | "current" | "blocked";
}

export function authorisationSteps(entry: ConnectorEntry): WizardStep[] {
  return [
    { id: "provider", title: "Choose the provider", detail: `${entry.capability.provider} for ${entry.capability.label.toLowerCase()}.`, state: "done" },
    { id: "scopes", title: "Review the scopes", detail: `${entry.scopes.filter((scope) => scope.kind === "write").length} write and ${entry.scopes.filter((scope) => scope.kind === "read").length} read scopes would be requested.`, state: "done" },
    { id: "redirect", title: "Leave for the provider", detail: "An authorisation is a redirect to a page this workspace does not control. There is no server here to redirect to, and no address to come back to.", state: "blocked" },
    { id: "account", title: "Choose the account", detail: "Shown by the provider after sign-in. Never reached.", state: "blocked" },
    { id: "callback", title: "Return with a grant", detail: "The provider would call back with a code to exchange for a token. Nothing can receive that call.", state: "blocked" },
    { id: "verify", title: "Verify with a read", detail: "A connection counts as working only after one real read succeeds.", state: "blocked" },
  ];
}

/* ------------------------- Custom adapters ------------------------- */

export interface AdapterOperation { name: string; kind: string; scopes: string[]; localEquivalent: string }

export function adapterOperations(body: unknown): AdapterOperation[] {
  const row = body && typeof body === "object" ? (body as { operations?: unknown }) : {};
  if (!Array.isArray(row.operations)) return [];
  return row.operations.map((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      name: typeof item.name === "string" ? item.name : "",
      kind: typeof item.kind === "string" ? item.kind : "",
      scopes: Array.isArray(item.scopes) ? item.scopes.filter((scope): scope is string => typeof scope === "string") : [],
      localEquivalent: typeof item.localEquivalent === "string" ? item.localEquivalent : "",
    };
  });
}

/** Problems with one declaration, checked against the operation contract. */
export function declarationProblems(row: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof row.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(row.name)) problems.push("name is required: lower case letters, digits and underscores.");
  if (!["action", "read", "webhook"].includes(String(row.kind))) problems.push('kind must be "action", "read" or "webhook".');
  if (!Array.isArray(row.scopes) || row.scopes.length === 0) problems.push("scopes must list at least one scope.");
  if (typeof row.localEquivalent !== "string" || !row.localEquivalent) problems.push("localEquivalent is required: every operation must say what happens while it is not connected.");
  return problems;
}

/** Contract tests over an adapter's real declarations. A live call is never claimed. */
export function adapterChecks(operations: AdapterOperation[]): { label: string; state: "pass" | "fail"; detail: string }[] {
  const names = operations.map((operation) => operation.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const actionsWithoutWrite = operations.filter((operation) => operation.kind === "action" && !operation.scopes.some((scope) => /write|send|create|update|delete/i.test(scope)));
  const noLocal = operations.filter((operation) => !operation.localEquivalent);
  const badKind = operations.filter((operation) => !["action", "read", "webhook"].includes(operation.kind));
  return [
    { label: "At least one operation is declared", state: operations.length ? "pass" : "fail", detail: `${operations.length} declared` },
    { label: "Operation names are unique within the adapter", state: duplicates.length ? "fail" : "pass", detail: duplicates.length ? `Repeated: ${[...new Set(duplicates)].join(", ")}` : "No repeats" },
    { label: "Every operation has a valid kind", state: badKind.length ? "fail" : "pass", detail: badKind.length ? badKind.map((operation) => operation.name).join(", ") : "action, read or webhook" },
    { label: "Every action declares a write scope", state: actionsWithoutWrite.length ? "fail" : "pass", detail: actionsWithoutWrite.length ? actionsWithoutWrite.map((operation) => operation.name).join(", ") : "Each action names one" },
    { label: "Every operation names a local equivalent", state: noLocal.length ? "fail" : "pass", detail: noLocal.length ? noLocal.map((operation) => operation.name).join(", ") : "Each says what happens while not connected" },
  ];
}
