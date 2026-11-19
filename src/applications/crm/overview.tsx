import { WorkingDraftStatus } from "@/app/WorkingDraftStatus";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, Target, TrendingUp } from "lucide-react";
import {
  BarChart, Button, Card, DataGrid, DonutChart, Empty, Field, FactGrid, Grid, MoneyInput, Notice, OverlaySection, Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { clearWorkingDraft, useWorkingField } from "@/platform/workingDrafts";
import { freshness } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { activitiesFor, probabilityOf, stageOf } from "@/domain/crm-pipeline";
import { periodLabel, recentPeriods } from "@/domain/fin-ledger";
import { companyOfDeal, contactById, contactOfDeal, useCrmData } from "./data";
import type { CrmData } from "./data";
import { ActivityPill, ConsentPill, ForecastNote, Money, StagePill } from "./parts";

/* ---------------------------- CRM-001 ---------------------------- */

function quietDeals(data: CrmData, now: Date, days = 10): { deal: Rec; quietFor: number }[] {
  return data.deals
    .filter((deal) => stageOf(deal).kind === "open")
    .map((deal) => {
      const latest = activitiesFor(data.activities, deal.id)[0];
      const at = latest?.startAt ?? latest?.at ?? deal.updatedAt;
      return { deal, quietFor: Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000) };
    })
    .filter((entry) => entry.quietFor >= days)
    .sort((a, b) => b.quietFor - a.quietFor);
}

