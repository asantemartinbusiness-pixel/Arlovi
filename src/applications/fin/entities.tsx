import { useMemo, useState } from "react";
import { Building2, Scale } from "lucide-react";
import {
  Button, Card, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, ModalInFlight, ModalUnsavedChanges, Notice, OverlayActions, OverlayCancel, OverlaySummary, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { ORGS } from "@/platform/org";
import type { Rec } from "@/domain/types";
import { accountCode, consolidate, entityOf, isIntercompany, journalDate, journalLines, trial } from "@/domain/fin-ledger";
import { useFinData } from "./data";
import { AccountLabel, Amount, SourceNote, StatementRow } from "./parts";

/* ---------------------------- FIN-013 ---------------------------- */

export function EntitiesTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const consolidation = consolidate(data.entities, data.journals);

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Each organisation in this workspace keeps its own ledger">
        {ORGS.map((item) => item.name).join(" and ")} are separate records with separate charts of accounts. Nothing on this screen adds one organisation's figures to another's. The entities below are inside {org.name}.
      </Notice>

      <StatRow>
        <Stat prov="posted" label="Entities" value={String(data.entities.length)} meta={`${consolidation.columns.filter((column) => column.debitMinor > 0).length} with postings`} />
        <Stat prov="posted" label="Tagged journals" value={String(data.journals.filter((journal) => journal.status === "posted" && entityOf(journal)).length)} meta="Posted entries with an entity" />
        <Stat prov="posted" label="Untagged journals" value={String(consolidation.unassignedJournalIds.length)} meta="Counted in the first entity's column" />
        <Stat prov="posted" label="Intercompany journals" value={String(consolidation.eliminatedJournalIds.length)} meta="Eliminated once in the group column" />
      </StatRow>

      <Grid>
        {data.entities.map((entity) => {
          const column = consolidation.columns.find((item) => item.entityId === entity.id);
          const parent = data.entities.find((item) => item.id === String(entity.fields.parentId ?? ""));
          return (
            <Card prov="posted"
              key={entity.id}
              span={4}
              title={entity.title}
              subtitle={entity.summary}
              actions={<Pill tone={entity.status === "active" ? "success" : "warning"} dot>{entity.status}</Pill>}
              footer={<>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Entity config", { id: entity.id })}>Configure</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("inspect postings", { id: entity.id })}>Postings</Button>
              </>}
            >
              <Properties rows={[
                { label: "Registration", value: String(entity.fields.number ?? "Not recorded") },
                { label: "Country", value: String(entity.fields.country ?? "Not recorded") },
                { label: "Currency", value: String(entity.fields.currency ?? org.currency) },
                { label: "Parent", value: parent ? parent.title : "None, it is the top company" },
                { label: "Ownership", value: entity.fields.ownership ? `${String(entity.fields.ownership)}%` : "Not recorded" },
                { label: "Posted debits", value: <Amount minor={column?.debitMinor ?? 0} context={context} /> },
              ]} />
              {String(entity.fields.currency ?? org.currency) !== org.currency && (
                <Notice tone="warning" title="A different functional currency">
                  No exchange-rate source is connected, so this entity's figures are not translated into {org.currency} anywhere on this screen.
                </Notice>
              )}
            </Card>
          );
        })}
        {data.entities.length === 0 && (
          <Empty title="No legal entity recorded" icon={<Building2 size={20} />}
            action={<Button variant="primary" onClick={() => context.openOverlay("Entity config")}>Record an entity</Button>} />
        )}
      </Grid>
    </Stack>
  );
}

