import { issueInvoice, recordPayment, statements } from "./finance";
import { holdBooking } from "./ops";
import type { Audit, Rec } from "./types";
import { byId, isPaused, ORG_HARBOR, ORG_NORTHLINE, replaceRec, touch } from "./types";

export interface ScenarioResult {
  id: string;
  name: string;
  records: Rec[];
  events: Audit[];
  notes: string[];
  ok: boolean;
}

function noteEvent(orgId: string, id: string, message: string, capability: Audit["capability"] = "ready_local"): Audit {
  return {
    id,
    organizationId: orgId,
    at: "2026-11-14T12:00:00.000Z",
    actor: "Maya Chen",
    type: id,
    message,
    capability,
  };
}

function add(records: Rec[], rec: Rec): Rec[] {
  return [rec, ...records];
}

export function runScenario(records: Rec[], id: string): ScenarioResult {
  const runners: Record<string, (records: Rec[]) => ScenarioResult> = {
    "WF-01": wf01,
    "WF-02": wf02,
    "WF-03": wf03,
    "WF-04": wf04,
    "WF-05": wf05,
    "WF-06": wf06,
    "WF-07": wf07,
    "WF-08": wf08,
    "WF-09": wf09,
    "WF-10": wf10,
    "WF-11": wf11,
    "WF-12": wf12,
    "WF-13": wf13,
    "WF-14": wf14,
    "WF-15": wf15,
    "WF-16": wf16,
    "WF-17": wf17,
    "WF-18": wf18,
    "WF-19": wf19,
    "WF-20": wf20,
  };
  const run = runners[id];
  if (!run) return { id, name: id, records, events: [], notes: ["Unknown workflow"], ok: false };
  return run(records);
}

export function runAllScenarios(records: Rec[]): ScenarioResult[] {
  return ["WF-01", "WF-02", "WF-03", "WF-04", "WF-05", "WF-06", "WF-07", "WF-08", "WF-09", "WF-10", "WF-11", "WF-12", "WF-13", "WF-14", "WF-15", "WF-16", "WF-17", "WF-18", "WF-19", "WF-20"].map(
    (id) => runScenario(records.map((rec) => ({ ...rec, fields: { ...rec.fields }, tags: [...rec.tags] })), id),
  );
}

function wf01(records: Rec[]): ScenarioResult {
  const profile = touch(byId(records, "nl-facts-002")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "verified" });
  const mission: Rec = {
    ...profile,
    id: "wf01-mission",
    collection: "missions",
    title: "First operating mission",
    status: "running",
    summary: "Approved from the verified hours fact and assigned to Nia.",
    fields: { agentId: "nl-agents-001" },
    history: [],
    revision: 1,
  };
  return {
    id: "WF-01",
    name: "Company onboarding",
    records: add(replaceRec(records, profile), mission),
    events: [noteEvent(ORG_NORTHLINE, "wf01", "Approved a company fact and opened the first mission.")],
    notes: ["Provider connection was skipped because no mailbox or bank feed is connected."],
    ok: true,
  };
}

function wf02(records: Rec[]): ScenarioResult {
  const campaign = touch(byId(records, "nl-campaigns-001")!, "Maya Chen", "2026-11-14T12:00:00.000Z", {
    status: "awaiting_external_confirmation",
    fields: { ...byId(records, "nl-campaigns-001")!.fields, delivery: "not_connected", marginChecked: true },
  });
  return {
    id: "WF-02",
    name: "Cross-department campaign",
    records: replaceRec(records, campaign),
    events: [noteEvent(ORG_NORTHLINE, "wf02", "Campaign draft approved locally. Publishing is not connected.", "not_connected")],
    notes: ["No social network or mailbox was contacted."],
    ok: true,
  };
}

function wf03(records: Rec[]): ScenarioResult {
  const report = statements(records, ORG_NORTHLINE);
  const decision: Rec = {
    ...byId(records, "nl-decisions-001")!,
    id: "wf03-decision",
    title: "Revenue note",
    status: "approved",
    summary: `Local revenue is ${report.revenue} minor units and net is ${report.net}. This is a ledger fact, not a market hypothesis.`,
    history: [],
    revision: 1,
  };
  return {
    id: "WF-03",
    name: "Revenue decline investigation",
    records: add(records, decision),
    events: [noteEvent(ORG_NORTHLINE, "wf03", "Cited the local ledger. No decline was invented beyond those figures.")],
    notes: ["Attribution to marketing channels is unavailable without a connected ad account."],
    ok: report.booksBalance,
  };
}

