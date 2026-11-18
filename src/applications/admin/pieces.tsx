import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import * as repo from "@/platform/repo";
import { Button, Field, Notice, Pill, Properties, Row, Stack, TextInput } from "@/design-system";
import { applications } from "@/app/catalog";
import { canOpen, can as roleCan, ROLE_LABELS, type Capability } from "@/platform/policy";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec, Role } from "@/domain/types";
import { settleSeeds, type SeedStatus } from "./settle";

/* ====================================================================== *
 * ADMIN shared pieces — the few primitives the administration console needs
 * in more than one place. Local to this module.
 * ====================================================================== */

export const ADMIN_COLLECTIONS = [
  "policies", "members", "invitations", "sessions", "devices", "apiKeys", "webhooks",
  "billingInvoices", "dataRequests", "backups", "budgets", "agents", "missions",
  "departments", "brands",
];

export const ROLES: Role[] = ["owner", "finance", "sales", "people", "member", "client"];

/**
 * One quoted CSV cell. Text a spreadsheet would read as a formula (it starts
 * with = + - @, a tab or a carriage return) is prefixed with an apostrophe;
 * plain numbers pass through untouched.
 */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const numeric = typeof value === "number" || /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export const CAPABILITIES: Capability[] = [
  "post_journal", "approve_payment", "approve_mission", "edit_people", "view_payroll",
  "edit_pipeline", "publish_campaign", "manage_connectors", "manage_policy", "delete_records",
  "edit_knowledge", "run_automation", "export_data", "view_legal",
];

export function capabilityLabel(capability: string): string {
  return capability.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function useAdmin(): Record<string, Rec[]> {
  return useCollections(ADMIN_COLLECTIONS);
}

export function ofKind(records: Rec[], kind: string): Rec[] {
  return records.filter((record) => record.fields.kind === kind);
}

export function csvList(value: unknown): string[] {
  return typeof value === "string" && value.trim().length > 0
    ? value.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
}

export function appsForRole(role: Role): string[] {
  return applications.map((app) => app.code).filter((code) => canOpen(role, code));
}

/** A deliberate confirmation for a consequential change. Local, never a second factor. */
export function StepUp({
  word, label, children, onConfirm, busy, tone = "danger",
}: {
  word: string;
  label: string;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  tone?: "danger" | "primary";
}) {
  const [phrase, setPhrase] = useState("");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A local confirmation, not a second factor">
        Nothing here checks a device, a provider or an identity service. Typing the word records a deliberate confirmation in the audit
        log so a consequential change is never one stray click.
      </Notice>
      {children}
      <Field label={`Type ${word} to confirm`} required>
        <TextInput value={phrase} onChange={(event) => setPhrase(event.target.value.toUpperCase())} autoComplete="off" />
      </Field>
      <Button
        variant={tone === "danger" ? "outline-danger" : "primary"}
        busy={busy}
        disabled={phrase !== word}
        onClick={() => void onConfirm()}
      >
        {label}
      </Button>
    </Stack>
  );
}

/** What a role view can reach, counted rather than described. */
export function RoleReach({ role }: { role: Role }) {
  const apps = useMemo(() => appsForRole(role), [role]);
  const held = CAPABILITIES.filter((capability) => roleCan(role, capability));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Role view", value: ROLE_LABELS[role] },
        { label: "Applications offered", value: `${apps.length} of ${applications.length}` },
        { label: "Capabilities held", value: `${held.length} of ${CAPABILITIES.length}` },
      ]} />
      <Row gap={1} wrap>
        {held.length === 0
          ? <Pill>No capability beyond reading what the view offers</Pill>
          : held.map((capability) => <Pill key={capability} tone="info">{capabilityLabel(capability)}</Pill>)}
      </Row>
      <Row gap={1} wrap>
        {apps.map((code) => <Pill key={code}>{code}</Pill>)}
      </Row>
    </Stack>
  );
}

export function ConsoleNote({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Notice tone="info" title={title}>
      {children}
    </Notice>
  );
}

