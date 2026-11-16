import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, RotateCcw, Trash2, Unlock } from "lucide-react";
import {
  Button, Card, DataGrid, Empty, Field, Grid, MoneyInput, Notice, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import {
  accountCode, accountType, checkPosting, isReversedBy, journalDate, journalLines, journalMemo,
  lockedPeriods, periodLabel, periodOf, reversalLines, reversesId,
} from "@/domain/fin-ledger";
import type { JLine, PostCheck } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import { AccountLabel, Amount, SourceNote } from "./parts";
import { clockIso, wallMs } from "@/platform/clock";

/* ---------------------------- FIN-003 ---------------------------- */

interface DraftLine extends JLine {
  key: string;
}

function toDraft(lines: JLine[]): DraftLine[] {
  return lines.map((line, index) => ({ ...line, key: `k${index}` }));
}

function blank(index: number): DraftLine {
  return { key: `k${wallMs().toString(36)}${index}`, accountId: "", debitMinor: 0, creditMinor: 0, memo: "" };
}

/**
 * The journal entry editor. Debits and credits are entered side by side, the
 * running difference is always visible, and `Post` stays disabled until
 * `checkPosting` has nothing left to object to.
 */
export function JournalForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string; from?: { date?: string; memo?: string; lines?: JLine[] } } | undefined;
  const existing = useRecord(payload?.id);
  const readOnly = existing?.status === "posted" || existing?.status === "reversed";

  const [date, setDate] = useState(payload?.from?.date ?? now.toISOString().slice(0, 10));
  const [memo, setMemo] = useState(payload?.from?.memo ?? "");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(toDraft(payload?.from?.lines ?? [{ accountId: "", debitMinor: 0, creditMinor: 0 }, { accountId: "", debitMinor: 0, creditMinor: 0 }]));
  const [busy, setBusy] = useState<"save" | "post" | undefined>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!existing) return;
    setDate(journalDate(existing));
    setMemo(journalMemo(existing));
    setReference(String(existing.fields.reference ?? ""));
    setLines(toDraft(journalLines(existing)));
  }, [existing]);

  const options = useMemo(
    () => data.accounts.filter((account) => account.status !== "inactive" || lines.some((line) => line.accountId === account.id)),
    [data.accounts, lines],
  );
  const period = periodOf(date);
  const check = checkPosting({ lines, period, locked: data.locked, accounts: data.accounts });

  function update(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save(post: boolean) {
    setError(undefined);
    setBusy(post ? "post" : "save");
    try {
      const body = { date, memo: memo || "Journal entry", lines: lines.map(({ key: _key, ...line }) => line) };
      const amount = lines.reduce((sum, line) => sum + line.debitMinor, 0);
      const recheck = checkPosting({ lines, period: periodOf(date), locked: data.locked, accounts: data.accounts });
      if (post && recheck.reason) { setError(recheck.reason); setBusy(undefined); return; }
      const fields: Record<string, string | number | boolean> = { date, source: "manual" };
      if (reference) fields.reference = reference;
      if (post) { fields.postedBy = context.actor; fields.postedAt = clockIso(); }
      if (existing) {
        /* A journal keeps its title when it is saved or posted: the narrative
           is its memo, and approvals and links name the journal by title. */
        const saved = await context.mutate.patch(existing.id, {
          title: existing.title,
          status: post ? "posted" : "draft",
          summary: memo || existing.summary,
          amountMinor: amount,
          at: `${date}T09:00:00.000Z`,
          body,
          fields: { ...existing.fields, ...fields },
        }, { expectRevision: existing.revision, event: post ? `Posted journal ${existing.title}` : `Draft journal ${existing.title} saved` });
        if (!saved) { setBusy(undefined); return; }
      } else {
        await context.mutate.create({
          collection: "journals",
          title: memo || "Journal entry",
          status: post ? "posted" : "draft",
          summary: memo || "Manual journal entry.",
          amountMinor: amount,
          at: `${date}T09:00:00.000Z`,
          tags: ["ledger", "manual"],
          fields,
          body,
        }, post ? `Posted journal ${memo}` : `Draft journal ${memo} created`);
      }
      context.toast(
        post ? "Journal posted" : "Draft saved",
        post
          ? `${context.money(amount)} on each side, dated ${context.date(date)}. It is now in the trial balance and cannot be edited.`
          : "Nothing has moved in the trial balance. A draft is excluded from every statement until it is posted.",
      );
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The journal could not be saved.");
    } finally {
      setBusy(undefined);
    }
  }

  if (readOnly && existing) {
    return <PostedJournal context={context} journal={existing} close={close} />;
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="Ledger date" required hint={`Posts into ${periodLabel(period, org.locale)}`}>
          <TextInput aria-label="Ledger date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Field label="Reference" hint="Optional. Your own numbering or a document id.">
          <TextInput aria-label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="JNL-0094" />
        </Field>
        <Field label="Narrative" required hint={existing ? `What this entry records. The journal keeps its title, ${existing.title}.` : "What this entry records. It becomes the journal title."}>
          <TextInput aria-label="Narrative" value={memo} onChange={(event) => setMemo(event.target.value)} required />
        </Field>
      </Row>

      {data.locked.includes(period) && (
        <Notice tone="danger" title={`${periodLabel(period, org.locale)} is closed`}>
          Posting into a closed period would change a statement that has already been signed off. Choose a date in an open period, or reopen the month from the Periods tab.
        </Notice>
      )}

      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Journal lines</caption>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Account</th>
                <th style={{ minWidth: 160 }}>Line memo</th>
                <th data-align="end" style={{ width: 160 }}>Debit</th>
                <th data-align="end" style={{ width: 160 }}>Credit</th>
                <th style={{ width: 48 }}><span className="ds-sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>
                    <Select
                      aria-label={`Account for line ${index + 1}`}
                      value={line.accountId}
                      onChange={(event) => update(line.key, { accountId: event.target.value })}
                    >
                      <option value="">Choose an account</option>
                      {options.map((account) => (
                        <option key={account.id} value={account.id}>
                          {accountCode(account)} {account.title}{account.status === "inactive" ? " (deactivated)" : ""}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <TextInput aria-label={`Memo for line ${index + 1}`} value={line.memo ?? ""} onChange={(event) => update(line.key, { memo: event.target.value })} />
                  </td>
                  <td data-align="end">
                    <MoneyInput
                      label={`Debit on line ${index + 1}`}
                      currency={org.currency}
                      valueMinor={line.debitMinor}
                      onChangeMinor={(minor) => update(line.key, { debitMinor: minor, creditMinor: minor > 0 ? 0 : line.creditMinor })}
                    />
                  </td>
                  <td data-align="end">
                    <MoneyInput
                      label={`Credit on line ${index + 1}`}
                      currency={org.currency}
                      valueMinor={line.creditMinor}
                      onChangeMinor={(minor) => update(line.key, { creditMinor: minor, debitMinor: minor > 0 ? 0 : line.debitMinor })}
                    />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length <= 2}
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2} style={{ textAlign: "start" }}>Totals</th>
                <td data-align="end"><Amount minor={check.debitMinor} context={context} bold /></td>
                <td data-align="end"><Amount minor={check.creditMinor} context={context} bold /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="ds-grid-foot">
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, blank(current.length)])}>Add line</Button>
          <BalanceBadge check={check} context={context} />
        </div>
      </div>

      {check.reason && <Notice tone={check.balanced ? "warning" : "danger"} title="This journal cannot be posted yet">{check.reason}</Notice>}
      {!check.reason && <Notice tone="success" title="Balanced">Debits and credits both come to {context.money(check.debitMinor)}. Posting is irreversible: a posted entry is corrected by a reversal, not an edit.</Notice>}
      {error && <Notice tone="danger" title="Saving failed">{error}</Notice>}

      <Row gap={2} wrap>
        <Button
          variant="primary"
          busy={busy === "post"}
          disabled={Boolean(check.reason) || !memo.trim() || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : check.reason}
          onClick={() => save(true)}
        >
          Post to the ledger
        </Button>
        <Button variant="secondary" busy={busy === "save"} disabled={!memo.trim()} onClick={() => save(false)}>Save as draft</Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
      {!context.can("post_journal") && (
        <SourceNote>Your role view cannot post. It shapes what this interface offers and is not an account security boundary.</SourceNote>
      )}
    </Stack>
  );
}

