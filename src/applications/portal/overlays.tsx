import { useState } from "react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, FactGrid, Notice, OverlayActions, OverlaySection, OverlaySummary, Pill, Properties, Row,
  Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import { ProviderBoundary } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  bodyOf, expiryState, GATE_LABELS, listedPortals, portalDocuments, portalUsers, resolvePortal, sharedRecords, sharedWithPortal, statusTone,
  usePortalData, type PortalBody,
} from "./data";
import { InvoiceTotalsCard, usePortal } from "./panels";
import { ReportPayment } from "./actions";
import { clockIso, wallMs } from "@/platform/clock";
import { acceptedRequestTypes, REQUEST_TYPES } from "./config";

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
        const saved1 = await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, accent, customDomain: domain.trim(), domainVerified: false },
        }, { expectRevision: portal.revision, event: `Branding changed on ${portal.title}` });
        if (!saved1) return;
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
  const asked = useRecord(payload?.id ?? context.selectedId);
  const portal = (asked ? resolvePortal(asked.id, data.portals) : undefined) ?? listedPortals(data.portals)[0];
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
        const saved2 = await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, linkExpiryDays: Number(expiry) || 30, inheritsInternalAccess: false },
        }, { expectRevision: portal.revision, event: `Access settings changed on ${portal.title}` });
        if (!saved2) return;
        context.toast("Access saved", `Links on ${portal.title} expire after ${expiry} days.`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Portal", value: portal.title },
        { label: "External users", value: <span className="ds-num">{String(portalUsers(portal).length)}</span> },
        { label: "Records shared", value: <span className="ds-num">{String(sharedWithPortal(portal, data).length)}</span> },
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
        const saved3 = await context.mutate.patch(portal.id, {
          body: { ...body, shared, activity: [{ at: clockIso(), actor: context.actor, detail: `Shared ${chosen?.title} with the portal.` }, ...(body.activity ?? [])] },
        }, { expectRevision: portal.revision, event: `${chosen?.title} shared with ${portal.title}` });
        if (!saved3) return;
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

interface PublishCheck { id: string; label: string; ok: boolean; blocking: boolean; detail: string }

/** What must be true before a portal reads as live; blocking checks disable the action. */
function usePublishChecks(portal: Rec | undefined): PublishCheck[] {
  const data = usePortalData();
  const { now } = useWorkspace();
  if (!portal) return [];
  const body = bodyOf<PortalBody>(portal, {});
  const pages = body.pages ?? [];
  const users = body.users ?? [];
  const shared = sharedWithPortal(portal, data);
  const expiredLinks = portalDocuments(portal, data.documents).filter((document) => expiryState(document.fields.linkExpiresAt, now).expired);
  const lapsed = users.filter((user) => expiryState(user.expiresAt, now).expired);
  const unplaced = sharedRecords(portal, data).filter((entry) => !["orders", "invoices", "bookings", "documents"].includes(entry.collection));
  return [
    { id: "pages", label: "Pages", ok: pages.length > 0, blocking: true, detail: pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"} defined` : "No pages: the portal has nothing to open." },
    { id: "shared", label: "Shared records", ok: shared.length > 0, blocking: true, detail: shared.length ? `${shared.length} named, nothing inherited` : "Nothing is shared, so the portal would be empty." },
    { id: "users", label: "External users", ok: users.length > 0, blocking: true, detail: users.length ? `${users.length} can sign in` : "Nobody is invited, so nobody can sign in." },
    { id: "inherit", label: "Internal access", ok: portal.fields.inheritsInternalAccess !== true, blocking: true, detail: portal.fields.inheritsInternalAccess === true ? "The portal inherits internal permissions. Turn that off in Access." : "Nothing inherited from the workspace." },
    { id: "lapsed", label: "Access dates", ok: lapsed.length === 0, blocking: false, detail: lapsed.length ? `${lapsed.map((user) => user.name).join(", ")} ${lapsed.length === 1 ? "has" : "have"} expired access.` : "Every user's access is current." },
    { id: "links", label: "Document links", ok: expiredLinks.length === 0, blocking: false, detail: expiredLinks.length ? `${expiredLinks.length} shared ${expiredLinks.length === 1 ? "link has" : "links have"} expired and will not open.` : "No shared link has expired." },
    { id: "unplaced", label: "Placement", ok: unplaced.length === 0, blocking: false, detail: unplaced.length ? `${unplaced.length} named ${unplaced.length === 1 ? "record is" : "records are"} on no page, so the client will not see ${unplaced.length === 1 ? "it" : "them"}.` : "Every named record sits on a page." },
  ];
}

export function PublishSummary({ context }: { context: ScreenContext }) {
  const { portal } = usePortal(context);
  if (!portal) return null;
  return <OverlaySummary eyebrow="Publish review" title={portal.title} status={<Pill tone={statusTone(portal.status)} dot>{portal.status}</Pill>} meta={[String(portal.fields.audience ?? "")]} />;
}

export function PublishReview({ context }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const checks = usePublishChecks(portal);
  if (!portal) return <Empty title="No portal" />;
  const blockers = checks.filter((check) => check.blocking && !check.ok);
  return (
    <Stack gap={4}>
      <OverlaySection title="Before it reads as live" tone={blockers.length ? "danger" : "success"}>
        <ul className="ds-stack ds-gap-2" aria-label="Publish checks">
          {checks.map((check) => (
            <li key={check.id}>
              <Row gap={2} wrap>
                <Pill tone={check.ok ? "success" : check.blocking ? "danger" : "warning"} dot>{check.ok ? "Ready" : check.blocking ? "Blocks" : "Check"}</Pill>
                <strong>{check.label}</strong>
                <span className="ds-subtle">{check.detail}</span>
              </Row>
            </li>
          ))}
        </ul>
      </OverlaySection>
      <ProviderBoundary id="site.publish" title="A portal is not hosted from here" />
    </Stack>
  );
}

export function PublishFooter({ context, close }: { context: ScreenContext; close: () => void }) {
  const { portal } = usePortal(context);
  const checks = usePublishChecks(portal);
  const blocked = checks.some((check) => check.blocking && !check.ok);
  if (!portal) return <OverlayActions end={<Button variant="ghost" onClick={close}>Close</Button>} />;
  return (
    <OverlayActions
      primary={
        <Button
          variant="primary"
          disabled={blocked || portal.status === "live"}
          title={blocked ? "Fix the blocking checks first" : undefined}
          onClick={async () => {
            const saved4 = await context.mutate.patch(portal.id, {
              status: "live",
              fields: { ...portal.fields, publishedAt: clockIso() },
            }, { expectRevision: portal.revision, event: `${portal.title} marked live` });
            if (!saved4) return;
            context.toast("Marked live", "The portal reads as live in this workspace. Reaching it from outside needs hosting.");
            close();
          }}
        >
          {portal.status === "live" ? "Already live" : "Mark the portal live"}
        </Button>
      }
      end={<Button variant="ghost" onClick={close}>Close</Button>}
    />
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
          at: clockIso(),
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
  const accepted = acceptedRequestTypes(portal);
  const [type, setType] = useState("");
  if (!portal) return <Empty title="No portal" />;
  const chosenType = accepted.includes(type) ? type : accepted[0] ?? "";
  if (accepted.length === 0) {
    return (
      <form id="access-request" className="ds-stack ds-gap-4" onSubmit={(event) => event.preventDefault()}>
        <Notice tone="warning" title="This portal does not take requests">
          The studio has switched the request form off for this portal. Use the message thread instead.
        </Notice>
      </form>
    );
  }
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
          at: clockIso(),
          parentId: portal.id,
          tags: ["portal", "request", chosenType],
          fields: { portalId: portal.id, direction: "in", kind: "request", requestType: chosenType, author: actor, delivery: "not_connected", attachments: 0, internalOnly: false },
          body: { text: what.trim() },
        }, `Access request recorded on ${portal.title}`);
        context.toast("Request recorded", "The studio decides what to share. Asking never grants anything by itself.");
        close();
      }}
    >
      <Notice tone="info" title="A request is a message, not a switch">
        Nothing here changes what this portal can see. The studio reads the request and grants a specific record if they agree.
      </Notice>
      <Field label="Type of request">
        <Select value={chosenType} onChange={(event) => setType(event.target.value)}>
          {accepted.map((value) => <option key={value} value={value}>{REQUEST_TYPES.find((item) => item.value === value)?.label ?? value}</option>)}
        </Select>
      </Field>
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
        const saved5 = await context.mutate.patch(document.id, {
          status: "signed",
          fields: { ...document.fields, signature: "signed_local", signedBy: actor, signedAt: now.toISOString() },
        }, { expectRevision: document.revision, event: `${document.title} accepted by ${actor}` });
        if (!saved5) return;
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
          at: clockIso(),
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
          at: clockIso(),
          parentId: portal.id,
          tags: ["portal", isRequest ? "request" : "complaint"],
          fields: { portalId: portal.id, direction: "in", kind: isRequest ? "request" : "complaint", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false, invoiceId: invoice?.id ?? "" },
          body: { text: reason.trim() },
        }, `${isRequest ? "Request" : "Dispute"} recorded on ${portal.title}`);
        if (invoice && !isRequest) {
          const saved6 = await context.mutate.patch(invoice.id, { status: "disputed", fields: { ...invoice.fields, payment: "disputed" } }, { expectRevision: invoice.revision, event: `${invoice.title} disputed by ${actor}` });
          if (!saved6) return;
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
        const saved7 = await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, invitesPending: Number(portal.fields.invitesPending ?? 0) + 1, externalUsers: (body.users ?? []).length + 1 },
          body: {
            ...body,
            users: [...(body.users ?? []), { id: `u-${wallMs()}`, name: name.trim(), email: email.trim(), role: portalRole, lastSeenAt: "", expiresAt: expires }],
            activity: [{ at: now.toISOString(), actor: context.actor, detail: `Invited ${email.trim()} as ${portalRole.replace("_", " ")}.` }, ...(body.activity ?? [])],
          },
        }, { expectRevision: portal.revision, event: `${email.trim()} invited to ${portal.title}` });
        if (!saved7) return;
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
            <option value="billing_contact">Billing contact — also sees billing pages</option>
            <option value="portal_admin">Administrator — sees every page, including admin-only</option>
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

