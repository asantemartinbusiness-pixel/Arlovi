import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Notice, Pill, Properties, Row, Skeleton, Stack } from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";
import { ACCOUNT_TYPE_LABEL, accountCode, accountType, daysOverdue } from "@/domain/fin-ledger";
import type { AccountType } from "@/domain/fin-ledger";
import type { TaxCode } from "@/domain/fin-invoice";

/* ------------------------------------------------------------------ *
 * Finance presentation pieces.
 *
 * Money is right-aligned with tabular figures everywhere. A figure with no
 * source renders as unavailable with its age instead of a number.
 * ------------------------------------------------------------------ */

/** Right-aligned, tabular money. Negatives are parenthesised, accounting style. */
export function Amount({
  minor, context, bold, tone, signed, zero = "—",
}: {
  minor: number | undefined;
  context: ScreenContext;
  bold?: boolean;
  tone?: "danger" | "success" | "muted";
  signed?: boolean;
  zero?: string;
}) {
  if (minor === undefined || minor === null || Number.isNaN(minor)) {
    return <span className="ds-subtle">Unavailable</span>;
  }
  if (minor === 0 && zero !== "0") return <span className="ds-subtle ds-num">{zero}</span>;
  const negative = minor < 0;
  const text = negative ? `(${context.money(Math.abs(minor))})` : signed ? `+${context.money(minor)}` : context.money(minor);
  const color = tone === "danger" || negative ? "var(--danger)" : tone === "success" ? "var(--success)" : tone === "muted" ? "var(--fg-muted)" : undefined;
  return <span className="ds-num" style={{ fontWeight: bold ? 650 : undefined, color }}>{text}</span>;
}

/** A column total row for a grid footer. */
export function GridTotal({ label, minor, context }: { label: string; minor: number; context: ScreenContext }) {
  return (
    <span className="ds-row ds-gap-2">
      <span className="ds-subtle">{label}</span>
      <Amount minor={minor} context={context} bold />
    </span>
  );
}

export function AccountTypePill({ type }: { type: AccountType }) {
  const tone = type === "asset" ? "info" : type === "liability" ? "warning" : type === "equity" ? "accent" : type === "revenue" ? "success" : "neutral";
  return <Pill tone={tone}>{ACCOUNT_TYPE_LABEL[type]}</Pill>;
}

export function AccountLabel({ account }: { account: Rec | undefined }) {
  if (!account) return <span className="ds-subtle">Account missing</span>;
  return (
    <span className="ds-row ds-gap-2">
      <code className="ds-num" style={{ color: "var(--fg-muted)" }}>{accountCode(account)}</code>
      <span className="ds-truncate">{account.title}</span>
      {account.status === "inactive" && <Pill tone="warning">Inactive</Pill>}
    </span>
  );
}

export function accountOptions(accounts: Rec[], includeInactive = false): Rec[] {
  return accounts
    .filter((account) => includeInactive || account.status !== "inactive")
    .sort((a, b) => accountCode(a).localeCompare(accountCode(b)));
}

export function accountById(accounts: Rec[], id: string | undefined): Rec | undefined {
  return id ? accounts.find((account) => account.id === id) : undefined;
}

export function accountByCodeIn(accounts: Rec[], code: string): Rec | undefined {
  return accounts.find((account) => accountCode(account) === code);
}

/** The honest state of a provider this screen would otherwise pretend to use. */
export function CapabilityNotice({ id, title }: { id: string; title?: string }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return (
    <Notice tone={CAPABILITY_TONE[capability.state]} title={title ?? `${capability.label}: ${CAPABILITY_LABELS[capability.state]}`}>
      {capability.note} {capability.localEquivalent}
    </Notice>
  );
}

export function CapabilityPill({ id }: { id: string }) {
  const capability = capabilityById(id);
  if (!capability) return null;
  return <Pill tone={CAPABILITY_TONE[capability.state]} dot>{CAPABILITY_LABELS[capability.state]}</Pill>;
}

