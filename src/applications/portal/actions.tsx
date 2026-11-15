import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { getRecord, listByCollection } from "@/platform/repo";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE, ProviderBoundary, type ConfirmSpec } from "@/applications/market/kit";
import { useBookData } from "@/applications/book/data";
import { freeSlots } from "@/applications/book/overlays";
import { bodyOf, expiryState, GATE_LABELS, MODULE_LABELS, portalDocuments, sharedRecords, usePortalData, type PortalBody, type PortalPage } from "./data";
import { usePortal } from "./panels";

/* ====================================================================== *
 * PORTAL contract actions. A portal shares only the records it names, and
 * nothing a client does here can widen that list. Messages, files and
 * payments stop at their provider boundaries.
 * ====================================================================== */

const iso = (context: ScreenContext) => context.now.toISOString();
const confirm = (context: ScreenContext, spec: ConfirmSpec) => context.openOverlay("confirm", spec);
const activity = (body: PortalBody, at: string, actor: string, detail: string): PortalBody => ({ ...body, activity: [{ at, actor, detail }, ...(body.activity ?? [])] });

async function load(context: ScreenContext, id: string | undefined): Promise<Rec | undefined> {
  if (!id) return undefined;
  const record = await getRecord(id);
  if (!record) context.toast("Not found", "That record is no longer in this workspace.", "failed");
  return record;
}

/* ---------------- PORTAL-001 clone, preview, suspend ---------------- */

export async function clonePortal(context: ScreenContext) {
  const portal = await load(context, context.selectedId);
  if (!portal) return;
  const body = bodyOf<PortalBody>(portal, {});
  confirm(context, {
    title: `Clone ${portal.title}`,
    consequence: "A new draft portal is created with the same pages, modules and branding. It shares no records and has no users: access is never copied, so the clone starts with nothing granted.",
    facts: [
      { label: "Pages copied", value: String((body.pages ?? []).length) },
      { label: "Shared records copied", value: "None" },
      { label: "External users copied", value: "None" },
    ],
    confirmLabel: "Clone as a draft",
    run: async () => {
      const copy = await context.mutate.create({
        collection: "portals", title: `${portal.title} (copy)`, status: "draft", summary: portal.summary, tags: portal.tags,
        fields: { ...portal.fields, contactId: "", customDomain: "", domainVerified: false, externalUsers: 0, invitesPending: 0, visits90d: 0, lastVisitAt: "", publishedAt: "", inheritsInternalAccess: false, clonedFrom: portal.id },
        body: { pages: body.pages ?? [], shared: [], users: [], activity: [{ at: iso(context), actor: context.actor, detail: `Cloned from ${portal.title}. No records or users were copied.` }] },
      }, `Portal ${portal.title} cloned as a draft by ${context.actor}`);
      context.select(copy.id);
      context.toast("Cloned", `${copy.title} is a draft with no records shared and no users.`);
    },
  });
}

export function previewPortal(context: ScreenContext) {
  context.navigate(`/o/${context.org.slug}/portal/portals/${context.selectedId}/dashboard`);
}