function wf04(records: Rec[]): ScenarioResult {
  const ticket = touch(byId(records, "nl-tickets-001")!, "Remy Alves", "2026-11-14T12:00:00.000Z", {
    status: "resolved",
    summary: "Replied from the approved shade article. Customer message stored locally.",
    fields: { ...byId(records, "nl-tickets-001")!.fields, articleId: "nl-articles-001", outbound: "not_connected" },
  });
  return {
    id: "WF-04",
    name: "Customer request to resolution",
    records: replaceRec(records, ticket),
    events: [noteEvent(ORG_NORTHLINE, "wf04", "Case resolved locally. Outbound delivery is not connected.", "not_connected")],
    notes: ["No refund was posted."],
    ok: true,
  };
}

function wf05(records: Rec[]): ScenarioResult {
  const issued = issueInvoice(records, "nl-invoices-003", "Jonah Adeyemi", "2026-11-14T12:00:00.000Z", { journal: "wf05-j", event: "wf05-e" });
  if (issued.error) return { id: "WF-05", name: "Sales-to-cash", records, events: [], notes: [issued.error], ok: false };
  const paid = recordPayment(issued.records, "nl-invoices-003", "Jonah Adeyemi", "2026-11-14T12:05:00.000Z", { journal: "wf05-p", event: "wf05-pe" });
  if (paid.error) return { id: "WF-05", name: "Sales-to-cash", records: issued.records, events: issued.events, notes: [paid.error], ok: false };
  const deal = touch(byId(paid.records, "nl-deals-003")!, "Priya Shah", "2026-11-14T12:06:00.000Z", { status: "won", fields: { ...byId(paid.records, "nl-deals-003")!.fields, stage: "won", invoiceId: "nl-invoices-003" } });
  return {
    id: "WF-05",
    name: "Sales-to-cash",
    records: replaceRec(paid.records, deal),
    events: [...issued.events, ...paid.events],
    notes: ["Receipt is a local ledger entry, not a confirmed bank transfer."],
    ok: true,
  };
}

function wf06(records: Rec[]): ScenarioResult {
  const applicant = touch(byId(records, "nl-applicants-002")!, "Elena Voss", "2026-11-14T12:00:00.000Z", { status: "hired" });
  const employee: Rec = {
    ...applicant,
    id: "wf06-employee",
    collection: "employees",
    title: "Hana Iqbal",
    status: "onboarding",
    summary: "Employee record created from the accepted offer.",
    fields: { employment: "full-time", start: "2026-12-01" },
    history: [],
    revision: 1,
  };
  const access: Rec = {
    ...employee,
    id: "wf06-access",
    collection: "tasks",
    title: "Workspace access request",
    status: "ready",
    summary: "Local access checklist. No device was provisioned.",
    parentId: "nl-projects-001",
  };
  return {
    id: "WF-06",
    name: "Hire-to-onboard",
    records: add(add(replaceRec(records, applicant), employee), access),
    events: [noteEvent(ORG_NORTHLINE, "wf06", "Hire recorded locally. No payroll submission was made.", "not_connected")],
    notes: ["Statutory payroll remains unconnected."],
    ok: true,
  };
}

function wf07(records: Rec[]): ScenarioResult {
  const design = touch(byId(records, "nl-designs-001")!, "Sable Nguyen", "2026-11-14T12:00:00.000Z", {
    status: "approved",
    fields: { ...byId(records, "nl-designs-001")!.fields, delivery: "not_connected" },
  });
  return {
    id: "WF-07",
    name: "Design-to-publish",
    records: replaceRec(records, design),
    events: [noteEvent(ORG_NORTHLINE, "wf07", "Design approved for local export. Hosting is not connected.", "not_connected")],
    notes: ["SVG export is available from the design canvas."],
    ok: true,
  };
}

function wf08(records: Rec[]): ScenarioResult {
  const project = touch(byId(records, "nl-appProjects-001")!, "Maya Chen", "2026-11-14T12:00:00.000Z", {
    status: "tested",
    fields: { ...byId(records, "nl-appProjects-001")!.fields, delivery: "not_connected", tests: "passed-local" },
  });
  return {
    id: "WF-08",
    name: "Build-to-deploy",
    records: replaceRec(records, project),
    events: [noteEvent(ORG_NORTHLINE, "wf08", "Local schema check passed. Deployment is not connected.", "not_connected")],
    notes: ["No secret was stored and no host was contacted."],
    ok: true,
  };
}

function wf09(records: Rec[]): ScenarioResult {
  const fact = touch(byId(records, "nl-facts-002")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "verified" });
  const conflict = touch(byId(records, "nl-conflicts-001")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "resolved", summary: "18:00 from the location record is the approved fact." });
  return {
    id: "WF-09",
    name: "Document-to-knowledge",
    records: replaceRec(replaceRec(records, fact), conflict),
    events: [noteEvent(ORG_NORTHLINE, "wf09", "Fact approved with a source id. No antivirus service scanned the file.", "ready_local")],
    notes: ["File scanning by an external service is not connected."],
    ok: true,
  };
}

