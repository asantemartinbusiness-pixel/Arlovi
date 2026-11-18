import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties, Row, Segmented, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clockIso } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE } from "@/applications/market/kit";
import {
  bodyOf, GATE_LABELS, MODULE_LABELS, portalDocuments, portalMessages, portalVisibleInvoices, sharedRecords, statusTone, usePortalData,
  type PortalBody, type PortalPage,
} from "./data";
import {
  acceptedRequestTypes, accentWarning, addPage, brandingProblems, exposureRows, initialsOf, markTextColour, movePage, normaliseRole,
  pagesForRole, PORTAL_ROLES, removePage, reorderPage, REQUEST_TYPES, roleLabel, setExposure, sharingState, updatePage, validatePageName,
  type ExposureRow, type PortalRole,
} from "./config";
import { testPortal } from "./actions";
import "./portal-config.css";

/* ====================================================================== *
 * PORTAL configuration surfaces used by the builder (ARL-PORTAL-002):
 * branding, navigation, record exposure, request types, roles with a
 * "view as" preview, and the honest sharing state.
 * ====================================================================== */

const withActivity = (body: PortalBody, actor: string, detail: string): PortalBody => ({
  ...body, activity: [{ at: clockIso(), actor, detail }, ...(body.activity ?? [])],
});

export function brandOf(portal: Rec) {
  const accent = String(portal.fields.accent ?? "#234fe8");
  const displayName = String(portal.fields.displayName ?? "") || portal.title;
  return {
    accent,
    displayName,
    welcome: String(portal.fields.welcome ?? ""),
    initials: initialsOf(displayName),
    markColour: markTextColour(accent),
  };
}

export function BrandMark({ portal, accent, name }: { portal: Rec; accent?: string; name?: string }) {
  const brand = brandOf(portal);
  const colour = accent ?? brand.accent;
  return (
    <span className="t4-portal-mark" aria-hidden="true" style={{ background: colour, color: markTextColour(colour) }}>
      {initialsOf(name ?? brand.displayName)}
    </span>
  );
}

/** The person the next "view as" preview opens on. Set by the roles table just before it switches tab. */
let pendingViewAs = "";

/* ---------------- Sharing state ---------------- */