export async function suspendPortal(context: ScreenContext) {
  const portal = await load(context, context.selectedId);
  if (!portal) return;
  const body = bodyOf<PortalBody>(portal, {});
  confirm(context, {
    title: `Suspend ${portal.title}`,
    tone: "danger",
    consequence: `Every link into this portal stops resolving for its ${(body.users ?? []).length} external user${(body.users ?? []).length === 1 ? "" : "s"} at once. Nothing is deleted; it can be made live again from the builder.`,
    facts: [{ label: "State now", value: portal.status }, { label: "Records shared", value: String((body.shared ?? []).reduce((sum, scope) => sum + scope.ids.length, 0)) }],
    blocked: portal.status === "suspended" ? "Already suspended." : undefined,
    confirmLabel: "Suspend portal",
    run: async () => {
      const saved = await context.mutate.patch(portal.id, { status: "suspended", fields: { ...portal.fields, suspendedBy: context.actor, suspendedAt: iso(context) }, body: activity(body, iso(context), context.actor, "Portal suspended.") }, { expectRevision: portal.revision, event: `Portal ${portal.title} suspended by ${context.actor}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Suspended", `${portal.title} no longer opens for anyone outside the company.`);
    },
  });
}

/* ---------------- PORTAL-002 arrange modules, test ---------------- */

export function ModuleArranger({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const payload = context.overlayPayload as { pageId?: string } | undefined;
  const body = bodyOf<PortalBody>(portal, {});
  const page = (body.pages ?? []).find((item) => item.id === payload?.pageId) ?? (body.pages ?? [])[0];
  if (!portal || !page) return <Empty title="No page selected" />;
  return <ModuleArrangerForm key={`${portal.id}-${page.id}`} context={context} close={close} portal={portal} page={page} />;
}

function ModuleArrangerForm({ context, close, portal, page }: { context: ScreenContext; close: () => void; portal: Rec; page: PortalPage }) {
  const body = bodyOf<PortalBody>(portal, {});
  const [modules, setModules] = useState<string[]>(page.modules);
  const [gate, setGate] = useState(page.gate);
  const [note, setNote] = useState("");
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next);
    setNote(`${MODULE_LABELS[modules[index]] ?? modules[index]} moved to position ${target + 1}.`);
  };
  return (
    <form
      id="module-picker"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await context.mutate.patch(portal.id, {
          body: activity({ ...body, pages: (body.pages ?? []).map((item) => (item.id === page.id ? { ...item, modules, gate } : item)) }, iso(context), context.actor, `${page.name}: modules arranged as ${modules.join(", ")}.`),
        }, { expectRevision: portal.revision, event: `Modules arranged on ${portal.title} · ${page.name}` });
        if (!saved) return;
        context.toast("Page saved", `${page.name} shows ${modules.length} module${modules.length === 1 ? "" : "s"} in this order.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Page", value: page.name }, { label: "Portal", value: portal.title }]} />
      <ol className="ds-stack ds-gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {modules.map((key, index) => (
          <li key={key} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}
            draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); if (!Number.isNaN(from)) move(from, index - from); }}>
            <Row gap={2}>
              <span className="ds-num">{index + 1}</span>
              <strong className="ds-grow">{MODULE_LABELS[key] ?? key}</strong>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${MODULE_LABELS[key] ?? key} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${MODULE_LABELS[key] ?? key} down`} disabled={index === modules.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            </Row>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="ds-subtle">{note || "Drag a module, or use its arrow buttons."}</p>
      <fieldset className="ds-fieldset">
        <legend>Modules on this page</legend>
        <Stack gap={2}>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <Checkbox key={key} label={label} checked={modules.includes(key)}
              onChange={(event) => setModules((current) => (event.target.checked ? [...current, key] : current.filter((item) => item !== key)))} />
          ))}
        </Stack>
      </fieldset>
      <Field label="Who can open this page">
        <Select value={gate} onChange={(event) => setGate(event.target.value)}>
          {Object.entries(GATE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="A module shows only what is granted">Adding the orders module does not share an order. It renders the orders this portal has been granted, which may be none.</Notice>
    </form>
  );
}

export async function testPortal(context: ScreenContext) {
  const portal = await load(context, context.params.id);
  if (!portal) return;
  const portals = await listByCollection(context.org.id, "portals");
  const collections = ["orders", "invoices", "bookings", "documents", "purchaseOrders", "returns"];
  const pools = Object.fromEntries(await Promise.all(collections.map(async (name) => [name, await listByCollection(context.org.id, name)] as const))) as Record<string, Rec[]>;
  const body = bodyOf<PortalBody>(portal, {});
  const shared = (body.shared ?? []).flatMap((scope) => scope.ids.map((id) => ({ collection: scope.collection, id, record: (pools[scope.collection] ?? []).find((item) => item.id === id) })));
  const contactId = String(portal.fields.contactId ?? "");
  const contacts = await listByCollection(context.org.id, "contacts");
  const nameOf = (id: string) => contacts.find((contact) => contact.id === id)?.title ?? id;
  const foreign = shared.filter((item) => item.record && contactId && String(item.record.fields.contactId ?? contactId) !== contactId);
  const missing = shared.filter((item) => !item.record);
  const sharedIds = new Set(shared.map((item) => item.id));
  const reachable = [...sharedIds, ...portalDocuments(portal, pools.documents ?? []).map((document) => document.id)];
  const outside = Object.values(pools).flat().filter((record) => !reachable.includes(record.id));
  // Probe every id the portal does not name through the same resolver the portal renders with.
  const resolver = { ...pools, portals, messages: [], contacts: [] } as unknown as ReturnType<typeof usePortalData>;
  const resolved = new Set(sharedRecords(portal, resolver).map((item) => item.record.id));
  const traversable = outside.filter((record) => resolved.has(record.id)).length;
  const checks = [
    { label: "Inherits no internal permission", ok: portal.fields.inheritsInternalAccess !== true },
    { label: `Every shared record names this portal's contact (${shared.length} checked)`, ok: foreign.length === 0, review: true },
    { label: "Every shared id still resolves", ok: missing.length === 0 },
    { label: `Internal ids outside the list are not reachable (${outside.length} probed)`, ok: traversable === 0 },
    { label: "At least one page is gated", ok: (body.pages ?? []).length > 0 },
  ];
  const failed = checks.filter((check) => !check.ok && !("review" in check));
  const saved = await context.mutate.patch(portal.id, {
    fields: { ...portal.fields, testedAt: iso(context), testedBy: context.actor, testsPassed: failed.length === 0 },
    body: activity(body, iso(context), context.actor, `Access test: ${checks.length - failed.length} of ${checks.length} passed.`),
  }, { expectRevision: portal.revision, event: `Portal ${portal.title} access-tested by ${context.actor}: ${checks.length - failed.length}/${checks.length}` });
  if (!saved) return;
  context.openOverlay("portal test", { checks, foreign: foreign.map((item) => `${item.record?.title ?? item.id} (linked to ${nameOf(String(item.record?.fields.contactId ?? ""))}, not ${nameOf(contactId)})`) });
}