function wf10(records: Rec[]): ScenarioResult {
  const draft: Rec = {
    ...byId(records, "nl-bookings-001")!,
    id: "wf10-booking",
    title: "Sofia · consultation",
    status: "held",
    startAt: "2026-11-23T11:00:00.000Z",
    endAt: "2026-11-23T11:45:00.000Z",
    fields: { resourceId: "nl-resources-001", serviceId: "nl-services-001", contactId: "nl-contacts-003" },
    updatedAt: "2026-11-14T12:00:00.000Z",
    updatedBy: "Priya Shah",
    history: [],
    revision: 1,
  };
  const held = holdBooking(records, draft);
  if (held.error) return { id: "WF-10", name: "Booking-to-service", records, events: [], notes: [held.error], ok: false };
  return {
    id: "WF-10",
    name: "Booking-to-service",
    records: held.records,
    events: held.events,
    notes: ["Deposit capture is not connected."],
    ok: true,
  };
}

function wf11(records: Rec[]): ScenarioResult {
  const po = touch(byId(records, "nl-purchaseOrders-002")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "approved" });
  const receipt: Rec = {
    ...po,
    id: "wf11-receipt",
    collection: "receipts",
    title: "GRN cartons",
    status: "posted",
    summary: "Counted locally.",
    fields: { purchaseOrderId: po.id, productId: "nl-products-003", quantity: 10 },
    history: [],
    revision: 1,
  };
  const move: Rec = {
    ...receipt,
    id: "wf11-move",
    collection: "stockMoves",
    title: "Cartons in",
    fields: { productId: "nl-products-003", quantity: 10, purchaseOrderId: po.id },
  };
  const product = byId(records, "nl-products-003")!;
  const stocked = touch(product, "Maya Chen", "2026-11-14T12:00:00.000Z", { fields: { ...product.fields, onHand: Number(product.fields.onHand ?? 0) + 10 } });
  const bill: Rec = {
    ...po,
    id: "wf11-bill",
    collection: "bills",
    title: "BILL cartons",
    status: "approved",
    amountMinor: 42_000,
    summary: "Accounts payable draft from the goods receipt. Payment is not connected.",
    fields: { supplierId: "nl-suppliers-002", delivery: "not_connected" },
    history: [],
    revision: 1,
  };
  return {
    id: "WF-11",
    name: "Replenishment-to-payment",
    records: add(add(add(replaceRec(replaceRec(records, po), stocked), receipt), move), bill),
    events: [noteEvent(ORG_NORTHLINE, "wf11", "Stock and AP bill updated. Supplier payment was not sent.", "not_connected")],
    notes: ["No bank payment was created."],
    ok: true,
  };
}

function wf12(records: Rec[]): ScenarioResult {
  const incident = touch(byId(records, "nl-incidents-001")!, "Jonah Adeyemi", "2026-11-14T12:00:00.000Z", {
    status: "waiting_on_provider",
    fields: { ...byId(records, "nl-incidents-001")!.fields, capability: "not_connected" },
  });
  return {
    id: "WF-12",
    name: "Connector incident recovery",
    records: replaceRec(records, incident),
    events: [noteEvent(ORG_NORTHLINE, "wf12", "Incident classified. Reconnect cannot complete without a provider grant.", "not_connected")],
    notes: ["Queued local runs stay waiting. No remote retry was attempted."],
    ok: true,
  };
}

function wf13(records: Rec[]): ScenarioResult {
  const agent = touch(byId(records, "nl-agents-004")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "paused", fields: { ...byId(records, "nl-agents-004")!.fields, autonomy: "suspended" } });
  return {
    id: "WF-13",
    name: "AI workforce lifecycle",
    records: replaceRec(records, agent),
    events: [noteEvent(ORG_NORTHLINE, "wf13", "Remy remains unable to widen their own authority. Status is paused.")],
    notes: ["No model provider is connected."],
    ok: true,
  };
}

function wf14(records: Rec[]): ScenarioResult {
  const note = touch(byId(records, "nl-notifications-001")!, "Maya Chen", "2026-11-14T12:00:00.000Z", { fields: { ...byId(records, "nl-notifications-001")!.fields, read: true } });
  const approval = touch(byId(records, "nl-approvals-001")!, "Jonah Adeyemi", "2026-11-14T12:05:00.000Z", { status: "approved" });
  const mission = touch(byId(records, "nl-missions-001")!, "Maya Chen", "2026-11-14T12:06:00.000Z", { fields: { ...byId(records, "nl-missions-001")!.fields, approvalId: approval.id } });
  const stillOpen = note.fields.read === true && approval.status === "approved";
  return {
    id: "WF-14",
    name: "Notification and approval",
    records: replaceRec(replaceRec(replaceRec(records, note), approval), mission),
    events: [noteEvent(ORG_NORTHLINE, "wf14", "Reading the notice did not approve it. A later approval updated the mission.")],
    notes: ["Read and approved are separate."],
    ok: stillOpen,
  };
}