export function SharingStateCard({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const { org } = useWorkspace();
  const state = sharingState(portal, org.slug);
  const tested = String(portal.fields.testedAt ?? "");
  return (
    <Card eyebrow="SHARING" prov="human" title="Is this portal reachable?" subtitle="What a client could open today, stated plainly"
      actions={<Pill tone={state.tone} dot>{state.label}</Pill>}
      footer={<div className="t4-foot-wrap">
        <Button size="sm" variant="secondary" onClick={() => testPortal(context)}>Run the access test</Button>
        <Button size="sm" variant="ghost" onClick={() => context.openOverlay("publish review")}>Publish review</Button>
      </div>}>
      <Stack gap={3}>
        <Properties rows={[
          { label: "Link reaches a client", value: <Pill tone="warning">No — hosting is not connected</Pill> },
          { label: "Planned address", value: <code className="ds-num t4-portal-address">{state.plannedAddress}</code> },
          { label: "Link expiry", value: <span className="ds-num">{String(portal.fields.linkExpiryDays ?? 30)} days</span> },
          { label: "Last access test", value: tested ? <Row gap={2}><Pill tone={portal.fields.testsPassed === true ? "success" : "danger"}>{portal.fields.testsPassed === true ? "Passed" : "Failed"}</Pill><span className="ds-subtle">{context.relative(tested)} by {String(portal.fields.testedBy ?? "—")}</span></Row> : <span className="ds-subtle">Never run</span> },
        ]} />
        <p className="ds-subtle">{state.detail}</p>
      </Stack>
    </Card>
  );
}

/* ---------------- Navigation ---------------- */

export function NavigationEditor({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const body = bodyOf<PortalBody>(portal, {});
  const saved = body.pages ?? [];
  return <NavigationEditorForm key={`${portal.id}-${portal.revision}`} context={context} portal={portal} saved={saved} />;
}

function NavigationEditorForm({ context, portal, saved }: { context: ScreenContext; portal: Rec; saved: PortalPage[] }) {
  const [pages, setPages] = useState<PortalPage[]>(saved);
  const [newName, setNewName] = useState("");
  const [note, setNote] = useState("");
  // Pointer drag state, and the keyboard "picked up" page with the order to restore on Escape.
  const [dragId, setDragId] = useState<string | null>(null);
  // A row only becomes draggable while its handle is pressed, so text in its fields stays selectable.
  const [armed, setArmed] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [grabbed, setGrabbed] = useState<{ id: string; before: PortalPage[] } | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  const dropAt = (id: string, to: number) => {
    const from = pages.findIndex((page) => page.id === id);
    if (from < 0 || from === to) return;
    const page = pages[from];
    setPages(reorderPage(pages, from, to));
    setNote(`${page.name} moved to position ${to + 1} of ${pages.length}. Save to apply.`);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, page: PortalPage, index: number) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (grabbed?.id === page.id) {
        setGrabbed(null);
        setNote(`${page.name} dropped at position ${index + 1} of ${pages.length}. Save to apply.`);
      } else {
        setGrabbed({ id: page.id, before: pages });
        setNote(`${page.name} picked up at position ${index + 1}. Use the up and down arrows to move it, Space to drop, Escape to cancel.`);
      }
      return;
    }
    if (grabbed?.id !== page.id) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setPages(grabbed.before);
      setGrabbed(null);
      refocus.current = page.id;
      setNote(`Move cancelled. ${page.name} is back at position ${grabbed.before.findIndex((item) => item.id === page.id) + 1}.`);
      return;
    }
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : event.key === "Home" ? -index : event.key === "End" ? pages.length - 1 - index : 0;
    if (!delta) return;
    event.preventDefault();
    const to = Math.max(0, Math.min(pages.length - 1, index + delta));
    if (to === index) return;
    setPages(reorderPage(pages, index, to));
    refocus.current = page.id;
    setNote(`${page.name} is now at position ${to + 1} of ${pages.length}.`);
  };
  const dirty = JSON.stringify(pages) !== JSON.stringify(saved);
  const nameErrors = Object.fromEntries(pages.map((page) => [page.id, validatePageName(pages, page.name, page.id)]));
  const newError = newName ? validatePageName(pages, newName) : undefined;
  const invalid = pages.length === 0 || Object.values(nameErrors).some(Boolean);

  const save = async () => {
    if (invalid) return;
    const body = bodyOf<PortalBody>(portal, {});
    const result = await context.mutate.patch(portal.id, {
      body: withActivity({ ...body, pages }, context.actor, `Navigation saved: ${pages.map((page) => page.name).join(" · ")}.`),
    }, { expectRevision: portal.revision, event: `Navigation of ${portal.title} saved by ${context.actor}` });
    if (!result) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Navigation saved", `${pages.length} page${pages.length === 1 ? "" : "s"} in this order.`);
  };

  return (
    <Card eyebrow="NAVIGATION" prov="human" title="Pages and their order" subtitle="The sections a client sees across the top of the portal"
      actions={dirty ? <Pill tone="warning" dot>Unsaved changes</Pill> : <Pill tone="success" dot>Saved</Pill>}
      footer={<div className="t4-foot-wrap">
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setPages(saved); setNote("Changes discarded."); }}>Discard</Button>
        <span className="ds-grow" />
        <Button size="sm" variant="primary" disabled={!dirty || invalid} onClick={save}>Save navigation</Button>
      </div>}>
      <Stack gap={3}>
        <p id="t4-nav-reorder-help" className="ds-subtle">Drag a page by its handle to reorder it. From the keyboard, focus a handle, press Space to pick the page up, move it with the arrow keys and press Space again to drop it.</p>
        <ol className="t4-nav-list" aria-label="Portal pages in navigation order">
          {pages.map((page, index) => (
            <li key={page.id} className="t4-nav-item"
              draggable={armed === page.id}
              onDragStart={(event) => {
                if (armed !== page.id) { event.preventDefault(); return; }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", page.id);
                setDragId(page.id);
              }}
              onDragEnd={() => { setDragId(null); setOverIndex(null); setArmed(null); }}
              data-dragging={dragId === page.id || grabbed?.id === page.id ? "true" : undefined}
              data-over={dragId && dragId !== page.id && overIndex === index ? "true" : undefined}
              onDragOver={(event) => { if (!dragId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOverIndex(index); }}
              onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || dragId; if (id) dropAt(id, index); setDragId(null); setOverIndex(null); }}>
              <span className="t4-nav-grip">
                <button type="button" className="t4-nav-handle"
                  onPointerDown={() => setArmed(page.id)}
                  onPointerUp={() => setArmed(null)}
                  ref={(node) => { if (node) handles.current.set(page.id, node); else handles.current.delete(page.id); }}
                  aria-label={`Reorder ${page.name}, position ${index + 1} of ${pages.length}`}
                  aria-describedby="t4-nav-reorder-help"
                  aria-pressed={grabbed?.id === page.id}
                  onKeyDown={(event) => onHandleKey(event, page, index)}
                  onBlur={() => { if (grabbed?.id === page.id && refocus.current !== page.id) { setGrabbed(null); } }}
>
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <span className="ds-num t4-nav-index">{index + 1}</span>
              </span>
              <Field label="Page name" error={nameErrors[page.id]}>
                <TextInput value={page.name} invalid={Boolean(nameErrors[page.id])} onChange={(event) => setPages(updatePage(pages, page.id, { name: event.target.value }))} />
              </Field>
              <Field label="Who can open it">
                <Select value={page.gate} onChange={(event) => setPages(updatePage(pages, page.id, { gate: event.target.value }))}>
                  {Object.entries(GATE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </Field>
              <Row gap={1} className="t4-nav-tools">
                <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${page.name} up`} disabled={index === 0} onClick={() => { setPages(movePage(pages, index, -1)); setNote(`${page.name} moved to position ${index}.`); }}><ArrowUp size={14} /></Button>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${page.name} down`} disabled={index === pages.length - 1} onClick={() => { setPages(movePage(pages, index, 1)); setNote(`${page.name} moved to position ${index + 2}.`); }}><ArrowDown size={14} /></Button>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${page.name}`} disabled={pages.length === 1} onClick={() => { setPages(removePage(pages, page.id)); setNote(`${page.name} removed. Save to apply.`); }}><Trash2 size={14} /></Button>
              </Row>
              <span className="ds-subtle t4-nav-modules">{page.modules.length ? page.modules.map((module) => MODULE_LABELS[module] ?? module).join(", ") : "No modules yet — arrange them from the page list"}</span>
            </li>
          ))}
        </ol>
        <p aria-live="polite" className="ds-subtle">{note || "Rename, reorder or gate a page, then save."}</p>
        <form className="t4-nav-add" onSubmit={(event) => {
          event.preventDefault();
          if (!newName.trim() || newError) return;
          setPages(addPage(pages, newName));
          setNote(`${newName.trim()} added at the end. Save to apply.`);
          setNewName("");
        }}>
          <Field label="New page" error={newError}>
            <TextInput value={newName} invalid={Boolean(newError)} placeholder="For example Handover" onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <Button type="submit" size="sm" variant="secondary" disabled={!newName.trim() || Boolean(newError)}><Plus size={14} /> Add page</Button>
        </form>
      </Stack>
    </Card>
  );
}

/* ---------------- Branding ---------------- */

export function BrandEditor({ context, portal }: { context: ScreenContext; portal: Rec }) {
  return <BrandEditorForm key={`${portal.id}-${portal.revision}`} context={context} portal={portal} />;
}

function BrandEditorForm({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const { org } = useWorkspace();
  const brand = brandOf(portal);
  const [displayName, setDisplayName] = useState(brand.displayName);
  const [welcome, setWelcome] = useState(brand.welcome);
  const [accent, setAccent] = useState(brand.accent);
  const [domain, setDomain] = useState(String(portal.fields.customDomain ?? ""));
  const problems = brandingProblems({ displayName, accent, welcome, domain });
  const warning = accentWarning(accent);
  const dirty = displayName !== brand.displayName || welcome !== brand.welcome || accent !== brand.accent || domain !== String(portal.fields.customDomain ?? "");
  const invalid = Object.keys(problems).length > 0;

  return (
    <Grid>
      <Card span={7} eyebrow="BRAND" prov="human" title="Branding" subtitle="Name, colour and welcome shown on every page"
        actions={dirty ? <Pill tone="warning" dot>Unsaved changes</Pill> : <Pill tone="success" dot>Saved</Pill>}>
        <form id="portal-brand-editor" className="ds-stack ds-gap-4" onSubmit={async (event) => {
          event.preventDefault();
          if (invalid || !dirty) return;
          const domainChanged = domain.trim() !== String(portal.fields.customDomain ?? "");
          const body = bodyOf<PortalBody>(portal, {});
          const result = await context.mutate.patch(portal.id, {
            fields: { ...portal.fields, displayName: displayName.trim(), welcome: welcome.trim(), accent: accent.trim().toLowerCase(), customDomain: domain.trim(), domainVerified: domainChanged ? false : portal.fields.domainVerified === true },
            body: withActivity(body, context.actor, "Branding updated."),
          }, { expectRevision: portal.revision, event: `Branding of ${portal.title} updated by ${context.actor}` });
          if (!result) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
          context.toast("Branding saved", domainChanged && domain.trim() ? "The domain is recorded as unverified: DNS and a certificate are arranged outside this application." : "Clients will see this the next time the portal renders.");
        }}>
          <Field label="Name shown to clients" required error={problems.displayName}>
            <TextInput value={displayName} invalid={Boolean(problems.displayName)} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Row gap={3} wrap>
            <Field label="Accent colour" error={problems.accent} hint={warning ? undefined : "Six-digit hex"}>
              <TextInput value={accent} invalid={Boolean(problems.accent)} onChange={(event) => setAccent(event.target.value)} />
            </Field>
            <Field label="Pick">
              <input type="color" className="t4-colour" aria-label="Pick an accent colour" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#234fe8"} onChange={(event) => setAccent(event.target.value)} />
            </Field>
          </Row>
          {warning && <Notice tone="warning" title="Low contrast accent">{warning}</Notice>}
          <Field label="Welcome message" hint={`${welcome.length}/280 · shown on the overview page`} error={problems.welcome}>
            <TextArea rows={3} value={welcome} invalid={Boolean(problems.welcome)} onChange={(event) => setWelcome(event.target.value)} />
          </Field>
          <Field label="Custom domain" hint="Optional. Recorded as unverified until DNS is confirmed outside this application." error={problems.domain}>
            <TextInput value={domain} invalid={Boolean(problems.domain)} placeholder={`portal.${org.slug}.example`} onChange={(event) => setDomain(event.target.value.toLowerCase())} />
          </Field>
          <Row gap={2}>
            <Button variant="ghost" disabled={!dirty} onClick={() => { setDisplayName(brand.displayName); setWelcome(brand.welcome); setAccent(brand.accent); setDomain(String(portal.fields.customDomain ?? "")); }}>Discard</Button>
            <span className="ds-grow" />
            <Button variant="primary" type="submit" disabled={!dirty || invalid}>Save branding</Button>
          </Row>
        </form>
      </Card>
      <Card span={5} eyebrow="LIVE PREVIEW" prov="human" title="Top of every page">
        <Stack gap={3}>
          <div className="t4-portal">
            <div className="t4-portal-top">
              <BrandMark portal={portal} accent={/^#[0-9a-f]{6}$/i.test(accent) ? accent : brand.accent} name={displayName || portal.title} />
              <div className="ds-grow">
                <strong>{displayName || portal.title}</strong>
                <p className="ds-subtle">{domain || `${org.name} client portal`}</p>
              </div>
            </div>
            <div className="t4-portal-body">
              <p>{welcome || <span className="ds-subtle">No welcome message. The overview opens straight onto shared records.</span>}</p>
            </div>
          </div>
          <Properties rows={[
            { label: "Domain verified", value: portal.fields.domainVerified === true ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill> },
            { label: "Terms version", value: <span className="ds-num">{String(portal.fields.termsVersion ?? "—")}</span> },
          ]} />
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------- Exposure ---------------- */

const EXPOSABLE: { collection: string; label: string }[] = [
  { collection: "documents", label: "Documents" },
  { collection: "invoices", label: "Invoices" },
  { collection: "orders", label: "Orders" },
  { collection: "bookings", label: "Appointments" },
  { collection: "returns", label: "Returns" },
  { collection: "purchaseOrders", label: "Purchase orders" },
];

const SOURCE_LABEL: Record<ExposureRow["source"], string> = {
  granted: "Shared by this portal",
  attached: "Attached on the record",
  available: "Same account · not shared",
  other_account: "Another account · refused",
};

export function ExposureEditor({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const data = usePortalData();
  const [kind, setKind] = useState("documents");
  const [busy, setBusy] = useState("");
  const alias = typeof portal.fields.canonicalFor === "string" && portal.fields.canonicalFor ? [portal.fields.canonicalFor] : [];
  const pools = useMemo(() => ({
    documents: data.documents, invoices: data.invoices, orders: data.orders, bookings: data.bookings, returns: data.returns, purchaseOrders: data.purchaseOrders,
  }), [data.documents, data.invoices, data.orders, data.bookings, data.returns, data.purchaseOrders]);
  const rows = useMemo(() => exposureRows(portal, pools, alias), [portal, pools, alias.join()]);
  const visible = rows.filter((row) => row.collection === kind);
  const counts = Object.fromEntries(EXPOSABLE.map((item) => [item.collection, rows.filter((row) => row.collection === item.collection && row.exposed).length]));

  const toggle = async (row: ExposureRow, on: boolean) => {
    if (row.source === "attached" || row.source === "other_account") return;
    setBusy(row.record.id);
    const body = bodyOf<PortalBody>(portal, {});
    const shared = setExposure(body.shared ?? [], row.collection, row.record.id, on);
    const result = await context.mutate.patch(portal.id, {
      body: withActivity({ ...body, shared }, context.actor, `${on ? "Shared" : "Stopped sharing"} ${row.record.title}.`),
    }, { expectRevision: portal.revision, event: `${row.record.title} ${on ? "shared with" : "withdrawn from"} ${portal.title}` });
    setBusy("");
    if (!result) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast(on ? "Shared" : "Withdrawn", on ? `${row.record.title} now shows in ${portal.title}.` : `${row.record.title} no longer shows in ${portal.title}. Nothing was deleted.`);
  };

  return (
    <Card eyebrow="EXPOSURE" prov="human" title="What this portal shows" subtitle="Records of this portal's account, and whether a client can see each one">
      <Stack gap={3}>
        <div className="t4-wrap-segment">
          <Segmented label="Kind of record" value={kind} onChange={setKind}
            options={EXPOSABLE.map((item) => ({ value: item.collection, label: `${item.label} · ${counts[item.collection] ?? 0}` }))} />
        </div>
        {visible.length === 0 ? (
          <Empty title={`No ${EXPOSABLE.find((item) => item.collection === kind)?.label.toLowerCase()} for this account`}>
            {String(portal.fields.contactId ?? "") ? "Records appear here once they are linked to this portal's contact." : "This portal is not linked to a contact, so only records shared one at a time appear. Use Bind permitted data."}
          </Empty>
        ) : (
          <ul className="t4-expose-list" aria-label="Exposure">
            {visible.map((row) => {
              const locked = row.source === "attached" || row.source === "other_account";
              return (
                <li key={row.record.id} className="t4-expose-item" data-source={row.source}>
                  <Checkbox
                    label={<span><strong>{row.record.title}</strong> <span className="ds-subtle">{row.record.summary.slice(0, 70)}</span></span>}
                    checked={row.exposed}
                    disabled={locked || busy === row.record.id}
                    aria-describedby={`expose-${row.record.id}`}
                    onChange={(event) => toggle(row, event.target.checked)}
                  />
                  <Row gap={2} id={`expose-${row.record.id}`}>
                    <Pill tone={row.source === "other_account" ? "danger" : row.exposed ? "success" : "neutral"}>{row.exposed ? <Eye size={12} /> : <EyeOff size={12} />} {SOURCE_LABEL[row.source]}</Pill>
                    <Pill tone={statusTone(row.record.status)}>{row.record.status.replace(/_/g, " ")}</Pill>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
        <span className="ds-subtle">A record attached by its own portal link is changed on that record. A record of another account can never be shared here.</span>
      </Stack>
    </Card>
  );
}

export function RequestTypesEditor({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const accepted = acceptedRequestTypes(portal);
  const save = async (next: string[]) => {
    const body = bodyOf<PortalBody>(portal, {});
    const result = await context.mutate.patch(portal.id, {
      fields: { ...portal.fields, requestTypes: next.join(",") },
      body: withActivity(body, context.actor, next.length ? `Clients can raise: ${next.join(", ")}.` : "Requests switched off."),
    }, { expectRevision: portal.revision, event: `Request types on ${portal.title} changed by ${context.actor}` });
    if (!result) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Requests updated", next.length ? `${next.length} request type${next.length === 1 ? "" : "s"} offered on the request form.` : "The request form is closed on this portal.");
  };
  return (
    <Card eyebrow="REQUESTS" prov="human" title="What clients may ask for" subtitle="The request form offers only these types">
      <fieldset className="ds-fieldset">
        <legend>Accepted request types</legend>
        <Stack gap={2}>
          {REQUEST_TYPES.map((type) => (
            <Checkbox key={type.value} label={type.label} checked={accepted.includes(type.value)}
              onChange={(event) => save(event.target.checked ? [...accepted, type.value] : accepted.filter((item) => item !== type.value))} />
          ))}
        </Stack>
      </fieldset>
      {accepted.length === 0 && <Notice tone="warning" title="Requests are switched off">The client sees no request form; messages still reach the thread.</Notice>}
    </Card>
  );
}

/* ---------------- Roles ---------------- */

export function RolesEditor({ context, portal }: { context: ScreenContext; portal: Rec }) {
  const body = bodyOf<PortalBody>(portal, {});
  const users = body.users ?? [];
  const pages = body.pages ?? [];
  const change = async (userId: string, role: PortalRole) => {
    const user = users.find((item) => item.id === userId);
    if (!user || user.role === role) return;
    if (user.role === "portal_admin" && role !== "portal_admin" && users.filter((item) => item.role === "portal_admin").length === 1) {
      context.toast("One administrator is needed", `${user.name} is the only portal administrator. Make someone else administrator first.`, "blocked");
      return;
    }
    const result = await context.mutate.patch(portal.id, {
      body: withActivity({ ...body, users: users.map((item) => (item.id === userId ? { ...item, role } : item)) }, context.actor, `${user.name} is now ${roleLabel(role)}.`),
    }, { expectRevision: portal.revision, event: `${user.email} role on ${portal.title} set to ${role}` });
    if (!result) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
    context.toast("Role changed", `${user.name} is now ${roleLabel(role)} and sees ${pagesForRole(pages, role).visible.length} of ${pages.length} pages.`);
  };
  return (
    <Card eyebrow="ROLES" prov="human" title={`${users.length} ${users.length === 1 ? "person" : "people"} can sign in`} subtitle="Each role is scoped to this portal only">
      {users.length === 0 ? <Empty title="Nobody has been invited">Invite someone from Access and analytics.</Empty> : (
        <DataGrid rows={users} rowId={(row) => row.id} label="Portal roles" filterable={false}
          columns={[
            { key: "name", header: "Person", primary: true, cell: (row) => <Stack gap={1}><strong>{row.name}</strong><span className="ds-subtle">{row.email}</span></Stack> },
            { key: "role", header: "Role", cell: (row) => (
              <Select aria-label={`Role for ${row.name}`} value={normaliseRole(row.role)} onChange={(event) => change(row.id, event.target.value as PortalRole)}>
                {PORTAL_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </Select>
            ) },
            { key: "pages", header: "Pages visible", align: "end", cell: (row) => <span className="ds-num">{pagesForRole(pages, normaliseRole(row.role)).visible.length}/{pages.length}</span> },
            { key: "preview", header: "", cell: (row) => <Button size="sm" variant="ghost" aria-label={`View the portal as ${row.name}`} onClick={() => { pendingViewAs = row.id; context.setTab("Preview"); }}>View as</Button> },
          ]} />
      )}
    </Card>
  );
}

/* ---------------- View as ---------------- */

export function RolePreview({ portal }: { portal: Rec }) {
  const data = usePortalData();
  const { org } = useWorkspace();
  const body = bodyOf<PortalBody>(portal, {});
  const pages = body.pages ?? [];
  const users = body.users ?? [];
  const [initialUser] = useState(() => {
    const found = users.find((user) => user.id === pendingViewAs);
    pendingViewAs = "";
    return found;
  });
  const [role, setRole] = useState<PortalRole>(initialUser ? normaliseRole(initialUser.role) : "portal_member");
  const [userId, setUserId] = useState(initialUser?.id ?? "");
  const [device, setDevice] = useState<"phone" | "desktop">("desktop");
  const { visible, hidden } = pagesForRole(pages, role);
  const [active, setActive] = useState(visible[0]?.id ?? "");
  const page = visible.find((item) => item.id === active) ?? visible[0];
  const brand = brandOf(portal);
  const shared = sharedRecords(portal, data);
  const invoices = portalVisibleInvoices(portal, data);
  const messages = portalMessages(portal, data.messages);
  const accepted = acceptedRequestTypes(portal);
  const user = users.find((item) => item.id === userId);
  const canOpenBilling = pages.some((item) => item.modules.includes("invoices") && visible.includes(item));

  const moduleBody = (module: string) => {
    const list = (collection: string) => shared.filter((item) => item.collection === collection).map((item) => item.record);
    const records = module === "orders" ? list("orders").concat(list("purchaseOrders"))
      : module === "bookings" ? list("bookings")
        : module === "documents" ? list("documents").concat(portalDocuments(portal, data.documents).filter((doc) => !list("documents").some((item) => item.id === doc.id)))
          : module === "invoices" ? invoices
            : [];
    if (module === "welcome") return <p>{brand.welcome || `Hello${user ? `, ${user.name}` : ""}. Everything shared with you is here.`}</p>;
    if (module === "thread") return <p className="ds-subtle">{messages.length} message{messages.length === 1 ? "" : "s"} in the thread.</p>;
    if (module === "requests") return accepted.length ? <p className="ds-subtle">Request form offers: {accepted.map((value) => REQUEST_TYPES.find((type) => type.value === value)?.label).join(", ")}.</p> : <p className="ds-subtle">No request form on this portal.</p>;
    if (module === "milestones") {
      // Invoices stay behind the billing gate: a member never sees one through milestones.
      const dated = shared.filter((item) => canOpenBilling || item.collection !== "invoices").map((item) => item.record).filter((record) => record.dueAt || record.startAt)
        .sort((a, b) => String(a.startAt ?? a.dueAt).localeCompare(String(b.startAt ?? b.dueAt)));
      if (dated.length === 0) return <p className="ds-subtle">No shared record carries a date, so there are no milestones to show.</p>;
      return <ul className="t4-preview-list">{dated.map((record) => <li key={record.id}><span className="ds-grow">{record.title}</span><span className="ds-num ds-subtle">{String(record.startAt ?? record.dueAt).slice(0, 10)}</span></li>)}</ul>;
    }
    if (module === "next-actions") {
      const review = shared.filter((item) => canOpenBilling || item.collection !== "invoices").map((item) => item.record).filter((record) => record.status === "needs_review");
      const open = messages.filter((message) => message.status === "open").length;
      const unpaid = invoices.filter((invoice) => !["paid", "void"].includes(invoice.status)).length;
      return (
        <ul className="t4-preview-list">
          <li><span className="ds-grow">Items waiting for your review</span><span className="ds-num">{review.length}</span></li>
          <li><span className="ds-grow">Open requests and messages</span><span className="ds-num">{open}</span></li>
          {canOpenBilling && <li><span className="ds-grow">Invoices not yet paid</span><span className="ds-num">{unpaid}</span></li>}
        </ul>
      );
    }
    if (records.length === 0) return <p className="ds-subtle">Nothing is shared for this module, so the client sees an empty state.</p>;
    return (
      <ul className="t4-preview-list">
        {records.map((record) => <li key={record.id}><span className="ds-grow">{record.title}</span><Pill tone={statusTone(record.status)}>{record.status.replace(/_/g, " ")}</Pill></li>)}
      </ul>
    );
  };

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Segmented label="View as role" value={role} onChange={(value) => { setRole(value); setUserId(""); setActive(""); }}
          options={PORTAL_ROLES.map((item) => ({ value: item.value, label: item.label }))} />
        {users.length > 0 && (
          <Field label="Or a person">
            <Select value={userId} onChange={(event) => {
              const chosen = users.find((item) => item.id === event.target.value);
              setUserId(event.target.value);
              if (chosen) { setRole(normaliseRole(chosen.role)); setActive(""); }
            }}>
              <option value="">Anyone with this role</option>
              {users.map((item) => <option key={item.id} value={item.id}>{item.name} · {roleLabel(normaliseRole(item.role))}</option>)}
            </Select>
          </Field>
        )}
        <Segmented label="Preview width" value={device} onChange={setDevice} options={[{ value: "phone", label: "390" }, { value: "desktop", label: "Full" }]} />
      </Row>
      <Notice tone="info" title={`Viewing as ${user ? user.name : roleLabel(role)}`}>
        {visible.length} of {pages.length} pages open for this role. This preview reads the same grants a signed-in client would; it does not sign anyone in.
      </Notice>
      <div className="t4-preview-frame" data-device={device}>
        <div className="t4-portal" aria-label={`Portal as seen by ${roleLabel(role)}`} role="region">
          <div className="t4-portal-top">
            <BrandMark portal={portal} />
            <div className="ds-grow">
              <strong>{brand.displayName}</strong>
              <p className="ds-subtle">{org.name} client portal</p>
            </div>
            <Pill tone="warning">Preview</Pill>
          </div>
          <nav className="t4-portal-nav t4-portal-tabs" aria-label="Portal pages">
            {visible.map((item) => (
              <button key={item.id} type="button" className="t4-portal-tab" aria-current={page?.id === item.id ? "page" : undefined} onClick={() => setActive(item.id)}>{item.name}</button>
            ))}
          </nav>
          <div className="t4-portal-body">
            {!page ? <Empty title="No page is open to this role">Change a page gate, or preview another role.</Empty> : (
              page.modules.length === 0 ? <Empty title={`${page.name} has no modules`} /> : page.modules.map((module) => (
                <Card key={module} prov="human" title={<h3 className="t4-module-title">{MODULE_LABELS[module] ?? module}</h3>}>{moduleBody(module)}</Card>
              ))
            )}
          </div>
        </div>
      </div>
      {hidden.length > 0 && (
        <Card eyebrow="HIDDEN FOR THIS ROLE" prov="human" title={`${hidden.length} page${hidden.length === 1 ? "" : "s"} not shown`}>
          <Stack gap={2}>
            {hidden.map((item) => <Row key={item.id} gap={2}><span className="ds-grow">{item.name}</span><Pill tone="warning">{GATE_LABELS[item.gate] ?? item.gate}</Pill></Row>)}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