export function PortalTestResult({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { checks?: { label: string; ok: boolean; review?: boolean }[]; foreign?: string[] } | undefined;
  return (
    <Stack gap={3}>
      {(payload?.checks ?? []).map((check) => (
        <Row key={check.label} gap={2}><Pill tone={check.ok ? "success" : check.review ? "warning" : "danger"} dot>{check.ok ? "Pass" : check.review ? "Review" : "Fail"}</Pill><span className="ds-grow">{check.label}</span></Row>
      ))}
      {(payload?.foreign ?? []).length > 0 && <Notice tone="warning" title="Shared records that name a different contact">{payload?.foreign?.join("; ")}. Confirm each belongs to this client, or remove it from the portal's list; a record of another client must never be shared here.</Notice>}
      <Notice tone="info">The test runs against the portal's own list of records in this browser and is recorded on the portal with your name.</Notice>
    </Stack>
  );
}

/* ---------------- PORTAL-003 comment, approve a scoped item ---------------- */

function isShared(portal: Rec | undefined, record: Rec, data: ReturnType<typeof usePortalData>) {
  return portal ? sharedRecords(portal, data).some((item) => item.record.id === record.id) || String(record.fields.portalId ?? "") === portal.id : false;
}

export function CommentForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const { actor, role } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const [text, setText] = useState("");
  if (!portal) return <Empty title="No portal" />;
  if (!record) return <Empty title="Select a shared item to comment on" />;
  const granted = isShared(portal, record, data);
  return (
    <form
      id="portal-comment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim() || !granted) return;
        await context.mutate.create({
          collection: "messages", title: `Comment on ${record.title}`, status: "open", summary: text.trim(), at: iso(context), parentId: portal.id,
          tags: ["portal", "comment"],
          fields: { portalId: portal.id, direction: role === "client" ? "in" : "out", kind: "comment", author: actor, relatesTo: record.id, delivery: "not_connected", attachments: 0, internalOnly: false },
          body: { text: text.trim() },
        }, `Comment on ${record.title} recorded in ${portal.title}`);
        context.toast("Comment recorded", "It is on the portal thread against this item. Nobody was emailed: no mail provider is connected.");
        close();
      }}
    >
      <Properties rows={[{ label: "About", value: record.title }, { label: "Kind", value: record.collection }]} />
      {!granted && <Notice tone="danger" title="This item is not shared with this portal">A comment can only be left on something the portal names.</Notice>}
      <Field label="Comment" required><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></Field>
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export async function approveScopedItem(context: ScreenContext) {
  const record = await load(context, context.selectedId);
  if (!record) return;
  const portals = await listByCollection(context.org.id, "portals");
  const portal = portals.find((item) => item.id === context.params.id);
  const shared = portal ? (bodyOf<PortalBody>(portal, {}).shared ?? []).some((scope) => scope.ids.includes(record.id)) || String(record.fields.portalId ?? "") === portal.id : false;
  const signature = String(record.fields.signature ?? "");
  confirm(context, {
    title: `Approve ${record.title}`,
    consequence: `Records that ${context.actor} approved ${record.title}${record.fields.version ? ` version ${String(record.fields.version)}` : ""} at this time, from this portal. It is an approval recorded in this workspace, not a qualified electronic signature.`,
    facts: [{ label: "Kind", value: record.collection }, { label: "State", value: record.status.replace("_", " ") }],
    blocked: !shared ? "This item is not shared with this portal, so it cannot be approved from here."
      : record.fields.clientApproval === "approved" || signature === "signed_local" ? `Already approved by ${String(record.fields.clientApprovedBy ?? record.fields.signedBy ?? "the client")}.` : undefined,
    confirmLabel: "Approve",
    run: async () => {
      const saved = await context.mutate.patch(record.id, {
        status: signature === "requested" ? "signed" : record.status,
        fields: { ...record.fields, clientApproval: "approved", clientApprovedBy: context.actor, clientApprovedAt: iso(context), ...(signature === "requested" ? { signature: "signed_local", signedBy: context.actor, signedAt: iso(context) } : {}) },
      }, { expectRevision: record.revision, event: `${record.title} approved by ${context.actor} in ${portal?.title ?? "the portal"}` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Approved", `${record.title} is recorded as approved by ${context.actor}.`);
    },
  });
}

/* ---------------- PORTAL-004 download ---------------- */

export async function downloadDocument(context: ScreenContext) {
  const document = await load(context, context.selectedId);
  if (!document) return;
  const expiry = expiryState(document.fields.linkExpiresAt, context.now);
  const revoked = document.fields.revoked === true || document.status === "archived";
  if (expiry.expired || revoked) {
    await context.mutate.log(`Download of ${document.title} refused: ${revoked ? "revoked" : "link expired"}`, { entityId: document.id, type: "portal.download_refused" });
    context.toast("Link no longer works", `${document.title} ${revoked ? "was revoked" : "has expired"}, so the download is refused straight away.`, "blocked");
    return;
  }
  const text = [
    `${document.title}`,
    `Version ${String(document.fields.version ?? 1)} · ${String(document.fields.kind ?? "file")} · ${String(document.fields.sizeLabel ?? "")}`,
    `Shared by ${String(document.fields.sharedBy ?? "")}`,
    "",
    document.summary,
    "",
    "No file store is connected, so this download is the document's record, not the file itself.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.title.replace(/[^\w.-]+/g, "-")}.txt`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await context.mutate.patch(document.id, { fields: { ...document.fields, downloads: Number(document.fields.downloads ?? 0) + 1, lastDownloadedAt: iso(context), lastDownloadedBy: context.actor } }, { expectRevision: document.revision, event: `${document.title} downloaded by ${context.actor}` });
  context.toast("Downloaded", "The document's record was saved as a text file. No stored file exists to download.");
}

/* ---------------- PORTAL-005 upload, book a meeting ---------------- */

export function UploadAttachment({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const [file, setFile] = useState<{ name: string; size: number; type: string } | null>(null);
  const [note, setNote] = useState("");
  if (!portal) return <Empty title="No portal" />;
  const size = file ? (file.size > 1_048_576 ? `${(file.size / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : "";
  return (
    <form
      id="upload-attachment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return;
        await context.mutate.create({
          collection: "documents", title: file.name, status: "shared", summary: note.trim() || `Attached by ${context.actor}. The file itself is not stored.`, parentId: portal.id,
          tags: ["portal", "attachment"],
          fields: { portalId: portal.id, kind: "attachment", sizeLabel: size, version: 1, signature: "none", downloadable: false, stored: false, mime: file.type || "unknown", sharedBy: context.actor, linkExpiresAt: new Date(context.now.getTime() + 30 * 86_400_000).toISOString(), downloads: 0 },
        }, `Attachment ${file.name} described on ${portal.title}; the file was not stored`);
        context.toast("Attachment recorded", `${file.name} is listed on the portal. The file stayed on your device: there is no file store.`);
        close();
      }}
    >
      <Field label="File" required hint="Its name, size and type are recorded. The contents are not uploaded anywhere.">
        <input type="file" onChange={(event) => { const picked = event.target.files?.[0]; setFile(picked ? { name: picked.name, size: picked.size, type: picked.type } : null); }} />
      </Field>
      {file && <Properties rows={[{ label: "Name", value: file.name }, { label: "Size", value: size }, { label: "Type", value: file.type || "unknown" }]} />}
      <Field label="Note"><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <ProviderBoundary id="file.store" title="No file store is connected">The attachment is described on the portal so the studio knows it exists; the file has to be sent another way.</ProviderBoundary>
    </form>
  );
}

export function BookMeeting({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const book = useBookData();
  const { org } = useWorkspace();
  const [serviceId, setServiceId] = useState("");
  const [slot, setSlot] = useState("");
  if (!portal) return <Empty title="No portal" />;
  const services = book.services.filter((service) => service.status !== "archived" && service.fields.published === true);
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const resourceId = (service?.body as { resources?: string[] } | undefined)?.resources?.[0] ?? "";
  const minutes = Number(service?.fields.minutes ?? 45);
  const slots = service && resourceId ? freeSlots(book.bookings, book.resources, org.id, resourceId, minutes, context.now) : [];
  const chosen = slots.find((item) => item.startAt === slot);
  return (
    <form
      id="book-meeting"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!service || !chosen) return;
        const contact = String(portal.fields.contactId ?? "");
        await context.mutate.create({
          collection: "bookings", title: `${portal.title} · ${service.title}`, status: "hold", amountMinor: service.amountMinor,
          startAt: chosen.startAt, endAt: chosen.endAt, at: chosen.startAt, summary: `Requested from the ${portal.title} portal by ${context.actor}.`,
          fields: { serviceId: service.id, resourceId, contactId: contact, depositMinor: Number(service.fields.depositMinor ?? 0), depositState: Number(service.fields.depositMinor ?? 0) ? "not_requested" : "none", payment: "not_connected", seats: 1, reminderState: "not_connected", source: "portal", portalId: portal.id, checkedIn: false },
          body: { messages: [] },
        }, `Meeting held for ${portal.title}: ${service.title} at ${chosen.startAt}`);
        context.toast("Slot held", `${chosen.label} is held for ${portal.title}. The studio confirms it; a held slot is never shown as confirmed.`);
        close();
      }}
    >
      {services.length === 0 ? <Empty title="No bookable service">Publish a service in Bookings first.</Empty> : (
        <>
          <Field label="Meeting"><Select value={service?.id ?? ""} onChange={(event) => { setServiceId(event.target.value); setSlot(""); }}>{services.map((item) => <option key={item.id} value={item.id}>{item.title} · {String(item.fields.minutes ?? "")} min</option>)}</Select></Field>
          <fieldset className="ds-fieldset">
            <legend>Free times (checked against every booking)</legend>
            <Row gap={2} wrap>
              {slots.map((item) => <Button key={item.startAt} size="sm" variant={slot === item.startAt ? "primary" : "secondary"} aria-pressed={slot === item.startAt} onClick={() => setSlot(item.startAt)}>{item.label}</Button>)}
              {slots.length === 0 && <span className="ds-subtle">No free slot in the next five working days.</span>}
            </Row>
          </fieldset>
          <Notice tone="info">The time is held, not confirmed: the studio confirms it, and the slot is re-checked for a clash at that moment.</Notice>
          <ProviderBoundary id="calendar.sync" />
        </>
      )}
    </form>
  );
}

/* ---------------- PORTAL-006 pay ---------------- */

export function ReportPayment({ context, invoice }: { context: ScreenContext; invoice: Rec }) {
  const { actor } = useWorkspace();
  const reported = String(invoice.fields.paymentState ?? "") === "awaiting_external_confirmation";
  const paid = ["paid", "paid_local"].includes(String(invoice.fields.payment)) || invoice.status === "paid";
  return (
    <Stack gap={2}>
      {reported && <Notice tone="info" title={CAPABILITY_LABELS.awaiting_external_confirmation}>{String(invoice.fields.clientReportedPaidBy)} reported a bank transfer on {context.date(String(invoice.fields.clientReportedPaidAt))}. The studio confirms it against the bank before the invoice reads as paid.</Notice>}
      <Button
        variant="primary"
        disabled={reported || paid}
        onClick={async () => {
          const saved = await context.mutate.patch(invoice.id, { fields: { ...invoice.fields, paymentState: "awaiting_external_confirmation", clientReportedPaidAt: iso(context), clientReportedPaidBy: actor } }, { expectRevision: invoice.revision, event: `${actor} reported paying ${invoice.title} by bank transfer` });
          if (!saved) return;
          context.toast("Payment reported", "The invoice is awaiting the studio's confirmation. No money moved through this browser.");
        }}
      >
        {paid ? "Already paid" : reported ? "Payment reported" : "I have paid by bank transfer"}
      </Button>
    </Stack>
  );
}

/* ---------------- PORTAL-007 set expiry, revoke, review activity ---------------- */

export function SetExpiry({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  if (!portal) return <Empty title="No portal" />;
  return <SetExpiryForm key={portal.id} context={context} close={close} portal={portal} />;
}

function SetExpiryForm({ context, close, portal }: { context: ScreenContext; close: () => void; portal: Rec }) {
  const body = bodyOf<PortalBody>(portal, {});
  const users = body.users ?? [];
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const user = users.find((item) => item.id === userId);
  const [date, setDate] = useState((user?.expiresAt || new Date(context.now.getTime() + 30 * 86_400_000).toISOString()).slice(0, 10));
  const expires = new Date(`${date}T23:59:00`);
  const maxDays = Number(portal.fields.linkExpiryDays ?? 30) * 3;
  const tooFar = (expires.getTime() - context.now.getTime()) / 86_400_000 > maxDays;
  const past = expires <= context.now;
  return (
    <form
      id="account-recovery"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!user || tooFar || past) return;
        const saved = await context.mutate.patch(portal.id, {
          body: activity({ ...body, users: users.map((item) => (item.id === user.id ? { ...item, expiresAt: expires.toISOString() } : item)) }, iso(context), context.actor, `Access for ${user.email} set to expire ${date}.`),
        }, { expectRevision: portal.revision, event: `Portal access for ${user.email} set to expire ${date} by ${context.actor}` });
        if (!saved) return;
        context.toast("Expiry set", `${user.name}'s access lapses on ${context.date(expires)}.`);
        close();
      }}
    >
      {users.length === 0 ? <Empty title="Nobody has access to this portal" /> : (
        <>
          <Field label="Person"><Select value={userId} onChange={(event) => { setUserId(event.target.value); const next = users.find((item) => item.id === event.target.value); setDate((next?.expiresAt || iso(context)).slice(0, 10)); }}>{users.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</Select></Field>
          <Properties rows={[{ label: "Expires now", value: user?.expiresAt ? context.date(user.expiresAt) : "Not set" }, { label: "Longest allowed", value: `${maxDays} days from today` }]} />
          <Field label="New expiry" error={past ? "Choose a date in the future, or revoke instead" : tooFar ? `No more than ${maxDays} days ahead` : undefined}>
            <TextInput type="date" value={date} invalid={past || tooFar} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </>
      )}
      <Notice tone="info">An expired link stops resolving at once; extending it is a deliberate act recorded with your name.</Notice>
    </form>
  );
}

export function RevokeAccess({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!portal) return <Empty title="No portal" />;
  const body = bodyOf<PortalBody>(portal, {});
  const users = body.users ?? [];
  const user = users.find((item) => item.id === (userId || users[0]?.id));
  return (
    <Stack gap={4}>
      {users.length === 0 ? <Empty title="Nobody has access to revoke" /> : (
        <>
          <Field label="Person"><Select value={user?.id ?? ""} onChange={(event) => setUserId(event.target.value)}>{users.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</Select></Field>
          <Notice tone="warning" title="Revoking takes effect immediately">{user?.name} is removed from the portal's list, so every link they hold stops resolving now. Records they could see stay in the workspace.</Notice>
          <Row gap={2}>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <span className="ds-grow" />
            <Button variant="danger" busy={busy} disabled={!user} onClick={async () => {
              if (!user) return;
              setBusy(true);
              const saved = await context.mutate.patch(portal.id, {
                fields: { ...portal.fields, externalUsers: users.length - 1 },
                body: activity({ ...body, users: users.filter((item) => item.id !== user.id) }, iso(context), context.actor, `Revoked access for ${user.email}.`),
              }, { expectRevision: portal.revision, event: `Portal access for ${user.email} revoked by ${context.actor}` });
              setBusy(false);
              if (!saved) return;
              context.toast("Access revoked", `${user.name} can no longer open ${portal.title}.`);
              close();
            }}>Revoke access</Button>
          </Row>
        </>
      )}
    </Stack>
  );
}

export async function reviewActivity(context: ScreenContext) {
  const portal = await load(context, context.params.id);
  if (!portal) return;
  const body = bodyOf<PortalBody>(portal, {});
  const since = String(portal.fields.activityReviewedAt ?? "");
  const unseen = (body.activity ?? []).filter((entry) => !since || entry.at > since);
  context.setTab("Audit");
  confirm(context, {
    title: `Review activity on ${portal.title}`,
    consequence: `${unseen.length} entr${unseen.length === 1 ? "y has" : "ies have"} been recorded since ${since ? context.dateTime(since) : "the portal was created"}. Recording the review notes that ${context.actor} has read them; the entries themselves are not changed.`,
    facts: unseen.slice(0, 6).map((entry) => ({ label: `${context.dateTime(entry.at)} · ${entry.actor}`, value: entry.detail })),
    confirmLabel: "Record the review",
    run: async () => {
      const saved = await context.mutate.patch(portal.id, { fields: { ...portal.fields, activityReviewedAt: iso(context), activityReviewedBy: context.actor } }, { expectRevision: portal.revision, event: `Activity on ${portal.title} reviewed by ${context.actor} (${unseen.length} entries)` });
      if (!saved) return CHANGED_ELSEWHERE;
      context.toast("Review recorded", `${unseen.length} entries reviewed by ${context.actor}.`);
    },
  });
}
