import { useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row,
  Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { ProviderBoundary } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  bodyOf, expiryState, GATE_LABELS, MODULE_LABELS, portalDocuments, sharedRecords, statusTone,
  usePortalData, type PortalBody,
} from "./data";
import { InvoiceTotalsCard, usePortal } from "./panels";
import { ReportPayment } from "./actions";

/* ====================================================================== *
 * PORTAL overlays. Every grant is explicit: nothing is shared by a rule.
 * ====================================================================== */

/* ---------------- PORTAL-001 ---------------- */

export function PortalWizard({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const { now } = useWorkspace();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("client");
  const [contactId, setContactId] = useState("");
  const [accent, setAccent] = useState("#234fe8");
  const [pages, setPages] = useState<string[]>(["Overview", "Files", "Messages"]);
  const duplicate = data.portals.some((portal) => portal.title.trim().toLowerCase() === title.trim().toLowerCase());
  const invalid = !title.trim() || duplicate || pages.length === 0;

  return (
    <form
      id="portal-wizard"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        await context.mutate.create({
          collection: "portals",
          title: title.trim(),
          status: "draft",
          summary: `${audience} space. Nothing is shared yet.`,
          at: now.toISOString(),
          tags: [audience],
          fields: {
            audience, contactId, accent, customDomain: "", domainVerified: false,
            externalUsers: 0, invitesPending: 0, visits90d: 0, lastVisitAt: "", publishedAt: "",
            inheritsInternalAccess: false, linkExpiryDays: 30, termsVersion: "2026-09",
          },
          body: {
            pages: pages.map((name, index) => ({
              id: `pg-${index + 1}`,
              name,
              modules: name === "Overview" ? ["welcome", "next-actions"] : name === "Files" ? ["documents"] : name === "Messages" ? ["thread"] : name === "Billing" ? ["invoices", "requests"] : ["orders"],
              gate: name === "Billing" ? "billing_contact" : "any_member",
            })),
            shared: [],
            users: [],
            activity: [{ at: now.toISOString(), actor: context.actor, detail: "Portal created with nothing shared." }],
          },
        }, `Portal ${title.trim()} created`);
        context.toast("Portal created", "It starts as a draft with no records shared and nobody invited.");
        close();
      }}
    >
      <Field label="Portal name" required error={duplicate ? "A portal with that name already exists" : undefined}>
        <TextInput value={title} invalid={duplicate} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Row gap={3} wrap>
        <Field label="Audience">
          <Select value={audience} onChange={(event) => setAudience(event.target.value)}>
            {["client", "customer", "supplier", "partner"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Account">
          <Select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Not linked to a contact</option>
            {data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.title}</option>)}
          </Select>
        </Field>
        <Field label="Accent"><TextInput value={accent} onChange={(event) => setAccent(event.target.value)} /></Field>
      </Row>
      <fieldset className="ds-fieldset">
        <legend>Pages</legend>
        <Stack gap={2}>
          {["Overview", "Work", "Files", "Messages", "Billing"].map((page) => (
            <Checkbox
              key={page}
              label={page}
              checked={pages.includes(page)}
              onChange={(event) => setPages((current) => (event.target.checked ? [...current, page] : current.filter((item) => item !== page)))}
            />
          ))}
        </Stack>
      </fieldset>
      <Notice tone="success" title="A new portal inherits nothing">
        No record is shared, nobody is invited and no internal permission carries across. Everything the client can see has to be granted to this portal on purpose.
      </Notice>
    </form>
  );
}

