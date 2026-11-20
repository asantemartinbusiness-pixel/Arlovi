import { useId, type ReactNode } from "react";
import { Button, Notice, OverlayActions, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";

/** Shared footer for an overlay that submits an owned form: primary first, dismiss at the end. */
export const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

/**
 * The one honest sentence about role views, shown wherever a screen hides a
 * sensitive field. Role views shape the interface; the records are all in this
 * browser and no server enforces anything.
 */
export function RoleViewNote({ what }: { what: string }) {
  return (
    <Notice tone="warning" title="Role views are not an account security boundary">
      {what} is hidden from this role view so it is not shown by accident on a shared screen.
      Everything in this workspace lives in one browser database; a future service would have to enforce access on the server.
    </Notice>
  );
}

const EMPLOYMENT_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  active: "success", probation: "info", notice: "warning", alumni: "neutral", contractor: "accent",
};

export function EmploymentPill({ record }: { record: Rec }) {
  const employment = String(record.fields.employment ?? "");
  const label = record.status === "active" && employment === "contractor" ? "Contractor" : record.status;
  return <Pill tone={EMPLOYMENT_TONE[record.status] ?? "neutral"} dot>{label.charAt(0).toUpperCase() + label.slice(1)}</Pill>;
}

export function peopleFullName(record: Rec): string {
  return record.title;
}

/** Annual salary, or an explicit refusal when the role view does not hold it. */
export function salaryText(context: ScreenContext, record: Rec): string {
  if (!context.can("view_payroll")) return "Hidden in this role view";
  const minor = Number(record.fields.salaryMinor ?? 0);
  if (!minor) return "Not recorded";
  return `${context.money(minor)} ${String(record.fields.salaryBasis ?? "annual")}`;
}

export interface LeaveBalance { allowance: number; taken: number; left: number; known: boolean }

/**
 * A balance is only a balance when an allowance was recorded. Without one the
 * screens say so rather than showing a confident zero.
 */
export function leaveBalance(record: Rec): LeaveBalance {
  const known = record.fields.leaveAllowance !== undefined;
  const allowance = Number(record.fields.leaveAllowance ?? 0);
  const taken = Number(record.fields.leaveTaken ?? 0);
  return { allowance, taken, left: Math.max(0, allowance - taken), known };
}

/**
 * The strip above a People workspace: this screen's own actions and the one
 * honest boundary sentence. The page already names itself in its h1, so the
 * old restating headline and description are gone; `title` stays as the
 * strip's accessible name.
 */
export function PeopleHeader({ title, actions, note }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const noteId = useId();
  if (!actions && !note) return null;
  return (
    <section className="hr-bar" aria-labelledby={note ? noteId : undefined} aria-label={note ? undefined : title}>
      {note && <p className="hr-bar-note" id={noteId}>{note}</p>}
      {actions && <div className="hr-bar-actions">{actions}</div>}
    </section>
  );
}
