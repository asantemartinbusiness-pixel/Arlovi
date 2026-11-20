import { useState, type ReactNode } from "react";
import {
  BarChart, Button, Card, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row,
  Select, Stack, Stat, StatRow, TextArea,
} from "@/design-system";
import { FileText, LifeBuoy, MessageSquare, ShieldCheck, Users } from "lucide-react";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clockIso, freshness } from "@/platform/clock";
import { computeInvoice } from "@/platform/money";
import { openInvoices, outstandingMinor } from "@/applications/fin/data";
import { ProviderBoundary, TotalsBlock } from "@/applications/market/kit";
import type { Rec } from "@/domain/types";
import {
  bodyOf, expiryState, GATE_LABELS, MODULE_LABELS, portalDocuments, portalForRole,
  listedPortals, portalMessages, portalUsers, portalVisibleInvoices, resolvePortal, sharedRecords, sharedWithPortal, statusTone, usePortalData, type PortalBody,
} from "./data";
import { BrandEditor, BrandMark, brandOf, ExposureEditor, NavigationEditor, RequestTypesEditor, RolePreview, RolesEditor, SharingStateCard } from "./configure";

/* ====================================================================== *
 * PORTAL panels — branded external spaces. A portal grants nothing by
 * default, and the client role view only ever reads portal content.
 * ====================================================================== */

/** The portal a screen is about, honouring the client role restriction. */
export function usePortal(context: ScreenContext): { portal: Rec | undefined; locked: boolean } {
  const data = usePortalData();
  const { role, actor } = useWorkspace();
  const fromRoute = resolvePortal(context.params.id, data.portals);
  if (role === "client") {
    const mine = portalForRole(role, data.portals, actor, data.contacts);
    return { portal: mine, locked: true };
  }
  // A named portal route must never silently substitute the first portal when
  // its record is absent. Only the directory itself may choose a default.
  return { portal: context.params.id ? fromRoute : listedPortals(data.portals)[0], locked: false };
}

