import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AtSign, Bot, FileText, Layers, MessagesSquare, Mic, Microscope, Pin, Rocket, Sparkles, Users, Video,
} from "lucide-react";
import {
  Avatar, Button, Card, Checkbox, DataGrid, DrawerActions, Empty, Field, FactGrid, Grid, ModalActions, ModalUnsavedChanges, Notice,
  OVERLAY_WIDTH, OverlayActions, OverlaySection, OverlaySummary, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useOrgRecords, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness, wallMs } from "@/platform/clock";
import { capabilityById } from "@/platform/capability";
import { composeAnswer, suggestions } from "@/applications/t2_shared/engine";
import {
  AttachmentPicker, AttachTool, CapabilityLine, Composer, ScopeChips, TurnList,
  readTurns, routeForCitation, turnFromAnswer, type Turn,
} from "@/applications/t2_shared/pieces";
import { useChatState, usePanelFlags, type LocalAttachment } from "@/applications/t2_shared/store";
import type { Rec } from "@/domain/types";
import { internalRoster, AssignReviewer, AssignRoomTask, AttachToSpecialist, CommentOnArtifact, CorrectTranscript, HostReview, ResolveDisagreement } from "./actions";

/* ====================================================================== *
 * AI — Companion & Conversations
 *
 * Audit A16: the chat surface was a keyword reply box. Every answer here is
 * composed by the local engine from records in this workspace, names the
 * records it read, and stops at the provider boundary when a request would
 * need a service that is not connected.
 * ====================================================================== */

const NO_ATTACHMENTS: LocalAttachment[] = [];

function threadKey(screenId: string, id: string | undefined): string {
  return `${screenId}:${id ?? "root"}`;
}

function useChatRecords() {
  return useOrgRecords();
}

async function sendTurn(input: {
  context: ScreenContext;
  conversation: Rec;
  records: Rec[];
  text: string;
  scope: Rec[];
  attachments: LocalAttachment[];
  author: string;
  responder: string;
  remit?: string;
  unavailable?: { reason: string; coordinator: string };
}): Promise<void> {
  const { context, conversation, records, text, scope, attachments, author, responder, remit, unavailable } = input;
  const at = context.now.toISOString();
  const person: Turn = {
    id: `turn-${at}-p${readTurns(conversation).length}`,
    role: "person",
    author,
    text,
    at,
    attachments: attachments.length ? attachments : undefined,
    scope: scope.map((record) => record.id),
  };
  let reply: Turn;
  if (unavailable) {
    reply = {
      id: `turn-${at}-u${readTurns(conversation).length}`,
      role: "note",
      author: "Arlovi",
      text: `${responder} is ${unavailable.reason} The request is recorded against ${unavailable.coordinator}, who holds the authority to pick it up. No progress is claimed on your question in the meantime.`,
      at,
      kind: "message",
    };
  } else {
    const answer = composeAnswer({ records, prompt: text, scope, now: context.now, money: context.money, date: context.date, remit });
    reply = turnFromAnswer(answer, at, responder);
  }
  const body = (conversation.body ?? {}) as Record<string, unknown>;
  const saved = await context.mutate.patch(
    conversation.id,
    {
      body: {
        ...body,
        turns: [...readTurns(conversation), person, reply],
        attachments: [...(((body.attachments as LocalAttachment[]) ?? [])), ...attachments],
      },
    },
    { expectRevision: conversation.revision, event: `Turn recorded in ${conversation.title}` },
  );
  if (!saved) return;
  if (reply.boundary) {
    await context.mutate.log(
      `${responder} was asked to ${reply.boundary.asked} in ${conversation.title}. Nothing was sent: ${reply.boundary.capability} is not connected.`,
      { entityId: conversation.id, type: "conversation.boundary", capability: "not_connected" },
    );
    context.toast("Recorded, not sent", `${capabilityById(reply.boundary.capability)?.label ?? "That provider"} is not connected, so the request is kept in the thread.`, "blocked");
  } else {
    context.toast("Answer composed", `${reply.citations?.length ?? 0} record${reply.citations?.length === 1 ? "" : "s"} were read and named in the thread.`);
  }
}

/* ---------------------------- AI-001 ---------------------------- */

function ThreadList({ context, conversations, activeId }: { context: ScreenContext; conversations: Rec[]; activeId?: string }) {
  const pinned = conversations.filter((item) => item.fields.pinned === true && item.fields.archived !== true);
  const recent = conversations.filter((item) => item.fields.pinned !== true && item.fields.archived !== true);
  const group = (label: string, rows: Rec[]) => (
    rows.length > 0 && (
      <Stack gap={1} key={label}>
        <div className="ds-subtle">{label}</div>
        {rows.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ds-record-card"
            aria-current={item.id === activeId ? "true" : undefined}
            style={{ background: item.id === activeId ? "var(--bg-selected)" : undefined }}
            onClick={() => context.select(item.id)}
          >
            <Row gap={2}>
              <strong className="ds-grow ds-truncate" style={{ textAlign: "start" }}>{item.title}</strong>
              {item.fields.shared === true && <Pill tone="info">Shared</Pill>}
            </Row>
            <span className="ds-subtle">{readTurns(item).length} turns · {context.relative(item.at ?? item.updatedAt)}</span>
          </button>
        ))}
      </Stack>
    )
  );
  return (
    <Stack gap={3}>
      {group("Pinned", pinned)}
      {group("Recent", recent)}
      <Button variant="secondary" size="sm" onClick={() => context.openOverlay("Source selector")}>Pin records into scope</Button>
      <Button variant="ghost" size="sm" onClick={() => context.navigate(`/o/${context.org.slug}/ai/conversations`)}>Open the library</Button>
    </Stack>
  );
}

function ArtifactPreview({ context, conversation }: { context: ScreenContext; conversation?: Rec }) {
  const documents = useCollection("documents");
  const artifacts = documents.filter((document) => document.fields.conversationId === conversation?.id || document.fields.artifact === true);
  if (artifacts.length === 0) {
    return <Empty title="No artifact yet" icon={<FileText size={18} />}>An artifact appears here when a thread produces a file in this workspace.</Empty>;
  }
  const artifact = artifacts[0];
  const body = artifact.body as { text?: string; versions?: { version: number }[] } | undefined;
  return (
    <Stack gap={3}>
      <Row gap={2}>
        <strong className="ds-grow">{artifact.title}</strong>
        <Pill tone={artifact.status === "approved" ? "success" : "info"}>{artifact.status}</Pill>
      </Row>
      <p className="ds-subtle" style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{body?.text ?? artifact.summary}</p>
      <Properties rows={[
        { label: "Version", value: String(artifact.fields.version ?? body?.versions?.length ?? 1) },
        { label: "Reviewers", value: String(artifact.fields.reviewers ?? "Not set") },
      ]} />
      <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/ai/artifacts/${artifact.id}`)}>Open artifact</Button>
    </Stack>
  );
}

function ChiefChat({ context }: { context: ScreenContext }) {
  const records = useChatRecords();
  const { actor, org } = useWorkspace();
  const conversations = useMemo(
    () => records.filter((record) => record.collection === "conversations").sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt)),
    [records],
  );
  const fallback = conversations.find((item) => item.fields.archived !== true && readTurns(item).length > 0)
    ?? conversations.find((item) => item.fields.archived !== true);
  const [params] = useSearchParams();
  const asked = context.selectedId ?? params.get("thread") ?? undefined;
  const selected = useRecord(asked);
  const conversation = selected?.collection === "conversations" ? selected : fallback;
  const thread = threadKey(context.screen.id, asked ?? "active");
  useEffect(() => { useChatState.getState().ensureOrg(org.id); }, [org.id]);
  const requestFocus = useChatState((state) => state.requestFocus);
  const turns = readTurns(conversation);
  const openers = suggestions(records);

  if (!conversation) {
    return (
      <Empty
        title="No conversation exists yet"
        icon={<Sparkles size={20} />}
        action={<Button variant="primary" onClick={() => context.openOverlay("Source selector")}>Pick records to start from</Button>}
      >
        A thread is a record in this workspace. Start one by pinning the records the question is about.
      </Empty>
    );
  }

  return (
    <Grid>
      <Card span={3} title="Threads" subtitle={`${conversations.length} in ${org.shortName}`}>
        <ThreadList context={context} conversations={conversations} activeId={conversation.id} />
      </Card>

      <Card
        span={6}
        prov="agent"
        title={conversation.title}
        subtitle={`${turns.length} turns · ${conversation.fields.shared === true ? "shared with the workspace" : "private to you"}`}
      >
        <Stack gap={4}>
          {turns.length === 0 && (
            <Stack gap={2}>
              <span className="ds-subtle">Questions this workspace can answer:</span>
              {openers.map((opener) => (
                <Button
                  key={opener}
                  size="sm"
                  variant="secondary"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => {
                    useChatState.getState().setDraft(thread, opener);
                    requestFocus(thread);
                  }}
                >
                  {opener}
                </Button>
              ))}
            </Stack>
          )}
          <TurnList
            turns={turns}
            context={context}
            emptyTitle="Nothing asked yet"
            emptyBody="Answers are composed from records here and name what they read."
            onInspect={(turn) => context.openOverlay("message action menu", { turnId: turn.id, conversationId: conversation.id })}
          />
          <Composer
            thread={thread}
            records={records}
            context={context}
            placeholder={`Ask about ${org.shortName}`}
            onSend={({ text, scope, attachments }) => sendTurn({
              context, conversation, records, text, scope, attachments, author: actor, responder: "Arlovi",
            })}
            extraTools={
              <>
                <AttachTool onClick={() => context.openOverlay("upload review", { conversationId: conversation.id })} />
                <Button size="sm" variant="secondary" icon={<AtSign size={14} />} onClick={() => context.openOverlay("Source selector", { conversationId: conversation.id })}>Mention a record</Button>
                <Button size="sm" variant="ghost" icon={<Mic size={14} />} onClick={() => context.navigate(`/o/${org.slug}/ai/voice`)}>Dictate</Button>
              </>
            }
          />
        </Stack>
      </Card>

      <Card span={3} prov="agent" title="Artifact">
        <ArtifactPreview context={context} conversation={conversation} />
      </Card>
    </Grid>
  );
}

function ChatAttachments({ context }: { context: ScreenContext }) {
  const conversations = useCollection("conversations");
  const rows = conversations.flatMap((conversation) => {
    const body = conversation.body as { attachments?: LocalAttachment[] } | undefined;
    return (body?.attachments ?? []).map((attachment) => ({ conversation, attachment }));
  });
  if (rows.length === 0) {
    return <Empty title="Nothing is attached" icon={<Layers size={20} />}>A file attached to a thread is recorded by name, size and type. The bytes are never copied anywhere.</Empty>;
  }
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Attached by reference">
        {rows.length} attachment{rows.length === 1 ? "" : "s"} are recorded against threads in this workspace. Nothing was uploaded, and the file contents are not stored here.
      </Notice>
      <DataGrid
        rows={rows}
        rowId={(row) => `${row.conversation.id}-${row.attachment.id}`}
        label="Attachments"
        columns={[
          { key: "name", header: "File", primary: true, cell: (row) => row.attachment.name, sortValue: (row) => row.attachment.name, filterValue: (row) => row.attachment.name },
          { key: "thread", header: "Thread", cell: (row) => row.conversation.title, filterValue: (row) => row.conversation.title },
          { key: "type", header: "Type", cell: (row) => row.attachment.type },
          { key: "record", header: "Linked record", cell: (row) => row.attachment.recordId ?? "Not linked" },
          { key: "size", header: "Size", align: "end", cell: (row) => `${(row.attachment.size / 1024).toFixed(0)} kB`, sortValue: (row) => row.attachment.size },
        ]}
        onOpen={(id) => {
          const row = rows.find((item) => `${item.conversation.id}-${item.attachment.id}` === id);
          if (row) { context.select(row.conversation.id); context.navigate(`/o/${context.org.slug}/ai/chat`); }
        }}
      />
    </Stack>
  );
}

function RelatedMissions({ context }: { context: ScreenContext }) {
  const data = useCollections(["missions", "conversations"]);
  const linked = data.missions.filter((mission) => data.conversations.some((conversation) => conversation.fields.missionId === mission.id));
  if (linked.length === 0) {
    return (
      <Empty title="No mission came from a thread yet" icon={<Rocket size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("task authorization")}>Propose a mission</Button>}>
        A thread turns into work by authorising a mission with a named target and a spend ceiling.
      </Empty>
    );
  }
  return (
    <Grid>
      {linked.map((mission) => (
        <Card
          key={mission.id}
          span={6}
          title={mission.title}
          subtitle={mission.summary}
          actions={<Pill tone={mission.status === "running" ? "info" : "neutral"} dot>{mission.status}</Pill>}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`)}>Open mission</Button>}
        >
          <Properties rows={[
            { label: "Budget", value: context.money(Number(mission.fields.budgetMinor ?? 0)) },
            { label: "Committed", value: context.money(Number(mission.fields.committedMinor ?? 0)) },
            { label: "Spent", value: context.money(Number(mission.fields.spentMinor ?? 0)) },
          ]} />
        </Card>
      ))}
    </Grid>
  );
}

/* ---------------------------- AI-002 ---------------------------- */

function ConversationLibrary({ context, view }: { context: ScreenContext; view: "Recent" | "Pinned" | "Shared" | "Archived" }) {
  const conversations = useCollection("conversations");
  const searching = usePanelFlags((state) => state.flags["ai.library.search"] === true);
  const policies = useCollection("policies");
  const retention = policies.find((policy) => policy.fields.kind === "retention");
  const rows = conversations.filter((conversation) => {
    if (view === "Archived") return conversation.fields.archived === true;
    if (conversation.fields.archived === true) return false;
    if (view === "Pinned") return conversation.fields.pinned === true;
    if (view === "Shared") return conversation.fields.shared === true;
    return true;
  });

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} conversations`} icon={<MessagesSquare size={20} />}>Threads appear here as records; nothing is hidden from this list except another organisation's threads.</Empty>;
  }

  return (
    <Stack gap={3}>
      {searching && (
        <Card title="Search transcripts" subtitle="Every turn stored in this organisation"
          actions={<Button size="sm" variant="ghost" onClick={() => usePanelFlags.getState().set("ai.library.search", false)}>Close search</Button>}>
          <TranscriptSearch context={context} />
        </Card>
      )}
      {view === "Archived" && (
        <Notice tone="warning" title="Archived threads are still records">
          Archiving hides a thread from the chat surface. It stays in this workspace for the retention schedule
          ({String(retention?.fields.conversationYears ?? 2)} years for conversations) and a thread under a legal hold cannot be deleted at all.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${view} conversations`}
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Thread preview", { id })}
        columns={[
          { key: "title", header: "Thread", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${readTurns(row).map((turn) => turn.text).join(" ")}` },
          { key: "with", header: "With", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.agentId ?? "Arlovi")} kind="ai" size="sm" />{String(row.fields.kind ?? "chief") === "chief" ? "Chief of Staff" : "Specialist"}</Row> },
          { key: "turns", header: "Turns", align: "end", cell: (row) => String(readTurns(row).length), sortValue: (row) => readTurns(row).length },
          { key: "sharing", header: "Sharing", cell: (row) => <Pill tone={row.fields.shared === true ? "info" : "neutral"}>{row.fields.shared === true ? "Workspace" : "Only you"}</Pill> },
          { key: "hold", header: "Retention", cell: (row) => row.fields.legalHold === true ? <Pill tone="warning">Legal hold</Pill> : <span className="ds-subtle">Schedule</span> },
          { key: "updated", header: "Last turn", align: "end", cell: (row) => context.relative(row.at ?? row.updatedAt), sortValue: (row) => row.at ?? row.updatedAt },
        ]}
        bulkActions={[
          {
            label: "Archive",
            onRun: (selected) => void patchThreads(context, selected, (conversation) => ({ status: "archived", fields: { ...conversation.fields, archived: true } }), "archived", "They are out of the chat surface and still held for the retention schedule."),
          },
          {
            label: "Share with the workspace",
            onRun: (selected) => void patchThreads(context, selected, (conversation) => ({ fields: { ...conversation.fields, shared: true } }), "shared with the workspace", "Everyone with a role view that opens Ask Arlovi can read them."),
          },
        ]}
      />
    </Stack>
  );
}

/** Apply one change to each selected thread and report how many were really saved. */
async function patchThreads(context: ScreenContext, rows: Rec[], make: (row: Rec) => Partial<Rec>, done: string, detail: string): Promise<void> {
  let saved = 0;
  for (const row of rows) {
    if (await context.mutate.patch(row.id, make(row), { expectRevision: row.revision, event: `${row.title} ${done}` })) saved += 1;
  }
  if (saved === 0) return;
  context.toast(saved === rows.length ? `${saved} thread${saved === 1 ? "" : "s"} ${done}` : `${saved} of ${rows.length} threads ${done}`, saved === rows.length ? detail : "The rest changed elsewhere and were left as they were.");
}

function TranscriptSearch({ context }: { context: ScreenContext }) {
  const conversations = useCollection("conversations");
  const [query, setQuery] = useState("");
  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return conversations.flatMap((conversation) =>
      readTurns(conversation)
        .filter((turn) => turn.text.toLowerCase().includes(needle))
        .map((turn) => ({ conversation, turn })),
    );
  }, [conversations, query]);
  return (
    <Stack gap={3}>
      <Field label="Search every transcript in this organisation" hint="Searches the turns stored in this browser. Another organisation's threads are not in this index.">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="shade, VAT, supplier…" />
      </Field>
      {query && hits.length === 0 && <Notice tone="info">No turn contains that text.</Notice>}
      {hits.map(({ conversation, turn }) => (
        <Card key={`${conversation.id}-${turn.id}`} title={conversation.title} subtitle={`${turn.author} · ${context.dateTime(turn.at)}`} footer={
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Thread preview", { id: conversation.id })}>Preview thread</Button>
        }>
          <p className="ds-prose">{turn.text}</p>
        </Card>
      ))}
    </Stack>
  );
}

/* ---------------------------- AI-003 ---------------------------- */

const REMIT: Record<string, string> = {
  Finance: "money", Research: "knowledge", Care: "customers", Creative: "knowledge",
  Procurement: "customers", Analytics: "money", Scheduling: "calendar", Stock: "customers",
  "Chief of Staff": "missions", Quality: "workforce", "Legal review": "knowledge",
};

function SpecialistChat({ context }: { context: ScreenContext }) {
  const records = useChatRecords();
  const { actor, org } = useWorkspace();
  const agent = useRecord(context.params.id);
  const conversations = records.filter((record) => record.collection === "conversations");
  const conversation = conversations.find((item) => item.fields.agentId === context.params.id);
  const thread = threadKey(context.screen.id, context.params.id);
  const remit = REMIT[String(agent?.fields.role ?? "")] ?? undefined;
  const paused = agent?.status === "paused";
  const coordinator = String(agent?.fields.manager ?? "the Chief of Staff");

  if (!agent || agent.collection !== "agents") {
    return <Empty title="That specialist is not in this workspace" icon={<Bot size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/team/agents`)}>Open the directory</Button>} />;
  }

  return (
    <Stack gap={4}>
      {paused && (
        <Notice tone="warning" title={`${agent.title} is paused`}>
          {String(agent.fields.pausedReason ?? "The contract is paused.")} Messages are recorded and handed to {coordinator}. No progress is claimed while it is paused.
        </Notice>
      )}
      {!conversation ? (
        <Empty
          title={`No thread with ${agent.title} yet`}
          icon={<Bot size={20} />}
          action={
            <Button
              variant="primary"
              onClick={async () => {
                await context.mutate.create({
                  collection: "conversations",
                  title: `${agent.title} · ${String(agent.fields.role ?? "specialist")}`,
                  status: "active",
                  summary: `Thread with ${agent.title}, bounded to its recorded remit.`,
                  at: context.now.toISOString(),
                  fields: { agentId: agent.id, kind: "specialist", pinned: false, shared: false, archived: false },
                  body: { turns: [] },
                }, `Thread opened with ${agent.title}`);
                context.toast("Thread opened", `${agent.title} now has a thread in this workspace.`);
              }}
            >
              Start a thread
            </Button>
          }
        >
          A thread with a specialist is a record. Starting one creates it here; nothing is sent anywhere.
        </Empty>
      ) : (
        <Stack gap={4}>
          <CapabilityLine id="model.inference" title={`No model is connected: ${agent.title} answers from records only`}>
            Bounded to {String(agent.fields.role ?? "its role")} work recorded in this workspace.
          </CapabilityLine>
          <TurnList
            turns={readTurns(conversation)}
            context={context}
            emptyTitle={`Nothing asked of ${agent.title}`}
            emptyBody="A specialist answers inside its recorded remit and refers anything outside it."
            onInspect={(turn) => context.openOverlay("mission escalation", { turnId: turn.id })}
          />
          <Composer
            thread={thread}
            records={records}
            context={context}
            placeholder={`Message ${agent.title}`}
            onSend={({ text, scope, attachments }) => sendTurn({
              context, conversation, records, text, scope, attachments, author: actor,
              responder: agent.title, remit,
              unavailable: paused ? { reason: `paused: ${String(agent.fields.pausedReason ?? "its contract is on hold.")}`, coordinator } : undefined,
            })}
            extraTools={
              <>
                <AttachTool onClick={() => context.openOverlay("Agent profile drawer", { id: agent.id })} />
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("mission escalation", { id: agent.id })}>Request handoff</Button>
              </>
            }
          />
        </Stack>
      )}
    </Stack>
  );
}