function BalanceBadge({ check, context }: { check: PostCheck; context: ScreenContext }) {
  if (check.differenceMinor === null) {
    return <Pill tone="danger" dot>Each line needs one side only</Pill>;
  }
  if (check.differenceMinor === 0 && check.debitMinor > 0) {
    return <Pill tone="success" dot>Balanced · {context.money(check.debitMinor)}</Pill>;
  }
  return (
    <span className="ds-row ds-gap-2">
      <Pill tone="warning" dot>Out by {context.money(Math.abs(check.differenceMinor))}</Pill>
      <span className="ds-subtle">{check.differenceMinor > 0 ? "Credits are short" : "Debits are short"}</span>
    </span>
  );
}

function PostedJournal({ context, journal, close }: { context: ScreenContext; journal: Rec; close: () => void }) {
  const data = useFinData();
  const reversal = isReversedBy(journal, data.journals);
  const reverses = reversesId(journal);
  const lines = journalLines(journal);
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A posted journal is immutable">
        It is in the trial balance, so its lines cannot be edited. A mistake is corrected by posting an offsetting reversal, which leaves both entries on the record.
      </Notice>
      <Properties rows={[
        { label: "Journal", value: journal.title },
        { label: "Ledger date", value: <span className="ds-num">{context.date(journalDate(journal))}</span> },
        { label: "Period", value: periodOf(journalDate(journal)) },
        { label: "Status", value: <Pill tone={journal.status === "reversed" ? "warning" : "success"} dot>{journal.status}</Pill> },
        { label: "Posted by", value: String(journal.fields.postedBy ?? journal.createdBy ?? journal.updatedBy) },
        { label: "Narrative", value: journalMemo(journal) },
        ...(reverses ? [{ label: "Reverses", value: reverses }] : []),
        ...(reversal ? [{ label: "Reversed by", value: reversal.title }] : []),
      ]} />
      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">{journal.title} lines</caption>
            <thead><tr><th>Account</th><th>Memo</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.accountId}-${index}`}>
                  <td className="ds-table-primary"><AccountLabel account={data.accounts.find((account) => account.id === line.accountId)} /></td>
                  <td className="ds-subtle">{line.memo ?? "—"}</td>
                  <td data-align="end"><Amount minor={line.debitMinor} context={context} /></td>
                  <td data-align="end"><Amount minor={line.creditMinor} context={context} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={2} style={{ textAlign: "start" }}>Totals</th>
                <td data-align="end"><Amount minor={debit} context={context} bold /></td>
                <td data-align="end"><Amount minor={lines.reduce((sum, line) => sum + line.creditMinor, 0)} context={context} bold /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <Row gap={2}>
        {journal.status === "posted" && !reversal && (
          <Button variant="outline-danger" icon={<RotateCcw size={15} />} onClick={() => context.openOverlay("reverse confirmation", { id: journal.id })}>
            Reverse this journal
          </Button>
        )}
        {reversal && <Pill tone="warning">Already reversed by {reversal.title}</Pill>}
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

/* ----------------------------- Tabs ----------------------------- */

export function LedgerEntries({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [period, setPeriod] = useState<string>("all");
  const [accountId, setAccountId] = useState<string>("all");

  const rows = useMemo(() => {
    const out: { id: string; journal: Rec; line: JLine; account?: Rec }[] = [];
    for (const journal of data.journals) {
      if (journal.status !== "posted") continue;
      if (period !== "all" && periodOf(journalDate(journal)) !== period) continue;
      journalLines(journal).forEach((line, index) => {
        if (accountId !== "all" && line.accountId !== accountId) return;
        out.push({ id: `${journal.id}-${index}`, journal, line, account: data.accounts.find((account) => account.id === line.accountId) });
      });
    }
    return out.sort((a, b) => journalDate(b.journal).localeCompare(journalDate(a.journal)) || a.id.localeCompare(b.id));
  }, [data.journals, data.accounts, period, accountId]);

  const debit = rows.reduce((sum, row) => sum + row.line.debitMinor, 0);
  const credit = rows.reduce((sum, row) => sum + row.line.creditMinor, 0);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Lines shown" value={String(rows.length)} meta={`${data.postedCount} posted journals in total`} />
        <Stat prov="posted" label="Debits" value={context.money(debit)} />
        <Stat prov="posted" label="Credits" value={context.money(credit)} meta={debit === credit ? "Equal" : `Out by ${context.money(Math.abs(debit - credit))}`} />
        <Stat prov="human" label="Drafts excluded" value={String(data.draftJournals.length)} meta="A draft is in no statement" />
      </StatRow>

      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="General ledger entries"
        toolbar={
          <>
            <Select aria-label="Period" value={period} onChange={(event) => setPeriod(event.target.value)} style={{ maxWidth: 170, minHeight: "var(--control-h-sm)" }}>
              <option value="all">Every period</option>
              {data.periods.map((item) => <option key={item} value={item}>{periodLabel(item, org.locale)}</option>)}
            </Select>
            <Select aria-label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)} style={{ maxWidth: 230, minHeight: "var(--control-h-sm)" }}>
              <option value="all">Every account</option>
              {data.accounts.map((account) => <option key={account.id} value={account.id}>{accountCode(account)} {account.title}</option>)}
            </Select>
          </>
        }
        columns={[
          { key: "date", header: "Date", width: "112px", cell: (row) => <span className="ds-num">{context.date(journalDate(row.journal))}</span>, sortValue: (row) => journalDate(row.journal), filterValue: (row) => journalDate(row.journal) },
          { key: "journal", header: "Journal", primary: true, cell: (row) => (
            <span>
              {row.journal.title}
              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{row.line.memo ?? journalMemo(row.journal)}</span>
            </span>
          ), sortValue: (row) => row.journal.title, filterValue: (row) => `${row.journal.title} ${row.line.memo ?? ""} ${journalMemo(row.journal)}` },
          { key: "account", header: "Account", cell: (row) => <AccountLabel account={row.account} />, filterValue: (row) => row.account ? `${accountCode(row.account)} ${row.account.title}` : "", hideBelow: 900 },
          { key: "source", header: "Provenance", hideBelow: 1200, cell: (row) => (
            <Pill tone={row.journal.fields.source === "manual" ? "neutral" : "info"}>
              {String(row.journal.fields.source ?? (row.journal.tags.includes("intercompany") ? "intercompany" : "seeded"))}
            </Pill>
          ) },
          { key: "debit", header: "Debit", align: "end", cell: (row) => <Amount minor={row.line.debitMinor} context={context} />, sortValue: (row) => row.line.debitMinor },
          { key: "credit", header: "Credit", align: "end", cell: (row) => <Amount minor={row.line.creditMinor} context={context} />, sortValue: (row) => row.line.creditMinor },
        ]}
        onOpen={(id) => {
          const row = rows.find((item) => item.id === id);
          if (row) { context.select(row.journal.id); context.openOverlay("Journal form", { id: row.journal.id }); }
        }}
        summary={<>
          <Amount minor={debit} context={context} bold />
          <span className="ds-subtle">/</span>
          <Amount minor={credit} context={context} bold />
        </>}
        empty={<Empty title="No posted lines in this view">Change the period or account filter, or post a journal from the Journals tab.</Empty>}
      />
      <SourceNote>Every line above comes from a posted journal in this browser. Drafts are listed separately under Journals.</SourceNote>
    </Stack>
  );
}

export function LedgerJournals({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const sorted = useMemo(
    () => [...data.journals].sort((a, b) => journalDate(b).localeCompare(journalDate(a))),
    [data.journals],
  );

  return (
    <Stack gap={4}>
      {data.draftJournals.length > 0 && (
        <Notice tone="info" title={`${data.draftJournals.length} draft ${data.draftJournals.length === 1 ? "journal is" : "journals are"} waiting`}>
          A draft is excluded from the trial balance, the profit and loss and the balance sheet. Open one to check it balances and post it.
        </Notice>
      )}
      <DataGrid
        rows={sorted}
        rowId={(row) => row.id}
        label="Journals"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => {
          if (row.status !== "draft") return undefined;
          const check = checkPosting({ lines: journalLines(row), period: periodOf(journalDate(row)), locked: data.locked, accounts: data.accounts });
          return check.reason ? "danger" : "warning";
        }}
        columns={[
          { key: "date", header: "Date", width: "112px", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span>, sortValue: (row) => journalDate(row) },
          { key: "title", header: "Journal", primary: true, cell: (row) => (
            <span>
              {row.title}
              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{journalMemo(row)}</span>
            </span>
          ), sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${journalMemo(row)}` },
          { key: "lines", header: "Lines", align: "end", hideBelow: 900, cell: (row) => <span className="ds-num">{journalLines(row).length}</span> },
          { key: "status", header: "State", cell: (row) => {
            if (row.status === "posted") return isReversedBy(row, data.journals) ? <Pill tone="warning" dot>Reversed</Pill> : <Pill tone="success" dot>Posted</Pill>;
            if (row.status === "reversed") return <Pill tone="warning" dot>Reversed</Pill>;
            const check = checkPosting({ lines: journalLines(row), period: periodOf(journalDate(row)), locked: data.locked, accounts: data.accounts });
            return check.reason ? <Pill tone="danger" dot>Draft · unpostable</Pill> : <Pill tone="info" dot>Draft · balanced</Pill>;
          }, filterValue: (row) => row.status },
          { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={journalLines(row).reduce((sum, line) => sum + line.debitMinor, 0)} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        ]}
        onOpen={(id) => { context.select(id); context.openOverlay("Journal form", { id }); }}
        bulkActions={[
          {
            label: "Post the balanced drafts",
            disabled: (selected) => !context.can("post_journal") || selected.every((row) => row.status !== "draft"),
            onRun: async (selected) => {
              let posted = 0;
              let refused = 0;
              for (const journal of selected) {
                if (journal.status !== "draft") continue;
                const check = checkPosting({ lines: journalLines(journal), period: periodOf(journalDate(journal)), locked: data.locked, accounts: data.accounts });
                if (check.reason) { refused += 1; continue; }
                await context.mutate.patch(journal.id, { status: "posted", fields: { ...journal.fields, postedBy: context.actor, postedAt: clockIso() } }, { expectRevision: journal.revision, event: `Posted journal ${journal.title}` });
                posted += 1;
              }
              context.toast(
                posted ? "Journals posted" : "Nothing was posted",
                `${posted} posted. ${refused} refused because they are unbalanced or in a closed period.`,
                refused && !posted ? "blocked" : "ok",
              );
            },
          },
        ]}
      />
    </Stack>
  );
}