const KIND_LABEL: Record<string, string> = { purchaseOrders: "purchase order", orders: "order", invoices: "invoice", bookings: "booking", documents: "document", returns: "return" };
/** The page module that renders each record kind; a kind with no module is named but never drawn. */
const KIND_MODULE: Record<string, string> = { orders: "orders", invoices: "invoices", bookings: "bookings", documents: "documents" };

function gateAllows(gate: string, role: string): boolean {
  if (gate === "admin_only") return role === "portal_admin";
  if (gate === "billing_contact") return role === "portal_admin" || role === "billing_contact";
  return true;
}

/** Overlay head for the scope preview: which portal, in what state, for whom. */
export function ScopeSummary({ context }: { context: ScreenContext }) {
  const { portal } = usePortal(context);
  if (!portal) return null;
  const users = portalUsers(portal);
  return (
    <OverlaySummary
      eyebrow="Scope preview"
      title={portal.title}
      status={<Pill tone={statusTone(portal.status)} dot>{portal.status}</Pill>}
      meta={[String(portal.fields.audience ?? ""), `${users.length} external ${users.length === 1 ? "user" : "users"}`, `links last ${String(portal.fields.linkExpiryDays ?? 0)} days`]}
    />
  );
}

/**
 * What one external user would see, record by record, and until when. Every
 * row is a record the portal names; a record is hidden from this person when
 * the page that renders it is gated above their role, when no page renders
 * it, or when their access or the document link has expired.
 */
