import * as Dialog from "@radix-ui/react-dialog";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { findScreen, screenPath, type ScreenInfo } from "@/app/catalog";
import { importCsv, reduceAction } from "@/domain/engine";
import { findBookingConflict, quantityOnHand } from "@/domain/ops";
import { canOpenApp } from "@/domain/ops";
import type { Rec, Role } from "@/domain/types";
import { byId, currencyFor, inOrg, orgFromSlug, slugFor, touch } from "@/domain/types";
import {
  BookingPage,
  BuildEditor,
  DeckEditor,
  DesignEditor,
  DocumentEditor,
  FormEditor,
  LayoutEditor,
  MotionEditor,
  PhotoEditor,
  SheetEditor,
  Storefront,
  VideoEditor,
  WebEditor,
  WorkflowEditor,
} from "@/editors/studio";
import { db, downloadFile, persistAll } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import {
  Board,
  CalendarView,
  ChatView,
  DataTable,
  filterTab,
  FinanceTable,
  GraphView,
  Metrics,
  Reconcile,
  RecordView,
  TimelineView,
} from "@/views/present";

const ACTOR: Record<Role, string> = {
  owner: "Maya Chen",
  finance: "Jonah Adeyemi",
  sales: "Priya Shah",
  people: "Elena Voss",
  member: "Maya Chen",
  client: "Amina Rahman",
};

