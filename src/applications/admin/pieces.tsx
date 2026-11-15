import { useMemo, useState, type ReactNode } from "react";
import { Button, Field, Notice, Pill, Properties, Row, Stack, TextInput } from "@/design-system";
import { applications } from "@/app/catalog";
import { canOpen, can as roleCan, ROLE_LABELS, type Capability } from "@/platform/policy";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec, Role } from "@/domain/types";

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
