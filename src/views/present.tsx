import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ScreenInfo } from "@/app/catalog";
import { aging, statements, trialBalance } from "@/domain/finance";
import { quantityOnHand } from "@/domain/ops";
import type { Rec } from "@/domain/types";
import { formatMoney, inOrg } from "@/domain/types";

export function money(record: Rec | undefined, minor: number): string {
  return formatMoney(minor, record?.currency ?? "GBP");
}

export function passesTab(record: Rec, tab: string, _index = 0, _tabCount = 1): boolean {
  const name = tab.toLowerCase().trim();
  if (/^(all|overview|entries|everything|recent|directory|hierarchy|capacity|board|list|forecast|team|shared|brand|templates|template|agenda|month|week|upcoming|by owner|by sprint|assignees|by department|business)$/.test(name)) return true;
  if (name.includes("week") || name.includes("upcoming") || name.includes("month") || name.includes("agenda")) return true;
  if (name.includes("today")) return (record.at ?? record.updatedAt).slice(0, 10) === "2026-11-14";
  if (name === "people" || name.includes("human")) return record.fields.kind === "human" || record.tags.includes("human");
  if (name === "ai" || name.includes("ai employee") || name.includes("agents")) return record.fields.kind === "ai" || record.tags.includes("ai") || record.collection === "agents";
  if (name.includes("archiv")) return record.status === "archived";
  if (name.includes("draft")) return record.status === "draft";
  if (name.includes("paid")) return record.status === "paid";
  if (name.includes("overdue")) return record.status === "awaiting_payment" && (record.dueAt ?? "9999") < "2026-11-14";
  if (name.includes("await")) return record.status === "awaiting_payment" || record.status === "awaiting_approval";
  if (name.includes("void")) return record.status === "void";
  if (name.includes("paused") || name.includes("waiting")) return record.status === "paused" || record.status === "waiting" || record.status === "waiting_approval";
  if (name.includes("running")) return record.status === "running";
  if (name.includes("active")) return record.status === "active" || record.status === "running";
  if (name.includes("won") || name === "closed") return record.status === "won" || record.status === "completed";
  if (name === "open" || name.startsWith("open ")) return record.status === "open";
  const skip = new Set(["with", "from", "this", "that", "your", "into", "view", "only", "show"]);
  const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !skip.has(token));
  if (tokens.length === 0) return true;
  const hay = `${record.status} ${record.tags.join(" ")} ${record.fields.kind ?? ""} ${record.fields.type ?? ""} ${record.fields.stage ?? ""} ${record.fields.channel ?? ""}`.toLowerCase();
  return tokens.some((token) => hay.includes(token));
}

export function filterTab(rows: Rec[], tab: string, tabs: string[]): Rec[] {
  const filtered = rows.filter((row) => passesTab(row, tab, 0, tabs.length));
  const strict = /draft|paid|overdue|await|void|archiv|paused|human|people|agent|active|running|won|today/.test(tab.toLowerCase());
  if (filtered.length === 0 && !strict && tabs[0] === tab) return rows;
  return filtered;
}

export function Metrics({ records, orgId, screen }: { records: Rec[]; orgId: string; screen: ScreenInfo }) {
  const report = statements(records, orgId);
  const currency = records.find((item) => item.id === orgId)?.currency ?? "GBP";
  const fmt = (minor: number) => formatMoney(minor, currency);
  const deals = inOrg(records, orgId, "deals").filter((item) => item.status !== "won" && item.status !== "archived");
  const pipeline = deals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0);
  const tickets = inOrg(records, orgId, "tickets").filter((item) => item.status === "open").length;
  const products = inOrg(records, orgId, "products");
  const stock = products.reduce((sum, product) => sum + quantityOnHand(records, orgId, product.id), 0);
  const cards: { label: string; value: string; detail: string; stale?: boolean }[] = [];
  if (screen.applicationCode === "FIN" || screen.applicationCode === "HQ" || screen.applicationCode === "ANALYTICS") {
    const bank = report.rows.find((row) => row.code === "1000");
    cards.push(
      { label: "Ledger cash", value: fmt(bank?.balanceMinor ?? 0), detail: "Posted journals · 1 Nov 2026" },
      { label: "Receivables", value: fmt(report.rows.find((row) => row.code === "1100")?.balanceMinor ?? 0), detail: "Open invoices in this workspace" },
      { label: "Net", value: fmt(report.net), detail: report.booksBalance ? "Debits equal credits" : "Out of balance" },
      { label: "Bank feed", value: "Unavailable", detail: "No feed connected · checked 14 Nov 2026", stale: true },
    );
  } else if (screen.applicationCode === "CRM" || screen.applicationCode === "MARKET") {
    cards.push(
      { label: "Open pipeline", value: fmt(pipeline), detail: `${deals.length} deals still moving` },
      { label: "Won locally", value: String(inOrg(records, orgId, "deals").filter((item) => item.status === "won").length), detail: "Closed in this workspace" },
    );
  } else if (screen.applicationCode === "COMMERCE" || screen.applicationCode === "PROC") {
    cards.push({ label: "Units on hand", value: String(stock), detail: "Sum of local stock movements" });
  } else if (screen.applicationCode === "CARE") {
    cards.push({ label: "Open cases", value: String(tickets), detail: "Local service queue" });
  } else {
    cards.push(
      { label: "Records", value: String(inOrg(records, orgId, screen.collection).length), detail: screen.collection },
      { label: "Missions", value: String(inOrg(records, orgId, "missions").length), detail: "Local dispatch" },
    );
  }
  return (
    <div className="grid">
      {cards.map((card) => (
        <article key={card.label} className="metric span-3">
          <span>{card.label}</span>
          <b className={card.stale ? "stale" : undefined}>{card.value}</b>
          <span>{card.detail}</span>
        </article>
      ))}
    </div>
  );
}