export function PortalBranding({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const [accent, setAccent] = useState(String(portal?.fields.accent ?? "#234fe8"));
  const [domain, setDomain] = useState(String(portal?.fields.customDomain ?? ""));
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="portal-branding"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, accent, customDomain: domain.trim(), domainVerified: false },
        }, { expectRevision: portal.revision, event: `Branding changed on ${portal.title}` });
        context.toast("Branding saved", domain.trim() ? "The domain is recorded. It cannot be verified from a browser, so the portal still opens through the workspace." : "The accent is saved.");
        close();
      }}
    >
      <Row gap={3}>
        <span className="t4-portal-mark" style={{ background: accent }}>{portal.title.slice(0, 2).toUpperCase()}</span>
        <Field label="Accent colour"><TextInput value={accent} onChange={(event) => setAccent(event.target.value)} /></Field>
      </Row>
      <Field label="Custom domain" hint="For example harrow.northline.example">
        <TextInput value={domain} onChange={(event) => setDomain(event.target.value.toLowerCase())} />
      </Field>
      <Notice tone="warning" title="A domain needs DNS and a certificate">
        Both are arranged outside this application. The value is stored so it is ready; the portal is marked unverified until someone confirms it.
      </Notice>
    </form>
  );
}

export function AccessSetup({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const portal = useRecord(payload?.id ?? context.selectedId) ?? data.portals[0];
  const [expiry, setExpiry] = useState(String(portal?.fields.linkExpiryDays ?? 30));
  const [inherits, setInherits] = useState(portal?.fields.inheritsInternalAccess === true);
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="access-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inherits) return;
        await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, linkExpiryDays: Number(expiry) || 30, inheritsInternalAccess: false },
        }, { expectRevision: portal.revision, event: `Access settings changed on ${portal.title}` });
        context.toast("Access saved", `Links on ${portal.title} expire after ${expiry} days.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Portal", value: portal.title },
        { label: "External users", value: <span className="ds-num">{String(portal.fields.externalUsers ?? 0)}</span> },
        { label: "Records shared", value: <span className="ds-num">{String(sharedRecords(portal, data).length)}</span> },
      ]} />
      <Field label="Link expiry in days" hint="A shared link stops working after this many days."><TextInput value={expiry} inputMode="numeric" align="end" onChange={(event) => setExpiry(event.target.value)} /></Field>
      <Checkbox label="Let this portal inherit internal permissions" checked={inherits} onChange={(event) => setInherits(event.target.checked)} />
      {inherits && (
        <Notice tone="danger" title="This cannot be turned on">
          A portal that inherited internal permissions would show a client whatever the staff member who shared it can see, including other clients' records. The setting exists here only to say plainly that it is never used.
        </Notice>
      )}
    </form>
  );
}

/* ---------------- PORTAL-002 ---------------- */

export function ModulePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const payload = context.overlayPayload as { pageId?: string } | undefined;
  const body = bodyOf<PortalBody>(portal, {});
  const page = (body.pages ?? []).find((item) => item.id === payload?.pageId) ?? (body.pages ?? [])[0];
  const [modules, setModules] = useState<string[]>(page?.modules ?? []);
  const [gate, setGate] = useState(page?.gate ?? "any_member");
  if (!portal || !page) return <Empty title="No page selected" />;
  return (
    <form
      id="module-picker"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(portal.id, {
          body: { ...body, pages: (body.pages ?? []).map((item) => (item.id === page.id ? { ...item, modules, gate } : item)) },
        }, { expectRevision: portal.revision, event: `Modules changed on ${portal.title} · ${page.name}` });
        context.toast("Page saved", `${page.name} shows ${modules.length} module${modules.length === 1 ? "" : "s"} to ${GATE_LABELS[gate] ?? gate}.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Page", value: page.name }, { label: "Portal", value: portal.title }]} />
      <fieldset className="ds-fieldset">
        <legend>Modules</legend>
        <Stack gap={2}>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={modules.includes(key)}
              onChange={(event) => setModules((current) => (event.target.checked ? [...current, key] : current.filter((item) => item !== key)))}
            />
          ))}
        </Stack>
      </fieldset>
      <Field label="Who can open this page">
        <Select value={gate} onChange={(event) => setGate(event.target.value)}>
          {Object.entries(GATE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="A module shows only what is granted">
        Adding the orders module does not share an order. It renders the orders this portal has been granted, which may be none.
      </Notice>
    </form>
  );
}

