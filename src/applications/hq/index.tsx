import { useMemo, useState, type JSX } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2, CalendarDays, Clock, Compass, Flag, Landmark, Network, Target, Users,
} from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice,
  Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput, Avatar,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import * as repo from "@/platform/repo";
import { freshness, resolveRange, addDays, sameDay } from "@/platform/clock";
import { Building } from "@/applications/hq/pieces";
import { outstandingMinor, receivablePosition } from "@/applications/fin/data";
import { approvalRows } from "@/applications/inbox/engine";
import {
  AddResource, ArrangeCards, AssignLeader, AssignTaskTo, AssignWork, ChooseScope, FindColleague, HOME_CARDS,
  LinkMission, MessageTeam, OpenDepartment, RecommendationsManager, ReorderDepartments, RequestHelp, ReviewGoal,
  SetPrimaryOffice, StartConversation, TimelineFilter, guardSelection, listField, openDepartmentAppFor,
  openLatestDraft, pinTask, prioritizeTask, sortDepartments, timelineFilter, usePref, writePref, type Insight,
} from "@/applications/hq/actions";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * HQ — Headquarters & Organization
 * Reference implementation of the application-module contract: every screen
 * owns its layout, every tab renders its own panel, every action has a typed
 * handler and every overlay is its own component.
 * ====================================================================== */

const HQ_COLLECTIONS = ["objectives", "departments", "members", "locations", "timelineEvents", "tasks", "missions", "invoices", "journals", "documents", "legalEntities", "brands", "risks", "approvals"];
const HQ_EMPTY: Record<string, Rec[]> = Object.fromEntries(HQ_COLLECTIONS.map((name) => [name, [] as Rec[]]));

/**
 * One read of every collection HQ shows. `loaded` is false until the read has
 * returned, so a figure is never stated as zero while it is still loading.
 */
function useHqRead(): { data: Record<string, Rec[]>; loaded: boolean } {
  const { org } = useWorkspace();
  const rows = useLiveQuery(async () => {
    const entries = await Promise.all(HQ_COLLECTIONS.map(async (name) => [name, await repo.listByCollection(org.id, name)] as const));
    return Object.fromEntries(entries) as Record<string, Rec[]>;
  }, [org.id]);
  return { data: rows ?? HQ_EMPTY, loaded: rows !== undefined };
}

function useHqData() {
  return useHqRead().data;
}

/* ---------------------------- HQ-001 ---------------------------- */

/**
 * The state of the company, written as a sentence.
 *
 * The most characteristic thing in this product's world is not a greeting; it
 * is whether the company is in a state that needs a person. Each figure is set
 * in the data face and carries the material of its source, so the line can be
 * read for trust before it is read for meaning.
 */
function StateOfPlay({
  context, loaded = true, approvals, missions, overdue, ledgerDays, ledgerStale,
}: {
  context: ScreenContext;
  loaded?: boolean;
  approvals: number;
  missions: number;
  overdue: number;
  ledgerDays: number | null;
  ledgerStale: boolean;
}) {
  const { now, org } = useWorkspace();
  const clauses: string[] = [];

  if (!loaded) clauses.push("Reading the state of the company");
  else clauses.push(approvals > 0
    ? `${approvals} ${approvals === 1 ? "decision is" : "decisions are"} waiting on you`
    : "Nothing is waiting on a decision");

  if (loaded) clauses.push(missions > 0
    ? `${missions} ${missions === 1 ? "mission is" : "missions are"} running`
    : "no mission is running");

  if (loaded && overdue > 0) {
    clauses.push(`${overdue} ${overdue === 1 ? "invoice is" : "invoices are"} past due`);
  }

  if (loaded) clauses.push(ledgerDays === null
    ? "the ledger has no recorded posting"
    : ledgerDays === 0
      ? "the ledger was posted today"
      : `${ledgerDays} ${ledgerDays === 1 ? "day" : "days"} since the ledger was posted`);

  return (
    <header className="hq-state">
      <p className="ds-eyebrow">
        {context.date(now, { weekday: "long", day: "numeric", month: "long" })} · {org.timezone.replace("_", " ")}
      </p>
      <h2 className="hq-state-line">
        {clauses.map((clause, index) => (
          <span key={clause}>
            {index === 0 ? clause : `${clause.charAt(0).toLowerCase()}${clause.slice(1)}`}
            {index === clauses.length - 1 ? "." : ", "}
          </span>
        ))}
      </h2>
      {ledgerStale && (
        <p className="ds-subtle" style={{ maxWidth: "52ch" }}>
          Figures below come from posted journals in this browser. Nothing is read from a bank feed.
        </p>
      )}
    </header>
  );
}

/** Recommendations computed from records in this workspace. Never inferred. */
export function useHomeInsights(): Insight[] {
  const data = useHqData();
  const { now, org } = useWorkspace();
  return useMemo(() => {
    const { overdue } = receivablePosition(data.invoices, now);
    const latestPost = data.journals.filter((journal) => journal.status === "posted").map((journal) => journal.at ?? journal.updatedAt).sort().at(-1);
    const ledgerAge = freshness(latestPost, now, 3);
    const list: Insight[] = [];
    if (overdue.length) list.push({ id: "overdue", title: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past due`, body: `Oldest is ${overdue[0].title}. Chasing is local; no mail provider is connected.`, to: `/o/${org.slug}/fin/invoices` });
    if (ledgerAge.stale) list.push({ id: "ledger", title: "The ledger has not been posted recently", body: ledgerAge.known ? `Last posting was ${ledgerAge.days} days ago.` : "No posting date is recorded.", to: `/o/${org.slug}/fin/ledger` });
    for (const objective of data.objectives) {
      const target = Number(objective.fields.target ?? 0);
      const current = Number(objective.fields.current ?? 0);
      if (objective.status === "active" && target > 0 && current / target < 0.6) {
        list.push({ id: objective.id, title: `${objective.title} is behind`, body: `${current} of ${target} ${String(objective.fields.measure ?? "")}.`, to: `/o/${org.slug}/hq/goals` });
      }
    }
    return list;
  }, [data.invoices, data.journals, data.objectives, now, org.slug]);
}

function ExecutiveHome({ context, range }: { context: ScreenContext; range: "today" | "week" }) {
  const { data, loaded } = useHqRead();
  const { now, org, actor } = useWorkspace();
  const window = resolveRange(range === "today" ? "today" : "week", now);
  const allInsights = useHomeInsights();
  const cardsPref = usePref("homeCards");
  const dismissPref = usePref("dismissedInsights");
  const hidden = listField(cardsPref, "hidden");
  const savedOrder = listField(cardsPref, "order");
  const order = savedOrder.length === HOME_CARDS.length ? savedOrder : HOME_CARDS.map((card) => card.key);
  const dismissed = listField(dismissPref, "ids");
  const insights = allInsights.filter((insight) => !dismissed.includes(insight.id));

  /* The Finance computation, so this home and /fin/home state one figure. */
  const position = receivablePosition(data.invoices, now);
  const overdue = position.overdue;
  const posted = data.journals.filter((journal) => journal.status === "posted");
  const latestPost = posted.map((journal) => journal.at ?? journal.updatedAt).sort().at(-1);
  const ledgerAge = freshness(latestPost, now, 3);
  /* The requests the Inbox lists as assigned to this person, read the same way. */
  const approvals = approvalRows(data.approvals, "Mine", actor);
  const active = data.missions.filter((mission) => ["running", "executing", "dispatched"].includes(mission.status));
  const dueInWindow = data.tasks.filter((task) => task.dueAt && new Date(task.dueAt) >= window.start && new Date(task.dueAt) < window.end);

  async function dismiss(id: string) {
    await writePref(context, "dismissedInsights", "Dismissed recommendations", { ids: [...dismissed, id].join(",") });
    context.toast("Recommendation dismissed", "Restore it from Dismiss recommendation in the actions menu.");
  }

  const cards: Record<string, JSX.Element> = {
    stats: (
      <div className="ds-col-12" key="stats">
        <StatRow>
          <Stat
            label="Receivable"
            value={loaded ? context.money(position.receivableMinor) : "Reading…"}
            unavailable={!loaded}
            prov={loaded ? "posted" : "unknown"}
            meta={loaded ? `${position.open.length} open invoices` : "Reading the ledger"}
            onClick={() => context.openOverlay("metric inspector", { metric: "receivable" })}
          />
          <Stat
            label="Overdue"
            value={loaded ? context.money(position.overdueMinor) : "Reading…"}
            unavailable={!loaded}
            prov={loaded ? "posted" : "unknown"}
            meta={loaded ? `${overdue.length} past due` : "Reading the ledger"}
            onClick={() => context.openOverlay("metric inspector", { metric: "overdue" })}
          />
          <Stat
            label="Ledger posted"
            value={ledgerAge.known ? context.date(latestPost) : "Unavailable"}
            unavailable={!ledgerAge.known}
            prov={ledgerAge.known && !ledgerAge.stale ? "posted" : "unknown"}
            meta={ledgerAge.known ? `${ledgerAge.days} days ago${ledgerAge.stale ? " · stale" : ""}` : "No posting recorded"}
            onClick={() => context.openOverlay("metric inspector", { metric: "ledger" })}
          />
          <Stat label="Bank feed" value="Not connected" unavailable meta="Balances come from posted journals" />
        </StatRow>
      </div>
    ),
    waiting: (
      <Card key="waiting" span={7} title="Waiting on you" eyebrow="Decisions" prov="human" subtitle={loaded ? `${window.label} · ${approvals.length} items` : `${window.label} · reading`}>
        {!loaded ? (
          <p className="ds-subtle">Reading the approval requests in this workspace…</p>
        ) : approvals.length === 0 ? (
          <Empty title="Nothing to approve" icon={<Flag size={20} />}>Approvals appear here when a record is submitted for a decision.</Empty>
        ) : (
          <Stack gap={2}>
            {approvals.slice(0, 5).map((record) => (
              <Row key={record.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow">
                  <strong>{record.title}</strong>
                  <p className="ds-subtle">{record.summary}</p>
                </div>
                {record.amountMinor !== undefined && <strong className="ds-num">{context.money(record.amountMinor)}</strong>}
                <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/inbox/approvals`)}>Review</Button>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    ),
    missions: (
      <Card key="missions" span={5} title="Active missions" eyebrow="AI workforce" prov="agent" subtitle={`${active.length} running`}>
        {active.length === 0 ? (
          <Empty title="No mission is running" icon={<Compass size={20} />}>Start one from Missions to see progress here.</Empty>
        ) : (
          <Stack gap={3}>
            {active.map((mission) => {
              const budget = Number(mission.fields.budgetMinor ?? 0);
              const spent = Number(mission.fields.spentMinor ?? 0);
              return (
                <div key={mission.id}>
                  <Row gap={2}>
                    <Link to={`/o/${org.slug}/mission/missions/${mission.id}`} className="ds-grow" style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>{mission.title}</Link>
                    <Pill tone="info" dot>{mission.status}</Pill>
                  </Row>
                  <p className="ds-subtle" style={{ marginBlock: 4 }}>{mission.summary}</p>
                  {budget > 0 && (
                    <>
                      <Meter value={spent} max={budget} label={`${mission.title} budget used`} tone={spent > budget * 0.9 ? "warning" : undefined} />
                      <span className="ds-subtle">{context.money(spent)} of {context.money(budget)} committed locally</span>
                    </>
                  )}
                </div>
              );
            })}
          </Stack>
        )}
      </Card>
    ),
    due: (
      <Card key="due" span={7} title={range === "today" ? "Due today" : "Due this week"} subtitle={`${dueInWindow.length} items between ${context.date(window.start)} and ${context.date(addDays(window.end, -1))}`}>
        {dueInWindow.length === 0
          ? <Empty title="Nothing is dated in this window" icon={<CalendarDays size={20} />}>Work with a date appears here.</Empty>
          : (
            <DataGrid
              rows={dueInWindow}
              rowId={(row) => row.id}
              label="Work due"
              filterable={false}
              columns={[
                { key: "title", header: "Item", primary: true, cell: (row) => row.title, sortValue: (row) => row.title },
                { key: "owner", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.assignee ?? row.ownerName)} size="sm" />{String(row.fields.assignee ?? row.ownerName)}</Row> },
                { key: "due", header: "Due", align: "end", cell: (row) => context.date(row.dueAt), sortValue: (row) => row.dueAt ?? "" },
              ]}
              onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)}
            />
          )}
      </Card>
    ),
    recommended: (
      <Card key="recommended" span={5} title="Recommended" eyebrow="Computed here" prov="agent" subtitle="Derived from records in this workspace, never inferred">
        {insights.length === 0 ? (
          <Empty title="No recommendations" icon={<Target size={20} />}>
            {dismissed.length > 0 ? `${dismissed.length} dismissed. Restore them from Dismiss recommendation.` : "Recommendations are computed from records here, never invented."}
          </Empty>
        ) : (
          <Stack gap={2}>
            {insights.map((insight) => (
              <div key={insight.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <strong>{insight.title}</strong>
                <p className="ds-subtle">{insight.body}</p>
                <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                  {insight.to && <Button size="sm" variant="secondary" onClick={() => context.navigate(insight.to!)}>Open</Button>}
                  <Button size="sm" variant="ghost" onClick={() => void dismiss(insight.id)}>Dismiss</Button>
                </Row>
              </div>
            ))}
          </Stack>
        )}
      </Card>
    ),
  };

  const visible = order.filter((key) => !hidden.includes(key));

  return (
    <Stack gap={5}>
      <StateOfPlay
        context={context}
        loaded={loaded}
        approvals={approvals.length}
        missions={active.length}
        overdue={overdue.length}
        ledgerDays={ledgerAge.known ? ledgerAge.days : null}
        ledgerStale={ledgerAge.stale}
      />
      {visible.length === 0 ? (
        <Empty title="Every card is hidden" icon={<Compass size={20} />} action={<Button variant="secondary" onClick={() => context.openOverlay("Widget picker")}>Arrange cards</Button>}>
          Choose which cards Executive Home shows.
        </Empty>
      ) : (
        <Grid>{visible.map((key) => cards[key]).filter(Boolean)}</Grid>
      )}
    </Stack>
  );
}