export function ScreenRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useUi();
  const records = useLiveQuery(() => db.records.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const match = findScreen(location.pathname);
  const params = new URLSearchParams(location.search);
  const tabParam = params.get("tab");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(match?.params.id);
  const [status, setStatus] = useState("Records loaded from this browser.");

  useEffect(() => {
    setSelectedId(match?.params.id);
    setOverlay(null);
  }, [match?.screen.id, match?.params.id]);

  if (!records || !events) return <p>Opening the local workspace…</p>;
  if (!match) return <section><h1>Page not in the register</h1><p>That address is not one of the workspace screens.</p></section>;

  const { screen } = match;
  const orgId = orgFromSlug(match.params.org ?? "");
  if (!orgId) {
    return <section><h1>Organization not available</h1><p>This browser does not have a workspace for that organization.</p></section>;
  }
  const loaded = records;
  const organizationId = orgId;
  const tab = screen.tabs.includes(tabParam ?? "") ? (tabParam as string) : screen.tabs[0];
  const rows = filterTab(inOrg(loaded, organizationId, screen.collection), tab, screen.tabs);
  const selected = byId(loaded, selectedId) ?? rows[0];

  async function commit(next: Rec[]) {
    await persistAll(next, []);
  }

  async function run(action: string) {
    const effect = reduceAction(loaded, {
      screen,
      action,
      role: ui.role,
      orgId: organizationId,
      actor: ACTOR[ui.role],
      now: new Date().toISOString(),
      selectedId: selected?.id,
      ids: () => crypto.randomUUID(),
    });
    await persistAll(effect.records, effect.events);
    if (effect.selectId) setSelectedId(effect.selectId);
    if (effect.overlay) setOverlay(effect.overlay);
    if (effect.tool) ui.setTool(effect.tool);
    if (effect.ask) ui.setAsk(true, effect.ask);
    if (effect.pickFile) fileRef.current?.click();
    if (effect.download) downloadFile(effect.download.filename, effect.download.text, effect.download.mime);
    if (effect.navigate) {
      const path = effect.navigate.replace(":org", slugFor(organizationId)).replace(":id", effect.selectId ?? selected?.id ?? "");
      if (path.startsWith("/")) navigate(path);
    }
    ui.pushToast({ title: effect.toastTitle, body: effect.toastBody, tone: effect.tone });
    setStatus(`${effect.toastTitle}. ${effect.toastBody}`);
  }

  async function saveRecord(next: Rec) {
    const current = byId(loaded, next.id) ?? next;
    const updated = touch(current, ACTOR[ui.role], new Date().toISOString(), {
      title: next.title,
      status: next.status,
      summary: next.summary,
      fields: next.fields,
      body: next.body,
      amountMinor: next.amountMinor,
    });
    await commit(loaded.map((record) => (record.id === updated.id ? updated : record)));
    setStatus(`Saved ${updated.title}.`);
  }

  const denied = !canOpenApp(ui.role, screen.applicationCode);

  return (
    <article data-screen={screen.id} data-app={screen.applicationCode}>
      <header className="page-head">
        <div>
          <div className="crumbs">
            <Link to={screenPath(screen, slugFor(orgId)).split("/").slice(0, 3).join("/") || "/"}>{slugFor(orgId)}</Link>
            <span>/</span>
            <span>{screen.applicationName}</span>
            <span>/</span>
            <span>{screen.title}</span>
          </div>
          <h1>{screen.title}</h1>
          <p className="lede">{screen.purpose}</p>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label={screen.title} onKeyDown={(event) => onTabKey(event, screen, tab, (next) => navigate(`${location.pathname}?tab=${encodeURIComponent(next)}`))}>
        {screen.tabs.map((name) => (
          <button
            key={name}
            className="tab"
            role="tab"
            id={`${screen.id}-${name}`}
            aria-selected={name === tab}
            tabIndex={name === tab ? 0 : -1}
            onClick={() => navigate(`${location.pathname}?tab=${encodeURIComponent(name)}`)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="actions">
        {screen.actions.map((action) => (
          <button key={action} className="btn" type="button" onClick={() => run(action)}>{action}</button>
        ))}
      </div>
      <div className="actions">
        {screen.overlays.map((name) => (
          <button key={name} className="btn-ghost" type="button" onClick={() => setOverlay(name)}>{name}</button>
        ))}
      </div>
      <p className="sr" role="status">{status}</p>
      {denied ? (
        <section className="card">
          <h2>Outside this role</h2>
          <p>The {ui.role} view does not open {screen.applicationName}. Switch the local role view if you are reviewing another desk. This switch is not an access-control boundary.</p>
        </section>
      ) : (
        <div role="tabpanel" aria-labelledby={`${screen.id}-${tab}`}>
          <Workspace
            screen={screen}
            tab={tab}
            records={records}
            events={events.filter((event) => event.organizationId === orgId)}
            orgId={orgId}
            rows={rows}
            selected={selected}
            onSelect={setSelectedId}
            onSave={saveRecord}
            onRecords={async (next) => { await commit(next); }}
          />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="sr"
        aria-label="Import CSV"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const effect = importCsv(records, {
            screen,
            action: "import",
            role: ui.role,
            orgId,
            actor: ACTOR[ui.role],
            now: new Date().toISOString(),
            ids: () => crypto.randomUUID(),
          }, text);
          await persistAll(effect.records, effect.events);
          ui.pushToast({ title: effect.toastTitle, body: effect.toastBody, tone: effect.tone });
        }}
      />
      <Dialog.Root open={Boolean(overlay)} onOpenChange={(open) => { if (!open) setOverlay(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className={overlay && /inspect|drawer|detail|preview|context/i.test(overlay) ? "drawer" : "modal"} aria-describedby="overlay-copy">
            <Dialog.Title>{overlay}</Dialog.Title>
            <p id="overlay-copy">{selected ? selected.summary || selected.title : "No record selected yet."}</p>
            {selected && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  await saveRecord({
                    ...selected,
                    title: String(data.get("title") ?? selected.title),
                    status: String(data.get("status") ?? selected.status),
                    summary: String(data.get("summary") ?? selected.summary),
                  });
                  setOverlay(null);
                }}
              >
                <label className="field"><span>Title</span><input name="title" defaultValue={selected.title} /></label>
                <label className="field"><span>Status</span><input name="status" defaultValue={selected.status} /></label>
                <label className="field"><span>Summary</span><textarea name="summary" defaultValue={selected.summary} /></label>
                <button className="btn" type="submit">Save</button>
              </form>
            )}
            <Dialog.Close className="btn-ghost">Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </article>
  );
}

function onTabKey(event: KeyboardEvent, screen: ScreenInfo, tab: string, go: (tab: string) => void) {
  const index = screen.tabs.indexOf(tab);
  if (event.key === "ArrowRight") go(screen.tabs[(index + 1) % screen.tabs.length]);
  if (event.key === "ArrowLeft") go(screen.tabs[(index - 1 + screen.tabs.length) % screen.tabs.length]);
  if (event.key === "Home") go(screen.tabs[0]);
  if (event.key === "End") go(screen.tabs[screen.tabs.length - 1]);
}

function Workspace(props: {
  screen: ScreenInfo;
  tab: string;
  records: Rec[];
  events: { id: string; message: string; entityId?: string; organizationId: string; at: string; actor: string; type: string }[];
  orgId: string;
  rows: Rec[];
  selected?: Rec;
  onSelect: (id: string) => void;
  onSave: (record: Rec) => Promise<void>;
  onRecords: (records: Rec[]) => Promise<void>;
}) {
  const { screen, records, orgId, rows, selected, onSelect, onSave, onRecords } = props;
  const route = screen.route;
  const editor = selected && isEditor(screen, selected);
  if (screen.archetype === "dashboard" || (screen.archetype === "report" && !editor)) {
    return (
      <div className="grid">
        <div className="span-12"><Metrics records={records} orgId={orgId} screen={screen} /></div>
        {screen.regions.map((region) => (
          <section key={region} className="card span-6">
            <h2>{region}</h2>
            <ul>
              {rows.slice(0, 4).map((row) => (
                <li key={row.id}><button className="hit" type="button" onClick={() => onSelect(row.id)}>{row.title}</button></li>
              ))}
            </ul>
          </section>
        ))}
        {screen.applicationCode === "FIN" && <div className="span-12"><FinanceTable records={records} orgId={orgId} /></div>}
      </div>
    );
  }
  if (route.includes("/fin/reports") || route.includes("/fin/budgets")) return <FinanceTable records={records} orgId={orgId} />;
  if (route.includes("/fin/reconciliation")) {
    return <Reconcile rows={inOrg(records, orgId, "bankTransactions")} journals={inOrg(records, orgId, "journals")} onMatch={(id) => onSelect(id)} />;
  }
  if (route.includes("/commerce/storefront")) {
    return (
      <Storefront
        records={records}
        orgId={orgId}
        onAdd={async (productId) => {
          const cart = records.find((record) => record.organizationId === orgId && record.collection === "carts");
          if (!cart) return;
          const lines = [...(((cart.body as { lines?: { productId: string; qty: number }[] })?.lines) ?? [])];
          const found = lines.find((line) => line.productId === productId);
          if (found) found.qty += 1;
          else lines.push({ productId, qty: 1 });
          await onSave({ ...cart, body: { lines } });
        }}
        onCheckout={async () => {
          const cart = records.find((record) => record.organizationId === orgId && record.collection === "carts");
          const lines = ((cart?.body as { lines?: { productId: string; qty: number }[] })?.lines) ?? [];
          if (lines.length === 0) return;
          for (const line of lines) {
            if (quantityOnHand(records, orgId, line.productId) < line.qty) return;
          }
          const order: Rec = {
            id: crypto.randomUUID(),
            organizationId: orgId,
            collection: "orders",
            title: `Order ${new Date().toISOString().slice(0, 10)}`,
            status: "awaiting_payment",
            ownerName: "Priya Shah",
            summary: "Held locally. Card capture is not connected.",
            currency: currencyFor(orgId),
            amountMinor: lines.reduce((sum, line) => sum + line.qty * Number(byId(records, line.productId)?.amountMinor ?? 0), 0),
            tags: ["local"],
            fields: { payment: "not_connected" },
            body: { lines },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            revision: 1,
            createdBy: "Priya Shah",
            updatedBy: "Priya Shah",
            history: [],
          };
          const cleared = cart ? records.map((record) => (record.id === cart.id ? { ...cart, body: { lines: [] } } : record)) : records;
          await onRecords([order, ...cleared]);
        }}
      />
    );
  }
  if (route.includes("/book/public/")) {
    return (
      <BookingPage
        records={records}
        orgId={orgId}
        onHold={async (serviceId, start) => {
          const service = byId(records, serviceId);
          const minutes = Number(service?.fields.minutes ?? 45);
          const end = new Date(new Date(start).getTime() + minutes * 60000).toISOString();
          if (findBookingConflict(records, orgId, "nl-resources-001", start, end)) return;
          const booking: Rec = {
            id: crypto.randomUUID(),
            organizationId: orgId,
            collection: "bookings",
            title: `${service?.title ?? "Booking"} hold`,
            status: "held",
            ownerName: "Priya Shah",
            summary: "Local hold. A deposit provider is not connected.",
            currency: currencyFor(orgId),
            startAt: start,
            endAt: end,
            tags: ["local"],
            fields: { resourceId: "nl-resources-001", serviceId, payment: "not_connected" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            revision: 1,
            createdBy: "Priya Shah",
            updatedBy: "Priya Shah",
            history: [],
          };
          await onRecords([booking, ...records]);
        }}
      />
    );
  }
  if (editor && selected) {
    if (selected.collection === "documents") return <DocumentEditor record={selected} onSave={onSave} />;
    if (selected.collection === "workbooks" && selected.body) return <SheetEditor record={selected} onSave={onSave} />;
    if (selected.collection === "decks" && selected.body) return <DeckEditor record={selected} onSave={onSave} present={route.includes("/present")} />;
    if (selected.collection === "designs" && selected.body) return <DesignEditor record={selected} onSave={onSave} />;
    if (selected.collection === "photos" && selected.body) return <PhotoEditor record={selected} onSave={onSave} />;
    if (selected.collection === "publications" && selected.body) return <LayoutEditor record={selected} onSave={onSave} />;
    if (selected.collection === "videos" && selected.body) return <VideoEditor record={selected} onSave={onSave} />;
    if (selected.collection === "motions" && selected.body) return <MotionEditor record={selected} onSave={onSave} />;
    if (selected.collection === "sites" && selected.body) return <WebEditor record={selected} onSave={onSave} />;
    if (selected.collection === "appProjects" && selected.body) return <BuildEditor record={selected} onSave={onSave} />;
    if (selected.collection === "forms" && selected.body) return <FormEditor record={selected} records={records} onSave={onSave} onSubmit={async (values) => {
      const submission: Rec = {
        id: crypto.randomUUID(),
        organizationId: orgId,
        collection: "submissions",
        title: values.Name || "Submission",
        status: "received",
        ownerName: "local",
        summary: Object.entries(values).map(([key, value]) => `${key}: ${value}`).join(" · "),
        currency: currencyFor(orgId),
        parentId: selected.id,
        tags: ["local"],
        fields: values,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 1,
        createdBy: "local",
        updatedBy: "local",
        history: [],
      };
      await onRecords([submission, ...records]);
    }} />;
    if (selected.collection === "workflows" && selected.body) return <WorkflowEditor record={selected} onSave={onSave} />;
  }
  if (screen.archetype === "chat" || screen.archetype === "media") {
    const thread = records.filter((record) => record.organizationId === orgId && record.collection === "messages" && (!selected || record.parentId === selected.id || selected.collection === "messages"));
    const shown = thread.length ? thread : inOrg(records, orgId, "messages");
    return (
      <ChatView
        messages={shown}
        onSend={async (text) => {
          const message: Rec = {
            id: crypto.randomUUID(),
            organizationId: orgId,
            collection: "messages",
            title: text.slice(0, 48),
            status: "sent",
            ownerName: "Maya Chen",
            summary: text,
            currency: currencyFor(orgId),
            parentId: selected?.collection === "channels" || selected?.collection === "conversations" ? selected.id : "nl-channels-001",
            tags: ["local"],
            fields: { author: "Maya Chen", kind: "human" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            at: new Date().toISOString(),
            revision: 1,
            createdBy: "Maya Chen",
            updatedBy: "Maya Chen",
            history: [],
          };
          await onRecords([message, ...records]);
        }}
      />
    );
  }
  if (screen.archetype === "board") {
    return (
      <Board
        rows={rows}
        onSelect={onSelect}
        onMove={async (id, status) => {
          const current = byId(records, id);
          if (!current) return;
          await onSave({ ...current, status, fields: { ...current.fields, stage: status } });
        }}
      />
    );
  }
  if (screen.archetype === "calendar") {
    return (
      <CalendarView
        rows={rows}
        onShift={async (id, days) => {
          const current = byId(records, id);
          if (!current?.startAt) return;
          const start = new Date(current.startAt);
          const end = new Date(current.endAt ?? current.startAt);
          start.setUTCDate(start.getUTCDate() + days);
          end.setUTCDate(end.getUTCDate() + days);
          if (current.collection === "bookings" && current.fields.resourceId && findBookingConflict(records, orgId, String(current.fields.resourceId), start.toISOString(), end.toISOString(), current.id)) return;
          await onSave({ ...current, startAt: start.toISOString(), endAt: end.toISOString() });
        }}
      />
    );
  }
  if (screen.archetype === "graph") return <GraphView rows={rows} onSelect={onSelect} />;
  if (screen.archetype === "timeline") return <TimelineView rows={rows} />;
  if (screen.archetype === "record") {
    return (
      <RecordView
        record={selected}
        related={records.filter((record) => record.organizationId === orgId && (record.parentId === selected?.id || record.fields.contactId === selected?.id)).slice(0, 8)}
        events={props.events.filter((event) => event.entityId === selected?.id)}
      />
    );
  }
  if (screen.archetype === "wizard") {
    return (
      <section className="card">
        <h2>{props.tab}</h2>
        <p>{selected?.summary || "Start a draft and it stays in this browser."}</p>
        {selected && <button className="btn" type="button" onClick={() => onSave({ ...selected, status: "awaiting_approval" })}>Save step</button>}
      </section>
    );
  }
  if (screen.archetype === "admin" || screen.archetype === "settings") {
    const policy = inOrg(records, orgId, "policies")[0];
    return (
      <section className="card">
        {screen.regions.map((region) => <h2 key={region}>{region}</h2>)}
        {policy && (
          <form onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await onSave({ ...policy, summary: String(data.get("summary") ?? policy.summary) });
          }}>
            <label className="field"><span>Policy note</span><textarea name="summary" defaultValue={policy.summary} /></label>
            <button className="btn" type="submit">Save policy</button>
          </form>
        )}
        <p className="meta">Local role views change what you can do here. They are not a substitute for future account security.</p>
      </section>
    );
  }
  return <DataTable rows={rows} currency={currencyFor(orgId)} selectedId={selected?.id} onSelect={onSelect} />;
}

function isEditor(screen: ScreenInfo, record: Rec): boolean {
  if (["documents", "workbooks", "decks", "designs", "photos", "publications", "videos", "motions", "sites", "appProjects", "forms", "workflows"].includes(record.collection) === false) return false;
  if (screen.archetype === "directory" || screen.archetype === "table" || screen.archetype === "list") return false;
  return screen.archetype === "editor" || screen.archetype === "canvas" || screen.archetype === "builder" || screen.route.includes("/:");
}