export function DataGrant({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const body = bodyOf<PortalBody>(portal, {});
  const [collection, setCollection] = useState("orders");
  const [recordId, setRecordId] = useState("");
  if (!portal) return <Empty title="No portal" />;
  const pools: Record<string, Rec[]> = {
    orders: data.orders,
    invoices: data.invoices,
    bookings: data.bookings,
    purchaseOrders: data.purchaseOrders,
    returns: data.returns,
  };
  const pool = pools[collection] ?? [];
  const alreadyShared = (body.shared ?? []).find((scope) => scope.collection === collection)?.ids ?? [];
  const candidates = pool.filter((record) => !alreadyShared.includes(record.id));
  const contactId = String(portal.fields.contactId ?? "");
  const chosen = pool.find((record) => record.id === recordId);
  const belongsElsewhere = Boolean(chosen && contactId && String(chosen.fields.contactId ?? "") && String(chosen.fields.contactId) !== contactId);

  return (
    <form
      id="data-grant"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!recordId || belongsElsewhere) return;
        const shared = [...(body.shared ?? [])];
        const existing = shared.find((scope) => scope.collection === collection);
        if (existing) existing.ids = [...existing.ids, recordId];
        else shared.push({ collection, ids: [recordId] });
        await context.mutate.patch(portal.id, {
          body: { ...body, shared, activity: [{ at: new Date().toISOString(), actor: context.actor, detail: `Shared ${chosen?.title} with the portal.` }, ...(body.activity ?? [])] },
        }, { expectRevision: portal.revision, event: `${chosen?.title} shared with ${portal.title}` });
        context.toast("Shared", `${chosen?.title} is now visible in ${portal.title}. Nothing else was shared.`);
        close();
      }}
    >
      <Field label="Kind of record">
        <Select value={collection} onChange={(event) => { setCollection(event.target.value); setRecordId(""); }}>
          {Object.keys(pools).map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Record" required>
        <Select value={recordId} onChange={(event) => setRecordId(event.target.value)} required>
          <option value="">Choose one record</option>
          {candidates.map((record) => <option key={record.id} value={record.id}>{record.title} — {record.summary.slice(0, 48)}</option>)}
        </Select>
      </Field>
      {belongsElsewhere && (
        <Notice tone="danger" title="That record belongs to another account">
          {chosen?.title} is linked to a different contact from this portal. Sharing it would show one client another client's record, so it is refused.
        </Notice>
      )}
      <Notice tone="info" title="One record at a time, on purpose">
        There is no option to share a whole collection. Every grant names a single record, so a portal can never widen itself as new records are created.
      </Notice>
    </form>
  );
}

export function PublishReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  if (!portal) return <Empty title="No portal" />;
  const body = bodyOf<PortalBody>(portal, {});
  const shared = sharedRecords(portal, data);
  const problems = [
    ...((body.pages ?? []).length ? [] : ["The portal has no pages."]),
    ...(shared.length + portalDocuments(portal, data.documents).length ? [] : ["Nothing is shared, so the portal would be empty."]),
    ...((body.users ?? []).length ? [] : ["Nobody has been invited, so nobody can sign in."]),
  ];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Portal", value: portal.title },
        { label: "Pages", value: <span className="ds-num">{String((body.pages ?? []).length)}</span> },
        { label: "Records shared", value: <span className="ds-num">{String(shared.length)}</span> },
        { label: "Documents", value: <span className="ds-num">{String(portalDocuments(portal, data.documents).length)}</span> },
        { label: "External users", value: <span className="ds-num">{String((body.users ?? []).length)}</span> },
      ]} />
      {problems.length > 0 && <Notice tone="warning" title="Before publishing">{problems.join(" ")}</Notice>}
      <ProviderBoundary id="site.publish" title="A portal is not hosted from here" />
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(portal.id, {
            status: "live",
            fields: { ...portal.fields, publishedAt: new Date().toISOString() },
          }, { expectRevision: portal.revision, event: `${portal.title} marked live` });
          context.toast("Marked live", "The portal reads as live in this workspace. Reaching it from outside needs hosting.");
          close();
        }}
      >
        Mark the portal live
      </Button>
    </Stack>
  );
}

/* ---------------- PORTAL-003 ---------------- */