export function DataTable({
  rows,
  currency,
  selectedId,
  onSelect,
  onOpen,
}: {
  rows: Rec[];
  currency: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  if (rows.length === 0) return <p className="card">Nothing in this view yet. Create a record when you are ready.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Owner</th>
            <th className="num">Amount</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} aria-selected={row.id === selectedId} onClick={() => (onOpen ?? onSelect)(row.id)} style={{ cursor: "pointer" }}>
              <td>
                <strong>{row.title}</strong>
                <div className="meta">{row.summary}</div>
              </td>
              <td><span className="badge">{row.status}</span></td>
              <td>{row.ownerName}</td>
              <td className="num">{row.amountMinor != null ? formatMoney(row.amountMinor, row.currency || currency) : "—"}</td>
              <td>{row.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortCard({ record, onSelect }: { record: Rec; onSelect: (id: string) => void }) {
  const sortable = useSortable({ id: record.id });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="card-item"
    >
      <button className="hit" onClick={() => onSelect(record.id)}>
        <strong>{record.title}</strong>
        <div className="meta">{record.summary}</div>
      </button>
      <button className="btn-ghost" style={{ minHeight: 32 }} {...sortable.attributes} {...sortable.listeners} type="button">
        Move
      </button>
    </article>
  );
}

export function Board({
  rows,
  tab = "",
  selectedId,
  onMove,
  onSelect,
}: {
  rows: Rec[];
  tab?: string;
  selectedId?: string;
  onMove: (id: string, status: string) => void;
  onSelect: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byAssignee = /owner|assignee/.test(tab.toLowerCase());
  const columnOf = (row: Rec) => byAssignee ? String(row.fields.assignee ?? row.ownerName) : String(row.fields.stage ?? row.status);
  const columns = Array.from(new Set(rows.map(columnOf)));
  const labels = columns.length ? columns : ["draft", "active", "done"];
  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId || !event.active.id) return;
    const column = labels.find((label) => overId === label || rows.find((row) => row.id === overId && columnOf(row) === label));
    if (column) onMove(String(event.active.id), column);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={rows.map((row) => row.id)}>
      <div className="board">
        {labels.map((label) => (
          <section key={label} className="lane" id={label} aria-label={label}>
            <h2>{label}</h2>
            {rows.filter((row) => columnOf(row) === label).map((row) => (
              <SortCard key={row.id} record={row} onSelect={onSelect} />
            ))}
            {selectedId && rows.find((row) => row.id === selectedId && columnOf(row) !== label) && (
              <button className="btn-ghost" type="button" onClick={() => onMove(selectedId, label)}>Move here</button>
            )}
          </section>
        ))}
      </div>
      </SortableContext>
    </DndContext>
  );
}

