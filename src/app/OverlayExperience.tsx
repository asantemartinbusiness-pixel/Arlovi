import { useLiveQuery } from "dexie-react-hooks";
import type { ScreenContext } from "@/platform/registry";
import { getRecordInOrg } from "@/platform/repo";

/**
 * App identity is explicit, rather than inferred from an overlay's English
 * title. Every native app retains its own screens, records and renderers.
 * This layer only supplies location and the actual record when one is known.
 */
export const NATIVE_OVERLAY_DOMAINS = {
  HQ: { name: "Headquarters", entity: "Workspace record", group: "operations" },
  INBOX: { name: "Inbox", entity: "Attention item", group: "operations" },
  ASSET: { name: "Assets", entity: "Asset", group: "creative" },
  ADMIN: { name: "Administration", entity: "Governance record", group: "governance" },
  AI: { name: "Ask Arlovi", entity: "Conversation", group: "intelligence" },
  BRAIN: { name: "Company Brain", entity: "Knowledge source", group: "intelligence" },
  TEAM: { name: "AI Workforce", entity: "AI employee", group: "intelligence" },
  MISSION: { name: "Missions", entity: "Mission", group: "intelligence" },
  AUTO: { name: "Automation", entity: "Workflow", group: "intelligence" },
  ANALYTICS: { name: "Analytics", entity: "Report", group: "operations" },
  FIN: { name: "Finance", entity: "Financial record", group: "finance" },
  CRM: { name: "CRM", entity: "Relationship record", group: "growth" },
  HR: { name: "People", entity: "People record", group: "people" },
  PROJECT: { name: "Projects", entity: "Project record", group: "operations" },
  COMMS: { name: "Communications", entity: "Conversation", group: "people" },
  CARE: { name: "Customer Care", entity: "Support case", group: "people" },
  LEGAL: { name: "Legal", entity: "Legal matter", group: "governance" },
  MARKET: { name: "Marketing", entity: "Campaign", group: "growth" },
  COMMERCE: { name: "Commerce", entity: "Commerce record", group: "growth" },
  BOOK: { name: "Bookings", entity: "Booking", group: "growth" },
  PROC: { name: "Procurement", entity: "Purchase record", group: "finance" },
  PORTAL: { name: "Portals", entity: "Shared portal record", group: "people" },
  DOCS: { name: "Documents", entity: "Document", group: "creative" },
  SHEETS: { name: "Sheets", entity: "Workbook", group: "creative" },
  PRESENT: { name: "Presentations", entity: "Presentation", group: "creative" },
  DESIGN: { name: "Design", entity: "Design document", group: "creative" },
  PHOTO: { name: "Photo", entity: "Image", group: "creative" },
  LAYOUT: { name: "Layout", entity: "Publication", group: "creative" },
  VIDEO: { name: "Video", entity: "Video project", group: "creative" },
  MOTION: { name: "Motion", entity: "Motion composition", group: "creative" },
  WEB: { name: "Web", entity: "Website", group: "creative" },
  BUILD: { name: "Build", entity: "App project", group: "creative" },
  FORMS: { name: "Forms", entity: "Form", group: "operations" },
  CONNECT: { name: "Integrations", entity: "Connection", group: "governance" },
  IT: { name: "IT", entity: "IT service", group: "governance" },
} as const;

/** Documented collection names become precise labels on record-backed overlays. */
export const OVERLAY_ENTITY_LABELS: Readonly<Record<string, string>> = {
  accounts: "Account", activities: "Activity", agents: "AI employee",
  announcements: "Announcement", appProjects: "App project", applicants: "Applicant",
  approvals: "Approval", articles: "Article", assets: "Asset", audiences: "Audience",
  bankTransactions: "Bank transaction", bills: "Bill", bookings: "Booking",
  brands: "Brand", budgets: "Budget", calls: "Call", campaigns: "Campaign",
  channels: "Channel", companies: "Company", conflicts: "Conflict",
  connectors: "Connection", contacts: "Contact", contracts: "Contract",
  conversations: "Conversation", datasets: "Dataset", deals: "Deal",
  decisions: "Decision", decks: "Presentation", departments: "Department",
  designs: "Design document", documents: "Document", emailThreads: "Email thread",
  employees: "Employee", evaluations: "Evaluation", expenses: "Expense",
  facts: "Fact", forms: "Form", incidents: "Incident", invoices: "Invoice",
  journals: "Journal", leads: "Lead", leaveRequests: "Leave request",
  legalEntities: "Legal entity", locations: "Location", macros: "Macro",
  meetings: "Meeting", members: "Member", messages: "Message", missions: "Mission",
  motions: "Composition", notifications: "Notification", objectives: "Objective",
  obligations: "Obligation", orders: "Order", payrollRuns: "Payroll run",
  photos: "Image", policies: "Policy", portals: "Portal", preferences: "Preference",
  products: "Product", projects: "Project", promotions: "Promotion",
  publications: "Publication", purchaseOrders: "Purchase order", quotes: "Quote",
  receipts: "Receipt", resources: "Resource", returns: "Return",
  reviews: "Review", risks: "Risk", services: "Service", shifts: "Shift",
  sites: "Site", skills: "Skill", slas: "SLA", socialPosts: "Social post",
  sources: "Source", stockMoves: "Stock movement", suppliers: "Supplier",
  tasks: "Task", taxCodes: "Tax code", templates: "Template", tickets: "Case",
  timelineEvents: "Timeline event", videos: "Video", warehouses: "Warehouse",
  workbooks: "Workbook", workflowRuns: "Workflow run", workflows: "Workflow",
};

type Domain = { name: string; entity: string; group: string };
export function nativeOverlayDomain(appCode: string): Domain {
  return NATIVE_OVERLAY_DOMAINS[appCode as keyof typeof NATIVE_OVERLAY_DOMAINS]
    ?? { name: appCode, entity: "Record", group: "operations" };
}

/** The origin is navigation context, not a generic intro or fake workflow step. */
export function OverlayOrigin({ context }: { context: ScreenContext }) {
  const domain = nativeOverlayDomain(context.screen.applicationCode);
  return (
    <span className="native-overlay-origin" data-group={domain.group}>
      <span>{domain.name}</span>
      <span className="native-overlay-divider" aria-hidden="true">/</span>
      <span>{context.screen.title}</span>
    </span>
  );
}

/** 
 * Show only a record actually resolved in this organisation. An unselected
 * list must never silently substitute its first record or leak another tenant.
 */
export function OverlayRecordContext({
  context, selection = false,
}: { context: ScreenContext; selection?: boolean }) {
  const payload = context.overlayPayload as { id?: unknown } | undefined;
  const payloadId = typeof payload?.id === "string" ? payload.id : undefined;
  const id = payloadId ?? context.params.id ?? (selection ? context.selectedId : undefined);
  const record = useLiveQuery(
    () => id ? getRecordInOrg(context.org.id, id) : Promise.resolve(undefined),
    [context.org.id, id],
  );
  if (!record) return null;
  const domain = nativeOverlayDomain(context.screen.applicationCode);
  return (
    <span className="native-overlay-record" title={record.title}>
      <span className="native-overlay-record-type">{OVERLAY_ENTITY_LABELS[record.collection] ?? domain.entity}</span>
      <strong className="native-overlay-record-title">{record.title}</strong>
      {record.status && <span className="native-overlay-record-state">{record.status.replaceAll("_", " ")}</span>}
    </span>
  );
}
