import { useState, type ReactNode } from "react";
import { Button, Empty, ModalActions, Notice, OverlayActions, Pill, Properties, Row, Stack, TextInput } from "@/design-system";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { CAPABILITY_LABELS, capabilityById } from "@/platform/capability";
import { getRecord } from "@/platform/repo";
import { useCollection } from "@/platform/workspace";
import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Shared action kit for the COMMS, CARE, LEGAL, HR and PROJECT modules.
 *
 * Two generic overlays that each screen declares alongside its contract
 * overlays:
 *   - "confirm action": a consequential action states its consequence and
 *     offers one principal button before the record changes.
 *   - "pick record": an action that needs a record, on a screen that has no
 *     selection of that kind, asks which one rather than acting on the first.
 * ------------------------------------------------------------------ */

export const CONFIRM = "confirm action";
export const PICK = "pick record";

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  rows?: { label: string; value: ReactNode }[];
  /** Label of the one principal button. */
  confirm: string;
  tone?: "danger";
  /** Provider capability id from src/platform/capability.ts when the action stops at a boundary. */
  boundary?: string;
  run: () => Promise<void> | void;
}

export interface PickRequest {
  title: string;
  collection: string;
  filter?: (row: Rec) => boolean;
  describe?: (row: Rec) => ReactNode;
  empty?: string;
  pickLabel?: string;
  onPick: (row: Rec) => Promise<void> | void;
}

/** Ask before a consequential action; the request carries its own run(). */
export function askFirst(context: ScreenContext, request: ConfirmRequest): void {
  context.openOverlay(CONFIRM, request);
}

/** Ask which record an action applies to. */
export function pickRecord(context: ScreenContext, request: PickRequest): void {
  context.openOverlay(PICK, request);
}

/** Guard factory: the action is unavailable until something is selected. */
export function needsSelection(what: string) {
  return (context: ScreenContext) => (context.selectedId ? undefined : `Select ${what} first`);
}

/** The selected record, only if it belongs to one of the given collections in this org. */
export async function selectedOf(context: ScreenContext, collections: string | string[], what: string): Promise<Rec | undefined> {
  const wanted = Array.isArray(collections) ? collections : [collections];
  const id = context.selectedId;
  const record = id ? await getRecord(id) : undefined;
  if (!record || record.organizationId !== context.org.id || !wanted.includes(record.collection)) {
    context.toast(`Select ${what} first`, `This action applies to ${what}; nothing was changed.`, "blocked");
    return undefined;
  }
  return record;
}

/** The record with this id, if it is in this org and collection. */
export async function recordOf(context: ScreenContext, id: string | undefined, collections: string | string[]): Promise<Rec | undefined> {
  if (!id) return undefined;
  const wanted = Array.isArray(collections) ? collections : [collections];
  const record = await getRecord(id);
  return record && record.organizationId === context.org.id && wanted.includes(record.collection) ? record : undefined;
}

/** One sentence naming the provider boundary, in the capability vocabulary. */
export function boundaryText(id: string): string {
  const capability = capabilityById(id);
  if (!capability) return "No provider is connected, so nothing has left this browser.";
  return `${capability.provider}: ${CAPABILITY_LABELS[capability.state]}. ${capability.localEquivalent} ${capability.note}`;
}

export function Boundary({ id, title }: { id: string; title?: string }) {
  const capability = capabilityById(id);
  return (
    <Notice tone="warning" title={title ?? `${capability?.label ?? "Provider"} — ${capability ? CAPABILITY_LABELS[capability.state] : "Not connected"}`}>
      {capability?.localEquivalent} {capability?.note ?? "Nothing has left this browser."}
    </Notice>
  );
}

/** Record in the audit trail that an action stopped at the provider boundary. */
export async function logBoundary(context: ScreenContext, id: string, message: string, entityId?: string): Promise<void> {
  await context.mutate.log(`${message} — ${boundaryText(id)}`, { entityId, type: "boundary", capability: "queued_local" });
}

function ConfirmBody({ context, close }: { context: ScreenContext; close: () => void }) {
  const request = context.overlayPayload as ConfirmRequest | undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!request) return <Empty title="Nothing to confirm" />;
  return (
    <Stack gap={4}>
      <div className="ds-prose">{request.body}</div>
      {request.rows && request.rows.length > 0 && <Properties rows={request.rows} />}
      {request.boundary && <Boundary id={request.boundary} />}
      {error && <Notice tone="danger" title="Nothing was changed">{error}</Notice>}
      <ModalActions>
        <OverlayActions
          variant="confirm"
          end={<Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>}
          primary={<Button
          variant={request.tone === "danger" ? "danger" : "primary"}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await request.run();
              close();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
              setBusy(false);
            }
          }}
        >
          {request.confirm}
        </Button>}
        />
      </ModalActions>
    </Stack>
  );
}

function PickBody({ context, close }: { context: ScreenContext; close: () => void }) {
  const request = context.overlayPayload as PickRequest | undefined;
  const rows = useCollection(request?.collection ?? "__none__");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string>();
  if (!request) return <Empty title="Nothing to choose" />;
  const candidates = rows
    .filter((row) => (request.filter ? request.filter(row) : true))
    .filter((row) => !query || `${row.title} ${row.summary}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Stack gap={3}>
      <TextInput type="search" aria-label="Filter the list" placeholder="Filter" value={query} onChange={(event) => setQuery(event.target.value)} />
      {candidates.length === 0 ? <Empty title={request.empty ?? "Nothing to choose from"} /> : (
        <Stack gap={2}>
          {candidates.slice(0, 40).map((row) => (
            <Row key={row.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow">
                <strong>{row.title}</strong>
                <div className="ds-subtle">{request.describe ? request.describe(row) : row.summary}</div>
              </div>
              <Pill>{row.status}</Pill>
              <Button
                size="sm"
                variant="secondary"
                busy={busy === row.id}
                onClick={async () => {
                  setBusy(row.id);
                  context.select(row.id);
                  close();
                  await request.onPick(row);
                }}
              >
                {request.pickLabel ?? "Choose"}
              </Button>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** Declare these on every screen that uses askFirst / pickRecord. */
export const kitOverlays: OverlayDef[] = [
  {
    id: CONFIRM,
    kind: "modal",
    width: 520,
    title: (context) => (context.overlayPayload as ConfirmRequest | undefined)?.title ?? "Confirm",
    render: ({ close, ...context }) => <ConfirmBody context={context} close={close} />,
  },
  {
    id: PICK,
    kind: "drawer",
    width: 480,
    title: (context) => (context.overlayPayload as PickRequest | undefined)?.title ?? "Choose a record",
    render: ({ close, ...context }) => <PickBody context={context} close={close} />,
  },
];