export function SharedItemInspector({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const { portal } = usePortal(context);
  if (!record) return <Empty title="Select a shared item" />;
  const granted = portal
    ? sharedRecords(portal, data).some((item) => item.record.id === record.id) || String(record.fields.portalId ?? "") === portal.id
    : false;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Item", value: record.title },
        { label: "Kind", value: record.collection },
        { label: "State", value: <Pill tone={statusTone(record.status)} dot>{record.status.replace("_", " ")}</Pill> },
        { label: "Shared with this portal", value: granted ? <Pill tone="success">Yes</Pill> : <Pill tone="danger">No</Pill> },
        { label: "Value", value: record.amountMinor === undefined ? "—" : <span className="ds-num">{context.money(record.amountMinor)}</span> },
      ]} />
      {!granted && (
        <Notice tone="danger" title="This record is not shared with this portal">
          It is shown here because an internal view opened it. A portal user cannot reach it: the portal renders only the records it names.
        </Notice>
      )}
      <Notice tone="info" title="What a client sees of this record">
        Its title, its state, its dates and its value. Internal notes, costs and the records of other clients are not part of what a portal renders.
      </Notice>
    </Stack>
  );
}

export function ClientMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const { actor } = useWorkspace();
  const [text, setText] = useState("");
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="client-message"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: `Message · ${actor}`,
          status: "open",
          summary: text.trim(),
          at: new Date().toISOString(),
          parentId: portal.id,
          tags: ["portal", "message"],
          fields: { portalId: portal.id, direction: context.role === "client" ? "in" : "out", kind: "message", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false },
          body: { text: text.trim() },
        }, `Portal message recorded on ${portal.title}`);
        context.toast("Message recorded", "It is on the portal thread. Nothing was emailed: no mail provider is connected.");
        close();
      }}
    >
      <Field label="Message" required><TextArea value={text} rows={5} onChange={(event) => setText(event.target.value)} required /></Field>
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export function AccessRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const { actor } = useWorkspace();
  const [what, setWhat] = useState("");
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="access-request"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!what.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: `Access request · ${actor}`,
          status: "open",
          summary: what.trim(),
          at: new Date().toISOString(),
          parentId: portal.id,
          tags: ["portal", "request"],
          fields: { portalId: portal.id, direction: "in", kind: "request", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false },
          body: { text: what.trim() },
        }, `Access request recorded on ${portal.title}`);
        context.toast("Request recorded", "The studio decides what to share. Asking never grants anything by itself.");
        close();
      }}
    >
      <Notice tone="info" title="A request is a message, not a switch">
        Nothing here changes what this portal can see. The studio reads the request and grants a specific record if they agree.
      </Notice>
      <Field label="What do you need?" required><TextArea value={what} rows={4} onChange={(event) => setWhat(event.target.value)} required /></Field>
    </form>
  );
}

/* ---------------- PORTAL-004 ---------------- */

export function DocumentPreview({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const document = useRecord(payload?.id ?? context.selectedId) ?? data.documents[0];
  if (!document) return <Empty title="No document" />;
  const expiry = expiryState(document.fields.linkExpiresAt, now);
  const versions = (document.body as { versions?: { version: number; at: string; by: string; note: string }[] } | undefined)?.versions ?? [];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Document", value: document.title },
        { label: "Kind", value: String(document.fields.kind ?? "file") },
        { label: "Version", value: <span className="ds-num">v{String(document.fields.version ?? 1)}</span> },
        { label: "Size", value: <span className="ds-num">{String(document.fields.sizeLabel ?? "—")}</span> },
        { label: "Shared by", value: String(document.fields.sharedBy ?? "—") },
        { label: "Downloads", value: <span className="ds-num">{String(document.fields.downloads ?? 0)}</span> },
        { label: "Link", value: expiry.expired ? <Pill tone="danger" dot>Expired</Pill> : expiry.known ? <Pill tone="success">{expiry.days} days left</Pill> : "No expiry set" },
      ]} />
      <div className="t4-device">
        <div className="t4-device-head">{document.title}</div>
        <div className="t4-device-body">
          <p className="ds-subtle">{document.summary}</p>
          <Notice tone="info" title="No file is stored">
            Documents are records describing what was shared. There is no file store in this build, so the preview shows the description, version and audit rather than rendering a file that does not exist.
          </Notice>
        </div>
      </div>
      {versions.length > 0 && (
        <DataGrid rows={versions} rowId={(row) => String(row.version)} label="Versions" filterable={false}
          columns={[
            { key: "version", header: "Version", primary: true, cell: (row) => <span className="ds-num">v{String(row.version)}</span> },
            { key: "at", header: "Shared", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
            { key: "by", header: "By", cell: (row) => row.by },
            { key: "note", header: "Note", cell: (row) => row.note },
          ]} />
      )}
      {expiry.expired && <Notice tone="danger" title="This link no longer works">Expiry is checked when the document is opened, so an old link stops resolving the moment it passes.</Notice>}
    </Stack>
  );
}