function SavedViews({ context }: { context: ScreenContext }) {
  const preferences = useCollection("preferences");
  const saved = preferences.filter((record) => record.fields.kind === "savedView");
  return saved.length === 0 ? (
    <Empty title="No saved views yet" icon={<Compass size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("save view dialog")}>Save this view</Button>}>
      A saved view keeps the period, filters and card arrangement you are using.
    </Empty>
  ) : (
    <DataGrid
      rows={saved}
      rowId={(row) => row.id}
      label="Saved views"
      columns={[
        { key: "title", header: "View", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
        { key: "scope", header: "Scope", cell: (row) => String(row.fields.scope ?? "Executive Home") },
        { key: "updated", header: "Updated", align: "end", cell: (row) => context.date(row.updatedAt), sortValue: (row) => row.updatedAt },
      ]}
    />
  );
}

/* ---------------------------- HQ-002 ---------------------------- */

function MyWorkspace({ context, view }: { context: ScreenContext; view: "Today" | "Upcoming" | "Saved" | "History" }) {
  const { now, org, actor } = useWorkspace();
  const data = useCollections(["tasks", "documents", "messages", "meetings", "members"]);
  const mine = data.tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === actor);
  const today = mine.filter((task) => task.dueAt && sameDay(new Date(task.dueAt), now));
  const upcoming = mine.filter((task) => task.dueAt && new Date(task.dueAt) > now);
  const done = mine.filter((task) => task.status === "done");
  const pinned = mine.filter((task) => task.tags.includes("pinned"));
  const rows = view === "Today"
    ? (today.length ? today : mine.filter((task) => task.status !== "done"))
    : view === "Upcoming" ? upcoming : view === "History" ? done : pinned;
  const meetingsToday = data.meetings
    .filter((meeting) => meeting.startAt && sameDay(new Date(meeting.startAt), now))
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));

  return (
    <Grid>
      <Card span={8} title={view === "History" ? "Completed work" : view === "Saved" ? "Pinned work" : "Assigned to you"} subtitle={`${rows.length} items · select a row to prioritise or pin it`} flush>
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="My work"
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          empty={view === "Saved"
            ? <Empty title="Nothing pinned" icon={<Flag size={20} />}>Select a task and choose Pin item to keep it here.</Empty>
            : undefined}
          columns={[
            { key: "title", header: "Task", primary: true, cell: (row) => <Row gap={2}>{row.tags.includes("pinned") && <Pill tone="accent">Pinned</Pill>}{row.title}</Row>, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "priority", header: "Priority", cell: (row) => <Pill tone={row.fields.priority === "high" ? "danger" : "neutral"}>{String(row.fields.priority ?? "normal")}</Pill>, sortValue: (row) => (row.fields.priority === "high" ? 0 : 1) },
            { key: "stage", header: "Stage", cell: (row) => <Pill tone={row.status === "done" ? "success" : row.status === "review" ? "warning" : "neutral"}>{String(row.fields.stage ?? row.status)}</Pill> },
            { key: "due", header: "Due", align: "end", cell: (row) => context.date(row.dueAt), sortValue: (row) => row.dueAt ?? "~" },
          ]}
          onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)}
          bulkActions={[
            { label: "Raise priority", onRun: (selected) => selected.forEach((task) => context.mutate.patch(task.id, { fields: { ...task.fields, priority: "high" } }, { event: "Priority raised from My Workspace" })) },
            { label: "Mark done", onRun: (selected) => selected.forEach((task) => context.mutate.patch(task.id, { status: "done", fields: { ...task.fields, stage: "done" } }, { event: "Completed from My Workspace" })) },
          ]}
        />
      </Card>

      <Card span={4} title="Your day" subtitle={context.date(now, { weekday: "long", day: "numeric", month: "long" })}>
        {meetingsToday.length === 0 ? (
          <Empty title="No meetings today" icon={<CalendarDays size={20} />}>Meetings with a start time today appear here, in your local time.</Empty>
        ) : (
          <Stack gap={3}>
            {meetingsToday.map((meeting) => (
              <Row key={meeting.id} gap={3} style={{ alignItems: "flex-start" }}>
                <strong className="ds-num" style={{ width: 48 }}>{context.date(meeting.startAt, { hour: "2-digit", minute: "2-digit" })}</strong>
                <div className="ds-grow"><strong>{meeting.title}</strong><p className="ds-subtle">{meeting.summary}</p></div>
              </Row>
            ))}
          </Stack>
        )}
      </Card>

      <Card span={4} title="Drafts" subtitle={`${data.documents.filter((doc) => doc.status === "draft").length} unfinished`}>
        <Stack gap={2}>
          {data.documents.filter((doc) => doc.status === "draft").slice(0, 4).map((doc) => (
            <Button key={doc.id} variant="ghost" style={{ justifyContent: "flex-start" }} onClick={() => context.navigate(`/o/${org.slug}/docs/documents/${doc.id}`)}>{doc.title}</Button>
          ))}
          {data.documents.filter((doc) => doc.status === "draft").length === 0 && <span className="ds-subtle">No drafts.</span>}
        </Stack>
      </Card>

      <Card span={4} title="Mentions">
        <Stack gap={2}>
          {data.messages.filter((message) => message.summary.includes("@")).slice(0, 4).map((message) => (
            <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <strong>{String(message.fields.author ?? message.ownerName)}</strong>
              <p className="ds-subtle">{message.summary}</p>
            </div>
          ))}
          {data.messages.filter((message) => message.summary.includes("@")).length === 0 && <span className="ds-subtle">Nobody has mentioned you.</span>}
        </Stack>
      </Card>

      <Card span={4} title="Teammate availability">
        <Stack gap={2}>
          {data.members.slice(0, 6).map((member) => (
            <Row key={member.id} gap={2}>
              <Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />
              <span className="ds-grow ds-truncate">{member.title}</span>
              <Pill tone={member.fields.kind === "ai" ? "accent" : "success"} dot>{member.fields.kind === "ai" ? "Agent" : "Available"}</Pill>
            </Row>
          ))}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- HQ-003 ---------------------------- */