export function ClientOnlyNotice({ context }: { context: ScreenContext }) {
  const { actor, org, role } = useWorkspace();
  const data = usePortalData();
  const portal = portalForRole(role, data.portals, actor, data.contacts);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="This view only opens portal content">
        {actor} is viewing the browser-local client perspective. Portal administration,
        the builder and the access log belong to {org.shortName}. This does not authenticate
        anyone or grant access to a hosted client portal. Role views are not an account security boundary.
      </Notice>
      {portal ? (
        <Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/portal/portals/${portal.id}/dashboard`)}>
          Open matching portal
        </Button>
      ) : (
        <Notice tone="info" title="No matching client portal">
          This local view has no matching client contact, so no other client&apos;s portal is substituted.
        </Notice>
      )}
    </Stack>
  );
}

/* ---------------------------- PORTAL-001 ---------------------------- */

export function PortalDirectory({ context, audience }: { context: ScreenContext; audience: string }) {
  const data = usePortalData();
  const { now, org, role } = useWorkspace();
  if (role === "client") return <ClientOnlyNotice context={context} />;

  const wanted = audience.toLowerCase().replace(/s$/, "");
  const rows = listedPortals(data.portals).filter((portal) => String(portal.fields.audience ?? "") === wanted);

  if (rows.length === 0) {
    return <Empty title={`No ${audience.toLowerCase()} portals`} icon={<LifeBuoy size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Portal wizard")}>Create a portal</Button>}>
      A portal is a scoped space for one account. It starts with nothing shared.
    </Empty>;
  }

  return (
    <Grid>
      {rows.map((portal) => {
        const visit = freshness(String(portal.fields.lastVisitAt ?? ""), now, 14);
        return (
          <Card
            key={portal.id}
            span={4}
            eyebrow={String(portal.fields.audience ?? "").toUpperCase()}
            prov="human"
            title={portal.title}
            subtitle={portal.summary}
            actions={<Pill tone={statusTone(portal.status)} dot>{portal.status}</Pill>}
            footer={<>
              <Button size="sm" variant={context.selectedId === portal.id ? "primary" : "secondary"} aria-pressed={context.selectedId === portal.id} onClick={() => context.select(context.selectedId === portal.id ? undefined : portal.id)}>{context.selectedId === portal.id ? "Selected" : "Select"}</Button>
              <Button size="sm" variant="ghost" aria-label={`Open internal preview for ${portal.title}`} onClick={() => context.navigate(`/o/${org.slug}/portal/portals/${portal.id}/dashboard`)}>Preview</Button>
              <Button size="sm" variant="ghost" aria-label={`Edit portal ${portal.title}`} onClick={() => context.navigate(`/o/${org.slug}/portal/portals/${portal.id}/builder`)}>Builder</Button>
              <Button size="sm" variant="ghost" aria-label={`Manage access for ${portal.title}`} onClick={() => { context.select(portal.id); context.openOverlay("access setup", { id: portal.id }); }}>Access</Button>
            </>}
          >
            <Stack gap={3}>
              <Row gap={2}>
                <span className="t4-portal-mark" style={{ background: String(portal.fields.accent ?? "var(--accent)") }}>{portal.title.slice(0, 2).toUpperCase()}</span>
                <div className="ds-grow">
                  <span className="ds-subtle">{String(portal.fields.customDomain) || "No custom domain"}</span>
                </div>
              </Row>
              <Properties rows={[
                { label: "External users", value: <span className="ds-num">{String(portalUsers(portal).length)}</span> },
                { label: "Records shared", value: <span className="ds-num">{String(sharedWithPortal(portal, data).length)}</span> },
                { label: "Visits, 90 days", value: <span className="ds-num">{String(portal.fields.visits90d ?? 0)}</span> },
                { label: "Last visit", value: visit.known ? context.relative(String(portal.fields.lastVisitAt)) : "Never opened" },
                { label: "Inherits internal access", value: portal.fields.inheritsInternalAccess === true ? <Pill tone="danger">Yes</Pill> : <Pill tone="success">No</Pill> },
              ]} />
              {portal.status === "suspended" && <Notice tone="danger" title="Suspended">This local portal is marked suspended. External access is not connected.</Notice>}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- PORTAL-002 ---------------------------- */

export function PortalBuilder({ context, lens }: { context: ScreenContext; lens: string }) {
  const { role } = useWorkspace();
  const { portal } = usePortal(context);
  if (role === "client") return <ClientOnlyNotice context={context} />;
  if (!portal) return <Empty title="No portal" />;
  const body = bodyOf<PortalBody>(portal, {});
  const pages = body.pages ?? [];

  if (lens === "Design") {
    return (
      <Stack gap={4}>
        <BrandEditor context={context} portal={portal} />
        <Grid>
        <Card span={6} eyebrow="ACCESSIBILITY" prov="human" title="What the layout commits to">
          <Properties rows={[
            { label: "Navigation", value: "Real links, reachable in order by keyboard" },
            { label: "Contrast", value: "Brand accent is used behind white text only where it passes" },
            { label: "Width", value: "Single column below 600px, no horizontal scroll" },
            { label: "Labels", value: "Every control has a visible label" },
          ]} />
        </Card>
        <Card span={6} eyebrow="CUSTOM DOMAIN" prov="human" title="A custom domain needs DNS and a certificate">
          <p className="ds-subtle">Neither can be arranged from a browser. The domain is recorded so it is ready, and the portal is reached through the workspace until it is set up.</p>
        </Card>
        </Grid>
      </Stack>
    );
  }

  if (lens === "Data") {
    return (
      <Stack gap={4}>
        <Notice tone="success" title="A portal starts with nothing shared">
          Records appear only when their id is added to this portal. There is no rule that shares a whole collection, so a new portal cannot inherit another client's records.
        </Notice>
        <ExposureEditor context={context} portal={portal} />
        <RequestTypesEditor context={context} portal={portal} />
        <Card eyebrow="IDENTIFIERS" prov="human" title="What the client never sees">
          <Notice tone="info">
            A portal page refers to a shared record by its title and its own reference, never by the internal record id. Nothing in the portal exposes an id that could be changed to reach another client's record.
          </Notice>
        </Card>
      </Stack>
    );
  }

  if (lens === "Access") {
    return (
      <Stack gap={4}>
        <DataGrid rows={pages} rowId={(row) => row.id} label="Page access" filterable={false}
          columns={[
            { key: "name", header: "Page", primary: true, cell: (row) => row.name },
            { key: "modules", header: "Modules", cell: (row) => row.modules.map((module) => MODULE_LABELS[module] ?? module).join(", ") },
            { key: "gate", header: "Who can open it", cell: (row) => <Pill tone={row.gate === "any_member" ? "neutral" : "warning"}>{GATE_LABELS[row.gate] ?? row.gate}</Pill> },
          ]} />
        <RolesEditor context={context} portal={portal} />
      </Stack>
    );
  }

  if (lens === "Preview") {
    return <RolePreview key={portal.id} portal={portal} />;
  }

  return (
    <Stack gap={4}>
      <DataGrid rows={pages} rowId={(row) => row.id} label="Portal pages" filterable={false}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Module picker", { pageId: id })}
        columns={[
          { key: "name", header: "Page", primary: true, cell: (row) => row.name },
          { key: "modules", header: "Modules", cell: (row) => <Row gap={1} wrap>{row.modules.map((module) => <Pill key={module}>{MODULE_LABELS[module] ?? module}</Pill>)}</Row> },
          { key: "gate", header: "Gate", cell: (row) => GATE_LABELS[row.gate] ?? row.gate },
        ]}
        empty={<Empty title="No pages" >Add a page from the module picker.</Empty>} />
      <Grid>
        <div className="ds-col-7"><NavigationEditor context={context} portal={portal} /></div>
        <div className="ds-col-5"><SharingStateCard context={context} portal={portal} /></div>
      </Grid>
      <ProviderBoundary id="site.publish" title="The portal is not hosted" />
    </Stack>
  );
}

/* ---------------------------- Portal shell ---------------------------- */

export function PortalShell({ portal, active, children }: { portal: Rec; active: string; children?: ReactNode }) {
  const data = usePortalData();
  const { org } = useWorkspace();
  const body = bodyOf<PortalBody>(portal, {});
  const pages = body.pages ?? [];
  const shared = sharedRecords(portal, data);
  const brand = brandOf(portal);
  return (
    <div className="t4-portal">
      <div className="t4-portal-top">
        <BrandMark portal={portal} />
        <div className="ds-grow">
          <strong>{brand.displayName}</strong>
          <p className="ds-subtle">{org.name} client portal</p>
        </div>
        <Pill tone="warning">Preview</Pill>
      </div>
      <div className="t4-portal-nav" style={{ padding: "var(--space-2) var(--space-4)" }}>
        {pages.map((page) => (
          <Pill key={page.id} tone={page.name === active ? "accent" : "neutral"}>{page.name}</Pill>
        ))}
      </div>
      <div className="t4-portal-body">
        {children ?? (
          <>
            <Card eyebrow="WELCOME" prov="human" title={`Hello, ${brand.displayName}`} subtitle={brand.welcome || "Everything your project shares with you, in one place."}>
              <Properties rows={[
                { label: "Records shared with you", value: <span className="ds-num">{String(sharedWithPortal(portal, data).length)}</span> },
                { label: "Open requests", value: <span className="ds-num">{String(portalMessages(portal, data.messages).filter((message) => message.status === "open").length)}</span> },
                { label: "Invoices", value: <span className="ds-num">{String(portalVisibleInvoices(portal, data).length)}</span> },
              ]} />
            </Card>
            {shared.slice(0, 3).map((item) => (
              <Card key={item.record.id} eyebrow={item.collection.toUpperCase()} prov="human" title={item.record.title} subtitle={item.record.summary}
                actions={<Pill tone={statusTone(item.record.status)}>{item.record.status.replace("_", " ")}</Pill>} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- PORTAL-003 ---------------------------- */

export function ExternalDashboard({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = usePortalData();
  const { org, now } = useWorkspace();
  const { portal, locked } = usePortal(context);
  if (!portal) return <Empty title="No portal is shared with this view" icon={<LifeBuoy size={20} />} />;
  const shared = sharedRecords(portal, data);
  const documents = portalDocuments(portal, data.documents);
  const messages = portalMessages(portal, data.messages);
  const invoices = portalVisibleInvoices(portal, data);
  const openInvoiceRows = openInvoices(invoices);
  const outstanding = openInvoiceRows.reduce((total, invoice) => total + outstandingMinor(invoice), 0);

  if (lens === "Work") {
    const work = shared.filter((item) => ["orders", "bookings", "purchaseOrders"].includes(item.collection));
    return work.length === 0
      ? <Empty title="Nothing is shared with you yet" icon={<FileText size={20} />} />
      : (
        <Stack gap={4}>
          <DataGrid rows={work} rowId={(row) => row.record.id} label="Shared work" filterable={false}
            selectedId={context.selectedId} onSelect={(id) => context.select(id)}
            columns={[
              { key: "kind", header: "Kind", primary: true, cell: (row) => <Pill>{row.collection === "purchaseOrders" ? "purchase order" : row.collection.replace(/s$/, "")}</Pill> },
              { key: "title", header: "Reference", cell: (row) => <span className="ds-num">{row.record.title}</span> },
              { key: "summary", header: "Detail", cell: (row) => row.record.summary },
              { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.record.status)} dot>{row.record.status.replace("_", " ")}</Pill> },
              { key: "value", header: "Value", align: "end", cell: (row) => (row.record.amountMinor === undefined ? <span className="ds-subtle">—</span> : <span className="ds-num">{context.money(row.record.amountMinor)}</span>) },
            ]} />
          <Notice tone="info" title="You see these because they were shared with this portal">
            Nothing else from {org.name} is reachable from here, including work for their other clients.
          </Notice>
        </Stack>
      );
  }

  if (lens === "Files") {
    return <SharedDocuments context={context} state="Shared" />;
  }

  if (lens === "Messages") {
    return <ExternalMessaging context={context} lens="Inbox" />;
  }

  if (lens === "Billing") {
    return <PortalBilling context={context} lens="Invoices" />;
  }

  const milestones = shared.filter((item) => item.collection === "bookings");
  return (
    <Stack gap={4}>
      {locked && (
        <Notice tone="info" title="You are seeing only your own portal">
          This view opens the space shared with you. It cannot reach anything else in the workspace, and no record from another client is loaded.
        </Notice>
      )}
      <StatRow>
        <Stat label="Shared with you" value={String(sharedWithPortal(portal, data).length)} prov="human" meta="Records this portal names" />
        <Stat label="Needs your review" value={String(documents.filter((document) => document.status === "needs_review").length)} prov="human" meta="Documents awaiting sign-off" />
        <Stat label="Open requests" value={String(messages.filter((message) => message.status === "open").length)} prov="human" meta="Waiting on the studio" />
        <Stat label="Outstanding invoices" value={context.money(outstanding)} prov="posted" meta={`${openInvoiceRows.length} unpaid or part paid`} />
      </StatRow>

      <Grid>
        <Card span={7} eyebrow="NEXT ACTIONS" prov="human" title="What needs you" subtitle="Derived from the records shared with this portal">
          <Stack gap={2}>
            {documents.filter((document) => document.status === "needs_review").map((document) => (
              <Row key={document.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow"><strong>{document.title}</strong><p className="ds-subtle">Awaiting your review</p></div>
                <Button size="sm" variant="secondary" onClick={() => { context.select(document.id); context.openOverlay("Shared item inspector", { id: document.id }); }}>Open</Button>
              </Row>
            ))}
            {openInvoiceRows.map((invoice) => (
              <Row key={invoice.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow"><strong className="ds-num">{invoice.title}</strong><p className="ds-subtle">Due {context.date(invoice.dueAt)}</p></div>
                <strong className="ds-num">{context.money(outstandingMinor(invoice))}</strong>
              </Row>
            ))}
            {documents.filter((document) => document.status === "needs_review").length === 0 && openInvoiceRows.length === 0 && (
              <span className="ds-subtle">Nothing is waiting on you.</span>
            )}
          </Stack>
        </Card>
        <Card span={5} eyebrow="MILESTONES" prov="human" title="Dates in the diary" subtitle={`${milestones.length} appointments shared`}>
          <Stack gap={2}>
            {milestones.map((item) => (
              <Row key={item.record.id} gap={2}>
                <span className="ds-grow ds-truncate">{item.record.title}</span>
                <span className="ds-num">{context.date(item.record.startAt)}</span>
              </Row>
            ))}
            {milestones.length === 0 && <span className="ds-subtle">No appointments are shared.</span>}
          </Stack>
        </Card>
        <Card span={12} eyebrow="REDACTION" prov="human" title="What this portal does not show">
          <Notice tone="info">
            Internal notes, margins, other clients and the studio's own records are not loaded by this page at all. The dashboard reads the {shared.length} records this portal names and the documents attached to it, and nothing else.
            {freshness(String(portal.fields.lastVisitAt ?? ""), now, 30).known ? "" : ""}
          </Notice>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- PORTAL-004 ---------------------------- */

export function SharedDocuments({ context, state }: { context: ScreenContext; state: string }) {
  const data = usePortalData();
  const { now } = useWorkspace();
  const { portal } = usePortal(context);
  if (!portal) return <Empty title="No portal" />;
  const all = portalDocuments(portal, data.documents);
  const map: Record<string, string[]> = { Shared: ["shared"], "Needs review": ["needs_review"], Signed: ["signed"], Archive: ["archived"] };
  const rows = all.filter((document) => (map[state] ?? ["shared"]).includes(document.status));

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} documents`} icon={<FileText size={20} />}>Documents appear here when the studio shares them with this portal.</Empty>;
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${state} documents`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Document preview", { id })}
        rowTone={(row) => (expiryState(row.fields.linkExpiresAt, now).expired ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Document", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "kind", header: "Kind", cell: (row) => <Pill>{String(row.fields.kind ?? "file")}</Pill> },
          { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)}</span> },
          { key: "size", header: "Size", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.sizeLabel ?? "—")}</span>, hideBelow: 1000 },
          { key: "shared", header: "Shared", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "signature", header: "Signature", cell: (row) => {
            const signature = String(row.fields.signature ?? "none");
            return signature === "none" ? <span className="ds-subtle">Not required</span>
              : signature === "requested" ? <Pill tone="warning" dot>Requested</Pill>
                : <Pill tone="success">Accepted locally</Pill>;
          } },
          { key: "link", header: "Link", cell: (row) => {
            const expiry = expiryState(row.fields.linkExpiresAt, now);
            if (!expiry.known) return <span className="ds-subtle">No expiry</span>;
            return expiry.expired ? <Pill tone="danger" dot>Expired</Pill> : <Pill tone="success">{expiry.days} days left</Pill>;
          } },
        ]}
        summary={<span>{rows.length} of {all.length} documents shared with this portal</span>}
      />
      <Notice tone="warning" title="An expired or revoked link stops working immediately">
        The link state is checked when the document is opened, not when the list was built. A document in the archive, or past its expiry, cannot be downloaded even from a link someone kept.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- PORTAL-005 ---------------------------- */

export function ExternalMessaging({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const { actor, org } = useWorkspace();
  const [draft, setDraft] = useState("");
  if (!portal) return <Empty title="No portal" />;
  const all = portalMessages(portal, data.messages);
  const rows = lens === "Requests" ? all.filter((message) => String(message.fields.kind) !== "message")
    : lens === "History" ? all.filter((message) => message.status === "answered")
      : all;

  if (lens === "Requests") {
    return rows.length === 0
      ? <Empty title="No open requests" icon={<MessageSquare size={20} />} />
      : (
        <Stack gap={3}>
          {rows.map((message) => (
            <Card key={message.id} eyebrow={String(message.fields.kind ?? "request").toUpperCase()} prov="human" title={message.title} subtitle={context.dateTime(message.at)}
              actions={<Pill tone={statusTone(message.status)} dot>{message.status}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => { context.select(message.id); context.openOverlay("Conversation details", { id: message.id }); }}>Open</Button>
                {String(message.fields.kind) === "complaint" && (
                  <Button size="sm" variant="ghost" onClick={() => { context.select(message.id); context.openOverlay("complaint", { id: message.id }); }}>Escalation</Button>
                )}
              </>}>
              <p className="ds-prose">{message.summary}</p>
            </Card>
          ))}
        </Stack>
      );
  }

  return (
    <Stack gap={4}>
      <Card eyebrow="THREAD" prov="human" title={`${portal.title} and ${org.shortName}`} subtitle={`${rows.length} messages`} flush>
        <div className="ds-card-body">
          <ol className="t4-timeline">
            {rows.map((message) => (
              <li key={message.id}>
                <div>
                  <strong className="ds-num">{context.dateTime(message.at)}</strong>
                  <div className="ds-subtle">{String(message.fields.author ?? "")}</div>
                </div>
                <div className="ds-panel" style={{ padding: "var(--space-3)", borderColor: String(message.fields.direction) === "out" ? "var(--accent-border)" : undefined }}>
                  <Row gap={2}>
                    <Pill tone={String(message.fields.direction) === "out" ? "accent" : "neutral"}>{String(message.fields.direction) === "out" ? "Studio" : "Client"}</Pill>
                    {String(message.fields.kind) !== "message" && <Pill tone={String(message.fields.kind) === "complaint" ? "danger" : "warning"}>{String(message.fields.kind)}</Pill>}
                    {Number(message.fields.attachments ?? 0) > 0 && <span className="ds-subtle">{String(message.fields.attachments)} attachments</span>}
                  </Row>
                  <p style={{ marginBlockStart: 6 }}>{message.summary}</p>
                </div>
              </li>
            ))}
          </ol>
          {rows.length === 0 && <Empty title="No messages yet" icon={<MessageSquare size={20} />} />}
        </div>
      </Card>

      <Card eyebrow="REPLY" prov="human" title="Write a reply" subtitle="Recorded against the portal; no mail provider is connected">
        <form
          className="ds-stack ds-gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            await context.mutate.create({
              collection: "messages",
              title: `Message · ${actor}`,
              status: "answered",
              summary: draft.trim(),
              at: clockIso(),
              parentId: portal.id,
              tags: ["portal", "message"],
              fields: { portalId: portal.id, direction: "out", kind: "message", author: actor, delivery: "not_connected", attachments: 0, internalOnly: false },
              body: { text: draft.trim() },
            }, `Portal reply recorded for ${portal.title}`);
            context.toast("Reply recorded", "It is on the portal thread. No email was sent, because no mail provider is connected.");
            setDraft("");
          }}
        >
          <Field label="Message"><TextArea value={draft} rows={4} onChange={(event) => setDraft(event.target.value)} /></Field>
          <Row gap={2}>
            <Button type="submit" variant="primary" disabled={!draft.trim()}>Record reply</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("attachment preview")}>Attachments</Button>
          </Row>
        </form>
      </Card>

      <Notice tone="warning" title="An assistant here could only use what the portal shares">
        No model provider is connected, so nothing is generated. If one were, it would be given the {sharedRecords(portal, data).length} shared records and this thread only: internal project notes are not part of this portal and would not be available to answer from.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- PORTAL-006 ---------------------------- */

export function PortalBilling({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = usePortalData();
  const { org, now } = useWorkspace();
  const { portal } = usePortal(context);
  if (!portal) return <Empty title="No portal" />;
  const invoices = portalVisibleInvoices(portal, data);
  const openInvoiceRows = openInvoices(invoices);
  const outstanding = openInvoiceRows.reduce((total, invoice) => total + outstandingMinor(invoice), 0);
  const requests = portalMessages(portal, data.messages).filter((message) => String(message.fields.kind) === "request");

  if (lens === "Payments") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Paid" value={context.money(invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0))} prov="posted" meta="Marked paid in local invoice records; no bank feed is connected" />
          <Stat label="Outstanding" value={context.money(outstanding)} prov="posted" meta={`${openInvoiceRows.length} unpaid or part paid`} />
          <Stat label="Disputed" value={context.money(invoices.filter((invoice) => invoice.status === "disputed").reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0))} prov="posted" meta="Not pursued while open" />
          <Stat label="Pay online" value="Unavailable" unavailable meta="No payment provider is connected" />
        </StatRow>
        <ProviderBoundary id="payment.capture" title="There is no payment link to give you">
          A card payment has to reach a processor directly. Nothing here can take one, so each invoice shows how to pay the studio instead, and a payment is recorded against the invoice when it arrives.
        </ProviderBoundary>
      </Stack>
    );
  }

  if (lens === "Requests") {
    return (
      <Stack gap={4}>
        {requests.length === 0 ? <Empty title="No requests" icon={<MessageSquare size={20} />}>Ask for anything you need from the studio and it is recorded here.</Empty> : (
          <DataGrid rows={requests} rowId={(row) => row.id} label="Requests" filterable={false}
            onOpen={(id) => context.openOverlay("Conversation details", { id })}
            columns={[
              { key: "title", header: "Request", primary: true, cell: (row) => row.title },
              { key: "detail", header: "What was asked", cell: (row) => row.summary },
              { key: "at", header: "Raised", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
              { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status}</Pill> },
            ]} />
        )}
        <Button variant="primary" onClick={() => context.openOverlay("dispute form", { kind: "request" })}>Submit a request</Button>
      </Stack>
    );
  }

  if (lens === "History") {
    return (
      <DataGrid rows={invoices.filter((invoice) => invoice.status === "paid")} rowId={(row) => row.id} label="Paid invoices" filterable={false}
        onOpen={(id) => context.openOverlay("document receipt", { id })}
        columns={[
          { key: "title", header: "Invoice", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
          { key: "issued", header: "Issued", cell: (row) => <span className="ds-num">{context.date(row.at)}</span> },
          { key: "paid", header: "Settled", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span> },
          { key: "value", header: "Amount", align: "end", cell: (row) => <span className="ds-num">{context.money(row.amountMinor)}</span> },
        ]}
        empty={<Empty title="Nothing has been settled yet" />} />
    );
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={invoices}
        rowId={(row) => row.id}
        label="Invoices"
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("document receipt", { id })}
        rowTone={(row) => (row.status === "disputed" ? "danger" : row.dueAt && new Date(row.dueAt) < now && row.status !== "paid" ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Invoice", primary: true, cell: (row) => <span className="ds-num">{row.title}</span> },
          { key: "summary", header: "For", cell: (row) => row.summary },
          { key: "issued", header: "Issued", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
          { key: "due", header: "Due", cell: (row) => <span className="ds-num">{context.date(row.dueAt)}</span> },
          { key: "net", header: "Net", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.fields.netMinor ?? 0))}</span> },
          { key: "tax", header: "Tax", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.fields.taxMinor ?? 0))}</span> },
          { key: "total", header: "Total", align: "end", cell: (row) => <strong className="ds-num">{context.money(row.amountMinor)}</strong> },
          { key: "outstanding", header: "Outstanding", align: "end", cell: (row) => <strong className="ds-num">{context.money(outstandingMinor(row))}</strong> },
          { key: "state", header: "State", cell: (row) => <Pill tone={statusTone(row.status)} dot>{row.status.replace("_", " ")}</Pill> },
        ]}
        bulkActions={[
          { label: "Dispute", disabled: (selected) => selected.length !== 1 || selected[0].status === "paid", onRun: (selected) => context.openOverlay("dispute form", { id: selected[0].id }) },
        ]}
        summary={<span>Totals resolve through the {org.jurisdiction} tax rules for each line</span>}
      />
      <ProviderBoundary id="payment.capture" title="Paying online is not available" />
    </Stack>
  );
}

/* ---------------------------- PORTAL-007 ---------------------------- */

export function PortalAdmin({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = usePortalData();
  const { now, role } = useWorkspace();
  const { portal } = usePortal(context);
  if (role === "client") return <ClientOnlyNotice context={context} />;
  if (!portal) return <Empty title="No portal" />;
  const body = bodyOf<PortalBody>(portal, {});
  const users = body.users ?? [];
  const activity = body.activity ?? [];

  if (lens === "Access") {
    const pages = body.pages ?? [];
    return (
      <Stack gap={4}>
        <DataGrid rows={pages} rowId={(row) => row.id} label="Access by page" filterable={false}
          columns={[
            { key: "name", header: "Page", primary: true, cell: (row) => row.name },
            { key: "gate", header: "Who can open it", cell: (row) => <Pill tone={row.gate === "any_member" ? "neutral" : "warning"}>{GATE_LABELS[row.gate] ?? row.gate}</Pill> },
            { key: "modules", header: "Shows", cell: (row) => row.modules.map((module) => MODULE_LABELS[module] ?? module).join(", ") },
          ]} />
        <Card eyebrow="SCOPE" prov="human" title="What this portal can reach" subtitle="Everything else in the workspace is out of scope" actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("scope preview")}>Preview what they see</Button>}>
          <Properties rows={[
            { label: "Shared records", value: <span className="ds-num">{String(sharedRecords(portal, data).length)}</span> },
            { label: "Attached documents", value: <span className="ds-num">{String(portalDocuments(portal, data.documents).length)}</span> },
            { label: "Inherits internal access", value: portal.fields.inheritsInternalAccess === true ? <Pill tone="danger">Yes</Pill> : <Pill tone="success">No, nothing is inherited</Pill> },
            { label: "Link expiry", value: <span className="ds-num">{String(portal.fields.linkExpiryDays ?? 0)} days</span> },
          ]} />
        </Card>
        <Notice tone="danger" title="A client cannot widen their own access">
          Everything on this screen is set by the studio. A portal user has no control that grants a record, changes a gate or invites another user, which is why requesting access is a message rather than a switch.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Analytics") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Visits, 90 days" value={String(portal.fields.visits90d ?? 0)} prov="human" meta="Counted on the portal record" />
          <Stat label="External users" value={String(users.length)} prov="human" meta={`${portal.fields.invitesPending ?? 0} invitations pending`} />
          <Stat label="Last opened" value={String(portal.fields.lastVisitAt) ? context.date(String(portal.fields.lastVisitAt)) : "Never"} prov={String(portal.fields.lastVisitAt) ? "human" : undefined} unavailable={!String(portal.fields.lastVisitAt)} meta={String(portal.fields.lastVisitAt) ? context.relative(String(portal.fields.lastVisitAt)) : "No visit recorded"} />
          <Stat label="Page-level analytics" value="Unavailable" unavailable meta="No analytics service is connected" />
        </StatRow>
        <Card eyebrow="USAGE" prov="human" title="Recorded activity by week" subtitle="From the activity rows stored on this portal">
          <BarChart
            title="Portal activity"
            height={180}
            format={(value) => String(Math.round(value))}
            series={[{
              name: "Events",
              points: [3, 2, 1, 0].map((back) => {
                const start = new Date(now.getTime() - (back + 1) * 7 * 86_400_000);
                const end = new Date(now.getTime() - back * 7 * 86_400_000);
                return {
                  label: `w-${back}`,
                  value: activity.filter((item) => new Date(item.at) >= start && new Date(item.at) < end).length,
                };
              }),
            }]}
            footer="Only events recorded on this portal are counted. There is no page tracker, so a visit that nobody recorded is simply not here."
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Audit") {
    return (
      <Stack gap={4}>
        <ol className="t4-timeline">
          {activity.map((item, index) => (
            <li key={`${item.at}-${index}`}>
              <div>
                <strong className="ds-num">{context.dateTime(item.at)}</strong>
                <div className="ds-subtle">{item.actor === "external" ? "Portal user" : item.actor}</div>
              </div>
              <div className="ds-panel" style={{ padding: "var(--space-3)" }}>{item.detail}</div>
            </li>
          ))}
        </ol>
        {activity.length === 0 && <Empty title="No activity recorded" icon={<ShieldCheck size={20} />} />}
        <Notice tone="info" title="What an audit here can and cannot show">
          Rows are written when the workspace records an action. Without a server there is no independent log, so this is the studio's own record of what happened rather than a tamper-evident trail.
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <DataGrid
        rows={users}
        rowId={(row) => row.id}
        label="External users"
        filterable={false}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("scope preview", { userId: id })}
        rowTone={(row) => (expiryState(row.expiresAt, now).expired ? "danger" : undefined)}
        columns={[
          { key: "name", header: "Person", primary: true, cell: (row) => row.name },
          { key: "email", header: "Email", cell: (row) => row.email },
          { key: "role", header: "Portal role", cell: (row) => <Pill tone={row.role === "portal_admin" ? "accent" : "neutral"}>{row.role.replace("_", " ")}</Pill> },
          { key: "seen", header: "Last seen", cell: (row) => <span className="ds-num">{context.date(row.lastSeenAt)}</span> },
          { key: "expires", header: "Access expires", cell: (row) => {
            const expiry = expiryState(row.expiresAt, now);
            return expiry.expired ? <Pill tone="danger" dot>Expired</Pill> : <Pill tone={expiry.days < 7 ? "warning" : "success"}>{expiry.days} days</Pill>;
          } },
        ]}
        empty={<Empty title="Nobody has been invited" icon={<Users size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("External invite")}>Invite someone</Button>} />}
      />
      {Number(portal.fields.invitesPending ?? 0) > 0 && (
        <Notice tone="warning" title={`${portal.fields.invitesPending} invitation${Number(portal.fields.invitesPending) === 1 ? "" : "s"} cannot be delivered`}>
          An invitation needs an email provider. Each one is held as a local record with its recipient and scope, so it can be sent the moment a provider is connected.
        </Notice>
      )}
    </Stack>
  );
}

/* ---------------- Totals helper used by the billing overlay ---------------- */

export function InvoiceTotalsCard({ invoice, context }: { invoice: Rec; context: ScreenContext }) {
  const { org } = useWorkspace();
  const lines = ((invoice.body as { lines?: { id: string; description: string; quantity: number; unitPriceMinor: number; taxCategory: string }[] } | undefined)?.lines ?? []).map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxCategory: line.taxCategory as "standard",
  }));
  const totals = computeInvoice({
    lines,
    jurisdiction: org.jurisdiction,
    customerStatus: String(invoice.fields.taxStatus ?? "domestic") as "domestic",
    date: invoice.at ?? invoice.createdAt,
  });
  return (
    <Stack gap={3}>
      <DataGrid rows={totals.lines} rowId={(row) => row.id} label="Invoice lines" filterable={false}
        columns={[
          { key: "description", header: "Item", primary: true, cell: (row) => row.description },
          { key: "qty", header: "Qty", align: "end", cell: (row) => <span className="ds-num">{String(row.quantity)}</span> },
          { key: "unit", header: "Unit", align: "end", cell: (row) => <span className="ds-num">{context.money(row.unitPriceMinor)}</span> },
          { key: "code", header: "Tax", cell: (row) => <Pill>{row.taxCode.code}</Pill> },
          { key: "gross", header: "Gross", align: "end", cell: (row) => <span className="ds-num">{context.money(row.grossMinor)}</span> },
        ]} />
      <TotalsBlock totals={totals} money={context.money} label="Invoice" />
    </Stack>
  );
}

export function PortalSelector({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { org } = useWorkspace();
  return (
    <Field label="Portal">
      <Select
        value={resolvePortal(context.params.id, data.portals)?.id ?? listedPortals(data.portals)[0]?.id ?? ""}
        onChange={(event) => context.navigate(`/o/${org.slug}/portal/portals/${event.target.value}/dashboard`)}
      >
        {listedPortals(data.portals).map((portal) => <option key={portal.id} value={portal.id}>{portal.title}</option>)}
      </Select>
    </Field>
  );
}