export function PermissionRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  return <AccessRequest context={context} close={close} />;
}

export function SignatureRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = usePortalData();
  const { actor, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const document = useRecord(payload?.id ?? context.selectedId) ?? data.documents.find((item) => String(item.fields.signature) === "requested");
  const [accepted, setAccepted] = useState(false);
  if (!document) return <Empty title="No document awaiting signature" />;
  return (
    <form
      id="signature-request"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!accepted) return;
        await context.mutate.patch(document.id, {
          status: "signed",
          fields: { ...document.fields, signature: "signed_local", signedBy: actor, signedAt: now.toISOString() },
        }, { expectRevision: document.revision, event: `${document.title} accepted by ${actor}` });
        context.toast("Acceptance recorded", "This is a local record of acceptance, not a qualified electronic signature.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Document", value: document.title },
        { label: "Version", value: <span className="ds-num">v{String(document.fields.version ?? 1)}</span> },
        { label: "Requested by", value: String(document.fields.sharedBy ?? "—") },
      ]} />
      <Notice tone="warning" title="This is acceptance, not a qualified signature">
        A legally recognised signature needs an accredited provider that verifies identity and seals the document. None is connected, so what is recorded here is that {actor} accepted this version at this time in this workspace.
      </Notice>
      <Checkbox label={`I accept ${document.title} version ${String(document.fields.version ?? 1)}`} checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
    </form>
  );
}

/* ---------------- PORTAL-005 ---------------- */

export function ConversationDetails({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const message = useRecord(payload?.id ?? context.selectedId) ?? data.messages[0];
  const { portal } = usePortal(context);
  if (!message) return <Empty title="No conversation" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "From", value: String(message.fields.author ?? "—") },
        { label: "Kind", value: <Pill tone={String(message.fields.kind) === "complaint" ? "danger" : "neutral"}>{String(message.fields.kind ?? "message")}</Pill> },
        { label: "When", value: <span className="ds-num">{context.dateTime(message.at)}</span> },
        { label: "State", value: <Pill tone={statusTone(message.status)} dot>{message.status}</Pill> },
        { label: "Attachments", value: <span className="ds-num">{String(message.fields.attachments ?? 0)}</span> },
        { label: "Delivery", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      <Card eyebrow="MESSAGE" prov="human" title="What was said"><p className="ds-prose">{message.summary}</p></Card>
      {portal && (
        <Notice tone="info" title="What an answer could draw on">
          This portal shares {sharedRecords(portal, data).length} records and {portalDocuments(portal, data.documents).length} documents. An answer composed here is limited to those; internal project notes are not part of the portal and are not read.
        </Notice>
      )}
    </Stack>
  );
}

export function AttachmentPreview({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const documents = portalDocuments(portal, data.documents);
  return (
    <Stack gap={4}>
      <DataGrid rows={documents} rowId={(row) => row.id} label="Attachments" filterable={false}
        onOpen={(id) => context.openOverlay("Document preview", { id })}
        columns={[
          { key: "title", header: "Document", primary: true, cell: (row) => row.title },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "file")}</Pill> },
          { key: "size", header: "Size", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.sizeLabel ?? "—")}</span> },
        ]}
        empty={<Empty title="Nothing is attached to this portal" />} />
      <Notice tone="warning" title="Uploading needs a file store">
        A client could attach a photograph of a damaged piece here. There is nowhere to put the file in this build, so an attachment is recorded as a description against the message instead.
      </Notice>
    </Stack>
  );
}