function CompanyOverview({ context, lens }: { context: ScreenContext; lens: "Business" | "Performance" | "Operations" | "Compliance" }) {
  const data = useHqData();
  const { now, org } = useWorkspace();
  const revenue = data.invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0);
  const entity = data.legalEntities[0];

  if (lens === "Business") {
    return (
      <Grid>
        <Card span={5} title="Entity profile" subtitle={org.jurisdiction}>
          <Properties rows={[
            { label: "Legal name", value: entity?.title ?? `${org.name} Ltd` },
            { label: "Registration", value: org.registration ?? "Not recorded" },
            { label: "Jurisdiction", value: org.jurisdiction },
            { label: "Reporting currency", value: org.currency },
            { label: "Time zone", value: org.timezone },
            { label: "Locations", value: `${data.locations.length}` },
          ]} />
        </Card>
        <Card span={7} title="Objectives" subtitle={`${data.objectives.length} tracked`}>
          <Stack gap={4}>
            {data.objectives.map((objective) => {
              const target = Number(objective.fields.target ?? 0);
              const current = Number(objective.fields.current ?? 0);
              return (
                <div key={objective.id}>
                  <Row gap={2}><strong className="ds-grow">{objective.title}</strong><span className="ds-num">{current} / {target} {String(objective.fields.measure ?? "")}</span></Row>
                  <Meter value={current} max={target || 1} label={objective.title} tone={target && current / target < 0.5 ? "warning" : "success"} />
                </div>
              );
            })}
          </Stack>
        </Card>
        <Card span={12} title="Departments" subtitle="Headcount and agents by department">
          <BarChart
            title="Members by department"
            height={190}
            series={[
              { name: "People", points: data.departments.map((dept) => ({ label: dept.title, value: data.members.filter((m) => m.fields.departmentId === dept.id && m.fields.kind === "human").length })) },
              { name: "AI employees", points: data.departments.map((dept) => ({ label: dept.title, value: data.members.filter((m) => m.fields.departmentId === dept.id && m.fields.kind === "ai").length })) },
            ]}
            format={(value) => String(Math.round(value))}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Performance") {
    return (
      <Grid>
        <Card span={12} title="Recognised revenue" subtitle="From paid invoices posted in this workspace">
          <BarChart
            title="Paid invoices by month"
            height={220}
            format={(value) => context.money(value)}
            series={[{
              name: "Paid",
              points: [5, 4, 3, 2, 1, 0].reverse().map((back) => {
                const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
                const total = data.invoices
                  .filter((invoice) => invoice.status === "paid" && invoice.at && new Date(invoice.at).getMonth() === month.getMonth() && new Date(invoice.at).getFullYear() === month.getFullYear())
                  .reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0);
                return { label: month.toLocaleString(org.locale, { month: "short" }), value: total };
              }),
            }]}
            footer={`Total recognised: ${context.money(revenue)}. Figures come from posted local records, not a bank feed.`}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Operations") {
    return (
      <Grid>
        <Card span={6} title="Open work" subtitle={`${data.tasks.filter((t) => t.status !== "done").length} items`}>
          <Stack gap={2}>
            {["ready", "doing", "review", "blocked"].map((stage) => {
              const count = data.tasks.filter((task) => (task.fields.stage ?? task.status) === stage).length;
              return <Row key={stage} gap={3}><span className="ds-grow" style={{ textTransform: "capitalize" }}>{stage}</span><strong className="ds-num">{count}</strong></Row>;
            })}
          </Stack>
        </Card>
        <Card span={6} title="Missions" subtitle={`${data.missions.length} recorded`}>
          <Stack gap={2}>
            {data.missions.map((mission) => (
              <Row key={mission.id} gap={2}><span className="ds-grow ds-truncate">{mission.title}</span><Pill tone={mission.status === "running" ? "info" : "neutral"}>{mission.status}</Pill></Row>
            ))}
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={12} title="Compliance posture" subtitle="Local records only">
        <Notice tone="warning" title="Intercompany totals are not consolidated">
          Northline and Harbor keep separate ledgers in this browser. No consolidation is performed, so parent and subsidiary figures are never added together here.
        </Notice>
      </Card>
      <Card span={6} title="Risks" subtitle={`${data.risks.length} on the register`}>
        {data.risks.length === 0 ? <Empty title="No risks recorded" /> : (
          <Stack gap={2}>
            {data.risks.map((risk) => <Row key={risk.id} gap={2}><span className="ds-grow">{risk.title}</span><Pill tone="warning">{risk.status}</Pill></Row>)}
          </Stack>
        )}
      </Card>
      <Card span={6} title="Data freshness">
        <Properties rows={[
          { label: "Ledger", value: freshness(data.journals.map((j) => j.at ?? j.updatedAt).sort().at(-1), now).known ? context.relative(data.journals.map((j) => j.at ?? j.updatedAt).sort().at(-1)) : "Unavailable" },
          { label: "Bank feed", value: <Pill tone="warning">Not connected</Pill> },
          { label: "Tax filing", value: <Pill tone="warning">Not connected</Pill> },
        ]} />
      </Card>
    </Grid>
  );
}

/* ---------------------------- HQ-004 / 005 ---------------------------- */

function DepartmentsDirectory({ context, scope }: { context: ScreenContext; scope: "All" | "My departments" | "Pinned" }) {
  const data = useHqData();
  const { org, actor } = useWorkspace();
  const mine = data.members.find((member) => member.title === actor)?.fields.departmentId;
  const ordered = sortDepartments(data.departments);
  const rows = scope === "My departments"
    ? ordered.filter((dept) => dept.id === mine)
    : scope === "Pinned"
      ? ordered.filter((dept) => dept.tags.includes("pinned"))
      : ordered;

  if (rows.length === 0) {
    return <Empty title={scope === "Pinned" ? "No pinned departments" : "No departments"} icon={<Building2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Create department")}>Create department</Button>}>Departments group people, agents and work.</Empty>;
  }

  return (
    <Grid>
      {rows.map((dept) => {
        const people = data.members.filter((member) => member.fields.departmentId === dept.id);
        const humans = people.filter((member) => member.fields.kind === "human");
        const agents = people.filter((member) => member.fields.kind === "ai");
        return (
          <Card
            key={dept.id}
            span={4}
            title={<Link to={`/o/${org.slug}/hq/departments/${dept.id}`} style={{ color: "inherit", textDecoration: "none" }}>{dept.title}</Link>}
            subtitle={dept.summary}
            actions={<Pill tone="neutral">{people.length} members</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/hq/departments/${dept.id}`)}>Open</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("organizational impact preview", { departmentId: dept.id })}>Impact</Button>
            </>}
          >
            <Stack gap={3}>
              <Properties rows={[
                { label: "Lead", value: String(dept.fields.lead ?? "Unassigned") },
                { label: "People", value: String(humans.length) },
                { label: "AI employees", value: String(agents.length) },
              ]} />
              <Row gap={1} wrap>
                {people.slice(0, 6).map((member) => <Avatar key={member.id} name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />)}
              </Row>
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

function DepartmentWorkspace({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useHqData();
  const { org } = useWorkspace();
  const dept = useRecord(context.params.id) ?? data.departments[0];
  const people = data.members.filter((member) => member.fields.departmentId === dept?.id);
  const work = data.tasks.filter((task) => people.some((member) => member.title === String(task.fields.assignee ?? task.ownerName)));

  if (!dept) return <Empty title="Department not found" />;

  if (lens === "People") {
    return (
      <DataGrid
        rows={people}
        rowId={(row) => row.id}
        label={`${dept.title} roster`}
        columns={[
          { key: "name", header: "Member", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.title} kind={row.fields.kind === "ai" ? "ai" : "human"} size="sm" />{row.title}</Row>, sortValue: (row) => row.title, filterValue: (row) => row.title },
          { key: "title", header: "Role", cell: (row) => String(row.fields.title ?? row.fields.role ?? "") },
          { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.fields.kind === "ai" ? "accent" : "neutral"}>{row.fields.kind === "ai" ? "AI employee" : "Person"}</Pill> },
        ]}
        onSelect={(id) => context.select(id)}
      />
    );
  }
  if (lens === "Work") {
    return <DataGrid rows={work} rowId={(row) => row.id} label={`${dept.title} work`} columns={[
      { key: "title", header: "Task", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
      { key: "assignee", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
      { key: "stage", header: "Stage", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
    ]} onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)} />;
  }
  if (lens === "Discussions") {
    return <Empty title="Department channels" icon={<Network size={20} />} action={<Button variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/comms/channels`)}>Open Communications</Button>}>Channels for {dept.title} live in Communications, where threads, mentions and files are kept together.</Empty>;
  }
  if (lens === "Files") {
    return <DataGrid rows={data.documents} rowId={(row) => row.id} label="Shared files" columns={[
      { key: "title", header: "Document", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
      { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
      { key: "updated", header: "Updated", align: "end", cell: (row) => context.date(row.updatedAt), sortValue: (row) => row.updatedAt },
    ]} onOpen={(id) => context.navigate(`/o/${org.slug}/docs/documents/${id}`)} />;
  }
  if (lens === "Performance") {
    return (
      <Card title={`${dept.title} throughput`}>
        <BarChart
          title="Tasks by stage"
          height={200}
          format={(value) => String(Math.round(value))}
          series={[{ name: "Tasks", points: ["ready", "doing", "review", "done"].map((stage) => ({ label: stage, value: work.filter((task) => (task.fields.stage ?? task.status) === stage).length })) }]}
        />
      </Card>
    );
  }
  return (
    <Grid>
      <Card span={5} title="Overview" subtitle={dept.summary}>
        <Properties rows={[
          { label: "Lead", value: String(dept.fields.lead ?? "Unassigned") },
          { label: "People", value: String(people.filter((m) => m.fields.kind === "human").length) },
          { label: "AI employees", value: String(people.filter((m) => m.fields.kind === "ai").length) },
          { label: "Open work", value: String(work.filter((task) => task.status !== "done").length) },
        ]} />
      </Card>
      <Card span={7} title="Roster">
        <Stack gap={2}>
          {people.map((member) => (
            <Row key={member.id} gap={2}>
              <Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />
              <span className="ds-grow">{member.title}</span>
              <span className="ds-subtle">{String(member.fields.title ?? "")}</span>
            </Row>
          ))}
        </Stack>
      </Card>
      <Card span={12} title="Private records stay in the department">
        <Notice tone="info">A person outside {dept.title} does not see its private records in this workspace. Role views shape what the interface offers; they are not an account security boundary.</Notice>
      </Card>
    </Grid>
  );
}

/* ---------------------------- HQ-006 ---------------------------- */

function OrgChart({ context, lens }: { context: ScreenContext; lens: "People" | "Departments" | "AI employees" }) {
  const data = useHqData();
  const [params] = useSearchParams();
  const mode = params.get("view") === "list" ? "list" : "tree";
  const zoom = ZOOM_LEVELS.includes(Number(params.get("zoom"))) ? Number(params.get("zoom")) : 1;
  const setMode = (next: "tree" | "list") => setQuery(context, { view: next === "list" ? "list" : null });
  const members = lens === "AI employees"
    ? data.members.filter((member) => member.fields.kind === "ai")
    : lens === "People"
      ? data.members.filter((member) => member.fields.kind === "human")
      : data.members;

  const byDept = data.departments.map((dept) => ({ dept, members: members.filter((member) => member.fields.departmentId === dept.id) }));
  const unassigned = members.filter((member) => !data.departments.some((dept) => dept.id === member.fields.departmentId));

  return (
    <Stack gap={4}>
      <Row gap={2}>
        <div className="ds-btn-group" role="group" aria-label="Chart display">
          <button type="button" aria-pressed={mode === "tree"} onClick={() => setMode("tree")} className="ds-btn" data-size="sm">Chart</button>
          <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")} className="ds-btn" data-size="sm">List</button>
        </div>
        {mode === "tree" && (
          <div className="ds-btn-group" role="group" aria-label="Chart zoom">
            <button type="button" className="ds-btn" data-size="sm" aria-label="Zoom out" disabled={zoom === ZOOM_LEVELS[0]} onClick={() => stepZoom(context, zoom, -1)}>−</button>
            <button type="button" className="ds-btn" data-size="sm" aria-label="Reset zoom" onClick={() => setQuery(context, { zoom: null })}><span className="ds-num">{Math.round(zoom * 100)}%</span></button>
            <button type="button" className="ds-btn" data-size="sm" aria-label="Zoom in" disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onClick={() => stepZoom(context, zoom, 1)}>+</button>
          </div>
        )}
        <span className="ds-subtle">{members.length} nodes · the list is the accessible equivalent of the chart</span>
      </Row>

      {mode === "list" ? (
        <DataGrid
          rows={members}
          rowId={(row) => row.id}
          label="Reporting list"
          columns={[
            { key: "name", header: "Member", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
            { key: "role", header: "Role", cell: (row) => String(row.fields.title ?? row.fields.role ?? "") },
            { key: "dept", header: "Department", cell: (row) => data.departments.find((dept) => dept.id === row.fields.departmentId)?.title ?? "Unassigned" },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.fields.kind === "ai" ? "accent" : "neutral"}>{row.fields.kind === "ai" ? "AI" : "Person"}</Pill> },
          ]}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => { context.select(id); context.openOverlay("Member inspector", { id }); }}
        />
      ) : (
        <div style={{ overflow: "auto", maxHeight: "72vh" }} role="region" aria-label="Organisation chart, scroll to pan" tabIndex={0}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: `${100 / zoom}%` }}>
        <Grid>
          {byDept.map(({ dept, members: team }) => (
            <Card key={dept.id} span={4} title={dept.title} subtitle={`Lead ${String(dept.fields.lead ?? "unassigned")}`}>
              <Stack gap={2}>
                {team.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="ds-record-card"
                    onClick={() => { context.select(member.id); context.openOverlay("Member inspector", { id: member.id }); }}
                  >
                    <Row gap={2}>
                      <Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="sm" />
                      <span className="ds-grow" style={{ textAlign: "start" }}>{member.title}</span>
                      {member.fields.kind === "ai" && <Pill tone="accent">AI</Pill>}
                    </Row>
                    <span className="ds-subtle">{String(member.fields.title ?? "")}</span>
                  </button>
                ))}
                {team.length === 0 && <span className="ds-subtle">Vacant</span>}
              </Stack>
            </Card>
          ))}
          {unassigned.length > 0 && (
            <Card span={4} title="Unassigned" subtitle="No department set">
              <Stack gap={2}>{unassigned.map((member) => <span key={member.id}>{member.title}</span>)}</Stack>
            </Card>
          )}
        </Grid>
        </div>
        </div>
      )}
    </Stack>
  );
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5];