export function CalendarView({ rows, onShift }: { rows: Rec[]; onShift: (id: string, days: number) => void }) {
  const start = new Date("2026-11-09T00:00:00.000Z");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
  return (
    <div className="calendar">
      {days.map((day) => {
        const key = day.toISOString().slice(0, 10);
        const items = rows.filter((row) => (row.startAt ?? row.at ?? "").slice(0, 10) === key);
        return (
          <section key={key} className="card day">
            <strong>{day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</strong>
            {items.map((item) => (
              <div key={item.id} className="card-item">
                <div>{item.title}</div>
                <div className="meta">{item.status}</div>
                <button className="btn-ghost" type="button" onClick={() => onShift(item.id, 1)}>Move one day</button>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function ChatView({
  messages,
  onSend,
}: {
  messages: Rec[];
  onSend: (text: string) => void;
}) {
  return (
    <section className="chat" aria-label="Conversation">
      <div className="messages">
        {messages.map((message) => (
          <article key={message.id} className={`bubble ${message.fields.kind === "ai" ? "ai" : "human"}`}>
            <strong>{String(message.fields.author ?? message.ownerName)}</strong>
            <div>{message.summary || message.title}</div>
          </article>
        ))}
        {messages.length === 0 && <p>No messages in this thread yet.</p>}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const text = String(data.get("message") ?? "").trim();
          if (text) onSend(text);
          event.currentTarget.reset();
        }}
      >
        <label className="sr" htmlFor="composer">Message</label>
        <textarea id="composer" name="message" rows={2} />
        <button className="btn" type="submit">Send</button>
      </form>
    </section>
  );
}

export function GraphView({ rows, onSelect }: { rows: Rec[]; onSelect: (id: string) => void }) {
  const nodes = rows.slice(0, 12);
  return (
    <div>
      <svg className="graph" viewBox="0 0 800 420" role="img" aria-label="Relationship graph">
        {nodes.map((node, index) => {
          const x = 80 + (index % 4) * 180;
          const y = 70 + Math.floor(index / 4) * 120;
          return (
            <g key={node.id} className="node" onClick={() => onSelect(node.id)}>
              <rect x={x} y={y} rx="12" width="150" height="64" fill="#234FE8" />
              <text x={x + 12} y={y + 38} fill="white" fontSize="13">{node.title.slice(0, 18)}</text>
            </g>
          );
        })}
      </svg>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}><button className="hit" type="button" onClick={() => onSelect(node.id)}>{node.title}</button></li>
        ))}
      </ul>
    </div>
  );
}

export function TimelineView({ rows }: { rows: Rec[] }) {
  const ordered = [...rows].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return (
    <div className="timeline">
      {ordered.map((row) => (
        <article key={row.id} className="time-item">
          <time dateTime={row.at}>{ (row.at ?? row.updatedAt).slice(0, 10) }</time>
          <div className="card">
            <h2>{row.title}</h2>
            <p className="lede">{row.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RecordView({ record, related, events }: { record?: Rec; related: Rec[]; events: { id: string; message: string }[] }) {
  if (!record) return <p className="card">Choose a record from the register. The link may point at an id that is not in this organization.</p>;
  return (
    <div className="grid">
      <section className="card span-8">
        <span className="badge">{record.status}</span>
        <h2>{record.title}</h2>
        <p>{record.summary}</p>
        <dl>
          {Object.entries(record.fields).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
          ))}
        </dl>
      </section>
      <aside className="card span-4">
        <h2>Related</h2>
        <ul>{related.slice(0, 6).map((item) => <li key={item.id}>{item.title}</li>)}</ul>
        <h2>Activity</h2>
        <ul>{events.slice(0, 6).map((event) => <li key={event.id}>{event.message}</li>)}</ul>
      </aside>
    </div>
  );
}

export function FinanceTable({ records, orgId }: { records: Rec[]; orgId: string }) {
  const report = statements(records, orgId);
  const currency = records.find((item) => item.id === orgId)?.currency ?? "GBP";
  const age = aging(records, orgId, "2026-11-14T09:30:00.000Z");
  const trial = trialBalance(records, orgId);
  return (
    <div className="grid">
      <section className="card span-8">
        <h2>Trial balance</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {trial.rows.map((row) => (
                <tr key={row.accountId}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td className="num">{formatMoney(row.debitMinor, currency)}</td>
                  <td className="num">{formatMoney(row.creditMinor, currency)}</td>
                </tr>
              ))}
              <tr>
                <td /><td>Total</td>
                <td className="num">{formatMoney(trial.debit, currency)}</td>
                <td className="num">{formatMoney(trial.credit, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="card span-4">
        <h2>Statements</h2>
        <p>Revenue {formatMoney(report.revenue, currency)}</p>
        <p>Expenses {formatMoney(report.expense, currency)}</p>
        <p>Net {formatMoney(report.net, currency)}</p>
        <p>Assets {formatMoney(report.assets, currency)} = liabilities {formatMoney(report.liabilities, currency)} + equity {formatMoney(report.equity, currency)}</p>
        <h2>Receivables aging</h2>
        <ul>{age.map((bucket) => <li key={bucket.bucket}>{bucket.bucket}: {formatMoney(bucket.amountMinor, currency)} ({bucket.count})</li>)}</ul>
      </section>
    </div>
  );
}

export function Reconcile({ rows, journals, onMatch }: { rows: Rec[]; journals: Rec[]; onMatch: (id: string) => void }) {
  return (
    <div className="grid">
      <section className="card span-6">
        <h2>Statement lines</h2>
        {rows.map((row) => (
          <article key={row.id} className="card-item">
            <strong>{row.title}</strong>
            <div className="meta">{row.summary}</div>
            <div>{formatMoney(Number(row.amountMinor ?? 0), row.currency)} · {row.status}</div>
            {row.fields.matched !== true && <button className="btn" type="button" onClick={() => onMatch(row.id)}>Match to ledger</button>}
          </article>
        ))}
      </section>
      <section className="card span-6">
        <h2>Posted cash journals</h2>
        {journals.filter((item) => item.status === "posted").map((journal) => (
          <article key={journal.id} className="card-item">
            <strong>{journal.title}</strong>
            <div className="meta">{journal.summary}</div>
          </article>
        ))}
      </section>
    </div>
  );
}
