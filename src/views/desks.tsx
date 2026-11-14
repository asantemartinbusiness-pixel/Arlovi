import { useEffect, useState } from "react";
import { imbalance, issueInvoice, journalLines, recordPayment } from "@/domain/finance";
import type { Audit, Rec } from "@/domain/types";
import { byId, currencyFor, formatMoney, inOrg, slugFor } from "@/domain/types";

type Commit = (records: Rec[], events?: Audit[]) => Promise<void>;

interface DeskProps {
  record: Rec;
  records: Rec[];
  actor: string;
  canPost: boolean;
  onSave: (record: Rec) => Promise<void>;
  onRecords: Commit;
  onNavigate: (path: string) => void;
}

interface InvoiceLine {
  description: string;
  qty: number;
  unitMinor: number;
  netMinor: number;
  taxMinor: number;
}

function taxRate(currency: string): number {
  return currency === "GBP" ? 0.2 : 0;
}

function readLines(record: Rec): InvoiceLine[] {
  const body = record.body as { lines?: InvoiceLine[] } | undefined;
  if (Array.isArray(body?.lines) && body.lines.length > 0) return body.lines.map((line) => ({ ...line }));
  const net = Number(record.fields.netMinor ?? record.amountMinor ?? 0);
  const tax = Number(record.fields.taxMinor ?? 0);
  return [{ description: record.summary || "Line", qty: 1, unitMinor: net, netMinor: net, taxMinor: tax }];
}

function withLines(record: Rec, lines: InvoiceLine[]): Rec {
  const net = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const tax = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  return {
    ...record,
    amountMinor: net + tax,
    fields: { ...record.fields, netMinor: net, taxMinor: tax },
    body: { lines },
  };
}

function price(line: InvoiceLine, qty: number, unitMajor: number, currency: string): InvoiceLine {
  const unitMinor = Math.round(unitMajor * 100);
  const netMinor = qty * unitMinor;
  const taxMinor = Math.round(netMinor * taxRate(currency));
  return { ...line, qty, unitMinor, netMinor, taxMinor };
}