export function ComplaintForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const { actor } = useWorkspace();
  const [what, setWhat] = useState("");
  const [severity, setSeverity] = useState("normal");
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="complaint-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!what.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: `Complaint · ${actor}`,
          status: "escalated",
          summary: what.trim(),
          at: new Date().toISOString(),
          parentId: portal.id,
          tags: ["portal", "complaint"],
          fields: { portalId: portal.id, direction: "in", kind: "complaint", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false, severity },
          body: { text: what.trim() },
        }, `Complaint recorded on ${portal.title}`);
        context.toast("Complaint recorded", "It is marked escalated so a person picks it up rather than an automatic reply closing it.");
        close();
      }}
    >
      <Field label="What went wrong" required><TextArea value={what} rows={4} onChange={(event) => setWhat(event.target.value)} required /></Field>
      <Field label="How serious"><Select value={severity} onChange={(event) => setSeverity(event.target.value)}>{["normal", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</Select></Field>
      <Notice tone="danger" title="A complaint always goes to a person">
        It is never answered automatically and never closed by a rule. The studio sees it marked escalated until someone records what they did about it.
      </Notice>
    </form>
  );
}

/* ---------------- PORTAL-006 ---------------- */

export function PaymentProvider({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const invoice = useRecord(payload?.id ?? context.selectedId) ?? data.invoices.find((item) => String(item.fields.portalId ?? "") === portal?.id);
  return (
    <Stack gap={4}>
      {invoice && <InvoiceTotalsCard invoice={invoice} context={context} />}
      {invoice && <ReportPayment context={context} invoice={invoice} />}
      <ProviderBoundary id="payment.capture" title="There is no payment link">
        A card payment must go straight to a processor from a hosted field. This build has no server to hold a key, so no link can be created and no card detail is ever requested from a client.
      </ProviderBoundary>
      <Properties rows={[
        { label: "How to pay", value: "Bank transfer to the account on the invoice" },
        { label: "What happens then", value: "The studio records the payment against the invoice" },
        { label: "Card details collected here", value: <Pill tone="success">None, at any point</Pill> },
      ]} />
    </Stack>
  );
}

export function DisputeForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { actor } = useWorkspace();
  const { portal } = usePortal(context);
  const payload = context.overlayPayload as { id?: string; kind?: string } | undefined;
  const invoice = useRecord(payload?.id ?? context.selectedId);
  const isRequest = payload?.kind === "request";
  const [reason, setReason] = useState("");
  if (!portal) return <Empty title="No portal" />;
  return (
    <form
      id="dispute-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        await context.mutate.create({
          collection: "messages",
          title: `${isRequest ? "Request" : "Dispute"} · ${actor}`,
          status: isRequest ? "open" : "escalated",
          summary: reason.trim(),
          at: new Date().toISOString(),
          parentId: portal.id,
          tags: ["portal", isRequest ? "request" : "complaint"],
          fields: { portalId: portal.id, direction: "in", kind: isRequest ? "request" : "complaint", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false, invoiceId: invoice?.id ?? "" },
          body: { text: reason.trim() },
        }, `${isRequest ? "Request" : "Dispute"} recorded on ${portal.title}`);
        if (invoice && !isRequest) {
          await context.mutate.patch(invoice.id, { status: "disputed", fields: { ...invoice.fields, payment: "disputed" } }, { expectRevision: invoice.revision, event: `${invoice.title} disputed by ${actor}` });
        }
        context.toast(isRequest ? "Request recorded" : "Dispute recorded", isRequest ? "The studio will respond on the portal thread." : "The invoice is marked disputed and is not pursued while it is open.");
        close();
      }}
    >
      {invoice && !isRequest && (
        <Properties rows={[
          { label: "Invoice", value: <span className="ds-num">{invoice.title}</span> },
          { label: "Amount", value: <span className="ds-num">{context.money(invoice.amountMinor)}</span> },
          { label: "Current state", value: <Pill tone={statusTone(invoice.status)}>{invoice.status.replace("_", " ")}</Pill> },
        ]} />
      )}
      <Field label={isRequest ? "What do you need?" : "Why are you disputing this?"} required>
        <TextArea value={reason} rows={4} onChange={(event) => setReason(event.target.value)} required />
      </Field>
      {!isRequest && <Notice tone="warning" title="A disputed invoice is not chased">While the dispute is open the studio does not pursue payment, and the amount is reported separately from what is outstanding.</Notice>}
    </form>
  );
}

