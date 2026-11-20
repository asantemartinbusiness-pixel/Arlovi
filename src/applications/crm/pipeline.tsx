import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { ArrowLeft, ArrowRight, GripVertical, Kanban } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, DrawerActions, Empty, Field, FactGrid, Grid, Kbd, MoneyInput, Notice, OverlayActions, OverlaySection,
  OverlaySummary, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import {
  LOST_REASONS, OPEN_STAGES, STAGES, activitiesFor, probabilityOf, stageGuard, stageIndex, stageOf,
} from "@/domain/crm-pipeline";
import type { Stage } from "@/domain/crm-pipeline";
import { companyById, companyOfDeal, contactById, contactOfDeal, dealsOfCompany, quotesOfDeal, stagesWithDeals, useCrmData } from "./data";
import { ActivityPill, ConsentPill, ForecastNote, Money, ProbabilityPill, StagePill } from "./parts";
import { clockIso } from "@/platform/clock";

/* ---------------------------- CRM-006 ---------------------------- *
 * Pipeline board.
 *
 * Drag works with a pointer and with the keyboard: a focused card is picked
 * up with Space or Enter, moved with the arrow keys and dropped with Space.
 * Every move runs the same `stageGuard`, so a card cannot be dragged past a
 * stage requirement that has not been met.
 * ------------------------------------------------------------------ */

interface MoveResult {
  ok: boolean;
  reason?: string;
}

export function useStageMove(context: ScreenContext) {
  return useCallback(async (deal: Rec, target: Stage): Promise<MoveResult> => {
    const reason = stageGuard(deal, target);
    if (reason) {
      context.toast("The deal did not move", reason, "blocked");
      return { ok: false, reason };
    }
    if (target.kind === "lost") {
      context.openOverlay("lost reason", { id: deal.id });
      return { ok: false, reason: "A lost deal needs a reason." };
    }
    await context.mutate.patch(deal.id, {
      status: target.id,
      fields: { ...deal.fields, stage: target.id, probability: target.probability },
    }, { expectRevision: deal.revision, event: `${deal.title} moved from ${stageOf(deal).label} to ${target.label}` });
    context.toast(
      "Stage changed",
      `${deal.title} is now in ${target.label}. Its weighting moved to ${target.probability}%, so the forecast changed by ${context.money(Math.round((Number(deal.amountMinor ?? 0) * (target.probability - probabilityOf(deal))) / 100))}.`,
    );
    return { ok: true };
  }, [context]);
}