export function CrmOverview({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const open = data.deals.filter((deal) => stageOf(deal).kind === "open");
  const quiet = quietDeals(data, now);
  const upcoming = data.activities
    .filter((activity) => activity.status === "open" && new Date(activity.startAt ?? activity.at ?? now) >= now)
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))
    .slice(0, 6);
  const won = data.deals.filter((deal) => stageOf(deal).kind === "won");
  const lost = data.deals.filter((deal) => stageOf(deal).kind === "lost");
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : undefined;
  const months = recentPeriods(now, 6);
  const latestTouch = data.activities.map((activity) => activity.startAt ?? activity.at ?? "").sort().at(-1);
  const touchAge = freshness(latestTouch, now, 5);

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Open pipeline" value={context.money(data.forecast.pipelineMinor)} meta={`${open.length} open deals`} prov="human"
          onClick={() => context.openOverlay("Metric drilldown", { metric: "pipeline" })} />
        <Stat label="Weighted forecast" value={context.money(data.forecast.weightedMinor)} meta="A prediction, not revenue" prov="human"
          onClick={() => context.openOverlay("Metric drilldown", { metric: "weighted" })} />
        <Stat label="Closed won" value={context.money(data.forecast.wonMinor)} meta={`${won.length} deals · revenue sits in Finance`} prov="posted"
          onClick={() => context.openOverlay("Metric drilldown", { metric: "won" })} />
        <Stat
          label="Win rate"
          value={winRate === undefined ? "Unavailable" : `${winRate}%`}
          unavailable={winRate === undefined}
          meta={winRate === undefined ? "No closed deal to count" : `${won.length} won against ${lost.length} lost`}
        />
        <Stat
          label="Last customer contact"
          value={touchAge.known ? context.date(latestTouch) : "Unavailable"}
          unavailable={!touchAge.known}
          meta={touchAge.known ? `${touchAge.days} days ago${touchAge.stale ? " · going quiet" : ""}` : "Nothing logged"}
        />
      </StatRow>

      <Grid>
        <Card span={8} eyebrow="PIPELINE" prov="human" title="Value by stage" subtitle="Amount and weighted value across the open stages">
          <BarChart
            title="Pipeline and weighted value by stage"
            height={230}
            format={(value) => context.money(value)}
            series={[
              { name: "Amount", points: data.forecast.byStage.filter((entry) => entry.stage.kind === "open").map((entry) => ({ label: entry.stage.label, value: entry.amountMinor })) },
              { name: "Weighted", points: data.forecast.byStage.filter((entry) => entry.stage.kind === "open").map((entry) => ({ label: entry.stage.label, value: entry.weightedMinor })) },
            ]}
            footer={`${data.deals.length} deals in this workspace. Closed deals are excluded from both series.`}
          />
        </Card>

        <Card span={4} eyebrow="CONVERSION" prov="human" title="Where deals sit" subtitle="Count by stage">
          <DonutChart
            title="Deals by stage"
            size={150}
            format={(value) => String(Math.round(value))}
            points={data.forecast.byStage.filter((entry) => entry.count > 0).map((entry) => ({ label: entry.stage.label, value: entry.count }))}
          />
          <ForecastNote>
            Counted from the stage each deal is in now. This workspace keeps no stage-change history, so it is not a conversion rate between stages.
          </ForecastNote>
        </Card>

        <Card span={7} eyebrow="DECISIONS" prov="human" title="Deals that have gone quiet" subtitle={`${quiet.length} open deals with no activity for ten days or more`} flush>
          {quiet.length === 0 ? (
            <div className="ds-card-body"><Empty title="Nothing has gone quiet" icon={<TrendingUp size={20} />}>Every open deal has been touched in the last ten days.</Empty></div>
          ) : (
            <DataGrid
              rows={quiet}
              rowId={(row) => row.deal.id}
              label="Quiet deals"
              filterable={false}
              pageSize={6}
              rowTone={(row) => (row.quietFor > 20 ? "warning" : undefined)}
              columns={[
                { key: "deal", header: "Deal", primary: true, cell: (row) => <Link to={`/o/${org.slug}/crm/deals/${row.deal.id}`} style={{ color: "inherit" }}>{row.deal.title}</Link> },
                { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row.deal} /> },
                { key: "quiet", header: "Quiet for", align: "end", cell: (row) => <span className="ds-num">{row.quietFor}d</span>, sortValue: (row) => row.quietFor },
                { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.deal.amountMinor} context={context} bold /> },
              ]}
              onOpen={(id) => context.navigate(`/o/${org.slug}/crm/deals/${id}`)}
            />
          )}
        </Card>

        <Card span={5} eyebrow="DIARY" prov="human" title="Next up" subtitle={`${upcoming.length} open activities ahead`}>
          {upcoming.length === 0 ? (
            <Empty title="Nothing is scheduled">A call or task scheduled from a deal appears here.</Empty>
          ) : (
            <Stack gap={3}>
              {upcoming.map((activity) => (
                <Row key={activity.id} gap={3}>
                  <span className="ds-num ds-subtle" style={{ width: 96 }}>{context.date(activity.startAt ?? activity.at)}</span>
                  <ActivityPill activity={activity} />
                  <span className="ds-grow ds-truncate">{activity.title}</span>
                  <span className="ds-subtle">{String(activity.fields.owner ?? activity.ownerName)}</span>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={6} eyebrow="ACTIVITY" prov="human" title="Logged activity by month" subtitle="What was actually recorded">
          <BarChart
            title="Activity by month"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{
              name: "Activities",
              points: months.map((period) => ({
                label: periodLabel(period, org.locale).slice(0, 3),
                value: data.activities.filter((activity) => (activity.startAt ?? activity.at ?? "").slice(0, 7) === period).length,
              })),
            }]}
          />
        </Card>

        <Card span={6} eyebrow="OUTCOMES" prov="human" title="Win and loss" subtitle="Closed deals with their reasons">
          <Stack gap={3}>
            <Row gap={3}>
              <Pill tone="success" dot>Won {won.length}</Pill>
              <Money minor={data.forecast.wonMinor} context={context} bold />
              <span className="ds-grow" />
              <Pill tone="danger" dot>Lost {lost.length}</Pill>
              <Money minor={data.forecast.lostMinor} context={context} bold />
            </Row>
            <Stack gap={2}>
              {[...new Set(lost.map((deal) => String(deal.fields.lostReason ?? "No reason recorded")))].map((reason) => (
                <Row key={reason} gap={3}>
                  <span className="ds-grow">{reason}</span>
                  <span className="ds-subtle">{lost.filter((deal) => String(deal.fields.lostReason ?? "No reason recorded") === reason).length}</span>
                </Row>
              ))}
              {lost.length === 0 && <span className="ds-subtle">No deal has been closed lost.</span>}
            </Stack>
            {winRate === undefined && (
              <Notice tone="info" title="A win rate needs closed deals">
                With nothing closed, a rate would be invented. It is shown as unavailable instead.
              </Notice>
            )}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

export function MyPipeline({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const mine = data.deals.filter((deal) => String(deal.fields.owner ?? deal.ownerName) === context.actor);
  const open = mine.filter((deal) => stageOf(deal).kind === "open");
  const quiet = quietDeals(data, now).filter((entry) => String(entry.deal.fields.owner ?? entry.deal.ownerName) === context.actor);

  if (mine.length === 0) {
    return (
      <Empty title={`No deal is owned by ${context.actor}`} icon={<Target size={20} />}
        action={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/crm/deals`)}>Open the whole pipeline</Button>}>
        Ownership comes from the owner field on a deal. The Team tab shows everyone's.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Your open deals" value={String(open.length)} prov="human" />
        <Stat label="Your pipeline" value={context.money(open.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0))} prov="human" />
        <Stat label="Your weighted forecast" value={context.money(open.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0))} prov="human" />
        <Stat label="Gone quiet" value={String(quiet.length)} meta={quiet.length ? "Ten days or more with nothing logged" : "All touched recently"} prov={quiet.length ? "unknown" : "human"} />
      </StatRow>
      <DataGrid
        rows={mine}
        rowId={(row) => row.id}
        label="My deals"
        columns={[
          { key: "deal", header: "Deal", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "company", header: "Account", cell: (row) => companyOfDeal(data, row)?.title ?? "None" },
          { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} /> },
          { key: "close", header: "Close", cell: (row) => row.dueAt ? <span className="ds-num">{context.date(row.dueAt)}</span> : <span className="ds-subtle">Not set</span> },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} bold />, sortValue: (row) => Number(row.amountMinor ?? 0) },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/crm/deals/${id}`)}
      />
    </Stack>
  );
}

export function TeamOverview({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const rows = data.owners.map((owner) => {
    const deals = data.deals.filter((deal) => String(deal.fields.owner ?? deal.ownerName) === owner);
    const open = deals.filter((deal) => stageOf(deal).kind === "open");
    const quiet = quietDeals(data, now).filter((entry) => String(entry.deal.fields.owner ?? entry.deal.ownerName) === owner);
    const activities = data.activities.filter((activity) => String(activity.fields.owner ?? activity.ownerName) === owner);
    return {
      owner,
      open: open.length,
      pipelineMinor: open.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      weightedMinor: open.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0),
      wonMinor: deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      quiet: quiet.length,
      activities: activities.length,
    };
  });

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Everyone's pipeline is visible to every role view">
        A role view shapes what the interface offers and is not an account security boundary. Treat this as a shared board, not a private one.
      </Notice>
      <DataGrid
        rows={rows}
        rowId={(row) => row.owner}
        label="Pipeline by owner"
        filterable={false}
        columns={[
          { key: "owner", header: "Owner", primary: true, cell: (row) => row.owner, sortValue: (row) => row.owner },
          { key: "open", header: "Open", align: "end", cell: (row) => <span className="ds-num">{row.open}</span> },
          { key: "pipeline", header: "Pipeline", align: "end", cell: (row) => <Money minor={row.pipelineMinor} context={context} /> },
          { key: "weighted", header: "Weighted", align: "end", cell: (row) => <Money minor={row.weightedMinor} context={context} bold /> },
          { key: "won", header: "Won", align: "end", cell: (row) => <Money minor={row.wonMinor} context={context} /> },
          { key: "activities", header: "Logged", align: "end", cell: (row) => <span className="ds-num">{row.activities}</span> },
          { key: "quiet", header: "Quiet deals", align: "end", cell: (row) => row.quiet ? <Pill tone="warning">{row.quiet}</Pill> : <span className="ds-subtle">—</span> },
        ]}
      />
    </Stack>
  );
}

export function CampaignsPanel({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const linked = data.campaigns.map((campaign) => {
    const deals = data.deals.filter((deal) => String(deal.fields.campaignId ?? "") === campaign.id);
    return {
      campaign,
      deals,
      pipelineMinor: deals.filter((deal) => stageOf(deal).kind === "open").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
      wonMinor: deals.filter((deal) => stageOf(deal).kind === "won").reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0),
    };
  });

  return (
    <Stack gap={4}>
      <Notice tone="info" title="Attribution is whatever was recorded on the deal">
        A deal carries a campaign id if someone set one. Nothing is inferred from timing, and no click or open is tracked: no marketing provider is connected.
      </Notice>
      {linked.length === 0 ? (
        <Empty title="No campaign recorded" icon={<Megaphone size={20} />}>
          Campaigns live in Marketing. A deal links to one by its campaign field.
        </Empty>
      ) : (
        <Grid>
          {linked.map((entry) => (
            <Card
              key={entry.campaign.id}
              span={6}
              eyebrow="CAMPAIGN"
              prov="human"
              title={entry.campaign.title}
              subtitle={entry.campaign.summary}
              actions={<Pill tone={entry.campaign.status === "draft" ? "neutral" : "info"} dot>{entry.campaign.status}</Pill>}
              footer={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${org.slug}/market/campaigns`)}>Open in Marketing</Button>}
            >
              <Stack gap={3}>
                <Properties rows={[
                  { label: "Deals attributed", value: String(entry.deals.length) },
                  { label: "Open pipeline", value: <Money minor={entry.pipelineMinor} context={context} bold /> },
                  { label: "Closed won", value: <Money minor={entry.wonMinor} context={context} /> },
                  { label: "Delivery", value: entry.campaign.fields.delivery === "not_connected" ? "Not connected" : String(entry.campaign.fields.delivery ?? "Local only") },
                ]} />
                <Stack gap={2}>
                  {entry.deals.map((deal) => (
                    <Row key={deal.id} gap={3}>
                      <Link to={`/o/${org.slug}/crm/deals/${deal.id}`} className="ds-grow" style={{ color: "inherit" }}>{deal.title}</Link>
                      <StagePill deal={deal} />
                      <Money minor={deal.amountMinor} context={context} />
                    </Row>
                  ))}
                  {entry.deals.length === 0 && <span className="ds-subtle">No deal is attributed to this campaign.</span>}
                </Stack>
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

/* --------------------------- Overlays --------------------------- */

export function CrmMetricDrilldown({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org } = useWorkspace();
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const metric = payload?.metric ?? "pipeline";
  if (metric === "conversion") {
    const leads = data.leads;
    const converted = leads.filter((lead) => lead.status === "converted" || lead.fields.dealId);
    const qualified = leads.filter((lead) => ["qualified", "converted"].includes(lead.status) || lead.fields.dealId);
    const closed = data.deals.filter((deal) => ["won", "lost"].includes(stageOf(deal).kind));
    const won = closed.filter((deal) => stageOf(deal).kind === "won");
    const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "No data");
    return (
      <Stack gap={4}>
        <FactGrid columns={4} items={[
          { label: "Leads", value: String(leads.length), mono: true },
          { label: "Qualified", value: pct(qualified.length, leads.length), mono: true, hint: `${qualified.length} of ${leads.length}` },
          { label: "Became a deal", value: pct(converted.length, leads.length), mono: true, hint: `${converted.length} of ${leads.length}` },
          { label: "Win rate", value: pct(won.length, closed.length), mono: true, hint: `${won.length} of ${closed.length} closed` },
        ]} />
        <OverlaySection title="Closed deals behind the win rate" hint="An open deal is neither a win nor a loss yet, so it is not counted.">
        <DataGrid
          rows={closed}
          rowId={(row) => row.id}
          label="Closed deals behind the win rate"
          filterable={false}
          columns={[
            { key: "deal", header: "Deal", primary: true, cell: (row) => row.title },
            { key: "stage", header: "Outcome", cell: (row) => <StagePill deal={row} /> },
            { key: "reason", header: "Lost reason", cell: (row) => String(row.fields.lostReason ?? "—") },
            { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
          ]}
          onOpen={(id) => { context.closeOverlay(); context.navigate(`/o/${org.slug}/crm/deals/${id}`); }}
        />
        </OverlaySection>
      </Stack>
    );
  }
  const rows = metric === "won"
    ? data.deals.filter((deal) => stageOf(deal).kind === "won")
    : data.deals.filter((deal) => stageOf(deal).kind === "open");
  const total = rows.reduce((sum, deal) => sum + (metric === "weighted" ? Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100) : Number(deal.amountMinor ?? 0)), 0);
  const largest = [...rows].sort((a, b) => Number(b.amountMinor ?? 0) - Number(a.amountMinor ?? 0))[0];

  return (
    <Stack gap={4}>
      <FactGrid columns={4} items={[
        { label: "Deals", value: String(rows.length), mono: true },
        { label: metric === "weighted" ? "Weighted total" : "Total", value: context.money(total), mono: true },
        { label: "Average", value: rows.length ? context.money(Math.round(total / rows.length)) : "None", mono: true },
        { label: "Largest", value: largest ? context.money(Number(largest.amountMinor ?? 0)) : "None", mono: true, hint: largest?.title },
      ]} />
      <OverlaySection title="Rows behind the figure" hint={metric === "weighted"
        ? "Each row contributes its amount multiplied by its probability."
        : metric === "won"
          ? "Closed-won deals. The money itself is recognised in Finance from posted journals, not here."
          : "Open deals only. A closed deal is not pipeline."}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Metric sources"
        filterable={false}
        columns={[
          { key: "deal", header: "Deal", primary: true, cell: (row) => row.title },
          { key: "contact", header: "Contact", cell: (row) => contactOfDeal(data, row)?.title ?? "None" },
          { key: "stage", header: "Stage", cell: (row) => <StagePill deal={row} /> },
          { key: "probability", header: "Weighting", align: "end", cell: (row) => <span className="ds-num">{probabilityOf(row)}%</span> },
          { key: "amount", header: "Amount", align: "end", cell: (row) => <Money minor={row.amountMinor} context={context} /> },
          ...(metric === "weighted" ? [{
            key: "weighted", header: "Weighted", align: "end" as const,
            cell: (row: Rec) => <Money minor={Math.round((Number(row.amountMinor ?? 0) * probabilityOf(row)) / 100)} context={context} bold />,
          }] : []),
        ]}
        onOpen={(id) => { context.closeOverlay(); context.navigate(`/o/${org.slug}/crm/deals/${id}`); }}
        summary={<Money
          minor={metric === "weighted"
            ? rows.reduce((sum, deal) => sum + Math.round((Number(deal.amountMinor ?? 0) * probabilityOf(deal)) / 100), 0)
            : rows.reduce((sum, deal) => sum + Number(deal.amountMinor ?? 0), 0)}
          context={context}
          bold
        />}
      />
      </OverlaySection>
    </Stack>
  );
}

export function NewLead({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const draftScope = `crm:new-lead:${context.org.id}:${context.actor}`;
  const [title, setTitle] = useWorkingField(draftScope, "title", "");
  const [source, setSource] = useWorkingField(draftScope, "source", "website");
  const [amount, setAmount] = useWorkingField(draftScope, "amountMinor", 0);
  const [contactId, setContactId] = useWorkingField(draftScope, "contactId", "");
  const [companyId, setCompanyId] = useWorkingField(draftScope, "companyId", "");
  const [note, setNote] = useWorkingField(draftScope, "note", "");
  const [busy, setBusy] = useState(false);
  const contact = contactById(data, contactId);

  return (
    <form
      id="new-lead"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const fields: Record<string, string | number | boolean> = { source, stage: "new", owner: context.actor };
        if (contactId) fields.contactId = contactId;
        if (companyId) fields.companyId = companyId;
        const created = await context.mutate.create({
          collection: "leads",
          title: title.trim(),
          status: "new",
          summary: note || `${source} enquiry recorded in this workspace.`,
          amountMinor: amount,
          at: now.toISOString(),
          fields,
        }, `Lead ${title.trim()} created`);
        clearWorkingDraft(draftScope);
        context.toast("Lead created", contact
          ? `${created.title} is in the inbox against ${contact.title}.`
          : `${created.title} is in the inbox. Without a contact record it cannot be converted to a deal.`);
        setBusy(false);
        close();
      }}
    >
      <Field label="What the enquiry is" required><TextInput aria-label="What the enquiry is" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3} wrap>
        <Field label="Source">
          <Select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}>
            {["website", "showroom", "referral", "event", "inbound call"].map((item) => <option key={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Value they mentioned" hint="What was said, not a forecast.">
          <MoneyInput label="Lead value" currency={context.org.currency} valueMinor={amount} onChangeMinor={setAmount} />
        </Field>
      </Row>
      <Row gap={3} wrap>
        <Field label="Contact">
          <Select aria-label="Contact" value={contactId} onChange={(event) => {
            setContactId(event.target.value);
            // Naming a person also names their account unless one was already chosen.
            const linked = contactById(data, event.target.value)?.fields.companyId;
            if (linked && !companyId) setCompanyId(String(linked));
          }}>
            <option value="">None yet</option>
            {data.contacts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
        <Field label="Account">
          <Select aria-label="Account" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">None yet</option>
            {data.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </Field>
      </Row>
      {contact?.fields.suppressed === true && (
        <Notice tone="danger" title={`${contact.title} is suppressed`}>
          The lead can be recorded, but no outreach will be drafted and no automation will touch it.
        </Notice>
      )}
      <Field label="Notes"><TextArea aria-label="Notes" value={note} rows={2} onChange={(event) => setNote(event.target.value)} /></Field>
      <OverlaySection title="What happens next" hint="Decided from the records you picked, before anything is saved.">
        <FactGrid columns={2} dense items={[
          { label: "Can become a deal", value: contact ? "Yes" : "Not until a contact is named", tone: contact ? "success" : "warning" },
          { label: "Email consent", value: contact ? <ConsentPill contact={contact} /> : "Unknown" },
          { label: "Owner", value: context.actor },
          { label: "Lands in", value: "Inbox, unqualified" },
        ]} />
      </OverlaySection>
      <Row gap={2}>
        <Button type="submit" variant="primary" busy={busy} disabled={!title.trim()}>Create the lead</Button>
        <span className="ds-grow" />
        <Button variant="ghost" onClick={close}>Close & keep draft</Button>
        <Button variant="ghost" onClick={() => { clearWorkingDraft(draftScope); close(); }}>Discard draft</Button>
      </Row>
      <WorkingDraftStatus scope={draftScope} />
    </form>
  );
}

export function InsightCard({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { org, now } = useWorkspace();
  const quiet = quietDeals(data, now);
  const noQuote = data.deals.filter((deal) => stageOf(deal).id === "proposal" && !deal.fields.quoteId);
  const noAmount = data.forecast.withoutAmountIds.map((id) => data.deals.find((deal) => deal.id === id)).filter((deal): deal is Rec => Boolean(deal));
  const noTaxStatus = data.contacts.filter((contact) => !contact.fields.taxStatus && data.deals.some((deal) => String(deal.fields.contactId ?? "") === contact.id));

  const notes = [
    quiet.length > 0 && {
      id: "quiet",
      title: `${quiet.length} open deal${quiet.length === 1 ? " has" : "s have"} gone quiet`,
      body: `The oldest is ${quiet[0].deal.title}, ${quiet[0].quietFor} days without a logged activity.`,
      evidence: "Counted from the latest activity record linked to each open deal.",
      to: `/o/${org.slug}/crm/deals/${quiet[0].deal.id}`,
    },
    noQuote.length > 0 && {
      id: "noquote",
      title: `${noQuote.length} deal${noQuote.length === 1 ? " is" : "s are"} in Proposal with no quote`,
      body: `${noQuote.map((deal) => deal.title).join(", ")} cannot advance until a quote is linked.`,
      evidence: "The stage requirement for Proposal is a linked quote id on the deal.",
      to: `/o/${org.slug}/crm/quotes`,
    },
    noAmount.length > 0 && {
      id: "noamount",
      title: `${noAmount.length} deal${noAmount.length === 1 ? " has" : "s have"} no amount`,
      body: `${noAmount.map((deal) => deal.title).join(", ")} are excluded from every pipeline and forecast figure.`,
      evidence: "A deal with no amount is excluded rather than counted as zero.",
      to: `/o/${org.slug}/crm/deals`,
    },
    noTaxStatus.length > 0 && {
      id: "taxstatus",
      title: `${noTaxStatus.length} contact${noTaxStatus.length === 1 ? " on a deal has" : "s on deals have"} no tax status`,
      body: `An invoice to ${noTaxStatus.map((contact) => contact.title).join(", ")} cannot resolve a tax rate and would be held as unknown.`,
      evidence: "The tax engine resolves a rate from jurisdiction, line category, customer status and date.",
      to: `/o/${org.slug}/crm/contacts`,
    },
  ].filter((note): note is { id: string; title: string; body: string; evidence: string; to: string } => Boolean(note));

  return (
    <Stack gap={4}>
      <p className="ds-subtle">Arithmetic over records, not a model. Each note names where it was counted from.</p>
      {notes.length === 0 ? (
        <Empty title="Nothing notable">Notes appear when a deal goes quiet, a stage requirement is missing or a figure has no source.</Empty>
      ) : (
        notes.map((note) => (
          <OverlaySection key={note.id} title={note.title} tone="warning" hint={note.evidence}
            actions={<Button size="sm" variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(note.to); }}>Open the source</Button>}>
            <p>{note.body}</p>
          </OverlaySection>
        ))
      )}
    </Stack>
  );
}

export function CrmOverviewStrip({ context }: { context: ScreenContext }) {
  const data = useCrmData();
  const { now } = useWorkspace();
  const quiet = quietDeals(data, now);
  return (
    <Row gap={4} wrap>
      <Pill tone="neutral">{data.forecast.openCount} open deals</Pill>
      <span>Pipeline <Money minor={data.forecast.pipelineMinor} context={context} bold /></span>
      <span>Weighted <Money minor={data.forecast.weightedMinor} context={context} bold /></span>
      <Pill tone={quiet.length ? "warning" : "success"} dot>{quiet.length} quiet</Pill>
      <span className="ds-grow" />
      <span className="ds-subtle">{data.contacts.filter((contact) => contact.fields.suppressed === true).length} suppressed contacts are excluded from every automation.</span>
    </Row>
  );
}