export function InvoiceDesk({ record, records, actor, canPost, onRecords }: DeskProps) {
  const [lines, setLines] = useState(() => readLines(record));
  const [note, setNote] = useState("");
  useEffect(() => setLines(readLines(record)), [record.id, record.revision]);
  const currency = record.currency || currencyFor(record.organizationId);
  const contact = byId(records, String(record.fields.contactId ?? ""));
  const net = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const tax = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  const journal = byId(records, String(record.fields.journalId ?? ""));

  async function issue() {
    const draft = withLines(record, lines);
    const base = records.map((item) => (item.id === draft.id ? draft : item));
    const result = issueInvoice(base, draft.id, actor, new Date().toISOString(), {
      journal: crypto.randomUUID(),
      event: crypto.randomUUID(),
    });
    if (result.error) {
      setNote(result.error);
      return;
    }
    await onRecords(result.records, result.events);
    setNote("Issued in the local ledger. No invoice was emailed.");
  }

  async function receipt() {
    const result = recordPayment(records, record.id, actor, new Date().toISOString(), {
      journal: crypto.randomUUID(),
      event: crypto.randomUUID(),
    });
    if (result.error) {
      setNote(result.error);
      return;
    }
    await onRecords(result.records, result.events);
    setNote("Receipt posted locally. No payment provider confirmed the funds.");
  }

  return (
    <div className="grid">
      <section className="card span-8">
        <h2>{record.title}</h2>
        <p className="meta">{record.status}{contact ? ` · ${contact.title}` : ""}{record.dueAt ? ` · due ${record.dueAt.slice(0, 10)}` : ""}</p>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th className="num">Net</th>
              <th className="num">Tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${record.id}-${index}`}>
                <td>
                  <input
                    aria-label="Description"
                    value={line.description}
                    onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                  />
                </td>
                <td>
                  <input
                    aria-label="Quantity"
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(event) => {
                      const qty = Math.max(1, Number(event.target.value) || 1);
                      setLines(lines.map((item, itemIndex) => itemIndex === index ? price(item, qty, item.unitMinor / 100, currency) : item));
                    }}
                  />
                </td>
                <td>
                  <input
                    aria-label="Unit price"
                    inputMode="decimal"
                    value={(line.unitMinor / 100).toFixed(2)}
                    onChange={(event) => {
                      const unit = Number(event.target.value);
                      if (!Number.isFinite(unit)) return;
                      setLines(lines.map((item, itemIndex) => itemIndex === index ? price(item, item.qty, unit, currency) : item));
                    }}
                  />
                </td>
                <td className="num">{formatMoney(line.netMinor, currency)}</td>
                <td className="num">{formatMoney(line.taxMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><strong>Total {formatMoney(net + tax, currency)}</strong> · net {formatMoney(net, currency)} · tax {formatMoney(tax, currency)}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => onRecords(records.map((item) => item.id === record.id ? withLines(record, lines) : item)).then(() => setNote("Lines saved."))}>Save lines</button>
          {record.status === "draft" && (
            <button className="btn" type="button" disabled={!canPost} onClick={issue}>Issue this invoice</button>
          )}
          {record.status === "awaiting_payment" && (
            <button className="btn" type="button" disabled={!canPost} onClick={receipt}>Record local receipt</button>
          )}
        </div>
        {!canPost && <p className="meta">The Finance or Owner view can issue and record receipts. This switch is a local policy preview, not account security.</p>}
        <p className="meta">Email delivery is not connected. Issuing updates this workspace ledger only.</p>
        {note && <p role="status">{note}</p>}
      </section>
      <aside className="card span-4">
        <h2>Ledger</h2>
        {journal ? <p>{journal.title} · {journal.status}</p> : <p className="meta">No issue journal yet.</p>}
        <h2>Related</h2>
        <ul>
          {inOrg(records, record.organizationId, "deals").filter((deal) => deal.fields.contactId === record.fields.contactId).slice(0, 4).map((deal) => (
            <li key={deal.id}>{deal.title} · {deal.status}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

export function LedgerDesk({ records, orgId, selectedId, onSelect }: { records: Rec[]; orgId: string; selectedId?: string; onSelect: (id: string) => void }) {
  const journals = inOrg(records, orgId, "journals");
  const accounts = inOrg(records, orgId, "accounts");
  const currency = currencyFor(orgId);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Journal</th>
            <th>Status</th>
            <th>Balance</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {journals.map((journal) => {
            const lines = journalLines(journal);
            const gap = imbalance(lines);
            return (
              <tr key={journal.id} aria-selected={journal.id === selectedId} onClick={() => onSelect(journal.id)}>
                <td>
                  <strong>{journal.title}</strong>
                  <div className="meta">
                    {lines.map((line, index) => {
                      const account = accounts.find((item) => item.id === line.accountId);
                      const side = line.debitMinor > 0 ? `Dr ${formatMoney(line.debitMinor, currency)}` : `Cr ${formatMoney(line.creditMinor, currency)}`;
                      return <span key={`${journal.id}-${index}`}>{account?.title ?? "Account"} {side}. </span>;
                    })}
                  </div>
                </td>
                <td><span className="badge">{journal.status}</span></td>
                <td>{gap === 0 ? "Balanced" : gap == null ? "Incomplete" : "Out of balance"}</td>
                <td className="num">{journal.amountMinor != null ? formatMoney(journal.amountMinor, currency) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DealDesk({ record, records, onSave, onRecords, onNavigate }: DeskProps) {
  const currency = record.currency || currencyFor(record.organizationId);
  const contact = byId(records, String(record.fields.contactId ?? ""));
  const quotes = records.filter((item) => item.collection === "quotes" && (item.parentId === record.id || item.fields.dealId === record.id));
  const invoices = inOrg(records, record.organizationId, "invoices").filter((item) => item.fields.dealId === record.id);
  const stages = ["new", "discovery", "qualified", "proposal", "negotiation", "won"];

  async function draftInvoice() {
    const net = Number(record.amountMinor ?? 0);
    if (net <= 0) return;
    const tax = Math.round(net * taxRate(currency));
    const count = inOrg(records, record.organizationId, "invoices").length + 1;
    const now = new Date().toISOString();
    const invoice: Rec = {
      id: crypto.randomUUID(),
      organizationId: record.organizationId,
      collection: "invoices",
      title: `INV-${1100 + count}`,
      status: "draft",
      ownerName: record.ownerName,
      summary: `Draft from ${record.title}. Not issued.`,
      currency,
      amountMinor: net + tax,
      dueAt: "2026-12-14",
      parentId: record.id,
      tags: ["local"],
      fields: { number: `INV-${1100 + count}`, netMinor: net, taxMinor: tax, contactId: String(record.fields.contactId ?? ""), dealId: record.id, revenueCode: "4000" },
      body: { lines: [{ description: record.title, qty: 1, unitMinor: net, netMinor: net, taxMinor: tax }] },
      createdAt: now,
      updatedAt: now,
      revision: 1,
      createdBy: record.ownerName,
      updatedBy: record.ownerName,
      history: [],
    };
    await onRecords([invoice, ...records]);
    onNavigate(`/o/${slugFor(record.organizationId)}/fin/invoices/${invoice.id}`);
  }

  return (
    <div className="grid">
      <section className="card span-8">
        <h2>{record.title}</h2>
        <p>{record.summary}</p>
        <label className="field">
          <span>Stage</span>
          <select aria-label="Stage" value={String(record.fields.stage ?? record.status)} onChange={(event) => onSave({ ...record, status: event.target.value, fields: { ...record.fields, stage: event.target.value } })}>
            {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Amount</span>
          <input
            aria-label="Deal amount"
            inputMode="decimal"
            defaultValue={((record.amountMinor ?? 0) / 100).toFixed(2)}
            onBlur={(event) => {
              const major = Number(event.target.value);
              if (!Number.isFinite(major)) return;
              onSave({ ...record, amountMinor: Math.round(major * 100) });
            }}
          />
        </label>
        <p className="meta">{contact ? contact.title : "No contact linked"} · {formatMoney(record.amountMinor ?? 0, currency)}</p>
        <button className="btn" type="button" onClick={draftInvoice}>Draft invoice from this deal</button>
      </section>
      <aside className="card span-4">
        <h2>Quotes</h2>
        <ul>{quotes.map((quote) => <li key={quote.id}>{quote.title} · {quote.status}</li>)}{quotes.length === 0 && <li>No quote yet.</li>}</ul>
        <h2>Invoices</h2>
        <ul>{invoices.map((invoice) => <li key={invoice.id}>{invoice.title} · {invoice.status}</li>)}{invoices.length === 0 && <li>No invoice yet.</li>}</ul>
      </aside>
    </div>
  );
}

export function MissionDesk({ record, records, onSave, onRecords }: DeskProps) {
  const tasks = records.filter((item) => item.collection === "missionTasks" && item.parentId === record.id);
  const members = inOrg(records, record.organizationId, "members");
  const [title, setTitle] = useState("");

  async function addTask() {
    const name = title.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const task: Rec = {
      id: crypto.randomUUID(),
      organizationId: record.organizationId,
      collection: "missionTasks",
      title: name,
      status: "ready",
      ownerName: record.ownerName,
      summary: `Step on ${record.title}.`,
      currency: record.currency,
      parentId: record.id,
      tags: ["local"],
      fields: { stage: "ready", assignee: String(record.fields.agentId ? members.find((member) => member.fields.agentId === record.fields.agentId)?.title ?? record.ownerName : record.ownerName) },
      createdAt: now,
      updatedAt: now,
      revision: 1,
      createdBy: record.ownerName,
      updatedBy: record.ownerName,
      history: [],
    };
    await onRecords([task, ...records]);
    setTitle("");
  }

  return (
    <section className="card">
      <h2>{record.title}</h2>
      <p className="meta">{record.status} · {record.summary}</p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <strong>{task.title}</strong> · {String(task.fields.stage ?? task.status)} · {String(task.fields.assignee ?? task.ownerName)}
          </li>
        ))}
      </ul>
      <label className="field">
        <span>Assignee</span>
        <select
          aria-label="Mission assignee"
          value={String(record.fields.agentId ?? "")}
          onChange={(event) => onSave({ ...record, fields: { ...record.fields, agentId: event.target.value } })}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={String(member.fields.agentId || member.id)}>{member.title}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>New step</span>
        <input aria-label="Mission step" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button className="btn" type="button" onClick={addTask}>Add step</button>
    </section>
  );
}

export function ProjectDesk({ record, records, onNavigate }: DeskProps) {
  const tasks = records.filter((item) => item.collection === "tasks" && item.parentId === record.id);
  return (
    <section className="card">
      <h2>{record.title}</h2>
      <p>{record.summary}</p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <button className="hit" type="button" onClick={() => onNavigate(`/o/${slugFor(record.organizationId)}/project/tasks/${task.id}`)}>
              {task.title}
            </button>
            <span className="badge">{String(task.fields.stage ?? task.status)}</span>
          </li>
        ))}
      </ul>
      <button className="btn" type="button" onClick={() => onNavigate(`/o/${slugFor(record.organizationId)}/project/projects/${record.id}/board`)}>Open board</button>
    </section>
  );
}

export function TaskDesk({ record, records, onSave }: DeskProps) {
  const project = byId(records, record.parentId);
  const members = inOrg(records, record.organizationId, "members");
  const assignees = Array.from(new Set([String(record.fields.assignee ?? ""), ...members.map((member) => member.title)].filter((name) => name.length > 0)));
  const stages = ["ready", "doing", "review", "done"];
  return (
    <section className="card">
      <h2>{record.title}</h2>
      <p>{record.summary}</p>
      {project && <p className="meta">Project · {project.title}</p>}
      <label className="field">
        <span>Stage</span>
        <select aria-label="Task stage" value={String(record.fields.stage ?? record.status)} onChange={(event) => onSave({ ...record, status: event.target.value, fields: { ...record.fields, stage: event.target.value } })}>
          {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Assignee</span>
        <select aria-label="Task assignee" value={String(record.fields.assignee ?? "")} onChange={(event) => onSave({ ...record, fields: { ...record.fields, assignee: event.target.value } })}>
          {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </section>
  );
}

export function AgentDesk({ record, records, onNavigate }: DeskProps) {
  const member = inOrg(records, record.organizationId, "members").find((item) => item.fields.agentId === record.id || item.parentId === record.id);
  return (
    <section className="card">
      <h2>{record.title}</h2>
      <p>{record.summary}</p>
      <p className="meta">{record.status} · {String(record.fields.role ?? "specialist")} · model {String(record.fields.model ?? "not_connected")}</p>
      <p>No language model is connected. This profile is a local contract and assignment record.</p>
      {member ? (
        <p>Organization chart lists {member.title} as {String(member.fields.kind)}.</p>
      ) : (
        <p className="meta">No directory entry yet.</p>
      )}
      <button className="btn" type="button" onClick={() => onNavigate(`/o/${slugFor(record.organizationId)}/hq/organization?tab=${encodeURIComponent("AI employees")}`)}>Show on the organization chart</button>
    </section>
  );
}