export function ScopePreview({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { now } = useWorkspace();
  const { portal } = usePortal(context);
  const users = portalUsers(portal);
  const [userId, setUserId] = useState((context.overlayPayload as { userId?: string } | undefined)?.userId ?? "");
  if (!portal) return <Empty title="No portal" />;
  const user = users.find((item) => item.id === userId) ?? users[0];
  const body = bodyOf<PortalBody>(portal, {});
  const pages = body.pages ?? [];
  const reach = sharedWithPortal(portal, data);
  const accessEnds = user ? expiryState(user.expiresAt, now) : { expired: false, days: 0, known: false };
  const everything = data.orders.length + data.invoices.length + data.bookings.length + data.documents.length
    + data.purchaseOrders.length + data.returns.length;
  const rows = reach.map((record) => {
    const module = KIND_MODULE[record.collection];
    const page = module ? pages.find((candidate) => candidate.modules.includes(module)) : undefined;
    const link = expiryState(record.fields.linkExpiresAt, now);
    let verdict: { tone: "success" | "warning" | "danger" | "neutral"; text: string };
    if (!user) verdict = { tone: "neutral", text: "No external user yet" };
    else if (accessEnds.expired) verdict = { tone: "danger", text: "Their access has expired" };
    else if (!module) verdict = { tone: "warning", text: "No page renders it" };
    else if (!page) verdict = { tone: "warning", text: "No page renders it" };
    else if (!gateAllows(page.gate, user.role)) verdict = { tone: "warning", text: `Hidden: ${GATE_LABELS[page.gate] ?? page.gate}` };
    else if (link.known && link.expired) verdict = { tone: "danger", text: "Link expired" };
    else verdict = { tone: "success", text: `Seen on ${page.name}` };
    const until = link.known ? record.fields.linkExpiresAt : user?.expiresAt;
    return { id: record.id, kind: KIND_LABEL[record.collection] ?? record.collection, title: record.title, status: record.status, until: typeof until === "string" ? until : "", verdict };
  });
  const seen = rows.filter((row) => row.verdict.tone === "success").length;
  return (
    <Stack gap={4}>
      {users.length > 0 ? (
        <Field label="Preview as">
          <Select value={user?.id ?? ""} onChange={(event) => setUserId(event.target.value)}>
            {users.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role.replace("_", " ")}</option>)}
          </Select>
        </Field>
      ) : (
        <Notice tone="warning" title="Nobody can sign in yet">No external user is invited, so this portal shows nothing to anyone.</Notice>
      )}
      {user && (
        <FactGrid columns={3} items={[
          { label: "Sees", value: accessEnds.expired ? "0 records" : `${seen} of ${rows.length} named`, mono: true, tone: accessEnds.expired ? "danger" : undefined },
          { label: "Access until", value: accessEnds.known ? context.date(user.expiresAt) : "No expiry set", mono: true, tone: accessEnds.expired ? "danger" : accessEnds.known && accessEnds.days < 7 ? "warning" : undefined, hint: accessEnds.expired ? "Expired" : accessEnds.known ? `${accessEnds.days} days left` : undefined },
          { label: "Last seen", value: user.lastSeenAt ? context.date(user.lastSeenAt) : "Never", mono: true },
        ]} />
      )}
      <OverlaySection title="Record by record" hint="Only records this portal names. Nothing is inherited from the workspace.">
        <DataGrid rows={rows}
          rowId={(row) => row.id} label="Records this portal names" filterable={false}
          columns={[
            { key: "kind", header: "Kind", cell: (row) => <Pill>{row.kind}</Pill> },
            { key: "title", header: "Record", primary: true, cell: (row) => row.title },
            { key: "verdict", header: "For this person", cell: (row) => <Pill tone={row.verdict.tone} dot>{row.verdict.text}</Pill> },
            { key: "until", header: "Until", align: "end", cell: (row) => <span className="ds-num">{row.until ? context.date(row.until) : "Access ends"}</span> },
          ]}
          empty={<Empty title="This portal can reach nothing" />} />
      </OverlaySection>
      <OverlaySection title="Not reachable" tone="success">
        <FactGrid columns={3} dense items={[
          { label: "Workspace records", value: String(everything), mono: true },
          { label: "Named by this portal", value: String(reach.length), mono: true },
          { label: "Other portals' records", value: String(Math.max(0, everything - reach.length)), mono: true, hint: "Not reachable" },
        ]} />
        <p className="ds-subtle">No total across clients is drawn anywhere in a portal: every figure comes from the records above.</p>
      </OverlaySection>
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
        const saved8 = await context.mutate.patch(portal.id, {
          fields: { ...portal.fields, externalUsers: users.length },
          body: {
            ...body,
            users,
            activity: [{ at: now.toISOString(), actor: context.actor, detail: `${action === "revoke" ? "Revoked" : "Extended"} access for ${user.email}.` }, ...(body.activity ?? [])],
          },
        }, { expectRevision: portal.revision, event: `${action === "revoke" ? "Revoked" : "Extended"} portal access for ${user.email}` });
        if (!saved8) return;
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
