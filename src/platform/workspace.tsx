import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { Audit, Rec, Role } from "@/domain/types";
import { db } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import { useClock, formatDate, formatDateTime, formatRelative } from "./clock";
import { money as formatMoney, compactMoney } from "./money";
import { orgBySlug, ORGS, type OrgProfile } from "./org";
import * as repo from "./repo";
import { clockIso } from "@/platform/clock";

export const ACTOR_BY_ROLE: Record<Role, string> = {
  owner: "Maya Chen",
  finance: "Jonah Adeyemi",
  sales: "Priya Shah",
  people: "Elena Voss",
  member: "Theo Marsh",
  client: "Amina Rahman",
};

export interface WorkspaceValue {
  org: OrgProfile;
  role: Role;
  actor: string;
  now: Date;
  timezone: string;
  writeContext: (screenId?: string) => repo.WriteContext;
  money: (minor: number | undefined) => string;
  compactMoney: (minor: number | undefined) => string;
  date: (value: string | Date | undefined, options?: Intl.DateTimeFormatOptions) => string;
  dateTime: (value: string | Date | undefined) => string;
  relative: (value: string | Date | undefined) => string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * Audit A05: the organisation is derived from the router, not from a seeded
 * record lookup, so every global surface (search, attention, Ask, tasks)
 * reads the company the person is actually looking at.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const clock = useClock();
  const role = useUi((state) => state.role);
  const matchedOrg = orgBySlug(params.org);
  const org = matchedOrg ?? ORGS[0];
  const now = clock.now();
  const nowIso = now.toISOString();
  // Local companies must never inherit a seeded company's identity.
  // Unassigned role views use the company's owner as the acting local reviewer.
  const actor = org.ownerName ?? ACTOR_BY_ROLE[role];

  const value = useMemo<WorkspaceValue>(() => ({
    org,
    role,
    actor,
    now: new Date(nowIso),
    timezone: org.timezone,
    writeContext: (screenId?: string) => ({ actor, now: clockIso(), screenId }),
    money: (minor) => formatMoney(minor ?? 0, org),
    compactMoney: (minor) => compactMoney(minor ?? 0, org),
    date: (input, options) => formatDate(input, org.locale, options),
    dateTime: (input) => formatDateTime(input, org.locale),
    relative: (input) => formatRelative(input, new Date(nowIso), org.locale),
  }), [org, role, actor, nowIso]);

  if (!matchedOrg) {
    return (
      <main role="alert" style={{ maxWidth: 600, margin: "10vh auto", padding: 32 }}>
        <h1>Organization not found</h1>
        <p>This workspace address does not belong to an available organization. No company records have been opened.</p>
        <Link to="/o/northline/hq/home">Return to the available workspace</Link>
      </main>
    );
  }
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  return value;
}

/* ----------------------------- Reads ----------------------------- */

/** Records of one collection in the active organisation. Indexed query. */
export function useCollection(collection: string): Rec[] {
  const { org } = useWorkspace();
  return useLiveQuery(() => repo.listByCollection(org.id, collection), [org.id, collection]) ?? [];
}

/** Several collections at once without reading the whole database. */
export function useCollections(collections: string[]): Record<string, Rec[]> {
  const { org } = useWorkspace();
  const key = collections.join("|");
  const rows = useLiveQuery(async () => {
    const entries = await Promise.all(collections.map(async (name) => [name, await repo.listByCollection(org.id, name)] as const));
    return Object.fromEntries(entries) as Record<string, Rec[]>;
  }, [org.id, key]);
  return rows ?? Object.fromEntries(collections.map((name) => [name, [] as Rec[]]));
}

/**
 * A record by id, but only if it belongs to the organisation in the address.
 * Ids are global, so without this check a record from another organisation
 * could be read and acted on by changing the address.
 */
export function useRecord(id: string | undefined): Rec | undefined {
  const { org } = useWorkspace();
  const cached = repo.knownRecord(id);
  const initial = cached && cached.organizationId === org.id ? cached : undefined;
  return useLiveQuery(
    async () => {
      if (!id) return undefined;
      const record = await repo.getRecord(id);
      return record && record.organizationId === org.id ? record : undefined;
    },
    [id, org.id],
    initial,
  );
}

export function useChildren(parentId: string | undefined): Rec[] {
  const { org } = useWorkspace();
  return useLiveQuery(() => (parentId ? repo.listChildren(org.id, parentId) : Promise.resolve([])), [org.id, parentId]) ?? [];
}