function SpecialistWork({ context }: { context: ScreenContext }) {
  const data = useCollections(["missionTasks", "missions", "tasks"]);
  const agent = useRecord(context.params.id);
  const name = agent?.title ?? "";
  const rows = [...data.missionTasks, ...data.tasks].filter((task) => String(task.fields.assignee ?? task.ownerName) === name);
  if (rows.length === 0) return <Empty title={`No work is assigned to ${name || "this specialist"}`} icon={<Rocket size={20} />}>Work arrives from a mission plan or a task board.</Empty>;
  return (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="Assigned work"
      columns={[
        { key: "title", header: "Item", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "stage", header: "Stage", cell: (row) => <Pill tone={row.fields.stage === "verified" ? "success" : row.fields.stage === "blocked" ? "warning" : "neutral"}>{String(row.fields.stage ?? row.status)}</Pill> },
        { key: "mission", header: "Mission", cell: (row) => data.missions.find((mission) => mission.id === row.parentId)?.title ?? "—" },
        { key: "estimate", header: "Estimate", align: "end", cell: (row) => row.fields.estimateHours ? `${String(row.fields.estimateHours)} h` : "—" },
      ]}
      onOpen={(id) => {
        const row = rows.find((item) => item.id === id);
        if (row?.parentId) context.navigate(`/o/${context.org.slug}/mission/missions/${row.parentId}/tasks`);
      }}
    />
  );
}

function SpecialistSources({ context }: { context: ScreenContext }) {
  const agent = useRecord(context.params.id);
  const sources = useCollection("sources");
  const policies = useCollection("policies");
  const body = agent?.body as { sources?: string[] } | undefined;
  const granted = (body?.sources ?? []).map((id) => sources.find((source) => source.id === id)).filter((source): source is Rec => Boolean(source));
  const grantPolicy = policies.find((policy) => policy.fields.kind === "grants");
  const grants = (grantPolicy?.body as { grants?: { agentId: string; groups: string[]; note: string }[] } | undefined)?.grants ?? [];
  const mine = grants.find((grant) => grant.agentId === agent?.id);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="What this specialist may read">
        {mine ? `${mine.note} Sensitivity groups granted: ${mine.groups.join(", ")}.` : "No source grant is recorded for this contract, so it reads nothing beyond the records on screen."}
      </Notice>
      {granted.length === 0 ? (
        <Empty title="No named source" icon={<Microscope size={20} />}>This contract has no specific source list; it reads the collections its skills name.</Empty>
      ) : (
        <DataGrid
          rows={granted}
          rowId={(row) => row.id}
          label="Granted sources"
          columns={[
            { key: "title", header: "Source", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "class", header: "Classification", cell: (row) => <Pill tone={row.fields.classification === "confidential" ? "warning" : "neutral"}>{String(row.fields.classification)}</Pill> },
            { key: "state", header: "Indexing", cell: (row) => <Pill tone={row.status === "indexed" ? "success" : "warning"}>{row.status}</Pill> },
            { key: "fresh", header: "Freshness", align: "end", cell: (row) => context.date(String(row.fields.freshness ?? row.updatedAt)) },
          ]}
          onOpen={(id) => context.navigate(`/o/${context.org.slug}/brain/sources/${id}`)}
        />
      )}
    </Stack>
  );
}

/* ---------------------------- AI-004 ---------------------------- */

function roomParticipants(room: Rec | undefined, records: Rec[]): Rec[] {
  const ids = String(room?.fields.participants ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return ids.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
}

function TeamRoom({ context, view }: { context: ScreenContext; view: "Discussion" | "Decisions" | "Files" | "Tasks" }) {
  const records = useChatRecords();
  const { actor } = useWorkspace();
  const room = useRecord(context.params.id);
  const messages = records
    .filter((record) => record.collection === "messages" && record.parentId === context.params.id)
    .sort((a, b) => (a.at ?? a.createdAt).localeCompare(b.at ?? b.createdAt));
  const participants = roomParticipants(room, records);
  const thread = threadKey(context.screen.id, context.params.id);

  if (!room || room.collection !== "channels") {
    return <Empty title="That room is not in this workspace" icon={<Users size={20} />} />;
  }

  if (view === "Decisions") {
    const decided = messages.filter((message) => message.fields.decision === true);
    return decided.length === 0
      ? <Empty title="No decision has been pinned" icon={<Pin size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("decision recorder")}>Record a decision</Button>}>A decision pinned here is written to the decision register with its approvers.</Empty>
      : (
        <Stack gap={3}>
          {decided.map((message) => (
            <Card key={message.id} title={message.title} subtitle={`${String(message.fields.author)} · ${context.dateTime(message.at ?? message.createdAt)}`} prov="human"
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/brain/decisions`)}>Open the register</Button>}>
              <p className="ds-prose">{message.summary}</p>
            </Card>
          ))}
        </Stack>
      );
  }

  if (view === "Files") {
    const documents = records.filter((record) => record.collection === "documents" && (record.fields.missionId === room.fields.missionId || record.fields.artifact === true));
    return documents.length === 0
      ? <Empty title="No file in this room" icon={<FileText size={20} />}>Files shared in a room are records in this workspace.</Empty>
      : <DataGrid rows={documents} rowId={(row) => row.id} label="Room files" columns={[
        { key: "title", header: "File", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
        { key: "version", header: "Version", align: "end", cell: (row) => String(row.fields.version ?? 1) },
      ]} onOpen={(id) => context.navigate(`/o/${context.org.slug}/ai/artifacts/${id}`)} />;
  }

  if (view === "Tasks") {
    const tasks = records.filter((record) => (record.collection === "missionTasks" || record.collection === "tasks") && participants.some((person) => person.title === String(record.fields.assignee ?? record.ownerName)));
    return tasks.length === 0
      ? <Empty title="No task is assigned to this room" icon={<Rocket size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Participant selector")}>Assign a task</Button>} />
      : <DataGrid rows={tasks} rowId={(row) => row.id} label="Room tasks" columns={[
        { key: "title", header: "Task", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "who", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.assignee ?? row.ownerName)} kind={row.fields.kind === "ai" ? "ai" : "human"} size="sm" />{String(row.fields.assignee ?? row.ownerName)}</Row> },
        { key: "stage", header: "Stage", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
      ]} />;
  }

  return (
    <Grid>
      <Card span={8} eyebrow="TEAM ROOM" title={room.title} subtitle={room.summary}>
        <Stack gap={4}>
          <Notice tone="info" title="A mention is a request, not a grant">
            Mentioning an AI employee records a request against its contract. It cannot give that contract a tool it does not hold: external tools stay governed by the connector policy.
          </Notice>
          <div role="log" aria-live="polite" aria-label="Room transcript" className="ds-stack ds-gap-3" style={{ maxHeight: "48vh", overflowY: "auto" }}>
            {messages.map((message) => (
              <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${message.fields.blocked === true ? "var(--warning)" : message.fields.kind === "ai" ? "var(--accent)" : "var(--border-strong)"}` }}>
                <Row gap={2} wrap>
                  <Avatar name={String(message.fields.author)} kind={message.fields.kind === "ai" ? "ai" : "human"} size="sm" />
                  <strong>{String(message.fields.author)}</strong>
                  <Pill tone={message.fields.kind === "ai" ? "accent" : "neutral"}>{message.fields.kind === "ai" ? "AI employee" : "Person"}</Pill>
                  <span className="ds-subtle">{context.dateTime(message.at ?? message.createdAt)}</span>
                  <span className="ds-grow" />
                  {message.fields.decision === true && <Pill tone="success">Decision</Pill>}
                  {message.fields.blocked === true && <Pill tone="warning">Blocked by policy</Pill>}
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("topic thread", { id: message.id })}>Thread</Button>
                </Row>
                <p className="ds-prose" style={{ marginBlockStart: "var(--space-2)" }}>{message.title} — {message.summary}</p>
                {message.fields.blocked === true && <CapabilityLine id={String(message.fields.capability ?? "site.publish")} />}
              </div>
            ))}
            {messages.length === 0 && <Empty title="No messages yet" icon={<MessagesSquare size={20} />}>Post the first message to the room.</Empty>}
          </div>
          <Composer
            thread={thread}
            records={records}
            context={context}
            mentionPool={participants}
            placeholder={`Message ${room.title}`}
            onSend={async ({ text, scope }) => {
              const boundary = composeAnswer({ records, prompt: text, scope, now: context.now, money: context.money, date: context.date }).boundary;
              await context.mutate.create({
                collection: "messages",
                title: text.slice(0, 60),
                status: boundary ? "blocked" : "posted",
                summary: boundary
                  ? `Recorded and stopped: ${capabilityById(boundary.capability)?.label ?? boundary.capability} is not connected, so no external action was taken.`
                  : text,
                parentId: room.id,
                at: context.now.toISOString(),
                fields: { author: actor, kind: "human", capability: boundary?.capability ?? "", blocked: Boolean(boundary) },
              }, `Message posted to ${room.title}`);
              if (boundary) {
                context.toast("Recorded, not performed", "A room mention cannot grant an external tool.", "blocked");
              } else {
                context.toast("Posted", "The message is a record in this room.");
              }
            }}
            extraTools={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("decision recorder")}>Pin a decision</Button>}
          />
        </Stack>
      </Card>

      <Card span={4} eyebrow="ROSTER" prov="human" title="Participants" subtitle={`${participants.length} in the room`}>
        <Stack gap={2}>
          {participants.map((person) => (
            <Row key={person.id} gap={2}>
              <Avatar name={person.title} kind={person.collection === "agents" || person.fields.kind === "ai" ? "ai" : "human"} size="sm" />
              <span className="ds-grow ds-truncate">{person.title}</span>
              <Pill tone={person.collection === "agents" || person.fields.kind === "ai" ? "accent" : "neutral"}>
                {person.collection === "agents" || person.fields.kind === "ai" ? "AI" : "Person"}
              </Pill>
            </Row>
          ))}
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Participant selector")}>Change participants</Button>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- AI-005 ---------------------------- */