export function useOrganisationRecord(): Rec | undefined {
  const { org } = useWorkspace();
  const data = useCollections(["organizations"]);
  return data.organizations.find((record) => record.id === org.id);
}

/* ------------------------------------------------------------------ *
 * Local primitive: state seeded from a record that loads asynchronously.
 * Reads here are live queries, so an overlay mounts one render before its
 * record arrives; plain useState would capture the empty value and show a
 * blank form. This adjusts the field while the seed is still settling.
 * ------------------------------------------------------------------ */
export function useSeeded<T extends string | number | boolean>(seed: T): [T, (next: T) => void] {
  const [value, setValue] = useState(seed);
  const [seen, setSeen] = useState(seed);
  if (seed !== seen) {
    setSeen(seed);
    setValue(seed);
  }
  return [value, setValue];
}

/** The same, for a comma-separated list held on a record. */
export function useSeededList(seedCsv: string): [string[], Dispatch<SetStateAction<string[]>>] {
  const [value, setValue] = useState<string[]>(() => csvList(seedCsv));
  const [seen, setSeen] = useState(seedCsv);
  if (seedCsv !== seen) {
    setSeen(seedCsv);
    setValue(csvList(seedCsv));
  }
  return [value, setValue];
}

/* ------------------------------------------------------------------ *
 * Settled workspace records.
 *
 * Every application's fixtures load in the background after start-up. A
 * privacy register that counts the records a subject request covers must not
 * report a figure (or let an export or an erasure run) while part of the
 * workspace is still arriving: a partial count reads as a complete one, and a
 * deletion would silently miss records. `useSettledOrgRecords` returns null
 * until every application's records are in the store, then the live set.
 * ------------------------------------------------------------------ */

let seedStatus: SeedStatus = "loading";
const seedListeners = new Set<(status: SeedStatus) => void>();
let seedRun: Promise<SeedStatus> | null = null;

function startSeedLoad(): Promise<SeedStatus> {
  if (seedRun) return seedRun;
  seedStatus = "loading";
  seedListeners.forEach((listener) => listener(seedStatus));
  seedRun = settleSeeds(() => import("@/applications").then((module) => module.loadAllSeeds())).then((status) => {
    seedStatus = status;
    // A failed load may be retried; a settled one is final.
    if (status === "failed") seedRun = null;
    seedListeners.forEach((listener) => listener(status));
    return status;
  });
  return seedRun;
}

/** Whether every application's fixtures are in the store, and a retry for a failed load. */
export function useSeedStatus(): { status: SeedStatus; retry: () => void } {
  const [status, setStatus] = useState<SeedStatus>(seedStatus);
  useEffect(() => {
    seedListeners.add(setStatus);
    setStatus(seedStatus);
    if (seedStatus === "loading") void startSeedLoad();
    return () => { seedListeners.delete(setStatus); };
  }, []);
  return { status, retry: () => { void startSeedLoad(); } };
}

export function useSeedsSettled(): boolean {
  return useSeedStatus().status === "settled";
}

export function useSettledOrgRecords(): Rec[] | null {
  const { org } = useWorkspace();
  const settled = useSeedsSettled();
  // The result is tagged with the settled flag it was read under, so a
  // snapshot taken before the fixtures landed is never shown as complete.
  const result = useLiveQuery(
    () => (settled ? repo.listByOrg(org.id).then((rows) => ({ settled: true, rows })) : { settled: false, rows: [] as Rec[] }),
    [org.id, settled],
  );
  return result?.settled ? result.rows : null;
}

/** Shown in place of counts, exports and erasure when not every application's records could be loaded. */
export function SeedsFailedNotice({ retry }: { retry: () => void }) {
  return (
    <Notice tone="danger" title="Could not load every application">
      <Stack gap={2}>
        <span>
          Counts may be incomplete because some applications' records did not load in this browser. Export and erasure are
          unavailable until every record is known.
        </span>
        <Row gap={2}><Button size="sm" variant="secondary" onClick={retry}>Try again</Button></Row>
      </Stack>
    </Notice>
  );
}