export function LedgerPeriods({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const [busy, setBusy] = useState<string>();

  const periods = useMemo(() => {
    const set = new Set<string>([...data.periods, ...data.locked, data.currentPeriod]);
    return [...set].sort().reverse();
  }, [data.periods, data.locked, data.currentPeriod]);

  async function toggle(period: string, lock: boolean) {
    const record = data.periodRecord;
    if (!record) {
      context.toast("No period record", "This workspace has no accounting-period record to write to.", "failed");
      return;
    }
    if (!/^\\d{4}-\\d{2}$/.test(period) || (lock && lockedPeriods(record).includes(period))
      || (!lock && !lockedPeriods(record).includes(period))) return;
    setBusy(period);
    try {
      const current = lockedPeriods(record);
      const next = lock ? [...new Set([...current, period])].sort() : current.filter((item) => item !== period);
      const body = record.body as Record<string, unknown> | undefined;
      const changed = await context.mutate.patch(record.id, {
        body: {
          ...(body ?? {}),
          locked: next,
          closedBy: { ...((body?.closedBy as Record<string, string>) ?? {}), ...(lock ? { [period]: context.actor } : {}) },
          closedAt: { ...((body?.closedAt as Record<string, string>) ?? {}), ...(lock ? { [period]: clockIso() } : {}) },
          reopenedBy: { ...((body?.reopenedBy as Record<string, string>) ?? {}), ...(!lock ? { [period]: context.actor } : {}) },
          reopenedAt: { ...((body?.reopenedAt as Record<string, string>) ?? {}), ...(!lock ? { [period]: clockIso() } : {}) },
        },
      }, { expectRevision: record.revision, event: lock ? `Closed period ${period}` : `Reopened period ${period}` });
      // The mutation returns null after a stale-revision conflict. Never
      // announce a close or reopen that did not actually reach storage.
      if (!changed) return;
      context.toast(
        lock ? "Period closed" : "Period reopened",
        lock ? `No new journal can be posted into ${period} until it is reopened.`
          : `${period} accepts postings again. Existing issued statements may no longer agree.`,
      );
    } catch (error) {
      context.toast("Period change not saved", error instanceof Error ? error.message : "Reload the accounting periods and retry.", "failed");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Closing a period is a local control">
        It stops the posting gate in this workspace from accepting a date inside the month. It is not a filing and nothing is submitted anywhere.
      </Notice>
      <DataGrid
        rows={periods.map((period) => ({
          period,
          locked: data.locked.includes(period),
          journals: data.journals.filter((journal) => journal.status === "posted" && periodOf(journalDate(journal)) === period),
          drafts: data.journals.filter((journal) => journal.status === "draft" && periodOf(journalDate(journal)) === period),
        }))}
        rowId={(row) => row.period}
        label="Accounting periods"
        filterable={false}
        columns={[
          { key: "period", header: "Period", primary: true, cell: (row) => periodLabel(row.period, org.locale), sortValue: (row) => row.period },
          { key: "state", header: "State", cell: (row) => row.locked ? <Pill tone="warning" dot>Closed</Pill> : <Pill tone="success" dot>Open</Pill> },
          { key: "posted", header: "Posted", align: "end", cell: (row) => <span className="ds-num">{row.journals.length}</span> },
          { key: "drafts", header: "Drafts", align: "end", cell: (row) => <span className="ds-num">{row.drafts.length}</span> },
          { key: "value", header: "Posted value", align: "end", cell: (row) => <Amount minor={row.journals.reduce((sum, journal) => sum + journalLines(journal).reduce((inner, line) => inner + line.debitMinor, 0), 0)} context={context} /> },
          { key: "action", header: "", cell: (row) => (
            <Button
              size="sm"
              variant={row.locked ? "secondary" : "ghost"}
              icon={row.locked ? <Unlock size={14} /> : <Lock size={14} />}
              busy={busy === row.period}
              disabled={!context.can("post_journal")}
              onClick={() => toggle(row.period, !row.locked)}
            >
              {row.locked ? "Reopen" : "Close"}
            </Button>
          ) },
        ]}
      />
      {data.periodRecord && (
        <Properties rows={[
          { label: "Year end", value: String(data.periodRecord.fields.yearEnd ?? "Not set") },
          { label: "Closed by", value: Object.entries(((data.periodRecord.body as { closedBy?: Record<string, string> })?.closedBy) ?? {}).map(([period, actor]) => `${period}: ${actor}`).join(" · ") || "Nothing closed" },
        ]} />
      )}
    </Stack>
  );
}

export function LedgerAudit({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const events = useEvents(undefined, 200);
  const financeEvents = events.filter((event) =>
    event.type.startsWith("finance")
    || /journal|ledger|period|invoice|payment|reconcil/i.test(event.message));

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Recorded events" value={String(financeEvents.length)} meta="Finance-related entries in this browser" />
        <Stat prov="posted" label="Posted journals" value={String(data.postedCount)} />
        <Stat prov="posted" label="Reversals" value={String(data.journals.filter((journal) => reversesId(journal)).length)} meta="Each one leaves both entries on the record" />
        <Stat prov="posted" label="Closed periods" value={String(data.locked.length)} />
      </StatRow>
      {financeEvents.length === 0 ? (
        <Empty title="No finance events recorded yet">Posting a journal, issuing an invoice or closing a period writes an entry here.</Empty>
      ) : (
        <DataGrid
          rows={financeEvents}
          rowId={(row) => row.id}
          label="Finance audit trail"
          columns={[
            { key: "at", header: "When", width: "170px", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor, filterValue: (row) => row.actor },
            { key: "message", header: "What", primary: true, cell: (row) => row.message, filterValue: (row) => row.message },
            { key: "screen", header: "From", hideBelow: 1200, cell: (row) => <span className="ds-subtle">{row.screenId ?? "—"}</span> },
            { key: "capability", header: "State", cell: (row) => row.capability ? <Pill tone={row.capability === "ready_local" ? "success" : "warning"}>{row.capability.replace(/_/g, " ")}</Pill> : <span className="ds-subtle">—</span> },
          ]}
        />
      )}
    </Stack>
  );
}

/* ------------------------ Ledger overlays ----------------------- */

export function BalancingValidator({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const drafts = data.draftJournals;
  const checks = drafts.map((journal) => ({
    journal,
    check: checkPosting({ lines: journalLines(journal), period: periodOf(journalDate(journal)), locked: data.locked, accounts: data.accounts }),
  }));
  const bad = checks.filter((item) => item.check.reason);

  return (
    <Stack gap={4}>
      <Notice tone={bad.length ? "warning" : "success"} title={bad.length ? `${bad.length} of ${checks.length} drafts cannot be posted` : "Every draft balances"}>
        The same check runs when you press Post. It never rounds a difference away.
      </Notice>
      {checks.length === 0 ? <Empty title="No drafts to validate" /> : (
        <Stack gap={3}>
          {checks.map(({ journal, check }) => (
            <Card prov="posted" key={journal.id} title={journal.title} subtitle={`${context.date(journalDate(journal))} · ${journalLines(journal).length} lines`}
              actions={check.reason ? <Pill tone="danger" dot>Blocked</Pill> : <Pill tone="success" dot>Ready</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Journal form", { id: journal.id })}>Open the editor</Button>}
            >
              <Properties rows={[
                { label: "Debits", value: <Amount minor={check.debitMinor} context={context} /> },
                { label: "Credits", value: <Amount minor={check.creditMinor} context={context} /> },
                { label: "Difference", value: check.differenceMinor === null ? "Not computable" : <Amount minor={check.differenceMinor} context={context} bold /> },
                { label: "Verdict", value: check.reason ?? "Debits equal credits and the period is open." },
              ]} />
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function ReverseConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const journal = data.journals.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!journal) return <Empty title="Select a posted journal first">Open a journal from the Entries or Journals tab, then reverse it.</Empty>;
  if (journal.status !== "posted") {
    return <Notice tone="warning" title="Only a posted journal can be reversed">{journal.title} is {journal.status}.</Notice>;
  }
  const already = isReversedBy(journal, data.journals);
  if (already) {
    return <Notice tone="warning" title="This journal is already reversed">{already.title} offsets it. Posting a second reversal would double the correction.</Notice>;
  }

  const lines = reversalLines(journal);
  const period = periodOf(date);
  const check = checkPosting({ lines, period, locked: data.locked, accounts: data.accounts });

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A reversal adds an entry, it does not remove one">
        {journal.title} stays in the ledger and is marked reversed. The offsetting journal below is posted with today&apos;s date so the audit trail shows when the correction was made.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Reversal date" required hint={`Posts into ${period}`}>
          <TextInput aria-label="Reversal date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Field label="Why" required hint="Recorded on the reversal and in the audit trail.">
          <TextInput aria-label="Why" value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Posted to the wrong account" />
        </Field>
      </Row>
      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Reversal lines</caption>
            <thead><tr><th>Account</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.accountId}-${index}`}>
                  <td className="ds-table-primary"><AccountLabel account={data.accounts.find((account) => account.id === line.accountId)} /></td>
                  <td data-align="end"><Amount minor={line.debitMinor} context={context} /></td>
                  <td data-align="end"><Amount minor={line.creditMinor} context={context} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {check.reason && <Notice tone="danger" title="The reversal cannot be posted">{check.reason}</Notice>}
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          disabled={Boolean(check.reason) || !reason.trim() || !context.can("post_journal")}
          onClick={async () => {
            setBusy(true);
            const created = await context.mutate.create({
              collection: "journals",
              title: `Reversal · ${journal.title}`,
              status: "posted",
              summary: reason,
              amountMinor: lines.reduce((sum, line) => sum + line.debitMinor, 0),
              at: `${date}T09:00:00.000Z`,
              parentId: journal.id,
              tags: ["ledger", "reversal"],
              fields: { date, source: "reversal", reversesId: journal.id, reason },
              body: { date, memo: `Reversal of ${journal.title}: ${reason}`, lines, reversesId: journal.id },
            }, `Reversed ${journal.title}`);
            await context.mutate.patch(journal.id, {
              status: "reversed",
              fields: { ...journal.fields, reversedBy: created.id, reversedAt: `${date}T09:00:00.000Z` },
            }, { expectRevision: journal.revision, event: `${journal.title} marked reversed` });
            context.toast("Reversal posted", `${created.title} is in the ledger. The original stays on the record, marked reversed.`);
            setBusy(false);
            close();
          }}
        >
          Post the reversal
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function JournalSearch({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const [query, setQuery] = useState("");
  const [min, setMin] = useState(0);
  const needle = query.trim().toLowerCase();
  const results = data.journals.filter((journal) => {
    const amount = journalLines(journal).reduce((sum, line) => sum + line.debitMinor, 0);
    if (amount < min) return false;
    if (!needle) return true;
    const haystack = `${journal.title} ${journalMemo(journal)} ${String(journal.fields.reference ?? "")} ${journalLines(journal).map((line) => line.memo ?? "").join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <Stack gap={4}>
      <Grid>
        <div className="ds-col-8">
          <Field label="Narrative, reference or line memo">
            <TextInput aria-label="Narrative, reference or line memo" value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="rent, INV-1055, reversal" />
          </Field>
        </div>
        <div className="ds-col-4">
          <Field label="At least">
            <MoneyInput label="Minimum value" currency={context.org.currency} valueMinor={min} onChangeMinor={setMin} />
          </Field>
        </div>
      </Grid>
      {results.length === 0 ? <Empty title="No journal matches" /> : (
        <DataGrid
          rows={results}
          rowId={(row) => row.id}
          label="Journal search results"
          filterable={false}
          pageSize={12}
          columns={[
            { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span>, sortValue: (row) => journalDate(row) },
            { key: "title", header: "Journal", primary: true, cell: (row) => row.title },
            { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "posted" ? "success" : row.status === "draft" ? "info" : "warning"}>{row.status}</Pill> },
            { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={journalLines(row).reduce((sum, line) => sum + line.debitMinor, 0)} context={context} /> },
          ]}
          onOpen={(id) => { close(); context.select(id); context.openOverlay("Journal form", { id }); }}
        />
      )}
    </Stack>
  );
}

export function LedgerStrip({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const types = (["asset", "liability", "equity", "revenue", "expense"] as const).map((type) => ({
    type,
    minor: data.trialRows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balanceMinor, 0),
  }));
  return (
    <Row gap={4} wrap>
      <Pill tone={data.statements.booksBalance ? "success" : "danger"} dot>
        {data.statements.booksBalance ? "Debits equal credits" : `Out by ${context.money(Math.abs(data.statements.debit - data.statements.credit))}`}
      </Pill>
      {types.map((entry) => (
        <span key={entry.type} className="ds-row ds-gap-1">
          <span className="ds-subtle" style={{ textTransform: "capitalize" }}>{entry.type}</span>
          <Amount minor={entry.minor} context={context} />
        </span>
      ))}
      <span className="ds-grow" />
      <span className="ds-subtle">{periodLabel(data.currentPeriod, org.locale)} · {data.accounts.filter((account) => accountType(account) === "asset").length} asset accounts</span>
    </Row>
  );
}

export function newJournalFromTemplate(kind: "accrual" | "depreciation", accounts: Rec[]): { memo: string; lines: JLine[] } {
  const find = (code: string) => accounts.find((account) => accountCode(account) === code)?.id ?? "";
  if (kind === "depreciation") {
    return { memo: "Depreciation", lines: [
      { accountId: find("6500"), debitMinor: 0, creditMinor: 0, memo: "Depreciation charge" },
      { accountId: find("1510"), debitMinor: 0, creditMinor: 0, memo: "Accumulated depreciation" },
    ] };
  }
  return { memo: "Accrual", lines: [
    { accountId: find("6300"), debitMinor: 0, creditMinor: 0, memo: "Cost accrued" },
    { accountId: find("2200"), debitMinor: 0, creditMinor: 0, memo: "Liability raised" },
  ] };
}

export function TextAreaNote({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <TextArea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />;
}
