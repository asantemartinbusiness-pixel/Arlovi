import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass, X } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { useWorkspace } from "@/platform/workspace";
import type { Role } from "@/domain/types";
import "./role-first-run.css";

const RECOMMENDATIONS: Record<Exclude<Role, "owner">, { title: string; introduction: string; items: { title: string; detail: string; code?: string; path?: string }[] }> = {
  finance: {
    title: "Start with your financial workspace.",
    introduction: "Find the financial records, approvals and operational tools relevant to your responsibilities.",
    items: [
      { title: "Open Finance", detail: "Your ledger, payments and financial records", code: "FIN" },
      { title: "Review your work", detail: "Tasks, assignments and decisions", path: "work" },
      { title: "Find company resources", detail: "Shared documents and approved information", path: "resources" },
    ],
  },
  sales: {
    title: "Pick up your customer work.",
    introduction: "Move from assigned customers and opportunities to the next useful action.",
    items: [
      { title: "Open CRM", detail: "Accounts and opportunities", code: "CRM" },
      { title: "Check your work", detail: "Assigned projects and tasks", path: "work" },
      { title: "Open Communications", detail: "Continue customer conversations", code: "COMMS" },
    ],
  },
  people: {
    title: "Welcome to your people workspace.",
    introduction: "Keep employee records, team responsibilities and onboarding work in one place.",
    items: [
      { title: "Open People", detail: "Employee and team workflows", code: "HR" },
      { title: "Review company directory", detail: "People and collaboration records", path: "people" },
      { title: "Open team work", detail: "Assignments and approvals", path: "work" },
    ],
  },
  member: {
    title: "Your work starts here.",
    introduction: "Find your tasks, shared teams and the tools used in your company.",
    items: [
      { title: "My work", detail: "Projects, tasks and assignments", path: "work" },
      { title: "Team spaces", detail: "Departments and shared work", path: "spaces" },
      { title: "Applications", detail: "Relevant native tools", path: "apps" },
    ],
  },
  client: {
    title: "Your shared work, in one place.",
    introduction: "Review the information and requests available to your external collaboration experience.",
    items: [
      { title: "Open client portal", detail: "Shared customer-facing workspace", code: "PORTAL" },
      { title: "Review messages", detail: "Relevant conversations and updates", code: "COMMS" },
      { title: "Return to home", detail: "Your local workspace overview", path: "home" },
    ],
  },
};

export function RoleFirstRun() {
  const { org, role } = useWorkspace();
  const key = "arlovi-local-role-first-run-v1-" + org.id + "-" + role;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === "dismissed"; } catch { return false; }
  });
  if (role === "owner" || dismissed) return null;
  const current = RECOMMENDATIONS[role];
  if (!current) return null;
  function close() {
    try { localStorage.setItem(key,"dismissed"); } catch { /* local preference optional */ }
    setDismissed(true);
  }
  return <section className="role-welcome" aria-label="Role-specific starting guidance">
    <div className="role-welcome-icon"><Compass size={21}/></div>
    <div className="role-welcome-content">
      <span className="role-welcome-eyebrow">MY WORKSPACE / LOCAL ROLE PREVIEW</span>
      <h2>{current.title}</h2><p>{current.introduction}</p>
      <div className="role-welcome-actions">
        {current.items.map(item=><Link key={item.title} to={item.code ? appEntry(item.code, org.slug) : "/o/" + org.slug + "/workspace/" + item.path}>
          <span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={15}/>
        </Link>)}
      </div>
      <small className="role-welcome-note">This is an orientation for a local role view, not a verified invitation or account permission. Access rights must be enforced by a connected identity service.</small>
    </div>
    <button type="button" className="role-welcome-close" aria-label="Dismiss role guidance" onClick={close}><X size={17}/></button>
  </section>;
}