export function IntercompanyTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const intercompany = data.journals.filter((journal) => journal.status === "posted" && isIntercompany(journal));
  const accounts = data.accounts.filter((account) => ["1900", "2900"].includes(accountCode(account)));

  const pairs = useMemo(() => {
    const map = new Map<string, { key: string; entityId?: string; journals: Rec[]; debitMinor: number }>();
    for (const journal of intercompany) {
      const key = entityOf(journal) ?? "untagged";
      const found = map.get(key);
      const debit = journalLines(journal).reduce((sum, line) => sum + line.debitMinor, 0);
      if (found) { found.journals.push(journal); found.debitMinor += debit; }
      else map.set(key, { key, entityId: entityOf(journal), journals: [journal], debitMinor: debit });
    }
    return [...map.values()];
  }, [intercompany]);

  const receivable = data.trialRows.find((row) => row.code === "1900")?.balanceMinor ?? 0;
  const payable = data.trialRows.find((row) => row.code === "2900")?.balanceMinor ?? 0;

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Intercompany receivable" value={context.money(receivable)} meta="Account 1900" />
        <Stat prov="posted" label="Intercompany payable" value={context.money(payable)} meta="Account 2900" />
        <Stat prov="posted"
          label="Mirror difference"
          value={context.money(receivable - payable)}
          meta={receivable === payable ? "The two sides agree" : "The two sides do not agree"}
        />
        <Stat prov="posted" label="Journals" value={String(intercompany.length)} meta="Tagged as intercompany" />
      </StatRow>

      {receivable !== payable && (
        <Notice tone="danger" title="The intercompany accounts do not mirror each other">
          1900 carries {context.money(receivable)} and 2900 carries {context.money(payable)}. One side of a transfer is missing or has been posted at a different amount, which would misstate the group figures.
        </Notice>
      )}

      <Grid>
        <Card prov="posted" span={5} title="Control accounts" subtitle="Where intercompany balances sit">
          <Stack gap={3}>
            {accounts.map((account) => (
              <Row key={account.id} gap={3}>
                <span className="ds-grow"><AccountLabel account={account} /></span>
                <Amount minor={data.trialRows.find((row) => row.accountId === account.id)?.balanceMinor} context={context} bold />
              </Row>
            ))}
            {accounts.length === 0 && <span className="ds-subtle">No 1900 or 2900 account exists in this chart of accounts.</span>}
          </Stack>
        </Card>
        <Card prov="posted" span={7} title="Intercompany journals" subtitle="Each appears in one entity's column and is eliminated once in the group" flush>
          {intercompany.length === 0 ? (
            <div className="ds-card-body"><span className="ds-subtle">No journal is tagged as intercompany.</span></div>
          ) : (
            <DataGrid
              rows={intercompany}
              rowId={(row) => row.id}
              label="Intercompany journals"
              filterable={false}
              columns={[
                { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span>, sortValue: (row) => journalDate(row) },
                { key: "title", header: "Journal", primary: true, cell: (row) => row.title },
                { key: "entity", header: "Entity", cell: (row) => data.entities.find((entity) => entity.id === entityOf(row))?.title ?? "Untagged" },
                { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
              ]}
            />
          )}
        </Card>
        <Card prov="posted" span={12} title="By entity" subtitle="Where the intercompany value sits">
          <Stack gap={2}>
            {pairs.map((pair) => (
              <Row key={pair.key} gap={3}>
                <span className="ds-grow">{data.entities.find((entity) => entity.id === pair.entityId)?.title ?? "Untagged journals"}</span>
                <span className="ds-subtle">{pair.journals.length} journals</span>
                <Amount minor={pair.debitMinor} context={context} />
              </Row>
            ))}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

export function ConsolidationTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const consolidation = consolidate(data.entities, data.journals);
  const tb = trial(data.accounts, data.journals, org.id);

  return (
    <Stack gap={4}>
      <Notice tone="info" title="How this consolidation avoids double counting">
        Each posted journal is counted once, in the column of the entity it is tagged to. A journal tagged intercompany is then removed from the group column, so a balance recorded in both the parent and the subsidiary is not added twice.
      </Notice>

      <div className="ds-grid-wrap">
        <div className="ds-grid-scroll">
          <table className="ds-table">
            <caption className="ds-sr-only">Consolidation by entity</caption>
            <thead>
              <tr>
                <th>Column</th>
                <th data-align="end">Debits</th>
                <th data-align="end">Credits</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {consolidation.columns.map((column) => (
                <tr key={column.entityId}>
                  <td className="ds-table-primary">{column.label}</td>
                  <td data-align="end"><Amount minor={column.debitMinor} context={context} /></td>
                  <td data-align="end"><Amount minor={column.creditMinor} context={context} /></td>
                  <td className="ds-subtle">
                    {column.debitMinor === 0
                      ? "No posted journal is tagged to this entity"
                      : consolidation.unassignedJournalIds.length > 0 && column === consolidation.columns[0]
                        ? `Includes ${consolidation.unassignedJournalIds.length} untagged journals`
                        : "Tagged journals only"}
                  </td>
                </tr>
              ))}
              <tr data-tone="warning">
                <td className="ds-table-primary">Intercompany eliminations</td>
                <td data-align="end"><Amount minor={-consolidation.eliminationMinor} context={context} /></td>
                <td data-align="end"><Amount minor={-consolidation.eliminationMinor} context={context} /></td>
                <td className="ds-subtle">{consolidation.eliminatedJournalIds.length} journals removed once each</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" style={{ textAlign: "start" }}>Group</th>
                <td data-align="end"><Amount minor={consolidation.groupDebitMinor} context={context} bold /></td>
                <td data-align="end"><Amount minor={consolidation.groupCreditMinor} context={context} bold /></td>
                <td className="ds-subtle">
                  {consolidation.groupDebitMinor === consolidation.groupCreditMinor ? "The group column balances" : "The group column does not balance"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Grid>
        <Card prov="posted" span={6} title="Check against the single-entity trial balance" subtitle="The whole organisation, with nothing eliminated">
          <StatementRow
            context={context}
            rows={[
              { label: "All posted debits", minor: tb.debit },
              { label: "Intercompany eliminated", minor: -consolidation.eliminationMinor },
              { label: "Group debits", minor: consolidation.groupDebitMinor, bold: true },
              { label: "Difference", minor: tb.debit - consolidation.eliminationMinor - consolidation.groupDebitMinor, bold: true, note: "Zero when every journal was counted exactly once" },
            ]}
          />
        </Card>
        <Card prov="posted" span={6} title="What this consolidation does not do" subtitle="Stated rather than implied">
          <Stack gap={2}>
            <SourceNote>It does not translate a different functional currency: no exchange-rate source is connected.</SourceNote>
            <SourceNote>It does not eliminate unrealised profit on intercompany stock, because no stock transfer is tagged as intercompany here.</SourceNote>
            <SourceNote>It does not consolidate across organisations. {ORGS.map((item) => item.name).join(" and ")} stay separate.</SourceNote>
            <SourceNote>It does not apportion a minority interest; ownership is recorded on each entity but is not applied to the figures.</SourceNote>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

export function FxTab({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const foreign = data.entities.filter((entity) => String(entity.fields.currency ?? org.currency) !== org.currency);
  const rates = data.entities.flatMap((entity) => {
    const body = entity.body as { rates?: { currency: string; rate: number; at: string; source: string }[] } | undefined;
    return body?.rates ?? [];
  });

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No exchange-rate source is connected">
        A rate would have to come from a provider, and none is attached to this workspace. Where an entity reports in another currency, its figures are shown in that currency and never converted with a made-up rate.
      </Notice>
      <StatRow>
        <Stat prov="posted" label="Reporting currency" value={org.currency} meta={`${org.locale} formatting`} />
        <Stat prov="posted" label="Entities in another currency" value={String(foreign.length)} />
        <Stat label="Rates on file" value={rates.length ? String(rates.length) : "None"} unavailable={rates.length === 0} meta="A rate must be recorded with its date and source" />
        <Stat label="Translated figures" value="None" unavailable meta="Nothing is converted" />
      </StatRow>
      {foreign.length === 0 ? (
        <Empty title="Every entity reports in the organisation currency" icon={<Scale size={20} />}>
          There is nothing to translate, so no rate is needed.
        </Empty>
      ) : (
        <DataGrid
          rows={foreign}
          rowId={(row) => row.id}
          label="Entities in another currency"
          filterable={false}
          columns={[
            { key: "entity", header: "Entity", primary: true, cell: (row) => row.title },
            { key: "currency", header: "Functional currency", cell: (row) => String(row.fields.currency ?? "") },
            { key: "country", header: "Country", cell: (row) => String(row.fields.country ?? "") },
            { key: "postings", header: "Posted journals", align: "end", cell: (row) => <span className="ds-num">{data.journals.filter((journal) => entityOf(journal) === row.id && journal.status === "posted").length}</span> },
            { key: "rate", header: "Rate held", cell: () => <Pill tone="warning">None</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("FX sources", { id })}
        />
      )}
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function EntityConfig({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.entities.find((entity) => entity.id === payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [number, setNumber] = useState(String(existing?.fields.number ?? ""));
  const [country, setCountry] = useState(String(existing?.fields.country ?? "GB"));
  const [currency, setCurrency] = useState(String(existing?.fields.currency ?? org.currency));
  const [parentId, setParentId] = useState(String(existing?.fields.parentId ?? ""));
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [busy, setBusy] = useState(false);
  const duplicate = data.entities.some((entity) => entity.title.trim().toLowerCase() === title.trim().toLowerCase() && entity.id !== existing?.id);
  const cycle = parentId === existing?.id;

  return (
    <form
      id="entity-config"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate || cycle) return;
        setBusy(true);
        try {
        const fields: Record<string, string | number | boolean> = { number, country, currency };
        if (parentId) fields.parentId = parentId;
        if (existing) {
          const saved1 = await context.mutate.patch(existing.id, { title: title.trim(), summary, fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: `Entity ${title.trim()} updated` });
          if (!saved1) return;
        } else {
          await context.mutate.create({ collection: "legalEntities", title: title.trim(), status: "active", summary, fields }, `Entity ${title.trim()} recorded`);
        }
        context.toast("Entity saved", `${title.trim()} is recorded. Tagging journals to it is what puts figures in its column.`);
        close();
        } catch (error) {
          context.toast("Entity not saved", error instanceof Error ? error.message : "The entity changed. Reopen it and retry.", "failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <ModalUnsavedChanges when={title !== (existing?.title ?? "") || number !== String(existing?.fields.number ?? "") || summary !== (existing?.summary ?? "")} />
      <ModalInFlight when={busy} />
      <Field label="Legal name" required><TextInput aria-label="Legal name" value={title} invalid={duplicate} onChange={(event) => setTitle(event.target.value)} required /></Field>
      {duplicate && <Notice tone="danger" title="That name is already recorded">Two entities with the same name make a consolidation column ambiguous.</Notice>}
      <div className="fin-form-grid">
        <Field label="Registration number"><TextInput aria-label="Registration number" value={number} onChange={(event) => setNumber(event.target.value)} /></Field>
        <Field label="Country"><TextInput aria-label="Country" value={country} onChange={(event) => setCountry(event.target.value)} /></Field>
        <Field label="Functional currency" hint="A currency other than the organisation's is never converted here.">
          <Select aria-label="Functional currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {["GBP", "USD", "EUR"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Parent">
        <Select aria-label="Parent" value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">None, it is the top company</option>
          {data.entities.filter((entity) => entity.id !== existing?.id).map((entity) => <option key={entity.id} value={entity.id}>{entity.title}</option>)}
        </Select>
      </Field>
      {cycle && <Notice tone="danger" title="An entity cannot be its own parent" />}
      <Field label="What it does"><TextArea aria-label="What it does" value={summary} rows={2} onChange={(event) => setSummary(event.target.value)} /></Field>
      <OverlayActions
        primary={<Button type="submit" variant="primary" busy={busy} disabled={!title.trim() || duplicate || cycle}>{existing ? "Save entity" : "Record entity"}</Button>}
        end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
      />
    </form>
  );
}

export function ConsolidationPreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useFinData();
  const consolidation = consolidate(data.entities, data.journals);
  const [busy, setBusy] = useState(false);
  const balanced = consolidation.groupDebitMinor === consolidation.groupCreditMinor;

  return (
    <Stack gap={4}>
      <OverlaySummary eyebrow="Consolidation preview" title={`${consolidation.columns.length} entities`}
        status={balanced ? <Pill tone="success" dot>Group balances</Pill> : <Pill tone="danger" dot>Group does not balance</Pill>}
        meta={["Posted journals only; entity ledgers are never changed"]} />
      {!balanced && <Notice tone="danger" title="The group column does not balance">A journal has been counted twice or an elimination has removed one side only.</Notice>}
      <StatementRow
        context={context}
        rows={[
          ...consolidation.columns.map((column) => ({ label: column.label, minor: column.debitMinor })),
          { label: "Intercompany eliminated", minor: -consolidation.eliminationMinor },
          { label: "Group debits", minor: consolidation.groupDebitMinor, bold: true },
          { label: "Group credits", minor: consolidation.groupCreditMinor, bold: true },
        ]}
      />
      {balanced && <SourceNote>Every posted journal was counted once and each intercompany journal was removed once.</SourceNote>}
      {consolidation.unassignedJournalIds.length > 0 && (
        <Notice tone="warning" title={`${consolidation.unassignedJournalIds.length} posted journals have no entity`}>
          They are counted in {consolidation.columns[0]?.label ?? "the first column"}. Tag them on the journal to put them in the right entity.
        </Notice>
      )}
      <DrawerActions>
        <OverlayActions
          primary={<Button
          variant="primary"
          busy={busy}
          disabled={!balanced || !context.can("export_data")}
          onClick={async () => {
            setBusy(true);
            try {
            await context.mutate.create({
              collection: "legalEntities",
              title: `Consolidation ${context.date(context.now)}`,
              status: "prepared",
              summary: `Group debits ${context.money(consolidation.groupDebitMinor)} after eliminating ${consolidation.eliminatedJournalIds.length} intercompany journals.`,
              amountMinor: consolidation.groupDebitMinor,
              fields: {
                kind: "consolidation",
                preparedBy: context.actor,
                entities: consolidation.columns.length,
                eliminatedJournals: consolidation.eliminatedJournalIds.length,
                eliminationMinor: consolidation.eliminationMinor,
              },
            }, `Consolidation prepared for ${consolidation.columns.length} entities`);
            context.toast("Consolidation recorded", "The group figures and the eliminations behind them are kept as a record in this browser.");
            close();
            } catch (error) {
              context.toast("Consolidation not recorded", error instanceof Error ? error.message : "Try again.", "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Record this consolidation
        </Button>}
          end={<OverlayCancel disabled={busy}>Cancel</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function FxSources() {
  const { org } = useWorkspace();
  const data = useFinData();
  const foreign = data.entities.filter((entity) => String(entity.fields.currency ?? org.currency) !== org.currency);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="No rate source is attached">
        A translated figure without a sourced rate would be invented. This screen shows the untranslated figure and says which currency it is in.
      </Notice>
      <FactGrid columns={3} items={[
        { label: "Reporting currency", value: org.currency, mono: true },
        { label: "Rates held", value: "None", mono: true, tone: "warning" },
        { label: "Entities needing a rate", value: String(foreign.length), mono: true, hint: foreign.length ? foreign.map((entity) => `${entity.title} (${String(entity.fields.currency)})`).join(", ") : "None" },
      ]} />
      <SourceNote>A rate record needs the currency pair, the rate, the date it applies to and its source.</SourceNote>
      <SourceNote>Where a rate matters for a statement, the statement says the figure is unavailable rather than converting at a guess.</SourceNote>
    </Stack>
  );
}

export function EntityPostings({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entity = data.entities.find((item) => item.id === payload?.id);
  const rows = data.journals.filter((journal) => journal.status === "posted" && (entity ? entityOf(journal) === entity.id : !entityOf(journal)));

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Entity", value: entity?.title ?? "Untagged journals" },
        { label: "Posted journals", value: String(rows.length) },
        { label: "Debits", value: <Amount minor={rows.reduce((sum, journal) => sum + journalLines(journal).reduce((inner, line) => inner + line.debitMinor, 0), 0)} context={context} bold /> },
      ]} />
      {rows.length === 0 ? (
        <Empty title="Nothing is tagged to this entity">
          A journal carries an entity on its record. Untagged journals fall into the first column of the consolidation, which the preview says plainly.
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Postings for this entity"
          filterable={false}
          columns={[
            { key: "date", header: "Date", cell: (row) => <span className="ds-num">{context.date(journalDate(row))}</span>, sortValue: (row) => journalDate(row) },
            { key: "title", header: "Journal", primary: true, cell: (row) => row.title },
            { key: "intercompany", header: "Intercompany", cell: (row) => isIntercompany(row) ? <Pill tone="warning">Eliminated</Pill> : <span className="ds-subtle">—</span> },
            { key: "amount", header: "Value", align: "end", cell: (row) => <Amount minor={row.amountMinor} context={context} /> },
          ]}
        />
      )}
    </Stack>
  );
}

export function EntitiesStrip({ context }: { context: ScreenContext }) {
  const data = useFinData();
  const consolidation = consolidate(data.entities, data.journals);
  return (
    <div className="fin-strip">
      <Pill tone="neutral">{data.entities.length} entities</Pill>
      <span>Group debits <Amount minor={consolidation.groupDebitMinor} context={context} bold /></span>
      <span>Eliminated <Amount minor={consolidation.eliminationMinor} context={context} bold /></span>
      {consolidation.unassignedJournalIds.length > 0 && <Pill tone="warning" dot>{consolidation.unassignedJournalIds.length} untagged journals</Pill>}
      <span className="ds-grow" />
      <span className="ds-subtle">Organisations are never consolidated with each other.</span>
    </div>
  );
}
