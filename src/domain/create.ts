import { findBookingConflict } from "./ops";
import type { Rec } from "./types";
import { currencyFor, inOrg } from "./types";

export const DETAIL_ROUTES: Record<string, string> = {
  invoices: "/o/:org/fin/invoices/:id",
  deals: "/o/:org/crm/deals/:id",
  contacts: "/o/:org/crm/contacts/:id",
  agents: "/o/:org/team/agents/:id",
  documents: "/o/:org/docs/documents/:id",
  designs: "/o/:org/design/files/:id",
  workbooks: "/o/:org/sheets/workbooks/:id",
  decks: "/o/:org/present/decks/:id",
  missions: "/o/:org/mission/missions/:id",
  tasks: "/o/:org/project/tasks/:id",
  employees: "/o/:org/hr/employees/:id",
  projects: "/o/:org/project/projects/:id",
  candidates: "/o/:org/hr/candidates/:id",
};

export function detailRoute(collection: string): string | undefined {
  return DETAIL_ROUTES[collection];
}

export interface CreateInput {
  orgId: string;
  actor: string;
  now: string;
  ids: () => string;
  collection: string;
  title?: string;
  summary?: string;
}

export function enrichCreated(records: Rec[], created: Rec, input: CreateInput): { primary: Rec; extra: Rec[]; navigate?: string } {
  const extra: Rec[] = [];
  const contact = inOrg(records, input.orgId, "contacts")[0];
  const project = inOrg(records, input.orgId, "projects")[0];
  const department = inOrg(records, input.orgId, "departments")[0];
  const agent = inOrg(records, input.orgId, "agents")[0];
  const currency = currencyFor(input.orgId);
  const taxRate = currency === "GBP" ? 0.2 : 0;

  if (input.title && created.collection !== "invoices") created.title = input.title;

  if (created.collection === "invoices") {
    const count = inOrg(records, input.orgId, "invoices").length + 1;
    const net = 48000;
    const tax = Math.round(net * taxRate);
    created.title = `INV-${1100 + count}`;
    created.status = "draft";
    created.amountMinor = net + tax;
    created.dueAt = "2026-12-14";
    created.summary = input.summary || (contact ? `Draft for ${contact.title}. Not issued and not sent.` : "Draft invoice. Not issued and not sent.");
    created.fields = {
      number: created.title,
      netMinor: net,
      taxMinor: tax,
      contactId: contact?.id ?? "",
      revenueCode: "4000",
    };
    created.body = {
      lines: [{ description: input.title || "Professional services", qty: 1, unitMinor: net, netMinor: net, taxMinor: tax }],
    };
  }

  if (created.collection === "deals") {
    created.status = "discovery";
    created.amountMinor = created.amountMinor ?? 180000;
    created.fields = { stage: "discovery", contactId: contact?.id ?? "", probability: 20 };
    created.summary = input.summary || "Discovery deal saved in this workspace.";
  }

  if (created.collection === "agents") {
    created.title = input.title || "New specialist";
    created.status = "training";
    created.tags = ["local", "ai"];
    created.fields = { kind: "ai", role: "specialist", model: "not_connected", autonomy: "draft", departmentId: department?.id ?? "" };
    created.summary = input.summary || "Local agent contract. No language model is connected.";
    extra.push(memberFrom(created, input.ids(), "ai", "agent"));
  }

  if (created.collection === "employees") {
    created.status = "active";
    created.fields = { employment: "full-time", departmentId: department?.id ?? "" };
    created.summary = input.summary || "Employee record saved in this workspace.";
    extra.push(memberFrom(created, input.ids(), "human", "employee"));
  }

  if (created.collection === "missions") {
    created.status = "proposed";
    created.fields = { agentId: agent?.id ?? "", budgetMinor: 0, spentMinor: 0 };
    created.summary = input.summary || "Proposed mission. Dispatch stays in this browser.";
    extra.push({
      ...created,
      id: input.ids(),
      collection: "missionTasks",
      title: "First local step",
      status: "ready",
      parentId: created.id,
      summary: "Created with the mission.",
      fields: { stage: "ready", assignee: input.actor },
      body: undefined,
      amountMinor: undefined,
    });
  }

  if (created.collection === "tasks") {
    created.status = "ready";
    created.parentId = project?.id;
    created.fields = { stage: "ready", assignee: input.actor };
    created.summary = input.summary || (project ? `On ${project.title}.` : "Project task saved in this workspace.");
  }

  if (created.collection === "documents") {
    created.summary = input.summary || "Editable document stored in this browser.";
    created.body = { html: `<h2>${created.title}</h2><p></p>`, comments: [] };
  }

  if (created.collection === "workbooks") {
    created.summary = input.summary || "Local grid. Formulas calculate in the browser.";
    created.body = {
      sheets: [{ name: "Sheet", rows: 12, cols: 6, cells: { A1: "Item", B1: "Amount", B2: "1", B3: "2", B4: "=SUM(B2:B3)" } }],
    };
  }

  if (created.collection === "decks") {
    created.summary = input.summary || "Editable slides stored in this browser.";
    created.body = {
      theme: { background: "#F7F8FC", ink: "#17223A", accent: "#234FE8" },
      index: 0,
      slides: [{ id: "s1", title: created.title, elements: [{ id: "e1", type: "text", x: 48, y: 64, w: 400, h: 80, text: created.title, fill: "#17223A" }] }],
    };
  }

  if (created.collection === "designs") {
    created.summary = input.summary || "Vector file stored in this browser.";
    created.body = {
      nodes: [
        { id: "n1", type: "rect", x: 48, y: 48, w: 220, h: 120, fill: "#234FE8", text: "" },
        { id: "n2", type: "text", x: 64, y: 96, w: 180, h: 28, fill: "#F7F8FC", text: created.title },
      ],
    };
  }

  if (created.collection === "photos") {
    created.summary = input.summary || "Layer stack stored in this browser.";
    created.body = {
      width: 640,
      height: 400,
      layers: [
        { id: "l1", name: "Ground", kind: "solid", color: "#141A30", opacity: 1, brightness: 0, contrast: 0, hidden: false },
        { id: "l2", name: "Subject", kind: "solid", color: "#FFAE7C", opacity: 0.9, brightness: 0, contrast: 0, hidden: false, x: 180, y: 80, w: 200, h: 200 },
      ],
    };
  }

  if (created.collection === "publications") {
    created.summary = input.summary || "Local page layout.";
    created.body = { pages: [{ id: "p1", name: "Page 1", frames: [{ id: "f1", x: 40, y: 48, w: 320, h: 80, text: created.title }] }] };
  }

  if (created.collection === "videos") {
    created.summary = input.summary || "Timeline stored in this browser. Export writes a project file, not a hosted film.";
    created.body = {
      duration: 12,
      tracks: [{ id: "t1", name: "Picture", clips: [{ id: "c1", title: created.title, start: 0, duration: 12, color: "#234FE8" }] }],
      captions: [{ start: 0, end: 12, text: created.title }],
    };
  }

  if (created.collection === "motions") {
    created.summary = input.summary || "Keyframes play in the browser.";
    created.body = {
      duration: 2,
      layers: [
        { id: "m1", name: "Opacity", keyframes: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
        { id: "m2", name: "Y", keyframes: [{ t: 0, v: 24 }, { t: 1, v: 0 }] },
      ],
    };
  }

  if (created.collection === "sites") {
    created.summary = input.summary || "Local site model. Publishing a hostname is not connected.";
    created.fields = { ...created.fields, delivery: "not_connected" };
    created.body = {
      pages: [{
        id: "home",
        name: "Home",
        blocks: [{ id: "b1", type: "hero", props: { title: created.title, body: "Saved in this browser." } }],
      }],
    };
  }

  if (created.collection === "appProjects") {
    created.summary = input.summary || "Local app schema. Hosting is not connected.";
    created.fields = { ...created.fields, delivery: "not_connected" };
    created.body = {
      files: [{ path: "readme.md", content: `# ${created.title}\nLocal project notes.\n` }],
      schema: { tables: [{ name: "records", fields: ["name", "status"] }] },
    };
  }

  if (created.collection === "forms") {
    created.summary = input.summary || "Form stored in this browser.";
    created.body = { fields: [{ id: "f1", type: "text", label: "Name", required: true }] };
  }

  if (created.collection === "workflows") {
    created.status = "draft";
    created.summary = input.summary || "Local workflow. External delivery is not connected.";
    created.body = {
      nodes: [
        { id: "w1", type: "trigger", label: "Record saved", x: 40, y: 80 },
        { id: "w2", type: "action", label: "Update status", x: 260, y: 80 },
      ],
      edges: [{ from: "w1", to: "w2" }],
    };
  }

  if (created.collection === "journals") {
    const bank = inOrg(records, input.orgId, "accounts").find((item) => item.fields.code === "1000");
    const expense = inOrg(records, input.orgId, "accounts").find((item) => item.fields.code === "6200");
    created.title = input.title || "Draft journal";
    created.status = "draft";
    created.summary = "Balanced draft. Post it when Finance agrees.";
    created.body = {
      date: input.now.slice(0, 10),
      memo: "Draft journal",
      lines: bank && expense
        ? [
            { accountId: expense.id, debitMinor: 1000, creditMinor: 0 },
            { accountId: bank.id, debitMinor: 0, creditMinor: 1000 },
          ]
        : [],
    };
  }

  if (created.collection === "accounts") {
    const code = String(8000 + inOrg(records, input.orgId, "accounts").length);
    created.fields = { code, type: "expense" };
    created.title = input.title || `Account ${code}`;
    created.summary = input.summary || "Local chart account. It has no posted activity yet.";
  }

  if (created.collection === "bookings") {
    created.startAt = "2026-11-21T10:00:00.000Z";
    created.endAt = "2026-11-21T10:45:00.000Z";
    created.fields = { resourceId: "nl-resources-001", serviceId: "nl-services-001" };
    const conflict = findBookingConflict(records, input.orgId, "nl-resources-001", created.startAt, created.endAt);
    if (conflict) {
      created.startAt = "2026-11-22T10:00:00.000Z";
      created.endAt = "2026-11-22T10:45:00.000Z";
    }
    created.status = "held";
    created.summary = input.summary || "Local hold. A deposit provider is not connected.";
  }

  if (input.summary && created.collection !== "invoices" && created.collection !== "journals") {
    created.summary = input.summary;
  }

  return { primary: created, extra, navigate: detailRoute(created.collection) };
}

function memberFrom(source: Rec, id: string, kind: "ai" | "human", role: string): Rec {
  return {
    ...source,
    id,
    collection: "members",
    status: "active",
    parentId: source.id,
    summary: kind === "ai" ? "Directory entry for a local AI employee. No model is connected." : "Directory entry for a local employee.",
    tags: [kind, "local"],
    fields: { kind, role, departmentId: String(source.fields.departmentId ?? ""), agentId: kind === "ai" ? source.id : "", employeeId: kind === "human" ? source.id : "" },
    body: undefined,
    amountMinor: undefined,
    history: [],
    revision: 1,
  };
}

export const DEAL_STAGES = ["new", "discovery", "qualified", "proposal", "negotiation", "won"] as const;

export function nextStage(stage: string): string {
  const order: readonly string[] = (DEAL_STAGES as readonly string[]).includes(stage)
    ? DEAL_STAGES
    : ["ready", "doing", "review", "done"];
  const index = order.indexOf(stage);
  if (index < 0) return stage;
  return order[Math.min(order.length - 1, index + 1)];
}
