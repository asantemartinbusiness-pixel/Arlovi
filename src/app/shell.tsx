import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { brand } from "@/brand";
import { NAV_GROUPS, appEntry, screens } from "@/app/catalog";
import { localAssistantReply } from "@/domain/assistant";
import { canOpenApp } from "@/domain/ops";
import { orgFromSlug, slugFor, touch } from "@/domain/types";
import { db, persistAll } from "@/runtime/db";
import { useUi } from "@/runtime/ui";

export function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <circle cx="24" cy="32" r="6" fill="#FFAE7C" />
      <circle cx="40" cy="32" r="6" fill="#36C5BA" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const ui = useUi();
  const navigate = useNavigate();
  const records = useLiveQuery(() => db.records.toArray(), []) ?? [];
  const orgId = records.find((record) => record.collection === "organizations" && record.fields.slug === "northline")?.id ?? "org-northline";
  const slug = slugFor(orgId);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setCommand(true);
      }
    };
    const online = () => ui.setOffline(false);
    const offline = () => ui.setOffline(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [ui]);
  const paused = records.find((record) => record.id === orgId)?.fields.executionPaused === true;
  return (
    <div className="shell" data-collapsed={ui.collapsed ? "true" : "false"} data-theme={ui.theme} data-density={ui.density} data-palette={ui.palette}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="header">
        <button className="icon-btn" type="button" onClick={() => ui.setMobileNav(!ui.mobileNav)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" /></svg>
          <span className="sr">Menu</span>
        </button>
        <Link to={`/o/${slug}/hq/home`} className="brand"><Mark /> {brand.name}</Link>
        <OrgSwitch />
        <div className="grow" />
        <button className="btn-ghost" type="button" onClick={() => ui.setCommand(true)}>Search</button>
        <button className="btn" type="button" onClick={() => ui.setAsk(true)}>{brand.ask}</button>
        <button className="icon-btn" type="button" onClick={() => ui.setNotes(!ui.notes)}><span className="sr">Notifications</span></button>
        <select id="role" value={ui.role} onChange={(event) => ui.setRole(event.target.value as typeof ui.role)} aria-label={`Role ${ui.role}`}>
          {["owner", "finance", "sales", "people", "member", "client"].map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <button className="btn-ghost" type="button" onClick={() => ui.setTheme(ui.theme === "light" ? "dark" : "light")}>{ui.theme === "light" ? "Dark" : "Light"}</button>
      </header>
      <div className="frame">
        <nav className={`sidebar ${ui.mobileNav ? "open" : ""}`} aria-label="Applications">
          <button className="btn-ghost" type="button" onClick={() => ui.setCollapsed(!ui.collapsed)}>{ui.collapsed ? "Expand" : "Collapse"}</button>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.codes.filter((code) => canOpenApp(ui.role, code)).map((code) => {
                const app = screens.find((screen) => screen.applicationCode === code);
                return (
                  <NavLink key={code} to={appEntry(code, slug)} className="nav-link" onClick={() => ui.setMobileNav(false)}>
                    <Mark /> <span>{app?.applicationName ?? code}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div>
          {ui.offline && <div className="banner" role="status">Offline. The local workspace remains available in this browser.</div>}
          {paused && (
            <div className="banner" role="status">
              New mission dispatch is paused. External actions already accepted elsewhere cannot be confirmed from here.
              {ui.role === "owner" && <button className="btn-ghost" type="button" onClick={() => resume(records, orgId, navigate)}>Resume dispatch</button>}
            </div>
          )}
          <main id="main">{children}</main>
          <nav className="bottom-nav" aria-label="Primary">
            <Link to={`/o/${slug}/hq/home`}>Home</Link>
            <Link to={`/o/${slug}/inbox/inbox`}>Inbox</Link>
            <Link to={`/o/${slug}/fin/home`}>Finance</Link>
            <Link to={`/o/${slug}/docs/files`}>Studio</Link>
            <button type="button" className="btn-ghost" onClick={() => ui.setMobileNav(true)}>More</button>
          </nav>
        </div>
      </div>
      {ui.command && <Command records={records} onClose={() => ui.setCommand(false)} />}
      {ui.ask && <Ask records={records} orgId={orgId} seed={ui.askSeed} onClose={() => ui.setAsk(false)} />}
      {ui.notes && <Notes records={records} onClose={() => ui.setNotes(false)} />}
      <div className="toasts" aria-live="polite">
        {ui.toasts.map((toast) => (
          <button key={toast.id} className="toast" type="button" onClick={() => ui.dismissToast(toast.id)}>
            <strong>{toast.title}</strong>
            <div>{toast.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

async function resume(records: Parameters<typeof persistAll>[0], orgId: string, _navigate: (path: string) => void) {
  const org = records.find((record) => record.id === orgId);
  if (!org) return;
  const next = records.map((record) => record.id === orgId ? touch(org, "Maya Chen", new Date().toISOString(), { fields: { ...org.fields, executionPaused: false } }) : record);
  await persistAll(next, []);
}

function OrgSwitch() {
  const navigate = useNavigate();
  const path = window.location.pathname;
  const slug = path.split("/")[2] ?? "northline";
  return (
    <select
        aria-label={`Organization ${slug === "harbor" ? "Harbor Supply" : "Northline Atelier"}`}
        value={slug}
        onChange={(event) => {
          const next = event.target.value;
          const parts = path.split("/");
          parts[2] = next;
          navigate(parts.join("/") || `/o/${next}/hq/home`);
        }}
      >
        <option value="northline">Northline Atelier</option>
        <option value="harbor">Harbor Supply</option>
      </select>
  );
}

function Command({ records, onClose }: { records: { id: string; title: string; organizationId: string; collection: string }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const slug = window.location.pathname.split("/")[2] ?? "northline";
  const orgId = orgFromSlug(slug);
  const hits = useMemo(() => {
    const q = query.toLowerCase();
    const pages = screens.filter((screen) => `${screen.title} ${screen.applicationName}`.toLowerCase().includes(q)).slice(0, 6);
    const rows = records.filter((record) => record.organizationId === orgId && record.title.toLowerCase().includes(q)).slice(0, 6);
    return { pages, rows };
  }, [query, records, orgId]);
  return (
    <div className="palette" role="dialog" aria-label="Search">
      <input className="search" autoFocus aria-label="Search workspace" value={query} onChange={(event) => setQuery(event.target.value)} />
      {hits.pages.map((screen) => (
        <button key={screen.id} className="hit" type="button" onClick={() => { navigate(screen.route.replace(":org", slug).replace(":id", screen.sampleId).replace(":slug", "showroom-consult")); onClose(); }}>
          {screen.applicationName} · {screen.title}
        </button>
      ))}
      {hits.rows.map((row) => <div key={row.id} className="hit">{row.title} · {row.collection}</div>)}
      <button className="btn-ghost" type="button" onClick={onClose}>Close</button>
    </div>
  );
}

function Ask({ records, orgId, seed, onClose }: { records: Parameters<typeof localAssistantReply>[0]; orgId: string; seed: string; onClose: () => void }) {
  const [prompt, setPrompt] = useState(seed);
  const [reply, setReply] = useState("");
  return (
    <div className="sheet" role="dialog" aria-label={brand.ask}>
      <h2>{brand.ask}</h2>
      <p className="meta">Using local workspace records. No language model is connected.</p>
      <textarea aria-label="Question" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button className="btn" type="button" onClick={() => setReply(localAssistantReply(records, orgId, prompt || "What needs attention?").text)}>Reply from records</button>
      {reply && <p>{reply}</p>}
      <button className="btn-ghost" type="button" onClick={onClose}>Close</button>
    </div>
  );
}

function Notes({ records, onClose }: { records: { id: string; title: string; summary: string; collection: string; fields: Record<string, string | number | boolean>; organizationId: string }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const notes = records.filter((record) => record.collection === "notifications");
  return (
    <div className="sheet" role="dialog" aria-label="Notifications">
      <h2>Notifications</h2>
      {notes.map((note) => (
        <article key={note.id} className="card-item">
          <strong>{note.title}</strong>
          <p>{note.summary}</p>
          <button className="btn-ghost" type="button" onClick={() => { if (typeof note.fields.route === "string") navigate(note.fields.route); onClose(); }}>Open</button>
        </article>
      ))}
      <button className="btn-ghost" type="button" onClick={onClose}>Close</button>
    </div>
  );
}