export function TaxCodePill({ code }: { code: TaxCode }) {
  if (code.code === "UNKNOWN") {
    return (
      <Pill tone="danger" dot>
        <AlertTriangle size={12} aria-hidden="true" /> {code.code}
      </Pill>
    );
  }
  return <Pill tone={code.rateBp > 0 ? "info" : code.reportable ? "neutral" : "warning"}>{code.code}</Pill>;
}

export function taxRateText(code: TaxCode, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 3 }).format(code.rateBp / 10_000);
}

export function OverdueBadge({ record, context }: { record: Rec; context: ScreenContext }) {
  const days = daysOverdue(record, context.now);
  if (!days) return <span className="ds-subtle">{context.date(record.dueAt)}</span>;
  return (
    <span className="ds-row ds-gap-2">
      <span className="ds-num">{context.date(record.dueAt)}</span>
      <Pill tone={days > 30 ? "danger" : "warning"}>{days}d late</Pill>
    </span>
  );
}

export const INVOICE_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger" | "accent"> = {
  draft: "neutral",
  awaiting_payment: "info",
  part_paid: "info",
  paid: "success",
  void: "warning",
  overdue: "danger",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={INVOICE_STATUS_TONE[status] ?? "neutral"} dot>{INVOICE_STATUS_LABEL[status] ?? status.replace(/_/g, " ")}</Pill>;
}

/** Where a figure came from, stated plainly beneath it. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{children}</p>;
}

export function StatementRow({ rows, context }: { rows: { label: string; minor?: number; bold?: boolean; note?: string; indent?: boolean }[]; context: ScreenContext }) {
  return (
    <table className="ds-table">
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.label}-${index}`}>
            <th scope="row" style={{ textAlign: "start", fontWeight: row.bold ? 650 : 400, paddingInlineStart: row.indent ? "var(--space-5)" : undefined }}>
              {row.label}
              {row.note && <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{row.note}</span>}
            </th>
            <td data-align="end"><Amount minor={row.minor} context={context} bold={row.bold} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LedgerHealth({ context, booksBalance, equationHolds, difference }: {
  context: ScreenContext;
  booksBalance: boolean;
  equationHolds: boolean;
  difference: number;
}) {
  if (booksBalance && equationHolds) {
    return (
      <Row gap={2}>
        <Pill tone="success" dot>Books balance</Pill>
        <span className="ds-subtle">Posted debits equal posted credits and assets equal liabilities plus equity.</span>
      </Row>
    );
  }
  return (
    <Notice tone="danger" title="The posted ledger does not tie">
      <Stack gap={2}>
        <span>Debits and credits differ by {context.money(Math.abs(difference))}. Statements on this workspace are shown with the difference rather than forced to balance.</span>
        <Properties rows={[
          { label: "Debits equal credits", value: booksBalance ? "Yes" : "No" },
          { label: "Accounting equation holds", value: equationHolds ? "Yes" : "No" },
        ]} />
      </Stack>
    </Notice>
  );
}

/**
 * Shown in place of ledger figures until the posted books are fully read, so a
 * total is never printed from a partial ledger and then silently changed.
 */
export function BooksLoading({ what = "posted journals" }: { what?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <Stack gap={2}>
        <span className="ds-subtle">Reading the {what}…</span>
        <Skeleton height={14} width="60%" />
        <Skeleton height={14} width="40%" />
      </Stack>
    </div>
  );
}

export function TypeTotals({ rows, context }: { rows: { type: AccountType; minor: number }[]; context: ScreenContext }) {
  return (
    <Row gap={4} wrap>
      {rows.map((row) => (
        <span key={row.type} className="ds-row ds-gap-2">
          <AccountTypePill type={row.type} />
          <Amount minor={row.minor} context={context} bold />
        </span>
      ))}
    </Row>
  );
}

export function groupByType(accounts: Rec[]): { type: AccountType; accounts: Rec[] }[] {
  return (["asset", "liability", "equity", "revenue", "expense"] as AccountType[]).map((type) => ({
    type,
    accounts: accountOptions(accounts, true).filter((account) => accountType(account) === type),
  }));
}