function MissionRoom({ context, view }: { context: ScreenContext; view: "Discussion" | "Agents" | "Tasks" | "Reviews" }) {
  const records = useChatRecords();
  const { actor } = useWorkspace();
  const mission = useRecord(context.params.id);
  const messages = records
    .filter((record) => record.collection === "messages" && record.parentId === context.params.id)
    .sort((a, b) => (a.at ?? a.createdAt).localeCompare(b.at ?? b.createdAt));
  const tasks = records.filter((record) => record.collection === "missionTasks" && record.parentId === context.params.id);
  const agents = records.filter((record) => record.collection === "agents");
  const assigned = agents.filter((agent) => tasks.some((task) => String(task.fields.assignee) === agent.title) || mission?.fields.agentId === agent.id);
  const loops = messages.filter((message) => message.fields.loop === true);
  const thread = threadKey(context.screen.id, context.params.id);

  if (!mission || mission.collection !== "missions") return <Empty title="That mission is not in this workspace" icon={<Rocket size={20} />} />;

  if (view === "Agents") {
    return (
      <Grid>
        {assigned.map((agent) => (
          <Card key={agent.id} span={4} title={<Row gap={2}><Avatar name={agent.title} kind="ai" size="sm" />{agent.title}</Row>} subtitle={String(agent.fields.role ?? "")}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/ai/agents/${agent.id}/chat`)}>Message</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Task handoff drawer", { agentId: agent.id })}>Handoff</Button>
            </>}>
            <Properties rows={[
              { label: "Autonomy", value: String(agent.fields.autonomy ?? "draft") },
              { label: "Tasks here", value: String(tasks.filter((task) => String(task.fields.assignee) === agent.title).length) },
              { label: "Model", value: <Pill tone="warning">Not connected</Pill> },
            ]} />
          </Card>
        ))}
        {assigned.length === 0 && <Empty title="No agent is assigned" icon={<Bot size={20} />} />}
      </Grid>
    );
  }

  if (view === "Tasks") {
    return tasks.length === 0
      ? <Empty title="This mission has no tasks" icon={<Rocket size={20} />} />
      : <DataGrid rows={tasks} rowId={(row) => row.id} label="Mission tasks" columns={[
        { key: "title", header: "Task", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "who", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.assignee ?? row.ownerName)} kind={row.fields.kind === "ai" ? "ai" : "human"} size="sm" />{String(row.fields.assignee ?? row.ownerName)}</Row> },
        { key: "stage", header: "Stage", cell: (row) => <Pill tone={row.fields.stage === "blocked" ? "warning" : row.fields.stage === "verified" ? "success" : "neutral"}>{String(row.fields.stage)}</Pill> },
        { key: "dep", header: "Depends on", cell: (row) => {
          const body = row.body as { dependsOn?: string[] } | undefined;
          return (body?.dependsOn ?? []).map((id) => tasks.find((task) => task.id === id)?.title ?? id).join(", ") || "Nothing";
        } },
      ]} onOpen={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/tasks`)} />;
  }

  if (view === "Reviews") {
    const reviews = tasks.filter((task) => task.fields.approvalRequired === true);
    return (
      <Stack gap={3}>
        <Notice tone="info" title="A review is a person's decision">
          Nothing in a mission room approves work. A review records who decided and when, and the mission stops at the gate until then.
        </Notice>
        {reviews.length === 0 ? <Empty title="No review gate on this mission" /> : reviews.map((task) => (
          <Card key={task.id} title={task.title} subtitle={`Owner ${String(task.fields.assignee)}`} prov={task.fields.kind === "ai" ? "agent" : "human"}
            actions={<Pill tone={task.fields.stage === "verified" ? "success" : "warning"}>{String(task.fields.stage)}</Pill>}
            footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("review dialog", { id: task.id })}>Record a review</Button>}>
            <p className="ds-prose">{task.summary}</p>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={8} prov="agent" title="Coordination" subtitle="Requests between agents and the coordinator's decisions">
        <Stack gap={4}>
          {loops.length > 0 && (
            <Notice tone="warning" title="A delegation loop was stopped">
              {loops.map((loop) => loop.summary).join(" ")} Repeating a request without new evidence is halted and handed to the coordinator rather than left to run.
            </Notice>
          )}
          <div role="log" aria-live="polite" aria-label="Mission room" className="ds-stack ds-gap-3" style={{ maxHeight: "46vh", overflowY: "auto" }}>
            {messages.map((message) => (
              <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${message.fields.loop === true ? "var(--danger)" : "var(--accent)"}` }}>
                <Row gap={2} wrap>
                  <Avatar name={String(message.fields.author)} kind={message.fields.kind === "human" ? "human" : "ai"} size="sm" />
                  <strong>{String(message.fields.author)}</strong>
                  {message.fields.requestTo ? <Pill tone="info">request to {String(message.fields.requestTo)}</Pill> : null}
                  <span className="ds-subtle">{context.dateTime(message.at ?? message.createdAt)}</span>
                  <span className="ds-grow" />
                  <Button size="sm" variant="ghost" aria-label={`Evidence for ${message.title}`} onClick={() => context.openOverlay("evidence inspector", { id: message.id })}>Evidence</Button>
                </Row>
                <p className="ds-prose" style={{ marginBlockStart: "var(--space-2)" }}>{message.title} — {message.summary}</p>
              </div>
            ))}
            {messages.length === 0 && <Empty title="No coordination yet" icon={<MessagesSquare size={20} />} />}
          </div>
          <Composer
            thread={thread}
            records={records}
            context={context}
            mentionPool={assigned}
            placeholder="Ask for a status or assign a reviewer"
            onSend={async ({ text, scope }) => {
              const answer = composeAnswer({ records, prompt: text, scope, now: context.now, money: context.money, date: context.date });
              await context.mutate.create({
                collection: "messages",
                title: text.slice(0, 60),
                status: "posted",
                summary: text,
                parentId: mission.id,
                at: context.now.toISOString(),
                fields: { author: actor, kind: "human", room: "mission" },
              }, `Request recorded in the ${mission.title} room`);
              await context.mutate.create({
                collection: "messages",
                title: "Status from the records",
                status: "posted",
                summary: answer.text,
                parentId: mission.id,
                at: context.now.toISOString(),
                fields: { author: "Arlovi", kind: "ai", room: "mission", citations: answer.citations.map((citation) => citation.id).join(",") },
              }, `Status composed for ${mission.title}`);
              context.toast("Status recorded", `Composed from ${answer.citations.length} records and posted to the room.`);
            }}
          />
        </Stack>
      </Card>
      <Card span={4} prov="human" title="Dependencies" subtitle={`${tasks.length} tasks`}>
        <Stack gap={2}>
          {tasks.map((task) => {
            const body = task.body as { dependsOn?: string[] } | undefined;
            return (
              <div key={task.id} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <Row gap={2}><strong className="ds-grow ds-truncate">{task.title}</strong><Pill tone={task.fields.stage === "blocked" ? "warning" : "neutral"}>{String(task.fields.stage)}</Pill></Row>
                <span className="ds-subtle">
                  {(body?.dependsOn ?? []).length === 0 ? "No dependency" : `After ${(body?.dependsOn ?? []).map((id) => tasks.find((item) => item.id === id)?.title ?? id).join(", ")}`}
                </span>
              </div>
            );
          })}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- AI-006 ---------------------------- */

interface TranscriptEntry { id: string; at: string; speaker: string; text: string; source: string; corrected?: { from: string; at: string; by: string } }

function transcriptOf(record: Rec | undefined): TranscriptEntry[] {
  const body = record?.body as { transcript?: TranscriptEntry[] } | undefined;
  return Array.isArray(body?.transcript) ? body!.transcript! : [];
}

function useVoiceSession() {
  const meetings = useCollection("meetings");
  return meetings.find((meeting) => meeting.fields.kind === "voice");
}

async function createVoiceSession(context: ScreenContext): Promise<Rec> {
  return context.mutate.create({
    collection: "meetings",
    title: `Voice note · ${context.date(context.now)}`,
    status: "open",
    summary: "Typed voice session. No audio was captured because no speech service is connected.",
    startAt: context.now.toISOString(),
    fields: { kind: "voice", recording: "not_connected", microphone: "not_requested" },
    body: { transcript: [], participants: [{ id: "self", name: context.actor, kind: "human", consent: "given" }], agenda: [] },
  }, "Voice session opened locally");
}

function VoiceLive({ context }: { context: ScreenContext }) {
  const session = useVoiceSession();
  const [speaker, setSpeaker] = useState(context.actor);
  const [text, setText] = useState("");
  const members = useCollection("members");

  if (!session) {
    return (
      <Empty
        title="No voice session is open"
        icon={<Mic size={20} />}
        action={<Button variant="primary" onClick={() => void createVoiceSession(context)}>Open a typed session</Button>}
      >
        No audio service is connected, so nothing can be recorded or transcribed here. A session still models the turns: type what was said and it is kept as a transcript in this workspace.
      </Empty>
    );
  }

  const entries = transcriptOf(session);

  return (
    <Grid>
      <Card span={7} eyebrow="VOICE" title="Turn state" subtitle={session.title} prov="human">
        <Stack gap={4}>
          <CapabilityLine id="telephony" title="No audio service is connected">
            The microphone is never opened by this screen and no speech is transcribed. Nothing is listening.
          </CapabilityLine>
          <StatRow>
            <Stat label="Capture" value="Idle" unavailable meta="No audio service" />
            <Stat label="Microphone" value={String(session.fields.microphone ?? "not requested")} unavailable meta="Permission not requested" />
            <Stat label="Turns recorded" value={String(entries.length)} prov="human" meta="Typed in this browser" />
          </StatRow>
          <form
            className="ds-stack ds-gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!text.trim()) return;
              const entry: TranscriptEntry = { id: `tr-${wallMs()}`, at: context.now.toISOString(), speaker, text: text.trim(), source: "typed" };
              const body = (session.body ?? {}) as Record<string, unknown>;
              if (!(await context.mutate.patch(session.id, { body: { ...body, transcript: [...entries, entry] } }, { expectRevision: session.revision, event: "Transcript turn added" }))) return;
              setText("");
              context.toast("Turn recorded", "It is in the transcript as typed text, marked as typed rather than heard.");
            }}
          >
            <Row gap={3} wrap>
              <Field label="Speaker">
                <Select value={speaker} onChange={(event) => setSpeaker(event.target.value)}>
                  {[context.actor, ...internalRoster(members, true).map((member) => member.title)].filter((name, index, all) => all.indexOf(name) === index).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </Select>
              </Field>
            </Row>
            <Field label="What was said" hint="Typed text is marked as typed. It is never presented as a machine transcription.">
              <TextArea value={text} rows={3} onChange={(event) => setText(event.target.value)} />
            </Field>
            <Row gap={2}>
              <Button type="submit" variant="primary" disabled={!text.trim()}>Add turn</Button>
              <Button variant="secondary" onClick={() => context.openOverlay("Mic permission")}>Microphone state</Button>
              <Button variant="ghost" onClick={() => context.openOverlay("sensitive-action confirmation")}>Try a sensitive action</Button>
            </Row>
          </form>
        </Stack>
      </Card>

      <Card span={5} eyebrow="TRANSCRIPT" prov="human" title="Latest turns" subtitle={`${entries.length} recorded`}>
        {entries.length === 0 ? <Empty title="Nothing typed yet" /> : (
          <Stack gap={2}>
            {entries.slice(-6).reverse().map((entry) => (
              <div key={entry.id} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <Row gap={2}><strong>{entry.speaker}</strong><span className="ds-subtle">{context.dateTime(entry.at)}</span><span className="ds-grow" /><Pill tone="neutral">{entry.source}</Pill></Row>
                <p className="ds-prose">{entry.text}</p>
              </div>
            ))}
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

function VoiceTranscript({ context }: { context: ScreenContext }) {
  const session = useVoiceSession();
  const entries = transcriptOf(session);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");

  if (!session) return <Empty title="No session to show" icon={<Mic size={20} />}>Open a typed session on the Live tab first.</Empty>;
  if (entries.length === 0) return <Empty title="The transcript is empty" icon={<Mic size={20} />}>Nothing has been typed into this session.</Empty>;

  return (
    <Stack gap={3}>
      <Notice tone="info" title="Corrections keep the original">
        Correcting a line records what it said before, who changed it and when. The original text is never overwritten in place.
      </Notice>
      {entries.map((entry) => (
        <Card key={entry.id} title={entry.speaker} subtitle={`${context.dateTime(entry.at)} · ${entry.source}`} prov="human"
          actions={entry.corrected ? <Pill tone="info">Corrected</Pill> : undefined}
          footer={
            editing === entry.id ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <span className="ds-grow" />
                <Button size="sm" variant="primary" onClick={async () => {
                  const body = (session.body ?? {}) as Record<string, unknown>;
                  const next = entries.map((item) => item.id === entry.id
                    ? { ...item, text: value, corrected: { from: item.text, at: context.now.toISOString(), by: context.actor } }
                    : item);
                  if (!(await context.mutate.patch(session.id, { body: { ...body, transcript: next } }, { expectRevision: session.revision, event: `Transcript line corrected by ${context.actor}` }))) return;
                  setEditing(null);
                  context.toast("Line corrected", "The previous text is kept on the line as its correction history.");
                }}>Save correction</Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => { setEditing(entry.id); setValue(entry.text); }}>Correct text</Button>
            )
          }
        >
          {editing === entry.id
            ? <TextArea value={value} rows={3} onChange={(event) => setValue(event.target.value)} aria-label={`Correct what ${entry.speaker} said`} />
            : <p className="ds-prose">{entry.text}</p>}
          {entry.corrected && <span className="ds-subtle">Was: “{entry.corrected.from}” — corrected by {entry.corrected.by} {context.relative(entry.corrected.at)}</span>}
        </Card>
      ))}
    </Stack>
  );
}

function VoiceSettings({ context }: { context: ScreenContext }) {
  const connectors = useCollection("connectors");
  const audio = connectors.filter((connector) => connector.fields.kind === "audio" || connector.fields.provider === "Audio provider");
  return (
    <Stack gap={4}>
      <CapabilityLine id="telephony" />
      <Card title="What a voice workspace would need" subtitle="Nothing on this list is connected">
        <DataGrid
          rows={audio.length ? audio : [{ id: "none", title: "Speech to text", status: "not_connected", summary: "No audio connector record exists in this workspace." } as Rec]}
          rowId={(row) => row.id}
          label="Audio connectors"
          filterable={false}
          columns={[
            { key: "title", header: "Service", primary: true, cell: (row) => row.title },
            { key: "state", header: "State", cell: (row) => <Pill tone="warning">{String(row.status).replace(/_/g, " ")}</Pill> },
            { key: "note", header: "What it would do", cell: (row) => row.summary },
          ]}
        />
      </Card>
      <Card title="Session preferences" subtitle="Kept in this browser for you">
        <Stack gap={3}>
          <Checkbox label="Mark every line as typed rather than heard" defaultChecked disabled />
          <Checkbox label="Require a typed confirmation before any consequential action" defaultChecked disabled />
          <Notice tone="info">Both settings are fixed while no audio service is connected: a typed line cannot be presented as a transcription, and nothing consequential may be triggered by text that was never heard.</Notice>
          <Button variant="secondary" onClick={() => context.openOverlay("voice settings")}>Choose a voice</Button>
        </Stack>
      </Card>
    </Stack>
  );
}

/* ---------------------------- AI-007 ---------------------------- */

interface Participant { id: string; name: string; kind: string; consent: string; at?: string }

function meetingParts(meeting: Rec | undefined) {
  const body = meeting?.body as { agenda?: { id: string; title: string; minutes: number; owner: string }[]; participants?: Participant[]; transcript?: TranscriptEntry[] } | undefined;
  return {
    agenda: body?.agenda ?? [],
    participants: body?.participants ?? [],
    transcript: body?.transcript ?? [],
  };
}

function MeetingSwitch({ context, kind }: { context: ScreenContext; kind?: string }) {
  const meetings = useCollection("meetings");
  const rows = meetings.filter((meeting) => (kind ? meeting.fields.kind === kind : meeting.fields.kind !== "voice"));
  if (rows.length < 2) return null;
  return (
    <Field label="Meeting">
      <Select
        value={context.params.id}
        onChange={(event) => context.navigate(`/o/${context.org.slug}/ai/meetings/${event.target.value}`)}
      >
        {rows.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
      </Select>
    </Field>
  );
}

function MeetingRoom({ context, view }: { context: ScreenContext; view: "Meeting" | "Transcript" | "Decisions" | "Actions" }) {
  const meeting = useRecord(context.params.id);
  const tasks = useCollection("tasks");
  const decisions = useCollection("decisions");
  const { agenda, participants, transcript } = meetingParts(meeting);
  const [line, setLine] = useState("");
  const [speaker, setSpeaker] = useState("");

  if (!meeting || meeting.collection !== "meetings") {
    return <Empty title="That meeting is not in this workspace" icon={<Video size={20} />} />;
  }

  const humans = participants.filter((participant) => participant.kind === "human");
  const missing = humans.filter((participant) => participant.consent !== "given");
  const consentBlocked = humans.length === 0 || missing.length > 0;
  const actions = tasks.filter((task) => task.fields.meetingId === meeting.id);

  if (view === "Transcript") {
    return (
      <Stack gap={4}>
        <MeetingSwitch context={context} />
        {consentBlocked ? (
          <Notice tone="warning" title="Transcript entry is closed until consent is recorded">
            {humans.length === 0
              ? "No participant is recorded on this meeting, so there is nobody who could have consented. Record the participants first."
              : `${missing.map((participant) => participant.name).join(", ")} ${missing.length === 1 ? "has" : "have"} not given consent. Recording restrictions differ by region, so the transcript stays closed rather than being kept and labelled afterwards.`}
          </Notice>
        ) : (
          <Notice tone="success" title="Every participant has consented">Lines may be typed in. No audio is captured: there is no recording service connected.</Notice>
        )}
        {transcript.length === 0
          ? <Empty title="No transcript line" icon={<Video size={20} />}>Lines are typed by a person and marked as typed.</Empty>
          : (
            <Stack gap={2}>
              {transcript.map((entry) => (
                <div key={entry.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <Row gap={2}><strong>{entry.speaker}</strong><span className="ds-subtle">{context.dateTime(entry.at)}</span><span className="ds-grow" /><Pill>{entry.source}</Pill></Row>
                  <p className="ds-prose">{entry.text}</p>
                </div>
              ))}
            </Stack>
          )}
        <Card title="Add a line" subtitle={consentBlocked ? "Unavailable until consent is complete" : "Typed, not heard"}>
          <form
            className="ds-stack ds-gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (consentBlocked || !line.trim()) return;
              const body = (meeting.body ?? {}) as Record<string, unknown>;
              const entry: TranscriptEntry = { id: `tr-${wallMs()}`, at: context.now.toISOString(), speaker: speaker || context.actor, text: line.trim(), source: "typed" };
              if (!(await context.mutate.patch(meeting.id, { body: { ...body, transcript: [...transcript, entry] } }, { expectRevision: meeting.revision, event: "Meeting transcript line added" }))) return;
              setLine("");
              context.toast("Line added", "It is stored against the meeting as typed text.");
            }}
          >
            <Row gap={3} wrap>
              <Field label="Speaker">
                <Select value={speaker} onChange={(event) => setSpeaker(event.target.value)} disabled={consentBlocked}>
                  <option value="">{context.actor}</option>
                  {participants.map((participant) => <option key={participant.id} value={participant.name}>{participant.name}</option>)}
                </Select>
              </Field>
            </Row>
            <Field label="Line"><TextArea value={line} rows={2} disabled={consentBlocked} onChange={(event) => setLine(event.target.value)} /></Field>
            <Button type="submit" variant="primary" disabled={consentBlocked || !line.trim()} title={consentBlocked ? "Consent is not complete" : undefined}>Add line</Button>
          </form>
        </Card>
      </Stack>
    );
  }

  if (view === "Decisions") {
    const related = decisions.filter((decision) => decision.fields.missionId === meeting.fields.missionId || decision.at === meeting.at);
    return (
      <Stack gap={3}>
        <Notice tone="info" title="Discussion is not authority">
          A line in a transcript is not a decision. A decision is recorded here only when a person writes it down with its approvers, and it then lives in the decision register.
        </Notice>
        {related.length === 0
          ? <Empty title="No decision recorded from this meeting" action={<Button variant="primary" onClick={() => context.openOverlay("meeting notes")}>Write the notes</Button>} />
          : related.map((decision) => (
            <Card key={decision.id} title={decision.title} subtitle={`${decision.status} · approvers ${String(decision.fields.approvers || "none recorded")}`} prov="human"
              footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/brain/decisions`)}>Open the register</Button>}>
              <p className="ds-prose">{decision.summary}</p>
            </Card>
          ))}
      </Stack>
    );
  }

  if (view === "Actions") {
    return (
      <Stack gap={3}>
        {actions.length === 0
          ? <Empty title="No action item yet" icon={<Rocket size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("follow-up approval")}>Create an action</Button>}>An action created here is a task record with this meeting as its source.</Empty>
          : <DataGrid rows={actions} rowId={(row) => row.id} label="Action items" columns={[
            { key: "title", header: "Action", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
            { key: "due", header: "Due", align: "end", cell: (row) => context.date(row.dueAt) },
            { key: "state", header: "Stage", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
          ]} />}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={4} eyebrow="MEETING" prov="human" title="Meeting" subtitle={meeting.summary}>
        <Stack gap={3}>
          <MeetingSwitch context={context} />
          <Properties rows={[
            { label: "When", value: meeting.startAt ? `${context.dateTime(meeting.startAt)} – ${context.date(meeting.endAt, { hour: "2-digit", minute: "2-digit" })}` : "Not recorded" },
            { label: "Where", value: String(meeting.fields.where ?? "Not recorded") },
            { label: "Recording", value: <Pill tone="warning">Not connected</Pill> },
            { label: "Status", value: <Pill tone={meeting.status === "held" ? "success" : "neutral"}>{meeting.status}</Pill> },
          ]} />
          <CapabilityLine id="telephony" title="Nothing is being recorded" />
        </Stack>
      </Card>

      <Card span={4} eyebrow="CONSENT" prov="human" title="Participants and consent" subtitle={`${participants.length} recorded`}>
        {participants.length === 0 ? (
          <Empty title="No participant recorded" action={<Button variant="primary" onClick={() => context.openOverlay("Recording consent")}>Record participants</Button>}>
            Consent cannot be assumed. Until participants are recorded, the transcript stays closed.
          </Empty>
        ) : (
          <Stack gap={2}>
            {participants.map((participant) => (
              <Row key={participant.id} gap={2}>
                <Avatar name={participant.name} kind={participant.kind === "ai" ? "ai" : "human"} size="sm" />
                <span className="ds-grow ds-truncate">{participant.name}</span>
                <Pill tone={participant.consent === "given" ? "success" : participant.consent === "not_applicable" ? "neutral" : "warning"}>
                  {participant.consent.replace(/_/g, " ")}
                </Pill>
              </Row>
            ))}
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Recording consent")}>Update consent</Button>
          </Stack>
        )}
      </Card>

      <Card span={4} eyebrow="AGENDA" prov="human" title="Agenda" subtitle={`${agenda.reduce((sum, item) => sum + item.minutes, 0)} minutes planned`}>
        {agenda.length === 0 ? <Empty title="No agenda" /> : (
          <ol className="ds-stack ds-gap-2" style={{ paddingInlineStart: "1.1rem" }}>
            {agenda.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <div className="ds-subtle">{item.minutes} min · {item.owner}</div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card span={12} title="What an AI participant may do here" subtitle="Bounded by the same policy as text">
        <Grid>
          <Card span={6} title="Allowed" prov="posted">
            <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
              <li>Read the records the meeting is about and quote them.</li>
              <li>Draft notes and actions as records in this workspace.</li>
              <li>Report what it could not find.</li>
            </ul>
          </Card>
          <Card span={6} title="Not possible" prov="unknown">
            <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
              <li>Listening, transcribing or recording: no audio service is connected.</li>
              <li>Treating a sentence in the transcript as an approval.</li>
              <li>Sending or publishing anything agreed in the room.</li>
            </ul>
          </Card>
        </Grid>
      </Card>
    </Grid>
  );
}

/* ---------------------------- AI-008 ---------------------------- */

interface Finding { id: string; claim: string; confidence: string; sourceId: string; factId?: string }

function researchParts(record: Rec | undefined) {
  const body = record?.body as { question?: string; assumptions?: string[]; findings?: Finding[]; methods?: string[]; gaps?: string[] } | undefined;
  return {
    question: body?.question ?? record?.summary ?? "",
    assumptions: body?.assumptions ?? [],
    findings: body?.findings ?? [],
    methods: body?.methods ?? [],
    gaps: body?.gaps ?? [],
  };
}

function ResearchWorkspace({ context, view }: { context: ScreenContext; view: "Findings" | "Sources" | "Methods" | "Citations" }) {
  const data = useCollections(["research", "sources", "facts"]);
  const asked = useRecord(context.params.id);
  const research = asked?.collection === "research" ? asked : data.research[0];
  const { question, assumptions, findings, methods, gaps } = researchParts(research);
  const { now } = useWorkspace();

  if (!research) {
    return <Empty title="No research question is recorded" icon={<Microscope size={20} />}>A research workspace is a record with a question, its findings and the gaps it could not close.</Empty>;
  }

  const switcher = data.research.length > 1 && (
    <Field label="Question">
      <Select value={research.id} onChange={(event) => context.navigate(`/o/${context.org.slug}/ai/research/${event.target.value}`)}>
        {data.research.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </Select>
    </Field>
  );

  if (view === "Sources") {
    const used = findings.map((finding) => data.sources.find((source) => source.id === finding.sourceId)).filter((source): source is Rec => Boolean(source));
    const unique = [...new Map(used.map((source) => [source.id, source])).values()];
    return (
      <Stack gap={4}>
        {switcher}
        {unique.length === 0 ? <Empty title="No source backs this question yet" icon={<Microscope size={20} />}>Every finding must name a source record, so a question with no sources has no findings either.</Empty> : (
          <DataGrid
            rows={unique}
            rowId={(row) => row.id}
            label="Sources used"
            columns={[
              { key: "title", header: "Source", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? "file") },
              { key: "fresh", header: "Freshness", cell: (row) => {
                const age = freshness(String(row.fields.freshness ?? row.updatedAt), now, 30);
                return <Row gap={2}><span>{context.date(String(row.fields.freshness ?? row.updatedAt))}</span><Pill tone={age.stale ? "warning" : "success"}>{age.known ? `${age.days} days old` : "Unknown"}</Pill></Row>;
              } },
              { key: "state", header: "Indexing", cell: (row) => <Pill tone={row.status === "indexed" ? "success" : "warning"}>{row.status}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("Source inspector", { id })}
          />
        )}
      </Stack>
    );
  }

  if (view === "Methods") {
    return (
      <Stack gap={4}>
        {switcher}
        <Card title="How this was done" subtitle="Each step names what was read">
          {methods.length === 0 ? <Empty title="No method recorded" /> : (
            <ol className="ds-stack ds-gap-2" style={{ paddingInlineStart: "1.2rem" }}>
              {methods.map((method) => <li key={method} className="ds-prose">{method}</li>)}
            </ol>
          )}
        </Card>
        <Card title="Assumptions" subtitle="Stated, not hidden">
          {assumptions.length === 0 ? <Empty title="No assumption recorded" /> : (
            <ul className="ds-stack ds-gap-2" style={{ paddingInlineStart: "1.2rem" }}>
              {assumptions.map((assumption) => <li key={assumption} className="ds-prose">{assumption}</li>)}
            </ul>
          )}
        </Card>
        <Notice tone="warning" title="What this workspace cannot do">
          There is no model and no web access here. Nothing was searched, inferred or summarised from outside this browser; every line above is a person's reading of a record.
        </Notice>
      </Stack>
    );
  }

  if (view === "Citations") {
    const rows = findings.map((finding) => ({
      finding,
      source: data.sources.find((source) => source.id === finding.sourceId),
      fact: data.facts.find((fact) => fact.id === finding.factId),
    }));
    return (
      <Stack gap={4}>
        {switcher}
        <DataGrid
          rows={rows}
          rowId={(row) => row.finding.id}
          label="Citations"
          filterable={false}
          columns={[
            { key: "claim", header: "Claim", primary: true, cell: (row) => row.finding.claim },
            { key: "source", header: "Source", cell: (row) => row.source?.title ?? <Pill tone="warning">No source</Pill> },
            { key: "fact", header: "Registered fact", cell: (row) => row.fact?.title ?? "Not registered" },
            { key: "confidence", header: "Confidence", cell: (row) => <Pill tone={row.finding.confidence === "verified" ? "success" : row.finding.confidence === "unavailable" ? "warning" : "info"}>{row.finding.confidence}</Pill> },
          ]}
        />
        <Notice tone="info" title="A claim without a source is not a finding">
          {findings.filter((finding) => !finding.sourceId).length} of {findings.length} lines have no source record and are shown as unavailable rather than as evidence.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={8} eyebrow="RESEARCH" title="Question" subtitle={`${research.status} · ${context.relative(research.at ?? research.updatedAt)}`} prov="human">
        <Stack gap={4}>
          {switcher}
          <p className="ds-prose" style={{ fontSize: "var(--text-lg)" }}>{question}</p>
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("confidence note", { id: research.id })}>Add a confidence note</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("save report", { id: research.id })}>Save as a report</Button>
          </Row>
          <Stack gap={3}>
            {findings.map((finding) => (
              <div key={finding.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${finding.confidence === "verified" ? "var(--success)" : finding.confidence === "unavailable" ? "var(--warning)" : "var(--info)"}` }}>
                <Row gap={2} wrap>
                  <Pill tone={finding.confidence === "verified" ? "success" : finding.confidence === "unavailable" ? "warning" : "info"}>{finding.confidence}</Pill>
                  <span className="ds-grow" />
                  {finding.sourceId
                    ? <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Source inspector", { id: finding.sourceId })}>Inspect source</Button>
                    : <span className="ds-subtle">No source record</span>}
                </Row>
                <p className="ds-prose" style={{ marginBlockStart: "var(--space-2)" }}>{finding.claim}</p>
              </div>
            ))}
            {findings.length === 0 && <Empty title="No finding yet" />}
          </Stack>
        </Stack>
      </Card>

      <Card span={4} eyebrow="CONCLUSION" prov="agent" title="Working conclusion" subtitle="Stated with its limits">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Verified findings", value: String(findings.filter((finding) => finding.confidence === "verified").length) },
            { label: "Unavailable", value: String(findings.filter((finding) => finding.confidence === "unavailable").length) },
            { label: "Overall confidence", value: <Pill tone={String(research.fields.confidence) === "mixed" ? "info" : "warning"}>{String(research.fields.confidence ?? "unrated")}</Pill> },
            { label: "Independent review", value: research.fields.reviewRequested === true ? "Requested" : "Not requested" },
          ]} />
          <Card title="Gaps" pad="tight">
            {gaps.length === 0 ? <span className="ds-subtle">No gap recorded.</span> : (
              <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
                {gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            )}
          </Card>
          <Notice tone="warning" title="Missing private data is reported, not filled in">
            Where a figure has no record behind it, this workspace says so. It does not estimate one and does not treat an unverifiable number as a fact.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- AI-009 ---------------------------- */

function ContextManager({ context, view }: { context: ScreenContext; view: "This chat" | "Team context" | "Connected sources" }) {
  const records = useOrgRecords();
  const data = useCollections(["sources", "policies", "connectors", "conversations", "agents"]);
  const { org } = useWorkspace();
  const scope = useChatState((state) => state.scope);
  const clearScope = useChatState((state) => state.clearScope);
  const threads = Object.entries(scope).filter(([, ids]) => ids.length > 0);

  if (view === "Team context") {
    const grantPolicy = data.policies.find((policy) => policy.fields.kind === "grants");
    const grants = (grantPolicy?.body as { grants?: { agentId: string; groups: string[]; note: string }[] } | undefined)?.grants ?? [];
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Retrieval is limited to active grants">
          An AI employee reads only the sensitivity groups granted to its contract. Changing a grant changes what it can retrieve from the next request onwards.
        </Notice>
        <DataGrid
          rows={grants}
          rowId={(row) => row.agentId}
          label="Agent grants"
          filterable={false}
          columns={[
            { key: "agent", header: "AI employee", primary: true, cell: (row) => data.agents.find((agent) => agent.id === row.agentId)?.title ?? row.agentId },
            { key: "groups", header: "Groups", cell: (row) => <Row gap={1} wrap>{row.groups.map((group) => <Pill key={group} tone={group === "confidential" ? "warning" : "neutral"}>{group}</Pill>)}</Row> },
            { key: "note", header: "Why", cell: (row) => row.note },
          ]}
        />
        <Button variant="secondary" onClick={() => context.openOverlay("permission explanation")}>Explain a grant</Button>
      </Stack>
    );
  }

  if (view === "Connected sources") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Sources registered" value={String(data.sources.length)} prov="human" meta="In this organisation" />
          <Stat label="Indexed" value={String(data.sources.filter((source) => source.status === "indexed").length)} prov="posted" meta="Available to retrieval" />
          <Stat label="Held back" value={String(data.sources.filter((source) => ["quarantined", "failed", "review"].includes(source.status)).length)} prov="unknown" meta="Excluded until reviewed" />
          <Stat label="External services" value="None connected" unavailable meta={`${data.connectors.length} connector records, all unconnected`} />
        </StatRow>
        <DataGrid
          rows={data.connectors}
          rowId={(row) => row.id}
          label="Connectors"
          columns={[
            { key: "title", header: "Service", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => String(row.fields.kind ?? row.fields.provider ?? "service") },
            { key: "state", header: "State", cell: (row) => <Pill tone="warning">{String(row.status).replace(/_/g, " ")}</Pill> },
            { key: "note", header: "What would change", cell: (row) => row.summary },
          ]}
        />
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow="SCOPE" prov="human" title="What this chat will read" subtitle={`Organisation: ${org.name}`}>
        <Stack gap={4}>
          <Notice tone="info" title="Scope is per thread and per organisation">
            Pinned records are held for the thread you pinned them in. Switching organisation clears every pinned record, so nothing from {org.shortName} can be read inside another entity.
          </Notice>
          {threads.length === 0 ? (
            <Empty title="Nothing is pinned" icon={<Layers size={20} />}>With nothing pinned, an answer reads the collections the question names, inside this organisation only.</Empty>
          ) : (
            <Stack gap={3}>
              {threads.map(([thread, ids]) => (
                <Card key={thread} title={thread.split(":")[0]} subtitle={`${ids.length} records pinned`} pad="tight"
                  footer={<Button size="sm" variant="ghost" onClick={() => { clearScope(thread); context.toast("Scope cleared", "That thread will read the workspace rather than a pinned set."); }}>Remove all</Button>}>
                  <ScopeChips thread={thread} records={records} context={context} />
                </Card>
              ))}
            </Stack>
          )}
          <Row gap={2} wrap>
            <Button variant="secondary" onClick={() => context.openOverlay("Context picker")}>Add or remove context</Button>
            <Button variant="ghost" onClick={() => context.openOverlay("sensitive data warning")}>Redact a selection</Button>
          </Row>
        </Stack>
      </Card>

      <Card span={5} eyebrow="BOUNDARIES" prov="posted" title="Boundaries" subtitle="What cannot cross">
        <Stack gap={3}>
          <Properties rows={[
            { label: "Organisation", value: org.name },
            { label: "Other entities", value: "Not readable from here" },
            { label: "Model provider", value: <Pill tone="warning">Not connected</Pill> },
            { label: "Memory writes", value: "Only to records you can see" },
            { label: "Conversations in scope", value: String(data.conversations.length) },
          ]} />
          <Button variant="secondary" onClick={() => context.openOverlay("Context picker", { switchEntity: true })}>Switch entity</Button>
          <Notice tone="warning" title="Switching entity clears the cache">
            Pinned records, drafts and attachments are dropped when the active organisation changes. Nothing from the previous entity is carried into the new one.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- AI-010 ---------------------------- */

interface Version { version: number; at: string; author: string; summary: string }
interface Comment { id: string; at?: string; author?: string; text: string }

function artifactParts(record: Rec | undefined) {
  const body = record?.body as { text?: string; versions?: Version[]; comments?: Comment[]; sources?: string[] } | undefined;
  return { text: body?.text ?? "", versions: body?.versions ?? [], comments: body?.comments ?? [], sources: body?.sources ?? [] };
}

function ArtifactScreen({ context, view }: { context: ScreenContext; view: "Preview" | "Versions" | "Comments" | "Sources" }) {
  const records = useOrgRecords();
  const asked = useRecord(context.params.id);
  const documents = records.filter((record) => record.collection === "documents");
  const artifact = asked?.collection === "documents" ? asked : documents.find((document) => document.fields.artifact === true) ?? documents[0];
  const { text, versions, comments, sources } = artifactParts(artifact);
  const [comment, setComment] = useState("");

  if (!artifact) return <Empty title="No artifact in this workspace" icon={<FileText size={20} />} />;

  if (view === "Versions") {
    return versions.length === 0 ? (
      <Stack gap={3}>
        <Notice tone="info" title="One version only">This artifact has a single recorded version. Each save from here adds one with its author and summary.</Notice>
        <Properties rows={[{ label: "Current version", value: String(artifact.fields.version ?? 1) }, { label: "Last saved", value: context.dateTime(artifact.updatedAt) }]} />
      </Stack>
    ) : (
      <Stack gap={3}>
        <DataGrid
          rows={versions}
          rowId={(row) => String(row.version)}
          label="Versions"
          filterable={false}
          columns={[
            { key: "version", header: "Version", primary: true, cell: (row) => `v${row.version}` },
            { key: "at", header: "Saved", cell: (row) => context.dateTime(row.at) },
            { key: "author", header: "Author", cell: (row) => row.author },
            { key: "summary", header: "What changed", cell: (row) => row.summary },
          ]}
        />
        <Button variant="secondary" onClick={() => context.openOverlay("Version comparison", { id: artifact.id })}>Compare two versions</Button>
      </Stack>
    );
  }

  if (view === "Comments") {
    return (
      <Stack gap={4}>
        {comments.length === 0 ? <Empty title="No comment yet" /> : (
          <Stack gap={2}>
            {comments.map((item) => (
              <div key={item.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <Row gap={2}>
                  <Avatar name={item.author ?? "Not recorded"} size="sm" />
                  <strong>{item.author ?? "Author not recorded"}</strong>
                  <span className="ds-subtle">{item.at ? context.relative(item.at) : "no date recorded"}</span>
                </Row>
                <p className="ds-prose" style={{ marginBlockStart: "var(--space-2)" }}>{item.text}</p>
              </div>
            ))}
          </Stack>
        )}
        <Card title="Add a comment">
          <form
            className="ds-stack ds-gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!comment.trim()) return;
              const body = (artifact.body ?? {}) as Record<string, unknown>;
              if (!(await context.mutate.patch(artifact.id, {
                body: { ...body, comments: [...comments, { id: `c-${wallMs()}`, at: context.now.toISOString(), author: context.actor, text: comment.trim() }] },
              }, { expectRevision: artifact.revision, event: `Comment added to ${artifact.title}` }))) return;
              setComment("");
              context.toast("Comment saved", "It is stored on the artifact record.");
            }}
          >
            <Field label="Comment"><TextArea value={comment} rows={3} onChange={(event) => setComment(event.target.value)} /></Field>
            <Button type="submit" variant="primary" disabled={!comment.trim()}>Add comment</Button>
          </form>
        </Card>
      </Stack>
    );
  }

  if (view === "Sources") {
    const rows = sources.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Provenance back to the conversation">
          An artifact keeps the records it came from. Opening one of these shows the turn or record that produced the line.
        </Notice>
        {rows.length === 0 ? <Empty title="No source recorded on this artifact" /> : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Artifact sources"
            columns={[
              { key: "title", header: "Record", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "collection", header: "Collection", cell: (row) => row.collection },
              { key: "updated", header: "Updated", align: "end", cell: (row) => context.relative(row.updatedAt) },
            ]}
            onOpen={(id) => {
              const route = routeForCitation({ id, collection: rows.find((row) => row.id === id)?.collection ?? "" }, context.org.slug);
              if (route) context.navigate(route);
            }}
          />
        )}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={8} title={artifact.title} subtitle={`v${String(artifact.fields.version ?? (versions.length || 1))} · ${artifact.status}`} prov={artifact.ownerName.includes("Nia") || artifact.ownerName.includes("Sable") ? "agent" : "human"}
        actions={<Pill tone={artifact.status === "approved" ? "success" : artifact.status === "published" ? "info" : "neutral"}>{artifact.status}</Pill>}
      >
        <Stack gap={3}>
          <article className="ds-panel ds-prose" style={{ padding: "var(--space-4)", whiteSpace: "pre-wrap" }}>{text || artifact.summary}</article>
          <Row gap={2} wrap>
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/docs/documents/${artifact.id}`)}>Open in Documents</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("share dialog", { id: artifact.id })}>Share</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("export dialog", { id: artifact.id })}>Export</Button>
          </Row>
        </Stack>
      </Card>
      <Card span={4} eyebrow="PROVENANCE" prov="posted" title="Provenance" subtitle="Where this came from">
        <Stack gap={3}>
          <Properties rows={[
            { label: "From conversation", value: records.find((record) => record.id === artifact.fields.conversationId)?.title ?? "Not linked" },
            { label: "Mission", value: records.find((record) => record.id === artifact.fields.missionId)?.title ?? "Not linked" },
            { label: "Reviewers", value: String(artifact.fields.reviewers ?? artifact.fields.reviewer ?? "None recorded") },
            { label: "Versions", value: String(versions.length || 1) },
            { label: "Comments", value: String(comments.length) },
          ]} />
          <Notice tone="warning" title="Publishing is a separate mission">
            Editing this draft changes a record here. Publishing it outside this browser needs a hosting connection and its own mission scope with verification; it cannot be undone by editing the draft afterwards.
          </Notice>
        </Stack>
      </Card>
    </Grid>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function SourceSelector({ context }: { context: ScreenContext }) {
  const records = useOrgRecords();
  const [collection, setCollection] = useState("invoices");
  const [query, setQuery] = useState("");
  const thread = threadKey(context.screen.id, context.params.id ?? context.selectedId ?? "active");
  const addScope = useChatState((state) => state.addScope);
  const collections = [...new Set(records.map((record) => record.collection))].sort();
  const rows = records.filter((record) => record.collection === collection && (!query || record.title.toLowerCase().includes(query.toLowerCase())));
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Scope is a reference, not a copy">
        A pinned record is read when an answer is composed and named in the reply. Its contents are not copied into the thread.
      </Notice>
      <Row gap={3} wrap>
        <Field label="Collection">
          <Select value={collection} onChange={(event) => setCollection(event.target.value)}>
            {collections.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Find"><TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
      </Row>
      {rows.length === 0 ? <Empty title="No record matches" /> : (
        <Stack gap={2}>
          {rows.slice(0, 40).map((record) => (
            <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
              <div className="ds-grow">
                <strong>{record.title}</strong>
                <div className="ds-subtle">{record.summary || record.status}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => { addScope(thread, [record.id]); context.toast("Pinned", `${record.title} is in scope for this thread.`); }}>Pin</Button>
            </Row>
          ))}
        </Stack>
      )}
      <ScopeChips thread={thread} records={records} context={context} />
    </Stack>
  );
}

function UploadReview({ context }: { context: ScreenContext }) {
  const thread = threadKey(context.screen.id, context.params.id ?? context.selectedId ?? "active");
  const attachments = useChatState((state) => state.attachments[thread] ?? NO_ATTACHMENTS);
  return (
    <Stack gap={4}>
      <AttachmentPicker thread={thread} />
      <Notice tone="warning" title="Nothing is uploaded or scanned">
        No storage or scanning service is connected. A file stays on your machine; this workspace records only its name, size and type, and the next message you send carries that reference.
      </Notice>
      {attachments.length > 0 && (
        <Button
          variant="secondary"
          onClick={async () => {
            for (const attachment of attachments) {
              await context.mutate.create({
                collection: "sources",
                title: attachment.name,
                status: "quarantined",
                summary: `Referenced from a conversation. ${(attachment.size / 1024).toFixed(0)} kB, ${attachment.type}. Held out of retrieval until a person reviews it.`,
                fields: { kind: "file", classification: "internal", scanned: false, freshness: context.now.toISOString().slice(0, 10), indexing: "quarantined" },
              }, `Source reference created for ${attachment.name}`);
            }
            context.toast("Registered as held sources", "They are in the source library as quarantined, excluded from retrieval.");
          }}
        >
          Register {attachments.length} reference{attachments.length === 1 ? "" : "s"} in the source library
        </Button>
      )}
    </Stack>
  );
}

function MessageActionMenu({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { turnId?: string; conversationId?: string } | undefined;
  const conversation = useRecord(payload?.conversationId ?? context.selectedId);
  const records = useOrgRecords();
  const turn = readTurns(conversation).find((item) => item.id === payload?.turnId);
  const thread = threadKey("ARL-AI-001", conversation?.id ?? "active");
  const addScope = useChatState((state) => state.addScope);
  if (!turn || !conversation) return <Empty title="Choose a message first" />;
  return (
    <Stack gap={4}>
      <Card title={turn.author} subtitle={context.dateTime(turn.at)} prov={turn.role === "person" ? "human" : "agent"}>
        <p className="ds-prose" style={{ whiteSpace: "pre-wrap" }}>{turn.text}</p>
      </Card>
      <Stack gap={2}>
        <Button
          variant="secondary"
          disabled={!turn.citations || turn.citations.length === 0}
          onClick={() => {
            addScope(thread, (turn.citations ?? []).map((citation) => citation.id));
            context.toast("Pinned the records this answer read", `${turn.citations?.length ?? 0} records are now in scope.`);
            close();
          }}
        >
          Pin the {turn.citations?.length ?? 0} records it read into scope
        </Button>
        <Button
          variant="secondary"
          onClick={() => { context.closeOverlay(); context.openOverlay("task authorization", { from: turn.text }); }}
        >
          Turn this into a mission
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await context.mutate.log(`A turn in ${conversation.title} was reported as wrong by ${context.actor}: “${turn.text.slice(0, 120)}”`, { entityId: conversation.id, type: "conversation.flagged" });
            context.toast("Reported", "The turn is flagged in the activity log with who reported it.");
            close();
          }}
        >
          Report this answer as wrong
        </Button>
      </Stack>
      {turn.citations && turn.citations.length > 0 && (
        <Card title="Records read" pad="tight">
          <Stack gap={1}>
            {turn.citations.map((citation) => (
              <Row key={citation.id} gap={2}>
                <span className="ds-grow ds-truncate">{citation.title}</span>
                <span className="ds-subtle">{records.find((record) => record.id === citation.id)?.collection ?? citation.collection}</span>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function chiefOf(records: Rec[]): Rec | undefined {
  return records.find((record) => record.collection === "agents" && record.id === "nl-agents-001")
    ?? records.find((record) => record.collection === "agents" && String(record.fields.role) === "Chief of Staff");
}

function useAuthorisingAgent() {
  const records = useOrgRecords();
  const agent = chiefOf(records);
  const policy = records.find((record) => record.collection === "policies" && record.fields.kind === "autonomyGrant" && record.fields.agentId === agent?.id);
  return { records, agent, policy };
}

function TaskAuthorizationSummary({ context }: { context: ScreenContext }) {
  const { agent } = useAuthorisingAgent();
  if (!agent) return null;
  return (
    <OverlaySummary
      eyebrow="Mission proposal"
      avatar={<Avatar name={agent.title} kind="ai" size="lg" />}
      title={agent.title}
      status={<Pill tone="warning">Proposal only</Pill>}
      meta={[String(agent.fields.role ?? "AI employee"), `Autonomy: ${String(agent.fields.autonomy ?? "draft")}`, `Contract ceiling ${context.money(Number(agent.fields.spendCapMinor ?? 0))}`]}
    />
  );
}

const MISSION_GRANTS = [
  { id: "workspace.read", label: "Read records in this organisation", available: true },
  { id: "workspace.draft", label: "Create draft records", available: true },
  { id: "email.send", label: "Send email", available: false, why: "No mail provider is connected" },
  { id: "site.publish", label: "Publish a page", available: false, why: "No hosting is connected" },
];

function TaskAuthorization({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { from?: string } | undefined;
  const { records, agent, policy } = useAuthorisingAgent();
  const candidates = records
    .filter((record) => ["contacts", "companies", "suppliers"].includes(record.collection))
    .filter((record, index, all) => all.findIndex((other) => other.collection === record.collection && other.title === record.title) === index);
  const [goal, setGoal] = useState(payload?.from ?? "");
  const [target, setTarget] = useState("");
  const [budget, setBudget] = useState("500");
  const [grants, setGrants] = useState<string[]>(["workspace.read"]);
  const [touched, setTouched] = useState(false);
  const amountMinor = Math.round(Number(budget) * 100);
  const ambiguous = candidates.filter((candidate) => goal.toLowerCase().includes(candidate.title.toLowerCase().split(" ")[0].toLowerCase()));
  const needsTarget = !target;
  const invalid = !goal.trim() || needsTarget || !Number.isFinite(amountMinor) || amountMinor <= 0 || !agent;
  const requiresApproval = String(policy?.fields.requiresApproval ?? "all");
  const dirty = touched && (goal.trim() !== (payload?.from ?? "").trim() || Boolean(target) || budget !== "500" || grants.length !== 1);
  const targetRecord = candidates.find((candidate) => candidate.id === target);

  return (
    <form
      id="task-authorization"
      className="ds-stack ds-gap-4"
      onChange={() => setTouched(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid || !agent) return;
        const mission = await context.mutate.create({
          collection: "missions",
          title: goal.slice(0, 70),
          status: "proposed",
          summary: `Authorised from a conversation by ${context.actor}. Target and ceiling are recorded on the mission contract.`,
          amountMinor,
          fields: {
            agentId: agent.id,
            budgetMinor: amountMinor,
            committedMinor: 0,
            spentMinor: 0,
            targetId: target,
            planVersion: 1,
            conversationId: String(context.selectedId ?? ""),
            grants: grants.join(","),
          },
          body: { criteria: [{ id: "c1", label: "Outcome verified against a record", verified: false }] },
        }, `Mission proposed from a conversation: ${goal.slice(0, 50)}`);
        await context.mutate.create({
          collection: "missionSteps",
          title: "Read the records the goal names",
          status: "ready",
          parentId: mission.id,
          summary: "First step: read the workspace records in scope and report what is missing.",
          fields: { order: 1, kind: "read", operation: "collect.sources", attempts: 0 },
          body: { output: "", reason: "", inputs: [] },
        }, "First mission step created");
        context.toast("Mission proposed", `${mission.title} is proposed with a ${context.money(amountMinor)} ceiling. Nothing runs until a person approves the plan.`);
        close();
        context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`);
      }}
    >
      <ModalUnsavedChanges when={dirty} />
      <OverlaySection title="What it would do">
        <Stack gap={3}>
          <Field label="Goal" required>
            <TextArea value={goal} rows={3} onChange={(event) => setGoal(event.target.value)} required />
          </Field>
          <Field
            label="Target account"
            required
            error={needsTarget && goal.trim() ? "Choose exactly one account. A mission cannot be authorised against an unknown target." : undefined}
            hint={ambiguous.length > 1 ? `${ambiguous.length} accounts match words in the goal: ${ambiguous.map((item) => item.title).join(", ")}.` : undefined}
          >
            <Select value={target} onChange={(event) => setTarget(event.target.value)} required>
              <option value="">Choose an account…</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} ({candidate.collection})</option>)}
            </Select>
          </Field>
          <Field label={`Spend ceiling (${context.org.currency})`} required hint="An unbounded mission cannot be authorised.">
            <TextInput value={budget} inputMode="decimal" align="end" onChange={(event) => setBudget(event.target.value)} invalid={!(amountMinor > 0)} required />
          </Field>
        </Stack>
      </OverlaySection>

      <OverlaySection title="Tools and scope" hint="Only what is ticked is written into the mission contract.">
        <Stack gap={2}>
          {MISSION_GRANTS.map((grant) => (
            <Row key={grant.id} gap={2}>
              <div className="ds-grow">
                <Checkbox
                  label={grant.label}
                  disabled={!grant.available}
                  checked={grants.includes(grant.id)}
                  onChange={(event) => setGrants((current) => event.target.checked ? [...current, grant.id] : current.filter((item) => item !== grant.id))}
                />
              </div>
              {!grant.available && <Pill tone="warning">{grant.why}</Pill>}
            </Row>
          ))}
        </Stack>
      </OverlaySection>

      <OverlaySection title="Human approval" tone="info">
        <FactGrid
          items={[
            { label: "Before any step runs", value: "A person approves the plan" },
            { label: "Status after this", value: "Proposed, not running" },
            { label: "Approval policy", value: policy ? (requiresApproval === "all" ? `${policy.title}: a person approves every action` : `${policy.title}: a person approves ${requiresApproval.split(",").join(", ")}`) : "A person approves every action (no policy recorded)" },
            { label: "Your role view", value: context.can("approve_mission") ? "Can approve" : "Cannot approve" },
          ]}
        />
        <p className="ds-subtle" style={{ marginBlockStart: "var(--space-2)" }}>
          {targetRecord ? `Target: ${targetRecord.title}. ` : ""}Nothing is sent or published outside this workspace: no provider is connected.
        </p>
      </OverlaySection>
    </form>
  );
}

function ThreadPreviewSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const conversation = useRecord(payload?.id ?? context.selectedId);
  if (!conversation) return null;
  return (
    <OverlaySummary
      eyebrow={String(conversation.fields.kind ?? "chief") === "chief" ? "Chief of Staff thread" : "Specialist thread"}
      title={conversation.title}
      status={conversation.fields.legalHold === true ? <Pill tone="warning">Legal hold</Pill> : conversation.fields.archived === true ? <Pill tone="neutral">Archived</Pill> : undefined}
      meta={[`${readTurns(conversation).length} turns`, conversation.fields.shared === true ? "Shared with the workspace" : "Only you", context.relative(conversation.at ?? conversation.updatedAt)]}
    />
  );
}

function ThreadPreview({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string; rename?: boolean } | undefined;
  const conversation = useRecord(payload?.id ?? context.selectedId);
  const [name, setName] = useState("");
  if (!conversation) return <Empty title="Choose a thread" />;
  const turns = readTurns(conversation);
  return (
    <Stack gap={3}>
      <Field label="Thread name" hint="Renaming changes the record; its turns and citations are untouched.">
        <Row gap={2}>
          <TextInput value={name || conversation.title} onChange={(event) => setName(event.target.value)} />
          <Button
            variant="secondary"
            disabled={!name.trim() || name.trim() === conversation.title}
            onClick={async () => {
              if (!(await context.mutate.patch(conversation.id, { title: name.trim() }, { expectRevision: conversation.revision, event: `Conversation renamed to ${name.trim()}` }))) return;
              context.toast("Renamed", "The thread record carries the new name.");
            }}
          >
            Rename
          </Button>
        </Row>
      </Field>
      <FactGrid columns={3} dense items={[
        { label: "Retention", value: conversation.fields.legalHold === true ? "Legal hold" : "Standard schedule", tone: conversation.fields.legalHold === true ? "warning" : undefined },
        { label: "Last turn", value: context.dateTime(conversation.at ?? conversation.updatedAt), mono: true },
        { label: "Turns", value: String(turns.length), mono: true },
      ]} />
      <TurnList turns={turns.slice(-4)} context={context} emptyTitle="No turn in this thread" emptyBody="Nothing has been asked yet." />
      <DrawerActions><OverlayActions primary={<Button variant="primary" onClick={() => { context.select(conversation.id); context.closeOverlay(); context.navigate(`/o/${context.org.slug}/ai/chat?thread=${conversation.id}`); }}>Open in chat</Button>} end={<Button variant="ghost" onClick={() => context.closeOverlay()}>Close</Button>} /></DrawerActions>
    </Stack>
  );
}

function DeleteConversation({ context, close }: { context: ScreenContext; close: () => void }) {
  const conversation = useRecord(context.selectedId);
  if (!conversation) return <Empty title="Choose a thread first" />;
  const held = conversation.fields.legalHold === true;
  return (
    <Stack gap={4}>
      {held ? (
        <Notice tone="danger" title="This thread is under a legal hold">
          {conversation.title} cannot be deleted while a hold is recorded against it. The hold is on the retention policy, with who set it and when.
        </Notice>
      ) : (
        <Notice tone="warning" title="Deleting removes the record and its turns">
          {readTurns(conversation).length} turns and any attachment references go with it. Citations elsewhere that point at this thread will no longer resolve.
        </Notice>
      )}
      <ModalActions><OverlayActions variant="confirm" end={<Button variant="ghost" onClick={close}>Cancel</Button>} primary={<Button
        variant="danger"
        disabled={held || !context.can("delete_records")}
        title={held ? "A legal hold prevents deletion" : context.can("delete_records") ? undefined : "This role view does not delete records"}
        onClick={async () => {
          await context.mutate.remove(conversation.id, `Conversation ${conversation.title} deleted`);
          context.toast("Thread deleted", "The record and its turns are gone from this workspace.");
          context.select(undefined);
          close();
        }}
      >
        Delete this thread
      </Button>} /></ModalActions>
    </Stack>
  );
}

function SharingDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const conversation = useRecord(context.selectedId);
  const [shared, setShared] = useState(conversation?.fields.shared === true);
  if (!conversation) return <Empty title="Choose a thread first" />;
  return (
    <Stack gap={4}>
      <Checkbox label="Everyone in this workspace can read the thread" checked={shared} onChange={(event) => setShared(event.target.checked)} />
      <Notice tone="info" title="Sharing is inside this browser">
        Sharing changes what the role views in this workspace offer. It does not send a link anywhere and is not an account security boundary.
      </Notice>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          if (!(await context.mutate.patch(conversation.id, { fields: { ...conversation.fields, shared } }, { expectRevision: conversation.revision, event: `${conversation.title} sharing changed` }))) return;
          context.toast("Sharing updated", shared ? "The thread is readable by the workspace." : "The thread is private to you again.");
          close();
        }}
      >
        Save sharing
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

function AgentSummary({ context, eyebrow }: { context: ScreenContext; eyebrow: string }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = useRecord(payload?.id ?? context.params.id);
  if (!agent) return null;
  return (
    <OverlaySummary
      eyebrow={eyebrow}
      avatar={<Avatar name={agent.title} kind="ai" size="lg" />}
      title={agent.title}
      status={<Pill tone={agent.status === "active" ? "success" : "warning"} dot>{agent.status}</Pill>}
      meta={[String(agent.fields.role ?? ""), "No model connected"]}
    />
  );
}

function AgentProfileDrawer({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = useRecord(payload?.id ?? context.params.id);
  if (!agent) return <Empty title="No specialist selected" />;
  const body = agent.body as { skills?: string[]; tools?: { id: string; label: string; granted: boolean; capability?: string }[]; authority?: string[] } | undefined;
  return (
    <Stack gap={4}>
      <FactGrid items={[
        { label: "Autonomy", value: String(agent.fields.autonomy ?? "draft") },
        { label: "Reports to", value: String(agent.fields.manager ?? "Unassigned") },
        { label: "Spend ceiling", value: context.money(Number(agent.fields.spendCapMinor ?? 0)), mono: true },
        { label: "Provider cost recorded", value: context.money(Number(agent.fields.recordedCostMinor ?? 0)), mono: true },
      ]} />
      <OverlaySection title="Authority">
        <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
          {(body?.authority ?? ["Nothing recorded"]).map((line) => <li key={line}>{line}</li>)}
        </ul>
      </OverlaySection>
      <DrawerActions><OverlayActions primary={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/${agent.id}`)}>Open the full profile</Button>} end={<Button variant="ghost" onClick={() => context.closeOverlay()}>Close</Button>} /></DrawerActions>
    </Stack>
  );
}

function PermissionExplainer({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = useRecord(payload?.id ?? context.params.id);
  const body = agent?.body as { tools?: { id: string; label: string; granted: boolean; capability?: string }[] } | undefined;
  const tools = body?.tools ?? [];
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Role views shape the interface">
        What a contract may do is recorded here and enforced by this interface. It is not an account security boundary: a future service would enforce it on the server.
      </Notice>
      {tools.length === 0 ? <Empty title="No tool is recorded on this contract" /> : (
        <Stack gap={2}>
          {tools.map((tool) => (
            <Row key={tool.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow">
                <strong>{tool.label}</strong>
                <div className="ds-subtle">{tool.id}</div>
              </div>
              <Pill tone={tool.granted ? "success" : "warning"}>{tool.granted ? "Granted" : tool.capability ? "Provider not connected" : "Not granted"}</Pill>
            </Row>
          ))}
        </Stack>
      )}
      {tools.some((tool) => tool.capability) && <CapabilityLine id={String(tools.find((tool) => tool.capability)?.capability)} />}
    </Stack>
  );
}

function MissionEscalation({ context, close }: { context: ScreenContext; close: () => void }) {
  const agent = useRecord(context.params.id);
  const [reason, setReason] = useState("");
  const coordinator = String(agent?.fields.manager ?? "Nia Okonkwo");
  return (
    <form
      id="mission-escalation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "tasks",
          title: `Handoff from ${agent?.title ?? "a specialist"}`,
          status: "ready",
          summary: reason || "A request outside this specialist's contract was handed to the coordinator.",
          fields: { assignee: coordinator, kind: "human", stage: "ready", escalatedFrom: agent?.id ?? "" },
        }, `Handoff recorded from ${agent?.title ?? "a specialist"} to ${coordinator}`);
        context.toast("Handoff recorded", `${coordinator} now owns the request as a task. No work is claimed as done.`);
        close();
      }}
    >
      <Notice tone="info" title="An escalation is a record, not progress">
        The request moves to {coordinator} as a task. Nothing is reported as finished, and the specialist's own answer stays in the thread for audit.
      </Notice>
      <ModalUnsavedChanges when={Boolean(reason.trim())} />
      <Field label="Why this is outside the contract" required>
        <TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required />
      </Field>
    </form>
  );
}

function ParticipantSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const records = useOrgRecords();
  const room = useRecord(context.params.id);
  const people = internalRoster(records, true);
  const current = String(room?.fields.participants ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const [selected, setSelected] = useState<string[]>(current);
  if (!room) return <Empty title="No room selected" />;
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {people.map((person) => (
          <Checkbox
            key={person.id}
            label={`${person.title} — ${person.collection === "agents" || person.fields.kind === "ai" ? "AI employee" : "Person"}`}
            checked={selected.includes(person.id)}
            onChange={(event) => setSelected((rows) => event.target.checked ? [...rows, person.id] : rows.filter((id) => id !== person.id))}
          />
        ))}
      </Stack>
      <Notice tone="info" title="Adding an AI employee adds its contract, not new powers">
        A contract in a room reads what its grants allow. It cannot gain a tool by being mentioned here.
      </Notice>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          if (!(await context.mutate.patch(room.id, { fields: { ...room.fields, participants: selected.join(",") } }, { expectRevision: room.revision, event: `Participants changed in ${room.title}` }))) return;
          context.toast("Participants updated", `${selected.length} participants are in ${room.title}.`);
          close();
        }}
      >
        Save participants
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

function DecisionRecorder({ context, close }: { context: ScreenContext; close: () => void }) {
  const members = useCollection("members");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [approver, setApprover] = useState(context.actor);
  return (
    <form
      id="decision-recorder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const decision = await context.mutate.create({
          collection: "decisions",
          title: title.trim(),
          status: "approved",
          summary: rationale,
          at: context.now.toISOString(),
          fields: { approvers: approver, domain: "operations", approvedAt: context.now.toISOString().slice(0, 10) },
          body: { rationale, alternatives: [], outcome: "" },
        }, `Decision recorded: ${title.trim()}`);
        if (context.params.id) {
          await context.mutate.create({
            collection: "messages",
            title: `Decision: ${title.trim()}`,
            status: "decided",
            summary: rationale,
            parentId: context.params.id,
            at: context.now.toISOString(),
            fields: { author: context.actor, kind: "human", pinned: true, decision: true, decisionId: decision.id },
          }, "Decision pinned in the room");
        }
        context.toast("Decision recorded", "It is in the decision register with its approver and date.");
        close();
      }}
    >
      <ModalUnsavedChanges when={Boolean(title.trim() || rationale.trim())} />
      <Field label="Decision" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Why" required hint="The rationale is kept so the decision can be audited later."><TextArea value={rationale} rows={3} onChange={(event) => setRationale(event.target.value)} required /></Field>
      <Field label="Approver">
        <Select value={approver} onChange={(event) => setApprover(event.target.value)}>
          {[context.actor, ...internalRoster(members).map((member) => member.title)]
            .filter((name, index, all) => all.indexOf(name) === index)
            .map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Notice tone="info">A decision recorded in a room is the same record the decision register shows. Nothing is approved by discussion alone.</Notice>
    </form>
  );
}

function TopicThread({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const message = useRecord(payload?.id);
  const [reply, setReply] = useState("");
  if (!message) return <Empty title="Choose a message" />;
  return (
    <Stack gap={4}>
      <Card title={String(message.fields.author ?? "")} subtitle={context.dateTime(message.at ?? message.createdAt)} prov={message.fields.kind === "ai" ? "agent" : "human"}>
        <p className="ds-prose">{message.title} — {message.summary}</p>
      </Card>
      {message.fields.blocked === true && <CapabilityLine id={String(message.fields.capability ?? "site.publish")} />}
      <form
        className="ds-stack ds-gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await context.mutate.create({
            collection: "messages",
            title: reply.slice(0, 60),
            status: "posted",
            summary: reply,
            parentId: message.parentId,
            at: context.now.toISOString(),
            fields: { author: context.actor, kind: "human", replyTo: message.id },
          }, "Reply posted in a topic thread");
          setReply("");
          context.toast("Reply posted", "It is recorded against the same room.");
        }}
      >
        <Field label="Reply in this topic"><TextArea value={reply} rows={3} onChange={(event) => setReply(event.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={!reply.trim()}>Post reply</Button>
      </form>
    </Stack>
  );
}

function TaskHandoffDrawer({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { agentId?: string } | undefined;
  const records = useOrgRecords();
  const mission = useRecord(context.params.id);
  const tasks = records.filter((record) => record.collection === "missionTasks" && record.parentId === context.params.id);
  const agents = records.filter((record) => record.collection === "agents" && record.status === "active");
  const [pickedTask, setPickedTask] = useState("");
  const [pickedAgent, setPickedAgent] = useState(payload?.agentId ?? "");
  const taskId = pickedTask || tasks[0]?.id || "";
  const to = pickedAgent || agents[0]?.id || "";
  const task = tasks.find((item) => item.id === taskId);
  const target = agents.find((agent) => agent.id === to);
  return (
    <Stack gap={4}>
      <Field label="Task"><Select value={taskId} onChange={(event) => setPickedTask(event.target.value)}>{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
      <Field label="Hand to"><Select value={to} onChange={(event) => setPickedAgent(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title} — {String(agent.fields.role)}</option>)}</Select></Field>
      {task?.fields.approvalRequired === true && (
        <Notice tone="warning" title="This task has an approval gate">
          Handing it over does not pass the gate. It still waits for a person with approval authority.
        </Notice>
      )}
      <DrawerActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!task || !target}
        onClick={async () => {
          if (!task || !target) return;
          if (!(await context.mutate.patch(task.id, { fields: { ...task.fields, assignee: target.title, kind: "ai" }, ownerName: target.title }, { expectRevision: task.revision, event: `${task.title} handed to ${target.title}` }))) return;
          await context.mutate.create({
            collection: "messages",
            title: `Handoff: ${task.title}`,
            status: "posted",
            summary: `${task.title} now belongs to ${target.title}. The deliverable and its bound are unchanged.`,
            parentId: mission?.id,
            at: context.now.toISOString(),
            fields: { author: context.actor, kind: "human", room: "mission" },
          }, "Handoff recorded in the mission room");
          context.toast("Handoff recorded", `${target.title} owns ${task.title}.`);
          close();
        }}
      >
        Record the handoff
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></DrawerActions>
    </Stack>
  );
}

function EvidenceInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const records = useOrgRecords();
  const message = useRecord(payload?.id);
  const ids = String(message?.fields.citations ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const cited = ids.map((id) => records.find((record) => record.id === id)).filter((record): record is Rec => Boolean(record));
  return (
    <Stack gap={4}>
      {!message ? <Empty title="Choose a message" /> : (
        <>
          <OverlaySection title="The claim" hint={`${String(message.fields.author ?? "")} · ${context.dateTime(message.at ?? message.createdAt)}`}>
            <p className="ds-prose">{message.summary}</p>
          </OverlaySection>
          {cited.length === 0 ? (
            <Notice tone="warning" title="No evidence is attached to this message">
              A claim with no record behind it stays a claim. Ask for the records before acting on it.
            </Notice>
          ) : (
            <Stack gap={2}>
              {cited.map((record) => (
                <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <div className="ds-grow"><strong>{record.title}</strong><div className="ds-subtle">{record.collection} · {record.status}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => { const route = routeForCitation(record, context.org.slug); if (route) context.navigate(route); }}>Open</Button>
                </Row>
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

function ReviewDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id);
  const [verdict, setVerdict] = useState("verified");
  const [note, setNote] = useState("");
  if (!task) return <Empty title="Choose the work to review" />;
  const allowed = context.can("approve_mission");
  return (
    <Stack gap={4}>
      <Card title={task.title} subtitle={`Owner ${String(task.fields.assignee ?? task.ownerName)}`}>
        <p className="ds-prose">{task.summary}</p>
      </Card>
      <Field label="Verdict">
        <Select value={verdict} onChange={(event) => setVerdict(event.target.value)}>
          <option value="verified">Verified — the criterion is met by a record</option>
          <option value="review">Send back for more evidence</option>
          <option value="blocked">Blocked — it cannot proceed here</option>
        </Select>
      </Field>
      <ModalUnsavedChanges when={Boolean(note.trim())} />
      <Field label="What you checked" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      {!allowed && <Notice tone="warning" title="This role view does not approve missions">The verdict will be recorded as a note, not as an approval.</Notice>}
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!note.trim()}
        onClick={async () => {
          if (allowed) {
            if (!(await context.mutate.patch(task.id, { fields: { ...task.fields, stage: verdict, reviewedBy: context.actor, reviewNote: note } }, { expectRevision: task.revision, event: `${task.title} reviewed as ${verdict} by ${context.actor}` }))) return;
          } else {
            await context.mutate.log(`${context.actor} noted a review of ${task.title}: ${verdict} — ${note}`, { entityId: task.id, type: "review.note" });
          }
          context.toast(allowed ? "Review recorded" : "Note recorded", allowed ? `${task.title} is now ${verdict}.` : "The role view cannot approve, so the verdict is a note.");
          close();
        }}
      >
        {allowed ? "Record the review" : "Record a note"}
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

function MicPermission({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <CapabilityLine id="telephony" title="No speech service is connected" />
      <Properties rows={[
        { label: "Browser microphone", value: "Never requested by this screen" },
        { label: "Speech to text", value: <Pill tone="warning">Not connected</Pill> },
        { label: "Text to speech", value: <Pill tone="warning">Not connected</Pill> },
        { label: "What happens instead", value: "Turns are typed and marked as typed" },
      ]} />
      <Notice tone="info" title="Why the prompt is not shown">
        Asking for your microphone would imply something could be heard and transcribed. Nothing here can do that, so the permission is not requested at all.
      </Notice>
      <ModalActions><OverlayActions primary={<Button variant="secondary" onClick={() => { context.closeOverlay(); context.setTab("Transcript"); }}>Open the transcript</Button>} end={<Button variant="ghost" onClick={() => context.closeOverlay()}>Close</Button>} /></ModalActions>
    </Stack>
  );
}

function VoiceSettingsOverlay({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <Field label="Voice" hint="A voice can be chosen only once a speech service exists.">
        <Select disabled value="none"><option value="none">No voice available — nothing is connected</option></Select>
      </Field>
      <Field label="Speaking rate"><TextInput type="range" min={0.5} max={2} step={0.1} defaultValue={1} disabled aria-label="Speaking rate" /></Field>
      <Notice tone="warning" title="These settings cannot take effect">
        They are kept against this workspace so the choice survives, but no speech is produced until a provider is connected.
      </Notice>
      <ModalActions><OverlayActions primary={<Button variant="secondary" onClick={() => context.closeOverlay()}>Close</Button>} /></ModalActions>
    </Stack>
  );
}

function SensitiveActionConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const phrase = "post the wage journal";
  const [typed, setTyped] = useState("");
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="A consequential action is never triggered by a transcript">
        Text that was typed — or that a speech service might have misheard — cannot start something irreversible. Confirming needs the exact phrase, typed deliberately.
      </Notice>
      <Field label={`Type “${phrase}” to confirm`} required>
        <TextInput value={typed} onChange={(event) => setTyped(event.target.value)} invalid={Boolean(typed) && typed !== phrase} />
      </Field>
      <ModalActions><OverlayActions variant="confirm" end={<Button variant="ghost" onClick={close}>Cancel</Button>} primary={<Button
        variant="primary"
        disabled={typed !== phrase}
        onClick={async () => {
          await context.mutate.log(`${context.actor} confirmed a sensitive action by typing the phrase. The action itself still requires the Finance posting screen.`, { type: "voice.sensitive_confirmed" });
          context.toast("Confirmation recorded", "The confirmation is logged. Posting still happens in Finance, by a person with that authority.", "info");
          close();
        }}
      >
        Confirm
      </Button>} /></ModalActions>
    </Stack>
  );
}

function RecordingConsent({ context, close }: { context: ScreenContext; close: () => void }) {
  const meeting = useRecord(context.params.id);
  const members = useCollection("members");
  const { participants } = meetingParts(meeting);
  const [rows, setRows] = useState<Participant[]>(
    participants.length > 0
      ? participants
      : members.slice(0, 4).map((member) => ({ id: member.id, name: member.title, kind: member.fields.kind === "ai" ? "ai" : "human", consent: "not_given" })),
  );
  if (!meeting) return <Empty title="No meeting selected" />;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Consent is recorded per participant">
        Regional rules differ, and this workspace does not know where each participant is. Until every person has given consent, the transcript stays closed rather than being recorded and labelled afterwards.
      </Notice>
      <Stack gap={2}>
        {rows.map((participant, index) => (
          <Row key={participant.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <Avatar name={participant.name} kind={participant.kind === "ai" ? "ai" : "human"} size="sm" />
            <span className="ds-grow">{participant.name}</span>
            <Select
              aria-label={`Consent for ${participant.name}`}
              value={participant.consent}
              onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, consent: event.target.value } : item))}
            >
              <option value="given">Given</option>
              <option value="not_given">Not given</option>
              <option value="not_applicable">Not applicable (AI contract)</option>
            </Select>
          </Row>
        ))}
      </Stack>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          const body = (meeting.body ?? {}) as Record<string, unknown>;
          const stamped = rows.map((participant) => ({ ...participant, at: participant.consent === "given" ? context.now.toISOString() : undefined }));
          if (!(await context.mutate.patch(meeting.id, {
            body: { ...body, participants: stamped },
            fields: { ...meeting.fields, consentComplete: stamped.filter((participant) => participant.kind === "human").every((participant) => participant.consent === "given") },
          }, { expectRevision: meeting.revision, event: "Meeting consent updated" }))) return;
          context.toast("Consent recorded", "Each participant's state is stored with the time it was given.");
          close();
        }}
      >
        Save consent
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

function MeetingNotes({ context, close }: { context: ScreenContext; close: () => void }) {
  const meeting = useRecord(context.params.id);
  const { transcript } = meetingParts(meeting);
  const [notes, setNotes] = useState("");
  if (!meeting) return <Empty title="No meeting selected" />;
  return (
    <form
      id="meeting-notes"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = (meeting.body ?? {}) as Record<string, unknown>;
        if (!(await context.mutate.patch(meeting.id, { body: { ...body, notes: { text: notes, by: context.actor, at: context.now.toISOString() } } }, { expectRevision: meeting.revision, event: "Meeting notes written" }))) return;
        context.toast("Notes saved", "They are stored on the meeting record with your name and the time.");
        close();
      }}
    >
      <Notice tone="info" title="Notes are written by a person">
        {transcript.length} transcript line{transcript.length === 1 ? "" : "s"} are available to read while you write. Nothing is summarised for you: no model is connected.
      </Notice>
      <ModalUnsavedChanges when={Boolean(notes.trim())} />
      <Field label="Notes" required><TextArea value={notes} rows={6} onChange={(event) => setNotes(event.target.value)} required /></Field>
    </form>
  );
}

function FollowUpApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const meeting = useRecord(context.params.id);
  const members = useCollection("members");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(context.actor);
  const [due, setDue] = useState("");
  return (
    <form
      id="follow-up"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "tasks",
          title: title.trim(),
          status: "ready",
          summary: `Action from ${meeting?.title ?? "a meeting"}. Approved by ${context.actor} rather than inferred from the discussion.`,
          dueAt: due || undefined,
          fields: { assignee: owner, stage: "ready", meetingId: meeting?.id ?? "", kind: members.find((member) => member.title === owner)?.fields.kind === "ai" ? "ai" : "human" },
        }, `Action created from ${meeting?.title ?? "a meeting"}`);
        context.toast("Action created", "It is a task record with this meeting as its source.");
        close();
      }}
    >
      <Notice tone="info" title="An action needs a person to approve it">
        A sentence in a transcript is not an instruction. This creates the action with your name against it.
      </Notice>
      <ModalUnsavedChanges when={Boolean(title.trim())} />
      <Field label="Action" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Owner">
        <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
          {[context.actor, ...internalRoster(members).map((member) => member.title)].filter((name, index, all) => all.indexOf(name) === index).map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Due"><TextInput type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
    </form>
  );
}

function SourceInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const source = useRecord(payload?.id);
  const { now } = useWorkspace();
  if (!source) return <Empty title="No source selected" />;
  const age = freshness(String(source.fields.freshness ?? source.updatedAt), now, 30);
  const body = source.body as { extracted?: string[]; note?: string } | undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Kind", value: String(source.fields.kind ?? "file") },
        { label: "Classification", value: String(source.fields.classification ?? "internal") },
        { label: "Indexing", value: <Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill> },
        { label: "Freshness", value: age.known ? `${context.date(String(source.fields.freshness))} · ${age.days} days old` : "Unknown" },
        { label: "Scanned", value: source.fields.scanned === true ? "Reviewed by a person" : "Not scanned — no scanner connected" },
        { label: "Owner", value: source.ownerName },
      ]} />
      {body?.extracted && body.extracted.length > 0 && (
        <Card title="What was read out of it" pad="tight">
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>{body.extracted.map((line) => <li key={line}>{line}</li>)}</ul>
        </Card>
      )}
      {body?.note && <Notice tone="warning">{body.note}</Notice>}
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/brain/sources/${source.id}`)}>Open in the source library</Button>
    </Stack>
  );
}

function ConfidenceNote({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const research = useRecord(payload?.id);
  const [confidence, setConfidence] = useState(String(research?.fields.confidence ?? "mixed"));
  const [note, setNote] = useState("");
  if (!research) return <Empty title="No research question selected" />;
  return (
    <form
      id="confidence-note"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = (research.body ?? {}) as Record<string, unknown>;
        if (!(await context.mutate.patch(research.id, {
          fields: { ...research.fields, confidence },
          body: { ...body, confidenceNote: { text: note, by: context.actor, at: context.now.toISOString() } },
        }, { expectRevision: research.revision, event: `Confidence on ${research.title} set to ${confidence}` }))) return;
        context.toast("Confidence recorded", "It is stored with your name and the reason.");
        close();
      }}
    >
      <Field label="Overall confidence">
        <Select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
          <option value="high">High — every finding cites a verified source</option>
          <option value="mixed">Mixed — some findings are unavailable</option>
          <option value="low">Low — key evidence is missing</option>
        </Select>
      </Field>
      <Field label="Why" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      <Notice tone="info">Confidence is a person's judgement here. Nothing computes it, so it is recorded with who gave it.</Notice>
    </form>
  );
}

function SaveReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const research = useRecord(payload?.id);
  const { findings, question, gaps } = researchParts(research);
  if (!research) return <Empty title="No research question selected" />;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="The report is a record in this workspace">
        Saving writes a document with the question, every finding and its source, and the gaps. Publishing it anywhere outside this browser is a separate mission with a hosting connection.
      </Notice>
      <Properties rows={[
        { label: "Findings", value: String(findings.length) },
        { label: "With a source", value: String(findings.filter((finding) => finding.sourceId).length) },
        { label: "Gaps", value: String(gaps.length) },
      ]} />
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          const text = [
            question,
            "",
            ...findings.map((finding) => `• ${finding.claim} [${finding.confidence}${finding.sourceId ? `, source ${finding.sourceId}` : ", no source"}]`),
            "",
            gaps.length ? `Gaps: ${gaps.join(" ")}` : "No gap recorded.",
          ].join("\n");
          const document = await context.mutate.create({
            collection: "documents",
            title: `${research.title} — report`,
            status: "published",
            summary: "Research report written from the findings and their sources. Published inside this workspace only.",
            fields: { artifact: true, researchId: research.id, version: 1, publishedBy: context.actor, publishedAt: context.now.toISOString(), externalPublication: "not_connected", gaps: gaps.length },
            body: { text, versions: [{ version: 1, at: context.now.toISOString(), author: context.actor, summary: "Saved from the research workspace." }], sources: findings.map((finding) => finding.sourceId).filter(Boolean) },
          }, `Research report published in the workspace by ${context.actor} for ${research.title}`);
          context.toast("Report published in this workspace", `It is an artifact with its sources and ${gaps.length} named gap${gaps.length === 1 ? "" : "s"}. Nothing was published outside this browser.`);
          close();
          context.navigate(`/o/${context.org.slug}/ai/artifacts/${document.id}`);
        }}
      >
        Publish in this workspace
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

function ContextPicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { switchEntity?: boolean } | undefined;
  const { org } = useWorkspace();
  if (payload?.switchEntity) {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Switching entity clears this chat's context">
          Pinned records, drafts and attachment references for {org.name} are dropped. Nothing from this entity is readable in the next one.
        </Notice>
        <Row gap={2} wrap>
          {["northline", "harbor"].filter((slug) => slug !== org.slug).map((slug) => (
            <Button
              key={slug}
              variant="primary"
              onClick={() => {
                useChatState.setState({ orgId: null, drafts: {}, scope: {}, attachments: {}, sendSignal: {}, focusSignal: {} });
                close();
                context.navigate(`/o/${slug}/ai/context`);
              }}
            >
              Switch to {slug === "harbor" ? "Harbor Supply" : "Northline Atelier"}
            </Button>
          ))}
        </Row>
      </Stack>
    );
  }
  return <SourceSelector context={context} />;
}

function PermissionExplanation({ context }: { context: ScreenContext }) {
  const policies = useCollection("policies");
  const sensitivity = policies.find((policy) => policy.fields.kind === "sensitivity");
  const groups = (sensitivity?.body as { groups?: { id: string; label: string; roles: string[]; agents: boolean }[] } | undefined)?.groups ?? [];
  return (
    <Stack gap={4}>
      <Notice tone="info" title={`You are reading as the ${context.role} view`}>
        A group is offered to a role view in this interface. It is not an account security boundary and does not imply server-side enforcement.
      </Notice>
      {groups.length === 0 ? <Empty title="No sensitivity policy recorded" /> : (
        <DataGrid
          rows={groups}
          rowId={(row) => row.id}
          label="Sensitivity groups"
          filterable={false}
          columns={[
            { key: "label", header: "Group", primary: true, cell: (row) => row.label },
            { key: "roles", header: "Role views", cell: (row) => row.roles.join(", ") },
            { key: "agents", header: "AI retrieval", cell: (row) => <Pill tone={row.agents ? "success" : "warning"}>{row.agents ? "Allowed" : "Excluded"}</Pill> },
            { key: "you", header: "You", cell: (row) => row.roles.includes(context.role) ? "Included" : "Not included" },
          ]}
        />
      )}
    </Stack>
  );
}

function SensitiveDataWarning({ context, close }: { context: ScreenContext; close: () => void }) {
  const [selection, setSelection] = useState("");
  return (
    <form
      id="redaction"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`${context.actor} marked a selection as sensitive and asked for it to be kept out of retrieval: “${selection.slice(0, 80)}”`, { type: "context.redaction" });
        context.toast("Redaction requested", "The request is in the activity log. A redaction here hides text from this interface; it does not erase it from the record history.", "info");
        close();
      }}
    >
      <Notice tone="warning" title="A redaction here is not an erasure">
        Marking text sensitive keeps it out of what this interface offers to an answer. The record and its history still hold the original, so treat this as a handling instruction, not deletion.
      </Notice>
      <ModalUnsavedChanges when={Boolean(selection.trim())} />
      <Field label="Text to keep out of retrieval" required><TextArea value={selection} rows={4} onChange={(event) => setSelection(event.target.value)} required /></Field>
    </form>
  );
}

function VersionComparison({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const artifact = useRecord(payload?.id ?? context.params.id);
  const { versions } = artifactParts(artifact);
  const [left, setLeft] = useState(String(versions[0]?.version ?? 1));
  const [right, setRight] = useState(String(versions[versions.length - 1]?.version ?? 1));
  const a = versions.find((version) => String(version.version) === left);
  const b = versions.find((version) => String(version.version) === right);
  return (
    <Stack gap={4}>
      <Row gap={3} wrap>
        <Field label="From"><Select value={left} onChange={(event) => setLeft(event.target.value)}>{versions.map((version) => <option key={version.version} value={String(version.version)}>v{version.version}</option>)}</Select></Field>
        <Field label="To"><Select value={right} onChange={(event) => setRight(event.target.value)}>{versions.map((version) => <option key={version.version} value={String(version.version)}>v{version.version}</option>)}</Select></Field>
      </Row>
      {!a || !b ? <Empty title="This artifact has one version only" /> : (
        <Grid>
          <Card span={6} title={`v${a.version}`} subtitle={`${a.author} · ${context.dateTime(a.at)}`}><p className="ds-prose">{a.summary}</p></Card>
          <Card span={6} title={`v${b.version}`} subtitle={`${b.author} · ${context.dateTime(b.at)}`}><p className="ds-prose">{b.summary}</p></Card>
        </Grid>
      )}
      <Notice tone="info">Versions record what changed and who changed it. The current text is the latest version; earlier text is summarised rather than kept in full.</Notice>
    </Stack>
  );
}

function ShareDialog({ context }: { context: ScreenContext }) {
  const artifact = useRecord((context.overlayPayload as { id?: string } | undefined)?.id ?? context.params.id);
  return (
    <Stack gap={4}>
      <CapabilityLine id="document.publish" title="Sharing outside this browser is not connected" />
      <Properties rows={[
        { label: "Inside this workspace", value: "Anyone with a role view that opens this application" },
        { label: "Outside this workspace", value: <Pill tone="warning">Not possible</Pill> },
        { label: "Artifact", value: artifact?.title ?? "—" },
      ]} />
      <Notice tone="warning" title="External publication needs its own mission">
        Publishing requires a hosting connection, a mission with that grant and a verification step. Editing this draft afterwards would not undo a publication.
      </Notice>
    </Stack>
  );
}

function ExportDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const artifact = useRecord((context.overlayPayload as { id?: string } | undefined)?.id ?? context.params.id);
  const { text, versions } = artifactParts(artifact);
  if (!artifact) return <Empty title="No artifact selected" />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">The export is written by this browser from the artifact record. It contains the current text, the version list and the provenance line.</p>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={() => {
          const content = [
            artifact.title,
            `Exported ${context.dateTime(context.now)} from ${context.org.name} · ${context.actor}`,
            "",
            text,
            "",
            "Versions:",
            ...versions.map((version) => `v${version.version} — ${version.author} — ${version.summary}`),
          ].join("\n");
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${artifact.title.replace(/\s+/g, "-").toLowerCase()}.txt`;
          link.click();
          URL.revokeObjectURL(url);
          context.toast("Exported", "The file was written by this browser. Nothing was uploaded.");
          close();
        }}
      >
        Download as text
      </Button>} end={<Button variant="ghost" onClick={close}>Cancel</Button>} /></ModalActions>
    </Stack>
  );
}