/** View state lives in the address so it survives reloads and can be shared. */
function setQuery(context: ScreenContext, changes: Record<string, string | null>) {
  const next = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key); else next.set(key, value);
  }
  const query = next.toString();
  context.navigate(`${window.location.pathname}${query ? `?${query}` : ""}`);
}

function stepZoom(context: ScreenContext, current: number, delta: number) {
  const index = ZOOM_LEVELS.indexOf(current);
  const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + delta))];
  setQuery(context, { zoom: next === 1 ? null : String(next) });
}

/* ---------------------------- HQ-007 ---------------------------- */

function CompanyGoals({ context, state }: { context: ScreenContext; state: string }) {
  const { objectives, missions } = useCollections(["objectives", "missions"]);
  const map: Record<string, string[]> = { Active: ["active", "in_progress"], Proposed: ["proposed", "draft"], Achieved: ["achieved", "done"], Archived: ["archived"] };
  const rows = objectives.filter((objective) => (map[state] ?? ["active"]).includes(objective.status));

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} objectives`} icon={<Target size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Goal editor")}>Create objective</Button>} />;
  }

  return (
    <Grid>
      {rows.map((objective) => {
        const target = Number(objective.fields.target ?? 0);
        const current = Number(objective.fields.current ?? 0);
        const ratio = target === 0 ? 0 : current / target;
        return (
          <Card
            key={objective.id}
            span={6}
            title={objective.title}
            subtitle={objective.summary}
            actions={<Pill tone={ratio >= 1 ? "success" : ratio >= 0.6 ? "info" : "warning"}>{target ? `${Math.round(ratio * 100)}%` : "No target"}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Goal editor", { id: objective.id })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("target change review", { id: objective.id })}>Change target</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(objective.id); context.openOverlay("review goal"); }}>Review</Button>
              <span className="ds-grow" />
              <span className="ds-subtle">{objective.fields.reviewedAt ? `Reviewed ${context.relative(String(objective.fields.reviewedAt))}` : "Not yet reviewed"}</span>
            </>}
          >
            <Stack gap={3}>
              <Meter value={current} max={target || 1} label={objective.title} tone={ratio >= 1 ? "success" : ratio < 0.5 ? "warning" : undefined} />
              <Properties rows={[
                { label: "Measure", value: String(objective.fields.measure ?? "Not set") },
                { label: "Current", value: String(current) },
                { label: "Target", value: target ? String(target) : "Not set" },
                { label: "Owner", value: objective.ownerName },
                { label: "Mission", value: missions.find((mission) => mission.id === objective.fields.missionId)?.title ?? "None linked" },
                ...(objective.fields.confidence ? [{ label: "Confidence", value: <Pill tone={objective.fields.confidence === "on_track" ? "success" : objective.fields.confidence === "at_risk" ? "warning" : "danger"}>{String(objective.fields.confidence).replace(/_/g, " ")}</Pill> }] : []),
              ]} />
              {ratio >= 1 && objective.status !== "achieved" && (
                <Notice tone="info">The measure has reached its target. Marking an objective achieved requires confirming the measure, not a summary.</Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- HQ-008 ---------------------------- */

function LocationsAndEntities({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCollections(["locations", "legalEntities", "brands"]);
  const scopePref = usePref("locationScope");
  const { org } = useWorkspace();
  if (lens === "Legal entities") {
    const rows = data.legalEntities.length ? data.legalEntities : [];
    return rows.length === 0
      ? <Empty title="No separate legal entity recorded" icon={<Landmark size={20} />}>{org.name} trades under one entity in this workspace, registered {org.registration ?? "without a recorded number"}.</Empty>
      : <DataGrid rows={rows} rowId={(row) => row.id} label="Legal entities" columns={[
        { key: "title", header: "Entity", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "jurisdiction", header: "Jurisdiction", cell: (row) => String(row.fields.jurisdiction ?? org.jurisdiction) },
        { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
      ]} />;
  }
  if (lens === "Brands") {
    return data.brands.length === 0
      ? <Empty title="No brand recorded" >Brand kits live in Assets, and the brand voice lives in Company Brain.</Empty>
      : <Grid>{data.brands.map((brandRec) => <Card key={brandRec.id} span={4} title={brandRec.title} subtitle={brandRec.summary} />)}</Grid>;
  }
  if (lens === "Operating calendars") {
    return (
      <Card title="Business hours" subtitle={`All times in ${org.timezone}`}>
        <DataGrid rows={data.locations} rowId={(row) => row.id} label="Operating calendars" filterable={false} columns={[
          { key: "title", header: "Location", primary: true, cell: (row) => row.title },
          { key: "hours", header: "Hours", cell: (row) => row.summary || "Not recorded" },
          { key: "tz", header: "Time zone", cell: (row) => String(row.fields.timezone ?? org.timezone) },
        ]} />
      </Card>
    );
  }
  const scopeIds = listField(scopePref, "ids");
  const inScope = scopeIds.length ? data.locations.filter((location) => scopeIds.includes(location.id)) : data.locations;
  return (
    <Stack gap={3}>
    {scopeIds.length > 0 && (
      <Notice tone="info" title={`Scoped to ${inScope.length} of ${data.locations.length} locations`}
        actions={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("scope preview")}>Change scope</Button>}>
        Locations outside the scope are hidden here, not removed.
      </Notice>
    )}
    <Grid>
      {inScope.map((location) => (
        <Card key={location.id} span={4} title={location.title} subtitle={location.summary}
          prov={context.selectedId === location.id ? "human" : undefined}
          actions={location.tags.includes("primary") ? <Pill tone="accent">Primary</Pill> : undefined}
          footer={<>
            <Button size="sm" variant={context.selectedId === location.id ? "soft" : "ghost"} aria-pressed={context.selectedId === location.id} onClick={() => context.select(location.id)}>
              {context.selectedId === location.id ? "Selected" : "Select"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Location form", { id: location.id })}>Edit details</Button>
          </>}>
          <Properties rows={[
            { label: "Kind", value: String(location.fields.kind ?? "Office") },
            { label: "Time zone", value: String(location.fields.timezone ?? org.timezone) },
          ]} />
        </Card>
      ))}
      {data.locations.length === 0 && <Empty title="No locations" action={<Button variant="primary" onClick={() => context.openOverlay("Location form")}>Add location</Button>} />}
    </Grid>
    </Stack>
  );
}

/* ---------------------------- HQ-009 ---------------------------- */

function CompanyTimeline({ context, lens }: { context: ScreenContext; lens: string }) {
  const events = useCollection("timelineEvents");
  useSearchParams();
  const filter = timelineFilter();
  const byKind = lens === "All" ? events : events.filter((event) => String(event.fields.kind ?? "").toLowerCase() === lens.toLowerCase().replace(/s$/, ""));
  const filtered = byKind.filter((event) => {
    const at = (event.at ?? event.updatedAt).slice(0, 10);
    if (filter.from && at < filter.from) return false;
    if (filter.to && at > filter.to) return false;
    if (filter.q && !`${event.title} ${event.summary}`.toLowerCase().includes(filter.q.toLowerCase())) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt));
  const filtering = Boolean(filter.from || filter.to || filter.q);

  const notice = filtering ? (
    <Notice tone="info" title={`Filtered: ${sorted.length} of ${byKind.length} events`}
      actions={<Button size="sm" variant="ghost" onClick={() => setQuery(context, { from: null, to: null, q: null })}>Clear filter</Button>}>
      {[filter.from && `from ${filter.from}`, filter.to && `to ${filter.to}`, filter.q && `containing “${filter.q}”`].filter(Boolean).join(", ")}
    </Notice>
  ) : null;

  if (sorted.length === 0) return <Stack gap={3}>{notice}<Empty title={`No ${lens.toLowerCase()} events${filtering ? " match the filter" : ""}`} icon={<Clock size={20} />} /></Stack>;

  return (
    <Stack gap={3}>
    {notice}
    <ol className="ds-stack ds-gap-4">
      {sorted.map((event) => (
        <li key={event.id}>
          <Row gap={4} style={{ alignItems: "flex-start" }}>
            <div style={{ width: 150, flex: "none" }}>
              <strong className="ds-num">{context.date(event.at ?? event.updatedAt)}</strong>
              <div className="ds-subtle">{context.relative(event.at ?? event.updatedAt)}</div>
            </div>
            <div className="ds-panel ds-grow" style={{ padding: "var(--space-4)", outline: context.selectedId === event.id ? "2px solid var(--accent)" : undefined }}>
              <Row gap={2}>
                <button type="button" className="ds-grow" style={{ textAlign: "start", fontWeight: 650 }} aria-pressed={context.selectedId === event.id} onClick={() => context.select(event.id)}>{event.title}</button>
                <Pill tone="neutral">{String(event.fields.kind ?? "event")}</Pill>
              </Row>
              <p className="ds-subtle" style={{ marginBlockStart: 4 }}>{event.summary}</p>
              <Row gap={2} style={{ marginBlockStart: "var(--space-3)" }}>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Event inspector", { id: event.id })}>Inspect source</Button>
                <Button size="sm" variant="ghost" onClick={() => context.openOverlay("add annotation", { id: event.id })}>Annotate</Button>
              </Row>
            </div>
          </Row>
        </li>
      ))}
    </ol>
    </Stack>
  );
}

/* ---------------------------- HQ-010 ---------------------------- */

function WorkplaceDirectory({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useCollections(["members", "departments", "skills"]);
  if (lens === "Departments") return <DepartmentsDirectory context={context} scope="All" />;
  if (lens === "Skills") {
    return data.skills.length === 0
      ? <Empty title="No skills recorded" >Skills are maintained in the AI Workforce skills library.</Empty>
      : <DataGrid rows={data.skills} rowId={(row) => row.id} label="Skills" columns={[
        { key: "title", header: "Skill", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "summary", header: "Used for", cell: (row) => row.summary },
      ]} />;
  }
  const rows = lens === "AI" ? data.members.filter((m) => m.fields.kind === "ai") : data.members.filter((m) => m.fields.kind === "human");
  return (
    <Grid>
      {rows.map((member) => (
        <Card key={member.id} span={4} title={<Row gap={2}><Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} />{member.title}</Row>} subtitle={String(member.fields.title ?? "")}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { context.select(member.id); context.openOverlay("start conversation"); }}>Message</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(member.id); context.openOverlay("Profile quick view", { id: member.id }); }}>Profile</Button>
            <span className="ds-grow" />
            <Button size="sm" variant={context.selectedId === member.id ? "soft" : "ghost"} aria-pressed={context.selectedId === member.id} onClick={() => context.select(member.id)}>
              {context.selectedId === member.id ? "Selected" : "Select"}
            </Button>
          </>}>
          <p className="ds-subtle">{member.summary}</p>
          <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
            <Pill tone={member.fields.kind === "ai" ? "accent" : "neutral"}>{member.fields.kind === "ai" ? "AI employee" : "Person"}</Pill>
            <Pill tone="neutral">{data.departments.find((dept) => dept.id === member.fields.departmentId)?.title ?? "No department"}</Pill>
          </Row>
          <Notice tone="neutral">Contact details follow this member's privacy setting and are not shown in the directory.</Notice>
        </Card>
      ))}
    </Grid>
  );
}

/* ====================================================================== *
 * Shared overlay bodies
 * ====================================================================== */

function MetricInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { metric?: string } | undefined;
  const data = useCollections(["invoices", "journals"]);
  const { now } = useWorkspace();
  const metric = payload?.metric ?? "receivable";
  if (metric === "ledger") {
    const latest = data.journals.map((journal) => journal.at ?? journal.updatedAt).sort().at(-1);
    const age = freshness(latest, now);
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Source", value: "Posted journals in this browser" },
          { label: "Last posting", value: age.known ? context.date(latest) : "Not recorded" },
          { label: "Age", value: age.known ? `${age.days} days` : "Unknown" },
          { label: "Confidence", value: age.stale ? <Pill tone="warning">Stale</Pill> : <Pill tone="success">Current</Pill> },
        ]} />
        <Notice tone="warning" title="No bank feed is connected">A figure without a source is shown as unavailable rather than filled in.</Notice>
      </Stack>
    );
  }
  const position = receivablePosition(data.invoices, now);
  const rows = metric === "overdue" ? position.overdue : position.open;
  return (
    <Stack gap={3}>
      <p className="ds-subtle">Computed from {rows.length} invoice records. Each row is the source of the figure.</p>
      <DataGrid rows={rows} rowId={(row) => row.id} label="Metric sources" filterable={false} columns={[
        { key: "title", header: "Invoice", primary: true, cell: (row) => row.title },
        { key: "due", header: "Due", cell: (row) => context.date(row.dueAt) },
        { key: "amount", header: "Outstanding", align: "end", cell: (row) => context.money(outstandingMinor(row)) },
      ]} />
    </Stack>
  );
}

function CreateDepartment({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const [title, setTitle] = useState("");
  const [lead, setLead] = useState(members[0]?.title ?? "");
  const [summary, setSummary] = useState("");
  const departments = useCollection("departments");
  const duplicate = departments.some((dept) => dept.title.trim().toLowerCase() === title.trim().toLowerCase());
  return (
    <form
      id="create-department"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const created = await context.mutate.create({ collection: "departments", title: title.trim(), status: "active", summary, fields: { lead, members: 0 } }, `Department ${title.trim()} created`);
        context.toast("Department created", `${created.title} is in this workspace.`);
        close();
      }}
    >
      <Field label="Department name" required hint="Shown in navigation, the directory and the organisation chart.">
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="That name already exists">Two departments with the same name make ownership ambiguous.</Notice>}
      <Field label="Lead">
        <Select value={lead} onChange={(event) => setLead(event.target.value)}>
          {members.filter((member) => member.fields.kind === "human").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="What it does">
        <TextArea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
      </Field>
    </form>
  );
}

function GoalEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [measure, setMeasure] = useState(String(existing?.fields.measure ?? ""));
  const [target, setTarget] = useState(String(existing?.fields.target ?? ""));
  const [current, setCurrent] = useState(String(existing?.fields.current ?? "0"));
  return (
    <form
      id="goal-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = { measure, target: Number(target) || 0, current: Number(current) || 0 };
        if (existing) {
          await context.mutate.patch(existing.id, { title, fields: { ...existing.fields, ...fields } }, { expectRevision: existing.revision, event: "Objective updated" });
        } else {
          await context.mutate.create({ collection: "objectives", title, status: "active", summary: `${measure} to ${target}`, fields }, "Objective created");
        }
        context.toast("Objective saved", `${title} is tracked against ${measure || "its measure"}.`);
        close();
      }}
    >
      <Field label="Objective" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Row gap={3}>
        <Field label="Measure"><TextInput value={measure} onChange={(event) => setMeasure(event.target.value)} placeholder="Trade accounts" /></Field>
        <Field label="Current"><TextInput value={current} inputMode="numeric" align="end" onChange={(event) => setCurrent(event.target.value)} /></Field>
        <Field label="Target"><TextInput value={target} inputMode="numeric" align="end" onChange={(event) => setTarget(event.target.value)} /></Field>
      </Row>
      <Notice tone="info">An objective is marked achieved from its measure reaching its target, not from a written summary.</Notice>
    </form>
  );
}

function MemberInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const member = useRecord(payload?.id ?? context.selectedId);
  const departments = useCollection("departments");
  if (!member) return <Empty title="Select a member" />;
  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={member.title} kind={member.fields.kind === "ai" ? "ai" : "human"} size="lg" />
        <div>
          <h3>{member.title}</h3>
          <p className="ds-subtle">{String(member.fields.title ?? "")}</p>
        </div>
      </Row>
      <Properties rows={[
        { label: "Kind", value: member.fields.kind === "ai" ? "AI employee" : "Person" },
        { label: "Department", value: departments.find((dept) => dept.id === member.fields.departmentId)?.title ?? "Unassigned" },
        { label: "Role view", value: String(member.fields.role ?? "member") },
        { label: "About", value: member.summary },
      ]} />
      {member.fields.kind === "ai" && (
        <Notice tone="info" title="Local agent contract">This AI employee runs from a local contract in this workspace. No model provider is connected.</Notice>
      )}
    </Stack>
  );
}

function ChangeManager({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const departments = useCollection("departments");
  const member = useRecord(context.selectedId);
  const [deptId, setDeptId] = useState(String(member?.fields.departmentId ?? departments[0]?.id ?? ""));
  if (!member) return <Empty title="Choose a member first" />;
  const cycle = members.some((candidate) => candidate.id === deptId && candidate.fields.departmentId === member.id);
  return (
    <form
      id="change-manager"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (cycle) return;
        await context.mutate.patch(member.id, { fields: { ...member.fields, departmentId: deptId } }, { expectRevision: member.revision, event: `Reporting line changed for ${member.title}` });
        context.toast("Reporting line changed", `${member.title} now reports into ${departments.find((dept) => dept.id === deptId)?.title}.`);
        close();
      }}
    >
      <Field label={`Department for ${member.title}`}>
        <Select value={deptId} onChange={(event) => setDeptId(event.target.value)}>
          {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.title}</option>)}
        </Select>
      </Field>
      {cycle && <Notice tone="danger" title="That would create a cycle">A member cannot report into a line that reports back to them.</Notice>}
      <Notice tone="warning" title="This changes what the chart shows">Work already assigned stays with {member.title}.</Notice>
    </form>
  );
}

function SaveViewDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  return (
    <form
      id="save-view"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "preferences",
          title: name || "Untitled view",
          status: "active",
          summary: `Saved from ${context.screen.title}`,
          fields: { kind: "savedView", scope: context.screen.title, tab: context.tab, shared },
        }, `Saved view ${name}`);
        context.toast("View saved", "It appears under Saved views.");
        close();
      }}
    >
      <Field label="View name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Checkbox label="Share with the workspace" checked={shared} onChange={(event) => setShared(event.target.checked)} />
      <p className="ds-subtle">Saves the period and arrangement of {context.screen.title}, in this browser.</p>
    </form>
  );
}

function LocationForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const locations = useCollection("locations");
  const { org } = useWorkspace();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [hours, setHours] = useState(existing?.summary ?? "");
  const [timezone, setTimezone] = useState(String(existing?.fields.timezone ?? org.timezone));
  const duplicate = !existing && locations.some((location) => location.title.trim().toLowerCase() === title.trim().toLowerCase());
  return (
    <form
      id="location-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (duplicate) return;
        if (existing) await context.mutate.patch(existing.id, { title, summary: hours, fields: { ...existing.fields, timezone } }, { expectRevision: existing.revision, event: "Location updated" });
        else await context.mutate.create({ collection: "locations", title, status: "active", summary: hours, fields: { timezone, kind: "office" } }, "Location added");
        context.toast("Location saved", `${title} uses ${timezone}.`);
        close();
      }}
    >
      <Field label="Location name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required /></Field>
      {duplicate && <Notice tone="danger" title="A location with that name exists" >Transfers between locations need unambiguous names.</Notice>}
      <Field label="Business hours"><TextInput value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Tue–Sat 10:00–18:00" /></Field>
      <Field label="Time zone" hint="Local dates for transfers and bookings are resolved in this zone.">
        <Select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {["Europe/London", "America/New_York", "America/Tortola", "Europe/Paris", "UTC"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </Select>
      </Field>
    </form>
  );
}

/* ====================================================================== *
 * Module
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

export const hqApp = registerApp({
  code: "HQ",
  short: "Headquarters",
  name: "Headquarters & Organization",
  purpose: "The company-wide digital office",
  icon: Building2,
  nav: [
    { items: [
      { label: "Executive Home", screenId: "ARL-HQ-001", icon: Compass },
      { label: "My Workspace", screenId: "ARL-HQ-002", icon: Clock },
      { label: "Company Overview", screenId: "ARL-HQ-003", icon: Building2 },
    ] },
    { label: "Structure", items: [
      { label: "Departments", screenId: "ARL-HQ-004", icon: Network },
      { label: "Organization Chart", screenId: "ARL-HQ-006", icon: Network },
      { label: "Workplace Directory", screenId: "ARL-HQ-010", icon: Users },
      { label: "Locations & Entities", screenId: "ARL-HQ-008", icon: Landmark },
    ] },
    { label: "Direction", items: [
      { label: "Company Goals", screenId: "ARL-HQ-007", icon: Target },
      { label: "Company Timeline", screenId: "ARL-HQ-009", icon: Clock },
    ] },
  ],
  screens: {
    "ARL-HQ-001": {
      id: "ARL-HQ-001",
      title: () => "Executive Home",
      tabs: [
        { id: "Today", render: (context) => <ExecutiveHome context={context} range="today" /> },
        { id: "Week", render: (context) => <ExecutiveHome context={context} range="week" /> },
        { id: "Saved views", render: (context) => <SavedViews context={context} /> },
      ],
      actions: [
        { id: "Ask Chief of Staff", label: "Ask Arlovi", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/ai/chat`) },
        { id: "rearrange cards", label: "Arrange cards", placement: "secondary", run: (context) => context.openOverlay("Widget picker") },
        { id: "drill into metric", label: "Inspect a metric", placement: "overflow", run: (context) => context.openOverlay("metric inspector", { metric: "receivable" }) },
        { id: "dismiss recommendation", label: "Dismiss a recommendation", placement: "overflow", run: (context) => context.openOverlay("recommendations") },
        { id: "save view", label: "Save this view", placement: "overflow", run: (context) => context.openOverlay("save view dialog") },
      ],
      overlays: [
        { id: "Widget picker", kind: "drawer", title: "Arrange cards", description: "Choose what Executive Home shows, and in what order.", render: ({ close, ...context }) => <ArrangeCards context={context} close={close} />, footer: submitFooter("hq-arrange", "Save arrangement") },
        { id: "recommendations", kind: "drawer", title: "Recommendations", width: 480, render: ({ ...context }) => <RecommendationsDrawer context={context} /> },
        { id: "metric inspector", kind: "drawer", title: "Where this figure comes from", width: 520, render: ({ ...context }) => <MetricInspector context={context} /> },
        { id: "save view dialog", kind: "modal", title: "Save this view", width: 460, render: ({ close, ...context }) => <SaveViewDialog context={context} close={close} />, footer: submitFooter("save-view", "Save view") },
      ],
    },

    "ARL-HQ-002": {
      id: "ARL-HQ-002",
      subtitle: (context) => `Everything assigned to ${context.actor}.`,
      tabs: (["Today", "Upcoming", "Saved", "History"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MyWorkspace context={context} view={view} />,
      })),
      actions: [
        { id: "Prioritize task", label: "Prioritise", placement: "primary", guard: (context) => guardSelection(context, "a task"), run: (context) => prioritizeTask(context) },
        { id: "quick task", label: "Quick task", placement: "secondary", run: (context) => context.openOverlay("Quick task") },
        { id: "open draft", label: "Open latest draft", placement: "secondary", run: (context) => openLatestDraft(context) },
        { id: "request help", label: "Request help", placement: "overflow", run: (context) => context.openOverlay("request help") },
        { id: "pin item", label: "Pin item", placement: "overflow", guard: (context) => guardSelection(context, "a task"), run: (context) => pinTask(context) },
        { id: "preferences", label: "Preferences", placement: "overflow", run: (context) => context.openOverlay("personal preferences") },
      ],
      overlays: [
        { id: "Quick task", kind: "modal", title: "Quick task", width: 460,
          render: ({ close, ...context }) => (
            <form id="quick-task" className="ds-stack ds-gap-4" onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              await context.mutate.create({ collection: "tasks", title: String(data.get("title") ?? "Task"), status: "ready", summary: String(data.get("note") ?? ""), dueAt: String(data.get("due") || "") || undefined, fields: { stage: "ready", assignee: context.actor } }, "Task created from My Workspace");
              context.toast("Task added", "It is in your assigned work.");
              close();
            }}>
              <Field label="Task" required><TextInput name="title" required /></Field>
              <Field label="Due"><TextInput name="due" type="date" /></Field>
              <Field label="Note"><TextArea name="note" rows={3} /></Field>
            </form>
          ),
          footer: submitFooter("quick-task", "Add task") },
        { id: "work item inspector", kind: "drawer", title: "Work item", render: ({ ...context }) => <WorkItemInspector context={context} /> },
        { id: "request help", kind: "modal", title: "Request help", width: 520, render: ({ close, ...context }) => <RequestHelp context={context} close={close} />, footer: submitFooter("hq-help", "Ask for help") },
        { id: "personal preferences", kind: "modal", title: "Personal preferences", width: 480, render: () => (
          <Stack gap={3}>
            <Checkbox label="Show completed work in Today" />
            <Checkbox label="Group by project" defaultChecked />
            <Notice tone="info">Preferences are stored in this browser for this person.</Notice>
          </Stack>
        ) },
      ],
    },

    "ARL-HQ-003": {
      id: "ARL-HQ-003",
      subtitle: (context) => `${context.org.name} as one picture: entity, objectives, operations and the posture behind them.`,
      tabs: (["Business", "Performance", "Operations", "Compliance"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CompanyOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "create company objective", label: "New objective", placement: "primary", run: (context) => context.openOverlay("KPI builder") },
        { id: "open department", label: "Departments", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/hq/departments`) },
        { id: "Inspect metric", label: "Data freshness", placement: "overflow", run: (context) => context.openOverlay("data freshness inspector") },
      ],
      overlays: [
        { id: "KPI builder", kind: "modal", title: "New objective", width: 560, render: ({ close, ...context }) => <GoalEditor context={context} close={close} />, footer: submitFooter("goal-editor", "Save objective") },
        { id: "executive note", kind: "drawer", title: "Executive note", render: ({ ...context }) => (
          <form className="ds-stack ds-gap-3" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await context.mutate.log(String(data.get("note") ?? ""), { type: "note" });
            context.toast("Note recorded", "It is in the company activity log.");
          }}>
            <Field label="Note"><TextArea name="note" rows={5} /></Field>
            <Button type="submit" variant="primary">Record note</Button>
          </form>
        ) },
        { id: "data freshness inspector", kind: "drawer", title: "Data freshness", width: 480, render: ({ ...context }) => <MetricInspector context={{ ...context, overlayPayload: { metric: "ledger" } }} /> },
      ],
    },

    "ARL-HQ-004": {
      id: "ARL-HQ-004",
      subtitle: () => "Who owns what, and where people and agents sit.",
      tabs: (["All", "My departments", "Pinned"] as const).map((scope) => ({
        id: scope,
        render: (context: ScreenContext) => <DepartmentsDirectory context={context} scope={scope} />,
      })),
      actions: [
        { id: "create department", label: "New department", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Create department") },
        { id: "assign leader", label: "Assign a leader", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("assign leader") },
        { id: "Open department", label: "Open a department", placement: "overflow", run: (context) => context.openOverlay("open department") },
        { id: "reorder directory", label: "Reorder the directory", placement: "overflow", run: (context) => context.openOverlay("reorder directory") },
        { id: "impact preview", label: "Impact preview", placement: "overflow", run: (context) => context.openOverlay("organizational impact preview") },
      ],
      overlays: [
        { id: "Create department", kind: "modal", title: "New department", width: 520, render: ({ close, ...context }) => <CreateDepartment context={context} close={close} />, footer: submitFooter("create-department", "Create department") },
        { id: "assign leader", kind: "modal", title: "Assign a leader", width: 480, render: ({ close, ...context }) => <AssignLeader context={context} close={close} />, footer: submitFooter("hq-leader", "Assign") },
        { id: "open department", kind: "modal", title: "Open a department", width: 460, render: ({ close, ...context }) => <OpenDepartment context={context} close={close} /> },
        { id: "reorder directory", kind: "modal", title: "Reorder the directory", width: 480, render: ({ close, ...context }) => <ReorderDepartments context={context} close={close} />, footer: submitFooter("hq-reorder", "Save order") },
        { id: "organizational impact preview", kind: "drawer", title: "Organisational impact", width: 460, render: ({ ...context }) => {
          const payload = context.overlayPayload as { departmentId?: string } | undefined;
          return <Building departmentId={payload?.departmentId} context={context} />;
        } },
      ],
    },

    "ARL-HQ-005": {
      id: "ARL-HQ-005",
      title: () => "Department workspace",
      subtitle: () => "One department: its people, its work, its files and how it is performing.",
      tabs: ["Overview", "People", "Work", "Discussions", "Files", "Performance"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <DepartmentWorkspace context={context} lens={lens} />,
      })),
      actions: [
        { id: "Assign work", label: "Assign work", placement: "primary", run: (context) => context.openOverlay("assign work") },
        { id: "message team", label: "Message team", placement: "secondary", run: (context) => context.openOverlay("message team") },
        { id: "add resource", label: "Add a resource", placement: "overflow", run: (context) => context.openOverlay("add resource") },
        { id: "open department app", label: "Open the department's app", placement: "overflow", run: (context) => openDepartmentAppFor(context) },
        { id: "settings", label: "Department settings", placement: "overflow", run: (context) => context.openOverlay("Department settings") },
        { id: "invite", label: "Invite a member", placement: "overflow", run: (context) => context.openOverlay("invite member") },
      ],
      overlays: [
        { id: "assign work", kind: "modal", title: "Assign work", width: 540, render: ({ close, ...context }) => <AssignWork context={context} close={close} />, footer: submitFooter("hq-assign-work", "Assign") },
        { id: "message team", kind: "modal", title: "Message the team", width: 540, render: ({ close, ...context }) => <MessageTeam context={context} close={close} />, footer: submitFooter("hq-message-team", "Post message") },
        { id: "add resource", kind: "modal", title: "Add a resource", width: 520, render: ({ close, ...context }) => <AddResource context={context} close={close} />, footer: submitFooter("hq-resource", "Add resource") },
        { id: "Department settings", kind: "modal", title: "Department settings", width: 520, render: ({ ...context }) => <Properties rows={[{ label: "Department", value: context.params.id ?? "—" }, { label: "Private records", value: "Visible to members only" }]} /> },
        { id: "invite member", kind: "modal", title: "Invite a member", width: 460, render: () => (
          <Stack gap={3}>
            <Field label="Email"><TextInput type="email" placeholder="name@example.com" /></Field>
            <Notice tone="warning" title="Invitations cannot be sent">No mail provider is connected, so an invitation is kept as a local draft.</Notice>
          </Stack>
        ) },
        { id: "permission inspector", kind: "drawer", title: "Permissions", render: () => (
          <Notice tone="info" title="Role views, not account security">What a role view offers is shaped in this browser. A future service will enforce access on the server.</Notice>
        ) },
      ],
    },

    "ARL-HQ-006": {
      id: "ARL-HQ-006",
      subtitle: () => "Reporting lines for people and AI employees, with an accessible list equivalent of the chart.",
      tabs: (["People", "Departments", "AI employees"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <OrgChart context={context} lens={lens} />,
      })),
      actions: [
        { id: "modify reporting line", label: "Change reporting line", placement: "primary", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Select a member first"), run: (context) => context.openOverlay("change manager") },
        { id: "focus node", label: "Inspect member", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a member first"), run: (context) => context.openOverlay("Member inspector") },
        { id: "switch tree/list", label: "Switch chart / list", placement: "secondary", run: (context) => setQuery(context, { view: new URLSearchParams(window.location.search).get("view") === "list" ? null : "list" }) },
        { id: "Pan zoom", label: "Zoom in", placement: "overflow", run: (context) => stepZoom(context, Number(new URLSearchParams(window.location.search).get("zoom") ?? 1) || 1, 1) },
        { id: "zoom out", label: "Zoom out", placement: "overflow", run: (context) => stepZoom(context, Number(new URLSearchParams(window.location.search).get("zoom") ?? 1) || 1, -1) },
      ],
      overlays: [
        { id: "Member inspector", kind: "drawer", title: "Member", render: ({ ...context }) => <MemberInspector context={context} /> },
        { id: "change manager", kind: "modal", title: "Change reporting line", width: 480, render: ({ close, ...context }) => <ChangeManager context={context} close={close} />, footer: submitFooter("change-manager", "Apply change") },
        { id: "impact confirmation", kind: "modal", title: "Confirm the change", tone: "danger", width: 460, render: () => <p>Changing a reporting line changes what the chart and department views show. Assigned work stays with the member.</p> },
      ],
    },

    "ARL-HQ-007": {
      id: "ARL-HQ-007",
      subtitle: () => "Objectives measured against a target, not against a written summary.",
      tabs: ["Active", "Proposed", "Achieved", "Archived"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <CompanyGoals context={context} state={state} />,
      })),
      actions: [
        { id: "Create objective", label: "New objective", placement: "primary", run: (context) => context.openOverlay("Goal editor") },
        { id: "link mission", label: "Link a mission", placement: "secondary", run: (context) => context.openOverlay("link mission") },
        { id: "update measure", label: "Update the measure", placement: "overflow", run: (context) => context.openOverlay("target change review") },
        { id: "review goal", label: "Review a goal", placement: "overflow", run: (context) => context.openOverlay("review goal") },
        { id: "related work", label: "Related work", placement: "overflow", run: (context) => context.openOverlay("related work inspector") },
      ],
      overlays: [
        { id: "Goal editor", kind: "modal", title: "Objective", width: 560, render: ({ close, ...context }) => <GoalEditor context={context} close={close} />, footer: submitFooter("goal-editor", "Save objective") },
        { id: "target change review", kind: "modal", title: "Change a target", tone: "danger", width: 520, render: ({ close, ...context }) => <GoalEditor context={context} close={close} />, footer: submitFooter("goal-editor", "Apply new target") },
        { id: "related work inspector", kind: "drawer", title: "Related work", render: ({ ...context }) => <RelatedWork context={context} /> },
        { id: "link mission", kind: "modal", title: "Link a mission", width: 520, render: ({ close, ...context }) => <LinkMission context={context} close={close} />, footer: submitFooter("hq-link-mission", "Link mission") },
        { id: "review goal", kind: "modal", title: "Review a goal", width: 540, render: ({ close, ...context }) => <ReviewGoal context={context} close={close} />, footer: submitFooter("hq-review-goal", "Record review") },
      ],
    },

    "ARL-HQ-008": {
      id: "ARL-HQ-008",
      subtitle: (context) => `Where ${context.org.shortName} operates, under which entity, and on whose clock.`,
      tabs: ["Locations", "Legal entities", "Brands", "Operating calendars"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LocationsAndEntities context={context} lens={lens} />,
      })),
      actions: [
        { id: "Add location", label: "Add location", placement: "primary", run: (context) => context.openOverlay("Location form") },
        { id: "set primary office", label: "Set primary office", placement: "secondary", run: (context) => context.openOverlay("set primary office") },
        { id: "choose scope", label: "Choose scope", placement: "overflow", run: (context) => context.openOverlay("scope preview") },
        { id: "edit local details", label: "Edit local details", placement: "overflow", guard: (context) => guardSelection(context, "a location"), run: (context) => context.openOverlay("Location form", { id: context.selectedId }) },
        { id: "duplicate check", label: "Duplicate check", placement: "overflow", run: (context) => context.openOverlay("duplicate checker") },
      ],
      overlays: [
        { id: "Location form", kind: "modal", title: "Location", width: 520, render: ({ close, ...context }) => <LocationForm context={context} close={close} />, footer: submitFooter("location-form", "Save location") },
        { id: "scope preview", kind: "drawer", title: "Choose scope", width: 480, render: ({ close, ...context }) => (
          <Stack gap={4}>
            <Properties rows={[
              { label: "Reporting currency", value: context.org.currency },
              { label: "Tax jurisdiction", value: context.org.jurisdiction },
              { label: "Time zone", value: context.org.timezone },
            ]} />
            <ChooseScope context={context} close={close} />
          </Stack>
        ), footer: submitFooter("hq-scope", "Apply scope") },
        { id: "set primary office", kind: "modal", title: "Set the primary office", width: 480, render: ({ close, ...context }) => <SetPrimaryOffice context={context} close={close} />, footer: submitFooter("hq-primary", "Set primary") },
        { id: "duplicate checker", kind: "modal", title: "Duplicate check", width: 460, render: ({ ...context }) => (
          <p>Location names are checked for duplicates when saved, so transfers between {context.org.shortName} sites resolve to one place.</p>
        ) },
      ],
    },

    "ARL-HQ-009": {
      id: "ARL-HQ-009",
      subtitle: () => "Decisions, launches and changes, each traceable to the record that made it.",
      tabs: ["All", "Decisions", "Financial", "People", "Technology"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CompanyTimeline context={context} lens={lens} />,
      })),
      actions: [
        { id: "add milestone", label: "Add milestone", placement: "primary", run: (context) => context.openOverlay("add annotation") },
        { id: "export history", label: "Export history", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("export selection") },
        { id: "Filter", label: "Filter", placement: "secondary", run: (context) => context.openOverlay("timeline filter") },
        { id: "inspect source", label: "Inspect source", placement: "overflow", guard: (context) => guardSelection(context, "an event"), run: (context) => context.openOverlay("Event inspector", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Event inspector", kind: "drawer", title: "Event", render: ({ ...context }) => {
          const payload = context.overlayPayload as { id?: string } | undefined;
          return <EventInspector id={payload?.id} context={context} />;
        } },
        { id: "add annotation", kind: "modal", title: "Add a milestone", width: 520,
          render: ({ close, ...context }) => (
            <form id="milestone" className="ds-stack ds-gap-4" onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              await context.mutate.create({
                collection: "timelineEvents",
                title: String(data.get("title") ?? "Milestone"),
                status: "recorded",
                summary: String(data.get("note") ?? ""),
                at: new Date().toISOString(),
                fields: { kind: String(data.get("kind") ?? "decision") },
              }, "Milestone added to the company timeline");
              context.toast("Milestone added", "It is on the company timeline.");
              close();
            }}>
              <Field label="Milestone" required><TextInput name="title" required /></Field>
              <Field label="Kind"><Select name="kind">{["decision", "financial", "people", "technology"].map((kind) => <option key={kind}>{kind}</option>)}</Select></Field>
              <Field label="What happened"><TextArea name="note" rows={3} /></Field>
            </form>
          ),
          footer: submitFooter("milestone", "Add milestone") },
        { id: "timeline filter", kind: "modal", title: "Filter the timeline", width: 500, render: ({ close, ...context }) => <TimelineFilter context={context} close={close} />, footer: submitFooter("hq-timeline-filter", "Apply filter") },
        { id: "export selection", kind: "modal", title: "Export history", width: 460, render: ({ ...context }) => <ExportTimeline context={context} /> },
      ],
    },

    "ARL-HQ-010": {
      id: "ARL-HQ-010",
      subtitle: () => "People and AI employees, with contact details shown only where the member allows it.",
      tabs: ["Humans", "AI", "Departments", "Skills"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <WorkplaceDirectory context={context} lens={lens} />,
      })),
      actions: [
        { id: "start conversation", label: "Start a conversation", placement: "primary", run: (context) => context.openOverlay("start conversation") },
        { id: "assign task", label: "Assign a task", placement: "secondary", run: (context) => context.openOverlay("assign task") },
        { id: "Find colleague", label: "Find a colleague", placement: "secondary", run: (context) => context.openOverlay("find colleague") },
        { id: "view profile", label: "View profile", placement: "overflow", guard: (context) => guardSelection(context, "a person"), run: (context) => context.openOverlay("Profile quick view", { id: context.selectedId }) },
        { id: "presence", label: "Presence settings", placement: "overflow", run: (context) => context.openOverlay("presence settings") },
      ],
      overlays: [
        { id: "Profile quick view", kind: "drawer", title: "Profile", render: ({ ...context }) => <MemberInspector context={context} /> },
        { id: "start conversation", kind: "modal", title: "Start a conversation", width: 520, render: ({ close, ...context }) => <StartConversation context={context} close={close} />, footer: submitFooter("hq-conversation", "Send") },
        { id: "assign task", kind: "modal", title: "Assign a task", width: 520, render: ({ close, ...context }) => <AssignTaskTo context={context} close={close} />, footer: submitFooter("hq-assign-task", "Assign") },
        { id: "find colleague", kind: "modal", title: "Find a colleague", width: 520, render: ({ close, ...context }) => <FindColleague context={context} close={close} /> },
        { id: "presence settings", kind: "modal", title: "Presence and privacy", width: 480, render: () => (
          <Stack gap={3}>
            <Checkbox label="Show my working hours in the directory" defaultChecked />
            <Checkbox label="Show my contact details to the workspace" />
            <Notice tone="info">Contact details are shown only where the member has allowed it.</Notice>
          </Stack>
        ) },
      ],
    },
  },
});

function RecommendationsDrawer({ context }: { context: ScreenContext }) {
  const insights = useHomeInsights();
  return <RecommendationsManager context={context} insights={insights} />;
}

function WorkItemInspector({ context }: { context: ScreenContext }) {
  const task = useRecord(context.selectedId);
  const events = useEvents(task?.id, 8);
  if (!task) return <Empty title="Select a task">Choose a row in your work list to see it here.</Empty>;
  return (
    <Stack gap={4}>
      <h3>{task.title}</h3>
      <Properties rows={[
        { label: "Stage", value: <Pill>{String(task.fields.stage ?? task.status)}</Pill> },
        { label: "Priority", value: <Pill tone={task.fields.priority === "high" ? "danger" : "neutral"}>{String(task.fields.priority ?? "normal")}</Pill> },
        { label: "Owner", value: String(task.fields.assignee ?? task.ownerName) },
        { label: "Due", value: context.date(task.dueAt) },
        { label: "Pinned", value: task.tags.includes("pinned") ? "Yes" : "No" },
      ]} />
      {task.summary && <p className="ds-prose">{task.summary}</p>}
      <Stack gap={2}>
        <h4 className="ds-eyebrow">Activity</h4>
        {events.length === 0 && <span className="ds-subtle">No recorded activity.</span>}
        {events.map((event) => <Row key={event.id} gap={2}><span className="ds-subtle ds-num">{context.relative(event.at)}</span><span>{event.message}</span></Row>)}
      </Stack>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/project/tasks/${task.id}`)}>Open the task</Button>
    </Stack>
  );
}