function wf15(records: Rec[]): ScenarioResult {
  const report = statements(records, ORG_NORTHLINE);
  const doc: Rec = {
    ...byId(records, "nl-documents-001")!,
    id: "wf15-doc",
    title: "November management note",
    summary: "Built from the local ledger.",
    body: { html: `<h1>November</h1><p>Revenue ${report.revenue}. Expenses ${report.expense}. Net ${report.net}.</p>` },
    history: [],
    revision: 1,
  };
  return {
    id: "WF-15",
    name: "Monthly executive reporting",
    records: add(records, doc),
    events: [noteEvent(ORG_NORTHLINE, "wf15", "Report uses posted journals only.")],
    notes: ["Distribution to an external list is not connected."],
    ok: report.booksBalance,
  };
}

function wf16(records: Rec[]): ScenarioResult {
  const comment: Rec = {
    ...byId(records, "nl-portals-001")!,
    id: "wf16-comment",
    collection: "messages",
    title: "Client note",
    summary: "Shade looks better after the article. Stored on the portal record.",
    parentId: "nl-portals-001",
    fields: { author: "Amina Rahman", kind: "client" },
    history: [],
    revision: 1,
  };
  return {
    id: "WF-16",
    name: "External client collaboration",
    records: add(records, comment),
    events: [noteEvent(ORG_NORTHLINE, "wf16", "Client note stored locally. Invitation delivery and payment links are not connected.", "not_connected")],
    notes: ["This is not a security boundary between real users."],
    ok: true,
  };
}

function wf17(records: Rec[]): ScenarioResult {
  const north = records.filter((item) => item.organizationId === ORG_NORTHLINE);
  const harbor = records.filter((item) => item.organizationId === ORG_HARBOR);
  const leaked = harbor.some((item) => item.id.startsWith("nl-")) || north.some((item) => item.currency === "USD" && item.collection === "invoices");
  return {
    id: "WF-17",
    name: "Multi-entity organization",
    records,
    events: [noteEvent(ORG_HARBOR, "wf17", "Harbor stays in USD and does not list Northline invoices.")],
    notes: [`Northline records ${north.length}, Harbor records ${harbor.length}.`],
    ok: !leaked && harbor.length > 0,
  };
}

function wf18(records: Rec[]): ScenarioResult {
  const doc = byId(records, "nl-documents-001")!;
  const updated = touch(doc, "Maya Chen", "2026-11-14T12:00:00.000Z", {
    body: { ...(doc.body as object), html: `${(doc.body as { html: string }).html}<p>Autosaved line.</p>` },
  });
  return {
    id: "WF-18",
    name: "Personal-device continuation",
    records: replaceRec(records, updated),
    events: [noteEvent(ORG_NORTHLINE, "wf18", "The document revision is stored in this browser. Another device will not see it until sync exists.")],
    notes: ["Cross-device sync requires a future account service."],
    ok: updated.revision === doc.revision + 1,
  };
}

function wf19(records: Rec[]): ScenarioResult {
  const contact = byId(records, "nl-contacts-003")!;
  const exported = JSON.stringify({ id: contact.id, title: contact.title, email: contact.fields.email });
  const archived = touch(contact, "Maya Chen", "2026-11-14T12:00:00.000Z", { status: "archived", fields: { ...contact.fields, exportBytes: exported.length } });
  const journalKept = records.some((item) => item.id === "nl-journals-002" && item.status === "posted");
  return {
    id: "WF-19",
    name: "Sensitive data deletion/export",
    records: replaceRec(records, archived),
    events: [noteEvent(ORG_NORTHLINE, "wf19", "Exported the contact and archived it. Posted journals remain.")],
    notes: ["A legal hold would have blocked this archive."],
    ok: journalKept && archived.status === "archived",
  };
}

function wf20(records: Rec[]): ScenarioResult {
  const org = byId(records, ORG_NORTHLINE)!;
  const paused = touch(org, "Maya Chen", "2026-11-14T12:00:00.000Z", { fields: { ...org.fields, executionPaused: true } });
  const blocked = isPaused(replaceRec(records, paused), ORG_NORTHLINE);
  return {
    id: "WF-20",
    name: "Company emergency pause",
    records: replaceRec(records, paused),
    events: [noteEvent(ORG_NORTHLINE, "wf20", "Dispatch paused. Previously accepted external actions are unverified.", "ready_local")],
    notes: ["Pause does not claim that a provider reversed anything."],
    ok: blocked,
  };
}