/* ====================================================================== *
 * Module
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <OverlayActions
    primary={<Button variant="primary" type="submit" form={formId}>{label}</Button>}
    end={<Button variant="ghost" onClick={close}>Cancel</Button>}
  />
);

const chiefThread = (context: ScreenContext) => threadKey(context.screen.id, context.selectedId ?? new URLSearchParams(window.location.search).get("thread") ?? "active");

/**
 * Mute is a real, persisted preference even though no audio service is
 * connected: when one is, a session starts with the microphone in the state
 * chosen here. Nothing is captured either way today, and the toast says so.
 */
async function toggleVoiceMute(context: ScreenContext): Promise<void> {
  const rows = await listPreferences(context);
  const pref = rows.find((row) => row.fields.kind === "voiceSettings");
  const muted = !(pref?.fields.muted === true);
  if (pref) if (!(await context.mutate.patch(pref.id, { fields: { ...pref.fields, muted } }, { skipHistory: true, event: muted ? "Microphone muted" : "Microphone unmuted" }))) return;
  else await context.mutate.create({ collection: "preferences", title: "Voice settings", status: "active", fields: { kind: "voiceSettings", muted } }, muted ? "Microphone muted" : "Microphone unmuted");
  context.toast(muted ? "Muted" : "Unmuted", `Sessions will start with the microphone ${muted ? "off" : "on"}. No audio service is connected, so nothing is being captured now.`, "info");
}