function RelatedWork({ context }: { context: ScreenContext }) {
  const data = useCollections(["objectives", "missions", "projects"]);
  const linked = data.objectives.filter((objective) => objective.fields.missionId);
  if (linked.length === 0) {
    return <Empty title="Nothing linked yet">Use Link a mission to record which mission works towards an objective.</Empty>;
  }
  return (
    <Stack gap={3}>
      {linked.map((objective) => {
        const mission = data.missions.find((item) => item.id === objective.fields.missionId);
        return (
          <div key={objective.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <strong>{objective.title}</strong>
            <Row gap={2} style={{ marginBlockStart: 6 }}>
              <span className="ds-subtle ds-grow">{mission ? mission.title : "Linked mission no longer exists"}</span>
              {mission && <Pill tone="info">{mission.status.replace(/_/g, " ")}</Pill>}
              {mission && <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`)}>Open</Button>}
            </Row>
          </div>
        );
      })}
    </Stack>
  );
}

function EventInspector({ id, context }: { id?: string; context: ScreenContext }) {
  const event = useRecord(id);
  if (!event) return <Empty title="Select an event" />;
  return (
    <Stack gap={3}>
      <h3>{event.title}</h3>
      <Properties rows={[
        { label: "When", value: context.dateTime(event.at ?? event.updatedAt) },
        { label: "Kind", value: String(event.fields.kind ?? "event") },
        { label: "Recorded by", value: event.createdBy },
        { label: "Detail", value: event.summary },
      ]} />
      <Notice tone="info">Timeline entries are records in this workspace. Restricted events are not shown to a role view that does not hold them.</Notice>
    </Stack>
  );
}

function ExportTimeline({ context }: { context: ScreenContext }) {
  const events = useCollection("timelineEvents");
  return (
    <Stack gap={3}>
      <p>{events.length} events will be written to a CSV file in this browser.</p>
      <Button
        variant="primary"
        onClick={() => {
          const header = "date,kind,title,detail\n";
          const body = events.map((event) => [event.at ?? event.updatedAt, String(event.fields.kind ?? ""), event.title, event.summary].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([header + body], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${context.org.slug}-timeline.csv`;
          link.click();
          URL.revokeObjectURL(url);
          context.toast("Exported", "The CSV file downloaded from this browser.");
        }}
      >
        Download CSV
      </Button>
    </Stack>
  );
}

export type { Rec };