export function PipelineBoard({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const move = useStageMove(context);
  const columns = stagesWithDeals(data);
  const [carried, setCarried] = useState<string | undefined>();
  const [dragging, setDragging] = useState<string | undefined>();
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);

  const carriedDeal = data.deals.find((deal) => deal.id === carried);

  useEffect(() => {
    if (!carriedDeal) return;
    setAnnouncement(`${carriedDeal.title} picked up from ${stageOf(carriedDeal).label}. Use the left and right arrow keys to choose a stage, then press Space to drop it, or Escape to put it back.`);
  }, [carriedDeal]);

  async function drop(deal: Rec, target: Stage) {
    const result = await move(deal, target);
    setCarried(undefined);
    setAnnouncement(result.ok
      ? `${deal.title} dropped in ${target.label}.`
      : `${deal.title} stayed in ${stageOf(deal).label}. ${result.reason ?? ""}`);
  }

  const onCardKeyDown = useCallback(async (event: React.KeyboardEvent<HTMLElement>, deal: Rec) => {
    const current = stageIndex(stageOf(deal).id);
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (carried === deal.id) { setCarried(undefined); setAnnouncement(`${deal.title} put back in ${stageOf(deal).label}.`); return; }
      if (carried) return;
      if (event.key === "Enter" && !event.shiftKey) { context.navigate(`/o/${org.slug}/crm/deals/${deal.id}`); return; }
      setCarried(deal.id);
      return;
    }
    if (event.key === "Escape" && carried === deal.id) {
      event.preventDefault();
      setCarried(undefined);
      setAnnouncement(`Move cancelled. ${deal.title} stays in ${stageOf(deal).label}.`);
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = STAGES[event.key === "ArrowRight" ? Math.min(STAGES.length - 1, current + 1) : Math.max(0, current - 1)];
    if (carried === deal.id) {
      await drop(deal, next);
      requestAnimationFrame(() => {
        boardRef.current?.querySelector<HTMLElement>(`[data-deal="${CSS.escape(deal.id)}"]`)?.focus();
      });
      return;
    }
    const sibling = boardRef.current?.querySelector<HTMLElement>(`[data-stage="${CSS.escape(next.id)}"] [data-deal]`);
    sibling?.focus();
  }, [carried, context, org.slug, drop]);

  if (data.deals.length === 0) {
    return (
      <Empty title="No deal in the pipeline" icon={<Kanban size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Deal drawer")}>Create a deal</Button>}>
        A deal carries an amount, a stage and the evidence each stage needs.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="human" label="Open pipeline" value={context.money(data.forecast.pipelineMinor)} meta={`${data.forecast.openCount} open deals`} />
        <Stat prov="human" label="Weighted forecast" value={context.money(data.forecast.weightedMinor)} meta="Amount × probability, open deals only" />
        <Stat prov="human" label="Closed won" value={context.money(data.forecast.wonMinor)} meta="Revenue sits in the ledger, not the forecast" />
        <Stat prov="human" label="Closed lost" value={context.money(data.forecast.lostMinor)} meta={`${data.forecast.byStage.find((entry) => entry.stage.kind === "lost")?.count ?? 0} deals`} />
      </StatRow>

      <Notice tone="info" title="Moving a card with the keyboard">
        Tab to a card, then press <Kbd>Space</Kbd> to pick it up, <Kbd>←</Kbd> <Kbd>→</Kbd> to choose a stage and <Kbd>Space</Kbd> to drop it. <Kbd>Esc</Kbd> puts it back and <Kbd>Enter</Kbd> opens the deal. The same validation runs however the card is moved.
      </Notice>

      <div role="status" aria-live="polite" className="ds-sr-only">{announcement}</div>

      <div ref={boardRef} className="crm-board" style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`, gap: "var(--space-3)", overflowX: "auto", alignItems: "start" }}>
        {columns.map(({ stage, deals }) => (
          <section
            key={stage.id}
            data-stage={stage.id}
            aria-label={`${stage.label}, ${deals.length} deals`}
            className="ds-panel"
            style={{ padding: "var(--space-3)", minWidth: 220, outline: carriedDeal && stageGuard(carriedDeal, stage) === undefined && stageOf(carriedDeal).id !== stage.id ? "2px dashed var(--accent)" : undefined }}
            onDragOver={(event) => { if (dragging) event.preventDefault(); }}
            onDrop={async (event) => {
              event.preventDefault();
              const deal = data.deals.find((item) => item.id === dragging);
              setDragging(undefined);
              if (deal) await drop(deal, stage);
            }}
          >
            <Row gap={2} style={{ marginBlockEnd: "var(--space-3)" }}>
              <strong className="ds-grow">{stage.label}</strong>
              <Pill tone="neutral">{deals.length}</Pill>
            </Row>
            <Row gap={2} style={{ marginBlockEnd: "var(--space-3)" }}>
              <Money minor={deals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)} context={context} bold />
              {stage.kind === "open" && <span className="ds-subtle">at {stage.probability}%</span>}
            </Row>
            <Stack gap={2}>
              {deals.map((deal) => {
                const contact = contactOfDeal(data, deal);
                const company = companyOfDeal(data, deal);
                const picked = carried === deal.id;
                return (
                  <article
                    key={deal.id}
                    data-deal={deal.id}
                    tabIndex={0}
                    role="button"
                    aria-pressed={picked}
                    aria-label={`${deal.title}, ${context.money(Number(deal.amountMinor ?? 0))}, ${stage.label}, ${probabilityOf(deal)} per cent`}
                    draggable
                    onDragStart={() => setDragging(deal.id)}
                    onDragEnd={() => setDragging(undefined)}
                    onKeyDown={(event) => { void onCardKeyDown(event, deal); }}
                    onClick={() => context.select(deal.id)}
                    onDoubleClick={() => context.navigate(`/o/${org.slug}/crm/deals/${deal.id}`)}
                    className="ds-record-card"
                    style={{
                      cursor: "grab",
                      borderColor: picked ? "var(--accent)" : undefined,
                      boxShadow: picked ? "var(--shadow-md, 0 4px 12px rgba(0,0,0,.18))" : undefined,
                    }}
                  >
                    <Row gap={2}>
                      <GripVertical size={14} aria-hidden="true" />
                      <strong className="ds-grow" style={{ textAlign: "start" }}>{deal.title}</strong>
                      <ProbabilityPill deal={deal} />
                    </Row>
                    <span className="ds-subtle" style={{ textAlign: "start" }}>{company?.title ?? "No account"} · {contact?.title ?? "no contact"}</span>
                    <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                      <Money minor={deal.amountMinor} context={context} bold />
                      <span className="ds-grow" />
                      {deal.dueAt && <span className="ds-subtle">{context.date(deal.dueAt)}</span>}
                    </Row>
                    <Row gap={1} style={{ marginBlockStart: "var(--space-2)" }}>
                      <Button
                        size="sm" variant="ghost" iconOnly
                        aria-label={`Move ${deal.title} back a stage`}
                        disabled={stageIndex(stage.id) === 0}
                        onClick={(event) => { event.stopPropagation(); void drop(deal, STAGES[stageIndex(stage.id) - 1]); }}
                      >
                        <ArrowLeft size={14} />
                      </Button>
                      <Button
                        size="sm" variant="ghost" iconOnly
                        aria-label={`Move ${deal.title} forward a stage`}
                        disabled={stageIndex(stage.id) >= STAGES.length - 1}
                        onClick={(event) => { event.stopPropagation(); void drop(deal, STAGES[stageIndex(stage.id) + 1]); }}
                      >
                        <ArrowRight size={14} />
                      </Button>
                      <span className="ds-grow" />
                      <Button
                        size="sm" variant="ghost"
                        onClick={(event) => { event.stopPropagation(); context.select(deal.id); context.openOverlay("Deal drawer", { id: deal.id }); }}
                      >
                        Details
                      </Button>
                    </Row>
                    {picked && <span className="ds-subtle" style={{ display: "block", marginBlockStart: 4 }}>Picked up. Arrow keys choose a stage, Space drops.</span>}
                  </article>
                );
              })}
              {deals.length === 0 && <span className="ds-subtle">Nothing in this stage.</span>}
            </Stack>
          </section>
        ))}
      </div>

      {data.forecast.withoutAmountIds.length > 0 && (
        <Notice tone="warning" title={`${data.forecast.withoutAmountIds.length} deal${data.forecast.withoutAmountIds.length === 1 ? "" : "s"} have no amount`}>
          They are shown on the board but excluded from every figure above, because a missing amount is not nil.
        </Notice>
      )}
    </Stack>
  );
}

export function PipelineList({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  return (
    <DataGrid
      rows={data.deals}
      rowId={(row) => row.id}
      label="Deals"
      selectedId={context.selectedId}
      onSelect={(id) => context.select(id)}
      columns={[
        { key: "title", header: "Deal", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "company", header: "Account", cell: (row) => companyOfDeal(data, row)?.title ?? "None", filterValue: (row) => companyOfDeal(data, row)?.title ?? "" },
        { key: "contact", header: "Contact", hideBelow: 1200, cell: (row) => contactOfDeal(data, row)?.title ?? "None" },
        { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} />, sortValue: (row) => stageIndex(stageOf(row).id), filterValue: (row) => stageOf(row).label },
        { key: "probability", header: "Weighting", align: "end", cell: (row) => <ProbabilityPill deal={row} />, sortValue: (row) => probabilityOf(row) },
        { key: "close", header: "Expected close", cell: (row) => row.dueAt ? <span className="ds-num">{context.date(row.dueAt)}</span> : <span className="ds-subtle">Not set</span>, sortValue: (row) => row.dueAt ?? "~" },
        { key: "owner", header: "Owner", hideBelow: 1400, cell: (row) => String(row.fields.owner ?? row.ownerName) },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        { key: "weighted", header: "Weighted", align: "end", cell: (row) => <Money minor={Math.round((Number(row.amountMinor ?? 0) * probabilityOf(row)) / 100)} context={context} />, sortValue: (row) => Math.round((Number(row.amountMinor ?? 0) * probabilityOf(row)) / 100) },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/crm/deals/${id}`)}
      bulkActions={[
        {
          label: "Assign to me",
          onRun: async (selected) => {
            for (const deal of selected) {
              if (!(await context.mutate.patch(deal.id, { fields: { ...deal.fields, owner: context.actor } }, { event: `${deal.title} assigned to ${context.actor}` }))) return;
            }
            context.toast("Owner changed", `${selected.length} ${selected.length === 1 ? "deal" : "deals"} now belong to ${context.actor}.`);
          },
        },
      ]}
      summary={<>
        <span className="ds-subtle">Weighted</span>
        <Money minor={data.forecast.weightedMinor} context={context} bold />
      </>}
    />
  );
}