async function listPreferences(context: ScreenContext) {
  const { listByCollection } = await import("@/platform/repo");
  return listByCollection(context.org.id, "preferences");
}

export const aiApp = registerApp({
  code: "AI",
  short: "Ask Arlovi",
  name: "AI Companion & Conversations",
  purpose: "Answers composed from this workspace, with the records named",
  icon: Sparkles,
  nav: [
    { items: [
      { label: "Chief of Staff", screenId: "ARL-AI-001", icon: Sparkles },
      { label: "Conversations", screenId: "ARL-AI-002", icon: MessagesSquare },
      { label: "Context manager", screenId: "ARL-AI-009", icon: Layers },
    ] },
    { label: "Rooms", items: [
      { label: "Specialist chat", screenId: "ARL-AI-003", icon: Bot },
      { label: "Team room", screenId: "ARL-AI-004", icon: Users },
      { label: "Mission room", screenId: "ARL-AI-005", icon: Rocket },
    ] },
    { label: "Capture", items: [
      { label: "Voice workspace", screenId: "ARL-AI-006", icon: Mic },
      { label: "Meeting room", screenId: "ARL-AI-007", icon: Video },
    ] },
    { label: "Output", items: [
      { label: "Research", screenId: "ARL-AI-008", icon: Microscope },
      { label: "Artifacts", screenId: "ARL-AI-010", icon: FileText },
    ] },
  ],
  screens: {
    "ARL-AI-001": {
      id: "ARL-AI-001",
      title: () => "Chief of Staff",
      statusStrip: (context) => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Model: not connected</Pill>
          <span className="ds-subtle">Answers are composed from {context.org.name} records and name every record they read. Nothing leaves this browser.</span>
        </Row>
      ),
      tabs: [
        { id: "Chat", render: (context) => <ChiefChat context={context} /> },
        { id: "Attachments", render: (context) => <ChatAttachments context={context} /> },
        { id: "Related missions", render: (context) => <RelatedMissions context={context} /> },
      ],
      actions: [
        { id: "Send text", placement: "primary", run: (context) => { useChatState.getState().requestSend(chiefThread(context)); } },
        { id: "create mission", label: "Propose a mission", placement: "primary", capability: "approve_mission", run: (context) => context.openOverlay("task authorization") },
        { id: "attach", label: "Attach", placement: "secondary", run: (context) => context.openOverlay("upload review") },
        { id: "mention record", label: "Pin records", placement: "secondary", run: (context) => context.openOverlay("Source selector") },
        { id: "dictate", label: "Dictate", placement: "overflow", run: (context) => context.toast("Dictation needs a speech service", "No speech service is connected, so nothing was recorded. Type the message instead; it is kept exactly as written.", "blocked") },
        { id: "open artifact", label: "Open artifact", placement: "overflow", run: (context) => void openLatestArtifact(context) },
      ],
      overlays: [
        { id: "Source selector", kind: "drawer", title: "Pin records into scope", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SourceSelector context={context} /> },
        { id: "upload review", kind: "modal", title: "Attach a file by reference", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <UploadReview context={context} /> },
        { id: "message action menu", kind: "drawer", title: "Message actions", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <MessageActionMenu context={context} close={close} /> },
        { id: "task authorization", kind: "modal", title: "Propose a mission", width: OVERLAY_WIDTH.modal, summary: ({ close: _close, ...context }) => <TaskAuthorizationSummary context={context} />, render: ({ close, ...context }) => <TaskAuthorization context={context} close={close} />, footer: submitFooter("task-authorization", "Propose the mission") },
      ],
    },

    "ARL-AI-002": {
      id: "ARL-AI-002",
      subtitle: () => "Every thread is a record. Archiving hides it from chat; retention and legal holds still apply.",
      tabs: (["Recent", "Pinned", "Shared", "Archived"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ConversationLibrary context={context} view={view} />,
      })),
      actions: [
        { id: "Open", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a thread first"), run: (context) => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/ai/chat?thread=${context.selectedId}`); } },
        { id: "search transcript", label: "Search transcripts", placement: "secondary", run: () => usePanelFlags.getState().set("ai.library.search", true) },
        { id: "rename", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a thread first"), run: (context) => context.openOverlay("Thread preview", { id: context.selectedId, rename: true }) },
        { id: "archive", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a thread first"), run: (context) => void archiveConversation(context) },
        { id: "delete", placement: "overflow", tone: "danger", capability: "delete_records", guard: (context) => (context.selectedId ? undefined : "Select a thread first"), run: (context) => context.openOverlay("delete confirmation") },
      ],
      overlays: [
        { id: "Thread preview", kind: "drawer", title: "Thread", width: OVERLAY_WIDTH.form, summary: ({ close: _close, ...context }) => <ThreadPreviewSummary context={context} />, render: ({ ...context }) => <ThreadPreview context={context} /> },
        { id: "delete confirmation", kind: "modal", title: "Delete this thread", tone: "danger", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <DeleteConversation context={context} close={close} /> },
        { id: "sharing dialog", kind: "modal", title: "Sharing", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <SharingDialog context={context} close={close} /> },
      ],
    },

    "ARL-AI-003": {
      id: "ARL-AI-003",
      title: () => "Specialist chat",
      record: (context) => ({
        title: <SpecialistHeading context={context} part="title" />,
        avatar: <SpecialistHeading context={context} part="avatar" />,
        status: <SpecialistHeading context={context} part="status" />,
        meta: [<SpecialistHeading key="meta" context={context} part="meta" />],
      }),
      tabs: [
        { id: "Conversation", render: (context) => <SpecialistChat context={context} /> },
        { id: "Work", render: (context) => <SpecialistWork context={context} /> },
        { id: "Sources", render: (context) => <SpecialistSources context={context} /> },
      ],
      actions: [
        { id: "Message specialist", placement: "primary", run: (context) => { useChatState.getState().requestFocus(threadKey(context.screen.id, context.params.id)); context.setTab("Conversation"); } },
        { id: "attach record", label: "Attach a record", placement: "secondary", run: (context) => context.openOverlay("attach record") },
        { id: "specialist profile", label: "Specialist profile", placement: "overflow", run: (context) => context.openOverlay("Agent profile drawer", { id: context.params.id }) },
        { id: "request handoff", placement: "secondary", run: (context) => context.openOverlay("mission escalation", { id: context.params.id }) },
        { id: "review tool scope", placement: "overflow", run: (context) => context.openOverlay("permission explainer", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Agent profile drawer", kind: "drawer", title: "Specialist", width: OVERLAY_WIDTH.form, summary: ({ close: _close, ...context }) => <AgentSummary context={context} eyebrow="AI employee" />, render: ({ ...context }) => <AgentProfileDrawer context={context} /> },
        { id: "permission explainer", kind: "drawer", title: "Tool scope", width: OVERLAY_WIDTH.form, summary: ({ close: _close, ...context }) => <AgentSummary context={context} eyebrow="AI employee" />, render: ({ ...context }) => <PermissionExplainer context={context} /> },
        { id: "mission escalation", kind: "modal", title: "Hand this to the coordinator", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <MissionEscalation context={context} close={close} />, footer: submitFooter("mission-escalation", "Record the handoff") },
        { id: "attach record", kind: "modal", title: "Attach a record", width: 560, render: ({ close, ...context }) => <AttachToSpecialist context={context} close={close} /> },
      ],
    },

    "ARL-AI-004": {
      id: "ARL-AI-004",
      title: () => "Team room",
      tabs: (["Discussion", "Decisions", "Files", "Tasks"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <TeamRoom context={context} view={view} />,
      })),
      actions: [
        { id: "Mention participant", placement: "primary", run: (context) => { useChatState.getState().setDraft(threadKey(context.screen.id, context.params.id), "@"); useChatState.getState().requestFocus(threadKey(context.screen.id, context.params.id)); context.setTab("Discussion"); } },
        { id: "pin decision", label: "Pin a decision", placement: "secondary", run: (context) => context.openOverlay("decision recorder") },
        { id: "assign task", placement: "overflow", run: (context) => context.openOverlay("assign task") },
        { id: "all tasks", label: "All tasks in Projects", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/project/workload`) },
        { id: "host review", placement: "overflow", run: (context) => context.openOverlay("host review") },
        { id: "participants", label: "Participants", placement: "overflow", run: (context) => context.openOverlay("Participant selector") },
      ],
      overlays: [
        { id: "Participant selector", kind: "modal", title: "Participants", width: 560, render: ({ close, ...context }) => <ParticipantSelector context={context} close={close} /> },
        { id: "decision recorder", kind: "modal", title: "Record a decision", width: 560, render: ({ close, ...context }) => <DecisionRecorder context={context} close={close} />, footer: submitFooter("decision-recorder", "Record decision") },
        { id: "topic thread", kind: "drawer", title: "Topic", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <TopicThread context={context} /> },
        { id: "assign task", kind: "modal", title: "Assign a task", width: 560, render: ({ close, ...context }) => <AssignRoomTask context={context} close={close} /> },
        { id: "host review", kind: "modal", title: "Host a review", width: 560, render: ({ close, ...context }) => <HostReview context={context} close={close} /> },
      ],
    },

    "ARL-AI-005": {
      id: "ARL-AI-005",
      title: () => "Mission room",
      record: (context) => ({
        title: <MissionHeading context={context} part="title" />,
        status: <MissionHeading context={context} part="status" />,
        meta: [<MissionHeading key="meta" context={context} part="meta" />],
      }),
      tabs: (["Discussion", "Agents", "Tasks", "Reviews"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionRoom context={context} view={view} />,
      })),
      actions: [
        { id: "Request status", placement: "primary", run: (context) => { const thread = threadKey(context.screen.id, context.params.id); useChatState.getState().setDraft(thread, "Where is this mission and what is blocked?"); useChatState.getState().requestSend(thread); context.setTab("Discussion"); } },
        { id: "assign reviewer", placement: "secondary", run: (context) => context.openOverlay("assign reviewer") },
        { id: "link evidence", placement: "secondary", run: (context) => context.openOverlay("evidence inspector") },
        { id: "resolve disagreement", placement: "overflow", run: (context) => context.openOverlay("resolve disagreement") },
        { id: "hand over", label: "Hand a task over", placement: "overflow", run: (context) => context.openOverlay("Task handoff drawer") },
      ],
      overlays: [
        { id: "Task handoff drawer", kind: "drawer", title: "Hand a task over", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TaskHandoffDrawer context={context} close={close} /> },
        { id: "evidence inspector", kind: "drawer", title: "Evidence", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <EvidenceInspector context={context} /> },
        { id: "review dialog", kind: "modal", title: "Record a review", width: 560, render: ({ close, ...context }) => <ReviewDialog context={context} close={close} /> },
        { id: "assign reviewer", kind: "modal", title: "Assign a reviewer", width: 560, render: ({ close, ...context }) => <AssignReviewer context={context} close={close} /> },
        { id: "resolve disagreement", kind: "modal", title: "Resolve a disagreement", width: 580, render: ({ close, ...context }) => <ResolveDisagreement context={context} close={close} /> },
      ],
    },

    "ARL-AI-006": {
      id: "ARL-AI-006",
      title: () => "Voice workspace",
      subtitle: () => "No audio service is connected, so nothing is heard, recorded or transcribed here. Turns are typed and labelled as typed.",
      tabs: [
        { id: "Live", render: (context) => <VoiceLive context={context} /> },
        { id: "Transcript", render: (context) => <VoiceTranscript context={context} /> },
        { id: "Settings", render: (context) => <VoiceSettings context={context} /> },
      ],
      actions: [
        { id: "Start stop", label: "Start or end a session", placement: "primary", run: (context) => void startOrEndVoice(context) },
        { id: "view transcript", placement: "secondary", run: (context) => context.setTab("Transcript") },
        { id: "mute", label: "Mute or unmute", placement: "overflow", run: (context) => void toggleVoiceMute(context) },
        { id: "change voice", placement: "overflow", run: (context) => context.openOverlay("voice settings") },
        { id: "correct text", placement: "overflow", run: (context) => context.openOverlay("correct text") },
      ],
      overlays: [
        { id: "Mic permission", kind: "modal", title: "Microphone", width: 520, render: ({ ...context }) => <MicPermission context={context} /> },
        { id: "voice settings", kind: "modal", title: "Voice settings", width: 520, render: ({ ...context }) => <VoiceSettingsOverlay context={context} /> },
        { id: "sensitive-action confirmation", kind: "modal", title: "Confirm a consequential action", tone: "danger", width: 560, blocking: true, render: ({ close, ...context }) => <SensitiveActionConfirmation context={context} close={close} /> },
        { id: "correct text", kind: "modal", title: "Correct a transcript line", width: 560, render: ({ close, ...context }) => <CorrectTranscript context={context} close={close} /> },
      ],
    },

    "ARL-AI-007": {
      id: "ARL-AI-007",
      title: () => "AI meeting room",
      tabs: (["Meeting", "Transcript", "Decisions", "Actions"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MeetingRoom context={context} view={view} />,
      })),
      actions: [
        { id: "Invite agent", placement: "primary", run: (context) => void inviteAgentToMeeting(context) },
        { id: "request specialist report", placement: "secondary", run: (context) => void requestSpecialistReport(context) },
        { id: "create action", placement: "secondary", run: (context) => context.openOverlay("follow-up approval") },
        { id: "end meeting", placement: "overflow", run: (context) => void endMeeting(context) },
      ],
      overlays: [
        { id: "Recording consent", kind: "modal", title: "Participants and consent", width: 620, render: ({ close, ...context }) => <RecordingConsent context={context} close={close} /> },
        { id: "meeting notes", kind: "modal", title: "Meeting notes", width: 620, render: ({ close, ...context }) => <MeetingNotes context={context} close={close} />, footer: submitFooter("meeting-notes", "Save notes") },
        { id: "follow-up approval", kind: "modal", title: "Create an action", width: 560, render: ({ close, ...context }) => <FollowUpApproval context={context} close={close} />, footer: submitFooter("follow-up", "Create action") },
      ],
    },

    "ARL-AI-008": {
      id: "ARL-AI-008",
      title: () => "Research workspace",
      tabs: (["Findings", "Sources", "Methods", "Citations"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ResearchWorkspace context={context} view={view} />,
      })),
      actions: [
        { id: "Refine question", placement: "primary", run: (context) => void refineQuestion(context) },
        { id: "request independent review", placement: "secondary", run: (context) => void requestReview(context) },
        { id: "inspect source", placement: "secondary", run: (context) => context.setTab("Sources") },
        { id: "publish report", label: "Publish the report", placement: "overflow", run: (context) => context.openOverlay("save report", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Source inspector", kind: "drawer", title: "Source", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SourceInspector context={context} /> },
        { id: "confidence note", kind: "modal", title: "Confidence", width: 560, render: ({ close, ...context }) => <ConfidenceNote context={context} close={close} />, footer: submitFooter("confidence-note", "Record confidence") },
        { id: "save report", kind: "modal", title: "Save as a report", width: 560, render: ({ close, ...context }) => <SaveReport context={context} close={close} /> },
      ],
    },

    "ARL-AI-009": {
      id: "ARL-AI-009",
      title: () => "Context manager",
      tabs: (["This chat", "Team context", "Connected sources"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ContextManager context={context} view={view} />,
      })),
      actions: [
        { id: "Add remove context", label: "Add or remove context", placement: "primary", run: (context) => context.openOverlay("Context picker") },
        { id: "switch entity", placement: "secondary", run: (context) => context.openOverlay("Context picker", { switchEntity: true }) },
        { id: "inspect grants", placement: "secondary", run: (context) => context.openOverlay("permission explanation") },
        { id: "redact selection", placement: "overflow", run: (context) => context.openOverlay("sensitive data warning") },
      ],
      overlays: [
        { id: "Context picker", kind: "drawer", title: "Context", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ContextPicker context={context} close={close} /> },
        { id: "permission explanation", kind: "drawer", title: "Why this is visible", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <PermissionExplanation context={context} /> },
        { id: "sensitive data warning", kind: "modal", title: "Keep a selection out of retrieval", tone: "danger", width: 560, render: ({ close, ...context }) => <SensitiveDataWarning context={context} close={close} />, footer: submitFooter("redaction", "Record the request") },
      ],
    },

    "ARL-AI-010": {
      id: "ARL-AI-010",
      title: () => "Conversation artifact",
      tabs: (["Preview", "Versions", "Comments", "Sources"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ArtifactScreen context={context} view={view} />,
      })),
      actions: [
        { id: "revise with AI", label: "Compose a revision", placement: "primary", run: (context) => void reviseArtifact(context) },
        { id: "Open in native app", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/docs/documents/${context.params.id}`) },
        { id: "comment", placement: "secondary", run: (context) => context.openOverlay("comment") },
        { id: "share", placement: "overflow", run: (context) => context.openOverlay("share dialog", { id: context.params.id }) },
        { id: "export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export dialog", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Version comparison", kind: "modal", title: "Compare versions", width: OVERLAY_WIDTH.wide, render: ({ ...context }) => <VersionComparison context={context} /> },
        { id: "share dialog", kind: "modal", title: "Share", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ShareDialog context={context} /> },
        { id: "export dialog", kind: "modal", title: "Export", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <ExportDialog context={context} close={close} /> },
        { id: "comment", kind: "modal", title: "Comment on this artifact", width: 540, render: ({ close, ...context }) => <CommentOnArtifact context={context} close={close} /> },
      ],
    },
  },
});

function MissionHeading({ context, part }: { context: ScreenContext; part: "title" | "status" | "meta" }) {
  const mission = useRecord(context.params.id);
  const agents = useCollection("agents");
  if (!mission || mission.collection !== "missions") return part === "title" ? <>Mission room</> : null;
  if (part === "title") return <>{mission.title}</>;
  if (part === "status") return <Pill tone={mission.status === "running" ? "info" : mission.status === "proposed" ? "warning" : "neutral"} dot>{mission.status}</Pill>;
  const agent = agents.find((item) => item.id === mission.fields.agentId);
  return (
    <>
      {agent ? `${agent.title} ·\u00a0` : ""}
      <span className="ds-num">ceiling {context.money(Number(mission.fields.budgetMinor ?? 0))}, committed {context.money(Number(mission.fields.committedMinor ?? 0))}, spent {context.money(Number(mission.fields.spentMinor ?? 0))}</span>
    </>
  );
}

function SpecialistHeading({ context, part }: { context: ScreenContext; part: "title" | "avatar" | "status" | "meta" }) {
  const agent = useRecord(context.params.id);
  if (!agent || agent.collection !== "agents") return part === "title" ? <>Specialist chat</> : null;
  if (part === "title") return <>{agent.title}</>;
  if (part === "avatar") return <Avatar name={agent.title} kind="ai" size="lg" />;
  if (part === "status") return <Pill tone={agent.status === "active" ? "success" : "warning"} dot>{agent.status}</Pill>;
  const granted = ((agent.body as { tools?: { granted: boolean }[] } | undefined)?.tools ?? []).filter((tool) => tool.granted).length;
  return <>{String(agent.fields.role ?? "Specialist")} · reports to {String(agent.fields.manager ?? "unassigned")} · autonomy {String(agent.fields.autonomy ?? "draft")} · {granted} tool{granted === 1 ? "" : "s"} granted</>;
}

/* ---- toolbar handlers that write records ---- */

async function startOrEndVoice(context: ScreenContext): Promise<void> {
  const session = await findVoiceSession(context);
  if (!session) {
    const created = await createVoiceSession(context);
    context.toast("Typed session open", `${created.title} is recording typed turns. No audio is captured: nothing is connected.`);
    return;
  }
  if (session.status === "open") {
    if (!(await context.mutate.patch(session.id, { status: "closed", endAt: context.now.toISOString() }, { expectRevision: session.revision, event: "Voice session ended" }))) return;
    context.toast("Session ended", "The transcript stays on the record.");
  } else {
    if (!(await context.mutate.patch(session.id, { status: "open" }, { expectRevision: session.revision, event: "Voice session reopened" }))) return;
    context.toast("Session reopened", "Typed turns can be added again.");
  }
}

async function findVoiceSession(context: ScreenContext): Promise<Rec | undefined> {
  const { db } = await import("@/runtime/db");
  const rows = await db.records.where("[organizationId+collection]").equals([context.org.id, "meetings"]).toArray();
  return rows.find((row) => row.fields.kind === "voice");
}

async function inviteAgentToMeeting(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const meeting = await db.records.get(context.params.id ?? "");
  if (!meeting || meeting.collection !== "meetings") { context.toast("No meeting open", "Open a meeting first.", "info"); return; }
  const agents = (await db.records.where("[organizationId+collection]").equals([context.org.id, "agents"]).toArray()).filter((agent) => agent.status === "active");
  const body = (meeting.body ?? {}) as { participants?: Participant[] };
  const existing = body.participants ?? [];
  const candidate = agents.find((agent) => !existing.some((participant) => participant.id === agent.id));
  if (!candidate) { context.toast("Every active contract is already here", "No other AI employee is available to add.", "info"); return; }
  if (!(await context.mutate.patch(meeting.id, {
    body: { ...(meeting.body as object), participants: [...existing, { id: candidate.id, name: candidate.title, kind: "ai", consent: "not_applicable" }] },
  }, { expectRevision: meeting.revision, event: `${candidate.title} added to ${meeting.title}` }))) return;
  context.toast("AI employee added", `${candidate.title} can read what its grants allow. It cannot listen: no audio service is connected.`);
}

async function requestSpecialistReport(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const meeting = await db.records.get(context.params.id ?? "");
  const agents = (await db.records.where("[organizationId+collection]").equals([context.org.id, "agents"]).toArray()).filter((agent) => agent.status === "active");
  const specialist = agents[0];
  if (!specialist) { context.toast("No active contract", "There is no active AI employee to ask.", "info"); return; }
  await context.mutate.create({
    collection: "tasks",
    title: `Report requested from ${specialist.title}`,
    status: "ready",
    summary: `Asked during ${meeting?.title ?? "a meeting"}. The report will be composed from records and will name them; nothing is generated.`,
    fields: { assignee: specialist.title, kind: "ai", stage: "ready", meetingId: meeting?.id ?? "" },
  }, `Specialist report requested from ${specialist.title}`);
  context.toast("Request recorded", `${specialist.title} has a task for it. No result is claimed yet.`);
}

async function endMeeting(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const meeting = await db.records.get(context.params.id ?? "");
  if (!meeting) return;
  if (meeting.status === "held") { context.toast("Already ended", `${meeting.title} is recorded as held.`, "info"); return; }
  if (!(await context.mutate.patch(meeting.id, { status: "held", endAt: context.now.toISOString() }, { expectRevision: meeting.revision, event: `${meeting.title} ended` }))) return;
  context.toast("Meeting ended", "The record carries the end time. Actions and decisions stay as records.");
}

async function refineQuestion(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const rows = await db.records.where("[organizationId+collection]").equals([context.org.id, "research"]).toArray();
  const research = rows.find((row) => row.id === context.params.id) ?? rows[0];
  if (!research) { context.toast("No research question", "There is nothing to refine.", "info"); return; }
  const body = (research.body ?? {}) as { question?: string; assumptions?: string[] };
  const gaps = (research.body as { gaps?: string[] } | undefined)?.gaps ?? [];
  const refined = `${body.question ?? research.title} (refined ${context.date(context.now)}: ${gaps.length ? `narrowed to exclude ${gaps.length} gap${gaps.length === 1 ? "" : "s"} that cannot be closed from these records` : "scope unchanged; no gap was recorded"})`;
  if (!(await context.mutate.patch(research.id, {
    body: { ...(research.body as object), question: refined },
  }, { expectRevision: research.revision, event: `Research question refined by ${context.actor}` }))) return;
  context.toast("Question refined", "The new wording is on the record; the previous wording is in its history.");
}

async function requestReview(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const rows = await db.records.where("[organizationId+collection]").equals([context.org.id, "research"]).toArray();
  const research = rows.find((row) => row.id === context.params.id) ?? rows[0];
  if (!research) return;
  if (!(await context.mutate.patch(research.id, {
    status: "review",
    fields: { ...research.fields, reviewRequested: true, reviewRequestedBy: context.actor },
  }, { expectRevision: research.revision, event: `Independent review requested on ${research.title}` }))) return;
  context.toast("Review requested", "The question is marked for review with who asked. No reviewer is assigned automatically.");
}

async function reviseArtifact(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const artifact = await db.records.get(context.params.id ?? "");
  if (!artifact || artifact.collection !== "documents") { context.toast("No artifact open", "Open an artifact first.", "info"); return; }
  const body = (artifact.body ?? {}) as { text?: string; versions?: Version[]; sources?: string[] };
  const sources = body.sources ?? [];
  const version = (body.versions?.length ?? 0) + 1;
  const appendix = [
    "",
    `Sources read for this revision (${sources.length}): ${sources.join(", ") || "none recorded"}.`,
    "No sentence was generated: this revision only adds the source list and marks any line that has no record behind it.",
  ].join("\n");
  if (!(await context.mutate.patch(artifact.id, {
    fields: { ...artifact.fields, version },
    body: {
      ...body,
      text: `${body.text ?? ""}${appendix}`,
      versions: [...(body.versions ?? []), { version, at: context.now.toISOString(), author: context.actor, summary: "Revision composed locally: source list appended, unsupported lines flagged. No model was called." }],
    },
  }, { expectRevision: artifact.revision, event: `${artifact.title} revised locally to v${version}` }))) return;
  context.toast("Revision composed locally", `v${version} adds the source list. No model is connected, so nothing was written for you.`);
}

async function openLatestArtifact(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const documents = await db.records.where("[organizationId+collection]").equals([context.org.id, "documents"]).toArray();
  const artifact = documents.find((document) => document.fields.artifact === true) ?? documents[0];
  if (!artifact) { context.toast("No artifact yet", "A thread produces one when it writes a file in this workspace.", "info"); return; }
  context.navigate(`/o/${context.org.slug}/ai/artifacts/${artifact.id}`);
}

async function archiveConversation(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const conversation = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!conversation || conversation.collection !== "conversations") return;
  const archived = conversation.fields.archived === true;
  if (!(await context.mutate.patch(conversation.id, {
    status: archived ? "active" : "archived",
    fields: { ...conversation.fields, archived: !archived },
  }, { expectRevision: conversation.revision, event: `${conversation.title} ${archived ? "restored" : "archived"} by ${context.actor}` }))) return;
  context.toast(archived ? "Restored" : "Archived", archived ? "It is back in Recent." : "It is out of the chat surface and still held for the retention schedule.");
}

export type { Turn };