export function DocumentReceipt({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const invoice = useRecord(payload?.id ?? context.selectedId) ?? data.invoices[0];
  if (!invoice) return <Empty title="No invoice" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Invoice", value: <span className="ds-num">{invoice.title}</span> },
        { label: "Issued", value: <span className="ds-num">{context.dateTime(invoice.at)}</span> },
        { label: "Due", value: <span className="ds-num">{context.date(invoice.dueAt)}</span> },
        { label: "State", value: <Pill tone={statusTone(invoice.status)} dot>{invoice.status.replace("_", " ")}</Pill> },
      ]} />
      <InvoiceTotalsCard invoice={invoice} context={context} />
      <Button
        variant="secondary"
        onClick={() => {
          const lines = ((invoice.body as { lines?: { description: string; quantity: number; unitPriceMinor: number }[] } | undefined)?.lines ?? []);
          const header = "description,quantity,unit_minor\n";
          const rows = lines.map((line) => `"${line.description.replace(/"/g, '""')}",${line.quantity},${line.unitPriceMinor}`).join("\n");
          const blob = new Blob([header + rows], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = window.document.createElement("a");
          link.href = url;
          link.download = `${invoice.title}.csv`;
          link.click();
          URL.revokeObjectURL(url);
          context.toast("Downloaded", "The lines were written to a CSV file by this browser.");
        }}
      >
        Download the lines
      </Button>
    </Stack>
  );
}

/* ---------------- PORTAL-007 ---------------- */

export function ExternalInvite({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const { now } = useWorkspace();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [portalRole, setPortalRole] = useState("portal_member");
  const [days, setDays] = useState(String(portal?.fields.linkExpiryDays ?? 30));
  if (!portal) return <Empty title="No portal" />;
  const body = bodyOf<PortalBody>(portal, {});
  const duplicate = (body.users ?? []).some((user) => user.email.toLowerCase() === email.trim().toLowerCase());
  const invalid = !name.trim() || !email.trim() || duplicate;
  return (
    <form
      id="external-invite"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const expires = new Date(now.getTime() + (Number(days) || 30) * 86_400_000).toISOString();
        await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, invitesPending: Number(portal.fields.invitesPending ?? 0) + 1 },
          body: {
            ...body,
            users: [...(body.users ?? []), { id: `u-${Date.now()}`, name: name.trim(), email: email.trim(), role: portalRole, lastSeenAt: "", expiresAt: expires }],
            activity: [{ at: now.toISOString(), actor: context.actor, detail: `Invited ${email.trim()} as ${portalRole.replace("_", " ")}.` }, ...(body.activity ?? [])],
          },
        }, { expectRevision: portal.revision, event: `${email.trim()} invited to ${portal.title}` });
        context.toast("Invitation recorded", "It is held locally with its scope and expiry. No email could be sent, so nobody has been told yet.");
        close();
      }}
    >
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Email" required error={duplicate ? "That email already has access to this portal" : undefined}>
        <TextInput type="email" value={email} invalid={duplicate} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Row gap={3} wrap>
        <Field label="Portal role">
          <Select value={portalRole} onChange={(event) => setPortalRole(event.target.value)}>
            <option value="portal_member">Member — sees the pages that are open to any member</option>
            <option value="portal_admin">Administrator — also sees billing</option>
          </Select>
        </Field>
        <Field label="Access expires in days"><TextInput value={days} inputMode="numeric" align="end" onChange={(event) => setDays(event.target.value)} /></Field>
      </Row>
      <Notice tone="warning" title="An invitation grants nothing beyond this portal">
        A portal role is scoped to this portal alone. It carries no access to the workspace, to another portal, or to anything this portal has not been given.
      </Notice>
      <ProviderBoundary id="email.send" />
    </form>
  );
}