export function PipelineForecast({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const open = data.forecast.byStage.filter((entry) => entry.stage.kind === "open");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A forecast is a prediction, not settled revenue">
        Each figure is an open deal's amount multiplied by its stage weighting. Nothing here is in the ledger; recognised revenue lives in Finance and comes from posted journals.
      </Notice>
      <Grid>
        <Card prov="human" span={7} title="Weighted value by stage" subtitle="Open stages only">
          <BarChart
            title="Pipeline and weighted value by stage"
            height={240}
            format={(value) => context.money(value)}
            series={[
              { name: "Pipeline", points: open.map((entry) => ({ label: entry.stage.label, value: entry.amountMinor })) },
              { name: "Weighted", points: open.map((entry) => ({ label: entry.stage.label, value: entry.weightedMinor })) },
            ]}
            footer={`${data.forecast.openCount} open deals. Closed-won and closed-lost deals are excluded.`}
          />
        </Card>
        <Card prov="human" span={5} title="Conversion between stages" subtitle="Count of deals that have reached each stage">
          <Stack gap={3}>
            {data.forecast.byStage.map((entry) => (
              <div key={entry.stage.id}>
                <Row gap={2}>
                  <span className="ds-grow">{entry.stage.label}</span>
                  <span className="ds-subtle">{entry.count}</span>
                  <Money minor={entry.amountMinor} context={context} />
                </Row>
              </div>
            ))}
            <ForecastNote>
              Conversion is counted from the stage each deal is in now. This workspace does not keep a stage-change history for every deal, so it is not a cohort conversion rate.
            </ForecastNote>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

export function PipelineTeam({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const rows = data.owners.map((owner) => {
    const deals = data.deals.filter((deal) => String(deal.fields.owner ?? deal.ownerName) === owner);
    const open = deals.filter((deal) => stageOf(deal).kind === "open");
    return {
      owner,
      deals: deals.length,
      openCount: open.length,
      pipelineMinor: open.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      weightedMinor: open.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0),
      wonMinor: deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      stale: open.filter((deal) => activitiesFor(data.activities, deal.id).length === 0).length,
    };
  });

  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.owner}
        label="Pipeline by owner"
        filterable={false}
        columns={[
          { key: "owner", header: "Owner", primary: true, cell: (row) => row.owner, sortValue: (row) => row.owner },
          { key: "deals", header: "Deals", align: "end", cell: (row) => <span className="ds-num">{row.deals}</span> },
          { key: "open", header: "Open", align: "end", cell: (row) => <span className="ds-num">{row.openCount}</span> },
          { key: "pipeline", header: "Pipeline", align: "end", cell: (row) => <Money minor={row.pipelineMinor} context={context} /> },
          { key: "weighted", header: "Weighted", align: "end", cell: (row) => <Money minor={row.weightedMinor} context={context} bold /> },
          { key: "won", header: "Closed won", align: "end", cell: (row) => <Money minor={row.wonMinor} context={context} /> },
          { key: "stale", header: "No logged activity", align: "end", cell: (row) => row.stale ? <Pill tone="warning">{row.stale}</Pill> : <span className="ds-subtle">—</span> },
        ]}
      />
      <Notice tone="info" title="Role views are not a privacy boundary">
        Everyone's pipeline is visible here. A role view shapes what the interface offers and is not enforced on a server.
      </Notice>
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

/** Head of the Deal drawer: the saved deal (or a new one) and a link to the full record. */
export function DealDrawerSummary({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.deals.find((deal) => deal.id === (payload?.id ?? context.selectedId));
  const company = companyOfDeal(data, existing);
  return (
    <OverlaySummary
      eyebrow={existing ? "Deal" : "New deal"}
      title={existing ? existing.title : "New deal"}
      status={existing ? <StagePill deal={existing} /> : undefined}
      meta={[
        company?.title ?? "No account yet",
        `Owner ${existing ? String(existing.fields.owner ?? existing.ownerName) : context.actor}`,
        existing ? `${quotesOfDeal(data, existing.id).length} quote(s)` : undefined,
      ]}
      actions={existing ? <Button size="sm" variant="ghost" onClick={() => { close(); context.navigate(`/o/${context.org.slug}/crm/deals/${existing.id}`); }}>Open the full record</Button> : undefined}
    />
  );
}

export function DealDrawer({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = data.deals.find((deal) => deal.id === (payload?.id ?? context.selectedId));
  const draftScope = `crm:deal:${org.id}:${context.actor}:${payload?.id || existing?.id || "new"}`;
  // Resolve record-backed fields dynamically; an asynchronous record load must
  // not be overwritten by the editor's initial empty state.
  const [draftTitle, setTitle] = useWorkingField<string | undefined>(draftScope, "title", undefined);
  const [draftAmount, setAmount] = useWorkingField<number | undefined>(draftScope, "amount", undefined);
  const [draftContact, setContactId] = useWorkingField<string | undefined>(draftScope, "contactId", undefined);
  const [draftCompany, setCompanyId] = useWorkingField<string | undefined>(draftScope, "companyId", undefined);
  const [draftStage, setStageId] = useWorkingField<string | undefined>(draftScope, "stageId", undefined);
  const [draftCloseDate, setCloseDate] = useWorkingField<string | undefined>(draftScope, "closeDate", undefined);
  const [draftSummary, setSummary] = useWorkingField<string | undefined>(draftScope, "summary", undefined);
  const title = draftTitle ?? existing?.title ?? "";
  const amount = draftAmount ?? Number(existing?.amountMinor ?? 0);
  const contactId = draftContact ?? String(existing?.fields.contactId ?? "");
  const companyId = draftCompany ?? String(existing?.fields.companyId ?? "");
  const stageId = draftStage ?? (existing ? stageOf(existing).id : "discovery");
  const closeDate = draftCloseDate ?? String(existing?.fields.closeDate ?? "");
  const summary = draftSummary ?? existing?.summary ?? "";
  const [busy, setBusy] = useState(false);

  const stage = STAGES.find((item) => item.id === stageId)!;
  const guard = existing && stageId !== stageOf(existing).id ? stageGuard(existing, stage) : undefined;
  const contact = contactById(data, contactId);
  const company = companyById(data, companyId) ?? companyById(data, String(contact?.fields.companyId ?? ""));
  const weighted = Math.round((amount * stage.probability) / 100);
  const weightedBefore = existing ? Math.round((Number(existing.amountMinor ?? 0) * probabilityOf(existing)) / 100) : undefined;
  const accountDeals = dealsOfCompany(data, company?.id).filter((deal) => deal.id !== existing?.id && stageOf(deal).kind === "open");
  const accountOpenMinor = accountDeals.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0);
  // The account's own history, then the chosen contact's, newest first and without repeats.
  const recent = [...new Map([...activitiesFor(data.activities, company?.id), ...activitiesFor(data.activities, contactId)]
    .map((activity) => [activity.id, activity])).values()]
    .sort((a, b) => (b.startAt ?? b.at ?? b.updatedAt).localeCompare(a.startAt ?? a.at ?? a.updatedAt))
    .slice(0, 4);
  const closeAt = closeDate ? `${closeDate}T12:00:00.000Z` : undefined;
  const overdue = Boolean(closeAt && new Date(closeAt) < now && stage.kind === "open");
  const editable = context.can("edit_pipeline");

  const save = async () => {
    setBusy(true);
    const fields: Record<string, string | number | boolean> = {
      stage: stageId,
      probability: stage.probability,
      owner: existing ? String(existing.fields.owner ?? context.actor) : context.actor,
    };
    if (contactId) fields.contactId = contactId;
    if (companyId) fields.companyId = companyId;
    if (closeDate) fields.closeDate = closeDate;
    if (existing) {
      const saved = await context.mutate.patch(existing.id, {
        title: title.trim(), summary, amountMinor: amount, status: stageId,
        dueAt: closeDate ? `${closeDate}T00:00:00.000Z` : existing.dueAt,
        fields: { ...existing.fields, ...fields },
      }, { expectRevision: existing.revision, event: `Deal ${title.trim()} updated` });
      if (!saved) { setBusy(false); return; }
      context.toast("Deal saved", `${title.trim()} is in ${stage.label} at ${stage.probability}%.`);
    } else {
      const created = await context.mutate.create({
        collection: "deals", title: title.trim(), status: stageId, summary,
        amountMinor: amount,
        at: now.toISOString(),
        dueAt: closeDate ? `${closeDate}T00:00:00.000Z` : undefined,
        parentId: companyId || undefined,
        fields,
      }, `Deal ${title.trim()} created`);
      context.select(created.id);
      context.toast("Deal created", `${created.title} is in ${stage.label}. Its weighted value is ${context.money(weighted)}.`);
    }
    clearWorkingDraft(draftScope);
    setBusy(false);
    close();
  };

  return (
    <Stack gap={4}>
      <Stack gap={3}>
        <Field label="Deal" required><TextInput aria-label="Deal" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
        <div className="crm-deal-pair">
          <Field label="Amount" hint="No amount, no forecast figure.">
            <MoneyInput label="Deal amount" currency={org.currency} valueMinor={amount} onChangeMinor={setAmount} />
          </Field>
          <Field label="Stage">
            <Select aria-label="Stage" value={stageId} onChange={(event) => setStageId(event.target.value)}>
              {STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Expected close" hint={closeAt ? (overdue ? `${context.relative(closeAt)}: past due while still open` : context.relative(closeAt)) : "Negotiation needs a close date."}>
          <TextInput aria-label="Expected close" type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} />
        </Field>
        <div className="crm-deal-pair">
          <Field label="Account">
            <Select aria-label="Account" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">None</option>
              {data.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </Field>
          <Field label="Contact">
            <Select aria-label="Contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">None</option>
              {data.contacts.filter((item) => !companyId || String(item.fields.companyId ?? "") === companyId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes"><TextArea aria-label="Notes" value={summary} rows={2} onChange={(event) => setSummary(event.target.value)} /></Field>
      </Stack>

      {guard && <Notice tone="warning" title="That stage change will be refused">{guard}</Notice>}

      <OverlaySection title="What it is worth" hint="Amount x stage probability. A prediction, not revenue.">
        <FactGrid columns={2} items={[
          { label: "Probability", value: `${stage.probability}%`, mono: true, hint: stage.label },
          { label: "Weighted value", value: context.money(weighted), mono: true, tone: stage.kind === "lost" ? "danger" : undefined,
            hint: weightedBefore !== undefined && weightedBefore !== weighted ? `was ${context.money(weightedBefore)}` : undefined },
          { label: "Expected close", value: closeAt ? context.relative(closeAt) : "Not set", tone: overdue ? "warning" : undefined },
          { label: "To leave this stage", value: stage.requires?.length ? stage.requires.map((item) => item.label).join(", ") : stage.kind === "open" ? "Nothing more" : "Closed",
            tone: stage.requires?.some((item) => !(existing && String(existing.fields[item.field] ?? "") !== "" && existing.fields[item.field] !== false)) ? "warning" : undefined },
        ]} />
      </OverlaySection>

      <OverlaySection title="Account and contact" hint={company ? undefined : "Pick an account to see what else is open there."}>
        {company ? (
          <FactGrid columns={2} dense items={[
            { label: "Account owner", value: String(company.fields.owner ?? company.ownerName) },
            { label: "Other open deals", value: accountDeals.length ? `${accountDeals.length} worth ${context.money(accountOpenMinor)}` : "None", mono: accountDeals.length > 0 },
            { label: "Contact", value: contact?.title ?? "Not named", hint: contact ? String(contact.fields.role ?? "") : "Discovery needs a named contact." },
            { label: "Email consent", value: contact ? <ConsentPill contact={contact} /> : "Unknown" },
          ]} />
        ) : null}
      </OverlaySection>

      <OverlaySection title="Recent activity" hint={recent.length ? "Calls, meetings and notes on this account and contact." : undefined}>
        {recent.length === 0 ? (
          <p className="ds-subtle">Nothing logged yet. A first call or note starts the history.</p>
        ) : (
          <ul className="crm-deal-activity">
            {recent.map((activity) => (
              <li key={activity.id}>
                <ActivityPill activity={activity} />
                <span className="crm-deal-activity-title">{activity.title}</span>
                <span className="ds-subtle ds-num">{context.relative(activity.startAt ?? activity.at ?? activity.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </OverlaySection>

      <WorkingDraftStatus scope={draftScope} />
      <DrawerActions>
        <OverlayActions
          busy={busy}
          primary={
            <Button
              variant="primary"
              busy={busy}
              disabled={!title.trim() || Boolean(guard) || !editable}
              title={!editable ? "Editing the pipeline needs the Sales or Owner role view" : guard}
              onClick={() => { void save(); }}
            >
              {existing ? "Save the deal" : "Create the deal"}
            </Button>
          }
          end={<>
            <Button variant="ghost" onClick={close}>Close & keep draft</Button>
            <Button variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard changes</Button>
          </>}
        />
      </DrawerActions>
    </Stack>
  );
}

export function StageChangeValidation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const move = useStageMove(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const deal = data.deals.find((item) => item.id === (payload?.id ?? context.selectedId ?? context.params.id));
  const [target, setTarget] = useState(deal ? stageOf(deal).id : "discovery");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="Select a deal first">Choose a card on the board, then validate a stage change.</Empty>;

  const stage = STAGES.find((item) => item.id === target)!;
  const guard = stageGuard(deal, stage);
  const current = stageOf(deal);
  const requirements = current.requires ?? [];

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Deal", value: deal.title },
        { label: "Current stage", value: current.label },
        { label: "Amount", value: <Money minor={deal.amountMinor} context={context} bold /> },
      ]} />
      <Field label="Move to">
        <Select aria-label="Move to" value={target} onChange={(event) => setTarget(event.target.value)}>
          {STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Card prov="human" title={`What ${current.label} requires before a deal advances`} subtitle={requirements.length ? undefined : "Nothing beyond an amount."}>
        <Stack gap={2}>
          {requirements.map((requirement) => {
            const value = deal.fields[requirement.field];
            const met = value !== undefined && value !== "" && value !== false;
            return (
              <Row key={requirement.field} gap={2}>
                <Pill tone={met ? "success" : "danger"} dot>{met ? "Met" : "Missing"}</Pill>
                <span className="ds-grow">{requirement.label}</span>
                <span className="ds-subtle">{met ? String(value) : "not recorded"}</span>
              </Row>
            );
          })}
          {requirements.length === 0 && <span className="ds-subtle">This stage has no extra requirement.</span>}
        </Stack>
      </Card>
      {guard
        ? <Notice tone="danger" title="This move will be refused">{guard}</Notice>
        : <Notice tone="success" title="This move is allowed">The weighting will change from {probabilityOf(deal)}% to {stage.probability}%.</Notice>}
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={Boolean(guard)}
          onClick={async () => { setBusy(true); await move(deal, stage); setBusy(false); close(); }}
        >
          Move to {stage.label}
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function LostReason({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const deal = data.deals.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!deal) return <Empty title="Select a deal first" />;

  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Closing a deal as lost is recorded, not deleted">
        {deal.title} stays in the pipeline with its reason, which is what makes a win and loss analysis possible later.
      </Notice>
      <Properties rows={[
        { label: "Deal", value: deal.title },
        { label: "Amount", value: <Money minor={deal.amountMinor} context={context} bold /> },
        { label: "Current stage", value: stageOf(deal).label },
      ]} />
      <Field label="Reason" required>
        <Select aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)}>
          {LOST_REASONS.map((item) => <option key={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="What happened"><TextArea aria-label="What happened" value={note} rows={3} onChange={(event) => setNote(event.target.value)} /></Field>
      <Row gap={2}>
        <Button
          variant="danger"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            await context.mutate.patch(deal.id, {
              status: "lost",
              summary: note || deal.summary,
              fields: { ...deal.fields, stage: "lost", probability: 0, lostReason: reason, lostAt: clockIso(), lostBy: context.actor },
            }, { expectRevision: deal.revision, event: `${deal.title} closed lost: ${reason}` });
            context.toast("Deal closed lost", `${deal.title} is recorded as lost for ${reason.toLowerCase()}. The weighted forecast fell by ${context.money(Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100))}.`);
            setBusy(false);
            close();
          }}
        >
          Close as lost
        </Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </Row>
    </Stack>
  );
}

export function PipelineStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{data.forecast.openCount} open</Pill>
      <span>Pipeline <Money minor={data.forecast.pipelineMinor} context={context} bold /></span>
      <span>Weighted <Money minor={data.forecast.weightedMinor} context={context} bold /></span>
      {OPEN_STAGES.map((stage) => {
        const entry = data.forecast.byStage.find((item) => item.stage.id === stage.id);
        return <span key={stage.id} className="ds-subtle">{stage.label} {entry?.count ?? 0}</span>;
      })}
      <span className="ds-grow" />
      <span className="ds-subtle">A forecast is a prediction, not revenue.</span>
    </Row>
  );
}