export function useEvents(entityId?: string, limit = 120): Audit[] {
  const { org } = useWorkspace();
  const rows = useLiveQuery(() => repo.listEvents(org.id, 400), [org.id]) ?? [];
  return useMemo(
    () => (entityId ? rows.filter((event) => event.entityId === entityId) : rows).slice(0, limit),
    [rows, entityId, limit],
  );
}

/** Whole-organisation read, for surfaces that genuinely span collections. */
export function useOrgRecords(): Rec[] {
  const { org } = useWorkspace();
  return useLiveQuery(() => repo.listByOrg(org.id), [org.id]) ?? [];
}

/* ----------------------------- Writes ----------------------------- */

export interface Mutations {
  create: (input: Omit<repo.NewRecordInput, "organizationId" | "currency"> & { currency?: string }, event?: string) => Promise<Rec>;
  patch: (id: string, patch: Partial<Rec>, options?: Omit<repo.PatchOptions, "event" | "expectedOrganizationId"> & { event?: string }) => Promise<Rec | null>;
  remove: (id: string, event?: string) => Promise<void>;
  putMany: (records: Rec[], messages?: string[], expectedRevisions?: Record<string, number>, eventTypes?: ("create" | "update")[]) => Promise<void>;
  confirmReconciliation: (bankAccountCode: string, statementId: string, note: string) => Promise<Rec>;
  log: (message: string, options?: { entityId?: string; type?: string; capability?: Audit["capability"] }) => Promise<void>;
}

export function useMutations(screenId?: string): Mutations {
  const { org, actor } = useWorkspace();
  const pushToast = useUi((state) => state.pushToast);

  const context = useCallback(() => ({ actor, now: clockIso(), screenId }), [actor, screenId]);

  return useMemo<Mutations>(() => ({
    async create(input, event) {
      const ctx = context();
      const record = repo.newRecord({ ...input, organizationId: org.id, currency: input.currency ?? org.currency }, ctx);
      await repo.putRecord(record, ctx, event ? { type: "create", message: event, entityId: record.id } : undefined);
      return record;
    },
    async patch(id, patch, options) {
      const ctx = context();
      try {
        return await repo.patchRecord(id, patch, ctx, {
          ...options,
          expectedOrganizationId: org.id,
          event: options?.event ? { type: "update", message: options.event } : undefined,
        });
      } catch (error) {
        if (error instanceof repo.OrganizationScopeError) {
          pushToast({ title: "Action blocked", body: "This record belongs to a different organization.", tone: "blocked" });
          return null;
        }
        if (error instanceof repo.ConflictError) {
          pushToast({
            title: "This record changed elsewhere",
            body: "Another open surface saved first. Reload the record and apply the change again.",
            tone: "blocked",
          });
          return null;
        }
        throw error;
      }
    },
    async remove(id, event) {
      const ctx = context();
      try {
        await repo.deleteRecord(id, ctx, event ? { type: "delete", message: event } : undefined, org.id);
      } catch (error) {
        if (error instanceof repo.OrganizationScopeError) {
          pushToast({ title: "Action blocked", body: "This record belongs to a different organization.", tone: "blocked" });
          return;
        }
        throw error;
      }
    },
    async putMany(records, messages = [], expectedRevisions = {}, eventTypes: ("create" | "update")[] = []) {
      const ctx = context();
      await repo.putMany(
        records,
        ctx,
        messages.map((message, index) => ({
          type: eventTypes[index] ?? "update",
          message,
          // Match an audit message to its record when callers supply one per
          // record. Other legacy batches retain their old event semantics.
          ...(messages.length === records.length ? { entityId: records[index]?.id } : {}),
        })),
        org.id,
        expectedRevisions,
      );
    },
    async confirmReconciliation(bankAccountCode, statementId, note) {
      const ctx = context();
      return repo.confirmBankReconciliation(org.id, bankAccountCode, statementId, note, ctx);
    },
    async log(message, options) {
      const ctx = context();
      await repo.addEvent({
        organizationId: org.id,
        actor,
        type: options?.type ?? "note",
        message,
        entityId: options?.entityId,
        screenId,
        capability: options?.capability,
      }, ctx);
    },
  }), [org.id, org.currency, actor, screenId, context, pushToast]);
}

/** Toast helper bound to the design-system tone vocabulary. */
export function useToast() {
  const pushToast = useUi((state) => state.pushToast);
  return useCallback(
    (title: string, body: string, tone: "ok" | "blocked" | "failed" | "info" = "ok") => pushToast({ title, body, tone }),
    [pushToast],
  );
}

export { db };
