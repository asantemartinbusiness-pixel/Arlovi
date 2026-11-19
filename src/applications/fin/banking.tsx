import { useMemo, useState } from "react";
import { Banknote, FileSpreadsheet, PlugZap } from "lucide-react";
import {
  Button, Card, DataGrid, DrawerActions, DrawerUnsavedChanges, Empty, FactGrid, Field, Grid, ModalActions, ModalInFlight, ModalUnsavedChanges, MoneyInput, Notice, OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";

import { CAPABILITY_LABELS, PROVIDER_CAPABILITIES } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import { touch } from "@/domain/types";
import {
  accountCode, accountType, isStatementLine, journalDate, journalLines, matchCandidates, periodOf, reconcile, statementSummaries,
} from "@/domain/fin-ledger";
import type { JLine, MatchCandidate, Reconciliation } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import type { FinData } from "./data";
import { AccountLabel, Amount, BooksLoading, CapabilityNotice, CapabilityPill, SourceNote, StatementRow } from "./parts";
import { wallMs } from "@/platform/clock";
import { commitStatementMatch, commitStatementUnmatch } from "./reconciliationLinks";
import { reconciliationEvidence, reconciliationSignoffBlocker, reconciliationSignoffIsCurrent } from "@/domain/finance-signoff";
import { newRecord } from "@/platform/repo";

/* ---------------------------- FIN-008 ---------------------------- */

function cashAccounts(data: FinData): Rec[] {
  return data.accounts.filter((account) => accountType(account) === "asset" && (account.tags.includes("cash") || accountCode(account).startsWith("10")));
}

export function BankAccounts({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const accounts = cashAccounts(data);
  const statements = statementSummaries(data.bankLines);

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No bank feed is connected, and this workspace cannot connect one">
        Balances below are the ledger's own figures from posted journals. Where a statement has been imported by hand, its closing balance is shown beside them so the two can be compared.
      </Notice>
      <Grid>
        {accounts.map((account) => {
          const row = data.trialRows.find((item) => item.accountId === account.id);
          const statement = statements.find((item) => item.bankAccountCode === accountCode(account));
          const recon = reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: accountCode(account) });
          return (
            <Card prov="human"
              key={account.id}
              span={6}
              title={`${accountCode(account)} ${account.title}`}
              subtitle={account.summary}
              actions={<CapabilityPill id="bank.feed" />}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/fin/reconciliation`)}>Reconcile</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("CSV mapper", { code: accountCode(account) })}>Import a statement</Button>
              </>}
            >
              <StatementRow
                context={context}
                rows={[
                  { label: "Ledger balance", minor: row?.balanceMinor, note: "Posted journals only" },
                  { label: "Statement closing", minor: statement?.closingMinor, note: statement ? `${statement.filename}, ${context.date(statement.to)}` : "No statement imported" },
                  { label: "Difference", minor: recon.differenceMinor, bold: true, note: recon.blockedReason ?? "Reconciled" },
                ]}
              />
            </Card>
          );
        })}
        {accounts.length === 0 && (
          <Empty title="No cash account in the chart of accounts" icon={<Banknote size={20} />}>
            Mark an asset account as cash in the Chart of Accounts for it to appear here.
          </Empty>
        )}
      </Grid>
    </Stack>
  );
}

export function BankTransactions({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const [state, setState] = useState<"all" | "matched" | "unmatched">("all");
  const lines = useMemo(() => data.bankLines
    .filter(isStatementLine)
    .filter((line) => state === "all" || (state === "matched" ? line.fields.matched === true : line.fields.matched !== true))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")), [data.bankLines, state]);

  const accounts = cashAccounts(data);
  let running = 0;
  const withRunning = [...lines].reverse().map((line) => {
    running += Number(line.amountMinor ?? 0);
    return { line, running };
  }).reverse();

  if (data.bankLines.filter(isStatementLine).length === 0) {
    return (
      <Empty title="No statement lines" icon={<FileSpreadsheet size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("CSV mapper")}>Import a CSV statement</Button>}>
        A statement is imported by hand. Nothing arrives on its own because no feed is connected.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Segmented
          label="Match state"
          value={state}
          onChange={setState}
          options={[{ value: "all", label: "All" }, { value: "unmatched", label: "Unmatched" }, { value: "matched", label: "Matched" }]}
        />
        <span className="ds-grow" />
        <SourceNote>The running total is the sum of the lines shown, oldest first. It is not a bank balance.</SourceNote>
      </Row>
      <DataGrid
        rows={withRunning}
        rowId={(row) => row.line.id}
        label="Statement lines"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        rowTone={(row) => (row.line.fields.matched === true ? undefined : "warning")}
        columns={[
          { key: "date", header: "Date", width: "112px", cell: (row) => <span className="ds-num">{context.date(row.line.at)}</span>, sortValue: (row) => row.line.at ?? "" },
          { key: "description", header: "Description", primary: true, cell: (row) => (
            <span>
              {row.line.title}
              <span className="ds-subtle" style={{ display: "block", fontSize: "var(--text-xs)" }}>{String(row.line.fields.reference ?? "")}</span>
            </span>
          ), filterValue: (row) => `${row.line.title} ${String(row.line.fields.reference ?? "")}` },
          { key: "account", header: "Bank account", hideBelow: 1200, cell: (row) => {
            const account = accounts.find((item) => accountCode(item) === String(row.line.fields.bankAccountCode ?? "1000"));
            return <AccountLabel account={account} />;
          } },
          { key: "state", header: "State", cell: (row) => row.line.fields.matched === true
            ? <Pill tone="success" dot>Matched</Pill>
            : <Pill tone="warning" dot>Unmatched</Pill>, filterValue: (row) => row.line.status },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.line.amountMinor} context={context} />, sortValue: (row) => Number(row.line.amountMinor ?? 0) },
          { key: "running", header: "Running", align: "end", hideBelow: 900, cell: (row) => <Amount minor={row.running} context={context} /> },
        ]}
        onOpen={(id) => { context.select(id); context.navigate(`/o/${context.org.slug}/fin/reconciliation`); }}
      />
      <Notice tone="info" title="Importing never marks a line reconciled">
        A line arrives unmatched. It becomes matched only when a person links it to a posted journal or posts an adjustment for it.
      </Notice>
    </Stack>
  );
}

export function ImportJobs({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const statements = statementSummaries(data.bankLines);
  const batches = useMemo(() => {
    const map = new Map<string, { batch: string; lines: Rec[] }>();
    for (const line of data.bankLines.filter(isStatementLine)) {
      const batch = String(line.fields.importBatch ?? "manual");
      const found = map.get(batch);
      if (found) found.lines.push(line);
      else map.set(batch, { batch, lines: [line] });
    }
    return [...map.values()];
  }, [data.bankLines]);

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Import batches" value={String(batches.length)} meta="Each one is a CSV someone uploaded" />
        <Stat prov="human" label="Lines imported" value={String(data.bankLines.filter(isStatementLine).length)} />
        <Stat prov="human" label="Still unmatched" value={String(data.bankLines.filter((line) => isStatementLine(line) && line.fields.matched !== true).length)} />
        <Stat label="Automatic imports" value="None" unavailable meta="No feed is connected" />
      </StatRow>
      {statements.length === 0 ? <Empty title="No statement has been imported" /> : (
        <DataGrid
          rows={statements}
          rowId={(row) => row.record.id}
          label="Import jobs"
          columns={[
            { key: "file", header: "File", primary: true, cell: (row) => row.filename, filterValue: (row) => row.filename },
            { key: "account", header: "Account", cell: (row) => <span className="ds-num">{row.bankAccountCode}</span> },
            { key: "period", header: "Covers", cell: (row) => `${context.date(row.from)} – ${context.date(row.to)}` },
            { key: "rows", header: "Rows", align: "end", cell: (row) => <span className="ds-num">{String(row.record.fields.rows ?? "—")}</span> },
            { key: "by", header: "Imported by", cell: (row) => String(row.record.fields.importedBy ?? row.record.ownerName) },
            { key: "when", header: "When", cell: (row) => <span className="ds-num">{context.dateTime(row.record.at)}</span> },
            { key: "closing", header: "Closing", align: "end", cell: (row) => <Amount minor={row.closingMinor} context={context} bold /> },
          ]}
        />
      )}
      <Card prov="human" title="Batches" subtitle="Lines grouped by the import they arrived in">
        <Stack gap={2}>
          {batches.map((batch) => (
            <Row key={batch.batch} gap={3}>
              <span className="ds-grow">{batch.batch}</span>
              <span className="ds-subtle">{batch.lines.length} lines</span>
              <span className="ds-subtle">{batch.lines.filter((line) => line.fields.matched === true).length} matched</span>
              <Amount minor={batch.lines.reduce((sum, line) => sum + Number(line.amountMinor ?? 0), 0)} context={context} />
            </Row>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export function FeedHealth({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const bank = PROVIDER_CAPABILITIES.find((capability) => capability.id === "bank.feed")!;
  const lastImport = statementSummaries(data.bankLines).map((statement) => statement.record.at ?? "").sort().at(-1);

  return (
    <Stack gap={4}>
      <Grid>
        <Card prov="posted" span={6} title="Bank feed" subtitle={bank.provider} actions={<CapabilityPill id="bank.feed" />}>
          <Stack gap={3}>
            <Properties rows={[
              { label: "State", value: CAPABILITY_LABELS[bank.state] },
              { label: "Last successful sync", value: "Never" },
              { label: "What works instead", value: bank.localEquivalent },
              { label: "Last manual import", value: lastImport ? context.dateTime(lastImport) : "None" },
            ]} />
            <Notice tone="warning" title="A disconnected feed never marks anything reconciled">
              If a feed were connected and then dropped, the lines it had already delivered would stay exactly as they are: matched lines matched, unmatched lines unmatched. Nothing is inferred from silence.
            </Notice>
          </Stack>
        </Card>
        <Card prov="posted" span={6} title="Every provider this screen could use" subtitle="Stated, not implied">
          <Stack gap={2}>
            {PROVIDER_CAPABILITIES.filter((capability) => ["bank.feed", "payment.capture", "tax.file"].includes(capability.id)).map((capability) => (
              <Row key={capability.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow">
                  <strong>{capability.label}</strong>
                  <p className="ds-subtle">{capability.note}</p>
                </div>
                <CapabilityPill id={capability.id} />
              </Row>
            ))}
          </Stack>
        </Card>
      </Grid>
      <Card prov="human" title="Mismatch check" subtitle="Where the ledger and the imported statement disagree">
        <MismatchTable context={context} />
      </Card>
    </Stack>
  );
}

function MismatchTable({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const accounts = cashAccounts(data);
  const rows = accounts.map((account) => reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: accountCode(account) }));
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.bankAccountCode}
      label="Ledger against statement"
      filterable={false}
      columns={[
        { key: "account", header: "Account", primary: true, cell: (row) => row.bankAccountCode },
        { key: "ledger", header: "Ledger", align: "end", cell: (row) => <Amount minor={row.ledgerMinor} context={context} /> },
        { key: "statement", header: "Statement", align: "end", cell: (row) => <Amount minor={row.statementClosingMinor} context={context} /> },
        { key: "difference", header: "Difference", align: "end", cell: (row) => <Amount minor={row.differenceMinor} context={context} bold /> },
        { key: "unexplained", header: "Unexplained", align: "end", cell: (row) => <Amount minor={row.unexplainedMinor} context={context} bold tone={row.unexplainedMinor ? "danger" : undefined} /> },
        { key: "state", header: "State", cell: (row) => row.complete ? <Pill tone="success" dot>Reconciled</Pill> : <Pill tone="warning" dot>{row.blockedReason}</Pill> },
      ]}
    />
  );
}

export function BankConnection({ context, close }: { context: ScreenContext; close: () => void }) {
  const [bank, setBank] = useState("");
  return (
    <Stack gap={4}>
      <CapabilityNotice id="bank.feed" title="A bank connection cannot be made from this workspace" />
      <Field label="Bank" hint="Recorded so you know which institution the statements come from.">
        <TextInput aria-label="Bank" value={bank} onChange={(event) => setBank(event.target.value)} placeholder="Clerkenwell Mutual" />
      </Field>
      <Properties rows={[
        { label: "What a connection would need", value: "An authorised open-banking grant, held by a server this app does not have." },
        { label: "What happens instead", value: "You export a CSV from your bank and import it here. The mapper below keeps your column choices." },
        { label: "Credentials", value: "None are collected. This screen never asks for a bank login." },
      ]} />
      <Row gap={2}>
        <Button variant="primary" icon={<PlugZap size={15} />} onClick={() => { context.openOverlay("CSV mapper"); }}>Import a statement instead</Button>
        <Button variant="ghost" onClick={close}>Close</Button>
      </Row>
    </Stack>
  );
}

/** A real CSV importer: paste or type rows, map the columns, see what will be created. */
export function CsvMapper({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const payload = context.overlayPayload as { code?: string } | undefined;
  const [text, setText] = useState("date,description,amount\n2026-11-14,Card · brass polish,-4850\n2026-11-14,Faster payment · Pike Lighting,126000");
  const [code, setCode] = useState(payload?.code ?? "1000");
  const [hasHeader, setHasHeader] = useState(true);
  const [dateColumn, setDateColumn] = useState(0);
  const [descriptionColumn, setDescriptionColumn] = useState(1);
  const [amountColumn, setAmountColumn] = useState(2);
  const [filename, setFilename] = useState("Pasted CSV statement");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const rows = text.split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim())).filter((cells) => cells.some((cell) => cell));
    const body = hasHeader ? rows.slice(1) : rows;
    return body.map((cells, index) => {
      const rawAmount = cells[amountColumn] ?? "";
      const minor = Math.round(Number(rawAmount.replace(/[^0-9.-]/g, "")) || 0);
      const rawDate = cells[dateColumn] ?? "";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "";
      return {
        index,
        date,
        description: cells[descriptionColumn] ?? "",
        amountMinor: minor,
        problem: !date ? "The date is not in YYYY-MM-DD form." : minor === 0 ? "The amount reads as zero." : undefined,
      };
    });
  }, [text, hasHeader, dateColumn, descriptionColumn, amountColumn]);

  const good = parsed.filter((row) => !row.problem);
  const bad = parsed.filter((row) => row.problem);
  const existing = data.bankLines.filter(isStatementLine);
  const duplicates = good.filter((row) => existing.some((line) =>
    (line.at ?? "").slice(0, 10) === row.date && Number(line.amountMinor ?? 0) === row.amountMinor));
  const balancesValid = openingBalance.trim() !== "" && closingBalance.trim() !== ""
    && Number.isSafeInteger(Number(openingBalance))
    && Number.isSafeInteger(Number(closingBalance));
  const accountValid = cashAccounts(data).some((account) => accountCode(account) === code);
  const fromDate = [...good].map((row) => row.date).sort()[0];
  const toDate = [...good].map((row) => row.date).sort().at(-1);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="This import runs entirely in the browser">
        Paste the CSV and enter the opening and closing balances from the actual statement. Nothing
        is uploaded or verified by a bank. The statement header and its unmatched lines are saved together; without
        real balances, no reconciliation can be confirmed.
      </Notice>
      <Field label="CSV rows" hint="Comma separated. Amounts in minor units, negative for money out.">
        <TextArea aria-label="CSV rows" value={text} rows={6} onChange={(event) => setText(event.target.value)} style={{ fontFamily: "var(--font-mono, monospace)" }} />
      </Field>
      <Row gap={3} wrap>
        <Field label="Bank account">
          <Select aria-label="Bank account" value={code} onChange={(event) => setCode(event.target.value)}>
            {cashAccounts(data).map((account) => <option key={account.id} value={accountCode(account)}>{accountCode(account)} {account.title}</option>)}
          </Select>
        </Field>
        <Field label="First row"><Select aria-label="First row" value={hasHeader ? "header" : "data"} onChange={(event) => setHasHeader(event.target.value === "header")}>
          <option value="header">Is a header</option>
          <option value="data">Is data</option>
        </Select></Field>
        <Field label="Date column"><TextInput aria-label="Date column" align="end" inputMode="numeric" value={String(dateColumn)} onChange={(event) => setDateColumn(Number(event.target.value.replace(/\D/g, "")) || 0)} /></Field>
        <Field label="Description column"><TextInput aria-label="Description column" align="end" inputMode="numeric" value={String(descriptionColumn)} onChange={(event) => setDescriptionColumn(Number(event.target.value.replace(/\D/g, "")) || 0)} /></Field>
        <Field label="Amount column"><TextInput aria-label="Amount column" align="end" inputMode="numeric" value={String(amountColumn)} onChange={(event) => setAmountColumn(Number(event.target.value.replace(/\D/g, "")) || 0)} /></Field>
      </Row>

      <Row gap={3} wrap>
        <Field label="Statement reference" required>
          <TextInput aria-label="Statement reference" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="e.g. bank-account-Nov-2026.csv" required />
        </Field>
        <Field label="Opening balance (minor units)" required hint="Use the actual statement amount in pennies/cents; negative if overdrawn.">
          <TextInput aria-label="Opening balance (minor units)" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="e.g. 250000" required />
        </Field>
        <Field label="Closing balance (minor units)" required>
          <TextInput aria-label="Closing balance (minor units)" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} placeholder="e.g. 321500" required />
        </Field>
      </Row>
      {!balancesValid && <Notice tone="warning" title="Statement balances are required">Enter both balances as whole minor units. Arlovi will not infer them from imported rows or the ledger.</Notice>}
      {parsed.length > 0 && (
        <DataGrid
          rows={parsed}
          rowId={(row) => String(row.index)}
          label="Rows that will be imported"
          filterable={false}
          rowTone={(row) => (row.problem ? "danger" : undefined)}
          columns={[
            { key: "date", header: "Date", cell: (row) => <span className="ds-num">{row.date || "—"}</span> },
            { key: "description", header: "Description", primary: true, cell: (row) => row.description || "—" },
            { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
            { key: "problem", header: "Check", cell: (row) => row.problem ? <Pill tone="danger">{row.problem}</Pill> : <Pill tone="success">Ready</Pill> },
          ]}
        />
      )}

      {bad.length > 0 && <Notice tone="warning" title={`${bad.length} row${bad.length === 1 ? "" : "s"} will be skipped`}>A row is skipped rather than guessed at.</Notice>}
      {duplicates.length > 0 && <Notice tone="warning" title={`${duplicates.length} row${duplicates.length === 1 ? " looks" : "s look"} like a line already imported`}>Same date and same amount. They will be imported and flagged so you can delete the copy.</Notice>}

      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={good.length === 0 || !balancesValid || !filename.trim() || !accountValid || busy}
          onClick={async () => {
            if (!balancesValid || !filename.trim() || !accountValid || !fromDate || !toDate) return;
            setBusy(true);
            try {
              const batch = `import-${crypto.randomUUID()}`;
              const ctx = { actor: context.actor, now: context.now.toISOString() };
              const header = newRecord({
                organizationId: context.org.id,
                currency: context.org.currency,
                collection: "bankTransactions",
                title: filename.trim(),
                status: "imported",
                summary: "Statement metadata and balances manually entered from a CSV. No bank provider verification.",
                amountMinor: Number(closingBalance),
                at: context.now.toISOString(),
                fields: {
                  kind: "statement", source: "manual-csv", bankAccountCode: code,
                  importBatch: batch, filename: filename.trim(),
                  openingMinor: Number(openingBalance), closingMinor: Number(closingBalance),
                  from: fromDate, to: toDate, verification: "manual_local",
                },
              }, ctx);
              const lines = good.map((row) => newRecord({
                organizationId: context.org.id,
                currency: context.org.currency,
                collection: "bankTransactions",
                title: row.description || "Statement line",
                status: "unmatched",
                summary: `Manually imported with ${filename.trim()}.`,
                amountMinor: row.amountMinor,
                at: `${row.date}T00:00:00.000Z`,
                fields: {
                  matched: false, source: "statement-import",
                  bankAccountCode: code, importBatch: batch, statementId: header.id,
                  reference: row.description,
                  ...(duplicates.includes(row) ? { possibleDuplicate: true } : {}),
                },
              }, ctx));
              await context.mutate.putMany(
                [header, ...lines],
                [`Statement ${filename.trim()} imported with entered balances`,
                  ...lines.map((row) => `Statement line imported: ${row.title}`)],
                {},
                ["create", ...lines.map(() => "create" as const)],
              );
              context.toast("Statement imported", `${good.length} unmatched lines and their manually entered opening/closing balances saved atomically. ${bad.length} rows skipped. Nothing was reconciled.`);
              close();
            } catch (error) {
              context.toast("Import not completed", error instanceof Error ? error.message : "Review the statement and retry.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Import {good.length} line{good.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function FeedIncident({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const flagged = data.bankLines.filter((line) => isStatementLine(line) && line.fields.possibleDuplicate === true);
  return (
    <Stack gap={4}>
      <CapabilityNotice id="bank.feed" title="There is no feed, so there is no feed incident" />
      <Properties rows={[
        { label: "Open incidents", value: "None, because nothing is connected" },
        { label: "Lines flagged as possible duplicates", value: String(flagged.length) },
        { label: "What would be recorded", value: "A dropped feed would be recorded as an incident with the window it covered, and the lines in that window would stay unmatched." },
      ]} />
      {flagged.length > 0 && (
        <DataGrid
          rows={flagged}
          rowId={(row) => row.id}
          label="Possible duplicate lines"
          filterable={false}
          columns={[
            { key: "date", header: "Date", cell: (row) => context.date(row.at) },
            { key: "title", header: "Line", primary: true, cell: (row) => row.title },
            { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
            { key: "action", header: "", cell: (row) => (
              <Button size="sm" variant="outline-danger" onClick={async () => {
                await context.mutate.remove(row.id, `Duplicate statement line ${row.title} deleted`);
                context.toast("Line deleted", "The duplicate is gone. No ledger entry was touched.");
              }}>Delete</Button>
            ) },
          ]}
        />
      )}
    </Stack>
  );
}

/* ---------------------------- FIN-009 ---------------------------- */

export function useReconciliation(code: string): Reconciliation {
  const data = useFinData();
  return useMemo(
    () => reconcile({ accounts: data.accounts, journals: data.journals, lines: data.bankLines, bankAccountCode: code }),
    [data.accounts, data.journals, data.bankLines, code],
  );
}

export function ReconciliationStrip({ context }: { context: ScreenContext }) {
  const recon = useReconciliation("1000");
  return (
    <div className="fin-strip">
      <span>Statement <Amount minor={recon.statementClosingMinor} context={context} bold /></span>
      <span>Ledger at statement end <Amount minor={recon.ledgerMinor} context={context} bold /></span>
      <span>Difference <Amount minor={recon.differenceMinor} context={context} bold /></span>
      <span>
        Unexplained{" "}
        <Amount minor={recon.unexplainedMinor} context={context} bold tone={recon.unexplainedMinor ? "danger" : "success"} />
      </span>
      <span className="ds-grow" />
      {recon.complete
        ? <Pill tone="success" dot>Ready to confirm</Pill>
        : <Pill tone="warning" dot>Not ready to confirm</Pill>}
    </div>
  );
}

export function ToReconcile({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const recon = useReconciliation("1000");
  const [busy, setBusy] = useState<string>();

  if (!data.ready) return <BooksLoading what="statement and posted journals" />;
  if (!recon.statement) {
    return (
      <Empty title="No statement imported for the current account" icon={<FileSpreadsheet size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("CSV mapper", { code: "1000" })}>Import a CSV statement</Button>}>
        Reconciliation compares an imported statement against posted journals. Without a statement there is nothing to compare.
      </Empty>
    );
  }

  const open = [...recon.suggested.map((item) => ({ line: item.line, candidates: item.candidates })), ...recon.needsPosting.map((line) => ({ line, candidates: [] as MatchCandidate[] }))];

  const matchedCount = recon.matched.length;
  const unexplained = recon.unexplainedMinor ?? 0;
  const eq: { label: string; minor: number; op?: string; note?: string; tone?: "danger" | "success" }[] = [
    { label: "Statement closing", minor: recon.statementClosingMinor ?? 0, note: recon.statement.filename },
    { label: "Ledger at statement end", minor: recon.ledgerMinor, op: "\u2212", note: recon.statement.to ? `Posted on 1000 to ${context.date(recon.statement.to)}` : "Posted on 1000" },
    { label: "Difference", minor: recon.differenceMinor ?? 0, op: "=" },
    { label: `Not on the ledger (${recon.needsPosting.length})`, minor: recon.needsPostingMinor, op: "\u2212", note: "Statement lines with no journal" },
    { label: "Unexplained", minor: unexplained, op: "=", tone: unexplained === 0 ? "success" : "danger", note: unexplained === 0 ? "Every penny accounted for" : "Investigate before confirming" },
  ];

  return (
    <Stack gap={4}>
      <Card prov="posted" title="Reconciliation" subtitle={`${matchedCount} matched \u00b7 ${open.length} open \u00b7 confirming needs zero unexplained`}>
        <ol className="fin-eq" aria-label="How the statement ties to the ledger">
          {eq.map((item) => (
            <li key={item.label} data-op={item.op} data-tone={item.tone}>
              <span className="fin-eq-label">{item.label}</span>
              <span className="fin-eq-figure">{item.op && <span className="fin-eq-op" aria-hidden="true">{item.op}</span>}<Amount minor={item.minor} context={context} zero="0" /></span>
              {item.note && <span className="fin-eq-note">{item.note}</span>}
            </li>
          ))}
        </ol>
        <SourceNote>Ledger balance to date {context.money(recon.bookBalanceMinor)}: every posted journal on 1000, to date. Only postings up to the statement end enter the difference.</SourceNote>
        {!recon.complete && recon.blockedReason && <SourceNote>{recon.blockedReason}</SourceNote>}
        {data.draftJournals.length > 0 && <SourceNote>{data.draftJournals.length} draft journals are not counted in the ledger figure.</SourceNote>}
      </Card>

      {open.length === 0 ? (
        <Notice tone="success" title="Every statement line is matched">
          The difference is {context.money(recon.differenceMinor ?? 0)}. Confirm the statement to record the reconciliation.
        </Notice>
      ) : (
        <Card prov="posted" title={`Open statement lines (${open.length})`} subtitle="Matching only links a line to a posted journal; nothing is posted." pad="none">
          <ul className="fin-recon">
            {open.map(({ line, candidates }) => (
              <li key={line.id} className="fin-recon-line">
                <div className="fin-recon-head">
                  <span className="fin-recon-date">{context.date(line.at)}</span>
                  <div className="fin-recon-title">
                    <strong>{line.title}</strong>
                    <span className="ds-subtle">{String(line.fields.reference ?? "")}</span>
                  </div>
                  <Amount minor={line.amountMinor} context={context} bold />
                </div>
                {candidates.length > 0 ? (
                  <div className="fin-recon-body">
                    {candidates.slice(0, 3).map((candidate) => (
                      <div key={candidate.journal.id} className="fin-recon-candidate">
                        <div className="ds-grow">
                          <strong>{candidate.journal.title}</strong>
                          <p className="ds-subtle">{candidate.reason}</p>
                        </div>
                        <Pill tone={candidate.confidence >= 85 ? "success" : candidate.confidence >= 70 ? "info" : "warning"}>{candidate.confidence}% confident</Pill>
                        <Button
                          size="sm"
                          variant="primary"
                          busy={busy === line.id}
                          onClick={async () => {
                            setBusy(line.id);
                            try {
                              await commitStatementMatch(context, line, candidate.journal, recon.bankAccountId);
                              context.toast("Matched", `${line.title} is linked to ${candidate.journal.title}. The posted ledger balance has not changed.`);
                            } catch (error) {
                              context.toast("The match was not saved", error instanceof Error ? error.message : "Reload and retry.", "failed");
                            } finally {
                              setBusy(undefined);
                            }
                          }}
                        >
                          Match
                        </Button>
                      </div>
                    ))}
                    <div className="fin-recon-more">
                      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Match candidates", { id: line.id })}>See every candidate ({candidates.length})</Button>
                      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("adjustment review", { id: line.id })}>Post an adjustment instead</Button>
                    </div>
                  </div>
                ) : (
                  <div className="fin-recon-body fin-recon-none">
                    <Pill tone="warning" dot>Not on the ledger</Pill>
                    <span className="ds-subtle ds-grow">The money moved in the bank and nothing is posted for it.</span>
                    <Button size="sm" variant="primary" onClick={() => context.openOverlay("adjustment review", { id: line.id })}>Create an adjustment</Button>
                    <Button size="sm" variant="secondary" onClick={() => context.openOverlay("adjustment review", { id: line.id, split: true })}>Split across accounts</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recon.postedAfterStatement.length > 0 && (
        <Card prov="posted" title="Posted after the statement end"
          subtitle={`${recon.postedAfterStatement.length} posted journal${recon.postedAfterStatement.length === 1 ? "" : "s"} on 1000 dated after ${context.date(recon.statement.to ?? "")}. They are in the ledger balance but belong on the next statement, so they do not change this difference.`}
          actions={<Amount minor={recon.postedAfterStatement.reduce((sum, item) => sum + item.amountMinor, 0)} context={context} bold />}>
          <DataGrid
            rows={recon.postedAfterStatement}
            rowId={(row) => row.journal.id}
            label="Journals posted after the statement end"
            columns={[
              { key: "date", header: "Ledger date", cell: (row) => <span className="ds-num">{context.date(journalDate(row.journal))}</span>, sortValue: (row) => journalDate(row.journal) },
              { key: "journal", header: "Journal", primary: true, cell: (row) => row.journal.title, filterValue: (row) => row.journal.title },
              { key: "amount", header: "Bank movement", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
            ]}
          />
        </Card>
      )}

    </Stack>
  );
}

export function MatchedLines({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const recon = useReconciliation("1000");
  if (recon.matched.length === 0) return <Empty title="Nothing is matched yet">Match a line on the To reconcile tab and it appears here.</Empty>;
  return (
    <DataGrid
      rows={recon.matched}
      rowId={(row) => row.id}
      label="Matched statement lines"
      columns={[
        { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(row.at)}</span>, sortValue: (row) => row.at ?? "" },
        { key: "line", header: "Statement line", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "journal", header: "Matched to", cell: (row) => data.journals.find((journal) => journal.id === String(row.fields.journalId ?? ""))?.title ?? "Journal missing" },
        { key: "by", header: "Matched by", hideBelow: 1200, cell: (row) => String(row.fields.matchedBy ?? row.updatedBy) },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
        { key: "unmatch", header: "", cell: (row) => (
          <Button size="sm" variant="ghost" onClick={async () => {
            const journal = data.journals.find((item) => item.id === String(row.fields.journalId ?? ""));
            try {
              await commitStatementUnmatch(context, row, journal);
              context.toast("Unmatched", "Both links have been removed. No posted ledger entry was changed.");
            } catch (error) {
              context.toast("The match could not be removed", error instanceof Error ? error.message : "Reload and retry.", "failed");
            }
          }}>Unmatch</Button>
        ) },
      ]}
      summary={<Amount minor={recon.matched.reduce((sum, row) => sum + Number(row.amountMinor ?? 0), 0)} context={context} bold />}
    />
  );
}

export function ReconciliationExceptions({ context }: { context: ScreenContext }) {
  const recon = useReconciliation("1000");
  const data = useFinData();
  const stale = data.journals.filter((journal) =>
    journal.status === "posted"
    && journalLines(journal).some((line) => line.accountId === recon.bankAccountId)
    && !journal.fields.bankLineId);

  return (
    <Stack gap={4}>
      <Grid>
        <Card prov="human" span={6} title="Statement lines with no ledger entry" subtitle={`${recon.needsPosting.length} lines, ${context.money(recon.needsPostingMinor)}`}>
          {recon.needsPosting.length === 0 ? <span className="ds-subtle">None.</span> : (
            <Stack gap={2}>
              {recon.needsPosting.map((line) => (
                <Row key={line.id} gap={3}>
                  <span className="ds-num" style={{ width: 96 }}>{context.date(line.at)}</span>
                  <span className="ds-grow ds-truncate">{line.title}</span>
                  <Amount minor={line.amountMinor} context={context} />
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("adjustment review", { id: line.id })}>Adjust</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card prov="human" span={6} title="Ledger cash entries with no statement line" subtitle={`${stale.length} posted journals`}>
          {stale.length === 0 ? <span className="ds-subtle">None.</span> : (
            <Stack gap={2}>
              {stale.map((journal) => (
                <Row key={journal.id} gap={3}>
                  <span className="ds-num" style={{ width: 96 }}>{context.date(journal.at)}</span>
                  <span className="ds-grow ds-truncate">{journal.title}</span>
                  <Amount minor={journal.amountMinor} context={context} />
                </Row>
              ))}
            </Stack>
          )}
        </Card>
      </Grid>
      <Notice tone="info" title="Both lists are expected to be non-empty between imports">
        A cash journal posted after the statement was cut has no line yet, and a bank line for something not yet booked has no journal yet. The reconciliation is complete when both are empty for the period.
      </Notice>
    </Stack>
  );
}

export function ReconciliationHistory({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const confirmations = data.bankLines.filter((line) => line.fields.kind === "reconciliation");
  const statements = statementSummaries(data.bankLines);
  const current = useReconciliation("1000");
  const currentEvidence = reconciliationEvidence(current, data.journals);
  return (
    <Stack gap={4}>
      {confirmations.length === 0 ? (
        <Empty title="No reconciliation has been confirmed yet">
          Confirming a statement records who did it, the closing balance it was tied to and the difference at that moment.
        </Empty>
      ) : (
        <DataGrid
          rows={confirmations}
          rowId={(row) => row.id}
          label="Reconciliation history"
          columns={[
            { key: "when", header: "Confirmed", cell: (row) => <span className="ds-num">{context.dateTime(row.at)}</span>, sortValue: (row) => row.at ?? "" },
            { key: "who", header: "By", cell: (row) => String(row.fields.confirmedBy ?? row.ownerName) },
            { key: "account", header: "Account", cell: (row) => String(row.fields.bankAccountCode ?? "") },
            { key: "closing", header: "Statement closing", align: "end", cell: (row) => <Amount minor={Number(row.fields.closingMinor ?? 0)} context={context} /> },
            { key: "ledger", header: "Ledger", align: "end", cell: (row) => <Amount minor={Number(row.fields.ledgerMinor ?? 0)} context={context} /> },
            { key: "difference", header: "Difference", align: "end", cell: (row) => <Amount minor={Number(row.fields.differenceMinor ?? 0)} context={context} bold /> },
            { key: "evidence", header: "Evidence", cell: (row) => {
              const sameAccount = String(row.fields.bankAccountCode ?? "") === current.bankAccountCode;
              const stillCurrent = sameAccount && current.complete && reconciliationSignoffIsCurrent(row, currentEvidence);
              return <Pill tone={stillCurrent ? "success" : "warning"} dot>{stillCurrent ? "Current" : "Superseded / unverified"}</Pill>;
            } },
          ]}
        />
      )}
      <Card prov="human" title="Statements on file" subtitle="What has been imported">
        <Stack gap={2}>
          {statements.map((statement) => (
            <Row key={statement.record.id} gap={3}>
              <span className="ds-grow">{statement.filename}</span>
              <span className="ds-subtle">{context.date(statement.from)} – {context.date(statement.to)}</span>
              <Amount minor={statement.closingMinor} context={context} />
            </Row>
          ))}
          {statements.length === 0 && <span className="ds-subtle">None.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}

export function MatchCandidatesOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const recon = useReconciliation("1000");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const line = data.bankLines.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [busy, setBusy] = useState(false);
  if (!line) return <Empty title="Select a statement line first" />;
  const candidates = recon.bankAccountId ? matchCandidates(line, data.journals, recon.bankAccountId) : [];

  return (
    <Stack gap={4}>
      <OverlaySummary
        eyebrow="Statement line"
        title={line.title}
        status={<Pill tone="warning" dot>Open</Pill>}
        meta={[<span className="ds-num" key="d">{context.date(line.at)}</span>, String(line.fields.reference ?? "") || "No reference", <Amount key="a" minor={line.amountMinor} context={context} bold />]}
      />
      {candidates.length === 0 ? (
        <Notice tone="warning" title="No posted journal moves this account by exactly this amount">
          A match is never approximate here. Post an adjustment so the ledger records what the bank did.
        </Notice>
      ) : (
        <Stack gap={2}>
          {candidates.map((candidate) => (
            <Row key={candidate.journal.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow">
                <strong>{candidate.journal.title}</strong>
                <p className="ds-subtle">{candidate.reason}</p>
              </div>
              <Pill tone={candidate.confidence >= 85 ? "success" : "info"}>{candidate.confidence}%</Pill>
              <Button
                size="sm"
                variant="primary"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await commitStatementMatch(context, line, candidate.journal, recon.bankAccountId);
                    context.toast("Matched", `${line.title} is linked to ${candidate.journal.title} without changing the ledger balance.`);
                    close();
                  } catch (error) {
                    context.toast("The match was not saved", error instanceof Error ? error.message : "Reload and retry.", "failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Match
              </Button>
            </Row>
          ))}
        </Stack>
      )}
      <SourceNote>Confidence starts at 60 for an exact amount, rises with date proximity and shared words, and never implies the match is correct.</SourceNote>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="secondary" onClick={() => { close(); context.openOverlay("adjustment review", { id: line.id }); }}>Post an adjustment instead</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function AdjustmentReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const recon = useReconciliation("1000");
  const payload = context.overlayPayload as { id?: string; split?: boolean } | undefined;
  const line = data.bankLines.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [splits, setSplits] = useState<{ key: string; accountId: string; amountMinor: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const amount = Number(line?.amountMinor ?? 0);
  const posting = data.accounts.filter((account) => account.status !== "inactive" && account.id !== recon.bankAccountId);

  const allocated = splits.reduce((sum, split) => sum + split.amountMinor, 0);
  const remaining = Math.abs(amount) - allocated;

  if (!line) return <Empty title="Select a statement line first" />;
  if (!recon.bankAccountId) return <Notice tone="danger" title="No bank account">The chart of accounts has no 1000 account to post against.</Notice>;

  const rows = splits.length > 0 ? splits : [{ key: "k0", accountId: "", amountMinor: Math.abs(amount) }];
  const period = periodOf((line.at ?? "").slice(0, 10));
  const blocked = data.locked.includes(period)
    ? `${period} is a closed period, so this adjustment cannot be posted.`
    : rows.some((row) => !row.accountId)
      ? "Choose an account for every line."
      : rows.reduce((sum, row) => sum + row.amountMinor, 0) !== Math.abs(amount)
        ? `The lines come to ${context.money(rows.reduce((sum, row) => sum + row.amountMinor, 0))}, not the ${context.money(Math.abs(amount))} on the statement.`
        : undefined;

  return (
    <Stack gap={4}>
      <DrawerUnsavedChanges when={splits.length > 0} />
      <OverlaySummary
        eyebrow="Adjustment for statement line"
        title={line.title}
        status={<Pill tone="warning" dot>Not on the ledger</Pill>}
        meta={[<span className="ds-num" key="d">{context.date(line.at)}</span>, amount >= 0 ? "Money in: bank debited" : "Money out: bank credited", <Amount key="a" minor={amount} context={context} bold />]}
      />
      <Notice tone="info" title="An adjustment is a real journal">
        It debits or credits the bank account by exactly the statement amount and puts the other side where you say. The statement line is then matched to it.
      </Notice>

      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Adjustment lines</caption>
            <thead><tr><th>Account</th><th data-align="end">Amount</th><th style={{ width: 44 }}><span className="ds-sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td>
                    <Select
                      aria-label={`Account for split ${index + 1}`}
                      value={row.accountId}
                      onChange={(event) => {
                        const next = rows.map((item) => (item.key === row.key ? { ...item, accountId: event.target.value } : item));
                        setSplits(next);
                      }}
                    >
                      <option value="">Choose an account</option>
                      {posting.map((account) => <option key={account.id} value={account.id}>{accountCode(account)} {account.title}</option>)}
                    </Select>
                  </td>
                  <td data-align="end">
                    <MoneyInput
                      label={`Amount for split ${index + 1}`}
                      currency={context.org.currency}
                      valueMinor={row.amountMinor}
                      onChangeMinor={(minor) => setSplits(rows.map((item) => (item.key === row.key ? { ...item, amountMinor: minor } : item)))}
                    />
                  </td>
                  <td>
                    <Button size="sm" variant="ghost" iconOnly aria-label={`Remove split ${index + 1}`} disabled={rows.length <= 1}
                      onClick={() => setSplits(rows.filter((item) => item.key !== row.key))}>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ds-grid-foot">
          <Button size="sm" variant="secondary" onClick={() => setSplits([...rows, { key: `k${rows.length}${wallMs().toString(36)}`, accountId: "", amountMinor: Math.max(0, remaining) }])}>
            Split further
          </Button>
          <span className="ds-row ds-gap-2">
            <span className="ds-subtle">Allocated</span>
            <Amount minor={rows.reduce((sum, row) => sum + row.amountMinor, 0)} context={context} bold />
            <span className="ds-subtle">of</span>
            <Amount minor={Math.abs(amount)} context={context} bold />
          </span>
        </div>
      </div>

      {blocked && <Notice tone="danger" title="This adjustment cannot be posted">{blocked}</Notice>}

      <OverlaySection title="Journal that will be posted" hint="Debits equal credits before anything is saved.">
        <table className="ds-table">
          <caption className="ds-sr-only">Journal preview</caption>
          <thead><tr><th>Account</th><th data-align="end">Debit</th><th data-align="end">Credit</th></tr></thead>
          <tbody>
            {[
              { key: "bank", label: `${recon.bankAccountCode} Bank`, debit: amount >= 0 ? amount : 0, credit: amount < 0 ? Math.abs(amount) : 0 },
              ...rows.map((row, index) => {
                const account = data.accounts.find((item) => item.id === row.accountId);
                return { key: `r${index}`, label: account ? `${accountCode(account)} ${account.title}` : "Account not chosen", debit: amount < 0 ? row.amountMinor : 0, credit: amount >= 0 ? row.amountMinor : 0 };
              }),
            ].map((line) => (
              <tr key={line.key}>
                <td>{line.label}</td>
                <td data-align="end" className="ds-num">{line.debit ? context.money(line.debit) : "\u2014"}</td>
                <td data-align="end" className="ds-num">{line.credit ? context.money(line.credit) : "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </OverlaySection>

      <DrawerActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Posting needs the Finance or Owner role view" : blocked}
          onClick={async () => {
            if (busy || blocked) return;
            setBusy(true);
            try {
              const date = (line.at ?? context.now.toISOString()).slice(0, 10);
              const journalLines: JLine[] = amount >= 0
                ? [
                  { accountId: recon.bankAccountId!, debitMinor: amount, creditMinor: 0, memo: line.title },
                  ...rows.map((row) => ({ accountId: row.accountId, debitMinor: 0, creditMinor: row.amountMinor, memo: line.title })),
                ]
                : [
                  ...rows.map((row) => ({ accountId: row.accountId, debitMinor: row.amountMinor, creditMinor: 0, memo: line.title })),
                  { accountId: recon.bankAccountId!, debitMinor: 0, creditMinor: Math.abs(amount), memo: line.title },
                ];
              const ctx = { actor: context.actor, now: context.now.toISOString() };
              const journal = newRecord({
                organizationId: context.org.id,
                currency: context.org.currency,
                collection: "journals",
                title: `Adjustment · ${line.title}`,
                status: "posted",
                summary: `Posted from an unmatched statement line on ${context.date(line.at)}.`,
                amountMinor: Math.abs(amount),
                at: `${date}T09:00:00.000Z`,
                parentId: line.id,
                tags: ["ledger", "reconciliation"],
                fields: { date, source: "reconciliation", bankLineId: line.id },
                body: { date, memo: line.title, lines: journalLines },
              }, ctx);
              const matched = touch(line, context.actor, ctx.now, {
                status: "matched",
                fields: { ...line.fields, matched: true, journalId: journal.id, matchedBy: context.actor },
              });
              await context.mutate.putMany(
                [matched, journal],
                [
                  `Statement line ${line.title} matched to posted adjustment ${journal.title}`,
                  `Adjustment posted for statement line ${line.title}`,
                ],
                { [line.id]: line.revision },
                ["update", "create"],
              );
              context.toast("Adjustment posted", `${context.money(Math.abs(amount))} is now on the ledger and the statement line has a reciprocal match.`);
              close();
            } catch (error) {
              context.toast("Adjustment was not posted", error instanceof Error ? error.message : "The statement or period changed. Reopen the record.", "failed");
            } finally {
              setBusy(false);
            }

          }}
        >
          Post the adjustment
        </Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function ReconciliationApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const recon = useReconciliation("1000");
  const data = useFinData();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = reconciliationSignoffBlocker({
    recon, accounts: data.accounts, journals: data.journals, bankLines: data.bankLines,
  });

  return (
    <Stack gap={4}>
      <ModalUnsavedChanges when={note.trim() !== ""} />
      <ModalInFlight when={busy} />
      {blocked ? (
        <Notice tone="danger" title="This reconciliation cannot be confirmed">{blocked}</Notice>
      ) : (
        <Notice tone="success" title="Local ledger evidence is complete">
          Every imported line for this statement is linked reciprocally to an exact-value posted journal.
          The balance at the statement end date agrees. The database checks all source revisions again
          when you confirm, and keeps the evidence snapshot for later review.
        </Notice>
      )}
      <OverlaySection title="The figures being signed off" hint={recon.statement ? `${recon.statement.filename} \u00b7 period ends ${context.date(recon.statement.to)}. Imported by hand and checked locally; no bank provider verified it.` : undefined}>
        <FactGrid columns={3} items={[
          { label: "Statement closing", value: <Amount minor={recon.statementClosingMinor} context={context} />, mono: true },
          { label: "Ledger at statement end", value: <Amount minor={recon.ledgerMinor} context={context} />, mono: true },
          { label: "Difference", value: <Amount minor={recon.differenceMinor} context={context} zero="0" />, mono: true },
          { label: "Lines without journals", value: <Amount minor={recon.needsPostingMinor} context={context} zero="0" />, mono: true },
          { label: "Unexplained", value: <Amount minor={recon.unexplainedMinor} context={context} zero="0" />, mono: true, tone: recon.unexplainedMinor ? "danger" : "success" },
        ]} />
      </OverlaySection>
      <Field label="Note" hint="Retained in the locally confirmed reconciliation record.">
        <TextArea aria-label="Note" value={note} rows={3} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <ModalActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={Boolean(blocked) || !context.can("post_journal")}
          title={!context.can("post_journal") ? "Finance or Owner role view required" : blocked}
          onClick={async () => {
            if (busy || blocked || !recon.statement) return;
            setBusy(true);
            try {
              await context.mutate.confirmReconciliation(recon.bankAccountCode, recon.statement.record.id, note);
              context.toast("Statement signed off locally", "The account, statement and ledger evidence were rechecked and recorded atomically. No bank provider confirmed this reconciliation.");
              close();
            } catch (error) {
              context.toast("Reconciliation not confirmed", error instanceof Error ? error.message : "Records changed. Reopen and review.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm the statement
        </Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </ModalActions>
    </Stack>
  );
}