export function ScopePreview({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  if (!portal) return <Empty title="No portal" />;
  const shared = sharedRecords(portal, data);
  const documents = portalDocuments(portal, data.documents);
  const everything = data.orders.length + data.invoices.length + data.bookings.length + data.documents.length;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Visible to this portal", value: <strong className="ds-num">{String(shared.length + documents.length)}</strong> },
        { label: "Records in the workspace", value: <span className="ds-num">{String(everything)}</span> },
        { label: "Share of the workspace", value: <span className="ds-num">{everything === 0 ? "0%" : `${Math.round(((shared.length + documents.length) / everything) * 100)}%`}</span> },
        { label: "Other portals", value: <span className="ds-num">{String(data.portals.length - 1)}</span> },
      ]} />
      <DataGrid rows={[...shared.map((item) => ({ id: item.record.id, kind: item.collection, title: item.record.title })), ...documents.map((document) => ({ id: document.id, kind: "document", title: document.title }))]}
        rowId={(row) => row.id} label="Everything this portal can reach" filterable={false}
        columns={[
          { key: "kind", header: "Kind", primary: true, cell: (row) => <Pill>{row.kind}</Pill> },
          { key: "title", header: "Record", cell: (row) => row.title },
        ]}
        empty={<Empty title="This portal can reach nothing" />} />
      <Notice tone="success" title="Nothing else is reachable">
        No aggregate across clients is rendered anywhere in a portal. A total that mixed clients would leak one client's volume to another, so every figure a portal shows is computed from this list alone.
      </Notice>
    </Stack>
  );
}

export function AccountRecovery({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const { now } = useWorkspace();
  const body = bodyOf<PortalBody>(portal, {});
  const [userId, setUserId] = useState((body.users ?? [])[0]?.id ?? "");
  const [action, setAction] = useState("extend");
  if (!portal) return <Empty title="No portal" />;
  const user = (body.users ?? []).find((item) => item.id === userId);
  return (
    <form
      id="account-recovery"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!user) return;
        const users = (body.users ?? []).flatMap((item) => {
          if (item.id !== user.id) return [item];
          if (action === "revoke") return [];
          return [{ ...item, expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString() }];
        });
        await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, externalUsers: users.length },
          body: {
            ...body,
            users,
            activity: [{ at: now.toISOString(), actor: context.actor, detail: `${action === "revoke" ? "Revoked" : "Extended"} access for ${user.email}.` }, ...(body.activity ?? [])],
          },
        }, { expectRevision: portal.revision, event: `${action === "revoke" ? "Revoked" : "Extended"} portal access for ${user.email}` });
        context.toast(action === "revoke" ? "Access revoked" : "Access extended", action === "revoke" ? "Their links stop resolving immediately." : "They have another thirty days.");
        close();
      }}
    >
      <Field label="Person">
        <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
          {(body.users ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
        </Select>
      </Field>
      {user && (
        <Properties rows={[
          { label: "Role", value: user.role.replace("_", " ") },
          { label: "Last seen", value: user.lastSeenAt ? <span className="ds-num">{context.date(user.lastSeenAt)}</span> : "Never signed in" },
          { label: "Expires", value: <span className="ds-num">{context.date(user.expiresAt)}</span> },
        ]} />
      )}
      <Field label="Action">
        <Select value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="extend">Extend access by thirty days</option>
          <option value="revoke">Revoke access now</option>
        </Select>
      </Field>
      <Notice tone="warning" title="There is no password to reset">
        Sign-in needs an identity provider, which is not connected. What can be changed here is whether this person is on the portal's list and when that lapses.
      </Notice>
    </form>
  );
}
